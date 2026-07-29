import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const indexPath = resolve("www/index.html");
const marker = "pixel-macos-static-no-intro";
const style = `<style id="${marker}">
#startupAnimation {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  animation: none !important;
}
body.startup-running {
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
body.startup-running .app-shell,
.app-shell {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  animation: none !important;
}
</style>`;

let html = await readFile(indexPath, "utf8");

if (!html.includes(`id="${marker}"`)) {
  if (!html.includes("</head>")) {
    throw new Error("Le bundle macOS ne contient pas de balise </head>.");
  }
  html = html.replace("</head>", `${style}\n</head>`);
}

html = html.replace(
  /<body\s+class=(['"])startup-running\1>/,
  '<body data-pixel-macos-no-intro="true">'
);

if (!html.includes(`id="${marker}"`)) {
  throw new Error("La protection statique macOS n’a pas été injectée.");
}
if (/<body\s+class=(['"])startup-running\1>/.test(html)) {
  throw new Error("La classe startup-running est encore active dans le bundle macOS.");
}

await writeFile(indexPath, html, "utf8");
console.log("PIXEL_MACOS_STATIC_BUNDLE_READY");
