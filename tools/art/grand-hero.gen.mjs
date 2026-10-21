// The torture room's hero at full detail (« grand pixel » trial, docs/decisions.md): the validated mockup's 3D vampire
// (tools/art/grand/hero.mjs) posed per frame, lit by his lantern, a cold back rim and a faint warm fill with real
// shadows and ambient occlusion (tools/art/grand/lib.mjs), then the mockup's post (filmic, desaturated, light dither,
// snapped onto its 67 colours). One model unit is one pixel at 960x540: he stands ~80 px tall; the game draws the
// sheet at half scale on its x2 view of that room (dark.ts). Views down / up / side (side faces right, the game
// mirrors it): idle 2 frames (breathing, the lantern swaying), run 8, then each action's steps (ACTS: the three claw
// strikes, the mist, the throw, the glyph, the bite, the flinch), posed from a few numbers each by rig().
// Writes src/grand-hero.png (two rows per view) and src/grand.data.ts. Usage: node tools/art/grand-hero.gen.mjs (~30 s
// on 4 cores); ONLY=claw0,bite renders just those actions to shots/grand-preview.png (x3, on grey), to try a pose.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, writePNG, project, L, h2 } from './grand/lib.mjs';
import { hero, POSES } from './grand/hero.mjs';

const FW = 120, FH = 120, CX = FW / 2, SOLE = 102; // soles' contact line (sheet rows), the body's centre column
const VIEWS = { down: 0, up: Math.PI, side: -Math.PI / 2 }; // yaw: the model looks down +y, toward the camera
const RUN = 8, STEP = 17; // run frames; how far each ankle reaches ahead of and behind the hips (model units)
const cam = camera(38 * Math.PI / 180);

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const sc = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nz = (a) => sc(a, 1 / (Math.hypot(...a) || 1));
const rotX = (q, a) => [q[0], q[1] * Math.cos(a) + q[2] * Math.sin(a), q[2] * Math.cos(a) - q[1] * Math.sin(a)]; // a > 0 tips what is above forward
const rotZ = (q, a) => [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a), q[2]]; // a > 0 turns the chest to his right
// Rotates p about o in the y-z plane (a > 0 swings what hangs below o forward).
const swing = (p, o, a) => { const y = p[1] - o[1], z = p[2] - o[2]; return [p[0], o[1] + y * Math.cos(a) - z * Math.sin(a), o[2] + y * Math.sin(a) + z * Math.cos(a)]; };
// Two-bone IK: [the middle joint, the end] from root R toward target T, bent toward `pole`; out of reach, the limb
// points straight at T (a leg warns: its foot leaves the floor).
function ik(R, T, L1, L2, pole, what) {
  let d = sub(T, R), n = Math.hypot(...d);
  if (n > L1 + L2 - 0.3) {
    if (n > L1 + L2 + 1 && isMainThread && what.endsWith('leg')) console.warn(`${what}: out of reach by ${(n - L1 - L2).toFixed(1)}`);
    d = sc(d, (L1 + L2 - 0.3) / n);
    n = L1 + L2 - 0.3;
  }
  const u = sc(d, 1 / n), a = (L1 * L1 - L2 * L2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  return [add(R, add(sc(u, a), sc(nz(sub(pole, sc(u, dot(pole, u)))), h))), add(R, d)];
}

const I = POSES.idle;
// A pose from a few numbers: the idle torso tipped forward by `lean` about the hips, turned by `turn`, lowered by `drop`
// and moved by `at`; each hand put at a point (r / l: [wrist, elbow pole, hand direction]), else carried as at idle;
// ankles at `feet` ([x, y, lift, toe pitch], right then left), else idle's; the coat's flare, swing back and sideways.
// A step may override any of these for one view (`up: {...}`).
function rig(o, what) {
  const p0 = I.pelvis, pel = add(p0, [...(o.at ?? [0, 0]), -(o.drop ?? 0)]);
  const tf = (p) => add(pel, rotZ(rotX(sub(p, p0), o.lean ?? 0), o.turn ?? 0));
  const P = {
    ...I, tilt: o.tilt ?? I.tilt, pelvis: pel, head: add(tf(I.head), o.head ?? [0, 0, 0]), neck: tf(I.neck), chest: tf(I.chest), Sr: tf(I.Sr), Sl: tf(I.Sl),
    coatFlare: o.flare ?? 0, coatBack: o.back ?? 0, coatSide: o.side ?? 0, curl: o.curl ?? I.curl, spread: o.spread ?? I.spread, lanSway: o.sway ?? [0, 0],
  };
  const arm = (S, [W, pole, hand], s) => { const [E, w] = ik(S, W, 18.1, 15.2, pole, `${what} ${s} arm`); return [E, w, add(w, sc(nz(hand), 4.3))]; };
  [P.Er, P.Wr, P.Kr_] = o.r ? arm(P.Sr, o.r, 'right') : [tf(I.Er), tf(I.Wr), tf(I.Kr_)];
  [P.El, P.Wl, P.Kl_] = o.l ? arm(P.Sl, o.l, 'left') : [tf(I.El), tf(I.Wl), tf(I.Kl_)];
  for (const [s, x, f] of [['r', -1, o.feet?.[0]], ['l', 1, o.feet?.[1]]]) {
    const [fx, fy, lift = 0, p = 0] = f ?? [x * 4, -0.6], A = [fx, fy, 5 + lift], H = add(pel, rotZ([x * 3.5, 0, -1.5], (o.turn ?? 0) * 0.5));
    const ty = 6.8 * Math.cos(p) + 3.8 * Math.sin(p), tz = 6.8 * Math.sin(p) - 3.8 * Math.cos(p);
    Object.assign(P, { [`H${s}`]: H, [`K${s}`]: ik(H, A, 22.6, 22.5, [x * 0.15, 1, 0], `${what} ${s} leg`)[0],[`A${s}`]: A, [`T${s}`]: [A[0] + x * 0.8, A[1] + ty, Math.max(1.2, A[2] + tz)] });
  }
  return P;
}

// The fighting stance: right foot ahead. The claw arm is his right; the lantern stays in his left hand.
const ST = [[-5, 6], [5, -6]], LUNGE = [[-5, 22], [5, -14, 1, -0.5]];
const ACTS = {
  // The combo, three strikes of four steps each (anticipation, strike, follow-through, recovery: Hero.show's timing).
  // 1: a rake from high on his right down across to his left.
  claw0: [
    { turn: 0.45, lean: 0.05, feet: ST, r: [[-15, -8, 96], [-1, -0.6, 0], [-0.2, 0.3, 1]], curl: 0.4, spread: 1.4 },
    { turn: -0.2, lean: 0.25, drop: 2, feet: ST, r: [[-4, 28, 66], [-1, 0, -0.4], [0.4, 1, -0.5]], spread: 1.9, curl: 0, flare: 0.3 },
    { turn: -0.5, lean: 0.3, drop: 3, feet: ST, r: [[14, 19, 46], [-0.4, 0.4, -1], [0.7, 0.4, -0.7]], spread: 1.9, curl: 0, flare: 0.4, side: 0.2 },
    { turn: -0.2, lean: 0.15, drop: 1.5, feet: ST, r: [[-7, 14, 52], [-1, 0, -0.5], [0, 0.6, -1]], spread: 1.2 },
  ],
  // 2: the backhand, from his left shoulder out to his right.
  claw1: [
    { turn: -0.45, lean: 0.1, feet: ST, r: [[8, 10, 74], [-0.2, 0.6, -1], [1, 0.2, 0.3]], curl: 0.6 },
    { turn: 0.15, lean: 0.25, drop: 2, feet: ST, r: [[-17, 25, 70], [0, 0, -1], [-0.7, 0.7, 0]], spread: 1.9, curl: 0, flare: 0.3 },
    { turn: 0.45, lean: 0.2, drop: 2, feet: ST, r: [[-28, 4, 70], [0, -0.3, -1], [-1, -0.3, 0.1]], spread: 1.9, curl: 0, flare: 0.4, side: -0.2 },
    { turn: 0.2, lean: 0.15, drop: 1, feet: ST, r: [[-16, 8, 56], [-0.3, 0, -1], [-0.3, 0.6, -1]] },
  ],
  // 3, the finisher: he rears up, claws high, and lunges into a tear down to the floor, the lantern flung back.
  claw2: [
    { lean: -0.12, turn: 0.15, feet: ST, r: [[-7, -4, 108], [-1, -0.5, 0.3], [0, -0.3, 1]], l: [[16, 10, 66], [1, -0.3, -0.3], [0.3, 0.5, -1]], curl: 0.8, tilt: -0.15 },
    { lean: 0.55, drop: 8, at: [0, 6], turn: -0.1, feet: LUNGE, r: [[-13, 38, 30], [-1, 0.3, -0.2], [-0.2, 0.4, -1]], l: [[20, -4, 50], [1, 0, 0], [0.3, -0.5, -1]], spread: 2, curl: 0, flare: 1, back: 1, tilt: 0.25 },
    { lean: 0.65, drop: 10, at: [0, 7], turn: -0.1, feet: LUNGE, r: [[-12, 34, 13], [-1, 0.3, 0], [-0.2, 0.3, -1]], l: [[21, -6, 48], [1, 0, 0], [0.3, -0.5, -1]], spread: 2, curl: 0.2, flare: 1, back: 0.8, tilt: 0.3 },
    { lean: 0.4, drop: 6, at: [0, 5], feet: LUNGE, r: [[-7, 28, 34], [-1, 0.2, -0.3], [0, 0.4, -1]], spread: 1.4, flare: 0.6, back: 0.6, tilt: 0.15 },
  ],
  // The mist: leaning hard into the dash, arms and coat streaming back (mist() then dissolves him).
  dash: [
    { lean: 0.5, drop: 5, at: [0, 4], feet: [[-4, 16, 2], [4, -16, 6, -0.6]], r: [[-12, -16, 50], [-1, 0, 0], [0, -1, -0.3]], l: [[12, -16, 52], [1, 0, 0], [0, -1, -0.5]], back: 1, flare: 0.8, tilt: 0.1 },
    { lean: 0.6, drop: 6, at: [0, 6], feet: [[-4, 10, 8], [4, -20, 10, -0.8]], r: [[-12, -20, 52], [-1, 0, 0], [0, -1, 0]], l: [[12, -20, 54], [1, 0, 0], [0, -1, -0.3]], back: 1, flare: 1, tilt: 0.15 },
  ],
  // Le Tir: the hand cocked by the ear, flicked out ahead, following through.
  throw: [
    { turn: 0.4, lean: -0.05, feet: ST, r: [[-12, -8, 86], [-1, -0.3, -0.5], [0.2, 0.6, 0.6]], curl: 0.9 },
    { turn: -0.25, lean: 0.15, drop: 1, feet: ST, r: [[-5, 32, 76], [-0.5, 0, -1], [0, 1, -0.1]], curl: 0, spread: 1.9 },
    { turn: -0.35, lean: 0.2, drop: 1, feet: ST, r: [[0, 27, 60], [-0.5, 0, -1], [0.2, 0.8, -0.6]], curl: 0.2, spread: 1.5 },
  ],
  // The glyph: he drops into a crouch and presses his palm to the floor, then looks up at it.
  cast: [
    { lean: 0.35, drop: 12, feet: [[-6, 6], [6, -4]], r: [[-7, 24, 34], [-1, 0, 0], [0, 0.5, -1]], tilt: 0.2, flare: 0.3 },
    // A squat, bowed to put the palm down; from behind, upright (bowing away rises on screen and reads standing).
    { up: { lean: 0.35, drop: 33 }, lean: 0.85, drop: 30, feet: [[-10, 8], [10, -6]], r: [[-8, 28, 4], [-1, 0, 0.5], [0, 1, -0.15]], l: [[16, 16, 15], [1, 0, 0], [0, 0.5, -1]], spread: 2, curl: 0, tilt: 0.3, flare: 0.8 },
    { up: { lean: 0.35, drop: 33 }, lean: 0.85, drop: 30, feet: [[-10, 8], [10, -6]], r: [[-8, 28, 4], [-1, 0, 0.5], [0, 1, -0.15]], l: [[16, 16, 15], [1, 0, 0], [0, 0.5, -1]], spread: 2, curl: 0, tilt: -0.45, head: [0, 0, 1.5], flare: 0.8 },
  ],
  // The bite: the lunge, then latched, head down at the throat, claws gripping, the lantern held out of the way.
  bite: [
    { lean: 0.45, drop: 5, at: [0, 5], feet: [[-5, 18], [5, -12, 0, -0.4]], r: [[-6, 30, 72], [-1, 0, -0.3], [0, 1, 0]], l: [[24, -6, 64], [1, -0.2, -0.4], [0.4, 0, -1]], head: [0, 2, 0], tilt: 0.3, flare: 0.5, back: 0.6, spread: 1.9, curl: 0.2 },
    { lean: 0.55, drop: 7, at: [0, 6], feet: [[-5, 18], [5, -12, 0, -0.4]], r: [[-7, 26, 70], [-1, 0, -0.5], [0.3, 1, 0]], l: [[26, 4, 62], [1, -0.2, -0.4], [0.4, 0, -1]], head: [0, 3, -1], tilt: 0.65, flare: 0.4, back: 0.4, curl: 1.2 },
  ],
  // Hit: a flinch behind a raised forearm, then knocked back a step.
  hurt: [
    { lean: -0.18, drop: 1, turn: 0.2, head: [0, -2, 0], tilt: -0.35, feet: [[-4, 2], [4, -5]], r: [[-6, 12, 86], [-1, 0.3, -0.6], [0.3, 0.2, 1]], l: [[16, -4, 56], [1, 0, 0], [0.3, 0, -1]], curl: 1.2 },
    { lean: -0.3, drop: 3, at: [0, -3], turn: 0.3, head: [0, -3, -0.5], tilt: -0.45, feet: [[-4, 4], [4, -10]], r: [[-20, -4, 66], [-1, 0, 0], [-0.6, -0.2, 0.6]], l: [[20, -8, 60], [1, 0, 0], [0.5, -0.2, -0.8]], back: -0.3, flare: 0.3, spread: 1.9, curl: 0 },
  ],
};

function pose(name, k, view) {
  if (name === 'idle') { // breathing: the chest and shoulders rise, the lantern sways
    const up = k ? 0.6 : 0, u = (p) => add(p, [0, 0, up]);
    return { ...I, head: u(I.head), neck: u(I.neck), chest: add(I.chest, [0, 0.3 * k, up]), Sr: u(I.Sr), Sl: u(I.Sl), Er: u(I.Er), El: u(I.El), Wr: u(I.Wr), Wl: u(I.Wl), Kr_: u(I.Kr_), Kl_: u(I.Kl_), lanSway: k ? [0.6, -0.8] : [-0.3, 0.4] };
  }
  if (name !== 'run') return rig({ ...ACTS[name][k], ...ACTS[name][k][view] }, `${name}-${k}`);
  // run k of RUN: a heavy stalking stride, long steps, the body sinking onto each foot as it lands, leaning in, the claw
  // arm against the legs, the lantern lagging, the coat flaring behind and swinging with the hips.
  const ph = (2 * Math.PI * k) / RUN, bob = 1.5 * Math.cos(2 * ph) - 1.0;
  const feet = [1, -1].map((s, i) => {
    const f = s * Math.sin(ph), lift = 8 * Math.max(0, s * Math.cos(ph)) ** 1.5;
    return [(i ? 1 : -1) * 4, -0.6 + STEP * f, lift, lift > 0.5 ? (f < 0 ? -0.75 : 0.25) : 0];
  });
  const P = rig({ lean: 0.11, drop: 2.5 - bob, feet, back: 0.35, flare: 0.3, side: 0.25 * Math.sin(ph), tilt: 0.08 }, `run${k}`);
  const ar = -0.55 * Math.sin(ph), al = 0.12 * Math.sin(ph);
  Object.assign(P, { Er: swing(P.Er, P.Sr, ar), Wr: swing(P.Wr, P.Sr, ar), Kr_: swing(P.Kr_, P.Sr, ar), El: swing(P.El, P.Sl, al), Wl: swing(P.Wl, P.Sl, al), Kl_: swing(P.Kl_, P.Sl, al), lanSway: [0, -2.2 * Math.cos(ph)] });
  return P;
}

// The dash's dissolve, on the rendered cell: the body breaks into clotted blood vapour from the feet and its trailing
// side (tx, ty: the trail's way on the sheet), in ragged 2x2 clumps, and wisps stream off the trailing edge.
function mist(px, amount, tx, ty) {
  const light = [0x5a, 0x0a, 0x10], dark = [0x3e, 0x06, 0x0b], far = [0x26, 0x04, 0x07]; // clotted blood vapour (fx-blood.ts, mockup « A. Sang »)
  let x0 = FW, x1 = 0, y0 = FH, y1 = 0;
  for (let i = 0; i < FW * FH; i++) if (px[i * 4 + 3]) { const x = i % FW, y = (i / FW) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 + 1, hh = (y1 - y0) / 2 + 1, at = (x, y) => (y * FW + x) * 4;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y);
    if (!px[i + 3]) continue;
    const a = amount + ((y - cy) / hh) * 0.35 + ((tx * (x - cx)) / hw + (ty * (y - cy)) / hh) * 0.45 + (h2(x >> 1, y >> 1, 7) - 0.5) * 0.55;
    if (a > 0.95) px[i + 3] = 0;
    else if (a > 0.55) px.set([...(px[i] + px[i + 1] + px[i + 2] > 150 ? light : dark), 200], i);
  }
  const lines = tx ? FH : FW, along = tx ? FW : FH;
  for (let l = 0; l < lines; l++) {
    if (h2(l >> 1, 3, 5) < 0.45) continue;
    const pos = (k) => { const v = (tx || ty) < 0 ? k : along - 1 - k; return tx ? at(v, l) : at(l, v); };
    let k = 0;
    while (k < along && !px[pos(k) + 3]) k++;
    if (k === along) continue;
    const len = Math.min(k, Math.floor(amount * (6 + h2(l >> 1, 9, 5) * 22)));
    for (let j = 1; j <= len; j++) px.set([...(j < 4 ? dark : far), Math.max(0, 190 - j * 9)], pos(k - j));
  }
}

