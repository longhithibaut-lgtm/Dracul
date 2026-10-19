// Procedural mockup: "Crasse et faim" (Fear & Hunger-like) torture crypt, 480x270 native.
const W = 480, H = 270, N = W * H;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry32(1337);
const rnd = (a = 0, b = 1) => a + (b - a) * R();
const ri = (a, b) => Math.floor(rnd(a, b + 1));
function h2(x, y, s = 0) { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function vn(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 4, s = 0) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
const hex = s => { const v = parseInt(s.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const L = s => hex(s).map(v => Math.pow(v, 2.2)); // to linear
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

// G-buffer
const alb = new Float32Array(N * 3), emi = new Float32Array(N * 3);
const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
const OID = new Int16Array(N), FL = new Uint8Array(N); // FL: 1 unlit void, 2 no shadow ray, 4 rim
const LO = new Float32Array(N).fill(1e9), HI = new Float32Array(N).fill(-1e9); // occluders at floor pos

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

// ---------- palette ----------
const C = {
  mortar: L('#110f0c'), stoneA: L('#4a4337'), stoneB: L('#5a5041'), stoneC: L('#43433e'),
  grime: L('#1e1a14'), moss: L('#3c4526'), mossL: L('#56602f'), blood: L('#560208'), bloodF: L('#74040c'), bloodD: L('#300105'),
  wall: L('#342f29'), wallL: L('#433b32'), wallD: L('#1e1b17'), pil: L('#5a564c'), pilL: L('#6e695b'), cap: L('#0d0c0a'), capEdge: L('#2c2721'),
  iron: L('#25211e'), rust: L('#5b3520'), rustL: L('#7d4a28'), void: [0, 0, 0],
  bone: L('#b8ab8c'), boneD: L('#7a6f5a'),
};

// ---------- floor ----------
const WB = 66; // wall base (floor starts here)
const stoneId = new Int32Array(N).fill(-1);
{
  // irregular flagstones: jittered-grid Voronoi, F2-F1 for mortar
  const CW = 21, CH = 14;
  const cell = (cx, cy) => [cx * CW + 3 + h2(cx, cy, 71) * (CW - 6), cy * CH + 2 + h2(cx, cy, 72) * (CH - 4)];
  for (let y = WB; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x + (vn(x / 9, y / 9, 5) - 0.5) * 3, wy = y + (vn(x / 9, y / 9, 6) - 0.5) * 3;
    const gx = Math.floor(wx / CW), gy = Math.floor(wy / CH);
    let f1 = 1e9, f2 = 1e9, id = 0, ny = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [px, py] = cell(gx + i, gy + j); const dx = (wx - px) / CW, dy = (wy - py) / CH; const d = Math.hypot(dx, dy) * 14;
      if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + (gy + j); ny = dy; } else if (d < f2) f2 = d;
    }
    const e = f2 - f1;
    const sunk = h2(id, 0, 81) < 0.12, pale = h2(id, 0, 82) > 0.85;
    let c = mix(mix(C.stoneA, C.stoneB, h2(id, 0, 73)), C.stoneC, h2(id, 0, 74) * 0.7);
    c = mul(c, (0.72 + 0.4 * h2(id, 0, 75)) * (sunk ? 0.6 : 1) * (pale ? 1.2 : 1));
    if (e < 0.85) c = mix(C.mortar, c, 0.3 + 0.3 * e);
    else {
      if (e < 1.8) c = mul(c, ny < 0 ? 1.15 : 0.75); // bevel: upper edge catches light, lower edge in shade
      const g = fbm(x / 5, y / 5, 3, 9 + (id & 7));
      c = mix(c, C.grime, clamp((g - 0.38) * 1.8) * 0.85);
      const spk = h2(x, y, 11); if (spk < 0.1) c = mul(c, 0.6); else if (spk > 0.97) c = mul(c, 1.3);
    }
    put(x, y, c, y, 0, FLOOR, 0, 0);
  }
  // cracks
  { for (let n = 0; n < 70; n++) {
    let x = rnd(0, W), y = rnd(WB, H), a = rnd(0, 6.28), len = ri(5, 18);
    for (let s = 0; s < len; s++) { dark(x, y, 0.45); a += rnd(-0.6, 0.6); x += Math.cos(a); y += Math.sin(a) * 0.7; }
  } }
  // filth, mold, damp
  for (let y = WB; y < H; y++) for (let x = 0; x < W; x++) {
    const f = fbm(x / 28, y / 22, 4, 21), m = fbm(x / 16, y / 13, 4, 33);
    if (f > 0.52) tint(x, y, C.grime, clamp((f - 0.52) * 4) * 0.8);
    const w2 = fbm(x / 60, y / 40, 3, 44); dark(x, y, 0.75 + 0.5 * w2);
    const nearWall = clamp(1 - (y - WB) / 40);
    if (m * (0.6 + nearWall) > 0.62) tint(x, y, h2(x, y, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.6 + nearWall) - 0.62) * 4) * 0.8);
    if (y < WB + 5) dark(x, y, 0.5 + (y - WB) * 0.1); // contact shadow at wall base
  }
}
function stain(cx, cy, rx, ry, col, amt, seed, rough = 0.5) {
  for (let y = -ry * 1.6; y <= ry * 1.6; y++) for (let x = -rx * 1.6; x <= rx * 1.6; x++) {
    const d = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
    const nn = fbm((cx + x) / 5, (cy + y) / 5, 3, seed);
    const v = 1 - d + (nn - 0.5) * rough * 2;
    if (v > 0) tint(cx + x, cy + y, col, clamp(v * 3) * amt);
  }
}
function smear(path, w, col, amt, seed) { // drag marks: streaky along the path, accumulated once per pixel
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
  for (let i = 0; i < N; i++) if (m[i] > 0) tint(i % W, (i / W) | 0, col, m[i] * amt);
}
function groove(path, seed) {
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, y0] = path[p], [x1, y1] = path[p + 1]; const len = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s <= len; s += 0.5) {
      const x = x0 + (x1 - x0) * s / len, y = y0 + (y1 - y0) * s / len;
      tint(x, y, C.mortar, 0.85); if (vn(s / 3, p, seed) > 0.35) tint(x, y, C.bloodD, 0.9); tint(x, y + 1, C.mortar, 0.3);
    }
  }
}

// layout
const HERO = [240, 214];
const DRAIN = [266, 170];
const PIT = { x0: 112, x1: 176, y0: 150, y1: 180 };
const XB = [336, 158];
const G1 = [192, 179], G2 = [306, 238], G3 = [196, 262];

