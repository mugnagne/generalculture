/**
 * PauseScene — superposée à une scène en pause (combat) : le chrono est figé
 * (la scène d'origine est suspendue) et la question est masquée par la scène appelante.
 *
 * Données : { from: clé de la scène suspendue }
 * La scène appelante écoute l'événement 'resume' de son propre système pour réafficher la question.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';

const W = 480;
const H = 270;

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('pause');
  }

  init({ from }) {
    this.from = from;
  }

  create() {
    fitCamera(this);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.82).setOrigin(0);
    panel(this, W / 2 - 100, H / 2 - 60, 200, 120);
    text(this, W / 2, H / 2 - 48, 'Pause', { size: 16, color: C.gold }).setOrigin(0.5, 0);
    const what = this.from === 'combat' ? 'Le chrono est arrêté.' : 'La partie est en pause.';
    text(this, W / 2, H / 2 - 24, `${what}\nLa partie reste sauvegardée.`, { size: 8, color: C.muted, align: 'center' })
      .setOrigin(0.5, 0);
    const resume = button(this, W / 2 - 60, H / 2 + 4, 120, 20, 'Reprendre', () => this.resumeGame());
    const quit = button(this, W / 2 - 60, H / 2 + 30, 120, 20, 'Quitter vers le titre', () => this.quit());
    menuNav(this, [resume, quit], { start: 0 });
    this.input.keyboard.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard.on('keydown-P', () => this.resumeGame());
  }

  resumeGame() {
    this.scene.resume(this.from);
    this.scene.stop();
  }

  quit() {
    this.scene.stop(this.from);
    this.scene.start('title');
  }
}

/** Met une scène en pause et ouvre le panneau (à appeler depuis la scène à suspendre). */
export function openPause(scene) {
  if (scene.scene.isPaused() || scene.scene.isActive('pause')) return;
  scene.scene.launch('pause', { from: scene.scene.key });
  scene.scene.pause();
}
