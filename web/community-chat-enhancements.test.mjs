import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./community-chat-enhancements.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./community-chat-enhancements.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("le chat public devient une catégorie de la barre avec le logo dièse", () => {
  assert.match(source, /communityChatNavButton/);
  assert.match(source, /<span aria-hidden="true">#<\/span><small>Chat public<\/small>/);
  assert.match(source, /insertBefore\(button, pixelButton\)/);
  assert.match(styles, /#communityChatNavButton > span/);
});

test("taper arobase propose les membres et les trois rôles", () => {
  assert.match(source, /@Admin/);
  assert.match(source, /@Modérateur/);
  assert.match(source, /@Membre/);
  assert.match(source, /aria-autocomplete/);
  assert.match(source, /communityMentionSuggestions/);
  assert.match(source, /member-direct\/members/);
});

test("les mentions utilisent les couleurs demandées", () => {
  assert.match(styles, /community-mention-admin/);
  assert.match(styles, /#ffe07a/);
  assert.match(styles, /community-mention-moderator/);
  assert.match(styles, /#ff8b9a/);
  assert.match(styles, /community-mention-member/);
  assert.match(styles, /#79e7a9/);
});

test("les suggestions venant du serveur sont insérées uniquement avec textContent", () => {
  assert.match(source, /mention\.textContent = target\.insert/);
  assert.match(source, /description\.textContent = target\.description/);
  assert.doesNotMatch(source, /button\.innerHTML = `<span>\$\{target\.insert\}/);
});

test("les enrichissements sont chargés après le module principal du chat", () => {
  const chat = entry.indexOf('loadOptional(moduleLoaders.communityMessaging, "chat public et MP entre membres")');
  const enhancement = entry.indexOf('loadOptional(moduleLoaders.communityChatEnhancements, "catégorie chat public, mentions et aide de modération")');
  assert.ok(chat >= 0);
  assert.ok(enhancement > chat);
});
