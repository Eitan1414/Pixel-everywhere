import thinking1 from "./pixel-helper-emotions/thinking-1.js";
import thinking2 from "./pixel-helper-emotions/thinking-2.js";
import surprised1 from "./pixel-helper-emotions/surprised-1.js";
import surprised2 from "./pixel-helper-emotions/surprised-2.js";

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

function mascotUrl() {
  return new URL("assets/pixel-mascot.png", document.baseURI).href;
}

let emotionPromise;

export function loadPixelHelperEmotions() {
  emotionPromise ||= Promise.all([
    inflateImage([thinking1, thinking2]),
    inflateImage([surprised1, surprised2])
  ]).then(([thinking, surprised]) => {
    const sad = thinking;
    const happy = mascotUrl();
    return Object.freeze({ sad, thinking, surprised, happy });
  });
  return emotionPromise;
}
