import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_FILTERS, normalizedPinnedIds, conversationTimestamp,
  visibleConversation, sortConversations, RECENT_DAYS
} from "../web/v17-inbox-filters.js";

const now = Date.UTC(2026, 10, 11, 18, 30, 0);
const thread = (id, text, updatedAt, unread = 0, order = 0) => ({
  id, text, updatedAt, unread, order
});

test("Messagerie 2.0: quatre filtres cohérents et accessibles", () => {
  assert.deepEqual(INBOX_FILTERS.map(x => x.id), ["all","unread","recent","pinned"]);
  assert.equal(RECENT_DAYS, 7);
});

test("Messagerie 2.0: dates Discord/SQLite UTC et dates invalides", () => {
  assert.equal(conversationTimestamp("2026-11-11 18:30:00"), now);
  assert.equal(conversationTimestamp("2026-11-11T19:30:00+01:00"), now);
  assert.equal(conversationTimestamp("2026-11-11T18:30:00Z"), now);
  assert.equal(conversationTimestamp("invalide"), 0);
  assert.equal(conversationTimestamp(null), 0);
});

test("Messagerie 2.0: filtrer non-lus, récents et épinglés", () => {
  const recent = thread("21", "Réclamation de Pierre", "2026-11-10 18:30:00", 2);
  const old = thread("22", "Discussion de Louise", "2026-10-20 12:00:00", 0);
  const future = thread("23", "Message du futur", "2026-11-15 12:00:00", 0);
  assert.equal(visibleConversation(recent, {filter:"all",now}), true);
  assert.equal(visibleConversation(recent, {filter:"unread",now}), true);
  assert.equal(visibleConversation(old, {filter:"unread",now}), false);
  assert.equal(visibleConversation(recent, {filter:"recent",now}), true);
  assert.equal(visibleConversation(old, {filter:"recent",now}), false);
  assert.equal(visibleConversation(future, {filter:"recent",now}), false);
  assert.equal(visibleConversation(old, {filter:"pinned",pins:["22"],now}), true);
  assert.equal(visibleConversation(recent, {filter:"pinned",pins:["22"],now}), false);
});

test("Messagerie 2.0: recherche combinée aux filtres, accents ignorés", () => {
  const item = thread("42", "Émilie — Réunion modération", "2026-11-10 18:30:00", 1);
  assert.equal(visibleConversation(item, {filter:"unread",query:"emilie",now}), true);
  assert.equal(visibleConversation(item, {filter:"unread",query:"reunion",now}), true);
  assert.equal(visibleConversation(item, {filter:"pinned",query:"emilie",pins:["42"],now}), true);
  assert.equal(visibleConversation(item, {filter:"pinned",query:"emilie",pins:["43"],now}), false);
  assert.equal(visibleConversation(item, {filter:"all",query:"Pas le même",now}), false);
});

test("Messagerie 2.0: trier d'abord les épinglées, puis les plus récentes", () => {
  const newest = thread("3", "Troisième", "2026-11-11 17:00:00", 1, 0);
  const oldest = thread("1", "Première", "2026-10-11 12:00:00", 0, 2);
  const middle = thread("2", "Deuxième", "2026-11-10 12:00:00", 0, 1);
  const input = [oldest,newest,middle];
  assert.deepEqual(sortConversations(input,[]).map(x=>x.id),["3","2","1"]);
  assert.deepEqual(sortConversations(input,["1"]).map(x=>x.id),["1","3","2"]);
  assert.deepEqual(sortConversations(input,["1","2"]).map(x=>x.id),["2","1","3"]);
  assert.deepEqual(input.map(x=>x.id),["1","3","2"]);
});

test("Messagerie 2.0: ordre stable à date égale et ID indépendant des libellés", () => {
  const same = "2026-11-11 12:00:00";
  const threads = [
    thread("11","Un membre",same,0,2),
    thread("12","Un autre",same,0,0),
    thread("13","Même prénom",same,1,1)
  ];
  assert.deepEqual(sortConversations(threads,[]).map(x=>x.id),["12","13","11"]);
  assert.deepEqual(sortConversations(threads,["13"]).map(x=>x.id),["13","12","11"]);
});

test("Messagerie 2.0: la liste d'épingles est bornée, unique et sans injection", () => {
  assert.deepEqual(normalizedPinnedIds(null),[]);
  assert.deepEqual(normalizedPinnedIds(["7","7","42","invalid","<script>","-1",10]),["7","42"]);
  const many = Array.from({length:250},(_,i)=>String(i+1));
  assert.equal(normalizedPinnedIds(many).length,200);
});
