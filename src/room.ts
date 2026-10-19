import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Torture from './torture.ts';

type P = { x: number; y: number };
// How the arena looks and where its solid parts are.
export type Room = {
  bounds: Phaser.Geom.Rectangle; // walkable area
  obstacles: Phaser.Physics.Arcade.StaticGroup; // props: they stop walkers, bolts and shards
  pits: Phaser.Physics.Arcade.StaticGroup; // holes in the floor: they stop walkers only, everything flies over them
  heroStart: P;
  spawns: P[]; // fixed, so screenshots are comparable run to run
  spots: P[]; // where the Order may plant its lanterns
  medallion: P; // centre of the ritual medallion, on the floor: the gift rises there
  gate: P; // middle of the exit, on the back edge of the floor
  stairs: P; // where the hero climbs in from, below the front edge
  holy(x: number, y: number): boolean; // a floor point in holy light that never goes out (stained glass, the open sky)
  burn: { graceMs: number; burnEveryMs: number; damage: number }; // how that light burns: like a lantern, or the Dawn's
  arcades: Phaser.GameObjects.Image[]; // the cloister's: their bottom row is their feet line; see through one from behind
  height: number; // of the whole room: a crypt's (RH) or the cloister's three screens (the camera follows the hero up it)
  sections: number[]; // feet lines the hero climbs past into the room's next part, bottom first (none: one part)
};

// Crypt rooms seen in HLD's three-quarter view, all one shell: a back wall with lancets, ossuaries and a portcullis
// the moon blazes through, side walls, stairs in the front wall, a floor of cobalt slabs. Each layout fills it its own
// way: the hall (a carved ritual medallion, braziers, pillars, coffins), the nave (two rows of pillars along a central
// lane), the collapsed ossuary (the floor fallen into the abyss in places), the chapel (stained glass casting holy light
// on the floor between rows of pews, an altar at the back). The cloister is the one room open to the sky, with its own
// painter (see paintCloister).
// Everything is painted pixel by pixel into canvas textures once, then reused on scene restarts.
export const LAYOUTS = ['hall', 'nave', 'ossuary', 'chapel', 'cloister'] as const;
// The torture room is a trial of another art direction (torture.ts, dark.ts): reached from the training room only.
export type LayoutId = (typeof LAYOUTS)[number] | 'torture';

// Palette "Nuit de sang" (docs/art.md) plus crimson walls, a moonlit blue floor and the magenta dark beyond.
const P = {
  void0: 0x0b0710, void1: 0x1c1029, void2: 0x2e1838,
  stone0: 0x3b2a4a, stone1: 0x5a4468, stone2: 0x8a6f8f,
  bone0: 0xe8dcc8, bone1: 0xb7a58f,
  blood0: 0x5c0a1c, blood1: 0xa3122f, blood2: 0xe0284a,
  moon0: 0x1f4a5a, moon1: 0x3fa7a3, moon2: 0x8ff0dc,
  fire: 0xffb347,
  wall0: 0x2b1631, wall1: 0x4a1d3c, wall2: 0x6e2d4f,
  floor1: 0x1b2b60, floor2: 0x21346f, floor3: 0x293e80,
  abyss0: 0x1f0520, abyss1: 0x3d0a3a, abyss2: 0x5e1256,
};

// A crypt room is as tall as the tallest common upright phone's view (21:9: 630 px), so it never shows a band above or
// below it: 35 rows of slabs, climbed from the stairs at the bottom to the portcullis at the top.
const RH = 638;
// Floor rectangle = walkable bounds (feet). Walls: back face above FY0, side caps 12 px, front cap below FY1.
const FX0 = 40, FX1 = 440, FY0 = 64, FY1 = RH - 14;
const CX = 240, CY = 160; // ritual medallion centre

type Prop = { kind: 'pillar' | 'stump' | 'fallen' | 'brazier' | 'coffin' | 'coffinOpen' | 'heap' | 'pew' | 'altar' | 'font' | 'block'; x: number; y: number; w: number; h: number; tall?: number; flip?: boolean };
// x = footprint centre, y = footprint bottom (the feet line), w/h = footprint = static body. A stump's `tall` is its
// texture height (58 by default: the shorter, the lower it broke), `flip` mirrors its break; a whole pillar's runs up to
// the top of the room unless `tall` says how far it rises before the vault's dark swallows it. A block is a bare
// footprint: its look is painted with the rest of its layout (the cloister's piers, trunks, well).
const PROPS: Prop[] = [
  { kind: 'pillar', x: 92, y: 140, w: 24, h: 12 },
  { kind: 'stump', x: 388, y: 140, w: 24, h: 12 },
  { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 },
  { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
  { kind: 'coffin', x: 96, y: 234, w: 46, h: 14 },
  { kind: 'coffinOpen', x: 392, y: 234, w: 62, h: 14 },
];

// ---------- tiny raster ----------

const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
const mix = (a: number, b: number, t: number) => {
  let o = 0;
  for (let k = 0; k < 3; k++) o = (o << 8) | Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t);
  return o;
};
const hash = (x: number, y: number, s = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in 0..1, feature size `size` pixels. */
const noise = (x: number, y: number, size: number, s = 0) => {
  const gx = x / size, gy = y / size, ix = Math.floor(gx), iy = Math.floor(gy);
  const u = (gx - ix) * (gx - ix) * (3 - 2 * (gx - ix)), v = (gy - iy) * (gy - iy) * (3 - 2 * (gy - iy));
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** Seeded random, so every run paints the same room. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

class Px {
  readonly d: Uint8ClampedArray<ArrayBuffer>;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Paints colour c over the pixel at opacity a. */
  p(x: number, y: number, c: number, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.in(x, y) || a <= 0) return;
    const d = this.d, i = (y * this.w + x) * 4, b = d[i + 3] / 255, o = a + b * (1 - a);
    for (let k = 0; k < 3; k++) d[i + k] = (ch(c, k) * a + d[i + k] * b * (1 - a)) / o;
    d[i + 3] = o * 255;
  }
  /** Colour at a pixel (ignores alpha). */
  get(x: number, y: number) {
    if (!this.in(x, y)) return 0;
    const i = (y * this.w + x) * 4;
    return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2];
  }
  alpha(x: number, y: number) {
    return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
  }
  /** Adds light of colour c at strength k, keeping the hue underneath. */
  glow(x: number, y: number, c: number, k: number) {
    if (!this.in(x, y)) return;
    const i = (y * this.w + x) * 4;
    for (let n = 0; n < 3; n++) this.d[i + n] += ch(c, n) * k;
  }
  /** Pulls an already painted pixel toward colour c by t (lights and shadows). */
  tint(x: number, y: number, c: number, t: number) {
    if (t > 0 && this.alpha(x, y)) this.p(x, y, mix(this.get(x, y), c, Math.min(t, 1)));
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.p(i, j, c, a);
  }
  /** Paints c on every pixel of the box where test passes. */
  fill(x0: number, y0: number, x1: number, y1: number, test: (x: number, y: number) => boolean, c: number, a = 1) {
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) if (test(x, y)) this.p(x, y, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.p(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 1) {
    this.fill(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1, c, a);
  }
  /** Hand-drawn grid: each character is a palette key, '.' is empty. */
  grid(x: number, y: number, rows: string[], pal: Record<string, number>) {
    rows.forEach((r, j) => [...r].forEach((k, i) => k in pal && this.p(x + i, y + j, pal[k])));
  }
}

/** Carves the masked pixels: dark groove, lit lip just below (light comes from the top left). */
function engrave(p: Px, mask: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number, depth = 0.55) {
  const hits: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask(x, y)) hits.push([x, y]);
  for (const [x, y] of hits) if (!mask(x, y + 1)) p.tint(x, y + 1, P.stone2, depth * 0.35);
  for (const [x, y] of hits) p.tint(x, y, P.void0, depth);
}

/** Irregular light pool with hard stepped edges: ks are the band strengths from the rim inward. */
function light(p: Px, cx: number, cy: number, rx: number, ry: number, c: number, ks: number[], wobble = 0.18, seed = 0, size = 9, mode: 'glow' | 'tint' | 'paint' = 'glow') {
  for (let y = Math.floor(cy - ry * 1.3); y <= cy + ry * 1.3; y++)
    for (let x = Math.floor(cx - rx * 1.3); x <= cx + rx * 1.3; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (noise(x, y, size, seed) - 0.5) * wobble * 2;
      const band = Math.floor((1 - d) * ks.length * 1.15);
      if (band < 0) continue;
      const k = ks[Math.min(band, ks.length - 1)];
      if (mode === 'paint') p.p(x, y, c, k);
      else if (mode === 'tint') p.tint(x, y, c, k);
      else p.glow(x, y, c, k);
    }
}

/** Organic splash built from noise: two tones, an optional wet glint, a few droplets around. */
function splat(p: Px, cx: number, cy: number, r: number, seed: number, outer: number, inner: number, glint?: number) {
  for (let y = Math.floor(cy - r * 1.4); y <= cy + r * 1.4; y++)
    for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      const v = 1 - Math.hypot(x - cx, (y - cy) * 1.3) / r + (noise(x, y, 3, seed) - 0.5) * 0.9;
      if (v > 0.45) p.p(x, y, inner);
      else if (v > 0) p.p(x, y, outer);
    }
  if (glint !== undefined) p.p(cx - Math.ceil(r / 3), cy - Math.ceil(r / 4), glint);
  const R = rng(seed);
  for (let i = 0; i < r * 1.5; i++) {
    const a = R() * Math.PI * 2, d = r * (1.1 + R() * 1.4);
    p.p(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, outer);
  }
}

/** Pointed (gothic) arch test: half width hw, sides vertical below springing line ys, arcs of radius R above. */
const inArch = (x: number, y: number, cx: number, hw: number, ys: number, R: number) => {
  const dx = Math.abs(x + 0.5 - cx);
  return y >= ys ? dx < hw : (dx - hw + R) ** 2 + (ys - y) ** 2 < R * R;
};

function bake(scene: Phaser.Scene, key: string, w: number, h: number, paint: (p: Px) => void) {
  if (scene.textures.exists(key)) return key; // painted on the first build, kept across restarts
  const p = new Px(w, h);
  paint(p);
  const t = scene.textures.createCanvas(key, w, h)!;
  t.context.putImageData(new ImageData(p.d, w, h), 0, 0);
  t.refresh();
  return key;
}

// ---------- background: void, walls, floor, baked light ----------

function paintBackWall(p: Px, bars: boolean) {
  const x0 = FX0 - 12, x1 = FX1 + 12;
  // Courses of stone blocks.
  for (let r = 0; r < 6; r++) {
    const y = 7 + r * 8;
    for (let bx = x0 - (r % 2) * 12; bx < x1; bx += 24) {
      const t = hash(bx, r, 7), c = t < 0.25 ? P.wall0 : t > 0.85 ? mix(P.wall1, P.wall2, 0.5) : P.wall1;
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 24; i++) {
          const x = bx + i;
          if (x < x0 || x >= x1) continue;
          p.p(x, y + j, j === 7 || i === 0 ? P.wall0 : j === 0 ? mix(c, P.wall2, 0.6) : c);
        }
    }
  }
  // Age: damp rising from the plinth, dark streaks running down from the cornice.
  for (let y = 38; y < 55; y++) for (let x = x0; x < x1; x++) if (noise(x, y * 2, 6, 13) > 0.7 - (y - 38) * 0.015) p.tint(x, y, P.void0, 0.2);
  const S = rng(17);
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(x0 + S() * (x1 - x0)), len = 6 + S() * 20, w = S() < 0.3 ? 2 : 1;
    for (let y = 9; y < 9 + len; y++) for (let k = 0; k < w; k++) p.tint(x + k, y, P.void0, 0.35 * (1 - (y - 9) / len));
  }
  // Ceiling shadow creeping down the face.
  for (let y = 7; y < 27; y++) for (let x = x0; x < x1; x++) p.tint(x, y, P.void0, [0.7, 0.55, 0.4, 0.25, 0.12][Math.floor((y - 7) / 4)]);
  // Plinth: two stepped ledges.
  p.rect(x0, 55, x1 - x0, 1, P.wall2);
  p.rect(x0, 56, x1 - x0, 3, P.wall1);
  p.rect(x0, 59, x1 - x0, 1, mix(P.wall1, P.wall2, 0.6));
  p.rect(x0, 60, x1 - x0, 4, P.wall0);
  for (let x = x0 + 6; x < x1; x += 24) p.rect(x, 60, 1, 4, P.void2);

  for (const c of [CX - 48, CX + 48, CX - 152, CX + 152]) pilaster(p, c);
  for (const c of LANCETS) lancet(p, c);
  gate(p, bars);
  for (const c of [CX - 48, CX + 48]) banner(p, c);
  ossuary(p, FX0 + 21);
  ossuary(p, FX1 - 21);
  chain(p, FX1 - 4, 28, 46);
  wallTop(p, x0, 0, x1 - x0, 9);
  p.rect(x0, 9, x1 - x0, 1, P.void1);
  // A long crack through the right wall.
  const R = rng(11);
  let x = CX + 156, y = 12;
  for (let i = 0; i < 40; i++) {
    p.p(x, y, P.void1);
    p.tint(x + 1, y, P.wall2, 0.4);
    y++;
    x += R() < 0.3 ? -1 : R() < 0.5 ? 1 : 0;
  }
}

/** Top of a thick wall seen from above: dark stone blocks, the lit edge where it drops to the floor. */
function wallTop(p: Px, x: number, y: number, w: number, h: number) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      const row = Math.floor((j + 3) / 6), joint = (j + 3) % 6 === 0 || (i + row * 9) % 18 === 0;
      p.p(i, j, joint ? P.void1 : hash(Math.floor((i + row * 9) / 18), row, 4) < 0.3 ? mix(P.void2, P.stone0, 0.3) : P.void2);
    }
}

function pilaster(p: Px, c: number) {
  for (let y = 0; y < 64; y++) {
    const wide = y >= 7 && y < 12 ? 2 : y >= 50 ? 2 : 0;
    for (let i = -6 - wide; i < 6 + wide; i++) {
      const edge = i < -4 - wide ? P.wall2 : i >= 4 + wide ? P.wall0 : P.wall1;
      p.p(c + i, y, y === 7 || y === 50 || y === 55 ? P.wall2 : y === 11 || y === 54 ? P.wall0 : edge);
    }
  }
  for (let y = 0; y < 27; y++) for (let i = -8; i < 8; i++) p.tint(c + i, y, P.void0, [0.75, 0.6, 0.45, 0.3, 0.15, 0.1, 0.05][Math.floor(y / 4)]);
}

function lancet(p: Px, c: number) {
  const ys = 26, R = 13, hw = 8;
  // Deep reveal: outer moulding, jamb, then the glass.
  p.fill(c - 14, 6, c + 14, 54, (x, y) => inArch(x, y, c, hw + 4, ys, R + 4) && y < 54, P.wall2);
  p.fill(c - 14, 6, c + 14, 54, (x, y) => inArch(x, y, c, hw + 3, ys, R + 3) && y < 53 && x >= c, P.wall0);
  p.fill(c - 14, 6, c + 14, 54, (x, y) => inArch(x, y, c, hw + 2, ys, R + 2) && y < 52, P.void2);
  p.fill(c - 14, 6, c + 14, 54, (x, y) => inArch(x, y, c, hw, ys, R) && y < 51, P.moon0);
  // Leaded diamond panes, brighter toward the top where the moon is.
  p.fill(c - hw, 6, c + hw, 50, (x, y) => inArch(x, y, c, hw - 1, ys, R - 1) && (x + y) % 4 !== 0 && (x - y + 400) % 4 !== 0, P.moon1);
  p.fill(c - hw, 6, c + hw, 50, (x, y) => inArch(x, y, c, hw - 1, ys, R - 1) && y < 30 && (x + y) % 4 === 2 && (x - y + 400) % 4 === 2, P.moon2);
  // Mullion and transom.
  p.rect(c - 1, 20, 2, 31, P.void2);
  p.rect(c - 1, 20, 1, 31, P.wall1);
  p.rect(c - hw, 37, hw * 2, 1, P.void2);
  p.rect(c - hw - 3, 51, hw * 2 + 6, 1, P.wall2);
  p.rect(c - hw - 3, 52, hw * 2 + 6, 2, P.wall0);
}

const GATE = { hw: 22, ys: 44, R: 28 };

/** The exit; `glow`: the light beyond it, dark to bright (the moon up the crypt's stairs by default). */
function gate(p: Px, bars: boolean, glow = [P.moon0, P.moon1, P.moon2]) {
  const [g0, g1, g2] = glow;
  const { hw, ys, R } = GATE;
  const shade = (x: number, lit: number, dark: number) => (x < CX ? lit : dark);
  p.fill(CX - 32, 4, CX + 32, 63, (x, y) => inArch(x, y, CX, hw + 8, ys, R + 8), P.wall0);
  p.fill(CX - 32, 4, CX + 32, 63, (x, y) => inArch(x, y, CX, hw + 7, ys, R + 7) && !inArch(x, y, CX, hw + 5, ys, R + 5), P.wall2);
  p.fill(CX - 32, 4, CX + 32, 63, (x, y) => inArch(x, y, CX, hw + 5, ys, R + 5) && !inArch(x, y, CX, hw + 3, ys, R + 3), P.wall1);
  for (let y = 4; y < 64; y++)
    for (let x = CX - 30; x <= CX + 30; x++)
      if (inArch(x, y, CX, hw + 3, ys, R + 3) && !inArch(x, y, CX, hw, ys, R)) p.p(x, y, shade(x, P.wall2, P.wall0));
  // Beyond the gate: moonlit stairs climbing away, bright as the night gets.
  for (let y = 4; y < 64; y++)
    for (let x = CX - hw; x <= CX + hw; x++) {
      if (!inArch(x, y, CX, hw, ys, R)) continue;
      const stair = y >= 38 ? (y - 38) % 5 : -1;
      p.p(x, y, y < 26 ? g0 : y < 38 ? mix(g0, g1, 0.55) : stair === 0 ? g2 : stair < 3 ? mix(g1, g2, 0.35) : g1);
    }
  // The reveal catches that light.
  for (let y = 4; y < 64; y++)
    for (let x = CX - 30; x <= CX + 30; x++)
      if (inArch(x, y, CX, hw + 3, ys, R + 3) && !inArch(x, y, CX, hw, ys, R)) p.tint(x, y, g1, 0.25);
  // Portcullis in silhouette against it.
  if (bars) for (let y = 4; y < 64; y++)
    for (let x = CX - hw; x <= CX + hw; x++)
      if (inArch(x, y, CX, hw, ys, R) && portcullis(x, y)) p.p(x, y, (x - CX + 19 + 60) % 6 === 1 ? P.void0 : P.void1);
  // Skull keystone.
  p.grid(CX - 4, 11, [
    '.ooooo.',
    'oOOOOOo',
    'O.OOO.O',
    'O..O..O',
    'OOO.OOO',
    '.O.O.O.',
  ], { o: P.bone1, O: mix(P.bone1, P.stone1, 0.5), '.': P.void1 });
  // Threshold slab.
  p.rect(CX - hw - 2, 63, hw * 2 + 4, 1, P.stone1);
}

