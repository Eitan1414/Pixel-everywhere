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
import happy1a1 from "./pixel-helper-emotions/happy-1-a1.js";
import happy1a2 from "./pixel-helper-emotions/happy-1-a2.js";
import happy1b from "./pixel-helper-emotions/happy-1-b.js";
import happy1c from "./pixel-helper-emotions/happy-1-c.js";
import happy1d from "./pixel-helper-emotions/happy-1-d.js";
import happy2a from "./pixel-helper-emotions/happy-2-a.js";
import happy2b from "./pixel-helper-emotions/happy-2-b.js";
import happy2b1 from "./pixel-helper-emotions/happy-2-b1.js";
import happy2b2 from "./pixel-helper-emotions/happy-2-b2.js";
import happy2c1 from "./pixel-helper-emotions/happy-2-c1.js";
import happy2c2 from "./pixel-helper-emotions/happy-2-c2.js";
import happy2d1 from "./pixel-helper-emotions/happy-2-d1.js";
import happy2d2 from "./pixel-helper-emotions/happy-2-d2.js";

function restore(parts) {
  const compressed = Buffer.concat(parts.map((part) => Buffer.from(part, "base64")));
  return gunzipSync(compressed);
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
  surprised: restore([surprised1, surprised2])
};

for (const [emotion, bytes] of Object.entries(restored)) {
  test(`l’image ${emotion} est reconstruite octet par octet`, () => {
    assert.equal(bytes.length, expected[emotion].size);
    assert.equal(sha256(bytes), expected[emotion].sha256);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  });
}

const aVariants = {
  a: [happy1a],
  a1: [happy1a1],
  "a1+a2": [happy1a1, happy1a2],
  "a+a2": [happy1a, happy1a2]
};

const bVariants = {
  b: [happy2b],
  b1: [happy2b1],
  "b1+b2": [happy2b1, happy2b2],
  "b+b2": [happy2b, happy2b2]
};

const fixedBeforeB = [happy1b, happy1c, happy1d, happy2a];
const fixedAfterB = [happy2c1, happy2c2, happy2d1, happy2d2];

let matchingCandidate = null;

for (const [aName, aParts] of Object.entries(aVariants)) {
  for (const [bName, bParts] of Object.entries(bVariants)) {
    const candidateName = `${aName}/${bName}`;
    try {
      const bytes = restore([...aParts, ...fixedBeforeB, ...bParts, ...fixedAfterB]);
      const digest = sha256(bytes);
      console.log(`PIXEL_HAPPY_CANDIDATE ${candidateName} size=${bytes.length} sha256=${digest}`);
      if (bytes.length === expected.happy.size && digest === expected.happy.sha256) {
        matchingCandidate = candidateName;
      }
    } catch (error) {
      console.log(`PIXEL_HAPPY_CANDIDATE ${candidateName} error=${error.code || error.message}`);
    }
  }
}

test("la combinaison exacte de fragments du logo content est identifiée", () => {
  assert.ok(matchingCandidate, "Aucune combinaison de fragments ne correspond au JPEG original");
  console.log(`PIXEL_HAPPY_MATCH ${matchingCandidate}`);
});
