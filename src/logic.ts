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

/** Next combo step (0, 1, 2): chains while attacks land inside the window, else restarts. */
export function nextCombo(prev: number, msSinceLast: number, windowMs: number): number {
  return msSinceLast <= windowMs ? (prev + 1) % 3 : 0;
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

/** Normalised distance from the centre of an ellipse to `p`: 1 on its edge. Pools of light on the floor are ellipses
 *  (the ground is seen at an angle). */
export function ellipseDist(c: P, p: P, rx: number, ry: number): number {
  return Math.hypot((p.x - c.x) / rx, (p.y - c.y) / ry);
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
