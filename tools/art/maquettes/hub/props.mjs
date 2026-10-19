// Refuge props: coffin on its dais, blood basin, the four stations, candles, beam.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, partsSdf, clamp, lerp, sstep, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from '../grand/lib.mjs';
import { builder, boundsOf, sdPoly2, extrude, ratSdf, add, lp } from './chiefs.mjs';

const C = {
  wood: L('#3a2818'), woodD: L('#1c130b'), woodL: L('#54402a'), iron: L('#34302c'), rust: L('#5c3520'), rustL: L('#7a4626'),
  stone: L('#4e463a'), stoneD: L('#262019'), blood: L('#5e0710'), bloodD: L('#330507'), bloodF: L('#7a0b12'),
  ash: L('#5a5650'), ashD: L('#2e2b27'), velvet: L('#300a0c'), bone: L('#c4b894'), boneD: L('#7a6e52'), wax: L('#d8ceb0'),
  silver: L('#a9aaa2'), cloth: L('#3e3a33'), clothD: L('#1e1c18'), paper: L('#8a7c5c'), paperD: L('#4e4430'), violet: L('#5e4a70'), violetD: L('#2a1f34'),
  gilt: L('#7a5a28'), giltD: L('#3a2a12'), hide: L('#6a5644'), hideD: L('#3a2c20'), straw: L('#7a6638'),
};
const ironMat = (x, y, z) => { const n = vn3(x * 0.4, y * 0.4, z * 0.4, 7); return { alb: mix(C.iron, n > 0.55 ? C.rustL : C.rust, clamp(n * 1.8 - 0.4)), spec: 0.4, gloss: 30 }; };
const woodMat = (x, y, z, grainAxis = 0, seed = 3) => { const g = grainAxis === 0 ? vn3(x * 0.08, y * 1.2, z * 1.2, seed) : grainAxis === 1 ? vn3(x * 1.2, y * 0.08, z * 1.2, seed) : vn3(x * 1.2, y * 1.2, z * 0.08, seed); return { alb: mix(mix(C.wood, C.woodD, clamp(g * 1.6 - 0.3)), C.woodL, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, seed + 1) - 0.6) * 1.5), spec: 0.12, gloss: 18 }; };
const flame = { alb: [0, 0, 0], emi: [2.6, 1.2, 0.3], noAO: true, noShadow: true, rim: 0 };
const bloodLiquid = (x, y) => ({ alb: mix(L('#140102'), L('#260206'), vn3(x * 0.2, y * 0.2, 0, 4)), spec: 0.7, gloss: 220, wrap: 0, emi: [0.034, 0.0014, 0.0014] }); // faint red self-glow: keeps the pool reading as blood after grading
const ext = (d2, z, zc, h, r = 0) => extrude(d2 + r, z - zc, h - r) - r;

// candles: list of [x, y, z0, h, r]
export function addCandles(b, list, M_WAX = 50, M_FL = 51) {
  for (const [x, y, z0, h, r] of list) {
    b.rc([x, y, z0], [x, y, z0 + h], r, r * 0.9, M_WAX, 0);
    b.el([x, y, z0 + 0.4], [r * 1.9, r * 1.9, 0.7], M_WAX, 0.6);
    b.el([x, y, z0 + h + 1.6], [0.75, 0.75, 1.7], M_FL, 0);
  }
}
const candleMat = (m) => m === 50 ? { alb: C.wax, sss: 0.8, wrap: 0.5, spec: 0.2, gloss: 30 } : m === 51 ? flame : null;
export function candles(list) { const b = builder(); addCandles(b, list); return { sdf: partsSdf(b.parts), mat: m => candleMat(m), bounds: boundsOf(b.parts, 2), step: 0.6, noShadow: true }; }

