import { LocalNotifications } from "@capacitor/local-notifications";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const storedStaff = JSON.parse(sessionStorage.getItem("pixel-user") || "null");
const storedMember = JSON.parse(localStorage.getItem("pixel-member") || "null");

const state = {
  token: sessionStorage.getItem("pixel-token") || "",
  user: storedStaff,
  memberToken: localStorage.getItem("pixel-member-token") || "",
  member: storedMember,
  memberMessages: [],
  memberApplications: [],
  unreadCount: 0,
  points: Number(storedStaff?.points ?? storedMember?.points ?? 0),
  memberRating: null,
  applications: [],
  activeApplication: null,
  pet: JSON.parse(localStorage.getItem("pixel-pet") || "null")
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const asArray = (value) => (Array.isArray(value) ? value : []);

const startupAnimation = $("#startupAnimation");
let startupTimer;
let serverAvailable = null;
let serverCheckRunning = false;
const serverStatusDialog = $("#serverStatusDialog");

function finishStartupAnimation() {
  if (!startupAnimation || startupAnimation.classList.contains("leaving")) return;
  window.clearTimeout(startupTimer);
  startupAnimation.classList.add("leaving");
  document.body.classList.remove("startup-running");
  window.setTimeout(() => {
    startupAnimation.hidden = true;
  }, 520);
}

if (startupAnimation) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  startupTimer = window.setTimeout(finishStartupAnimation, reducedMotion ? 1600 : 10400);
  $("#skipStartup").addEventListener("click", finishStartupAnimation);
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  });
  children.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(`${date}${date.endsWith("Z") || date.includes("+") ? "" : "Z"}`));
}

function setFormStatus(node, message, type = "") {
  node.textContent = message;
  node.className = `form-status ${type}`.trim();
}

let toastTimer;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
}

function serverCheckTime() {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function showServerClosedDialog() {
  $("#serverStatusIcon").textContent = "!";
  $("#serverStatusIcon").className = "server-status-icon offline";
  $("#serverStatusEyebrow").textContent = "Connexion impossible";
  $("#serverStatusTitle").textContent = "Les serveurs sont fermés";
  $("#serverStatusMessage").textContent =
    "Pixel Everywhere ne peut pas joindre le serveur PDD. Les annonces, candidatures, comptes et messageries sont temporairement indisponibles. Vérifie que Termux, npm start et le tunnel ngrok sont actifs.";
  $("#retryServerButton").classList.remove("hidden");
  $("#closeServerStatus").classList.add("hidden");
  $("#serverLastCheck").textContent = `Dernière vérification : ${serverCheckTime()}`;
  if (!serverStatusDialog.open) serverStatusDialog.showModal();
}

function showServerReopenedDialog() {
  $("#serverStatusIcon").textContent = "✓";
  $("#serverStatusIcon").className = "server-status-icon online";
  $("#serverStatusEyebrow").textContent = "Connexion rétablie";
  $("#serverStatusTitle").textContent = "Les serveurs sont de nouveau ouverts";
  $("#serverStatusMessage").textContent =
    "La connexion à Pixel Difficult Drawer est rétablie. Toutes les fonctionnalités en ligne sont de nouveau disponibles.";
  $("#retryServerButton").classList.add("hidden");
  $("#closeServerStatus").classList.remove("hidden");
  $("#serverLastCheck").textContent = `Serveur retrouvé à ${serverCheckTime()}`;
  if (!serverStatusDialog.open) serverStatusDialog.showModal();
}

async function checkServerAvailability({ manual = false } = {}) {
  if (serverCheckRunning) return;
  serverCheckRunning = true;
  const retryButton = $("#retryServerButton");
  if (manual) {
    retryButton.disabled = true;
    retryButton.textContent = "Vérification…";
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  try {
    const headers = {};
    if (apiBase.includes(".ngrok-free.")) {
      headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
    }
    const response = await fetch(`${apiBase}/health`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Serveur indisponible");
    const wasOffline = serverAvailable === false;
    serverAvailable = true;
    if (wasOffline) showServerReopenedDialog();
    else if (serverStatusDialog.open && !$("#closeServerStatus").classList.contains("hidden")) {
      serverStatusDialog.close();
    }
  } catch {
    serverAvailable = false;
    showServerClosedDialog();
  } finally {
    window.clearTimeout(timeout);
    serverCheckRunning = false;
    retryButton.disabled = false;
    retryButton.textContent = "Réessayer maintenant";
  }
}

$("#retryServerButton").addEventListener("click", () =>
  checkServerAvailability({ manual: true })
);
$("#closeServerStatus").addEventListener("click", () => serverStatusDialog.close());

async function api(path, options = {}) {
  const { auth = "staff", ...fetchOptions } = options;
  const headers = { ...(options.headers || {}) };
  if (apiBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = auth === "member" ? state.memberToken : auth === "none" ? "" : state.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...fetchOptions, headers });
  } catch {
    throw new Error(
      "Serveur Pixel Everywhere inaccessible. Vérifie que Termux est ouvert et que npm start fonctionne."
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Une erreur est survenue.");
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  state.points = Number(user.points || 0);
  sessionStorage.setItem("pixel-token", token);
  sessionStorage.setItem("pixel-user", JSON.stringify(user));
  updateAccountButton();
  updateAccountDialog();
  updateMemberAccess();
  beginActiveSession();
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.applications = [];
  state.points = Number(state.member?.points || 0);
  sessionStorage.removeItem("pixel-token");
  sessionStorage.removeItem("pixel-user");
  updateAccountButton();
  updateAccountDialog();
  updateMemberAccess();
  if (state.member) beginActiveSession();
}

function saveMemberSession(token, member) {
  state.memberToken = token;
  state.member = member;
  if (!state.user) state.points = Number(member.points || 0);
  localStorage.setItem("pixel-member-token", token);
  localStorage.setItem("pixel-member", JSON.stringify(member));
  updateAccountButton();
  updateAccountDialog();
  updateMemberAccess();
  loadMemberInbox({ notify: false });
  beginActiveSession();
}

function clearMemberSession() {
  state.memberToken = "";
  state.member = null;
  state.memberMessages = [];
  state.memberApplications = [];
  state.unreadCount = 0;
  state.points = Number(state.user?.points || 0);
  localStorage.removeItem("pixel-member-token");
  localStorage.removeItem("pixel-member");
  updateAccountButton();
  updateAccountDialog();
  updateMemberAccess();
  if ($("#afkDialog").open) $("#afkDialog").close();
}

function updateAccountButton() {
  const button = $("#accountButton");
  button.innerHTML = "";
  const label = state.user?.username || state.member?.displayName || "Compte";
  button.append(
    element("span", { text: state.user || state.member ? "●" : "○", "aria-hidden": "true" }),
    document.createTextNode(label)
  );
}

function updateMemberAccess() {
  $("#memberInboxButton").classList.toggle("hidden", !state.member);
  $("#pointsButton").classList.toggle("hidden", !state.member && !state.user);
  $("#pointsBalance").textContent = String(state.points);
  const memberPoints = Number(state.member?.points || 0);
  const staffPoints = Number(state.user?.points || 0);
  $("#memberPointsBalance").textContent =
    `${memberPoints} pièce${memberPoints > 1 ? "s" : ""}`;
  $("#staffPointsBalance").textContent =
    `${staffPoints} pièce${staffPoints > 1 ? "s" : ""}`;
  const badge = $("#inboxBadge");
  badge.textContent = String(state.unreadCount);
  badge.classList.toggle("hidden", !state.member || state.unreadCount === 0);
}

function setMemberPoints(points) {
  const nextPoints = Math.max(0, Number(points || 0));
  if (state.member) {
    state.member.points = nextPoints;
    localStorage.setItem("pixel-member", JSON.stringify(state.member));
  }
  if (!state.user) state.points = nextPoints;
  updateMemberAccess();
}

function setStaffPoints(points) {
  const nextPoints = Math.max(0, Number(points || 0));
  if (state.user) {
    state.user.points = nextPoints;
    sessionStorage.setItem("pixel-user", JSON.stringify(state.user));
  }
  state.points = nextPoints;
  updateMemberAccess();
}

function petAccountKind() {
  if (state.user && state.token) return "staff";
  if (state.member && state.memberToken) return "member";
  return null;
}

function setPetAccountPoints(points) {
  if (petAccountKind() === "staff") setStaffPoints(points);
  else setMemberPoints(points);
}

function navigate(page) {
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".bottom-nav button").forEach((button) =>
    button.classList.toggle("active", button.dataset.pageTarget === page)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "announcements") loadAnnouncements();
  if (page === "pixel") renderPet();
  if (page === "application") prepareApplicationPage();
  if (page === "member-inbox") loadMemberInbox({ markVisible: true });
  if (page === "rating") loadRatingPage();
  if (page === "staff") openStaffWorkspace();
}

$$("[data-page-target]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.pageTarget));
});

async function loadAnnouncements() {
  const list = $("#announcementsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement des annonces…" }));

  try {
    const data = await api("/announcements");
    if (!data.configured) {
      list.replaceChildren(
        element("div", {
          className: "empty-state",
          text: "Le bot Discord n’est pas encore connecté au salon d’annonces."
        })
      );
      return;
    }
    const announcements = asArray(data.announcements);
    if (!announcements.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Aucune annonce pour le moment." })
      );
      return;
    }
    list.replaceChildren(...announcements.map(renderAnnouncement));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderAnnouncement(announcement) {
  const fallbackAvatar = element("div", { className: "mini-avatar" });
  const avatar = announcement.author.avatarUrl
    ? element("img", { src: announcement.author.avatarUrl, alt: "" })
    : fallbackAvatar;
  const author = element("div", { className: "announcement-author" }, [
    avatar,
    element("strong", { text: announcement.author.username })
  ]);
  const head = element("div", { className: "announcement-head" }, [
    author,
    element("time", { text: formatDate(announcement.createdAt) })
  ]);
  const card = element("article", { className: "announcement-card" }, [head]);
  if (announcement.content) {
    card.append(element("p", { className: "announcement-content", text: announcement.content }));
  }
  asArray(announcement.embeds).forEach((embed) => {
    const body = [embed.title, embed.description].filter(Boolean).join("\n");
    if (body) card.append(element("p", { className: "announcement-content", text: body }));
  });
  asArray(announcement.attachments)
    .filter((attachment) => attachment.contentType.startsWith("image/"))
    .forEach((attachment) => {
      card.append(
        element("img", {
          className: "announcement-image",
          src: attachment.url,
          alt: attachment.filename,
          loading: "lazy"
        })
      );
    });
  return card;
}

