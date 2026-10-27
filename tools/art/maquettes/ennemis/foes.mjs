// Ten enemy designs (mockup only). Same conventions as hero.mjs: x = their left, y = forward, z = up, feet at z=0.
// Each foe(pose) returns { sdf, mat, bounds, step, lights:[{p,c,I,r0,R,haze}], fx:[floor telegraphs], vfx?: model (emissive, no shadow) }.
import { sdRC, sdEll, sdBox, sdSphere, smin, smax, partsSdf, clamp, lerp, sstep, vn, vn3, fbm3, h2, L, mix, mul, mulberry32 } from './lib.mjs';
import { builder, boundsOf, humanoid, std, S, skinTex } from './cast.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nz = a => { const l = Math.hypot(...a) || 1; return sc(a, 1 / l); };
const lp = (a, b, t) => add(a, sc(sub(b, a), t));
const clone = J => JSON.parse(JSON.stringify(J));

// colours
export const K = {
  ivory: L('#b8ad90'), ivoryD: L('#6e6652'), gold: L('#9a7428'), goldD: L('#4e3410'), goldL: L('#c8a050'),
  black: L('#16130f'), blackL: L('#2c2620'), oxblood: L('#3e0a0c'), skin: L('#a87a5a'), skinD: L('#6e4a36'), pale: L('#c4b89c'),
  leather: L('#3a2818'), leatherD: L('#22170e'), brass: L('#9a6430'), brassD: L('#4a2a12'), bronze: L('#7a5424'), verd: L('#4e5e44'),
  wood: L('#3e2c1c'), woodD: L('#24190f'), sack: L('#6a5c44'), sackD: L('#3e3428'), hide: L('#4a2a1a'), hideD: L('#1c100a'), mange: L('#8e5e4c'),
};
export const HOLY = [1.7, 1.3, 0.62], HEAL = [1.15, 1.2, 1.05], FIRE = [2.4, 0.95, 0.22];
export const glow = (e, k = 1) => ({ alb: [0.15, 0.12, 0.08], emi: e.map(v => v * k), noAO: true, noShadow: true, rim: 0 });
export const ironM = (x, y, z, s = 7) => { const n = vn3(x * 0.4, y * 0.4, z * 0.4, s); return { alb: mix(S.iron, n > 0.55 ? S.rustL : S.rust, clamp(n * 1.8 - 0.5)), spec: 0.5, gloss: 40 }; };
export const goldM = (x, y, z) => { const n = vn3(x * 0.6, y * 0.6, z * 0.6, 3); return { alb: mix(K.gold, K.goldD, clamp(n * 1.8 - 0.5)), spec: 0.9, gloss: 45 }; };
const cloth = (a, b, x, y, z, s = 1, k = 1) => ({ alb: mix(a, b, clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, s) * 1.6 - 0.35) * k), wrap: 0.3, spec: 0.04, gloss: 10 });
export const bloodHem = (c, x, y, z, top, s = 5) => mix(c, S.bloodD, clamp((top - z) / 10) * clamp(vn3(x * 0.5, y * 0.5, z * 0.25, s) * 1.7 - 0.35));

// builder with a few extra shapes
export function B() {
  const b = builder();
  b.f = (f, box, m, k = 0, ex = {}) => b.parts.push({ f, m, k, box, ...ex });
  b.box = (c, h, m, k = 0, r = 0.3, ex = {}) => b.f((x, y, z) => sdBox(x, y, z, c[0], c[1], c[2], h[0], h[1], h[2], r), [c[0] - h[0] - 1, c[1] - h[1] - 1, c[2] - h[2] - 1, c[0] + h[0] + 1, c[1] + h[1] + 1, c[2] + h[2] + 1], m, k, ex);
  b.tor = (c, n, R, r, m, k = 0, ex = {}) => { n = nz(n); const e = R + r + 1; b.f((x, y, z) => { const px = x - c[0], py = y - c[1], pz = z - c[2]; const a = px * n[0] + py * n[1] + pz * n[2]; const q = Math.hypot(px - a * n[0], py - a * n[1], pz - a * n[2]); return Math.hypot(q - R, a) - r; }, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e], m, k, ex); };
  // solid of revolution around a vertical axis, radius rf(t) for t in 0..1 between z0 and z1, y squashed by sy
  b.rev = (cx, cy, z0, z1, rf, m, k = 0, sy = 1, ex = {}) => { let rm = 0; for (let i = 0; i <= 20; i++) rm = Math.max(rm, rf(i / 20)); const fo = ex.fold; if (fo) rm += fo[1];
    b.f((x, y, z) => { const t = clamp((z - z0) / (z1 - z0)); let r = rf(t); if (fo) { const a = Math.atan2(y - cy, x - cx); r += fo[1] * (1 - t * 0.75) * Math.sin(a * fo[0] + 2.2 * vn(a * 1.3 + 5, z * 0.05, 7)); }
      return Math.max((Math.hypot(x - cx, (y - cy) / sy) - r) * 0.6 * Math.min(1, sy), z0 - z, z - z1); }, [cx - rm - 1, cy - rm * sy - 1, z0 - 1, cx + rm + 1, cy + rm * sy + 1, z1 + 1], m, k, ex); };
  // round cone with the y offset squashed (flat garments)
  b.rcs = (a, c, r1, r2, m, k = 0, sy = 1, ex = {}) => { const y0 = a[1]; const a2 = a, c2 = [c[0], y0 + (c[1] - y0) / sy, c[2]]; const r = Math.max(r1, r2) + 1; b.f((x, y, z) => sdRC(x, y0 + (y - y0) / sy, z, a2, c2, r1, r2) * Math.min(1, sy), [Math.min(a[0], c[0]) - r, Math.min(a[1], c[1]) - r * sy, Math.min(a[2], c[2]) - r, Math.max(a[0], c[0]) + r, Math.max(a[1], c[1]) + r * sy, Math.max(a[2], c[2]) + r], m, k, ex); };
  b.chain = (pts, r, m, k = 0) => { for (let i = 0; i < pts.length - 1; i++) b.rc(pts[i], pts[i + 1], r, r, m, k); };
  return b;
}
export const done = (b, mat, extra = {}) => ({ sdf: partsSdf(b.parts), mat, bounds: boundsOf(b.parts, 2), step: 0.6, lights: [], fx: [], ...extra });
// claws: n fingers from wrist W along dir d
export function claws(b, W, d, side, m, mc, len = 5, spread = 0.5) {
  d = nz(d); const sv = nz([d[1] || 0.001, -d[0], 0]);
  for (let f = 0; f < 4; f++) { const o = (f - 1.5); const base = add(W, sc(sv, o * 0.7)); const dir = nz(add(d, sc(sv, o * spread * 0.4))); const mid = add(base, sc(dir, len * 0.55)); const tip = add(mid, add(sc(dir, len * 0.5), [0, 0, -len * 0.15])); b.rc(base, mid, 0.45, 0.35, m, 0.3); b.rc(mid, tip, 0.35, 0.05, mc, 0.15); }
}

