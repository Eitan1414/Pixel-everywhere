const { contextBridge, ipcRenderer, webFrame } = require("electron");

const isMacOS = process.platform === "darwin";
let rendererReady = false;
let startupDismissed = false;

if (isMacOS) {
  try {
    webFrame.insertCSS(`
      html,
      body {
        background: #08090c !important;
      }

      #startupAnimation {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        animation: none !important;
      }

      body.startup-running {
        overflow-x: hidden !important;
        overflow-y: auto !important;
      }

      body.startup-running .app-shell,
      .app-shell {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        animation: none !important;
      }
    `);
  } catch (error) {
    ipcRenderer.send("pixel:renderer-error", {
      message: `Impossible d’injecter la protection macOS : ${error?.message || String(error)}`,
      stack: error?.stack || ""
    });
  }
}

function rendererErrorDetails(value) {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack || "" };
  }
  return { message: String(value || "Erreur renderer"), stack: "" };
}

function reportStartupDismissed(details = {}) {
  if (startupDismissed) return;
  startupDismissed = true;
  const reason = typeof details === "string" ? details : details?.reason || "unknown";
  ipcRenderer.send("pixel:startup-dismissed", { reason });
}

function disableMacOSStartup() {
  if (!isMacOS) return;

  const startup = document.querySelector("#startupAnimation");
  const shell = document.querySelector(".app-shell");

  document.documentElement.classList.add("pixel-macos-no-intro");
  document.body?.classList.remove("startup-running");
  startup?.remove();

  if (shell) {
    shell.style.setProperty("display", "block", "important");
    shell.style.setProperty("visibility", "visible", "important");
    shell.style.setProperty("opacity", "1", "important");
    shell.style.setProperty("animation", "none", "important");
  }

  const computed = shell ? window.getComputedStyle(shell) : null;
  const details = {
    visible: Boolean(
      shell &&
      !document.querySelector("#startupAnimation") &&
      computed?.display !== "none" &&
      computed?.visibility !== "hidden" &&
      Number.parseFloat(computed?.opacity || "0") > 0
    ),
    rendererReady,
    startupPresent: Boolean(document.querySelector("#startupAnimation")),
    display: computed?.display || "missing",
    visibility: computed?.visibility || "missing",
    opacity: computed?.opacity || "missing"
  };

  reportStartupDismissed("macos-intro-disabled");
  ipcRenderer.send("pixel:macos-ui-visible", details);
}

function revealStartupFallback() {
  if (startupDismissed) return;

  const startup = document.querySelector("#startupAnimation");
  if (startup && !startup.hidden) {
    startup.classList.add("leaving");
    startup.setAttribute("aria-hidden", "true");
    startup.style.pointerEvents = "none";
    startup.hidden = true;
    startup.style.display = "none";
  }
  document.body?.classList.remove("startup-running");
  reportStartupDismissed({ reason: rendererReady ? "preload-timeout" : "renderer-failure" });

  if (rendererReady || document.querySelector("#pixelRendererFallback")) return;
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
  if (isMacOS) {
    disableMacOSStartup();
    return;
  }
  window.setTimeout(revealStartupFallback, 10_000);
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
  reportStartupDismissed,
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pixel:update-progress", listener);
    return () => ipcRenderer.removeListener("pixel:update-progress", listener);
  }
});
