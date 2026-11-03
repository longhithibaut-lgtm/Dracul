// The rules of the necropolis' fauna (T.crows, T.enterre, T.gave, T.chose) and of its Order's men (T.crocheteur,
// T.tireur, T.miroitier), apart from Phaser so they are tested (fauna.test.ts): crows.ts, enterre.ts, gave.ts, chose.ts,
// crocheteur.ts, tireur.ts and miroitier.ts play them. Floor distances undo the ground's foreshortening.
import { T } from './tuning.ts';
import { rayDistance } from './logic.ts';

type P = { x: number; y: number };
/** Distance along the floor from a to b (the screen's y is the floor's squashed). */
export const floor = (a: P, b: P) => Math.hypot(b.x - a.x, (b.y - a.y) / T.lantern.squash);

/** A flock on its dead takes fright: the hero within its sight (nearer out of the light; `loud` times farther for the
 *  blood he drips), or a din (a fight) near it. */
export const startles = (flock: P, hero: P, lit: boolean, din?: P, loud = 1) =>
  floor(flock, hero) <= (lit ? T.crows.notice : T.crows.shade) * loud || (!!din && floor(flock, din) <= T.crows.noise);

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

/** Le Tireur du mausolée's post: the floor point of his feet at the roof's edge (his sprite's point; his body, 6 to 12 px
 *  below it, half out of the building's box so shards reach it), the roof's height `h` (room px) and the floor point at
 *  the foot of its ladder. */
export type Perch = { x: number; y: number; h: number; ladder: P };
/** The screen length of `floorLen` floor px along screen angle `a` (the floor's y is squashed). */
export const screenLen = (floorLen: number, a: number) => floorLen / Math.hypot(Math.cos(a), Math.sin(a) / T.lantern.squash);
/** His ball, fired from `from` along screen angle `aim`, flying `reach` screen px before a prop or wall stops it: it
 *  strikes the hero's feet within T.tireur.width (floor) of its line. */
export function shotHits(from: P, aim: number, reach: number, feet: P) {
  const ux = Math.cos(aim), uy = Math.sin(aim), along = (feet.x - from.x) * ux + (feet.y - from.y) * uy;
  return along >= 0 && along <= reach && floor({ x: from.x + ux * along, y: from.y + uy * along }, feet) <= T.tireur.width;
}
/** The perch he makes for, off his roof: the one whose ladder is farthest from the hero. */
export const perchFor = (perches: Perch[], hero: P) => perches.reduce((m, p) => (floor(p.ladder, hero) > floor(m.ladder, hero) ? p : m));
/** Perched, he leaves his roof (by its ladder, whatever waits at its foot): the hero within T.tireur.flee of him or of
 *  the ladder's foot. */
export const leaves = (perch: Perch, hero: P) => floor(perch, hero) <= T.tireur.flee || floor(perch.ladder, hero) <= T.tireur.flee;

/** Le Miroitier's beam from `from` along floor angle `aim`, out to `reach` (floor): the hero's feet in it, within
 *  T.miroitier.halfDeg of its line (at least T.miroitier.width px). Props are the caller's (a clear line). */
export function inBeam(from: P, aim: number, reach: number, feet: P) {
  const M = T.miroitier, dx = feet.x - from.x, dy = (feet.y - from.y) / T.lantern.squash;
  const along = dx * Math.cos(aim) + dy * Math.sin(aim), side = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
  return along > 0 && along <= reach && side <= Math.max(M.width, along * Math.tan((M.halfDeg * Math.PI) / 180));
}
/** The beam turned from floor angle `aim` toward `to`, by `ms` at T.miroitier.sweep rad/s at most. */
export function sweepTo(aim: number, to: number, ms: number) {
  const d = Math.atan2(Math.sin(to - aim), Math.cos(to - aim)), max = (T.miroitier.sweep * ms) / 1000;
  return aim + Math.max(-max, Math.min(max, d));
}
/** The floor angle from a to b (the screen's y unsquashed). */
export const floorAngle = (a: P, b: P) => Math.atan2((b.y - a.y) / T.lantern.squash, b.x - a.x);
/** How far a shot or a beam flies from `from` along screen angle `a` before a prop (`boxes`) or the room's edge stops it;
 *  the building a marksman stands on (a box holding `from`) does not. */
export const clearRay = (from: P, a: number, inside: Box, boxes: Box[]) =>
  rayDistance(from, a, inside, boxes.filter((b) => !(from.x >= b.x && from.x <= b.x + b.width && from.y >= b.y && from.y <= b.y + b.height)));
