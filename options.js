document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const saveButton = document.getElementById("saveButton");

  // Load stored API URL
  browser.storage.local.get("apiUrl").then((data) => {
    apiUrlInput.value = data.apiUrl || "";
  });

  // Save API URL
  saveButton.addEventListener("click", () => {
    const apiUrl = apiUrlInput.value.trim();
    browser.storage.local.set({ apiUrl: apiUrl }).then(() => {
      alert("API URL saved!");
    });
  });
});
