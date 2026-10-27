// Three concepts for the catacombs' guardian (mockup only), and the props of « la prison de Vesna ».
// Same conventions as ../ennemis/foes.mjs: x = their left, y = forward, z = up, feet at z = 0, the hero ~100 tall.
// Each boss(pose) returns { sdf, mat, bounds, step, lights, subs?: [{ name, model }] }; pose 'idle' or 'tele' (the wind-up).
// No floor telegraph anywhere: the body, the light it carries and the props tell the attack.
import { sdBox, sdEll, sdRC, smax, partsSdf, clamp, lerp, vn3, fbm3, h2, L, mix, mul, mulberry32 } from '../ennemis/lib.mjs';
import { boundsOf, humanoid, std, S, skinTex } from '../ennemis/cast.mjs';
import { B, done, K, glow, ironM, goldM, bloodHem, claws, HOLY, FIRE } from '../ennemis/foes.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const lp = (a, b, t) => add(a, sc(sub(b, a), t));
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const SULF = [1.5, 1.55, 0.3]; // sulphur flame: sick yellow-green

// a rat: belly at p, body along d, size k (1 ~ 9 u long without the tail)
export function rat(b, p, d, k = 1, m = 20, eyes = false) {
  d = nz(d); const sv = nz(Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [d[1], -d[0], 0]), up = crs(sv, d);
  b.rc(add(p, sc(d, -2.6 * k)), add(p, sc(d, 1.8 * k)), 2.1 * k, 1.6 * k, m, 0.8 * k);
  const h = add(p, sc(d, 2.4 * k)); b.rc(h, add(add(h, sc(d, 3.2 * k)), sc(up, -0.5 * k)), 1.4 * k, 0.35 * k, m, 0.6 * k);
  for (const s of [-1, 1]) b.el(add(add(h, sc(sv, s * 0.9 * k)), sc(up, 1.1 * k)), [0.6 * k, 0.6 * k, 0.6 * k], m);
  if (eyes) for (const s of [-1, 1]) b.el(add(add(h, sc(d, 1.2 * k)), add(sc(sv, s * 0.75 * k), sc(up, 0.55 * k))), [0.45 * k, 0.45 * k, 0.45 * k], 22);
  const t0 = add(p, sc(d, -4.2 * k)), t1 = add(add(t0, sc(d, -3.5 * k)), sc(sv, 1.5 * k)), t2 = add(add(t1, sc(d, -3 * k)), sc(sv, -0.5 * k));
  b.rc(t0, t1, 0.45 * k, 0.3 * k, m + 1); b.rc(t1, t2, 0.3 * k, 0.12 * k, m + 1);
}
const ratMat = (m, x, y, z) => m === 22 ? glow([1.4, 0.12, 0.05], 0.7) : m === 21 ? { alb: L('#6e5650'), spec: 0.3, gloss: 30, sss: 0.3 } : { alb: mix(L('#3a342c'), L('#1c1915'), vn3(x * 0.8, y * 0.8, z * 0.8, 5)), wrap: 0.4, spec: 0.08, rim: 1.0 };
// a chain of capsule links from a to b, sagging by sag
function chainLinks(b, a, c, sag, r = 0.9, m = 9, seg = 3.4) {
  const n = Math.max(2, Math.round(Math.hypot(...sub(c, a)) / seg)); const P = t => add(lp(a, c, t), [0, 0, -sag * 4 * t * (1 - t)]);
  for (let i = 0; i < n; i++) b.rc(P(i / n), P((i + 1) / n), i & 1 ? r * 0.75 : r, i & 1 ? r * 0.75 : r, m, 0);
}
// iron cage of bars, centre c (floor of the cage at c[2] - h[2])
function cageBars(b, c, h, m = 9, n = 2, r = 0.55) {
  const [x0, y0, z0] = sub(c, h), [x1, y1, z1] = add(c, h);
  for (const z of [z0, z1]) { b.rc([x0, y0, z], [x1, y0, z], r * 1.2, r * 1.2, m); b.rc([x0, y1, z], [x1, y1, z], r * 1.2, r * 1.2, m); b.rc([x0, y0, z], [x0, y1, z], r * 1.2, r * 1.2, m); b.rc([x1, y0, z], [x1, y1, z], r * 1.2, r * 1.2, m); }
  for (let i = 0; i <= n + 1; i++) { const x = lerp(x0, x1, i / (n + 1)); b.rc([x, y0, z0], [x, y0, z1], r, r, m); b.rc([x, y1, z0], [x, y1, z1], r, r, m); }
  for (let i = 1; i <= n; i++) { const y = lerp(y0, y1, i / (n + 1)); b.rc([x0, y, z0], [x0, y, z1], r, r, m); b.rc([x1, y, z0], [x1, y, z1], r, r, m); }
}

// the model k times bigger (its lights are placed after)
function grow(r, k) {
  const { sdf, mat, bounds } = r; r.sdf = (x, y, z) => sdf(x / k, y / k, z / k) * k; r.mat = (m, x, y, z, ...n) => mat(m, x / k, y / k, z / k, ...n); r.bounds = bounds.map(v => v * k); return r;
}

