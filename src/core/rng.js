/**
 * rng.js — Générateur pseudo-aléatoire à graine (sfc32), à état sauvegardable.
 *
 * Toute l'aléatoire d'une partie passe par ici. Chaque usage a son propre flux
 * (carte, récompenses, événements, questions, combat) dérivé de la graine : rejouer
 * une graine redonne la même carte même si l'on fait d'autres choix en route.
 * L'état de chaque flux (4 entiers) est stocké dans la partie sauvegardée.
 */

export const STREAMS = ['map', 'rewards', 'events', 'questions', 'combat', 'shop'];

/** Hachage de chaîne → 4 entiers 32 bits (xmur3), pour initialiser sfc32. */
function seedState(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  return [next(), next(), next(), next()];
}

/** Graine lisible, ex. « K7Q2-9XMA » (sans caractères ambigus). Seul usage du hasard non reproductible. */
export function newSeed() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Normalise une graine saisie par le joueur. */
export const normalizeSeed = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** États initiaux de tous les flux d'une graine. */
export function initialStreams(seed) {
  return Object.fromEntries(STREAMS.map((name) => [name, seedState(`${normalizeSeed(seed)}:${name}`)]));
}

/**
 * Générateur sur un état mutable [a, b, c, d] (partagé avec la sauvegarde).
 */
export class Rng {
  constructor(state) {
    this.s = state;
  }

  /** Flottant dans [0, 1). */
  next() {
    const s = this.s;
    let [a, b, c, d] = s;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    s[0] = a >>> 0; s[1] = b; s[2] = c; s[3] = d;
    return t / 4294967296;
  }

  /** Entier dans [min, max] (bornes incluses). */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Vrai avec une probabilité p (0..1). */
  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list.length ? list[Math.floor(this.next() * list.length)] : undefined;
  }

  /** Mélange de Fisher-Yates (nouvelle liste). */
  shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Tirage pondéré : { clé: poids } → clé. */
  weighted(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      if ((roll -= w) < 0) return key;
    }
    return entries.at(-1)?.[0];
  }
}

/** Accès aux flux d'une partie : rngOf(run, 'map').int(1, 3). */
export function rngOf(run, stream) {
  if (!run.rng[stream]) throw new Error(`Flux aléatoire inconnu : ${stream}`);
  return new Rng(run.rng[stream]);
}
