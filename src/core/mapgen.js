/**
 * mapgen.js — Carte d'un acte, à la manière de Slay the Spire.
 *
 * Étages 1..N (balance.map.floors), 3 à 4 cases par étage, chemins qui peuvent se croiser,
 * puis le boss au-dessus. Règles (balance.json) :
 *   - étages imposés (1 : combats, 3 : trésors, 5 : feux de camp) ;
 *   - pas d'élite ni de feu de camp avant l'étage 2 ;
 *   - jamais deux élites, deux feux de camp ou deux marchands de suite sur un chemin ;
 *   - autres cases tirées selon les poids (combats 45 %, inconnues 22 %…) ;
 *   - chaque case Combat / Élite porte un thème ; au moins 3 thèmes différents par étage
 *     quand l'étage compte assez de combats, et les 8 thèmes répartis sur l'acte.
 * Toute l'aléatoire vient du flux « map » de la partie.
 */
import { getContent } from './content.js';
import { rngOf } from './rng.js';

const MAP_W = 480;
const MARGIN_X = 60;

/** Génère la carte de l'acte `act` (1, 2 ou 3) et la renvoie (sans l'attacher à la partie). */
export function generateActMap(run, act) {
  const c = getContent();
  const cfg = c.balance.map;
  const rng = rngOf(run, 'map');
  const floors = [];

  // 1. Cases et positions
  for (let f = 1; f <= cfg.floors; f++) {
    const n = rng.int(cfg.nodesPerFloor[0], cfg.nodesPerFloor[1]);
    const span = MAP_W - 2 * MARGIN_X;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const base = MARGIN_X + (n === 1 ? span / 2 : (span * i) / (n - 1));
      nodes.push({ id: `a${act}f${f}n${i}`, floor: f, index: i, x: Math.round(base + rng.int(-12, 12)), next: [], type: null });
    }
    floors.push(nodes);
  }

  // 2. Chemins entre étages : chaque case relie 1 ou 2 cases proches de l'étage suivant,
  //    parfois une case décalée (les chemins se croisent alors)
  for (let f = 0; f < floors.length - 1; f++) {
    const cur = floors[f];
    const up = floors[f + 1];
    for (const node of cur) {
      const ratio = cur.length === 1 ? 0.5 : node.index / (cur.length - 1);
      const target = Math.round(ratio * (up.length - 1));
      const picks = new Set([target]);
      if (rng.chance(0.55)) picks.add(Math.max(0, Math.min(up.length - 1, target + (rng.chance(0.5) ? 1 : -1))));
      if (rng.chance(0.15)) picks.add(rng.int(0, up.length - 1)); // croisement occasionnel
      node.next = [...picks].map((i) => up[i].id);
    }
    // Toute case de l'étage supérieur doit être atteignable
    for (const target of up) {
      if (cur.some((n) => n.next.includes(target.id))) continue;
      const nearest = [...cur].sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0];
      nearest.next.push(target.id);
    }
  }

  // 3. Types de cases
  const byId = new Map(floors.flat().map((n) => [n.id, n]));
  const parentsOf = (node) => (node.floor === 1 ? [] : floors[node.floor - 2].filter((p) => p.next.includes(node.id)));
  for (const nodes of floors) {
    for (const node of nodes) {
      const fixed = cfg.fixedFloors[String(node.floor)];
      if (fixed) {
        node.type = fixed;
        continue;
      }
      node.type = pickType(rng, cfg, node, parentsOf(node), node.next.map((id) => byId.get(id)), floors);
    }
  }

  // 4. Thèmes des combats et élites
  assignThemes(rng, c, floors, cfg.minThemesPerFloor);

  // 5. Boss : une région (hors capitale) aux actes 1 et 2, l'Usurpateur à l'acte 3
  const bossRegion = pickBossRegion(run, act, rng, c);
  const boss = { id: `a${act}boss`, floor: cfg.floors + 1, index: 0, x: MAP_W / 2, type: 'boss', theme: c.bossTheme, region: bossRegion, next: [] };
  for (const node of floors.at(-1)) node.next = [boss.id];

  return { act, floors, boss };
}

/** Type d'une case libre en respectant les interdits. */
function pickType(rng, cfg, node, parents, children, floors) {
  const forbidden = new Set();
  if (node.floor < cfg.noEliteOrRestBeforeFloor) ['elite', 'rest'].forEach((t) => forbidden.add(t));
  for (const t of cfg.noConsecutive) {
    if (parents.some((p) => p.type === t)) forbidden.add(t);
    // Les étages imposés au-dessus (ex. feux de camp à l'étage 5) comptent aussi
    const fixedAbove = cfg.fixedFloors[String(node.floor + 1)];
    if (fixedAbove === t && node.floor + 1 <= floors.length) forbidden.add(t);
    if (children.some((ch) => ch?.type === t)) forbidden.add(t);
  }
  const weights = Object.fromEntries(Object.entries(cfg.weights).filter(([t]) => !forbidden.has(t)));
  return rng.weighted(weights) ?? 'combat';
}

/** Répartit les thèmes : ordre mélangé des 8 thèmes, distincts sur un même étage. */
function assignThemes(rng, c, floors, minThemes) {
  let deck = [];
  const draw = (avoid) => {
    if (!deck.length) deck = rng.shuffle(c.mapThemes);
    const i = deck.findIndex((t) => !avoid.has(t));
    return deck.splice(i >= 0 ? i : 0, 1)[0];
  };
  for (const nodes of floors) {
    const used = new Set();
    for (const node of nodes) {
      if (node.type !== 'combat' && node.type !== 'elite') continue;
      // Thèmes distincts sur l'étage tant qu'il en reste (au moins `minThemes` si l'étage le permet)
      node.theme = draw(used.size < Math.max(minThemes, nodes.length) ? used : new Set());
      used.add(node.theme);
    }
  }
}

function pickBossRegion(run, act, rng, c) {
  const finalRegion = c.enemies.finalBoss.region;
  if (act === c.balance.acts) return finalRegion;
  const already = new Set(Object.values(run.bossesByAct ?? {}));
  const pool = c.regions.filter((r) => r.id !== finalRegion && !already.has(r.id));
  return rng.pick(pool).id;
}

/* ------------------------------------------------------------------ */
/*  Lecture de la carte                                                */
/* ------------------------------------------------------------------ */

export function allNodes(map) {
  return [...map.floors.flat(), map.boss];
}

export function nodeById(map, id) {
  return allNodes(map).find((n) => n.id === id) ?? null;
}

/** Cases accessibles depuis la position actuelle (étage 1 au départ). */
export function reachableNodes(map, position) {
  if (!position) return map.floors[0];
  const here = nodeById(map, position);
  return (here?.next ?? []).map((id) => nodeById(map, id));
}
