// The four met in the world (src/pnj.ts; names provisional): their models (tools/art/maquettes/pnj/pnj.mjs) posed per
// frame and rendered with the foes' light (tools/art/foes.gen.mjs: the cold rim from behind, the warm fill, the
// vampire's lantern off-frame, their own candles), one model unit a pixel at 960x540: the game draws them at half scale.
// Facing the camera (Odo's walk: facing right, the game mirrors it). Each sheet is one row of FW x FH cells cropped to
// what its frames cover, the soles on row SOLE, centred.
// Writes src/pnj-<id>.png and src/pnj.data.ts. Usage: node tools/art/pnj.gen.mjs; ONLY=odo PREVIEW=1 writes
// shots/pnj-odo-preview.png (x3, on grey) instead.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, L } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { place } from './maquettes/ennemis/fx.mjs';
import { std } from './maquettes/ennemis/cast.mjs';
import { mirelle, greffier, ledger, ilse, odo } from './maquettes/pnj/pnj.mjs';

const cam = camera(38 * Math.PI / 180);
const W0 = 200, H0 = 180, SOLE0 = 140;
const DOWN = 0, SIDE = -Math.PI / 2, QUARTER = -0.55; // yaw: the model looks down +y; sitting, turned a little: the knees read

// Two-bone IK and the walk's legs, as tools/art/foes.gen.mjs.
function knee(H, A, L1 = 22.3, L2 = 23.2) {
  let d = A.map((v, i) => v - H[i]), n = Math.hypot(...d);
  if (n > L1 + L2 - 0.3) { d = d.map((v) => v * (L1 + L2 - 0.3) / n); n = L1 + L2 - 0.3; }
  const u = d.map((v) => v / n), a = (L1 * L1 - L2 * L2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pole = [0, 1, 0], pu = pole.map((v, i) => v - u[i] * u[1]), pl = Math.hypot(...pu);
  return H.map((v, i) => v + u[i] * a + (pu[i] / pl) * h);
}
function legs(k, n, step = 7) {
  const o = {};
  for (const [s, x, ph] of [['r', -1, 0], ['l', 1, Math.PI]]) {
    const a = (2 * Math.PI * k) / n + ph, f = Math.cos(a), lift = 4 * Math.max(0, -Math.sin(a));
    const A = [x * 4.5, -0.5 + step * f, 4 + lift];
    Object.assign(o, { [`K${s}`]: knee(std[`H${s}`], A), [`A${s}`]: A, [`T${s}`]: [x * 4.9, A[1] + 6.4, Math.max(1, A[2] - 3 + lift * 0.4)] });
  }
  return o;
}
const breathe = (k) => (J) => ({ head: J.head.map((v, i) => v + (i === 2 ? 0.8 * k : 0)), chest: J.chest.map((v, i) => v + (i === 2 ? 0.5 * k : 0)) });

// Each one's frames: [name, () => model, yaw, bob].
const PNJ = {
  mirelle: [['wall0', () => mirelle('wall0')], ['wall1', () => mirelle('wall1')], ['eyes', () => mirelle('eyes')], ['broken', () => mirelle('broken')],
    ['sit0', () => mirelle('sit0'), QUARTER], ['sit1', () => mirelle('sit1'), QUARTER]],
  greffier: [['carve0', () => greffier('carve0'), QUARTER], ['carve1', () => greffier('carve1'), QUARTER], ['look', () => greffier('look'), QUARTER], ['ledger', () => ledger(), 0.3]],
  ilse: [['sleep0', () => ilse('sleep0'), QUARTER], ['sleep1', () => ilse('sleep1'), QUARTER], ['wake', () => ilse('wake'), QUARTER], ['offer', () => ilse('offer'), QUARTER], ['dead', () => ilse('dead'), QUARTER]],
  odo: [['stake', () => odo('stake')], ['idle0', () => odo('idle')], ['idle1', () => odo('idle', breathe(1))], ['plead', () => odo('plead')], ['hurt', () => odo('hurt')],
    ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => odo('idle', legs(k, 4)), SIDE, -0.6 * Math.abs(Math.cos((Math.PI * k) / 2))])],
};
const ONLY = process.env.ONLY?.split(',');
const JOBS = Object.entries(PNJ).filter(([id]) => !ONLY || ONLY.includes(id)).flatMap(([id, fr]) => fr.map((f, n) => ({ id, n })));

