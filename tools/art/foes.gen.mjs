// The Order's Purificateur and Prêtre for the « grand pixel » rooms (docs/decisions.md): the validated enemy sheet's own
// 3D models (tools/art/maquettes/ennemis/foes.mjs, docs/maquettes/ennemis-planche-1.png) posed per frame and rendered
// with its lights (the cold rim from behind, the warm fill, the vampire's lantern off-frame, their own pilot light and
// monstrance) and its post (snapped onto its palette, tarnished gold included). One model unit is one pixel at
// 960x540, like the grand hero (tools/art/grand-hero.gen.mjs): the game draws the sheets at half scale on the x2 view.
// Five views (facing right, down-right, down, up-right, up: the game mirrors them for the left), each: idle, the walk,
// the telegraph (ignite / pray), the jet of fire (two flickers), kneeling (the idle sunk to the knees, cut at the floor);
// one corpse lying on its back. Writes src/purifier.png, src/priest.png and src/foes.data.ts.
// Usage: node tools/art/foes.gen.mjs (~10 s on 4 cores); ONLY=priest renders one of them to
// shots/priest-preview.png (x2, on grey) instead, to try a pose.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, project, L } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { purificateur, pretre } from './maquettes/ennemis/foes.mjs';
import { place } from './maquettes/ennemis/fx.mjs';
import { std } from './maquettes/ennemis/cast.mjs';

const cam = camera(38 * Math.PI / 180);
const VIEWS = { side: -Math.PI / 2, dside: -Math.PI / 4, down: 0, uside: -3 * Math.PI / 4, up: Math.PI }; // yaw: the model looks down +y
const KNEEL = 18; // sheet px the kneeling frame sinks
const add = (a, b) => a.map((v, i) => v + b[i]);

// Two-bone IK (as grand-hero.gen.mjs): the knee from hip H toward ankle A, bent forward.
function knee(H, A, L1 = 22.3, L2 = 23.2) {
  let d = A.map((v, i) => v - H[i]), n = Math.hypot(...d);
  if (n > L1 + L2 - 0.3) { d = d.map((v) => v * (L1 + L2 - 0.3) / n); n = L1 + L2 - 0.3; }
  const u = d.map((v) => v / n), a = (L1 * L1 - L2 * L2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pole = [0, 1, 0], pu = pole.map((v, i) => v - u[i] * u[1]), pl = Math.hypot(...pu);
  return H.map((v, i) => v + u[i] * a + (pu[i] / pl) * h);
}
// The walk's legs, frame k of 4: contact, passing, contact, passing; each ankle reaches STEP ahead and behind.
const STEP = 9;
function legs(k) {
  const o = {};
  for (const [s, x, ph] of [['r', -1, 0], ['l', 1, Math.PI]]) {
    const a = (k * Math.PI) / 2 + ph, f = Math.cos(a), lift = 5 * Math.max(0, Math.sin(a));
    const H = std[`H${s}`], A = [x * 4, -0.5 + STEP * f, 4 + lift];
    Object.assign(o, { [`K${s}`]: knee(H, A), [`A${s}`]: A, [`T${s}`]: [x * 4.4, A[1] + 6.4, Math.max(1, A[2] - 3 + lift * 0.4)] });
  }
  return o;
}

// The card's lance points up and across; the game's jet runs along the floor cone it burns: level and straight ahead.
const AIM = { Er: [-9, 9, 58], Wr: [-1, 18.5, 58.5], Hr_: [0, 21, 58.8] };

// Each foe: its sheet cell (FW x FH, soles on row SOLE, centred), and its frames: [name, () => model, bob (model z)].
const FOES = {
  purifier: {
    FW: 230, FH: 176, SOLE: 140,
    frames: [['idle', () => purificateur('idle')], ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => purificateur('idle', legs(k))]),
      ['ignite', () => purificateur('tele', AIM)], ['fire0', () => purificateur('atk', AIM)], ['fire1', () => purificateur('atk1', AIM)]],
  },
  priest: {
    FW: 150, FH: 156, SOLE: 140,
    // Under the bell of his robe the legs never show: he glides, bobbing.
    frames: [['idle', () => pretre('idle')], ['walk0', () => pretre('idle'), 1.2], ['walk1', () => pretre('idle'), -0.6], ['pray', () => ({ ...pretre('atk'), vfx: null })]],
  },
};
// Lying on his back, head to the right: model x <- world y, model forward <- up, model up <- world x.
function lying(m) {
  const [x0, y0, z0, x1, y1, z1] = m.bounds, lift = -y0 - 2, c = (z0 + z1) / 2;
  const to = (X, Y, Z) => [Y, Z - lift, X + c];
  return { sdf: (X, Y, Z) => m.sdf(...to(X, Y, Z)), mat: (k, X, Y, Z) => m.mat(k, ...to(X, Y, Z)), bounds: [z0 - c, x0, y0 + lift, z1 - c, x1, y1 + lift], step: m.step, lights: [] };
}

const ONLY = process.env.ONLY?.split(',');
const JOBS = Object.entries(FOES).filter(([id]) => !ONLY || ONLY.includes(id)).flatMap(([id, f]) => [
  ...Object.keys(VIEWS).flatMap((view) => f.frames.map(([name], n) => ({ id, view, name, n }))),
  { id, view: 'side', name: 'corpse', n: -1 },
]);

