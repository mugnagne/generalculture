/**
 * combat.js — Moteur de combat (sans affichage).
 *
 * L'état du combat vit dans run.combat (sérialisable) : il est sauvegardé après chaque
 * réponse, ce qui permet de reprendre un combat interrompu sans tricher sur les PV.
 *
 * Bonne réponse : l'ennemi perd des PV (1 de base + bonus permanents, puis modifyDamageDealt).
 * Erreur ou temps écoulé : le héros subit les dégâts de l'intention (puis modifyDamageTaken).
 * Le combat dure jusqu'à 0 PV d'un des deux camps.
 */
import { getContent, regionOfTheme } from './content.js';
import { hooksFor, contextFor, gainGold, randomConsumable, randomRelic, runSources } from './run.js';
import { rngOf } from './rng.js';

const KIND = { combat: 'soldier', elite: 'elite', boss: 'boss' };

/* ------------------------------------------------------------------ */
/*  Création                                                           */
/* ------------------------------------------------------------------ */

/** Prépare le combat d'une case (combat, élite ou boss) et l'attache à la partie. */
export function createCombat(run, node) {
  const c = getContent();
  const kind = KIND[node.type];
  const act = run.act;
  const stats = c.balance.enemies[kind];
  const region = node.type === 'boss' ? c.regionById[node.region] : regionOfTheme(node.theme);
  const rng = rngOf(run, 'combat');

  const pool = kind === 'elite' ? c.enemies.eliteAbilities : kind === 'boss' ? c.enemies.bossAbilities : [];
  const abilities = rng.shuffle(pool).slice(0, stats.abilities);
  const def = kind === 'soldier' ? region.soldiers : kind === 'elite' ? region.knight : region.boss;
  // Étoile noire : PV supplémentaires pour les élites
  const bonusHp = kind === 'elite' ? effectParams(run, 'eliteBonusHp').reduce((n, p) => n + p.amount, 0) : 0;
  const hp = stats.hp[act - 1] + bonusHp;

  run.combat = {
    nodeId: node.id,
    kind,
    act,
    regionId: region.id,
    theme: node.theme,
    enemy: {
      name: def.name,
      sprite: def.sprite,
      attack: def.attack ?? null,
      hp,
      maxHp: hp,
      damage: stats.damage[act - 1],
      rage: 0,
      abilities,
    },
    questionCount: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    themesSucceeded: [],
    phase: 1,
    buffs: [],
    removedAnswers: [],
    nextTheme: null,
    secondChanceUsed: false,
    over: null, // null | 'won' | 'lost' | 'fled'
  };
  const hooks = combatHooks(run);
  hooks.emit('onCombatStart', combatContext(run));
  return run.combat;
}

/* ------------------------------------------------------------------ */
/*  Effets du combat                                                   */
/* ------------------------------------------------------------------ */

/** Sources propres au combat : capacités de l'ennemi et effets temporaires (fioles). */
export function combatSources(run) {
  const cb = run.combat;
  if (!cb) return [];
  const { abilityById } = getContent();
  const enemy = cb.enemy.abilities.map((id) => ({ kind: 'enemy', id, effects: abilityById[id].effects, state: {} }));
  const buffs = cb.buffs.map((b) => ({ kind: 'buff', id: b.id, effects: b.effects, state: b.state ?? (b.state = {}), buff: b }));
  return [...enemy, ...buffs];
}

export const combatHooks = (run) => hooksFor(run, () => combatSources(run));
export const combatContext = (run, more = {}) => contextFor(run, { combat: run.combat, ...more });

/** Paramètres de toutes les occurrences actives d'un effet (reliques, personnage, combat). */
export function effectParams(run, effectId) {
  const out = [];
  for (const s of [...runSources(run), ...combatSources(run)]) {
    for (const e of s.effects ?? []) if (e.id === effectId) out.push(e.params ?? {});
  }
  return out;
}

/** Paramètres d'un effet actif (ex. delayAnswers), ou null. */
export function activeEffect(run, effectId) {
  return effectParams(run, effectId)[0] ?? null;
}

/** Ce que l'ennemi annonce avant la question : dégâts en cas d'erreur et effets. */
export function intent(run) {
  const { abilityById } = getContent();
  const cb = run.combat;
  return {
    damage: cb.enemy.damage + cb.enemy.rage,
    effects: cb.enemy.abilities.map((id) => ({ id, name: abilityById[id].name, text: abilityById[id].intent })),
  };
}

