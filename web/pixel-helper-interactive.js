const PIXEL_HELPER_LOGO = "data:image/jpeg;base64,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";

const categorySteps = [
  { title: "Accueil", text: "Ici, tu retrouves les raccourcis importants et le lien pour rejoindre le serveur Discord.", expression: "happy", selectors: ['[data-page-target="home"]'] },
  { title: "Annonces", text: "Lis les annonces du serveur, les infos de l’application et les détails des nouvelles versions.", expression: "curious", selectors: ['[data-page-target="announcements"]'] },
  { title: "Pixel", text: "Prends soin de Pixel, joue avec lui, gagne de l’XP et utilise tes pièces.", expression: "excited", selectors: ['[data-page-target="pixel"]'] },
  { title: "Rejoindre le staff", text: "Cette catégorie permet d’envoyer une candidature privée à l’équipe de modération.", expression: "proud", selectors: ['[data-page-target="application"]'] },
  { title: "Messagerie", text: "Retrouve tes discussions avec le staff et les tutoriels automatiques de Pixel Helper.", expression: "wave", selectors: ['#conversationInboxButton', '#conversationFeature'] },
  { title: "Idées et création", text: "Propose tes idées et découvre les outils créatifs disponibles dans l’application.", expression: "wink", selectors: ['[data-page-target="suggestions"]', '[data-page-target="creation"]', '[data-page-target="studio"]'] },
  { title: "Compte", text: "Connecte ton compte membre ou staff et retrouve tes réglages personnels.", expression: "calm", selectors: ['#accountButton'] }
];

const updateExpressions = ["wave", "curious", "calm", "proud", "excited", "happy"];
let enhancing = false;

function logoMarkup(className = "") {
  return `<span class="pixel-helper-logo-frame ${className}"><img src="${PIXEL_HELPER_LOGO}" alt="Logo Pixel Helper fourni" /></span>`;
}

function pixelMarkup(expression = "happy") {
  return `
    <div class="pixel-helper-animated-pixel expression-${expression}" aria-hidden="true">
      <span class="pixel-helper-pixel-sparkles">✦　·　✧</span>
      <img class="pixel-helper-pixel-body" src="/assets/pixel-body.png" alt="" />
      <img class="pixel-helper-pixel-eye" src="/assets/pixel-eye.png" alt="" />
      <span class="pixel-helper-pixel-brow"></span>
      <span class="pixel-helper-pixel-mouth"></span>
      <span class="pixel-helper-pixel-cheek left"></span>
      <span class="pixel-helper-pixel-cheek right"></span>
      <span class="pixel-helper-pixel-hand">👋</span>
    </div>`;
}

function visibleElement(selectors) {
  for (const selector of selectors || []) {
    const element = document.querySelector(selector);
    if (element && !element.hidden && element.getClientRects().length) return element;
  }
  return null;
}

function setPixelExpression(stage, expression) {
  const pixel = stage?.querySelector(".pixel-helper-animated-pixel");
  if (!pixel) return;
  [...pixel.classList].filter((name) => name.startsWith("expression-")).forEach((name) => pixel.classList.remove(name));
  pixel.classList.add(`expression-${expression}`);
  pixel.classList.remove("pixel-helper-react");
  void pixel.offsetWidth;
  pixel.classList.add("pixel-helper-react");
}

function enhanceLogos() {
  const guideButton = document.querySelector("#pixelHelperGuideButton");
  if (guideButton && !guideButton.querySelector(".pixel-helper-logo-frame")) {
    guideButton.querySelector("span")?.remove();
    guideButton.insertAdjacentHTML("afterbegin", logoMarkup("compact"));
  }

  const avatar = document.querySelector("#pixelHelperGuideDialog .pixel-helper-avatar");
  if (avatar && !avatar.dataset.exactLogo) {
    avatar.dataset.exactLogo = "true";
    avatar.className = "pixel-helper-logo-frame heading";
    avatar.innerHTML = `<img src="${PIXEL_HELPER_LOGO}" alt="Logo Pixel Helper fourni" />`;
  }

  const thread = document.querySelector("#pixelHelperUpdateThread .conversation-thread-head strong");
  if (thread && !thread.querySelector("img")) {
    thread.insertAdjacentHTML("afterbegin", `<img class="pixel-helper-thread-logo" src="${PIXEL_HELPER_LOGO}" alt="" />`);
  }

  const popupButton = document.querySelector("#openPixelHelperUpdateMessage");
  if (popupButton && !popupButton.querySelector("img")) {
    popupButton.insertAdjacentHTML("afterbegin", `<img class="pixel-helper-inline-logo" src="${PIXEL_HELPER_LOGO}" alt="" />`);
  }
}

