import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5-mini";
const ALLOWED_BOTS = new Set(["guide", "moderation"]);
const ALLOWED_HISTORY_ROLES = new Set(["user", "assistant"]);

const APP_KNOWLEDGE = `
Pixel Everywhere est l’application communautaire officielle du serveur Discord Pixel Difficult Drawer (PDD).
Fonctions actuellement disponibles :
- Accueil : présentation et invitation Discord.
- Annonces : annonces officielles et journaux de versions.
- # Chat public : salon commun pour les comptes connectés, avec mentions @Admin, @Modérateur, @Membre et mentions de pseudos.
- Ma messagerie : messages du staff et MP entre membres.
- Mon Pixel : mascotte, actions avec coût en pièces, délais anti-spam, boutique et conversion des pièces en XP PDD.
- Candidature : envoi et suivi d’une candidature staff.
- Idées et création : suggestions et outils créatifs.
- Compte : comptes membre, modérateur et administrateur.
- Pixel Helper : tutoriels de navigation et d’installation des mises à jour.
Les comptes staff possèdent un profil membre lié pour utiliser le chat public, les MP et Mon Pixel.
`;

export function normalizeAiHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ALLOWED_HISTORY_ROLES.has(item.role))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").trim().slice(0, 1200)
    }))
    .filter((item) => item.content)
    .slice(-10);
}

export function buildPixelHelperInstructions({ bot, role, username, page, moderationCategories = [] }) {
  const identity = `L’utilisateur connecté est ${username || "inconnu"} et son rôle vérifié est ${role}.`;
  const location = page ? `La page actuellement ouverte est ${page}.` : "La page actuelle n’est pas connue.";
  const moderationContext = moderationCategories.length
    ? `Le classificateur de sécurité a signalé ces catégories dans la demande : ${moderationCategories.join(", ")}. Ne répète pas les passages choquants et réponds uniquement de façon protectrice.`
    : "Aucune catégorie de risque particulière n’a été signalée dans la demande.";

  if (bot === "moderation") {
    return `Tu es Pixel Guard, une véritable IA d’assistance à la modération intégrée à Pixel Everywhere.
Tu aides les membres, modérateurs et administrateurs à comprendre une situation communautaire et à choisir une réaction prudente.
${identity}
${location}
${moderationContext}
Règles obligatoires :
- Réponds en français, avec un ton calme, humain et adapté à l’âge d’un public communautaire.
- Analyse le contexte au lieu d’appliquer une réponse automatique par mot-clé.
- Distingue un désaccord ordinaire du spam, du harcèlement, d’une menace, d’une arnaque ou d’un partage d’informations personnelles.
- Pour un membre, conseille de conserver le contexte et de prévenir le staff ; ne lui demande jamais de se faire justice lui-même.
- Pour un modérateur ou administrateur, propose une action proportionnée et réversible en premier, puis une escalade seulement si nécessaire.
- Tu conseilles : tu ne prétends jamais avoir supprimé un message, averti, mute ou banni quelqu’un.
- Ne demande pas et ne reproduis pas d’adresse, numéro, mot de passe, token ou autre information privée.
- En cas de danger immédiat, recommande de prévenir sans délai un adulte de confiance, le staff et les services d’urgence locaux appropriés.
- Ne donne jamais une sanction définitive sans rappeler qu’un humain doit vérifier les faits et les règles du serveur.
Réponds en 2 à 6 phrases, sans markdown compliqué.`;
  }

  return `Tu es Pixel Guide, une véritable IA d’aide intégrée à Pixel Everywhere.
${APP_KNOWLEDGE}
${identity}
${location}
Règles obligatoires :
- Réponds en français, simplement et précisément.
- Utilise le contexte de la conversation pour répondre naturellement, pas une table de réponses à mots-clés.
- N’invente aucune fonction qui n’apparaît pas dans la description de l’application.
- Quand une fonction nécessite une connexion, précise quel type de compte est nécessaire.
- Tu peux guider l’utilisateur étape par étape, mais tu ne prétends jamais avoir cliqué ou modifié son compte.
- Ne demande jamais de mot de passe, token, clé API ou information privée.
- Quand tu n’es pas certain d’un état personnel du compte ou du serveur, dis que tu ne peux pas le voir directement.
Réponds en 2 à 6 phrases, sans markdown compliqué.`;
}

export function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function categoriesFlagged(moderation) {
  const result = moderation?.results?.[0];
  if (!result?.categories) return [];
  return Object.entries(result.categories)
    .filter(([, flagged]) => Boolean(flagged))
    .map(([category]) => category);
}

