// Staff-only, bounded Discord Gateway event log. No message text or OAuth tokens.
const TYPES = new Set(["join", "leave", "roles"]);
const SNOWFLAKE = /^\d{15,25}$/;
const MAX_ROWS = 5000;
const RETENTION_DAYS = 30;
const clean = (value, max = 80) => String(value || "").slice(0, max);
const normalizeRoles = (roles) =>
  [...new Set((Array.isArray(roles) ? roles : []).map(String).filter((id) => SNOWFLAKE.test(id)))].sort();

export function createDiscordActivityStore({ db, guildId, now = () => Date.now() }) {
  db.exec([
    "CREATE TABLE IF NOT EXISTS discord_activity_events (",
    "id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "guild_id TEXT NOT NULL, discord_id TEXT NOT NULL,",
    "username TEXT NOT NULL, event_type TEXT NOT NULL CHECK(event_type IN ('join','leave','roles')),",
    "added_roles TEXT NOT NULL DEFAULT '[]', removed_roles TEXT NOT NULL DEFAULT '[]',",
    "created_at TEXT NOT NULL",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_discord_activity_events_guild ON discord_activity_events(guild_id, id DESC);",
    "CREATE TABLE IF NOT EXISTS discord_activity_members (",
    "guild_id TEXT NOT NULL, discord_id TEXT NOT NULL,",
    "username TEXT NOT NULL, roles_json TEXT NOT NULL DEFAULT '[]',",
    "PRIMARY KEY(guild_id, discord_id)",
    ");"
  ].join(" "));
  const roles = new Map();
  let changes = 0;
  const makeName = (member) =>
    clean(member?.user?.global_name || member?.user?.username || member?.nick || "Membre Discord", 100);
  const roleLabels = (ids) => ids.map((id) => ({ id, name: clean(roles.get(id) || id, 100) }));
  const readStored = (discordId) => db.prepare(
    "SELECT roles_json FROM discord_activity_members WHERE guild_id = ? AND discord_id = ?"
  ).get(guildId, discordId);
  function saveSnapshot(id, username, newRoles) {
    db.prepare([
      "INSERT INTO discord_activity_members(guild_id,discord_id,username,roles_json)",
      "VALUES(?,?,?,?) ON CONFLICT(guild_id,discord_id) DO UPDATE SET",
      "username=excluded.username,roles_json=excluded.roles_json"
    ].join(" ")).run(guildId, id, username, JSON.stringify(newRoles));
  }
  function logEvent(type, id, username, added = [], removed = []) {
    db.prepare([
      "INSERT INTO discord_activity_events",
      "(guild_id,discord_id,username,event_type,added_roles,removed_roles,created_at)",
      "VALUES(?,?,?,?,?,?,?)"
    ].join(" ")).run(guildId,id,username,type,JSON.stringify(roleLabels(added)),
      JSON.stringify(roleLabels(removed)),new Date(now()).toISOString());
    if (++changes % 25 === 0) prune();
  }
  function prune() {
    const cutoff = new Date(now() - RETENTION_DAYS * 86400000).toISOString();
    db.prepare("DELETE FROM discord_activity_events WHERE guild_id = ? AND created_at < ?")
      .run(guildId,cutoff);
    db.prepare([
      "DELETE FROM discord_activity_events WHERE guild_id = ? AND id NOT IN",
      "(SELECT id FROM discord_activity_events WHERE guild_id = ? ORDER BY id DESC LIMIT ?)"
    ].join(" ")).run(guildId,guildId,MAX_ROWS);
  }
  function observe(type, payload) {
    if (!payload || String(payload.guild_id || payload.id || "") !== String(guildId)) return false;
    if (type === "GUILD_CREATE") {
      for (const role of (Array.isArray(payload.roles) ? payload.roles : [])) {
        if (SNOWFLAKE.test(String(role?.id || ""))) roles.set(String(role.id),clean(role.name,100));
      }
      return false;
    }
    if (["GUILD_ROLE_CREATE","GUILD_ROLE_UPDATE"].includes(type)) {
      if (SNOWFLAKE.test(String(payload.role?.id || ""))) {
        roles.set(String(payload.role.id),clean(payload.role.name,100));
      }
      return false;
    }
    if (type === "GUILD_ROLE_DELETE") {
      roles.delete(String(payload.role_id || ""));
      return false;
    }
    if (!["GUILD_MEMBER_ADD","GUILD_MEMBER_REMOVE","GUILD_MEMBER_UPDATE"].includes(type))return false;
    const id = String(payload.user?.id || "");
    if (!SNOWFLAKE.test(id)) return false;
    const username = makeName(payload);
    const saved = readStored(id);
    if (type === "GUILD_MEMBER_REMOVE") {
      db.prepare("DELETE FROM discord_activity_members WHERE guild_id = ? AND discord_id = ?").run(guildId,id);
      logEvent("leave",id,username);
      return true;
    }
    const nextRoles = normalizeRoles(payload.roles);
    if (type === "GUILD_MEMBER_ADD") {
      saveSnapshot(id,username,nextRoles);
      if (saved) return false; // Discord can emit an ADD for an existing member.
      logEvent("join",id,username);
      return true;
    }
    if (!saved) {
      // First UPDATE after startup may not contain a prior baseline: do not invent a role change.
      saveSnapshot(id,username,nextRoles);
      return false;
    }
    const previous = new Set(JSON.parse(saved.roles_json));
    const current = new Set(nextRoles);
    const added = nextRoles.filter((role) => !previous.has(role));
    const removed = [...previous].filter((role) => !current.has(role));
    saveSnapshot(id,username,nextRoles);
    if (!added.length && !removed.length)return false;
    logEvent("roles",id,username,added,removed);
    return true;
  }
  function list({type = "all",days = 7,limit = 50} = {}) {
    const safeType = TYPES.has(type) ? type : "all";
    const safeDays = [1,7,30].includes(Number(days)) ? Number(days) : 7;
    const safeLimit = Math.min(100,Math.max(1,Number.isInteger(Number(limit)) ? Number(limit) : 50));
    const cutoff = new Date(now() - safeDays * 86400000).toISOString();
    const query = [
      "SELECT id,discord_id,username,event_type,added_roles,removed_roles,created_at",
      "FROM discord_activity_events WHERE guild_id = ? AND created_at >= ?",
      safeType === "all" ? "" : "AND event_type = ?",
      "ORDER BY id DESC LIMIT ?"
    ].join(" ");
    const params = safeType === "all"
      ? [guildId,cutoff,safeLimit] : [guildId,cutoff,safeType,safeLimit];
    return db.prepare(query).all(...params).map((row) => ({
      id: row.id, discordId: row.discord_id, username: row.username,
      type: row.event_type, addedRoles: JSON.parse(row.added_roles),
      removedRoles: JSON.parse(row.removed_roles), createdAt: row.created_at
    }));
  }
  prune();
  return { observe, list, prune };
}
