const announcementApiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const announcementState = {
  active: "server",
  appLoaded: false,
  logsLoaded: false,
  appItems: []
};

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

function memberToken() {
  return localStorage.getItem("pixel-member-token") || "";
}

async function announcementApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const staffToken = sessionStorage.getItem("pixel-token") || "";
  const currentMemberToken = memberToken();
  if (options.staff && staffToken) headers.Authorization = `Bearer ${staffToken}`;
  if (options.member && currentMemberToken) headers.Authorization = `Bearer ${currentMemberToken}`;
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

function renderAnnouncementPoll(item) {
  const poll = item.poll;
  if (!poll || !Array.isArray(poll.options)) return "";
  const loggedIn = Boolean(memberToken());
  const stateLabel = poll.isClosed
    ? "Sondage terminé"
    : loggedIn
      ? "Choisis une réponse"
      : "Connexion membre nécessaire pour voter";
  const options = poll.options.map((option) => {
    const selected = Number(poll.selectedOptionId) === Number(option.id);
    return `
      <button class="announcement-poll-option${selected ? " selected" : ""}" type="button"
        data-announcement-id="${Number(item.id)}" data-poll-option-id="${Number(option.id)}"
        aria-pressed="${String(selected)}" ${poll.isClosed ? "disabled" : ""}>
        <span class="announcement-poll-option-row">
          <span class="announcement-poll-choice">${selected ? "✓" : ""}</span>
          <strong>${announcementEscape(option.label)}</strong>
          <small>${Number(option.percentage || 0)} %</small>
        </span>
        <span class="announcement-poll-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(option.percentage || 0)))}%"></i></span>
        <span class="announcement-poll-votes">${Number(option.votes || 0)} vote${Number(option.votes || 0) > 1 ? "s" : ""}</span>
      </button>`;
  }).join("");

  return `
    <section class="announcement-poll${poll.isClosed ? " closed" : ""}" aria-label="Sondage : ${announcementEscape(poll.question)}">
      <div class="announcement-poll-heading">
        <div><span class="announcement-poll-icon" aria-hidden="true">▥</span><strong>${announcementEscape(poll.question)}</strong></div>
        <small>${announcementEscape(stateLabel)}</small>
      </div>
      <div class="announcement-poll-options">${options}</div>
      <div class="announcement-poll-footer">
        <span>${Number(poll.totalVotes || 0)} participation${Number(poll.totalVotes || 0) > 1 ? "s" : ""}</span>
        <span class="announcement-poll-status" data-poll-status="${Number(item.id)}" aria-live="polite"></span>
      </div>
    </section>`;
}

function renderPublicAnnouncement(item) {
  return `
    <article class="announcement-card app-announcement-card" data-app-announcement-id="${Number(item.id)}">
      <div class="announcement-head">
        <div class="announcement-author">
          <span class="announcement-app-mark" aria-hidden="true">P</span>
          <div><strong>${announcementEscape(item.title)}</strong><small>Annonce de l’application</small></div>
        </div>
        <time>${announcementEscape(announcementDate(item.createdAt))}</time>
      </div>
      <p class="announcement-content">${announcementEscape(item.body)}</p>
      ${renderAnnouncementPoll(item)}
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
    const hasMember = Boolean(memberToken());
    let data;
    try {
      data = await announcementApi(
        hasMember ? "/members/app-announcements" : "/app-announcements",
        hasMember ? { member: true } : {}
      );
    } catch (error) {
      if (!hasMember) throw error;
      data = await announcementApi("/app-announcements");
    }
    const items = Array.isArray(data.announcements) ? data.announcements : [];
    announcementState.appItems = items;
    list.innerHTML = items.length
      ? items.map(renderPublicAnnouncement).join("")
      : emptyCard("Aucune annonce de l’application pour le moment.");
    announcementState.appLoaded = true;
  } catch (error) {
    list.innerHTML = emptyCard(error.message);
  }
}

async function voteInAnnouncementPoll(button) {
  const announcementId = Number(button.dataset.announcementId);
  const optionId = Number(button.dataset.pollOptionId);
  const status = document.querySelector(`[data-poll-status="${announcementId}"]`);
  if (!memberToken()) {
    if (status) status.textContent = "Connecte-toi avec ton compte membre pour voter.";
    return;
  }

  const poll = button.closest(".announcement-poll");
  poll?.querySelectorAll(".announcement-poll-option").forEach((option) => { option.disabled = true; });
  if (status) status.textContent = "Vote en cours…";
  try {
    const data = await announcementApi(`/members/app-announcements/${announcementId}/poll-vote`, {
      method: "POST",
      member: true,
      body: JSON.stringify({ optionId })
    });
    const item = announcementState.appItems.find((announcement) => Number(announcement.id) === announcementId);
    if (item) item.poll = data.poll;
    const card = document.querySelector(`[data-app-announcement-id="${announcementId}"]`);
    if (card && item) card.outerHTML = renderPublicAnnouncement(item);
  } catch (error) {
    if (status) status.textContent = error.message;
    poll?.querySelectorAll(".announcement-poll-option").forEach((option) => { option.disabled = false; });
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
      <span>Application</span><small>Infos et sondages</small>
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
  appList.addEventListener("click", (event) => {
    const button = event.target.closest(".announcement-poll-option");
    if (button) voteInAnnouncementPoll(button);
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
  const poll = !isLog && item.poll
    ? `<div class="staff-poll-summary"><strong>▥ ${announcementEscape(item.poll.question)}</strong><small>${Number(item.poll.totalVotes || 0)} vote${Number(item.poll.totalVotes || 0) > 1 ? "s" : ""} · ${item.poll.isClosed ? "Fermé" : "Ouvert"}</small></div>
       <button class="text-button toggle-poll" type="button" data-poll-closed="${String(Boolean(item.poll.isClosed))}">${item.poll.isClosed ? "Rouvrir le sondage" : "Fermer le sondage"}</button>`
    : "";
  return `
    <article class="staff-publication-card" data-publication-kind="${kind}" data-publication-id="${Number(item.id)}">
      <div>
        <strong>${announcementEscape(label)}</strong>
        <small>${announcementEscape(announcementDate(item.createdAt))} · ${announcementEscape(item.author || "Équipe PDD")}</small>
      </div>
      <p>${announcementEscape(item.body)}</p>
      ${poll}
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

function pollFromForm(form) {
  const formData = new FormData(form);
  if (!formData.has("pollEnabled")) return null;
  return {
    question: formData.get("pollQuestion"),
    options: String(formData.get("pollOptions") || "")
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean)
  };
}

