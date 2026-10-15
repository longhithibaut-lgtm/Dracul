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
