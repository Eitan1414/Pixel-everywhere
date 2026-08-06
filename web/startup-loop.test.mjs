import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const startup = await readFile(new URL("./simple-startup.js", import.meta.url), "utf8");
const staffSession = await readFile(new URL("./staff-member-session.js", import.meta.url), "utf8");

test("l’intro Android ne peut être affichée qu’une fois par session WebView", () => {
  assert.match(startup, /pixel-android-intro-started-session/);
  assert.match(startup, /pixelSkipRepeatedAndroidIntro/);
  assert.match(startup, /androidStartupAnimation/);
});

test("la synchronisation staff ne recharge jamais automatiquement l’application", () => {
  assert.doesNotMatch(staffSession, /window\.location\.reload/);
  assert.doesNotMatch(staffSession, /reloadAfterChange/);
  assert.match(staffSession, /synchronizeStaffMemberSession\(\)/);
});
