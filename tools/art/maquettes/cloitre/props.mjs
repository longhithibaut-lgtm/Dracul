// Cloister props: arcade gallery, well, hedges, graves, trees, burnt and exhumed corpses.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, clamp, sstep, vn, vn3, fbm3, h2, L, mix, mul, partsSdf } from './lib.mjs';
import { builder, boundsOf, humanoid, std, S } from './cast.mjs';

export const K = {
  lime: L('#b9ad8e'), limeD: L('#7e725c'), lichen: L('#7c7a48'), soot: L('#3a342a'), red: L('#7a3426'), redD: L('#4e2018'),
  tile: L('#6e4030'), tileD: L('#3e2418'), moss: L('#5a6034'), wallIn: L('#5e5646'), wood: L('#3e2c1c'), woodD: L('#24190f'),
  leaf: L('#26321a'), leafL: L('#4a5a28'), leafDead: L('#5a4628'), bark: L('#3a2a1c'), grave: L('#a29e88'), graveD: L('#646250'),
  char: L('#120c08'), charB: L('#2a1a10'), ash: L('#8c867a'), habit: L('#4a3a2a'), habitD: L('#2e241a'), rot: L('#6e7050'), rotD: L('#3e3e2a'),
};
const stoneTex = (x, y, z, s = 1) => {
  const n = fbm3(x * 0.12, y * 0.12, z * 0.12, 3, 41);
  let c = mix(K.lime, K.limeD, clamp(n * 1.5 - 0.35));
  c = mix(c, K.lichen, clamp((vn3(x * 0.07, y * 0.07, z * 0.07, 43) - 0.55) * 3) * 0.6);
  c = mix(c, K.soot, clamp((vn3(x * 0.15, y * 0.4, z * 0.03, 44) - 0.5) * 2.5) * 0.55 * s); // rain / damp streaks
  return c;
};

// ---------- north gallery: back wall, lean-to tiled roof, arcade on paired colonnettes ----------
export const AR = { yf: 78, yb: 88, P: 80, cap: 82, imp: 92, r: 28, top: 146, x0: -320, x1: 1280 };
const roofN = [0.654, 0.757]; // normal of the roof plane in (y,z)
const roofDist = (y, z) => roofN[0] * (y + 14) + roofN[1] * (z - 245);
export function arcade() {
  const cx = (AR.x0 + AR.x1) / 2, hx = (AR.x1 - AR.x0) / 2;
  const sdf = (x, y, z) => {
    let d = sdBox(x, y, z, cx, -24, 130, hx, 10, 130); // back wall
    // roof slab with tile ridges
    const s = (y + 14) * 0.757 - (z - 245) * 0.654; // along slope
    let rf = Math.abs(roofDist(y, z) + 3.5) - 3.5 - 1.3 * Math.abs(Math.sin(x * 0.349)) - 0.9 * ((s % 13 + 13) % 13) / 13;
    rf = Math.max(rf, -(y + 14), y - 97);
    d = Math.min(d, rf);
    // arcade wall with round arches
    const u = ((x + 40) % 80 + 80) % 80 - 40, v = (x % 80 + 80) % 80 - 40;
    let w = sdBox(x, y, z, cx, 83, 77, hx, 5, 77);
    const arch = z < AR.imp ? Math.abs(u) - AR.r : Math.hypot(u, z - AR.imp) - AR.r;
    const open = Math.min(Math.max(arch, 22 - z), Math.max(22 - z, z - AR.cap));
    w = Math.max(w, -open);
    w = Math.min(w, sdBox(x, y, z, cx, 83, 11, hx, 7, 11, 0.6)); // parapet
    w = Math.min(w, sdBox(x, y, z, cx, 84, 150, hx, 8, 4, 0.8)); // cornice
    w = Math.min(w, sdBox(v, y, z, 0, 83, 80, 12, 6.5, 2.4, 0.5)); // capitals
    w = Math.min(w, Math.max(Math.hypot(Math.abs(v) - 5.5, y - 83) - 3.1, Math.abs(z - 52) - 30)); // paired colonnettes
    w = Math.min(w, sdBox(v, y, z, 0, 83, 24, 11, 6, 2, 0.5)); // bases
    w = Math.max(w, -sdBox(x, y, z, 480, 83, 11, 27, 12, 13)); // opening onto the central path
    return Math.min(d, w);
  };
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (y < -13.5) { // back wall inside the gallery; church door at the centre
      if (Math.abs(x - 480) < 34 && z < 120) { const k = ((x - 446) % 9 + 9) % 9 < 1 || Math.abs(z - 40) < 2 || Math.abs(z - 85) < 2; return { alb: k ? L('#1a1612') : mix(K.wood, K.woodD, vn(x / 3, z / 20, 3)), ao: 0.5 }; }
      const row = Math.floor(z / 20), bx = ((x + (row & 1) * 24) % 48 + 48) % 48, bz = z - row * 20;
      return { alb: (bx < 1.4 || bz < 1.4) ? K.soot : mul(stoneTex(x, y, z), 0.7 + 0.2 * h2(Math.floor(x / 48), row, 5)), ao: 0.55 };
    }
    if (Math.abs(roofDist(y, z)) < 2.4 && nz > 0.3) { // tiles
      const t = Math.sin(x * 0.349), n = vn3(x * 0.3, y * 0.3, z * 0.3, 8);
      let c = mix(K.tile, K.tileD, clamp(0.5 - t * 0.3 + n * 0.5 - 0.3));
      if (h2(Math.floor(x / 9), Math.floor((y * 0.757 - z * 0.654) / 13), 9) < 0.12) c = mix(c, K.soot, 0.6); // broken / missing tile
      c = mix(c, K.moss, clamp((vn3(x * 0.05, y * 0.1, z * 0.1, 2) - 0.55) * 3) * 0.7);
      return { alb: c, spec: 0.1, gloss: 15 };
    }
    let c = stoneTex(x, y, z);
    const u = ((x + 40) % 80 + 80) % 80 - 40, r = Math.hypot(u, z - AR.imp);
    if (z > AR.imp - 1 && r > AR.r - 1 && r < AR.r + 7 && y > 76) { // alternating pale and red voussoirs
      const a = Math.atan2(z - AR.imp, u); c = (Math.floor(a / (Math.PI / 9)) & 1) ? mix(K.red, K.redD, vn3(x * 0.3, 0, z * 0.3, 2) * 0.6) : mul(c, 1.1);
      if (r > AR.r + 6 || r < AR.r - 0.2) c = mul(c, 0.6);
    }
    if (z < 24 && y > 80) c = mix(c, L('#3a2e1e'), clamp((vn3(x * 0.2, 0, z * 0.5, 7) - 0.4) * 2) * 0.7 * (1 - z / 24)); // splash dirt
    if (x > 120 && x < 260 && z < 22 && y > 82) { const k = vn3(x * 0.15, 0, z * 0.6, 12); if (k > 0.5) c = mix(c, S.bloodD, 0.75); } // blood smeared on the parapet
    return { alb: c, spec: 0.04, gloss: 10, ao: y < 77 && z < 160 ? 0.75 : 1 };
  };
  return { sdf, mat, bounds: [AR.x0, -34, 0, AR.x1, 98, 262], step: 0.75, noSelfAO: false };
}

