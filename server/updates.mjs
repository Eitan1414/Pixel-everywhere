import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { z } from "zod";

const DEFAULT_VERSION = "0.2.0";
const MAX_UPDATE_SIZE = 350 * 1024 * 1024;
const targetFiles = {
  android: "Pixel-Everywhere-latest.apk",
  "macos-arm64": "Pixel-Everywhere-latest-macOS-arm64.zip",
  "macos-x64": "Pixel-Everywhere-latest-macOS-x64.zip"
};

const settingsSchema = z.object({
  enabled: z.boolean(),
  latestVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Version invalide. Utilise par exemple 0.2.1."),
  minimumVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Version minimale invalide."),
  releaseNotes: z.string().trim().max(8000).default(""),
  androidUrl: z.string().trim().max(2000).default(""),
  macosArm64Url: z.string().trim().max(2000).default(""),
  macosX64Url: z.string().trim().max(2000).default("")
});

function validateOptionalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function versionParts(version) {
  return String(version || "0.0.0")
    .split(/[+-]/, 1)[0]
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function ensureUpdateTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_update_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      latest_version TEXT NOT NULL DEFAULT '${DEFAULT_VERSION}',
      minimum_version TEXT NOT NULL DEFAULT '${DEFAULT_VERSION}',
      release_notes TEXT NOT NULL DEFAULT '',
      android_url TEXT NOT NULL DEFAULT '',
      macos_arm64_url TEXT NOT NULL DEFAULT '',
      macos_x64_url TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES staff_users(id) ON DELETE SET NULL
    );

    INSERT OR IGNORE INTO app_update_settings
      (id, enabled, latest_version, minimum_version, release_notes)
    VALUES
      (1, 0, '${DEFAULT_VERSION}', '${DEFAULT_VERSION}', '');
  `);
}

function updateDirectory() {
  const directory = path.resolve(process.env.UPDATE_FILES_DIRECTORY || "updates");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function targetPath(target) {
  const filename = targetFiles[target];
  return filename ? path.join(updateDirectory(), filename) : null;
}

function fileMetadata(target) {
  const filepath = targetPath(target);
  if (!filepath || !fs.existsSync(filepath)) {
    return { available: false, size: 0, updatedAt: null, filename: targetFiles[target] || "" };
  }
  const stats = fs.statSync(filepath);
  return {
    available: stats.isFile(),
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    filename: path.basename(filepath)
  };
}

function publicSettings(row) {
  return {
    enabled: Boolean(row.enabled),
    latestVersion: row.latest_version,
    minimumVersion: row.minimum_version,
    releaseNotes: row.release_notes || "",
    androidUrl: row.android_url || "",
    macosArm64Url: row.macos_arm64_url || "",
    macosX64Url: row.macos_x64_url || "",
    updatedAt: row.updated_at
  };
}

function readSettings(db) {
  return db.prepare("SELECT * FROM app_update_settings WHERE id = 1").get();
}

function absoluteDownloadUrl(req, target) {
  return `${req.protocol}://${req.get("host")}/api/app/update/files/${encodeURIComponent(target)}`;
}

function selectedTarget(platform, arch) {
  if (platform === "android") return "android";
  if (platform === "macos") return arch === "arm64" ? "macos-arm64" : "macos-x64";
  return null;
}

function selectedCustomUrl(settings, target) {
  if (target === "android") return settings.android_url || "";
  if (target === "macos-arm64") return settings.macos_arm64_url || "";
  if (target === "macos-x64") return settings.macos_x64_url || "";
  return "";
}

