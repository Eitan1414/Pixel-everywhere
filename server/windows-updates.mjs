import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

const DEFAULT_VERSION = "0.2.0";
const MAX_UPDATE_SIZE = 350 * 1024 * 1024;
const targetFiles = {
  android: "Pixel-Everywhere-latest.apk",
  "macos-arm64": "Pixel-Everywhere-latest-macOS-arm64.zip",
  "macos-x64": "Pixel-Everywhere-latest-macOS-x64.zip",
  "windows-x64": "Pixel-Everywhere-latest-Windows-x64.exe"
};

const settingsSchema = z.object({
  enabled: z.boolean(),
  latestVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Version invalide. Utilise par exemple 0.3.6."),
  minimumVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Version minimale invalide."),
  releaseNotes: z.string().trim().max(8000),
  androidUrl: z.string().trim().max(2000),
  macosArm64Url: z.string().trim().max(2000),
  macosX64Url: z.string().trim().max(2000),
  windowsX64Url: z.string().trim().max(2000)
}).strict();

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

function ensureSettingsTable(db) {
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
      windows_x64_url TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES staff_users(id) ON DELETE SET NULL
    );
  `);

  const columns = db.prepare("PRAGMA table_info(app_update_settings)").all();
  if (!columns.some((column) => column.name === "windows_x64_url")) {
    db.exec("ALTER TABLE app_update_settings ADD COLUMN windows_x64_url TEXT NOT NULL DEFAULT '';");
  }

  db.exec(`
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

function readSettings(db) {
  return db.prepare("SELECT * FROM app_update_settings WHERE id = 1").get();
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
    windowsX64Url: row.windows_x64_url || "",
    updatedAt: row.updated_at
  };
}

function absoluteDownloadUrl(req, target) {
  return `${req.protocol}://${req.get("host")}/api/app/update/files/${encodeURIComponent(target)}`;
}

function parseSettings(req, res) {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Certains réglages de mise à jour sont invalides.",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return null;
  }

  const values = parsed.data;
  const urls = [
    values.androidUrl,
    values.macosArm64Url,
    values.macosX64Url,
    values.windowsX64Url
  ];
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

function safeContentLength(req) {
  const value = Number.parseInt(req.get("content-length") || "0", 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function registerWindowsUpdateRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin
}) {
  ensureSettingsTable(db);
  updateDirectory();

  // Cette route précède la route historique. Elle ne répond que pour Windows
  // et laisse Android/macOS continuer dans updates.mjs.
  app.get("/api/app/update", (req, res, next) => {
    const platform = String(req.query.platform || "web").toLowerCase();
    if (!["windows", "win32"].includes(platform)) return next();

    const settings = readSettings(db);
    const currentVersion = String(req.query.currentVersion || "0.0.0");
    const target = "windows-x64";
    const customUrl = settings.windows_x64_url || "";
    const localFile = fileMetadata(target);
    const downloadUrl = customUrl || (localFile.available ? absoluteDownloadUrl(req, target) : "");
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
      platform: "windows",
      arch: "x64",
      target,
      downloadUrl,
      releaseNotes: settings.release_notes || "",
      updatedAt: settings.updated_at
    });
  });

  app.get("/api/app/update/files/windows-x64", (_req, res) => {
    const filepath = targetPath("windows-x64");
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "Le fichier Windows n’est pas encore disponible." });
    }
    res.set("Cache-Control", "no-store");
    res.download(filepath, path.basename(filepath));
  });

  // Ces deux routes remplacent les réponses historiques afin que le panneau
  // admin lise et enregistre les quatre plateformes en une seule opération.
  app.get(
    "/api/admin/update-settings",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    (_req, res) => {
      res.json({
        settings: publicSettings(readSettings(db)),
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
      const values = parseSettings(req, res);
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
          windows_x64_url = ?,
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
        values.windowsX64Url,
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
    "/api/admin/update-files/windows-x64",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    async (req, res, next) => {
      const declaredSize = safeContentLength(req);
      if (declaredSize > MAX_UPDATE_SIZE) {
        return res.status(413).json({ error: "Le fichier dépasse la limite de 350 Mo." });
      }

      const destination = targetPath("windows-x64");
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
        res.status(201).json({
          target: "windows-x64",
          file: {
            ...fileMetadata("windows-x64"),
            sha256: hash.digest("hex")
          },
          message: "L’installateur Windows 64 bits est prêt sur le serveur."
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
    "/api/admin/update-files/windows-x64",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    (_req, res) => {
      fs.rmSync(targetPath("windows-x64"), { force: true });
      res.json({ ok: true, message: "Le fichier de mise à jour Windows a été supprimé." });
    }
  );
}