/** Bars of the gate: vertical every 6 px, two cross bars. Also casts the striped light on the floor. */
const portcullis = (x: number, y: number) => (x - CX + 19 + 60) % 6 < 2 || Math.abs(y - 26.5) < 1 || Math.abs(y - 44.5) < 1;

/** Moonlight through the gate projected on the floor: each floor pixel looks back at the gate opening. */
function gateSpill(x: number, y: number, bars = true) {
  if (y < FY0 || y > FY0 + 100) return 0;
  const d = y - FY0, gx = CX + (x - CX - d * 0.12) / (1 + d * 0.012), gy = FY0 - d / 2;
  if (!inArch(gx, gy, CX, GATE.hw, GATE.ys, GATE.R) || (bars && portcullis(Math.round(gx), Math.round(gy)))) return 0;
  return d < 26 ? 1 : d < 56 ? 0.72 : 0.45;
}

/** Light from the lancets projected on the floor (moon high on the left, so it falls down and to the right). */
function lancetSpill(x: number, y: number) {
  const d = y - FY0, gy = FY0 - d, gx = x - d * 0.5;
  return LANCETS.some((c) => gy < 50 && inArch(gx, gy, c, 8, 26, 13) && Math.abs(gx + 0.5 - c) > 1 && Math.round(gy) !== 37) ? 1 : 0;
}

function banner(p: Px, c: number) {
  p.rect(c - 9, 12, 18, 1, P.void2);
  p.p(c - 10, 12, P.bone1); p.p(c + 9, 12, P.bone1);
  for (let y = 13; y < 49; y++)
    for (let i = -7; i < 7; i++) {
      if (y > 42 && Math.abs(i + 0.5) < y - 42) continue; // swallowtail
      const col = i < -5 ? P.blood1 : i === 6 ? mix(P.blood0, P.void0, 0.4) : i === -1 || i === 3 ? mix(P.blood0, P.void0, 0.25) : P.blood0;
      p.p(c + i, y, y === 13 || y === 14 ? P.bone1 : col);
    }
  p.grid(c - 3, 23, [
    '#.....#',
    '#.....#',
    '##...##',
    '.#####.',
    '.......',
    '...#...',
    '..###..',
    '..###..',
    '...#...',
  ], { '#': mix(P.bone1, P.blood1, 0.3) });
  for (let y = 13; y < 30; y++) for (let i = -7; i < 7; i++) p.tint(c + i, y, P.void0, (30 - y) / 45);
}

/** Wall niche stacked with skulls, the way crypts store their dead. */
function ossuary(p: Px, c: number) {
  const hw = 10, ys = 42, R = 12;
  const arch = (x: number, y: number, d: number) => inArch(x, y, c, hw + d, ys, R + d) && y < 54;
  p.fill(c - 14, 24, c + 14, 54, (x, y) => arch(x, y, 3), P.wall2);
  p.fill(c - 14, 24, c + 14, 54, (x, y) => arch(x, y, 3) && !arch(x, y, 1) && x >= c, P.wall0);
  p.fill(c - 14, 24, c + 14, 54, (x, y) => arch(x, y, 0), P.void1);
  for (const [row, y] of [[0, 47], [1, 42], [2, 37], [3, 32]])
    for (let i = 0; i < 4; i++) {
      const x = c - 10 + i * 5 + (row % 2) * 2;
      if (!arch(x, y, -1) || !arch(x + 4, y, -1)) continue;
      const lit = 0.15 + row * 0.1 + i * 0.06; // the niche darkens upward and to the right
      p.grid(x, y, SKULL, { b: mix(P.bone0, P.void1, lit), B: mix(P.bone1, P.void1, lit + 0.1), '.': P.void0 });
    }
  p.rect(c - hw - 3, 53, hw * 2 + 6, 1, P.wall2);
  p.rect(c - hw - 3, 54, hw * 2 + 6, 1, P.wall0);
}

function chain(p: Px, x: number, y0: number, y1: number) {
  for (let y = y0; y < y1; y++) {
    if (y % 3 === 0) { p.p(x - 1, y, P.stone0); p.p(x + 1, y, P.void2); p.p(x, y, P.void1); }
    else p.p(x, y, y % 3 === 1 ? P.stone1 : P.stone0);
  }
  p.grid(x - 2, y1, ['.###.', '#...#', '#...#', '.###.'], { '#': P.stone0 });
}

function paintFloor(p: Px) {
  // Slabs: mostly 16x16, some merged in pairs; tone drifts in broad patches so the grid stays quiet.
  const tone = (tx: number, ty: number) => {
    const t = noise(tx, ty, 3, 2) * 0.7 + hash(tx, ty, 1) * 0.3;
    return t < 0.36 ? P.floor1 : t > 0.62 ? P.floor3 : P.floor2;
  };
  const rows = (FY1 - FY0) / 16;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < 25; tx++) {
      const x = FX0 + tx * 16, y = FY0 + ty * 16;
      const border = tx === 0 || tx === 24 || ty === rows - 1;
      const merged = !border && tx > 1 && hash(tx, ty, 2) < 0.3;
      const base = border ? P.wall1 : tone(merged ? tx - 1 : tx, ty);
      p.rect(x, y, 16, 16, base);
      p.rect(x, y, 16, 1, mix(base, P.void0, border ? 0.35 : 0.27));
      if (!merged) p.rect(x, y, 1, 16, mix(base, P.void0, border ? 0.35 : 0.27));
      for (let k = 0; k < 3; k++) {
        const h = hash(tx * 3 + k, ty, 8), mx = x + 2 + Math.floor(hash(tx, ty * 3 + k, 9) * 12), my = y + 2 + Math.floor(h * 12);
        p.rect(mx, my, h < 0.5 ? 2 : 1, 1, mix(base, h < 0.3 ? P.void0 : P.stone2, 0.18));
      }
      if (hash(tx, ty, 10) < 0.25) p.rect(x + 1, y + 1, 2, 1, mix(base, P.void0, 0.3));
      if (border) {
        const sp = spiral(11, (tx + ty) % 2 === 0);
        engrave(p, (i, j) => sp.has((i - x - 3) + (j - y - 3) * 16), x + 2, y + 2, x + 15, y + 15, 0.45);
      }
    }
}

/** A ritual medallion centred on (CX, CY), `s` times the hall's (radius 50): a smooth disc in a ring of crimson voussoirs,
 *  a blood channel, an eight-point star, a drain; `frame`: the crimson inlaid square around it, with its runnels, as
 *  much smaller. */
function medallion(p: Px, s: number, frame: boolean, CY: number) {
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
  const ang = (x: number, y: number) => Math.atan2(y + 0.5 - CY, x + 0.5 - CX);
  const R = 50 * s, r0 = 41 * s, n = Math.round(24 * s), m = Math.ceil(R) + 4; // n voussoirs
  const vous = (x: number, y: number) => ((ang(x, y) / Math.PI) * (n / 2) + n + 0.5) % n;
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => dist(x, y) < R, P.floor3);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => dist(x, y) >= r0 && dist(x, y) < R, P.wall1);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => dist(x, y) >= r0 && dist(x, y) < R && hash(Math.floor(vous(x, y)), 0, 6) < 0.4, mix(P.wall1, P.wall2, 0.5));
  engrave(p, (x, y) => {
    const d = dist(x, y);
    return Math.abs(d - R) < 0.6 || Math.abs(d - r0) < 0.6 || (d > r0 && d < R && Math.abs((vous(x, y) % 1) - 0.5) < 0.06 * ((46 * s) / d));
  }, CX - m, CY - m, CX + m, CY + m, 0.6);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => Math.abs(dist(x, y) - 37.5 * s) < 1.2, P.blood0);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => Math.abs(dist(x, y) - 37.5 * s) < 1.2 && noise(x, y, 6, 3) > 0.6, P.blood1);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => Math.abs(dist(x, y) - 36 * s) < 0.5 && y < CY, P.void1, 0.6);
  const S = 33 * s;
  const inStar = (x: number, y: number) => {
    const dx = Math.abs(x + 0.5 - CX), dy = Math.abs(y + 0.5 - CY);
    return dx + dy <= S || Math.max(dx, dy) <= S / Math.SQRT2;
  };
  p.fill(CX - m, CY - m, CX + m, CY + m, inStar, mix(P.floor3, P.stone1, 0.4));
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => dist(x, y) < 22 * s, P.floor3);
  p.fill(CX - m, CY - m, CX + m, CY + m, (x, y) => dist(x, y) < 14 * s, mix(P.floor2, P.wall1, 0.35));
  const star = new Set<number>();
  for (const rot of [0, Math.PI / 4]) {
    const v = [0, 1, 2, 3].map((k) => [CX + Math.cos(rot + (k * Math.PI) / 2) * S, CY + Math.sin(rot + (k * Math.PI) / 2) * S]);
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = v[k], [bx, by] = v[(k + 1) % 4], l = Math.ceil(Math.hypot(bx - ax, by - ay));
      for (let i = 0; i <= l; i++) star.add(Math.round(ax + ((bx - ax) * i) / l) + Math.round(ay + ((by - ay) * i) / l) * 1000);
    }
  }
  engrave(p, (x, y) => star.has(x + y * 1000), CX - m, CY - m, CX + m, CY + m, 0.5);
  engrave(p, (x, y) => Math.abs(dist(x, y) - 14 * s) < 0.6 || Math.abs(dist(x, y) - 22 * s) < 0.6, CX - m, CY - m, CX + m, CY + m, 0.45);
  p.ellipse(CX, CY, 6, 6, P.stone1);
  p.ellipse(CX, CY, 5, 5, P.void0);
  for (const dy of [-3, -1, 1, 3]) p.rect(CX - 4 + Math.abs(dy) / 2, CY + dy, 8 - Math.abs(dy), 1, P.stone0);
  splat(p, CX + 3, CY + 7, 4, 21, P.blood0, P.blood1);
  if (!frame) return;
  // Crimson inlaid frame around it, broken at the four gaps where carved runnels lead in.
  const sq = (x: number, y: number) => Math.max(Math.abs(x + 0.5 - CX), Math.abs(y + 0.5 - CY));
  const gap = (x: number, y: number) => Math.min(Math.abs(x + 0.5 - CX), Math.abs(y + 0.5 - CY)) < 7 * s;
  const f0 = Math.round(59 * s) + 0.5, f1 = f0 + 3, k = Math.round(61 * s); // the frame's inner and outer edges, its corners
  p.fill(CX - 64, CY - 64, CX + 64, CY + 64, (x, y) => sq(x, y) > f0 - 0.5 && sq(x, y) < f1 - 0.5 && !gap(x, y), mix(P.wall1, P.floor2, 0.45));
  engrave(p, (x, y) => (Math.abs(sq(x, y) - f0) < 0.6 || Math.abs(sq(x, y) - f1) < 0.6) && !gap(x, y), CX - 64, CY - 64, CX + 64, CY + 64, 0.45);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ox = CX + sx * k, oy = CY + sy * k;
    p.rect(ox - 4, oy - 4, 8, 8, P.wall1);
    p.rect(ox - 2, oy - 2, 4, 4, P.blood0);
    p.rect(ox - 2, oy - 2, 4, 1, P.blood1);
    engrave(p, (x, y) => Math.max(Math.abs(x + 0.5 - ox), Math.abs(y + 0.5 - oy)) === 4.5, ox - 6, oy - 6, ox + 6, oy + 6, 0.5);
  }
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
    engrave(p, (x, y) => {
      const along = (x + 0.5 - CX) * dx + (y + 0.5 - CY) * dy, across = (x + 0.5 - CX) * dy - (y + 0.5 - CY) * dx;
      return Math.abs(Math.abs(across) - 2) < 0.6 && along > 50 * s && along < f1 + 3.5;
    }, CX - 68, CY - 68, CX + 68, CY + 68, 0.5);
}

/** Square spiral with a one pixel gap, as a set of x + y * 16 keys. */
function spiral(n: number, flip: boolean) {
  const s = new Set<number>();
  let x = 0, y = 0, dx = 1, dy = 0;
  const legs = [n - 1, n - 1, n - 1];
  for (let l = n - 3; l > 0; l -= 2) legs.push(l, l);
  s.add(flip ? n - 1 : 0);
  for (const len of legs) {
    for (let i = 0; i < len; i++) { x += dx; y += dy; s.add((flip ? n - 1 - x : x) + y * 16); }
    [dx, dy] = [-dy, dx];
  }
  return s;
}

/** A wandering groove that sometimes forks, from (x, y) heading `a` for `len` px; R drives its path. */
function crackAt(p: Px, R: () => number, x: number, y: number, a: number, len: number, wander = 0.9, depth = 0.5) {
  const pts = new Set<number>();
  const x0 = x, y0 = y;
  for (let i = 0; i < len; i++) {
    pts.add(Math.round(x) + Math.round(y) * 1000);
    a += (R() - 0.5) * wander;
    x += Math.cos(a); y += Math.sin(a);
    if (R() < 0.06 && len - i > 6) {
      let bx = x, by = y, ba = a + (R() < 0.5 ? 0.9 : -0.9);
      for (let j = 0; j < 6 + R() * 6; j++) { pts.add(Math.round(bx) + Math.round(by) * 1000); bx += Math.cos(ba); by += Math.sin(ba); ba += (R() - 0.5) * 0.6; }
    }
  }
  engrave(p, (i, j) => pts.has(i + j * 1000), x0 - len - 2, y0 - len - 2, x0 + len + 2, y0 + len + 2, depth);
}

/** Missing slab corners with a lit broken edge. */
function chips(p: Px, at: number[][]) {
  for (const [x, y] of at) {
    p.fill(x, y, x + 9, y + 7, (i, j) => (i - x) + (j - y) * 1.3 < 9 + noise(i, j, 2, 9) * 3, P.void1);
    p.fill(x, y, x + 12, y + 10, (i, j) => p.get(i, j) === P.void1 && p.get(i, j + 1) !== P.void1, P.floor1);
  }
}

/** Chunks of fallen stone, [x, y, w, h] each: a lit top face, a dark front, a shadow. */
function rubble(p: Px, chunks: number[][]) {
  for (const [x, y, w, h] of chunks) {
    p.rect(x + 1, y + h, w, 2, P.void0, 0.45);
    p.rect(x, y, w, h, P.stone1);
    p.rect(x, y, w, 1, P.stone2);
    p.rect(x, y + h - 1, w, 1, P.stone0);
    p.p(x + w - 1, y, P.stone1);
  }
}

/** Pebbles and grit, `n` of them, mostly gathered along the side walls; `keep` says where they may lie. */
function grit(p: Px, R: () => number, n: number, keep: (x: number, y: number) => boolean) {
  for (let i = 0; i < n; i++) {
    const near = R() < 0.65;
    const x = near ? (R() < 0.5 ? FX0 + 2 + R() * 22 : FX1 - 24 + R() * 22) : FX0 + R() * (FX1 - FX0);
    const y = FY0 + 4 + R() * (FY1 - FY0 - 6);
    if (!keep(x, y)) continue;
    p.p(x, y, R() < 0.5 ? P.stone1 : P.floor3);
    p.tint(x + 1, y + 1, P.void0, 0.5);
  }
}

function paintWear(p: Px) {
  const R = rng(5);
  const crack = (x: number, y: number, a: number, len: number) => crackAt(p, R, x, y, a, len);
  crack(300, 238, -1.9, 22);
  crack(414, 176, 2.3, 18);
  crack(130, 204, -0.3, 16);
  chips(p, [[344, 192], [120, 96], [184, 240], [312, 64]]);
  grit(p, R, 300, (x, y) => Math.hypot(x - CX, y - CY) >= 52 && Math.hypot(x - CX, y - 540) >= 32);
  // Rubble from the broken pillar.
  rubble(p, [[404, 146, 7, 4], [412, 150, 5, 3], [398, 152, 4, 3], [416, 142, 3, 2], [406, 156, 3, 2], [372, 150, 4, 3]]);
}

/** Ragged flat pool of blood, one colour with a hard edge; the gloss sits inside, so it reads as liquid, not a lump. */
function pool(p: Px, cx: number, cy: number, rx: number, ry: number, seed: number) {
  const shape = (x: number, y: number) =>
    Math.hypot((x - cx) / rx, (y - cy) / ry) + (noise(x, y, 6, seed) - 0.5) * 0.8 + (noise(x, y, 2, seed + 1) - 0.5) * 0.3;
  for (let y = Math.floor(cy - ry * 1.6); y <= cy + ry * 1.6; y++)
    for (let x = Math.floor(cx - rx * 1.6); x <= cx + rx * 1.6; x++) {
      const d = shape(x, y);
      if (d >= 1) continue;
      p.p(x, y, d > 0.85 ? mix(P.blood0, P.void0, 0.3) : P.blood0);
      if (d < 0.55 && noise(x, y, 3, seed + 2) > 0.66) p.p(x, y, P.blood1);
    }
  p.rect(Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.3), 2, 1, P.blood2);
}

/** A grave slab set in the floor: raised edge, carved border, a carved skull; `broken` splits it in two. */
function ledger(p: Px, x: number, y: number, broken: boolean) {
  const w = 28, h = 16;
  p.rect(x + 1, y + h, w, 1, P.void0, 0.5);
  p.rect(x, y, w, h, P.stone0);
  p.rect(x, y, w, 1, P.stone1);
  p.rect(x, y, 1, h, P.stone1);
  p.rect(x + w - 1, y, 1, h, P.void2);
  p.rect(x, y + h - 1, w, 1, P.void2);
  engrave(p, (i, j) => (i === x + 3 || i === x + w - 4 || j === y + 3 || j === y + h - 4) && i >= x + 3 && i <= x + w - 4 && j >= y + 3 && j <= y + h - 4, x, y, x + w, y + h, 0.5);
  engrave(p, (i, j) => ['.###.', '#####', '#.#.#', '.###.', '.#.#.'][j - y - 5]?.[i - x - 12] === '#', x + 10, y + 4, x + 18, y + 11, 0.45); // carved skull
  if (broken) {
    const pts = new Set<number>();
    for (let j = 0; j < h; j++) pts.add(x + 19 + Math.round(Math.sin(j * 1.3) * 1.5) + (y + j) * 1000);
    engrave(p, (i, j) => pts.has(i + j * 1000), x, y, x + w, y + h, 0.8);
  }
}

function paintGore(p: Px) {
  // Spilled from the open coffin, dragged toward the medallion.
  pool(p, 350, 230, 12, 6, 31);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    splat(p, 352 - t * 66, 212 - t * 34 + Math.sin(i) * 2, 3.5 - t * 2, 40 + i, P.blood0, mix(P.blood0, P.blood1, 0.5));
  }
  pool(p, 66, 246, 14, 6, 33);
  splat(p, 196, 128, 4, 51, P.blood0, P.blood1, P.blood2);
  splat(p, 286, 196, 3, 52, P.blood0, P.blood1);
  splat(p, 112, 172, 5, 53, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 150, 238, 3, 55, P.blood0, mix(P.blood0, P.blood1, 0.4));
}

