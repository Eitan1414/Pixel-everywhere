const persistentStaffTokenKey = "pixel-staff-token-persistent";
const persistentStaffUserKey = "pixel-staff-user-persistent";
const skipStartupKey = "pixel-skip-startup-once";

// enhancements.js contenait un second gestionnaire de connexion membre qui
// interceptait le formulaire, envoyait une seconde requête, puis rechargeait tout
// le document. Le gestionnaire principal de main.js sait déjà mettre l’interface
// à jour sans rechargement. On empêche uniquement ce doublon, sans toucher aux
// autres améliorations ni au mémorisateur d’identifiant.
const nativeAddEventListener = EventTarget.prototype.addEventListener;
let blockDuplicateMemberAuth = true;
EventTarget.prototype.addEventListener = function stableAddEventListener(type, listener, options) {
  const capture = options === true || Boolean(options && typeof options === "object" && options.capture);
  const memberForm = this instanceof HTMLFormElement
    && ["memberLoginForm", "memberRegisterForm"].includes(this.id);
  const listenerSource = typeof listener === "function"
    ? Function.prototype.toString.call(listener)
    : "";
  const duplicateAuthHandler = listenerSource.includes("memberAuthRequest")
    && listenerSource.includes("stopImmediatePropagation");

  if (blockDuplicateMemberAuth && type === "submit" && capture && memberForm && duplicateAuthHandler) {
    return undefined;
  }
  return nativeAddEventListener.call(this, type, listener, options);
};

function restoreStaffSession() {
  const token = localStorage.getItem(persistentStaffTokenKey);
  const user = localStorage.getItem(persistentStaffUserKey);
  if (token && user) {
    if (!sessionStorage.getItem("pixel-token")) sessionStorage.setItem("pixel-token", token);
    if (!sessionStorage.getItem("pixel-user")) sessionStorage.setItem("pixel-user", user);
  }
}

function persistStaffSession() {
  const token = sessionStorage.getItem("pixel-token");
  const user = sessionStorage.getItem("pixel-user");
  if (token) localStorage.setItem(persistentStaffTokenKey, token);
  if (user) localStorage.setItem(persistentStaffUserKey, user);
}

function clearPersistentStaffSession() {
  localStorage.removeItem(persistentStaffTokenKey);
  localStorage.removeItem(persistentStaffUserKey);
}

restoreStaffSession();

// Compatibilité avec une ancienne version qui aurait déjà programmé un reload.
const shouldSkipStartup = sessionStorage.getItem(skipStartupKey) === "1";
if (shouldSkipStartup) {
  sessionStorage.removeItem(skipStartupKey);
  const style = document.createElement("style");
  style.id = "skipAuthReloadStartupStyle";
  style.textContent = `
    #startupAnimation { display: none !important; }
    body.startup-running { overflow: auto !important; }
  `;
  document.head.append(style);
}

// Une micro-coupure ngrok ne doit pas déconnecter le staff. Les erreurs réseau
// et HTTP 5xx sont retentées, tandis qu’un véritable 401/403 efface la session.
const originalFetch = window.fetch.bind(window);
window.fetch = async function stablePixelFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";
  const isSessionCheck = /\/api\/auth\/me(?:$|[?#])/.test(url);
  const maximumAttempts = isSessionCheck ? 3 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      if (isSessionCheck && [401, 403].includes(response.status)) {
        clearPersistentStaffSession();
      }
      if (!isSessionCheck || response.status < 500 || attempt === maximumAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, attempt * 450));
  }

  throw lastError || new Error("Connexion au serveur impossible.");
};

// main.js utilise sessionStorage pour le staff. Une copie locale permet à
// Electron/macOS de restaurer la session après un rechargement interne ou une
// reprise de fenêtre, tout en gardant l’expiration JWT de 8 heures côté serveur.
window.setInterval(persistStaffSession, 250);

window.addEventListener("DOMContentLoaded", () => {
  // Laisse enhancements.js tenter d’installer son ancien doublon pendant tous
  // les callbacks DOMContentLoaded, puis remet l’API native dès le tour suivant.
  window.setTimeout(() => {
    blockDuplicateMemberAuth = false;
    if (EventTarget.prototype.addEventListener === stableAddEventListener) {
      EventTarget.prototype.addEventListener = nativeAddEventListener;
    }
  }, 0);

  if (shouldSkipStartup) {
    const intro = document.querySelector("#startupAnimation");
    if (intro) intro.hidden = true;
    document.body.classList.remove("startup-running");
  }

  document.querySelector("#logoutButton")?.addEventListener("click", () => {
    clearPersistentStaffSession();
  }, { capture: true });

  // Les comptes membre et staff restent deux sessions indépendantes : se
  // connecter à l’un ne ferme jamais l’autre.
  persistStaffSession();
});
