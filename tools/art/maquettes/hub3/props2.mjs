// New props for the crypt: the chiefs' coffins on biers (house sign on the lid), old anonymous coffins, a ladder.
import { sdRC, sdEll, sdBox, partsSdf, clamp, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from './lib.mjs';
import { builder, boundsOf, sdPoly2, extrude, ratSdf } from '../hub/chiefs.mjs';
import { addCandles } from '../hub/props.mjs';

const C = {
  wood: L('#3a2818'), woodD: L('#1c130b'), woodL: L('#54402a'), stone: L('#4e463a'), stoneD: L('#262019'), bloodD: L('#330507'), blood: L('#5e0710'),
  bone: L('#c4b894'), boneD: L('#7a6e52'), wax: L('#d8ceb0'), silver: L('#b4b2a4'), dust: L('#5e5a50'), straw: L('#7a6638'),
};
const ext = (d2, z, zc, h, r = 0) => extrude(d2 + r, z - zc, h - r) - r;
const woodMat = (x, y, z, seed = 3) => { const g = vn3(x * 0.08, y * 1.2, z * 1.2, seed); return { alb: mix(mix(C.wood, C.woodD, clamp(g * 1.6 - 0.3)), C.woodL, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, seed + 1) - 0.6) * 1.5), spec: 0.12, gloss: 18 }; };
const flame = { alb: [0, 0, 0], emi: [2.6, 1.2, 0.3], noAO: true, noShadow: true, rim: 0 };
const candleMat = m => m === 50 ? { alb: C.wax, sss: 0.8, wrap: 0.5, spec: 0.2, gloss: 30 } : m === 51 ? flame : null;
const CV = [[-56, -12], [-32, -19], [56, -10], [56, 10], [-32, 19], [-56, 12]];

// ---------- house signs: 2D masks on [-1,1]^2, v up ----------
function inPoly(u, v, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) c = !c; } return c; }
const WOLF = [[-0.62, 0.78], [-0.36, 0.3], [0.36, 0.3], [0.62, 0.78], [0.55, 0.05], [0.3, -0.35], [0.14, -0.8], [-0.14, -0.8], [-0.3, -0.35], [-0.55, 0.05]];
const BATW = [[0, 0.2], [0.18, 0.42], [0.45, 0.38], [0.92, 0.6], [0.8, 0.12], [0.66, 0.0], [0.52, -0.3], [0.38, -0.12], [0.22, -0.36], [0.08, -0.12], [0, -0.2]];
export function sign(kind, u, v) {
  if (kind === 'rat') {
    if (Math.hypot((u - 0.05) / 0.5, (v + 0.05) / 0.3) < 1) return 1;
    if (Math.hypot((u + 0.5) / 0.26, (v - 0.02) / 0.17) < 1 && u > -0.78) return 1;
    if (Math.hypot(u + 0.38, v - 0.24) < 0.1) return 1;
    const tr = Math.hypot(u - 0.62, v + 0.42); if (Math.abs(tr - 0.34) < 0.045 && v > -0.5 && u > 0.38) return 1;
    if ((Math.abs(u + 0.22) < 0.05 || Math.abs(u - 0.3) < 0.05) && v < -0.25 && v > -0.48) return 1;
    return 0;
  }
  if (kind === 'brume') {
    if (Math.hypot(u, v - 0.32) < 0.36 && Math.hypot(u - 0.17, v - 0.44) > 0.3) return 1;
    for (const v0 of [-0.18, -0.44, -0.7]) if (Math.abs(v - v0 - 0.08 * Math.sin(u * 7 + v0 * 9)) < 0.05 && Math.abs(u) < 0.75 - (v0 === -0.44 ? 0.15 : 0)) return 1;
    return 0;
  }
  if (kind === 'loup') {
    if (!inPoly(u, v, WOLF)) return 0;
    if (Math.hypot(Math.abs(u) - 0.2, v - 0.05) < 0.07) return 0; // eyes
    if (Math.abs(u) < 0.06 && v < -0.45 && v > -0.62) return 0;
    return 1;
  }
  if (kind === 'chauve-souris') {
    const au = Math.abs(u); if (inPoly(au, v, BATW)) return 1;
    if (Math.hypot(u, v - 0.18) < 0.13) return 1; if (au < 0.12 && au > 0.03 && v > 0.25 && v < 0.42 - au) return 1;
    return 0;
  }
  return 0;
}