function scene({ id, n }) {
  const [, make, yaw = DOWN, bob = 0] = PNJ[id][n], m = make(), P = { x: W0 / 2, y: 0, yaw };
  return {
    W: W0, H: H0, cam, off: -SOLE0, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6),
    objects: [{ name: 'pnj', pos: [P.x, P.y, bob], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 1, step: m.step }],
    lights: [
      { p: [P.x + 30, P.y - 60, 75], c: L('#8098a2'), I: 7, r0: 90, R: 260, soft: 10, only: ['pnj'] },
      { p: [P.x - 70, P.y + 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
      { p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 }, // the vampire's lantern, off-frame
      ...m.lights.map((l) => ({ soft: 5, R: 200, ...l, p: place(P, l.p).map((v, i) => v + (i === 2 ? bob : 0)) })),
    ],
  };
}

if (isMainThread) {
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const all = (await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N } });
    wk.on('message', res);
    wk.on('error', rej);
  })))).flat();
  const data = {};
  for (const [id, fr] of Object.entries(PNJ)) {
    if (ONLY && !ONLY.includes(id)) continue;
    const cells = fr.map((_, n) => all.find((j) => j.id === id && j.n === n).px);
    let x0 = W0, y0 = H0, x1 = 0, y1 = 0;
    for (const px of cells) for (let p = 0; p < W0 * H0; p++) if (px[p * 4 + 3]) {
      const x = p % W0, y = (p - x) / W0;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const half = Math.max(W0 / 2 - x0, x1 + 1 - W0 / 2) + 1, FW = 2 * half, FH = y1 - y0 + 3, top = y0 - 1, left = W0 / 2 - half, W = FW * fr.length;
    const rgba = new Uint8ClampedArray(W * FH * 4);
    cells.forEach((px, i) => {
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const sx = left + x, sy = top + y;
        if (sx >= 0 && sx < W0 && sy >= 0 && sy < H0) rgba.set(px.subarray((sy * W0 + sx) * 4, (sy * W0 + sx) * 4 + 4), (y * W + i * FW + x) * 4);
      }
    });
    if (process.env.PREVIEW) {
      for (let p = 0; p < W * FH; p++) if (!rgba[p * 4 + 3]) rgba.set([70, 70, 74, 255], p * 4);
      mkdirSync('shots', { recursive: true });
      writePNG(`shots/pnj-${id}-preview.png`, rgba, W, FH, 3);
      continue;
    }
    writePNG(`src/pnj-${id}.png`, rgba, W, FH);
    data[id] = { FW, FH, SOLE: SOLE0 - top, FRAMES: fr.map(([n]) => n) };
    console.log(`src/pnj-${id}.png ${W}x${FH}, ${fr.length} frames`);
  }
  if (!process.env.PREVIEW && !ONLY) writeFileSync('src/pnj.data.ts', `// Generated by tools/art/pnj.gen.mjs: edit the models there (tools/art/maquettes/pnj/pnj.mjs), not this table.
// The sheets of the four met in the world (src/pnj-<id>.png): one row of FW x FH cells, soles on row SOLE, centred.
export type Sheet = { FW: number; FH: number; SOLE: number; FRAMES: string[] };
export const SHEETS: Record<${Object.keys(data).map((k) => `'${k}'`).join(' | ')}, Sheet> = ${JSON.stringify(data)};
`);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N } = workerData, out = [];
  for (let i = w; i < JOBS.length; i += N) {
    const sc = scene(JOBS[i]), img = render(sc);
    haze(img, sc);
    const px = post(img, { exposure: 3.6, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
    for (let p = 0; p < sc.W * sc.H; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
    out.push({ ...JOBS[i], px });
  }
  parentPort.postMessage(out);
}