// blood around drain, grooves, drag marks, pools
groove([[DRAIN[0] - 9, DRAIN[1] - 2], [232, 158], [206, 152], [180, 160]], 2);
stain(DRAIN[0], DRAIN[1], 22, 14, C.blood, 1, 41, 0.6);
stain(DRAIN[0], DRAIN[1], 12, 8, C.bloodD, 0.9, 42, 0.4);
smear([[240, 64], [236, 84], [226, 104], [210, 124], [190, 138], [176, 150]], 6, C.blood, 0.75, 51);
smear([[176, 184], [186, 192], [196, 196]], 4, C.blood, 0.7, 53); // something crawled out of the pit
for (let k = 0; k < 9; k++) { const x = 200 + k * 7 + (k & 1) * 2, y = 198 + k * 4 + ((k & 1) ? 3 : 0); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, -1]]) tint(x + dx, y + dy, C.blood, 0.75 - k * 0.05); } // bloody claw prints
smear([[290, 180], [300, 200], [306, 230]], 2, C.bloodD, 0.5, 54);
smear([[252, 66], [258, 90], [250, 112]], 2.5, C.blood, 0.55, 52);
stain(300, 104, 9, 5, C.bloodF, 0.9, 61, 0.5);   // under hanging corpse 1
stain(300, 104, 4, 2, C.bloodD, 0.9, 62, 0.3);
stain(347, 210, 18, 7, C.blood, 0.7, 71, 0.7);   // under cage
stain(150, 186, 30, 9, C.blood, 0.75, 81, 0.7);   // pit spill
stain(92, 136, 10, 4, C.blood, 0.7, 91, 0.7);
stain(370, 250, 26, 10, C.grime, 0.6, 93, 0.8);
// spatter
for (let n = 0; n < 140; n++) { const a = rnd(0, 6.28), r = Math.pow(rnd(), 2.5) * 50; const x = DRAIN[0] + Math.cos(a) * r * 1.4, y = DRAIN[1] + Math.sin(a) * r * 0.8 + 10; if (y > WB) tint(x, y, n % 3 ? C.blood : C.bloodF, 0.9); }
// bones & rags scattered
function bone(x, y, len, a) { for (let s = 0; s <= len; s++) { const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s * 0.7; put(px, py, s === 0 || s === len ? C.bone : C.boneD, py, 0.5); } }
for (let n = 0; n < 26; n++) { let x, y; do { x = rnd(20, 460); y = rnd(WB + 6, 262); } while (Math.hypot(x - HERO[0], y - HERO[1]) < 22); bone(x, y, ri(2, 5), rnd(0, 6.28)); }
for (let n = 0; n < 160; n++) { const x = rnd(14, 466), y = rnd(WB + 4, 268), a = rnd(-0.6, 0.6) + (n & 1) * 1.57, len = ri(2, 4); for (let k = 0; k < len; k++) tint(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.6, L(n % 3 ? '#6e5c34' : '#8a7444'), 0.75); } // straw
for (let n = 0; n < 9; n++) stain(rnd(30, 450), rnd(WB + 20, 262), rnd(6, 14), rnd(3, 6), C.grime, 0.8, 300 + n, 0.8); // wet filth
function skull(x, y) { const S = ['.bb.', 'bbbb', 'kbkb', '.bb.']; S.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') put(x + i, y + j, ch === 'b' ? C.bone : C.mortar, y + 3, 3 - j, SOUTH); })); }
skull(206, 194); skull(70, 172); skull(384, 222); skull(350, 96); skull(268, 236);

// ---------- body pit ----------
{
  const { x0, x1, y0, y1 } = PIT;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const edgeW = x === x0 || x === x1 || y === y1;
    if (y < y0 + 9) { // inner north face (south-facing wall going down)
      const depth = y - y0;
      let c = mix(C.wallD, C.wall, h2(x >> 2, (y + (x >> 2)) >> 2, 7) * 0.6);
      if ((y - y0) % 4 === 0) c = C.mortar;
      put(x, y, c, y0, -depth * 3, SOUTH, 0, 0);
      tint(x, y, C.bloodD, clamp(fbm(x / 4, y / 2, 3, 77) - 0.35) * 1.2);
    } else {
      put(x, y, mul(C.mortar, 0.6), y, -30, FLOOR, 0, 0); // bottom
    }
  }
  // (bodies are drawn later, see pitBodies)
  for (let y = y0 + 9; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, mul(C.mortar, 0.5), y, -30, FLOOR);
  for (let n = 0; n < 6; n++) { const cx = rnd(x0 + 6, x1 - 6), cy = rnd(y0 + 11, y1 - 3); stain(cx, cy, 4, 2, C.bloodF, 0.7, 100 + n, 0.4); }
  // an arm reaching up over the lip
  for (let s = 0; s < 7; s++) put(x0 + 30 + (s >> 2), y1 - 2 - s, s < 2 ? C.bone : L('#6d6252'), y1, s, SOUTH);
  // lip stones
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    put(x, y0 - 1, C.wallL, y0 - 1, 0); put(x, y0 - 2, C.wall, y0 - 2, 0);
    put(x, y1 + 1, mul(C.wallL, 1.1), y1 + 1, 0); put(x, y1 + 2, C.wallD, y1 + 2, 0);
  }
  for (let y = y0 - 2; y <= y1 + 2; y++) { put(x0 - 1, y, C.wallL, y, 0); put(x0 - 2, y, C.wall, y, 0); put(x1 + 1, y, C.wallL, y, 0); put(x1 + 2, y, C.wall, y, 0); }
}

// ---------- drain ----------
{
  const [cx, cy] = DRAIN;
  for (let y = -7; y <= 7; y++) for (let x = -11; x <= 11; x++) {
    const d = (x * x) / 110 + (y * y) / 42;
    if (d > 1) continue;
    let c;
    if (d > 0.68) c = (y < 0 ? C.iron : C.rust);
    else if (((x + 20) % 3) === 0 || (y + 20) % 4 === 0) c = h2(x, y, 9) < 0.4 ? C.rust : C.iron;
    else c = [0.002, 0.0005, 0.0003];
    put(cx + x, cy + y, c, cy + y, 0);
  }
}

