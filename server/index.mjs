import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, seedInitialAdmin } from "./db.mjs";
import { authenticate, createToken, requireAdmin } from "./auth.mjs";
import { fetchAnnouncements } from "./discord.mjs";
import {
  accountSchema,
  applicationSchema,
  loginSchema,
  messageSchema,
  noteSchema,
  parse,
  passwordSchema,
  statusSchema
} from "./validation.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(currentDirectory, "../www");

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      const allowed = (process.env.APP_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((value) => value.trim());
      const mobileOrigins = (
        process.env.MOBILE_ORIGINS ||
        "http://localhost,https://localhost,capacitor://localhost"
      )
        .split(",")
        .map((value) => value.trim());
      if (!origin || allowed.includes(origin) || mobileOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Origine non autorisée."));
    }
  })
);
app.use(express.json({ limit: "32kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessaie dans quelques minutes." }
});

const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de candidatures envoyées depuis cet appareil." }
});

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: Boolean(user.active),
    mustChangePassword: Boolean(user.must_change_password),
    createdAt: user.created_at
  };
}

function currentUser(req) {
  return db
    .prepare(`
      SELECT id, username, role, active, must_change_password, created_at
      FROM staff_users
      WHERE id = ?
    `)
    .get(Number(req.staff.sub));
}

function requireActiveStaff(req, res, next) {
  const user = currentUser(req);
  if (!user || !user.active) {
    return res.status(403).json({ error: "Ce compte est désactivé." });
  }
  req.currentUser = user;
  next();
}

function staffOnly(req, res, next) {
  if (req.currentUser.must_change_password) {
    return res.status(403).json({
      error: "Tu dois modifier ton mot de passe avant d’accéder à cet espace.",
      code: "PASSWORD_CHANGE_REQUIRED"
    });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Pixel Everywhere" });
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const input = parse(loginSchema, req, res);
  if (!input) return;

  const user = db
    .prepare("SELECT * FROM staff_users WHERE username = ? COLLATE NOCASE")
    .get(input.username);

  const valid = user && user.active && (await bcrypt.compare(input.password, user.password_hash));
  if (!valid) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }

  res.json({ token: createToken(user), user: publicUser(user) });
});

app.get(
  "/api/auth/me",
  authenticate,
  requireActiveStaff,
  (req, res) => res.json({ user: publicUser(req.currentUser) })
);

app.post(
  "/api/auth/change-password",
  authenticate,
  requireActiveStaff,
  async (req, res) => {
    const input = parse(passwordSchema, req, res);
    if (!input) return;

    const user = db
      .prepare("SELECT * FROM staff_users WHERE id = ?")
      .get(req.currentUser.id);
    const valid = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Le mot de passe actuel est incorrect." });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    db.prepare(`
      UPDATE staff_users
      SET password_hash = ?, must_change_password = 0
      WHERE id = ?
    `).run(passwordHash, user.id);

    const updated = { ...user, password_hash: passwordHash, must_change_password: 0 };
    res.json({ token: createToken(updated), user: publicUser(updated) });
  }
);

let announcementCache = { expiresAt: 0, value: null };
app.get("/api/announcements", async (_req, res) => {
  try {
    if (announcementCache.value && Date.now() < announcementCache.expiresAt) {
      return res.json(announcementCache.value);
    }
    const result = await fetchAnnouncements();
    announcementCache = { expiresAt: Date.now() + 30_000, value: result };
    res.json(result);
  } catch (error) {
    console.error("Lecture Discord impossible:", error.message);
    res.status(502).json({ error: "Les annonces Discord sont momentanément indisponibles." });
  }
});

app.post("/api/applications", publicFormLimiter, (req, res) => {
  const input = parse(applicationSchema, req, res);
  if (!input) return;

  const result = db.prepare(`
    INSERT INTO applications
      (age, desired_role, real_name, discord_username, motivation)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.age,
    input.desiredRole,
    input.realName,
    input.discordUsername,
    input.motivation
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    message: "Ta candidature a bien été envoyée au staff."
  });
});

