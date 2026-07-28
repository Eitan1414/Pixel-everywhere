const MAX_TITLE_LENGTH = 140;
const MAX_BODY_LENGTH = 8000;
const MAX_VERSION_LENGTH = 40;

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

function announcementPayload(row) {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    author: row.author_username || "Équipe PDD",
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

export function registerCommunityAnnouncementRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly
}) {
  ensureTables(db);

  app.get("/api/app-announcements", (_req, res) => {
    const announcements = db.prepare(`
      SELECT a.*, u.username AS author_username
      FROM app_announcements a
      LEFT JOIN staff_users u ON u.id = a.author_id
      ORDER BY datetime(a.created_at) DESC, a.id DESC
      LIMIT 100
    `).all().map(announcementPayload);
    res.set("Cache-Control", "no-store");
    res.json({ announcements });
  });

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
    (_req, res) => {
      const announcements = db.prepare(`
        SELECT a.*, u.username AS author_username
        FROM app_announcements a
        LEFT JOIN staff_users u ON u.id = a.author_id
        ORDER BY datetime(a.created_at) DESC, a.id DESC
        LIMIT 100
      `).all().map(announcementPayload);
      res.json({ announcements });
    }
  );

  app.post(
    "/api/staff/app-announcements",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      const title = cleanText(req.body?.title, MAX_TITLE_LENGTH);
      const body = cleanText(req.body?.body, MAX_BODY_LENGTH);
      if (!title || !body) {
        return res.status(400).json({ error: "Le titre et le contenu de l’annonce sont obligatoires." });
      }
      const result = db.prepare(`
        INSERT INTO app_announcements (author_id, title, body)
        VALUES (?, ?, ?)
      `).run(req.currentUser.id, title, body);
      const row = db.prepare(`
        SELECT a.*, u.username AS author_username
        FROM app_announcements a
        LEFT JOIN staff_users u ON u.id = a.author_id
        WHERE a.id = ?
      `).get(result.lastInsertRowid);
      res.status(201).json({ announcement: announcementPayload(row), message: "Annonce de l’application publiée." });
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
