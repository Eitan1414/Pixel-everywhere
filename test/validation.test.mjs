import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptApplicationSchema,
  memberRegistrationSchema
} from "../server/validation.mjs";

test("une inscription membre ne peut fournir aucun rôle staff", () => {
  const result = memberRegistrationSchema.safeParse({
    displayName: "Pixel",
    username: "pixel.member",
    password: "mot-de-passe-membre",
    role: "admin"
  });

  assert.equal(result.success, false);
});

test("l’acceptation crée uniquement des identifiants sans rôle administrateur", () => {
  const valid = acceptApplicationSchema.safeParse({
    username: "nouveau.modo",
    password: "temporaire-123"
  });
  const escalationAttempt = acceptApplicationSchema.safeParse({
    username: "nouveau.modo",
    password: "temporaire-123",
    role: "admin"
  });

  assert.equal(valid.success, true);
  assert.equal(escalationAttempt.success, false);
  assert.equal("role" in valid.data, false);
});
