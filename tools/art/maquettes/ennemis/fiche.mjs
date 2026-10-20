// One enemy card image: front view + attack pose with its floor telegraph. FOE=1..10 (0 = hero alone, for the scale mask).
// node run.mjs fiche.mjs  -> out/fNN.png (native), out/fNN-x4.png (preview), out/fNN-mask.png + .json (front silhouette)
import fs from 'fs';
import { camera, render, post, haze, writePNG, L, clamp, h2, vn, fbm, mix, mul } from './lib.mjs';
import { hero } from './hero.mjs';
import { FOES } from './foes.mjs';
import { floorFx, place } from './fx.mjs';

const N = +(process.env.FOE ?? 1);
// W,H native; feet row of world y=0; front + attack placements (world x = screen x)
const CFG = {
  0: { W: 60, H: 130, feet: 112, F: { x: 30, y: 0, yaw: 0 } },
  1: { W: 163, H: 130, feet: 104, F: { x: 36, y: 0, yaw: 0.75 }, A: { x: 66, y: -30, yaw: -0.95 } },
  2: { W: 163, H: 130, feet: 120, F: { x: 34, y: 0, yaw: 0.25 }, A: { x: 112, y: -30, yaw: -0.6 } },
  3: { W: 163, H: 130, feet: 112, F: { x: 26, y: 0, yaw: 0 }, A: { x: 70, y: -6, yaw: -1.25 } },
  4: { W: 250, H: 130, feet: 120, F: { x: 40, y: 0, yaw: 0 }, A: { x: 130, y: -20, yaw: -1.2 } },
  5: { W: 250, H: 130, feet: 116, F: { x: 50, y: 0, yaw: 0 }, A: { x: 180, y: -12, yaw: 0.25 } },
  6: { W: 163, H: 130, feet: 108, F: { x: 32, y: 0, yaw: 0 }, A: { x: 106, y: -24, yaw: 0.2 } },
  7: { W: 163, H: 130, feet: 112, F: { x: 30, y: 0, yaw: 0.2 }, A: { x: 104, y: -8, yaw: -0.2 } },
  8: { W: 163, H: 130, feet: 112, F: { x: 30, y: 0, yaw: 0 }, A: { x: 104, y: -26, yaw: 0.35 } },
  9: { W: 250, H: 130, feet: 100, F: { x: 58, y: 0, yaw: 0.3 }, A: { x: 178, y: -10, yaw: 1.2 } },
  10: { W: 375, H: 195, feet: 180, F: { x: 80, y: 0, yaw: 0 }, A: { x: 220, y: -40, yaw: -1.1 } },
}[N];
const { W, H } = CFG; const off = -CFG.feet;
const cam = camera(38 * Math.PI / 180);
const objects = [], lights = [], fx = [];
const foe = N ? FOES[N - 1] : null;
function put(m, P, id, tag) {
  objects.push({ name: tag, pos: [P.x, P.y, 0], yaw: P.yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id, step: m.step });
  if (m.vfx) objects.push({ name: tag + 'vfx', pos: [P.x, P.y, 0], yaw: P.yaw, sdf: m.vfx.sdf, mat: m.vfx.mat, bounds: m.vfx.bounds, id: id + 1, step: m.vfx.step, noShadow: true, noSelfAO: true });
  const sc = m.big ? 1.5 : 1;
  lights.push({ p: [P.x + 30 * sc, P.y - 60 * sc, 75 * sc], c: L('#8098a2'), I: 9, r0: 90 * sc, R: 260 * sc, soft: 10, only: [tag] });
  lights.push({ p: [P.x - 70, P.y + 70, 140 * sc], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 });
  lights.push({ p: [P.x + 28, P.y + 50, 60 * sc], c: L('#b8a68a'), I: 2.4, r0: 40 * sc, R: 170 * sc, soft: 6 }); // the vampire's lantern, off-frame
  for (const l of m.lights || []) lights.push({ soft: 5, R: 200, ...l, p: place(P, l.p), I: l.I });
  for (const f of m.fx || []) fx.push({ ...f, P });
}
if (!N) put(hero('idle'), CFG.F, 60, 'front');
else { put(foe.fn('idle'), { ...CFG.F, yaw: CFG.F.yaw }, 60, 'front'); put(foe.fn('atk'), CFG.A, 70, 'atk'); }
function stone(x, y) { // dark flagstones (jittered Voronoi, F2-F1 mortar)
  const CW = 36, CH = 27, gx = Math.floor(x / CW), gy = Math.floor(y / CH); let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = (gx + i) * CW + 6 + h2(gx + i, gy + j, 71) * (CW - 12), cy = (gy + j) * CH + 5 + h2(gx + i, gy + j, 72) * (CH - 10); const d = Math.hypot((x - cx) / CW, (y - cy) / CH) * 30; if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + gy + j; } else if (d < f2) f2 = d; }
  let c = mul(mix(L('#2e2a24'), L('#23201b'), h2(id, 0, 73)), 0.8 + 0.4 * h2(id, 1, 75));
  c = mix(c, L('#141210'), clamp((fbm(x / 7, y / 7, 3, 9) - 0.4) * 2) * 0.7);
  if (f2 - f1 < 1.2) c = L('#0c0a08');
  return c;
}
const env = (ox, oy, oz, vx, vy, vz) => {
  const t = -oz / vz; const x = ox + vx * t, y = oy + vy * t;
  const c = stone(x + 400, y + 400);
  const e = floorFx(x, y, fx);
  return { t, P: [x, y, 0], N: [0, 0, 1], alb: c, wrap: 0, rim: 0, emi: e, spec: 0.05, gloss: 12, id: -1 };
};
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#1a1c1e').map(v => v * 0.6) };
export async function scene() { return SC; }
export async function finish(img, scene) {
  haze(img, scene);
  const rgba = post(img, { exposure: 3.2, vignette: 0.12, desat: 0.15, grain: 0.004, dither: 0.015, noPal: !!process.env.NOPAL });
  fs.mkdirSync('out', { recursive: true });
  const tag = 'out/f' + String(N).padStart(2, '0');
  writePNG(tag + '.png', rgba, W, H, 1); writePNG(tag + '-x4.png', rgba, W, H, 4);
  // front silhouette mask (white on black) cropped to the figure, with the feet row
  const m = new Uint8ClampedArray(W * H * 4); let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let i = 0; i < W * H; i++) { const on = img.oid[i] === 60; const v = on ? 255 : 0; m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = v; m[i * 4 + 3] = 255; if (on) { const x = i % W, y = i / W | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  writePNG(tag + '-mask.png', m, W, H, 1);
  fs.writeFileSync(tag + '.json', JSON.stringify({ W, H, feet: CFG.feet, bbox: [x0, y0, x1, y1], fx: CFG.F.x }));
}
