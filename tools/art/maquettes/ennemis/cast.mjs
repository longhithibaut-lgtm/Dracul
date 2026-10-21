// Ghouls, the Order's crossbowman, corpses, cages, pillars, portcullis.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, partsSdf, clamp, lerp, sstep, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from './lib.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const lp = (a, b, t) => add(a, sc(sub(b, a), t));

export function builder() {
  const parts = [];
  const rc = (a, b, r1, r2, m, k = 0, ex = {}) => parts.push({ f: (x, y, z) => sdRC(x, y, z, a, b, r1, r2), m, k, box: [Math.min(a[0], b[0]) - r1 - 1, Math.min(a[1], b[1]) - r1 - 1, Math.min(a[2], b[2]) - r1 - 1, Math.max(a[0], b[0]) + r1 + 1, Math.max(a[1], b[1]) + r1 + 1, Math.max(a[2], b[2]) + r1 + 1], ...ex });
  const el = (c, r, m, k = 0, ex = {}) => parts.push({ f: (x, y, z) => sdEll(x, y, z, c[0], c[1], c[2], r[0], r[1], r[2]), m, k, box: [c[0] - r[0] - 1, c[1] - r[1] - 1, c[2] - r[2] - 1, c[0] + r[0] + 1, c[1] + r[1] + 1, c[2] + r[2] + 1], ...ex });
  const carve = (c, r, k = 0.5) => parts.push({ f: (x, y, z) => sdSphere(x, y, z, c[0], c[1], c[2], r), sub: true, k, box: [c[0] - r - 2, c[1] - r - 2, c[2] - r - 2, c[0] + r + 2, c[1] + r + 2, c[2] + r + 2] });
  return { parts, rc, el, carve };
}
export function boundsOf(parts, pad = 2) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of parts) if (p.box && !p.sub) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p.box[k]); b[k + 3] = Math.max(b[k + 3], p.box[k + 3]); }
  return [b[0] - pad, b[1] - pad, Math.max(b[2] - pad, -100), b[3] + pad, b[4] + pad, b[5] + pad];
}

// ---------- shared skin palettes ----------
export const S = {
  ghoul: L('#b4ad8e'), ghoulD: L('#7d785e'), ghoulG: L('#8a8f62'), bruise: L('#5b4a52'),
  blood: L('#5e0710'), bloodD: L('#330507'), bloodF: L('#7a0b12'), muscle: L('#6a1f18'), muscleL: L('#8c3a2a'), fat: L('#b49a6a'),
  corpse: L('#9c9478'), corpseD: L('#6c6a58'), tooth: L('#c8bc96'), nail: L('#2a2018'),
  iron: L('#34302c'), rust: L('#5c3520'), rustL: L('#7a4626'), wood: L('#3e2c1c'), woodD: L('#24190f'),
  gamb: L('#4a3c2a'), gambD: L('#2e251a'), tabard: L('#bdb294'), tabardD: L('#7e7660'), sun: L('#b07a26'), sunD: L('#6e4614'), skinH: L('#a87a5a'), leather: L('#3a2818'),
};
export const skinTex = (base, dark, x, y, z, seed) => { const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, seed); let c = mix(base, dark, clamp(n * 1.6 - 0.35)); if (vn3(x * 0.25, y * 0.25, z * 0.25, seed + 5) > 0.68) c = mix(c, S.bruise, 0.45); return c; };