$("#refreshAnnouncements").addEventListener("click", loadAnnouncements);

$("#applicationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const status = $("#applicationStatus");
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Envoi en cours…");
  try {
    const result = await api("/applications", {
      method: "POST",
      auth: "member",
      body: JSON.stringify(values)
    });
    form.reset();
    setFormStatus(status, result.message, "success");
    await prepareApplicationPage();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

async function prepareApplicationPage() {
  const gate = $("#applicationMemberGate");
  const form = $("#applicationForm");
  const summary = $("#memberApplicationSummary");
  gate.classList.toggle("hidden", Boolean(state.member));
  form.classList.toggle("hidden", !state.member);
  summary.classList.add("hidden");
  summary.replaceChildren();
  if (!state.member) return;

  try {
    const data = await api("/members/applications", { auth: "member" });
    state.memberApplications = data.applications;
    const active = data.applications.find((application) =>
      ["pending", "reviewing"].includes(application.status)
    );
    const latest = data.applications[0];
    if (latest) {
      summary.classList.remove("hidden");
      summary.replaceChildren(
        element("span", {
          className: `status-pill status-${latest.status}`,
          text: statusLabels[latest.status]
        }),
        element("div", {}, [
          element("strong", { text: `Candidature ${statusLabels[latest.status].toLowerCase()}` }),
          element("small", { text: `Envoyée le ${formatDate(latest.created_at)}` })
        ])
      );
    }
    form.classList.toggle("hidden", Boolean(active));
  } catch (error) {
    setFormStatus($("#applicationStatus"), error.message, "error");
  }
}

const loginDialog = $("#loginDialog");
$("#accountButton").addEventListener("click", () => {
  updateAccountDialog();
  loginDialog.showModal();
});
$("#memberInboxButton").addEventListener("click", () => navigate("member-inbox"));
$("#pointsButton").addEventListener("click", () => {
  selectAccountTab(state.user ? "staff" : "member");
  updateAccountDialog();
  loginDialog.showModal();
});
$("#closeLogin").addEventListener("click", () => loginDialog.close());

function selectAccountTab(tab) {
  $$("[data-account-tab]").forEach((button) =>
    button.classList.toggle("active", button.dataset.accountTab === tab)
  );
  $$(".account-panel").forEach((panel) =>
    panel.classList.toggle("active", panel.id === `account-${tab}`)
  );
}

$$("[data-account-tab]").forEach((button) => {
  button.addEventListener("click", () => selectAccountTab(button.dataset.accountTab));
});

function updateAccountDialog() {
  $("#memberSignedIn").classList.toggle("hidden", !state.member);
  $("#memberGuest").classList.toggle("hidden", Boolean(state.member));
  $("#memberIdentity").textContent = state.member
    ? `${state.member.displayName} (@${state.member.username})`
    : "";
  $("#staffSignedIn").classList.toggle("hidden", !state.user);
  $("#loginForm").classList.toggle("hidden", Boolean(state.user));
  $("#staffDialogIdentity").textContent = state.user
    ? `${state.user.username} • ${state.user.role === "admin" ? "Administrateur" : "Modérateur"}`
    : "";
  const staffPoints = Number(state.user?.points || 0);
  $("#staffPointsBalance").textContent =
    `${staffPoints} pièce${staffPoints > 1 ? "s" : ""}`;
  $("#notificationStatus").textContent =
    localStorage.getItem("pixel-notifications-enabled") === "true"
      ? "Notifications activées sur cet appareil."
      : "Active-les pour être averti quand l’application est ouverte.";
}

$$("[data-member-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.memberMode;
    $$("[data-member-mode]").forEach((item) => item.classList.toggle("active", item === button));
    $("#memberLoginForm").classList.toggle("active", mode === "login");
    $("#memberRegisterForm").classList.toggle("active", mode === "register");
  });
});

