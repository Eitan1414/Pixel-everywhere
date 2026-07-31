import "./startup-failsafe.css";
import "./android-startup.css";
import "./simple-startup.js";
import "./android-startup.js";
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

  // Ces modules créent les catégories et fonctions complémentaires.
  // Ils doivent être chargés aussi sur Android et macOS.
  await import("./enhancements.js");
  await import("./pixel-live.js");
  await import("./suggestions.css");
  await import("./suggestions.js");
  await import("./admin-control.css");
  await import("./admin-control.js");
  await import("./creation-studio.css");
  await import("./creation-studio.js");
  await import("./creation-studio-lazy.js");
  await import("./announcement-center.css");
  await import("./announcement-center.js");
  await import("./announcement-subcategories.css");
  await import("./announcement-subcategories.js");
  await import("./account-deletion.css");
  await import("./account-deletion.js");

  if (!stableNativeRuntime) {
    await import("./desktop-network.js");
    await import("./windows-support.js");
    await import("./update-upload-desktop.js");
    await import("./desktop-layout.css");
  }

  await import("./main.js");
  // Doit être chargé après main.js afin d’intercepter l’ancien swipe Tamagotchi
  // et de sécuriser l’accès aux panneaux de modération dynamiques.
  await import("./interaction-access-stability.js");
  await import("./offline-access.js");

  document.documentElement.dataset.pixelRuntimeReady = "true";
  document.documentElement.dataset.pixelCategoriesRestored = "true";
  document.documentElement.dataset.pixelInteractionAccessStable = "true";
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