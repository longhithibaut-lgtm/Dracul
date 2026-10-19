// The trial room « La salle de torture (essai) », in the "Crasse et faim" direction (docs/decisions.md): a torture crypt
// built with the engine of the mockup the user picked (scratchpad scene.js): a G-buffer (albedo, light it gives off, 3D
// position, normal, occluders at their floor point), the static lights (torches, the gate's cold leak) cast with shadow
// rays, their haze, the rim light on what hangs. Pure pixels, no Phaser: room.ts bakes the outputs into textures, dark.ts
// adds the lights that move (the hero's lantern, his night sight, the Order's lanterns) and the mockup's post (tone,
// grade, grain, ordered dither onto its palette) in one screen shader.
// The top screen is the mockup's composition (2 px higher: the wall's base is at 64, not 66); the two below vary it.

export const W = 480, H = 638, WB = 64; // the room, and the back wall's base (the floor's back edge)
const FY1 = H - 14; // the floor's front edge
const N = W * H;
type V3 = [number, number, number];

// ---------- the room's plan (floor coordinates: x, y on the floor; z up) ----------

export const PILLARS: [x: number, y: number, torch: number][] = [ // feet line; footprint 24x12; torch strength (0: burnt out)
  [112, 110, 1], [368, 110, 1], [112, 340, 0.8], [368, 340, 0], [112, 540, 1], [368, 540, 0.55]];
export const CAGES: [x: number, y: number][] = [[347, 210], [92, 300], [392, 470]]; // floor cages, feet line, footprint 24x12
export const PITS = [{ x: 110, y: 146, w: 68, h: 34 }, { x: 296, y: 384, w: 64, h: 30 }]; // body pits (walkers go round)
const HANGING: [x: number, y: number, z: number][] = [ // corpses on chains: over this floor point, feet this high
  [300, 102, 12], [146, 158, 22], [196, 286, 12], [328, 398, 22], [244, 430, 14], [150, 470, 12], [300, 516, 12], [420, 596, 14]];
const HCAGES: [x: number, y: number][] = [[85, 126], [404, 268], [72, 600]]; // small cages hung high, over this floor point
const DRAINS: [number, number][] = [[266, 168], [226, 372], [214, 520]];
const SCONCES: [x: number, lit: boolean][] = [[196, true], [332, false]];
const GATE_LIGHT = { x: 240, y: WB - 10, z: 22 };

/** The torches' flames, for dark.ts: x, the screen row under the flame, its strength. */
export const TORCHES: [x: number, y: number, k: number][] = [
  ...SCONCES.filter(([, lit]) => lit).map(([x]): [number, number, number] => [x, WB - 32, 1]),
  ...PILLARS.filter(([, , k]) => k > 0).map(([x, y, k]): [number, number, number] => [x, y - 29, k]),
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
export const L = (s: string) => hex(s).map((v) => v ** 2.2) as V3;
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

const C = {
  mortar: L('#110f0c'), stoneA: L('#4a4337'), stoneB: L('#5a5041'), stoneC: L('#43433e'),
  grime: L('#1e1a14'), moss: L('#3c4526'), mossL: L('#56602f'), blood: L('#560208'), bloodF: L('#74040c'), bloodD: L('#300105'),
  wall: L('#342f29'), wallL: L('#433b32'), wallD: L('#1e1b17'), pil: L('#5a564c'), pilL: L('#6e695b'), cap: L('#0d0c0a'), capEdge: L('#2c2721'),
  iron: L('#25211e'), rust: L('#5b3520'), rustL: L('#7d4a28'), bone: L('#b8ab8c'), boneD: L('#7a6f5a'),
};

// ---------- the G-buffer (the mockup's) ----------

const FLOOR: V3 = [0, 0, 1], SOUTH: V3 = [0, 1, 0], SPRITE: V3 = [0, 0.75, 0.66];
// FL: 1 unlit void, 2 no shadow ray, 4 rim (and the characters' readability boost), 8 outline
let alb: Float32Array, emi: Float32Array, PY: Float32Array, PZ: Float32Array, NX: Float32Array, NY: Float32Array, NZ: Float32Array;
let OID: Int16Array, FL: Uint8Array, LO: Float32Array, HI: Float32Array;
const at = (x: number, y: number) => { x |= 0; y |= 0; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; };
function put(x: number, y: number, c: V3, Y = y, Z = 0, n = FLOOR, id = 0, fl = 0) {
  const i = at(x, y);
  if (i < 0) return;
  alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
  emi[i * 3] = emi[i * 3 + 1] = emi[i * 3 + 2] = 0;
  PY[i] = Y; PZ[i] = Z; NX[i] = n[0]; NY[i] = n[1]; NZ[i] = n[2]; OID[i] = id; FL[i] = fl;
}
function glow(x: number, y: number, c: V3) { const i = at(x, y); if (i >= 0) for (let k = 0; k < 3; k++) emi[i * 3 + k] += c[k]; }
function tint(x: number, y: number, c: V3, t: number) { const i = at(x, y); if (i >= 0) for (let k = 0; k < 3; k++) alb[i * 3 + k] += (c[k] - alb[i * 3 + k]) * Math.min(1, t); }
function dark(x: number, y: number, k: number) { const i = at(x, y); if (i >= 0) for (let q = 0; q < 3; q++) alb[i * 3 + q] *= k; }
function occ(x: number, y: number, lo: number, hi: number) { const i = at(x, y); if (i >= 0) { LO[i] = Math.min(LO[i], lo); HI[i] = Math.max(HI[i], hi); } }
function occEll(cx: number, cy: number, rx: number, ry: number, lo: number, hi: number) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) occ(cx + x, cy + y, lo, hi);
}

