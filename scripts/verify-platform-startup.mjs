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
  simpleStartup,
  startupCss,
  androidStartup,
  androidStartupCss,
  manualUpdates,
  preload,
  bootstrap
] = await Promise.all([
  readFile("web/app-entry.js", "utf8"),
  readFile("web/simple-startup.js", "utf8"),
  readFile("web/startup-failsafe.css", "utf8"),
  readFile("web/android-startup.js", "utf8"),
  readFile("web/android-startup.css", "utf8"),
  readFile("web/manual-update-mode.js", "utf8"),
  readFile("electron/preload.cjs", "utf8"),
  readFile("electron/bootstrap.cjs", "utf8")
]);

requireOrder(
  entry,
  [
    "startup-failsafe.css",
    "android-startup.css",
    "simple-startup.js",
    "android-startup.js",
    "app-updater.js",
    "manual-update-mode.js",
    "main.js"
  ],
  "Le démarrage Android et le gestionnaire manuel doivent précéder le cœur de l’application."
);

requireMatch(entry, /enhancements\.js/, "Les améliorations générales ne sont pas chargées.");
requireMatch(entry, /suggestions\.js/, "La catégorie Suggestions n’est pas chargée.");
requireMatch(entry, /creation-studio\.js/, "La catégorie Création n’est pas chargée.");
requireMatch(entry, /announcement-center\.js/, "Le centre d’annonces n’est pas chargé.");
requireMatch(entry, /announcement-subcategories\.js/, "Les sous-catégories d’annonces ne sont pas chargées.");
requireMatch(entry, /admin-control\.js/, "Le contrôle administrateur n’est pas chargé.");
requireMatch(entry, /account-deletion\.js/, "La gestion complète des comptes n’est pas chargée.");
requireMatch(entry, /pixelCategoriesRestored/, "Le runtime ne confirme pas la restauration des catégories.");

requireMatch(simpleStartup, /startupAnimation/, "Le script de démarrage direct ne retire pas l’ancienne intro.");
requireMatch(simpleStartup, /startup-running/, "Le démarrage direct ne libère pas l’interface.");
requireMatch(startupCss, /#startupAnimation[\s\S]*display:\s*none/, "Le CSS ne masque pas immédiatement l’ancienne intro.");

requireMatch(androidStartup, /getPlatform\?\.\(\)\s*===\s*"android"/, "L’intro n’est pas limitée à Android.");
requireMatch(androidStartup, /androidStartupAnimation/, "Le nouvel écran de démarrage Android est absent.");
requireMatch(androidStartup, /pixel-mascot\.png/, "La mascotte complète de Pixel n’est pas utilisée dans l’intro.");
requireMatch(androidStartup, /android-intro-full-mascot/, "La mascotte complète n’est pas animée.");
requireMatch(androidStartup, /pixel-intro-draw/, "L’effet de dessin progressif de Pixel est absent.");
requireMatch(androidStartup, /pixel-intro-trace/, "Le tracé lumineux de Pixel est absent.");
requireMatch(androidStartup, /<strong>Pixel<\/strong>/, "Le titre Pixel est absent.");
requireMatch(androidStartup, /<span>Everywhere<\/span>/, "Le titre Everywhere est absent.");
requireMatch(androidStartup, /Imagine • Create • Share/, "La signature de la nouvelle intro est absente.");
requireMatch(androidStartup, /length:\s*18/, "Les particules de fond Android sont absentes.");
requireMatch(androidStartup, /5900/, "La fermeture automatique courte de l’intro Android est absente.");
requireMatch(androidStartup, /android-intro-hand[\s\S]*display:\s*none/, "L’ancienne main n’est pas explicitement neutralisée.");
requireMatch(androidStartup, /android-intro-body[\s\S]*display:\s*none/, "L’ancien corps séparé n’est pas neutralisé.");
requireMatch(androidStartup, /android-intro-eye[\s\S]*display:\s*none/, "L’ancien œil séparé n’est pas neutralisé.");
requireMatch(androidStartupCss, /android-intro-particle/, "Les effets de particules sont absents.");
requireMatch(androidStartupCss, /data-pixel-android-intro="active"/, "L’application n’est pas protégée derrière l’intro Android.");

forbid(androidStartup, /src="\.\/assets\/pixel-body\.png"/, "L’intro utilise encore le corps séparé qui déformait Pixel.");
forbid(androidStartup, /src="\.\/assets\/pixel-eye\.png"/, "L’intro utilise encore l’œil séparé qui déformait Pixel.");
forbid(androidStartup, /👋/, "L’ancienne main est encore présente dans l’intro.");
forbid(androidStartup, /pdd2-wordmark\.png/, "L’ancien wordmark PDD 2 est encore utilisé dans l’intro Android.");
forbid(entry, /startup-safety\.js/, "L’ancienne animation est encore démarrée.");
forbid(entry, /automatic-installer(?:\.css|\.js)/, "L’installation automatique est encore chargée.");

requireMatch(manualUpdates, /installation:\s*"manual"/, "Le mode d’installation manuelle n’est pas actif.");
requireMatch(manualUpdates, /Télécharger le fichier/, "Le bouton de téléchargement manuel est absent.");
forbid(preload, /installUpdate/, "Le pont macOS d’installation automatique est encore exposé.");
forbid(preload, /onUpdateProgress/, "Le suivi d’installation automatique macOS est encore exposé.");
forbid(bootstrap, /automatic-updater/, "Le moteur d’installation automatique macOS est encore démarré.");

console.log("PIXEL_ANDROID_INTRO_AND_DIRECT_DESKTOP_START_VERIFIED");