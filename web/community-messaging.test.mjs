import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./community-messaging.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./community-messaging.css", import.meta.url), "utf8");

test("une catégorie de chat public est ajoutée", () => {
  assert.match(source, /communityChatFeature/);
  assert.match(source, /page-community-chat/);
  assert.match(source, /\/community-chat\/messages/);
  assert.match(source, /Chat public/);
  assert.match(styles, /\.community-chat-messages/);
});

test("les MP sont intégrés dans la messagerie existante", () => {
  assert.match(source, /supportConversationTab/);
  assert.match(source, /memberDirectTab/);
  assert.match(source, /memberDirectPanel/);
  assert.match(source, /\/member-direct\/conversations/);
  assert.match(source, /memberDirectBadge/);
  assert.match(styles, /\.conversation-mode-tabs/);
});

test("le module utilise le profil membre lié pour les comptes staff", () => {
  assert.match(source, /pixel-member-token/);
  assert.match(source, /staffRole/);
  assert.match(source, /Boîte membres/);
});
