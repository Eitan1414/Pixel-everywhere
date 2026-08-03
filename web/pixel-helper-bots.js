const helperBotState = {
  activeBot: "guide",
  installed: false
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

function normalizeBotQuestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function guideAnswer(question) {
  const text = normalizeBotQuestion(question);
  if (/chat|public|commun|salon|#/.test(text)) {
    return {
      text: "Le # Chat public se trouve maintenant dans la barre des catégories. Tous les membres, modérateurs et administrateurs connectés peuvent y discuter.",
      action: "open-chat",
      actionLabel: "Ouvrir # Chat public"
    };
  }
  if (/mention|@|admin|moderateur|modo|membre/.test(text)) {
    return {
      text: "Dans le chat public, tape @ pour ouvrir les suggestions. @Admin apparaît en jaune, @Modérateur en rouge et @Membre en vert. Tu peux aussi choisir directement le pseudo d’une personne.",
      action: "open-chat",
      actionLabel: "Essayer une mention"
    };
  }
  if (/mp|prive|message direct|messagerie/.test(text)) {
    return {
      text: "Ouvre Ma messagerie, puis l’onglet MP membres. Tu peux choisir un destinataire, créer une conversation et répondre dans le même fil.",
      action: "open-mp",
      actionLabel: "Ouvrir les MP"
    };
  }
  if (/compte|connexion|connecter|inscription/.test(text)) {
    return {
      text: "Le bouton Compte permet de créer ou connecter un compte membre. Un compte staff reçoit automatiquement un profil membre lié pour accéder au chat, aux MP et à Pixel.",
      action: "open-account",
      actionLabel: "Ouvrir mon compte"
    };
  }
  if (/pixel|piece|tamagotchi|nourrir|promener/.test(text)) {
    return {
      text: "Dans Mon Pixel, les actions coûtent des pièces et possèdent un délai anti-spam. Les pièces servent aussi à la boutique et peuvent être converties en XP PDD.",
      action: "open-pixel",
      actionLabel: "Ouvrir Mon Pixel"
    };
  }
  if (/annonce|nouveaute|version|mise a jour|update/.test(text)) {
    return {
      text: "Les annonces officielles et journaux de versions sont dans Annonces. Pixel Helper ajoute aussi un tutoriel d’installation lorsqu’une mise à jour est disponible.",
      action: "open-announcements",
      actionLabel: "Ouvrir les annonces"
    };
  }
  if (/staff|candidature|postuler/.test(text)) {
    return {
      text: currentHelperRole() === "member"
        ? "La catégorie Candidature permet de postuler auprès du staff avec un compte membre connecté. La réponse arrivera ensuite dans Ma messagerie."
        : `Ton compte ${helperRoleLabel()} donne accès aux outils staff. Pixel Guard peut aussi t’aider à analyser une situation de modération.`,
      action: currentHelperRole() === "member" ? "open-application" : "open-staff",
      actionLabel: currentHelperRole() === "member" ? "Ouvrir Candidature" : "Ouvrir l’espace staff"
    };
  }
  return {
    text: "Je peux t’aider avec le # Chat public, les mentions @, les MP, le compte, Mon Pixel, les annonces, les candidatures et les mises à jour. Écris simplement le nom de la fonction qui te bloque."
  };
}

function moderationAnswer(question) {
  const text = normalizeBotQuestion(question);
  const role = currentHelperRole();
  const staffAdvice = role === "member"
    ? "Fais une capture si nécessaire et contacte le staff avec le contexte complet."
    : "Vérifie le contexte, conserve une preuve utile et applique une action proportionnée selon les règles de PDD.";

  if (/spam|flood|repetition|majuscule/.test(text)) {
    return {
      text: `Pour un spam, demande d’abord d’arrêter si la situation est légère. En cas de répétition, limite les interactions et transmets le contexte. ${staffAdvice}`
    };
  }
  if (/insulte|harcelement|menace|haine|discrimination/.test(text)) {
    return {
      text: `Ne réponds pas par une insulte. Mets la personne en sécurité, garde les messages concernés et signale rapidement la situation. ${staffAdvice}`
    };
  }
  if (/lien|arnaque|phishing|virus|telechargement|suspect/.test(text)) {
    return {
      text: `N’ouvre pas un lien douteux et ne saisis jamais ton mot de passe après avoir suivi un lien reçu dans le chat. ${staffAdvice}`
    };
  }
  if (/adresse|telephone|email|mail|dox|personnelle|privee/.test(text)) {
    return {
      text: "Les adresses, numéros de téléphone, e-mails privés et autres informations personnelles ne doivent pas être publiés. Demande leur suppression et préviens immédiatement le staff si elles concernent quelqu’un d’autre."
    };
  }
  if (/mention|@|ping/.test(text)) {
    return {
      text: "Les mentions servent à attirer l’attention, pas à harceler. Évite les séries de @ et réserve les mentions de rôles aux messages qui concernent réellement tout le rôle."
    };
  }
  if (/supprimer|sanction|mute|ban|avertissement/.test(text)) {
    return {
      text: role === "member"
        ? "Un membre ne doit pas rendre justice lui-même. Signale le message avec le contexte et laisse un modérateur ou un administrateur décider."
        : "Commence par l’action la moins forte qui protège réellement la communauté : rappel, avertissement, suppression du contenu, restriction temporaire, puis sanction plus forte si nécessaire. Note toujours la raison."
    };
  }
  if (/regle|aide|que faire|probleme/.test(text)) {
    return {
      text: `Décris le comportement observé, sans donner d’informations personnelles. Je t’aiderai à distinguer spam, harcèlement, lien dangereux, abus de mentions ou simple désaccord. Tu es actuellement connecté comme ${helperRoleLabel()}.`
    };
  }
  return {
    text: "Décris brièvement la situation : spam, insultes, harcèlement, lien suspect, informations personnelles ou abus de mentions. Pixel Guard te proposera une réaction prudente et adaptée à ton rôle."
  };
}

function answerFromActiveBot(question) {
  return helperBotState.activeBot === "moderation"
    ? moderationAnswer(question)
    : guideAnswer(question);
}

function botDisplayName(bot = helperBotState.activeBot) {
  return bot === "moderation" ? "Pixel Guard" : "Pixel Guide";
}

function botClass(bot = helperBotState.activeBot) {
  return bot === "moderation" ? "moderation" : "guide";
}

function appendBotMessage(log, sender, text, { bot = "", action = "", actionLabel = "" } = {}) {
  const article = document.createElement("article");
  const isUser = sender === "user";
  article.className = `pixel-helper-bot-message ${isUser ? "user" : `bot ${botClass(bot)}`}`;

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

function quickPrompts(bot) {
  return bot === "moderation"
    ? ["Que faire face au spam ?", "Un lien semble suspect", "Quelqu’un partage une adresse", "Comment réagir aux insultes ?"]
    : ["Où est le chat public ?", "Comment utiliser @ ?", "Comment envoyer un MP ?", "À quoi sert le compte membre ?"];
}

function renderQuickPrompts(root) {
  const container = root.querySelector(".pixel-helper-bot-prompts");
  if (!container) return;
  container.replaceChildren();
  quickPrompts(helperBotState.activeBot).forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => submitBotQuestion(root, prompt));
    container.append(button);
  });
}

