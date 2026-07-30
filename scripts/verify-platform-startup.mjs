import { readFile } from "node:fs/promises";

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function requireOrder(value, tokens, message) {
  let previous = -1;
  for (const token of tokens) {
    const index = value.indexOf(token);
    if (index < 0 || index <= previous) throw new Error(message);
    previous = index;
  }
}

const [html, entry, preserver, restorer, macOSPreparation] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("web/app-entry.js", "utf8"),
  readFile("web/startup-original-preserver.js", "utf8"),
  readFile("web/startup-original-restorer.js", "utf8"),
  readFile("scripts/prepare-macos-bundle.mjs", "utf8")
]);

requireMatch(html, /<body class="startup-running">/, "L’intro normale doit rester active dans la source commune.");
requireMatch(html, /id="startupAnimation"/, "Le conteneur de l’intro normale est absent.");
requireMatch(html, /class="startup-paper"/, "Le décor papier de l’intro normale est absent.");
requireMatch(html, /class="startup-swipe"/, "L’animation normale de balayage est absente.");

if (entry.includes("startup-v2.css")) {
  throw new Error("Les styles de l’intro expérimentale ne doivent plus être chargés.");
}

requireOrder(
  entry,
  [
    "startup-original-preserver.js",
    "enhancements.js",
    "startup-original-restorer.js",
    "main.js"
  ],
  "L’ordre de protection de l’intro normale est invalide."
);

requireMatch(preserver, /startup\.id\s*=\s*["']startupAnimationOriginal["']/, "L’intro normale n’est pas protégée avant les améliorations.");
requireMatch(restorer, /startup\.id\s*=\s*["']startupAnimation["']/, "L’identifiant de l’intro normale n’est pas restauré.");
if (preserver.includes("innerHTML") || restorer.includes("innerHTML")) {
  throw new Error("L’intro normale ne doit jamais être reconstruite ou remplacée.");
}

requireMatch(macOSPreparation, /pixel-macos-static-no-intro/, "Le marqueur macOS sans intro est absent.");
requireMatch(macOSPreparation, /data-pixel-macos-no-intro/, "Le bundle macOS n’est pas identifié comme sans intro.");
requireMatch(macOSPreparation, /#startupAnimation[\s\S]*display: none !important/, "L’intro n’est pas supprimée statiquement sur macOS.");

console.log("PIXEL_PLATFORM_STARTUP_VERIFIED");
