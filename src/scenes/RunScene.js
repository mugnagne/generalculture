/**
 * RunScene — Campement (provisoire, jalon 1) : affiche l'état de la partie sauvegardée.
 * Au jalon 2, la carte de l'acte prendra sa place.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { getContent, itemDef } from '../core/content.js';
import { loadRun, deleteRun, saveRun } from '../core/run.js';
import { rngOf } from '../core/rng.js';

const W = 480;
const H = 270;

export class RunScene extends Phaser.Scene {
  constructor() {
    super('run');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) {
      this.scene.start('title');
      return;
    }
    this.run = run;
    this.confirming = false;
    const content = getContent();
    const character = content.characters.find((c) => c.id === run.characterId);

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.8).setOrigin(0);
    text(this, W / 2, 10, 'Campement', { size: 16, color: C.gold }).setOrigin(0.5, 0);
    text(this, W / 2, 30, 'Jalon 1 : la carte de l’acte arrive au jalon 2.', { size: 8, color: C.muted }).setOrigin(0.5, 0);

    panel(this, 20, 46, W - 40, 168);
    const col = (x, y, label, value, width = 200) => {
      text(this, x, y, label, { size: 8, color: C.gold });
      return text(this, x, y + 10, value, { size: 8, color: C.ink, width });
    };
    col(34, 58, 'Héros', character.name);
    col(34, 84, 'Points de vie', `${run.hp} / ${run.maxHp}`);
    col(34, 110, 'Pièces d’or', `${run.gold}`);
    col(34, 136, 'Acte · étage', `${run.act} · ${run.floor}`);
    col(34, 162, 'Graine', run.seed);

    const relics = run.relics.map((r) => {
      const def = itemDef(r.id);
      return `${def.name} (${content.families[def.family]?.name ?? 'Boss'}) : ${def.description}`;
    });
    const t1 = col(160, 58, `Reliques (${run.relics.length}/${run.relicSlots})`, relics.join('\n') || '—', 280);
    const potions = run.consumables.map((id, i) => `${i + 1}. ${id ? `${itemDef(id).name} : ${itemDef(id).description}` : 'vide'}`);
    col(160, t1.y + t1.height + 8, `Consommables (${run.consumables.filter(Boolean).length}/${run.consumables.length})`, potions.join('\n'), 280);

    const train = button(this, 24, H - 48, 140, 20, 'Combat d’essai (pause)', () => this.training());
    const menu = button(this, 170, H - 48, 140, 20, 'Écran titre', () => goTo(this, 'title'));
    this.abandon = button(this, 316, H - 48, 140, 20, 'Abandonner la partie', () => this.askAbandon());
    menuNav(this, [train, menu, this.abandon], { start: 0 });
  }

  /** Combat d'essai de l'ancien moteur (remplacé au jalon 2), pour tester la pause. */
  training() {
    const region = rngOf(this.run, 'combat').pick(getContent().regions);
    saveRun(this.run);
    goTo(this, 'combat', { regionId: region.id, tierId: 1, training: true });
  }

  askAbandon() {
    if (!this.confirming) {
      this.confirming = true;
      this.abandon.label.setText('Confirmer ?');
      this.abandon.setState('bad');
      this.time.delayedCall(3000, () => {
        this.confirming = false;
        this.abandon.label.setText('Abandonner la partie');
        this.abandon.setState('idle');
      });
      return;
    }
    deleteRun();
    goTo(this, 'title');
  }
}
