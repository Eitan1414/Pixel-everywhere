import rateLimit from "express-rate-limit";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const MODEL_CACHE_MS = 10 * 60 * 1000;
const ALLOWED_BOTS = new Set(["guide", "moderation"]);
const ALLOWED_HISTORY_ROLES = new Set(["user", "assistant"]);
const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT"
];

let cachedModel = null;

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

export function buildPixelHelperInstructions({ bot, role, page, safetySignals = [] }) {
  const identity = `Le rôle vérifié du compte connecté est ${role}. Aucun pseudo ni identifiant personnel n’est transmis au modèle.`;
  const location = page ? `La page actuellement ouverte est ${page}.` : "La page actuelle n’est pas connue.";
  const safetyContext = safetySignals.length
    ? `Les filtres de sécurité Gemini ont signalé ces catégories : ${safetySignals.join(", ")}. Ne répète pas de contenu choquant et réponds uniquement de façon protectrice.`
    : "Aucun signal de sécurité particulier n’a été fourni.";

  if (bot === "moderation") {
    return `Tu es Pixel Guard, une véritable IA d’assistance à la modération intégrée à Pixel Everywhere.
Tu aides les membres, modérateurs et administrateurs à comprendre une situation communautaire et à choisir une réaction prudente.
${identity}
${location}
${safetyContext}
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
  const parts = [];
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

export function normalizeGeminiModel(value) {
  return String(value || DEFAULT_MODEL).trim().replace(/^models\//, "") || DEFAULT_MODEL;
}

export function buildGeminiContents(history, message) {
  return [
    ...normalizeAiHistory(history).map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];
}

export function selectGeminiModel(availableModels, requestedModel = "") {
  const available = [...new Set((Array.isArray(availableModels) ? availableModels : [])
    .map(normalizeGeminiModel)
    .filter((name) => name.startsWith("gemini-") && !/(embedding|imagen|veo|tts|live|audio|image)/i.test(name))
  )];
  const requested = requestedModel ? normalizeGeminiModel(requestedModel) : "";
  if (requested && available.includes(requested)) return requested;

  const preferred = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ];
  for (const model of preferred) {
    if (available.includes(model)) return model;
  }
  return available.find((name) => /flash-lite/i.test(name)) ||
    available.find((name) => /flash/i.test(name)) ||
    available[0] || "";
}

function safetySettings(bot) {
  const threshold = bot === "moderation" ? "BLOCK_ONLY_HIGH" : "BLOCK_MEDIUM_AND_ABOVE";
  return SAFETY_CATEGORIES.map((category) => ({ category, threshold }));
}

function responseSafetySignals(payload) {
  const signals = [];
  if (payload?.promptFeedback?.blockReason) signals.push(String(payload.promptFeedback.blockReason));
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(candidate?.finishReason)) {
      signals.push(String(candidate.finishReason));
    }
    for (const rating of Array.isArray(candidate?.safetyRatings) ? candidate.safetyRatings : []) {
      if (["HIGH", "MEDIUM"].includes(rating?.probability)) signals.push(String(rating.category || rating.probability));
    }
  }
  return [...new Set(signals)];
}

function isSafetyBlocked(payload) {
  return Boolean(payload?.promptFeedback?.blockReason) ||
    (Array.isArray(payload?.candidates) && payload.candidates.some((candidate) =>
      ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(candidate?.finishReason)
    ));
}

async function fetchGeminiJson(url, { apiKey, method = "GET", body, timeoutMs = 22000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
      error.status = response.status;
      error.providerCode = payload?.error?.status || "";
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("La réponse de Gemini a dépassé le délai autorisé.");
      timeoutError.code = "AI_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function listAvailableGeminiModels(apiKey) {
  const payload = await fetchGeminiJson(`${GEMINI_API_BASE}/models?pageSize=1000`, {
    apiKey,
    timeoutMs: 12000
  });
  return (Array.isArray(payload?.models) ? payload.models : [])
    .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
    .map((model) => normalizeGeminiModel(model.name));
}

async function resolveGeminiModel(apiKey, requestedModel = "", excludedModels = []) {
  const requested = requestedModel ? normalizeGeminiModel(requestedModel) : "";
  const now = Date.now();
  if (cachedModel && cachedModel.apiKey === apiKey && cachedModel.requested === requested && cachedModel.expiresAt > now && !excludedModels.includes(cachedModel.model)) {
    return cachedModel.model;
  }

  const available = (await listAvailableGeminiModels(apiKey)).filter((model) => !excludedModels.includes(model));
  const selected = selectGeminiModel(available, requested);
  if (!selected) {
    const error = new Error("Aucun modèle Gemini compatible avec generateContent n’est disponible pour cette clé.");
    error.code = "AI_NO_COMPATIBLE_MODEL";
    throw error;
  }
  cachedModel = { apiKey, requested, model: selected, expiresAt: now + MODEL_CACHE_MS };
  return selected;
}

async function geminiRequest({ model, body, apiKey, timeoutMs = 22000 }) {
  const normalizedModel = normalizeGeminiModel(model);
  return fetchGeminiJson(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(normalizedModel)}:generateContent`,
    { apiKey, method: "POST", body, timeoutMs }
  );
}

