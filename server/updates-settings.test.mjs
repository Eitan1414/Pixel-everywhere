import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "./updates.mjs";

test("compareVersions compare correctement les versions", () => {
  assert.equal(compareVersions("0.31.11", "0.31.10"), 1);
  assert.equal(compareVersions("0.31.10", "0.31.10"), 0);
  assert.equal(compareVersions("0.31.9", "0.31.10"), -1);
});
