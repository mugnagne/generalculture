/**
 * EventScene — Événement d'une case « ? » : un texte, 2 ou 3 choix, puis leurs suites
 * (question du Sphinx ou du Tripot, relique à prendre ou à choisir, fiole à échanger)
 * et un récapitulatif de ce qui a changé. Tout le contenu vient de src/data/events.json.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar, itemInfo, itemTint } from '../topbar.js';
import { acquireRelic } from '../overlays.js';
import { openPause } from './PauseScene.js';
import { music, sfx } from '../audio.js';
import { getContent, itemDef } from '../core/content.js';
import { loadRun, saveRun, hooksFor, contextFor } from '../core/run.js';
import { completeNode } from '../core/flow.js';
import {
  eventDef, choiceAvailable, chooseOption, nextAction, doneAction, quizSettings, resolveEventQuiz, tradeConsumable,
} from '../core/events.js';
import { drawQuestion } from '../questions.js';

const W = 480;
const H = 270;
const PX = 50;
const PW = 380;

export class EventScene extends Phaser.Scene {
  constructor() {
    super('event');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run) return this.scene.start('title');
    if (!run.event) return this.scene.start('map');
    this.run = run;
    this.state = 'idle';
    music(this, 'musique-carte');
    this.events.on('pause', () => this.quizLayer?.forEach((o) => o.setVisible(false)));
    this.events.on('resume', () => this.quizLayer?.forEach((o) => o.setVisible(true)));
    this.draw();
  }

  /** Fond, barre du haut, cadre et titre ; renvoie l'ordonnée sous le texte de l'événement. */
  frame(withText = true) {
    this.children.removeAll(true);
    this.input.keyboard.removeAllListeners('keydown');
    this.input.keyboard.on('keydown', (e) => {
      if (this.state === 'asking' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) openPause(this);
    });
    this.quizLayer = null;
    const { run } = this;
    const ev = eventDef(run);
    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.86).setOrigin(0);
    this.topbar = drawTopBar(this, run, { onChange: () => { if (this.state !== 'asking') this.draw(); } });
    panel(this, PX, 24, PW, 240);
    icon(this, PX + 20, 42, 'event', { scale: 2 });
    text(this, PX + 36, 33, ev.title, { size: 16, color: C.gold });
    if (!withText) return 58;
    const t = text(this, PX + 14, 60, ev.text, { size: 8, color: C.ink, width: PW - 28 });
    return 60 + t.height + 10;
  }

  /** Aiguillage : choix, action en attente, ou récapitulatif. */
  draw() {
    const { run } = this;
    this.state = 'idle';
    if (run.over) return this.drawEnd();
    if (run.event.choice === null) return this.drawChoices();
    const action = nextAction(run);
    if (!action) return this.drawResult();
    if (action.type === 'quiz') return this.drawQuiz(action);
    if (action.type === 'gainRelic') return this.drawGainRelic(action);
    if (action.type === 'chooseRelic') return this.drawChooseRelic(action);
    if (action.type === 'trade') return this.drawTrade(action);
    doneAction(run); // action inconnue : ignorée
    return this.draw();
  }

  drawChoices() {
    const { run } = this;
    let y = this.frame();
    const buttons = [];
    eventDef(run).choices.forEach((choice, i) => {
      const can = choiceAvailable(run, choice);
      const b = button(this, PX + 14, y, PW - 28, 20, choice.label, () => this.choose(i));
      if (!can.ok) {
        b.setEnabled(false);
        b.setState('dim');
        text(this, PX + PW - 20, y + 6, can.reason, { size: 8, color: C.badText }).setOrigin(1, 0);
      }
      buttons.push(b);
      y += 26;
    });
    menuNav(this, buttons, { start: buttons.findIndex((b) => b.enabled) });
  }

  choose(i) {
    const { run } = this;
    run.event.before = this.snapshot();
    if (!chooseOption(run, i)) return;
    saveRun(run);
    this.draw();
  }

  snapshot() {
    const { run } = this;
    return {
      hp: run.hp, maxHp: run.maxHp, gold: run.gold, damage: run.bonuses.damage,
      relics: run.relics.map((r) => r.id), consumables: run.consumables.filter(Boolean),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Question (Sphinx, Tripot)                                          */
  /* ------------------------------------------------------------------ */

  async drawQuiz(action) {
    const { run } = this;
    const y = this.frame(false);
    const header = action.stake ? `Mise : ${action.stake} or. Juste : +${action.stake} ; faux : -${action.stake}.`
      : 'Une question, et la réponse décide de la suite.';
    text(this, PX + 14, y, header, { size: 8, color: C.muted, width: PW - 28 });
    const qText = text(this, PX + 14, y + 16, 'La question arrive…', { size: 8, color: C.ink, width: PW - 28 });

    // La question tirée est gardée : recharger la page repose la même
    if (!run.event.quiz) {
      try {
        const { theme, difficulty } = quizSettings(run, action);
        run.event.quiz = await drawQuestion(run, { theme, difficulty });
        saveRun(run);
      } catch (err) {
        if (!this.sys.isActive()) return;
        qText.setText(`Impossible de charger la question : ${err.message}`);
        button(this, W / 2 - 40, 200, 80, 20, 'Réessayer', () => this.draw());
        return;
      }
      if (!this.sys.isActive() && !this.sys.isPaused()) return;
    }
    const q = run.event.quiz;
    qText.setText(`[${getContent().regionByCategory[q.theme].theme}] ${q.question}`);
    this.timerBar = this.add.rectangle(PX + 14, y + 52, PW - 28, 3, C.timer).setOrigin(0);
    this.timerLabel = text(this, PX + PW - 14, y + 57, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.answerButtons = q.reponses.map((rep, i) => {
      const b = button(this, PX + 14 + (i % 2) * ((PW - 34) / 2 + 6), y + 72 + Math.floor(i / 2) * 26, (PW - 34) / 2, 22, rep,
        () => this.answer(action, i), { key: String(i + 1) });
      b.value = rep;
      return b;
    });
    this.quizLayer = [qText, ...this.answerButtons];
    this.input.keyboard.on('keydown', (e) => {
      const i = '1234'.indexOf(e.key);
      if (i >= 0 && this.state === 'asking' && this.answerButtons[i]) this.answer(action, i);
    });
    const base = getContent().balance.timer.baseSeconds;
    this.timerTotal = Math.max(3, hooksFor(run).modify('modifyTimer', base, contextFor(run, { question: q }))) * 1000;
    this.timeLeft = this.timerTotal;
    this.currentAction = action;
    this.state = 'asking';
  }

  update(_t, delta) {
    if (this.state !== 'asking') return;
    this.timeLeft = Math.max(0, this.timeLeft - delta);
    const frac = this.timeLeft / this.timerTotal;
    this.timerBar.width = (PW - 28) * frac;
    this.timerBar.fillColor = frac > 0.5 ? C.timer : frac > 0.25 ? C.warn : C.bad;
    this.timerLabel.setText(`${Math.ceil(this.timeLeft / 1000)} s`);
    if (this.timeLeft <= 0) this.answer(this.currentAction, null);
  }

  answer(action, index) {
    if (this.state !== 'asking') return;
    this.state = 'answered';
    const { run } = this;
    const q = run.event.quiz;
    const choice = index === null ? null : q.reponses[index];
    const correct = choice === q.bonne_reponse;
    resolveEventQuiz(run, action, q, correct);
    saveRun(run);
    sfx(this, correct ? 'bonne' : 'mauvaise');
    this.answerButtons.forEach((b) => {
      b.setEnabled(false);
      b.setState(b.value === q.bonne_reponse ? 'good' : b.value === choice ? 'bad' : 'dim');
    });
    this.timerLabel.setText('');
    const msg = correct ? 'Bonne réponse !' : `${index === null ? 'Temps écoulé !' : 'Mauvaise réponse !'} La bonne réponse : ${q.bonne_reponse}`;
    text(this, W / 2, 210, msg, { size: 8, color: correct ? C.goodText : C.badText, align: 'center', width: PW - 28 }).setOrigin(0.5, 0);
    this.topbar.refresh();
    const b = button(this, W / 2 - 50, 236, 100, 20, 'Continuer', () => this.draw());
    menuNav(this, [b]);
  }

  /* ------------------------------------------------------------------ */
  /*  Reliques et fioles                                                 */
  /* ------------------------------------------------------------------ */

  relicRow(y, id) {
    const info = itemInfo(id);
    this.add.rectangle(PX + 12, y, PW - 24, 38, C.panelAlt, 0.7).setOrigin(0);
    icon(this, PX + 26, y + 19, 'relic', { tint: itemTint(id), scale: 2 });
    text(this, PX + 44, y + 3, info.name, { size: 8, color: C.gold });
    text(this, PX + 44, y + 13, info.description, { size: 8, color: C.ink, width: PW - 140 });
  }

  drawGainRelic(action) {
    const y = this.frame(false);
    text(this, PX + 14, y, 'Une relique vous revient :', { size: 8, color: C.muted });
    this.relicRow(y + 14, action.id);
    const take = button(this, PX + PW - 84, y + 23, 64, 20, 'Prendre', () => acquireRelic(this, this.run, action.id, () => this.next()));
    const leave = button(this, W / 2 - 50, 236, 100, 20, 'La laisser', () => this.next());
    menuNav(this, [take, leave]);
  }

  drawChooseRelic(action) {
    const y = this.frame(false);
    text(this, PX + 14, y, 'Choisissez une relique :', { size: 8, color: C.muted });
    const buttons = action.options.map((id, i) => {
      this.relicRow(y + 14 + i * 42, id);
      return button(this, PX + PW - 84, y + 23 + i * 42, 64, 20, 'Choisir', () => acquireRelic(this, this.run, id, () => this.next()));
    });
    buttons.push(button(this, W / 2 - 50, 240, 100, 18, 'Aucune', () => this.next()));
    menuNav(this, buttons);
  }

  drawTrade(action) {
    const { run } = this;
    const y = this.frame(false);
    text(this, PX + 14, y, `Quelle fiole donner ? Vous en recevrez ${action.receive} au hasard (selon la place).`,
      { size: 8, color: C.muted, width: PW - 28 });
    const buttons = [];
    run.consumables.forEach((id, slot) => {
      if (!id) return;
      const by = y + 20 + buttons.length * 26;
      icon(this, PX + 24, by + 10, 'vial', { tint: itemTint(id) });
      buttons.push(button(this, PX + 34, by, PW - 48, 20, itemDef(id).name, () => {
        tradeConsumable(run, action, slot);
        saveRun(run);
        this.draw();
      }));
    });
    menuNav(this, buttons);
  }

  next() {
    doneAction(this.run);
    saveRun(this.run);
    this.draw();
  }

  /* ------------------------------------------------------------------ */
  /*  Fin                                                                */
  /* ------------------------------------------------------------------ */

  /** Ce qui a changé depuis le choix. */
  changes() {
    const { run } = this;
    const b = run.event.before;
    if (!b) return [];
    const lines = [];
    const delta = (label, before, after) => {
      const d = after - before;
      if (d) lines.push([`${d > 0 ? '+' : ''}${d} ${label}`, d > 0]);
    };
    delta('PV', b.hp, run.hp);
    delta('PV max', b.maxHp, run.maxHp);
    delta('or', b.gold, run.gold);
    delta('dégât permanent', b.damage, run.bonuses.damage);
    run.relics.filter((r) => !b.relics.includes(r.id)).forEach((r) => lines.push([`Relique : ${itemDef(r.id).name}`, true]));
    b.relics.filter((id) => !run.relics.some((r) => r.id === id)).forEach((id) => lines.push([`Relique perdue : ${itemDef(id).name}`, false]));
    const now = run.consumables.filter(Boolean);
    const lost = [...b.consumables];
    const gained = [];
    for (const id of now) {
      const i = lost.indexOf(id);
      if (i >= 0) lost.splice(i, 1);
      else gained.push(id);
    }
    gained.forEach((id) => lines.push([`Fiole : ${itemDef(id).name}`, true]));
    lost.forEach((id) => lines.push([`Fiole donnée : ${itemDef(id).name}`, false]));
    return lines;
  }

  drawResult() {
    let y = this.frame();
    const lines = this.changes();
    if (!lines.length) lines.push(['Rien ne change. Le Maréchal reprend la route.', null]);
    for (const [l, good] of lines) {
      text(this, W / 2, y, l, { size: 8, color: good === null ? C.muted : good ? C.goodText : C.badText }).setOrigin(0.5, 0);
      y += 12;
    }
    const b = button(this, W / 2 - 50, 236, 100, 20, 'Continuer', () => this.leave());
    menuNav(this, [b]);
  }

  drawEnd() {
    let y = this.frame();
    for (const [l, good] of this.changes()) {
      text(this, W / 2, y, l, { size: 8, color: good ? C.goodText : C.badText }).setOrigin(0.5, 0);
      y += 12;
    }
    text(this, W / 2, y + 6, 'Le Maréchal ne se relèvera pas.', { size: 8, color: C.badText }).setOrigin(0.5, 0);
    const b = button(this, W / 2 - 60, 236, 120, 20, 'Bilan de la partie', () => goTo(this, 'summary'));
    menuNav(this, [b]);
  }

  leave() {
    if (this.leaving) return;
    const next = completeNode(this.run);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
