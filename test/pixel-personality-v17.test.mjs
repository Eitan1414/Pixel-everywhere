import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePetHabits,
  recordPetHabit,
  petTemperament,
  petMoodV17,
  petActionReaction,
  petIdleThought
} from "../web/pixel-personality-v17.js";

const pet = (changes = {}) => ({
  hunger: 82, joy: 88, energy: 76,
  xp: 20, level: 7, interactions: 2,
  points: 250, lastAction: "Ancienne activité",
  ...changes
});

test("Pixel 2.0: une ancienne sauvegarde sans habitudes reste curieuse", () => {
  const oldSave = pet();
  assert.equal(petTemperament(oldSave).id, "curious");
  assert.deepEqual(normalizePetHabits(oldSave.habits),
    {feed:0,pet:0,bounce:0,walk:0,sleep:0});
  assert.equal(oldSave.level, 7);
  assert.equal(oldSave.xp, 20);
  assert.equal(oldSave.points, 250);
  assert.equal(oldSave.habits, undefined);
});

test("Pixel 2.0: les activités répétées construisent une personnalité", () => {
  let habits = normalizePetHabits();
  habits = recordPetHabit(habits, "feed");
  habits = recordPetHabit(habits, "treat");
  habits = recordPetHabit(habits, "feast");
  assert.equal(petTemperament(pet({habits})).id, "foodie");

  for (let i = 0; i < 5; i++) habits = recordPetHabit(habits,"pet");
  assert.equal(petTemperament(pet({habits})).id, "cuddly");
  for (let i = 0; i < 7; i++) habits = recordPetHabit(habits,"bounce");
  assert.equal(petTemperament(pet({habits})).id, "playful");
  for (let i = 0; i < 9; i++) habits = recordPetHabit(habits,"walk");
  assert.equal(petTemperament(pet({habits})).id, "explorer");
  for (let i = 0; i < 11; i++) habits = recordPetHabit(habits,"sleep");
  assert.equal(petTemperament(pet({habits})).id, "dreamer");
  assert.deepEqual(habits,{feed:3,pet:5,bounce:7,walk:9,sleep:11});
});

test("Pixel 2.0: ex-aequo = caractère curieux, sans tirage aléatoire", () => {
  assert.equal(petTemperament(pet({habits:{feed:3,bounce:3}})).id,"curious");
  assert.equal(petTemperament(pet({habits:{feed:3,bounce:2}})).id,"curious");
  assert.equal(petTemperament(pet({habits:{feed:3,bounce:1}})).id,"foodie");
});

test("Pixel 2.0: validation des anciennes données sans écraser l'économie", () => {
  const input = {feed:"4", pet:-12, bounce:Infinity, sleep:12345678, walk:"non", coins:99};
  const original = structuredClone(input);
  const habits = normalizePetHabits(input);
  assert.deepEqual(habits,{feed:4,pet:0,bounce:0,walk:0,sleep:100000});
  assert.equal(input.coins,99);
  assert.equal(input.pet,original.pet);
  assert.equal(recordPetHabit(habits,"inconnu").feed,4);
  assert.equal(recordPetHabit(habits,"meal").feed,5);
  assert.equal(habits.feed,4);
});

test("Pixel 2.0: les humeurs suivent les besoins et l'heure", () => {
  assert.equal(petMoodV17(pet({hunger:20}),12).id,"hungry");
  assert.equal(petMoodV17(pet({energy:20}),12).id,"sleepy");
  assert.equal(petMoodV17(pet({hunger:80,energy:45}),23).id,"sleepy");
  assert.equal(petMoodV17(pet({joy:20}),12).id,"grumpy");
  assert.equal(petMoodV17(pet({energy:39,joy:82}),12).id,"tired");
  assert.equal(petMoodV17(pet(),12).id,"excited");
  assert.equal(petMoodV17(pet({joy:72}),12).id,"happy");
  assert.equal(petMoodV17(pet({joy:49,hunger:80,energy:65}),12).id,"curious");
  assert.equal(petMoodV17(pet({hunger:NaN,energy:Infinity}),12).id,"excited");
});

test("Pixel 2.0: les répliques répondent à l'humeur avant l'action", () => {
  assert.match(petActionReaction(pet(),"feed","hungry"),/faim|grignoter/);
  assert.match(petActionReaction(pet(),"pet","grumpy"),/câlin/);
  assert.match(petActionReaction(pet(),"sleep","sleepy"),/dodo/);
  assert.match(petActionReaction(pet(),"walk","excited"),/explorer/);
  assert.match(petActionReaction(pet(),"bounce","sleepy"),/sieste/);
});

test("Pixel 2.0: répliques habituelles variées et préférence mémorisée", () => {
  const normal = pet({interactions:1});
  assert.notEqual(petActionReaction(normal,"bounce"),
    petActionReaction(pet({interactions:2}),"bounce"));
  const favorites = pet({interactions:3,habits:{walk:5}});
  assert.match(petActionReaction(favorites,"walk"),/aventure/);
  assert.match(petActionReaction(pet({interactions:10}),"feast"),/festin|Waouh|repas/i);
  assert.match(petActionReaction(pet(),"unknown"),/content/);
});

test("Pixel 2.0: petites pensées sans consommation de pièce ni progression", () => {
  const initial=pet({energy:15});
  const snapshot=structuredClone(initial);
  const first=petIdleThought(initial,23,0);
  const second=petIdleThought(initial,23,1);
  assert.ok(first.length>0);
  assert.notEqual(first,second);
  assert.deepEqual(initial,snapshot);
});
