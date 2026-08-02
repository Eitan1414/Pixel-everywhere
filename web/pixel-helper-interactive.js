import { loadPixelHelperEmotions } from "./pixel-helper-emotions.js";

const steps = Object.freeze([
  ["Pixel Everywhere est encore en Early Access", "Certaines fonctions peuvent encore changer ou arriver progressivement. Merci de participer dès maintenant.", "sad", []],
  ["Accueil", "Retrouve les raccourcis importants et le lien du serveur Discord.", "happy", ['[data-page-target="home"]']],
  ["Annonces", "Lis les nouvelles du serveur, de l’application et des prochaines versions.", "thinking", ['[data-page-target="announcements"]']],
  ["Pixel", "Prends soin de Pixel et découvre les fonctionnalités déjà disponibles.", "surprised", ['[data-page-target="pixel"]']],
  ["Rejoindre le staff", "Prépare une candidature privée depuis ton compte membre.", "thinking", ['[data-page-target="application"]']],
  ["Messagerie", "Discute avec le staff et retrouve les tutoriels de Pixel Helper.", "happy", ["#conversationInboxButton", "#conversationFeature"]],
  ["Idées et création", "Propose des améliorations. D’autres fonctions chouettes arriveront bientôt.", "surprised", ['[data-page-target="suggestions"]', '[data-page-target="creation"]', '[data-page-target="studio"]']],
  ["Compte", "Connecte ton compte et retrouve tes informations et réglages.", "thinking", ["#accountButton"]]
]);
const updateEmotions = ["happy", "thinking", "thinking", "thinking", "surprised", "happy"];
let emotions;
let rendering = false;

const source = (name) => emotions[name] || emotions.happy;
const image = (name = "happy", className = "", alt = "") =>
  `<img class="pixel-helper-emotion-image ${className}" src="${source(name)}" alt="${alt}" data-pixel-helper-emotion="${name}">`;

function setEmotion(root, name) {
  const node = root?.querySelector(".pixel-helper-stage-emotion");
  if (!node) return;
  node.src = source(name);
  node.dataset.pixelHelperEmotion = name;
  node.alt = `Pixel Helper — ${name}`;
  node.classList.remove("pixel-helper-emotion-react");
  void node.offsetWidth;
  node.classList.add("pixel-helper-emotion-react");
}

function addHappyLogo(selector, className = "") {
  const target = document.querySelector(selector);
  if (!target || target.querySelector("[data-pixel-helper-logo]")) return;
  const logo = document.createElement("img");
  logo.src = emotions.happy;
  logo.alt = "";
  logo.className = className;
  logo.dataset.pixelHelperLogo = "true";
  target.prepend(logo);
}

function installLogos() {
  const guide = document.querySelector("#pixelHelperGuideButton");
  if (guide && !guide.querySelector("[data-pixel-helper-logo]")) {
    guide.querySelector(":scope > span")?.remove();
    const frame = document.createElement("span");
    frame.className = "pixel-helper-logo-frame compact";
    frame.innerHTML = image("happy", "", "");
    frame.querySelector("img").dataset.pixelHelperLogo = "true";
    guide.prepend(frame);
  }
  const avatar = document.querySelector("#pixelHelperGuideDialog .pixel-helper-avatar");
  if (avatar && avatar.dataset.importedEmotionLogo !== "true") {
    avatar.dataset.importedEmotionLogo = "true";
    avatar.className = "pixel-helper-logo-frame heading";
    avatar.innerHTML = image("happy", "", "Logo Pixel Helper");
    avatar.querySelector("img").dataset.pixelHelperLogo = "true";
  }
  addHappyLogo("#pixelHelperUpdateThread .conversation-thread-head strong", "pixel-helper-thread-logo");
  addHappyLogo("#openPixelHelperUpdateMessage", "pixel-helper-inline-logo");
  addHappyLogo(".pixel-helper-message > strong", "pixel-helper-message-logo");
  const updateIcon = document.querySelector("#appUpdateDialog .app-update-icon");
  if (updateIcon && updateIcon.dataset.importedEmotion !== "true") {
    updateIcon.dataset.importedEmotion = "true";
    updateIcon.classList.add("pixel-helper-popup-logo");
    updateIcon.innerHTML = `<span class="pixel-helper-logo-frame">${image("happy", "", "Logo Pixel Helper")}</span>`;
  }
}

function visible(selectors) {
  return selectors.map((selector) => document.querySelector(selector))
    .find((node) => node && !node.hidden && node.getClientRects().length);
}

