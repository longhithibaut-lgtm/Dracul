import Phaser from 'phaser';
import { T } from './tuning.ts';

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
  holy(x: number, y: number): boolean; // a floor point in holy light that never goes out (the chapel's stained glass)
};

// Crypt rooms seen in HLD's three-quarter view, all one shell: a back wall with lancets, ossuaries and a portcullis
// the moon blazes through, side walls, stairs in the front wall, a floor of cobalt slabs. Each layout fills it its own
// way: the hall (a carved ritual medallion, braziers, pillars, coffins), the nave (two rows of pillars along a central
// lane), the collapsed ossuary (the floor fallen into the abyss in places), the chapel (stained glass casting holy light
// on the floor between rows of pews, an altar at the back).
// Everything is painted pixel by pixel into canvas textures once, then reused on scene restarts.
export const LAYOUTS = ['hall', 'nave', 'ossuary', 'chapel'] as const;
export type LayoutId = (typeof LAYOUTS)[number];

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

// Floor rectangle = walkable bounds (feet). Walls: back face above FY0, side caps 12 px, front cap below FY1.
const FX0 = 40, FX1 = 440, FY0 = 64, FY1 = 256;
const CX = 240, CY = 160; // ritual medallion centre

type Prop = { kind: 'pillar' | 'stump' | 'brazier' | 'coffin' | 'coffinOpen' | 'heap' | 'pew' | 'altar'; x: number; y: number; w: number; h: number; tall?: number; flip?: boolean };
// x = footprint centre, y = footprint bottom (the feet line), w/h = footprint = static body. A stump's `tall` is its
// texture height (58 by default: the shorter, the lower it broke), `flip` mirrors its break.
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