const SKULL = ['.bbb.', 'bBBBb', 'B.B.B', '.BBB.', '.b.b.'];
const skull = (p: Px, x: number, y: number) => p.grid(x, y, SKULL, { b: P.bone0, B: P.bone1, '.': P.void1 });
const bone = (p: Px, x: number, y: number, len: number, up = false) => {
  for (let i = 0; i < len; i++) p.p(up ? x : x + i, up ? y + i : y, i === 0 || i === len - 1 ? P.bone0 : P.bone1);
  p.tint(up ? x + 1 : x, up ? y : y + 1, P.void0, 0.5);
};

/** Candle cluster: wax sticks of varied height on a wax puddle. */
function candles(p: Px, x: number, y: number, n: number, seed: number) {
  const R = rng(seed);
  p.fill(x - 2, y - 2, x + n * 3 + 2, y + 3, (i, j) => Math.hypot((i - x - n * 1.5) / (n * 1.8 + 2), (j - y) / 2.6) + (noise(i, j, 2, seed) - 0.5) * 0.6 < 1, P.bone1);
  for (let i = 0; i < n; i++) {
    const cx = x + i * 3 + Math.floor(R() * 2), h = 3 + Math.floor(R() * 5), cy = y + Math.floor(R() * 2);
    p.rect(cx, cy - h, 2, h, P.bone1);
    p.rect(cx, cy - h, 1, h, P.bone0);
    p.p(cx + 1, cy - h - 1, P.void0);
    p.p(cx, cy - h - 2, P.fire);
    p.p(cx, cy - h - 3, mix(P.fire, P.bone0, 0.6));
  }
}

// ---------- layouts ----------

type Box = { x: number; y: number; w: number; h: number };
type Layout = {
  props: Prop[];
  pits: Box[]; // boxes of fallen floor (= static bodies); touching or overlapping ones paint as one hole
  candles: [x: number, y: number, n: number][];
  medallions: (readonly [y: number, size: number, frame: boolean])[]; // down the middle (the hall's great one: 1, framed)
  pools: (readonly [number, number, number, number])[]; // moon pools on the floor: centre and radii
  beams?: number[]; // how far down the room each set of moon shafts falls (default [0]: onto the top medallion)
  heroStart: P; spawns: P[]; spots: P[];
  gift?: P; // where the gift rises, if not on the medallion
  windows?: P[]; // tips of the stained-glass panes of holy light on the floor, see pane()
  open?: true; // under the sky: painted by paintCloister, lit by the Dawn, three screens tall (the crypt's fields go unused)
  sections?: number[]; // see Room
  decor(p: Px): void; // wear, gore, bones on the floor, before the props cast their shadows
  dark?: true; // the torture room: painted by torture.ts, its props 'block's whose look stand() adds, lit by dark.ts
};

// The cloister, in floor coordinates (x, y on the floor, h up from it): a long garth open to the sky, three screens
// tall, climbed from the stairs at the bottom to the church door at the top. Covered walks behind arcades of round
// arches on paired colonnettes run across it: the north walk along the church, two cross galleries that cut the garth
// in three gardens, and the south walk the stairs come up into. The well's garden, the monks' graves under their
// cypresses, the great yews before the church.
const CH = 3 * T.height, CFY1 = CH - 14; // the cloister's height, its floor's front edge
// It spans the screen's whole width (CW): the west range's wall stands just off the left edge (its shade still falls on
// the floor), each walk ends in a solid pier at both edges; walkers keep CM px inside the edges, so none half-leaves it.
const CW = T.width, CM = 8;
// Feet lines, wall depth, arches, roof; walk: how deep a cross gallery's covered walk runs behind its arcade.
const ARC = { n: 100, s: CFY1 - 36, d: 6, spring: 16, r: 16, top: 36, eave: 42, walk: 30 };
const CROSS = [560, 330]; // the cross galleries' south feet lines, bottom first: each a walk between two arcades
const ARCADES = [ARC.n, ...CROSS.flatMap((c) => [c - ARC.walk + ARC.d, c]), ARC.s]; // every arcade's feet line
/** True under a walk's roof: the north and south walks, and the cross galleries'. */
const roofed = (y: number) => y < ARC.n || y >= ARC.s - ARC.d || CROSS.some((c) => y >= c - ARC.walk && y < c);
const BAYS = Array.from({ length: 11 }, (_, k) => 40 + k * 40); // centres of the openings, 32 px wide between piers
const WELL = { x: CX, y: 662 };
type Tree = { x: number; y: number; rx: number; ry: number; rh: number; h: number; seed: number }; // trunk foot, canopy
const yew = (x: number, y: number, r: number, seed: number): Tree => ({ x, y, rx: r, ry: r * 0.66, rh: r * 0.7, h: r * 1.4, seed });
const cypress = (x: number, y: number, seed: number, tall = 0): Tree => ({ x, y, rx: 7, ry: 6, rh: 26 + tall, h: 33 + tall, seed });
const TREES: Tree[] = [
  // The well's garden.
  yew(84, 616, 24, 1), yew(382, 712, 22, 2), yew(422, 604, 20, 3), cypress(310, 618, 4), cypress(48, 716, 5), cypress(187, 700, 6, -4),
  yew(67, 668, 18, 7), yew(398, 662, 18, 8), yew(283, 708, 16, 9), yew(132, 722, 16, 50), yew(430, 700, 16, 58), yew(318, 728, 14, 67),
  yew(165, 598, 14, 63), yew(214, 600, 14, 57), yew(340, 596, 16, 64),
  // The monks' graves, along an avenue of cypresses.
  ...[382, 440, 498].flatMap((y, i) => [cypress(CX - 32, y, 10 + i, 6), cypress(CX + 32, y, 20 + i, 6)]),
  yew(53, 354, 22, 30), yew(427, 358, 20, 31), yew(50, 512, 20, 32), yew(425, 508, 22, 33), yew(94, 430, 20, 34), yew(391, 430, 20, 35),
  yew(319, 372, 16, 36), yew(163, 486, 16, 37), yew(150, 372, 16, 68), yew(376, 392, 16, 60), yew(300, 486, 16, 62), yew(440, 452, 18, 71),
  cypress(56, 400, 61), cypress(100, 478, 55), cypress(350, 476, 56),
  // The great yews before the church.
  yew(CX - 98, 158, 30, 40), yew(CX + 103, 146, 26, 41), yew(CX - 110, 246, 26, 42), yew(CX + 127, 240, 30, 43),
  yew(278, 212, 18, 44), yew(72, 166, 18, 45), yew(420, 195, 18, 46), yew(192, 270, 20, 47), yew(266, 136, 18, 48), yew(60, 240, 18, 51),
  yew(432, 140, 16, 52), yew(222, 216, 18, 53), yew(258, 258, 18, 54), yew(100, 196, 14, 65), yew(326, 214, 18, 66), yew(196, 128, 16, 69)
];
// Monks' graves: a low mound with a stone cross at its head (the cross's foot here).
const GRAVES = [36, 76, 116, 156, 324, 364, 404, 444].flatMap((x) => [400, 456].map((y) => ({ x, y: y + (x % 3) * 2 })));
// Low box hedges round the well's cross path and the beds before the church: walkers go round them, shots fly over.
// Their ends sit 2 px off where a walk-grid cell's ghoul would just touch them (a ghoul steered there caught on a corner).
const HEDGES: Box[] = [
  { x: 124, y: WELL.y - 18, w: 80, h: 8 }, { x: 276, y: WELL.y - 18, w: 80, h: 8 }, { x: 124, y: WELL.y + 16, w: 80, h: 8 }, { x: 276, y: WELL.y + 16, w: 80, h: 8 },
  { x: 168, y: 180, w: 48, h: 8 }, { x: 264, y: 180, w: 48, h: 8 },
];

