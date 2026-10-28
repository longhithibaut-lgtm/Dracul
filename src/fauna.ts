// The rules of the necropolis' fauna (T.crows, T.enterre, T.gave), apart from Phaser so they are tested
// (fauna.test.ts): crows.ts, enterre.ts and gave.ts play them. Floor distances undo the ground's foreshortening.
import { T } from './tuning.ts';

type P = { x: number; y: number };
/** Distance along the floor from a to b (the screen's y is the floor's squashed). */
export const floor = (a: P, b: P) => Math.hypot(b.x - a.x, (b.y - a.y) / T.lantern.squash);

/** A flock on its dead takes fright: the hero within its sight (nearer out of the light), or a din (a fight) near it. */
export const startles = (flock: P, hero: P, lit: boolean, din?: P) =>
  floor(flock, hero) <= (lit ? T.crows.notice : T.crows.shade) || (!!din && floor(flock, din) <= T.crows.noise);

/** The foes a flock's cawing calls to where it rose: those within T.crows.alarm not already hunting. */
export const alarmed = <F extends P & { hunting: boolean }>(flock: P, foes: F[]) =>
  foes.filter((f) => !f.hunting && floor(flock, f) <= T.crows.alarm);

/** A crow stooping on the spot locked at its tell strikes the hero still within T.crows.peckRadius of it. */
export const pecked = (spot: P, hero: P) => floor(spot, hero) <= T.crows.peckRadius;

/** L'Enterré wakes with the hero's feet this close to his mound, and catches him at the end of his tell only within reach. */
export const wakes = (mound: P, feet: P) => floor(mound, feet) <= T.enterre.trigger;
export const caught = (mound: P, feet: P) => floor(mound, feet) <= T.enterre.reach;

/** The hero held struggles: `points` so far plus a claw on the hand (blow) or a key pressed anew; free at T.enterre.free. */
export function struggle(points: number, how: 'blow' | 'key') {
  const p = points + T.enterre[how];
  return { points: p, free: p >= T.enterre.free };
}

/** Le Gavé after eating a body: bigger, more blood and healed, up to T.gave.max bodies (none more once there). */
export function feed(g: { fed: number; hp: number; max: number }) {
  if (g.fed >= T.gave.max) return g;
  const max = g.max + T.gave.grow.hp;
  return { fed: g.fed + 1, max, hp: Math.min(max, g.hp + T.gave.grow.heal) };
}
/** Its size and the weight of its blows after `fed` bodies. */
export const bulk = (fed: number) => 1 + fed * T.gave.grow.scale;
export const blow = (damage: number, fed: number) => damage + Math.floor(fed * T.gave.grow.damage);

/** The nearest body within T.gave.smell of it, if any. */
export function meal<C extends P>(from: P, bodies: C[]) {
  let best: C | undefined, d: number = T.gave.smell;
  for (const c of bodies) if (floor(from, c) <= d) [best, d] = [c, floor(from, c)];
  return best;
}
