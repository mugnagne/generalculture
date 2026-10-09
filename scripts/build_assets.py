#!/usr/bin/env python3
"""
build_assets.py — Prépare les ressources du jeu SANS toucher aux fichiers d'origine.

Produit :
  assets/sprites/manifest.json        animations mesurées (taille de frame, nombre, fps)
  assets/generated/backgrounds/*.jpg  décors réduits en 480x270
  assets/generated/map/map.jpg        carte réduite en 480x270
  assets/generated/palette.json       les 64 couleurs ENDESGA lues dans le PNG

Les tailles de frame ne sont pas devinées : chaque image est découpée selon la
taille indiquée ci-dessous, puis les cases vides (100 % transparentes) en fin de
bande ou de ligne sont ignorées pour compter les frames réelles.

Usage : python3 scripts/build_assets.py   (nécessite Pillow)
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPR = ROOT / 'assets' / 'sprites'
GEN = ROOT / 'assets' / 'generated'
BASE_W, BASE_H = 480, 270

# fps par type d'animation (les packs ne les fournissent pas)
FPS = {'idle': 8, 'run': 12, 'walk': 10, 'attack': 14, 'hurt': 12, 'death': 10}


def fps_for(name):
    for key, value in FPS.items():
        if name.startswith(key):
            return value
    return 10


def count_frames(img, fw, fh, row=None):
    """Nombre de cases non vides en ordre ligne par ligne (cases vides finales ignorées)."""
    cols, rows = img.width // fw, img.height // fh
    rng = [row] if row is not None else range(rows)
    filled = []
    for r in rng:
        for c in range(cols):
            filled.append(img.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)).getbbox() is not None)
    while filled and not filled[-1]:
        filled.pop()
    return len(filled), cols


def strip(path, fw=None, fh=None):
    """Bande horizontale ou grille : une animation par fichier."""
    img = Image.open(SPR / path).convert('RGBA')
    fh = fh or img.height
    fw = fw or fh  # frames carrées par défaut
    n, cols = count_frames(img, fw, fh)
    return {'file': f'assets/sprites/{path}', 'frameWidth': fw, 'frameHeight': fh,
            'start': 0, 'frames': n, 'columns': cols}


def sheet_row(path, fw, fh, row):
    """Une ligne d'une planche multi-animations (packs chierit)."""
    img = Image.open(SPR / path).convert('RGBA')
    n, cols = count_frames(img, fw, fh, row)
    return {'file': f'assets/sprites/{path}', 'frameWidth': fw, 'frameHeight': fh,
            'start': row * cols, 'frames': n, 'columns': cols}


