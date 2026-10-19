// The four house chiefs (vampires) + rats and bats. Same construction as the hero: SDF parts, ~100 u tall.
// Local frame: x = figure's left, y = forward, z = up, feet at z = 0.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, partsSdf, clamp, lerp, sstep, vn, vn3, fbm3, h2, L, mix, mul } from '../grand/lib.mjs';

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lp = (a, b, t) => add(a, sc(sub(b, a), t));

export function builder() {
  const parts = [];
  const rc = (a, b, r1, r2, m, k = 0, ex = {}) => parts.push({ f: (x, y, z) => sdRC(x, y, z, a, b, r1, r2), m, k, box: [Math.min(a[0], b[0]) - r1 - 1, Math.min(a[1], b[1]) - r1 - 1, Math.min(a[2], b[2]) - r1 - 1, Math.max(a[0], b[0]) + r1 + 1, Math.max(a[1], b[1]) + r1 + 1, Math.max(a[2], b[2]) + r1 + 1], ...ex });
  const el = (c, r, m, k = 0, ex = {}) => parts.push({ f: (x, y, z) => sdEll(x, y, z, c[0], c[1], c[2], r[0], r[1], r[2]), m, k, box: [c[0] - r[0] - 1, c[1] - r[1] - 1, c[2] - r[2] - 1, c[0] + r[0] + 1, c[1] + r[1] + 1, c[2] + r[2] + 1], ...ex });
  const bx = (c, h, m, r = 0, k = 0, ex = {}) => parts.push({ f: (x, y, z) => sdBox(x, y, z, c[0], c[1], c[2], h[0], h[1], h[2], r), m, k, box: [c[0] - h[0] - 1, c[1] - h[1] - 1, c[2] - h[2] - 1, c[0] + h[0] + 1, c[1] + h[1] + 1, c[2] + h[2] + 1], ...ex });
  const carve = (c, r, k = 0.5) => parts.push({ f: (x, y, z) => sdSphere(x, y, z, c[0], c[1], c[2], r), sub: true, k, box: [c[0] - r - 2, c[1] - r - 2, c[2] - r - 2, c[0] + r + 2, c[1] + r + 2, c[2] + r + 2] });
  // part with its own yaw around (p) — for small rotated props
  const rot = (p, yaw, f, m, k = 0, R = 20, ex = {}) => { const c = Math.cos(yaw), s = Math.sin(yaw); parts.push({ f: (x, y, z) => { const dx = x - p[0], dy = y - p[1]; return f(c * dx + s * dy, -s * dx + c * dy, z - p[2]); }, m, k, box: [p[0] - R, p[1] - R, p[2] - R, p[0] + R, p[1] + R, p[2] + R], ...ex }); };
  return { parts, rc, el, bx, carve, rot };
}
export function boundsOf(parts, pad = 2) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of parts) if (p.box && !p.sub) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p.box[k]); b[k + 3] = Math.max(b[k + 3], p.box[k + 3]); }
  return [b[0] - pad, b[1] - pad, Math.max(b[2] - pad, -100), b[3] + pad, b[4] + pad, b[5] + pad];
}
const tab = (T, z) => { if (z <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (z <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (z - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return T[T.length - 1][1]; };

export const M = { SKIN: 1, COAT: 2, LINING: 3, SHIRT: 4, PANTS: 5, BOOT: 6, BELT: 7, HAIR: 8, CLAW: 9, METAL: 10, ACC: 11, FUR: 12, WOOD: 13, FLAME: 14, JAR: 15, BONE: 16, RAT: 17, WAX: 18, COAT2: 19, PAPER: 20 };

// garment shell around the body axis (generalised from the hero's coat)
function shell(P, s) {
  const span = P.neck[2] - P.pelvis[2];
  return { m: s.m ?? M.COAT, k: s.k ?? 1.2, pri: s.pri ?? 0.3, box: s.box || [-34, -34, (s.bottom ?? 0) - 1, 34, 34, s.top + 2], f: (x, y, z) => {
    const u = clamp((z - P.pelvis[2]) / span, -1, 1.3);
    const cx = P.pelvis[0] + (P.neck[0] - P.pelvis[0]) * Math.max(u, 0), cy = P.pelvis[1] + (P.neck[1] - P.pelvis[1]) * Math.max(u, 0) + (s.dy ? s.dy(z) : 0);
    const rx = tab(s.RX, z), ry = tab(s.RY, z);
    const X = x - cx, Y = y - cy; const phi = Math.atan2(X, Y);
    const q0 = Math.hypot(X / rx, Y / ry), q1 = Math.hypot(X / (rx * rx), Y / (ry * ry));
    let e = q0 * (q0 - 1) / Math.max(q1, 1e-4);
    const fa = sstep(s.foldTop ?? 52, (s.foldTop ?? 52) - 38, z) * (s.fold ?? 0.75);
    e -= fa * (Math.sin(phi * (s.nf ?? 6) + vn(phi * 2, z * 0.05, 3) * 4) + 0.4 * Math.sin(phi * 13 + z * 0.1)) + 0.15 * (vn3(X * 0.4, Y * 0.4, z * 0.3, 8) - 0.5);
    const th = s.solid ? lerp(s.th ?? 0.8, 30, sstep(s.solid - 4, s.solid + 4, z)) : (s.th ?? 0.8);
    let d = Math.max(e, -e - th);
    const op = s.open ? s.open(z) : 0; if (op > 0) d = Math.max(d, (op - Math.abs(phi)) * Math.min(rx, 9));
    d = Math.max(d, s.hem(phi, z) - z);
    d = Math.max(d, z - s.top);
    return d * 0.8;
  } };
}
const ragged = (base, amp, n = 24, seed = 7) => phi => { const st = Math.floor((phi + Math.PI) / (2 * Math.PI) * n); return base + h2(st, 3, seed) * amp + (h2(st, 5, seed) < 0.25 ? -amp * 0.8 : 0) + vn(phi * 20, 0, seed) * 2; };

// skull-like vampire head (from the hero), k = scale, o.nose / o.jaw tweaks
function head(b, P, o = {}) {
  const { parts, rc, el } = b;
  const H = P.head, t = P.tilt || 0, k = o.k || 1, jw = o.jaw || 1;
  const hp = (x, y, z) => [H[0] + x * k, H[1] + (y * Math.cos(t) + z * Math.sin(t)) * k, H[2] + (z * Math.cos(t) - y * Math.sin(t)) * k];
  const headBox = [H[0] - 9, H[1] - 10, H[2] - 12, H[0] + 9, H[1] + 10, H[2] + 10];
  const hb = { box: headBox };
  el(hp(0, -0.6, 1.2), [4.1 * k, 5.1 * k, 5.4 * k], M.SKIN, 0, hb);
  rc(hp(0, 1.4, -0.6), hp(0, 2.6, -5.6), 3.3 * k * jw, 1.5 * k * jw, M.SKIN, 1.6, hb);
  for (const s of [-1, 1]) {
    el(hp(s * 2.6, 2.6, -0.8), [1.3 * k, 1.2 * k, 1.0 * k], M.SKIN, 0.8, hb);
    rc(hp(s * 2.5 * jw, 0.5, -4.2), hp(s * 1.1, 2.4, -6.0), 0.9 * k, 0.7 * k, M.SKIN, 1.0, hb);
    rc(hp(s * 3.9, -0.4, 0.2), hp(s * 5.4, -1.8, 2.9), 0.6 * k, 0.12, M.SKIN, 0.4, hb);
  }
  rc(hp(-2.4, 3.6, 1.1), hp(2.4, 3.6, 1.1), 0.75 * k, 0.75 * k, M.SKIN, 0.9, hb);
  const nl = o.nose || 1;
  rc(hp(0, 4.2, 0.6), hp(0, 4.2 + 0.7 * nl, 0.6 - 2.5 * nl), 0.45 * k, 0.6 * k, M.SKIN, 0.5, hb);
  for (const s of [-1, 1]) {
    parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(s * 1.55, 4.15, 0.0), 1.05 * k), sub: true, k: 0.5, box: headBox });
    parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(s * 3.5, 2.7, -2.9), 1.35 * k), sub: true, k: 1.0, box: headBox });
  }
  parts.push({ f: (x, y, z) => sdSphere(x, y, z, ...hp(0, 4.1, -3.4), 0.5 * k), sub: true, k: 0.3, box: headBox });
  for (const s of [-1, 1]) el(hp(s * 1.5, 3.55, 0.0), [0.62 * k, 0.5 * k, 0.5 * k], M.SKIN, 0, hb);
  P._eyes = [hp(-1.5, 3.9, 0), hp(1.5, 3.9, 0)]; P._mouth = hp(0, 4.3, -3.4); P._hp = hp;
}

