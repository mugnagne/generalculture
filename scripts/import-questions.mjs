#!/usr/bin/env node
/**
 * import-questions.mjs — Télécharge des questions depuis Quizz API et les
 * enregistre TELLES QUELLES dans `questions.json` (à la racine du site).
 *
 * À utiliser si l'API bloque les appels depuis le navigateur (CORS) :
 * le site lira alors ce fichier local (source « local » dans config.js).
 *
 * Aucune question n'est modifiée, complétée ou réécrite : les objets JSON
 * renvoyés par l'API sont recopiés à l'identique dans `items`. Seuls les
 * doublons (même identifiant) sont écartés.
 *
 * Usage (Node 18+) :
 *   node scripts/import-questions.mjs [--rounds 20] [--limit 50]
 *                                     [--category X] [--difficulty Y]
 *                                     [--endpoint URL] [--out questions.json]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]]);
    return acc;
  }, []),
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = args.endpoint ?? 'https://quizzapi.jomoreschi.fr/api/v1/quiz';
const ROUNDS = Number(args.rounds ?? 20);
const LIMIT = Number(args.limit ?? 50);
const OUT = path.resolve(ROOT, args.out ?? 'questions.json');

/** Même logique que questionSource.js : trouve le tableau de questions. */
function extractArray(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const value of Object.values(json)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value;
    }
  }
  return [];
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return res.json();
}

const items = new Map();
let firstResponse = null;

for (let round = 1; round <= ROUNDS; round++) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('limit', String(LIMIT));
  if (args.category) url.searchParams.set('category', args.category);
  if (args.difficulty) url.searchParams.set('difficulty', args.difficulty);

  try {
    const json = await fetchJson(url);
    firstResponse ??= json;
    const batch = extractArray(json);
    const before = items.size;
    for (const item of batch) {
      const key = item._id ?? item.id ?? JSON.stringify(item);
      if (!items.has(key)) items.set(key, item);
    }
    console.log(`Appel ${round}/${ROUNDS} : ${batch.length} reçues, ${items.size - before} nouvelles (total ${items.size})`);
  } catch (err) {
    console.error(`Appel ${round} échoué : ${err.message}`);
  }
}

if (!items.size) {
  console.error('Aucune question récupérée : questions.json n’a pas été écrit.');
  process.exit(1);
}

// Aide à vérifier le format réel de l'API (clés de la réponse et d'une question).
console.log('\nClés de la réponse brute :', Object.keys(firstResponse ?? {}));
console.log('Exemple de question brute :', JSON.stringify([...items.values()][0], null, 2));

await writeFile(OUT, JSON.stringify({
  meta: {
    source: 'Quizz API',
    homepage: 'https://quizzapi.jomoreschi.fr',
    endpoint: ENDPOINT,
    fetchedAt: new Date().toISOString(),
    count: items.size,
    note: 'Questions recopiées telles quelles depuis la source, sans modification.',
  },
  items: [...items.values()],
}, null, 2));

console.log(`\n${items.size} questions enregistrées dans ${path.relative(process.cwd(), OUT) || OUT}`);
