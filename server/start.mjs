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

const extraImports = [];
if (!source.includes('from "./suggestions.mjs"')) {
  extraImports.push('import { registerSuggestionRoutes } from "./suggestions.mjs";');
}
if (!source.includes('from "./admin-control.mjs"')) {
  extraImports.push('import { createManagedLoginLimiter, registerAdminControlRoutes } from "./admin-control.mjs";');
}
if (extraImports.length) {
  source = source.replace(
    'import "dotenv/config";',
    ['import "dotenv/config";', ...extraImports].join("\n")
  );
}

const originalLoginLimiterPattern = /const loginLimiter = rateLimit\(\{[\s\S]*?\n\}\);/;
const originalLoginLimiterMatch = source.match(originalLoginLimiterPattern);
if (originalLoginLimiterMatch && !source.includes("managedLoginLimiter")) {
  source = source.replace(
    originalLoginLimiterPattern,
    `${originalLoginLimiterMatch[0].replace("const loginLimiter =", "const fallbackLoginLimiter =")}
const managedLoginLimiter = createManagedLoginLimiter({ db });
const loginLimiter = (req, res, next) => {
  if (req.originalUrl.includes("/login")) return managedLoginLimiter(req, res, next);
  return fallbackLoginLimiter(req, res, next);
};`
  );
}

const registrations = [];
if (!source.includes("registerSuggestionRoutes({")) {
  registrations.push(`registerSuggestionRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});`);
}
if (!source.includes("registerAdminControlRoutes({")) {
  registrations.push(`registerAdminControlRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly,
  requireAdmin
});`);
}
if (registrations.length) {
  source = source.replace(
    'if (process.env.NODE_ENV === "production") {',
    `${registrations.join("\n\n")}\n\nif (process.env.NODE_ENV === "production") {`
  );
}

const previous = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";
if (previous !== source) fs.writeFileSync(runtimePath, source);

await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