function hand(b, Wr, K, side, P, m = M.SKIN) {
  const { rc } = b;
  const dir = nz(sub(K, Wr));
  let sv = crs(dir, [0, 0, 1]); if (Math.hypot(...sv) < 1e-3) sv = [1, 0, 0]; sv = nz(sv);
  rc(Wr, K, 1.2, 1.0, m, 0.7);
  for (let f = 0; f < 3; f++) {
    const o = (f - 1) * 0.75, base = add(K, sc(sv, o));
    const fd = nz(add(dir, sc(sv, o * (P.spread ?? 0.4)))), len = [4.6, 5.2, 4.4][f];
    const mid = add(base, sc(fd, len * 0.55)), tip = add(mid, sc(nz(add(fd, [0, 0.35 * (P.curl ?? 0.6), -0.2])), len * 0.5));
    rc(base, mid, 0.45, 0.38, m, 0.3); rc(mid, tip, 0.36, 0.06, M.CLAW, 0.15);
  }
}

// generic vampire body: o = { w, sleeveM, armR, legs, garments: [shell specs], extra(b,P), face }
function figure(P, o) {
  const b = builder(); const { parts, rc, el } = b;
  head(b, P, o.face);
  const w = o.w || 1;
  rc(P.neck, add(P.head, [0, -0.6, -6.5]), 2.3 * w, 1.75 * w, M.SKIN, 0.8);
  el(P.chest, [7.0 * w, 3.9 * w, 7.4], M.SHIRT, 1.5);
  rc(add(P.chest, [0, -0.1, -5]), add(P.pelvis, [0, 0, 4]), 4.9 * w, 4.5 * w, M.SHIRT, 2.0);
  el(P.pelvis, [6.1 * w, 3.9 * w, 4.8], M.PANTS, 1.5);
  rc(P.neck, P.Sr, 2.4 * w, 2.2 * w, M.SHIRT, 1.5); rc(P.neck, P.Sl, 2.4 * w, 2.2 * w, M.SHIRT, 1.5);
  const ar = o.armR || 1, sm = o.sleeveM ?? M.COAT;
  for (const [S, E, Wr, K, side] of [[P.Sr, P.Er, P.Wr, P.Kr_, -1], [P.Sl, P.El, P.Wl, P.Kl_, 1]]) {
    rc(S, E, 2.4 * ar, 1.95 * ar, sm, 1.2); rc(E, Wr, 1.95 * ar, 1.5 * ar, sm, 0.8);
    rc(lp(E, Wr, 0.86), Wr, 1.8 * ar, 2.1 * ar, o.cuffM ?? sm, 0.4);
    hand(b, Wr, K, side, P);
  }
  if (o.legs !== false) for (const [Hh, K, A, T] of [[P.Hr, P.Kr, P.Ar, P.Tr], [P.Hl, P.Kl, P.Al, P.Tl]]) {
    rc(Hh, K, 3.3 * w, 2.15 * w, M.PANTS, 1.6);
    rc(lp(K, A, 0.25), A, 2.3 * w, 1.65, M.BOOT, 0.8);
    const heel = add(A, [0, -1.2, -3.0]);
    parts.push({ m: M.BOOT, k: 0.8, box: [Math.min(heel[0], T[0]) - 4, Math.min(heel[1], T[1]) - 4, -1, Math.max(heel[0], T[0]) + 4, Math.max(heel[1], T[1]) + 4, A[2] + 4], f: (x, y, z) => Math.max(sdRC(x, y, z, heel, T, 1.75, 1.1), -z) });
  }
  for (const g of o.garments || []) parts.push(shell(P, g));
  if (o.extra) o.extra(b, P);
  return { sdf: partsSdf(parts), parts, P };
}

