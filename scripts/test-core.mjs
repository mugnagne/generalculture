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

/* ---------------- Jalon 3 : fioles, reliques, lieux ---------------- */
const items = await import('../src/core/items.js');
const places = await import('../src/core/places.js');

/** Partie de test en plein combat de soldat (acte 1), question factice prête. */
function fight(seed, { relics = [], consumables = [] } = {}) {
  const run = flow.newRun({ characterId: 'marechal', seed });
  run.consumables = [null, null, null];
  for (const id of relics) run_.addRelic(run, id);
  for (const id of consumables) run_.addConsumable(run, id);
  flow.enterNode(run, run.map.floors[0][0].id);
  const q = { id: 'q', theme: run.combat.theme, bonne_reponse: 'A', reponses: ['A', 'B', 'C', 'D'] };
  combat.startQuestion(run, q);
  return { run, q, cb: run.combat };
}

test('fioles : feu, bouclier, huile, rage du berserker', () => {
  let { run, q, cb } = fight('FIOLES', { consumables: ['fiole-de-feu', 'bouclier-de-bois', 'huile-de-lame'] });
  items.useConsumable(run, 0, { question: q });
  assert.equal(cb.enemy.hp, 2);
  items.useConsumable(run, 1, { question: q });
  assert.equal(combat.resolveAnswer(run, q, 'wrong', 1000, 'B').taken, 0);
  assert.equal(combat.resolveAnswer(run, q, 'wrong', 1000, 'B').taken, 2, 'le bouclier ne sert qu’une fois');
  items.useConsumable(run, 2, { question: q });
  cb.enemy.hp = 50;
  const dealt = [1, 2, 3, 4].map(() => combat.resolveAnswer(run, q, 'correct', 9000).dealt);
  assert.deepEqual(dealt, [2, 2, 2, 1]);
  assert.deepEqual(run.consumables, [null, null, null]);

  ({ run, q, cb } = fight('BERSERK', { consumables: ['rage-du-berserker', 'rage-du-berserker'] }));
  items.useConsumable(run, 0, { question: q });
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 2);
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 1);
  items.useConsumable(run, 1, { question: q });
  assert.equal(combat.resolveAnswer(run, q, 'timeout', 20000).taken, 4);
});

test('fioles : 50/50, avis de la foule, sablier, échange, savant, chaudron, fumigène', () => {
  const { run, q, cb } = fight('FIOLES2', { consumables: ['cinquante-cinquante', 'avis-de-la-foule', 'sablier'] });
  let [a] = items.useConsumable(run, 0, { question: q });
  assert.equal(a.type, 'removeAnswers');
  assert.equal(a.answers.length, 2);
  assert.ok(!a.answers.includes('A'));
  [a] = items.useConsumable(run, 1, { question: q });
  const votes = Object.values(a.votes);
  assert.equal(votes.reduce((x, y) => x + y, 0), 100);
  assert.equal(votes.length, 2, 'pas de vote pour les réponses retirées');
  assert.ok(a.votes.A > Math.max(...Object.entries(a.votes).filter(([k]) => k !== 'A').map(([, v]) => v)));
  [a] = items.useConsumable(run, 2, { question: q });
  assert.deepEqual(a, { type: 'addTime', seconds: 15 });
  assert.equal(items.canUseConsumable(run, 0, { inCombat: true }).ok, false);
  run_.addConsumable(run, 'parchemin-d-echange');
  assert.equal(items.canUseConsumable(run, 0, { inCombat: true, hasQuestion: false }).ok, false);
  assert.equal(items.canUseConsumable(run, 0, { inCombat: true, hasQuestion: true }).ok, true);
  run_.addConsumable(run, 'chaudron-de-l-alchimiste');
  items.useConsumable(run, 1, { question: q });
  assert.equal(run.consumables.filter(Boolean).length, 3);
  run.consumables = ['bombe-fumigene', 'fiole-de-soin', null];
  assert.equal(items.canUseConsumable(run, 1).ok, true, 'la fiole de soin marche hors combat');
  assert.equal(items.canUseConsumable(run, 0).ok, false, 'la bombe non');
  cb.kind = 'boss';
  assert.equal(items.canUseConsumable(run, 0, { inCombat: true }).ok, false, 'pas de fuite face au boss');
  cb.kind = 'soldier';
  assert.deepEqual(items.useConsumable(run, 0, { question: q }), [{ type: 'flee' }]);
  assert.equal(cb.over, 'fled');
});

