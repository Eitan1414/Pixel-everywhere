import "./v17-notifications.css";

// v1.7 notification inbox. Foreground sync only: no claim of background push.
const $ = (selector, root = document) => root.querySelector(selector);
const element = (tag, cls, value) => {
  const result = document.createElement(tag);
  if (cls) result.className = cls;
  if (value !== undefined) result.textContent = String(value);
  return result;
};
const apiBase = () => String(
  localStorage.getItem("pixel-api-base-url") || import.meta.env.VITE_API_BASE_URL || "/api"
).replace(/\/$/, "");

async function memberAPI(path, method = "GET", body) {
  const token = localStorage.getItem("pixel-member-token");
  if (!token) throw Error("Connecte-toi à ton compte membre PE pour voir tes notifications.");
  const headers = { Authorization: "Bearer " + token };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (apiBase().includes(".ngrok-free.")) headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  let response;
  try {
    response = await fetch(apiBase() + path, {
      method, headers, cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw Error("Serveur PDD inaccessible. Vérifie la connexion et Termux.");
  }
  if (!String(response.headers.get("content-type") || "").includes("application/json")) {
    throw Error("Réponse inattendue du serveur PDD ou page ngrok.");
  }
  const payload = await response.json().catch(() => {
    throw Error("Réponse invalide du serveur PDD.");
  });
  if (!response.ok) throw Error(payload.error || "Impossible de récupérer les notifications.");
  if (token !== localStorage.getItem("pixel-member-token")) {
    throw Error("Le compte membre a changé.");
  }
  return payload;
}

function installNotificationCenter() {
  const main = $("#mainContent");
  const grid = $("#page-home .feature-grid");
  const bar = $(".topbar-actions");
  if (!main || !grid || $("#page-v17-notifications")) return;

  const page = element("section", "page v17-notifications-page");
  page.id = "page-v17-notifications";
  const heading = element("div", "v17-notifications-heading");
  heading.append(element("p", "eyebrow", "Pixel Everywhere · Communauté"));
  heading.append(element("h2", "", "Mes notifications"));
  const description = element("p", "v17-notifications-muted",
    "Les annonces officielles PDD, synchronisées depuis Discord lorsque l'application est ouverte et connectée au serveur.");
  const status = element("p", "v17-notifications-muted", "Connexion au compte membre…");
  status.setAttribute("role", "status");
  const controls = element("div", "v17-notifications-controls");
  const all = element("button", "v17-notifications-filter is-active", "Toutes");
  const unread = element("button", "v17-notifications-filter", "Non lues");
  const markAll = element("button", "v17-notifications-action", "Tout marquer comme lu");
  const refresh = element("button", "v17-notifications-action", "Actualiser");
  for (const item of [all, unread, markAll, refresh]) item.type = "button";
  controls.append(all, unread, markAll, refresh);
  const preferences = element("label", "v17-notifications-preference");
  const optIn = element("input");
  optIn.type = "checkbox";
  const optInDescription = element("span", "",
    "M'avertir des nouvelles annonces PDD dans l'application");
  preferences.append(optIn, optInDescription);
  const list = element("div", "v17-notifications-list");
  const goToAnnouncements = element("button", "v17-notifications-action", "Voir les annonces complètes");
  goToAnnouncements.type = "button";
  page.append(heading, description, status, controls, preferences, list, goToAnnouncements);
  main.append(page);

  const tile = element("button", "feature-card v17-notifications-tile");
  tile.type = "button";
  const icon = element("span", "feature-icon orange", "♧");
  const caption = element("span");
  caption.append(element("strong", "", "Notifications"), element("small", "", "Annonces et nouveautés PDD"));
  const tileBadge = element("b", "v17-notifications-badge", "");
  tileBadge.hidden = true;
  tile.append(icon, caption, tileBadge);
  grid.append(tile);

  const bell = element("button", "inbox-button hidden v17-notifications-bell", "🔔");
  bell.type = "button";
  bell.setAttribute("aria-label", "Ouvrir les notifications PDD");
  const bellBadge = element("b", "v17-notifications-badge", "");
  bellBadge.hidden = true;
  bell.append(bellBadge);
  if (bar) bar.insertBefore(bell, $("#accountButton"));

  let snapshot = null;
  let token = "";
  let filter = "all";
  let loading = false;
  let retryAfterLoad = false;
  let previousUnread = null;

  function updateBadge(count) {
    const countText = count > 99 ? "99+" : String(count);
    for (const target of [tileBadge, bellBadge]) {
      target.hidden = count <= 0;
      target.textContent = countText;
    }
    bell.setAttribute("aria-label",
      count > 0 ? count + " annonce(s) PDD non lue(s)" : "Ouvrir les notifications PDD");
    tile.setAttribute("aria-label",
      count > 0 ? "Notifications, " + count + " annonce(s) non lue(s)" : "Notifications PDD");
  }

  function toastNew(count) {
    const notice = element("div", "v17-notifications-toast",
      count === 1 ? "🔔 Nouvelle annonce PDD !" : "🔔 " + count + " nouvelles annonces PDD !");
    notice.setAttribute("role", "status");
    document.body.append(notice);
    window.setTimeout(() => notice.remove(), 4500);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date inconnue" : date.toLocaleString("fr-FR");
  }

  function render() {
    list.replaceChildren();
    all.classList.toggle("is-active", filter === "all");
    unread.classList.toggle("is-active", filter === "unread");
    bell.classList.toggle("hidden", !token);
    if (!token) {
      status.textContent = "Connecte-toi à ton compte membre pour consulter les notifications.";
      controls.hidden = true;
      preferences.hidden = true;
      goToAnnouncements.hidden = false;
      list.append(element("p", "v17-notifications-empty",
        "Aucune session membre active. Utilise le bouton Compte pour te connecter."));
      updateBadge(0);
      return;
    }
    controls.hidden = false;
    if (!snapshot) {
      preferences.hidden = true;
      list.append(element("p", "v17-notifications-muted", "Chargement des annonces…"));
      return;
    }
    preferences.hidden = !snapshot.configured;
    optIn.checked = Boolean(snapshot.settings?.announcementsEnabled);
    if (!snapshot.configured) {
      status.textContent = "Le salon des annonces Discord n'est pas configuré sur le serveur.";
      list.append(element("p", "v17-notifications-empty",
        "Les notifications seront disponibles après configuration du bot Discord PDD."));
      markAll.disabled = true;
      updateBadge(0);
      return;
    }
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    updateBadge(Number(snapshot.unreadCount) || 0);
    markAll.disabled = !items.some((item) => !item.read);
    status.textContent = items.length
      ? (Number(snapshot.unreadCount) || 0) + " annonce(s) non lue(s) · " + items.length + " annonce(s) récentes"
      : "Aucune annonce officielle récente.";
    const visible = filter === "unread" ? items.filter((item) => !item.read) : items;
    if (!visible.length) {
      list.append(element("p", "v17-notifications-empty", filter === "unread"
        ? "Tout est lu ! Aucune annonce non lue pour le moment."
        : "Aucune annonce récente pour le moment."));
      return;
    }
    for (const item of visible) {
      const card = element("article", "v17-notification-card" + (item.read ? "" : " is-unread"));
      const top = element("div", "v17-notification-top");
      const author = element("span", "v17-notification-author", item.author || "PDD");
      const date = element("time", "v17-notifications-muted", formatDate(item.createdAt));
      top.append(author, date);
      const title = element("strong", "", item.title || "Annonce PDD");
      const body = element("p", "", item.body || "Une annonce a été publiée sur Discord.");
      const actions = element("div", "v17-notification-actions");
      const open = element("button", "v17-notifications-action", "Lire les annonces");
      open.type = "button";
      const read = element("button", "v17-notifications-action",
        item.read ? "Déjà lu" : "Marquer comme lu");
      read.type = "button";
      read.disabled = Boolean(item.read);
      read.addEventListener("click", async () => {
        read.disabled = true;
        try {
          await memberAPI("/members/notifications/read", "POST", { ids: [item.id] });
          await load({notify: false});
        } catch (error) {
          status.textContent = error.message;
          read.disabled = false;
        }
      });
      open.addEventListener("click", async () => {
        if (!item.read) {
          try { await memberAPI("/members/notifications/read", "POST", { ids: [item.id] }); }
          catch (error) { status.textContent = error.message; }
        }
        const target = $('.bottom-nav [data-page-target="announcements"]');
        if (target) target.click();
        else {
          document.querySelectorAll(".page.active").forEach((node) => node.classList.remove("active"));
          $("#page-announcements")?.classList.add("active");
        }
        void load({notify: false});
      });
      actions.append(open, read);
      card.append(top, title, body, actions);
      list.append(card);
    }
  }

  async function load({ notify = true } = {}) {
    const currentToken = localStorage.getItem("pixel-member-token") || "";
    if (!currentToken) {
      token = "";
      snapshot = null;
      previousUnread = null;
      render();
      return;
    }
    if (loading) { retryAfterLoad = true; return; }
    loading = true;
    refresh.disabled = true;
    try {
      const result = await memberAPI("/members/notifications");
      if (currentToken !== localStorage.getItem("pixel-member-token")) return;
      if (token !== currentToken) {
        previousUnread = null;
      }
      token = currentToken;
      const newUnread = new Set((result.items || []).filter((item) => !item.read).map((item) => item.id));
      if (notify && previousUnread && result.settings?.announcementsEnabled &&
        document.visibilityState === "visible") {
        const newCount = [...newUnread].filter((id) => !previousUnread.has(id)).length;
        if (newCount) toastNew(newCount);
      }
      previousUnread = newUnread;
      snapshot = result;
      render();
    } catch (error) {
      if (currentToken === localStorage.getItem("pixel-member-token")) {
        status.textContent = error.message;
        if (!snapshot) list.replaceChildren(element("p", "v17-notifications-empty", error.message));
        if (/session|connexion|401|compte a changé/i.test(error.message)) updateBadge(0);
      }
    } finally {
      loading = false;
      refresh.disabled = false;
      if (retryAfterLoad) { retryAfterLoad = false; void load({notify: false}); }
    }
  }

  function showPage() {
    document.querySelectorAll(".page.active").forEach((section) => section.classList.remove("active"));
    page.classList.add("active");
    window.scrollTo({top: 0, behavior: "smooth"});
    void load({notify: false});
  }

  tile.addEventListener("click", showPage);
  bell.addEventListener("click", showPage);
  refresh.addEventListener("click", () => load({notify: false}));
  goToAnnouncements.addEventListener("click", () =>
    $('.bottom-nav [data-page-target="announcements"]')?.click()
  );
  all.addEventListener("click", () => {filter = "all";render();});
  unread.addEventListener("click", () => {filter = "unread";render();});
  markAll.addEventListener("click", async () => {
    markAll.disabled = true;
    try {
      await memberAPI("/members/notifications/read", "POST", {all: true});
      await load({notify: false});
    } catch (error) {
      status.textContent = error.message;
      markAll.disabled = false;
    }
  });
  optIn.addEventListener("change", async () => {
    optIn.disabled = true;
    try {
      await memberAPI("/members/notifications/settings", "PUT",
        {announcementsEnabled: optIn.checked});
      await load({notify: false});
    } catch (error) {
      status.textContent = error.message;
      optIn.checked = !optIn.checked;
    } finally {optIn.disabled = false;}
  });

  window.addEventListener("pixel:member-session-changed", () => {
    token = "";
    snapshot = null;
    previousUnread = null;
    if (localStorage.getItem("pixel-member-token")) void load({notify: false});
    else render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void load({notify: true});
  });
  window.addEventListener("focus", () => {
    if (document.visibilityState === "visible") void load({notify: true});
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible" && localStorage.getItem("pixel-member-token")) {
      void load({notify: true});
    }
  }, 60_000);

  token = localStorage.getItem("pixel-member-token") || "";
  render();
  if (token) void load({notify: false});
}

installNotificationCenter();