// shared skin: pale, veins, ember eyes, dark mouth + fangs, blood at the mouth
const SK = { skin: L('#c9c4b0'), skinD: L('#928c78'), vein: L('#6e7470'), blood: L('#5e0710'), bloodD: L('#350608'), bone: L('#d8cdb0'), claw: L('#2b241a') };
function skinMat(P, x, y, z, o = {}) {
  for (const e of P._eyes) if (Math.hypot(x - e[0], y - e[1], z - e[2]) < 0.95) return { alb: [0.05, 0, 0], emi: o.eye || [1.1, 0.06, 0.03], noAO: true, wrap: 0 };
  const n = fbm3(x * 0.6, y * 0.6, z * 0.6, 3, 11);
  let c = mix(o.skin || SK.skin, o.skinD || SK.skinD, clamp(n * 1.4 - 0.3));
  if (vn3(x * 1.3, y * 1.3, z * 0.5, 21) > 0.72) c = mix(c, SK.vein, 0.35);
  const mo = P._mouth, dx = x - mo[0], dz = z - mo[2];
  if (y > mo[1] - 2.2 && Math.abs(dx) < 1.5 && Math.abs(dz) < 0.45) return { alb: SK.bloodD, spec: 0.2, gloss: 40 };
  if (y > mo[1] - 2.2 && Math.abs(Math.abs(dx) - 0.75) < 0.35 && dz < -0.3 && dz > -1.3) return { alb: SK.bone, spec: 0.4, gloss: 50 };
  if (o.scars && vn3(x * 0.8, y * 0.8, z * 0.25, 77) > 0.74) c = mix(c, L('#7a5a50'), 0.6);
  return { alb: c, sss: 0.5, wrap: 0.3, spec: 0.08, gloss: 18 };
}
const cloth = (a, b2, x, y, z, seed, extra = {}) => ({ alb: mix(a, b2, clamp(fbm3(x * 0.5, y * 0.5, z * 0.5, 3, seed) * 1.6 - 0.3)), wrap: 0.3, spec: 0.05, gloss: 12, ...extra });
const metal = (a, x, y, z) => ({ alb: mix(a, mul(a, 0.55), vn3(x, y, z, 5)), spec: 0.8, gloss: 50 });
const flame = { alb: [0, 0, 0], emi: [2.6, 1.2, 0.3], noAO: true, noShadow: true, rim: 0 };
const bloodJar = (x, y, z) => ({ alb: mix(L('#3a0408'), L('#5a0a10'), vn3(x, y, z, 3)), spec: 0.9, gloss: 80, wrap: 0 });
const WOOD = [L('#3a2818'), L('#20160d')];

// =============== VESNA LA GRISE — Maison du Rat ===============
// old, hunched, hooded in grey rags, cane in the right hand, a jar of blood held out in the left; silver trinkets
export function vesna() {
  const P = {
    head: [0, 10.5, 72], tilt: 0.15, neck: [0, 6.5, 66], chest: [0, 4, 57], pelvis: [0, 0, 40],
    Sr: [-8, 3, 62], Er: [-11.5, 7, 50], Wr: [-11, 11, 43], Kr_: [-11, 13, 41.5],
    Sl: [8, 3, 62], El: [10.5, 9, 52], Wl: [6.5, 15, 55], Kl_: [5, 18, 56],
    Hr: [-3.5, 0, 39], Kr: [-3.8, 2, 21], Ar: [-3.8, 0, 4], Tr: [-4.2, 5.5, 1],
    Hl: [3.5, 0, 39], Kl: [3.8, 2, 21], Al: [4, 0, 4], Tl: [4.4, 5.5, 1], curl: 1.0,
  };
  const jar = [3.5, 20.5, 55];
  const f = figure(P, {
    w: 1.05, legs: false, face: { nose: 1.6, k: 0.95 },
    garments: [
      { m: M.COAT2, RX: [[0, 12.5], [14, 11.5], [30, 9.5], [40, 8.2], [50, 8]], RY: [[0, 11], [14, 10], [30, 8], [40, 6.5], [50, 6]], top: 48, solid: 36, hem: ragged(1.5, 3, 30, 3), fold: 0.9, foldTop: 40 }, // skirt
      { m: M.COAT, RX: [[30, 14], [44, 13], [56, 12.5], [62, 11], [67, 6.5]], RY: [[30, 10], [44, 9.5], [56, 9], [62, 8], [67, 5]], top: 67.5, solid: 0, th: 1.4, k: 1.0,
        hem: phi => 50 - 14 * Math.pow(Math.abs(phi) / Math.PI, 1.6) + (h2(Math.floor(phi * 9 + 40), 1, 4) - 0.5) * 4, open: z => z < 58 ? 0.35 : 0, fold: 0.5, foldTop: 66 }, // shawl
    ],
    extra: (b, P) => {
      const hp = P._hp; const { parts, rc, el } = b;
      // hood: ellipsoid shell, face window carved
      parts.push({ m: M.COAT, k: 0.8, box: [P.head[0] - 10, P.head[1] - 12, P.head[2] - 12, P.head[0] + 10, P.head[1] + 10, P.head[2] + 11], f: (x, y, z) => {
        const c = hp(0, -1.6, 1.0); let d = sdEll(x, y, z, c[0], c[1], c[2], 6.0, 7.2, 7.4);
        d = smax(d, -sdEll(x, y, z, ...hp(0, 5.5, -1.5), 4.6, 5.5, 6.2), 0.8);
        d += 0.25 * vn3(x * 0.6, y * 0.6, z * 0.6, 4);
        return d;
      } });
      rc(hp(0, -4, -2), add(P.neck, [0, -4.5, -2]), 3.5, 4.5, M.COAT, 2.0); // hood drape onto the back
      for (const s of [-1, 1]) rc(hp(s * 3.4, 2.4, 1.6), hp(s * 3.9, 3.4, -7.5), 0.6, 0.3, M.HAIR, 0.3); // grey locks
      rc(hp(-0.8, 1, -3), hp(0, 4.2, -6.4), 1.2, 0.9, M.SKIN, 0.8); // pointed chin
      // cane
      rc([-12.5, 15, 0], [-11.3, 12.6, 46], 0.75, 0.75, M.WOOD, 0);
      el([-11.3, 12.6, 46.5], [1.6, 1.6, 1.4], M.METAL, 0.3);
      // blood jar in the left hand
      parts.push({ m: M.JAR, k: 0.2, f: (x, y, z) => Math.max(Math.hypot(x - jar[0], y - jar[1]) - 2.6, Math.abs(z - jar[2]) - 3.4) - 0.3, box: [jar[0] - 4, jar[1] - 4, jar[2] - 5, jar[0] + 4, jar[1] + 4, jar[2] + 5] });
      rc(add(jar, [0, 0, 3.6]), add(jar, [0, 0, 4.6]), 2.0, 1.9, M.WOOD, 0.2);
      // silver: chain of coins and a rat skull at the throat, rings on the cane hand
      for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; el([Math.sin(a) * 6.5, 5.5 + Math.cos(a) * 5.2, 59 - Math.cos(a) * 3.5], [0.85, 0.5, 0.85], M.METAL, 0); }
      el([0, 11.5, 55], [1.3, 1.5, 1.1], M.BONE, 0.2);
      // a sack on the back
      el([3, -9, 44], [6, 4.5, 7], M.COAT2, 2.0);
    },
  });
  const C = { shawl: L('#67625a'), shawlD: L('#36332e'), skirt: L('#38332c'), skirtD: L('#1f1c18'), silver: L('#a9aaa2'), hair: L('#9a968c') };
  const mat = (m, x, y, z, nx, ny, nz_) => {
    switch (m) {
      case M.SKIN: return skinMat(P, x, y, z, { skin: L('#bdb8a4'), skinD: L('#837e6a') });
      case M.COAT: { let r = cloth(C.shawl, C.shawlD, x, y, z, 41); if (vn3(x * 0.25, y * 0.25, z * 0.25, 9) > 0.66) r.alb = mix(r.alb, L('#4a4234'), 0.6); // patches
        if (z < 58 && Math.floor(z * 1.2) % 3 === 0 && Math.abs(Math.sin(Math.atan2(x, y) * 30)) > 0.7) r.alb = mul(r.alb, 0.6); return r; }
      case M.COAT2: { const r = cloth(C.skirt, C.skirtD, x, y, z, 43); if (z < 9) r.alb = mix(r.alb, L('#1a120c'), 0.6); if (z < 14 && vn3(x * 0.6, y * 0.6, z * 0.4, 5) > 0.62) r.alb = mix(r.alb, SK.bloodD, 0.8); return r; }
      case M.HAIR: return { alb: C.hair, wrap: 0.3, spec: 0.1 };
      case M.METAL: return metal(C.silver, x, y, z);
      case M.JAR: return bloodJar(x, y, z);
      case M.WOOD: return cloth(WOOD[0], WOOD[1], x, y, z, 3, { spec: 0.15 });
      case M.BONE: return { alb: SK.bone, spec: 0.2, gloss: 30 };
      case M.CLAW: return { alb: SK.claw, spec: 0.4, gloss: 40 };
      default: return cloth(C.skirt, C.skirtD, x, y, z, 45);
    }
  };
  return { sdf: f.sdf, mat, bounds: boundsOf(f.parts, 3), P, step: 0.6, name: 'vesna' };
}

