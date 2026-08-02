import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./staff-member-session.js", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8");

test("le profil membre staff est préparé avant main.js", () => {
  const sessionLoader = entry.indexOf("moduleLoaders.staffMemberSession");
  const mainLoader = entry.indexOf('loadCritical(moduleLoaders.main, "Interface principale")');
  assert.ok(sessionLoader >= 0);
  assert.ok(mainLoader > sessionLoader);
  assert.match(source, /await synchronizeStaffMemberSession/);
  assert.match(source, /\/conversations\/staff\/member-profile/);
});

test("la session membre liée est stockée et partagée avec l’interface", () => {
  assert.match(source, /pixel-member-token/);
  assert.match(source, /pixel-member-session-ready/);
  assert.match(source, /pixel-staff-member-profile-ready/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test("Ma messagerie reconnaît le profil membre lié", () => {
  assert.match(source, /#memberInboxGate/);
  assert.match(source, /#memberInboxButton/);
  assert.match(source, /classList\.toggle\("hidden", available\)/);
});

test("un serveur sans routes MP affiche une explication précise", () => {
  assert.match(source, /\/member-direct\/members/);
  assert.match(source, /response\.status === 404/);
  assert.match(source, /serveur Termux à jour vers la 0\.31\.19/);
});
