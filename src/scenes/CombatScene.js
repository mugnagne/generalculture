/**
 * CombatScene — une bataille : le Maréchal (à gauche) contre un ennemi (à droite).
 *
 * Bonne réponse : le Maréchal attaque, l'ennemi perd 1 PV.
 * Mauvaise réponse ou temps écoulé : l'ennemi attaque, le Maréchal perd 1 PV.
 * 10 questions maximum ; PV ennemi + PV joueur = 11, l'issue est donc toujours décidée.
 */
import { Fighter } from '../fighter.js';
import { getBattleQuestions } from '../questions.js';
import { regionById, enemyFor, defeatLine, MARECHAL, MAX_QUESTIONS, TIERS } from '../data/world.js';
import { fitCamera } from '../display.js';
import { text, panel, button, hpBar, C } from '../ui.js';
import { ensureVariant } from '../variants.js';
import { recordVictory, recordDefeat } from '../save.js';

const W = 480;
const GROUND_Y = 158;
const HERO_X = 130;
const ENEMY_X = 350;
const TIMER_MS = 20000;
const BOSS_SCALE = 1.75; // boss 1,5 à 2 fois la taille du Maréchal

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('combat');
  }

  init({ regionId = 'givre', tierId = 1 } = {}) {
    this.region = regionById(regionId);
    this.enemyDef = enemyFor(this.region, tierId);
    this.tier = this.enemyDef.tier;
    this.manifest = this.registry.get('manifest');
    this.state = 'loading';
    this.qIndex = -1;
    // La scène est réutilisée d'une bataille à l'autre : on oublie les boutons de la précédente.
    this.endButtons = null;
  }

  create() {
    fitCamera(this);
    this.drawBackground();

    const heroH = this.manifest.characters[MARECHAL.sprite].body.height;
    this.hero = new Fighter(this, this.manifest, MARECHAL.sprite, { x: HERO_X, groundY: GROUND_Y, height: heroH, faceLeft: false });
    const enemyH = this.tier.role === 'boss' ? heroH * BOSS_SCALE : heroH;
    this.enemy = new Fighter(this, this.manifest, this.enemySprite(), {
      x: ENEMY_X, groundY: GROUND_Y, height: enemyH, faceLeft: true, attackAnim: this.enemyDef.attack,
    });

    this.heroHp = this.tier.playerHp;
    this.enemyHp = this.tier.enemyHp;
    this.drawHud();
    this.drawCard();
    this.bindKeys();
    this.loadQuestions();
  }

  /**
   * Soldats et chevaliers aux deux couleurs de leur maison ; les boss gardent
   * leurs couleurs, sauf le Ver des sables, recoloré couleur sable.
   */
  enemySprite() {
    const { sprite } = this.enemyDef;
    if (this.tier.role !== 'boss') return ensureVariant(this, this.manifest, sprite, this.region.id, this.region.house.colors);
    if (sprite === 'fire-worm') return ensureVariant(this, this.manifest, sprite, 'sable', []);
    return sprite;
  }

  /* ------------------------------------------------------------------ */
  /*  Décor et interface                                                 */
  /* ------------------------------------------------------------------ */

  drawBackground() {
    const key = 'bg:' + this.region.id;
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0);
    } else {
      // Décor manquant : fond uni à la couleur principale de la maison.
      this.add.rectangle(0, 0, W, 270, Phaser.Display.Color.HexStringToColor(this.region.house.colors[0]).color).setOrigin(0);
    }
    // Ombres au sol sous les combattants
    this.add.ellipse(HERO_X, GROUND_Y, 44, 7, 0x000000, 0.35);
    this.add.ellipse(ENEMY_X, GROUND_Y, this.tier.role === 'boss' ? 74 : 44, 8, 0x000000, 0.35);
  }

  drawHud() {
    panel(this, 4, 4, 150, 26, { border: 'plain', tint: 0xc42430 });
    text(this, 10, 7, MARECHAL.name, { size: 8, color: C.gold });
    this.heroBar = hpBar(this, 10, 20, this.tier.playerHp, { color: 0xc42430 });

    const tint = Phaser.Display.Color.HexStringToColor(this.region.house.colors[1]).color;
    panel(this, W - 194, 4, 190, 26, { border: 'plain', tint });
    text(this, W - 10, 7, this.enemyDef.name, { size: 8, color: C.ink }).setOrigin(1, 0);
    this.enemyBar = hpBar(this, W - 10, 20, this.tier.enemyHp, { color: C.good, alignRight: true });

    // Bandeau central : région et bataille
    text(this, W / 2, 34, this.region.name, { size: 8, color: C.ink }).setOrigin(0.5, 0).setShadow(1, 1, '#0E071B', 0, false, true);
    text(this, W / 2, 44, `Bataille ${this.tier.id}/3 · ${this.tier.label}`, { size: 8, color: C.muted })
      .setOrigin(0.5, 0).setShadow(1, 1, '#0E071B', 0, false, true);

    // Message de résultat (bonne / mauvaise réponse), sur un bandeau sombre
    this.feedbackBg = this.add.rectangle(W / 2, 58, 300, 14, C.shadow, 0.8).setOrigin(0.5, 0).setVisible(false);
    this.feedback = text(this, W / 2, 61, '', { size: 8, align: 'center', width: 288 }).setOrigin(0.5, 0);
  }

  drawCard() {
    this.card = panel(this, 4, 166, W - 8, 100);
    this.timerBack = this.add.rectangle(12, 172, W - 24, 3, C.shadow).setOrigin(0);
    this.timerBar = this.add.rectangle(12, 172, W - 24, 3, C.timer).setOrigin(0);
    this.timerLabel = text(this, W - 12, 177, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.counter = text(this, W - 34, 177, '', { size: 8, color: C.muted }).setOrigin(1, 0);
    this.questionText = text(this, 12, 178, '', { size: 8, width: W - 88 });

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
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Questions                                                          */
  /* ------------------------------------------------------------------ */

  async loadQuestions() {
    this.questionText.setText('Les éclaireurs rapportent les questions…');
    try {
      const questions = await getBattleQuestions(this.region.category, this.tier.difficulty, MAX_QUESTIONS);
      if (!this.sys.isActive()) return; // la scène a été quittée pendant le chargement
      this.questions = questions;
      this.next();
    } catch (err) {
      if (!this.sys.isActive()) return;
      this.questionText.setText(`Impossible de charger les questions : ${err.message}`);
      this.retryButton = button(this, W / 2 - 40, 226, 80, 20, 'Réessayer', () => {
        this.retryButton.destroy();
        this.loadQuestions();
      });
    }
  }

  next() {
    if (this.state === 'ended') return;
    this.nextButton.setVisible(false);
    this.counter.setVisible(true);
    this.feedback.setText('');
    this.feedbackBg.setVisible(false);
    this.qIndex++;
    if (this.qIndex >= this.questions.length || this.qIndex >= MAX_QUESTIONS) {
      // Ne devrait pas arriver avec 10 questions (6+5, 7+4, 8+3 = 11 > 10) sauf réserve trop petite.
      this.finish(false, 'Les questions sont épuisées avant la fin du combat.');
      return;
    }
    const q = this.questions[this.qIndex];
    this.current = q;
    this.questionText.setText(q.question);
    this.counter.setText(`${this.qIndex + 1}/${Math.min(MAX_QUESTIONS, this.questions.length)}`);
    this.answerButtons.forEach((b, i) => {
      const rep = q.reponses[i];
      b.setVisible(rep !== undefined);
      if (rep === undefined) return;
      b.label.setText(rep);
      b.value = rep;
      b.setState('idle');
      b.setEnabled(true);
    });
    this.state = 'asking';
    this.deadline = this.time.now + TIMER_MS;
  }

  update() {
    if (this.state !== 'asking') return;
    const left = Math.max(0, this.deadline - this.time.now);
    const frac = left / TIMER_MS;
    this.timerBar.width = (W - 24) * frac;
    this.timerBar.fillColor = frac > 0.5 ? C.timer : frac > 0.25 ? C.warn : C.bad;
    this.timerLabel.setText(`${Math.ceil(left / 1000)} s`);
    if (left <= 0) this.answer(null);
  }

  async answer(index) {
    if (this.state !== 'asking') return;
    this.state = 'resolving';
    this.timerLabel.setText('');
    this.counter.setVisible(false);
    const q = this.current;
    const choice = index === null ? null : this.answerButtons[index].value;
    const correct = choice === q.bonne_reponse;

    this.answerButtons.forEach((b) => {
      b.setEnabled(false);
      if (b.value === q.bonne_reponse) b.setState('good');
      else if (b.value === choice) b.setState('bad');
      else b.setState('dim');
    });

    if (correct) {
      this.say('Bonne réponse ! Le Maréchal frappe.', C.goodText);
      await this.hero.attack(this.enemy);
      this.enemyHp--;
      this.enemyBar.set(this.enemyHp);
    } else {
      this.say(`${index === null ? 'Temps écoulé !' : 'Mauvaise réponse !'} La bonne réponse : ${q.bonne_reponse}`, C.badText);
      await this.enemy.attack(this.hero);
      this.heroHp--;
      this.heroBar.set(this.heroHp);
    }
    // L'anecdote n'est affichée que si la source en fournit une.
    if (q.anecdote) this.say(`${this.feedback.text}\n${q.anecdote}`);

    if (this.enemyHp <= 0) return this.finish(true);
    if (this.heroHp <= 0) return this.finish(false);
    this.state = 'answered';
    this.nextButton.setVisible(true);
  }

  /** Affiche un message sur le bandeau de résultat. */
  say(message, color) {
    if (color) this.feedback.setColor(color);
    this.feedback.setText(message);
    this.feedbackBg.setVisible(true).setSize(300, this.feedback.height + 6);
  }

  /* ------------------------------------------------------------------ */
  /*  Fin de bataille                                                    */
  /* ------------------------------------------------------------------ */

  async finish(won, reason) {
    this.state = 'ended';
    this.timerBar.width = 0;
    this.timerLabel.setText('');
    if (won) recordVictory(this.region.id, this.tier.id);
    else recordDefeat(this.region.id);
    if (won) await this.enemy.die();
    else if (!reason) await this.hero.die();

    if (won && this.tier.id === TIERS.length) {
      // Troisième victoire : la région est conquise.
      this.time.delayedCall(500, () => this.scene.start('conquest', { regionId: this.region.id }));
      return;
    }

    const w = 260;
    const h = 92;
    const x = (W - w) / 2;
    const y = 64;
    this.add.rectangle(0, 0, W, 270, 0x0e071b, 0.45).setOrigin(0);
    panel(this, x, y, w, h);
    text(this, W / 2, y + 10, won ? 'Victoire !' : 'Défaite…', { size: 16, color: won ? C.gold : C.badText }).setOrigin(0.5, 0);
    const msg = won
      ? defeatLine(this.enemyDef)
      : reason ?? 'Le Maréchal doit se replier. La région se reprend depuis la première bataille.';
    text(this, W / 2, y + 34, msg, { size: 8, width: w - 24, align: 'center' }).setOrigin(0.5, 0);

    const nextTier = TIERS.find((t) => t.id === this.tier.id + 1);
    const toMap = ['Retour à la carte', null];
    const list = won
      ? [['Bataille suivante', { regionId: this.region.id, tierId: nextTier.id }], toMap]
      : [['Recommencer la région', { regionId: this.region.id, tierId: 1 }], toMap];
    const bw = 116;
    const total = list.length * bw + (list.length - 1) * 8;
    this.endButtons = list.map(([label, data], i) =>
      button(this, (W - total) / 2 + i * (bw + 8), y + h - 28, bw, 20, label,
        () => (data ? this.scene.restart(data) : this.scene.start('map'))));
  }
}
