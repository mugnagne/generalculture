/**
 * ConquestScene — une région vient de tomber : elle passe aux couleurs du Maréchal.
 */
import { regionById, MARECHAL } from '../data/world.js';
import { fitCamera } from '../display.js';
import { text, panel, button, C } from '../ui.js';
import { drawBanner } from '../banner.js';
import { fadeIn, goTo } from '../transition.js';
import { preloadBackdrop, drawBackdrop } from '../backdrop.js';
import { sfx, music } from '../audio.js';

const W = 480;
const H = 270;

export class ConquestScene extends Phaser.Scene {
  constructor() {
    super('conquest');
  }

  init({ regionId = 'givre' } = {}) {
    this.region = regionById(regionId);
  }

  preload() {
    preloadBackdrop(this, this.region);
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    music(this, 'musique-carte');
    sfx(this, 'conquete');
    const { region } = this;
    drawBackdrop(this, region);

    // Voile rouge du Maréchal qui monte sur le décor
    const veil = this.add.rectangle(0, H, W, H, 0xc42430, 0.35).setOrigin(0);
    this.tweens.add({ targets: veil, y: 0, duration: 900, ease: 'Cubic.easeOut' });
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.35).setOrigin(0);

    // Bannières plantées de part et d'autre
    const left = drawBanner(this, 70, 210, 3);
    const right = drawBanner(this, 380, 210, 3);
    [left, right].forEach((b, i) => {
      b.setScale(1, 0);
      this.tweens.add({ targets: b, scaleY: 1, duration: 500, delay: 500 + i * 150, ease: 'Back.easeOut' });
    });

    const pw = 250;
    const ph = 108;
    const px = (W - pw) / 2;
    const py = 66;
    const card = this.add.container(0, 0);
    card.add(panel(this, px, py, pw, ph));
    card.add(text(this, W / 2, py + 10, 'Région conquise !', { size: 16, color: C.gold }).setOrigin(0.5, 0));
    card.add(text(this, W / 2, py + 32, region.name, { size: 8, color: C.ink, bold: true }).setOrigin(0.5, 0));
    const house = region.house.fallen ? `La maison ${region.house.name}, régnante déchue, est chassée du trône.` : `La maison ${region.house.name} dépose les armes.`;
    card.add(text(this, W / 2, py + 46, `${house} La région arbore désormais la bannière du ${MARECHAL.name.replace(/^Le /, '')}.`,
      { size: 8, width: pw - 28, align: 'center', color: C.ink }).setOrigin(0.5, 0));
    card.setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, delay: 300 });

    this.buttons = [
      button(this, W / 2 - 112, py + ph - 26, 108, 20, 'Retour à la carte', () => goTo(this, 'map')),
      button(this, W / 2 + 4, py + ph - 26, 108, 20, 'Rejouer la région', () => goTo(this, 'combat', { regionId: region.id, tierId: 1 })),
    ];
    // Boutons inactifs tant qu'ils ne sont pas apparus (évite de passer l'écran par un Entrée de trop)
    this.buttons.forEach((b) => b.setAlpha(0).setEnabled(false));
    this.tweens.add({
      targets: this.buttons, alpha: 1, duration: 300, delay: 900,
      onComplete: () => this.buttons.forEach((b) => b.setEnabled(true)),
    });
    this.input.keyboard.on('keydown-ENTER', () => this.buttons[0].press());
  }
}
