import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./community-messaging.mjs", import.meta.url), "utf8");

test("le serveur crée les tables du chat public et des MP", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS public_chat_messages/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS member_direct_threads/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS member_direct_messages/);
  assert.match(source, /UNIQUE \(member_a_id, member_b_id\)/);
});

test("le chat public est réservé aux comptes membres actifs", () => {
  assert.match(source, /"\/api\/community-chat\/messages"[\s\S]+authenticateMember[\s\S]+requireActiveMember/);
  assert.match(source, /max: 800/);
  assert.match(source, /Attends deux secondes/);
  assert.match(source, /deleted_by_member_id/);
});

test("les MP vérifient les deux participants", () => {
  assert.match(source, /"\/api\/member-direct\/members"/);
  assert.match(source, /"\/api\/member-direct\/conversations"/);
  assert.match(source, /member_a_id = \? OR threads\.member_b_id = \?/);
  assert.match(source, /recipient_member_id = \?/);
  assert.match(source, /Tu ne peux pas t’envoyer un MP à toi-même/);
});
