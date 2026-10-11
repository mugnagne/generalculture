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
 *   - `needs`             : pour un consommable, ce qu'il faut pour l'utiliser
 *                           ('question' : une question affichée ; 'combat' ; défaut : rien)
 * Les paramètres viennent toujours des données, jamais du code.
 *
 * Contexte (ctx) : { run, content, rng(stream), combat?, question?, answer?, actions? }
 *   combat  : état du combat en cours (voir combat.js)
 *   answer  : { correct, elapsedMs, theme } au moment d'une réponse
 *   actions : consignes pour l'écran (retirer des réponses, ajouter du temps…), voir items.js
 *
 * Effets temporaires d'une fiole (bouclier, huile…) : `apply` ajoute la fiole aux « buffs »
 * du combat ; ses propres gestionnaires de hooks s'appliquent alors tant qu'elle y reste.
 */
import { heal, gainMaxHp, loseHp, loseMaxHp, gainGold, addConsumable, randomConsumable, removeConsumable } from './run.js';

/** Ajoute la fiole utilisée aux effets temporaires du combat. */
function addBuff(ctx, state = {}) {
  ctx.combat.buffs.push({ id: ctx.source.id, effects: ctx.source.effects, state });
}

/** Retire un effet temporaire épuisé. */
function endBuff(ctx, source) {
  if (source.kind === 'buff') ctx.combat.buffs = ctx.combat.buffs.filter((b) => b !== source.buff);
}

