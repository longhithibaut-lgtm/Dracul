// The trial room « La salle de torture (essai) », in the "Crasse et faim" direction (docs/decisions.md): a torture crypt
// painted with the code of the mockup the user picked (near black, grimy brown-grey flagstones, sick greens, dried blood,
// corpses on chains, cages, a body pit, a drain). Pure pixels, no Phaser: room.ts bakes them into textures and dark.ts
// lights them. Albedo is painted in linear light, exposed as under a plain light, tone-mapped, graded and snapped to the
// mockup's palette with an ordered dither; the lights at run time only darken and tint it (a multiply layer).

export const W = 480, H = 638, WB = 64; // the room, and the back wall's base (the floor's back edge)
const FY1 = H - 14; // the floor's front edge
type V3 = [number, number, number];

// ---------- the room's plan (floor coordinates: x, y on the floor) ----------

export const PILLARS: [x: number, y: number][] = [[112, 150], [368, 150], [112, 500], [368, 500]]; // feet line, 24x12
export const CAGES: [x: number, y: number][] = [[392, 300], [92, 596]]; // floor cages, feet line, 24x12
export const PIT = { x: 150, y: 300, w: 72, h: 36 }; // the body pit (walkers go round)
export const HANGING: [x: number, y: number][] = [[300, 128], [186, 322], [330, 456]]; // corpses on chains, over this floor point
export const HCAGE: [x: number, y: number] = [84, 286]; // a cage hung high, over this floor point
const DRAINS: [number, number][] = [[300, 362], [214, 540]];
/** Lights of the room: x, y the floor point under the flame, h its height, k its strength (0: burnt out). */
export const TORCHES: [x: number, y: number, h: number, k: number][] = [
  [112, 151, 31, 1], [368, 151, 31, 0.75], [112, 501, 31, 1], [368, 501, 31, 0.45], // on the pillars' faces
  [196, WB, 33, 1], [332, WB, 33, 0], // sconces on the back wall
];

// ---------- noise and colour (linear rgb) ----------

