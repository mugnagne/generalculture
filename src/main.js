/**
 * main.js — Point d'entrée du jeu « La Reconquête de Valdorn ».
 *
 * Résolution de base 480x270, agrandie par un facteur ENTIER (voir display.js).
 */
import { BootScene } from './scenes/BootScene.js';
import { CombatScene } from './scenes/CombatScene.js';
import { ConquestScene } from './scenes/ConquestScene.js';
import { MapScene } from './scenes/MapScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';
import { FinaleScene } from './scenes/FinaleScene.js';
import { MANIFEST_URL } from './sprites.js';
import { BASE_W, BASE_H, computeFactor, watchResize } from './display.js';

async function start() {
  // La police doit être prête avant le premier texte Phaser.
  try {
    await document.fonts.load('8px "Pixelify Sans"', 'éèàçœ');
  } catch { /* la police de secours prendra le relais */ }

  const manifest = await (await fetch(MANIFEST_URL)).json();

  // Par défaut : l'écran titre. Paramètres de test : ?region=givre&bataille=2, ?conquete=givre,
  // ?ecran=carte|finale|credits
  const params = new URLSearchParams(location.search);
  const screens = { carte: 'map', finale: 'finale', credits: 'credits' };
  let start = { scene: screens[params.get('ecran')] ?? 'title', data: {} };
  if (params.has('conquete')) start = { scene: 'conquest', data: { regionId: params.get('conquete') } };
  else if (params.has('region')) start = { scene: 'combat', data: { regionId: params.get('region'), tierId: Number(params.get('bataille') ?? 1) } };

  const { R, cssZoom } = computeFactor();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: BASE_W * R,
    height: BASE_H * R,
    backgroundColor: '#0E071B',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: cssZoom,
    },
    scene: [BootScene, TitleScene, MapScene, CombatScene, ConquestScene, FinaleScene, CreditsScene],
  });
  game.registry.set('R', R);
  game.registry.set('manifest', manifest);
  game.registry.set('start', start);

  watchResize(game);
  window.__game = game; // pratique pour déboguer depuis la console
}

start();