// A crypt room is climbed in three parts, each with its wave: the hero comes up the stairs into the first, the next
// wave waits until he walks past a part's line (bottom first), then rises in front of him; the top part is the room as
// it was one screen tall, with the gate, its medallion and the gift.
const PARTS = [432, 248];
const LAYOUT: Record<LayoutId, Layout> = {
  // The validated hall: fights in the open middle, around the great medallion. Down the room, a row of tombs between
  // broken pillars, then by the stairs an antechamber round a smaller medallion between two braziers.
  hall: {
    props: [
      ...PROPS,
      { kind: 'coffinOpen', x: 104, y: 384, w: 62, h: 14 },
      { kind: 'coffin', x: 380, y: 384, w: 46, h: 14 },
      { kind: 'stump', x: 172, y: 342, w: 24, h: 12, tall: 50 },
      { kind: 'stump', x: 308, y: 342, w: 24, h: 12, tall: 40, flip: true },
      { kind: 'pillar', x: 92, y: 490, w: 24, h: 12, tall: 100 },
      { kind: 'stump', x: 388, y: 490, w: 24, h: 12, tall: 46, flip: true },
      { kind: 'brazier', x: 182, y: 474, w: 12, h: 8 },
      { kind: 'brazier', x: 298, y: 474, w: 12, h: 8 },
    ],
    pits: [],
    candles: [[54, 236, 3], [128, 240, 2], [62, 82, 3], [414, 80, 2], [334, 246, 3], [146, 300, 2], [58, 432, 3], [410, 436, 2], [56, 604, 3], [404, 608, 2], [150, 610, 2]],
    medallions: [[CY, 1, true], [540, 0.6, true]],
    pools: [[CX - 2, CY - 4, 84, 64], [CX, 536, 54, 42]],
    beams: [0, 378],
    // Room 1: the hero starts on the small medallion and the first wave rises around it, so fights play out in the open.
    heroStart: { x: CX, y: 532 },
    spawns: [{ x: CX, y: 460 }, { x: 128, y: 560 }, { x: 352, y: 560 },
      { x: CX, y: 296 }, { x: 56, y: 340 }, { x: 424, y: 340 },
      { x: CX, y: 88 }, { x: 120, y: CY }, { x: 360, y: CY }],
    // Around the medallions and down the tombs, leaving dark lanes between pools (48 px across, 26 px down) and the
    // medallions themselves dark.
    spots: [{ x: 176, y: 125 }, { x: 304, y: 125 }, { x: 176, y: 209 }, { x: 304, y: 209 },
      { x: 180, y: 292 }, { x: 300, y: 292 }, { x: 180, y: 404 }, { x: 300, y: 404 },
      { x: 152, y: 532 }, { x: 328, y: 532 }, { x: 152, y: 604 }, { x: 328, y: 604 }],
    sections: PARTS,
    decor: hallDecor,
  },
  // La nef: a central lane up a runner, between two rows of pillars (whole at the back, snapped further down, one fallen)
  // that shelter the side aisles from bolts; crossbowmen rise in the aisles and shoot through the gaps. Halfway, the rows
  // open on a crossing: a second rosette on the runner, a brazier at each end.
  nave: {
    props: [
      { kind: 'pillar', x: 168, y: 112, w: 24, h: 12 },
      { kind: 'pillar', x: 312, y: 112, w: 24, h: 12 },
      { kind: 'stump', x: 168, y: 168, w: 24, h: 12 },
      { kind: 'stump', x: 312, y: 168, w: 24, h: 12, flip: true },
      { kind: 'stump', x: 168, y: 224, w: 24, h: 12, tall: 44, flip: true },
      { kind: 'stump', x: 312, y: 224, w: 24, h: 12, tall: 48 },
      { kind: 'stump', x: 168, y: 280, w: 24, h: 12, tall: 52 },
      { kind: 'stump', x: 312, y: 280, w: 24, h: 12, tall: 56, flip: true },
      { kind: 'stump', x: 168, y: 336, w: 24, h: 12, tall: 36, flip: true },
      { kind: 'stump', x: 312, y: 336, w: 24, h: 12, tall: 42 },
      { kind: 'stump', x: 168, y: 504, w: 24, h: 12, tall: 46 },
      { kind: 'stump', x: 312, y: 504, w: 24, h: 12, tall: 32, flip: true },
      { kind: 'stump', x: 312, y: 560, w: 24, h: 12, tall: 52 },
      { kind: 'fallen', x: 118, y: 568, w: 64, h: 10 },
      { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 },
      { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
      { kind: 'brazier', x: 112, y: 424, w: 12, h: 8 },
      { kind: 'brazier', x: 368, y: 424, w: 12, h: 8 },
      { kind: 'coffin', x: 98, y: 206, w: 46, h: 14 },
      { kind: 'coffinOpen', x: 386, y: 140, w: 62, h: 14 },
      { kind: 'coffin', x: 98, y: 316, w: 46, h: 14 },
      { kind: 'coffinOpen', x: 384, y: 588, w: 62, h: 14 },
    ],
    pits: [],
    candles: [[58, 84, 3], [184, 120, 2], [290, 120, 2], [54, 240, 3], [408, 246, 2], [406, 82, 2], [184, 290, 2], [290, 344, 2], [54, 452, 3], [410, 380, 2], [52, 604, 2], [184, 514, 3]],
    medallions: [[CY, 0.6, false], [420, 0.5, false]],
    pools: [[CX, CY - 2, 46, 40], [CX, 418, 42, 34]],
    beams: [0, 258],
    heroStart: { x: CX, y: 566 },
    spawns: [{ x: CX, y: 470 }, { x: 96, y: 500 }, { x: 384, y: 500 },
      { x: CX, y: 330 }, { x: 96, y: 380 }, { x: 384, y: 356 },
      { x: CX, y: 92 }, { x: 96, y: 134 }, { x: 386, y: 194 }],
    spots: [{ x: 206, y: 130 }, { x: 274, y: 204 }, { x: 98, y: 98 }, { x: 384, y: 234 },
      { x: 206, y: 300 }, { x: 274, y: 380 }, { x: 98, y: 350 }, { x: 384, y: 290 },
      { x: 206, y: 526 }, { x: 274, y: 594 }, { x: 98, y: 600 }, { x: 384, y: 470 }],
    sections: [452, 248],
    decor: naveDecor,
  },
  // L'ossuaire effondré: the floor has fallen into the abyss along the walls and in holes; walkers go round, bolts and
  // shards fly over. Few props, little cover, and the edges are where one gets cornered. Halfway up, the great collapse
  // cuts the room across: two bridges over it, one up the middle under a moon shaft, one along the east wall.
  ossuary: {
    props: [
      { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 },
      { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
      { kind: 'heap', x: 66, y: 86, w: 24, h: 8 },
      { kind: 'heap', x: 410, y: 238, w: 24, h: 8 },
      { kind: 'brazier', x: 196, y: 402, w: 12, h: 8 },
      { kind: 'brazier', x: 284, y: 402, w: 12, h: 8 },
      { kind: 'heap', x: 420, y: 298, w: 24, h: 8 },
      { kind: 'heap', x: 70, y: 604, w: 24, h: 8 },
      { kind: 'heap', x: 250, y: 484, w: 24, h: 8 },
    ],
    pits: [
      { x: 40, y: 128, w: 80, h: 48 }, { x: 40, y: 172, w: 48, h: 28 }, { x: 96, y: 120, w: 32, h: 28 }, // west: against the wall
      { x: 360, y: 96, w: 80, h: 48 }, { x: 392, y: 140, w: 48, h: 20 }, { x: 346, y: 116, w: 24, h: 24 }, // east
      { x: 152, y: 80, w: 32, h: 32 }, // back left
      { x: 280, y: 200, w: 64, h: 32 }, // front right, where the medallion's crack ran
      { x: 128, y: 216, w: 32, h: 24 }, // front left
      // The great collapse, west and east of the middle bridge, short of the east wall.
      { x: 40, y: 332, w: 172, h: 40 }, { x: 72, y: 318, w: 72, h: 18 }, { x: 120, y: 368, w: 64, h: 16 },
      { x: 268, y: 332, w: 132, h: 40 }, { x: 300, y: 368, w: 56, h: 16 }, { x: 328, y: 320, w: 40, h: 14 },
      // Down by the stairs: the floor gone along both walls and in two holes.
      { x: 40, y: 468, w: 52, h: 64 }, { x: 40, y: 450, w: 28, h: 24 },
      { x: 392, y: 500, w: 48, h: 72 }, { x: 372, y: 520, w: 24, h: 28 },
      { x: 300, y: 446, w: 40, h: 26 }, { x: 140, y: 546, w: 40, h: 28 },
    ],
    candles: [[62, 236, 3], [404, 80, 2], [296, 248, 2], [176, 300, 2], [412, 430, 3], [58, 420, 2], [300, 600, 3], [110, 456, 2]],
    medallions: [[CY, 0.68, false]],
    pools: [[CX, CY - 2, 58, 46], [CX, 356, 34, 40]],
    beams: [0, 194],
    heroStart: { x: CX, y: 580 },
    spawns: [{ x: CX, y: 446 }, { x: 120, y: 456 }, { x: 352, y: 516 },
      { x: CX, y: 300 }, { x: 100, y: 410 }, { x: 380, y: 410 },
      { x: CX, y: 92 }, { x: 102, y: 100 }, { x: 392, y: 194 }],
    spots: [{ x: 172, y: 154 }, { x: 306, y: 164 }, { x: 190, y: 226 }, { x: 318, y: 112 },
      { x: 150, y: 290 }, { x: 320, y: 290 }, { x: 150, y: 420 }, { x: 336, y: 420 },
      { x: 196, y: 470 }, { x: 290, y: 540 }, { x: 116, y: 604 }, { x: 350, y: 604 }],
    sections: [440, 248],
    decor: ossuaryDecor,
  },
  // La chapelle aux vitraux: the Order's chapel. Stained glass high in the unseen left wall lays panes of holy light on
  // the floor that burn the vampire (not the ghouls, like a lantern's pool); the mist goes through unharmed. Banks of
  // pews face the altar at the back, low cover from bolts; the gift rises on the altar step. By the stairs, the font of
  // the Order's holy water between two braziers.
  chapel: {
    props: [
      { kind: 'altar', x: CX, y: 104, w: 40, h: 10 },
      { kind: 'brazier', x: 184, y: 100, w: 12, h: 8 },
      { kind: 'brazier', x: 296, y: 100, w: 12, h: 8 },
      ...[156, 192, 228, 300, 336, 372].flatMap((y) => [{ kind: 'pew' as const, x: 140, y, w: 64, h: 8 }, { kind: 'pew' as const, x: 340, y, w: 64, h: 8 }]),
      { kind: 'font', x: CX, y: 504, w: 26, h: 10 },
      { kind: 'brazier', x: 184, y: 488, w: 12, h: 8 },
      { kind: 'brazier', x: 296, y: 488, w: 12, h: 8 },
      { kind: 'pew', x: 120, y: 572, w: 64, h: 8 },
      { kind: 'pew', x: 360, y: 572, w: 64, h: 8 },
    ],
    pits: [],
    candles: [[52, 80, 3], [418, 84, 2], [58, 242, 2], [412, 244, 3], [56, 432, 3], [414, 420, 2], [52, 610, 2], [414, 612, 3]],
    medallions: [],
    pools: [[CX, 120, 30, 18]],
    heroStart: { x: CX, y: 566 },
    spawns: [{ x: CX, y: 452 }, { x: 90, y: 516 }, { x: 390, y: 516 },
      { x: CX, y: 290 }, { x: 74, y: 330 }, { x: 406, y: 306 },
      { x: CX, y: 78 }, { x: 74, y: 210 }, { x: 406, y: 120 }],
    spots: [{ x: 206, y: 222 }, { x: 276, y: 132 }, { x: 88, y: 240 }, { x: 400, y: 92 },
      { x: 206, y: 352 }, { x: 276, y: 290 }, { x: 88, y: 410 }, { x: 400, y: 404 },
      { x: 160, y: 536 }, { x: 320, y: 540 }, { x: 88, y: 470 }, { x: 400, y: 466 }],
    gift: { x: CX, y: 118 },
    windows: [{ x: 196, y: 118 }, { x: 262, y: 166 }, { x: 52, y: 118 }, { x: 384, y: 184 },
      { x: 60, y: 286 }, { x: 214, y: 300 }, { x: 386, y: 268 }, { x: 270, y: 396 },
      { x: 112, y: 452 }, { x: 330, y: 478 }, { x: 56, y: 548 }],
    sections: PARTS,
    decor: chapelDecor,
  },
  // Le cloître sous l'Aube: the garth is open to the Eternal Dawn, which burns the vampire who lingers where it falls;
  // shade protects (the covered walks, the west range's wall, the trees, the well, the hedges, the graves' crosses). The
  // stairs come up into the south walk, the gate is the church door at the back of the north walk, three screens up.
  // Each garden between two galleries has its wave, rising as the hero climbs into it.
  cloister: {
    props: [
      ...ARCADES.flatMap((y) => [{ x: 12, w: 24 }, ...BAYS.slice(1).map((c) => ({ x: c - 20, w: 8 })), { x: CW - 12, w: 24 }] // end piers, piers
        .map((b) => ({ kind: 'block' as const, y, h: ARC.d, ...b }))),
      ...TREES.map((t) => ({ kind: 'block' as const, x: t.x, y: t.y + 2, w: 6, h: 4 })),
      ...GRAVES.map((g) => ({ kind: 'block' as const, x: g.x, y: g.y + 2, w: 6, h: 4 })),
      { kind: 'block', x: WELL.x, y: WELL.y + 8, w: 26, h: 16 },
    ],
    pits: HEDGES,
    candles: [],
    medallions: [],
    pools: [],
    heroStart: { x: CX, y: CFY1 - 28 },
    // A part's spawns lie a few steps ahead of the hero as he comes into it, in view.
    spawns: [{ x: 168, y: 612 }, { x: 348, y: 610 }, { x: 450, y: 690 },
      { x: 120, y: 500 }, { x: 360, y: 494 }, { x: CX, y: 466 },
      { x: 120, y: 214 }, { x: 406, y: 236 }, { x: CX, y: 240 }],
    spots: [{ x: 132, y: 118 }, { x: 348, y: 118 }, { x: 132, y: 348 }, { x: 348, y: 348 }, { x: 132, y: 578 }, { x: 348, y: 578 }, { x: 108, y: 778 }, { x: 372, y: 778 }],
    gift: { x: CX, y: 112 },
    open: true,
    sections: CROSS.map((c) => c - ARC.d), // into a cross gallery's walk
    decor() {},
  },
  // La salle de torture (essai): the "Crasse et faim" trial, in the dark. Four pillars with torches, two floor cages,
  // the body pit halfway up (walkers go round), corpses hung on chains, two drains; see torture.ts.
  torture: {
    props: [
      ...Torture.PILLARS.map(([x, y]) => ({ kind: 'block' as const, x, y, w: 24, h: 12 })),
      ...Torture.CAGES.map(([x, y]) => ({ kind: 'block' as const, x, y, w: 24, h: 12 })),
    ],
    pits: [Torture.PIT],
    candles: [],
    medallions: [],
    pools: [],
    heroStart: { x: CX, y: 566 },
    spawns: [{ x: CX, y: 470 }, { x: 120, y: 560 }, { x: 360, y: 560 },
      { x: CX, y: 280 }, { x: 80, y: 380 }, { x: 400, y: 400 },
      { x: CX, y: 96 }, { x: 120, y: 200 }, { x: 360, y: 200 }],
    spots: [{ x: 176, y: 120 }, { x: 304, y: 120 }, { x: 176, y: 210 }, { x: 304, y: 210 },
      { x: 100, y: 300 }, { x: 300, y: 290 }, { x: 120, y: 410 }, { x: 290, y: 420 },
      { x: 170, y: 520 }, { x: 310, y: 520 }, { x: 160, y: 600 }, { x: 330, y: 600 }],
    sections: PARTS,
    decor() {},
    dark: true,
  },
};

/** The torture room's standing things, each sorted at its feet line like a prop. */
function stand(scene: Phaser.Scene) {
  const put = (key: string, x: number, y: number, t: { w: number; h: number; foot: number; d: Uint8ClampedArray<ArrayBuffer> }) =>
    scene.add.image(x - t.w / 2, y - t.foot, bake(scene, key, t.w, t.h, (p) => p.d.set(t.d))).setOrigin(0).setDepth(y - 11);
  for (const [x, y] of Torture.PILLARS) put('torture-pillar', x, y, Torture.paintPillar());
  for (const [x, y] of Torture.CAGES) put('torture-cage', x, y, Torture.paintCage());
  Torture.HANGING.forEach(([x, y], n) => put(`torture-hanging-${n % 2}`, x, y, Torture.paintHanging(n)));
  put('torture-hungcage', ...Torture.HCAGE, Torture.paintHungCage());
}

/** A stained-glass pane as the light lays it on the floor from the left wall's lancets: an 18 px pointed arch, stretched
 *  and slanted down and to the right. 0 outside, 1 on the lead (mullion, transom, diamond grid), else 2 + its glass's
 *  colour index. */
const PANE = { len: 44, skew: 0.5, hw: 9, R: 13, ys: 13 };
const GLASS = [0xffd75e, 0xfff6d8, P.blood2, 0xc8902a, P.moon2]; // the Order's golds, with red and pale glass
function pane(windows: readonly P[], x: number, y: number) {
  for (const w of windows) {
    const v = y - w.y, u = x - w.x - v * PANE.skew, gy = v / (PANE.len / 40);
    if (v < 0 || v > PANE.len || !inArch(u, gy, 0, PANE.hw, PANE.ys, PANE.R)) continue;
    const a = Math.floor((u + gy + 100) / 7), b = Math.floor((u - gy + 100) / 7), h = hash(a, b, w.x);
    if (Math.abs(u + 0.5) < 1 || Math.abs(gy - 26) < 0.7 || (u + gy + 100) % 7 < 0.8 || (u - gy + 100) % 7 < 0.8) return 1;
    // Mostly gold, white in the arch's head, a few red, bronze and pale blue panes.
    return 2 + (gy < PANE.ys ? (h < 0.6 ? 1 : 0) : h < 0.5 ? 0 : h < 0.65 ? 1 : h < 0.82 ? 2 : h < 0.92 ? 3 : 4);
  }
  return 0;
}

function hallDecor(p: Px) {
  paintWear(p);
  ledger(p, 108, 168, false);
  ledger(p, 346, 160, true);
  paintGore(p);
  skull(p, 70, 152); bone(p, 77, 156, 5); bone(p, 64, 158, 4, true);
  skull(p, 424, 128); bone(p, 416, 132, 6);
  skull(p, 120, 250); bone(p, 404, 248, 5); bone(p, 292, 84, 4);
  // Down the room: the tombs' graves set in the floor either side of the way up, between the coffins and the stumps.
  ledger(p, 190, 296, false);
  ledger(p, 262, 300, true);
  ledger(p, 186, 372, false);
  ledger(p, 266, 376, false);
  ledger(p, 54, 292, true);
  ledger(p, 398, 300, false);
  const R = rng(9);
  crackAt(p, R, 300, 606, -1.9, 22);
  crackAt(p, R, 418, 548, 2.3, 18);
  crackAt(p, R, 132, 446, -0.3, 16);
  crackAt(p, R, 246, 420, 1.3, 14);
  crackAt(p, R, 60, 290, 0.9, 14);
  chips(p, [[344, 440], [126, 338], [184, 594], [296, 256], [56, 520], [404, 412]]);
  rubble(p, [[402, 496, 7, 4], [412, 500, 5, 3], [396, 504, 4, 3], [374, 498, 4, 3], [416, 492, 3, 2],
    [322, 348, 5, 3], [330, 352, 6, 4], [318, 357, 3, 2], [186, 348, 5, 3], [152, 352, 4, 3]]);
  // Dragged from the open coffin by the stairs' way, and spilled round the small medallion.
  pool(p, 350, 316, 11, 5, 34);
  for (let i = 0; i < 7; i++) splat(p, 336 - i * 10, 324 + i * 6 + Math.sin(i) * 2, 3.2 - i * 0.3, 140 + i, P.blood0, mix(P.blood0, P.blood1, 0.5));
  pool(p, 70, 592, 13, 6, 35);
  pool(p, 134, 400, 8, 4, 36);
  splat(p, 204, 506, 4, 56, P.blood0, P.blood1, P.blood2);
  splat(p, 282, 572, 3, 57, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 126, 452, 4, 58, P.blood0, mix(P.blood0, P.blood1, 0.4));
  splat(p, 360, 446, 3, 59, P.blood0, P.blood1);
  skull(p, 66, 462); bone(p, 73, 466, 5); bone(p, 60, 468, 4, true);
  skull(p, 422, 572); bone(p, 414, 576, 6);
  skull(p, 236, 266); bone(p, 344, 612, 5); bone(p, 60, 362, 4, true); skull(p, 420, 420);
}

/** The nave's runner: a rotten crimson carpet from the stairs to the gate, frayed, stained and worn bald in places,
 *  running under the rosettes. */
function runner(p: Px) {
  const x0 = CX - 16, x1 = CX + 16, under = (x: number, y: number) => LAYOUT.nave.medallions.some(([cy, s]) => Math.hypot(x + 0.5 - CX, y + 0.5 - cy) < 50 * s + 3);
  for (let y = FY0 + 3; y < FY1; y++)
    for (let x = x0; x < x1; x++) {
      if (under(x, y)) continue;
      const e = Math.min(x - x0, x1 - 1 - x); // 0 on its edges
      if (e < 2 && noise(x, y, 3, 71) > 0.6 - e * 0.1) continue; // frayed
      const dx = Math.abs(x + 0.5 - CX), dy = Math.abs(((y - FY0 + 8) % 16) - 7.5), diamond = dx + dy;
      let c = e === 0 ? mix(P.blood0, P.void0, 0.4) : e === 3 ? P.blood1 : P.blood0;
      if (diamond <= 4 && diamond > 2) c = mix(P.blood1, P.bone1, 0.25); // a lozenge every slab
      if (diamond <= 1) c = P.blood1;
      if (noise(x, y, 4, 72) > 0.8) c = mix(c, P.floor1, 0.45); // worn bald
      p.p(x, y, c);
      if (noise(x, y, 4, 73) > 0.76) p.tint(x, y, P.void0, 0.3); // stains
    }
  // It lies on the slabs: a hairline of shadow along its right edge.
  for (let y = FY0 + 3; y < FY1; y++) if (!under(x1, y)) p.tint(x1, y, P.void0, 0.4);
  // Rucked up in a few folds: a lit crest, a dark trough.
  for (const y of [102, 206, 228, 306, 362, 472, 538, 596])
    for (let x = x0 + 1; x < x1 - 1; x++) { p.tint(x, y - 1, P.blood2, 0.25); p.tint(x, y, P.void0, 0.35); }
}

function naveDecor(p: Px) {
  runner(p);
  const R = rng(61);
  crackAt(p, R, 118, 226, -0.5, 18);
  crackAt(p, R, 372, 100, 2.6, 16);
  crackAt(p, R, 206, 238, -1.6, 12);
  crackAt(p, R, 290, 150, 1.2, 14);
  chips(p, [[72, 112], [328, 232], [408, 164], [136, 64], [264, 80]]);
  grit(p, R, 120, (x) => Math.abs(x - CX) > 18);
  // Graves set in the aisle floors.
  ledger(p, 56, 150, false);
  ledger(p, 350, 172, true);
  // The snapped pillars' fallen drums, broken up on the floor.
  rubble(p, [[184, 160, 6, 4], [192, 166, 4, 3], [180, 172, 3, 2], [326, 158, 5, 3], [334, 164, 7, 4], [186, 214, 5, 3], [196, 220, 4, 3], [146, 228, 6, 4], [292, 212, 4, 3], [328, 230, 5, 3]]);
  // Spilled from the open coffin and dragged across the aisle.
  pool(p, 372, 154, 10, 5, 62);
  for (let i = 0; i < 6; i++) splat(p, 360 - i * 9, 160 + i * 4 + Math.sin(i) * 2, 3 - i * 0.35, 63 + i, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 214, 196, 4, 70, P.blood0, P.blood1, P.blood2);
  splat(p, 120, 178, 3, 71, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 268, 112, 3, 72, P.blood0, P.blood1);
  skull(p, 66, 186); bone(p, 72, 191, 5); bone(p, 60, 190, 4, true);
  skull(p, 418, 112); bone(p, 410, 117, 6);
  skull(p, 136, 248); bone(p, 344, 250, 5); bone(p, 150, 84, 4);
  // Down the nave: more graves in the aisles, the drums of the snapped pillars, and one pillar fallen whole across the
  // left aisle by the stairs, its plinth left standing as a stub.
  ledger(p, 60, 404, false);
  ledger(p, 372, 300, true);
  ledger(p, 64, 528, true);
  ledger(p, 380, 400, false);
  const S = rng(64);
  crackAt(p, S, 120, 470, -0.4, 18);
  crackAt(p, S, 370, 524, 2.5, 16);
  crackAt(p, S, 206, 600, -1.5, 12);
  crackAt(p, S, 288, 446, 1.1, 14);
  crackAt(p, S, 110, 280, 0.4, 14);
  chips(p, [[70, 352], [330, 470], [408, 440], [136, 580], [264, 312], [404, 610]]);
  grit(p, S, 220, (x) => Math.abs(x - CX) > 18);
  rubble(p, [[184, 272, 6, 4], [192, 278, 4, 3], [326, 270, 5, 3], [334, 276, 7, 4], [182, 328, 5, 3], [150, 340, 4, 3],
    [326, 330, 4, 3], [296, 342, 5, 3], [184, 498, 5, 3], [190, 506, 4, 3], [326, 494, 6, 4], [336, 502, 4, 3], [292, 508, 3, 2],
    [326, 552, 5, 3], [298, 566, 4, 3]]);
  rubble(p, [[158, 553, 20, 7], [182, 562, 5, 3], [76, 572, 4, 3], [80, 560, 3, 2], [148, 574, 5, 3], [100, 580, 3, 2]]); // its plinth's stub, broken to the floor
  pool(p, 382, 572, 10, 5, 65);
  for (let i = 0; i < 5; i++) splat(p, 368 - i * 9, 566 - i * 6, 3 - i * 0.4, 75 + i, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 214, 460, 4, 80, P.blood0, P.blood1, P.blood2);
  splat(p, 120, 336, 3, 81, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 268, 552, 3, 82, P.blood0, P.blood1);
  pool(p, 90, 440, 8, 4, 83);
  skull(p, 70, 470); bone(p, 76, 475, 5);
  skull(p, 412, 336); bone(p, 404, 341, 6); bone(p, 60, 612, 5);
  skull(p, 140, 300); skull(p, 402, 518); bone(p, 396, 524, 4, true);
}

function ossuaryDecor(p: Px) {
  const L = LAYOUT.ossuary, R = rng(81);
  // The collapse began at the drain: a crack runs from it to the hole by the front.
  crackAt(p, R, CX + 4, CY + 5, 0.9, 64, 0.25, 0.8);
  crackAt(p, R, CX - 6, CY - 2, 3.5, 30, 0.4, 0.8);
  // Cracks spread from every hole.
  crackAt(p, R, 122, 140, -0.3, 20);
  crackAt(p, R, 92, 202, 1.3, 14);
  crackAt(p, R, 356, 120, 3.0, 18);
  crackAt(p, R, 388, 162, 2.0, 14);
  crackAt(p, R, 186, 94, 0.2, 12);
  crackAt(p, R, 162, 228, 0.1, 14);
  crackAt(p, R, 346, 214, 0.4, 16);
  // And from the great collapse and the holes by the stairs.
  crackAt(p, R, 214, 330, -1.2, 22, 0.5, 0.7);
  crackAt(p, R, 268, 374, 1.6, 26, 0.5, 0.7);
  crackAt(p, R, 404, 352, 1.4, 16);
  crackAt(p, R, 94, 492, 0.2, 18);
  crackAt(p, R, 390, 540, 2.9, 16);
  crackAt(p, R, 180, 560, 0.3, 14);
  crackAt(p, R, 336, 460, 2.2, 14);
  chips(p, [[216, 222], [296, 64], [120, 64], [344, 176], [72, 104], [180, 288], [410, 410], [232, 588], [96, 600], [320, 504]]);
  grit(p, R, 380, () => true);
  // Slabs broken up around the holes.
  rubble(p, [[124, 150, 6, 4], [130, 158, 4, 3], [122, 178, 3, 2], [96, 204, 5, 3], [348, 108, 5, 3], [352, 132, 4, 3],
    [380, 166, 6, 4], [190, 104, 4, 3], [186, 82, 3, 2], [270, 216, 4, 3], [274, 204, 3, 2], [348, 238, 6, 4], [164, 236, 4, 3],
    [206, 318, 4, 3], [148, 312, 5, 3], [214, 384, 6, 4], [272, 390, 4, 3], [374, 314, 5, 3], [362, 390, 4, 3], [98, 470, 5, 3],
    [96, 532, 4, 3], [342, 460, 4, 3], [366, 506, 6, 4], [186, 556, 4, 3], [136, 578, 5, 3]]);
  // The dead spilled out of the fallen ossuary niches: a skull and its bones here and there, none on the medallion.
  const S = rng(83), pit = (x: number, y: number) => L.pits.some((b) => x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(FX0 + 20 + S() * (FX1 - FX0 - 40)), y = Math.floor(FY0 + 8 + S() * (FY1 - FY0 - 30)), k = S();
    if (pit(x, y) || Math.hypot(x - CX, y - CY) < 44 || Math.abs(x - CX) < 18 || L.props.some((b) => Math.abs(x - b.x) < 20 && Math.abs(y - b.y) < 14)) continue;
    skull(p, x, y);
    if (k < 0.3) bone(p, x + 6, y + 1 + Math.floor(k * 12), 5);
    else if (k < 0.55) bone(p, x - 6, y + 4, 5), bone(p, x + 1, y + 6, 4, true);
    else if (k < 0.8) skull(p, x + 5, y + 2), bone(p, x - 3, y + 7, 6);
    else bone(p, x + 6, y - 2, 6, true);
  }
  splat(p, 222, 196, 4, 84, P.blood0, P.blood1, P.blood2);
  splat(p, 330, 150, 3, 85, P.blood0, mix(P.blood0, P.blood1, 0.5));
  pool(p, 98, 236, 10, 5, 86);
  splat(p, 236, 420, 4, 87, P.blood0, P.blood1, P.blood2);
  splat(p, 120, 300, 3, 88, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 330, 590, 4, 89, P.blood0, P.blood1);
  pool(p, 372, 432, 9, 4, 90);
}

function chapelDecor(p: Px) {
  const R = rng(101);
  crackAt(p, R, 120, 248, -1.2, 14);
  crackAt(p, R, 420, 150, 2.4, 16);
  crackAt(p, R, 300, 238, -1.8, 12);
  crackAt(p, R, 100, 400, -0.6, 16);
  crackAt(p, R, 410, 350, 2.2, 14);
  crackAt(p, R, 290, 610, -1.6, 14);
  crackAt(p, R, 70, 500, 0.8, 12);
  chips(p, [[72, 170], [330, 76], [150, 72], [420, 220], [72, 362], [404, 520], [180, 604], [300, 420]]);
  grit(p, R, 250, (x) => Math.abs(x - CX) > 30);
  // The font's round step, worn pale where the faithful knelt.
  p.ellipse(CX, 500, 24, 13, P.stone1);
  p.ellipse(CX, 499, 21, 11, mix(P.stone1, P.stone2, 0.5));
  engrave(p, (x, y) => Math.abs(Math.hypot((x + 0.5 - CX) / 24, (y + 0.5 - 500) / 13) - 1) < 0.05, CX - 26, 486, CX + 26, 514, 0.5);
  // The altar's dais: two pale steps the gift rises from.
  for (const [d, c] of [[0, P.stone1], [3, P.stone2]] as const) {
    p.rect(CX - 30 + d * 2, 96 + d, 60 - d * 4, 28 - d * 2, c);
    p.rect(CX - 30 + d * 2, 96 + d, 60 - d * 4, 1, mix(c, P.bone0, 0.4));
    p.rect(CX - 30 + d * 2, 123 - d, 60 - d * 4, 1, mix(c, P.void0, 0.5));
  }
  engrave(p, (x, y) => Math.abs(Math.hypot(x + 0.5 - CX, (y + 0.5 - 118) * 1.6) - 7) < 0.6, CX - 10, 110, CX + 10, 126, 0.5);
  // Glass the Order's windows lost, glinting on the slabs, and the blood of whoever prayed here last.
  for (let i = 0; i < 110; i++) {
    const x = FX0 + 8 + Math.floor(R() * (FX1 - FX0 - 16)), y = FY0 + 6 + Math.floor(R() * (FY1 - FY0 - 12));
    if (Math.abs(x - CX) < 34 && y < 126) continue;
    p.p(x, y, GLASS[Math.floor(R() * GLASS.length)]);
    p.tint(x + 1, y + 1, P.void0, 0.4);
  }
  pool(p, 104, 176, 9, 4, 102);
  splat(p, 362, 214, 4, 103, P.blood0, P.blood1, P.blood2);
  splat(p, 170, 132, 3, 104, P.blood0, mix(P.blood0, P.blood1, 0.5));
  skull(p, 424, 236); bone(p, 416, 240, 5);
  skull(p, 60, 136); bone(p, 66, 141, 4, true);
  pool(p, 380, 352, 9, 4, 105);
  splat(p, 150, 316, 3, 106, P.blood0, P.blood1, P.blood2);
  splat(p, 300, 540, 4, 107, P.blood0, mix(P.blood0, P.blood1, 0.5));
  splat(p, 196, 456, 3, 108, P.blood0, P.blood1);
  skull(p, 420, 548); bone(p, 412, 552, 5);
  skull(p, 64, 392); bone(p, 70, 397, 4, true); bone(p, 250, 612, 5);
}

/** Light sources baked into the background; braziers also get a flickering overlay. */
const LANCETS = [CX - 100, CX + 100];

function paintLight(p: Px, L: Layout) {
  // The hall sinks into darkness away from the light: ragged stepped bands from the edges in.
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const d = Math.min(x - FX0, (FX1 - 1 - x) * 1.2, (y - FY0) * 2.4, (FY1 - 1 - y) * 1.6) + (noise(x, y, 18, 12) - 0.5) * 18;
      p.tint(x, y, P.void0, d < 8 ? 0.5 : d < 30 ? 0.28 : 0);
    }
  // Each lancet lands on the floor as its own shape, mullion and transom included, slanting right.
  for (let y = FY0; y < FY0 + 60; y++) for (let x = FX0; x < FX1; x++) p.glow(x, y, P.moon1, lancetSpill(x, y) * 0.2);
  // Moonlight pouring through the gate, striped by the portcullis.
  for (let y = FY0; y < FY0 + 100; y++) for (let x = CX - 60; x < CX + 80; x++) p.glow(x, y, P.moon1, gateSpill(x, y) * 0.3);
  // The great moon pool on the medallion, and those down the room.
  for (const q of L.pools) light(p, ...q, P.moon1, [0.15, 0.32], 0.06, 4, 22);
  // Warm pools on the floor and the wall behind: fire pulls the cold floor toward its own colour, so it reads warm on blue.
  for (const b of L.props) if (b.kind === 'brazier') light(p, b.x, b.y - 14, 38, 30, mix(P.fire, P.blood2, 0.3), [0.12, 0.24, 0.36], 0.08, b.x, 12, 'tint');
  for (const [x, y, n] of L.candles) light(p, x + n * 1.5, y - 2, 10 + n * 2, 7 + n * 2, P.fire, [0.14, 0.28], 0.06, x, 8, 'tint');
  // Holy light through stained glass: the glass's colour laid over the slabs, the lead dark, a faint bleed of gold round it.
  const W = L.windows ?? [];
  if (W.length) for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const k = pane(W, x, y);
      if (k) p.p(x, y, k === 1 ? mix(p.get(x, y), P.void0, 0.25) : mix(GLASS[k - 2], p.get(x, y), 0.3));
      else if ([[-2, 0], [2, 0], [0, -2], [0, 2]].some(([i, j]) => pane(W, x + i, y + j))) p.glow(x, y, 0xffd75e, 0.1);
    }
}

