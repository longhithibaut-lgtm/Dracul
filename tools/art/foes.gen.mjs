// The Order's Purificateur and Prêtre for the « grand pixel » rooms (docs/decisions.md): the validated enemy sheet's own
// 3D models (tools/art/maquettes/ennemis/foes.mjs, docs/maquettes/ennemis-planche-1.png) posed per frame and rendered
// with its lights (the cold rim from behind, the warm fill, the vampire's lantern off-frame, their own pilot light and
// monstrance) and its post (snapped onto its palette, tarnished gold included). One model unit is one pixel at
// 960x540, like the grand hero (tools/art/grand-hero.gen.mjs): the game draws the sheets at half scale on the x2 view.
// Five views (facing right, down-right, down, up-right, up: the game mirrors them for the left), each: idle (breathing,
// the pilot light or the monstrance flickering), the walk (a stride the game turns by the distance walked), the
// telegraph (ignite / pray), the jet of fire (two flickers; the body and the jet apart, so the game can turn the jet to
// its real aim), the recoil of a hit, kneeling (the idle sunk to the knees, cut at the floor); one bloodied corpse.
// Writes src/purifier.png, src/priest.png and src/foes.data.ts.
// Usage: node tools/art/foes.gen.mjs (~10 s on 4 cores); ONLY=priest renders one of them to
// shots/priest-preview.png (x2, on grey) instead, to try a pose.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, project, L, mix, vn3 } from './maquettes/ennemis/lib.mjs';
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
// The walk's legs, frame k of n: each ankle swings STEP ahead and behind, lifted on its way forward. A foot is planted
// half the cycle while the body passes over it, so a cycle walks 4 STEP model units: 2 STEP room px (STRIDE).
const STEP = 9;
function legs(k, n) {
  const o = {};
  for (const [s, x, ph] of [['r', -1, 0], ['l', 1, Math.PI]]) {
    const a = (2 * Math.PI * k) / n + ph, f = Math.cos(a), lift = 5 * Math.max(0, Math.sin(a));
    const H = std[`H${s}`], A = [x * 4, -0.5 + STEP * f, 4 + lift];
    Object.assign(o, { [`K${s}`]: knee(H, A), [`A${s}`]: A, [`T${s}`]: [x * 4.4, A[1] + 6.4, Math.max(1, A[2] - 3 + lift * 0.4)] });
  }
  return o;
}
// The upper body: breathing lifts it, a recoil tips it back about the hips (a < 0), the head thrown further.
const UPPER = ['head', 'neck', 'chest', 'Sr', 'Sl', 'Er', 'El', 'Wr', 'Wl', 'Hr_', 'Hl_'];
const breathe = (J, k) => Object.fromEntries(UPPER.map((n) => [n, add(J[n], [n === 'head' ? 0.3 * k : 0, 0, (n === 'chest' ? 0.5 : 0.8) * k])]));
function lean(J, a) {
  const o = Object.fromEntries(UPPER.map((n) => {
    const y = J[n][1] - J.pelvis[1], z = J[n][2] - J.pelvis[2];
    return [n, [J[n][0], J.pelvis[1] + y * Math.cos(a) + z * Math.sin(a), J.pelvis[2] + z * Math.cos(a) - y * Math.sin(a)]];
  }));
  o.head = add(o.head, [0.8, -2.2, -0.6]);
  return o;
}
// A robe or coat swinging with the stride: shears what hangs below the waist along the model's y, the feet kept planted.
function sway(m, d) {
  const k = (z) => { const t = Math.min(1, Math.max(0, (z - 4) / 10)); return t * t * (3 - 2 * t) * Math.max(0, (62 - z) / 52) ** 1.5; };
  const [x0, y0, z0, x1, y1, z1] = m.bounds;
  return { ...m, sdf: (x, y, z) => m.sdf(x, y - d * k(z), z) * 0.9, mat: (n, x, y, z, ...r) => m.mat(n, x, y - d * k(z), z, ...r), bounds: [x0, y0 - Math.abs(d), z0, x1, y1 + Math.abs(d), z1] };
}

