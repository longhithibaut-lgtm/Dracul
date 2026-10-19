// "Mélange": the game's real hall (captured, unlit) relit and dirtied with take B's engine.
const R = mulberry32(4242);
const rnd = (a = 0, b = 1) => a + (b - a) * R();
const ri = (a, b) => Math.floor(rnd(a, b + 1));

const alb = new Float32Array(N * 3), emi = new Float32Array(N * 3);
const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
const OID = new Int16Array(N), FL = new Uint8Array(N); // FL: 1 unlit void, 2 no shadow ray, 4 rim, 8 outline
const LO = new Float32Array(N).fill(1e9), HI = new Float32Array(N).fill(-1e9);
const FLOOR = [0, 0, 1], SOUTH = [0, 1, 0], SPRITE = [0, 0.75, 0.66];
function put(x, y, c, Y, Z, n = FLOOR, id = 0, fl = 0) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
  emi[i * 3] = emi[i * 3 + 1] = emi[i * 3 + 2] = 0;
  PX[i] = x; PY[i] = Y; PZ[i] = Z; NX[i] = n[0]; NY[i] = n[1]; NZ[i] = n[2]; OID[i] = id; FL[i] = fl;
}
function glow(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; emi[i * 3] += c[0]; emi[i * 3 + 1] += c[1]; emi[i * 3 + 2] += c[2]; }
function tint(x, y, c, t) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; for (let k = 0; k < 3; k++) alb[i * 3 + k] += (c[k] - alb[i * 3 + k]) * t; }
function dark(x, y, k) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; for (let q = 0; q < 3; q++) alb[i * 3 + q] *= k; }
function occ(x, y, lo, hi) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; LO[i] = Math.min(LO[i], lo); HI[i] = Math.max(HI[i], hi); }
function occEll(cx, cy, rx, ry, lo, hi) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) occ(cx + x, cy + y, lo, hi); }
function occBox(x0, y0, x1, y1, lo, hi) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ(x, y, lo, hi); }

const C = {
  mortar: L('#0e0d10'), grime: L('#1e1a14'), moss: L('#353f24'), mossL: L('#4c562b'), blood: L('#560208'), bloodF: L('#74040c'), bloodD: L('#300105'),
  iron: L('#25211e'), rust: L('#5b3520'), rustL: L('#7d4a28'), bone: L('#b8ab8c'), boneD: L('#7a6f5a'),
};
const FX0 = 40, FX1 = 440, FY0 = 64;
const GATE = { x0: 218, x1: 263, y0: 10, y1: 63 };
const src = (k, x, y) => { const i = (y * W + x) * 4; return [CAP[k][i] / 255, CAP[k][i + 1] / 255, CAP[k][i + 2] / 255]; };
const lin = c => c.map(v => Math.pow(v, 2.2));
const isMag = c => c[0] > 0.9 && c[1] < 0.1 && c[2] > 0.9;
// The captured palette pushed toward B: less saturated, a touch darker, the cobalt kept as an undertone.
function grade(c, desat, k) { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return mul(mix(c, [l * 1.02, l, l * 0.94], desat), k); }

// ---------- props from the capture: [x0, x1, baseY, height, footprint box, kind] ----------
const PROPS = [
  { x0: 78, x1: 106, base: 140, hgt: 999, foot: [80, 128, 104, 140], kind: 'pillar', cx: 92 },
  { x0: 374, x1: 402, base: 140, hgt: 58, foot: [376, 128, 400, 140], kind: 'stump', cx: 388 },
  { x0: 189, x1: 207, base: 86, hgt: 14, foot: [192, 78, 204, 86], kind: 'brazier' },
  { x0: 273, x1: 291, base: 86, hgt: 14, foot: [276, 78, 288, 86], kind: 'brazier' },
  { x0: 72, x1: 120, base: 234, hgt: 10, foot: [73, 220, 119, 234], kind: 'coffin' },
  { x0: 360, x1: 405, base: 234, hgt: 10, foot: [361, 220, 405, 234], kind: 'coffin' },
  { x0: 405, x1: 424, base: 234, hgt: 38, foot: [405, 228, 422, 234], kind: 'lid' },
];
const propAt = (x, y) => PROPS.find(p => x >= p.x0 && x < p.x1 && y <= p.base + 1);

