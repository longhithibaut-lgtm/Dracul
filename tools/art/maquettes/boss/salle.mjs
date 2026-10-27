// « La prison de Vesna »: a small catacomb chamber (ossuary wall, alcove with her reliquary-cage, pools of black water,
// bone heaps, rat nests) with one boss concept facing the hero, at game scale (480x270 native, the hero ~80 px).
// From this folder: OUT=<dir> BOSS=n node ../ennemis/run.mjs ../boss/salle.mjs -> <OUT>/sNN.png, sNN-x2.png
import fs from 'fs';
import { camera, post, haze, writePNG, L, clamp, h2, vn, fbm, mix, mul } from '../ennemis/lib.mjs';
import { hero } from '../ennemis/hero.mjs';
import { place } from '../ennemis/fx.mjs';
import { pillar, sconce, skull } from '../ennemis/cast.mjs';
import { BOSSES, vesnaCage, bonePile, ratNest } from './bosses.mjs';

const N = +(process.env.BOSS ?? 1), OUT = process.env.OUT || 'out';
const W = 480, H = 270, cam = camera(38 * Math.PI / 180), off = -95, { s: SN, c: CS } = cam;
// per concept: the boss's pose and place, the hero's place, the cage's x
const CFG = {
  1: { pose: 'tele', B: [318, 176], hero: [150, 214], cage: 200, turn: 0.5 },
  2: { pose: 'idle', B: [292, 140], hero: [304, 236], cage: 176, yaw: 0.52 },
  3: { pose: 'idle', B: [318, 148], hero: [136, 222], cage: 168 },
}[N];
const AL = { x0: CFG.cage - 50, x1: CFG.cage + 50, D: 22, top: 112 }; // the alcove: recess depth D, arch top
const C = { mortar: L('#0c0a08'), stA: L('#3e382e'), stB: L('#4a4236'), grime: L('#17140f'), moss: L('#2e3820'), bone: L('#a89c7e'), boneD: L('#5e5440'), wall: L('#2e2a22'), bloodD: L('#2e0406') };

