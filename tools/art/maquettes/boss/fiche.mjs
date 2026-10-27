// One boss card: the idle pose and the wind-up (the body's tell), no floor mark. BOSS=1..3 (0 = the hero alone, for the
// scale mask). From this folder: OUT=<dir> BOSS=n node ../ennemis/run.mjs ../boss/fiche.mjs
// -> <OUT>/bNN.png (native), bNN-x2.png (preview), bNN-mask.png (idle in white, wind-up in grey) + bNN.json
import fs from 'fs';
import { camera, post, haze, writePNG, L, clamp, h2, fbm, mix, mul } from '../ennemis/lib.mjs';
import { hero } from '../ennemis/hero.mjs';
import { place } from '../ennemis/fx.mjs';
import { BOSSES } from './bosses.mjs';

const N = +(process.env.BOSS ?? 1), OUT = process.env.OUT || 'out';
const CFG = {
  0: { W: 60, H: 130, feet: 112, F: { x: 30, y: 0, yaw: 0 } },
  1: { W: 306, H: 173, feet: 157, F: { x: 80, y: 10, yaw: 0.45 }, A: { x: 222, y: 30, yaw: -0.55 } },
  2: { W: 460, H: 260, feet: 214, F: { x: 112, y: 0, yaw: 0.55 }, A: { x: 340, y: -20, yaw: -0.6 } },
  3: { W: 460, H: 260, feet: 226, F: { x: 112, y: 0, yaw: 0.6 }, A: { x: 336, y: -10, yaw: -0.35 } },
}[N];
const { W, H } = CFG; const off = -CFG.feet;
const cam = camera(38 * Math.PI / 180);
const objects = [], lights = [];
function put(m, P, id, tag) {
  const names = [tag];
  objects.push({ name: tag, pos: [P.x, P.y, 0], yaw: P.yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id, step: m.step });
  for (const s of m.subs || []) { names.push(tag + s.name); objects.push({ name: tag + s.name, pos: [P.x, P.y, 0], yaw: P.yaw, sdf: s.model.sdf, mat: s.model.mat, bounds: s.model.bounds, id: id + 1, step: s.model.step }); }
  const k = m.size || 1;
  lights.push({ p: [P.x + 30 * k, P.y - 60 * k, 75 * k], c: L('#8098a2'), I: 9, r0: 90 * k, R: 260 * k, soft: 10, only: names }); // cold back light
  lights.push({ p: [P.x - 70, P.y + 70, 140 * k], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 });
  lights.push({ p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40 * k, R: 170 * k, soft: 6 }); // the vampire's lantern, off-frame
  for (const l of m.lights || []) lights.push({ soft: 5, R: 200, ...l, p: place(P, l.p), skip: l.skipSub ? names.slice(1) : l.skip });
}
if (!N) put(hero('idle'), CFG.F, 60, 'front');
else { const f = BOSSES[N - 1].fn; put(f('idle'), CFG.F, 60, 'front'); put(f('tele'), CFG.A, 70, 'atk'); }
function stone(x, y) { // dark wet flagstones (jittered Voronoi, F2-F1 mortar)
  const CW = 36, CH = 27, gx = Math.floor(x / CW), gy = Math.floor(y / CH); let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = (gx + i) * CW + 6 + h2(gx + i, gy + j, 71) * (CW - 12), cy = (gy + j) * CH + 5 + h2(gx + i, gy + j, 72) * (CH - 10); const d = Math.hypot((x - cx) / CW, (y - cy) / CH) * 30; if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + gy + j; } else if (d < f2) f2 = d; }
  let c = mul(mix(L('#2e2a24'), L('#23201b'), h2(id, 0, 73)), 0.8 + 0.4 * h2(id, 1, 75));
  c = mix(c, L('#141210'), clamp((fbm(x / 7, y / 7, 3, 9) - 0.4) * 2) * 0.7);
  if (f2 - f1 < 1.2) c = L('#0c0a08');
  return c;
}
const env = (ox, oy, oz, vx, vy, vz) => {
  const t = -oz / vz; const x = ox + vx * t, y = oy + vy * t;
  const wet = clamp((fbm(x / 40, y / 30, 3, 5) - 0.5) * 4);
  return { t, P: [x, y, 0], N: [0, 0, 1], alb: stone(x + 400, y + 400), wrap: 0, rim: 0, spec: 0.05 + 0.5 * wet, gloss: 12 + 50 * wet, id: -1 };
};
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#1a1c1e').map(v => v * 0.6) };
export async function scene() { return SC; }
export async function finish(img, scene) {
  haze(img, scene);
  const rgba = post(img, { exposure: 3.2, vignette: 0.12, desat: 0.15, grain: 0.004, dither: 0.015, noPal: !!process.env.NOPAL });
  fs.mkdirSync(OUT, { recursive: true });
  const tag = OUT + '/b' + String(N).padStart(2, '0');
  writePNG(tag + '.png', rgba, W, H, 1); writePNG(tag + '-x2.png', rgba, W, H, 2);
  // silhouettes: idle white, wind-up grey, with their boxes
  const m = new Uint8ClampedArray(W * H * 4); const bb = { 6: [W, H, 0, 0], 7: [W, H, 0, 0] };
  for (let i = 0; i < W * H; i++) { const g = Math.floor(img.oid[i] / 10); const v = g === 6 ? 255 : g === 7 ? 128 : 0; m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = v; m[i * 4 + 3] = 255;
    if (v) { const x = i % W, y = i / W | 0, b = bb[g]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } }
  writePNG(tag + '-mask.png', m, W, H, 1);
  fs.writeFileSync(tag + '.json', JSON.stringify({ W, H, feet: CFG.feet, idle: bb[6], tele: bb[7], fx: CFG.F.x, ax: CFG.A?.x }));
}
