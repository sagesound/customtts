let apiUrl = "";
let apiKey = "";
let speechSpeed = 1.0;
let voice = "af_bella+af_sky";
let model = "kokoro";
let streamingMode = false;
let currentAudio = null;
let isMobile = false;

let audioContext = null;
let pcmStreamStopped = false;
let pcmPlaybackTime = 0;

browser.runtime.getPlatformInfo().then((info) => {
  isMobile = info.os === "android";
  initializeExtension();
});

function initializeExtension() {
  if (isMobile) {
    browser.browserAction.setPopup({ popup: "" });
    browser.browserAction.onClicked.addListener(handleMobileClick);
  } else {
    createContextMenu();
    browser.runtime.onInstalled.addListener(createContextMenu);
  }
}

function handleMobileClick(tab) {
  browser.tabs
    .executeScript({
      code: "window.getSelection().toString();",
    })
    .then((results) => {
      const selectedText = results[0];
      if (selectedText) processText(selectedText);
    });
}

browser.storage.local
  .get(["apiUrl", "apiKey", "speechSpeed", "voice", "model", "streamingMode"])
  .then((data) => {
    apiUrl = data.apiUrl || "http://host.docker.internal:8880/v1";
    apiKey = data.apiKey || "not-needed";
    speechSpeed = data.speechSpeed || 1.0;
    voice = data.voice || "af_bella+af_sky";
    model = data.model || "kokoro";
    streamingMode = data.streamingMode || false;
  });

browser.storage.onChanged.addListener((changes) => {
  if (changes.apiUrl) apiUrl = changes.apiUrl.newValue;
  if (changes.apiKey) apiKey = changes.apiKey.newValue;
  if (changes.speechSpeed) speechSpeed = changes.speechSpeed.newValue;
  if (changes.voice) voice = changes.voice.newValue;
  if (changes.model) model = changes.model.newValue;
  if (changes.streamingMode) streamingMode = changes.streamingMode.newValue;
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "stopPlayback") {
    pcmStreamStopped = true;
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }
});

function createContextMenu() {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create(
      {
        id: "readText",
        title: "Read Selected Text",
        contexts: ["selection"],
      },
      () => {},
    );
  });
}

browser.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

browser.contextMenus.onShown.addListener((info) => {
  createContextMenu();
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "readText" && info.selectionText) {
    processText(info.selectionText);
  }
});

function processText(text) {
  if (!apiUrl) return;

  const payload = {
    model: model,
    input: text,
    voice: voice,
    response_format: streamingMode ? "pcm" : "mp3",
    speed: speechSpeed,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const endpoint = apiUrl.endsWith("/")
    ? apiUrl + "audio/speech"
    : apiUrl + "/audio/speech";

  const controller = new AbortController();

  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  pcmStreamStopped = false;

  if (streamingMode) {
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`API request failed with status: ${response.status}`);
        return processPCMStream(response);
      })
      .catch(() => {});
  } else {
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`API request failed with status: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        currentAudio = new Audio(url);
        currentAudio.play();
      })
      .catch(() => {});
  }
}

async function processPCMStream(response) {
  const sampleRate = 24000;
  const numChannels = 1;

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: sampleRate,
  });
  pcmStreamStopped = false;
  pcmPlaybackTime = audioContext.currentTime;

  const reader = response.body.getReader();
  let leftover = new Uint8Array(0);

  async function readAndPlay() {
    while (!pcmStreamStopped) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      if (!audioContext) break;

      let pcmData = new Uint8Array(leftover.length + value.length);
      pcmData.set(leftover, 0);
      pcmData.set(value, leftover.length);

      const bytesPerSample = 2;
      const totalSamples = Math.floor(
        pcmData.length / bytesPerSample / numChannels,
      );
      const usableBytes = totalSamples * bytesPerSample * numChannels;

      const usablePCM = pcmData.slice(0, usableBytes);
      leftover = pcmData.slice(usableBytes);

      const audioBuffer = audioContext.createBuffer(
        numChannels,
        totalSamples,
        sampleRate,
      );

      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < totalSamples; i++) {
          const index = (i * numChannels + channel) * bytesPerSample;
          const sample = (usablePCM[index + 1] << 8) | usablePCM[index];
          channelData[i] =
            (sample & 0x8000 ? sample | ~0xffff : sample) / 32768;
        }
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const now = audioContext.currentTime;
      if (pcmPlaybackTime < now) {
        pcmPlaybackTime = now;
      }
      source.start(pcmPlaybackTime);
      pcmPlaybackTime += audioBuffer.duration;

      source.onended = () => {
        source.disconnect();
      };
    }
    leftover = new Uint8Array(0);
  }

  readAndPlay().catch(() => {});
}