// ---------- covered well ----------
export function well() {
  const sdf = (x, y, z) => {
    const r = Math.hypot(x, y);
    let d = Math.max(Math.abs(r - 21) - 4.5, Math.abs(z - 13) - 13);
    d = Math.min(d, Math.max(Math.abs(r - 21) - 6, Math.abs(z - 27) - 2.2)); // coping
    d = Math.min(d, Math.max(r - 17, Math.abs(z - 9) - 0.6)); // water
    for (const s of [-1, 1]) for (const t of [-1, 1]) d = Math.min(d, sdBox(x, y, z, s * 19, t * 19, 52, 2.6, 2.6, 26, 0.5));
    d = Math.min(d, sdRC(x, y, z, [-21, 0, 76], [21, 0, 76], 2.2, 2.2)); // winch beam
    const q = Math.max(Math.abs(x), Math.abs(y));
    d = Math.min(d, Math.max(Math.abs(0.6 * q + 0.8 * (z - 100)) - 2.6 - 0.35 * Math.abs(Math.sin((Math.abs(x) > Math.abs(y) ? y : x) * 0.55)), q - 28)); // pyramid roof
    d = Math.min(d, sdRC(x, y, z, [3, 0, 76], [3, 0, 40], 0.45, 0.45)); // rope
    d = Math.min(d, Math.max(Math.hypot(x - 3, y) - 4.2, Math.abs(z - 35) - 4.5)); // bucket
    return d;
  };
  const mat = (m, x, y, z, nx, ny, nz) => {
    const r = Math.hypot(x, y);
    if (z > 78 && Math.abs(0.6 * Math.max(Math.abs(x), Math.abs(y)) + 0.8 * (z - 100)) < 3.7) return { alb: mul(mix(K.tile, K.tileD, vn3(x * 0.4, y * 0.4, z * 0.4, 3)), (Math.floor((Math.abs(x) > Math.abs(y) ? y : x) / 3.6) & 1) ? 0.8 : 1), spec: 0.1 };
    if (r < 17.2 && Math.abs(z - 9) < 1) return { alb: L('#0a0c08'), spec: 0.9, gloss: 90, ao: 0.4 }; // black water
    if (z > 72 && z < 80 && Math.abs(y) < 3) return { alb: K.wood };
    if (Math.hypot(x - 3, y) < 5 && z < 80) return { alb: z < 41 ? mix(K.wood, S.bloodD, 0.5) : L('#5a4a30') };
    let c = stoneTex(x, y, z);
    if (z < 28 && y > 0 && Math.abs(Math.sin(x * 0.7)) > 0.8 && vn3(x * 0.3, y * 0.3, z * 0.1, 4) > 0.42) c = mix(c, S.bloodD, 0.8); // runs down the curb
    return { alb: c, spec: 0.05, gloss: 10 };
  };
  return { sdf, mat, bounds: [-31, -31, 0, 31, 31, 106], step: 0.7 };
}

