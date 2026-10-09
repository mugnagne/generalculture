# ⚔️ La Reconquête de Valdorn

Jeu de conquête en pixel art (Phaser 3) : chaque bataille se gagne en répondant à des questions
de culture générale venues de Quizz API. Le quiz d'origine reste disponible sur `classique.html`.

- `index.html` : le jeu (écran titre → carte → combats → conquêtes → victoire finale → crédits).
  Paramètres de test : `?region=givre&bataille=1|2|3`, `?conquete=givre`, `?ecran=carte|finale|credits`.
- Crédits : l'écran lit `CREDITS.md` (chierit en premier, puis LuizMelo, Kronovi, Kenney).
- Sons facultatifs : voir `assets/audio/LISEZMOI.md` (touche M pour couper le son).
- Carte : régions = polygones de `src/data/regions.json`. Touche **E** sur la carte pour les retracer
  (1-9 : région, clic : point, glisser : déplacer, clic droit : retirer, X : exporter le JSON à recopier
  dans `src/data/regions.json`, R : revenir au fichier). Les modifications restent en brouillon local tant
  qu'on n'a pas remplacé le fichier.
- Progression : `localStorage` (`valdorn:save:v1`), bouton « Réinitialiser » sur la carte (double clic de confirmation).
- `debug.html` : toutes les animations du manifeste, à l'échelle du jeu, et les recolorations.
- Recoloration : règles par plage de teinte dans `src/data/recolor.js`, algorithme dans `src/recolor.js`,
  textures générées une fois au chargement (`src/variants.js`) ; les PNG d'origine ne changent pas.
- `src/` : scènes Phaser, données des régions (`src/data/world.js`), interface Kenney (`src/ui.js`).
- `scripts/build_assets.py` (Pillow) : régénère `assets/sprites/manifest.json` et `assets/generated/`
  (décors et carte en 480x270, palette). Les fichiers d'origine des assets ne sont jamais modifiés.
- Le jeu réutilise tel quel `js/questionSource.js` (via `src/questions.js`). Quand une réserve
  catégorie × difficulté compte moins de 10 questions, elle est complétée avec les niveaux voisins
  de la même catégorie.

---

# 🧠 Quiz Culture Générale (version classique : `classique.html`)

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
| `assets/` | Sprites, interface, palette, décors et carte (à ajouter ; dossiers vides suivis par `.gitkeep`) |
| `CREDITS.md` | Auteurs et licences des ressources graphiques |

Format interne d'une question :

```js
{ id, categorie, difficulte, question, reponses: [...], bonne_reponse, anecdote /* ou null */, source }
```

## Sources de questions

Les sources sont essayées dans l'ordre défini par `CONFIG.SOURCES` (`js/config.js`) :

1. **Quizz API** (<https://quizzapi.jomoreschi.fr>) : source principale, appelée directement
   depuis le navigateur (l'API autorise le CORS). Format vérifié sur une vraie réponse :
   `GET /api/v2/quiz?limit=…&category=…&difficulty=…` →
   `{ count, quizzes: [{ id, question, answer, badAnswers: [3], category, difficulty, categoryId }] }`.
   Sans `limit`, l'API renvoie tout son catalogue (≈ 870 questions) : le site le charge une fois,
   le met en cache 24 h et filtre localement. L'API ne fournit pas d'anecdote, donc aucune n'est affichée.
2. **OpenQuizzDB** (<https://www.openquizzdb.org>) : source de secours, **désactivée par défaut**
   parce que son API demande une clé personnelle. Pour l'activer, demandez une clé sur le site,
   renseignez `key` et passez `enabled: true`. Sa licence est CC BY-SA : la mention
   « OpenQuizzDB — Fourni par Openquizzdb.org » s'affiche alors automatiquement en bas de page.
3. **`questions.json`** : copie de secours de Quizz API, utilisée si l'API est indisponible.

Les catégories et difficultés ne sont pas codées en dur : le site les déduit des questions
renvoyées. La source qui a réellement servi les questions est citée en bas de page.

⚠️ L'ancienne adresse `/api/v1/quiz` renvoie la page HTML du site, sans en-tête CORS,
ce qui s'affichait comme une erreur CORS dans le navigateur. Seule `/api/v2/quiz` est la bonne.

### Copie de secours `questions.json`

Le workflow GitHub Actions `.github/workflows/import-questions.yml` lance le script
ci-dessous chaque lundi, à chaque modification du script, ou à la demande
(onglet **Actions → Importer les questions → Run workflow**), puis commite `questions.json`.

```bash
node scripts/import-questions.mjs              # tout le catalogue en un appel
```

Ce script (Node 18+) recopie les objets JSON de l'API **tels quels** dans `questions.json`,
sans rien modifier.

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
