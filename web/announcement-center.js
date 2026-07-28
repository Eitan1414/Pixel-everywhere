const announcementApiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const announcementState = { active: "server", appLoaded: false, logsLoaded: false };

function announcementEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function announcementDate(value) {
  if (!value) return "";
  const parsed = new Date(`${value}${String(value).endsWith("Z") || String(value).includes("+") ? "" : "Z"}`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

async function announcementApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = sessionStorage.getItem("pixel-token") || "";
  if (options.staff && token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (announcementApiBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  const response = await fetch(`${announcementApiBase}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

function emptyCard(message) {
  return `<div class="empty-state">${announcementEscape(message)}</div>`;
}

function renderPublicAnnouncement(item) {
  return `
    <article class="announcement-card app-announcement-card">
      <div class="announcement-head">
        <div class="announcement-author">
          <span class="announcement-app-mark" aria-hidden="true">P</span>
          <div><strong>${announcementEscape(item.title)}</strong><small>Annonce de l’application</small></div>
        </div>
        <time>${announcementEscape(announcementDate(item.createdAt))}</time>
      </div>
      <p class="announcement-content">${announcementEscape(item.body)}</p>
      <small class="announcement-signature">Publié par ${announcementEscape(item.author || "Équipe PDD")}</small>
    </article>`;
}

function renderPublicUpdateLog(item) {
  return `
    <article class="announcement-card update-log-card">
      <div class="update-log-heading">
        <span class="update-version-badge">v${announcementEscape(item.version)}</span>
        <time>${announcementEscape(announcementDate(item.createdAt))}</time>
      </div>
      <h3>${announcementEscape(item.title)}</h3>
      <p class="announcement-content">${announcementEscape(item.body)}</p>
      <small class="announcement-signature">Journal publié par ${announcementEscape(item.author || "Équipe PDD")}</small>
    </article>`;
}

async function loadPublicAppAnnouncements({ force = false } = {}) {
  const list = document.querySelector("#appAnnouncementsList");
  if (!list || (announcementState.appLoaded && !force)) return;
  list.innerHTML = '<div class="loading-card">Chargement des annonces de l’application…</div>';
  try {
    const data = await announcementApi("/app-announcements");
    const items = Array.isArray(data.announcements) ? data.announcements : [];
    list.innerHTML = items.length
      ? items.map(renderPublicAnnouncement).join("")
      : emptyCard("Aucune annonce de l’application pour le moment.");
    announcementState.appLoaded = true;
  } catch (error) {
    list.innerHTML = emptyCard(error.message);
  }
}

async function loadPublicUpdateLogs({ force = false } = {}) {
  const list = document.querySelector("#publicUpdateLogsList");
  if (!list || (announcementState.logsLoaded && !force)) return;
  list.innerHTML = '<div class="loading-card">Chargement du journal des mises à jour…</div>';
  try {
    const data = await announcementApi("/update-logs");
    const items = Array.isArray(data.logs) ? data.logs : [];
    list.innerHTML = items.length
      ? items.map(renderPublicUpdateLog).join("")
      : emptyCard("Le journal des mises à jour est encore vide.");
    announcementState.logsLoaded = true;
  } catch (error) {
    list.innerHTML = emptyCard(error.message);
  }
}

function setAnnouncementCategory(category) {
  announcementState.active = category;
  document.querySelectorAll("[data-announcement-category]").forEach((button) => {
    const active = button.dataset.announcementCategory === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-announcement-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.announcementPanel !== category;
  });
  const footer = document.querySelector("#page-announcements .announcement-footer");
  if (footer) footer.hidden = category !== "server";
  if (category === "app") loadPublicAppAnnouncements();
  if (category === "updates") loadPublicUpdateLogs();
}

function installPublicAnnouncementCenter() {
  const page = document.querySelector("#page-announcements");
  const heading = page?.querySelector(".section-heading");
  const serverList = document.querySelector("#announcementsList");
  if (!page || !heading || !serverList || document.querySelector("#announcementCategoryTabs")) return;

  const tabs = document.createElement("div");
  tabs.id = "announcementCategoryTabs";
  tabs.className = "announcement-category-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.innerHTML = `
    <button class="active" type="button" role="tab" aria-selected="true" data-announcement-category="server">
      <span>Serveur PDD</span><small>Discord</small>
    </button>
    <button type="button" role="tab" aria-selected="false" data-announcement-category="app">
      <span>Application</span><small>Infos officielles</small>
    </button>
    <button type="button" role="tab" aria-selected="false" data-announcement-category="updates">
      <span>Update logs</span><small>Versions</small>
    </button>`;
  heading.insertAdjacentElement("afterend", tabs);

  serverList.dataset.announcementPanel = "server";
  const appList = document.createElement("div");
  appList.id = "appAnnouncementsList";
  appList.className = "stack";
  appList.dataset.announcementPanel = "app";
  appList.hidden = true;
  const logsList = document.createElement("div");
  logsList.id = "publicUpdateLogsList";
  logsList.className = "stack update-log-list";
  logsList.dataset.announcementPanel = "updates";
  logsList.hidden = true;
  serverList.insertAdjacentElement("afterend", appList);
  appList.insertAdjacentElement("afterend", logsList);

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-announcement-category]");
    if (button) setAnnouncementCategory(button.dataset.announcementCategory);
  });

  document.querySelector("#refreshAnnouncements")?.addEventListener("click", (event) => {
    if (announcementState.active === "server") return;
    event.stopImmediatePropagation();
    if (announcementState.active === "app") loadPublicAppAnnouncements({ force: true });
    if (announcementState.active === "updates") loadPublicUpdateLogs({ force: true });
  });
}

function staffCard(item, kind) {
  const isLog = kind === "log";
  const label = isLog ? `v${item.version} · ${item.title}` : item.title;
  return `
    <article class="staff-publication-card" data-publication-kind="${kind}" data-publication-id="${Number(item.id)}">
      <div>
        <strong>${announcementEscape(label)}</strong>
        <small>${announcementEscape(announcementDate(item.createdAt))} · ${announcementEscape(item.author || "Équipe PDD")}</small>
      </div>
      <p>${announcementEscape(item.body)}</p>
      <button class="text-button delete-publication" type="button">Supprimer</button>
    </article>`;
}

async function loadStaffPublications() {
  const announcementsList = document.querySelector("#staffAppAnnouncementsList");
  const logsList = document.querySelector("#staffUpdateLogsList");
  if (!announcementsList || !logsList) return;
  announcementsList.innerHTML = '<div class="loading-card">Chargement…</div>';
  logsList.innerHTML = '<div class="loading-card">Chargement…</div>';
  try {
    const [announcementsData, logsData] = await Promise.all([
      announcementApi("/staff/app-announcements", { staff: true }),
      announcementApi("/staff/update-logs", { staff: true })
    ]);
    const announcements = Array.isArray(announcementsData.announcements) ? announcementsData.announcements : [];
    const logs = Array.isArray(logsData.logs) ? logsData.logs : [];
    announcementsList.innerHTML = announcements.length
      ? announcements.map((item) => staffCard(item, "announcement")).join("")
      : emptyCard("Aucune annonce d’application publiée.");
    logsList.innerHTML = logs.length
      ? logs.map((item) => staffCard(item, "log")).join("")
      : emptyCard("Aucun journal de mise à jour publié.");
  } catch (error) {
    announcementsList.innerHTML = emptyCard(error.message);
    logsList.innerHTML = emptyCard(error.message);
  }
}

function setStaffStatus(form, message, type = "") {
  const status = form.querySelector(".form-status");
  if (!status) return;
  status.textContent = message;
  status.className = `form-status ${type}`.trim();
}

async function publishAppAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  setStaffStatus(form, "Publication…");
  try {
    const data = await announcementApi("/staff/app-announcements", {
      method: "POST",
      staff: true,
      body: JSON.stringify({ title: values.title, body: values.body })
    });
    form.reset();
    setStaffStatus(form, data.message, "success");
    announcementState.appLoaded = false;
    await loadStaffPublications();
  } catch (error) {
    setStaffStatus(form, error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

async function publishUpdateLog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  setStaffStatus(form, "Publication…");
  try {
    const data = await announcementApi("/staff/update-logs", {
      method: "POST",
      staff: true,
      body: JSON.stringify({ version: values.version, title: values.title, body: values.body })
    });
    form.reset();
    setStaffStatus(form, data.message, "success");
    announcementState.logsLoaded = false;
    await loadStaffPublications();
  } catch (error) {
    setStaffStatus(form, error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

async function deletePublication(button) {
  const card = button.closest("[data-publication-kind]");
  const kind = card?.dataset.publicationKind;
  const id = card?.dataset.publicationId;
  if (!kind || !id) return;
  button.disabled = true;
  try {
    const path = kind === "log" ? `/staff/update-logs/${id}` : `/staff/app-announcements/${id}`;
    await announcementApi(path, { method: "DELETE", staff: true });
    if (kind === "log") announcementState.logsLoaded = false;
    else announcementState.appLoaded = false;
    await loadStaffPublications();
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message;
  }
}

function activateStaffPublicationTab(button) {
  document.querySelectorAll(".staff-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll(".staff-panel").forEach((panel) => panel.classList.toggle("active", panel.id === "staff-publications"));
  loadStaffPublications();
}

function installStaffPublicationPanel() {
  const tabs = document.querySelector(".staff-tabs");
  const workspace = document.querySelector("#staffWorkspace");
  if (!tabs || !workspace || document.querySelector("#staff-publications")) return;

  const tab = document.createElement("button");
  tab.type = "button";
  tab.dataset.staffTab = "publications";
  tab.textContent = "Annonces app";
  const accountsTab = tabs.querySelector('[data-staff-tab="accounts"]');
  tabs.insertBefore(tab, accountsTab || null);

  const panel = document.createElement("section");
  panel.id = "staff-publications";
  panel.className = "staff-panel";
  panel.innerHTML = `
    <div class="staff-publication-grid">
      <form id="appAnnouncementForm" class="card compact-form staff-publication-form">
        <div><p class="eyebrow">Sous-catégorie Application</p><h3>Publier une annonce</h3></div>
        <label>Titre<input name="title" maxlength="140" required placeholder="Ex. Nouveau studio de création" /></label>
        <label>Message<textarea name="body" rows="7" maxlength="8000" required placeholder="Annonce visible par tous les utilisateurs…"></textarea></label>
        <button class="primary-button" type="submit">Publier l’annonce</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
      <form id="updateLogForm" class="card compact-form staff-publication-form">
        <div><p class="eyebrow">Update logs</p><h3>Ajouter une version</h3></div>
        <label>Version<input name="version" required pattern="\\d+\\.\\d+\\.\\d+.*" placeholder="0.3.4" /></label>
        <label>Titre<input name="title" maxlength="140" required placeholder="Ex. Centre d’annonces" /></label>
        <label>Détails<textarea name="body" rows="6" maxlength="8000" required placeholder="Nouveautés, correctifs et changements…"></textarea></label>
        <button class="primary-button" type="submit">Publier le journal</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    </div>
    <div class="staff-publication-lists">
      <section><div class="staff-alerts-heading"><strong>Annonces publiées</strong><small>Informations propres à l’application</small></div><div id="staffAppAnnouncementsList" class="stack"></div></section>
      <section><div class="staff-alerts-heading"><strong>Journaux publiés</strong><small>Historique des versions</small></div><div id="staffUpdateLogsList" class="stack"></div></section>
    </div>`;
  const accountsPanel = document.querySelector("#staff-accounts");
  workspace.insertBefore(panel, accountsPanel || null);

  tab.addEventListener("click", () => {
    window.setTimeout(() => {
      if (!panel.classList.contains("active")) activateStaffPublicationTab(tab);
      else loadStaffPublications();
    }, 0);
  });
  panel.querySelector("#appAnnouncementForm").addEventListener("submit", publishAppAnnouncement);
  panel.querySelector("#updateLogForm").addEventListener("submit", publishUpdateLog);
  panel.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-publication");
    if (button) deletePublication(button);
  });
}

installPublicAnnouncementCenter();
installStaffPublicationPanel();
