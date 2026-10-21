import Phaser from 'phaser';
import { T } from './tuning.ts';
import { skin, prelit } from './dark.ts';
import { BLOOD, bleed, pool, run, stains } from './enemy.ts';
import { mark } from './crossbow.ts';
import { SHEETS, FLOOR } from './foes.data.ts';
import purifierSheet from './purifier.png';
import priestSheet from './priest.png';

// How the Order's Purificateur and Prêtre look (docs/maquettes/ennemis-planche-1.png): the validated sheet's own models
// rendered offline, already lit, in five views (tools/art/foes.gen.mjs), drawn at half scale like the grand hero
// (wanderer.ts), so each of their pixels is a screen pixel of the x2 rooms. Gameplay owns the AI state (RoomScene);
// this file shows it and its telegraphs on the floor, in the sheet's colours: the cone of fire, the circle of gold.
export type Kind = keyof typeof SHEETS;
export type FoeState = 'chase' | 'ignite' | 'fire' | 'recover' | 'pray' | 'smite' | 'held' | 'kneel';
type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;

export const isFoe = (kind: unknown): kind is Kind => kind === 'purifier' || kind === 'priest';
/** The eighth of a turn an angle points to: 0 right, 2 down, 4 left, 6 up. */
export const octant = (a: number) => (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
export const DIRS = 64; // the cone of fire is baked for this many aims
// The sheet's view for each octant, and whether it is mirrored (down and up keep the last way they faced).
const VIEW = ['side', 'dside', 'down', 'dside', 'side', 'uside', 'up', 'uside'];
const FLIP = [false, false, undefined, true, true, true, undefined, false];
const ORIGIN = 20; // sheet px from the soles up to the sprite's y: its feet 10 room px below it, like the crossbowman's
const GROUND = ORIGIN / 2;
const Z = 2; // telegraph texture px per room px: the fine grid of the x2 rooms
const SQ = T.lantern.squash; // the floor seen at an angle
const STRUCK = 0xff4a3a; // the hit flash: dyed with blood, never white (fx-blood.ts)

export function preload(scene: Scene) {
  for (const [key, url] of [['purifier', purifierSheet], ['priest', priestSheet]]) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, kind: Kind, x: number, y: number): Sprite {
  const S = SHEETS[kind], tex = scene.textures.get(kind);
  if (!tex.has('corpse')) for (const [name, { cell, lamp }] of Object.entries(S.FRAMES))
    Object.assign(tex.add(name, 0, (cell % S.COLS) * S.FW, Math.floor(cell / S.COLS) * S.FH, S.FW, S.FH)!.customData, { lamp });
  bakeTelegraphs(scene);
  const s = (group.create(x, y, kind, 'down-idle0') as Sprite).setOrigin(0.5, (S.SOLE - ORIGIN) / S.FH).setScale(0.5);
  s.setSize(24, 12).setOffset(S.FW / 2 - 12, S.SOLE - 8); // feet, 12x6 room px like the crossbowman's
  if (skin.dark) s.setBlendMode(prelit(scene));
  const floor = (key: string) => scene.add.image(0, 0, key, 0).setScale(1 / Z).setDepth(2).setVisible(false).setBlendMode(skin.dark ? prelit(scene) : Phaser.BlendModes.NORMAL);
  // The jet of fire is drawn apart from him, turned from its view to his real aim.
  const jet = scene.add.image(0, 0, kind, 'down-idle0').setScale(0.5).setVisible(false).setBlendMode(s.blendMode);
  s.setData({ born: scene.time.now, phase: Math.round(x * 3), walked: 0, at: [x, y], jet, cone: floor('fire-cone'), ring: floor('holy-zone'), disc: floor('holy-zone'), markG: scene.add.graphics().setDepth(7990) });
  return s;
}

/** Where a priest's monstrance shines, for the dark rooms' light (dark.ts): its floor point and height, room px. */
export function lamp(s: Sprite) {
  const [lx, ly] = (s.frame.customData as { lamp: [number, number] }).lamp, S = SHEETS.priest;
  return { x: s.x + ((lx - S.FW / 2) / 2) * (s.flipX ? -1 : 1), y: s.y + GROUND, h: (S.SOLE - ly) / 2 };
}

// The floor telegraphs, in the sheet's (fx.mjs floorFx) shapes and colours, on the fine grid: the cone of fire for each
// of DIRS aims (frames 0 to DIRS - 1, then burning), the holy circle (frame 0 its ring, 1 its full disc, 2 struck by the
// light, 3 its ring lit).
const FIRE = [0x5a2a0e, 0xc06a20, 0xe8a040, 0xffd890]; // the palette's rust / fire, dark to light
const GOLD = [0x535d31, 0x8f9852, 0xc4a254, 0xe2c886, 0xffe8b0];
function bakeTelegraphs(scene: Scene) {
  if (scene.textures.exists('fire-cone')) return;
  const P = T.purifier, R = P.reach * Z, half = (P.halfDeg * Math.PI) / 180, cw = 2 * R + 4, ch = Math.ceil(2 * R * SQ) + 4;
  canvas(scene, 'fire-cone', cw, ch, 2 * DIRS, (f, x, y) => {
    const dx = x - cw / 2, dy = (y - ch / 2) / SQ, d = Math.hypot(dx, dy), hot = f >= DIRS;
    const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ((f % DIRS) * 2 * Math.PI) / DIRS));
    if (d > R + 0.5 || da > half || d < 3) return -1;
    if (R - d < 1.2 || (half - da) * d < 1.2) return FIRE[hot ? 3 : 2]; // its edge
    if ((x + y) % 6 < 1) return FIRE[hot ? 2 : 1]; // hatched
    return (x + y) % 2 ? -1 : FIRE[hot ? 1 : 0]; // a dithered fill
  });
  const Rz = T.priest.radius * Z, zw = 2 * Rz + 4, zh = Math.ceil(2 * Rz * SQ) + 4;
  canvas(scene, 'holy-zone', zw, zh, 4, (f, x, y) => {
    const dx = x - zw / 2, dy = (y - zh / 2) / SQ, d = Math.hypot(dx, dy), lit = f >= 2 ? 1 : 0;
    if (Math.abs(d - Rz) < 1.6) return GOLD[3 + lit]; // the ring
    if (f === 0 || f === 3 || d > Rz) return -1;
    if (Math.abs(d - Rz * 0.62) < 0.7) return GOLD[3 + lit]; // the inner ring
    if (d > 3 && Math.abs(Math.sin(Math.atan2(dy, dx) * 6)) < 0.08 + 1.2 / d) return GOLD[2 + lit]; // its rays
    if ((x + y) % 4 < 1) return GOLD[2 + lit];
    return (x + y) % 2 ? -1 : GOLD[1 + lit];
  });
}
function canvas(scene: Scene, key: string, w: number, h: number, n: number, px: (f: number, x: number, y: number) => number) {
  const cols = Math.min(n, 16), W = w * cols, t = scene.textures.createCanvas(key, W, h * Math.ceil(n / cols))!, img = t.context.createImageData(t.width, t.height);
  for (let f = 0; f < n; f++) {
    const ox = (f % cols) * w, oy = Math.floor(f / cols) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = px(f, x, y);
      if (c >= 0) img.data.set([c >> 16, (c >> 8) & 255, c & 255, 255], ((oy + y) * W + ox + x) * 4);
    }
    t.add(f, 0, ox, oy, w, h);
  }
  t.putData(img, 0, 0);
  t.refresh();
}

