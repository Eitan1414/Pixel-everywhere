import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper-bots.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-bots.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("Pixel Helper contient un bot guide et un bot de modération", () => {
  assert.match(source, /Pixel Guide/);
  assert.match(source, /Pixel Guard/);
  assert.match(source, /data-helper-bot="guide"/);
  assert.match(source, /data-helper-bot="moderation"/);
  assert.match(source, /spam|flood/);
  assert.match(source, /harcelement/);
  assert.match(source, /phishing/);
});

test("les réponses de modération s’adaptent au rôle connecté", () => {
  assert.match(source, /currentHelperRole/);
  assert.match(source, /role === "member"/);
  assert.match(source, /Compte \$\{helperRoleLabel\(\)\}/);
  assert.match(source, /administrateur/);
  assert.match(source, /modérateur/);
});

test("les bots peuvent ouvrir le chat public, les MP et les catégories utiles", () => {
  assert.match(source, /open-chat/);
  assert.match(source, /open-mp/);
  assert.match(source, /PixelCommunityEnhancements/);
  assert.match(source, /memberDirectTab/);
  assert.match(source, /data-page-target/);
});

test("les deux boutons d’aide sont visibles à des hauteurs différentes", () => {
  assert.match(styles, /#pixelGuideButton[\s\S]*bottom: calc\(106px/);
  assert.match(styles, /#pixelHelperGuideButton[\s\S]*bottom: calc\(172px/);
  assert.match(styles, /#pixelGuideButton[\s\S]*display: inline-flex !important/);
  assert.match(styles, /#pixelHelperGuideButton[\s\S]*display: inline-flex !important/);
});

test("les bots sont chargés après Pixel Helper interactif", () => {
  const interactive = entry.indexOf('loadOptional(moduleLoaders.pixelHelperInteractive, "tutoriel interactif Pixel Helper")');
  const bots = entry.indexOf('loadOptional(moduleLoaders.pixelHelperBots, "bots de guide et de modération Pixel Helper")');
  assert.ok(interactive >= 0);
  assert.ok(bots > interactive);
});
