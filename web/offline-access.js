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
  let decorating = false;
  const originalShowModal = dialog.showModal.bind(dialog);

  const isOfflineWarning = () => title.textContent.trim() === OFFLINE_TITLE;
  const isOnlineNotice = () => title.textContent.trim() === ONLINE_TITLE;

  function setTextIfChanged(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function decorateDialog() {
    if (decorating) return;
    decorating = true;
    try {
      if (isOfflineWarning()) {
        if (dialog.dataset.connectionState !== "offline") {
          dialog.dataset.connectionState = "offline";
        }
        retryButton.classList.remove("hidden");
        closeButton.classList.remove("hidden");
        setTextIfChanged(closeButton, "Continuer hors ligne");

        const offlineMessage =
          "Le serveur PDD est temporairement inaccessible. Tu peux continuer à utiliser les parties locales de l’application. Les annonces, comptes, candidatures, messages et autres fonctions en ligne reviendront automatiquement quand le serveur sera disponible.";
        setTextIfChanged(message, offlineMessage);
        return;
      }

      if (isOnlineNotice()) {
        warningDismissed = false;
        if (dialog.dataset.connectionState !== "online") {
          dialog.dataset.connectionState = "online";
        }
        closeButton.classList.remove("hidden");
        setTextIfChanged(closeButton, "Fermer");
      }
    } finally {
      decorating = false;
    }
  }

  dialog.showModal = function showDismissibleServerStatus() {
    decorateDialog();
    if (isOfflineWarning() && warningDismissed) return;
    if (!dialog.open) originalShowModal();
  };

  closeButton.addEventListener("click", () => {
    if (isOfflineWarning()) warningDismissed = true;
  }, true);

  dialog.addEventListener("cancel", () => {
    if (isOfflineWarning()) warningDismissed = true;
  });

  let decorationQueued = false;
  const observer = new MutationObserver(() => {
    if (decorationQueued) return;
    decorationQueued = true;
    window.requestAnimationFrame(() => {
      decorationQueued = false;
      decorateDialog();
    });
  });
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