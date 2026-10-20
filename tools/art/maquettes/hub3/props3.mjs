// Refuge v3 props: door frames and seals, chief coffins open/closed, the hero's lid upright, hall furniture
// (pews, defaced saints, offered dead), training dummy, grindstone, writing desk, wardrobe corner, upgrades.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, partsSdf, clamp, lerp, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from './lib.mjs';
import { builder, boundsOf, sdPoly2, extrude, ratSdf, add, lp } from '../hub/chiefs.mjs';
import { addCandles } from '../hub/props.mjs';
import { sign } from './props2.mjs';

const C = {
  wood: L('#3a2818'), woodD: L('#1c130b'), woodL: L('#54402a'), plank: L('#5a4630'), plankD: L('#2a2016'), iron: L('#34302c'), rust: L('#5c3520'), rustL: L('#7a4626'),
  stone: L('#4e463a'), stoneD: L('#262019'), stoneL: L('#7a7062'), brick: L('#5a3e2c'), brickD: L('#2e2018'), mortar: L('#6a6250'),
  blood: L('#5e0710'), bloodD: L('#330507'), bloodF: L('#7a0b12'), bone: L('#c4b894'), boneD: L('#7a6e52'), wax: L('#d8ceb0'),
  silver: L('#b4b2a4'), gilt: L('#7a5a28'), giltD: L('#3a2a12'), straw: L('#94845e'), strawD: L('#5e5038'), burlap: L('#7a6a4a'),
  tabard: L('#bdb294'), tabardD: L('#7e7660'), sun: L('#b07a26'), corpse: L('#9c9478'), corpseD: L('#6c6a58'), muscle: L('#6a1f18'),
  dust: L('#5e5a50'), violet: L('#5e4a70'), violetD: L('#2a1f34'), velvet: L('#4a2a5a'),
};
const HOUSE = { rat: L('#8a8c80'), brume: L('#6a5684'), loup: L('#7a2a1e'), 'chauve-souris': L('#2a3656') };
const ironMat = (x, y, z) => { const n = vn3(x * 0.4, y * 0.4, z * 0.4, 7); return { alb: mix(C.iron, n > 0.55 ? C.rustL : C.rust, clamp(n * 1.8 - 0.4)), spec: 0.4, gloss: 30 }; };
const woodMat = (x, y, z, ax = 0, seed = 3, base = C.wood, dark = C.woodD) => { const g = ax === 0 ? vn3(x * 0.08, y * 1.2, z * 1.2, seed) : ax === 1 ? vn3(x * 1.2, y * 0.08, z * 1.2, seed) : vn3(x * 1.2, y * 1.2, z * 0.08, seed); return { alb: mix(mix(base, dark, clamp(g * 1.6 - 0.3)), C.woodL, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, seed + 1) - 0.6) * 1.5), spec: 0.12, gloss: 18 }; };
const stoneMat = (x, y, z, seed = 3, base = C.stone) => { const n = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, seed); return { alb: mix(base, C.stoneD, clamp(n * 1.6 - 0.3)), spec: 0.05, gloss: 10 }; };
const flame = { alb: [0, 0, 0], emi: [2.6, 1.2, 0.3], noAO: true, noShadow: true, rim: 0 };
const candleMat = m => m === 50 ? { alb: C.wax, sss: 0.8, wrap: 0.5, spec: 0.2, gloss: 30 } : m === 51 ? flame : null;
const ext = (d2, z, zc, h, r = 0) => extrude(d2 + r, z - zc, h - r) - r;
const CV = [[-56, -12], [-32, -19], [56, -10], [56, 10], [-32, 19], [-56, 12]];

// oriented box: centre c, unit axes u, v (w = u x v), half sizes h
function obox(parts, c, u, v, h, m, r = 0, k = 0) {
  const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const E = [0, 1, 2].map(k => Math.abs(u[k]) * h[0] + Math.abs(v[k]) * h[1] + Math.abs(w[k]) * h[2] + 2);
  parts.push({ m, k, box: [c[0] - E[0], c[1] - E[1], c[2] - E[2], c[0] + E[0], c[1] + E[1], c[2] + E[2]], f: (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    return sdBox(dx * u[0] + dy * u[1] + dz * u[2], dx * v[0] + dy * v[1] + dz * v[2], dx * w[0] + dy * w[1] + dz * w[2], 0, 0, 0, h[0], h[1], h[2], r); } });
  return { u, v, w };
}
const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
// plank from a to b, lying in the plane containing `side` (width direction), thickness along the normal
function plank(parts, a, b, side, wdt, th, m) { const u = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); const d = side[0] * u[0] + side[1] * u[1] + side[2] * u[2]; const v = nrm([side[0] - u[0] * d, side[1] - u[1] * d, side[2] - u[2] * d]);
  const L2 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2; return obox(parts, lp(a, b, 0.5), u, v, [L2, wdt / 2, th / 2], m, 0.3); }

// candles that flicker: [x, y, z0, h, r, lean (flame tip offset x,y), out]
export function candles2(list) {
  const b = builder();
  for (const [x, y, z0, h, r, lx = 0, ly = 0, out = 0] of list) {
    b.rc([x, y, z0], [x, y, z0 + h], r, r * 0.9, 50, 0); b.el([x, y, z0 + 0.4], [r * 1.9, r * 1.9, 0.7], 50, 0.6);
    if (out) { b.rc([x, y, z0 + h], [x, y, z0 + h + 1.2], 0.2, 0.2, 52, 0); continue; }
    b.rc([x, y, z0 + h + 0.6], [x + lx, y + ly, z0 + h + 3.6 - Math.hypot(lx, ly) * 0.3], 0.75, 0.25, 51, 0.3);
  }
  return { sdf: partsSdf(b.parts), mat: m => m === 52 ? { alb: L('#0c0a08') } : candleMat(m), bounds: boundsOf(b.parts, 2), step: 0.6, noShadow: true };
}

// ---------- side doorway: two stone jambs + lintel; local -x points into the room it serves, the gap runs along y ----------
// state: 'open' | 'sealed' (bricked, X of planks, chain, the house seal nailed on)
export function doorFrame(span = 80, h = 170, state = 'open', kind = 'rat') {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(span + h);
  const py = span / 2 + 11;
  for (const s of [-1, 1]) { bx([0, s * py, h / 2], [12, 11, h / 2], 1, 1.0); bx([0, s * py, 6], [15, 14, 6], 1, 1.0); bx([0, s * py, h - 4], [14, 13, 4], 1, 0.8); }
  bx([0, 0, h + 10], [14, py + 13, 10], 2, 1.0);                                         // lintel
  el([-13, 0, h + 10], [2, 9, 7], 2, 0.6);                                               // keystone boss
  if (state === 'sealed') {
    parts.push({ m: 3, k: 0, box: [-14, -span / 2 - 2, 0, 14, span / 2 + 2, h + 2], f: (x, y, z) => sdBox(x, y, z, 2, 0, h / 2, 9, span / 2 + 1, h / 2, 0.5) + 0.6 * (vn(y * 0.3, z * 0.3, 4) - 0.5) }); // bricked up
    for (const s of [-1, 1]) plank(parts, [-30, s * (span / 2 + 6), 2], [-12, -s * (span / 2 + 4), h - 18], [0, 1, 0], 11, 2.4, 4);
    plank(parts, [-16, -span / 2 - 12, h * 0.45], [-16, span / 2 + 12, h * 0.5], [0, 0, 1], 9, 2.4, 4);
    let prev = null; for (let k = 0; k <= 14; k++) { const t = k / 14, q = [-26, lerp(-py, py, t), h * 0.72 - Math.sin(t * Math.PI) * 26]; if (prev) el(lp(prev, q, 0.5), [1.5, (k & 1) ? 2.2 : 1.2, (k & 1) ? 1.2 : 2.2], 5, 0); prev = q; }
    rc([-27, 0, h * 0.72 - 26], [-27, 0, h * 0.72 - 34], 3.2, 3.2, 5, 0);                 // padlock
    // the house seal: a lead disc nailed on the X
    const n = nrm([-0.6, 0, 1]), cx = -21, cz = h * 0.52; parts.push({ m: 6, k: 0, box: [-34, -14, cz - 14, -8, 14, cz + 14], f: (x, y, z) => { const S = (x - cx) * n[0] + (z - cz) * n[2], T = (x - cx) * n[2] - (z - cz) * n[0]; return extrude(Math.hypot(y, T) - 11, S - 3, 1.4); } });
    for (let i = 0; i < 6; i++) { const y = (R() - 0.5) * span, x = -30 - R() * 30; el([x, y, 2], [5 + R() * 5, 4 + R() * 4, 3 + R() * 3], 7, 1.0); } // rubble at the foot
  }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1 || m === 2) { const r = stoneMat(x, y, z, m === 1 ? 5 : 8, m === 2 ? mix(C.stone, C.stoneL, 0.25) : C.stone); if (Math.abs(((z % 26) + 26) % 26) < 1.2 && m === 1) r.alb = mul(r.alb, 0.45); if (z < 40) r.alb = mix(r.alb, L('#3a4224'), clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 5) - 0.45)); return r; }
    if (m === 3) { const row = Math.floor(z / 7), off = (row & 1) * 6, u = ((y + off) % 12 + 12) % 12, v = z - row * 7; let c = mix(C.brick, C.brickD, vn3(Math.floor((y + off) / 12), row, 0, 3) * 0.8 + vn3(x, y, z, 2) * 0.3); if (u < 1 || v < 1) c = C.mortar; return { alb: c, spec: 0.05 }; }
    if (m === 4) { const w = woodMat(x, y, z, 1, 21, C.plank, C.plankD); if (h2(Math.floor(x * 0.3 + y * 0.3 + z * 0.3), 0, 5) < 0.04) w.alb = L('#141210'); return w; }
    if (m === 5) return { alb: mix(L('#3a3836'), L('#1a1816'), vn3(x, y, z, 3)), spec: 0.7, gloss: 40 };
    if (m === 6) { // lead seal with the house sign in relief (dull silver on grey), wax drips
      const n = nrm([-0.6, 0, 1]); const T = (x + 21) * n[2] - (z - h * 0.52) * n[0]; const u = -y / 9, v = T / 9;
      const sgn = sign(kind, u, v); return { alb: sgn ? mix(C.silver, C.boneD, 0.3) : mix(L('#4a4846'), L('#2a2826'), vn3(x, y, z, 2)), spec: sgn ? 0.9 : 0.3, gloss: 50 }; }
    if (m === 7) return stoneMat(x, y, z, 9);
    return { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}