// ---------- helpers (the mockup's) ----------

function stain(cx: number, cy: number, rx: number, ry: number, col: V3, amt: number, seed: number, rough = 0.5) {
  for (let y = -ry * 1.6; y <= ry * 1.6; y++) for (let x = -rx * 1.6; x <= rx * 1.6; x++) {
    const v = 1 - Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry)) + (fbm((cx + x) / 5, (cy + y) / 5, 3, seed) - 0.5) * rough * 2;
    if (v > 0) tint(cx + x, cy + y, col, clamp(v * 3) * amt);
  }
}
/** Drag marks: streaky along the path, accumulated once per pixel. */
function smear(path: number[][], w: number, col: V3, amt: number, seed: number) {
  const m = new Map<number, number>();
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1], len = Math.hypot(x1 - x0, y1 - y0);
    const tx = (x1 - x0) / len, ty = (y1 - y0) / len, nx = -ty, ny = tx;
    for (let s = 0; s < len; s += 0.5) for (let o = -w; o <= w; o += 0.5) {
      const x = x0 + tx * s + nx * o, y = y0 + ty * s + ny * o;
      const v = vn(o * 0.9 + 50, (p * 100 + s) / 10, seed) - (Math.abs(o) / w) ** 2 * 0.7 - 0.2 + (fbm(x / 3, y / 3, 2, seed + 1) - 0.5) * 0.7;
      const i = at(x, y);
      if (i >= 0) m.set(i, Math.max(m.get(i) ?? 0, clamp(v * 1.8)));
    }
  }
  for (const [i, k] of m) if (k > 0) tint(i % W, (i / W) | 0, col, k * amt);
}
function groove(path: number[][], seed: number) {
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1], len = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s <= len; s += 0.5) {
      const x = x0 + ((x1 - x0) * s) / len, y = y0 + ((y1 - y0) * s) / len;
      tint(x, y, C.mortar, 0.85);
      if (vn(s / 3, p, seed) > 0.35) tint(x, y, C.bloodD, 0.9);
      tint(x, y + 1, C.mortar, 0.3);
    }
  }
}
function bone(x: number, y: number, len: number, a: number) {
  for (let s = 0; s <= len; s++) { const py = y + Math.sin(a) * s * 0.7; put(x + Math.cos(a) * s, py, s === 0 || s === len ? C.bone : C.boneD, py, 0.5); }
}
function skull(x: number, y: number) {
  ['.bb.', 'bbbb', 'kbkb', '.bb.'].forEach((r, j) => [...r].forEach((ch, i) => ch !== '.' && put(x + i, y + j, ch === 'b' ? C.bone : C.mortar, y + 3, 3 - j, SOUTH)));
}
/** A pixel grid ('.' empty) standing with its bottom centre at screen (ox, oy), its feet at floor row Y. */
function sprite(rows: string[], pal: Record<string, V3>, ox: number, oy: number, Y: number, id: number, o: { z0?: number; n?: V3; fl?: number } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), x0 = Math.round(ox - w / 2), y0 = oy - h + 1;
  rows.forEach((r, j) => [...r].forEach((ch, i) => pal[ch] && put(x0 + i, y0 + j, pal[ch], Y, (o.z0 ?? 0) + (h - 1 - j), o.n ?? SPRITE, id, (o.fl ?? 6) | (ch === 'o' ? 8 : 0))));
}
/** A chain from screen row y0 down to y1, fading into the dark above over `fade` px. */
function chain(x: number, y0: number, y1: number, Y: number, zBot: number, id = 0, fade = 0) {
  for (let y = Math.max(0, y0); y <= y1; y++)
    put(x, y, mul(y % 3 === 0 ? L('#4a453e') : L('#2a2622'), fade ? clamp((y - y0) / fade, 0.15) : 1), Y, zBot + (y1 - y), SOUTH, id, 2);
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

function floor() {
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
    put(x, y, c);
  }
  const R = rng(1337);
  for (let n = 0; n < 170; n++) { // cracks
    let x = R() * W, y = WB + R() * (H - WB), a = R() * 6.28;
    for (let s = 0, len = 5 + R() * 14; s < len; s++) { dark(x, y, 0.45); a += R() * 1.2 - 0.6; x += Math.cos(a); y += Math.sin(a) * 0.7; }
  }
  // Filth, mould near the walls, damp; the wall base's contact shadow.
  for (let y = WB; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 28, y / 22, 4, 21), m = fbm(x / 16, y / 13, 4, 33);
    if (f > 0.52) tint(x, y, C.grime, clamp((f - 0.52) * 4) * 0.8);
    dark(x, y, 0.75 + 0.5 * fbm(x / 60, y / 40, 3, 44));
    const near = Math.max(clamp(1 - (y - WB) / 40), clamp(1 - (x - 40) / 30), clamp(1 - (440 - x) / 30));
    if (m * (0.6 + near) > 0.62) tint(x, y, h2(x, y, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.6 + near) - 0.62) * 4) * 0.8);
    if (y < WB + 5) dark(x, y, 0.5 + (y - WB) * 0.1);
  }
}

