import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  helperKnowledgeStats,
  quickPromptsFor,
  resolvePixelHelperMessage
} from "./pixel-helper-knowledge.js";

const source = await readFile(new URL("./pixel-helper-bots.js", import.meta.url), "utf8");
const knowledge = await readFile(new URL("./pixel-helper-knowledge.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./pixel-helper-bots.css", import.meta.url), "utf8");
const entry = await readFile(new URL("./app-entry.js", import.meta.url), "utf8").catch(() => "");

test("Pixel Guide et Pixel Guard fonctionnent uniquement avec des fiches locales", () => {
  assert.match(source, /Pixel Guide/);
  assert.match(source, /Pixel Guard/);
  assert.match(source, /100 % local/);
  assert.match(source, /Aucune question n’est envoyée/);
  assert.doesNotMatch(source, /Gemini/i);
  assert.doesNotMatch(source, /OpenAI/i);
  assert.doesNotMatch(source, /pixel-helper\/ask/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(knowledge, /generativelanguage|api key|GEMINI_API_KEY/i);
});

test("la base contient beaucoup de possibilités de guide et de modération", () => {
  const stats = helperKnowledgeStats();
  assert.ok(stats.guideTopics >= 20);
  assert.ok(stats.moderationTopics >= 12);
  assert.ok(stats.totalTopics >= 32);
  assert.deepEqual(stats.roles, ["guest", "member", "moderator", "admin"]);
});

test("les réponses de guide ouvrent les bonnes catégories", () => {
  const chat = resolvePixelHelperMessage({ bot: "guide", role: "member", question: "Où est le chat public ?" });
  assert.equal(chat.topic, "public-chat");
  assert.equal(chat.action, "open-chat");
  assert.match(chat.answer, /mentions/);

  const pixel = resolvePixelHelperMessage({ bot: "guide", role: "member", question: "Comment nourrir mon Pixel ?" });
  assert.equal(pixel.topic, "pixel");
  assert.equal(pixel.action, "open-pixel");

  const updates = resolvePixelHelperMessage({ bot: "guide", role: "admin", question: "Comment publier une mise à jour ?" });
  assert.equal(updates.topic, "updates");
  assert.match(updates.answer, /administrateur|publier|fichiers/i);
});

test("les droits adaptent réellement les réponses", () => {
  const guest = resolvePixelHelperMessage({ bot: "guide", role: "guest", question: "Comment envoyer un MP ?" });
  const member = resolvePixelHelperMessage({ bot: "guide", role: "member", question: "Comment envoyer un MP ?" });
  const moderator = resolvePixelHelperMessage({ bot: "guide", role: "moderator", question: "Quels sont mes droits ?" });
  const admin = resolvePixelHelperMessage({ bot: "guide", role: "admin", question: "Comment gérer les comptes staff ?" });

  assert.match(guest.answer, /compte/);
  assert.match(member.answer, /enveloppe|MP/);
  assert.match(moderator.answer, /candidatures|modération|Avis/i);
  assert.match(admin.answer, /Panel admin/);
});

test("Pixel Guard distingue membres et staff sans sanction automatique", () => {
  const member = resolvePixelHelperMessage({
    bot: "moderation",
    role: "member",
    question: "Deux membres se disputent et se provoquent"
  });
  const staff = resolvePixelHelperMessage({
    bot: "moderation",
    role: "moderator",
    question: "Quelle sanction pour plusieurs messages de spam ?"
  });

  assert.equal(member.topic, "conflict");
  assert.match(member.answer, /préviens le staff|contexte/i);
  assert.equal(staff.topic, "spam");
  assert.match(staff.answer, /mesure courte|réversible|vérifie/i);
  assert.doesNotMatch(staff.answer, /j’ai banni|sanction automatique/i);
});

test("les cas sensibles reçoivent des consignes protectrices prédéfinies", () => {
  const danger = resolvePixelHelperMessage({
    bot: "moderation",
    role: "member",
    question: "Quelqu’un menace de faire du mal immédiatement"
  });
  const privacy = resolvePixelHelperMessage({
    bot: "moderation",
    role: "moderator",
    question: "Un message contient une adresse et un numéro"
  });
  assert.equal(danger.topic, "threat");
  assert.match(danger.answer, /adulte de confiance|services d’urgence/i);
  assert.equal(privacy.topic, "personal-data");
  assert.match(privacy.answer, /retire|masque|diffusion/i);
});

test("les questions rapides changent avec le rôle", () => {
  const guest = quickPromptsFor({ bot: "guide", role: "guest" });
  const admin = quickPromptsFor({ bot: "guide", role: "admin" });
  const guard = quickPromptsFor({ bot: "moderation", role: "moderator" });
  assert.ok(guest.some((item) => /compte membre/i.test(item)));
  assert.ok(admin.some((item) => /comptes staff|mise à jour/i.test(item)));
  assert.ok(guard.some((item) => /sanction|preuves|spam/i.test(item)));
});

test("l’interface conserve les raccourcis utiles et le statut local", () => {
  assert.match(source, /open-chat/);
  assert.match(source, /open-mp/);
  assert.match(source, /open-staff/);
  assert.match(source, /data-page-target/);
  assert.match(styles, /pixel-helper-local-status/);
  assert.match(styles, /pixel-helper-local-disclosure/);
  assert.match(styles, /pixel-helper-local-thinking/);
});

test("les deux boutons d’aide sont visibles à des hauteurs différentes", () => {
  assert.match(styles, /#pixelGuideButton[\s\S]*bottom: calc\(106px/);
  assert.match(styles, /#pixelHelperGuideButton[\s\S]*bottom: calc\(172px/);
  assert.match(styles, /#pixelGuideButton[\s\S]*display: inline-flex !important/);
  assert.match(styles, /#pixelHelperGuideButton[\s\S]*display: inline-flex !important/);
});

test("les assistants restent chargés après Pixel Helper interactif", () => {
  if (!entry) return;
  const interactive = entry.indexOf('loadOptional(moduleLoaders.pixelHelperInteractive, "tutoriel interactif Pixel Helper")');
  const bots = entry.indexOf('loadOptional(moduleLoaders.pixelHelperBots, "bots de guide et de modération Pixel Helper")');
  assert.ok(interactive >= 0);
  assert.ok(bots > interactive);
});
