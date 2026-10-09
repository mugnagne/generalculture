/**
 * save.js — Progression sauvegardée dans localStorage.
 *
 * { version, regions: { <id>: { won: 0..3, conquered: bool } } }
 * `won` = nombre de batailles gagnées d'affilée dans la région en cours de conquête.
 * Toutes les lectures/écritures sont protégées (navigation privée, stockage plein…).
 */
import { REGIONS } from './data/world.js';

const KEY = 'valdorn:save:v1';
const empty = () => ({ version: 1, regions: {} });

let cache = null;

export function loadSave() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* la partie continue, sans sauvegarde */ }
}

export function regionState(id) {
  return loadSave().regions[id] ?? { won: 0, conquered: false };
}

/** Une bataille gagnée (palier 1, 2 ou 3). */
export function recordVictory(id, tierId) {
  const s = regionState(id);
  loadSave().regions[id] = { won: Math.max(s.won, tierId), conquered: s.conquered || tierId >= 3 };
  persist();
}

/** Défaite : la conquête de la région reprend à la première bataille. */
export function recordDefeat(id) {
  const s = regionState(id);
  loadSave().regions[id] = { won: 0, conquered: s.conquered };
  persist();
}

export const isConquered = (id) => regionState(id).conquered;

export const conqueredCount = () => REGIONS.filter((r) => isConquered(r.id)).length;

/** La capitale se débloque quand les 8 autres régions sont conquises. */
export const capitalUnlocked = () => REGIONS.filter((r) => !r.capital).every((r) => isConquered(r.id));

export const hasProgress = () => Object.keys(loadSave().regions).length > 0;

export function resetSave() {
  cache = empty();
  try {
    localStorage.removeItem(KEY);
  } catch { /* rien à effacer */ }
}

/** Palier à jouer en entrant dans une région depuis la carte. */
export function nextTier(id) {
  const s = regionState(id);
  return s.conquered ? 1 : Math.min(3, s.won + 1);
}
