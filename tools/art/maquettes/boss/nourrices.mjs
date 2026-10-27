// La Nourrice des goules, second round: four variants (mockup only). Conventions as bosses.mjs: x = her left, y = forward,
// z = up, the hero ~100 tall; variant(pose) with pose 'idle' or 'tele' (the wind-up). The goules are the game's own
// (cast.mjs ghoul), placed as separate objects so they read on their own. No floor telegraph: body, light, sound.
import { sdBox, sdEll, sdRC, smin, smax, partsSdf, clamp, lerp, vn3, fbm3, h2, L, mix, mul, mulberry32 } from '../ennemis/lib.mjs';
import { boundsOf, S, skinTex, ghoul } from '../ennemis/cast.mjs';
import { B, done, glow, ironM, goldM, claws, HOLY, FIRE } from '../ennemis/foes.mjs';
import { chainLinks, cageBars, grow, bonePile } from './bosses.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const lp = (a, b, t) => add(a, sc(sub(b, a), t));
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// a model moved, turned (R = Rz(yaw) Rx(pitch) Ry(roll)) and scaled by k
export function placed(m, pos, yaw = 0, pitch = 0, roll = 0, k = 1) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const mm = (A, C) => A.map(r => [0, 1, 2].map(j => r[0] * C[0][j] + r[1] * C[1][j] + r[2] * C[2][j]));
  const R = mm(mm([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]], [[1, 0, 0], [0, cp, -sp], [0, sp, cp]]), [[cr, 0, sr], [0, 1, 0], [-sr, 0, cr]]);
  const toL = (x, y, z) => { const d = [(x - pos[0]) / k, (y - pos[1]) / k, (z - pos[2]) / k]; return [0, 1, 2].map(j => R[0][j] * d[0] + R[1][j] * d[1] + R[2][j] * d[2]); };
  const [a0, b0, c0, a1, b1, c1] = m.bounds, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const X of [a0, a1]) for (const Y of [b0, b1]) for (const Z of [c0, c1]) for (let i = 0; i < 3; i++) { const w = pos[i] + k * (R[i][0] * X + R[i][1] * Y + R[i][2] * Z); mn[i] = Math.min(mn[i], w); mx[i] = Math.max(mx[i], w); }
  return { sdf: (x, y, z) => { const p = toL(x, y, z); return m.sdf(p[0], p[1], p[2]) * k; }, mat: (i, x, y, z, ...n) => { const p = toL(x, y, z); return m.mat(i, p[0], p[1], p[2], ...n); }, bounds: [...mn, ...mx], step: m.step || 0.6 };
}
// a goule lying along segment a-b at t (on top of it, or hanging under it with under = true)
function cling(name, a, b, t, r, v, seed, k = 0.85, under = false) {
  const d = nz(sub(b, a)), e = Math.asin(clamp(d[2], -1, 1)), yaw = Math.atan2(-d[0], d[1]);
  const n = [Math.sin(yaw) * Math.sin(e), -Math.cos(yaw) * Math.sin(e), Math.cos(e)];
  return { name, model: placed(ghoul(v, seed), add(lp(a, b, t), sc(n, under ? -r : r)), yaw, e, under ? Math.PI : 0, k) };
}
const floorKid = (name, p, yaw, v = 0, seed = 1, k = 0.85) => ({ name, model: placed(ghoul(v, seed), p, yaw, 0, 0, k) });