// ================= GHOUL =================
// emaciated thing on all fours, hips high, head low, jaw unhinged. ~60 u long. variant: 0 crawl, 1 lunge, 2 rear up
export function ghoul(variant = 0, seed = 1) {
  const R = mulberry32(seed); const j = () => (R() - 0.5);
  const { parts, rc, el, carve } = builder();
  const lunge = variant === 1, rear = variant === 2;
  const pel = [0, -15, lunge ? 22 : 25], ribs = [0, 4, rear ? 30 : lunge ? 22 : 24], neck = [0, 17, rear ? 34 : lunge ? 20 : 21];
  const head = rear ? [0, 22, 38] : lunge ? [0, 27, 18] : [0, 25, 15];
  // spine with vertebrae
  for (let i = 0; i <= 12; i++) { const t = i / 12; const p = t < 0.5 ? lp(pel, ribs, t * 2) : lp(ribs, neck, t * 2 - 1); const arch = Math.sin(t * Math.PI) * 4; el(add(p, [0, 0, 4.2 + arch]), [1.1, 1.0, 1.0], 1, 0.8); }
  el(ribs, [5.6, 9.5, 5.2], 1, 2.0, { ribs: true }); // ribcage
  el(add(pel, [0, 0, 1]), [5.0, 4.5, 3.6], 1, 2.0);
  rc(add(pel, [0, 4, 0]), add(ribs, [0, -6, -1]), 3.0, 3.6, 1, 2.0); // sunken belly
  for (const s of [-1, 1]) el(add(ribs, [s * 3.8, 3.5, 4.0]), [2.6, 3.4, 1.0], 1, 1.0); // shoulder blades
  rc(neck, head, 1.8, 1.6, 1, 1.0);
  // head: skull, hanging jaw, teeth, sockets
  el(add(head, [0, -0.5, 0.8]), [3.4, 4.2, 3.5], 1, 0);
  rc(add(head, [0, 1.5, -0.5]), add(head, [0, 4.6, -1.2]), 2.4, 1.6, 1, 1.0);
  const jaw0 = add(head, [0, 0.6, -2.0]), jaw1 = add(head, [0, 5.2, rear ? -6.5 : -5.5]);
  for (const s of [-1, 1]) rc(add(jaw0, [s * 2.2, 0, 0]), add(jaw1, [s * 0.8, 0, 0]), 0.75, 0.6, 1, 0.5);
  carve(add(head, [0, 4.4, -2.6]), 1.5, 0.4); // mouth cavity
  for (const s of [-1, 1]) carve(add(head, [s * 1.4, 3.6, 0.9]), 0.95, 0.4);
  for (let t = 0; t < 6; t++) { const s = t < 3 ? 1 : -1, k = t % 3; const b = add(head, [s * (0.5 + k * 0.6), 4.6 - k * 0.4, -1.6]); rc(b, add(b, [0, 0.2, -1.3]), 0.3, 0.06, 7, 0); }
  // limbs
  for (const s of [-1, 1]) {
    const sh = add(ribs, [s * 5.0, 8, 1.5]);
    const el_ = rear ? add(sh, [s * 6, 6, 4 + j()]) : add(sh, [s * (8 + j() * 2), lunge ? 10 : 5, -8]);
    const wr = rear ? add(el_, [s * 2, 6, -2]) : add(el_, [s * (-1 + j()), (lunge ? 10 : 8) + j() * 2, lunge ? -10 : -12.5]);
    rc(sh, el_, 2.3, 1.5, 1, 1.0); rc(el_, wr, 1.5, 1.0, 1, 0.6);
    for (let f = 0; f < 4; f++) { const o = (f - 1.5) * 0.9; const fb = add(wr, [s * o * 0.6, 1.5, rear ? 0 : -0.3]); const ft = add(fb, [s * o * 1.2, rear ? 5 : 5.5, rear ? -2.5 : -Math.max(0, wr[2]) - 0.2]); rc(fb, ft, 0.45, 0.22, f === 3 ? 1 : 2, 0.3); }
    const hip = add(pel, [s * 4.0, -1, 0]);
    const kn = rear ? add(hip, [s * 3, 10, -hip[2] + 4]) : add(hip, [s * (4 + j()), 6, -hip[2] + 3.5]);
    const an = add(kn, [s * 0.5, -17, 3 + j() * 2]);
    rc(hip, kn, 3.0, 1.7, 1, 1.2); rc(kn, an, 1.7, 1.0, 1, 0.6);
    rc(an, add(an, [0, -4, -an[2] + 0.8]), 0.9, 0.7, 1, 0.4);
  }
  const sdf0 = partsSdf(parts);
  const ribC = ribs;
  const sdf = (x, y, z) => { // ribs and spine pressing through the skin
    let d = sdf0(x, y, z);
    const dy = y - ribC[1];
    if (Math.abs(dy) < 9 && z > ribC[2] - 6) d += 0.35 * Math.max(0, Math.sin(dy * 1.3)) * sstep(-3, 2, z - ribC[2]);
    return d;
  };
  const mat = (m, x, y, z, nx, ny, nz_) => {
    if (m === 7) return { alb: S.tooth, spec: 0.3, gloss: 40 };
    let c = skinTex(S.ghoul, S.ghoulD, x, y, z, seed * 7);
    c = mix(c, S.ghoulG, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed) - 0.3) * 0.6);
    // gore: mouth + chin, hands, an open wound along the flank
    const hd = Math.hypot(x - head[0], y - (head[1] + 4), z - (head[2] - 3));
    let bl = clamp((6 - hd) / 4) * (0.6 + 0.4 * vn3(x, y, z, 3));
    if (z < 4) bl = Math.max(bl, clamp((4 - z) / 3) * (vn3(x * 0.5, y * 0.5, 0, seed) * 1.2));
    const wound = Math.abs(x - 4.8 - (y - ribC[1]) * 0.05) < 1.6 && Math.abs(y - ribC[1] + 2) < 6 && z > ribC[2] - 2;
    if (wound) return { alb: mix(S.muscle, S.bloodF, vn3(x * 2, y * 2, z * 2, 9)), spec: 0.6, gloss: 60, sss: 0.3 };
    if (bl > 0.2) return { alb: mix(c, S.blood, clamp(bl * 1.3)), spec: 0.5 * bl, gloss: 55, sss: 0.3 };
    if (m === 2) return { alb: mix(c, S.nail, 0.7), spec: 0.3, gloss: 30 };
    return { alb: c, sss: 0.55, wrap: 0.3, spec: 0.12, gloss: 22 };
  };
  return { sdf, mat, bounds: boundsOf(parts, 3), step: 0.6, head };
}