def body_metrics(anim):
    """Silhouette visible de la 1re frame d'idle : hauteur, pied, centre (pour l'échelle et l'ancrage)."""
    img = Image.open(ROOT / anim['file']).convert('RGBA')
    cols = anim['columns']
    i = anim['start']
    fw, fh = anim['frameWidth'], anim['frameHeight']
    x, y = (i % cols) * fw, (i // cols) * fh
    l, t, r, b = img.crop((x, y, x + fw, y + fh)).getbbox()
    return {'height': b - t, 'bottom': b, 'centerX': (l + r) / 2, 'width': r - l}


LM = 'Sprites'
CHARACTERS = {
    'hero-knight': ('Hero Knight', 'right', {
        'idle': strip(f'Hero Knight/{LM}/Idle.png'), 'attack': strip(f'Hero Knight/{LM}/Attack1.png'),
        'attack2': strip(f'Hero Knight/{LM}/Attack2.png'), 'hurt': strip(f'Hero Knight/{LM}/Take Hit.png'),
        'death': strip(f'Hero Knight/{LM}/Death.png'), 'run': strip(f'Hero Knight/{LM}/Run.png'),
        'jump': strip(f'Hero Knight/{LM}/Jump.png'), 'fall': strip(f'Hero Knight/{LM}/Fall.png')}),
    'medieval-warrior-3': ('Medieval Warrior Pack 3', 'right', {
        'idle': strip(f'Medieval Warrior Pack 3/{LM}/Idle.png'), 'attack': strip(f'Medieval Warrior Pack 3/{LM}/Attack1.png'),
        'attack2': strip(f'Medieval Warrior Pack 3/{LM}/Attack2.png'), 'attack3': strip(f'Medieval Warrior Pack 3/{LM}/Attack3.png'),
        'hurt': strip(f'Medieval Warrior Pack 3/{LM}/Get Hit.png'), 'death': strip(f'Medieval Warrior Pack 3/{LM}/Death.png'),
        'run': strip(f'Medieval Warrior Pack 3/{LM}/Run.png')}),
    'medieval-warrior-2': ('Medieval Warrior Pack 2', 'right', {
        'idle': strip(f'Medieval Warrior Pack 2/{LM}/Idle.png'), 'attack': strip(f'Medieval Warrior Pack 2/{LM}/Attack1.png'),
        'attack2': strip(f'Medieval Warrior Pack 2/{LM}/Attack2.png'), 'attack3': strip(f'Medieval Warrior Pack 2/{LM}/Attack3.png'),
        'attack4': strip(f'Medieval Warrior Pack 2/{LM}/Attack4.png'), 'hurt': strip(f'Medieval Warrior Pack 2/{LM}/Take Hit.png'),
        'death': strip(f'Medieval Warrior Pack 2/{LM}/Death.png'), 'run': strip(f'Medieval Warrior Pack 2/{LM}/Run.png')}),
    'fantasy-warrior': ('Fantasy Warrior', 'right', {
        'idle': strip(f'Fantasy Warrior/{LM}/Idle.png'), 'attack': strip(f'Fantasy Warrior/{LM}/Attack1.png'),
        'attack2': strip(f'Fantasy Warrior/{LM}/Attack2.png'), 'attack3': strip(f'Fantasy Warrior/{LM}/Attack3.png'),
        'hurt': strip(f'Fantasy Warrior/{LM}/Take hit.png'), 'death': strip(f'Fantasy Warrior/{LM}/Death.png'),
        'run': strip(f'Fantasy Warrior/{LM}/Run.png')}),
    'skeleton': ('Monsters Creatures Fantasy', 'right', {
        'idle': strip('Monsters_Creatures_Fantasy/Skeleton/Idle.png'), 'attack': strip('Monsters_Creatures_Fantasy/Skeleton/Attack.png'),
        'hurt': strip('Monsters_Creatures_Fantasy/Skeleton/Take Hit.png'), 'death': strip('Monsters_Creatures_Fantasy/Skeleton/Death.png'),
        'walk': strip('Monsters_Creatures_Fantasy/Skeleton/Walk.png'), 'shield': strip('Monsters_Creatures_Fantasy/Skeleton/Shield.png')}),
    'evil-wizard': ('Evil Wizard', 'right', {
        'idle': strip(f'Evil Wizard/{LM}/Idle.png'), 'attack': strip(f'Evil Wizard/{LM}/Attack.png'),
        'hurt': strip(f'Evil Wizard/{LM}/Take Hit.png'), 'death': strip(f'Evil Wizard/{LM}/Death.png'),
        'walk': strip(f'Evil Wizard/{LM}/Move.png')}),
    'evil-wizard-2': ('Evil Wizard 2', 'right', {
        'idle': strip(f'EVil Wizard 2/{LM}/Idle.png'), 'attack': strip(f'EVil Wizard 2/{LM}/Attack1.png'),
        'attack2': strip(f'EVil Wizard 2/{LM}/Attack2.png'), 'hurt': strip(f'EVil Wizard 2/{LM}/Take hit.png'),
        'death': strip(f'EVil Wizard 2/{LM}/Death.png'), 'run': strip(f'EVil Wizard 2/{LM}/Run.png')}),
    'fire-worm': ('Fire Worm', 'right', {
        'idle': strip('Fire Worm/Sprites/Worm/Idle.png'), 'attack': strip('Fire Worm/Sprites/Worm/Attack.png'),
        'hurt': strip('Fire Worm/Sprites/Worm/Get Hit.png'), 'death': strip('Fire Worm/Sprites/Worm/Death.png'),
        'walk': strip('Fire Worm/Sprites/Worm/Walk.png')}),
    'medieval-king-2': ('Medieval King Pack 2', 'right', {
        # Frames non carrées : 160x111 (largeur des bandes multiple de 160)
        'idle': strip(f'Medieval King Pack 2/{LM}/Idle.png', 160, 111), 'attack': strip(f'Medieval King Pack 2/{LM}/Attack1.png', 160, 111),
        'attack2': strip(f'Medieval King Pack 2/{LM}/Attack2.png', 160, 111), 'attack3': strip(f'Medieval King Pack 2/{LM}/Attack3.png', 160, 111),
        'hurt': strip(f'Medieval King Pack 2/{LM}/Take Hit.png', 160, 111), 'death': strip(f'Medieval King Pack 2/{LM}/Death.png', 160, 111),
        'run': strip(f'Medieval King Pack 2/{LM}/Run.png', 160, 111)}),
    'mimic': ('Monsters Creatures Fantasy 2', 'right', {
        'idle': strip('Monsters Creatures Fantasy 2/Mimic/idle_transformed.png'), 'attack': strip('Monsters Creatures Fantasy 2/Mimic/attack_1.png'),
        'attack2': strip('Monsters Creatures Fantasy 2/Mimic/attack_2.png'), 'hurt': strip('Monsters Creatures Fantasy 2/Mimic/hurt.png'),
        'death': strip('Monsters Creatures Fantasy 2/Mimic/death.png'), 'walk': strip('Monsters Creatures Fantasy 2/Mimic/walk.png'),
        'transform': strip('Monsters Creatures Fantasy 2/Mimic/transform.png'), 'closed': strip('Monsters Creatures Fantasy 2/Mimic/Idle_closed.png')}),
    'frost-guardian': ('Frost Guardian (chierit)', 'right', {
        name: sheet_row('Frost_Guardian_FREE_v1.0/frost_guardian_free_192x128_SpriteSheet.png', 192, 128, row)
        for row, name in enumerate(['idle', 'walk', 'attack', 'hurt', 'death'])}),
    'cthulu': ('Cthulu (chierit)', 'right', {
        name: sheet_row('free_cthulu/animations/cthulu_192x112_SpriteSheet.png', 192, 112, row)
        for row, name in enumerate(['idle', 'walk', 'fly', 'attack', 'attack2', 'hurt', 'death'])}),
    'demon-slime': ('Demon Slime (chierit)', 'right', {
        name: sheet_row('boss_demon_slime_FREE_v1.0/spritesheets/demon_slime_FREE_v1.0_288x160_spritesheet.png', 288, 160, row)
        for row, name in enumerate(['idle', 'walk', 'attack', 'hurt', 'death'])}),
    'undead-executioner': ('Undead Executioner (Kronovi)', 'right', {
        # Grilles de cases 100x100 ; pas d'animation de dégâts (simulée en jeu)
        'idle': strip('Undead executioner puppet/png/idle.png', 100, 100),
        'idle2': strip('Undead executioner puppet/png/idle2.png', 100, 100),
        'attack': strip('Undead executioner puppet/png/attacking.png', 100, 100),
        'attack2': strip('Undead executioner puppet/png/skill1.png', 100, 100),
        'summon': strip('Undead executioner puppet/png/summon.png', 100, 100),
        'death': strip('Undead executioner puppet/png/death.png', 100, 100)}),
}

# Sens de regard par défaut, vérifié visuellement sur la page de debug.
FACING_OVERRIDES = {
    'mimic': 'left', 'frost-guardian': 'left', 'demon-slime': 'left', 'undead-executioner': 'left',
}


def build_manifest():
    out = {'generatedBy': 'scripts/build_assets.py', 'characters': {}}
    for key, (pack, facing, anims) in CHARACTERS.items():
        for name, anim in anims.items():
            anim['fps'] = fps_for(name)
            anim['loop'] = name.startswith(('idle', 'run', 'walk', 'fly'))
        out['characters'][key] = {
            'pack': pack,
            'facing': FACING_OVERRIDES.get(key, facing),
            'body': body_metrics(anims['idle']),
            'anims': anims,
        }
    path = SPR / 'manifest.json'
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print('manifest :', path.relative_to(ROOT), len(out['characters']), 'personnages')


def build_images():
    for src in sorted((ROOT / 'assets' / 'backgrounds').glob('*.jp*g')) + [ROOT / 'assets' / 'map' / 'map.jpeg']:
        sub = 'map' if src.parent.name == 'map' else 'backgrounds'
        dst = GEN / sub / (src.stem + '.jpg')
        dst.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(src).convert('RGB')
        # Recadrage au ratio 16:9 exact puis réduction
        w, h = img.size
        target_h = round(w * BASE_H / BASE_W)
        if target_h <= h:
            top = (h - target_h) // 2
            img = img.crop((0, top, w, top + target_h))
        img.resize((BASE_W, BASE_H), Image.LANCZOS).save(dst, quality=88)
        print('image :', dst.relative_to(ROOT))


def build_palette():
    src = ROOT / 'assets' / 'palette' / 'endesga-64-32x.png'
    img = Image.open(src).convert('RGB')
    cell = img.height
    colors = ['#%02X%02X%02X' % img.getpixel((i * cell + cell // 2, cell // 2)) for i in range(img.width // cell)]
    (GEN / 'palette.json').write_text(json.dumps({'name': 'ENDESGA 64', 'colors': colors}, indent=1))
    print('palette :', len(colors), 'couleurs')


if __name__ == '__main__':
    GEN.mkdir(parents=True, exist_ok=True)
    build_manifest()
    build_images()
    build_palette()