const h2 = (x: number, y: number, s = 0) => {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const vn = (x: number, y: number, s = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, o = 4, s = 0) => {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; }
  return t / n;
};
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hex = (s: string): V3 => { const v = parseInt(s.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const L = (s: string) => hex(s).map((v) => v ** 2.2) as V3;
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

const C = {
  mortar: L('#110f0c'), stoneA: L('#4a4337'), stoneB: L('#5a5041'), stoneC: L('#43433e'),
  grime: L('#1e1a14'), moss: L('#3c4526'), mossL: L('#56602f'), blood: L('#560208'), bloodF: L('#74040c'), bloodD: L('#300105'),
  wall: L('#342f29'), wallL: L('#433b32'), wallD: L('#1e1b17'), pil: L('#5a564c'), pilL: L('#6e695b'), cap: L('#0d0c0a'), capEdge: L('#2c2721'),
  iron: L('#25211e'), rust: L('#5b3520'), rustL: L('#7d4a28'), bone: L('#b8ab8c'), boneD: L('#7a6f5a'),
};

/** A layer of linear albedo plus light it gives off itself; alpha 0 where nothing is painted. */
class Cv {
  readonly alb: Float32Array; readonly emi: Float32Array; readonly a: Uint8Array; readonly w: number; readonly h: number;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.alb = new Float32Array(w * h * 3); this.emi = new Float32Array(w * h * 3); this.a = new Uint8Array(w * h);
  }
  i(x: number, y: number) { x |= 0; y |= 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  put(x: number, y: number, c: V3) { const i = this.i(x, y); if (i < 0) return; this.alb.set(c, i * 3); this.emi.fill(0, i * 3, i * 3 + 3); this.a[i] = 1; }
  glow(x: number, y: number, c: V3) { const i = this.i(x, y); if (i >= 0) for (let k = 0; k < 3; k++) this.emi[i * 3 + k] += c[k]; }
  tint(x: number, y: number, c: V3, t: number) { const i = this.i(x, y); if (i >= 0 && this.a[i]) for (let k = 0; k < 3; k++) this.alb[i * 3 + k] += (c[k] - this.alb[i * 3 + k]) * Math.min(1, t); }
  dark(x: number, y: number, k: number) { const i = this.i(x, y); if (i >= 0) for (let q = 0; q < 3; q++) this.alb[i * 3 + q] *= k; }
}

// ---------- tone, grade, palette (the mockup's post) ----------

const PAL = ['#1c140e', '#281c13', '#362619', '#463220', '#5a4228', '#745632', '#927040', '#000000', '#070605', '#0d0b09', '#13110d', '#1a1712', '#221e18', '#2b261e', '#353026', '#423a2e', '#504637', '#615541', '#76674e', '#8e7d60', '#a99878', '#c8b896', '#e6dab8',
  '#141a10', '#1f2717', '#2d371f', '#3f4a29', '#566236', '#717f44', '#929e58', '#b8c070', '#dfe29a',
  '#2e0d09', '#3a0408', '#5a0a10', '#7e1018', '#43130c', '#5c1a10', '#7a2416', '#a0301c', '#ff3a2a',
  '#5a2a0e', '#8a4516', '#c06a20', '#e8a040', '#ffd890',
  '#1e1222', '#2e1a36', '#46265a', '#643882', '#8a52a8',
  '#1a1e20', '#262c2e', '#384042', '#58605e', '#8a908a', '#c4c8bc', '#f2f4e4'].map((s) => hex(s).map((v) => v * 255));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const snap = new Map<number, number>();

/** Linear colour (already exposed) to display rgb 0..1: the mockup's filmic shoulder, contrast, desaturation and
 *  green-brown shadows. Also used by the sprites' palettes (see enemy.ts). */
export function tone(c: V3, glow = 0): V3 {
  let o = c.map((v) => { v = (v * 3.2) / (1 + v * 3.2); v = v ** (1 / 2.2); return v + (v * v * (3 - 2 * v) - v) * 0.45; }) as V3;
  const lum = 0.3 * o[0] + 0.59 * o[1] + 0.11 * o[2];
  o = mix(o, [lum, lum, lum], 0.24 * (1 - clamp(glow * 3)));
  return [o[0] + 0.012 * (1 - lum), o[1] + 0.014 * (1 - lum), o[2] - 0.004];
}

/** The layer as RGBA, lit by a plain light of strength `light`, dithered onto the palette. */
function finish(cv: Cv, light: number) {
  const out = new Uint8ClampedArray(cv.w * cv.h * 4);
  for (let i = 0; i < cv.w * cv.h; i++) {
    if (!cv.a[i]) continue;
    const x = i % cv.w, y = (i / cv.w) | 0, e = cv.emi.subarray(i * 3, i * 3 + 3);
    const c = tone([cv.alb[i * 3] * light + e[0], cv.alb[i * 3 + 1] * light + e[1], cv.alb[i * 3 + 2] * light + e[2]], e[0] + e[1] + e[2]);
    const d = BAYER[(y & 3) * 4 + (x & 3)] * 0.04;
    const r = clamp(c[0] + d) * 255, g = clamp(c[1] + d) * 255, b = clamp(c[2] + d) * 255;
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let best = snap.get(key);
    if (best === undefined) {
      let bd = 1e9;
      best = 0;
      for (let p = 0; p < PAL.length; p++) {
        const q = PAL[p], dr = r - q[0], dg = g - q[1], db = b - q[2], dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2;
        const dd = dY * dY * 1.4 + dCo * dCo * 0.6 + dCg * dCg * 0.7;
        if (dd < bd) { bd = dd; best = p; }
      }
      snap.set(key, best);
    }
    out.set([...PAL[best], 255], i * 4);
  }
  return out;
}

const LIGHT = 1.7; // the plain light the room is painted under: about the mockup's floor at the edge of the lantern's pool
const PROP_LIGHT = 2.3; // the hung corpses a little brighter, as the mockup's characters (readability)

// ---------- helpers (the mockup's) ----------

function stain(cv: Cv, cx: number, cy: number, rx: number, ry: number, col: V3, amt: number, seed: number, rough = 0.5) {
  for (let y = -ry * 1.6; y <= ry * 1.6; y++) for (let x = -rx * 1.6; x <= rx * 1.6; x++) {
    const v = 1 - Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry)) + (fbm((cx + x) / 5, (cy + y) / 5, 3, seed) - 0.5) * rough * 2;
    if (v > 0) cv.tint(cx + x, cy + y, col, clamp(v * 3) * amt);
  }
}
/** Drag marks: streaky along the path, accumulated once per pixel. */
function smear(cv: Cv, path: number[][], w: number, col: V3, amt: number, seed: number) {
  const m = new Map<number, number>();
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1], len = Math.hypot(x1 - x0, y1 - y0);
    const tx = (x1 - x0) / len, ty = (y1 - y0) / len, nx = -ty, ny = tx;
    for (let s = 0; s < len; s += 0.5) for (let o = -w; o <= w; o += 0.5) {
      const x = x0 + tx * s + nx * o, y = y0 + ty * s + ny * o;
      const v = vn(o * 0.9 + 50, (p * 100 + s) / 10, seed) - (Math.abs(o) / w) ** 2 * 0.7 - 0.2 + (fbm(x / 3, y / 3, 2, seed + 1) - 0.5) * 0.7;
      const i = cv.i(x, y);
      if (i >= 0) m.set(i, Math.max(m.get(i) ?? 0, clamp(v * 1.8)));
    }
  }
  for (const [i, k] of m) if (k > 0) cv.tint(i % cv.w, (i / cv.w) | 0, col, k * amt);
}
function groove(cv: Cv, path: number[][], seed: number) {
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1], len = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s <= len; s += 0.5) {
      const x = x0 + ((x1 - x0) * s) / len, y = y0 + ((y1 - y0) * s) / len;
      cv.tint(x, y, C.mortar, 0.85);
      if (vn(s / 3, p, seed) > 0.35) cv.tint(x, y, C.bloodD, 0.9);
      cv.tint(x, y + 1, C.mortar, 0.3);
    }
  }
}
function bone(cv: Cv, x: number, y: number, len: number, a: number) {
  for (let s = 0; s <= len; s++) cv.put(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.7, s === 0 || s === len ? C.bone : C.boneD);
}
function skull(cv: Cv, x: number, y: number) {
  ['.bb.', 'bbbb', 'kbkb', '.bb.'].forEach((r, j) => [...r].forEach((ch, i) => ch !== '.' && cv.put(x + i, y + j, ch === 'b' ? C.bone : C.mortar)));
}
/** A pixel grid ('.' empty) with its bottom centre at (ox, oy). */
function sprite(cv: Cv, rows: string[], pal: Record<string, V3>, ox: number, oy: number) {
  const w = Math.max(...rows.map((r) => r.length)), x0 = Math.round(ox - w / 2), y0 = oy - rows.length + 1;
  rows.forEach((r, j) => [...r].forEach((ch, i) => pal[ch] && cv.put(x0 + i, y0 + j, pal[ch])));
}
function chain(cv: Cv, x: number, y0: number, y1: number, fade = 0) {
  for (let y = y0; y <= y1; y++) cv.put(x, y, mul(y % 3 === 0 ? L('#4a453e') : L('#2a2622'), fade ? clamp((y - y0) / fade, 0.15) : 1));
}

