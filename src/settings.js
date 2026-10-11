/**
 * settings.js — Préférences du joueur, gardées dans le navigateur (localStorage) :
 * police (lisible ou pixel) et dernier écusson dessiné. Sans stockage, valeurs par défaut.
 */
const KEY = 'valdorn:settings';

/** Polices proposées : « Lisible » (Atkinson Hyperlegible) ou « Pixel » (Pixelify Sans). */
export const FONTS = {
  readable: { label: 'Lisible', family: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif' },
  pixel: { label: 'Pixel', family: '"Pixelify Sans", monospace' },
};

const DEFAULTS = { font: 'readable', crest: null, heroName: null };

let cache = null;

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  if (!FONTS[cache.font]) cache.font = DEFAULTS.font;
  return cache;
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* navigation privée : réglage gardé pour cette session seulement */ }
}

export const fontFamily = () => FONTS[getSettings().font].family;
export const isPixelFont = () => getSettings().font === 'pixel';
