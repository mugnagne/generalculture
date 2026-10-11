/**
 * run.js — État d'une partie rogue-lite, actions de base et sauvegarde.
 *
 * L'état est un objet JSON pur (sérialisable tel quel) : PV, or, reliques, consommables,
 * carte, position, bonus permanents, statistiques et états des flux aléatoires.
 * Il est sauvegardé dans localStorage à chaque case (et à chaque achat, choix…).
 */
import { getContent, itemDef } from './content.js';
import { Hooks } from './hooks.js';
import { EFFECTS } from './effects.js';
import { initialStreams, normalizeSeed, rngOf } from './rng.js';

export const SAVE_KEY = 'valdorn:run:v1';
export const RUN_VERSION = 2; // 2 : carte et combats (les parties du jalon 1 ne sont pas reprises)

/* ------------------------------------------------------------------ */
/*  Création                                                           */
/* ------------------------------------------------------------------ */

export function createRun({ characterId, seed }) {
  const c = getContent();
  const character = c.characters.find((ch) => ch.id === characterId);
  if (!character) throw new Error(`Personnage inconnu : ${characterId}`);
  const b = c.balance.run;
  const run = {
    version: RUN_VERSION,
    seed: normalizeSeed(seed),
    characterId,
    hp: character.hp,
    maxHp: character.hp,
    gold: b.startGold,
    relics: [],
    relicSlots: b.relicSlots,
    consumables: Array(b.consumableSlots).fill(null),
    act: 1,
    floor: 0,
    map: null,
    position: null,
    bossesByAct: {},
    combat: null,
    pendingRewards: null,
    bonuses: { damage: 0, themeDamage: {} },
    consumableDropChance: c.balance.rewards.consumableDrop.start,
    usedQuestions: [],
    stats: {
      correct: 0, wrong: 0, timeouts: 0, byTheme: {}, combatsWon: 0, elitesWon: 0, bossesWon: 0,
      floorsCleared: 0, deathCause: null,
    },
    flags: { goldSpent: false },
    resume: { scene: 'map', data: {} },
    rng: initialStreams(seed),
    startedAt: new Date().toISOString(),
    updatedAt: null,
    over: null, // null | 'victory' | 'defeat'
  };

  addRelic(run, character.startRelic);
  const rng = rngOf(run, 'rewards');
  for (let i = 0; i < b.startConsumables; i++) {
    const pool = c.consumables.filter((x) => x.rarity === b.startConsumableRarity);
    addConsumable(run, rng.pick(pool).id);
  }
  hooksFor(run).emit('onRunStart', contextFor(run));
  return run;
}

/* ------------------------------------------------------------------ */
/*  Effets : sources actives et contexte                               */
/* ------------------------------------------------------------------ */

/** Sources d'effets permanentes de la partie (personnage, reliques, consommables passifs). */
export function runSources(run) {
  const c = getContent();
  const character = c.characters.find((ch) => ch.id === run.characterId);
  const sources = [{ kind: 'character', id: character.id, effects: character.effects ?? [], state: {} }];
  for (const r of run.relics) {
    const def = itemDef(r.id);
    if (def) sources.push({ kind: 'relic', id: r.id, effects: def.effects, state: r.state, instance: r });
  }
  run.consumables.forEach((id, slot) => {
    const def = id && itemDef(id);
    if (def?.passive) sources.push({ kind: 'consumable', id, slot, effects: def.effects, state: {} });
  });
  return sources;
}

/**
 * Hooks de la partie. `extra` fournit les sources propres au combat en cours
 * (capacités de l'ennemi, effets temporaires des consommables).
 */
export function hooksFor(run, extra = () => []) {
  return new Hooks(EFFECTS, () => [...runSources(run), ...extra()]);
}

/** Contexte passé aux effets. */
export function contextFor(run, more = {}) {
  return { run, content: getContent(), rng: (stream) => rngOf(run, stream), ...more };
}

/* ------------------------------------------------------------------ */
/*  Actions de base (utilisées par les effets et les scènes)           */
/* ------------------------------------------------------------------ */

export function heal(run, amount) {
  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + Math.max(0, Math.round(amount)));
  return run.hp - before;
}

