import "./startup-safety.js";
import "./native-interaction-stability.css";

const userAgent = navigator.userAgent || "";
const platform = navigator.platform || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);
const isMacOS = Boolean(window.pixelDesktop) && /Mac/i.test(`${platform} ${userAgent}`);
const stableNativeRuntime = isAndroid || isMacOS;

async function bootPixelEverywhere() {
  if (isMacOS) await import("./desktop-network.js");

  await import("./native-interaction-stability.js");
  await import("./session-stability.js");
  await import("./server-settings-v2.js");
  await import("./server-recovery.js");

  await import("./app-updater.css");
  await import("./app-updater.js");
  await import("./manual-update-mode.js");

  if (isMacOS) {
    await import("./update-upload-desktop.js");
    await import("./desktop-layout.css");
  }

  if (!stableNativeRuntime) {
    await import("./desktop-network.js");
    await import("./windows-support.js");
    await import("./update-upload-desktop.js");

    await import("./startup-original-preserver.js");
    await import("./enhancements.js");
    await import("./startup-original-restorer.js");

    await import("./pixel-live.js");
    await import("./suggestions.css");
    await import("./suggestions.js");
    await import("./admin-control.css");
    await import("./admin-control.js");
    await import("./creation-studio.css");
    await import("./creation-studio.js");
    await import("./creation-studio-lazy.js");
    await import("./desktop-layout.css");
    await import("./announcement-center.css");
    await import("./announcement-center.js");
    await import("./announcement-subcategories.css");
    await import("./announcement-subcategories.js");
    await import("./account-deletion.css");
    await import("./account-deletion.js");
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