// The card's lighting (fiche.mjs put()), the foe standing at the cell's centre turned to `yaw`.
function scene(job) {
  const F = FOES[job.id], CX = F.FW / 2, yaw = job.name === 'corpse' ? 0 : VIEWS[job.view];
  const [, make, bob = 0] = F.frames[Math.max(0, job.n)];
  let m = make();
  if (job.name === 'corpse') m = lying(job.id === 'purifier' ? purificateur('idle', { Er: std.Er, Wr: std.Wr, Hr_: std.Hr_, El: std.El, Wl: std.Wl, Hl_: std.Hl_ }) : m);
  const P = { x: CX, y: job.name === 'corpse' ? -12 : 0, yaw }, objects = [{ name: 'foe', pos: [P.x, P.y, bob], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 1, step: m.step }];
  if (m.vfx) objects.push({ name: 'vfx', pos: [P.x, P.y, bob], yaw, sdf: m.vfx.sdf, mat: m.vfx.mat, bounds: m.vfx.bounds, id: 2, step: m.vfx.step, noShadow: true, noSelfAO: true });
  const lights = [
    { p: [P.x + 30, P.y - 60, 75], c: L('#8098a2'), I: 9, r0: 90, R: 260, soft: 10, only: ['foe'] },
    { p: [P.x - 70, P.y + 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
    { p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 }, // the vampire's lantern, off-frame
    // its own (the priest's light on the holy zone falls on the floor, which the game draws)
    ...m.lights.filter((l) => !l.noShadow).map((l) => ({ soft: 5, R: 200, ...l, p: add(place(P, l.p), [0, 0, bob]) })),
  ];
  const own = m.lights[0] ? project(cam, ...add(place(P, m.lights[0].p), [0, 0, bob]), -F.SOLE) : [CX, 0];
  return { sc: { W: F.FW, H: F.FH, cam, off: -F.SOLE, objects, lights, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6) }, lamp: own };
}

if (isMainThread) {
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const done = await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const all = done.flat();
  const data = {};
  for (const [id, F] of Object.entries(FOES)) {
    if (ONLY && !ONLY.includes(id)) continue;
    // Cells: per view its frames then the kneel; the corpse last.
    const cells = [], frames = {};
    for (const view of Object.keys(VIEWS)) {
      for (const [name] of F.frames) cells.push([`${view}-${name}`, all.find((j) => j.id === id && j.view === view && j.name === name)]);
      const idle = cells.find(([n]) => n === `${view}-idle`)[1], px = new Uint8ClampedArray(idle.px.length);
      for (let y = 0; y + KNEEL <= F.SOLE; y++) px.set(idle.px.subarray(y * F.FW * 4, (y + 1) * F.FW * 4), (y + KNEEL) * F.FW * 4);
      cells.push([`${view}-kneel`, { px, lamp: [idle.lamp[0], idle.lamp[1] + KNEEL] }]);
    }
    cells.push(['corpse', all.find((j) => j.id === id && j.name === 'corpse')]);
    const COLS = Math.ceil(Math.sqrt(cells.length * F.FH / F.FW)), W = COLS * F.FW, H = Math.ceil(cells.length / COLS) * F.FH, rgba = new Uint8ClampedArray(W * H * 4);
    cells.forEach(([name, c], i) => {
      const ox = (i % COLS) * F.FW, oy = Math.floor(i / COLS) * F.FH;
      for (let y = 0; y < F.FH; y++) rgba.set(c.px.subarray(y * F.FW * 4, (y + 1) * F.FW * 4), ((oy + y) * W + ox) * 4);
      frames[name] = { cell: i, lamp: c.lamp.map((v) => Math.round(v)) };
    });
    if (ONLY) {
      for (let p = 0; p < W * H; p++) if (!rgba[p * 4 + 3]) rgba.set([70, 70, 74, 255], p * 4);
      writePNG(`shots/${id}-preview.png`, rgba, W, H, 2);
      continue;
    }
    writePNG(`src/${id}.png`, rgba, W, H);
    data[id] = { FW: F.FW, FH: F.FH, COLS, SOLE: F.SOLE, FRAMES: frames };
    console.log(`src/${id}.png ${W}x${H}, ${cells.length} cells`);
  }
  if (!ONLY) writeFileSync('src/foes.data.ts', `// Generated by tools/art/foes.gen.mjs: edit the models there (and in tools/art/maquettes/ennemis/foes.mjs), not this table.
// The Purificateur's and the Prêtre's sheets (src/purifier.png, src/priest.png): FW x FH cells, COLS per row, soles on row
// SOLE, centred; each frame's cell and where its own light is (sheet px: the pilot light, the monstrance).
export type Sheet = { FW: number; FH: number; COLS: number; SOLE: number; FRAMES: Record<string, { cell: number; lamp: [number, number] }> };
export const SHEETS: Record<'purifier' | 'priest', Sheet> = ${JSON.stringify(data)};
`);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N } = workerData, out = [];
  for (let i = w; i < JOBS.length; i += N) {
    const job = JOBS[i], { sc, lamp } = scene(job), img = render(sc);
    haze(img, sc);
    const px = post(img, { exposure: 3.6, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
    for (let p = 0; p < sc.W * sc.H; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
    out.push({ ...job, px, lamp });
  }
  parentPort.postMessage(out);
}
