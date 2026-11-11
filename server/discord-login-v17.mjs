import crypto from "node:crypto";
import rateLimit from "express-rate-limit";

const LOGIN_TTL = 10 * 60;
const startLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de demandes de connexion Discord. Réessaie plus tard." }
});
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de vérifications Discord. Réessaie plus tard." }
});
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const validSecret = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{30,64}$/.test(value);

function publicMember(member) {
  return {
    id: member.id,
    username: member.username,
    displayName: member.display_name,
    points: Number(member.points || 0),
    createdAt: member.created_at
  };
}

export function registerDiscordLoginV17Routes({
  app, db, createToken, configuration, exchangeIdentity, resultPage
}) {
  db.exec([
    "CREATE TABLE IF NOT EXISTS discord_login_attempts (",
    "state_hash TEXT PRIMARY KEY,",
    "request_hash TEXT NOT NULL UNIQUE,",
    "claim_hash TEXT NOT NULL,",
    "created_at INTEGER NOT NULL,",
    "status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed','claimed')),",
    "member_id INTEGER REFERENCES member_users(id) ON DELETE SET NULL,",
    "discord_id TEXT,",
    "failure_reason TEXT",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_discord_login_attempts_created ON discord_login_attempts(created_at);"
  ].join(" "));

  function expireOldAttempts() {
    db.prepare("DELETE FROM discord_login_attempts WHERE created_at < ?")
      .run(Math.floor(Date.now() / 1000) - LOGIN_TTL);
  }

  app.post("/api/members/discord/login/start", startLimiter, (req, res) => {
    res.set("Cache-Control", "no-store");
    const config = configuration();
    if (!config || typeof createToken !== "function") {
      return res.status(503).json({ error: "La connexion avec Discord n'est pas configurée sur le serveur." });
    }
    expireOldAttempts();
    const state = randomSecret();
    const requestId = randomSecret(24);
    const claimKey = randomSecret();
    db.prepare(
      "INSERT INTO discord_login_attempts (state_hash, request_hash, claim_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run(digest(state), digest(requestId), digest(claimKey), Math.floor(Date.now() / 1000));

    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "consent");
    return res.json({
      authorizationUrl: url.toString(),
      requestId, claimKey, expiresInSeconds: LOGIN_TTL
    });
  });

  app.post("/api/members/discord/login/finish", claimLimiter, (req, res) => {
    res.set("Cache-Control", "no-store");
    const requestId = req.body?.requestId;
    const claimKey = req.body?.claimKey;
    if (!validSecret(requestId) || !validSecret(claimKey)) {
      return res.status(400).json({ error: "Demande de connexion Discord invalide." });
    }
    const attempt = db.prepare(
      "SELECT state_hash, created_at, status, member_id, discord_id, failure_reason FROM discord_login_attempts WHERE request_hash = ? AND claim_hash = ?"
    ).get(digest(requestId), digest(claimKey));
    if (!attempt || Math.floor(Date.now() / 1000) - Number(attempt.created_at) >= LOGIN_TTL) {
      return res.status(410).json({ error: "La connexion Discord a expiré. Recommence depuis l'application." });
    }
    if (attempt.status === "pending" || attempt.status === "processing") {
      return res.status(202).json({ status: "pending" });
    }
    if (attempt.status === "failed") {
      return res.status(409).json({
        error: attempt.failure_reason || "Connexion Discord refusée. Réessaie."
      });
    }
    if (attempt.status !== "ready") {
      return res.status(410).json({ error: "Cette autorisation a déjà été utilisée." });
    }

    // Revalidate the link. The account might have been unlinked after OAuth succeeded.
    const member = db.prepare(
      "SELECT m.id, m.username, m.display_name, m.points, m.created_at FROM member_users m INNER JOIN member_discord_links l ON l.member_id = m.id WHERE m.id = ? AND l.discord_id = ?"
    ).get(attempt.member_id, attempt.discord_id);
    if (!member) {
      db.prepare("UPDATE discord_login_attempts SET status = 'claimed' WHERE state_hash = ? AND status = 'ready'")
        .run(attempt.state_hash);
      return res.status(409).json({ error: "Ce compte Discord n'est plus lié à Pixel Everywhere." });
    }
    const claimed = db.prepare(
      "UPDATE discord_login_attempts SET status = 'claimed' WHERE state_hash = ? AND status = 'ready'"
    ).run(attempt.state_hash);
    if (claimed.changes !== 1) {
      return res.status(410).json({ error: "Cette autorisation a déjà été utilisée." });
    }
    return res.json({
      token: createToken({ ...member, role: "member" }, "member"),
      member: publicMember(member)
    });
  });

  // Called BEFORE the existing member-link callback, sharing the same OAuth redirect.
  return async function handleDiscordLoginCallback(req, res, stateHash) {
    const attempt = db.prepare(
      "SELECT state_hash, status, created_at FROM discord_login_attempts WHERE state_hash = ?"
    ).get(stateHash);
    if (!attempt) return false;

    if (attempt.status !== "pending") {
      resultPage(res, "Cette autorisation Discord a déjà été utilisée.");
      return true;
    }
    const claimed = db.prepare(
      "UPDATE discord_login_attempts SET status = 'processing' WHERE state_hash = ? AND status = 'pending'"
    ).run(stateHash);
    if (claimed.changes !== 1) {
      resultPage(res, "Cette autorisation Discord a déjà été utilisée.");
      return true;
    }
    const fail = (message) => {
      db.prepare(
        "UPDATE discord_login_attempts SET status = 'failed', failure_reason = ? WHERE state_hash = ? AND status = 'processing'"
      ).run(message, stateHash);
      resultPage(res, message);
      return true;
    };
    if (Math.floor(Date.now() / 1000) - Number(attempt.created_at) >= LOGIN_TTL) {
      return fail("La connexion Discord a expiré. Recommence depuis l'application.");
    }
    if (req.query.error || typeof req.query.code !== "string" || !req.query.code) {
      return fail("La connexion Discord a été annulée.");
    }
    const config = configuration();
    if (!config) return fail("La connexion Discord n'est plus configurée sur le serveur.");

    try {
      const identity = await exchangeIdentity(req.query.code, config);
      const linked = db.prepare(
        "SELECT member_id FROM member_discord_links WHERE discord_id = ?"
      ).get(String(identity.id));
      if (!linked) {
        return fail("Aucun compte Pixel Everywhere n'est associé à ce Discord. Connecte-toi avec ton mot de passe PE pour le lier d'abord.");
      }
      const member = db.prepare("SELECT id FROM member_users WHERE id = ?").get(linked.member_id);
      if (!member) return fail("Ce compte Pixel Everywhere n'existe plus.");
      // The verified Discord identity refreshes the saved display name and
      // avatar, without changing the member's own Pixel Everywhere profile.
      const updated = db.prepare(
        "UPDATE member_discord_links SET discord_username = ?, discord_display_name = ?, discord_avatar_hash = ? WHERE member_id = ? AND discord_id = ?"
      ).run(String(identity.username).slice(0,80),
        String(identity.global_name || "").slice(0,100) || null,
        typeof identity.avatar === "string" ? identity.avatar : null,
        member.id, String(identity.id));
      if (updated.changes !== 1) return fail("La liaison Discord a été modifiée. Recommence la connexion.");
      db.prepare(
        "UPDATE discord_login_attempts SET status = 'ready', member_id = ?, discord_id = ? WHERE state_hash = ? AND status = 'processing'"
      ).run(member.id, String(identity.id), stateHash);
      resultPage(res, "Discord a confirmé ton identité. Reviens dans Pixel Everywhere pour terminer la connexion !");
      return true;
    } catch (error) {
      console.error("DISCORD_OAUTH_LOGIN_FAILED", error?.httpStatus || error?.code || "request");
      return fail("La connexion Discord n'a pas abouti. Vérifie le serveur et réessaie.");
    }
  };
}
