/**
 * app.js — Interface utilisateur (DOM uniquement).
 *
 * Ce fichier ne connaît ni l'API ni le format brut des questions :
 *  - les données viennent de questionSource.js (format interne) ;
 *  - les règles du jeu viennent de game.js ;
 *  - la persistance vient de storage.js.
 */
import { CONFIG } from './config.js';
import { getFilters, getQuestions, getActiveSource } from './questionSource.js';
import { Game, Timer, scoreMessage } from './game.js';
import { getBestScores, saveBestScore, reportQuestion } from './storage.js';

/* =================================================================== */
/*  Thèmes visuels des catégories                                       */
/* =================================================================== */

/**
 * Couleur + icône associées à une catégorie, choisies par mots-clés.
 * Les catégories elles-mêmes viennent de la source : cette table ne sert
 * qu'à les habiller. Une catégorie inconnue reçoit une couleur stable
 * calculée depuis son nom et une icône générique.
 */
const THEMES = [
  { re: /sport/i, icon: '⚽', color: '#22c55e' },
  { re: /cin[eé]|tv|t[eé]l[eé]|film|s[eé]rie/i, icon: '🎬', color: '#ef4444' },
  { re: /musi/i, icon: '🎵', color: '#ec4899' },
  { re: /jeu|video|vidéo|gaming/i, icon: '🎮', color: '#8b5cf6' },
  { re: /litt|livre|art|peint/i, icon: '🎨', color: '#f59e0b' },
  { re: /hist/i, icon: '🏛️', color: '#a16207' },
  { re: /g[eé]o/i, icon: '🌍', color: '#0ea5e9' },
  { re: /sci|tech|info/i, icon: '🔬', color: '#14b8a6' },
  { re: /nature|animal|anim/i, icon: '🌿', color: '#16a34a' },
  { re: /politi|actu/i, icon: '📰', color: '#64748b' },
  { re: /cuisine|gastro|food/i, icon: '🍽️', color: '#f97316' },
  { re: /culture|g[eé]n[eé]ral/i, icon: '💡', color: '#6366f1' },
];
const FALLBACK_COLORS = ['#6366f1', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#f59e0b'];
const ALL = { icon: '🎲', color: '#5b34f2', label: 'Toutes' };

function themeFor(category) {
  if (!category) return ALL;
  const found = THEMES.find((t) => t.re.test(category));
  if (found) return { ...found, label: humanize(category) };
  let h = 0;
  for (const c of category) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { icon: '❓', color: FALLBACK_COLORS[h % FALLBACK_COLORS.length], label: humanize(category) };
}

/** « tv_cinema » → « Tv / Cinema » (mise en forme seulement, aucun texte ajouté). */
function humanize(value) {
  return String(value)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('fr') + w.slice(1))
    .join(' / ');
}

/* =================================================================== */
/*  Raccourcis DOM                                                      */
/* =================================================================== */

const $ = (id) => document.getElementById(id);
const screens = ['home', 'loading', 'error', 'quiz', 'results'];

function show(name) {
  for (const s of screens) $('screen-' + s).hidden = s !== name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

let toastTimer = null;
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* =================================================================== */
/*  Groupe de boutons radio accessible (flèches + Espace/Entrée)        */
/* =================================================================== */

/**
 * @param {HTMLElement} container
 * @param {Array<{value:any, node:HTMLElement}>} items  boutons déjà construits
 * @param {any} selected
 * @param {(value:any)=>void} onChange
 */
function radioGroup(container, items, selected, onChange) {
  container.replaceChildren();
  const select = (index, focus) => {
    items.forEach((it, i) => {
      it.node.setAttribute('aria-checked', String(i === index));
      it.node.tabIndex = i === index ? 0 : -1;
    });
    if (focus) items[index].node.focus();
    onChange(items[index].value);
  };
  items.forEach((it, i) => {
    it.node.type = 'button';
    it.node.setAttribute('role', 'radio');
    it.node.addEventListener('click', () => select(i, false));
    it.node.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (delta) {
        e.preventDefault();
        select((i + delta + items.length) % items.length, true);
      }
    });
    container.append(it.node);
  });
  const start = Math.max(0, items.findIndex((it) => it.value === selected));
  select(start, false);
}

/* =================================================================== */
/*  État                                                                */
/* =================================================================== */

const settings = { category: null, difficulty: null, count: CONFIG.QUESTION_COUNTS[0] };
let game = null;
let timer = null;
let lastRetry = null; // action à relancer depuis l'écran d'erreur

/* =================================================================== */
/*  Accueil                                                             */
/* =================================================================== */

function renderCounts() {
  const items = CONFIG.QUESTION_COUNTS.map((n) => ({
    value: n,
    node: el('button', { class: 'seg' }, `${n} questions`),
  }));
  radioGroup($('count-list'), items, settings.count, (v) => { settings.count = v; });
}

