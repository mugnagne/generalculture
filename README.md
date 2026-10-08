# 🧠 Quiz Culture Générale

Un quiz de culture générale en français, en HTML/CSS/JavaScript vanilla (modules ES),
sans backend ni étape de build. Il se déploie tel quel sur Netlify, Vercel ou GitHub Pages.

**Aucune question n'est écrite dans ce dépôt.** Elles viennent toutes d'une source externe.
Quand la source ne fournit pas d'anecdote, rien n'est affiché à cet endroit.

## Lancer en local

Les modules ES ne se chargent pas en `file://`, il faut donc un petit serveur :

```bash
python3 -m http.server 8000      # ou : npx serve .
# puis ouvrir http://localhost:8000
```

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Les 5 écrans : accueil, chargement, erreur, question, résultats |
| `css/style.css` | Thème clair/sombre automatique, mise en page mobile d'abord |
| `js/config.js` | **Sources de questions**, minuteur (20 s), timeout (8 s), cache (24 h) |
| `js/questionSource.js` | Couche d'adaptation : appels, conversion au format interne, mélange, cache, erreurs |
| `js/game.js` | Logique de jeu pure (score, progression, minuteur), sans DOM |
| `js/storage.js` | localStorage : cache, meilleurs scores, questions vues, signalements |
| `js/app.js` | Interface (DOM, clavier, accessibilité) |
| `scripts/import-questions.mjs` | Copie locale des questions dans `questions.json` (cas CORS) |

Format interne d'une question :

```js
{ id, categorie, difficulte, question, reponses: [...], bonne_reponse, anecdote /* ou null */, source }
```

## Sources de questions

Les sources sont essayées dans l'ordre défini par `CONFIG.SOURCES` (`js/config.js`) :

1. **Quizz API** (<https://quizzapi.jomoreschi.fr>) : source principale, appelée directement
   depuis le navigateur sur `GET /api/v1/quiz?limit=…&category=…&difficulty=…`.
2. **OpenQuizzDB** (<https://www.openquizzdb.org>) : source de secours, **désactivée par défaut**
   parce que son API demande une clé personnelle. Pour l'activer, demandez une clé sur le site,
   renseignez `key` et passez `enabled: true`. Sa licence est CC BY-SA : la mention
   « OpenQuizzDB — Fourni par Openquizzdb.org » s'affiche alors automatiquement en bas de page.
3. **`questions.json`** : une copie locale de Quizz API, utilisée si les deux sources précédentes échouent.

Le site ne code en dur ni les catégories ni les difficultés. Il les déduit des questions que
renvoie la source. La source qui a réellement servi les questions est citée en bas de page.

### ⚠️ À vérifier au premier lancement

Je n'ai pas pu joindre `quizzapi.jomoreschi.fr` ni `openquizzdb.org` depuis l'environnement
de développement : le réseau bloquait les deux domaines. Ce qui n'a donc **pas encore été
vérifié sur une vraie réponse** :

- le chemin de l'endpoint et les noms des paramètres (`limit`, `category`, `difficulty`). Ils se règlent dans `config.js` ;
- les noms des champs JSON. `normalizeQuizzApi()` cherche le premier tableau de la réponse,
  puis accepte `question`, `answer`/`correct_answer`, `badAnswers`/`incorrect_answers`, `category`,
  `difficulty`, `anecdote`, `_id`/`id`.

Si le format n'est pas reconnu, l'écran affiche « format non reconnu » et la console montre
un exemple brut. Il suffit alors d'ajuster `normalizeQuizzApi()`, rien d'autre.
Le script d'import affiche lui aussi la structure exacte de la réponse.

### Si l'API bloque les appels du navigateur (CORS)

```bash
node scripts/import-questions.mjs              # 20 appels × 50 questions, dédoublonnées
node scripts/import-questions.mjs --rounds 40  # pour en récupérer davantage
```

Ce script (Node 18+) recopie les objets JSON de l'API **tels quels** dans `questions.json`,
sans rien modifier. Committez ce fichier avec le site : la source « local » prendra le relais.
Pour ne servir que ce fichier, passez `enabled: false` sur la source `quizzapi`.

### Changer de source

1. Ajoutez une entrée dans `CONFIG.SOURCES` (`id`, `label`, `homepage`, `endpoint`…).
2. Ajoutez un adaptateur `{ fetchRaw, normalize }` du même `id` dans l'objet `ADAPTERS`
   de `questionSource.js`. `normalize` convertit une question brute au format interne et
   renvoie `null` quand il manque une donnée indispensable.

Ni le jeu ni l'interface n'ont besoin d'être modifiés.

## Fonctionnalités

- Choix de la catégorie (ou « Toutes »), de la difficulté et du nombre de questions (10 / 20)
- Minuteur de 20 s, barre de progression, score en direct
- Bonne réponse en vert, mauvaise en rouge, anecdote affichée si la source en fournit une
- Résultats : message selon le score, récapitulatif des erreurs, « Rejouer », « Partager mon score » (copie dans le presse-papiers)
- Meilleur score par catégorie (localStorage)
- Pas de répétition : les 300 dernières questions vues passent en dernier
- « Signaler une question » : l'id est stocké dans `localStorage['quizcg:reports']` et la question n'est plus proposée.
  Pour consulter les signalements : `JSON.parse(localStorage.getItem('quizcg:reports'))` dans la console.
- Cache des questions pendant 24 h. En cas de panne réseau, le jeu se rabat sur le cache, même expiré.
- Erreurs (réseau/CORS, HTTP, réponse vide, timeout de 8 s) : message clair et bouton « Réessayer »
- Accessibilité : navigation au clavier (flèches dans les choix, touches **A–D** ou **1–4** pour répondre),
  focus visible, rôles ARIA, contrastes suffisants, prise en compte de `prefers-reduced-motion`

## Déploiement

Il n'y a pas de build : publiez le dossier racine tel quel sur Netlify (drag & drop),
Vercel (preset « Other ») ou GitHub Pages (branche, dossier `/`).
