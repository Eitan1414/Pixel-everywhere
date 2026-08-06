import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/desktop-network.js", import.meta.url), "utf8");

function createDesktopNetwork({ rendererFetch, apiRequest }) {
  const window = {
    fetch: rendererFetch,
    pixelDesktop: { apiRequest }
  };

  const context = vm.createContext({
    console,
    Headers,
    Request,
    Response,
    TypeError,
    URL,
    window
  });

  vm.runInContext(source, context, { filename: "desktop-network.js" });
  return window;
}

test("les requêtes ngrok Windows ajoutent toujours l’en-tête anti-avertissement", async () => {
  let capturedRequest = null;
  const window = createDesktopNetwork({
    rendererFetch: async (request) => {
      capturedRequest = request;
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    apiRequest: async () => {
      throw new Error("Le relais ne doit pas être utilisé");
    }
  });

  const response = await window.fetch("https://pixel-test.ngrok-free.dev/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "pixel", password: "test" })
  });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest.headers.get("ngrok-skip-browser-warning"), "pixel-everywhere");
  assert.equal(capturedRequest.headers.get("content-type"), "application/json");
});

test("une page HTML ngrok est remplacée par la vraie réponse du relais Electron", async () => {
  let relayedRequest = null;
  const window = createDesktopNetwork({
    rendererFetch: async () => new Response("<html><title>ngrok</title></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    }),
    apiRequest: async (request) => {
      relayedRequest = request;
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: '{"token":"windows-ok"}'
      };
    }
  });

  const response = await window.fetch("https://pixel-test.ngrok-free.app/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "pixel", password: "test" })
  });

  assert.deepEqual(await response.json(), { token: "windows-ok" });
  assert.equal(relayedRequest.headers["ngrok-skip-browser-warning"], "pixel-everywhere");
  assert.equal(relayedRequest.method, "POST");
});
