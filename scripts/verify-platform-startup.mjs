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

const [entry, simpleStartup, failsafe, macOSPreparation] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/simple-startup.js", "utf8"),
  readFile("web/startup-failsafe.css", "utf8"),
  readFile("scripts/prepare-macos-bundle.mjs", "utf8")
]);

requireOrder(
  entry,
  ["startup-failsafe.css", "simple-startup.js", "enhancements.js", "main.js"],
  "Le démarrage simple doit être installé avant le reste de l’application."
);

forbid(entry, /startup-safety\.js/, "L’ancien minuteur d’intro est encore chargé.");
forbid(entry, /startup-original-preserver\.js/, "L’ancien système de conservation de l’intro est encore chargé.");
forbid(entry, /startup-original-restorer\.js/, "L’ancien système de restauration de l’intro est encore chargé.");
forbid(entry, /startup-v2\.css/, "L’intro expérimentale est encore chargée.");

requireMatch(simpleStartup, /classList\.remove\(["']startup-running["']\)/, "La classe bloquant l’interface n’est pas retirée.");
requireMatch(simpleStartup, /startup\?\.remove\(\)/, "Le conteneur de l’intro n’est pas supprimé.");
requireMatch(simpleStartup, /pixelSimpleStartup/, "Le démarrage simple n’est pas marqué comme actif.");

requireMatch(failsafe, /#startupAnimation[\s\S]*display:\s*none\s*!important/, "L’intro peut encore apparaître avant JavaScript.");
requireMatch(failsafe, /\.app-shell[\s\S]*opacity:\s*1\s*!important/, "L’interface principale n’est pas immédiatement visible.");
requireMatch(failsafe, /body\.startup-running[\s\S]*overflow-y:\s*auto\s*!important/, "Le défilement peut rester bloqué au lancement.");

requireMatch(macOSPreparation, /pixel-macos-static-no-intro/, "La protection macOS sans intro doit rester compatible.");

console.log("PIXEL_SIMPLE_STARTUP_VERIFIED");
