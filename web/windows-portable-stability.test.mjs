import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [packageSource, workflow, windowsSupport, nativeStability, desktopLayout, updater, helper, electronMain] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/windows.yml", import.meta.url), "utf8"),
  readFile(new URL("./windows-support.js", import.meta.url), "utf8"),
  readFile(new URL("./native-interaction-stability.js", import.meta.url), "utf8"),
  readFile(new URL("./desktop-layout.css", import.meta.url), "utf8"),
  readFile(new URL("./app-updater.js", import.meta.url), "utf8"),
  readFile(new URL("./pixel-helper.js", import.meta.url), "utf8"),
  readFile(new URL("../electron/main.cjs", import.meta.url), "utf8")
]);
const packageJson = JSON.parse(packageSource);

test("Windows 0.31.26 est compilé avec un installateur complet", () => {
  assert.equal(packageJson.version, "0.31.26");
  assert.match(packageJson.scripts["win:build"], /--win nsis --x64/);
  assert.equal(packageJson.build.win.target[0].target, "nsis");
  assert.match(packageJson.build.win.artifactName, /Setup/);
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(packageJson.build.nsis.createDesktopShortcut, true);
  assert.equal(packageJson.build.nsis.createStartMenuShortcut, true);
  assert.match(workflow, /--win nsis --x64/);
  assert.match(workflow, /Windows-x64-Setup\.exe/);
  assert.doesNotMatch(workflow, /--win portable|Windows-x64-Portable\.exe/);
});

test("Windows masque complètement la barre File Edit View", () => {
  assert.match(electronMain, /Menu\.setApplicationMenu\(null\)/);
  assert.match(electronMain, /autoHideMenuBar: true/);
  assert.match(electronMain, /window\.setMenu\(null\)/);
  assert.match(electronMain, /window\.setMenuBarVisibility\(false\)/);
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
  assert.match(windowsSupport, /Télécharger l’installateur/);
});

test("toutes les catégories restent accessibles sur la barre desktop", () => {
  assert.match(desktopLayout, /repeat\(auto-fit, minmax\(78px, 1fr\)\)/);
  assert.match(desktopLayout, /overflow-x: auto/);
});

test("le runtime et le guide reconnaissent l’installateur Windows", () => {
  assert.match(updater, /desktop\?\.platform === "win32"/);
  assert.match(updater, /platform: "windows"/);
  assert.match(helper, /Setup\.exe/);
  assert.match(helper, /assistant/);
  assert.match(helper, /menu Démarrer/);
});
