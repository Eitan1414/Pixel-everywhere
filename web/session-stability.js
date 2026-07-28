const persistentStaffTokenKey = "pixel-staff-token-persistent";
const persistentStaffUserKey = "pixel-staff-user-persistent";
const skipStartupKey = "pixel-skip-startup-once";

// enhancements.js contient encore un ancien gestionnaire de connexion membre.
// Il intercepte les formulaires en phase capture, envoie une seconde requête puis
// recharge toute l’application. main.js possède déjà le gestionnaire officiel,
// sans reload. On bloque donc systématiquement les gestionnaires capture ajoutés
// aux deux formulaires membre pendant l’installation des modules.
//
// L’ancienne détection inspectait le texte de la fonction. Après minification
// Vite/Electron, les noms changeaient et le doublon n’était plus reconnu sur macOS.
const nativeAddEventListener = EventTarget.prototype.addEventListener;
let blockDuplicateMemberAuth = true;
const stableAddEventListener = function stableAddEventListener(type, listener, options) {
  const capture = options === true || Boolean(options && typeof options === "object" && options.capture);
  const memberForm = this instanceof HTMLFormElement
    && ["memberLoginForm", "memberRegisterForm"].includes(this.id);

  if (blockDuplicateMemberAuth && type === "submit" && capture && memberForm) {
    return undefined;
  }
  return nativeAddEventListener.call(this, type, listener, options);
};
EventTarget.prototype.addEventListener = stableAddEventListener;

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

function cachedMemberResponse() {
  const token = localStorage.getItem("pixel-member-token");
  const rawMember = localStorage.getItem("pixel-member");
  if (!token || !rawMember) return null;

  try {
    const member = JSON.parse(rawMember);
    if (!member || !member.id || !member.username) return null;
    return new Response(JSON.stringify({ member, cached: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return null;
  }
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

// Une micro-coupure ngrok ne doit déconnecter ni le staff ni le membre.
// Les contrôles de session sont retentés. Un vrai 401/403 reste définitif ;
// pour le membre uniquement, une erreur réseau/5xx conserve temporairement les
// données locales au lieu d’effacer instantanément le compte après un reload.
const originalFetch = window.fetch.bind(window);
window.fetch = async function stablePixelFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";
  const isStaffSessionCheck = /\/api\/auth\/me(?:$|[?#])/.test(url);
  const isMemberSessionCheck = /\/api\/members\/me(?:$|[?#])/.test(url);
  const isSessionCheck = isStaffSessionCheck || isMemberSessionCheck;
  const maximumAttempts = isSessionCheck ? 3 : 1;
  let lastError = null;
  let lastResponse = null;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      lastResponse = response;

      if (isSessionCheck && [401, 403].includes(response.status)) {
        if (isStaffSessionCheck) clearPersistentStaffSession();
        return response;
      }

      if (!isSessionCheck || response.status < 500) return response;
      if (attempt === maximumAttempts) {
        return isMemberSessionCheck ? cachedMemberResponse() || response : response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) {
        if (isMemberSessionCheck) {
          const cached = cachedMemberResponse();
          if (cached) return cached;
        }
        throw error;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, attempt * 450));
  }

  if (isMemberSessionCheck) {
    const cached = cachedMemberResponse();
    if (cached) return cached;
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Connexion au serveur impossible.");
};

// main.js utilise sessionStorage pour le staff. Une copie locale permet à
// Electron/macOS de restaurer la session après un rechargement interne ou une
// reprise de fenêtre, tout en gardant l’expiration JWT de 8 heures côté serveur.
window.setInterval(persistStaffSession, 250);

window.addEventListener("DOMContentLoaded", () => {
  // enhancements.js installe son ancien doublon dans son callback DOMContentLoaded.
  // On garde le filtre actif pendant tous ces callbacks, puis on restaure l’API
  // native au tour d’événement suivant. Le gestionnaire officiel de main.js est
  // enregistré sans capture et n’est jamais bloqué.
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