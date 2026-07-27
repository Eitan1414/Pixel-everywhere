import "./pixel-live.css";

const PET_KEY = "pixel-pet";
const LIVE_KEY = "pixel-pet-live-v2";
const MIN_STAT = 5;
const rates = { hunger: 2.5, joy: 1.8, energy: 1.4 };
const effects = {
  feed: { hunger: 18, joy: 3 },
  bounce: { joy: 13, energy: -5 },
  walk: { joy: 16, hunger: -4, energy: -8 },
  sleep: { energy: 24, hunger: -3 },
  pet: { joy: 5 },
  treat: { hunger: 12, joy: 6 },
  meal: { hunger: 28, joy: 10 },
  feast: { hunger: 45, joy: 22 }
};

const defaults = {
  hunger: 82,
  joy: 88,
  energy: 76,
  xp: 0,
  level: 1,
  interactions: 0,
  lastAction: "Pixel vient d’arriver dans son atelier.",
  updatedAt: Date.now(),
  decayUpdatedAt: Date.now()
};

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function clamp(value) {
  return Math.min(100, Math.max(MIN_STAT, Number(value) || MIN_STAT));
}

function mergeMetadata(live, app) {
  if (!app) return live;
  return {
    ...live,
    xp: Number(app.xp ?? live.xp ?? 0),
    level: Math.max(1, Number(app.level ?? live.level ?? 1)),
    interactions: Number(app.interactions ?? live.interactions ?? 0),
    lastAction: app.lastAction || live.lastAction
  };
}

function decay(input, now = Date.now()) {
  const pet = { ...defaults, ...input };
  const previous = Number(pet.decayUpdatedAt || pet.updatedAt || now);
  const hours = Math.max(0, now - previous) / 3_600_000;
  for (const [name, rate] of Object.entries(rates)) {
    pet[name] = clamp(Number(pet[name]) - hours * rate);
  }
  pet.decayUpdatedAt = now;
  pet.updatedAt = now;
  return pet;
}

function save(pet) {
  const value = JSON.stringify(pet);
  localStorage.setItem(LIVE_KEY, value);
  localStorage.setItem(PET_KEY, value);
}

function getLivePet() {
  const live = read(LIVE_KEY) || read(PET_KEY) || defaults;
  return decay(mergeMetadata(live, read(PET_KEY)));
}

function mood(pet) {
  const average = (pet.hunger + pet.joy + pet.energy) / 3;
  if (average >= 80) return ["Très heureux", "Pixel rayonne de bonheur !"];
  if (average >= 60) return ["Heureux", "Pixel est content de passer du temps avec toi."];
  if (average >= 40) return ["Calme", "Pixel aimerait recevoir un peu d’attention."];
  return ["Fatigué", "Pixel a besoin que tu prennes soin de lui."];
}

function render(pet) {
  for (const name of Object.keys(rates)) {
    const value = clamp(pet[name]);
    const label = document.querySelector(`#${name}Value`);
    const bar = document.querySelector(`#${name}Bar`);
    if (label) label.textContent = `${value.toFixed(1)}%`;
    if (bar) bar.style.width = `${value}%`;
  }
  const [label, message] = mood(pet);
  const badge = document.querySelector("#petMoodBadge");
  const messageNode = document.querySelector("#petMessage");
  if (badge) badge.textContent = label;
  if (messageNode) messageNode.textContent = message;
}

function tick() {
  const pet = getLivePet();
  save(pet);
  render(pet);
}

function statusFor(kind) {
  return document.querySelector(kind === "shop" ? "#pixelShopStatus" : "#petActionStatus");
}

function applySuccessfulAction(name, kind, startedAt) {
  const status = statusFor(kind);
  const check = () => {
    if (status?.classList.contains("success")) {
      const pet = getLivePet();
      const appPet = read(PET_KEY);
      const next = mergeMetadata(pet, appPet);
      for (const [stat, amount] of Object.entries(effects[name] || {})) {
        next[stat] = clamp(Number(next[stat]) + amount);
      }
      next.decayUpdatedAt = Date.now();
      next.updatedAt = Date.now();
      save(next);
      render(next);
      return;
    }
    if (Date.now() - startedAt < 4_000) window.setTimeout(check, 120);
  };
  window.setTimeout(check, 80);
}