/** Niveau de difficulté de la prochaine question. */
export function questionDifficulty(run) {
  const forced = activeEffect(run, 'forceDifficulty');
  if (forced) return forced.difficulty;
  const c = getContent();
  const table = c.balance.difficulty[run.combat.kind === 'soldier' ? 'combat' : run.combat.kind];
  return rngOf(run, 'questions').weighted(table[run.act - 1]);
}

/* ------------------------------------------------------------------ */
/*  Déroulement                                                        */
/* ------------------------------------------------------------------ */

/** Thème de la prochaine question (Parchemin du savant : thème choisi, une seule fois). */
export function nextQuestionTheme(run) {
  const cb = run.combat;
  const theme = cb.nextTheme ?? cb.theme;
  cb.nextTheme = null;
  return theme;
}

/**
 * Début d'une question : déclenche onQuestionStart et renvoie chrono et délai d'affichage.
 * `swap` : question de remplacement (Parchemin d'échange), qui ne compte pas comme une nouvelle question.
 */
export function startQuestion(run, question, { swap = false } = {}) {
  const cb = run.combat;
  cb.removedAnswers = [];
  const hooks = combatHooks(run);
  const ctx = combatContext(run, { question });
  if (!swap) {
    cb.questionCount++;
    hooks.emit('onQuestionStart', ctx);
  }
  const base = getContent().balance.timer.baseSeconds;
  return {
    timerSeconds: Math.max(3, hooks.modify('modifyTimer', base, ctx)),
    answerDelay: activeEffect(run, 'delayAnswers')?.seconds ?? 0,
  };
}

/** Dégâts infligés par une bonne réponse sur ce thème (avant application). */
export function damageFor(run, question, answer = {}) {
  const c = getContent();
  const base = c.balance.run.baseDamage + run.bonuses.damage + (run.bonuses.themeDamage[question.theme] ?? 0);
  return Math.max(0, Math.round(combatHooks(run).modify('modifyDamageDealt', base, combatContext(run, { question, answer }))));
}

/**
 * Résout une réponse. `outcome` : 'correct' | 'wrong' | 'timeout'.
 * `choice` : réponse choisie (pour Seconde chance).
 * @returns {{ dealt, taken, enemyDead, heroDead, revived, retry?, removed? }}
 *   retry : Seconde chance, la question est rejouée sans pénalité avec des réponses en moins
 */
export function resolveAnswer(run, question, outcome, elapsedMs, choice = null) {
  const cb = run.combat;
  const chance = activeEffect(run, 'secondChance');
  if (outcome === 'wrong' && chance && !cb.secondChanceUsed) {
    cb.secondChanceUsed = true;
    const removed = new Set([...cb.removedAnswers, choice]);
    const pool = question.reponses.filter((r) => r !== question.bonne_reponse && !removed.has(r));
    const more = rngOf(run, 'combat').shuffle(pool).slice(0, Math.max(0, chance.removeAnswers - 1));
    cb.removedAnswers = [...removed, ...more];
    return { dealt: 0, taken: 0, enemyDead: false, heroDead: false, retry: true, removed: [choice, ...more] };
  }
  const hooks = combatHooks(run);
  const answer = { correct: outcome === 'correct', elapsedMs, theme: question.theme };
  const ctx = combatContext(run, { question, answer });
  const byTheme = (run.stats.byTheme[question.theme] ??= { correct: 0, wrong: 0 });
  let dealt = 0;
  let taken = 0;

  if (outcome === 'correct') {
    dealt = damageFor(run, question, answer);
    cb.enemy.hp = Math.max(0, cb.enemy.hp - dealt);
    cb.correctCount++;
    cb.streak++;
    if (!cb.themesSucceeded.includes(question.theme)) cb.themesSucceeded.push(question.theme);
    run.stats.correct++;
    byTheme.correct++;
    hooks.emit('onCorrect', { ...ctx, dealt });
  } else {
    const raw = intent(run).damage;
    taken = Math.max(0, Math.round(hooks.modify('modifyDamageTaken', raw, ctx)));
    run.hp = Math.max(0, run.hp - taken);
    cb.wrongCount++;
    cb.streak = 0;
    if (outcome === 'timeout') run.stats.timeouts++;
    else run.stats.wrong++;
    byTheme.wrong++;
    hooks.emit(outcome === 'timeout' ? 'onTimeout' : 'onWrong', { ...ctx, taken });
  }

  // Coup mortel : Fée en bouteille ou Queue de lézard peuvent encore sauver le héros
  if (run.hp <= 0) hooks.emit('onLethal', ctx);
  return {
    dealt, taken, enemyDead: cb.enemy.hp <= 0, heroDead: run.hp <= 0, revived: ctx.revived ?? null, phaseTwo: checkPhaseTwo(run),
  };
}

