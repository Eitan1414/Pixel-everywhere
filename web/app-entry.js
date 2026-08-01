import "./startup-failsafe.css";
import "./android-startup.css";
import "./simple-startup.js";
import "./android-startup.js";
import "./native-interaction-stability.css";

const userAgent = navigator.userAgent || "";
const platform = navigator.platform || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);
const isDesktop = Boolean(window.pixelDesktop);
const isMacOS = isDesktop && /Mac/i.test(`${platform} ${userAgent}`);
const isWindows = isDesktop && !isMacOS;
const optionalFailures = [];

async function loadOptional(path, label) {
  try {
    await import(path);
    return true;
  } catch (error) {
    optionalFailures.push({ label, message: error?.message || String(error) });
    console.error(`PIXEL_OPTIONAL_MODULE_FAILED ${label}`, error);
    return false;
  }
}

async function loadCritical(path, label) {
  try {
    await import(path);
  } catch (error) {
    const message = error?.message || String(error);
    throw new Error(`${label} : ${message}`, { cause: error });
  }
}

function exposeBootState() {
  document.documentElement.dataset.pixelRuntimeReady = "true";
  document.documentElement.dataset.pixelCategoriesRestored = "true";
  document.documentElement.dataset.pixelInteractionAccessStable = "true";
  document.documentElement.dataset.pixelRuntime = isAndroid
    ? "android"
    : isMacOS
      ? "macos"
      : isWindows
        ? "windows"
        : "web";

  if (optionalFailures.length) {
    document.documentElement.dataset.pixelOptionalFailures = String(optionalFailures.length);
    console.warn("PIXEL_OPTIONAL_MODULE_FAILURES", optionalFailures);
  }
}

async function bootPixelEverywhere() {
  // Electron doit installer son relais réseau avant que server-settings-v2.js
  // capture window.fetch. Sans cela, Windows utilise le fetch du renderer et
  // peut être bloqué par CORS alors que le relais IPC fonctionne.
  if (isDesktop) {
    await loadOptional("./desktop-network.js", "relais réseau desktop");
  }

  await loadOptional("./native-interaction-stability.js", "stabilité des interactions natives");
  await loadOptional("./session-stability.js", "stabilité des sessions");
  await loadOptional("./server-settings-v2.js", "configuration du serveur");
  await loadOptional("./server-recovery.js", "récupération du serveur");

  await loadOptional("./app-updater.css", "styles de mise à jour");
  await loadOptional("./app-updater.js", "système de mise à jour");
  await loadOptional("./manual-update-mode.js", "mode de mise à jour manuel");

  if (isDesktop) {
    await loadOptional("./update-upload-desktop.js", "envoi des mises à jour desktop");
    await loadOptional("./desktop-layout.css", "mise en page desktop");
  }
  if (isWindows) {
    await loadOptional("./windows-support.js", "fonctions Windows");
  }

  // Chaque catégorie est isolée : une erreur dans une fonction avancée ne doit
  // plus empêcher les autres catégories ni l’interface principale de démarrer.
  await loadOptional("./enhancements.js", "catégories complémentaires");
  await loadOptional("./pixel-live.js", "Pixel en direct");
  await loadOptional("./suggestions.css", "styles des idées");
  await loadOptional("./suggestions.js", "catégorie Idées");
  await loadOptional("./admin-control.css", "styles administrateur");
  await loadOptional("./admin-control.js", "contrôle administrateur");
  await loadOptional("./creation-studio.css", "styles du studio de création");
  await loadOptional("./creation-studio.js", "studio de création");
  await loadOptional("./creation-studio-lazy.js", "chargement différé du studio");
  await loadOptional("./announcement-center.css", "styles du centre d’annonces");
  await loadOptional("./announcement-center.js", "centre d’annonces");
  await loadOptional("./announcement-subcategories.css", "styles des sous-catégories d’annonces");
  await loadOptional("./announcement-subcategories.js", "sous-catégories d’annonces");
  await loadOptional("./account-deletion.css", "styles de suppression du compte");
  await loadOptional("./account-deletion.js", "suppression du compte");

  // main.js est le seul module critique : il active la navigation, les boutons,
  // les comptes, Pixel et les fonctions de base.
  await loadCritical("./main.js", "Interface principale");

  // Ces protections doivent s’installer après main.js afin de pouvoir corriger
  // ses anciens gestionnaires sans empêcher le démarrage si elles échouent.
  await loadOptional("./interaction-access-stability.js", "stabilité des accès et interactions");
  await loadOptional("./offline-access.js", "accès hors ligne");

  exposeBootState();
  window.pixelDesktop?.reportRendererReady?.();
}

bootPixelEverywhere().catch((error) => {
  console.error("PIXEL_RUNTIME_BOOT_FAILED", error);
  document.documentElement.dataset.pixelRuntimeReady = "failed";
  document.body?.classList.remove("startup-running");
  document.querySelector("#startupAnimation")?.remove();

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