// ======================= 1. CHIEN DE CHASSE (lore) =======================
// pose: 'idle', 'atk' (flattened, muzzle open: the game's tell), 'leap' (the game's attack: stretched out in the air);
// o (the game's sheet, tools/art/foes.gen.mjs): breath (0..1), gait (the trot's phase, radians), recoil (0..1)
export function chien(pose = 'idle', o = {}) {
  const atk = pose === 'atk', leap = pose === 'leap', open = atk || leap; const b = B(); const { rc, el, tor } = b;
  const dz = atk ? -8 : 0, up = leap ? 9 : 0, br = o.breath ?? 0, rec = o.recoil ?? 0;
  const chest = [0, 12 - 2 * rec, 30 + dz + up + 0.6 * br + 2 * rec], hips = [0, leap ? -20 : -18, 30 + dz * 0.4 + up];
  el(chest, [6.2, 10, 9], 1, 2);
  rc(add(chest, [0, -9, 0.5]), add(hips, [0, 5, 1.5]), 5.0, 4.0, 1, 2.6);
  el(hips, [5.4, 6.5, 6], 1, 2);
  for (let i = 0; i < 12; i++) { const p = lp(add(hips, [0, -2, 5]), add(chest, [0, 4, 8]), i / 11); el(p, [1.1, 1, 1], 1, 0.8); } // spine ridge
  const N0 = add(chest, [0, 8, 4]);
  const Hd = atk ? [0, 36, 21] : leap ? [0, 41, 38] : [0, 31 - 3 * rec, 46 + 0.3 * br + 3 * rec];
  rc(N0, add(Hd, [0, -3, -1]), 6.2, 4.0, 1, 2.4);
  el(Hd, [4.6, 5.8, 4.4], 1, 1.2);
  const jawOpen = atk ? 6 : leap ? 8 : 0;
  rc(add(Hd, [0, 3, -0.3]), add(Hd, [0, 11.5, -1.6]), 3.4, 2.2, 1, 1);
  rc(add(Hd, [0, 2, -2.4]), add(Hd, [0, 10, -3.6 - jawOpen]), 2.0, 1.3, 1, 0.6);
  if (open) b.carve(add(Hd, [0, 8, -3.4]), 1.6, 0.4);
  for (const s of [-1, 1]) { rc(add(Hd, [s * 2.6, -2, 2.4]), add(Hd, [s * 3.6, -3.4, 5.8]), 1.1, 0.4, 1, 0.6); b.carve(add(Hd, [s * 1.9, 3.6, 1.2]), 0.8, 0.3); }
  // fangs
  for (const s of [-1, 1]) { rc(add(Hd, [s * 1.2, 10, -1.6]), add(Hd, [s * 1.2, 10.4, -3.4]), 0.35, 0.08, 7); if (open) rc(add(Hd, [s * 1.0, 9.4, -3.6 - jawOpen]), add(Hd, [s * 1.0, 9.6, -2.2 - jawOpen]), 0.3, 0.06, 7); }
  // iron muzzle cage (open on the attack)
  const ma = add(Hd, [0, 4, -0.9]), mb = add(Hd, [0, 12, open ? 1 : -2.2]); const md = nz(sub(mb, ma));
  for (const t of [0.1, 0.55, 0.98]) tor(lp(ma, mb, t), md, 3.9 - t * 1.0, 0.45, 9);
  for (const s of [-1, 1]) rc(add(ma, [s * 3.6, 0, 0.5]), add(mb, [s * 2.7, 0, 0.5]), 0.4, 0.4, 9);
  rc(add(ma, [0, 0, 3.9]), add(mb, [0, 0, 2.9]), 0.4, 0.4, 9);
  // spiked collar with the Order's sun medal
  const cn = nz(sub(Hd, N0)), cc = lp(N0, Hd, 0.25);
  tor(cc, cn, 6.0, 1.5, 9, 0.3);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const u = nz([Math.cos(a), -cn[2] * Math.sin(a), cn[1] * Math.sin(a)]); const p = add(cc, sc(u, 7)); rc(p, add(p, sc(u, 3.6)), 0.8, 0.1, 9); }
  el(add(cc, [0, 5, -6.8]), [2.2, 0.7, 2.2], 8);
  // legs
  const legs = atk ? {
    F: [[5.5, 18, 26], [8.5, 26, 13], [8, 30, 4], [8, 33, 1.2]], R: [[5, -18, 27], [6.5, -8, 14], [5.5, -22, 6], [5.5, -17, 1.2]],
  } : leap ? { // forelegs reaching for the prey, hind legs thrown back
    F: [[5.5, 19, 37], [6.5, 29, 32], [6.5, 37, 27], [6.5, 41, 25]], R: [[5, -19, 37], [5.5, -27, 30], [5.5, -37, 26], [5.5, -41, 25]],
  } : { F: [[5, 18, 31], [5.6, 15, 17], [5.2, 17.5, 6], [5.2, 20.5, 1.2]], R: [[4.8, -19, 30], [5.6, -12, 18], [5.2, -23.5, 8], [5.2, -20.5, 1.2]] };
  for (const s of [-1, 1]) for (const k of ['F', 'R']) {
    let [a, c, d, e] = legs[k].map(p => [p[0] * s, p[1], p[2]]);
    if (o.gait !== undefined) { // a trot: diagonal pairs together, each paw lifted on its way forward
      const ph = o.gait + (k === 'R' ? Math.PI : 0) + (s < 0 ? Math.PI : 0), dy = 7 * Math.sin(ph), lift = 5 * Math.max(0, Math.cos(ph)) ** 1.5;
      c = add(c, [0, dy * 0.5, lift * 0.5]); d = add(d, [0, dy * 0.9, lift]); e = add(e, [0, dy, lift]);
    }
    rc(a, c, k === 'F' ? 4.2 : 4.8, 2.6, 1, 1.6); rc(c, d, 2.4, 1.7, 1, 0.6); rc(d, e, 1.9, 1.8, 1, 0.5);
    for (let f = 0; f < 3; f++) rc(add(e, [(f - 1) * 0.9, 1.3, 0]), add(e, [(f - 1) * 1.1, 2.8, -0.6]), 0.4, 0.1, 2, 0.2);
  }
  rc(add(hips, [0, -6, 2]), atk ? add(hips, [0, -12, 10]) : leap ? add(hips, [0, -15, 2]) : add(hips, [0, -12, -6]), 1.6, 0.7, 1, 0.8);
  const mat = (m, x, y, z) => {
    if (m === 7) return { alb: S.tooth, spec: 0.4, gloss: 40 };
    if (m === 9) return ironM(x, y, z);
    if (m === 8) return goldM(x, y, z);
    if (m === 2) return { alb: S.nail, spec: 0.3, gloss: 30 };
    const n = fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 4);
    let c = mix(K.hide, K.hideD, clamp(n * 1.8 - 0.4));
    const mg = vn3(x * 0.22, y * 0.22, z * 0.22, 9); if (mg > 0.62) c = mix(c, K.mange, clamp((mg - 0.62) * 6) * 0.85); // mange patches
    if (Math.abs(Math.sin(x * 0.9 + y * 0.35 + z * 0.2)) > 0.97 && mg > 0.4) c = mix(c, L('#8a6a5a'), 0.7); // whip scars
    if (Math.abs(y - chest[1]) < 8 && Math.abs(x) > 4 && Math.sin(y * 1.5) > 0.6) c = mul(c, 0.7); // ribs
    const md2 = Math.hypot(x - Hd[0], y - Hd[1] - 9, z - Hd[2] + 2); if (md2 < 5) c = mix(c, open ? S.bloodF : S.bloodD, clamp((5 - md2) / 3) * 0.8); // wet mouth
    return { alb: c, spec: 0.12, gloss: 25, wrap: 0.25, sss: 0.15 };
  };
  const r = done(b, mat, { yawFront: 0.75 });
  if (atk) r.fx = [{ k: 'rect', a: [0, 46], b: [0, 110], w: 5, col: 'red' }];
  return r;
}

// ======================= 2. PÉNITENT (new) =======================
// pose: 'idle', 'atk' (the lash), 'tele' (the game's tell: the scourge cocked high behind him); over: joints to override,
// or a function of the joints returning them (the game's sheet, tools/art/foes.gen.mjs, poses its frames with it)
export function penitent(pose = 'idle', seed = 2, over = {}) {
  const atk = pose === 'atk', tele = pose === 'tele'; const J = clone(std); const b = B(); const { rc, el } = b;
  Object.assign(J, atk ? {
    head: [0, 11, 85], neck: [0, 8.5, 78], chest: [0, 6, 68], pelvis: [0, 1, 49],
    Sr: [-8, 5, 75], Er: [-11, 14, 70], Wr: [-8, 24, 64], Hr_: [-7.5, 26.5, 63],
    Sl: [8, 7, 75], El: [11, 15, 66], Wl: [9, 23, 62], Hl_: [8.5, 26, 61.5],
    Hl: [3.6, 2, 47], Kl: [4.5, 13, 28], Al: [4.5, 12, 5], Tl: [5, 18, 1.2], Hr: [-3.6, 0, 47], Kr: [-4.4, -6, 26], Ar: [-4.6, -18, 7], Tr: [-4.6, -14, 1.2],
  } : tele ? {
    head: [0, 1.5, 87], neck: [0, 1, 80], chest: [0, 0, 70], pelvis: [0, 0, 50],
    Sr: [-8.5, -0.5, 77], Er: [-15, -3, 87], Wr: [-14, -6, 100], Hr_: [-13.5, -7, 104],
    Sl: [8, 0.5, 76], El: [9.5, 6, 62], Wl: [8, 13, 58], Hl_: [7.5, 15, 57],
    Kl: [4.4, 6, 27], Al: [4.4, 6, 4], Tl: [4.8, 12, 1.2], Kr: [-4, -3, 27], Ar: [-4.2, -8, 4], Tr: [-4.5, -2, 1.2],
  } : {
    head: [0, 3.5, 87], neck: [0, 2.5, 80], chest: [0, 1.5, 70], pelvis: [0, 0, 50],
    Sr: [-8, 0.5, 76], Er: [-9.5, 1, 59], Wr: [-9.3, 4, 45], Hr_: [-9.2, 5.5, 41.5],
    Sl: [8, 0.5, 76], El: [9.4, 1.5, 59], Wl: [8.5, 5, 46], Hl_: [8, 6, 43],
  });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { thin: 0.92 });
  const Hd = J.head;
  // burlap hood pulled over the head, eye holes, rope at the neck
  el(add(Hd, [0, -0.4, 0.6]), [4.9, 5.4, 5.9], 3, 0.8, { pri: 1 });
  rc(add(Hd, [0, -2, 3]), add(Hd, [0, -6.5, -3]), 3.6, 2.4, 3, 1.2, { pri: 1 });
  b.rcs(add(Hd, [0, 0, -3]), add(J.neck, [0, 0, -4]), 4.6, 8.2, 3, 1.0, 0.7, { pri: 1 });
  for (const s of [-1, 1]) b.carve(add(Hd, [s * 1.8, 4.9, 0.4]), 0.9, 0.2);
  b.tor(add(J.neck, [0, 0.5, 1]), [0, 0.2, 1], 3.6, 0.6, 5, 0.2);
  // the cross he drags: rough beams lashed to his back
  const cb = J.chest[1] - 7, lean = atk ? 5 : 2;
  rc([2, cb + 2, 10], [-1.5, cb - lean, 124], 3.2, 2.9, 6, 0); rc([-21, cb - lean * 0.75, 101], [20, cb - lean * 0.8, 104], 2.9, 2.7, 6, 0);
  b.tor([-0.3, cb - lean * 0.75, 102.5], [0, 1, 0.1], 3.6, 0.7, 5, 0.2); b.tor([0.5, cb - 0.4 * lean, 70], [0, 0, 1], 3.6, 0.7, 5, 0.2);
  for (const s of [-1, 1]) b.chain([add(J.chest, [s * 6, 3, 6]), add(J.chest, [s * 5, -5, 9]), [s * 1, cb - 0.5 * lean, 76]], 0.55, 5, 0.3);
  // sackcloth skirt + rope
  const P0 = J.pelvis;
  b.f((x, y, z) => { const t = clamp((P0[2] + 3 - z) / 26); return Math.max((Math.hypot(x - P0[0], (y - P0[1]) / 0.75) - (6.6 + t * 3.4)) * 0.7, z - P0[2] - 3, P0[2] - 22 - 4 * vn(x * 0.5, y * 0.5, 4) - z); }, [P0[0] - 12, P0[1] - 10, P0[2] - 28, P0[0] + 12, P0[1] + 10, P0[2] + 5], 4, 0.6);
  b.tor(add(P0, [0, 0, 2.5]), [0, 0.15, 1], 6.3, 0.6, 5, 0.2);
  // scourge: handle + 4 nailed cords
  const hd = J.Hr_, hdir = atk ? nz([0.1, 1, -0.2]) : tele ? nz([-0.3, -0.5, 1]) : [0, 0.15, -1];
  const h1 = add(hd, sc(hdir, 6)); rc(hd, h1, 0.8, 0.7, 6);
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5);
    const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5;
      pts.push(atk ? add(h1, [o * 2.2 * t + Math.sin(t * 4 + o) * 1.5, t * 18 - t * t * 4, t * 10 - t * t * 34 + o * 1.2 * t])
        : tele ? add(h1, [-3 * t + o * 1.6 * t, -6 * t - t * t * 4 + Math.sin(t * 3 + o), 4 * t - t * t * 24]) // swinging back, out by his shoulder
        : add(h1, [o * 0.9 * t, 2 * t + Math.sin(t * 3 + o) * 1.5, -t * 30])); }
    b.chain(pts, 0.6, 7); const tip = pts[5]; el(tip, [1.3, 1.3, 1.3], 9);
  }
  const mat = (m, x, y, z, nx, ny) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, seed);
    switch (m) {
      case 3: { let c = mix(L('#6e5e44'), L('#3a3022'), clamp(n * 1.6 - 0.3)); if (Math.abs(Math.sin(x * 2.2) * Math.sin(z * 2.2)) > 0.85) c = mul(c, 0.75); // coarse weave
        c = mix(c, S.bloodD, clamp((J.head[2] - 3 - z) / 5) * 0.75 * clamp(vn3(x, y, z * 0.3, 4) * 2 - 0.3)); return { alb: c, wrap: 0.35, spec: 0.03 }; }
      case 4: return { alb: bloodHem(mix(K.sack, K.sackD, clamp(n * 1.6 - 0.3)), x, y, z, J.pelvis[2] - 12), wrap: 0.3 };
      case 5: return { alb: mix(L('#5a4a30'), L('#2e2416'), n), wrap: 0.3 };
      case 7: return { alb: mix(L('#9a7a5a'), S.blood, n * 0.8), spec: 0.4, gloss: 40 };
      case 6: { const g = Math.abs(Math.sin((x + z * 0.15) * 1.7 + vn(x * 0.4, z * 0.1, 3) * 3)); return { alb: mix(mix(L('#4a3626'), L('#24180e'), g), S.bloodD, clamp(vn3(x * 0.4, y * 0.4, z * 0.2, 9) * 1.8 - 0.8)), spec: 0.1, gloss: 15 }; }
      case 9: return ironM(x, y, z);
    }
    // bare skin, whipped raw: the back is open meat
    let c = skinTex(L('#b09070'), L('#7a5844'), x, y, z, seed);
    const back = y < J.chest[1] - 1 && z > J.pelvis[2] && z < J.neck[2];
    if (back) { const lash = Math.abs(Math.sin((x * 0.8 + z * 0.55) + vn(x * 0.3, z * 0.3, 2) * 2)); if (lash > 0.75) return { alb: mix(S.muscle, S.bloodF, n), spec: 0.6, gloss: 60, sss: 0.3 }; c = mix(c, S.blood, 0.35 + 0.3 * n); }
    if (vn3(x * 0.5, y * 0.5, z * 0.15, 3) > 0.6) c = mix(c, S.bloodD, 0.6); // runs of blood
    if (z < 6) c = mix(c, L('#2a2016'), 0.7); // filthy feet
    return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.15, gloss: 30 };
  };
  const r = done(b, mat);
  if (atk) r.fx = [{ k: 'cone', c: [0, 6], a: Math.PI / 2, half: 0.55, r0: 4, r1: 36, col: 'red' }];
  return r;
}

