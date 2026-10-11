#!/usr/bin/env node
/**
 * simulate.mjs — Simulation de parties complètes avec le vrai moteur (src/core/), pour
 * l'équilibrage de src/data/balance.json. Les questions sont fictives : seule compte la
 * probabilité de bien répondre selon le niveau (aucune question n'est inventée pour le jeu).
 *
 * Usage : node scripts/simulate.mjs [parties par profil = 400]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };

const { DATA_FILES, initContent, getContent } = await import('../src/core/content.js');
const raw = Object.fromEntries(Object.entries(DATA_FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
initContent(raw);
const run_ = await import('../src/core/run.js');
const flow = await import('../src/core/flow.js');
const combat = await import('../src/core/combat.js');
const places = await import('../src/core/places.js');
const items = await import('../src/core/items.js');
const events = await import('../src/core/events.js');
const { reachableNodes } = await import('../src/core/mapgen.js');

/** Profils de joueur : probabilité de bonne réponse par niveau de l'API. */
const PROFILES = {
  faible: { facile: 0.6, normal: 0.45, difficile: 0.3 },
  moyen: { facile: 0.78, normal: 0.62, difficile: 0.45 },
  fort: { facile: 0.92, normal: 0.8, difficile: 0.65 },
};

let rand;
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let qid = 0;
const fakeQuestion = (theme) => ({ id: `sim${qid++}`, theme, bonne_reponse: 'A', reponses: ['A', 'B', 'C', 'D'] });

function takeRelic(run, id) {
  if (!id || run_.freeRelicSlots(run) <= 0) return;
  const def = getContent().relicById[id] ?? getContent().bossRelicById[id];
  run_.addRelic(run, id, { theme: def?.chooseTheme ? getContent().mapThemes[Math.floor(rand() * 8)] : undefined });
}

function useVials(run, when) {
  run.consumables.forEach((id, slot) => {
    if (!id) return;
    const ok = items.canUseConsumable(run, slot, { inCombat: when !== 'map', hasQuestion: when === 'question' }).ok;
    if (!ok) return;
    const heal = id === 'fiole-de-soin' || id === 'elixir-de-vigueur';
    if (heal && run.hp > run.maxHp * 0.5) return;
    if (id === 'bombe-fumigene' || id === 'parchemin-du-savant' || id === 'parchemin-d-echange') return;
    if (when === 'question' && ['cinquante-cinquante', 'avis-de-la-foule', 'sablier'].includes(id)) return; // gérés dans fight
    items.useConsumable(run, slot, { question: fakeQuestion(run.combat?.theme) });
  });
}

function fight(run, profile) {
  const cb = run.combat;
  if (cb.kind !== 'soldier') useVials(run, 'combat');
  for (let n = 0; n < 200; n++) {
    if (cb.enemy.hp <= 0) break;
    const q = fakeQuestion(combat.nextQuestionTheme(run));
    const difficulty = combat.questionDifficulty(run);
    const { timerSeconds } = combat.startQuestion(run, q);
    let p = profile[difficulty];
    // Aides : 50/50 et avis de la foule sur les questions difficiles des élites et boss
    if (cb.kind !== 'soldier') {
      const slot = run.consumables.findIndex((id) => id === 'cinquante-cinquante' || id === 'avis-de-la-foule');
      if (slot >= 0) {
        items.useConsumable(run, slot, { question: q });
        p = p + (1 - p) * 0.5;
      }
    }
    if (timerSeconds < 12) p -= 0.05; // chrono court
    const correct = rand() < p;
    let r = combat.resolveAnswer(run, q, correct ? 'correct' : 'wrong', 4000 + rand() * 10000, 'B');
    if (r.retry) r = combat.resolveAnswer(run, q, rand() < 0.5 ? 'correct' : 'wrong', 9000, 'C');
    if (r.heroDead) return false;
    if (run.hp < run.maxHp * 0.3) useVials(run, 'combat');
  }
  return true;
}