function installCategoryGuide() {
  const dialog = document.querySelector("#pixelHelperGuideDialog");
  const modal = dialog?.querySelector(".pixel-helper-modal");
  const list = dialog?.querySelector(".pixel-helper-guide-list");
  if (!dialog || !modal || !list || modal.dataset.importedEmotions === "true") return;
  modal.dataset.importedEmotions = "true";
  const stage = document.createElement("section");
  stage.className = "pixel-helper-interactive-stage";
  stage.innerHTML = `<div class="pixel-helper-stage-visual">${image("sad", "pixel-helper-stage-emotion", "Pixel Helper triste")}</div>
    <div class="pixel-helper-speech" aria-live="polite"><small>Étape <span data-number>1</span> sur ${steps.length}</small><h3></h3><p></p></div>
    <div class="pixel-helper-progress"><i></i></div>
    <div class="pixel-helper-navigation"><button class="text-button" data-previous>← Précédent</button><button class="primary-button" data-open>Ouvrir cette catégorie</button><button class="text-button" data-next>Suivant →</button></div>`;
  list.before(stage);
  const cards = [...list.querySelectorAll(".pixel-helper-guide-item")];
  let current = 0;
  const select = (index) => {
    current = (index + steps.length) % steps.length;
    const [title, text, emotion, selectors] = steps[current];
    stage.querySelector("[data-number]").textContent = String(current + 1);
    stage.querySelector("h3").textContent = title;
    stage.querySelector("p").textContent = text;
    stage.querySelector(".pixel-helper-progress i").style.width = `${((current + 1) / steps.length) * 100}%`;
    stage.querySelector("[data-open]").hidden = selectors.length === 0;
    cards.forEach((card, i) => card.classList.toggle("selected", i === current));
    setEmotion(stage, emotion);
  };
  cards.forEach((card, index) => {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.dataset.helperStep = String(index + 1);
    card.addEventListener("click", () => select(index));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(index);
      }
    });
  });
  stage.querySelector("[data-previous]").addEventListener("click", () => select(current - 1));
  stage.querySelector("[data-next]").addEventListener("click", () => select(current + 1));
  stage.querySelector("[data-open]").addEventListener("click", () => {
    const target = visible(steps[current][3]);
    if (!target) {
      stage.querySelector("p").textContent = "Cette catégorie n’est pas accessible avec ce compte. Pixel réfléchit à la meilleure façon de te guider.";
      setEmotion(stage, "thinking");
      return;
    }
    dialog.close();
    target.click();
  });
  select(0);
}

function installUpdateGuide() {
  const message = document.querySelector(".pixel-helper-message");
  const list = message?.querySelector("ol");
  if (!message || !list || message.dataset.importedEmotions === "true") return;
  message.dataset.importedEmotions = "true";
  const stage = document.createElement("section");
  stage.className = "pixel-helper-update-stage";
  stage.innerHTML = `<div class="pixel-helper-update-emotion">${image("happy", "pixel-helper-stage-emotion", "Pixel Helper content")}</div><div><small data-label>Pixel Helper est prêt</small><strong data-title>Installe la mise à jour tranquillement</strong><p data-text>Touche une étape : Pixel changera d’émotion pour t’accompagner.</p></div>`;
  list.before(stage);
  const items = [...list.querySelectorAll("li")];
  items.forEach((item, index) => {
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.dataset.updateGuideStep = String(index);
    const select = () => {
      items.forEach((entry, i) => entry.classList.toggle("selected", i === index));
      stage.querySelector("[data-label]").textContent = `Étape ${index + 1} sur ${items.length}`;
      stage.querySelector("[data-title]").textContent = index === items.length - 1 ? "Presque terminé !" : "Suis cette étape";
      stage.querySelector("[data-text]").textContent = item.textContent.trim();
      setEmotion(stage, updateEmotions[index] || "thinking");
    };
    item.addEventListener("click", select);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  const notes = message.querySelector(".pixel-helper-release-notes");
  if (notes) {
    notes.tabIndex = 0;
    notes.setAttribute("role", "button");
    notes.addEventListener("click", () => {
      stage.querySelector("[data-label]").textContent = "Nouveautés";
      stage.querySelector("[data-title]").textContent = "Plein de fonctions chouettes";
      stage.querySelector("[data-text]").textContent = "Cette version apporte de nouvelles possibilités, et d’autres arriveront bientôt.";
      setEmotion(stage, "surprised");
    });
  }
}

function render() {
  if (rendering) return;
  rendering = true;
  try {
    installLogos();
    installCategoryGuide();
    installUpdateGuide();
  } finally {
    rendering = false;
  }
}

let interactiveHelperObserver;
loadPixelHelperEmotions().then((loaded) => {
  emotions = loaded;
  render();
  interactiveHelperObserver = new MutationObserver(render);
  interactiveHelperObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.PixelHelperInteractive = Object.freeze({ logo: emotions.happy, emotions, refresh: render });
}).catch((error) => console.error("PIXEL_HELPER_EMOTIONS_FAILED", error));
