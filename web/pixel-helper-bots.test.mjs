import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pixel-helper-bots.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-bots.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("Pixel Helper contient Pixel Guide IA et Pixel Guard IA", () => {
  assert.match(source, /Pixel Guide IA/);
  assert.match(source, /Pixel Guard IA/);
  assert.match(source, /data-helper-bot="guide"/);
  assert.match(source, /data-helper-bot="moderation"/);
  assert.match(source, /Les réponses sont générées en ligne/);
});

test("les assistants appellent la route IA au lieu d’une table de réponses", () => {
  assert.match(source, /\/pixel-helper\/ask/);
  assert.match(source, /history: previousHistory/);
  assert.match(source, /helperBotState\.histories/);
  assert.doesNotMatch(source, /function guideAnswer/);
  assert.doesNotMatch(source, /function moderationAnswer/);
  assert.doesNotMatch(source, /answerFromActiveBot/);
});

test("l’interface indique clairement si la vraie IA est configurée", () => {
  assert.match(source, /\/pixel-helper\/status/);
  assert.match(source, /IA en ligne/);
  assert.match(source, /IA non configurée/);
  assert.match(styles, /pixel-helper-ai-status\.online/);
  assert.match(styles, /pixel-helper-ai-status\.offline/);
  assert.match(styles, /pixel-helper-bot-message\.pending/);
});

test("les réponses restent protégées par une session membre ou staff", () => {
  assert.match(source, /pixel-member-token/);
  assert.match(source, /pixel-token/);
  assert.match(source, /Authorization/);
  assert.match(source, /Connecte d’abord un compte membre ou staff/);
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
