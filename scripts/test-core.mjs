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

/* ---------------- Jalon 2 : carte et combats ---------------- */
const { generateActMap, reachableNodes, nodeById } = await import('../src/core/mapgen.js');
const flow = await import('../src/core/flow.js');
const combat = await import('../src/core/combat.js');

test('carte : règles respectées sur 1000 graines (3 actes chacune)', () => {
  const c = getContent();
  const cfg = c.balance.map;
  const fights = (n) => n.type === 'combat' || n.type === 'elite';
  let themesPerAct = 0;
  let floorsShort = 0;
  for (let i = 0; i < 1000; i++) {
    const run = run_.createRun({ characterId: 'marechal', seed: `CARTE-${i}` });
    for (let act = 1; act <= 3; act++) {
      const map = generateActMap(run, act);
      run.bossesByAct[act] = map.boss.region;
      assert.equal(map.floors.length, cfg.floors);
      const actThemes = new Set();
      map.floors.forEach((nodes, f) => {
        const floor = f + 1;
        assert.ok(nodes.length >= cfg.nodesPerFloor[0] && nodes.length <= cfg.nodesPerFloor[1]);
        const fixed = cfg.fixedFloors[String(floor)];
        for (const n of nodes) {
          if (fixed) assert.equal(n.type, fixed, `étage ${floor}`);
          if (floor < cfg.noEliteOrRestBeforeFloor) assert.ok(!['elite', 'rest'].includes(n.type));
          assert.ok(n.next.length >= 1, 'chaque case mène quelque part');
          if (floor > 1) assert.ok(map.floors[f - 1].some((p) => p.next.includes(n.id)), 'chaque case est atteignable');
          for (const id of n.next) {
            const child = nodeById(map, id);
            if (cfg.noConsecutive.includes(n.type)) assert.notEqual(child.type, n.type, `${n.type} consécutifs`);
          }
          if (fights(n)) {
            assert.ok(c.mapThemes.includes(n.theme));
            actThemes.add(n.theme);
          } else assert.equal(n.theme, undefined);
        }
        const themed = nodes.filter(fights);
        const distinct = new Set(themed.map((n) => n.theme)).size;
        assert.equal(distinct, themed.length, 'thèmes distincts sur un étage');
        if (themed.length < cfg.minThemesPerFloor && floor !== 3 && floor !== 5) floorsShort++;
      });
      themesPerAct += actThemes.size;
      assert.equal(map.boss.theme, 'culture_generale');
      if (act === 3) assert.equal(map.boss.region, 'hautecouronne');
      else assert.notEqual(map.boss.region, 'hautecouronne');
    }
    assert.notEqual(run.bossesByAct[1], run.bossesByAct[2]);
  }
  console.log(`  thèmes différents par acte en moyenne : ${(themesPerAct / 3000).toFixed(2)} / 8 ;`,
    `étages de combat avec moins de 3 combats : ${((floorsShort / 9000) * 100).toFixed(1)} %`);
});

test('déroulement : départ au pied de la carte, seules les cases reliées sont accessibles', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'FLOW' });
  assert.equal(run.resume.scene, 'map');
  const first = reachableNodes(run.map, run.position);
  assert.deepEqual(first.map((n) => n.floor), first.map(() => 1));
  const target = first[0];
  assert.throws(() => flow.enterNode(run, run.map.floors[1][0].id));
  const next = flow.enterNode(run, target.id);
  assert.equal(next.scene, 'combat');
  assert.equal(run.combat.kind, 'soldier');
  assert.equal(run.combat.theme, target.theme);
  assert.equal(run.combat.enemy.hp, 4);
  assert.equal(combat.intent(run).damage, 2);
});

test('combat : bonne réponse = dégâts à l’ennemi, erreur = dégâts de l’intention', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'COMBAT' });
  flow.enterNode(run, run.map.floors[0][0].id);
  const q = { id: 'q1', theme: run.combat.theme };
  combat.startQuestion(run, q);
  let r = combat.resolveAnswer(run, q, 'correct', 5000);
  assert.equal(r.dealt, 1);
  assert.equal(run.combat.enemy.hp, 3);
  r = combat.resolveAnswer(run, q, 'wrong', 5000);
  assert.equal(r.taken, 2);
  assert.equal(run.hp, 28);
  combat.resolveAnswer(run, q, 'timeout', 20000);
  assert.equal(run.hp, 26);
  assert.equal(run.stats.timeouts, 1);
  for (let i = 0; i < 3; i++) r = combat.resolveAnswer(run, q, 'correct', 1000);
  assert.ok(r.enemyDead);
  const rewards = combat.finishCombat(run, true);
  assert.ok(rewards.gold >= 10 && rewards.gold <= 20);
  assert.equal(run.gold, rewards.gold);
  assert.equal(run.hp, 29, 'Feu de bivouac en fin de combat');
  assert.ok([30, 50].includes(run.consumableDropChance));
  flow.completeNode(run);
  assert.equal(run.resume.scene, 'map');
  assert.equal(run.stats.floorsCleared, 1);
});