/**
 * Boss tombé à mi-PV : seconde phase. Il change de thème (celui de sa région, ou un thème
 * au hasard pour l'Usurpateur, dont la région est la Culture générale) et de capacités.
 * @returns {{ theme, abilities } | null}
 */
export function checkPhaseTwo(run) {
  const cb = run.combat;
  const c = getContent();
  const cfg = c.balance.enemies.boss;
  if (cb.kind !== 'boss' || cb.phase === 2 || cb.enemy.hp <= 0) return null;
  if (cb.enemy.hp > (cb.enemy.maxHp * cfg.phaseTwoAtPercent) / 100) return null;
  const rng = rngOf(run, 'combat');
  cb.phase = 2;
  const pool = c.enemies.bossAbilities.filter((a) => !cb.enemy.abilities.includes(a));
  cb.enemy.abilities = rng.shuffle(pool).slice(0, cfg.phaseTwoAbilities);
  cb.enemy.rage = 0;
  const own = c.regionById[cb.regionId].category;
  cb.theme = c.mapThemes.includes(own) ? own : rng.pick(c.mapThemes);
  return { theme: cb.theme, abilities: cb.enemy.abilities };
}

/* ------------------------------------------------------------------ */
/*  Fin du combat et récompenses                                       */
/* ------------------------------------------------------------------ */

/**
 * Termine le combat. En cas de victoire, calcule les récompenses (l'or est crédité,
 * fioles et reliques attendent dans run.pendingRewards que le joueur les prenne).
 */
export function finishCombat(run, won) {
  const cb = run.combat;
  const c = getContent();
  cb.over = won ? 'won' : 'lost';
  const hooks = combatHooks(run);
  if (!won) return null;

  hooks.emit('onCombatEnd', combatContext(run));
  run.stats.combatsWon++;
  if (cb.kind === 'elite') run.stats.elitesWon++;
  if (cb.kind === 'boss') run.stats.bossesWon++;

  const rng = rngOf(run, 'rewards');
  const table = c.balance.rewards[cb.kind === 'soldier' ? 'combat' : cb.kind];
  const goldRoll = Array.isArray(table.gold) ? rng.int(table.gold[0], table.gold[1]) : table.gold;
  const rewards = { gold: gainGold(run, goldRoll, hooks), consumable: null, relics: [], bossRelics: [] };

  if (cb.kind !== 'boss') rewards.consumable = rollConsumableDrop(run);
  if (cb.kind === 'elite') {
    const count = (table.relics ?? 1) + effectParams(run, 'eliteExtraRelics').reduce((n, p) => n + p.count, 0);
    for (let i = 0; i < count; i++) {
      const id = randomRelic(run, { exclude: rewards.relics });
      if (id) rewards.relics.push(id);
    }
  }
  if (cb.kind === 'boss') {
    const owned = new Set(run.relics.map((r) => r.id));
    rewards.bossRelics = rng.shuffle(c.bossRelics.filter((r) => !owned.has(r.id))).slice(0, table.bossRelicChoices).map((r) => r.id);
  }
  run.pendingRewards = rewards;
  return rewards;
}

/** Chance de fiole : baisse quand une fiole tombe, monte sinon (balance.rewards.consumableDrop). */
function rollConsumableDrop(run) {
  const cfg = getContent().balance.rewards.consumableDrop;
  if (noDrops(run)) return null;
  const rng = rngOf(run, 'rewards');
  const drop = rng.chance(run.consumableDropChance / 100);
  run.consumableDropChance = Math.max(cfg.min, Math.min(cfg.max, run.consumableDropChance + (drop ? -cfg.step : cfg.step)));
  return drop ? randomConsumable(run) : null;
}

const noDrops = (run) => Boolean(activeEffect(run, 'noConsumableDrops'));
