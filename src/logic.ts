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
