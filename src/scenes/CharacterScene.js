/**
 * CharacterScene — choix du personnage (un seul disponible pour l'instant), de son nom,
 * de son écusson (éditeur : CrestScene) et de la graine.
 * Les personnages viennent de src/data/characters.json.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { Fighter } from '../fighter.js';
import { fadeIn, goTo } from '../transition.js';
import { drawBanner, currentCrest } from '../banner.js';
import { textField } from '../textfield.js';
import { getSettings, setSetting } from '../settings.js';
import { getContent, itemDef } from '../core/content.js';
import { newSeed, normalizeSeed } from '../core/rng.js';
import { saveRun } from '../core/run.js';
import { newRun } from '../core/flow.js';

const W = 480;
const H = 270;
const NAME_MAX = 18;

export class CharacterScene extends Phaser.Scene {
  constructor() {
    super('character');
  }

  init(data = {}) {
    // Retour de l'éditeur d'écusson : on garde la graine tirée
    this.keepSeed = data.seed ?? null;
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    this.typing = false;
    const content = getContent();
    const manifest = this.registry.get('manifest');
    this.characters = content.characters;
    this.selected = this.characters.findIndex((c) => c.available);
    this.seed = this.keepSeed ?? newSeed();
    const ch = this.characters[this.selected];
    this.heroName = getSettings().heroName || ch.name;

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.78).setOrigin(0);
    text(this, W / 2, 10, 'Choisissez votre héros', { size: 16, color: C.gold }).setOrigin(0.5, 0);

    // Une carte par personnage (une seule pour l'instant, la grille s'élargira d'elle-même)
    const cardW = 320;
    const cardH = 172;
    const x0 = (W - cardW) / 2;
    const y0 = 34;
    panel(this, x0, y0, cardW, cardH);
    this.add.ellipse(x0 + 46, y0 + 140, 60, 8, 0x000000, 0.4);
    const heroH = manifest.characters[ch.sprite].body.height;
    new Fighter(this, manifest, ch.sprite, { x: x0 + 46, groundY: y0 + 140, height: heroH * 2, faceLeft: false });
    drawBanner(this, x0 + 92, y0 + 140, 2, currentCrest());
    const crestButton = button(this, x0 + 12, y0 + cardH - 26, 116, 18, 'Dessiner l’écusson', () => this.editCrest());

    const tx = x0 + 140;
    const tw = cardW - 152;
    text(this, tx, y0 + 10, 'Nom du héros', { size: 8, color: C.gold });
    this.nameField = textField(this, tx, y0 + 21, tw, {
      label: 'Nom du héros :',
      value: this.heroName,
      maxLength: NAME_MAX,
      filter: (k) => /[\p{L}\p{N} '’.-]/u.test(k),
      normalize: (v) => v.replace(/\s+/g, ' ').slice(0, NAME_MAX) || null,
      onChange: (v) => {
        this.heroName = v;
        setSetting('heroName', v);
      },
    });
    text(this, tx, y0 + 40, `${ch.name} · ${ch.description}`, { size: 8, color: C.muted, width: tw });
    const relic = itemDef(ch.startRelic);
    const lines = [
      ['Points de vie', `${ch.hp}`],
      ['Relique de départ', relic ? `${relic.name} : ${relic.description}` : '—'],
      ['Capacité', ch.abilityText],
    ];
    let y = y0 + 70;
    for (const [label, value] of lines) {
      text(this, tx, y, label, { size: 8, color: C.gold });
      const t = text(this, tx, y + 10, value, { size: 8, color: C.ink, width: tw });
      y += t.height + 14;
    }

    // Graine : affichée, modifiable pour rejouer une carte
    const sy = y0 + cardH + 8;
    text(this, W / 2 - 104, sy + 3, 'Graine', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.seedField = textField(this, W / 2 - 98, sy, 90, {
      label: 'Graine de la partie (même graine = même carte) :',
      value: this.seed,
      maxLength: 9,
      filter: (k) => /[a-z0-9-]/i.test(k),
      normalize: (v) => normalizeSeed(v),
      onChange: (v) => { this.seed = v; },
    });
    const reroll = button(this, W / 2 - 2, sy, 100, 16, 'Autre graine', () => {
      this.seed = newSeed();
      this.seedField.setValue(this.seed);
    });

    const back = button(this, W / 2 - 124, H - 30, 116, 22, 'Retour', () => goTo(this, 'title'));
    const start = button(this, W / 2 + 8, H - 30, 116, 22, 'Commencer', () => this.start());
    menuNav(this, [start, crestButton, reroll, back], { start: 0 });
    this.input.keyboard.on('keydown-ESC', () => { if (!this.typing) back.press(); });
  }

  editCrest() {
    goTo(this, 'crest', { seed: this.seed });
  }

  start() {
    if (this.typing) return;
    const run = newRun({
      characterId: this.characters[this.selected].id, seed: this.seed, heroName: this.heroName, crest: currentCrest(),
    });
    saveRun(run);
    goTo(this, run.resume.scene, run.resume.data);
  }
}
