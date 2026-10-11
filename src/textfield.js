/**
 * textfield.js — Champ de saisie dessiné dans le jeu (nom du héros, graine).
 *
 * Clic : le champ s'active (curseur clignotant) et reçoit les touches du clavier ;
 * Entrée ou clic ailleurs : validé ; Échap : annulé. Sur écran tactile, sans clavier
 * physique, le champ natif du navigateur (prompt) prend le relais.
 * Pendant la saisie, scene.typing est vrai : la navigation au clavier (menuNav) se tait.
 */
import { text, C } from './ui.js';

/**
 * @param {object} opts { label, value, maxLength, filter(ch) → bool, normalize(value) → value|null, onChange }
 */
export function textField(scene, x, y, w, { label, value, maxLength = 20, filter = () => true, normalize = (v) => v, onChange }) {
  const h = 16;
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, C.shadow, 0.9).setOrigin(0).setStrokeStyle(1, 0x657392);
  const t = text(scene, 5, h / 2, value, { size: 8, color: C.ink }).setOrigin(0, 0.5);
  const caret = scene.add.rectangle(0, 3, 1, h - 6, 0xf9e6cf).setOrigin(0).setVisible(false);
  c.add([bg, t, caret]);
  let current = value;
  let draft = value;
  let active = false;
  let blink = null;

  const render = () => {
    t.setText(active ? draft : current);
    caret.x = 5 + t.width + 1;
  };
  const stop = (commit) => {
    if (!active) return;
    active = false;
    // Repos au tour suivant : l'Entrée qui valide ne doit pas aussi presser un bouton
    scene.time.delayedCall(0, () => { scene.typing = false; });
    blink?.remove();
    caret.setVisible(false);
    bg.setStrokeStyle(1, 0x657392);
    if (commit) {
      const v = normalize(draft.trim());
      if (v) {
        current = v;
        onChange(v);
      }
    }
    render();
  };
  const start = () => {
    active = true;
    scene.typing = true;
    draft = current;
    bg.setStrokeStyle(1, C.goldHex);
    caret.setVisible(true);
    blink = scene.time.addEvent({ delay: 450, loop: true, callback: () => caret.setVisible(!caret.visible) });
    render();
  };

  const zone = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
  c.add(zone);
  zone.on('pointerup', (p) => {
    if (active) return;
    if (p.wasTouch) {
      const v = window.prompt(label, current);
      if (v !== null) {
        const n = normalize(v.trim().slice(0, maxLength));
        if (n) {
          current = n;
          onChange(n);
          render();
        }
      }
      return;
    }
    // Le clic qui active ne doit pas aussitôt valider (écouteur « clic ailleurs » posé après)
    scene.time.delayedCall(0, start);
  });
  scene.input.on('pointerdown', (p, over) => {
    if (active && !over.includes(zone)) stop(true);
  });
  scene.input.keyboard.on('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Enter') stop(true);
    else if (e.key === 'Escape') stop(false);
    else if (e.key === 'Backspace') draft = draft.slice(0, -1);
    else if (e.key.length === 1 && draft.length < maxLength && filter(e.key)) draft += e.key;
    else return;
    e.preventDefault?.();
    if (active) render();
  });
  render();
  c.setValue = (v) => {
    current = v;
    render();
  };
  c.edit = start;
  return c;
}
