/**
 * Pixel 2.0: deterministic, local-only mood and temperament.
 * This module has no DOM or API dependencies, so old pet saves can be upgraded
 * without changing XP, currency, action prices or the server's cooldowns.
 */
const HABIT_NAMES = ["feed", "pet", "bounce", "walk", "sleep"];
const ACTION_HABIT = Object.freeze({
  feed: "feed", treat: "feed", meal: "feed", feast: "feed",
  pet: "pet", bounce: "bounce", walk: "walk", sleep: "sleep"
});
const TRAITS = Object.freeze({
  curious: {
    id: "curious", label: "Curieux", emoji: "🔎",
    description: "Pixel adore découvrir ce qui se passe dans l’atelier."
  },
  foodie: {
    id: "foodie", label: "Gourmand", emoji: "🍊",
    description: "Pixel reconnaît les meilleurs goûters à des kilomètres !"
  },
  cuddly: {
    id: "cuddly", label: "Câlin", emoji: "💛",
    description: "Pixel a pris l’habitude de venir chercher des câlins."
  },
  playful: {
    id: "playful", label: "Joueur", emoji: "✨",
    description: "Pixel a toujours une idée de jeu en réserve."
  },
  explorer: {
    id: "explorer", label: "Explorateur", emoji: "👟",
    description: "Pixel ne perd jamais une occasion de partir en balade."
  },
  dreamer: {
    id: "dreamer", label: "Rêveur", emoji: "🌙",
    description: "Pixel aime les petits moments paisibles et douillets."
  }
});
const TRAIT_FOR_HABIT = {
  feed: "foodie", pet: "cuddly", bounce: "playful", walk: "explorer", sleep: "dreamer"
};

export function normalizePetHabits(value) {
  const result = {};
  for (const key of HABIT_NAMES) {
    const count = Number(value?.[key]);
    result[key] = Number.isFinite(count) && count >= 0
      ? Math.min(100_000, Math.floor(count)) : 0;
  }
  return result;
}

export function recordPetHabit(habits, action) {
  const result = normalizePetHabits(habits);
  const key = ACTION_HABIT[action];
  if (key) result[key] = Math.min(100_000, result[key] + 1);
  return result;
}

export function petTemperament(pet) {
  const habits = normalizePetHabits(pet?.habits);
  const ranking = HABIT_NAMES.map((name) => ({name, count: habits[name]}))
    .sort((a,b) => b.count - a.count);
  const favorite = ranking[0];
  const runnerUp = ranking[1];
  if (!favorite || favorite.count < 3 || favorite.count - runnerUp.count < 2) {
    return TRAITS.curious;
  }
  return TRAITS[TRAIT_FOR_HABIT[favorite.name]];
}

function stat(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(5, Math.min(100, number)) : fallback;
}

export function petMoodV17(pet, hour = 12) {
  const hunger = stat(pet?.hunger, 82);
  const joy = stat(pet?.joy, 88);
  const energy = stat(pet?.energy, 76);
  const night = Number(hour) >= 22 || Number(hour) < 6;
  if (hunger < 32 && hunger <= energy + 5) return {
    id:"hungry",emoji:"🍊",label:"Affamé",
    message:"Pixel regarde sa gamelle… Une orange lui ferait plaisir !"
  };
  if (energy < 30 || (night && energy < 55)) return {
    id:"sleepy",emoji:"🌙",label:"Somnolent",
    message:"Pixel bâille et cherche son coin douillet."
  };
  if (joy < 32) return {
    id:"grumpy",emoji:"💭",label:"Boudeur",
    message:"Pixel fait une petite moue. Un moment ensemble lui ferait du bien."
  };
  if (energy < 45) return {
    id:"tired",emoji:"💤",label:"Fatigué",
    message:"Pixel ralentit un peu. Il aimerait souffler."
  };
  if (joy >= 85 && energy >= 55 && hunger >= 45) return {
    id:"excited",emoji:"✨",label:"Surexcité",
    message:"Pixel déborde d'énergie et cherche une nouvelle aventure !"
  };
  if (joy >= 65 && hunger >= 40) return {
    id:"happy",emoji:"💛",label:"Heureux",
    message:"Pixel est content d'être avec toi."
  };
  return {
    id:"curious",emoji:"🔎",label:"Curieux",
    message:"Pixel observe l'atelier… Il se demande ce qu'on va faire."
  };
}