/** Shadows cast by the props, toward the bottom right. */
function paintShadows(p: Px, props: Prop[]) {
  for (const o of props) {
    const l = o.x - o.w / 2, r = o.x + o.w / 2;
    const reach = o.kind === 'pillar' ? Math.min(34, Math.round((o.tall ?? 140) / 4)) : o.kind === 'stump' ? Math.round(((o.tall ?? 58) * 18) / 58) : o.kind === 'brazier' ? 10 : o.kind === 'heap' ? 8 : 9;
    p.fill(l - 2, o.y - o.h, r + reach * 1.2, o.y + reach * 0.6, (x, y) => {
      const t = (y - o.y + o.h * 0.5) / (reach * 0.6);
      return t >= -0.6 && t <= 1 && x >= l + t * reach * 0.9 && x <= r + t * reach * 1.1;
    }, P.void0, 0.45);
  }
}

/** Signed distance from the union of `boxes` to a point: negative inside. */
const boxDist = (boxes: Box[], x: number, y: number) => Math.min(...boxes.map((b) => {
  const dx = Math.max(b.x - x, x - b.x - b.w), dy = Math.max(b.y - y, y - b.y - b.h);
  return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy);
}));

/** Holes where the floor fell into the abyss, painted over the lit floor. Seen from the front and above: the far edge
 *  shows the broken slab and the earth under it, then the dark goes down to a magenta glow; the near lip overhangs.
 *  Each hole sits 1 to 4 px inside its boxes, so whoever stops at a box's edge stands on the brink, not over the void. */
function paintPits(p: Px, pits: Box[]) {
  if (!pits.length) return;
  const hole = (x: number, y: number) => boxDist(pits, x + 0.5, y + 0.5) < -2 + noise(x, y, 6, 91) * 4.5 + noise(x, y, 2, 92) * 1.5;
  const x0 = Math.min(...pits.map((b) => b.x)) - 8, x1 = Math.max(...pits.map((b) => b.x + b.w)) + 8;
  const y0 = Math.min(...pits.map((b) => b.y)) - 8, y1 = Math.max(...pits.map((b) => b.y + b.h)) + 8;
  for (let x = x0; x <= x1; x++) {
    let t = -1, top = 0;
    for (let y = y0; y <= y1; y++) {
      if (!hole(x, y)) { t = -1; continue; }
      if (++t === 0) top = p.get(x, y - 1);
      let c: number;
      if (t === 0) c = mix(top, P.stone2, 0.35); // the broken edge catches the light
      else if (t < 4) c = mix(top, P.void0, 0.15 + t * 0.1); // the slab's thickness
      else if (t === 4) c = P.void1;
      else if (t < 11) c = hash(x, y, 94) > 0.88 ? P.stone0 : t < 8 ? P.wall0 : mix(P.wall0, P.void0, 0.5); // earth and rubble under it
      else {
        // Then the dark, down to the glow of the abyss in ragged bands: the deeper one looks, the nearer the edge.
        const d = t - 11 + (noise(x, y, 5, 93) - 0.5) * 7;
        c = d < 4 ? P.void1 : d < 16 ? P.void0 : d < 28 ? P.abyss0 : d < 40 ? mix(P.abyss0, P.abyss1, 0.5) : P.abyss1;
        if (d >= 8 && hash(x, y, 96) > 0.985) c = P.abyss2; // embers far below
      }
      if (t > 2 && !hole(x - 1, y)) c = P.void0; // inner wall facing away from the light
      else if (t > 2 && !hole(x + 1, y)) c = mix(c, P.stone0, 0.5); // inner wall facing it
      if (!hole(x, y + 1)) c = P.void0; // in the shadow of the near lip
      p.p(x, y, c);
    }
  }
  // A few slabs that went down with the floor, caught tilted on the way: the top face lit at its upper edge and
  // darker down its slope, its broken thickness below, the dark under it.
  for (const [sx, sy, w, h, skew] of [[54, 150, 20, 13, 0.45], [404, 118, 18, 12, -0.5], [298, 212, 16, 10, 0.35], [58, 182, 12, 8, -0.3],
    [96, 340, 22, 13, 0.4], [330, 344, 18, 12, -0.45], [168, 352, 14, 9, 0.3], [404, 520, 16, 11, 0.3], [48, 488, 14, 9, -0.3]])
    for (let j = 0; j < h + 3; j++)
      for (let i = 0; i < w; i++) {
        const x = Math.round(sx + i + j * skew), y = sy + j;
        if (!hole(x, y) || !hole(x, y - 1)) continue;
        const face = j < 2 ? mix(P.floor3, P.stone2, 0.25) : j < h * 0.55 ? P.floor2 : P.floor1;
        const c = j >= h + 2 ? P.void0 : j >= h ? mix(P.floor1, P.void0, 0.55) : i === 0 ? mix(face, P.stone2, 0.2) : i === w - 1 ? mix(face, P.void0, 0.4) : face;
        p.p(x, y, j < h && (i * 7 + j * 3) % 23 === 0 ? mix(c, P.void0, 0.3) : c); // a few pits in the stone
      }
  // Around each hole: the near lip's broken edge, then a faint glow of the abyss on the floor.
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (hole(x, y)) continue;
      if (hole(x, y - 1)) p.tint(x, y, P.stone2, 0.4);
      else if (hole(x - 1, y) || hole(x + 1, y)) p.tint(x, y, P.stone2, 0.2);
      const d = boxDist(pits, x + 0.5, y + 0.5) + (noise(x, y, 4, 95) - 0.5) * 3;
      if (d < 7) p.tint(x, y, P.abyss2, d < 2.5 ? 0.22 : 0.1);
    }
}

function paintBackground(p: Px, L: Layout, bars = true) {
  // Beyond the side walls: a crimson dark with pillars receding into it.
  p.rect(0, 0, p.w, p.h, P.abyss1);
  for (const x of [4, 18, 462, 476]) {
    p.rect(x - 4, 0, 8, p.h, P.abyss0);
    p.rect(x - 4, 0, 1, p.h, P.abyss2);
  }
  paintFloor(p);
  for (const [y, s, frame] of L.medallions) medallion(p, s, frame, y);
  L.decor(p);
  paintShadows(p, L.props);
  paintBackWall(p, bars);
  // Side wall tops (seen from above): the right wall's inner rim faces the light, the left one's is in shadow.
  for (const x of [FX0 - 12, FX1]) wallTop(p, x, 0, 12, p.h);
  p.rect(FX1, 9, 1, p.h, P.stone0);
  p.rect(FX0 - 12, 0, 1, p.h, P.stone0);
  p.rect(FX0 - 1, 9, 1, p.h, P.void0);
  p.rect(FX0, FY0, 2, FY1 - FY0, P.void0, 0.4);
  for (const [x, y, n] of L.candles) candles(p, x, y, n, x * 7 + y);
  cobweb(p, FX1 - 1, 10, 22);
  paintLight(p, L);
  paintPits(p, L.pits);
}

// ---------- the cloister: open to the sky ----------

// What stands in the cloister, as one model in floor coordinates, casts every shade the Eternal Dawn leaves: the
// ground's look, Room.holy() and the lit and dark sides of what stands all read it.
const SUN = { x: 1.2, y: 0.6 }; // low, from the upper left: a shadow runs this far right and down per pixel of height

// Along an arcade: how far from the nearest bay's centre; true in an opening (the end walls have none).
const bayOffset = (x: number) => x + 0.5 - BAYS[0] - 40 * Math.round((x + 0.5 - BAYS[0]) / 40);
const opening = (x: number, h: number) => x >= BAYS[0] - ARC.r && x < BAYS[BAYS.length - 1] + ARC.r && Math.abs(bayOffset(x)) < ARC.r
  && (h < ARC.spring || Math.hypot(bayOffset(x), h - ARC.spring) < ARC.r);

/** A tree at a point: 1 in its canopy (an ellipsoid with a leafy, ragged skin), 2 in its trunk, else 0. */
function treeAt(t: Tree, x: number, y: number, h: number) {
  const d = ((x - t.x) / t.rx) ** 2 + ((y - t.y) / t.ry) ** 2 + ((h - t.h) / t.rh) ** 2;
  if (d < 1.5 && d < 1 - (noise(x + h * 0.8, y - h * 0.5, 4, t.seed) - 0.5) * 0.9) return 1;
  return Math.abs(x - t.x) < 2.5 && Math.abs(y - t.y) < 2 && h < t.h ? 2 : 0;
}

/** The well: 3 its stone rim, 6 the water down in it, 4 its oak posts, axle and gable ends, 5 and 7 the west and east
 *  slopes of its little tiled roof; else 0. */
function wellAt(x: number, y: number, h: number) {
  const dx = Math.abs(x - WELL.x), dy = Math.abs(y - WELL.y), r = Math.hypot(dx / 13, dy / 8);
  if (r < 1 && h < 9) return r > 0.72 ? 3 : h < 4 ? 6 : 0;
  if (Math.abs(dx - 11) < 1.5 && dy < 1.5 && h < 26) return 4;
  if (dx < 11 && dy < 1 && Math.abs(h - 22) < 1) return 4;
  if (dx < 16 && dy < 9 && h >= 31 - dx * 0.5 && h < 34 - dx * 0.5) return dy > 8 ? 4 : x < WELL.x ? 5 : 7; // gable end, slopes
  return 0;
}

const hedgeAt = (x: number, y: number, h: number) => (h < 9 && HEDGES.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ? 8 : 0);

/** A grave's stone cross, facing south: 9 its stone (a stepped base, the shaft, the arms), else 0. */
const crossAt = (g: P, x: number, y: number, h: number) => {
  const dx = Math.abs(x - g.x), dy = Math.abs(y - g.y);
  return (h < 2 && dx < 3 && dy < 2) || (dy < 1 && (dx < 1 ? h < 15 : dx < 4 && h >= 9 && h < 11)) ? 9 : 0;
};


type Solid = (x: number, y: number, h: number) => unknown;
let NEAR: Solid[][] | undefined; // what stands in the garth, by 16 px cell from (-64, -64), 40 cells across
/** The trees, hedges, crosses or well whose footprint may reach the floor point: the model's rays test only those. */
function near(x: number, y: number) {
  if (!NEAR) {
    const all: [Box, Solid][] = [
      ...TREES.map((t): [Box, Solid] => [{ x: t.x - t.rx * 1.25, y: t.y - t.ry * 1.25, w: t.rx * 2.5, h: t.ry * 2.5 },
        (x, y, h) => Math.abs(h - t.h) < t.rh * 1.25 && treeAt(t, x, y, h)]), // the canopy: its trunk casts no shade worth it
      ...HEDGES.map((b): [Box, Solid] => [b, hedgeAt]),
      ...GRAVES.map((g): [Box, Solid] => [{ x: g.x - 4, y: g.y - 2, w: 8, h: 4 }, (x, y, h) => crossAt(g, x, y, h)]),
      [{ x: WELL.x - 16, y: WELL.y - 9, w: 32, h: 18 }, wellAt],
    ];
    NEAR = Array.from({ length: 40 * 60 }, (_, c) => {
      const x = (c % 40) * 16 - 64, y = Math.floor(c / 40) * 16 - 64;
      return all.filter(([b]) => b.x < x + 16 && b.x + b.w > x && b.y < y + 16 && b.y + b.h > y).map(([, s]) => s);
    });
  }
  const i = Math.floor((x + 64) / 16), j = Math.floor((y + 64) / 16);
  return i >= 0 && i < 40 && j >= 0 && j < 60 ? NEAR[j * 40 + i] : [];
}

function solid(x: number, y: number, h: number) {
  if (x < 0 && h < 52) return true; // the west range's wall, just off the screen
  if (h >= ARC.top) { if (h < ARC.eave && roofed(y)) return true; } // the walks' roofs
  else if (ARCADES.some((a) => y >= a - ARC.d && y < a) && !opening(x, h)) return true; // arcades
  for (const s of near(x, y)) if (s(x, y, h)) return true;
  return false;
}

/** True when nothing stands between the point and the Dawn; `from`: how far toward it to start looking. */
function sunlit(x: number, y: number, h: number, from = 1) {
  for (let u = from; h + u < 72; u++) if (solid(x - SUN.x * u, y - SUN.y * u, h + u)) return false;
  return true;
}

let SKY: Uint8Array | undefined; // the floor in the Dawn's light, 1 per pixel, worked out once
/** True on a floor pixel the Dawn burns. */
function dawn(x: number, y: number) {
  if (!SKY) {
    SKY = new Uint8Array(CW * (CFY1 - FY0));
    for (let j = 0; j < CFY1 - FY0; j++) for (let i = 0; i < CW; i++) SKY[j * CW + i] = sunlit(i + 0.5, FY0 + j + 0.5, 0, 0.5) ? 1 : 0;
  }
  x = Math.floor(x); y = Math.floor(y);
  return x >= 0 && x < CW && y >= FY0 && y < CFY1 && SKY[(y - FY0) * CW + x] === 1;
}

/** The Dawn on a colour: it soaks the blue away and pours pale gold on. Shade: the same colour sunk in the cool night. */
const inSun = (c: number) => mix(mix(c, 0xffd75e, 0.5), 0xfff6d8, 0.3);
const inShade = (c: number) => mix(mix(c, P.floor1, 0.55), P.void0, 0.25);

