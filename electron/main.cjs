const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
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
