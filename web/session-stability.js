const persistentStaffTokenKey = "pixel-staff-token-persistent";
const persistentStaffUserKey = "pixel-staff-user-persistent";
const skipStartupKey = "pixel-skip-startup-once";

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

const originalFetch = window.fetch.bind(window);
window.fetch = async function stablePixelFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";
  const isSessionCheck = /\/api\/auth\/me(?:$|[?#])/.test(url);
  const maximumAttempts = isSessionCheck ? 3 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      if (isSessionCheck && response.status === 401) {
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

let knownMemberToken = localStorage.getItem("pixel-member-token") || "";
window.setInterval(() => {
  persistStaffSession();

  const currentMemberToken = localStorage.getItem("pixel-member-token") || "";
  if (currentMemberToken && currentMemberToken !== knownMemberToken) {
    // enhancements.js recharge actuellement le document pour synchroniser son état.
    // Ce drapeau supprime l’intro au prochain chargement : la transition devient
    // instantanée et la session staff est restaurée avant main.js.
    sessionStorage.setItem(skipStartupKey, "1");
  }
  knownMemberToken = currentMemberToken;
}, 50);

window.addEventListener("DOMContentLoaded", () => {
  if (shouldSkipStartup) {
    const intro = document.querySelector("#startupAnimation");
    if (intro) intro.hidden = true;
    document.body.classList.remove("startup-running");
  }

  document.querySelector("#logoutButton")?.addEventListener("click", () => {
    clearPersistentStaffSession();
  }, { capture: true });

  // Une fermeture de dialogue ou une connexion membre ne doit jamais effacer
  // l’autre type de compte : membre et staff restent deux sessions indépendantes.
  persistStaffSession();
});
