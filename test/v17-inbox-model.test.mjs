import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_TABS, inboxSectionForPage, inboxUnreadTotals,
  inboxSearchMatch, normalizeUnread
} from "../web/v17-inbox-model.js";

test("Messagerie 2.0: onglets uniques et navigation depuis les pages existantes", () => {
  assert.deepEqual(INBOX_TABS.map((tab) => tab.id), [
    "private","staff","notifications"
  ]);
  assert.equal(inboxSectionForPage("page-conversations", true), "private");
  assert.equal(inboxSectionForPage("page-conversations", false), "staff");
  assert.equal(inboxSectionForPage("page-member-inbox"), "staff");
  assert.equal(inboxSectionForPage("page-v17-notifications"), "notifications");
  assert.equal(inboxSectionForPage("page-home"), null);
});

test("Messagerie 2.0: agrégation sans double compter le badge Discord", () => {
  const totals = inboxUnreadTotals({
    direct: 3, support: 2, letters: 4, notifications: 5
  });
  assert.deepEqual(totals,{private:3,staff:6,notifications:5,total:14});
  assert.deepEqual(inboxUnreadTotals(),{
    private:0,staff:0,notifications:0,total:0
  });
});

test("Messagerie 2.0: compteurs invalides ou négatifs ignorés", () => {
  assert.equal(normalizeUnread("5"),5);
  assert.equal(normalizeUnread("abc"),0);
  assert.equal(normalizeUnread(-1),0);
  assert.equal(normalizeUnread(Infinity),0);
  assert.equal(normalizeUnread(2.9),2);
  assert.equal(normalizeUnread(1_000_000),99999);
});

test("Messagerie 2.0: recherche de conversations insensible aux accents", () => {
  assert.equal(inboxSearchMatch("Émilie - Mon premier message", "emilie"),true);
  assert.equal(inboxSearchMatch("PDD Staff - Réclamation XP", "reclamation"),true);
  assert.equal(inboxSearchMatch("Membre - Bonjour", "Au revoir"),false);
  assert.equal(inboxSearchMatch(null,""),true);
});