// a starved vampire's head: skull, hollow cheeks, sockets (eyes glowing with material eye), hanging or unhinged jaw
function face(b, H, F, U, s = 1, open = 2.5, eye = 17) {
  const X = nz(crs(F, U)); const hp = (a, c, d) => add(H, add(sc(X, a * s), add(sc(F, c * s), sc(U, d * s))));
  b.el(hp(0, -1, 1.5), [6 * s, 6.6 * s, 6.3 * s], 1, 0); b.rc(hp(0, 3, -1), hp(0, 7.5, -6), 4.6 * s, 2.3 * s, 1, 1.5 * s);
  for (const sd of [-1, 1]) { b.rc(hp(sd * 3.6, 1, -4), hp(sd * 1.3, 7, -9 - open), 1.1 * s, 0.8 * s, 1, 0.6 * s); b.rc(hp(sd * 5.5, -1, 1.5), hp(sd * 9.5, -4.5, 5.5), 1.1 * s, 0.2 * s, 1, 0.5 * s); b.carve(hp(sd * 2.3, 5.8, 1.1), 1.6 * s, 0.4 * s); b.carve(hp(sd * 4.2, 4.2, -3), 1.6 * s, 0.8 * s); }
  b.carve(hp(0, 6.2, -5.5 - open * 0.5), (2.2 + open * 0.18) * s, 0.4 * s);
  for (let t = 0; t < 8; t++) { const sd = t < 4 ? 1 : -1, j = t % 4; const p = hp(sd * (0.5 + j * 0.8), 6.8 - j * 0.5, -3.6); b.rc(p, add(p, sc(U, -1.8 * s)), 0.35 * s, 0.06 * s, 7); const q = hp(sd * (0.5 + j * 0.8), 6.6 - j * 0.6, -8.5 - open); b.rc(q, add(q, sc(U, 1.5 * s)), 0.3 * s, 0.06 * s, 7); }
  if (eye) for (const sd of [-1, 1]) b.el(hp(sd * 2.3, 5.2, 1.1), [0.85 * s, 0.85 * s, 0.85 * s], eye);
  return hp;
}
// lank hair from the crown, falling straight down by len
function hair(b, hp, len, n = 13, seed = 17, s = 1) {
  const R = mulberry32(seed);
  for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * 3.6; const root = hp(Math.sin(a) * 5.6, -1 - Math.cos(a) * 4, 4 + Math.cos(a) * 1.5); const mid = add(root, [Math.sin(a) * 3 * s + (R() - 0.5) * 3, (R() - 0.5) * 3, -len * 0.45]); b.rc(root, mid, 1.4 * s, 1.0 * s, 13, 0.6); b.rc(mid, add(mid, [(R() - 0.5) * 4, (R() - 0.5) * 3, -len * (0.45 + R() * 0.2)]), 1.0 * s, 0.3 * s, 13, 0.4); }
}
// ribs pressing through the skin along axis ax round c
const ribbed = (r, c, ax, half, amp = 0.55, f = 1.15) => { const sd = r.sdf; r.sdf = (x, y, z) => { let d = sd(x, y, z); const t = (x - c[0]) * ax[0] + (y - c[1]) * ax[1] + (z - c[2]) * ax[2]; if (Math.abs(t) < half) d += amp * Math.max(0, Math.sin(t * f)); return d; }; return r; };
const skin = (base, dark, x, y, z, seed) => { let c = skinTex(base, dark, x, y, z, seed); if (Math.abs(vn3(x * 0.25, y * 0.25, z * 0.25, seed + 11) - 0.5) < 0.025) c = mix(c, L('#3e3448'), 0.6); return c; };
const common = (m, x, y, z) => {
  switch (m) {
    case 2: return { alb: mix(S.nail, S.blood, 0.35), spec: 0.4, gloss: 40 };
    case 7: return { alb: S.tooth, spec: 0.4, gloss: 40 };
    case 9: return ironM(x, y, z);
    case 13: return { alb: mix(L('#3a3630'), L('#121110'), vn3(x * 0.9, y * 0.9, z * 0.2, 3)), spec: 0.25, gloss: 30, wrap: 0.3 };
    case 14: return { alb: mix(L('#b4a888'), L('#7a7058'), vn3(x, y, z, 2)), wrap: 0.5 };
    case 15: return { alb: L('#5a0a0e'), spec: 0.6, gloss: 60 };
    case 16: return { alb: mix(L('#d0c49e'), L('#8a7e60'), vn3(x, y, z * 0.3, 3)), sss: 0.6, wrap: 0.4, spec: 0.3, gloss: 40 };
    case 17: return glow([0.95, 0.85, 0.45], 0.8);
    case 19: return glow(FIRE, 0.8);
  }
  return null;
};