// ======================= 3. PRÊTRE (lore) =======================
// over: joints to override, or a function of the joints returning them (the game's sheet, tools/art/foes.gen.mjs, poses
// its frames with it); its `glow` scales the monstrance's
export function pretre(pose = 'idle', over = {}) {
  const atk = pose === 'atk'; const J = clone(std); const b = B(); const { rc, el, tor } = b;
  Object.assign(J, atk ? {
    head: [0, 2.5, 91], neck: [0, 1, 83], Sr: [-8.5, 1, 79], Er: [-8, 9, 80], Wr: [-2, 16, 84], Hr_: [-1, 18, 85],
    Sl: [8.5, 1, 79], El: [8, 7, 70], Wl: [2, 11, 74], Hl_: [1, 12.5, 75],
  } : { Sr: [-8.5, 0, 78], Er: [-8, 4, 63], Wr: [-3, 8, 64], Hr_: [-1, 8.5, 66], Sl: [8.5, 0, 78], El: [11, 2, 63], Wl: [12, 6, 70], Hl_: [12, 7, 73] });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { armM: 2 });
  // robe (bell) + wide sleeves
  b.rev(0, 0, 0.5, 78, t => t < 0.62 ? lerp(15, 9.6, Math.pow(t / 0.62, 0.7)) : lerp(9.6, 7.4, (t - 0.62) / 0.38), 2, 1.5, 0.82, { fold: [9, 1.2] });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 3.0, 3.2, 2, 1.2); rc(E, lp(E, W, 0.85), 3.2, 4.8, 2, 0.8); }
  // deep cowl with a gilded sun-mask inside
  const Hd = J.head;
  b.f((x, y, z) => smax(sdEll(x, y, z, Hd[0], Hd[1] - 0.6, Hd[2] + 0.6, 5.8, 6.4, 6.8), -sdEll(x, y, z, Hd[0], Hd[1] + 5.6, Hd[2] - 0.6, 3.6, 3.6, 4.6), 0.8), [Hd[0] - 8, Hd[1] - 8, Hd[2] - 8, Hd[0] + 8, Hd[1] + 8, Hd[2] + 8], 3, 1, { pri: 1 });
  rc(add(Hd, [0, -3, -2]), add(J.chest, [0, -4, 4]), 5.5, 8, 3, 1.5); // cowl drape on the back
  el(add(Hd, [0, 2.2, -0.6]), [3.0, 1.6, 3.9], 8, 0.3, { pri: 2 });
  // nimbus of iron spikes behind the head
  const nc = add(Hd, [0, -6.5, 3]);
  tor(nc, [0, 1, 0], 8.5, 0.75, 8);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const u = [Math.cos(a), 0, Math.sin(a)]; if (u[2] < -0.6) continue; rc(add(nc, sc(u, 8.5)), add(nc, sc(u, i & 1 ? 12 : 15.5)), 0.7, 0.1, 8); }
  // staff with a monstrance
  const s0 = atk ? [0, 2, 62] : [12.5, 7.5, 2], s1 = atk ? [0, 34, 112] : [12.5, 7.5, 122];
  rc(s0, s1, 1.0, 0.9, 6);
  const mo = add(s1, [0, 0, 6]);
  tor(mo, [0, 1, 0], 4.8, 0.7, 8);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const u = [Math.cos(a), 0, Math.sin(a)]; rc(add(mo, sc(u, 5)), add(mo, sc(u, i & 1 ? 8 : 10)), 0.6, 0.15, 8); }
  el(mo, [2.8, 1.4, 2.8], 10);
  const mat = (m, x, y, z, nx, ny, nz_) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 12);
    switch (m) {
      case 2: { // robe: ivory gone yellow-grey, gold stole down the front, hem dragged through blood
        let c = mix(K.ivory, K.ivoryD, clamp(n * 1.5 - 0.3));
        if (y > 1.5 && Math.abs(x) < 3.2 && z < 78 && z > 6) { c = (Math.abs(x) > 2.4) ? K.goldD : mix(K.gold, K.goldD, n); if (Math.abs((z % 14) - 7) < 1.5 && Math.abs(x) < 1.6) c = K.goldL; }
        c = bloodHem(c, x, y, z, 14, 12);
        return { alb: c, wrap: 0.35, spec: (Math.abs(x) < 3.2 && y > 1.5) ? 0.5 : 0.04, gloss: 30 };
      }
      case 3: return { alb: mix(L('#8a8068'), L('#4a4436'), clamp(n * 1.5 - 0.3)), wrap: 0.3 };
      case 6: return { alb: mix(K.wood, K.woodD, n), spec: 0.2, gloss: 20 };
      case 8: return goldM(x, y, z);
      case 9: return ironM(x, y, z);
      case 10: return glow(HOLY, atk ? 1.6 : 0.8 * (J.glow ?? 1));
    }
    return { alb: mix(L('#9a8a78'), L('#6e6050'), n), sss: 0.4, wrap: 0.3 };
  };
  const r = done(b, mat);
  r.lights = [{ p: add(mo, [0, 3, 0]), c: L('#e8c878'), I: atk ? 5 : 2.2 * (J.glow ?? 1), r0: 30, R: 220, haze: atk ? 0.05 : 0.025, hazeR: atk ? 6 : 4, pad: 4 }];
  if (atk) {
    const zc = [0, 54]; r.fx = [{ k: 'zone', c: zc, r: 18, col: 'holy' }]; r.lights.push({ p: [zc[0], zc[1], 8], c: L('#e8c878'), I: 2.0, r0: 20, R: 80, haze: 0.03, hazeR: 10, noShadow: true });
    r.vfx = motes(zc);
  }
  return r;
}

