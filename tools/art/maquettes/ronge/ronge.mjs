// Le Rongé redrawn (mockup only, docs/lore.md): three proposals, each a man who was a vampire, crouched or bowed but a
// man, half gone ghoul. Built like the foes (../ennemis/foes.mjs B(), ../ennemis/cast.mjs humanoid(), the starved
// vampire's head of ../boss/nourrices.mjs face()), clothed in the rags of a vampire's coat (the hero's black cloth, its
// violet lining). x = his left, y = forward, z = up, feet at z = 0, the hero ~100 tall.
// Each design(pose), pose 'idle' | 'speak' (he leans out to talk) | 'beast' (too long without blood), returns a model
// as the foes do; `subs` are props: `scene` ones only on the card (the room has its own), the others go in the sprite.
import { sdEll, sdBox, sdRC, smax, clamp, lerp, vn3, fbm3, h2, L, mix, mul, mulberry32, setMat, MAT } from '../ennemis/lib.mjs';
import { humanoid, std, S } from '../ennemis/cast.mjs';
import { B, done, glow, claws, goldM, ironM } from '../ennemis/foes.mjs';
import { face, hair, ribbed, skin, common } from '../boss/nourrices.mjs';
import { chainLinks } from '../boss/bosses.mjs';
import { add, sub, sc, nz, lp, crs, dot, clone, oel, oelN, obox, kitMat } from '../necropole/kit.mjs';
import { basin2 } from '../hub3/props3.mjs';
import { MAT as GMAT } from '../grand/lib.mjs';

const EMBER = [0.5, 0.01, 0.005], RAGE = [1.0, 0.03, 0.015]; // a vampire's eyes (the hero's embers); gone beast, they blaze
const C = { coat: L('#1e1c1c'), coatW: L('#34302c'), lining: L('#4c2a5a'), mud: L('#2c2418'), pants: L('#2a221c'), burlap: L('#5a4a34'), burlapD: L('#2e2418'), rope: L('#6a5a3c') };
const M = { SKIN: 1, COAT: 20, PANTS: 21, BLOOD: 22, GOLD: 23, FLAME: 24, BURLAP: 25, ROPE: 26, WOOD: 42, BONE: 16, IRON: 9, HAIR: 13, EYE: 18, NICHE: 27, SKULLS: 28 };

/** The rags of a vampire's long coat thrown over shoulders `N` and hanging to `G` (its hem's centre, behind him): a cone
 *  of cloth r0 wide at the top, r1 at the hem, open in front (toward F) by `open` radians, a collar up behind the head,
 *  the hem torn in strips, moth holes. Its inside (toward the axis) is the violet lining. */
function coat(b, N, G, F, r0, r1, o = {}) {
  const A = sub(G, N), len = Math.hypot(...A), a = sc(A, 1 / len), Fp = nz(sub(F, sc(a, dot(F, a)))), Xp = crs(a, Fp);
  const open = o.open ?? 1.1, th = o.th ?? 0.7, seed = o.seed ?? 3, collar = o.collar ?? 0.22, torn = o.torn ?? 0.22;
  const e = r1 + 4, lo = [Math.min(N[0], G[0]) - e, Math.min(N[1], G[1]) - e, Math.min(N[2], G[2]) - e], hi = [Math.max(N[0], G[0]) + e, Math.max(N[1], G[1]) + e, Math.max(N[2], G[2]) + e + collar * len];
  b.f((x, y, z) => {
    const v = [x - N[0], y - N[1], z - N[2]], t = dot(v, a) / len, q = sub(v, sc(a, t * len)), r = Math.hypot(...q);
    const ang = Math.atan2(dot(q, Xp), dot(q, Fp)), back = clamp(-Math.cos(ang));
    const R = lerp(r0, r1, Math.pow(clamp(t), 0.8)) + 0.9 * Math.sin(ang * 7 + 3 * vn3(x * 0.1, y * 0.1, z * 0.1, seed)) * clamp(t) - (t < 0 ? t * 2.5 * back : 0);
    let d = Math.abs(r - R) - th;
    d = Math.max(d, (open * (1 - 0.5 * clamp(-t * 4)) - Math.abs(ang)) * Math.max(r, 3)); // open in front, wider at the collar
    const strip = Math.floor((ang + 4) * 5.5), hem = 1 - torn * h2(strip, 3, seed) - (h2(strip, 5, seed) < 0.25 ? torn * 1.4 : 0);
    d = Math.max(d, (t - hem) * len, (-t - collar * back * back) * len);
    d = Math.max(d, (vn3(x * 0.3, y * 0.3, z * 0.3, seed + 9) - 0.83) * 5); // moth holes
    return d * 0.8;
  }, [...lo, ...hi], M.COAT, 0, { coat: { a, N, len } });
}
/** A sleeve of the coat round the arm S-E, torn short of the elbow. */
const sleeve = (b, S1, E, k = 1) => b.rc(S1, lp(S1, E, 0.75), 2.7 * k, 2.1 * k, M.COAT, 0.6);

