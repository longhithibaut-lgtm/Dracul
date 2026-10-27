// La Matrice (the Nourrice des goules, version B; docs/decisions.md 2026-10-28, docs/maquettes/boss-nourrice-B-matrice.png):
// the catacombs' guardian for the game, built from the mockup's own parts (tools/art/maquettes/boss/nourrices.mjs
// matrice(): the Order's wheel, rim bound in iron and spiked, eight spokes; her starved body crucified on it, shackled,
// iron straps; the huge translucent belly-sac, larvae-goules curled inside, lit from within) and rendered like the foes
// (the cold rim from behind, the warm fill, the vampire's lantern off-frame, the sac's own glow). Added for the dark:
// gold seals of the Order on the rim. One model unit is one pixel at 960x540: the game draws her at half
// scale, like every foe. She is seen three-quarters (turned YAW), the wheel's hub on her floor point, its rim's foot on
// the floor; the game hangs her up (her height), mirrors her, draws her chains to the vault and her cords to the goules.
// Frames: hanging, swaying, the larvae turning in the lit sac (idle0-3); the pull-back tell (pull0: drawn back, the sac
// kindling; pull1: back and turned a notch, the sac blazing, her jaw open); the swing (swing0-1, leaning into it); grounded
// at the end of a swing (low); struck (hurt). Phase 2: the sac tearing (tear: split, slime pouring), the wheel spinning
// with the torn sac (spin0-11, a turn in 30° steps), struck (hurt2); her death: the wheel crashing down (fall), fallen on
// its back on the floor (dead).
// Every cell is trimmed to what it covers and packed into src/matrice.png; src/matrice.data.ts gives each its atlas box
// and its place in the logical cell (FW x FH, her floor point on row SOLE, centred), and where the sac and the hub are.
// Usage: node tools/art/matrice.gen.mjs (a minute or two on 4 cores); ONLY=idle0,spin3 renders those to
// shots/matrice-preview.png (x2, on grey) instead, to try a pose.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, project, L, sdEll, clamp, vn3, mix, mul } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { pack } from './bake.mjs';
import { S } from './maquettes/ennemis/cast.mjs';
import { B, done, goldM, claws, HOLY } from './maquettes/ennemis/foes.mjs';
import { add, sub, sc, nz, lp, face, hair, ribbed, skin, common } from './maquettes/boss/nourrices.mjs';

const cam = camera(38 * Math.PI / 180);
const W0 = 300, H0 = 330, SOLE0 = 250; // the render cell, before the crop
const K = 1.4, RW = 52, YAW = 0.32; // her size (the mockup's x 1.4: bigger than him, readable in the dark), the wheel's radius, three-quarters

/** Her on the wheel, the hub at the origin, the wheel in the x-z plane facing +y (the camera). q: glow (the sac's light),
 *  torn (phase 2: the sac split, empty, slime), jaw, larvae (their turn, so they writhe), sag (the sac slumped). */
