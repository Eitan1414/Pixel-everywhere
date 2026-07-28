import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/session-stability.js", import.meta.url), "utf8");

class MemoryStorage {
  #values = new Map();
  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }
  setItem(key, value) {
    this.#values.set(key, String(value));
  }
  removeItem(key) {
    this.#values.delete(key);
  }
}

class FakeEventTarget {
  constructor() {
    this.listeners = [];
  }
  addEventListener(type, listener, options) {
    this.listeners.push({ type, listener, options });
  }
}

class FakeForm extends FakeEventTarget {
  constructor(id) {
    super();
    this.id = id;
  }
}

function createContext({ fetchImpl = async () => new Response("{}", { status: 200 }) } = {}) {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const window = new FakeEventTarget();
  window.fetch = fetchImpl;
  window.setInterval = () => 0;
  window.setTimeout = (callback) => {
    callback();
    return 0;
  };

  const context = vm.createContext({
    AbortController,
    console,
    document: {
      body: { classList: { remove() {} } },
      createElement: () => ({ id: "", textContent: "" }),
      head: { append() {} },
      querySelector: () => null
    },
    EventTarget: FakeEventTarget,
    HTMLFormElement: FakeForm,
    localStorage,
    Response,
    sessionStorage,
    setTimeout,
    clearTimeout,
    window
  });

  vm.runInContext(source, context, { filename: "session-stability.js" });
  return { context, localStorage, window };
}

test("le gestionnaire membre historique en capture est bloqué sans analyser son nom", () => {
  createContext();

  const memberForm = new FakeForm("memberLoginForm");
  memberForm.addEventListener("submit", function fonctionMinifiee() {}, { capture: true });
  memberForm.addEventListener("submit", function gestionnaireOfficiel() {});

  assert.equal(memberForm.listeners.length, 1);
  assert.equal(memberForm.listeners[0].listener.name, "gestionnaireOfficiel");
});

test("une panne de validation distante conserve la session membre locale", async () => {
  const { localStorage, window } = createContext({
    fetchImpl: async () => {
      throw new TypeError("réseau indisponible");
    }
  });

  localStorage.setItem("pixel-member-token", "token-test");
  localStorage.setItem("pixel-member", JSON.stringify({
    id: 7,
    username: "pixel_test",
    displayName: "Pixel Test",
    points: 25
  }));

  const response = await window.fetch("https://example.test/api/members/me");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    member: {
      id: 7,
      username: "pixel_test",
      displayName: "Pixel Test",
      points: 25
    },
    cached: true
  });
});