// ======================= 1. LE DÉRATISEUR =======================
// the Order's rat-catcher of the catacombs: waxed leather, wide hat, smoke mask, caged rats on his back, iron traps and
// dead rats at the belt, a long hook, a pot of burning sulphur on a chain. 'tele': the pot swung up over his head, flaring.
export function deratiseur(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el, tor } = b; const s = 1.32;
  const J = {}; for (const k in std) J[k] = std[k].map(v => v * s);
  Object.assign(J, {
    head: [0, 5, 117], neck: [0, 3.5, 108], chest: [0, 2.5, 94], pelvis: [0, 0, 67],
    Hr: [-6, 0, 65], Kr: [-7, 3, 36], Ar: [-7, -1, 6], Tr: [-8, 8, 1.6], Hl: [6, 0, 65], Kl: [7, 2, 36], Al: [7, -1, 6], Tl: [8, 8, 1.6],
  }, tele ? {
    head: [-1, -2, 116], neck: [-1, -1.5, 107], chest: [0, -1.5, 93], pelvis: [0, 0, 66],
    Sr: [-12, 1, 102], Er: [-15, 11, 88], Wr: [-12, 22, 82], Hr_: [-11, 25, 81],
    Sl: [12, -1, 103], El: [19, -5, 121], Wl: [17, -9, 137], Hl_: [16.5, -10, 141],
    Hr: [-6, 1, 64], Kr: [-7, 13, 37], Ar: [-7.5, 11, 6], Tr: [-8, 19, 1.6], Hl: [6, -1, 64], Kl: [7.5, -9, 35], Al: [8, -19, 7], Tl: [8.5, -13, 1.6],
  } : {
    Sr: [-12, 2, 103], Er: [-16, 6, 83], Wr: [-15, 13, 72], Hr_: [-15, 15, 70],
    Sl: [12, 2, 103], El: [16, 6, 82], Wl: [16, 13, 68], Hl_: [16, 15, 65],
  });
  humanoid(J, b, { thin: 1.6, torsoM: 2, armM: 2, pelvisM: 2, legM: 6, shinM: 6, footM: 6 });
  // waxed coat to the shins, oilskin cape, thick sleeves, gloves
  b.rev(0, 0.5, 30, 100, t => lerp(17, 15, Math.pow(t, 0.8)) - 3 * Math.max(0, t - 0.85) / 0.15, 2, 1.5, 0.85, { fold: [8, 1.4] });
  el(add(J.chest, [0, 3, -8]), [14, 12, 16], 2, 4); // barrel chest and gut under the coat
  for (const [H1, K1, A1] of [[J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(H1, K1, 6.4, 5.2, 6, 1.5); rc(K1, add(A1, [0, 0, 3]), 5.4, 4.2, 6, 1.2); } // waders
  rc(J.neck, add(J.chest, [0, 0, -5]), 8, 20, 3, 1.5, { pri: 1 });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 4.4, 3.8, 2, 1.2); rc(E, W, 3.8, 3.4, 2, 1); }
  for (const Hh of [J.Hr_, J.Hl_]) el(Hh, [2.6, 2.6, 2.9], 5, 1, { pri: 1 });
  tor([0, 0.5, 68], [0, 0, 1], 12.8, 1.5, 7, 0.4); b.box([0, 13, 68], [2, 0.7, 2], 8, 0, 0.2);
  // jaw traps hanging at the hips
  for (const [T, n, top] of [[[-16, 3, 50], [1, 0, 0.15], [-12.5, 3, 66]], [[11, -10, 50], [0.4, 1, 0], [9, -8, 66]]]) {
    rc(top, add(T, [0, 0, 5.5]), 0.4, 0.4, 9);
    tor(T, n, 5.2, 0.75, 9); const u = nz(crs(n, [0, 0, 1])), v = crs(n, u);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, d = add(sc(u, Math.cos(a)), sc(v, Math.sin(a))); rc(add(T, sc(d, 5)), add(T, sc(d, 2.6)), 0.55, 0.1, 9); }
  }
  // dead rats hung by the tail from the belt
  for (const [x, z, a] of [[-3.5, 52, 0.1], [-7.5, 50, -0.15], [1, 53, 0.2]]) { rat(b, [x, 13.5, z], [a, 0.2, -1], 1.25); rc([x, 13, z + 7], [x, 12.8, 67], 0.3, 0.3, 21); }
  // mask: hood, leather face with round goggles, short snout ending in a brass filter drum; wide slouch hat
  const Hd = J.head;
  el(add(Hd, [0, -0.5, 0.5]), [5.5, 5.9, 6.2], 3, 0.8, { pri: 1 });
  rc(add(Hd, [0, -2.5, -2]), add(J.chest, [0, -3, 6]), 5.6, 9, 3, 1.5, { pri: 1 });
  el(add(Hd, [0, 2.8, -0.6]), [4.3, 3.4, 4.6], 4, 0.6, { pri: 2 });
  for (const sd of [-1, 1]) { el(add(Hd, [sd * 2.4, 5.6, 1.0]), [2.0, 1.2, 2.0], 11, 0.2, { pri: 3 }); tor(add(Hd, [sd * 2.4, 5.8, 1.0]), [0, 1, 0], 2.15, 0.55, 8); }
  rc(add(Hd, [0, 5, -1.8]), add(Hd, [0, 11, -4]), 2.8, 2.2, 4, 0.6);
  rc(add(Hd, [0, 10.6, -3.9]), add(Hd, [0, 13.6, -4.6]), 3.7, 3.7, 8, 0.2);
  rc(add(Hd, [-3.6, 6.5, -3.5]), add(Hd, [-5.4, 8.5, -6]), 1.5, 1.5, 8, 0.3);
  b.f((x, y, z) => { const c = add(Hd, [0, 0.3, 5.2]); const r = Math.hypot(x - c[0], y - c[1]); return Math.max(Math.abs(z - c[2] + 0.02 * r * r * 0.12 + 0.25) - 0.7, r - 10.5) * 0.9; }, [Hd[0] - 12, Hd[1] - 12, Hd[2] - 2, Hd[0] + 12, Hd[1] + 12, Hd[2] + 8], 5, 0.4);
  el(add(Hd, [0, -0.8, 8.2]), [5.8, 6.2, 4.2], 5, 1.2); tor(add(Hd, [0, -0.3, 6.6]), [0, 0, 1], 6.1, 0.8, 7);
  // back frame with three caged rats (live ones: the Rat house's)
  for (const sx of [-1, 1]) { rc([sx * 7.5, -11, 62], [sx * 7.5, -12.5, 152], 1.2, 1.1, 14); rc([sx * 7, -9, 100], [sx * 8.5, 4, 105], 0.9, 0.9, 7); }
  for (const z of [86, 112, 140]) rc([-7.5, -11.8, z], [7.5, -11.8, z], 1, 1, 14);
  const cages = [[[0, -19, 99], [7.5, 6, 7.5]], [[0, -19, 124], [6.5, 5.5, 6.5]], [[0, -18, 145.5], [5.5, 4.5, 5.5]]];
  for (const [c, h] of cages) { cageBars(b, c, h, 9, 2, 0.5); b.box(sub(c, [0, 0, h[2]]), [h[0], h[1], 0.5], 14, 0, 0.1); }
  rat(b, [-2.5, -16, 94], [1, 0.6, 0.1], 1.1, 20, true); rat(b, [3, -20, 93.5], [-0.6, -1, 0], 1.0); rat(b, [0, -17, 119.5], [0.6, 1, 0.3], 1.05, 20, true); rat(b, [0.5, -17, 141.5], [-0.6, 1, 0], 0.95, 20, true);
  // the hook pole
  let p0, p1, hook;
  if (tele) { p0 = [-11.5, -22, 97]; p1 = [-10, 60, 69]; hook = [add(p1, [0, 3, 3]), add(p1, [0, 4, 7.5]), add(p1, [0, 1.5, 10.5]), add(p1, [0, -1.5, 10])]; }
  else { p0 = [-17, 17, 1]; p1 = [-13.5, 13, 150]; hook = [add(p1, [0, 3, 4]), add(p1, [0, 7, 4.5]), add(p1, [0, 9.5, 1.5]), add(p1, [0, 9, -2.5])]; }
  rc(p0, p1, 1.1, 1.0, 14); let q = p1; hook.forEach((h, i) => { rc(q, h, 1.0 - i * 0.18, 0.9 - i * 0.2, 9); q = h; });
  // the sulphur pot on its chain
  const P0 = tele ? [23, -13, 157] : [17, 17, 41];
  chainLinks(b, J.Hl_, add(P0, [0, 0, tele ? -4 : 8]), 0, 0.55, 9, 2.6);
  el(P0, [4.6, 4.6, 3.8], 9, 0.3); b.carve(add(P0, [0, 0, 3.4]), 3.4, 0.4); tor(add(P0, [0, 0, 2.6]), [0, 0, 1], 3.9, 0.6, 9);
  const bail = add(P0, [0, 0, tele ? -8 : 8]); for (const sd of [-1, 1]) rc(add(P0, [sd * 4, 0, tele ? -1 : 2]), bail, 0.4, 0.4, 9);
  const fl = tele ? add(P0, [-1, 2, 6]) : add(P0, [0, 0, 4.2]);
  el(fl, tele ? [4.2, 4.2, 7] : [2.3, 2.3, 3.2], 10);
  if (tele) for (let i = 0; i < 5; i++) { const a = i * 1.3; el(add(fl, [Math.cos(a) * 3.5, Math.sin(a) * 3.5 + 2, 4 + i * 1.6]), [1.4, 1.4, 2.4], 10); }
  // smoke: a thin column at rest, a long trail behind the swing
  const R = mulberry32(31);
  const puffs = tele ? [...Array(5)].map((_, i) => [lerp(20, 8, i / 4) + R() * 2, lerp(-16, -26, i / 4), lerp(160, 138, i / 4), 1.6 + i * 0.4])
    : [...Array(6)].map((_, i) => [17 + Math.sin(i * 1.7) * 2 * i / 5, 17 - i * 1.4, 50 + i * 7, 2.0 + i * 0.6]);
  if (tele) for (const [x, y, z, r] of puffs) el([x, y, z], [r, r, r * 0.9], 13, 2);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 23);
    switch (m) {
      case 2: { let c = mix(L('#4a3e26'), L('#1e180e'), clamp(n * 1.7 - 0.3)); // waxed coat: olive-brown, sulphur stains, soot, rat blood at the hem
        if (vn3(x * 0.3, y * 0.3, z * 0.3, 4) > 0.72) c = mix(c, L('#5a5420'), 0.4);
        c = mix(c, L('#100e0a'), clamp((vn3(x * 0.3, y * 0.3, z * 0.3, 8) - 0.55) * 4) * 0.7);
        return { alb: bloodHem(c, x, y, z, 42, 9), spec: 0.55, gloss: 50, wrap: 0.2 }; }
      case 3: return { alb: mix(L('#262418'), L('#12110c'), n), spec: 0.65, gloss: 60, wrap: 0.2 };
      case 4: { let c = mix(L('#7a6a4a'), L('#4a3c26'), n); if (Math.abs(Math.sin(z * 2.2)) > 0.92) c = mul(c, 0.6); return { alb: c, spec: 0.4, gloss: 40 }; }
      case 5: return { alb: mix(L('#221c14'), L('#100c08'), n), spec: 0.3, gloss: 30 };
      case 6: return { alb: bloodHem(mix(L('#1e1a16'), L('#0e0c0a'), n), x, y, z, 14, 4), spec: 0.6, gloss: 55 };
      case 7: return { alb: mix(L('#3a2616'), L('#1e140a'), n), spec: 0.4, gloss: 40 };
      case 8: return { alb: mix(K.brass, K.brassD, clamp(n * 1.6 - 0.4)), spec: 0.9, gloss: 50 };
      case 9: return ironM(x, y, z);
      case 10: { const k = clamp(1.4 - Math.hypot(...sub([x, y, z], fl)) / (tele ? 9 : 5)); return glow(mix([0.9, 0.5, 0.05], SULF, k), tele ? 1.5 : 0.9); }
      case 11: return { alb: [0.05, 0.05, 0.02], emi: sc(SULF, tele ? 0.8 : 0.6), spec: 1, gloss: 80, noAO: true };
      case 13: { const k = clamp((z - (tele ? 120 : 46)) / 45); return { alb: mix(L('#4a4630'), L('#262418'), k), wrap: 0.7, rim: 0.4, spec: 0, noShadow: true }; }
      case 14: return { alb: mix(K.wood, K.woodD, n), spec: 0.15, gloss: 20 };
      case 20: case 21: case 22: return ratMat(m, x, y, z);
    }
    return { alb: mix(L('#8a6a52'), L('#5a4232'), n), sss: 0.3 };
  };
  const r = grow(done(b, mat, { size: 1.6 }), 1.12);
  r.lights = [{ p: sc(add(fl, [0, 0, 3]), 1.12), c: L('#d8d460'), I: tele ? 8 : 3.4, r0: tele ? 34 : 20, R: tele ? 300 : 160, pad: 5, haze: tele ? 0.035 : 0.02, hazeR: tele ? 7 : 3 }];
  return r;
}

