/**
 * transition.js — Fondus au noir entre les écrans.
 */
const DURATION = 260;

/** À appeler au début de create() : fondu d'ouverture. */
export function fadeIn(scene) {
  scene.leaving = false; // la même instance de scène sert d'une visite à l'autre
  scene.cameras.main.fadeIn(DURATION, 14, 7, 27);
}

/** Quitte la scène par un fondu, puis lance la suivante. */
export function goTo(scene, key, data = {}) {
  if (scene.leaving) return;
  scene.leaving = true;
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(DURATION, 14, 7, 27);
  scene.cameras.main.once('camerafadeoutcomplete', () => {
    scene.input.enabled = true;
    scene.scene.start(key, data);
  });
}
