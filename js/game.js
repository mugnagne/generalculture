/**
 * game.js — Logique de jeu pure, sans aucun accès au DOM ni au réseau.
 * L'interface (app.js) pilote une instance de Game et un Timer.
 */

export class Game {
  /** @param {Array} questions questions au format interne */
  constructor(questions) {
    this.questions = questions;
    this.index = 0;
    this.score = 0;
    this.answers = []; // { question, choice, correct }
    this.answered = false;
  }

  get current() {
    return this.questions[this.index];
  }

  get total() {
    return this.questions.length;
  }

  /** Numéro (1-based) de la question en cours. */
  get position() {
    return this.index + 1;
  }

  get isLast() {
    return this.index >= this.total - 1;
  }

  /**
   * Enregistre la réponse du joueur (`null` si le temps est écoulé).
   * @returns {{correct: boolean, bonne_reponse: string}}
   */
  answer(choice) {
    if (this.answered) throw new Error('Question déjà répondue');
    const q = this.current;
    const correct = choice !== null && choice === q.bonne_reponse;
    if (correct) this.score++;
    this.answers.push({ question: q, choice, correct });
    this.answered = true;
    return { correct, bonne_reponse: q.bonne_reponse };
  }

  /** Passe à la question suivante. Renvoie false si la partie est finie. */
  next() {
    if (this.isLast) return false;
    this.index++;
    this.answered = false;
    return true;
  }

  /** Questions ratées (mauvaise réponse ou temps écoulé). */
  get mistakes() {
    return this.answers.filter((a) => !a.correct);
  }

  get percent() {
    return this.total ? Math.round((this.score / this.total) * 100) : 0;
  }
}

/** Message de fin de partie selon le pourcentage de bonnes réponses. */
export function scoreMessage(percent) {
  if (percent === 100) return 'Sans faute, impressionnant !';
  if (percent >= 80) return 'Excellent, une vraie encyclopédie !';
  if (percent >= 60) return 'Très bien joué !';
  if (percent >= 40) return 'Pas mal, encore un petit effort !';
  if (percent >= 20) return 'Il y a de la marge, retente ta chance !';
  return 'Aïe… la revanche s’impose !';
}

/**
 * Minuteur décompté en secondes.
 * onTick(secondesRestantes, fractionRestante) puis onEnd() à zéro.
 */
export class Timer {
  constructor(seconds, { onTick, onEnd }) {
    this.duration = seconds * 1000;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.raf = null;
  }

  start() {
    this.stop();
    const startedAt = performance.now();
    let lastSecond = null;
    const loop = (now) => {
      const remaining = Math.max(0, this.duration - (now - startedAt));
      const seconds = Math.ceil(remaining / 1000);
      // On notifie à chaque frame pour la barre, mais le texte ne change qu'à la seconde.
      this.onTick(seconds, remaining / this.duration, seconds !== lastSecond);
      lastSecond = seconds;
      if (remaining <= 0) {
        this.raf = null;
        this.onEnd();
      } else {
        this.raf = requestAnimationFrame(loop);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}
