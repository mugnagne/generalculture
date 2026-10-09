/**
 * fighter.js — Un combattant à l'écran : échelle normalisée, ancrage au sol,
 * animations jouées sous forme de promesses.
 */
import { animKey, fileKey } from './sprites.js';
import { sfx } from './audio.js';

export class Fighter {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} manifest
   * @param {string} charKey  clé du personnage dans le manifeste
   * @param {object} opts { x, groundY, height (hauteur visible en px), faceLeft, attackAnim }
   */
  constructor(scene, manifest, charKey, { x, groundY, height, faceLeft, attackAnim = 'attack' }) {
    this.scene = scene;
    this.key = charKey;
    this.def = manifest.characters[charKey];
    this.attackAnim = this.def.anims[attackAnim] ? attackAnim : 'attack';
    this.homeX = x;
    this.faceLeft = faceLeft;

    const idle = this.def.anims.idle;
    const { body } = this.def;
    // Le sprite regarde à gauche si on le demande et qu'il regarde à droite d'origine (ou l'inverse).
    const flip = faceLeft === (this.def.facing === 'right');
    this.sprite = scene.add.sprite(x, groundY, fileKey(idle.file), idle.start);
    this.sprite.setFlipX(flip);
    // Ancrage : centre de la silhouette, sous les pieds (symétrisé si retourné).
    const ox = body.centerX / idle.frameWidth;
    this.sprite.setOrigin(flip ? 1 - ox : ox, body.bottom / idle.frameHeight);
    this.sprite.setScale(height / body.height);
    this.idle();
  }

  has(anim) {
    return Boolean(this.def.anims[anim]);
  }

  idle() {
    this.sprite.play(animKey(this.key, 'idle'));
  }

  /** Joue une animation non bouclée ; résout à la fin. */
  play(anim, { thenIdle = true } = {}) {
    return new Promise((resolve) => {
      if (!this.has(anim)) return resolve();
      this.sprite.play(animKey(this.key, anim));
      this.sprite.once('animationcomplete', () => {
        if (thenIdle) this.idle();
        resolve();
      });
    });
  }

  tween(props) {
    return new Promise((resolve) => this.scene.tweens.add({ targets: this.sprite, ...props, onComplete: resolve }));
  }

  /** S'élance vers la cible, frappe, revient. */
  async attack(target) {
    const dir = this.faceLeft ? -1 : 1;
    const reach = Math.abs(target.homeX - this.homeX) * 0.45;
    await this.tween({ x: this.homeX + dir * reach, duration: 220, ease: 'Quad.easeOut' });
    const hit = this.play(this.attackAnim);
    // L'impact tombe vers le milieu de l'animation d'attaque.
    const frames = this.def.anims[this.attackAnim];
    let impact = Promise.resolve();
    this.scene.time.delayedCall((frames.frames / frames.fps) * 500, () => { impact = target.hurt(); });
    await hit;
    await this.tween({ x: this.homeX, duration: 220, ease: 'Quad.easeIn' });
    await impact;
  }

  /** Encaisse un coup : animation de dégâts, ou flash blanc + recul de 2 px si absente. */
  async hurt() {
    sfx(this.scene, 'coup');
    if (this.has('hurt')) return this.play('hurt');
    const away = this.faceLeft ? 2 : -2;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => this.sprite.clearTint());
    await this.tween({ x: this.homeX + away, duration: 70, yoyo: true });
  }

  /** Meurt et reste sur la dernière frame. */
  die() {
    return this.play('death', { thenIdle: false });
  }
}