/** Shows the foe in `state`; facing and its locked aim (a floor angle, logic.ts aimAt()), its circle and timings are in its data.
 *  `weak`: hurt enough to be bitten. */
export function show(s: Sprite, state: FoeState, flash: boolean, weak: boolean) {
  const now = s.scene.time.now, kind = s.texture.key as Kind;
  if (s.getData('look') !== state) s.setData({ look: state, lookAt: now });
  if (flash && !s.getData('flashOn')) {
    s.setData('hitAt', now);
    bleed(s.scene, s.x, s.y, s.getData('facing') + Math.PI, 5, 0.7, 0.8);
  }
  s.setData('flashOn', flash);
  const t = now - s.getData('lookAt'), hurt = now - (s.getData('hitAt') ?? -1e9), S = SHEETS[kind];
  const aiming = state === 'ignite' || state === 'fire', aim = s.getData('aim'), o = aiming ? octant(aim) : octant(s.getData('facing'));
  if (FLIP[o] !== undefined) s.setFlipX(FLIP[o]!);
  // His steps follow the floor he covers, so his feet hold it (up the screen the floor is foreshortened).
  const [ax, ay] = s.getData('at'), walked = s.getData('walked') + Math.hypot(s.x - ax, (s.y - ay) / FLOOR);
  s.setData({ at: [s.x, s.y], walked });
  let f = 'idle' + (Math.floor((now + s.getData('phase')) / 250) % 4); // breathing, the pilot or the monstrance flickering
  if (state === 'kneel') f = 'kneel';
  else if (state === 'ignite') f = 'ignite';
  else if (state === 'fire') f = 'fire' + (Math.floor(now / 70) % 2);
  else if (state === 'pray' || state === 'smite') f = 'pray';
  else if (state !== 'held' && hurt < 200) f = 'hurt'; // struck: he reels back (the blow's knockback carries him)
  else if (state !== 'held' && s.body!.velocity.lengthSq() > 25) f = 'walk' + (Math.floor((walked / S.STRIDE) * S.WALK) % S.WALK);
  s.setFrame(`${VIEW[o]}-${f}`);
  if (hurt < 120 && flash) s.setTint(STRUCK);
  else s.clearTint();

  // The jet leaves the lance and runs along his real aim: its view's frame, turned on the lance from the way it points in
  // that view (the sheets' foreshortened floor) to the aim on the game's floor.
  const jet = s.getData('jet') as Phaser.GameObjects.Image;
  jet.setVisible(state === 'fire');
  if (state === 'fire') {
    const name = `${VIEW[o]}-jet${Math.floor(now / 70) % 2}`, [px, py] = (s.texture.get(name).customData as { lamp: [number, number] }).lamp;
    const v = [0, Math.PI / 4, Math.PI / 2, Math.PI / 4, 0, -Math.PI / 4, -Math.PI / 2, -Math.PI / 4][o], V = Math.atan2(Math.sin(v) * FLOOR, Math.cos(v));
    const A = Math.atan2(Math.sin(aim) * SQ, Math.cos(aim)), k = s.flipX ? -1 : 1;
    jet.setFrame(name).setFlipX(s.flipX).setOrigin(s.flipX ? 1 - px / S.FW : px / S.FW, py / S.FH)
      .setPosition(s.x + ((px - S.FW / 2) / 2) * k, s.y + (py - (S.SOLE - ORIGIN)) / 2).setRotation(A - (s.flipX ? Math.PI - V : V))
      .setDepth(s.y + (o >= 5 ? -1 : T.purifier.reach)); // away from the camera behind him, else over whoever it burns
  }

  // The cone of fire from his feet: lit with the pilot, it flickers just before the jet, then burns.
  const cone = s.getData('cone') as Phaser.GameObjects.Image, fx = s.x, fy = s.y + GROUND;
  cone.setVisible(aiming).setPosition(fx, fy).setAlpha(state === 'ignite' ? Math.min(1, 0.4 + t / 200) : 1);
  const d = ((Math.round((aim * DIRS) / (2 * Math.PI)) % DIRS) + DIRS) % DIRS;
  if (aiming) cone.setFrame(state === 'fire' || (t > T.purifier.igniteMs - 160 && Math.floor(t / 50) % 2) ? d + DIRS : d);
  // The circle of gold under the hero: its ring, filling from its centre, then struck by the light.
  const ring = s.getData('ring') as Phaser.GameObjects.Image, disc = s.getData('disc') as Phaser.GameObjects.Image, zone = s.getData('zone');
  const praying = state === 'pray' || state === 'smite';
  ring.setVisible(praying);
  disc.setVisible(praying);
  const g = s.getData('markG') as Phaser.GameObjects.Graphics;
  g.clear();
  if (praying) {
    const k = state === 'pray' ? Math.min(1, t / T.priest.fillMs) : 1;
    ring.setPosition(zone.x, zone.y).setFrame(state === 'smite' || (t > T.priest.fillMs - 200 && Math.floor(t / 50) % 2) ? 3 : 0); // it flickers just before the light falls
    disc.setPosition(zone.x, zone.y).setFrame(state === 'smite' ? 2 : 1).setScale(k / Z);
    if (state === 'smite') smite(g, zone, t / T.priest.smiteMs);
  }
  const head = kind === 'priest' ? 41 : 37; // room px over the feet; kneeling, 9 less
  if (weak && state !== 'held') mark(g, s.x + (s.flipX ? -1 : 1), s.y + GROUND - head + (state === 'kneel' ? 9 : 0), now + s.getData('phase'), state === 'kneel' ? 1100 : 700);
}

