import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions } from "../server/updates.mjs";

test("compare les versions sémantiques de Pixel Everywhere", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  assert.equal(compareVersions("0.2.0", "0.2.1"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "0.9.9"), 1);
});