// ---------- box hedge (along local x) ----------
export function hedge(len, w = 13, h = 26, seed = 1) {
  const sdf = (x, y, z) => sdBox(x, y, z, 0, 0, h / 2, len / 2, w / 2, h / 2, 5) - 2.6 * (vn3(x * 0.22, y * 0.22, z * 0.22, seed) - 0.5) - 1.0 * (vn3(x * 0.7, y * 0.7, z * 0.7, seed + 3) - 0.5);
  const mat = (m, x, y, z, nx, ny, nz) => {
    const n = vn3(x * 0.5, y * 0.5, z * 0.5, seed + 9);
    let c = mix(K.leaf, K.leafL, clamp(n * 1.4 - 0.3));
    c = mix(c, K.leafDead, clamp((vn3(x * 0.06, y * 0.06, z * 0.1, seed + 11) - 0.45) * 3) * 0.85); // dying, brown in patches
    if (h2(x * 2 | 0, z * 2 | 0, seed) < 0.06) c = mul(c, 0.4);
    return { alb: c, wrap: 0.35, sss: 0.15 };
  };
  return { sdf, mat, bounds: [-len / 2 - 4, -w / 2 - 4, 0, len / 2 + 4, w / 2 + 4, h + 3], step: 0.55 };
}

// ---------- graves ----------
export function cross(h = 44, lying = false) {
  const b = builder();
  const P = lying ? (x, y, z) => [x, z, y] : (x, y, z) => [x, y, z]; // lying: shaft along y
  const box = (c, r) => b.parts.push({ f: (x, y, z) => { const q = P(x, y, z); return sdBox(q[0], q[1], q[2], c[0], c[1], c[2], r[0], r[1], r[2], 0.6); }, m: 1, k: 0.4 });
  if (!lying) box([0, 0, 3], [9, 6, 3]);
  box([0, 0, lying ? h / 2 : h / 2 + 4], [2.6, 2.4, h / 2]);
  box([0, 0, lying ? h - 12 : h - 8], [11, 2.4, 2.6]);
  const sdf0 = partsSdf(b.parts);
  const sdf = lying ? (x, y, z) => sdf0(x, y, z - 2.4) - 0.4 * vn3(x * 0.4, y * 0.4, z * 0.4, 3) : (x, y, z) => sdf0(x, y, z) - 0.4 * vn3(x * 0.4, y * 0.4, z * 0.4, 3);
  const mat = (m, x, y, z) => { let c = mix(K.grave, K.graveD, clamp(fbm3(x * 0.2, y * 0.2, z * 0.2, 3, 5) * 1.6 - 0.4)); c = mix(c, K.lichen, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, 6) - 0.55) * 2); return { alb: c, spec: 0.04 }; };
  return { sdf, mat, bounds: lying ? [-13, -4, -1, 13, h + 4, 8] : [-12, -9, 0, 12, 9, h + 10], step: 0.7 };
}
export function stele(h = 34) {
  const sdf = (x, y, z) => { let d = Math.max(sdBox(x, y, z, 0, 0, h / 2, 9, 3, h / 2, 0.8), Math.hypot(x, z - (h - 9)) - 9 + (z < h - 9 ? -20 : 0)); d = Math.min(d, sdBox(x, y, z, 0, 0, 2, 12, 6, 2, 0.6)); return Math.max(d, -(sdBox(x, y, z, 6, 0, h - 4, 4, 6, 8))) - 0.4 * vn3(x * 0.4, y * 0.4, z * 0.4, 9); }; // top corner broken off
  const mat = (m, x, y, z) => { let c = mix(K.grave, K.graveD, clamp(fbm3(x * 0.2, y * 0.2, z * 0.2, 3, 7) * 1.6 - 0.4)); if (y > 2.5 && Math.abs(x) < 1 && z > 12 && z < h - 6) c = K.soot; if (y > 2.5 && Math.abs(z - (h - 13)) < 0.9 && Math.abs(x) < 5) c = K.soot; c = mix(c, S.bloodD, clamp(vn3(x * 0.4, 0, z * 0.15, 3) - 0.6) * 2 * (y > 2 ? 1 : 0)); return { alb: c, spec: 0.04 }; };
  return { sdf, mat, bounds: [-13, -8, 0, 13, 8, h + 2], step: 0.7 };
}

