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

  // Create an AbortController to potentially cancel the request
  const controller = new AbortController();

  // If we already have audio playing, stop it
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }

  if (streamingMode) {
    // For OpenAI API streaming mode
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        // Process the stream
        return processStream(response);
      })
      .catch((error) => {
        console.error("Error with TTS request:", error);
      });
  } else {
    // Standard non-streaming request
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        currentAudio = new Audio(url);
        currentAudio.play();
      })
      .catch((error) => {
        console.error("Error with TTS request:", error);
      });
  }

  // Function to process the stream
  async function processStream(response) {
    const reader = response.body.getReader();
    const mp3Chunks = [];

    try {
      // Wait for the first chunk to determine if it's streamable MP3 data
      const { value: firstChunk, done: firstDone } = await reader.read();

      if (firstDone || !firstChunk) {
        console.log("Empty response received");
        return;
      }

      // Add the first chunk to our collection
      mp3Chunks.push(firstChunk);

      // Try to play the first chunk if it's a valid MP3 (should have MP3 header)
      if (firstChunk.length > 100) {
        console.log(
          `First chunk received (${firstChunk.length} bytes), attempting playback`,
        );
        playChunksAsAudio(mp3Chunks);
      }

      // Process the rest of the stream
      let chunkCount = 1;
      let lastUpdate = 0;

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          console.log("Stream complete");
          // Play the complete audio one final time
          playChunksAsAudio(mp3Chunks, true);
          break;
        }

        // Add this chunk to our collection
        mp3Chunks.push(value);
        chunkCount++;

        // Update the audio every few chunks
        if (chunkCount - lastUpdate >= 5) {
          console.log(`Processed ${chunkCount} chunks so far, updating audio`);
          playChunksAsAudio(mp3Chunks);
          lastUpdate = chunkCount;
        }
      }
    } catch (error) {
      console.error("Error processing stream:", error);
    }
  }

  // Function to play the accumulated chunks as audio
  function playChunksAsAudio(chunks, isComplete = false) {
    // Create a blob from all chunks
    const blob = new Blob(chunks, { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);

    if (currentAudio) {
      // Get current position and playing state
      const currentTime = currentAudio.currentTime;
      const wasPlaying = !currentAudio.paused;

      if (wasPlaying) {
        // Create new audio element with updated content
        const newAudio = new Audio(url);

        // Set the position to match the current playback
        newAudio.currentTime = currentTime;

        // Play the new audio
        newAudio
          .play()
          .then(() => {
            // Clean up old audio
            URL.revokeObjectURL(currentAudio.src);
            currentAudio.pause();
            currentAudio = newAudio;

            if (isComplete) {
              console.log("Playing complete audio file");
            }
          })
          .catch((err) => {
            console.error("Error playing updated audio:", err);

            // If setting currentTime failed, try playing from the beginning
            if (err.name === "NotSupportedError") {
              newAudio.currentTime = 0;
              newAudio
                .play()
                .catch((e) => console.error("Still can't play audio:", e));
            }
          });
      }
    } else {
      // First time playing
      currentAudio = new Audio(url);
      currentAudio.play().catch((err) => {
        console.error("Error starting audio playback:", err);
      });
    }
  }
}
