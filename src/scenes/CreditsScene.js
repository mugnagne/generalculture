/**
 * CreditsScene — crédits lus dans CREDITS.md, défilant de bas en haut.
 * Flèches / molette : défiler · Entrée ou Échap : retour.
 */
import { fitCamera } from '../display.js';
import { text, button, C } from '../ui.js';
import { parseCredits } from '../credits.js';
import { fadeIn, goTo } from '../transition.js';

const W = 480;
const H = 270;

export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('credits');
  }

  init({ back = 'title' } = {}) {
    this.back = back;
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    this.add.rectangle(0, 0, W, H, 0x0e071b).setOrigin(0);

    const { sections } = parseCredits(this.cache.text.get('credits-md') ?? '');
    const roll = this.add.container(0, 0);
    let y = 0;
    const add = (obj, gap) => { obj.setY(y); roll.add(obj); y += obj.height + gap; };

    add(text(this, W / 2, 0, 'La Reconquête de Valdorn', { size: 16, color: C.gold }).setOrigin(0.5, 0), 4);
    add(text(this, W / 2, 0, 'Un univers original · questions fournies par Quizz API (quizzapi.jomoreschi.fr)',
      { size: 8, color: C.muted }).setOrigin(0.5, 0), 22);
    for (const section of sections) {
      if (!section.entries.length) continue;
      add(text(this, W / 2, 0, section.title.toUpperCase(), { size: 8, color: '#0098DC' }).setOrigin(0.5, 0), 10);
      for (const e of section.entries) {
        add(text(this, W / 2, 0, e.author, { size: 16, color: C.ink }).setOrigin(0.5, 0), 2);
        const items = e.items.filter(Boolean).join(e.lines ? '\n' : ', ');
        const licence = e.licence && `licence ${e.licence}`;
        const detail = e.lines ? [items, licence].filter(Boolean).join('\n') : [items, licence].filter(Boolean).join(' — ');
        add(text(this, W / 2, 0, detail, { size: 8, color: C.muted, width: 400, align: 'center' }).setOrigin(0.5, 0), 14);
      }
      y += 10;
    }
    add(text(this, W / 2, 0, 'Merci d’avoir joué !', { size: 16, color: C.gold }).setOrigin(0.5, 0), 0);

    this.rollHeight = y;
    roll.setY(40);
    this.roll = roll;
    this.speed = 16; // pixels par seconde

    // Bandeaux sombres haut et bas (fondu du texte)
    for (let i = 0; i < 12; i++) {
      this.add.rectangle(0, i * 2, W, 2, 0x0e071b, 1 - i / 12).setOrigin(0);
      this.add.rectangle(0, H - 34 - i * 2, W, 2, 0x0e071b, 1 - i / 12).setOrigin(0);
    }
    this.add.rectangle(0, H - 34, W, 34, 0x0e071b).setOrigin(0);
    this.backButton = button(this, W / 2 - 50, H - 28, 100, 20, 'Retour', () => goTo(this, this.back));

    this.input.keyboard.on('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') this.backButton.press();
      if (e.key === 'ArrowDown') this.scroll(-20);
      if (e.key === 'ArrowUp') this.scroll(20);
    });
    this.input.on('wheel', (_p, _o, _dx, dy) => this.scroll(-dy / 4));
  }

  scroll(dy) {
    this.roll.y = Phaser.Math.Clamp(this.roll.y + dy, -this.rollHeight + 60, 40);
  }

  update(_time, delta) {
    if (this.roll.y > -this.rollHeight + 100) this.roll.y -= (this.speed * delta) / 1000;
  }
}