app.get(
  "/api/staff/applications",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (_req, res) => {
    const applications = db.prepare(`
      SELECT *
      FROM applications
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'reviewing' THEN 1
          ELSE 2
        END,
        datetime(created_at) DESC
    `).all();
    res.json({ applications });
  }
);

app.get(
  "/api/staff/applications/:id/notes",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const notes = db.prepare(`
      SELECT n.id, n.body, n.created_at, u.username
      FROM application_notes n
      JOIN staff_users u ON u.id = n.user_id
      WHERE n.application_id = ?
      ORDER BY datetime(n.created_at) ASC
    `).all(Number(req.params.id));
    res.json({ notes });
  }
);

app.post(
  "/api/staff/applications/:id/notes",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const input = parse(noteSchema, req, res);
    if (!input) return;
    const applicationId = Number(req.params.id);
    const application = db
      .prepare("SELECT id FROM applications WHERE id = ?")
      .get(applicationId);
    if (!application) {
      return res.status(404).json({ error: "Candidature introuvable." });
    }

    const result = db.prepare(`
      INSERT INTO application_notes (application_id, user_id, body)
      VALUES (?, ?, ?)
    `).run(applicationId, req.currentUser.id, input.body);
    res.status(201).json({ id: result.lastInsertRowid });
  }
);

app.patch(
  "/api/staff/applications/:id/status",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const input = parse(statusSchema, req, res);
    if (!input) return;

    const result = db.prepare(`
      UPDATE applications
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.status, Number(req.params.id));
    if (!result.changes) {
      return res.status(404).json({ error: "Candidature introuvable." });
    }
    res.json({ ok: true });
  }
);

app.get(
  "/api/staff/messages",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (_req, res) => {
    const messages = db.prepare(`
      SELECT m.id, m.body, m.created_at, u.username, u.role
      FROM staff_messages m
      JOIN staff_users u ON u.id = m.user_id
      ORDER BY datetime(m.created_at) DESC
      LIMIT 100
    `).all().reverse();
    res.json({ messages });
  }
);

app.post(
  "/api/staff/messages",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const input = parse(messageSchema, req, res);
    if (!input) return;
    const result = db.prepare(`
      INSERT INTO staff_messages (user_id, body)
      VALUES (?, ?)
    `).run(req.currentUser.id, input.body);
    res.status(201).json({ id: result.lastInsertRowid });
  }
);

app.get(
  "/api/admin/accounts",
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  (_req, res) => {
    const accounts = db.prepare(`
      SELECT id, username, role, active, must_change_password, created_at
      FROM staff_users
      ORDER BY datetime(created_at) DESC
    `).all().map(publicUser);
    res.json({ accounts });
  }
);

app.post(
  "/api/admin/accounts",
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  async (req, res) => {
    const input = parse(accountSchema, req, res);
    if (!input) return;

    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const result = db.prepare(`
        INSERT INTO staff_users
          (username, password_hash, role, active, must_change_password)
        VALUES (?, ?, ?, 1, 1)
      `).run(input.username, passwordHash, input.role);
      const user = db
        .prepare("SELECT * FROM staff_users WHERE id = ?")
        .get(result.lastInsertRowid);
      res.status(201).json({ account: publicUser(user) });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ error: "Cet identifiant existe déjà." });
      }
      throw error;
    }
  }
);

app.patch(
  "/api/admin/accounts/:id/toggle",
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  (req, res) => {
    const accountId = Number(req.params.id);
    if (accountId === req.currentUser.id) {
      return res.status(400).json({ error: "Tu ne peux pas désactiver ton propre compte." });
    }

    const result = db.prepare(`
      UPDATE staff_users
      SET active = CASE active WHEN 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `).run(accountId);
    if (!result.changes) {
      return res.status(404).json({ error: "Compte introuvable." });
    }
    res.json({ ok: true });
  }
);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(webDirectory));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(webDirectory, "index.html")));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Une erreur interne est survenue." });
});

await seedInitialAdmin();
app.listen(port, "0.0.0.0", () => {
  console.log(`Pixel Everywhere API disponible sur le port ${port}.`);
});