async function submitMemberForm(event, path, successMessage) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Connexion…");
  try {
    const result = await api(path, {
      method: "POST",
      auth: "none",
      body: JSON.stringify(values)
    });
    if (!result.token || !result.member) {
      throw new Error("Le serveur n’a pas renvoyé une session membre valide.");
    }
    saveMemberSession(result.token, result.member);
    form.reset();
    setFormStatus(status, "");
    toast(successMessage);
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
}

$("#memberLoginForm").addEventListener("submit", (event) =>
  submitMemberForm(event, "/members/login", "Connexion membre réussie.")
);
$("#memberRegisterForm").addEventListener("submit", (event) =>
  submitMemberForm(event, "/members/register", "Ton compte membre a été créé.")
);
$("#memberLogoutButton").addEventListener("click", () => {
  clearMemberSession();
  toast("Compte membre déconnecté.");
});
$("#openMemberAccountButton").addEventListener("click", () => {
  selectAccountTab("member");
  updateAccountDialog();
  loginDialog.showModal();
});
$("#openMemberInboxButton").addEventListener("click", () => {
  loginDialog.close();
  navigate("member-inbox");
});
const bugReportDialog = $("#bugReportDialog");
const xpConversionDialog = $("#xpConversionDialog");
$("#openBugReportButton").addEventListener("click", () => {
  loginDialog.close();
  $("#bugReportForm").reset();
  setFormStatus($(".form-status", $("#bugReportForm")), "");
  bugReportDialog.showModal();
});
$("#closeBugReport").addEventListener("click", () => bugReportDialog.close());
$("#openXpConversionButton").addEventListener("click", () => {
  loginDialog.close();
  $("#xpConversionForm").reset();
  $("#xpPointsAmount").max = String(Math.max(1, Number(state.member?.points || 0)));
  $("#xpConversionPreview").textContent = "1 pièce = 15 XP";
  setFormStatus($(".form-status", $("#xpConversionForm")), "");
  xpConversionDialog.showModal();
});
$("#closeXpConversion").addEventListener("click", () => xpConversionDialog.close());
$("#xpPointsAmount").addEventListener("input", (event) => {
  const points = Math.max(0, Number(event.currentTarget.value || 0));
  $("#xpConversionPreview").textContent =
    `${points} pièce${points > 1 ? "s" : ""} = ${(points * 15).toLocaleString("fr-FR")} XP PDD`;
});

