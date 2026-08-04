const steps = Object.freeze([
  ["Pixel Everywhere est encore en Early Access", "Certaines fonctions peuvent encore changer ou arriver progressivement. Merci de participer dès maintenant.", []],
  ["Accueil", "Retrouve les raccourcis importants et le lien du serveur Discord.", ['[data-page-target="home"]']],
  ["Annonces", "Lis les nouvelles du serveur, de l’application et des prochaines versions.", ['[data-page-target="announcements"]']],
  ["Pixel", "Prends soin de Pixel et découvre les fonctionnalités déjà disponibles.", ['[data-page-target="pixel"]']],
  ["Rejoindre le staff", "Prépare une candidature privée depuis ton compte membre.", ['[data-page-target="application"]']],
  ["Messagerie", "Discute avec le staff et retrouve les tutoriels de Pixel Helper.", ["#conversationInboxButton", "#conversationFeature"]],
  ["Idées et création", "Propose des améliorations. D’autres fonctions chouettes arriveront bientôt.", ['[data-page-target="suggestions"]', '[data-page-target="creation"]', '[data-page-target="studio"]']],
  ["Compte", "Connecte ton compte et retrouve tes informations et réglages.", ["#accountButton"]]
]);

let rendering = false;

function visible(selectors) {
  return selectors.map((selector) => document.querySelector(selector))
    .find((node) => node && !node.hidden && node.getClientRects().length);
}

function removeCharacterVisuals() {
  document.querySelectorAll(
    ".pixel-helper-stage-visual, .pixel-helper-update-emotion, [data-pixel-helper-logo], .pixel-helper-emotion-image"
  ).forEach((node) => node.remove());

  const avatar = document.querySelector("#pixelHelperGuideDialog .pixel-helper-avatar");
  if (avatar && avatar.dataset.characterRemoved !== "true") {
    avatar.dataset.characterRemoved = "true";
    avatar.className = "pixel-helper-avatar";
    avatar.textContent = "P";
    avatar.removeAttribute("data-imported-emotion-logo");
  }
}

function installCategoryGuide() {
  const dialog = document.querySelector("#pixelHelperGuideDialog");
  const modal = dialog?.querySelector(".pixel-helper-modal");
  const list = dialog?.querySelector(".pixel-helper-guide-list");
  if (!dialog || !modal || !list || modal.dataset.characterFreeGuide === "true") return;
  modal.dataset.characterFreeGuide = "true";

  const stage = document.createElement("section");
  stage.className = "pixel-helper-interactive-stage no-character";
  stage.innerHTML = `<div class="pixel-helper-speech" aria-live="polite"><small>Étape <span data-number>1</span> sur ${steps.length}</small><h3></h3><p></p></div>
    <div class="pixel-helper-progress"><i></i></div>
    <div class="pixel-helper-navigation"><button class="text-button" data-previous>← Précédent</button><button class="primary-button" data-open>Ouvrir cette catégorie</button><button class="text-button" data-next>Suivant →</button></div>`;
  list.before(stage);

  const cards = [...list.querySelectorAll(".pixel-helper-guide-item")];
  let current = 0;
  const select = (index) => {
    current = (index + steps.length) % steps.length;
    const [title, text, selectors] = steps[current];
    stage.querySelector("[data-number]").textContent = String(current + 1);
    stage.querySelector("h3").textContent = title;
    stage.querySelector("p").textContent = text;
    stage.querySelector(".pixel-helper-progress i").style.width = `${((current + 1) / steps.length) * 100}%`;
    stage.querySelector("[data-open]").hidden = selectors.length === 0;
    cards.forEach((card, i) => card.classList.toggle("selected", i === current));
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
    const target = visible(steps[current][2]);
    if (!target) {
      stage.querySelector("p").textContent = "Cette catégorie n’est pas accessible avec ce compte. Pixel Helper peut néanmoins continuer à te présenter les autres fonctions.";
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
  if (!message || !list || message.dataset.characterFreeGuide === "true") return;
  message.dataset.characterFreeGuide = "true";

  const stage = document.createElement("section");
  stage.className = "pixel-helper-update-stage no-character";
  stage.innerHTML = `<div><small data-label>Pixel Helper est prêt</small><strong data-title>Installe la mise à jour tranquillement</strong><p data-text>Sélectionne une étape pour afficher les instructions correspondantes.</p></div>`;
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
      stage.querySelector("[data-title]").textContent = "Fonctions de cette version";
      stage.querySelector("[data-text]").textContent = "Cette version apporte de nouvelles possibilités, et d’autres arriveront bientôt.";
    });
  }
}

function render() {
  if (rendering) return;
  rendering = true;
  try {
    removeCharacterVisuals();
    installCategoryGuide();
    installUpdateGuide();
  } finally {
    rendering = false;
  }
}

render();
const interactiveHelperObserver = new MutationObserver(render);
interactiveHelperObserver.observe(document.documentElement, { childList: true, subtree: true });

window.PixelHelperInteractive = Object.freeze({
  characterVisible: false,
  refresh: render
});