// =============== SÉVERIN D'OMBRELUNE — Maison de la Brume ===============
// tall, straight, fitted long coat + shoulder capelet in faded violet, high collar, silver hair tied back, rapier
export function severin() {
  const s = 1.07, S = a => [a[0], a[1], a[2] * s];
  const P = {
    head: S([0, 0.6, 93]), tilt: -0.12, neck: S([0, 0.2, 82.5]), chest: S([0, 0.3, 72]), pelvis: S([0, 0, 51.5]),
    Sr: S([-7.8, -0.2, 79]), Er: S([-9.6, 2.5, 62]), Wr: S([-8.5, 9, 51]), Kr_: S([-8.4, 11, 50]),
    Sl: S([7.8, -0.2, 79]), El: S([11.5, -3.5, 63]), Wl: S([5, -8, 56]), Kl_: S([2.5, -9, 55]),
    Hr: S([-3.3, 0, 50]), Kr: S([-3.6, 1.4, 27.5]), Ar: S([-3.7, -0.4, 5]), Tr: S([-4.6, 6.2, 1.2]),
    Hl: S([3.3, 0, 50]), Kl: S([4.6, 0.5, 27.5]), Al: S([5.8, -0.6, 5]), Tl: S([8.5, 4.8, 1.2]), curl: 0.3,
  };
  const f = figure(P, {
    w: 0.88, armR: 0.9, face: { nose: 1.15 },
    garments: [
      { m: M.COAT, RX: [[14, 9.4], [30, 8.2], [46, 7.0], [54, 6.4], [62, 6.6], [72, 7.6], [80, 8.0], [85, 7.0], [88.5, 4.2]].map(([z, r]) => [z * s, r]),
        RY: [[14, 8.2], [30, 7.2], [46, 5.6], [54, 5.0], [62, 4.9], [72, 4.9], [80, 4.6], [85, 4.2], [88.5, 3.3]].map(([z, r]) => [z * s, r]),
        top: 88.5 * s, solid: 57 * s, hem: ragged(16 * s, 3, 20, 9), open: z => z > 60 * s ? 0.12 : z > 54 * s ? 0.3 : 0.75, fold: 0.5 },
      { m: M.COAT, RX: [[64, 13.5], [74, 12.0], [82, 10.0], [87, 5.5]].map(([z, r]) => [z * s, r]), RY: [[64, 9.5], [74, 8.5], [82, 7.0], [87, 4.4]].map(([z, r]) => [z * s, r]),
        top: 87 * s, th: 1.0, k: 0.6, hem: phi => (66 + 2.5 * Math.abs(Math.sin(phi * 4))) * s, fold: 0.3, foldTop: 90 * s, open: z => 0.2 }, // capelet
    ],
    extra: (b, P) => {
      const hp = P._hp; const { parts, rc, el } = b;
      // hair: smooth silver cap, swept back, low tail with a violet ribbon
      parts.push({ m: M.HAIR, k: 0.5, box: [P.head[0] - 9, P.head[1] - 10, P.head[2] - 10, P.head[0] + 9, P.head[1] + 9, P.head[2] + 9], f: (x, y, z) => {
        const c = hp(0, -1.2, 1.6); let d = sdEll(x, y, z, c[0], c[1], c[2], 4.6, 5.6, 5.6);
        const fw = hp(0, 4.5, -2.2); d = smax(d, -sdEll(x, y, z, fw[0], fw[1], fw[2], 3.9, 5.0, 4.4), 0.6);
        return d + 0.12 * Math.abs(Math.sin(Math.atan2(x - P.head[0], z - P.head[2]) * 14));
      } });
      rc(hp(0, -5.6, -1.5), hp(0, -7.5, -17), 1.5, 0.6, M.HAIR, 0.5);
      el(hp(0, -6.2, -3.2), [1.8, 1.2, 1.2], M.ACC, 0.2);
      // high stand collar
      parts.push({ m: M.COAT, k: 0.8, box: [P.neck[0] - 9, P.neck[1] - 9, P.neck[2] - 6, P.neck[0] + 9, P.neck[1] + 8, P.neck[2] + 11], f: (x, y, z) => {
        const X = x - P.neck[0], Y = y - P.neck[1] + 0.6; const r = 4.4 + (z - P.neck[2] + 3) * 0.25;
        let d = Math.abs(Math.hypot(X, Y * 1.1) - r) - 0.6; d = Math.max(d, Math.abs(z - P.neck[2] - 2) - 5.5 + Math.max(0, Y + 1) * 1.4); return Math.max(d, Y - 2.6);
      } });
      el(add(P.neck, [0, 3.2, -2.5]), [2.2, 1.2, 2.6], M.SHIRT, 0.8); // cravat
      // rapier: point resting on the floor, hand on the cup hilt
      const pom = add(P.Kr_, [-0.6, 1.0, 2.5]), tip = [-12.5, 17, 0.2];
      rc(pom, lp(pom, tip, 0.11), 0.65, 0.65, M.METAL, 0);
      el(lp(pom, tip, 0.12), [2.4, 2.4, 1.2], M.METAL, 0.3);
      rc(add(lp(pom, tip, 0.13), [-4, 0, 0]), add(lp(pom, tip, 0.13), [4, 0, 0]), 0.4, 0.4, M.METAL, 0);
      rc(lp(pom, tip, 0.13), tip, 0.45, 0.2, M.METAL, 0);
      // silver buttons
      for (let i = 0; i < 5; i++) el([0, 5.2 - i * 0.15, (78 - i * 4.5) * s], [0.6, 0.5, 0.6], M.METAL, 0);
    },
  });
  const C = { coat: L('#5a5068'), coatD: L('#2f2938'), lining: L('#4a2c56'), shirt: L('#b8b2a8'), hair: L('#d4d0c8'), steel: L('#9aa0a0'), boot: L('#1c1a1c'), ribbon: L('#8a6aa0'), pants: L('#2a2630') };
  const mat = (m, x, y, z, nx, ny, nz_) => {
    switch (m) {
      case M.SKIN: return skinMat(P, x, y, z, { skin: L('#d6d2c4'), eye: [0.9, 0.12, 0.3] });
      case M.COAT: { const inner = (nx * x + ny * y) < -0.2 && z < 60 * s; if (inner) return cloth(C.lining, mul(C.lining, 0.5), x, y, z, 7, { spec: 0.15, gloss: 25 });
        const r = cloth(C.coat, C.coatD, x, y, z, 51, { spec: 0.1, gloss: 20 });
        if (Math.abs(z - 66 * s) < 0.7 || (z < 26 * s && z > 21 * s && vn3(x, y, z, 3) > 0.5)) r.alb = mix(r.alb, L('#8a7a50'), 0.5); // faded braid trim
        if (z < 20 * s) r.alb = mix(r.alb, L('#24201a'), clamp((20 * s - z) / 10) * 0.6);
        if (vn3(x * 0.3, y * 0.3, z * 0.3, 15) > 0.7) r.alb = mul(r.alb, 0.6); // moth-eaten
        return r; }
      case M.SHIRT: return cloth(C.shirt, mul(C.shirt, 0.6), x, y, z, 52);
      case M.HAIR: return { alb: mix(C.hair, mul(C.hair, 0.7), vn3(x, y, z * 3, 6)), spec: 0.3, gloss: 30, wrap: 0.2 };
      case M.ACC: return cloth(C.ribbon, mul(C.ribbon, 0.6), x, y, z, 3);
      case M.METAL: return metal(C.steel, x, y, z);
      case M.BOOT: return { alb: C.boot, spec: 0.5, gloss: 40 };
      case M.PANTS: return cloth(C.pants, mul(C.pants, 0.6), x, y, z, 54);
      case M.CLAW: return { alb: SK.claw, spec: 0.4, gloss: 40 };
      default: return cloth(C.coat, C.coatD, x, y, z, 55);
    }
  };
  return { sdf: f.sdf, mat, bounds: boundsOf(f.parts, 3), P, step: 0.6, name: 'severin' };
}

