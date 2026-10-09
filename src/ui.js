/**
 * ui.js — Cadres, panneaux, boutons et textes, avec les bordures
 * Kenney « Fantasy UI Borders » (PNG blancs 48x48, teintés à l'exécution).
 *
 * Le 9-slice est fait à la main (9 images) pour fonctionner aussi en Canvas.
 */
import { getR } from './display.js';

const KENNEY = 'assets/ui/kenney-fantasy-ui-borders/PNG/Default/Border/';

/** Bordures utilisées : clé → fichier et largeur de coin à ne pas étirer. */
export const BORDERS = {
  ornate: { file: 'panel-border-010.png', slice: 12 },
  plain: { file: 'panel-border-015.png', slice: 4 },
  corners: { file: 'panel-border-002.png', slice: 12 },
};

/** Couleurs de l'interface, prises dans la palette ENDESGA 64. */
export const C = {
  ink: '#F9E6CF',
  muted: '#92A1B9',
  gold: '#EDAB50',
  goldHex: 0xedab50,
  panel: 0x1a1932,
  panelAlt: 0x2a2f4e,
  hover: 0x424c6e,
  good: 0x5ac54f,
  goodText: '#99E65F',
  bad: 0xea323c,
  badText: '#F5555D',
  timer: 0x0098dc,
  warn: 0xffa214,
  shadow: 0x0e071b,
};

export const FONT = '"Pixelify Sans", monospace';

export function preloadUi(scene) {
  for (const [key, b] of Object.entries(BORDERS)) scene.load.image('ui:' + key, KENNEY + b.file);
}

/**
 * Pixelify Sans dessine les ligatures « fi » / « fl » comme un « A ».
 * Un antiliant (U+200C, invisible) entre les deux lettres empêche la ligature.
 */
export const noLigatures = (s) => String(s).replace(/f(?=[ilf])/g, 'f\u200C');

/** Texte en police pixel (ligatures désactivées, y compris pour setText). */
export function text(scene, x, y, str, { size = 8, color = C.ink, width, align = 'left', bold = false } = {}) {
  const t = scene.add.text(x, y, noLigatures(str), {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? '600' : 'normal',
    color,
    align,
    wordWrap: width ? { width, useAdvancedWrap: true } : undefined,
    lineSpacing: 1,
    resolution: getR(scene.game),
  });
  const setText = t.setText.bind(t);
  t.setText = (value) => setText(noLigatures(value));
  return t;
}

/** Cadre 9-slice (sans fond) dans un conteneur. */
export function frame(scene, x, y, w, h, { border = 'ornate', tint = C.goldHex } = {}) {
  const key = 'ui:' + border;
  const s = BORDERS[border].slice;
  const tex = scene.textures.get(key);
  const S = 48;
  const cuts = [0, s, S - s, S];
  const dst = [[0, s], [s, w - s], [w - s, w]];
  const dsty = [[0, s], [s, h - s], [h - s, h]];
  const c = scene.add.container(x, y);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const name = `${border}-${row}-${col}`;
      if (!tex.has(name)) tex.add(name, 0, cuts[col], cuts[row], cuts[col + 1] - cuts[col], cuts[row + 1] - cuts[row]);
      const [x0, x1] = dst[col];
      const [y0, y1] = dsty[row];
      if (x1 <= x0 || y1 <= y0) continue;
      const img = scene.add.image(x0, y0, key, name).setOrigin(0).setTint(tint);
      img.setDisplaySize(x1 - x0, y1 - y0);
      c.add(img);
    }
  }
  return c;
}

/** Panneau : fond sombre + cadre. */
export function panel(scene, x, y, w, h, { fill = C.panel, alpha = 0.94, border = 'ornate', tint = C.goldHex } = {}) {
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(2, 2, w - 4, h - 4, fill, alpha).setOrigin(0);
  c.add(bg);
  c.add(frame(scene, 0, 0, w, h, { border, tint }));
  c.bg = bg;
  return c;
}

/**
 * Bouton cliquable et activable au clavier (via setFocus/activate depuis la scène).
 * @returns {Phaser.GameObjects.Container & {setState, label, onPress}}
 */
export function button(scene, x, y, w, h, label, onPress, { size = 8, key = null } = {}) {
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(2, 2, w - 4, h - 4, C.panelAlt, 0.96).setOrigin(0);
  const border = frame(scene, 0, 0, w, h, { border: 'plain', tint: 0x657392 });
  const keyTxt = key ? text(scene, 6, h / 2, key, { size, color: C.gold }).setOrigin(0, 0.5) : null;
  const pad = key ? 16 : 6;
  const txt = text(scene, key ? pad : w / 2, h / 2, label, { size, width: w - pad - 6, align: key ? 'left' : 'center' })
    .setOrigin(key ? 0 : 0.5, 0.5);
  c.add([bg, border, txt]);
  if (keyTxt) c.add(keyTxt);
  c.setSize(w, h);
  c.label = txt;
  c.enabled = true;

  const tintBorder = (t) => border.each((img) => img.setTint(t));
  c.setState = (state) => {
    // state : idle | hover | good | bad | dim
    const fills = { idle: C.panelAlt, hover: C.hover, good: 0x1e6f50, bad: 0x891e2b, dim: C.panel };
    const borders = { idle: 0x657392, hover: C.goldHex, good: C.good, bad: C.bad, dim: 0x424c6e };
    bg.setFillStyle(fills[state] ?? C.panelAlt, 0.96);
    tintBorder(borders[state] ?? 0x657392);
    txt.setAlpha(state === 'dim' ? 0.55 : 1);
  };
  c.setEnabled = (on) => {
    c.enabled = on;
    if (!on) scene.input.setDefaultCursor('default');
  };

  const zone = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
  c.add(zone);
  zone.on('pointerover', () => c.enabled && c.setState('hover'));
  zone.on('pointerout', () => c.enabled && c.setState('idle'));
  zone.on('pointerup', () => c.enabled && onPress());
  c.press = () => c.enabled && onPress();
  c.setState('idle');
  return c;
}

/** Jauge de points de vie en segments. */
export function hpBar(scene, x, y, max, { color = C.good, alignRight = false } = {}) {
  const seg = 9;
  const gap = 2;
  const c = scene.add.container(x, y);
  const cells = [];
  for (let i = 0; i < max; i++) {
    const cx = alignRight ? -(i + 1) * (seg + gap) + gap : i * (seg + gap);
    const back = scene.add.rectangle(cx, 0, seg, 6, C.shadow).setOrigin(0).setStrokeStyle(1, 0x0e071b);
    const fill = scene.add.rectangle(cx + 1, 1, seg - 2, 4, color).setOrigin(0);
    c.add([back, fill]);
    cells.push(fill);
  }
  c.set = (hp) => cells.forEach((cell, i) => cell.setVisible(alignRight ? i < hp : i < hp));
  c.set(max);
  return c;
}
