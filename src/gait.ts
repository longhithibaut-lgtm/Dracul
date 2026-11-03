import type Phaser from 'phaser';
import type { HeroLook } from './hero.ts';

// The grand hero's walk (Hero.show): which of his views faces where, and which walk his legs do — ahead, backing off,
// side-stepping — when he goes one way facing another (just after a blow he keeps facing it). A sheet gives its walks
// as s.getData('gait'): { squash, run: { n, stride }, trudge, back, strafer, strafel } (grand.data.ts), stride in room
// px of floor per cycle; each frame is picked by the distance walked, so the planted foot holds the floor. Setting off he
// leans into it (go-0), turning round he pivots (pivot-0/1, the coat swinging out), bowed under a full bag he trudges.

const OCTANTS = ['side', 'downside', 'down', 'downside', 'side', 'upside', 'up', 'upside']; // from the right, clockwise (y down)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The view for a facing (radians, on screen): eight ways, the left ones mirrored from the right; a sheet without the
 *  diagonals (three views) shows them side-on. */
export function viewOf(facing: number, diagonals: boolean): { view: string; flip: boolean } {
  const o = ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;
  return { view: diagonals ? OCTANTS[o] : OCTANTS[o].replace(/^(down|up)side$/, 'side'), flip: o >= 3 && o <= 5 };
}

/** The walk going `way` while facing `facing`: ahead within 67.5 degrees of it, backing off beyond 112.5, else
 *  side-stepping to his right (strafer) or his left; a mirrored view swaps his sides. */
export function walkOf(facing: number, way: number, flip: boolean): string {
  const r = wrap(way - facing);
  if (Math.abs(r) <= (3 * Math.PI) / 8) return 'run';
  if (Math.abs(r) >= (5 * Math.PI) / 8) return 'back';
  return r > 0 !== flip ? 'strafer' : 'strafel'; // y down: +90 degrees from his facing is his right
}

/** Screen px walked per cycle going `way`: the floor's stride, foreshortened by `squash` up and down the screen. */
export function strideOn(stride: number, way: number, squash: number): number {
  return stride / Math.hypot(Math.cos(way), Math.sin(way) / squash);
}

const GUARD_MS = 450; // after a blow, a throw or a cast he keeps facing it this long as he walks
const HALT_MS = 110; // the settling step when he stops after walking at least START_MS
const START_MS = 150;
const TURN_MS = 90; // turning round, he pivots in the view between (toward the camera) this long
const GO_MS = 90; // setting off, he leans into his first step this long
export const HUNCH = 0.6; // the bag this full (its share, logic.ts burden) bows him: the trudge instead of the stalk

type Gait = { squash: number } & Record<string, { n: number; stride: number }>;
type Walk = { x: number; y: number; phase: number; way: number; face: number; moving: boolean; since: number; halt: number; guard: number; guardUntil: number; turnUntil: number; via: number; spin: number };
const walks = new WeakMap<Phaser.GameObjects.Sprite, Walk>();

/** Hero.show's view for its action poses (where he faces), and `walk`, the walk frame when no action pose shows: on a
 *  sheet with walks only, undefined standing (but the settling step); `footfall`, a foot planted this frame. */