// ======================= 2. LA PROCESSION =======================
// a great reliquary of the Order on two poles, carried by four blind monks. The holy light leaks through its lancets
// and burns; the bearers' shadows are the only safe ground near it. 'tele': poles lifted overhead, the lancets opened.
function monk(b, sx, my, PX, PZ, tele) {
  const cx = sx * (PX + 8.5); const J = {}; for (const k in std) J[k] = add(std[k], [cx, my, 0]);
  const i = (a, y, z) => [sx * a, my + y, z]; // inner side = towards x = 0
  Object.assign(J, { neck: [cx, my + 0.5, 81], chest: [cx, my + 0.3, 71] }, tele ? {
    head: i(PX + 9, -1.5, 89),
    [sx > 0 ? 'Sr' : 'Sl']: i(PX, 0, 80), [sx > 0 ? 'Er' : 'El']: i(PX + 3, 2, 96), [sx > 0 ? 'Wr' : 'Wl']: i(PX + 1, 3, 108), [sx > 0 ? 'Hr_' : 'Hl_']: i(PX, 3, PZ - 1),
    [sx > 0 ? 'Sl' : 'Sr']: i(PX + 17, 0, 79), [sx > 0 ? 'El' : 'Er']: i(PX + 17, 3, 97), [sx > 0 ? 'Wl' : 'Wr']: i(PX + 7, 3, 110), [sx > 0 ? 'Hl_' : 'Hr_']: i(PX + 3, 3, PZ - 1),
  } : {
    head: i(PX + 9.5, 1.5, 87.5),
    [sx > 0 ? 'Sr' : 'Sl']: i(PX, -0.2, 79), [sx > 0 ? 'Er' : 'El']: i(PX + 1.5, 5, 66), [sx > 0 ? 'Wr' : 'Wl']: i(PX + 0.5, 9, 78), [sx > 0 ? 'Hr_' : 'Hl_']: i(PX, 10, PZ),
    [sx > 0 ? 'Sl' : 'Sr']: i(PX + 17, -0.2, 78), [sx > 0 ? 'El' : 'Er']: i(PX + 19, 1, 62), [sx > 0 ? 'Wl' : 'Wr']: i(PX + 16.5, 5, 50), [sx > 0 ? 'Hl_' : 'Hr_']: i(PX + 16, 6, 46),
  });
  // a slow step: one foot forward
  const st = (my > 0) === (sx > 0) ? 1 : -1;
  Object.assign(J, { Kr: add(J.Kr, [0, 4 * st, 0]), Ar: add(J.Ar, [0, 6 * st, 1]), Tr: add(J.Tr, [0, 6 * st, 0]), Kl: add(J.Kl, [0, -4 * st, 0]), Al: add(J.Al, [0, -6 * st, 2]), Tl: add(J.Tl, [0, -6 * st, 0]) });
  humanoid(J, b, { thin: 0.95, armM: 2 });
  b.rev(cx, my, 0.5, 80, t => t < 0.6 ? lerp(13.5, 9, Math.pow(t / 0.6, 0.7)) : lerp(9, 7.5, (t - 0.6) / 0.4), 2, 1.5, 0.85, { fold: [9, 1.2] });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { b.rc(S1, E, 3.0, 3.2, 2, 1.2); b.rc(E, lp(E, W, 0.85), 3.2, 4.4, 2, 0.8); }
  const Hd = J.head;
  b.f((x, y, z) => smax(sdEll(x, y, z, Hd[0], Hd[1] - 0.6, Hd[2] + 0.6, 5.8, 6.4, 6.8), -sdEll(x, y, z, Hd[0], Hd[1] + 5.6, Hd[2] - 0.6, 3.6, 3.6, 4.6), 0.8), [Hd[0] - 8, Hd[1] - 8, Hd[2] - 8, Hd[0] + 8, Hd[1] + 8, Hd[2] + 8], 3, 1, { pri: 1 });
  b.rc(add(Hd, [0, -3, -2]), add(J.chest, [0, -4, 4]), 5.5, 8, 3, 1.5);
  b.el(add(Hd, [0, 0.6, 0.4]), [4.4, 5.2, 1.5], 4, 0.2, { pri: 2 }); // blindfold
  b.tor([cx, my, 52], [0, 0, 1], 9.6, 0.8, 7);
}
export function procession(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el } = b;
  const PX = 15, PZ = tele ? 113 : 82;
  for (const [sx, my] of [[1, 31], [-1, 31], [1, -31], [-1, -31]]) monk(b, sx, my, PX, PZ, tele);
  for (const sx of [-1, 1]) { rc([sx * PX, -62, PZ], [sx * PX, 62, PZ], 1.7, 1.7, 6); for (const e of [-1, 1]) el([sx * PX, e * 63, PZ], [2.3, 1.8, 2.3], 8); }
  for (const yy of [-17, 17]) rc([-PX, yy, PZ + 1.5], [PX, yy, PZ + 1.5], 1.4, 1.4, 6);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 51);
    switch (m) {
      case 2: { let c = mix(L('#2e2a24'), L('#16140f'), clamp(n * 1.5 - 0.3)); c = mix(c, L('#3a2a18'), clamp((10 - z) / 10) * 0.8); return { alb: bloodHem(c, x, y, z, 8, 3), wrap: 0.3, spec: 0.05, gloss: 10, rim: 1.0 }; }
      case 3: return { alb: mix(L('#2a2620'), L('#14120e'), n), wrap: 0.3, rim: 1.0 };
      case 4: { const dz = Math.abs(z - (tele ? 89 : 87.5)); let c = mix(L('#c8bea2'), L('#8a826c'), n); if (Math.abs(Math.abs(x) - (PX + 9)) < 4 && vn3(x * 2, y * 2, z, 4) > 0.55) c = mix(c, S.bloodF, 0.8); return { alb: c, wrap: 0.3 }; }
      case 6: return { alb: mix(K.wood, K.woodD, n), spec: 0.25, gloss: 25 };
      case 7: return { alb: mix(L('#6a5a3a'), L('#3a3020'), n), wrap: 0.3 };
      case 8: return goldM(x, y, z);
    }
    return { alb: mix(L('#a89a86'), L('#6e6050'), n), sss: 0.4, wrap: 0.3 };
  };
  const r = done(b, mat, { size: 1.6 });
  // the reliquary (its own object, so its inner light can shine out of it)
  const z0 = PZ + 2.5, s = B(), ww = tele ? 2.4 : 0.9, zc = z0 + 20;
  s.box([0, 0, z0 + 2], [18.5, 23.5, 2.5], 8, 0, 0.5);
  s.f((x, y, z) => {
    let d = Math.max(sdBox(x, y, z, 0, 0, zc, 14, 19, 16, 0.4), -sdBox(x, y, z, 0, 0, zc, 12.4, 17.4, 14.4, 0));
    for (const wy of [-10, 0, 10]) d = Math.max(d, -Math.max(sdBox(x, y, z, 0, wy, zc - 1, 16, ww, 9, 0), Math.hypot(Math.abs(y - wy) + 2.5, z - zc - 2) - (ww + 2.5 + 7.5)));
    for (const wx of [-5.5, 5.5]) d = Math.max(d, -Math.max(sdBox(x, y, z, wx, 0, zc - 1, ww, 21, 9, 0), Math.hypot(Math.abs(x - wx) + 2.5, z - zc - 2) - (ww + 2.5 + 7.5)));
    return d;
  }, [-16, -21, z0 + 2, 16, 21, z0 + 38], 8, 0);
  s.el([0, 0, zc], [10.5, 15.5, 12.5], 10); // the burning heart, seen through the lancets
  const rb = z0 + 36; s.f((x, y, z) => Math.max(Math.abs(y) - 21.5, rb - z, (Math.abs(x) * 15 + (z - rb) * 16.5 - 16.5 * 15) / Math.hypot(15, 16.5)), [-18, -23, rb - 1, 18, 23, rb + 17], 8, 0);
  for (const ex of [-1, 1]) for (const ey of [-1, 1]) { s.rc([ex * 14.5, ey * 19.5, z0 + 34], [ex * 14.5, ey * 19.5, z0 + 52], 1.9, 0.2, 8); s.el([ex * 14.5, ey * 19.5, z0 + 40], [2.2, 2.2, 2.2], 8); }
  const SC = [0, 0, rb + 26]; s.rc([0, 0, rb + 15], add(SC, [0, 0, -8]), 1.2, 1.2, 8);
  s.tor(SC, [0, 1, 0], 7.5, 1.1, 8);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, u = [Math.cos(a), 0, Math.sin(a)]; s.rc(add(SC, sc(u, 8)), add(SC, sc(u, i & 1 ? 11.5 : 15)), 0.8, 0.15, 8); }
  s.el(SC, [4.6, 1.3, 4.6], 11);
  // seals and prayer strips hanging from the plinth; candles at its corners
  for (const sy of [-1, 1]) for (let x = -14; x <= 14; x += 7) { const hz = 5 + h2(x, sy, 3) * 6; s.box([x, sy * 23.8, z0 - hz + 1], [1.6, 0.25, hz], 14, 0, 0.1); s.el([x, sy * 24.1, z0 - 0.5], [1.3, 0.6, 1.3], 15); }
  for (const ex of [-1, 1]) for (const ey of [-1, 1]) { s.rc([ex * 16.5, ey * 21.5, z0 + 4.5], [ex * 16.5, ey * 21.5, z0 + 9], 0.9, 0.9, 16); s.el([ex * 16.5, ey * 21.5, z0 + 10.6], [0.7, 0.7, 1.3], 17); }
  const smat = (m, x, y, z) => {
    switch (m) {
      case 10: return glow(HOLY, tele ? 2.4 : 1.4);
      case 11: return glow(HOLY, tele ? 1.6 : 0.9);
      case 14: return { alb: mix(L('#b4a888'), L('#7a7058'), vn3(x, y, z, 2)), wrap: 0.5 };
      case 15: return { alb: L('#5a0a0e'), spec: 0.6, gloss: 60 };
      case 16: return { alb: L('#c8bc96'), sss: 0.5 };
      case 17: return glow(FIRE, 0.7);
    }
    const g = goldM(x, y, z); if (Math.abs(z - (z0 + 4.5)) < 1 || Math.abs(Math.abs(y) - 19) < 0.8) g.alb = mul(g.alb, 0.6); return g;
  };
  // built at bearer scale, shown 1.3 times bigger about its plinth
  const G = 1.3, gz = z => z0 + (z - z0) * G, sd0 = partsSdf(s.parts), [bx0, by0, bz0, bx1, by1, bz1] = boundsOf(s.parts, 2);
  r.subs = [{ name: 'reliq', model: { sdf: (x, y, z) => sd0(x / G, y / G, z0 + (z - z0) / G) * G, mat: (m, x, y, z) => smat(m, x / G, y / G, z0 + (z - z0) / G), bounds: [bx0 * G, by0 * G, gz(bz0), bx1 * G, by1 * G, gz(bz1)], step: 0.6 } }];
  r.lights = [{ p: [0, 0, gz(zc)], c: L('#f0d488'), I: tele ? 34 : 15, r0: tele ? 70 : 55, R: tele ? 400 : 300, pad: 1, soft: 10, haze: tele ? 0.012 : 0.006, hazeR: tele ? 8 : 6, skipSub: true },
    { p: [0, 0, gz(SC[2])], c: L('#e8c878'), I: tele ? 2.5 : 1, r0: 20, R: 120, pad: 3, haze: 0.04, hazeR: 4, noShadow: true }];
  return r;
}