function wheel(q = {}) {
  const b = B(); const { rc, el, tor } = b;
  const W = (u, v, w = 0) => [u, w, v]; // wheel plane -> model
  const wax = [0, 1, 0];
  tor(W(0, 0, -2), wax, RW, 3.4, 6); tor(W(0, 0, -2), wax, RW + 2.6, 1.1, 9);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; rc(W(Math.cos(a) * (RW + 3), Math.sin(a) * (RW + 3), -2), W(Math.cos(a) * (RW + 10), Math.sin(a) * (RW + 10), -2), 1.1, 0.1, 9); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; rc(W(0, 0, -3), W(Math.cos(a) * RW, Math.sin(a) * RW, -3), 1.8, 1.6, 6); }
  el(W(0, 0, -4), [7, 7, 7], 9); rc(W(0, 0, -10), W(0, 0, 4), 2.4, 2.4, 9);
  // the Order's seals: small gold plaques nailed on the rim between her limbs, glinting
  const seals = [0.78, 2.36, 3.93, 5.5].map((a) => W(Math.cos(a) * RW, Math.sin(a) * RW, 3.2));
  for (const p of seals) { el(p, [3, 1.3, 3], 8, 0.4); el(add(p, [0, 1, 0]), [0.9, 0.7, 0.9], 9); }
  // her body spread on the wheel (a cross), wrists and ankles shackled to the rim
  const J = { head: W(0, 44, 6), neck: W(0, 35, 5), chest: W(0, 22, 6), pel: W(0, -8, 5), Sr: W(-11, 30, 5), Sl: W(11, 30, 5), Er: W(-28, 37, 5), El: W(28, 37, 5), Wr: W(-42, 31, 4), Wl: W(42, 31, 4), Hr: W(-7, -10, 5), Hl: W(7, -10, 5), Kr: W(-16, -30, 6), Kl: W(16, -30, 6), Ar: W(-26, -45, 4), Al: W(26, -45, 4) };
  rc(J.pel, J.chest, 6, 9, 1, 3); el(J.chest, [9, 7, 9], 1, 3); rc(J.chest, J.neck, 7, 3.4, 1, 2); rc(J.Sr, J.Sl, 3.6, 3.6, 1, 3); el(J.pel, [8, 6, 6], 1, 3);
  for (const [a1, a2, a3] of [[J.Sr, J.Er, J.Wr], [J.Sl, J.El, J.Wl], [J.Hr, J.Kr, J.Ar], [J.Hl, J.Kl, J.Al]]) { rc(a1, a2, 3.4, 2.4, 1, 1.5); rc(a2, a3, 2.4, 1.6, 1, 1); el(a2, [2.8, 2.8, 2.8], 1, 1); tor(a3, nz(sub(a3, a2)), 2.8, 1.0, 9); }
  for (const [w, e, sd] of [[J.Wr, J.Er, -1], [J.Wl, J.El, 1]]) claws(b, w, sub(w, e), sd, 1, 2, 6, 1);
  const jaw = q.jaw ?? 3;
  const hp = face(b, J.head, nz(sub(W(0, 44, 30), J.head)), nz(sub(W(0, 60, 6), J.head)), 1, jaw);
  hair(b, hp, 34, 11, 41);
  rc(W(-RW * 0.7, 30, 2), W(RW * 0.7, 30, 2), 1.0, 1.0, 9); rc(W(-RW * 0.9, -8, 2), W(RW * 0.9, -8, 2), 1.0, 1.0, 9); // iron straps across chest and hips
  // the sac: a swollen, translucent belly over her legs; larvae-goules curled inside. Torn: a shell split open at its
  // front, flaps hanging, slime pouring from it.
  const sag = q.sag ?? 0, sacC = add(W(0, -6 - sag * 4, 24), [0, 0, 0]), sacR = [24, 22 * (1 - sag * 0.15), 27 * (1 - sag * 0.1)];
  const sacD = (x, y, z) => sdEll(x, y, z, sacC[0], sacC[1], sacC[2], sacR[0], sacR[1], sacR[2]) + 0.8 * (vn3(x * 0.2, y * 0.2, z * 0.2, 9) - 0.5);
  const slit = (x, y, z) => sdEll(x, y, z, sacC[0] + 2, sacC[1] + sacR[1], sacC[2] - 4, 16, 18, 22) + 2.5 * (vn3(x * 0.3, y * 0.3, z * 0.3, 4) - 0.5);
  const box = [sacC[0] - 27, sacC[1] - 25, sacC[2] - 30, sacC[0] + 27, sacC[1] + 25, sacC[2] + 30];
  if (q.torn) {
    b.f((x, y, z) => Math.max(Math.abs(sacD(x, y, z)) - 1.3, -slit(x, y, z)), box, 20, 3);
    for (const [u, len, s] of [[-9, 14, 1], [-2, 20, 2], [7, 12, 3], [12, 17, 4]]) { // flaps of the torn skin, strands of slime
      const top = add(sacC, [u, sacR[1] - 4, -18 + Math.abs(u) * 0.3]);
      rc(top, add(top, [s % 2 ? 1.5 : -1.5, 4, -len]), s === 2 ? 0.7 : 1.6, s === 2 ? 0.4 : 0.6, s === 2 ? 21 : 20, 1);
    }
    for (const u of [-5, 4]) { const t = add(sacC, [u, sacR[1] - 2, -24]); el(add(t, [0, 1, -6]), [1.0, 1.0, 1.6], 21, 0.5); rc(t, add(t, [0, 1, -6]), 0.5, 0.8, 21, 0.4); }
  } else b.f(sacD, box, 20, 5);
  const turn = q.larvae ?? 0;
  const larvae = (q.torn ? [[-4, -14, 3.6]] : [[-9, 12, 0.6], [8, 4, 2.4], [-4, -14, 3.6], [10, -16, 1.2], [0, 20, 5.0]]).map(([u, v, a], i) => {
    const c = add(sacC, [u + Math.sin(turn + i) * 1.5, 8, v + Math.cos(turn * 1.3 + i) * 1.5]), a2 = a + Math.sin(turn + i * 2) * 0.5;
    return [c, add(c, [Math.cos(a2) * 13, 0, Math.sin(a2) * 13]), add(c, [Math.cos(a2 + 1.6) * 7, 0, Math.sin(a2 + 1.6) * 7])];
  });
  const glowK = q.glow ?? 0.16;
  const mat = (m, x, y, z) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 6) return { alb: mix(L('#3e2c1c'), L('#1e140c'), vn3(x * 0.3, y * 0.3, z * 0.3, 2)), spec: 0.2, gloss: 20 };
    if (m === 8) { const g = goldM(x, y, z); g.emi = sc(HOLY, 0.03 + glowK * 0.06); return g; }
    if (m === 21) return { alb: L('#8a8a50'), emi: [0.12 * glowK, 0.12 * glowK, 0.03 * glowK], sss: 0.9, spec: 0.9, gloss: 80, wrap: 0.5 }; // slime
    if (m === 20) { // the sac: stretched skin, veins, the brood showing through as shadows against its inner glow
      let c = mix(L('#a8907a'), L('#5e4440'), vn3(x * 0.15, y * 0.15, z * 0.15, 6)), shade = 0;
      if (q.torn && sacD(x, y, z) < -0.6) { // inside the torn sac: raw, wet, dark
        const e = glowK * 0.08;
        return { alb: mul(mix(L('#3a0c14'), L('#140406'), vn3(x * 0.3, y * 0.3, z * 0.3, 8)), 0.5), emi: [0.6 * e, 0.12 * e, 0.06 * e], spec: 0.8, gloss: 60 };
      }
      for (const [p0, p1, p2] of larvae) for (const [a, e, r0] of [[p0, p1, 5], [p0, p2, 3.5]]) { const t = clamp(((x - a[0]) * (e[0] - a[0]) + (z - a[2]) * (e[2] - a[2])) / ((e[0] - a[0]) ** 2 + (e[2] - a[2]) ** 2)); const qq = lp(a, e, t); const d = Math.hypot(x - qq[0], z - qq[2]) - r0 * (1 - 0.6 * t); shade = Math.max(shade, clamp(1 - d / 1.2)); }
      if (Math.abs(vn3(x * 0.3, y * 0.3, z * 0.3, 21) - 0.5) < 0.03) c = mix(c, L('#5a2a3a'), 0.8);
      if (q.torn) c = mix(c, S.bloodD, clamp(vn3(x * 0.2, y * 0.2, z * 0.2, 7) * 1.4 - 0.4)); // torn: bloodied
      const e = glowK * (1 - shade * 0.95) * (0.6 + 0.4 * vn3(x * 0.1, y * 0.1, z * 0.1, 3)) * (q.torn ? 0.5 : 1);
      return { alb: mul(c, 1 - shade * 0.8), emi: [0.5 * e, 0.42 * e, 0.12 * e], sss: 0.9, wrap: 0.5, spec: 0.7, gloss: 70, noAO: true };
    }
    let c = skin(L('#9c9280'), L('#5a5244'), x, y, z, 13);
    if (Math.hypot(...sub([x, y, z], hp(0, 6, -6))) < 8) c = mix(c, S.blood, 0.6);
    if (z < J.pel[2] && Math.abs(x) < 30) c = mix(c, S.bloodD, clamp(vn3(x * 0.3, y, z * 0.2, 5) * 1.5 - 0.5)); // what ran down from the sac
    if (q.torn && sacD(x, y, z) < 0) c = mul(mix(c, S.bloodD, 0.85), 0.5); // what the torn sac shows of her: raw, wet
    return { alb: c, sss: 0.45, wrap: 0.3, spec: 0.25, gloss: 35 };
  };
  const body = ribbed(done(b, mat, { size: 1.9 }), J.chest, nz(sub(J.neck, J.pel)), 9);
  return { body, sac: add(sacC, [0, 8, 0]), hub: W(0, 0, 0), glow: glowK };
}

