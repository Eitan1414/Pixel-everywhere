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

const [entry, simpleStartup, startupCss, manualUpdates, preload, bootstrap] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/simple-startup.js", "utf8"),
  readFile("web/startup-failsafe.css", "utf8"),
  readFile("web/manual-update-mode.js", "utf8"),
  readFile("electron/preload.cjs", "utf8"),
  readFile("electron/bootstrap.cjs", "utf8")
]);

requireOrder(
  entry,
  ["startup-failsafe.css", "simple-startup.js", "app-updater.js", "manual-update-mode.js", "main.js"],
  "Le démarrage direct et le gestionnaire manuel doivent précéder le cœur de l’application."
);

requireMatch(entry, /enhancements\.js/, "Les améliorations générales ne sont pas chargées.");
requireMatch(entry, /suggestions\.js/, "La catégorie Suggestions n’est pas chargée.");
requireMatch(entry, /creation-studio\.js/, "La catégorie Création n’est pas chargée.");
requireMatch(entry, /announcement-center\.js/, "Le centre d’annonces n’est pas chargé.");
requireMatch(entry, /announcement-subcategories\.js/, "Les sous-catégories d’annonces ne sont pas chargées.");
requireMatch(entry, /admin-control\.js/, "Le contrôle administrateur n’est pas chargé.");
requireMatch(entry, /account-deletion\.js/, "La gestion complète des comptes n’est pas chargée.");
requireMatch(entry, /pixelCategoriesRestored/, "Le runtime ne confirme pas la restauration des catégories.");

requireMatch(simpleStartup, /startupAnimation/, "Le script de démarrage direct ne retire pas l’intro.");
requireMatch(simpleStartup, /startup-running/, "Le démarrage direct ne libère pas l’interface.");
requireMatch(startupCss, /#startupAnimation[\s\S]*display:\s*none/, "Le CSS ne masque pas immédiatement l’intro.");
forbid(entry, /startup-safety\.js/, "L’ancienne animation est encore démarrée.");
forbid(entry, /automatic-installer(?:\.css|\.js)/, "L’installation automatique est encore chargée.");

requireMatch(manualUpdates, /installation:\s*"manual"/, "Le mode d’installation manuelle n’est pas actif.");
requireMatch(manualUpdates, /Télécharger le fichier/, "Le bouton de téléchargement manuel est absent.");
forbid(preload, /installUpdate/, "Le pont macOS d’installation automatique est encore exposé.");
forbid(preload, /onUpdateProgress/, "Le suivi d’installation automatique macOS est encore exposé.");
forbid(bootstrap, /automatic-updater/, "Le moteur d’installation automatique macOS est encore démarré.");

console.log("PIXEL_DIRECT_START_AND_CATEGORIES_VERIFIED");