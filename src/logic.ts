// Pure gameplay rules, kept out of Phaser so they can be unit tested.

/** True when `target` is within `range` of `origin` and inside the arc centred on `facing` (radians). */
export function inArc(
  origin: { x: number; y: number },
  facing: number,
  target: { x: number; y: number },
  range: number,
  arcDeg: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (dx * dx + dy * dy > range * range) return false;
  // Wrap the angle difference into [-PI, PI] so arcs work across the ±PI seam.
  const a = Math.atan2(dy, dx) - facing;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= (arcDeg * Math.PI) / 360;
}

/** The prey of a bite: the nearest human with `weakAt` hp or less, within `range` and the arc centred on `facing`. */
export function biteTarget<E extends { x: number; y: number; hp: number; human: boolean }>(
  origin: { x: number; y: number }, facing: number, candidates: E[], range: number, arcDeg: number, weakAt: number,
): E | undefined {
  const d = (e: E) => Math.hypot(e.x - origin.x, e.y - origin.y);
  return candidates.filter((e) => e.human && e.hp <= weakAt && inArc(origin, facing, e, range, arcDeg)).sort((a, b) => d(a) - d(b))[0];
}

/** Next combo step (0, 1, 2): chains while attacks land inside the window, else restarts. */
export function nextCombo(prev: number, msSinceLast: number, windowMs: number): number {
  return msSinceLast <= windowMs ? (prev + 1) % 3 : 0;
}

/** True when a slash at `now` is a dash strike: pressed during the dash that ended at `dashUntil` (it waited for the
 *  end) or at most `windowMs` after it, and the first slash since that dash (`lastSlashAt`). `dashUntil` 0: no dash yet. */
export function dashStrikes(now: number, dashUntil: number, lastSlashAt: number, windowMs: number): boolean {
  return dashUntil > 0 && lastSlashAt < dashUntil && now - dashUntil <= windowMs;
}

/**
 * A blow of `amount` on an enemy with `hp`. A human it leaves weakened (`weakAt` or less, but alive) drops to its knees;
 * while it kneels, blows can't take its hp below what it knelt with, so it is left for the bite. Only a human already
 * weakened, back on its feet, can be killed.
 */
export function wound(hp: number, amount: number, human: boolean, weakAt: number, kneeling: boolean): { hp: number; kneels: boolean } {
  if (kneeling) return { hp, kneels: false };
  // A human still standing can't be killed outright: the blow stops at the weakened hp and he kneels for the bite.
  const fresh = human && hp > weakAt, next = fresh ? Math.max(weakAt, hp - amount) : hp - amount;
  return { hp: next, kneels: fresh && next <= weakAt };
}

type P = { x: number; y: number };

/**
 * True when a dash at `at`, moving at `v` (px/s) for `left` more seconds, is within `contact` of `target` ahead of it
 * and would still end that close: it should halt here. It passes through targets it would leave behind.
 */
export function dashStopsAt(at: P, v: P, left: number, target: P, contact: number): boolean {
  const d2 = (x: number, y: number) => (target.x - x) ** 2 + (target.y - y) ** 2;
  const ahead = v.x * (target.x - at.x) + v.y * (target.y - at.y) > 0;
  return ahead && d2(at.x, at.y) <= contact ** 2 && d2(at.x + v.x * left, at.y + v.y * left) < contact ** 2;
}

type Box = { x: number; y: number; width: number; height: number };

/** How far a ray from `from` along `angle` goes before it leaves `inside` or enters one of `boxes`: a bolt's flight. */
export function rayDistance(from: P, angle: number, inside: Box, boxes: Box[]): number {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  // Distances along the ray between which it is inside box b on axis k (slab method).
  const slab = (b: Box, k: 'x' | 'y') => {
    const lo = k === 'x' ? b.x : b.y, hi = lo + (k === 'x' ? b.width : b.height);
    if (!dir[k]) return from[k] >= lo && from[k] <= hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const a = (lo - from[k]) / dir[k], c = (hi - from[k]) / dir[k];
    return [Math.min(a, c), Math.max(a, c)];
  };
  let best = Math.max(0, Math.min(slab(inside, 'x')[1], slab(inside, 'y')[1]));
  for (const b of boxes) {
    const [x0, x1] = slab(b, 'x'), [y0, y1] = slab(b, 'y');
    const enter = Math.max(x0, y0, 0);
    if (enter <= Math.min(x1, y1) && enter < best) best = enter;
  }
  return best;
}

/**
 * Heading, relative to the direction of the target, for a shooter keeping between `near` and `far` of it: closes in
 * when too far, strafes on `side` (±1) inside the band, backs off when too close. Never straight on, so it slides
 * along walls instead of pinning itself against them.
 */