// Every cell of the sheet, a row per view: idle 0-1, run 0-7, then each action's steps.
const ONLY = process.env.ONLY?.split(',');
const NAMES = [['idle', 2], ['run', RUN], ...Object.entries(ACTS).map(([n, a]) => [n, a.length])].filter(([n]) => !ONLY || ONLY.includes(n));
const CELLS = Object.keys(VIEWS).flatMap((view) => NAMES.flatMap(([name, n]) => Array.from({ length: n }, (_, k) => [view, name, k])));
const COLS = Math.ceil(CELLS.length / 6); // two rows per view: the sheet stays under 4096 px wide

function scene(view, name, k) {
  const yaw = VIEWS[view], h = hero(pose(name, k, view)), c = Math.cos(yaw), s = Math.sin(yaw), l = h.P._lantern;
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
  for (const [view, name, k] of CELLS) pose(name, k, view); // warns of a hand or foot out of reach
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const done = await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const all = new Map(done.flat().map((f) => [f.i, f]));
  const W = FW * COLS, H = FH * Math.ceil(CELLS.length / COLS), rgba = new Uint8ClampedArray(W * H * 4), frames = {};
  for (const [i, [view, name, k]] of CELLS.entries()) {
    const f = all.get(i), ox = (i % COLS) * FW, oy = Math.floor(i / COLS) * FH, at = { cell: i, lamp: f.lamp.map((v) => Math.round(v * 2) / 2) };
    for (let y = 0; y < FH; y++) rgba.set(f.px.subarray(y * FW * 4, (y + 1) * FW * 4), ((oy + y) * W + ox) * 4);
    // The game's frame names (Hero.show): idle and blink 0-3 on the two breaths, run0-7, dash0-1, the steps of the
    // others as <action>-<step>.
    if (name === 'idle') for (const n of [`idle${2 * k}`, `idle${2 * k + 1}`, `blink${2 * k}`, `blink${2 * k + 1}`]) frames[`${view}-${n}`] = at;
    else frames[`${view}-${name}${name === 'run' || name === 'dash' ? '' : '-'}${k}`] = at;
  }
  if (ONLY) { // on grey, to see the silhouettes
    for (let p = 0; p < W * H; p++) if (!rgba[p * 4 + 3]) rgba.set([70, 70, 74, 255], p * 4);
    writePNG('shots/grand-preview.png', rgba, W, H, 3);
    console.log(`shots/grand-preview.png: ${ONLY} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  writePNG('src/grand-hero.png', rgba, W, H);
  // Native px he walks per run cycle in each view, the planted foot's travel on screen: Hero.show turns the run frames
  // by the distance walked, so his feet hold the floor at any speed (up and down the screen, the floor is foreshortened).
  const stride = { side: 4 * STEP * 0.5, down: 4 * STEP * 0.5 * cam.s, up: 4 * STEP * 0.5 * cam.s };
  writeFileSync('src/grand.data.ts', `// Generated by tools/art/grand-hero.gen.mjs: edit the model there, not this table.
// The hero's sheet (src/grand-hero.png): FW x FH cells, ${COLS} per row; each game frame's cell and its
// lantern glass centre (sheet px, where dark.ts hangs his light). Soles on row ${SOLE}, centred on column ${CX}.
// STRIDE: native px walked per run cycle, per view.
export const FW = ${FW}, FH = ${FH}, COLS = ${COLS}, SOLE = ${SOLE};
export const STRIDE: Record<string, number> = ${JSON.stringify(Object.fromEntries(Object.entries(stride).map(([v, d]) => [v, Math.round(d * 10) / 10])))};
export const FRAMES: Record<string, { cell: number; lamp: [number, number] }> = ${JSON.stringify(frames)};
`);
  console.log(`src/grand-hero.png ${W}x${H}, ${CELLS.length} cells, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N } = workerData, out = [];
  for (let i = w; i < CELLS.length; i += N) {
    const [view, name, k] = CELLS[i], { sc, lamp } = scene(view, name, k), img = render(sc);
    const px = post(img, { exposure: 3.2, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
    for (let p = 0; p < FW * FH; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
    // The trail streams away from where he goes: left of the side view (he faces right), up the screen facing down.
    if (name === 'dash') mist(px, [0.3, 0.75][k], view === 'side' ? -1 : 0, { side: 0, down: -1, up: 1 }[view]);
    out.push({ i, px, lamp });
  }
  parentPort.postMessage(out);
}