function gore() {
  const R = rng(7);
  // Dragged from the gate to the first pit, from the second pit to its drain, up from the stairs; the drains' grooves.
  smear([[240, 62], [236, 82], [226, 102], [210, 122], [190, 136], [176, 148]], 6, C.blood, 0.75, 51);
  smear([[176, 182], [186, 190], [196, 194]], 4, C.blood, 0.7, 53); // something crawled out of the pit
  smear([[252, 64], [258, 88], [250, 110]], 2.5, C.blood, 0.55, 52);
  smear([[290, 178], [300, 198], [306, 228]], 2, C.bloodD, 0.5, 54);
  smear([[296, 396], [270, 386], [246, 378]], 4, C.blood, 0.7, 56);
  smear([[196, 300], [204, 330], [218, 360]], 3, C.bloodD, 0.55, 57);
  smear([[240, 624], [236, 600], [228, 572], [218, 540]], 5, C.blood, 0.7, 55);
  smear([[120, 488], [150, 500], [190, 512]], 3, C.blood, 0.6, 58);
  for (let k = 0; k < 9; k++) { // bloody claw prints
    const x = 198 + k * 7 + (k & 1) * 2, y = 196 + k * 4 + (k & 1 ? 3 : 0);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, -1]]) tint(x + dx, y + dy, C.blood, 0.75 - k * 0.05);
    const x2 = 300 - k * 6, y2 = 420 + k * 5 + (k & 1 ? 2 : 0);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, -1]]) tint(x2 + dx, y2 + dy, C.blood, 0.7 - k * 0.05);
  }
  groove([[DRAINS[0][0] - 9, DRAINS[0][1] - 2], [232, 156], [206, 150], [180, 158]], 2);
  groove([[DRAINS[1][0] + 9, DRAINS[1][1] - 2], [260, 376], [294, 392]], 3);
  for (const [n, [x, y]] of DRAINS.entries()) {
    stain(x, y, 22, 14, C.blood, 1, 41 + n, 0.6);
    stain(x, y, 12, 8, C.bloodD, 0.9, 44 + n, 0.4);
    for (let i = 0; i < 140 - n * 30; i++) {
      const a = R() * 6.28, r = R() ** 2.5 * 50;
      tint(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 0.8 + 10, i % 3 ? C.blood : C.bloodF, 0.9);
    }
  }
  for (const [x, y] of HANGING) { stain(x, y, 9, 5, C.bloodF, 0.9, x, 0.5); stain(x, y, 4, 2, C.bloodD, 0.9, y, 0.3); }
  for (const [x, y] of CAGES) stain(x, y, 18, 7, C.blood, 0.7, x + y, 0.7);
  for (const [x, y] of HCAGES) stain(x + 8, y + 6, 10, 4, C.blood, 0.7, x * 3 + y, 0.7);
  for (const p of PITS) stain(p.x + p.w / 2 - 4, p.y + p.h + 6, p.w / 2 - 4, 9, C.blood, 0.75, 81 + p.y, 0.7); // the pits' spill
  stain(370, 248, 26, 10, C.grime, 0.6, 93, 0.8);
  for (let n = 0; n < 26; n++) stain(50 + R() * 380, WB + 20 + R() * (H - WB - 40), 6 + R() * 8, 3 + R() * 3, C.grime, 0.8, 300 + n, 0.8); // wet filth
  for (let n = 0; n < 420; n++) { // straw
    const x = 44 + R() * 392, y = WB + 4 + R() * (FY1 - WB - 4), a = R() * 1.2 - 0.6 + (n & 1) * 1.57, col = L(n % 3 ? '#6e5c34' : '#8a7444');
    for (let k = 0, len = 2 + R() * 3; k < len; k++) tint(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.6, col, 0.75);
  }
  for (let n = 0; n < 70; n++) bone(46 + R() * 388, WB + 6 + R() * (FY1 - WB - 10), 2 + Math.floor(R() * 4), R() * 6.28);
  for (const [x, y] of [[206, 192], [70, 170], [384, 220], [350, 94], [268, 234], [60, 420], [410, 560], [170, 440], [300, 600], [420, 390],
    [140, 600], [260, 470], [330, 300]]) skull(x, y);
}

