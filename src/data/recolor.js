/**
 * recolor.js (données) — Plages de teinte à recolorer pour chaque sprite.
 *
 * Chaque règle repère un groupe de pixels (tissu, armure…) par sa teinte (degrés),
 * sa saturation et sa luminosité (0..1), puis l'envoie vers une couleur cible :
 *   'primary'   → 1re couleur de la maison
 *   'secondary' → 2e couleur de la maison
 *   '#RRGGBB'   → couleur fixe (ex. le Ver des sables)
 * Les plages ont été relevées sur les palettes réelles des planches (scripts/build_assets.py).
 * Les pixels non couverts (peau, cuir, contours, flammes) gardent leur couleur.
 */
export const RECOLOR_RULES = {
  // Soldats : tunique bleue → couleur 1 ; armure d'acier grise → couleur 2
  'medieval-warrior-3': [
    { name: 'tissu', hue: [200, 245], sat: [0.25, 1], light: [0.05, 0.6], to: 'primary' },
    { name: 'armure', hue: [0, 360], sat: [0, 0.15], light: [0.25, 0.85], to: 'secondary' },
  ],
  // Chevalier rouge : tunique et cape rouges → couleur 1 ; parties bleu nuit → couleur 2
  'medieval-warrior-2': [
    { name: 'tissu', hue: [315, 360], sat: [0.2, 1], light: [0.08, 0.7], to: 'primary' },
    { name: 'tissu-sombre', hue: [0, 4], sat: [0.5, 1], light: [0.12, 0.6], to: 'primary' },
    { name: 'armure', hue: [190, 225], sat: [0.3, 1], light: [0.02, 0.5], to: 'secondary' },
  ],
  // Chevalier à cape verte : cape verte et écharpe bordeaux → couleur 1 ; armure bleu-gris → couleur 2
  'fantasy-warrior': [
    { name: 'cape', hue: [80, 175], sat: [0.12, 1], light: [0.05, 0.6], to: 'primary' },
    { name: 'écharpe', hue: [330, 360], sat: [0.25, 1], light: [0.05, 0.45], to: 'primary' },
    { name: 'armure', hue: [195, 245], sat: [0.1, 1], light: [0.1, 0.9], to: 'secondary' },
  ],
  // Squelettes des Plaines de Cendre : tissu brun → couleur 1 ; bouclier gris → couleur 2
  // (les os, jaune olive, ne sont pas touchés)
  skeleton: [
    { name: 'tissu', hue: [15, 42], sat: [0.35, 1], light: [0.05, 0.5], to: 'primary' },
    { name: 'bouclier', hue: [0, 360], sat: [0, 0.05], light: [0.35, 0.47], to: 'secondary' },
  ],
  // Le Ver des sables : corps olive et rouge sombre → tons de sable (flammes conservées)
  'fire-worm': [
    { name: 'corps', hue: [45, 75], sat: [0.2, 1], light: [0.05, 0.6], to: '#D9B97A' },
    { name: 'écailles', hue: [0, 25], sat: [0.35, 1], light: [0.05, 0.4], to: '#9C7440' },
  ],
};

/** Couleurs fixes de variantes qui ne dépendent pas d'une maison. */
export const SAND_VARIANT = 'sable';
