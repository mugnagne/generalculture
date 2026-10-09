/**
 * variants.js — Variantes recolorées des personnages, générées une seule fois
 * à l'exécution dans des textures Phaser en cache (les PNG d'origine ne changent pas).
 *
 * Une variante est enregistrée comme un personnage à part dans le manifeste
 * (clé « <perso>#<variante> »), avec ses propres textures et animations.
 */
import { RECOLOR_RULES } from './data/recolor.js';
import { readPixels, measureLightness, recolorImage } from './recolor.js';
import { fileKey, createAnimations } from './sprites.js';

/**
 * @param {Phaser.Scene} scene
 * @param {object} manifest
 * @param {string} charKey   personnage d'origine
 * @param {string} variantId identifiant de la variante (ex. 'givre', 'sable')
 * @param {string[]} colors  [couleur 1, couleur 2]
 * @returns {string} clé du personnage recoloré (ou d'origine s'il n'a pas de règles)
 */
export function ensureVariant(scene, manifest, charKey, variantId, colors) {
  const rules = RECOLOR_RULES[charKey];
  if (!rules) return charKey;
  const key = `${charKey}#${variantId}`;
  if (manifest.characters[key]) return key;

  const def = manifest.characters[charKey];
  const sourceOf = (file) => scene.textures.get(fileKey(file)).getSourceImage();
  // Luminosités de référence mesurées sur l'animation d'attente, communes à toutes les planches.
  const refL = measureLightness(readPixels(sourceOf(def.anims.idle.file)), rules);

  const anims = {};
  const done = new Map();
  for (const [name, anim] of Object.entries(def.anims)) {
    const file = `${anim.file}#${variantId}`;
    if (!done.has(anim.file)) {
      const canvas = recolorImage(sourceOf(anim.file), rules, colors, refL);
      const tex = scene.textures.addCanvas(fileKey(file), canvas);
      const cols = Math.floor(canvas.width / anim.frameWidth);
      const rows = Math.floor(canvas.height / anim.frameHeight);
      for (let i = 0; i < cols * rows; i++) {
        tex.add(i, 0, (i % cols) * anim.frameWidth, Math.floor(i / cols) * anim.frameHeight, anim.frameWidth, anim.frameHeight);
      }
      done.set(anim.file, file);
    }
    anims[name] = { ...anim, file };
  }
  manifest.characters[key] = { ...def, anims, variantOf: charKey };
  createAnimations(scene, manifest, [key]);
  return key;
}
