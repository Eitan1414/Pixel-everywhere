const SERVER_STORAGE_KEY = "pixel-api-base-url";
const BUILD_API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const LOCAL_TERMUX_API = "http://127.0.0.1:3000/api";
const nativeFetch = window.fetch.bind(window);

function normalizeApiBase(value) {
  let candidate = String(value || "").trim();
  if (!candidate) throw new Error("Entre l’adresse du serveur PDD.");

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(candidate)
      ? `http://${candidate}`
      : `https://${candidate}`;
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("L’adresse du serveur n’est pas valide.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/api")) url.pathname = `${url.pathname}/api`;
  return url.toString().replace(/\/$/, "");
}

function storedApiBase() {
  const stored = localStorage.getItem(SERVER_STORAGE_KEY);
  if (!stored) return "";
  try {
    return normalizeApiBase(stored);
  } catch {
    localStorage.removeItem(SERVER_STORAGE_KEY);
    return "";
  }
}

function activeApiBase() {
  return storedApiBase() || BUILD_API_BASE;
}

function rewriteApiUrl(rawUrl) {
  const active = activeApiBase();
  if (!active || active === BUILD_API_BASE) return rawUrl;

  const value = String(rawUrl);
  if (BUILD_API_BASE.startsWith("http") && value.startsWith(BUILD_API_BASE)) {
    return `${active}${value.slice(BUILD_API_BASE.length)}`;
  }
  if (value === "/api" || value.startsWith("/api/")) {
    return `${active}${value.slice(4)}`;
  }

  try {
    const url = new URL(value);
    if (BUILD_API_BASE.startsWith("http")) {
      const buildUrl = new URL(BUILD_API_BASE);
      if (url.origin === buildUrl.origin && url.pathname.startsWith(buildUrl.pathname)) {
        const suffix = `${url.pathname.slice(buildUrl.pathname.length)}${url.search}${url.hash}`;
        return `${active}${suffix}`;
      }
    }
  } catch {
    // Les URL qui ne concernent pas l’API restent inchangées.
  }

  return rawUrl;
}

window.fetch = function patchedPixelFetch(input, init) {
  if (typeof input === "string" || input instanceof URL) {
    return nativeFetch(rewriteApiUrl(input), init);
  }
  if (input instanceof Request) {
    const rewritten = rewriteApiUrl(input.url);
    return nativeFetch(rewritten === input.url ? input : new Request(rewritten, input), init);
  }
  return nativeFetch(input, init);
};

