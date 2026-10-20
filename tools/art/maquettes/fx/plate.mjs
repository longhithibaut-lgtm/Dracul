// Renders the floors and enemies under the FX mockups with the « grand pixel » mockup engine
// (tools/art/maquettes/grand): sheet panels (each its own patch of the crypt's floor, lit by the hero's lantern)
// and the crypt scene without its hero. The hero sprite and the effects are laid over by fx.py.
// Usage: node plate.mjs sheet|scene   (reads layout.json, writes plate-<what>.png and palette.json)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, renameSync } from 'node:fs';
const G = new URL('../grand/', import.meta.url).pathname;
const { render, post, writePNG, L, clamp, PALETTE } = await import(G + 'lib.mjs');
const { ghoul } = await import(G + 'cast.mjs');
const { kneeling } = await import('./kneel.mjs');
const E = await import(G + 'ecran.mjs');
const lay = JSON.parse((await import('node:fs')).readFileSync('layout.json', 'utf8'));
const { S, C } = lay;
const LANT = L('#d0cc78');

function panelScene(p) {
  const [x0, y0, W, H] = p.r, [wx, wy] = p.w, base = await_env;
  const objects = [], lights = [];
  const add = (name, m, pos, yaw) => objects.push({ name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, id: 70 + objects.length });
  (p.ghouls ?? []).forEach(([x, y, yaw, v, seed], i) => add('g' + i, ghoul(v, seed), [x - x0, (y - y0) / S, 0], yaw));
  (p.prey ?? []).forEach(([x, y, yaw, seed], i) => add('p' + i, kneeling(), [x - x0, (y - y0) / S, 0], yaw));
  const k = p.heroes.length > 1 ? 0.75 : 1;
  p.heroes.forEach(([cell, hx, hy], i) => {
    const [lx, ly] = p.lamps[i], Y = (hy - y0) / S + 1.5, z = ((hy - y0) - (ly - y0)) / C;
    lights.push({ name: 'lantern', p: [lx - x0, Y, z], c: LANT, I: (cell.includes('dash1') ? 2.5 : 5.5) * k, r0: 30, R: 260, pad: 3.6, soft: 6 });
    
  });
  lights.push({ name: 'night', p: [W * 0.6, (H * 0.8) / S, 150], c: L('#7a8a8e'), I: 0.6, r0: 200, R: 700, noShadow: true });
  if (objects.length) lights.push({ name: 'rim', p: [W * 0.7, -160, 140], c: L('#9aa8a4'), I: 2.2, r0: 400, R: 1200, soft: 10, only: objects.map((o) => o.name) });
  const env = (ox, oy, oz, vx, vy, vz) => { const r = base(ox + wx, oy + wy, oz, vx, vy, vz); r.P = [r.P[0] - wx, r.P[1] - wy, r.P[2]]; return r; };
  return { W, H, cam: CAM, off: 0, objects, lights, env, ambient: L('#22262a') };
}
let await_env, CAM;
async function baseScene() { const sc = await E.scene(); await_env = sc.env; CAM = sc.cam; return sc; }

function crypt(sc) {
  const s = lay.scene, objs = sc.objects.filter((o) => o.name !== 'hero' && !o.name.startsWith('ghoul'));
  s.ghouls.forEach(([x, y, yaw, v, seed], i) => { const m = ghoul(v, seed); objs.push({ name: 'ghoul' + i, pos: [x, y, 0], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, id: 70 + i }); });
  sc.objects.length = 0; sc.objects.push(...objs);
  const [lx, ly] = s.lamp, Y = 462 + 1.5;
  sc.lights[0].p = [lx, Y, (Y * S + 150 - ly) / C];
  return sc;
}

const what = isMainThread ? process.argv[2] : workerData.what;
if (isMainThread) {
  const t0 = Date.now(), NW = 4;
  const res = await Promise.all([...Array(NW)].map((_, k) => new Promise((ok, ko) => { const w = new Worker(new URL(import.meta.url), { workerData: { what, k, NW } }); w.on('message', ok); w.on('error', ko); })));
  const sc = await baseScene();
  const W = what === 'scene' ? 960 : lay.sheet.W, H = what === 'scene' ? 540 : lay.sheet.H;
  const img = { W, H, out: new Float32Array(W * H * 3), emis: new Float32Array(W * H), oid: new Int16Array(W * H).fill(-1) };
  for (const parts of res) for (const { x0, y0, w, h, out, emis, oid, rows } of parts) for (let y = 0; y < h; y++) {
    if (rows && y % rows[1] !== rows[0]) continue;
    for (let x = 0; x < w; x++) { const s = y * w + x, d = (y0 + y) * W + x0 + x;
      img.out[d * 3] = out[s * 3]; img.out[d * 3 + 1] = out[s * 3 + 1]; img.out[d * 3 + 2] = out[s * 3 + 2]; img.emis[d] = emis[s]; img.oid[d] = oid[s]; }
  }
  console.log('render', Date.now() - t0, 'ms');
  if (what === 'scene') { crypt(sc); await E.finish(img, sc); renameSync('ecran-native.png', 'plate-scene.png'); renameSync('ecran.png', 'plate-scene-x2.png'); }
  else {
    for (const p of lay.sheet.panels) { const [x0, y0, w, h] = p.r; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const vx = (x - w / 2) / (w / 2), vy = (y - h * 0.6) / (h / 2), k = clamp(1.1 - 0.45 * (vx * vx + vy * vy)), d = ((y0 + y) * W + x0 + x) * 3;
      img.out[d] *= k; img.out[d + 1] *= k; img.out[d + 2] *= k; } }
    const rgba = post(img, { exposure: 3.4, vignette: 0, desat: 0.18, grain: 0.012, dither: 0.02 });
    writePNG('plate-sheet.png', rgba, W, H, 1);
  }
  writeFileSync('palette.json', JSON.stringify(PALETTE.map((c) => c.map(Math.round))));
  // object masks (ghoul / prey pixels) so fx.py can tint the struck enemy
  writeFileSync(`oid-${what}.bin`, Buffer.from(img.oid.buffer));
} else {
  const { k, NW } = workerData, sc = await baseScene(), parts = [];
  if (what === 'scene') {
    crypt(sc); sc.rowN = NW; sc.rowK = k; const r = render(sc);
    parts.push({ x0: 0, y0: 0, w: 960, h: 540, out: r.out, emis: r.emis, oid: r.oid, rows: [k, NW] });
  } else lay.sheet.panels.forEach((p, i) => {
    if (i % NW !== k) return;
    const r = render(panelScene(p));
    parts.push({ x0: p.r[0], y0: p.r[1], w: p.r[2], h: p.r[3], out: r.out, emis: r.emis, oid: r.oid });
  });
  parentPort.postMessage(parts);
}
