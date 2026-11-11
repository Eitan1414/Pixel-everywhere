import "./v17-inbox.css";
import {
  INBOX_TABS, inboxSectionForPage, inboxUnreadTotals,
  inboxSearchMatch, normalizeUnread
} from "./v17-inbox-model.js";

const $ = (selector, root = document) => root.querySelector(selector);
const create = (tag, className = "", text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = String(text);
  return item;
};

function installUnifiedInbox() {
  if ($("#v17UnifiedInboxButton")) return;
  const bar = $(".topbar-actions");
  const grid = $("#page-home .feature-grid");
  const main = $("#mainContent");
  const conversationPage = $("#page-conversations");
  const notificationPage = $("#page-v17-notifications");
  const lettersPage = $("#page-member-inbox");
  if (!bar || !grid || !main || !conversationPage || !notificationPage || !lettersPage) return;

  // Keep the existing, tested inbox components mounted. Hide only duplicate
  // launch buttons and the old two-tab strip; their handlers remain usable.
  for (const selector of [
    "#conversationInboxButton", "#memberInboxButton",
    ".v17-notifications-bell", "#conversationFeature", ".v17-notifications-tile"
  ]) {
    $(selector)?.classList.add("v17-inbox-legacy");
  }
  conversationPage.querySelector(".conversation-mode-tabs")
    ?.classList.add("v17-inbox-old-tabs");

  const headerButton = create("button", "inbox-button v17-inbox-launch");
  headerButton.id = "v17UnifiedInboxButton";
  headerButton.type = "button";
  headerButton.setAttribute("aria-label", "Ouvrir la messagerie PE");
  headerButton.append(create("span", "", "✉"));
  const headerBadge = create("b", "v17-inbox-unread");
  headerBadge.hidden = true;
  headerButton.append(headerBadge);
  bar.insertBefore(headerButton, $("#accountButton") || null);

  const feature = create("button", "feature-card v17-inbox-feature");
  feature.type = "button";
  feature.id = "v17UnifiedInboxFeature";
  feature.append(
    create("span", "feature-icon cyan", "✉"),
    (() => {
      const caption = create("span");
      caption.append(
        create("strong", "", "Messagerie"),
        create("small", "", "MP, échanges staff et notifications PDD")
      );
      return caption;
    })()
  );
  const featureBadge = create("b", "v17-inbox-unread");
  featureBadge.hidden = true;
  feature.append(featureBadge);
  grid.append(feature);

  const pages = [conversationPage, notificationPage, lettersPage];
  const tabBars = [];
  let selected = "staff";
  let activeMode = "staff";
  let search = { private: "", staff: "" };

  function memberConnected() {
    return Boolean(localStorage.getItem("pixel-member-token"));
  }

  function staffConnected() {
    return Boolean(sessionStorage.getItem("pixel-token"));
  }

  function activate(tab) {
    if (tab === "private") {
      if (!memberConnected()) {
        $("#accountButton")?.click();
        return;
      }
      const trigger = $("#conversationFeature");
      trigger?.click();
      // Reuse community-messaging's own tab logic and conversation cache.
      $("#memberDirectTab")?.click();
    } else if (tab === "staff") {
      if (!memberConnected() && !staffConnected()) {
        $("#accountButton")?.click();
        return;
      }
      $("#conversationFeature")?.click();
      $("#supportConversationTab")?.click();
    } else if (tab === "notifications") {
      $(".v17-notifications-tile")?.click();
    }
    selected = tab;
    syncTabs();
  }

  function pageTab(page) {
    if (!page?.classList.contains("active")) return null;
    const directSelected = $("#memberDirectTab")?.classList.contains("active");
    return inboxSectionForPage(page.id, directSelected);
  }

  function syncTabs() {
    for (const page of pages) {
      const nav = page.querySelector(".v17-inbox-tabs");
      if (!nav) continue;
      const current = pageTab(page);
      if (current) selected = current;
      for (const tab of nav.querySelectorAll("[data-inbox-tab]")) {
        const active = tab.dataset.inboxTab === (current || selected);
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        // Every tab remains keyboard-reachable, including inactive sections.
        tab.tabIndex = 0;
      }
    }
    const current = pages.map(pageTab).find(Boolean);
    if (current) {
      activeMode = current;
      const title = $("#v17InboxSearch");
      const lettersShortcut = $("#v17InboxLettersShortcut");
      const lettersHint = $("#v17InboxLettersHint");
      if (title) {
        title.value = search[current] || "";
        title.placeholder = current === "private"
          ? "Chercher un membre ou un message privé…"
          : "Chercher une discussion du staff…";
        title.disabled = current === "notifications";
      }
      if (lettersShortcut) {
        lettersShortcut.hidden = current !== "staff" || !memberConnected();
      }
      if (lettersHint) {
        lettersHint.hidden = current !== "staff" || !memberConnected();
      }
      applySearch();
    }
  }

  function createTabBar(page) {
    const nav = create("nav", "v17-inbox-tabs");
    nav.setAttribute("aria-label", "Rubriques de messagerie");
    nav.setAttribute("role", "tablist");
    for (const definition of INBOX_TABS) {
      const button = create("button", "v17-inbox-tab");
      button.type = "button";
      button.dataset.inboxTab = definition.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.append(
        create("span", "v17-inbox-tab-icon", definition.icon),
        create("span", "v17-inbox-tab-label", definition.label)
      );
      const count = create("b", "v17-inbox-tab-count");
      count.hidden = true;
      button.append(count);
      button.addEventListener("click", () => activate(definition.id));
      nav.append(button);
    }
    const heading = page.querySelector(
      ".conversation-heading, .v17-notifications-heading, .section-heading"
    );
    if (heading) heading.after(nav);
    else page.prepend(nav);
    tabBars.push(nav);
  }
  pages.forEach(createTabBar);

  const searchRow = create("div", "v17-inbox-search-row");
  const searchBox = create("input", "v17-inbox-search");
  searchBox.id = "v17InboxSearch";
  searchBox.type = "search";
  searchBox.autocomplete = "off";
  searchBox.maxLength = 100;
  searchBox.setAttribute("aria-label", "Rechercher dans les conversations affichées");
  searchBox.placeholder = "Chercher une discussion…";
  const lettersShortcut = create("button", "v17-inbox-letters-link", "Courriers officiels du staff");
  lettersShortcut.id = "v17InboxLettersShortcut";
  lettersShortcut.type = "button";
  lettersShortcut.hidden = !memberConnected();
  searchRow.append(searchBox, lettersShortcut);
  conversationPage.querySelector(".v17-inbox-tabs")?.after(searchRow);

  const lettersHint = create("p", "v17-inbox-letters-hint",
    "Les courriers administratifs de PDD restent accessibles depuis l’onglet Staff.");
  lettersHint.id = "v17InboxLettersHint";
  lettersHint.hidden = !memberConnected();
  searchRow.after(lettersHint);

  const emptySearch = create("p", "v17-inbox-search-empty",
    "Aucune conversation ne correspond à cette recherche.");
  emptySearch.hidden = true;
  searchRow.after(emptySearch);

  function applySearch() {
    const isConversations = conversationPage.classList.contains("active");
    if (!isConversations) {
      emptySearch.hidden = true;
      return;
    }
    const mode = $("#memberDirectTab")?.classList.contains("active")
      ? "private" : "staff";
    const list = mode === "private" ? $("#memberDirectList") : $("#conversationList");
    const query = search[mode] || "";
    let count = 0;
    let matching = 0;
    for (const button of list?.querySelectorAll(".conversation-thread") || []) {
      count += 1;
      const matches = inboxSearchMatch(button.textContent, query);
      button.classList.toggle("v17-inbox-filtered", !matches);
      if (matches) matching += 1;
    }
    emptySearch.hidden = !query || count === 0 || matching > 0;
  }

  searchBox.addEventListener("input", () => {
    const mode = $("#memberDirectTab")?.classList.contains("active")
      ? "private" : "staff";
    search[mode] = searchBox.value;
    applySearch();
  });

  lettersShortcut.addEventListener("click", () => {
    if (!memberConnected()) return;
    $("#memberInboxButton")?.click();
  });

  // A common tab strip is also present on the legacy staff-letters page,
  // so users never reach a dead end when opening an old notification.
  const lettersBack = create("p", "v17-inbox-letters-hint",
    "Courriers reçus de PDD · Retrouve les autres échanges dans les onglets ci-dessus.");
  lettersPage.querySelector(".v17-inbox-tabs")?.after(lettersBack);

  function readCount(selector) {
    const badge = $(selector);
    if (!badge || badge.hidden || badge.classList.contains("hidden")) return 0;
    return normalizeUnread(badge.textContent);
  }

  function updateCounts() {
    const totals = inboxUnreadTotals({
      direct: readCount("#memberDirectBadge"),
      support: readCount("#conversationBadge"),
      letters: readCount("#inboxBadge"),
      notifications: readCount(".v17-notifications-bell .v17-notifications-badge")
    });
    for (const badge of [headerBadge, featureBadge]) {
      badge.hidden = totals.total === 0;
      badge.textContent = totals.total > 99 ? "99+" : String(totals.total);
    }
    headerButton.setAttribute("aria-label",
      totals.total
        ? "Messagerie, " + totals.total + " élément(s) non lu(s)"
        : "Ouvrir la messagerie PE");
    for (const nav of tabBars) {
      for (const button of nav.querySelectorAll("[data-inbox-tab]")) {
        const count = totals[button.dataset.inboxTab] || 0;
        const badge = button.querySelector(".v17-inbox-tab-count");
        badge.hidden = count === 0;
        badge.textContent = count > 99 ? "99+" : String(count);
      }
    }
  }

  for (const badgeSelector of [
    "#memberDirectBadge", "#conversationBadge", "#inboxBadge",
    ".v17-notifications-bell .v17-notifications-badge"
  ]) {
    const badge = $(badgeSelector);
    if (!badge) continue;
    new MutationObserver(updateCounts).observe(badge, {
      attributes:true,attributeFilter:["class","hidden"],
      childList:true,subtree:true,characterData:true
    });
  }

  for (const target of ["#memberDirectList", "#conversationList"]) {
    const list = $(target);
    if (list) {
      new MutationObserver(applySearch).observe(list,{childList:true});
    }
  }

  for (const page of pages) {
    new MutationObserver(syncTabs).observe(page,{
      attributes:true,attributeFilter:["class"]
    });
  }
  for (const tab of ["#memberDirectTab","#supportConversationTab"]) {
    const item = $(tab);
    if (item) new MutationObserver(syncTabs).observe(item,{
      attributes:true,attributeFilter:["class"]
    });
  }

  for (const button of [headerButton, feature]) {
    button.addEventListener("click", () => {
      if (memberConnected()) activate("private");
      else if (staffConnected()) activate("staff");
      else activate("notifications");
    });
  }
  window.addEventListener("pixel:member-session-changed", () => {
    search = {private:"",staff:""};
    searchBox.value = "";
    // Do not leave unread counts from the previous member visible while
    // the existing message modules refresh their authenticated data.
    for (const selector of ["#memberDirectBadge","#conversationBadge","#inboxBadge"]) {
      const badge = $(selector);
      if (badge) {badge.textContent = "0";badge.classList.add("hidden");}
    }
    const announcementBadge = $(".v17-notifications-bell .v17-notifications-badge");
    if (announcementBadge) {
      announcementBadge.textContent = "0";
      announcementBadge.hidden = true;
    }
    updateCounts();
    syncTabs();
  });
  window.addEventListener("pageshow", () => {syncTabs();updateCounts();});
  updateCounts();
  syncTabs();
  document.documentElement.classList.add("v17-unified-inbox-ready");
}

installUnifiedInbox();
