/**
 * MapScene — la carte de Valdorn : 9 régions cliquables, progression, capitale verrouillée.
 *
 * Touche E : mode édition des polygones (pour retracer les régions sur l'image de la carte).
 *   1-9 : choisir la région · clic : ajouter un point · glisser un point : le déplacer
 *   clic droit ou Retour arrière : retirer le dernier point · C : vider · X : exporter le JSON
 *   R : revenir au fichier src/data/regions.json
 */
import { REGIONS, MARECHAL } from '../data/world.js';
import { fitCamera } from '../display.js';
import { text, panel, button, C } from '../ui.js';
import { drawBanner } from '../banner.js';
import {
  regionState, isConquered, conqueredCount, capitalUnlocked, resetSave, nextTier,
} from '../save.js';

const W = 480;
const H = 270;
const DRAFT_KEY = 'valdorn:regions-draft';
const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

/** Aire signée et centre de gravité d'un polygone [[x,y],…]. */
function centroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = points.length || 1;
    return { x: points.reduce((s, p) => s + p[0], 0) / n, y: points.reduce((s, p) => s + p[1], 0) / n, area: 0 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a), area: Math.abs(a / 2) };
}

export class MapScene extends Phaser.Scene {
  constructor() {
    super('map');
  }

  create() {
    fitCamera(this);
    this.input.mouse?.disableContextMenu();
    this.shapes = this.loadShapes();
    this.editing = false;
    this.hovered = null;
    this.focusIndex = -1;

    this.drawBackground();
    this.regionLayer = this.add.graphics();
    this.decorLayer = this.add.container(0, 0);
    this.drawHud();
    this.drawTooltip();
    this.drawEditHud();
    this.refresh();

    this.input.on('pointermove', (p) => this.onMove(p));
    this.input.on('pointerdown', (p) => this.onDown(p));
    this.input.on('pointerup', () => { this.dragging = null; });
    this.input.keyboard.on('keydown', (e) => this.onKey(e));
  }

  /* ------------------------------------------------------------------ */
  /*  Données des polygones (fichier ou brouillon local du mode édition) */
  /* ------------------------------------------------------------------ */