/** Paints what `at` makes stand (a material per point, 0 for air) as the camera sees it, into the box x0, y0, x1, y1 of
 *  p, whose pixel (0, 0) is the screen point (ox, oy): down each pixel's line of sight, the first solid point. All of it
 *  stands on the floor between y0 and y1 (the sight lines are only followed there). */
function render(p: Px, ox: number, oy: number, at: (x: number, y: number, h: number) => number, box = [0, 0, p.w, p.h], y0 = -1e9, y1 = 1e9) {
  for (let j = box[1]; j < box[3]; j++)
    for (let i = box[0]; i < box[2]; i++)
      for (let h = Math.min(72, Math.floor((y1 - oy - j - 0.5) * 2) / 2); h >= 0 && oy + j + 0.5 + h >= y0; h -= 0.5) {
        const x = ox + i + 0.5, y = oy + j + 0.5 + h, m = at(x, y, h);
        if (m) { p.p(i, j, standing(m, x, y, h)); break; }
      }
}

/** The colour of a point of what stands, by its material, lit or in shade. */
function standing(m: number, x: number, y: number, h: number) {
  const lit = sunlit(x, y, h), n = noise(x + h, y - h, 3, m), k = hash(Math.floor(x), Math.floor(y - h), m);
  switch (m) {
    case 1: return lit ? (n > 0.62 ? 0xbfb45a : n > 0.38 ? 0x7d8a3a : 0x4f6230) : n > 0.55 ? 0x183842 : 0x0f2128; // leaves
    case 2: return lit ? 0x8c5a1e : k > 0.5 ? 0x3c2418 : 0x2a1810; // bark
    case 3: { const c = h > 8 ? 0xc0b4a0 : k > 0.8 ? 0x8a7c74 : 0xa89a8c; return lit ? inSun(c) : mix(inShade(c), c, 0.3); } // rim stones
    case 9: { const c = h < 2 ? 0x8a7c74 : k > 0.75 ? 0x9c8e86 : 0xb0a290; return lit ? inSun(c) : mix(inShade(c), c, 0.3); } // a cross
    case 4: return lit ? 0xa66a3a : 0x3c2418; // oak
    case 5: case 7: { // tiles, in rows down the slope; the west slope faces the Dawn
      const c = Math.floor(Math.abs(x - WELL.x)) % 3 === 2 ? P.wall0 : m === 5 ? P.wall2 : P.wall1;
      return lit && m === 5 ? mix(c, 0xffd75e, 0.4) : inShade(c);
    }
    case 6: return lit && k > 0.7 ? 0xfff6d8 : lit ? P.moon0 : P.void1; // water, the sky glinting on it
    default: return lit ? (n > 0.5 ? 0x8f913f : 0x5f6e35) : n > 0.5 ? 0x1f4a5a : 0x14303a; // clipped box
  }
}

/** An arcade seen from the south, its feet line at `a`: paired colonnettes, round arches of alternating pale and red
 *  voussoirs, a cornice and the edge of the walk's tiled roof, which runs `roof` rows back over it (a cross gallery's,
 *  seen from above; one row per pixel of floor). Its face is in shade; the flanks and tops the Dawn reaches are lit (the
 *  model says which). */
function paintArcade(p: Px, a: number, roof = 0) {
  const H = ARC.eave + roof, wall = a - ARC.d / 2;
  for (let j = 0; j <= H; j++)
    for (let i = 0; i < p.w; i++) {
      const x = i, h = H - j, end = x < BAYS[0] - ARC.r || x >= BAYS[BAYS.length - 1] + ARC.r;
      const o = bayOffset(x); // from the nearest bay's centre
      const lx = x + 0.5 - 60 - 40 * Math.round((x + 0.5 - 60) / 40); // from the nearest pier's centre
      const rr = Math.hypot(o, h - ARC.spring), turn = (Math.atan2(h - ARC.spring, o) / Math.PI) * 9;
      let c = -1, top = false, flank = false, deep = 0; // deep: how far a gap between tiles stays dark in the light
      if (h > ARC.eave) { // a cross gallery's gabled roof from above, `r` rows back: the long south slope, the ridge, the north slope
        const r = h - ARC.eave, ridge = Math.round(roof * 0.7), u = (x + 600) % 6; // rows of Roman tiles, 6 px apart
        if (r === roof) { c = P.wall0; deep = 0.5; } // the far eave
        else if (r > ridge + 1) { c = u === 5 ? P.wall1 : mix(P.wall2, P.bone1, 0.15); deep = u === 5 ? 0.3 : 0; } // facing the Dawn
        else if (r === ridge + 1) c = x % 8 ? mix(P.wall2, P.bone1, 0.25) : P.wall1; // ridge tiles
        else if (r === ridge) { c = P.wall0; deep = 0.5; }
        else { c = u === 5 ? P.wall0 : u === 0 ? P.wall2 : P.wall1; deep = u === 5 ? 0.5 : r % 4 === 0 ? 0.3 : u === 4 ? 0.15 : 0; } // courses of tiles
        top = true;
      } else if (h >= 37) { // the roof: rounded tile ends, then the tiles running back
        c = h < 39 ? ((x + (h === 38 ? 2 : 0)) % 4 === 0 ? P.wall0 : h === 38 ? P.wall2 : P.wall1) : (x + Math.floor(h / 2) * 2) % 4 === 0 ? P.wall1 : h % 2 ? P.wall2 : mix(P.wall1, P.wall2, 0.5);
        top = h >= 39;
      } else if (h >= 34) { c = h === 34 ? 0x7a6c66 : 0xc0b4a0; top = h === 36; } // cornice
      else if (end) c = (x + (Math.floor(h / 6) % 2) * 6) % 12 === 0 || h % 6 === 5 ? 0x7a6c66 : 0xa89a8c; // the walk's end wall
      else if (h < ARC.spring) {
        if (h >= 13 && Math.abs(lx) < 4 + (h - 12)) { c = h === 15 ? 0xc0b4a0 : 0xa89a8c; top = h === 15; flank = lx < -2 - (h - 12); } // capital
        else if (h < 2 && Math.abs(lx) < 4.5) { c = 0xa89a8c; top = h === 1; } // base
        else if (Math.abs(lx) > 0.5 && Math.abs(lx) < 3.5) { c = Math.abs(lx) > 2.5 ? (lx < 0 ? 0xc0b4a0 : 0x7a6c66) : 0xa89a8c; flank = lx < -2.5 || (lx > 0.5 && lx < 1.5); } // the paired shafts
      } else if (rr >= ARC.r && rr < ARC.r + 3) c = rr > ARC.r + 2.5 || Math.abs(turn % 1) < 0.08 ? 0x7a6c66 : Math.floor(turn) % 2 ? 0x9a5a5e : 0xb0a290; // voussoirs
      else if (rr >= ARC.r) { // spandrel: small coursed ashlar
        const bx = x + (Math.floor(h / 5) % 2) * 5;
        c = bx % 10 === 0 || h % 5 === 4 ? 0x7a6c66 : hash(Math.floor(bx / 10), Math.floor(h / 5), 7) < 0.3 ? 0x9c8e86 : 0xa89a8c;
      }
      if (c < 0) continue;
      const lit = (top && sunlit(x + 0.5, wall - Math.max(0, h - ARC.eave), h >= 37 ? ARC.eave : h + 0.5)) || (flank && sunlit(x - 0.5, wall, h)); // the roof from its top
      p.p(i, j, mix(lit ? inSun(c) : mix(inShade(c), c, 0.3), P.void1, deep)); // the garth's glare lights the face a little
    }
}

/** The church door, the way on: up into the church, by its candles, under the Order's sun for keystone. */
function door(p: Px, bars: boolean) {
  gate(p, bars, [P.void1, mix(P.void2, 0x7a4a1c, 0.5), 0xc8902a]);
  p.rect(CX - 5, 10, 11, 8, inShade(0xa89a8c));
  p.grid(CX - 3, 10, ['...Y...', '.Y.Y.Y.', '..YWY..', 'YYWWWYY', '..YWY..', '.Y.Y.Y.', '...Y...'], { Y: 0x8c5a1e, W: 0xc8902a });
}

/** The open-air room's background, the screen's whole width: the church's south wall with its door at the back, the
 *  walks' flagstones, the garth (its long path, the well's cross path, lawns, box hedges, graves), each in the Dawn's
 *  light or sunk in shade. */
function paintCloister(p: Px, bars: boolean) {
  paintFront(p, 0, CW, CFY1); // the front wall runs on to the edges (the shared overlay stops at the crypt's)
  // The church's south wall, in shade: its roof's eave in the light on top, a corbel table, coursed ashlar, buttresses,
  // two tall windows dark from outside, and the door, the way on.
  for (let y = 0; y < FY0; y++)
    for (let x = 0; x < CW; x++) {
      const r = Math.floor((y - 10) / 9), bx = x + (r % 2) * 11, v = hash(Math.floor(bx / 22), r, 5);
      if (y < 7) p.p(x, y, inSun((x + (y % 2) * 2) % 4 === 0 || y === 6 ? P.wall0 : y % 2 ? P.wall2 : P.wall1));
      else if (y < 10) p.p(x, y, inShade(x % 10 < 5 && y < 9 ? 0xb0a290 : 0x6a5c58));
      else p.p(x, y, inShade((y - 10) % 9 === 8 || bx % 22 === 0 ? 0x6a5c58 : v < 0.25 ? 0x908278 : v > 0.85 ? 0xb0a290 : 0x9c8e86));
    }
  for (const c of [CX - 76, CX + 76, CX - 172, CX + 172])
    for (let y = 10; y < FY0; y++)
      for (let i = -6; i < 6; i++) p.p(c + i, y, inShade(i === -6 ? 0xc0b4a0 : i === 5 ? 0x6a5c58 : y === 34 ? 0xc0b4a0 : y === 35 || (y - 10) % 9 === 8 ? 0x7a6c66 : 0xa89a8c));
  for (const c of [CX - 124, CX + 124]) {
    p.fill(c - 10, 10, c + 10, 54, (x, y) => inArch(x, y, c, 9, 26, 13) && y < 53, inShade(0xc0b4a0));
    p.fill(c - 10, 10, c + 10, 54, (x, y) => inArch(x, y, c, 7, 26, 11) && y < 51, P.void1);
    p.fill(c - 10, 10, c + 10, 54, (x, y) => inArch(x, y, c, 6, 26, 10) && y < 50 && ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0), P.void0);
    p.fill(c - 10, 10, c + 10, 54, (x, y) => inArch(x, y, c, 6, 26, 10) && y < 50 && y > 36 && hash(x, y, 8) > 0.9, mix(P.void1, 0x7a4a1c, 0.6));
  }
  door(p, bars);
  // The floor: the walks' flagstones, a drip course along each arcade, gravel paths, kerbs, lawns, the monks' graves.
  const flag = (x: number, y: number, w: number, h: number) => {
    const r = Math.floor((y - FY0) / h), fx = x + (r % 2) * (w / 2), v = hash(Math.floor(fx / w), r, w);
    const c = v < 0.3 ? 0x7c7484 : v > 0.75 ? 0x9a90a0 : 0x8a8292;
    return (y - FY0) % h === 0 || fx % w === 0 ? mix(c, P.void0, 0.3) : hash(x, y, 17) < 0.04 ? mix(c, P.void0, 0.15) : c;
  };
  const zone = (y: number) => (roofed(y) ? 2 : roofed(y - 4) || roofed(y + 4) ? 1 : 0); // a walk, its drip course, the garth
  // One path up the whole garth from the stairs to the church door; another crosses it at the well.
  const path = (x: number, y: number) => Math.abs(x + 0.5 - CX) < 10 || Math.abs(y + 0.5 - WELL.y) < 8 || Math.hypot((x + 0.5 - CX) / 32, (y + 0.5 - WELL.y) / 20) < 1;
  for (let y = FY0; y < CFY1; y++)
    for (let x = 0; x < CW; x++) {
      let c: number;
      const z = zone(y);
      if (z === 2) c = flag(x, y, 16, 16);
      else if (z === 1) c = flag(x, y, 8, 4);
      else if (path(x, y)) { const g = hash(x, y, 11); c = g < 0.2 ? 0x8c806e : g > 0.85 ? 0xd8ccb8 : 0xb4a690; }
      else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => path(x + i, y + j)) || zone(y - 1) || zone(y + 1)) c = 0x7a6c66; // kerb
      else {
        const n = noise(x, y, 6, 12) + (hash(x, y, 13) - 0.5) * 0.25;
        c = n < 0.4 ? 0x4a5a28 : n < 0.62 ? 0x56662e : 0x627236;
        if (hash(x, y + 1, 14) < 0.1) c = 0x2e3a16; // grass blades: a dark root under a light tip
        else if (hash(x, y, 14) < 0.1) c = 0x86964a;
        if (hash(x, y, 15) < 0.003) c = P.blood2; // poppies, and a few daisies
        else if (hash(x, y, 16) < 0.003) c = P.bone0;
      }
      p.p(x, y, c);
    }
  // Each grave a low mound of earth below its cross, lit on its upper left, in its own shadow down its lower right.
  for (const g of GRAVES)
    for (let y = g.y; y < g.y + 14; y++)
      for (let x = g.x - 7; x < g.x + 7; x++) {
        const dx = (x + 0.5 - g.x) / 6, dy = (y + 0.5 - g.y - 7) / 5.5;
        if (Math.hypot(dx, dy) < 1) p.p(x, y, dx + dy < -0.7 ? 0x8c5a1e : dx + dy > 0.6 ? 0x3c2418 : hash(x, y, 19) < 0.15 ? 0x56662e : 0x63391f); // and a few blades of grass
      }
  // The Dawn: everything it reaches turns pale gold, white-hot away from the shade, with a hard yellow rim on the shade's
  // edge (the holy light's steps, as under a lantern); the rest sinks into the cool night.
  const W = CW, H = CFY1 - FY0, d = new Uint8Array(W * H); // steps from the shade, up to 6
  for (let i = 0; i < W * H; i++) d[i] = dawn(i % W, FY0 + Math.floor(i / W)) ? 6 : 0;
  for (let k = 1; k < 6; k++)
    for (let i = 0; i < W * H; i++)
      if (d[i] > k && [i - 1, i + 1, i - W, i + W].some((n) => n >= 0 && n < W * H && d[n] === k - 1)) d[i] = k;
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = FY0 + Math.floor(i / W), c = p.get(x, y);
    p.p(x, y, d[i] === 0 ? inShade(c) : d[i] === 1 ? mix(inSun(c), 0xffd75e, 0.6) : d[i] < 5 ? inSun(c) : mix(inSun(c), 0xfff6d8, 0.2));
  }
  for (const b of HEDGES) render(p, 0, 0, hedgeAt, [b.x, b.y - 10, b.x + b.w, b.y + b.h]);
}

/** What stands in the cloister, sorted with the characters: the arcades (returned), the trees, the well, the crosses. */
function cloisterProps(scene: Phaser.Scene) {
  const arcades = ARCADES.map((a) => {
    const roof = CROSS.includes(a) ? ARC.walk : 0; // a cross gallery's is seen running back over its walk
    return scene.add.image(0, a - ARC.eave - roof, bake(scene, `room-arcade-${a}`, CW, ARC.eave + roof + 1, (p) => paintArcade(p, a, roof))).setOrigin(0).setDepth(a - 11);
  });
  // Each stands on the floor between its feet line and `reach` px up, which bounds the sight lines followed.
  const stand = (key: string, x0: number, y0: number, x1: number, y1: number, reach: number, at: (x: number, y: number, h: number) => number) =>
    scene.add.image(x0, y0, bake(scene, key, x1 - x0, y1 - y0, (p) => render(p, x0, y0, at, undefined, y1 - reach, y1))).setOrigin(0).setDepth(y1 - 11);
  for (const t of TREES) { // the canopy's ragged skin reaches out to 1.22 times its radii
    const k = 1.25;
    stand(`room-tree-${t.seed}`, Math.floor(t.x - t.rx * k), Math.floor(t.y - (t.h + (t.rh + t.ry) * k)), Math.ceil(t.x + t.rx * k), t.y + 3, t.ry * 2 * k + 3, (x, y, h) => treeAt(t, x, y, h));
  }
  stand('room-well', WELL.x - 16, WELL.y - 44, WELL.x + 17, WELL.y + 9, 18, wellAt);
  GRAVES.forEach((g, i) => stand(`room-cross-${i}`, g.x - 5, g.y - 17, g.x + 5, g.y + 2, 4, (x, y, h) => crossAt(g, x, y, h)));
  return arcades;
}

// ---------- beyond the room ----------

// A view larger than the room (a wide or an upright screen) shows its surroundings, never black: this far round a crypt
// room, and on both sides of the cloister. Their own textures, laid under the room's, which stay as they were.
const MARGIN = 300;

/** Round a crypt room: its abyss runs on all round, the pillars receding into it at the pitch they have beyond the side
 *  walls, sinking into the dark farther out; under the stairs, a dark well. */
function paintAbyss(p: Px) {
  for (let j = 0; j < p.h; j++)
    for (let i = 0; i < p.w; i++) {
      const x = i - MARGIN, y = j - MARGIN, d = Math.max(-x, x - T.width + 1, -y, y - RH + 1);
      if (d < 0) continue;
      const s = (((x < CX ? x : x - 458) % 14) + 14) % 14; // the pillars as at x 0 and 14, 458 and 472
      const well = y >= RH && Math.abs(x + 0.5 - CX) < 23 ? Math.max(0, 1 - d / 60) : 0;
      const c = s === 0 ? P.abyss2 : s < 8 ? P.abyss0 : P.abyss1;
      p.p(i, j, mix(c, P.void0, Math.max(well, Math.min(0.85, d / 110 + (y >= RH && x >= FX0 - 12 && x < FX1 + 12 ? 0.3 : 0)))));
    }
}

/** On both sides of the cloister, the east and west ranges' gabled roofs seen from above, running its whole length,
 *  their ridges 46 px out: Roman tiles in rows down each slope, the slope facing west in the Dawn's light, the other in
 *  shade; beyond their far eaves, the night. */
function paintRanges(p: Px) {
  for (let y = 0; y < p.h; y++)
    for (let i = 0; i < p.w; i++) {
      const x = i - MARGIN, u = x < 0 ? -1 - x : x - CW; // out from the garth's edge
      if (u < 0) continue;
      const v = (y + 600) % 6, near = u < 46, lit = near === x >= 0; // the east range's near slope faces west
      let c: number;
      if (u < 2 || u === 92 || u === 93) c = P.wall0; // the eaves' gutters
      else if (u === 46) c = y % 8 ? mix(P.wall2, P.bone1, 0.25) : P.wall1; // ridge tiles
      else if (u === 47) c = P.wall0;
      else if (u < 92) {
        const t = v === 5 ? P.wall0 : v === 0 ? P.wall2 : u % 4 === 0 ? mix(P.wall1, P.wall0, 0.5) : P.wall1;
        c = lit ? mix(t, 0xffd75e, 0.4) : inShade(t);
      } else c = mix(inShade(noise(x, y, 6, 12) > 0.5 ? 0x4a5a28 : 0x3a4820), P.void0, Math.min(0.9, (u - 94) / 40 + 0.4));
      p.p(i, y, c);
    }
}

