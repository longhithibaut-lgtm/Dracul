// La Nourrice des goules, « l'Araignée » (docs/decisions.md 2026-10-27, docs/maquettes/boss-nourrice-A-araignee.png): the
// catacombs' guardian for the game, posed from the mockup's own parts (tools/art/maquettes/boss/nourrices.mjs: her skin,
// face, hair, the Order's collar, shackles and broken leashes, the gold seal on her back, her spurred joints, the goules
// clinging to her) and rendered like the foes (tools/art/foes.gen.mjs: the cold rim from behind, the warm fill, the
// vampire's lantern off-frame, her seal's own gold glow; snapped onto their palette). One model unit is one pixel at
// 960x540: the game draws her at half scale, like every foe.
// Three views (facing right, down, up: the game mirrors the right for the left), each: perched breathing (idle0-3), her
// long stride (walk0-5), the drop's wind-up (tele0: the body sinks, the fore-limbs rise; tele1: reared, claws open high,
// head swung up, jaw unhinged), the leap, the slam (sunk, fore-claws driven into the floor), pulling herself up (rise0-1),
// the rake's wind-up (a fore-limb drawn back and up) and the rake (swept across her front, low), struck (hurt). On the
// wall and the vault (phase 2), one view (her back to the camera, head down, limbs splayed: the game mirrors it as she
// crawls either way): crawling (wall0-3), and her fore-limb raised back with a lump of bone to hurl (hurl). Her corpse,
// legs curled.
// The goules clinging to her are separate layers (cells `<frame>-g<k>`, k 0-2: on her hind limb, under her belly, on a
// fore-limb), cut from a render with them (so limbs hide them where they should), over a render of her without them: the
// game drops them one by one as she is struck hard.
// Every cell is trimmed to what it covers and packed into src/nourrice.png; src/nourrice.data.ts gives each its atlas box
// and its place in the logical cell (FW x FH, her floor point on row SOLE, centred), and where her seal shines.
// Usage: node tools/art/nourrice.gen.mjs (a few minutes on 4 cores); ONLY=side-idle0,wall-wall0 renders those to
// shots/nourrice-preview.png (x2, on grey) instead, to try a pose.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, project, L, lerp } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { pack } from './bake.mjs';
import { ghoul } from './maquettes/ennemis/cast.mjs';
import { B, done, goldM, claws, HOLY } from './maquettes/ennemis/foes.mjs';
import { chainLinks } from './maquettes/boss/bosses.mjs';
import { add, sub, sc, nz, lp, crs, placed, cling, face, hair, ribbed, skin, common } from './maquettes/boss/nourrices.mjs';
import { clamp, vn3, mix } from './maquettes/ennemis/lib.mjs';
import { S } from './maquettes/ennemis/cast.mjs';

const cam = camera(38 * Math.PI / 180);
const W0 = 340, H0 = 420, SOLE0 = 300; // the render cell, before the crop
const VIEWS = { side: -Math.PI / 2, down: 0, up: Math.PI }; // yaw: the model looks down +y
const GOULES = 3;

// ---------- her limbs ----------
// A limb from its root on her body to its foot (a floor point, z its lift), along the mockup's profile: up to a high
// knuckle, out, and down to the claws; its five segments' joints at these fractions of the way out, at these heights.
const FR = [0, 0.2, 0.425, 0.7, 0.875, 1];
const leg = (root, foot) => FR.map((f, i) => [lerp(root[0], foot[0], f), lerp(root[1], foot[1], f), [root[2], root[2] + 26, root[2] + 54, root[2] + 22, foot[2] + 52, foot[2] + 6][i]]);
// Their roots on the body (shoulders C, haunches P), and the way each reaches out at rest: fore-limbs ahead, hind behind.
const roots = (P, C) => [add(C, [12, 2, 0]), add(C, [-12, 2, 0]), add(P, [9, -2, -2]), add(P, [-9, -2, -2])];
const SX = [1, -1, 1, -1], FRONT = [true, true, false, false];
const out = (i) => { const a = FRONT[i] ? 0.62 : 2.45; return [SX[i] * Math.sin(a), Math.cos(a), 0]; };
/** Limb i's foot at rest, `reach` out from its root, shifted `dy` along her length, lifted `lift`. */
const foot = (r, i, reach = 80, dy = 0, lift = 0) => { const d = out(i); return [r[0] + d[0] * reach, r[1] + d[1] * reach + dy, lift]; };

