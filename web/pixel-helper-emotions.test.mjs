import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const branchRef = "origin/feature/pixel-helper-imported-emotions";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeExport(source) {
  const match = source.match(/^export default\s+"([A-Za-z0-9+/=]+)";?\s*$/s);
  if (!match) {
    throw new Error("Export Base64 introuvable");
  }
  return match[1];
}

function readAt(commit, path) {
  try {
    const source = execFileSync("git", ["show", `${commit}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024
    });
    return decodeExport(source);
  } catch {
    return null;
  }
}

function restore(parts, strategy) {
  const compressed = strategy === "joined-text"
    ? Buffer.from(parts.join(""), "base64")
    : Buffer.concat(parts.map((part) => Buffer.from(part, "base64")));
  return gunzipSync(compressed);
}

const expected = {
  sad: { size: 36930, sha256: "9a396e00e87c76176ac34e18277ad30c36ab28913145e0ddc38e0a65adc502fb" },
  thinking: { size: 36756, sha256: "df2f96640c34dee7265a158824f715fba7cd302b1ff2acca0ddc185510ea9bab" },
  surprised: { size: 37851, sha256: "378c0a01e6d843b7f734f0d8fbf5d125c90e43939536e06f43841ad3736d6d5a" },
  happy: { size: 37917, sha256: "36e15366efdb46d3e293389c69aab8b3ed4ed010bc24a4ac0d06bfc0c8a5d4a0" }
};

const simpleLayouts = {
  sad: ["sad-1.js", "sad-2.js"],
  thinking: ["thinking-1.js", "thinking-2.js"],
  surprised: ["surprised-1.js", "surprised-2.js"]
};

const happyLayouts = {
  current: [
    "happy-1-a.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b1.js", "happy-2-b2.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ],
  correctedA: [
    "happy-1-a1.js", "happy-1-a2.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b1.js", "happy-2-b2.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ],
  oldB: [
    "happy-1-a.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ],
  correctedAOldB: [
    "happy-1-a1.js", "happy-1-a2.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ],
  a1Only: [
    "happy-1-a1.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b1.js", "happy-2-b2.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ],
  b1Only: [
    "happy-1-a.js", "happy-1-b.js", "happy-1-c.js", "happy-1-d.js",
    "happy-2-a.js", "happy-2-b1.js",
    "happy-2-c1.js", "happy-2-c2.js", "happy-2-d1.js", "happy-2-d2.js"
  ]
};

function candidateMatches(emotion, parts) {
  const results = [];
  for (const strategy of ["joined-text", "decoded-chunks"]) {
    try {
      const bytes = restore(parts, strategy);
      const digest = sha256(bytes);
      results.push({
        strategy,
        size: bytes.length,
        sha256: digest,
        match: bytes.length === expected[emotion].size && digest === expected[emotion].sha256
      });
    } catch (error) {
      results.push({ strategy, error: error.code || error.message, match: false });
    }
  }
  return results;
}

let fetchError = null;
try {
  execFileSync("git", [
    "fetch", "--no-tags", "--depth=100", "origin",
    "feature/pixel-helper-imported-emotions:refs/remotes/origin/feature/pixel-helper-imported-emotions"
  ], { stdio: ["ignore", "ignore", "pipe"], maxBuffer: 8 * 1024 * 1024 });
} catch (error) {
  fetchError = error.stderr?.toString() || error.message;
}

const commitOutput = execFileSync("git", ["rev-list", "--reverse", branchRef], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024
}).trim();
const commits = commitOutput ? commitOutput.split(/\s+/) : [];
const matches = { sad: [], thinking: [], surprised: [], happy: [] };
const diagnostics = { sad: [], thinking: [], surprised: [], happy: [] };

for (const commit of commits) {
  for (const [emotion, files] of Object.entries(simpleLayouts)) {
    const values = files.map((name) => readAt(commit, `web/pixel-helper-emotions/${name}`));
    if (values.some((value) => !value)) continue;
    const outcomes = candidateMatches(emotion, values);
    for (const outcome of outcomes) {
      if (outcome.match) {
        matches[emotion].push({ commit, layout: files, strategy: outcome.strategy });
      }
    }
    if (diagnostics[emotion].length < 4) {
      diagnostics[emotion].push({ commit: commit.slice(0, 8), outcomes });
    }
  }

  for (const [layoutName, files] of Object.entries(happyLayouts)) {
    const values = files.map((name) => readAt(commit, `web/pixel-helper-emotions/${name}`));
    if (values.some((value) => !value)) continue;
    const outcomes = candidateMatches("happy", values);
    for (const outcome of outcomes) {
      if (outcome.match) {
        matches.happy.push({ commit, layout: layoutName, files, strategy: outcome.strategy });
      }
    }
    if (diagnostics.happy.length < 8) {
      diagnostics.happy.push({ commit: commit.slice(0, 8), layout: layoutName, outcomes });
    }
  }
}

console.log(`PIXEL_HISTORY_FETCH_ERROR ${fetchError || "none"}`);
console.log(`PIXEL_HISTORY_COMMIT_COUNT ${commits.length}`);
console.log(`PIXEL_HISTORY_MATCHES ${JSON.stringify(matches)}`);
console.log(`PIXEL_HISTORY_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);

for (const emotion of Object.keys(expected)) {
  test(`l’historique contient une reconstruction exacte pour ${emotion}`, () => {
    assert.ok(matches[emotion].length > 0, `Aucune reconstruction exacte trouvée pour ${emotion}`);
  });
}