// The card's lance points up and across; the game's jet runs along the floor cone it burns: level and straight ahead.
const AIM = { Er: [-9, 9, 58], Wr: [-1, 18.5, 58.5], Hr_: [0, 21, 58.8] };
const BREATH = [0, 0.5, 1, 0.5], FLAME = [1, 1.4, 0.8, 1.2], GLOW = [1, 1.15, 1.3, 1.1];

// Each foe: its sheet cell (FW x FH, soles on row SOLE, centred); its walk (WALK frames a cycle); its frames: [name,
// () => model, { bob: model z, layer: 'body' (the jet left out) or 'jet' (the jet alone, pivoting on the lance) }].
const FOES = {
  purifier: {
    FW: 230, FH: 176, SOLE: 140, WALK: 6,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => purificateur('idle', (J) => ({ ...breathe(J, b), flame: FLAME[k] }))]),
      ...[0, 1, 2, 3, 4, 5].map((k) => [`walk${k}`, () => sway(purificateur('idle', legs(k, 6)), -1.6 * Math.sin((2 * Math.PI * k) / 6)), { bob: -0.6 * Math.abs(Math.cos((2 * Math.PI * k) / 6)) }]),
      ['ignite', () => purificateur('tele', AIM)],
      ['fire0', () => purificateur('atk', AIM), { layer: 'body' }], ['fire1', () => purificateur('atk1', AIM), { layer: 'body' }],
      ['jet0', () => purificateur('atk', AIM), { layer: 'jet' }], ['jet1', () => purificateur('atk1', AIM), { layer: 'jet' }],
      ['hurt', () => purificateur('idle', (J) => lean(J, -0.2))],
    ],
    // Face down, the tanks on his back, arms flung out.
    corpse: () => lying(purificateur('idle', { Er: [-17, 4, 80], Wr: [-24, 6, 90], Hr_: [-26, 8, 94], El: [17, 2, 70], Wl: [25, 6, 64], Hl_: [28, 8, 63] }), true),
  },
  priest: {
    FW: 170, FH: 156, SOLE: 140, WALK: 4,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => pretre('idle', (J) => ({ ...breathe(J, b), glow: GLOW[k] }))]),
      // His toes show at the hem in turn, the robe swinging with each step.
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => sway(pretre('idle', legs(k, 4)), -2.2 * Math.sin((Math.PI * k) / 2)), { bob: -0.8 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['pray', () => ({ ...pretre('atk'), vfx: null })],
      ['hurt', () => pretre('idle', (J) => lean(J, -0.16))],
    ],
    // On his back, his arms fallen open at his sides, the staff fallen by him, the gilded mask turned up.
    corpse: () => lying(pretre('idle', { Er: [-12, 1, 62], Wr: [-17, 3, 48], Hr_: [-18, 4, 43], El: [12, 1, 62], Wl: [17, 3, 48], Hl_: [18, 4, 43] }), false),
  },
};
// Lying on the floor, head to the right (model up <- world x), on his back (model forward <- up) or face down, slumped
// (cloth and limbs settle: heights x FLAT); what would sink under the floor is cut off. Blood soaks his chest (or back)
// and his side on the floor.
const GORE = [L('#5a0a10'), L('#7a1016')], FLAT = 0.7;
function lying(m, prone) {
  const [x0, y0, z0, x1, y1, z1] = m.bounds, c = (z0 + z1) / 2, lift = prone ? 9 : -y0 - 2;
  const to = (X, Y, Z) => [Y, prone ? lift - Z / FLAT : Z / FLAT - lift, X + c];
  const blood = (x, y, z) => Math.min(1, Math.max(0, 1.8 - Math.hypot(x * 0.8, (y - (prone ? -8 : 8)) * 0.5, z - 62) / 14 + (vn3(x * 0.4, y * 0.4, z * 0.4, 5) - 0.5) * 1.2));
  return {
    sdf: (X, Y, Z) => Math.max(m.sdf(...to(X, Y, Z)) * FLAT, -Z), mat: (k, X, Y, Z) => {
      const p = to(X, Y, Z), r = m.mat(k, ...p), b = Math.max(blood(...p), Z < 2.5 ? 0.75 : 0);
      return r.emi ? r : { ...r, alb: mix(r.alb.map((v) => v * 0.8), b > 0.6 ? GORE[1] : GORE[0], Math.min(1, b)), spec: (r.spec ?? 0) * (1 - b) + b * 0.15, gloss: 30 };
    },
    bounds: [z0 - c, x0, 0, z1 - c, x1, (prone ? lift - y0 : y1 + lift) * FLAT], step: m.step, lights: [],
  };
}