/** Her, posed by `q`: P, C her haunches and shoulders; limbs(rs): the four limbs' joints from their roots (else at
 *  rest); clawDir, clawLen per limb; head 'hang' (upside down under her shoulders) or 'up' (swung up), jaw open; rock:
 *  a lump of bone held at limb 0's claws; seal: her seal's glow. Returns { body, goules }: the goules' models apart. */
function spider(q = {}) {
  const b = B(); const { rc, el, tor } = b;
  const P = q.P ?? [0, -22, 104], C = q.C ?? [0, 16, 112], ax = nz(sub(C, P)), up = nz(crs(ax, [-1, 0, 0])), dn = sc(up, -1);
  rc(P, C, 9, 12, 1, 4); el(lp(P, C, 0.68), [14, 15, 11], 1, 4); el(add(lp(P, C, 0.3), sc(dn, 6)), [9, 11, 8], 1, 3); el(P, [11, 10, 8], 1, 3);
  for (let i = 0; i <= 14; i++) { const p = add(lp(sub(P, sc(ax, 4)), add(C, sc(ax, 6)), i / 14), sc(up, 7.5 - Math.abs(i - 7) * 0.12)); el(p, [1.7, 1.6, 1.6], 1, 0.8); rc(p, add(p, sc(up, 3 + (i & 1) * 2)), 1.0, 0.2, 1, 0.4); } // spine, spurs
  rc(add(C, [-13, 0, 0]), add(C, [13, 0, 0]), 4, 4, 1, 4);
  const rs = roots(P, C), limbs = q.limbs?.(rs) ?? rs.map((r, i) => leg(r, foot(r, i)));
  limbs.forEach((pts, li) => {
    const d = out(li);
    for (let i = 0; i < pts.length - 1; i++) { const r0 = lerp(5, 2.2, i / (pts.length - 1)), r1 = lerp(5, 2.2, (i + 1) / (pts.length - 1)); rc(pts[i], pts[i + 1], r0, r1 * 0.85, 1, 1.2); if (i) { el(pts[i], [r0 * 1.35, r0 * 1.35, r0 * 1.35], 1, 1); rc(pts[i], add(pts[i], [d[0] * 2, d[1] * 2, 5 + r0]), r0 * 0.4, 0.15, 1, 0.5); } }
    const tip = pts[pts.length - 1];
    claws(b, tip, q.clawDir?.[li] ?? [d[0] * 0.6, d[1] * 0.6, -1], SX[li], 1, 2, q.clawLen?.[li] ?? 10, 1.2);
  });
  if (q.rock) el(q.rock, [6, 5.5, 5], 14, 2); // a lump of bones and earth torn from the wall
  // the head: hanging upside down under the shoulders, or swung up and screaming
  const nb = add(C, [0, 9, -2]), hup = q.head === 'up';
  const H = hup ? add(C, [0, 26, 8]) : add(C, [0, 20, -26]), F = hup ? nz([0, 1, 0.35]) : [0, 1, 0], U = hup ? nz([0, -0.35, 1]) : [0, 0, -1];
  rc(nb, lp(nb, H, 0.5), 3.6, 3.2, 1, 2); rc(lp(nb, H, 0.5), H, 3.2, 3, 1, 2);
  const hp = face(b, H, F, U, 1.15, q.jaw ?? 4);
  hair(b, hp, hup ? 26 : Math.min(q.hairLen ?? 99, Math.max(10, H[2] - 4)), 19, 23, 1.5);
  // the Order's iron: a collar and wrist shackles, each with a broken leash swinging
  tor(lp(nb, H, 0.2), nz(sub(H, nb)), 5.2, 1.3, 9);
  chainLinks(b, add(lp(nb, H, 0.2), [0, 0, -5]), add(lp(nb, H, 0.2), [4, -6, -Math.min(50, Math.max(8, H[2] - 6))]), 0, 1.0, 9, 3.4);
  for (const pts of limbs) { const w = lp(pts[pts.length - 2], pts[pts.length - 1], 0.4); const sd = nz(sub(pts[pts.length - 1], pts[pts.length - 2])); tor(w, sd, 3.4, 0.9, 9); chainLinks(b, w, add(w, [2, -3, -Math.max(4, Math.min(30, w[2] - 4))]), 0, 0.8, 9, 3); }
  const seal = add(lp(P, C, 0.75), sc(up, 10)); el(seal, [3.4, 3.4, 1.4], 8, 0.4); b.box(add(seal, [0, -5, -1]), [1.2, 4, 0.25], 14, 0, 0.1);
  const glowK = q.seal ?? 0.15;
  const mat = (m, x, y, z) => {
    const c0 = common(m, x, y, z); if (c0) return c0;
    if (m === 8) { const g = goldM(x, y, z); g.emi = sc(HOLY, glowK); return g; }
    let c = skin(L('#7e7470'), L('#3a3234'), x, y, z, 31); // bruised, ash-grey, stretched over bone
    c = mix(c, L('#4a3a48'), clamp(vn3(x * 0.07, y * 0.07, z * 0.07, 4) - 0.4) * 0.8);
    if (vn3(x * 0.3, y * 0.3, z * 0.3, 8) > 0.74) c = mix(c, S.bloodF, 0.7); // weeping sores
    const md = Math.hypot(...sub([x, y, z], hp(0, 6, -6))); if (md < 9) c = mix(c, S.blood, clamp((9 - md) / 4) * (0.5 + 0.5 * vn3(x, y, z, 4)));
    if (Math.hypot(...sub([x, y, z], seal)) < 6.5) c = mix(c, L('#1a0c08'), 0.85);
    return { alb: c, sss: 0.35, wrap: 0.3, spec: 0.25, gloss: 35 };
  };
  const body = ribbed(done(b, mat, { size: 1.9 }), lp(P, C, 0.68), ax, 11);
  body.lights = [{ p: add(seal, sc(up, 5)), c: L('#e8c070'), I: 0.7 + glowK * 5, r0: 12, R: 70, pad: 3, haze: 0.02, hazeR: 2 }];
  // the goules: one climbing a hind limb, one hanging under her belly, one on a fore-limb
  const [fl, , bl] = [limbs[0], limbs[1], limbs[3]];
  const goules = [cling('g0', bl[1], bl[2], 0.5, 3.5, 0, 3, 0.8), cling('g1', add(P, [0, 0, -8]), add(C, [0, 0, -8]), 0.35, 8, 0, 5, 0.8, true), cling('g2', fl[2], fl[3], 0.45, 3, 0, 7, 0.75)];
  return { body, goules, seal };
}