// ================= generic humanoid (corpses, prisoner, crossbowman) =================
// J: joints; opt.limbR scale, opt.skin(m,x,y,z) material fn, extra parts appended via opt.extra(builder)
export function humanoid(J, b, o = {}) {
  const k = o.thin ?? 1; const { rc, el } = b;
  el(J.head, [3.9, 4.6, 5.0], 1, 0, { head: true });
  rc(add(J.head, [0, 1.2, -1]), add(J.head, [0, 2.3, -5.4]), 2.9, 1.4, 1, 1.4);
  rc(J.neck, add(J.head, [0, -0.5, -4.5]), 1.9 * k, 1.7 * k, 1, 0.8);
  rc(J.neck, J.chest, 3.6 * k, 5.6 * k, o.torsoM || 1, 2.0);
  el(J.chest, [6.6 * k, 3.8 * k, 6.5], o.torsoM || 1, 1.8, { ribs: true });
  rc(J.chest, J.pelvis, 4.6 * k, 4.8 * k, o.torsoM || 1, 2.2);
  el(J.pelvis, [5.8 * k, 3.6 * k, 4.4], o.pelvisM || 1, 1.6);
  for (const [S1, E, W, Hd] of [[J.Sr, J.Er, J.Wr, J.Hr_], [J.Sl, J.El, J.Wl, J.Hl_]]) {
    rc(J.neck, S1, 2.2 * k, 2.1 * k, o.torsoM || 1, 1.4);
    rc(S1, E, 2.2 * k, 1.5 * k, o.armM || 1, 1.0); rc(E, W, 1.5 * k, 1.05 * k, o.armM || 1, 0.6); rc(W, Hd, 1.1, 0.7, 1, 0.5);
  }
  for (const [Hh, K, A, T] of [[J.Hr, J.Kr, J.Ar, J.Tr], [J.Hl, J.Kl, J.Al, J.Tl]]) {
    rc(Hh, K, 3.1 * k, 2.0 * k, o.legM || 1, 1.4); rc(K, A, 2.1 * k, 1.3 * k, o.shinM || o.legM || 1, 0.8); rc(A, T, 1.4, 1.0, o.footM || 1, 0.6);
  }
}
export const std = { // standing reference, height ~96
  head: [0, 0.8, 90], neck: [0, 0.3, 82], chest: [0, 0.3, 71], pelvis: [0, 0, 51],
  Sr: [-8.5, -0.2, 78], Er: [-10, -1, 61], Wr: [-10.5, 0.5, 46], Hr_: [-10.8, 1.5, 40],
  Sl: [8.5, -0.2, 78], El: [10, -1, 61], Wl: [10.5, 0.5, 46], Hl_: [10.8, 1.5, 40],
  Hr: [-3.6, 0, 49], Kr: [-3.9, 1, 27], Ar: [-4, -0.5, 4], Tr: [-4.4, 6, 1],
  Hl: [3.6, 0, 49], Kl: [3.9, 1, 27], Al: [4, -0.5, 4], Tl: [4.4, 6, 1],
};
const flip = J => { const o = {}; for (const k in J) o[k] = [J[k][0], J[k][1], 100 - J[k][2]]; return o; };