// ---------- props ----------

/** Cylinder shading for a 16 px column, lit from the left. */
const COLUMN = [P.stone2, P.stone2, P.stone2, P.stone1, P.stone1, P.stone1, P.stone1, P.stone1, P.stone0, P.stone0, P.stone0, P.stone0, P.stone0, P.void2, P.void2, P.void1];
const column = (p: Px, x: number, y: number, w: number) => {
  for (let i = 0; i < w; i++) p.p(x + i, y, COLUMN[Math.min(15, Math.floor((i * 16) / w))]);
};

/** A whole pillar runs up into the dark vault; a broken one (a stump: the texture's height sets how high it broke) is
 *  snapped along a jagged line, high on the left, or on the right when `flip`. */
function paintPillar(p: Px, broken: boolean, flip = false) {
  const H = p.h, top = broken ? 12 : 10;
  // Plinth: top surface then front face.
  p.rect(1, H - 13, 26, 8, P.stone1);
  p.rect(1, H - 13, 26, 1, P.stone2);
  p.rect(1, H - 13, 1, 8, P.stone2);
  p.rect(1, H - 5, 26, 5, P.stone0);
  p.rect(1, H - 5, 26, 1, mix(P.stone1, P.stone2, 0.5));
  p.rect(1, H - 5, 1, 5, P.stone1);
  p.rect(26, H - 13, 1, 13, P.void2);
  p.rect(1, H - 1, 26, 1, P.void2);
  // Shaft with fluting and drum joints.
  const snap = [-6, -8, -7, -5, -6, -3, -2, -4, -1, 1, 0, 2, 4, 3, 5, 6];
  if (flip) snap.reverse();
  for (let i = 0; i < 16; i++)
    for (let y = broken ? top + snap[i] : top; y < H - 15; y++) {
      const c = COLUMN[i], cut = broken ? y - (top + snap[i]) : 99;
      p.p(6 + i, y, cut < 2 ? (i < 6 ? P.stone2 : i < 11 ? mix(P.stone1, P.stone2, 0.5) : P.stone1) : cut === 2 ? P.stone0
        : (H - y) % 24 === 0 ? P.void2 : (H - y) % 24 === 23 ? mix(c, P.stone2, 0.3) : i % 4 === 0 && i ? mix(c, P.void1, 0.3) : c);
    }
  // Base torus.
  for (let y = H - 17; y < H - 13; y++) column(p, 4, y, 20);
  p.rect(4, H - 17, 20, 1, P.stone2);
  p.rect(4, H - 14, 20, 1, P.void2);
  if (broken) return;
  // Carved band halfway up, then the shaft runs on into the dark vault above.
  for (let y = 0; y < top; y++) column(p, 6, y, 16);
  const band = H - 70;
  for (let y = band; y < band + 6; y++) column(p, 5, y, 18);
  p.rect(5, band, 18, 1, P.stone2);
  p.rect(5, band + 5, 18, 1, P.void2);
  for (let i = 0; i < 18; i += 3) p.tint(5 + i, band + 2, P.void1, 0.6), p.tint(5 + i, band + 3, P.void1, 0.6);
  // Texture top = screen top: fade exactly like the wall behind (ceiling dark, then stepped shadow).
  for (let y = 0; y < 27; y++) for (let x = 0; x < p.w; x++) p.tint(x, y, P.void0, y < 10 ? 0.85 : [0.7, 0.55, 0.4, 0.25, 0.12][Math.floor((y - 7) / 4)]);
}

/** A pillar fallen whole along the floor, its capital to the left, broken off its plinth on the right: lit along its
 *  top, its drums' joints across it. The feet line on the bottom row. */
function paintFallen(p: Px) {
  const W = p.w, H = p.h, snap = [3, 1, 2, 0, -1, 1, 3, 2, 0, -2, -1, 1, 2, 0];
  for (let r = 0; r < 14; r++) {
    const y = H - 15 + r, c = COLUMN[Math.floor((r * 16) / 14)], end = W - 4 + snap[r] - 2;
    for (let x = 6; x < end; x++)
      p.p(x, y, x >= end - 2 ? (r < 7 ? P.stone2 : P.stone1) : (x - 6) % 22 === 21 ? P.void2 : (x - 6) % 22 === 0 ? mix(c, P.stone2, 0.3) : x % 4 === 0 && r > 1 && r < 12 ? mix(c, P.void1, 0.25) : c);
  }
  for (let r = -2; r < 16; r++) { // the capital's block at the far end
    const y = H - 15 + r;
    for (let x = 1; x < 6; x++) p.p(x, y, r === -2 || x === 1 ? P.stone2 : r > 12 ? P.void2 : r > 6 ? P.stone0 : P.stone1);
  }
  p.rect(1, H - 1, W - 6, 1, P.void0, 0.5);
}

function paintBrazier(p: Px) {
  // Tripod legs.
  p.line(4, 10, 1, 21, P.void2); p.line(5, 10, 2, 21, P.stone0);
  p.line(12, 10, 15, 21, P.void1); p.line(11, 10, 14, 21, P.void2);
  p.line(8, 11, 8, 22, P.stone0); p.line(9, 11, 9, 22, P.void2);
  for (const x of [0, 7, 14]) p.rect(x, x === 7 ? 22 : 21, 3, 1, P.void2);
  // Bowl: rim seen from above with embers inside, then the iron belly.
  p.ellipse(8, 6, 8, 3, P.stone1);
  p.ellipse(8, 6, 6.5, 2, P.blood0);
  p.fill(2, 4, 14, 8, (x, y) => Math.hypot((x + 0.5 - 8) / 6.5, (y + 0.5 - 6) / 2) < 1 && hash(x, y, 3) > 0.5, P.blood1);
  p.fill(2, 4, 14, 8, (x, y) => Math.hypot((x + 0.5 - 8) / 5, (y + 0.5 - 6) / 1.5) < 1 && hash(x, y, 4) > 0.6, P.fire);
  for (let y = 8; y < 12; y++) {
    const w = 8 - (y - 8) * 1.5;
    for (let x = Math.ceil(8 - w); x < 8 + w; x++) p.p(x, y, x < 6 ? P.stone0 : x > 11 ? P.void1 : P.void2);
  }
  p.rect(1, 8, 14, 1, P.stone0);
}

/** Four flame frames side by side, 10x16 each. */
function paintFlames(p: Px) {
  for (let f = 0; f < 4; f++)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 10; x++) {
        const h = 15 - y; // height above the bowl
        const sway = Math.sin(h * 0.45 + f * 1.6) * (h / 9);
        const w = 4.6 * Math.sin(Math.PI * Math.min(1, (h + 3) / 17)) * (1 - h / 22);
        const d = Math.abs(x + 0.5 - 5 - sway) / Math.max(w, 0.01) + (hash(x, y, f) - 0.5) * 0.35;
        const tip = h > 11 + ((f * 3) % 4) - (hash(x, f, 1) < 0.5 ? 1 : 0);
        if (d > 1 || tip) continue;
        p.p(f * 10 + x, y, d < 0.35 && h < 8 ? mix(P.fire, P.bone0, 0.7) : d < 0.6 ? P.fire : d < 0.85 ? P.blood2 : P.blood1);
      }
}

/** A heap of skulls and long bones, the way ossuaries stack their dead, fallen out of its niche: 28 wide, the feet line
 *  on the bottom row. Lit from the top left, it darkens downward and to the right. */
function paintHeap(p: Px) {
  const H = p.h;
  p.ellipse(14, H - 3, 14, 3, mix(P.bone1, P.void1, 0.65)); // bone dust
  // Long bones jutting out from under the skulls.
  for (const [x0, y0, x1, y1] of [[1, H - 6, 8, H - 12], [19, H - 13, 27, H - 6], [10, H - 4, 18, H - 2], [6, H - 15, 12, H - 18]]) {
    p.line(x0, y0 + 1, x1, y1 + 1, P.void0, 0.6);
    p.line(x0, y0, x1, y1, P.bone1);
    p.p(x0, y0, P.bone0); p.p(x1, y1, P.bone0);
  }
  // Back rows first, so the lower skulls overlap the ones above.
  for (const [row, x, y, n] of [[0, 11, H - 21, 1], [1, 8, H - 17, 2], [2, 5, H - 13, 3], [3, 2, H - 9, 4]])
    for (let i = 0; i < n; i++) {
      const k = 0.08 + row * 0.07 + (i / Math.max(1, n - 1)) * 0.22;
      p.grid(x + i * 6, y, SKULL, { b: mix(P.bone0, P.void1, k), B: mix(P.bone1, P.void1, k + 0.12), '.': P.void0 });
    }
}

/** A vampire's coffin (the classic six-sided shape, head to the left) resting on a stone bier. */
function paintCoffin(p: Px, open: boolean) {
  const H = p.h;
  // Bier: top surface, then its front face down to the feet line.
  p.rect(1, H - 22, 46, 15, P.stone1);
  p.rect(1, H - 22, 46, 1, P.stone2);
  p.rect(1, H - 22, 1, 15, P.stone2);
  p.rect(1, H - 7, 46, 6, P.stone0);
  p.rect(1, H - 7, 46, 1, mix(P.stone1, P.stone2, 0.5));
  p.rect(46, H - 22, 1, 21, P.void2);
  p.rect(1, H - 1, 46, 1, P.void2);
  for (const x of [8, 20, 32]) { p.rect(x, H - 5, 8, 3, mix(P.stone0, P.void2, 0.5)); p.rect(x, H - 3, 8, 1, P.stone1); }
  // Six-sided outline: half width along the length.
  const L = 38, x0 = 5, cy = H - 15;
  const hw = (i: number) => (i < 9 ? 3.5 + (i / 9) * 3.5 : 7 - ((i - 9) / (L - 9)) * 3.2);
  const lid = (ox: number, oy: number, inner: (i: number, j: number) => number) => {
    for (let i = 0; i < L; i++) {
      const h = hw(i), top = Math.round(cy - 5 + oy - h), bot = Math.round(cy - 5 + oy + h);
      // Side planks visible below the lid edge.
      for (let y = bot + 1; y <= bot + 5; y++) p.p(x0 + ox + i, y, y === bot + 5 ? P.void1 : i < 9 ? P.wall1 : P.wall0);
      for (let y = top; y <= bot; y++) {
        const edge = y === top || i === 0 ? P.wall2 : y === bot || i === L - 1 ? P.wall0 : inner(i, y - top);
        p.p(x0 + ox + i, y, edge);
      }
    }
  };
  if (!open) {
    lid(0, 0, (i, j) => (i > 2 && i < L - 3 && j > 1 && j < 2 * hw(i) - 1 ? mix(P.wall1, P.wall2, 0.35) : P.wall1));
    // Studs and a blank plate.
    for (let i = 4; i < L - 2; i += 5) p.p(x0 + i, Math.round(cy - 5 - hw(i)) + 1, P.bone1);
    p.rect(x0 + 15, cy - 6, 8, 3, P.bone1);
    p.rect(x0 + 15, cy - 4, 8, 1, P.stone1);
    // Blood seeping out under the lid.
    for (const [i, len] of [[12, 4], [14, 2], [27, 5], [31, 2]]) {
      const y = Math.round(cy - 5 + hw(i)) + 1;
      p.rect(x0 + i, y, 1, len, P.blood0);
      p.p(x0 + i, y, P.blood1);
    }
    return;
  }
  // Open: crimson lining and pillow.
  lid(0, 0, (i, j) => {
    if (j < 2 || i < 2) return P.void1; // inner wall in shadow
    if (i < 8) return mix(P.blood1, P.bone0, 0.35); // pillow
    return j % 3 === 2 ? P.blood0 : P.blood1;
  });
  // The lid stands propped against the foot of the bier.
  for (let i = 0; i < L; i++) {
    const h = hw(i) * 0.95, cx = 55 - (L - 1 - i) * 0.08, y = H - 2 - L + i, l = Math.round(cx - h), r = Math.round(cx + h);
    for (let x = l; x <= r + 2; x++)
      p.p(x, y, x > r ? (x === r + 2 ? P.void1 : P.wall0) : x === l || i === 0 ? P.wall2 : x === r || i === L - 1 ? P.wall0 : i > 2 && i < L - 3 && x > l + 1 && x < r - 1 ? mix(P.wall1, P.wall2, 0.3) : P.wall1);
  }
  p.rect(48, H - 1, 14, 1, P.void0, 0.6);
}

/** A pew facing the altar, seen from behind: its backrest's back, the seat showing over it, end boards with rounded
 *  caps; dark wood (crimson-black like everything here), lit from the top left. The feet line on the bottom row. */
function paintPew(p: Px) {
  const W = p.w, H = p.h;
  p.rect(2, H - 15, W - 4, 3, P.wall1); // the seat beyond the backrest
  p.rect(2, H - 15, W - 4, 1, P.wall2);
  p.rect(1, H - 12, W - 2, 2, mix(P.wall1, P.wall2, 0.6)); // backrest top rail
  p.rect(1, H - 12, W - 2, 1, mix(P.wall2, P.bone1, 0.3));
  for (let y = H - 10; y < H - 3; y++)
    for (let x = 1; x < W - 1; x++) p.p(x, y, x % 7 === 0 ? P.void1 : hash(x, 0, 5) < 0.3 ? mix(P.wall0, P.wall1, 0.5) : P.wall0); // planks
  p.rect(1, H - 4, W - 2, 1, P.void1);
  for (const x of [0, W - 3]) { // end boards, the left one lit
    p.rect(x, H - 17, 3, 16, x ? P.void2 : P.wall1);
    p.rect(x, H - 18, 3, 1, x ? P.wall0 : P.wall2);
    p.p(x + 1, H - 19, x ? P.wall0 : P.wall2);
  }
  for (const x of [8, W / 2, W - 10]) p.rect(x, H - 3, 2, 3, P.void1); // feet
}

/** The Order's altar: a pale stone table under a bone-white cloth with a gold trim and the sun of the Eternal Dawn, two
 *  candlesticks and a closed book on it. The feet line on the bottom row. */
function paintAltar(p: Px) {
  const W = p.w, H = p.h;
  p.rect(1, H - 22, W - 2, 10, P.bone1); // top, seen from above
  p.rect(1, H - 22, W - 2, 1, P.bone0);
  p.rect(1, H - 12, W - 2, 11, P.stone1); // front face
  p.rect(1, H - 12, 1, 11, P.stone2);
  p.rect(W - 2, H - 22, 1, 21, P.stone0);
  p.rect(1, H - 1, W - 2, 1, P.void2);
  // The cloth hangs over the front, a gold hem, the sun in its middle.
  p.rect(6, H - 13, W - 12, 9, P.bone0);
  p.rect(W - 7, H - 13, 1, 9, P.bone1);
  p.rect(6, H - 5, W - 12, 1, 0xc8902a);
  p.grid(W / 2 - 3, H - 12, ['...Y...', '.Y.Y.Y.', '..YWY..', 'YYWWWYY', '..YWY..', '.Y.Y.Y.', '...Y...'], { Y: 0xc8902a, W: 0xffd75e });
  // Candlesticks and a book on the top.
  for (const x of [5, W - 8]) {
    p.rect(x, H - 21, 3, 1, 0xc8902a);
    p.rect(x + 1, H - 27, 1, 6, P.bone0);
    p.p(x + 1, H - 28, P.fire);
    p.p(x + 1, H - 29, mix(P.fire, P.bone0, 0.6));
  }
  p.rect(W / 2 - 5, H - 19, 10, 4, P.blood0);
  p.rect(W / 2 - 5, H - 19, 10, 1, P.blood1);
  p.rect(W / 2, H - 19, 1, 4, 0xc8902a);
}

/** The Order's font of holy water: a round stone basin on a short shaft and a stepped base, the water pale in it, the
 *  Eternal Dawn's sun carved on its belly. Lit from the top left; the feet line on the bottom row. */
function paintFont(p: Px) {
  const W = p.w, H = p.h, c = W / 2, rim = H - 21;
  p.rect(1, H - 5, W - 2, 5, P.stone0); // the base step: top, then front
  p.rect(1, H - 5, W - 2, 1, P.stone1);
  p.rect(1, H - 5, 1, 5, P.stone1);
  p.rect(W - 2, H - 5, 1, 5, P.void2);
  p.rect(1, H - 1, W - 2, 1, P.void2);
  for (let y = H - 13; y < H - 5; y++) column(p, c - 5, y, 10); // the shaft
  for (let y = H - 15; y < H - 13; y++) column(p, c - 7, y, 14);
  for (let y = rim; y < H - 14; y++) { // the basin's belly, round under the rim
    const hw = Math.round(12.5 * Math.sqrt(Math.max(0, 1 - ((y - rim) / 7.5) ** 2)));
    column(p, c - hw, y, hw * 2);
  }
  p.ellipse(c, rim, 13, 4.5, P.stone2); // the rim seen from above, the water in it
  p.ellipse(c, rim, 11, 3.2, P.stone0);
  p.ellipse(c, rim + 0.5, 9.5, 2.4, P.moon0);
  p.fill(c - 9, rim - 2, c + 9, rim + 3, (x, y) => Math.hypot((x + 0.5 - c + 2) / 6, (y + 0.5 - rim) / 1.4) < 1 && (x + y) % 3 === 0, P.moon1);
  p.p(c - 4, rim, P.moon2);
  p.p(c - 3, rim, P.moon2);
  p.grid(c - 2, rim + 3, ['..Y..', '.YWY.', 'YWWWY', '.YWY.', '..Y..'], { Y: 0x7a4a1c, W: 0xc8902a });
}

// ---------- overlays ----------

/** Moon shafts falling from the unseen oculus at the top left: parallel beams with hard edges, drawn additive. */
const BEAMS = [
  { x: 116, w: 28, k: 0.11, len: 1 },
  { x: 140, w: 9, k: 0.09, len: 0.94 },
  { x: 98, w: 8, k: 0.07, len: 0.86 },
];
const SHAFT = { dx: 0.76, top: -10, bottom: 166 };
const inBeam = (x: number, y: number, b: (typeof BEAMS)[number]) => {
  const t = (y - SHAFT.top) / (SHAFT.bottom - SHAFT.top);
  return t >= 0 && t <= b.len && Math.abs(x - (b.x + (y - SHAFT.top) * SHAFT.dx)) < b.w / 2 + t * 6;
};

/** How bright the holy light's shaft is in the air at a screen pixel: it rises from the panes up toward the top left,
 *  fading as it goes. */
function shaftAt(windows: readonly P[], x: number, y: number) {
  for (let t = 0; t < 140; t += 2) if (pane(windows, x + t * PANE.skew, y + t)) return 1 - t / 140;
  return 0;
}

