/**
 * CrestScene — Éditeur d'écusson : deux couleurs (motif et fond) à choisir dans la palette,
 * puis un motif de 11 x 11 à dessiner au pinceau (clic ou glisser). Aperçu en direct sur la
 * bannière. L'écusson validé est gardé dans les réglages et repris pour les parties suivantes.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { drawBanner, currentCrest, defaultCrest, blankEmblem, EMBLEM_SIZE } from '../banner.js';
import { setSetting } from '../settings.js';

const W = 480;
const H = 270;
const CELL = 14;
const GX = 22;
const GY = 46;

/** Palette proposée (ENDESGA 64). */
const PALETTE = [
  '#FFC825', '#EDAB50', '#ED7614', '#EA323C', '#891E2B', '#A93B89',
  '#5AC54F', '#1E6F50', '#0098DC', '#143464', '#1F2A44', '#5D2C28',
  '#8A4836', '#F9E6CF', '#C7CFDD', '#92A1B9', '#4E5B7C', '#0E071B',
];

const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

export class CrestScene extends Phaser.Scene {
  constructor() {
    super('crest');
  }

  init(data = {}) {
    this.back = data;
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const crest = currentCrest();
    this.colors = [...crest.colors];
    this.grid = crest.emblem.map((row) => [...row].map((c) => c !== '.'));
    this.tool = true; // true : motif ; false : fond (gomme)
    this.mirror = true;

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.86).setOrigin(0);
    text(this, W / 2, 8, 'Dessinez votre écusson', { size: 16, color: C.gold }).setOrigin(0.5, 0);
    text(this, W / 2, 28, 'Clic ou glisser pour peindre. Deux couleurs : le motif et le fond.', { size: 8, color: C.muted })
      .setOrigin(0.5, 0);

    // Grille de dessin
    const size = CELL * EMBLEM_SIZE;
    panel(this, GX - 8, GY - 8, size + 16, size + 16, { border: 'plain', tint: 0x657392 });
    this.cells = [];
    for (let r = 0; r < EMBLEM_SIZE; r++) {
      for (let c = 0; c < EMBLEM_SIZE; c++) {
        const cell = this.add.rectangle(GX + c * CELL, GY + r * CELL, CELL - 1, CELL - 1, 0).setOrigin(0);
        this.cells.push(cell);
      }
    }
    // Repères de symétrie
    this.add.rectangle(GX + 5 * CELL + CELL / 2, GY - 4, 1, 3, C.goldHex).setOrigin(0.5, 0);
    this.add.rectangle(GX + 5 * CELL + CELL / 2, GY + size + 1, 1, 3, C.goldHex).setOrigin(0.5, 0);

    this.paintZone = this.add.zone(GX, GY, size, size).setOrigin(0).setInteractive({ useHandCursor: true });
    this.paintZone.on('pointerdown', (p) => {
      // Le premier point décide : peindre ou effacer (selon l'outil)
      this.painting = true;
      this.paintAt(p);
    });
    this.input.on('pointermove', (p) => { if (this.painting && p.isDown) this.paintAt(p); });
    this.input.on('pointerup', () => { this.painting = false; });

    // Palette : couleur du motif, couleur du fond
    const px = 196;
    this.swatches = [[], []];
    ['Couleur du motif', 'Couleur du fond'].forEach((label, which) => {
      const y = 46 + which * 58;
      text(this, px, y, label, { size: 8, color: C.gold });
      PALETTE.forEach((col, i) => {
        const sx = px + (i % 9) * 18;
        const sy = y + 12 + Math.floor(i / 9) * 18;
        const ring = this.add.rectangle(sx, sy, 16, 16, 0x000000, 0).setOrigin(0).setStrokeStyle(2, C.goldHex).setVisible(false);
        const sw = this.add.rectangle(sx + 2, sy + 2, 12, 12, hex(col)).setOrigin(0).setStrokeStyle(1, 0x0e071b)
          .setInteractive({ useHandCursor: true });
        sw.on('pointerup', () => this.setColor(which, col));
        this.swatches[which].push({ col, ring });
      });
    });

    // Outils
    const ty = 166;
    this.toolButton = button(this, px, ty, 78, 18, '', () => { this.tool = !this.tool; this.refresh(); });
    this.mirrorButton = button(this, px + 84, ty, 78, 18, '', () => { this.mirror = !this.mirror; this.refresh(); });
    const clear = button(this, px, ty + 22, 78, 18, 'Tout effacer', () => {
      this.grid = blankEmblem().map((row) => [...row].map(() => false));
      this.refresh();
    });
    const reset = button(this, px + 84, ty + 22, 78, 18, 'Par défaut', () => {
      const d = defaultCrest();
      this.colors = [...d.colors];
      this.grid = d.emblem.map((row) => [...row].map((c) => c !== '.'));
      this.refresh();
    });
    const invert = button(this, px, ty + 44, 162, 18, 'Inverser motif et fond', () => {
      this.grid = this.grid.map((row) => row.map((v) => !v));
      this.refresh();
    });

    // Aperçu
    panel(this, 368, 46, 96, 150, { border: 'plain', tint: 0x657392 });
    text(this, 416, 52, 'Aperçu', { size: 8, color: C.muted }).setOrigin(0.5, 0);

    const cancel = button(this, W / 2 - 124, H - 30, 116, 22, 'Annuler', () => this.leave());
    const ok = button(this, W / 2 + 8, H - 30, 116, 22, 'Valider', () => this.save());
    menuNav(this, [ok, cancel, this.toolButton, this.mirrorButton, clear, reset, invert], { start: 0 });
    this.input.keyboard.on('keydown-ESC', () => cancel.press());
    this.refresh();
  }

  setColor(which, col) {
    this.colors[which] = col;
    this.refresh();
  }

  paintAt(p) {
    const c = Math.floor((p.worldX - GX) / CELL);
    const r = Math.floor((p.worldY - GY) / CELL);
    if (r < 0 || c < 0 || r >= EMBLEM_SIZE || c >= EMBLEM_SIZE) return;
    this.grid[r][c] = this.tool;
    if (this.mirror) this.grid[r][EMBLEM_SIZE - 1 - c] = this.tool;
    this.refresh();
  }

  crest() {
    return { colors: [...this.colors], emblem: this.grid.map((row) => row.map((v) => (v ? 'x' : '.')).join('')) };
  }

  refresh() {
    const [motif, field] = this.colors.map(hex);
    this.grid.forEach((row, r) => row.forEach((v, c) => this.cells[r * EMBLEM_SIZE + c].setFillStyle(v ? motif : field)));
    this.swatches.forEach((list, which) => list.forEach((s) => s.ring.setVisible(s.col === this.colors[which])));
    this.toolButton.label.setText(this.tool ? 'Outil : motif' : 'Outil : gomme');
    this.mirrorButton.label.setText(this.mirror ? 'Symétrie : oui' : 'Symétrie : non');
    this.preview?.destroy();
    this.preview = drawBanner(this, 404, 186, 3, this.crest());
  }

  save() {
    setSetting('crest', this.crest());
    this.leave();
  }

  leave() {
    goTo(this, 'character', { seed: this.back?.seed });
  }
}
