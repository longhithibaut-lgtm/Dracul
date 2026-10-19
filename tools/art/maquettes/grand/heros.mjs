import { camera, render, post, haze, writePNG, L, clamp, h2, vn, fbm, mix, mul } from './lib.mjs';
import { hero } from './hero.mjs';
const W = +(process.env.W || 320), H = 160;
const cam = camera(38 * Math.PI / 180);
const FEET = 147, off = -FEET;
const figs = [
  { pose: 'idle', yaw: 0, x: 42 }, { pose: 'idle', yaw: Math.PI / 2, x: 116 }, { pose: 'idle', yaw: Math.PI, x: 190 }, { pose: 'slash', yaw: +(process.env.YAW || -1.2), x: 268 },
].slice(0, +(process.env.NF || 4));
if (process.env.SOLO) { figs.splice(0, 9, Object.assign(figs[+process.env.SOLO] || {}, { x: 45 })); }
const objects = [], lights = [];
figs.forEach((f, i) => {
  const h = hero(f.pose);
  objects.push({ name: 'h' + i, pos: [f.x, 0, 0], yaw: f.yaw, sdf: h.sdf, mat: h.mat, bounds: h.bounds, id: 60 + i, step: 0.6 });
  const l = h.P._lantern, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  lights.push({ p: [f.x + c * l[0] - s * l[1], s * l[0] + c * l[1], l[2]], c: L('#d0cc78'), I: 3.6, r0: 24, R: 95, pad: 3.6, soft: 5, haze: 0.008, hazeR: 3 });
  lights.push({ p: [f.x + 30, -60, 75], c: L('#8098a2'), I: 9, r0: 90, R: 260, soft: 10 });
  lights.push({ p: [f.x - 70, 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 });
});
const env = (ox, oy, oz, vx, vy, vz) => {
  const t = -oz / vz; const x = ox + vx * t, y = oy + vy * t;
  let c = mix(L('#110f0c'), L('#0a0908'), clamp((fbm(x / 14, y / 14, 3, 2) - 0.3) * 1.6));
  if (h2(x | 0, y | 0, 5) < 0.06) c = mul(c, 0.7);
  return { t, P: [x, y, 0], N: [0, 0, 1], alb: c, wrap: 0, rim: 0 };
};
const SC = { W, H, cam, off, objects, lights, env, ambient: process.env.DBG ? [0.5,0.5,0.5] : L('#1a1c1e').map(v => v * 0.6) };
if (process.env.DBG) SC.lights.push({ p: [0, 200, 200], c: [1,1,1], I: 3, r0: 400, R: 2000, noShadow: true });
export async function scene() { return SC; }
export async function finish(img, scene) {
  haze(img, scene);
  const rgba = post(img, { exposure: 3.2, vignette: 0.25, desat: 0.15, grain: 0.004, dither: +(process.env.DITH ?? 0.015), noPal: !!process.env.NOPAL });
  writePNG('heros-native.png', rgba, W, H, 1);
  writePNG('heros-x4.png', rgba, W, H, 4);
}
