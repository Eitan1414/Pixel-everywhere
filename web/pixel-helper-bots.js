import {
  helperKnowledgeStats,
  helperRoleLabel,
  quickPromptsFor,
  resolvePixelHelperMessage
} from "./pixel-helper-knowledge.js";

const helperBotState = {
  activeBot: "guide",
  installed: false,
  busy: false
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

  const memberToken = localStorage.getItem("pixel-member-token");
  const member = parseBotStorage(localStorage, "pixel-member-user") ||
    parseBotStorage(sessionStorage, "pixel-member-user");
  if (memberToken || member) return "member";
  return "guest";
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

function renderQuickPrompts(root) {
  const container = root.querySelector(".pixel-helper-bot-prompts");
  if (!container) return;
  container.replaceChildren();
  quickPromptsFor({ bot: helperBotState.activeBot, role: currentHelperRole() }).forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.disabled = helperBotState.busy;
    button.addEventListener("click", () => submitBotQuestion(root, prompt));
    container.append(button);
  });
}

function introMessage(bot, role) {
  if (bot === "moderation") {
    if (role === "guest" || role === "member") {
      return `Je suis Pixel Guard. Je peux t’expliquer comment réagir face au spam, au harcèlement, aux liens douteux, aux informations personnelles ou à une menace, puis t’indiquer comment prévenir le staff. Je ne sanctionne personne.`;
    }
    return `Je suis Pixel Guard. Mes fiches de modération s’adaptent à ton rôle ${helperRoleLabel(role)} et proposent des réactions prudentes, proportionnées et toujours vérifiées par un humain.`;
  }
  return `Je suis Pixel Guide. Je connais les catégories, les outils et les droits de Pixel Everywhere. Mes réponses sont prédéfinies, fonctionnent localement et ne sont envoyées à aucun service extérieur.`;
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
      ? "Décris le type de situation à gérer…"
      : "Demande où se trouve un outil ou comment l’utiliser…";
  }

  renderQuickPrompts(root);
  const log = root.querySelector(".pixel-helper-bot-log");
  if (log && !log.querySelector(`[data-intro-bot="${bot}"]`)) {
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.introBot = bot;
    log.append(marker);
    appendBotMessage(log, "bot", introMessage(bot, currentHelperRole()), { bot });
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
    submit.textContent = busy ? "Pixel cherche…" : "Envoyer";
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

  const log = root.querySelector(".pixel-helper-bot-log");
  const bot = helperBotState.activeBot;
  const role = currentHelperRole();
  appendBotMessage(log, "user", question);
  if (input) input.value = "";

  setBotBusy(root, true);
  const pending = appendBotMessage(log, "bot", `${botDisplayName(bot)} consulte ses fiches…`, { bot, pending: true });

  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const result = resolvePixelHelperMessage({
    bot,
    question,
    role,
    page: currentPageName()
  });

  pending.remove();
  appendBotMessage(log, "bot", result.answer, {
    bot,
    action: result.action,
    actionLabel: result.actionLabel
  });
  setBotBusy(root, false);
  input?.focus();
}

function buildBotsSection() {
  const role = currentHelperRole();
  const stats = helperKnowledgeStats();
  const section = document.createElement("section");
  section.id = "pixelHelperBots";
  section.className = "pixel-helper-bots";
  section.innerHTML = `
    <header class="pixel-helper-bots-heading">
      <div>
        <p class="eyebrow">Personnages d’aide Pixel Helper</p>
        <h3>Guide de l’application et conseils de modération</h3>
      </div>
      <div class="pixel-helper-bot-badges">
        <span class="pixel-helper-local-status">100 % local • ${stats.totalTopics} fiches</span>
        <span class="pixel-helper-bot-role">Compte ${helperRoleLabel(role)}</span>
      </div>
    </header>
    <div class="pixel-helper-bot-tabs" role="tablist">
      <button class="active" type="button" data-helper-bot="guide">Pixel Guide</button>
      <button type="button" data-helper-bot="moderation">Pixel Guard</button>
    </div>
    <p class="pixel-helper-local-disclosure">Pixel utilise uniquement des messages préparés dans l’application. Aucune question n’est envoyée à un service extérieur. Les réponses dépendent du rôle détecté et de la catégorie ouverte. Pixel Guard conseille, mais ne sanctionne jamais automatiquement.</p>
    <div class="pixel-helper-bot-log" aria-live="polite"></div>
    <div class="pixel-helper-bot-prompts"></div>
    <form class="pixel-helper-bot-form">
      <input name="helperBotQuestion" maxlength="500" autocomplete="off" placeholder="Demande où se trouve un outil ou comment l’utiliser…" required>
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

function refreshRolePresentation() {
  const root = document.querySelector("#pixelHelperBots");
  const badge = root?.querySelector(".pixel-helper-bot-role");
  if (badge) badge.textContent = `Compte ${helperRoleLabel(currentHelperRole())}`;
  if (root) renderQuickPrompts(root);
}

installPixelHelperBots();
const pixelHelperBotsObserver = new MutationObserver(installPixelHelperBots);
pixelHelperBotsObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pixel-member-session-ready", refreshRolePresentation);
window.addEventListener("storage", refreshRolePresentation);

window.PixelHelperBots = Object.freeze({
  openGuideBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="guide"]')?.click(), 0);
  },
  openModerationBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="moderation"]')?.click(), 0);
  },
  mode: () => "local-predefined",
  role: () => currentHelperRole(),
  knowledgeStats: () => helperKnowledgeStats()
});
