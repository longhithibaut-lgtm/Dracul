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
 * weakened, back on its feet, can be killed. Until the bite is unlocked (save.ts) every blow is plain: callers pass
 * `human` false, and a weakened human dies like any other.
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

/** La Nuée, the Rat house's form of the night, answers a hero holding `need` of its gifts. */
export const swarmUnlocked = (held: readonly unknown[], need: number) => held.length >= need;

/** A placed foe on the watch: seeing the hero (`sees`) at `now` sets it hunting him; it gives up once it has not seen
 *  him for `giveUpMs`. */
export function alertness(s: { alert: boolean; seenAt: number }, sees: boolean, now: number, giveUpMs: number) {
  return sees ? { alert: true, seenAt: now } : { alert: s.alert && now - s.seenAt < giveUpMs, seenAt: s.seenAt };
}

/** `amount` blood picked up, `carried` already in a bag holding `bag`: what is carried then, and what is left behind. */
export function carry(carried: number, amount: number, bag: number) {
  const took = Math.max(0, Math.min(amount, bag - carried));
  return { carried: carried + took, left: amount - took };
}

/** How many of the battue's thresholds (one every `every` blood carried) a pick-up from `before` to `after` crosses. */
export const scent = (before: number, after: number, every: number) => Math.floor(after / every) - Math.floor(before / every);

/** The foes a room is first found with: `n` groups drawn from `pool`, each on a spawn point of its own at least `clear`
 *  from where the hero comes in (`entry`), and `gap` apart where the room allows. Fewer groups when too few points are clear
 *  of him. */
export function placeGroups<K>(pool: readonly (readonly K[])[], n: number, spawns: readonly P[], entry: P, clear: number, gap: number, rnd: () => number) {
  const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y), picked: P[] = [];
  const ok = spawns.map((p) => ({ p, k: rnd() })).sort((a, b) => a.k - b.k).map((o) => o.p).filter((p) => d(p, entry) >= clear);
  for (const p of ok) if (picked.length < n && picked.every((q) => d(p, q) >= gap)) picked.push(p);
  for (const p of ok) if (picked.length < n && !picked.includes(p)) picked.push(p);
  return picked.map((at) => ({ at, kinds: pool[Math.floor(rnd() * pool.length)] }));
}

/** A walk grid over `b`, cells `nav` px: open where a ghoul's feet (12 x 6) fit at its centre, clear of every box. */
export function walkCells(b: Box, boxes: readonly Box[], nav: number): boolean[] {
  const cols = Math.ceil(b.width / nav), rows = Math.ceil(b.height / nav), h = nav / 2;
  const open = Array.from({ length: cols * rows }, (_, c) => b.y + Math.floor(c / cols) * nav + h + 3 <= b.y + b.height && b.x + (c % cols) * nav + h + 6 <= b.x + b.width);
  for (const o of boxes) { // closed: the cells whose feet would overlap it
    const x0 = Math.max(0, Math.floor((o.x - 6 - b.x - h) / nav) + 1), x1 = Math.min(cols - 1, Math.ceil((o.x + o.width + 6 - b.x - h) / nav) - 1);
    const y0 = Math.max(0, Math.floor((o.y - 3 - b.y - h) / nav) + 1), y1 = Math.min(rows - 1, Math.ceil((o.y + o.height + 3 - b.y - h) / nav) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) open[y * cols + x] = false;
  }
  return open;
}

/** Steps from cell `goal` to every cell of a grid `cols` wide, walking through `open` cells only, 8 ways but never
 *  cutting a corner; Infinity where it can't get. The goal itself may be closed (someone standing on a brink). `links`:
 *  cells a step apart however far (a gallery's two mouths). */
export function stepsFrom(open: readonly boolean[], cols: number, goal: number, links: Map<number, number> = new Map()): number[] {
  const rows = open.length / cols, d = open.map(() => Infinity), queue = [goal];
  d[goal] = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % cols, y = (c - x) / cols, l = links.get(c);
    if (l !== undefined && d[l] === Infinity) { d[l] = d[c] + 1; queue.push(l); }
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

/** The view, in native pixels, for a screen of `w` x `h` (any unit): a `bw` x `bh` box laid along the screen's long side
 *  just fits, and the other side grows to the screen's shape, so there are never bars. A 16:9 screen shows the box. */
export function viewSize(w: number, h: number, bw: number, bh: number): { width: number; height: number } {
  let k = Math.min(Math.max(w, h) / bw, Math.min(w, h) / bh); // screen units per native pixel
  if (w > h) k = Math.max(k, w / bw); // landscape: never wider than the rooms (they scroll up and down instead)
  return { width: Math.round(w / k), height: Math.round(h / k) };
}

/** Where to pin the marker of a point (`x`, `y`) outside a `w` x `h` screen: on the screen, `m` in from its edges, and
 *  the way it lies (`dx`, `dy`: -1, 0 or 1 each). Undefined when the point is on the screen. */
export function edgePip(x: number, y: number, w: number, h: number, m: number) {
  const dx = x < 0 ? -1 : x > w ? 1 : 0, dy = y < 0 ? -1 : y > h ? 1 : 0;
  if (!dx && !dy) return undefined;
  return { x: Math.min(Math.max(x, m), w - m), y: Math.min(Math.max(y, m), h - m), dx, dy };
}

/** An aim at a target (dx, dy) room px away, as an angle on the floor (the ground's foreshortening `squash` undone),
 *  snapped to one of `dirs` directions. */
export function aimAt(dx: number, dy: number, squash: number, dirs: number): number {
  const step = (2 * Math.PI) / dirs;
  return Math.round(Math.atan2(dy / squash, dx) / step) * step;
}

/** True when `target` lies on the strip `half` wide either side of the line from `origin` along `angle`, `length` long
 *  (a split in the floor: no farther back than `origin`, nor past its end). */
export function onLine(origin: { x: number; y: number }, angle: number, target: { x: number; y: number }, length: number, half: number): boolean {
  const dx = target.x - origin.x, dy = target.y - origin.y, along = dx * Math.cos(angle) + dy * Math.sin(angle);
  return along >= 0 && along <= length && Math.abs(dy * Math.cos(angle) - dx * Math.sin(angle)) <= half;
}

/** A w x h mask from rows of base-36 run lengths, out and in by turns ('a,3,1;...': a baked room's HOLY,
 *  tools/art/rooms.gen.mjs); 1 in. */
export function runMask(runs: string, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  runs.split(';').forEach((row, y) => {
    let x = 0, v = 0;
    for (const r of row.split(',')) { const n = parseInt(r, 36); if (v) m.fill(1, y * w + x, y * w + x + n); x += n; v ^= 1; }
  });
  return m;
}
