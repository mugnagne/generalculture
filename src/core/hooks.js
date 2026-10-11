/**
 * hooks.js — Système d'effets commun aux reliques, consommables, capacités d'ennemis
 * et personnages.
 *
 * Une « source » porte une liste d'effets décrits dans les JSON de src/data/ :
 *   { kind: 'relic' | 'consumable' | 'enemy' | 'character' | 'buff', id, effects: [{ id, params }], state }
 * Chaque identifiant d'effet est implémenté une seule fois dans effects.js, sous forme de
 * gestionnaires nommés d'après les hooks :
 *   - hooks d'événement : le gestionnaire agit (soigne, compte, modifie l'état…) ;
 *   - modificateurs : le gestionnaire reçoit une valeur et renvoie la valeur modifiée.
 */

export const EVENT_HOOKS = [
  'onRunStart', 'onCombatStart', 'onQuestionStart', 'onCorrect', 'onWrong', 'onTimeout',
  'onCombatEnd', 'onFloorEnter', 'onShopEnter', 'onRestEnter',
  // Hooks complémentaires : acquisition d'un objet, coup mortel, dépense d'or
  'onAcquire', 'onLethal', 'onSpend',
];

export const MODIFIERS = [
  'modifyDamageDealt', 'modifyDamageTaken', 'modifyTimer', 'modifyGold', 'modifyAnswerCount',
];

/**
 * Ordre d'application des modificateurs : d'abord les ajouts, puis les multiplications,
 * puis les valeurs imposées (ex. « chrono 12 s », « achève l'ennemi »).
 */
export const ORDER = { base: -10, add: 0, mul: 10, set: 20 };

export class Hooks {
  /**
   * @param {Record<string, object>} registry  identifiant d'effet → gestionnaires
   * @param {() => Array} getSources           sources actives (lues à chaque appel)
   */
  constructor(registry, getSources) {
    this.registry = registry;
    this.getSources = getSources;
  }

  *entries(hook) {
    for (const source of this.getSources()) {
      for (const effect of source.effects ?? []) {
        const handler = this.registry[effect.id];
        if (handler?.[hook]) yield { source, effect, handler };
      }
    }
  }

  /** Déclenche un hook d'événement. */
  emit(hook, ctx) {
    if (!EVENT_HOOKS.includes(hook)) throw new Error(`Hook inconnu : ${hook}`);
    for (const { source, effect, handler } of [...this.entries(hook)]) {
      handler[hook](ctx, effect.params ?? {}, source);
    }
  }

  /** Déclenche un hook pour une seule source (ex. onAcquire à l'obtention d'une relique). */
  emitSource(source, hook, ctx) {
    for (const effect of source.effects ?? []) {
      this.registry[effect.id]?.[hook]?.(ctx, effect.params ?? {}, source);
    }
  }

  /** Applique un modificateur à une valeur. */
  modify(name, value, ctx) {
    if (!MODIFIERS.includes(name)) throw new Error(`Modificateur inconnu : ${name}`);
    const list = [...this.entries(name)].sort(
      (a, b) => (ORDER[a.handler.order?.[name] ?? 'add'] ?? 0) - (ORDER[b.handler.order?.[name] ?? 'add'] ?? 0),
    );
    return list.reduce((v, { source, effect, handler }) => handler[name](v, ctx, effect.params ?? {}, source), value);
  }
}
