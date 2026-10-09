/**
 * backdrop.js — Décors de combat CraftPix, chargés tels quels depuis assets/backgrounds/
 * (image unique ou calques), d'après assets/generated/backdrops.json (scripts/build_assets.py).
 *
 * Mise à l'échelle : un seul facteur pour toute l'image (aucune déformation), filtrage au plus
 * proche voisin (pixelArt), largeur de l'écran couverte. L'image est ensuite recadrée par le haut
 * pour que son sol (`backdrop.ground`, en pixels de l'image d'origine) tombe juste au-dessus de la
 * carte-question ; ce qui dépasse sous la carte est masqué par celle-ci, il n'y a donc pas de bande.
 */

const W = 480;
const H = 270;
const CARD_TOP = 166;        // haut de la carte-question (CombatScene)
const DEFAULT_GROUND = 158;  // sol visé à l'écran
const PARALLAX_MAX = 2;      // déplacement maximal du calque le plus proche, en pixels
const PARALLAX_PERIOD = 9000;

const layerKey = (path) => 'bd:' + path;

/** Variante de décor d'une région (ou null si aucun décor fourni). */
export function backdropOf(scene, region) {
  const all = scene.cache.json.get('backdrops') ?? {};
  const variants = all[region.id]?.variants;
  if (!variants || !region.backdrop) return null;
  return variants[region.backdrop.variant] ?? Object.values(variants)[0];
}

/** À appeler dans preload() : charge les calques du décor de la région s'ils manquent. */
export function preloadBackdrop(scene, region) {
  const bd = backdropOf(scene, region);
  if (!bd) return;
  for (const path of bd.layers) {
    if (!scene.textures.exists(layerKey(path))) scene.load.image(layerKey(path), encodeURI(path));
  }
}

/**
 * Dessine le décor et renvoie la hauteur du sol à l'écran.
 * @param {{ combat?: boolean }} opts  combat : recadrage sur le sol et légère parallaxe ;
 *   sinon l'image couvre simplement tout l'écran (écrans de conquête et de victoire).
 */
export function drawBackdrop(scene, region, { combat = false } = {}) {
  const parallax = combat;
  const fill = Phaser.Display.Color.HexStringToColor(region.house.colors[0]).color;
  // Fond uni : décor manquant, ou zone cachée sous la carte-question
  scene.add.rectangle(0, 0, W, H, fill).setOrigin(0);

  const bd = backdropOf(scene, region);
  if (!bd) return DEFAULT_GROUND;

  // Facteur unique : couvrir la largeur (+ une marge de parallaxe) et au moins la hauteur visible
  const margin = parallax && bd.layers.length > 1 ? PARALLAX_MAX * 2 : 0;
  const scale = Math.max((W + margin) / bd.width, (combat ? CARD_TOP : H) / bd.height);
  const ground = region.backdrop.ground ?? bd.height;
  // Combat : recadrage par le haut pour amener le sol juste au-dessus de la carte, sans découvrir
  // le haut de l'écran ni laisser l'image s'arrêter avant la carte. Sinon : image centrée.
  const maxCrop = Math.max(0, bd.height - (combat ? CARD_TOP + 4 : H) / scale);
  const crop = combat ? Phaser.Math.Clamp(ground - DEFAULT_GROUND / scale, 0, maxCrop) : maxCrop / 2;

  const n = bd.layers.length;
  bd.layers.forEach((path, i) => {
    const img = scene.add.image(W / 2, -crop * scale, layerKey(path)).setOrigin(0.5, 0).setScale(scale);
    if (parallax && n > 1 && i > 0) {
      // Les calques proches bougent davantage ; très lent, pour ne pas distraire de la question.
      const amp = Math.max(1, Math.round((i / (n - 1)) * PARALLAX_MAX));
      img.x = W / 2 - amp;
      scene.tweens.add({
        targets: img, x: W / 2 + amp, duration: PARALLAX_PERIOD, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
      });
    }
  });
  return Math.min(CARD_TOP - 2, Math.round((ground - crop) * scale));
}
