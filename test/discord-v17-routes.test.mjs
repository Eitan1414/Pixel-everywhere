import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import initSqlJs from "sql.js";
import { registerDiscordV17Routes } from "../server/discord-v17.mjs";

const sqlJsDirectory = path.dirname(fileURLToPath(import.meta.resolve("sql.js")));
const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDirectory, file) });

function createDatabase() {
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON; CREATE TABLE member_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  sqlite.run("INSERT INTO member_users(id, username, display_name) VALUES (1, 'member1', 'Membre 1'), (2, 'member2', 'Membre 2')");
  const db = {
    exec: (sql) => sqlite.exec(sql),
    prepare(sql) {
      return {
        run(...args) {
          sqlite.run(sql, args);
          return { changes: sqlite.getRowsModified() };
        },
        get(...args) {
          const statement = sqlite.prepare(sql);
          try {
            statement.bind(args);
            return statement.step() ? statement.getAsObject() : undefined;
          } finally {
            statement.free();
          }
        }
      };
    }
  };
  return { db, close: () => sqlite.close() };
}

function authentication(kind) {
  return (req, res, next) => {
    const token = req.get("authorization") || "";
    if (kind === "member") {
      const id = Number(/^Bearer member-([12])$/.exec(token)?.[1]);
      if (!id) return res.status(401).json({ error: "Connexion membre requise" });
      req.member = { id };
      req.currentMember = { id };
    } else {
      if (token !== "Bearer staff") return res.status(401).json({ error: "Connexion staff requise" });
      req.staff = { id: 10, role: "admin" };
    }
    next();
  };
}