// ======================= A. L'ARAIGNÉE =======================
// stretched out, too many joints, high on four limbs like a spider over the hero; the head hangs upside down under her
// shoulders, hair to the floor; broken leashes of the Order swing from her; goules cling to her limbs and drop off.
// 'tele': the fore-limbs reared high, claws over the hero, the head swung up, jaw unhinged.
export function araignee(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el, tor } = b;
  const P = [0, -22, tele ? 74 : 104], C = [0, 16, tele ? 118 : 112], ax = nz(sub(C, P)), up = nz(crs(ax, [-1, 0, 0])), dn = sc(up, -1);
  rc(P, C, 9, 12, 1, 4); el(lp(P, C, 0.68), [14, 15, 11], 1, 4); el(add(lp(P, C, 0.3), sc(dn, 6)), [9, 11, 8], 1, 3); el(P, [11, 10, 8], 1, 3);
  for (let i = 0; i <= 14; i++) { const p = add(lp(sub(P, sc(ax, 4)), add(C, sc(ax, 6)), i / 14), sc(up, 7.5 - Math.abs(i - 7) * 0.12)); el(p, [1.7, 1.6, 1.6], 1, 0.8); rc(p, add(p, sc(up, 3 + (i & 1) * 2)), 1.0, 0.2, 1, 0.4); } // spine, spurs
  rc(add(C, [-13, 0, 0]), add(C, [13, 0, 0]), 4, 4, 1, 4);
  // limbs: five segments each, knuckled joints with bone spurs
  const limbs = [];
  for (const [root, sx, front] of [[add(C, [12, 2, 0]), 1, true], [add(C, [-12, 2, 0]), -1, true], [add(P, [9, -2, -2]), 1, false], [add(P, [-9, -2, -2]), -1, false]]) {
    const a = front ? (tele ? 1.15 : 0.62) : 2.45, d = [sx * Math.sin(a), Math.cos(a), 0];
    const pts = front && tele ? [root, add(root, add(sc(d, 12), [0, 0, 40])), add(root, add(sc(d, 24), [0, 2, 84])), add(root, add(sc(d, 34), [0, 12, 116])), add(root, add(sc(d, 38), [0, 32, 106])), add(root, add(sc(d, 34), [0, 46, 84]))]
      : [root, add(root, add(sc(d, 16), [0, 0, 26])), add(root, add(sc(d, 34), [0, 0, 54])), add(root, add(sc(d, 56), [0, 0, 22])), [root[0] + d[0] * 70, root[1] + d[1] * 70, 58], [root[0] + d[0] * 80, root[1] + d[1] * 80, 6]];
    for (let i = 0; i < pts.length - 1; i++) { const r0 = lerp(5, 2.2, i / (pts.length - 1)), r1 = lerp(5, 2.2, (i + 1) / (pts.length - 1)); rc(pts[i], pts[i + 1], r0, r1 * 0.85, 1, 1.2); if (i) { el(pts[i], [r0 * 1.35, r0 * 1.35, r0 * 1.35], 1, 1); rc(pts[i], add(pts[i], [d[0] * 2, d[1] * 2, 5 + r0]), r0 * 0.4, 0.15, 1, 0.5); } }
    const tip = pts[pts.length - 1], dir = front && tele ? [d[0] * 0.2, 0.5, -1] : [d[0] * 0.6, d[1] * 0.6, -1];
    claws(b, tip, dir, sx, 1, 2, front && tele ? 16 : 10, 1.2);
    limbs.push(pts);
  }
  // the head: hanging upside down under the shoulders at rest, swung up and screaming on the wind-up
  const nb = add(C, [0, 9, -2]);
  const H = tele ? add(C, [0, 26, 8]) : add(C, [0, 20, -26]), F = tele ? nz([0, 1, 0.35]) : [0, 1, 0], U = tele ? nz([0, -0.35, 1]) : [0, 0, -1];
  rc(nb, lp(nb, H, 0.5), 3.6, 3.2, 1, 2); rc(lp(nb, H, 0.5), H, 3.2, 3, 1, 2);
  const hp = face(b, H, F, U, 1.15, tele ? 11 : 4);
  hair(b, hp, tele ? 26 : H[2] - 4, 19, 23, 1.5);
  // the Order's iron: a collar and wrist shackles, each with a broken leash swinging
  tor(lp(nb, H, 0.2), nz(sub(H, nb)), 5.2, 1.3, 9);
  chainLinks(b, add(lp(nb, H, 0.2), [0, 0, -5]), add(lp(nb, H, 0.2), [4, -6, -50]), 0, 1.0, 9, 3.4);
  for (const pts of limbs) { const w = lp(pts[pts.length - 2], pts[pts.length - 1], 0.4); const sd = nz(sub(pts[pts.length - 1], pts[pts.length - 2])); tor(w, sd, 3.4, 0.9, 9); chainLinks(b, w, add(w, [2, -3, -Math.min(30, w[2] - 4)]), 0, 0.8, 9, 3); }
  const seal = add(lp(P, C, 0.75), sc(up, 10)); el(seal, [3.4, 3.4, 1.4], 8, 0.4); b.box(add(seal, [0, -5, -1]), [1.2, 4, 0.25], 14, 0, 0.1);
  const mat = (m, x, y, z) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 8) { const g = goldM(x, y, z); g.emi = sc(HOLY, tele ? 0.35 : 0.15); return g; }
    let c = skin(L('#7e7470'), L('#3a3234'), x, y, z, 31); // bruised, ash-grey, stretched over bone
    c = mix(c, L('#4a3a48'), clamp(vn3(x * 0.07, y * 0.07, z * 0.07, 4) - 0.4) * 0.8);
    if (vn3(x * 0.3, y * 0.3, z * 0.3, 8) > 0.74) c = mix(c, S.bloodF, 0.7); // weeping sores
    const md = dist([x, y, z], hp(0, 6, -6)); if (md < 9) c = mix(c, S.blood, clamp((9 - md) / 4) * (0.5 + 0.5 * vn3(x, y, z, 4)));
    if (dist([x, y, z], seal) < 6.5) c = mix(c, L('#1a0c08'), 0.85);
    return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.25, gloss: 35 };
  };
  const r = ribbed(done(b, mat, { size: 1.9 }), lp(P, C, 0.68), ax, 11);
  // goules: one climbing a hind limb, one hanging under her belly, one on the ground at her claws; on the wind-up one lets go
  const [fl, fr, bl, br] = limbs;
  r.subs = [cling('g1', bl[tele ? 3 : 1], bl[tele ? 4 : 2], 0.5, 3.5, 0, 3, 0.8), cling('g2', add(P, [0, 0, -8]), add(C, [0, 0, -8]), 0.35, 8, 0, 5, 0.8, true),
    tele ? { name: 'g3', model: placed(ghoul(2, 7), [-20, 20, 40], 0.4, -0.9, 0.5, 0.8) } : cling('g3', fr[2], fr[3], 0.45, 3, 0, 7, 0.75)];
  r.lights = [{ p: add(seal, sc(up, 5)), c: L('#e8c070'), I: tele ? 1.5 : 0.7, r0: 12, R: 70, pad: 3, haze: 0.02, hazeR: 2 }];
  return r;
}

