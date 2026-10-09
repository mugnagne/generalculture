/**
 * FinaleScene — victoire finale : l'Usurpateur est tombé, Valdorn est reconquis.
 */
import { MARECHAL, REGIONS } from '../data/world.js';
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { drawBanner } from '../banner.js';
import { Fighter } from '../fighter.js';
import { fadeIn, goTo } from '../transition.js';
import { music } from '../audio.js';

const W = 480;
const H = 270;

export class FinaleScene extends Phaser.Scene {
  constructor() {
    super('finale');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    music(this, 'musique-finale');

    const capital = REGIONS.find((r) => r.capital);
    const key = 'bg:' + capital.id;
    if (this.textures.exists(key)) this.add.image(0, 0, key).setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0xc42430, 0.18).setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.35).setOrigin(0);

    // Le Maréchal au pied du trône, entre deux bannières
    const manifest = this.registry.get('manifest');
    const heroH = manifest.characters[MARECHAL.sprite].body.height;
    this.add.ellipse(W / 2, 206, 60, 8, 0x000000, 0.45);
    new Fighter(this, manifest, MARECHAL.sprite, { x: W / 2, groundY: 206, height: heroH * 2, faceLeft: false });
    drawBanner(this, 150, 210, 3);
    drawBanner(this, 316, 210, 3);

    this.confetti();

    const card = this.add.container(0, 0).setAlpha(0);
    card.add(panel(this, 70, 12, W - 140, 74));
    card.add(text(this, W / 2, 20, 'Valdorn est reconquis !', { size: 16, color: C.gold }).setOrigin(0.5, 0));
    card.add(text(this, W / 2, 42,
      'L’Usurpateur est tombé. Hautecouronne arbore la bannière du Maréchal\net les neuf régions du continent sont enfin unies.',
      { size: 8, color: C.ink, align: 'center' }).setOrigin(0.5, 0));
    this.tweens.add({ targets: card, alpha: 1, duration: 600, delay: 300 });

    const y = H - 30;
    const buttons = [
      button(this, W / 2 - 170, y, 110, 20, 'Voir la carte', () => goTo(this, 'map')),
      button(this, W / 2 - 55, y, 110, 20, 'Crédits', () => goTo(this, 'credits', { back: 'title' })),
      button(this, W / 2 + 60, y, 110, 20, 'Écran titre', () => goTo(this, 'title')),
    ];
    buttons.forEach((b) => b.setEnabled(false));
    this.time.delayedCall(1200, () => {
      buttons.forEach((b) => b.setEnabled(true));
      menuNav(this, buttons, { start: 1 });
    });
  }

  /** Pluie de paillettes or et rouges. */
  confetti() {
    const colors = [0xffc825, 0xedab50, 0xc42430, 0xf9e6cf];
    this.time.addEvent({
      delay: 90,
      repeat: 120,
      callback: () => {
        const x = Phaser.Math.Between(0, W);
        const bit = this.add.rectangle(x, -4, 2, 2, Phaser.Utils.Array.GetRandom(colors));
        this.tweens.add({
          targets: bit,
          y: H + 4,
          x: x + Phaser.Math.Between(-30, 30),
          duration: Phaser.Math.Between(2500, 4500),
          onComplete: () => bit.destroy(),
        });
      },
    });
  }
}
