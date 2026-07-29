const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const ALLOWED_API_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_API_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "ngrok-skip-browser-warning"
]);
const MAX_API_BODY_BYTES = 12 * 1024 * 1024;
const MAX_UPDATE_FILE_BYTES = 350 * 1024 * 1024;
const UPDATE_UPLOAD_TIMEOUT = 20 * 60 * 1000;
const UPDATE_TARGETS = {
  android: { extension: ".apk", contentType: "application/vnd.android.package-archive", filters: [{ name: "Application Android", extensions: ["apk"] }] },
  "macos-arm64": { extension: ".zip", contentType: "application/zip", filters: [{ name: "Application macOS Apple Silicon", extensions: ["zip"] }] },
  "macos-x64": { extension: ".zip", contentType: "application/zip", filters: [{ name: "Application macOS Intel", extensions: ["zip"] }] },
  "windows-x64": { extension: ".exe", contentType: "application/vnd.microsoft.portable-executable", filters: [{ name: "Installateur Windows 64 bits", extensions: ["exe"] }] }
};

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

function safeUpdateUpload(value, requestedTarget) {
  const safe = safeApiUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const match = url.pathname.match(/^\/api\/admin\/update-files\/(android|macos-arm64|macos-x64|windows-x64)$/);
  if (!match || match[1] !== requestedTarget) return null;
  return { url: url.toString(), target: match[1], config: UPDATE_TARGETS[match[1]] };
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

// Les APK, archives macOS et installateurs Windows dépassent largement la
// limite du relais JSON. Electron ouvre donc un sélecteur natif, puis transmet
// directement le fichier au serveur sous forme de flux, sans le charger en mémoire.
ipcMain.handle("pixel:select-update-file", async (event, request = {}) => {
  const target = String(request.target || "");
  const upload = safeUpdateUpload(request.url, target);
  if (!upload) throw new Error("Adresse d’envoi de mise à jour refusée.");

  const parent = BrowserWindow.fromWebContents(event.sender);
  const selection = await dialog.showOpenDialog(parent || undefined, {
    title: "Choisir le fichier de mise à jour",
    properties: ["openFile"],
    filters: upload.config.filters
  });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };

  const filePath = selection.filePaths[0];
  if (path.extname(filePath).toLowerCase() !== upload.config.extension) {
    throw new Error(`Le fichier choisi doit être au format ${upload.config.extension}.`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile() || !stats.size) throw new Error("Le fichier choisi est vide ou inaccessible.");
  if (stats.size > MAX_UPDATE_FILE_BYTES) throw new Error("Ce fichier dépasse la limite de 350 Mo.");

  const headers = {
    "content-type": upload.config.contentType,
    "content-length": String(stats.size)
  };
  const authorization = String(request.authorization || "").trim();
  if (authorization) headers.authorization = authorization;
  if (upload.url.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_UPLOAD_TIMEOUT);
  try {
    const response = await fetch(upload.url, {
      method: "PUT",
      headers,
      body: fs.createReadStream(filePath),
      duplex: "half",
      signal: controller.signal,
      redirect: "follow"
    });
    const responseBody = await response.text();
    let data = {};
    try {
      data = responseBody ? JSON.parse(responseBody) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(data.error || `Le serveur a refusé le fichier (${response.status}).`);
    }
    return {
      canceled: false,
      filename: path.basename(filePath),
      size: stats.size,
      data
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("L’envoi a dépassé vingt minutes. Vérifie la connexion puis recommence.");
    }
    throw new Error(error?.message || "Impossible d’envoyer le fichier de mise à jour.");
  } finally {
    clearTimeout(timeout);
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    center: true,
    title: "Pixel Everywhere",
    backgroundColor: "#08090c",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
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