// ======================= 3. LA NOURRICE DES GOULES =======================
// a starved vampire grown huge, kept by the Order as a living guard: iron stakes through the shoulders chained to the
// floor, a collar, gold seals nailed into her brow and breastbone. Young ghouls hang at her, feeding. 'tele': she rears up,
// arms high, jaw unhinged, the chains taut, the seals flaring as they burn her.
export function nourrice(pose = 'idle') {
  const tele = pose === 'tele'; const b = B(); const { rc, el, tor } = b; const k = 1.3;
  const pel = [0, -13, 44], belly = tele ? [0, -12, 70] : [0, -4, 66], chest = tele ? [0, -10, 98] : [0, 4, 91], nb = tele ? [0, -8, 117] : [0, 12, 107];
  const head = tele ? [0, -3, 131] : [0, 25, 115], F = nz(tele ? [0, 1, 0.75] : [0, 1, -0.3]), U = [0, -F[2], F[1]];
  const hp = (a, c, d) => add(head, add([a, 0, 0], add(sc(F, c), sc(U, d))));
  const Sh = s => tele ? [s * 19, -9, 113] : [s * 17, 6, 104];
  const arm = s => tele ? [[s * 38, -11, 137], [s * 44, -3, 166], [s * 0.15, 0.25, 1]] : [[s * 31, 13, 60], [s * 19, 33, 50], [s * -0.15, 0.45, -1]];
  // torso: pelvis, starved belly, wide ribcage, long neck
  el(pel, [12, 9, 8], 1, 3); for (const s of [-1, 1]) el([s * 10, -12, 49], [4, 4, 3], 1, 2);
  rc(pel, belly, 10, 8, 1, 4); rc(belly, chest, 8, 13, 1, 4); rc(chest, nb, 13, 6.5, 1, 4);
  rc(Sh(-1), Sh(1), 3.4, 3.4, 1, 5);
  const ax = nz(sub(nb, pel)), front = nz(crs(ax, [1, 0, 0])), back = sc(front, -1);
  for (let i = 0; i <= 14; i++) { const t = i / 14; const p = t < 0.5 ? lp(pel, chest, t * 2) : lp(chest, nb, t * 2 - 1); const r0 = t < 0.5 ? lerp(9, 13, t * 2) : lerp(13, 6.5, t * 2 - 1); el(add(p, sc(back, r0 - 0.5)), [1.6, 1.5, 1.5], 1, 1); }
  for (const s of [-1, 1]) el(add(lp(chest, nb, 0.3), add(sc(back, 9), [s * 8, 0, 0])), [5, 3, 5.5], 1, 2.5); // shoulder blades
  if (!tele) el(add(lp(chest, nb, 0.4), sc(back, 5)), [11, 8, 9], 1, 5); // the hunch
  rc(nb, hp(0, -2, -2), 3.8, 3.4, 1, 2);
  // head: long skull, hollow cheeks, sockets with two pale embers, jaw hanging (unhinged on the rear-up), long lank hair
  el(hp(0, -1, 1.5), [6, 6.6, 6.3], 1, 0); rc(hp(0, 3, -1), hp(0, 7.5, -6), 4.6, 2.3, 1, 1.5);
  const open = tele ? 10 : 2.5;
  for (const s of [-1, 1]) { rc(hp(s * 3.6, 1, -4), hp(s * 1.3, 7, -9 - open), 1.1, 0.8, 1, 0.6); rc(hp(s * 5.5, -1, 1.5), hp(s * 9.5, -4.5, 5.5), 1.1, 0.2, 1, 0.5); b.carve(hp(s * 2.3, 5.8, 1.1), 1.6, 0.4); b.carve(hp(s * 4.2, 4.2, -3), 1.6, 0.8); }
  b.carve(hp(0, 6.2, -5.5 - open * 0.5), 2.2 + open * 0.18, 0.4);
  for (let t = 0; t < 8; t++) { const s = t < 4 ? 1 : -1, j = t % 4; const p = hp(s * (0.5 + j * 0.8), 6.8 - j * 0.5, -3.6); rc(p, add(p, sc(U, -1.8)), 0.35, 0.06, 7); const q = hp(s * (0.5 + j * 0.8), 6.6 - j * 0.6, -8.5 - open); rc(q, add(q, sc(U, 1.5)), 0.3, 0.06, 7); }
  for (const s of [-1, 1]) el(hp(s * 2.3, 5.2, 1.1), [0.8, 0.8, 0.8], 17);
  const R = mulberry32(17);
  for (let i = 0; i < 13; i++) { const a = (i / 12 - 0.5) * 3.6; const root = hp(Math.sin(a) * 5.6, -1 - Math.cos(a) * 4, 4 + Math.cos(a) * 1.5); const mid = add(root, [Math.sin(a) * 4 + (R() - 0.5) * 3, (R() - 0.5) * 3 - (tele ? 4 : 0), -18 - R() * 6]); rc(root, mid, 1.4, 1.0, 13, 0.6); rc(mid, add(mid, [(R() - 0.5) * 4, (R() - 0.5) * 3, -16 - R() * 12]), 1.0, 0.3, 13, 0.4); }
  // arms: long, thin; on the floor at rest (knuckles), raised wide on the rear-up
  for (const s of [-1, 1]) { const [E, W, d] = arm(s), S1 = Sh(s); el(S1, [5.5, 5, 5], 1, 2.5); rc(S1, E, 4.4, 3.2, 1, 2); rc(E, W, 3.2, 2.2, 1, 1); el(E, [3.4, 3.4, 3.4], 1, 1.5); claws(b, W, d, s, 1, 2, tele ? 14 : 11, 0.9); }
  // legs: squatting, knees high and wide
  for (const s of [-1, 1]) { const H1 = [s * 11, -14, 42], K1 = [s * 29, 9, 47], A1 = [s * 22, -7, 6], T1 = [s * 23, 6, 1.5]; rc(H1, K1, 6, 4, 1, 2.5); el(K1, [4, 4, 4], 1, 1.5); rc(K1, A1, 4, 2.6, 1, 1.5); rc(A1, T1, 2.6, 1.6, 1, 1); claws(b, T1, [s * 0.2, 1, -0.4], s, 1, 2, 5, 0.8); }
  // a swollen belly, three young ghouls latched on it and feeding, hanging from her
  const Bc = add(lp(pel, chest, 0.28), sc(front, 5)); el(Bc, [13, 12, 13], 1, 5);
  const kids = [], dugs = [];
  for (const [x, zz, sd] of [[-8, -4, -1], [9, -2, 1], [0, -11, 0]]) {
    const A = add(add(Bc, sc(front, 11)), [x, 0, zz]); dugs.push(A);
    const D = nz(add(sc(front, 0.55), [sd * 0.35, 0, -1])), H2 = add(A, sc(front, 2.2)), nk = add(H2, sc(D, 4)), ch = add(nk, sc(D, 7.5)), pv = add(ch, sc(D, 8));
    el(H2, [2.7, 3.2, 2.8], 12, 1); rc(H2, nk, 1.3, 1.2, 12, 0.6); rc(nk, ch, 3.4, 3.7, 12, 1.5); rc(ch, pv, 3.5, 2.4, 12, 1.5); kids.push([H2, ch]);
    for (const s2 of [-1, 1]) {
      const sh = add(nk, [s2 * 4.2, 0, 0]), grip = add(A, [s2 * 8, 0, 5]), elb = add(lp(sh, grip, 0.5), add(sc(front, 4), [s2 * 3, 0, -1]));
      rc(sh, elb, 1.4, 1.0, 12, 0.6); rc(elb, grip, 1.0, 0.7, 12, 0.4); claws(b, grip, sub(grip, elb), s2, 12, 2, 2.6, 0.7);
      const hp1 = add(pv, [s2 * 2.4, 0, 0]), kn = add(hp1, add(sc(front, 6), [s2 * 2.5, 0, -2])); rc(hp1, kn, 1.8, 1.2, 12, 0.6); rc(kn, add(kn, add(sc(front, -2), [s2 * 0.5, 0, -8])), 1.2, 0.7, 12, 0.4);
    }
  }
  // the Order's iron: stakes through the shoulders and a collar, chained to rings in the floor; gold seals
  const anchors = [[-64, -34, 0], [64, -34, 0], [0, -74, 0]], heads = [];
  for (const s of [-1, 1]) { const S1 = Sh(s), top = add(S1, [s * 2, -8, 15]), tip = add(S1, [-s * 1, 7, -11]); rc(top, tip, 1.9, 0.4, 9); el(top, [2.6, 2.6, 1.2], 9); heads.push(top); }
  const col = lp(nb, chest, 0.25); tor(col, ax, 7.6, 1.5, 9); heads.push(add(col, sc(back, 8)));
  heads.forEach((h, i) => { const a = sc(anchors[i], 1 / k); chainLinks(b, h, a, tele ? 0 : 14, 1.0, 9, 3.6); tor(a, [0, 0, 1], 2.4, 0.7, 9); b.box(add(a, [0, 0, 0.4]), [3.4, 3.4, 0.4], 9, 0, 0.3); });
  const seals = [hp(0, 6.2, 4.6), add(lp(belly, chest, 0.85), sc(front, 12.5)), heads[0], heads[1]];
  el(seals[0], [2.2, 1.6, 2.2], 8, 0.3); el(seals[1], [3.2, 1.4, 3.2], 8, 0.3);
  for (const sp of [seals[0], seals[1]]) el(sp, [0.9, 2.2, 0.9], 9); // the nail through each
  for (const x of [-1.8, 1.8]) b.box(add(seals[1], [x, 0.6, -6.5]), [1.1, 0.25, 5], 14, 0, 0.1);
  const mat = (m, x, y, z) => {
    switch (m) {
      case 2: return { alb: mix(S.nail, S.blood, 0.35), spec: 0.4, gloss: 40 };
      case 7: return { alb: S.tooth, spec: 0.4, gloss: 40 };
      case 8: { const g = goldM(x, y, z); g.emi = sc(HOLY, tele ? 0.5 : 0.12); return g; }
      case 9: return ironM(x, y, z);
      case 12: { let c = mul(mix(skinTex(S.ghoul, S.ghoulD, x, y, z, 5), S.ghoulG, 0.5), 0.7); for (const [H2] of kids) { const d = Math.hypot(...sub([x, y, z], H2)); if (d < 4) c = mix(c, S.blood, clamp((4 - d) / 2.5) * 0.8); } return { alb: c, sss: 0.55, wrap: 0.3, spec: 0.15, gloss: 25 }; }
      case 13: return { alb: mix(L('#3a3630'), L('#121110'), vn3(x * 0.9, y * 0.9, z * 0.2, 3)), spec: 0.25, gloss: 30, wrap: 0.3 };
      case 14: return { alb: mix(L('#b4a888'), L('#7a7058'), vn3(x, y, z, 2)), wrap: 0.5 };
      case 17: return glow([0.95, 0.85, 0.45], tele ? 0.9 : 0.6);
    }
    let c = skinTex(L('#968f78'), L('#5e5a48'), x, y, z, 9); // grey, starved, veined skin
    c = mix(c, S.ghoulG, clamp(vn3(x * 0.08, y * 0.08, z * 0.08, 3) - 0.35) * 0.7);
    if (Math.abs(vn3(x * 0.25, y * 0.25, z * 0.25, 11) - 0.5) < 0.025) c = mix(c, L('#3e3448'), 0.6); // veins
    const md = Math.hypot(...sub([x, y, z], hp(0, 6, -6 - open * 0.5))); if (md < 9) c = mix(c, S.blood, clamp((9 - md) / 4) * (0.5 + 0.5 * vn3(x, y, z, 4)));
    for (const sp of seals) { const d = Math.hypot(...sub([x, y, z], sp)); if (d < 6.5) c = mix(c, d < 3.8 ? L('#1a0c08') : S.muscle, clamp((6.5 - d) / 2) * 0.9); } // burnt round the seals
    for (const h of heads.slice(0, 2)) { const d = Math.hypot(x - h[0], y - h[1]); if (d < 6 && z < h[2] && z > h[2] - 30) c = mix(c, S.bloodD, clamp((6 - d) / 3) * 0.7); }
    for (const p of dugs) { const d = Math.hypot(...sub([x, y, z], p)); if (d < 7) c = mix(c, S.bloodD, clamp((7 - d) / 4) * 0.7); }
    { const d = Math.hypot(...sub([x, y, z], Bc)); if (d < 16) c = mix(c, L('#6a5a5a'), clamp((16 - d) / 8) * 0.35); } // stretched, bruised belly
    return { alb: c, sss: 0.5, wrap: 0.3, spec: 0.18, gloss: 28 };
  };
  const r = done(b, mat, { size: 1.9 });
  const sd = r.sdf, ribC = lp(belly, chest, 0.6);
  const sdf0 = (x, y, z) => { let d = sd(x, y, z); const t = (x - ribC[0]) * ax[0] + (y - ribC[1]) * ax[1] + (z - ribC[2]) * ax[2]; if (Math.abs(t) < 13 && Math.abs(x) > 3) d += 0.55 * Math.max(0, Math.sin(t * 1.15)); return d; };
  r.sdf = sdf0; grow(r, k);
  r.lights = [seals[0], seals[1]].map((p, i) => ({ p: add(sc(p, k), sc(i ? front : F, 5)), c: L('#e8c070'), I: tele ? 4.5 : 0.9, r0: tele ? 24 : 14, R: tele ? 200 : 80, pad: 3, haze: tele ? 0.05 : 0.025, hazeR: tele ? 5 : 2.5 }));
  return r;
}