// ---------- back wall ----------
{
  for (let y = 0; y < WB; y++) for (let x = 0; x < W; x++) {
    if (y < 8) { put(x, y, y === 7 ? C.capEdge : C.cap, WB - 4, 60, FLOOR, 0, y === 7 ? 0 : 1); continue; }
    const row = Math.floor((y - 8) / 7), ry = (y - 8) % 7;
    const off = (row * 13) % 23;
    const bw = 18 + (row % 3) * 3, col = Math.floor((x + off) / bw), rx = (x + off) % bw;
    let c = mix(C.wall, C.wallL, h2(col, row, 2) * 0.8);
    c = mul(c, rnd(0.92, 1.05));
    if (ry === 0 || rx === 0) c = C.mortar;
    else if (ry === 1) c = mul(c, 1.15);
    else if (ry === 6) c = mul(c, 0.75);
    // drips and damp
    const drip = vn(x / 2.2, y / 40, 13);
    if (drip > 0.62) c = mix(c, C.wallD, clamp((drip - 0.62) * 5) * 0.9);
    const damp = fbm(x / 20, y / 10, 3, 17);
    c = mix(c, y > 44 ? C.moss : C.wallD, clamp((damp - 0.5) * 3) * (y > 44 ? 0.6 : 0.5));
    if (y > 56) c = mix(c, C.grime, (y - 56) / 12);
    put(x, y, c, WB, WB - y, SOUTH);
  }
  for (let y = WB - 4; y < WB; y++) for (let x = 0; x < W; x++) occ(x, y, -99, 999);
  // side wall tops (frame)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = x < 9, r = x >= W - 9; if (!l && !r) continue;
    const edge = (l && x === 8) || (r && x === W - 9);
    put(x, y, edge ? C.capEdge : C.cap, y, 60, FLOOR, 0, edge ? 0 : 1);
    occ(x, y, -99, 999);
  }
}
// ---------- gate ----------
const GATE = { x0: 214, x1: 266, top: 14 };
{
  const { x0, x1, top } = GATE, cx = (x0 + x1) / 2, r = (x1 - x0) / 2;
  const inArch = (x, y) => x >= x0 && x <= x1 && (y >= top + r || Math.hypot(x - cx, (y - (top + r)) * 1.0) <= r);
  for (let y = top - 4; y < WB; y++) for (let x = x0 - 5; x <= x1 + 5; x++) {
    const inner = inArch(x, y), outerD = Math.hypot(x - cx, Math.min(0, y - (top + r)));
    if (!inner && (outerD <= r + 4) && (y >= top - 4)) { // stone frame
      const ang = Math.atan2(y - (top + r), x - cx); const seg = Math.floor(ang * 5);
      let c = mix(C.wallL, L('#4a4237'), h2(seg, 1, 3)); if (((ang * 5) % 1 + 1) % 1 < 0.15 || outerD > r + 3) c = C.mortar;
      if (y >= top + r) c = (y % 6 === 0) ? C.mortar : mix(C.wallL, L('#4a4237'), h2(x > cx ? 1 : 0, y / 6 | 0, 4));
      put(x, y, c, WB, WB - y, SOUTH);
    }
    if (inner) {
      put(x, y, [0, 0, 0], WB - 8, WB - y, SOUTH, 0, 1);
      const fog = (0.25 + 0.75 * clamp((y - top) / (WB - top))) * (1 - Math.abs(x - cx) / (r + 2)) * (0.6 + 0.8 * fbm(x / 6, y / 4, 3, 123));
      glow(x, y, mul(L('#5f7468'), fog * 0.6));
    }
  }
  // a gaunt silhouette standing beyond the bars, cut out against the fog
  for (let y = 36; y < WB; y++) for (let x = 222; x <= 252; x++) {
    const head = Math.hypot((x - 236) / 4, (y - 41) / 5.5) < 1;
    const neck = y >= 45 && y < 49 && Math.abs(x - 236) <= 2;
    const sh = y >= 48 && Math.abs(x - 236) <= Math.min(7, 3 + (y - 48) * 1.5) && !(y > 53 && Math.abs(x - 236) === 5);
    if (inArch(x, y) && (head || neck || sh)) put(x, y, [0, 0, 0], WB - 9, WB - y, SOUTH, 0, 1);
  }
  // bars
  for (let x = x0 + 2; x < x1; x += 5) for (let y = top; y < WB; y++) if (inArch(x, y) && inArch(x - 1, y)) {
    put(x, y, h2(x, y, 4) < 0.35 ? C.rustL : C.rust, WB - 3, WB - y, SOUTH);
    put(x - 1, y, C.iron, WB - 3, WB - y, SOUTH);
  }
  for (const by of [top + r + 2, WB - 18]) for (let x = x0; x <= x1; x++) if (inArch(x, by)) { put(x, by, C.rust, WB - 3, WB - by, SOUTH); put(x, by + 1, C.iron, WB - 3, WB - by - 1, SOUTH); }
  for (let x = x0 + 2; x < x1; x += 5) { put(x, WB - 1, C.rustL, WB - 3, 1, SOUTH); put(x - 1, WB - 1, C.rust, WB - 3, 1, SOUTH); }
  // gate occluders: open between bars, closed above arch
  for (let x = x0; x <= x1; x++) for (let y = WB - 4; y < WB; y++) {
    const i = y * W + x; LO[i] = 1e9; HI[i] = -1e9;
    const bar = ((x - (x0 + 2)) % 5 + 5) % 5 >= 4 || ((x - (x0 + 2)) % 5 + 5) % 5 === 0;
    occ(x, y, WB - (top + r) + 6, 999);
    if (bar) occ(x, y, -99, 999);
    occ(x, y, 18 - 1, 18 + 1); occ(x, y, WB - (top + r + 2) - 1, WB - (top + r + 2) + 1);
  }
  // pale hands gripping the bars + eyes in the dark
  const hand = L('#8d8a76');
  for (const [hx, hy] of [[226, 40], [242, 37]]) { for (let k = 0; k < 3; k++) { put(hx + 1, hy + k, hand, WB - 4, WB - hy - k, SOUTH); put(hx - 2 + (k & 1) * 0, hy + k, hand, WB - 4, WB - hy - k, SOUTH); } put(hx - 1, hy, hand, WB - 4, WB - hy, SOUTH); put(hx, hy + 3, hand, WB - 4, WB - hy - 3, SOUTH); }
}

