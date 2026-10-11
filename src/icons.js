/**
 * icons.js — Petites icônes en pixel art dessinées dans le code (aucun fichier image).
 *
 * Chaque icône est une grille de caractères ; chaque caractère renvoie à une couleur
 * de la palette ENDESGA 64 (« . » = transparent). Les textures sont créées une seule
 * fois par jeu, à la demande, sous la clé « icon:<nom> » (ou « icon:<nom>:<teinte> »).
 */

const PALETTE = {
  k: '#0E071B', // contour
  w: '#F9E6CF', // clair
  g: '#92A1B9', // acier
  d: '#4E5B7C', // acier sombre
  r: '#EA323C', // rouge
  R: '#891E2B', // rouge sombre
  o: '#FFA214', // orange
  y: '#FFC825', // or
  Y: '#ED7614', // or sombre
  b: '#0098DC', // bleu
  B: '#1F2A44', // bleu nuit
  n: '#8A4836', // bois
  N: '#5D2C28', // bois sombre
  v: '#5AC54F', // vert
  p: '#A93B89', // violet
  x: '#FF00FF', // couleur variable (teinte passée à la création)
  X: '#FF00FE', // couleur variable assombrie
};

export const ICONS = {
  heart: [
    '.kk.kk.',
    'krrkrRk',
    'krwrrRk',
    'krrrrRk',
    '.krrRk.',
    '..kRk..',
    '...k...',
  ],
  coin: [
    '.kkkk.',
    'kyyyYk',
    'kywyYk',
    'kyyyYk',
    'kyyYYk',
    '.kkkk.',
  ],
  // Fiole : la teinte change selon la rareté
  vial: [
    '..kkk..',
    '..kwk..',
    '..kgk..',
    '.kxxxk.',
    'kxwxxXk',
    'kxxxxXk',
    'kXxxXXk',
    '.kkkkk.',
  ],
  // Relique (amulette) : la teinte change selon la famille
  relic: [
    '..kkk..',
    '.k...k.',
    '..k.k..',
    '.kxxxk.',
    'kxwxxXk',
    'kxxxxXk',
    '.kxXXk.',
    '..kkk..',
  ],
  sword: [
    '......kk',
    '.....kwk',
    '....kwk.',
    'k..kwk..',
    '.kkwk...',
    '..kNk...',
    '.kNkk...',
    'kNk.....',
  ],
  // Cases de la carte (11 x 11)
  combat: [
    'kk.......kk',
    'kwk.....kwk',
    '.kgk...kgk.',
    '..kgk.kgk..',
    '...kgkgk...',
    '....kgk....',
    '...kgkgk...',
    '.kkNk.kNkk.',
    '.kNk...kNk.',
    'kNk.....kNk',
    'kk.......kk',
  ],
  elite: [
    'k.........k',
    'kk.kkkkk.kk',
    'kwkrrrrrkwk',
    '.kkrrrrrkk.',
    '.krwwrwwrk.',
    '.krkwrkwrk.',
    '.krrrRrrrk.',
    '..krwRwrk..',
    '..kRrRrRk..',
    '...kkkkk...',
    '...........',
  ],
  rest: [
    '.....k.....',
    '....kok....',
    '...koyok...',
    '...koyyok..',
    '..koyywyok.',
    '..koywwyok.',
    '...koyyok..',
    '.kkkkkkkkk.',
    'kNnNnNnNnNk',
    '.kkkkkkkkk.',
    '...........',
  ],
  // Marchand : bourse nouée, marquée d'une pièce
  shop: [
    '...kk.kk...',
    '....kyk....',
    '...kkkkk...',
    '..kwnnnnk..',
    '.kwnnnnnNk.',
    'kwnnkkknnNk',
    'knnkyyYknNk',
    'knnkyYYknNk',
    'knnnkkknnNk',
    '.kNnnnnNNk.',
    '..kkkkkkk..',
  ],
  unknown: [
    '...kkkkk...',
    '..kwwwwwk..',
    '.kwwkkkwwk.',
    '.kkk...kwk.',
    '......kwwk.',
    '.....kwwk..',
    '....kwwk...',
    '....kwk....',
    '....kkk....',
    '....kwk....',
    '....kkk....',
  ],
  treasure: [
    '...........',
    '..kkkkkkk..',
    '.knnnnnnnk.',
    'knnnnnnnnNk',
    'kkkkkykkkkk',
    'knnnkYknnNk',
    'knnnnynnnNk',
    'knnnnnnnnNk',
    'kNNNNNNNNNk',
    '.kkkkkkkkk.',
    '...........',
  ],
  boss: [
    'k...k.k...k',
    'kyk.kyk.kyk',
    'kyykyyykyyk',
    'kyyyyyyyyyk',
    'kyyryybyyyk',
    'kyyyyyyyyYk',
    '.kYYYYYYYk.',
    '.kkkkkkkkk.',
    '...........',
    '...........',
    '...........',
  ],
  event: [
    '..kkkkkkk..',
    '.kwwwwwwwk.',
    '.kwgggggwk.',
    '.kwwwwwwwk.',
    '.kwgggggwk.',
    '.kwwwwwwwk.',
    '.kwggggwwk.',
    '.kwwwwwwwk.',
    '..kkkkkkk..',
    '...........',
    '...........',
  ],
  // Capacités ennemies (7 x 7)
  brume: ['.......', '.ggggg.', 'gwgwgwg', '.......', 'ggwggwg', '.gwgg..', '.......'],
  rage: ['r..r..r', 'rr.rr.r', '.rrrrr.', 'rrorrrr', '.royor.', '.rooor.', '..rrr..'],
  erudition: ['kkkkkkk', 'kbwkwbk', 'kbwkwbk', 'kbwkwbk', 'kbbkbbk', 'kkkkkkk', '.......'],
  mirage: ['..kkk..', '.kbwbk.', 'kbwbwbk', 'kbbwbbk', '.kbbbk.', '..kkk..', '.......'],
  regeneration: ['..kkk..', '..kvk..', 'kkkvkkk', 'kvvvvvk', 'kkkvkkk', '..kvk..', '..kkk..'],
  pression: ['.kkkkk.', '.kwwwk.', '..kwk..', '...k...', '..kyk..', '.kyyyk.', '.kkkkk.'],
};

/** Couleur assombrie (pour les ombres des icônes teintées). */
function darken(hex, f = 0.65) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Clé de texture d'une icône (créée au premier appel).
 * @param {string} name  nom dans ICONS
 * @param {string} [tint] couleur « #RRGGBB » des pixels variables (x / X)
 */
export function iconKey(scene, name, tint = null) {
  const key = tint ? `icon:${name}:${tint}` : `icon:${name}`;
  if (scene.textures.exists(key)) return key;
  const rows = ICONS[name];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      let color = PALETTE[ch];
      if (ch === 'x') color = tint ?? PALETTE.g;
      if (ch === 'X') color = darken(tint ?? PALETTE.g);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  tex.refresh();
  return key;
}

/** Ajoute une icône à la scène (origine au centre). */
export function icon(scene, x, y, name, { tint = null, scale = 1 } = {}) {
  return scene.add.image(x, y, iconKey(scene, name, tint)).setScale(scale);
}