const O = L('#080706');
const CORPSE = ['....c.....', '....c.....', '....c.....', '...occo...', '..odffdo..', '..odFfdo..', '...odbo...', '.ooodfdooo', 'odFffffffdo', 'odfFxfxfdfo',
  'odffxfxbdfo', 'odo.fffbdod', 'odo.ffbbo.d', 'od..fffdo.o', 'bo..dfffo..', '.o..odffdo.', '....odbfdo.', '....od.odo.', '....od.od..', '....bd.od..', '....od.bo..', '.....o..o..'];
const HANG = ['....oc.co...', '....oc.co...', '....orrro...', '....odfdo...', '...odffdo...', '...odfFdo...', '...odfFdo...', '...odffFdo..', '...odffFdo..', '..odffffFdo.',
  '..odfbbfFdo.', '..odffffFdo.', '.odFfxfxfFdo', '.odfbxbxbfdo', '.odFfxfxfFdo', '.odo.dffd.do', '.odo.offo.do', '.od.odFFdo.d', '.od.odfFdo.o', '.oo.odffdo..',
  '.bo..odfo...', '.....obbo...', '......b.....'];
const CORPSE_PAL = { o: O, r: L('#4a3a24'), c: L('#3a3632'), f: L('#7c705e'), F: L('#a3957c'), d: L('#4d4438'), b: L('#5a140e'), x: L('#c6b896') };
const CORPSE_PAL2 = { o: O, r: L('#4a3a24'), c: L('#3a3632'), f: L('#6a6656'), F: L('#8e8a72'), d: L('#403c32'), b: L('#4a100c'), x: L('#b0a888') };
const SLUMP = ['...oo....', '..oxxo...', '..oxkxo..', '..ofdfo..', '.odfffdo.', 'odfrfrfdo', 'odfffffdo', 'oxfdbdfxo', '.odffffoo', 'oxxooxxxo'];
const SLUMP_PAL = { o: O, x: L('#a89c80'), k: L('#1a1410'), f: L('#5a5244'), d: L('#3a342c'), r: L('#2a241e'), b: L('#4a100c') };

// ---------- the room ----------

