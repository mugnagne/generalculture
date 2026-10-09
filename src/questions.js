/**
 * questions.js — Branche le jeu sur le module de questions existant
 * (js/questionSource.js), sans le modifier.
 *
 * Certaines réserves catégorie × difficulté comptent moins de 10 questions
 * (ex. actu_politique / facile : 4). On complète alors avec les niveaux
 * voisins de la MÊME catégorie, sans jamais inventer de question.
 */
import { getQuestions } from '../js/questionSource.js';

const NEIGHBOURS = {
  facile: ['normal', 'difficile'],
  normal: ['facile', 'difficile'],
  difficile: ['normal', 'facile'],
};

/**
 * @returns {Promise<Array>} jusqu'à `count` questions au format interne
 *   { id, categorie, difficulte, question, reponses (mélangées), bonne_reponse, anecdote, source }
 */
export async function getBattleQuestions(category, difficulty, count) {
  const picked = [];
  for (const level of [difficulty, ...NEIGHBOURS[difficulty]]) {
    if (picked.length >= count) break;
    try {
      const batch = await getQuestions({ category, difficulty: level, count: count - picked.length });
      for (const q of batch) if (!picked.some((p) => p.id === q.id)) picked.push(q);
    } catch (err) {
      // Une réserve vide pour un niveau voisin n'est pas bloquante ;
      // une erreur réseau sur le niveau demandé, si.
      if (level === difficulty && err.kind !== 'empty') throw err;
    }
  }
  if (!picked.length) throw new Error('Aucune question disponible pour cette région.');
  return picked;
}