// a lancet arch (frontal, faces +y) bricked up behind and boarded in front, the house seal on the boards
export function archSeal(w = 80, h = 190, kind = 'chauve-souris') {
  const b = builder(); const { parts, el, rc } = b;
  parts.push({ m: 3, k: 0, box: [-w / 2 - 2, -8, 0, w / 2 + 2, 2, h + 2], f: (x, y, z) => sdBox(x, y, z, 0, -4, h / 2, w / 2, 3, h / 2, 0) + 0.5 * (vn(x * 0.3, z * 0.3, 4) - 0.5) });
  for (const s of [-1, 1]) plank(parts, [s * (w / 2 - 2), 4, 4], [-s * (w / 2 - 6), 5, h - 30], [1, 0, 0], 11, 2.4, 4);
  plank(parts, [-w / 2 - 4, 6, h * 0.42], [w / 2 + 4, 6, h * 0.46], [0, 0, 1], 10, 2.4, 4);
  parts.push({ m: 6, k: 0, box: [-14, 4, h * 0.45 - 14, 14, 12, h * 0.45 + 14], f: (x, y, z) => extrude(Math.hypot(x, z - h * 0.45) - 11, y - 8, 1.4) });
  for (let i = 0; i < 6; i++) { const R = mulberry32(i + 7); el([(R() - 0.5) * w, 14 + R() * 14, 2], [5 + R() * 5, 4 + R() * 4, 3 + R() * 3], 7, 1.0); }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => {
    if (m === 3) { const row = Math.floor(z / 7), off = (row & 1) * 6, u = ((x + off) % 12 + 12) % 12, v = z - row * 7; let c = mix(C.brick, C.brickD, vn3(Math.floor((x + off) / 12), row, 0, 3) * 0.8 + vn3(x, y, z, 2) * 0.3); if (u < 1 || v < 1) c = C.mortar; return { alb: c, spec: 0.05 }; }
    if (m === 4) return woodMat(x, y, z, 2, 21, C.plank, C.plankD);
    if (m === 6) { const sgn = sign(kind, x / 9, (z - h * 0.45) / 9); return { alb: sgn ? mix(C.silver, C.boneD, 0.3) : mix(L('#4a4846'), L('#2a2826'), vn3(x, y, z, 2)), spec: sgn ? 0.9 : 0.3, gloss: 50 }; }
    return stoneMat(x, y, z, 9);
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- a chief's coffin on its bier: open (lid leaning, bedding showing) or still closed (lid on, sign up, dust, chain) ----------
const LINING = { rat: L('#3a3226'), brume: L('#2e2238'), loup: L('#3a2a1e'), 'chauve-souris': L('#141a2a') };
export function chiefCoffin(kind, seed = 1, open = true) {
  const b = builder(); const { parts, bx, el, rot, rc } = b; const R = mulberry32(seed);
  bx([0, 0, 17], [66, 26, 17], 1, 1.2); bx([0, 0, 2], [70, 30, 2], 1, 0.6);
  parts.push({ m: 2, k: 0, box: [-60, -24, 33, 60, 24, 62], f: (x, y, z) => {
    const d2 = sdPoly2(x, y, CV); let d = ext(d2, z, 47, 13, 0.6);
    d = Math.min(d, ext(d2 - 0.9, z, 59.2, 0.9, 0.3)); if (open) d = Math.max(d, -ext(d2 + 3, z, 58, 11)); return d; } });
  if (open) {
    parts.push({ m: 3, k: 0, box: [-56, -18, 36, 56, 18, 52], f: (x, y, z) => Math.max(sdPoly2(x, y, CV) + 2.9, z - 47.5 - 1.2 * vn3(x * 0.2, y * 0.2, 0, seed)) });
    if (kind === 'rat') { for (let i = 0; i < 9; i++) el([(R() - 0.5) * 70, (R() - 0.5) * 18, 48.5], [7 + R() * 5, 4 + R() * 3, 2.2], 4, 1.5); for (const [x, y, yaw] of [[-12, 2, 0.6], [16, -5, 2.4], [30, 6, -1.0]]) rot([x, y, 49], yaw, ratSdf, 6, 0, 14); }
    if (kind === 'loup') for (let i = 0; i < 6; i++) el([(R() - 0.5) * 70, (R() - 0.5) * 16, 49], [12 + R() * 6, 7, 3.2], 5, 2.0);
    const a = -0.62, ca = Math.cos(a), sa = Math.sin(a), LY = 44, LZ = 14;
    parts.push({ m: 7, k: 0, box: [-60, 20, -2, 60, 64, 32], f: (x, y, z) => { const yy = y - LY, zz = z - LZ; const Y = yy * ca + zz * sa, Z = -yy * sa + zz * ca; return ext(sdPoly2(x, Y, CV.map(([u, v]) => [u * 0.98, v * 1.05])), Z, 1.6, 1.6, 0.4); } });
    addCandles(b, [[-60, -20, 34, 6 + R() * 6, 1.2], [60, -20, 34, 4 + R() * 6, 1.1], [-58, 22, 34, 3 + R() * 3, 1.0]]);
  } else {
    parts.push({ m: 8, k: 0, box: [-60, -24, 58, 60, 24, 66], f: (x, y, z) => ext(sdPoly2(x, y, CV.map(([u, v]) => [u * 1.01, v * 1.06])), z, 61.4, 1.8, 0.5) }); // lid on, flat
    for (const xx of [-30, 26]) parts.push({ m: 9, k: 0, box: [xx - 4, -30, 30, xx + 4, 30, 66], f: (x, y, z) => { const w = xx < 0 ? 15 + (xx + 56) * 0.3 : 19 - (xx + 32) * 0.1; return Math.max(Math.abs(Math.hypot((y) / (w + 2), (z - 47) / 16.5) - 1) * 14 - 0.9, Math.abs(x - xx) - 1.6); } }); // chains round it
    addCandles(b, [[-60, -20, 34, 2, 1.2], [60, -20, 34, 1.5, 1.1]]);
  }
  const sdf = partsSdf(parts); const lin = LINING[kind];
  const a = -0.62, ca = Math.cos(a), sa = Math.sin(a), LY = 44, LZ = 14;
  const signAt = (u, v) => { const s = sign(kind, u, v), ring = Math.abs(Math.hypot(u * 0.62, v * 0.95) - 0.98) < 0.04; return s || ring; };
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1) { const n = fbm3(x * 0.12, y * 0.12, z * 0.12, 3, 21 + seed); let c = mix(C.stone, C.stoneD, clamp(n * 1.6 - 0.3));
      if (nz > 0.5 && z > 33) c = mix(c, C.dust, open ? 0.35 : 0.6); if (vn3(x * 0.15, y * 0.5, z * 0.1, 41 + seed) > 0.64 && ny > 0.5) c = mix(c, C.bloodD, 0.7);
      if (Math.abs(z - 30) < 0.8 && ny > 0.5) c = mul(c, 0.5); return { alb: c, spec: 0.05, gloss: 10 }; }
    if (m === 2) { const inner = open && z > 37 && sdPoly2(x, y, CV) > -3.4 && z < 59; if (inner) return { alb: mix(lin, L('#0e0c0c'), vn3(x * 0.5, y * 0.5, z * 0.5, 4) * 0.7), spec: 0.1, gloss: 20, ao: 0.6 };
      const w = woodMat(x, y, z, 0, 9 + seed); w.alb = mix(w.alb, L('#0e0c0c'), 0.55); if (nz > 0.5) w.alb = mix(w.alb, C.dust, 0.25); return w; }
    if (m === 3) return { alb: mix(lin, mul(lin, 0.4), vn3(x * 0.4, y * 0.4, z, 5)), wrap: 0.4, spec: kind === 'chauve-souris' ? 0.5 : 0.05, gloss: 40 };
    if (m === 4) return { alb: mix(C.straw, L('#2a2014'), vn3(x * 1.3, y * 1.3, z, 3)), wrap: 0.5 };
    if (m === 5) return { alb: mix(L('#4a3a2a'), L('#1e1610'), vn3(x * 1.5, y * 0.8, z, 6)), wrap: 0.5 };
    if (m === 6) return { alb: mix(L('#4e4a44'), L('#24221e'), vn3(x * 1.5, y * 1.5, z * 1.5, 4)), wrap: 0.4, spec: 0.12, gloss: 20 };
    if (m === 7) { const yy = y - LY, zz = z - LZ; const Y = yy * ca + zz * sa;
      const w = woodMat(x, Y, 0, 0, 12 + seed); w.alb = mix(w.alb, L('#0c0a08'), 0.55);
      if (signAt((x - 4) / 24, -Y / 16)) return { alb: mix(C.silver, C.boneD, vn3(x * 0.6, Y * 0.6, 0, 3) * 0.6), spec: 0.9, gloss: 60 };
      if (Math.abs(sdPoly2(x, Y, CV)) < 2.4) w.alb = mix(w.alb, C.dust, 0.35); return w; }
    if (m === 8) { // closed lid: sign up, thick dust, a wax seal of the Order
      const w = woodMat(x, y, 0, 0, 12 + seed); w.alb = mix(w.alb, L('#0c0a08'), 0.5);
      if (nz > 0.5 && signAt((x - 4) / 24, -y / 16)) return { alb: mix(mix(C.silver, C.boneD, 0.4), C.dust, 0.35), spec: 0.6, gloss: 40 };
      if (nz > 0.5) w.alb = mix(w.alb, C.dust, 0.35 + 0.3 * vn3(x * 0.2, y * 0.2, 0, 5));
      if (Math.hypot(x + 40, y) < 4.5 && nz > 0.5) return { alb: L('#6a5418'), spec: 0.5, gloss: 40 }; // Order wax seal (gold)
      return w; }
    if (m === 9) return ironMat(x, y, z);
    return candleMat(m) || { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}

// ---------- the hero's coffin lid, stood upright against the apse wall (faces +y): coffin silhouette, claw gouges from inside ----------
export function lidUpright() {
  const lean = 0.16, cl = Math.cos(lean), sl = Math.sin(lean);
  const toL = (x, y, z) => { const Y = y * cl + z * sl, Z = -y * sl + z * cl; return [x, Y, Z]; };
  const sh = CV.map(([u, v]) => [v * 1.05, u + 57]); // vertical: coffin head up
  const sdf = (x, y, z) => { const [X, Y, Z] = toL(x, y, z); let d = ext(sdPoly2(X, Z, sh), Y, 0, 2.2, 0.5);
    for (const s of [-1, 1]) for (const zz of [28, 62, 94]) d = Math.min(d, sdRC(X, Y, Z, [s * 18.5, 2.6, zz - 3], [s * 18.5, 2.6, zz + 3], 0.8, 0.8)); // iron handles
    return d; };
  const mat = (m, x, y, z, nx, ny, nz) => { const [X, Y, Z] = toL(x, y, z);
    if (Y > 2.3 && Math.abs(Math.abs(X) - 18.5) < 1.4) return ironMat(x, y, z);
    const w = woodMat(X, Y, Z, 2, 12); w.alb = mix(w.alb, L('#2a1c12'), 0.2);
    const e = -sdPoly2(X, Z, sh); if (e < 2.5) w.alb = mix(w.alb, L('#8a7656'), 0.65); else if (e < 4.5) w.alb = mul(w.alb, 0.55); // bevelled rim catches the light
    if (Math.hypot(X, Z - 86) < 1.6 || Math.hypot(X, Z - 30) < 1.6) return { alb: C.silver, spec: 0.9, gloss: 60 }; // studs
    for (let k = 0; k < 4; k++) if (Math.abs(X - (k - 1.5) * 3.4 - (Z - 60) * 0.18) < 0.65 && Z > 44 && Z < 80) w.alb = mix(C.boneD, C.bloodD, 0.55); // claw gouges
    if (Math.abs(X) < 1.3 && Z > 20 && Z < 100 || Math.abs(Z - 78) < 1.3 && Math.abs(X) < 10) w.alb = mix(w.alb, L('#2a2016'), 0.3); // a cross scraped off
    return w; };
  return { sdf, mat, bounds: [-22, -14, 0, 22, 20, 118], step: 0.7 };
}

// ---------- great hall furniture ----------
export function pew(len = 110, broken = 0, seed = 1) { // faces +y; broken: 1 = split seat, 2 = tipped over
  const b = builder(); const { parts, bx, rc } = b; const R = mulberry32(seed);
  const T = broken === 2 ? 1.2 : 0, cT = Math.cos(T), sT = Math.sin(T);
  const P = (x, y, z) => [x, y * cT - z * sT, y * sT + z * cT];
  const B = (c, h, m) => { parts.push({ m, k: 0, box: [-len / 2 - 8, -40, -2, len / 2 + 8, 40, 70], f: (x, y, z) => { const Y = y * cT + z * sT, Z = -y * sT + z * cT; return sdBox(x, Y, Z + (broken === 2 ? 10 : 0), c[0], c[1], c[2], h[0], h[1], h[2], 0.6); } }); };
  B([0, 0, 22], [len / 2, 10, 1.8], 1); B([0, -10, 40], [len / 2, 1.6, 15], 1); B([0, -10, 56], [len / 2 + 3, 2.4, 2], 1);
  for (const x of [-len / 2 + 6, len / 2 - 6]) { B([x, 0, 10], [2.2, 9, 10], 1); B([x, -10, 30], [2.2, 2.2, 28], 1); }
  if (broken === 1) parts.push({ f: (x, y, z) => sdBox(x, y, z, len * 0.15, 0, 22, 9, 12, 4), sub: true, k: 0.5, box: [len * 0.15 - 12, -14, 16, len * 0.15 + 12, 14, 28] });
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => { const w = woodMat(x, y, z, 0, 31 + seed, L('#5a4028'), L('#2e2014')); if (vn3(x * 0.1, y * 0.2, z * 0.2, 3 + seed) > 0.62) w.alb = mix(w.alb, C.bloodD, 0.6); return w; }, bounds: boundsOf(parts, 2), step: 0.7 };
}
// a saint of the Order, defaced: head struck off (lies at the foot), hands hacked, blood handprints, the sun halo broken
export function statue(seed = 1) {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(seed);
  bx([0, 0, 14], [26, 20, 14], 1, 1.0); bx([0, 0, 30], [23, 17, 2.5], 1, 0.8);
  parts.push({ m: 2, k: 0, box: [-22, -18, 30, 22, 18, 150], f: (x, y, z) => { const t = (z - 32) / 112; const r = lerp(19, 10, t) + 1.2 * Math.sin(Math.atan2(y, x) * 9 + z * 0.04) * (1 - t); // robe with folds
    let d = Math.max(Math.hypot(x, y * 1.25) - r, Math.abs(z - 88) - 56); return d; } });
  el([0, 1, 136], [13, 9, 9], 2, 4); // shoulders
  rc([-13, 4, 134], [-8, 14, 108], 4, 3.4, 2, 2); rc([13, 4, 134], [8, 14, 108], 4, 3.4, 2, 2); // arms (hands gone)
  rc([0, 1, 142], [0, 1, 147], 4.2, 4.2, 2, 1); // neck stump
  // the head at the foot of the plinth, face up
  el([22, 26, 6], [7, 8, 7.5], 2, 0); rc([22, 32, 6], [22, 34, 3], 3, 2, 2, 1);
  for (let i = 0; i < 6; i++) el([(R() - 0.5) * 50, 22 + R() * 14, 1.5], [3 + R() * 3, 2 + R() * 2, 1.5 + R()], 2, 0.4); // chips
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 3) return { alb: mix(L('#6a5418'), L('#3a2a10'), vn3(x * 0.4, y, z * 0.4, 3)), spec: 0.6, gloss: 40 };
    const n = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, 61 + seed); let c = mix(L('#8e8a80'), L('#4e4a44'), clamp(n * 1.6 - 0.3));
    if (m === 1) c = mix(C.stone, C.stoneD, clamp(n * 1.6 - 0.3));
    c = mix(c, L('#2a261e'), clamp((vn3(x * 0.1, y * 0.1, z * 0.03, 5) - 0.45) * 2) * 0.7); // grime streaks
    // blood: smeared hands on the robe, a run from the neck stump, writing on the plinth
    const hand = [[6, 74], [-9, 96], [10, 118]].some(([hx, hz]) => ny > 0.2 && Math.hypot(x - hx, (z - hz) * 0.8) < 4.2 && vn3(x, y, z, 4) > 0.3);
    const run = z > 60 && z < 146 && Math.abs(x - 2 * Math.sin(z * 0.15)) < 2.2 && ny > 0 && vn3(0, 0, z * 0.1, 8) > 0.25;
    const scrawl = m === 1 && ny > 0.6 && Math.abs(Math.sin(x * 0.6) * 4 + 14 - z) < 1.6 && Math.abs(x) < 20;
    if (hand || run || scrawl || (z > 144 && nz > 0.5)) return { alb: mix(C.bloodD, C.blood, vn3(x, y, z, 2)), spec: 0.4, gloss: 50 };
    return { alb: c, spec: 0.08, gloss: 14 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}