// ---------- base: the room from the capture ----------
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = src('unlit-base', x, y), c = lin(s), i = y * W + x;
  if (x < 28 || x >= 452) { // the abyss beyond the side walls: kept as a faint crimson dark
    put(x, y, grade(c, 0.3, 0.25), y, 60, FLOOR, 0, 1); glow(x, y, mul(grade(c, 0.4, 1), 0.035)); occ(x, y, -99, 999); continue;
  }
  if (x < FX0 || x >= FX1 || y < 10) { put(x, y, grade(c, 0.35, 0.8), y < 10 ? FY0 - 4 : y, 60, FLOOR, 0, 0); occ(x, y, -99, 999); continue; }
  if (y < FY0) { // back wall face
    let col = grade(c, 0.35, 0.85);
    const teal = s[1] > s[0] * 1.5 && s[2] > s[0] * 1.3 && s[1] > 0.35;
    const inGate = x >= GATE.x0 && x <= GATE.x1 && y >= 12 && y <= GATE.y1;
    if (teal) { // moonlit glass and the fog beyond the portcullis: emissive, gone sickly
      const k = inGate ? 0.3 : 0.12, sick = mix(s, [s[1] * 0.75, s[1] * 0.9, s[1] * 0.7], 0.55);
      put(x, y, [0, 0, 0], FY0 - 8, FY0 - y, SOUTH, 0, 1); glow(x, y, mul(lin(sick), k * (0.6 + 0.8 * fbm(x / 6, y / 4, 3, 123))));
      continue;
    }
    put(x, y, col, FY0, FY0 - y, SOUTH);
    if (y >= FY0 - 4) occ(x, y, -99, 999);
    continue;
  }
  put(x, y, grade(c, 0.32, 0.9), y, 0, FLOOR);
}
// a gaunt figure standing beyond the portcullis, cut out of the fog (B)
for (let y = 30; y < FY0; y++) for (let x = 226; x <= 256; x++) {
  const head = Math.hypot((x - 241) / 4, (y - 36) / 5.5) < 1, neck = y >= 40 && y < 44 && Math.abs(x - 241) <= 2;
  const sh = y >= 43 && Math.abs(x - 241) <= Math.min(8, 3 + (y - 43) * 1.5) && !(y > 49 && Math.abs(x - 241) === 6);
  const i = y * W + x; if ((head || neck || sh) && (FL[i] & 1)) emi[i * 3] = emi[i * 3 + 1] = emi[i * 3 + 2] = 0;
}
// gate: open between its bars for the moon leak
for (let x = GATE.x0; x <= GATE.x1; x++) for (let y = FY0 - 4; y < FY0; y++) { const i = y * W + x; LO[i] = 1e9; HI[i] = -1e9; if (!(FL[(40) * W + x] & 1)) occ(x, y, -99, 999); else occ(x, y, 44, 999); }

// ---------- grime: filth, mould, damp, cracks over the slabs ----------
for (let y = FY0; y < H; y++) for (let x = FX0; x < FX1; x++) {
  if (propAt(x, y)) continue;
  const f = fbm(x / 26, y / 20, 4, 21), m = fbm(x / 15, y / 12, 4, 33);
  if (f > 0.5) tint(x, y, C.grime, clamp((f - 0.5) * 3.5) * 0.75);
  dark(x, y, 0.7 + 0.55 * fbm(x / 55, y / 38, 3, 44));
  const edge = clamp(1 - Math.min(y - FY0, x - FX0, FX1 - x) / 34);
  if (m * (0.6 + edge) > 0.6) tint(x, y, h2(x, y, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.6 + edge) - 0.6) * 4) * 0.7);
  const spk = h2(x, y, 11); if (spk < 0.08) dark(x, y, 0.65);
  if (y < FY0 + 4) dark(x, y, 0.5 + (y - FY0) * 0.12);
}
for (let n = 0; n < 60; n++) { let x = rnd(FX0, FX1), y = rnd(FY0, H), a = rnd(0, 6.28), len = ri(5, 16); for (let s = 0; s < len; s++) { if (!propAt(x, y)) dark(x, y, 0.5); a += rnd(-0.6, 0.6); x += Math.cos(a); y += Math.sin(a) * 0.7; } }
// back wall: damp streaks, drips, mould at the foot
for (let y = 10; y < FY0; y++) for (let x = FX0; x < FX1; x++) {
  const i = y * W + x; if (FL[i] & 1 || propAt(x, y)) continue;
  const drip = vn(x / 2.2, y / 40, 13); if (drip > 0.6) dark(x, y, 1 - clamp((drip - 0.6) * 5) * 0.55);
  const damp = fbm(x / 20, y / 10, 3, 17); if (damp > 0.5) tint(x, y, y > 46 ? C.moss : C.grime, clamp((damp - 0.5) * 3) * 0.5);
  if (y > 54) tint(x, y, C.grime, (y - 54) / 14);
}

