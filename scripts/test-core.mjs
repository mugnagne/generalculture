#!/usr/bin/env node
/**
 * test-core.mjs — Tests du cœur du mode rogue-lite (sans navigateur ni Phaser).
 * Usage : node scripts/test-core.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// localStorage minimal pour Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { DATA_FILES, initContent, usedEffectIds, getContent } = await import('../src/core/content.js');
const { Rng, initialStreams, rngOf } = await import('../src/core/rng.js');
const run_ = await import('../src/core/run.js');
const { implementedEffects } = await import('../src/core/effects.js');

const raw = Object.fromEntries(Object.entries(DATA_FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
initContent(raw);

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('✓', name);
};

test('le générateur est déterministe et ses flux sont indépendants', () => {
  const a = initialStreams('ABCD-1234');
  const b = initialStreams('ABCD-1234');
  const seqA = Array.from({ length: 5 }, () => new Rng(a.map).next());
  const seqB = Array.from({ length: 5 }, () => new Rng(b.map).next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(initialStreams('ABCD-1234').map, initialStreams('ABCD-1234').rewards);
  assert.notDeepEqual(initialStreams('ABCD-1234').map, initialStreams('ABCD-1235').map);
});

test("l'état du générateur survit à la sauvegarde JSON", () => {
  const s = initialStreams('XYZ');
  const r = new Rng(s.combat);
  r.next(); r.next();
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(new Rng(copy.combat).next(), new Rng(s.combat).next());
});

test('int, weighted et shuffle restent dans leurs bornes', () => {
  const r = new Rng(initialStreams('BORNES').map);
  for (let i = 0; i < 1000; i++) {
    const v = r.int(10, 20);
    assert.ok(v >= 10 && v <= 20);
  }
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 10000; i++) counts[r.weighted({ a: 70, b: 30 })]++;
  assert.ok(counts.a > 6500 && counts.a < 7500, JSON.stringify(counts));
  assert.deepEqual(r.shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});

test('une nouvelle partie suit les données (Maréchal : 30 PV, Feu de bivouac, 1 fiole commune)', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'TEST-0001' });
  assert.equal(run.hp, 30);
  assert.equal(run.maxHp, 30);
  assert.equal(run.gold, 0);
  assert.deepEqual(run.relics.map((r) => r.id), ['feu-de-bivouac']);
  const potions = run.consumables.filter(Boolean);
  assert.equal(potions.length, 1);
  assert.equal(getContent().consumableById[potions[0]].rarity, 'common');
  assert.equal(run.consumables.length, 3);
});

test('même graine → même partie de départ', () => {
  const a = run_.createRun({ characterId: 'marechal', seed: 'MEME-GRAINE' });
  const b = run_.createRun({ characterId: 'marechal', seed: 'meme-graine ' });
  assert.deepEqual(a.consumables, b.consumables);
  assert.deepEqual(a.rng, b.rng);
});

test('Feu de bivouac : +3 PV en fin de combat, sans dépasser le maximum', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'BIVOUAC' });
  run.hp = 20;
  run_.hooksFor(run).emit('onCombatEnd', run_.contextFor(run));
  assert.equal(run.hp, 23);
  run.hp = 29;
  run_.hooksFor(run).emit('onCombatEnd', run_.contextFor(run));
  assert.equal(run.hp, 30);
});

test('modificateurs : la base passe avant les bonus (Sablier fêlé 12 s + Sablier d’érudit +5 s = 17 s)', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'CHRONO' });
  run_.addRelic(run, 'sablier-d-erudit');
  run_.addRelic(run, 'sablier-fele');
  const timer = run_.hooksFor(run).modify('modifyTimer', 20, run_.contextFor(run));
  assert.equal(timer, 17);
});

test('dégâts : Lame affûtée seulement sur la première bonne réponse, Grimoire seulement sur son thème', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'DEGATS' });
  run_.addRelic(run, 'lame-affutee');
  run_.addRelic(run, 'grimoire-histoire');
  const hooks = run_.hooksFor(run);
  const dmg = (correctCount, theme) => hooks.modify('modifyDamageDealt', 1,
    run_.contextFor(run, { combat: { correctCount }, question: { theme } }));
  assert.equal(dmg(0, 'musique'), 3);
  assert.equal(dmg(1, 'musique'), 1);
  assert.equal(dmg(1, 'histoire'), 2);
  assert.equal(dmg(0, 'histoire'), 4);
});

test('Pacte du marchand double l’or ; Grand sac ajoute 2 emplacements', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'OR' });
  run_.addRelic(run, 'pacte-du-marchand');
  assert.equal(run_.gainGold(run, 15), 30);
  run_.addRelic(run, 'grand-sac');
  assert.equal(run.relicSlots, 7);
});

test('Fruit des collines : +7 PV max à l’obtention', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'FRUIT' });
  run_.addRelic(run, 'fruit-des-collines');
  assert.equal(run.maxHp, 37);
  assert.equal(run.hp, 37);
});

test('les emplacements de relique sont limités', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'SLOTS' });
  const ids = getContent().relics.filter((r) => r.id !== 'feu-de-bivouac').map((r) => r.id);
  let added = 0;
  for (const id of ids) if (run_.addRelic(run, id)) added++;
  assert.equal(run.relics.length, 5);
  assert.equal(added, 4);
});

test('Grimoire décliné en une version par thème (8, sans Culture générale)', () => {
  const g = getContent().relics.filter((r) => r.template === 'grimoire');
  assert.equal(g.length, 8);
  assert.ok(!g.some((r) => r.id.includes('culture_generale')));
});

test('sauvegarde et reprise', () => {
  const run = run_.createRun({ characterId: 'marechal', seed: 'SAUVE' });
  run.gold = 42;
  run_.saveRun(run);
  const back = run_.loadRun();
  assert.equal(back.gold, 42);
  assert.deepEqual(back.rng, run.rng);
  run_.deleteRun();
  assert.equal(run_.loadRun(), null);
});

// Couverture des effets : informatif (les manquants arrivent aux jalons suivants)
const used = usedEffectIds();
const done = new Set(implementedEffects());
const missing = used.filter((id) => !done.has(id));
console.log(`\n${passed} tests réussis.`);
console.log(`Effets utilisés dans les données : ${used.length}, implémentés : ${used.length - missing.length}.`);
if (missing.length) console.log(`À implémenter (jalons 2 à 4) : ${missing.join(', ')}`);