function simulate(profile, seed) {
  rand = mulberry(seed);
  const run = flow.newRun({ characterId: 'marechal', seed: `SIM-${seed}` });
  for (let step = 0; step < 200 && !run.over; step++) {
    const options = reachableNodes(run.map, run.position);
    const low = run.hp < run.maxHp * 0.5;
    const pick = options.find((n) => low && ['rest', 'shop', 'unknown', 'treasure'].includes(n.type))
      ?? options.find((n) => !low && n.type === 'elite')
      ?? options[Math.floor(rand() * options.length)];
    const next = flow.enterNode(run, pick.id);
    if (next.scene === 'combat') {
      if (!fight(run, profile)) {
        run.over = 'defeat';
        break;
      }
      const rw = combat.finishCombat(run, true);
      if (rw.consumable) run_.addConsumable(run, rw.consumable);
      rw.relics.forEach((id) => takeRelic(run, id));
      if (rw.bossRelics.length) takeRelic(run, rw.bossRelics[Math.floor(rand() * rw.bossRelics.length)]);
    } else if (next.scene === 'rest') {
      if (run.hp < run.maxHp * 0.75 && places.restOptions(run).canRest) places.rest(run);
      else places.study(run, getContent().mapThemes[Math.floor(rand() * 8)]);
    } else if (next.scene === 'shop') {
      if (run.hp < run.maxHp - 10) places.buyHeal(run);
      run.shop.relics.forEach((it, i) => { if (run_.freeRelicSlots(run) > 0 && run.gold >= it.price && places.payRelic(run, i)) takeRelic(run, it.id); });
      run.shop.consumables.forEach((it, i) => places.buyConsumable(run, i));
    } else if (next.scene === 'reward') {
      run.pendingRewards.relics.forEach((id) => takeRelic(run, id));
    } else if (next.scene === 'event') {
      const ev = events.eventDef(run);
      const i = ev.choices.findIndex((ch) => events.choiceAvailable(run, ch).ok && !(ev.id === 'sphinx' && run.hp < 12));
      events.chooseOption(run, Math.max(0, i));
      for (let k = 0; k < 10 && !run.over; k++) {
        const a = events.nextAction(run);
        if (!a) break;
        if (a.type === 'quiz') {
          const d = a.difficulty ?? 'normal';
          events.resolveEventQuiz(run, a, { theme: 'histoire' }, rand() < profile[d]);
        } else {
          if (a.type === 'gainRelic') takeRelic(run, a.id);
          if (a.type === 'chooseRelic') takeRelic(run, a.options[0]);
          if (a.type === 'trade') { events.tradeConsumable(run, a, run.consumables.findIndex(Boolean)); continue; }
          events.doneAction(run);
        }
      }
      if (run.over) break;
    }
    useVials(run, 'map');
    flow.completeNode(run);
  }
  return run;
}

const N = Number(process.argv[2] ?? 400);
for (const [name, profile] of Object.entries(PROFILES)) {
  let wins = 0;
  const deaths = { 1: 0, 2: 0, 3: 0 };
  const deathKinds = {};
  let floors = 0;
  let hpAtBoss = 0;
  for (let i = 0; i < N; i++) {
    const run = simulate(profile, i + 1);
    floors += run.stats.floorsCleared;
    if (run.over === 'victory') wins++;
    else {
      deaths[run.act]++;
      const kind = run.combat?.kind ?? 'événement';
      deathKinds[kind] = (deathKinds[kind] ?? 0) + 1;
    }
    hpAtBoss += run.stats.bossesWon;
  }
  const pct = (n) => `${Math.round((n / N) * 100)} %`;
  console.log(`${name.padEnd(7)} victoires ${pct(wins).padStart(5)} | morts acte 1 ${pct(deaths[1]).padStart(5)}, acte 2 ${pct(deaths[2]).padStart(5)}, acte 3 ${pct(deaths[3]).padStart(5)}`
    + ` | étages moyens ${(floors / N).toFixed(1)} | boss battus ${(hpAtBoss / N).toFixed(2)} | morts : ${JSON.stringify(deathKinds)}`);
}