test('Fée en bouteille et Queue de lézard : résurrection', () => {
  const { run, q } = fight('FEE', { relics: ['queue-de-lezard'], consumables: ['fee-en-bouteille'] });
  run.hp = 1;
  let r = combat.resolveAnswer(run, q, 'wrong', 1000, 'B');
  assert.ok(!r.heroDead);
  assert.equal(r.revived, 'queue-de-lezard');
  assert.equal(run.hp, 15);
  run.hp = 1;
  r = combat.resolveAnswer(run, q, 'wrong', 1000, 'B');
  assert.equal(r.revived, 'fee-en-bouteille');
  assert.equal(run.hp, 9);
  assert.deepEqual(run.consumables, [null, null, null]);
  run.hp = 1;
  assert.ok(combat.resolveAnswer(run, q, 'wrong', 1000, 'B').heroDead);
});

test('reliques de dégâts : élan, coup de grâce, polymathe, encyclopédie, spécialiste', () => {
  let { run, q, cb } = fight('ELAN', { relics: ['elan-du-duelliste'] });
  cb.enemy.hp = 50;
  assert.deepEqual([1, 2, 3].map(() => combat.resolveAnswer(run, q, 'correct', 9000).dealt), [1, 2, 3]);
  combat.resolveAnswer(run, q, 'wrong', 9000, 'B');
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 1);

  ({ run, q, cb } = fight('GRACE', { relics: ['coup-de-grace'] }));
  cb.enemy.hp = 2;
  assert.ok(combat.resolveAnswer(run, q, 'correct', 9000).enemyDead);

  ({ run, q, cb } = fight('POLY', { relics: ['polymathe'] }));
  cb.enemy.hp = 50;
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 1);
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 2);

  ({ run, q, cb } = fight('ENCYCLO', { relics: ['encyclopedie-vivante'] }));
  cb.enemy.hp = 500;
  for (let i = 0; i < 15; i++) combat.resolveAnswer(run, q, 'correct', 9000);
  assert.equal(run.bonuses.damage, 1);

  ({ run, q, cb } = fight('SPECIALISTE'));
  run_.addRelic(run, 'specialiste', { theme: cb.theme });
  cb.enemy.hp = 50;
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).dealt, 2);
  assert.equal(combat.resolveAnswer(run, q, 'wrong', 9000, 'B').taken, 4);
  assert.equal(combat.resolveAnswer(run, { ...q, theme: 'autre' }, 'wrong', 9000, 'B').taken, 2);
});

test('reliques de survie : armure de cuir, seconde chance', () => {
  let { run, q } = fight('ARMURE', { relics: ['armure-de-cuir'] });
  assert.equal(combat.resolveAnswer(run, q, 'wrong', 1000, 'B').taken, 0);
  assert.equal(combat.resolveAnswer(run, q, 'wrong', 1000, 'B').taken, 2);
  ({ run, q } = fight('SECONDE', { relics: ['seconde-chance'] }));
  const r = combat.resolveAnswer(run, q, 'wrong', 1000, 'B');
  assert.ok(r.retry);
  assert.equal(r.removed.length, 2);
  assert.equal(r.removed[0], 'B');
  assert.ok(!r.removed.includes('A'));
  assert.equal(run.hp, 30);
  assert.ok(!combat.resolveAnswer(run, q, 'wrong', 1000, 'C').retry, 'une fois par combat');
});

test('reliques de marchand : tirelire, ticket de repas, œuf d’or', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'MARCHAND' });
  run_.addRelic(run, 'tirelire');
  run_.addRelic(run, 'ticket-de-repas');
  run_.addRelic(run, 'oeuf-d-or');
  flow.enterNode(run, run.map.floors[0][0].id);
  assert.equal(run.gold, 10);
  combat.finishCombat(run, true);
  const egg = run.relics.find((r) => r.id === 'oeuf-d-or');
  assert.equal(run_.sellValue(egg), 125 + 5);
  run.hp = 10;
  run.gold = 500;
  places.enterShop(run, { id: 'shop-test' });
  assert.equal(run.hp, 25);
  assert.ok(places.buyHeal(run));
  assert.ok(!places.buyHeal(run), 'soin payant : une fois par visite');
  const g = run.gold;
  run.combat = null;
  flow.completeNode(run);
  flow.enterNode(run, run.map.floors[1].find((n) => run.map.floors[0][0].next.includes(n.id)).id);
  assert.equal(run.gold, g, 'la tirelire est cassée après un achat');
});

