import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

test("un MP 401 est renouvelé et rejoué sans recharger l'application", async () => {
  const calls = [];
  const sessionStorage = new MemoryStorage({
    "pixel-token": "staff-token-valid",
    "pixel-user": JSON.stringify({ id: 7, username: "Admin", role: "admin" })
  });
  const localStorage = new MemoryStorage({
    "pixel-member-token": "member-token-expired",
    "pixel-member": JSON.stringify({ id: 42, username: "staff-7", staffLinked: true, staffId: 7 })
  });

  globalThis.sessionStorage = sessionStorage;
  globalThis.localStorage = localStorage;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  globalThis.document = {
    querySelector: () => null,
    body: { classList: { remove() {} } },
    head: { append() {} },
    documentElement: { dataset: {} }
  };
  globalThis.window = globalThis;
  window.location = { href: "https://localhost/" };
  window.dispatchEvent = () => true;
  window.setTimeout = () => 0;
  window.PixelStaffMemberSession = { refresh() {} };

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const headers = new Headers(init.headers || {});
    calls.push({ url, authorization: headers.get("authorization") || "" });

    if (url.endsWith("/api/conversations/staff/member-profile")) {
      assert.equal(headers.get("authorization"), "Bearer staff-token-valid");
      return new Response(JSON.stringify({
        token: "member-token-renewed",
        member: {
          id: 42,
          username: "staff-7",
          displayName: "Admin · Administrateur",
          staffLinked: true,
          staffId: 7,
          staffRole: "admin"
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.endsWith("/api/member-direct/conversations")) {
      if (headers.get("authorization") === "Bearer member-token-expired") {
        return new Response(JSON.stringify({ error: "Session expirée ou invalide." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      assert.equal(headers.get("authorization"), "Bearer member-token-renewed");
      return new Response(JSON.stringify({ conversations: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`Requête inattendue : ${url}`);
  };

  await import(`./simple-startup.js?member-direct-runtime=${Date.now()}`);

  const response = await window.fetch(
    "https://reprimand-overprice-quickly.ngrok-free.dev/api/member-direct/conversations",
    { headers: { Authorization: "Bearer member-token-expired" } }
  );

  assert.equal(response.status, 200);
  assert.equal(localStorage.getItem("pixel-member-token"), "member-token-renewed");
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /\/api\/conversations\/staff\/member-profile$/);
  assert.equal(calls[2].authorization, "Bearer member-token-renewed");
});
