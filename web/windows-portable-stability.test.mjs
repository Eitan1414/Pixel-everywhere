import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [packageSource, workflow, windowsSupport, nativeStability, desktopLayout, updater, helper] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/windows.yml", import.meta.url), "utf8"),
  readFile(new URL("./windows-support.js", import.meta.url), "utf8"),
  readFile(new URL("./native-interaction-stability.js", import.meta.url), "utf8"),
  readFile(new URL("./desktop-layout.css", import.meta.url), "utf8"),
  readFile(new URL("./app-updater.js", import.meta.url), "utf8"),
  readFile(new URL("./pixel-helper.js", import.meta.url), "utf8")
]);
const packageJson = JSON.parse(packageSource);

test("Windows 0.31.26 est compilé en exécutable portable sans installateur", () => {
  assert.equal(packageJson.version, "0.31.26");
  assert.match(packageJson.scripts["win:build"], /--win portable --x64/);
  assert.equal(packageJson.build.win.target[0].target, "portable");
  assert.match(packageJson.build.win.artifactName, /Portable/);
  assert.equal(packageJson.build.nsis, undefined);
  assert.match(workflow, /--win portable --x64/);
  assert.match(workflow, /Windows-x64-Portable\.exe/);
  assert.doesNotMatch(workflow, /--win nsis|Windows-x64-Setup\.exe/);
});

test("Windows conserve les clics même si le serveur est indisponible", () => {
  assert.match(nativeStability, /const isWindows = isDesktop/);
  assert.match(nativeStability, /isAndroid \|\| isMacOS \|\| isWindows/);
  assert.match(nativeStability, /isWindows \? "windows"/);
  assert.match(nativeStability, /this\.show\(\)/);
});

test("les mises à jour Windows n’entraînent plus de rafale de mutations", () => {
  assert.match(windowsSupport, /windowsSettingsLoading/);
  assert.match(windowsSupport, /requestAnimationFrame/);
  assert.match(windowsSupport, /new MutationObserver\(scheduleWindowsUiRefresh\)/);
  assert.match(windowsSupport, /Télécharger la version portable/);
});

test("toutes les catégories restent accessibles sur la barre desktop", () => {
  assert.match(desktopLayout, /repeat\(auto-fit, minmax\(78px, 1fr\)\)/);
  assert.match(desktopLayout, /overflow-x: auto/);
});

test("le runtime et le guide reconnaissent la version portable Windows", () => {
  assert.match(updater, /desktop\?\.platform === "win32"/);
  assert.match(updater, /platform: "windows"/);
  assert.match(helper, /Portable\.exe/);
  assert.match(helper, /aucune installation n’est nécessaire/);
});
