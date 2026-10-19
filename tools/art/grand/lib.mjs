// Copied from the validated « grand » mockup; writePNG keeps the alpha channel.
// Tiny CPU renderer for large-pixel mockups: orthographic 3/4 camera, SDF objects + analytic environment,
// point lights with soft shadows, SDF ambient occlusion, then tone/grade/palette snap.
import zlib from 'zlib';
import fs from 'fs';

// ---------- math / noise ----------
export const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function h2(x, y, s = 0) { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
export function h3(x, y, z, s = 0) { return h2(x + Math.imul(z | 0, 1013), y - Math.imul(z | 0, 7919), s); }
export function vn(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function vn3(x, y, z, s = 0) { const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf); return lerp(vn(x + zi * 31.7, y - zi * 17.3, s), vn(x + (zi + 1) * 31.7, y - (zi + 1) * 17.3, s), w); }
export function fbm(x, y, o = 4, s = 0) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
export function fbm3(x, y, z, o = 3, s = 0) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vn3(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hex = s => { const v = parseInt(s.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
export const L = s => hex(s).map(v => Math.pow(v, 2.2));
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------- SDF primitives (scalar args, no allocation) ----------
export function smin(a, b, k) { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }
export function sdSphere(x, y, z, cx, cy, cz, r) { return Math.hypot(x - cx, y - cy, z - cz) - r; }
export function sdEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 < 1e-6 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
export function sdBox(x, y, z, cx, cy, cz, bx, by, bz, r = 0) {
  const qx = Math.abs(x - cx) - bx + r, qy = Math.abs(y - cy) - by + r, qz = Math.abs(z - cz) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// round cone between a (r1) and b (r2) (iq)
export function sdRC(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// param along segment (0..1) for texturing
export function segT(px, py, pz, a, b) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  return clamp(((px - a[0]) * bax + (py - a[1]) * bay + (pz - a[2]) * baz) / (bax * bax + bay * bay + baz * baz));
}

// A "body" is a list of parts; each part: {f(x,y,z)->d, m: material, k: blend radius, sub: carve, box: [x0,y0,z0,x1,y1,z1] optional cull}
export let MAT = 0;
export function setMat(m) { MAT = m; }
export function partsSdf(parts) {
  return (x, y, z) => {
    let d = 1e9, dm = 1e9, m = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.box) { const b = p.box; const ex = Math.max(b[0] - x, x - b[3], b[1] - y, y - b[4], b[2] - z, z - b[5]); if (ex > 2) { if (!p.sub) { const di = ex; if (di < d) d = Math.min(d, di); } continue; } }
      const di = p.f(x, y, z);
      if (p.sub) { d = smax(d, -di, p.k || 0); continue; }
      if (di - (p.pri || 0) < dm) { dm = di - (p.pri || 0); m = p.m; }
      d = smin(d, di, p.k || 0);
    }
    MAT = m; return d;
  };
}

// ---------- renderer ----------
export function camera(alpha) {
  const s = Math.sin(alpha), c = Math.cos(alpha);
  // screen x = X ; screen y = Y*s - Z*c - off ; view dir v = (0,-c,-s)
  return { s, c, v: [0, -c, -s], ey: [0, s, -c] };
}
export function project(cam, x, y, z, off) { return [x, y * cam.s - z * cam.c - off]; }

export function render(scene) {
  const { W, H, cam, off, objects, lights, env, ambient } = scene;
  const N = W * H;
  const out = new Float32Array(N * 3), oid = new Int16Array(N).fill(-1), emis = new Float32Array(N), depth = new Float32Array(N).fill(1e9);
  const nrm = new Float32Array(N * 3);
  const [vx, vy, vz] = cam.v;
  // object world AABBs + screen boxes
  for (const o of objects) {
    const [x0, y0, z0, x1, y1, z1] = o.bounds; const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const X of [x0, x1]) for (const Y of [y0, y1]) for (const Z of [z0, z1]) {
      const w = [o.pos[0] + c * X - s * Y, o.pos[1] + s * X + c * Y, o.pos[2] + Z];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
    }
    o.wmin = mn; o.wmax = mx; o.cs = c; o.sn = s;
    let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
    for (const X of [mn[0], mx[0]]) for (const Y of [mn[1], mx[1]]) for (const Z of [mn[2], mx[2]]) { const [a, b] = project(cam, X, Y, Z, off); sx0 = Math.min(sx0, a); sx1 = Math.max(sx1, a); sy0 = Math.min(sy0, b); sy1 = Math.max(sy1, b); }
    o.sb = [Math.floor(sx0) - 1, Math.floor(sy0) - 1, Math.ceil(sx1) + 1, Math.ceil(sy1) + 1];
  }
  const loc = (o, x, y, z) => { const dx = x - o.pos[0], dy = y - o.pos[1]; return [o.cs * dx + o.sn * dy, -o.sn * dx + o.cs * dy, z - o.pos[2]]; };
  const slab = (o, px, py, pz, dx, dy, dz, tmax) => {
    let t0 = 0, t1 = tmax; const P = [px, py, pz], D = [dx, dy, dz];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(D[k]) < 1e-9) { if (P[k] < o.wmin[k] || P[k] > o.wmax[k]) return null; continue; }
      let a = (o.wmin[k] - P[k]) / D[k], b = (o.wmax[k] - P[k]) / D[k]; if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    return [t0, t1];
  };
  const objD = (o, x, y, z) => { const [a, b, c] = loc(o, x, y, z); return o.sdf(a, b, c); };
  function sceneD(x, y, z, skip) {
    let d = 1e9;
    for (const o of objects) {
      if (o === skip && o.noSelfAO) continue;
      const m = 8;
      if (x < o.wmin[0] - m || x > o.wmax[0] + m || y < o.wmin[1] - m || y > o.wmax[1] + m || z < o.wmin[2] - m || z > o.wmax[2] + m) continue;
      d = Math.min(d, objD(o, x, y, z));
    }
    return d;
  }
  function shadow(px, py, pz, lx, ly, lz, light) {
    const dx = lx - px, dy = ly - py, dz = lz - pz, dist = Math.hypot(dx, dy, dz);
    const ux = dx / dist, uy = dy / dist, uz = dz / dist;
    let res = 1;
    for (const o of objects) {
      if (o.noShadow || (light.skip && light.skip.includes(o.name))) continue;
      const r = slab(o, px, py, pz, ux, uy, uz, dist - (light.pad || 1)); if (!r) continue;
      let t = Math.max(r[0], 0.8);
      for (let i = 0; i < 90 && t < r[1]; i++) {
        const d = objD(o, px + ux * t, py + uy * t, pz + uz * t);
        if (d < 0.05) return 0;
        res = Math.min(res, (light.soft || 6) * d / Math.min(t, dist - t));
        t += Math.max(d * 0.8, 0.25);
      }
    }
    return clamp(res);
  }
  scene.sceneD = sceneD; scene.shadow = shadow;
  const T0 = 4000;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (scene.rowN && py % scene.rowN !== scene.rowK) { px = W; continue; }
    const i = py * W + px;
    const sy = py + 0.5 + off, sx = px + 0.5;
    const ox = sx - vx * T0, oy = sy * cam.ey[1] - vy * T0, oz = sy * cam.ey[2] - vz * T0;
    let best = env ? env(ox, oy, oz, vx, vy, vz) : null; let tBest = best ? best.t : 1e9;
    let hitO = null, hitT = 0;
    for (const o of objects) {
      if (px < o.sb[0] || px > o.sb[2] || py < o.sb[1] || py > o.sb[3]) continue;
      const r = slab(o, ox, oy, oz, vx, vy, vz, tBest); if (!r) continue;
      let t = r[0];
      for (let k = 0; k < 220 && t <= r[1]; k++) {
        const d = objD(o, ox + vx * t, oy + vy * t, oz + vz * t);
        if (d < 0.03) { if (t < tBest) { tBest = t; hitO = o; hitT = t; } break; }
        t += Math.max(d * (o.step || 0.7), 0.02);
      }
    }
    let P, Nn, m;
    if (hitO) {
      const o = hitO; const x = ox + vx * hitT, y = oy + vy * hitT, z = oz + vz * hitT;
      const [lx, ly, lz] = loc(o, x, y, z);
      const e = 0.08;
      const a = o.sdf(lx + e, ly - e, lz - e), b = o.sdf(lx - e, ly - e, lz + e), c = o.sdf(lx - e, ly + e, lz - e), d = o.sdf(lx + e, ly + e, lz + e);
      let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      o.sdf(lx, ly, lz); const mid = MAT;
      m = o.mat(mid, lx, ly, lz, nx, ny, nz);
      // local normal -> world (material may perturb local normal via m.n)
      const n2 = m.n || [nx, ny, nz];
      Nn = [o.cs * n2[0] - o.sn * n2[1], o.sn * n2[0] + o.cs * n2[1], n2[2]];
      P = [x, y, z]; oid[i] = o.id ?? 0;
    } else if (best) { P = best.P; const l = Math.hypot(...best.N); Nn = [best.N[0] / l, best.N[1] / l, best.N[2] / l]; m = best; oid[i] = best.id ?? -1; }
    else { continue; }
    depth[i] = hitO ? hitT : tBest;
    nrm[i * 3] = Nn[0]; nrm[i * 3 + 1] = Nn[1]; nrm[i * 3 + 2] = Nn[2];
    // AO
    let ao = 1;
    if (!m.noAO) {
      let occ = 0, w = 1;
      for (const hh of [1.2, 2.6, 5, 9]) { const d = sceneD(P[0] + Nn[0] * hh, P[1] + Nn[1] * hh, P[2] + Nn[2] * hh, hitO); occ += Math.max(0, hh - Math.min(d, hh)) * w / hh; w *= 0.7; }
      ao = clamp(1 - occ * 0.42);
    }
    if (m.ao !== undefined) ao *= m.ao;
    const alb = m.alb;
    let r = alb[0] * ambient[0] * ao, g = alb[1] * ambient[1] * ao, b = alb[2] * ambient[2] * ao;
    const Vx = -vx, Vy = -vy, Vz = -vz;
    const ndv = Math.max(0, Nn[0] * Vx + Nn[1] * Vy + Nn[2] * Vz);
    for (const l of lights) {
      if (l.only && (!hitO || !l.only.includes(hitO.name))) continue;
      const dx = l.p[0] - P[0], dy = l.p[1] - P[1], dz = l.p[2] - P[2]; const dist = Math.hypot(dx, dy, dz);
      if (dist > l.R) continue;
      const ux = dx / dist, uy = dy / dist, uz = dz / dist;
      let ndl = Nn[0] * ux + Nn[1] * uy + Nn[2] * uz;
      const wrap = m.wrap ?? 0.2; const dif = Math.max(0, (ndl + wrap) / (1 + wrap));
      if (dif <= 0 && !m.trans) continue;
      const fall = l.I / (1 + (dist / l.r0) ** 2) * Math.pow(Math.max(0, 1 - (dist / l.R) ** 2), 2);
      if (fall < 1e-4) continue;
      const sh = (l.noShadow || m.noShadow) ? 1 : shadow(P[0] + Nn[0] * 0.3, P[1] + Nn[1] * 0.3, P[2] + Nn[2] * 0.3, l.p[0], l.p[1], l.p[2], l);
      if (sh <= 0) continue;
      let k = fall * sh;
      // diffuse
      let lr = alb[0] * dif, lg = alb[1] * dif, lb = alb[2] * dif;
      if (m.sss) { const t = Math.max(0, 1 - Math.abs(ndl + 0.1) * 3) * m.sss; lr += t * 0.5 * alb[0] * 2; lg += t * 0.15 * alb[1]; lb += t * 0.1 * alb[2]; }
      // rim (fresnel-weighted light from behind the silhouette)
      if (ndl > -0.1) { const rim = Math.pow(1 - ndv, 3) * Math.max(0, ndl + 0.1) * (m.rim ?? 0.8); lr += rim * (0.3 + alb[0]); lg += rim * (0.3 + alb[1]); lb += rim * (0.3 + alb[2]); }
      // spec
      if (m.spec) { let hx = ux + Vx, hy = uy + Vy, hz = uz + Vz; const hl = Math.hypot(hx, hy, hz); const ndh = Math.max(0, (Nn[0] * hx + Nn[1] * hy + Nn[2] * hz) / hl); const sp = m.spec * Math.pow(ndh, m.gloss || 30) * (ndl > 0 ? 1 : 0); lr += sp; lg += sp; lb += sp; }
      r += lr * l.c[0] * k; g += lg * l.c[1] * k; b += lb * l.c[2] * k;
    }
    if (m.emi) { r += m.emi[0]; g += m.emi[1]; b += m.emi[2]; emis[i] = m.emi[0] + m.emi[1] + m.emi[2]; }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  return { out, oid, emis, depth, nrm, W, H };
}

// screen-space light haze
export function haze(img, scene) {
  const { W, H, cam, off, lights } = scene;
  for (const l of lights) {
    if (!l.haze) continue;
    const [sx, sy] = project(cam, l.p[0], l.p[1], l.p[2], off); const R = l.hazeR || l.r0 * 1.5;
    for (let y = Math.max(0, sy - R * 5 | 0); y < Math.min(H, sy + R * 5); y++) for (let x = Math.max(0, sx - R * 5 | 0); x < Math.min(W, sx + R * 5); x++) {
      const d = Math.hypot(x - sx, (y - sy) * 1.15); const k = l.I * l.haze * Math.exp(-d / R); const i = y * W + x;
      img.out[i * 3] += l.c[0] * k; img.out[i * 3 + 1] += l.c[1] * k; img.out[i * 3 + 2] += l.c[2] * k;
    }
  }
}

// ---------- palette ----------
function ramp(stops, n) { // stops: hex strings, n colors spread across
  const c = stops.map(hex), res = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1) * (c.length - 1); const k = Math.min(c.length - 2, Math.floor(t)); res.push(mix(c[k], c[k + 1], t - k)); }
  return res;
}
export const PALETTE = [
  ...ramp(['#030303', '#0c0a08', '#1a1611', '#2b251d', '#3e362b', '#544a3b', '#6e624e', '#8c7e64', '#ad9e80', '#cfc2a2', '#ece2c6'], 16), // warm grey stone/bone
  ...ramp(['#0e0a07', '#21170f', '#352418', '#4c3420', '#664629', '#835b33'], 7),                 // brown leather/wood/earth
  ...ramp(['#0d100a', '#1a2013', '#2a321c', '#3c4626', '#535d31', '#6e783f', '#8f9852', '#b4b86c', '#d8d690'], 10), // sick green / lantern
  ...ramp(['#120204', '#260407', '#3e060b', '#5a0a10', '#781116', '#951c18', '#b42c1e'], 8),        // blood
  ...ramp(['#2a1206', '#5a2a0e', '#8a4516', '#c06a20', '#e8a040', '#ffd890'], 6),                   // rust / fire
  ...ramp(['#120c16', '#211628', '#33203c', '#4a2c56', '#64406e'], 5),                              // violet accent (hero lining)
  ...ramp(['#0e1214', '#1a2124', '#2b3436', '#435052', '#66706e', '#959c94', '#c8cbbf'], 7),          // cold grey (iron, gate leak)
  ...ramp(['#3a3229', '#5f5444', '#8a7c63', '#b3a487', '#d6caa9', '#efe6cc'], 6),                   // sick pale skin
  hex('#ff2a1a'), hex('#d01a12'),                                                                    // aim line / fresh glare
].map(c => c.map(v => v * 255));