// ---------- trees (only two) ----------
export function cypress(h = 200, R = 17, seed = 3) {
  const sdf = (x, y, z) => {
    const t = clamp(z / h), rad = R * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.06)), 0.8) * (1 - 0.35 * t);
    let d = (Math.hypot(x, y) - rad) * 0.8;
    d = Math.max(d, -z + 10);
    d -= 3.4 * (vn3(x * 0.16, y * 0.16, z * 0.09, seed) - 0.5) + 1.6 * (vn3(x * 0.5, y * 0.5, z * 0.3, seed + 1) - 0.5);
    return Math.min(d, sdRC(x, y, z, [0, 0, 0], [0, 0, 18], 3.2, 2.4));
  };
  const mat = (m, x, y, z) => z < 12 && Math.hypot(x, y) < 4 ? { alb: K.bark } : { alb: mix(mix(K.leaf, mul(K.leaf, 0.6), vn3(x * 0.4, y * 0.4, z * 0.3, seed + 4)), K.leafDead, clamp((vn3(x * 0.1, y * 0.1, z * 0.05, seed + 5) - 0.6) * 3) * 0.7), wrap: 0.3, sss: 0.1 };
  return { sdf, mat, bounds: [-R - 4, -R - 4, 0, R + 4, R + 4, h + 4], step: 0.5 };
}
export function yew(seed = 5) {
  const blobs = [[0, 0, 52, 30, 30, 34], [-16, 6, 40, 20, 20, 22], [17, -5, 46, 20, 20, 24], [4, 12, 72, 18, 18, 18]];
  const sdf = (x, y, z) => {
    let d = 1e9; for (const b of blobs) d = smin(d, sdEll(x, y, z, b[0], b[1], b[2], b[3], b[4], b[5]), 8);
    d = Math.max(d, 16 - z);
    d -= 4 * (vn3(x * 0.13, y * 0.13, z * 0.13, seed) - 0.5) + 1.8 * (vn3(x * 0.45, y * 0.45, z * 0.45, seed + 1) - 0.5);
    return Math.min(d, sdRC(x, y, z, [0, 0, 0], [2, 1, 26], 5, 3.5));
  };
  const mat = (m, x, y, z) => z < 20 && Math.hypot(x, y) < 7 ? { alb: mix(K.bark, L('#5a3a26'), vn3(x, y, z * 0.2, 2)) } : { alb: mix(mix(K.leaf, mul(K.leaf, 0.55), vn3(x * 0.4, y * 0.4, z * 0.4, seed + 4)), K.leafDead, clamp((vn3(x * 0.08, y * 0.08, z * 0.08, seed + 5) - 0.55) * 3) * 0.6), wrap: 0.3, sss: 0.1 };
  return { sdf, mat, bounds: [-42, -36, 0, 42, 38, 94], step: 0.5 };
}