function floorAt(x, y) {
  const CW = 30, CHh = 22, gx = Math.floor(x / CW), gy = Math.floor(y / CHh); let f1 = 1e9, f2 = 1e9, id = 0, ddx = 0, ddy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = (gx + i) * CW + 5 + h2(gx + i, gy + j, 71) * (CW - 10), cy = (gy + j) * CHh + 4 + h2(gx + i, gy + j, 72) * (CHh - 8); const d = Math.hypot((x - cx) / CW, (y - cy) / CHh) * 26; if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + gy + j; ddx = (x - cx) / CW; ddy = (y - cy) / CHh; } else if (d < f2) f2 = d; }
  let c = mul(mix(C.stA, C.stB, h2(id, 0, 73)), 0.65 + 0.4 * h2(id, 1, 75)), N = [0, 0, 1];
  if (f2 - f1 < 1.1) c = C.mortar; else { const bev = clamp(1 - (f2 - f1 - 1.1) / 2); const l = Math.hypot(ddx, ddy) || 1; N = [ddx / l * bev * 0.6, ddy / l * bev * 0.6, 1]; }
  c = mix(c, C.grime, clamp((fbm(x / 9, y / 9, 3, 9) - 0.42) * 2.2) * 0.85);
  c = mix(c, C.moss, clamp((fbm(x / 30, y / 20, 3, 33) - 0.55) * 3) * 0.6 * clamp(1 - y / 120));
  const wet = clamp((fbm(x / 34, y / 26, 3, 5) - 0.48) * 4);
  if (vn(x / 3, y / 3, 13) > 0.82 && vn(x / 40, y / 40, 14) > 0.5) c = mul(c, 0.45);
  // bone splinters and droppings
  { const cx = Math.floor(x / 5), cy = Math.floor(y / 5), r = h2(cx, cy, 300); if (r < 0.03) { const a = h2(cx, cy, 301) * 3.14, lx = x - cx * 5 - 2.5, ly = y - cy * 5 - 2.5; const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.55 && Math.abs(u) < 2.2) { c = r < 0.012 ? C.bone : C.mortar; N = [0, 0, 1]; } } }
  return { alb: c, N, spec: 0.05 + 0.6 * clamp(wet), gloss: 12 + 70 * clamp(wet) };
}
// ossuary wall: rows of skulls between courses of long bones, an arch of stone round the alcove
function wallAt(x, z) {
  const ax = (AL.x0 + AL.x1) / 2, ar = (AL.x1 - AL.x0) / 2 + 9, archZ = AL.top - ar * 0.55;
  const rim = Math.hypot((x - ax) / 1, (Math.max(z, archZ) - archZ) / 0.55);
  if (rim < ar && rim > ar - 9 && z > 0) { const v = (ar - rim) / 9; const k = Math.floor(Math.atan2(z - archZ, x - ax) * 7); let c = mul(mix(C.stA, C.wall, h2(k, 1, 5)), 0.8); if (Math.abs(((Math.atan2(z - archZ, x - ax) * 7) % 1 + 1) % 1 - 0.5) > 0.45) c = C.mortar; return { alb: mix(c, C.grime, fbm(x / 6, z / 6, 3, 2) * 0.6), N: [0, 1, (v - 0.5) * 0.6], spec: 0.04 }; }
  const pier = Math.abs(((x - (AL.x0 + AL.x1) / 2 + 2000) % 150) - 75); // stone piers every 150, one bay round the alcove
  if (pier > 66 && z > 0) { const v = (pier - 66) / 9, k = Math.floor(z / 14 + (Math.floor((x + 2000) / 150) & 1) * 0.5); let c = mul(mix(C.stA, C.wall, h2(k, 2, 7)), 0.7 + 0.2 * h2(k, 3, 7)); if (((z / 14) % 1 + 1) % 1 < 0.08) c = C.mortar; return { alb: mix(c, C.grime, clamp(fbm(x / 6, z / 6, 3, 4) - 0.3) * 0.8 + clamp(1 - z / 25) * 0.5), N: [0, 1, 0], spec: 0.04 }; }
  const band = Math.floor(z / 11), lz = z - band * 11;
  let c, N = [0, 1, 0], spec = 0.12, gloss = 25;
  if (z > 96) { c = mul(C.wall, 0.8 + 0.3 * vn(x / 7, z / 7, 3)); N = [0, 1, 0]; spec = 0.03; }
  else if (band % 2 === 0) { // skulls, packed unevenly; a few missing
    const off2 = (band * 4.5) % 9, id = Math.floor((x + off2) / 9) * 31 + band, rr = 3.6 + h2(id, 5, 9) * 1.1;
    const u = ((x + off2) % 9 + 9) % 9 - 4.5 + (h2(id, 6, 9) - 0.5) * 1.2, v = lz - 5.5 + (h2(id, 7, 9) - 0.5) * 2, d = Math.hypot(u, v * 1.05);
    if (d < rr && h2(id, 8, 9) > 0.08) { const nz = Math.sqrt(Math.max(0, rr * rr - d * d)); N = [u / rr, nz / rr, -v / rr]; c = mix(C.bone, C.boneD, h2(id, 2, 9) * 0.8 + fbm(x / 3, z / 3, 2, id) * 0.4);
      const ex = (h2(id, 3, 9) - 0.5) * 1.4;
      for (const s of [-1, 1]) if (Math.hypot(u - s * 1.5 - ex, v + 0.6) < 1.1) { c = mul(C.mortar, 0.6); N = [0, 1, 0]; }
      if (Math.abs(u - ex) < 0.5 && v > 0.6 && v < 2) c = mul(C.mortar, 0.7);
      if (v > rr - 1.6 && Math.abs(u - ex) < 2.2 && ((u + 10) % 0.9) < 0.35) c = C.mortar; }
    else c = mul(C.mortar, 0.6);
  } else { // long bones laid crosswise, knobbed ends
    const id = Math.floor(x / 15 + band * 0.37), lx = x / 15 + band * 0.37 - id, v = lz - 5.5 + (h2(id, band, 3) - 0.5) * 2;
    const r = 3.1 + (lx < 0.15 || lx > 0.85 ? 1.3 : 0);
    if (Math.abs(v) < r && lx > 0.03 && lx < 0.97) { N = [0, Math.sqrt(1 - (v / r) ** 2), -v / r]; c = mix(C.bone, C.boneD, 0.35 + h2(id, band, 4) * 0.5); }
    else c = mul(C.mortar, 0.7);
  }
  c = mix(c, C.grime, clamp((vn(x / 8, z / 50, 2) - 0.35) * 2) * 0.75); // damp streaks
  c = mix(c, C.grime, clamp(1 - z / 25) * 0.6);
  c = mul(c, 0.72 * clamp(1.1 - z / 140));
  return { alb: c, N, spec, gloss };
}
function env(ox, oy, oz) {
  const tw = oy / CS, zw = oz - SN * tw, xw = ox;
  if (zw > 0) {
    const ax = (AL.x0 + AL.x1) / 2, ar = (AL.x1 - AL.x0) / 2, archZ = AL.top - ar * 0.55;
    const inAl = Math.abs(xw - ax) < ar && Math.hypot(xw - ax, (Math.max(zw, archZ) - archZ) / 0.55) < ar;
    if (!inAl) return { t: tw, P: [xw, 0, zw], ...wallAt(xw, zw), id: -2 };
    const tb = (oy + AL.D) / CS, zb = oz - SN * tb;
    if (zb > 0) { const w = wallAt(xw * 0.9 + 13, zb); return { t: tb, P: [xw, -AL.D, zb], alb: mul(w.alb, 0.55), N: w.N, spec: w.spec, gloss: w.gloss, id: -2 }; }
  }
  const tf = oz / SN, yf = oy - CS * tf;
  const pool = fbm(ox / 50, yf / 34, 3, 61) - clamp((360 - ox) / 60) * 0.3 - clamp((190 - yf) / 40) * 0.3; // black water, in the near right corner
  if (pool > 0.63) { // black water: dead still, a few ripples, a muddy rim
    const rip = vn(ox / 5, yf / 3, 8) - 0.5, rip2 = vn(ox / 2, yf / 1.5, 9) - 0.5, edge = clamp((pool - 0.63) / 0.05);
    if (edge < 1) return { t: tf, P: [ox, yf, 0], alb: L('#24201a'), N: [0, 0, 1], spec: 0.9, gloss: 90, id: -4 };
    return { t: tf, P: [ox, yf, 0], alb: [0.005, 0.006, 0.006], N: [rip * 0.2 + rip2 * 0.08, rip2 * 0.16, 1], spec: 1.4, gloss: 160, wrap: 0, rim: 0, noAO: true, id: -4 };
  }
  const f = floorAt(ox, yf);
  if (yf < 0) { f.alb = mul(f.alb, 0.6); } // the alcove's floor
  return { t: tf, P: [ox, yf, 0], ...f, id: -1 };
}

