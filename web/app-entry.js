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

// Les imports doivent rester écrits littéralement dans ce fichier. Vite peut
// ainsi détecter chaque module et créer les chunks nécessaires aux versions
// Windows, macOS et Android. Un import(path) avec un chemin fourni en texte
// laisserait les catégories hors du bundle Electron.
const moduleLoaders = Object.freeze({
  desktopNetwork: () => import("./desktop-network.js"),
  nativeInteractionStability: () => import("./native-interaction-stability.js"),
  sessionStability: () => import("./session-stability.js"),
  serverSettings: () => import("./server-settings-v2.js"),
  serverRecovery: () => import("./server-recovery.js"),
  appUpdaterStyles: () => import("./app-updater.css"),
  appUpdater: () => import("./app-updater.js"),
  manualUpdateMode: () => import("./manual-update-mode.js"),
  updateUploadDesktop: () => import("./update-upload-desktop.js"),
  desktopLayout: () => import("./desktop-layout.css"),
  windowsSupport: () => import("./windows-support.js"),
  enhancements: () => import("./enhancements.js"),
  pixelLive: () => import("./pixel-live.js"),
  suggestionsStyles: () => import("./suggestions.css"),
  suggestions: () => import("./suggestions.js"),
  adminControlStyles: () => import("./admin-control.css"),
  adminControl: () => import("./admin-control.js"),
  creationStudioStyles: () => import("./creation-studio.css"),
  creationStudio: () => import("./creation-studio.js"),
  creationStudioLazy: () => import("./creation-studio-lazy.js"),
  announcementCenterStyles: () => import("./announcement-center.css"),
  announcementCenter: () => import("./announcement-center.js"),
  announcementSubcategoriesStyles: () => import("./announcement-subcategories.css"),
  announcementSubcategories: () => import("./announcement-subcategories.js"),
  accountDeletionStyles: () => import("./account-deletion.css"),
  accountDeletion: () => import("./account-deletion.js"),
  memberConversationsStyles: () => import("./member-conversations.css"),
  memberConversations: () => import("./member-conversations.js"),
  main: () => import("./main.js"),
  interactionAccessStability: () => import("./interaction-access-stability.js"),
  offlineAccess: () => import("./offline-access.js")
});

async function loadOptional(loader, label) {
  try {
    await loader();
    return true;
  } catch (error) {
    optionalFailures.push({ label, message: error?.message || String(error) });
    console.error(`PIXEL_OPTIONAL_MODULE_FAILED ${label}`, error);
    return false;
  }
}

async function loadCritical(loader, label) {
  try {
    await loader();
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
  // Electron installe son relais réseau avant que la configuration serveur ne
  // capture window.fetch. Windows peut ainsi utiliser le relais IPC si CORS
  // bloque la requête directe du renderer.
  if (isDesktop) {
    await loadOptional(moduleLoaders.desktopNetwork, "relais réseau desktop");
  }

  await loadOptional(moduleLoaders.nativeInteractionStability, "stabilité des interactions natives");
  await loadOptional(moduleLoaders.sessionStability, "stabilité des sessions");
  await loadOptional(moduleLoaders.serverSettings, "configuration du serveur");
  await loadOptional(moduleLoaders.serverRecovery, "récupération du serveur");

  await loadOptional(moduleLoaders.appUpdaterStyles, "styles de mise à jour");
  await loadOptional(moduleLoaders.appUpdater, "système de mise à jour");
  await loadOptional(moduleLoaders.manualUpdateMode, "mode de mise à jour manuel");

  if (isDesktop) {
    await loadOptional(moduleLoaders.updateUploadDesktop, "envoi des mises à jour desktop");
    await loadOptional(moduleLoaders.desktopLayout, "mise en page desktop");
  }
  if (isWindows) {
    await loadOptional(moduleLoaders.windowsSupport, "fonctions Windows");
  }

  // Chaque catégorie est isolée : une erreur dans une fonction avancée ne doit
  // pas empêcher les autres catégories ni l’interface principale de démarrer.
  await loadOptional(moduleLoaders.enhancements, "catégories complémentaires");
  await loadOptional(moduleLoaders.pixelLive, "Pixel en direct");
  await loadOptional(moduleLoaders.suggestionsStyles, "styles des idées");
  await loadOptional(moduleLoaders.suggestions, "catégorie Idées");
  await loadOptional(moduleLoaders.adminControlStyles, "styles administrateur");
  await loadOptional(moduleLoaders.adminControl, "contrôle administrateur");
  await loadOptional(moduleLoaders.creationStudioStyles, "styles du studio de création");
  await loadOptional(moduleLoaders.creationStudio, "studio de création");
  await loadOptional(moduleLoaders.creationStudioLazy, "chargement différé du studio");
  await loadOptional(moduleLoaders.announcementCenterStyles, "styles du centre d’annonces");
  await loadOptional(moduleLoaders.announcementCenter, "centre d’annonces");
  await loadOptional(moduleLoaders.announcementSubcategoriesStyles, "styles des sous-catégories d’annonces");
  await loadOptional(moduleLoaders.announcementSubcategories, "sous-catégories d’annonces");
  await loadOptional(moduleLoaders.accountDeletionStyles, "styles de suppression du compte");
  await loadOptional(moduleLoaders.accountDeletion, "suppression du compte");
  await loadOptional(moduleLoaders.memberConversationsStyles, "styles de la messagerie privée");

  // main.js est critique : il active la navigation, les boutons, les comptes,
  // Pixel et les fonctions de base.
  await loadCritical(moduleLoaders.main, "Interface principale");

  // La messagerie s’installe après main.js afin de réutiliser l’interface et les
  // sessions déjà initialisées, sans demander un second compte aux membres du staff.
  await loadOptional(moduleLoaders.memberConversations, "messagerie membres et staff");

  // Ces protections s’installent après main.js afin de corriger ses anciens
  // gestionnaires sans bloquer le démarrage si elles échouent.
  await loadOptional(moduleLoaders.interactionAccessStability, "stabilité des accès et interactions");
  await loadOptional(moduleLoaders.offlineAccess, "accès hors ligne");

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