// ---- corpse hanging upside down by the ankles (flayed) ----
export function hangingCorpse(seed = 3, chainTop = 220) {
  const R = mulberry32(seed); const j = () => (R() - 0.5) * 2;
  const J = flip(std); // head down now near z=10
  J.Wr = [-7 + j(), 2 + j(), 103 - 82 + 6]; J.Hr_ = [-6 + j(), 3, 9]; J.Er = [-10, 0, 37];
  J.Wl = [7 + j(), 1.5 + j(), 104 - 82 + 5]; J.Hl_ = [6.5, 2.5, 10 + j()]; J.El = [10, 0, 36];
  J.Kl = [6, 3, 74]; J.Al = [3, 0, 96]; J.Tl = [3.3, 5, 99]; // one leg bent at the knee
  J.head = [0, 1.5, 9.5];
  const b = builder(); humanoid(J, b, { thin: 0.85 });
  b.rc([0, 0, 97], [0, 0, chainTop], 0.6, 0.6, 9, 0); // chain
  b.rc([-4, 0, 96], [4, 0, 96], 0.8, 0.8, 9, 0);
  const sdf = partsSdf(b.parts);
  const mat = (m, x, y, z, nx, ny, nz_) => {
    if (m === 9) return { alb: (Math.floor(z / 2) & 1) ? S.iron : S.rust, spec: 0.5, gloss: 40 };
    const flay = fbm3(x * 0.18, y * 0.18, z * 0.12, 3, seed) > 0.47;
    let c = skinTex(S.corpse, S.corpseD, x, y, z, seed);
    if (flay) c = mix(S.muscle, S.muscleL, clamp(0.5 + 0.5 * Math.sin(z * 2.2 + x)) * 0.6);
    const drip = Math.abs(Math.sin(x * 1.7 + seed)) > 0.82 && vn3(x, y, z * 0.1, 2) > 0.4; // blood ran down to the head
    if (drip || z < 18) c = mix(c, S.bloodD, z < 18 ? 0.7 : 0.6);
    return { alb: c, spec: flay ? 0.45 : 0.1, gloss: flay ? 50 : 20, sss: 0.3 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 2), step: 0.6 };
}

// ---- corpse hung by the wrists, gutted ----
export function wristCorpse(seed = 5, chainTop = 220) {
  const J = JSON.parse(JSON.stringify(std));
  const lift = 18; for (const k in J) J[k][2] += lift;
  J.Er = [-7, 0, 108 + lift - 14]; J.Wr = [-2.5, 0.5, 118 + lift - 10]; J.Hr_ = [-1.5, 1, 122 + lift - 10];
  J.El = [7, 0, 108 + lift - 14]; J.Wl = [2.5, 0.5, 118 + lift - 10]; J.Hl_ = [1.5, 1, 122 + lift - 10];
  J.head = [1.5, 4, 85 + lift]; J.neck = [0.5, 1.5, 80 + lift];
  J.Ar = [-3, 3, 6 + lift]; J.Tr = [-3.2, 7.5, 2.5 + lift]; J.Kr = [-3.5, 3.5, 28 + lift];
  const b = builder(); humanoid(J, b, { thin: 0.8 });
  b.rc([0, 0.8, 130], [0, 0.8, chainTop], 0.6, 0.6, 9, 0);
  b.rc([-2.5, 0.8, 128], [2.5, 0.8, 128], 0.9, 0.9, 9, 0);
  const cav = [0, 4.5, 60 + lift];
  b.parts.push({ f: (x, y, z) => sdEll(x, y, z, cav[0], cav[1], cav[2], 3.4, 2.5, 7), sub: true, k: 0.8, box: [-8, -4, 45 + lift, 8, 12, 75 + lift] });
  b.parts.push({ m: 8, k: 0.6, f: (x, y, z) => { // entrails hanging out
    let d = 1e9; for (let i = 0; i < 3; i++) { const x0 = -1.5 + i * 1.5, z0 = 56 + lift - i * 1.5; d = Math.min(d, sdRC(x, y, z, [x0, 4.2, z0], [x0 + Math.sin(i * 2) * 1.5, 5.5, z0 - 10 - i * 3], 1.1, 0.8)); } return d;
  }, box: [-6, 0, 30 + lift, 6, 10, 64 + lift] });
  const sdf = partsSdf(b.parts);
  const mat = (m, x, y, z) => {
    if (m === 9) return { alb: (Math.floor(z / 2) & 1) ? S.iron : S.rust, spec: 0.5, gloss: 40 };
    if (m === 8) return { alb: mix(L('#6a3a36'), L('#8a5248'), vn3(x * 2, y * 2, z * 2, 4)), spec: 0.7, gloss: 70, sss: 0.4 };
    let c = skinTex(S.corpse, S.corpseD, x, y, z, seed);
    const inCav = Math.hypot((x - cav[0]) / 4.5, (y - cav[1]) / 4, (z - cav[2]) / 8) < 1.15;
    if (inCav) return { alb: mix(S.bloodD, S.muscle, 0.4), spec: 0.6, gloss: 60 };
    const run = y > 1 && z < cav[2] && Math.abs(x + 1.5 * Math.sin(z * 0.2)) < 4.5 - (cav[2] - z) * 0.05;
    if (run) c = mix(c, S.blood, 0.85);
    return { alb: c, spec: run ? 0.5 : 0.1, gloss: run ? 55 : 20, sss: 0.3 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 2), step: 0.6 };
}