function gate(p: Px, bars: boolean) {
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
      p.p(x, y, y < 26 ? P.moon0 : y < 38 ? mix(P.moon0, P.moon1, 0.55) : stair === 0 ? P.moon2 : stair < 3 ? mix(P.moon1, P.moon2, 0.35) : P.moon1);
    }
  // The reveal catches that light.
  for (let y = 4; y < 64; y++)
    for (let x = CX - 30; x <= CX + 30; x++)
      if (inArch(x, y, CX, hw + 3, ys, R + 3) && !inArch(x, y, CX, hw, ys, R)) p.tint(x, y, P.moon1, 0.25);
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
  for (let ty = 0; ty < 12; ty++)
    for (let tx = 0; tx < 25; tx++) {
      const x = FX0 + tx * 16, y = FY0 + ty * 16;
      const border = tx === 0 || tx === 24 || ty === 11;
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

/** The ritual medallion at the centre, `s` times the hall's (radius 50): a smooth disc in a ring of crimson voussoirs,
 *  a blood channel, an eight-point star, a drain; `frame`: the crimson inlaid square around it, with its runnels. */
function medallion(p: Px, s: number, frame: boolean) {
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
  const gap = (x: number, y: number) => Math.min(Math.abs(x + 0.5 - CX), Math.abs(y + 0.5 - CY)) < 7;
  p.fill(CX - 64, CY - 64, CX + 64, CY + 64, (x, y) => sq(x, y) > 59 && sq(x, y) < 62 && !gap(x, y), mix(P.wall1, P.floor2, 0.45));
  engrave(p, (x, y) => (Math.abs(sq(x, y) - 59.5) < 0.6 || Math.abs(sq(x, y) - 62.5) < 0.6) && !gap(x, y), CX - 64, CY - 64, CX + 64, CY + 64, 0.45);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ox = CX + sx * 61, oy = CY + sy * 61;
    p.rect(ox - 4, oy - 4, 8, 8, P.wall1);
    p.rect(ox - 2, oy - 2, 4, 4, P.blood0);
    p.rect(ox - 2, oy - 2, 4, 1, P.blood1);
    engrave(p, (x, y) => Math.max(Math.abs(x + 0.5 - ox), Math.abs(y + 0.5 - oy)) === 4.5, ox - 6, oy - 6, ox + 6, oy + 6, 0.5);
  }
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
    engrave(p, (x, y) => {
      const along = (x + 0.5 - CX) * dx + (y + 0.5 - CY) * dy, across = (x + 0.5 - CX) * dy - (y + 0.5 - CY) * dx;
      return Math.abs(Math.abs(across) - 2) < 0.6 && along > 50 && along < 66;
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
  grit(p, R, 110, (x, y) => Math.hypot(x - CX, y - CY) >= 52);
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
  medallion: number; // its size, the hall's = 1
  frame: boolean; // the crimson square around the medallion
  pool: readonly [number, number, number, number]; // the moon pool on it: centre and radii
  heroStart: P; spawns: P[]; spots: P[];
  gift?: P; // where the gift rises, if not on the medallion
  windows?: P[]; // tips of the stained-glass panes of holy light on the floor, see pane()
  decor(p: Px): void; // wear, gore, bones on the floor, before the props cast their shadows
};
const NAVE_ROSETTE = 0.6;

const LAYOUT: Record<LayoutId, Layout> = {
  // The validated hall: fights in the open middle, around the great medallion.
  hall: {
    props: PROPS,
    pits: [],
    candles: [[54, 236, 3], [128, 240, 2], [62, 82, 3], [414, 80, 2], [334, 246, 3]],
    medallion: 1, frame: true,
    pool: [CX - 2, CY - 4, 84, 64],
    // The hero starts on the medallion and the wave rises around it, so fights play out in the open middle.
    heroStart: { x: CX, y: CY },
    spawns: [{ x: CX, y: 88 }, { x: 120, y: CY }, { x: 360, y: CY }],
    // Around the medallion, leaving dark lanes between pools (48 px across, 26 px down) and the medallion itself dark.
    spots: [{ x: 176, y: 125 }, { x: 304, y: 125 }, { x: 176, y: 209 }, { x: 304, y: 209 }],
    decor: hallDecor,
  },
  // La nef: a central lane down a runner, between two rows of pillars (whole at the back, snapped further down) that
  // shelter the side aisles from bolts; crossbowmen rise in the aisles and shoot through the gaps.
  nave: {
    props: [
      { kind: 'pillar', x: 168, y: 112, w: 24, h: 12 },
      { kind: 'pillar', x: 312, y: 112, w: 24, h: 12 },
      { kind: 'stump', x: 168, y: 168, w: 24, h: 12 },
      { kind: 'stump', x: 312, y: 168, w: 24, h: 12, flip: true },
      { kind: 'stump', x: 168, y: 224, w: 24, h: 12, tall: 44, flip: true },
      { kind: 'stump', x: 312, y: 224, w: 24, h: 12, tall: 48 },
      { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 },
      { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
      { kind: 'coffin', x: 98, y: 206, w: 46, h: 14 },
      { kind: 'coffinOpen', x: 386, y: 140, w: 62, h: 14 },
    ],
    pits: [],
    candles: [[58, 84, 3], [184, 120, 2], [290, 120, 2], [54, 240, 3], [408, 246, 2], [406, 82, 2]],
    medallion: NAVE_ROSETTE, frame: false,
    pool: [CX, CY - 2, 46, 40],
    heroStart: { x: CX, y: CY },
    spawns: [{ x: CX, y: 92 }, { x: 96, y: 134 }, { x: 386, y: 194 }],
    spots: [{ x: 206, y: 130 }, { x: 274, y: 204 }, { x: 98, y: 98 }, { x: 384, y: 234 }],
    decor: naveDecor,
  },
  // L'ossuaire effondré: the floor has fallen into the abyss along the walls and in holes; walkers go round, bolts and
  // shards fly over. Few props, little cover, and the edges are where one gets cornered.
  ossuary: {
    props: [
      { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 },
      { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
      { kind: 'heap', x: 66, y: 86, w: 24, h: 8 },
      { kind: 'heap', x: 410, y: 238, w: 24, h: 8 },
    ],
    pits: [
      { x: 40, y: 128, w: 80, h: 48 }, { x: 40, y: 172, w: 48, h: 28 }, { x: 96, y: 120, w: 32, h: 28 }, // west: against the wall
      { x: 360, y: 96, w: 80, h: 48 }, { x: 392, y: 140, w: 48, h: 20 }, { x: 346, y: 116, w: 24, h: 24 }, // east
      { x: 152, y: 80, w: 32, h: 32 }, // back left
      { x: 280, y: 200, w: 64, h: 32 }, // front right, where the medallion's crack ran
      { x: 128, y: 216, w: 32, h: 24 }, // front left
    ],
    candles: [[62, 236, 3], [404, 80, 2], [296, 248, 2]],
    medallion: 0.68, frame: false,
    pool: [CX, CY - 2, 58, 46],
    heroStart: { x: CX, y: CY },
    spawns: [{ x: CX, y: 92 }, { x: 102, y: 100 }, { x: 392, y: 194 }],
    spots: [{ x: 172, y: 154 }, { x: 306, y: 164 }, { x: 190, y: 226 }, { x: 318, y: 112 }],
    decor: ossuaryDecor,
  },
  // La chapelle aux vitraux: the Order's chapel. Stained glass high in the unseen left wall lays four panes of holy light
  // on the floor that burn the vampire (not the ghouls, like a lantern's pool); the mist goes through unharmed. Two
  // banks of pews face the altar at the back, low cover from bolts; the gift rises on the altar step.
  chapel: {
    props: [
      { kind: 'altar', x: CX, y: 104, w: 40, h: 10 },
      { kind: 'brazier', x: 184, y: 100, w: 12, h: 8 },
      { kind: 'brazier', x: 296, y: 100, w: 12, h: 8 },
      ...[156, 192, 228].flatMap((y) => [{ kind: 'pew' as const, x: 140, y, w: 64, h: 8 }, { kind: 'pew' as const, x: 340, y, w: 64, h: 8 }]),
    ],
    pits: [],
    candles: [[52, 80, 3], [418, 84, 2], [58, 242, 2], [412, 244, 3]],
    medallion: 0, frame: false,
    pool: [CX, 120, 30, 18],
    heroStart: { x: CX, y: 140 },
    spawns: [{ x: CX, y: 78 }, { x: 74, y: 210 }, { x: 406, y: 120 }],
    spots: [{ x: 206, y: 222 }, { x: 276, y: 132 }, { x: 88, y: 240 }, { x: 400, y: 92 }],
    gift: { x: CX, y: 118 },
    windows: [{ x: 196, y: 118 }, { x: 262, y: 166 }, { x: 52, y: 118 }, { x: 384, y: 184 }],
    decor: chapelDecor,
  },
};

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
}

/** The nave's runner: a rotten crimson carpet from the stairs to the gate, frayed, stained and worn bald in places,
 *  running under the rosette. */
function runner(p: Px) {
  const x0 = CX - 16, x1 = CX + 16, r = 50 * NAVE_ROSETTE + 3;
  for (let y = FY0 + 3; y < FY1; y++)
    for (let x = x0; x < x1; x++) {
      if (Math.hypot(x + 0.5 - CX, y + 0.5 - CY) < r) continue;
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
  for (let y = FY0 + 3; y < FY1; y++) if (Math.hypot(x1 + 0.5 - CX, y + 0.5 - CY) >= r) p.tint(x1, y, P.void0, 0.4);
  // Rucked up in a few folds: a lit crest, a dark trough.
  for (const y of [102, 206, 228])
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
  chips(p, [[216, 222], [296, 64], [120, 64], [344, 176], [72, 104]]);
  grit(p, R, 140, () => true);
  // Slabs broken up around the holes.
  rubble(p, [[124, 150, 6, 4], [130, 158, 4, 3], [122, 178, 3, 2], [96, 204, 5, 3], [348, 108, 5, 3], [352, 132, 4, 3],
    [380, 166, 6, 4], [190, 104, 4, 3], [186, 82, 3, 2], [270, 216, 4, 3], [274, 204, 3, 2], [348, 238, 6, 4], [164, 236, 4, 3]]);
  // The dead spilled out of the fallen ossuary niches: a skull and its bones here and there, none on the medallion.
  const S = rng(83), pit = (x: number, y: number) => L.pits.some((b) => x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10);
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(FX0 + 20 + S() * (FX1 - FX0 - 40)), y = Math.floor(FY0 + 8 + S() * (FY1 - FY0 - 30)), k = S();
    if (pit(x, y) || Math.hypot(x - CX, y - CY) < 44 || Math.abs(x - CX) < 18) continue;
    skull(p, x, y);
    if (k < 0.3) bone(p, x + 6, y + 1 + Math.floor(k * 12), 5);
    else if (k < 0.55) bone(p, x - 6, y + 4, 5), bone(p, x + 1, y + 6, 4, true);
    else if (k < 0.8) skull(p, x + 5, y + 2), bone(p, x - 3, y + 7, 6);
    else bone(p, x + 6, y - 2, 6, true);
  }
  splat(p, 222, 196, 4, 84, P.blood0, P.blood1, P.blood2);
  splat(p, 330, 150, 3, 85, P.blood0, mix(P.blood0, P.blood1, 0.5));
  pool(p, 98, 236, 10, 5, 86);
}

function chapelDecor(p: Px) {
  const R = rng(101);
  crackAt(p, R, 120, 248, -1.2, 14);
  crackAt(p, R, 420, 150, 2.4, 16);
  crackAt(p, R, 300, 238, -1.8, 12);
  chips(p, [[72, 170], [330, 76], [150, 72], [420, 220]]);
  grit(p, R, 90, (x) => Math.abs(x - CX) > 30);
  // The altar's dais: two pale steps the gift rises from.
  for (const [d, c] of [[0, P.stone1], [3, P.stone2]] as const) {
    p.rect(CX - 30 + d * 2, 96 + d, 60 - d * 4, 28 - d * 2, c);
    p.rect(CX - 30 + d * 2, 96 + d, 60 - d * 4, 1, mix(c, P.bone0, 0.4));
    p.rect(CX - 30 + d * 2, 123 - d, 60 - d * 4, 1, mix(c, P.void0, 0.5));
  }
  engrave(p, (x, y) => Math.abs(Math.hypot(x + 0.5 - CX, (y + 0.5 - 118) * 1.6) - 7) < 0.6, CX - 10, 110, CX + 10, 126, 0.5);
  // Glass the Order's windows lost, glinting on the slabs, and the blood of whoever prayed here last.
  for (let i = 0; i < 40; i++) {
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
  // The great moon pool on the medallion.
  light(p, ...L.pool, P.moon1, [0.15, 0.32], 0.06, 4, 22);
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
    const reach = o.kind === 'pillar' ? 34 : o.kind === 'stump' ? Math.round(((o.tall ?? 58) * 18) / 58) : o.kind === 'brazier' ? 10 : o.kind === 'heap' ? 8 : 9;
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
  for (const [sx, sy, w, h, skew] of [[54, 150, 20, 13, 0.45], [404, 118, 18, 12, -0.5], [298, 212, 16, 10, 0.35], [58, 182, 12, 8, -0.3]])
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
    p.rect(x - 4, 0, 8, T.height, P.abyss0);
    p.rect(x - 4, 0, 1, T.height, P.abyss2);
  }
  paintFloor(p);
  if (L.medallion) medallion(p, L.medallion, L.frame);
  L.decor(p);
  paintShadows(p, L.props);
  paintBackWall(p, bars);
  // Side wall tops (seen from above): the right wall's inner rim faces the light, the left one's is in shadow.
  for (const x of [FX0 - 12, FX1]) wallTop(p, x, 0, 12, T.height);
  p.rect(FX1, 9, 1, T.height, P.stone0);
  p.rect(FX0 - 12, 0, 1, T.height, P.stone0);
  p.rect(FX0 - 1, 9, 1, T.height, P.void0);
  p.rect(FX0, FY0, 2, FY1 - FY0, P.void0, 0.4);
  for (const [x, y, n] of L.candles) candles(p, x, y, n, x * 7 + y);
  cobweb(p, FX1 - 1, 10, 22);
  paintLight(p, L);
  paintPits(p, L.pits);
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
  if (L.windows) for (let y = 0; y < FY1; y++)
    for (let x = 0; x < p.w; x++) {
      const k = shaftAt(L.windows, x, y);
      if (k > 0) p.p(x, y, 0xffd75e, 0.03 + k * 0.07);
    }
  else for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      let k = 0;
      const t = (y - SHAFT.top) / (SHAFT.bottom - SHAFT.top);
      for (const b of BEAMS) if (inBeam(x, y, b)) k += b.k * (t > b.len - 0.12 ? 0.55 : 1);
      if (k > 0) p.p(x, y, P.moon2, k);
    }
  // The same pool again, faint, so whoever stands in it catches the moon.
  light(p, ...L.pool, P.moon2, [0.035, 0.07], 0.06, 4, 22, "paint");
  for (let y = FY0; y < FY0 + 100; y++) for (let x = CX - 60; x < CX + 80; x++) if (gateSpill(x, y)) p.p(x, y, P.moon2, gateSpill(x, y) * 0.08);
  for (let y = FY0; y < FY0 + 60; y++) for (let x = FX0; x < FX1; x++) if (lancetSpill(x, y)) p.p(x, y, P.moon2, 0.05);
}

function paintVignette(p: Px) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = Math.hypot((x - CX) / 250, (y - 150) / 150);
      const a = Math.min(1, Math.max(0, (v - 0.66) / 0.6)) ** 1.6 * 0.8;
      if (a > 0) p.p(x, y, P.abyss0, a);
    }
}