// ---------- the hero's coffin on a stepped dais, full of ash ----------
const CV = [[-56, -12], [-32, -19], [56, -10], [56, 10], [-32, 19], [-56, 12]];
export function coffin() {
  const b = builder(); const { parts, bx, rc, el } = b;
  bx([0, 0, 2], [76, 36, 2], 1, 0.6); bx([0, 0, 6], [67, 28, 2], 1, 0.6); // dais steps
  parts.push({ m: 2, k: 0, box: [-60, -24, 7, 60, 24, 32], f: (x, y, z) => {
    const d2 = sdPoly2(x, y, CV);
    let d = ext(d2, z, 19, 11, 0.6);
    d = Math.min(d, ext(d2 - 0.9, z, 29.2, 0.9, 0.3));     // rim moulding
    d = Math.min(d, ext(d2 - 0.7, z, 9.2, 1.2, 0.3));      // base moulding
    d = Math.max(d, -ext(d2 + 3, z, 26, 11));              // hollow from z=15
    return d;
  } });
  parts.push({ m: 3, k: 0, box: [-56, -18, 13, 56, 18, 26], f: (x, y, z) => { // ash heap inside: highest where the body lay
    const d2 = sdPoly2(x, y, CV); const hgt = 17.5 + 3.5 * Math.exp(-(((x + 8) / 34) ** 2)) * Math.exp(-((y / 9) ** 2)) + 1.6 * vn3(x * 0.25, y * 0.25, 0, 5);
    return Math.max(d2 + 2.9, z - hgt);
  } });
  for (const x of [-40, 0, 36]) for (const s of [-1, 1]) { const w = x < -32 ? 12 + (x + 56) * 7 / 24 : 19 - (x + 32) * 9 / 88; rc([x - 3, s * (w + 1.2), 21], [x + 3, s * (w + 1.2), 21], 0.7, 0.7, 4, 0); } // iron handles
  // ash spilled onto the dais and floor in front
  for (let i = 0; i < 7; i++) { const R = mulberry32(i * 13 + 1); el([-30 + i * 11 + R() * 6, 26 + R() * 6, 8.2], [5 + R() * 4, 3 + R() * 2, 0.9], 3, 1.0); }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 1) { // dais stone, ash dust, blood run-off
      const n = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, 21); let c = mix(C.stone, C.stoneD, clamp(n * 1.6 - 0.3));
      if (Math.abs(((x + 400) % 22) - 11) > 10.4 && nz > 0.5) c = mul(c, 0.4);
      const ash = clamp(1 - Math.hypot(x / 70, y / 30)) * vn3(x * 0.3, y * 0.3, 0, 8); c = mix(c, C.ash, clamp(ash * 2.2));
      if (vn3(x * 0.12, y * 0.4, z, 41) > 0.62 && y > 0) c = mix(c, C.bloodD, 0.8);
      return { alb: c, spec: 0.05, gloss: 10 };
    }
    if (m === 2) { // coffin wood: black lacquer gone dull, velvet inside, blood over the rim
      const inner = z > 15.5 && sdPoly2(x, y, CV) > -3.4 && z < 29;
      if (inner) { const r = vn3(x * 0.5, y * 0.5, z * 0.5, 4); return { alb: mix(C.velvet, L('#141010'), r * 0.8), spec: 0.1, gloss: 20, ao: 0.6 }; }
      const w = woodMat(x, y, z, 0, 9); w.alb = mix(w.alb, L('#0e0c0c'), 0.6);
      if (Math.abs(sdPoly2(x, y, CV) + 0.0) < 1.6 && z > 27) w.alb = mix(w.alb, C.ashD, 0.6);
      const drip = Math.abs(Math.sin(x * 0.45 + 1.3)) > 0.96 && vn3(x * 0.2, y, z * 0.05, 3) > 0.55 && z > 12 && z < 27.5; if (drip) { w.alb = C.bloodF; w.spec = 0.6; w.gloss = 60; }
      return w;
    }
    if (m === 3) { // ash, with dying embers where he reformed
      const n = vn3(x * 0.6, y * 0.6, z * 0.6, 5); let c = mix(C.ash, C.ashD, clamp(n * 1.5 - 0.2));
      const e = h2(x * 1.2 | 0, y * 1.2 | 0, 77); if (z > 16 && e > 0.994 && Math.abs(y) < 12) return { alb: [0.1, 0.02, 0], emi: [1.4, 0.35, 0.05], noAO: true };
      if (vn3(x * 0.15, y * 0.4, 0, 9) > 0.66) c = mix(c, C.bloodD, 0.7);
      return { alb: c, wrap: 0.4, spec: 0.0 };
    }
    return ironMat(x, y, z);
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}
export function lid() { // coffin lid leaning on the dais, claw-scored on its inner face
  const a = -0.62, ca = Math.cos(a), sa = Math.sin(a);
  const sdf = (x, y, z) => { const Y = y * ca + z * sa, Z = -y * sa + z * ca; return ext(sdPoly2(x, Y, CV.map(([u, v]) => [u * 0.98, v * 1.05])), Z, 1.6, 1.6, 0.4); };
  const mat = (m, x, y, z, nx, ny, nz) => { const Y = y * ca + z * sa; const w = woodMat(x, Y, 0, 0, 12); w.alb = mix(w.alb, L('#120c08'), 0.4);
    for (let k = 0; k < 4; k++) if (Math.abs(Y - (k - 1.5) * 3.2 - (x + 5) * 0.3) < 0.55 && Math.abs(x + 5) < 15) w.alb = mix(C.boneD, C.bloodD, 0.5); // four claw gouges
    return w; };
  return { sdf, mat, bounds: [-60, -22, -2, 60, 22, 30], step: 0.7 };
}