async function publishAppAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form));
  const poll = pollFromForm(form);
  submit.disabled = true;
  setStaffStatus(form, "Publication…");
  try {
    const data = await announcementApi("/staff/app-announcements", {
      method: "POST",
      staff: true,
      body: JSON.stringify({ title: values.title, body: values.body, poll })
    });
    form.reset();
    form.querySelector(".staff-poll-fields").hidden = true;
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

async function togglePoll(button) {
  const card = button.closest("[data-publication-id]");
  const id = card?.dataset.publicationId;
  if (!id) return;
  const isClosed = button.dataset.pollClosed !== "true";
  button.disabled = true;
  try {
    await announcementApi(`/staff/app-announcements/${id}/poll`, {
      method: "PATCH",
      staff: true,
      body: JSON.stringify({ isClosed })
    });
    announcementState.appLoaded = false;
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
        <label class="staff-poll-toggle"><input name="pollEnabled" type="checkbox" /> <span>Ajouter un sondage à l’annonce</span></label>
        <div class="staff-poll-fields" hidden>
          <label>Question du sondage<input name="pollQuestion" maxlength="220" placeholder="Ex. Quelle fonction voulez-vous ensuite ?" /></label>
          <label>Réponses<textarea name="pollOptions" rows="5" maxlength="800" placeholder="Une réponse par ligne\nMode sombre\nNouveaux mini-jeux\nPlus de personnalisation"></textarea></label>
          <small>Entre 2 et 6 réponses. Un membre peut modifier son vote.</small>
        </div>
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
      <section><div class="staff-alerts-heading"><strong>Annonces publiées</strong><small>Informations et sondages de l’application</small></div><div id="staffAppAnnouncementsList" class="stack"></div></section>
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
  const announcementForm = panel.querySelector("#appAnnouncementForm");
  announcementForm.addEventListener("submit", publishAppAnnouncement);
  announcementForm.querySelector('[name="pollEnabled"]').addEventListener("change", (event) => {
    const fields = announcementForm.querySelector(".staff-poll-fields");
    fields.hidden = !event.currentTarget.checked;
    fields.querySelector('[name="pollQuestion"]').required = event.currentTarget.checked;
    fields.querySelector('[name="pollOptions"]').required = event.currentTarget.checked;
  });
  panel.querySelector("#updateLogForm").addEventListener("submit", publishUpdateLog);
  panel.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-publication");
    if (deleteButton) deletePublication(deleteButton);
    const pollButton = event.target.closest(".toggle-poll");
    if (pollButton) togglePoll(pollButton);
  });
}

installPublicAnnouncementCenter();
installStaffPublicationPanel();