// =============== MAGDA CROC-DE-FER — Maison du Loup ===============
// broad, fists on hips, wolf pelt mantle with the wolf's head as a hood (ears up), rust-red braids, bare scarred arms
export function magda() {
  const P = {
    head: [0, 1.6, 92], tilt: 0.06, neck: [0, 0.8, 82], chest: [0, 0.8, 71], pelvis: [0, 0, 50.5],
    Sr: [-10, -0.2, 79], Er: [-17.5, -2.5, 64], Wr: [-11.5, 1.5, 53.5], Kr_: [-9.5, 3.2, 52],
    Sl: [10, -0.2, 79], El: [17.5, -2.5, 64], Wl: [11.5, 1.5, 53.5], Kl_: [9.5, 3.2, 52],
    Hr: [-4.2, 0, 49], Kr: [-7.5, 2, 27], Ar: [-9.5, 0, 5], Tr: [-11.5, 5.5, 1.2],
    Hl: [4.2, 0, 49], Kl: [7.5, 2, 27], Al: [9.5, 0, 5], Tl: [11.5, 5.5, 1.2], curl: 1.2, spread: 0.1,
  };
  const f = figure(P, {
    w: 1.28, armR: 1.35, sleeveM: M.SKIN, cuffM: M.METAL, face: { jaw: 1.2, k: 1.05 },
    garments: [
      { m: M.COAT2, RX: [[24, 10.5], [36, 9.5], [46, 8.4], [54, 8.0]], RY: [[24, 8], [36, 7.4], [46, 6.0], [54, 5.6]], top: 54, solid: 50, hem: ragged(26, 6, 14, 21), open: z => 0.25, fold: 0.3, foldTop: 50 }, // leather strip skirt
      { m: M.FUR, RX: [[50, 12.5], [62, 13.0], [70, 14.0], [78, 13.0], [84, 9.0], [87, 5.5]], RY: [[50, 8.5], [62, 9.5], [70, 9.5], [78, 9.0], [84, 7.0], [87, 4.5]], top: 87, th: 2.2, k: 1.0,
        hem: phi => 71 - 6 * Math.max(0, Math.cos(phi)) - 19 * Math.max(0, -Math.cos(phi)) + (vn(phi * 9, 0, 13) - 0.5) * 6, open: z => z < 80 ? 0.55 : 0, fold: 0.6, foldTop: 90, nf: 9 }, // pelt mantle
    ],
    extra: (b, P) => {
      const hp = P._hp; const { parts, rc, el, carve } = b;
      // wolf head worn as a hood: skull cap, snout over the brow, ears up
      el(hp(0, -0.6, 3.6), [5.4, 6.4, 4.2], M.FUR, 1.0);
      rc(hp(0, 1.5, 4.2), hp(0, 9.5, 2.4), 3.2, 1.4, M.FUR, 1.2);
      el(hp(0, 9.8, 2.6), [1.0, 0.8, 0.8], M.CLAW, 0.2); // wolf's nose
      for (const s of [-1, 1]) { rc(hp(s * 3.2, -1, 6.2), hp(s * 4.4, -1.6, 12.4), 1.8, 0.2, M.FUR, 0.6); el(hp(s * 2.0, 6.4, 3.8), [0.6, 0.5, 0.4], M.BONE, 0); }
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) rc(hp(s * 1.6 + s * i * 0.9, 9 - i * 1.7, 1.2), hp(s * 1.6 + s * i * 0.9, 9 - i * 1.7, -0.6), 0.35, 0.08, M.BONE, 0); // wolf teeth over the brow
      // two thick rust braids over the shoulders, down the chest
      for (const s of [-1, 1]) { let p = hp(s * 4.2, 0.5, -1.5); for (let i = 0; i < 7; i++) { const q = [p[0] + s * (i < 2 ? 0.9 : 0.1), p[1] + (i < 2 ? 1.5 : 0.7), p[2] - 3.4]; el(lp(p, q, 0.5), [1.6 - i * 0.08, 1.5 - i * 0.08, 2.0], M.HAIR, 0.6); p = q; } el(add(p, [0, 0, -0.5]), [0.9, 0.9, 1.0], M.METAL, 0.2); }
      // leather harness, belt, wide iron bracers
      parts.push({ m: M.BELT, k: 0.3, box: [-12, -9, 52, 12, 9, 60], f: (x, y, z) => Math.max(Math.abs(Math.hypot(x / 7.9, y / 5.6) * 5.6 - 5.6) - 0.8, Math.abs(z - 55.5) - 1.8) });
      rc([-7, 4.4, 79], [6, 5.2, 58], 0.9, 0.9, M.BELT, 0.3); rc([-7, -4.2, 79], [6, -5.0, 58], 0.9, 0.9, M.BELT, 0.3);
      el([0, 5.6, 55.5], [2, 0.8, 2.2], M.METAL, 0.2);
      // fur boot wraps
      for (const [K, A] of [[P.Kr, P.Ar], [P.Kl, P.Al]]) rc(lp(K, A, 0.25), lp(K, A, 0.75), 3.2, 2.7, M.FUR, 1.0);
      // a heavy chain looped from the belt, a wolf fang hanging at the throat
      for (let i = 0; i < 9; i++) { const t = i / 8; el([12 + Math.sin(t * 3.1) * 1.5, 3 + t * 2, 54 - Math.sin(t * Math.PI) * 13], [1.3, 0.7, 1.0], M.METAL, 0); }
      rc(add(P.neck, [0, 4.6, -4]), add(P.neck, [0, 5.2, -7.5]), 0.6, 0.15, M.BONE, 0);
    },
  });
  const C = { fur: L('#5a4c3c'), furD: L('#2a2018'), furR: L('#6a3a22'), leather: L('#3a2418'), leatherD: L('#1e130c'), hair: L('#7e3216'), hairD: L('#3e160a'), iron: L('#4a4642') };
  const mat = (m, x, y, z, nx, ny, nz_) => {
    switch (m) {
      case M.SKIN: { const r = skinMat(P, x, y, z, { skin: L('#c2b8a2'), skinD: L('#8a7e68'), scars: true });
        if (z < 58 && z > 50 && Math.abs(Math.abs(x) - 10) < 4) r.alb = mix(r.alb, SK.blood, 0.55); // bloody knuckles
        return r; }
      case M.FUR: { const st = vn3(x * 1.8, y * 1.8, z * 0.35, 31); let c = mix(C.fur, C.furD, clamp(st * 1.5 - 0.3)); c = mix(c, C.furR, clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 2) - 0.35) * 1.4);
        return { alb: c, wrap: 0.4, spec: 0.05, gloss: 8, n: undefined }; }
      case M.HAIR: return { alb: mix(C.hair, C.hairD, clamp(vn3(x * 2, y * 2, z * 2, 9) * 1.5 - 0.4)), spec: 0.15, gloss: 20, wrap: 0.3 };
      case M.COAT2: case M.BELT: { const r = cloth(C.leather, C.leatherD, x, y, z, 61, { spec: 0.25, gloss: 25 }); if (z < 34 && vn3(x * 0.6, y * 0.6, z * 0.4, 5) > 0.6) r.alb = mix(r.alb, SK.bloodD, 0.8); return r; }
      case M.METAL: return metal(C.iron, x, y, z);
      case M.BONE: return { alb: SK.bone, spec: 0.3, gloss: 30 };
      case M.CLAW: return { alb: L('#141010'), spec: 0.5, gloss: 40 };
      case M.BOOT: return cloth(C.leather, C.leatherD, x, y, z, 62, { spec: 0.2 });
      case M.PANTS: return cloth(L('#2e2620'), L('#1a1510'), x, y, z, 63);
      default: return cloth(C.leather, C.leatherD, x, y, z, 64);
    }
  };
  return { sdf: f.sdf, mat, bounds: boundsOf(f.parts, 3), P, step: 0.6, name: 'magda' };
}

