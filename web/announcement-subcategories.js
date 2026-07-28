const announcementCategories = {
  server: {
    eyebrow: "Serveur PDD",
    title: "Annonces serveur",
    description: "Les informations, événements et nouveautés publiés pour le serveur Discord PDD.",
    icon: "S"
  },
  app: {
    eyebrow: "Pixel Everywhere",
    title: "Annonces application",
    description: "Les actualités propres à l’application, ses fonctionnalités et son fonctionnement.",
    icon: "A"
  },
  updates: {
    eyebrow: "Historique des versions",
    title: "Update log",
    description: "Le détail des nouveautés, corrections et changements ajoutés dans chaque version.",
    icon: "U"
  }
};

function installAnnouncementSubcategories() {
  const page = document.querySelector("#page-announcements");
  const tabs = document.querySelector("#announcementCategoryTabs");
  const heading = page?.querySelector(".section-heading");
  const eyebrow = heading?.querySelector(".eyebrow");
  const title = heading?.querySelector("h2");
  const refreshButton = document.querySelector("#refreshAnnouncements");

  if (!page || !tabs || !heading || !eyebrow || !title) return;
  if (tabs.dataset.distinctCategoriesReady === "true") return;
  tabs.dataset.distinctCategoriesReady = "true";
  tabs.classList.add("announcement-subcategory-tabs");

  const summary = document.createElement("div");
  summary.id = "announcementCategorySummary";
  summary.className = "announcement-category-summary";
  summary.setAttribute("aria-live", "polite");
  tabs.insertAdjacentElement("afterend", summary);

  Object.entries(announcementCategories).forEach(([category, config]) => {
    const button = tabs.querySelector(`[data-announcement-category="${category}"]`);
    const panel = page.querySelector(`[data-announcement-panel="${category}"]`);
    if (!button || !panel) return;

    const panelId = panel.id || `announcement-panel-${category}`;
    panel.id = panelId;
    button.setAttribute("aria-controls", panelId);
    button.innerHTML = `
      <span class="announcement-subcategory-icon" aria-hidden="true">${config.icon}</span>
      <span class="announcement-subcategory-copy">
        <strong>${config.title}</strong>
        <small>${config.eyebrow}</small>
      </span>`;
  });

  function activeCategory() {
    return tabs.querySelector("[data-announcement-category].active")?.dataset.announcementCategory || "server";
  }

  function renderActiveCategory() {
    const category = activeCategory();
    const config = announcementCategories[category] || announcementCategories.server;

    eyebrow.textContent = config.eyebrow;
    title.textContent = config.title;
    summary.innerHTML = `
      <span class="announcement-category-summary-icon" aria-hidden="true">${config.icon}</span>
      <div><strong>${config.title}</strong><p>${config.description}</p></div>`;

    if (refreshButton) {
      refreshButton.setAttribute("aria-label", `Actualiser : ${config.title}`);
      refreshButton.title = `Actualiser : ${config.title}`;
    }

    page.querySelectorAll("[data-announcement-panel]").forEach((panel) => {
      const selected = panel.dataset.announcementPanel === category;
      panel.hidden = !selected;
      panel.setAttribute("aria-hidden", String(!selected));
    });
  }

  tabs.addEventListener("click", () => window.setTimeout(renderActiveCategory, 0));

  const observer = new MutationObserver(renderActiveCategory);
  tabs.querySelectorAll("[data-announcement-category]").forEach((button) => {
    observer.observe(button, { attributes: true, attributeFilter: ["class", "aria-selected"] });
  });

  renderActiveCategory();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAnnouncementSubcategories, { once: true });
} else {
  installAnnouncementSubcategories();
}