function switchBot(root, bot) {
  helperBotState.activeBot = bot;
  root.querySelectorAll("[data-helper-bot]").forEach((button) => {
    button.classList.toggle("active", button.dataset.helperBot === bot);
  });
  const input = root.querySelector("input[name='helperBotQuestion']");
  if (input) {
    input.placeholder = bot === "moderation"
      ? "Décris une situation de modération…"
      : "Pose une question sur l’application…";
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
        ? `Je suis Pixel Guard. Je peux t’aider à réagir prudemment aux problèmes de communauté. Ton rôle actuel est ${helperRoleLabel()}.`
        : "Je suis Pixel Guide. Demande-moi où trouver une catégorie ou comment utiliser une fonction de Pixel Everywhere.",
      { bot }
    );
  }
}

function submitBotQuestion(root, forcedQuestion = "") {
  const form = root.querySelector(".pixel-helper-bot-form");
  const input = form?.elements.helperBotQuestion;
  const question = String(forcedQuestion || input?.value || "").trim();
  if (!question) return;
  const log = root.querySelector(".pixel-helper-bot-log");
  appendBotMessage(log, "user", question);
  if (input) input.value = "";

  const answer = answerFromActiveBot(question);
  window.setTimeout(() => {
    appendBotMessage(log, "bot", answer.text, {
      bot: helperBotState.activeBot,
      action: answer.action,
      actionLabel: answer.actionLabel
    });
  }, 160);
}

function buildBotsSection() {
  const section = document.createElement("section");
  section.id = "pixelHelperBots";
  section.className = "pixel-helper-bots";
  section.innerHTML = `
    <header class="pixel-helper-bots-heading">
      <div>
        <p class="eyebrow">Assistants Pixel Helper</p>
        <h3>Guide et modération</h3>
      </div>
      <span class="pixel-helper-bot-role">Compte ${helperRoleLabel()}</span>
    </header>
    <div class="pixel-helper-bot-tabs" role="tablist">
      <button class="active" type="button" data-helper-bot="guide">Pixel Guide</button>
      <button type="button" data-helper-bot="moderation">Pixel Guard</button>
    </div>
    <div class="pixel-helper-bot-log" aria-live="polite"></div>
    <div class="pixel-helper-bot-prompts"></div>
    <form class="pixel-helper-bot-form">
      <input name="helperBotQuestion" maxlength="300" autocomplete="off" placeholder="Pose une question sur l’application…" required>
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

installPixelHelperBots();
const pixelHelperBotsObserver = new MutationObserver(installPixelHelperBots);
pixelHelperBotsObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pixel-member-session-ready", () => {
  const badge = document.querySelector("#pixelHelperBots .pixel-helper-bot-role");
  if (badge) badge.textContent = `Compte ${helperRoleLabel()}`;
});

window.PixelHelperBots = Object.freeze({
  openGuideBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="guide"]')?.click(), 0);
  },
  openModerationBot: () => {
    window.PixelHelper?.openGuide?.();
    window.setTimeout(() => document.querySelector('[data-helper-bot="moderation"]')?.click(), 0);
  }
});
