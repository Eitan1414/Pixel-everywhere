import {
  helperKnowledgeStats,
  resolvePixelHelperMessage
} from "../web/pixel-helper-knowledge.js";

const ALLOWED_BOTS = new Set(["guide", "moderation"]);

function currentIdentity(req, db) {
  if (req.identity?.kind === "staff") {
    const user = db.prepare(`
      SELECT id, role, active, must_change_password
      FROM staff_users
      WHERE id = ? AND deleted_at IS NULL
    `).get(Number(req.identity.sub));
    if (!user || !user.active || user.must_change_password) return null;
    return { id: user.id, role: user.role === "admin" ? "admin" : "moderator", kind: "staff" };
  }

  const member = db.prepare(`SELECT id FROM member_users WHERE id = ?`).get(Number(req.identity?.sub));
  if (!member) return null;
  return { id: member.id, role: "member", kind: "member" };
}

export function buildLocalPixelReply({ bot, message, role, page }) {
  return resolvePixelHelperMessage({ bot, question: message, role, page });
}

// Le nom exporté et les deux anciennes routes sont conservés uniquement pour
// la compatibilité des versions 0.31.24 déjà compilées. Aucun modèle externe,
// aucune clé et aucune requête réseau ne sont utilisés.
const requestWindows = new Map();

function localLimiter(req, res, next) {
  const now = Date.now();
  const key = String(req.ip || req.get?.("x-forwarded-for") || "local").split(",")[0].trim();
  const recent = (requestWindows.get(key) || []).filter((timestamp) => now - timestamp < 10 * 60 * 1000);
  if (recent.length >= 120) {
    return res.status(429).json({
      error: "Trop de questions envoyées à Pixel. Réessaie dans quelques minutes.",
      code: "PIXEL_HELPER_RATE_LIMIT"
    });
  }
  recent.push(now);
  requestWindows.set(key, recent);
  next();
}

export function registerPixelHelperAiRoutes({ app, db, authenticateAny }) {
  app.get("/api/pixel-helper/status", (_req, res) => {
    const stats = helperKnowledgeStats();
    res.json({
      local: true,
      aiConfigured: false,
      provider: "Pixel Local",
      model: "fiches prédéfinies",
      topics: stats.totalTopics
    });
  });

  app.post("/api/pixel-helper/ask", localLimiter, authenticateAny, (req, res) => {
    const identity = currentIdentity(req, db);
    if (!identity) {
      return res.status(403).json({
        error: "Ce compte n’est pas autorisé à utiliser Pixel Helper.",
        code: "PIXEL_HELPER_ACCOUNT_INACTIVE"
      });
    }

    const bot = String(req.body?.bot || "guide");
    const message = String(req.body?.message || "").trim();
    const page = String(req.body?.page || "inconnue").trim().slice(0, 80) || "inconnue";

    if (!ALLOWED_BOTS.has(bot)) {
      return res.status(400).json({ error: "Personnage Pixel Helper inconnu." });
    }
    if (message.length < 2 || message.length > 500) {
      return res.status(400).json({ error: "La question doit contenir entre 2 et 500 caractères." });
    }

    const result = buildLocalPixelReply({ bot, message, role: identity.role, page });
    return res.json({
      answer: result.answer,
      action: result.action || "",
      actionLabel: result.actionLabel || "",
      topic: result.topic,
      bot,
      local: true,
      provider: "Pixel Local",
      model: "fiches prédéfinies"
    });
  });
}
