/**
 * credits.js — Lit CREDITS.md et en tire la liste affichée par l'écran de crédits.
 *
 * Ordre imposé : chierit (CC-BY 4.0) en premier, puis LuizMelo, Kronovi et Kenney,
 * puis tout le reste. Si CREDITS.md est absent ou incomplet, ces quatre auteurs
 * sont tout de même crédités.
 */

const REQUIRED = [
  { author: 'chierit', items: ['Frost Guardian', 'Cthulu', 'Demon Slime'], licence: 'CC-BY 4.0' },
  { author: 'LuizMelo', items: [], licence: '' },
  { author: 'Kronovi', items: [], licence: '' },
  { author: 'Kenney', items: [], licence: '' },
];

const cleanLicence = (l) => {
  const v = (l ?? '').replace(/\(.*?\)/g, '').replace(/<https?:\/\/([^>]+)>/g, '$1').trim();
  return /compléter/i.test(v) ? '' : v;
};
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
const cleanItem = (i) => (i ?? '').replace(/\s*\(.*?\)/g, '').trim();

/** @returns {{ sections: Array<{ title, entries: Array<{author, items: string[], licence}> }> }} */
export function parseCredits(markdown = '') {
  const groups = new Map(); // auteur → { author, items, licence } (sprites et interface)
  const others = [];        // palette, police, moteur…
  let section = '';
  let header = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) { section = line.slice(3); header = null; continue; }
    if (!line.startsWith('|')) continue;
    const row = cells(line);
    if (!header) { header = row.map((h) => h.toLowerCase()); continue; }
    if (row.every((c) => /^-+$/.test(c))) continue;
    const get = (name) => row[header.indexOf(name)];
    const author = (get('auteur') ?? '').replace(/\s*\(.*\)/, '');
    if (!author) continue;
    if (header.includes('pack')) {
      const key = author.toLowerCase();
      if (!groups.has(key)) groups.set(key, { author, items: [], licence: '' });
      const g = groups.get(key);
      g.items.push(cleanItem(get('pack')));
      const lic = cleanLicence(get('licence'));
      if (lic && !g.licence.includes(lic)) g.licence = g.licence ? `${g.licence}, ${lic}` : lic;
    } else {
      others.push({ author, items: [cleanItem(get('ressource') ?? get('fichier'))], licence: cleanLicence(get('licence')) });
    }
  }

  // Auteurs obligatoires, dans l'ordre, complétés par ce que dit CREDITS.md
  const ordered = REQUIRED.map((req) => {
    const found = groups.get(req.author.toLowerCase());
    groups.delete(req.author.toLowerCase());
    if (!found) return { ...req };
    const licence = req.author === 'chierit' ? 'CC-BY 4.0' : found.licence;
    return { author: req.author, items: found.items, licence };
  });
  return {
    sections: [
      { title: 'Personnages et interface', entries: [...ordered, ...groups.values()] },
      { title: 'Palette, police et moteur', entries: others },
    ],
  };
}