const onWrongOrTimeout = (fn) => ({ onWrong: fn, onTimeout: fn });

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

  /* ---------------- Capacités ennemies ---------------- */
  // Lues directement par le moteur de combat (activeEffect) : rien à faire dans les hooks
  delayAnswers: { query: true },
  forceDifficulty: { query: true },
  rampDamageOnWrong: {
    onWrong: (ctx, p) => { ctx.combat.enemy.rage += p.amount; },
    onTimeout: (ctx, p) => { ctx.combat.enemy.rage += p.amount; },
  },
  regenEvery: {
    // Au début des questions 4, 7, 10… (après chaque série de `every` questions)
    onQuestionStart: (ctx, p) => {
      const { enemy, questionCount } = ctx.combat;
      if (questionCount > 1 && (questionCount - 1) % p.every === 0) enemy.hp = Math.min(enemy.maxHp, enemy.hp + p.amount);
    },
  },

  /* ---------------- Reliques : dégâts ---------------- */
  // +perStreak par bonne réponse consécutive déjà donnée dans le combat
  streakDamage: {
    modifyDamageDealt: (v, ctx, p) => v + (ctx.combat?.streak ?? 0) * p.perStreak,
  },
  // Ennemi à `threshold` PV ou moins : la bonne réponse l'achève
  finisher: {
    order: { modifyDamageDealt: 'set' },
    modifyDamageDealt: (v, ctx, p) => {
      const hp = ctx.combat?.enemy.hp ?? Infinity;
      return hp <= p.threshold ? Math.max(v, hp) : v;
    },
  },
  polymath: {
    modifyDamageDealt: (v, ctx, p) => v + (ctx.combat?.themesSucceeded.length ?? 0) * p.per,
  },
  encyclopedia: {
    onCorrect: (ctx, p, source) => {
      source.state.count = (source.state.count ?? 0) + 1;
      if (source.state.count % p.every === 0) ctx.run.bonuses.damage += p.amount;
    },
  },
  // Thème choisi à l'obtention (state.theme) : dégâts et dégâts subis multipliés
  specialist: {
    order: { modifyDamageDealt: 'mul', modifyDamageTaken: 'mul' },
    modifyDamageDealt: (v, ctx, p, source) => (ctx.question?.theme === source.state.theme ? v * p.damageMult : v),
    modifyDamageTaken: (v, ctx, p, source) => (ctx.question?.theme === source.state.theme ? v * p.takenMult : v),
  },

  /* ---------------- Reliques : survie ---------------- */
  blockFirstWrong: {
    order: { modifyDamageTaken: 'set' },
    modifyDamageTaken: (v, ctx) => ((ctx.combat?.wrongCount ?? 1) === 0 ? 0 : v),
  },
  // Lu par le moteur de combat (resolveAnswer) : une fois par combat
  secondChance: { query: true },
  // Fée en bouteille (consommée) ou Queue de lézard (une fois par partie)
  reviveOnDeath: {
    onLethal: (ctx, p, source) => {
      if (ctx.run.hp > 0 || source.state.used) return;
      ctx.run.hp = Math.max(1, Math.round((ctx.run.maxHp * p.percentMax) / 100));
      ctx.revived = source.id;
      if (p.consume && source.kind === 'consumable') removeConsumable(ctx.run, source.slot);
      if (p.oncePerRun) source.state.used = true;
    },
  },

  /* ---------------- Reliques : or ---------------- */
  // +gold à chaque étage tant que rien n'a été dépensé depuis son obtention
  piggyBank: {
    onFloorEnter: (ctx, p, source) => { if (!source.state.broken) gainGold(ctx.run, p.gold); },
    onSpend: (ctx, p, source) => { source.state.broken = true; },
  },
  healOnShopEnter: {
    onShopEnter: (ctx, p) => heal(ctx.run, p.amount),
  },
  growingSellValue: {
    onCombatEnd: (ctx, p, source) => { source.state.bonusValue = (source.state.bonusValue ?? 0) + p.step; },
  },

  /* ---------------- Reliques : carte ---------------- */
  // Charges lues par la carte (flow.js) : state.used compte les charges dépensées
  freeTravel: { query: true },

  /* ---------------- Reliques de boss ---------------- */
  noRest: { query: true },
  hideMapThemes: { query: true },
  noConsumableDrops: { query: true },
  eliteExtraRelics: { query: true },
  eliteBonusHp: { query: true },

  /* ---------------- Consommables ---------------- */
  removeWrongAnswers: {
    needs: 'question',
    apply: (ctx, p) => {
      const q = ctx.question;
      const removed = new Set(ctx.combat.removedAnswers ?? []);
      const pool = q.reponses.filter((r) => r !== q.bonne_reponse && !removed.has(r));
      const out = ctx.rng('combat').shuffle(pool).slice(0, p.count);
      ctx.combat.removedAnswers = [...removed, ...out];
      ctx.actions.push({ type: 'removeAnswers', answers: out });
    },
  },
  addTime: {
    needs: 'question',
    apply: (ctx, p) => ctx.actions.push({ type: 'addTime', seconds: p.seconds }),
  },
  swapQuestion: {
    needs: 'question',
    apply: (ctx) => ctx.actions.push({ type: 'swapQuestion' }),
  },
  crowdVote: {
    needs: 'question',
    apply: (ctx, p) => {
      const q = ctx.question;
      const rng = ctx.rng('combat');
      const removed = new Set(ctx.combat.removedAnswers ?? []);
      const others = q.reponses.filter((r) => r !== q.bonne_reponse && !removed.has(r));
      // La bonne réponse reste en tête, même s'il ne reste qu'une mauvaise réponse
      const best = Math.max(rng.int(p.correctMin, p.correctMax), Math.floor(100 / (others.length + 1)) + 1);
      const votes = { [q.bonne_reponse]: others.length ? best : 100 };
      let left = 100 - votes[q.bonne_reponse];
      others.forEach((r, i) => {
        // Les mauvaises réponses se partagent le reste, chacune sous la bonne
        const after = others.length - 1 - i;
        const share = after === 0 ? left : rng.int(Math.max(0, left - after * (best - 1)), Math.min(left, best - 1));
        votes[r] = share;
        left -= share;
      });
      ctx.actions.push({ type: 'votes', votes });
    },
  },
  chooseNextTheme: {
    needs: 'combat',
    apply: (ctx) => ctx.actions.push({ type: 'chooseTheme' }),
  },
  damageEnemy: {
    needs: 'combat',
    apply: (ctx, p) => {
      const e = ctx.combat.enemy;
      e.hp = Math.max(0, e.hp - p.amount);
      ctx.actions.push({ type: 'damage', amount: p.amount });
    },
  },
  blockNextWrong: {
    needs: 'combat',
    apply: (ctx, p) => addBuff(ctx, { charges: p.charges }),
    order: { modifyDamageTaken: 'set' },
    modifyDamageTaken: (v, ctx, p, source) => (source.kind === 'buff' && source.state.charges > 0 ? 0 : v),
    ...onWrongOrTimeout((ctx, p, source) => {
      if (source.kind !== 'buff') return;
      source.state.charges--;
      if (source.state.charges <= 0) endBuff(ctx, source);
    }),
  },
  bonusDamageCharges: {
    needs: 'combat',
    apply: (ctx, p) => addBuff(ctx, { charges: p.charges }),
    modifyDamageDealt: (v, ctx, p, source) => (source.kind === 'buff' && source.state.charges > 0 ? v + p.amount : v),
    onCorrect: (ctx, p, source) => {
      if (source.kind !== 'buff') return;
      source.state.charges--;
      if (source.state.charges <= 0) endBuff(ctx, source);
    },
  },
  // La prochaine réponse seulement : bonne = dégâts ×, erreur = dégâts subis ×
  berserk: {
    needs: 'combat',
    apply: (ctx) => addBuff(ctx),
    order: { modifyDamageDealt: 'mul', modifyDamageTaken: 'mul' },
    modifyDamageDealt: (v, ctx, p, source) => (source.kind === 'buff' ? v * p.damageMult : v),
    modifyDamageTaken: (v, ctx, p, source) => (source.kind === 'buff' ? v * p.takenMult : v),
    onCorrect: (ctx, p, source) => endBuff(ctx, source),
    ...onWrongOrTimeout((ctx, p, source) => endBuff(ctx, source)),
  },
  fleeCombat: {
    needs: 'combat',
    usable: (ctx, p) => p.allowBoss || ctx.combat.kind !== 'boss',
    apply: (ctx) => {
      ctx.combat.over = 'fled';
      ctx.actions.push({ type: 'flee' });
    },
  },
  fillConsumables: {
    needs: 'combat',
    apply: (ctx) => {
      while (addConsumable(ctx.run, randomConsumable(ctx.run))) { /* jusqu'à remplir */ }
      ctx.actions.push({ type: 'refresh' });
    },
  },

  /* ---------------- Emplacements ---------------- */
  extraRelicSlots: {
    onAcquire: (ctx, p) => { ctx.run.relicSlots += p.count; },
  },
};

/** Identifiants d'effet implémentés. */
export const implementedEffects = () => Object.keys(EFFECTS).sort();
