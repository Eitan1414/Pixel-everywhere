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

function asCursor(value) {
  if (value === undefined || value === null || value === "") return 0;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) {
    const error = new Error("Curseur de messages invalide.");
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

function createCommunityMessagingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_member_links (
      staff_id INTEGER PRIMARY KEY,
      member_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS public_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_member_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by_member_id INTEGER,
      FOREIGN KEY (sender_member_id) REFERENCES member_users(id) ON DELETE CASCADE,
      FOREIGN KEY (deleted_by_member_id) REFERENCES member_users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS member_direct_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_a_id INTEGER NOT NULL,
      member_b_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (member_a_id < member_b_id),
      UNIQUE (member_a_id, member_b_id),
      FOREIGN KEY (member_a_id) REFERENCES member_users(id) ON DELETE CASCADE,
      FOREIGN KEY (member_b_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS member_direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      sender_member_id INTEGER NOT NULL,
      recipient_member_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES member_direct_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_member_id) REFERENCES member_users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_member_id) REFERENCES member_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_public_chat_messages_id
      ON public_chat_messages(id);
    CREATE INDEX IF NOT EXISTS idx_public_chat_messages_sender
      ON public_chat_messages(sender_member_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_member_direct_threads_a
      ON member_direct_threads(member_a_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_member_direct_threads_b
      ON member_direct_threads(member_b_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_member_direct_messages_thread
      ON member_direct_messages(thread_id, id);
    CREATE INDEX IF NOT EXISTS idx_member_direct_messages_unread
      ON member_direct_messages(recipient_member_id, read_at, id);
  `);
}

function memberProfileSelect(alias = "m") {
  return `
    ${alias}.id,
    ${alias}.username,
    ${alias}.display_name,
    linked_staff.role AS staff_role
  `;
}

function listPublicChatMessages(db, afterId) {
  const base = `
    SELECT
      chat.id,
      chat.sender_member_id,
      chat.body,
      chat.created_at,
      ${memberProfileSelect("m")}
    FROM public_chat_messages chat
    JOIN member_users m ON m.id = chat.sender_member_id
    LEFT JOIN staff_member_links links ON links.member_id = m.id
    LEFT JOIN staff_users linked_staff ON linked_staff.id = links.staff_id
    WHERE chat.deleted_at IS NULL
  `;

  if (afterId > 0) {
    return db.prepare(`${base}
      AND chat.id > ?
      ORDER BY chat.id ASC
      LIMIT 100
    `).all(afterId);
  }

  return db.prepare(`
    SELECT * FROM (
      ${base}
      ORDER BY chat.id DESC
      LIMIT 100
    ) recent
    ORDER BY recent.id ASC
  `).all();
}

function linkedStaffRole(db, memberId) {
  return db.prepare(`
    SELECT s.role
    FROM staff_member_links links
    JOIN staff_users s ON s.id = links.staff_id
    WHERE links.member_id = ?
  `).get(memberId)?.role || null;
}

function ensurePublicChatRate(db, memberId, body) {
  const latest = db.prepare(`
    SELECT body, created_at
    FROM public_chat_messages
    WHERE sender_member_id = ? AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `).get(memberId);
  if (!latest) return;

  const createdAt = new Date(`${latest.created_at}${
    String(latest.created_at).endsWith("Z") || String(latest.created_at).includes("+") ? "" : "Z"
  }`).getTime();
  const elapsed = Date.now() - createdAt;
  if (Number.isFinite(createdAt) && elapsed < 2_000) {
    const error = new Error("Attends deux secondes avant d’envoyer un autre message.");
    error.status = 429;
    throw error;
  }
  if (latest.body === body && Number.isFinite(createdAt) && elapsed < 30_000) {
    const error = new Error("Ce message vient déjà d’être envoyé.");
    error.status = 429;
    throw error;
  }
}

function listDirectMembers(db, memberId) {
  return db.prepare(`
    SELECT
      m.id,
      m.username,
      m.display_name,
      linked_staff.role AS staff_role
    FROM member_users m
    LEFT JOIN staff_member_links links ON links.member_id = m.id
    LEFT JOIN staff_users linked_staff ON linked_staff.id = links.staff_id
    WHERE m.id <> ?
    ORDER BY
      CASE WHEN linked_staff.role IS NULL THEN 1 ELSE 0 END,
      m.display_name COLLATE NOCASE ASC,
      m.username COLLATE NOCASE ASC
  `).all(memberId);
}

function listDirectThreads(db, memberId) {
  return db.prepare(`
    SELECT
      threads.id,
      threads.created_at,
      threads.updated_at,
      peer.id AS peer_id,
      peer.username AS peer_username,
      peer.display_name AS peer_display_name,
      peer_staff.role AS peer_staff_role,
      (
        SELECT body
        FROM member_direct_messages last_message
        WHERE last_message.thread_id = threads.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT created_at
        FROM member_direct_messages last_message
        WHERE last_message.thread_id = threads.id
        ORDER BY last_message.id DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT COUNT(*)
        FROM member_direct_messages unread
        WHERE unread.thread_id = threads.id
          AND unread.recipient_member_id = ?
          AND unread.read_at IS NULL
      ) AS unread_count
    FROM member_direct_threads threads
    JOIN member_users peer ON peer.id = CASE
      WHEN threads.member_a_id = ? THEN threads.member_b_id
      ELSE threads.member_a_id
    END
    LEFT JOIN staff_member_links peer_links ON peer_links.member_id = peer.id
    LEFT JOIN staff_users peer_staff ON peer_staff.id = peer_links.staff_id
    WHERE threads.member_a_id = ? OR threads.member_b_id = ?
    ORDER BY datetime(threads.updated_at) DESC, threads.id DESC
  `).all(memberId, memberId, memberId, memberId);
}

function findDirectThread(db, threadId, memberId) {
  return db.prepare(`
    SELECT
      threads.*,
      peer.id AS peer_id,
      peer.username AS peer_username,
      peer.display_name AS peer_display_name,
      peer_staff.role AS peer_staff_role
    FROM member_direct_threads threads
    JOIN member_users peer ON peer.id = CASE
      WHEN threads.member_a_id = ? THEN threads.member_b_id
      ELSE threads.member_a_id
    END
    LEFT JOIN staff_member_links peer_links ON peer_links.member_id = peer.id
    LEFT JOIN staff_users peer_staff ON peer_staff.id = peer_links.staff_id
    WHERE threads.id = ?
      AND (threads.member_a_id = ? OR threads.member_b_id = ?)
  `).get(memberId, threadId, memberId, memberId);
}

function readDirectMessages(db, threadId) {
  return db.prepare(`
    SELECT
      messages.id,
      messages.sender_member_id,
      messages.recipient_member_id,
      messages.body,
      messages.read_at,
      messages.created_at,
      sender.username AS sender_username,
      sender.display_name AS sender_display_name,
      sender_staff.role AS sender_staff_role
    FROM member_direct_messages messages
    JOIN member_users sender ON sender.id = messages.sender_member_id
    LEFT JOIN staff_member_links sender_links ON sender_links.member_id = sender.id
    LEFT JOIN staff_users sender_staff ON sender_staff.id = sender_links.staff_id
    WHERE messages.thread_id = ?
    ORDER BY messages.id ASC
  `).all(threadId);
}

function createOrFindDirectThread(db, firstMemberId, secondMemberId) {
  const memberAId = Math.min(firstMemberId, secondMemberId);
  const memberBId = Math.max(firstMemberId, secondMemberId);
  db.prepare(`
    INSERT OR IGNORE INTO member_direct_threads (member_a_id, member_b_id)
    VALUES (?, ?)
  `).run(memberAId, memberBId);
  return db.prepare(`
    SELECT id
    FROM member_direct_threads
    WHERE member_a_id = ? AND member_b_id = ?
  `).get(memberAId, memberBId);
}

function insertDirectMessage(db, { threadId, senderId, recipientId, body }) {
  const result = db.prepare(`
    INSERT INTO member_direct_messages (
      thread_id,
      sender_member_id,
      recipient_member_id,
      body
    ) VALUES (?, ?, ?, ?)
  `).run(threadId, senderId, recipientId, body);
  db.prepare(`
    UPDATE member_direct_threads
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(threadId);
  return result.lastInsertRowid;
}

export function registerCommunityMessagingRoutes({
  app,
  db,
  authenticateMember,
  requireActiveMember
}) {
  createCommunityMessagingSchema(db);

  app.get(
    "/api/community-chat/messages",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const afterId = asCursor(req.query.afterId);
        res.json({ messages: listPublicChatMessages(db, afterId) });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.post(
    "/api/community-chat/messages",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const body = asText(req.body?.body, {
          field: "Le message public",
          min: 1,
          max: 800
        });
        ensurePublicChatRate(db, req.currentMember.id, body);
        const result = db.prepare(`
          INSERT INTO public_chat_messages (sender_member_id, body)
          VALUES (?, ?)
        `).run(req.currentMember.id, body);
        res.status(201).json({ messageId: result.lastInsertRowid });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.delete(
    "/api/community-chat/messages/:id",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const messageId = asId(req.params.id, "Message");
        const message = db.prepare(`
          SELECT id, sender_member_id
          FROM public_chat_messages
          WHERE id = ? AND deleted_at IS NULL
        `).get(messageId);
        if (!message) {
          return res.status(404).json({ error: "Message introuvable." });
        }
        const role = linkedStaffRole(db, req.currentMember.id);
        const canModerate = ["admin", "modo", "moderator"].includes(role);
        if (Number(message.sender_member_id) !== Number(req.currentMember.id) && !canModerate) {
          return res.status(403).json({ error: "Tu ne peux pas supprimer ce message." });
        }
        db.prepare(`
          UPDATE public_chat_messages
          SET deleted_at = CURRENT_TIMESTAMP, deleted_by_member_id = ?
          WHERE id = ?
        `).run(req.currentMember.id, messageId);
        res.json({ ok: true });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/member-direct/members",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      res.json({ members: listDirectMembers(db, req.currentMember.id) });
    }
  );

  app.get(
    "/api/member-direct/conversations",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      res.json({ conversations: listDirectThreads(db, req.currentMember.id) });
    }
  );

  app.post(
    "/api/member-direct/conversations",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const recipientId = asId(req.body?.recipientMemberId, "Destinataire");
        if (recipientId === Number(req.currentMember.id)) {
          return res.status(400).json({ error: "Tu ne peux pas t’envoyer un MP à toi-même." });
        }
        const recipient = db.prepare("SELECT id FROM member_users WHERE id = ?").get(recipientId);
        if (!recipient) {
          return res.status(404).json({ error: "Membre introuvable." });
        }
        const body = asText(req.body?.body, { field: "Le MP", min: 1, max: 2000 });
        const result = db.transaction(() => {
          const thread = createOrFindDirectThread(db, req.currentMember.id, recipientId);
          const messageId = insertDirectMessage(db, {
            threadId: thread.id,
            senderId: req.currentMember.id,
            recipientId,
            body
          });
          return { conversationId: thread.id, messageId };
        })();
        res.status(201).json(result);
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.get(
    "/api/member-direct/conversations/:id",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findDirectThread(db, conversationId, req.currentMember.id);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation privée introuvable." });
        }
        db.prepare(`
          UPDATE member_direct_messages
          SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
          WHERE thread_id = ?
            AND recipient_member_id = ?
            AND read_at IS NULL
        `).run(conversationId, req.currentMember.id);
        res.json({
          conversation,
          messages: readDirectMessages(db, conversationId)
        });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );

  app.post(
    "/api/member-direct/conversations/:id/messages",
    authenticateMember,
    requireActiveMember,
    (req, res) => {
      try {
        const conversationId = asId(req.params.id, "Conversation");
        const conversation = findDirectThread(db, conversationId, req.currentMember.id);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation privée introuvable." });
        }
        const body = asText(req.body?.body, { field: "Le MP", min: 1, max: 2000 });
        const recipientId = Number(conversation.member_a_id) === Number(req.currentMember.id)
          ? Number(conversation.member_b_id)
          : Number(conversation.member_a_id);
        const messageId = insertDirectMessage(db, {
          threadId: conversationId,
          senderId: req.currentMember.id,
          recipientId,
          body
        });
        res.status(201).json({ messageId });
      } catch (error) {
        sendRouteError(res, error);
      }
    }
  );
}