test('marchand : stock gardé, achat, revente', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'BOUTIQUE' });
  run.gold = 1000;
  const node = { id: 'n' };
  const shop = places.enterShop(run, node);
  assert.equal(shop.consumables.length, 3);
  assert.equal(shop.relics.length, 3);
  assert.equal(places.enterShop(run, node), shop, 'stock identique en revenant');
  run.consumables = [null, null, null];
  assert.ok(places.buyConsumable(run, 0));
  assert.ok(!places.buyConsumable(run, 0), 'déjà vendu');
  assert.equal(run.gold, 1000 - shop.consumables[0].price);
  const before = run.gold;
  const value = places.sellRelic(run, run.relics[0]);
  assert.equal(value, 75);
  assert.equal(run.gold, before + 75);
  assert.equal(run.relics.length, 0);
});

test('feu de camp : repos (30 % des PV max) ou étude ; Couronne de l’Usurpateur', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'REPOS' });
  run.hp = 5;
  assert.equal(places.rest(run), 9);
  places.study(run, 'histoire');
  const q = { theme: 'histoire' };
  combat.createCombat(run, { id: 'x', type: 'combat', theme: 'histoire' });
  assert.equal(combat.damageFor(run, q), 2);
  run_.addRelic(run, 'couronne-de-l-usurpateur');
  assert.equal(places.restOptions(run).canRest, false);
  assert.equal(places.rest(run), 0);
});

test('reliques de boss : choix de 3, Étoile noire, Pacte du marchand', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'BOSSRELIC' });
  run.position = run.map.floors.at(-1)[0].id;
  flow.enterNode(run, run.map.boss.id);
  const rewards = combat.finishCombat(run, true);
  assert.equal(new Set(rewards.bossRelics).size, 3);
  run_.addRelic(run, 'etoile-noire');
  run_.addRelic(run, 'pacte-du-marchand');
  combat.createCombat(run, { id: 'e', type: 'elite', theme: 'histoire' });
  assert.equal(run.combat.enemy.hp, 8);
  const r = combat.finishCombat(run, true);
  assert.equal(r.relics.length, 2);
  assert.equal(r.consumable, null);
  assert.ok(r.gold >= 50 && r.gold <= 70);
});

test('Bottes ailées : 3 sauts hors des chemins', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'BOTTES-1' });
  run_.addRelic(run, 'bottes-ailees');
  flow.enterNode(run, run.map.floors[0][0].id);
  run.combat = null;
  const off = flow.freeTravelNodes(run);
  if (off.length) {
    flow.enterNode(run, off[0].id);
    assert.equal(flow.freeTravelLeft(run), 2);
  }
});

test('trésor : une relique non possédée', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'TRESOR' });
  const r = places.openTreasure(run);
  assert.equal(r.relics.length, 1);
  assert.notEqual(r.relics[0], 'feu-de-bivouac');
});

/* ---------------- Jalon 4 : événements, boss en deux phases ---------------- */
const events = await import('../src/core/events.js');

/** Partie placée sur un événement donné. */
function onEvent(seed, id) {
  const run = flow.newRun({ characterId: 'marechal', seed });
  events.startEvent(run, { id: 'n' });
  run.event.id = id;
  return run;
}

test('événements : tous différents tant qu’il en reste', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'EVTS' });
  const ids = getContent().events.map(() => events.startEvent(run, { id: 'n' }).id);
  assert.equal(new Set(ids).size, getContent().events.length);
});

test('Fontaine et Maître d’armes : conditions et effets immédiats', () => {
  const run = onEvent('FONTAINE', 'fontaine');
  run.hp = 10;
  const [drink, coin] = events.eventDef(run).choices;
  assert.equal(events.choiceAvailable(run, coin).ok, false, 'il faut 50 or');
  assert.ok(events.chooseOption(run, 0));
  assert.equal(run.hp, 25);
  run.gold = 60;
  events.chooseOption(run, 1);
  assert.equal(run.gold, 10);
  assert.equal(run.maxHp, 34);
  assert.ok(drink);
  const m = onEvent('MAITRE', 'maitre-d-armes');
  events.chooseOption(m, 0);
  assert.equal(m.maxHp, 24);
  assert.equal(m.bonuses.damage, 1);
});

