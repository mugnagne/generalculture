/**
 * BootScene — charge les ressources communes puis lance la scène demandée.
 */
import { preloadCharacters, createAnimations } from '../sprites.js';
import { preloadUi, text, C } from '../ui.js';
import { fitCamera } from '../display.js';
import { preloadAudioList, loadAudioFiles, isMuted } from '../audio.js';
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
    this.load.json('regions', 'src/data/regions.json');
    this.load.text('credits-md', 'CREDITS.md');
    preloadAudioList(this);
    // Carte : si l'image manque, la scène de carte dessine un continent ovale de secours.
    this.load.image('map', 'assets/generated/map/map.jpg');
    // Décors de combat : seule la liste est chargée ici, les calques le sont à l'entrée de chaque scène.
    this.load.json('backdrops', 'assets/generated/backdrops.json');
    preloadCharacters(this, manifest, this.characterKeys());
  }

  characterKeys() {
    const keys = new Set([MARECHAL.sprite]);
    for (const r of REGIONS) [r.soldiers, r.knight, r.boss].forEach((e) => keys.add(e.sprite));
    return [...keys];
  }

  create() {
    createAnimations(this, this.registry.get('manifest'), this.characterKeys());
    // Sons facultatifs (assets/audio/sons.json), puis lancement de l'écran demandé
    loadAudioFiles(this, () => {
      this.game.sound.mute = isMuted();
      const start = this.registry.get('start');
      this.scene.start(start.scene, start.data);
    });
  }
}
