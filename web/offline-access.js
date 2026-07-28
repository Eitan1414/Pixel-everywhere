const OFFLINE_TITLE = "Les serveurs sont fermés";
const ONLINE_TITLE = "Les serveurs sont de nouveau ouverts";

function installOfflineAccess() {
  const dialog = document.querySelector("#serverStatusDialog");
  const title = document.querySelector("#serverStatusTitle");
  const message = document.querySelector("#serverStatusMessage");
  const retryButton = document.querySelector("#retryServerButton");
  const closeButton = document.querySelector("#closeServerStatus");

  if (!dialog || !title || !message || !retryButton || !closeButton) return;
  if (dialog.dataset.offlineAccessReady === "true") return;
  dialog.dataset.offlineAccessReady = "true";

  let warningDismissed = false;
  const originalShowModal = dialog.showModal.bind(dialog);

  const isOfflineWarning = () => title.textContent.trim() === OFFLINE_TITLE;
  const isOnlineNotice = () => title.textContent.trim() === ONLINE_TITLE;

  function decorateDialog() {
    if (isOfflineWarning()) {
      dialog.dataset.connectionState = "offline";
      retryButton.classList.remove("hidden");
      closeButton.classList.remove("hidden");
      closeButton.textContent = "Continuer hors ligne";

      const offlineMessage =
        "Le serveur PDD est temporairement inaccessible. Tu peux continuer à utiliser les parties locales de l’application. Les annonces, comptes, candidatures, messages et autres fonctions en ligne reviendront automatiquement quand le serveur sera disponible.";
      if (message.textContent !== offlineMessage) message.textContent = offlineMessage;
      return;
    }

    if (isOnlineNotice()) {
      warningDismissed = false;
      dialog.dataset.connectionState = "online";
      closeButton.classList.remove("hidden");
      closeButton.textContent = "Fermer";
    }
  }

  dialog.showModal = function showDismissibleServerStatus() {
    decorateDialog();
    if (isOfflineWarning() && warningDismissed) return;
    originalShowModal();
  };

  closeButton.addEventListener("click", () => {
    if (isOfflineWarning()) warningDismissed = true;
  }, true);

  dialog.addEventListener("cancel", () => {
    if (isOfflineWarning()) warningDismissed = true;
  });

  const observer = new MutationObserver(decorateDialog);
  observer.observe(dialog, {
    attributes: true,
    attributeFilter: ["open"],
    childList: true,
    subtree: true
  });

  decorateDialog();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installOfflineAccess, { once: true });
} else {
  installOfflineAccess();
}
