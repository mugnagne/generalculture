/**
 * content.js — Charge les données de contenu (src/data/*.json) et les prépare.
 *
 * Aucune donnée de contenu n'est écrite dans le code : ce module ne fait que lire,
 * valider et indexer les JSON (et décliner les reliques « perTheme » en une version
 * par thème). Utilisable dans le navigateur (fetch) comme dans Node (tests).
 */

export const DATA_FILES = {
  balance: 'src/data/balance.json',
  characters: 'src/data/characters.json',
  consumables: 'src/data/consumables.json',
  relics: 'src/data/relics.json',
  bossRelics: 'src/data/boss-relics.json',
  enemies: 'src/data/enemies.json',
  events: 'src/data/events.json',
  regions: 'src/data/regions.json',
  recolor: 'src/data/recolor.json',
};

let content = null;

/** Contenu chargé (lève une erreur s'il ne l'est pas encore). */
export function getContent() {
  if (!content) throw new Error('Contenu non chargé : appeler loadContent() au démarrage.');
  return content;
}

/** Chargement dans le navigateur. */
export async function loadContent(fetchJson = (url) => fetch(url).then((r) => r.json())) {
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([k, url]) => [k, await fetchJson(url)]));
  return initContent(Object.fromEntries(entries));
}

/** Prépare le contenu à partir des JSON bruts. */
export function initContent(raw) {
  const regions = raw.regions.regions;
  const bossTheme = raw.balance.themes.boss;
  const excluded = new Set(raw.balance.themes.excludedFromMap);
  // Thèmes de la carte : une région par catégorie, hors Culture générale (réservée aux boss)
  const mapThemes = regions.filter((r) => !excluded.has(r.category)).map((r) => r.category);

  const relics = [];
  for (const relic of raw.relics.relics) {
    if (!relic.perTheme) {
      relics.push(relic);
      continue;
    }
    for (const region of regions.filter((r) => mapThemes.includes(r.category))) {
      const fill = (s) => s.replaceAll('$themeName', region.theme).replaceAll('$theme', region.category);
      relics.push({
        ...relic,
        id: fill(relic.id),
        name: fill(relic.name),
        description: fill(relic.description),
        template: relic.id.replace(/-?\$theme/, ''),
        effects: JSON.parse(fill(JSON.stringify(relic.effects))),
      });
    }
  }

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  content = {
    balance: raw.balance,
    characters: raw.characters,
    consumables: raw.consumables,
    consumableById: byId(raw.consumables),
    relics,
    relicById: byId(relics),
    families: raw.relics.families,
    bossRelics: raw.bossRelics,
    bossRelicById: byId(raw.bossRelics),
    abilities: raw.enemies.abilities,
    abilityById: byId(raw.enemies.abilities),
    enemies: raw.enemies,
    events: raw.events,
    eventById: byId(raw.events),
    regions,
    regionById: byId(regions),
    regionByCategory: Object.fromEntries(regions.map((r) => [r.category, r])),
    mapThemes,
    bossTheme,
    recolorRules: raw.recolor.rules,
  };
  return content;
}

/** Libellé lisible d'un thème (catégorie de l'API). */
export const themeName = (category) => getContent().regionByCategory[category]?.theme ?? category;

/** Région d'un thème. */
export const regionOfTheme = (category) => getContent().regionByCategory[category];

/** Définition d'un objet quelconque (relique, relique de boss ou consommable) par son identifiant. */
export function itemDef(id) {
  const c = getContent();
  return c.relicById[id] ?? c.bossRelicById[id] ?? c.consumableById[id] ?? null;
}

/**
 * Liste tous les identifiants d'effet employés dans les données (pour vérifier
 * qu'ils sont tous implémentés dans effects.js).
 */
export function usedEffectIds(c = getContent()) {
  const ids = new Set();
  const walk = (effects) => {
    for (const e of effects ?? []) {
      ids.add(e.id);
      walk(e.params?.onCorrect);
      walk(e.params?.onWrong);
    }
  };
  [...c.relics, ...c.bossRelics, ...c.consumables, ...c.abilities, ...c.characters].forEach((x) => walk(x.effects));
  c.events.forEach((ev) => ev.choices.forEach((ch) => walk(ch.effects)));
  return [...ids].sort();
}