function paintFront(p: Px) {
  // Front wall top (seen from above), steps down into the dark in the middle, its outer face below.
  const sx0 = CX - 22, sx1 = CX + 22;
  for (let x = FX0 - 12; x < FX1 + 12; x++) {
    if (x >= sx0 && x < sx1) continue;
    p.rect(x, FY1, 1, 8, P.void1);
    p.p(x, FY1, P.stone0);
    p.rect(x, FY1 + 8, 1, T.height - FY1 - 8, P.void0);
    if (x % 16 === 0) p.rect(x, FY1 + 1, 1, 7, P.void2);
  }
  for (let y = FY1; y < T.height; y++) {
    const step = Math.floor((y - FY1) / 4);
    p.rect(sx0, y, sx1 - sx0, 1, (y - FY1) % 4 === 0 ? mix(P.stone1, P.void0, step * 0.25) : mix(P.stone0, P.void0, 0.3 + step * 0.2));
  }
  p.rect(sx0 - 1, FY1, 1, T.height - FY1, P.stone0);
  p.rect(sx1, FY1, 1, T.height - FY1, P.void0);
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
  const open = new Px(T.width, T.height), shut = new Px(T.width, T.height);
  paintBackground(open, LAYOUT[id], false);
  paintBackground(shut, LAYOUT[id]);
  bake(scene, `room-bg-${id}`, T.width, T.height, (p) => p.d.set(open.d));
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
  const L = LAYOUT[id];
  if (!BARS_OF[id]) paintHall(scene, id); // painted on the layout's first build, kept across restarts
  BARS = BARS_OF[id]!;
  scene.add.image(0, 0, `room-bg-${id}`).setOrigin(0).setDepth(-1000);
  drawGate(scene, 0); // the previous room left it open
  scene.add.image(GX, GY, 'room-gate').setOrigin(0).setDepth(-999);
  scene.add.image(GLX, FY0, bake(scene, 'room-gatelight', 140, 100, paintGateLight)).setOrigin(0).setDepth(-998)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setName('room-gatelight');

  const obstacles = scene.physics.add.staticGroup();
  for (const o of L.props) {
    // Characters sort by their sprite centre (feet - ~11 px), so a prop sorts at its feet line minus that.
    const depth = o.y - 11;
    if (o.kind === 'pillar' || o.kind === 'stump') {
      const h = o.kind === 'pillar' ? o.y : o.tall ?? 58; // a whole pillar runs up to the top of the screen
      const key = bake(scene, `room-${o.kind}-${h}${o.flip ? '-flip' : ''}`, 28, h, (p) => paintPillar(p, o.kind === 'stump', o.flip));
      scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'brazier') {
      scene.add.image(o.x, o.y, bake(scene, 'room-brazier', 17, 23, paintBrazier)).setOrigin(0.5, 1).setDepth(depth);
      flame(scene, o.x, o.y - 17, depth);
    } else if (o.kind === 'pew' || o.kind === 'altar') {
      scene.add.image(o.x, o.y, bake(scene, `room-${o.kind}`, o.w + 2, o.kind === 'pew' ? 20 : 30, o.kind === 'pew' ? paintPew : paintAltar)).setOrigin(0.5, 1).setDepth(depth);
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

  scene.add.image(0, 0, bake(scene, `room-shaft-${id}`, T.width, T.height, (p) => paintShaft(p, L))).setOrigin(0).setDepth(8000).setBlendMode(Phaser.BlendModes.ADD);
  atmosphere(scene, L);
  scene.add.image(0, 0, bake(scene, 'room-front', T.width, T.height, paintFront)).setOrigin(0).setDepth(8500);
  scene.add.image(0, 0, bake(scene, 'room-vignette', T.width, T.height, paintVignette)).setOrigin(0).setDepth(10_000);

  const room: Room = {
    bounds: new Phaser.Geom.Rectangle(FX0, FY0, FX1 - FX0, FY1 - FY0),
    obstacles,
    pits,
    heroStart: L.heroStart,
    spawns: L.spawns,
    spots: L.spots,
    medallion: L.gift ?? { x: CX, y: CY },
    gate: { x: CX, y: FY0 },
    stairs: { x: CX, y: FY1 + 10 }, // feet off screen, the head showing above the steps
    holy: (x, y) => !!L.windows && pane(L.windows, Math.floor(x), Math.floor(y)) > 0,
  };
  // Self-check: every start point is inside the room and clear of every footprint and pit (with a body's margin), and
  // so is every lantern spot.
  const clear = (s: P, feet: number) => room.bounds.contains(s.x, s.y + feet)
    && [...L.props.map((o) => ({ x: o.x - o.w / 2, y: o.y - o.h, w: o.w, h: o.h })), ...L.pits].every((b) => boxDist([b], s.x, s.y + feet) > 7);
  for (const s of [room.heroStart, ...room.spawns]) console.assert(clear(s, 8), 'room: start point blocked', id, s);
  for (const s of room.spots) console.assert(clear(s, 0), 'room: lantern spot blocked', id, s);
  // And the holy light leaves the hero's start, the gift and the lane up from the stairs dark.
  const lane = Array.from({ length: 12 }, (_, i) => ({ x: CX, y: FY1 - i * 8 }));
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
  // Dust motes drifting inside the moon beams.
  const dot = bake(scene, 'room-dot', 1, 1, (p) => p.p(0, 0, 0xffffff));
  const pt = new Phaser.Math.Vector2();
  const source = {
    getRandomPoint(out: Phaser.Types.Math.Vector2Like) {
      for (let i = 0; i < 20; i++) {
        pt.set(L.windows ? Math.random() * 440 : 100 + Math.random() * 220, (L.windows ? 60 : 10) + Math.random() * 160);
        if (L.windows ? shaftAt(L.windows, pt.x, pt.y) > 0.3 : BEAMS.some((b) => inBeam(pt.x, pt.y, b))) break;
      }
      out.x = pt.x; out.y = pt.y;
    },
  };
  scene.add.particles(0, 0, dot, {
    emitZone: { type: 'random', source } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    lifespan: { min: 3000, max: 6000 }, speedX: { min: 1, max: 5 }, speedY: { min: -2, max: 4 },
    alpha: { values: [0, 0.9, 0] }, tint: L.windows ? 0xffd75e : P.moon2, frequency: 90, advance: 6000,
  }).setDepth(8001).setBlendMode(Phaser.BlendModes.ADD);
  // Sparks of the abyss drifting up out of each hole, over its far edge.
  for (const b of L.pits)
    scene.add.particles(0, 0, dot, {
      emitZone: { type: 'random', source: { getRandomPoint(out: Phaser.Types.Math.Vector2Like) {
        out.x = b.x + 4 + Math.random() * (b.w - 8); out.y = b.y + 10 + Math.random() * (b.h - 12);
      } } } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      lifespan: { min: 1200, max: 2600 }, speedX: { min: -2, max: 2 }, speedY: { min: -14, max: -6 },
      alpha: { values: [0, 1, 0] }, tint: [P.abyss2, 0x8f195e, P.abyss2], frequency: (b.w * b.h) > 2000 ? 160 : 320, advance: 3000,
    }).setDepth(b.y + b.h - 11);
}