function stain(cx, cy, rx, ry, col, amt, seed, rough = 0.5) {
  for (let y = -ry * 1.6; y <= ry * 1.6; y++) for (let x = -rx * 1.6; x <= rx * 1.6; x++) {
    const d = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry)); const nn = fbm((cx + x) / 5, (cy + y) / 5, 3, seed);
    const v = 1 - d + (nn - 0.5) * rough * 2; if (v > 0 && !propAt(cx + x | 0, cy + y | 0)) tint(cx + x, cy + y, col, clamp(v * 3) * amt);
  }
}
function smear(path, w, col, amt, seed) {
  const m = new Float32Array(N);
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1]; const len = Math.hypot(x1 - x0, y1 - y0);
    const tx = (x1 - x0) / len, ty = (y1 - y0) / len, nx = -ty, ny = tx;
    for (let s = 0; s < len; s += 0.5) for (let o = -w; o <= w; o += 0.5) {
      const x = x0 + tx * s + nx * o, y = y0 + ty * s + ny * o;
      const streak = vn(o * 0.9 + 50, (p * 100 + s) / 10, seed);
      const v = streak - Math.pow(Math.abs(o) / w, 2) * 0.7 - 0.2 + (fbm(x / 3, y / 3, 2, seed + 1) - 0.5) * 0.7;
      const i = (y | 0) * W + (x | 0); if (i >= 0 && i < N) m[i] = Math.max(m[i], clamp(v * 1.8));
    }
  }
  for (let i = 0; i < N; i++) if (m[i] > 0 && !propAt(i % W, (i / W) | 0)) tint(i % W, (i / W) | 0, col, m[i] * amt);
}

