import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./android-update-upload.js", import.meta.url), "utf8");

test("chaque carte Android n'est décorée qu'une seule fois", () => {
  assert.match(source, /card\.dataset\.pixelAndroidUpdateDecorated === "true"/);
  assert.match(source, /card\.dataset\.pixelAndroidUpdateDecorated = "true"/);
});

test("le garde est appliqué avant la réécriture du bouton", () => {
  const guardIndex = source.indexOf('card.dataset.pixelAndroidUpdateDecorated === "true"');
  const buttonIndex = source.indexOf('button.textContent = "Envoyer depuis Android"');
  assert.ok(guardIndex >= 0);
  assert.ok(buttonIndex > guardIndex);
});
