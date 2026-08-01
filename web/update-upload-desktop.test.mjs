import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./update-upload-desktop.js", import.meta.url), "utf8");

test("chaque carte desktop n'est décorée qu'une seule fois", () => {
  assert.match(source, /if \(card\.dataset\.desktopUpdateReady === "true"\) return;/);
  assert.match(source, /card\.dataset\.desktopUpdateReady = "true";/);
});

test("le texte du bouton n'est plus réécrit par l'observateur après initialisation", () => {
  const guard = source.indexOf('card.dataset.desktopUpdateReady = "true"');
  const buttonText = source.indexOf('button.textContent = "Choisir et envoyer"');
  assert.ok(guard >= 0 && buttonText > guard);
});
