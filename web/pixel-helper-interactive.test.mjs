import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper-interactive.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-interactive.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("le personnage visuel est retiré de Pixel Helper", () => {
  assert.doesNotMatch(source, /loadPixelHelperEmotions/);
  assert.doesNotMatch(source, /pixel-helper-stage-emotion/);
  assert.doesNotMatch(source, /<img/);
  assert.match(source, /removeCharacterVisuals/);
  assert.match(source, /characterVisible: false/);
});

test("la catégorie Pixel Helper et son guide interactif restent présents", () => {
  assert.match(source, /data-previous/);
  assert.match(source, /data-next/);
  assert.match(source, /data-open/);
  assert.match(source, /updateGuideStep/);
  assert.match(source, /pixel-helper-interactive-stage no-character/);
  assert.match(source, /pixel-helper-update-stage no-character/);
  assert.match(styles, /\.pixel-helper-interactive-stage\.no-character/);
});

test("Pixel Guide et Pixel Guard restent chargés après le guide", () => {
  const helperIndex = entry.indexOf('moduleLoaders.pixelHelper, "guides Pixel Helper"');
  const interactiveIndex = entry.indexOf('moduleLoaders.pixelHelperInteractive, "tutoriel interactif Pixel Helper"');
  const botsIndex = entry.indexOf('moduleLoaders.pixelHelperBots, "bots de guide et de modération Pixel Helper"');
  assert.ok(helperIndex >= 0);
  assert.ok(interactiveIndex > helperIndex);
  assert.ok(botsIndex > interactiveIndex);
});

test("l’amélioration reste idempotente et observe seulement les enfants du DOM", () => {
  assert.match(source, /modal\.dataset\.characterFreeGuide === "true"/);
  assert.match(source, /message\.dataset\.characterFreeGuide === "true"/);
  assert.match(source, /interactiveHelperObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(source, /attributeFilter/);
});