// ======================= 4. PURIFICATEUR (new) =======================
// pose: 'idle', 'atk' (the jet; 'atk1' another jet), 'tele' (the game's telegraph: the stance, the pilot light flaring, no
// jet yet); over: joints to override, or a function of the joints returning them (the game's sheet, tools/art/foes.gen.mjs,
// poses its frames with it); its `flame` scales the pilot light
export function purificateur(pose = 'idle', over = {}) {
  const fire = pose.startsWith('atk'), tele = pose === 'tele', atk = fire || tele; const J = clone(std); const b = B(); const { rc, el } = b;
  Object.assign(J, {
    head: [0, 7, 84], neck: [0, 4.5, 77], chest: [0, 2.5, 68], pelvis: [0, 0, 50],
    Sr: [-8.5, 2.5, 74], Er: [-10, 8, 60], Wr: [-5, 15, 57], Hr_: [-3.5, 17, 57],
    Sl: [8.5, 2.5, 74], El: [9.5, 3, 59], Wl: [3, 7, 54], Hl_: [1.5, 8, 54],
  }, atk ? { Kl: [4.5, 9, 26], Al: [5, 8, 4], Tl: [5.5, 14, 1.2], Kr: [-4.5, -5, 26], Ar: [-5, -12, 5], Tr: [-5.5, -7, 1.2], Wr: [-3, 18, 63], Hr_: [-2, 20, 64], Wl: [2, 9, 57], Hl_: [1, 10, 57.5] } : {});
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { thin: 1.1, armM: 2, legM: 6 });
  // waxed leather coat to the ankles + shoulder cape
  b.rev(0, 0.5, 11, 72, t => lerp(12.5, 8.2, Math.pow(t, 0.8)), 2, 1.2, 0.85, { fold: [7, 1.0] });
  b.tor([0, 0.5, 52], [0, 0, 1], 9.6, 1.0, 5, 0.3); b.box([0, 9, 52], [1.4, 0.6, 1.3], 9, 0, 0.2);
  for (let i = 0; i < 3; i++) b.box([-7 + i * 2.6, 8.4 - Math.abs(i - 1) * 0.6, 49], [1.0, 0.8, 2.2], 8, 0.2, 0.3); // flasks of oil on the belt
  rc(J.neck, add(J.chest, [0, 0, -3]), 6, 12.5, 2, 1.5);
  // hood + beak + goggles
  const Hd = J.head;
  el(add(Hd, [0, -0.5, 0.8]), [5.0, 5.4, 6.0], 3, 0.8, { pri: 1 });
  const bk0 = add(Hd, [0, 4.2, -0.8]), bk1 = add(Hd, [0, 11, -3.5]), bk2 = add(Hd, [0, 16.5, -8]);
  rc(bk0, bk1, 2.7, 1.5, 4, 0.8); rc(bk1, bk2, 1.5, 0.35, 4, 0.5);
  for (const s of [-1, 1]) { el(add(Hd, [s * 2.1, 4.4, 1.2]), [1.5, 0.9, 1.5], 11, 0.2, { pri: 2 }); b.tor(add(Hd, [s * 2.1, 4.4, 1.2]), [0, 1, 0], 1.6, 0.4, 9); }
  // twin brass tanks on the back, hose to the lance
  for (const s of [-1, 1]) { rc([s * 4.6, -11, 46], [s * 4.6, -11, 74], 4.6, 4.6, 8, 0.4); b.tor([s * 4.6, -11, 66], [0, 0, 1], 4.7, 0.5, 9); el([s * 4.6, -11, 79], [1.2, 1.2, 1.8], 9); }
  rc([-5, -8, 76], [-9, -5, 82], 0.8, 0.8, 9, 0.3);
  const l0 = lp(J.Hl_, J.Hr_, -0.3), dir = nz(sub(J.Hr_, J.Hl_)), l1 = add(J.Hr_, sc(dir, 13));
  rc(l0, l1, 1.3, 1.0, 9); el(add(l1, sc(dir, -1)), [1.6, 1.6, 1.6], 8);
  b.chain([[-6, -9, 52], [-9, -2, 44], [-6, 6, 46], l0], 0.9, 5, 0.4);
  const tip = add(l1, sc(dir, 1.5));
  const fl = J.flame ?? 1;
  if (!fire) el(add(tip, sc(dir, tele ? 2 : 1.2)), (tele ? [1.6, 1.6, 2.4] : [0.9, 0.9, 1.4]).map((v) => v * fl), 10); // pilot flame
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 21);
    switch (m) {
      case 2: { let c = mix(K.leather, K.leatherD, clamp(n * 1.7 - 0.3)); c = mix(c, L('#14100c'), clamp((vn3(x * 0.3, y * 0.3, z * 0.3, 8) - 0.55) * 4) * 0.8); // soot
        if (vn3(x * 0.25, y * 0.25, z * 0.25, 2) > 0.66) c = mix(c, L('#4a3a20'), 0.6); return { alb: c, spec: 0.45, gloss: 45, wrap: 0.2 }; }
      case 3: return { alb: mix(K.leather, K.leatherD, n), spec: 0.4, gloss: 40 };
      case 4: return { alb: mix(L('#6a5a3e'), L('#3a2c1a'), n), spec: 0.5, gloss: 40 }; // beak, stitched leather
      case 5: return { alb: mix(L('#2a2018'), L('#14100c'), n), spec: 0.4, gloss: 50 };
      case 6: return { alb: mix(L('#2a221a'), L('#16120e'), n), spec: 0.2 };
      case 8: return { alb: mix(K.brass, K.brassD, clamp(n * 1.6 - 0.4)), spec: 0.9, gloss: 50 };
      case 9: return ironM(x, y, z);
      case 10: return glow(FIRE, 1);
      case 11: return { alb: [0.05, 0.03, 0.02], emi: [0.7, 0.3, 0.06], spec: 1, gloss: 80, noAO: true };
    }
    return { alb: mix(L('#2a221a'), L('#16120e'), n) };
  };
  const r = done(b, mat);
  r.lights = [{ p: add(tip, sc(dir, 2)), c: L('#e08030'), I: (tele ? 5 : 2.6) * fl, r0: 16, R: 100, pad: 2, haze: 0.04, hazeR: 2 }];
  r.tip = tip;
  if (fire) {
    // fire jet: a cone of noisy emissive blobs
    const v = B(); const R = mulberry32(pose === 'atk1' ? 6 : 5);
    for (let i = 0; i < 34; i++) { const t = i / 33; const c = add(tip, add(sc(dir, 2 + t * 58), [(R() - 0.5) * t * 9, (R() - 0.5) * t * 7, (R() - 0.4) * t * 6 - t * t * 8])); const rr = 0.6 + t * 4.0 * (0.5 + R() * 0.7); v.el(c, [rr, rr, rr * 0.75], 10, 1.6); }
    const vs = partsSdf(v.parts); const fireTip = add(tip, sc(dir, 60));
    r.vfx = { sdf: (x, y, z) => vs(x, y, z) + 1.2 * (vn3(x * 0.35, y * 0.35, z * 0.35, 3) - 0.5), mat: (m, x, y, z) => { const d = Math.hypot(...sub([x, y, z], tip)); const k = clamp(1.3 - d / 70); return glow(mix([0.7, 0.08, 0.02], [2.0, 1.0, 0.32], k * k), 0.3 + 0.6 * vn3(x * 0.4, y * 0.4, z * 0.4, 11)); }, bounds: boundsOf(v.parts, 3), step: 0.7 };
    r.lights = [{ p: add(tip, sc(dir, 18)), c: L('#e88a30'), I: 6, r0: 30, R: 220, pad: 8, haze: 0.005, hazeR: 6 }, { p: add(fireTip, [0, 0, -10]), c: L('#e07028'), I: 3.5, r0: 30, R: 160, pad: 12, haze: 0.004, hazeR: 8 }];
    r.fx = [{ k: 'cone', c: [0, 22], a: Math.PI / 2, half: 0.32, r0: 6, r1: 66, col: 'fire' }];
  }
  return r;
}

// ======================= 5. SONNEUR (new) =======================
// pose: 'idle', 'atk' (the game's tell: the mallet raised, the bell's rim lit), 'strike' (the game's attack: the mallet on
// the rim, the bell ringing); over: joints to override, or a function of the joints returning them (the game's sheet,
// tools/art/foes.gen.mjs, poses its frames with it)
export function sonneur(pose = 'idle', over = {}) {
  const atk = pose === 'atk', strike = pose === 'strike'; const J = clone(std); const b = B(); const { rc, el, tor } = b;
  Object.assign(J, {
    head: [0, 7, 79], neck: [0, 4.5, 73], chest: [0, 2, 63], pelvis: [0, 0, 44],
    Sr: [-11.5, 1.5, 70], Er: [-15, 3, 53], Wr: [-14, 7, 39], Hr_: [-13.5, 8.5, 35.5],
    Sl: [11.5, 1.5, 70], El: [15, 2, 53], Wl: [14, 5, 38], Hl_: [13.5, 6, 34.5],
    Hr: [-5.5, 0, 42], Kr: [-7, 3, 22], Ar: [-6.5, -0.5, 4], Tr: [-7, 6, 1.2], Hl: [5.5, 0, 42], Kl: [7, 3, 22], Al: [6.5, -0.5, 4], Tl: [7, 6, 1.2],
  }, atk ? { Sr: [-11.5, 0, 71], Er: [-18, -2, 84], Wr: [-16, -4, 97], Hr_: [-15, -4.5, 100], head: [-1, 6, 78] }
    : strike ? { Sr: [-11.5, 2, 70], Er: [-19, 4, 63], Wr: [-17.5, 3, 73], Hr_: [-17, 2.5, 76], head: [0.5, 7.5, 78.5] } : {});
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { thin: 1.45, torsoM: 4, pelvisM: 4, legM: 4 });
  el(add(J.chest, [0, 2, -9]), [11, 9.5, 12], 4, 3); // gut
  // head bound with bloody rags over the ears (he is deaf)
  const Hd = J.head; tor(add(Hd, [0, 0.4, 0.2]), [0, 0.2, 1], 4.4, 1.5, 5, 0.6, { pri: 1 });
  for (const s of [-1, 1]) el(add(Hd, [s * 4.6, 0, 0]), [1.8, 2.4, 2.6], 5, 0.6, { pri: 1 });
  // yoke frame on the back, bell above and behind the head
  b.rev(0, 1, 20, 50, t => lerp(13, 11, t), 4, 1.0, 0.8, { fold: [8, 1.0] }); // tunic skirt
  const by = -13, top = 120;
  for (const s of [-1, 1]) { rc([s * 18, by + 3, 40], [s * 18, by, top + 2], 2.2, 1.9, 6, 0); rc(add(J.chest, [s * 7, 6, 8]), [s * 13, by + 2, 66], 1.3, 1.3, 7, 0.4); }
  rc([-20, by, top], [20, by, top], 2.2, 2.2, 6); rc([-18, by + 3, 46], [18, by + 3, 46], 1.8, 1.8, 6);
  const bz1 = top - 3, bz0 = top - 32;
  b.rev(0, by, bz0, bz1, t => { const u = 1 - t; return 7.5 + 5.5 * u * u + 4 * Math.pow(u, 8) + (t > 0.92 ? -45 * (t - 0.92) : 0); }, 8, 0.5);
  tor([0, by, bz0 + 1.2], [0, 0, 1], 15.8, 1.3, 8, 0.6);
  rc([0, by, bz0 + 3], [0, by, bz0 - 4], 1.1, 2.0, 9); // clapper
  // mallet (struck: its head against the rim, on his right)
  const md = strike ? nz(sub([-19.3, by + 5.7, bz0 + 2], J.Hr_)) : atk ? nz([0.3, -0.5, 1]) : [0, 0.25, -1];
  const m1 = add(J.Hr_, sc(md, atk || strike ? 18 : 30)), m0 = add(J.Hr_, sc(md, -4));
  rc(m0, m1, 0.9, 0.9, 6);
  const mx = nz([md[1] || 0.0, -md[0] + 1, 0]);
  rc(add(m1, sc(mx, -5)), add(m1, sc(mx, 5)), 3.4, 3.4, 9, 0.3);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 31);
    switch (m) {
      case 4: return { alb: bloodHem(mix(K.sack, K.sackD, clamp(n * 1.6 - 0.3)), x, y, z, 30, 3), wrap: 0.35 };
      case 5: { const ear = Math.abs(Math.abs(x - Hd[0]) - 4.6) < 2 && Math.abs(z - Hd[2]) < 3; return { alb: mix(mix(L('#a89a7a'), L('#5e5440'), n), S.blood, ear ? 0.85 : clamp(vn3(x, y, z, 4) - 0.55) * 1.4), wrap: 0.3 }; }
      case 6: return { alb: mix(K.wood, K.woodD, n), spec: 0.15 };
      case 7: return { alb: S.leather, spec: 0.2 };
      case 8: { // bronze bell: verdigris runs, rim polished by blows, Order sun cast in relief
        let c = mix(K.bronze, K.verd, clamp(vn3(x * 0.25, y * 0.25, z * 0.12, 5) * 1.8 - 0.75) * 0.7);
        const rim = z < bz0 + 4; if (rim) c = mix(c, K.goldL, 0.45);
        const dz2 = z - (bz0 + 18); if (y > by + 4 && Math.hypot(x, dz2) < 4.5 && (Math.hypot(x, dz2) < 2 || Math.cos(Math.atan2(dz2, x) * 8) > 0.6)) c = K.goldL;
        const hot = (atk || strike) && rim ? glow(HOLY, strike ? 0.9 : 0.45) : null; if (hot) return { ...hot, alb: c, spec: 0.9, gloss: 40 };
        return { alb: c, spec: 0.8, gloss: 35 }; }
      case 9: return ironM(x, y, z);
    }
    let c = skinTex(L('#a07a62'), L('#6a4a3a'), x, y, z, 31); if (vn3(x * 0.4, y * 0.4, z * 0.3, 7) > 0.62) c = mix(c, S.bloodD, 0.5);
    return { alb: c, sss: 0.4, wrap: 0.3, spec: 0.15, gloss: 30 };
  };
  const r = done(b, mat);
  if (atk) {
    r.fx = [{ k: 'ring', c: [0, 0], r: 22, w: 2.4, col: 'holy' }, { k: 'ring', c: [0, 0], r: 40, w: 1.8, col: 'holy', I: 0.65 }, { k: 'ring', c: [0, 0], r: 57, w: 1.4, col: 'holy', I: 0.35 }];
    r.lights = [{ p: [0, by + 16, bz0 + 4], c: L('#e8c878'), I: 2.5, r0: 24, R: 120, haze: 0.05, hazeR: 7, noShadow: true }];
  }
  if (strike) r.lights = [{ p: [0, by + 16, bz0 + 2], c: L('#e8c878'), I: 4.5, r0: 30, R: 160, haze: 0.06, hazeR: 9, noShadow: true }];
  return r;
}