function parseSettings(req, res, db) {
  const current = readSettings(db) || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const candidate = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : Boolean(current.enabled),
    latestVersion: body.latestVersion ?? current.latest_version ?? DEFAULT_VERSION,
    minimumVersion: body.minimumVersion ?? current.minimum_version ?? DEFAULT_VERSION,
    releaseNotes: body.releaseNotes ?? current.release_notes ?? "",
    androidUrl: body.androidUrl ?? current.android_url ?? "",
    macosArm64Url: body.macosArm64Url ?? current.macos_arm64_url ?? "",
    macosX64Url: body.macosX64Url ?? current.macos_x64_url ?? ""
  };
  const parsed = settingsSchema.safeParse(candidate);
  if (!parsed.success) {
    res.status(400).json({
      error: "Certains réglages de mise à jour sont invalides.",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return null;
  }
  const values = parsed.data;
  const urls = [values.androidUrl, values.macosArm64Url, values.macosX64Url];
  if (!urls.every(validateOptionalUrl)) {
    res.status(400).json({ error: "Les liens doivent être des adresses HTTP ou HTTPS valides." });
    return null;
  }
  if (compareVersions(values.minimumVersion, values.latestVersion) > 0) {
    res.status(400).json({ error: "La version minimale ne peut pas dépasser la dernière version." });
    return null;
  }
  return values;
}

function requireTarget(req, res) {
  const target = String(req.params.target || "");
  if (!Object.hasOwn(targetFiles, target)) {
    res.status(404).json({ error: "Plateforme de mise à jour inconnue." });
    return null;
  }
  return target;
}

function safeContentLength(req) {
  const value = Number.parseInt(req.get("content-length") || "0", 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function registerUpdateRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin
}) {
  ensureUpdateTables(db);
  updateDirectory();

  app.get("/api/app/update", (req, res) => {
    const settings = readSettings(db);
    const currentVersion = String(req.query.currentVersion || "0.0.0");
    const platform = String(req.query.platform || "web").toLowerCase();
    const arch = String(req.query.arch || "").toLowerCase();
    const target = selectedTarget(platform, arch);
    const customUrl = target ? selectedCustomUrl(settings, target) : "";
    const localFile = target ? fileMetadata(target) : { available: false };
    const downloadUrl = customUrl || (target && localFile.available ? absoluteDownloadUrl(req, target) : "");
    const newerVersionExists = compareVersions(settings.latest_version, currentVersion) > 0;
    const required = compareVersions(settings.minimum_version, currentVersion) > 0;
    const updateAvailable = Boolean(settings.enabled && newerVersionExists && downloadUrl);

    res.set("Cache-Control", "no-store");
    res.json({
      app: "Pixel Everywhere",
      currentVersion,
      latestVersion: settings.latest_version,
      minimumVersion: settings.minimum_version,
      updateAvailable,
      required: Boolean(updateAvailable && required),
      enabled: Boolean(settings.enabled),
      configured: Boolean(downloadUrl),
      platform,
      arch,
      target,
      downloadUrl,
      releaseNotes: settings.release_notes || "",
      updatedAt: settings.updated_at
    });
  });

  app.get("/api/app/update/files/:target", (req, res) => {
    const target = requireTarget(req, res);
    if (!target) return;
    const filepath = targetPath(target);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "Le fichier de mise à jour n’est pas encore disponible." });
    }
    res.set("Cache-Control", "no-store");
    res.download(filepath, path.basename(filepath));
  });

  app.get(
    "/api/admin/update-settings",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    (_req, res) => {
      const settings = readSettings(db);
      res.json({
        settings: publicSettings(settings),
        files: Object.fromEntries(
          Object.keys(targetFiles).map((target) => [target, fileMetadata(target)])
        )
      });
    }
  );

  app.put(
    "/api/admin/update-settings",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    (req, res) => {
      const values = parseSettings(req, res, db);
      if (!values) return;

      db.prepare(`
        UPDATE app_update_settings
        SET
          enabled = ?,
          latest_version = ?,
          minimum_version = ?,
          release_notes = ?,
          android_url = ?,
          macos_arm64_url = ?,
          macos_x64_url = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        values.enabled ? 1 : 0,
        values.latestVersion,
        values.minimumVersion,
        values.releaseNotes,
        values.androidUrl,
        values.macosArm64Url,
        values.macosX64Url,
        req.currentUser.id
      );

      res.json({
        settings: publicSettings(readSettings(db)),
        message: values.enabled
          ? "Le système de mises à jour automatiques est activé."
          : "Les réglages sont enregistrés, mais la diffusion automatique reste désactivée."
      });
    }
  );

  app.put(
    "/api/admin/update-files/:target",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    async (req, res, next) => {
      const target = requireTarget(req, res);
      if (!target) return;

      const declaredSize = safeContentLength(req);
      if (declaredSize > MAX_UPDATE_SIZE) {
        return res.status(413).json({ error: "Le fichier dépasse la limite de 350 Mo." });
      }

      const destination = targetPath(target);
      const temporary = `${destination}.upload-${Date.now()}`;
      const hash = crypto.createHash("sha256");
      let size = 0;
      let exceeded = false;

      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > MAX_UPDATE_SIZE) {
            exceeded = true;
            callback(new Error("UPDATE_FILE_TOO_LARGE"));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });

      try {
        await pipeline(req, meter, fs.createWriteStream(temporary, { flags: "wx" }));
        if (!size) {
          fs.rmSync(temporary, { force: true });
          return res.status(400).json({ error: "Le fichier envoyé est vide." });
        }
        fs.renameSync(temporary, destination);
        const metadata = fileMetadata(target);
        res.status(201).json({
          target,
          file: {
            ...metadata,
            sha256: hash.digest("hex")
          },
          message: "Le fichier de mise à jour est prêt sur le serveur."
        });
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        if (exceeded || error?.message === "UPDATE_FILE_TOO_LARGE") {
          return res.status(413).json({ error: "Le fichier dépasse la limite de 350 Mo." });
        }
        next(error);
      }
    }
  );

  app.delete(
    "/api/admin/update-files/:target",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    (req, res) => {
      const target = requireTarget(req, res);
      if (!target) return;
      fs.rmSync(targetPath(target), { force: true });
      res.json({ ok: true, message: "Le fichier de mise à jour a été supprimé." });
    }
  );
}

export { compareVersions };