function currentIdentity(req, db) {
  if (req.identity?.kind === "staff") {
    const user = db.prepare(`
      SELECT id, role, active, must_change_password
      FROM staff_users
      WHERE id = ? AND deleted_at IS NULL
    `).get(Number(req.identity.sub));
    if (!user || !user.active || user.must_change_password) return null;
    return { id: user.id, role: user.role, kind: "staff" };
  }
  const member = db.prepare(`SELECT id FROM member_users WHERE id = ?`).get(Number(req.identity?.sub));
  if (!member) return null;
  return { id: member.id, role: "member", kind: "member" };
}

function mapAiError(error) {
  if (error?.code === "AI_TIMEOUT") return { status: 504, code: "AI_TIMEOUT", message: error.message };
  if (error?.code === "AI_NO_COMPATIBLE_MODEL") return { status: 503, code: error.code, message: error.message };
  const message = String(error?.message || "");
  if ([400, 401, 403].includes(error?.status) && /api.?key|key.*invalid|permission/i.test(message)) {
    return { status: 503, code: "AI_KEY_INVALID", message: "La clé Gemini du serveur est absente, invalide ou sans autorisation." };
  }
  if (error?.status === 404 || error?.providerCode === "NOT_FOUND") {
    return { status: 503, code: "AI_MODEL_INVALID", message: "Aucun modèle Gemini utilisable n’a été trouvé pour cette clé." };
  }
  if (error?.status === 429 || error?.providerCode === "RESOURCE_EXHAUSTED") {
    return { status: 429, code: "AI_BUSY", message: "Le quota Gemini est atteint pour le moment. Réessaie plus tard." };
  }
  return { status: 502, code: "AI_UNAVAILABLE", message: "Gemini est temporairement indisponible." };
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
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      provider: "Google Gemini",
      model: cachedModel?.model || "détection automatique"
    });
  });

  app.post("/api/pixel-helper/ask", aiLimiter, authenticateAny, async (req, res) => {
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) return res.status(503).json({ error: "Gemini n’est pas encore configuré sur le serveur Termux.", code: "AI_NOT_CONFIGURED" });

    const identity = currentIdentity(req, db);
    if (!identity) return res.status(403).json({ error: "Ce compte n’est pas autorisé à utiliser l’IA.", code: "AI_ACCOUNT_INACTIVE" });

    const bot = String(req.body?.bot || "");
    const message = String(req.body?.message || "").trim();
    const page = String(req.body?.page || "").trim().slice(0, 80);
    if (!ALLOWED_BOTS.has(bot)) return res.status(400).json({ error: "Assistant Pixel Helper inconnu." });
    if (message.length < 2 || message.length > 1200) return res.status(400).json({ error: "La question doit contenir entre 2 et 1 200 caractères." });

    const requestedModel = String(process.env.GEMINI_MODEL || "").trim();
    try {
      const history = normalizeAiHistory(req.body?.history);
      const instructions = buildPixelHelperInstructions({ bot, role: identity.role, page });
      const body = {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: buildGeminiContents(history, message),
        generationConfig: {
          temperature: bot === "moderation" ? 0.2 : 0.35,
          maxOutputTokens: 500
        },
        safetySettings: safetySettings(bot)
      };

      let model = await resolveGeminiModel(apiKey, requestedModel);
      let response;
      try {
        response = await geminiRequest({ model, apiKey, body });
      } catch (error) {
        if (error?.status !== 404 && error?.providerCode !== "NOT_FOUND") throw error;
        cachedModel = null;
        model = await resolveGeminiModel(apiKey, requestedModel, [model]);
        response = await geminiRequest({ model, apiKey, body });
      }

      const signals = responseSafetySignals(response);
      if (isSafetyBlocked(response)) {
        return res.json({
          answer: "Je ne peux pas analyser ou afficher ce contenu tel quel. Reformule sans recopier d’informations personnelles, de menaces précises ni de passages choquants.",
          bot,
          provider: "Google Gemini",
          model,
          moderated: true
        });
      }

      const answer = extractResponseText(response);
      if (!answer) throw new Error("Réponse vide de Gemini.");
      res.json({
        answer: answer.slice(0, 2400),
        bot,
        provider: "Google Gemini",
        model,
        moderated: signals.length > 0
      });
    } catch (error) {
      const mapped = mapAiError(error);
      console.error("PIXEL_HELPER_GEMINI_FAILED", {
        code: mapped.code,
        status: error?.status,
        providerCode: error?.providerCode,
        message: error?.message
      });
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });
}