// ---------- the poses ----------
const rest = (P, C) => roots(P, C).map((r, i) => leg(r, foot(r, i)));
/** The stride, frame k of n: the limbs by diagonal pairs, each foot swung `A` ahead and behind, lifted on its way forward. */
function stride(k, n, A = 12, reach = 80, lift = 9, P = [0, -22, 104], C = [0, 16, 112]) {
  const bob = 1.5 * Math.abs(Math.sin((2 * Math.PI * k) / n));
  const P2 = add(P, [0, 0, bob]), C2 = add(C, [0, 0, bob]);
  return { P: P2, C: C2, limbs: (rs) => rs.map((r, i) => { const ph = (2 * Math.PI * k) / n + ([0, Math.PI, Math.PI, 0][i]); return leg(r, foot(r, i, reach, A * Math.cos(ph), lift * Math.max(0, -Math.sin(ph)))); }) };
}
// the drop's wind-up, reared: the mockup's own (fore-limbs high, claws open over the hero)
const rearFore = (r, i, k = 1) => { const a = 1.15, d = [SX[i] * Math.sin(a), Math.cos(a), 0], hi = [r, add(r, add(sc(d, 12), [0, 0, 40])), add(r, add(sc(d, 24), [0, 2, 84])), add(r, add(sc(d, 34), [0, 12, 116])), add(r, add(sc(d, 38), [0, 32, 106])), add(r, add(sc(d, 34), [0, 46, 84]))];
  return k === 1 ? hi : hi.map((p, j) => lp(leg(r, foot(r, i))[j], p, k)); };
