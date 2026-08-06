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

if (!configuredOrigins.includes("null")) {
  configuredOrigins.push("null");
}

process.env.MOBILE_ORIGINS = [...new Set(configuredOrigins)].join(",");

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
if (!source.includes('from "./chunked-update-upload.mjs"')) {
  extraImports.push('import { registerChunkedUpdateUploadRoutes } from "./chunked-update-upload.mjs";');
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
if (!source.includes('from "./member-conversations.mjs"')) {
  extraImports.push('import { registerMemberConversationRoutes } from "./member-conversations.mjs";');
}
if (!source.includes('from "./community-messaging.mjs"')) {
  extraImports.push('import { registerCommunityMessagingRoutes } from "./community-messaging.mjs";');
}
if (!source.includes('from "./pixel-helper-ai.mjs"')) {
  extraImports.push('import { registerPixelHelperAiRoutes } from "./pixel-helper-ai.mjs";');
}
if (!source.includes("authenticateAny")) {
  extraImports.push('import { authenticateAny } from "./auth.mjs";');
}
if (extraImports.length) {
  source = source.replace(
    'import "dotenv/config";',
    ['import "dotenv/config";', ...extraImports].join("\n")
  );
}

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

source = source.replace(
  /SELECT id, username, role, active, must_change_password, created_at\s+FROM staff_users\s+ORDER BY datetime\(created_at\) DESC/,
  `SELECT id, username, role, active, must_change_password, created_at
      FROM staff_users
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
if (!source.includes("registerChunkedUpdateUploadRoutes({")) {
  registrations.push(`registerChunkedUpdateUploadRoutes({
  app,
  authenticate,
  requireActiveStaff,
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
if (!source.includes("PIXEL_UPDATE_SETTINGS_COMPAT")) {
  registrations.unshift(`app.use("/api/admin/update-settings", (req, _res, next) => {
  // PIXEL_UPDATE_SETTINGS_COMPAT : les anciennes applications peuvent omettre
  // certains champs facultatifs. Ce middleware doit être enregistré avant les
  // deux gestionnaires de mise à jour, notamment celui qui ajoute Windows.
  if (req.method !== "PUT") return next();
  let current = {};
  try {
    current = db.prepare("SELECT * FROM app_update_settings WHERE id = 1").get() || {};
  } catch {
    current = {};
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  req.body = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : Boolean(current.enabled),
    latestVersion: body.latestVersion ?? current.latest_version ?? "0.2.0",
    minimumVersion: body.minimumVersion ?? current.minimum_version ?? "0.2.0",
    releaseNotes: body.releaseNotes ?? current.release_notes ?? "",
    androidUrl: body.androidUrl ?? current.android_url ?? "",
    macosArm64Url: body.macosArm64Url ?? current.macos_arm64_url ?? "",
    macosX64Url: body.macosX64Url ?? current.macos_x64_url ?? "",
    windowsX64Url: body.windowsX64Url ?? current.windows_x64_url ?? ""
  };
  next();
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
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});`);
}
if (!source.includes("registerMemberConversationRoutes({")) {
  registrations.push(`registerMemberConversationRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  createToken,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});`);
}
if (!source.includes("registerCommunityMessagingRoutes({")) {
  registrations.push(`registerCommunityMessagingRoutes({
  app,
  db,
  authenticateMember,
  requireActiveMember
});`);
}
if (!source.includes("registerPixelHelperAiRoutes({")) {
  registrations.push(`registerPixelHelperAiRoutes({
  app,
  db,
  authenticateAny
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
