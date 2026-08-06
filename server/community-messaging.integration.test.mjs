import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "pixel-community-messaging-"));
process.env.DATA_DIRECTORY = dataDirectory;

const [{ db }, { registerCommunityMessagingRoutes }] = await Promise.all([
  import(`./db.mjs?community-messaging=${Date.now()}`),
  import("./community-messaging.mjs")
]);

after(async () => {
  await rm(dataDirectory, { recursive: true, force: true });
});

function createMember(username, displayName) {
  return Number(db.prepare(`
    INSERT INTO member_users (username, password_hash, display_name)
    VALUES (?, 'test-hash', ?)
  `).run(username, displayName).lastInsertRowid);
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

const routes = new Map();
const app = {};
for (const method of ["get", "post", "delete"]) {
  app[method] = (route, ...handlers) => {
    routes.set(`${method.toUpperCase()} ${route}`, handlers.at(-1));
  };
}

registerCommunityMessagingRoutes({
  app,
  db,
  authenticateMember: (_req, _res, next) => next(),
  requireActiveMember: (_req, _res, next) => next()
});

const aliceId = createMember("alice-test", "Alice");
const bobId = createMember("bob-test", "Bob");

test("le chat public enregistre et relit un message réel", () => {
  const postResponse = createResponse();
  routes.get("POST /api/community-chat/messages")({
    body: { body: "Bonjour la communauté !" },
    currentMember: { id: aliceId },
    query: {},
    params: {}
  }, postResponse);
  assert.equal(postResponse.statusCode, 201);
  assert.ok(Number(postResponse.payload.messageId) > 0);

  const getResponse = createResponse();
  routes.get("GET /api/community-chat/messages")({
    query: {},
    currentMember: { id: bobId },
    params: {}
  }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.payload.messages.length, 1);
  assert.equal(getResponse.payload.messages[0].body, "Bonjour la communauté !");
  assert.equal(Number(getResponse.payload.messages[0].sender_member_id), aliceId);
});

test("deux membres peuvent ouvrir, lire et poursuivre un MP", () => {
  const createResponseValue = createResponse();
  routes.get("POST /api/member-direct/conversations")({
    body: { recipientMemberId: bobId, body: "Salut Bob" },
    currentMember: { id: aliceId },
    params: {},
    query: {}
  }, createResponseValue);
  assert.equal(createResponseValue.statusCode, 201);
  const conversationId = Number(createResponseValue.payload.conversationId);
  assert.ok(conversationId > 0);

  const bobListResponse = createResponse();
  routes.get("GET /api/member-direct/conversations")({
    currentMember: { id: bobId },
    params: {},
    query: {}
  }, bobListResponse);
  assert.equal(Number(bobListResponse.payload.conversations[0].unread_count), 1);

  const bobReadResponse = createResponse();
  routes.get("GET /api/member-direct/conversations/:id")({
    currentMember: { id: bobId },
    params: { id: conversationId },
    query: {}
  }, bobReadResponse);
  assert.equal(bobReadResponse.statusCode, 200);
  assert.equal(bobReadResponse.payload.messages[0].body, "Salut Bob");

  const replyResponse = createResponse();
  routes.get("POST /api/member-direct/conversations/:id/messages")({
    currentMember: { id: bobId },
    params: { id: conversationId },
    body: { body: "Salut Alice" },
    query: {}
  }, replyResponse);
  assert.equal(replyResponse.statusCode, 201);

  const aliceReadResponse = createResponse();
  routes.get("GET /api/member-direct/conversations/:id")({
    currentMember: { id: aliceId },
    params: { id: conversationId },
    query: {}
  }, aliceReadResponse);
  assert.deepEqual(
    aliceReadResponse.payload.messages.map((message) => message.body),
    ["Salut Bob", "Salut Alice"]
  );
});