// a human offered on a slab: throat cut, bound at the ankles, blood run down the stone into the groove
export function offering(seed = 1, slab = true) {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(seed); const zb = slab ? 22 : 2;
  if (slab) bx([0, 0, 10], [44, 17, 10], 1, 1.2);
  const tw = (R() - 0.5) * 0.3;
  rc([-22, 0, zb + 5], [8, tw * 10, zb + 5.5], 6.2, 7.0, 2, 3);    // torso, local +x = head
  el([18, tw * 12, zb + 5.5], [5.4, 4.6, 4.8], 2, 1.2);            // head, tipped back
  rc([-22, -3.5, zb + 4], [-50, -2.5, zb + 3], 3.4, 2.0, 2, 1.2); rc([-22, 3.5, zb + 4], [-50, 2.5, zb + 3], 3.4, 2.0, 2, 1.2); // legs together (bound)
  rc([0, -7, zb + 6], [-10, -13 - R() * 3, zb + 2], 2.2, 1.6, 2, 1.0); rc([-10, -15, zb + 2], [-20, -12, zb + 1.5], 1.6, 1.3, 2, 0.6);
  rc([0, 7, zb + 6], [6, 16, zb + 1], 2.2, 1.6, 2, 1.0); rc([6, 16, zb + 1], [2, 30, zb - 6], 1.6, 1.2, 2, 0.6); // an arm hanging over the edge
  rc([-48, -5, zb + 3], [-48, 5, zb + 3], 1.0, 1.0, 3, 0); // rope at the ankles
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 3) return { alb: L('#5a4a30'), wrap: 0.4 };
    if (m === 1) { const r = stoneMat(x, y, z, 70 + seed); const run = ny > 0.5 && Math.abs(x - 10 - 3 * Math.sin(z * 0.3)) < 4 || nz > 0.5 && Math.hypot(x - 12, y) < 14 * vn3(x * 0.1, y * 0.1, 0, 3) + 4; if (run) return { alb: mix(C.bloodD, C.blood, 0.4), spec: 0.6, gloss: 70 }; return r; }
    let c = mix(C.corpse, C.corpseD, clamp(fbm3(x * 0.35, y * 0.35, z * 0.35, 3, seed) * 1.6 - 0.35));
    if (Math.abs(x - 12) < 1.3 && nz > -0.2) return { alb: C.muscle, spec: 0.6, gloss: 60 }; // the cut
    if (x > 6 && x < 30 && vn3(x * 0.4, y * 0.4, z * 0.4, 9) > 0.45 || vn3(x * 0.2, y * 0.2, z * 0.2, 7) > 0.66) c = mix(c, C.bloodD, 0.8);
    if (x < -20 && x > -46 && z > zb) c = mix(c, L('#3a3226'), 0.5); // filthy rags
    return { alb: c, sss: 0.3, wrap: 0.3, spec: 0.1, gloss: 20 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}
