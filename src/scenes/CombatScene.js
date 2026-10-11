/**
 * CombatScene — Affichage d'un combat du rogue-lite (le moteur est dans core/combat.js).
 *
 * Avant chaque question, l'ennemi annonce son intention (dégâts en cas d'erreur, capacités).
 * Bonne réponse : le héros frappe. Erreur ou temps écoulé : l'ennemi frappe.
 * La partie est sauvegardée dès qu'une réponse est jugée, avant les animations.
 */
import { Fighter } from '../fighter.js';
import { drawQuestion } from '../questions.js';
import { fitCamera } from '../display.js';
import { text, panel, button, hpBar, C } from '../ui.js';
import { icon } from '../icons.js';
import { drawTopBar, TOPBAR_H } from '../topbar.js';
import { ensureVariant } from '../variants.js';
import { preloadBackdrop, drawBackdrop } from '../backdrop.js';
import { openPause } from './PauseScene.js';
import { fadeIn, goTo } from '../transition.js';
import { sfx, music, toggleMute } from '../audio.js';
import { getContent, itemDef } from '../core/content.js';
import { loadRun, saveRun } from '../core/run.js';
import { intent, questionDifficulty, startQuestion, resolveAnswer, finishCombat, nextQuestionTheme } from '../core/combat.js';
import { endRun, completeNode } from '../core/flow.js';
import { canUseConsumable, useConsumable } from '../core/items.js';
import { themePicker } from '../overlays.js';

const W = 480;
const HERO_X = 130;
const ENEMY_X = 350;
const SIZE = { soldier: 1, elite: 1.15, boss: 1.75 }; // boss 1,5 à 2 fois la taille du héros
const KIND_LABEL = { soldier: 'Combat', elite: 'Élite', boss: 'Boss' };

