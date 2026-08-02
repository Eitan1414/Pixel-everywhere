import sad1 from "./pixel-helper-emotions/sad-1.js";
import sad2 from "./pixel-helper-emotions/sad-2.js";
import thinking1 from "./pixel-helper-emotions/thinking-1.js";
import thinking2 from "./pixel-helper-emotions/thinking-2.js";
import surprised1 from "./pixel-helper-emotions/surprised-1.js";
import surprised2 from "./pixel-helper-emotions/surprised-2.js";
import happy1a1 from "./pixel-helper-emotions/happy-1-a1.js";
import happy1a2 from "./pixel-helper-emotions/happy-1-a2.js";
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

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function inflateImage(parts) {
  const compressed = decodeBase64(parts.join(""));
  if (typeof DecompressionStream !== "function") {
    throw new Error("Décompression des images Pixel Helper indisponible.");
  }
  const stream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(stream).arrayBuffer();
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

let emotionPromise;

export function loadPixelHelperEmotions() {
  emotionPromise ||= Promise.all([
    inflateImage([sad1, sad2]),
    inflateImage([thinking1, thinking2]),
    inflateImage([surprised1, surprised2]),
    inflateImage([
      happy1a1,
      happy1a2,
      happy1b,
      happy1c,
      happy1d,
      happy2a,
      happy2b1,
      happy2b2,
      happy2c1,
      happy2c2,
      happy2d1,
      happy2d2
    ])
  ]).then(([sad, thinking, surprised, happy]) =>
    Object.freeze({ sad, thinking, surprised, happy })
  );
  return emotionPromise;
}