/** A body pit: its north face going down, a tangle of bodies at the bottom, an arm over the lip. */
function pit(p: { x: number; y: number; w: number; h: number }, seed: number) {
  const x0 = p.x + 2, x1 = p.x + p.w - 2, y0 = p.y + 2, y1 = p.y + p.h - 2, R = rng(seed);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (y < y0 + 9) {
      put(x, y, (y - y0) % 4 === 0 ? C.mortar : mix(C.wallD, C.wall, h2(x >> 2, (y + (x >> 2)) >> 2, 7) * 0.6), y0, -(y - y0) * 3, SOUTH);
      tint(x, y, C.bloodD, clamp(fbm(x / 4, y / 2, 3, 77) - 0.35) * 1.2);
    } else put(x, y, mul(C.mortar, 0.5), y, -30);
  }
  const bid = new Map<number, number>(), skin = [L('#a29680'), L('#b4a68c'), L('#867a66'), L('#968270')];
  const pp = (x: number, y: number, c: V3, id: number, z: number) => {
    x |= 0; y |= 0;
    if (x < x0 || x > x1 || y < y0 + 8 || y > y1) return;
    put(x, y, mul(c, 0.55 + 0.45 * clamp((y - y0 - 8) / (y1 - y0 - 8))), y, z);
    bid.set(y * W + x, id);
  };
  for (let n = 1; n <= 14; n++) {
    const cx = x0 + 6 + R() * (x1 - x0 - 12), cy = y0 + 11 + R() * (y1 - y0 - 13), a = R() * 6.28, rx = 4 + R() * 2.5, ry = 2 + R(), sk = skin[Math.floor(R() * 4)], z = -26 + n;
    const ca = Math.cos(a), sa = Math.sin(a);
    const limb = (ox: number, oy: number, la: number, len: number) => {
      for (let t = 0; t < len; t += 0.5) { const x = ox + Math.cos(la) * t, y = oy + Math.sin(la) * t * 0.7; pp(x, y, mul(sk, 0.9), n, z); pp(x + 1, y, mul(sk, 0.7), n, z); }
      if (h2(n, len | 0, 3) < 0.5) pp(ox + Math.cos(la) * len, oy + Math.sin(la) * len * 0.7, C.bone, n, z);
    };
    for (const s of [-1, 1]) for (const spread of [0.9, 1.2]) limb(cx + ca * rx * s * 0.8, cy + sa * rx * s * 0.5, a + (s > 0 ? 0 : Math.PI) + (R() * 2 - 1) * spread, 4 + R() * 5);
    for (let y = -7; y <= 7; y++) for (let x = -8; x <= 8; x++) {
      const u = (x * ca + y * sa) / rx, v = (-x * sa + y * ca) / ry;
      if (u * u + v * v > 1) continue;
      let c = mul(sk, v < -0.3 ? 1.15 : v > 0.4 ? 0.75 : 1);
      if (h2((cx + x) | 0, (cy + y) | 0, n) < 0.18) c = mix(c, C.bloodF, 0.7); // flayed patches
      if (Math.abs(u) < 0.5 && (x + y) & 1 && h2(n, 9, 9) < 0.4) c = mul(c, 0.7); // ribs
      pp(cx + x, cy + y * 0.8, c, n, z);
    }
    const hx = cx + ca * (rx + 2), hy = cy + sa * (rx + 2) * 0.7;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) pp(hx + x, hy + y, (x === 0 || x === 1) && y === 0 ? mul(sk, 0.5) : mul(sk, 1.1), n, z);
  }
  for (const [i, id] of bid) if (bid.get(i - 1) !== id || bid.get(i - W) !== id) dark(i % W, (i / W) | 0, 0.35);
  for (let n = 0; n < 5; n++) stain(x0 + 6 + R() * (x1 - x0 - 12), y0 + 12 + R() * (y1 - y0 - 14), 4, 2, C.bloodF, 0.8, 140 + n + seed, 0.4);
  skull(x0 + 6, y1 - 8); skull(x1 - 10, y1 - 4);
  for (let s = 0; s < 7; s++) put(x0 + 30 + (s >> 2), y1 - 2 - s, s < 2 ? C.bone : L('#6d6252'), y1, s, SOUTH); // an arm reaching up over the lip
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    put(x, y0 - 1, C.wallL); put(x, y0 - 2, C.wall);
    put(x, y1 + 1, mul(C.wallL, 1.1)); put(x, y1 + 2, C.wallD);
  }
  for (let y = y0 - 2; y <= y1 + 2; y++) for (const [x, c] of [[x0 - 1, C.wallL], [x0 - 2, C.wall], [x1 + 1, C.wallL], [x1 + 2, C.wall]] as const) put(x, y, c);
}

function drain(cx: number, cy: number) {
  for (let y = -7; y <= 7; y++) for (let x = -11; x <= 11; x++) {
    const d = (x * x) / 110 + (y * y) / 42;
    if (d > 1) continue;
    put(cx + x, cy + y, d > 0.68 ? (y < 0 ? C.iron : C.rust) : (x + 20) % 3 === 0 || (y + 20) % 4 === 0 ? (h2(x, y, 9) < 0.4 ? C.rust : C.iron) : [0.002, 0.0005, 0.0003]);
  }
}