// ---------- corpses ----------
// burnt by the Dawn: prone, one arm reaching for the shade (toward -y), knee drawn up
export function burnt() {
  const J = {};
  for (const k in std) { const p = std[k]; J[k] = [p[0], 50 - p[2], 6.5 - p[1] * 0.6]; }
  Object.assign(J, {
    head: [0.5, -40, 7.5], neck: [0, -32, 7],
    Sr: [-8.5, -27, 6.5], Er: [-12, -42, 5], Wr: [-10, -55, 3.5], Hr_: [-9.5, -61, 2.4],
    Sl: [8.5, -27, 6.5], El: [15, -33, 4.5], Wl: [12, -43, 3.5], Hl_: [8, -46, 3],
    Hl: [3.6, -2, 6.5], Kl: [13, 14, 5.5], Al: [9, 31, 5], Tl: [9.4, 36, 2],
  });
  const b = builder(); humanoid(J, b, { thin: 0.78 });
  const sdf0 = partsSdf(b.parts);
  const sdf = (x, y, z) => sdf0(x, y, z) - 0.7 * (vn3(x * 0.5, y * 0.5, z * 0.5, 4) - 0.5);
  const mat = (m, x, y, z, nx, ny, nz) => {
    const n = vn3(x * 0.6, y * 0.6, z * 0.6, 5);
    let c = mix(K.char, K.charB, n);
    if (nz > 0.6 && vn3(x * 0.3, y * 0.3, 0, 6) > 0.62) c = mix(c, mul(K.ash, 0.5), 0.7); // grey ash crust on top
    const hand = Math.hypot(x - J.Hr_[0], y - J.Hr_[1]) < 5; if (hand) c = mix(L('#b4a888'), K.char, n * 0.6); // bone showing through
    const ember = vn3(x * 1.3, y * 1.3, z * 1.3, 7) > 0.78 && nz < 0.7;
    return ember ? { alb: c, emi: [0.9, 0.22, 0.04].map(v => v * (0.4 + n)), rim: 0 } : { alb: c, spec: 0.08, gloss: 20, rim: 0.04, wrap: 0 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 3), step: 0.6, hand: J.Hr_ };
}
// exhumed monk lying on his back in his brown habit, rotten
export function exhumed(seed = 13) {
  const J = {};
  for (const k in std) { const p = std[k]; J[k] = [p[0] * 1.05, 50 - p[2], 6 + p[1]]; }
  Object.assign(J, { head: [0, -40, 8.5], Wl: [9, 2, 9], Hl_: [8, 8, 7], Er: [-12, -12, 9], Wr: [-6, -2, 14], Hr_: [-2, -1, 15] });
  const b = builder(); humanoid(J, b, { thin: 1.0 });
  b.el([0, 0, 7], [11, 30, 5], 2, 3); // habit bulk
  const sdf0 = partsSdf(b.parts);
  const sdf = (x, y, z) => sdf0(x, y, z) - 0.6 * (vn3(x * 0.4, y * 0.4, z * 0.4, seed) - 0.5);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.3, y * 0.3, z * 0.3, 3, seed);
    if (y < -33) { let c = mix(K.rot, K.rotD, n); if (Math.hypot(x, y + 42) < 3.2) c = L('#b0a484'); if (Math.hypot(Math.abs(x) - 1.6, y + 41.5) < 1.1) c = L('#0c0806'); return { alb: c, spec: 0.4, gloss: 40, sss: 0.2 }; }
    if (Math.hypot(x - J.Hr_[0], y - J.Hr_[1]) < 4 || Math.hypot(x - J.Hl_[0], y - J.Hl_[1]) < 4) return { alb: mix(L('#a89c7c'), K.rotD, n) };
    let c = mix(K.habit, K.habitD, n); c = mix(c, L('#3a3a22'), clamp((vn3(x * 0.15, y * 0.15, z, seed + 2) - 0.5) * 3) * 0.6); // rot and mould
    return { alb: c, wrap: 0.3 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 3), step: 0.6 };
}

// ---------- ruined wall stub (an old chapter-house wall), broken top ----------
export function ruin(len = 84, seed = 7) {
  const top = x => 18 + (44 + 10 * (vn(x / 6, 1, seed) - 0.5)) * (1 - sstep(-len / 2, len / 2 + 2, x)) * sstep(-len / 2 - 4, -len / 2 + 10, x); // tall at the west end, crumbling eastward
  const sdf = (x, y, z) => {
    let d = Math.max(sdBox(x, y, z, 0, 0, 40, len / 2, 6, 40, 0.8), (z - top(x)) * 0.7);
    d = Math.min(d, sdBox(x, y, z, len / 2 + 14, 12, 5, 8, 6, 5, 1.2)); // fallen block
    return d - 0.6 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5);
  };
  const mat = (m, x, y, z) => {
    const row = Math.floor(z / 11), bx = ((x + (row & 1) * 9) % 18 + 18) % 18;
    let c = mix(K.lime, K.limeD, clamp(fbm3(x * 0.15, y * 0.15, z * 0.15, 3, seed) * 1.5 - 0.3));
    if (bx < 1 || z - row * 11 < 1) c = mul(c, 0.45);
    c = mix(c, K.lichen, clamp((vn3(x * 0.1, y * 0.1, z * 0.1, seed + 1) - 0.5) * 3) * 0.5);
    if (y > 4 && z < 30 && vn3(x * 0.25, 0, z * 0.1, seed + 3) > 0.55) c = mix(c, S.bloodD, 0.8); // handprints and smears where someone hid
    return { alb: c, spec: 0.04 };
  };
  return { sdf, mat, bounds: [-len / 2 - 4, -8, 0, len / 2 + 24, 20, 72], step: 0.6 };
}
