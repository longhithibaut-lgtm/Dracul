import Phaser from 'phaser';
import { T } from './tuning.ts';

// How the arena looks and where its solid parts are.
export type Room = {
  bounds: Phaser.Geom.Rectangle; // walkable area
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  heroStart: { x: number; y: number };
  spawns: { x: number; y: number }[]; // fixed, so screenshots are comparable run to run
};

// A crypt hall seen in HLD's three-quarter view: a back wall with lancets, ossuaries and a portcullis
// the moon blazes through, a carved ritual medallion in the middle, braziers, pillars, coffins.
// Everything is painted pixel by pixel into canvas textures once, then reused on scene restarts.

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

type Prop = { kind: 'pillar' | 'stump' | 'brazier' | 'coffin' | 'coffinOpen'; x: number; y: number; w: number; h: number };
// x = footprint centre, y = footprint bottom (the feet line), w/h = footprint = static body.
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

function paintBackWall(p: Px) {
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
  gate(p);
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

function gate(p: Px) {
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
  for (let y = 4; y < 64; y++)
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
function gateSpill(x: number, y: number) {
  if (y < FY0 || y > FY0 + 100) return 0;
  const d = y - FY0, gx = CX + (x - CX - d * 0.12) / (1 + d * 0.012), gy = FY0 - d / 2;
  if (!inArch(gx, gy, CX, GATE.hw, GATE.ys, GATE.R) || portcullis(Math.round(gx), Math.round(gy))) return 0;
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
  // Ritual medallion: a smooth disc in a ring of crimson voussoirs, a blood channel, an eight-point star, a drain.
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
  const ang = (x: number, y: number) => Math.atan2(y + 0.5 - CY, x + 0.5 - CX);
  p.fill(CX - 52, CY - 52, CX + 52, CY + 52, (x, y) => dist(x, y) < 50, P.floor3);
  p.fill(CX - 52, CY - 52, CX + 52, CY + 52, (x, y) => dist(x, y) >= 41 && dist(x, y) < 50, P.wall1);
  p.fill(CX - 52, CY - 52, CX + 52, CY + 52, (x, y) => dist(x, y) >= 41 && dist(x, y) < 50 && hash(Math.floor(((ang(x, y) / Math.PI) * 12 + 24.5) % 24), 0, 6) < 0.4, mix(P.wall1, P.wall2, 0.5));
  engrave(p, (x, y) => {
    const d = dist(x, y);
    return Math.abs(d - 50) < 0.6 || Math.abs(d - 41) < 0.6 || (d > 41 && d < 50 && Math.abs((((ang(x, y) / Math.PI) * 12 + 24.5) % 1) - 0.5) < 0.06 * (46 / d));
  }, CX - 54, CY - 54, CX + 54, CY + 54, 0.6);
  p.fill(CX - 40, CY - 40, CX + 40, CY + 40, (x, y) => Math.abs(dist(x, y) - 37.5) < 1.2, P.blood0);
  p.fill(CX - 40, CY - 40, CX + 40, CY + 40, (x, y) => Math.abs(dist(x, y) - 37.5) < 1.2 && noise(x, y, 6, 3) > 0.6, P.blood1);
  p.fill(CX - 40, CY - 40, CX + 40, CY + 40, (x, y) => Math.abs(dist(x, y) - 36) < 0.5 && y < CY, P.void1, 0.6);
  const inStar = (x: number, y: number) => {
    const dx = Math.abs(x + 0.5 - CX), dy = Math.abs(y + 0.5 - CY);
    return dx + dy <= 33 || Math.max(dx, dy) <= 33 / Math.SQRT2;
  };
  p.fill(CX - 34, CY - 34, CX + 34, CY + 34, inStar, mix(P.floor3, P.stone1, 0.4));
  p.fill(CX - 23, CY - 23, CX + 23, CY + 23, (x, y) => dist(x, y) < 22, P.floor3);
  p.fill(CX - 15, CY - 15, CX + 15, CY + 15, (x, y) => dist(x, y) < 14, mix(P.floor2, P.wall1, 0.35));
  const star = new Set<number>();
  for (const rot of [0, Math.PI / 4]) {
    const v = [0, 1, 2, 3].map((k) => [CX + Math.cos(rot + (k * Math.PI) / 2) * 33, CY + Math.sin(rot + (k * Math.PI) / 2) * 33]);
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = v[k], [bx, by] = v[(k + 1) % 4], n = Math.ceil(Math.hypot(bx - ax, by - ay));
      for (let i = 0; i <= n; i++) star.add(Math.round(ax + ((bx - ax) * i) / n) + Math.round(ay + ((by - ay) * i) / n) * 1000);
    }
  }
  engrave(p, (x, y) => star.has(x + y * 1000), CX - 36, CY - 36, CX + 36, CY + 36, 0.5);
  engrave(p, (x, y) => Math.abs(dist(x, y) - 14) < 0.6 || Math.abs(dist(x, y) - 22) < 0.6, CX - 24, CY - 24, CX + 24, CY + 24, 0.45);
  p.ellipse(CX, CY, 6, 6, P.stone1);
  p.ellipse(CX, CY, 5, 5, P.void0);
  for (const dy of [-3, -1, 1, 3]) p.rect(CX - 4 + Math.abs(dy) / 2, CY + dy, 8 - Math.abs(dy), 1, P.stone0);
  splat(p, CX + 3, CY + 7, 4, 21, P.blood0, P.blood1);
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

function paintWear(p: Px) {
  const R = rng(5);
  // Cracks: wandering grooves that sometimes fork.
  const crack = (x: number, y: number, a: number, len: number) => {
    const pts = new Set<number>();
    const x0 = x, y0 = y;
    for (let i = 0; i < len; i++) {
      pts.add(Math.round(x) + Math.round(y) * 1000);
      a += (R() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (R() < 0.06 && len - i > 6) {
        let bx = x, by = y, ba = a + (R() < 0.5 ? 0.9 : -0.9);
        for (let j = 0; j < 6 + R() * 6; j++) { pts.add(Math.round(bx) + Math.round(by) * 1000); bx += Math.cos(ba); by += Math.sin(ba); ba += (R() - 0.5) * 0.6; }
      }
    }
    engrave(p, (i, j) => pts.has(i + j * 1000), x0 - len - 2, y0 - len - 2, x0 + len + 2, y0 + len + 2, 0.5);
  };
  crack(300, 238, -1.9, 22);
  crack(414, 176, 2.3, 18);
  crack(130, 204, -0.3, 16);
  // Missing slab corners with a lit broken edge.
  for (const [x, y] of [[344, 192], [120, 96], [184, 240], [312, 64]]) {
    p.fill(x, y, x + 9, y + 7, (i, j) => (i - x) + (j - y) * 1.3 < 9 + noise(i, j, 2, 9) * 3, P.void1);
    p.fill(x, y, x + 12, y + 10, (i, j) => p.get(i, j) === P.void1 && p.get(i, j + 1) !== P.void1, P.floor1);
  }
  // Pebbles and grit, gathered along the walls.
  for (let i = 0; i < 110; i++) {
    const near = R() < 0.65;
    const x = near ? (R() < 0.5 ? FX0 + 2 + R() * 22 : FX1 - 24 + R() * 22) : FX0 + R() * (FX1 - FX0);
    const y = FY0 + 4 + R() * (FY1 - FY0 - 6);
    if (Math.hypot(x - CX, y - CY) < 52) continue;
    p.p(x, y, R() < 0.5 ? P.stone1 : P.floor3);
    p.tint(x + 1, y + 1, P.void0, 0.5);
  }
  // Rubble from the broken pillar: chunks with a lit top face and a dark front.
  for (const [x, y, w, h] of [[404, 146, 7, 4], [412, 150, 5, 3], [398, 152, 4, 3], [416, 142, 3, 2], [406, 156, 3, 2], [372, 150, 4, 3]]) {
    p.rect(x + 1, y + h, w, 2, P.void0, 0.45);
    p.rect(x, y, w, h, P.stone1);
    p.rect(x, y, w, 1, P.stone2);
    p.rect(x, y + h - 1, w, 1, P.stone0);
    p.p(x + w - 1, y, P.stone1);
  }
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

/** Light sources baked into the background; braziers also get a flickering overlay. */
const BRAZIERS = PROPS.filter((o) => o.kind === 'brazier');
const CANDLES: [number, number, number][] = [[54, 236, 3], [128, 240, 2], [62, 82, 3], [414, 80, 2], [334, 246, 3]];
const LANCETS = [CX - 100, CX + 100];
const MOON_POOL = [CX - 2, CY - 4, 84, 64] as const;

function paintLight(p: Px) {
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
  light(p, ...MOON_POOL, P.moon1, [0.15, 0.32], 0.06, 4, 22);
  // Warm pools on the floor and the wall behind: fire pulls the cold floor toward its own colour, so it reads warm on blue.
  for (const b of BRAZIERS) light(p, b.x, b.y - 14, 38, 30, mix(P.fire, P.blood2, 0.3), [0.12, 0.24, 0.36], 0.08, b.x, 12, 'tint');
  for (const [x, y, n] of CANDLES) light(p, x + n * 1.5, y - 2, 10 + n * 2, 7 + n * 2, P.fire, [0.14, 0.28], 0.06, x, 8, 'tint');
}

/** Shadows cast by the props, toward the bottom right. */
function paintShadows(p: Px) {
  for (const o of PROPS) {
    const l = o.x - o.w / 2, r = o.x + o.w / 2;
    const reach = o.kind === 'pillar' ? 34 : o.kind === 'stump' ? 18 : o.kind === 'brazier' ? 10 : 9;
    p.fill(l - 2, o.y - o.h, r + reach * 1.2, o.y + reach * 0.6, (x, y) => {
      const t = (y - o.y + o.h * 0.5) / (reach * 0.6);
      return t >= -0.6 && t <= 1 && x >= l + t * reach * 0.9 && x <= r + t * reach * 1.1;
    }, P.void0, 0.45);
  }
}

function paintBackground(p: Px) {
  // Beyond the side walls: a crimson dark with pillars receding into it.
  p.rect(0, 0, p.w, p.h, P.abyss1);
  for (const x of [4, 18, 462, 476]) {
    p.rect(x - 4, 0, 8, T.height, P.abyss0);
    p.rect(x - 4, 0, 1, T.height, P.abyss2);
  }
  paintFloor(p);
  paintWear(p);
  ledger(p, 108, 168, false);
  ledger(p, 346, 160, true);
  paintGore(p);
  skull(p, 70, 152); bone(p, 77, 156, 5); bone(p, 64, 158, 4, true);
  skull(p, 424, 128); bone(p, 416, 132, 6);
  skull(p, 120, 250); bone(p, 404, 248, 5); bone(p, 292, 84, 4);
  paintShadows(p);
  paintBackWall(p);
  // Side wall tops (seen from above): the right wall's inner rim faces the light, the left one's is in shadow.
  for (const x of [FX0 - 12, FX1]) wallTop(p, x, 0, 12, T.height);
  p.rect(FX1, 9, 1, T.height, P.stone0);
  p.rect(FX0 - 12, 0, 1, T.height, P.stone0);
  p.rect(FX0 - 1, 9, 1, T.height, P.void0);
  p.rect(FX0, FY0, 2, FY1 - FY0, P.void0, 0.4);
  for (const [x, y, n] of CANDLES) candles(p, x, y, n, x * 7 + y);
  cobweb(p, FX1 - 1, 10, 22);
  paintLight(p);
}

// ---------- props ----------

/** Cylinder shading for a 16 px column, lit from the left. */
const COLUMN = [P.stone2, P.stone2, P.stone2, P.stone1, P.stone1, P.stone1, P.stone1, P.stone1, P.stone0, P.stone0, P.stone0, P.stone0, P.stone0, P.void2, P.void2, P.void1];
const column = (p: Px, x: number, y: number, w: number) => {
  for (let i = 0; i < w; i++) p.p(x + i, y, COLUMN[Math.min(15, Math.floor((i * 16) / w))]);
};

function paintPillar(p: Px, broken: boolean) {
  const H = p.h, top = broken ? H - 46 : 10;
  // Plinth: top surface then front face.
  p.rect(1, H - 13, 26, 8, P.stone1);
  p.rect(1, H - 13, 26, 1, P.stone2);
  p.rect(1, H - 13, 1, 8, P.stone2);
  p.rect(1, H - 5, 26, 5, P.stone0);
  p.rect(1, H - 5, 26, 1, mix(P.stone1, P.stone2, 0.5));
  p.rect(1, H - 5, 1, 5, P.stone1);
  p.rect(26, H - 13, 1, 13, P.void2);
  p.rect(1, H - 1, 26, 1, P.void2);
  // Shaft with fluting and drum joints; a broken one is snapped along a jagged line, high on the left.
  const snap = [-6, -8, -7, -5, -6, -3, -2, -4, -1, 1, 0, 2, 4, 3, 5, 6];
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

function paintShaft(p: Px) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      let k = 0;
      const t = (y - SHAFT.top) / (SHAFT.bottom - SHAFT.top);
      for (const b of BEAMS) if (inBeam(x, y, b)) k += b.k * (t > b.len - 0.12 ? 0.55 : 1);
      if (k > 0) p.p(x, y, P.moon2, k);
    }
  // The same pool again, faint, so whoever stands in it catches the moon.
  light(p, ...MOON_POOL, P.moon2, [0.035, 0.07], 0.06, 4, 22, "paint");
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

// ---------- build ----------

export function build(scene: Phaser.Scene): Room {
  scene.add.image(0, 0, bake(scene, 'room-bg', T.width, T.height, paintBackground)).setOrigin(0).setDepth(-1000);

  const obstacles = scene.physics.add.staticGroup();
  for (const o of PROPS) {
    // Characters sort by their sprite centre (feet - ~11 px), so a prop sorts at its feet line minus that.
    const depth = o.y - 11;
    if (o.kind === 'pillar' || o.kind === 'stump') {
      const key = bake(scene, `room-${o.kind}`, 28, o.kind === 'pillar' ? o.y : 58, (p) => paintPillar(p, o.kind === 'stump'));
      scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setDepth(depth);
    } else if (o.kind === 'brazier') {
      scene.add.image(o.x, o.y, bake(scene, 'room-brazier', 17, 23, paintBrazier)).setOrigin(0.5, 1).setDepth(depth);
      flame(scene, o.x, o.y - 17, depth);
    } else {
      const key = bake(scene, `room-${o.kind}`, o.w + 2, o.kind === 'coffinOpen' ? 46 : 34, (p) => paintCoffin(p, o.kind === 'coffinOpen'));
      scene.add.image(o.x - o.w / 2 - 1, o.y, key).setOrigin(0, 1).setDepth(depth);
    }
    obstacles.add(scene.add.zone(o.x, o.y - o.h / 2, o.w, o.h));
  }

  scene.add.image(0, 0, bake(scene, 'room-shaft', T.width, T.height, paintShaft)).setOrigin(0).setDepth(8000).setBlendMode(Phaser.BlendModes.ADD);
  atmosphere(scene);
  scene.add.image(0, 0, bake(scene, 'room-front', T.width, T.height, paintFront)).setOrigin(0).setDepth(8500);
  scene.add.image(0, 0, bake(scene, 'room-vignette', T.width, T.height, paintVignette)).setOrigin(0).setDepth(10_000);

  const room: Room = {
    bounds: new Phaser.Geom.Rectangle(FX0, FY0, FX1 - FX0, FY1 - FY0),
    obstacles,
    heroStart: { x: CX, y: 222 },
    spawns: [{ x: CX, y: 100 }, { x: 64, y: 176 }, { x: 416, y: 176 }],
  };
  // Self-check: every start point is inside the hall and clear of every footprint (with a body's margin).
  for (const s of [room.heroStart, ...room.spawns])
    console.assert(
      room.bounds.contains(s.x, s.y + 8) && PROPS.every((o) => Math.abs(s.x - o.x) > o.w / 2 + 8 || Math.abs(s.y + 8 - (o.y - o.h / 2)) > o.h / 2 + 6),
      'room: start point blocked', s,
    );
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

function atmosphere(scene: Phaser.Scene) {
  // Dust motes drifting inside the moon beams.
  const dot = bake(scene, 'room-dot', 1, 1, (p) => p.p(0, 0, 0xffffff));
  const pt = new Phaser.Math.Vector2();
  const source = {
    getRandomPoint(out: Phaser.Types.Math.Vector2Like) {
      for (let i = 0; i < 20; i++) {
        pt.set(100 + Math.random() * 220, 10 + Math.random() * 160);
        if (BEAMS.some((b) => inBeam(pt.x, pt.y, b))) break;
      }
      out.x = pt.x; out.y = pt.y;
    },
  };
  scene.add.particles(0, 0, dot, {
    emitZone: { type: 'random', source } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    lifespan: { min: 3000, max: 6000 }, speedX: { min: 1, max: 5 }, speedY: { min: -2, max: 4 },
    alpha: { values: [0, 0.9, 0] }, tint: P.moon2, frequency: 90, advance: 6000,
  }).setDepth(8001).setBlendMode(Phaser.BlendModes.ADD);
}
