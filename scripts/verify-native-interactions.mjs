import { readFile } from "node:fs/promises";

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function forbid(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function requireOrder(value, tokens, message) {
  let previous = -1;
  for (const token of tokens) {
    const index = value.indexOf(token);
    if (index < 0 || index <= previous) throw new Error(message);
    previous = index;
  }
}

const [
  entry,
  stability,
  stabilityCss,
  manualUpdates,
  offlineAccess,
  serverSettings,
  interactionAccess,
  main
] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/native-interaction-stability.js", "utf8"),
  readFile("web/native-interaction-stability.css", "utf8"),
  readFile("web/manual-update-mode.js", "utf8"),
  readFile("web/offline-access.js", "utf8"),
  readFile("web/server-settings-v2.js", "utf8"),
  readFile("web/interaction-access-stability.js", "utf8"),
  readFile("web/main.js", "utf8")
]);

// Architecture native actuelle : chaque import dynamique est déclaré avec un
// chemin littéral dans moduleLoaders afin que Vite crée réellement les chunks.
requireMatch(entry, /const isAndroid\s*=\s*/, "La détection Android est absente.");
requireMatch(entry, /const isDesktop\s*=\s*Boolean\(window\.pixelDesktop\)/, "La détection Electron desktop est absente.");
requireMatch(entry, /const isMacOS\s*=\s*isDesktop\s*&&/, "La détection macOS est absente.");
requireMatch(entry, /const isWindows\s*=\s*isDesktop\s*&&\s*!isMacOS/, "La détection Windows est absente.");
requireMatch(entry, /const moduleLoaders\s*=\s*Object\.freeze\(/, "La table des imports Vite est absente.");
requireMatch(entry, /async function loadOptional\(loader,\s*label\)/, "Le chargement tolérant des modules secondaires est absent.");
requireMatch(entry, /async function loadCritical\(loader,\s*label\)/, "Le chargement critique de l’interface principale est absent.");
requireMatch(entry, /PIXEL_OPTIONAL_MODULE_FAILED/, "Le diagnostic des modules secondaires est absent.");
forbid(entry, /await\s+import\(path\)/, "Un import dynamique non analysable par Vite est encore présent.");

const literalImports = [
  ["desktopNetwork", "desktop-network.js", "Le relais réseau desktop"],
  ["serverSettings", "server-settings-v2.js", "La configuration serveur"],
  ["appUpdater", "app-updater.js", "Le système de mise à jour"],
  ["manualUpdateMode", "manual-update-mode.js", "Le mode manuel des mises à jour"],
  ["suggestions", "suggestions.js", "La catégorie Idées/Suggestions"],
  ["creationStudio", "creation-studio.js", "La catégorie Création"],
  ["announcementCenter", "announcement-center.js", "Le centre d’annonces"],
  ["adminControl", "admin-control.js", "Le contrôle administrateur"],
  ["windowsSupport", "windows-support.js", "Les fonctions Windows"],
  ["main", "main.js", "Le cœur interactif"],
  ["interactionAccessStability", "interaction-access-stability.js", "La protection scroll/modération"],
  ["offlineAccess", "offline-access.js", "Le mode hors ligne"]
];

for (const [key, file, label] of literalImports) {
  const pattern = new RegExp(`${key}\\s*:\\s*\\(\\)\\s*=>\\s*import\\(\\"\\.\\/${file.replaceAll(".", "\\.")}\\"\\)`);
  requireMatch(entry, pattern, `${label} n’est pas déclaré avec un import littéral Vite.`);
}

requireOrder(
  entry,
  [
    "loadOptional(moduleLoaders.desktopNetwork",
    "loadOptional(moduleLoaders.serverSettings"
  ],
  "Le relais réseau Electron doit être installé avant la configuration serveur."
);
requireOrder(
  entry,
  [
    "loadCritical(moduleLoaders.main",
    "loadOptional(moduleLoaders.interactionAccessStability",
    "loadOptional(moduleLoaders.offlineAccess"
  ],
  "La protection du swipe doit être installée après l’interface principale."
);
requireMatch(entry, /dataset\.pixelRuntime\s*=\s*isAndroid/, "Le runtime natif actif n’est pas exposé pour le diagnostic.");
requireMatch(entry, /document\.body\?\.classList\.remove\("startup-running"\)/, "Le démarrage en erreur peut encore laisser une couche bloquante.");
requireMatch(entry, /document\.querySelector\("#startupAnimation"\)\?\.remove\(\)/, "L’animation de démarrage n’est pas retirée lors d’une erreur critique.");
forbid(entry, /stableNativeRuntime/, "L’ancien mode natif global obsolète est encore présent.");
forbid(entry, /automatic-installer/, "L’installation automatique est encore chargée dans le runtime.");

requireMatch(stability, /serverStatusDialog/, "La fenêtre serveur n’est pas stabilisée.");
requireMatch(stability, /this\.show\(\)/, "L’alerte serveur doit être non modale.");
requireMatch(stability, /10_000/, "Le délai réseau de sécurité est absent.");
requireMatch(stability, /behavior:\s*"auto"/, "Le défilement natif instantané est absent.");

requireMatch(stabilityCss, /touch-action:\s*manipulation/, "La protection tactile est absente.");
requireMatch(stabilityCss, /backdrop-filter:\s*none\s*!important/, "Le flou GPU des dialogues n’est pas désactivé.");
requireMatch(stabilityCss, /data-non-blocking/, "Le style non bloquant du statut serveur est absent.");

requireMatch(offlineAccess, /setTextIfChanged/, "La fenêtre serveur réécrit encore ses textes sans protection.");
requireMatch(offlineAccess, /if\s*\(decorating\)\s*return/, "La protection contre les appels récursifs est absente.");
requireMatch(offlineAccess, /decorationQueued/, "Les mutations serveur ne sont pas regroupées par frame.");
forbid(offlineAccess, /closeButton\.textContent\s*=\s*"Continuer hors ligne"/, "Une écriture non conditionnelle peut recréer la boucle de gel.");

requireMatch(serverSettings, /document\.readyState\s*===\s*"loading"/, "Les boutons serveur dépendent encore uniquement d’un DOMContentLoaded déjà passé.");
requireMatch(serverSettings, /startServerSettingsBinding/, "Le panneau serveur n’est pas retenté s’il arrive tard.");
requireMatch(serverSettings, /testLocalTermux/, "Le bouton Termux local n’a pas de test dédié.");
requireMatch(serverSettings, /127\.0\.0\.1:3000\/api/, "L’adresse Termux locale attendue est absente.");
requireMatch(serverSettings, /Les comptes et la modération utilisent maintenant ce serveur/, "La sauvegarde serveur ne confirme pas l’accès à la modération.");

requireMatch(interactionAccess, /horizontalDistance\s*>\s*verticalDistance\s*\*\s*1\.8/, "Le swipe Pixel ne distingue pas assez le scroll vertical.");
requireMatch(interactionAccess, /pageScrolled/, "Le swipe Pixel ne vérifie pas le déplacement réel de la page.");
requireMatch(interactionAccess, /stopLegacyPixelSwipe/, "L’ancien swipe Pixel n’est pas neutralisé pendant un scroll.");
requireMatch(interactionAccess, /moderationAccessButton/, "Le raccourci Modération est absent.");
requireMatch(interactionAccess, /delegatedModerationTabs/, "Les onglets de modération dynamiques ne sont pas pris en charge.");
requireMatch(interactionAccess, /data-guide-page=\"staff\"/, "Le raccourci ne passe pas par l’ouverture officielle de l’espace staff.");

requireMatch(manualUpdates, /installation:\s*"manual"/, "Les mises à jour ne sont pas limitées à l’installation manuelle.");
requireMatch(manualUpdates, /Installer plus tard/, "La fenêtre de mise à jour peut encore bloquer l’application.");
requireMatch(main, /button\.addEventListener\("click",\s*\(\)\s*=>\s*navigate/, "La navigation principale n’est plus reliée aux boutons.");

console.log("PIXEL_NATIVE_ANDROID_MACOS_WINDOWS_INTERACTIONS_VERIFIED");
