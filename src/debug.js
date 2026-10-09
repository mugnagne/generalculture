/**
 * debug.js — Affiche chaque animation du manifeste, à l'échelle du jeu.
 * Indépendant de Phaser : simple dessin canvas, frame par frame.
 */
import { REGIONS, MARECHAL } from './data/world.js';
import { MANIFEST_URL } from './sprites.js';
import { RECOLOR_RULES } from './data/recolor.js';
import { readPixels, measureLightness, recolorImage } from './recolor.js';

const BOSS_SCALE = 1.75;
const manifest = await (await fetch(MANIFEST_URL)).json();
const heroH = manifest.characters[MARECHAL.sprite].body.height;

// Rôles de chaque personnage d'après les données des régions
const roles = new Map([[MARECHAL.sprite, ['Le Maréchal']]]);
for (const r of REGIONS) {
  for (const [role, e] of [['soldats', r.soldiers], ['chevalier', r.knight], ['boss', r.boss]]) {
    if (!roles.has(e.sprite)) roles.set(e.sprite, []);
    roles.get(e.sprite).push(`${e.name} (${role}, ${r.id})`);
  }
}
const bosses = new Set(REGIONS.map((r) => r.boss.sprite));

const images = new Map();
const loadImage = (src) => {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = encodeURI(src);
    }));
  }
  return images.get(src);
};

const zoomInput = document.getElementById('zoom');
const players = [];

for (const [key, def] of Object.entries(manifest.characters)) {
  const scale = (bosses.has(key) ? heroH * BOSS_SCALE : heroH) / def.body.height;
  const section = document.createElement('section');
  section.innerHTML = `<h2>${key}</h2>
    <div class="meta">Pack : ${def.pack} · regarde vers la ${def.facing === 'right' ? 'droite' : 'gauche'} ·
      silhouette ${def.body.height}px → échelle ×${scale.toFixed(2)} ·
      ${(roles.get(key) ?? ['non utilisé']).join(' · ')}</div>
    <div class="anims"></div>`;
  const wrap = section.querySelector('.anims');

  for (const [name, a] of Object.entries(def.anims)) {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.className = 'ground';
    fig.append(canvas);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${name}</b> · ${a.frames} frames ${a.frameWidth}×${a.frameHeight} · ${a.fps} fps${a.loop ? ' · boucle' : ''}<br>${a.file.split('/').slice(2).join('/')}`;
    fig.append(cap);
    wrap.append(fig);
    players.push({ canvas, a, def, scale, img: loadImage(a.file) });
  }
  document.getElementById('list').append(section);
}

// Recolorations aux couleurs des maisons (calculées comme dans le jeu)
const recolorSection = document.createElement('section');
recolorSection.innerHTML = `<h2>Recolorations</h2>
  <div class="meta">Soldats et chevaliers aux couleurs de leur maison ; le Ver des sables couleur sable. Animation d'attente.</div>
  <div class="anims"></div>`;
const recolorWrap = recolorSection.querySelector('.anims');
const variants = [];
for (const r of REGIONS) {
  variants.push([r.soldiers, r.house.colors, `${r.soldiers.name} · ${r.house.name}`]);
  variants.push([r.knight, r.house.colors, `${r.knight.name} · ${r.house.name}`]);
}
const worm = REGIONS.find((r) => r.boss.sprite === 'fire-worm');
if (worm) variants.push([worm.boss, [], `${worm.boss.name} · sable`]);
for (const [enemy, colors, label] of variants) {
  const rules = RECOLOR_RULES[enemy.sprite];
  if (!rules) continue;
  const def = manifest.characters[enemy.sprite];
  const a = def.anims.idle;
  const scale = (enemy === worm?.boss ? heroH * BOSS_SCALE : heroH) / def.body.height;
  const fig = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.className = 'ground';
  fig.append(canvas);
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${label}</b><br>${colors.join(' · ')}`;
  fig.append(cap);
  recolorWrap.append(fig);
  const img = loadImage(a.file).then((src) => {
    const refL = measureLightness(readPixels(src), rules);
    return recolorImage(src, rules, colors, refL);
  });
  players.push({ canvas, a, def, scale, img });
}
document.getElementById('list').prepend(recolorSection);

// Boucle d'animation commune
let last = performance.now();
let tick = 0;
function frame(now) {
  tick += now - last;
  last = now;
  const zoom = Number(zoomInput.value);
  for (const p of players) {
    p.img.then((img) => {
      const { a, def, scale, canvas } = p;
      // Recadrage autour de la silhouette pour ne pas afficher d'immenses cases vides
      const viewW = Math.ceil(a.frameWidth * scale * zoom);
      const viewH = Math.ceil(def.body.bottom * scale * zoom) + 2;
      if (canvas.width !== viewW || canvas.height !== viewH) {
        canvas.width = viewW;
        canvas.height = viewH;
      }
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, viewW, viewH);
      const i = a.start + (Math.floor((tick / 1000) * a.fps) % a.frames);
      const sx = (i % a.columns) * a.frameWidth;
      const sy = Math.floor(i / a.columns) * a.frameHeight;
      ctx.drawImage(img, sx, sy, a.frameWidth, def.body.bottom, 0, 0, a.frameWidth * scale * zoom, def.body.bottom * scale * zoom);
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
