import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, "pixel-everywhere.db");
const sqlJsModulePath = fileURLToPath(import.meta.resolve("sql.js"));
const sqlJsDirectory = path.dirname(sqlJsModulePath);
const SQL = await initSqlJs({
  locateFile: (file) => path.join(sqlJsDirectory, file)
});
const databaseBytes = fs.existsSync(databasePath)
  ? fs.readFileSync(databasePath)
  : undefined;
const sqlite = databaseBytes
  ? new SQL.Database(databaseBytes)
  : new SQL.Database();

function persist() {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(sqlite.export()));
  fs.renameSync(temporaryPath, databasePath);
}

let transactionDepth = 0;

function persistWhenReady() {
  if (transactionDepth === 0) persist();
}

function normalizeParameters(parameters) {
  if (parameters.length === 1 && Array.isArray(parameters[0])) {
    return parameters[0];
  }
  return parameters;
}

function mapDatabaseError(error) {
  if (error.message?.includes("UNIQUE constraint failed")) {
    error.code = "SQLITE_CONSTRAINT_UNIQUE";
  }
  return error;
}

export const db = {
  exec(sql) {
    try {
      sqlite.exec(sql);
      persistWhenReady();
    } catch (error) {
      throw mapDatabaseError(error);
    }
  },

  prepare(sql) {
    return {
      run(...parameters) {
        try {
          sqlite.run(sql, normalizeParameters(parameters));
          const changes = sqlite.getRowsModified();
          const row = sqlite.exec("SELECT last_insert_rowid() AS id");
          const lastInsertRowid = row[0]?.values[0]?.[0] || 0;
          persistWhenReady();
          return { changes, lastInsertRowid };
        } catch (error) {
          throw mapDatabaseError(error);
        }
      },

      get(...parameters) {
        const statement = sqlite.prepare(sql);
        try {
          statement.bind(normalizeParameters(parameters));
          return statement.step() ? statement.getAsObject() : undefined;
        } finally {
          statement.free();
        }
      },

      all(...parameters) {
        const statement = sqlite.prepare(sql);
        const rows = [];
        try {
          statement.bind(normalizeParameters(parameters));
          while (statement.step()) {
            rows.push(statement.getAsObject());
          }
          return rows;
        } finally {
          statement.free();
        }
      }
    };
  },

  transaction(callback) {
    sqlite.run("BEGIN IMMEDIATE");
    transactionDepth += 1;
    try {
      const result = callback();
      sqlite.run("COMMIT");
      transactionDepth -= 1;
      persist();
      return result;
    } catch (error) {
      sqlite.run("ROLLBACK");
      transactionDepth -= 1;
      throw mapDatabaseError(error);
    }
  }
};

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS member_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    age INTEGER NOT NULL,
    desired_role TEXT NOT NULL,
    real_name TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    motivation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'reviewing', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS application_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS staff_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS member_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    application_id INTEGER,
    sender_name TEXT NOT NULL DEFAULT 'PDD Staff',
    sender_logo TEXT NOT NULL DEFAULT '/assets/pdd-logo.jpg',
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES staff_users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS xp_conversion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    discord_username TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'completed', 'rejected')),
    reviewed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    FOREIGN KEY (member_id) REFERENCES member_users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES staff_users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS staff_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('bug_report', 'xp_conversion')),
    reference_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES staff_users(id) ON DELETE CASCADE
  );
`);

const memberColumns = db.prepare("PRAGMA table_info(member_users)").all();
if (!memberColumns.some((column) => column.name === "points")) {
  db.exec("ALTER TABLE member_users ADD COLUMN points INTEGER NOT NULL DEFAULT 0");
}
if (!memberColumns.some((column) => column.name === "last_activity_reward_at")) {
  db.exec("ALTER TABLE member_users ADD COLUMN last_activity_reward_at TEXT");
}

const applicationColumns = db.prepare("PRAGMA table_info(applications)").all();
if (!applicationColumns.some((column) => column.name === "member_id")) {
  db.exec("ALTER TABLE applications ADD COLUMN member_id INTEGER REFERENCES member_users(id)");
}
if (!applicationColumns.some((column) => column.name === "staff_account_id")) {
  db.exec("ALTER TABLE applications ADD COLUMN staff_account_id INTEGER REFERENCES staff_users(id)");
}
if (!applicationColumns.some((column) => column.name === "accepted_at")) {
  db.exec("ALTER TABLE applications ADD COLUMN accepted_at TEXT");
}

export async function seedInitialAdmin() {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const existingAdmin = db
    .prepare("SELECT id FROM staff_users WHERE role = 'admin' LIMIT 1")
    .get();

  if (existingAdmin || !username || !password) return;

  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD doit contenir au moins 12 caractères.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare(`
    INSERT INTO staff_users
      (username, password_hash, role, active, must_change_password)
    VALUES (?, ?, 'admin', 1, 1)
  `).run(username, passwordHash);

  console.log(`Compte administrateur initial créé pour ${username}.`);
}