function enhanceCategoryGuide() {
  const dialog = document.querySelector("#pixelHelperGuideDialog");
  const modal = dialog?.querySelector(".pixel-helper-modal");
  const list = dialog?.querySelector(".pixel-helper-guide-list");
  if (!dialog || !modal || !list || modal.dataset.interactive === "true") return;
  modal.dataset.interactive = "true";

  const stage = document.createElement("section");
  stage.className = "pixel-helper-interactive-stage category-stage";
  stage.innerHTML = `
    <div class="pixel-helper-stage-visual">
      ${logoMarkup("stage-logo")}
      ${pixelMarkup("happy")}
    </div>
    <div class="pixel-helper-speech" aria-live="polite">
      <small>Étape <span data-helper-step-number>1</span> sur ${categorySteps.length}</small>
      <h3 data-helper-step-title></h3>
      <p data-helper-step-text></p>
    </div>
    <div class="pixel-helper-progress" aria-hidden="true"><i></i></div>
    <div class="pixel-helper-navigation">
      <button class="text-button" type="button" data-helper-previous>← Précédent</button>
      <button class="primary-button" type="button" data-helper-open-category>Ouvrir cette catégorie</button>
      <button class="text-button" type="button" data-helper-next>Suivant →</button>
    </div>`;
  list.insertAdjacentElement("beforebegin", stage);

  const items = [...list.querySelectorAll(".pixel-helper-guide-item")];
  items.forEach((item, index) => {
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.dataset.helperStep = String(index);
    item.addEventListener("click", () => selectCategoryStep(index));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCategoryStep(index);
      }
    });
  });

  let current = 0;
  function selectCategoryStep(index) {
    current = (index + categorySteps.length) % categorySteps.length;
    const step = categorySteps[current];
    stage.querySelector("[data-helper-step-number]").textContent = String(current + 1);
    stage.querySelector("[data-helper-step-title]").textContent = step.title;
    stage.querySelector("[data-helper-step-text]").textContent = step.text;
    stage.querySelector(".pixel-helper-progress i").style.width = `${((current + 1) / categorySteps.length) * 100}%`;
    items.forEach((item, itemIndex) => item.classList.toggle("selected", itemIndex === current));
    setPixelExpression(stage, step.expression);
  }

  stage.querySelector("[data-helper-previous]").addEventListener("click", () => selectCategoryStep(current - 1));
  stage.querySelector("[data-helper-next]").addEventListener("click", () => selectCategoryStep(current + 1));
  stage.querySelector("[data-helper-open-category]").addEventListener("click", () => {
    const step = categorySteps[current];
    const target = visibleElement(step.selectors);
    if (!target) {
      stage.querySelector("[data-helper-step-text]").textContent = "Cette catégorie n’est pas encore visible avec ce compte, mais Pixel Helper te la montrera dès qu’elle sera disponible.";
      setPixelExpression(stage, "curious");
      return;
    }
    dialog.close();
    target.click();
  });

  selectCategoryStep(0);
}

function enhanceUpdateTutorial() {
  const message = document.querySelector(".pixel-helper-message");
  const list = message?.querySelector("ol");
  if (!message || !list || message.dataset.interactive === "true") return;
  message.dataset.interactive = "true";

  const author = message.querySelector(":scope > strong");
  if (author && !author.querySelector("img")) {
    author.insertAdjacentHTML("afterbegin", `<img class="pixel-helper-message-logo" src="${PIXEL_HELPER_LOGO}" alt="Logo Pixel Helper" />`);
  }

  const steps = [...list.querySelectorAll("li")];
  if (!steps.length) return;
  const stage = document.createElement("section");
  stage.className = "pixel-helper-interactive-stage update-stage";
  stage.innerHTML = `
    <div class="pixel-helper-stage-visual">${pixelMarkup("wave")}</div>
    <div class="pixel-helper-speech" aria-live="polite">
      <small>Installation • étape <span data-update-number>1</span> sur ${steps.length}</small>
      <h3 data-update-title>On commence !</h3>
      <p data-update-text></p>
    </div>
    <div class="pixel-helper-progress"><i></i></div>
    <div class="pixel-helper-navigation compact-navigation">
      <button class="text-button" type="button" data-update-previous>← Précédent</button>
      <button class="primary-button" type="button" data-update-next>Étape suivante →</button>
    </div>`;
  list.insertAdjacentElement("beforebegin", stage);

  steps.forEach((step, index) => {
    step.tabIndex = 0;
    step.setAttribute("role", "button");
    step.dataset.updateStep = String(index);
    step.addEventListener("click", () => selectUpdateStep(index));
    step.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectUpdateStep(index);
      }
    });
  });

  let current = 0;
  function selectUpdateStep(index) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    stage.querySelector("[data-update-number]").textContent = String(current + 1);
    stage.querySelector("[data-update-title]").textContent = current === steps.length - 1 ? "Presque terminé !" : `Étape ${current + 1}`;
    stage.querySelector("[data-update-text]").textContent = steps[current].textContent.trim();
    stage.querySelector(".pixel-helper-progress i").style.width = `${((current + 1) / steps.length) * 100}%`;
    steps.forEach((step, stepIndex) => step.classList.toggle("selected", stepIndex === current));
    stage.querySelector("[data-update-previous]").disabled = current === 0;
    const next = stage.querySelector("[data-update-next]");
    next.textContent = current === steps.length - 1 ? "C’est compris ✓" : "Étape suivante →";
    setPixelExpression(stage, updateExpressions[current % updateExpressions.length]);
  }

  stage.querySelector("[data-update-previous]").addEventListener("click", () => selectUpdateStep(current - 1));
  stage.querySelector("[data-update-next]").addEventListener("click", () => {
    if (current < steps.length - 1) selectUpdateStep(current + 1);
    else document.querySelector("#pixelHelperDownloadUpdate")?.focus();
  });
  selectUpdateStep(0);
}

function enhancePixelHelper() {
  if (enhancing) return;
  enhancing = true;
  try {
    enhanceLogos();
    enhanceCategoryGuide();
    enhanceUpdateTutorial();
  } finally {
    enhancing = false;
  }
}

enhancePixelHelper();
const interactiveHelperObserver = new MutationObserver(enhancePixelHelper);
interactiveHelperObserver.observe(document.documentElement, { childList: true, subtree: true });

window.PixelHelperInteractive = Object.freeze({
  logo: PIXEL_HELPER_LOGO,
  refresh: enhancePixelHelper
});
