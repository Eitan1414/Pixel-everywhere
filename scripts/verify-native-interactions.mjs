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

// Architecture native actuelle : Android, macOS et Windows sont détectés
// séparément. Les modules secondaires sont tolérants aux erreurs, tandis que
// main.js reste critique pour garantir une interface réellement interactive.
requireMatch(entry, /const isAndroid\s*=\s*/, "La détection Android est absente.");
requireMatch(entry, /const isDesktop\s*=\s*Boolean\(window\.pixelDesktop\)/, "La détection Electron desktop est absente.");
requireMatch(entry, /const isMacOS\s*=\s*isDesktop\s*&&/, "La détection macOS est absente.");
requireMatch(entry, /const isWindows\s*=\s*isDesktop\s*&&\s*!isMacOS/, "La détection Windows est absente.");
requireMatch(entry, /async function loadOptional\(/, "Le chargement tolérant des modules secondaires est absent.");
requireMatch(entry, /async function loadCritical\(/, "Le chargement critique de l’interface principale est absent.");
requireMatch(entry, /PIXEL_OPTIONAL_MODULE_FAILED/, "Le diagnostic des modules secondaires est absent.");

requireMatch(entry, /loadOptional\("\.\/desktop-network\.js"/, "Le relais réseau desktop n’est pas chargé.");
requireMatch(entry, /loadOptional\("\.\/server-settings-v2\.js"/, "La configuration du serveur n’est pas chargée.");
requireOrder(
  entry,
  [
    'loadOptional("./desktop-network.js"',
    'loadOptional("./server-settings-v2.js"'
  ],
  "Le relais réseau Electron doit être installé avant la configuration serveur."
);

requireMatch(entry, /loadOptional\("\.\/app-updater\.js"/, "Le système de publication et téléchargement des mises à jour n’est pas chargé.");
requireMatch(entry, /loadOptional\("\.\/manual-update-mode\.js"/, "Le mode manuel des mises à jour n’est pas chargé.");
requireMatch(entry, /loadOptional\("\.\/suggestions\.js"/, "La catégorie Idées/Suggestions n’est pas chargée.");
requireMatch(entry, /loadOptional\("\.\/creation-studio\.js"/, "La catégorie Création n’est pas chargée.");
requireMatch(entry, /loadOptional\("\.\/announcement-center\.js"/, "Le centre d’annonces n’est pas chargé.");
requireMatch(entry, /loadOptional\("\.\/admin-control\.js"/, "Le contrôle administrateur n’est pas chargé.");
requireMatch(entry, /loadOptional\("\.\/windows-support\.js"/, "Les fonctions Windows ne sont pas chargées.");
requireMatch(entry, /loadCritical\("\.\/main\.js"/, "Le cœur interactif de l’application n’est pas chargé comme module critique.");
requireMatch(entry, /loadOptional\("\.\/interaction-access-stability\.js"/, "La protection scroll/modération n’est pas chargée.");
requireMatch(entry, /loadOptional\("\.\/offline-access\.js"/, "Le mode hors ligne n’est pas chargé.");
requireOrder(
  entry,
  [
    'loadCritical("./main.js"',
    'loadOptional("./interaction-access-stability.js"',
    'loadOptional("./offline-access.js"'
  ],
  "La protection du swipe doit être installée après l’ancien gestionnaire de main.js."
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
