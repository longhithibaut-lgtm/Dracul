import Phaser from 'phaser';
import { T } from './tuning.ts';
import { TORCHES } from './torture.ts';

// The trial room's light (« Crasse et faim », docs/decisions.md). A multiply layer over the whole room sinks it into the
// dark, but for a faint night vision that lets shapes be guessed; lights add stepped, dithered pools into it (pixel art,
// not a blur): the hero's lantern (yellow-green, swaying in his hand, a gentle flicker), the dying torches, the gate's
// cold glimmer, the Order's lanterns. Shadows are painted into the room (torture.ts), the characters keep their ellipse.
// Eyes (the hero's, every enemy's) glow over the dark, and so do the torch flames; the aim lines and the effects are
// drawn above it, so threats stay readable. Over everything, animated film grain.

/** The trial room is on: the sprite modules bake and pick their dark skins (wanderer.ts, enemy.ts, crossbow.ts). */
export const skin = { dark: false };

type Sprite = Phaser.Physics.Arcade.Sprite;
type Spot = { x: number; y: number; lit: boolean };

const DEPTH = 7980; // over the room, its characters and its front wall (7970); under the aim lines (7990) and effects (9000)
const AMBIENT = 0x22221c; // night vision
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A white pool of light `r` px in radius (flattened by `squash`, seen at an angle), (1 - d²)² like the mockup's, in
 *  `steps` bands dithered into each other. */
function pool(scene: Phaser.Scene, r: number, squash = 0.8, steps = 6) {
  const key = `dark-light-${r}-${squash}`;
  if (scene.textures.exists(key)) return key;
  const w = 2 * r, h = Math.round(2 * r * squash), t = scene.textures.createCanvas(key, w, h)!, img = t.context.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - r) / r, (y + 0.5 - h / 2) / (h / 2)), f = Math.max(0, 1 - d * d) ** 2;
      const v = (255 * Math.min(steps, Math.floor(f * steps + BAYER[(y & 3) * 4 + (x & 3)] / 16))) / steps;
      img.data.set([v, v, v, 255], (y * w + x) * 4);
    }
  t.putData(img, 0, 0);
  t.refresh();
  return key;
}

/** Pixel grids into one canvas texture, one frame each. */
function grids(scene: Phaser.Scene, key: string, frames: string[][], pal: Record<string, string>) {
  if (scene.textures.exists(key)) return key;
  const w = frames[0][0].length, h = frames[0].length, t = scene.textures.createCanvas(key, w * frames.length, h)!;
  frames.forEach((rows, f) => {
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      t.context.fillStyle = pal[c];
      t.context.fillRect(f * w + x, y, 1, 1);
    }));
    t.add(String(f), 0, f * w, 0, w, h);
  });
  t.refresh();
  return key;
}
const FLAME = ['..W..|.yWy.|.YWY.|yYWYy|.oYo.|..o..', '.....|..y..|.yW..|.YWYy|yYWY.|.oYo.', '.....|..y..|..Wy.|yYWY.|.YWYy|.oYo.'].map((f) => f.split('|'));
const FLAME_PAL = { W: '#ffd890', Y: '#e8a040', y: '#c06a20', o: '#8a4516' };
const GRAIN = 96;
function grain(scene: Phaser.Scene) {
  const key = 'dark-grain';
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, GRAIN, GRAIN)!, img = t.context.createImageData(GRAIN, GRAIN);
  for (let i = 0; i < GRAIN * GRAIN; i++) {
    const r = Math.random();
    if (r < 0.12) img.data.set([0, 0, 0, 60], i * 4);
    else if (r > 0.95) img.data.set([200, 192, 160, 22], i * 4);
  }
  t.putData(img, 0, 0);
  t.refresh();
  return key;
}

/** Lights the room around `hero`; `lanterns()`: the Order's lanterns standing. Its layer is named 'dark-light' (hide
 *  it to see the room unlit: the update is skipped), the grain 'dark-grain'. */
