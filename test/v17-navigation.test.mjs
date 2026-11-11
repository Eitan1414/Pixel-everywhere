import test from "node:test";
import assert from "node:assert/strict";
import { uniqueMenuFeatures } from "../web/v17-navigation-model.js";

test("menu deduplicates routes while retaining order and actions", () => {
  const action = () => true;
  const value = uniqueMenuFeatures([
    { id: "announcements", label: "Annonces", activate: action },
    { id: "announcements", label: "Annonce duplicate" },
    { id: "pixel", label: " Pixel " },
    { id: "empty", label: "  " }
  ]);
  assert.deepEqual(value.map((item) => item.label), ["Annonces", "Pixel"]);
  assert.equal(value[0].activate, action);
});

test("menu ignores invalid candidates", () => {
  assert.deepEqual(uniqueMenuFeatures([null, undefined, {}, { label: "" }]), []);
  assert.deepEqual(uniqueMenuFeatures([]), []);
});
