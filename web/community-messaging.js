const communityStorageKeys = Object.freeze({
  staffToken: "pixel-token",
  staffUser: "pixel-user",
  memberToken: "pixel-member-token",
  memberUser: "pixel-member"
});

const communityState = {
  chatMessages: [],
  chatLoading: false,
  directMembers: [],
  directConversations: [],
  activeDirectId: null,
  directLoading: false,
  inboxTab: "support",
  lastIdentity: ""
};

function parseStored(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function communityMemberIdentity() {
  return {
    token: localStorage.getItem(communityStorageKeys.memberToken) || "",
    member: parseStored(localStorage, communityStorageKeys.memberUser)
  };
}

function communityStaffIdentity() {
  return {
    token: sessionStorage.getItem(communityStorageKeys.staffToken) || "",
    user: parseStored(sessionStorage, communityStorageKeys.staffUser)
  };
}

function communityApiBase() {
  const configured = localStorage.getItem("pixel-api-base-url");
  return String(configured || import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
}

async function memberRequest(path, { method = "GET", body } = {}) {
  const identity = communityMemberIdentity();
  if (!identity.token) throw new Error("Connecte un compte membre pour utiliser cette fonction.");
  const headers = { Authorization: `Bearer ${identity.token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (communityApiBase().includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  let response;
  try {
    response = await fetch(`${communityApiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Le serveur PDD est inaccessible.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Une erreur de messagerie est survenue.");
  return payload;
}

function createNode(tag, options = {}, children = []) {
  const item = document.createElement(tag);
  if (options.id) item.id = options.id;
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

function formatCommunityDate(value) {
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

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "modo" || role === "moderator") return "Modérateur";
  return "";
}

function activateCommunityPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".bottom-nav button").forEach((button) =>
    button.classList.remove("active")
  );
  document.querySelector(pageId)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCommunityStatus(selector, message, type = "") {
  const status = document.querySelector(selector);
  if (!status) return;
  status.textContent = message;
  status.className = `conversation-status ${type}`.trim();
}

function updateCommunityAccess() {
  const identity = communityMemberIdentity();
  const gate = document.querySelector("#communityChatGate");
  const chatArea = document.querySelector("#communityChatArea");
  gate?.classList.toggle("hidden", Boolean(identity.token && identity.member));
  chatArea?.classList.toggle("hidden", !identity.token || !identity.member);

  const directTab = document.querySelector("#memberDirectTab");
  if (directTab) directTab.disabled = !identity.token;
  const staff = communityStaffIdentity();
  const supportTab = document.querySelector("#supportConversationTab");
  if (supportTab) supportTab.textContent = staff.token && staff.user ? "Boîte membres" : "Discussion avec le staff";

  const feature = document.querySelector("#conversationFeature");
  if (feature) {
    feature.querySelector("strong")?.replaceChildren(document.createTextNode("Messagerie"));
    feature.querySelector("small")?.replaceChildren(
      document.createTextNode("Discute avec le staff ou en MP avec les membres")
    );
  }
}

function buildPublicChatInterface() {
  if (document.querySelector("#page-community-chat")) return;
  const featureGrid = document.querySelector("#page-home .feature-grid");
  const feature = createNode("button", {
    id: "communityChatFeature",
    className: "feature-card community-chat-feature",
    type: "button",
    onClick: openCommunityChatPage
  }, [
    createNode("span", { className: "feature-icon cyan", text: "#" }),
    createNode("span", {}, [
      createNode("strong", { text: "Chat public" }),
      createNode("small", { text: "Parle avec les membres, modos et admins" })
    ])
  ]);
  featureGrid?.append(feature);

  const page = createNode("section", { id: "page-community-chat", className: "page" });
  page.innerHTML = `
    <div class="section-heading community-chat-heading">
      <div>
        <p class="eyebrow">Salon de la communauté</p>
        <h2>Chat public</h2>
      </div>
      <button id="refreshCommunityChat" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div id="communityChatGate" class="community-chat-gate card">
      <span aria-hidden="true">💬</span>
      <div>
        <h3>Connecte ton compte membre</h3>
        <p>Le chat public est réservé aux membres, modérateurs et administrateurs de PDD.</p>
        <button id="communityChatLoginButton" class="primary-button" type="button">Connexion / inscription</button>
      </div>
    </div>
    <section id="communityChatArea" class="community-chat-shell hidden">
      <div class="community-chat-rules">
        <strong>Salon commun PDD</strong>
        <span>Respect, pas de spam et aucune information personnelle sensible.</span>
      </div>
      <div id="communityChatMessages" class="community-chat-messages" aria-live="polite"></div>
      <form id="communityChatForm" class="community-chat-form">
        <textarea name="body" maxlength="800" rows="3" required placeholder="Écris un message à toute la communauté…"></textarea>
        <button class="primary-button" type="submit">Envoyer</button>
      </form>
      <p id="communityChatStatus" class="conversation-status" aria-live="polite"></p>
    </section>`;
  document.querySelector("#mainContent")?.append(page);

  document.querySelector("#refreshCommunityChat")?.addEventListener("click", () =>
    loadPublicChat({ forceScroll: false })
  );
  document.querySelector("#communityChatLoginButton")?.addEventListener("click", () =>
    document.querySelector("#accountButton")?.click()
  );
  document.querySelector("#communityChatForm")?.addEventListener("submit", submitPublicChatMessage);
}

function renderPublicChat({ forceScroll = false } = {}) {
  const list = document.querySelector("#communityChatMessages");
  if (!list) return;
  const identity = communityMemberIdentity();
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  list.replaceChildren();

  if (!communityState.chatMessages.length) {
    list.append(createNode("div", {
      className: "conversation-empty",
      text: "Aucun message pour le moment. Lance la discussion !"
    }));
    return;
  }

  const canModerate = ["admin", "modo", "moderator"].includes(identity.member?.staffRole);
  communityState.chatMessages.forEach((message) => {
    const mine = Number(message.sender_member_id) === Number(identity.member?.id);
    const role = roleLabel(message.staff_role);
    const article = createNode("article", {
      className: `community-chat-message${mine ? " mine" : ""}${role ? " staff-message" : ""}`
    }, [
      createNode("header", {}, [
        createNode("span", {}, [
          createNode("strong", { text: message.display_name || message.username || "Membre PDD" }),
          role ? createNode("i", { className: `community-role ${message.staff_role}`, text: role }) : null
        ]),
        createNode("time", { text: formatCommunityDate(message.created_at) })
      ]),
      createNode("p", { text: message.body }),
      mine || canModerate
        ? createNode("button", {
            type: "button",
            className: "community-message-delete",
            text: "Supprimer",
            onClick: () => deletePublicChatMessage(message.id)
          })
        : null
    ]);
    list.append(article);
  });

  if (forceScroll || nearBottom) {
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }
}

async function loadPublicChat({ forceScroll = false } = {}) {
  const identity = communityMemberIdentity();
  updateCommunityAccess();
  if (!identity.token || communityState.chatLoading) return;
  communityState.chatLoading = true;
  try {
    const payload = await memberRequest("/community-chat/messages");
    communityState.chatMessages = Array.isArray(payload.messages) ? payload.messages : [];
    renderPublicChat({ forceScroll });
    setCommunityStatus("#communityChatStatus", "");
  } catch (error) {
    setCommunityStatus("#communityChatStatus", error.message, "error");
  } finally {
    communityState.chatLoading = false;
  }
}

async function submitPublicChatMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (!body) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setCommunityStatus("#communityChatStatus", "Envoi…");
  try {
    await memberRequest("/community-chat/messages", { method: "POST", body: { body } });
    form.reset();
    await loadPublicChat({ forceScroll: true });
    setCommunityStatus("#communityChatStatus", "Message envoyé.", "success");
  } catch (error) {
    setCommunityStatus("#communityChatStatus", error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function deletePublicChatMessage(id) {
  try {
    await memberRequest(`/community-chat/messages/${id}`, { method: "DELETE" });
    await loadPublicChat({ forceScroll: false });
  } catch (error) {
    setCommunityStatus("#communityChatStatus", error.message, "error");
  }
}

async function openCommunityChatPage() {
  activateCommunityPage("#page-community-chat");
  updateCommunityAccess();
  await loadPublicChat({ forceScroll: true });
}

function directPeerName(conversation) {
  return conversation.peer_display_name || conversation.peer_username || "Membre PDD";
}

function renderDirectConversationList() {
  const list = document.querySelector("#memberDirectList");
  if (!list) return;
  list.replaceChildren();

  if (!communityState.directConversations.length) {
    list.append(createNode("div", {
      className: "conversation-empty",
      text: "Aucun MP pour le moment. Choisis un membre pour commencer."
    }));
    return;
  }

  communityState.directConversations.forEach((conversation) => {
    const unread = Number(conversation.unread_count || 0);
    const role = roleLabel(conversation.peer_staff_role);
    list.append(createNode("button", {
      type: "button",
      className: `conversation-thread${unread ? " unread" : ""}${
        Number(conversation.id) === Number(communityState.activeDirectId) ? " active" : ""
      }`,
      onClick: () => openDirectConversation(conversation.id)
    }, [
      createNode("span", { className: "conversation-thread-head" }, [
        createNode("strong", { text: `${directPeerName(conversation)}${role ? ` · ${role}` : ""}` }),
        createNode("time", { text: formatCommunityDate(conversation.last_message_at || conversation.updated_at) })
      ]),
      createNode("small", { text: conversation.last_message || "Nouvelle conversation privée" }),
      unread ? createNode("i", { text: String(unread) }) : null
    ]));
  });
}

function updateDirectBadge() {
  const unread = communityState.directConversations.reduce(
    (total, conversation) => total + Number(conversation.unread_count || 0),
    0
  );
  const badge = document.querySelector("#memberDirectBadge");
  if (!badge) return;
  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread === 0);
}

function populateDirectMembers() {
  const select = document.querySelector("#memberDirectRecipient");
  if (!select) return;
  select.replaceChildren(createNode("option", { text: "Choisir un membre", value: "" }));
  communityState.directMembers.forEach((member) => {
    const role = roleLabel(member.staff_role);
    select.append(createNode("option", {
      value: String(member.id),
      text: `${member.display_name || member.username}${role ? ` · ${role}` : ""} (@${member.username})`
    }));
  });
}

async function loadDirectMessaging({ keepSelection = true } = {}) {
  const identity = communityMemberIdentity();
  if (!identity.token || communityState.directLoading) return;
  communityState.directLoading = true;
  try {
    const [membersPayload, conversationsPayload] = await Promise.all([
      memberRequest("/member-direct/members"),
      memberRequest("/member-direct/conversations")
    ]);
    communityState.directMembers = Array.isArray(membersPayload.members) ? membersPayload.members : [];
    communityState.directConversations = Array.isArray(conversationsPayload.conversations)
      ? conversationsPayload.conversations
      : [];
    if (
      !keepSelection ||
      !communityState.directConversations.some(
        (item) => Number(item.id) === Number(communityState.activeDirectId)
      )
    ) {
      communityState.activeDirectId = null;
    }
    populateDirectMembers();
    renderDirectConversationList();
    updateDirectBadge();
  } catch (error) {
    setCommunityStatus("#memberDirectStatus", error.message, "error");
  } finally {
    communityState.directLoading = false;
  }
}

function renderDirectMessages(payload) {
  const detail = document.querySelector("#memberDirectDetail");
  if (!detail) return;
  detail.replaceChildren();
  const identity = communityMemberIdentity();
  const conversation = payload.conversation;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const role = roleLabel(conversation.peer_staff_role);

  detail.append(createNode("header", { className: "conversation-detail-head" }, [
    createNode("div", {}, [
      createNode("small", { text: role || "Membre PDD" }),
      createNode("h3", { text: directPeerName(conversation) })
    ])
  ]));

  const messageList = createNode("div", { className: "conversation-messages" });
  messages.forEach((message) => {
    const mine = Number(message.sender_member_id) === Number(identity.member?.id);
    const senderRole = roleLabel(message.sender_staff_role);
    messageList.append(createNode("article", {
      className: `conversation-message ${mine ? "mine" : "theirs"}`
    }, [
      createNode("strong", {
        text: mine ? "Moi" : `${message.sender_display_name || message.sender_username}${
          senderRole ? ` · ${senderRole}` : ""
        }`
      }),
      createNode("p", { text: message.body }),
      createNode("time", { text: formatCommunityDate(message.created_at) })
    ]));
  });
  detail.append(messageList);

  const replyForm = createNode("form", { className: "conversation-reply" }, [
    createNode("textarea", {
      name: "body",
      placeholder: "Écris ton MP…",
      maxLength: 2000,
      rows: 3
    }),
    createNode("button", { type: "submit", className: "primary-button", text: "Envoyer" })
  ]);
  replyForm.addEventListener("submit", submitDirectReply);
  detail.append(replyForm);

  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

async function openDirectConversation(id) {
  communityState.activeDirectId = Number(id);
  renderDirectConversationList();
  const detail = document.querySelector("#memberDirectDetail");
  detail?.replaceChildren(createNode("div", { className: "conversation-empty", text: "Ouverture…" }));
  try {
    const payload = await memberRequest(`/member-direct/conversations/${id}`);
    renderDirectMessages(payload);
    await loadDirectMessaging({ keepSelection: true });
  } catch (error) {
    detail?.replaceChildren(createNode("div", { className: "conversation-empty", text: error.message }));
  }
}

async function submitDirectConversation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const recipientMemberId = Number(values.recipientMemberId);
  const body = String(values.body || "").trim();
  if (!recipientMemberId || !body) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setCommunityStatus("#memberDirectStatus", "Envoi du MP…");
  try {
    const payload = await memberRequest("/member-direct/conversations", {
      method: "POST",
      body: { recipientMemberId, body }
    });
    form.reset();
    setCommunityStatus("#memberDirectStatus", "MP envoyé.", "success");
    await loadDirectMessaging({ keepSelection: false });
    await openDirectConversation(payload.conversationId);
  } catch (error) {
    setCommunityStatus("#memberDirectStatus", error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function submitDirectReply(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (!body || !communityState.activeDirectId) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await memberRequest(`/member-direct/conversations/${communityState.activeDirectId}/messages`, {
      method: "POST",
      body: { body }
    });
    form.reset();
    await openDirectConversation(communityState.activeDirectId);
  } catch (error) {
    setCommunityStatus("#memberDirectStatus", error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function setInboxTab(tab) {
  communityState.inboxTab = tab;
  const page = document.querySelector("#page-conversations");
  if (!page) return;
  page.querySelector(".conversation-compose")?.classList.toggle("hidden", tab !== "support");
  page.querySelector(".conversation-layout")?.classList.toggle("hidden", tab !== "support");
  page.querySelector("#memberDirectPanel")?.classList.toggle("hidden", tab !== "direct");
  page.querySelector("#supportConversationTab")?.classList.toggle("active", tab === "support");
  page.querySelector("#memberDirectTab")?.classList.toggle("active", tab === "direct");
  if (tab === "direct") loadDirectMessaging({ keepSelection: true });
}

function enhanceConversationInterface() {
  const page = document.querySelector("#page-conversations");
  if (!page || page.dataset.communityMessagingEnhanced === "true") return Boolean(page);
  page.dataset.communityMessagingEnhanced = "true";
  const heading = page.querySelector(".conversation-heading");
  const tabs = createNode("div", { className: "conversation-mode-tabs" }, [
    createNode("button", {
      id: "supportConversationTab",
      className: "active",
      type: "button",
      text: "Discussion avec le staff",
      onClick: () => setInboxTab("support")
    }),
    createNode("button", {
      id: "memberDirectTab",
      type: "button",
      onClick: () => setInboxTab("direct")
    }, [
      document.createTextNode("MP membres"),
      createNode("b", { id: "memberDirectBadge", className: "hidden", text: "0" })
    ])
  ]);
  heading?.after(tabs);

  const panel = createNode("section", { id: "memberDirectPanel", className: "member-direct-panel hidden" });
  panel.innerHTML = `
    <article class="conversation-compose card member-direct-compose">
      <div>
        <p class="eyebrow">Entre membres</p>
        <h3>Nouveau message privé</h3>
      </div>
      <form id="memberDirectComposeForm">
        <label>
          Destinataire
          <select id="memberDirectRecipient" name="recipientMemberId" required></select>
        </label>
        <label>
          Message
          <textarea name="body" minlength="1" maxlength="2000" rows="4" required placeholder="Écris ton MP…"></textarea>
        </label>
        <button class="primary-button" type="submit">Envoyer le MP</button>
        <p id="memberDirectStatus" class="conversation-status" aria-live="polite"></p>
      </form>
    </article>
    <div class="conversation-layout member-direct-layout">
      <aside id="memberDirectList" class="conversation-list"></aside>
      <section id="memberDirectDetail" class="conversation-detail">
        <div class="conversation-empty">Sélectionne un MP pour afficher les messages.</div>
      </section>
    </div>`;
  page.append(panel);
  document.querySelector("#memberDirectComposeForm")?.addEventListener("submit", submitDirectConversation);
  updateCommunityAccess();
  return true;
}

function watchCommunityIdentity() {
  const member = communityMemberIdentity();
  const staff = communityStaffIdentity();
  const identity = `${member.token}:${member.member?.id || ""}:${staff.token}:${staff.user?.id || ""}`;
  if (identity === communityState.lastIdentity) return;
  communityState.lastIdentity = identity;
  updateCommunityAccess();
  if (member.token && member.member) {
    loadDirectMessaging({ keepSelection: true });
    if (document.querySelector("#page-community-chat")?.classList.contains("active")) {
      loadPublicChat({ forceScroll: false });
    }
  } else {
    communityState.chatMessages = [];
    communityState.directMembers = [];
    communityState.directConversations = [];
    renderPublicChat();
    renderDirectConversationList();
    updateDirectBadge();
  }
}

buildPublicChatInterface();
enhanceConversationInterface();
updateCommunityAccess();
watchCommunityIdentity();

window.setInterval(() => {
  if (!enhanceConversationInterface()) return;
  updateCommunityAccess();
}, 1_000);

window.setInterval(watchCommunityIdentity, 1_000);
window.setInterval(() => {
  const chatVisible = document.querySelector("#page-community-chat")?.classList.contains("active");
  if (chatVisible && document.visibilityState === "visible") {
    loadPublicChat({ forceScroll: false });
  }
}, 5_000);
window.setInterval(() => {
  const directVisible = communityState.inboxTab === "direct" &&
    document.querySelector("#page-conversations")?.classList.contains("active");
  if (directVisible && document.visibilityState === "visible") {
    loadDirectMessaging({ keepSelection: true });
  }
}, 12_000);