/** Back wall, the gate and what waits beyond it, the side walls' tops, the front wall and its stairs. */
function walls(gate: (x: number, y: number, grow: number) => boolean) {
  const R = rng(3);
  for (let y = 0; y < WB; y++) for (let x = 0; x < W; x++) {
    if (y < 8) { put(x, y, y === 7 ? C.capEdge : C.cap, WB - 4, 60, FLOOR, 0, y === 7 ? 0 : 1); continue; }
    const row = Math.floor((y - 8) / 7), ry = (y - 8) % 7, off = (row * 13) % 23, bw = 18 + (row % 3) * 3, col = Math.floor((x + off) / bw), rx = (x + off) % bw;
    let c = mul(mix(C.wall, C.wallL, h2(col, row, 2) * 0.8), 0.92 + R() * 0.13);
    if (ry === 0 || rx === 0) c = C.mortar;
    else if (ry === 1) c = mul(c, 1.15);
    else if (ry === 6) c = mul(c, 0.75);
    const drip = vn(x / 2.2, y / 40, 13);
    if (drip > 0.62) c = mix(c, C.wallD, clamp((drip - 0.62) * 5) * 0.9);
    c = mix(c, y > 42 ? C.moss : C.wallD, clamp((fbm(x / 20, y / 10, 3, 17) - 0.5) * 3) * (y > 42 ? 0.6 : 0.5));
    if (y > 54) c = mix(c, C.grime, (y - 54) / 12);
    put(x, y, c, WB, WB - y, SOUTH);
  }
  for (let y = WB - 4; y < WB; y++) for (let x = 0; x < W; x++) occ(x, y, -99, 999);
  // The gate: a stone frame, the dark beyond lit by a cold fog, a gaunt shape and eyes waiting there.
  for (let y = 4; y < WB; y++) for (let x = 200; x < 280; x++) {
    if (gate(x, y, 0)) {
      put(x, y, [0, 0, 0], WB - 8, WB - y, SOUTH, 0, 1);
      const fog = (0.25 + 0.75 * clamp((y - 17) / (WB - 17))) * (1 - Math.abs(x - 240) / 24) * (0.6 + 0.8 * fbm(x / 6, y / 4, 3, 123));
      glow(x, y, mul(L('#5f7468'), Math.max(0, fog) * 0.6));
      const head = Math.hypot((x - 236) / 4, (y - 39) / 5.5) < 1, neck = y >= 43 && y < 47 && Math.abs(x - 236) <= 2;
      const sh = y >= 46 && Math.abs(x - 236) <= Math.min(7, 3 + (y - 46) * 1.5) && !(y > 51 && Math.abs(x - 236) === 5);
      if (head || neck || sh) put(x, y, [0, 0, 0], WB - 9, WB - y, SOUTH, 0, 1);
    } else if (gate(x, y, 4)) {
      const a = Math.atan2(y - 44, x - 240), seg = Math.floor(a * 5);
      let c = mix(C.wallL, L('#4a4237'), h2(seg, 1, 3));
      if ((((a * 5) % 1) + 1) % 1 < 0.15 || !gate(x, y, 3)) c = C.mortar;
      if (y >= 44) c = y % 6 === 0 ? C.mortar : mix(C.wallL, L('#4a4237'), h2(x > 240 ? 1 : 0, (y / 6) | 0, 4));
      put(x, y, c, WB, WB - y, SOUTH);
    }
  }
  for (const [x, y, k] of [[234, 40, 0.7], [238, 40, 0.7]]) glow(x, y, [0.9 * k, 1.0 * k, 0.7 * k]);
  // Pale hands gripping the bars.
  for (const [hx, hy] of [[226, 38], [242, 35]]) {
    for (let k = 0; k < 3; k++) { put(hx + 1, hy + k, L('#8d8a76'), WB - 4, WB - hy - k, SOUTH); put(hx - 2, hy + k, L('#8d8a76'), WB - 4, WB - hy - k, SOUTH); }
    put(hx - 1, hy, L('#8d8a76'), WB - 4, WB - hy, SOUTH); put(hx, hy + 3, L('#8d8a76'), WB - 4, WB - hy - 3, SOUTH);
  }
  // Corpses on hooks along the back wall, an empty hook dripping, the sconces.
  for (const [x, pal, cut] of [[160, CORPSE_PAL2, 0], [305, CORPSE_PAL, 15], [418, CORPSE_PAL2, 0], [70, CORPSE_PAL, 17]] as const) {
    const rows = cut ? CORPSE.slice(0, cut) : CORPSE;
    sprite(rows, pal, x, 12 + rows.length, WB - 1, 20 + (x & 7), { n: SOUTH, z0: WB - (12 + rows.length) });
  }
  chain(182, 6, 20, WB - 1, WB - 20);
  for (const [dx, dy] of [[-1, 21], [0, 22], [1, 21]]) put(182 + dx, dy, C.rust, WB - 1, WB - dy, SOUTH);
  for (let y = 23; y < WB; y++) if (h2(182, y, 3) < 0.8) tint(182 + (y > 40 ? 1 : 0), y, C.bloodD, 0.8);
  for (const [x, lit] of SCONCES) {
    const z = 32, y = WB - z;
    for (const [dx, dy] of [[0, 1], [-1, 2], [0, 2], [0, 3]]) put(x + dx, y + dy, C.iron, WB, z - dy, SOUTH);
    for (const dx of [-1, 0, 1]) put(x + dx, y, C.rust, WB, z, SOUTH);
    if (!lit) { glow(x, y - 1, [0.25, 0.03, 0.01]); for (let k = 2; k < 18; k++) dark(x + (k > 9 ? 1 : 0), y - k, 0.55); } // an ember, soot
  }
  // Side walls' tops: the dark beyond them, their inner rims.
  for (let y = 0; y < H; y++) for (const [a, b] of [[0, 40], [440, W]]) for (let x = a; x < b; x++) {
    const rim = x === 39 || x === 440;
    put(x, y, rim ? C.capEdge : C.cap, y, 60, FLOOR, 0, rim ? 0 : 1);
    occ(x, y, -99, 999);
  }
  for (let y = WB; y < H; y++) { dark(40, y, 0.4); dark(41, y, 0.7); }
  // The front wall, and the stairs going down in its middle.
  for (let y = FY1; y < H; y++) for (let x = 28; x < 452; x++) {
    const t = y - FY1, step = Math.floor(t / 4);
    if (x >= 218 && x < 262) put(x, y, t % 4 === 0 ? mul(C.wallL, 1.2 - step * 0.3) : mul(C.wall, 0.7 - step * 0.18), y, -step * 4);
    else put(x, y, t === 0 ? C.wallL : t < 8 ? (x % 16 === 0 ? C.mortar : C.wallD) : C.cap, FY1, 14 - t, SOUTH, 0, t < 8 ? 0 : 1);
  }
}