// ======================= B. LA MATRICE =======================
// bound upright on an Order wheel hung from the vault by two chains; her belly is a huge translucent sac where goules
// turn like larvae, umbilical cords run from it to the goules around her. 'tele': the wheel swung back and turned a
// notch, the sac lit from within and heaving: the swing and the brood follow.
export function matrice(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el, tor } = b;
  const Zp = 340, phi = tele ? -0.3 : 0, th = tele ? 0.42 : 0, Wc = [0, 0, 92], Rw = 52;
  const swing = p => { const y = p[1], z = p[2] - Zp; return [p[0], y * Math.cos(phi) - z * Math.sin(phi), Zp + y * Math.sin(phi) + z * Math.cos(phi)]; };
  const W = (u, v, w = 0) => swing([Wc[0] + u * Math.cos(th) - v * Math.sin(th), Wc[1] + w, Wc[2] + u * Math.sin(th) + v * Math.cos(th)]); // wheel plane -> world
  const wax = nz(sub(W(0, 0, 1), W(0, 0, 0)));
  // the wheel: wooden rim bound in iron, spikes, eight spokes, hub; two chains up to the vault
  tor(W(0, 0, -2), wax, Rw, 3.4, 6); tor(W(0, 0, -2), wax, Rw + 2.6, 1.1, 9);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; rc(W(Math.cos(a) * (Rw + 3), Math.sin(a) * (Rw + 3), -2), W(Math.cos(a) * (Rw + 10), Math.sin(a) * (Rw + 10), -2), 1.1, 0.1, 9); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; rc(W(0, 0, -3), W(Math.cos(a) * Rw, Math.sin(a) * Rw, -3), 1.8, 1.6, 6); }
  el(W(0, 0, -4), [7, 7, 7], 9); rc(W(0, 0, -10), W(0, 0, 4), 2.4, 2.4, 9);
  for (const sx of [-1, 1]) { const top = swing([sx * 22, 0, Wc[2] + 47]); chainLinks(b, top, [sx * 16, top[1] + (Zp - top[2]) * Math.tan(-phi), Zp], 0, 1.3, 9, 4); }
  // her body spread on the wheel (a cross), wrists and ankles shackled to the rim
  const J = { head: W(0, 44, 6), neck: W(0, 35, 5), chest: W(0, 22, 6), pel: W(0, -8, 5), Sr: W(-11, 30, 5), Sl: W(11, 30, 5), Er: W(-28, 37, 5), El: W(28, 37, 5), Wr: W(-42, 31, 4), Wl: W(42, 31, 4), Hr: W(-7, -10, 5), Hl: W(7, -10, 5), Kr: W(-16, -30, 6), Kl: W(16, -30, 6), Ar: W(-26, -45, 4), Al: W(26, -45, 4) };
  rc(J.pel, J.chest, 6, 9, 1, 3); el(J.chest, [9, 7, 9], 1, 3); rc(J.chest, J.neck, 7, 3.4, 1, 2); rc(J.Sr, J.Sl, 3.6, 3.6, 1, 3); el(J.pel, [8, 6, 6], 1, 3);
  for (const [a1, a2, a3] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl], [J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(a1, a2, 3.4, 2.4, 1, 1.5); rc(a2, a3, 2.4, 1.6, 1, 1); el(a2, [2.8, 2.8, 2.8], 1, 1); tor(a3, nz(sub(a3, a2)), 2.8, 1.0, 9); }
  for (const [w, e, sd] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, w, sub(w, e), sd, 1, 2, 6, 1);
  const hp = face(b, J.head, nz(sub(W(0, 44, 30), J.head)), nz(sub(W(0, 60, 6), J.head)), 1, tele ? 9 : 3);
  hair(b, hp, 34, 11, 41);
  rc(W(-Rw * 0.7, 30, 2), W(Rw * 0.7, 30, 2), 1.0, 1.0, 9); rc(W(-Rw * 0.9, -8, 2), W(Rw * 0.9, -8, 2), 1.0, 1.0, 9); // iron straps across chest and hips
  // the sac: a swollen, translucent belly hanging over her legs; larvae-goules curled inside
  const sacC = W(0, -6, 24), sacR = [24, 22, 27];
  b.f((x, y, z) => sdEll(x, y, z, sacC[0], sacC[1], sacC[2], sacR[0], sacR[1], sacR[2]) + 0.8 * (vn3(x * 0.2, y * 0.2, z * 0.2, 9) - 0.5), [sacC[0] - 27, sacC[1] - 25, sacC[2] - 30, sacC[0] + 27, sacC[1] + 25, sacC[2] + 30], 20, 5);
  const R = mulberry32(12), larvae = [[-9, 12, 0.6], [8, 4, 2.4], [-4, -14, 3.6], [10, -16, 1.2], [0, 20, 5.0]].map(([u, v, a]) => { const c = add(sacC, [u, 8, v]); return [c, add(c, [Math.cos(a) * 13, 0, Math.sin(a) * 13]), add(c, [Math.cos(a + 1.6) * 7, 0, Math.sin(a + 1.6) * 7])]; });
  // umbilical cords from the sac to the goules on the ground (taut when she swings back)
  const kids = [[-50, 46, 0, 2.6], [46, 56, 0, -2.4], [4, 84, 0, 3.14]];
  kids.forEach(([x, y, z], i) => { const a = add(sacC, [(i - 1) * 12, 16, -12 + i * 3]); chainLinks(b, a, [x, y + 2, 20], tele ? 2 : 22, 1.5, 18, 3); });
  const glowK = tele ? 0.75 : 0.16;
  const mat = (m, x, y, z, nx, ny, nz_) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 6) return { alb: mix(L('#3e2c1c'), L('#1e140c'), vn3(x * 0.3, y * 0.3, z * 0.3, 2)), spec: 0.2, gloss: 20 };
    if (m === 18) return { alb: mix(L('#6a3040'), L('#3a1420'), vn3(x * 0.6, y * 0.6, z * 0.6, 4)), spec: 0.8, gloss: 70, sss: 0.5 };
    if (m === 20) { // the sac: stretched skin, veins, the brood showing through as shadows against its inner glow
      let c = mix(L('#a8907a'), L('#5e4440'), vn3(x * 0.15, y * 0.15, z * 0.15, 6)), shade = 0;
      for (const [p0, p1, p2] of larvae) for (const [a, e, r0] of [[p0, p1, 5], [p0, p2, 3.5]]) { const t = clamp(((x - a[0]) * (e[0] - a[0]) + (z - a[2]) * (e[2] - a[2])) / ((e[0] - a[0]) ** 2 + (e[2] - a[2]) ** 2)); const q = lp(a, e, t); const d = Math.hypot(x - q[0], z - q[2]) - r0 * (1 - 0.6 * t); shade = Math.max(shade, clamp(1 - d / 1.2)); }
      if (Math.abs(vn3(x * 0.3, y * 0.3, z * 0.3, 21) - 0.5) < 0.03) c = mix(c, L('#5a2a3a'), 0.8);
      const e = glowK * (1 - shade * 0.95) * (0.6 + 0.4 * vn3(x * 0.1, y * 0.1, z * 0.1, 3));
      return { alb: mul(c, 1 - shade * 0.8), emi: [0.5 * e, 0.42 * e, 0.12 * e], sss: 0.9, wrap: 0.5, spec: 0.7, gloss: 70, noAO: true };
    }
    let c = skin(L('#9c9280'), L('#5a5244'), x, y, z, 13);
    if (dist([x, y, z], hp(0, 6, -6)) < 8) c = mix(c, S.blood, 0.6);
    if (z < J.pel[2] && Math.abs(x) < 30) c = mix(c, S.bloodD, clamp(vn3(x * 0.3, y, z * 0.2, 5) * 1.5 - 0.5)); // what ran down from the sac
    return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.25, gloss: 35 };
  };
  const r = ribbed(done(b, mat, { size: 1.9 }), J.chest, nz(sub(J.neck, J.pel)), 9);
  r.subs = kids.map(([x, y, z, yaw], i) => floorKid('g' + i, [x, y, z], yaw, i === 2 && tele ? 1 : 0, 3 + i, 0.8));
  r.lights = [{ p: add(sacC, [0, 30, 0]), c: L('#c8cc70'), I: tele ? 6 : 1.4, r0: tele ? 30 : 16, R: tele ? 230 : 110, pad: 3, haze: tele ? 0.04 : 0.02, hazeR: tele ? 5 : 3 }];
  return grow(r, 1.15), r.lights.forEach(l => l.p = sc(l.p, 1.15)), r.subs.forEach(s => s.model = placed(s.model, [0, 0, 0], 0, 0, 0, 1.15)), r;
}