test('capacités : Rage, Régénération, Pression, Mirage, Érudition, Brume', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'CAPACITES' });
  flow.enterNode(run, run.map.floors[0][0].id);
  const cb = run.combat;
  const q = { id: 'q', theme: cb.theme };
  cb.enemy.abilities = ['rage', 'regeneration'];
  combat.startQuestion(run, q);
  combat.resolveAnswer(run, q, 'wrong', 1000);
  assert.equal(combat.intent(run).damage, 3);
  combat.resolveAnswer(run, q, 'timeout', 1000);
  assert.equal(combat.intent(run).damage, 4);
  cb.enemy.hp = 2;
  combat.startQuestion(run, q);
  combat.startQuestion(run, q);
  assert.equal(cb.enemy.hp, 2);
  combat.startQuestion(run, q); // 4e question : +1 PV
  assert.equal(cb.enemy.hp, 3);
  cb.enemy.abilities = ['pression'];
  assert.equal(combat.startQuestion(run, q).timerSeconds, 12);
  cb.enemy.abilities = ['mirage'];
  assert.equal(combat.startQuestion(run, q).timerSeconds, 15);
  cb.enemy.abilities = ['erudition', 'brume'];
  assert.equal(combat.questionDifficulty(run), 'difficile');
  assert.equal(combat.startQuestion(run, q).answerDelay, 3);
});

test('élite : valeurs de l’acte, une capacité et une relique en récompense', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'ELITE' });
  run.act = 2;
  combat.createCombat(run, { id: 'x', type: 'elite', theme: 'histoire' });
  assert.equal(run.combat.enemy.hp, 7);
  assert.equal(run.combat.enemy.damage, 4);
  assert.equal(run.combat.enemy.abilities.length, 1);
  assert.equal(run.combat.regionId, 'joute');
  const rewards = combat.finishCombat(run, true);
  assert.ok(rewards.gold >= 25 && rewards.gold <= 35);
  assert.equal(rewards.relics.length, 1);
  assert.ok(!run.relics.some((r) => r.id === rewards.relics[0]));
});

test('boss vaincu : soin de la moitié des PV manquants puis acte suivant ; acte 3 = victoire', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'BOSS' });
  run.position = run.map.floors.at(-1)[0].id;
  flow.enterNode(run, run.map.boss.id);
  assert.equal(run.combat.kind, 'boss');
  assert.equal(run.combat.enemy.hp, 10);
  assert.equal(run.combat.theme, 'culture_generale');
  run.hp = 10;
  combat.finishCombat(run, true); // Feu de bivouac : 13 PV
  flow.completeNode(run);
  assert.equal(run.hp, 13 + Math.round((30 - 13) / 2));
  assert.equal(run.act, 2);
  assert.equal(run.position, null);
  run.act = 3;
  run.map = generateActMap(run, 3);
  run.position = run.map.floors.at(-1)[0].id;
  flow.enterNode(run, run.map.boss.id);
  assert.equal(run.combat.regionId, 'hautecouronne');
  combat.finishCombat(run, true);
  flow.completeNode(run);
  assert.equal(run.over, 'victory');
  assert.equal(run.resume.scene, 'summary');
});

test('même graine → même carte', () => {
  const a = flow.newRun({ characterId: 'marechal', seed: 'MEME-CARTE' });
  const b = flow.newRun({ characterId: 'marechal', seed: 'MEME-CARTE' });
  assert.deepEqual(a.map, b.map);
});

// Couverture des effets : informatif (les manquants arrivent aux jalons suivants)
const used = usedEffectIds();
const done = new Set(implementedEffects());
const missing = used.filter((id) => !done.has(id));
console.log(`\n${passed} tests réussis.`);
console.log(`Effets utilisés dans les données : ${used.length}, implémentés : ${used.length - missing.length}.`);
if (missing.length) console.log(`À implémenter (jalons 2 à 4) : ${missing.join(', ')}`);
