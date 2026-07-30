import { readFile } from "node:fs/promises";

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function forbid(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

const [entry, stability, stabilityCss, manualUpdates, offlineAccess, main] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/native-interaction-stability.js", "utf8"),
  readFile("web/native-interaction-stability.css", "utf8"),
  readFile("web/manual-update-mode.js", "utf8"),
  readFile("web/offline-access.js", "utf8"),
  readFile("web/main.js", "utf8")
]);

requireMatch(entry, /stableNativeRuntime\s*=\s*isAndroid\s*\|\|\s*isMacOS/, "Le mode natif stable Android/macOS est absent.");
requireMatch(entry, /await import\("\.\/app-updater\.js"\)/, "Le système de publication et téléchargement des mises à jour n’est pas chargé.");
requireMatch(entry, /await import\("\.\/manual-update-mode\.js"\)/, "Le mode manuel des mises à jour n’est pas chargé.");
requireMatch(entry, /await import\("\.\/suggestions\.js"\)/, "Suggestions reste exclue du runtime natif.");
requireMatch(entry, /await import\("\.\/creation-studio\.js"\)/, "Création reste exclue du runtime natif.");
requireMatch(entry, /await import\("\.\/announcement-center\.js"\)/, "Le centre d’annonces reste exclu du runtime natif.");
requireMatch(entry, /await import\("\.\/admin-control\.js"\)/, "Le contrôle administrateur reste exclu du runtime natif.");
requireMatch(entry, /await import\("\.\/main\.js"\)/, "Le cœur de l’application n’est pas chargé.");
requireMatch(entry, /await import\("\.\/offline-access\.js"\)/, "Le mode hors ligne n’est pas chargé.");
forbid(entry, /if\s*\(!stableNativeRuntime\)[\s\S]*suggestions\.js/, "Les catégories sont encore enfermées hors d’Android/macOS.");
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

requireMatch(manualUpdates, /installation:\s*"manual"/, "Les mises à jour ne sont pas limitées à l’installation manuelle.");
requireMatch(manualUpdates, /Installer plus tard/, "La fenêtre de mise à jour peut encore bloquer l’application.");
requireMatch(main, /button\.addEventListener\("click",\s*\(\)\s*=>\s*navigate/, "La navigation principale n’est plus reliée aux boutons.");

console.log("PIXEL_NATIVE_NAVIGATION_AND_CATEGORIES_VERIFIED");