// The necropolis's own fauna (mockup only): what lives, rots, feeds or haunts among its graves. Each foe(pose) with pose
// 'idle' or 'tele' (the wind-up: the body's tell) returns a model as ../ennemis/foes.mjs does, props in `subs` with
// nomask (left out of the silhouette). No floor mark anywhere: the body, the light it carries and the sound tell.
import { sdEll, sdRC, smax, clamp, lerp, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from '../ennemis/lib.mjs';
import { humanoid, std, S, skinTex } from '../ennemis/cast.mjs';
import { B, done, glow, claws } from '../ennemis/foes.mjs';
import { face, hair, ribbed, skin } from '../boss/nourrices.mjs';
import { add, sub, sc, nz, lp, crs, dot, clone, oel, oelN, obox, kitMat, mound, graveCross, stele, lyingCorpse } from './kit.mjs';

const prop = (name, model) => ({ name, model: { ...model, nomask: true } });
const EMBER = [1.6, 0.16, 0.06]; // a vampire's eyes: red embers, like the hero's

// ======================= 1. LES CORNEILLES =======================
// a carrion crow at p facing angle a (0: +y), 'perch' / 'peck' / 'fly' (wings up, beak open); its feet 7k under p
function crow(b, p, a, mode, k = 1, wingUp = 0.7) {
  const F = [Math.sin(a), Math.cos(a), 0], X = [Math.cos(a), -Math.sin(a), 0];
  const pitch = mode === 'perch' ? 0.4 : mode === 'peck' ? -0.45 : 0.12;
  const f = nz(add(sc(F, Math.cos(pitch)), [0, 0, Math.sin(pitch)])), u = crs(X, f);
  const P = (fx, ux, xx = 0) => add(p, add(sc(f, fx * k), add(sc(u, ux * k), sc(X, xx * k))));
  oel(b, P(0, 0), f, X, [6.5 * k, 3.4 * k, 3.6 * k], 30, 1.2 * k);
  b.el(P(3, -0.3), [3.4 * k, 3.4 * k, 3.4 * k], 30, 1.4 * k);
  const H = P(7.4, 2.6);
  b.rc(P(4.5, 1), H, 2.3 * k, 1.6 * k, 30, 0.8 * k); // feathered neck
  b.el(H, [2.1 * k, 2.4 * k, 2.1 * k], 31, 0.6 * k); // bald, scabbed head
  const open = mode === 'fly';
  b.rc(P(8.8, 2.4), P(13.5, open ? 3.4 : 1.4), 1.15 * k, 0.15 * k, 32, 0.3 * k);
  if (open) b.rc(P(8.6, 1.6), P(12.5, -0.6), 0.9 * k, 0.12 * k, 32, 0.3 * k);
  for (const s of [-1, 1]) b.el(P(8.3, 3.1, s * 1.55), [0.55 * k, 0.55 * k, 0.55 * k], 33);
  // tail
  oel(b, P(-9.5, mode === 'perch' ? -1.6 : 0.4), nz(add(f, sc(u, mode === 'perch' ? -0.35 : 0.05))), X, [5 * k, (open ? 3.6 : 2.4) * k, 0.6 * k], 30, 0.6 * k);
  if (!open) {
    for (const s of [-1, 1]) { oel(b, P(-1.5, 1.2, s * 2.7), nz(add(f, sc(u, -0.15))), u, [7.8 * k, 2.6 * k, 0.9 * k], 30, 0.8 * k); // folded wings
      b.rc(P(0.5, -2.6, s * 1.2), add(P(0.5, -2.6, s * 1.4), [0, 0, -5 * k]), 0.45 * k, 0.4 * k, 32, 0.3 * k); }
  } else {
    for (const s of [-1, 1]) {
      const S0 = P(1.5, 1, s * 2.4), w = nz(add(sc(X, s * Math.cos(wingUp)), sc(u, Math.sin(wingUp)))), wr = add(add(S0, sc(w, 9 * k)), sc(f, 1 * k));
      b.rc(S0, wr, 1.6 * k, 1.0 * k, 30, 0.6 * k);
      oel(b, add(lp(S0, wr, 0.55), sc(f, -3 * k)), w, f, [5.5 * k, 3.6 * k, 0.55 * k], 30, 0.6 * k);
      for (let i = 0; i < 6; i++) { const d = nz(add(w, sc(f, -0.16 * i - 0.05))); b.rc(add(wr, sc(d, 0.5)), add(wr, sc(d, (11 - i * 0.9) * k)), 1.0 * k, 0.15 * k, 30, 0.2 * k); }
      b.rc(P(-1, -2.6, s * 1.2), P(-4.5, -4.2, s * 1.4), 0.45 * k, 0.35 * k, 32, 0.2 * k); // legs tucked
    }
  }
}
const crowMat = (m, x, y, z) => {
  if (m === 30) { const n = vn3(x * 0.6, y * 0.6, z * 0.6, 31); let c = mix(L('#18181c'), L('#0a0a0c'), n); if (vn3(x * 2.2, y * 2.2, z * 2.2, 32) > 0.7) c = mix(c, L('#2a3036'), 0.6); return { alb: mul(c, 0.6), spec: 0.12, gloss: 22, rim: 0.1, wrap: 0.1 }; }
  if (m === 31) { let c = mix(L('#8a6a62'), L('#4a3434'), vn3(x * 0.9, y * 0.9, z * 0.9, 33)); if (vn3(x * 1.6, y * 1.6, z * 1.6, 34) > 0.62) c = mix(c, S.bloodD, 0.7); return { alb: c, sss: 0.3, spec: 0.35, gloss: 40 }; }
  if (m === 32) return { alb: mix(L('#2e2a26'), L('#121010'), vn3(x, y, z, 35)), spec: 0.6, gloss: 50 };
  if (m === 33) return { alb: L('#c8c4ae'), spec: 1.0, gloss: 80, emi: [0.05, 0.05, 0.04] }; // milky, blind-looking
  return null;
};
export function corneilles(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const p = B();
  // the props they feed on: a corpse in the grass, a leaning grave cross
  const cr = graveCross(p, [-14, -10, 0], 46, -0.14, -0.1);
  const corpse = lyingCorpse(4, true);
  if (!tele) {
    crow(b, add(cr.bar, add(sc(cr.sv, -9), [0, 0, 10])), 0.9, 'perch', 1.3); crow(b, add(cr.top, [0, 0, 10]), -0.6, 'perch', 1.25);
    crow(b, [-2, 12, 16], 2.6, 'peck', 1.3); crow(b, [10, -2, 15], -1.4, 'peck', 1.3); crow(b, [18, 24, 9], -2.2, 'perch', 1.2);
  } else { // the whole murder lifts at once, wings up, beaks open: a spiral of black over the body
    const R = mulberry32(5);
    [[-16, 8, 26, 0.9], [18, 14, 34, 2.4], [-4, 22, 58, -0.5], [22, -10, 70, 1.7], [-22, -8, 82, -2.5]].forEach(([x, y, z, a], i) => crow(b, [x, y, z], a, 'fly', 1.25 + R() * 0.1, i & 1 ? 0.95 : 0.45));
    crow(b, [-6, 6, 7], 2.4, 'perch', 1.3); // one stays on the ground
  }
  const r = done(b, (m, x, y, z) => crowMat(m, x, y, z) || kitMat(m, x, y, z) || { alb: [0.1, 0.1, 0.1] }, { rim: 0.35 });
  r.subs = tele ? [] : [prop('cross', done(p, kitMat)), { name: 'corpse', model: { ...placed0(corpse, [4, 2, 0], 0.2), nomask: true } }];
  return r;
}
function placed0(m, pos, yaw) { // a model moved and turned about z
  const c = Math.cos(yaw), s = Math.sin(yaw), toL = (x, y, z) => { const dx = x - pos[0], dy = y - pos[1]; return [c * dx + s * dy, -s * dx + c * dy, z - pos[2]]; };
  const [x0, y0, z0, x1, y1, z1] = m.bounds, R = Math.hypot(Math.max(-x0, x1), Math.max(-y0, y1));
  return { sdf: (x, y, z) => { const q = toL(x, y, z); return m.sdf(q[0], q[1], q[2]); }, mat: (i, x, y, z, ...n) => { const q = toL(x, y, z); return m.mat(i, q[0], q[1], q[2], ...n); }, bounds: [pos[0] - R, pos[1] - R, z0 + pos[2], pos[0] + R, pos[1] + R, z1 + pos[2]], step: m.step };
}

// ======================= 2. L'ENTERRÉ =======================
// a dead man under his mound, only his face and his hands above the earth; 'tele': he tears up out of it from the waist,
// arms flung forward low along the ground for the ankles, jaw open, clods falling off him.
export function enterre(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const p = B();
  stele(p, [0, -24, 0], 13, 28, -0.16);
  if (!tele) mound(p, [0, 0, 0], 13, 23, 5.5);
  else { mound(p, [-13, -4, 0], 8, 16, 5); mound(p, [13, 0, 0], 7, 13, 4.5); }
  let J;
  if (!tele) {
    // lying face up just under the earth: the face and both hands break through
    const H = [0, -13, 5.2], hp = face(b, H, nz([0, 0.3, 1]), nz([0, -1, 0.3]), 0.72, 3.5, 0);
    hair(b, hp, 5, 11, 31, 0.7);
    b.rc([9, 0, 2], [11, 4, 7], 1.4, 1.1, 1, 0.6); claws(b, [11, 4, 7], [0.4, 1, -0.6], 1, 1, 2, 4.6, 1.0);
    b.rc([-9, 4, 2], [-11, 8, 6.5], 1.4, 1.1, 1, 0.6); claws(b, [-11, 8, 6.5], [-0.4, 1, -0.7], -1, 1, 2, 4.4, 1.0);
  } else {
    J = clone(std);
    Object.assign(J, { pelvis: [0, 0, 2], chest: [0, 11, 20], neck: [0, 18, 27], head: [0, 23, 29],
      Sr: [-8, 16, 25], Er: [-13, 28, 17], Wr: [-10, 42, 7], Hr_: [-9, 46, 4], Sl: [8, 16, 25], El: [14, 27, 15], Wl: [12, 40, 5], Hl_: [11, 44, 3],
      Hr: [-3.6, 0, -2], Kr: [-4, 0, -20], Ar: [-4, 0, -40], Tr: [-4, 4, -42], Hl: [3.6, 0, -2], Kl: [4, 0, -20], Al: [4, 0, -40], Tl: [4, 4, -42] });
    humanoid(J, b, { thin: 0.74 });
    face(b, add(J.head, [0, 0.5, 1]), nz([0, 1, 0.1]), nz([0, -0.1, 1]), 0.7, 9, 0);
    hair(b, (a, c, d) => add(J.head, [a * 0.7, c * 0.7 - 1.5, d * 0.7 + 1.5]), 12, 13, 31, 0.7);
    for (const [W, E, s] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, W, sub(W, E), s, 1, 2, 7, 1.3);
    // the shroud: torn strips hanging off his shoulders and arms; clods falling off him
    for (const [a0, d] of [[add(J.Sr, [-1, -2, 0]), [-3, -6, -16]], [add(J.Sl, [1, -2, 0]), [3, -5, -15]], [lp(J.Er, J.Wr, 0.3), [-1, 0, -9]], [lp(J.El, J.Wl, 0.4), [1, 0, -7]], [add(J.chest, [0, -5, 2]), [0, -6, -14]]])
      b.rcs(a0, add(a0, d), 2.4, 1.4, 43, 0.8, 0.5);
    const R = mulberry32(9); for (let i = 0; i < 14; i++) { const c = add(J.chest, [(R() - 0.5) * 30, (R() - 0.5) * 22, -2 - R() * 16]); if (c[2] > 2) b.el(c, [0.9 + R(), 0.9 + R(), 0.9 + R()], 40, 0); }
  }
  const mat = (m, x, y, z) => {
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    let c = skin(L('#8e8a6e'), L('#4e4a3a'), x, y, z, 21); // grave-grey, mottled
    c = mix(c, L('#2a2016'), clamp((vn3(x * 0.3, y * 0.3, z * 0.3, 22) - 0.4) * 2) * 0.7); // earth ground into him
    return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.15, gloss: 25 };
  };
  const r = tele ? ribbed(done(b, mat), J.chest, nz(sub(J.neck, J.pelvis)), 7) : done(b, mat);
  r.subs = [prop('grave', done(p, kitMat))];
  return r;
}

