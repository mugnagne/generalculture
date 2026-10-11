/**
 * NodeScene — Événements (jalon 4). Pour l'instant, un simple écran de passage qui valide la case.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar } from '../topbar.js';
import { loadRun, saveRun } from '../core/run.js';
import { completeNode } from '../core/flow.js';
import { NODE_LABELS } from './MapScene.js';

const W = 480;
const H = 270;

export class NodeScene extends Phaser.Scene {
  constructor() {
    super('node');
  }

  init(data = {}) {
    this.kind = data.kind;
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) return this.scene.start('title');
    this.run = run;
    const kind = this.kind ?? run.resume.data?.kind ?? 'event';

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.82).setOrigin(0);
    drawTopBar(this, run);
    panel(this, W / 2 - 130, 60, 260, 140);
    icon(this, W / 2, 92, kind, { scale: 3 });
    text(this, W / 2, 116, NODE_LABELS[kind] ?? kind, { size: 16, color: C.gold }).setOrigin(0.5, 0);
    text(this, W / 2, 138, `Les événements arrivent au jalon 4.\nLe Maréchal poursuit sa route.`,
      { size: 8, color: C.muted, align: 'center' }).setOrigin(0.5, 0);
    const b = button(this, W / 2 - 60, 170, 120, 20, 'Continuer', () => this.leave());
    menuNav(this, [b]);
  }

  leave() {
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
