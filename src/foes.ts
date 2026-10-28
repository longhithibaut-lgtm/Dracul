import Phaser from 'phaser';
import { T } from './tuning.ts';
import { ZOOM, prelit } from './dark.ts';
import { BLOOD, bleed, pool, run, stains } from './enemy.ts';
import { mark } from './crossbow.ts';
import { SHEETS, FLOOR } from './foes.data.ts';
import purifierSheet from './purifier.png';
import priestSheet from './priest.png';
import houndSheet from './hound.png';
import penitentSheet from './penitent.png';
import ringerSheet from './ringer.png';
import inquisitorSheet from './inquisitor.png';
import amasSheet from './amas.png';
import bourreauSheet from './bourreau.png';
import crossbowSheet from './crossbow.png';
import crowSheet from './crow.png';
import enterreSheet from './enterre.png';
import gaveSheet from './gave.png';
import choseSheet from './chose.png';
import crocheteurSheet from './crocheteur.png';

// How the Order's Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur (docs/maquettes/ennemis-planche-1.png),
// Inquisiteur and Bourreau, and the ghouls' Amas (ennemis-planche-2.png) look: the validated sheet's own models rendered offline, already lit, in five views (tools/art/foes.gen.mjs), drawn at half
// scale like the grand hero (hero.ts), so each of their pixels is a screen pixel of the x2 rooms. Gameplay owns the
// AI state (RoomScene); this file shows it. No mark on the floor announces an attack (docs/decisions.md): only their
// bodies do (the pilot lit, the monstrance raised, the hound flattened, the scourge cocked, the bell's rim lit, the censer
// whirled, the Amas gathered up with its arms raised, the axe raised), then the attack itself (the jet, the falling
// light, the lash, the bell's rings rolling out, the sweep, the Amas' slam spreading over the floor, the crack).
// The necropolis' Enterré and Gavé (necropole-ennemis-planche-1.png), la Chose du gouffre and the Crocheteur (-2, -3)
// too; their AI is enterre.ts's, gave.ts's, chose.ts's (which also shows it) and crocheteur.ts's.
export type Kind = Exclude<Sheeted, 'crossbow' | 'crow'>; // the crossbowman's sheet is shown here too, but he is crossbow.ts's; a crow is a flock's (crows.ts)
type Sheeted = keyof typeof SHEETS;
export type FoeState = 'chase' | 'aim' | 'shoot' | 'ignite' | 'fire' | 'recover' | 'pray' | 'smite' | 'crouch' | 'leap' | 'cock' | 'lash' | 'raise' | 'toll' | 'whirl' | 'sweep' | 'contract' | 'slam' | 'sprawl' | 'heave' | 'chop' | 'wrench' | 'rip' | 'swing' | 'held' | 'kneel'
  | 'buried' | 'crack' | 'grab' | 'sink' | 'eat' | 'rear' | 'flop' | 'gorge' | 'spew'
  | 'grip' | 'clench' | 'swipe' | 'rest' | 'recoil' | 'under' | 'rise' | 'spin' | 'toss' | 'hook' | 'drag';
/** What a foe's own AI module (enterre.ts, gave.ts, crows.ts, chose.ts, crocheteur.ts) may ask of the room it is in (RoomScene). */
export type Ctx = {
  scene: Scene; hero: Sprite; enemies: Phaser.Physics.Arcade.Group;
  lit(): boolean; // the hero stands in light: seen from farther
  dodging(): boolean; // misting, or a swarm of rats: nothing takes hold of him
  damageHero(amount: number, from?: Phaser.Types.Math.Vector2Like): boolean;
  hunts(e: Sprite): boolean; // it has seen him and hunts him (T.sight)
  idle(e: Sprite): void; // at its post, or walking back to it
  way(e: Sprite): { angle: number; straight: boolean }; // toward him, round the pits
  keepAt(e: Sprite, toHero: number, dist: number, near: number, far: number, speed: number): void;
  hold(by?: Sprite, pull?: { x: number; y: number; speed: number }): void; // the hero held by `by`, dragged toward it (or `pull`) (none: let go)
  heldBy(): Sprite | undefined;
  bodies: { x: number; y: number; eat(): void }[]; // the dead on the floor, where they lie
  pits: { x: number; y: number; width: number; height: number }[]; // the holes in the floor (the chasm)
  fling(dx: number, dy: number, into: boolean): void; // the hero thrown that far, `into` the chasm: the fall
  netted(): boolean; // under a Crocheteur's net
  net(): void; // a net falls over him
  marks(e: Sprite): { x: number; y: number }[]; // where a Crocheteur hauls him: the other foes, the lanterns
};
type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;