// ======================= 6. SŒUR AVEUGLE (new) =======================
export function soeur(pose = 'idle') {
  const atk = pose === 'atk'; const J = clone(std); const b = B(); const { rc, el, tor } = b;
  Object.assign(J, atk ? {
    head: [0, -1.5, 90.5], neck: [0, -0.5, 82], Sr: [-8, 0, 78], Er: [-10, 4, 90], Wr: [-4, 6, 99], Hr_: [-2, 6.5, 101],
    Sl: [8, 0, 78], El: [10, 4, 90], Wl: [4, 6, 99], Hl_: [2, 6.5, 101],
  } : { head: [0, 2, 89], Sr: [-8, 0, 78], Er: [-8.5, 4, 64], Wr: [-2.5, 9, 66], Hr_: [-1, 10, 67], Sl: [8, 0, 78], El: [8.5, 4, 64], Wl: [2.5, 9, 66], Hl_: [1, 10, 67] });
  humanoid(J, b, { thin: 0.85, armM: 2 });
  b.rev(0, 0, 0.5, 79, t => t < 0.6 ? lerp(13, 7.4, Math.pow(t / 0.6, 0.7)) : lerp(7.4, 6.4, (t - 0.6) / 0.4), 2, 1.5, 0.8, { fold: [11, 1.0] });
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 3.0, 3.4, 2, 1.2); rc(E, lp(E, W, 0.9), 3.4, 4.8, 2, 0.8); }
  const Hd = J.head;
  // white wimple + starched cornette wings
  b.f((x, y, z) => smax(sdEll(x, y, z, Hd[0], Hd[1] - 0.8, Hd[2] + 0.3, 5.2, 5.6, 6.2), -sdEll(x, y, z, Hd[0], Hd[1] + 5.0, Hd[2] - 0.8, 3.1, 3.2, 4.1), 0.6), [Hd[0] - 7, Hd[1] - 7, Hd[2] - 8, Hd[0] + 7, Hd[1] + 7, Hd[2] + 8], 3, 0.8, { pri: 1 });
  rc(add(Hd, [0, 0, -4]), add(J.chest, [0, 1, 4]), 5, 9.5, 3, 1.5, { pri: 1 }); // bib
  for (const s of [-1, 1]) b.f((x, y, z) => { // wing: thin plate, swept up and out
    const px = (x - Hd[0]) * s - 2, pz = z - Hd[2] - 4.5, py = y - Hd[1] + 0.5;
    const a = 0.12, u = px * Math.cos(a) + pz * Math.sin(a), w = -px * Math.sin(a) + pz * Math.cos(a);
    const curl = w - 0.006 * u * u + 0.4 * Math.sin(u * 0.45);
    return sdEll(u, py, curl, 10, 0, 0, 13, 6.2, 0.85) * 0.75;
  }, [Hd[0] - 30, Hd[1] - 9, Hd[2] - 6, Hd[0] + 30, Hd[1] + 9, Hd[2] + 16], 3, 0.8, { pri: 1 });
  // reliquary held in both hands
  const rq = lp(J.Hl_, J.Hr_, 0.5); const rqc = add(rq, [0, 1.5, atk ? 4 : 2.5]);
  b.box(rqc, [2.4, 1.6, 3.2], 8, 0, 0.4); el(add(rqc, [0, 1.5, 0]), [1.3, 0.6, 2], 10, 0, { pri: 2 });
  rc(add(rqc, [0, 0, 3.2]), add(rqc, [0, 0, 6.5]), 0.5, 0.3, 8); rc(add(rqc, [-1.6, 0, 5.2]), add(rqc, [1.6, 0, 5.2]), 0.4, 0.4, 8);
  // rosary
  for (let i = 0; i < 14; i++) { const t = i / 13; el(add(lp([-3, 4, 56], [3, 4, 56], t), [0, 0.5 + 0.3 * Math.sin(t * Math.PI), -6 * Math.sin(t * Math.PI)]), [0.6, 0.6, 0.6], 9); }
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3, 41);
    switch (m) {
      case 2: return { alb: bloodHem(mix(L('#1e1a18'), L('#0e0c0b'), n), x, y, z, 10), wrap: 0.3, spec: 0.1, gloss: 20, rim: 1.1 };
      case 3: { let c = mix(L('#d0c6aa'), L('#8e866e'), clamp(n * 1.5 - 0.35)); return { alb: c, wrap: 0.4, spec: 0.08 }; }
      case 4: { // blindfold, bled through at the eyes; tears of blood run below
        let c = mix(L('#b8ae94'), L('#7a7260'), n); for (const s of [-1, 1]) if (Math.hypot(x - Hd[0] - s * 1.5, z - Hd[2]) < 1.3) c = S.bloodF; return { alb: c, wrap: 0.3 }; }
      case 8: return goldM(x, y, z);
      case 9: return { alb: L('#2a1810'), spec: 0.5, gloss: 50 };
      case 10: return glow(HEAL, atk ? 1.7 : 0.9);
    }
    let c = mix(L('#c8bca4'), L('#8a8070'), n); // waxen face, bound eyes
    if (y > Hd[1] + 1 && Math.abs(z - Hd[2] - 0.3) < 1.1 && Math.abs(x - Hd[0]) < 3.6) { c = mix(L('#e0d6bc'), L('#9a927a'), n); for (const s of [-1, 1]) if (Math.hypot(x - Hd[0] - s * 1.5, z - Hd[2] - 0.2) < 0.9) c = S.bloodF; return { alb: c, wrap: 0.3 }; }
    for (const s of [-1, 1]) if (Math.abs(x - Hd[0] - s * 1.5 - 0.2 * Math.sin(z)) < 0.45 && z < Hd[2] - 0.5 && z > Hd[2] - 5) c = S.bloodF;
    if (atk && Math.hypot(x - Hd[0], z - Hd[2] + 3.6) < 1.3 && y > Hd[1]) c = L('#120204');
    return { alb: c, sss: 0.5, wrap: 0.3 };
  };
  const r = done(b, mat);
  r.lights = [{ p: add(rqc, [0, 4, 0]), c: L('#d8dccc'), I: atk ? 4 : 1.5, r0: 20, R: 140, pad: 3, haze: atk ? 0.06 : 0.03, hazeR: atk ? 7 : 4 }];
  if (atk) r.fx = [{ k: 'ring', c: [0, 0], r: 44, w: 1.6, col: 'heal' }, { k: 'tether', c: [0, 0], to: [[58, 30], [-52, 46]], col: 'heal' }];
  return r;
}

// ======================= 7. PENDU (new, ghoul) =======================
// hangs head-down among the corpses; drops on whoever walks beneath
export function pendu(pose = 'idle', seed = 7) {
  const atk = pose === 'atk'; const b = B(); const { rc, el } = b;
  let J;
  if (!atk) {
    J = { head: [0, 2, 26], neck: [0, 1, 34], chest: [0, 0, 46], pelvis: [0, -1, 64],
      Sr: [-7.5, 0, 40], Er: [-10, 3, 24], Wr: [-8, 5, 9], Hr_: [-7.5, 6, 6], Sl: [7.5, 0, 40], El: [10, 2, 24], Wl: [8, 4, 9], Hl_: [7.5, 5, 6],
      Hr: [-3.4, -1, 66], Kr: [-3.6, -1, 86], Ar: [-1.2, -1, 106], Tr: [-1.2, 4, 108], Hl: [3.4, -1, 66], Kl: [6, 2, 84], Al: [1.2, -1, 106], Tl: [1.2, 4, 108] };
  } else { // pouncing down from the vault: head first, claws forward, one leg still trailing its chain
    J = { head: [0, 19, 50], neck: [0, 13, 52], chest: [0, 4, 53], pelvis: [0, -14, 55],
      Sr: [-7, 8, 54], Er: [-17, 15, 53], Wr: [-25, 24, 47], Hr_: [-26, 26, 45], Sl: [7, 8, 54], El: [17, 15, 54], Wl: [25, 24, 48], Hl_: [26, 26, 46],
      Hr: [-3.4, -15, 55], Kr: [-12, -21, 53], Ar: [-15, -32, 48], Tr: [-16, -34, 46], Hl: [3.4, -15, 55], Kl: [12, -22, 55], Al: [15, -33, 52], Tl: [16, -35, 50] };
  }
  humanoid(J, b, { thin: 0.72 });
  // long dangling claws
  for (const [W, E, s] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, W, sub(W, E), s, 1, 2, 7, 0.9);
  // jaw hanging open, sockets
  const Hd = J.head, dn = atk ? [0, 0.5, -1] : [0, 0.3, 1]; // "down" of the face
  const jaw0 = add(Hd, [0, 2.4, 0]), jaw1 = add(Hd, add(sc(dn, 10), [0, 4.5, 0]));
  for (const s of [-1, 1]) rc(add(jaw0, [s * 2.2, 0, 0]), add(jaw1, [s * 0.8, 0, 0]), 0.8, 0.6, 1, 0.5);
  b.carve(add(Hd, add(sc(dn, 3.6), [0, 4.2, 0])), 1.6, 0.4);
  for (const s of [-1, 1]) b.carve(add(Hd, add(sc(dn, -1.2), [s * 1.5, 4.0, 0])), 0.95, 0.4);
  // chain from the ceiling to the ankles (snapped on the drop)
  const ank = lp(J.Ar, J.Al, 0.5);
  if (!atk) { b.rc(add(ank, [0, 0, 1]), [0, 0, 260], 0.6, 0.6, 9); b.rc([-3, -1, 104], [3, -1, 104], 1.0, 1.0, 9); }
  else { const a2 = J.Al; b.chain([a2, add(a2, [1, -3, 7]), add(a2, [-1, -5, 14]), add(a2, [1, -6, 21]), add(a2, [0, -7, 28])], 0.6, 9); }
  const mat = (m, x, y, z) => {
    if (m === 9) return ironM(x, y, z);
    if (m === 2) return { alb: mix(S.nail, S.blood, 0.4), spec: 0.4, gloss: 40 };
    let c = skinTex(S.ghoul, S.ghoulD, x, y, z, seed);
    c = mix(c, S.ghoulG, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed) - 0.3) * 0.6);
    // blood ran down to the head while it hung, eyes: two faint pinpoints
    const hd = Math.hypot(x - Hd[0], y - Hd[1] - 3, z - Hd[2]); if (hd < 6) c = mix(c, S.blood, clamp((6 - hd) / 3) * 0.85);
    if (!atk && z < 30) c = mix(c, S.bloodD, 0.5);
    for (const s of [-1, 1]) { const e = add(Hd, add(sc(dn, -1.2), [s * 1.5, 3.4, 0])); if (Math.hypot(x - e[0], y - e[1], z - e[2]) < 0.75) return glow([0.9, 0.85, 0.5], 0.7); }
    if (Math.abs(Math.sin(z * 1.4)) > 0.6 && Math.abs(z - J.chest[2]) < 7 && Math.abs(x) > 3) c = mul(c, 0.7);
    return { alb: c, sss: 0.55, wrap: 0.3, spec: 0.12, gloss: 22 };
  };
  const r = done(b, mat, { tallTop: true });
  const sd0 = r.sdf, C0 = J.chest, up = nz(sub(J.neck, J.pelvis)); r.sdf = (x, y, z) => { let d = sd0(x, y, z); const t = (x - C0[0]) * up[0] + (y - C0[1]) * up[1] + (z - C0[2]) * up[2]; if (Math.abs(t) < 9) d += 0.4 * Math.max(0, Math.sin(t * 1.4)); return d; };
  if (atk) r.fx = [{ k: 'drop', c: [0, 12], r: 17, col: 'red' }];
  return r;
}

