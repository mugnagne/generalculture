/**
 * sprites.js — Chargement des personnages à partir de assets/sprites/manifest.json
 * (généré par scripts/build_assets.py) et création des animations Phaser.
 *
 * Une texture par FICHIER (les planches chierit regroupent plusieurs animations) ;
 * chaque animation pointe sur une plage de frames de ce fichier.
 */

export const MANIFEST_URL = 'assets/sprites/manifest.json';

/** Clé de texture d'un fichier. */
export const fileKey = (file) => 'f:' + file;

/** Clé d'animation Phaser d'un personnage. */
export const animKey = (charKey, anim) => `${charKey}:${anim}`;

/** Ajoute au loader toutes les planches des personnages demandés. */
export function preloadCharacters(scene, manifest, charKeys) {
  const seen = new Set();
  for (const key of charKeys) {
    for (const anim of Object.values(manifest.characters[key].anims)) {
      if (seen.has(anim.file)) continue;
      seen.add(anim.file);
      scene.load.spritesheet(fileKey(anim.file), encodeURI(anim.file), {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
      });
    }
  }
}

/** Crée (une seule fois) les animations des personnages demandés. */
export function createAnimations(scene, manifest, charKeys) {
  for (const key of charKeys) {
    for (const [name, anim] of Object.entries(manifest.characters[key].anims)) {
      const k = animKey(key, name);
      if (scene.anims.exists(k)) continue;
      scene.anims.create({
        key: k,
        frames: scene.anims.generateFrameNumbers(fileKey(anim.file), {
          start: anim.start,
          end: anim.start + anim.frames - 1,
        }),
        frameRate: anim.fps,
        repeat: anim.loop ? -1 : 0,
      });
    }
  }
}
