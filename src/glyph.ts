import Phaser from 'phaser';
import { T } from './tuning.ts';
import { ellipseDist } from './logic.ts';

// Le Glyphe: the blood sigil the Sans-Maison casts on the floor. A hard rim (bright outside, dark inside), a band of
// angular runes, a ring, the fang triangle and the bat of his banner, all in blood: never the Order's gold, the moon
// blue of the medallion's pool, nor the soft blob of a rising ghoul. It draws itself from the side facing him, flares
// once armed, throws chains from the triangle's points to whatever stands in it, pulses when it catches, blinks before
// it lets go, then crumbles. Gameplay owns where and when; this file shows it.

type G = Phaser.GameObjects.Graphics;
type Sprite = Phaser.Physics.Arcade.Sprite;
type P = { x: number; y: number };

// Palette "Nuit de sang" (docs/art.md): blood, its glows and the night.
const HOT = 0xffe4ee, GLOW = 0xff4f8b, RED = 0xe0284a, BLOOD = 0xa3122f, DRIED = 0x5c0a1c, NIGHT = 0x1c1029;
const FLOOR = 1.7; // over blood stains and holy light, under characters
const FADE_MS = 300;
const SNAP_MS = 70; // chains shoot out to a newly bound enemy
const SQ = T.lantern.squash; // the ground is seen at an angle, like the lanterns' pools

// The triangle's points, on the ring (ground angles): one toward the camera, two behind. Chains come from there.
const POINTS = [90, 210, 330].map((d) => (d * Math.PI) / 180);
// Angular runes, 3x4, around the band between the rim and the ring.
const RUNES = ['X.X/XXX/.X./.X.', 'XX./X.X/XX./X..', 'X../XX./X.X/X..', '.X./X.X/X.X/.X.', 'X.X/.X./X.X/X..', 'XXX/.X./X.X/.X.',
  'X../.X./..X/.X.', '.XX/X../.X./XX.', 'X.X/X.X/.X./X.X'].map((r) => r.split('/'));
// The bat of his banner (as on the HUD), at the heart of the triangle. X lit, x shade.
const BAT = [
  'X.............X',
  'XXX...X.X...XXX',
  '.XXXX.XXX.XXXX.',
  '.xXXXXXXXXXXXx.',
  '..xx.xXXXx.xx..',
  '..x...xXx...x..',
  '.......x.......',
];

export type Glyph = {
  x: number; y: number; at: number; // centre on the floor, cast time
  from: number; // ground angle toward the hero when cast: the sigil draws itself from that side
  caughtAt: number; // when it first bound something, -1 until then
  g: G; chains: Map<Sprite, { front: G; back: G; at: number }>;
  shaken: [Sprite, number][]; // sprites moved a pixel for this frame's render
  end(): void;
};

// Stable per-pixel noise in [0, 1), for a crumble that does not flicker.
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1009 / 1009;
const inside = (x: number, y: number, r: number) => Math.hypot(x, y / SQ) <= r;
/** On the 1 px outline of the ground circle of radius r. */
const edge = (x: number, y: number, r: number) => inside(x, y, r) && !(inside(x + 1, y, r) && inside(x - 1, y, r) && inside(x, y + 1, r) && inside(x, y - 1, r));
const ring = (r: number) => r - Math.max(5, Math.round(r * 0.27)); // the inner ring, inside the band of runes
const onGround = (gl: P, a: number, r: number) => ({ x: gl.x + Math.round(Math.cos(a) * r), y: gl.y + Math.round(Math.sin(a) * r * SQ) });