// ======================= 8. L'AMAS (new, ghouls) =======================
// pose: 'idle', 'atk' (every arm raised: the game's tell); o (the game's sheet, tools/art/foes.gen.mjs; given, every
// frame has the arms of 'atk'): lift (0..1, the arms rising), gait (the crawl's phase, radians: hands and stumps step in
// turn), slam (the arms slapped flat on the floor, flung out), sx / sz (the mass spread or gathered, sunk or drawn up)
export function amas(pose = 'idle', seed = 13, o) {
  const atk = pose === 'atk'; const b = B(); const { rc, el } = b; const R = mulberry32(seed); const j = (k = 1) => (R() - 0.5) * 2 * k;
  const lift = atk ? 1 : o?.lift ?? 0, g = o?.gait, slam = !!o?.slam;
  const walk = (ph, k) => (g === undefined ? [0, 0] : [Math.cos(g + ph), k * Math.max(0, -Math.sin(g + ph))]); // a hand's step: along, lifted
  el([0, 0, 8], [25, 21, 10], 1, 4); el([2, -3, 19], [17, 14, 12], 1, 5); el([-9, 5, 16], [10, 9, 9], 1, 4);
  const heads = [];
  // half-swallowed bodies: chest + shoulders + neck + head, rising out of the mass
  const bodies = [[-14, 10, 12, -0.6, 0.5], [13, 12, 14, 0.6, 0.6], [2, -6, 26, 3.0, 1.1], [-2, 10, 22, 0.05, lift === 1 ? 1.6 : lerp(0.9, 1.6, lift)], [20, -6, 10, 1.6, 0.3], [-19, -7, 14, -2.2, 0.4]];
  for (const [x, y, z, a, up] of bodies) {
    const d = nz([Math.sin(a), Math.cos(a), up]); const c0 = [x, y, z], c1 = add(c0, sc(d, 12));
    rc(c0, c1, 6.5, 5.2, 1, 3); const sv = nz([d[1], -d[0], 0]);
    rc(add(c1, sc(sv, -6.5)), add(c1, sc(sv, 6.5)), 2.8, 2.8, 1, 2); // shoulders
    const nk = add(c1, sc(d, 3)), h = add(nk, add(sc(d, 4), [0, 0, 1.5]));
    rc(nk, h, 2.0, 1.8, 1, 1); el(h, [3.5, 4.0, 4.2], 1, 1); heads.push([h, d]);
    b.carve(add(h, add(sc(d, 3.4), [0, 0, -1.8])), 1.8, 0.5);
    for (const s of [-1, 1]) b.carve(add(h, add(sc(d, 3.0), add(sc(sv, s * 1.4), [0, 0, 1.1]))), 0.9, 0.3);
    rc(add(h, add(sc(d, 1.5), [0, 0, -2.5])), add(h, add(sc(d, 4.5), [0, 0, -6])), 1.0, 0.7, 1, 0.5); // slack jaw
  }
  // arms: spider-like, elbows high, hands splayed on the floor (raised and clawing on the attack, slapped flat on the slam)
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + j(0.25); const u = [Math.cos(a), Math.sin(a) * 0.9, 0]; const len = 0.75 + R() * 0.5;
    const s0 = [u[0] * 16, u[1] * 14, 12 + j(5)];
    const jx = atk || o ? j(2) : 0, jy = atk || o ? j(2) : 0, [f, up] = walk(i * 2.3, 3);
    const eU = add(s0, [u[0] * 9 * len, u[1] * 9 * len, 16 * len]), wU = add(eU, [u[0] * 7 * len + jx, u[1] * 7 * len + jy, 12 * len]);
    let e = slam ? add(s0, [u[0] * 14 * len, u[1] * 14 * len, 4 * len]) : add(s0, [u[0] * 12 * len, u[1] * 12 * len + 2 * f, 9 * len + up * 0.5]);
    let w = slam ? add(e, [u[0] * 13 * len + jx * 0.5, u[1] * 13 * len + jy * 0.5, -e[2] + 1.5]) : add(e, [u[0] * 9 * len, u[1] * 9 * len + 3 * f, -e[2] + 2.2 + up]);
    let dir = [u[0], u[1], slam ? -0.3 : -0.15];
    if (lift === 1) { e = eU; w = wU; dir = sub(w, e); } else if (lift > 0) { dir = lp(dir, nz(sub(wU, eU)), lift); e = lp(e, eU, lift); w = lp(w, wU, lift); }
    rc(s0, e, 2.5, 1.6, 1, 1.4); rc(e, w, 1.6, 1.1, 1, 0.6);
    claws(b, w, dir, 1, 1, 2, 4.2, 0.9);
  }
  for (let i = 0; i < 3; i++) { const a = 0.8 + i * 2.1; const s0 = [Math.cos(a) * 18, Math.sin(a) * 15, 7]; const k = add(s0, [Math.cos(a) * 12, Math.sin(a) * 10, 9]); const [f, up] = walk(1 + i * 2.1, 2.5); rc(s0, k, 3.4, 2.1, 1, 1.5); rc(k, add(k, [Math.cos(a) * 10, Math.sin(a) * 8 + 4 * f, -k[2] + 1.6 + up]), 2.1, 1.3, 1, 0.8); }
  const mat = (m, x, y, z) => {
    if (m === 2) return { alb: mix(S.nail, S.blood, 0.4), spec: 0.4, gloss: 40 };
    const pick = vn3(x * 0.05, y * 0.05, z * 0.05, seed);
    let c = skinTex(pick > 0.5 ? S.ghoul : S.corpse, S.ghoulD, x, y, z, seed);
    c = mix(c, L('#4a4a30'), clamp((fbm3(x * 0.12, y * 0.12, z * 0.12, 3, 4) - 0.52) * 3) * 0.6); // rot
    const seam = Math.abs(vn3(x * 0.14, y * 0.14, z * 0.14, 21) - 0.5); if (seam < 0.014 && z > 4) return { alb: mix(S.muscle, S.bloodF, 0.5), spec: 0.6, gloss: 60, sss: 0.3 }; // where bodies grew together
    for (const [h, d] of heads) { const q = sub([x, y, z], add(h, add(sc(d, 3), [0, 0, -2.5]))); const dd = Math.hypot(...q); if (dd < 5) c = mix(c, dd < 2.2 ? S.bloodD : S.blood, 0.8); }
    if (z < 6) c = mix(c, S.bloodD, clamp((6 - z) / 4) * 0.8);
    return { alb: c, sss: 0.5, wrap: 0.3, spec: 0.2, gloss: 35 };
  };
  const r = done(b, mat, { yawFront: 0.3 });
  const kx = 1.35 * (o?.sx ?? 1), kz = 1.35 * (o?.sz ?? 1), sd = r.sdf, [x0, y0, z0, x1, y1, z1] = r.bounds;
  r.sdf = (x, y, z) => sd(x / kx, y / kx, z / kz) * Math.min(kx, kz); r.mat = (m, x, y, z) => mat(m, x / kx, y / kx, z / kz); r.bounds = [x0 * kx, y0 * kx, z0 * kz, x1 * kx, y1 * kx, z1 * kz];
  r.fx = atk ? [{ k: 'ring', c: [0, 0], r: 64, w: 2, col: 'red' }, { k: 'disc', c: [0, 0], r: 64, col: 'red' }] : [];
  return r;
}

