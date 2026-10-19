import { camera, post, haze, writePNG, L, clamp, h2, fbm, mix, mul } from '../grand/lib.mjs';
import { hero } from '../grand/hero.mjs';
import { vesna, severin, magda, lucian } from './chiefs.mjs';
const W = 400, H = 160, cam = camera(38 * Math.PI / 180), off = -147;
const ms = [hero('idle'), vesna(), severin(), magda(), lucian()];
const objects = [], lights = [];
ms.forEach((m, i) => { const x = 40 + i * 80; objects.push({ name: 'f' + i, pos: [x, 0, 0], yaw: +(process.env.YAW || 0), sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 60 + i, step: 0.6 });
  lights.push({ p: [x + 30, -60, 75], c: L('#8098a2'), I: 9, r0: 90, R: 260, soft: 10 });
  lights.push({ p: [x - 40, 70, 90], c: L('#d8a060'), I: 2.5, r0: 80, R: 300, soft: 8 }); });
const env = (ox, oy, oz, vx, vy, vz) => { const t = -oz / vz; const x = ox + vx * t, y = oy + vy * t; return { t, P: [x, y, 0], N: [0, 0, 1], alb: mix(L('#110f0c'), L('#1a1611'), fbm(x / 14, y / 14, 3, 2)), wrap: 0, rim: 0 }; };
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#22262a') };
export async function scene() { return SC; }
export async function finish(img, sc) { const rgba = post(img, { exposure: 3.2, vignette: 0.1, desat: 0.15, grain: 0.004, dither: 0.015 }); writePNG('lineup.png', rgba, W, H, 4); }
