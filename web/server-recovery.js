function installServerRecoveryAction() {
  const dialog = document.querySelector("#serverStatusDialog");
  const actions = dialog?.querySelector(".server-status-actions");
  const accountButton = document.querySelector("#accountButton");
  const settingsPanel = document.querySelector("#serverSettingsPanel");

  if (!dialog || !actions || !accountButton || !settingsPanel) return;
  if (document.querySelector("#configureServerButton")) return;

  const button = document.createElement("button");
  button.id = "configureServerButton";
  button.type = "button";
  button.className = "text-button";
  button.textContent = "Configurer le serveur";

  button.addEventListener("click", () => {
    if (dialog.open) dialog.close();
    settingsPanel.classList.add("open");
    accountButton.click();
    window.setTimeout(() => {
      settingsPanel.querySelector("#serverSettingsInput")?.focus();
    }, 120);
  });

  actions.append(button);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installServerRecoveryAction, { once: true });
} else {
  installServerRecoveryAction();
}
