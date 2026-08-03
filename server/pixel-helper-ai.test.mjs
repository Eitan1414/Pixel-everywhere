import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildLocalPixelReply,
  registerPixelHelperAiRoutes
} from "./pixel-helper-ai.mjs";

const source = await readFile(new URL("./pixel-helper-ai.mjs", import.meta.url), "utf8");
const start = await readFile(new URL("./start.mjs", import.meta.url), "utf8").catch(() => "");

test("le serveur Pixel Helper ne contacte aucun service externe", () => {
  assert.doesNotMatch(source, /Gemini|OpenAI|generativelanguage|GEMINI_API_KEY|OPENAI_API_KEY/i);
  assert.doesNotMatch(source, /fetch\(|https?:\/\//);
  assert.match(source, /pixel-helper-knowledge\.js/);
  assert.match(source, /fiches prédéfinies/);
});

test("les réponses locales tiennent compte du rôle", () => {
  const guest = buildLocalPixelReply({
    bot: "guide",
    role: "guest",
    page: "home",
    message: "Comment envoyer un MP ?"
  });
  const admin = buildLocalPixelReply({
    bot: "guide",
    role: "admin",
    page: "staff",
    message: "Comment gérer les comptes staff ?"
  });
  assert.match(guest.answer, /compte/);
  assert.match(admin.answer, /Panel admin/);
});

test("Pixel Guard fournit des conseils prédéfinis et prudents", () => {
  const result = buildLocalPixelReply({
    bot: "moderation",
    role: "moderator",
    page: "community-chat",
    message: "Plusieurs messages de spam arrivent rapidement"
  });
  assert.equal(result.topic, "spam");
  assert.match(result.answer, /réversible|vérifie/i);
});

test("les anciennes routes restent compatibles mais annoncent le mode local", () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); }
  };
  const db = {
    prepare(query) {
      return {
        get() {
          if (/member_users/.test(query)) return { id: 4 };
          return null;
        }
      };
    }
  };
  registerPixelHelperAiRoutes({ app, db, authenticateAny: (_req, _res, next) => next() });

  const statusResponse = {
    payload: null,
    json(payload) { this.payload = payload; return this; }
  };
  routes.get("GET /api/pixel-helper/status")({}, statusResponse);
  assert.equal(statusResponse.payload.local, true);
  assert.equal(statusResponse.payload.aiConfigured, false);
  assert.ok(statusResponse.payload.topics >= 32);
});

test("le lanceur conserve l’enregistrement de compatibilité", () => {
  if (!start) return;
  assert.match(start, /registerPixelHelperAiRoutes/);
});