// ======================= 3. LE MENDIANT =======================
// a starved vampire on his knees in rags, hood down, holding out a skull for a cup; 'tele': he springs at you, the cup
// dropped, the hood thrown back, the jaw unhinged on its fangs, the eyes lit like embers.
export function mendiant(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const J = clone(std);
  Object.assign(J, tele ? {
    pelvis: [0, 6, 38], chest: [0, 14, 55], neck: [0, 20, 63], head: [0, 26, 66],
    Sr: [-7.5, 16, 60], Er: [-15, 24, 63], Wr: [-13, 36, 66], Hr_: [-12, 39, 66], Sl: [7.5, 16, 60], El: [15, 23, 58], Wl: [13, 35, 60], Hl_: [12, 38, 59.5],
    Hr: [-3.6, 6, 37], Kr: [-5, 20, 24], Ar: [-5, 16, 4], Tr: [-5, 22, 1.2], Hl: [3.6, 6, 37], Kl: [5, -4, 16], Al: [5, -18, 5], Tl: [5, -15, 1.2],
  } : {
    pelvis: [0, -4, 22], chest: [0, 2, 39], neck: [0, 7, 46], head: [0, 10, 46],
    Sr: [-7.5, 3, 43], Er: [-9, 10, 33], Wr: [-4, 17, 31], Hr_: [-2.5, 18, 31], Sl: [7.5, 3, 43], El: [9, 10, 33], Wl: [4, 17, 31], Hl_: [2.5, 18, 31],
    Hr: [-3.6, -3, 20], Kr: [-5, 12, 5], Ar: [-5, -6, 3], Tr: [-5, -12, 1.2], Hl: [3.6, -3, 20], Kl: [5, 12, 5], Al: [5, -6, 3], Tl: [5, -12, 1.2],
  });
  humanoid(J, b, { thin: 0.66 });
  const F = tele ? nz([0, 1, 0.2]) : nz([0, 0.6, -1]), U = tele ? nz([0, -0.2, 1]) : nz([0, 1, 0.6]);
  face(b, J.head, F, U, 0.68, tele ? 10 : 1.5, tele ? 18 : 0);
  if (tele) { for (const [W, E, s] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, W, sub(W, E), s, 1, 2, 5.5, 1.3); hair(b, (a, c, d) => add(J.head, [a * 0.68, c * 0.68 - 1, d * 0.68 + 1]), 9, 9, 52, 0.6); }
  // rags: a hooded cloak, the hood up when he begs; torn strips streaming off him when he leaps
  if (!tele) {
    b.f((x, y, z) => { const hc = add(J.head, [0, -1.2, 2]); return smax(sdEll(x, y, z, hc[0], hc[1], hc[2], 5.6, 6.4, 6.6), -sdEll(x, y, z, hc[0], hc[1] + 5.2, hc[2] - 4, 3.6, 3.4, 4.4), 0.8); }, [J.head[0] - 9, J.head[1] - 9, J.head[2] - 9, J.head[0] + 9, J.head[1] + 9, J.head[2] + 9], 45, 1, { pri: 1 });
    b.rev(0, -3, 0.5, 45, t => lerp(15, 8.5, Math.pow(t, 0.8)), 45, 1.4, 0.85, { fold: [11, 1.8] });
  } else {
    for (const [a0, d] of [[add(J.neck, [-3, -3, 0]), [-6, -20, -16]], [add(J.neck, [3, -3, 0]), [7, -22, -12]], [add(J.chest, [0, -4, -2]), [1, -24, -22]], [add(J.pelvis, [-3, -3, 0]), [-4, -16, -22]], [add(J.pelvis, [4, -3, 0]), [5, -14, -26]]])
      b.rcs(a0, add(a0, d), 3.6, 1.6, 45, 1.0, 0.45);
    b.rev(J.pelvis[0], J.pelvis[1], J.pelvis[2] - 12, J.pelvis[2] + 3, t => lerp(9, 6, t), 45, 1, 0.8, { fold: [7, 1.4] });
  }
  // the skull cup
  const cup = tele ? [10, 34, 3] : add(lp(J.Hr_, J.Hl_, 0.5), [0, 3, 1.5]);
  b.f((x, y, z) => smax(sdEll(x, y, z, cup[0], cup[1], cup[2], 4, 4.6, 3.4), -sdEll(x, y, z, cup[0], cup[1], cup[2] + (tele ? 0 : 2.4), 3.1, 3.7, 2.8), 0.3), [cup[0] - 6, cup[1] - 6, cup[2] - 6, cup[0] + 6, cup[1] + 6, cup[2] + 6], 16, 0.2);
  const mat = (m, x, y, z) => {
    if (m === 18) return glow(EMBER, 0.9);
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    let c = skin(L('#a49a90'), L('#5a524c'), x, y, z, 51); // the vampire's ash-white, starved
    if (Math.hypot(x - J.head[0], y - J.head[1] - 4, z - J.head[2] + 5) < 5) c = mix(c, S.bloodD, 0.6);
    return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.2, gloss: 35 };
  };
  const r = ribbed(done(b, mat), J.chest, nz(sub(J.neck, J.pelvis)), 7);
  r.lights = tele ? [{ p: add(J.head, sc(F, 9)), c: L('#d03018'), I: 0.9, r0: 8, R: 50, pad: 2, haze: 0.05, hazeR: 2 }] : [];
  return r;
}

