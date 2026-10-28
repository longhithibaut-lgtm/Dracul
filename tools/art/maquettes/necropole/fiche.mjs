// One necropolis foe's card: at rest and its wind-up (the body's tell), no floor mark, on the necropolis's dark earth.
// FOE=1..15 (0 = the hero alone, for the scale mask). From this folder: OUT=<dir> FOE=n node ../ennemis/run.mjs ../necropole/fiche.mjs
// -> <OUT>/fNN.png (native), fNN-x3.png (preview), fNN-mask.png (rest in white, wind-up in grey) + fNN.json
import fs from 'fs';
import { camera, post, haze, writePNG, L, clamp, h2, vn, fbm, mix, mul } from '../ennemis/lib.mjs';
import { hero } from '../ennemis/hero.mjs';
import { place } from '../ennemis/fx.mjs';
import { FOES } from './foes.mjs';

const N = +(process.env.FOE ?? 1), OUT = process.env.OUT || 'out';
const f = N ? FOES[N - 1] : { W: 60, H: 120, feet: 104, F: { x: 30, y: 0, yaw: 0 } };
const { W, H } = f; const off = -f.feet;
const cam = camera(38 * Math.PI / 180);
const objects = [], lights = [];
function put(m, P, id, tag) {
  const names = [tag], lit = [tag]; // lit: what the cold back light outlines (the foe, not its props)
  objects.push({ name: tag, pos: [P.x, P.y, 0], yaw: P.yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id, step: m.step });
  for (const s of m.subs || []) { names.push(tag + s.name); if (!s.model.nomask) lit.push(tag + s.name); objects.push({ name: tag + s.name, pos: [P.x, P.y, 0], yaw: P.yaw, sdf: s.model.sdf, mat: s.model.mat, bounds: s.model.bounds, id: s.model.nomask ? 50 : id + 1, step: s.model.step, noShadow: s.model.noShadow, noSelfAO: s.model.noSelfAO }); }
  const k = m.size || 1;
  lights.push({ p: [P.x + 30 * k, P.y - 60 * k, 75 * k], c: L('#8098a2'), I: 9 * (m.rim ?? 1), r0: 90 * k, R: 260 * k, soft: 10, only: lit }); // cold back light
  lights.push({ p: [P.x - 70, P.y + 70, 140 * k], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 });
  lights.push({ p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40 * k, R: 170 * k, soft: 6 }); // the vampire's lantern, off-frame
  for (const l of m.lights || []) lights.push({ soft: 5, R: 200, ...l, p: place(P, l.p), skip: l.skipSub ? names.slice(1) : l.skip });
}
if (!N) put(hero('idle'), f.F, 60, 'front');
else { put(f.fn(f.poses?.[0] ?? 'idle'), f.F, 60, 'front'); put(f.fn(f.poses?.[1] ?? 'tele'), f.A, 70, 'atk'); }

// the necropolis's floor: dark trodden earth, grit, bone splinters, old blood
function earth(x, y) {
  let c = mix(L('#2a241c'), L('#1a1611'), clamp(fbm(x / 9, y / 9, 3, 41) * 1.6 - 0.3));
  c = mix(c, L('#100d0a'), clamp((fbm(x / 22, y / 18, 3, 42) - 0.5) * 3) * 0.7);
  const gx = Math.floor(x / 3), gy = Math.floor(y / 3), r = h2(gx, gy, 43);
  if (r < 0.1) c = mul(c, r < 0.03 ? 1.25 : 0.75); // grit
  { const cx = Math.floor(x / 7), cy = Math.floor(y / 7), q = h2(cx, cy, 300); if (q < 0.012) { const a = h2(cx, cy, 301) * 3.14, lx = x - cx * 7 - 3.5, ly = y - cy * 7 - 3.5; const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.6 && Math.abs(u) < 2.6) c = L('#5e5644'); } }
  if (vn(x / 30, y / 24, 44) > 0.78) c = mix(c, L('#220608'), 0.35);
  return c;
}
const env = (ox, oy, oz, vx, vy, vz) => {
  let t = -oz / vz; const x = ox + vx * t, y = oy + vy * t;
  if (f.chasm !== undefined && y < f.chasm + 3 * (vn(x / 6, 0, 45) - 0.5)) { // the chasm: black, far below
    const td = (-400 - oz) / vz; return { t: td, P: [ox + vx * td, oy + vy * td, -400], N: [0, 0, 1], alb: [0.003, 0.003, 0.004], wrap: 0, rim: 0, spec: 0, id: -2, noAO: true };
  }
  const wet = clamp((fbm(x / 40, y / 30, 3, 5) - 0.55) * 4);
  return { t, P: [x, y, 0], N: [0, 0, 1], alb: earth(x + 400, y + 400), wrap: 0, rim: 0, spec: 0.04 + 0.4 * wet, gloss: 12 + 40 * wet, id: -1 };
};
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#1a1c1e').map(v => v * 0.6) };
export async function scene() { return SC; }
export async function finish(img, scene) {
  haze(img, scene);
  const rgba = post(img, { exposure: 3.2, vignette: 0.12, desat: 0.15, grain: 0.004, dither: 0.015, noPal: !!process.env.NOPAL });
  fs.mkdirSync(OUT, { recursive: true });
  const tag = OUT + '/f' + String(N).padStart(2, '0');
  writePNG(tag + '.png', rgba, W, H, 1); writePNG(tag + '-x3.png', rgba, W, H, 3);
  // silhouettes: rest white, wind-up grey, with their boxes
  const m = new Uint8ClampedArray(W * H * 4); const bb = { 6: [W, H, 0, 0], 7: [W, H, 0, 0], all: [W, H, 0, 0] }; // all: the foes and their props
  for (let i = 0; i < W * H; i++) { const g = Math.floor(img.oid[i] / 10); const v = g === 6 ? 255 : g === 7 ? 128 : 0; m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = v; m[i * 4 + 3] = 255;
    for (const k of v ? [g, 'all'] : img.oid[i] >= 50 ? ['all'] : []) { const x = i % W, y = i / W | 0, b = bb[k]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } }
  writePNG(tag + '-mask.png', m, W, H, 1);
  fs.writeFileSync(tag + '.json', JSON.stringify({ W, H, feet: f.feet, idle: bb[6], tele: bb[7], all: bb.all, fx: f.F.x, ax: f.A?.x }));
}
