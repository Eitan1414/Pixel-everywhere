import test from "node:test";
import assert from "node:assert/strict";
import { registerCommunityAnnouncementRoutes } from "../server/community-announcements.mjs";

test("enregistre les catégories d’annonces et les update logs", () => {
  const routes = [];
  let schema = "";
  const app = {
    get(path) { routes.push(["GET", path]); },
    post(path) { routes.push(["POST", path]); },
    delete(path) { routes.push(["DELETE", path]); }
  };
  const db = {
    exec(sql) { schema += sql; },
    prepare() {
      return {
        all: () => [],
        get: () => undefined,
        run: () => ({ changes: 1, lastInsertRowid: 1 })
      };
    }
  };
  const middleware = (_req, _res, next) => next?.();

  registerCommunityAnnouncementRoutes({
    app,
    db,
    authenticate: middleware,
    requireActiveStaff: middleware,
    staffOnly: middleware
  });

  assert.match(schema, /CREATE TABLE IF NOT EXISTS app_announcements/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS app_update_logs/);
  assert.deepEqual(routes, [
    ["GET", "/api/app-announcements"],
    ["GET", "/api/update-logs"],
    ["GET", "/api/staff/app-announcements"],
    ["POST", "/api/staff/app-announcements"],
    ["DELETE", "/api/staff/app-announcements/:id"],
    ["GET", "/api/staff/update-logs"],
    ["POST", "/api/staff/update-logs"],
    ["DELETE", "/api/staff/update-logs/:id"]
  ]);
});
