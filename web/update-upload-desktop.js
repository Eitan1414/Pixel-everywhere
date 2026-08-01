const desktopUpdateUploader = window.pixelDesktop?.selectUpdateFile;

function desktopUpdateApiBase() {
  const base = window.PixelServerSettings?.activeApiBase?.() || "";
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("Configure d’abord l’adresse du serveur PDD dans l’application.");
  }
  return base.replace(/\/$/, "");
}

function decorateDesktopUpdateCards() {
  if (typeof desktopUpdateUploader !== "function") return;
  document.querySelectorAll("[data-update-target]").forEach((card) => {
    // Le MutationObserver écoute les changements de contenu. Sans ce drapeau,
    // modifier le texte du bouton déclencheait à nouveau l’observateur en boucle
    // et figeait Electron dès l’ouverture des réglages de mise à jour.
    if (card.dataset.desktopUpdateReady === "true") return;
    card.dataset.desktopUpdateReady = "true";

    const input = card.querySelector(".update-file-input");
    const button = card.querySelector(".upload-update-file");
    if (input) input.hidden = true;
    if (button) button.textContent = "Choisir et envoyer";

    const help = document.createElement("small");
    help.className = "desktop-update-upload-help";
    help.textContent = "Le sélecteur de fichiers de l’ordinateur s’ouvrira au moment de l’envoi.";
    card.querySelector(".update-file-actions")?.insertAdjacentElement("beforebegin", help);
  });
}

async function uploadDesktopUpdate(card, button) {
  const target = String(card.dataset.updateTarget || "");
  const status = card.querySelector(".form-status");
  const token = sessionStorage.getItem("pixel-token")
    || localStorage.getItem("pixel-staff-token-persistent")
    || "";
  if (!token) {
    status.className = "form-status error";
    status.textContent = "Reconnecte ton compte administrateur avant d’envoyer le fichier.";
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Sélection…";
  status.className = "form-status";
  status.textContent = "Choisis le fichier correspondant à cette plateforme.";

  try {
    const base = desktopUpdateApiBase();
    const result = await desktopUpdateUploader({
      target,
      url: `${base}/admin/update-files/${encodeURIComponent(target)}`,
      authorization: `Bearer ${token}`
    });
    if (result?.canceled) {
      status.textContent = "Envoi annulé.";
      return;
    }
    status.className = "form-status success";
    status.textContent = result?.data?.message || `${result?.filename || "Le fichier"} est prêt sur le serveur.`;
    window.setTimeout(() => document.querySelector("#refreshUpdateAdmin")?.click(), 150);
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error?.message || "Impossible d’envoyer le fichier de mise à jour.";
  } finally {
    button.disabled = false;
    button.textContent = previousText || "Choisir et envoyer";
  }
}

if (typeof desktopUpdateUploader === "function") {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".upload-update-file");
    if (!button) return;
    const card = button.closest("[data-update-target]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    uploadDesktopUpdate(card, button);
  }, true);

  const observer = new MutationObserver(decorateDesktopUpdateCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  decorateDesktopUpdateCards();
}
