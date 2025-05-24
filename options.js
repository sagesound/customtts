document.addEventListener("DOMContentLoaded", () => {
  // Reuse popup.js functionality
  const apiUrlInput = document.getElementById("apiUrl");
  const apiKeyInput = document.getElementById("apiKey");
  const speedInput = document.getElementById("speed");
  const saveButton = document.getElementById("saveButton");
  const voiceInput = document.getElementById("voice");
  const modelInput = document.getElementById("model");
  const streamingModeInput = document.getElementById("streamingMode");
  const stopButton = document.getElementById("stopButton");

  // Load settings
  browser.storage.local.get(["apiUrl", "apiKey", "speechSpeed", "voice", "model", "streamingMode"])
    .then((data) => {
      apiUrlInput.value = data.apiUrl || "http://host.docker.internal:8880/v1/";
      apiKeyInput.value = data.apiKey || "not-needed";
      voiceInput.value = data.voice || "af_bella+bf_emma+af_nicole";
      speedInput.value = data.speechSpeed || 1.0;
      modelInput.value = data.model || "kokoro";
      streamingModeInput.checked = data.streamingMode || false;
    });

  // Save settings
  saveButton.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const speed = parseFloat(speedInput.value);
    const voice = voiceInput.value.trim();
    const model = modelInput.value.trim();
    const streamingMode = streamingModeInput.checked;

    if (!apiUrl) {
      alert("API URL cannot be empty.");
      return;
    }
    if (isNaN(speed) || speed < 0.1 || speed > 10.0) {
      alert("Speech speed must be between 0.1 and 10.0.");
      return;
    }

    try {
      await browser.storage.local.set({ apiUrl, apiKey, voice, speechSpeed: speed, model, streamingMode });
      alert("Settings saved!");
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save.");
    }
  });

  // Stop button
  stopButton.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "stopPlayback" });
  });
});