// ======================= Vesna's reliquary-cage (background of « la prison de Vesna ») =======================
// an iron cage round an upright gilded reliquary, wrapped in chains and seals; her rats swarm at its foot; the Order's candles
export function vesnaCage() {
  const b = B(); const { rc, el, tor } = b;
  const hw = 26, hd = 18, H = 104;
  cageBars(b, [0, 0, H / 2 + 3], [hw, hd, H / 2], 9, 4, 0.8);
  b.box([0, 0, 1.5], [hw + 3, hd + 3, 1.5], 9, 0, 0.5); // base plate
  rc([0, 0, H + 6], [0, 0, H + 16], 1.4, 1.4, 9); tor([0, 0, H + 24], [0, 1, 0], 7, 1.1, 8); // the Order's sun on top
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, u = [Math.cos(a), 0, Math.sin(a)]; rc(add([0, 0, H + 24], sc(u, 7.5)), add([0, 0, H + 24], sc(u, i & 1 ? 10 : 13)), 0.7, 0.15, 8); }
  // the reliquary: an upright coffin of tarnished gold, a slit at the face, chained crosswise, seals
  b.f((x, y, z) => { const w = 11 - Math.abs(z - 62) * 0.08, dd = sdBox(x, y, z, 0, 0, 50, w, 8, 46, 2); return Math.max(dd, -sdBox(x, y, z, 0, 8, 80, 4, 2, 0.8, 0)); }, [-16, -10, 3, 16, 10, 97], 8, 0);
  b.box([0, 0, 97.5], [12.5, 9.5, 1.5], 8, 0, 0.4);
  for (const z of [28, 50, 72]) for (const s of [-1, 1]) chainLinks(b, [-hw + 1, -s * hd * 0.6, z + s * 9], [hw - 1, s * hd * 0.6, z - s * 9], 0, 0.7, 9, 2.8);
  for (const [x, z] of [[-5, 64], [4, 40], [0, 20]]) { el([x, 9.3, z], [2, 0.7, 2], 15); b.box([x, 9.4, z - 6], [1.3, 0.25, 4.5], 14, 0, 0.1); }
  const pupils = [[-2.2, 9, 80], [2.2, 9, 80]]; // something watches through the slit
  for (const p of pupils) el(p, [0.9, 0.6, 0.6], 17);
  // her rats: on the base, up the bars
  const R = mulberry32(5);
  for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, rr = 30 + R() * 14; const p = [Math.cos(a) * rr, Math.sin(a) * rr * 0.75, 2]; if (p[1] < -16) continue; rat(b, p, [-Math.sin(a) + (R() - 0.5), Math.cos(a) + (R() - 0.5), 0], 0.95 + R() * 0.3, 20, R() < 0.4); }
  for (const [x, y, z] of [[-26, 18.6, 30], [-16, 18.6, 52], [14, 18.6, 24], [26, 10, 44], [5, 18.6, 70]]) rat(b, [x, y + 1.5, z], [(R() - 0.5) * 0.6, 0.15, 1], 1.0);
  // candles of the Order on the base
  const cand = [[-22, 19, 0], [-12, 21, 0], [12, 22, 0], [22, 19, 0], [0, 23, 0]];
  for (const [x, y] of cand) { const h = 6 + h2(x, y, 4) * 6; rc([x, y, 3], [x, y, 3 + h], 1.1, 1.0, 16); el([x, y, 4.5 + h], [0.7, 0.7, 1.4], 18); }
  const mat = (m, x, y, z) => {
    switch (m) {
      case 8: { const g = goldM(x, y, z); if (vn3(x * 0.3, y * 0.3, z * 0.3, 8) > 0.6) g.alb = mix(g.alb, L('#2a2a1a'), 0.6); return g; }
      case 9: return ironM(x, y, z);
      case 14: return { alb: mix(L('#b4a888'), L('#7a7058'), vn3(x, y, z, 2)), wrap: 0.5 };
      case 15: return { alb: L('#5a0a0e'), spec: 0.6, gloss: 60 };
      case 16: return { alb: mix(L('#c8bc96'), L('#8a7e60'), vn3(x, y, z * 0.3, 3)), sss: 0.5, wrap: 0.4 };
      case 17: return glow([0.9, 0.8, 0.5], 0.8);
      case 18: return glow(FIRE, 0.8);
      case 20: case 21: case 22: return ratMat(m, x, y, z);
    }
    return { alb: [0.2, 0.2, 0.2] };
  };
  const r = done(b, mat);
  r.lights = cand.map(([x, y]) => ({ p: [x, y + 2, 16], c: L('#d8904a'), I: 1.1, r0: 14, R: 110, pad: 2, soft: 4, haze: 0.04, hazeR: 2.5 }));
  return r;
}

