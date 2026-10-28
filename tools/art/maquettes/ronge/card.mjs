// One pose of one Rongé (ronge.mjs), lit as the foes and the game's Rongé are (tools/art/ronge.gen.mjs: the cold back
// light, the warm fill, the hero's lantern off-frame), on the refuge's flagstones. DESIGN=1..3 (0: the hero alone, for
// the scale), POSE=idle|speak|beast. From this folder: OUT=<dir> DESIGN=n POSE=p node ../ennemis/run.mjs ../ronge/card.mjs
// -> <OUT>/c<n>-<pose>.png, -mask.png (him white, what reads with him grey), .json; SPRITE=1: no floor nor card props,
// -> <OUT>/s<n>-<pose>.png with alpha (the game's sheet cell: his floor point on row `sole`, centred) + .json
import fs from 'fs';
import { tmpdir } from 'os';
import { camera, post, haze, L, clamp, h2, vn, fbm, mix, mul } from '../ennemis/lib.mjs';
import { writePNG } from '../../grand/lib.mjs'; // keeps the alpha channel
import { hero } from '../ennemis/hero.mjs';
import { place } from '../ennemis/fx.mjs';
import { DESIGNS } from './ronge.mjs';

const N = +(process.env.DESIGN ?? 1), POSE = process.env.POSE || 'idle', SPRITE = !!process.env.SPRITE, OUT = process.env.OUT || tmpdir() + '/dracul-ronge';
const Z = +(process.env.ZOOM || 1); // ZOOM=3: a close look at the model while posing it (not the game's scale)
const W = 240 * Z, H = 190 * Z, FEET = 150 * Z, P = { x: 100 * Z, y: 0, yaw: -Math.PI / 4 }; // facing down-right, as the game's sheet
const zm = (o) => (Z === 1 ? o : { ...o, sdf: (x, y, z) => o.sdf(x / Z, y / Z, z / Z) * Z, mat: (i, x, y, z, ...n) => o.mat(i, x / Z, y / Z, z / Z, ...n), bounds: o.bounds.map((v) => v * Z) });
const cam = camera(38 * Math.PI / 180), objects = [], lights = [];
const m = N ? DESIGNS[N - 1].fn(POSE) : hero('idle'), lift = (m.lift || 0) * Z, lit = ['him'];
objects.push({ name: 'him', pos: [P.x, P.y, lift], yaw: P.yaw, ...zm(m), id: 60 });
for (const s of m.subs || []) {
  if (SPRITE && s.scene) continue;
  objects.push({ name: s.name, pos: [P.x, P.y, lift], yaw: P.yaw, ...zm(s.model), id: s.model.mask ? 61 : 50 });
  if (s.model.mask) lit.push(s.name);
}
const at = (p) => { const q = place(P, p.map((v) => v * Z)); return [q[0], q[1], q[2] + lift]; };
const light = (l) => ({ ...l, p: at(l.p), r0: l.r0 * Z, R: l.R * Z, pad: (l.pad || 1) * Z, hazeR: l.hazeR && l.hazeR * Z });
lights.push(light({ p: [63.6, -21.2, 75], c: L('#8098a2'), I: 8, r0: 90, R: 260, soft: 10, only: lit })); // cold back light
lights.push(light({ p: [-99, 99, 140 - lift / Z], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 }));
lights.push(light({ p: [-15.6, 55.2, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 })); // the hero's lantern, off-frame
for (const l of m.lights || []) lights.push(light({ soft: 5, R: 200, ...l }));

// the refuge's floor: worn flagstones, dark joints, old blood
function flags(x, y) { // irregular stones: the nearest of jittered seeds, a joint where two are nearly as near
  const G = 17, gx = Math.floor(x / G), gy = Math.floor(y / G);
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, d = Math.hypot((cx + 0.15 + 0.7 * h2(cx, cy, 81)) * G - x, (cy + 0.15 + 0.7 * h2(cx, cy, 82)) * G - y);
    if (d < d1) { d2 = d1; d1 = d; id = h2(cx, cy, 85); } else if (d < d2) d2 = d;
  }
  let c = mix(L('#3a342c'), L('#1c1915'), clamp(fbm(x / 8, y / 8, 3, 83) * 1.5 - 0.25 + (id - 0.5) * 0.5));
  if (d2 - d1 < 1.1 + 0.6 * vn(x / 3, y / 3, 86)) c = L('#0a0908');
  if (vn(x / 26, y / 20, 84) > 0.74) c = mix(c, L('#220608'), 0.45);
  return c;
}
const env = SPRITE ? null : (ox, oy, oz, vx, vy, vz) => { const t = -oz / vz, x = ox + vx * t, y = oy + vy * t; return { t, P: [x, y, 0], N: [0, 0, 1], alb: flags(x + 300, y + 300), wrap: 0, rim: 0, spec: 0.05, gloss: 14, id: -1 }; };
const SC = { W, H, cam, off: -FEET, objects, lights, env, ambient: L('#1a1c1e').map((v) => v * 0.6) };
export async function scene() { return SC; }
export async function finish(img, scene) {
  haze(img, scene);
  const rgba = post(img, { exposure: 3.3, vignette: SPRITE ? 0 : 0.1, desat: 0.15, grain: 0.004, dither: 0.015 });
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `${OUT}/${SPRITE ? 's' : 'c'}${N}-${N ? POSE : 'hero'}`, box = { fig: [W, H, 0, 0], mask: [W, H, 0, 0], all: [W, H, 0, 0] };
  const grow = (b, x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  const mask = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = img.oid[i], x = i % W, y = (i / W) | 0, v = o === 60 ? 255 : o === 61 ? 128 : 0;
    mask.fill(v, i * 4, i * 4 + 3); mask[i * 4 + 3] = 255;
    if (v === 255) grow(box.fig, x, y);
    if (v) grow(box.mask, x, y);
    if (o >= 0) grow(box.all, x, y);
    if (SPRITE) rgba[i * 4 + 3] = o >= 0 ? 255 : 0;
  }
  if (SPRITE) { // cropped round him, centred on his floor point so the game's mirror keeps it in place
    const [x0, y0, x1, y1] = box.all, half = Math.max(P.x - x0, x1 + 1 - P.x) + 1, FW = 2 * half, FH = y1 - y0 + 3, top = y0 - 1, left = P.x - half;
    const cell = new Uint8ClampedArray(FW * FH * 4);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const sx = left + x, sy = top + y; if (sx >= 0 && sx < W && sy >= 0 && sy < H) cell.set(rgba.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * FW + x) * 4); }
    writePNG(tag + '.png', cell, FW, FH);
    fs.writeFileSync(tag + '.json', JSON.stringify({ FW, FH, sole: FEET - top }));
    return;
  }
  writePNG(tag + '.png', rgba, W, H); writePNG(tag + '-x3.png', rgba, W, H, 3); writePNG(tag + '-mask.png', mask, W, H);
  fs.writeFileSync(tag + '.json', JSON.stringify({ W, H, feet: FEET, x: P.x, ...box }));
}