// ---- tangle of dead in the pit ----
export function pitBodies(seed = 9, w = 110, d = 40) {
  const R = mulberry32(seed); const b = builder();
  for (let n = 0; n < 7; n++) {
    const cx = (R() - 0.5) * w * 0.8, cy = (R() - 0.5) * d * 0.6, a = R() * 6.28, z = 4 + R() * 5;
    const ca = Math.cos(a), sa = Math.sin(a), T = (x, y, zz) => [cx + ca * x - sa * y, cy + sa * x + ca * y, z + zz];
    // lying body: torso along local x
    b.rc(T(-14, 0, 0), T(6, 0, 1), 4.4, 5.2, 1, 2.0);
    b.el(T(11, 0, 1.5), [3.6, 3.2, 3.2], 1, 0.8);
    b.rc(T(-14, -3, 0), T(-36, -6 + R() * 6, R() * 4), 2.6, 1.4, 1, 1.0);
    b.rc(T(-14, 3, 0), T(-34, 8 + R() * 6, R() * 5), 2.6, 1.4, 1, 1.0);
    b.rc(T(2, -5, 1), T(10 + R() * 8, -18 - R() * 6, R() * 6), 1.8, 1.0, 1, 0.8);
    b.rc(T(2, 5, 1), T(-6 + R() * 10, 16 + R() * 6, 2 + R() * 10), 1.8, 1.0, 1, 0.8);
  }
  // a few loose skulls and ribs
  for (let n = 0; n < 6; n++) b.el([(R() - 0.5) * w * 0.9, (R() - 0.5) * d * 0.8, 3 + R() * 6], [2.6, 3.0, 2.6], 2, 0.3);
  const sdf = partsSdf(b.parts);
  const mat = (m, x, y, z) => {
    if (m === 2) return { alb: S.tooth, spec: 0.2, gloss: 30 };
    let c = skinTex(S.corpse, S.corpseD, x, y, z, seed);
    const rot = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, 4);
    c = mix(c, L('#4a4a30'), clamp((rot - 0.45) * 3) * 0.8);
    if (vn3(x * 0.3, y * 0.3, z * 0.3, 8) > 0.6) c = mix(c, S.bloodD, 0.8);
    return { alb: c, spec: 0.3, gloss: 40, sss: 0.2 };
  };
  return { sdf, mat, bounds: boundsOf(b.parts, 2), step: 0.6 };
}