// ======================= C. LA SAINTE =======================
// the Order made her a living reliquary: an iron corset-cage, gold seals nailed in, votive candles driven into her
// shoulders and her spiked halo; holy light leaks from her wounds and her burnt-out eyes, burning her and the hero.
// 'tele': arms flung wide, head back, the wounds split open: the light swells, the cage bars stripe the floor with shadow.
export function sainte(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el, tor } = b;
  const pel = [0, 0, 70], chest = [0, tele ? -2 : 1, 104], nb = [0, tele ? -3 : 1, 122];
  const H = tele ? [0, -6, 134] : [0, 4, 133], F = tele ? nz([0, 1, 1.1]) : nz([0, 1, -0.25]), U = [0, -F[2], F[1]];
  rc(pel, chest, 7, 10, 1, 4); el(chest, [11, 8, 10], 1, 4); rc(chest, nb, 9, 4, 1, 3); el(pel, [10, 7, 7], 1, 3);
  const Sh = s => [s * 13, chest[1], 118];
  rc(Sh(-1), Sh(1), 3.6, 3.6, 1, 3);
  const arms = tele ? s => [[s * 30, -4, 132], [s * 46, 0, 152], [s * 0.3, 0.2, 1]] : s => [[s * 17, 6, 92], [s * 21, 16, 76], [s * 0.3, 0.5, -0.8]];
  const palms = [];
  for (const s of [-1, 1]) { const [E, Wr, d] = arms(s); rc(Sh(s), E, 3.4, 2.4, 1, 1.5); rc(E, Wr, 2.4, 1.7, 1, 1); el(E, [2.7, 2.7, 2.7], 1, 1); claws(b, Wr, d, s, 1, 2, 7, 1.1); palms.push(Wr); el(add(Wr, sc(nz(d), 2)), [1.6, 1.6, 1.6], 8); }
  rc(nb, H, 3.4, 3.2, 1, 2);
  const hp = face(b, H, F, U, 1.05, tele ? 10 : 2, 10);
  hair(b, hp, 36, 13, 61);
  // crown of nails
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 3.2; const p = hp(Math.sin(a) * 6, -1 + Math.cos(a) * 1.5, 5); rc(p, add(p, sc(U, 6)), 0.6, 0.1, 9); }
  // the shroud of the Order from the hips to the floor, trailing
  b.rev(0, -2, 0.5, 74, t => lerp(19, 10.5, Math.pow(t, 0.7)), 3, 2, 0.85, { fold: [9, 1.8] });
  // iron corset-cage round the torso (the light inside throws its bars as shadows)
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const c = [Math.cos(a), Math.sin(a) * 0.85]; rc([c[0] * 13, c[1] * 13 + 1, 72], [c[0] * 15, c[1] * 15 + 1, 98], 0.9, 0.9, 9); rc([c[0] * 15, c[1] * 15 + 1, 98], [c[0] * 9, c[1] * 9 + 1, 120], 0.9, 0.8, 9); }
  for (const [z, r0] of [[72, 13], [86, 14.2], [100, 14.6], [112, 11]]) tor([0, 1, z], [0, 0, 1], r0, 1.0, 9);
  // gold seals nailed: sternum, belly, brow; votive candles driven into the shoulders
  const seals = [add(chest, [0, 9.5, -2]), add(pel, [-5, 9, 8]), hp(0, 6.4, 4.6)];
  for (const sp of seals) { el(sp, [2.6, 1.3, 2.6], 8, 0.3); el(sp, [0.8, 2.2, 0.8], 9); }
  b.box(add(seals[0], [2, 1, -7]), [1.1, 0.25, 5], 14, 0, 0.1);
  const flames = [];
  for (const s of [-1, 1]) for (const [dx, h] of [[0, 9], [5, 6]]) { const base = add(Sh(s), [s * dx * 0.3, -2 + dx * 0.3, 3]), top = add(base, [s * 1, -1, h]); rc(base, top, 1.2, 1.1, 16); el(add(top, [0, 0, 1.8]), [0.8, 0.8, 1.6], 19); flames.push(add(top, [0, 0, 2])); }
  // the spiked halo behind her head, candles on its upper rim
  const HC = add(H, [0, -9, 4]);
  tor(HC, [0, 1, 0], 22, 1.5, 9); tor(HC, [0, 1, 0], 15, 0.8, 8);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, u = [Math.cos(a), 0, Math.sin(a)]; rc(add(HC, sc(u, 22)), add(HC, sc(u, i & 1 ? 28 : 34)), 1.0, 0.15, 9); }
  for (let i = 0; i < 7; i++) { const a = 0.35 + i / 6 * (Math.PI - 0.7), base = add(HC, [Math.cos(a) * 22, 0, Math.sin(a) * 22 + 1.5]), h = 4 + h2(i, 3, 3) * 5; rc(base, add(base, [0, 0, h]), 1.1, 1.0, 16); el(add(base, [0, 0, h + 1.8]), [0.8, 0.8, 1.6], 19); flames.push(add(base, [0, 0, h + 2])); }
  rc(add(HC, [0, -1, -22]), add(nb, [0, -4, -4]), 1.6, 1.6, 9); // the halo's stem, bolted to her spine
  const woundK = tele ? 1.8 : 0.8;
  const mat = (m, x, y, z) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 8) { const g = goldM(x, y, z); g.emi = sc(HOLY, tele ? 0.5 : 0.15); return g; }
    if (m === 10) return glow(HOLY, tele ? 2.2 : 1.1); // burnt-out eyes pouring light
    if (m === 3) { let c = mix(L('#a89a7c'), L('#5e5240'), clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 8) * 1.5 - 0.3)); if (Math.abs(((z + 200) % 13) - 6.5) < 0.8 && z > 30) c = mix(K2.gold, c, 0.4); c = mix(c, L('#2a2218'), clamp(fbm3(x * 0.1, y * 0.1, z * 0.1, 3, 4) * 1.6 - 0.55)); c = mix(c, S.bloodD, clamp((30 - z) / 25) * clamp(vn3(x * 0.3, y * 0.3, z * 0.1, 5) * 1.6 - 0.2)); if (vn3(x * 0.4, y * 0.4, z * 0.1, 6) > 0.7 && z > 40) c = mix(c, S.blood, 0.6); return { alb: mul(c, 0.8), wrap: 0.35, spec: 0.1 }; }
    let c = skin(L('#8c8270'), L('#4e4438'), x, y, z, 7);
    for (const sp of seals) { const d = dist([x, y, z], sp); if (d < 7) c = mix(c, d < 4 ? L('#140806') : S.muscle, clamp((7 - d) / 2.5) * 0.9); }
    const cr = Math.abs(vn3(x * 0.12, y * 0.12, z * 0.3, 19) - 0.5) + (Math.abs(x) > 15 || z < 76 || z > 122 ? 1 : 0); // the wounds: long splits in her trunk leaking holy light
    if (cr < 0.03) return { alb: [0.1, 0.06, 0.03], emi: sc(HOLY, woundK * (1 - cr / 0.03 * 0.5)), noAO: true, noShadow: true, rim: 0 };
    if (cr < 0.07) c = mix(c, L('#1a0c08'), 0.8);
    for (const p of palms) if (dist([x, y, z], p) < 3.5) return glow(HOLY, tele ? 1.6 : 0.7); // stigmata // charred lips of the wounds
    const md = dist([x, y, z], hp(0, 6, -6)); if (md < 8) c = mix(c, L('#c0a040'), 0.4); // she weeps wax and light
    return { alb: c, sss: 0.4, wrap: 0.3, spec: 0.3, gloss: 40 };
  };
  const r = ribbed(done(b, mat, { size: 1.9 }), chest, nz(sub(nb, pel)), 10);
  r.lights = [{ p: add(chest, [0, 11, -3]), c: L('#f0d488'), I: tele ? 26 : 6, r0: tele ? 55 : 26, R: tele ? 400 : 180, pad: 1.2, soft: 4, haze: tele ? 0.02 : 0.03, hazeR: tele ? 9 : 3 },
    { p: add(HC, [0, 3, 24]), c: L('#e0904a'), I: 1.4, r0: 16, R: 100, pad: 3, haze: 0.04, hazeR: 3 }];
  return grow(r, 1.25), r.lights.forEach(l => l.p = sc(l.p, 1.25)), r;
}
const K2 = { gold: L('#9a7428') };

