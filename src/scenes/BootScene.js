/**
 * BootScene — charge les ressources communes puis lance la scène demandée.
 */
import { preloadCharacters, createAnimations } from '../sprites.js';
import { preloadUi, text, C } from '../ui.js';
import { fitCamera } from '../display.js';
import { REGIONS, MARECHAL } from '../data/world.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    fitCamera(this);
    const manifest = this.registry.get('manifest');
    const width = 480;
    const height = 270;

    const label = text(this, width / 2, height / 2 - 12, 'Chargement…', { size: 8 }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 80, height / 2, 0, 4, C.goldHex).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 162, 6).setStrokeStyle(1, 0x657392);
    this.load.on('progress', (p) => { bar.width = 160 * p; });
    this.load.on('complete', () => label.destroy());

    preloadUi(this);
    for (const r of REGIONS) {
      if (r.background) this.load.image('bg:' + r.id, `assets/generated/backgrounds/${r.background}.jpg`);
    }
    preloadCharacters(this, manifest, this.characterKeys());
  }

  characterKeys() {
    const keys = new Set([MARECHAL.sprite]);
    for (const r of REGIONS) [r.soldiers, r.knight, r.boss].forEach((e) => keys.add(e.sprite));
    return [...keys];
  }

  create() {
    createAnimations(this, this.registry.get('manifest'), this.characterKeys());
    const start = this.registry.get('start');
    this.scene.start(start.scene, start.data);
  }
}
