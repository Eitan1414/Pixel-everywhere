const MAX_TITLE_LENGTH = 140;
const MAX_BODY_LENGTH = 8000;
const MAX_VERSION_LENGTH = 40;
const MAX_POLL_QUESTION_LENGTH = 220;
const MAX_POLL_OPTION_LENGTH = 120;
const MAX_POLL_OPTIONS = 6;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES staff_users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS app_announcement_polls (
      announcement_id INTEGER PRIMARY KEY,
      question TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (announcement_id) REFERENCES app_announcements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_announcement_poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (announcement_id) REFERENCES app_announcements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_announcement_poll_votes (
      announcement_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, member_id),
      FOREIGN KEY (announcement_id) REFERENCES app_announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES app_announcement_poll_options(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_app_poll_options_announcement
      ON app_announcement_poll_options(announcement_id, position, id);
    CREATE INDEX IF NOT EXISTS idx_app_poll_votes_option
      ON app_announcement_poll_votes(option_id);

    CREATE TABLE IF NOT EXISTS app_update_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES staff_users(id) ON DELETE RESTRICT
    );
  `);
}

function normalizePoll(value) {
  if (!value || typeof value !== "object") return null;
  const question = cleanText(value.question, MAX_POLL_QUESTION_LENGTH);
  const sourceOptions = Array.isArray(value.options) ? value.options : [];
  const seen = new Set();
  const options = [];

  for (const rawOption of sourceOptions) {
    const option = cleanText(rawOption, MAX_POLL_OPTION_LENGTH);
    const key = option.toLocaleLowerCase("fr");
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
    if (options.length >= MAX_POLL_OPTIONS) break;
  }

  if (!question || options.length < 2) {
    return { error: "Un sondage doit contenir une question et entre 2 et 6 réponses différentes." };
  }
  return { question, options };
}

function pollPayload(db, announcementId, memberId = null) {
  const poll = db.prepare(`
    SELECT announcement_id, question, is_closed
    FROM app_announcement_polls
    WHERE announcement_id = ?
  `).get(Number(announcementId));
  if (!poll) return null;

  const options = db.prepare(`
    SELECT o.id, o.label, o.position, COUNT(v.member_id) AS votes
    FROM app_announcement_poll_options o
    LEFT JOIN app_announcement_poll_votes v ON v.option_id = o.id
    WHERE o.announcement_id = ?
    GROUP BY o.id, o.label, o.position
    ORDER BY o.position ASC, o.id ASC
  `).all(Number(announcementId)).map((option) => ({
    id: Number(option.id),
    label: option.label,
    votes: Number(option.votes || 0)
  }));
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
  const selected = memberId
    ? db.prepare(`
        SELECT option_id
        FROM app_announcement_poll_votes
        WHERE announcement_id = ? AND member_id = ?
      `).get(Number(announcementId), Number(memberId))
    : null;

  return {
    question: poll.question,
    isClosed: Boolean(poll.is_closed),
    totalVotes,
    selectedOptionId: selected ? Number(selected.option_id) : null,
    options: options.map((option) => ({
      ...option,
      percentage: totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0
    }))
  };
}

function announcementPayload(db, row, memberId = null) {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    author: row.author_username || "Équipe PDD",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    poll: pollPayload(db, row.id, memberId)
  };
}

function updateLogPayload(row) {
  return {
    id: Number(row.id),
    version: row.version,
    title: row.title,
    body: row.body,
    author: row.author_username || "Équipe PDD",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listAnnouncements(db, memberId = null) {
  return db.prepare(`
    SELECT a.*, u.username AS author_username
    FROM app_announcements a
    LEFT JOIN staff_users u ON u.id = a.author_id
    ORDER BY datetime(a.created_at) DESC, a.id DESC
    LIMIT 100
  `).all().map((row) => announcementPayload(db, row, memberId));
}

export function registerCommunityAnnouncementRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
}) {
  ensureTables(db);

  app.get("/api/app-announcements", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ announcements: listAnnouncements(db) });
  });

  app.get(
    "/api/members/app-announcements",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ announcements: listAnnouncements(db, req.currentMember.id) });
    }
  );

  app.post(
    "/api/members/app-announcements/:id/poll-vote",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      const announcementId = Number(req.params.id);
      const optionId = Number(req.body?.optionId);
      if (!Number.isInteger(announcementId) || !Number.isInteger(optionId)) {
        return res.status(400).json({ error: "Vote invalide." });
      }

      const poll = db.prepare(`
        SELECT announcement_id, is_closed
        FROM app_announcement_polls
        WHERE announcement_id = ?
      `).get(announcementId);
      if (!poll) return res.status(404).json({ error: "Ce sondage n’existe pas." });
      if (poll.is_closed) return res.status(409).json({ error: "Ce sondage est fermé." });

      const option = db.prepare(`
        SELECT id
        FROM app_announcement_poll_options
        WHERE id = ? AND announcement_id = ?
      `).get(optionId, announcementId);
      if (!option) return res.status(400).json({ error: "Cette réponse ne fait pas partie du sondage." });

      db.transaction(() => {
        db.prepare(`
          DELETE FROM app_announcement_poll_votes
          WHERE announcement_id = ? AND member_id = ?
        `).run(announcementId, req.currentMember.id);
        db.prepare(`
          INSERT INTO app_announcement_poll_votes (announcement_id, option_id, member_id)
          VALUES (?, ?, ?)
        `).run(announcementId, optionId, req.currentMember.id);
      });

      res.json({
        poll: pollPayload(db, announcementId, req.currentMember.id),
        message: "Ton vote a été enregistré."
      });
    }
  );

  app.get("/api/update-logs", (_req, res) => {
    const logs = db.prepare(`
      SELECT l.*, u.username AS author_username
      FROM app_update_logs l
      LEFT JOIN staff_users u ON u.id = l.author_id
      ORDER BY datetime(l.created_at) DESC, l.id DESC
      LIMIT 100
    `).all().map(updateLogPayload);
    res.set("Cache-Control", "no-store");
    res.json({ logs });
  });

  app.get(
    "/api/staff/app-announcements",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => res.json({ announcements: listAnnouncements(db) })
  );

  app.post(
    "/api/staff/app-announcements",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const title = cleanText(req.body?.title, MAX_TITLE_LENGTH);
      const body = cleanText(req.body?.body, MAX_BODY_LENGTH);
      const normalizedPoll = normalizePoll(req.body?.poll);
      if (!title || !body) {
        return res.status(400).json({ error: "Le titre et le contenu de l’annonce sont obligatoires." });
      }
      if (normalizedPoll?.error) return res.status(400).json({ error: normalizedPoll.error });

      const announcementId = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO app_announcements (author_id, title, body)
          VALUES (?, ?, ?)
        `).run(req.currentUser.id, title, body);
        const id = Number(result.lastInsertRowid);

        if (normalizedPoll) {
          db.prepare(`
            INSERT INTO app_announcement_polls (announcement_id, question)
            VALUES (?, ?)
          `).run(id, normalizedPoll.question);
          const insertOption = db.prepare(`
            INSERT INTO app_announcement_poll_options (announcement_id, label, position)
            VALUES (?, ?, ?)
          `);
          normalizedPoll.options.forEach((option, index) => insertOption.run(id, option, index));
        }
        return id;
      });

      const row = db.prepare(`
        SELECT a.*, u.username AS author_username
        FROM app_announcements a
        LEFT JOIN staff_users u ON u.id = a.author_id
        WHERE a.id = ?
      `).get(announcementId);
      res.status(201).json({
        announcement: announcementPayload(db, row),
        message: normalizedPoll
          ? "Annonce et sondage publiés."
          : "Annonce de l’application publiée."
      });
    }
  );

  app.patch(
    "/api/staff/app-announcements/:id/poll",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const announcementId = Number(req.params.id);
      const poll = db.prepare(`
        SELECT announcement_id
        FROM app_announcement_polls
        WHERE announcement_id = ?
      `).get(announcementId);
      if (!poll) return res.status(404).json({ error: "Sondage introuvable." });
      const isClosed = req.body?.isClosed ? 1 : 0;
      db.prepare(`
        UPDATE app_announcement_polls
        SET is_closed = ?
        WHERE announcement_id = ?
      `).run(isClosed, announcementId);
      res.json({
        poll: pollPayload(db, announcementId),
        message: isClosed ? "Sondage fermé." : "Sondage rouvert."
      });
    }
  );

  app.delete(
    "/api/staff/app-announcements/:id",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const result = db.prepare("DELETE FROM app_announcements WHERE id = ?").run(Number(req.params.id));
      if (!result.changes) return res.status(404).json({ error: "Annonce introuvable." });
      res.json({ ok: true, message: "Annonce supprimée." });
    }
  );

  app.get(
    "/api/staff/update-logs",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => {
      const logs = db.prepare(`
        SELECT l.*, u.username AS author_username
        FROM app_update_logs l
        LEFT JOIN staff_users u ON u.id = l.author_id
        ORDER BY datetime(l.created_at) DESC, l.id DESC
        LIMIT 100
      `).all().map(updateLogPayload);
      res.json({ logs });
    }
  );

  app.post(
    "/api/staff/update-logs",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const version = cleanText(req.body?.version, MAX_VERSION_LENGTH);
      const title = cleanText(req.body?.title, MAX_TITLE_LENGTH);
      const body = cleanText(req.body?.body, MAX_BODY_LENGTH);
      if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
        return res.status(400).json({ error: "La version doit ressembler à 0.3.4." });
      }
      if (!title || !body) {
        return res.status(400).json({ error: "Le titre et le détail de la mise à jour sont obligatoires." });
      }
      const result = db.prepare(`
        INSERT INTO app_update_logs (author_id, version, title, body)
        VALUES (?, ?, ?, ?)
      `).run(req.currentUser.id, version, title, body);
      const row = db.prepare(`
        SELECT l.*, u.username AS author_username
        FROM app_update_logs l
        LEFT JOIN staff_users u ON u.id = l.author_id
        WHERE l.id = ?
      `).get(result.lastInsertRowid);
      res.status(201).json({ log: updateLogPayload(row), message: `Journal de la version ${version} publié.` });
    }
  );

  app.delete(
    "/api/staff/update-logs/:id",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const result = db.prepare("DELETE FROM app_update_logs WHERE id = ?").run(Number(req.params.id));
      if (!result.changes) return res.status(404).json({ error: "Journal de mise à jour introuvable." });
      res.json({ ok: true, message: "Journal de mise à jour supprimé." });
    }
  );
}
