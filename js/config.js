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
      // Désactivé : l'API n'envoie pas d'en-tête CORS, le navigateur bloque
      // donc l'appel. Les questions sont lues dans questions.json, généré par
      // le workflow GitHub Actions « Importer les questions ».
      enabled: false,
      label: 'Quizz API',
      homepage: 'https://quizzapi.jomoreschi.fr',
      // Endpoint et paramètres à VÉRIFIER dans la documentation de l'API
      // (https://quizzapi.jomoreschi.fr) : voir README, section « Source ».
      endpoint: 'https://quizzapi.jomoreschi.fr/api/v1/quiz',
      params: { limit: 'limit', category: 'category', difficulty: 'difficulty' },
      // Nombre de questions demandées pour découvrir les catégories/difficultés.
      discoveryLimit: 50,
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
      // Fichier généré par `node scripts/import-questions.mjs` lorsque
      // l'API bloque les appels depuis le navigateur (CORS).
      id: 'local',
      enabled: true,
      label: 'Quizz API (copie locale)',
      homepage: 'https://quizzapi.jomoreschi.fr',
      endpoint: 'questions.json',
    },
  ],
};
