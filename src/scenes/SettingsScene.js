/**
 * SettingsScene — Paramètres : police (Lisible / Pixel) et son.
 * Les réglages sont gardés dans le navigateur (settings.js).
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { FONTS, getSettings, setSetting } from '../settings.js';
import { isMuted, toggleMute } from '../audio.js';

const W = 480;
const H = 270;

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('settings');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.82).setOrigin(0);
    panel(this, W / 2 - 160, 24, 320, 214);
    text(this, W / 2, 34, 'Paramètres', { size: 16, color: C.gold }).setOrigin(0.5, 0);

    const current = getSettings().font;
    text(this, W / 2 - 144, 66, 'Police', { size: 8, color: C.gold });
    const fontButtons = Object.entries(FONTS).map(([id, f], i) => {
      const b = button(this, W / 2 - 64 + i * 108, 62, 100, 18, `${f.label}${id === current ? ' ✓' : ''}`, () => {
        setSetting('font', id);
        this.scene.restart();
      });
      if (id === current) b.setState('good');
      return b;
    });
    text(this, W / 2 - 144, 88, 'Aperçu : « Quel fleuve traverse Paris ? » — 1. La Seine  2. La Loire',
      { size: 8, color: C.ink, width: 288 });
    text(this, W / 2 - 144, 104, 'La police lisible est conseillée ; la police pixel garde le style rétro.',
      { size: 8, color: C.muted, width: 288 });

    text(this, W / 2 - 144, 136, 'Son', { size: 8, color: C.gold });
    const sound = button(this, W / 2 - 64, 132, 100, 18, isMuted() ? 'Coupé' : 'Activé', () => {
      toggleMute(this.game);
      sound.label.setText(isMuted() ? 'Coupé' : 'Activé');
    });
    text(this, W / 2 - 144, 156, 'Touche M pendant le jeu.', { size: 8, color: C.muted });

    const back = button(this, W / 2 - 60, 206, 120, 22, 'Retour', () => goTo(this, 'title'));
    menuNav(this, [back, ...fontButtons, sound], { start: 0 });
    this.input.keyboard.on('keydown-ESC', () => back.press());
  }
}
