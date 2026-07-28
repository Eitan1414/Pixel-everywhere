const { app, ipcMain } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");

const MAX_UPDATE_BYTES = 350 * 1024 * 1024;
const UPDATE_TIMEOUT = 30 * 60 * 1000;

function safeDownloadUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function safeVersion(value) {
  const version = String(value || "update").replace(/[^0-9A-Za-z._+-]/g, "-");
  return version.slice(0, 80) || "update";
}

function emitProgress(event, payload) {
  if (!event.sender.isDestroyed()) {
    event.sender.send("pixel:update-progress", payload);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => { errorOutput += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `${command} a échoué (${code}).`));
    });
  });
}

function findAppBundle(directory) {
  const queue = [directory];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && entry.name.endsWith(".app")) return fullPath;
      if (entry.isDirectory()) queue.push(fullPath);
    }
  }
  return "";
}

function currentMacBundle() {
  const executable = app.getPath("exe");
  const marker = ".app" + path.sep;
  const index = executable.indexOf(marker);
  return index >= 0 ? executable.slice(0, index + 4) : "";
}

async function prepareMacInstall(zipPath, event) {
  const targetBundle = currentMacBundle();
  if (!targetBundle) {
    throw new Error("Pixel Everywhere doit être lancé depuis son application .app pour être remplacé automatiquement.");
  }

  const parent = path.dirname(targetBundle);
  try {
    fs.accessSync(parent, fs.constants.W_OK);
  } catch {
    throw new Error("Le dossier de l’application n’est pas modifiable. Replace Pixel Everywhere dans ton dossier Applications puis réessaie.");
  }

  emitProgress(event, { stage: "preparing", percent: 92 });
  const extractDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-update-mac-"));
  await run("/usr/bin/ditto", ["-x", "-k", zipPath, extractDirectory]);
  const sourceBundle = findAppBundle(extractDirectory);
  if (!sourceBundle) {
    fs.rmSync(extractDirectory, { recursive: true, force: true });
    throw new Error("L’archive macOS ne contient pas l’application Pixel Everywhere.");
  }

  const scriptPath = path.join(os.tmpdir(), `pixel-update-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, `#!/bin/sh
PID="$1"
SOURCE="$2"
TARGET="$3"
WORK="$4"
ZIP="$5"
BACKUP="${targetBundle}.pixel-backup"
while kill -0 "$PID" 2>/dev/null; do sleep 0.4; done
rm -rf "$BACKUP"
if [ -e "$TARGET" ]; then mv "$TARGET" "$BACKUP" || exit 1; fi
if /usr/bin/ditto "$SOURCE" "$TARGET"; then
  rm -rf "$BACKUP"
  /usr/bin/open "$TARGET"
  rm -rf "$WORK" "$ZIP" "$0"
  exit 0
fi
rm -rf "$TARGET"
if [ -e "$BACKUP" ]; then mv "$BACKUP" "$TARGET"; /usr/bin/open "$TARGET"; fi
exit 1
`, { mode: 0o700 });

  const helper = spawn("/bin/sh", [
    scriptPath,
    String(process.pid),
    sourceBundle,
    targetBundle,
    extractDirectory,
    zipPath
  ], { detached: true, stdio: "ignore" });
  helper.unref();
  emitProgress(event, { stage: "installing", percent: 100 });
  setTimeout(() => app.quit(), 700);
  return { started: true, message: "La mise à jour macOS est prête. Pixel Everywhere va redémarrer." };
}

function startWindowsInstall(installerPath, event) {
  emitProgress(event, { stage: "installing", percent: 100 });
  const installer = spawn(installerPath, ["/S"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  installer.unref();
  setTimeout(() => app.quit(), 700);
  return { started: true, message: "L’installation Windows est lancée. Pixel Everywhere va redémarrer." };
}

ipcMain.handle("pixel:install-update", async (event, request = {}) => {
  if (!["win32", "darwin"].includes(process.platform)) {
    throw new Error("L’installation automatique de bureau n’est pas disponible sur cette plateforme.");
  }

  const url = safeDownloadUrl(request.url);
  if (!url) throw new Error("Le lien de mise à jour est invalide.");
  const version = safeVersion(request.version);
  const extension = process.platform === "win32" ? ".exe" : ".zip";
  const directory = path.join(app.getPath("temp"), "pixel-everywhere-updates");
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `Pixel-Everywhere-${version}${extension}`);
  const temporary = `${destination}.part`;
  fs.rmSync(temporary, { force: true });

  const headers = {};
  if ((url.hostname || "").includes("ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT);
  let received = 0;
  let total = 0;
  let lastEmission = 0;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`Le serveur a refusé le téléchargement (${response.status}).`);
    }

    total = Number.parseInt(response.headers.get("content-length") || "0", 10) || 0;
    if (total > MAX_UPDATE_BYTES) throw new Error("Le fichier de mise à jour dépasse 350 Mo.");

    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_UPDATE_BYTES) {
          callback(new Error("Le fichier de mise à jour dépasse 350 Mo."));
          return;
        }
        const now = Date.now();
        if (now - lastEmission >= 180 || (total && received >= total)) {
          lastEmission = now;
          emitProgress(event, {
            stage: "downloading",
            received,
            total,
            percent: total ? Math.min(90, (received / total) * 90) : 0
          });
        }
        callback(null, chunk);
      }
    });

    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(temporary, { flags: "wx" }));
    if (!received) throw new Error("Le fichier téléchargé est vide.");
    fs.rmSync(destination, { force: true });
    fs.renameSync(temporary, destination);

    emitProgress(event, { stage: "preparing", percent: 92, received, total });
    if (process.platform === "win32") return startWindowsInstall(destination, event);
    return await prepareMacInstall(destination, event);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    if (error?.name === "AbortError") {
      throw new Error("Le téléchargement a dépassé trente minutes.");
    }
    throw new Error(error?.message || "Impossible d’installer automatiquement la mise à jour.");
  } finally {
    clearTimeout(timeout);
  }
});