export function post(img, opt = {}) {
  const { out, W, H, emis } = img; const N = W * H;
  const res = new Uint8ClampedArray(N * 4); const G = mulberry32(99);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
  const cache = new Map(); const pal = opt.palette || PALETTE;
  const exp = opt.exposure ?? 3.0;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    let c = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
    if (opt.vignette) { const vx = (x - W / 2) / (W / 2), vy = (y - H * 0.55) / (H / 2); c = mul(c, clamp(1.12 - opt.vignette * (vx * vx + vy * vy))); }
    c = c.map(v => { v = Math.max(0, v * exp - (opt.black ?? 0.004)); v = v / (1 + v); v = Math.pow(v, 1 / 2.2); return v + (v * v * (3 - 2 * v) - v) * 0.4; });
    const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    c = mix(c, [lum, lum, lum], (opt.desat ?? 0.2) * (1 - clamp(emis[i] * 3)));
    c = [c[0] + 0.01 * (1 - lum), c[1] + 0.012 * (1 - lum), c[2] - 0.004];
    const gr = (G() + G() - 1) * (opt.grain ?? 0.02) * (0.4 + lum); c = c.map(v => v + gr);
    const dth = bayer[(y & 3) * 4 + (x & 3)] * (opt.dither ?? 0.03);
    const r = clamp(c[0] + dth) * 255, g = clamp(c[1] + dth) * 255, b = clamp(c[2] + dth) * 255;
    let q;
    if (opt.noPal) q = [r, g, b];
    else {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let best = cache.get(key);
      if (best === undefined) {
        let bd = 1e9; best = 0;
        for (let p = 0; p < pal.length; p++) { const Q = pal[p]; const dr = r - Q[0], dg = g - Q[1], db = b - Q[2]; const dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2; const d = dY * dY * 1.6 + dCo * dCo * 0.6 + dCg * dCg * 0.7; if (d < bd) { bd = d; best = p; } }
        cache.set(key, best);
      }
      q = pal[best];
    }
    res[i * 4] = q[0]; res[i * 4 + 1] = q[1]; res[i * 4 + 2] = q[2]; res[i * 4 + 3] = 255;
  }
  return res;
}

// ---------- PNG ----------
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc(buf) { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
export function writePNG(path, rgba, W, H, scale = 1) {
  const w = W * scale, h = H * scale; const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const s = ((y / scale | 0) * W + (x / scale | 0)) * 4, d = y * (w * 4 + 1) + 1 + x * 4; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; raw[d + 3] = rgba[s + 3]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