// ---------- characters / sprites ----------
function sprite(rows, pal, ox, oy, Y, id, opt = {}) { // ox,oy: screen pos of bottom-center
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const x0 = Math.round(ox - w / 2), y0 = oy - h + 1;
  rows.forEach((r, j) => [...r].forEach((ch, i0) => {
    if (ch === '.' || ch === ' ') return;
    const isO = ch === 'o';
    const i = opt.flip ? w - 1 - i0 : i0;
    const p = pal[ch]; if (!p) return;
    const x = x0 + i, y = y0 + j, z = (opt.z0 || 0) + (h - 1 - j);
    put(x, y, p.c || p, Y, z, opt.n || SPRITE, id, (opt.fl ?? 6) | (isO ? 8 : 0));
    if (p.e) glow(x, y, p.e);
  }));
  return { x0, y0, w, h };
}
const P = {
  o: L('#080706'),
};

// hanging corpse (front view)
const CORPSE = [
  '....c.....',
  '....c.....',
  '....c.....',
  '...occo...',
  '..odffdo..',
  '..odFfdo..',
  '...odbo...',
  '.ooodfdooo',
  'odFffffffdo',
  'odfFxfxfdfo',
  'odffxfxbdfo',
  'odo.fffbdod',
  'odo.ffbbo.d',
  'od..fffdo.o',
  'bo..dfffo..',
  '.o..odffdo.',
  '....odbfdo.',
  '....od.odo.',
  '....od.od..',
  '....bd.od..',
  '....od.bo..',
  '.....o..o..',
];
const HANG = [
  '....oc.co...',
  '....oc.co...',
  '....orrro...',
  '....odfdo...',
  '...odffdo...',
  '...odfFdo...',
  '...odfFdo...',
  '...odffFdo..',
  '...odffFdo..',
  '..odffffFdo.',
  '..odfbbfFdo.',
  '..odffffFdo.',
  '.odFfxfxfFdo',
  '.odfbxbxbfdo',
  '.odFfxfxfFdo',
  '.odo.dffd.do',
  '.odo.offo.do',
  '.od.odFFdo.d',
  '.od.odfFdo.o',
  '.oo.odffdo..',
  '.bo..odfo...',
  '.....obbo...',
  '......b.....',
];
const corpsePal = { o: P.o, r: L('#4a3a24'), c: L('#3a3632'), f: L('#7c705e'), F: L('#a3957c'), d: L('#4d4438'), b: L('#5a140e'), x: L('#c6b896') };
const corpsePal2 = { o: P.o, r: L('#4a3a24'), c: L('#3a3632'), f: L('#6a6656'), F: L('#8e8a72'), d: L('#403c32'), b: L('#4a100c'), x: L('#b0a888') };

function chain(x, yTop, yBot, Y, zAtBot) { for (let y = yTop; y <= yBot; y++) put(x + ((y & 2) ? 0 : 0), y, (y % 3 === 0) ? L('#4a453e') : L('#2a2622'), Y, zAtBot + (yBot - y), SOUTH, 0, 2); }

// wall corpses on hooks (on the back wall face)
function wallCorpse(x, pal, cut) {
  const rows = cut ? CORPSE.slice(0, cut) : CORPSE;
  sprite(rows, pal, x, 14 + rows.length, WB - 1, 20 + (x & 7), { n: SOUTH, z0: WB - (14 + rows.length), fl: 6 });
}
wallCorpse(160, corpsePal2);
wallCorpse(305, corpsePal, 15);
wallCorpse(418, corpsePal2);
// empty hook with chain at 182
chain(182, 8, 22, WB - 1, WB - 22); put(181, 23, C.rust, WB - 1, WB - 23, SOUTH); put(182, 24, C.rust, WB - 1, WB - 24, SOUTH); put(183, 23, C.rust, WB - 1, WB - 23, SOUTH);
stain(182, 30, 2, 12, C.blood, 0.0, 1); // (no-op placeholder avoided)
for (let y = 25; y < 64; y++) if (h2(182, y, 3) < 0.8) tint(182 + (y > 40 ? 1 : 0), y, C.bloodD, 0.8); // drip streak down the wall

// torches
function sconce(x, z, lit) {
  const y = WB - z;
  put(x, y + 1, C.iron, WB, z - 1, SOUTH); put(x - 1, y + 2, C.iron, WB, z - 2, SOUTH); put(x, y + 2, C.iron, WB, z - 2, SOUTH); put(x, y + 3, C.iron, WB, z - 3, SOUTH);
  put(x - 1, y, C.rust, WB, z, SOUTH); put(x, y, C.rust, WB, z, SOUTH); put(x + 1, y, C.rust, WB, z, SOUTH);
  if (lit) { glow(x, y - 1, [1.6, 0.55, 0.12]); glow(x, y - 2, [1.1, 0.3, 0.05]); glow(x - 1, y - 1, [0.6, 0.18, 0.04]); glow(x + 1, y - 3, [0.35, 0.08, 0.02]); }
  else { glow(x, y - 1, [0.25, 0.03, 0.01]); for (let k = 2; k < 18; k++) dark(x + (k > 9 ? 1 : 0), y - k, 0.55); }
}
sconce(196, 32, true);
sconce(332, 32, false);

// pillar
function pillar(cx, by, hgt, id) {
  const hw = 11;
  for (let y = by - 10; y <= by; y++) for (let x = cx - hw; x <= cx + hw; x++) occ(x, y, -99, hgt + 8);
  for (let y = by - hgt; y <= by + 1; y++) for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
    const z = by + 1 - y; const dx = x - cx;
    const plinth = z <= 5, capital = z >= hgt - 7;
    const w = plinth || capital ? hw + 2 : hw;
    if (Math.abs(dx) > w) continue;
    const a = Math.asin(clamp(dx / (w + 0.5), -1, 1));
    const n = [Math.sin(a), Math.cos(a), 0];
    let c = mix(C.pil, C.pilL, h2(Math.floor((y + 3) / 8), 0, cx) * 0.9);
    if (z === 6 || z === hgt - 7) c = C.mortar; else if ((by - y) % 8 === 0) c = mix(c, C.mortar, 0.45);
    const g = fbm(x / 3, y / 9, 3, cx); c = mix(c, C.wallD, clamp((g - 0.45) * 2.5) * 0.8);
    if (z < 14) c = mix(c, C.moss, clamp(fbm(x / 4, y / 4, 2, 5 + cx) - 0.45) * 1.5 * (1 - z / 14));
    c = mul(c, 0.55 + 0.45 * Math.cos(a));
    if (Math.abs(dx) === w) c = C.mortar;
    put(x, y, c, by + 1, z, n, id, 2);
  }
  // top surface
  for (let y = by - hgt - 10; y < by - hgt; y++) for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
    const e = y === by - hgt - 10 || x === cx - hw - 2 || x === cx + hw + 2;
    put(x, y, e ? C.mortar : mix(C.wallL, L('#4d463b'), h2(x, y, 8) * 0.5), y + hgt + 1, hgt + 8, FLOOR, id, 2);
  }
}

