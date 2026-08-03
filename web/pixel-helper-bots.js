const helperBotState = {
  activeBot: "guide",
  installed: false,
  busy: false,
  aiConfigured: null,
  model: "",
  histories: {
    guide: [],
    moderation: []
  }
};

function parseBotStorage(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function currentHelperRole() {
  const staff = parseBotStorage(sessionStorage, "pixel-user") ||
    parseBotStorage(localStorage, "pixel-staff-user-persistent");
  if (staff?.role === "admin") return "admin";
  if (["moderator", "modo"].includes(staff?.role)) return "moderator";
  return "member";
}

function helperRoleLabel() {
  const role = currentHelperRole();
  if (role === "admin") return "administrateur";
  if (role === "moderator") return "modérateur";
  return "membre";
}

function pixelHelperApiBase() {
  return String(
    localStorage.getItem("pixel-api-base-url") ||
    import.meta.env.VITE_API_BASE_URL ||
    "/api"
  ).replace(/\/$/, "");
}

function helperAuthToken() {
  return localStorage.getItem("pixel-member-token") ||
    sessionStorage.getItem("pixel-token") ||
    localStorage.getItem("pixel-staff-token-persistent") ||
    "";
}

function currentPageName() {
  const page = document.querySelector(".page.active");
  return page?.id?.replace(/^page-/, "") || "inconnue";
}

function botDisplayName(bot = helperBotState.activeBot) {
  return bot === "moderation" ? "Pixel Guard" : "Pixel Guide";
}

function botClass(bot = helperBotState.activeBot) {
  return bot === "moderation" ? "moderation" : "guide";
}

async function pixelHelperRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = helperAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const base = pixelHelperApiBase();
  if (base.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers, cache: "no-store" });
  } catch {
    const error = new Error("Le serveur Pixel Everywhere est inaccessible.");
    error.code = "SERVER_OFFLINE";
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "L’IA n’a pas pu répondre.");
    error.code = data.code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

function updateAiBadge(root, state, label, model = "") {
  const badge = root?.querySelector(".pixel-helper-ai-status");
  if (!badge) return;
  badge.className = `pixel-helper-ai-status ${state}`;
  badge.textContent = label;
  badge.title = model ? `Modèle : ${model}` : label;
}

async function loadAiStatus(root) {
  updateAiBadge(root, "checking", "IA : vérification…");
  try {
    const status = await pixelHelperRequest("/pixel-helper/status", { method: "GET" });
    helperBotState.aiConfigured = Boolean(status.aiConfigured);
    helperBotState.model = String(status.model || "");
    updateAiBadge(
      root,
      status.aiConfigured ? "online" : "offline",
      status.aiConfigured ? "IA en ligne" : "IA non configurée",
      status.model
    );
  } catch {
    helperBotState.aiConfigured = false;
    updateAiBadge(root, "offline", "Serveur IA hors ligne");
  }
}

function appendBotMessage(log, sender, text, { bot = "", action = "", actionLabel = "", pending = false } = {}) {
  const article = document.createElement("article");
  const isUser = sender === "user";
  article.className = `pixel-helper-bot-message ${isUser ? "user" : `bot ${botClass(bot)}`}${pending ? " pending" : ""}`;

  const strong = document.createElement("strong");
  strong.textContent = isUser ? "Toi" : botDisplayName(bot);
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(strong, paragraph);

  if (!isUser && action && actionLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button pixel-helper-bot-action";
    button.textContent = actionLabel;
    button.addEventListener("click", () => performBotAction(action));
    article.append(button);
  }

  log.append(article);
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
  return article;
}

function performBotAction(action) {
  const dialog = document.querySelector("#pixelHelperGuideDialog");
  if (dialog?.open) dialog.close();

  if (action === "open-chat") {
    window.PixelCommunityEnhancements?.openPublicChat?.();
    return;
  }
  if (action === "open-mp") {
    document.querySelector("#memberInboxButton")?.click();
    window.setTimeout(() => document.querySelector("#memberDirectTab")?.click(), 120);
    return;
  }
  if (action === "open-account") {
    document.querySelector("#accountButton")?.click();
    return;
  }
  if (action === "open-staff") {
    document.querySelector("#openStaffButton")?.click();
    return;
  }

  const page = action.replace(/^open-/, "");
  document.querySelector(`[data-page-target="${page}"]`)?.click();
}

