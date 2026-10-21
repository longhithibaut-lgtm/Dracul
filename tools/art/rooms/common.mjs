// What every run room baked by tools/art/rooms.gen.mjs shares: the camera of the « grand pixel » mockups (38°, one
// texel per mockup px, two per room px), the room px <-> world conversions, model helpers, the refuge's stone, grime and
// blood. World units: x east, y south, z up, in mockup px; a room px of floor is 2 world units across and 2 / SN deep.
import { camera, sdBox, clamp, vn, fbm, vn3, fbm3, h2, L, mix, mul } from '../maquettes/hub3/lib.mjs';

export const cam = camera(38 * Math.PI / 180);
export const SN = cam.s, CS = cam.c;
/** A room px of floor (x, y) as a world point; `h`: room px up the screen as a height. */
export const wx = (x) => 2 * x, wy = (y) => (2 * y) / SN, wz = (h) => (2 * h) / CS;
/** The room px of a world floor point. */
export const rx = (x) => x / 2, ry = (y) => (y * SN) / 2;

export const C = {
  mortar: L('#0e0c0a'), stA: L('#4a4337'), stB: L('#584e40'), stC: L('#423f39'), grime: L('#1c1813'), moss: L('#3a4426'), mossL: L('#56602f'),
  blood: L('#560710'), bloodF: L('#6e0a12'), bloodD: L('#2e0406'), wall: L('#3e372d'), wallD: L('#231e18'), iron: L('#2a2622'), rust: L('#5b3520'), rustL: L('#7a4626'),
  bone: L('#b0a486'), boneD: L('#5e5440'), wood: L('#3a2818'), woodD: L('#1c130b'), wax: L('#d8ceb0'), void: L('#050404'),
};

/** A model stretched by sx, sy, sz (its own axes): the distance shrinks by the smallest, so marching stays safe. */
export function scaled(m, sx, sy = sx, sz = sx) {
  const k = Math.min(sx, sy, sz), b = m.bounds;
  return { ...m, sdf: (x, y, z) => m.sdf(x / sx, y / sy, z / sz) * k, mat: (id, x, y, z, nx, ny, nz) => m.mat(id, x / sx, y / sy, z / sz, nx, ny, nz),
    bounds: [b[0] * sx, b[1] * sy, b[2] * sz, b[3] * sx, b[4] * sy, b[5] * sz] };
}
/** A model broken off at `top(x, y)` (local), its stump's top ragged. */
export function broken(m, top) {
  return { ...m, sdf: (x, y, z) => Math.max(m.sdf(x, y, z), (z - top(x, y)) * 0.7), bounds: [...m.bounds.slice(0, 5), Math.min(m.bounds[5], top(0, 0) + 12)] };
}
/** A box model from x0..x1, y0..y1, z0..z1 (local), `mat` its material. */
export const block = (x0, y0, z0, x1, y1, z1, mat, r = 0) => ({
  sdf: (x, y, z) => sdBox(x, y, z, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, r),
  mat, bounds: [x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1], step: 0.9,
});

/** The scene's objects and lights, filled by add() and light(). */
export function stage() {
  const objects = [], lights = [];
  const add = (name, m, pos, yaw = 0, extra = {}) => {
    const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra };
    objects.push(o);
    return o;
  };
  return { objects, lights, add, light: (l) => lights.push(l) };
}

