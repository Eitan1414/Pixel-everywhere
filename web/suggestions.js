const suggestionStatusLabels = {
  pending: "En attente",
  reviewing: "En cours d’étude",
  planned: "Planifiée",
  accepted: "Acceptée",
  rejected: "Refusée",
  implemented: "Ajoutée"
};

function suggestionFormatDate(value) {
  if (!value) return "";
  const normalized = String(value);
  const date = new Date(`${normalized}${normalized.endsWith("Z") || normalized.includes("+") ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return normalized;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function suggestionEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function memberSuggestionToken() {
  return localStorage.getItem("pixel-member-token") || "";
}

function staffSuggestionToken() {
  return sessionStorage.getItem("pixel-token") || "";
}

async function suggestionApi(path, { method = "GET", body, auth = "member" } = {}) {
  const token = auth === "staff" ? staffSuggestionToken() : memberSuggestionToken();
  if (!token) {
    throw new Error(auth === "staff" ? "Connecte-toi au staff." : "Connecte ton compte membre.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "ngrok-skip-browser-warning": "pixel-everywhere"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Serveur Pixel Everywhere inaccessible.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details) && data.details.length
      ? ` ${data.details.join(" • ")}`
      : "";
    throw new Error(`${data.error || "Une erreur est survenue."}${details}`);
  }
  return data;
}

function installSuggestionNavigation() {
  const featureGrid = document.querySelector("#page-home .feature-grid");
  if (featureGrid && !featureGrid.querySelector('[data-page-target="suggestions"]')) {
    const card = document.createElement("button");
    card.className = "feature-card suggestion-feature";
    card.dataset.pageTarget = "suggestions";
    card.innerHTML = `
      <span class="feature-icon suggestion-icon">💡</span>
      <span><strong>Suggestions</strong><small>Propose une idée de mise à jour au staff</small></span>
    `;
    featureGrid.append(card);
  }

  const bottomNav = document.querySelector(".bottom-nav");
  if (bottomNav && !bottomNav.querySelector('[data-page-target="suggestions"]')) {
    const button = document.createElement("button");
    button.dataset.pageTarget = "suggestions";
    button.innerHTML = "<span>💡</span><small>Idées</small>";
    const credits = bottomNav.querySelector('[data-page-target="credits"]');
    bottomNav.insertBefore(button, credits || null);
  }

  const guideActions = document.querySelector(".guide-actions");
  if (guideActions && !guideActions.querySelector('[data-guide-page="suggestions"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.guidePage = "suggestions";
    button.innerHTML = "<strong>Suggestions</strong><small>Proposer une amélioration et suivre les réponses</small>";
    const staffButton = guideActions.querySelector('[data-guide-page="staff"]');
    guideActions.insertBefore(button, staffButton || null);
  }
}

function installMemberSuggestionPage() {
  const main = document.querySelector("#mainContent");
  if (!main || document.querySelector("#page-suggestions")) return;

  const page = document.createElement("section");
  page.id = "page-suggestions";
  page.className = "page";
  page.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">La communauté imagine la suite</p>
        <h2>Suggestions de mises à jour</h2>
      </div>
      <button id="refreshSuggestions" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div class="privacy-note">
      Propose une fonctionnalité ou une amélioration. Les modérateurs pourront l’étudier, changer son statut et te répondre directement.
    </div>
    <article id="suggestionMemberGate" class="card member-gate hidden">
      <img src="./assets/pixel-mascot.png" alt="" />
      <div>
        <h3>Compte membre nécessaire</h3>
        <p>Connecte-toi pour envoyer une suggestion et suivre les réponses du staff.</p>
        <button id="openSuggestionMemberAccount" class="primary-button" type="button">Connexion / inscription</button>
      </div>
    </article>
    <form id="suggestionForm" class="card form-card hidden">
      <label>
        Titre de la suggestion
        <input name="title" minlength="5" maxlength="120" required placeholder="Ex. Ajouter des accessoires pour Pixel" />
      </label>
      <label>
        Explique ton idée
        <textarea name="description" minlength="20" maxlength="4000" rows="7" required placeholder="Décris le fonctionnement, l’intérêt pour les membres et les détails importants…"></textarea>
      </label>
      <button class="primary-button" type="submit">Envoyer aux modérateurs</button>
      <p id="suggestionFormStatus" class="form-status" aria-live="polite"></p>
    </form>
    <div class="suggestion-list-heading">
      <div><strong>Mes suggestions</strong><small>Les réponses apparaissent aussi dans ta messagerie membre.</small></div>
    </div>
    <div id="memberSuggestionsList" class="suggestion-list"></div>
  `;

  const creditsPage = document.querySelector("#page-credits");
  main.insertBefore(page, creditsPage || document.querySelector("#page-staff"));
}

function installStaffSuggestionPanel() {
  const tabs = document.querySelector(".staff-tabs");
  const workspace = document.querySelector("#staffWorkspace");
  if (!tabs || !workspace || document.querySelector("#staff-suggestions")) return;

  const tab = document.createElement("button");
  tab.type = "button";
  tab.dataset.staffTab = "suggestions";
  tab.textContent = "Suggestions";
  const accountsTab = tabs.querySelector('[data-staff-tab="accounts"]');
  tabs.insertBefore(tab, accountsTab || null);

  const panel = document.createElement("section");
  panel.id = "staff-suggestions";
  panel.className = "staff-panel";
  panel.innerHTML = `
    <div class="staff-suggestion-heading">
      <div>
        <strong>Suggestions des membres</strong>
        <small>Réponds au membre et indique l’avancement de son idée.</small>
      </div>
      <button id="refreshStaffSuggestions" class="icon-button" type="button" aria-label="Actualiser">↻</button>
    </div>
    <div id="staffSuggestionsList" class="suggestion-list"></div>
  `;
  const accountsPanel = document.querySelector("#staff-accounts");
  workspace.insertBefore(panel, accountsPanel || null);
}

function memberSuggestionCard(suggestion) {
  const replies = Array.isArray(suggestion.replies) ? suggestion.replies : [];
  const repliesHtml = replies.length
    ? `<div class="suggestion-thread">${replies.map((reply) => `
        <article class="suggestion-reply">
          <div><strong>${suggestionEscape(reply.staff_username)} • PDD Staff</strong><time>${suggestionFormatDate(reply.created_at)}</time></div>
          <p>${suggestionEscape(reply.body)}</p>
          <small>Statut après la réponse : ${suggestionEscape(suggestionStatusLabels[reply.status_after] || reply.status_after)}</small>
        </article>
      `).join("")}</div>`
    : '<p class="suggestion-no-reply">Le staff n’a pas encore répondu.</p>';

  return `
    <article class="suggestion-card">
      <div class="suggestion-card-head">
        <div><strong>${suggestionEscape(suggestion.title)}</strong><time>${suggestionFormatDate(suggestion.created_at)}</time></div>
        <span class="suggestion-status status-${suggestionEscape(suggestion.status)}">${suggestionEscape(suggestionStatusLabels[suggestion.status] || suggestion.status)}</span>
      </div>
      <p class="suggestion-description">${suggestionEscape(suggestion.description)}</p>
      ${repliesHtml}
    </article>
  `;
}

async function loadMemberSuggestions() {
  const gate = document.querySelector("#suggestionMemberGate");
  const form = document.querySelector("#suggestionForm");
  const list = document.querySelector("#memberSuggestionsList");
  if (!gate || !form || !list) return;

  const signedIn = Boolean(memberSuggestionToken());
  gate.classList.toggle("hidden", signedIn);
  form.classList.toggle("hidden", !signedIn);

  if (!signedIn) {
    list.innerHTML = '<div class="empty-state">Connecte ton compte membre pour afficher tes suggestions.</div>';
    return;
  }

  list.innerHTML = '<div class="loading-card">Chargement des suggestions…</div>';
  try {
    const data = await suggestionApi("/members/suggestions");
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    list.innerHTML = suggestions.length
      ? suggestions.map(memberSuggestionCard).join("")
      : '<div class="empty-state">Tu n’as encore envoyé aucune suggestion.</div>';
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${suggestionEscape(error.message)}</div>`;
  }
}

function staffSuggestionCard(suggestion) {
  const replies = Array.isArray(suggestion.replies) ? suggestion.replies : [];
  return `
    <article class="suggestion-card staff-suggestion-card" data-suggestion-id="${Number(suggestion.id)}">
      <div class="suggestion-card-head">
        <div>
          <strong>${suggestionEscape(suggestion.title)}</strong>
          <small>${suggestionEscape(suggestion.member_display_name)} (@${suggestionEscape(suggestion.member_username)})</small>
          <time>${suggestionFormatDate(suggestion.created_at)}</time>
        </div>
        <span class="suggestion-status status-${suggestionEscape(suggestion.status)}">${suggestionEscape(suggestionStatusLabels[suggestion.status] || suggestion.status)}</span>
      </div>
      <p class="suggestion-description">${suggestionEscape(suggestion.description)}</p>
      <div class="suggestion-thread">
        ${replies.length ? replies.map((reply) => `
          <article class="suggestion-reply">
            <div><strong>${suggestionEscape(reply.staff_username)}</strong><time>${suggestionFormatDate(reply.created_at)}</time></div>
            <p>${suggestionEscape(reply.body)}</p>
          </article>
        `).join("") : '<p class="suggestion-no-reply">Aucune réponse envoyée.</p>'}
      </div>
      <form class="suggestion-reply-form">
        <label>
          Nouveau statut
          <select name="status">
            ${Object.entries(suggestionStatusLabels).map(([value, label]) => `<option value="${value}" ${value === suggestion.status ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>
          Réponse au membre
          <textarea name="body" minlength="2" maxlength="3000" rows="4" required placeholder="Explique la décision ou l’avancement de cette idée…"></textarea>
        </label>
        <button class="primary-button" type="submit">Répondre et notifier le membre</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    </article>
  `;
}

async function loadStaffSuggestions() {
  const list = document.querySelector("#staffSuggestionsList");
  if (!list) return;
  if (!staffSuggestionToken()) {
    list.innerHTML = '<div class="empty-state">Connecte-toi au staff pour lire les suggestions.</div>';
    return;
  }

  list.innerHTML = '<div class="loading-card">Chargement des suggestions…</div>';
  try {
    const data = await suggestionApi("/staff/suggestions", { auth: "staff" });
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    list.innerHTML = suggestions.length
      ? suggestions.map(staffSuggestionCard).join("")
      : '<div class="empty-state">Aucune suggestion reçue pour le moment.</div>';
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${suggestionEscape(error.message)}</div>`;
  }
}

function installSuggestionEvents() {
  document.querySelectorAll('[data-page-target="suggestions"], [data-guide-page="suggestions"]').forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(loadMemberSuggestions, 0));
  });

  document.querySelector("#refreshSuggestions")?.addEventListener("click", loadMemberSuggestions);
  document.querySelector("#openSuggestionMemberAccount")?.addEventListener("click", () => {
    document.querySelector("#accountButton")?.click();
  });

  document.querySelector("#suggestionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const status = form.querySelector(".form-status");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Envoi aux modérateurs…";
    try {
      const data = await suggestionApi("/members/suggestions", {
        method: "POST",
        body: values
      });
      form.reset();
      status.className = "form-status success";
      status.textContent = data.message;
      await loadMemberSuggestions();
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const staffTab = document.querySelector('[data-staff-tab="suggestions"]');
  staffTab?.addEventListener("click", () => window.setTimeout(loadStaffSuggestions, 0));
  document.querySelector("#refreshStaffSuggestions")?.addEventListener("click", loadStaffSuggestions);

  document.querySelector("#staffSuggestionsList")?.addEventListener("submit", async (event) => {
    const form = event.target.closest(".suggestion-reply-form");
    if (!form) return;
    event.preventDefault();
    const card = form.closest("[data-suggestion-id]");
    const suggestionId = Number(card?.dataset.suggestionId);
    const button = form.querySelector("button[type='submit']");
    const status = form.querySelector(".form-status");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Envoi de la réponse…";
    try {
      const data = await suggestionApi(`/staff/suggestions/${suggestionId}/replies`, {
        method: "POST",
        body: values,
        auth: "staff"
      });
      status.className = "form-status success";
      status.textContent = data.message;
      await loadStaffSuggestions();
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
      button.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (document.querySelector("#page-suggestions.active")) loadMemberSuggestions();
    if (document.querySelector("#staff-suggestions.active")) loadStaffSuggestions();
  });
}

installSuggestionNavigation();
installMemberSuggestionPage();
installStaffSuggestionPanel();
installSuggestionEvents();
