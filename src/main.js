/**
 * main.js — Point d'entrée du jeu « La Reconquête de Valdorn ».
 *
 * Résolution de base 480x270, agrandie par un facteur ENTIER (voir display.js).
 */
import { BootScene } from './scenes/BootScene.js';
import { CombatScene } from './scenes/CombatScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { CharacterScene } from './scenes/CharacterScene.js';
import { MapScene } from './scenes/MapScene.js';
import { RewardScene } from './scenes/RewardScene.js';
import { EventScene } from './scenes/EventScene.js';
import { RestScene } from './scenes/RestScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { SummaryScene } from './scenes/SummaryScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';
import { loadContent } from './core/content.js';
import { MANIFEST_URL } from './sprites.js';
import { BASE_W, BASE_H, computeFactor, watchResize } from './display.js';

async function start() {
  // La police doit être prête avant le premier texte Phaser.
  try {
    await document.fonts.load('8px "Pixelify Sans"', 'éèàçœ');
  } catch { /* la police de secours prendra le relais */ }

  const manifest = await (await fetch(MANIFEST_URL)).json();
  // Données de contenu du rogue-lite (src/data/*.json), indispensables avant toute scène
  await loadContent();

  // Par défaut : l'écran titre. Paramètres de test : ?ecran=personnage|carte|credits
  const params = new URLSearchParams(location.search);
  const screens = { personnage: 'character', carte: 'map', credits: 'credits' };
  const start = { scene: screens[params.get('ecran')] ?? 'title', data: {} };

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
    scene: [BootScene, TitleScene, CharacterScene, MapScene, CombatScene, RewardScene, RestScene, ShopScene, EventScene, SummaryScene, PauseScene, CreditsScene],
  });
  game.registry.set('R', R);
  game.registry.set('manifest', manifest);
  game.registry.set('start', start);

  watchResize(game);
  window.__game = game; // pratique pour déboguer depuis la console
}

start();
