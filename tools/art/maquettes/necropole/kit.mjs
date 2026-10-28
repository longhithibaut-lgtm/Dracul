// Shared pieces for the necropolis's foes (mockup only): vector helpers, oriented shapes, the materials the props share,
// a lying corpse, a grave mound, a cross, a stele. Conventions as ../ennemis/foes.mjs: x = their left, y = forward, z = up,
// feet at z = 0, the hero ~100 tall.
import { sdEll, sdBox, clamp, lerp, vn, vn3, fbm3, L, mix, mul, mulberry32 } from '../ennemis/lib.mjs';
import { humanoid, std, S, skinTex } from '../ennemis/cast.mjs';
import { B, done } from '../ennemis/foes.mjs';
import { common } from '../boss/nourrices.mjs';

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
export const lp = (a, b, t) => add(a, sc(sub(b, a), t));
export const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const clone = J => JSON.parse(JSON.stringify(J));
export const ORDER = [0.95, 1.0, 0.42]; // the Order's dirty green lantern flame (necropolis.mjs ORDER '#a8ac5c')

// an ellipsoid centred on c along the unit axes U, V and U x V, radii r
export function oel(b, c, U, V, r, m, k = 0, ex = {}) {
  U = nz(U); V = nz(sub(V, sc(U, dot(V, U)))); const W = crs(U, V), e = Math.max(...r) + 1;
  b.f((x, y, z) => { const q = [x - c[0], y - c[1], z - c[2]]; return sdEll(dot(q, U), dot(q, V), dot(q, W), 0, 0, 0, r[0], r[1], r[2]); }, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e], m, k, ex);
}
// the same, its surface lumpy by amp (noise of frequency fq)
export function oelN(b, c, U, V, r, m, k = 0, amp = 1, fq = 0.3, ex = {}) {
  U = nz(U); V = nz(sub(V, sc(U, dot(V, U)))); const W = crs(U, V), e = Math.max(...r) + 1 + amp;
  b.f((x, y, z) => { const q = [x - c[0], y - c[1], z - c[2]]; return sdEll(dot(q, U), dot(q, V), dot(q, W), 0, 0, 0, r[0], r[1], r[2]) + amp * (vn3(x * fq, y * fq, z * fq, 50) - 0.5); }, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e], m, k, ex);
}
// a box centred on c along the unit axes U, V and U x V, half sizes h, rounded r
export function obox(b, c, U, V, h, m, k = 0, r = 0.3, ex = {}) {
  U = nz(U); V = nz(sub(V, sc(U, dot(V, U)))); const W = crs(U, V), e = Math.hypot(...h) + 1;
  b.f((x, y, z) => { const q = [x - c[0], y - c[1], z - c[2]]; return sdBox(dot(q, U), dot(q, V), dot(q, W), 0, 0, 0, h[0], h[1], h[2], r); }, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e], m, k, ex);
}

// materials the props share: 40 earth, 41 grave stone, 42 rotten wood, 43 linen shroud, 44 wet black bile, 45 dark rags
export function kitMat(m, x, y, z) {
  const c0 = common(m, x, y, z); if (c0) return c0;
  switch (m) {
    case 40: { let c = mix(L('#2c241a'), L('#120f0b'), clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 40) * 1.7 - 0.4)); if (vn3(x * 1.3, y * 1.3, z * 1.3, 41) > 0.78) c = mul(c, 1.4); return { alb: c, wrap: 0.2, spec: 0.03 }; }
    case 45: { let c = mix(L('#3a3028'), L('#16120e'), clamp(fbm3(x * 0.45, y * 0.45, z * 0.3, 3, 49) * 1.7 - 0.4)); if (Math.abs(Math.sin(x * 2.6 + z * 0.4) * Math.sin(y * 2.6 - z * 0.3)) > 0.86) c = mul(c, 0.6); return { alb: c, wrap: 0.3, spec: 0.03 }; }
    case 41: { let c = mix(L('#5e584c'), L('#2e2a24'), clamp(fbm3(x * 0.25, y * 0.25, z * 0.25, 3, 42) * 1.6 - 0.35)); c = mix(c, L('#4a5230'), clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 43) - 0.55) * 1.6); c = mix(c, L('#16130f'), clamp((vn3(x * 0.12, y, z * 0.05, 44) - 0.5) * 2.5) * 0.7); return { alb: c, spec: 0.05, gloss: 10 }; }
    case 42: { const g = Math.abs(Math.sin((x + y) * 1.3 + vn3(x * 0.3, y * 0.3, z * 0.1, 3) * 3)); return { alb: mix(mix(L('#3a2c1e'), L('#1a130c'), g), L('#2e3020'), clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 6) - 0.5)), spec: 0.08, gloss: 15 }; }
    case 43: { let c = mix(L('#8a826a'), L('#4a4436'), clamp(fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 45) * 1.6 - 0.3)); c = mix(c, L('#2a2016'), clamp(1 - z / 14) * 0.7); c = mix(c, S.bloodD, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, 46) * 2 - 1.2)); return { alb: c, wrap: 0.4, spec: 0.03 }; }
    case 44: return { alb: mix(L('#2a2c14'), L('#0e0f08'), vn3(x * 0.5, y * 0.5, z * 0.5, 47)), spec: 0.9, gloss: 80 };
  }
  return null;
}

