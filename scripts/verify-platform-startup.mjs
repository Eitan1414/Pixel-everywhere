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

const [entry, startupSafety, manualUpdates, macOSPreparation, preload, bootstrap] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/startup-safety.js", "utf8"),
  readFile("web/manual-update-mode.js", "utf8"),
  readFile("scripts/prepare-macos-bundle.mjs", "utf8"),
  readFile("electron/preload.cjs", "utf8"),
  readFile("electron/bootstrap.cjs", "utf8")
]);

requireOrder(
  entry,
  ["startup-safety.js", "app-updater.js", "manual-update-mode.js", "main.js"],
  "L’intro et le gestionnaire manuel doivent être chargés avant le cœur de l’application."
);

forbid(entry, /startup-failsafe\.css/, "Le CSS qui supprimait l’intro est encore chargé.");
forbid(entry, /simple-startup\.js/, "Le script qui supprimait l’intro est encore chargé.");
forbid(entry, /automatic-installer(?:\.css|\.js)/, "L’installation automatique est encore chargée.");

requireMatch(startupSafety, /STARTUP_MAX_DURATION_MS/, "La sécurité de durée de l’intro est absente.");
requireMatch(startupSafety, /reportStartupDismissed/, "La fin de l’intro n’est pas signalée à macOS.");
requireMatch(manualUpdates, /installation:\s*"manual"/, "Le mode d’installation manuelle n’est pas actif.");
requireMatch(manualUpdates, /Télécharger le fichier/, "Le bouton de téléchargement manuel est absent.");
requireMatch(manualUpdates, /introIsVisible/, "La mise à jour peut encore interrompre l’intro.");

requireMatch(macOSPreparation, /startupAnimation/, "Le bundle macOS ne vérifie pas la présence de l’intro.");
requireMatch(macOSPreparation, /PIXEL_MACOS_INTRO_BUNDLE_READY/, "La préparation macOS ne confirme pas l’intro restaurée.");
forbid(macOSPreparation, /#startupAnimation[\s\S]*display:\s*none/, "La préparation macOS masque encore l’intro.");

forbid(preload, /installUpdate/, "Le pont macOS d’installation automatique est encore exposé.");
forbid(preload, /onUpdateProgress/, "Le suivi d’installation automatique macOS est encore exposé.");
forbid(bootstrap, /automatic-updater/, "Le moteur d’installation automatique macOS est encore démarré.");

console.log("PIXEL_INTRO_AND_MANUAL_UPDATES_VERIFIED");