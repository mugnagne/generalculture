/**
 * events.js — Événements des cases « ? » (src/data/events.json).
 *
 * Un événement propose 2 ou 3 choix ; chaque choix est une liste d'effets. Les effets
 * immédiats (soin, or, PV max…) s'appliquent tout de suite ; les autres renvoient des actions
 * que l'écran traite une à une (question, relique à prendre ou à choisir, fiole à donner).
 * L'état (événement tiré, actions en attente, question en cours) est gardé dans run.event :
 * recharger la page reprend l'événement là où il en était.
 */
import { getContent } from './content.js';
import { hooksFor, contextFor, addConsumable, randomConsumable, removeConsumable } from './run.js';
import { EFFECTS } from './effects.js';
import { endRun } from './flow.js';
import { rngOf } from './rng.js';

/** Tire un événement pas encore vu dans la partie (tous vus : on recommence). */
export function startEvent(run, node) {
  const c = getContent();
  const seen = new Set(run.seenEvents ?? []);
  let pool = c.events.filter((e) => !seen.has(e.id));
  if (!pool.length) pool = c.events;
  const ev = rngOf(run, 'events').pick(pool);
  (run.seenEvents ??= []).push(ev.id);
  run.event = { id: ev.id, nodeId: node.id, choice: null, pending: [], quiz: null };
  return run.event;
}

export const eventDef = (run) => getContent().eventById[run.event.id];

/** Un choix est-il possible ? (conditions « requires » des données) */
export function choiceAvailable(run, choice) {
  const r = choice.requires ?? {};
  if (r.gold !== undefined && run.gold < r.gold) return { ok: false, reason: `Il faut ${r.gold} or.` };
  if (r.hp !== undefined && run.hp < r.hp) return { ok: false, reason: `Il faut ${r.hp} PV.` };
  if (r.maxHp !== undefined && run.maxHp < r.maxHp) return { ok: false, reason: `Il faut ${r.maxHp} PV max.` };
  if (r.consumables !== undefined && run.consumables.filter(Boolean).length < r.consumables) {
    return { ok: false, reason: `Il faut ${r.consumables} fiole${r.consumables > 1 ? 's' : ''}.` };
  }
  return { ok: true };
}

/** Applique une liste d'effets d'événement ; renvoie les actions pour l'écran. */
function applyEffects(run, effects) {
  const actions = [];
  const ctx = { ...contextFor(run), actions, source: { kind: 'event', id: run.event.id, effects, state: {} } };
  for (const e of effects ?? []) EFFECTS[e.id]?.apply?.(ctx, e.params ?? {}, ctx.source);
  return actions;
}

/** Mort pendant un événement (sauf résurrection). Renvoie true si la partie est finie. */
function checkDeath(run) {
  if (run.hp > 0) return false;
  hooksFor(run).emit('onLethal', contextFor(run));
  if (run.hp > 0) return false;
  endRun(run, 'defeat', { event: eventDef(run).title, act: run.act, floor: run.floor });
  return true;
}

/** Le joueur choisit l'option `index`. */
export function chooseOption(run, index) {
  const choice = eventDef(run).choices[index];
  if (!choiceAvailable(run, choice).ok) return false;
  run.event.choice = index;
  run.event.pending = applyEffects(run, choice.effects);
  checkDeath(run);
  return true;
}

/** Prochaine action à traiter par l'écran (ou null). */
export const nextAction = (run) => run.event.pending[0] ?? null;

/** Action traitée : on passe à la suivante. */
export function doneAction(run) {
  run.event.pending.shift();
}

/** Thème et difficulté d'une question d'événement : thème au hasard, difficulté de l'acte par défaut. */
export function quizSettings(run, action) {
  const c = getContent();
  const rng = rngOf(run, 'events');
  return {
    theme: rng.pick(c.mapThemes),
    difficulty: action.difficulty ?? rng.weighted(c.balance.difficulty.combat[run.act - 1]),
  };
}

/** Réponse à la question d'un événement (Sphinx, Tripot). */
export function resolveEventQuiz(run, action, question, correct) {
  const byTheme = (run.stats.byTheme[question.theme] ??= { correct: 0, wrong: 0 });
  if (correct) {
    run.stats.correct++;
    byTheme.correct++;
  } else {
    run.stats.wrong++;
    byTheme.wrong++;
  }
  doneAction(run);
  run.event.quiz = null;
  if (action.stake) {
    // Pari : la mise est rendue doublée, ou perdue
    run.gold = Math.max(0, run.gold + (correct ? action.stake : -action.stake));
  } else {
    run.event.pending.unshift(...applyEffects(run, correct ? action.onCorrect : action.onWrong));
  }
  return checkDeath(run);
}

/** Alchimiste : donne la fiole de l'emplacement `slot`, en reçoit `receive` au hasard (selon la place). */
export function tradeConsumable(run, action, slot) {
  removeConsumable(run, slot);
  const got = [];
  for (let i = 0; i < action.receive; i++) {
    const id = randomConsumable(run, 'events');
    if (addConsumable(run, id)) got.push(id);
  }
  doneAction(run);
  return got;
}
