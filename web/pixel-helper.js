const HELPER_STORAGE_KEY = "pixel-helper-latest-update";
const HELPER_GUIDE_SEEN_KEY = "pixel-helper-category-guide-seen";

const helperState = {
  update: null,
  rendering: false
};

function helperEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function helperRuntime() {
  const declared = document.documentElement.dataset.pixelRuntime;
  if (declared === "android" || declared === "macos" || declared === "windows") return declared;
  const agent = navigator.userAgent || "";
  if (/Android/i.test(agent)) return "android";
  if (/Windows/i.test(agent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "macos";
  return "web";
}

function updateSteps(platform = helperRuntime()) {
  if (platform === "android") {
    return [
      "Appuie sur « Télécharger la mise à jour ».",
      "Ouvre le fichier APK quand le téléchargement est terminé.",
      "Si Android le demande, autorise temporairement l’installation depuis cette application.",
      "Appuie sur Installer. Ne désinstalle pas Pixel Everywhere : installe la nouvelle version par-dessus.",
      "Rouvre Pixel Everywhere une fois l’installation terminée."
    ];
  }
  if (platform === "windows") {
    return [
      "Appuie sur « Télécharger la version portable ».",
      "Ouvre le fichier Pixel-Everywhere…Portable.exe téléchargé.",
      "Si Windows SmartScreen apparaît, choisis Informations complémentaires puis Exécuter quand même.",
      "Pixel Everywhere se lance directement : aucune installation n’est nécessaire.",
      "Tu peux déplacer le fichier .exe dans le dossier de ton choix."
    ];
  }
  if (platform === "macos") {
    return [
      "Appuie sur « Télécharger la mise à jour ».",
      "Dans Téléchargements, ouvre le fichier ZIP puis récupère Pixel Everywhere.app.",
      "Ferme complètement l’ancienne application.",
      "Glisse la nouvelle application dans Applications et accepte de remplacer l’ancienne.",
      "Si macOS bloque le premier lancement, fais clic droit sur l’application puis Ouvrir."
    ];
  }
  return [
    "Télécharge la version adaptée à ton appareil.",
    "Ferme Pixel Everywhere avant de remplacer l’ancienne version.",
    "Installe la nouvelle version puis relance l’application."
  ];
}

function categoryGuideMarkup() {
  const items = [
    ["Accueil", "Retrouve les raccourcis principaux et le lien du serveur Discord."],
    ["Annonces", "Lis les informations du serveur, les annonces de l’application et les journaux de versions."],
    ["Pixel", "Occupe-toi de la mascotte, gagne de l’XP et utilise tes pièces."],
    ["Rejoindre le staff", "Envoie une candidature privée lorsque ton compte membre est connecté."],
    ["Messagerie", "Discute avec le staff et consulte les messages d’aide de Pixel Helper."],
    ["Idées et création", "Propose des améliorations et découvre les outils créatifs disponibles."],
    ["Compte", "Connecte ton compte membre ou staff et retrouve tes réglages."]
  ];
  return items.map(([title, body], index) => `
    <article class="pixel-helper-guide-item">
      <span>${index + 1}</span>
      <div><strong>${helperEscape(title)}</strong><p>${helperEscape(body)}</p></div>
    </article>`).join("");
}

function ensureHelperInterface() {
  if (!document.querySelector("#pixelHelperGuideButton")) {
    const button = document.createElement("button");
    button.id = "pixelHelperGuideButton";
    button.className = "pixel-guide-button";
    button.type = "button";
    button.setAttribute("aria-label", "Ouvrir le guide Pixel Helper");
    button.innerHTML = '<span aria-hidden="true">P</span><strong>Pixel Helper</strong>';
    button.addEventListener("click", showCategoryGuide);
    document.body.append(button);
  }

  if (!document.querySelector("#pixelHelperGuideDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "pixelHelperGuideDialog";
    dialog.className = "pixel-helper-dialog";
    dialog.innerHTML = `
      <article class="pixel-helper-modal">
        <button class="dialog-close" type="button" aria-label="Fermer">×</button>
        <div class="pixel-helper-heading">
          <span class="pixel-helper-avatar" aria-hidden="true">P</span>
          <div><p class="eyebrow">Pixel Helper</p><h2>Petit guide de l’application</h2></div>
        </div>
        <p class="pixel-helper-intro">Voici à quoi servent les catégories principales. Tu peux rouvrir ce guide à tout moment avec le bouton Pixel Helper.</p>
        <div class="pixel-helper-guide-list">${categoryGuideMarkup()}</div>
        <button class="primary-button pixel-helper-understood" type="button">J’ai compris</button>
      </article>`;
    dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
    dialog.querySelector(".pixel-helper-understood")?.addEventListener("click", () => {
      localStorage.setItem(HELPER_GUIDE_SEEN_KEY, "true");
      dialog.close();
    });
    document.body.append(dialog);
  }

  ensureUpdatePopupButton();
}

function showCategoryGuide() {
  ensureHelperInterface();
  const dialog = document.querySelector("#pixelHelperGuideDialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function hasAnyIdentity() {
  return Boolean(
    sessionStorage.getItem("pixel-token") ||
    localStorage.getItem("pixel-member-token")
  );
}

function updateMessageSubject() {
  return `Comment installer la mise à jour ${helperState.update?.latestVersion || ""}`.trim();
}

function updateMessageBody() {
  const update = helperState.update || {};
  const notes = String(update.releaseNotes || "Cette version contient des améliorations et des corrections.").trim();
  return {
    notes,
    steps: updateSteps()
  };
}

function ensureHelperThread() {
  if (!helperState.update?.updateAvailable || !hasAnyIdentity()) return;
  const list = document.querySelector("#conversationList");
  if (!list || list.querySelector("#pixelHelperUpdateThread")) return;

  const readVersion = localStorage.getItem("pixel-helper-update-read-version");
  const unread = readVersion !== String(helperState.update.latestVersion || "");
  const thread = document.createElement("button");
  thread.id = "pixelHelperUpdateThread";
  thread.type = "button";
  thread.className = `conversation-thread pixel-helper-thread${unread ? " unread" : ""}`;
  thread.innerHTML = `
    <span class="conversation-thread-head"><strong>Pixel Helper</strong><time>Maintenant</time></span>
    <b>${helperEscape(updateMessageSubject())}</b>
    <small>Tutoriel simple pour télécharger et installer cette version.</small>
    ${unread ? '<i>1</i>' : ""}`;
  thread.addEventListener("click", openUpdateMessage);
  list.prepend(thread);
}

function activateConversationPage() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".bottom-nav button").forEach((button) => button.classList.remove("active"));
  document.querySelector("#page-conversations")?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderUpdateMessage() {
  const detail = document.querySelector("#conversationDetail");
  if (!detail || !helperState.update) return;
  const { notes, steps } = updateMessageBody();
  detail.innerHTML = `
    <header class="conversation-detail-head pixel-helper-message-head">
      <div><small>Message d’aide automatique</small><h3>${helperEscape(updateMessageSubject())}</h3></div>
      <span class="pixel-helper-signed-badge">Pixel Helper</span>
    </header>
    <div class="conversation-messages pixel-helper-message-list">
      <article class="conversation-message theirs pixel-helper-message">
        <strong>Pixel Helper</strong>
        <p>Une nouvelle version de Pixel Everywhere est disponible. Voici comment l’installer sans perdre ton compte ni tes données.</p>
        <section class="pixel-helper-release-notes"><strong>Nouveautés</strong><p>${helperEscape(notes).replaceAll("\n", "<br />")}</p></section>
        <ol>${steps.map((step) => `<li>${helperEscape(step)}</li>`).join("")}</ol>
        <p class="pixel-helper-warning"><strong>Important :</strong> ne désinstalle pas l’ancienne version avant la mise à jour, sauf indication contraire.</p>
        <div class="pixel-helper-message-actions">
          <button id="pixelHelperDownloadUpdate" class="primary-button" type="button">Télécharger la mise à jour</button>
          <button id="pixelHelperOpenCategories" class="text-button" type="button">Voir le guide des catégories</button>
        </div>
        <small class="pixel-helper-signature">— Pixel Helper</small>
      </article>
    </div>`;
  detail.querySelector("#pixelHelperDownloadUpdate")?.addEventListener("click", () => {
    document.querySelector("#downloadAppUpdateButton")?.click();
  });
  detail.querySelector("#pixelHelperOpenCategories")?.addEventListener("click", showCategoryGuide);
}

function openUpdateMessage() {
  if (!helperState.update) return;
  localStorage.setItem("pixel-helper-update-read-version", String(helperState.update.latestVersion || ""));
  document.querySelector("#appUpdateDialog")?.close();
  activateConversationPage();
  ensureHelperThread();
  document.querySelectorAll(".conversation-thread").forEach((thread) => thread.classList.remove("active"));
  const helperThread = document.querySelector("#pixelHelperUpdateThread");
  helperThread?.classList.add("active");
  helperThread?.classList.remove("unread");
  helperThread?.querySelector("i")?.remove();
  renderUpdateMessage();
}

function ensureUpdatePopupButton() {
  const actions = document.querySelector("#appUpdateDialog .app-update-actions");
  if (!actions || actions.querySelector("#openPixelHelperUpdateMessage")) return;
  const button = document.createElement("button");
  button.id = "openPixelHelperUpdateMessage";
  button.className = "text-button pixel-helper-update-link";
  button.type = "button";
  button.textContent = "Voir le tutoriel dans la messagerie";
  button.addEventListener("click", openUpdateMessage);
  actions.append(button);
}

function rememberUpdate(data) {
  if (!data?.updateAvailable) return;
  helperState.update = {
    updateAvailable: true,
    latestVersion: String(data.latestVersion || ""),
    releaseNotes: String(data.releaseNotes || ""),
    downloadUrl: String(data.downloadUrl || ""),
    required: Boolean(data.required)
  };
  localStorage.setItem(HELPER_STORAGE_KEY, JSON.stringify(helperState.update));
  ensureHelperInterface();
  ensureHelperThread();
  window.dispatchEvent(new CustomEvent("pixel-helper-update-ready", {
    detail: helperState.update
  }));
}

function restoreUpdate() {
  try {
    const stored = JSON.parse(localStorage.getItem(HELPER_STORAGE_KEY) || "null");
    if (stored?.updateAvailable) helperState.update = stored;
  } catch {
    localStorage.removeItem(HELPER_STORAGE_KEY);
  }
}

function installUpdateResponseBridge() {
  const previousFetch = window.fetch.bind(window);
  window.fetch = async function pixelHelperFetch(input, init) {
    const response = await previousFetch(input, init);
    const url = requestUrl(input);
    if (/\/app\/update(?:\?|$)/.test(url) && response.ok) {
      response.clone().json().then(rememberUpdate).catch(() => {});
    }
    return response;
  };
}

function maybeShowFirstGuide() {
  if (!hasAnyIdentity() || localStorage.getItem(HELPER_GUIDE_SEEN_KEY) === "true") return;
  window.setTimeout(() => {
    if (!document.querySelector("dialog[open]") && document.visibilityState === "visible") {
      showCategoryGuide();
    }
  }, 5200);
}

restoreUpdate();
installUpdateResponseBridge();
ensureHelperInterface();
maybeShowFirstGuide();

const helperObserver = new MutationObserver(() => {
  if (helperState.rendering) return;
  helperState.rendering = true;
  try {
    ensureHelperInterface();
    ensureHelperThread();
  } finally {
    helperState.rendering = false;
  }
});
helperObserver.observe(document.documentElement, { childList: true, subtree: true });

window.PixelHelper = Object.freeze({
  openGuide: showCategoryGuide,
  openUpdateMessage,
  getUpdate: () => helperState.update
});