/** Phrase de victoire, accordée d'après les données de la région. */
export function defeatLine(def, kind) {
  if (kind !== 'soldier') return `${def.name} est ${def.feminine ? 'vaincue' : 'vaincu'}.`;
  return def.singular ? `${def.singular} ${def.name} est en déroute.` : `Les ${def.name} sont en déroute.`;
}

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('combat');
  }

  init() {
    this.run = loadRun();
    this.cb = this.run?.combat ?? null;
    this.manifest = this.registry.get('manifest');
    this.state = 'loading';
    this.endButtons = null;
    if (!this.cb) return;
    const c = getContent();
    this.region = c.regionById[this.cb.regionId];
    this.enemyDef = this.cb.kind === 'soldier' ? this.region.soldiers : this.cb.kind === 'elite' ? this.region.knight : this.region.boss;
  }

  preload() {
    if (this.cb) preloadBackdrop(this, this.region);
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    if (!this.run) return this.scene.start('title');
    if (!this.cb || this.cb.over) return this.scene.start(this.run.resume.scene === 'combat' ? 'map' : this.run.resume.scene);
    const c = getContent();
    const { cb } = this;
    music(this, cb.kind === 'boss' ? 'musique-boss' : 'musique-combat');

    this.groundY = drawBackdrop(this, this.region, { combat: true });
    const character = c.characters.find((ch) => ch.id === this.run.characterId);
    const heroH = this.manifest.characters[character.sprite].body.height;
    const enemyH = Math.round(heroH * SIZE[cb.kind]);
    this.add.ellipse(HERO_X, this.groundY, 44, 7, 0x000000, 0.35);
    this.add.ellipse(ENEMY_X, this.groundY, cb.kind === 'boss' ? 74 : 44, 8, 0x000000, 0.35);
    this.hero = new Fighter(this, this.manifest, character.sprite, { x: HERO_X, groundY: this.groundY, height: heroH, faceLeft: false });
    this.enemy = new Fighter(this, this.manifest, this.enemySprite(), {
      x: ENEMY_X, groundY: this.groundY, height: enemyH, faceLeft: true, attackAnim: this.enemyDef.attack ?? 'attack',
    });
    this.enemyTop = this.groundY - enemyH;

    this.topbar = drawTopBar(this, this.run, {
      where: () => ({ inCombat: true, hasQuestion: this.state === 'asking' }),
      onUse: (slot) => this.useItem(slot),
    });
    this.drawHud();
    this.drawIntent();
    this.drawCard();
    this.drawPauseButton();
    this.buffText = text(this, 6, TOPBAR_H + 24, '', { size: 8, color: C.gold }).setShadow(1, 1, '#0E071B', 0, false, true);
    this.refreshBuffs();
    this.bindKeys();
    this.next();
  }

  /** Soldats et chevaliers aux couleurs de leur maison ; le Ver des sables couleur sable. */
  enemySprite() {
    const { sprite } = this.enemyDef;
    if (this.cb.kind !== 'boss') return ensureVariant(this, this.manifest, sprite, this.region.id, this.region.house.colors);
    if (sprite === 'fire-worm') return ensureVariant(this, this.manifest, sprite, 'sable', []);
    return sprite;
  }

  /* ------------------------------------------------------------------ */
  /*  Interface                                                          */
  /* ------------------------------------------------------------------ */

  drawHud() {
    const c = getContent();
    const { cb } = this;
    const y = TOPBAR_H + 3;
    const tint = Phaser.Display.Color.HexStringToColor(this.region.house.colors[1]).color;
    const w = Math.max(150, cb.enemy.maxHp * 11 + 20);
    panel(this, W - w - 4, y, w, 26, { border: 'plain', tint });
    text(this, W - 10, y + 3, this.enemyDef.name, { size: 8, color: C.ink }).setOrigin(1, 0);
    this.enemyBar = hpBar(this, W - 10, y + 16, cb.enemy.maxHp, { color: C.good, alignRight: true });
    this.enemyBar.set(cb.enemy.hp);

    // Bandeau central : thème et type de combat
    this.add.rectangle(W / 2, y, 150, 22, C.shadow, 0.6).setOrigin(0.5, 0);
    text(this, W / 2, y + 2, c.regionByCategory[cb.theme].theme, { size: 8, color: C.ink })
      .setOrigin(0.5, 0).setShadow(1, 1, '#0E071B', 0, false, true);
    text(this, W / 2, y + 11, `${KIND_LABEL[cb.kind]} · Acte ${cb.act}`, { size: 8, color: cb.kind === 'soldier' ? C.muted : C.gold })
      .setOrigin(0.5, 0).setShadow(1, 1, '#0E071B', 0, false, true);

    // Message de résultat (bonne / mauvaise réponse), sur un bandeau sombre
    this.feedbackBg = this.add.rectangle(W / 2, y + 26, 300, 14, C.shadow, 0.8).setOrigin(0.5, 0).setVisible(false);
    this.feedback = text(this, W / 2, y + 29, '', { size: 8, align: 'center', width: 288 }).setOrigin(0.5, 0);
  }

  /** Bulle d'intention au-dessus de l'ennemi : dégâts annoncés et capacités. */
  drawIntent() {
    this.intentBox = this.add.container(ENEMY_X, Math.max(TOPBAR_H + 56, this.enemyTop - 8));
    this.refreshIntent();
  }

  refreshIntent() {
    const box = this.intentBox;
    box.removeAll(true);
    const it = intent(this.run);
    const w = 34 + it.effects.length * 12;
    box.add(this.add.rectangle(0, 0, w, 14, C.shadow, 0.85).setStrokeStyle(1, C.bad));
    box.add(icon(this, -w / 2 + 8, 0, 'sword'));
    box.add(text(this, -w / 2 + 15, -6, String(it.damage), { size: 8, color: C.badText }));
    it.effects.forEach((e, i) => box.add(icon(this, -w / 2 + 31 + i * 12, 0, e.id)));
    // Survol : détail de l'intention
    const zone = this.add.zone(0, 0, w, 14).setInteractive();
    box.add(zone);
    zone.on('pointerover', () => this.topbar.tip.show(ENEMY_X, box.y + 9, {
      name: 'Intention',
      kind: null,
      description: [`Erreur ou temps écoulé : ${it.damage} dégât${it.damage > 1 ? 's' : ''}.`,
        ...it.effects.map((e) => `${e.name} : ${e.text}.`)].join('\n'),
    }));
    zone.on('pointerout', () => this.topbar.tip.hide());
  }

  drawCard() {
    this.card = panel(this, 4, 166, W - 8, 100);
    this.timerBack = this.add.rectangle(12, 172, W - 24, 3, C.shadow).setOrigin(0);
    this.timerBar = this.add.rectangle(12, 172, W - 24, 3, C.timer).setOrigin(0);
    this.timerLabel = text(this, W - 12, 177, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.questionText = text(this, 12, 178, '', { size: 8, width: W - 88 });
    this.mist = text(this, W / 2, 232, '', { size: 8, color: C.muted, align: 'center' }).setOrigin(0.5);

    this.answerButtons = [];
    const bw = (W - 30) / 2;
    for (let i = 0; i < 4; i++) {
      const x = 12 + (i % 2) * (bw + 6);
      const y = 214 + Math.floor(i / 2) * 25;
      const b = button(this, x, y, bw, 22, '', () => this.answer(i), { key: String(i + 1) });
      b.setVisible(false);
      this.answerButtons.push(b);
    }
    this.nextButton = button(this, W - 72, 177, 60, 18, 'Suivant', () => this.next());
    this.nextButton.setVisible(false);
  }

  /**
   * Pause : fige le chrono (update() ne tourne plus) et masque la question et les réponses.
   */
  drawPauseButton() {
    this.pauseButton = button(this, 6, TOPBAR_H + 4, 40, 16, 'Pause', () => openPause(this));
    this.questionLayer = [this.questionText, ...this.answerButtons, this.feedback, this.feedbackBg, this.mist];
    this.events.on('pause', () => {
      this.hiddenByPause = this.questionLayer.map((o) => o.visible);
      this.questionLayer.forEach((o) => o.setVisible(false));
    });
    this.events.on('resume', () => {
      this.questionLayer.forEach((o, i) => o.setVisible(this.hiddenByPause?.[i] ?? o.visible));
    });
  }

  bindKeys() {
    this.input.keyboard.on('keydown', (e) => {
      if (this.state === 'asking') {
        const i = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
        if (i >= 0 && this.answerButtons[i].visible) this.answer(i);
      } else if (this.state === 'answered' && (e.key === 'Enter' || e.key === ' ')) {
        this.next();
      } else if (this.state === 'ended' && e.key === 'Enter') {
        this.endButtons?.[0]?.press();
      }
      if (e.key === 'm' || e.key === 'M') toggleMute(this.game);
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && this.state !== 'ended') openPause(this);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Questions                                                          */
  /* ------------------------------------------------------------------ */

  async next() {
    if (this.state === 'ended') return;
    this.state = 'loading';
    this.nextButton.setVisible(false);
    this.retryButton?.destroy();
    this.feedback.setText('');
    this.feedbackBg.setVisible(false);
    this.answerButtons.forEach((b) => b.setVisible(false));
    this.timerBar.width = W - 24;
    this.timerLabel.setText('');
    this.questionText.setText('Les éclaireurs rapportent la question…');

    const theme = nextQuestionTheme(this.run);
    const q = await this.fetchQuestion(theme, () => this.next());
    if (!q) return;

    const hpBefore = this.cb.enemy.hp;
    const { timerSeconds, answerDelay } = startQuestion(this.run, q);
    if (this.cb.enemy.hp > hpBefore) {
      this.enemyBar.set(this.cb.enemy.hp);
      this.float(ENEMY_X, this.enemyTop - 18, `+${this.cb.enemy.hp - hpBefore} PV`, C.goodText);
    }
    this.refreshIntent();
    this.show(q, timerSeconds, answerDelay);
  }

  /** Tire une question (null si l'API échoue : bouton Réessayer). */
  async fetchQuestion(theme, retry) {
    try {
      const q = await drawQuestion(this.run, { theme, difficulty: questionDifficulty(this.run) });
      if (!this.sys.isActive() && !this.sys.isPaused()) return null; // scène quittée pendant le chargement
      return q;
    } catch (err) {
      if (!this.sys.isActive()) return null;
      this.questionText.setText(`Impossible de charger la question : ${err.message}`);
      this.retryButton = button(this, W / 2 - 40, 226, 80, 20, 'Réessayer', retry);
      return null;
    }
  }

  /** Affiche une question et lance le chrono. */
  show(q, timerSeconds, answerDelay) {
    this.current = q;
    this.clearVotes();
    this.questionText.setText(q.theme === this.cb.theme ? q.question : `[${getContent().regionByCategory[q.theme].theme}] ${q.question}`);
    this.answerButtons.forEach((b, i) => {
      const rep = q.reponses[i];
      b.setVisible(false);
      if (rep === undefined) return;
      b.label.setText(rep);
      b.value = rep;
      b.removed = false;
      b.setState('idle');
      b.setEnabled(true);
    });
    // Brume : réponses cachées quelques secondes (le chrono tourne déjà)
    this.answerDelayMs = answerDelay * 1000;
    this.answersShown = false;
    if (this.answerDelayMs > 0) this.mist.setText('La brume masque les réponses…').setVisible(true);
    else this.showAnswers();

    // Temps restant décompté avec le delta des images : figé pendant la pause.
    this.timerTotal = timerSeconds * 1000;
    this.timeLeft = this.timerTotal;
    this.state = 'asking';
  }

  showAnswers() {
    this.answersShown = true;
    this.mist.setText('').setVisible(false);
    this.answerButtons.forEach((b, i) => b.setVisible(this.current.reponses[i] !== undefined));
  }

  update(_time, delta) {
    if (this.state !== 'asking') return;
    this.timeLeft = Math.max(0, this.timeLeft - delta);
    if (!this.answersShown && this.timerTotal - this.timeLeft >= this.answerDelayMs) this.showAnswers();
    const frac = Math.min(1, this.timeLeft / this.timerTotal);
    this.timerBar.width = (W - 24) * frac;
    this.timerBar.fillColor = frac > 0.5 ? C.timer : frac > 0.25 ? C.warn : C.bad;
    this.timerLabel.setText(`${Math.ceil(this.timeLeft / 1000)} s`);
    if (this.timeLeft <= 0) this.answer(null);
  }

  /** Retire des réponses (50/50, Seconde chance) : boutons grisés et inactifs. */
  removeAnswers(values) {
    for (const b of this.answerButtons) {
      if (!values.includes(b.value)) continue;
      b.removed = true;
      b.setEnabled(false);
      b.setState('dim');
      this.voteTexts?.get(b.value)?.destroy();
    }
  }

  clearVotes() {
    this.voteTexts?.forEach((t) => t.destroy());
    this.voteTexts = new Map();
  }

  async answer(index) {
    if (this.state !== 'asking') return;
    if (index !== null && (!this.answersShown || this.answerButtons[index].removed)) return;
    this.state = 'resolving';
    if (!this.answersShown) this.showAnswers();
    const q = this.current;
    const choice = index === null ? null : this.answerButtons[index].value;
    const correct = choice === q.bonne_reponse;
    const outcome = correct ? 'correct' : index === null ? 'timeout' : 'wrong';
    const elapsed = this.timerTotal - this.timeLeft;

    // Jugement et sauvegarde immédiats : recharger la page ne change rien au résultat
    const res = resolveAnswer(this.run, q, outcome, elapsed, choice);
    if (res.retry) {
      // Seconde chance : même question, réponses en moins, le chrono continue
      saveRun(this.run);
      this.removeAnswers(res.removed);
      this.say('Seconde chance ! Deux réponses en moins, réessayez.', C.gold);
      this.state = 'asking';
      return;
    }
    this.timerLabel.setText('');
    let rewards = null;
    if (res.heroDead) {
      finishCombat(this.run, false);
      endRun(this.run, 'defeat', {
        enemy: this.enemyDef.name, kind: this.cb.kind, theme: this.cb.theme, act: this.cb.act, floor: this.run.floor,
      });
    } else if (res.enemyDead) {
      rewards = finishCombat(this.run, true);
      this.run.resume = { scene: 'reward', data: {} };
    }
    saveRun(this.run);

    this.answerButtons.forEach((b) => {
      b.setEnabled(false);
      if (b.value === q.bonne_reponse) b.setState('good');
      else if (b.value === choice) b.setState('bad');
      else b.setState('dim');
    });

    sfx(this, correct ? 'bonne' : 'mauvaise');
    if (correct) {
      this.say(`Bonne réponse ! ${res.dealt} dégât${res.dealt > 1 ? 's' : ''}.`, C.goodText);
      await this.hero.attack(this.enemy);
      this.enemyBar.set(this.cb.enemy.hp);
      this.float(ENEMY_X, this.enemyTop - 18, `-${res.dealt}`, C.badText);
    } else {
      this.say(`${index === null ? 'Temps écoulé !' : 'Mauvaise réponse !'} La bonne réponse : ${q.bonne_reponse}`, C.badText);
      await this.enemy.attack(this.hero);
      this.float(HERO_X, this.groundY - 70, res.taken ? `-${res.taken}` : 'Paré !', res.taken ? C.badText : C.gold);
      if (res.revived) {
        this.say(`${itemDef(res.revived).name} : le Maréchal se relève !`, C.gold);
        this.float(HERO_X, this.groundY - 90, `${this.run.hp} PV`, C.goodText);
      }
    }
    this.topbar.refresh();
    this.refreshBuffs();
    if (!res.heroDead && !res.enemyDead) this.refreshIntent();
    // L'anecdote n'est affichée que si la source en fournit une.
    if (q.anecdote) this.say(`${this.feedback.text}\n${q.anecdote}`);

    if (res.heroDead) return this.finish(false);
    if (res.enemyDead) return this.finish(true, rewards);
    this.state = 'answered';
    this.nextButton.setVisible(true);
  }

  /* ------------------------------------------------------------------ */
  /*  Fioles                                                             */
  /* ------------------------------------------------------------------ */

  /** Utilisation d'une fiole (menu de la barre du haut), pendant une question ou entre deux. */
  useItem(slot) {
    if (!['asking', 'answered'].includes(this.state)) return;
    const hasQuestion = this.state === 'asking';
    if (!canUseConsumable(this.run, slot, { inCombat: true, hasQuestion }).ok) return;
    const name = itemDef(this.run.consumables[slot]).name;
    const actions = useConsumable(this.run, slot, { question: hasQuestion ? this.current : null });
    saveRun(this.run);
    this.topbar.refresh();
    this.refreshBuffs();
    this.say(`${name} !`, C.gold);
    for (const a of actions) this.applyAction(a);
  }

  applyAction(a) {
    const { run, cb } = this;
    if (a.type === 'removeAnswers') this.removeAnswers(a.answers);
    else if (a.type === 'addTime') {
      this.timeLeft += a.seconds * 1000;
      this.timerTotal = Math.max(this.timerTotal, this.timeLeft);
    } else if (a.type === 'votes') {
      this.clearVotes();
      for (const b of this.answerButtons) {
        if (!(b.value in a.votes) || b.removed) continue;
        const t = text(this, b.x + b.width - 8, b.y + b.height / 2, `${a.votes[b.value]} %`, { size: 8, color: C.gold }).setOrigin(1, 0.5);
        this.voteTexts.set(b.value, t);
      }
    } else if (a.type === 'swapQuestion') this.swapQuestion();
    else if (a.type === 'chooseTheme') {
      themePicker(this, 'Thème de la prochaine question', (theme) => {
        cb.nextTheme = theme;
        saveRun(run);
        this.say(`Prochaine question : ${getContent().regionByCategory[theme].theme}.`, C.gold);
      });
    } else if (a.type === 'damage') {
      this.enemyBar.set(cb.enemy.hp);
      this.float(ENEMY_X, this.enemyTop - 18, `-${a.amount}`, C.badText);
      if (cb.enemy.hp <= 0) {
        this.state = 'resolving';
        const rewards = finishCombat(run, true);
        run.resume = { scene: 'reward', data: {} };
        saveRun(run);
        this.finish(true, rewards);
      }
    } else if (a.type === 'flee') {
      this.state = 'ended';
      const next = completeNode(run);
      saveRun(run);
      goTo(this, next.scene, next.data);
    } else if (a.type === 'refresh') this.topbar.refresh();
  }

  /** Parchemin d'échange : nouvelle question du même thème, chrono remis à neuf. */
  async swapQuestion() {
    const theme = this.current.theme;
    this.state = 'loading';
    this.answerButtons.forEach((b) => b.setVisible(false));
    this.questionText.setText('Une autre question arrive…');
    const q = await this.fetchQuestion(theme, () => this.swapQuestion());
    if (!q) return;
    const { timerSeconds, answerDelay } = startQuestion(this.run, q, { swap: true });
    saveRun(this.run);
    this.show(q, timerSeconds, answerDelay);
  }

  /** Effets temporaires en cours (bouclier, huile…), sous le bouton Pause. */
  refreshBuffs() {
    const list = this.cb.buffs.map((b) => {
      const name = itemDef(b.id)?.name ?? b.id;
      return b.state?.charges ? `${name} (${b.state.charges})` : name;
    });
    if (this.cb.nextTheme) list.push(`Savant : ${getContent().regionByCategory[this.cb.nextTheme].short}`);
    this.buffText.setText(list.join('\n'));
  }

  /** Affiche un message sur le bandeau de résultat. */
  say(message, color) {
    if (color) this.feedback.setColor(color);
    this.feedback.setText(message);
    this.feedbackBg.setVisible(true).setSize(300, this.feedback.height + 6);
  }

  /** Chiffre flottant (dégâts, soins). */
  float(x, y, str, color) {
    const t = text(this, x, y, str, { size: 16, color }).setOrigin(0.5).setShadow(1, 1, '#0E071B', 0, false, true);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /* ------------------------------------------------------------------ */
  /*  Fin du combat                                                      */
  /* ------------------------------------------------------------------ */

  async finish(won, rewards) {
    this.state = 'ended';
    this.timerBar.width = 0;
    this.timerLabel.setText('');
    this.intentBox.setVisible(false);
    this.pauseButton.setVisible(false);
    sfx(this, won ? 'victoire' : 'defaite');
    if (won) await this.enemy.die();
    else await this.hero.die();
    this.topbar.refresh();

    const w = 260;
    const h = 92;
    const x = (W - w) / 2;
    const y = 64;
    this.add.rectangle(0, 0, W, 270, 0x0e071b, 0.45).setOrigin(0);
    panel(this, x, y, w, h);
    text(this, W / 2, y + 10, won ? 'Victoire !' : 'Défaite…', { size: 16, color: won ? C.gold : C.badText }).setOrigin(0.5, 0);
    const msg = won
      ? `${defeatLine(this.enemyDef, this.cb.kind)}\n+${rewards.gold} pièces d’or.`
      : 'Le Maréchal tombe au combat. La reconquête s’arrête ici.';
    text(this, W / 2, y + 32, msg, { size: 8, width: w - 24, align: 'center' }).setOrigin(0.5, 0);

    const [label, scene] = won ? ['Récompenses', 'reward'] : ['Bilan de la partie', 'summary'];
    this.endButtons = [button(this, W / 2 - 60, y + h - 28, 120, 20, label, () => goTo(this, scene))];
  }
}
