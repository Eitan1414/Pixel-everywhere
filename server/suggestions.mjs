import { z } from "zod";

const suggestionSchema = z.object({
  title: z.string().trim().min(5, "Le titre doit contenir au moins 5 caractères.").max(120),
  description: z.string().trim().min(20, "Décris ta suggestion avec au moins 20 caractères.").max(4000)
}).strict();

const replySchema = z.object({
  body: z.string().trim().min(2, "La réponse est trop courte.").max(3000),
  status: z.enum(["pending", "reviewing", "planned", "accepted", "rejected", "implemented"])
}).strict();

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

function ensureSuggestionTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewing', 'planned', 'accepted', 'rejected', 'implemented')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suggestion_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      status_after TEXT NOT NULL
        CHECK (status_after IN ('pending', 'reviewing', 'planned', 'accepted', 'rejected', 'implemented')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (suggestion_id) REFERENCES update_suggestions(id) ON DELETE CASCADE,
      FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_update_suggestions_member
      ON update_suggestions(member_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_suggestion_replies_suggestion
      ON suggestion_replies(suggestion_id, created_at);
  `);
}

function suggestionsWithReplies(db, suggestions) {
  const repliesQuery = db.prepare(`
    SELECT
      r.id,
      r.body,
      r.status_after,
      r.created_at,
      u.username AS staff_username,
      u.role AS staff_role
    FROM suggestion_replies r
    JOIN staff_users u ON u.id = r.staff_id
    WHERE r.suggestion_id = ?
    ORDER BY datetime(r.created_at) ASC, r.id ASC
  `);

  return suggestions.map((suggestion) => ({
    ...suggestion,
    replies: repliesQuery.all(suggestion.id)
  }));
}

export function registerSuggestionRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
}) {
  ensureSuggestionTables(db);

  app.get(
    "/api/members/suggestions",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const suggestions = db.prepare(`
        SELECT id, title, description, status, created_at, updated_at
        FROM update_suggestions
        WHERE member_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `).all(req.currentMember.id);
      res.json({ suggestions: suggestionsWithReplies(db, suggestions) });
    }
  );

  app.post(
    "/api/members/suggestions",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const input = parseBody(suggestionSchema, req, res);
      if (!input) return;

      const recent = db.prepare(`
        SELECT COUNT(*) AS count
        FROM update_suggestions
        WHERE member_id = ?
          AND datetime(created_at) >= datetime('now', '-1 day')
      `).get(req.currentMember.id);
      if (Number(recent?.count || 0) >= 10) {
        return res.status(429).json({
          error: "Tu as déjà envoyé beaucoup de suggestions aujourd’hui. Réessaie demain."
        });
      }

      const result = db.prepare(`
        INSERT INTO update_suggestions (member_id, title, description)
        VALUES (?, ?, ?)
      `).run(req.currentMember.id, input.title, input.description);

      res.status(201).json({
        id: result.lastInsertRowid,
        message: "Ta suggestion a bien été envoyée aux modérateurs."
      });
    }
  );

  app.get(
    "/api/staff/suggestions",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => {
      const suggestions = db.prepare(`
        SELECT
          s.id,
          s.member_id,
          s.title,
          s.description,
          s.status,
          s.created_at,
          s.updated_at,
          m.username AS member_username,
          m.display_name AS member_display_name
        FROM update_suggestions s
        JOIN member_users m ON m.id = s.member_id
        ORDER BY
          CASE s.status
            WHEN 'pending' THEN 0
            WHEN 'reviewing' THEN 1
            WHEN 'planned' THEN 2
            WHEN 'accepted' THEN 3
            ELSE 4
          END,
          datetime(s.updated_at) DESC,
          s.id DESC
      `).all();
      res.json({ suggestions: suggestionsWithReplies(db, suggestions) });
    }
  );

  app.post(
    "/api/staff/suggestions/:id/replies",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const input = parseBody(replySchema, req, res);
      if (!input) return;

      const suggestionId = Number(req.params.id);
      if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
        return res.status(400).json({ error: "Suggestion invalide." });
      }

      const suggestion = db.prepare(`
        SELECT s.*, m.display_name, m.username
        FROM update_suggestions s
        JOIN member_users m ON m.id = s.member_id
        WHERE s.id = ?
      `).get(suggestionId);
      if (!suggestion) {
        return res.status(404).json({ error: "Suggestion introuvable." });
      }

      const statusLabels = {
        pending: "En attente",
        reviewing: "En cours d’étude",
        planned: "Planifiée",
        accepted: "Acceptée",
        rejected: "Refusée",
        implemented: "Ajoutée à l’application"
      };
      const subject = `Réponse à ta suggestion : ${suggestion.title}`;
      const messageBody = [
        `Bonjour ${suggestion.display_name},`,
        "",
        `${req.currentUser.username} a répondu à ta suggestion « ${suggestion.title} » :`,
        "",
        input.body,
        "",
        `Nouveau statut : ${statusLabels[input.status]}.`
      ].join("\n");

      const replyResult = db.transaction(() => {
        const reply = db.prepare(`
          INSERT INTO suggestion_replies
            (suggestion_id, staff_id, body, status_after)
          VALUES (?, ?, ?, ?)
        `).run(suggestionId, req.currentUser.id, input.body, input.status);

        db.prepare(`
          UPDATE update_suggestions
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(input.status, suggestionId);

        db.prepare(`
          INSERT INTO member_messages
            (member_id, sender_name, sender_logo, subject, body)
          VALUES (?, 'PDD Staff', '/assets/pdd-logo.jpg', ?, ?)
        `).run(suggestion.member_id, subject, messageBody);

        return reply;
      });

      res.status(201).json({
        id: replyResult.lastInsertRowid,
        status: input.status,
        message: "Réponse envoyée au membre dans sa messagerie."
      });
    }
  );
}