// ---------- gore: the medallion became a drain ----------
const MED = [240, 160];
// the carved ring channel runs with old blood
for (let y = MED[1] - 52; y <= MED[1] + 52; y++) for (let x = MED[0] - 52; x <= MED[0] + 52; x++) {
  const d = Math.hypot(x - MED[0], y - MED[1]);
  if (Math.abs(d - 36.5) < 1.2 && vn(Math.atan2(y - MED[1], x - MED[0]) * 8, 0, 7) > 0.3) tint(x, y, C.bloodD, 0.85);
}
stain(MED[0], MED[1] + 1, 14, 10, C.blood, 0.95, 41, 0.6);
stain(MED[0], MED[1] + 1, 7, 5, C.bloodD, 0.9, 42, 0.4);
for (let n = 0; n < 120; n++) { const a = rnd(0, 6.28), r = Math.pow(rnd(), 2.3) * 40; tint(MED[0] + Math.cos(a) * r * 1.3, MED[1] + Math.sin(a) * r * 0.9 + 4, n % 3 ? C.blood : C.bloodF, 0.85); }
// bodies dragged in from the gate, and out of the open coffin, to the drain
smear([[240, 66], [238, 84], [234, 102], [236, 122], [238, 142]], 5, C.blood, 0.7, 51);
smear([[372, 226], [350, 214], [320, 200], [292, 186], [262, 170]], 4, C.blood, 0.7, 53);
smear([[96, 236], [120, 246], [168, 252], [196, 254]], 3, C.bloodD, 0.55, 54);
for (let k = 0; k < 8; k++) { const x = 300 - k * 7, y = 236 - k * 4 + (k & 1) * 2; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, -1]]) tint(x + dx, y + dy, C.blood, 0.7 - k * 0.05); } // claw prints
stain(318, 120, 8, 4, C.bloodF, 0.9, 61, 0.5); stain(318, 120, 3, 2, C.bloodD, 0.9, 62, 0.3); // under the hung body
stain(166, 112, 10, 4, C.blood, 0.7, 63, 0.7); // under the cage
stain(196, 254, 14, 5, C.blood, 0.8, 71, 0.7);
stain(66, 248, 18, 8, C.blood, 0.6, 72, 0.7);
for (let n = 0; n < 8; n++) stain(rnd(60, 420), rnd(FY0 + 20, 262), rnd(6, 14), rnd(3, 6), C.grime, 0.8, 300 + n, 0.8);
function bone(x, y, len, a) { for (let s = 0; s <= len; s++) { const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s * 0.7; if (!propAt(px | 0, py | 0)) put(px, py, s === 0 || s === len ? C.bone : C.boneD, py, 0.5); } }
const avoid = (x, y) => [HERO, G1, G2, G3, XB].some(([a, b]) => Math.hypot(x - a, y - b) < 16);
for (let n = 0; n < 24; n++) { let x, y; do { x = rnd(48, 432); y = rnd(FY0 + 6, 266); } while (avoid(x, y) || propAt(x | 0, y | 0)); bone(x, y, ri(2, 5), rnd(0, 6.28)); }
for (let n = 0; n < 90; n++) { const x = rnd(44, 436), y = rnd(FY0 + 3, 268), a = rnd(-0.6, 0.6) + (n & 1) * 1.57, len = ri(2, 4); for (let k = 0; k < len; k++) if (!propAt(x | 0, y | 0)) tint(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.6, L(n % 3 ? '#4a4230' : '#5e5438'), 0.6); } // straw
function skull(x, y) { ['.bb.', 'bbbb', 'kbkb', '.bb.'].forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') put(x + i, y + j, ch === 'b' ? C.bone : C.mortar, y + 3, 3 - j, SOUTH); })); }
skull(212, 140); skull(296, 210); skull(150, 214); skull(420, 160);

// ---------- props from the capture, standing ----------
const PIDS = { pillar: 40, stump: 41, brazier: 42, coffin: 43, lid: 44 };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = src('unlit-props', x, y); if (isMag(s)) continue;
  const p = propAt(x, y) || PROPS.reduce((a, b) => Math.abs((b.x0 + b.x1) / 2 - x) < Math.abs((a.x0 + a.x1) / 2 - x) ? b : a);
  const id = PIDS[p.kind] + PROPS.indexOf(p);
  let c = grade(lin(s), 0.38, 0.85), z = p.base - y, Y = p.base, n = SOUTH;
  if (p.kind === 'pillar' || p.kind === 'stump') { const w = 12, dx = x - p.cx, a = Math.asin(clamp(dx / (w + 0.5), -1, 1)); n = [Math.sin(a), Math.cos(a), 0]; if (z > p.hgt - 3 && p.kind === 'stump') n = FLOOR; c = mix(c, C.moss, clamp(fbm(x / 4, y / 4, 2, 5) - 0.5) * 1.4 * clamp(1 - z / 16)); }
  else if (z > p.hgt) { Y = y + p.hgt; z = p.hgt; n = FLOOR; }
  // braziers: embers and flame emissive
  if (p.kind === 'brazier' && (s[0] > 0.7 && s[1] > 0.3 || s[0] > 0.55 && s[1] < 0.3 && s[2] < 0.3 && y < 72)) { put(x, y, c, Y, z, n, id, 2); glow(x, y, mul(lin(s), s[1] > 0.6 ? 1.6 : 0.9)); continue; }
  put(x, y, c, Y, z, n, id, 2);
}
for (const p of PROPS) { const [a, b, c2, d] = p.foot; occBox(a, b, c2, d, -99, p.hgt === 999 ? 999 : p.hgt + (p.kind === 'brazier' ? 2 : 0)); }
// coffins: blood run down the lip of the open one
for (let k = 0; k < 6; k++) for (let j = 0; j < ri(2, 6); j++) tint(368 + k * 6 + ri(0, 2), 222 + j, C.bloodF, 0.7);
// candles baked in the floor: wax kept, flames emissive
const CANDLES = [[54, 236, 3], [128, 240, 2], [62, 82, 3], [414, 80, 2], [334, 246, 3]];
const NEWC = [[110, 150, 3], [392, 150, 2]];
for (const [cx, cy] of CANDLES) for (let y = cy - 14; y <= cy + 4; y++) for (let x = cx - 10; x <= cx + 12; x++) {
  const s = src('unlit-base', x, y);
  if (s[0] > 0.85 && s[1] > 0.6 && s[2] < 0.55) { const i = y * W + x; FL[i] |= 2; glow(x, y, [1.4, 0.75, 0.25]); }
  else if (s[0] > 0.7 && s[1] > 0.6 && s[2] > 0.45) { const i = y * W + x; PZ[i] = Math.max(1, cy - y); NX[i] = 0; NY[i] = 1; NZ[i] = 0.2; FL[i] |= 2; }
}