/** The portcullis over the shut gate, and its occluders (open between the bars). */
function bars(gate: (x: number, y: number, grow: number) => boolean) {
  for (let x = 220; x < 262; x += 5) for (let y = 17; y < WB - 1; y++) if (gate(x, y, 0) && gate(x - 1, y, 0)) {
    put(x, y, h2(x, y, 4) < 0.35 ? C.rustL : C.rust, WB - 3, WB - y, SOUTH);
    put(x - 1, y, C.iron, WB - 3, WB - y, SOUTH);
  }
  for (const by of [30, 46]) for (let x = 216; x <= 264; x++) if (gate(x, by, 0)) { put(x, by, C.rust, WB - 3, WB - by, SOUTH); put(x, by + 1, C.iron, WB - 3, WB - by - 1, SOUTH); }
  for (let x = 218; x <= 262; x++) for (let y = WB - 4; y < WB; y++) {
    const i = y * W + x, m = (((x - 220) % 5) + 5) % 5;
    LO[i] = 1e9; HI[i] = -1e9;
    occ(x, y, 26, 999); // above the arch's spring
    if (m === 0 || m === 4) occ(x, y, -99, 999);
    occ(x, y, 17, 19); occ(x, y, 33, 35);
  }
}

// ---------- what stands (each one a prop: its pixels also become a sprite sorted at its feet) ----------

type Prop = { id: number; feet: number };
const props: Prop[] = [];
const prop = (feet: number) => { const p = { id: 100 + props.length, feet }; props.push(p); return p.id; };

function pillar(cx: number, by: number, torch: number) {
  const hw = 11, hgt = 72, id = prop(by);
  for (let y = by - 10; y <= by; y++) for (let x = cx - hw; x <= cx + hw; x++) occ(x, y, -99, hgt + 8);
  for (let y = by - hgt; y <= by + 1; y++) for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
    const z = by + 1 - y, dx = x - cx, w = z <= 5 || z >= hgt - 7 ? hw + 2 : hw;
    if (Math.abs(dx) > w) continue;
    const a = Math.asin(clamp(dx / (w + 0.5), -1, 1));
    let c = mix(C.pil, C.pilL, h2(Math.floor((y + 3) / 8), 0, cx) * 0.9);
    if (z === 6 || z === hgt - 7) c = C.mortar; else if ((by - y) % 8 === 0) c = mix(c, C.mortar, 0.45);
    c = mix(c, C.wallD, clamp((fbm(x / 3, y / 9, 3, cx) - 0.45) * 2.5) * 0.8);
    if (z < 14) c = mix(c, C.moss, clamp(fbm(x / 4, y / 4, 2, 5 + cx) - 0.45) * 1.5 * (1 - z / 14));
    c = mul(c, 0.55 + 0.45 * Math.cos(a));
    if (Math.abs(dx) === w) c = C.mortar;
    put(x, y, c, by + 1, z, [Math.sin(a), Math.cos(a), 0], id, 2);
  }
  for (let y = by - hgt - 10; y < by - hgt; y++) for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
    const e = y === by - hgt - 10 || x === cx - hw - 2 || x === cx + hw + 2;
    put(x, y, e ? C.mortar : mix(C.wallL, L('#4d463b'), h2(x, y, 8) * 0.5), y + hgt + 1, hgt + 8, FLOOR, id, 2);
  }
  const y = by - 29; // the torch bracket (its flame is drawn by dark.ts), or a dead one's soot
  for (const [dx, dy, c] of [[0, 1, C.iron], [0, 2, C.iron], [-1, 0, C.rust], [1, 0, C.rust]] as const) put(cx + dx, y + dy, c, by + 2, 30 - dy, SOUTH, id, 2);
  if (!torch) for (let k = 1; k < 12; k++) dark(cx + (k > 6 ? 1 : 0), y - k, 0.55);
}

/** A cage of rusted bars (the mockup's): floor box x0..x1, y0..y1, from z0 up to z1, `inside` drawn between its back
 *  and front bars. */
