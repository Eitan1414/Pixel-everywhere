import { createHash } from "node:crypto";

const initializedDatabases = new WeakSet();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_BLOCK_MINUTES = 15;
const ONLINE_WINDOW_MS = 90_000;

function ensureTables(db) {
  if (initializedDatabases.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      account_kind TEXT NOT NULL CHECK (account_kind IN ('member', 'staff')),
      account_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      platform TEXT NOT NULL DEFAULT 'unknown',
      app_version TEXT,
      current_page TEXT,
      device_label TEXT,
      ip_preview TEXT,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      logged_out_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_key, account_kind, account_id)
    );

    CREATE INDEX IF NOT EXISTS idx_app_sessions_last_seen
      ON app_sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_app_sessions_account
      ON app_sessions(account_kind, account_id);

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_kind TEXT NOT NULL CHECK (account_kind IN ('member', 'staff')),
      username_key TEXT NOT NULL,
      username_display TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      ip_preview TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      blocked_until TEXT,
      bypass_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (account_kind, username_key, ip_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_account
      ON login_attempts(account_kind, username_key);

    CREATE TABLE IF NOT EXISTS admin_point_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );
  `);
  initializedDatabases.add(db);
}

function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR").slice(0, 80);
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .slice(0, 160);
}

function hashIp(ip) {
  return createHash("sha256").update(`pixel-everywhere:${ip}`).digest("hex");
}

function previewIp(ip) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  if (ip.includes(":")) {
    return `${ip.split(":").filter(Boolean).slice(0, 3).join(":")}:…`;
  }
  return ip === "unknown" ? "inconnue" : "masquée";
}

function dateToEpoch(value) {
  if (!value) return 0;
  const text = String(value);
  const date = new Date(`${text}${text.endsWith("Z") || /[+-]\d\d:\d\d$/.test(text) ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function loginKind(req) {
  return req.originalUrl.includes("/members/login") ? "member" : "staff";
}

function readLoginRow(db, kind, usernameKey, ipHash) {
  return db.prepare(`
    SELECT *
    FROM login_attempts
    WHERE account_kind = ? AND username_key = ? AND ip_hash = ?
  `).get(kind, usernameKey, ipHash);
}

function recordLoginFailure(db, { kind, usernameKey, usernameDisplay, ipHash, ipPreview }) {
  db.transaction(() => {
    const current = readLoginRow(db, kind, usernameKey, ipHash);
    const now = Date.now();
    if (current?.bypass_until && dateToEpoch(current.bypass_until) > now) return;

    const attempts = Number(current?.attempts || 0) + 1;
    const blockedUntil = attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(now + LOGIN_BLOCK_MINUTES * 60_000).toISOString()
      : current?.blocked_until || null;

    db.prepare(`
      INSERT INTO login_attempts
        (account_kind, username_key, username_display, ip_hash, ip_preview, attempts, blocked_until, bypass_until, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(account_kind, username_key, ip_hash) DO UPDATE SET
        username_display = excluded.username_display,
        ip_preview = excluded.ip_preview,
        attempts = excluded.attempts,
        blocked_until = excluded.blocked_until,
        bypass_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      kind,
      usernameKey,
      usernameDisplay,
      ipHash,
      ipPreview,
      attempts,
      blockedUntil
    );
  });
}

export function createManagedLoginLimiter({ db }) {
  ensureTables(db);

  return (req, res, next) => {
    const usernameDisplay = String(req.body?.username || "").trim().slice(0, 80);
    const usernameKey = normalizeUsername(usernameDisplay);
    if (!usernameKey) return next();

    const kind = loginKind(req);
    const ip = requestIp(req);
    const ipHash = hashIp(ip);
    const ipPreview = previewIp(ip);
    const current = readLoginRow(db, kind, usernameKey, ipHash);
    const now = Date.now();
    const bypassActive = current?.bypass_until && dateToEpoch(current.bypass_until) > now;
    const blockedUntil = dateToEpoch(current?.blocked_until);

    if (!bypassActive && blockedUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: `Trop de tentatives. Réessaie dans ${Math.ceil(retryAfter / 60)} minute(s), ou demande à un administrateur de débloquer ce compte.`,
        code: "LOGIN_LOCKED",
        retryAfter
      });
    }

    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        db.prepare(`
          DELETE FROM login_attempts
          WHERE account_kind = ? AND username_key = ? AND ip_hash = ?
        `).run(kind, usernameKey, ipHash);
        return;
      }
      if (res.statusCode === 401) {
        recordLoginFailure(db, {
          kind,
          usernameKey,
          usernameDisplay,
          ipHash,
          ipPreview
        });
      }
    });

    next();
  };
}

function cleanText(value, maxLength, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text.slice(0, maxLength);
}

function validSessionKey(value) {
  const key = cleanText(value, 100);
  return /^[A-Za-z0-9_.:-]{8,100}$/.test(key) ? key : "";
}

function upsertPresence(db, req, accountKind, account) {
  const sessionKey = validSessionKey(req.body?.sessionKey);
  if (!sessionKey) return null;

  const allowedPlatforms = new Set(["android", "macos", "windows", "ios", "web", "unknown"]);
  const requestedPlatform = cleanText(req.body?.platform, 24, "unknown").toLowerCase();
  const platform = allowedPlatforms.has(requestedPlatform) ? requestedPlatform : "unknown";
  const currentPage = cleanText(req.body?.currentPage, 80, "inconnue");
  const appVersion = cleanText(req.body?.appVersion, 40, "0.1.0");
  const deviceLabel = cleanText(req.body?.deviceLabel, 100, platform);
  const displayName = accountKind === "member" ? account.display_name : account.username;

  db.prepare(`
    INSERT INTO app_sessions
      (session_key, account_kind, account_id, username, display_name, platform, app_version, current_page, device_label, ip_preview, last_seen_at, logged_out_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(session_key, account_kind, account_id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      platform = excluded.platform,
      app_version = excluded.app_version,
      current_page = excluded.current_page,
      device_label = excluded.device_label,
      ip_preview = excluded.ip_preview,
      last_seen_at = CURRENT_TIMESTAMP,
      logged_out_at = NULL
  `).run(
    sessionKey,
    accountKind,
    account.id,
    account.username,
    displayName,
    platform,
    appVersion,
    currentPage,
    deviceLabel,
    previewIp(requestIp(req))
  );

  return sessionKey;
}

function registerPresenceRoutes({ app, db, authenticate, authenticateMember, requireActiveStaff, requireActiveMember }) {
  app.post(
    "/api/presence/member",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const sessionKey = upsertPresence(db, req, "member", req.currentMember);
      if (!sessionKey) return res.status(400).json({ error: "Identifiant de session invalide." });
      res.json({ ok: true, onlineForSeconds: Math.floor(ONLINE_WINDOW_MS / 1000) });
    }
  );

  app.post(
    "/api/presence/staff",
    authenticate,
    requireActiveStaff,
    (req, res) => {
      const sessionKey = upsertPresence(db, req, "staff", req.currentUser);
      if (!sessionKey) return res.status(400).json({ error: "Identifiant de session invalide." });
      res.json({ ok: true, onlineForSeconds: Math.floor(ONLINE_WINDOW_MS / 1000) });
    }
  );

  const logout = (kind) => (req, res) => {
    const sessionKey = validSessionKey(req.body?.sessionKey);
    if (sessionKey) {
      db.prepare(`
        UPDATE app_sessions
        SET logged_out_at = CURRENT_TIMESTAMP
        WHERE session_key = ? AND account_kind = ? AND account_id = ?
      `).run(sessionKey, kind, kind === "member" ? req.currentMember.id : req.currentUser.id);
    }
    res.json({ ok: true });
  };

  app.post(
    "/api/presence/member/logout",
    authenticateMember,
    requireActiveMember,
    logout("member")
  );
  app.post(
    "/api/presence/staff/logout",
    authenticate,
    requireActiveStaff,
    logout("staff")
  );
}

function publicSession(session) {
  const lastSeenAt = dateToEpoch(session.last_seen_at);
  return {
    id: Number(session.id),
    accountKind: session.account_kind,
    accountId: Number(session.account_id),
    username: session.username,
    displayName: session.display_name,
    platform: session.platform,
    appVersion: session.app_version,
    currentPage: session.current_page,
    deviceLabel: session.device_label,
    ipPreview: session.ip_preview,
    lastSeenAt: session.last_seen_at,
    online: !session.logged_out_at && Date.now() - lastSeenAt <= ONLINE_WINDOW_MS
  };
}

function registerAdminRoutes({ app, db, authenticate, requireActiveStaff, staffOnly, requireAdmin }) {
  const adminChain = [authenticate, requireActiveStaff, staffOnly, requireAdmin];

  app.get("/api/admin/live-control", ...adminChain, (_req, res) => {
    const sessions = db.prepare(`
      SELECT id, account_kind, account_id, username, display_name, platform,
             app_version, current_page, device_label, ip_preview,
             last_seen_at, logged_out_at
      FROM app_sessions
      WHERE datetime(last_seen_at) >= datetime('now', '-24 hours')
      ORDER BY datetime(last_seen_at) DESC, id DESC
      LIMIT 250
    `).all().map(publicSession);

    const members = db.prepare(`
      SELECT
        m.id,
        m.username,
        m.display_name,
        m.points,
        m.created_at,
        s.platform AS last_platform,
        s.current_page AS last_page,
        s.last_seen_at
      FROM member_users m
      LEFT JOIN app_sessions s ON s.id = (
        SELECT latest.id
        FROM app_sessions latest
        WHERE latest.account_kind = 'member' AND latest.account_id = m.id
        ORDER BY datetime(latest.last_seen_at) DESC, latest.id DESC
        LIMIT 1
      )
      ORDER BY datetime(m.created_at) DESC, m.id DESC
      LIMIT 1000
    `).all().map((member) => ({
      id: Number(member.id),
      username: member.username,
      displayName: member.display_name,
      points: Number(member.points || 0),
      createdAt: member.created_at,
      lastPlatform: member.last_platform || null,
      lastPage: member.last_page || null,
      lastSeenAt: member.last_seen_at || null
    }));

    const lockouts = db.prepare(`
      SELECT id, account_kind, username_display, ip_preview, attempts,
             blocked_until, bypass_until, updated_at
      FROM login_attempts
      WHERE attempts > 0
         OR datetime(blocked_until) > CURRENT_TIMESTAMP
         OR datetime(bypass_until) > CURRENT_TIMESTAMP
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 250
    `).all().map((lockout) => ({
      id: Number(lockout.id),
      accountKind: lockout.account_kind,
      username: lockout.username_display,
      ipPreview: lockout.ip_preview,
      attempts: Number(lockout.attempts || 0),
      blockedUntil: lockout.blocked_until,
      bypassUntil: lockout.bypass_until,
      updatedAt: lockout.updated_at
    }));

    res.json({
      sessions,
      members,
      lockouts,
      onlineCount: sessions.filter((session) => session.online).length
    });
  });

  app.post("/api/admin/members/:id/points", ...adminChain, (req, res) => {
    const memberId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const reason = cleanText(req.body?.reason, 300);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({ error: "Membre invalide." });
    }
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return res.status(400).json({ error: "Le changement doit être un nombre entier entre -1 000 000 et 1 000 000." });
    }

    const member = db.prepare(`
      SELECT id, username, display_name, points
      FROM member_users
      WHERE id = ?
    `).get(memberId);
    if (!member) return res.status(404).json({ error: "Membre introuvable." });

    const balanceAfter = Number(member.points || 0) + amount;
    if (balanceAfter < 0) {
      return res.status(409).json({ error: "Le solde du membre ne peut pas devenir négatif." });
    }

    db.transaction(() => {
      db.prepare("UPDATE member_users SET points = ? WHERE id = ?")
        .run(balanceAfter, memberId);
      db.prepare(`
        INSERT INTO admin_point_adjustments
          (admin_id, member_id, delta, balance_after, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.currentUser.id, memberId, amount, balanceAfter, reason || null);

      const direction = amount > 0 ? "ajouté" : "retiré";
      const absoluteAmount = Math.abs(amount);
      const message = [
        `${req.currentUser.username} a ${direction} ${absoluteAmount} pièce${absoluteAmount > 1 ? "s" : ""} sur ton compte.`,
        `Nouveau solde : ${balanceAfter} pièce${balanceAfter > 1 ? "s" : ""}.`,
        reason ? `Motif : ${reason}` : ""
      ].filter(Boolean).join("\n");
      db.prepare(`
        INSERT INTO member_messages
          (member_id, sender_name, sender_logo, subject, body)
        VALUES (?, 'PDD Administration', '/assets/pdd-logo.jpg', 'Solde de pièces modifié', ?)
      `).run(memberId, message);
    });

    res.json({
      ok: true,
      memberId,
      amount,
      points: balanceAfter,
      message: `${amount > 0 ? "+" : ""}${amount} pièce(s) appliquée(s).`
    });
  });

  app.post("/api/admin/login-access", ...adminChain, (req, res) => {
    const kind = req.body?.kind === "staff" ? "staff" : req.body?.kind === "member" ? "member" : "";
    const usernameDisplay = cleanText(req.body?.username, 80);
    const usernameKey = normalizeUsername(usernameDisplay);
    const mode = req.body?.mode;
    if (!kind || !usernameKey || !["clear", "bypass"].includes(mode)) {
      return res.status(400).json({ error: "Demande de déblocage invalide." });
    }

    if (mode === "clear") {
      const result = db.prepare(`
        DELETE FROM login_attempts
        WHERE account_kind = ? AND username_key = ?
      `).run(kind, usernameKey);
      return res.json({ ok: true, cleared: Number(result.changes || 0) });
    }

    const minutes = Math.max(1, Math.min(30, Number(req.body?.minutes || 10)));
    const modifier = `+${minutes} minutes`;
    const result = db.prepare(`
      UPDATE login_attempts
      SET attempts = 0,
          blocked_until = NULL,
          bypass_until = datetime('now', ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE account_kind = ? AND username_key = ?
    `).run(modifier, kind, usernameKey);
    if (!result.changes) {
      return res.status(404).json({ error: "Aucun blocage trouvé pour ce compte." });
    }
    res.json({ ok: true, bypassMinutes: minutes, updated: Number(result.changes) });
  });
}

export function registerAdminControlRoutes(dependencies) {
  ensureTables(dependencies.db);
  registerPresenceRoutes(dependencies);
  registerAdminRoutes(dependencies);
}
