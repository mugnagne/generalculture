/**
 * storage.js — Accès sécurisé au localStorage.
 *
 * Toutes les lectures/écritures sont protégées par try/catch : en navigation
 * privée ou si le stockage est plein, le jeu continue de fonctionner, il
 * oublie simplement ce qu'il aurait dû mémoriser.
 */
const PREFIX = 'quizcg:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Cache générique avec expiration ---------- */

export function cacheGet(key, ttlMs) {
  const entry = read('cache:' + key, null);
  if (!entry || Date.now() - entry.time > ttlMs) return null;
  return entry.data;
}

export function cacheSet(key, data) {
  write('cache:' + key, { time: Date.now(), data });
}

/* ---------- Meilleurs scores par catégorie ---------- */

export function getBestScores() {
  return read('best', {});
}

/** Enregistre le score s'il est meilleur (en %). Renvoie true si record. */
export function saveBestScore(categoryKey, score, total) {
  const best = getBestScores();
  const pct = total ? Math.round((score / total) * 100) : 0;
  const prev = best[categoryKey];
  if (!prev || pct > prev.pct) {
    best[categoryKey] = { pct, score, total, date: new Date().toISOString() };
    write('best', best);
    return true;
  }
  return false;
}

/* ---------- Questions déjà vues ---------- */

export function getSeenIds() {
  return new Set(read('seen', []));
}

export function addSeenIds(ids, maxSize) {
  const list = read('seen', []).filter((id) => !ids.includes(id));
  list.push(...ids);
  write('seen', list.slice(-maxSize));
}

/* ---------- Questions signalées ---------- */

export function getReports() {
  return read('reports', []);
}

export function getReportedIds() {
  return new Set(getReports().map((r) => r.id));
}

export function reportQuestion(question) {
  const reports = getReports();
  if (reports.some((r) => r.id === question.id)) return false;
  reports.push({
    id: question.id,
    source: question.source,
    question: question.question,
    date: new Date().toISOString(),
  });
  write('reports', reports);
  return true;
}