document.addEventListener("click", (event) => {
  const action = event.target.closest?.("[data-pet-action]");
  const shop = event.target.closest?.("[data-shop-item]");
  const mascot = event.target.closest?.("#petMascot");
  const name = action?.dataset.petAction || shop?.dataset.shopItem || (mascot ? "pet" : "");
  if (!effects[name]) return;
  const kind = shop ? "shop" : "action";
  const status = statusFor(kind);
  status?.classList.remove("success");
  applySuccessfulAction(name, kind, Date.now());
}, true);

function bubble(text, extra = "") {
  const stage = document.querySelector("#petStage");
  const mascot = document.querySelector("#petMascot");
  if (!stage || !mascot) return null;
  const node = document.createElement("div");
  node.className = `pixel-live-bubble ${extra}`.trim();
  node.textContent = text;
  node.setAttribute("aria-hidden", "true");
  const stageRect = stage.getBoundingClientRect();
  const mascotRect = mascot.getBoundingClientRect();
  node.style.left = `${mascotRect.left - stageRect.left + mascotRect.width * 0.7}px`;
  node.style.top = `${Math.max(8, mascotRect.top - stageRect.top - 18)}px`;
  stage.append(node);
  return node;
}

function drawIdle() {
  const stage = document.querySelector("#petStage");
  const mascot = document.querySelector("#petMascot");
  if (!stage || !mascot) return;
  const pictures = ["★", "PDD", "☁", "♡", "✦", "PIXEL"];
  const art = document.createElement("div");
  art.className = "pixel-live-art";
  art.innerHTML = `<div class="pixel-live-paper"><span>${pictures[Math.floor(Math.random() * pictures.length)]}</span><i></i></div><div class="pixel-live-pencil">✎</div>`;
  art.setAttribute("aria-hidden", "true");
  const stageRect = stage.getBoundingClientRect();
  const mascotRect = mascot.getBoundingClientRect();
  art.style.left = `${mascotRect.left - stageRect.left + mascotRect.width * 0.68}px`;
  art.style.top = `${mascotRect.top - stageRect.top + mascotRect.height * 0.48}px`;
  stage.append(art);
  mascot.classList.add("pixel-live-draw");
  const reaction = document.querySelector("#petReaction");
  const oldText = reaction?.textContent || "Salut !";
  if (reaction) reaction.textContent = "Je dessine… ✎";
  window.setTimeout(() => {
    art.remove();
    mascot.classList.remove("pixel-live-draw");
    if (reaction?.textContent === "Je dessine… ✎") reaction.textContent = oldText;
  }, 4_500);
}

function simpleIdle(name) {
  const mascot = document.querySelector("#petMascot");
  if (!mascot) return;
  const options = {
    look: ["pixel-live-look", "👀", 2_400],
    stretch: ["pixel-live-stretch", "✨", 2_800],
    think: ["pixel-live-think", ["★", "?", "☁", "💡"][Math.floor(Math.random() * 4)], 3_200],
    yawn: ["pixel-live-yawn", "Zz…", 3_000]
  };
  const option = options[name];
  if (!option) return;
  const node = bubble(option[1], `pixel-live-bubble-${name}`);
  mascot.classList.add(option[0]);
  window.setTimeout(() => {
    mascot.classList.remove(option[0]);
    node?.remove();
  }, option[2]);
}

function scheduleIdle() {
  const delay = 8_000 + Math.round(Math.random() * 9_000);
  window.setTimeout(() => {
    const page = document.querySelector("#page-pixel");
    const busy = document.querySelector("[data-pet-action]:disabled, [data-shop-item]:disabled");
    if (page?.classList.contains("active") && document.visibilityState === "visible" && !busy) {
      const pet = read(LIVE_KEY) || defaults;
      const choices = pet.energy < 35 ? ["yawn", "look", "think", "draw"] : ["draw", "look", "stretch", "think", "draw"];
      const choice = choices[Math.floor(Math.random() * choices.length)];
      if (choice === "draw") drawIdle();
      else simpleIdle(choice);
    }
    scheduleIdle();
  }, delay);
}

const initial = getLivePet();
save(initial);
window.setInterval(tick, 5_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});
window.addEventListener("pageshow", tick);
window.setTimeout(() => {
  tick();
  scheduleIdle();
}, 350);