test('Sphinx : relique rare si juste, -8 PV si faux (et mort possible)', () => {
  let run = onEvent('SPHINX', 'sphinx');
  events.chooseOption(run, 0);
  const quiz = events.nextAction(run);
  assert.equal(quiz.type, 'quiz');
  assert.equal(quiz.difficulty, 'difficile');
  events.resolveEventQuiz(run, quiz, { theme: 'histoire' }, true);
  const gain = events.nextAction(run);
  assert.equal(gain.type, 'gainRelic');
  assert.equal(getContent().relicById[gain.id].rarity, 'rare');
  run = onEvent('SPHINX2', 'sphinx');
  run.hp = 5;
  events.chooseOption(run, 0);
  assert.ok(events.resolveEventQuiz(run, events.nextAction(run), { theme: 'histoire' }, false));
  assert.equal(run.over, 'defeat');
  assert.equal(run.stats.deathCause.event, 'Le Sphinx');
});

test('Tripot : mise doublée ou perdue', () => {
  let run = onEvent('TRIPOT', 'tripot');
  run.gold = 41;
  events.chooseOption(run, 0);
  let a = events.nextAction(run);
  assert.equal(a.stake, 20);
  events.resolveEventQuiz(run, a, { theme: 'musique' }, true);
  assert.equal(run.gold, 61);
  run = onEvent('TRIPOT2', 'tripot');
  run.gold = 30;
  events.chooseOption(run, 1);
  a = events.nextAction(run);
  events.resolveEventQuiz(run, a, { theme: 'musique' }, false);
  assert.equal(run.gold, 0);
});

test('Bibliothèque, Colporteur, Alchimiste', () => {
  let run = onEvent('BIBLIO', 'bibliotheque');
  events.chooseOption(run, 0);
  assert.equal(run.hp, 20);
  const choose = events.nextAction(run);
  assert.equal(choose.options.length, 3);
  assert.ok(choose.options.every((id) => id.startsWith('grimoire-')));
  run = onEvent('COLPORTEUR', 'colporteur');
  run.consumables = ['sablier', 'sablier', 'fiole-de-soin'];
  events.chooseOption(run, 0);
  assert.equal(run.consumables.filter(Boolean).length, 1);
  assert.equal(events.nextAction(run).type, 'gainRelic');
  run = onEvent('ALCHIMISTE', 'alchimiste');
  run.consumables = ['sablier', null, null];
  events.chooseOption(run, 0);
  const got = events.tradeConsumable(run, events.nextAction(run), 0);
  assert.equal(got.length, 2);
  assert.equal(run.consumables.filter(Boolean).length, 2);
});

test('boss : seconde phase à mi-PV (nouveau thème, nouvelle capacité)', () => {
  const run = flow.newRun({ characterId: 'marechal', seed: 'PHASES' });
  run.position = run.map.floors.at(-1)[0].id;
  flow.enterNode(run, run.map.boss.id);
  const cb = run.combat;
  const before = [...cb.enemy.abilities];
  const q = { id: 'q', theme: cb.theme };
  let r;
  for (let i = 0; i < 4; i++) r = combat.resolveAnswer(run, q, 'correct', 9000);
  assert.equal(r.phaseTwo, null);
  r = combat.resolveAnswer(run, q, 'correct', 9000);
  assert.ok(r.phaseTwo);
  assert.equal(cb.phase, 2);
  assert.equal(cb.theme, getContent().regionById[cb.regionId].category);
  assert.notDeepEqual(cb.enemy.abilities, before);
  assert.equal(combat.resolveAnswer(run, q, 'correct', 9000).phaseTwo, null, 'une seule fois');
});

// Couverture des effets : informatif (les manquants arrivent aux jalons suivants)
const used = usedEffectIds();
const done = new Set(implementedEffects());
const missing = used.filter((id) => !done.has(id));
console.log(`\n${passed} tests réussis.`);
console.log(`Effets utilisés dans les données : ${used.length}, implémentés : ${used.length - missing.length}.`);
if (missing.length) console.log(`À implémenter (jalons 2 à 4) : ${missing.join(', ')}`);
