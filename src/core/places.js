/**
 * places.js — Cases sans combat : feu de camp, marchand, trésor.
 * Les chiffres viennent de balance.json (rest, shop) ; l'aléatoire du flux « shop » ou « rewards ».
 */
import { getContent } from './content.js';
import {
  hooksFor, contextFor, heal, spendGold, addConsumable, freeConsumableSlots,
  randomConsumable, randomRelic, sellValue, removeRelic,
} from './run.js';
import { activeEffect } from './combat.js';

/* ------------------------------------------------------------------ */
/*  Feu de camp                                                        */
/* ------------------------------------------------------------------ */

export function enterRest(run, node) {
  hooksFor(run).emit('onRestEnter', contextFor(run, { node }));
}

/** Options du feu de camp : se reposer (sauf Couronne de l'Usurpateur) ou étudier un thème. */
export function restOptions(run) {
  const cfg = getContent().balance.rest;
  return {
    healAmount: Math.round((run.maxHp * cfg.healPercentMax) / 100),
    canRest: !activeEffect(run, 'noRest'),
    studyDamage: cfg.studyDamage,
  };
}

export function rest(run) {
  const { healAmount, canRest } = restOptions(run);
  return canRest ? heal(run, healAmount) : 0;
}

/** Étudier : +N dégâts permanents sur un thème. */
export function study(run, theme) {
  const { studyDamage } = restOptions(run);
  run.bonuses.themeDamage[theme] = (run.bonuses.themeDamage[theme] ?? 0) + studyDamage;
}

/* ------------------------------------------------------------------ */
/*  Marchand                                                           */
/* ------------------------------------------------------------------ */

/** Ouvre la boutique de la case (stock tiré une seule fois et gardé dans la sauvegarde). */
export function enterShop(run, node) {
  if (run.shop?.nodeId === node.id) return run.shop;
  const c = getContent();
  const cfg = c.balance.shop;
  const consumables = [];
  for (let i = 0; i < cfg.consumables; i++) {
    const id = randomConsumable(run, 'shop');
    consumables.push({ id, price: cfg.consumablePrices[c.consumableById[id].rarity], sold: false });
  }
  const relics = [];
  for (let i = 0; i < cfg.relics; i++) {
    const id = randomRelic(run, { stream: 'shop', exclude: relics.map((r) => r.id) });
    if (id) relics.push({ id, price: cfg.relicPrices[c.relicById[id].rarity], sold: false });
  }
  run.shop = { nodeId: node.id, consumables, relics, healBought: false };
  hooksFor(run).emit('onShopEnter', contextFor(run, { node }));
  return run.shop;
}

export function buyConsumable(run, index) {
  const item = run.shop.consumables[index];
  if (item.sold || freeConsumableSlots(run) === 0 || !spendGold(run, item.price)) return false;
  addConsumable(run, item.id);
  item.sold = true;
  return true;
}

/** Paiement d'une relique (l'ajout lui-même passe par l'écran : emplacement plein, thème…). */
export function payRelic(run, index) {
  const item = run.shop.relics[index];
  if (item.sold || !spendGold(run, item.price)) return false;
  item.sold = true;
  return true;
}

export const shopHeal = () => getContent().balance.shop.heal;

export function buyHeal(run) {
  const { amount, price } = shopHeal();
  if (run.shop.healBought || run.hp >= run.maxHp || !spendGold(run, price)) return false;
  heal(run, amount);
  run.shop.healBought = true;
  return true;
}

/** Revend une relique contre la moitié de son prix (plus le bonus de l'Œuf d'or). */
export function sellRelic(run, instance) {
  const value = sellValue(instance);
  removeRelic(run, instance);
  run.gold += value; // une vente n'est pas un gain d'or modifié par les reliques
  return value;
}

/* ------------------------------------------------------------------ */
/*  Trésor                                                             */
/* ------------------------------------------------------------------ */

/** Un coffre : une relique, à prendre ou à laisser (écran de butin). */
export function openTreasure(run) {
  run.pendingRewards = { source: 'treasure', gold: 0, consumable: null, relics: [randomRelic(run)].filter(Boolean), bossRelics: [] };
  return run.pendingRewards;
}