// ======================= 4. LA PÊCHEUSE =======================
// a flat, wide-mouthed thing lying low behind a grave; a stalk from its brow hangs a pale glowing bulb just over the
// stone, where a grave candle would burn. 'tele': it rears, the mouth gaping open on needle teeth taller than the hero's
// head, the lure swung back over it.
export function pecheuse(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const p = B();
  if (!tele) { stele(p, [0, 34, 0], 13, 21, 0.06); }
  const lift = tele ? 1 : 0;
  // the body: a low, wet, wide sack of skin, a ridge of spine, stumpy fore-limbs
  oelN(b, [0, -20, 6 + 6 * lift], nz([0, 1, 0.3 * lift]), [1, 0, 0], [25, 21, tele ? 9 : 6.5], 1, 3, 1.0, 0.3);
  for (let i = 0; i < 9; i++) b.el([0, -38 + i * 4.6, (tele ? 16 : 11) + (tele ? i * 1.6 : Math.sin(i * 0.4) * 1.5)], [1.7, 1.7, 1.9], 1, 1.2);
  for (const s of [-1, 1]) { const sh = [s * 15, -4, 7 + 8 * lift], el = [s * 27, 0, 9 + 5 * lift], wr = [s * 23, 12, 1.5]; b.rc(sh, el, 4, 3, 1, 1.5); b.rc(el, wr, 3, 2, 1, 1); claws(b, wr, [s * 0.3, 1, -0.3], s, 1, 2, 4.4, 1.1); }
  // the head: two jaws hinged at the back of the mouth
  const hinge = [0, 2, tele ? 22 : 7], gape = tele ? 1.25 : 0.02;
  const up = nz([0, Math.cos(0.12 + gape), Math.sin(0.12 + gape)]), lo = nz([0, Math.cos(-0.12 - 0.2 * lift), Math.sin(-0.12 - 0.2 * lift)]);
  const jawU = add(hinge, sc(up, 14)), jawL = add(hinge, sc(lo, 14));
  oelN(b, jawU, up, [1, 0, 0], [15, 14, tele ? 5 : 4], 1, 2, 1.4, 0.4); oelN(b, jawL, lo, [1, 0, 0], [15, 15, tele ? 4.5 : 3.6], 1, 2, 1.4, 0.4);
  if (tele) b.f((x, y, z) => sdEll(x, y, z, hinge[0], hinge[1] + 10, hinge[2] + 4, 11, 12, 12), [hinge[0] - 13, hinge[1] - 4, hinge[2] - 10, hinge[0] + 13, hinge[1] + 24, hinge[2] + 18], 0, 1, { sub: true });
  for (const [J0, d, s] of [[jawU, up, -1], [jawL, lo, 1]]) { // needle teeth round each jaw's rim, pointing across the mouth
    const n = crs([1, 0, 0], d);
    for (let i = 0; i < 15; i++) { const a = (i / 14 - 0.5) * 2.6, rim = add(J0, add(sc(d, 13 * Math.cos(a) - 1), add([12 * Math.sin(a), 0, 0], sc(n, s * 2)))); const len = (tele ? 4 : 2.6) + (tele ? 4 : 1.6) * Math.cos(a) * (i % 2 ? 0.6 : 1); b.rc(rim, add(rim, add(sc(n, s * len), sc(d, -1))), 0.5, 0.06, 7); }
  }
  for (const sd of [-1, 1]) b.el(add(jawU, add(sc(up, -5), [sd * 9.5, 0, tele ? 3 : 3.4])), [1.0, 1.0, 1.0], 33); // pin eyes
  // the lure: a stalk off the brow, a glowing bulb at its end
  const st0 = add(jawU, add(sc(up, -9), [0, 0, 3])), bulb = tele ? [0, -26, 66] : [0, 34, 28];
  const st1 = tele ? [0, -10, 70] : [0, 6, 30], st2 = tele ? [0, -24, 73] : [0, 30, 34];
  b.rc(st0, st1, 1.3, 0.8, 1, 0.6); b.rc(st1, st2, 0.8, 0.5, 1, 0.3); b.rc(st2, bulb, 0.5, 0.4, 1, 0.3);
  b.el(bulb, [1.7, 1.7, 2.4], 17, 0);
  const mat = (m, x, y, z) => {
    if (m === 17) return glow([1.5, 1.25, 0.55], tele ? 0.9 : 1.3);
    if (m === 33) return glow([0.6, 0.65, 0.42], 0.45);
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    let c = mix(L('#3e3424'), L('#14100a'), clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 61) * 1.7 - 0.4)); // dark, wet, warty
    if (vn3(x * 1.1, y * 1.1, z * 1.1, 62) > 0.74) c = mix(c, L('#5e5236'), 0.6);
    if (z < 4) c = mix(c, L('#7a6e5a'), 0.3); // a paler belly
    if (tele && Math.hypot(x - hinge[0], y - hinge[1] - 10, z - hinge[2] - 4) < 13.5) c = mix(L('#5a0c12'), L('#1a0406'), vn3(x * 0.5, y * 0.5, z * 0.5, 63));
    return { alb: c, sss: 0.2, wrap: 0.2, spec: 0.08, gloss: 30, rim: 0.2 };
  };
  const r = done(b, mat, { rim: 0.25 });
  r.subs = tele ? [] : [prop('grave', done(p, kitMat))];
  r.lights = [{ p: add(bulb, [0, 3, -1]), c: L('#e0c880'), I: tele ? 1.6 : 2.4, r0: 14, R: 140, pad: 3, haze: 0.06, hazeR: 3 }];
  return r;
}

