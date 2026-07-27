import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptApplicationSchema,
  activityRewardSchema,
  memberRegistrationSchema,
  petActionSchema,
  xpConversionSchema
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

test("une conversion XP exige un nombre entier positif de pièces", () => {
  assert.equal(xpConversionSchema.safeParse({
    discordUsername: "pixel_discord",
    amount: 10
  }).success, true);
  assert.equal(xpConversionSchema.safeParse({
    discordUsername: "pixel_discord",
    amount: 0
  }).success, false);
});

test("le gain d’activité n’accepte que le démarrage ou une minute active", () => {
  assert.equal(activityRewardSchema.safeParse({ mode: "start" }).success, true);
  assert.equal(activityRewardSchema.safeParse({ mode: "minute" }).success, true);
  assert.equal(activityRewardSchema.safeParse({ mode: "afk" }).success, false);
});

test("seules les actions Pixel connues peuvent dépenser des pièces", () => {
  assert.equal(petActionSchema.safeParse({ action: "walk" }).success, true);
  assert.equal(petActionSchema.safeParse({ action: "spam" }).success, false);
});