function floor(cv: Cv) {
  // Irregular flagstones: a jittered grid's Voronoi cells, F2 - F1 for the mortar.
  const CW = 21, CH = 14, cell = (cx: number, cy: number) => [cx * CW + 3 + h2(cx, cy, 71) * (CW - 6), cy * CH + 2 + h2(cx, cy, 72) * (CH - 4)];
  for (let y = WB; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x + (vn(x / 9, y / 9, 5) - 0.5) * 3, wy = y + (vn(x / 9, y / 9, 6) - 0.5) * 3, gx = Math.floor(wx / CW), gy = Math.floor(wy / CH);
    let f1 = 1e9, f2 = 1e9, id = 0, ny = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [px, py] = cell(gx + i, gy + j), dx = (wx - px) / CW, dy = (wy - py) / CH, d = Math.hypot(dx, dy) * 14;
      if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + (gy + j); ny = dy; } else if (d < f2) f2 = d;
    }
    const e = f2 - f1;
    let c = mix(mix(C.stoneA, C.stoneB, h2(id, 0, 73)), C.stoneC, h2(id, 0, 74) * 0.7);
    c = mul(c, (0.72 + 0.4 * h2(id, 0, 75)) * (h2(id, 0, 81) < 0.12 ? 0.6 : 1) * (h2(id, 0, 82) > 0.85 ? 1.2 : 1));
    if (e < 0.85) c = mix(C.mortar, c, 0.3 + 0.3 * e);
    else {
      if (e < 1.8) c = mul(c, ny < 0 ? 1.15 : 0.75); // bevel: the upper edge catches the light, the lower one is in shade
      c = mix(c, C.grime, clamp((fbm(x / 5, y / 5, 3, 9 + (id & 7)) - 0.38) * 1.8) * 0.85);
      const spk = h2(x, y, 11);
      if (spk < 0.1) c = mul(c, 0.6); else if (spk > 0.97) c = mul(c, 1.3);
    }
    cv.put(x, y, c);
  }
  const R = rng(1337);
  for (let n = 0; n < 170; n++) { // cracks
    let x = R() * W, y = WB + R() * (H - WB), a = R() * 6.28;
    for (let s = 0, len = 5 + R() * 14; s < len; s++) { cv.dark(x, y, 0.45); a += R() * 1.2 - 0.6; x += Math.cos(a); y += Math.sin(a) * 0.7; }
  }
  // Filth, mould near the walls, damp; the wall base's contact shadow.
  for (let y = WB; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 28, y / 22, 4, 21), m = fbm(x / 16, y / 13, 4, 33);
    if (f > 0.52) cv.tint(x, y, C.grime, clamp((f - 0.52) * 4) * 0.8);
    cv.dark(x, y, 0.75 + 0.5 * fbm(x / 60, y / 40, 3, 44));
    const near = Math.max(clamp(1 - (y - WB) / 40), clamp(1 - (x - 40) / 30), clamp(1 - (440 - x) / 30));
    if (m * (0.6 + near) > 0.62) cv.tint(x, y, h2(x, y, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.6 + near) - 0.62) * 4) * 0.8);
    if (y < WB + 5) cv.dark(x, y, 0.5 + (y - WB) * 0.1);
  }
}

function gore(cv: Cv) {
  const R = rng(7);
  // Dragged down from the gate to the pit, and up from the stairs to the lower drain; the drains' grooves and pools.
  smear(cv, [[240, 64], [236, 90], [226, 130], [210, 180], [196, 240], [190, 298]], 6, C.blood, 0.75, 51);
  smear(cv, [[252, 66], [258, 100], [250, 130]], 2.5, C.blood, 0.55, 52);
  smear(cv, [[240, 624], [236, 600], [226, 572], [216, 548]], 5, C.blood, 0.7, 55);
  smear(cv, [[222, 334], [232, 346], [246, 352]], 4, C.blood, 0.7, 53); // something crawled out of the pit
  smear(cv, [[392, 312], [380, 340], [372, 380]], 2, C.bloodD, 0.5, 54);
  for (let k = 0; k < 9; k++) { // bloody claw prints from the pit to the drain
    const x = 246 + k * 6 + (k & 1) * 2, y = 352 + (k & 1 ? 3 : 0) + k;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, -1]]) cv.tint(x + dx, y + dy, C.blood, 0.75 - k * 0.05);
  }
  groove(cv, [[DRAINS[0][0] - 9, DRAINS[0][1] - 2], [266, 350], [240, 344], [222, 330]], 2);
  for (const [n, [x, y]] of DRAINS.entries()) {
    stain(cv, x, y, 22, 14, C.blood, 1, 41 + n, 0.6);
    stain(cv, x, y, 12, 8, C.bloodD, 0.9, 43 + n, 0.4);
    for (let i = 0; i < 140 - n * 60; i++) {
      const a = R() * 6.28, r = R() ** 2.5 * 50;
      cv.tint(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 0.8 + 10, i % 3 ? C.blood : C.bloodF, 0.9);
    }
  }
  for (const [x, y] of HANGING) { stain(cv, x, y, 9, 5, C.bloodF, 0.9, x, 0.5); stain(cv, x, y, 4, 2, C.bloodD, 0.9, y, 0.3); }
  for (const [x, y] of CAGES) stain(cv, x, y + 4, 18, 7, C.blood, 0.7, x + y, 0.7);
  stain(cv, PIT.x + PIT.w / 2, PIT.y + PIT.h + 6, 34, 9, C.blood, 0.75, 81, 0.7); // the pit's spill
  stain(cv, 92, 236, 10, 4, C.blood, 0.7, 91, 0.7);
  for (let n = 0; n < 22; n++) stain(cv, 50 + R() * 380, WB + 20 + R() * (H - WB - 40), 6 + R() * 8, 3 + R() * 3, C.grime, 0.8, 300 + n, 0.8); // wet filth
  for (let n = 0; n < 380; n++) { // straw
    const x = 44 + R() * 392, y = WB + 4 + R() * (FY1 - WB - 4), a = R() * 1.2 - 0.6 + (n & 1) * 1.57, col = L(n % 3 ? '#6e5c34' : '#8a7444');
    for (let k = 0, len = 2 + R() * 3; k < len; k++) cv.tint(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.6, col, 0.75);
  }
  for (let n = 0; n < 60; n++) bone(cv, 48 + R() * 384, WB + 6 + R() * (FY1 - WB - 10), 2 + Math.floor(R() * 4), R() * 6.28);
  for (const [x, y] of [[206, 194], [70, 172], [384, 222], [350, 96], [268, 236], [60, 420], [410, 560], [150, 470], [300, 600], [420, 390]]) skull(cv, x, y);
}

