let apiUrl = "";
let apiKey = "";
let speechSpeed = 1.0;
let voice = "af_bella+af_sky";
let model = "kokoro";
let streamingMode = false;
let currentAudio = null;
let isMobile = false;

// Platform detection
browser.runtime.getPlatformInfo().then((info) => {
  isMobile = info.os === "android";
  initializeExtension();
});

function initializeExtension() {
  if (isMobile) {
    // Mobile setup
    browser.browserAction.setPopup({ popup: "" });
    browser.browserAction.onClicked.addListener(handleMobileClick);
  } else {
    // Desktop setup
    createContextMenu();
    browser.runtime.onInstalled.addListener(createContextMenu);
  }
}

function handleMobileClick(tab) {
  browser.tabs.executeScript({
    code: "window.getSelection().toString();"
  }).then((results) => {
    const selectedText = results[0];
    if (selectedText) processText(selectedText);
  });
}

// Load settings from local storage
browser.storage.local.get(["apiUrl", "apiKey", "speechSpeed", "voice", "model", "streamingMode"]).then((data) => {
  apiUrl = data.apiUrl || "http://host.docker.internal:8880/v1";
  apiKey = data.apiKey || "not-needed";
  speechSpeed = data.speechSpeed || 1.0;
  voice = data.voice || "af_bella+af_sky";
  model = data.model || "kokoro";
  streamingMode = data.streamingMode || false; // Load streaming mode setting
});

// Update settings dynamically when changed
browser.storage.onChanged.addListener((changes) => {
  if (changes.apiUrl) {
    apiUrl = changes.apiUrl.newValue;
  }
  if (changes.apiKey) {
    apiKey = changes.apiKey.newValue;
  }
  if (changes.speechSpeed) {
    speechSpeed = changes.speechSpeed.newValue;
  }
  if (changes.voice) {
    voice = changes.voice.newValue;
  }
  if (changes.model) {
    model = changes.model.newValue;
  }
  if (changes.streamingMode) {
    streamingMode = changes.streamingMode.newValue; // Update streaming mode
  }
});

// Stop Playback Handler
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "stopPlayback" && currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    console.log("Playback stopped.");
  }
});

// Function to create or recreate the context menu
function createContextMenu() {
  // Remove any existing context menu item to avoid duplicates
  browser.contextMenus.removeAll(() => {
    // Create the "Read Selected Text" context menu item
    browser.contextMenus.create({
      id: "readText",
      title: "Read Selected Text",
      contexts: ["selection"]
    }, () => {
      if (browser.runtime.lastError) {
        console.error("Error creating context menu:", browser.runtime.lastError);
      } else {
        console.log("Context menu created successfully.");
      }
    });
  });
}

// Create the context menu when the extension is installed or updated
browser.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated. Creating context menu...");
  createContextMenu();
});

// Recreate the context menu each time it is opened
browser.contextMenus.onShown.addListener((info) => {
  console.log("Context menu opened. Recreating context menu...");
  createContextMenu();
});

// Listener for context menu item click
browser.contextMenus.onClicked.addListener((info) => {
  console.log("Context menu clicked: ", info);  // Debugging log
  if (info.menuItemId === "readText" && info.selectionText) {
    console.log("Text to read: ", info.selectionText); // Debugging log
    processText(info.selectionText);
  } else {
    console.log("No text selected or menu item ID mismatch.");
  }
});

// Process selected text
function processText(text) {
  if (!apiUrl) {
    console.error("API URL not set.");
    return;
  }

  const payload = {
    model: model,
    input: text,
    voice: voice,
    response_format: streamingMode ? "pcm" : "mp3", // Use PCM for streaming, MP3 for file mode
    speed: speechSpeed
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };

  console.log("Sending request to API URL:", apiUrl);
  console.log("Request payload:", payload);

  if (streamingMode) {
    // Streaming Mode
    fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }
        const reader = response.body.getReader();
        const audioContext = new AudioContext();
        let audioBuffer = null;

        const processStream = ({ done, value }) => {
          if (done) {
            console.log("Streaming complete.");
            return;
          }

          // Process PCM chunks (example: convert to audio buffer and play)
          if (value) {
            audioContext.decodeAudioData(value.buffer, (buffer) => {
              audioBuffer = buffer;
              const source = audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContext.destination);
              source.start();
            });
          }

          // Read the next chunk
          reader.read().then(processStream);
        };

        // Start reading the stream
        reader.read().then(processStream);
      })
      .catch((error) => {
        console.error("Error calling TTS API:", error);
      });
  } else {
    // File Mode
    fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }
        return response.blob();
      })
      .then((audioBlob) => {
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);
        currentAudio.play();
      })
      .catch((error) => {
        console.error("Error calling TTS API:", error);
      });
  }
}