// ---------- surfaces ----------
/** Irregular flagstones, `CW` x `CH` world units, bevelled, grimy (the refuge's). */
export function flags(x, y, CW, CH, seed) {
  const wx2 = x + (vn(x / 18, y / 18, 5 + seed) - 0.5) * 7, wy2 = y + (vn(x / 18, y / 18, 6 + seed) - 0.5) * 7;
  const gx = Math.floor(wx2 / CW), gy = Math.floor(wy2 / CH);
  let f1 = 1e9, f2 = 1e9, id = 0, ddx = 0, ddy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (gx + i) * CW + 6 + h2(gx + i, gy + j, 71 + seed) * (CW - 12), cy = (gy + j) * CH + 5 + h2(gx + i, gy + j, 72 + seed) * (CH - 10);
    const d = Math.hypot((wx2 - cx) / CW, (wy2 - cy) / CH) * 30;
    if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + (gy + j); ddx = (wx2 - cx) / CW; ddy = (wy2 - cy) / CH; } else if (d < f2) f2 = d;
  }
  const e = f2 - f1;
  let c = mul(mix(mix(C.stA, C.stB, h2(id, 0, 73)), C.stC, h2(id, 0, 74) * 0.7), 0.7 + 0.45 * h2(id, 0, 75)), N = [0, 0, 1];
  if (e < 1.3) c = mix(C.mortar, c, 0.25 * e);
  else {
    const bev = clamp(1 - (e - 1.3) / 2.2), l = Math.hypot(ddx, ddy) || 1;
    N = [ddx / l * bev * 0.7 + (h2(id, 1, 76) - 0.5) * 0.12, ddy / l * bev * 0.7 + (h2(id, 2, 76) - 0.5) * 0.12, 1];
    c = mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9 + (id & 7)) - 0.4) * 2) * 0.85);
    const sp = h2(x * 2 | 0, y * 2 | 0, 11);
    if (sp < 0.08) c = mul(c, 0.65); else if (sp > 0.97) c = mul(c, 1.25);
  }
  return { c, N, id, e };
}
/** Broad grime and a slow tone drift over a colour. */
export function grime(c, x, y, k = 1) {
  const f = fbm(x / 50, y / 40, 4, 21);
  if (f > 0.5) c = mix(c, C.grime, clamp((f - 0.5) * 4) * 0.8 * k);
  return mul(c, 0.75 + 0.5 * fbm(x / 90, y / 70, 3, 44));
}
/** Coursed ashlar on a wall face (x along it, z up): its colour and normal (toward +y, the camera). */
export function ashlar(x, z, rh, bw, seed) {
  const row = Math.floor(z / rh), rz = z - row * rh, ox = (row * bw * 0.5) % bw, col = Math.floor((x + ox) / bw), rx2 = x + ox - col * bw, id = col * 131 + row + seed;
  let c = mul(mix(C.wall, C.wallD, h2(id, 0, 3) * 0.8), 0.8 + 0.4 * h2(id, 1, 4)), N = [0, 1, 0];
  const ex = Math.min(rx2, bw - rx2), ez = Math.min(rz, rh - rz);
  if (ex < 1.3 || ez < 1.3) c = C.mortar;
  else {
    if (ez < 3) N = [0, 1, rz < rh / 2 ? -0.6 : 0.6]; else if (ex < 3) N = [rx2 < bw / 2 ? -0.6 : 0.6, 1, 0];
    c = mix(c, C.grime, clamp((fbm(x / 8, z / 8, 3, 7) - 0.45) * 2) * 0.8);
  }
  return { c, N };
}
/** Skulls and long bones stacked in a wall (an ossuary), x along it, z up. */
export function ossuary(x, z) {
  const band = 13, row = Math.floor(z / band), rz = z - row * band;
  let c, N = [0, 1, 0], ao = 1;
  if (rz < 4) {
    const seg = 15, ux = ((x + row * 7) % seg + seg) % seg, r = Math.abs(rz - 2) / 2, knob = Math.min(ux, seg - ux) < 2.2 ? 1.25 : 1;
    if (r < knob * 0.9) { c = mix(C.bone, C.boneD, vn(x / 3, z, 4) * 0.8); N = [0, 1, (rz - 2) * 0.5]; } else { c = mul(C.mortar, 0.5); ao = 0.5; }
  } else {
    const cw = 9, ux = ((x + row * 4.5) % cw + cw) % cw - cw / 2, uz = rz - 8.5, e = Math.hypot(ux / 4.0, uz / 4.3);
    if (e < 1) {
      c = mix(C.bone, C.boneD, clamp(vn(x / 2, z / 2, 5) * 0.9 + e * 0.4));
      if (Math.hypot(Math.abs(ux) - 1.5, uz - 0.6) < 1.05 || (Math.abs(ux) < 0.5 && uz < -0.8 && uz > -2.0) || (uz < -2.8 && Math.abs(ux) < 2)) c = mul(C.mortar, 0.4);
      N = [ux * 0.18, 1, uz * 0.16];
    } else { c = mul(C.mortar, 0.4); ao = 0.4; }
  }
  return { c: mul(mix(c, C.grime, clamp((vn(x / 9, z / 40, 2) - 0.45) * 2) * 0.6), 0.8), N, ao };
}
/** A ragged stain: `amt` of `col` in an ellipse rx x ry round (cx, cy), 0 outside. */
export function stain(x, y, cx, cy, rx2, ry2, amt, seed) {
  const dx = (x - cx) / rx2, dy = (y - cy) / ry2, dd = dx * dx + dy * dy;
  if (dd > 3) return 0;
  const v = 1 - Math.sqrt(dd) + (fbm(x / 6, y / 6, 3, seed) - 0.5) * 1.1;
  return v > 0 ? clamp(v * 3) * amt : 0;
}
/** Distance from (px, py) to the segment a-b. */
export function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
}
/** Rusted iron, as the props have it. */
export const ironMat = (x, y, z) => { const n = vn3(x * 0.4, y * 0.4, z * 0.4, 7); return { alb: mix(C.iron, n > 0.55 ? C.rustL : C.rust, clamp(n * 1.8 - 0.4)), spec: 0.4, gloss: 30 }; };
/** Old stone in 3D (a pier, a tomb), damp-streaked. */
export function stone3(x, y, z, base = C.stB, seed = 3) {
  const n = fbm3(x * 0.15, y * 0.15, z * 0.15, 3, seed);
  let c = mix(base, C.wallD, clamp(n * 1.5 - 0.35));
  c = mix(c, C.grime, clamp((vn3(x * 0.12, y * 0.4, z * 0.03, seed + 1) - 0.45) * 2.5) * 0.6);
  return c;
}