// ---------- a chief's coffin on its bier: lid set down against the bier, sign facing the room ----------
const LINING = { rat: L('#3a3226'), brume: L('#2e2238'), loup: L('#3a2a1e'), 'chauve-souris': L('#141a2a') };
export function chiefCoffin(kind, seed = 1) {
  const b = builder(); const { parts, bx, el, rot } = b; const R = mulberry32(seed);
  bx([0, 0, 17], [66, 26, 17], 1, 1.2); bx([0, 0, 2], [70, 30, 2], 1, 0.6);  // bier + plinth
  parts.push({ m: 2, k: 0, box: [-60, -24, 33, 60, 24, 62], f: (x, y, z) => {
    const d2 = sdPoly2(x, y, CV); let d = ext(d2, z, 47, 13, 0.6);
    d = Math.min(d, ext(d2 - 0.9, z, 59.2, 0.9, 0.3)); d = Math.max(d, -ext(d2 + 3, z, 58, 11)); return d; } });
  parts.push({ m: 3, k: 0, box: [-56, -18, 36, 56, 18, 52], f: (x, y, z) => Math.max(sdPoly2(x, y, CV) + 2.9, z - 47.5 - 1.2 * vn3(x * 0.2, y * 0.2, 0, seed)) }); // lining / bedding
  if (kind === 'rat') { for (let i = 0; i < 9; i++) el([(R() - 0.5) * 70, (R() - 0.5) * 18, 48.5], [7 + R() * 5, 4 + R() * 3, 2.2], 4, 1.5); // straw nest
    for (const [x, y, yaw] of [[-12, 2, 0.6], [16, -5, 2.4], [30, 6, -1.0]]) rot([x, y, 49], yaw, ratSdf, 6, 0, 14); }
  if (kind === 'loup') for (let i = 0; i < 6; i++) el([(R() - 0.5) * 70, (R() - 0.5) * 16, 49], [12 + R() * 6, 7, 3.2], 5, 2.0); // furs
  if (kind === 'chauve-souris') { /* nothing: dark silk only */ }
  // the lid, leaning against the front of the bier
  const a = -0.62, ca = Math.cos(a), sa = Math.sin(a), LY = 44, LZ = 14;
  parts.push({ m: 7, k: 0, box: [-60, 20, -2, 60, 64, 32], f: (x, y, z) => { const yy = y - LY, zz = z - LZ; const Y = yy * ca + zz * sa, Z = -yy * sa + zz * ca; return ext(sdPoly2(x, Y, CV.map(([u, v]) => [u * 0.98, v * 1.05])), Z, 1.6, 1.6, 0.4); } });
  // candle stubs on the bier corners, melted wax down the stone
  const cl = [[-60, -20, 34, 6 + R() * 6, 1.2], [60, -20, 34, 4 + R() * 6, 1.1], [-58, 22, 34, 3 + R() * 3, 1.0]];
  addCandles(b, cl);
  const sdf = partsSdf(parts);
  const lin = LINING[kind];
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1) { const n = fbm3(x * 0.12, y * 0.12, z * 0.12, 3, 21 + seed); let c = mix(C.stone, C.stoneD, clamp(n * 1.6 - 0.3));
      if (nz > 0.5 && z > 33) c = mix(c, C.dust, 0.35); if (vn3(x * 0.15, y * 0.5, z * 0.1, 41 + seed) > 0.64 && ny > 0.5) c = mix(c, C.bloodD, 0.7);
      if (Math.abs(z - 30) < 0.8 && ny > 0.5) c = mul(c, 0.5); // moulding line
      return { alb: c, spec: 0.05, gloss: 10 }; }
    if (m === 2) { const inner = z > 37 && sdPoly2(x, y, CV) > -3.4 && z < 59; if (inner) return { alb: mix(lin, L('#0e0c0c'), vn3(x * 0.5, y * 0.5, z * 0.5, 4) * 0.7), spec: 0.1, gloss: 20, ao: 0.6 };
      const w = woodMat(x, y, z, 9 + seed); w.alb = mix(w.alb, L('#0e0c0c'), 0.55); if (nz > 0.5) w.alb = mix(w.alb, C.dust, 0.25); return w; }
    if (m === 3) return { alb: mix(lin, mul(lin, 0.4), vn3(x * 0.4, y * 0.4, z, 5)), wrap: 0.4, spec: kind === 'chauve-souris' ? 0.5 : 0.05, gloss: 40 };
    if (m === 4) return { alb: mix(C.straw, L('#2a2014'), vn3(x * 1.3, y * 1.3, z, 3)), wrap: 0.5 };
    if (m === 5) return { alb: mix(L('#4a3a2a'), L('#1e1610'), vn3(x * 1.5, y * 0.8, z, 6)), wrap: 0.5 };
    if (m === 6) return { alb: mix(L('#4e4a44'), L('#24221e'), vn3(x * 1.5, y * 1.5, z * 1.5, 4)), wrap: 0.4, spec: 0.12, gloss: 20 };
    if (m === 7) { // lid: dull black wood, the house sign inlaid in bone and silver
      const yy = y - LY, zz = z - LZ; const Y = yy * ca + zz * sa;
      const w = woodMat(x, Y, 0, 12 + seed); w.alb = mix(w.alb, L('#0c0a08'), 0.55);
      const u = (x - 4) / 24, v = -Y / 16; const s = sign(kind, u, v);
      const ring = Math.abs(Math.hypot(u * 0.62, v * 0.95) - 0.98) < 0.04;
      if (s || ring) return { alb: mix(C.silver, C.boneD, vn3(x * 0.6, Y * 0.6, 0, 3) * 0.6), spec: 0.9, gloss: 60 };
      if (Math.abs(sdPoly2(x, Y, CV)) < 2.4) w.alb = mix(w.alb, C.dust, 0.35);
      return w; }
    return candleMat(m) || { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}

