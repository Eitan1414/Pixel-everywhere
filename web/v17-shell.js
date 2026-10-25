import "./v17-shell.css";
import { uniqueMenuFeatures } from "./v17-navigation-model.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function prepareHomeHero() {
  const hero = $("#page-home .hero");
  if (!hero || hero.dataset.v17Ready === "true") return;
  const copy = node("div", "v17-hero-copy");
  for (const child of [...hero.children]) {
    if (!child.matches(".hero-glow, .hero-logo")) copy.append(child);
  }
  hero.append(copy);
  hero.dataset.v17Ready = "true";
}

function menuItems() {
  const originalCards = $$("#page-home .feature-grid > button");
  const candidates = originalCards.map((card, index) => ({
    id: card.dataset.pageTarget || card.id || `feature-${index}`,
    label: $("strong", card)?.textContent || card.textContent,
    description: $("small", card)?.textContent || "",
    icon: $(".feature-icon", card)?.textContent?.trim() || (card.querySelector("img") ? "◉" : "▣"),
    activate: () => card.click()
  }));

  // A staff link is offered only after the existing staff session is present.
  const staffButton = $("#openStaffButton");
  if (staffButton && sessionStorage.getItem("pixel-token")) {
    candidates.push({
      id: "staff-workspace",
      label: "Espace staff",
      description: "Administration et modération",
      icon: "⚑",
      activate: () => staffButton.click()
    });
  }
  return uniqueMenuFeatures(candidates);
}

function buildMenuPage(main) {
  const page = node("section", "page v17-menu-page");
  page.id = "page-v17-menu";
  const heading = node("header", "v17-menu-heading");
  heading.append(
    node("p", "eyebrow", "Pixel Everywhere · v1.7"),
    node("h2", "", "Autres menus"),
    node("p", "v17-menu-intro", "Retrouve les fonctions de la communauté au même endroit.")
  );
  const grid = node("div", "v17-menu-grid");
  grid.id = "v17MenuGrid";
  page.append(heading, grid);
  main.append(page);
  return { page, grid };
}

function renderMenu(grid) {
  grid.replaceChildren();
  const items = menuItems();
  if (!items.length) {
    grid.append(node("p", "v17-menu-empty", "Aucune rubrique disponible pour le moment."));
    return;
  }
  items.forEach((item) => {
    const card = node("button", "v17-menu-card");
    card.type = "button";
    card.append(
      node("span", "v17-menu-icon", item.icon || "▣"),
      node("strong", "v17-menu-title", item.label),
      node("small", "v17-menu-description", item.description)
    );
    card.addEventListener("click", item.activate);
    grid.append(card);
  });
}

function installNavigation(menuPage, refreshMenu) {
  const nav = $(".bottom-nav");
  const homeLink = $('.bottom-nav [data-page-target="home"]');
  const accountButton = $("#accountButton");
  const accountDialog = $("#loginDialog");
  if (!nav || !homeLink || !accountButton) return;

  const tabs = [
    { id: "home", icon: "⌂", label: "Accueil", activate: () => homeLink.click() },
    { id: "menu", icon: "▦", label: "Autres menus", activate: () => {
      refreshMenu();
      $$(".page.active").forEach((page) => page.classList.remove("active"));
      menuPage.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } },
    { id: "account", icon: "◉", label: "Compte", activate: () => accountButton.click() }
  ];

  const createdTabs = new Map();
  tabs.forEach((tab) => {
    const button = node("button", "v17-tab");
    button.type = "button";
    button.dataset.v17Tab = tab.id;
    button.setAttribute("aria-label", tab.label);
    button.append(node("span", "v17-tab-icon", tab.icon), node("small", "", tab.label));
    button.addEventListener("click", tab.activate);
    nav.append(button);
    createdTabs.set(tab.id, button);
  });

  function syncActiveTab() {
    const page = $(".page.active");
    const target = accountDialog?.open
      ? "account"
      : page?.id === "page-home"
        ? "home"
        : "menu";
    createdTabs.forEach((button, id) => {
      const active = id === target;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  const main = $("#mainContent");
  const pageObserver = new MutationObserver(syncActiveTab);
  pageObserver.observe(main, { subtree: true, attributes: true, attributeFilter: ["class"] });
  if (accountDialog) {
    new MutationObserver(syncActiveTab).observe(accountDialog, {
      attributes: true,
      attributeFilter: ["open"]
    });
  }
  syncActiveTab();
}

function install() {
  const main = $("#mainContent");
  const featureGrid = $("#page-home .feature-grid");
  if (!main || !featureGrid || $("#page-v17-menu")) return;

  prepareHomeHero();
  const { page, grid } = buildMenuPage(main);
  const refreshMenu = () => renderMenu(grid);
  refreshMenu();
  // Plugins can add new feature cards during startup or later.
  new MutationObserver(refreshMenu).observe(featureGrid, { childList: true });
  installNavigation(page, refreshMenu);
  document.documentElement.classList.add("v17-ui");
}

install();
