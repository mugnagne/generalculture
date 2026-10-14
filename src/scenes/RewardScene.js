/**
 * RewardScene — Butin d'un combat gagné ou d'un trésor : l'or est déjà crédité ; fiole et
 * reliques se prennent ou se laissent ; après un boss, une relique de boss parmi trois.
 * Chaque prise est sauvegardée aussitôt (recharger la page ne double rien).
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon, itemIcon } from '../icons.js';
import { drawTopBar, itemInfo } from '../topbar.js';
import { loadRun, saveRun, addConsumable, freeConsumableSlots } from '../core/run.js';
import { acquireRelic } from '../overlays.js';
import { completeNode } from '../core/flow.js';

const W = 480;
const H = 270;

export class RewardScene extends Phaser.Scene {
  constructor() {
    super('reward');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) return this.scene.start('title');
    if (!run.pendingRewards) return this.scene.start('map');
    this.run = run;
    this.draw();
  }

  draw() {
    this.children.removeAll(true);
    this.input.keyboard.removeAllListeners('keydown');
    const { run } = this;
    const rewards = run.pendingRewards;
    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.82).setOrigin(0);
    // Jeter une fiole depuis la barre libère un emplacement : on redessine
    this.topbar = drawTopBar(this, run, { onChange: () => this.draw() });

    const pw = 320;
    const px = (W - pw) / 2;
    panel(this, px, 24, pw, 240);
    const title = rewards.source === 'treasure' ? 'Trésor' : rewards.bossRelics?.length ? 'Butin du boss' : 'Butin';
    text(this, W / 2, 32, title, { size: 16, color: C.gold }).setOrigin(0.5, 0);

    const rows = [];
    if (rewards.gold) rows.push({ iconName: 'coin', label: `${rewards.gold} pièces d’or`, note: 'Ajoutées à votre bourse.' });
    if (rewards.consumable) {
      rows.push({
        id: rewards.consumable,
        label: 'Prendre',
        take: (done) => {
          if (addConsumable(run, rewards.consumable)) rewards.consumable = null;
          done();
        },
        full: freeConsumableSlots(run) === 0 ? 'Emplacements pleins : jetez une fiole (barre du haut) ou laissez-la.' : null,
      });
    }
    rewards.relics.forEach((id) => rows.push({
      id,
      label: 'Prendre',
      take: (done) => acquireRelic(this, run, id, (taken) => {
        if (taken) rewards.relics = rewards.relics.filter((r) => r !== id);
        done();
      }),
    }));
    // Reliques de boss : une seule parmi les trois
    (rewards.bossRelics ?? []).forEach((id) => rows.push({
      id,
      label: 'Choisir',
      take: (done) => acquireRelic(this, run, id, (taken) => {
        if (taken) rewards.bossRelics = [];
        done();
      }),
    }));
    if (rewards.bossRelics?.length) {
      text(this, W / 2, 50, 'Choisissez une relique de boss (ou aucune).', { size: 8, color: C.muted }).setOrigin(0.5, 0);
    }

    const buttons = [];
    let y = 64;
    for (const row of rows) {
      const info = row.id ? itemInfo(row.id) : null;
      this.add.rectangle(px + 10, y, pw - 20, 38, C.panelAlt, 0.7).setOrigin(0);
      if (row.id) itemIcon(this, px + 24, y + 19, row.id, 32);
      else icon(this, px + 24, y + 19, row.iconName, { scale: 2 });
      text(this, px + 42, y + 3, info?.name ?? row.label, { size: 8, color: C.gold });
      const desc = row.full ?? (info ? `${info.description}${info.drawback ? ` Contrepartie : ${info.drawback}` : ''}` : row.note);
      text(this, px + 42, y + 13, desc, { size: 8, color: row.full ? C.badText : C.ink, width: row.take ? pw - 130 : pw - 60 });
      if (row.take) {
        const b = button(this, px + pw - 78, y + 9, 62, 20, row.label, () => {
          row.take(() => {
            saveRun(run);
            this.draw();
          });
        });
        if (row.full) {
          b.setEnabled(false);
          b.setState('dim');
        }
        buttons.push(b);
      }
      y += 42;
    }

    const cont = button(this, W / 2 - 60, 236, 120, 20, 'Continuer', () => this.leave());
    buttons.push(cont);
    menuNav(this, buttons, { start: buttons.length - 1 });
  }

  leave() {
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
