import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const DELETED_USERNAME_PREFIX = "__deleted_staff_";

function ensureDeletedAtColumn(db) {
  const columns = db.prepare("PRAGMA table_info(staff_users)").all();
  if (!columns.some((column) => column.name === "deleted_at")) {
    db.exec("ALTER TABLE staff_users ADD COLUMN deleted_at TEXT");
  }
}

export function registerAccountDeletionRoutes({
  app,
  db,
  authenticate,
  requireActiveStaff,
  staffOnly,
  requireAdmin,
  isOwnerAdmin
}) {
  ensureDeletedAtColumn(db);

  app.delete(
    "/api/admin/accounts/:id",
    authenticate,
    requireActiveStaff,
    staffOnly,
    requireAdmin,
    async (req, res) => {
      const accountId = Number(req.params.id);
      if (!Number.isInteger(accountId) || accountId <= 0) {
        return res.status(400).json({ error: "Identifiant de compte invalide." });
      }
      if (accountId === req.currentUser.id) {
        return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte." });
      }

      const account = db.prepare(`
        SELECT id, username, role, active, must_change_password, created_at, deleted_at
        FROM staff_users
        WHERE id = ?
      `).get(accountId);

      if (!account || account.deleted_at) {
        return res.status(404).json({ error: "Compte introuvable." });
      }
      if (isOwnerAdmin(account)) {
        return res.status(403).json({ error: "Le compte propriétaire ne peut pas être supprimé." });
      }

      const deletedUsername = `${DELETED_USERNAME_PREFIX}${account.id}_${Date.now()}`;
      const unusablePasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);

      db.transaction(() => {
        db.prepare("DELETE FROM staff_alerts WHERE recipient_id = ?").run(accountId);
        db.prepare(`
          UPDATE staff_users
          SET
            username = ?,
            password_hash = ?,
            active = 0,
            must_change_password = 0,
            deleted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND deleted_at IS NULL
        `).run(deletedUsername, unusablePasswordHash, accountId);
      });

      res.json({
        ok: true,
        deletedAccountId: accountId,
        message: `Le compte ${account.username} a été supprimé.`
      });
    }
  );
}
