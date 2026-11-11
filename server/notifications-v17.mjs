import { fetchAnnouncements } from "./discord.mjs";

const DISCORD_ID = /^\\d{15,25}$/;
const CACHE_MS = 30_000;
const MAX_ITEMS = 30;
const MAX_READ_IDS = 30;
const RETENTION_DAYS = 90;

function cleanAnnouncements(result) {
  if (!result?.configured) return { configured: false, items: [] };
  const announcements = Array.isArray(result.announcements) ? result.announcements : [];
  const seen = new Set();
  const items = [];
  for (const item of [...announcements].reverse()) {
    const id = String(item?.id || "");
    if (!DISCORD_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: "Nouvelle annonce PDD",
      body: String(item.content || item.embeds?.[0]?.description || item.embeds?.[0]?.title ||
        "Une nouvelle annonce a été publiée sur Discord.").slice(0, 450),
      author: String(item.author?.username || "PDD").slice(0, 80),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
      category: "announcement"
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { configured: true, items };
}

export function registerNotificationV17Routes({
  app, db, authenticateMember, requireActiveMember,
  loadAnnouncements = fetchAnnouncements, now = () => Date.now()
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_notification_settings (
      member_id INTEGER PRIMARY KEY REFERENCES member_users(id) ON DELETE CASCADE,
      announcements_enabled INTEGER NOT NULL DEFAULT 1 CHECK(announcements_enabled IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS member_notification_reads (
      member_id INTEGER NOT NULL REFERENCES member_users(id) ON DELETE CASCADE,
      announcement_id TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, announcement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_notification_reads_at
      ON member_notification_reads(read_at);
  `);

  const memberOnly = [authenticateMember, requireActiveMember];
  const writeRead = db.prepare(
    "INSERT OR IGNORE INTO member_notification_reads (member_id, announcement_id, read_at) VALUES (?, ?, ?)"
  );
  let cache = null;
  let cacheUntil = 0;

  async function getAnnouncements() {
    if (cache && now() < cacheUntil) return cache;
    const result = cleanAnnouncements(await loadAnnouncements());
    if (result.configured) {
      cache = result;
      cacheUntil = now() + CACHE_MS;
    }
    return result;
  }

  function settingsFor(memberId, items) {
    let settings = db.prepare(
      "SELECT announcements_enabled FROM member_notification_settings WHERE member_id = ?"
    ).get(memberId);
    if (!settings) {
      // First visit is a baseline: pre-existing Discord posts are displayed
      // but never flood a new member's unread counter.
      db.transaction(() => {
        db.prepare(
          "INSERT OR IGNORE INTO member_notification_settings (member_id, announcements_enabled) VALUES (?, 1)"
        ).run(memberId);
        const readAt = new Date(now()).toISOString();
        for (const item of items) writeRead.run(memberId, item.id, readAt);
      });
      settings = { announcements_enabled: 1 };
    }
    return { announcementsEnabled: settings.announcements_enabled === 1 };
  }

  function markRead(memberId, ids) {
    db.transaction(() => {
      const readAt = new Date(now()).toISOString();
      for (const id of ids) writeRead.run(memberId, id, readAt);
    });
  }

  app.get("/api/members/notifications", ...memberOnly, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const snapshot = await getAnnouncements();
      if (!snapshot.configured) {
        return res.json({
          configured: false, items: [], unreadCount: 0,
          settings: { announcementsEnabled: false }
        });
      }
      const memberId = req.currentMember.id;
      const settings = settingsFor(memberId, snapshot.items);
      if (!settings.announcementsEnabled) {
        markRead(memberId, snapshot.items.map((item) => item.id));
      }
      const readRows = db.prepare(
        "SELECT announcement_id FROM member_notification_reads WHERE member_id = ?"
      ).all(memberId);
      const readIds = new Set(readRows.map((row) => row.announcement_id));
      const items = snapshot.items.map((item) => ({
        ...item, read: readIds.has(item.id)
      }));
      // Retain read markers only for a bounded period.
      db.prepare("DELETE FROM member_notification_reads WHERE read_at < ?")
        .run(new Date(now() - RETENTION_DAYS * 86_400_000).toISOString());
      return res.json({
        configured: true, items, settings,
        unreadCount: settings.announcementsEnabled
          ? items.filter((item) => !item.read).length : 0
      });
    } catch (error) {
      console.error("PDD_NOTIFICATIONS_READ_FAILED", error?.code || "request");
      return res.status(502).json({ error: "Les annonces PDD sont temporairement indisponibles." });
    }
  });

  app.put("/api/members/notifications/settings", ...memberOnly, (req, res) => {
    res.set("Cache-Control", "no-store");
    if (typeof req.body?.announcementsEnabled !== "boolean") {
      return res.status(400).json({ error: "Préférence de notifications invalide." });
    }
    db.prepare(`
      INSERT INTO member_notification_settings (member_id, announcements_enabled)
      VALUES (?, ?) ON CONFLICT(member_id) DO UPDATE SET announcements_enabled = excluded.announcements_enabled
    `).run(req.currentMember.id, req.body.announcementsEnabled ? 1 : 0);
    return res.json({ settings: { announcementsEnabled: req.body.announcementsEnabled } });
  });

  app.post("/api/members/notifications/read", ...memberOnly, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const all = req.body?.all === true;
    const rawIds = req.body?.ids;
    if (!all && (!Array.isArray(rawIds) || rawIds.length > MAX_READ_IDS ||
      !rawIds.every((id) => typeof id === "string" && DISCORD_ID.test(id)))) {
      return res.status(400).json({ error: "Liste des notifications invalide." });
    }
    try {
      const snapshot = await getAnnouncements();
      if (!snapshot.configured) {
        return res.status(503).json({ error: "Le salon des annonces Discord n'est pas configuré." });
      }
      const known = new Set(snapshot.items.map((item) => item.id));
      const ids = all ? [...known] : [...new Set(rawIds)].filter((id) => known.has(id));
      markRead(req.currentMember.id, ids);
      return res.json({ ok: true, marked: ids.length });
    } catch (error) {
      console.error("PDD_NOTIFICATIONS_MARK_FAILED", error?.code || "request");
      return res.status(502).json({ error: "Impossible d'actualiser les notifications PDD." });
    }
  });
}