// cage (3/4 box of bars)
function cage(x0, x1, y0, y1, z0, z1, id, contents) {
  const barC = (x, y, i) => (i % 2 ? C.rust : (h2(x, y, 2) < 0.3 ? C.rustL : C.rust));
  const vbar = (x, Y, n) => { for (let z = z0; z <= z1; z++) put(x, Y - z, barC(x, Y - z, z), Y, z, n, id, 6); occ(x, Y, z0, z1); };
  // back bars + side bars back half
  for (let x = x0; x <= x1; x += 3) vbar(x, y0, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y0 - z1, C.iron, y0, z1, SOUTH, id, 6); put(x, y0 - z0, C.iron, y0, z0, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y += 2) { vbar(x0, y, [-1, 0, 0]); vbar(x1, y, [1, 0, 0]); }
  if (contents) contents();
  for (let x = x0; x <= x1; x += 3) vbar(x, y1, SOUTH);
  for (let x = x0; x <= x1; x++) { put(x, y1 - z1, C.rustL, y1, z1, SOUTH, id, 6); put(x, y1 - z0, C.rust, y1, z0, SOUTH, id, 6); put(x, y1 - z0 + 1, C.iron, y1, z0 + 1, SOUTH, id, 6); }
  for (let y = y0; y <= y1; y++) { put(x0, y - z1, C.rustL, y, z1, FLOOR, id, 6); put(x1, y - z1, C.rustL, y, z1, FLOOR, id, 6); }
  // top grid
  for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x++) put(x, y - z1, C.iron, y, z1, FLOOR, id, 6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 3) put(x, y - z1, C.rust, y, z1, FLOOR, id, 6);
}

// ---- sprites: hero, ghouls, crossbowman ----
const HERO_S = globalThis.HERO_ROWS || [
  '.......ooo.........',
  '......owwwo........',
  '.....owwwwwo.......',
  '.....owsssso.......',
  '.....oesSeso.......',
  '.....owsSSso.......',
  '......oSSSo........',
  '...oovvvvvvvoo.....',
  '.oVVvvVvvvvVvVo....',
  'oVVoovvVVVvvkcko...',
  'oVo.okcVvVvckhcko..',
  '.o..okchVVvckhhco..',
  '....okchcVckkhhcso.',
  '...okkchckckkhhcoLo',
  '...okchhckckkhhco.l',
  '...okchcckckkhhcoLLL',
  '...okchcckcckhhcLGGL',
  '..okkchcckcckhhcLGGL',
  '..okchhcckcckhhcoLLo',
  '..okchcckkcckkhco...',
  '.okkchcck.kckkhhko..',
  '.okchcckk.kckkhhcko.',
  '.okchckko.okckkhhko.',
  'okkkkkko...okkkkko..',
  '..oobbo.....obbo....',
  '..obbbo.....obbbo...',
  '..oooo......oooo....',
];
const heroPal = globalThis.HERO_PAL || {
  o: P.o, w: L('#16121a'), s: L('#c9c0b0'), S: L('#857c70'), e: { c: L('#ff2a2a'), e: [2.2, 0.1, 0.06] },
  v: { c: L('#3a1c48'), e: [0.13, 0.02, 0.23] }, V: { c: L('#24102e'), e: [0.05, 0.007, 0.095] }, k: L('#0d0b0d'), c: L('#19161a'), h: L('#2a242c'), b: L('#0a0909'),
  L: L('#4a4230'), l: L('#3a3428'), G: { c: L('#e8f0a0'), e: [2.6, 2.9, 1.0] },
};
const GHOUL_S = [
  '.......oooo..........',
  '.....oodFFdoo........',
  '....odFFffFFdo.......',
  '...odffrfrfrfdoo.....',
  '..odfrfrfrfffFFdoo...',
  '..odfffffffffffFFdoo.',
  '.odfdooffffffffFfFFdo',
  '.odo.odfdddooodfdFefo',
  'odo..odfo.....odffdeo',
  'odo..odfo....odmmfdo.',
  'o...odfo....odfmmdo..',
  '....odfo...odfoooo...',
  '...odfdo..odfo.......',
  '..odfdo..odfdo.......',
  '.onnoo..onnno........',
];
const ghoulPal = {
  o: P.o, f: L('#6b675a'), F: L('#9a9482'), d: L('#423e36'), r: L('#2c2924'), m: L('#5a0c08'), n: L('#b8ae90'),
  e: { c: L('#eef6d0'), e: [1.6, 1.8, 1.3] },
};
const XBOW_S = [
  '......oooooo......',
  '.....olllHHHo.....',
  '....olHHHHHHho....',
  '..ooBBBBBBBBBBoo..',
  '....okseskkkko....',
  '....okssskkkko....',
  '.....okkkkkko.....',
  '...oaaaaaaaaaao...',
  'oSo.oaatttttaaao..',
  'oSowwwwwwwwwWWaao.',
  'oSoooooooyoossaao.',
  '.o..otTyYYyTtaao..',
  '....otTYYYYTtao...',
  '....otTyYYyTtao...',
  '....otTtyyTttao...',
  '....otTttttTtao...',
  '....oTTttttTTo....',
  '....oTttttttTo....',
  '....oTTttttTTo....',
  '.....opppppo......',
  '.....oppoppo......',
  '.....oppoppo......',
  '.....obboobbo.....',
  '....obbbo.obbo....',
  '....oooo..ooo.....',
];
const xbowPal = {
  o: P.o, H: L('#5f605c'), h: L('#3b3c3a'), l: L('#9a9a92'), B: L('#4a4a46'), k: L('#1d1814'), s: L('#8a6a52'), e: { c: L('#d8d0c0'), e: [0.5, 0.45, 0.38] },
  a: L('#3c3c3a'), t: L('#b0a890'), T: L('#6e6654'), y: L('#a8741c'), Y: L('#e0a830'), S: L('#7a7a74'), W: L('#6e4a2a'), w: L('#4e331c'),
  p: L('#2a2622'), b: L('#161310'),
};
// cage occupant (slumped, seated)
const SLUMP_S = [
  '...oo....',
  '..oxxo...',
  '..oxkxo..',
  '..ofdfo..',
  '.odfffdo.',
  'odfrfrfdo',
  'odfffffdo',
  'oxfdbdfxo',
  '.odffffoo',
  'oxxooxxxo',
];
const slumpPal = { o: P.o, x: L('#a89c80'), k: L('#1a1410'), f: L('#5a5244'), d: L('#3a342c'), r: L('#2a241e'), b: L('#4a100c') };