/** 1 px line from a to b (Bresenham); `put` gets each pixel and its index along the line. */
function line(a: P, b: P, put: (x: number, y: number, i: number) => void, from = 0) {
  let x = Math.round(a.x), y = Math.round(a.y), i = from;
  const x1 = Math.round(b.x), y1 = Math.round(b.y), dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  for (let err = dx + dy; ; i++) {
    put(x, y, i);
    if (x === x1 && y === y1) return i + 1;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Starts drawing a glyph centred on floor point (x, y), cast by a hero standing at `hero` (his feet). */
export function cast(scene: Phaser.Scene, x: number, y: number, hero: P): Glyph {
  const E = Phaser.Scenes.Events;
  const gl: Glyph = {
    x: Math.round(x), y: Math.round(y), at: scene.time.now, from: Math.atan2((hero.y - y) / SQ, hero.x - x), caughtAt: -1,
    g: scene.add.graphics().setDepth(FLOOR), chains: new Map(), shaken: [],
    end: () => {
      undo();
      scene.events.off(E.PRE_UPDATE, undo).off(E.SHUTDOWN, gl.end);
      gl.g.destroy();
      for (const c of gl.chains.values()) { c.front.destroy(); c.back.destroy(); }
      gl.chains.clear();
    },
  };
  // The strain shiver moves bound sprites a pixel for the render only: they are put back before physics reads them.
  const undo = () => { for (const [s, dx] of gl.shaken) s.x -= dx; gl.shaken = []; };
  scene.events.on(E.PRE_UPDATE, undo).once(E.SHUTDOWN, gl.end);
  return gl;
}

/** True while the glyph binds and floor point `p` (feet) is inside it. */
export function binds(gl: Glyph, p: P, now: number) {
  const t = now - gl.at - T.glyph.armMs;
  return t >= 0 && t < T.glyph.holdMs && ellipseDist(gl, p, T.glyph.radius, T.glyph.radius * SQ) <= 1;
}

/** Draws the glyph at `now`, holding `held` (the enemies it binds this frame). False once it has crumbled and is gone. */
export function show(gl: Glyph, now: number, held: Sprite[]): boolean {
  const t = now - gl.at - T.glyph.armMs;
  if (t >= T.glyph.holdMs + FADE_MS) return gl.end(), false;
  if (held.length && gl.caughtAt < 0) gl.caughtAt = now;
  sigil(gl, now);
  chains(gl, now, held);
  // Bound, they strain against the chains: a shiver of a pixel either way.
  const dx = [0, 1, 0, -1][Math.floor(now / 40) % 4];
  if (dx) for (const s of held) { s.x += dx; gl.shaken.push([s, dx]); }
  return true;
}

function sigil(gl: Glyph, now: number) {
  const g = gl.g.clear(), G = T.glyph, R = G.radius, ri = ring(R), rm = R - 5.7; // runes between the 2 px rim and the ring
  const age = now - gl.at, arm = Math.min(1, age / G.armMs), t = age - G.armMs, fade = Math.max(0, (t - G.holdMs) / FADE_MS);
  const caught = gl.caughtAt >= 0 ? now - gl.caughtAt : -1;
  // A flare when it arms and when it first catches; a beat on the rim while it holds; a blink before it lets go.
  const flare = (t >= 0 && t < 60) || (caught >= 0 && caught < 90);
  const beat = caught >= 0 && t < G.holdMs && caught % 700 < 90;
  const ending = t > G.holdMs - 500 && t < G.holdMs && Math.floor(t / 100) % 2 === 1;
  // While it arms, each part is drawn from the side facing the hero around both ways, between arm fractions k0 and
  // k1: -1 while not reached yet, else how far (radians) behind the drawing head (9, far behind, once all drawn).
  const trace = (a: number, k0: number, k1: number) => {
    const reach = Math.PI * Phaser.Math.Clamp((arm - k0) / (k1 - k0), 0, 1), d = Math.abs(Phaser.Math.Angle.Wrap(a - gl.from));
    return reach <= 0 || d > reach + 0.01 ? -1 : arm >= 1 ? 9 : reach - d;
  };
  const tone = (c: number, behind: number) => (fade ? (fade < 0.45 ? BLOOD : DRIED) : flare || behind < 0.4 ? HOT : c);
  const put = (x: number, y: number, c: number) => fade * 1.4 > hash(x + 64, y + 64) || g.fillStyle(c).fillRect(gl.x + x, gl.y + y, 1, 1);

  // The floor under it darkens, soaked.
  g.fillStyle(NIGHT, 0.55 * Math.min(1, arm * 2) * (1 - fade));
  for (let y = -Math.floor(R * SQ); y <= R * SQ; y++) {
    const w = Math.floor(Math.sqrt(R * R - (y / SQ) ** 2));
    g.fillRect(gl.x - w, gl.y + y, 2 * w + 1, 1);
  }
  // Hard 2 px rim with a dark lining, the ring; and the pulse thrown out when it first catches.
  const pulse = caught >= 0 && caught < 240 ? R + 1 + 5 * Phaser.Math.Easing.Cubic.Out(caught / 240) : 0;
  const W = Math.ceil(Math.max(R, pulse)) + 1, H = Math.ceil(Math.max(R, pulse) * SQ) + 1;
  for (let y = -H; y <= H; y++) for (let x = -W; x <= W; x++) {
    const a = Math.atan2(y / SQ, x);
    if (pulse && edge(x, y, pulse) && Math.floor((a + 4) * 5) % 3) put(x, y, caught < 80 ? HOT : caught < 160 ? GLOW : BLOOD);
    else if (edge(x, y, R)) { const b = trace(a, 0, 0.5); if (b >= 0) put(x, y, tone(beat ? GLOW : ending ? BLOOD : RED, b)); }
    else if (edge(x, y, R - 1)) { const b = trace(a, 0, 0.5); if (b >= 0) put(x, y, tone(ending ? BLOOD : RED, b)); }
    else if (edge(x, y, R - 2)) { const b = trace(a, 0, 0.5); if (b >= 0) put(x, y, DRIED); }
    else if (edge(x, y, ri)) { const b = trace(a, 0.3, 0.75); if (b >= 0) put(x, y, tone(ending ? DRIED : BLOOD, b)); }
  }
  // Runes in the band, one lit at a time while it holds, crawling around; the triangle's points take three slots.
  const lit = t >= 0 && t < G.holdMs ? Math.floor(t / 110) % 12 : -1;
  for (let k = 0; k < 12; k++) {
    if (k % 4 === 0) continue;
    const a = POINTS[0] + (k * Math.PI) / 6, b = trace(a, 0.1, 0.6), cx = Math.round(Math.cos(a) * rm), cy = Math.round(Math.sin(a) * rm * SQ - 1.5);
    if (b < 0) continue;
    RUNES[(k * 5) % RUNES.length].forEach((row, j) => [...row].forEach((p, i) =>
      p === 'X' && put(cx - 1 + i, cy + j, tone(k === lit ? GLOW : RED, b))));
  }
  // The fang triangle, drawn from each point to the next, and its points.
  const pts = POINTS.map((a) => onGround(gl, a, ri)), k = Phaser.Math.Clamp((arm - 0.5) / 0.35, 0, 1);
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % 3], n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) + 1;
    line(p, q, (x, y, j) => j <= k * n && put(x - gl.x, y - gl.y, tone(RED, arm < 1 && j > k * n - 4 ? 0 : 9)));
  });
  if (arm >= 0.5) for (const p of pts) for (const [x, y] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) put(p.x - gl.x + x, p.y - gl.y + y, tone(x || y ? GLOW : HOT, 9));
  // The bat, burnt in last at the heart of the triangle.
  if (arm >= 0.8) {
    const cy = Math.round((pts[0].y + pts[1].y + pts[2].y) / 3 - gl.y) - 4;
    BAT.forEach((row, j) => [...row].forEach((p, i) =>
      p !== '.' && put(i - 7, cy + j, arm < 1 || flare ? HOT : p === 'X' ? (beat ? GLOW : RED) : BLOOD)));
  }
}

