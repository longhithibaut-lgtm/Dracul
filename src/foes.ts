import Phaser from 'phaser';
import { T } from './tuning.ts';
import { skin, prelit } from './dark.ts';
import { BLOOD, bleed, pool, run, stains } from './enemy.ts';
import { mark } from './crossbow.ts';
import { SHEETS, FLOOR } from './foes.data.ts';
import purifierSheet from './purifier.png';
import priestSheet from './priest.png';
import houndSheet from './hound.png';
import penitentSheet from './penitent.png';
import ringerSheet from './ringer.png';
import inquisitorSheet from './inquisitor.png';

// How the Order's Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur (docs/maquettes/ennemis-planche-1.png) and
// Inquisiteur (ennemis-planche-2.png) look: the
// validated sheet's own models rendered offline, already lit, in five views (tools/art/foes.gen.mjs), drawn at half
// scale like the grand hero (wanderer.ts), so each of their pixels is a screen pixel of the x2 rooms. Gameplay owns the
// AI state (RoomScene); this file shows it. No mark on the floor announces an attack (docs/decisions.md): only their
// bodies do (the pilot lit, the monstrance raised, the hound flattened, the scourge cocked, the bell's rim lit, the censer
// whirled), then the attack itself (the jet, the falling light, the lash, the bell's rings rolling out, the sweep).
export type Kind = keyof typeof SHEETS;
export type FoeState = 'chase' | 'ignite' | 'fire' | 'recover' | 'pray' | 'smite' | 'crouch' | 'leap' | 'cock' | 'lash' | 'raise' | 'toll' | 'whirl' | 'sweep' | 'held' | 'kneel';
type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;