// =============== LUCIAN NOCTULE — Maison de la Chauve-souris ===============
// youngest: slight, head tilted up toward the bats, scalloped bat-wing cape in night blue, candle held up, rolled map
export function lucian() {
  const s = 0.94, S = a => [a[0], a[1], a[2] * s];
  const P = {
    head: S([0, 0.2, 92.5]), tilt: -0.42, neck: S([0, 0.0, 82.5]), chest: S([0, 0.3, 72]), pelvis: S([0, 0, 51.5]),
    Sr: S([-7.2, -0.2, 79]), Er: S([-9.5, 4, 64]), Wr: S([-6, 10.5, 67]), Kr_: S([-5, 12.5, 68.5]),
    Sl: S([7.2, -0.2, 79]), El: S([9.4, 1.5, 62]), Wl: S([9.5, 4, 47]), Kl_: S([9.6, 5.5, 44]),
    Hr: S([-3.2, 0, 50]), Kr: S([-3.6, 1.6, 27.5]), Ar: S([-3.7, -0.6, 5]), Tr: S([-4.3, 6, 1.2]),
    Hl: S([3.2, 0, 50]), Kl: S([3.5, 0.6, 27.5]), Al: S([3.9, -0.6, 5]), Tl: S([4.6, 6, 1.2]), curl: 1.0,
  };
  const candle = add(P.Kr_, [0.6, 1.8, -1]);
  const f = figure(P, {
    w: 0.86, armR: 0.85, sleeveM: M.SHIRT, face: { k: 0.96 },
    garments: [
      // bat-wing cape: bell from the shoulders, wide open in front, hem scalloped between "finger" ribs
      { m: M.COAT, RX: [[4, 23], [20, 20], [40, 15.5], [60, 11.5], [72, 10.5], [79, 9.4], [83, 5.0]].map(([z, r]) => [z * s, r]), RY: [[4, 15], [20, 13], [40, 10], [60, 7], [72, 5.8], [79, 5.0], [83, 3.6]].map(([z, r]) => [z * s, r]),
        top: 83 * s, th: 1.0, hem: phi => { const u = ((phi / Math.PI * 4.5) % 1 + 1) % 1; return (5 + 12 * Math.sqrt(Math.sin(u * Math.PI))) * s; },
        open: z => z > 75 * s ? 0.5 : 1.25, fold: 0.6, foldTop: 70 * s, nf: 9 },
    ],
    extra: (b, P) => {
      const hp = P._hp; const { parts, rc, el } = b;
      // messy blue-black hair with a fringe
      parts.push({ m: M.HAIR, k: 0.5, box: [P.head[0] - 10, P.head[1] - 11, P.head[2] - 12, P.head[0] + 10, P.head[1] + 10, P.head[2] + 10], f: (x, y, z) => {
        const c = hp(0, -0.8, 1.6); let d = sdEll(x, y, z, c[0], c[1], c[2], 5.0, 6.0, 6.1);
        d -= 0.7 * vn3(x * 0.9, y * 0.9, z * 0.9, 12);
        const fw = hp(0, 5.0, -3.0); d = smax(d, -sdEll(x, y, z, fw[0], fw[1], fw[2], 4.0, 5.0, 4.4), 0.6);
        const nape = hp(0, -3.5, -5.5); d = smin(d, sdEll(x, y, z, nape[0], nape[1], nape[2], 3.6, 2.4, 3.2), 1.0);
        return d;
      } });
      // cape clasp + collar points
      for (const sd of [-1, 1]) rc(add(P.neck, [sd * 4, 1.5, -2]), add(P.neck, [sd * 6.5, 1.0, 5.5]), 1.0, 0.2, M.COAT, 0.6);
      el(add(P.neck, [0, 3.6, -3.5]), [1.2, 0.6, 1.2], M.METAL, 0);
      // candle in a little iron holder
      rc(add(candle, [0, 0, -1.5]), add(candle, [0, 0, 0]), 1.8, 1.8, M.METAL, 0);
      rc(candle, add(candle, [0, 0, 5]), 0.8, 0.75, M.WAX, 0);
      el(add(candle, [0, 0, 6.6]), [0.7, 0.7, 1.5], M.FLAME, 0);
      // rolled map in the left hand
      rc(add(P.Kl_, [-1, -4, 1]), add(P.Kl_, [1.5, 7, -2]), 1.5, 1.5, M.PAPER, 0);
    },
  });
  P._candle = add(candle, [0, 0, 6.6]);
  const C = { cape: L('#1a2234'), capeD: L('#0a0c14'), lining: L('#2a3656'), shirt: L('#2a2c38'), hair: L('#0c0e16'), pants: L('#16161c') };
  const mat = (m, x, y, z, nx, ny, nz_) => {
    switch (m) {
      case M.SKIN: return skinMat(P, x, y, z, { skin: L('#d0ccbe') });
      case M.COAT: { const inner = (nx * x + ny * y) < -0.2 && z < 74 * s; if (inner) return cloth(C.lining, mul(C.lining, 0.4), x, y, z, 7, { spec: 0.1 });
        const r = cloth(C.cape, C.capeD, x, y, z, 71, { spec: 0.12, gloss: 22 }); const ph = Math.atan2(x, y), u = ((ph / Math.PI * 4.5) % 1 + 1) % 1;
        if (Math.min(u, 1 - u) < 0.06 && z < 70 * s) r.alb = mul(r.alb, 0.45); // wing ribs
        return r; }
      case M.SHIRT: return cloth(C.shirt, mul(C.shirt, 0.5), x, y, z, 72);
      case M.HAIR: return { alb: mix(C.hair, L('#1c2232'), vn3(x * 2, y * 2, z * 2, 6)), spec: 0.2, gloss: 25, wrap: 0, rim: 0.5 };
      case M.PANTS: case M.BOOT: return cloth(C.pants, mul(C.pants, 0.6), x, y, z, 73, { spec: m === M.BOOT ? 0.3 : 0.05 });
      case M.METAL: return metal(L('#3a3632'), x, y, z);
      case M.WAX: return { alb: L('#d8ceb0'), sss: 0.8, wrap: 0.5 };
      case M.FLAME: return flame;
      case M.PAPER: return cloth(L('#b4a684'), L('#7a6c50'), x, y, z, 2);
      case M.CLAW: return { alb: SK.claw, spec: 0.4, gloss: 40 };
      default: return cloth(C.cape, C.capeD, x, y, z, 75);
    }
  };
  return { sdf: f.sdf, mat, bounds: boundsOf(f.parts, 3), P, step: 0.6, name: 'lucian' };
}