// ======================= 5. LE GAVÉ =======================
// a hairless corpse-eater squatting over the dead, its belly a sack stretched round what it swallowed; 'tele': it rears
// back off its meal, the belly heaving, the throat bulging, the jaw unhinged: the black bile comes next.
export function gave(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el } = b;
  const J = tele ? {
    pelvis: [0, -10, 30], chest: [0, -4, 60], neck: [0, 0, 72], head: [0, 6, 80],
    Sr: [-13, -2, 66], Er: [-25, 0, 52], Wr: [-20, 16, 40], Hr_: [-17, 19, 39], Sl: [13, -2, 66], El: [25, 0, 52], Wl: [20, 16, 42], Hl_: [17, 19, 41],
    Hr: [-8, -10, 28], Kr: [-20, 6, 30], Ar: [-15, -6, 4], Tr: [-16, 2, 1.2], Hl: [8, -10, 28], Kl: [20, 6, 30], Al: [15, -6, 4], Tl: [16, 2, 1.2],
  } : {
    pelvis: [0, -14, 28], chest: [0, 6, 46], neck: [0, 16, 48], head: [0, 26, 30],
    Sr: [-13, 10, 50], Er: [-22, 18, 32], Wr: [-11, 30, 9], Hr_: [-9, 32, 6], Sl: [13, 10, 50], El: [22, 18, 32], Wl: [11, 30, 9], Hl_: [9, 32, 6],
    Hr: [-8, -14, 26], Kr: [-20, 2, 30], Ar: [-15, -10, 4], Tr: [-16, -2, 1.2], Hl: [8, -14, 26], Kl: [20, 2, 30], Al: [15, -10, 4], Tl: [16, -2, 1.2],
  };
  humanoid(J, b, { thin: 1.25 });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 4.2, 3, 1, 1.5); claws(b, W, sub(W, E), 1, 1, 2, 6, 1.2); }
  for (const [H1, K1, A1] of [[J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(H1, K1, 6, 4, 1, 2); rc(K1, A1, 4, 2.6, 1, 1); }
  // the belly: a stretched sack hanging between its knees, heaving forward when it rears
  const bc = tele ? [0, 6, 36] : [0, 2, 24], br = tele ? [18, 17, 20] : [17, 16, 16];
  oelN(b, bc, [0, 1, tele ? 0.2 : 0], [1, 0, 0], [br[1], br[0], br[2]], 20, 6, 2.6, 0.16);
  oelN(b, add(bc, [0, 4, -12]), [0, 1, 0], [1, 0, 0], [br[1] * 1.05, br[0] * 1.1, br[2] * 0.75], 20, 6, 1.6, 0.18); // the sag of it
  for (let i = 0; i < 8; i++) el(add(lp(J.pelvis, J.neck, i / 7), [0, -6.5 - 2 * Math.sin(i / 7 * 3.1), 2]), [1.8, 1.8, 1.8], 1, 1.2); // spine
  const F = tele ? nz([0, 0.75, 0.75]) : nz([0, 0.5, -1]), U = tele ? nz([0, -0.75, 0.75]) : nz([0, 1, 0.5]);
  const hp = face(b, J.head, F, U, 1.3, tele ? 14 : 4, 17);
  if (tele) { el(add(J.neck, [0, 3, -2]), [6.5, 6, 7], 20, 2); // the throat bulging
    const m0 = hp(0, 7, -8); for (const [dx, len] of [[-1.5, 30], [1, 46], [2.5, 22]]) b.chain([...Array(5)].map((_, i) => add(m0, [dx + Math.sin(i) * 0.6, 2 + i * 0.8, -i * len / 4])), 0.9 - 0.1 * dx, 44); }
  const mat = (m, x, y, z) => {
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    if (m === 20) { // the belly: stretched yellow-grey skin, blue veins, the dark shapes of what is inside pressing on it
      let c = mix(L('#9c8a70'), L('#5a4a3a'), vn3(x * 0.12, y * 0.12, z * 0.12, 71));
      if (Math.abs(vn3(x * 0.25, y * 0.25, z * 0.25, 72) - 0.5) < 0.035) c = mix(c, L('#3e3a52'), 0.75);
      const sh = vn3(x * 0.08, y * 0.08, z * 0.08, 73); if (sh > 0.6) c = mix(c, L('#3a2018'), clamp((sh - 0.6) * 3) * 0.75);
      return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.3, gloss: 45, rim: 0.5 };
    }
    let c = skin(L('#9a8c6c'), L('#5a4c3a'), x, y, z, 74);
    const md = Math.hypot(x - J.head[0], y - J.head[1] - 6, z - J.head[2] + (tele ? -4 : 6)); if (md < 11) c = mix(c, S.blood, clamp((11 - md) / 5) * 0.85);
    if (z < 8) c = mix(c, S.bloodD, 0.5);
    return { alb: c, sss: 0.4, wrap: 0.3, spec: 0.3, gloss: 40 };
  };
  const r = ribbed(done(b, mat, { size: 1.3, rim: 0.7 }), J.chest, nz(sub(J.neck, J.pelvis)), 8);
  r.subs = [{ name: 'meal', model: { ...placed0(lyingCorpse(8, true), tele ? [-4, 34, 0] : [0, 36, 0], tele ? 1.9 : 1.57), nomask: true } }];
  return r;
}

