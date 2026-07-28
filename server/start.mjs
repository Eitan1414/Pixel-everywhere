import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultOrigins = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
];

const configuredOrigins = (process.env.MOBILE_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Une application Electron empaquetée est chargée depuis file://. Les navigateurs
// sérialisent alors son origine opaque sous la valeur littérale "null" lors des
// requêtes CORS vers le serveur HTTPS/ngrok.
if (!configuredOrigins.includes("null")) {
  configuredOrigins.push("null");
}

process.env.MOBILE_ORIGINS = [...new Set(configuredOrigins)].join(",");

// Le serveur Termux est exposé par un seul proxy inverse ngrok. Sans ce réglage,
// express-rate-limit considère X-Forwarded-For comme inattendu et les routes
// limitées (connexion et inscription) terminent en erreur HTTP 500.
const configuredProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
const proxyHops = Number.isInteger(configuredProxyHops) && configuredProxyHops >= 0
  ? configuredProxyHops
  : 1;
const originalApplicationInit = express.application.init;
express.application.init = function initWithNgrokProxyTrust() {
  originalApplicationInit.call(this);
  this.set("trust proxy", proxyHops);
};

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(serverDirectory, "index.mjs");
const runtimePath = path.join(serverDirectory, "index.runtime.mjs");
let source = fs.readFileSync(sourcePath, "utf8");

if (!source.includes('from "./suggestions.mjs"')) {
  source = source.replace(
    'import "dotenv/config";',
    'import "dotenv/config";\nimport { registerSuggestionRoutes } from "./suggestions.mjs";'
  );
}

const registration = `registerSuggestionRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});

`;

if (!source.includes("registerSuggestionRoutes({")) {
  source = source.replace(
    'if (process.env.NODE_ENV === "production") {',
    `${registration}if (process.env.NODE_ENV === "production") {`
  );
}

const previous = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";
if (previous !== source) fs.writeFileSync(runtimePath, source);

await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