// ======================= D. L'EMMURÉE =======================
// half-buried in the ossuary wall: a vast torso and arms out of a breach in the bones, the Order's chains bolted across
// her shoulders into the wall, seals on the wall round her; goules crawl out of holes in the wall. Her reach covers the
// room. 'tele': one arm cocked high and back for the sweep, the torso twisted, jaw open, the wall's seals flaring.
export function emmuree(pose = 'idle') {
  const tele = pose === 'tele'; const w = B(), b = B(); const { rc, el, tor } = b;
  // the wall: a slab of stacked skulls with a breach where she comes out, and holes the goules come out of
  const holes = [[-74, 58], [70, 40], [58, 112]];
  w.f((x, y, z) => {
    let d = sdBox(x, y, z, 0, -22, 85, 100, 18, 85, 0);
    const cx = Math.floor((x + 300) / 9), cz = Math.floor(z / 10), jx = h2(cx, cz, 4) - 0.5;
    d = Math.min(d, Math.hypot(((x + 300) % 9) - 4.5 + jx, y + 4.3, (z % 10) - 5 + jx) - 3.6 - 0.8 * h2(cx, cz, 5)); // skulls bulging out
    d = Math.max(d, z - 168 - 8 * vn3(x * 0.05, 0, 0, 3), -z, Math.abs(x) - 100);
    const br = Math.hypot(x / 44, (z - 30) / 70) - 1 + 0.15 * (vn3(x * 0.1, y * 0.1, z * 0.1, 6) - 0.5); d = Math.max(d, -br * 30); // the breach
    for (const [hx, hz] of holes) d = Math.max(d, 7 - Math.hypot(x - hx, z - hz) + 2 * vn3(x * 0.3, y * 0.3, z * 0.3, 9));
    return d;
  }, [-102, -42, -1, 102, 2, 180], 30, 0);
  w.f((x, y, z) => Math.max(sdBox(x, y, z, 0, -36, 70, 46, 4, 70, 0), -z), [-48, -42, -1, 48, -30, 142], 31, 0); // darkness behind the breach
  for (const [hx, hz] of holes) w.f((x, y, z) => sdBox(x, y, z, hx, -36, hz, 8, 4, 8, 0), [hx - 9, -42, hz - 9, hx + 9, -30, hz + 9], 31, 0);
  // her: hips sunk in the bones, a vast starved torso leaning out over the room
  const pel = [0, -12, 14], belly = [0, 0, 50], chest = tele ? [4, 12, 96] : [0, 16, 94], nb = tele ? [6, 26, 122] : [0, 32, 118];
  const Sh = s => tele ? add(chest, [s * 32, s * 6, 18]) : add(chest, [s * 32, 2, 18]);
  rc(pel, belly, 15, 13, 1, 6); rc(belly, chest, 13, 20, 1, 6); rc(chest, nb, 18, 8, 1, 5); rc(Sh(-1), Sh(1), 6.5, 6.5, 1, 6);
  for (const s of [-1, 1]) el(Sh(s), [10, 9, 9], 1, 4);
  const H = tele ? [10, 44, 120] : [0, 52, 110], F = tele ? nz([0.2, 1, 0.1]) : nz([0, 1, -0.4]), U = [0, -F[2], F[1]];
  rc(nb, H, 7, 6, 1, 3);
  const hp = face(b, H, F, U, 2.1, tele ? 9 : 4);
  hair(b, hp, tele ? 70 : 60, 15, 71, 2);
  const arm = s => tele && s < 0 ? [[-62, -8, 150], [-80, 18, 196], [-0.3, 0.6, 0.8]] : [[s * 62, 40, 84], [s * 62, 96, 12], [s * 0.1, 1, -0.5]];
  for (const s of [-1, 1]) { const [E, Wr, d] = arm(s); rc(Sh(s), E, 9, 6.5, 1, 3); rc(E, Wr, 6.5, 4.5, 1, 2); el(E, [7, 7, 7], 1, 2); claws(b, Wr, d, s, 1, 2, 17, 1.2); }
  // the Order's iron: chains bolted into the wall, across her shoulders; a collar; seals on the wall round the breach
  for (const s of [-1, 1]) { const bolt = [s * 86, -3, 150]; el(bolt, [3, 2, 3], 9); chainLinks(b, bolt, add(Sh(s), [0, -4, 6]), tele ? 0 : 8, 1.8, 9, 5); chainLinks(b, [s * 90, -3, 96], add(lp(pel, belly, 0.8), [s * 12, 4, 0]), tele ? 0 : 6, 1.6, 9, 5); }
  tor(lp(nb, chest, 0.2), nz(sub(nb, chest)), 12, 2.2, 9);
  const seals = [[-46, -3, 140], [46, -3, 140], [0, -3, 160], [-88, -3, 110], [88, -3, 70]];
  for (const sp of seals) { el(sp, [5, 1.6, 5], 8, 0.3); b.box(add(sp, [0, 0.3, -9]), [1.6, 0.3, 6], 14, 0, 0.1); }
  const mat = (m, x, y, z) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 8) { const g = goldM(x, y, z); g.emi = sc(HOLY, tele ? 0.45 : 0.12); return g; }
    if (m === 31) return { alb: [0.004, 0.003, 0.003], noAO: true, spec: 0 };
    if (m === 30) { const cx = Math.floor((x + 300) / 9), cz = Math.floor(z / 10); let c = mix(S.tooth, L('#4e4636'), clamp(h2(cx, cz, 7) * 0.8 + fbm3(x * 0.3, y * 0.3, z * 0.3, 2, 3) * 0.5)); const u = ((x + 300) % 9) - 4.5 + h2(cx, cz, 4) - 0.5, v = (z % 10) - 5;
      if (y > -6) { for (const s of [-1, 1]) if (Math.hypot(u - s * 1.5, v - 0.4) < 1.0) c = L('#0c0a08'); if (Math.abs(u) < 0.4 && v < -0.5 && v > -1.8) c = L('#0c0a08'); } else c = mix(c, L('#1a1610'), 0.6);
      return { alb: mul(c, 0.8 * clamp((162 - z) / 22)), spec: z > 150 ? 0 : 0.15, gloss: 25, rim: z > 150 ? 0 : 0.8 }; }
    let c = skin(L('#8a8476'), L('#46423a'), x, y, z, 77); // bone-dust grey, cracked like plaster
    c = mix(c, L('#c0b8a0'), clamp(vn3(x * 0.15, y * 0.15, z * 0.15, 2) - 0.55) * 1.2); // dust caked on
    if (Math.abs(vn3(x * 0.12, y * 0.12, z * 0.12, 13) - 0.5) < 0.02) c = mix(c, L('#2a0c0c'), 0.85); // splits
    if (z < 40) c = mix(c, L('#2a2218'), clamp((40 - z) / 25));
    const md = dist([x, y, z], hp(0, 6, -6)); if (md < 18) c = mix(c, S.blood, clamp((18 - md) / 8) * 0.7);
    return { alb: c, sss: 0.3, wrap: 0.3, spec: 0.2, gloss: 30 };
  };
  const r = ribbed(done(b, mat, { size: 2.4 }), lp(belly, chest, 0.7), nz(sub(chest, belly)), 18, 1.1, 0.6);
  const wall = done(w, mat); wall.nomask = true;
  // goules crawling out of the holes, one on the floor; bones spilled round her hips
  r.subs = [{ name: 'g0', model: placed(ghoul(1, 2), [holes[0][0], -4, holes[0][1] - 6], 0.3, -0.5, 0, 0.8) }, { name: 'g1', model: placed(ghoul(0, 4), [holes[1][0], -2, holes[1][1] - 8], -0.4, -0.35, 0, 0.8) },
    { name: 'g2', model: placed(ghoul(0, 6), [holes[2][0], -6, holes[2][1] - 7], -0.2, -1.1, 0, 0.75) }, floorKid('g3', [-40, 70, 0], 0.5, tele ? 1 : 0, 8, 0.8),
    { name: 'bones', model: { ...placed(bonePile(9, 150, 60, 50), [0, 14, 0], 0, 0, 0, 1), nomask: true } }, { name: 'wall', model: wall }];
  r.lights = seals.map(p => ({ p: add(p, [0, 8, 0]), c: L('#e8c070'), I: tele ? 2.2 : 0.5, r0: 14, R: tele ? 120 : 50, pad: 3, haze: tele ? 0.04 : 0.02, hazeR: 3 }));
  return r;
}

export const NOURRICES = [
  { id: 'A', fn: araignee, key: 'araignee', name: 'L’Araignée' },
  { id: 'B', fn: matrice, key: 'matrice', name: 'La Matrice' },
  { id: 'C', fn: sainte, key: 'sainte', name: 'La Sainte' },
  { id: 'D', fn: emmuree, key: 'emmuree', name: 'L’Emmurée' },
];
