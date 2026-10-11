/**
 * CharacterScene — choix du personnage (un seul disponible pour l'instant) et de la graine.
 * Les personnages viennent de src/data/characters.json.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { Fighter } from '../fighter.js';
import { fadeIn, goTo } from '../transition.js';
import { getContent, itemDef } from '../core/content.js';
import { newSeed, normalizeSeed } from '../core/rng.js';
import { createRun, saveRun } from '../core/run.js';

const W = 480;
const H = 270;

export class CharacterScene extends Phaser.Scene {
  constructor() {
    super('character');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const content = getContent();
    const manifest = this.registry.get('manifest');
    this.characters = content.characters;
    this.selected = this.characters.findIndex((c) => c.available);
    this.seed = newSeed();

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.78).setOrigin(0);
    text(this, W / 2, 10, 'Choisissez votre héros', { size: 16, color: C.gold }).setOrigin(0.5, 0);

    // Une carte par personnage (une seule pour l'instant, la grille s'élargira d'elle-même)
    const cardW = 300;
    const cardH = 170;
    const x0 = (W - cardW) / 2;
    const y0 = 36;
    const ch = this.characters[this.selected];
    panel(this, x0, y0, cardW, cardH);
    this.add.ellipse(x0 + 64, y0 + 132, 60, 8, 0x000000, 0.4);
    const heroH = manifest.characters[ch.sprite].body.height;
    new Fighter(this, manifest, ch.sprite, { x: x0 + 64, groundY: y0 + 132, height: heroH * 2, faceLeft: false });

    const tx = x0 + 128;
    const relic = itemDef(ch.startRelic);
    text(this, tx, y0 + 12, ch.name, { size: 16, color: C.ink, bold: true });
    text(this, tx, y0 + 34, ch.description, { size: 8, color: C.muted, width: cardW - 140 });
    const lines = [
      ['Points de vie', `${ch.hp}`],
      ['Relique de départ', relic ? `${relic.name} : ${relic.description}` : '—'],
      ['Capacité', ch.abilityText],
    ];
    let y = y0 + 62;
    for (const [label, value] of lines) {
      text(this, tx, y, label, { size: 8, color: C.gold });
      const t = text(this, tx, y + 10, value, { size: 8, color: C.ink, width: cardW - 140 });
      y += t.height + 16;
    }

    // Graine : affichée, modifiable pour rejouer une carte
    this.seedText = text(this, W / 2 - 4, y0 + cardH + 14, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.updateSeed();
    const seedButton = button(this, W / 2 + 4, y0 + cardH + 10, 110, 18, 'Changer la graine', () => this.askSeed());

    const back = button(this, W / 2 - 124, H - 32, 116, 22, 'Retour', () => goTo(this, 'title'));
    const start = button(this, W / 2 + 8, H - 32, 116, 22, 'Commencer', () => this.start());
    menuNav(this, [start, seedButton, back], { start: 0 });
    this.input.keyboard.on('keydown-ESC', () => back.press());
  }

  updateSeed() {
    this.seedText.setText(`Graine : ${this.seed}`);
  }

  /** Saisie d'une graine (champ natif du navigateur). */
  askSeed() {
    const value = window.prompt('Graine de la partie (même graine = même carte) :', this.seed);
    if (value && normalizeSeed(value)) {
      this.seed = normalizeSeed(value);
      this.updateSeed();
    }
  }

  start() {
    const run = createRun({ characterId: this.characters[this.selected].id, seed: this.seed });
    saveRun(run);
    goTo(this, run.resume.scene, run.resume.data);
  }
}