function cage(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, id: number, inside: () => void) {
  const barC = (x: number, y: number, i: number) => (i % 2 ? C.rust : h2(x, y, 2) < 0.3 ? C.rustL : C.rust);
  const vbar = (x: number, Y: number, n: V3) => { for (let z = z0; z <= z1; z++) put(x, Y - z, barC(x, Y - z, z), Y, z, n, id, 6); occ(x, Y, z0, z1); };
  for (let x = x0; x <= x1; x += 3) vbar(x, y0, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y0 - z1, C.iron, y0, z1, SOUTH, id, 6); put(x, y0 - z0, C.iron, y0, z0, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y += 2) { vbar(x0, y, [-1, 0, 0]); vbar(x1, y, [1, 0, 0]); }
  inside();
  for (let x = x0; x <= x1; x += 3) vbar(x, y1, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y1 - z1, C.rustL, y1, z1, SOUTH, id, 6); put(x, y1 - z0, C.rust, y1, z0, SOUTH, id, 6); put(x, y1 - z0 + 1, C.iron, y1, z0 + 1, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y++) { put(x0, y - z1, C.rustL, y, z1, FLOOR, id, 6); put(x1, y - z1, C.rustL, y, z1, FLOOR, id, 6); }
  for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x++) put(x, y - z1, C.iron, y, z1, FLOOR, id, 6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 3) put(x, y - z1, C.rust, y, z1, FLOOR, id, 6);
}
/** A floor cage centred on cx, its feet line at y1, a prisoner slumped inside. */
function floorCage(cx: number, y1: number) {
  const id = prop(y1);
  cage(cx - 11, cx + 11, y1 - 14, y1, 0, 34, id, () => sprite(SLUMP, SLUMP_PAL, cx, y1 - 5, y1 - 5, id, { fl: 2 }));
}
/** A small cage hung high on chains over the floor point (X, Y), z 18 to 44, a prisoner's arm through the bars. */
function hungCage(X: number, Y: number) {
  const x0 = X - 9, Y0 = Y - 4, Y1 = Y + 4, id = prop(Y1);
  cage(x0, x0 + 18, Y0, Y1, 18, 44, id, () => {
    sprite(SLUMP, SLUMP_PAL, X, Y1 - 22, Y1 - 3, id, { z0: 20, fl: 2 });
    for (let k = 0; k < 9; k++) put(x0 + 17 + (k > 5 ? 1 : 0), Y1 - 22 + k, k > 6 ? L('#a89c80') : L('#5a5244'), Y1 + 1, 22 - k, SOUTH, id, 2); // the arm
  });
  chain(x0 + 3, Y0 - 44 - 70, Y0 - 44, Y0, 44, id, 40); chain(x0 + 15, Y0 - 44 - 70, Y0 - 44, Y0, 44, id, 40);
  occEll(X, Y, 9, 4, 18, 44);
  for (let k = 0; k < 3; k++) put(x0 + 18, Y1 - 10 + k * 4, C.bloodF, Y1 + 1, 8 - k * 4, SOUTH, 0, 2);
}

/** A corpse hung by the ankles over the floor point (x, y), its head z px over it. */
function hanging(x: number, y: number, z: number, n: number) {
  const bottom = y - z, id = prop(y);
  sprite(HANG, n % 2 ? CORPSE_PAL2 : CORPSE_PAL, x, bottom, y, id, { z0: z });
  const top = bottom - HANG.length;
  chain(x - 1, top - 70, top, y, z + HANG.length, id, 40); chain(x + 1, top - 70, top, y, z + HANG.length, id, 40);
  occEll(x, y, 4, 2, z, z + HANG.length);
  for (let k = 0; k < 4 && z - k * 3 > 0; k++) put(x, bottom + 2 + k * 3, C.bloodF, y, z - 2 - k * 3, SOUTH, 0, 2); // drips
}

// ---------- the lights that never move ----------

type Light = { p: V3; c: V3; I: number; r0: number; R: number; haze?: number };
const LIGHTS: Light[] = [
  ...SCONCES.filter(([, lit]) => lit).map(([x]) => ({ p: [x, WB + 6, 34] as V3, c: L('#b8804a'), I: 3, r0: 14, R: 90 })),
  ...PILLARS.filter(([, , k]) => k > 0).map(([x, y, k]) => ({ p: [x, y + 4, 30] as V3, c: L('#b8804a'), I: 3 * k, r0: 14, R: 90 })),
  { p: [GATE_LIGHT.x, GATE_LIGHT.y, GATE_LIGHT.z], c: L('#8fa890'), I: 1.6, r0: 26, R: 130, haze: 0.02 }, // cold leak from beyond the gate
];
const shadow = (i: number, l: Light) => {
  if (FL[i] & 2) return 1;
  const X = i % W, Y = PY[i], Z = PZ[i], dx = l.p[0] - X, dy = l.p[1] - Y, dz = l.p[2] - Z, steps = Math.ceil(Math.hypot(dx, dy));
  for (let s = 2; s < steps; s++) {
    const t = s / steps, j = at(X + dx * t, Y + dy * t), z = Z + dz * t;
    if (j >= 0 && z >= LO[j] && z <= HI[j]) return 0;
  }
  return 1;
};
const falloff = (l: Light, d: number) => (l.I / (1 + (d / l.r0) ** 2)) * Math.max(0, 1 - (d / l.R) ** 2) ** 2;

/** The light every pixel gets from the static lights (no ambient), and what glows: its own light, the lights' haze, the
 *  rim light on what hangs. */
function bake() {
  const light = new Float32Array(N * 3), glowing = Float32Array.from(emi);
  for (let i = 0; i < N; i++) {
    if (FL[i] & 1) continue;
    const x = i % W;
    for (const l of LIGHTS) {
      const dx = l.p[0] - x, dy = l.p[1] - PY[i], dz = l.p[2] - PZ[i];
      if (Math.abs(dx) > l.R || Math.abs(dy) > l.R) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d > l.R) continue;
      const ndl = Math.max(0, ((NX[i] * dx + NY[i] * dy + NZ[i] * dz) / d + 0.45) / 1.45);
      if (ndl <= 0 || !shadow(i, l)) continue;
      const k = falloff(l, d) * ndl;
      for (let q = 0; q < 3; q++) light[i * 3 + q] += l.c[q] * k;
    }
  }
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    for (const l of LIGHTS) {
      const sx = l.p[0], sy = l.p[1] - l.p[2], d = Math.hypot(x - sx, (y - sy) * 1.2);
      if (d > l.r0 * 12) continue;
      const k = l.I * (l.haze ?? 0.012) * Math.exp(-d / (l.r0 * 1.4));
      for (let q = 0; q < 3; q++) glowing[i * 3 + q] += l.c[q] * k;
    }
    if (!(FL[i] & 4) || FL[i] & 8) continue;
    for (const l of LIGHTS) { // rim: an edge pixel facing the light catches it
      const sx = l.p[0], sy = l.p[1] - l.p[2], d = Math.hypot(x - l.p[0], PY[i] - l.p[1]);
      if (d > l.R) continue;
      const r = Math.max(1, Math.hypot(sx - x, sy - y)), j = at(x + Math.round(((sx - x) / r) * 1.4), y + Math.round(((sy - y) / r) * 1.4));
      if (j === i || (j >= 0 && OID[j] === OID[i] && !(FL[j] & 8))) continue;
      const k = Math.min(0.06, falloff(l, d) * 0.12);
      for (let q = 0; q < 3; q++) glowing[i * 3 + q] += l.c[q] * k;
    }
  }
  return { light, glowing };
}