async function openAiRequest(path, body, apiKey, timeoutMs = 22000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const clientRequestId = randomUUID();
  try {
    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
      error.status = response.status;
      error.requestId = response.headers.get("x-request-id") || clientRequestId;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("La réponse de l’IA a dépassé le délai autorisé.");
      timeoutError.code = "AI_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function moderate(input, apiKey) {
  return openAiRequest("/moderations", {
    model: "omni-moderation-latest",
    input
  }, apiKey, 12000);
}

function currentIdentity(req, db) {
  if (req.identity?.kind === "staff") {
    const user = db.prepare(`
      SELECT id, username, role, active, must_change_password
      FROM staff_users
      WHERE id = ? AND deleted_at IS NULL
    `).get(Number(req.identity.sub));
    if (!user || !user.active || user.must_change_password) return null;
    return { id: user.id, username: user.username, role: user.role, kind: "staff" };
  }

  const member = db.prepare(`
    SELECT id, username
    FROM member_users
    WHERE id = ?
  `).get(Number(req.identity?.sub));
  if (!member) return null;
  return { id: member.id, username: member.username, role: "member", kind: "member" };
}

function mapAiError(error) {
  if (error?.code === "AI_TIMEOUT") {
    return { status: 504, code: "AI_TIMEOUT", message: error.message };
  }
  if (error?.status === 401 || error?.status === 403) {
    return { status: 503, code: "AI_KEY_INVALID", message: "La clé de l’IA du serveur est absente ou invalide." };
  }
  if (error?.status === 429) {
    return { status: 429, code: "AI_BUSY", message: "L’IA reçoit trop de demandes pour le moment. Réessaie dans quelques instants." };
  }
  return { status: 502, code: "AI_UNAVAILABLE", message: "L’IA est temporairement indisponible." };
}

export function registerPixelHelperAiRoutes({ app, db, authenticateAny }) {
  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Trop de questions envoyées à l’IA. Réessaie dans quelques minutes.", code: "AI_RATE_LIMIT" }
  });

  app.get("/api/pixel-helper/status", (_req, res) => {
    res.json({
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      provider: "OpenAI",
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL
    });
  });

  app.post("/api/pixel-helper/ask", aiLimiter, authenticateAny, async (req, res) => {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(503).json({
        error: "La vraie IA n’est pas encore configurée sur le serveur Termux.",
        code: "AI_NOT_CONFIGURED"
      });
    }

    const identity = currentIdentity(req, db);
    if (!identity) {
      return res.status(403).json({ error: "Ce compte n’est pas autorisé à utiliser l’IA.", code: "AI_ACCOUNT_INACTIVE" });
    }

    const bot = String(req.body?.bot || "");
    const message = String(req.body?.message || "").trim();
    const page = String(req.body?.page || "").trim().slice(0, 80);
    if (!ALLOWED_BOTS.has(bot)) {
      return res.status(400).json({ error: "Assistant Pixel Helper inconnu." });
    }
    if (message.length < 2 || message.length > 1200) {
      return res.status(400).json({ error: "La question doit contenir entre 2 et 1 200 caractères." });
    }

    try {
      const inputModeration = await moderate(message, apiKey);
      const moderationCategories = categoriesFlagged(inputModeration);
      const history = normalizeAiHistory(req.body?.history);
      const instructions = buildPixelHelperInstructions({
        bot,
        role: identity.role,
        username: identity.username,
        page,
        moderationCategories
      });
      const response = await openAiRequest("/responses", {
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions,
        input: [...history, { role: "user", content: message }],
        max_output_tokens: 420,
        store: false
      }, apiKey);
      const answer = extractResponseText(response);
      if (!answer) throw new Error("Réponse vide du modèle.");

      const outputModeration = await moderate(answer, apiKey);
      if (outputModeration?.results?.[0]?.flagged) {
        return res.json({
          answer: "Je ne peux pas afficher cette réponse. Reformule la situation sans recopier de contenu choquant ni d’informations personnelles.",
          bot,
          model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
          moderated: true
        });
      }

      res.json({
        answer: answer.slice(0, 2400),
        bot,
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        moderated: moderationCategories.length > 0
      });
    } catch (error) {
      const mapped = mapAiError(error);
      console.error("PIXEL_HELPER_AI_FAILED", {
        code: mapped.code,
        status: error?.status,
        requestId: error?.requestId,
        message: error?.message
      });
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });
}