function suggestedAction(question, bot) {
  const text = String(question || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/chat|salon|mention|@/.test(text)) {
    return { action: "open-chat", actionLabel: "Ouvrir # Chat public" };
  }
  if (/mp|message prive|messagerie/.test(text)) {
    return { action: "open-mp", actionLabel: "Ouvrir les MP" };
  }
  if (/compte|connexion|inscription/.test(text)) {
    return { action: "open-account", actionLabel: "Ouvrir mon compte" };
  }
  if (/pixel|tamagotchi|piece|boutique/.test(text)) {
    return { action: "open-pixel", actionLabel: "Ouvrir Mon Pixel" };
  }
  if (/annonce|mise a jour|version/.test(text)) {
    return { action: "open-announcements", actionLabel: "Ouvrir les annonces" };
  }
  if (/candidature|postuler/.test(text)) {
    return { action: "open-application", actionLabel: "Ouvrir Candidature" };
  }
  if (bot === "moderation" && currentHelperRole() !== "member" && /staff|panel|moderation/.test(text)) {
    return { action: "open-staff", actionLabel: "Ouvrir l’espace staff" };
  }
  return {};
}

function quickPrompts(bot) {
  return bot === "moderation"
    ? [
        "Deux membres se disputent, comment savoir si c’est du harcèlement ?",
        "Quelle réaction proportionnée face à plusieurs messages de spam ?",
        "Un membre a envoyé un lien douteux, que dois-je vérifier ?",
        "Comment aider quelqu’un qui partage une information personnelle ?"
      ]
    : [
        "Explique-moi comment fonctionne le chat public.",
        "Comment envoyer un MP à un autre membre ?",
        "Que peut faire un compte modérateur ?",
        "Comment gagner et utiliser les pièces de Mon Pixel ?"
      ];
}

function renderQuickPrompts(root) {
  const container = root.querySelector(".pixel-helper-bot-prompts");
  if (!container) return;
  container.replaceChildren();
  quickPrompts(helperBotState.activeBot).forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.disabled = helperBotState.busy;
    button.addEventListener("click", () => submitBotQuestion(root, prompt));
    container.append(button);
  });
}

function switchBot(root, bot) {
  if (helperBotState.busy) return;
  helperBotState.activeBot = bot;
  root.querySelectorAll("[data-helper-bot]").forEach((button) => {
    button.classList.toggle("active", button.dataset.helperBot === bot);
  });
  const input = root.querySelector("input[name='helperBotQuestion']");
  if (input) {
    input.placeholder = bot === "moderation"
      ? "Décris toute la situation à analyser…"
      : "Pose une vraie question à Pixel Guide…";
  }
  renderQuickPrompts(root);
  const log = root.querySelector(".pixel-helper-bot-log");
  if (log && !log.querySelector(`[data-intro-bot="${bot}"]`)) {
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.introBot = bot;
    log.append(marker);
    appendBotMessage(
      log,
      "bot",
      bot === "moderation"
        ? `Je suis Pixel Guard. Quand l’IA du serveur est configurée, j’analyse réellement le contexte et j’adapte mes conseils à ton rôle ${helperRoleLabel()}. Je ne sanctionne personne automatiquement.`
        : "Je suis Pixel Guide. Quand l’IA du serveur est configurée, je comprends les questions libres et je garde le contexte de notre conversation au lieu de choisir une réponse prédéfinie.",
      { bot }
    );
  }
}

function setBotBusy(root, busy) {
  helperBotState.busy = busy;
  const form = root.querySelector(".pixel-helper-bot-form");
  const input = form?.elements.helperBotQuestion;
  const submit = form?.querySelector("button[type='submit']");
  if (input) input.disabled = busy;
  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy ? "Réflexion…" : "Envoyer";
  }
  root.querySelectorAll("[data-helper-bot]").forEach((button) => {
    button.disabled = busy;
  });
  renderQuickPrompts(root);
}

