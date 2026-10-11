/**
 * MapScene — Carte de l'acte, à la manière de Slay the Spire : on part du bas, on choisit
 * une case reliée à la case actuelle, le boss attend en haut. La carte défile verticalement
 * (molette, glisser, flèches haut / bas). Flèches gauche / droite + Entrée : choisir au clavier.
 */
import { fitCamera } from '../display.js';
import { text, panel, button, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { drawTopBar, TOPBAR_H } from '../topbar.js';
import { openPause } from './PauseScene.js';
import { music, sfx, toggleMute } from '../audio.js';
import { getContent } from '../core/content.js';
import { loadRun, saveRun } from '../core/run.js';
import { allNodes, nodeById, reachableNodes } from '../core/mapgen.js';
import { enterNode, nodeKind, freeTravelNodes, freeTravelLeft } from '../core/flow.js';
import { activeEffect } from '../core/combat.js';

const W = 480;
const H = 270;
const MAP_RIGHT = 342;   // la légende occupe la droite de l'écran
const FLOOR_GAP = 52;
const BOSS_GAP = 66;
const BOTTOM_PAD = 34;
const TOP_PAD = 46;

/** Libellés des types de case (légende et infobulles). */
export const NODE_LABELS = {
  combat: 'Combat',
  elite: 'Élite',
  rest: 'Feu de camp',
  shop: 'Marchand',
  unknown: 'Inconnue',
  treasure: 'Trésor',
  boss: 'Boss',
  event: 'Événement',
};

export class MapScene extends Phaser.Scene {
  constructor() {
    super('map');
  }

  init(data = {}) {
    this.actIntro = Boolean(data.actIntro);
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadRun();
    if (!run || !run.map) {
      this.scene.start('title');
      return;
    }
    this.run = run;
    // La partie reprend ici : on n'affiche plus l'annonce de l'acte au prochain chargement
    run.resume = { scene: 'map', data: {} };
    saveRun(run);
    music(this, 'musique-carte');

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.88).setOrigin(0);

    const floors = run.map.floors.length;
    this.contentH = BOTTOM_PAD + (floors - 1) * FLOOR_GAP + BOSS_GAP + TOP_PAD;
    this.viewH = H - TOPBAR_H;
    this.world = this.add.container(0, 0);
    this.drawMap();

    this.drawLegend();
    this.topbar = drawTopBar(this, run);

    this.bindScroll();
    this.bindKeys();
    // Défilement initial : l'étage en cours vers le bas de l'écran
    const here = run.position ? nodeById(run.map, run.position) : null;
    this.scrollTo(this.floorY(here ? here.floor : 1) - this.viewH * 0.7);
    if (this.actIntro) this.showActIntro();
  }

  /* ------------------------------------------------------------------ */
  /*  Géométrie                                                          */
  /* ------------------------------------------------------------------ */

  /** Ordonnée d'un étage dans le contenu (le boss est à l'étage floors + 1). */
  floorY(floor) {
    const floors = this.run.map.floors.length;
    const bottom = this.contentH - BOTTOM_PAD;
    if (floor > floors) return bottom - (floors - 1) * FLOOR_GAP - BOSS_GAP;
    return bottom - (floor - 1) * FLOOR_GAP;
  }

  nodeX(node) {
    // Abscisses de mapgen (48..432) ramenées dans la zone de gauche, marge pour les libellés
    return Math.round(42 + ((node.x - 48) / 384) * (MAP_RIGHT - 84));
  }

  pos(node) {
    return { x: this.nodeX(node), y: TOPBAR_H + this.floorY(node.floor) };
  }

  /* ------------------------------------------------------------------ */
  /*  Dessin                                                             */
  /* ------------------------------------------------------------------ */

  drawMap() {
    const { run } = this;
    const c = getContent();
    const reachable = new Set(reachableNodes(run.map, run.position).map((n) => n.id));
    // Bottes ailées : cases de l'étage suivant hors des chemins
    this.free = new Set(freeTravelNodes(run).map((n) => n.id));
    this.hideThemes = Boolean(activeEffect(run, 'hideMapThemes'));
    this.reachable = [...reachableNodes(run.map, run.position), ...freeTravelNodes(run)].sort((a, b) => a.x - b.x);
    const visited = new Set(allNodes(run.map).filter((n) => n.visited).map((n) => n.id));

    // Chemins : pointillés ; parcourus en or, accessibles en clair, les autres estompés
    const g = this.add.graphics();
    this.world.add(g);
    for (const node of allNodes(run.map)) {
      for (const id of node.next) {
        const to = nodeById(run.map, id);
        const walked = visited.has(node.id) && visited.has(id);
        const open = node.id === run.position && reachable.has(id);
        const color = walked ? C.goldHex : open ? 0xf9e6cf : 0x657392;
        const alpha = walked || open ? 0.95 : 0.45;
        this.dotted(g, this.pos(node), this.pos(to), color, alpha);
      }
    }
    // Départ : petits pointillés vers les cases de l'étage 1
    if (!run.position) {
      for (const n of run.map.floors[0]) {
        const p = this.pos(n);
        this.dotted(g, { x: p.x, y: p.y + 26 }, p, 0xf9e6cf, 0.9);
      }
    }

    this.nodeViews = new Map();
    for (const node of allNodes(run.map)) this.drawNode(node, reachable.has(node.id) || this.free.has(node.id), visited.has(node.id), c);
  }

  dotted(g, a, b, color, alpha) {
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    const steps = Math.floor(dist / 5);
    g.fillStyle(color, alpha);
    for (let i = 2; i < steps - 1; i++) {
      const t = i / steps;
      g.fillRect(Math.round(a.x + (b.x - a.x) * t) - 1, Math.round(a.y + (b.y - a.y) * t) - 1, 2, 2);
    }
  }

  drawNode(node, isReachable, isVisited, c) {
    const { x, y } = this.pos(node);
    const isBoss = node.type === 'boss';
    const here = node.id === this.run.position;
    const kind = node.revealed ?? node.type;
    const r = isBoss ? 17 : 9;

    const isFree = this.free.has(node.id);
    const ring = this.add.circle(x, y, r + 2, here ? C.goldHex : isFree ? C.timer : isReachable ? 0xf9e6cf : 0x424c6e, 1);
    const disc = this.add.circle(x, y, r, isVisited ? 0x2a2f4e : C.panel, 1);
    const img = icon(this, x, y, kind, { scale: isBoss ? 2 : 1 });
    if (!isReachable && !here && !isVisited) img.setAlpha(0.75);
    if (isVisited && !here) img.setAlpha(0.45);
    this.world.add([ring, disc, img]);

    // Thème sous les combats et les élites ; nom du boss
    let label = null;
    if ((kind === 'combat' || kind === 'elite') && node.theme) {
      // Masque aveugle : thèmes cachés (sauf sur les cases déjà visitées)
      const shown = !this.hideThemes || isVisited;
      label = text(this, x, y + r + 2, shown ? c.regionByCategory[node.theme].short : '?', { size: 8, color: isReachable ? C.ink : C.muted });
    } else if (isBoss) {
      const region = c.regionById[node.region];
      label = text(this, x, y + r + 3, `${region.boss.name}\n${c.regionByCategory[node.theme].short}`,
        { size: 8, color: C.gold, align: 'center' });
    }
    if (label) {
      label.setOrigin(0.5, 0).setShadow(1, 1, '#0E071B', 0, false, true);
      this.world.add(label);
    }

    const view = { node, ring, disc, img, x, y, r };
    this.nodeViews.set(node.id, view);
    if (!isReachable) return;

    // Case accessible : pulsation, survol et clic
    this.tweens.add({ targets: ring, scale: 1.18, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const zone = this.add.zone(x, y, r * 2 + 10, r * 2 + 10).setInteractive({ useHandCursor: true });
    this.world.add(zone);
    zone.on('pointerover', () => this.focusNode(node.id));
    zone.on('pointerout', () => this.focusNode(null));
    zone.on('pointerup', () => {
      if (this.dragged) return;
      this.go(node.id);
    });
  }

  focusNode(id) {
    this.focused = id;
    for (const v of this.nodeViews.values()) {
      if (this.reachable.some((n) => n.id === v.node.id)) v.disc.setFillStyle(v.node.id === id ? C.hover : C.panel, 1);
    }
    if (id) {
      const v = this.nodeViews.get(id);
      const label = NODE_LABELS[nodeKind(v.node)] ?? '';
      const theme = v.node.theme && !this.hideThemes ? ` · ${getContent().regionByCategory[v.node.theme].theme}` : '';
      const free = this.free.has(id) ? `\nBottes ailées : ${freeTravelLeft(this.run)} saut(s) restant(s).` : '';
      this.hint.setText(`${label}${theme}${free}`);
    } else this.hint.setText('Choisissez une case reliée.');
  }

  drawLegend() {
    const { run } = this;
    const c = getContent();
    const x = MAP_RIGHT + 4;
    const y = TOPBAR_H + 4;
    const w = W - x - 4;
    const box = this.add.container(0, 0).setDepth(800);
    box.add(panel(this, x, y, w, H - y - 4));

    const boss = c.regionById[run.map.boss.region];
    box.add(text(this, x + 8, y + 7, `Acte ${run.act}`, { size: 16, color: C.gold }));
    box.add(text(this, x + 8, y + 27, `Boss : ${boss.boss.name}`, { size: 8, color: C.ink, width: w - 16 }));

    const types = ['combat', 'elite', 'rest', 'shop', 'unknown', 'treasure', 'boss'];
    let ly = y + 56;
    for (const t of types) {
      box.add(icon(this, x + 14, ly + 5, t));
      box.add(text(this, x + 25, ly, NODE_LABELS[t], { size: 8, color: C.ink }));
      ly += 14;
    }
    this.hint = text(this, x + 8, ly + 6, '', { size: 8, color: C.muted, width: w - 16 });
    box.add(this.hint);
    box.add(text(this, x + 8, H - 44, `Graine ${run.seed}`, { size: 8, color: C.muted }));
    box.add(button(this, x + 8, H - 30, w - 16, 18, 'Menu', () => openPause(this)));
    this.focusNode(null);
  }

  showActIntro() {
    const c = getContent();
    const boss = c.regionById[this.run.map.boss.region];
    if (this.run.act > 1) sfx(this, 'conquete');
    const layer = this.add.container(0, 0).setDepth(1000);
    layer.add(this.add.rectangle(0, 0, W, H, 0x0e071b, 0.75).setOrigin(0));
    layer.add(text(this, W / 2, 100, `Acte ${this.run.act}`, { size: 32, color: C.gold, bold: true }).setOrigin(0.5, 0));
    layer.add(text(this, W / 2, 142, `${boss.boss.name} vous attend au sommet.`, { size: 8, color: C.ink }).setOrigin(0.5, 0));
    this.tweens.add({ targets: layer, alpha: 0, delay: 1600, duration: 500, onComplete: () => layer.destroy() });
  }

  /* ------------------------------------------------------------------ */
  /*  Défilement et commandes                                            */
  /* ------------------------------------------------------------------ */

  scrollTo(offset) {
    const max = Math.max(0, this.contentH - this.viewH);
    this.offset = Phaser.Math.Clamp(Math.round(offset), 0, max);
    this.world.y = -this.offset;
  }

  bindScroll() {
    this.input.on('wheel', (_p, _o, _dx, dy) => this.scrollTo(this.offset + dy * 0.25));
    this.input.on('pointerdown', (p) => {
      this.dragStart = { y: p.y, offset: this.offset };
      this.dragged = false;
    });
    this.input.on('pointermove', (p) => {
      if (!p.isDown || !this.dragStart) return;
      const dy = (p.y - this.dragStart.y) / this.cameras.main.zoom;
      if (Math.abs(dy) > 3) this.dragged = true;
      if (this.dragged) this.scrollTo(this.dragStart.offset - dy);
    });
    this.input.on('pointerup', () => { this.dragStart = null; });
  }

  bindKeys() {
    this.input.keyboard.on('keydown', (e) => {
      if (e.key === 'ArrowUp') this.scrollTo(this.offset - 16);
      else if (e.key === 'ArrowDown') this.scrollTo(this.offset + 16);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const list = this.reachable;
        if (!list.length) return;
        const i = list.findIndex((n) => n.id === this.focused);
        const next = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
        this.focusNode(list[next].id);
        this.scrollTo(this.floorY(list[next].floor) - this.viewH * 0.6);
      } else if ((e.key === 'Enter' || e.key === ' ') && this.focused) this.go(this.focused);
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') openPause(this);
      else if (e.key === 'm' || e.key === 'M') toggleMute(this.game);
    });
  }

  go(nodeId) {
    if (this.leaving) return;
    const next = enterNode(this.run, nodeId);
    saveRun(this.run);
    goTo(this, next.scene, next.data);
  }
}
