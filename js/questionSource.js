/**
 * questionSource.js — Couche d'adaptation entre les sources de questions
 * et le jeu.
 *
 * Rôle :
 *  1. appeler la source (API distante ou fichier local `questions.json`) ;
 *  2. convertir chaque question vers le FORMAT INTERNE unique :
 *       { id, categorie, difficulte, question, reponses: [...],
 *         bonne_reponse, anecdote | null, source }
 *  3. mélanger l'ordre des réponses à chaque partie ;
 *  4. gérer les erreurs (indisponible, réponse vide, timeout 8 s) ;
 *  5. mettre en cache les questions récupérées (localStorage, 24 h).
 *
 * Règle : aucune donnée n'est inventée. Une question à laquelle il manque
 * l'énoncé, la bonne réponse ou les mauvaises réponses est ignorée ; une
 * anecdote absente reste `null` et n'est simplement pas affichée.
 *
 * Pour brancher une nouvelle API : ajouter une entrée dans CONFIG.SOURCES
 * et un adaptateur { fetchRaw, normalize } dans l'objet ADAPTERS ci-dessous.
 */
import { CONFIG } from './config.js';
import {
  cacheGet, cacheSet, getSeenIds, addSeenIds, getReportedIds,
} from './storage.js';

/* =================================================================== */
/*  Erreurs                                                             */
/* =================================================================== */

export class QuestionSourceError extends Error {
  /**
   * @param {string} message  message lisible par le joueur
   * @param {'timeout'|'network'|'http'|'empty'|'format'} kind
   */
  constructor(message, kind) {
    super(message);
    this.name = 'QuestionSourceError';
    this.kind = kind;
  }
}

/** fetch() avec délai maximal ; convertit les échecs en QuestionSourceError. */
async function fetchJson(url, timeoutMs = CONFIG.FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new QuestionSourceError(
        `Le serveur de questions n'a pas répondu en ${timeoutMs / 1000} secondes.`, 'timeout');
    }
    // Un TypeError ici signifie : pas de réseau, serveur hors service,
    // ou appel bloqué par le navigateur (CORS). On ne peut pas les distinguer.
    throw new QuestionSourceError(
      'Impossible de joindre le serveur de questions (connexion ou blocage CORS).', 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new QuestionSourceError(
      `Le serveur de questions a répondu avec une erreur (${response.status}).`, 'http');
  }
  try {
    return await response.json();
  } catch {
    throw new QuestionSourceError('La réponse du serveur n’est pas un JSON valide.', 'format');
  }
}

/* =================================================================== */
/*  Outils                                                              */
/* =================================================================== */

/** Mélange de Fisher-Yates (renvoie une nouvelle liste). */
export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Premier champ non vide parmi plusieurs noms possibles. */
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/** Hash court et stable, utilisé si la source ne fournit pas d'identifiant. */
function hashId(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}

/**
 * Trouve le tableau de questions dans une réponse JSON : soit la réponse
 * elle-même, soit la première propriété de type tableau d'objets.
 */
function extractArray(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const value of Object.values(json)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value;
    }
  }
  return [];
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const uniq = (arr) => [...new Set(arr)];

/* =================================================================== */
/*  Adaptateurs (un par source)                                         */
/* =================================================================== */

/**
 * Quizz API — https://quizzapi.jomoreschi.fr
 *
 * ⚠️ Le format exact doit être vérifié sur une vraie réponse de l'API
 * (voir README). La conversion accepte les noms de champs les plus probables
 * (`answer` / `badAnswers`, etc.) ; si aucune question n'est reconnue, une
 * erreur « format » est levée et un exemple brut est affiché dans la console
 * pour pouvoir ajuster ce seul endroit.
 */