// =============== critters (added as parts to a shared builder) ===============
export function ratSdf(X, Y, Z) { // ~10 u body + tail, nose along +Y
  let d = sdEll(X, Y, Z, 0, 0, 2.3, 2.2, 4.4, 2.3);
  d = smin(d, sdRC(X, Y, Z, [0, 3.2, 2.7], [0, 7.4, 1.7], 1.7, 0.45), 1.0);
  d = Math.min(d, sdSphere(X, Y, Z, -1.0, 4.4, 4.0, 0.85), sdSphere(X, Y, Z, 1.0, 4.4, 4.0, 0.85));
  d = Math.min(d, sdRC(X, Y, Z, [0, -3.8, 1.6], [1.6, -8.5, 0.6], 0.6, 0.45), sdRC(X, Y, Z, [1.6, -8.5, 0.6], [4.5, -11.5, 0.5], 0.45, 0.35));
  return d;
}
export const ratMat = (x, y, z, X, Y) => (Y < -4 ? { alb: L('#8a6e64'), wrap: 0.3, sss: 0.4 } : { alb: mix(L('#4a4640'), L('#24221e'), vn3(x * 1.5, y * 1.5, z * 1.5, 4)), wrap: 0.4, spec: 0.1, gloss: 20 });
export function rats(list) { // list of [x, y, z, yaw]
  const b = builder();
  for (const [x, y, z, yaw] of list) b.rot([x, y, z], yaw, ratSdf, M.RAT, 0, 14);
  const sdf = partsSdf(b.parts);
  return { sdf, mat: (m, x, y, z) => { const r = vn3(x * 1.5, y * 1.5, z * 1.5, 4); return { alb: mix(L('#4e4a44'), L('#24221e'), r), wrap: 0.4, spec: 0.12, gloss: 20 }; }, bounds: boundsOf(b.parts, 2), step: 0.7 };
}