export function light(scene: Phaser.Scene, hero: Sprite, enemies: Phaser.Physics.Arcade.Group, lanterns: () => Spot[], height: number) {
  const ADD = Phaser.BlendModes.ADD;
  const rt = scene.add.renderTexture(0, 0, T.width, height).setOrigin(0).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY).setName('dark-light');
  const night = pool(scene, 150, 0.8, 4), lamp = pool(scene, 90), torch = pool(scene, 80), gate = pool(scene, 60, 0.7), order = pool(scene, T.lantern.radius, T.lantern.squash, 4);
  const noise = scene.add.tileSprite(0, 0, 480, 640, grain(scene)).setOrigin(0).setScrollFactor(0).setDepth(9500).setName('dark-grain');
  // The mockup's haze round its glass, over the dark.
  const haze = scene.add.image(0, 0, pool(scene, 28, 1, 4)).setTint(0xb8c070).setBlendMode(ADD).setDepth(DEPTH + 1);
  const flameKey = grids(scene, 'dark-flame', FLAME, FLAME_PAL);
  if (!scene.anims.exists('dark-flame')) scene.anims.create({ key: 'dark-flame', frames: [0, 1, 2].map((f) => ({ key: flameKey, frame: String(f) })), frameRate: 8, repeat: -1 });
  const lit = TORCHES.filter((t) => t[3] > 0);
  for (const [x, y, h, k] of lit) scene.add.sprite(x, y - h, flameKey).setOrigin(0.5, 1).setDepth(DEPTH + 5).setAlpha(0.6 + 0.4 * k).play({ key: 'dark-flame', startFrame: x % 3 });
  const flicker = lit.map(() => 1);
  const eyes = new Map<Sprite, Phaser.GameObjects.Image>();
  let tick = 0, lamp0 = 1;

  const step = (time: number) => {
    // The lantern glass in his hand, wherever this frame of his sheet has it (wanderer.ts); the old hero has none.
    const [ax, ay] = (hero.frame.customData as { lamp?: [number, number] }).lamp ?? [hero.frame.width / 2, 29], tl = hero.getTopLeft();
    const lx = Math.round(tl.x! + (hero.flipX ? hero.frame.width - ax : ax)), ly = Math.round(tl.y! + ay);
    haze.setPosition(lx, ly).setVisible(hero.visible && rt.visible).setAlpha(0.22 * lamp0);
    // Eyes over the dark: each sprite's own eye pixels (its sheet's '*' frames), placed like it.
    for (const s of [hero, ...(enemies.getChildren() as Sprite[])]) {
      const f = `${s.frame.name.replace('!', '')}*`;
      let e = eyes.get(s);
      if (!e) eyes.set(s, (e = scene.add.image(0, 0, s.texture.key).setDepth(DEPTH + 5)));
      if (!s.texture.has(f)) { e.setVisible(false); continue; }
      e.setTexture(s.texture.key, f).setPosition(s.x, s.y).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setVisible(s.visible && rt.visible).setAlpha(s.alpha);
    }
    for (const [s, e] of eyes) if (!s.active) { e.destroy(); eyes.delete(s); }
    if (!rt.visible) return;
    if (++tick % 6 === 0) { // ten times a second: the torches gutter, the lamp breathes, the grain moves
      lit.forEach(([, , , k], i) => (flicker[i] = k * (Math.random() < 0.15 ? 0.55 + Math.random() * 0.2 : 0.8 + Math.random() * 0.2)));
      lamp0 = 0.9 + 0.08 * Math.sin(time / 400) + Math.random() * 0.04;
      noise.setTilePosition(Math.floor(Math.random() * GRAIN), Math.floor(Math.random() * GRAIN));
    }
    rt.fill(AMBIENT);
    rt.stamp(night, undefined, hero.x, hero.y + 8, { tint: 0x3a3a2c, blendMode: ADD });
    lit.forEach(([x, y, h], i) => rt.stamp(torch, undefined, x, y - h * 0.4, { tint: 0xd89850, alpha: flicker[i], blendMode: ADD }));
    rt.stamp(gate, undefined, 240, 52, { tint: 0x5a7a70, alpha: 0.8, blendMode: ADD });
    for (const l of lanterns()) if (l.lit) rt.stamp(order, undefined, l.x, l.y, { tint: 0xb08850, alpha: 0.6, blendMode: ADD });
    rt.stamp(lamp, undefined, lx, ly, { tint: 0xeef0a0, alpha: lamp0, blendMode: ADD });
    rt.render();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step));
}
