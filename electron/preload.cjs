const { contextBridge, ipcRenderer } = require("electron");

let rendererReady = false;

function rendererErrorDetails(value) {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack || "" };
  }
  return { message: String(value || "Erreur renderer"), stack: "" };
}

function revealStartupFallback() {
  if (rendererReady) return;
  const startup = document.querySelector("#startupAnimation");
  if (startup) startup.hidden = true;
  document.body?.classList.remove("startup-running");

  if (document.querySelector("#pixelRendererFallback")) return;
  const notice = document.createElement("section");
  notice.id = "pixelRendererFallback";
  notice.setAttribute("role", "alert");
  notice.style.cssText = [
    "position:fixed",
    "inset:20px",
    "z-index:2147483647",
    "display:grid",
    "place-items:center",
    "padding:24px",
    "border:1px solid #343844",
    "border-radius:20px",
    "background:#101218",
    "color:#f6f7fb",
    "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "text-align:center"
  ].join(";");
  notice.innerHTML = `
    <div style="max-width:520px">
      <h2 style="margin:0 0 12px">Le chargement de Pixel Everywhere a échoué</h2>
      <p style="margin:0 0 18px;color:#b9bec9;line-height:1.55">L’écran noir a été interrompu automatiquement. Relance l’interface pour réessayer.</p>
      <button id="pixelRendererReload" style="width:100%;padding:13px 16px;border:0;border-radius:13px;background:#ff6b19;color:#15100b;font-weight:800;cursor:pointer">Recharger l’application</button>
    </div>`;
  document.body?.append(notice);
  notice.querySelector("#pixelRendererReload")?.addEventListener("click", () => window.location.reload());
}

window.addEventListener("error", (event) => {
  ipcRenderer.send("pixel:renderer-error", rendererErrorDetails(event.error || event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("pixel:renderer-error", rendererErrorDetails(event.reason));
});
window.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(revealStartupFallback, 5000);
});

contextBridge.exposeInMainWorld("pixelDesktop", {
  getRuntime: () => ipcRenderer.invoke("pixel:get-runtime"),
  openExternal: (url) => ipcRenderer.invoke("pixel:open-external", url),
  apiRequest: (request) => ipcRenderer.invoke("pixel:api-request", request),
  selectUpdateFile: (request) => ipcRenderer.invoke("pixel:select-update-file", request),
  installUpdate: (request) => ipcRenderer.invoke("pixel:install-update", request),
  reportRendererReady: () => {
    rendererReady = true;
    ipcRenderer.send("pixel:renderer-ready");
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pixel:update-progress", listener);
    return () => ipcRenderer.removeListener("pixel:update-progress", listener);
  }
});
