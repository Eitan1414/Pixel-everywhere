import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("Pixel Helper fournit un tutoriel de mise à jour pour Android, Windows et macOS", () => {
  assert.match(source, /platform === "android"/);
  assert.match(source, /platform === "windows"/);
  assert.match(source, /platform === "macos"/);
  assert.match(source, /ne désinstalle pas l’ancienne version/i);
});

test("le message de mise à jour est signé Pixel Helper et accessible depuis la fenêtre", () => {
  assert.match(source, /— Pixel Helper/);
  assert.match(source, /openPixelHelperUpdateMessage/);
  assert.match(source, /Voir le tutoriel dans la messagerie/);
  assert.match(source, /pixelHelperUpdateThread/);
});

test("le guide présente les catégories principales", () => {
  for (const category of ["Accueil", "Annonces", "Pixel", "Rejoindre le staff", "Messagerie", "Compte"]) {
    assert.ok(source.includes(category), `catégorie manquante : ${category}`);
  }
  assert.match(styles, /\.pixel-guide-button/);
  assert.match(styles, /\.pixel-helper-dialog/);
});

test("l’observateur Pixel Helper est idempotent et ne surveille pas les attributs", () => {
  assert.match(source, /list\.querySelector\("#pixelHelperUpdateThread"\)/);
  assert.match(source, /actions\.querySelector\("#openPixelHelperUpdateMessage"\)/);
  assert.match(source, /helperObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(source, /attributeFilter/);
});

test("Pixel Helper est chargé après la messagerie", () => {
  const conversationsIndex = entry.indexOf("moduleLoaders.memberConversations");
  const helperIndex = entry.indexOf("moduleLoaders.pixelHelper, \"guides Pixel Helper\"");
  assert.ok(conversationsIndex >= 0);
  assert.ok(helperIndex > conversationsIndex);
});