$("#bugReportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  button.disabled = true;
  setFormStatus(status, "Transmission à tout le staff…");
  try {
    const result = await api("/members/bug-reports", {
      method: "POST",
      auth: "member",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    setFormStatus(status, result.message, "success");
    window.setTimeout(() => bugReportDialog.close(), 1100);
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("#xpConversionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  button.disabled = true;
  setFormStatus(status, "Envoi de la demande…");
  try {
    const result = await api("/members/xp-conversions", {
      method: "POST",
      auth: "member",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    setMemberPoints(result.points);
    form.reset();
    setFormStatus(
      status,
      `${result.pointsSpent} pièces réservées pour ${result.xpAmount.toLocaleString("fr-FR")} XP.`,
      "success"
    );
    window.setTimeout(() => xpConversionDialog.close(), 1300);
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});
$("#openStaffButton").addEventListener("click", () => {
  loginDialog.close();
  navigate("staff");
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Connexion…");
  try {
    const result = await api("/auth/login", {
      method: "POST",
      auth: "none",
      body: JSON.stringify(values)
    });
    if (!result.token || !result.user) {
      throw new Error("Le serveur n’a pas renvoyé une session valide.");
    }
    saveSession(result.token, result.user);
    form.reset();
    setFormStatus(status, "");
    updateAccountDialog();
    loginDialog.close();
    navigate("staff");
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("#logoutButton").addEventListener("click", () => {
  clearSession();
  navigate("home");
  toast("Session staff déconnectée.");
});

async function openStaffWorkspace() {
  if (!state.token || !state.user) {
    navigate("home");
    loginDialog.showModal();
    return;
  }
  try {
    const data = await api("/auth/me");
    state.user = data.user;
    state.points = Number(data.user?.points || 0);
    sessionStorage.setItem("pixel-user", JSON.stringify(data.user));
    updateMemberAccess();
  } catch {
    clearSession();
    navigate("home");
    selectAccountTab("staff");
    loginDialog.showModal();
    return;
  }

  $("#staffIdentity").textContent =
    `${state.user.username} • ${state.user.role === "admin" ? "Administrateur" : "Modérateur"}`;
  $("#passwordChangePanel").classList.toggle("hidden", !state.user.mustChangePassword);
  $("#staffWorkspace").classList.toggle("hidden", state.user.mustChangePassword);
  $("#accountsTabButton").classList.toggle("hidden", !state.user.isOwnerAdmin);

  if (!state.user.mustChangePassword) loadApplications();
}

$("#passwordChangeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    const result = await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(values)
    });
    saveSession(result.token, result.user);
    form.reset();
    setFormStatus(status, "Mot de passe modifié.", "success");
    await openStaffWorkspace();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$$("[data-staff-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.staffTab;
    $$(".staff-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    $$(".staff-panel").forEach((panel) =>
      panel.classList.toggle("active", panel.id === `staff-${tab}`)
    );
    if (tab === "applications") loadApplications();
    if (tab === "messages") loadMessages();
    if (tab === "ratings") loadStaffRatings();
    if (tab === "accounts") loadAccounts();
  });
});

const statusLabels = {
  pending: "En attente",
  reviewing: "En examen",
  accepted: "Acceptée",
  rejected: "Refusée"
};

function notificationStorageKey() {
  return `pixel-last-notified-message-${state.member?.id || "guest"}`;
}

async function enableMemberNotifications() {
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") {
      throw new Error("Autorisation de notification refusée.");
    }
    localStorage.setItem("pixel-notifications-enabled", "true");
    updateAccountDialog();
    toast("Notifications activées.");
    await loadMemberInbox({ notify: true });
  } catch (error) {
    toast(error.message || "Notifications indisponibles sur cet appareil.");
  }
}

$("#enableNotificationsButton").addEventListener("click", enableMemberNotifications);
$("#refreshMemberInbox").addEventListener("click", () => loadMemberInbox({ notify: false }));

async function notifyForNewMemberMail(messages) {
  messages = asArray(messages);
  if (
    !state.member ||
    localStorage.getItem("pixel-notifications-enabled") !== "true" ||
    !messages.length
  ) {
    return;
  }
  const storageKey = notificationStorageKey();
  const lastNotified = Number(localStorage.getItem(storageKey) || 0);
  const newMessages = messages.filter(
    (message) => !message.read_at && Number(message.id) > lastNotified
  );
  if (!newMessages.length) return;

  try {
    await LocalNotifications.schedule({
      notifications: newMessages.slice(0, 5).map((message) => ({
        id: 100000 + Number(message.id),
        title: message.sender_name,
        body: message.subject,
        schedule: { at: new Date(Date.now() + 500) },
        extra: { page: "member-inbox", messageId: message.id }
      }))
    });
    localStorage.setItem(storageKey, String(Math.max(...newMessages.map((message) => message.id))));
  } catch {
    // La boîte membre reste la source fiable si les notifications sont indisponibles.
  }
}

function renderMemberMessage(message) {
  const card = element(
    "article",
    {
      className: `member-mail ${message.read_at ? "" : "unread"}`.trim()
    },
    [
      element("div", { className: "member-mail-sender" }, [
        element("img", { src: message.sender_logo, alt: "Logo PDD" }),
        element("div", {}, [
          element("strong", { text: message.sender_name }),
          element("time", { text: formatDate(message.created_at) })
        ]),
        message.read_at ? null : element("span", { className: "unread-dot", title: "Non lu" })
      ]),
      element("h3", { text: message.subject }),
      element("p", { text: message.body })
    ]
  );
  if (!message.read_at) {
    let markingRead = false;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const markRead = async () => {
      if (markingRead) return;
      markingRead = true;
      try {
        await api(`/members/inbox/${message.id}/read`, {
          method: "PATCH",
          auth: "member"
        });
        message.read_at = new Date().toISOString();
        card.classList.remove("unread");
        $(".unread-dot", card)?.remove();
        card.removeAttribute("role");
        card.removeAttribute("tabindex");
        state.unreadCount = Math.max(0, state.unreadCount - 1);
        updateMemberAccess();
      } catch (error) {
        markingRead = false;
        toast(error.message);
      }
    };
    card.addEventListener("click", markRead, { once: true });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") markRead();
    }, { once: true });
  }
  return card;
}

async function loadMemberInbox({ notify = true } = {}) {
  const list = $("#memberInboxList");
  if (!state.member || !state.memberToken) {
    state.unreadCount = 0;
    updateMemberAccess();
    list.replaceChildren(
      element("div", {
        className: "empty-state",
        text: "Connecte-toi avec un compte membre pour ouvrir cette messagerie."
      })
    );
    return;
  }

  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement des messages…" }));
  try {
    const data = await api("/members/inbox", { auth: "member" });
    const messages = asArray(data.messages);
    state.memberMessages = messages;
    state.unreadCount = Number(data.unreadCount || 0);
    setMemberPoints(data.points);
    if (!messages.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Tu n’as reçu aucun message pour le moment." })
      );
    } else {
      list.replaceChildren(...messages.map(renderMemberMessage));
    }
    if (notify) await notifyForNewMemberMail(messages);
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function starText(value) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

async function loadRatingPage() {
  const gate = $("#ratingMemberGate");
  const form = $("#ratingForm");
  gate.classList.toggle("hidden", Boolean(state.member));
  form.classList.toggle("hidden", !state.member);

  try {
    const summary = await api("/ratings/summary", { auth: "none" });
    $("#publicRatingStars").textContent = starText(summary.average);
    $("#publicRatingAverage").textContent = summary.count
      ? `${Number(summary.average).toLocaleString("fr-FR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 2
        })} / 5`
      : "Aucune note";
    $("#publicRatingCount").textContent = summary.count
      ? `${summary.count} avis membre${summary.count > 1 ? "s" : ""}`
      : "Sois le premier à donner ton avis.";
  } catch (error) {
    $("#publicRatingCount").textContent = error.message;
  }

  if (!state.member) return;
  try {
    const data = await api("/members/rating", { auth: "member" });
    state.memberRating = data.rating;
    form.reset();
    if (data.rating) {
      const radio = $(`input[name="stars"][value="${data.rating.stars}"]`, form);
      if (radio) radio.checked = true;
      $("textarea[name='comment']", form).value = data.rating.comment;
      $("button[type='submit']", form).textContent = "Mettre à jour mon avis";
      setFormStatus($("#ratingStatus"), "Tu peux modifier ton évaluation à tout moment.");
    } else {
      $("button[type='submit']", form).textContent = "Enregistrer mon avis";
      setFormStatus($("#ratingStatus"), "");
    }
  } catch (error) {
    setFormStatus($("#ratingStatus"), error.message, "error");
  }
}

$("#refreshRating").addEventListener("click", loadRatingPage);
$("#ratingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const status = $("#ratingStatus");
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Enregistrement de ton avis…");
  try {
    const result = await api("/members/rating", {
      method: "PUT",
      auth: "member",
      body: JSON.stringify(values)
    });
    state.memberRating = result.rating;
    setFormStatus(status, result.message, "success");
    button.textContent = "Mettre à jour mon avis";
    await loadRatingPage();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

async function loadApplications() {
  const list = $("#staffApplicationsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/staff/applications");
    state.applications = asArray(data.applications);
    if (!state.applications.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Aucune candidature reçue." })
      );
      return;
    }
    list.replaceChildren(...state.applications.map(renderApplicationCard));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderApplicationCard(application) {
  const pill = element("span", {
    className: `status-pill status-${application.status}`,
    text: statusLabels[application.status]
  });
  const head = element("div", { className: "application-head" }, [
    element("strong", { text: application.discord_username }),
    pill
  ]);
  const card = element(
    "article",
    {
      className: "application-card",
      onclick: () => openApplication(application)
    },
    [
      head,
      element("p", { text: `${application.real_name} • ${application.age} ans • ${application.desired_role}` }),
      element("time", { text: formatDate(application.created_at) })
    ]
  );
  return card;
}

const applicationDialog = $("#applicationDialog");
$("#closeApplication").addEventListener("click", () => applicationDialog.close());
const acceptApplicationDialog = $("#acceptApplicationDialog");
$("#closeAcceptApplication").addEventListener("click", () => acceptApplicationDialog.close());
const rejectApplicationDialog = $("#rejectApplicationDialog");
$("#closeRejectApplication").addEventListener("click", () => rejectApplicationDialog.close());

async function openApplication(application) {
  state.activeApplication = application;
  const content = $("#applicationDetailContent");
  content.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  applicationDialog.showModal();
  try {
    const data = await api(`/staff/applications/${application.id}/notes`);
    renderApplicationDetail(application, data.notes);
  } catch (error) {
    content.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function field(label, value) {
  return element("div", { className: "application-field" }, [
    element("small", { text: label }),
    element("div", { text: String(value) })
  ]);
}

function renderApplicationDetail(application, notes) {
  notes = asArray(notes);
  const content = $("#applicationDetailContent");
  const statusSelect = element("select");
  Object.entries(statusLabels).forEach(([value, label]) => {
    if (
      ["accepted", "rejected"].includes(value) &&
      application.status !== value
    ) return;
    const option = element("option", { value, text: label });
    option.selected = value === application.status;
    statusSelect.append(option);
  });
  statusSelect.disabled = ["accepted", "rejected"].includes(application.status);
  statusSelect.addEventListener("change", async () => {
    try {
      await api(`/staff/applications/${application.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusSelect.value })
      });
      application.status = statusSelect.value;
      toast("Statut mis à jour.");
      loadApplications();
    } catch (error) {
      toast(error.message);
    }
  });

  const notesList = element("div", { className: "note-list" });
  if (!notes.length) {
    notesList.append(element("p", { className: "form-status", text: "Aucune note interne." }));
  } else {
    notes.forEach((note) => {
      notesList.append(
        element("article", { className: "note-card" }, [
          element("strong", { text: note.username }),
          element("time", { text: formatDate(note.created_at) }),
          element("p", { text: note.body })
        ])
      );
    });
  }

  const noteInput = element("input", { placeholder: "Ajouter une note privée…", maxlength: "2000" });
  const noteButton = element("button", { type: "button", text: "Ajouter" });
  noteButton.addEventListener("click", async () => {
    if (!noteInput.value.trim()) return;
    noteButton.disabled = true;
    try {
      await api(`/staff/applications/${application.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteInput.value })
      });
      await openApplication(application);
    } catch (error) {
      toast(error.message);
    } finally {
      noteButton.disabled = false;
    }
  });

  let acceptButton;
  if (
    state.user?.role === "admin" &&
    !["accepted", "rejected"].includes(application.status) &&
    application.member_id
  ) {
    acceptButton = element("button", {
      type: "button",
      className: "primary-button acceptance-button",
      text: "Accepter et créer le compte modérateur"
    });
    acceptButton.addEventListener("click", () => {
      state.activeApplication = application;
      $("#acceptApplicationRecipient").textContent =
        `Destinataire : ${application.member_display_name} (@${application.member_username}).`;
      $("#acceptApplicationForm").reset();
      setFormStatus($(".form-status", $("#acceptApplicationForm")), "");
      acceptApplicationDialog.showModal();
    });
  }

  let rejectButton;
  if (
    state.user?.role === "admin" &&
    !["accepted", "rejected"].includes(application.status) &&
    application.member_id
  ) {
    rejectButton = element("button", {
      type: "button",
      className: "danger-button rejection-button",
      text: "Refuser et prévenir le candidat"
    });
    rejectButton.addEventListener("click", () => {
      state.activeApplication = application;
      $("#rejectApplicationRecipient").textContent =
        `Destinataire : ${application.member_display_name} (@${application.member_username}).`;
      $("#rejectApplicationPreview").textContent =
        `La candidature sera refusée au nom de ${state.user.username}. Le membre recevra immédiatement la décision dans sa messagerie privée.`;
      setFormStatus($(".form-status", $("#rejectApplicationForm")), "");
      rejectApplicationDialog.showModal();
    });
  }

  content.replaceChildren(
    element("p", { className: "eyebrow", text: "Candidature privée" }),
    element("h2", { text: application.discord_username }),
    element("div", { className: "application-fields" }, [
      field("Prénom", application.real_name),
      field("Âge", `${application.age} ans`),
      field("Rôle souhaité", application.desired_role),
      field("Pseudo Discord", application.discord_username),
      field(
        "Compte membre",
        application.member_username
          ? `${application.member_display_name} (@${application.member_username})`
          : "Ancienne candidature sans compte membre"
      ),
      field("Motivation", application.motivation),
      field("Reçue le", formatDate(application.created_at))
    ]),
    element("label", {}, [document.createTextNode("Statut"), statusSelect]),
    element("div", { className: "decision-actions" }, [acceptButton, rejectButton]),
    element("h3", { text: "Notes du staff" }),
    notesList,
    element("div", { className: "application-actions" }, [noteInput, noteButton])
  );
}

$("#acceptApplicationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const application = state.activeApplication;
  if (!application) return;
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Création sécurisée du compte…");
  try {
    await api(`/admin/applications/${application.id}/accept`, {
      method: "POST",
      body: JSON.stringify(values)
    });
    application.status = "accepted";
    form.reset();
    acceptApplicationDialog.close();
    applicationDialog.close();
    toast("Candidature acceptée et identifiants envoyés au membre.");
    await loadApplications();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("#rejectApplicationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const application = state.activeApplication;
  if (!application) return;
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  button.disabled = true;
  setFormStatus(status, "Envoi de la décision au candidat…");
  try {
    await api(`/admin/applications/${application.id}/reject`, {
      method: "POST",
      body: JSON.stringify({})
    });
    application.status = "rejected";
    rejectApplicationDialog.close();
    applicationDialog.close();
    toast("Candidature refusée et candidat prévenu.");
    await loadApplications();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

async function loadMessages() {
  loadStaffAlerts();
  const list = $("#staffMessagesList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/staff/messages");
    const messages = asArray(data.messages);
    if (!messages.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "La messagerie est vide." })
      );
      return;
    }
    list.replaceChildren(
      ...messages.map((message) =>
        element("article", { className: "message-card" }, [
          element("strong", {
            text: `${message.username}${message.role === "admin" ? " • Admin" : ""}`
          }),
          element("time", { text: formatDate(message.created_at) }),
          element("p", { text: message.body })
        ])
      )
    );
    list.scrollTop = list.scrollHeight;
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

async function loadStaffAlerts() {
  const list = $("#staffAlertsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement des demandes…" }));
  try {
    const data = await api("/staff/alerts");
    const alerts = asArray(data.alerts);
    if (!alerts.length) {
      list.replaceChildren(
        element("div", { className: "empty-state compact", text: "Aucune demande membre." })
      );
      return;
    }
    list.replaceChildren(...alerts.map(renderStaffAlert));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state compact", text: error.message }));
  }
}

async function loadStaffRatings() {
  const list = $("#staffRatingsList");
  list.replaceChildren(element("div", {
    className: "loading-card",
    text: "Chargement des évaluations…"
  }));
  try {
    const data = await api("/staff/ratings");
    const ratings = asArray(data.ratings);
    const count = Number(data.count || ratings.length);
    $("#staffRatingAverage").textContent = count
      ? `${Number(data.average).toLocaleString("fr-FR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 2
        })} / 5`
      : "— / 5";
    $("#staffRatingStars").textContent = starText(data.average);
    $("#staffRatingCount").textContent =
      `${count} avis${count > 1 ? " reçus" : count ? " reçu" : ""}`;
    if (!ratings.length) {
      list.replaceChildren(element("div", {
        className: "empty-state",
        text: "Aucune évaluation reçue pour le moment."
      }));
      return;
    }
    list.replaceChildren(...ratings.map((rating) =>
      element("article", { className: "staff-rating-card" }, [
        element("div", { className: "staff-rating-head" }, [
          element("div", {}, [
            element("strong", { text: rating.member_display_name }),
            element("small", { text: `@${rating.member_username}` })
          ]),
          element("span", {
            className: "staff-rating-stars",
            text: starText(rating.stars),
            title: `${rating.stars} étoile${rating.stars > 1 ? "s" : ""} sur 5`
          })
        ]),
        element("p", { text: rating.comment }),
        element("time", {
          text: `Mis à jour le ${formatDate(rating.updated_at)}`
        })
      ])
    ));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderStaffAlert(alert) {
  const isBug = alert.alert_type === "bug_report";
  const card = element("article", {
    className: `staff-alert-card ${alert.resolved ? "resolved" : ""}`.trim()
  }, [
    element("div", { className: "staff-alert-head" }, [
      element("strong", { text: isBug ? "🐞 Signalement de bug" : "✦ Conversion XP PDD" }),
      element("time", { text: formatDate(alert.created_at) })
    ]),
    element("p", { text: alert.body })
  ]);
  if (alert.resolved) {
    card.append(element("small", { className: "resolved-label", text: "Déjà traité par le staff" }));
    return card;
  }

  const actions = element("div", { className: "staff-alert-actions" });
  const approve = element("button", {
    type: "button",
    className: "primary-button",
    text: isBug ? "Valider • +50 pièces" : "Marquer les XP ajoutés"
  });
  const reject = element("button", {
    type: "button",
    className: "danger-button",
    text: isBug ? "Refuser la récompense" : "Refuser et rembourser"
  });
  const decide = async (decision) => {
    approve.disabled = true;
    reject.disabled = true;
    try {
      const path = isBug
        ? `/staff/bug-reports/${alert.reference_id}/decision`
        : `/staff/xp-conversions/${alert.reference_id}/decision`;
      await api(path, {
        method: "POST",
        body: JSON.stringify({ decision })
      });
      toast(isBug && decision === "approved"
        ? "Bug validé : 50 pièces attribuées."
        : "Demande traitée et membre prévenu.");
      await loadStaffAlerts();
    } catch (error) {
      toast(error.message);
      approve.disabled = false;
      reject.disabled = false;
    }
  };
  approve.addEventListener("click", () => decide(isBug ? "approved" : "completed"));
  reject.addEventListener("click", () => decide("rejected"));
  actions.append(approve, reject);
  card.append(actions);
  return card;
}

$("#staffMessageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $("input[name='body']", form);
  const button = $("button", form);
  button.disabled = true;
  try {
    await api("/staff/messages", {
      method: "POST",
      body: JSON.stringify({ body: input.value })
    });
    form.reset();
    await loadMessages();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function loadAccounts() {
  const list = $("#staffAccountsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/admin/accounts");
    const accounts = asArray(data.accounts);
    if (!accounts.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Aucun compte staff." })
      );
      return;
    }
    list.replaceChildren(...accounts.map(renderAccount));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderAccount(account) {
  const info = element("div", {}, [
    element("strong", { text: account.username }),
    element("small", {
      text: `${account.role === "admin" ? "Administrateur" : "Modérateur"}${account.mustChangePassword ? " • mot de passe temporaire" : ""}`
    })
  ]);
  const toggle = element("button", {
    type: "button",
    text: account.active ? "Désactiver" : "Réactiver"
  });
  toggle.addEventListener("click", async () => {
    try {
      await api(`/admin/accounts/${account.id}/toggle`, { method: "PATCH" });
      await loadAccounts();
    } catch (error) {
      toast(error.message);
    }
  });
  return element("article", { className: "account-card" }, [
    info,
    element("span", {
      className: `role-pill ${account.active ? "active-pill" : "inactive-pill"}`,
      text: account.active ? "Actif" : "Désactivé"
    }),
    toggle
  ]);
}

$("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    await api("/admin/accounts", {
      method: "POST",
      body: JSON.stringify(values)
    });
    form.reset();
    setFormStatus(status, "Compte créé. Le mot de passe devra être changé à la première connexion.", "success");
    await loadAccounts();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

const defaultPet = {
  hunger: 82,
  joy: 88,
  energy: 76,
  xp: 0,
  level: 1,
  interactions: 0,
  lastAction: "Pixel vient de te rejoindre.",
  updatedAt: Date.now()
};

function currentPet() {
  const pet = state.pet && typeof state.pet === "object" ? state.pet : { ...defaultPet };
  pet.hunger = Number(pet.hunger ?? defaultPet.hunger);
  pet.joy = Number(pet.joy ?? defaultPet.joy);
  pet.energy = Number(pet.energy ?? defaultPet.energy);
  pet.xp = Number(pet.xp ?? 0);
  pet.level = Math.max(1, Number(pet.level ?? 1));
  pet.interactions = Number(pet.interactions ?? 0);
  pet.lastAction = pet.lastAction || defaultPet.lastAction;
  const hoursAway = Math.max(0, (Date.now() - Number(pet.updatedAt || Date.now())) / 3_600_000);
  if (hoursAway >= 0.25) {
    pet.hunger = Math.max(5, Number(pet.hunger ?? 82) - hoursAway * 2.5);
    pet.joy = Math.max(5, Number(pet.joy ?? 88) - hoursAway * 1.8);
    pet.energy = Math.max(5, Number(pet.energy ?? 76) - hoursAway * 1.4);
  }
  pet.updatedAt = Date.now();
  state.pet = pet;
  return pet;
}

function savePet() {
  state.pet.updatedAt = Date.now();
  localStorage.setItem("pixel-pet", JSON.stringify(state.pet));
}

function petMood(pet) {
  const average = (pet.hunger + pet.joy + pet.energy) / 3;
  if (average >= 80) return ["Très heureux", "Pixel rayonne de bonheur !"];
  if (average >= 60) return ["Heureux", "Pixel est content de passer du temps avec toi."];
  if (average >= 40) return ["Calme", "Pixel aimerait recevoir un peu d’attention."];
  return ["Fatigué", "Pixel a besoin que tu prennes soin de lui."];
}

function petEnvironment() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 17) {
    return { className: "pet-day", label: hour < 12 ? "Matin avec Pixel" : "Après-midi avec Pixel" };
  }
  if (hour >= 17 && hour < 21) {
    return { className: "pet-evening", label: "Soirée avec Pixel" };
  }
  return { className: "pet-night", label: "Nuit calme avec Pixel" };
}

function petXpGoal(pet) {
  return pet.level * 40;
}

function gainPetXp(pet, amount) {
  pet.xp += amount;
  let leveledUp = false;
  while (pet.xp >= petXpGoal(pet)) {
    pet.xp -= petXpGoal(pet);
    pet.level += 1;
    leveledUp = true;
  }
  return leveledUp;
}

function renderPet(reaction = "") {
  const pet = currentPet();
  const values = {
    hunger: Math.round(pet.hunger),
    joy: Math.round(pet.joy),
    energy: Math.round(pet.energy)
  };
  Object.entries(values).forEach(([name, value]) => {
    $(`#${name}Value`).textContent = `${value}%`;
    $(`#${name}Bar`).style.width = `${value}%`;
  });
  const [mood, message] = petMood(pet);
  $("#petMoodBadge").textContent = mood;
  $("#petMessage").textContent = message;
  const environment = petEnvironment();
  $("#petStage").classList.remove("pet-day", "pet-evening", "pet-night");
  $("#petStage").classList.add(environment.className);
  $("#petEnvironment").textContent = environment.label;
  const xpGoal = petXpGoal(pet);
  $("#petXpBar").style.width = `${Math.min(100, (pet.xp / xpGoal) * 100)}%`;
  $("#petLevelText").textContent = `Niveau ${pet.level} • ${Math.round(pet.xp)}/${xpGoal} XP`;
  $("#petDiary").textContent = pet.lastAction;
  if (reaction) $("#petReaction").textContent = reaction;
  savePet();
}

function animatePet(animation, reaction) {
  const mascot = $("#petMascot");
  mascot.classList.remove("pet-bounce", "pet-eat", "pet-walk", "pet-sleep", "pet-pet");
  void mascot.offsetWidth;
  mascot.classList.add(animation);
  $("#petReaction").textContent = reaction;
  window.setTimeout(() => mascot.classList.remove(animation), 1300);
}

function emitPetParticles(symbol) {
  const container = $("#petParticles");
  for (let index = 0; index < 6; index += 1) {
    const particle = element("span", { text: symbol });
    const offset = (index - 2.5) * 25 + Math.round(Math.random() * 16 - 8);
    particle.style.setProperty("--particle-x", `calc(-50% + ${offset}px)`);
    particle.style.animationDelay = `${index * 55}ms`;
    container.append(particle);
    window.setTimeout(() => particle.remove(), 1500);
  }
}

function completePetInteraction(pet, xp, diary, animation, reaction, particle) {
  pet.interactions += 1;
  pet.lastAction = diary;
  const leveledUp = gainPetXp(pet, xp);
  state.pet = pet;
  savePet();
  animatePet(animation, leveledUp ? `Niveau ${pet.level} ! 🎉` : reaction);
  emitPetParticles(leveledUp ? "⭐" : particle);
  navigator.vibrate?.(25);
  renderPet();
}

let petActionPending = false;

async function handlePetAction(action) {
  const accountKind = petAccountKind();
  if (!accountKind) {
    selectAccountTab("member");
    updateAccountDialog();
    loginDialog.showModal();
    toast("Connecte un compte membre ou staff pour interagir avec Pixel.");
    return;
  }
  if (petActionPending) return;
  petActionPending = true;
  const actionButtons = $$(`[data-pet-action="${action}"]`);
  actionButtons.forEach((button) => { button.disabled = true; });
  setFormStatus($("#petActionStatus"), "Pixel se prépare…");
  try {
    const result = await api(`/${accountKind}/pixel/action`, {
      method: "POST",
      auth: accountKind,
      body: JSON.stringify({ action })
    });
    setPetAccountPoints(result.points);
    const pet = currentPet();
    if (action === "feed") {
      pet.hunger = Math.min(100, pet.hunger + 18);
      pet.joy = Math.min(100, pet.joy + 3);
      completePetInteraction(pet, 6, "Pixel a dégusté une orange avec plaisir.", "pet-eat", "Miam ! 🍊", "🍊");
    }
    if (action === "bounce") {
      pet.joy = Math.min(100, pet.joy + 13);
      pet.energy = Math.max(5, pet.energy - 5);
      completePetInteraction(pet, 8, "Pixel a joué et bondi dans tous les sens.", "pet-bounce", "Youpi ! ✨", "✨");
    }
    if (action === "walk") {
      pet.joy = Math.min(100, pet.joy + 16);
      pet.hunger = Math.max(5, pet.hunger - 4);
      pet.energy = Math.max(5, pet.energy - 8);
      completePetInteraction(pet, 12, "Vous êtes partis vous promener autour de PDD.", "pet-walk", "En route ! 👟", "💨");
    }
    if (action === "sleep") {
      pet.energy = Math.min(100, pet.energy + 24);
      pet.hunger = Math.max(5, pet.hunger - 3);
      completePetInteraction(pet, 5, "Pixel s’est reposé dans son petit coin douillet.", "pet-sleep", "Zzz… 🌙", "💤");
    }
    if (action === "pet") {
      pet.joy = Math.min(100, pet.joy + 5);
      completePetInteraction(pet, 2, "Tu as caressé Pixel. Il se sent aimé.", "pet-pet", "Encore ! 💛", "💛");
    }
    setFormStatus(
      $("#petActionStatus"),
      `${result.cost} pièces utilisées • délai ${result.cooldownSeconds} secondes.`,
      "success"
    );
  } catch (error) {
    setFormStatus($("#petActionStatus"), error.message, "error");
  } finally {
    petActionPending = false;
    actionButtons.forEach((button) => { button.disabled = false; });
  }
}

$$("[data-pet-action]").forEach((button) => {
  button.addEventListener("click", () => handlePetAction(button.dataset.petAction));
});

const shopEffects = {
  treat: { hunger: 12, joy: 6, xp: 4, diary: "Pixel a savouré une délicieuse friandise.", reaction: "Délicieux ! 🍪", particle: "🍪" },
  meal: { hunger: 28, joy: 10, xp: 8, diary: "Pixel a dégusté un bon repas bien chaud.", reaction: "Quel bon repas ! 🍜", particle: "🍜" },
  feast: { hunger: 45, joy: 22, xp: 15, diary: "Pixel a profité d’un véritable festin PDD.", reaction: "Incroyable festin ! 🍱", particle: "⭐" }
};

$$("[data-shop-item]").forEach((button) => {
  button.addEventListener("click", async () => {
    const accountKind = petAccountKind();
    if (!accountKind) {
      selectAccountTab("member");
      updateAccountDialog();
      loginDialog.showModal();
      toast("Connecte un compte membre ou staff pour utiliser tes pièces.");
      return;
    }
    const item = button.dataset.shopItem;
    button.disabled = true;
    setFormStatus($("#pixelShopStatus"), "Achat en cours…");
    try {
      const result = await api(`/${accountKind}/shop/purchase`, {
        method: "POST",
        auth: accountKind,
        body: JSON.stringify({ item })
      });
      setPetAccountPoints(result.points);
      const effect = shopEffects[item];
      const pet = currentPet();
      pet.hunger = Math.min(100, pet.hunger + effect.hunger);
      pet.joy = Math.min(100, pet.joy + effect.joy);
      completePetInteraction(
        pet,
        effect.xp,
        effect.diary,
        "pet-eat",
        effect.reaction,
        effect.particle
      );
      setFormStatus(
        $("#pixelShopStatus"),
        `${result.label} acheté pour ${result.cost} pièces.`,
        "success"
      );
    } catch (error) {
      setFormStatus($("#pixelShopStatus"), error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
});

$("#petMascot").addEventListener("click", () => {
  handlePetAction("pet");
});

function schedulePixelIdleMovement() {
  const delay = 3_500 + Math.round(Math.random() * 4_500);
  window.setTimeout(() => {
    const mascot = $("#petMascot");
    const pixelPageVisible = $("#page-pixel").classList.contains("active");
    if (pixelPageVisible && !petActionPending) {
      const target = 29 + Math.round(Math.random() * 42);
      mascot.style.left = `${target}%`;
      mascot.classList.add("pet-idle-step");
      window.setTimeout(() => mascot.classList.remove("pet-idle-step"), 1900);
    }
    schedulePixelIdleMovement();
  }, delay);
}

schedulePixelIdleMovement();

let pixelSwipeStart = null;
$("#page-pixel").addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  if (!touch) {
    pixelSwipeStart = null;
    return;
  }
  pixelSwipeStart = {
    x: touch.clientX,
    y: touch.clientY,
    startedAt: Date.now(),
    interactive: Boolean(event.target.closest("button, input, textarea, select, a, dialog"))
  };
}, { passive: true });
$("#page-pixel").addEventListener("touchend", (event) => {
  if (!pixelSwipeStart) return;
  const touch = event.changedTouches[0];
  const start = pixelSwipeStart;
  pixelSwipeStart = null;
  if (!touch || start.interactive) return;
  const distanceX = touch.clientX - start.x;
  const distanceY = touch.clientY - start.y;
  const horizontalDistance = Math.abs(distanceX);
  const verticalDistance = Math.abs(distanceY);
  const elapsed = Date.now() - start.startedAt;
  if (
    horizontalDistance < 110 ||
    horizontalDistance < verticalDistance * 1.4 ||
    elapsed > 850
  ) return;
  navigate(distanceX < 0 ? "application" : "announcements");
}, { passive: true });
$("#page-pixel").addEventListener("touchcancel", () => {
  pixelSwipeStart = null;
}, { passive: true });

const guideDialog = $("#guideDialog");
$("#pixelGuideButton").addEventListener("click", () => guideDialog.showModal());
$("#closeGuide").addEventListener("click", () => guideDialog.close());
$$("[data-guide-page]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.guidePage;
    guideDialog.close();
    if (page === "staff" && !state.user) {
      selectAccountTab("staff");
      updateAccountDialog();
      loginDialog.showModal();
      return;
    }
    navigate(page);
  });
});

async function restoreMemberSession() {
  if (!state.memberToken) {
    updateMemberAccess();
    prepareApplicationPage();
    return;
  }
  try {
    const data = await api("/members/me", { auth: "member" });
    state.member = data.member;
    state.points = Number(data.member.points || 0);
    localStorage.setItem("pixel-member", JSON.stringify(data.member));
    await loadMemberInbox({ notify: true });
    await beginActiveSession();
  } catch {
    clearMemberSession();
  }
  updateAccountButton();
  updateAccountDialog();
  updateMemberAccess();
  prepareApplicationPage();
}

let lastUserInteraction = Date.now();
let activityPaused = false;
const afkDialog = $("#afkDialog");

async function beginActiveSession() {
  const accountKind = petAccountKind();
  if (!accountKind) return;
  lastUserInteraction = Date.now();
  activityPaused = false;
  try {
    const result = await api(`/${accountKind}/activity/reward`, {
      method: "POST",
      auth: accountKind,
      body: JSON.stringify({ mode: "start" })
    });
    setPetAccountPoints(result.points);
  } catch {
    // La surveillance du serveur indiquera si la connexion est indisponible.
  }
}

async function rewardActiveMinute() {
  const accountKind = petAccountKind();
  if (
    !accountKind ||
    activityPaused ||
    document.visibilityState !== "visible" ||
    Date.now() - lastUserInteraction >= 180_000
  ) return;
  try {
    const result = await api(`/${accountKind}/activity/reward`, {
      method: "POST",
      auth: accountKind,
      body: JSON.stringify({ mode: "minute" })
    });
    setPetAccountPoints(result.points);
    if (result.awarded) {
      toast(`+${result.awarded} pièces pour ton activité !`);
    }
  } catch {
    // Une minute non synchronisée n’est pas créditée.
  }
}

function registerUserInteraction() {
  if (!activityPaused) lastUserInteraction = Date.now();
}

["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => {
  window.addEventListener(eventName, registerUserInteraction, { passive: true });
});

window.setInterval(() => {
  if (
    petAccountKind() &&
    !activityPaused &&
    document.visibilityState === "visible" &&
    Date.now() - lastUserInteraction >= 180_000
  ) {
    activityPaused = true;
    if (!afkDialog.open) afkDialog.showModal();
  }
}, 5_000);

window.setInterval(rewardActiveMinute, 60_000);

$("#resumeActivityButton").addEventListener("click", async () => {
  afkDialog.close();
  await beginActiveSession();
  toast("Gain de pièces repris : +5 par minute active.");
});

LocalNotifications.addListener("localNotificationActionPerformed", () => {
  if (state.member) navigate("member-inbox");
}).catch(() => {});

window.setInterval(() => {
  if (state.member && document.visibilityState === "visible") {
    loadMemberInbox({ notify: true });
  }
}, 60_000);

document.addEventListener("visibilitychange", () => {
  if (state.member && document.visibilityState === "visible") {
    loadMemberInbox({ notify: true });
  }
  if (document.visibilityState === "visible") {
    checkServerAvailability();
  }
});

window.setInterval(() => checkServerAvailability(), 30_000);
window.setTimeout(() => checkServerAvailability(), 1200);

window.setInterval(() => {
  if (state.user && !state.user.mustChangePassword && document.visibilityState === "visible") {
    loadStaffAlerts();
  }
}, 30_000);

if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  ["http:", "https:"].includes(window.location.protocol)
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

updateAccountButton();
updateAccountDialog();
updateMemberAccess();
renderPet();
restoreMemberSession();