const foreClaw = (k) => [[0.2 * Math.sin(1.15), 0.5, -1], [-0.2 * Math.sin(1.15), 0.5, -1]].map((d) => (k ? d : undefined));
const POSES = {
  idle: (k) => ({ P: [0, -22, 104 + [0, 0.6, 1.2, 0.6][k]], C: [0, 16, 112 + [0, 0.8, 1.6, 0.8][k]], seal: 0.15 + 0.03 * [0, 1, 2, 1][k] }),
  walk: (k) => stride(k, 6),
  tele: (k) => {
    const P = k ? [0, -22, 74] : [0, -22, 88], C = k ? [0, 16, 118] : [0, 16, 106], f = k ? 1 : 0.45;
    return { P, C, head: k ? 'up' : 'hang', jaw: k ? 11 : 7, seal: k ? 0.35 : 0.25, clawLen: [k ? 16 : 13, k ? 16 : 13], clawDir: foreClaw(1),
      limbs: (rs) => rs.map((r, i) => (FRONT[i] ? rearFore(r, i, f) : leg(r, foot(r, i, 84)))) };
  },
  leap: () => ({ P: [0, -22, 100], C: [0, 16, 92], jaw: 9, head: 'hang', hairLen: 30, seal: 0.3, clawLen: [16, 16], clawDir: [[0.2, 1, -0.6], [-0.2, 1, -0.6]],
    limbs: (rs) => rs.map((r, i) => (FRONT[i] ? leg(r, add(foot(r, i, 70, 34), [0, 0, 30])) : leg(r, add(foot(r, i, 80, -16), [0, 0, 44])))) }),
  slam: () => ({ P: [0, -22, 44], C: [0, 16, 38], jaw: 10, seal: 0.3, clawLen: [16, 16], clawDir: [[0, 0.4, -1], [0, 0.4, -1]],
    limbs: (rs) => rs.map((r, i) => (FRONT[i] ? leg(r, [r[0] + SX[i] * 30, r[1] + 70, -4]) : leg(r, foot(r, i, 96)))) }),
  rise: (k) => ({ P: [0, -22, k ? 88 : 64], C: [0, 16, k ? 94 : 62], jaw: 6, seal: 0.2,
    limbs: (rs) => rs.map((r, i) => (FRONT[i] ? leg(r, [r[0] + SX[i] * 34, r[1] + (k ? 62 : 66), 0]) : leg(r, foot(r, i, k ? 84 : 92)))) }),
  rakeT: () => ({ P: [0, -22, 100], C: [0, 16, 108], head: 'up', jaw: 7, seal: 0.25, clawLen: [16, 10], clawDir: [[0.3, 1, -0.2]],
    limbs: (rs) => rs.map((r, i) => (i === 0 ? [r, add(r, [30, -10, 30]), add(r, [56, -24, 62]), add(r, [80, -28, 82]), add(r, [96, -10, 72]), add(r, [102, 10, 52])] : leg(r, foot(r, i, i === 1 ? 74 : 84)))) }),
  rake: () => ({ P: [0, -22, 98], C: [0, 16, 100], head: 'up', jaw: 10, seal: 0.25, clawLen: [16, 10], clawDir: [[-1, 0.3, -0.25]],
    limbs: (rs) => rs.map((r, i) => (i === 0 ? [r, add(r, [22, 22, 6]), add(r, [30, 46, 12]), add(r, [12, 72, 10]), add(r, [-20, 88, -8]), add(r, [-52, 90, -20])] : leg(r, foot(r, i, i === 1 ? 74 : 84)))) }),
  hurt: () => ({ P: [0, -24, 112], C: [0, 12, 124], jaw: 10, seal: 0.2, limbs: (rs) => rs.map((r, i) => leg(r, foot(r, i, 78))) }),
  // On the wall: laid flat on it (her belly to it), limbs splayed wide, crawling; the whole turned up against the wall.
  wall: (k) => ({ ...stride(k, 4, 14, 92, 8, [0, -22, 34], [0, 16, 38]), hairLen: 24, seal: 0.25 }),
  hurl: () => ({ P: [0, -22, 40], C: [0, 16, 46], hairLen: 24, head: 'up', jaw: 9, seal: 0.3, clawLen: [14, 10], clawDir: [[0, -0.4, 1]], rock: [26, -16, 118],
    limbs: (rs) => rs.map((r, i) => (i === 0 ? [r, add(r, [18, -6, 26]), add(r, [30, -14, 52]), add(r, [30, -24, 74]), add(r, [22, -30, 70]), add(r, [14, -32, 72])] : leg(r, foot(r, i, 92)))) }),
  corpse: () => ({ P: [0, -22, 12], C: [0, 16, 14], jaw: 12, hairLen: 10, seal: 0, limbs: (rs) => rs.map((r, i) => leg(r, add(foot(r, i, 26), [0, 0, 34]))) }),
};
// Turned up against the wall: her belly to it (model z to the camera), her head down (model y to the floor).
const WALL_Z = 120;
const onWall = (m) => placed(m, [0, 0, WALL_Z], 0, -Math.PI / 2, 0);

