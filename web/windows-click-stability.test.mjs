import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./windows-support.js", import.meta.url), "utf8");

test("la décoration Windows ne réécrit pas continuellement le DOM", () => {
  assert.match(source, /instructions\.textContent !== instructionText/);
  assert.match(source, /button\.textContent !== buttonText/);
  assert.match(source, /new MutationObserver/);
});