async function testApiBase(base) {
  const normalized = normalizeApiBase(base);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  const headers = {};
  if (normalized.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  try {
    const response = await nativeFetch(`${normalized}/health`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      throw new Error("Le serveur ne répond pas comme Pixel Everywhere.");
    }
    return normalized;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Le serveur met trop de temps à répondre.");
    }
    throw new Error(error?.message || "Serveur inaccessible.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function serverLabel(base) {
  try {
    const url = new URL(base, window.location.href);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return "Termux local";
    return url.hostname;
  } catch {
    return "Serveur PDD";
  }
}

function installServerSettings() {
  const accountCard = document.querySelector(".account-dialog-card");
  const accountTabs = accountCard?.querySelector(".account-tabs");
  if (!accountCard || !accountTabs || accountCard.querySelector("#serverSettingsPanel")) return;

  const style = document.createElement("style");
  style.textContent = `
    .server-settings-panel {
      display: grid;
      gap: 9px;
      padding: 12px;
      border: 1px solid rgba(18, 214, 223, 0.25);
      border-radius: 14px;
      background: rgba(18, 214, 223, 0.055);
    }
    .server-settings-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 0;
      border: 0;
      color: var(--text);
      font-weight: 850;
      text-align: left;
      background: transparent;
    }
    .server-settings-toggle small { color: var(--cyan); }
    .server-settings-body { display: none; gap: 9px; }
    .server-settings-panel.open .server-settings-body { display: grid; }
    .server-settings-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .server-settings-actions button {
      min-height: 40px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: var(--surface);
    }
    .server-settings-status { min-height: 1.2em; margin: 0; color: var(--muted); font-size: .76rem; line-height: 1.4; }
    .server-settings-status.success { color: var(--success); }
    .server-settings-status.error { color: var(--danger); }
  `;
  document.head.append(style);

  const panel = document.createElement("section");
  panel.id = "serverSettingsPanel";
  panel.className = "server-settings-panel";
  panel.innerHTML = `
    <button class="server-settings-toggle" type="button">
      <span>Serveur PDD</span>
      <small id="serverSettingsLabel"></small>
    </button>
    <div class="server-settings-body">
      <small>Utilise l’adresse HTTPS affichée par ngrok, ou le serveur Termux local si celui-ci tourne sur ce même appareil.</small>
      <input id="serverSettingsInput" type="url" inputmode="url" autocomplete="url" placeholder="https://exemple.ngrok-free.app/api" />
      <div class="server-settings-actions">
        <button id="testServerSettings" type="button">Tester</button>
        <button id="saveServerSettings" type="button">Enregistrer</button>
        <button id="useLocalServer" type="button">Termux local</button>
        <button id="resetServerSettings" type="button">Adresse d’origine</button>
      </div>
      <p id="serverSettingsStatus" class="server-settings-status"></p>
    </div>
  `;
  accountTabs.before(panel);

  const input = panel.querySelector("#serverSettingsInput");
  const label = panel.querySelector("#serverSettingsLabel");
  const status = panel.querySelector("#serverSettingsStatus");
  const toggle = panel.querySelector(".server-settings-toggle");
  const setStatus = (message, type = "") => {
    status.textContent = message;
    status.className = `server-settings-status ${type}`.trim();
  };
  const refresh = () => {
    const base = activeApiBase();
    input.value = base.startsWith("http") ? base : "";
    label.textContent = serverLabel(base);
  };

  toggle.addEventListener("click", () => panel.classList.toggle("open"));

  panel.querySelector("#testServerSettings").addEventListener("click", async () => {
    setStatus("Test du serveur…");
    try {
      const base = await testApiBase(input.value);
      input.value = base;
      setStatus("Serveur en ligne. Tu peux enregistrer cette adresse.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  panel.querySelector("#saveServerSettings").addEventListener("click", async () => {
    setStatus("Vérification avant enregistrement…");
    try {
      const base = await testApiBase(input.value);
      localStorage.setItem(SERVER_STORAGE_KEY, base);
      refresh();
      setStatus("Adresse enregistrée. Les comptes membres utilisent maintenant ce serveur.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  panel.querySelector("#useLocalServer").addEventListener("click", async () => {
    input.value = LOCAL_TERMUX_API;
    setStatus("Recherche de Termux sur cet appareil…");
    try {
      const base = await testApiBase(LOCAL_TERMUX_API);
      localStorage.setItem(SERVER_STORAGE_KEY, base);
      refresh();
      setStatus("Serveur Termux local connecté.", "success");
    } catch (error) {
      setStatus(`${error.message} Vérifie que npm start tourne dans Termux.`, "error");
    }
  });

  panel.querySelector("#resetServerSettings").addEventListener("click", () => {
    localStorage.removeItem(SERVER_STORAGE_KEY);
    refresh();
    setStatus("Adresse d’origine restaurée.", "success");
  });

  refresh();

  window.setTimeout(async () => {
    try {
      await testApiBase(activeApiBase());
      setStatus("Serveur en ligne.", "success");
    } catch {
      const isCapacitor = window.location.hostname === "localhost";
      if (!storedApiBase() && isCapacitor) {
        try {
          const localBase = await testApiBase(LOCAL_TERMUX_API);
          localStorage.setItem(SERVER_STORAGE_KEY, localBase);
          refresh();
          setStatus("Termux local détecté automatiquement.", "success");
          return;
        } catch {
          // Le tunnel ngrok peut être saisi manuellement ci-dessous.
        }
      }
      panel.classList.add("open");
      setStatus("Serveur hors ligne ou ancienne adresse ngrok. Entre la nouvelle adresse affichée dans Termux/ngrok.", "error");
    }
  }, 700);
}

window.PixelServerSettings = {
  activeApiBase,
  normalizeApiBase,
  testApiBase
};

window.addEventListener("DOMContentLoaded", installServerSettings);
