const storageKeys = Object.freeze({
  staffToken: "pixel-token",
  staffUser: "pixel-user",
  memberToken: "pixel-member-token",
  memberUser: "pixel-member"
});

const conversationState = {
  mode: "member",
  conversations: [],
  members: [],
  activeId: null,
  provisioning: false,
  lastIdentity: ""
};

function parseStored(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function staffIdentity() {
  return {
    token: sessionStorage.getItem(storageKeys.staffToken) || "",
    user: parseStored(sessionStorage, storageKeys.staffUser)
  };
}

function memberIdentity() {
  return {
    token: localStorage.getItem(storageKeys.memberToken) || "",
    member: parseStored(localStorage, storageKeys.memberUser)
  };
}

function apiBase() {
  const configured = localStorage.getItem("pixel-api-base-url");
  return String(configured || import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
}

async function request(path, { mode = conversationState.mode, method = "GET", body } = {}) {
  const staff = staffIdentity();
  const member = memberIdentity();
  const token = mode === "staff" ? staff.token : member.token;
  if (!token) throw new Error("Connexion requise.");

  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (apiBase().includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Le serveur PDD est inaccessible.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "La messagerie a rencontré une erreur.");
  return payload;
}

function node(tag, options = {}, children = []) {
  const item = document.createElement(tag);
  if (options.className) item.className = options.className;
  if (options.text !== undefined) item.textContent = options.text;
  if (options.type) item.type = options.type;
  if (options.name) item.name = options.name;
  if (options.placeholder) item.placeholder = options.placeholder;
  if (options.maxLength) item.maxLength = options.maxLength;
  if (options.rows) item.rows = options.rows;
  if (options.value !== undefined) item.value = options.value;
  if (options.hidden) item.hidden = true;
  if (options.onClick) item.addEventListener("click", options.onClick);
  children.filter(Boolean).forEach((child) => item.append(child));
  return item;
}

function formatDate(value) {
  if (!value) return "";
  const normalized = String(value);
  const date = new Date(
    normalized.endsWith("Z") || normalized.includes("+") ? normalized : `${normalized}Z`
  );
  if (Number.isNaN(date.getTime())) return normalized;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function activeRoleLabel() {
  const user = staffIdentity().user;
  if (!user) return "Messagerie";
  return user.role === "admin" ? "Boîte admin" : "Boîte modération";
}

function setPageActive() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".bottom-nav button").forEach((button) =>
    button.classList.remove("active")
  );
  document.querySelector("#page-conversations")?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(message, type = "") {
  const status = document.querySelector("#conversationStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `conversation-status ${type}`.trim();
}

function updateAccess() {
  const staff = staffIdentity();
  const member = memberIdentity();
  conversationState.mode = staff.token && staff.user ? "staff" : "member";
  const available = Boolean(
    (conversationState.mode === "staff" && staff.token) ||
      (conversationState.mode === "member" && member.token)
  );

  const button = document.querySelector("#conversationInboxButton");
  const feature = document.querySelector("#conversationFeature");
  button?.classList.toggle("hidden", !available);
  feature?.classList.toggle("hidden", !available);
  if (button) button.setAttribute("aria-label", activeRoleLabel());
  const title = document.querySelector("#conversationPageTitle");
  if (title) title.textContent = conversationState.mode === "staff" ? activeRoleLabel() : "Mes discussions";
  const eyebrow = document.querySelector("#conversationPageEyebrow");
  if (eyebrow) {
    eyebrow.textContent = conversationState.mode === "staff"
      ? "Répondre aux membres"
      : "Discussion privée avec le staff";
  }
  const composeTitle = document.querySelector("#conversationComposeTitle");
  if (composeTitle) {
    composeTitle.textContent = conversationState.mode === "staff"
      ? "Écrire à un membre"
      : "Écrire au staff";
  }
  document.querySelector("#conversationRecipientField")?.classList.toggle(
    "hidden",
    conversationState.mode !== "staff"
  );
}

async function provisionLinkedMemberProfile() {
  const staff = staffIdentity();
  const member = memberIdentity();
  if (!staff.token || !staff.user || conversationState.provisioning) return;
  if (member.member?.staffLinked && Number(member.member.staffId) === Number(staff.user.id)) return;

  conversationState.provisioning = true;
  try {
    const payload = await request("/conversations/staff/member-profile", {
      mode: "staff",
      method: "POST"
    });
    if (!payload.token || !payload.member) {
      throw new Error("Le serveur n’a pas créé le profil membre lié.");
    }
    localStorage.setItem(storageKeys.memberToken, payload.token);
    localStorage.setItem(storageKeys.memberUser, JSON.stringify(payload.member));
    sessionStorage.setItem("pixel-staff-member-profile-ready", String(staff.user.id));
    window.location.reload();
  } catch (error) {
    console.error("PIXEL_STAFF_MEMBER_PROFILE_FAILED", error);
    setStatus(error.message, "error");
  } finally {
    conversationState.provisioning = false;
  }
}

function removeOrphanLinkedProfile() {
  const staff = staffIdentity();
  const member = memberIdentity();
  if (staff.token || !member.member?.staffLinked) return;
  localStorage.removeItem(storageKeys.memberToken);
  localStorage.removeItem(storageKeys.memberUser);
  sessionStorage.removeItem("pixel-staff-member-profile-ready");
  window.location.reload();
}

function renderConversationList() {
  const list = document.querySelector("#conversationList");
  if (!list) return;
  list.replaceChildren();

  if (!conversationState.conversations.length) {
    list.append(node("div", {
      className: "conversation-empty",
      text: conversationState.mode === "staff"
        ? "Aucune discussion avec les membres pour le moment."
        : "Tu n’as encore aucune discussion."
    }));
    return;
  }

  conversationState.conversations.forEach((conversation) => {
    const unread = Number(conversation.unread_count || 0);
    const recipient = conversationState.mode === "staff"
      ? conversation.member_display_name || conversation.member_username
      : "PDD Staff";
    const card = node("button", {
      className: `conversation-thread${unread ? " unread" : ""}${
        Number(conversation.id) === Number(conversationState.activeId) ? " active" : ""
      }`,
      type: "button",
      onClick: () => openConversation(conversation.id)
    }, [
      node("span", { className: "conversation-thread-head" }, [
        node("strong", { text: recipient }),
        node("time", { text: formatDate(conversation.last_message_at || conversation.updated_at) })
      ]),
      node("b", { text: conversation.subject }),
      node("small", {
        text: conversation.last_message || "Nouvelle conversation"
      }),
      unread ? node("i", { text: String(unread) }) : null
    ]);
    list.append(card);
  });
}

function updateBadge() {
  const unread = conversationState.conversations.reduce(
    (total, conversation) => total + Number(conversation.unread_count || 0),
    0
  );
  const badge = document.querySelector("#conversationBadge");
  if (!badge) return;
  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread === 0);
}

async function loadMembers() {
  if (conversationState.mode !== "staff") return;
  const payload = await request("/conversations/staff/members", { mode: "staff" });
  conversationState.members = Array.isArray(payload.members) ? payload.members : [];
  const select = document.querySelector("#conversationRecipient");
  if (!select) return;
  select.replaceChildren(node("option", { text: "Choisir un membre", value: "" }));
  conversationState.members.forEach((member) => {
    const option = node("option", {
      text: `${member.display_name} (@${member.username})`,
      value: String(member.id)
    });
    select.append(option);
  });
}

async function loadConversations({ keepSelection = true } = {}) {
  updateAccess();
  const list = document.querySelector("#conversationList");
  if (!list) return;
  list.replaceChildren(node("div", { className: "conversation-empty", text: "Chargement…" }));

  try {
    const path = conversationState.mode === "staff"
      ? "/conversations/staff"
      : "/conversations/member";
    const payload = await request(path);
    conversationState.conversations = Array.isArray(payload.conversations)
      ? payload.conversations
      : [];
    if (
      !keepSelection ||
      !conversationState.conversations.some(
        (item) => Number(item.id) === Number(conversationState.activeId)
      )
    ) {
      conversationState.activeId = null;
    }
    renderConversationList();
    updateBadge();
    if (conversationState.mode === "staff") await loadMembers();
  } catch (error) {
    conversationState.conversations = [];
    list.replaceChildren(node("div", { className: "conversation-empty", text: error.message }));
    updateBadge();
  }
}

function renderMessages(payload) {
  const detail = document.querySelector("#conversationDetail");
  if (!detail) return;
  detail.replaceChildren();
  const conversation = payload.conversation;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  const header = node("header", { className: "conversation-detail-head" }, [
    node("div", {}, [
      node("small", {
        text: conversationState.mode === "staff"
          ? conversation.member_display_name || conversation.member_username
          : "PDD Staff"
      }),
      node("h3", { text: conversation.subject })
    ]),
    conversation.closed ? node("span", { className: "conversation-closed", text: "Fermée" }) : null
  ]);
  detail.append(header);

  const messageList = node("div", { className: "conversation-messages" });
  messages.forEach((message) => {
    const mine = message.sender_type === conversationState.mode;
    messageList.append(node("article", {
      className: `conversation-message ${mine ? "mine" : "theirs"}`
    }, [
      node("strong", { text: mine ? "Moi" : message.sender_name }),
      node("p", { text: message.body }),
      node("time", { text: formatDate(message.created_at) })
    ]));
  });
  detail.append(messageList);

  if (!conversation.closed) {
    const replyForm = node("form", { className: "conversation-reply" }, [
      node("textarea", {
        name: "body",
        placeholder: "Écris ta réponse…",
        maxLength: 2000,
        rows: 3
      }),
      node("button", { type: "submit", className: "primary-button", text: "Envoyer" })
    ]);
    replyForm.addEventListener("submit", submitReply);
    detail.append(replyForm);
  }

  if (conversationState.mode === "staff") {
    const closeButton = node("button", {
      type: "button",
      className: "conversation-close-button",
      text: conversation.closed ? "Rouvrir la conversation" : "Fermer la conversation",
      onClick: () => toggleConversationClosed(conversation.id, !Boolean(conversation.closed))
    });
    detail.append(closeButton);
  }

  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

async function openConversation(id) {
  conversationState.activeId = Number(id);
  renderConversationList();
  const detail = document.querySelector("#conversationDetail");
  detail?.replaceChildren(node("div", { className: "conversation-empty", text: "Ouverture…" }));
  try {
    const path = conversationState.mode === "staff"
      ? `/conversations/staff/${id}`
      : `/conversations/member/${id}`;
    const payload = await request(path);
    renderMessages(payload);
    await loadConversations({ keepSelection: true });
  } catch (error) {
    detail?.replaceChildren(node("div", { className: "conversation-empty", text: error.message }));
  }
}

async function submitReply(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (!body || !conversationState.activeId) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const path = conversationState.mode === "staff"
      ? `/conversations/staff/${conversationState.activeId}/messages`
      : `/conversations/member/${conversationState.activeId}/messages`;
    await request(path, { method: "POST", body: { body } });
    form.reset();
    await openConversation(conversationState.activeId);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function submitNewConversation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setStatus("Envoi du message…");
  try {
    const path = conversationState.mode === "staff"
      ? "/conversations/staff"
      : "/conversations/member";
    const body = {
      subject: values.subject,
      body: values.body
    };
    if (conversationState.mode === "staff") body.memberId = Number(values.memberId);
    const payload = await request(path, { method: "POST", body });
    form.reset();
    setStatus("Message envoyé.", "success");
    await loadConversations({ keepSelection: false });
    await openConversation(payload.conversationId);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function toggleConversationClosed(id, closed) {
  try {
    await request(`/conversations/staff/${id}/close`, {
      mode: "staff",
      method: "PATCH",
      body: { closed }
    });
    await openConversation(id);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function buildInterface() {
  if (document.querySelector("#page-conversations")) return;
  const topActions = document.querySelector(".topbar-actions");
  const accountButton = document.querySelector("#accountButton");
  const inboxButton = node("button", {
    className: "inbox-button hidden",
    type: "button",
    onClick: openConversationPage
  }, [
    node("span", { text: "💬" }),
    node("b", { className: "hidden", text: "0" })
  ]);
  inboxButton.id = "conversationInboxButton";
  inboxButton.querySelector("b").id = "conversationBadge";
  topActions?.insertBefore(inboxButton, accountButton || null);

  const featureGrid = document.querySelector("#page-home .feature-grid");
  const feature = node("button", {
    className: "feature-card hidden",
    type: "button",
    onClick: openConversationPage
  }, [
    node("span", { className: "feature-icon cyan", text: "💬" }),
    node("span", {}, [
      node("strong", { text: "Messages privés" }),
      node("small", { text: "Discute directement avec les membres ou le staff" })
    ])
  ]);
  feature.id = "conversationFeature";
  featureGrid?.append(feature);

  const page = node("section", { className: "page" });
  page.id = "page-conversations";
  page.innerHTML = `
    <div class="section-heading conversation-heading">
      <div>
        <p id="conversationPageEyebrow" class="eyebrow">Discussion privée avec le staff</p>
        <h2 id="conversationPageTitle">Mes discussions</h2>
      </div>
      <button id="refreshConversations" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <article class="conversation-compose card">
      <h3 id="conversationComposeTitle">Écrire au staff</h3>
      <form id="conversationComposeForm">
        <label id="conversationRecipientField" class="hidden">
          Destinataire
          <select id="conversationRecipient" name="memberId" required></select>
        </label>
        <label>
          Sujet
          <input name="subject" type="text" minlength="3" maxlength="100" required placeholder="Sujet du message" />
        </label>
        <label>
          Message
          <textarea name="body" minlength="1" maxlength="2000" rows="4" required placeholder="Écris ton message…"></textarea>
        </label>
        <button class="primary-button" type="submit">Démarrer la discussion</button>
        <p id="conversationStatus" class="conversation-status" aria-live="polite"></p>
      </form>
    </article>
    <div class="conversation-layout">
      <aside id="conversationList" class="conversation-list"></aside>
      <section id="conversationDetail" class="conversation-detail">
        <div class="conversation-empty">Sélectionne une discussion pour afficher les messages.</div>
      </section>
    </div>`;
  document.querySelector("#mainContent")?.append(page);
  document.querySelector("#refreshConversations")?.addEventListener("click", () =>
    loadConversations({ keepSelection: true })
  );
  document.querySelector("#conversationComposeForm")?.addEventListener(
    "submit",
    submitNewConversation
  );
}

async function openConversationPage() {
  updateAccess();
  const staff = staffIdentity();
  const member = memberIdentity();
  if (conversationState.mode === "staff" && !staff.token) return;
  if (conversationState.mode === "member" && !member.token) {
    document.querySelector("#accountButton")?.click();
    return;
  }
  setPageActive();
  await loadConversations({ keepSelection: true });
}

function watchIdentity() {
  const staff = staffIdentity();
  const member = memberIdentity();
  const identity = `${staff.token}:${staff.user?.id || ""}:${member.token}:${member.member?.id || ""}`;
  if (identity === conversationState.lastIdentity) return;
  conversationState.lastIdentity = identity;
  updateAccess();
  if (staff.token && staff.user) provisionLinkedMemberProfile();
  else removeOrphanLinkedProfile();
  if ((staff.token && staff.user) || (member.token && member.member)) {
    loadConversations({ keepSelection: true });
  }
}

buildInterface();
updateAccess();
watchIdentity();
window.setInterval(watchIdentity, 900);
window.setInterval(() => {
  const visible = document.querySelector("#page-conversations")?.classList.contains("active");
  if (visible || document.visibilityState === "visible") {
    loadConversations({ keepSelection: true });
  }
}, 30_000);