function normalizeQuizzApi(item, sourceLabel) {
  const question = clean(pick(item, 'question', 'enonce', 'text'));
  const good = clean(pick(item, 'answer', 'correct_answer', 'correctAnswer', 'bonne_reponse', 'reponse_correcte'));
  let bad = pick(item, 'badAnswers', 'bad_answers', 'incorrect_answers', 'incorrectAnswers', 'mauvaises_reponses', 'wrongAnswers');
  if (!question || !good || !Array.isArray(bad) || !bad.length) return null;
  bad = bad.map(clean).filter((b) => b && b !== good);
  return {
    id: String(pick(item, '_id', 'id') ?? hashId(question)),
    categorie: clean(pick(item, 'category', 'categorie', 'theme')) ?? null,
    difficulte: clean(pick(item, 'difficulty', 'difficulte', 'level')) ?? null,
    question,
    reponses: uniq([good, ...bad]),
    bonne_reponse: good,
    anecdote: clean(pick(item, 'anecdote', 'explanation', 'explication')) ?? null,
    source: sourceLabel,
  };
}

/**
 * OpenQuizzDB — https://www.openquizzdb.org (clé d'API obligatoire).
 * Champs documentés : question, reponse_correcte, autres_choix (contient
 * déjà la bonne réponse), anecdote, categorie, difficulte.
 */
function normalizeOpenQuizzDb(item, sourceLabel) {
  const question = clean(item.question);
  const good = clean(item.reponse_correcte);
  const choices = Array.isArray(item.autres_choix) ? item.autres_choix.map(clean).filter(Boolean) : [];
  if (!question || !good || choices.length < 2) return null;
  return {
    id: 'oqdb-' + String(item.id ?? hashId(question)),
    categorie: clean(item.categorie) ?? clean(item.theme) ?? null,
    difficulte: clean(item.difficulte) ?? null,
    question,
    reponses: uniq([good, ...choices]),
    bonne_reponse: good,
    anecdote: clean(item.anecdote) ?? null,
    source: sourceLabel,
  };
}

const ADAPTERS = {
  quizzapi: {
    async fetchRaw(src, { category, difficulty, limit }) {
      const url = new URL(src.endpoint);
      url.searchParams.set(src.params.limit, String(limit));
      if (category) url.searchParams.set(src.params.category, category);
      if (difficulty) url.searchParams.set(src.params.difficulty, difficulty);
      return extractArray(await fetchJson(url.toString()));
    },
    normalize: normalizeQuizzApi,
  },

  openquizzdb: {
    async fetchRaw(src, { limit }) {
      if (!src.key) throw new QuestionSourceError('Clé OpenQuizzDB manquante.', 'http');
      const url = new URL(src.endpoint);
      url.searchParams.set('key', src.key);
      // L'API renvoie peu de questions par appel : on enchaîne quelques appels.
      const items = [];
      for (let i = 0; i < Math.min(limit, 20) && items.length < limit; i++) {
        items.push(...extractArray(await fetchJson(url.toString())));
      }
      return items;
    },
    normalize: normalizeOpenQuizzDb,
  },

  local: {
    async fetchRaw(src) {
      // Fichier produit par scripts/import-questions.mjs : { meta, items: [...] }
      const json = await fetchJson(src.endpoint);
      return Array.isArray(json.items) ? json.items : extractArray(json);
    },
    normalize: normalizeQuizzApi,
  },
};

/* =================================================================== */
/*  Récupération + cache                                                */
/* =================================================================== */

let activeSource = null; // source ayant fourni les dernières questions

/** Source effectivement utilisée (pour la mention en bas de page). */
export function getActiveSource() {
  return activeSource;
}

function enabledSources() {
  return CONFIG.SOURCES.filter((s) => s.enabled && ADAPTERS[s.id]);
}

/** Interroge une source et renvoie des questions au format interne. */
async function loadFromSource(src, filters) {
  const raw = await ADAPTERS[src.id].fetchRaw(src, filters);
  if (!raw.length) {
    throw new QuestionSourceError('Aucune question n’a été renvoyée pour ces critères.', 'empty');
  }
  const label = src.attribution ?? src.label;
  const questions = raw.map((item) => ADAPTERS[src.id].normalize(item, label)).filter(Boolean);
  if (!questions.length) {
    console.warn(`[questionSource] Format non reconnu pour « ${src.id} ». Exemple brut :`, raw[0]);
    throw new QuestionSourceError('Le format des questions reçues n’est pas reconnu.', 'format');
  }
  return questions;
}

/** Filtre côté client (au cas où la source ignore un paramètre). */
function matches(q, { category, difficulty }) {
  return (!category || q.categorie === category) && (!difficulty || q.difficulte === difficulty);
}

