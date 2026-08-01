import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const root = process.cwd();

function cleanChunk(text, source) {
  const clean = text.replace(/\s+/g, "");
  if (!clean) {
    throw new Error(`${source}: contenu base64 vide.`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
    throw new Error(`${source}: caractères base64 invalides.`);
  }
  return clean;
}

async function decodeParts(sources) {
  const chunks = [];
  for (const source of sources) {
    const absolute = resolve(root, source);
    const text = await readFile(absolute, "utf8");
    chunks.push(cleanChunk(text, source));
  }

  const encoded = chunks.join("");
  if (encoded.length % 4 !== 0) {
    throw new Error(`Longueur base64 totale invalide pour ${sources.join(", ")}.`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error(`Placement du remplissage base64 invalide pour ${sources.join(", ")}.`);
  }

  const bytes = Buffer.from(encoded, "base64");
  const normalizedInput = encoded.replace(/=+$/, "");
  const normalizedOutput = bytes.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedOutput) {
    throw new Error(`Décodage base64 non réversible pour ${sources.join(", ")}.`);
  }
  return bytes;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyHash(bytes, expected, label) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label}: SHA-256 incorrect (${actual}).`);
  }
  console.log(`${label}: SHA-256 vérifié.`);
}

const crcTable = new Uint32Array(256);
for (let value = 0; value < 256; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[value] = crc >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyPng(bytes, width, height, label) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`${label}: signature PNG invalide.`);
  }

  const actualWidth = bytes.readUInt32BE(16);
  const actualHeight = bytes.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    throw new Error(`${label}: dimensions ${actualWidth}x${actualHeight}, attendu ${width}x${height}.`);
  }

  let offset = 8;
  let foundIend = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error(`${label}: bloc PNG tronqué à l’octet ${offset}.`);
    }

    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;

    if (nextOffset > bytes.length) {
      throw new Error(`${label}: bloc PNG incomplet à l’octet ${offset}.`);
    }

    const type = bytes.subarray(typeStart, dataStart).toString("ascii");
    const storedCrc = bytes.readUInt32BE(crcOffset);
    const calculatedCrc = crc32(bytes.subarray(typeStart, dataEnd));
    if (storedCrc !== calculatedCrc) {
      throw new Error(`${label}: CRC invalide pour le bloc ${type}.`);
    }

    if (type === "IEND") {
      if (length !== 0) {
        throw new Error(`${label}: bloc IEND invalide.`);
      }
      if (nextOffset !== bytes.length) {
        throw new Error(`${label}: données parasites après le bloc IEND.`);
      }
      foundIend = true;
      break;
    }

    offset = nextOffset;
  }

  if (!foundIend) {
    throw new Error(`${label}: bloc IEND absent.`);
  }

  console.log(`${label}: PNG ${width}x${height} et CRC vérifiés.`);
}

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const distanceLeft = Math.abs(prediction - left);
  const distanceUp = Math.abs(prediction - up);
  const distanceUpperLeft = Math.abs(prediction - upperLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) return left;
  if (distanceUp <= distanceUpperLeft) return up;
  return upperLeft;
}

function decodePngToRgba(bytes, label) {
  verifyPng(bytes, bytes.readUInt32BE(16), bytes.readUInt32BE(20), label);

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette = null;
  let transparency = null;
  const idatChunks = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`${label}: format PNG non pris en charge (profondeur ${bitDepth}, entrelacement ${interlace}).`);
  }

  let bytesPerPixel;
  if (colorType === 3) bytesPerPixel = 1;
  else if (colorType === 6) bytesPerPixel = 4;
  else if (colorType === 2) bytesPerPixel = 3;
  else throw new Error(`${label}: type de couleur PNG ${colorType} non pris en charge.`);

  if (colorType === 3 && !palette) {
    throw new Error(`${label}: palette PNG absente.`);
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (inflated.length !== expectedLength) {
    throw new Error(`${label}: données PNG inattendues (${inflated.length}, attendu ${expectedLength}).`);
  }

  const rows = Buffer.alloc(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous ? previous[x] : 0;
      const upperLeft = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = (raw + left) & 0xff;
      else if (filter === 2) value = (raw + up) & 0xff;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) value = (raw + paethPredictor(left, up, upperLeft)) & 0xff;
      else throw new Error(`${label}: filtre PNG ${filter} non pris en charge.`);

      row[x] = value;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const target = index * 4;
    if (colorType === 3) {
      const paletteIndex = rows[index];
      const paletteOffset = paletteIndex * 3;
      rgba[target] = palette[paletteOffset] ?? 0;
      rgba[target + 1] = palette[paletteOffset + 1] ?? 0;
      rgba[target + 2] = palette[paletteOffset + 2] ?? 0;
      rgba[target + 3] = transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
    } else if (colorType === 6) {
      const source = index * 4;
      rgba[target] = rows[source];
      rgba[target + 1] = rows[source + 1];
      rgba[target + 2] = rows[source + 2];
      rgba[target + 3] = rows[source + 3];
    } else {
      const source = index * 3;
      rgba[target] = rows[source];
      rgba[target + 1] = rows[source + 1];
      rgba[target + 2] = rows[source + 2];
      rgba[target + 3] = 255;
    }
  }

  return { width, height, rgba };
}

function resizeRgbaBilinear(source, targetWidth, targetHeight) {
  const output = Buffer.alloc(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * source.height) / targetHeight - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fractionY = Math.max(0, Math.min(1, sourceY - y0));

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * source.width) / targetWidth - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const fractionX = Math.max(0, Math.min(1, sourceX - x0));

      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = source.rgba[(y0 * source.width + x0) * 4 + channel];
        const topRight = source.rgba[(y0 * source.width + x1) * 4 + channel];
        const bottomLeft = source.rgba[(y1 * source.width + x0) * 4 + channel];
        const bottomRight = source.rgba[(y1 * source.width + x1) * 4 + channel];
        const top = topLeft + (topRight - topLeft) * fractionX;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * fractionX;
        output[(y * targetWidth + x) * 4 + channel] = Math.round(top + (bottom - top) * fractionY);
      }
    }
  }

  return output;
}

function createPngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function encodeRgbaPng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (1 + width * 4);
    raw[rowOffset] = 0;
    rgba.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(raw, { level: 9 })),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function writeBytes(target, bytes) {
  const absolute = resolve(root, target);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  console.log(`Ressource restaurée: ${target}`);
}

const assets = [
  ["assets-encoded/pdd-logo.jpg.b64", "public/assets/pdd-logo.jpg"],
  ["assets-encoded/alpha-logo.png.b64", "public/assets/alpha-logo.png"],
  ["assets-encoded/pixel-mascot.png.b64", "public/assets/pixel-mascot.png"],
  ["assets-encoded/pdd2-wordmark.png.b64", "public/assets/pdd2-wordmark.png"],
  ["assets-encoded/pixel-body.png.b64", "public/assets/pixel-body.png"],
  ["assets-encoded/pixel-eye.png.b64", "public/assets/pixel-eye.png"],
];

for (const [source, target] of assets) {
  await writeBytes(target, await decodeParts([source]));
}

const appLogo = await decodeParts([
  "assets-encoded/pixel-everywhere-logo-256.parts/part01.b64",
  "assets-encoded/pixel-everywhere-logo-256.parts/part02.b64",
  "assets-encoded/pixel-everywhere-logo-256.parts/part03.b64",
]);
verifyHash(appLogo, "925c5874c0c6a6b569dc1550a78b1be19099404649f68e0d5a293aa36205a506", "Logo application");
verifyPng(appLogo, 192, 192, "Logo application");
await writeBytes("public/assets/pixel-everywhere-logo.png", appLogo);
await writeBytes("public/assets/icon-192.png", appLogo);

console.log("Création de l’icône desktop 512x512 à partir du logo application validé...");
const decodedLogo = decodePngToRgba(appLogo, "Logo application source");
const desktopRgba = resizeRgbaBilinear(decodedLogo, 512, 512);
const desktopIcon = encodeRgbaPng(512, 512, desktopRgba);
verifyPng(desktopIcon, 512, 512, "Icône desktop générée");
console.log(`Icône desktop générée: SHA-256 ${sha256(desktopIcon)}.`);
await writeBytes("public/assets/desktop-icon.png", desktopIcon);
await writeBytes("public/assets/icon-512.png", desktopIcon);

console.log("Toutes les ressources graphiques desktop sont prêtes.");
