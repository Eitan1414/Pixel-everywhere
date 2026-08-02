import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import thinking1 from "./pixel-helper-emotions/thinking-1.js";
import thinking2 from "./pixel-helper-emotions/thinking-2.js";
import surprised1 from "./pixel-helper-emotions/surprised-1.js";
import surprised2 from "./pixel-helper-emotions/surprised-2.js";

function restore(parts) {
  return gunzipSync(Buffer.from(parts.join(""), "base64"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const expected = {
  thinking: { size: 36756, sha256: "df2f96640c34dee7265a158824f715fba7cd302b1ff2acca0ddc185510ea9bab" },
  surprised: { size: 37851, sha256: "378c0a01e6d843b7f734f0d8fbf5d125c90e43939536e06f43841ad3736d6d5a" }
};

const restored = {
  thinking: restore([thinking1, thinking2]),
  surprised: restore([surprised1, surprised2])
};

for (const [emotion, bytes] of Object.entries(restored)) {
  test(`l’image ${emotion} est reconstruite octet par octet`, () => {
    assert.equal(bytes.length, expected[emotion].size);
    assert.equal(sha256(bytes), expected[emotion].sha256);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  });
}

const loader = await readFile(new URL("./pixel-helper-emotions.js", import.meta.url), "utf8");

test("Pixel Helper évite les fragments d’images incomplets", () => {
  assert.doesNotMatch(loader, /sad-1\.js|sad-2\.js/);
  assert.doesNotMatch(loader, /happy-1-|happy-2-/);
  assert.match(loader, /const sad = thinking/);
  assert.match(loader, /assets\/pixel-mascot\.png/);
  assert.match(loader, /const happy = mascotUrl\(\)/);
  assert.match(loader, /Object\.freeze\(\{ sad, thinking, surprised, happy \}\)/);
});
