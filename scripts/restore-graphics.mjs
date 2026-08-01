import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

const desktopIcon = await decodeParts([
  "assets-encoded/desktop-icon-512.parts/part01.b64",
  "assets-encoded/desktop-icon-512.parts/part02.b64",
]);
verifyHash(desktopIcon, "f418ff487fc560e79bc4c8e4ee10e3ea7ee18f43d69150dcfa251afbd9c431b4", "Icône desktop");
verifyPng(desktopIcon, 512, 512, "Icône desktop");
await writeBytes("public/assets/desktop-icon.png", desktopIcon);
await writeBytes("public/assets/icon-512.png", desktopIcon);

console.log("Toutes les ressources graphiques desktop sont prêtes.");
