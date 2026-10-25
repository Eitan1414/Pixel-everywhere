import "./v17-admin-panel.css";
import { getV17StaffSections } from "./v17-admin-model.js";

const find = (selector, scope = document) => scope.querySelector(selector);
const findAll = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const page = find("#page-staff");
const workspace = find("#staffWorkspace");
const tabs = find("#staffWorkspace .staff-tabs");

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function readStaff() {
  if (!sessionStorage.getItem("pixel-token")) return null;
  try {
    const user = JSON.parse(sessionStorage.getItem("pixel-user") || "null");
    if (!["admin", "moderator", "mod"].includes(user?.role)) return null;
    return user;
  } catch {
    return null;
  }
}

function findTab(id) {
  return findAll("[data-staff-tab]", tabs).find(button => button.dataset.staffTab === id);
}

function mountedTabs(role) {
  return findAll("[data-staff-tab]", tabs)
    .filter(button => !button.hidden && !button.classList.contains("hidden"))
    .filter(button => role === "admin" || !["accounts", "live-control"].includes(button.dataset.staffTab))
    .map(button => button.dataset.staffTab);
}

function install() {
  if (!page || !workspace || !tabs || find("#v17StaffDashboard")) return;

  const dashboard = make("section", "v17-admin-dashboard");
  dashboard.id = "v17StaffDashboard";
  const splash = make("div", "v17-admin-splash");
  splash.append(make("span", "v17-admin-emblem", "◈"));
  const splashText = make("div", "v17-admin-splash-copy");
  splashText.append(
    make("p", "eyebrow", "Pixel Everywhere · v1.7"),
    make("h3", "", "Bienvenue dans le panel"),
    make("p", "", "Choisis une rubrique pour gérer la communauté PDD.")
  );
  splash.append(splashText);
  const grid = make("div", "v17-admin-grid");
  grid.id = "v17AdminCategories";
  dashboard.append(splash, make("h4", "", "Catégories"), grid);

  const detail = make("section", "v17-admin-detail");
  detail.id = "v17AdminDetail";
  detail.hidden = true;
  const back = make("button", "v17-admin-back", "‹ Retour aux catégories");
  back.type = "button";
  const breadcrumb = make("p", "v17-admin-breadcrumb", "Admin Panel /");
  const heading = make("h3", "v17-admin-detail-title");
  const summary = make("p", "v17-admin-detail-description");
  detail.append(back, breadcrumb, heading, summary);

  // Preserve original panels and click handlers; the v1.7 layer only navigates.
  workspace.insertBefore(dashboard, tabs);
  workspace.insertBefore(detail, tabs);
  const footer = make("nav", "v17-admin-footer");
  footer.setAttribute("aria-label", "Navigation dans le panel staff");
  const home = make("button", "", "⌂ Accueil");
  const categories = make("button", "", "▦ Catégories");
  const leave = make("button", "", "← Retour à l'application");
  for (const button of [home, categories, leave]) button.type = "button";
  footer.append(home, categories, leave);
  workspace.append(footer);

  let currentView = "dashboard";

  function sections() {
    const user = readStaff();
    return user ? getV17StaffSections(user.role, mountedTabs(user.role)) : [];
  }

  function drawDashboard() {
    const user = readStaff();
    const label = find("#page-staff .section-heading h2");
    if (label) label.textContent = user?.role === "admin" ? "Admin Panel" : "Staff Panel";
    splashText.querySelector("h3").textContent =
      user ? "Bienvenue, " + user.username : "Bienvenue dans le panel";
    grid.replaceChildren();
    const available = sections();
    if (!available.length) {
      grid.append(make("p", "v17-admin-empty", "Aucun outil staff disponible pour cette session."));
      return;
    }
    for (const item of available) {
      const button = make("button", "v17-admin-card");
      button.type = "button";
      button.dataset.v17Section = item.id;
      button.append(
        make("span", "v17-admin-card-icon", item.icon),
        make("strong", "", item.label),
        make("small", "", item.description)
      );
      button.addEventListener("click", () => openSection(item));
      grid.append(button);
    }
  }

  function showDashboard() {
    currentView = "dashboard";
    workspace.classList.add("v17-admin-overview");
    workspace.classList.remove("v17-admin-section", "v17-admin-reports", "v17-admin-discussions", "v17-admin-accounts", "v17-admin-members");
    dashboard.hidden = false;
    detail.hidden = true;
    home.setAttribute("aria-current", "page");
    categories.removeAttribute("aria-current");
    drawDashboard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSection(section) {
    const target = sections().find(item => item.id === section.id);
    const button = target && findTab(target.tab);
    if (!button || button.hidden || button.classList.contains("hidden")) return;
    currentView = target.id;
    // Let the original handlers fetch data, open dialogs, and perform staff actions.
    button.click();
    workspace.classList.remove("v17-admin-overview", "v17-admin-reports", "v17-admin-discussions", "v17-admin-accounts", "v17-admin-members");
    workspace.classList.add("v17-admin-section");
    if (["reports", "discussions", "accounts", "members"].includes(target.id)) {
      workspace.classList.add("v17-admin-" + target.id);
    }
    dashboard.hidden = true;
    detail.hidden = false;
    heading.textContent = target.label;
    summary.textContent = target.description;
    breadcrumb.textContent = "Admin Panel / " + target.label;
    home.removeAttribute("aria-current");
    categories.setAttribute("aria-current", "page");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  back.addEventListener("click", showDashboard);
  home.addEventListener("click", showDashboard);
  categories.addEventListener("click", showDashboard);
  leave.addEventListener("click", () => {
    // The original home button stays mounted, although v1.7 hides it visually.
    find('.bottom-nav [data-page-target="home"]')?.click();
  });

  let wasActive = page.classList.contains("active");
  new MutationObserver(() => {
    const active = page.classList.contains("active");
    if (active && !wasActive) showDashboard();
    wasActive = active;
  }).observe(page, { attributes: true, attributeFilter: ["class"] });

  let wasLocked = workspace.classList.contains("hidden");
  new MutationObserver(() => {
    const locked = workspace.classList.contains("hidden");
    if (wasLocked && !locked && page.classList.contains("active")) showDashboard();
    wasLocked = locked;
  }).observe(workspace, { attributes: true, attributeFilter: ["class"] });

  // Additional staff modules can register buttons after this module starts.
  new MutationObserver(() => {
    if (currentView === "dashboard") drawDashboard();
  }).observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });

  showDashboard();
  document.documentElement.classList.add("v17-admin-ready");
}

install();
