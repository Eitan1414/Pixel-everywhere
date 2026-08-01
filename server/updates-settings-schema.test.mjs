import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./updates.mjs", import.meta.url), "utf8");

test("le schéma n'est plus strict pour tolérer les clients plus récents", () => {
  assert.doesNotMatch(source, /settingsSchema[\s\S]*?\.strict\(\)/);
});
