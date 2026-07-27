import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "test-secret-with-more-than-thirty-two-characters";

const {
  authenticate,
  authenticateMember,
  createToken
} = await import("../server/auth.mjs");

function runMiddleware(middleware, token) {
  const result = { nextCalled: false, status: null, body: null, req: null };
  const req = {
    get(name) {
      return name === "authorization" ? `Bearer ${token}` : "";
    }
  };
  const res = {
    status(value) {
      result.status = value;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    }
  };
  middleware(req, res, () => {
    result.nextCalled = true;
  });
  result.req = req;
  return result;
}

test("un jeton membre ne donne jamais accès au middleware staff", () => {
  const token = createToken({ id: 7, username: "pixel", role: "member" }, "member");
  const result = runMiddleware(authenticate, token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 401);
  assert.match(result.body.error, /session/i);
});

test("les jetons staff et membre sont acceptés uniquement dans leur espace", () => {
  const staffToken = createToken({ id: 1, username: "admin", role: "admin" }, "staff");
  const memberToken = createToken({ id: 2, username: "member", role: "member" }, "member");

  assert.equal(runMiddleware(authenticate, staffToken).nextCalled, true);
  assert.equal(runMiddleware(authenticateMember, memberToken).nextCalled, true);
  assert.equal(runMiddleware(authenticateMember, staffToken).status, 401);
});
