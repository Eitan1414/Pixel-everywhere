import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, seedInitialAdmin } from "./db.mjs";
import {
  authenticate,
  authenticateMember,
  createToken,
  requireAdmin
} from "./auth.mjs";
import { fetchAnnouncements } from "./discord.mjs";
import {
  acceptApplicationSchema,
  accountSchema,
  activityRewardSchema,
  appRatingSchema,
  applicationSchema,
  bugDecisionSchema,
  bugReportSchema,
  loginSchema,
  memberRegistrationSchema,
  messageSchema,
  noteSchema,
  parse,
  passwordSchema,
  petActionSchema,
  shopPurchaseSchema,
  statusSchema,
  xpConversionSchema,
  xpDecisionSchema
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
    isOwnerAdmin: isOwnerAdmin(user),
    createdAt: user.created_at
  };
}

function isOwnerAdmin(user) {
  const ownerUsername = (
    process.env.OWNER_ADMIN_USERNAME ||
    process.env.INITIAL_ADMIN_USERNAME ||
    "Eitan14"
  ).trim();
  return user.role === "admin" &&
    user.username.localeCompare(ownerUsername, undefined, { sensitivity: "accent" }) === 0;
}

function publicMember(member) {
  return {
    id: member.id,
    username: member.username,
    displayName: member.display_name,
    points: Number(member.points || 0),
    createdAt: member.created_at
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

function currentMember(req) {
  return db
    .prepare(`
      SELECT id, username, display_name, points, last_activity_reward_at, created_at
      FROM member_users
      WHERE id = ?
    `)
    .get(Number(req.member.sub));
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

function requireOwnerAdmin(req, res, next) {
  if (!isOwnerAdmin(req.currentUser)) {
    return res.status(403).json({
      error: "Seul le propriétaire de l’application peut gérer les comptes staff."
    });
  }
  next();
}

function requireActiveMember(req, res, next) {
  const member = currentMember(req);
  if (!member) {
    return res.status(403).json({ error: "Ce compte membre n’existe plus." });
  }
  req.currentMember = member;
  next();
}

function notifyActiveStaff(alertType, referenceId, body) {
  const recipients = db
    .prepare("SELECT id FROM staff_users WHERE active = 1")
    .all();
  const insert = db.prepare(`
    INSERT INTO staff_alerts (recipient_id, alert_type, reference_id, body)
    VALUES (?, ?, ?, ?)
  `);
  recipients.forEach((recipient) =>
    insert.run(recipient.id, alertType, referenceId, body)
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Pixel Everywhere" });
});

app.get("/api/ratings/summary", (_req, res) => {
  const summary = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(AVG(stars), 0) AS average
    FROM app_ratings
  `).get();
  res.json({
    count: Number(summary.count),
    average: Number(Number(summary.average).toFixed(2))
  });
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

  res.json({ token: createToken(user, "staff"), user: publicUser(user) });
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
    res.json({ token: createToken(updated, "staff"), user: publicUser(updated) });
  }
);

app.post("/api/members/register", loginLimiter, async (req, res) => {
  const input = parse(memberRegistrationSchema, req, res);
  if (!input) return;

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const result = db.prepare(`
      INSERT INTO member_users (username, password_hash, display_name)
      VALUES (?, ?, ?)
    `).run(input.username, passwordHash, input.displayName);
    const member = db
      .prepare("SELECT id, username, display_name, points, created_at FROM member_users WHERE id = ?")
      .get(result.lastInsertRowid);
    res.status(201).json({
      token: createToken({ ...member, role: "member" }, "member"),
      member: publicMember(member)
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Cet identifiant membre existe déjà." });
    }
    throw error;
  }
});

app.post("/api/members/login", loginLimiter, async (req, res) => {
  const input = parse(loginSchema, req, res);
  if (!input) return;

  const member = db
    .prepare("SELECT * FROM member_users WHERE username = ? COLLATE NOCASE")
    .get(input.username);
  const valid = member && (await bcrypt.compare(input.password, member.password_hash));
  if (!valid) {
    return res.status(401).json({ error: "Identifiant ou mot de passe membre incorrect." });
  }

  res.json({
    token: createToken({ ...member, role: "member" }, "member"),
    member: publicMember(member)
  });
});

app.get(
  "/api/members/me",
  authenticateMember,
  requireActiveMember,
  (req, res) => res.json({ member: publicMember(req.currentMember) })
);

app.get(
  "/api/members/rating",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const rating = db.prepare(`
      SELECT id, stars, comment, created_at, updated_at
      FROM app_ratings
      WHERE member_id = ?
    `).get(req.currentMember.id);
    res.json({ rating: rating || null });
  }
);

app.put(
  "/api/members/rating",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(appRatingSchema, req, res);
    if (!input) return;
    db.prepare(`
      INSERT INTO app_ratings (member_id, stars, comment)
      VALUES (?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET
        stars = excluded.stars,
        comment = excluded.comment,
        updated_at = CURRENT_TIMESTAMP
    `).run(req.currentMember.id, input.stars, input.comment);
    const rating = db.prepare(`
      SELECT id, stars, comment, created_at, updated_at
      FROM app_ratings
      WHERE member_id = ?
    `).get(req.currentMember.id);
    res.json({
      rating,
      message: "Merci ! Ton évaluation de Pixel Everywhere a été enregistrée."
    });
  }
);

app.get(
  "/api/members/applications",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const applications = db.prepare(`
      SELECT id, desired_role, discord_username, status, created_at, updated_at
      FROM applications
      WHERE member_id = ?
      ORDER BY datetime(created_at) DESC
    `).all(req.currentMember.id);
    res.json({ applications });
  }
);

app.get(
  "/api/members/inbox",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const messages = db.prepare(`
      SELECT id, sender_name, sender_logo, subject, body, read_at, created_at
      FROM member_messages
      WHERE member_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 100
    `).all(req.currentMember.id);
    res.json({
      messages,
      unreadCount: messages.filter((message) => !message.read_at).length,
      points: Number(req.currentMember.points || 0)
    });
  }
);

app.patch(
  "/api/members/inbox/:id/read",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const result = db.prepare(`
      UPDATE member_messages
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND member_id = ?
    `).run(Number(req.params.id), req.currentMember.id);
    if (!result.changes) {
      return res.status(404).json({ error: "Message introuvable." });
    }
    res.json({ ok: true });
  }
);

app.post(
  "/api/members/activity/reward",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(activityRewardSchema, req, res);
    if (!input) return;
    if (input.mode === "start") {
      db.prepare(`
        UPDATE member_users
        SET last_activity_reward_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.currentMember.id);
      return res.json({ awarded: 0, points: Number(req.currentMember.points || 0) });
    }
    const lastReward = req.currentMember.last_activity_reward_at
      ? new Date(`${req.currentMember.last_activity_reward_at}Z`).getTime()
      : 0;
    const elapsed = Date.now() - lastReward;

    if (!lastReward) {
      db.prepare(`
        UPDATE member_users
        SET last_activity_reward_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.currentMember.id);
      return res.json({ awarded: 0, points: Number(req.currentMember.points || 0) });
    }
    if (elapsed < 55_000) {
      return res.json({ awarded: 0, points: Number(req.currentMember.points || 0) });
    }

    db.prepare(`
      UPDATE member_users
      SET points = points + 5, last_activity_reward_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.currentMember.id);
    const updated = currentMember(req);
    res.json({ awarded: 5, points: Number(updated.points) });
  }
);

const shopItems = {
  treat: { cost: 15, label: "Friandise Pixel" },
  meal: { cost: 30, label: "Repas Pixel" },
  feast: { cost: 50, label: "Festin Pixel" }
};

const petActions = {
  feed: { cost: 5, cooldownSeconds: 20, label: "Nourrir Pixel" },
  pet: { cost: 5, cooldownSeconds: 10, label: "Caresser Pixel" },
  bounce: { cost: 8, cooldownSeconds: 15, label: "Jouer avec Pixel" },
  sleep: { cost: 10, cooldownSeconds: 30, label: "Faire dormir Pixel" },
  walk: { cost: 15, cooldownSeconds: 60, label: "Promener Pixel" }
};

app.post(
  "/api/members/shop/purchase",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(shopPurchaseSchema, req, res);
    if (!input) return;
    const product = shopItems[input.item];
    if (Number(req.currentMember.points) < product.cost) {
      return res.status(409).json({ error: "Tu n’as pas assez de pièces." });
    }
    db.prepare(`
      UPDATE member_users
      SET points = points - ?
      WHERE id = ? AND points >= ?
    `).run(product.cost, req.currentMember.id, product.cost);
    const updated = currentMember(req);
    res.json({
      ok: true,
      item: input.item,
      label: product.label,
      cost: product.cost,
      points: Number(updated.points)
    });
  }
);

app.post(
  "/api/members/pixel/action",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(petActionSchema, req, res);
    if (!input) return;
    const action = petActions[input.action];
    const previous = db.prepare(`
      SELECT last_used_at
      FROM member_pet_actions
      WHERE member_id = ? AND action = ?
    `).get(req.currentMember.id, input.action);

    if (previous) {
      const lastUsedAt = new Date(`${previous.last_used_at}Z`).getTime();
      const remainingMs = action.cooldownSeconds * 1000 - (Date.now() - lastUsedAt);
      if (remainingMs > 0) {
        const retryAfter = Math.ceil(remainingMs / 1000);
        return res.status(429).json({
          error: `Pixel doit souffler encore ${retryAfter} seconde${retryAfter > 1 ? "s" : ""} avant cette action.`,
          code: "PET_ACTION_COOLDOWN",
          retryAfter
        });
      }
    }
    if (Number(req.currentMember.points) < action.cost) {
      return res.status(409).json({
        error: `${action.label} demande ${action.cost} pièces.`
      });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE member_users
        SET points = points - ?
        WHERE id = ? AND points >= ?
      `).run(action.cost, req.currentMember.id, action.cost);
      db.prepare(`
        INSERT INTO member_pet_actions (member_id, action, last_used_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(member_id, action)
        DO UPDATE SET last_used_at = CURRENT_TIMESTAMP
      `).run(req.currentMember.id, input.action);
    });
    const updated = currentMember(req);
    res.json({
      ok: true,
      action: input.action,
      cost: action.cost,
      cooldownSeconds: action.cooldownSeconds,
      points: Number(updated.points)
    });
  }
);

app.post(
  "/api/members/bug-reports",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(bugReportSchema, req, res);
    if (!input) return;
    const result = db.transaction(() => {
      const report = db.prepare(`
        INSERT INTO bug_reports (member_id, description)
        VALUES (?, ?)
      `).run(req.currentMember.id, input.description);
      notifyActiveStaff(
        "bug_report",
        report.lastInsertRowid,
        `Nouveau bug signalé par ${req.currentMember.display_name} (@${req.currentMember.username}) :\n${input.description}`
      );
      return report;
    });
    res.status(201).json({
      id: result.lastInsertRowid,
      message: "Merci ! Ton bug a été transmis à tous les modérateurs et administrateurs."
    });
  }
);

app.post(
  "/api/members/xp-conversions",
  authenticateMember,
  requireActiveMember,
  (req, res) => {
    const input = parse(xpConversionSchema, req, res);
    if (!input) return;
    if (Number(req.currentMember.points) < input.amount) {
      return res.status(409).json({ error: "Tu n’as pas assez de pièces." });
    }
    const xpAmount = input.amount * 15;
    const result = db.transaction(() => {
      const request = db.prepare(`
        INSERT INTO xp_conversion_requests
          (member_id, discord_username, amount)
        VALUES (?, ?, ?)
      `).run(req.currentMember.id, input.discordUsername, input.amount);
      db.prepare(`
        UPDATE member_users
        SET points = points - ?
        WHERE id = ? AND points >= ?
      `).run(input.amount, req.currentMember.id, input.amount);
      notifyActiveStaff(
        "xp_conversion",
        request.lastInsertRowid,
        `Conversion XP demandée par ${req.currentMember.display_name} : ${input.amount} pièces = ${xpAmount} XP PDD pour ${input.discordUsername}.`
      );
      return request;
    });
    const updated = currentMember(req);
    res.status(201).json({
      id: result.lastInsertRowid,
      pointsSpent: input.amount,
      xpAmount,
      points: Number(updated.points),
      message: "Ta demande de conversion a été envoyée à tout le staff."
    });
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

app.post(
  "/api/applications",
  authenticateMember,
  requireActiveMember,
  publicFormLimiter,
  (req, res) => {
    const input = parse(applicationSchema, req, res);
    if (!input) return;

    const activeApplication = db.prepare(`
      SELECT id
      FROM applications
      WHERE member_id = ? AND status IN ('pending', 'reviewing')
      LIMIT 1
    `).get(req.currentMember.id);
    if (activeApplication) {
      return res.status(409).json({
        error: "Tu as déjà une candidature en attente d’examen."
      });
    }

    const result = db.prepare(`
      INSERT INTO applications
        (member_id, age, desired_role, real_name, discord_username, motivation)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.currentMember.id,
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
  }
);

app.get(
  "/api/staff/applications",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (_req, res) => {
    const applications = db.prepare(`
      SELECT
        a.*,
        m.username AS member_username,
        m.display_name AS member_display_name
      FROM applications a
      LEFT JOIN member_users m ON m.id = a.member_id
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
    if (input.status === "accepted") {
      return res.status(400).json({
        error: "L’acceptation doit créer les identifiants du nouveau modérateur.",
        code: "ACCEPTANCE_ACCOUNT_REQUIRED"
      });
    }
    if (input.status === "rejected") {
      return res.status(400).json({
        error: "Le refus doit être confirmé par un administrateur.",
        code: "REJECTION_CONFIRMATION_REQUIRED"
      });
    }
    const application = db
      .prepare("SELECT status FROM applications WHERE id = ?")
      .get(Number(req.params.id));
    if (!application) {
      return res.status(404).json({ error: "Candidature introuvable." });
    }
    if (["accepted", "rejected"].includes(application.status)) {
      return res.status(409).json({
        error: "Une candidature terminée ne peut plus être modifiée."
      });
    }

    const result = db.prepare(`
      UPDATE applications
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.status, Number(req.params.id));
    res.json({ ok: true });
  }
);

app.post(
  "/api/admin/applications/:id/accept",
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  async (req, res) => {
    const input = parse(acceptApplicationSchema, req, res);
    if (!input) return;

    const applicationId = Number(req.params.id);
    const application = db.prepare(`
      SELECT a.*, m.username AS member_username, m.display_name AS member_display_name
      FROM applications a
      LEFT JOIN member_users m ON m.id = a.member_id
      WHERE a.id = ?
    `).get(applicationId);

    if (!application) {
      return res.status(404).json({ error: "Candidature introuvable." });
    }
    if (!application.member_id) {
      return res.status(409).json({
        error: "Cette ancienne candidature n’est reliée à aucun compte membre."
      });
    }
    if (["accepted", "rejected"].includes(application.status) || application.staff_account_id) {
      return res.status(409).json({ error: "Cette candidature est déjà terminée." });
    }
    const usernameExists = db
      .prepare("SELECT id FROM staff_users WHERE username = ? COLLATE NOCASE")
      .get(input.username);
    if (usernameExists) {
      return res.status(409).json({ error: "Cet identifiant staff existe déjà." });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const subject = "Candidature acceptée 🎉";
    const body = [
      "Félicitations, votre candidature a été acceptée !",
      "",
      "Voici les identifiants créés par un administrateur :",
      `Identifiant : ${input.username}`,
      `Mot de passe temporaire : ${input.password}`,
      "",
      "Vous devrez modifier ce mot de passe lors de votre première connexion."
    ].join("\n");

    try {
      const staffAccount = db.transaction(() => {
        const accountResult = db.prepare(`
          INSERT INTO staff_users
            (username, password_hash, role, active, must_change_password)
          VALUES (?, ?, 'moderator', 1, 1)
        `).run(input.username, passwordHash);

        db.prepare(`
          UPDATE applications
          SET status = 'accepted',
              staff_account_id = ?,
              accepted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(accountResult.lastInsertRowid, applicationId);

        db.prepare(`
          INSERT INTO member_messages
            (member_id, application_id, sender_name, sender_logo, subject, body)
          VALUES (?, ?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
        `).run(application.member_id, applicationId, subject, body);

        return db
          .prepare("SELECT * FROM staff_users WHERE id = ?")
          .get(accountResult.lastInsertRowid);
      });

      res.status(201).json({
        ok: true,
        account: publicUser(staffAccount),
        recipient: {
          username: application.member_username,
          displayName: application.member_display_name
        }
      });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ error: "Cet identifiant staff existe déjà." });
      }
      throw error;
    }
  }
);

app.post(
  "/api/admin/applications/:id/reject",
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  (req, res) => {
    const applicationId = Number(req.params.id);
    const application = db.prepare(`
      SELECT a.*, m.username AS member_username, m.display_name AS member_display_name
      FROM applications a
      LEFT JOIN member_users m ON m.id = a.member_id
      WHERE a.id = ?
    `).get(applicationId);

    if (!application) {
      return res.status(404).json({ error: "Candidature introuvable." });
    }
    if (!application.member_id) {
      return res.status(409).json({
        error: "Cette ancienne candidature n’est reliée à aucun compte membre."
      });
    }
    if (["accepted", "rejected"].includes(application.status)) {
      return res.status(409).json({ error: "Cette candidature est déjà terminée." });
    }

    const subject = "Décision concernant votre candidature";
    const body = [
      `Bonjour ${application.member_display_name},`,
      "",
      "Nous vous remercions sincèrement pour l’intérêt que vous portez à Pixel Difficult Drawer et pour le temps consacré à votre candidature.",
      "",
      `Après étude de votre demande, nous sommes au regret de vous informer que votre candidature n’a pas été retenue par ${req.currentUser.username}.`,
      "",
      "Cette décision ne remet pas en cause votre place dans notre communauté. Nous espérons avoir le plaisir de vous retrouver sur PDD, de découvrir vos créations et de partager de nouveaux événements avec vous.",
      "",
      "Vous pourrez proposer une nouvelle candidature ultérieurement si une autre occasion se présente.",
      "",
      "Au plaisir de vous revoir chez PDD,",
      "L’équipe PDD Staff"
    ].join("\n");

    db.transaction(() => {
      db.prepare(`
        UPDATE applications
        SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(applicationId);
      db.prepare(`
        INSERT INTO member_messages
          (member_id, application_id, sender_name, sender_logo, subject, body)
        VALUES (?, ?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
      `).run(application.member_id, applicationId, subject, body);
    });

    res.status(201).json({
      ok: true,
      recipient: {
        username: application.member_username,
        displayName: application.member_display_name
      }
    });
  }
);

app.get(
  "/api/staff/alerts",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const alerts = db.prepare(`
      SELECT id, alert_type, reference_id, body, resolved, created_at
      FROM staff_alerts
      WHERE recipient_id = ?
      ORDER BY resolved ASC, datetime(created_at) DESC, id DESC
      LIMIT 100
    `).all(req.currentUser.id);
    res.json({ alerts });
  }
);

app.post(
  "/api/staff/bug-reports/:id/decision",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const input = parse(bugDecisionSchema, req, res);
    if (!input) return;
    const reportId = Number(req.params.id);
    const report = db.prepare(`
      SELECT b.*, m.display_name, m.username
      FROM bug_reports b
      JOIN member_users m ON m.id = b.member_id
      WHERE b.id = ?
    `).get(reportId);
    if (!report) {
      return res.status(404).json({ error: "Signalement introuvable." });
    }
    if (report.status !== "pending") {
      return res.status(409).json({ error: "Ce signalement a déjà été traité." });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE bug_reports
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(input.decision, req.currentUser.id, reportId);
      if (input.decision === "approved") {
        db.prepare(`
          UPDATE member_users SET points = points + 50 WHERE id = ?
        `).run(report.member_id);
      }
      const approved = input.decision === "approved";
      const body = approved
        ? `Merci ${report.display_name} ! Ton signalement de bug a été validé par ${req.currentUser.username}. Tu as reçu 50 pièces.`
        : `Merci ${report.display_name}. Ton signalement a été étudié par ${req.currentUser.username}, mais il n’a pas été retenu pour une récompense cette fois-ci.`;
      db.prepare(`
        INSERT INTO member_messages
          (member_id, sender_name, sender_logo, subject, body)
        VALUES (?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
      `).run(
        report.member_id,
        approved ? "Bug validé : +50 pièces" : "Signalement de bug examiné",
        body
      );
      db.prepare(`
        UPDATE staff_alerts SET resolved = 1
        WHERE alert_type = 'bug_report' AND reference_id = ?
      `).run(reportId);
    });
    res.json({ ok: true, decision: input.decision, reward: input.decision === "approved" ? 50 : 0 });
  }
);

app.post(
  "/api/staff/xp-conversions/:id/decision",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (req, res) => {
    const input = parse(xpDecisionSchema, req, res);
    if (!input) return;
    const requestId = Number(req.params.id);
    const conversion = db.prepare(`
      SELECT x.*, m.display_name, m.username
      FROM xp_conversion_requests x
      JOIN member_users m ON m.id = x.member_id
      WHERE x.id = ?
    `).get(requestId);
    if (!conversion) {
      return res.status(404).json({ error: "Demande de conversion introuvable." });
    }
    if (conversion.status !== "pending") {
      return res.status(409).json({ error: "Cette demande a déjà été traitée." });
    }

    const xpAmount = Number(conversion.amount) * 15;
    db.transaction(() => {
      db.prepare(`
        UPDATE xp_conversion_requests
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(input.decision, req.currentUser.id, requestId);
      if (input.decision === "rejected") {
        db.prepare(`
          UPDATE member_users SET points = points + ? WHERE id = ?
        `).run(conversion.amount, conversion.member_id);
      }
      const completed = input.decision === "completed";
      const body = completed
        ? `Ta conversion de ${conversion.amount} pièces en ${xpAmount} XP PDD pour ${conversion.discord_username} a été marquée comme effectuée par ${req.currentUser.username}.`
        : `Ta demande de conversion de ${conversion.amount} pièces a été refusée par ${req.currentUser.username}. Tes pièces ont été intégralement remboursées.`;
      db.prepare(`
        INSERT INTO member_messages
          (member_id, sender_name, sender_logo, subject, body)
        VALUES (?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
      `).run(
        conversion.member_id,
        completed ? "Conversion XP effectuée" : "Conversion XP refusée et remboursée",
        body
      );
      db.prepare(`
        UPDATE staff_alerts SET resolved = 1
        WHERE alert_type = 'xp_conversion' AND reference_id = ?
      `).run(requestId);
    });
    res.json({
      ok: true,
      decision: input.decision,
      points: Number(conversion.amount),
      xpAmount,
      refunded: input.decision === "rejected"
    });
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

app.get(
  "/api/staff/ratings",
  authenticate,
  requireActiveStaff,
  staffOnly,
  (_req, res) => {
    const ratings = db.prepare(`
      SELECT
        r.id,
        r.stars,
        r.comment,
        r.created_at,
        r.updated_at,
        m.username AS member_username,
        m.display_name AS member_display_name
      FROM app_ratings r
      JOIN member_users m ON m.id = r.member_id
      ORDER BY datetime(r.updated_at) DESC
    `).all();
    const summary = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(AVG(stars), 0) AS average
      FROM app_ratings
    `).get();
    res.json({
      ratings,
      count: Number(summary.count),
      average: Number(Number(summary.average).toFixed(2))
    });
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
  requireOwnerAdmin,
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
  requireOwnerAdmin,
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
  requireOwnerAdmin,
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
