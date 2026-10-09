/**
 * display.js — Résolution logique 480x270, affichée à un facteur ENTIER.
 *
 * Le canevas fait 480·R × 270·R pixels et chaque caméra est zoomée ×R :
 * les sprites restent agrandis par un entier (pixels nets, sans flou),
 * et les textes sont rendus à la résolution R, donc lisibles.
 * Sous 480x270 (téléphone en portrait), R = 1 et le canevas est réduit en CSS.
 */
export const BASE_W = 480;
export const BASE_H = 270;
const MAX_R = 6;

export function computeFactor() {
  const ratio = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
  return {
    R: Math.max(1, Math.min(MAX_R, Math.floor(ratio))),
    cssZoom: ratio < 1 ? ratio : 1,
  };
}

/** Facteur courant (lu par les scènes et les textes). */
export const getR = (game) => game.registry.get('R') ?? 1;

/** À appeler au début de create() de chaque scène. */
export function fitCamera(scene) {
  const R = getR(scene.game);
  scene.cameras.main.setZoom(R).centerOn(BASE_W / 2, BASE_H / 2);
}

/** Recalcule le facteur à chaque redimensionnement de la fenêtre. */
export function watchResize(game) {
  const apply = () => {
    const { R, cssZoom } = computeFactor();
    const changed = R !== getR(game);
    game.registry.set('R', R);
    game.scale.setZoom(cssZoom);
    if (!changed) return;
    game.scale.resize(BASE_W * R, BASE_H * R);
    for (const scene of game.scene.getScenes(true)) {
      fitCamera(scene);
      scene.children.list.forEach(function refresh(obj) {
        if (obj.type === 'Text') obj.setResolution(R);
        if (obj.list) obj.list.forEach(refresh);
      });
    }
  };
  window.addEventListener('resize', apply);
}
