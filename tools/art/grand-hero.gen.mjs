// The torture room's hero at full detail (« grand pixel » trial, docs/decisions.md): the validated mockup's 3D vampire
// (tools/art/grand/hero.mjs) posed per frame, lit by his lantern, a cold back rim and a faint warm fill with real
// shadows and ambient occlusion (tools/art/grand/lib.mjs), then the mockup's post (filmic, desaturated, light dither,
// snapped onto its 67 colours). One model unit is one pixel at 960x540: he stands ~80 px tall; the game draws the
// sheet at half scale on its x2 view of that room (dark.ts). Views down / up / side (side faces right, the game
// mirrors it): idle 2 frames (breathing, the lantern swaying), run 6 frames, slash 2 poses.
// Writes src/grand-hero.png (a row per view) and src/grand.data.ts. Usage: node tools/art/grand-hero.gen.mjs (~1 min)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, writePNG, project, L } from './grand/lib.mjs';
import { hero, POSES } from './grand/hero.mjs';

const FW = 104, FH = 104, CX = FW / 2, SOLE = 86; // soles' contact line (sheet rows), the body's centre column
const VIEWS = { down: 0, up: Math.PI, side: -Math.PI / 2 }; // yaw: the model looks down +y, toward the camera
const RUN = 6;
const cam = camera(38 * Math.PI / 180);

const add = (a, b) => a.map((v, i) => v + b[i]);
// Rotates p about o in the y-z plane (a > 0 swings what hangs below o forward).
const swing = (p, o, a) => { const y = p[1] - o[1], z = p[2] - o[2]; return [p[0], o[1] + y * Math.cos(a) - z * Math.sin(a), o[2] + y * Math.sin(a) + z * Math.cos(a)]; };
// The knee between hip and ankle, bent forward (two-bone IK, thigh and shin of the idle pose).
function knee(H, A, L1 = 22.6, L2 = 22.5) {
  let dy = A[1] - H[1], dz = A[2] - H[2], d = Math.hypot(dy, dz);
  if (d > L1 + L2 - 0.4) { const k = (L1 + L2 - 0.4) / d; dy *= k; dz *= k; d = L1 + L2 - 0.4; }
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  return [(H[0] + A[0]) / 2, H[1] + (dy * a) / d - (dz / d) * h, H[2] + (dz * a) / d + (dy / d) * h];
}

const I = POSES.idle;
function pose(name, k) {
  if (name === 'idle') { // breathing: the chest and shoulders rise, the lantern sways
    const up = k ? 0.6 : 0, u = (p) => add(p, [0, 0, up]);
    return { ...I, head: u(I.head), neck: u(I.neck), chest: add(I.chest, [0, 0.3 * k, up]), Sr: u(I.Sr), Sl: u(I.Sl), Er: u(I.Er), El: u(I.El), Wr: u(I.Wr), Wl: u(I.Wl), Kr_: u(I.Kr_), Kl_: u(I.Kl_), lanSway: k ? [0.6, -0.8] : [-0.3, 0.4] };
  }
  if (name === 'slash') { // 0: the claws raked down and forward (the mockup's pose); 1: the claw arm flung up high
    const S = POSES.slash;
    return k ? { ...S, smear: false, Er: [-9.5, 16, 82], Wr: [-9.5, 23, 95], Kr_: [-9.5, 25.5, 98.5], head: add(S.head, [0, -2, 1.5]) } : { ...S, smear: false };
  }
  // run k of RUN: a stalking stride, the body leaning in, the claw arm against the legs, the lantern lagging, the coat
  // flaring behind and swinging with the hips.
  const ph = (2 * Math.PI * k) / RUN, bob = 1.0 * Math.cos(2 * ph) - 0.8, lean = (p, a) => add(p, [0, a, bob - a * 0.25]);
  const P = { ...I, head: lean(I.head, 4.5), neck: lean(I.neck, 3.6), chest: lean(I.chest, 2.6), Sr: lean(I.Sr, 3.2), Sl: lean(I.Sl, 3.2), pelvis: add(I.pelvis, [0, 0.6, bob]), tilt: 0.08, coatBack: 0.35, coatFlare: 0.3, coatSide: 0.25 * Math.sin(ph) };
  for (const [side, f, c] of [['r', Math.sin(ph), Math.cos(ph)], ['l', -Math.sin(ph), -Math.cos(ph)]]) {
    const x = side === 'r' ? -1 : 1, lift = 7 * Math.max(0, c) ** 1.5;
    const A = [x * 4, -0.6 + 13 * f, 5 + lift], H = [x * 3.5, P.pelvis[1], P.pelvis[2] - 1.5];
    const p = lift > 0.5 ? (f < 0 ? -0.75 : 0.25) : 0, ty = 6.8 * Math.cos(p) + 3.8 * Math.sin(p), tz = 6.8 * Math.sin(p) - 3.8 * Math.cos(p);
    const T = [A[0] + x * 0.8, A[1] + ty, Math.max(1.2, A[2] + tz)];
    if (side === 'r') Object.assign(P, { Hr: H, Kr: knee(H, A), Ar: A, Tr: T });
    else Object.assign(P, { Hl: H, Kl: knee(H, A), Al: A, Tl: T });
  }
  const ar = -0.5 * Math.sin(ph), al = 0.12 * Math.sin(ph), m = (p) => add(p, [0, 3.2, bob - 0.8]); // arms carried by the leaned shoulders
  Object.assign(P, { Er: swing(m(I.Er), P.Sr, ar), Wr: swing(m(I.Wr), P.Sr, ar), Kr_: swing(m(I.Kr_), P.Sr, ar), El: swing(m(I.El), P.Sl, al), Wl: swing(m(I.Wl), P.Sl, al), Kl_: swing(m(I.Kl_), P.Sl, al), lanSway: [0, -2.2 * Math.cos(ph)] });
  return P;
}

