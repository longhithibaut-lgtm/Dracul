// A screen of the necropolis itself (tools/art/rooms/necropolis.mjs, the zone the game bakes) with a few of the proposed
// foes in it and the hero, rendered as zone.gen.mjs renders a chunk (960 x 540 texels, its light, shafts and palette).
// From this folder: OUT=<dir> SCENE=1|2 node scene.mjs -> docs/maquettes/necropole-ennemis-scene-<n>.png (x2) and
// <OUT>/scene-<n>.png (native)
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import fs from 'fs';
import { render, haze, post, L } from '../hub3/lib.mjs';
import { setMat } from '../grand/lib.mjs';
import { MAT as FOE_MAT } from '../ennemis/lib.mjs';
import { posted } from '../../bake.mjs';
import { hero } from '../grand/hero.mjs';
import { wx, wy } from '../../rooms/common.mjs';
import * as Z from '../../rooms/necropolis.mjs';
import { FOES } from './foes.mjs';

const N = +(isMainThread ? process.env.SCENE ?? 1 : workerData.n), OUT = process.env.OUT || 'out';
const dir = new URL('.', import.meta.url).pathname, DEST = dir + '../../../../docs/maquettes/';
// per scene: the screen's top-left (room px), the hero, and the foes: card number, pose, room px, the room px it faces
const SCENES = {
  1: { at: [580, 690], hero: [760, 860], face: [880, 818], foes: [ // the near field of graves, by a brazier at a fork of the paths
    [9, 'tele', [880, 818], [760, 860]], [1, 'idle', [950, 880], [760, 860]], [2, 'idle', [850, 906], [760, 860]], [3, 'idle', [700, 904], [760, 860]], [4, 'idle', [656, 800], [760, 860]]] },
  2: { at: [1180, 1000], hero: [1300, 1170], face: [1460, 1170], foes: [ // the bridge over the chasm
    [7, 'tele', [1420, 1152], [1420, 1300]], [15, 'tele', [1466, 1172], [1300, 1170]], [11, 'tele', [1556, 1120], [1300, 1170]]] },
};
const S = SCENES[N], X0 = 2 * S.at[0], Y0 = 2 * S.at[1], W = 960, H = 540;
const sc = await Z.scene();
const toward = (p, t) => Math.atan2(-(t[0] - p[0]), t[1] - p[1]);
const P = ([x, y]) => [wx(x), wy(y), 0];
// the foes' models are built on ../ennemis/lib.mjs: their material id goes to the binding this renderer reads
const bridge = (m) => ({ ...m, sdf: (x, y, z) => { const d = m.sdf(x, y, z); setMat(FOE_MAT); return d; } });
const objects = [...sc.objects], lights = [...sc.lights], cast = [];
const add = (name, m, pos, yaw, id) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step || 0.6, noShadow: m.noShadow, noSelfAO: m.noSelfAO, id }; objects.push(o); cast.push(name); return o; };
const hz = hero('idle'), hp = P(S.hero), hy = toward(hp, P(S.face));
add('hero', hz, hp, hy, 60);
{ const l = hz.P._lantern, c = Math.cos(hy), s = Math.sin(hy); lights.push({ name: 'lantern', p: [hp[0] + c * l[0] - s * l[1], hp[1] + s * l[0] + c * l[1], l[2]], c: L('#d0cc78'), I: 5, r0: 40, R: 280, pad: 3.6, soft: 6, haze: 0.01, hazeR: 4 }); }
S.foes.forEach(([n, pose, at, face], i) => {
  const m = FOES[n - 1].fn(pose), p = P(at), yaw = toward(p, P(face)), tag = 'foe' + i;
  add(tag, bridge(m), p, yaw, 70);
  for (const s of m.subs || []) add(tag + s.name, bridge(s.model), p, yaw, 71);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const l of m.lights || []) lights.push({ soft: 5, R: 200, ...l, p: [p[0] + c * l.p[0] - sn * l.p[1], p[1] + sn * l.p[0] + c * l.p[1], l.p[2]] });
});
// what the game's own light gives its sprites: a cold edge so they read against the dark
lights.push({ name: 'rim', p: [X0 + W * 0.6, wy(S.at[1] - 160), 260], c: L('#8a9aa4'), I: 2.4, r0: 400, R: 1600, soft: 10, only: cast });
const scene = { ...sc, objects, lights };

/** The scene as the texels x0..x0+w, y0..y0+h see it (zone.gen.mjs region()). */
function region(x0, y0, w, h) {
  const M = 440, SN = sc.cam.s, CS = sc.cam.c, bx = [x0 - M, y0 / SN - M], by = [x0 + w + M, (y0 + h + 460 * CS) / SN + M];
  for (const o of scene.objects) { if (o.box) continue; const [a0, b0, c0, a1, b1, c1] = o.bounds, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), mn = [1e9, 1e9], mx = [-1e9, -1e9];
    for (const X of [a0, a1]) for (const Y of [b0, b1]) { const p = [o.pos[0] + c * X - s * Y, o.pos[1] + s * X + c * Y]; for (let k = 0; k < 2; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } } o.box = [mn, mx]; }
  const near = ([mn, mx]) => mn[0] < by[0] && mx[0] > bx[0] && mn[1] < by[1] && mx[1] > bx[1];
  return { ...scene, W: w, H: h, offX: x0, off: y0, objects: scene.objects.filter((o) => o.ghost || near(o.box)),
    lights: scene.lights.filter((l) => l.R > 1e6 || Math.max(bx[0] - l.p[0], 0, l.p[0] - by[0]) ** 2 + Math.max(bx[1] - l.p[1], 0, l.p[1] - by[1]) ** 2 < (l.R + 40) ** 2) };
}

if (!isMainThread) {
  const { k, NW } = workerData; const r = posted(render({ ...region(X0, Y0, W, H), rowN: NW, rowK: k }));
  parentPort.postMessage(r, Object.values(r).map((a) => a.buffer));
} else {
  const NW = availableParallelism(), t0 = Date.now();
  const parts = await Promise.all([...Array(NW)].map((_, k) => new Promise((res, rej) => { const w = new Worker(new URL(import.meta.url), { workerData: { k, NW, n: N } }); w.on('message', res); w.on('error', rej); })));
  const SIZE = { out: 3, alb: 3, emi: 3, depth: 1, nrm: 3, sun: 1 }, img = Object.fromEntries(Object.keys(SIZE).map((k) => [k, new Float32Array(SIZE[k] * W * H)]));
  for (let y = 0; y < H; y++) { const p = parts[y % NW], a = y * W, b = a + W; for (const k in SIZE) img[k].set(p[k].subarray(a * SIZE[k], b * SIZE[k]), a * SIZE[k]); }
  console.log('render', Date.now() - t0, 'ms');
  Z.finish(img, X0, Y0);
  const hzi = { W, H, out: new Float32Array(3 * W * H) }; haze(hzi, region(X0, Y0, W, H));
  const rgba = post({ ...img, W, H, out: img.out.map((v, k) => v + hzi.out[k]), emis: img.emi.filter((_, k) => k % 3 === 0).map((v, k) => v + img.emi[k * 3 + 1] + img.emi[k * 3 + 2]) }, { ...Z.POST, palette: Z.PAL });
  const { writePNG } = await import('../ennemis/lib.mjs');
  fs.mkdirSync(OUT, { recursive: true });
  writePNG(`${OUT}/scene-${N}.png`, rgba, W, H, 1); writePNG(`${DEST}necropole-ennemis-scene-${N}.png`, rgba, W, H, 2);
}