for (const [cx, cy, n] of NEWC) for (let k = 0; k < n; k++) { // stub candles in a puddle of wax
  const x = cx + k * 3 - n, base = cy + (k & 1), hgt = [5, 3, 4][k % 3];
  for (let i = -1; i <= 2; i++) put(x + i, base + 1, L('#8e8466'), base + 1, 0.5, FLOOR, 0, 2);
  for (let z = 0; z < hgt; z++) { put(x, base - z, L('#c8bc98'), base, z, SOUTH, 0, 2); put(x + 1, base - z, L('#9a8e70'), base, z, SOUTH, 0, 2); }
  glow(x, base - hgt, [1.6, 0.9, 0.3]); glow(x + 1, base - hgt, [0.6, 0.3, 0.1]); glow(x, base - hgt - 1, [0.9, 0.45, 0.12]);
}
// ---------- sprites ----------
function drawSprite(name, ox, oy, Y, id, opt = {}) {
  const sp = spritePixels(name, ox, oy, opt.flip);
  for (const q of sp.px) { put(q.x, q.y, q.e && q.e[0] > 1 && q.e[1] < 0.2 ? mul(q.c, 0.1) : q.c, Y, (opt.z0 || 0) + q.z, opt.n || SPRITE, id, (opt.fl ?? 6) | (q.o ? 8 : 0)); if (q.e) glow(q.x, q.y, q.e); }
  return sp;
}
function chain(x, yTop, yBot, Y, zAtBot) { for (let y = yTop; y <= yBot; y++) put(x, y, (y % 3 === 0) ? L('#4a453e') : L('#2a2622'), Y, zAtBot + (yBot - y), SOUTH, 0, 2); }
function cage(x0, x1, y0, y1, z0, z1, id, contents) {
  const barC = (x, y, i) => (i % 2 ? C.rust : (h2(x, y, 2) < 0.3 ? C.rustL : C.rust));
  const vbar = (x, Y, n) => { for (let z = z0; z <= z1; z++) put(x, Y - z, barC(x, Y - z, z), Y, z, n, id, 6); occ(x, Y, z0, z1); };
  for (let x = x0; x <= x1; x += 4) vbar(x, y0, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y0 - z1, C.iron, y0, z1, SOUTH, id, 6); put(x, y0 - z0, C.iron, y0, z0, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y += 2) { vbar(x0, y, [-1, 0, 0]); vbar(x1, y, [1, 0, 0]); }
  if (contents) contents();
  for (let x = x0; x <= x1; x += 4) vbar(x, y1, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y1 - z1, C.rustL, y1, z1, SOUTH, id, 6); put(x, y1 - z0, C.rust, y1, z0, SOUTH, id, 6); put(x, y1 - z0 + 1, C.iron, y1, z0 + 1, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y++) { put(x0, y - z1, C.rustL, y, z1, FLOOR, id, 6); put(x1, y - z1, C.rustL, y, z1, FLOOR, id, 6); }
  for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x++) put(x, y - z1, C.iron, y, z1, FLOOR, id, 6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 3) put(x, y - z1, C.rust, y, z1, FLOOR, id, 6);
}
// contact shadows under the cast
for (const [n, x, y] of CAST) { const rx = n.startsWith('ghoul') && n !== 'ghoulUp' ? 10 : 6; for (let yy = -2; yy <= 2; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / 4 <= 1) dark(x + xx, y + yy, 0.35); }
const draws = [];
// wall corpses on hooks
draws.push([FY0 - 1, () => { for (const [x, sh] of [[168, 0], [313, 1]]) { const sp = drawSprite('corpse', x, 44, FY0 - 1, 20 + sh, { n: SOUTH, z0: FY0 - 44, fl: 6 }); chain(x - 1, 10, sp.y0 + 2, FY0 - 1, FY0 - sp.y0 - 2); for (let y = 45; y < FY0; y++) if (h2(x, y, 3) < 0.7) tint(x + (y > 56 ? 1 : 0), y, C.bloodD, 0.8); } }]);
// hanging cage, left, between the pillar and the brazier
draws.push([112, () => { const X = 156, Y0 = 104, Y1 = 112; cage(X, X + 20, Y0, Y1, 16, 40, 30, () => { drawSprite('slump', X + 10, Y1 - 2 - 18, Y1 - 3, 31, { z0: 18, fl: 6 }); for (let k = 0; k < 9; k++) put(X + 17 + (k > 5 ? 1 : 0), Y1 - 20 + k, k > 6 ? L('#a89c80') : L('#5a5244'), Y1 + 1, 20 - k, SOUTH, 31, 2); });
  chain(X + 3, 0, Y0 - 42, Y0, 42); chain(X + 15, 0, Y0 - 42, Y0, 42); occEll(X + 9, Y0 + 4, 9, 4, 16, 42); for (let k = 0; k < 3; k++) put(X + 18, Y1 - 8 + k * 4, C.bloodF, Y1 + 1, 8 - k * 4, SOUTH, 0, 2); }]);