test("Discord OAuth2: liaison, unicité, expiration, révocation et accès protégés", async (t) => {
  const keys = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_GUILD_ID", "DISCORD_BOT_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "test-secret-not-for-production",
    DISCORD_REDIRECT_URI: "https://pixel.example.org/api/discord/oauth/callback",
    DISCORD_GUILD_ID: "",
    DISCORD_BOT_TOKEN: ""
  });
  const nativeFetch = globalThis.fetch;
  const identity = { id: "888888888888888888", username: "pixeluser", global_name: "Pixel User" };
  let tokenExchanges = 0;
  globalThis.fetch = (input, options) => {
    const url = String(input);
    if (url === "https://discord.com/api/v10/oauth2/token") {
      tokenExchanges += 1;
      assert.equal(options.method, "POST");
      assert.equal(new URLSearchParams(options.body).get("client_secret"), process.env.DISCORD_CLIENT_SECRET);
      return Promise.resolve(Response.json({ access_token: "oauth-token-test" }));
    }
    if (url === "https://discord.com/api/v10/users/@me") {
      assert.equal(options.headers.Authorization, "Bearer oauth-token-test");
      return Promise.resolve(Response.json(identity));
    }
    return nativeFetch(input, options);
  };
  const { db, close } = createDatabase();
  const app = express();
  app.use(express.json());
  let memberSessionsCreated = 0;
  registerDiscordV17Routes({
    app, db,
    createToken: (member, kind) => {
      assert.equal(kind, "member");
      memberSessionsCreated += 1;
      return "member-jwt-test-" + member.id;
    },
    authenticate: authentication("staff"),
    authenticateMember: authentication("member"),
    requireActiveMember: (_req, _res, next) => next(),
    requireActiveStaff: (_req, _res, next) => next(),
    staffOnly: (_req, _res, next) => next()
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    close();
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const root = "http://127.0.0.1:" + server.address().port;
  const request = (endpoint, token, method = "GET", body) => globalThis.fetch(root + endpoint, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const start = async (token) => {
    const response = await request("/api/members/discord/link/start", token, "POST");
    assert.equal(response.status, 200);
    const result = await response.json();
    const url = new URL(result.authorizationUrl);
    assert.equal(url.origin, "https://discord.com");
    assert.equal(url.searchParams.get("scope"), "identify");
    assert.equal(url.searchParams.get("redirect_uri"), process.env.DISCORD_REDIRECT_URI);
    assert.equal(result.expiresInSeconds, 600);
    return url.searchParams.get("state");
  };
  const callback = async (state, extra = "&code=discord-code") => {
    const response = await request("/api/discord/oauth/callback?state=" + state + extra);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.text();
  };
  const status = async (token) => {
    const response = await request("/api/members/discord/link", token);
    assert.equal(response.status, 200);
    return response.json();
  };

  await t.test("une session membre est requise et les données staff sont protégées", async () => {
    assert.equal((await request("/api/members/discord/link", "")).status, 401);
    assert.equal((await request("/api/members/discord/link", "staff")).status, 401);
    assert.equal((await request("/api/members/discord/link/start", "", "POST")).status, 401);
    assert.equal((await request("/api/staff/discord/activity", "member-1")).status, 401);
    assert.equal((await request("/api/staff/discord/activity", "staff")).status, 503);
    assert.deepEqual(await status("member-1"), { linked: false, discord: null, configured: true });
  });

  await t.test("un refus consomme le state à usage unique", async () => {
    const state = await start("member-1");
    assert.match(await callback(state, "&error=access_denied"), /annulée/);
    assert.match(await callback(state), /expiré/);
    assert.equal(tokenExchanges, 0);
  });

  await t.test("un parcours autorisé lie le compte et empêche son rejeu", async () => {
    const state = await start("member-1");
    assert.match(await callback(state), /maintenant lié/);
    assert.match(await callback(state), /expiré/);
    assert.equal(tokenExchanges, 1);
    const linked = await status("member-1");
    assert.equal(linked.linked, true);
    assert.equal(linked.discord.id, identity.id);
    assert.equal(linked.discord.displayName, identity.global_name);
  });

  await t.test("un Discord ne peut pas être lié à un second membre", async () => {
    const state = await start("member-2");
    assert.match(await callback(state), /déjà associé/);
    assert.equal((await status("member-2")).linked, false);
    assert.equal((await status("member-1")).linked, true);
  });

  await t.test("délier révoque le compte associé et les autorisations en cours", async () => {
    const pending = await start("member-1");
    const response = await request("/api/members/discord/link", "member-1", "DELETE");
    assert.equal(response.status, 200);
    assert.equal((await status("member-1")).linked, false);
    assert.match(await callback(pending), /expiré/);
    const state = await start("member-2");
    assert.match(await callback(state), /maintenant lié/);
    assert.equal((await status("member-2")).linked, true);
  });

  await t.test("une autorisation de plus de dix minutes est refusée", async () => {
    const state = await start("member-1");
    db.prepare("UPDATE discord_link_states SET created_at = 0").run();
    assert.match(await callback(state), /expiré/);
    assert.equal((await status("member-1")).linked, false);
  });

  const startDiscordLogin = async () => {
    const response = await request("/api/members/discord/login/start", "", "POST");
    assert.equal(response.status, 200);
    const payload = await response.json();
    const authorization = new URL(payload.authorizationUrl);
    assert.equal(authorization.hostname, "discord.com");
    assert.equal(authorization.searchParams.get("scope"), "identify");
    assert.ok(/^[a-zA-Z0-9_-]{30,64}$/.test(payload.claimKey));
    assert.ok(/^[a-zA-Z0-9_-]{30,64}$/.test(payload.requestId));
    return { ...payload, state: authorization.searchParams.get("state") };
  };
  const finishDiscordLogin = (attempt, overrides = {}) => request(
    "/api/members/discord/login/finish", "", "POST", {
      requestId: attempt.requestId,
      claimKey: attempt.claimKey,
      ...overrides
    }
  );

  await t.test("connexion Discord: pas de session avant l'autorisation et la réclamation", async () => {
    const attempt = await startDiscordLogin();
    const noAuth = await finishDiscordLogin(attempt);
    assert.equal(noAuth.status, 202);
    assert.deepEqual(await noAuth.json(), { status: "pending" });
    assert.equal(memberSessionsCreated, 0);
    const forged = await finishDiscordLogin(attempt, { claimKey: "A".repeat(43) });
    assert.equal(forged.status, 410);
    assert.equal(memberSessionsCreated, 0);
    assert.match(await callback(attempt.state), /confirmé ton identité/);
    assert.equal(memberSessionsCreated, 0);
    const success = await finishDiscordLogin(attempt);
    assert.equal(success.status, 200);
    const data = await success.json();
    assert.equal(data.member.id, 2);
    assert.equal(data.member.username, "member2");
    assert.equal(data.token, "member-jwt-test-2");
    assert.equal(memberSessionsCreated, 1);
    assert.equal((await finishDiscordLogin(attempt)).status, 410);
    assert.match(await callback(attempt.state), /déjà été utilisée/);
  });

  await t.test("connexion Discord: refus et comptes non liés ne créent aucune session", async () => {
    const denied = await startDiscordLogin();
    assert.match(await callback(denied.state, "&error=access_denied"), /annulée/);
    assert.equal((await finishDiscordLogin(denied)).status, 409);
    assert.equal(memberSessionsCreated, 1);
    const formerId = identity.id;
    identity.id = "999999999999999999";
    try {
      const unlinked = await startDiscordLogin();
      assert.match(await callback(unlinked.state), /Aucun compte Pixel Everywhere/);
      const response = await finishDiscordLogin(unlinked);
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /associe/);
      assert.equal(memberSessionsCreated, 1);
    } finally {
      identity.id = formerId;
    }
  });

  await t.test("connexion Discord: expiration et déliaison empêchent la création du jeton", async () => {
    const expired = await startDiscordLogin();
    db.prepare("UPDATE discord_login_attempts SET created_at = 0 WHERE state_hash = ?")
      .run((await import("node:crypto")).createHash("sha256").update(expired.state).digest("hex"));
    assert.match(await callback(expired.state), /expiré/);
    assert.equal((await finishDiscordLogin(expired)).status, 410);

    const beforeUnlink = await startDiscordLogin();
    assert.match(await callback(beforeUnlink.state), /confirmé ton identité/);
    assert.equal((await request("/api/members/discord/link", "member-2", "DELETE")).status, 200);
    assert.equal((await finishDiscordLogin(beforeUnlink)).status, 410);
    assert.equal(memberSessionsCreated, 1);
  });

});
