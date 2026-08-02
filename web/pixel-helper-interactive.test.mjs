import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper-interactive.js", import.meta.url), "utf8");
const emotions = await readFile(new URL("./pixel-helper-emotions.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-interactive.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("Pixel Helper utilise uniquement les quatre émotions importées", () => {
  assert.match(source, /loadPixelHelperEmotions/);
  assert.match(emotions, /Object\.freeze\(\{ sad, thinking, surprised, happy \}\)/);
  assert.match(emotions, /DecompressionStream\("gzip"\)/);
  assert.match(emotions, /type: "image\/jpeg"/);
  assert.doesNotMatch(source, /pixel-helper-pixel-mouth/);
  assert.doesNotMatch(source, /pixel-helper-pixel-eye/);
  assert.doesNotMatch(source, /pixel-helper-pixel-cheek/);
  assert.doesNotMatch(source, /pixel-body\.png/);
});

test("l’image contente reste le logo Pixel Helper partout", () => {
  assert.match(source, /logo: emotions\.happy/);
  assert.match(source, /emotions\.happy/);
  assert.match(source, /pixelHelperLogo/);
  assert.match(source, /#pixelHelperGuideButton/);
  assert.match(source, /#pixelHelperUpdateThread/);
  assert.match(source, /#openPixelHelperUpdateMessage/);
  assert.match(source, /#appUpdateDialog/);
});

test("les émotions correspondent aux usages définis", () => {
  assert.match(source, /Early Access[^\n]+"sad"/);
  assert.match(source, /"Annonces"[^\n]+"thinking"/);
  assert.match(source, /"Pixel"[^\n]+"surprised"/);
  assert.match(source, /"Messagerie"[^\n]+"happy"/);
});

test("le tutoriel reste interactif et accessible", () => {
  assert.match(source, /data-previous/);
  assert.match(source, /data-next/);
  assert.match(source, /data-open/);
  assert.match(source, /updateGuideStep/);
  assert.match(styles, /\.pixel-helper-interactive-stage/);
  assert.match(styles, /\.pixel-helper-update-stage/);
});

test("l’amélioration est idempotente et ne surveille que les enfants du DOM", () => {
  assert.match(source, /modal\.dataset\.importedEmotions === "true"/);
  assert.match(source, /message\.dataset\.importedEmotions === "true"/);
  assert.match(
    source,
    /interactiveHelperObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/
  );
  assert.doesNotMatch(source, /attributeFilter/);
});

test("le module interactif reste chargé après Pixel Helper", () => {
  const helperIndex = entry.indexOf('moduleLoaders.pixelHelper, "guides Pixel Helper"');
  const interactiveIndex = entry.indexOf(
    'moduleLoaders.pixelHelperInteractive, "tutoriel interactif Pixel Helper"'
  );
  assert.ok(helperIndex >= 0);
  assert.ok(interactiveIndex > helperIndex);
});