const ONLY = process.env.ONLY?.split(',');
const JOBS = Object.entries(FOES).filter(([id]) => !ONLY || ONLY.includes(id)).flatMap(([id, f]) => [
  ...Object.keys(VIEWS).flatMap((view) => f.frames.map(([name], n) => ({ id, view, name, n }))),
  { id, view: 'side', name: 'corpse', n: -1 },
]);

// The card's lighting (fiche.mjs put()), the foe standing at the cell's centre turned to `yaw`.
function scene(job) {
  const F = FOES[job.id], CX = F.FW / 2, dead = job.name === 'corpse', yaw = dead ? 0.25 : VIEWS[job.view];
  const [, make, { bob = 0, layer } = {}] = dead ? [] : F.frames[job.n];
  const m = dead ? F.corpse() : make();
  const P = { x: CX, y: dead ? -12 : 0, yaw }, objects = [];
  if (layer !== 'jet') objects.push({ name: 'foe', pos: [P.x, P.y, bob], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 1, step: m.step });
  if (m.vfx && layer !== 'body') objects.push({ name: 'vfx', pos: [P.x, P.y, bob], yaw, sdf: m.vfx.sdf, mat: m.vfx.mat, bounds: m.vfx.bounds, id: 2, step: m.vfx.step, noShadow: true, noSelfAO: true });
  const lights = [
    { p: [P.x + 30, P.y - 60, 75], c: L('#8098a2'), I: dead ? 3 : 9, r0: 90, R: 260, soft: 10, only: ['foe'] }, // (it would lay a cold sheen all over a body lying down)
    { p: [P.x - 70, P.y + 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
    { p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 }, // the vampire's lantern, off-frame
    // its own (the priest's light on the holy zone falls on the floor, which the game draws)
    ...m.lights.filter((l) => !l.noShadow).map((l) => ({ soft: 5, R: 200, ...l, p: add(place(P, l.p), [0, 0, bob]) })),
  ];
  // Where its own light is (the jet: where it leaves the lance, its pivot in the game).
  const at = layer === 'jet' ? m.tip : m.lights[0]?.p, own = at ? project(cam, ...add(place(P, at), [0, 0, bob]), -F.SOLE) : [CX, 0];
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
      const idle = cells.find(([n]) => n === `${view}-idle0`)[1], px = new Uint8ClampedArray(idle.px.length);
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
    data[id] = { FW: F.FW, FH: F.FH, COLS, SOLE: F.SOLE, WALK: F.WALK, STRIDE: 2 * STEP, FRAMES: frames };
    console.log(`src/${id}.png ${W}x${H}, ${cells.length} cells`);
  }
  if (!ONLY) writeFileSync('src/foes.data.ts', `// Generated by tools/art/foes.gen.mjs: edit the models there (and in tools/art/maquettes/ennemis/foes.mjs), not this table.
// The Purificateur's and the Prêtre's sheets (src/purifier.png, src/priest.png): FW x FH cells, COLS per row, soles on row
// SOLE, centred; WALK frames a walk cycle, which covers STRIDE room px of floor (screen rows / ${cam.s.toFixed(4)}); each frame's
// cell and where its own light is (sheet px: the pilot light, the monstrance; for the jet, its pivot on the lance).
export const FLOOR = ${cam.s.toFixed(4)}; // how much the sheets' floor is foreshortened up the screen
export type Sheet = { FW: number; FH: number; COLS: number; SOLE: number; WALK: number; STRIDE: number; FRAMES: Record<string, { cell: number; lamp: [number, number] }> };
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
