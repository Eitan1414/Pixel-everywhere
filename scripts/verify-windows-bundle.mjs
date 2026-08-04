import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = process.cwd();
const outputRoot = resolve(root, "www");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert(/^\d+\.\d+\.\d+$/.test(packageJson.version), `Version Windows invalide : ${packageJson.version}`);

const indexPath = resolve(outputRoot, "index.html");
assert((await stat(indexPath)).isFile(), "Le bundle www/index.html est absent.");

const files = await listFiles(outputRoot);
const javascriptFiles = files.filter((file) => file.endsWith(".js"));
assert(javascriptFiles.length > 0, "Aucun fichier JavaScript n’a été produit dans www.");

const bundles = [];
for (const file of javascriptFiles) {
  bundles.push({
    file,
    relativePath: relative(outputRoot, file).replaceAll("\\", "/"),
    content: await readFile(file, "utf8")
  });
}

function bundlesContaining(marker) {
  return bundles.filter((bundle) => bundle.content.includes(marker));
}

function bundlesContainingAll(markers) {
  return bundles.filter((bundle) => markers.every((marker) => bundle.content.includes(marker)));
}

const featureChecks = [
  {
    label: "restauration des catégories",
    markers: ["pixelCategoriesRestored"]
  },
  {
    label: "configuration du serveur",
    markers: ["pixel-api-base-url", "127.0.0.1:3000/api"]
  },
  {
    label: "prise en charge des mises à jour Windows",
    markers: ["windows-x64", "Télécharger la version portable"]
  },
  {
    label: "tolérance aux erreurs de modules",
    markers: ["PIXEL_OPTIONAL_MODULE_FAILED"]
  },
  {
    label: "messagerie membres et staff",
    markers: ["conversationInboxButton", "conversations/staff/member-profile"]
  }
];

for (const { label, markers } of featureChecks) {
  const matches = bundlesContainingAll(markers);
  assert(
    matches.length > 0,
    `Fonctionnalité absente du bundle Windows : ${label} (${markers.join(" + ")}).`
  );
  console.log(`Fonctionnalité vérifiée : ${label} — ${matches.map((item) => item.relativePath).join(", ")}`);
}

const suggestionBundles = bundles.filter((bundle) =>
  bundle.content.includes("page-suggestions")
  || bundle.content.includes("Suggestions de mises à jour")
  || /(?:^|\/)suggestions-[^/]+\.js$/i.test(bundle.relativePath)
);

assert(
  suggestionBundles.length > 0,
  `La catégorie Idées/Suggestions n’a pas été générée. Fichiers inspectés : ${javascriptFiles.map((file) => relative(outputRoot, file)).join(", ")}`
);

const suggestionCodePresent = suggestionBundles.some((bundle) =>
  bundle.content.includes("page-suggestions")
  && bundle.content.includes("suggestionForm")
  && bundle.content.includes("Suggestions de mises à jour")
);
assert(suggestionCodePresent, "Le chunk Suggestions existe, mais son interface complète n’est pas présente.");
console.log(`Catégorie Idées/Suggestions vérifiée : ${suggestionBundles.map((item) => item.relativePath).join(", ")}`);

const obsoleteServer = "reprimand-overprice-quickly.ngrok-free.dev";
assert(
  bundlesContaining(obsoleteServer).length === 0,
  "L’ancienne adresse ngrok est encore intégrée au bundle Windows."
);

console.log(`PIXEL_WINDOWS_BUNDLE_${packageJson.version.replaceAll(".", "_")}_COMPLETE — ${javascriptFiles.length} fichiers JavaScript inspectés.`);