// ---------- objects ----------
const objects = [], lights = [];
const addO = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const HERO = CFG.hero, toward = (x, y, t) => Math.atan2(-(t[0] - x), t[1] - y);
const hz = hero('idle'), hYaw = toward(HERO[0], HERO[1], CFG.B);
addO('hero', hz, [HERO[0], HERO[1], 0], hYaw, { id: 60 });
const bm = BOSSES[N - 1].fn(CFG.pose), bYaw = CFG.yaw ?? toward(CFG.B[0], CFG.B[1], HERO) + (CFG.turn || 0), P = { x: CFG.B[0], y: CFG.B[1], yaw: bYaw };
const bossNames = ['boss'];
addO('boss', bm, [P.x, P.y, 0], bYaw, { id: 70 });
for (const s of bm.subs || []) { bossNames.push('boss' + s.name); addO('boss' + s.name, s.model, [P.x, P.y, 0], bYaw, { id: 71 }); }
for (const l of bm.lights) lights.push({ soft: 5, R: 200, ...l, p: place(P, l.p), skip: l.skipSub ? bossNames.slice(1) : l.skip });
const cg = vesnaCage(); addO('cage', cg, [CFG.cage, -2, 0], 0);
for (const l of cg.lights) lights.push({ ...l, p: [l.p[0] + CFG.cage, l.p[1] - 2, l.p[2]] });
addO('pillarL', pillar(34, 22, 140), [16, 10, 0]); addO('pillarR', pillar(34, 22, 140), [464, 10, 0]);
addO('sconceL', sconce(0.7), [16, 21, 74]); addO('sconceR', sconce(0.5), [464, 21, 74]);
addO('bonesL', bonePile(2, 70, 18, 34), [72, 10, 0]); addO('bonesR', bonePile(4, 60, 16, 30), [420, 9, 0]);
addO('bonesF', bonePile(6, 34, 14, 14), [40, 196, 0], 0.4);
addO('nestA', ratNest(3, 7), [452, 118, 0], 0.3); addO('nestB', ratNest(8, 5), [30, 120, 0], -0.5);
for (const [x, y, yaw] of [[208, 196, 0.8], [380, 230, -0.4], [96, 160, 2.0], [250, 92, 1.1]]) addO('skull', skull(), [x, y, 0], yaw);

lights.push(
  { name: 'lantern', p: (() => { const l = hz.P._lantern, c = Math.cos(hYaw), s = Math.sin(hYaw); return [HERO[0] + c * l[0] - s * l[1], HERO[1] + s * l[0] + c * l[1], l[2]]; })(), c: L('#d0cc78'), I: 5, r0: 40, R: 280, pad: 3.6, soft: 6, haze: 0.012, hazeR: 4 },
  { name: 'torchL', p: [16, 30, 92], c: L('#c8783a'), I: 2.6, r0: 40, R: 260, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceL'] },
  { name: 'torchR', p: [464, 30, 90], c: L('#b86a32'), I: 2.0, r0: 36, R: 240, soft: 5, haze: 0.03, hazeR: 5, skip: ['sconceR'] },
  { name: 'rim', p: [300, -160, 150], c: L('#9aa8a4'), I: 2.2, r0: 400, R: 1200, soft: 10, only: ['hero', 'cage', ...bossNames] },
  { name: 'night', p: [240, 200, 200], c: L('#6a7a80'), I: 0.7, r0: 260, R: 700, noShadow: true },
);
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#1c2024').map(v => v * 0.8) };
export async function scene() { return SC; }
export async function finish(img, sc) {
  haze(img, sc);
  const rgba = post(img, { exposure: 3.4, vignette: 0.4, desat: 0.18, grain: 0.012, dither: 0.02, noPal: !!process.env.NOPAL });
  fs.mkdirSync(OUT, { recursive: true });
  const tag = OUT + '/s' + String(N).padStart(2, '0');
  writePNG(tag + '.png', rgba, W, H, 1); writePNG(tag + '-x2.png', rgba, W, H, 2);
}