// Order of drawing: back to front by floor Y.
// hanging cage (left), corpse over pit, corpse 1, back pillars, cage, characters, front pillars.
const draws = [];
draws.push([151, () => { // pile of bodies in the pit: lying corpses (HANG sprite turned 90 degrees)
  const { x0, x1, y0, y1 } = PIT;
  // tangle of bodies: torsos, heads and limbs, each with its own id so we can outline between them
  const bid = new Int16Array(N), skinR = [L('#a29680'), L('#b4a68c'), L('#867a66'), L('#968270')];
  const pp = (x, y, c, id, z) => { x |= 0; y |= 0; if (x < x0 || x > x1 || y < y0 + 8 || y > y1) return; const depth = 0.55 + 0.45 * clamp((y - y0 - 8) / (y1 - y0 - 8)); put(x, y, mul(c, depth), y, z, FLOOR, 0, 0); bid[y * W + x] = id; };
  for (let n = 1; n <= 14; n++) {
    const cx = rnd(x0 + 6, x1 - 6), cy = rnd(y0 + 11, y1 - 2), a = rnd(0, 6.28), rx = rnd(4, 6.5), ry = rnd(2, 3), sk = skinR[ri(0, 3)], z = -26 + n;
    const ca = Math.cos(a), sa = Math.sin(a);
    const limb = (ox, oy, la, len) => { for (let t = 0; t < len; t += 0.5) { const x = ox + Math.cos(la) * t, y = oy + Math.sin(la) * t * 0.7; pp(x, y, mul(sk, 0.9), n, z); pp(x + 1, y, mul(sk, 0.7), n, z); } if (h2(n, len | 0, 3) < 0.5) pp(ox + Math.cos(la) * len, oy + Math.sin(la) * len * 0.7, C.bone, n, z); };
    for (const s2 of [-1, 1]) { limb(cx + ca * rx * s2 * 0.8, cy + sa * rx * s2 * 0.5, a + (s2 > 0 ? 0 : Math.PI) + rnd(-0.9, 0.9), rnd(5, 9)); limb(cx + ca * rx * s2 * 0.8, cy + sa * rx * s2 * 0.5, a + (s2 > 0 ? 0 : Math.PI) + rnd(-1.2, 1.2), rnd(4, 8)); }
    for (let y = -7; y <= 7; y++) for (let x = -8; x <= 8; x++) {
      const u = (x * ca + y * sa) / rx, v = (-x * sa + y * ca) / ry; if (u * u + v * v > 1) continue;
      let c = mul(sk, v < -0.3 ? 1.15 : v > 0.4 ? 0.75 : 1);
      if (h2(cx + x | 0, cy + y | 0, n) < 0.18) c = mix(c, C.bloodF, 0.7); // flayed patches
      if (Math.abs(u) < 0.5 && ((x + y) & 1) && h2(n, 9, 9) < 0.4) c = mul(c, 0.7); // ribs
      pp(cx + x, cy + y * 0.8, c, n, z);
    }
    const hx = cx + ca * (rx + 2), hy = cy + sa * (rx + 2) * 0.7;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) pp(hx + x, hy + y, (x === 0 && y === 0) || (x === 1 && y === 0) ? mul(sk, 0.5) : mul(sk, 1.1), n, z);
  }
  for (let y = y0 + 8; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (bid[i] && (bid[i - 1] !== bid[i] || bid[i - W] !== bid[i])) dark(x, y, 0.35); }
  for (let n = 0; n < 5; n++) stain(rnd(x0 + 6, x1 - 6), rnd(y0 + 12, y1 - 2), 4, 2, C.bloodF, 0.8, 140 + n, 0.4);
  skull(118, 170); skull(170, 176);
}]);
draws.push([128, () => { // hanging cage left: floor footprint y 120..128, z 18..44
  const X = 76, Y0 = 124, Y1 = 132;
  cage(X, X + 18, Y0, Y1, 18, 44, 30, () => {
    sprite(SLUMP_S, slumpPal, X + 9, Y1 - 2 - 20, Y1 - 3, 31, { z0: 20, fl: 2 });
    for (let k = 0; k < 9; k++) put(X + 17 + (k > 5 ? 1 : 0), Y1 - 22 + k, k > 6 ? L('#a89c80') : L('#5a5244'), Y1 + 1, 22 - k, SOUTH, 31, 2); // arm through the bars
  });
  chain(X + 3, 0, Y0 - 44, Y0, 44); chain(X + 15, 0, Y0 - 44, Y0, 44);
  occEll(X + 9, Y0 + 4, 9, 4, 18, 44);
  for (let k = 0; k < 3; k++) put(X + 18, Y1 - 10 + k * 4, C.bloodF, Y1 + 1, 8 - k * 4, SOUTH, 0, 2);
}]);
draws.push([104, () => { // corpse 1 hanging from ceiling chain at floor (300,104), feet at z 12
  const rows = HANG; const bottom = 104 - 12;
  sprite(rows, corpsePal, 300, bottom, 104, 21, { z0: 12 });
  chain(299, 0, bottom - rows.length, 104, 12 + rows.length); chain(301, 0, bottom - rows.length, 104, 12 + rows.length);
  occEll(300, 104, 4, 2, 12, 12 + rows.length);
  for (let k = 0; k < 4; k++) put(300, bottom + 2 + k * 3, C.bloodF, 104, 10 - k * 3, SOUTH, 0, 2); // drips
}]);
draws.push([112, () => pillar(112, 112, 72, 40)]);
draws.push([112, () => pillar(372, 112, 72, 41)]);
draws.push([160, () => { // corpse over the pit (feet z 22)
  const bottom = 160 - 22; sprite(HANG, corpsePal2, 146, bottom, 160, 22, { z0: 22 });
  chain(145, 0, bottom - HANG.length, 160, 22 + HANG.length); chain(147, 0, bottom - HANG.length, 160, 22 + HANG.length);
  occEll(146, 160, 4, 2, 22, 22 + HANG.length);
}]);
draws.push([212, () => cage(336, 358, 198, 212, 0, 34, 32, () => {
  sprite(SLUMP_S, slumpPal, 347, 207, 207, 33, { fl: 2 });
})]);
// characters
draws.push([XB[1], () => { sprite(XBOW_S, xbowPal, XB[0], XB[1], XB[1], 50, {}); occEll(XB[0], XB[1], 4, 2, 0, 24); }]);
draws.push([G1[1], () => { sprite(GHOUL_S, ghoulPal, G1[0], G1[1], G1[1], 51, {}); occEll(G1[0], G1[1], 7, 2, 0, 12); }]);
draws.push([G2[1], () => { sprite(GHOUL_S, ghoulPal, G2[0], G2[1], G2[1], 52, { flip: true }); occEll(G2[0], G2[1], 7, 2, 0, 12); }]);
draws.push([G3[1], () => { sprite(GHOUL_S, ghoulPal, G3[0], G3[1], G3[1], 53, {}); occEll(G3[0], G3[1], 7, 2, 0, 12); }]);
draws.push([HERO[1], () => { sprite(HERO_S, heroPal, HERO[0], HERO[1], HERO[1], 60, { fl: 2 }); }]);
// contact shadows (AO) under characters before drawing them
for (const [x, y, rx] of [[HERO[0], HERO[1], 6], [XB[0], XB[1], 5], [G1[0], G1[1], 8], [G2[0], G2[1], 8], [G3[0], G3[1], 8]])
  for (let yy = -2; yy <= 2; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / 4 <= 1) dark(x + xx, y + yy, 0.35);