/** The body pit: its north face going down, a tangle of bodies at the bottom, an arm over the lip. */
function pit(cv: Cv) {
  const x0 = PIT.x + 2, x1 = PIT.x + PIT.w - 2, y0 = PIT.y + 2, y1 = PIT.y + PIT.h - 2, R = rng(5);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (y < y0 + 9) {
      cv.put(x, y, (y - y0) % 4 === 0 ? C.mortar : mix(C.wallD, C.wall, h2(x >> 2, (y + (x >> 2)) >> 2, 7) * 0.6));
      cv.tint(x, y, C.bloodD, clamp(fbm(x / 4, y / 2, 3, 77) - 0.35) * 1.2);
    } else cv.put(x, y, mul(C.mortar, 0.5));
  }
  const bid = new Map<number, number>(), skin = [L('#a29680'), L('#b4a68c'), L('#867a66'), L('#968270')];
  const pp = (x: number, y: number, c: V3, id: number) => {
    x |= 0; y |= 0;
    if (x < x0 || x > x1 || y < y0 + 8 || y > y1) return;
    cv.put(x, y, mul(c, 0.55 + 0.45 * clamp((y - y0 - 8) / (y1 - y0 - 8))));
    bid.set(y * W + x, id);
  };
  for (let n = 1; n <= 16; n++) {
    const cx = x0 + 6 + R() * (x1 - x0 - 12), cy = y0 + 11 + R() * (y1 - y0 - 13), a = R() * 6.28, rx = 4 + R() * 2.5, ry = 2 + R(), sk = skin[Math.floor(R() * 4)];
    const ca = Math.cos(a), sa = Math.sin(a);
    const limb = (ox: number, oy: number, la: number, len: number) => {
      for (let t = 0; t < len; t += 0.5) { const x = ox + Math.cos(la) * t, y = oy + Math.sin(la) * t * 0.7; pp(x, y, mul(sk, 0.9), n); pp(x + 1, y, mul(sk, 0.7), n); }
      if (h2(n, len | 0, 3) < 0.5) pp(ox + Math.cos(la) * len, oy + Math.sin(la) * len * 0.7, C.bone, n);
    };
    for (const s of [-1, 1]) for (const spread of [0.9, 1.2]) limb(cx + ca * rx * s * 0.8, cy + sa * rx * s * 0.5, a + (s > 0 ? 0 : Math.PI) + (R() * 2 - 1) * spread, 4 + R() * 5);
    for (let y = -7; y <= 7; y++) for (let x = -8; x <= 8; x++) {
      const u = (x * ca + y * sa) / rx, v = (-x * sa + y * ca) / ry;
      if (u * u + v * v > 1) continue;
      let c = mul(sk, v < -0.3 ? 1.15 : v > 0.4 ? 0.75 : 1);
      if (h2((cx + x) | 0, (cy + y) | 0, n) < 0.18) c = mix(c, C.bloodF, 0.7); // flayed patches
      if (Math.abs(u) < 0.5 && (x + y) & 1 && h2(n, 9, 9) < 0.4) c = mul(c, 0.7); // ribs
      pp(cx + x, cy + y * 0.8, c, n);
    }
    const hx = cx + ca * (rx + 2), hy = cy + sa * (rx + 2) * 0.7;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) pp(hx + x, hy + y, (x === 0 || x === 1) && y === 0 ? mul(sk, 0.5) : mul(sk, 1.1), n);
  }
  for (const [i, id] of bid) if (bid.get(i - 1) !== id || bid.get(i - W) !== id) cv.dark(i % W, (i / W) | 0, 0.35);
  for (let n = 0; n < 5; n++) stain(cv, x0 + 6 + R() * (x1 - x0 - 12), y0 + 12 + R() * (y1 - y0 - 14), 4, 2, C.bloodF, 0.8, 140 + n, 0.4);
  skull(cv, x0 + 6, y1 - 6); skull(cv, x1 - 10, y1 - 4);
  for (let s = 0; s < 7; s++) cv.put(x0 + 30 + (s >> 2), y1 - 2 - s, s < 2 ? C.bone : L('#6d6252')); // an arm reaching up over the lip
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    cv.put(x, y0 - 1, C.wallL); cv.put(x, y0 - 2, C.wall);
    cv.put(x, y1 + 1, mul(C.wallL, 1.1)); cv.put(x, y1 + 2, C.wallD);
  }
  for (let y = y0 - 2; y <= y1 + 2; y++) for (const [x, c] of [[x0 - 1, C.wallL], [x0 - 2, C.wall], [x1 + 1, C.wallL], [x1 + 2, C.wall]] as const) cv.put(x, y, c);
}

