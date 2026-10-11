/**
 * RewardScene — Butin d'un combat gagné : l'or est déjà crédité ; fiole et reliques
 * se prennent ou se laissent. Les reliques de boss arrivent au jalon 3.
 * Chaque prise est sauvegardée aussitôt (recharger la page ne double rien).
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar, itemInfo, itemTint } from '../topbar.js';
import { getContent } from '../core/content.js';
import { loadRun, saveRun, addConsumable, addRelic, freeConsumableSlots, freeRelicSlots } from '../core/run.js';
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
    this.topbar = drawTopBar(this, run);

    const pw = 300;
    const px = (W - pw) / 2;
    panel(this, px, 30, pw, 214);
    text(this, W / 2, 40, 'Butin', { size: 16, color: C.gold }).setOrigin(0.5, 0);

    const rows = [];
    rows.push({ iconName: 'coin', label: `${rewards.gold} pièces d’or`, note: 'Ajoutées à votre bourse.' });
    if (rewards.consumable) {
      rows.push({
        id: rewards.consumable,
        take: () => {
          if (!addConsumable(run, rewards.consumable)) return;
          rewards.consumable = null;
        },
        full: freeConsumableSlots(run) === 0 ? 'Emplacements de fioles pleins.' : null,
      });
    }
    rewards.relics.forEach((id, i) => rows.push({
      id,
      take: () => {
        if (!addRelic(run, id)) return;
        rewards.relics.splice(i, 1);
      },
      full: freeRelicSlots(run) === 0 ? 'Emplacements de reliques pleins.' : null,
    }));
    if (rewards.bossRelicChoices) {
      rows.push({ iconName: 'relic', tint: '#A93B89', label: 'Relique de boss', note: 'Le choix entre 3 reliques de boss arrive au jalon 3.' });
    }

    const buttons = [];
    let y = 66;
    for (const row of rows) {
      const info = row.id ? itemInfo(row.id) : null;
      const isVial = row.id && getContent().consumableById[row.id];
      this.add.rectangle(px + 12, y, pw - 24, 36, C.panelAlt, 0.7).setOrigin(0);
      icon(this, px + 26, y + 18, row.iconName ?? (isVial ? 'vial' : 'relic'), { tint: row.tint ?? (row.id ? itemTint(row.id) : null), scale: 2 });
      text(this, px + 44, y + 4, info?.name ?? row.label, { size: 8, color: C.gold });
      text(this, px + 44, y + 15, row.full ?? info?.description ?? row.note, {
        size: 8, color: row.full ? C.badText : C.ink, width: row.take ? pw - 130 : pw - 60,
      });
      if (row.take) {
        const b = button(this, px + pw - 74, y + 8, 58, 20, 'Prendre', () => {
          row.take();
          saveRun(run);
          this.draw();
        });
        if (row.full) {
          b.setEnabled(false);
          b.setState('dim');
        }
        buttons.push(b);
      }
      y += 40;
    }

    const cont = button(this, W / 2 - 60, 214, 120, 22, 'Continuer', () => this.leave());
    buttons.push(cont);
    menuNav(this, buttons, { start: buttons.length - 1 });
  }

  leave() {
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