draws.sort((a, b) => a[0] - b[0]).forEach(d => d[1]());

// eyes watching from the dark (emissive only)
for (const [x, y, k] of [[234, 42, 0.7], [238, 42, 0.7], [22, 214, 0.22], [26, 213, 0.22], [455, 118, 0.3], [459, 117, 0.3]]) glow(x, y, [0.9 * k, 1.0 * k, 0.7 * k]);
// crossbow aim telegraph: dotted dark-red line to the hero
{ const [x0, y0] = [XB[0] - 9, XB[1] - 16], [x1, y1] = [HERO[0] + 2, HERO[1] - 14]; const n = Math.hypot(x1 - x0, y1 - y0);
  for (let s = 6; s < n - 6; s += 1) if ((s % 4) < 2) glow(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, [0.34, 0.0, 0.0]); }
// ---------- lights ----------
const HL = globalThis.HERO_LIGHT || { x: 8, h: 12, z: 26, c: '#c8c874', halo: [0.5, 0.55, 0.2] };
const LANT = [HERO[0] + HL.x, HERO[1] + 1, 9];
// small halo around the lantern glass
for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const d = Math.hypot(x, y * 1.1); if (d < 6.5) glow(LANT[0] + x, LANT[1] - HL.h + y, mul(HL.halo, Math.pow(1 - d / 6.5, 2) * 0.35)); }
const lights = [
  { p: [LANT[0], LANT[1], HL.z], c: L(HL.c), I: 5.0, r0: 46, R: 200, haze: 0.0025 },
  { p: [HERO[0], HERO[1], 90], c: L('#7c8a86'), I: 0.26, r0: 140, R: 420, noShadow: true }, // faint night-sight so silhouettes read
  { p: [196, WB + 6, 34], c: L('#b8804a'), I: 3.0, r0: 14, R: 90 },
  { p: [112, 116, 30], c: L('#b8804a'), I: 3.0, r0: 14, R: 90 },
  { p: [372, 116, 30], c: L('#b8804a'), I: 3.0, r0: 14, R: 90 },
  { p: [240, WB - 10, 22], c: L('#8fa890'), I: 1.6, r0: 26, R: 130, haze: 0.02 }, // cold leak from beyond the gate
];
// pillar torch sprites
for (const [x, id] of [[112, 40], [372, 41]]) { const y = 113 - 30; put(x, y + 1, C.iron, 114, 29, SOUTH, id, 2); put(x, y + 2, C.iron, 114, 28, SOUTH, id, 2); put(x - 1, y, C.rust, 114, 30, SOUTH, id, 2); put(x + 1, y, C.rust, 114, 30, SOUTH, id, 2); glow(x, y - 1, [1.5, 0.5, 0.1]); glow(x, y - 2, [0.9, 0.25, 0.04]); glow(x + 1, y - 3, [0.4, 0.1, 0.02]); }

function shadow(i, l) {
  if (FL[i] & 2) return 1;
  const X = PX[i], Y = PY[i], Z = PZ[i];
  const dx = l.p[0] - X, dy = l.p[1] - Y, dz = l.p[2] - Z;
  const d = Math.hypot(dx, dy); const steps = Math.ceil(d);
  for (let s = 2; s < steps; s++) {
    const t = s / steps; const x = (X + dx * t) | 0, y = (Y + dy * t) | 0; const z = Z + dz * t;
    const j = y * W + x; if (j < 0 || j >= N) continue;
    if (z >= LO[j] && z <= HI[j]) return 0;
  }
  return 1;
}
const AMB = L('#16181a').map(v => v * 0.9);
const out = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const x = i % W, y = (i / W) | 0;
  let r = 0, g = 0, b = 0;
  if (!(FL[i] & 1)) {
    let lr = AMB[0], lg = AMB[1], lb = AMB[2];
    for (const l of lights) {
      const dx = l.p[0] - PX[i], dy = l.p[1] - PY[i], dz = l.p[2] - PZ[i];
      const d = Math.hypot(dx, dy, dz); if (d > l.R) continue;
      let ndl = (NX[i] * dx + NY[i] * dy + NZ[i] * dz) / d; ndl = Math.max(0, (ndl + 0.45) / 1.45);
      if (ndl <= 0) continue;
      const fall = l.I / (1 + (d / l.r0) * (d / l.r0)) * Math.pow(Math.max(0, 1 - (d / l.R) ** 2), 2);
      const sh = l.noShadow ? 1 : shadow(i, l); if (!sh) continue;
      const k = fall * ndl;
      lr += l.c[0] * k; lg += l.c[1] * k; lb += l.c[2] * k;
    }
    const boost = (FL[i] & 8) ? 0.25 : OID[i] === 60 ? 0.9 : (FL[i] & 4) ? 2.2 : 1; // character readability cheat
    r = alb[i * 3] * lr * boost; g = alb[i * 3 + 1] * lg * boost; b = alb[i * 3 + 2] * lb * boost;
  }
  r += emi[i * 3]; g += emi[i * 3 + 1]; b += emi[i * 3 + 2];
  // haze glow around lights (screen space)
  for (const l of lights) {
    if (l.noShadow) continue;
    const sx = l.p[0], sy = l.p[1] - l.p[2]; const d = Math.hypot(x - sx, (y - sy) * 1.2);
    const k = l.I * (l.haze ?? 0.012) * Math.exp(-d / (l.r0 * 1.4));
    r += l.c[0] * k; g += l.c[1] * k; b += l.c[2] * k;
  }
  if (globalThis.MODE === 'albedo') { r = alb[i*3]*0.25; g = alb[i*3+1]*0.25; b = alb[i*3+2]*0.25; }
  out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
}
// rim light on characters: edge pixels facing each light get a light-coloured rim (readability)
for (let i = 0; i < N; i++) {
  if (!(FL[i] & 4) || (FL[i] & 8)) continue;
  const x = i % W, y = (i / W) | 0;
  for (const l of lights) {
    if (l.noShadow) continue;
    const sx = l.p[0], sy = l.p[1] - l.p[2];
    const d = Math.hypot(PX[i] - l.p[0], PY[i] - l.p[1]); if (d > l.R) continue;
    const dx = Math.round((sx - x) / Math.max(1, Math.hypot(sx - x, sy - y)) * 1.4), dy = Math.round((sy - y) / Math.max(1, Math.hypot(sx - x, sy - y)) * 1.4);
    if (!dx && !dy) continue;
    const j = (y + dy) * W + (x + dx);
    if (OID[j] !== OID[i] || (FL[j] & 8)) {
      const fall = l.I / (1 + (d / l.r0) ** 2) * Math.pow(Math.max(0, 1 - (d / l.R) ** 2), 2);
      const k = Math.min(0.06, fall * (OID[i] === 60 ? 0.04 : 0.12));
      out[i * 3] += l.c[0] * k; out[i * 3 + 1] += l.c[1] * k; out[i * 3 + 2] += l.c[2] * k;
    }
  }
}

