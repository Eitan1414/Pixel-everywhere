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
    // URL sans rapport avec l’API.
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
    if (error?.name === "AbortError") throw new Error("Le serveur met trop de temps à répondre.");
    throw new Error(error?.message || "Serveur inaccessible.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function serverLabel(base) {
  try {
    const url = new URL(base, window.location.href);
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return "Termux local";
    return url.hostname;
  } catch {
    return "À configurer";
  }
}

function installStyles() {
  if (document.querySelector("#serverSettingsStyles")) return;
  const style = document.createElement("style");
  style.id = "serverSettingsStyles";
  style.textContent = `
    .server-settings-panel{display:grid;gap:9px;margin-bottom:12px;padding:12px;border:1px solid rgba(18,214,223,.38);border-radius:14px;background:rgba(18,214,223,.085)}
    .server-settings-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0;border:0;color:var(--text);font-weight:900;text-align:left;background:transparent}
    .server-settings-toggle small{color:var(--cyan)}
    .server-settings-body{display:none;gap:9px}.server-settings-panel.open .server-settings-body{display:grid}
    .server-settings-body input{width:100%;box-sizing:border-box}
    .server-settings-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .server-settings-actions button{min-height:40px;padding:8px;border:1px solid var(--line);border-radius:11px;color:var(--text);background:var(--surface)}
    .server-settings-status{min-height:1.2em;margin:0;color:var(--muted);font-size:.76rem;line-height:1.4}
    .server-settings-status.success{color:var(--success)}.server-settings-status.error{color:var(--danger)}
  `;
  document.head.append(style);
}

function bindServerSettings() {
  const panel = document.querySelector("#serverSettingsPanel");
  if (!panel || panel.dataset.ready === "true") return;
  panel.dataset.ready = "true";
  installStyles();

  const input = panel.querySelector("#serverSettingsInput");
  const label = panel.querySelector("#serverSettingsLabel");
  const status = panel.querySelector("#serverSettingsStatus");
  const setStatus = (message, type = "") => {
    status.textContent = message;
    status.className = `server-settings-status ${type}`.trim();
  };
  const refresh = () => {
    const base = activeApiBase();
    input.value = base.startsWith("http") ? base : "";
    label.textContent = serverLabel(base);
  };

  panel.querySelector(".server-settings-toggle").addEventListener("click", () => panel.classList.toggle("open"));

  panel.querySelector("#testServerSettings").addEventListener("click", async () => {
    setStatus("Test du serveur…");
    try {
      input.value = await testApiBase(input.value);
      setStatus("Serveur en ligne. Appuie sur Enregistrer.", "success");
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
      setStatus("Adresse enregistrée. Réessaie maintenant ton compte membre.", "success");
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
      panel.classList.add("open");
      setStatus("Serveur hors ligne. Entre la nouvelle adresse ngrok, ou choisis Termux local.", "error");
    }
  }, 700);
}

window.PixelServerSettings = { activeApiBase, normalizeApiBase, testApiBase };
window.addEventListener("DOMContentLoaded", bindServerSettings);
