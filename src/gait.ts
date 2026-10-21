import type Phaser from 'phaser';
import type { HeroLook } from './hero.ts';

// The grand hero's walk (Hero.show): which of his views faces where, and which walk his legs do — ahead, backing off,
// side-stepping — when he goes one way facing another (just after a blow he keeps facing it). A sheet gives its walks
// as s.getData('gait'): { squash, run: { n, stride }, back, strafer, strafel } (grand.data.ts), stride in room px of
// floor per cycle; each frame is picked by the distance walked, so the planted foot holds the floor.

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
const TURN_MS = 70; // turning round, he shows the view between (toward the camera) this long

type Gait = { squash: number } & Record<string, { n: number; stride: number }>;
type Walk = { x: number; y: number; phase: number; way: number; face: number; moving: boolean; since: number; halt: number; guard: number; guardUntil: number; turnUntil: number; via: number };
const walks = new WeakMap<Phaser.GameObjects.Sprite, Walk>();

/** Hero.show's view for its action poses (where he faces), and `walk`, the walk frame when no action pose shows: on a
 *  sheet with walks only, undefined standing (but the settling step). */
export function pick(s: Phaser.GameObjects.Sprite, look: HeroLook, now: number) {
  const diag = s.texture.has('downside-idle0'), at = viewOf(look.facing, diag), gait = s.getData('gait') as Gait | undefined;
  if (!gait) return { ...at, walk: undefined };
  let w = walks.get(s);
  if (!w) walks.set(s, (w = { x: s.x, y: s.y, phase: 0, way: look.facing, face: look.facing, moving: false, since: 0, halt: 0, guard: 0, guardUntil: 0, turnUntil: 0, via: 0 }));
  const dx = s.x - w.x, dy = s.y - w.y, d = Math.hypot(dx, dy);
  w.x = s.x;
  w.y = s.y;
  if (look.slashing || look.throwing || look.casting) { w.guard = look.facing; w.guardUntil = now + GUARD_MS; }
  if (look.dashing || look.biting) w.guardUntil = 0;
  if (!look.moving) {
    if (w.moving && now - w.since >= START_MS) w.halt = now + HALT_MS;
    w.moving = false;
    return { ...at, walk: now < w.halt ? { ...viewOf(w.face, diag), frame: 'halt0' } : undefined };
  }
  const face = now < w.guardUntil ? w.guard : look.facing, turn = wrap(face - w.face);
  if (!w.moving) Object.assign(w, { moving: true, since: now, phase: 0, halt: 0 }); // the first step at once, from the passing pose
  else if (Math.abs(turn) > 1.8) { // turning round: through the view between, the one more toward the camera
    const m = w.face + turn / 2;
    w.via = Math.sin(m) >= Math.sin(m + Math.PI) ? m : m + Math.PI;
    w.turnUntil = now + TURN_MS;
  }
  w.face = face;
  if (d > 0.01) w.way = Math.atan2(dy, dx);
  const turning = now < w.turnUntil, v = viewOf(turning ? w.via : face, diag), cycle = turning ? 'run' : walkOf(face, w.way, v.flip), c = gait[cycle];
  if (d < 20) w.phase += d / strideOn(c.stride, w.way, gait.squash); // more is a teleport, not a step
  return { ...at, walk: { ...v, frame: `${cycle}${Math.floor(w.phase * c.n) % c.n}` } };
}