// Every cell of the sheet: a row per view, idle0-1, run0-5, slash0-1.
const CELLS = Object.keys(VIEWS).flatMap((view) => [...[0, 1].map((k) => [view, 'idle', k]), ...Array.from({ length: RUN }, (_, k) => [view, 'run', k]), ...[0, 1].map((k) => [view, 'slash', k])]);
const COLS = CELLS.length / 3;

function scene(view, name, k) {
  const yaw = VIEWS[view], h = hero(pose(name, k)), c = Math.cos(yaw), s = Math.sin(yaw), l = h.P._lantern;
  const lan = [CX + c * l[0] - s * l[1], s * l[0] + c * l[1], l[2]];
  const lights = [
    { p: lan, c: L('#d0cc78'), I: 3.6, r0: 24, R: 95, pad: 3.6, soft: 5 },
    { p: [CX + 30, -60, 75], c: L('#8098a2'), I: 9, r0: 90, R: 260, soft: 10 }, // the cold rim from behind
    { p: [CX - 70, 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
  ];
  const objects = [{ name: 'hero', pos: [CX, 0, 0], yaw, sdf: h.sdf, mat: h.mat, bounds: h.bounds, id: 1, step: 0.6 }];
  return { sc: { W: FW, H: FH, cam, off: -SOLE, objects, lights, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6) }, lamp: project(cam, ...lan, -SOLE) };
}

if (isMainThread) {
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const done = await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const all = new Map(done.flat().map((f) => [f.i, f]));
  const W = FW * COLS, H = FH * 3, rgba = new Uint8ClampedArray(W * H * 4), lamps = {};
  for (const [i, [view, name, k]] of CELLS.entries()) {
    const f = all.get(i), ox = (i % COLS) * FW, oy = Math.floor(i / COLS) * FH;
    for (let y = 0; y < FH; y++) rgba.set(f.px.subarray(y * FW * 4, (y + 1) * FW * 4), ((oy + y) * W + ox) * 4);
    lamps[`${view}-${name}${k}`] = { cell: i, lamp: f.lamp.map((v) => Math.round(v * 2) / 2) };
  }
  writePNG('src/grand-hero.png', rgba, W, H);
  // The game's frame names (Hero.show) onto the cells: dash: the run; throw: the slashes; cast: idle; bite: the slash.
  const frames = {};
  for (const view of Object.keys(VIEWS)) {
    const at = (n) => lamps[`${view}-${n}`];
    for (let k = 0; k < 4; k++) frames[`${view}-idle${k}`] = frames[`${view}-blink${k}`] = at(`idle${k >> 1}`);
    for (let k = 0; k < RUN; k++) frames[`${view}-run${k}`] = at(`run${k}`);
    for (let k = 0; k < 2; k++) { frames[`${view}-dash${k}`] = at(`run${k * 3 + 1}`); frames[`${view}-slash${k}`] = at(`slash${k}`); frames[`${view}-throw${k}`] = at(`slash${1 - k}`); }
    frames[`${view}-cast`] = at('idle0');
  }
  frames['side-bite'] = lamps['side-slash0'];
  writeFileSync('src/grand.data.ts', `// Generated by tools/art/grand-hero.gen.mjs: edit the model there, not this table.
// The torture room's hero sheet (src/grand-hero.png): FW x FH cells, ${COLS} per row; each game frame's cell and its
// lantern glass centre (sheet px, where dark.ts hangs his light). Soles on row ${SOLE}, centred on column ${CX}.
export const FW = ${FW}, FH = ${FH}, COLS = ${COLS}, SOLE = ${SOLE};
export const FRAMES: Record<string, { cell: number; lamp: [number, number] }> = ${JSON.stringify(frames)};
`);
  console.log(`src/grand-hero.png ${W}x${H}, ${CELLS.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N } = workerData, out = [];
  for (let i = w; i < CELLS.length; i += N) {
    const { sc, lamp } = scene(...CELLS[i]), img = render(sc);
    const px = post(img, { exposure: 3.2, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
    for (let p = 0; p < FW * FH; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
    out.push({ i, px, lamp });
  }
  parentPort.postMessage(out);
}