// body hung from the vault by its wrists, right of the medallion
draws.push([120, () => { const bottom = 120 - 16, sp = drawSprite('corpse', 318, bottom, 120, 21, { z0: 16 }); chain(sp.x0 + 4, 0, sp.y0 - 1, 120, 16 + sp.h); occEll(318, 120, 4, 2, 14, 14 + sp.h); for (let k = 0; k < 4; k++) put(318, bottom + 2 + k * 3, C.bloodF, 120, 12 - k * 3, SOUTH, 0, 2); }]);
// empty hooks on chains
draws.push([100, () => { for (const [x, y, len] of [[262, 100, 38], [118, 190, 30]]) { chain(x, 0, y - len, y, len); put(x - 1, y - len + 1, C.rust, y, len - 1, SOUTH, 0, 2); put(x, y - len + 2, C.rust, y, len - 2, SOUTH, 0, 2); put(x + 1, y - len + 1, C.rust, y, len - 1, SOUTH, 0, 2); } }]);
// a dead Order soldier on his back
const IDS = { hero: 60, xbow: 50, ghoul: 51, ghoulUp: 53 };
CAST.forEach(([n, x, y, flip], k) => draws.push([y, () => { drawSprite(n, x, y, y, n === 'ghoul' ? 51 + k : IDS[n], { flip, fl: n === 'hero' ? 2 : 6 }); if (n !== 'hero') occEll(x, y, n === 'ghoul' ? 7 : 4, 2, 0, n === 'ghoul' ? 14 : 26); }]));
draws.push([HERO[1] + 0.5, () => { const s = SPR.hero, w = s.rows[0].length, x0 = Math.round(HERO[0] - w / 2), y0 = HERO[1] - s.rows.length + 1; drawSprite('lantern', x0 + s.lantern[0], y0 + s.lantern[1] + 8, HERO[1], 61, { fl: 2, z0: 6 }); }]);
draws.sort((a, b) => a[0] - b[0]).forEach(d => d[1]());
const LG = (() => { const s = SPR.hero, w = s.rows[0].length, x0 = Math.round(HERO[0] - w / 2), y0 = HERO[1] - s.rows.length + 1; return [x0 + s.lantern[0], y0 + s.lantern[1] + 4]; })();

// eyes in the dark
for (const [x, y, k] of [[239, 36, 0.8], [243, 36, 0.8], [46, 200, 0.25], [50, 199, 0.25], [432, 112, 0.3], [436, 111, 0.3]]) glow(x, y, [0.9 * k, 1.0 * k, 0.7 * k]);
// crossbow aim telegraph (dark red, B)
{ const [[x0, y0], [x1, y1]] = AIM, n = Math.hypot(x1 - x0, y1 - y0); for (let s = 6; s < n - 6; s++) if ((s % 4) < 2) glow(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, [0.34, 0, 0]); }