// ---------- posing: spun on its hub, turned three-quarters, leaning as it swings, grown, hung on its floor point ----------
const mm = (A, C) => A.map((r) => [0, 1, 2].map((j) => r[0] * C[0][j] + r[1] * C[1][j] + r[2] * C[2][j]));
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
/** The model turned by M (about the hub), grown K, its hub at `pos`; at(p): a model point to the world. */
function xform(m, M, pos) {
  const at = (p) => [0, 1, 2].map((i) => pos[i] + K * (M[i][0] * p[0] + M[i][1] * p[1] + M[i][2] * p[2]));
  const toL = (x, y, z) => { const d = [(x - pos[0]) / K, (y - pos[1]) / K, (z - pos[2]) / K]; return [0, 1, 2].map((j) => M[0][j] * d[0] + M[1][j] * d[1] + M[2][j] * d[2]); };
  const [a0, b0, c0, a1, b1, c1] = m.bounds, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const X of [a0, a1]) for (const Y of [b0, b1]) for (const Z of [c0, c1]) { const w = at([X, Y, Z]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); } }
  return { model: { sdf: (x, y, z) => { const p = toL(x, y, z); return m.sdf(p[0], p[1], p[2]) * K; }, mat: (i, x, y, z, ...n) => { const p = toL(x, y, z); return m.mat(i, p[0], p[1], p[2], ...n); }, bounds: [...mn, ...mx], step: 0.6 }, at };
}
const D = Math.PI / 180;
/** A frame: spin (the wheel turned on its hub), lean (the swing: the whole tipped sideways), lay (fallen back on the floor). */
function pose(q) {
  const w = wheel(q), M = mm(Rx(-(q.lay ?? 0)), mm(Ry(q.lean ?? 0), mm(Rz(YAW), Ry(q.spin ?? 0)))); // spin about the wheel's axis (model y)
  const hubZ = q.lay ? 12 : (RW + 1) * K;
  return { ...xform(w.body, M, [0, q.lay ? -10 : 0, hubZ]), sac: w.sac, hub: w.hub, glow: w.glow };
}
const FR = {
  ...Object.fromEntries([0, 1, 2, 3].map((k) => [`idle${k}`, { lean: [0, 2, 0, -2][k] * D, glow: 0.18 + 0.05 * [0, 1, 2, 1][k], larvae: k * 1.6 }])),
  pull0: { lean: -7 * D, spin: -6 * D, glow: 0.5, jaw: 6, larvae: 1 },
  pull1: { lean: -13 * D, spin: -18 * D, glow: 0.95, jaw: 10, larvae: 2.5 },
  swing0: { lean: 10 * D, glow: 0.6, jaw: 10, larvae: 3 },
  swing1: { lean: 22 * D, glow: 0.45, jaw: 8, larvae: 4 },
  low: { lean: 4 * D, glow: 0.22, jaw: 5, sag: 1, larvae: 5 },
  hurt: { lean: -3 * D, spin: 4 * D, glow: 0.6, jaw: 12, larvae: 6 },
  tear: { lean: 3 * D, glow: 1.0, jaw: 12, torn: true },
  ...Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`spin${k}`, { spin: k * 30 * D, glow: 0.4, jaw: 8, torn: true }])),
  hurt2: { spin: 8 * D, glow: 0.7, jaw: 12, torn: true },
  fall: { lean: 34 * D, spin: 20 * D, glow: 0.3, jaw: 12, torn: true, sag: 1 },
  dead: { lay: 78 * D, spin: 12 * D, glow: 0.08, jaw: 12, torn: true, sag: 1 },
};
const ONLY = process.env.ONLY?.split(',');
const JOBS = Object.keys(FR).filter((n) => !ONLY || ONLY.includes(n));

