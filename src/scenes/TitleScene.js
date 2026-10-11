/**
 * TitleScene — écran titre : Nouvelle partie / Continuer / Crédits.
 */
import { fitCamera } from '../display.js';
import { text, button, menuNav, C } from '../ui.js';
import { drawBanner } from '../banner.js';
import { Fighter } from '../fighter.js';
import { loadRun, deleteRun } from '../core/run.js';
import { getContent } from '../core/content.js';
import { fadeIn, goTo } from '../transition.js';
import { music, isMuted, toggleMute } from '../audio.js';

const W = 480;
const H = 270;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    music(this, 'musique-titre');
    this.confirming = false;

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    else this.add.rectangle(0, 0, W, H, 0x0069aa).setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.62).setOrigin(0);

    // Le héros par défaut et sa bannière, à gauche
    const hero = getContent().characters[0];
    const manifest = this.registry.get('manifest');
    const heroH = manifest.characters[hero.sprite].body.height;
    new Fighter(this, manifest, hero.sprite, { x: 92, groundY: 214, height: heroH * 2, faceLeft: false });
    this.add.ellipse(92, 214, 70, 8, 0x000000, 0.4);
    drawBanner(this, 140, 216, 3);

    text(this, 300, 34, 'La Reconquête', { size: 16, color: C.ink }).setOrigin(0.5, 0);
    text(this, 300, 52, 'de Valdorn', { size: 32, color: C.gold, bold: true }).setOrigin(0.5, 0)
      .setShadow(2, 2, '#8E251D', 0, false, true);
    text(this, 300, 92, 'Trois actes, une seule réserve de vie : chaque question\nest un coup porté. Jusqu’à l’Usurpateur.',
      { size: 8, color: C.muted, align: 'center' }).setOrigin(0.5, 0);

    const saved = loadRun();
    const has = Boolean(saved);
    const bx = 300 - 70;
    this.newButton = button(this, bx, 126, 140, 22, 'Nouvelle partie', () => this.newGame(has));
    this.continueButton = button(this, bx, 154, 140, 22, 'Continuer',
      () => goTo(this, saved.resume.scene, saved.resume.data));
    this.settingsButton = button(this, bx, 182, 140, 22, 'Paramètres', () => goTo(this, 'settings'));
    this.creditsButton = button(this, bx, 210, 140, 22, 'Crédits', () => goTo(this, 'credits'));
    if (!has) {
      this.continueButton.setEnabled(false);
      this.continueButton.setState('dim');
    }
    menuNav(this, [this.newButton, this.continueButton, this.settingsButton, this.creditsButton], { start: has ? 1 : 0 });

    this.soundText = text(this, W - 8, H - 12, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.updateSoundText();
    this.input.keyboard.on('keydown-M', () => { toggleMute(this.game); this.updateSoundText(); });
    text(this, 8, H - 12, 'Questions fournies par Quizz API', { size: 8, color: C.muted });
  }

  updateSoundText() {
    this.soundText.setText(`Son ${isMuted() ? 'coupé' : 'activé'} (M)`);
  }

  /** Une partie existe : un premier clic demande confirmation avant de l'effacer. */
  newGame(has) {
    if (has && !this.confirming) {
      this.confirming = true;
      this.newButton.label.setText('Effacer la partie en cours ?');
      this.newButton.setState('bad');
      this.time.delayedCall(3000, () => {
        this.confirming = false;
        this.newButton.label.setText('Nouvelle partie');
        this.newButton.setState('idle');
      });
      return;
    }
    deleteRun();
    goTo(this, 'character');
  }
}
