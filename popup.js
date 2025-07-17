document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const apiKeyInput = document.getElementById("apiKey");
  const speedInput = document.getElementById("speed");
  const saveButton = document.getElementById("saveButton");
  const voiceInput = document.getElementById("voice");
  const modelInput = document.getElementById("model");
  const streamingModeInput = document.getElementById("streamingMode");
  const downloadModeInput = document.getElementById("downloadMode");
  const stopButton = document.getElementById("stopButton");
  const volumeInput = document.getElementById("volume");
  const streamingWarning = document.getElementById("streamingWarning");
  const downloadWarning = document.getElementById("downloadWarning");

  // Load settings from local storage
  browser.storage.local.get(["apiUrl", "apiKey", "speechSpeed", "voice", "model", "streamingMode", "downloadMode", "outputVolume"])
    .then((data) => {
      apiUrlInput.value = data.apiUrl || "http://host.docker.internal:8880/v1/";
      apiKeyInput.value = data.apiKey || "not-needed";
      voiceInput.value = data.voice || "af_bella+bf_emma+af_nicole";
      speedInput.value = data.speechSpeed || 1.0;
      modelInput.value = data.model || "kokoro";
      streamingModeInput.checked = data.streamingMode || false; // Load streaming mode setting
	  downloadModeInput.checked = data.downloadMode || false;
	  volumeInput.value = data.outputVolume ?? 1.0;
    })
    .catch((error) => {
      console.error("Error loading settings:", error);
    });
	
	// Handle mutual exclusivity between streaming and download modes
	streamingModeInput.addEventListener("change", () => {
    if (streamingModeInput.checked && downloadModeInput.checked) {
      downloadModeInput.checked = false;
      streamingWarning.style.display = "none";
      downloadWarning.style.display = "none";
    }
  });

  downloadModeInput.addEventListener("change", () => {
    if (downloadModeInput.checked && streamingModeInput.checked) {
      streamingModeInput.checked = false;
      streamingWarning.style.display = "none";
      downloadWarning.style.display = "none";
    }
  });

  // Save settings to local storage
  saveButton.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const speed = parseFloat(speedInput.value);
    const voice = voiceInput.value.trim();
    const model = modelInput.value.trim();
    const streamingMode = streamingModeInput.checked;
	const downloadMode = downloadModeInput.checked;
	const volume = parseFloat(volumeInput.value);

    if (!apiUrl) {
      alert("API URL cannot be empty.");
      return;
    }
    if (isNaN(speed) || speed < 0.5 || speed > 2.0) {
      alert("Speech speed must be between 0.5 and 2.0.");
      return;
    }
	if (isNaN(volume) || volume < 0 || volume > 1) {
    alert("Volume must be between 0 and 1.");
    return;
	}

    try {
      await browser.storage.local.set({
        apiUrl,
        apiKey,
        voice,
        speechSpeed: speed,
        model,
        streamingMode, // Save streaming mode setting
		downloadMode,
		outputVolume: volume
      });
      alert("Settings saved!");
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save.");
    }
  });

  // Stop Playback Button
  stopButton.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "stopPlayback" });
  });
});