// a grave mound of turned earth (half-ellipsoid rx x ry x h at c), lumpy
export function mound(b, c, rx, ry, h, m = 40, k = 2) {
  b.f((x, y, z) => sdEll(x, y, z, c[0], c[1], c[2], rx, ry, h) + 1.4 * (vn3(x * 0.35, y * 0.35, z * 0.35, 48) - 0.5), [c[0] - rx - 2, c[1] - ry - 2, c[2] - h - 2, c[0] + rx + 2, c[1] + ry + 2, c[2] + h + 2], m, k);
}
// a wooden grave cross planted at base, leaning by lean (radians, towards +x) and tilt (towards +y)
export function graveCross(b, base, h = 50, lean = 0.12, tilt = -0.08, m = 42) {
  const up = nz([Math.sin(lean), Math.sin(tilt), 1]), sv = nz(crs([0, 1, 0], up)), top = add(base, sc(up, h)), bar = add(base, sc(up, h * 0.72));
  b.rc(add(base, [0, 0, -2]), top, 1.7, 1.4, m); b.rc(add(bar, sc(sv, -h * 0.28)), add(bar, sc(sv, h * 0.28)), 1.4, 1.3, m);
  return { top, bar, sv, up };
}
// a stele (rounded top) at base, w wide, h tall, leaning back by tilt
export function stele(b, base, w = 12, h = 26, tilt = -0.12, m = 41) {
  const up = nz([0, Math.sin(tilt), 1]), c = add(base, sc(up, h / 2 - 2));
  obox(b, c, [1, 0, 0], up, [w / 2, h / 2, 2], m, 0, 0.8);
  oel(b, add(c, sc(up, h / 2 - 1)), [1, 0, 0], up, [w / 2, w / 3, 2], m, 0.6);
}

// a corpse lying on its back along +y (head forward), arms by its sides; eaten: the belly opened
export function lyingCorpse(seed = 3, eaten = true) {
  const J = {}; for (const k in std) J[k] = [std[k][0] * (k[0] === 'S' || k[0] === 'E' || k[0] === 'W' ? 1.1 : 1), (std[k][2] - 52) * 0.95, 5 + std[k][1] * 0.6];
  J.head[2] = 6; J.Tr = [-6, -52, 5]; J.Tl = [6, -52, 5]; J.Ar[2] = 3; J.Al[2] = 3; J.Hr_[2] = 2.5; J.Hl_[2] = 2.5;
  const b = B(); humanoid(J, b, { thin: 0.8 });
  if (eaten) { b.carve(add(J.chest, [0, -6, 6]), 6, 1); for (let i = 0; i < 5; i++) b.rc(add(J.chest, [-5, -2 - i * 2.4, 4]), add(J.chest, [5, -2 - i * 2.4, 4]), 0.5, 0.5, 16); }
  const mat = (m, x, y, z) => { const c0 = kitMat(m, x, y, z); if (c0) return c0; let c = mul(skinTex(S.corpse, S.corpseD, x, y, z, seed), 0.55); if (z > 4 && Math.abs(y - J.pelvis[1]) < 9) c = mix(c, L('#3a3024'), 0.85); if (eaten && Math.hypot(x - J.chest[0], y - J.chest[1] + 6) < 8) return { alb: mix(S.muscle, S.bloodD, vn3(x, y, z, 5)), spec: 0.6, gloss: 60 };
    if (vn3(x * 0.4, y * 0.4, z * 0.4, 2) > 0.62) c = mix(c, S.bloodD, 0.7); return { alb: c, sss: 0.3, wrap: 0.3 }; };
  return done(b, mat);
}