const FRAMES = [
  ...[0, 1, 2, 3].map((k) => [`idle${k}`, 'idle', k]), ...[0, 1, 2, 3, 4, 5].map((k) => [`walk${k}`, 'walk', k]),
  ['tele0', 'tele', 0], ['tele1', 'tele', 1], ['leap', 'leap', 0], ['slam', 'slam', 0], ['rise0', 'rise', 0], ['rise1', 'rise', 1],
  ['rakeT', 'rakeT', 0], ['rake', 'rake', 0], ['hurt', 'hurt', 0],
];
const WALLF = [...[0, 1, 2, 3].map((k) => [`wall${k}`, 'wall', k]), ['hurl', 'hurl', 0]];
const JOBS = [
  ...Object.keys(VIEWS).flatMap((view) => FRAMES.map(([name, pose, k]) => ({ view, name, pose, k }))),
  ...WALLF.map(([name, pose, k]) => ({ view: 'wall', name, pose, k })),
  { view: 'side', name: 'corpse', pose: 'corpse', k: 0, bare: true },
];
const ONLY = process.env.ONLY?.split(',');

/** Job `j` rendered: her alone (`bare`), or with her goules (their pixels apart, by object). */
function shoot(j, withGoules) {
  const { body, goules, seal } = spider(POSES[j.pose](j.k)), wall = j.view === 'wall', yaw = wall ? 0 : VIEWS[j.view], X = { x: W0 / 2, y: 0 };
  const put = (m) => (wall ? onWall(m) : m);
  const objects = [{ name: 'foe', pos: [X.x, X.y, 0], yaw, ...put(body), id: 1 }];
  if (withGoules) goules.forEach((g, k) => objects.push({ name: `g${k}`, pos: [X.x, X.y, 0], yaw, ...put(g.model), id: 10 + k }));
  const at = (p) => { // a model point to the world (turned to its view)
    const w = wall ? [p[0], p[2], WALL_Z - p[1]] : p, c = Math.cos(yaw), s = Math.sin(yaw);
    return [X.x + c * w[0] - s * w[1], X.y + s * w[0] + c * w[1], w[2]];
  };
  const lights = [
    { p: [X.x + 30, X.y - 60, 95], c: L('#8098a2'), I: 9, r0: 110, R: 320, soft: 10, only: ['foe', 'g0', 'g1', 'g2'] }, // the cold rim from behind
    { p: [X.x - 70, X.y + 70, 160], c: L('#a08a70'), I: 0.9, r0: 150, R: 460, soft: 12 },
    { p: [X.x + 28, X.y + 60, 70], c: L('#b8a68a'), I: 2.6, r0: 50, R: 220, soft: 6 }, // the vampire's lantern, off-frame
    ...body.lights.map((l) => ({ soft: 5, ...l, p: at(l.p) })),
    ...(wall ? [{ p: [X.x - 20, X.y + 140, 150], c: L('#a8a090'), I: 3, r0: 120, R: 380, soft: 8 }] : []), // on the wall her back faces the camera, off the rim: a cold wash on it
  ];
  const sc_ = { W: W0, H: H0, cam, off: -SOLE0, objects, lights, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6) };
  const img = render(sc_);
  haze(img, sc_);
  const px = post(img, { exposure: 3.3, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
  const lamp = project(cam, ...at(seal), -SOLE0);
  return { px, oid: img.oid, lamp };
}

if (isMainThread) {
  const t0 = Date.now(), jobs = JOBS.filter((j) => !ONLY || ONLY.includes(`${j.view}-${j.name}`)), N = Math.min(availableParallelism(), 8);
  const done_ = await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N, jobs } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const all = done_.flat();
  // Each job: its bare cell (her) and its goules' cells (from the render with them); alpha where something was drawn.
  const cells = [];
  for (const r of all) {
    const name = `${r.view}-${r.name}`, body = new Uint8ClampedArray(r.bare.px);
    for (let p = 0; p < W0 * H0; p++) body[p * 4 + 3] = r.bare.oid[p] >= 0 ? 255 : 0;
    cells.push({ name, px: body, lamp: r.bare.lamp });
    if (r.full) for (let k = 0; k < GOULES; k++) {
      const g = new Uint8ClampedArray(r.full.px);
      for (let p = 0; p < W0 * H0; p++) g[p * 4 + 3] = r.full.oid[p] === 10 + k ? 255 : 0;
      cells.push({ name: `${name}-g${k}`, px: g });
    }
  }
  // The logical cell: what every frame covers, centred on her floor point (so mirroring keeps it in place).
  let x0 = W0, y0 = H0, x1 = 0, y1 = 0;
  for (const c of cells) for (let p = 0; p < W0 * H0; p++) if (c.px[p * 4 + 3]) {
    const x = p % W0, y = (p - x) / W0;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  const half = Math.max(W0 / 2 - x0, x1 + 1 - W0 / 2) + 1, FW = 2 * half, top = y0 - 1, FH = y1 - top + 2, left = W0 / 2 - half;
  // Each cell trimmed to its own pixels: its box in the logical cell, packed.
  const list = [];
  for (const c of cells) {
    let a = W0, b = H0, e = -1, f = -1;
    for (let p = 0; p < W0 * H0; p++) if (c.px[p * 4 + 3]) { const x = p % W0, y = (p - x) / W0; a = Math.min(a, x); b = Math.min(b, y); e = Math.max(e, x); f = Math.max(f, y); }
    if (e < 0) continue; // a goule hidden whole in that pose
    const w = e - a + 1, h = f - b + 1, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(c.px.subarray(((b + y) * W0 + a) * 4, ((b + y) * W0 + a + w) * 4), y * w * 4);
    list.push({ name: c.name, x0: a - left, y0: b - top, x1: a - left + w - 1, y1: b - top + h - 1, rgba, lamp: c.lamp && [Math.round(c.lamp[0] - left), Math.round(c.lamp[1] - top)] });
  }
  const { atlas, AW, AH } = pack(list, null, 0, 2048);
  if (ONLY) { // each job's logical cell, her goules over her, side by side on grey
    const names = cells.filter((c) => !/-g\d$/.test(c.name)).map((c) => c.name), PW = FW * names.length, prev = new Uint8ClampedArray(PW * FH * 4).fill(255);
    for (let p = 0; p < PW * FH; p++) prev.set([70, 70, 74, 255], p * 4);
    names.forEach((n, i) => { for (const c of cells.filter((c) => c.name === n || c.name.startsWith(`${n}-g`))) for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const sx = left + x, sy = top + y, q = (sy * W0 + sx) * 4;
      if (sx >= 0 && sx < W0 && sy >= 0 && sy < H0 && c.px[q + 3]) prev.set(c.px.subarray(q, q + 4), (y * PW + i * FW + x) * 4);
    } });
    mkdirSync('shots', { recursive: true });
    writePNG('shots/nourrice-preview.png', prev, PW, FH, 2);
    console.log(names.join(' '));
  } else {
    writePNG('src/nourrice.png', atlas, AW, AH);
    const FRAMES_ = Object.fromEntries(list.map((g) => [g.name, [g.ax, g.ay, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1, g.x0, g.y0]]));
    const LAMPS = Object.fromEntries(list.filter((g) => g.lamp).map((g) => [g.name, g.lamp]));
    writeFileSync('src/nourrice.data.ts', `// Generated by tools/art/nourrice.gen.mjs: edit her poses there (her parts in tools/art/maquettes/boss/nourrices.mjs), not this table.
// La Nourrice's sheet (src/nourrice.png): each frame trimmed and packed, [atlas x, y, w, h, x, y in its logical cell];
// the logical cell is FW x FH, her floor point on row SOLE, centred (the wall's frames: the wall's foot, her body WALL_Z
// model units up it). Views side (facing right; the game mirrors it), down, up; wall. <frame>-g<k>: goule k clinging to her
// in that frame. LAMPS: where her seal shines in each frame (cell px). STRIDE: room px her stride covers (WALK frames).
export const FW = ${FW}, FH = ${FH}, SOLE = ${SOLE0 - top}, WALL_Z = ${WALL_Z}, WALK = 6, STRIDE = 24;
export const FRAMES: Record<string, [number, number, number, number, number, number]> = ${JSON.stringify(FRAMES_)};
export const LAMPS: Record<string, [number, number]> = ${JSON.stringify(LAMPS)};
`);
  }
  console.log(`${cells.length} cells in ${FW}x${FH}, atlas ${AW}x${AH}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N, jobs } = workerData, res = [];
  for (let i = w; i < jobs.length; i += N) {
    const j = jobs[i], bare = shoot(j, false), full = j.bare ? undefined : shoot(j, true);
    res.push({ ...j, bare, full });
  }
  parentPort.postMessage(res);
}