// ---------- outputs ----------

const srgb = (v: number) => Math.round(clamp(v) ** (1 / 2.2) * 255);
/** What a pixel reflects, as the screen shader reads it (sRGB): the mockup's readability boost on what hangs and the
 *  prisoners, its outlines darker, the void black. */
function albedo(a: Float32Array, i: number, out: Uint8ClampedArray, o: number) {
  const k = FL[i] & 1 ? 0 : FL[i] & 8 ? 0.25 : FL[i] & 4 ? 2.2 : 1;
  out[o] = srgb(a[i * 3] * k); out[o + 1] = srgb(a[i * 3 + 1] * k); out[o + 2] = srgb(a[i * 3 + 2] * k); out[o + 3] = 255;
}

/** A sprite of one prop: its pixels in the room, in a box; sorted at its feet line. */
export type Sprite = { x: number; y: number; w: number; h: number; feet: number; d: Uint8ClampedArray<ArrayBuffer> };

/** The room: open (no portcullis) and shut, in sRGB albedo; `light`: three bands of W x H (the static light,
 *  cbrt(L / 4); what glows, sqrt; the surface's height z + 64, its floor row's offset Y - y + 64 and the normal's y
 *  at 128 + 127 ny); the props as sprites. `gate(x, y, grow)`: inside the gate's arch (room.ts). */
export function paintRoom(gate: (x: number, y: number, grow: number) => boolean) {
  alb = new Float32Array(N * 3); emi = new Float32Array(N * 3); PY = new Float32Array(N); PZ = new Float32Array(N);
  NX = new Float32Array(N); NY = new Float32Array(N); NZ = new Float32Array(N);
  OID = new Int16Array(N); FL = new Uint8Array(N); LO = new Float32Array(N).fill(1e9); HI = new Float32Array(N).fill(-1e9);
  props.length = 0;
  floor();
  gore();
  PITS.forEach((p, n) => pit(p, 5 + n));
  for (const [x, y] of DRAINS) drain(x, y);
  walls(gate);
  // What stands, back to front, each one's contact shadow under it first.
  const ao = (cx: number, cy: number, rx: number, ry: number, k: number) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) dark(cx + x, cy + y, k);
  };
  for (const [x, y] of PILLARS) ao(x, y - 4, 15, 7, 0.45);
  for (const [x, y] of CAGES) ao(x, y - 6, 14, 8, 0.5);
  const draws: [number, () => void][] = [
    ...PILLARS.map(([x, y, k]): [number, () => void] => [y, () => pillar(x, y, k)]),
    ...CAGES.map(([x, y]): [number, () => void] => [y, () => floorCage(x, y)]),
    ...HCAGES.map(([x, y]): [number, () => void] => [y + 4, () => hungCage(x, y)]),
    ...HANGING.map(([x, y, z], n): [number, () => void] => [y, () => hanging(x, y, z, n)]),
  ];
  draws.sort((a, b) => a[0] - b[0]).forEach((d) => d[1]());
  const openAlb = Float32Array.from(alb);
  bars(gate);
  const { light, glowing } = bake();

  const open = new Uint8ClampedArray(N * 4), shut = new Uint8ClampedArray(N * 4), lit = new Uint8ClampedArray(N * 12);
  for (let i = 0; i < N; i++) {
    albedo(openAlb, i, open, i * 4);
    albedo(alb, i, shut, i * 4);
    const y = (i / W) | 0;
    for (let q = 0; q < 3; q++) {
      lit[i * 4 + q] = Math.round(Math.cbrt(clamp(light[i * 3 + q] / 4)) * 255);
      lit[(N + i) * 4 + q] = Math.round(Math.sqrt(clamp(glowing[i * 3 + q])) * 255);
    }
    lit[(2 * N + i) * 4] = clamp(Math.round(PZ[i] + 64), 0, 255);
    lit[(2 * N + i) * 4 + 1] = clamp(Math.round(PY[i] - y + 64), 0, 255);
    lit[(2 * N + i) * 4 + 2] = Math.round(128 + 127 * NY[i]);
    for (const b of [0, N, 2 * N]) lit[(b + i) * 4 + 3] = 255;
  }
  // Each prop's pixels (those it still owns once everything is drawn), cut out into its own sprite.
  const sprites: Sprite[] = props.map(({ id, feet }) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < N; i++) if (OID[i] === id) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, d = new Uint8ClampedArray(w * h * 4);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (OID[y * W + x] === id) d.set(shut.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), ((y - y0) * w + x - x0) * 4);
    return { x: x0, y: y0, w, h, feet, d };
  });
  return { open, shut, light: lit, sprites };
}