function renderCategories(categories) {
  const items = [null, ...categories].map((cat) => {
    const t = themeFor(cat);
    return {
      value: cat,
      node: el('button', { class: 'chip', style: `--cat:${t.color}` },
        el('span', { class: 'chip-icon', 'aria-hidden': 'true' }, t.icon),
        el('span', { class: 'chip-label' }, t.label)),
    };
  });
  radioGroup($('category-list'), items, settings.category, (v) => { settings.category = v; });
}

function renderDifficulties(difficulties) {
  const items = [null, ...difficulties].map((d) => ({
    value: d,
    node: el('button', { class: 'seg' }, d ? humanize(d) : 'Toutes'),
  }));
  radioGroup($('difficulty-list'), items, settings.difficulty, (v) => { settings.difficulty = v; });
}

function renderBestScores() {
  const best = getBestScores();
  const list = $('best-list');
  list.replaceChildren();
  const entries = Object.entries(best).sort((a, b) => b[1].pct - a[1].pct);
  if (!entries.length) {
    list.append(el('li', { class: 'empty' }, 'Aucune partie jouée pour l’instant.'));
    return;
  }
  for (const [key, rec] of entries) {
    const t = themeFor(key === '__all__' ? null : key);
    list.append(el('li', {},
      el('span', {}, `${t.icon} ${t.label}`),
      el('strong', {}, `${rec.score}/${rec.total} (${rec.pct} %)`)));
  }
}

async function loadFilters() {
  const status = $('filters-status');
  $('category-list').replaceChildren(...Array.from({ length: 4 }, () => el('div', { class: 'skeleton', 'aria-hidden': 'true' })));
  $('difficulty-list').replaceChildren(el('div', { class: 'skeleton', style: 'flex:1;min-height:48px', 'aria-hidden': 'true' }));
  status.textContent = 'Chargement des catégories…';
  try {
    const { categories, difficulties } = await getFilters();
    renderCategories(categories);
    renderDifficulties(difficulties);
    status.textContent = '';
    updateCredit();
  } catch (err) {
    // Les filtres ne sont pas indispensables : on laisse jouer en « Toutes ».
    renderCategories([]);
    renderDifficulties([]);
    status.replaceChildren(
      `Catégories indisponibles : ${err.message} `,
      el('button', { type: 'button', class: 'btn btn-link small', onclick: loadFilters }, 'Réessayer'));
  }
}

function updateCredit() {
  const src = getActiveSource();
  const credit = $('source-credit');
  if (!src) return;
  credit.replaceChildren('Questions fournies par ',
    el('a', { href: src.homepage, target: '_blank', rel: 'noopener' }, src.attribution ?? src.label), '.');
}

/* =================================================================== */
/*  Partie                                                              */
/* =================================================================== */