export function loseHp(run, amount) {
  run.hp = Math.max(0, run.hp - Math.max(0, Math.round(amount)));
  return run.hp;
}

export function gainMaxHp(run, amount, { healToo = false } = {}) {
  run.maxHp += amount;
  if (healToo) heal(run, amount);
}

export function loseMaxHp(run, amount) {
  run.maxHp = Math.max(1, run.maxHp - amount);
  run.hp = Math.min(run.hp, run.maxHp);
}

/** Gain d'or, modifié par les effets (modifyGold). Renvoie l'or effectivement gagné. */
export function gainGold(run, amount, hooks = hooksFor(run)) {
  const gained = Math.max(0, Math.round(hooks.modify('modifyGold', amount, contextFor(run))));
  run.gold += gained;
  return gained;
}

export function spendGold(run, amount) {
  if (run.gold < amount) return false;
  run.gold -= amount;
  run.flags.goldSpent = true;
  hooksFor(run).emit('onSpend', contextFor(run, { amount }));
  return true;
}

export const freeRelicSlots = (run) => run.relicSlots - run.relics.length;
export const freeConsumableSlots = (run) => run.consumables.filter((x) => x === null).length;

/** Ajoute une relique (ou relique de boss) si un emplacement est libre. */
export function addRelic(run, id, { theme } = {}) {
  if (freeRelicSlots(run) <= 0) return false;
  const instance = { id, state: theme ? { theme } : {} };
  run.relics.push(instance);
  const def = itemDef(id);
  hooksFor(run).emitSource({ kind: 'relic', id, effects: def.effects, state: instance.state, instance }, 'onAcquire', contextFor(run));
  return true;
}

/** Valeur de revente d'une relique (moitié du prix, + bonus éventuel comme l'Œuf d'or). */
export function sellValue(instance) {
  const c = getContent();
  const def = itemDef(instance.id);
  const rarity = c.bossRelicById[instance.id] ? 'boss' : def?.rarity;
  const price = c.balance.shop.relicPrices[rarity] ?? 0;
  return Math.floor(price * c.balance.shop.sellRatio) + (instance.state.bonusValue ?? 0);
}

export function removeRelic(run, instance) {
  run.relics = run.relics.filter((r) => r !== instance);
}

export function addConsumable(run, id) {
  const slot = run.consumables.indexOf(null);
  if (slot < 0) return false;
  run.consumables[slot] = id;
  return true;
}

export function removeConsumable(run, slot) {
  run.consumables[slot] = null;
}

/** Tirage d'un consommable selon les raretés de balance.json. */
export function randomConsumable(run, stream = 'rewards') {
  const c = getContent();
  const rng = rngOf(run, stream);
  const rarity = rng.weighted(c.balance.rarity.consumables);
  return rng.pick(c.consumables.filter((x) => x.rarity === rarity)).id;
}

/** Tirage d'une relique ordinaire non possédée (rareté donnée ou tirée au sort). */
export function randomRelic(run, { rarity = null, stream = 'rewards', exclude = [] } = {}) {
  const c = getContent();
  const rng = rngOf(run, stream);
  const owned = new Set([...run.relics.map((r) => r.id), ...exclude]);
  const r = rarity && rarity !== 'random' ? rarity : rng.weighted(c.balance.rarity.relics);
  let pool = c.relics.filter((x) => x.rarity === r && !owned.has(x.id));
  if (!pool.length) pool = c.relics.filter((x) => !owned.has(x.id));
  return rng.pick(pool)?.id ?? null;
}

/* ------------------------------------------------------------------ */
/*  Sauvegarde                                                         */
/* ------------------------------------------------------------------ */

export function saveRun(run) {
  run.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false; // navigation privée, stockage plein : la partie continue sans sauvegarde
  }
}

export function loadRun() {
  try {
    const run = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    return run && run.version === RUN_VERSION && !run.over ? run : null;
  } catch {
    return null;
  }
}

/** Partie sauvegardée, même terminée (écran de bilan). */
export function loadFinishedRun() {
  try {
    const run = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    return run && run.version === RUN_VERSION ? run : null;
  } catch {
    return null;
  }
}

export function deleteRun() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* rien à effacer */ }
}