// ================= CROSSBOWMAN of the Order =================
// pose: 'aim' (the mockups': shouldered, left foot forward), 'lock' (the same, the bolt's head glinting: the aim is
// locked), 'shot' (the same, the string slapped forward, the bolt gone), 'idle' (the crossbow held low across him),
// 'raise' (bringing it up); over: joints to override, or a function of the joints returning them (the game's sheet,
// tools/art/foes.gen.mjs, poses its frames with it)
export function crossbowman(pose = 'aim', over = {}) {
  const J = JSON.parse(JSON.stringify(std)), shouldered = ['aim', 'lock', 'shot'].includes(pose);
  if (shouldered) Object.assign(J, { Kl: [4.2, 5, 27], Al: [4.5, 6, 4], Tl: [5, 12, 1], Kr: [-4.4, -3, 27], Ar: [-5, -6, 4], Tr: [-6.5, 0, 1],
    Sr: [-8.8, -0.5, 77], Er: [-9.5, 6, 66], Wr: [-3.5, 11, 70.5], Hr_: [-2.5, 13.5, 71],
    Sl: [8.8, 0.5, 77], El: [6.5, 12, 66], Wl: [1.5, 20, 70], Hl_: [0.5, 22, 70.5], head: [-1.0, 2.6, 89.5] });
  else if (pose === 'raise') Object.assign(J, { Er: [-10, 3, 63], Wr: [-5.5, 8, 62], Hr_: [-4.5, 10, 62], El: [8, 9, 62], Wl: [2, 16, 62], Hl_: [1, 18, 62], head: [-0.5, 1.8, 89.8] });
  else Object.assign(J, { Er: [-10, 1, 62], Wr: [-7, 4, 52], Hr_: [-6, 6, 51], El: [9, 5, 60], Wl: [2.5, 13, 51], Hl_: [1.5, 15, 50] });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  const b = builder(); humanoid(J, b, { thin: 1.15, torsoM: 3, pelvisM: 3, armM: 3, legM: 5, shinM: 6, footM: 6 });
  const { rc, el, parts } = b;
  // kettle hat: brim + dome
  const hc = add(J.head, [0, -0.2, 3.2]);
  parts.push({ m: 4, k: 0.3, f: (x, y, z) => { const r = Math.hypot(x - hc[0], y - hc[1]); const brim = Math.max(r - 8.6, Math.abs(z - hc[2] + 0.2 + r * 0.08) - 0.4); const dome = Math.max(sdEll(x, y, z, hc[0], hc[1], hc[2] + 0.5, 4.6, 5.0, 4.6), hc[2] - 0.5 - z); return Math.min(brim, dome); }, box: [hc[0] - 10, hc[1] - 10, hc[2] - 3, hc[0] + 10, hc[1] + 10, hc[2] + 7] });
  // tabard (front and back panels over the gambeson)
  for (const s of [1, -1]) parts.push({ m: 7, k: 0.5, f: (x, y, z) => sdBox(x, y, z, 0, s * (4.8 + (z < 52 ? (52 - z) * 0.03 : 0)), 58, 7.2, 0.6, 22, 0.4), box: [-9, s > 0 ? 2 : -9, 34, 9, s > 0 ? 9 : -2, 82] });
  parts.push({ m: 8, k: 0.2, f: (x, y, z) => Math.max(Math.hypot(x / 8.4, y / 5.9) * 5.9 - 5.9, Math.abs(z - 56) - 1.3), box: [-11, -8, 53, 11, 8, 59] }); // belt
  // crossbow: stock, prod, string, bolt
  const st0 = add(J.Wr, [-1, -3, 1.5]), st1 = add(J.Hl_, [0, 6, 0.5]);
  rc(st0, st1, 1.4, 1.0, 9, 0);
  const pc = add(st1, [0, -1, 0.3]);
  parts.push({ m: 10, k: 0, f: (x, y, z) => { const X = x - pc[0], Y = y - pc[1] + X * X * 0.025; return sdBox(X, Y, z, 0, 0, pc[2], 13, 0.7, 0.8, 0.3); }, box: [pc[0] - 15, pc[1] - 6, pc[2] - 3, pc[0] + 15, pc[1] + 3, pc[2] + 3] });
  const nock = pose === 'shot' ? add(pc, [0, -4.2, 0.2]) : add(st1, [0, -11, 0.6]); // loosed: the string slapped forward
  rc(add(pc, [-13, -4.2, 0.2]), nock, 0.18, 0.18, 11, 0); rc(add(pc, [13, -4.2, 0.2]), nock, 0.18, 0.18, 11, 0);
  if (pose !== 'shot') rc(add(st1, [0, -10, 1.3]), add(st1, [0, 3.5, 1.3]), 0.3, 0.3, 12, 0);
  if (pose === 'lock') el(add(st1, [0, 3.6, 1.4]), [0.9, 0.9, 0.9], 14, 0); // the bolt's head catching the light
  // lantern hung from a pole strapped to his back, out in front of the hat (the Order's light)
  const lan = [-3, 13, 104];
  rc([-2, -5, 58], [-3.5, -3, 112], 0.6, 0.5, 9, 0); rc([-3.5, -3, 112], [-3, 13, 113], 0.5, 0.45, 9, 0); rc([-3, 13, 113], [-3, 13, 107], 0.25, 0.25, 10, 0);
  parts.push({ m: 13, k: 0, f: (x, y, z) => sdBox(x, y, z, lan[0], lan[1], lan[2], 1.6, 1.6, 2.2, 0.3), box: [lan[0] - 3, lan[1] - 3, lan[2] - 4, lan[0] + 3, lan[1] + 3, lan[2] + 4] });
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z, nx, ny) => {
    const n = fbm3(x * 0.5, y * 0.5, z * 0.5, 3, 31);
    switch (m) {
      case 1: { // face under the brim: weathered, stubble
        let c = mix(S.skinH, mul(S.skinH, 0.65), n); if (z < J.head[2] - 2.5 && ny > 0) c = mix(c, L('#3a2c22'), 0.4);
        return { alb: c, sss: 0.4, wrap: 0.3 };
      }
      case 3: { const q = 0.5 + 0.5 * Math.sin(z * 1.6); return { alb: mix(S.gamb, S.gambD, q * 0.6 + n * 0.3), wrap: 0.3 }; } // quilted gambeson
      case 4: return { alb: mix(S.iron, S.rust, clamp(n * 2.2 - 0.7)), spec: 0.7, gloss: 45 };
      case 5: return { alb: mix(L('#3a3328'), L('#2a241c'), n), wrap: 0.2 };
      case 6: return { alb: S.leather, spec: 0.2, gloss: 20 };
      case 7: { // tabard with the sun of the Order, dirty and bloodied at the hem
        let c = mix(S.tabard, S.tabardD, clamp(n * 1.5 - 0.3));
        if (y > 0) { const dx = x, dz = z - 56; const r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
          if (r < 2.8) c = S.sun; else if (r < 3.4) c = S.sunD; else if (r < 6.2 && Math.cos(a * 8) > 0.5 - (r - 3.4) * 0.12) c = S.sun; }
        c = mix(c, S.bloodD, clamp((44 - z) / 8) * clamp(vn3(x * 0.6, y, z * 0.3, 5) * 1.6 - 0.3));
        return { alb: c, wrap: 0.3 };
      }
      case 8: return { alb: S.leather, spec: 0.2, gloss: 20 };
      case 9: return { alb: mix(S.wood, S.woodD, n), spec: 0.15, gloss: 20 };
      case 10: return { alb: S.iron, spec: 0.6, gloss: 50 };
      case 11: return { alb: L('#8a8070'), wrap: 0.5 };
      case 12: return { alb: S.iron, spec: 0.8, gloss: 60 };
      case 13: return { alb: [0.2, 0.15, 0.05], emi: [1.2, 0.6, 0.18], noAO: true, noShadow: true };
      case 14: return { alb: [0.3, 0.3, 0.3], emi: [2.2, 2, 1.6], noAO: true, noShadow: true };
    }
    return { alb: [1, 0, 1] };
  };
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.6, lantern: lan, boltTip: add(st1, [0, 3.5, 1.3]) };
}