export function keepDistance(dist: number, near: number, far: number, side: number): number {
  const k = Math.max(-1, Math.min(1, (2 * dist - near - far) / (far - near))); // -1 too close, 0 mid-band, 1 too far
  return side * (Math.PI / 2) * (1 - 0.8 * k);
}

/** Normalised distance from the centre of an ellipse to `p`: 1 on its edge. Pools of light on the floor are ellipses
 *  (the ground is seen at an angle). */
export function ellipseDist(c: P, p: P, rx: number, ry: number): number {
  return Math.hypot((p.x - c.x) / rx, (p.y - c.y) / ry);
}

/** Where a glyph cast from `from` at `to` lands: no farther than `range` from `from`, then kept inside `box`. Clamping
 *  into a box that holds `from` never takes the spot farther away, so both hold whenever `from` is in the box. */
export function glyphSpot(from: P, to: P, range: number, box: Box): P {
  const d = Math.hypot(to.x - from.x, to.y - from.y), k = d > range ? range / d : 1;
  const clamp = (v: number, lo: number, len: number) => Math.min(Math.max(v, lo), lo + len);
  return { x: clamp(from.x + (to.x - from.x) * k, box.x, box.width), y: clamp(from.y + (to.y - from.y) * k, box.y, box.height) };
}

/** Burns landed after `ms` spent in holy light: none during a grace on stepping in, then one every `everyMs`. */
export function burnsAfter(ms: number, graceMs: number, everyMs: number): number {
  return ms < graceMs ? 0 : 1 + Math.floor((ms - graceMs) / everyMs);
}

/** Where the next lantern goes: the free spot nearest the hero whose light, stretched by `clear`, leaves him out. */
export function pickSpot(spots: P[], hero: P, taken: P[], rx: number, ry: number, clear: number): P | undefined {
  const d = (s: P) => Math.hypot(s.x - hero.x, s.y - hero.y);
  return spots.filter((s) => !taken.some((t) => t.x === s.x && t.y === s.y) && ellipseDist(s, hero, rx, ry) > clear)
    .sort((a, b) => d(a) - d(b))[0];
}

type Gifts<K extends string> = Record<K, { slot?: string; requires?: readonly string[] }>;

/** The gifts that may be offered: not held, and holding one of those they require, if any. */
export function offerable<K extends string>(defs: Gifts<K>, held: readonly K[]): K[] {
  return (Object.keys(defs) as K[]).filter((g) => !held.includes(g) && (defs[g].requires?.some((r) => held.includes(r as K)) ?? true));
}

/** The held gift that taking `id` would replace: the one in its slot. A talent (no slot) replaces nothing. */
export function replaced<K extends string>(defs: Gifts<K>, held: readonly K[], id: K): K | undefined {
  const slot = defs[id].slot;
  return slot ? held.find((g) => g !== id && defs[g].slot === slot) : undefined;
}

/** The gifts held once `id` is taken: at most one per slot, so a slot gift replaces the one in its slot; talents stack. */
export function take<K extends string>(defs: Gifts<K>, held: readonly K[], id: K): K[] {
  const old = replaced(defs, held, id);
  return [...held.filter((g) => g !== old), id];
}

/** Up to `n` items of `pool`, in random order (`rnd` in [0, 1), injected for tests). */
export function drawGifts<K>(pool: readonly K[], n: number, rnd: () => number): K[] {
  const left = [...pool];
  for (let i = left.length - 1; i > 0; i--) { // Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    [left[i], left[j]] = [left[j], left[i]];
  }
  return left.slice(0, n);
}

/** The layout of room `room` of a run: the first of `ids` for room 1, then any but `prev` (the last room's). */
export function nextLayout<K>(room: number, prev: K, ids: readonly K[], rnd: () => number): K {
  if (room <= 1) return ids[0];
  const left = ids.filter((id) => id !== prev);
  return left[Math.floor(rnd() * left.length)];
}

/** Steps from cell `goal` to every cell of a grid `cols` wide, walking through `open` cells only, 8 ways but never
 *  cutting a corner; Infinity where it can't get. The goal itself may be closed (someone standing on a brink). */
export function stepsFrom(open: readonly boolean[], cols: number, goal: number): number[] {
  const rows = open.length / cols, d = open.map(() => Infinity), queue = [goal];
  d[goal] = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % cols, y = (c - x) / cols;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = nx + ny * cols;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !open[n] || d[n] !== Infinity) continue;
        if (dx && dy && (!open[nx + y * cols] || !open[x + ny * cols])) continue;
        d[n] = d[c] + 1;
        queue.push(n);
      }
  }
  return d;
}