// ---------- blood basin (fluted stone bowl on two round steps) ----------
export function basin() {
  const b = builder(); const { parts } = b;
  parts.push({ m: 1, k: 0, box: [-50, -50, -1, 50, 50, 28], f: (x, y, z) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    let d = ext(r - 46, z, 2.5, 2.5, 0.8);
    d = Math.min(d, ext(r - 39, z, 7, 2.2, 0.6));
    let bowl = ext(r - 30.5 + 0.7 * Math.max(0, Math.sin(a * 22)) * sstep(10, 13, z) * sstep(24, 21, z), z, 16.5, 7.5, 1.0);
    bowl = smin(bowl, ext(r - 33, z, 25, 2, 0.8), 1.2);
    bowl = Math.max(bowl, -ext(r - 27, z, 35, 13));
    d = Math.min(d, bowl);
    d += 0.35 * (vn3(x * 0.3, y * 0.3, z * 0.3, 3) - 0.5) + (h2(Math.floor(a * 9 + 50), 1, 3) < 0.15 && z > 24 ? 0.8 : 0); // chips
    return d;
  } });
  parts.push({ m: 2, k: 0, box: [-29, -29, 21, 29, 29, 26], f: (x, y, z) => ext(Math.hypot(x, y) - 27.6, z, 23.2, 1.2) });
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    if (m === 2) return bloodLiquid(x, y);
    const r = Math.hypot(x, y), a = Math.atan2(y, x); const n = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, 33);
    let c = mix(C.stone, C.stoneD, clamp(n * 1.6 - 0.25));
    // blood brimmed over and ran down the flutes; stained rim
    const run = vn(a * 14, 0, 7) > 0.58 && r > 29 && z < 27 && z > 4 && vn(a * 40, z * 0.1, 8) > 0.35 * (1 - z / 30);
    if (run || (z > 23.5 && r > 26)) return { alb: mix(C.bloodD, C.blood, vn3(x, y, z, 2) * 0.6), spec: 0.6, gloss: 60 };
    if (z < 9.5 && vn3(x * 0.1, y * 0.1, 0, 41) > 0.5) c = mix(c, C.bloodD, 0.75);
    if (z > 11 && z < 12.2 && r > 29) c = mul(c, 0.45);
    return { alb: c, spec: 0.06, gloss: 12 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- Vesna's stall: counter, cloth, jars, scales, coins, crates, sack, lantern on a pole, rats ----------
export function stall() {
  const b = builder(); const { parts, bx, rc, el, rot } = b; const R = mulberry32(5);
  bx([0, 0, 40], [56, 14, 1.4], 1, 0.4);                                        // counter top
  for (const x of [-52, 52]) for (const y of [-10, 10]) bx([x, y, 19.5], [1.6, 1.6, 19.5], 1, 0.4);
  parts.push({ m: 2, k: 0, box: [-58, 12, 0, 58, 17, 41], f: (x, y, z) => { // grey rag hung on the front, ragged hem
    const hem = 5 + vn(x * 0.3, 0, 4) * 7 + (h2(Math.floor(x / 5), 2, 3) < 0.2 ? 6 : 0);
    return Math.max(sdBox(x, y, z, 0, 14.6 + 0.6 * Math.sin(x * 0.5), 23, 55.5, 0.5, 16, 0), hem - z);
  } });
  const jars = [[-46, -4, 7], [-40, 4, 10], [-14, -6, 12], [-8, 3, 8], [20, -6, 9], [26, 4, 6], [40, -2, 11]];
  for (const [x, y, h] of jars) { const r = 2.6 + R() * 1.4; parts.push({ m: 3, k: 0, box: [x - r - 2, y - r - 2, 41, x + r + 2, y + r + 2, 42 + h + 3], f: (X, Y, Z) => ext(Math.hypot(X - x, Y - y) - r, Z, 41.4 + h / 2, h / 2, 1.2) }); rc([x, y, 41.4 + h], [x, y, 42.4 + h], r * 0.75, r * 0.7, 4, 0.3); }
  // scales: post, tilted beam, two pans (blood vial outweighs the coins)
  const sx = -27; rc([sx, 0, 41], [sx, 0, 64], 0.7, 0.6, 5, 0); bx([sx, 0, 42], [4, 3, 1], 5, 0.3);
  const bl = [sx - 11, 0, 61.6], br = [sx + 11, 0, 66.4]; rc(bl, br, 0.5, 0.5, 5, 0);
  for (const [p, dz] of [[bl, 13], [br, 13]]) { for (const s of [-1, 1]) rc(p, add(p, [s * 3.4, 0, -dz]), 0.18, 0.18, 5, 0); rc(add(p, [0, 0, -dz - 0.3]), add(p, [0, 0, -dz + 0.4]), 4.4, 3.4, 5, 0.3); }
  rc(add(bl, [0, 0, -12.6]), add(bl, [0, 0, -7.5]), 1.3, 1.1, 3, 0);
  for (let i = 0; i < 6; i++) el(add(br, [(i % 3 - 1) * 1.6, ((i / 3) | 0) - 0.5, -12.4 + i * 0.12]), [1.3, 1.3, 0.35], 5, 0);
  for (let i = 0; i < 14; i++) el([6 + (R() - 0.5) * 9, 7 + (R() - 0.5) * 5, 41.6 + R() * 1.5], [1.2, 1.2, 0.35], 5, 0); // coin heap
  el([8, 7, 42], [4, 3, 1.4], 5, 0.8);
  bx([-2, -8, 42.4], [6, 4.5, 1.0], 6, 0.2);                                      // ledger
  el([48, 8, 44.5], [2.6, 3.1, 2.8], 7, 0); rc([48, 9.6, 43.5], [48, 11, 42.6], 1.8, 1.3, 7, 0.8); // skull with a stub candle
  addCandles(b, [[48, 7.5, 47, 3, 0.9]]);
  // crates and a sack to the left
  bx([-78, -6, 11], [12, 11, 11], 8, 0.5); bx([-76, -4, 30], [10, 9, 8], 8, 0.5); el([-66, 16, 9], [8, 7, 9.5], 2, 2.0);
  // lantern on a crooked pole behind the counter
  rc([60, -14, 0], [61, -14, 92], 1.2, 1.0, 9, 0); rc([61, -14, 90], [46, -10, 92], 0.8, 0.8, 9, 0); rc([46, -10, 92], [46, -10, 84], 0.25, 0.25, 4, 0);
  parts.push({ m: 4, k: 0.2, f: (x, y, z) => { const c = [46, -10, 80]; const bb = sdBox(x, y, z, c[0], c[1], c[2], 2.6, 2.6, 3.4, 0.3); const win = Math.min(sdBox(x, y, z, c[0], c[1], c[2], 4, 1.6, 2.5), sdBox(x, y, z, c[0], c[1], c[2], 1.6, 4, 2.5)); return Math.min(Math.max(bb, -win), sdRC(x, y, z, add(c, [0, 0, 3.3]), add(c, [0, 0, 5.2]), 2.6, 0.6)); }, box: [40, -16, 74, 52, -4, 88] });
  el([46, -10, 79.8], [1.9, 1.9, 2.6], 51, 0);
  // rats: on the counter, in the crates, on the sack
  for (const [x, y, z, yaw] of [[-20, 6, 41.5, 0.8], [33, -9, 41.5, -2.2], [-74, 8, 22, 1.4], [-64, 16, 18, 2.6], [-80, -4, 38, -0.4]]) rot([x, y, z], yaw, ratSdf, 10, 0, 14);
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    switch (m) {
      case 1: { const w = woodMat(x, y, z, 0, 5); if (z > 41 && vn3(x * 0.2, y * 0.2, 0, 5) > 0.6) w.alb = mix(w.alb, C.bloodD, 0.8); return w; }
      case 2: { let c = mix(C.cloth, C.clothD, clamp(fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 6) * 1.6 - 0.3)); if (vn3(x * 0.2, y, z * 0.2, 7) > 0.66) c = mix(c, L('#4c443a'), 0.7); if (z < 16 && vn3(x * 0.3, y, z * 0.3, 8) > 0.55) c = mix(c, C.bloodD, 0.7); return { alb: c, wrap: 0.3 }; }
      case 3: return { alb: mix(L('#2a0306'), L('#5a0a10'), vn3(x * 0.6, y * 0.6, z * 0.6, 3)), spec: 1.0, gloss: 90, wrap: 0 }; // jars of blood
      case 4: return ironMat(x, y, z);
      case 5: return { alb: mix(C.silver, mul(C.silver, 0.5), vn3(x, y, z, 5)), spec: 0.8, gloss: 50 };
      case 6: return { alb: L('#3a1e14'), spec: 0.1 };
      case 7: return { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2, gloss: 30 };
      case 8: return woodMat(x, y, z, 0, 8);
      case 9: return woodMat(x, y, z, 2, 9);
      case 10: return { alb: mix(L('#4e4a44'), L('#24221e'), vn3(x * 1.5, y * 1.5, z * 1.5, 4)), wrap: 0.4, spec: 0.12, gloss: 20 };
    }
    return candleMat(m) || { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6, lamp: [46, -10, 80] };
}
export function shelves(w = 170) { // two planks against the wall with jars, bottles, a skull
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(17);
  for (const z of [64, 98]) { bx([0, 6.5, z], [w / 2, 6.5, 1.2], 1, 0.3); for (const x of [-w / 2 + 10, w / 2 - 10]) rc([x, 1, z - 9], [x, 11, z - 1.5], 0.9, 0.9, 4, 0); }
  for (const z of [65.2, 99.2]) for (let x = -w / 2 + 8; x < w / 2 - 6; x += 7 + R() * 7) {
    const k = R(), y = 6 + (R() - 0.5) * 3;
    if (k < 0.55) { const r = 2.2 + R() * 1.6, h = 5 + R() * 8; parts.push({ m: k < 0.4 ? 2 : 3, k: 0, box: [x - r - 2, y - r - 2, z - 1, x + r + 2, y + r + 2, z + h + 2], f: (X, Y, Z) => ext(Math.hypot(X - x, Y - y) - r, Z, z + h / 2, h / 2, 1.0) }); }
    else if (k < 0.85) { rc([x, y, z], [x, y, z + 6], 1.6, 1.5, 2, 0.5); rc([x, y, z + 6], [x, y, z + 10], 0.6, 0.5, 5, 0.6); }
    else { el([x, y, z + 2.8], [2.5, 3, 2.7], 6, 0); }
  }
  rc([-w / 2 + 30, 6, 99], [-w / 2 + 30, 12, 98], 0.5, 0.5, 4, 0); // a rat tail hanging from the top shelf (rat behind jars)
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => m === 1 ? woodMat(x, y, z, 0, 11) : m === 2 ? { alb: mix(L('#2a0306'), L('#5a0a10'), vn3(x * 0.6, y * 0.6, z * 0.6, 3)), spec: 1.0, gloss: 90 } : m === 3 ? { alb: mix(L('#4a4a30'), L('#6e6a44'), vn3(x, y, z, 3)), spec: 0.9, gloss: 80 } : m === 6 ? { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2 } : m === 5 ? woodMat(x, y, z, 2, 2) : ironMat(x, y, z);
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}

