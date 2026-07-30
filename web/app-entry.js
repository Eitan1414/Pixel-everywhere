import "./startup-failsafe.css";
import "./simple-startup.js";
import "./native-interaction-stability.css";

const userAgent = navigator.userAgent || "";
const platform = navigator.platform || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);
const isMacOS = Boolean(window.pixelDesktop) && /Mac/i.test(`${platform} ${userAgent}`);
const stableNativeRuntime = isAndroid || isMacOS;

async function loadModules(paths) {
  for (const path of paths) await import(path);
}

async function bootPixelEverywhere() {
  if (isMacOS) await import("./desktop-network.js");
  await import("./native-interaction-stability.js");

  await loadModules([
    "./session-stability.js",
    "./server-settings-v2.js",
    "./server-recovery.js"
  ]);

  if (!stableNativeRuntime) {
    await loadModules([
      "./desktop-network.js",
      "./windows-support.js",
      "./app-updater.css",
      "./automatic-installer.css",
      "./automatic-installer.js",
      "./app-updater.js",
      "./update-upload-desktop.js",
      "./enhancements.js",
      "./pixel-live.js",
      "./suggestions.css",
      "./suggestions.js",
      "./admin-control.css",
      "./admin-control.js",
      "./creation-studio.css",
      "./creation-studio.js",
      "./creation-studio-lazy.js",
      "./desktop-layout.css",
      "./announcement-center.css",
      "./announcement-center.js",
      "./announcement-subcategories.css",
      "./announcement-subcategories.js",
      "./account-deletion.css",
      "./account-deletion.js"
    ]);
  } else if (isMacOS) {
    await import("./desktop-layout.css");
  }

  await import("./main.js");
  await import("./offline-access.js");

  document.documentElement.dataset.pixelRuntimeReady = "true";
  window.pixelDesktop?.reportRendererReady?.();
}

bootPixelEverywhere().catch((error) => {
  console.error("PIXEL_RUNTIME_BOOT_FAILED", error);
  document.documentElement.dataset.pixelRuntimeReady = "failed";
  const notice = document.createElement("section");
  notice.id = "pixelRuntimeFailure";
  notice.setAttribute("role", "alert");
  notice.innerHTML = `
    <div>
      <strong>Pixel Everywhere n’a pas pu terminer son chargement.</strong>
      <p>${error?.message || "Erreur inconnue"}</p>
      <button type="button">Recharger l’application</button>
    </div>`;
  notice.querySelector("button")?.addEventListener("click", () => window.location.reload());
  document.body?.append(notice);
});