// ---------- lights ----------
for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const d = Math.hypot(x, y * 1.1); if (d < 6.5) glow(LG[0] + x, LG[1] + y, mul([0.5, 0.55, 0.2], Math.pow(1 - d / 6.5, 2) * 0.35)); }
const fire = L('#c08048'), cand = L('#b8844e');
const lights = [
  { p: [LG[0], HERO[1] + 1, 24], c: L('#c8c874'), I: 5.6, r0: 44, R: 200, haze: 0.0025 },
  { p: [HERO[0], HERO[1], 90], c: L('#5c6c90'), I: 0.3, r0: 140, R: 420, noShadow: true }, // night-sight, a touch of cobalt
  { p: [198, 87, 22], c: fire, I: 3.2, r0: 28, R: 160 },
  { p: [282, 87, 22], c: fire, I: 3.2, r0: 28, R: 160 },
  { p: [240, FY0 - 10, 26], c: L('#7fa89a'), I: 1.9, r0: 30, R: 170, haze: 0.02 }, // cold leak from beyond the gate
  ...[...CANDLES, ...NEWC].map(([x, y, n]) => ({ p: [x + 2, y + 2, 6], c: cand, I: 1.1 + n * 0.3, r0: 9, R: 64, haze: 0.006 })),
];
function shadow(i, l) {
  if (FL[i] & 2) return 1;
  const X = PX[i], Y = PY[i], Z = PZ[i], dx = l.p[0] - X, dy = l.p[1] - Y, dz = l.p[2] - Z;
  const steps = Math.ceil(Math.hypot(dx, dy));
  for (let s = 2; s < steps; s++) { const t = s / steps, x = (X + dx * t) | 0, y = (Y + dy * t) | 0, z = Z + dz * t, j = y * W + x; if (j < 0 || j >= N) continue; if (z >= LO[j] && z <= HI[j]) return 0; }
  return 1;
}
const AMB = L('#181a22').map(v => v * 1.0);
const out = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const x = i % W, y = (i / W) | 0; let r = 0, g = 0, b = 0;
  if (!(FL[i] & 1)) {
    let lr = AMB[0], lg = AMB[1], lb = AMB[2];
    for (const l of lights) {
      const dx = l.p[0] - PX[i], dy = l.p[1] - PY[i], dz = l.p[2] - PZ[i], d = Math.hypot(dx, dy, dz); if (d > l.R) continue;
      let ndl = (NX[i] * dx + NY[i] * dy + NZ[i] * dz) / d; ndl = Math.max(0, (ndl + 0.45) / 1.45); if (ndl <= 0) continue;
      const fall = l.I / (1 + (d / l.r0) ** 2) * Math.pow(Math.max(0, 1 - (d / l.R) ** 2), 2);
      if (!(l.noShadow || shadow(i, l))) continue;
      lr += l.c[0] * fall * ndl; lg += l.c[1] * fall * ndl; lb += l.c[2] * fall * ndl;
    }
    const boost = (FL[i] & 8) ? 0.25 : OID[i] === 60 ? 0.65 : (FL[i] & 4) ? 2.2 : 1;
    r = alb[i * 3] * lr * boost; g = alb[i * 3 + 1] * lg * boost; b = alb[i * 3 + 2] * lb * boost;
  }
  r += emi[i * 3]; g += emi[i * 3 + 1]; b += emi[i * 3 + 2];
  for (const l of lights) { if (l.noShadow) continue; const d = Math.hypot(x - l.p[0], (y - (l.p[1] - l.p[2])) * 1.2); const k = l.I * (l.haze ?? 0.012) * Math.exp(-d / (l.r0 * 1.4)); r += l.c[0] * k; g += l.c[1] * k; b += l.c[2] * k; }
  out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
}
// rim light on characters
for (let i = 0; i < N; i++) {
  if (!(FL[i] & 4) || (FL[i] & 8)) continue; const x = i % W, y = (i / W) | 0;
  for (const l of lights) {
    if (l.noShadow) continue; const sx = l.p[0], sy = l.p[1] - l.p[2], d = Math.hypot(PX[i] - l.p[0], PY[i] - l.p[1]); if (d > l.R) continue;
    const dd = Math.max(1, Math.hypot(sx - x, sy - y)), dx = Math.round((sx - x) / dd * 1.4), dy = Math.round((sy - y) / dd * 1.4); if (!dx && !dy) continue;
    const j = (y + dy) * W + (x + dx);
    if (OID[j] !== OID[i] || (FL[j] & 8)) { const fall = l.I / (1 + (d / l.r0) ** 2) * Math.pow(Math.max(0, 1 - (d / l.R) ** 2), 2), k = Math.min(0.06, fall * 0.12); out[i * 3] += l.c[0] * k; out[i * 3 + 1] += l.c[1] * k; out[i * 3 + 2] += l.c[2] * k; }
  }
}
for (let i = 0; i < N; i++) { // the hero's cold edge so he reads against the dark
  if (OID[i] !== 60 || (FL[i] & 8)) continue; const a = i - W - 1, l = i - 1;
  if (OID[a] !== 60 || (FL[a] & 8) || OID[l] !== 60 || (FL[l] & 8)) { out[i * 3] += 0.045; out[i * 3 + 1] += 0.05; out[i * 3 + 2] += 0.1; }
}
// ---------- post: tone, grade, vignette, grain, palette + dither (B's, palette extended with cobalt and crimson) ----------
const PAL = ['#1c140e', '#281c13', '#362619', '#463220', '#5a4228', '#745632', '#927040', '#000000', '#070605', '#0d0b09', '#13110d', '#1a1712', '#221e18', '#2b261e', '#353026', '#423a2e', '#504637', '#615541', '#76674e', '#8e7d60', '#a99878', '#c8b896', '#e6dab8',
  '#141a10', '#1f2717', '#2d371f', '#3f4a29', '#566236', '#717f44', '#929e58', '#b8c070', '#dfe29a',
  '#2e0d09', '#3a0408', '#5a0a10', '#7e1018', '#43130c', '#5c1a10', '#7a2416', '#a0301c', '#ff3a2a',
  '#5a2a0e', '#8a4516', '#c06a20', '#e8a040', '#ffd890',
  '#1e1222', '#2e1a36', '#46265a', '#643882', '#8a52a8',
  '#1a1e20', '#262c2e', '#384042', '#58605e', '#8a908a', '#c4c8bc', '#f2f4e4',
  // cobalt slabs, crimson walls and the teal moon, all dirtied
  '#0c0f1a', '#121828', '#1a2238', '#232e4a', '#2e3a5c', '#3e4c70',
  '#180c14', '#24121e', '#33182a', '#46203a', '#5c2a48',
  '#10201e', '#1a3330', '#2a4a44', '#4a7466', '#8ab4a0'].map(hex).map(c => c.map(v => v * 255));
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const img = new Uint8ClampedArray(N * 4); const G = mulberry32(99); const cache = new Map();
for (let i = 0; i < N; i++) {
  const x = i % W, y = (i / W) | 0; let c = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
  const vx = (x - W / 2) / (W / 2), vy = (y - H * 0.55) / (H / 2); c = mul(c, clamp(1.15 - 0.55 * (vx * vx + vy * vy)));
  c = c.map(v => { v = v * 3.7; v = v / (1 + v); v = Math.pow(v, 1 / 2.2); return v + (v * v * (3 - 2 * v) - v) * 0.45; });
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], em = emi[i * 3] + emi[i * 3 + 1] + emi[i * 3 + 2];
  c = mix(c, [lum, lum, lum], 0.18 * (1 - clamp(em * 3)));
  const sh = clamp(1 - lum * 2.2); c = [c[0] + 0.004 * (1 - lum) - 0.006 * sh, c[1] + 0.01 * (1 - lum) - 0.002 * sh, c[2] + 0.004 * (1 - lum) + 0.022 * sh]; // cobalt in the shadows, sick green in the mids
  const gr = (G() + G() - 1) * 0.03 * (0.5 + lum); c = c.map(v => v + gr);
  const dth = bayer[(y & 3) * 4 + (x & 3)] * 0.04;
  const r = clamp(c[0] + dth) * 255, g = clamp(c[1] + dth) * 255, b = clamp(c[2] + dth) * 255;
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let best = cache.get(key);
  if (best === undefined) { let bd = 1e9; best = 0; for (let p = 0; p < PAL.length; p++) { const q = PAL[p], dr = r - q[0], dg = g - q[1], db = b - q[2], dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2, d = dY * dY * 1.4 + dCo * dCo * 0.6 + dCg * dCg * 0.7; if (d < bd) { bd = d; best = p; } } cache.set(key, best); }
  const q = PAL[best]; img[i * 4] = q[0]; img[i * 4 + 1] = q[1]; img[i * 4 + 2] = q[2]; img[i * 4 + 3] = 255;
}
window.IMG = img;