async function submitBotQuestion(root, forcedQuestion = "") {
  if (helperBotState.busy) return;
  const form = root.querySelector(".pixel-helper-bot-form");
  const input = form?.elements.helperBotQuestion;
  const question = String(forcedQuestion || input?.value || "").trim();
  if (question.length < 2) return;

  const token = helperAuthToken();
  const log = root.querySelector(".pixel-helper-bot-log");
  const bot = helperBotState.activeBot;
  appendBotMessage(log, "user", question);
  if (input) input.value = "";

  if (!token) {
    appendBotMessage(log, "bot", "Connecte d’abord un compte membre ou staff : l’accès à la vraie IA est protégé pour éviter les abus.", {
      bot,
      action: "open-account",
      actionLabel: "Ouvrir mon compte"
    });
    return;
  }

  setBotBusy(root, true);
  const pending = appendBotMessage(log, "bot", `${botDisplayName(bot)} analyse ta demande…`, { bot, pending: true });
  const previousHistory = helperBotState.histories[bot].slice(-10);

  try {
    const data = await pixelHelperRequest("/pixel-helper/ask", {
      method: "POST",
      body: JSON.stringify({
        bot,
        message: question,
        history: previousHistory,
        page: currentPageName()
      })
    });
    pending.remove();
    const answer = String(data.answer || "").trim();
    const shortcut = suggestedAction(question, bot);
    appendBotMessage(log, "bot", answer || "L’IA a renvoyé une réponse vide.", { bot, ...shortcut });
    helperBotState.histories[bot].push(
      { role: "user", content: question },
      { role: "assistant", content: answer }
    );
    helperBotState.histories[bot] = helperBotState.histories[bot].slice(-10);
    helperBotState.aiConfigured = true;
    helperBotState.model = String(data.model || helperBotState.model || "");
    updateAiBadge(root, "online", "IA en ligne", helperBotState.model);
  } catch (error) {
    pending.remove();
    let message = error.message;
    if (error.code === "AI_NOT_CONFIGURED") {
      message = "Pixel Guide et Pixel Guard sont prêts à devenir de vraies IA, mais la clé OPENAI_API_KEY n’est pas encore ajoutée au serveur Termux.";
      helperBotState.aiConfigured = false;
      updateAiBadge(root, "offline", "IA non configurée");
    } else if (error.status === 401) {
      message = "Ta session a expiré. Reconnecte ton compte pour utiliser la vraie IA.";
    } else if (error.code === "SERVER_OFFLINE") {
      updateAiBadge(root, "offline", "Serveur IA hors ligne");
    }
    appendBotMessage(log, "bot", message, { bot });
  } finally {
    setBotBusy(root, false);
    input?.focus();
  }
}

function buildBotsSection() {
  const section = document.createElement("section");
  section.id = "pixelHelperBots";
  section.className = "pixel-helper-bots";
  section.innerHTML = `
    <header class="pixel-helper-bots-heading">
      <div>
        <p class="eyebrow">Assistants IA Pixel Helper</p>
        <h3>Guide et modération intelligents</h3>
      </div>
      <div class="pixel-helper-bot-badges">
        <span class="pixel-helper-ai-status checking">IA : vérification…</span>
        <span class="pixel-helper-bot-role">Compte ${helperRoleLabel()}</span>
      </div>
    </header>
    <div class="pixel-helper-bot-tabs" role="tablist">
      <button class="active" type="button" data-helper-bot="guide">Pixel Guide IA</button>
      <button type="button" data-helper-bot="moderation">Pixel Guard IA</button>
    </div>
    <p class="pixel-helper-ai-disclosure">Les réponses sont générées en ligne et peuvent se tromper. Pixel Guard conseille le staff, mais ne sanctionne jamais automatiquement.</p>
    <div class="pixel-helper-bot-log" aria-live="polite"></div>
    <div class="pixel-helper-bot-prompts"></div>
    <form class="pixel-helper-bot-form">
      <input name="helperBotQuestion" maxlength="1200" autocomplete="off" placeholder="Pose une vraie question à Pixel Guide…" required>
      <button class="primary-button" type="submit">Envoyer</button>
    </form>`;

  section.querySelectorAll("[data-helper-bot]").forEach((button) => {
    button.addEventListener("click", () => switchBot(section, button.dataset.helperBot));
  });
  section.querySelector(".pixel-helper-bot-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitBotQuestion(section);
  });
  switchBot(section, "guide");
  loadAiStatus(section);
  return section;
}

function installPixelHelperBots() {
  const modal = document.querySelector("#pixelHelperGuideDialog .pixel-helper-modal");
  if (!modal || modal.querySelector("#pixelHelperBots")) return false;
  const understood = modal.querySelector(".pixel-helper-understood");
  const section = buildBotsSection();
  if (understood) modal.insertBefore(section, understood);
  else modal.append(section);
  helperBotState.installed = true;
  return true;
}

installPixelHelperBots();
const pixelHelperBotsObserver = new MutationObserver(installPixelHelperBots);
pixelHelperBotsObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pixel-member-session-ready", () => {
  const root = document.querySelector("#pixelHelperBots");
  const badge = root?.querySelector(".pixel-helper-bot-role");
  if (badge) badge.textContent = `Compte ${helperRoleLabel()}`;
  if (root) loadAiStatus(root);
});

window.PixelHelperBots = Object.freeze({
  openGuideBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="guide"]')?.click(), 0);
  },
  openModerationBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="moderation"]')?.click(), 0);
  },
  isAiConfigured: () => helperBotState.aiConfigured,
  model: () => helperBotState.model
});
