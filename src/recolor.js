/**
 * recolor.js — Recoloration par plage de teinte, sur des pixels RGBA.
 *
 * Pour chaque règle : on mesure la luminosité moyenne du groupe de pixels repéré,
 * puis chaque pixel prend la teinte et la saturation de la couleur cible, avec une
 * luminosité décalée d'autant que l'écart du pixel à cette moyenne : les ombres et
 * les reflets d'origine sont conservés.
 *
 * Fonctions pures (pas de Phaser) : utilisées par le jeu et par la page de debug.
 */

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

const inRange = (v, [a, b]) => v >= a && v <= b;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Résout la cible d'une règle ('primary' / 'secondary' / '#hex') en HSL. */
function resolveTarget(to, colors) {
  const hex = to === 'primary' ? colors[0] : to === 'secondary' ? colors[1] : to;
  return rgbToHsl(...hexToRgb(hex));
}

/**
 * Luminosité moyenne de chaque groupe de pixels repéré par les règles.
 * On la mesure une fois sur l'animation d'attente, puis on la réutilise pour
 * toutes les planches du personnage (sinon les teintes varieraient d'une animation à l'autre).
 */
export function measureLightness(data, rules) {
  return classify(data, rules).meanL;
}

/**
 * Recolore `data` (Uint8ClampedArray RGBA) en place.
 * @param {Array} rules   règles de src/data/recolor.js
 * @param {string[]} colors  [couleur 1, couleur 2] de la maison
 * @param {number[]} [refL]  luminosités de référence (measureLightness) ; sinon mesurées ici
 */
export function recolorPixels(data, rules, colors, refL) {
  const { owner, hsl, meanL } = classify(data, rules);
  const reference = refL ?? meanL;
  const targets = rules.map((rule) => resolveTarget(rule.to, colors));
  for (let p = 0; p < owner.length; p++) {
    const r = owner[p];
    if (r < 0) continue;
    const [th, ts, tl] = targets[r];
    const l = hsl[p * 3 + 2];
    const s = hsl[p * 3 + 1];
    const newL = clamp(tl + (l - reference[r]), 0.03, 0.97);
    // Les pixels d'origine plus ternes restent un peu plus ternes (relief conservé).
    const newS = ts === 0 ? 0 : clamp(ts * (0.75 + 0.25 * Math.min(1, s / 0.5)), 0, 1);
    const [nr, ng, nb] = hslToRgb(th, newS, newL);
    const i = p * 4;
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
  return data;
}

/** Affecte chaque pixel à la première règle qui le couvre. */
function classify(data, rules) {
  const owner = new Int8Array(data.length / 4).fill(-1);
  const sumL = new Float64Array(rules.length);
  const count = new Uint32Array(rules.length);
  const hsl = new Float32Array((data.length / 4) * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    hsl[p * 3] = h; hsl[p * 3 + 1] = s; hsl[p * 3 + 2] = l;
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      if (inRange(h, rule.hue) && inRange(s, rule.sat) && inRange(l, rule.light)) {
        owner[p] = r;
        sumL[r] += l;
        count[r]++;
        break;
      }
    }
  }
  const meanL = Array.from(sumL, (s, r) => (count[r] ? s / count[r] : 0.5));
  return { owner, hsl, meanL };
}

/** Pixels RGBA d'une image (HTMLImageElement ou canvas). */
export function readPixels(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Recolore une image et renvoie un nouveau canvas (l'image d'origine n'est pas touchée). */
export function recolorImage(source, rules, colors, refL) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorPixels(img.data, rules, colors, refL);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
