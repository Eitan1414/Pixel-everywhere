import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import sad1 from "./pixel-helper-emotions/sad-1.js";
import sad2 from "./pixel-helper-emotions/sad-2.js";
import thinking1 from "./pixel-helper-emotions/thinking-1.js";
import thinking2 from "./pixel-helper-emotions/thinking-2.js";
import surprised1 from "./pixel-helper-emotions/surprised-1.js";
import surprised2 from "./pixel-helper-emotions/surprised-2.js";
import happy1a from "./pixel-helper-emotions/happy-1-a.js";
import happy1b from "./pixel-helper-emotions/happy-1-b.js";
import happy1c from "./pixel-helper-emotions/happy-1-c.js";
import happy1d from "./pixel-helper-emotions/happy-1-d.js";
import happy2a from "./pixel-helper-emotions/happy-2-a.js";
import happy2b1 from "./pixel-helper-emotions/happy-2-b1.js";
import happy2b2 from "./pixel-helper-emotions/happy-2-b2.js";
import happy2c1 from "./pixel-helper-emotions/happy-2-c1.js";
import happy2c2 from "./pixel-helper-emotions/happy-2-c2.js";
import happy2d1 from "./pixel-helper-emotions/happy-2-d1.js";
import happy2d2 from "./pixel-helper-emotions/happy-2-d2.js";

function restore(parts) {
  return gunzipSync(Buffer.from(parts.join(""), "base64"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const expected = {
  sad: { size: 36930, sha256: "9a396e00e87c76176ac34e18277ad30c36ab28913145e0ddc38e0a65adc502fb" },
  thinking: { size: 36756, sha256: "df2f96640c34dee7265a158824f715fba7cd302b1ff2acca0ddc185510ea9bab" },
  surprised: { size: 37851, sha256: "378c0a01e6d843b7f734f0d8fbf5d125c90e43939536e06f43841ad3736d6d5a" },
  happy: { size: 37917, sha256: "36e15366efdb46d3e293389c69aab8b3ed4ed010bc24a4ac0d06bfc0c8a5d4a0" }
};

const restored = {
  sad: restore([sad1, sad2]),
  thinking: restore([thinking1, thinking2]),
  surprised: restore([surprised1, surprised2]),
  happy: restore([
    happy1a, happy1b, happy1c, happy1d, happy2a,
    happy2b1, happy2b2, happy2c1, happy2c2, happy2d1, happy2d2
  ])
};

for (const [emotion, bytes] of Object.entries(restored)) {
  test(`l’image ${emotion} est reconstruite octet par octet`, () => {
    assert.equal(bytes.length, expected[emotion].size);
    assert.equal(sha256(bytes), expected[emotion].sha256);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  });
}
