/**
 * RestScene — Feu de camp : se reposer (soin d'une part des PV max) ou étudier
 * (+1 dégât permanent sur un thème). Un seul choix, puis retour à la carte.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar } from '../topbar.js';
import { themePicker } from '../overlays.js';
import { music } from '../audio.js';
import { getContent } from '../core/content.js';
import { loadRun, saveRun } from '../core/run.js';
import { restOptions, rest, study } from '../core/places.js';
import { completeNode } from '../core/flow.js';

const W = 480;
const H = 270;

export class RestScene extends Phaser.Scene {
  constructor() {
    super('rest');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) return this.scene.start('title');
    this.run = run;
    music(this, 'musique-carte');
    this.draw();
  }

  draw() {
    this.children.removeAll(true);
    this.input.keyboard.removeAllListeners('keydown');
    const { run } = this;
    const c = getContent();
    const opt = restOptions(run);
    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.86).setOrigin(0);
    this.topbar = drawTopBar(this, run, { onChange: () => this.draw() });

    panel(this, W / 2 - 150, 30, 300, 222);
    icon(this, W / 2, 62, 'rest', { scale: 4 });
    text(this, W / 2, 88, 'Feu de camp', { size: 16, color: C.gold }).setOrigin(0.5, 0);
    text(this, W / 2, 108, 'Le Maréchal fait halte. Une seule action avant de repartir.', { size: 8, color: C.muted }).setOrigin(0.5, 0);

    const restLabel = opt.canRest ? `Se reposer (+${opt.healAmount} PV)` : 'Se reposer (impossible)';
    const restB = button(this, W / 2 - 130, 128, 260, 22, restLabel, () => this.doRest());
    if (!opt.canRest || run.hp >= run.maxHp) {
      restB.setEnabled(false);
      restB.setState('dim');
    }
    const note = !opt.canRest ? 'La Couronne de l’Usurpateur interdit le repos.' : run.hp >= run.maxHp ? 'PV déjà au maximum.' : '';
    if (note) text(this, W / 2, 152, note, { size: 8, color: C.badText }).setOrigin(0.5, 0);

    const studyB = button(this, W / 2 - 130, 166, 260, 22, `Étudier (+${opt.studyDamage} dégât permanent sur un thème)`, () => this.doStudy());
    const studied = Object.entries(run.bonuses.themeDamage).filter(([, v]) => v > 0)
      .map(([t, v]) => `${c.regionByCategory[t]?.short ?? t} +${v}`);
    if (studied.length) text(this, W / 2, 192, `Études : ${studied.join(' · ')}`, { size: 8, color: C.muted, align: 'center', width: 280 }).setOrigin(0.5, 0);

    const leave = button(this, W / 2 - 60, 222, 120, 20, 'Repartir sans rien faire', () => this.leave());
    menuNav(this, [restB, studyB, leave], { start: opt.canRest && run.hp < run.maxHp ? 0 : 1 });
  }

  doRest() {
    rest(this.run);
    this.leave();
  }

  doStudy() {
    const bonus = this.run.bonuses.themeDamage;
    themePicker(this, 'Étudier quel thème ?', (theme) => {
      study(this.run, theme);
      this.leave();
    }, { onCancel: () => {}, extra: (t) => (bonus[t] ? ` (+${bonus[t]})` : '') });
  }

  leave() {
    if (this.leaving) return;
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
