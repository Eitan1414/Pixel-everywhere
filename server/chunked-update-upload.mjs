import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_UPDATE_SIZE = 350 * 1024 * 1024;
const MAX_CHUNK_SIZE = 6 * 1024 * 1024;
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;

const targetFiles = {
  android: "Pixel-Everywhere-latest.apk",
  "macos-arm64": "Pixel-Everywhere-latest-macOS-arm64.zip",
  "macos-x64": "Pixel-Everywhere-latest-macOS-x64.zip",
  "windows-x64": "Pixel-Everywhere-latest-Windows-x64.exe"
};

const sessions = new Map();

function updateDirectory() {
  const directory = path.resolve(process.env.UPDATE_FILES_DIRECTORY || "updates");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function chunkDirectory() {
  const directory = path.join(updateDirectory(), ".chunked");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function targetPath(target) {
  return path.join(updateDirectory(), targetFiles[target]);
}

function fileMetadata(target) {
  const filepath = targetPath(target);
  if (!fs.existsSync(filepath)) {
    return { available: false, size: 0, updatedAt: null, filename: targetFiles[target] };
  }
  const stats = fs.statSync(filepath);
  return {
    available: stats.isFile(),
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    filename: path.basename(filepath)
  };
}

function requireTarget(req, res) {
  const target = String(req.params.target || "");
  if (!Object.hasOwn(targetFiles, target)) {
    res.status(404).json({ error: "Plateforme de mise à jour inconnue." });
    return null;
  }
  return target;
}

function removeSession(uploadId) {
  const session = sessions.get(uploadId);
  if (session) {
    fs.rmSync(session.tempPath, { force: true });
    sessions.delete(uploadId);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [uploadId, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE) removeSession(uploadId);
  }
}

async function sha256(filepath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filepath)) hash.update(chunk);
  return hash.digest("hex");
}

export function registerChunkedUpdateUploadRoutes({
  app,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin
}) {
  const directory = chunkDirectory();
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });

  const guards = [authenticate, requireActiveStaff, staffOnly, requireAdmin];

  app.post(
    "/api/admin/update-files/:target/chunked/start",
    ...guards,
    (req, res) => {
      cleanupExpiredSessions();
      const target = requireTarget(req, res);
      if (!target) return;

      const size = Number(req.body?.size);
      const totalChunks = Number(req.body?.totalChunks);
      const filename = String(req.body?.filename || targetFiles[target]).slice(0, 240);

      if (!Number.isInteger(size) || size <= 0 || size > MAX_UPDATE_SIZE) {
        return res.status(400).json({ error: "La taille du fichier est invalide ou dépasse 350 Mo." });
      }
      if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 1000) {
        return res.status(400).json({ error: "Le nombre de morceaux est invalide." });
      }

      const uploadId = crypto.randomUUID();
      const tempPath = path.join(directory, `${uploadId}.upload`);
      fs.writeFileSync(tempPath, "");
      sessions.set(uploadId, {
        uploadId,
        target,
        filename,
        size,
        totalChunks,
        nextIndex: 0,
        received: 0,
        tempPath,
        createdAt: Date.now()
      });

      res.status(201).json({
        uploadId,
        chunkSize: 4 * 1024 * 1024,
        message: "Envoi par morceaux initialisé."
      });
    }
  );

  app.put(
    "/api/admin/update-files/:target/chunked/:uploadId/:index",
    ...guards,
    async (req, res, next) => {
      const target = requireTarget(req, res);
      if (!target) return;

      const uploadId = String(req.params.uploadId || "");
      const index = Number(req.params.index);
      const session = sessions.get(uploadId);
      if (!session || session.target !== target) {
        return res.status(404).json({ error: "Cette session d’envoi n’existe plus. Recommence l’envoi." });
      }
      if (!Number.isInteger(index) || index !== session.nextIndex) {
        return res.status(409).json({
          error: `Morceau inattendu. Le serveur attend le morceau ${session.nextIndex + 1}.`
        });
      }

      const chunkPath = path.join(directory, `${uploadId}.${index}.part`);
      let chunkSize = 0;
      let tooLarge = false;
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          chunkSize += chunk.length;
          if (chunkSize > MAX_CHUNK_SIZE) {
            tooLarge = true;
            callback(new Error("UPDATE_CHUNK_TOO_LARGE"));
            return;
          }
          callback(null, chunk);
        }
      });

      try {
        await pipeline(req, meter, fs.createWriteStream(chunkPath, { flags: "wx" }));
        if (!chunkSize) {
          fs.rmSync(chunkPath, { force: true });
          return res.status(400).json({ error: "Le morceau envoyé est vide." });
        }
        if (session.received + chunkSize > session.size) {
          fs.rmSync(chunkPath, { force: true });
          return res.status(400).json({ error: "Les morceaux dépassent la taille annoncée du fichier." });
        }

        await pipeline(
          fs.createReadStream(chunkPath),
          fs.createWriteStream(session.tempPath, { flags: "a" })
        );
        fs.rmSync(chunkPath, { force: true });

        session.received += chunkSize;
        session.nextIndex += 1;
        session.createdAt = Date.now();

        res.json({
          ok: true,
          received: session.received,
          size: session.size,
          nextIndex: session.nextIndex
        });
      } catch (error) {
        fs.rmSync(chunkPath, { force: true });
        if (tooLarge || error?.message === "UPDATE_CHUNK_TOO_LARGE") {
          return res.status(413).json({ error: "Un morceau dépasse la limite autorisée." });
        }
        next(error);
      }
    }
  );

  app.post(
    "/api/admin/update-files/:target/chunked/:uploadId/complete",
    ...guards,
    async (req, res, next) => {
      const target = requireTarget(req, res);
      if (!target) return;

      const uploadId = String(req.params.uploadId || "");
      const session = sessions.get(uploadId);
      if (!session || session.target !== target) {
        return res.status(404).json({ error: "Cette session d’envoi n’existe plus. Recommence l’envoi." });
      }
      if (session.nextIndex !== session.totalChunks || session.received !== session.size) {
        return res.status(409).json({
          error: `Envoi incomplet : ${session.received} octets reçus sur ${session.size}.`
        });
      }

      try {
        const destination = targetPath(target);
        fs.rmSync(destination, { force: true });
        fs.renameSync(session.tempPath, destination);
        sessions.delete(uploadId);

        res.status(201).json({
          target,
          file: {
            ...fileMetadata(target),
            sha256: await sha256(destination)
          },
          message: "Le fichier de mise à jour est prêt sur le serveur."
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/api/admin/update-files/:target/chunked/:uploadId",
    ...guards,
    (req, res) => {
      const target = requireTarget(req, res);
      if (!target) return;
      const uploadId = String(req.params.uploadId || "");
      const session = sessions.get(uploadId);
      if (session && session.target === target) removeSession(uploadId);
      res.json({ ok: true });
    }
  );
}
