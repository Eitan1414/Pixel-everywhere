const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

const ALLOWED_API_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_API_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "ngrok-skip-browser-warning"
]);
const MAX_API_BODY_BYTES = 12 * 1024 * 1024;

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeApiUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const apiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    return ["http:", "https:"].includes(url.protocol) && apiPath ? url.toString() : "";
  } catch {
    return "";
  }
}

ipcMain.handle("pixel:get-runtime", () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion()
}));

ipcMain.handle("pixel:open-external", async (_event, value) => {
  const url = safeExternalUrl(value);
  if (!url) throw new Error("Lien de mise à jour invalide.");
  await shell.openExternal(url);
  return { ok: true };
});

// Le renderer Electron est chargé depuis file:// et possède donc une origine
// opaque (« null »). Certains serveurs/proxys refusent alors la requête avant
// même que la connexion au compte soit vérifiée. Ce relais ne s'active qu'en
// secours et n'accepte que les routes /api de Pixel Everywhere.
ipcMain.handle("pixel:api-request", async (_event, request = {}) => {
  const url = safeApiUrl(request.url);
  if (!url) throw new Error("Adresse API refusée par Pixel Everywhere.");

  const method = String(request.method || "GET").toUpperCase();
  if (!ALLOWED_API_METHODS.has(method)) {
    throw new Error("Méthode API non autorisée.");
  }

  const body = request.body == null ? undefined : String(request.body);
  if (body && Buffer.byteLength(body, "utf8") > MAX_API_BODY_BYTES) {
    throw new Error("La requête est trop volumineuse.");
  }

  const headers = {};
  Object.entries(request.headers || {}).forEach(([name, value]) => {
    const normalized = String(name).toLowerCase();
    if (ALLOWED_API_HEADERS.has(normalized) && value != null) {
      headers[normalized] = String(value);
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
      signal: controller.signal,
      redirect: "follow"
    });
    const responseBody = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Le serveur PDD met trop de temps à répondre.");
    }
    throw new Error(error?.message || "Connexion au serveur PDD impossible.");
  } finally {
    clearTimeout(timeout);
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 460,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: "Pixel Everywhere",
    backgroundColor: "#08090c",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    const external = safeExternalUrl(url);
    if (external) shell.openExternal(external);
    return { action: "deny" };
  });

  window.loadFile(path.join(__dirname, "..", "www", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});