function paintShaft(p: Px, L: Layout) {
  if (L.open) return; // under the sky, the light is on the ground
  // Each pane's shaft only rises up and to the left of it: looked for there alone, the brightest wins.
  const k = new Float32Array(p.w * p.h);
  for (const w of L.windows ?? [])
    for (let y = Math.max(0, w.y - 141); y < Math.min(FY1, w.y + PANE.len + 1); y++)
      for (let x = Math.max(0, w.x - 82); x < Math.min(p.w, w.x + 34); x++) k[y * p.w + x] = Math.max(k[y * p.w + x], shaftAt([w], x, y));
  if (L.windows) for (let i = 0; i < k.length; i++) { if (k[i] > 0) p.p(i % p.w, Math.floor(i / p.w), 0xffd75e, 0.03 + k[i] * 0.07); }
  else for (const dy of L.beams ?? [0])
    for (let y = Math.max(0, dy + SHAFT.top); y < Math.min(p.h, dy + SHAFT.bottom + 1); y++)
      for (let x = 0; x < p.w; x++) {
        let k = 0;
        const t = (y - dy - SHAFT.top) / (SHAFT.bottom - SHAFT.top);
        for (const b of BEAMS) if (inBeam(x, y - dy, b)) k += b.k * (t > b.len - 0.12 ? 0.55 : 1);
        if (k > 0) p.p(x, y, P.moon2, k);
      }
  // The same pools again, faint, so whoever stands in one catches the moon.
  for (const q of L.pools) light(p, ...q, P.moon2, [0.035, 0.07], 0.06, 4, 22, "paint");
  for (let y = FY0; y < FY0 + 100; y++) for (let x = CX - 60; x < CX + 80; x++) if (gateSpill(x, y)) p.p(x, y, P.moon2, gateSpill(x, y) * 0.08);
  for (let y = FY0; y < FY0 + 60; y++) for (let x = FX0; x < FX1; x++) if (lancetSpill(x, y)) p.p(x, y, P.moon2, 0.05);
}

function paintVignette(p: Px, c: number = P.abyss0, from = 0.66) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = Math.hypot((x - CX) / 250, (y - 150) / 150);
      const a = Math.min(1, Math.max(0, (v - from) / 0.6)) ** 1.6 * 0.8;
      if (a > 0) p.p(x, y, c, a);
    }
}

/** The front wall from x0 to x1, along the floor's front edge fy1, 14 px deep. */
function paintFront(p: Px, x0: number, x1: number, fy1: number) {
  // Front wall top (seen from above), steps down into the dark in the middle, its outer face below.
  const sx0 = CX - 22, sx1 = CX + 22, bottom = fy1 + 14;
  for (let x = x0; x < x1; x++) {
    if (x >= sx0 && x < sx1) continue;
    p.rect(x, fy1, 1, 8, P.void1);
    p.p(x, fy1, P.stone0);
    p.rect(x, fy1 + 8, 1, bottom - fy1 - 8, P.void0);
    if (x % 16 === 0) p.rect(x, fy1 + 1, 1, 7, P.void2);
  }
  for (let y = fy1; y < bottom; y++) {
    const step = Math.floor((y - fy1) / 4);
    p.rect(sx0, y, sx1 - sx0, 1, (y - fy1) % 4 === 0 ? mix(P.stone1, P.void0, step * 0.25) : mix(P.stone0, P.void0, 0.3 + step * 0.2));
  }
  p.rect(sx0 - 1, fy1, 1, bottom - fy1, P.stone0);
  p.rect(sx1, fy1, 1, bottom - fy1, P.void0);
}

function cobweb(p: Px, cx: number, cy: number, r: number) {
  const angles = [Math.PI, (Math.PI * 5) / 6, (Math.PI * 2) / 3, Math.PI / 2];
  for (const a of angles) p.line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, P.stone1, 0.55);
  for (const d of [r * 0.35, r * 0.65, r * 0.95])
    for (let k = 0; k < angles.length - 1; k++)
      p.line(cx + Math.cos(angles[k]) * d, cy + Math.sin(angles[k]) * d + 1, cx + Math.cos(angles[k + 1]) * d, cy + Math.sin(angles[k + 1]) * d + 1, P.stone1, 0.45);
}

function glowTexture(p: Px) {
  const c = p.w / 2;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const d = Math.hypot((x + 0.5 - c) / c, (y + 0.5 - p.h / 2) / (p.h / 2));
      if (d < 1) p.p(x, y, P.fire, [0.03, 0.06, 0.1][Math.min(2, Math.floor((1 - d) * 3.3))]);
    }
}

// ---------- the portcullis ----------

// Box around the gate opening; the bars stop above the threshold slab (row 63).
const GX = CX - GATE.hw, GY = 4, GW = GATE.hw * 2 + 1, GH = 59, GATE_RISE = 48;
// The bars as painted in each layout, lights included; transparent elsewhere. BARS: the current room's.
const BARS_OF: Partial<Record<LayoutId, Px>> = {};
let BARS: Px;

/** Paints the layout's room without its portcullis, and the portcullis alone as the pixels where the room painted with
 *  it differs: closed, the gate looks exactly as when it was part of the room. */
function paintHall(scene: Phaser.Scene, id: LayoutId) {
  const L = LAYOUT[id], h = L.open ? CH : RH, open = new Px(T.width, h), shut = new Px(T.width, h);
  if (L.dark) {
    const t = Torture.paintRoom((x, y, grow) => inArch(x, y, CX, GATE.hw + grow, GATE.ys, GATE.R + grow));
    open.d.set(t.open);
    shut.d.set(t.shut);
  } else if (L.open) { // painted once (it is slow), then the shut door over a copy: nothing else touches the door's box
    paintCloister(open, false);
    shut.d.set(open.d);
    door(shut, true);
  } else {
    paintBackground(open, L, false);
    paintBackground(shut, L, true);
  }
  bake(scene, `room-bg-${id}`, T.width, h, (p) => p.d.set(open.d));
  const bars = new Px(GW, GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) if (shut.get(GX + x, GY + y) !== open.get(GX + x, GY + y)) bars.p(x, y, shut.get(GX + x, GY + y));
  BARS_OF[id] = bars;
}

/** The portcullis raised by `d` px: its bars slide up into the masonry, clipped to the opening. */
function drawGate(scene: Phaser.Scene, d: number) {
  const t = (scene.textures.exists('room-gate') ? scene.textures.get('room-gate') : scene.textures.createCanvas('room-gate', GW, GH)!) as Phaser.Textures.CanvasTexture;
  const img = new ImageData(GW, GH);
  for (let y = 0; y + d < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (!inArch(GX + x, GY + y, CX, GATE.hw, GATE.ys, GATE.R)) continue;
      const from = ((y + d) * GW + x) * 4;
      img.data.set(BARS.d.subarray(from, from + 4), (y * GW + x) * 4);
    }
  t.context.putImageData(img, 0, 0);
  t.refresh();
}

/** The moonlight the bars keep off the floor (in the box at GLX, FY0), as paintLight's glow and paintShaft's sheen
 *  would add it: drawn additive, it fills the stripes as the portcullis rises. */
const GLX = CX - 60;
function paintGateLight(p: Px) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const k = gateSpill(GLX + x, FY0 + y, false) - gateSpill(GLX + x, FY0 + y);
      if (k <= 0) continue;
      p.p(x, y, 0x000000);
      p.glow(x, y, P.moon1, k * 0.3);
      p.glow(x, y, P.moon2, k * 0.08);
    }
}

/** Winches the portcullis up over `ms`, in jerks of a few pixels, letting the moonlight in. */
export function raiseGate(scene: Phaser.Scene, ms: number) {
  const light = scene.children.getByName('room-gatelight') as Phaser.GameObjects.Image;
  let last = 0;
  scene.tweens.addCounter({ from: 0, to: 1, duration: ms, ease: 'Sine.easeInOut', onUpdate: (tw) => {
    const d = 3 * Math.round(((tw.getValue() ?? 0) * GATE_RISE) / 3);
    if (d !== last) drawGate(scene, (last = d));
    light.setAlpha(d / GATE_RISE);
  } });
}

// ---------- build ----------

export function build(scene: Phaser.Scene, id: LayoutId): Room {
  const L = LAYOUT[id], height = L.open ? CH : RH, fy1 = height - 14; // the floor's front edge
  if (!BARS_OF[id]) paintHall(scene, id); // painted on the layout's first build, kept across restarts
  BARS = BARS_OF[id]!;
  scene.add.image(0, 0, `room-bg-${id}`).setOrigin(0).setDepth(-1000);
  const front = L.dark ? 7970 : 8500; // in the dark, under its light layer (dark.ts)
  if (L.open) scene.add.image(-MARGIN, 0, bake(scene, 'room-ranges', CW + 2 * MARGIN, CH, paintRanges)).setOrigin(0).setDepth(-1001);
  else {
    const key = bake(scene, 'room-abyss', T.width + 2 * MARGIN, RH + 2 * MARGIN, paintAbyss);
    scene.add.image(-MARGIN, -MARGIN, key).setOrigin(0).setDepth(-1001);
    // Below the front wall it is drawn over the room too: the hero climbing the stairs shows only above the steps.
    scene.add.image(-MARGIN, -MARGIN, key).setOrigin(0).setDepth(front).setCrop(0, MARGIN + RH, T.width + 2 * MARGIN, MARGIN);
  }
  drawGate(scene, 0); // the previous room left it open
  scene.add.image(GX, GY, 'room-gate').setOrigin(0).setDepth(-999);
  scene.add.image(GLX, FY0, bake(scene, 'room-gatelight', 140, 100, paintGateLight)).setOrigin(0).setDepth(-998)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setName('room-gatelight').setVisible(!L.open && !L.dark); // no moon out there

  const obstacles = scene.physics.add.staticGroup();
  const arcades = L.open ? cloisterProps(scene) : [];
  if (L.dark) stand(scene);
  for (const o of L.props) {
    if (o.kind === 'block') { obstacles.add(scene.add.zone(o.x, o.y - o.h / 2, o.w, o.h)); continue; }
    // Characters sort by their sprite centre (feet - ~11 px), so a prop sorts at its feet line minus that.
    const depth = o.y - 11;
    if (o.kind === 'pillar' || o.kind === 'stump') {
      const h = o.tall ?? (o.kind === 'pillar' ? o.y : 58); // a whole pillar runs up to the top of the room unless told
      const key = bake(scene, `room-${o.kind}-${h}${o.flip ? '-flip' : ''}`, 28, h, (p) => paintPillar(p, o.kind === 'stump', o.flip));
      scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'brazier') {
      scene.add.image(o.x, o.y, bake(scene, 'room-brazier', 17, 23, paintBrazier)).setOrigin(0.5, 1).setDepth(depth);
      flame(scene, o.x, o.y - 17, depth);
    } else if (o.kind === 'pew' || o.kind === 'altar') {
      scene.add.image(o.x, o.y, bake(scene, `room-${o.kind}`, o.w + 2, o.kind === 'pew' ? 20 : 30, o.kind === 'pew' ? paintPew : paintAltar)).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'fallen') {
      scene.add.image(o.x, o.y, bake(scene, 'room-fallen', o.w + 4, 18, paintFallen)).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'font') {
      scene.add.image(o.x, o.y, bake(scene, 'room-font', 28, 30, paintFont)).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'heap') {
      scene.add.image(o.x, o.y + 2, bake(scene, 'room-heap', 28, 24, paintHeap)).setOrigin(0.5, 1).setDepth(depth);
    } else {
      const key = bake(scene, `room-${o.kind}`, o.w + 2, o.kind === 'coffinOpen' ? 46 : 34, (p) => paintCoffin(p, o.kind === 'coffinOpen'));
      scene.add.image(o.x - o.w / 2 - 1, o.y, key).setOrigin(0, 1).setDepth(depth);
    }
    obstacles.add(scene.add.zone(o.x, o.y - o.h / 2, o.w, o.h));
  }
  const pits = scene.physics.add.staticGroup();
  for (const b of L.pits) pits.add(scene.add.zone(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h));

  if (!L.open && !L.dark) scene.add.image(0, 0, bake(scene, `room-shaft-${id}`, T.width, RH, (p) => paintShaft(p, L))).setOrigin(0).setDepth(8000).setBlendMode(Phaser.BlendModes.ADD);
  if (!L.dark) atmosphere(scene, L);
  if (L.dark) scene.add.image(0, 0, `room-bg-${id}`).setOrigin(0).setDepth(front).setCrop(0, fy1, T.width, 14); // its own front wall
  else scene.add.image(0, fy1, bake(scene, 'room-front', T.width, 14, (p) => paintFront(p, FX0 - 12, FX1 + 12, 0))).setOrigin(0).setDepth(front);
  // The vignette frames the screen, whatever its shape: stretched to the view (in the dark, black and closer in).
  const vignette = scene.add.image(0, 0, L.dark ? bake(scene, 'room-vignette-dark', T.width, T.height, (p) => paintVignette(p, P.void0, 0.5))
    : bake(scene, 'room-vignette', T.width, T.height, paintVignette)).setOrigin(0).setDepth(10_000).setScrollFactor(0);
  const fit = () => vignette.setDisplaySize(scene.scale.width, scene.scale.height);
  fit();
  scene.scale.on(Phaser.Scale.Events.RESIZE, fit);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, fit));

  const room: Room = {
    bounds: L.open ? new Phaser.Geom.Rectangle(CM, FY0, CW - 2 * CM, fy1 - FY0) : new Phaser.Geom.Rectangle(FX0, FY0, FX1 - FX0, fy1 - FY0),
    obstacles,
    pits,
    heroStart: L.heroStart,
    spawns: L.spawns,
    spots: L.spots,
    medallion: L.gift ?? { x: CX, y: CY },
    gate: { x: CX, y: FY0 },
    stairs: { x: CX, y: fy1 + 10 }, // feet off screen, the head showing above the steps
    holy: L.open ? dawn : (x, y) => !!L.windows && pane(L.windows, Math.floor(x), Math.floor(y)) > 0,
    burn: L.open ? T.dawn : T.lantern,
    arcades,
    height,
    sections: L.sections ?? [],
  };
  // Self-check: every start point is inside the room and clear of every footprint and pit (with a body's margin), and
  // so is every lantern spot.
  const clear = (s: P, feet: number) => room.bounds.contains(s.x, s.y + feet)
    && [...L.props.map((o) => ({ x: o.x - o.w / 2, y: o.y - o.h, w: o.w, h: o.h })), ...L.pits].every((b) => boxDist([b], s.x, s.y + feet) > 7);
  for (const s of [room.heroStart, ...room.spawns]) console.assert(clear(s, 8), 'room: start point blocked', id, s);
  for (const s of room.spots) console.assert(clear(s, 0), 'room: lantern spot blocked', id, s);
  // And the holy light leaves dark the hero's start, the gift, the lane up from the stairs to the start and the way on
  // from the gift to the gate.
  const lane = Array.from({ length: Math.floor((fy1 - room.heroStart.y - 8) / 8) + 1 }, (_, i) => ({ x: CX, y: fy1 - i * 8 }));
  for (let y = room.medallion.y; y > FY0; y -= 4) lane.push({ x: room.gate.x, y });
  for (const s of [{ x: room.heroStart.x, y: room.heroStart.y + 8 }, room.medallion, ...lane]) console.assert(!room.holy(s.x, s.y), 'room: lit spot', id, s);
  return room;
}

function flame(scene: Phaser.Scene, x: number, y: number, depth: number) {
  const key = bake(scene, 'room-flame', 40, 16, paintFlames);
  const tex = scene.textures.get(key);
  if (!tex.has('0')) for (let f = 0; f < 4; f++) tex.add(String(f), 0, f * 10, 0, 10, 16);
  if (!scene.anims.exists('room-flame'))
    scene.anims.create({ key: 'room-flame', frames: [0, 1, 2, 3].map((f) => ({ key, frame: String(f) })), frameRate: 9, repeat: -1 });
  scene.add.sprite(x, y, key, '0').setOrigin(0.5, 1).setDepth(depth).play({ key: 'room-flame', startFrame: x % 4 });
  // Warm glow on whoever stands near, breathing irregularly.
  const glow = scene.add.image(x, y - 2, bake(scene, 'room-glow', 72, 56, glowTexture)).setDepth(8000).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: glow, alpha: { from: 1, to: 0.55 }, duration: 140 + (x % 5) * 37, yoyo: true, repeat: -1, ease: 'Stepped' });
  scene.add.particles(x, y - 8, bake(scene, 'room-dot', 1, 1, (p) => p.p(0, 0, 0xffffff)), {
    lifespan: { min: 700, max: 1400 }, speedY: { min: -32, max: -14 }, speedX: { min: -6, max: 6 },
    frequency: 160, tint: [P.fire, P.blood2, P.fire], alpha: { start: 1, end: 0 }, advance: 1500,
  }).setDepth(8001);
}

function atmosphere(scene: Phaser.Scene, L: Layout) {
  // Dust motes drifting inside the moon beams (ash in the Dawn's light, out in the cloister).
  const dot = bake(scene, 'room-dot', 1, 1, (p) => p.p(0, 0, 0xffffff));
  const pt = new Phaser.Math.Vector2();
  const source = {
    getRandomPoint(out: Phaser.Types.Math.Vector2Like) {
      for (let i = 0; i < 20; i++) {
        if (L.open) { pt.set(Math.random() * CW, FY0 + Math.random() * (CFY1 - FY0)); if (dawn(pt.x, pt.y)) break; continue; }
        const beams = L.beams ?? [0], dy = beams[Math.floor(Math.random() * beams.length)];
        pt.set(L.windows ? Math.random() * 440 : 100 + Math.random() * 220, L.windows ? 60 + Math.random() * (FY1 - 60) : dy + 10 + Math.random() * 160);
        if (L.windows ? shaftAt(L.windows, pt.x, pt.y) > 0.3 : BEAMS.some((b) => inBeam(pt.x, pt.y - dy, b))) break;
      }
      out.x = pt.x; out.y = pt.y;
    },
  };
  scene.add.particles(0, 0, dot, {
    emitZone: { type: 'random', source } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    lifespan: { min: 3000, max: 6000 }, speedX: { min: 1, max: 5 }, speedY: { min: -2, max: 4 },
    alpha: { values: [0, 0.9, 0] }, tint: L.open ? 0xfff6d8 : L.windows ? 0xffd75e : P.moon2, frequency: L.open ? 30 : 90 / (L.beams ?? [0]).length, advance: 6000, // the cloister: three screens of it
  }).setDepth(8001).setBlendMode(Phaser.BlendModes.ADD);
  // Sparks of the abyss drifting up out of each hole, over its far edge (the cloister's pits are hedges).
  for (const b of L.open ? [] : L.pits)
    scene.add.particles(0, 0, dot, {
      emitZone: { type: 'random', source: { getRandomPoint(out: Phaser.Types.Math.Vector2Like) {
        out.x = b.x + 4 + Math.random() * (b.w - 8); out.y = b.y + 10 + Math.random() * (b.h - 12);
      } } } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      lifespan: { min: 1200, max: 2600 }, speedX: { min: -2, max: 2 }, speedY: { min: -14, max: -6 },
      alpha: { values: [0, 1, 0] }, tint: [P.abyss2, 0x8f195e, P.abyss2], frequency: (b.w * b.h) > 2000 ? 160 : 320, advance: 3000,
    }).setDepth(b.y + b.h - 11);
}
