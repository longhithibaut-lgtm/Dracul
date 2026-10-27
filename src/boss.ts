// The catacombs' guardian, la Matrice (T.matrice), and la Nourrice « l'Araignée » kept for later (T.nourrice;
// docs/decisions.md): their fights' pure pieces, unit tested. RoomScene runs the fights, matrice.ts and nourrice.ts show them. Floor distances undo the ground's foreshortening (T.lantern.squash), like every blow's.
import { T } from './tuning.ts';
import type { Save } from './save.ts';

type P = { x: number; y: number };
type Rect = readonly number[]; // x0, y0, x1, y1

/** Her phase: 1, then 2 from half her blood on. */
export const phaseOf = (hp: number, max = T.nourrice.hp) => (hp > max / 2 ? 1 : 2);

/** Walking into the arena (its rect, `margin` in from its south wall) starts the fight, while she lives. */
export const fightStarts = (s: Save, p: P, arena: Rect, margin = 30) => !s.nourrice.dead && p.x > arena[0] && p.x < arena[2] && p.y > arena[1] && p.y < arena[3] - margin;

/** Floor distance from `a` to `b`. */
export const floor = (a: P, b: P, squash = T.lantern.squash) => Math.hypot(b.x - a.x, (b.y - a.y) / squash);

/** A slam (the drop, from the floor or from the vault, a hurled lump) landing at `at` strikes `p` within `r`. */
export const struck = (at: P, p: P, r: number) => floor(at, p) <= r;

/** The rake from her feet `from` along her locked `aim` (a floor angle) strikes `p` between `rin` and `rout` within `deg`. */
export function raked(from: P, aim: number, p: P, rin = T.nourrice.rakeIn, rout = T.nourrice.rakeOut, deg = T.nourrice.rakeDeg) {
  const d = floor(from, p), a = Math.atan2((p.y - from.y) / T.lantern.squash, p.x - from.x);
  const off = Math.abs(((a - aim + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return d >= rin && d <= rout && off <= (deg * Math.PI) / 360;
}

/** Phase 1, ready to strike at floor distance `d`: the rake close, the drop farther, else she stalks. */
export const choose = (d: number) => (d <= T.nourrice.rakeRange ? 'rake' : d <= T.nourrice.dropRange ? 'drop' : 'stalk');

/** A blow of `dmg` on her: which clinging goule it shakes off (the first still on her), if it is hard enough and fewer
 *  than T.nourrice.goules of hers are alive; -1: none. */
export const shed = (clinging: readonly boolean[], alive: number, dmg: number) => (dmg >= T.nourrice.hard && alive < T.nourrice.goules ? clinging.indexOf(true) : -1);

/** The walls she crawls in phase 2: up the arena's west side, along its north wall, down its east side (its south wall,
 *  the grille's, she leaves alone), `inset` in from them. Their length. */
const sides = (a: Rect, inset: number) => { const x0 = a[0] + inset, x1 = a[2] - inset, y0 = a[1] + inset, y1 = a[3] - 90; return { x0, x1, y0, y1, h: y1 - y0, w: x1 - x0 }; };
export const edgeLength = (a: Rect, inset = 8) => { const e = sides(a, inset); return 2 * e.h + e.w; };
/** The foot of the wall `s` along them, and which wall: 'w', 'n', 'e'. */
export function edge(a: Rect, s: number, inset = 8): P & { wall: 'w' | 'n' | 'e' } {
  const e = sides(a, inset), t = Math.max(0, Math.min(2 * e.h + e.w, s));
  if (t < e.h) return { x: e.x0, y: e.y1 - t, wall: 'w' };
  if (t < e.h + e.w) return { x: e.x0 + t - e.h, y: e.y0, wall: 'n' };
  return { x: e.x1, y: e.y0 + t - e.h - e.w, wall: 'e' };
}
/** Where along them lies nearest to `p`. */
export function nearestEdge(a: Rect, p: P, inset = 8) {
  const e = sides(a, inset), c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const cands = [e.h - (c(p.y, e.y0, e.y1) - e.y0), e.h + c(p.x, e.x0, e.x1) - e.x0, e.h + e.w + c(p.y, e.y0, e.y1) - e.y0];
  return cands.reduce((b, s) => (Math.hypot(edge(a, s, inset).x - p.x, edge(a, s, inset).y - p.y) < Math.hypot(edge(a, b, inset).x - p.x, edge(a, b, inset).y - p.y) ? s : b));
}

// ---- La Matrice ----

/** How much of a blow reaches her: in phase 1, the share of her `cap` cords cut (all `cords` tethered: nothing); torn
 *  open in phase 2, all of it. */
export const bared = (cords: number, phase: number, cap = T.matrice.cords) => (phase === 2 ? 1 : Math.max(0, cap - cords) / cap);

/** The swing aimed at `at` from the wheel's `pivot`: from `back` behind the pivot (away from him), through it, to `over`
 *  past him, at most `arm` out (floor), kept within the arena; `aim`, the floor angle it sweeps along. */
export function swingPath(pivot: P, at: P, arena: Rect, back: number, over: number, arm: number, squash = T.lantern.squash) {
  const dx = at.x - pivot.x, dy = (at.y - pivot.y) / squash, d = Math.hypot(dx, dy), ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
  const c = (p: P, inset = 16) => ({ x: Math.max(arena[0] + inset, Math.min(arena[2] - inset, p.x)), y: Math.max(arena[1] + inset, Math.min(arena[3] - inset, p.y)) });
  const out = Math.min(arm, d + over);
  return { from: c({ x: pivot.x - ux * back, y: pivot.y - uy * back * squash }), to: c({ x: pivot.x + ux * out, y: pivot.y + uy * out * squash }), aim: Math.atan2(uy, ux) };
}
