/**
 * banner.js — Bannière du Maréchal en pixel art : faucille et marteau, or sur rouge.
 * Dessinée avec des rectangles d'un pixel logique (nette à tout facteur d'agrandissement).
 */
import { MARECHAL } from './data/world.js';

// Emblème 9x9 : F = faucille, M = marteau
const EMBLEM = [
  '...FFFF..',
  '..F....F.',
  '.F.MMM..F',
  '.F..M...F',
  'F...M..F.',
  'F..M..F..',
  '.FM.FF...',
  'M.FF.....',
  '.........',
];

const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

/**
 * Dessine une bannière à queue d'aronde accrochée à une hampe.
 * @param {number} x, y  pied de la hampe
 * @param {number} s     taille d'un « pixel » de la bannière (1 = petite, 2 = grande)
 */
export function drawBanner(scene, x, y, s = 1, colors = MARECHAL.colors) {
  const [gold, red] = colors.map(hex);
  const g = scene.add.graphics({ x, y });
  const W = 13 * s;
  const H = 16 * s;
  const poleH = H + 10 * s;
  // Hampe et pointe
  g.fillStyle(0x5d2c28).fillRect(0, -poleH, s, poleH);
  g.fillStyle(gold).fillRect(-s, -poleH - s, 3 * s, s);
  // Étoffe rouge à liseré or, terminée en queue d'aronde
  const top = -poleH + s;
  const cloth = (ox, oy, cols, rows, depth, color) => {
    g.fillStyle(color);
    for (let r = 0; r < rows; r++) {
      const gap = r < rows - depth ? 0 : 2 * (r - (rows - depth) + 1);
      const left = Math.floor((cols - gap) / 2);
      g.fillRect(ox, oy + r * s, left * s, s);
      g.fillRect(ox + (left + gap) * s, oy + r * s, (cols - left - gap) * s, s);
    }
  };
  cloth(s, top, W / s, H / s, 4, gold);
  cloth(2 * s, top + s, W / s - 2, H / s - 2, 3, red);
  // Emblème doré centré
  g.fillStyle(gold);
  const ex = s + Math.round((W - 9 * s) / 2);
  const ey = top + 2 * s;
  EMBLEM.forEach((row, r) => [...row].forEach((c, col) => {
    if (c !== '.') g.fillRect(ex + col * s, ey + r * s, s, s);
  }));
  return g;
}
