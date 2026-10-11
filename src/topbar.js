/**
 * topbar.js — Barre permanente du haut (18 px) : PV, or, 3 emplacements de consommables,
 * emplacements de reliques, acte et étage. Survol d'un objet : sa description.
 */
import { text, panel, C } from './ui.js';
import { icon } from './icons.js';
import { getContent, itemDef } from './core/content.js';

const W = 480;
export const TOPBAR_H = 18;
const SLOT = 16;

/** Teinte des fioles selon la rareté, des reliques de boss. */
export const RARITY_TINT = { common: '#5AC54F', uncommon: '#0098DC', rare: '#FFC825', boss: '#A93B89' };

/** Teinte de l'icône d'un objet (relique : couleur de sa famille). */
export function itemTint(id) {
  const c = getContent();
  if (c.bossRelicById[id]) return RARITY_TINT.boss;
  if (c.relicById[id]) return c.families[c.relicById[id].family]?.color ?? RARITY_TINT.common;
  return RARITY_TINT[c.consumableById[id]?.rarity] ?? RARITY_TINT.common;
}

/** Texte de l'infobulle d'un objet. */
export function itemInfo(id) {
  const c = getContent();
  const def = itemDef(id);
  const rarity = { common: 'commune', uncommon: 'peu commune', rare: 'rare' };
  let kind;
  if (c.bossRelicById[id]) kind = 'Relique de boss';
  else if (c.relicById[id]) kind = `Relique ${rarity[def.rarity]} · ${c.families[def.family]?.name ?? ''}`;
  else kind = `Fiole ${rarity[def.rarity]}${def.outOfCombat ? ' · aussi hors combat' : ''}`;
  return { name: def.name, kind, description: def.description, drawback: def.drawback ?? null };
}

/** Infobulle réutilisable (une par scène). */
export function tooltip(scene) {
  let box = null;
  const hide = () => {
    box?.destroy();
    box = null;
  };
  const show = (x, y, { name, kind, description, drawback }) => {
    hide();
    const w = 190;
    box = scene.add.container(0, 0).setDepth(1000);
    const parts = [
      text(scene, 8, 7, name, { size: 8, color: C.gold }),
      kind ? text(scene, 8, 0, kind, { size: 8, color: C.muted, width: w - 16 }) : null,
      text(scene, 8, 0, description, { size: 8, color: C.ink, width: w - 16 }),
      drawback ? text(scene, 8, 0, `Contrepartie : ${drawback}`, { size: 8, color: C.badText, width: w - 16 }) : null,
    ].filter(Boolean);
    let cy = 6;
    for (const p of parts) {
      p.y = cy;
      cy += p.height + 2;
    }
    const h = cy + 5;
    box.add(panel(scene, 0, 0, w, h, { border: 'plain', tint: 0x657392 }));
    box.add(parts);
    box.setPosition(Math.max(2, Math.min(W - w - 2, Math.round(x - w / 2))), Math.round(y));
  };
  return { show, hide };
}

/**
 * Dessine la barre du haut.
 * @param {{ onConsumable?: (slot) => void }} opts  clic sur une fiole (utilisation, jalon 3)
 * @returns {{ refresh: () => void, container }}
 */
export function drawTopBar(scene, run, { onConsumable = null } = {}) {
  const tip = tooltip(scene);
  const bar = scene.add.container(0, 0).setDepth(900);
  // Fond interactif : bloque les clics vers ce qui défile dessous (carte)
  bar.add(scene.add.rectangle(0, 0, W, TOPBAR_H, C.shadow, 0.94).setOrigin(0).setInteractive());
  bar.add(scene.add.rectangle(0, TOPBAR_H - 1, W, 1, C.goldHex, 0.6).setOrigin(0));

  bar.add(icon(scene, 9, 9, 'heart'));
  const hpText = text(scene, 16, 4, '', { size: 8 });
  bar.add(icon(scene, 62, 9, 'coin'));
  const goldText = text(scene, 69, 4, '', { size: 8, color: C.gold });
  const place = text(scene, W - 6, 4, '', { size: 8, color: C.muted }).setOrigin(1, 0);
  bar.add([hpText, goldText, place]);

  const dynamic = scene.add.container(0, 0);
  bar.add(dynamic);

  const slot = (x, id, onClick) => {
    const box = scene.add.rectangle(x, 1, SLOT, SLOT, id ? C.panelAlt : C.panel, 1).setOrigin(0)
      .setStrokeStyle(1, id ? 0x657392 : 0x2a2f4e);
    dynamic.add(box);
    if (!id) return;
    dynamic.add(icon(scene, x + SLOT / 2, 1 + SLOT / 2, getContent().consumableById[id] ? 'vial' : 'relic', { tint: itemTint(id) }));
    const zone = scene.add.zone(x, 1, SLOT, SLOT).setOrigin(0).setInteractive({ useHandCursor: Boolean(onClick) });
    zone.on('pointerover', () => {
      box.setStrokeStyle(1, C.goldHex);
      tip.show(x + SLOT / 2, TOPBAR_H + 2, itemInfo(id));
    });
    zone.on('pointerout', () => {
      box.setStrokeStyle(1, 0x657392);
      tip.hide();
    });
    if (onClick) zone.on('pointerup', onClick);
    dynamic.add(zone);
  };

  const refresh = () => {
    tip.hide();
    dynamic.removeAll(true);
    hpText.setText(`${run.hp}/${run.maxHp}`);
    hpText.setColor(run.hp <= run.maxHp * 0.3 ? C.badText : C.ink);
    goldText.setText(String(run.gold));
    let x = 104;
    run.consumables.forEach((id, i) => {
      slot(x, id, id && onConsumable ? () => onConsumable(i) : null);
      x += SLOT + 2;
    });
    x += 8;
    for (let i = 0; i < run.relicSlots; i++) {
      slot(x, run.relics[i]?.id ?? null, null);
      x += SLOT + 2;
    }
    const floors = getContent().balance.map.floors;
    const where = run.floor === 0 ? 'Départ' : run.floor > floors ? 'Boss' : `Étage ${run.floor}/${floors}`;
    place.setText(`Acte ${run.act} · ${where}`);
  };
  refresh();
  return { refresh, container: bar, tip };
}
