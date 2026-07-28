const controlAppVersion = "0.1.0-admin-live";
let controlSnapshot = { sessions: [], members: [], lockouts: [] };
let controlRefreshTimer = null;

function controlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function controlDate(value) {
  if (!value) return "Jamais";
  const text = String(value);
  const date = new Date(`${text}${text.endsWith("Z") || /[+-]\d\d:\d\d$/.test(text) ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

function controlRelativeDate(value) {
  if (!value) return "jamais";
  const text = String(value);
  const date = new Date(`${text}${text.endsWith("Z") || /[+-]\d\d:\d\d$/.test(text) ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return controlDate(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "à l’instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return controlDate(value);
}

function staffControlToken() {
  return sessionStorage.getItem("pixel-token") || "";
}

function memberControlToken() {
  return localStorage.getItem("pixel-member-token") || "";
}

function currentStaffProfile() {
  try {
    return JSON.parse(sessionStorage.getItem("pixel-user") || "null");
  } catch {
    return null;
  }
}

async function controlApi(path, { method = "GET", body, auth = "staff", keepalive = false } = {}) {
  const token = auth === "member" ? memberControlToken() : staffControlToken();
  if (!token) throw new Error(auth === "member" ? "Compte membre déconnecté." : "Compte administrateur déconnecté.");
  const headers = {
    Authorization: `Bearer ${token}`,
    "ngrok-skip-browser-warning": "pixel-everywhere"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

function platformInfo() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("android")) {
    return { platform: "android", label: "Application Android" };
  }
  if (userAgent.includes("electron") && userAgent.includes("mac")) {
    return { platform: "macos", label: "Application macOS" };
  }
  if (userAgent.includes("iphone") || userAgent.includes("ipad")) {
    return { platform: "ios", label: "iPhone / iPad" };
  }
  if (userAgent.includes("windows")) {
    return { platform: "windows", label: "Navigateur Windows" };
  }
  if (userAgent.includes("mac")) {
    return { platform: "macos", label: "Navigateur macOS" };
  }
  return { platform: "web", label: "Navigateur web" };
}

function deviceSessionKey() {
  const storageKey = "pixel-everywhere-device-session-key";
  let key = localStorage.getItem(storageKey);
  if (!key) {
    const random = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    key = `pixel-${random}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 100);
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function currentPageName() {
  const page = document.querySelector(".page.active");
  return page?.id?.replace(/^page-/, "") || "inconnue";
}

async function sendPresence(kind) {
  const token = kind === "member" ? memberControlToken() : staffControlToken();
  if (!token || document.visibilityState === "hidden") return;
  const info = platformInfo();
  try {
    await controlApi(`/presence/${kind}`, {
      method: "POST",
      auth: kind,
      body: {
        sessionKey: deviceSessionKey(),
        platform: info.platform,
        deviceLabel: info.label,
        appVersion: controlAppVersion,
        currentPage: currentPageName()
      }
    });
  } catch {
    // La présence est informative et ne doit jamais bloquer l’utilisation de l’app.
  }
}

function sendAllPresence() {
  sendPresence("member");
  sendPresence("staff");
}

function sendPresenceLogout(kind) {
  const token = kind === "member" ? memberControlToken() : staffControlToken();
  if (!token) return;
  controlApi(`/presence/${kind}/logout`, {
    method: "POST",
    auth: kind,
    body: { sessionKey: deviceSessionKey() },
    keepalive: true
  }).catch(() => {});
}

function installPresenceTracking() {
  sendAllPresence();
  window.setInterval(sendAllPresence, 25_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendAllPresence();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-page-target], [data-guide-page], [data-staff-tab]")) {
      window.setTimeout(sendAllPresence, 250);
    }
  });
  document.querySelector("#memberLogoutButton")?.addEventListener("click", () => sendPresenceLogout("member"));
  document.querySelector("#logoutButton")?.addEventListener("click", () => sendPresenceLogout("staff"));
}

function installAdminControlPanel() {
  const tabs = document.querySelector(".staff-tabs");
  const workspace = document.querySelector("#staffWorkspace");
  if (!tabs || !workspace || document.querySelector("#staff-live-control")) return;

  const tab = document.createElement("button");
  tab.id = "liveControlTabButton";
  tab.type = "button";
  tab.dataset.staffTab = "live-control";
  tab.textContent = "Utilisateurs";
  tab.hidden = true;
  const accountsTab = tabs.querySelector('[data-staff-tab="accounts"]');
  tabs.insertBefore(tab, accountsTab || null);

  const panel = document.createElement("section");
  panel.id = "staff-live-control";
  panel.className = "staff-panel";
  panel.innerHTML = `
    <div class="live-control-heading">
      <div>
        <p class="eyebrow">Administration en direct</p>
        <h3>Utilisateurs et comptes</h3>
        <small>Présence récente, déblocage des connexions et gestion des pièces.</small>
      </div>
      <button id="refreshLiveControl" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div id="liveControlSummary" class="live-control-summary"></div>
    <section class="live-control-section">
      <div class="live-control-section-title"><strong>Connectés et activité récente</strong><small>Un compte est considéré en ligne pendant 90 secondes après son dernier signal.</small></div>
      <div id="liveSessionsList" class="live-session-list"></div>
    </section>
    <section class="live-control-section">
      <div class="live-control-section-title"><strong>Connexions bloquées</strong><small>Réinitialise l’attente ou autorise temporairement les essais pendant 10 minutes.</small></div>
      <div id="loginLockoutsList" class="login-lockout-list"></div>
    </section>
    <section class="live-control-section">
      <div class="live-control-section-title member-control-title">
        <div><strong>Pièces des membres</strong><small>Ajoute ou retire des pièces avec un motif envoyé dans leur messagerie.</small></div>
        <input id="memberControlSearch" type="search" placeholder="Rechercher un membre…" autocomplete="off" />
      </div>
      <div id="memberControlList" class="member-control-list"></div>
    </section>
  `;
  const accountsPanel = document.querySelector("#staff-accounts");
  workspace.insertBefore(panel, accountsPanel || null);

  tab.addEventListener("click", loadLiveControl);
  panel.querySelector("#refreshLiveControl")?.addEventListener("click", loadLiveControl);
  panel.querySelector("#memberControlSearch")?.addEventListener("input", renderMemberControls);
  panel.addEventListener("submit", handleControlSubmit);
  panel.addEventListener("click", handleControlClick);
}

function syncAdminControlVisibility() {
  const user = currentStaffProfile();
  const tab = document.querySelector("#liveControlTabButton");
  if (!tab) return;
  const isAdmin = user?.role === "admin";
  tab.hidden = !isAdmin;
  if (!isAdmin && document.querySelector("#staff-live-control")?.classList.contains("active")) {
    document.querySelector('[data-staff-tab="applications"]')?.click();
  }
}

function platformLabel(platform) {
  return ({
    android: "Android",
    macos: "macOS",
    windows: "Windows",
    ios: "iPhone / iPad",
    web: "Navigateur",
    unknown: "Application inconnue"
  })[platform] || platform;
}

function pageLabel(page) {
  return ({
    home: "Accueil",
    announcements: "Annonces",
    pixel: "Tamagotchi Pixel",
    application: "Candidature",
    suggestions: "Suggestions",
    credits: "Crédits",
    rating: "Avis",
    "member-inbox": "Messagerie membre",
    staff: "Espace staff",
    inconnue: "Page inconnue"
  })[page] || page;
}

function renderLiveSummary() {
  const summary = document.querySelector("#liveControlSummary");
  if (!summary) return;
  const online = controlSnapshot.sessions.filter((session) => session.online);
  const onlineMembers = online.filter((session) => session.accountKind === "member").length;
  const onlineStaff = online.filter((session) => session.accountKind === "staff").length;
  const blocked = controlSnapshot.lockouts.filter((item) => item.blockedUntil).length;
  summary.innerHTML = `
    <article><strong>${online.length}</strong><small>en ligne</small></article>
    <article><strong>${onlineMembers}</strong><small>membres</small></article>
    <article><strong>${onlineStaff}</strong><small>staff</small></article>
    <article><strong>${blocked}</strong><small>blocages</small></article>
  `;
}

function renderSessions() {
  const list = document.querySelector("#liveSessionsList");
  if (!list) return;
  const sessions = [...controlSnapshot.sessions].sort((a, b) => Number(b.online) - Number(a.online));
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-state compact">Aucune présence enregistrée. Les nouveaux builds commenceront à apparaître ici après leur connexion.</div>';
    return;
  }
  list.innerHTML = sessions.map((session) => `
    <article class="live-session-card ${session.online ? "online" : "recent"}">
      <span class="live-presence-dot" aria-hidden="true"></span>
      <div class="live-session-identity">
        <strong>${controlEscape(session.displayName || session.username)}</strong>
        <small>@${controlEscape(session.username)} • ${session.accountKind === "staff" ? "Staff" : "Membre"}</small>
      </div>
      <div class="live-session-location">
        <strong>${controlEscape(platformLabel(session.platform))}</strong>
        <small>${controlEscape(session.deviceLabel || "Appareil inconnu")} • ${controlEscape(pageLabel(session.currentPage))}</small>
      </div>
      <div class="live-session-time">
        <span>${session.online ? "En ligne" : "Hors ligne"}</span>
        <small>${controlEscape(controlRelativeDate(session.lastSeenAt))} • IP ${controlEscape(session.ipPreview || "masquée")}</small>
      </div>
    </article>
  `).join("");
}

function renderLockouts() {
  const list = document.querySelector("#loginLockoutsList");
  if (!list) return;
  if (!controlSnapshot.lockouts.length) {
    list.innerHTML = '<div class="empty-state compact">Aucun compte en attente ou en bypass.</div>';
    return;
  }
  list.innerHTML = controlSnapshot.lockouts.map((lockout) => `
    <article class="login-lockout-card" data-kind="${controlEscape(lockout.accountKind)}" data-username="${controlEscape(lockout.username)}">
      <div>
        <strong>${controlEscape(lockout.username)}</strong>
        <small>${lockout.accountKind === "staff" ? "Compte staff" : "Compte membre"} • IP ${controlEscape(lockout.ipPreview || "masquée")} • ${lockout.attempts} tentative(s)</small>
        <small>${lockout.bypassUntil ? `Bypass jusqu’au ${controlEscape(controlDate(lockout.bypassUntil))}` : lockout.blockedUntil ? `Bloqué jusqu’au ${controlEscape(controlDate(lockout.blockedUntil))}` : "Tentatives surveillées"}</small>
      </div>
      <div class="login-lockout-actions">
        <button type="button" data-login-action="clear">Réinitialiser</button>
        <button type="button" class="primary-button" data-login-action="bypass">Bypass 10 min</button>
      </div>
    </article>
  `).join("");
}

function filteredMembers() {
  const search = document.querySelector("#memberControlSearch")?.value.trim().toLocaleLowerCase("fr-FR") || "";
  if (!search) return controlSnapshot.members.slice(0, 150);
  return controlSnapshot.members.filter((member) =>
    `${member.displayName} ${member.username}`.toLocaleLowerCase("fr-FR").includes(search)
  ).slice(0, 150);
}

function renderMemberControls() {
  const list = document.querySelector("#memberControlList");
  if (!list) return;
  const members = filteredMembers();
  if (!members.length) {
    list.innerHTML = '<div class="empty-state compact">Aucun membre trouvé.</div>';
    return;
  }
  list.innerHTML = members.map((member) => `
    <form class="member-control-card" data-member-id="${Number(member.id)}">
      <div class="member-control-identity">
        <strong>${controlEscape(member.displayName)}</strong>
        <small>@${controlEscape(member.username)} • ${member.lastPlatform ? controlEscape(platformLabel(member.lastPlatform)) : "Jamais connecté avec cette version"}</small>
        <small>${member.lastSeenAt ? controlEscape(controlRelativeDate(member.lastSeenAt)) : "Aucune présence"}</small>
      </div>
      <div class="member-balance"><strong>${Number(member.points).toLocaleString("fr-FR")}</strong><small>pièces</small></div>
      <label>Modification<input name="amount" type="number" step="1" min="-1000000" max="1000000" required placeholder="+100 ou -50" /></label>
      <label>Motif<input name="reason" maxlength="300" placeholder="Ex. récompense concours" /></label>
      <button class="primary-button" type="submit">Appliquer</button>
      <p class="form-status" aria-live="polite"></p>
    </form>
  `).join("");
}

function renderControlSnapshot() {
  renderLiveSummary();
  renderSessions();
  renderLockouts();
  renderMemberControls();
}

async function loadLiveControl() {
  const panel = document.querySelector("#staff-live-control");
  const sessions = document.querySelector("#liveSessionsList");
  if (!panel || currentStaffProfile()?.role !== "admin") return;
  if (sessions) sessions.innerHTML = '<div class="loading-card">Chargement des utilisateurs…</div>';
  try {
    const data = await controlApi("/admin/live-control");
    controlSnapshot = {
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      members: Array.isArray(data.members) ? data.members : [],
      lockouts: Array.isArray(data.lockouts) ? data.lockouts : []
    };
    renderControlSnapshot();
  } catch (error) {
    if (sessions) sessions.innerHTML = `<div class="empty-state">${controlEscape(error.message)}</div>`;
  }
}

async function handleControlSubmit(event) {
  const form = event.target.closest(".member-control-card");
  if (!form) return;
  event.preventDefault();
  const memberId = Number(form.dataset.memberId);
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Mise à jour du solde…";
  try {
    const result = await controlApi(`/admin/members/${memberId}/points`, {
      method: "POST",
      body: { amount: Number(values.amount), reason: values.reason }
    });
    status.className = "form-status success";
    status.textContent = `Nouveau solde : ${Number(result.points).toLocaleString("fr-FR")} pièces.`;
    form.querySelector("input[name='amount']").value = "";
    form.querySelector("input[name='reason']").value = "";
    const member = controlSnapshot.members.find((item) => Number(item.id) === memberId);
    if (member) member.points = Number(result.points);
    window.setTimeout(renderMemberControls, 700);
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function handleControlClick(event) {
  const button = event.target.closest("[data-login-action]");
  if (!button) return;
  const card = button.closest(".login-lockout-card");
  if (!card) return;
  const mode = button.dataset.loginAction;
  card.querySelectorAll("button").forEach((item) => { item.disabled = true; });
  try {
    await controlApi("/admin/login-access", {
      method: "POST",
      body: {
        kind: card.dataset.kind,
        username: card.dataset.username,
        mode,
        minutes: 10
      }
    });
    await loadLiveControl();
  } catch (error) {
    card.insertAdjacentHTML("beforeend", `<p class="form-status error">${controlEscape(error.message)}</p>`);
    card.querySelectorAll("button").forEach((item) => { item.disabled = false; });
  }
}

function startAdminAutoRefresh() {
  if (controlRefreshTimer) return;
  controlRefreshTimer = window.setInterval(() => {
    syncAdminControlVisibility();
    const panel = document.querySelector("#staff-live-control");
    if (panel?.classList.contains("active") && document.visibilityState === "visible") {
      loadLiveControl();
    }
  }, 20_000);
}

installAdminControlPanel();
syncAdminControlVisibility();
installPresenceTracking();
startAdminAutoRefresh();
window.setInterval(syncAdminControlVisibility, 1000);