// ---------- old anonymous coffin (for niches and the floor): intact-ish, split, or caved in with bones ----------
export function oldCoffin(seed = 1, state = 0) {
  const b = builder(); const { parts, rc, el } = b; const R = mulberry32(seed * 7 + 3); const s = 0.9;
  const cv = CV.map(([u, v]) => [u * s, v * s]);
  parts.push({ m: 1, k: 0, box: [-54, -20, -1, 54, 20, 24], f: (x, y, z) => {
    const d2 = sdPoly2(x, y, cv) + 0.4 * vn(x * 0.3, y * 0.3, seed); let d = ext(d2, z, 10, 10, 0.5);
    if (state > 0) d = Math.max(d, -ext(d2 + 2.6, z, 16, 13));               // open / hollow
    if (state === 2) d = Math.max(d, -sdEll(x, y, z, 10 + R() * 0, 12, 14, 18, 10, 12)); // side stove in
    return d; } });
  if (state === 0) parts.push({ m: 1, k: 0, box: [-54, -20, 18, 54, 20, 26], f: (x, y, z) => { const d = ext(sdPoly2(x, y, cv), z, 21, 1.6, 0.4); return Math.max(d, -(Math.abs(x - 8 + 3 * Math.sin(y * 0.4)) - 0.7)); } }); // lid with a split
  if (state > 0) { for (let i = 0; i < 5; i++) { const x = (R() - 0.5) * 70, y = (R() - 0.5) * 14, a = R() * 6.3, l = 7 + R() * 6; rc([x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2, 6], [x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2, 7 + R() * 3], 0.9, 0.8, 2, 0); }
    el([-34, 0, 9], [3.0, 3.6, 3.0], 2, 0); rc([-34, 1.8, 8], [-34, 3.6, 6.6], 2.0, 1.4, 2, 0.8);
    if (state === 2) for (let i = 0; i < 4; i++) el([10 + (R() - 0.5) * 20, 22 + R() * 8, 1], [4, 3, 1.2], 1, 0.5); } // splinters spilled
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 2) return { alb: mix(mix(C.bone, C.boneD, vn3(x, y, z, 2)), L('#2a2418'), 0.25), spec: 0.2, gloss: 30 };
    const w = woodMat(x, y, z, 20 + seed); w.alb = mix(mix(w.alb, L('#16120c'), 0.3), L('#3a3a2a'), clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 9 + seed) - 0.5) * 1.2); // mould
    if (nz > 0.6) w.alb = mix(w.alb, C.dust, 0.45 * vn3(x * 0.3, y * 0.3, 0, seed));
    return w;
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- bier without coffin (an empty one, or bones laid out) ----------
export function ladder(h = 420, lean = 26) {
  const b = builder(); const { rc } = b;
  for (const x of [-11, 11]) rc([x, lean, 0], [x, 0, h], 1.4, 1.2, 1, 0);
  for (let z = 22; z < h - 8; z += 26) { const y = lean * (1 - z / h); if (h2(z, 1, 4) < 0.08) continue; rc([-11, y, z], [11, y, z], 0.9, 0.9, 1, 0); }
  return { sdf: partsSdf(b.parts), mat: (m, x, y, z) => woodMat(x, z, y, 33), bounds: boundsOf(b.parts, 2), step: 0.7 };
}
