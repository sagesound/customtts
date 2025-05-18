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
  browser.tabs
    .executeScript({
      code: "window.getSelection().toString();",
    })
    .then((results) => {
      const selectedText = results[0];
      if (selectedText) processText(selectedText);
    });
}

// Load settings from local storage
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
    streamingMode = changes.streamingMode.newValue;
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
    browser.contextMenus.create(
      {
        id: "readText",
        title: "Read Selected Text",
        contexts: ["selection"],
      },
      () => {
        if (browser.runtime.lastError) {
          console.error(
            "Error creating context menu:",
            browser.runtime.lastError,
          );
        } else {
          console.log("Context menu created successfully.");
        }
      },
    );
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
  console.log("Context menu clicked: ", info);
  if (info.menuItemId === "readText" && info.selectionText) {
    console.log("Text to read: ", info.selectionText);
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
    response_format: "mp3",
    speed: speechSpeed,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  console.log("Sending request to API URL:", apiUrl);
  console.log("Request payload:", payload);

  // Make sure we're using the audio/speech endpoint
  const endpoint = apiUrl.endsWith("/")
    ? apiUrl + "audio/speech"
    : apiUrl + "/audio/speech";

  if (streamingMode) {
    // Add stream=true parameter to the URL for proper streaming
    const streamingEndpoint =
      endpoint + (endpoint.includes("?") ? "&" : "?") + "stream=true";

    console.log("Using streaming endpoint:", streamingEndpoint);

    fetch(streamingEndpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        const reader = response.body.getReader();
        let chunks = [];

        // Function to process chunks
        const processChunk = ({ done, value }) => {
          if (done) {
            console.log("Stream complete");

            // Create a complete audio blob from all chunks
            const blob = new Blob(chunks, { type: "audio/mp3" });
            const url = URL.createObjectURL(blob);

            // If we already have an audio element playing
            if (currentAudio && !currentAudio.paused) {
              // Store the current position
              const currentTime = currentAudio.currentTime;
              currentAudio.src = url;
              currentAudio.currentTime = currentTime;
            } else {
              // Create new audio element
              currentAudio = new Audio(url);
              currentAudio.play();
            }

            return;
          }

          // Add chunk to the collection
          chunks.push(value);

          // If this is our first chunk, start playing immediately
          if (chunks.length === 1) {
            const blob = new Blob([value], { type: "audio/mp3" });
            const url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio
              .play()
              .then(() => console.log("Started playing first chunk"))
              .catch((e) => console.error("Error playing first chunk:", e));
          }

          // Continue reading
          return reader.read().then(processChunk);
        };

        // Start reading
        return reader.read().then(processChunk);
      })
      .catch((error) => {
        console.error("Error with streaming audio request:", error);
      });
  } else {
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
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
