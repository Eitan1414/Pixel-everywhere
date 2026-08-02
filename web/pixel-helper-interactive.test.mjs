import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper-interactive.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-interactive.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("Pixel Helper utilise l’image fournie comme vrai logo dans l’application", () => {
  assert.match(source, /data:image\/jpeg;base64,/);
  assert.match(source, /Logo Pixel Helper fourni/);
  assert.match(source, /pixel-helper-logo-frame/);
  assert.match(source, /pixel-helper-thread-logo/);
  assert.match(source, /pixel-helper-message-logo/);
});

test("le guide des catégories devient interactif", () => {
  assert.match(source, /data-helper-previous/);
  assert.match(source, /data-helper-next/);
  assert.match(source, /data-helper-open-category/);
  assert.match(source, /selectCategoryStep/);
  for (const category of ["Accueil", "Annonces", "Pixel", "Rejoindre le staff", "Messagerie", "Compte"]) {
    assert.ok(source.includes(category), `catégorie manquante : ${category}`);
  }
});

test("le tutoriel de mise à jour permet de sélectionner chaque étape", () => {
  assert.match(source, /selectUpdateStep/);
  assert.match(source, /data-update-previous/);
  assert.match(source, /data-update-next/);
  assert.match(source, /steps\.forEach/);
});

test("Pixel possède plusieurs expressions animées", () => {
  for (const expression of ["happy", "curious", "excited", "wink", "proud", "wave", "calm"]) {
    assert.ok(source.includes(`expression-${expression}`) || styles.includes(`expression-${expression}`), `expression manquante : ${expression}`);
  }
  assert.match(styles, /@keyframes pixelHelperWave/);
  assert.match(styles, /@keyframes pixelHelperReact/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("l’amélioration reste idempotente et ne surveille que les enfants du DOM", () => {
  assert.match(source, /modal\.dataset\.interactive === "true"/);
  assert.match(source, /message\.dataset\.interactive === "true"/);
  assert.match(source, /interactiveHelperObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(source, /attributeFilter/);
});

test("le module interactif est chargé après Pixel Helper", () => {
  const helperIndex = entry.indexOf("moduleLoaders.pixelHelper, \"guides Pixel Helper\"");
  const interactiveIndex = entry.indexOf("moduleLoaders.pixelHelperInteractive, \"tutoriel interactif Pixel Helper\"");
  assert.ok(helperIndex >= 0);
  assert.ok(interactiveIndex > helperIndex);
});
