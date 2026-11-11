import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import initSqlJs from "sql.js";
import { registerNotificationV17Routes } from "../server/notifications-v17.mjs";

const sqlJsDirectory = path.dirname(fileURLToPath(import.meta.resolve("sql.js")));
const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDirectory, file) });

function database() {
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON;");
  sqlite.run("CREATE TABLE member_users(id INTEGER PRIMARY KEY, username TEXT NOT NULL);");
  sqlite.run("INSERT INTO member_users(id,username) VALUES (1,'member1'),(2,'member2')");
  const db = {
    exec: (sql) => sqlite.exec(sql),
    prepare(sql) {
      return {
        run(...args) {
          sqlite.run(sql, args);
          return { changes: sqlite.getRowsModified() };
        },
        get(...args) {
          const statement = sqlite.prepare(sql);
          try {
            statement.bind(args);
            return statement.step() ? statement.getAsObject() : undefined;
          } finally { statement.free(); }
        },
        all(...args) {
          const statement = sqlite.prepare(sql);
          const rows = [];
          try {
            statement.bind(args);
            while (statement.step()) rows.push(statement.getAsObject());
            return rows;
          } finally { statement.free(); }
        }
      };
    },
    transaction(callback) {
      sqlite.run("BEGIN IMMEDIATE");
      try {
        const result = callback();
        sqlite.run("COMMIT");
        return result;
      } catch (error) {
        sqlite.run("ROLLBACK");
        throw error;
      }
    }
  };
  return { db, close: () => sqlite.close() };
}

const BASE_ID = "123456789012345678";
const NEXT_ID = "123456789012345679";
const THIRD_ID = "123456789012345680";
function announcement(id, content) {
  return {
    id,
    content,
    createdAt: "2026-11-11T12:00:00.000Z",
    author: { username: "PDD Staff" },
    embeds: []
  };
}

