import crypto from "node:crypto";
import { fetchAnnouncements } from "./discord.mjs";

const API = "https://discord.com/api/v10";
const STATE_TTL_SECONDS = 10 * 60;
const STATE_MAX_PER_USER = 3;

export function discordOAuthConfiguration(env = process.env) {
  const clientId = String(env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(env.DISCORD_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.DISCORD_REDIRECT_URI || "").trim();
  if (!/^\d{15,25}$/.test(clientId) || !clientSecret) return null;
  let url;
  try { url = new URL(redirectUri); } catch { return null; }
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
      url.pathname !== "/api/discord/oauth/callback" || url.search || url.hash) return null;
  return { clientId, clientSecret, redirectUri };
}

function hashedState(state) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (x) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[x]);
}

function resultPage(res, message) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  return res.status(200).type("html").send(
    '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Pixel Everywhere · Discord</title><body style="background:#11141b;color:white;font:16px system-ui;max-width:30rem;margin:12vh auto;padding:2rem">' +
    '<h1>Pixel Everywhere</h1><p>' + escapeHTML(message) + '</p>' +
    '<p>Tu peux fermer cette fenêtre et revenir dans Pixel Everywhere.</p></body></html>'
  );
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_discord_links (
      member_id INTEGER PRIMARY KEY REFERENCES member_users(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL UNIQUE,
      discord_username TEXT NOT NULL,
      discord_display_name TEXT,
      discord_avatar_hash TEXT,
      linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS discord_link_states (
      state_hash TEXT PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES member_users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discord_link_states_created ON discord_link_states(created_at);
  `);
}

async function discordRequest(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const err = new Error("Discord a refusé ou interrompu la demande.");
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

export function registerDiscordV17Routes({
  app, db, authenticate, authenticateMember, requireActiveStaff, requireActiveMember, staffOnly
}) {
  initTables(db);
  const memberOnly = [authenticateMember, requireActiveMember];
  const staffAccess = [authenticate, requireActiveStaff, staffOnly];

  app.get("/api/members/discord/link", ...memberOnly, (req, res) => {
    const link = db.prepare(
      "SELECT discord_id, discord_username, discord_display_name, linked_at FROM member_discord_links WHERE member_id = ?"
    ).get(req.currentMember.id);
    res.set("Cache-Control", "no-store");
    res.json({
      linked: Boolean(link),
      discord: link ? {
        id: link.discord_id,
        username: link.discord_username,
        displayName: link.discord_display_name || link.discord_username,
        linkedAt: link.linked_at
      } : null,
      configured: Boolean(discordOAuthConfiguration())
    });
  });

  app.post("/api/members/discord/link/start", ...memberOnly, (req, res) => {
    const config = discordOAuthConfiguration();
    if (!config) return res.status(503).json({ error: "La connexion Discord n'est pas encore configurée sur le serveur." });
    const now = Math.floor(Date.now() / 1000);
    db.prepare("DELETE FROM discord_link_states WHERE created_at < ?").run(now - STATE_TTL_SECONDS);
    db.prepare("DELETE FROM discord_link_states WHERE member_id = ?").run(req.currentMember.id);
    const state = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO discord_link_states (state_hash, member_id, created_at) VALUES (?, ?, ?)")
      .run(hashedState(state), req.currentMember.id, now);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "consent");
    res.set("Cache-Control", "no-store");
    res.json({ authorizationUrl: url.toString(), expiresInSeconds: STATE_TTL_SECONDS });
  });

  app.get("/api/discord/oauth/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!/^[a-zA-Z0-9_-]{40,64}$/.test(state)) return resultPage(res, "Connexion annulée ou lien expiré.");
    const hash = hashedState(state);
    const pending = db.prepare("SELECT member_id, created_at FROM discord_link_states WHERE state_hash = ?").get(hash);
    // The state is one-time only, including failed/denied authorizations.
    db.prepare("DELETE FROM discord_link_states WHERE state_hash = ?").run(hash);
    if (!pending || Math.floor(Date.now()/1000) - pending.created_at > STATE_TTL_SECONDS) {
      return resultPage(res, "La demande a expiré. Relance la connexion depuis l'application.");
    }
    if (req.query.error || typeof req.query.code !== "string" || !req.query.code) {
      return resultPage(res, "La connexion Discord a été annulée.");
    }
    const config = discordOAuthConfiguration();
    if (!config) return resultPage(res, "La connexion Discord n'est plus configurée sur le serveur.");

    try {
      const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: config.redirectUri
      });
      const token = await discordRequest(API + "/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (!token.access_token) throw Error("Réponse Discord incomplète.");
      const identity = await discordRequest(API + "/users/@me", {
        headers: { Authorization: "Bearer " + token.access_token }
      });
      if (!/^\d{15,25}$/.test(String(identity.id || "")) || !identity.username) {
        throw Error("Identité Discord invalide.");
      }
      const member = db.prepare("SELECT id FROM member_users WHERE id = ?").get(pending.member_id);
      if (!member) return resultPage(res, "Ce compte Pixel Everywhere n'existe plus.");
      const existing = db.prepare("SELECT member_id FROM member_discord_links WHERE discord_id = ?").get(identity.id);
      if (existing && Number(existing.member_id) !== Number(pending.member_id)) {
        return resultPage(res, "Ce compte Discord est déjà associé à un autre membre Pixel Everywhere.");
      }
      db.prepare(`
        INSERT INTO member_discord_links
          (member_id, discord_id, discord_username, discord_display_name, discord_avatar_hash)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(member_id) DO UPDATE SET
          discord_id = excluded.discord_id,
          discord_username = excluded.discord_username,
          discord_display_name = excluded.discord_display_name,
          discord_avatar_hash = excluded.discord_avatar_hash,
          linked_at = CURRENT_TIMESTAMP
      `).run(pending.member_id, String(identity.id), String(identity.username).slice(0,80),
        String(identity.global_name || "").slice(0,100) || null,
        typeof identity.avatar === "string" ? identity.avatar : null);
      return resultPage(res, "Ton compte Discord est maintenant lié à Pixel Everywhere !");
    } catch (error) {
      console.error("DISCORD_OAUTH_LINK_FAILED", error?.httpStatus || error?.code || "request");
      return resultPage(res, "La connexion n'a pas abouti. Vérifie le serveur et réessaie.");
    }
  });

  app.delete("/api/members/discord/link", ...memberOnly, (req, res) => {
    db.prepare("DELETE FROM discord_link_states WHERE member_id = ?").run(req.currentMember.id);
    db.prepare("DELETE FROM member_discord_links WHERE member_id = ?").run(req.currentMember.id);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, linked: false });
  });

  let activityCache = null;
  let activityExpiresAt = 0;
  app.get("/api/staff/discord/activity", ...staffAccess, async (_req, res) => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!token || !/^\d{15,25}$/.test(String(guildId || ""))) {
      return res.status(503).json({ error: "Renseigne DISCORD_GUILD_ID et DISCORD_BOT_TOKEN sur Termux." });
    }
    res.set("Cache-Control", "no-store");
    try {
      let data;
      if (activityCache && Date.now() < activityExpiresAt) {
        data = activityCache;
      } else {
        const guild = await discordRequest(API + "/guilds/" + guildId + "?with_counts=true", {
          headers: { Authorization: "Bot " + token }
        });
        let announcements = [];
        try {
          const found = await fetchAnnouncements();
          announcements = (found.announcements || []).slice(-8).reverse()
            .map((item) => ({
              id: item.id, text: String(item.content || "").slice(0,450),
              createdAt: item.createdAt, author: item.author?.username || "PDD"
            }));
        } catch {
          // Guild numbers can still be shown if announcement channel access fails.
        }
        data = {
          guildName: String(guild.name || "Serveur PDD"),
          memberCount: Number.isFinite(guild.approximate_member_count) ? guild.approximate_member_count : null,
          onlineCount: Number.isFinite(guild.approximate_presence_count) ? guild.approximate_presence_count : null,
          linkedAccounts: db.prepare("SELECT COUNT(*) AS count FROM member_discord_links").get()?.count || 0,
          announcements
        };
        activityCache = data;
        activityExpiresAt = Date.now() + 60000;
      }
      res.json({ ...data, approximate: true, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.error("DISCORD_ACTIVITY_FAILED", error?.httpStatus || "request");
      res.status(502).json({ error: "Statistiques Discord indisponibles pour le moment." });
    }
  });
}