// ======================= 6. LE FOUISSEUR =======================
// a spade-clawed mole of a ghoul, blind, its snout a star of naked feelers: it hunts by sound. At rest it waits half out
// of its hole, listening; 'tele': it heaves up out of the earth, both spades raised over its head, the star flared.
function spade(b, W, d, k = 1) { // a digging hand: a broad palm and five flat, thick nails
  d = nz(d); const sv = nz(crs(d, [0, 0, 1])), n = crs(sv, d);
  obox(b, add(W, sc(d, 4 * k)), d, sv, [5 * k, 6 * k, 1.8 * k], 1, 1.2, 1.2);
  for (let f = 0; f < 5; f++) { const o = (f - 2) * 2.4 * k, base = add(W, add(sc(d, 8 * k), sc(sv, o))), tip = add(base, add(sc(d, 9 * k), sc(n, -2 * k))); b.rc(base, tip, 1.5 * k, 0.4 * k, 2, 0.4); }
}
export function fouisseur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const p = B(); const { rc, el } = b;
  const J = tele ? {
    pelvis: [0, -6, 38], chest: [0, 0, 64], neck: [0, 6, 76], head: [0, 14, 82],
    Sr: [-20, 0, 72], Er: [-31, 4, 94], Wr: [-22, 8, 114], Sl: [20, 0, 72], El: [31, 4, 94], Wl: [22, 8, 114],
    Hr: [-10, -6, 36], Kr: [-14, 6, 20], Ar: [-13, -4, 4], Hl: [10, -6, 36], Kl: [14, 6, 20], Al: [13, -4, 4],
  } : {
    pelvis: [0, -14, -6], chest: [0, 0, 20], neck: [0, 12, 27], head: [0, 22, 30],
    Sr: [-19, 4, 26], Er: [-30, 10, 14], Wr: [-27, 18, 3], Sl: [19, 4, 26], El: [30, 10, 14], Wl: [27, 18, 3],
  };
  // a barrel of a body, hunched shoulders, a short thick neck
  oelN(b, lp(J.pelvis, J.chest, 0.45), nz(sub(J.chest, J.pelvis)), [1, 0, 0], [26, 20, 17], 1, 4, 1.4, 0.25);
  oelN(b, add(J.chest, [0, -2, 4]), [1, 0, 0], [0, 1, 0.3], [24, 15, 14], 1, 5, 1.2, 0.3);
  rc(J.chest, J.neck, 13, 9, 1, 4);
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { el(S1, [8, 8, 8], 1, 3); rc(S1, E, 7.5, 5.5, 1, 2.5); rc(E, W, 5.5, 4.2, 1, 1.5); spade(b, W, tele ? nz([0, 0.8, -0.3]) : sub(W, E), 1.15); }
  if (tele) for (const [H1, K1, A1] of [[J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(H1, K1, 8, 6, 1, 2); rc(K1, A1, 6, 4, 1, 1.5); spade(b, A1, [0, 1, -0.2], 0.7); }
  // the head: a blind wedge, folds of skin where the eyes would be, two long incisors, the star of feelers on its snout
  const Hd = J.head, f = tele ? nz([0, 1, 0.45]) : nz([0, 1, 0.2]), up = tele ? nz([0, -0.45, 1]) : nz([0, -0.2, 1]);
  oelN(b, Hd, f, [1, 0, 0], [11, 9, 8], 1, 2, 0.8, 0.4);
  const sn = add(Hd, sc(f, 12)); rc(add(Hd, sc(f, 5)), sn, 6, 4, 1, 1.5);
  for (const s of [-1, 1]) { rc(add(Hd, add(sc(f, 4), add([s * 7, 0, 0], sc(up, 3)))), add(Hd, add(sc(f, 7), add([s * 6, 0, 0], sc(up, 2)))), 1.2, 0.8, 1, 0.8); }
  for (const s of [-1, 1]) rc(add(sn, add([s * 1.2, 0, 0], sc(up, -4))), add(sn, add(add([s * 1.2, 0, 0], sc(up, -10)), sc(f, -1))), 1.1, 0.7, 7, 0.2);
  const nf = tele ? 9 : 6;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, u = add(sc([1, 0, 0], Math.cos(a)), sc(up, Math.sin(a))); const t0 = add(sn, sc(u, 2.5)); rc(t0, add(add(t0, sc(u, nf * (i & 1 ? 0.7 : 1))), sc(f, tele ? 2 : 3)), 1.9, 0.9, 21, 0.5); }
  for (let i = 0; i < 14; i++) { const t = i / 13, a = (t - 0.5) * 2.4, q = add(lp(J.chest, J.neck, 0.4), [Math.sin(a) * 18, -10 * Math.cos(a), 10 * Math.cos(a)]); rc(q, add(q, [Math.sin(a) * 2, -3, 3]), 0.35, 0.1, 13); } // bristles
  // the hole it waits in: turned earth round a black mouth
  if (!tele) { for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mound(p, [Math.cos(a) * 34, Math.sin(a) * 26 - 4, 0], 12, 9, 6 + (i % 3) * 2); } b.f((x, y, z) => sdEll(x, y, z, 0, -4, 0, 31, 24, 0.6), [-33, -30, -2, 33, 22, 2], 46, 0); }
  const mat = (m, x, y, z) => {
    if (m === 46) return { alb: [0.004, 0.003, 0.003], spec: 0, noAO: true };
    if (m === 21) return { alb: mix(L('#9a4a46'), L('#5a2226'), vn3(x * 0.8, y * 0.8, z * 0.8, 81)), sss: 0.6, spec: 0.6, gloss: 50 };
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    let c = mix(L('#6e5a50'), L('#30241e'), clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 82) * 1.6 - 0.3)); // naked, wrinkled, grey-pink
    if (Math.abs(Math.sin(x * 0.9 + z * 0.4) * Math.sin(y * 0.7 + z * 0.9)) > 0.93) c = mul(c, 0.6); // folds
    c = mix(c, L('#2a2016'), clamp((vn3(x * 0.2, y * 0.2, z * 0.2, 83) - 0.45) * 2.5) * 0.8); // earth caked on
    if (z < 12 && !tele) c = mix(c, L('#1e1810'), 0.6);
    return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.25, gloss: 35 };
  };
  const r = done(b, mat, { size: 1.4, rim: 0.7 });
  if (!tele) r.subs = [prop('hole', done(p, kitMat))];
  return r;
}