// ---- prisoner slumped in a cage ----
export function slumped(seed = 11) {
  const J = {
    head: [1, 9, 31], neck: [0.5, 5, 35], chest: [0, 1, 30], pelvis: [0, -2, 9],
    Sr: [-8, 2, 37], Er: [-11, 6, 22], Wr: [-8, 13, 12], Hr_: [-7, 16, 8], Sl: [8, 2, 37], El: [10, 7, 22], Wl: [6, 14, 16], Hl_: [4, 16, 13],
    Hr: [-3.6, 0, 7], Kr: [-6, 16, 18], Ar: [-6, 22, 3], Tr: [-6, 28, 1], Hl: [3.6, 0, 7], Kl: [6, 17, 15], Al: [7, 26, 3], Tl: [8, 31, 1],
  };
  const b = builder(); humanoid(J, b, { thin: 0.75 });
  const sdf = partsSdf(b.parts);
  const mat = (m, x, y, z) => { let c = skinTex(S.corpse, S.corpseD, x, y, z, seed); if (vn3(x * 0.4, y * 0.4, z * 0.4, 2) > 0.62) c = mix(c, S.bloodD, 0.7); if (z > 24 && z < 40) c = mix(c, L('#3a3226'), 0.6); return { alb: c, sss: 0.3, wrap: 0.3 }; };
  return { sdf, mat, bounds: boundsOf(b.parts, 2), step: 0.6 };
}

// ================= props =================
const ironMat = (x, y, z) => { const n = vn3(x * 0.4, y * 0.4, z * 0.4, 7); return { alb: mix(S.iron, n > 0.55 ? S.rustL : S.rust, clamp(n * 1.8 - 0.4)), spec: 0.4, gloss: 30 }; };
export function cage(w = 34, d = 26, h = 62, hanging = false, chainTop = 240) {
  const parts = [];
  const bar = (a, b2, r = 0.7) => parts.push({ f: (x, y, z) => sdRC(x, y, z, a, b2, r, r), m: 1, k: 0, box: [Math.min(a[0], b2[0]) - 2, Math.min(a[1], b2[1]) - 2, Math.min(a[2], b2[2]) - 2, Math.max(a[0], b2[0]) + 2, Math.max(a[1], b2[1]) + 2, Math.max(a[2], b2[2]) + 2] });
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
  for (const z of [0.8, h]) { bar([x0, y0, z], [x1, y0, z], 1.1); bar([x0, y1, z], [x1, y1, z], 1.1); bar([x0, y0, z], [x0, y1, z], 1.1); bar([x1, y0, z], [x1, y1, z], 1.1); }
  for (let x = x0; x <= x1 + 0.1; x += w / 6) { bar([x, y0, 0], [x, y0, h]); bar([x, y1, 0], [x, y1, h]); }
  for (let y = y0 + d / 4; y < y1 - 0.1; y += d / 4) { bar([x0, y, 0], [x0, y, h]); bar([x1, y, 0], [x1, y, h]); }
  if (hanging) { bar([0, 0, h], [0, 0, chainTop], 0.6); for (const [a, b2] of [[[x0, y0, h], [0, 0, h + 14]], [[x1, y1, h], [0, 0, h + 14]], [[x0, y1, h], [0, 0, h + 14]], [[x1, y0, h], [0, 0, h + 14]]]) bar(a, b2, 0.45); }
  else parts.push({ f: (x, y, z) => sdBox(x, y, z, 0, 0, 1, w / 2, d / 2, 1, 0.3), m: 2, k: 0, box: [x0 - 2, y0 - 2, -1, x1 + 2, y1 + 2, 3] });
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => m === 2 ? { alb: mix(S.woodD, S.bloodD, 0.5), spec: 0.2, gloss: 30 } : ironMat(x, y, z);
  return { sdf, mat, bounds: boundsOf(parts, 2), step: 0.8, noSelfAO: true };
}

