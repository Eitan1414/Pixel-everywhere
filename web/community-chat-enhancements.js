const mentionRoleTargets = Object.freeze([
  { key: "admin", label: "Admin", insert: "@Admin", type: "admin", description: "Mentionner les administrateurs" },
  { key: "moderator", label: "Modérateur", insert: "@Modérateur", type: "moderator", description: "Mentionner les modérateurs" },
  { key: "member", label: "Membre", insert: "@Membre", type: "member", description: "Mentionner les membres" }
]);

const mentionState = {
  members: [],
  membersLoading: false,
  activeIndex: 0,
  activeRange: null,
  suggestions: []
};

const mentionSource = new WeakMap();
let enhancementRendering = false;

function normalizeMention(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function communityEnhancementApiBase() {
  const configured = localStorage.getItem("pixel-api-base-url");
  return String(configured || import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
}

function parseMentionStorage(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function readStoredMember() {
  return parseMentionStorage(localStorage, "pixel-member");
}

function readStoredStaff() {
  return parseMentionStorage(sessionStorage, "pixel-user") ||
    parseMentionStorage(localStorage, "pixel-staff-user-persistent");
}

function memberMentionType(member) {
  const role = normalizeMention(member?.staff_role || member?.staffRole || member?.role || "");
  if (role === "admin") return "admin";
  if (["moderator", "moderateur", "modo"].includes(role)) return "moderator";
  return "member";
}

function roleMentionType(token) {
  const normalized = normalizeMention(token);
  if (["admin", "administrateur", "administrateurs"].includes(normalized)) return "admin";
  if (["moderateur", "moderateurs", "moderator", "moderators", "modo", "modos"].includes(normalized)) {
    return "moderator";
  }
  if (["membre", "membres", "member", "members"].includes(normalized)) return "member";
  return "";
}

function mentionType(token) {
  const roleType = roleMentionType(token);
  if (roleType) return roleType;
  const normalized = normalizeMention(token);
  const member = mentionState.members.find((item) => normalizeMention(item.username) === normalized);
  return memberMentionType(member);
}

function mentionLabel(type) {
  if (type === "admin") return "Administrateur";
  if (type === "moderator") return "Modérateur";
  return "Membre";
}

function isMentionForCurrentMember(token, type) {
  const member = readStoredMember();
  if (!member) return false;
  if (normalizeMention(token) === normalizeMention(member.username)) return true;
  const staff = readStoredStaff();
  const currentType = staff ? memberMentionType(staff) : memberMentionType(member);
  return Boolean(roleMentionType(token) && currentType === type);
}

async function loadMentionMembers() {
  if (mentionState.membersLoading || mentionState.members.length) return;
  const token = localStorage.getItem("pixel-member-token") || "";
  if (!token) return;
  mentionState.membersLoading = true;
  const base = communityEnhancementApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  if (base.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  try {
    const response = await fetch(`${base}/member-direct/members`, {
      headers,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(payload.members)) {
      mentionState.members = payload.members;
      document.querySelectorAll(".community-chat-message > p").forEach((node) => {
        node.removeAttribute("data-community-mentions");
      });
      enhanceVisibleMentions();
    }
  } catch {
    // Le chat reste utilisable même si les suggestions ne peuvent pas être chargées.
  } finally {
    mentionState.membersLoading = false;
  }
}

function buildMentionFragment(text, message) {
  const fragment = document.createDocumentFragment();
  const pattern = /@([A-Za-z0-9_.À-ÖØ-öø-ÿ-]+)/g;
  let cursor = 0;
  let match;
  let mentionedCurrentMember = false;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[1];
    const type = mentionType(token);
    const chip = document.createElement("span");
    chip.className = `community-mention community-mention-${type}`;
    chip.textContent = `@${token}`;
    chip.title = `Mention ${mentionLabel(type)}`;
    chip.setAttribute("role", "mark");
    fragment.append(chip);
    if (isMentionForCurrentMember(token, type)) mentionedCurrentMember = true;
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  message?.classList.toggle("mentioned-me", mentionedCurrentMember);
  return fragment;
}

function enhanceMentionParagraph(paragraph) {
  if (!paragraph || paragraph.dataset.communityMentions === "true") return;
  const message = paragraph.closest(".community-chat-message");
  const text = mentionSource.get(paragraph) ?? paragraph.textContent ?? "";
  mentionSource.set(paragraph, text);
  paragraph.dataset.communityMentions = "true";
  paragraph.replaceChildren(buildMentionFragment(text, message));
}

function enhanceVisibleMentions() {
  document.querySelectorAll(".community-chat-message > p").forEach(enhanceMentionParagraph);
}

function createPublicChatNavButton() {
  const button = document.createElement("button");
  button.id = "communityChatNavButton";
  button.type = "button";
  button.dataset.pageTarget = "community-chat";
  button.setAttribute("aria-label", "Ouvrir le chat public");
  button.innerHTML = '<span aria-hidden="true">#</span><small>Chat public</small>';
  button.addEventListener("click", () => {
    const feature = document.querySelector("#communityChatFeature");
    if (feature) {
      feature.click();
    } else {
      document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
      document.querySelector("#page-community-chat")?.classList.add("active");
    }
    document.querySelectorAll(".bottom-nav button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  return button;
}

function ensurePublicChatNavigation() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav || nav.querySelector("#communityChatNavButton")) return;
  const button = createPublicChatNavButton();
  const pixelButton = nav.querySelector('[data-page-target="pixel"]');
  if (pixelButton) nav.insertBefore(button, pixelButton);
  else nav.append(button);
}

function allMentionTargets() {
  const members = mentionState.members.map((member) => ({
    key: normalizeMention(member.username),
    label: member.display_name || member.username,
    insert: `@${member.username}`,
    type: memberMentionType(member),
    description: `@${member.username} · ${mentionLabel(memberMentionType(member))}`
  }));
  return [...mentionRoleTargets, ...members];
}

function currentMentionRange(textarea) {
  const caret = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, caret);
  const match = before.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1];
  return {
    query,
    start: caret - query.length - 1,
    end: caret
  };
}

function hideMentionSuggestions(form) {
  const popup = form?.querySelector("#communityMentionSuggestions");
  if (popup) {
    popup.hidden = true;
    popup.replaceChildren();
  }
  mentionState.activeIndex = 0;
  mentionState.activeRange = null;
  mentionState.suggestions = [];
}

function insertMention(textarea, form, target) {
  const range = mentionState.activeRange;
  if (!range) return;
  const before = textarea.value.slice(0, range.start);
  const after = textarea.value.slice(range.end);
  const suffix = " ";
  textarea.value = `${before}${target.insert}${suffix}${after}`;
  const caret = before.length + target.insert.length + suffix.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  hideMentionSuggestions(form);
  updateModerationHint(textarea, form);
}

function renderMentionSuggestions(textarea, form) {
  const popup = form.querySelector("#communityMentionSuggestions");
  const range = currentMentionRange(textarea);
  if (!popup || !range) {
    hideMentionSuggestions(form);
    return;
  }

  const query = normalizeMention(range.query);
  const suggestions = allMentionTargets()
    .filter((target) => {
      const searchable = normalizeMention(`${target.label} ${target.insert} ${target.description}`);
      return !query || searchable.includes(query);
    })
    .slice(0, 8);

  if (!suggestions.length) {
    hideMentionSuggestions(form);
    return;
  }

  mentionState.activeRange = range;
  mentionState.suggestions = suggestions;
  mentionState.activeIndex = Math.min(mentionState.activeIndex, suggestions.length - 1);
  popup.replaceChildren();
  suggestions.forEach((target, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `community-mention-option community-mention-option-${target.type}`;
    button.classList.toggle("active", index === mentionState.activeIndex);

    const mention = document.createElement("span");
    mention.textContent = target.insert;
    const description = document.createElement("small");
    description.textContent = target.description;
    button.append(mention, description);

    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => insertMention(textarea, form, target));
    popup.append(button);
  });
  popup.hidden = false;
}

function moderationWarnings(value) {
  const warnings = [];
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(value)) {
    warnings.push("une adresse e-mail semble être présente");
  }
  if (/(?:\+?\d[\s.-]?){8,}/.test(value)) {
    warnings.push("un numéro de téléphone semble être présent");
  }
  const links = value.match(/https?:\/\/|www\./gi) || [];
  if (links.length >= 3) warnings.push("beaucoup de liens sont inclus");
  const mentions = value.match(/@[A-Za-z0-9_.À-ÖØ-öø-ÿ-]+/g) || [];
  if (mentions.length >= 6) warnings.push("beaucoup de mentions sont incluses");
  if (/(.)\1{9,}/i.test(value)) warnings.push("le message ressemble à du spam répétitif");
  return warnings;
}

function updateModerationHint(textarea, form) {
  const hint = form.querySelector("#communityModerationHint");
  if (!hint) return;
  const warnings = moderationWarnings(textarea.value);
  if (!textarea.value.trim()) {
    hint.className = "community-moderation-hint";
    hint.textContent = "Bot Modération : utilise @ pour mentionner un membre ou un rôle. Évite les informations personnelles et le spam.";
    return;
  }
  if (!warnings.length) {
    hint.className = "community-moderation-hint safe";
    hint.textContent = "Bot Modération : aucun risque évident détecté dans ce message.";
    return;
  }
  hint.className = "community-moderation-hint warning";
  hint.textContent = `Bot Modération : attention, ${warnings.join(" et ")}. Vérifie avant d’envoyer.`;
}

function ensureMentionComposer() {
  const form = document.querySelector("#communityChatForm");
  const textarea = form?.querySelector('textarea[name="body"]');
  if (!form || !textarea || form.dataset.mentionEnhanced === "true") return;
  form.dataset.mentionEnhanced = "true";
  form.classList.add("community-chat-form-enhanced");
  textarea.setAttribute("aria-autocomplete", "list");
  textarea.setAttribute("aria-controls", "communityMentionSuggestions");

  const popup = document.createElement("div");
  popup.id = "communityMentionSuggestions";
  popup.className = "community-mention-suggestions";
  popup.hidden = true;

  const hint = document.createElement("p");
  hint.id = "communityModerationHint";
  hint.className = "community-moderation-hint";
  hint.setAttribute("aria-live", "polite");

  form.append(popup, hint);
  updateModerationHint(textarea, form);

  textarea.addEventListener("focus", () => {
    loadMentionMembers();
    renderMentionSuggestions(textarea, form);
  });
  textarea.addEventListener("input", () => {
    renderMentionSuggestions(textarea, form);
    updateModerationHint(textarea, form);
  });
  textarea.addEventListener("keydown", (event) => {
    if (popup.hidden || !mentionState.suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      mentionState.activeIndex = (mentionState.activeIndex + direction + mentionState.suggestions.length) % mentionState.suggestions.length;
      renderMentionSuggestions(textarea, form);
      popup.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertMention(textarea, form, mentionState.suggestions[mentionState.activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hideMentionSuggestions(form);
    }
  });
  textarea.addEventListener("blur", () => window.setTimeout(() => hideMentionSuggestions(form), 140));
}

function renderEnhancements() {
  if (enhancementRendering) return;
  enhancementRendering = true;
  try {
    ensurePublicChatNavigation();
    ensureMentionComposer();
    enhanceVisibleMentions();
  } finally {
    enhancementRendering = false;
  }
}

renderEnhancements();
loadMentionMembers();

const communityEnhancementObserver = new MutationObserver(renderEnhancements);
communityEnhancementObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pixel-member-session-ready", () => {
  mentionState.members = [];
  loadMentionMembers();
  renderEnhancements();
});

window.PixelCommunityEnhancements = Object.freeze({
  refresh: renderEnhancements,
  openPublicChat: () => document.querySelector("#communityChatNavButton")?.click(),
  mentionTypes: Object.freeze({ admin: "yellow", moderator: "red", member: "green" })
});