/** The man himself: humanoid() on joints J (../ennemis/cast.mjs std's names), gaunt, the arms long, a starved vampire's
 *  head looking along F (up U), jaw open by `jaw`, lank hair; trousers in rags; claws. */
function man(b, J, F, U, o = {}) {
  humanoid(J, b, { thin: o.thin ?? 0.62, legM: M.PANTS, pelvisM: M.PANTS });
  const hs = o.s ?? 0.66, hp = face(b, J.head, F, U, hs, o.jaw ?? 1.5, 0);
  for (const sd of [-1, 1]) b.el(hp(sd * 2.3, 5.3, 1.1), [1.0, 1.0, 1.0], M.EYE); // two embers, big enough to read in the room
  b.el(hp(0, -2.4, 2.6), [6.7 * hs, 6.9 * hs, 6.2 * hs], M.HAIR, 0.3); // what hair he has left, plastered to the skull
  hair(b, (a, c, d) => add(J.head, add(sc(crs(F, U), a * hs), add(sc(F, (c - 1.5) * hs), sc(U, (d + 1) * hs)))), o.hair ?? 13, 15, o.seed ?? 21, 0.62);
  for (const [Hh, K, A] of [[J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { b.rc(Hh, K, 3.3, 2.6, M.PANTS, 0.8); b.rc(K, lp(K, A, 0.8), 2.6, 2.2, M.PANTS, 0.6); } // trousers gone to rags, baggy on the bones
  for (const [W, E, H, s] of [[J.Wr, J.Er, J.Hr_, -1], [J.Wl, J.El, J.Hl_, 1]]) claws(b, H, o.cup ? sub(H, W) : sub(W, E), s, M.SKIN, 2, o.claw ?? 4.2, o.cup ? 0.2 : 1.1);
  return hp;
}

function skinMat(J, m, x, y, z, o = {}) {
  // ash-white, starved; the ghoul's grey-green creeping up from his hands and over one side of his face
  let c = skin(L('#8e867c'), L('#4e4842'), x, y, z, 51);
  const gh = clamp((vn3(x * 0.12, y * 0.12, z * 0.12, 52) - 0.45) * 3) + (o.ghoul ?? 0);
  c = mix(c, mix(S.ghoul, S.ghoulG, 0.5), clamp(gh) * 0.55);
  if (Math.hypot(x - J.head[0], y - J.head[1] - 4, z - J.head[2] + 5) < 4.5) c = mix(c, S.bloodD, 0.65); // his chin, dark with what he drinks
  for (const H of [J.Hr_, J.Hl_]) if (Math.hypot(x - H[0], y - H[1], z - H[2]) < (o.redHands ?? 0)) c = mix(c, S.blood, 0.7);
  return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.2, gloss: 35 };
}
function coatMat(x, y, z, nx, ny, nz_, ax) {
  const n = vn3(x * 0.6, y * 0.6, z * 0.6, 11);
  if (ax) { // the inside of the cone (its normal toward the axis) is the lining
    const v = [x - ax.N[0], y - ax.N[1], z - ax.N[2]], t = dot(v, ax.a), q = sub(v, sc(ax.a, t));
    if (dot(q, [nx, ny, nz_]) < -0.1) return { alb: mix(C.lining, mul(C.lining, 0.45), n), spec: 0.12, gloss: 25, wrap: 0.3 };
  }
  let c = mix(C.coat, C.coatW, clamp((n - 0.5) * 2) * 0.6);
  c = mix(c, C.mud, clamp((9 - z) / 8) * 0.7);
  if (vn3(x * 0.5, y * 0.5, z * 0.5, 43) > 0.7) c = mix(c, n > 0.5 ? S.blood : S.bloodD, 0.55);
  return { alb: c, spec: 0.05, gloss: 12, wrap: 0.3 };
}
/** The shared materials; `extra` first for a design's own. */
function matOf(b, J, o = {}, extra) {
  const ax = b.parts.find((p) => p.coat)?.coat;
  return (m, x, y, z, nx, ny, nz_) => {
    const e = extra?.(m, x, y, z, nx, ny, nz_); if (e) return e;
    switch (m) {
      case M.EYE: return { alb: [0.02, 0, 0], emi: o.rage ? RAGE : EMBER, noAO: true, noShadow: true, rim: 0 }; // unlit: the palette's own red
      case M.COAT: return coatMat(x, y, z, nx, ny, nz_, ax);
      case M.PANTS: { const n = vn3(x * 0.5, y * 0.5, z * 0.5, 13); return { alb: mix(mix(C.pants, mul(C.pants, 0.5), n), C.mud, clamp((10 - z) / 10) * 0.6), wrap: 0.3, spec: 0.04 }; }
      case M.BLOOD: return { alb: mix(L('#5a0a0e'), L('#300406'), vn3(x * 2, y * 2, z * 2, 4)), spec: 1.1, gloss: 90, emi: [0.04, 0, 0] };
      case M.GOLD: return goldM(x, y, z);
      case M.FLAME: return glow([2.0, 1.2, 0.4], 0.9);
      case M.BURLAP: { const w = Math.abs(Math.sin(x * 3.1) * Math.sin(z * 3.1 + y)) > 0.8 ? 0.75 : 1; return { alb: mul(mix(C.burlap, C.burlapD, clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 61) * 1.7 - 0.4)), w), wrap: 0.35, spec: 0.03 }; }
      case M.ROPE: return { alb: mix(C.rope, mul(C.rope, 0.5), Math.abs(Math.sin((x + y + z) * 2.2))), wrap: 0.3, spec: 0.05 };
    }
    const c0 = kitMat(m, x, y, z); if (c0) return c0;
    return skinMat(J, m, x, y, z, o);
  };
}
const finish = (b, J, o, extra) => ribbed(done(b, matOf(b, J, o, extra), { rim: 0.8 }), J.chest, nz(sub(J.neck, J.pelvis)), 7);
const eyeLight = (J, F, o) => ({ p: add(J.head, sc(F, 6)), c: L('#d03018'), I: o.rage ? 0.9 : 0.3, r0: 6, R: 40, pad: 2 }); // their glow on his face
const prop = (name, model, scene = false) => ({ name, model: { ...model, nomask: true }, scene });
// a model of another lib (../grand/lib.mjs: the refuge's props) read through this one's material binding
const bridged = (m) => ({ ...m, sdf: (x, y, z) => { const d = m.sdf(x, y, z); setMat(GMAT); return d; } });
const moved = (m, d) => ({ ...m, sdf: (x, y, z) => m.sdf(x - d[0], y - d[1], z - d[2]), mat: (i, x, y, z, ...n) => m.mat(i, x - d[0], y - d[1], z - d[2], ...n), bounds: [m.bounds[0] + d[0], m.bounds[1] + d[1], m.bounds[2] + d[2], m.bounds[3] + d[0], m.bounds[4] + d[1], m.bounds[5] + d[2]] });