function sdPoly2(px, py, v) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey)); const bx = wx - ex * t, by = wy - ey * t; d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
export { sdPoly2 };
const extrude = (d2, z, h) => { const w0 = d2, w1 = Math.abs(z) - h; return Math.min(Math.max(w0, w1), 0) + Math.hypot(Math.max(w0, 0), Math.max(w1, 0)); };
export { extrude };
// bats: hanging (upside down from z=top) or flying (wings spread)
const WING = [[1, 2.5], [5, 4.2], [10, 5.5], [15, 2.5], [12.5, -0.6], [10, 1.2], [7.5, -1.8], [5, 0.4], [2.5, -1.4], [1, -1]];
export function batSdf(kind) {
  if (kind === 'hang') return (X, Y, Z) => { // origin = feet on the beam
    let d = sdEll(X, Y, Z, 0, 0, -5.2, 2.6, 2.2, 4.4);               // wrapped wings
    d = smin(d, sdEll(X, Y, Z, 0, 0.4, -10.2, 1.6, 1.5, 1.6), 0.6);  // head, hanging down
    d = Math.min(d, sdRC(X, Y, Z, [-0.8, 0.4, -11], [-1.5, 0.4, -13.2], 0.5, 0.1), sdRC(X, Y, Z, [0.8, 0.4, -11], [1.5, 0.4, -13.2], 0.5, 0.1));
    d = Math.min(d, sdRC(X, Y, Z, [-0.7, 0, -1.2], [-0.5, 0, 0.5], 0.3, 0.3), sdRC(X, Y, Z, [0.7, 0, -1.2], [0.5, 0, 0.5], 0.3, 0.3));
    return d;
  };
  return (X, Y, Z) => { // flying, wings up-swept; origin = body centre
    let d = sdEll(X, Y, Z, 0, 0, 0, 1.6, 3.0, 1.5);
    d = smin(d, sdSphere(X, Y, Z, 0, 3.3, 0.3, 1.3), 0.5);
    d = Math.min(d, sdRC(X, Y, Z, [-0.7, 3.5, 1.2], [-1.1, 3.9, 3.0], 0.45, 0.1), sdRC(X, Y, Z, [0.7, 3.5, 1.2], [1.1, 3.9, 3.0], 0.45, 0.1));
    const ax = Math.abs(X), up = 0.12; // dihedral
    const wx = ax * Math.cos(up) + 0 , wz = Z - ax * Math.sin(up);
    const w = extrude(sdPoly2(wx, Y, WING), wz, 0.35);
    return Math.min(d, w);
  };
}
export function bats(list) { // [x, y, z, yaw, kind]
  const b = builder();
  for (const [x, y, z, yaw, kind] of list) { const f = batSdf(kind), k = kind === 'fly' ? 1.35 : 1.6; b.rot([x, y, z], yaw, (X, Y, Z) => f(X / k, Y / k, Z / k) * k, M.FUR, 0, 30); }
  return { sdf: partsSdf(b.parts), mat: (m, x, y, z) => ({ alb: mix(L('#1a1614'), L('#2e2420'), vn3(x, y, z, 3)), wrap: 0.2, spec: 0.15, gloss: 20, rim: 1.2 }), bounds: boundsOf(b.parts, 2), step: 0.6 };
}