// rubble heap (stones, a broken brick or two)
export function rubble(seed = 1, r = 40, n = 14) {
  const b = builder(); const { parts, el, bx } = b; const R = mulberry32(seed);
  for (let i = 0; i < n; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r, s = 3 + R() * 7 * (1 - d / r * 0.6); el([Math.cos(a) * d, Math.sin(a) * d * 0.8, s * 0.5 + (1 - d / r) * 6], [s, s * (0.7 + R() * 0.5), s * 0.7], 1, 1.5); }
  for (let i = 0; i < 3; i++) { const a = R() * 6.28, d = R() * r; b.rot([Math.cos(a) * d, Math.sin(a) * d, 3], R() * 3, (X, Y, Z) => sdBox(X, Y, Z, 0, 0, 0, 7, 3.5, 3, 0.5), 2, 0, 12); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 2 ? { alb: mix(C.brick, C.brickD, vn3(x, y, z, 2)) } : stoneMat(x, y, z, 80 + seed), bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- training dummy: straw body dressed in a torn tabard of the Order, sack head, stuck on a cross-post; weapon rack ----------
export function trainingDummy() {
  const b = builder(); const { parts, rc, el, bx } = b;
  rc([-16, 0, 1.5], [16, 0, 1.5], 2.6, 2.6, 1, 0); rc([0, -16, 1.5], [0, 16, 1.5], 2.6, 2.6, 1, 0); // cross foot
  for (const [x, y] of [[-14, 0], [14, 0], [0, 14]]) el([x, y, 5], [7, 6, 4.5], 6, 1.5); // sandbags
  rc([0, 0, 0], [0, 0, 96], 2.4, 2.0, 1, 0);
  el([0, 0.5, 64], [11, 7, 18], 2, 3);                   // straw torso
  rc([0, 0.5, 48], [0, 0.5, 38], 9, 6, 2, 3);            // hips stuffing
  el([0, 1.0, 92], [6.2, 6.4, 7.4], 3, 1.0);             // sack head
  rc([-19, 0.5, 76], [19, 0.5, 77], 2.4, 2.4, 1, 0);     // arm beam
  for (const s of [-1, 1]) rc([s * 10, 0.5, 76], [s * 21, 1.5, 72], 4.2, 3.4, 2, 1.5); // stuffed arms
  // tabard front + back, torn, hanging over the straw
  for (const s of [1, -1]) parts.push({ m: 4, k: 0.8, box: [-14, s > 0 ? 3 : -11, 34, 14, s > 0 ? 11 : -3, 82], f: (x, y, z) => { const hem = 40 + 6 * vn(x * 0.4, 0, s + 3) + (Math.abs(x) > 7 ? 5 : 0); return Math.max(sdBox(x, y, z, 0, s * (7.2 + Math.max(0, 62 - z) * 0.03), 60, 10.5, 0.6, 22, 0.4), hem - z); } });
  // a blade still stuck in it, an arrow, straw spilling from the wounds
  rc([4, 6, 70], [16, 22, 84], 0.5, 0.3, 5, 0); rc([16, 22, 84], [20, 27, 89], 1.0, 1.0, 1, 0);
  rc([-6, 6, 58], [-14, 24, 62], 0.35, 0.35, 1, 0);
  for (let i = 0; i < 6; i++) { const R = mulberry32(i + 3); el([(R() - 0.5) * 18, 6 + R() * 4, 36 + R() * 34], [3, 2, 1.2], 2, 0.6); }
  for (let i = 0; i < 9; i++) { const R = mulberry32(i + 13); el([(R() - 0.5) * 50, (R() - 0.5) * 40 + 6, 0.8], [4 + R() * 4, 2 + R() * 2, 0.9], 2, 0.6); } // straw on the floor
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1) return woodMat(x, y, z, 2, 71);
    if (m === 2) { let c = mix(C.straw, C.strawD, clamp(vn3(x * 0.9, y * 0.9, z * 0.25, 5) * 1.5 - 0.3)); if (Math.abs(Math.sin(x * 1.3 + z * 0.4 + y)) < 0.12) c = mul(c, 0.55); if (vn3(x * 0.3, y * 0.3, z * 0.3, 9) > 0.62 && z > 30) c = mix(c, C.bloodD, 0.7); return { alb: c, wrap: 0.5 }; }
    if (m === 3) { let c = mix(C.burlap, mul(C.burlap, 0.6), vn3(x * 0.8, y * 0.8, z * 0.8, 3)); const dx = x, dz = z - 92;
      if (ny > 0.3 && (Math.abs(Math.abs(dx) - 2.6) < 0.6 && Math.abs(dz - 1.4) < 1.4 && Math.abs(Math.abs(dx) - 2.6 - (dz - 1.4)) < 0.7 || Math.abs(Math.abs(dx) - 2.6 + (dz - 1.4)) < 0.7 && Math.abs(Math.abs(dx) - 2.6) < 1.4 && Math.abs(dz - 1.4) < 1.4)) c = L('#1a0e0a'); // stitched X eyes
      if (ny > 0.3 && Math.abs(dz + 3) < 0.6 && Math.abs(dx) < 3.2) c = L('#1a0e0a');
      if (vn3(x * 0.5, y * 0.5, z * 0.5, 4) > 0.65) c = mix(c, C.bloodD, 0.8); return { alb: c, wrap: 0.4 }; }
    if (m === 4) { let c = mix(C.tabard, C.tabardD, clamp(fbm3(x * 0.5, y * 0.5, z * 0.5, 3, 31) * 1.5 - 0.3)); // the Order's tabard: sun on the chest, slashed
      if (y > 0) { const r = Math.hypot(x, z - 64), a = Math.atan2(z - 64, x); if (r < 2.6) c = C.sun; else if (r < 6 && Math.cos(a * 8) > 0.5 - (r - 2.6) * 0.12) c = C.sun; }
      if (Math.abs(Math.sin(x * 0.5 + z * 0.6)) < 0.06 && vn(x * 0.2, z * 0.2, 3) > 0.4) c = L('#140c08');
      c = mix(c, C.bloodD, clamp(vn3(x * 0.4, y, z * 0.4, 5) * 1.6 - 0.6)); return { alb: c, wrap: 0.3 }; }
    if (m === 5) return { alb: L('#9aa0a0'), spec: 0.9, gloss: 60 };
    if (m === 6) return { alb: mix(L('#5a4c34'), L('#2e261a'), vn3(x, y, z, 6)), wrap: 0.4 };
    return { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function weaponRack() { // faces +y: a plank rack against nothing, stakes, a cleaver, a broken Order pike
  const b = builder(); const { parts, rc, bx, el } = b;
  for (const x of [-30, 30]) { rc([x, 0, 0], [x, 0, 70], 1.8, 1.6, 1, 0); rc([x, -10, 0], [x, 0, 30], 1.2, 1.2, 1, 0); }
  bx([0, 0, 64], [34, 2.2, 1.6], 1, 0.4); bx([0, 3, 20], [34, 4, 1.4], 1, 0.4);
  for (let i = 0; i < 5; i++) { const x = -24 + i * 12; rc([x, 4, 20], [x + (i - 2) * 1.2, 2.2, 82 - (i & 1) * 10], 1.3, 0.3, i === 2 ? 2 : 1, 0); } // stakes
  rc([-27, 3, 20], [-21, 3, 90], 0.9, 0.9, 1, 0); parts.push({ m: 2, k: 0, box: [-30, -4, 86, -12, 8, 110], f: (x, y, z) => sdBox(x, y, z, -20, 3, 98, 2.5, 0.5, 9, 0.3) }); // pike head
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 2 ? { alb: mix(L('#8a8a84'), C.rust, vn3(x, y, z * 0.3, 4)), spec: 0.8, gloss: 50 } : woodMat(x, y, z, 2, 81), bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- Magda's grindstone: stone wheel facing +y on a trestle, crank, water trough; sparks fly off the blade ----------
export function grindstone(sparks = true) {
  const b = builder(); const { parts, rc, bx, el } = b; const W0 = [0, 0, 40], RW = 18;
  parts.push({ m: 1, k: 0, box: [-RW - 2, -5, W0[2] - RW - 2, RW + 2, 5, W0[2] + RW + 2], f: (x, y, z) => extrude(Math.hypot(x, z - W0[2]) - RW + 0.4 * vn(Math.atan2(z - W0[2], x) * 6, 0, 3), y, 3.2) - 0.4 });
  rc([0, -9, 40], [0, 9, 40], 1.6, 1.6, 3, 0);                                   // axle
  for (const s of [-1, 1]) { rc([-14, s * 7, 0], [0, s * 7, 40], 1.8, 1.6, 2, 0); rc([14, s * 7, 0], [0, s * 7, 40], 1.8, 1.6, 2, 0); }
  rc([0, 9, 40], [0, 13, 40], 1.0, 1.0, 3, 0); rc([0, 13, 40], [-8, 13, 34], 0.9, 0.9, 3, 0); rc([-8, 13, 34], [-8, 18, 34], 1.2, 1.2, 2, 0); // crank
  bx([0, 0, 9], [20, 7, 6], 2, 0.6); parts.push({ f: (x, y, z) => sdBox(x, y, z, 0, 0, 13, 18.5, 5.5, 6), sub: true, k: 0, box: [-20, -7, 6, 20, 7, 20] }); // trough
  bx([0, 0, 13.6], [18, 5, 0.4], 4, 0);
  if (sparks) { const R = mulberry32(5); for (let i = 0; i < 16; i++) { const a = -0.3 - R() * 1.6, sp = 8 + R() * 26, s0 = [4 + R() * 2, 3, W0[2] + RW - 1]; const v = [Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.6 + 0.25]; const e = [s0[0] + v[0] * sp, s0[1] + v[1] * sp, s0[2] + v[2] * sp - sp * sp * 0.012]; rc(lp(s0, e, 0.55 + R() * 0.2), e, 0.25, 0.18, 9, 0); } }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => {
    if (m === 1) { const r = Math.hypot(x, z - W0[2]); let c = mix(L('#7a7466'), L('#3e3a32'), vn3(x * 0.3, y, z * 0.3, 4)); if (Math.abs(y) < 3.3 && r > RW - 1.2) c = mix(c, L('#9a948a'), 0.6); if (Math.abs(r - 6) < 0.8 || Math.abs(r - 12) < 0.6) c = mul(c, 0.6); return { alb: c, spec: 0.1, gloss: 20 }; }
    if (m === 2) return woodMat(x, y, z, 2, 91);
    if (m === 3) return ironMat(x, y, z);
    if (m === 4) return { alb: L('#141618'), spec: 1.0, gloss: 120 };
    if (m === 9) return { alb: [0, 0, 0], emi: [3.2, 1.8, 0.6], noAO: true, noShadow: true, rim: 0 };
    return { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6, contact: [4, 3, W0[2] + RW] };
}

// ---------- Lucian's writing table (he sits on the -y side facing +y): spread chart, stacked plans, inkwell, candles, stool behind ----------
export function writingDesk(maps = 1) {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(23);
  bx([0, 0, 36], [46, 16, 1.4], 1, 0.4);
  for (const x of [-42, 42]) for (const y of [-12, 12]) rc([x, y, 0], [x, y, 35], 1.5, 1.4, 1, 0);
  bx([0, 0, 9], [42, 1, 1], 1, 0.3);
  parts.push({ m: 2, k: 0, box: [-30, -15, 36, 26, 17, 40], f: (x, y, z) => sdBox(x, y, z - 0.25 * Math.sin(x * 0.2), -2, 1, 37.8, 25, 13, 0.25, 0) }); // big chart spread flat
  for (let i = 0; i < 3 + maps * 2; i++) { const x = 18 + R() * 20, y = (R() - 0.5) * 22, a = R() * 3; b.rot([x, y, 38.2 + i * 0.3], a, (X, Y, Z) => sdBox(X, Y, Z, 0, 0, 0, 7, 5, 0.15, 0), 2, 0, 10); }
  for (let i = 0; i < maps; i++) rc([-44 + i * 4, 10, 38.6], [-44 + i * 4, -10, 38.6 + i * 2.2], 1.5, 1.5, 2, 0); // rolled maps
  rc([20, 11, 37.5], [20, 11, 40.5], 1.6, 1.4, 4, 0.2);                  // inkwell
  for (let i = 0; i < 3; i++) bx([-38 + i * 0.6, -9, 39.5 + i * 3.1], [6 - i, 5, 1.5], 3, 0.4);
  addCandles(b, [[38, -10, 37.6, 9, 1.2], [42, -4, 37.6, 5, 1.1], [-36, 8, 37.6, 6, 1.0]]);
  el([12, -11, 39.7], [2.6, 3.1, 2.7], 6, 0);                             // a bat skull paperweight
  rc([0, -26, 0], [0, -26, 21], 1.4, 1.4, 1, 0); bx([0, -26, 22], [8, 7, 1.4], 1, 0.4); rc([-5, -31, 0], [0, -26, 12], 0.9, 0.9, 1, 0); rc([5, -21, 0], [0, -26, 12], 0.9, 0.9, 1, 0);
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    switch (m) {
      case 1: { const w = woodMat(x, y, z, 0, 31); if (z > 37 && vn3(x * 0.6, y * 0.6, 0, 3) > 0.7) w.alb = mix(w.alb, C.wax, 0.7); return w; }
      case 2: { let c = mix(L('#c4b48c'), L('#8a7a58'), clamp(vn3(x * 0.3, y * 0.3, z, 4) * 1.4 - 0.3)); // the chart: coastline-free, a cathedral in ink
        if (nz > 0.5 && x < 24) { const X = x + 2, Y = y - 1; const nave = Math.abs(X) < 3 && Math.abs(Y) < 9, tr = Math.abs(Y - 2) < 2 && Math.abs(X) < 8; const out = (nave || tr) && !(Math.abs(X) < 2.2 && Math.abs(Y) < 8.2 || Math.abs(Y - 2) < 1.2 && Math.abs(X) < 7.2); if (out) c = mix(c, L('#1e1812'), 0.85);
          if (Math.abs(Math.hypot(X - 14, Y + 6) - 2) < 0.5 || Math.abs(Math.hypot(X + 15, Y - 5) - 2.5) < 0.5) c = mix(c, C.bloodF, 0.9);
          if (Math.abs(Math.sin(X * 0.9 + Y * 0.2)) < 0.05 && Math.abs(X) > 9) c = mix(c, L('#3a2e22'), 0.5); }
        return { alb: c, wrap: 0.5 }; }
      case 3: return { alb: [L('#3a1e14'), L('#1e2232'), L('#2e2a1c'), L('#3a1418')][Math.floor(z / 3.1) & 3], spec: 0.1 };
      case 4: return { alb: L('#141210'), spec: 0.9, gloss: 60 };
      case 6: return { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2 };
    }
    return candleMat(m) || { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}

// ---------- wardrobe corner ----------
export function armoire(open = true) { // faces +y, 76 wide, 168 tall; one door ajar, a coat inside
  const b = builder(); const { parts, bx, rc, el } = b;
  bx([0, 0, 86], [38, 17, 80], 1, 1.0); bx([0, 0, 170], [42, 20, 5], 1, 1.2); bx([0, 0, 4], [40, 19, 4], 1, 0.8);
  el([0, 18, 176], [16, 3, 7], 1, 2);                                                  // crest
  parts.push({ f: (x, y, z) => sdBox(x, y, z, 0, 6, 88, 34, 13, 74), sub: true, k: 0, box: [-36, -9, 12, 36, 21, 164] }); // hollow
  if (open) { const a = 1.0, ca = Math.cos(a), sa = Math.sin(a); parts.push({ m: 2, k: 0, box: [-40, 14, 12, 0, 56, 164], f: (x, y, z) => { const X = x + 34, Y = y - 17; const u = X * ca + Y * sa, v = -X * sa + Y * ca; return sdBox(u, v, z, 17, 1.2, 88, 17, 1.2, 74, 0.4); } });
    bx([17, 16, 88], [17, 1.2, 74], 2, 0.4);
    rc([-30, 4, 150], [30, 4, 150], 0.8, 0.8, 4, 0);                                    // rail inside
    parts.push({ m: 3, k: 1, box: [-30, -8, 60, 2, 14, 152], f: (x, y, z) => { const t = clamp((150 - z) / 88); const r = 4 + t * 10; return Math.max(Math.hypot((x + 14) / (r / 4 + 1), (y - 3) / 1.0) * 1.0 - 4 - t * 2 + 0.6 * Math.sin(x * 0.8 + z * 0.1), Math.abs(z - 104) - 46); } }); // a hanging coat
  } else { bx([-17, 16, 88], [17, 1.2, 74], 2, 0.4); bx([17, 16, 88], [17, 1.2, 74], 2, 0.4); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z, nx, ny, nz) => {
    if (m === 3) return { alb: mix(L('#1a1418'), L('#2e2430'), vn3(x * 0.4, y * 0.4, z * 0.2, 4)), wrap: 0.3, spec: 0.05 };
    if (m === 4) return ironMat(x, y, z);
    const w = woodMat(x, y, z, 2, m === 2 ? 15 : 14, L('#4a3220'), L('#24170d'));
    if (m === 2 && (Math.abs(((z - 12) % 37) - 18) > 17 || Math.abs(Math.abs(x) - 17) > 15.5)) w.alb = mul(w.alb, 0.6); // door panels
    if (nz > 0.5) w.alb = mix(w.alb, C.dust, 0.4);
    if (Math.abs(x) < 1.8 && Math.abs(z - 90) < 3 && y > 16) return { alb: C.gilt, spec: 0.7, gloss: 40 };
    return w; }, bounds: boundsOf(parts, 2), step: 0.6 };
}
// coat rail with garments: items = list of 'hero' | 'rat' | 'brume' | 'loup' | 'chauve-souris' | null (empty hook)
export function coatRail(items, len = 120) {
  const b = builder(); const { parts, rc, el, bx } = b;
  for (const s of [-1, 1]) { rc([s * len / 2, 0, 0], [s * len / 2, 0, 118], 1.6, 1.4, 1, 0); rc([s * len / 2 - 12, 0, 1], [s * len / 2 + 12, 0, 1], 1.4, 1.4, 1, 0); }
  rc([-len / 2, 0, 116], [len / 2, 0, 116], 1.1, 1.1, 2, 0);
  const n = items.length;
  items.forEach((it, i) => { const x = -len / 2 + (i + 0.5) * len / n; rc([x, 0, 116], [x, 0, 110], 0.4, 0.4, 2, 0); if (!it) return; const m = 10 + i;
    const L0 = it === 'brume' ? 70 : it === 'chauve-souris' ? 30 : it === 'loup' ? 50 : it === 'rat' ? 80 : 86;
    parts.push({ m, k: 1, box: [x - 18, -10, 108 - L0 - 4, x + 18, 10, 112], f: (X, Y, Z) => { const t = clamp((110 - Z) / L0); const halfW = it === 'brume' ? 4 + t * 2 : it === 'chauve-souris' ? 9 + t * 7 : 7 + t * (it === 'loup' ? 9 : 8); // hanging cloth
      const hem = 110 - L0 + (it === 'chauve-souris' ? 5 * Math.sqrt(Math.abs(Math.sin((X - x) * 0.4))) : it === 'rat' ? 5 * vn(X * 0.5, 0, 3) : 0);
      return Math.max(Math.max(Math.abs(X - x) - halfW, Math.abs(Y + 0.8 * Math.sin((X - x) * 0.6 + Z * 0.05)) - (it === 'loup' ? 3.2 : 1.6)), Math.max(hem - Z, Z - 110)); } });
  });
  const sdf = partsSdf(parts);
  const GC = { hero: [L('#1e181c'), L('#0c0a0c')], rat: [L('#8a887a'), L('#4a4840')], brume: [L('#9a74c4'), L('#4a3460')], loup: [L('#7a5430'), L('#3a2414')], 'chauve-souris': [L('#34508a'), L('#141c36')] };
  return { sdf, mat: (m, x, y, z) => { if (m === 1) return woodMat(x, y, z, 2, 17); if (m === 2) return ironMat(x, y, z);
    const it = items[m - 10]; const [a, c] = GC[it]; let col = mix(a, c, clamp(vn3(x * (it === 'loup' ? 1.6 : 0.4), y * 0.4, z * (it === 'loup' ? 0.4 : 0.15), m) * 1.5 - 0.3));
    return { alb: col, wrap: 0.35, spec: it === 'brume' ? 0.2 : 0.05, gloss: 20 }; }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function chest(seed = 1) {
  const b = builder(); const { bx, rc, el, parts } = b;
  bx([0, 0, 13], [26, 15, 13], 1, 1.0); parts.push({ m: 1, k: 0, box: [-28, -17, 22, 28, 17, 36], f: (x, y, z) => Math.max(Math.hypot(y, z - 24) - 15, Math.abs(x) - 26) });
  const outer = (y, z) => z < 24 ? Math.max(Math.abs(y) - 15.8, -z) : Math.hypot(y, z - 24) - 15.8;
  for (const x of [-18, 18]) parts.push({ m: 2, k: 0, box: [x - 3, -18, 0, x + 3, 18, 40], f: (X, y, z) => Math.max(Math.abs(X - x) - 1.6, outer(y, z)) });
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z, nx, ny, nz) => { if (m === 2) return ironMat(x, y, z); const w = woodMat(x, y, z, 0, 40 + seed); if (nz > 0.5) w.alb = mix(w.alb, C.dust, 0.3); return w; }, bounds: boundsOf(parts, 2), step: 0.6 };
}

// ---------- upgrades ----------
export function jarCrate(seed = 1, n = 9) { // open crate full of blood jars (Vesna's stock)
  const b = builder(); const { parts, bx, rc } = b; const R = mulberry32(seed);
  bx([0, 0, 12], [22, 16, 12], 1, 0.6); parts.push({ f: (x, y, z) => sdBox(x, y, z, 0, 0, 16, 20, 14, 10), sub: true, k: 0, box: [-21, -15, 5, 21, 15, 27] });
  for (let i = 0; i < n; i++) { const x = -14 + (i % 3) * 14 + (R() - 0.5) * 3, y = -8 + ((i / 3) | 0) * 8, h = 12 + R() * 6, r = 3.2; parts.push({ m: 2, k: 0, box: [x - 5, y - 5, 5, x + 5, y + 5, 8 + h], f: (X, Y, Z) => ext(Math.hypot(X - x, Y - y) - r, Z, 6 + h / 2, h / 2, 1.2) }); rc([x, y, 6 + h], [x, y, 7 + h], 2.3, 2.2, 3, 0.3); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 2 ? { alb: mix(L('#2a0306'), L('#5a0a10'), vn3(x * 0.6, y * 0.6, z * 0.6, 3)), spec: 1.0, gloss: 90, emi: [0.02, 0.001, 0.001] } : m === 3 ? woodMat(x, y, z, 2, 3) : woodMat(x, y, z, 0, 8), bounds: boundsOf(parts, 2), step: 0.6 };
}
export function trophyPike(seed = 1) { // the Order's spoils on a pike: kettle hat, torn tabard with the sun, a wolf's grin of skulls
  const b = builder(); const { parts, rc, el } = b; const R = mulberry32(seed);
  rc([0, 0, 0], [0, 0, 150], 1.8, 1.4, 1, 0); rc([-16, 0, 124], [16, 0, 124], 1.4, 1.4, 1, 0);
  parts.push({ m: 2, k: 0.6, box: [-17, -3, 66, 17, 4, 126], f: (x, y, z) => { const hem = 70 + 10 * vn(x * 0.3, 0, seed) + (Math.abs(x - 6) < 3 ? 14 : 0); return Math.max(sdBox(x, y + 0.6 * Math.sin(x * 0.4 + z * 0.08), z, 0, 0, 98, 15 - (124 - z) * 0.02, 0.5, 27, 0.3), hem - z); } });
  parts.push({ m: 3, k: 0.3, box: [-12, -12, 148, 12, 12, 164], f: (x, y, z) => { const r = Math.hypot(x, y); const brim = Math.max(r - 10.5, Math.abs(z - 151 + r * 0.1) - 0.5); const dome = Math.max(sdEll(x, y, z, 0, 0, 153, 6, 6.4, 6), 151.5 - z); return Math.min(brim, dome); } });
  for (let i = 0; i < 4; i++) { el([(i - 1.5) * 7, 3, 58 - (i & 1) * 4], [2.8, 3.2, 2.9], 4, 0); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z, nx, ny) => { if (m === 1) return woodMat(x, y, z, 2, 51 + seed); if (m === 3) return { alb: mix(C.iron, C.rust, vn3(x * 0.5, y * 0.5, z * 0.5, 4)), spec: 0.7, gloss: 45 }; if (m === 4) return { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2 };
    let c = mix(C.tabard, C.tabardD, clamp(vn3(x * 0.4, y * 0.4, z * 0.4, 3) * 1.5 - 0.3)); const r = Math.hypot(x, z - 104), a = Math.atan2(z - 104, x); if (r < 3) c = C.sun; else if (r < 7 && Math.cos(a * 8) > 0.5 - (r - 3) * 0.12) c = C.sun;
    c = mix(c, C.bloodD, clamp(vn3(x * 0.3, y, z * 0.2, 5 + seed) * 1.7 - 0.6)); return { alb: c, wrap: 0.3 }; }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function sideTable() { // Séverin restored: a round table, a decanter of blood and two glasses
  const b = builder(); const { parts, rc, el, bx } = b;
  parts.push({ m: 1, k: 0, box: [-16, -16, 40, 16, 16, 44], f: (x, y, z) => extrude(Math.hypot(x, y) - 14, z - 42, 1.2) - 0.4 });
  rc([0, 0, 2], [0, 0, 41], 1.6, 1.2, 1, 0); for (let i = 0; i < 3; i++) { const a = i * 2.09; rc([0, 0, 6], [Math.cos(a) * 9, Math.sin(a) * 9, 0], 1.0, 0.8, 1, 0); }
  el([-3, 2, 49], [4, 4, 5], 2, 0); rc([-3, 2, 53], [-3, 2, 59], 1.2, 1.0, 2, 0.6);
  for (const [x, y] of [[6, -3], [7, 5]]) { rc([x, y, 43.4], [x, y, 47], 0.4, 0.4, 3, 0); parts.push({ m: 3, k: 0.4, box: [x - 3, y - 3, 46, x + 3, y + 3, 52], f: (X, Y, Z) => Math.max(Math.abs(Math.hypot(X - x, Y - y) - 1.6 - (Z - 47) * 0.2) - 0.2, Math.abs(Z - 49) - 2.4) }); el([x, y, 48.6], [1.6, 1.6, 1.0], 2, 0); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 1 ? { alb: mix(C.gilt, C.giltD, vn3(x, y, z, 3)), spec: 0.6, gloss: 40 } : m === 2 ? { alb: L('#3a0408'), spec: 1.0, gloss: 90, emi: [0.02, 0.001, 0.001] } : { alb: L('#8a8a90'), spec: 1.0, gloss: 120 }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export { HOUSE };

// ---------- variants of the hub props that change with progression ----------
const bloodLiquid = (x, y) => ({ alb: mix(L('#140102'), L('#260206'), vn3(x * 0.2, y * 0.2, 0, 4)), spec: 0.7, gloss: 220, wrap: 0, emi: [0.034, 0.0014, 0.0014] });
export function basin2(level = 1) { // level 0: dry, black crust; 0.5: a puddle at the bottom; 1: brimming
  const b = builder(); const { parts } = b;
  parts.push({ m: 1, k: 0, box: [-50, -50, -1, 50, 50, 28], f: (x, y, z) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    let d = ext(r - 46, z, 2.5, 2.5, 0.8); d = Math.min(d, ext(r - 39, z, 7, 2.2, 0.6));
    let bowl = ext(r - 30.5 + 0.7 * Math.max(0, Math.sin(a * 22)) * (z > 10 && z < 24 ? 1 : 0), z, 16.5, 7.5, 1.0);
    bowl = smin(bowl, ext(r - 33, z, 25, 2, 0.8), 1.2); bowl = Math.max(bowl, -ext(r - 27, z, 35, 13));
    d = Math.min(d, bowl); d += 0.35 * (vn3(x * 0.3, y * 0.3, z * 0.3, 3) - 0.5) + (h2(Math.floor(a * 9 + 50), 1, 3) < 0.15 && z > 24 ? 0.8 : 0); return d; } });
  const zl = level >= 1 ? 23.2 : level > 0 ? 13 : 11.2;
  parts.push({ m: 2, k: 0, box: [-29, -29, zl - 3, 29, 29, zl + 2], f: (x, y, z) => ext(Math.hypot(x, y) - 27.6, z, zl, 1.2) });
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => {
    if (m === 2) return level > 0 ? bloodLiquid(x, y) : { alb: mix(L('#1a0a08'), L('#2a1a14'), vn3(x * 0.4, y * 0.4, 0, 3)), spec: 0.1 };
    const r = Math.hypot(x, y), a = Math.atan2(y, x); let c = mix(C.stone, C.stoneD, clamp(fbm3(x * 0.15, y * 0.15, z * 0.15, 3, 33) * 1.6 - 0.25));
    const run = vn(a * 14, 0, 7) > 0.58 && r > 29 && z < 27 && z > 4 && vn(a * 40, z * 0.1, 8) > 0.35 * (1 - z / 30);
    if (run || (z > 23.5 && r > 26)) return level >= 1 ? { alb: mix(C.bloodD, C.blood, vn3(x, y, z, 2) * 0.6), spec: 0.6, gloss: 60 } : { alb: mix(L('#1e0c0a'), c, 0.4), spec: 0.05 };
    if (z < 9.5 && vn3(x * 0.1, y * 0.1, 0, 41) > 0.5) c = mix(c, C.bloodD, level ? 0.75 : 0.4);
    if (z > 11 && z < 12.2 && r > 29) c = mul(c, 0.45);
    if (!level) c = mix(c, C.dust, 0.3);
    return { alb: c, spec: 0.06, gloss: 12 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}
export function brazier2(lit = true) {
  const b = builder(); const { parts, rc, el } = b;
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4; rc([Math.cos(a) * 11, Math.sin(a) * 11, 0], [Math.cos(a) * 5, Math.sin(a) * 5, 26], 0.9, 0.8, 1, 0); }
  parts.push({ m: 1, k: 0, box: [-12, -12, 22, 12, 12, 36], f: (x, y, z) => { const r = Math.hypot(x, y); const s = Math.hypot(r, (z - 36) * 1.3) - 11; return Math.max(Math.abs(s) - 0.9, z - 34.5); } });
  el([0, 0, 33], [9, 9, 2.6], 2, 1.0);
  if (lit) for (let i = 0; i < 5; i++) { const a = i * 1.3; el([Math.cos(a) * 4, Math.sin(a) * 3, 37 + (i % 2) * 2], [2.2, 2.2, 4.6 - (i % 3)], 3, 1.2); }
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 1 ? ironMat(x, y, z) : m === 2 ? (lit ? { alb: [0.05, 0.02, 0.01], emi: [1.6, 0.4, 0.06].map(v => v * (0.4 + vn3(x, y, z, 4))), noAO: true } : { alb: mix(L('#3a3832'), L('#141210'), vn3(x * 0.6, y * 0.6, 0, 4)) }) : flame, bounds: boundsOf(parts, 2), step: 0.6 };
}
// Séverin's fencing mannequin: white padded plastron with a red target heart, mesh mask, on a tripod; a rapier left in it
export function fencingDummy(restored = false) {
  const b = builder(); const { parts, rc, el } = b;
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.3; rc([Math.cos(a) * 16, Math.sin(a) * 16, 0], [0, 0, 26], 1.3, 1.1, 1, 0); }
  rc([0, 0, 20], [0, 0, 60], 1.8, 1.6, 1, 0);
  el([0, 0.5, 72], [10.5, 6.6, 16], 2, 2.0); rc([0, 0.5, 60], [0, 0.5, 54], 8, 6, 2, 2);   // padded torso
  for (const s of [-1, 1]) el([s * 11, 0.5, 82], [4.4, 4.6, 4], 2, 1.5);                     // shoulder pads
  el([0, 0.8, 95], [5.6, 6.2, 7], 3, 0.6); rc([0, 0.5, 86], [0, 0.5, 90], 3, 3, 2, 1);       // mask + bib
  rc([-3, 12, 66], [12, -14, 82], 0.45, 0.3, 4, 0); el([-3.4, 12.8, 65.6], [2, 2, 2], 4, 0.4); rc([-6, 12, 67.5], [-0.5, 13.5, 63.5], 0.35, 0.35, 4, 0); // rapier through it
  if (!restored) for (let k = 0; k < 4; k++) rc([4, 6, 84 - k * 0.4], [7 + k * 1.3, 7, 74 - k * 4], 0.6, 0.35, 5, 0); // violet ribbon
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z, nx, ny) => {
    if (m === 1) return { alb: mix(C.gilt, C.giltD, vn3(x, y, z, 3)), spec: 0.5, gloss: 35 };
    if (m === 2) { let c = mix(L('#d8d2c2'), L('#9a9284'), clamp(vn3(x * 0.4, y * 0.4, z * 0.4, 5) * 1.3 - 0.2)); // quilted canvas
      if (Math.abs(Math.sin(z * 0.9)) < 0.12) c = mul(c, 0.8);
      if (ny > 0.3 && Math.hypot(x + 3, z - 74) < 3.6) c = L('#7a0b12'); else if (ny > 0.3 && Math.abs(Math.hypot(x + 3, z - 74) - 6.5) < 0.7) c = L('#7a0b12'); // target heart
      if (vn3(x * 0.3, y * 0.3, z * 0.3, 8) > (restored ? 0.8 : 0.66)) c = mix(c, L('#3a2c2a'), 0.6); // old stains, slits
      return { alb: c, wrap: 0.4, spec: 0.05 }; }
    if (m === 3) { const g = Math.abs(Math.sin(x * 1.6)) < 0.3 || Math.abs(Math.sin(z * 1.6)) < 0.3; return { alb: g ? L('#4a4844') : L('#141210'), spec: g ? 0.6 : 0.1, gloss: 40 }; }
    if (m === 4) return { alb: L('#9aa0a0'), spec: 0.9, gloss: 60 };
    return { alb: mix(C.violet, C.violetD, vn3(x, y, z, 2)), wrap: 0.4 };
  }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function armchair2(restored = false) { // faces +y; violet velvet, split open unless restored
  const b = builder(); const { parts, bx, rc, el } = b;
  bx([0, 0, 20], [13, 12, 4], 1, 2.0); bx([0, -11, 40], [13, 3, 20], 1, 2.5); el([0, -11, 58], [13, 3.4, 5], 1, 2.0);
  for (const s of [-1, 1]) { bx([s * 13.5, 0, 28], [2.2, 11, 4], 1, 1.5); rc([s * 13.5, 10, 24], [s * 13.5, 11, 32], 2.4, 2.6, 1, 1.0); }
  for (const x of [-11, 11]) for (const y of [-10, 10]) rc([x, y, 0], [x, y, 16], 1.2, 1.4, 2, 0);
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => { if (m === 2) return { alb: C.giltD, spec: 0.4, gloss: 30 }; const n = vn3(x * 0.5, y * 0.5, z * 0.5, 9); if (!restored && vn3(x * 0.2, y * 0.2, z * 0.2, 4) > 0.64) return { alb: mix(C.straw, L('#2a2014'), n), wrap: 0.5 };
    return { alb: mix(restored ? L('#6a4a84') : C.violet, C.violetD, clamp(n * 1.6 - 0.2)), spec: restored ? 0.3 : 0.15, gloss: restored ? 25 : 15, wrap: 0.3 }; }, bounds: boundsOf(parts, 2), step: 0.6 };
}
// ---------- side doorway, as seen from above: a worn threshold through the gap (open), or the gap bricked to the wall top,
// an X of planks leaning out into the room, a chain and the house's lead seal (sealed). Local -x = the room it is seen from.
export function sideDoor(span = 80, H = 240, state = 'open', kind = 'rat', depth = 50) {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(span + H);
  if (state === 'open') { bx([depth / 2 - 6, 0, 1.5], [depth / 2 + 10, span / 2 - 2, 1.5], 1, 0.8); for (const s of [-1, 1]) bx([-8, s * (span / 2 + 2), 6], [6, 4, 6], 1, 1.0); } // threshold + two stone stops
  else {
    parts.push({ m: 3, k: 0, box: [-2, -span / 2 - 2, 0, depth + 2, span / 2 + 2, H + 2], f: (x, y, z) => sdBox(x, y, z, depth / 2, 0, H / 2, depth / 2, span / 2 + 0.5, H / 2, 0.5) + 0.6 * (vn(y * 0.3, z * 0.3, 4) - 0.5) });
    for (const s of [-1, 1]) plank(parts, [-76, s * (span / 2 - 4), 2], [-3, -s * (span / 2 - 4), 120], [0, 1, 0], 14, 2.4, 4);
    plank(parts, [-40, -span / 2 - 4, 60], [-40, span / 2 + 4, 64], [0, 0, 1], 11, 2.4, 4);
    let prev = null; for (let k = 0; k <= 14; k++) { const t = k / 14, q = [-48, lerp(-span / 2 - 6, span / 2 + 6, t), 88 - Math.sin(t * Math.PI) * 26]; if (prev) el(lp(prev, q, 0.5), [1.5, (k & 1) ? 2.2 : 1.2, (k & 1) ? 1.2 : 2.2], 5, 0); prev = q; }
    rc([-49, 0, 62], [-49, 0, 55], 3.4, 3.4, 5, 0);
    const n = nrm([-0.6, 0, 1]), cx = -44, cz = 58; parts.push({ m: 6, k: 0, box: [-40, -16, cz - 16, -10, 16, cz + 16], f: (x, y, z) => { const S = (x - cx) * n[0] + (z - cz) * n[2], T = (x - cx) * n[2] - (z - cz) * n[0]; return extrude(Math.hypot(y, T) - 12, S - 3, 1.4); } });
    for (let i = 0; i < 7; i++) el([-20 - R() * 40, (R() - 0.5) * span, 2], [5 + R() * 5, 4 + R() * 4, 3 + R() * 3], 7, 1.0);
  }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1) { const r = stoneMat(x, y, z, 5, mix(C.stone, C.stoneD, 0.3)); if (nz > 0.5 && Math.abs(y) < span / 2 - 8) r.alb = mix(r.alb, L('#8a7e6a'), 0.25 * vn(x * 0.2, y * 0.2, 3)); return r; }
    if (m === 3) { const row = Math.floor(z / 7), off = (row & 1) * 6, ax = nz > 0.5 ? x * 0.6 + y : y, u = ((ax + off) % 12 + 12) % 12, v = nz > 0.5 ? ((x % 7) + 7) % 7 : z - row * 7; let c = mix(C.brick, C.brickD, vn3(Math.floor((ax + off) / 12), row, 0, 3) * 0.8 + vn3(x, y, z, 2) * 0.3); if (u < 1 || v < 1) c = C.mortar; return { alb: c, spec: 0.05, emi: nz > 0.5 ? mul(c, 0.12) : undefined }; }
    if (m === 4) { const w = woodMat(x, y, z, 1, 21, C.plank, C.plankD); return w; }
    if (m === 5) return { alb: mix(L('#3a3836'), L('#1a1816'), vn3(x, y, z, 3)), spec: 0.7, gloss: 40 };
    if (m === 6) { const n = nrm([-0.6, 0, 1]); const T = (x + 44) * n[2] - (z - 58) * n[0]; const sgn = sign(kind, -y / 10, T / 10); return { alb: sgn ? mix(C.silver, C.boneD, 0.3) : mix(L('#4a4846'), L('#2a2826'), vn3(x, y, z, 2)), spec: sgn ? 0.9 : 0.3, gloss: 50 }; }
    return stoneMat(x, y, z, 9);
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}
