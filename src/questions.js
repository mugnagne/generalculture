/**
 * questions.js — Tirage des questions du rogue-lite, branché sur le module existant
 * (js/questionSource.js, non modifié). Aucune question n'est jamais inventée.
 *
 * - Pas de répétition dans une partie (identifiants mémorisés dans run.usedQuestions).
 * - Ordre des questions et des réponses décidé par le flux « questions » de la graine :
 *   la réserve est d'abord triée par identifiant, puis tirée au sort de façon reproductible.
 * - Réserve épuisée : on passe aux difficultés voisines du même thème ; une question déjà
 *   posée n'est reprise qu'en tout dernier recours.
 */
import { getQuestions } from '../js/questionSource.js';
import { rngOf } from './core/rng.js';

const NEIGHBOURS = {
  facile: ['normal', 'difficile'],
  normal: ['facile', 'difficile'],
  difficile: ['normal', 'facile'],
};

/** Toutes les questions d'un thème et d'un niveau, dans un ordre stable. */
async function pool(theme, difficulty) {
  try {
    const all = await getQuestions({ category: theme, difficulty, count: 100000 });
    return all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  } catch (err) {
    if (err.kind === 'empty') return [];
    throw err;
  }
}

/**
 * Tire une question du thème `theme`, au niveau `difficulty` si possible.
 * @returns {Promise<object>} question au format interne, réponses mélangées par la graine,
 *   avec `theme` (catégorie demandée) en plus.
 */
export async function drawQuestion(run, { theme, difficulty }) {
  const rng = rngOf(run, 'questions');
  const used = new Set(run.usedQuestions);
  let fallback = null;
  for (const level of [difficulty, ...NEIGHBOURS[difficulty]]) {
    const list = await pool(theme, level);
    if (!fallback && list.length) fallback = list;
    const fresh = list.filter((q) => !used.has(q.id));
    if (fresh.length) return prepare(run, rng, rng.pick(fresh), theme);
  }
  if (!fallback) throw new Error(`Aucune question disponible pour le thème ${theme}.`);
  return prepare(run, rng, rng.pick(fallback), theme);
}

function prepare(run, rng, q, theme) {
  run.usedQuestions.push(q.id);
  const answers = [...q.reponses].sort((a, b) => a.localeCompare(b, 'fr'));
  return { ...q, theme, reponses: rng.shuffle(answers) };
}

/** Niveau de difficulté tiré selon les poids de balance.json (acte, type de combat). */
export function rollDifficulty(run, weights) {
  return rngOf(run, 'questions').weighted(weights);
}