export function pick(s: Phaser.GameObjects.Sprite, look: HeroLook, now: number) {
  const diag = s.texture.has('downside-idle0'), at = viewOf(look.facing, diag), gait = s.getData('gait') as Gait | undefined;
  if (!gait) return { ...at, footfall: false, walk: undefined };
  let w = walks.get(s);
  if (!w) walks.set(s, (w = { x: s.x, y: s.y, phase: 0, way: look.facing, face: look.facing, moving: false, since: 0, halt: 0, guard: 0, guardUntil: 0, turnUntil: 0, via: 0, spin: 0 }));
  const dx = s.x - w.x, dy = s.y - w.y, d = Math.hypot(dx, dy);
  w.x = s.x;
  w.y = s.y;
  if (look.slashing || look.throwing || look.casting) { w.guard = look.facing; w.guardUntil = now + GUARD_MS; }
  if (look.dashing || look.biting) w.guardUntil = 0;
  if (!look.moving) {
    if (w.moving && now - w.since >= START_MS) w.halt = now + HALT_MS;
    w.moving = false;
    return { ...at, footfall: false, walk: now < w.halt ? { ...viewOf(w.face, diag), frame: 'halt0' } : undefined };
  }
  const face = now < w.guardUntil ? w.guard : look.facing, turn = wrap(face - w.face);
  if (!w.moving) Object.assign(w, { moving: true, since: now, phase: 0, halt: 0 }); // the first step at once, from the passing pose
  else if (Math.abs(turn) > 1.8) { // turning round: through the view between, the one more toward the camera
    const m = w.face + turn / 2;
    w.via = Math.sin(m) >= Math.sin(m + Math.PI) ? m : m + Math.PI;
    w.turnUntil = now + TURN_MS;
    w.spin = turn;
  }
  w.face = face;
  if (d > 0.01) w.way = Math.atan2(dy, dx);
  const turning = now < w.turnUntil, v = viewOf(turning ? w.via : face, diag), walk = walkOf(face, w.way, v.flip);
  const cycle = walk === 'run' && gait.trudge && (look.burden ?? 0) >= HUNCH ? 'trudge' : walk, c = gait[cycle], was = w.phase;
  if (d < 20) w.phase += d / strideOn(c.stride, w.way, gait.squash); // more is a teleport, not a step
  // A foot lands at a quarter and three quarters of the cycle (the right, then the left).
  const footfall = Math.floor(w.phase * 2 + 0.5) !== Math.floor(was * 2 + 0.5);
  // Turning round he pivots (toward his left: 0, his right: 1; y down, a mirrored view swaps them); setting off, he leans in.
  const frame = turning ? `pivot-${Number(w.spin > 0 !== v.flip)}` : now - w.since < GO_MS && (cycle === 'run' || cycle === 'trudge') ? 'go-0' : `${cycle}${Math.floor(w.phase * c.n) % c.n}`;
  return { ...at, footfall, walk: { ...v, frame } };
}

/** The step of a timed action `ms` in: the last of `at` (ms from its start) reached. */
export const stepOf = (at: number[], ms: number) => Math.max(0, at.findLastIndex((t) => ms >= t));

/** The hurt a blow plays: `from`, the way it travels (radians, on screen; undefined: taken as from the front). Going
 *  the way he faces it struck his back (hurtb), head-on his front (hurt), else his left or right side (hurtl, hurtr);
 *  a mirrored view swaps his sides. */
export function hurtOf(facing: number, from: number | undefined, flip: boolean): string {
  if (from === undefined) return 'hurt';
  const r = wrap(from - facing);
  if (Math.abs(r) <= Math.PI / 4) return 'hurtb';
  if (Math.abs(r) >= (3 * Math.PI) / 4) return 'hurt';
  return r > 0 !== flip ? 'hurtl' : 'hurtr'; // y down: travelling to his right, it came from his left
}

const IDLE_AFTER = 2500, IDLE_EVERY = 6000, IDLE_MS = 1400;
/** Standing still `ms`, once in a while a gesture (in turn: a glance aside, the lantern raised, a deep breath): its
 *  frame, in and out through its first pose; else undefined (the plain idle). */
export function idleVariant(ms: number): string | undefined {
  const t = ms - IDLE_AFTER, u = t % IDLE_EVERY, what = ['glance', 'lift', 'breath'][Math.floor(t / IDLE_EVERY) % 3];
  if (t < 0 || u >= IDLE_MS) return undefined;
  if (what === 'breath') return u >= 300 && u < IDLE_MS - 300 ? 'breath-0' : undefined;
  return `${what}-${u < 160 || u >= IDLE_MS - 160 ? 0 : 1}`;
}
