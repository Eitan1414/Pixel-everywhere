const { app, ipcMain } = require("electron");

const guardedWindows = new WeakSet();
const failedWindows = new WeakSet();

function safeShow(window) {
  if (!window || window.isDestroyed()) return;
  if (!window.isVisible()) window.show();
}

function loadFailurePage(window, reason) {
  if (!window || window.isDestroyed() || failedWindows.has(window)) return;
  failedWindows.add(window);
  const safeReason = String(reason || "Erreur inconnue").slice(0, 600);
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pixel Everywhere</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #08090c; color: #f6f7fb; }
    main { width: min(560px, calc(100% - 40px)); padding: 28px; border: 1px solid #2a2d36; border-radius: 22px; background: #12141a; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    p { color: #b9bec9; line-height: 1.55; }
    code { display: block; margin: 16px 0; padding: 12px; border-radius: 12px; background: #090b0f; color: #ffb37f; white-space: pre-wrap; overflow-wrap: anywhere; }
    button { width: 100%; padding: 13px 16px; border: 0; border-radius: 13px; font-weight: 800; background: #ff6b19; color: #15100b; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>Pixel Everywhere n’a pas pu charger l’interface</h1>
    <p>L’application reste accessible au lieu d’afficher un écran noir. Relance le chargement ci-dessous.</p>
    <code>${safeReason.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character])}</code>
    <button onclick="location.reload()">Réessayer</button>
  </main>
</body>
</html>`;
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
  safeShow(window);
}

function guardWindow(window) {
  if (!window || guardedWindows.has(window)) return;
  guardedWindows.add(window);

  window.once("ready-to-show", () => safeShow(window));
  window.webContents.once("did-finish-load", () => safeShow(window));
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false || errorCode === -3) return;
      loadFailurePage(window, `${errorDescription} (${errorCode})\n${validatedURL || ""}`);
    }
  );
  window.webContents.on("render-process-gone", (_event, details) => {
    loadFailurePage(window, `Le moteur d’affichage s’est arrêté : ${details?.reason || "inconnu"}.`);
  });
  window.on("unresponsive", () => safeShow(window));

  const revealTimer = setTimeout(() => safeShow(window), 2500);
  revealTimer.unref?.();
}

ipcMain.on("pixel:renderer-ready", (event) => {
  console.log(`PIXEL_RENDERER_READY ${event.sender.getURL()}`);
});

ipcMain.on("pixel:renderer-error", (_event, details = {}) => {
  console.error("PIXEL_RENDERER_ERROR", details.message || "Erreur renderer", details.stack || "");
});

app.on("browser-window-created", (_event, window) => guardWindow(window));

module.exports = { guardWindow, loadFailurePage };
