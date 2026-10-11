/**
 * SummaryScene — Bilan de fin de partie (victoire ou mort) : étages franchis, thèmes,
 * pourcentage de bonnes réponses, reliques, cause de la mort. Retour au titre ensuite
 * (la sauvegarde est alors effacée : pas de méta-progression).
 */
import { fitCamera } from '../display.js';
import { text, panel, button, menuNav, C } from '../ui.js';
import { fadeIn, goTo } from '../transition.js';
import { icon } from '../icons.js';
import { itemInfo, itemTint, tooltip } from '../topbar.js';
import { getContent } from '../core/content.js';
import { loadFinishedRun, deleteRun } from '../core/run.js';
import { music } from '../audio.js';

const W = 480;
const H = 270;
const KIND = { soldier: '', elite: ' (élite)', boss: ' (boss)' };

export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('summary');
  }

  create() {
    fitCamera(this);
    fadeIn(this);
    const run = loadFinishedRun();
    if (!run?.over) return this.scene.start('title');
    const c = getContent();
    const won = run.over === 'victory';
    const s = run.stats;
    music(this, won ? 'musique-finale' : 'musique-titre');

    if (this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0e071b, 0.85).setOrigin(0);
    panel(this, 12, 8, W - 24, H - 16);
    text(this, W / 2, 16, won ? 'Valdorn est reconquise !' : 'La reconquête s’arrête là', { size: 16, color: won ? C.gold : C.badText })
      .setOrigin(0.5, 0);

    const answered = s.correct + s.wrong + s.timeouts;
    const pct = answered ? Math.round((s.correct / answered) * 100) : 0;
    const cause = s.deathCause
      ? `${s.deathCause.enemy}${KIND[s.deathCause.kind] ?? ''}, ${c.regionByCategory[s.deathCause.theme]?.theme ?? ''}, acte ${s.deathCause.act}`
      : null;
    const lines = [
      ['Étages franchis', `${s.floorsCleared} (acte ${run.act})`],
      ['Bonnes réponses', `${s.correct} / ${answered} (${pct} %)`],
      ['Temps écoulés', String(s.timeouts)],
      ['Victoires', `${s.combatsWon} dont ${s.elitesWon} élite${s.elitesWon > 1 ? 's' : ''} et ${s.bossesWon} boss`],
      ['Or en poche', String(run.gold)],
      ['Graine', run.seed],
    ];
    if (cause) lines.push(['Tombé face à', cause]);
    let y = 44;
    for (const [k, v] of lines) {
      text(this, 26, y, k, { size: 8, color: C.gold });
      text(this, 112, y, v, { size: 8, color: C.ink, width: 140 });
      y += cause && k === 'Tombé face à' ? 22 : 13;
    }

    // Thèmes : bonnes réponses / questions posées
    text(this, 270, 44, 'Thèmes', { size: 8, color: C.gold });
    let ty = 57;
    const themes = Object.entries(s.byTheme).sort((a, b) => (b[1].correct + b[1].wrong) - (a[1].correct + a[1].wrong));
    if (!themes.length) text(this, 270, ty, 'Aucune question posée.', { size: 8, color: C.muted });
    for (const [theme, t] of themes) {
      const total = t.correct + t.wrong;
      text(this, 270, ty, c.regionByCategory[theme]?.theme ?? theme, { size: 8, color: C.ink });
      text(this, W - 26, ty, `${t.correct}/${total}`, { size: 8, color: t.correct * 2 >= total ? C.goodText : C.badText }).setOrigin(1, 0);
      ty += 12;
    }

    // Reliques (survol : description)
    text(this, 26, 182, 'Reliques', { size: 8, color: C.gold });
    const tip = tooltip(this);
    run.relics.forEach((r, i) => {
      const x = 34 + i * 22;
      const img = icon(this, x, 205, 'relic', { tint: itemTint(r.id), scale: 2 }).setInteractive();
      img.on('pointerover', () => tip.show(x, 120, itemInfo(r.id)));
      img.on('pointerout', () => tip.hide());
    });

    const back = button(this, W / 2 - 60, H - 36, 120, 20, 'Retour au titre', () => {
      deleteRun();
      goTo(this, 'title');
    });
    menuNav(this, [back]);
  }
}
