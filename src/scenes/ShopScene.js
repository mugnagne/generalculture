/**
 * ShopScene — Marchand : fioles et reliques à acheter, soin payant (une fois par visite),
 * revente des reliques à moitié prix. Le stock est tiré à l'entrée et gardé dans la sauvegarde.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar, itemInfo, itemTint } from '../topbar.js';
import { acquireRelic } from '../overlays.js';
import { music, sfx } from '../audio.js';
import { getContent, itemDef } from '../core/content.js';
import { loadRun, saveRun, freeConsumableSlots, sellValue } from '../core/run.js';
import { buyConsumable, payRelic, buyHeal, shopHeal, sellRelic } from '../core/places.js';
import { completeNode } from '../core/flow.js';

const W = 480;
const H = 270;

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('shop');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) return this.scene.start('title');
    if (!run.shop) return this.scene.start('map');
    this.run = run;
    music(this, 'musique-carte');
    this.draw();
  }

  draw(message = '') {
    this.children.removeAll(true);
    this.input.keyboard.removeAllListeners('keydown');
    const { run } = this;
    const { shop } = run;
    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.86).setOrigin(0);
    this.topbar = drawTopBar(this, run, { onChange: () => this.draw() });
    const tip = this.topbar.tip;
    const buttons = [];

    // Étals : fioles puis reliques
    panel(this, 6, 22, 300, 244);
    icon(this, 24, 38, 'shop', { scale: 2 });
    text(this, 40, 31, 'Marchand', { size: 16, color: C.gold });
    text(this, 300 - 8, 36, message, { size: 8, color: C.goodText }).setOrigin(1, 0);

    const row = (y, id, price, sold, onBuy, blocked) => {
      const isVial = Boolean(getContent().consumableById[id]);
      this.add.rectangle(14, y, 284, 24, C.panelAlt, sold ? 0.3 : 0.7).setOrigin(0);
      icon(this, 26, y + 12, isVial ? 'vial' : 'relic', { tint: itemTint(id) }).setAlpha(sold ? 0.4 : 1);
      const info = itemInfo(id);
      text(this, 38, y + 3, info.name, { size: 8, color: sold ? C.muted : C.ink });
      text(this, 38, y + 13, info.kind, { size: 8, color: C.muted });
      const zone = this.add.zone(14, y, 210, 24).setOrigin(0).setInteractive();
      zone.on('pointerover', () => tip.show(150, y + 26, info));
      zone.on('pointerout', () => tip.hide());
      const b = button(this, 226, y + 3, 66, 18, sold ? 'Vendu' : `${price} or`, onBuy);
      if (sold || blocked || run.gold < price) {
        b.setEnabled(false);
        b.setState('dim');
      }
      buttons.push(b);
    };

    text(this, 14, 52, 'Fioles', { size: 8, color: C.gold });
    const fullVials = freeConsumableSlots(run) === 0;
    shop.consumables.forEach((it, i) => row(62 + i * 26, it.id, it.price, it.sold, () => {
      if (buyConsumable(run, i)) this.bought(`${itemDef(it.id).name} achetée.`);
    }, fullVials));
    text(this, 14, 142, 'Reliques', { size: 8, color: C.gold });
    shop.relics.forEach((it, i) => row(152 + i * 26, it.id, it.price, it.sold, () => this.buyRelic(i)));
    if (fullVials) text(this, 14, 234, 'Emplacements de fioles pleins.', { size: 8, color: C.badText });

    // Comptoir : soin et revente
    panel(this, 310, 22, 164, 244);
    const heal = shopHeal();
    text(this, 318, 31, 'Soins', { size: 8, color: C.gold });
    const healB = button(this, 318, 42, 148, 18, shop.healBought ? 'Déjà soigné' : `+${heal.amount} PV : ${heal.price} or`, () => {
      if (buyHeal(run)) this.bought(`+${heal.amount} PV.`);
    });
    if (shop.healBought || run.gold < heal.price || run.hp >= run.maxHp) {
      healB.setEnabled(false);
      healB.setState('dim');
    }
    buttons.push(healB);

    text(this, 318, 68, 'Revendre une relique', { size: 8, color: C.gold });
    if (!run.relics.length) text(this, 318, 80, 'Aucune relique.', { size: 8, color: C.muted });
    run.relics.forEach((r, i) => {
      const y = 80 + i * 22;
      icon(this, 324, y + 9, 'relic', { tint: itemTint(r.id) });
      const name = text(this, 332, y + 4, itemDef(r.id).name, { size: 8, color: C.ink, width: 78 });
      name.setInteractive().on('pointerover', () => tip.show(390, y + 22, itemInfo(r.id, r))).on('pointerout', () => tip.hide());
      buttons.push(button(this, 414, y + 1, 54, 18, `+${sellValue(r)}`, () => {
        const value = sellRelic(run, r);
        sfx(this, 'clic');
        saveRun(run);
        this.draw(`Vendue : +${value} or.`);
      }));
    });

    const leave = button(this, 318, 242, 148, 18, 'Quitter la boutique', () => this.leave());
    buttons.push(leave);
    menuNav(this, buttons, { start: buttons.length - 1 });
  }

  bought(message) {
    saveRun(this.run);
    this.draw(message);
  }

  /** Achat d'une relique : paiement, puis obtention (thème, emplacements pleins). Renoncer rembourse. */
  buyRelic(i) {
    const { run } = this;
    const item = run.shop.relics[i];
    if (!payRelic(run, i)) return;
    acquireRelic(this, run, item.id, (taken) => {
      if (!taken) {
        run.gold += item.price;
        item.sold = false;
      }
      this.bought(taken ? `${itemDef(item.id).name} achetée.` : '');
    });
  }

  leave() {
    if (this.leaving) return;
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