/** Fusionne deux listes de questions sans doublon (par id). */
function mergeById(a, b) {
  const map = new Map(a.map((q) => [q.id, q]));
  for (const q of b) map.set(q.id, q);
  return [...map.values()];
}

/**
 * Renvoie un « réservoir » de questions pour les filtres donnés, en
 * utilisant le cache si possible. Essaie chaque source activée dans l'ordre.
 */
async function getPool(filters, wanted) {
  const cacheKey = `pool:${filters.category ?? '*'}:${filters.difficulty ?? '*'}`;
  const cached = cacheGet(cacheKey, CONFIG.CACHE_TTL_MS);
  const excluded = new Set([...getSeenIds(), ...getReportedIds()]);

  if (cached?.questions?.length) {
    const fresh = cached.questions.filter((q) => !excluded.has(q.id));
    if (fresh.length >= wanted) {
      activeSource = CONFIG.SOURCES.find((s) => s.id === cached.sourceId) ?? null;
      return cached.questions;
    }
  }

  let firstError = null; // l'erreur de la source principale est la plus parlante
  for (const src of enabledSources()) {
    try {
      const limit = Math.min(Math.max(wanted * 3, 30), 50);
      const loaded = (await loadFromSource(src, { ...filters, limit })).filter((q) => matches(q, filters));
      if (!loaded.length) {
        throw new QuestionSourceError('Aucune question disponible pour ces critères.', 'empty');
      }
      const pool = cached?.sourceId === src.id ? mergeById(cached.questions, loaded) : loaded;
      cacheSet(cacheKey, { sourceId: src.id, questions: pool });
      activeSource = src;
      return pool;
    } catch (err) {
      console.warn(`[questionSource] Source « ${src.id} » indisponible :`, err.message);
      firstError ??= err;
    }
  }

  // Toutes les sources ont échoué : on se rabat sur un cache même partiel.
  if (cached?.questions?.length) {
    activeSource = CONFIG.SOURCES.find((s) => s.id === cached.sourceId) ?? null;
    return cached.questions;
  }
  throw firstError ?? new QuestionSourceError('Aucune source de questions n’est configurée.', 'http');
}

/* =================================================================== */
/*  API publique du module                                              */
/* =================================================================== */

/** Ordre d'affichage des difficultés connues ; les autres suivent par ordre alphabétique. */
const DIFFICULTY_ORDER = ['facile', 'easy', 'normal', 'moyen', 'medium', 'confirmé', 'difficile', 'hard', 'expert'];

/**
 * Découvre les catégories et difficultés à partir des questions réellement
 * renvoyées par la source (rien n'est codé en dur).
 * @returns {Promise<{categories: string[], difficulties: string[]}>}
 */
export async function getFilters() {
  const pool = await getPool({}, 1);
  const categories = uniq(pool.map((q) => q.categorie).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'fr'));
  const rank = (d) => {
    const i = DIFFICULTY_ORDER.indexOf(d.toLowerCase());
    return i === -1 ? 99 : i;
  };
  const difficulties = uniq(pool.map((q) => q.difficulte).filter(Boolean))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
  return { categories, difficulties };
}

/**
 * Prépare les questions d'une partie.
 * - écarte les questions signalées ;
 * - privilégie celles qui n'ont pas été vues récemment ;
 * - mélange l'ordre des questions ET des réponses.
 * @param {{category?: string, difficulty?: string, count: number}} options
 */
export async function getQuestions({ category = null, difficulty = null, count }) {
  const pool = await getPool({ category, difficulty }, count);
  const reported = getReportedIds();
  const seen = getSeenIds();
  const usable = pool.filter((q) => !reported.has(q.id));
  if (!usable.length) {
    throw new QuestionSourceError('Aucune question disponible pour ces critères.', 'empty');
  }
  const unseen = shuffle(usable.filter((q) => !seen.has(q.id)));
  const alreadySeen = shuffle(usable.filter((q) => seen.has(q.id)));
  const selection = [...unseen, ...alreadySeen].slice(0, count);

  addSeenIds(selection.map((q) => q.id), CONFIG.SEEN_HISTORY_SIZE);
  return selection.map((q) => ({ ...q, reponses: shuffle(q.reponses) }));
}