function drain(cv: Cv, cx: number, cy: number) {
  for (let y = -7; y <= 7; y++) for (let x = -11; x <= 11; x++) {
    const d = (x * x) / 110 + (y * y) / 42;
    if (d > 1) continue;
    cv.put(cx + x, cy + y, d > 0.68 ? (y < 0 ? C.iron : C.rust) : (x + 20) % 3 === 0 || (y + 20) % 4 === 0 ? (h2(x, y, 9) < 0.4 ? C.rust : C.iron) : [0.002, 0.0005, 0.0003]);
  }
}

function sconce(cv: Cv, x: number, z: number, lit: boolean) {
  const y = WB - z;
  for (const [dx, dy] of [[0, 1], [-1, 2], [0, 2], [0, 3]]) cv.put(x + dx, y + dy, C.iron);
  for (const dx of [-1, 0, 1]) cv.put(x + dx, y, C.rust);
  if (!lit) for (let k = 2; k < 18; k++) cv.dark(x + (k > 9 ? 1 : 0), y - k, 0.55); // soot above the dead one
}

/** Back wall, side walls' tops, the front wall and its stairs. `gate(x, y, grow)`: inside the gate's arch (room.ts). */
function walls(cv: Cv, gate: (x: number, y: number, grow: number) => boolean) {
  const R = rng(3);
  for (let y = 0; y < WB; y++) for (let x = 0; x < W; x++) {
    if (y < 8) { cv.put(x, y, y === 7 ? C.capEdge : C.cap); continue; }
    const row = Math.floor((y - 8) / 7), ry = (y - 8) % 7, off = (row * 13) % 23, bw = 18 + (row % 3) * 3, col = Math.floor((x + off) / bw), rx = (x + off) % bw;
    let c = mul(mix(C.wall, C.wallL, h2(col, row, 2) * 0.8), 0.92 + R() * 0.13);
    if (ry === 0 || rx === 0) c = C.mortar;
    else if (ry === 1) c = mul(c, 1.15);
    else if (ry === 6) c = mul(c, 0.75);
    const drip = vn(x / 2.2, y / 40, 13);
    if (drip > 0.62) c = mix(c, C.wallD, clamp((drip - 0.62) * 5) * 0.9);
    c = mix(c, y > 44 ? C.moss : C.wallD, clamp((fbm(x / 20, y / 10, 3, 17) - 0.5) * 3) * (y > 44 ? 0.6 : 0.5));
    if (y > 54) c = mix(c, C.grime, (y - 54) / 12);
    cv.put(x, y, c);
  }
  // The gate: a stone frame, the dark beyond lit by a cold fog, a gaunt shape and eyes waiting there.
  for (let y = 4; y < WB; y++) for (let x = 200; x < 280; x++) {
    if (gate(x, y, 0)) {
      cv.put(x, y, [0, 0, 0]);
      const fog = (0.25 + 0.75 * clamp((y - 17) / (WB - 17))) * (1 - Math.abs(x - 240) / 24) * (0.6 + 0.8 * fbm(x / 6, y / 4, 3, 123));
      cv.glow(x, y, mul(L('#5f7468'), Math.max(0, fog) * 0.6));
      const head = Math.hypot((x - 236) / 4, (y - 41) / 5.5) < 1, neck = y >= 45 && y < 49 && Math.abs(x - 236) <= 2;
      const sh = y >= 48 && Math.abs(x - 236) <= Math.min(7, 3 + (y - 48) * 1.5) && !(y > 53 && Math.abs(x - 236) === 5);
      if (head || neck || sh) cv.put(x, y, [0, 0, 0]);
    } else if (gate(x, y, 4)) {
      const a = Math.atan2(y - 44, x - 240), seg = Math.floor(a * 5);
      let c = mix(C.wallL, L('#4a4237'), h2(seg, 1, 3));
      if ((((a * 5) % 1) + 1) % 1 < 0.15 || !gate(x, y, 3)) c = C.mortar;
      if (y >= 44) c = y % 6 === 0 ? C.mortar : mix(C.wallL, L('#4a4237'), h2(x > 240 ? 1 : 0, (y / 6) | 0, 4));
      cv.put(x, y, c);
    }
  }
  for (const [x, y, k] of [[234, 42, 0.7], [238, 42, 0.7]]) cv.glow(x, y, [0.9 * k, 1.0 * k, 0.7 * k]);
  for (let x = 216; x <= 264; x++) cv.put(x, WB - 1, C.wallL); // threshold
  // Corpses on hooks along the back wall, an empty hook dripping, the sconces.
  for (const [x, pal, cut] of [[160, CORPSE_PAL2, 0], [305, CORPSE_PAL, 15], [418, CORPSE_PAL2, 0], [70, CORPSE_PAL, 17]] as const) {
    const rows = cut ? CORPSE.slice(0, cut) : CORPSE;
    sprite(cv, rows, pal, x, 14 + rows.length);
  }
  chain(cv, 182, 8, 22);
  for (const [dx, dy] of [[-1, 23], [0, 24], [1, 23]]) cv.put(182 + dx, dy, C.rust);
  for (let y = 25; y < WB; y++) if (h2(182, y, 3) < 0.8) cv.tint(182 + (y > 40 ? 1 : 0), y, C.bloodD, 0.8);
  for (const [x, , h, k] of TORCHES) if (h === 33) sconce(cv, x, h - 1, k > 0);
  // Side walls' tops: the dark beyond them, their inner rims.
  for (let y = 0; y < H; y++) for (const [a, b] of [[0, 40], [440, W]]) for (let x = a; x < b; x++) {
    const rim = x === 39 || x === 440, far = x < 28 || x >= 452;
    cv.put(x, y, rim ? C.capEdge : far ? mul(C.cap, 0.5 + 0.3 * h2(x >> 3, y >> 4, 6)) : mix(C.cap, C.wallD, h2(x, y >> 2, 8) * 0.5));
  }
  for (let y = WB; y < H; y++) { cv.dark(40, y, 0.4); cv.dark(41, y, 0.7); }
  // The front wall, and the stairs going down in its middle.
  for (let y = FY1; y < H; y++) for (let x = 28; x < 452; x++) {
    const t = y - FY1, step = Math.floor(t / 4);
    if (x >= 218 && x < 262) cv.put(x, y, t % 4 === 0 ? mul(C.wallL, 1.2 - step * 0.3) : mul(C.wall, 0.7 - step * 0.18));
    else cv.put(x, y, t === 0 ? C.wallL : t < 8 ? (x % 16 === 0 ? C.mortar : C.wallD) : C.cap);
  }
}