// ======================= 1. LE RONGÉ ACCROUPI AU BASSIN =======================
// Perched on the basin's rim like a gargoyle, knees up to his chest, the long arms folded, blood cupped in his hands at
// his mouth; the coat's rags spread behind him over the stone. 'speak': he leans out toward the hero, one wet hand held
// open, the other gripping the rim. 'beast': down on hands and feet on the rim, spine bowed, jaw hanging, eyes ablaze.
export const RIM = 25; // the basin's rim (../hub3/props3.mjs basin2): his feet are on it
export function bassin(pose = 'idle') {
  const b = B(), J = clone(std);
  let F, U, o = {};
  if (pose === 'idle') {
    Object.assign(J, { pelvis: [0, -6, 14], chest: [0, -3, 31], neck: [0, 0, 40], head: [0, 3.5, 45.5],
      Sr: [-8, -1.5, 37], Er: [-11, 9, 27], Wr: [-3.5, 10, 37], Hr_: [-1.4, 11, 39.5], Sl: [8, -1.5, 37], El: [11, 9, 27], Wl: [3.5, 10, 37], Hl_: [1.4, 11, 39.5],
      Hr: [-4, -6, 14], Kr: [-7, 8, 27], Ar: [-5, -2, 4], Tr: [-5.5, 4, 1.2], Hl: [4, -6, 14], Kl: [7, 8, 27], Al: [5, -2, 4], Tl: [5.5, 4, 1.2] });
    F = nz([0, 1, -0.3]); U = nz([0, 0.3, 1]); o = { jaw: 2, cup: true, redHands: 4 };
    // the blood in his cupped hands, at his mouth
    b.el([0, 12, 40.6], [2.2, 1.8, 0.8], M.BLOOD, 0.4);
  } else if (pose === 'speak') {
    Object.assign(J, { pelvis: [0, -5, 15], chest: [0, 2, 31], neck: [0, 8, 39], head: [0, 12.5, 43],
      Sr: [-7.5, 9, 34], Er: [-11, 16, 22], Wr: [-9, 18, 6], Hr_: [-9, 19.5, 2], Sl: [7.5, 9, 34], El: [13, 18, 31], Wl: [12, 28, 33], Hl_: [11.5, 31, 33.5],
      Hr: [-4, -5, 16], Kr: [-8, 10, 27], Ar: [-5, 1, 4], Tr: [-5.5, 7, 1.2], Hl: [4, -5, 16], Kl: [8, 9, 29], Al: [5, -2, 4], Tl: [5.5, 4, 1.2] });
    F = nz([0.25, 1, -0.05]); U = nz([0, 0.1, 1]); o = { jaw: 3.5, redHands: 5 };
  } else {
    Object.assign(J, { pelvis: [0, -10, 22], chest: [0, 4, 24], neck: [0, 13, 22], head: [0, 19, 21],
      Sr: [-7, 8, 25], Er: [-12, 12, 13], Wr: [-9, 19, 4], Hr_: [-9, 21, 1.5], Sl: [7, 8, 25], El: [12, 13, 14], Wl: [10, 20, 4], Hl_: [10, 22, 1.5],
      Hr: [-4, -10, 22], Kr: [-8, 0, 25], Ar: [-6, -12, 5], Tr: [-6, -7, 1.2], Hl: [4, -10, 22], Kl: [8, 1, 24], Al: [6, -12, 5], Tl: [6, -7, 1.2] });
    F = nz([0, 1, 0.15]); U = nz([0, -0.2, 1]); o = { jaw: 9, rage: true, ghoul: 0.4, hair: 12, claw: 5.5 };
  }
  man(b, J, F, U, o);
  sleeve(b, J.Sr, J.Er); sleeve(b, J.Sl, J.El);
  if (pose === 'beast') coat(b, add(J.neck, [0, -4, 3]), [0, -20, 2], [0, 1, 0], 9, 13, { open: 1.4, seed: 5, collar: 0.1 });
  else coat(b, add(J.neck, [0, -1.5, 0.5]), [0, -11, 0], [0, 1, 0.3], 8.5, 14, { open: 1.0, seed: 3, collar: 0.14 });
  const r = finish(b, J, o);
  // the basin he crouches on (the refuge's own model), its centre before him: on the card only
  r.subs = [prop('basin', moved(bridged(basin2(0.5)), [0, 34, -RIM]), true)];
  r.lift = RIM;
  r.lights = [eyeLight(J, F, o)];
  return r;
}

