import { readFile } from "node:fs/promises";

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

const [entry, stability, stabilityCss, main] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/native-interaction-stability.js", "utf8"),
  readFile("web/native-interaction-stability.css", "utf8"),
  readFile("web/main.js", "utf8")
]);

requireMatch(entry, /stableNativeRuntime\s*=\s*isAndroid\s*\|\|\s*isMacOS/, "Le mode natif stable Android/macOS est absent.");
requireMatch(entry, /if\s*\(!stableNativeRuntime\)[\s\S]*enhancements\.js/, "Les modules expérimentaux ne sont pas isolés du mode natif stable.");
requireMatch(entry, /await import\("\.\/main\.js"\)/, "Le cœur de l’application n’est pas chargé.");
requireMatch(entry, /await import\("\.\/offline-access\.js"\)/, "Le mode hors ligne n’est pas chargé.");

requireMatch(stability, /serverStatusDialog/, "La fenêtre serveur n’est pas stabilisée.");
requireMatch(stability, /this\.show\(\)/, "L’alerte serveur doit être non modale.");
requireMatch(stability, /10_000/, "Le délai réseau de sécurité est absent.");
requireMatch(stability, /behavior:\s*"auto"/, "Le défilement natif instantané est absent.");

requireMatch(stabilityCss, /touch-action:\s*manipulation/, "La protection tactile est absente.");
requireMatch(stabilityCss, /backdrop-filter:\s*none\s*!important/, "Le flou GPU des dialogues n’est pas désactivé.");
requireMatch(stabilityCss, /data-non-blocking/, "Le style non bloquant du statut serveur est absent.");

requireMatch(main, /button\.addEventListener\("click",\s*\(\)\s*=>\s*navigate/, "La navigation principale n’est plus reliée aux boutons.");

console.log("PIXEL_NATIVE_INTERACTIONS_VERIFIED");