// The holy light falling on the circle, as the sheet's motes: sparks of gold raining down onto it, fading as they land.
function smite(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, k: number) {
  const r = T.priest.radius;
  for (let i = 0; i < 40; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h), w = Math.sqrt((i * 0.618) % 1), z = 70 * (((i * 0.382) % 1) * 0.6 + 1 - k * 1.4);
    if (z < 0) continue;
    const x = at.x + Math.cos(u * 6.283) * w * r * 0.9, y = at.y + Math.sin(u * 6.283) * w * r * 0.9 * SQ - z;
    g.fillStyle(z > 40 ? GOLD[4] : 0xfff4d8, Math.min(1, z / 12)).fillRect(Math.round(x), Math.round(y), 1, 2);
  }
}

export function die(scene: Scene, s: Sprite) {
  for (const k of ['jet', 'cone', 'ring', 'disc', 'markG']) s.getData(k).destroy();
  const key = s.texture.key, view = s.frame.name.split('-')[0], blend = s.blendMode;
  s.setTint(STRUCK);
  scene.time.delayedCall(70, () => {
    const { x, y, flipX, originY } = s, away = (s.getData('facing') ?? 0) + Math.PI;
    s.destroy();
    // Humans bleed: a red burst, he sinks to his knees, falls, and a pool spreads under him.
    bleed(scene, x, y, away, 20, 1.2, 1);
    const body = scene.add.image(x, y, key, `${view}-kneel`).setOrigin(0.5, originY).setScale(0.5).setFlipX(flipX).setDepth(y).setBlendMode(blend);
    scene.time.delayedCall(220, () => {
      body.setFrame('corpse').setDepth(1.5); // on the floor, over its blood, under everyone
      run(scene, 600, (t) => {
        const k = Phaser.Math.Easing.Quadratic.Out(t / 0.6), rt = stains(scene);
        pool(x, y + GROUND - 6, 4 + 24 * k, 2 + 8 * k, (c, px, py, w) => rt.fill(c, 1, px, py, w, 1), BLOOD.mid, BLOOD.dark);
        rt.render();
      }, () => { // settled: into the floor's layer of the dead, which keeps them for the fight
        corpses(scene).stamp(key, 'corpse', x * skin.zoom, y * skin.zoom, { originY, scaleX: (flipX ? -0.5 : 0.5) * skin.zoom, scaleY: 0.5 * skin.zoom }).render();
        body.destroy();
      });
    });
  });
}

// The dead of the Order: one layer over the room's floor blood (enemy.ts stains), at its resolution, drawn already lit
// like them (the blood layer is lit by the dark rooms, they are not).
function corpses(scene: Scene) {
  const b = scene.physics.world.bounds, Z = skin.zoom;
  return (scene.children.getByName('foe-corpses') as Phaser.GameObjects.RenderTexture | null)
    ?? scene.add.renderTexture(0, 0, (b.right + 40) * Z, (b.bottom + 16) * Z).setOrigin(0).setScale(1 / Z).setDepth(1.5).setName('foe-corpses')
      .setBlendMode(skin.dark ? prelit(scene) : Phaser.BlendModes.NORMAL).setTint(0xa0a0a0); // the dead give back less light
}