// ======================= 2. LE RONGÉ COLPORTEUR =======================
// Bowed nearly double under his wares: a sack heaped on his back and lashed with rope, what he dug out of the catacombs
// sticking out of it (long bones, a skull, chains, a dead lantern of the Order, its gilt sun on a broken staff); a
// cane in his right hand, a candle in a jar swinging from the pack. 'speak': he leans on the cane and holds out a gilt
// relic of the Order to the hero. 'beast': the pack thrown down, he crouches over it, claws out, snarling.
export function colporteur(pose = 'idle') {
  const b = B(), J = clone(std), p = B();
  let F, U, o = {}, pack;
  if (pose === 'idle' || pose === 'speak') {
    const sp = pose === 'speak';
    Object.assign(J, sp ? {
      pelvis: [0, -3, 44], chest: [0, 9, 59], neck: [0, 16, 64], head: [0, 21, 65.5],
      Sr: [-7.5, 12, 62], Er: [-11, 18, 50], Wr: [-11, 23, 42], Hr_: [-11, 24, 39.5], Sl: [7.5, 12, 62], El: [12, 20, 54], Wl: [11, 30, 55], Hl_: [10, 33, 55],
    } : {
      pelvis: [0, -3, 44], chest: [0, 5, 60], neck: [0, 11, 67], head: [0, 16, 69.5],
      Sr: [-7.5, 8, 64], Er: [-11, 14, 52], Wr: [-11.5, 20, 44], Hr_: [-11.5, 21, 41.5], Sl: [7.5, 8, 64], El: [10, 11, 50], Wl: [9, 15, 39], Hl_: [8.5, 16, 36],
    }, { Hr: [-3.8, -3, 43], Kr: [-5, 6, 23], Ar: [-4.5, -3, 4], Tr: [-5, 3, 1.2], Hl: [3.8, -3, 43], Kl: [5, 4, 24], Al: [4.5, -5, 4], Tl: [5, 1, 1.2] });
    F = sp ? nz([0.15, 1, 0.1]) : nz([0, 1, -0.2]); U = sp ? nz([0, -0.1, 1]) : nz([0, 0.2, 1]); o = { jaw: sp ? 3 : 1.2, claw: 3.6 };
    // the cane, from his right hand to the floor before him
    const top = add(J.Hr_, [0, 0.5, 2]), foot = [-12.5, sp ? 30 : 27, 0];
    b.rc(add(top, [0, 0, 3]), foot, 1.0, 0.8, M.WOOD, 0); b.el(add(top, [0, 0, 3.5]), [1.6, 1.6, 1.4], M.WOOD, 0.4);
    if (sp) { // a gilt sun of the Order held out on his palm
      const c = add(J.Hl_, [0, 2.5, 2]);
      b.f((x, y, z) => smax(sdEll(x, y, z, c[0], c[1], c[2], 3.4, 3.4, 0.8), -sdEll(x, y, z, c[0], c[1], c[2] + 0.8, 1.6, 1.6, 0.5), 0.3), [c[0] - 5, c[1] - 5, c[2] - 3, c[0] + 5, c[1] + 5, c[2] + 3], M.GOLD, 0);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.rc(add(c, [Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0]), add(c, [Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0]), 0.5, 0.15, M.GOLD); }
    }
    pack = { c: add(J.chest, [0, -9, 7]), lean: nz(sub(J.neck, J.pelvis)) };
  } else {
    Object.assign(J, { pelvis: [0, -6, 17], chest: [0, 6, 28], neck: [0, 13, 33], head: [0, 19, 33],
      Sr: [-7.5, 9, 31], Er: [-14, 14, 20], Wr: [-12, 21, 5], Hr_: [-12, 24, 1.5], Sl: [7.5, 9, 31], El: [14, 16, 21], Wl: [11, 24, 6], Hl_: [11, 27, 2],
      Hr: [-4, -6, 17], Kr: [-9, 6, 22], Ar: [-6, -4, 4], Tr: [-6, 2, 1.2], Hl: [4, -6, 17], Kl: [9, 7, 21], Al: [6, -5, 4], Tl: [6, 1, 1.2] });
    F = nz([0, 1, 0.1]); U = nz([0, -0.15, 1]); o = { jaw: 9, rage: true, ghoul: 0.4, hair: 11, claw: 5.5 };
    pack = { c: [-20, -16, 12], lean: nz([0.5, 0.2, 1]), dropped: true };
  }
  man(b, J, F, U, o);
  sleeve(b, J.Sr, J.Er); sleeve(b, J.Sl, J.El);
  coat(b, add(J.neck, [0, -2, 0]), pose === 'beast' ? [0, -20, 2] : add(J.pelvis, [0, -8, -25]), [0, 1, 0], 8, 13, { open: 1.0, seed: 7, collar: 0.25, torn: 0.3 });
  // the pack: a lumpy sack lashed with rope, his finds sticking out of it
  const { c, lean } = pack, X = [1, 0, 0], Fw = nz(crs(X, lean)); // Fw: the pack's "out", away from his back
  const Q = (u, v, w) => add(c, add(sc(X, u), add(sc(lean, v), sc(Fw, w))));
  const T = pack.dropped ? p : b; // thrown down, it is a prop of its own
  oelN(T, Q(0, 3, -2), lean, X, [12, 9.5, 8.5], M.BURLAP, 2, 1.8, 0.3);
  oelN(T, Q(3, 12, -1), lean, X, [6, 7, 6], M.BURLAP, 2, 1.3, 0.35);
  oelN(T, Q(-5, 10, -3), lean, X, [5.5, 5.5, 5.5], M.BURLAP, 2, 1.1, 0.35);
  for (const v of [-2, 7]) T.tor(Q(0, v, -2), lean, 9.2 * Math.sqrt(1 - ((v - 3) / 12) ** 2), 0.65, M.ROPE, 0); // lashed round
  if (!pack.dropped) for (const s of [-1, 1]) T.rc(add(J.neck, [s * 5, 1, 1]), add(J.pelvis, [s * 6, 3, 2]), 0.7, 0.7, M.ROPE, 0); // the straps over his chest
  // long bones fanned out of the top, a skull wedged in
  [[-6, 1.0, 0.2], [-2, 1.2, -0.25], [7, 1.0, -0.1]].forEach(([u, l, tw]) => { const a0 = Q(u, 14, -3), a1 = add(a0, sc(nz(add(lean, [tw, -0.3, 0.1])), 10 * l)); T.rc(a0, a1, 0.9, 0.8, M.BONE); T.el(a1, [1.5, 1.5, 1.5], M.BONE, 0.4); });
  { const k = Q(-8, 5, 5.5); T.el(k, [3.2, 3.6, 3.3], M.BONE, 0); T.rc(add(k, [0, 2, -1]), add(k, [0, 4, -2.2]), 2.2, 1.5, M.BONE, 1); for (const s of [-1, 1]) T.carve(add(k, [s * 1.3, 3.4, 0.4]), 0.9, 0.3); }
  // the Order's gilt sun on a broken staff, out of the top
  { const s0 = Q(5, 9, -5), s1 = add(s0, sc(nz(add(lean, [0.25, -0.15, 0])), 18)); T.rc(s0, s1, 0.8, 0.8, M.WOOD); const n = nz(sub(s1, s0)), g = add(s1, sc(n, 4));
    T.f((x, y, z) => { const q = sub([x, y, z], g), t = dot(q, Fw); return Math.max(Math.hypot(...sub(q, sc(Fw, t))) - 4.4, Math.abs(t) - 0.7); }, [g[0] - 6, g[1] - 6, g[2] - 6, g[0] + 6, g[1] + 6, g[2] + 6], M.GOLD, 0.3);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = add(sc(X, Math.cos(a)), sc(crs(Fw, X), Math.sin(a))); T.rc(add(g, sc(d, 4)), add(g, sc(d, 7)), 0.6, 0.15, M.GOLD); } }
  // chains hanging in loops off the side, a rusted manacle at the end
  chainLinks(T, Q(-11, 6, -1), Q(-10, -6, 2), 1.8, 0.8, M.IRON, 2.8);
  chainLinks(T, Q(11, 8, 0), Q(10, -3, -1), 1.2, 0.8, M.IRON, 2.8);
  T.tor(Q(-10, -8, 2), X, 2.4, 0.8, M.IRON, 0);
  // the dead lantern of the Order, and a candle in a jar swinging from the pack
  { const l = Q(10, 0, 4); T.box(l, [3, 3, 4], M.IRON, 0, 0.6); T.el(add(l, [0, 0, 5]), [2.4, 2.4, 1.6], M.IRON, 0); T.tor(add(l, [0, 0, 7]), [0, 1, 0], 1.5, 0.4, M.IRON); }
  const jar = pack.dropped ? Q(0, -10, 9) : add(J.pelvis, [9, -2, -6]);
  if (!pack.dropped) T.rc(Q(9, 0, 6), add(jar, [0, 0, 4]), 0.35, 0.35, M.ROPE);
  T.el(jar, [2.2, 2.2, 2.8], M.FLAME, 0);
  const r = finish(b, J, o);
  if (pack.dropped) r.subs = [{ name: 'pack', model: { ...done(p, matOf(p, J, o)), mask: true } }]; // his wares: part of his shape
  r.lights = [{ p: add(jar, [0, 3, 1]), c: L('#e0a050'), I: pose === 'beast' ? 1.4 : 1.8, r0: 12, R: 110, pad: 3.2, haze: 0.05, hazeR: 3, skip: [] }];
  r.lights.push(eyeLight(J, F, o));
  return r;
}