// ======================= 9. INQUISITEUR (lore) =======================
// pose: 'idle', 'atk' (the game's tell: the censer whirled overhead), 'sweep' (the game's attack: the censer swung low
// round his front, from his right to his left), 'parry' (his forearm up before his face); over: joints to override, or a
// function of the joints returning them (the game's sheet, tools/art/foes.gen.mjs, poses its frames with it); its `whirl`
// turns the whirling censer about his hand (radians), `sweep` how far round the swing is (0..1), `glow` scales the embers
export function inquisiteur(pose = 'idle', over = {}) {
  const sweep = pose === 'sweep', atk = pose === 'atk', parry = pose === 'parry'; const J = clone(std); const b = B(); const { rc, el, tor } = b;
  for (const k in J) J[k][2] *= 1.05;
  Object.assign(J, sweep ? {
    chest: [0, 1.5, 74], head: [0, 2.5, 94], Sr: [-8.5, 2, 82], Sl: [8.5, -0.5, 82], El: [11, -2, 68], Wl: [10, 3, 60], Hl_: [9.5, 4, 58],
    Kl: [4.4, 8, 28], Al: [4.6, 7, 4], Tl: [5, 13, 1.2], Kr: [-4.4, -5, 28], Ar: [-4.6, -11, 5], Tr: [-5, -6, 1.2],
  } : parry ? {
    head: [0, 1.5, 94], Sr: [-8.5, 0.5, 82], Er: [-10, 5, 68], Wr: [-6, 10, 66], Hr_: [-5, 11, 65.5], Sl: [8.5, 1, 82], El: [10, 9, 76], Wl: [3, 12, 88], Hl_: [1.5, 12.5, 91],
    Kl: [4.4, 6, 28], Al: [4.6, 5, 4], Tl: [5, 11, 1.2], Kr: [-4.4, -4, 28], Ar: [-4.6, -9, 5], Tr: [-5, -4, 1.2],
  } : atk ? {
    Sr: [-8.5, 0.5, 82], Er: [-15, 0, 92], Wr: [-13, 2, 104], Hr_: [-12, 2.5, 107], Sl: [8.5, 0.5, 82], El: [11, 5, 67], Wl: [7, 12, 62], Hl_: [6, 14, 62],
    Kl: [4.4, 8, 28], Al: [4.6, 7, 4], Tl: [5, 13, 1.2], Kr: [-4.4, -5, 28], Ar: [-4.6, -11, 5], Tr: [-5, -6, 1.2],
  } : { Sr: [-8.5, 0, 82], Er: [-10, 1, 64], Wr: [-11, 3, 50], Hr_: [-11.2, 4, 46.5], Sl: [8.5, 0, 82], El: [9.5, 3, 66], Wl: [5, 10, 62], Hl_: [3.5, 11, 62.5] });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  // The swing: the censer at angle `sa` about him (pi: out to his right, pi/2 ahead, 0 his left), his right arm flung after it.
  const sa = Math.PI * (1 - (J.sweep ?? 0.5)), su = [Math.cos(sa), Math.sin(sa), 0];
  if (sweep) Object.assign(J, { Er: add([-5, 2, 77], sc(su, 8)), Wr: add([-3, 2, 75], sc(su, 15)), Hr_: add([-3, 2, 75], sc(su, 18)) });
  humanoid(J, b, { thin: 0.95, torsoM: 2, armM: 2, legM: 5, shinM: 6, footM: 6 });
  // long coat with flared skirts, white millstone ruff, capotain hat
  b.rev(0, 0, 16, 78, t => t < 0.5 ? lerp(12.5, 9, t / 0.5) : lerp(9, 8.2, (t - 0.5) / 0.5), 2, 1.2, 0.85, { fold: [8, 0.9] });
  const Hd = J.head, nk = add(J.neck, [0, 0.5, 0.5]);
  b.f((x, y, z) => { const px = x - nk[0], py = y - nk[1], pz = z - nk[2]; const q = Math.hypot(px, py); const a = Math.atan2(py, px); return Math.hypot(q - 6.4, pz) - 3.0 - 0.45 * Math.abs(Math.sin(a * 14)); }, [nk[0] - 11, nk[1] - 11, nk[2] - 5, nk[0] + 11, nk[1] + 11, nk[2] + 5], 3, 0.3, { pri: 1 });
  const hc = add(Hd, [0, -0.4, 3.6]);
  b.f((x, y, z) => { const r = Math.hypot(x - hc[0], y - hc[1]); return Math.max(r - 9.6, Math.abs(z - hc[2] + r * 0.03) - 0.45); }, [hc[0] - 11, hc[1] - 11, hc[2] - 2, hc[0] + 11, hc[1] + 11, hc[2] + 2], 4, 0);
  rc(hc, add(hc, [0, -0.5, 13]), 5.0, 3.9, 4, 0.2); tor(add(hc, [0, -0.1, 1.6]), [0, 0, 1], 4.85, 0.65, 8);
  b.box(add(hc, [0, 4.8, 1.6]), [1.2, 0.5, 1.0], 8, 0, 0.2);
  // goatee
  rc(add(Hd, [0, 3.2, -4.6]), add(Hd, [0, 3.6, -7.4]), 1.3, 0.4, 5, 0.4);
  // gold chain + sun pendant on the chest
  for (let i = 0; i < 12; i++) { const t = i / 11; el(add(J.chest, [lerp(-5.5, 5.5, t), 6.4, 9 - 9 * Math.sin(t * Math.PI)]), [0.7, 0.7, 0.7], 8); }
  el(add(J.chest, [0, 7, -1.5]), [2.2, 0.6, 2.2], 8);
  // war censer on a chain: hangs idle, whirls overhead on the attack (turned by `whirl`), swung out level on the sweep
  const hand = J.Hr_, wa = J.whirl ?? 0, turn = (p) => [p[0] * Math.cos(wa) - p[1] * Math.sin(wa), p[0] * Math.sin(wa) + p[1] * Math.cos(wa), p[2]]; let pts;
  if (sweep) pts = [...Array(9)].map((_, i) => add(hand, add(sc(su, i * 3.8), [0, 0, -i * i * 0.1])));
  else if (parry) pts = [...Array(9)].map((_, i) => add(hand, [0.3 * Math.sin(i), 0.5 + i * 0.2, -i * 3.6]));
  else if (!atk) pts = [...Array(9)].map((_, i) => add(hand, [0.4 * Math.sin(i), 0.6 * i * 0.1, -i * 4.2]));
  else pts = [...Array(9)].map((_, i) => { const a = -0.6 + i * 0.32; return add(hand, turn([-Math.cos(a) * i * 3.8 + i * 2.2, -Math.sin(a) * i * 3.8 + i * 1.4, 4 + i * 0.4])); });
  for (let i = 0; i < pts.length - 1; i++) rc(pts[i], pts[i + 1], 0.5, 0.5, 9);
  const cz = pts[pts.length - 1]; el(cz, [3.2, 3.2, 3.8], 9, 0.3); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const u = [Math.cos(a), Math.sin(a), 0]; rc(add(cz, sc(u, 3)), add(cz, sc(u, 5)), 0.5, 0.1, 9); }
  rc(add(cz, [0, 0, 3]), add(cz, [0, 0, 6]), 0.5, 0.2, 9);
  const mat = (m, x, y, z, nx, ny) => {
    const n = fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 51);
    switch (m) {
      case 2: { // black coat, oxblood lining showing at the front opening, gold buttons
        let c = mix(L('#1c1816'), L('#0e0c0a'), n); const front = y > 4 && Math.abs(x) < 1.6 && z > 20;
        if (front) c = K.oxblood; if (y > 4 && Math.abs(x - 2.6) < 0.7 && z > 52 && z < 80 && Math.abs((z % 4) - 2) < 0.8) c = K.goldL;
        return { alb: bloodHem(c, x, y, z, 24), spec: 0.2, gloss: 30, wrap: 0.25, rim: 1.0 }; }
      case 3: { let c = mix(L('#d4caae'), L('#8e866c'), clamp(n * 1.4 - 0.2)); if (vn3(x, y, z, 5) > 0.72) c = mix(c, S.bloodF, 0.7); return { alb: c, wrap: 0.4, spec: 0.05 }; }
      case 4: return { alb: mix(L('#1a1614'), L('#0c0a09'), n), spec: 0.25, gloss: 30, rim: 1.0 };
      case 5: return { alb: mix(L('#8a8478'), L('#4e4a42'), n), wrap: 0.3 };
      case 6: return { alb: mix(L('#1a1410'), L('#0c0907'), n), spec: 0.4, gloss: 40 };
      case 8: return goldM(x, y, z);
      case 9: { const d = Math.hypot(...sub([x, y, z], cz)); if (d < 3.6 && Math.abs(Math.sin(z * 2.2)) > 0.8) return glow(HOLY, 1.1 * (J.glow ?? 1)); return ironM(x, y, z); }
    }
    return { alb: mix(L('#a88e78'), L('#6e5848'), n), sss: 0.4, wrap: 0.3 };
  };
  const r = done(b, mat);
  r.lights = [{ p: add(cz, [0, 3, 2]), c: L('#e0b060'), I: 1.8 * (J.glow ?? 1), r0: 14, R: 100, pad: 5, haze: 0.04, hazeR: 3 }];
  if (sweep) {
    // the swing's trail: embers and smoke the censer leaves round his front, from his right to where it is, brightest behind it
    const R = Math.hypot(cz[0], cz[1]), zc = cz[2], T0 = (a) => clamp(1 - (a - sa) / 2.2);
    const trail = (x, y, z) => { const a = Math.atan2(y, x); if (a < sa - 0.08) return 1e3; return Math.hypot(Math.hypot(x, y) - R, (z - zc) * 1.3) - 0.4 - 2.2 * T0(a) + 1.4 * (vn3(x * 0.4, y * 0.4, z * 0.4, 6) - 0.5); };
    r.vfx = { sdf: trail, mat: (m, x, y, z) => { const k = T0(Math.atan2(y, x)); return glow(mix([0.45, 0.16, 0.05], [1.7, 1.15, 0.5], k * k), 0.2 + 0.8 * k * vn3(x * 0.5, y * 0.5, z * 0.5, 13)); }, bounds: [-R - 6, -6, zc - 7, R + 6, R + 6, zc + 7], step: 0.6 };
    r.lights = [{ p: add(cz, [0, 0, 3]), c: L('#e0a050'), I: 3.5, r0: 20, R: 140, pad: 6, haze: 0.04, hazeR: 4 }];
  }
  if (atk) {
    r.fx = [{ k: 'arc', c: [0, 0], a: Math.PI / 2, half: 1.35, r0: 14, r1: 52, col: 'holy' }];
    // motion smear of the whirling chain (turned with it)
    const v = B(); v.f((x, y, z) => { const px = x - hand[0], py = y - hand[1], pz = z - hand[2] - 6; const q = Math.hypot(px, py); const a = Math.atan2(py, px) - wa; const on = Math.sin(a - 1.2) > -0.35; return on ? Math.hypot(q - 30, pz) - 1.0 : 1e3; }, [hand[0] - 33, hand[1] - 33, hand[2] + 2, hand[0] + 33, hand[1] + 33, hand[2] + 10], 1, 0);
    r.vfx = { sdf: partsSdf(v.parts), mat: (m, x, y, z) => { const a = Math.atan2(y - hand[1], x - hand[0]) - wa; const k = clamp(0.5 + 0.5 * Math.sin(a - 1.2)); return glow([0.9, 0.7, 0.35], 0.15 + 0.6 * k * k); }, bounds: boundsOf(v.parts, 2), step: 0.7 };
  }
  return r;
}