/** The bars, painted over the shut gate only (room.ts lifts them as the portcullis rises). */
function bars(cv: Cv, gate: (x: number, y: number, grow: number) => boolean) {
  for (let x = 220; x < 262; x += 5) for (let y = 17; y < WB - 1; y++) if (gate(x, y, 0) && gate(x - 1, y, 0)) {
    cv.put(x, y, h2(x, y, 4) < 0.35 ? C.rustL : C.rust);
    cv.put(x - 1, y, C.iron);
  }
  for (const by of [30, 46]) for (let x = 216; x <= 264; x++) if (gate(x, by, 0)) { cv.put(x, by, C.rust); cv.put(x, by + 1, C.iron); }
}

/** The room: open (no portcullis) and shut. */
export function paintRoom(gate: (x: number, y: number, grow: number) => boolean) {
  const cv = new Cv(W, H);
  floor(cv);
  gore(cv);
  pit(cv);
  for (const [x, y] of DRAINS) drain(cv, x, y);
  // Baked shadows: contact under what stands, a short cast shade away from the torches on it (down the room).
  const ao = (cx: number, cy: number, rx: number, ry: number, k: number) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) cv.dark(cx + x, cy + y, k);
  };
  for (const [x, y] of PILLARS) { ao(x, y - 4, 15, 7, 0.45); ao(x + 4, y + 8, 16, 9, 0.7); }
  for (const [x, y] of CAGES) { ao(x, y - 6, 14, 8, 0.5); ao(x + 3, y + 6, 14, 6, 0.75); }
  for (const [x, y] of [...HANGING, HCAGE]) ao(x, y, 7, 3, 0.6);
  walls(cv, gate);
  const shut = new Cv(W, H);
  shut.alb.set(cv.alb); shut.emi.set(cv.emi); shut.a.set(cv.a);
  bars(shut, gate);
  return { open: finish(cv, LIGHT), shut: finish(shut, LIGHT) };
}

// ---------- what stands: textures with their feet at the bottom ----------