// ======================= 7. LA CHOSE DU GOUFFRE =======================
// it lives in the chasm under the bridge: two huge drowned-white hands grip the edge, the crown of a head and two pale
// eyes just over it. 'tele': the head rises, mouth open in rings of teeth, one arm reared high over the bridge.
function bigHand(b, W, d, k, splay = 1, curl = 0.6) { // a huge bony hand at wrist W reaching along d, fingers curled down by curl
  d = nz(d); const sv = nz(crs(d, [0, 0, 1])), n = crs(sv, d);
  oelN(b, add(W, sc(d, 6 * k)), d, sv, [7 * k, 5.2 * k, 2.2 * k], 1, 1.5 * k, 0.6, 0.3);
  for (let f = 0; f < 5; f++) {
    const thumb = f === 4, o = thumb ? 9 * k : (f - 1.5) * 4.2 * k * splay, base = add(W, add(sc(d, thumb ? 6 * k : 14 * k), sc(sv, o)));
    let dir = nz(add(d, sc(sv, (thumb ? 0.9 : (f - 1.5) * 0.12) * splay))); let p0 = base; const L0 = (thumb ? 8 : 11 - Math.abs(f - 1.5) * 1.2) * k * 0.62;
    for (let s = 0; s < 3; s++) { const p1 = add(p0, sc(dir, L0 * (1 - s * 0.18))); b.rc(p0, p1, (1.25 - s * 0.25) * k, (1.0 - s * 0.25) * k, 1, 0.3 * k); b.el(p1, [1.35 * k, 1.35 * k, 1.35 * k].map((v) => v * (1 - s * 0.2)), 1, 0.25 * k); p0 = p1; dir = nz(add(dir, sc(n, -curl))); }
    b.rc(p0, add(p0, sc(dir, 4 * k)), 0.7 * k, 0.1 * k, 2, 0.2);
  }
}
export function gouffre(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el } = b;
  const k = 2.2;
  // the head: a starved, drowned skull of a face, wet hair hanging off it, pale eyes; the jaw drops when it rises
  const H = tele ? [0, -40, 52] : [0, -34, -4], F = tele ? nz([0, 1, 0.25]) : nz([0, 1, 0.45]), U = tele ? nz([0, -0.25, 1]) : nz([0, -0.45, 1]);
  const X = nz(crs(F, U)), q = 1.9, op = tele ? 9 : 1, hp = (a, c, d) => add(H, add(sc(X, a * q), add(sc(F, c * q), sc(U, d * q))));
  oelN(b, hp(0, -2, 4), F, X, [15 * q, 11 * q, 14 * q], 1, 3, 1.4, 0.15); // a long, swollen cranium, no ears
  b.rc(hp(-8, 9, 4), hp(8, 9, 4), 2.6 * q, 2.6 * q, 1, 2); for (const sd of [-1, 1]) b.el(hp(sd * 9, 6, -2), [3 * q, 3 * q, 3 * q], 1, 2);
  for (const sd of [-1, 1]) { b.carve(hp(sd * 5, 11, 1), 3.2 * q, 1); b.el(hp(sd * 5, 9.4, 1), [1.3 * q, 1.3 * q, 1.3 * q], 17); b.carve(hp(sd * 1.5, 13, -4), 1.3 * q, 0.5); }
  for (const sd of [-1, 1]) b.rc(hp(sd * 9, 1, -5), hp(sd * 3, 10, -13 - op), 3 * q, 2 * q, 1, 2); b.el(hp(0, 10.5, -14 - op), [3.6 * q, 3 * q, 2.6 * q], 1, 2);
  for (let t = -1; t <= 1; t += 0.5) b.carve(hp(t * 5, 12.5, -8.5 - op * 0.45), (2.6 + op * 0.28) * q, 0.6);
  for (let i = 0; i < 9; i++) { const u = hp(-6 + i * 1.5, 11.6, -6.6), l = hp(-5.6 + i * 1.4, 11, -11.5 - op); b.rc(u, add(u, sc(U, -2.6 * q)), 0.55 * q, 0.1, 7); b.rc(l, add(l, sc(U, 2.2 * q)), 0.5 * q, 0.1, 7); }
  hair(b, (a, c, d) => hp(a * 1.6, c * 1.6 - 4, d * 1.6 + 2), tele ? 46 : 22, 15, 97, 2.2);
  const mo = hp(0, 10, -10 - op * 0.5);
  // shoulders and arms out of the dark
  const Sh = (s) => tele ? [s * 34, -52, 18] : [s * 34, -48, -36];
  rc(Sh(-1), Sh(1), 12, 12, 1, 6); rc(lp(Sh(-1), Sh(1), 0.5), add(H, sc(U, -10)), 9, 7, 1, 4);
  const grip = (s, x) => { const W = [x, -20, -3], E = [s * 46, -44, -34]; rc(Sh(s), E, 9, 7, 1, 3); rc(E, W, 7, 5.5, 1, 2); el(E, [8, 8, 8], 1, 2); bigHand(b, W, [s * -0.15, 1, 0.12], k, 1, 0.35); };
  grip(1, 30);
  if (!tele) grip(-1, -30);
  else { const E = [-62, -28, 64], W = [-40, -6, 112]; rc(Sh(-1), E, 9, 7, 1, 3); rc(E, W, 7, 5.5, 1, 2); el(E, [8, 8, 8], 1, 2); bigHand(b, W, [0.3, 0.6, 0.5], k, 1.5, 0.5); }
  const mat = (m, x, y, z) => {
    if (m === 17) return glow([0.85, 0.88, 0.7], 0.55);
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    let c = mul(skin(L('#9a9e8e'), L('#4e5450'), x, y, z, 91), 0.8); // drowned white, grey-green in its folds
    if (Math.abs(vn3(x * 0.15, y * 0.15, z * 0.15, 92) - 0.5) < 0.03) c = mix(c, L('#3a3e52'), 0.7); // veins
    c = mix(c, L('#2a3024'), clamp((vn3(x * 0.1, y * 0.1, z * 0.1, 93) - 0.55) * 3) * 0.6); // slime, lichen
    if (Math.hypot(x - mo[0], y - mo[1], z - mo[2]) < (tele ? 16 : 9)) c = mix(c, S.bloodD, 0.6);
    c = mul(c, clamp(0.25 + (z + 50) / 70)); // darker as it sinks into the chasm
    return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.6, gloss: 50 };
  };
  return done(b, mat, { size: 2.4, rim: 0.6 });
}

