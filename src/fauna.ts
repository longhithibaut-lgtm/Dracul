// The rules of the necropolis' fauna (T.crows, T.enterre, T.gave, T.chose) and of its Order's men (T.crocheteur), apart
// from Phaser so they are tested (fauna.test.ts): crows.ts, enterre.ts, gave.ts, chose.ts and crocheteur.ts play them. Floor distances undo the ground's foreshortening.
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

/** The hero held struggles: `points` so far plus a claw on the hand (blow) or a key pressed anew; free at T.enterre.free
 *  (`R`: another hold's rules, the Crocheteur's net). */
export function struggle(points: number, how: 'blow' | 'key', R: { free: number; blow: number; key: number } = T.enterre) {
  const p = points + R[how];
  return { points: p, free: p >= R.free };
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

type Box = { x: number; y: number; width: number; height: number };
export type Edge = { x: number; y: number; span: number; depth: number }; // a deck's north edge: its middle, half its length, the deck's depth
/** The decks crossing a chasm (a bridge, a causeway): the floor between two strips of pit stacked one over the other
 *  (each at least 48 wide, 16 to 64 apart): their north edge, where La Chose du gouffre grips. */
export function decks(pits: Box[]): Edge[] {
  const wide = pits.filter((p) => p.width >= 48), out: Edge[] = [];
  for (const a of wide) {
    const below = wide.filter((b) => b.y - (a.y + a.height) >= 16 && b.y - (a.y + a.height) <= 64).sort((p, q) => p.y - q.y)[0];
    if (!below || wide.some((c) => c !== a && c.y >= a.y + a.height && c.y < below.y)) continue; // floor between them only
    const x0 = Math.max(a.x, below.x), x1 = Math.min(a.x + a.width, below.x + below.width);
    if (x1 - x0 >= 48) out.push({ x: (x0 + x1) / 2, y: a.y + a.height, span: (x1 - x0) / 2, depth: below.y - (a.y + a.height) });
  }
  return out;
}
/** The deck edge nearest point p. */
export const nearestEdge = (edges: Edge[], p: P) => edges.reduce<Edge | undefined>((m, e) => (!m || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? e : m), undefined);
/** The hero's feet on its deck near enough: it stirs. */
export const stirs = (edge: P, feet: P) => Math.abs(feet.x - edge.x) <= T.chose.span + T.chose.notice && feet.y - edge.y >= -4 && feet.y - edge.y <= T.chose.reach;
/** Its sweeping hand at x along the edge strikes the hero's feet. */
export const swept = (edge: P, handX: number, feet: P) => Math.abs(feet.x - handX) <= T.chose.hand && feet.y - edge.y >= -4 && feet.y - edge.y <= T.chose.reach;
/** Where a hero struck at `feet` lands: flung T.chose.throw away from the edge, slanted along the sweep (+x). */
export function flung(feet: P) {
  const C = T.chose, n = Math.hypot(C.slant, 1);
  return { x: feet.x + (C.throw * C.slant) / n, y: feet.y + C.throw / n };
}
/** Into a pit (the chasm): the fall. */
export const inPit = (pits: Box[], p: P) => pits.some((b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height);

/** The Crocheteur's net `ms` after it left `from` along floor angle `aim`: where it is, flying straight at T.crocheteur.netSpeed
 *  until T.crocheteur.netRange (then it lies there). */
export function netAt(from: P, aim: number, ms: number) {
  const K = T.crocheteur, d = Math.min(K.netRange, (K.netSpeed * ms) / 1000);
  return { x: from.x + Math.cos(aim) * d, y: from.y + Math.sin(aim) * d * T.lantern.squash };
}
/** It catches the hero's feet within T.crocheteur.netRadius of it (floor). */
export const netted = (net: P, feet: P) => floor(net, feet) <= T.crocheteur.netRadius;
/** Where he hauls the hero netted at `hero`: the nearest of `marks` (other foes, lanterns) within T.crocheteur.dragRange of him, else `home`. */
export function haul(hero: P, marks: P[], home: P) {
  let best = home, d: number = T.crocheteur.dragRange;
  for (const m of marks) if (floor(hero, m) <= d) [best, d] = [m, floor(hero, m)];
  return best;
}

/** The nearest body within T.gave.smell of it, if any. */
export function meal<C extends P>(from: P, bodies: C[]) {
  let best: C | undefined, d: number = T.gave.smell;
  for (const c of bodies) if (floor(from, c) <= d) [best, d] = [c, floor(from, c)];
  return best;
}
