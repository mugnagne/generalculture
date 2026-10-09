/**
 * audio.js — Sons facultatifs.
 *
 * Le jeu ne contient aucun son. Pour en ajouter, déposez des fichiers dans
 * assets/audio/ et listez-les dans assets/audio/sons.json, par exemple :
 *   { "clic": "clic.ogg", "bonne": "bonne.ogg", "musique-carte": "carte.mp3" }
 * Clés reconnues : voir SOUND_KEYS. Sans sons.json, le jeu reste silencieux.
 * Touche M : couper / rétablir le son (réglage mémorisé).
 */

export const SOUND_KEYS = {
  clic: 'bouton pressé',
  bonne: 'bonne réponse',
  mauvaise: 'mauvaise réponse ou temps écoulé',
  coup: 'un coup porté',
  victoire: 'bataille gagnée',
  defaite: 'bataille perdue',
  conquete: 'région conquise',
  'musique-titre': 'écran titre (boucle)',
  'musique-carte': 'carte (boucle)',
  'musique-combat': 'combat (boucle)',
  'musique-boss': 'combat contre un boss (boucle)',
  'musique-finale': 'victoire finale (boucle)',
};

const MUTE_KEY = 'valdorn:muted';
const LIST_URL = 'assets/audio/sons.json';

export function preloadAudioList(scene) {
  scene.load.json('sons', LIST_URL);
}

/** Charge les fichiers listés dans sons.json (à appeler dans create, avant de lancer le jeu). */
export function loadAudioFiles(scene, done) {
  const list = scene.cache.json.get('sons');
  if (!list || typeof list !== 'object') return done();
  let queued = 0;
  for (const [key, file] of Object.entries(list)) {
    if (!(key in SOUND_KEYS) || typeof file !== 'string') continue;
    scene.load.audio('snd:' + key, `assets/audio/${file}`);
    queued++;
  }
  if (!queued) return done();
  scene.load.once('complete', done);
  scene.load.start();
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function toggleMute(game) {
  const muted = !isMuted();
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch { /* réglage non mémorisé */ }
  game.sound.mute = muted;
  return muted;
}

/** Joue un effet s'il existe. */
export function sfx(scene, key, volume = 0.7) {
  if (scene.cache.audio.exists('snd:' + key)) scene.sound.play('snd:' + key, { volume });
}

/** Lance une musique en boucle (sans la relancer si c'est déjà celle-là). */
export function music(scene, key, volume = 0.45) {
  const id = 'snd:' + key;
  const current = scene.registry.get('music');
  if (current?.key === id && current.isPlaying) return;
  current?.stop();
  current?.destroy();
  if (!scene.cache.audio.exists(id)) {
    scene.registry.set('music', null);
    return;
  }
  const track = scene.sound.add(id, { loop: true, volume });
  track.play();
  scene.registry.set('music', track);
}