// ======================= 10. BOURREAU, gardien de la crypte (mini-boss) =======================
// pose: 'idle', 'atk' (the axe raised overhead: the game's tell), 'chop' (the game's attack: bent over the blow, the
// blade sunk in the floor ahead of him; it stays there whatever his arms do); over: joints to override, or a function of
// the joints returning them (the game's sheet, tools/art/foes.gen.mjs, poses its frames with it)
export function bourreau(pose = 'idle', over = {}) {
  const atk = pose === 'atk', chop = pose === 'chop'; const b = B(); const { rc, el, tor } = b; const s = 1.5;
  const J = {}; for (const k in std) J[k] = std[k].map(v => v * s);
  Object.assign(J, {
    head: [0, 6, 134], neck: [0, 4, 124], chest: [0, 3, 108], pelvis: [0, 0, 76],
    Hr: [-8, 0, 74], Kr: [-10, 3, 40], Ar: [-10, -1, 7], Tr: [-11, 10, 1.6], Hl: [8, 0, 74], Kl: [10, 3, 40], Al: [10, -1, 7], Tl: [11, 10, 1.6],
  }, atk ? {
    head: [0, 2, 135], neck: [0, 1, 125], chest: [0, -1, 109],
    Sr: [-17, -1, 120], Er: [-16, -6, 140], Wr: [-6, -9, 152], Hr_: [-4, -9.5, 155], Sl: [17, -1, 120], El: [16, -6, 140], Wl: [6, -9, 150], Hl_: [4, -9.5, 153],
  } : chop ? {
    head: [0, 17, 123], neck: [0, 13, 114], chest: [0, 8, 101], pelvis: [0, 0, 73],
    Sr: [-16, 8, 112], Er: [-17, 16, 90], Wr: [-6, 27, 77], Hr_: [-4, 30, 73], Sl: [16, 8, 112], El: [15, 12, 92], Wl: [-2, 21, 85], Hl_: [-4.4, 24, 81.4],
    Hr: [-8, 0, 71], Kr: [-11, -6, 40], Ar: [-11, -14, 7], Tr: [-12, -4, 1.6], Hl: [8, 0, 71], Kl: [11, 12, 39], Al: [11, 9, 7], Tl: [12, 20, 1.6],
  } : {
    Sr: [-17, 2, 118], Er: [-22, 6, 92], Wr: [-18, 14, 74], Hr_: [-17, 16, 70], Sl: [17, 2, 118], El: [21, 4, 92], Wl: [17, 12, 76], Hl_: [15, 15, 74],
  });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { thin: 1.7, pelvisM: 4, legM: 4, shinM: 6, footM: 6 });
  el(add(J.chest, [0, 5, -18]), [17, 15, 18], 1, 5); // belly
  // leather hood: cone, eyeholes
  const Hd = J.head;
  { const hc = add(Hd, [0, -0.8, 1.6]); b.f((x, y, z) => sdEll(x, y, z, hc[0], hc[1], hc[2], 6.3 - Math.max(0, z - hc[2]) * 0.18, 6.9 - Math.max(0, z - hc[2]) * 0.15, 8.6) + 0.45 * (vn3(x * 0.35, y * 0.35, z * 0.25, 17) - 0.5), [hc[0] - 9, hc[1] - 9, hc[2] - 10, hc[0] + 9, hc[1] + 9, hc[2] + 10], 3, 0.8, { pri: 1 }); }
  b.chain([add(Hd, [0, -4, 7.5]), add(Hd, [0.5, -10, 7]), add(Hd, [1.5, -13, 1])], 2.6, 3, 2.0); // limp point of the hood
  for (const [S1, E, W] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl]]) { rc(S1, E, 5.4, 4.2, 1, 2); rc(E, W, 4.2, 3.2, 1, 1.4); el(S1, [6, 6, 5.5], 1, 3); }
  for (const Hh of [J.Hr_, J.Hl_]) el(Hh, [3.2, 3.2, 3.6], 1, 1.2);
  for (const [H1, K1, A1] of [[J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(H1, K1, 7.5, 5.4, 4, 2); rc(K1, add(A1, [0, 0, 8]), 5.4, 4.4, 6, 1.5); }
  b.rcs(add(Hd, [0, 0, -2]), add(J.neck, [0, 0, -6]), 6.8, 13, 3, 1.5, 0.75, { pri: 1 });
  for (const sd of [-1, 1]) b.carve(add(Hd, [sd * 2.3, 6.0, 1.2]), 1.5, 0.3);
  // apron
  b.f((x, y, z) => { const c = J.chest; const yy = y - (c[1] + 14.5 - Math.pow((x / 16), 2) * 3 - Math.max(0, (90 - z) * -0.0)); return Math.max(Math.abs(yy - Math.max(0, (z - 70) * 0.02)) - 0.8, Math.abs(x) - 13 - (100 - z) * 0.04, z - 100, 26 - z + 2 * vn(x * 0.4, 0, 3)); }, [-20, -2, 22, 20, 24, 102], 7, 0.8, { pri: 1 });
  b.tor([0, 1, 82], [0, 0.1, 1], 15.5, 1.4, 6, 0.4);
  // reliquary of the house chief chained at his hip (the thing he guards)
  b.box([-17, 6, 66], [3.2, 2.4, 4.2], 8, 0, 0.5); el([-17, 8.6, 66], [1.6, 0.4, 2.4], 10);
  b.chain([[-14, 5, 82], [-16, 6, 74], [-17, 6, 70.5]], 0.6, 9);
  // headsman's axe
  let h0, h1; if (atk) { h0 = add(J.Hr_, [0, 4, -10]); h1 = add(J.Hr_, [0, -30, 20]); } else if (chop) { h1 = [-1, 70, 16]; h0 = add(J.Hr_, sc(nz(sub(J.Hr_, h1)), 8)); } else { h0 = add(J.Hr_, [1, 2, -12]); h1 = add(J.Hr_, [-13, -8, 86]); }
  rc(h0, h1, 1.9, 1.7, 6);
  const ad = nz(sub(h1, h0)), side = atk ? [0, 0, 1] : chop ? [0, 0, -1] : [-1, 0, 0]; const sv = nz(side.map((v, i) => v - ad[i] * (side[0] * ad[0] + side[1] * ad[1] + side[2] * ad[2])));
  const bc = add(h1, sc(ad, -9));
  const nv = [ad[1] * sv[2] - ad[2] * sv[1], ad[2] * sv[0] - ad[0] * sv[2], ad[0] * sv[1] - ad[1] * sv[0]];
  b.f((x, y, z) => { const q = sub([x, y, z], bc); const u = q[0] * ad[0] + q[1] * ad[1] + q[2] * ad[2], v = q[0] * sv[0] + q[1] * sv[1] + q[2] * sv[2], w = q[0] * nv[0] + q[1] * nv[1] + q[2] * nv[2];
    const hw = 4.5 + 11 * Math.pow(clamp(v / 22), 1.6); let d = Math.max(Math.abs(u) - hw, 1 - v, v - 22 - 3 * (1 - (u / 15) ** 2)) * 0.7; const th = 0.5 + 1.5 * clamp(1 - v / 22); d = Math.max(d, Math.abs(w) - th);
    return Math.min(d, sdRC(x, y, z, add(bc, sc(ad, -8)), add(bc, sc(ad, 8)), 2.4, 2.4)); }, [bc[0] - 28, bc[1] - 28, bc[2] - 28, bc[0] + 28, bc[1] + 28, bc[2] + 28], 9, 0.3);
  const mat = (m, x, y, z) => {
    const n = fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 61);
    switch (m) {
      case 3: { let c = mix(L('#4a1c12'), L('#180a06'), clamp(n * 1.6 - 0.3)); if (Math.abs(Math.sin(x * 0.9 + z * 0.3) * Math.sin(y * 0.8 - z * 0.5)) > 0.9) c = mul(c, 0.6); return { alb: c, spec: 0.04, gloss: 10, rim: 0.3, wrap: 0.3 }; }
      case 4: return { alb: mix(L('#2a2018'), L('#14100c'), n), spec: 0.2 };
      case 6: return { alb: mix(K.woodD, L('#140e08'), n), spec: 0.3, gloss: 30 };
      case 7: { let c = mix(L('#3a2616'), L('#1e140a'), n); c = mix(c, vn3(x * 0.3, y, z * 0.2, 2) > 0.5 ? S.blood : S.bloodD, clamp(vn3(x * 0.2, y * 0.2, z * 0.1, 7) * 2 - 0.6)); return { alb: c, spec: 0.55, gloss: 50 }; }
      case 8: return goldM(x, y, z);
      case 9: { const e = ironM(x, y, z); const q = sub([x, y, z], bc); const edge = q[0] * sv[0] + q[1] * sv[1] + q[2] * sv[2] > 17; if (edge) e.alb = mix(L('#7a7468'), S.blood, clamp(vn3(x, y, z, 3) * 1.6 - 0.4)); e.spec = 0.9; e.gloss = 60; return e; }
      case 10: return glow(HOLY, 0.9);
    }
    let c = skinTex(L('#b08a72'), L('#7a5848'), x, y, z, 61); // sweaty, bloodied flesh
    if (vn3(x * 0.2, y * 0.2, z * 0.1, 8) > 0.55) c = mix(c, S.blood, 0.55);
    return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.3, gloss: 40 };
  };
  const r = done(b, mat, { big: true });
  r.lights = [{ p: [-17, 12, 66], c: L('#e0b060'), I: 1.2, r0: 12, R: 70, pad: 3, haze: 0.03, hazeR: 2 }];
  if (atk) r.fx = [{ k: 'rect', a: [0, 14], b: [0, 118], w: 15, col: 'red', fill: true }];
  if (chop) { const sd = r.sdf; r.sdf = (x, y, z) => Math.max(sd(x, y, z), -z); } // the blade sunk: nothing under the floor
  return r;
}

// falling motes of light over a holy zone (zone centre zc, radius r), as an emissive model
export function motes(zc, r = 16, n = 22) {
  const v = B(); const R = mulberry32(3); for (let i = 0; i < n; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r; v.el([zc[0] + Math.cos(a) * d, zc[1] + Math.sin(a) * d, 4 + R() * 70], [0.55, 0.55, 0.9 + R()], 10); }
  return { sdf: partsSdf(v.parts), mat: (m, x, y, z) => glow(HOLY, 0.7 * clamp(1.2 - z / 80)), bounds: boundsOf(v.parts, 2), step: 0.8 };
}

export const FOES = [
  { id: 1, fn: chien, name: 'Le Chien de chasse', src: 'lore' },
  { id: 2, fn: penitent, name: 'Le Pénitent', src: 'nouveau' },
  { id: 3, fn: purificateur, name: 'Le Purificateur', src: 'nouveau' },
  { id: 4, fn: pretre, name: 'Le Prêtre', src: 'lore' },
  { id: 5, fn: sonneur, name: 'Le Sonneur', src: 'nouveau' },
  { id: 6, fn: soeur, name: 'La Sœur aveugle', src: 'nouveau' },
  { id: 7, fn: pendu, name: 'Le Pendu', src: 'nouveau' },
  { id: 8, fn: inquisiteur, name: 'L’Inquisiteur', src: 'lore' },
  { id: 9, fn: amas, name: 'L’Amas', src: 'nouveau' },
  { id: 10, fn: bourreau, name: 'Le Bourreau', src: 'lore (gardien)' },
];