export const isFoe = (kind: unknown): kind is Kind => typeof kind === 'string' && kind in SHEETS && kind !== 'crossbow' && kind !== 'crow';
/** The eighth of a turn an angle points to: 0 right, 2 down, 4 left, 6 up. */
export const octant = (a: number) => (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
export const DIRS = 64; // aims (logic.ts aimAt()) snap to this many directions
// The sheet's view for each octant, and whether it is mirrored (down and up keep the last way they faced).
const VIEW = ['side', 'dside', 'down', 'dside', 'side', 'uside', 'up', 'uside'];
const FLIP = [false, false, undefined, true, true, true, undefined, false];
/** The sheet's view for a heading (a floor angle), and whether it is mirrored (undefined: as it was). */
export const viewOf = (a: number) => [VIEW[octant(a)], FLIP[octant(a)]] as const;
const ORIGIN = 20; // sheet px from the soles up to the sprite's y: its feet 10 room px below it, like the crossbowman's
const GROUND = ORIGIN / 2;
const SQ = T.lantern.squash; // the floor seen at an angle
const STRUCK = 0xff4a3a; // the hit flash: dyed with blood, never white (fx-blood.ts)
// The states that face the aim locked at their start, and the pose each one holds.
const LOCKED: FoeState[] = ['aim', 'shoot', 'ignite', 'fire', 'crouch', 'leap', 'cock', 'lash', 'whirl', 'sweep', 'heave', 'chop', 'wrench', 'rip', 'swing', 'rear', 'flop', 'gorge', 'spew', 'spin', 'toss', 'hook'];
// (sprawl: the Gavé's after its slam too; sink: l'Enterré going back under)
const POSE: Partial<Record<FoeState, string>> = { kneel: 'kneel', shoot: 'shot', ignite: 'ignite', pray: 'pray', smite: 'pray', crouch: 'tele', leap: 'leap', cock: 'tele', lash: 'atk', raise: 'tele', toll: 'atk', slam: 'atk', sprawl: 'atk', heave: 'tele', chop: 'atk', swing: 'tele', sink: 'sink', rear: 'tele', flop: 'atk', gorge: 'gorge', toss: 'toss', hook: 'hook' }; // swing: the axe torn up
const HEAD: Record<Sheeted, number> = { crossbow: 40, purifier: 37, priest: 41, penitent: 38, hound: 0, ringer: 36, inquisitor: 50, amas: 0, bourreau: 62, crow: 0, enterre: 0, gave: 0, chose: 0, crocheteur: 44 };
// Their feet on the floor, sheet px (half as many room px): a man's like the crossbowman's, the big ones' broader.
const FEET: Partial<Record<Sheeted, [number, number]>> = { amas: [52, 22], bourreau: [36, 16], enterre: [44, 22], gave: [44, 20], chose: [180, 40] }; // the blood drop of the weak, over the feet; the Enterré's: his mound; the Chose's: its hands along the edge

export function preload(scene: Scene) {
  for (const [key, url] of [['purifier', purifierSheet], ['priest', priestSheet], ['hound', houndSheet], ['penitent', penitentSheet], ['ringer', ringerSheet], ['inquisitor', inquisitorSheet], ['amas', amasSheet], ['bourreau', bourreauSheet], ['crossbow', crossbowSheet], ['crow', crowSheet], ['enterre', enterreSheet], ['gave', gaveSheet], ['chose', choseSheet], ['crocheteur', crocheteurSheet]]) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, kind: Sheeted, x: number, y: number): Sprite {
  const S = SHEETS[kind], tex = scene.textures.get(kind);
  if (!tex.has('corpse')) for (const [name, { cell, lamp }] of Object.entries(S.FRAMES))
    Object.assign(tex.add(name, 0, (cell % S.COLS) * S.FW, Math.floor(cell / S.COLS) * S.FH, S.FW, S.FH)!.customData, { lamp });
  const s = (group.create(x, y, kind, 'down-idle0') as Sprite).setOrigin(0.5, (S.SOLE - ORIGIN) / S.FH).setScale(0.5);
  const [w, h] = FEET[kind] ?? [24, 12];
  s.setSize(w, h).setOffset(S.FW / 2 - w / 2, S.SOLE - 2 - h / 2);
  s.setBlendMode(prelit(scene));
  // The jet of fire is drawn apart from him, turned from its view to his real aim.
  const jet = scene.add.image(0, 0, kind, 'down-idle0').setScale(0.5).setVisible(false).setBlendMode(s.blendMode);
  s.setData({ born: scene.time.now, phase: Math.round(x * 3), walked: 0, at: [x, y], jet, markG: scene.add.graphics().setDepth(7990) });
  return s;
}

/** Where a priest's monstrance or a purificateur's pilot light shines, for the dark rooms' light (dark.ts): its floor
 *  point and height, room px. */
export function lamp(s: Sprite) {
  const [lx, ly] = (s.frame.customData as { lamp: [number, number] }).lamp, S = SHEETS[s.texture.key as Sheeted];
  return { x: s.x + ((lx - S.FW / 2) / 2) * (s.flipX ? -1 : 1), y: s.y + GROUND, h: (S.SOLE - ly) / 2 };
}

/** Shows the foe in `state`; facing and its locked aim (a floor angle, logic.ts aimAt()), where the light falls and timings
 *  are in its data. `weak`: hurt enough to be bitten. */
export function show(s: Sprite, state: FoeState, flash: boolean, weak: boolean) {
  const now = s.scene.time.now, kind = s.texture.key as Sheeted;
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
  else if (state === 'aim') f = t < 100 ? 'raise' : t >= T.crossbow.aimMs - T.crossbow.lockMs ? 'lock' : 'aim'; // raised, sighting, the bolt's glint once locked
  else if (state === 'whirl') f = 'whirl' + (Math.floor((t / 110) * (0.6 + (0.8 * t) / T.inquisitor.whirlMs)) % 4); // gathering speed
  else if (state === 'sweep') f = 'sweep' + Math.min(2, Math.floor((t * 3) / T.inquisitor.sweepMs));
  else if (state === 'contract') f = t < T.amas.contractMs * 0.45 ? 'tele0' : 'tele1'; // gathering itself, arms rising
  else if (state === 'crack') f = t < T.enterre.crackMs * 0.45 ? 'tele0' : 'tele1'; // the mound splits, a hand claws up, then the brow
  else if (state === 'grab') f = 'grab' + (Math.floor(t / 320) % 2); // dragging him by the ankle
  else if (state === 'eat') f = 'eat' + (Math.floor(t / 420) % 2); // its head down in the body, then up tearing
  else if (state === 'spew') f = 'spew' + (Math.floor(t / 90) % 2);
  else if (state === 'spin') f = 'spin' + (Math.floor((t / 140) * (0.5 + (1.6 * t) / T.crocheteur.netTeleMs)) % 4); // the net whirling faster and faster
  else if (state === 'drag') f = 'drag' + (Math.floor(t / 300) % 2); // hauling, hand over hand
  else if (state === 'wrench' || state === 'rip') f = 'pull' + (Math.floor(t / (state === 'rip' ? 90 : 230)) % 2); // tugging the stuck axe; at the hero, hard
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
      .setScale(0.5 * Phaser.Math.Easing.Back.Out(Phaser.Math.Clamp((now - s.getData('fireUntil') + T.purifier.fireMs) / T.purifier.burstMs, 0, 1), 3), 0.5) // bursts out of the lance
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

/** How far over the floor an Amas' slam struck at `at` has spread by `now`: from under its body out to T.amas.reach. */
export const slamAt = (at: number, now: number, reach: number = T.amas.reach) =>
  Phaser.Math.Linear(12, reach, Phaser.Math.Easing.Quadratic.Out(Phaser.Math.Clamp((now - at) / T.amas.slamMs, 0, 1)));

/** An Amas slams down round its feet (x, y): a wave of dust and blood spreads over the floor to its reach (slamAt), the
 *  floor shakes, blood is flung all round and stains it. Drawn unlit, like the bell's rings: the blow shows in the dark. */
export function slam(scene: Scene, x: number, y: number, reach: number = T.amas.reach) { // (La Nourrice's slams: her own reach)
  const g = scene.add.graphics().setDepth(7990), at = scene.time.now;
  scene.cameras.main.shake(180, new Phaser.Math.Vector2(3 / scene.cameras.main.width, 3 / scene.cameras.main.height));
  for (let i = 0; i < 6; i++) bleed(scene, x, y - GROUND, (i * Math.PI) / 3, 8, Math.PI / 6, 1.4, 4);
  run(scene, 700, () => {
    const now = scene.time.now, r = slamAt(at, now, reach), fade = 1 - Phaser.Math.Clamp((now - at - T.amas.slamMs) / 480, 0, 1);
    g.clear();
    for (let k = 0, n = Math.round((2 * Math.PI * r) / 0.8); k < n; k++) {
      const a = (k / n) * 2 * Math.PI, h = Math.sin(k * 12.9898 + 4.1) * 43758.5453, u = h - Math.floor(h), rr = r - u * 7; // a ragged crest
      const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr * SQ), up = Math.round(u * u * 6 * fade); // dust thrown up off it
      g.fillStyle(u > 0.88 ? BLOOD.light : u > 0.45 ? 0xb0a288 : 0x6e6252, fade * (0.55 + 0.45 * u)).fillRect(px, py - up, 1, 1);
      if (u > 0.6) g.fillStyle(0x8a7c66, 0.35 * fade).fillRect(px - 1, py - up - 1, 2, 1); // its haze
    }
  }, () => g.destroy());
}

/** The Bourreau's blow splits the floor from his blade at (x, y) along floor angle `aim`, `len` room px of floor: a
 *  jagged crack runs out in T.bourreau.crackMs, chips and dust bursting up where it passes. The fresh split is drawn unlit
 *  (it shows in the dark) and fades into the scar it leaves in the floor. */
export function crack(scene: Scene, x: number, y: number, aim: number, len: number) {
  const ux = Math.cos(aim), uy = Math.sin(aim) * SQ, nx = -Math.sin(aim), ny = Math.cos(aim) * SQ, rnd = new Phaser.Math.RandomDataGenerator([`${x}${y}`]);
  const segs: [number, number, number, number, number][] = []; // x0, y0, x1, y1, width
  let px = x, py = y;
  for (let d = 2, off = 0; d <= len; d += 2) { // wandering a little either side of the line, wide at the blade, thinning out
    off = Phaser.Math.Clamp(off + rnd.realInRange(-1.4, 1.4), -3, 3);
    const qx = x + ux * d + nx * off, qy = y + uy * d + ny * off;
    segs.push([px, py, qx, qy, d < len / 3 ? 1.5 : d < (2 * len) / 3 ? 1 : 0.5]);
    if (d > 6 && rnd.frac() < 0.12) {
      const a = aim + rnd.pick([-1, 1]) * rnd.realInRange(0.5, 1.1), l = rnd.realInRange(4, 12);
      segs.push([qx, qy, qx + Math.cos(a) * l, qy + Math.sin(a) * l * SQ, 0.5]);
    }
    [px, py] = [qx, qy];
  }
  const rt = stains(scene), g = scene.add.graphics().setDepth(7990), at = scene.time.now, ms = T.bourreau.crackMs;
  scene.cameras.main.shake(160, new Phaser.Math.Vector2(Math.abs(ux) * 3 / scene.cameras.main.width, (1 + Math.abs(uy) * 3) / scene.cameras.main.height));
  // A split line at the x2 rooms' finer pixels: black depth, its lips catching the light.
  const split = (s: number[], fill: (c: number, a: number, x: number, y: number, w: number, h: number) => void, a: number) => {
    const [x0, y0, x1, y1, w] = s;
    for (let k = 0, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); k <= n; k++) {
      const sx = Math.round((x0 + ((x1 - x0) * k) / n) * 2) / 2, sy = Math.round((y0 + ((y1 - y0) * k) / n) * 2) / 2;
      fill(0x080605, 0.95 * a, sx - (w - 0.5) / 2, sy - (w - 0.5) / 2, w, w);
      fill(0xb4a68c, 0.7 * a, sx, sy + w / 2, 0.5, 0.5);
      if (w > 0.5) fill(0x8a7c68, 0.6 * a, sx, sy - w / 2, 0.5, 0.5);
    }
  };
  let drawn = 0;
  run(scene, ms + 900, () => {
    const t = scene.time.now - at, upto = Math.min(segs.length, Math.ceil((t / ms) * segs.length)), fade = 1 - Phaser.Math.Clamp((t - ms) / 900, 0, 1);
    for (; drawn < upto; drawn++) split(segs[drawn], (c, a, x, y, w, h) => rt.fill(c, a, x, y, w, h), 1); // the scar it leaves
    rt.render();
    g.clear();
    for (let i = 0; i < upto; i++) split(segs[i], (c, a, x, y, w, h) => g.fillStyle(c, a).fillRect(x, y, w, h), fade);
    // Where it has passed: chips of stone leap up and fall back, dust hangs a moment.
    for (let i = 0; i < upto; i += 2) {
      const age = (t - (i / segs.length) * ms) / 1000, [sx, sy] = segs[i];
      if (age < 0 || age > 0.7) continue;
      for (let c = 0; c < 2; c++) {
        const h = Math.sin(i * 12.9898 + c * 78.233) * 43758.5453, u = h - Math.floor(h), z = (40 + 50 * u) * age - 160 * age * age;
        if (z > 0) g.fillStyle(u > 0.5 ? 0xb4a68c : 0x6a5e50, 1).fillRect(Math.round(sx + (u - 0.5) * 56 * age), Math.round(sy - z), 1, 1);
      }
      g.fillStyle(0x9a8c76, 0.45 * (1 - age / 0.7)).fillRect(Math.round(sx - 2), Math.round(sy - 2 - age * 10), 4, 2);
    }
  }, () => g.destroy());
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
  const key = s.texture.key, view = s.frame.name.split('-')[0], blend = s.blendMode, size = s.scaleY; // a Gavé grown by its meals
  s.setTint(STRUCK);
  scene.time.delayedCall(70, () => {
    const { x, y, flipX, originY } = s, away = (s.getData('facing') ?? 0) + Math.PI;
    s.destroy();
    // They bleed: a red burst, a man sinks to his knees (a hound reels), falls, and a pool spreads under him.
    bleed(scene, x, y, away, key === 'amas' ? 40 : 20, 1.2, 1);
    const body = scene.add.image(x, y, key, `${view}-${['hound', 'amas', 'enterre'].includes(key) ? 'hurt' : 'kneel'}`).setOrigin(0.5, originY).setScale(size).setFlipX(flipX).setDepth(y).setBlendMode(blend);
    scene.time.delayedCall(220, () => {
      body.setFrame('corpse').setDepth(1.5); // on the floor, over its blood, under everyone
      run(scene, 600, (t) => {
        const k = Phaser.Math.Easing.Quadratic.Out(t / 0.6), rt = stains(scene);
        pool(x, y + GROUND - 6, 4 + 24 * k, 2 + 8 * k, (c, px, py, w) => rt.fill(c, 1, px, py, w, 1), BLOOD.mid, BLOOD.dark);
        rt.render();
      }, () => { // settled: into the floor's layer of the dead, which keeps them for the fight (or a Gavé eats it: erased)
        const lay = (blendMode?: number) => corpses(scene).stamp(key, 'corpse', x * ZOOM, y * ZOOM, { originY, scaleX: (flipX ? -size : size) * ZOOM, scaleY: size * ZOOM, blendMode }).render();
        lay();
        scene.events.emit('corpse', { x, y: y + GROUND, eat: () => lay(Phaser.BlendModes.ERASE) });
        body.destroy();
      });
    });
  });
}

// The dead of the Order: one layer over the room's floor blood (enemy.ts stains), at its resolution, drawn already lit
// like them (the blood layer is lit by the dark rooms, they are not).
function corpses(scene: Scene) {
  const b = scene.physics.world.bounds, Z = ZOOM;
  return (scene.children.getByName('foe-corpses') as Phaser.GameObjects.RenderTexture | null)
    ?? scene.add.renderTexture(0, 0, (b.right + 40) * Z, (b.bottom + 16) * Z).setOrigin(0).setScale(1 / Z).setDepth(1.5).setName('foe-corpses')
      .setBlendMode(prelit(scene)).setTint(0xa0a0a0); // the dead give back less light
}
