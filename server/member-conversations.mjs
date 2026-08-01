import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

function asText(value, { field, min = 1, max = 2000 }) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) {
    const detail = min === max ? `${max}` : `${min} à ${max}`;
    const error = new Error(`${field} doit contenir ${detail} caractères.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function asId(value, field = "Identifiant") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${field} invalide.`);
    error.status = 400;
    throw error;
  }
  return id;
}

function sendRouteError(res, error) {
  res.status(error.status || 500).json({
    error: error.status ? error.message : "Une erreur interne est survenue."
  });
}

function publicLinkedMember(member, staff) {
  return {
    id: Number(member.id),
    username: member.username,
    displayName: member.display_name,
    points: Number(member.points || 0),
    createdAt: member.created_at,
    staffLinked: true,
    staffId: Number(staff.id),
    staffRole: staff.role
  };
}

function createConversationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_member_links (
      staff_id INTEGER PRIMARY KEY,
      member_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS member_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      closed INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL CHECK (created_by IN ('member', 'staff')),
      created_by_staff_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL CHECK (sender_type IN ('member', 'staff')),
      sender_member_id INTEGER,
      sender_staff_id INTEGER,
      body TEXT NOT NULL,
      read_by_member_at TEXT,
      read_by_staff_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES member_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_member_id) REFERENCES member_users(id) ON DELETE SET NULL,
      FOREIGN KEY (sender_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_member_conversations_member
      ON member_conversations(member_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
      ON conversation_messages(conversation_id, id);
  `);
}

function listMemberThreads(db, memberId) {
  return db.prepare(`
    SELECT
      c.id,
      c.subject,
      c.closed,
      c.created_by,
      c.created_at,
      c.updated_at,
      (
        SELECT body
        FROM conversation_messages last_message
        WHERE last_message.conversation_id = c.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT created_at
        FROM conversation_messages last_message
        WHERE last_message.conversation_id = c.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT COUNT(*)
        FROM conversation_messages unread
        WHERE unread.conversation_id = c.id
          AND unread.sender_type = 'staff'
          AND unread.read_by_member_at IS NULL
      ) AS unread_count
    FROM member_conversations c
    WHERE c.member_id = ?
    ORDER BY datetime(c.updated_at) DESC, c.id DESC
  `).all(memberId);
}

function listStaffThreads(db) {
  return db.prepare(`
    SELECT
      c.id,
      c.subject,
      c.closed,
      c.created_by,
      c.created_at,
      c.updated_at,
      m.id AS member_id,
      m.username AS member_username,
      m.display_name AS member_display_name,
      (
        SELECT body
        FROM conversation_messages last_message
        WHERE last_message.conversation_id = c.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT created_at
        FROM conversation_messages last_message
        WHERE last_message.conversation_id = c.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT COUNT(*)
        FROM conversation_messages unread
        WHERE unread.conversation_id = c.id
          AND unread.sender_type = 'member'
          AND unread.read_by_staff_at IS NULL
      ) AS unread_count
    FROM member_conversations c
    JOIN member_users m ON m.id = c.member_id
    ORDER BY datetime(c.updated_at) DESC, c.id DESC
  `).all();
}

function readThreadMessages(db, conversationId) {
  return db.prepare(`
    SELECT
      msg.id,
      msg.sender_type,
      msg.body,
      msg.read_by_member_at,
      msg.read_by_staff_at,
      msg.created_at,
      CASE
        WHEN msg.sender_type = 'staff' THEN COALESCE(s.username, 'Staff PDD')
        ELSE COALESCE(m.display_name, 'Membre PDD')
      END AS sender_name,
      s.role AS sender_staff_role
    FROM conversation_messages msg
    LEFT JOIN staff_users s ON s.id = msg.sender_staff_id
    LEFT JOIN member_users m ON m.id = msg.sender_member_id
    WHERE msg.conversation_id = ?
    ORDER BY msg.id ASC
  `).all(conversationId);
}

function insertMessage(db, { conversationId, senderType, senderId, body }) {
  const result = db.prepare(`
    INSERT INTO conversation_messages (
      conversation_id,
      sender_type,
      sender_member_id,
      sender_staff_id,
      body,
      read_by_member_at,
      read_by_staff_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    senderType,
    senderType === "member" ? senderId : null,
    senderType === "staff" ? senderId : null,
    body,
    senderType === "member" ? new Date().toISOString() : null,
    senderType === "staff" ? new Date().toISOString() : null
  );
  db.prepare(`
    UPDATE member_conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(conversationId);
  return result.lastInsertRowid;
}

function findMemberConversation(db, conversationId, memberId) {
  return db.prepare(`
    SELECT c.*, m.username AS member_username, m.display_name AS member_display_name
    FROM member_conversations c
    JOIN member_users m ON m.id = c.member_id
    WHERE c.id = ? AND c.member_id = ?
  `).get(conversationId, memberId);
}

function findStaffConversation(db, conversationId) {
  return db.prepare(`
    SELECT c.*, m.username AS member_username, m.display_name AS member_display_name
    FROM member_conversations c
    JOIN member_users m ON m.id = c.member_id
    WHERE c.id = ?
  `).get(conversationId);
}

export function registerMemberConversationRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  createToken,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
}) {
  createConversationSchema(db);

  app.post(
    "/api/conversations/staff/member-profile",
    authenticate,
    requireActiveStaff,
    staffOnly,
    async (req, res) => {
      try {
        let link = db.prepare(`
          SELECT member_id
          FROM staff_member_links
          WHERE staff_id = ?
        `).get(req.currentUser.id);

        if (!link) {
          const generatedUsername = `staff-${req.currentUser.id}-${randomUUID().slice(0, 8)}`;
          const passwordHash = await bcrypt.hash(randomUUID(), 10);
          const displayName = `${req.currentUser.username} · ${
            req.currentUser.role === "admin" ? "Administrateur" : "Modérateur"
          }`;
          const created = db.prepare(`
            INSERT INTO member_users (username, password_hash, display_name)
            VALUES (?, ?, ?)
          `).run(generatedUsername, passwordHash, displayName);
          const memberId = created.lastInsertRowid;

          db.prepare(`
            INSERT INTO staff_member_links (staff_id, member_id)
            VALUES (?, ?)
          `).run(req.currentUser.id, memberId);
          link = { member_id: memberId };
        }

        const member = db.prepare(`
          SELECT id, username, display_name, points, created_at
          FROM member_users
          WHERE id = ?
        `).get(link.member_id);
        if (!member) {
          return res.status(409).json({
            error: "Le profil membre lié à ce compte staff est introuvable."
          });
        }

        res.json({
          token: createToken({ ...member, role: "member" }, "member"),
          member: publicLinkedMember(member, req.currentUser)
        });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/conversations/member",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      res.json({ conversations: listMemberThreads(db, req.currentMember.id) });
    }
  );

  app.post(
    "/api/conversations/member",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const subject = asText(req.body?.subject, { field: "Le sujet", min: 3, max: 100 });
        const body = asText(req.body?.body, { field: "Le message", min: 1, max: 2000 });
        const conversationId = db.transaction(() => {
          const conversation = db.prepare(`
            INSERT INTO member_conversations (member_id, subject, created_by)
            VALUES (?, ?, 'member')
          `).run(req.currentMember.id, subject);
          insertMessage(db, {
            conversationId: conversation.lastInsertRowid,
            senderType: "member",
            senderId: req.currentMember.id,
            body
          });
          return conversation.lastInsertRowid;
        });
        res.status(201).json({ conversationId });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/conversations/member/:id",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findMemberConversation(db, conversationId, req.currentMember.id);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation introuvable." });
        }
        db.prepare(`
          UPDATE conversation_messages
          SET read_by_member_at = COALESCE(read_by_member_at, CURRENT_TIMESTAMP)
          WHERE conversation_id = ? AND sender_type = 'staff'
        `).run(conversationId);
        res.json({ conversation, messages: readThreadMessages(db, conversationId) });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.post(
    "/api/conversations/member/:id/messages",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findMemberConversation(db, conversationId, req.currentMember.id);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation introuvable." });
        }
        if (conversation.closed) {
          return res.status(409).json({ error: "Cette conversation est fermée." });
        }
        const body = asText(req.body?.body, { field: "Le message", min: 1, max: 2000 });
        const messageId = insertMessage(db, {
          conversationId,
          senderType: "member",
          senderId: req.currentMember.id,
          body
        });
        res.status(201).json({ messageId });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/conversations/staff/members",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => {
      const members = db.prepare(`
        SELECT m.id, m.username, m.display_name, m.points, m.created_at,
               CASE WHEN links.staff_id IS NULL THEN 0 ELSE 1 END AS staff_linked
        FROM member_users m
        LEFT JOIN staff_member_links links ON links.member_id = m.id
        WHERE links.staff_id IS NULL
        ORDER BY m.display_name COLLATE NOCASE ASC
      `).all();
      res.json({ members });
    }
  );

  app.get(
    "/api/conversations/staff",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (_req, res) => {
      res.json({ conversations: listStaffThreads(db) });
    }
  );

  app.post(
    "/api/conversations/staff",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      try {
        const memberId = asId(req.body?.memberId, "Membre");
        const member = db.prepare("SELECT id FROM member_users WHERE id = ?").get(memberId);
        if (!member) {
          return res.status(404).json({ error: "Membre introuvable." });
        }
        const subject = asText(req.body?.subject, { field: "Le sujet", min: 3, max: 100 });
        const body = asText(req.body?.body, { field: "Le message", min: 1, max: 2000 });
        const conversationId = db.transaction(() => {
          const conversation = db.prepare(`
            INSERT INTO member_conversations (
              member_id,
              subject,
              created_by,
              created_by_staff_id
            ) VALUES (?, ?, 'staff', ?)
          `).run(memberId, subject, req.currentUser.id);
          insertMessage(db, {
            conversationId: conversation.lastInsertRowid,
            senderType: "staff",
            senderId: req.currentUser.id,
            body
          });
          return conversation.lastInsertRowid;
        });
        res.status(201).json({ conversationId });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/conversations/staff/:id",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findStaffConversation(db, conversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation introuvable." });
        }
        db.prepare(`
          UPDATE conversation_messages
          SET read_by_staff_at = COALESCE(read_by_staff_at, CURRENT_TIMESTAMP)
          WHERE conversation_id = ? AND sender_type = 'member'
        `).run(conversationId);
        res.json({ conversation, messages: readThreadMessages(db, conversationId) });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.post(
    "/api/conversations/staff/:id/messages",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findStaffConversation(db, conversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation introuvable." });
        }
        if (conversation.closed) {
          return res.status(409).json({ error: "Cette conversation est fermée." });
        }
        const body = asText(req.body?.body, { field: "Le message", min: 1, max: 2000 });
        const messageId = insertMessage(db, {
          conversationId,
          senderType: "staff",
          senderId: req.currentUser.id,
          body
        });
        res.status(201).json({ messageId });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.patch(
    "/api/conversations/staff/:id/close",
    authenticate,
    requireActiveStaff,
    staffOnly,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const closed = req.body?.closed === false ? 0 : 1;
        const result = db.prepare(`
          UPDATE member_conversations
          SET closed = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(closed, conversationId);
        if (!result.changes) {
          return res.status(404).json({ error: "Conversation introuvable." });
        }
        res.json({ ok: true, closed: Boolean(closed) });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );
}