// ---------- Lucian's desk: open atlas, loose plans, inkwell and quill, candle stubs, books ----------
export function desk() {
  const b = builder(); const { parts, bx, rc, el } = b; const R = mulberry32(23);
  bx([0, 0, 36], [44, 15, 1.4], 1, 0.4);
  for (const x of [-40, 40]) for (const y of [-11, 11]) rc([x, y, 0], [x, y, 35], 1.5, 1.4, 1, 0);
  bx([0, 0, 9], [40, 1, 1], 1, 0.3);
  // open atlas: two pages tilted up from the spine
  for (const s of [-1, 1]) parts.push({ m: 2, k: 0, box: [-22, -12, 36, 6, 12, 44], f: (x, y, z) => { const X = (x + 8) * s, Z = z - 38.2 - X * 0.12; return sdBox(X, y, Z, 7, 2, 0, 7, 8.5, 0.6, 0.2); } });
  for (let i = 0; i < 5; i++) { const x = 6 + R() * 26, y = (R() - 0.5) * 20, a = R() * 3; b.rot([x, y, 37.6], a, (X, Y, Z) => sdBox(X, Y, Z, 0, 0, i * 0.25, 6, 4.5, 0.15, 0), 2, 0, 9); }
  rc([24, -7, 37.5], [24, -7, 40.5], 1.6, 1.4, 4, 0.2);                  // inkwell
  rc([25, -7, 40], [33, -2, 47], 0.25, 0.1, 5, 0); el([30, -4, 44.5], [0.8, 2.5, 3], 5, 0.5); // quill
  for (let i = 0; i < 4; i++) bx([-36 + i * 0.6, -6, 39.5 + i * 3.1], [7 - i, 5, 1.5], 3, 0.4); // stacked books
  addCandles(b, [[34, 7, 37.6, 9, 1.2], [38, 3, 37.6, 5, 1.1], [30, 10, 37.6, 3, 1.0], [-30, 8, 37.6, 6, 1.0]]);
  // a stool, a skull holding the plans down
  rc([-14, 26, 0], [-14, 26, 22], 1.2, 1.2, 1, 0); bx([-14, 26, 23], [6, 6, 1.2], 1, 0.4); rc([-18, 22, 0], [-14, 26, 12], 0.8, 0.8, 1, 0); rc([-10, 30, 0], [-14, 26, 12], 0.8, 0.8, 1, 0);
  el([14, 8, 39.7], [2.6, 3.1, 2.7], 6, 0);
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny, nz) => {
    switch (m) {
      case 1: { const w = woodMat(x, y, z, 0, 31); if (z > 37 && vn3(x * 0.6, y * 0.6, 0, 3) > 0.7) w.alb = mix(w.alb, C.wax, 0.7); return w; }
      case 2: { let c = mix(C.paper, C.paperD, clamp(vn3(x * 0.5, y * 0.5, z, 4) * 1.6 - 0.3)); if (nz > 0.5 && Math.abs(Math.sin(y * 0.9 + Math.sin(x * 0.2))) < 0.07) c = mix(c, L('#2a2018'), 0.6); if (vn3(x * 0.8, y * 0.8, 0, 9) > 0.78) c = mix(c, C.bloodF, 0.7); return { alb: c, wrap: 0.5 }; }
      case 3: return { alb: [L('#3a1e14'), L('#1e2232'), L('#2e2a1c'), L('#3a1418')][Math.floor(z / 3.1) & 3], spec: 0.1 };
      case 4: return { alb: L('#141210'), spec: 0.9, gloss: 60 };
      case 5: return { alb: L('#c8c0aa'), wrap: 0.5 };
      case 6: return { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2 };
    }
    return candleMat(m) || { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}

// ---------- beam along the top of the back wall, with corbels; things hang from it ----------
export function beam(x0 = 0, x1 = 960, z = 168) {
  const sdf = (x, y, Z) => { let d = sdBox(x, y, Z, (x0 + x1) / 2, 6, z + 5, (x1 - x0) / 2, 6, 5, 0.6); const cx = ((x - 80) % 160 + 160) % 160 - 80; d = Math.min(d, sdBox(cx, y, Z, 0, 4.5, z - 7, 5, 4.5, 7, 0.8)); return d; };
  return { sdf, mat: (m, x, y, Z) => { const w = woodMat(x, y, Z, 0, 41); w.alb = mul(w.alb, 0.8); return w; }, bounds: [x0, 0, z - 15, x1, 13, z + 11], step: 0.8 };
}

// ---------- Magda's arena: ring of stakes linked by sagging chains, skulls on stakes ----------
export function ringStakes(R0 = 84, n = 12) {
  const b = builder(); const { parts, rc, el } = b; const R = mulberry32(31);
  const P = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.13, r = R0 + (R() - 0.5) * 4; const p = [Math.cos(a) * r, Math.sin(a) * r, 0]; const h = 30 + R() * 10; P.push([...p, h]);
    rc([p[0], p[1], -14], [p[0], p[1], h - 3], 3.0, 2.4, 1, 0); rc([p[0], p[1], h - 3], [p[0] + (R() - 0.5), p[1], h + 2.5], 1.9, 0.2, 1, 0.4); }
  for (let i = 0; i < n; i++) { const a = P[i], c = P[(i + 1) % n]; const za = a[3] - 9, zc = c[3] - 9; let prev = null; for (let k = 0; k <= 10; k++) { const t = k / 10; const q = [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(za, zc, t) - Math.sin(t * Math.PI) * 9]; if (prev) { const m = lp(prev, q, 0.5); el(m, [1.6, 1.6, (k & 1) ? 1.0 : 1.8], 2, 0); } prev = q; } }
  { const p = P[7]; el([p[0], p[1], p[3] + 4], [2.2, 2.2, 1.6], 4, 0.6); el([p[0], p[1], p[3] + 8], [1.8, 1.8, 3.6], 5, 0.8); }
  for (const i of [1, 4, 9]) { const p = P[i]; el([p[0], p[1], p[3] + 4], [2.8, 3.3, 3.0], 3, 0); rc([p[0], p[1] + 1.6, p[3] + 3], [p[0], p[1] + 3.3, p[3] + 1.6], 1.9, 1.3, 3, 0.8); }
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => { if (m === 4) return { alb: L('#140c08') }; if (m === 5) return { alb: [0, 0, 0], emi: [2.6, 1.0, 0.25], noAO: true, noShadow: true }; if (m === 1) { const w = woodMat(x, y, z, 2, 51); if (z > 20 || vn3(x, y, z * 0.2, 2) > 0.6) w.alb = mix(w.alb, C.bloodD, z > 25 ? 0.5 : 0.7); return w; } if (m === 2) return { alb: mix(L('#3a3836'), L('#1a1816'), vn3(x, y, z, 3)), spec: 0.7, gloss: 40 }; return { alb: mix(C.bone, C.boneD, vn3(x, y, z, 2)), spec: 0.2, gloss: 30 }; };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.7 };
}
export function pitBones(seed = 3) { // bones, ribcages and a broken wolf-ish skull on the arena floor
  const b = builder(); const { parts, rc, el } = b; const R = mulberry32(seed);
  for (let i = 0; i < 14; i++) { const x = (R() - 0.5) * 120, y = (R() - 0.5) * 80, a = R() * 6.3, l = 6 + R() * 7; const p = [x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2, 1], q = [x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2, 1 + R() * 2]; rc(p, q, 0.8, 0.7, 1, 0); el(p, [1.3, 1.3, 1.1], 1, 0.5); el(q, [1.2, 1.2, 1.0], 1, 0.5); }
  for (let i = 0; i < 3; i++) { const x = (R() - 0.5) * 100, y = (R() - 0.5) * 60; el([x, y, 2.6], [2.6, 3.1, 2.7], 1, 0); rc([x, y + 1.6, 2], [x, y + 3.3, 0.9], 1.8, 1.2, 1, 0.8); }
  // a ribcage
  for (let k = 0; k < 6; k++) parts.push({ m: 1, k: 0, box: [0, -20, -1, 30, 0, 14], f: (x, y, z) => { const X = x - 14 - k * 2.6, Y = y + 10; return Math.max(Math.abs(Math.hypot(Y / 1.2, z - 1) - 6.5 + k * 0.4) - 0.55, Math.abs(X) - 0.55, -z + 0.5); } });
  rc([12, -10, 1.2], [30, -10, 1.6], 0.9, 0.9, 1, 0);
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => ({ alb: mix(mix(C.bone, C.boneD, vn3(x, y, z, 2)), C.bloodD, clamp(vn3(x * 0.3, y * 0.3, z, 7) - 0.45) * 1.6), spec: 0.25, gloss: 30 }), bounds: boundsOf(parts, 2), step: 0.7 };
}
export function hideFrame() { // wolf hide stretched on a wooden frame, facing the room
  const b = builder(); const { parts, rc } = b;
  rc([-26, 0, 0], [-24, 0, 82], 1.6, 1.4, 1, 0); rc([26, 0, 0], [24, 0, 82], 1.6, 1.4, 1, 0); rc([-28, 0, 78], [28, 0, 80], 1.4, 1.4, 1, 0); rc([-26, 0, 14], [26, 0, 14], 1.3, 1.3, 1, 0);
  const HV = [[0, 76], [-5, 74], [-9, 70], [-21, 72], [-17, 62], [-11, 58], [-12, 38], [-22, 26], [-14, 24], [-8, 30], [-3, 18], [3, 18], [8, 30], [14, 24], [22, 26], [12, 38], [11, 58], [17, 62], [21, 72], [9, 70], [5, 74]];
  parts.push({ m: 2, k: 0, box: [-24, -3, 14, 24, 3, 80], f: (x, y, z) => extrude(sdPoly2(x, z, HV) + 0.3 * vn(x * 0.4, z * 0.4, 3), y - Math.sin(x * 0.1) * 0.6, 0.6) });
  for (const [a, c] of [[[-21, 72], [-26, 76]], [[21, 72], [26, 76]], [[-22, 26], [-26, 16]], [[22, 26], [26, 16]], [[0, 76], [0, 79]]]) rc([a[0], 0.5, a[1]], [c[0], 0.5, c[1]], 0.2, 0.2, 3, 0); // lacing
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 1 ? woodMat(x, y, z, 2, 61) : m === 3 ? { alb: L('#6a5a40') } : { alb: mix(mix(C.hide, C.hideD, clamp(vn3(x * 1.4, y, z * 0.4, 3) * 1.6 - 0.3)), C.bloodD, clamp(-sdPoly2(x, z, HV) < 2.5 ? 0.6 : 0) + (y > 0 ? 0 : 0.5)), wrap: 0.4 }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function brazier() {
  const b = builder(); const { parts, rc, el } = b;
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4; rc([Math.cos(a) * 11, Math.sin(a) * 11, 0], [Math.cos(a) * 5, Math.sin(a) * 5, 26], 0.9, 0.8, 1, 0); }
  parts.push({ m: 1, k: 0, box: [-12, -12, 22, 12, 12, 36], f: (x, y, z) => { const r = Math.hypot(x, y); const s = Math.hypot(r, (z - 36) * 1.3) - 11; return Math.max(Math.abs(s) - 0.9, z - 34.5); } });
  el([0, 0, 33], [9, 9, 2.6], 2, 1.0);                         // coals
  for (let i = 0; i < 5; i++) { const a = i * 1.3; el([Math.cos(a) * 4, Math.sin(a) * 3, 37 + (i % 2) * 2], [2.2, 2.2, 4.6 - (i % 3)], 3, 1.2); } // flames
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 1 ? ironMat(x, y, z) : m === 2 ? { alb: [0.05, 0.02, 0.01], emi: [1.6, 0.4, 0.06].map(v => v * (0.4 + vn3(x, y, z, 4))), noAO: true } : { alb: [0, 0, 0], emi: [3.2, 1.4, 0.3], noAO: true, noShadow: true }, bounds: boundsOf(parts, 2), step: 0.6, fire: [0, 0, 40] };
}

