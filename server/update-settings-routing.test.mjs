import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./start.mjs", import.meta.url), "utf8");

test("le middleware de compatibilité précède les routes de mise à jour", () => {
  assert.match(source, /registrations\.unshift\(`app\.use\("\/api\/admin\/update-settings"/);
});

test("les requêtes Android complètent aussi le champ Windows absent", () => {
  assert.match(source, /windowsX64Url: body\.windowsX64Url \?\? current\.windows_x64_url \?\? ""/);
});