// ======================= 8. LA PLEUREUSE =======================
// a veiled mourner of grey stone on a tomb, her hands over her face, black tears down her cheeks. She moves only when no
// light is on her. 'tele': off her plinth, the veil fallen, the stone face split on a wet mouth of teeth, the head
// lolling on its side, stone claws out.
export function pleureuse(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const p = B(); const z0 = tele ? 0 : 10;
  const J = clone(std); for (const key in J) J[key][2] = J[key][2] * 1.04 + z0;
  Object.assign(J, tele ? {
    head: [6, 12, 92], neck: [2, 8, 86], chest: [0, 6, 74], pelvis: [0, 0, 52],
    Sr: [-9, 7, 81], Er: [-15, 20, 76], Wr: [-11, 34, 72], Hr_: [-10, 37, 71], Sl: [9, 7, 81], El: [15, 18, 70], Wl: [12, 32, 64], Hl_: [11, 35, 63],
  } : {
    head: [0, 2.5, 94 + z0], neck: [0, 1.5, 86 + z0], Sr: [-8.5, 0.5, 81 + z0], Er: [-8.5, 9, 74 + z0], Wr: [-3, 10, 90 + z0], Hr_: [-2, 10.4, 93.5 + z0],
    Sl: [8.5, 0.5, 81 + z0], El: [8.5, 9, 74 + z0], Wl: [3, 10, 90 + z0], Hl_: [2, 10.4, 93.5 + z0],
  });
  humanoid(J, b, { thin: 0.88 });
  b.rev(J.pelvis[0], J.pelvis[1] * 0.5, z0 + 0.5, z0 + 80, t => t < 0.7 ? lerp(15, 9, Math.pow(t / 0.7, 0.8)) : lerp(9, 7.5, (t - 0.7) / 0.3), 1, 1.5, 0.85, { fold: [10, 2.0] });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { b.rc(S1, E, 3.2, 3.4, 1, 1.2); b.rc(E, lp(E, W, 0.8), 3.4, 4.6, 1, 0.8); }
  const Hd = J.head;
  if (!tele) { // the veil over her head and hands, falling to her shoulders and down her back
    b.f((x, y, z) => sdEll(x, y, z, Hd[0], Hd[1] - 0.6, Hd[2] + 0.8, 5.8, 6.6, 6.8), [Hd[0] - 8, Hd[1] - 8, Hd[2] - 8, Hd[0] + 8, Hd[1] + 8, Hd[2] + 8], 1, 1, { pri: 1 });
    b.rcs(add(Hd, [0, -1, 1]), add(J.chest, [0, -3, -4]), 6.5, 12, 1, 1.5, 0.75);
    b.rcs(add(J.chest, [0, -5, 4]), [0, -9, z0 + 2], 9, 14, 1, 1.5, 0.45);
  } else {
    const F = nz([0.25, 1, -0.1]), U = nz([0.75, 0, 0.66]); // the head lolled onto her shoulder
    face(b, Hd, F, U, 0.8, 7, 0); b.rcs(add(J.neck, [0, -3, 0]), add(J.pelvis, [0, -8, -10]), 8, 13, 1, 1.5, 0.45); // the veil fallen down her back
    for (const [W, E, s] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, W, sub(W, E), s, 1, 2, 6, 1.3);
    const R = mulberry32(4); for (let i = 0; i < 7; i++) b.el([(R() - 0.5) * 30, (R() - 0.5) * 20 + 6, 1.2], [1.4 + R() * 1.4, 1.2 + R(), 1 + R()], 1, 0); // stone flakes at her feet
  }
  if (!tele) obox(p, [0, -2, 5], [1, 0, 0], [0, 1, 0], [20, 16, 5], 41, 0, 1); // the tomb she stands on
  const mat = (m, x, y, z) => {
    if (tele && (m === 2 || m === 7)) return kitMat(m, x, y, z);
    const st = kitMat(41, x * 1.4, y * 1.4, z * 0.8); let c = mix(st.alb, L('#7a7466'), 0.35);
    // black tears from the eyes down her cheeks and robe; when she wakes the stone bleeds from its cracks and the mouth is flesh
    if (!tele && Math.abs(Math.abs(x - Hd[0]) - 1.8 - 0.4 * Math.sin(z * 0.7)) < 0.5 && z < Hd[2] && z > z0 + 30 && y > 0) c = mix(c, L('#0e0c0a'), 0.85);
    if (tele) { const cr = Math.abs(vn3(x * 0.3, y * 0.3, z * 0.3, 95) - 0.5); if (cr < 0.018 && z > 30) c = mix(S.bloodF, S.blood, cr * 40);
      if (Math.hypot(x - Hd[0], y - Hd[1] - 3, z - Hd[2] + 2) < 5.5) c = mix(c, mix(L('#6a1a1a'), S.bloodD, vn3(x, y, z, 96)), 0.85); }
    return { alb: c, spec: 0.08, gloss: 15, wrap: 0.2 };
  };
  const r = done(b, mat, { rim: 0.8 });
  if (!tele) r.subs = [prop('tomb', done(p, kitMat))];
  return r;
}
