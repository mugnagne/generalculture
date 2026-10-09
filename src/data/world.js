/**
 * world.js — Données de l'univers de Valdorn (univers original).
 *
 * `category` est l'identifiant exact renvoyé par Quizz API.
 * `background` désigne un fichier de assets/generated/backgrounds/ (null → fond uni).
 * Les polygones cliquables de la carte seront stockés dans regions.json (jalon 3).
 */

export const MARECHAL = {
  name: 'Le Maréchal',
  banner: 'faucille et marteau, or sur rouge',
  colors: ['#E3B341', '#C42430'],
  sprite: 'hero-knight',
};

/** Paliers de bataille : difficulté API, points de vie ennemi / joueur. */
export const TIERS = [
  { id: 1, label: 'facile', difficulty: 'facile', enemyHp: 6, playerHp: 5, role: 'soldiers' },
  { id: 2, label: 'moyen', difficulty: 'normal', enemyHp: 7, playerHp: 4, role: 'knight' },
  { id: 3, label: 'difficile', difficulty: 'difficile', enemyHp: 8, playerHp: 3, role: 'boss' },
];

export const MAX_QUESTIONS = 10;

/** Soldats par défaut, remplacés dans les Plaines de Cendre. */
const SOLDIER_SPRITE = 'medieval-warrior-3';

export const REGIONS = [
  {
    id: 'givre', name: 'Les Marches de Givre', where: 'extrême nord', category: 'actu_politique', theme: 'Actu / Politique',
    house: { name: 'Valgrim', arms: 'ours blanc dressé sur bleu nuit', colors: ['#1F2A44', '#E8F1F5'] },
    background: 'snow_region',
    soldiers: { name: 'Trappeurs des neiges', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Chevalier-Ours', sprite: 'fantasy-warrior' },
    boss: { name: 'Le Gardien de givre', sprite: 'frost-guardian' },
  },
  {
    id: 'iles', name: 'Les Îles du Couchant', where: 'archipel ouest', category: 'art_litterature', theme: 'Art / Littérature',
    house: { name: 'Morvane', arms: "rose des vents d'argent sur vert océan", colors: ['#1D5C5A', '#C9D1D3'] },
    background: 'pirate_ship',
    soldiers: { name: 'Corsaires', sprite: SOLDIER_SPRITE },
    knight: { name: 'La Capitaine-Chevalière', sprite: 'medieval-warrior-2', feminine: true },
    boss: { name: "L'Abomination des abysses", sprite: 'cthulu', feminine: true },
  },
  {
    id: 'cendre', name: 'Les Plaines de Cendre', where: 'est', category: 'tv_cinema', theme: 'TV / Cinéma',
    house: { name: 'Orvald', arms: "tour en ruine d'or sur brun", colors: ['#6B4A2B', '#C8A24A'] },
    background: 'ruin_region',
    soldiers: { name: 'Légionnaires spectraux', sprite: 'skeleton' },
    knight: { name: "Le Chevalier d'airain", sprite: 'fantasy-warrior' },
    boss: { name: "Le Bourreau de l'Empereur oublié", sprite: 'undead-executioner' },
  },
  {
    id: 'lumenor', name: 'Lumenor, la Cité des Érudits', where: 'centre-ouest, sur le fleuve', category: 'gastronomie', theme: 'Gastronomie',
    house: { name: 'Astrane', arms: 'astrolabe de cuivre sur indigo', colors: ['#352F7A', '#B8733A'] },
    background: 'wizard_region',
    soldiers: { name: 'Automates de cuivre', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Chevalier-Alchimiste', sprite: 'medieval-warrior-2' },
    boss: { name: "L'Archimage de Lumenor", sprite: 'evil-wizard-2' },
  },
  {
    id: 'collines', name: 'Les Collines Chantantes', where: 'centre', category: 'geographie', theme: 'Géographie',
    house: { name: 'Lyrande', arms: 'harpe crème sur bleu ciel', colors: ['#4A8FC4', '#F2E6C9'] },
    background: 'land_region',
    soldiers: { name: 'Ménestrels-guerriers', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Chevalier au cor', sprite: 'fantasy-warrior' },
    boss: { name: 'Le Sorcier des collines', sprite: 'evil-wizard' },
  },
  {
    id: 'joute', name: 'Les Champs de Joute', where: 'centre-est', category: 'histoire', theme: 'Histoire',
    house: { name: 'Hardencourt', arms: 'cheval cabré blanc sur bordeaux', colors: ['#7A1F2B', '#F4F4F4'] },
    background: 'medieval_fest_region',
    soldiers: { name: 'Écuyers bagarreurs', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Champion de joute', sprite: 'medieval-warrior-2' },
    boss: { name: "Le Démon de l'arène", sprite: 'demon-slime' },
  },
  {
    id: 'serenne', name: 'Les Jardins de Sérenne', where: 'sud-ouest', category: 'jeux_videos', theme: 'Jeux vidéo',
    house: { name: 'Delisande', arms: "plume d'or sur pourpre", colors: ['#6A1F4F', '#E0B080'] },
    background: 'roman_region',
    soldiers: { name: 'Duellistes de cour', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Chevalier-Poète', sprite: 'fantasy-warrior' },
    boss: { name: 'Le Coffre-Mimic', sprite: 'mimic' },
  },
  {
    id: 'sables', name: 'Les Sables Mirages', where: 'extrême sud', category: 'musique', theme: 'Musique',
    house: { name: 'Sahrim', arms: "masque de théâtre d'or sur sable", colors: ['#D4B06A', '#2A9D8F'] },
    background: 'desert_region',
    soldiers: { name: 'Nomades des dunes', sprite: SOLDIER_SPRITE },
    knight: { name: 'Le Chevalier des mirages', sprite: 'medieval-warrior-2' },
    boss: { name: 'Le Ver des sables', sprite: 'fire-worm' },
  },
  {
    id: 'hautecouronne', name: 'Hautecouronne', where: 'cœur du continent', category: 'culture_generale', theme: 'Culture générale',
    house: { name: 'Varn', arms: 'couronne noire sur gris acier', colors: ['#5B6670', '#111111'], fallen: true },
    background: 'throne_region',
    soldiers: { name: 'Garde du palais', sprite: SOLDIER_SPRITE, singular: 'La' },
    knight: { name: 'Le Champion du trône', sprite: 'fantasy-warrior' },
    boss: { name: "L'Usurpateur", sprite: 'medieval-king-2' },
    capital: true,
  },
];

/** Phrase de victoire : « Les Corsaires sont en déroute. », « Le Chevalier-Ours est vaincu. » */
export function defeatLine(enemy) {
  if (enemy.tier.role !== 'soldiers') return `${enemy.name} est ${enemy.feminine ? 'vaincue' : 'vaincu'}.`;
  return enemy.singular ? `${enemy.singular} ${enemy.name} est en déroute.` : `Les ${enemy.name} sont en déroute.`;
}

export const regionById = (id) => REGIONS.find((r) => r.id === id);

/** Ennemi d'une bataille (palier 1, 2 ou 3) dans une région. */
export function enemyFor(region, tierId) {
  const tier = TIERS.find((t) => t.id === tierId);
  return { ...region[tier.role], tier };
}
