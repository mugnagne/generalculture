/**
 * banner.js — Bannière du héros en pixel art, à queue d'aronde, accrochée à une hampe.
 * Dessinée avec des rectangles d'un pixel logique (nette à tout facteur d'agrandissement).
 *
 * Écusson : { colors: [motif, fond], emblem: 11 lignes de 11 caractères ('x' = motif, '.' = fond) }.
 * Le blason par défaut est dans characters.json ; le joueur peut dessiner le sien (CrestScene).
 */
import { getContent } from './core/content.js';
import { getSettings } from './settings.js';

export const EMBLEM_SIZE = 11;

const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

/** Écusson d'un personnage (characters.json). */
export const defaultCrest = (character = getContent().characters[0]) => ({
  colors: [...character.banner.colors],
  emblem: [...character.banner.emblem],
});

/** Dernier écusson dessiné par le joueur, sinon celui du personnage. */
export const currentCrest = () => getSettings().crest ?? defaultCrest();

/** Écusson vide (tout en couleur de fond). */
export const blankEmblem = () => Array.from({ length: EMBLEM_SIZE }, () => '.'.repeat(EMBLEM_SIZE));

/**
 * Dessine une bannière.
 * @param {number} x, y  pied de la hampe
 * @param {number} s     taille d'un « pixel » de la bannière (1 = petite, 3 = grande)
 * @param {{colors: string[], emblem: string[]}} crest
 */
export function drawBanner(scene, x, y, s, crest = currentCrest()) {
  const [motif, field] = crest.colors.map(hex);
  const g = scene.add.graphics({ x, y });
  const W = 15 * s;
  const H = 18 * s;
  const poleH = H + 10 * s;
  // Hampe et pointe
  g.fillStyle(0x5d2c28).fillRect(0, -poleH, s, poleH);
  g.fillStyle(motif).fillRect(-s, -poleH - s, 3 * s, s);
  // Étoffe à liseré (couleur du motif), terminée en queue d'aronde
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
  cloth(s, top, W / s, H / s, 4, motif);
  cloth(2 * s, top + s, W / s - 2, H / s - 2, 3, field);
  // Motif centré
  g.fillStyle(motif);
  const ex = 3 * s;
  const ey = top + 2 * s;
  crest.emblem.forEach((row, r) => [...row].forEach((c, col) => {
    if (c !== '.') g.fillRect(ex + col * s, ey + r * s, s, s);
  }));
  return g;
}
