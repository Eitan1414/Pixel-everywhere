window.PixelManualUpdates = Object.freeze({
  enabled: true,
  installation: "manual"
});

document.documentElement.dataset.pixelManualUpdates = "true";

function introIsVisible() {
  const startup = document.querySelector("#startupAnimation");
  if (!startup || startup.hidden) return false;
  const style = window.getComputedStyle(startup);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
}

function enforceManualUpdateInterface() {
  const cardTitle = document.querySelector("#appUpdateCard strong");
  if (cardTitle && cardTitle.textContent !== "Mises à jour") {
    cardTitle.textContent = "Mises à jour";
  }

  const summary = document.querySelector("#appUpdateSummary");
  if (summary?.textContent.includes("Vérification automatique")) {
    summary.textContent = summary.textContent.replace(
      "Vérification automatique",
      "Recherche automatique • installation manuelle"
    );
  }

  const adminEyebrow = document.querySelector("#updateAdminForm .update-admin-heading .eyebrow");
  if (adminEyebrow && adminEyebrow.textContent !== "Diffusion des mises à jour") {
    adminEyebrow.textContent = "Diffusion des mises à jour";
  }

  const downloadButton = document.querySelector("#downloadAppUpdateButton");
  if (downloadButton && downloadButton.textContent !== "Télécharger le fichier") {
    downloadButton.textContent = "Télécharger le fichier";
  }

  const laterButton = document.querySelector("#laterAppUpdateButton");
  if (laterButton) {
    if (laterButton.hidden) laterButton.hidden = false;
    if (laterButton.textContent !== "Installer plus tard") laterButton.textContent = "Installer plus tard";
  }

  const closeButton = document.querySelector("#closeAppUpdateDialog");
  if (closeButton?.hidden) closeButton.hidden = false;

  const title = document.querySelector("#appUpdateTitle");
  if (title?.textContent === "Mise à jour obligatoire") {
    title.textContent = "Mise à jour importante";
  }

  const instructions = document.querySelector("#appUpdateInstructions");
  if (instructions?.textContent) {
    const isAndroid = /Android/i.test(instructions.textContent);
    const manualText = isAndroid
      ? "Télécharge l’APK, puis ouvre-le depuis les téléchargements Android pour confirmer toi-même l’installation."
      : "Télécharge le ZIP adapté à ce Mac, ferme Pixel Everywhere, puis remplace manuellement l’ancienne application.";
    if (instructions.textContent !== manualText) instructions.textContent = manualText;
  }
}

function installManualDialogActions() {
  document.addEventListener("click", (event) => {
    const dismissButton = event.target.closest?.("#closeAppUpdateDialog, #laterAppUpdateButton");
    if (!dismissButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const versions = document.querySelector("#appUpdateVersions")?.textContent || "";
    const latestVersion = versions.match(/nouvelle version\s+(.+)$/i)?.[1]?.trim() || "";
    if (latestVersion) {
      localStorage.setItem("pixel-update-dismissed-version", latestVersion);
      localStorage.setItem("pixel-update-dismissed-at", String(Date.now()));
    }
    document.querySelector("#appUpdateDialog")?.close();
  }, true);
}

function guardUpdateDialogOpening() {
  const dialog = document.querySelector("#appUpdateDialog");
  if (!dialog) return;

  const nativeShowModal = dialog.showModal.bind(dialog);
  let deferredOpen = false;

  const openManually = () => {
    enforceManualUpdateInterface();
    if (!dialog.open) nativeShowModal();
  };

  const releaseDeferredDialog = () => {
    if (!deferredOpen || introIsVisible()) return;
    deferredOpen = false;
    openManually();
  };

  dialog.showModal = function showManualUpdateAfterIntro() {
    enforceManualUpdateInterface();
    if (introIsVisible()) {
      deferredOpen = true;
      return;
    }
    openManually();
  };

  const startup = document.querySelector("#startupAnimation");
  if (startup) {
    const introObserver = new MutationObserver(releaseDeferredDialog);
    introObserver.observe(startup, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style"]
    });
  }
  window.setTimeout(releaseDeferredDialog, 12_000);
}

enforceManualUpdateInterface();
installManualDialogActions();
guardUpdateDialogOpening();