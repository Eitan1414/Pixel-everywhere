import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./updates.mjs", import.meta.url), "utf8");

test("les champs facultatifs ont une valeur par défaut", () => {
  for (const field of ["releaseNotes", "androidUrl", "macosArm64Url", "macosX64Url"]) {
    assert.match(source, new RegExp(`${field}: z\\.string\\(\\)\\.trim\\(\\)\\.max\\(\\d+\\)\\.default\\(\\"\\"\\)`));
  }
});

test("les valeurs manquantes reprennent les réglages enregistrés", () => {
  assert.match(source, /body\.latestVersion \?\? current\.latest_version/);
  assert.match(source, /body\.macosArm64Url \?\? current\.macos_arm64_url/);
  assert.match(source, /parseSettings\(req, res, db\)/);
});
