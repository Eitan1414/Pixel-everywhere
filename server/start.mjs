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
if (!source.includes('from "./account-deletion.mjs"')) {
  extraImports.push('import { registerAccountDeletionRoutes } from "./account-deletion.mjs";');
}
if (!source.includes('from "./suggestions.mjs"')) {
  extraImports.push('import { registerSuggestionRoutes } from "./suggestions.mjs";');
}
if (!source.includes('from "./admin-control.mjs"')) {
  extraImports.push('import { createManagedLoginLimiter, registerAdminControlRoutes } from "./admin-control.mjs";');
}
if (!source.includes('from "./windows-updates.mjs"')) {
  extraImports.push('import { registerWindowsUpdateRoutes } from "./windows-updates.mjs";');
}
if (!source.includes('from "./updates.mjs"')) {
  extraImports.push('import { registerUpdateRoutes } from "./updates.mjs";');
}
if (!source.includes('from "./creations.mjs"')) {
  extraImports.push('import { registerCreationRoutes } from "./creations.mjs";');
}
if (!source.includes('from "./community-announcements.mjs"')) {
  extraImports.push('import { registerCommunityAnnouncementRoutes } from "./community-announcements.mjs";');
}
if (extraImports.length) {
  source = source.replace(
    'import "dotenv/config";',
    ['import "dotenv/config";', ...extraImports].join("\n")
  );
}

// Les projets d’animation contiennent plusieurs PNG encodés. La validation des
// routes limite ensuite chaque projet à 9 Mo et 24 frames.
source = source.replace(
  'app.use(express.json({ limit: "32kb" }));',
  'app.use(express.json({ limit: "12mb" }));'
);

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

// La liste staff joint les candidatures aux comptes membres. Les deux tables ont
// une colonne created_at : sans alias SQLite refuse le tri comme ambigu.
source = source.replace(
  `CASE status
          WHEN 'pending' THEN 0
          WHEN 'reviewing' THEN 1
          ELSE 2
        END,
        datetime(created_at) DESC`,
  `CASE a.status
          WHEN 'pending' THEN 0
          WHEN 'reviewing' THEN 1
          ELSE 2
        END,
        datetime(a.created_at) DESC`
);

// Les comptes supprimés sont anonymisés pour conserver l’historique, puis masqués
// de la page utilisateurs.
source = source.replace(
  `FROM staff_users
      ORDER BY datetime(created_at) DESC`,
  `FROM staff_users
      WHERE deleted_at IS NULL
      ORDER BY datetime(created_at) DESC`
);

const registrations = [];
if (!source.includes("registerAccountDeletionRoutes({")) {
  registrations.push(`registerAccountDeletionRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  isOwnerAdmin
});`);
}
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
if (!source.includes("registerWindowsUpdateRoutes({")) {
  registrations.push(`registerWindowsUpdateRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin
});`);
}
if (!source.includes("registerUpdateRoutes({")) {
  registrations.push(`registerUpdateRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin
});`);
}
if (!source.includes("registerCreationRoutes({")) {
  registrations.push(`registerCreationRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});`);
}
if (!source.includes("registerCommunityAnnouncementRoutes({")) {
  registrations.push(`registerCommunityAnnouncementRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly
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