export const isFoe = (kind: unknown): kind is Kind => typeof kind === 'string' && kind in SHEETS;
/** The eighth of a turn an angle points to: 0 right, 2 down, 4 left, 6 up. */
export const octant = (a: number) => (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
export const DIRS = 64; // aims (logic.ts aimAt()) snap to this many directions
// The sheet's view for each octant, and whether it is mirrored (down and up keep the last way they faced).
const VIEW = ['side', 'dside', 'down', 'dside', 'side', 'uside', 'up', 'uside'];
const FLIP = [false, false, undefined, true, true, true, undefined, false];
const ORIGIN = 20; // sheet px from the soles up to the sprite's y: its feet 10 room px below it, like the crossbowman's
const GROUND = ORIGIN / 2;
const SQ = T.lantern.squash; // the floor seen at an angle
const STRUCK = 0xff4a3a; // the hit flash: dyed with blood, never white (fx-blood.ts)
// The states that face the aim locked at their start, and the pose each one holds.
const LOCKED: FoeState[] = ['ignite', 'fire', 'crouch', 'leap', 'cock', 'lash', 'whirl', 'sweep'];
const POSE: Partial<Record<FoeState, string>> = { kneel: 'kneel', ignite: 'ignite', pray: 'pray', smite: 'pray', crouch: 'tele', leap: 'leap', cock: 'tele', lash: 'atk', raise: 'tele', toll: 'atk' };
const HEAD: Record<Kind, number> = { purifier: 37, priest: 41, penitent: 38, hound: 0, ringer: 36, inquisitor: 50 }; // the blood drop of the weak, over the feet

export function preload(scene: Scene) {
  for (const [key, url] of [['purifier', purifierSheet], ['priest', priestSheet], ['hound', houndSheet], ['penitent', penitentSheet], ['ringer', ringerSheet], ['inquisitor', inquisitorSheet]]) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, kind: Kind, x: number, y: number): Sprite {
  const S = SHEETS[kind], tex = scene.textures.get(kind);
  if (!tex.has('corpse')) for (const [name, { cell, lamp }] of Object.entries(S.FRAMES))
    Object.assign(tex.add(name, 0, (cell % S.COLS) * S.FW, Math.floor(cell / S.COLS) * S.FH, S.FW, S.FH)!.customData, { lamp });
  const s = (group.create(x, y, kind, 'down-idle0') as Sprite).setOrigin(0.5, (S.SOLE - ORIGIN) / S.FH).setScale(0.5);
  s.setSize(24, 12).setOffset(S.FW / 2 - 12, S.SOLE - 8); // feet, 12x6 room px like the crossbowman's
  if (skin.dark) s.setBlendMode(prelit(scene));
  // The jet of fire is drawn apart from him, turned from its view to his real aim.
  const jet = scene.add.image(0, 0, kind, 'down-idle0').setScale(0.5).setVisible(false).setBlendMode(s.blendMode);
  s.setData({ born: scene.time.now, phase: Math.round(x * 3), walked: 0, at: [x, y], jet, markG: scene.add.graphics().setDepth(7990) });
  return s;
}

/** Where a priest's monstrance or a purificateur's pilot light shines, for the dark rooms' light (dark.ts): its floor
 *  point and height, room px. */
export function lamp(s: Sprite) {
  const [lx, ly] = (s.frame.customData as { lamp: [number, number] }).lamp, S = SHEETS[s.texture.key as Kind];
  return { x: s.x + ((lx - S.FW / 2) / 2) * (s.flipX ? -1 : 1), y: s.y + GROUND, h: (S.SOLE - ly) / 2 };
}

/** Shows the foe in `state`; facing and its locked aim (a floor angle, logic.ts aimAt()), where the light falls and timings
 *  are in its data. `weak`: hurt enough to be bitten. */
export function show(s: Sprite, state: FoeState, flash: boolean, weak: boolean) {
  const now = s.scene.time.now, kind = s.texture.key as Kind;
  if (s.getData('look') !== state) s.setData({ look: state, lookAt: now });
  if (flash && !s.getData('flashOn')) {
    s.setData('hitAt', now);
    bleed(s.scene, s.x, s.y, s.getData('facing') + Math.PI, 5, 0.7, 0.8);
  }
  s.setData('flashOn', flash);
  const t = now - s.getData('lookAt'), hurt = now - (s.getData('hitAt') ?? -1e9), S = SHEETS[kind];
  const aiming = LOCKED.includes(state), aim = s.getData('aim'), o = aiming ? octant(aim) : octant(s.getData('facing'));
  if (FLIP[o] !== undefined) s.setFlipX(FLIP[o]!);
  // His steps follow the floor he covers, so his feet hold it (up the screen the floor is foreshortened).
  const [ax, ay] = s.getData('at'), walked = s.getData('walked') + Math.hypot(s.x - ax, (s.y - ay) / FLOOR);
  s.setData({ at: [s.x, s.y], walked });
  // Quickened by a bell (T.ringer.haste), a man pants, flushed: his breath at twice the pace, a warm throb on him.
  const haste = (s.getData('hasteUntil') ?? 0) > now;
  let f = 'idle' + (Math.floor((now + s.getData('phase')) / (haste ? 125 : 250)) % 4); // breathing, the pilot or the monstrance flickering
  if (state === 'fire') f = 'fire' + (Math.floor(now / 70) % 2);
  else if (state === 'whirl') f = 'whirl' + (Math.floor((t / 110) * (0.6 + (0.8 * t) / T.inquisitor.whirlMs)) % 4); // gathering speed
  else if (state === 'sweep') f = 'sweep' + Math.min(2, Math.floor((t * 3) / T.inquisitor.sweepMs));
  else if (POSE[state]) f = POSE[state]!;
  else if (now - (s.getData('parryAt') ?? -1e9) < 300) f = 'parry';
  else if (state !== 'held' && hurt < 200) f = 'hurt'; // struck: he reels back (the blow's knockback carries him)
  else if (state !== 'held' && s.body!.velocity.lengthSq() > 25) f = 'walk' + (Math.floor((walked / S.STRIDE) * S.WALK) % S.WALK);
  s.setFrame(`${VIEW[o]}-${f}`);
  if (hurt < 120 && flash) s.setTint(STRUCK);
  else if (haste) s.setTint(Phaser.Display.Color.GetColor(255, 236 - 14 * Math.abs(Math.sin(now / 160)), 214 - 26 * Math.abs(Math.sin(now / 160))));
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

  const g = s.getData('markG') as Phaser.GameObjects.Graphics;
  g.clear();
  if (state === 'smite') smite(g, s.getData('zone'), t / T.priest.smiteMs); // the light itself, falling where he stood
  if (s.getData('rings')) rings(g, s.getData('rings'), now);
  const head = HEAD[kind]; // room px over the feet; kneeling, 9 less
  if (weak && state !== 'held') mark(g, s.x + (s.flipX ? -1 : 1), s.y + GROUND - head + (state === 'kneel' ? 9 : 0), now + s.getData('phase'), state === 'kneel' ? 1100 : 700);
}

// The holy light falling where the hero stood, as the sheet's motes: sparks of gold raining down, fading as they land.
function smite(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, k: number) {
  const r = T.priest.radius;
  for (let i = 0; i < 40; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h), w = Math.sqrt((i * 0.618) % 1), z = 70 * (((i * 0.382) % 1) * 0.6 + 1 - k * 1.4);
    if (z < 0) continue;
    const x = at.x + Math.cos(u * 6.283) * w * r * 0.9, y = at.y + Math.sin(u * 6.283) * w * r * 0.9 * SQ - z;
    g.fillStyle(z > 40 ? 0xffe8b0 : 0xfff4d8, Math.min(1, z / 12)).fillRect(Math.round(x), Math.round(y), 1, 2);
  }
}