/** Chains from the triangle's points to the waist of each bound enemy, in front of it or behind as the point lies, and
 *  one wrapped round its waist. */
function chains(gl: Glyph, now: number, held: Sprite[]) {
  for (const [s, c] of gl.chains) if (!held.includes(s)) { c.front.destroy(); c.back.destroy(); gl.chains.delete(s); }
  const pts = POINTS.map((a) => onGround(gl, a, ring(T.glyph.radius)));
  held.forEach((s, n) => {
    let c = gl.chains.get(s);
    if (!c) gl.chains.set(s, (c = { front: gl.g.scene.add.graphics(), back: gl.g.scene.add.graphics(), at: now }));
    c.front.clear().setDepth(s.depth + 0.5);
    c.back.clear().setDepth(s.depth - 0.5);
    const feet = s.body!.center, age = now - c.at, k = Math.min(1, age / SNAP_MS), hot = age < SNAP_MS + 60;
    const waist = { x: Math.round(feet.x), y: Math.round(feet.y) - 9 };
    // Beaded links (two pixels face on, lit then red, one edge on, a dark joint) over a shadow; white-hot as they snap
    // on. `q`: how far the middle link is pulled across the chain.
    const links = (g: G, a: P, b: P, q: number) => {
      const steep = Math.abs(b.y - a.y) > Math.abs(b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y) || 1, sx = steep ? 1 : 0, sy = 1 - sx;
      const mid = { x: (a.x + b.x) / 2 - ((b.y - a.y) / len) * q, y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * q };
      const path: [number, number, number][] = [];
      line(mid, b, (x, y, i) => path.push([x, y, i]), line(a, mid, (x, y, i) => path.push([x, y, i])));
      g.fillStyle(NIGHT);
      for (const [x, y] of path) g.fillRect(x, y + 1, 1, 1).fillRect(x + sx, y + 1 + sy, 1, 1);
      for (const [x, y, i] of path) {
        const m = i % 4;
        if (m < 2) g.fillStyle(hot ? HOT : m ? RED : GLOW).fillRect(x, y, 1, 1).fillStyle(hot ? GLOW : BLOOD).fillRect(x + sx, y + sy, 1, 1);
        else g.fillStyle(hot ? GLOW : m === 2 ? BLOOD : DRIED).fillRect(x, y, 1, 1);
      }
    };
    pts.forEach((p, j) => {
      const to = { x: p.x + (waist.x - p.x) * k, y: p.y + (waist.y - p.y) * k };
      // Taut, the middle link quivers a pixel across the chain.
      links(p.y > feet.y ? c.front : c.back, p, to, k < 1 ? 0 : [0, 1, 0, -1][(Math.floor(now / 45) + n + j) % 4]);
    });
    if (k >= 1) links(c.front, { x: waist.x - 6, y: waist.y }, { x: waist.x + 6, y: waist.y }, 0);
  });
}
