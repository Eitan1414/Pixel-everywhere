import { z } from "zod";

const DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_PROJECT_SIZE = 9_000_000;

const submissionSchema = z.object({
  kind: z.enum(["drawing", "animation"]),
  title: z.string().trim().min(2, "Ajoute un titre d’au moins 2 caractères.").max(100),
  description: z.string().trim().max(1200).default(""),
  previewData: z.string().max(2_500_000).refine((value) => DATA_URL_PATTERN.test(value), "L’aperçu PNG est invalide."),
  projectData: z.string().min(2).max(MAX_PROJECT_SIZE),
  frameCount: z.number().int().min(1).max(24),
  fps: z.number().int().min(1).max(12).default(6)
}).strict().superRefine((input, context) => {
  if (input.kind === "drawing" && input.frameCount !== 1) {
    context.addIssue({ code: "custom", path: ["frameCount"], message: "Un dessin doit contenir une seule image." });
  }
  try {
    const project = JSON.parse(input.projectData);
    if (!project || !Array.isArray(project.frames) || project.frames.length !== input.frameCount) {
      context.addIssue({ code: "custom", path: ["projectData"], message: "Le projet ne contient pas le bon nombre de frames." });
      return;
    }
    if (project.frames.some((frame) => typeof frame !== "string" || !DATA_URL_PATTERN.test(frame))) {
      context.addIssue({ code: "custom", path: ["projectData"], message: "Une frame du projet est invalide." });
    }
  } catch {
    context.addIssue({ code: "custom", path: ["projectData"], message: "Le projet envoyé est illisible." });
  }
});

const decisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rewardPoints: z.coerce.number().int().min(0).max(1000),
  note: z.string().trim().max(1500).default("")
}).strict().superRefine((input, context) => {
  if (input.status === "approved" && input.rewardPoints < 1) {
    context.addIssue({ code: "custom", path: ["rewardPoints"], message: "Une création approuvée doit rapporter au moins 1 pièce." });
  }
  if (input.status === "rejected" && input.rewardPoints !== 0) {
    context.addIssue({ code: "custom", path: ["rewardPoints"], message: "Une création refusée ne peut pas attribuer de pièces." });
  }
});

function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Certains champs sont invalides.",
      details: result.error.issues.map((issue) => issue.message)
    });
    return null;
  }
  return result.data;
}

function ensureCreationTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creation_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('drawing', 'animation')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      preview_data TEXT NOT NULL,
      project_data TEXT NOT NULL,
      frame_count INTEGER NOT NULL DEFAULT 1,
      fps INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reward_points INTEGER NOT NULL DEFAULT 0,
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES staff_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_creation_submissions_member
      ON creation_submissions(member_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_creation_submissions_status
      ON creation_submissions(status, created_at);
  `);
}

function publicCreation(row, { includeProject = false } = {}) {
  const creation = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    previewData: row.preview_data,
    frameCount: Number(row.frame_count || 1),
    fps: Number(row.fps || 6),
    status: row.status,
    rewardPoints: Number(row.reward_points || 0),
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.member_username !== undefined) {
    creation.member = {
      id: row.member_id,
      username: row.member_username,
      displayName: row.member_display_name
    };
  }
  if (row.staff_username) creation.reviewedBy = row.staff_username;
  if (includeProject) creation.projectData = row.project_data;
  return creation;
}

function notifyStaff(db, creationId, member, title, kind) {
  try {
    const recipients = db.prepare("SELECT id FROM staff_users WHERE active = 1").all();
    const insert = db.prepare(`
      INSERT INTO staff_alerts (recipient_id, alert_type, reference_id, body)
      VALUES (?, 'creation', ?, ?)
    `);
    const typeLabel = kind === "animation" ? "une animation" : "un dessin";
    recipients.forEach((recipient) => {
      insert.run(recipient.id, creationId, `${member.display_name} a envoyé ${typeLabel} : ${title}`);
    });
  } catch {
    // Les anciennes bases sans table staff_alerts restent compatibles.
  }
}

export function registerCreationRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
}) {
  ensureCreationTables(db);

  app.get(
    "/api/members/creations",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const rows = db.prepare(`
        SELECT id, kind, title, description, preview_data, frame_count, fps,
               status, reward_points, review_note, reviewed_at, created_at, updated_at
        FROM creation_submissions
        WHERE member_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 60
      `).all(req.currentMember.id);
      res.json({ creations: rows.map((row) => publicCreation(row)) });
    }
  );

  app.post(
    "/api/members/creations",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const input = parseBody(submissionSchema, req, res);
      if (!input) return;

      const recent = db.prepare(`
        SELECT COUNT(*) AS count
        FROM creation_submissions
        WHERE member_id = ?
          AND datetime(created_at) >= datetime('now', '-1 day')
      `).get(req.currentMember.id);
      if (Number(recent?.count || 0) >= 8) {
        return res.status(429).json({
          error: "Tu as déjà envoyé 8 créations aujourd’hui. Réessaie demain pour éviter le spam."
        });
      }

      const result = db.prepare(`
        INSERT INTO creation_submissions
          (member_id, kind, title, description, preview_data, project_data, frame_count, fps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.currentMember.id,
        input.kind,
        input.title,
        input.description,
        input.previewData,
        input.projectData,
        input.frameCount,
        input.fps
      );

      notifyStaff(db, result.lastInsertRowid, req.currentMember, input.title, input.kind);
      res.status(201).json({
        id: result.lastInsertRowid,
        message: "Ta création a été envoyée au staff. Tu recevras sa décision dans ta messagerie."
      });
    }
  );

  app.get(
    "/api/staff/creations",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => {
      const rows = db.prepare(`
        SELECT
          c.*,
          m.username AS member_username,
          m.display_name AS member_display_name,
          s.username AS staff_username
        FROM creation_submissions c
        JOIN member_users m ON m.id = c.member_id
        LEFT JOIN staff_users s ON s.id = c.reviewed_by
        ORDER BY
          CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          datetime(c.updated_at) DESC,
          c.id DESC
        LIMIT 120
      `).all();
      res.json({ creations: rows.map((row) => publicCreation(row)) });
    }
  );

  app.get(
    "/api/staff/creations/:id/project",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const creationId = Number(req.params.id);
      if (!Number.isInteger(creationId) || creationId <= 0) {
        return res.status(400).json({ error: "Création invalide." });
      }
      const creation = db.prepare(`
        SELECT id, kind, project_data, frame_count, fps
        FROM creation_submissions
        WHERE id = ?
      `).get(creationId);
      if (!creation) return res.status(404).json({ error: "Création introuvable." });
      res.json({
        id: creation.id,
        kind: creation.kind,
        projectData: creation.project_data,
        frameCount: Number(creation.frame_count || 1),
        fps: Number(creation.fps || 6)
      });
    }
  );

  app.post(
    "/api/staff/creations/:id/decision",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const input = parseBody(decisionSchema, req, res);
      if (!input) return;

      const creationId = Number(req.params.id);
      if (!Number.isInteger(creationId) || creationId <= 0) {
        return res.status(400).json({ error: "Création invalide." });
      }

      const creation = db.prepare(`
        SELECT c.*, m.display_name, m.username
        FROM creation_submissions c
        JOIN member_users m ON m.id = c.member_id
        WHERE c.id = ?
      `).get(creationId);
      if (!creation) return res.status(404).json({ error: "Création introuvable." });
      if (creation.status !== "pending") {
        return res.status(409).json({ error: "Cette création a déjà été traitée." });
      }

      const kindLabel = creation.kind === "animation" ? "animation" : "dessin";
      const approved = input.status === "approved";
      const subject = approved
        ? `Ton ${kindLabel} a été approuvé !`
        : `Décision concernant ton ${kindLabel}`;
      const messageBody = approved
        ? [
            `Bonjour ${creation.display_name},`,
            "",
            `Le staff a approuvé ta création « ${creation.title} ».`,
            `Récompense : ${input.rewardPoints} pièce${input.rewardPoints > 1 ? "s" : ""}.`,
            input.note ? "" : null,
            input.note || null,
            "",
            `Décision prise par ${req.currentUser.username}.`
          ].filter((line) => line !== null).join("\n")
        : [
            `Bonjour ${creation.display_name},`,
            "",
            `Le staff n’a pas retenu ta création « ${creation.title} » pour une récompense.`,
            input.note ? "" : null,
            input.note || "Tu peux la modifier et envoyer une nouvelle version.",
            "",
            `Décision prise par ${req.currentUser.username}.`
          ].filter((line) => line !== null).join("\n");

      const transaction = db.transaction(() => {
        const update = db.prepare(`
          UPDATE creation_submissions
          SET status = ?, reward_points = ?, review_note = ?, reviewed_by = ?,
              reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `).run(input.status, approved ? input.rewardPoints : 0, input.note, req.currentUser.id, creationId);
        if (!update.changes) throw new Error("CREATION_ALREADY_PROCESSED");

        if (approved) {
          db.prepare("UPDATE member_users SET points = points + ? WHERE id = ?")
            .run(input.rewardPoints, creation.member_id);
        }

        db.prepare(`
          INSERT INTO member_messages
            (member_id, sender_name, sender_logo, subject, body)
          VALUES (?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
        `).run(creation.member_id, subject, messageBody);
      });

      try {
        transaction();
      } catch (error) {
        if (error.message === "CREATION_ALREADY_PROCESSED") {
          return res.status(409).json({ error: "Cette création vient déjà d’être traitée." });
        }
        throw error;
      }

      const member = db.prepare("SELECT points FROM member_users WHERE id = ?").get(creation.member_id);
      res.json({
        status: input.status,
        rewardPoints: approved ? input.rewardPoints : 0,
        memberPoints: Number(member?.points || 0),
        message: approved
          ? `Création approuvée : ${input.rewardPoints} pièces ont été ajoutées.`
          : "Création refusée et membre prévenu."
      });
    }
  );
}