// a heap of bones and skulls (w x d), and a rat nest (rags, straw, bones, rats)
export function bonePile(seed = 1, w = 40, d = 16, n = 26) {
  const b = B(); const R = mulberry32(seed); const skulls = [];
  b.el([0, 0, -2], [w * 0.5, d * 0.5, 7], 3, 2);
  for (let i = 0; i < n; i++) {
    const x = (R() - 0.5) * w, y = (R() - 0.5) * d, z = Math.max(1, 6 * (1 - (2 * x / w) ** 2) * (1 - (2 * y / d) ** 2)) + R() * 2;
    if (R() < 0.3) { b.el([x, y, z + 2.5], [2.8, 3.3, 2.8], 1); b.rc([x, y + 1.6, z + 2], [x, y + 3.2, z + 1], 1.9, 1.3, 1, 1); for (const s of [-1, 1]) b.carve([x + s * 1.1, y + 3, z + 2.8], 0.8, 0.3); skulls.push([x, y, z]); }
    else { const a = R() * Math.PI, L2 = 6 + R() * 7; const u = [Math.cos(a) * L2 / 2, Math.sin(a) * L2 / 2, (R() - 0.5) * 3]; b.rc(sub([x, y, z + 1], u), add([x, y, z + 1], u), 0.9, 0.9, 1); b.el(add([x, y, z + 1], u), [1.3, 1.3, 1.3], 1, 0.4); b.el(sub([x, y, z + 1], u), [1.3, 1.3, 1.3], 1, 0.4); }
  }
  const mat = (m, x, y, z) => m === 3 ? { alb: mix(L('#1e1a14'), L('#2e2418'), vn3(x * 0.4, y * 0.4, z, seed)) } : { alb: mix(S.tooth, L('#5e5440'), clamp(vn3(x * 0.5, y * 0.5, z * 0.5, seed) * 1.4 - 0.2)), spec: 0.2, gloss: 30 };
  return done(b, mat);
}
export function ratNest(seed = 3, nRats = 6) {
  const b = B(); const R = mulberry32(seed);
  b.f((x, y, z) => sdEll(x, y, z, 0, 0, 0, 22, 15, 7) + 1.6 * (vn3(x * 0.4, y * 0.4, z * 0.4, seed) - 0.5), [-25, -18, -2, 25, 18, 9], 3, 0);
  for (let i = 0; i < 9; i++) { const a = R() * Math.PI, x = (R() - 0.5) * 30, y = (R() - 0.5) * 18; b.rc([x - Math.cos(a) * 5, y - Math.sin(a) * 5, 4], [x + Math.cos(a) * 5, y + Math.sin(a) * 5, 3], 0.8, 0.8, 1); }
  for (let i = 0; i < nRats; i++) { const a = R() * Math.PI * 2, rr = R() * 16; rat(b, [Math.cos(a) * rr, Math.sin(a) * rr * 0.6, 6.5 - rr * 0.25], [Math.cos(a + 1.6 + R()), Math.sin(a + 1.6 + R()), 0], 0.9 + R() * 0.3); }
  const mat = (m, x, y, z) => m === 3 ? { alb: mix(L('#3a3020'), L('#16120c'), clamp(vn3(x * 0.6, y * 0.6, z * 0.6, seed) * 1.6 - 0.3)), wrap: 0.4 } : m === 1 ? { alb: mix(S.tooth, L('#5e5440'), vn3(x, y, z, 3)), spec: 0.2 } : ratMat(m, x, y, z);
  return done(b, mat);
}

export const BOSSES = [
  { id: 1, fn: deratiseur, key: 'deratiseur', name: 'Le Dératiseur' },
  { id: 2, fn: procession, key: 'procession', name: 'La Procession' },
  { id: 3, fn: nourrice, key: 'nourrice', name: 'La Nourrice des goules' },
];