test("notifications officielles PDD: données privées par membre, lecture et préférences", async (t) => {
  const { db, close } = database();
  let clock = Date.UTC(2026, 10, 11, 12);
  let configured = true;
  let failDiscord = false;
  let announcements = [announcement(BASE_ID, "Première annonce")];
  let calls = 0;
  const app = express();
  app.use(express.json());
  function authenticateMember(req, res, next) {
    const matched = /^Bearer member-([12])$/.exec(req.get("authorization") || "");
    if (!matched) return res.status(401).json({ error: "Connexion membre nécessaire." });
    req.member = { sub: Number(matched[1]) };
    next();
  }
  function requireActiveMember(req, _res, next) {
    req.currentMember = { id: req.member.sub };
    next();
  }
  registerNotificationV17Routes({
    app, db, authenticateMember, requireActiveMember, now: () => clock,
    loadAnnouncements: async () => {
      calls += 1;
      if (failDiscord) throw Error("Discord unavailable");
      return { configured, announcements: [...announcements] };
    }
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    close();
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = async (url, memberId = 1, method = "GET", body) => {
    const response = await fetch(origin + url, {
      method,
      headers: {
        ...(memberId ? { Authorization: "Bearer member-" + memberId } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await response.json();
    return { status: response.status, payload: json, response };
  };

  await t.test("aucun membre anonyme ne peut consulter ou modifier les préférences", async () => {
    assert.equal((await request("/api/members/notifications", 0)).status, 401);
    assert.equal((await request("/api/members/notifications/read", 0, "POST", { all: true })).status, 401);
    assert.equal((await request("/api/members/notifications/settings", 0, "PUT",
      {announcementsEnabled: false})).status, 401);
  });

  await t.test("première visite: annonces antérieures visibles mais déjà lues", async () => {
    const first = await request("/api/members/notifications");
    assert.equal(first.status, 200);
    assert.equal(first.response.headers.get("cache-control"), "no-store");
    assert.equal(first.payload.items.length, 1);
    assert.equal(first.payload.items[0].id, BASE_ID);
    assert.equal(first.payload.items[0].body, "Première annonce");
    assert.equal(first.payload.items[0].read, true);
    assert.equal(first.payload.unreadCount, 0);
    assert.equal(first.payload.settings.announcementsEnabled, true);
    const secondMember = await request("/api/members/notifications", 2);
    assert.equal(secondMember.payload.unreadCount, 0);
    assert.equal(calls, 1); // shared 30-second bot response cache
  });

  await t.test("une nouvelle annonce est non lue pour chaque membre", async () => {
    announcements.push(announcement(NEXT_ID, "Nouvelle annonce PDD"));
    clock += 31_000; // expire 30-second cache
    const first = await request("/api/members/notifications", 1);
    const second = await request("/api/members/notifications", 2);
    assert.equal(first.payload.unreadCount, 1);
    assert.equal(second.payload.unreadCount, 1);
    assert.equal(first.payload.items[0].id, NEXT_ID);
    assert.equal(first.payload.items[0].read, false);
  });

  await t.test("marquer lu sur un membre ne modifie pas l'autre compte", async () => {
    const marked = await request("/api/members/notifications/read", 1, "POST",
      { ids: [NEXT_ID] });
    assert.equal(marked.status, 200);
    assert.equal(marked.payload.marked, 1);
    assert.equal((await request("/api/members/notifications", 1)).payload.unreadCount, 0);
    assert.equal((await request("/api/members/notifications", 2)).payload.unreadCount, 1);
  });

  await t.test("les IDs arbitraires et les requêtes malformées sont rejetés ou ignorés", async () => {
    assert.equal((await request("/api/members/notifications/read", 1, "POST",
      { ids: ["<script>"] })).status, 400);
    assert.equal((await request("/api/members/notifications/read", 1, "POST",
      { ids: Array(31).fill(NEXT_ID) })).status, 400);
    const notKnown = await request("/api/members/notifications/read", 1, "POST",
      { ids: [THIRD_ID] });
    assert.equal(notKnown.status, 200);
    assert.equal(notKnown.payload.marked, 0);
    assert.equal((await request("/api/members/notifications/settings", 1, "PUT",
      { announcementsEnabled: "no" })).status, 400);
  });

  await t.test("préférences par membre: arrêt des nouvelles alertes sans bloquer la boîte", async () => {
    const off = await request("/api/members/notifications/settings", 2, "PUT",
      { announcementsEnabled: false });
    assert.equal(off.status, 200);
    assert.equal(off.payload.settings.announcementsEnabled, false);
    announcements.push(announcement(THIRD_ID, "Annonce pendant la pause"));
    clock += 31_000;
    const checked = await request("/api/members/notifications", 2);
    assert.equal(checked.payload.settings.announcementsEnabled, false);
    assert.equal(checked.payload.unreadCount, 0);
    assert.equal(checked.payload.items.length, 3);
    const on = await request("/api/members/notifications/settings", 2, "PUT",
      { announcementsEnabled: true });
    assert.equal(on.status, 200);
    assert.equal((await request("/api/members/notifications", 2)).payload.unreadCount, 0);
    assert.equal((await request("/api/members/notifications", 1)).payload.unreadCount, 1);
  });

  await t.test("tout marquer comme lu et panne Discord", async () => {
    const marked = await request("/api/members/notifications/read", 1, "POST", { all: true });
    assert.equal(marked.payload.marked, 3);
    assert.equal((await request("/api/members/notifications", 1)).payload.unreadCount, 0);
    clock += 31_000;
    failDiscord = true;
    const unavailable = await request("/api/members/notifications", 1);
    assert.equal(unavailable.status, 502);
    failDiscord = false;
  });

  await t.test("un serveur Discord non configuré est annoncé sans créer d'alerte", async () => {
    configured = false;
    clock += 31_000;
    const response = await request("/api/members/notifications", 1);
    assert.equal(response.status, 200);
    assert.equal(response.payload.configured, false);
    assert.equal(response.payload.unreadCount, 0);
  });
});