for (let i = 0; i < N; i++) {
  if (OID[i] !== 60 || (FL[i] & 8)) continue;
  const x = i % W, y = (i / W) | 0; const a = (y - 1) * W + x - 1, l = y * W + x - 1;
  if (OID[a] !== 60 || (FL[a] & 8) || OID[l] !== 60 || (FL[l] & 8)) { out[i * 3] += 0.03; out[i * 3 + 1] += 0.028; out[i * 3 + 2] += 0.05; }
}
// ---------- post: tone, grade, vignette, grain, palette + dither ----------
const PAL = ['#1c140e', '#281c13', '#362619', '#463220', '#5a4228', '#745632', '#927040', '#000000', '#070605', '#0d0b09', '#13110d', '#1a1712', '#221e18', '#2b261e', '#353026', '#423a2e', '#504637', '#615541', '#76674e', '#8e7d60', '#a99878', '#c8b896', '#e6dab8',
  '#141a10', '#1f2717', '#2d371f', '#3f4a29', '#566236', '#717f44', '#929e58', '#b8c070', '#dfe29a',
  '#2e0d09', '#3a0408', '#5a0a10', '#7e1018', '#43130c', '#5c1a10', '#7a2416', '#a0301c', '#ff3a2a',
  '#5a2a0e', '#8a4516', '#c06a20', '#e8a040', '#ffd890',
  '#1e1222', '#2e1a36', '#46265a', '#643882', '#8a52a8',
  '#1a1e20', '#262c2e', '#384042', '#58605e', '#8a908a', '#c4c8bc', '#f2f4e4'].map(hex).map(c => c.map(v => v * 255));
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const img = new Uint8ClampedArray(N * 4);
const G = mulberry32(99);
const lantC = L('#c8cc70');
const cache = new Map();
for (let i = 0; i < N; i++) {
  const x = i % W, y = (i / W) | 0;
  let c = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
  // vignette (oval)
  const vx = (x - W / 2) / (W / 2), vy = (y - H * 0.55) / (H / 2);
  const vig = clamp(1.15 - 0.55 * (vx * vx + vy * vy)); c = mul(c, vig);
  // filmic tone (soft shoulder), back to sRGB
  c = c.map(v => { v = v * 3.2; v = v / (1 + v); v = Math.pow(v, 1 / 2.2); return v + (v * v * (3 - 2 * v) - v) * 0.45; });
  // grade: desaturate, push shadows green-brown
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const em = emi[i * 3] + emi[i * 3 + 1] + emi[i * 3 + 2];
  c = mix(c, [lum, lum, lum], 0.24 * (1 - clamp(em * 3)));
  c = [c[0] + 0.012 * (1 - lum), c[1] + 0.014 * (1 - lum), c[2] - 0.004];
  // grain (luminance)
  const gr = (G() + G() - 1) * 0.03 * (0.5 + lum);
  c = c.map(v => v + gr);
  // ordered dither + palette snap
  const dth = bayer[(y & 3) * 4 + (x & 3)] * 0.04;
  const r = clamp(c[0] + dth) * 255, g = clamp(c[1] + dth) * 255, b = clamp(c[2] + dth) * 255;
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let best = cache.get(key);
  if (best === undefined) {
    let bd = 1e9; best = 0;
    for (let p = 0; p < PAL.length; p++) { const q = PAL[p]; const dr = r - q[0], dg = g - q[1], db = b - q[2]; const dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2; const d = dY * dY * 1.4 + dCo * dCo * 0.6 + dCg * dCg * 0.7; if (d < bd) { bd = d; best = p; } }
    cache.set(key, best);
  }
  const q = PAL[best]; img[i * 4] = q[0]; img[i * 4 + 1] = q[1]; img[i * 4 + 2] = q[2]; img[i * 4 + 3] = 255;
}
// ---------- HUD (unlit, palette colors) ----------
function hudPx(x, y, h) { const c = hex(h).map(v => v * 255); const i = (y * W + x) * 4; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; }
{
  // blood vial bar
  for (let x = 14; x <= 82; x++) for (let y = 12; y <= 18; y++) {
    const edge = x === 14 || x === 82 || y === 12 || y === 18;
    hudPx(x, y, edge ? '#2b261e' : (x < 54 ? (y === 13 ? '#7a2416' : y < 16 ? '#5c1a10' : '#43130c') : '#0d0b09'));
  }
  // hunger pips (three teeth)
  for (let k = 0; k < 3; k++) for (let y = 21; y <= 24; y++) for (let x = 0; x < 3; x++) if (y - 21 <= (x === 1 ? 3 : 2)) hudPx(15 + k * 6 + x, y, k < 2 ? '#c8b896' : '#353026');
}
// expose
window.IMG = img; window.W = W; window.H = H;
