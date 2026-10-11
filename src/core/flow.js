/**
 * flow.js — Déroulement d'une partie : actes, déplacement sur la carte, fin de case,
 * fin de partie. Chaque fonction met à jour run.resume (la scène à rouvrir) ; la scène
 * appelante sauvegarde ensuite la partie et ouvre cette scène.
 */
import { getContent } from './content.js';
import { createRun, hooksFor, contextFor, heal, runSources } from './run.js';
import { generateActMap, nodeById, reachableNodes } from './mapgen.js';
import { createCombat } from './combat.js';
import { enterShop, enterRest, openTreasure } from './places.js';
import { startEvent } from './events.js';
import { rngOf } from './rng.js';

const FIGHTS = ['combat', 'elite', 'boss'];

/** Nouvelle partie, carte de l'acte 1 comprise. */
export function newRun(opts) {
  const run = createRun(opts);
  startAct(run, 1);
  return run;
}

/** Génère la carte d'un acte et place le héros au pied de celle-ci. */
export function startAct(run, act) {
  run.act = act;
  run.floor = 0;
  run.position = null;
  run.combat = null;
  run.pendingRewards = null;
  run.map = generateActMap(run, act);
  (run.bossesByAct ??= {})[act] = run.map.boss.region;
  run.resume = { scene: 'map', data: { actIntro: true } };
}

export const currentNode = (run) => (run.position ? nodeById(run.map, run.position) : null);

/** Type effectif d'une case (une case Inconnue révèle son contenu en y entrant). */
export const nodeKind = (node) => node.revealed ?? node.type;

/* ------------------------------------------------------------------ */
/*  Bottes ailées : aller sur n'importe quelle case de l'étage suivant  */
/* ------------------------------------------------------------------ */

function freeTravelSources(run) {
  return runSources(run).flatMap((s) => (s.effects ?? []).filter((e) => e.id === 'freeTravel').map((e) => ({ s, p: e.params })));
}

/** Charges restantes des Bottes ailées. */
export function freeTravelLeft(run) {
  return freeTravelSources(run).reduce((n, { s, p }) => n + Math.max(0, p.charges - (s.state.used ?? 0)), 0);
}

/** Cases de l'étage suivant hors des chemins (accessibles avec les Bottes ailées). */
export function freeTravelNodes(run) {
  if (!run.position || freeTravelLeft(run) <= 0) return [];
  const here = nodeById(run.map, run.position);
  const linked = new Set(here.next);
  const next = here.floor < run.map.floors.length ? run.map.floors[here.floor] : [];
  return next.filter((n) => !linked.has(n.id));
}

/**
 * Avance sur une case accessible et prépare ce qui s'y trouve.
 * @returns {{ scene, data }} scène à ouvrir
 */
export function enterNode(run, nodeId) {
  const c = getContent();
  if (!reachableNodes(run.map, run.position).some((n) => n.id === nodeId)) {
    if (!freeTravelNodes(run).some((n) => n.id === nodeId)) throw new Error(`Case inaccessible : ${nodeId}`);
    const { s } = freeTravelSources(run).find(({ s: src, p }) => (src.state.used ?? 0) < p.charges);
    s.state.used = (s.state.used ?? 0) + 1;
  }
  const node = nodeById(run.map, nodeId);
  run.position = node.id;
  run.floor = node.floor;
  node.visited = true;

  if (node.type === 'unknown') {
    const rng = rngOf(run, 'events');
    node.revealed = rng.weighted(c.balance.unknown);
    if (node.revealed === 'combat') node.theme = rng.pick(c.mapThemes);
  }
  const kind = nodeKind(node);
  hooksFor(run).emit('onFloorEnter', contextFor(run, { node }));

  if (FIGHTS.includes(kind)) {
    createCombat(run, { ...node, type: kind });
    run.resume = { scene: 'combat', data: {} };
  } else if (kind === 'shop') {
    enterShop(run, node);
    run.resume = { scene: 'shop', data: {} };
  } else if (kind === 'rest') {
    enterRest(run, node);
    run.resume = { scene: 'rest', data: {} };
  } else if (kind === 'treasure') {
    openTreasure(run);
    run.resume = { scene: 'reward', data: {} };
  } else {
    startEvent(run, node);
    run.resume = { scene: 'event', data: {} };
  }
  return run.resume;
}

/**
 * Case terminée (combat gagné et récompenses prises, ou case non combattante quittée).
 * Après le boss : soin de la moitié des PV manquants, puis acte suivant ou victoire.
 */
export function completeNode(run) {
  const c = getContent();
  const node = currentNode(run);
  run.combat = null;
  run.pendingRewards = null;
  run.shop = null;
  run.event = null;
  run.stats.floorsCleared++;
  if (node?.type !== 'boss') {
    run.resume = { scene: 'map', data: {} };
    return run.resume;
  }
  heal(run, ((run.maxHp - run.hp) * c.balance.run.bossHealMissingPercent) / 100);
  if (run.act >= c.balance.acts) return endRun(run, 'victory');
  startAct(run, run.act + 1);
  return run.resume;
}

/** Fin de partie : victoire sur l'Usurpateur, ou mort du héros. */
export function endRun(run, outcome, cause = null) {
  run.over = outcome;
  if (cause) run.stats.deathCause = cause;
  run.endedAt = new Date().toISOString();
  run.resume = { scene: 'summary', data: {} };
  return run.resume;
}