/** How far ring `i` (0-2) of a bell's strike struck at `at` has rolled out along the floor by `now` (<= 0: not yet out;
 *  past T.ringer.reach: died out). */
export const ringAt = (at: number, now: number, i: number) => (T.ringer.ringSpeed * (now - at - i * T.ringer.ringGapMs)) / 1000;

// The bell's three rings rolling out along the floor from his feet: a wavefront of dust and gold motes, brightest at its
// crest, fading as it spreads.
function rings(g: Phaser.GameObjects.Graphics, at: { x: number; y: number; at: number }, now: number) {
  const R = T.ringer.reach;
  for (let i = 0; i < 3; i++) {
    const r = ringAt(at.at, now, i);
    if (r <= 0 || r > R) continue;
    const fade = (1 - r / R) ** 0.6 * (1 - i * 0.2), n = Math.max(24, Math.round((2 * Math.PI * r) / 1.4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI, h = Math.sin(k * 12.9898 + i * 78.233) * 43758.5453, u = h - Math.floor(h);
      const rr = r + Math.sin(a * 7 + now / 90) * 0.7; // the crest trembles
      const x = Math.round(at.x + Math.cos(a) * rr), y = Math.round(at.y + Math.sin(a) * rr * SQ);
      g.fillStyle(u > 0.75 ? 0xfff4d8 : 0xe8c878, fade * (0.55 + 0.45 * u)).fillRect(x, y, 1, 1);
      if (u > 0.4) g.fillStyle(0x8a6a30, fade * 0.5).fillRect(Math.round(at.x + Math.cos(a) * (rr - 2)), Math.round(at.y + Math.sin(a) * (rr - 2) * SQ), 1, 1); // dust kicked up behind it
    }
  }
}

/** A blow turned aside at floor point (x, y) coming from `angle`: sparks off his gauntlet, flying back the way it came. */
export function parry(scene: Scene, x: number, y: number, angle: number) {
  const g = scene.add.graphics().setDepth(9000), z = 22; // at his chest
  run(scene, 320, (t) => {
    g.clear();
    const k = t / 0.32, e = 1 - (1 - k) ** 2; // flung out fast, then slowing
    for (let i = 0; i < 18; i++) {
      const a = angle + Math.PI + (((i * 0.618) % 1) - 0.5) * 2.4, v = 16 + ((i * 0.382) % 1) * 26, d = v * e;
      const sx = x + Math.cos(a) * d, sy = y - z + Math.sin(a) * d * SQ + 24 * k * k; // they fall as they fly
      g.fillStyle(i % 3 ? 0xffd890 : 0xffffff, 1 - k * k).fillRect(Math.round(sx), Math.round(sy), 1, 1)
        .fillRect(Math.round(sx - Math.cos(a) * 2), Math.round(sy - Math.sin(a) * 2 * SQ), 1, 1); // a streak
    }
    if (k < 0.35) { // the flash of steel on steel: a white star at the contact
      const f = 1 - k / 0.35, r = Math.round(1 + 3 * f);
      g.fillStyle(0xffffff, f).fillRect(Math.round(x) - r, Math.round(y - z), 2 * r + 1, 1).fillRect(Math.round(x), Math.round(y - z) - r, 1, 2 * r + 1).fillRect(Math.round(x) - 1, Math.round(y - z) - 1, 3, 3);
    }
  }, () => g.destroy());
}

export function die(scene: Scene, s: Sprite) {
  for (const k of ['jet', 'markG']) s.getData(k).destroy();
  const key = s.texture.key, view = s.frame.name.split('-')[0], blend = s.blendMode;
  s.setTint(STRUCK);
  scene.time.delayedCall(70, () => {
    const { x, y, flipX, originY } = s, away = (s.getData('facing') ?? 0) + Math.PI;
    s.destroy();
    // They bleed: a red burst, a man sinks to his knees (a hound reels), falls, and a pool spreads under him.
    bleed(scene, x, y, away, 20, 1.2, 1);
    const body = scene.add.image(x, y, key, `${view}-${key === 'hound' ? 'hurt' : 'kneel'}`).setOrigin(0.5, originY).setScale(0.5).setFlipX(flipX).setDepth(y).setBlendMode(blend);
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
