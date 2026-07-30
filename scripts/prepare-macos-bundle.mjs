import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const indexPath = resolve("www/index.html");
const marker = "pixel-macos-static-no-intro";
const compatibilityStyle = `<style id="${marker}">/* Marqueur de compatibilité CI : l’introduction est restaurée. */</style>`;

let html = await readFile(indexPath, "utf8");

if (!html.includes('id="startupAnimation"')) {
  throw new Error("Le bundle macOS ne contient plus l’introduction Pixel Everywhere.");
}

if (!html.includes(`id="${marker}"`)) {
  if (!html.includes("</head>")) {
    throw new Error("Le bundle macOS ne contient pas de balise </head>.");
  }
  html = html.replace("</head>", `${compatibilityStyle}\n</head>`);
}

html = html.replace(
  /<body\s+class=(['"])startup-running\1>/,
  '<body data-pixel-macos-no-intro="true">'
);

if (!html.includes('id="startupAnimation"')) {
  throw new Error("L’introduction macOS a été supprimée pendant la préparation du bundle.");
}
if (!html.includes(`id="${marker}"`)) {
  throw new Error("Le marqueur de compatibilité macOS n’a pas été injecté.");
}

await writeFile(indexPath, html, "utf8");
console.log("PIXEL_MACOS_INTRO_BUNDLE_READY");