/** A pillar 72 px high with a torch bracket on its face (`foot`: the texture row on the feet line). */
export function paintPillar() {
  const cv = new Cv(28, 84), cx = 14, by = 82, hgt = 72, hw = 11;
  for (let y = by - hgt; y <= by + 1; y++) for (let x = 0; x < 28; x++) {
    const z = by + 1 - y, dx = x - cx, w = z <= 5 || z >= hgt - 7 ? hw + 2 : hw;
    if (Math.abs(dx) > w) continue;
    const a = Math.asin(clamp(dx / (w + 0.5), -1, 1));
    let c = mix(C.pil, C.pilL, h2(Math.floor((y + 3) / 8), 0, cx) * 0.9);
    if (z === 6 || z === hgt - 7) c = C.mortar; else if ((by - y) % 8 === 0) c = mix(c, C.mortar, 0.45);
    c = mix(c, C.wallD, clamp((fbm(x / 3, y / 9, 3, cx) - 0.45) * 2.5) * 0.8);
    if (z < 14) c = mix(c, C.moss, clamp(fbm(x / 4, y / 4, 2, 5 + cx) - 0.45) * 1.5 * (1 - z / 14));
    c = mul(c, 0.45 + 0.55 * Math.cos(a) * (dx < 0 ? 1 : 0.8)); // round, and the light from the top left
    if (Math.abs(dx) === w) c = C.mortar;
    cv.put(x, y, c);
  }
  for (let y = by - hgt - 10; y < by - hgt; y++) for (let x = 0; x < 28; x++) {
    const e = y === by - hgt - 10 || x === 0 || x === 27;
    cv.put(x, y, e ? C.mortar : mix(C.wallL, L('#4d463b'), h2(x, y, 8) * 0.5));
  }
  const ty = by - 30; // the torch bracket, its flame drawn by dark.ts
  for (const [dx, dy, c] of [[0, 1, C.iron], [0, 2, C.iron], [-1, 0, C.rust], [0, 0, C.rust], [1, 0, C.rust], [0, 3, C.iron]] as const) cv.put(cx + dx, ty + dy, c);
  for (let k = 2; k < 12; k++) cv.dark(cx + (k > 6 ? 1 : 0), ty - k, 0.6); // soot
  return { w: 28, h: 84, foot: by, d: finish(cv, LIGHT) };
}

/** A rusted floor cage 24 wide, 34 high, a prisoner slumped inside. */
export function paintCage() {
  const cv = new Cv(26, 50), x0 = 1, x1 = 24, y0 = 36, y1 = 48, z1 = 34;
  const bar = (x: number, y: number, i: number) => (i % 2 ? C.rust : h2(x, y, 2) < 0.3 ? C.rustL : C.rust);
  const vbar = (x: number, Y: number) => { for (let z = 0; z <= z1; z++) cv.put(x, Y - z, bar(x, Y - z, z)); };
  for (let x = x0; x <= x1; x += 3) vbar(x, y0);
  for (let x = x0; x <= x1; x++) { cv.put(x, y0 - z1, C.iron); cv.put(x, y0, C.iron); }
  for (let y = y0; y <= y1; y += 2) { vbar(x0, y); vbar(x1, y); }
  sprite(cv, SLUMP, SLUMP_PAL, 13, y1 - 3);
  for (let x = x0; x <= x1; x += 3) vbar(x, y1);
  for (let x = x0; x <= x1; x++) { cv.put(x, y1 - z1, C.rustL); cv.put(x, y1, C.rust); cv.put(x, y1 + 1, C.iron); }
  for (let y = y0; y <= y1; y++) { cv.put(x0, y - z1, C.rustL); cv.put(x1, y - z1, C.rustL); }
  for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x++) cv.put(x, y - z1, C.iron);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 3) cv.put(x, y - z1, C.rust);
  return { w: 26, h: 50, foot: y1, d: finish(cv, LIGHT) };
}

/** A corpse hung by the ankles from the dark, its head 12 px over the floor. */
export function paintHanging(n: number) {
  const cv = new Cv(14, 96), bottom = 95;
  sprite(cv, HANG, n % 2 ? CORPSE_PAL2 : CORPSE_PAL, 7, bottom);
  chain(cv, 6, 0, bottom - HANG.length, 50); chain(cv, 8, 0, bottom - HANG.length, 50);
  for (let k = 0; k < 3; k++) cv.put(7, bottom - 1 - k * 4, C.bloodF);
  return { w: 14, h: 96, foot: bottom + 12, d: finish(cv, PROP_LIGHT) };
}

/** A small cage hung high on chains, a prisoner in it and an arm through the bars, its bottom 18 px over the floor. */
export function paintHungCage() {
  const cv = new Cv(22, 58), top = 30, bot = 55, x0 = 1, x1 = 19;
  chain(cv, x0 + 3, 0, top - 1, 30); chain(cv, x1 - 3, 0, top - 1, 30);
  for (let x = x0 + 1; x <= x1; x += 3) for (let y = top; y <= bot; y++) cv.put(x, y, C.iron); // back bars
  sprite(cv, SLUMP, SLUMP_PAL, 10, bot - 2);
  for (let k = 0; k < 9; k++) cv.put(x1 + (k > 5 ? 1 : 0), bot - 20 + k, k > 6 ? L('#a89c80') : L('#5a5244')); // the arm
  for (let x = x0; x <= x1; x += 3) for (let y = top; y <= bot; y++) cv.put(x, y, y % 2 ? C.rust : C.rustL);
  for (let x = x0; x <= x1; x++) { cv.put(x, top, C.rustL); cv.put(x, top + 1, C.iron); cv.put(x, bot, C.rust); cv.put(x, bot + 1, C.iron); }
  for (let k = 0; k < 3; k++) cv.put(x1, bot + 2 + k * 3, C.bloodF);
  return { w: 22, h: 58, foot: bot + 18, d: finish(cv, PROP_LIGHT) };
}
