/**
 * items.js — Utilisation des consommables (fioles et parchemins).
 *
 * Une fiole s'utilise une seule fois : elle quitte son emplacement, puis chacun de ses effets
 * est appliqué (`apply` dans effects.js). Les effets qui touchent l'écran (retirer des réponses,
 * ajouter du temps, changer de question…) renvoient des « actions » que la scène exécute.
 */
import { getContent } from './content.js';
import { EFFECTS } from './effects.js';
import { contextFor, removeConsumable } from './run.js';
import { combatContext } from './combat.js';

const NEED_RANK = { any: 0, combat: 1, question: 2 };

/** Ce qu'exige une fiole : 'any', 'combat' ou 'question'. */
export function consumableNeeds(id) {
  const def = getContent().consumableById[id];
  return (def.effects ?? []).reduce((need, e) => {
    const n = EFFECTS[e.id]?.needs ?? 'any';
    return NEED_RANK[n] > NEED_RANK[need] ? n : need;
  }, 'any');
}

/**
 * Peut-on utiliser la fiole de cet emplacement maintenant ?
 * @param {{ inCombat: boolean, hasQuestion: boolean }} where
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canUseConsumable(run, slot, { inCombat = false, hasQuestion = false } = {}) {
  const id = run.consumables[slot];
  if (!id) return { ok: false, reason: 'Emplacement vide.' };
  const def = getContent().consumableById[id];
  if (def.passive) return { ok: false, reason: 'Se déclenche toute seule.' };
  if (!inCombat) return def.outOfCombat ? { ok: true } : { ok: false, reason: 'Seulement en combat.' };
  const need = consumableNeeds(id);
  if (need === 'question' && !hasQuestion) return { ok: false, reason: 'Pendant une question seulement.' };
  const ctx = combatContext(run);
  for (const e of def.effects) {
    const usable = EFFECTS[e.id]?.usable;
    if (usable && !usable(ctx, e.params ?? {})) return { ok: false, reason: 'Impossible contre cet ennemi.' };
  }
  return { ok: true };
}

/**
 * Utilise la fiole d'un emplacement.
 * @param {{ question?: object }} opts  question affichée (en combat)
 * @returns {Array<object>} actions pour l'écran
 */
export function useConsumable(run, slot, { question = null } = {}) {
  const id = run.consumables[slot];
  const def = getContent().consumableById[id];
  removeConsumable(run, slot);
  const actions = [];
  const base = run.combat && !run.combat.over ? combatContext(run, { question }) : contextFor(run);
  const ctx = { ...base, actions, source: { kind: 'used', id, effects: def.effects, state: {} } };
  for (const e of def.effects) EFFECTS[e.id]?.apply?.(ctx, e.params ?? {}, ctx.source);
  return actions;
}