async function startGame() {
  lastRetry = startGame;
  show('loading');
  try {
    const questions = await getQuestions({ ...settings });
    updateCredit();
    game = new Game(questions);
    show('quiz');
    renderQuestion();
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  $('error-message').textContent = err.message || 'Erreur inconnue.';
  show('error');
  $('retry-btn').focus();
}

function renderQuestion() {
  const q = game.current;
  const t = themeFor(q.categorie);

  const pill = $('quiz-category');
  pill.style.setProperty('--cat', t.color);
  pill.textContent = `${t.icon} ${t.label}${q.difficulte ? ' · ' + humanize(q.difficulte) : ''}`;

  $('quiz-progress-label').textContent = `${game.position}/${game.total}`;
  $('quiz-score').textContent = `Score : ${game.score}`;
  const bar = $('quiz-progress');
  bar.setAttribute('aria-valuemax', String(game.total));
  bar.setAttribute('aria-valuenow', String(game.position));
  bar.setAttribute('aria-valuetext', `Question ${game.position} sur ${game.total}`);
  $('quiz-progress-fill').style.width = `${((game.position - 1) / game.total) * 100}%`;

  $('question-text').textContent = q.question;

  const answers = $('answers');
  answers.replaceChildren();
  q.reponses.forEach((rep, i) => {
    answers.append(el('button', {
      type: 'button',
      class: 'answer',
      'data-value': rep,
      onclick: () => onAnswer(rep),
    }, el('span', { class: 'key', 'aria-hidden': 'true' }, String.fromCharCode(65 + i)),
    el('span', {}, rep),
    el('span', { class: 'mark', 'aria-hidden': 'true' })));
  });

  $('feedback').hidden = true;
  $('anecdote').hidden = true;
  $('report-btn').disabled = false;
  $('next-btn').textContent = game.isLast ? 'Voir les résultats' : 'Question suivante';
  $('question-text').focus();

  startTimer();
}

function startTimer() {
  const fill = $('timer-fill');
  const label = $('timer-label');
  timer?.stop();
  timer = new Timer(CONFIG.TIMER_SECONDS, {
    onTick(seconds, fraction, secondChanged) {
      fill.style.transform = `scaleX(${fraction})`;
      if (secondChanged) {
        label.textContent = `${seconds} s`;
        fill.classList.toggle('low', seconds <= 10 && seconds > 5);
        fill.classList.toggle('critical', seconds <= 5);
      }
    },
    onEnd: () => onAnswer(null),
  });
  timer.start();
}

function onAnswer(choice) {
  if (!game || game.answered) return;
  timer?.stop();
  const { correct, bonne_reponse } = game.answer(choice);

  for (const btn of $('answers').querySelectorAll('.answer')) {
    const value = btn.dataset.value;
    btn.disabled = true;
    const mark = btn.querySelector('.mark');
    if (value === bonne_reponse) {
      btn.classList.add('correct');
      mark.textContent = '✓';
      btn.setAttribute('aria-label', `${value} — bonne réponse`);
    } else if (value === choice) {
      btn.classList.add('wrong');
      mark.textContent = '✗';
      btn.setAttribute('aria-label', `${value} — votre réponse, incorrecte`);
    } else {
      btn.classList.add('dim');
    }
  }

  const result = $('feedback-result');
  result.className = 'feedback-result ' + (correct ? 'good' : 'bad');
  result.textContent = correct
    ? 'Bonne réponse !'
    : `${choice === null ? 'Temps écoulé !' : 'Mauvaise réponse.'} La bonne réponse était : ${bonne_reponse}`;

  // L'anecdote n'est affichée que si la source en fournit une.
  const anecdote = $('anecdote');
  if (game.current.anecdote) {
    anecdote.textContent = game.current.anecdote;
    anecdote.hidden = false;
  }

  $('quiz-score').textContent = `Score : ${game.score}`;
  $('quiz-progress-fill').style.width = `${(game.position / game.total) * 100}%`;
  $('feedback').hidden = false;
  $('next-btn').focus();
}

function nextQuestion() {
  if (game.next()) renderQuestion();
  else showResults();
}

/* =================================================================== */
/*  Résultats                                                           */
/* =================================================================== */

function showResults() {
  timer?.stop();
  const pct = game.percent;
  const isRecord = saveBestScore(settings.category ?? '__all__', game.score, game.total);

  $('score-ring').style.setProperty('--pct', String(pct));
  $('score-ring-label').textContent = `${pct} %`;
  $('results-score').textContent = `${game.score} / ${game.total} bonnes réponses`;
  $('results-message').textContent = scoreMessage(pct);
  $('results-record').hidden = !isRecord || game.score === 0;
  $('share-status').textContent = '';

  const list = $('mistakes-list');
  list.replaceChildren();
  const mistakes = game.mistakes;
  $('mistakes-section').hidden = mistakes.length === 0;
  for (const m of mistakes) {
    list.append(el('li', {},
      el('p', { class: 'q' }, m.question.question),
      el('p', { class: 'a' },
        m.choice === null
          ? el('span', { class: 'yours' }, 'Pas de réponse (temps écoulé)')
          : el('span', { class: 'yours' }, `Votre réponse : ${m.choice}`)),
      el('p', { class: 'a' }, el('span', { class: 'right' }, `Bonne réponse : ${m.question.bonne_reponse}`))));
  }

  show('results');
  $('results-title').focus();
}

async function shareScore() {
  const cat = themeFor(settings.category).label;
  const diff = settings.difficulty ? `, ${humanize(settings.difficulty)}` : '';
  const text = `🧠 J’ai obtenu ${game.score}/${game.total} au Quiz Culture Générale (${cat}${diff}) ! Saurez-vous faire mieux ? ${location.href.split('#')[0]}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Repli pour les navigateurs sans API Clipboard (ou hors HTTPS).
    const area = el('textarea', { style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) {
      $('share-status').textContent = text;
      return;
    }
  }
  $('share-status').textContent = 'Score copié dans le presse-papiers !';
  toast('Score copié dans le presse-papiers !');
}

/* =================================================================== */
/*  Événements                                                          */
/* =================================================================== */

function goHome() {
  timer?.stop();
  game = null;
  renderBestScores();
  show('home');
  $('play-btn').focus();
}

$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  startGame();
});
$('retry-btn').addEventListener('click', () => (lastRetry ?? startGame)());
$('error-home-btn').addEventListener('click', goHome);
$('next-btn').addEventListener('click', nextQuestion);
$('replay-btn').addEventListener('click', startGame);
$('home-btn').addEventListener('click', goHome);
$('share-btn').addEventListener('click', shareScore);
$('quit-btn').addEventListener('click', goHome);
$('report-btn').addEventListener('click', () => {
  if (!game) return;
  const added = reportQuestion(game.current);
  $('report-btn').disabled = true;
  toast(added ? 'Merci ! Cette question ne vous sera plus proposée.' : 'Question déjà signalée.');
});

// Raccourcis clavier pendant une question : A-D ou 1-4 pour répondre.
document.addEventListener('keydown', (e) => {
  if ($('screen-quiz').hidden || !game || game.answered) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toUpperCase();
  let index = '1234'.indexOf(key);
  if (index === -1) index = 'ABCD'.indexOf(key);
  const buttons = $('answers').querySelectorAll('.answer');
  if (index >= 0 && buttons[index]) {
    e.preventDefault();
    buttons[index].click();
  }
});

/* =================================================================== */
/*  Démarrage                                                           */
/* =================================================================== */

renderCounts();
renderBestScores();
loadFilters();