// ======================= 3. LE RONGÉ DANS SA NICHE =======================
// A shrine of the refuge's ossuary by the basin, skulls stacked in rows under an arched top, a deep niche in it: he
// lives in there, curled up among the bones, a candle stub guttering on the sill by him. 'idle': only his face, two embers and his
// long hands on the sill show in the dark of it. 'speak': he leans out to the waist, a hand held out over the sill.
// 'beast': back in the dark, eyes blazing, the jaw hanging, claws raking the sill; skulls knocked down to the floor.
export const NICHE = { w: 23, d: 15, h0: 36, sill: 12, nw: 13.5, top: 35, deep: 16 }; // half width and depth, the arch's springing; the niche's sill, half width, springing, depth
const arch2 = (x, z, w, z0, z1) => Math.min(Math.max(Math.abs(x) - w, z0 - z, z - z1), Math.hypot(x, z - z1) - w); // a round-headed arch, x across, z up
const sdSkulls = (x, z) => { // rows of skull fronts on a wall face (x across, z up): bumps and sockets
  const cw = 6.2, ch = 6.4, row = Math.floor(z / ch), off = row & 1 ? cw / 2 : 0, col = Math.floor((x + off + 100) / cw);
  const lx = (x + off + 100) - (col + 0.5) * cw, lz = z - (row + 0.5) * ch;
  const bump = Math.max(0, 1 - (lx * lx) / 9 - (lz * lz) / 10) * 1.8, eye = Math.min(Math.hypot(lx - 1.3, lz - 0.6), Math.hypot(lx + 1.3, lz - 0.6)) < 0.95 || (Math.abs(lx) < 0.5 && Math.abs(lz + 1.3) < 0.6);
  return { bump: bump - (eye ? 1.4 : 0), id: col * 31 + row, eye };
};
const CANDLE = [-NICHE.nw + 3, NICHE.d - 3, NICHE.sill]; // its foot, on the sill, at his right
function nicheBlock(b, fallen) {
  const { w, d, h0, sill, nw, top, deep } = NICHE;
  b.f((x, y, z) => {
    let dd = Math.max(arch2(x, z, w, 0, h0), Math.abs(y) - d);
    if (y > d - 4) dd -= sdSkulls(x, z).bump * clamp((y - d + 4) / 4) * clamp((w - 2.5 - Math.abs(x)) / 2) * clamp((h0 + w - 3 - Math.hypot(x, z - h0)) / 2); // a stone frame round the skulls
    dd += 0.6 * (vn3(x * 0.3, y * 0.3, z * 0.3, 71) - 0.5);
    return Math.max(dd, -Math.max(arch2(x, z, nw, sill, top), d - deep - y)) * 0.8;
  }, [-w - 3, -d - 3, -1, w + 3, d + 4, h0 + w + 3], M.NICHE, 0);
  // skulls on the sill's corner and on the arch, a candle stub guttering on the sill
  for (const k of [[nw - 2.8, d - 4, sill + 2.6], [-8, 2, h0 + Math.sqrt(w * w - 64) + 1.5], [9, -1, h0 + Math.sqrt(w * w - 81) + 1.5]]) {
    b.el(k, [2.6, 3.0, 2.7], M.SKULLS, 0); b.rc(add(k, [0, 1.6, -0.5]), add(k, [0, 3, -1.6]), 1.8, 1.2, M.SKULLS, 1); for (const s of [-1, 1]) b.carve(add(k, [s * 1.1, 2.8, 0.3]), 0.8, 0.3);
  }
  b.rc(CANDLE, add(CANDLE, [0, 0, 4]), 1.2, 1.0, 14, 0.6); b.el(add(CANDLE, [0, 0, 5.4]), [0.7, 0.7, 1.4], M.FLAME, 0);
  if (fallen) { const R = mulberry32(3); for (let i = 0; i < 4; i++) { const k = [(R() - 0.3) * 30, d + 6 + R() * 12, 2.6]; b.el(k, [2.6, 3.0, 2.7], M.SKULLS, 0); for (const s of [-1, 1]) b.carve(add(k, [s * 1.1, 2.6, 0.3]), 0.8, 0.3); } }
}
const bone = (x, y, z, s) => ({ alb: mul(mix(S.tooth, L('#5e5440'), clamp(vn3(x * 0.5, y * 0.5, z * 0.5, s) * 1.4 - 0.2)), 0.36), spec: 0.15, gloss: 25 });
const nicheMat = (m, x, y, z) => {
  if (m === M.SKULLS) return bone(x, y, z, 9);
  if (m !== M.NICHE) return null;
  const { d, w, h0, nw, sill, top, deep } = NICHE;
  if (y > d - 4.5 && Math.abs(x) < w - 2.5 && Math.hypot(x, z - h0) < h0 + w - 3) { const s = sdSkulls(x, z); const c = bone(x, y, z, s.id); if (s.eye) c.alb = mul(c.alb, 0.35); return c; }
  let c = mix(L('#3e382e'), L('#1a1612'), clamp(fbm3(x * 0.2, y * 0.2, z * 0.2, 3, 72) * 1.6 - 0.3));
  if (arch2(x, z, nw + 0.5, sill - 1, top) < 0 && y < d - 1) c = mix(mul(c, 0.3), S.bloodD, clamp((sill + 1.5 - z) * 0.8) * 0.6); // the dark of it, its floor his bed of old blood
  return { alb: c, spec: 0.05, gloss: 10, wrap: 0.2 };
};
export function niche(pose = 'idle') {
  const b = B(), J = clone(std), { d, sill } = NICHE;
  let F, U, o = {};
  if (pose === 'idle') { // curled in the dark: face and hands at the sill
    Object.assign(J, { pelvis: [0, d - 12, sill + 7], chest: [0, d - 8, sill + 17], neck: [0, d - 4, sill + 22], head: [0, d - 1, sill + 24],
      Sr: [-7, d - 6, sill + 20], Er: [-10, d - 3, sill + 9], Wr: [-7, d - 1, sill + 3], Hr_: [-7, d + 2, sill + 2.5], Sl: [7, d - 6, sill + 20], El: [10, d - 3, sill + 9], Wl: [7, d - 1, sill + 3], Hl_: [7, d + 2, sill + 2.5],
      Hr: [-4, d - 12, sill + 7], Kr: [-6, d - 3, sill + 14], Ar: [-5, d - 10, sill + 2], Tr: [-5, d - 6, sill + 1], Hl: [4, d - 12, sill + 7], Kl: [6, d - 3, sill + 14], Al: [5, d - 10, sill + 2], Tl: [5, d - 6, sill + 1] });
    F = nz([0, 1, -0.1]); U = nz([0, 0.1, 1]); o = { jaw: 0.8, hair: 9 };
  } else if (pose === 'speak') { // leaning out over the sill to the waist
    Object.assign(J, { pelvis: [0, d - 8, sill + 6], chest: [0, d + 1, sill + 16], neck: [0, d + 7, sill + 20], head: [0, d + 12, sill + 21],
      Sr: [-7.5, d + 4, sill + 19], Er: [-11, d + 5, sill + 9], Wr: [-9, d + 4, sill + 2], Hr_: [-9, d + 7, sill + 1], Sl: [7.5, d + 4, sill + 19], El: [13, d + 11, sill + 14], Wl: [12, d + 21, sill + 17], Hl_: [11, d + 24, sill + 17],
      Hr: [-4, d - 8, sill + 6], Kr: [-6, d - 1, sill + 4], Ar: [-5, d - 12, sill + 2], Tr: [-5, d - 14, sill + 1], Hl: [4, d - 8, sill + 6], Kl: [6, d - 1, sill + 4], Al: [5, d - 12, sill + 2], Tl: [5, d - 14, sill + 1] });
    F = nz([0.2, 1, -0.1]); U = nz([0, 0.1, 1]); o = { jaw: 3, hair: 10 };
  } else {
    Object.assign(J, { pelvis: [0, d - 12, sill + 5], chest: [0, d - 7, sill + 12], neck: [0, d - 3, sill + 14], head: [0, d + 1, sill + 13],
      Sr: [-7, d - 5, sill + 14], Er: [-11, d - 2, sill + 6], Wr: [-8, d, sill + 2], Hr_: [-8, d + 3, sill + 0.8], Sl: [7, d - 5, sill + 14], El: [11, d - 2, sill + 5], Wl: [9, d + 1, sill + 2], Hl_: [9, d + 4, sill + 0.8],
      Hr: [-4, d - 12, sill + 5], Kr: [-7, d - 5, sill + 10], Ar: [-5, d - 12, sill + 2], Tr: [-5, d - 9, sill + 1], Hl: [4, d - 12, sill + 5], Kl: [7, d - 5, sill + 10], Al: [5, d - 12, sill + 2], Tl: [5, d - 9, sill + 1] });
    F = nz([0, 1, 0.1]); U = nz([0, -0.1, 1]); o = { jaw: 9, rage: true, ghoul: 0.4, hair: 11, claw: 5.5 };
  }
  man(b, J, F, U, o);
  sleeve(b, J.Sr, J.Er); sleeve(b, J.Sl, J.El);
  coat(b, add(J.neck, [0, -2, 0]), add(J.pelvis, [0, -3, -6]), [0, 1, 0], 8, 11, { open: 1.0, seed: 9, collar: 0.4, torn: 0.15 });
  const r = finish(b, J, o);
  const n = B(); nicheBlock(n, pose === 'beast');
  r.subs = [{ name: 'niche', model: { ...done(n, (m, x, y, z, ...nn) => nicheMat(m, x, y, z) || matOf(n, J, o)(m, x, y, z, ...nn)), mask: true } }];
  r.lights = [eyeLight(J, F, o), { p: add(CANDLE, [1, 1, 7]), c: L('#e0a050'), I: 1.6, r0: 10, R: 80, pad: 2.2, haze: 0.04, hazeR: 2 }];
  return r;
}

// insitu: the pose insitu.mjs shows him in, in the refuge, the hero near
export const DESIGNS = [
  { key: 'bassin', fn: bassin, name: 'Le Rongé accroupi au bassin', insitu: 'idle' },
  { key: 'colporteur', fn: colporteur, name: 'Le Rongé colporteur', insitu: 'speak' },
  { key: 'niche', fn: niche, name: 'Le Rongé dans sa niche', insitu: 'speak' },
];
export const POSES = ['idle', 'speak', 'beast'];