  loadShapes() {
    const file = this.cache.json.get('regions')?.regions ?? {};
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    } catch { /* pas de brouillon */ }
    this.usingDraft = Boolean(draft);
    const source = draft ?? file;
    const shapes = {};
    for (const r of REGIONS) shapes[r.id] = (source[r.id]?.points ?? []).map(([x, y]) => [x, y]);
    return shapes;
  }

  saveDraft() {
    this.labelCache = {};
    const regions = {};
    for (const r of REGIONS) regions[r.id] = { points: this.shapes[r.id] };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(regions));
      this.usingDraft = true;
    } catch { /* stockage indisponible */ }
  }

  /* ------------------------------------------------------------------ */
  /*  Dessin                                                             */
  /* ------------------------------------------------------------------ */

  drawBackground() {
    if (this.textures.exists('map')) {
      this.add.image(0, 0, 'map').setOrigin(0);
    } else {
      // Carte absente : mer bleue et continent ovale beige.
      this.add.rectangle(0, 0, W, H, 0x0069aa).setOrigin(0);
      this.add.ellipse(W / 2, H / 2 + 6, 340, 200, 0xe8d3a6);
    }
  }

  drawHud() {
    panel(this, 4, 4, 176, 22, { border: 'plain', tint: C.goldHex });
    this.countText = text(this, 10, 8, '', { size: 8, color: C.ink });
    this.resetButton = button(this, W - 94, 5, 90, 18, 'Réinitialiser', () => this.askReset());
    this.hint = text(this, 6, H - 12, 'Cliquez une région pour l’attaquer · flèches + Entrée au clavier · E : éditer',
      { size: 8, color: C.ink }).setShadow(1, 1, '#0E071B', 0, false, true);
  }

  drawTooltip() {
    this.tip = this.add.container(0, 0).setVisible(false).setDepth(10);
    this.tipPanel = panel(this, 0, 0, 170, 62, { border: 'plain' });
    this.tipTitle = text(this, 7, 5, '', { size: 8, color: C.gold, bold: true, width: 156 });
    this.tipBody = text(this, 7, 17, '', { size: 8, color: C.ink, width: 156 });
    this.tip.add([this.tipPanel, this.tipTitle, this.tipBody]);
  }

  drawEditHud() {
    this.editHud = this.add.container(0, 0).setVisible(false).setDepth(20);
    this.editHud.add(panel(this, 4, H - 46, W - 8, 42, { border: 'plain', tint: 0x00cdf9 }));
    this.editTitle = text(this, 10, H - 42, '', { size: 8, color: '#94FDFF' });
    this.editHud.add(this.editTitle);
    this.editHud.add(text(this, 10, H - 30,
      '1-9 : région · clic : ajouter un point · glisser : déplacer · clic droit / ⌫ : retirer\nC : vider · X : exporter le JSON · R : revenir au fichier · E : quitter',
      { size: 8, color: C.ink }));
    this.editPoints = this.add.graphics().setDepth(15);
  }

  /** Redessine régions, drapeaux et textes selon la progression. */
  refresh() {
    const g = this.regionLayer;
    g.clear();
    this.decorLayer.removeAll(true);
    const unlocked = capitalUnlocked();

    for (const r of REGIONS) {
      const pts = this.shapes[r.id];
      if (pts.length < 3) continue;
      const poly = pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
      const hot = this.hovered === r.id;
      const conquered = isConquered(r.id);
      const locked = r.capital && !unlocked;
      const [c1, c2] = r.house.colors.map(hex);

      if (conquered) {
        g.fillStyle(hex(MARECHAL.colors[1]), hot ? 0.6 : 0.45).fillPoints(poly, true);
        g.lineStyle(2, hex(MARECHAL.colors[0]), 1).strokePoints(poly, true, true);
      } else if (locked) {
        g.fillStyle(0x0e071b, hot ? 0.55 : 0.4).fillPoints(poly, true);
        g.lineStyle(1, 0x858585, 1).strokePoints(poly, true, true);
      } else {
        g.fillStyle(c1, hot ? 0.4 : 0.15).fillPoints(poly, true);
        g.lineStyle(2, c1, 1).strokePoints(poly, true, true);
        g.lineStyle(1, c2, 0.9).strokePoints(poly, true, true);
      }

      const { x, y } = this.labelPoint(r.id);
      if (conquered) {
        // Petit drapeau du Maréchal planté au centre de la région
        this.decorLayer.add(drawBanner(this, Math.round(x) - 1, Math.round(y) + 10, 1));
      } else if (locked) {
        this.decorLayer.add(this.drawLock(Math.round(x), Math.round(y)));
      } else {
        // Progression : 3 cases, une par bataille gagnée
        const won = regionState(r.id).won;
        for (let i = 0; i < 3; i++) {
          const pip = this.add.rectangle(Math.round(x) - 7 + i * 5, Math.round(y), 4, 4, i < won ? C.goldHex : 0x0e071b)
            .setStrokeStyle(1, C.goldHex);
          this.decorLayer.add(pip);
        }
      }
    }

    this.countText.setText(`Valdorn · ${conqueredCount()}/${REGIONS.length} régions conquises`);
    this.drawEditPoints();
  }

  /**
   * Point d'ancrage du drapeau : le centre de gravité, sauf s'il tombe dans une autre
   * région (la capitale au milieu des Collines) ; on prend alors le point le plus
   * proche qui n'appartient qu'à cette région.
   */
  labelPoint(id) {
    this.labelCache ??= {};
    if (!this.labelCache[id]) this.labelCache[id] = this.findLabelPoint(id);
    return this.labelCache[id];
  }

  findLabelPoint(id) {
    const c = centroid(this.shapes[id]);
    const owner = (x, y) => this.regionAt(x, y)?.id;
    if (owner(c.x, c.y) === id) return c;
    let best = c;
    let bestD = Infinity;
    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 3) {
        if (owner(x, y) !== id) continue;
        const d = (x - c.x) ** 2 + (y - c.y) ** 2;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    // Un peu à l'intérieur plutôt que sur le bord
    const inner = { x: best.x + Math.sign(best.x - c.x) * 8, y: best.y + Math.sign(best.y - c.y) * 8 };
    return owner(inner.x, inner.y) === id ? inner : best;
  }

  drawLock(x, y) {
    const g = this.add.graphics({ x: x - 3, y: y - 4 });
    g.lineStyle(1, 0xc7cfdd).strokeRect(1, 0, 4, 4);
    g.fillStyle(0xc7cfdd).fillRect(0, 3, 7, 5);
    g.fillStyle(0x0e071b).fillRect(3, 5, 1, 2);
    return g;
  }

  /* ------------------------------------------------------------------ */
  /*  Survol, clic, clavier                                              */
  /* ------------------------------------------------------------------ */

  /** Région sous un point (les plus petites d'abord : la capitale est dans les Collines). */
  regionAt(x, y) {
    return REGIONS
      .filter((r) => this.shapes[r.id].length >= 3)
      .map((r) => ({ r, area: centroid(this.shapes[r.id]).area }))
      .sort((a, b) => a.area - b.area)
      .find(({ r }) => Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(this.shapes[r.id].flat()), x, y))?.r ?? null;
  }

  onMove(p) {
    if (this.editing) {
      if (this.dragging) {
        this.labelCache = {};
        this.dragging[0] = Math.round(Phaser.Math.Clamp(p.worldX, 0, W));
        this.dragging[1] = Math.round(Phaser.Math.Clamp(p.worldY, 0, H));
        this.refresh();
      }
      return;
    }
    const r = this.regionAt(p.worldX, p.worldY);
    this.setHover(r?.id ?? null, p.worldX, p.worldY);
  }

  setHover(id, x, y) {
    if (id !== this.hovered) {
      this.hovered = id;
      this.refresh();
    }
    this.input.setDefaultCursor(id ? 'pointer' : 'default');
    if (!id) {
      this.tip.setVisible(false);
      return;
    }
    const r = REGIONS.find((reg) => reg.id === id);
    const s = regionState(id);
    let status;
    if (s.conquered) status = 'Conquise ✓ (cliquez pour rejouer)';
    else if (r.capital && !capitalUnlocked()) status = 'Verrouillée : conquérez d’abord les 8 autres régions';
    else status = `Batailles gagnées : ${s.won}/3`;
    this.tipTitle.setText(r.name);
    this.tipBody.setText(`Maison ${r.house.name} — ${r.house.arms}\nThème : ${r.theme}\n${status}`);
    // Le cadre est reconstruit à la hauteur du texte
    const h = this.tipBody.y + this.tipBody.height + 6;
    this.tip.remove(this.tipPanel, true);
    this.tipPanel = panel(this, 0, 0, 170, h, { border: 'plain' });
    this.tip.addAt(this.tipPanel, 0);
    const tx = Phaser.Math.Clamp(x + 10, 4, W - 174);
    const ty = Phaser.Math.Clamp(y + 10, 30, H - h - 16);
    this.tip.setPosition(Math.round(tx), Math.round(ty)).setVisible(true);
  }

  onDown(p) {
    if (this.editing) return this.editDown(p);
    if (p.worldY < 28) return; // barre du haut
    const r = this.regionAt(p.worldX, p.worldY);
    if (r) this.enter(r);
  }

  enter(r) {
    if (r.capital && !capitalUnlocked()) {
      this.cameras.main.shake(150, 0.004);
      return;
    }
    this.scene.start('combat', { regionId: r.id, tierId: nextTier(r.id) });
  }

  onKey(e) {
    if (e.key === 'e' || e.key === 'E') return this.toggleEdit();
    if (this.editing) return this.editKey(e);
    const order = REGIONS.filter((r) => this.shapes[r.id].length >= 3);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Tab'].includes(e.key)) {
      e.preventDefault?.();
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
      this.focusIndex = (this.focusIndex + dir + order.length) % order.length;
      const r = order[this.focusIndex];
      const { x, y } = this.labelPoint(r.id);
      this.setHover(r.id, x, y);
    } else if ((e.key === 'Enter' || e.key === ' ') && this.hovered) {
      this.enter(REGIONS.find((r) => r.id === this.hovered));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Réinitialisation (confirmation en deux clics)                      */
  /* ------------------------------------------------------------------ */

  askReset() {
    if (this.confirmingReset) {
      resetSave();
      this.confirmingReset = false;
      this.resetButton.label.setText('Réinitialiser');
      this.refresh();
      return;
    }
    this.confirmingReset = true;
    this.resetButton.label.setText('Confirmer ?');
    this.resetButton.setState('bad');
    this.time.delayedCall(3000, () => {
      this.confirmingReset = false;
      this.resetButton.label.setText('Réinitialiser');
      this.resetButton.setState('idle');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Mode édition des polygones                                         */
  /* ------------------------------------------------------------------ */

  toggleEdit() {
    this.editing = !this.editing;
    this.editRegion = this.editRegion ?? REGIONS[0].id;
    this.editHud.setVisible(this.editing);
    this.hint.setVisible(!this.editing);
    this.tip.setVisible(false);
    this.hovered = null;
    this.input.setDefaultCursor(this.editing ? 'crosshair' : 'default');
    this.refresh();
  }

  drawEditPoints() {
    const g = this.editPoints;
    g.clear();
    if (!this.editing) return;
    const pts = this.shapes[this.editRegion];
    if (pts.length > 1) {
      g.lineStyle(1, 0x0cf1ff, 1).strokePoints(pts.map(([x, y]) => ({ x, y })), pts.length > 2, true);
    }
    pts.forEach(([x, y], i) => {
      g.fillStyle(i === pts.length - 1 ? 0xffeb57 : 0x0cf1ff).fillRect(x - 1, y - 1, 3, 3);
    });
    const r = REGIONS.find((reg) => reg.id === this.editRegion);
    const index = REGIONS.indexOf(r) + 1;
    this.editTitle.setText(`Mode édition · ${index}. ${r.name} (${r.id}) · ${pts.length} points${this.usingDraft ? ' · brouillon local' : ''}`);
  }

  editDown(p) {
    const x = Math.round(Phaser.Math.Clamp(p.worldX, 0, W));
    const y = Math.round(Phaser.Math.Clamp(p.worldY, 0, H));
    const pts = this.shapes[this.editRegion];
    if (p.rightButtonDown()) {
      pts.pop();
    } else {
      const near = pts.find(([px, py]) => Math.abs(px - x) <= 3 && Math.abs(py - y) <= 3);
      if (near) this.dragging = near;
      else pts.push([x, y]);
    }
    this.saveDraft();
    this.refresh();
  }

  editKey(e) {
    const pts = this.shapes[this.editRegion];
    const n = Number(e.key);
    if (n >= 1 && n <= REGIONS.length) this.editRegion = REGIONS[n - 1].id;
    else if (e.key === 'Backspace') pts.pop();
    else if (e.key === 'c' || e.key === 'C') pts.length = 0;
    else if (e.key === 'x' || e.key === 'X') return this.exportJson();
    else if (e.key === 'r' || e.key === 'R') {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* rien */ }
      this.shapes = this.loadShapes();
      this.labelCache = {};
      this.refresh();
      return;
    } else return;
    if (e.key !== String(n)) this.saveDraft();
    this.refresh();
  }

  /** Exporte le JSON : copié dans le presse-papiers, téléchargé et affiché dans la console. */
  async exportJson() {
    const regions = Object.fromEntries(REGIONS.map((r) => [r.id, { points: this.shapes[r.id] }]));
    const lines = REGIONS.map((r) => `    "${r.id}": { "points": ${JSON.stringify(this.shapes[r.id])} }`);
    const json = `{\n  "note": ${JSON.stringify(this.cache.json.get('regions')?.note ?? '')},\n  "size": [${W}, ${H}],\n  "regions": {\n${lines.join(',\n')}\n  }\n}\n`;
    console.log(json, regions);
    let copied = false;
    try {
      await navigator.clipboard.writeText(json);
      copied = true;
    } catch { /* presse-papiers indisponible */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'regions.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this.editTitle.setText(`regions.json ${copied ? 'copié et ' : ''}téléchargé : remplacez src/data/regions.json`);
  }
}