const ACTION_LINES = {
  feed: ["Miam ! C'est délicieux ! 🍊", "Encore une petite bouchée ? 🍊", "Merci pour le goûter ! 💛"],
  pet: ["Ça chatouille ! 💛", "J'adore tes câlins ! ✨", "Encore un peu ? 💛"],
  bounce: ["Tu as vu mon saut ? ✨", "On recommence ? ⭐", "Quelle énergie ! 🎾"],
  walk: ["À l'aventure ! 👟", "Regarde ce que j'ai trouvé ! 🌟", "Encore un petit tour ? 🍃"],
  sleep: ["Zzz… C'est confortable. 🌙", "Je rêve d'étoiles… ✨", "Bonne petite sieste ! 💤"],
  treat: ["Oh, une friandise ! 🍪", "Délicieux ! Merci ! 🍪", "Mon goûter préféré ! 🍪"],
  meal: ["Un vrai repas ! 🍜", "Ça sent si bon ! 🍜", "Je me régale ! 🍜"],
  feast: ["C'est un festin royal ! 🍱", "Waouh, tout ça pour moi ? ✨", "Quel merveilleux repas ! 🍱"]
};
const MOOD_LINES = {
  hungry: {feed:"Enfin quelque chose à grignoter ! 🍊",treat:"Miam ! J'avais faim ! 🍪",
    meal:"Ça tombe bien, j'avais très faim ! 🍜",feast:"Tu as sauvé mon goûter ! 🍱"},
  sleepy: {sleep:"Oh oui, un petit dodo… 💤",pet:"Tout doucement… Je somnole. 💛",
    bounce:"Un petit saut… puis une sieste ! 💤",walk:"J'arrive… je bâille ! 🌙"},
  grumpy: {pet:"Bon… ce câlin me fait sourire ! 💛",bounce:"Hihi ! Je boude déjà moins ! ✨",
    walk:"Une promenade, ça change les idées ! 👟"},
  excited: {bounce:"PLUS HAUT ! ✨",walk:"Vite, allons explorer ! 👟"},
  tired: {sleep:"Enfin un peu de repos ! 🌙",pet:"Un câlin tranquille, merci ! 💛"}
};

export function petActionReaction(pet, action, previousMood = "") {
  const lines = ACTION_LINES[action];
  if (!lines) return "Pixel est content de te voir ! 💛";
  const moodLine = MOOD_LINES[previousMood]?.[action];
  if (moodLine) return moodLine;
  const trait = petTemperament(pet);
  const habit = ACTION_HABIT[action];
  const favorite = trait.id !== "curious" &&
    TRAIT_FOR_HABIT[habit] === trait.id;
  const count = Math.max(0, Math.floor(Number(pet?.interactions) || 0));
  if (favorite && count % 3 === 0) {
    return {
      foodie:"Tu connais mes goûts par cœur ! 🍊",
      cuddly:"C'est notre petit rituel ! 💛",
      playful:"On forme une super équipe ! ✨",
      explorer:"La prochaine aventure nous attend ! 👟",
      dreamer:"J'adore nos moments tout doux. 🌙"
    }[trait.id];
  }
  return lines[count % lines.length];
}

const IDLE_LINES = {
  hungry:["Je rêve d'une orange… 🍊","Tu as vu ma gamelle ? 👀"],
  sleepy:["Mes yeux se ferment… 💤","Encore cinq minutes… 🌙"],
  grumpy:["Je fais une petite tête, mais je t'aime bien ! 💛","On joue un peu ?"],
  tired:["Une petite pause et ça repart ! 🍃","On se repose un instant ?"],
  excited:["On dessine une étoile ? ✨","Je déborde d'idées ! 🌟"],
  happy:["J'aime bien notre atelier ! 💛","Tu veux voir mon nouveau dessin ? ✎"],
  curious:["Qu'est-ce qu'on explore aujourd'hui ? 🔎","Je me demande ce qu'il y a dehors… 👀"]
};

const TRAIT_IDLE_LINES = {
  foodie: ["Je pense déjà au prochain goûter… 🍊", "Tu connais une bonne recette ? 🍪"],
  cuddly: ["On s'installe ensemble ? 💛", "J'aime bien quand tu restes près de moi."],
  playful: ["J'ai inventé un nouveau jeu ! ✨", "On fait une partie après ? 🎾"],
  explorer: ["Il y a tant de choses à découvrir ! 👟", "J'ai envie de voir ce qu'il y a dehors."],
  dreamer: ["J'ai fait un rêve plein d'étoiles… 🌙", "Je me demande ce que dessinent les nuages."]
};

export function petIdleThought(pet, hour = 12, index = 0) {
  const mood = petMoodV17(pet, hour);
  const lines = IDLE_LINES[mood.id];
  const safeIndex = Number.isFinite(Number(index)) ? Math.max(0,Math.floor(Number(index))) : 0;
  const trait = petTemperament(pet);
  const quietMoment = ["curious","happy","excited"].includes(mood.id);
  if (quietMoment && safeIndex % 2 === 1 && TRAIT_IDLE_LINES[trait.id]) {
    const favorites = TRAIT_IDLE_LINES[trait.id];
    return favorites[Math.floor(safeIndex / 2) % favorites.length];
  }
  return lines[safeIndex % lines.length];
}