function shoot(name) {
  const q = FR[name], p = pose(q), X = { x: W0 / 2, y: 0 }, shift = (v) => [X.x + v[0], X.y + v[1], v[2]];
  const sac = shift(p.at(p.sac)), hub = shift(p.at(p.hub));
  const objects = [{ name: 'foe', pos: [X.x, X.y, 0], yaw: 0, ...p.model, id: 1 }];
  const lights = [
    { p: [X.x + 30, X.y - 70, 140], c: L('#8098a2'), I: 9, r0: 120, R: 360, soft: 10 }, // the cold rim from behind
    { p: [X.x - 70, X.y + 80, 190], c: L('#a08a70'), I: 0.9, r0: 160, R: 480, soft: 12 },
    { p: [X.x + 28, X.y + 70, 80], c: L('#b8a68a'), I: 2.4, r0: 50, R: 240, soft: 6 }, // the vampire's lantern, off-frame
    { p: sac, c: L('#c8cc70'), I: (0.6 + p.glow * 6) * (q.torn ? 0.45 : 1), r0: 12 + p.glow * 18, R: 90 + p.glow * 140, pad: 3, soft: 5, haze: 0.01 + p.glow * 0.03, hazeR: 2 + p.glow * 3 }, // the sac lit from within
  ];
  const sc_ = { W: W0, H: H0, cam, off: -SOLE0, objects, lights, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6) };
  const img = render(sc_);
  haze(img, sc_);
  const px = post(img, { exposure: 3.3, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
  return { name, px, oid: img.oid, sac: project(cam, ...sac, -SOLE0), hub: project(cam, ...hub, -SOLE0) };
}

if (isMainThread) {
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const all = (await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N, jobs: JOBS } });
    wk.on('message', res);
    wk.on('error', rej);
  })))).flat();
  const cells = all.map((r) => { const px = new Uint8ClampedArray(r.px); for (let p = 0; p < W0 * H0; p++) px[p * 4 + 3] = r.oid[p] >= 0 ? 255 : 0; return { ...r, px }; });
  // The logical cell: what every frame covers, centred on her floor point (so mirroring keeps it in place).
  let x0 = W0, y0 = H0, x1 = 0, y1 = 0;
  for (const c of cells) for (let p = 0; p < W0 * H0; p++) if (c.px[p * 4 + 3]) {
    const x = p % W0, y = (p - x) / W0;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  const half = Math.max(W0 / 2 - x0, x1 + 1 - W0 / 2) + 1, FW = 2 * half, top = y0 - 1, FH = y1 - top + 2, left = W0 / 2 - half;
  const list = [];
  for (const c of cells) {
    let a = W0, b = H0, e = -1, f = -1;
    for (let p = 0; p < W0 * H0; p++) if (c.px[p * 4 + 3]) { const x = p % W0, y = (p - x) / W0; a = Math.min(a, x); b = Math.min(b, y); e = Math.max(e, x); f = Math.max(f, y); }
    const w = e - a + 1, h = f - b + 1, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(c.px.subarray(((b + y) * W0 + a) * 4, ((b + y) * W0 + a + w) * 4), y * w * 4);
    const cell = (v) => [Math.round(v[0] - left), Math.round(v[1] - top)];
    list.push({ name: c.name, x0: a - left, y0: b - top, x1: a - left + w - 1, y1: b - top + h - 1, rgba, sac: cell(c.sac), hub: cell(c.hub) });
  }
  if (ONLY) { // each frame's logical cell side by side on grey
    const PW = FW * cells.length, prev = new Uint8ClampedArray(PW * FH * 4);
    for (let p = 0; p < PW * FH; p++) prev.set([70, 70, 74, 255], p * 4);
    cells.forEach((c, i) => { for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const sx = left + x, sy = top + y, q = (sy * W0 + sx) * 4;
      if (sx >= 0 && sx < W0 && sy >= 0 && sy < H0 && c.px[q + 3]) prev.set(c.px.subarray(q, q + 4), (y * PW + i * FW + x) * 4);
    } });
    mkdirSync('shots', { recursive: true });
    writePNG('shots/matrice-preview.png', prev, PW, FH, 2);
    console.log(cells.map((c) => c.name).join(' '));
  } else {
    const { atlas, AW, AH } = pack(list, null, 0, 2048);
    writePNG('src/matrice.png', atlas, AW, AH);
    const FRAMES = Object.fromEntries(list.map((g) => [g.name, [g.ax, g.ay, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1, g.x0, g.y0]]));
    const SPOTS = Object.fromEntries(list.map((g) => [g.name, [...g.sac, ...g.hub]]));
    writeFileSync('src/matrice.data.ts', `// Generated by tools/art/matrice.gen.mjs: edit her poses there (her parts in tools/art/maquettes/boss/nourrices.mjs), not this table.
// La Matrice's sheet (src/matrice.png): each frame trimmed and packed, [atlas x, y, w, h, x, y in its logical cell]; the
// logical cell is FW x FH, her floor point (under the wheel's hub, its rim's foot on the floor) on row SOLE, centred; the
// game mirrors it. SPOTS: in each frame, where the sac's heart and the hub are (cell px: sac x, y, hub x, y).
export const FW = ${FW}, FH = ${FH}, SOLE = ${SOLE0 - top};
export const FRAMES: Record<string, [number, number, number, number, number, number]> = ${JSON.stringify(FRAMES)};
export const SPOTS: Record<string, [number, number, number, number]> = ${JSON.stringify(SPOTS)};
`);
    console.log(`${cells.length} cells in ${FW}x${FH}, atlas ${AW}x${AH}`);
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N, jobs } = workerData, res = [];
  for (let i = w; i < jobs.length; i += N) res.push(shoot(jobs[i]));
  parentPort.postMessage(res);
}
