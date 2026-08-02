import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./simple-startup.js", import.meta.url), "utf8");

test("un MP avec une session membre expirée renouvelle le jeton via le compte staff", () => {
  assert.match(source, /\/api\/member-direct/);
  assert.match(source, /\[401, 403\]\.includes\(response\.status\)/);
  assert.match(source, /\/conversations\/staff\/member-profile/);
  assert.match(source, /localStorage\.setItem\("pixel-member-token", payload\.token\)/);
  assert.match(source, /return nativeFetch\(input, retryOptions\(input, init, renewed\.token\)\)/);
});

test("les MP expliquent clairement une route serveur absente", () => {
  assert.match(source, /response\.status === 404/);
  assert.match(source, /Les routes MP membres ne sont pas installées/);
});

test("une réponse serveur non JSON n'affiche plus l'erreur générique", () => {
  assert.match(source, /!contentType\.includes\("application\/json"\)/);
  assert.match(source, /Le serveur MP a répondu avec l'erreur HTTP/);
});
