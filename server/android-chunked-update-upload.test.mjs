import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("./chunked-update-upload.mjs", import.meta.url), "utf8");
const startSource = fs.readFileSync(new URL("./start.mjs", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../web/android-update-upload.js", import.meta.url), "utf8");
const entrySource = fs.readFileSync(new URL("../web/app-entry.js", import.meta.url), "utf8");

test("le serveur expose le cycle complet d’envoi par morceaux", () => {
  assert.match(serverSource, /chunked\/start/);
  assert.match(serverSource, /chunked\/:uploadId\/:index/);
  assert.match(serverSource, /chunked\/:uploadId\/complete/);
  assert.match(serverSource, /MAX_UPDATE_SIZE = 350 \* 1024 \* 1024/);
});

test("les routes par morceaux sont enregistrées au démarrage du serveur", () => {
  assert.match(startSource, /registerChunkedUpdateUploadRoutes/);
  assert.match(startSource, /from "\.\/chunked-update-upload\.mjs"/);
});

test("Android découpe les gros fichiers avant leur envoi", () => {
  assert.match(clientSource, /ANDROID_CHUNK_SIZE = 4 \* 1024 \* 1024/);
  assert.match(clientSource, /file\.slice\(start, end\)/);
  assert.match(clientSource, /morceau \$\{index \+ 1\}\/\$\{totalChunks\}/);
});

test("le module Android est chargé uniquement dans le runtime Android", () => {
  assert.match(entrySource, /androidUpdateUpload: \(\) => import\("\.\/android-update-upload\.js"\)/);
  assert.match(entrySource, /if \(isAndroid\)[\s\S]*moduleLoaders\.androidUpdateUpload/);
});
