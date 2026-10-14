/**
 * overlays.js — Fenêtres superposées communes : choix d'un thème, menu d'une fiole,
 * obtention d'une relique (thème à choisir, emplacements pleins → revendre ou renoncer).
 */
import { text, panel, button, menuNav, C } from './ui.js';
import { icon, itemIcon } from './icons.js';
import { itemInfo } from './topbar.js';
import { getContent, itemDef } from './core/content.js';
import { addRelic, freeRelicSlots, sellValue } from './core/run.js';
import { sellRelic } from './core/places.js';
import { canUseConsumable } from './core/items.js';

const W = 480;
const H = 270;

/**
 * Fenêtre modale : fond assombri qui bloque les clics, panneau centré.
 * Le clavier de la scène est suspendu tant qu'elle est ouverte (ses boutons ont le leur).
 */
export function modal(scene, w, h, { title = null } = {}) {
  const layer = scene.add.container(0, 0).setDepth(1100);
  layer.add(scene.add.rectangle(0, 0, W, H, 0x0e071b, 0.7).setOrigin(0).setInteractive());
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);
  layer.add(panel(scene, x, y, w, h));
  if (title) layer.add(text(scene, W / 2, y + 8, title, { size: 8, color: C.gold, align: 'center', width: w - 20 }).setOrigin(0.5, 0));
  const keyboard = scene.input.keyboard;
  const saved = keyboard.listeners('keydown');
  keyboard.removeAllListeners('keydown');
  const close = () => {
    keyboard.removeAllListeners('keydown');
    saved.forEach((fn) => keyboard.on('keydown', fn));
    layer.destroy();
  };
  const addButton = (bx, by, bw, bh, label, fn, opts) => {
    const b = button(scene, bx, by, bw, bh, label, fn, opts);
    layer.add(b);
    return b;
  };
  return { layer, x, y, w, h, close, addButton };
}

/** Choix d'un thème parmi les 8 de la carte. */
export function themePicker(scene, title, onPick, { onCancel = null, extra = null } = {}) {
  const c = getContent();
  const themes = c.mapThemes;
  const m = modal(scene, 300, 64 + Math.ceil(themes.length / 2) * 24 + (onCancel ? 24 : 0), { title });
  const buttons = themes.map((t, i) => m.addButton(m.x + 12 + (i % 2) * 140, m.y + 26 + Math.floor(i / 2) * 24, 136, 20,
    `${c.regionByCategory[t].theme}${extra?.(t) ?? ''}`, () => { m.close(); onPick(t); }));
  if (onCancel) {
    buttons.push(m.addButton(W / 2 - 50, m.y + m.h - 30, 100, 18, 'Annuler', () => { m.close(); onCancel(); }));
  }
  menuNav(scene, buttons, { start: 0 });
  return m;
}

/**
 * Menu d'une fiole (clic sur son emplacement) : Utiliser / Jeter / Fermer.
 * @param {{ where: {inCombat, hasQuestion}, onUse: (slot)=>void, onDiscard: (slot)=>void }} opts
 */
export function consumableMenu(scene, run, slot, { where, onUse, onDiscard, onClose = null }) {
  const id = run.consumables[slot];
  const info = itemInfo(id);
  const can = canUseConsumable(run, slot, where);
  const m = modal(scene, 240, 116, { title: info.name });
  m.layer.add(itemIcon(scene, m.x + 22, m.y + 44, id, 32));
  m.layer.add(text(scene, m.x + 40, m.y + 24, info.kind, { size: 8, color: C.muted, width: m.w - 52 }));
  m.layer.add(text(scene, m.x + 40, m.y + 36, info.description, { size: 8, color: C.ink, width: m.w - 52 }));
  if (!can.ok) m.layer.add(text(scene, W / 2, m.y + 72, can.reason, { size: 8, color: C.badText }).setOrigin(0.5, 0));
  const done = () => { m.close(); onClose?.(); };
  const use = m.addButton(m.x + 12, m.y + m.h - 30, 70, 18, 'Utiliser', () => { m.close(); onUse(slot); });
  const discard = m.addButton(m.x + 85, m.y + m.h - 30, 70, 18, 'Jeter', () => { m.close(); onDiscard(slot); });
  const close = m.addButton(m.x + 158, m.y + m.h - 30, 70, 18, 'Fermer', done);
  if (!can.ok) {
    use.setEnabled(false);
    use.setState('dim');
  }
  menuNav(scene, [use, discard, close], { start: can.ok ? 0 : 2 });
  scene.input.keyboard.on('keydown', (e) => { if (e.key === 'Escape') done(); });
  return m;
}

/**
 * Obtention d'une relique par le joueur : thème à choisir (Spécialiste), puis, si les
 * emplacements sont pleins, revendre une relique ou renoncer à la nouvelle.
 * @param {(taken: boolean) => void} done
 */
export function acquireRelic(scene, run, id, done) {
  const def = itemDef(id);
  const place = (theme) => {
    if (freeRelicSlots(run) > 0) {
      addRelic(run, id, { theme });
      done(true);
      return;
    }
    relicSwap(scene, run, id, (sold) => {
      done(sold && addRelic(run, id, { theme }));
    });
  };
  if (def.chooseTheme) {
    themePicker(scene, `${def.name} : choisissez le thème`, place, { onCancel: () => done(false) });
  } else place(null);
}

/** Emplacements pleins : choisir une relique à revendre (moitié de son prix) ou renoncer. */
export function relicSwap(scene, run, newId, done) {
  const rows = run.relics.length;
  const m = modal(scene, 320, 58 + rows * 22 + 26, { title: `Emplacements pleins : revendre une relique pour prendre « ${itemDef(newId).name} » ?` });
  const buttons = [];
  run.relics.forEach((r, i) => {
    const y = m.y + 34 + i * 22;
    m.layer.add(itemIcon(scene, m.x + 20, y + 9, r.id, 16));
    m.layer.add(text(scene, m.x + 30, y + 4, itemDef(r.id).name, { size: 8, color: C.ink }));
    buttons.push(m.addButton(m.x + m.w - 112, y, 100, 18, `Vendre +${sellValue(r)} or`, () => {
      sellRelic(run, r);
      m.close();
      done(true);
    }));
  });
  buttons.push(m.addButton(W / 2 - 50, m.y + m.h - 28, 100, 18, 'Renoncer', () => { m.close(); done(false); }));
  menuNav(scene, buttons, { start: buttons.length - 1 });
  return m;
}