// ---------- Séverin's corner: fencing dummy (rapier left in it), cracked cheval mirror, velvet armchair, candelabra ----------
export function dummy() {
  const b = builder(); const { parts, rc, el } = b;
  rc([-12, 0, 0.8], [12, 0, 0.8], 1.6, 1.6, 1, 0); rc([0, -12, 0.8], [0, 12, 0.8], 1.6, 1.6, 1, 0);
  rc([0, 0, 0], [0, 0, 82], 1.8, 1.5, 1, 0);
  el([0, 0.4, 62], [8.5, 5.5, 14], 2, 2.0);                   // stuffed torso
  el([0, 0.4, 84], [4.2, 4.4, 5.2], 2, 0.8);                  // sack head
  rc([-15, 0, 72], [15, 0, 73.5], 1.2, 1.2, 1, 0);            // crossbar arms
  parts.push({ m: 3, k: 0, box: [-12, -6, 40, 12, 8, 80], f: (x, y, z) => { const v = Math.abs(x * 0.6 - (z - 62) * 0.4); return Math.max(sdEll(x, y, z, 0, 0.4, 62, 8.9, 5.9, 14.4), -sdEll(x, y, z, 0, 0.4, 62, 8.1, 5.1, 13.6), -(Math.abs(Math.sin(z * 0.5 + x * 0.3)) - 0.93)); } }); // slashed straps
  rc([-2, 10, 58], [9, -15, 72], 0.45, 0.35, 4, 0); el([-2.3, 10.7, 57.6], [1.8, 1.8, 1.8], 4, 0.4); rc([-4.5, 10, 59.5], [0.5, 11.5, 56], 0.35, 0.35, 4, 0); // rapier through it
  for (let k = 0; k < 5; k++) rc([3.5, 4, 78 - k * 0.5], [6 + k * 1.2, 5, 70 - k * 4], 0.6, 0.35, 5, 0); // violet ribbon
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => m === 1 ? woodMat(x, y, z, 2, 71) : m === 2 ? (() => { let c = mix(L('#94845e'), L('#5e5038'), clamp(vn3(x * 0.6, y * 0.6, z * 0.6, 5) * 1.6 - 0.3)); if (Math.abs(Math.sin(x * 0.7 + z * 0.4)) < 0.08 && y > 0) c = mix(C.straw, L('#1a140c'), 0.5); return { alb: c, wrap: 0.4 }; })() : m === 3 ? { alb: L('#2a1e14'), spec: 0.2 } : m === 4 ? { alb: L('#9aa0a0'), spec: 0.9, gloss: 60 } : { alb: mix(C.violet, C.violetD, vn3(x, y, z, 2)), wrap: 0.4 };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function mirror() { // oval glass in a tarnished gilt frame, local XZ plane, faces +Y
  const b = builder(); const { parts, rc } = b;
  const E = (x, z) => (Math.hypot(x / 16, (z - 52) / 30) - 1) * 16;
  parts.push({ m: 1, k: 0, box: [-20, -4, 18, 20, 4, 86], f: (x, y, z) => extrude(Math.abs(E(x, z)) - 2.0 - 0.5 * Math.max(0, Math.sin(Math.atan2(z - 52, x) * 18)), y, 1.6) - 0.3 });
  parts.push({ m: 2, k: 0, box: [-17, -2, 20, 17, 2, 84], f: (x, y, z) => extrude(E(x, z), y + 0.3, 0.4) });
  parts.push({ m: 1, k: 0.4, box: [-24, -3, 82, 24, 3, 96], f: (x, y, z) => sdEll(x, y, z, 0, 0, 84, 7, 1.8, 5) }); // crest
  for (const s of [-1, 1]) { rc([s * 19, -1, 0], [s * 18, -1, 56], 1.3, 1.1, 1, 0); rc([s * 19, -10, 0.8], [s * 19, 8, 0.8], 1.3, 1.3, 1, 0); }
  const sdf = partsSdf(parts);
  const crack = (x, z) => { let m = 1e9; const c0 = [5, 60]; for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, l = 14 + h2(i, 2, 5) * 20; const ex = c0[0] + Math.cos(a) * l, ez = c0[1] + Math.sin(a) * l; const dx = ex - c0[0], dz = ez - c0[1]; const t = clamp(((x - c0[0]) * dx + (z - c0[1]) * dz) / (dx * dx + dz * dz)); m = Math.min(m, Math.hypot(x - c0[0] - dx * t, z - c0[1] - dz * t) - Math.sin(t * 9) * 0.6); } return Math.min(m, Math.abs(Math.hypot(x - 5, z - 60) - 4)); };
  const mat = (m, x, y, z) => {
    if (m === 2) { const k = crack(x, z); const shard = h2(Math.floor(Math.atan2(z - 60, x - 5) * 1.1 + 9), 1, 5); // each shard reflects differently
      if (k < 0.55) return { alb: L('#a49cb0'), spec: 0.5, gloss: 30 };
      return { alb: mix(L('#141218'), L('#3a3448'), shard * 0.8 + 0.2 * clamp(1 - (z - 30) / 50)), spec: 1.2, gloss: 140, wrap: 0, n: [0, 1, 0.08 * (shard - 0.5)] }; }
    const n = vn3(x * 0.8, y * 0.8, z * 0.8, 3); return { alb: mix(C.gilt, C.giltD, clamp(n * 1.8 - 0.3)), spec: 0.6, gloss: 35 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function armchair() { // faces +Y, violet velvet split open
  const b = builder(); const { parts, bx, rc, el } = b;
  bx([0, 0, 20], [13, 12, 4], 1, 2.0); bx([0, -11, 40], [13, 3, 20], 1, 2.5); el([0, -11, 58], [13, 3.4, 5], 1, 2.0);
  for (const s of [-1, 1]) { bx([s * 13.5, 0, 28], [2.2, 11, 4], 1, 1.5); rc([s * 13.5, 10, 24], [s * 13.5, 11, 32], 2.4, 2.6, 1, 1.0); }
  for (const x of [-11, 11]) for (const y of [-10, 10]) rc([x, y, 0], [x, y, 16], 1.2, 1.4, 2, 0);
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => { if (m === 2) return { alb: C.giltD, spec: 0.4, gloss: 30 }; const n = vn3(x * 0.5, y * 0.5, z * 0.5, 9); if (vn3(x * 0.2, y * 0.2, z * 0.2, 4) > 0.64) return { alb: mix(C.straw, L('#2a2014'), n), wrap: 0.5 }; return { alb: mix(C.violet, C.violetD, clamp(n * 1.6 - 0.2)), spec: 0.15, gloss: 15, wrap: 0.3 }; }, bounds: boundsOf(parts, 2), step: 0.6 };
}
export function candelabra() {
  const b = builder(); const { parts, rc, el } = b;
  for (let i = 0; i < 3; i++) { const a = i * 2.094; rc([Math.cos(a) * 8, Math.sin(a) * 8, 0], [0, 0, 7], 0.8, 0.8, 1, 0); }
  rc([0, 0, 0], [0, 0, 64], 1.1, 0.8, 1, 0);
  for (const s of [-1, 1]) { rc([0, 0, 58], [s * 9, 0, 61], 0.6, 0.6, 1, 0); rc([s * 9, 0, 61], [s * 9, 0, 64], 0.6, 1.4, 1, 0); }
  addCandles(b, [[0, 0, 64, 7, 1.1], [-9, 0, 64, 4, 1.0], [9, 0, 64, 9, 1.0]]);
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => m === 1 ? { alb: mix(C.gilt, C.giltD, vn3(x, y, z, 3)), spec: 0.6, gloss: 40 } : candleMat(m), bounds: boundsOf(parts, 2), step: 0.6, noShadow: true };
}