export function pillar(w = 46, d = 26, h = 260) {
  const sdf = (x, y, z) => {
    const bl = Math.floor(z / 26), off = (bl & 1) * 0.6;
    let dd = sdBox(x, y, z, 0, 0, h / 2, w / 2 - off, d / 2 - off, h / 2, 0.8);
    const mz = ((z % 26) + 26) % 26; if (mz < 1.2) dd += 0.6 * (1.2 - mz);
    dd = Math.min(dd, sdBox(x, y, z, 0, 0, 7, w / 2 + 3, d / 2 + 3, 7, 1.0)); // plinth
    dd -= 0.5 * (vn3(x * 0.3, y * 0.3, z * 0.3, 4) - 0.5);
    return dd;
  };
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.2, y * 0.2, z * 0.2, 3, 12);
    let c = mix(L('#4e463a'), L('#2c2620'), n);
    const mz = ((z % 26) + 26) % 26; if (mz < 1.2) c = L('#14110d');
    c = mix(c, L('#1a160f'), clamp((vn3(x * 0.1, y, z * 0.04, 2) - 0.45) * 2) * 0.8); // damp streaks
    if (z < 40) c = mix(c, L('#3a4224'), clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 5) - 0.4) * 1.2); // moss at the foot
    return { alb: c, spec: 0.05, gloss: 10 };
  };
  return { sdf, mat, bounds: [-w / 2 - 4, -d / 2 - 4, 0, w / 2 + 4, d / 2 + 4, h], step: 0.8 };
}

export function sconce(flameH = 1) { // iron bracket + dying torch head
  const parts = [];
  parts.push({ f: (x, y, z) => sdRC(x, y, z, [0, -2, 0], [0, 7, 6], 0.9, 0.9), m: 1, k: 0 });
  parts.push({ f: (x, y, z) => sdRC(x, y, z, [0, 7, 3], [0, 9, 14], 1.4, 1.9), m: 2, k: 0.5 });
  parts.push({ f: (x, y, z) => sdEll(x, y, z, 0, 9.2, 16.5, 2.2, 2.2, 2.6 * flameH), m: 3, k: 0 });
  const sdf = partsSdf(parts);
  const mat = (m, x, y, z) => m === 1 ? ironMat(x, y, z) : m === 2 ? { alb: L('#1a120c') } : { alb: [0, 0, 0], emi: [2.4, 0.9, 0.2].map(v => v * (0.6 + 0.4 * clamp((19 - z) / 4))), noAO: true, noShadow: true };
  return { sdf, mat, bounds: [-4, -4, -2, 4, 13, 21], step: 0.7, noShadow: true };
}

export function portcullis(w = 150, h = 150) {
  const sdf = (x, y, z) => {
    let d = 1e9;
    const gx = ((x % 13) + 13) % 13 - 6.5; d = Math.min(d, Math.hypot(gx, y) - 1.4 - 0.3 * vn(x * 0.1, z * 0.2, 3));
    const gz = ((z % 22) + 22) % 22 - 11; d = Math.min(d, Math.hypot(gz, y + 1.4) - 1.2);
    d = Math.max(d, Math.abs(x) - w / 2, z - h);
    // spikes at the bottom (gate hangs raised a little)
    return Math.max(d, 8 - z + (Math.abs(gx) < 2 ? 6 : 0));
  };
  const mat = (m, x, y, z) => ironMat(x, y, z);
  return { sdf, mat, bounds: [-w / 2, -4, 0, w / 2, 4, h], step: 0.8, noSelfAO: true };
}

export function skull() {
  const parts = [];
  parts.push({ f: (x, y, z) => sdEll(x, y, z, 0, 0, 3, 2.7, 3.3, 2.8), m: 1, k: 0 });
  parts.push({ f: (x, y, z) => sdRC(x, y, z, [0, 1.6, 2], [0, 3.2, 1.0], 1.9, 1.3), m: 1, k: 1 });
  for (const s of [-1, 1]) parts.push({ f: (x, y, z) => sdSphere(x, y, z, s * 1.1, 3.0, 3.0, 0.8), sub: true, k: 0.3 });
  const sdf = partsSdf(parts);
  return { sdf, mat: (m, x, y, z) => ({ alb: mix(S.tooth, L('#7a6e52'), vn3(x, y, z, 2)), spec: 0.2, gloss: 30 }), bounds: [-4, -4, 0, 4, 6, 7], step: 0.7 };
}
