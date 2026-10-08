/**
 * config.js — Paramètres centralisés du quiz.
 *
 * Pour changer de source de questions, il suffit en général de modifier
 * ce fichier (URL, clé) et, si le format JSON diffère, d'ajouter un
 * « adaptateur » dans questionSource.js.
 */
export const CONFIG = {
  /** Durée du minuteur par question, en secondes. */
  TIMER_SECONDS: 20,

  /** Nombres de questions proposés sur l'accueil. */
  QUESTION_COUNTS: [10, 20],

  /** Délai maximal d'un appel réseau, en millisecondes. */
  FETCH_TIMEOUT_MS: 8000,

  /** Durée de validité du cache localStorage (24 h). */
  CACHE_TTL_MS: 24 * 60 * 60 * 1000,

  /** Nombre d'identifiants de questions « déjà vues » mémorisés. */
  SEEN_HISTORY_SIZE: 300,

  /**
   * Sources essayées dans l'ordre. La première qui renvoie des questions
   * exploitables est utilisée. Mettre `enabled: false` pour en désactiver une.
   */
  SOURCES: [
    {
      id: 'quizzapi',
      enabled: true,
      label: 'Quizz API',
      homepage: 'https://quizzapi.jomoreschi.fr',
      // Endpoint vérifié : GET /api/v2/quiz?limit=&category=&difficulty=
      // → { count, quizzes: [{ id, question, answer, badAnswers[3],
      //     category, difficulty, categoryId }] }  (CORS autorisé : « * »)
      // Pas d'anecdote dans cette API : rien n'est donc affiché à cet endroit.
      endpoint: 'https://quizzapi.jomoreschi.fr/api/v2/quiz',
      params: { limit: 'limit', category: 'category', difficulty: 'difficulty' },
      // Sans `limit`, l'API renvoie tout le catalogue (≈ 870 questions, ~300 Ko) :
      // on le charge une fois, on le met en cache 24 h et on filtre localement.
      fetchAll: true,
    },
    {
      id: 'openquizzdb',
      // OpenQuizzDB exige une clé d'API personnelle (gratuite, sur demande
      // sur https://www.openquizzdb.org). Renseignez-la puis passez à true.
      enabled: false,
      key: '',
      label: 'OpenQuizzDB',
      homepage: 'https://www.openquizzdb.org',
      endpoint: 'https://api.openquizzdb.org/',
      // Mention exigée par la licence CC BY-SA d'OpenQuizzDB.
      attribution: 'OpenQuizzDB — Fourni par Openquizzdb.org (licence CC BY-SA)',
    },
    {
      // Copie de secours générée par `node scripts/import-questions.mjs`
      // (workflow GitHub Actions hebdomadaire), utilisée si l'API est en panne.
      id: 'local',
      enabled: true,
      label: 'Quizz API (copie locale)',
      homepage: 'https://quizzapi.jomoreschi.fr',
      endpoint: 'questions.json',
    },
  ],
};
