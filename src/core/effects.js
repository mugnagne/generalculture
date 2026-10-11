/**
 * effects.js — Catalogue des identifiants d'effet.
 *
 * Chaque entrée implémente un identifiant utilisé dans les JSON de src/data/, sous forme
 * de gestionnaires nommés d'après les hooks (voir hooks.js) :
 *   - hooks d'événement   : (ctx, params, source) => void
 *   - modificateurs       : (valeur, ctx, params, source) => nouvelle valeur
 *   - `apply`             : effet immédiat (événements, consommables utilisés)
 *   - `order`             : phase de chaque modificateur (base, add, mul, set ; défaut add)
 * Les paramètres viennent toujours des données, jamais du code.
 *
 * Contexte (ctx) : { run, content, rng(stream), combat?, question?, answer? }
 *   combat  : état du combat en cours (voir combat.js, jalon 2)
 *   answer  : { correct, elapsedMs, theme } au moment d'une réponse
 */
import { heal, gainMaxHp, loseHp, loseMaxHp, gainGold } from './run.js';

/** Conditions de bonusDamage. */
const WHEN = {
  always: () => true,
  firstCorrectOfCombat: (ctx) => (ctx.combat?.correctCount ?? 0) === 0,
  fastAnswer: (ctx, p) => (ctx.answer?.elapsedMs ?? Infinity) < p.seconds * 1000,
  theme: (ctx, p) => ctx.question?.theme === p.theme,
};

export const EFFECTS = {
  /* ---------------- Points de vie ---------------- */
  heal: {
    apply: (ctx, p) => heal(ctx.run, p.percentMax ? (ctx.run.maxHp * p.percentMax) / 100 : p.amount),
  },
  loseHp: {
    apply: (ctx, p) => loseHp(ctx.run, p.amount),
  },
  gainMaxHp: {
    // Relique : à l'obtention ; consommable ou événement : à l'utilisation
    onAcquire: (ctx, p) => gainMaxHp(ctx.run, p.amount, { healToo: p.heal }),
    apply: (ctx, p) => gainMaxHp(ctx.run, p.amount, { healToo: p.heal }),
  },
  loseMaxHp: {
    apply: (ctx, p) => loseMaxHp(ctx.run, p.amount),
  },
  healOnCombatEnd: {
    onCombatEnd: (ctx, p) => { if (ctx.run.hp > 0) heal(ctx.run, p.amount); },
  },

  /* ---------------- Or ---------------- */
  gainGold: {
    apply: (ctx, p) => gainGold(ctx.run, p.amount),
  },
  loseGold: {
    apply: (ctx, p) => { ctx.run.gold = Math.max(0, ctx.run.gold - p.amount); },
  },
  goldMultiplier: {
    order: { modifyGold: 'mul' },
    modifyGold: (v, ctx, p) => v * p.mult,
  },

  /* ---------------- Dégâts ---------------- */
  bonusDamage: {
    modifyDamageDealt: (v, ctx, p) => (WHEN[p.when ?? 'always']?.(ctx, p) ? v + p.amount : v),
  },
  permanentDamage: {
    apply: (ctx, p) => { ctx.run.bonuses.damage += p.amount; },
  },

  /* ---------------- Chrono ---------------- */
  timerBonus: {
    modifyTimer: (v, ctx, p) => v + p.seconds,
  },
  timerDelta: {
    modifyTimer: (v, ctx, p) => v + p.seconds,
  },
  // « Chrono de base N s » : remplace la base avant les bonus (le plus court l'emporte)
  setBaseTimer: {
    order: { modifyTimer: 'base' },
    modifyTimer: (v, ctx, p) => Math.min(v, p.seconds),
  },
  setTimer: {
    order: { modifyTimer: 'base' },
    modifyTimer: (v, ctx, p) => Math.min(v, p.seconds),
  },

  /* ---------------- Emplacements ---------------- */
  extraRelicSlots: {
    onAcquire: (ctx, p) => { ctx.run.relicSlots += p.count; },
  },
};

/** Identifiants d'effet implémentés. */
export const implementedEffects = () => Object.keys(EFFECTS).sort();
