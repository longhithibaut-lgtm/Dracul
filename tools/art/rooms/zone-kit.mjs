// What the open zones baked by tools/art/zone.gen.mjs share (la nécropole, les catacombes): walls of bones crested with
// heaped skulls, their faces of skulls, slates, gatehouses and pointed arches, winches, mausoleums, stumps of rock,
// sarcophagi, the Order's banners, poles and stakes; the vault never seen and the shafts of light through its cracks.
// World units as in common.mjs.
import { sdBox, sdEll, clamp, vn, fbm, vn3, fbm3, h2, L, mix, mul } from '../maquettes/hub3/lib.mjs';
import { SN, CS, wx, wy, C, ashlar, segDist, stone3, ironMat } from './common.mjs';

export const BONE_TOP = L('#2a251e');
/** Skulls heaped, seen from above (a wall's crest, its collapsed end): the nearest of jittered domes in cells of `s`
 *  world units at (x, y): how far from its middle (< 1: on it, its radius 1), its id, where on it (du, dv). */
export function heap(x, y, s, seed) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s);
  let d = 9, id = 0, du = 0, dv = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = gx + i, b = gy + j, cx = (a + 0.25 + 0.5 * h2(a, b, seed)) * s, cy = (b + 0.25 + 0.5 * h2(a, b, seed + 1)) * s, r = s * (0.45 + 0.15 * h2(a, b, seed + 2));
    const e = Math.hypot(x - cx, y - cy) / r;
    if (e < d) { d = e; id = a * 7919 + b; du = (x - cx) / r; dv = (y - cy) / r; }
  }
  return { d, id, du, dv };
}
export const HEAP = 13; // a heaped skull's cell, world units: big enough to read as one at the game's pixel
/** A skull dome's look (cells of HEAP): each its own even tone of bone (darker, ×0.6, under the faces' pale), shaded
 *  toward its edge; half of them face the camera (two orbits, the nose); bone and dust packed between, never black. */
export function heapMat(x, y, seed = 81) {
  const k = heap(x, y, HEAP, seed), dust = mul(mix(C.boneD, C.grime, 0.55 + 0.3 * vn(x / 4, y / 4, seed + 3)), 0.6);
  if (k.d >= 1) return { alb: dust, N: [0, 0, 1], ao: 0.55 };
  const face = h2(k.id, 0, 82) < 0.5 && k.dv > -0.1, orb = face && (Math.hypot((Math.abs(k.du) - 0.36) / 0.22, (k.dv - 0.3) / 0.18) < 1 || (Math.abs(k.du) < 0.08 && k.dv > 0.55 && k.dv < 0.75));
  const c = orb ? mul(C.mortar, 0.7) : mul(mix(C.boneD, C.bone, 0.25 + 0.45 * h2(k.id, 1, 83) + 0.12 * (vn(x / 3, y / 3, 7) - 0.5)), 0.6 * (1 - 0.45 * clamp((k.d - 0.7) / 0.3)));
  return { alb: c, N: [k.du * 0.9, k.dv * 0.9, Math.sqrt(Math.max(0.05, 1 - k.d * k.d))], spec: 0.08, gloss: 20, ao: orb ? 0.5 : 1 - 0.3 * clamp((k.d - 0.75) * 4) };
}
/** A face of bones (u along it, z up), stacked by hand, the ossuary's skulls half as big again: its rows sag a little,
 *  each slid at random; most a course of long bones under a course of skulls (each skull its own size, tilt and tone,
 *  some turned away, 12 % gone), some a wall of femur heads seen end-on; here and there the stack has slumped into a
 *  jumble; damp run down it. */
export function boneFace(u, z) {
  const U = u / 1.5, Zw = z / 1.5 + 3 * (vn(U / 45, 0, 86) - 0.5) * clamp(z / 30), row = Math.floor(Zw / 13), rz = Zw - row * 13, Ux = U + 15 * h2(row, 0, 84), type = h2(row, 1, 87);
  const hole = { c: mul(C.mortar, 0.45), N: [0, 1, 0], ao: 0.4 };
  let c, N = [0, 1, 0], ao = 1;
  if (fbm(U / 26, Zw / 18, 2, 98) > 0.7) { // slumped: bones every way
    const j = vn(U / 1.6, Zw / 1.6, 99), k = vn(U / 0.9 + 3, Zw / 3, 100);
    if (j < 0.42) return hole;
    c = mul(mix(C.boneD, C.bone, clamp(k * 1.2 - 0.2)), 0.55 + 0.35 * j); N = [(k - 0.5) * 0.8, 1, (j - 0.5) * 0.8];
  } else if (type < 0.28) { // femur heads end-on, three courses to a row
    const fr = Math.floor(rz / 4.33), q = row * 3 + fr, s = Ux + fr * 2.2, cell = Math.floor(s / 4.4), h = (n) => h2(cell, q, 95 + n);
    const du = s - (cell + 0.5) * 4.4 + (h(0) - 0.5) * 0.9, dv = rz - (fr + 0.5) * 4.33 + (h(1) - 0.5) * 0.6, r = 1.6 + 0.5 * h(2), d = Math.hypot(du, dv) / r;
    if (d > 1 || h(3) < 0.06) return hole;
    c = mix(C.bone, C.boneD, clamp(0.15 + 0.5 * h(4) + 0.35 * d)); N = [du / r * 0.5, 1, dv / r * 0.5];
    if (d < 0.32 && h(5) < 0.35) c = mul(c, 0.55); // its marrow end, broken
  } else if (rz < 4) { // a course of long bones lying along the face, of all lengths
    const s = Ux + row * 7, b = Math.floor(s / 14), h = (n) => h2(b, row, 101 + n), x0 = b * 14 + 3 * h(0), len = 10 + 4 * h(1), ux = s - x0;
    const knob = ux < 2.2 || len - ux < 2.2 ? 1.3 : 1, r = Math.abs(rz - 2 - (h(2) - 0.5) * 0.8) / 2;
    if (ux < 0 || ux > len || r > knob * 0.9) return { c: mul(C.mortar, 0.5), N: [0, 1, 0], ao: 0.5 };
    c = mix(C.bone, C.boneD, clamp(0.2 + 0.5 * h(3) + 0.3 * vn(s / 3, rz, 4))); N = [0, 1, (rz - 2) * 0.5];
  } else { // a course of skulls
    const big = type > 0.88 ? 1.18 : 1, cw = 9 * big, s = Ux + row * 4.5, cell = Math.floor(s / cw), h = (n) => h2(cell, row, 85 + n * 7);
    if (h(0) < 0.12) return hole;
    const sc = big * (0.86 + 0.24 * h(1)), tilt = (h(2) - 0.5) * 0.5, du = s - (cell + 0.5) * cw + (h(3) - 0.5) * 1.4, dv = rz - 8.5 + (h(4) - 0.5) * 1.2 - (1 - sc) * 3;
    const ux = (du * Math.cos(tilt) - dv * Math.sin(tilt)) / sc, uz = (du * Math.sin(tilt) + dv * Math.cos(tilt)) / sc, e = Math.hypot(ux / 4, uz / 4.3);
    if (e > 1) return { c: mul(C.mortar, 0.4), N: [0, 1, 0], ao: 0.4 };
    c = mix(C.bone, C.boneD, clamp(0.1 + 0.45 * h(5) + 0.15 * vn(s / 2, rz / 2, 5) + e * 0.35));
    if (h(6) > 0.14 && (Math.hypot(Math.abs(ux) - 1.5, uz - 0.6) < 1.05 || (Math.abs(ux) < 0.5 && uz < -0.8 && uz > -2.0) || (uz < -2.8 && Math.abs(ux) < 2 && (ux * 3 + 9) % 1 > 0.3))) c = mul(C.mortar, 0.4); // its face: orbits, nose, teeth; or turned away
    N = [ux * 0.18, 1, uz * 0.16];
  }
  c = mix(c, C.grime, clamp((vn(U / 9, Zw / 40, 2) - 0.45) * 2) * 0.6 + 0.4 * clamp((vn(U / 2.5, Zw / 30, 103) - 0.62) * 4)); // grime, damp run down
  return { c: mul(c, 0.8), N, ao };
}
/** A wall of bones (room px rect), its crest a heap of skulls; east-west, its line wobbling a little; north-south, battered
 *  both sides; `end`: collapsed toward its north (1) or south (-1) end, the breach. */
export function boneWall(w) {
  const X0 = wx(w.x0), X1 = wx(w.x1), Y0 = wy(w.y0), Y1 = wy(w.y1), alongX = X1 - X0 > Y1 - Y0, XC = (X0 + X1) / 2, HX = (X1 - X0) / 2;
  const K = alongX ? 0 : Math.min(0.53, (0.8 * HX) / w.h); // the flanks' batter (run over rise: about 62° on the thick walls)
  const top = (x, y) => {
    let h = w.h - 7 * vn(x / 9 + y / 9, 0, 4);
    const k = heap(x, y, 10, 81); h += k.d < 1 ? 4 * Math.sqrt(1 - k.d * k.d) : 0; // the skulls of its crest (its shape kept: its shadow is where the Dawn burns)
    if (w.end) { const t = w.end > 0 ? (Y1 - y) / 140 : (y - Y0) / 140; h *= clamp(0.2 + t * 0.8 + 0.3 * (vn(x / 14, y / 14, 5) - 0.5)); } // fallen in a heap
    return h;
  };
  const bump = (y, z) => { const k = heap(y, z * 1.4, 10, 89); return k.d < 1 ? 3 * Math.sqrt(1 - k.d * k.d) : 0; }; // the flanks' skulls
  const yS = (x) => Y1 - wy(4) * vn(x / 40, 0, 87), yN = (x) => Y0 + wy(4) * 2 * (vn(x / 40, 0, 88) - 0.5); // its line: the south face only ever in
  return {
    sdf: (x, y, z) => {
      const side = alongX ? Math.max(Math.abs(x - XC) - HX, (yN(x) - y) * 0.9, (y - yS(x)) * 0.9) : Math.max((Math.abs(x - XC) - HX + K * z) / Math.hypot(1, K) - bump(y, z) * 0.8, Y0 - y, y - Y1);
      return Math.max(side, -z, (z - top(x, y)) * 0.6);
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      if (nz > 0.75 || (w.end && !alongX && Math.abs(ny) > Math.abs(nx))) return heapMat(x, y); // its crest, its collapsed end
      if (!alongX && Math.abs(nx) > Math.abs(ny)) return heapMat(y, z * 1.4, 89); // its battered flanks: skulls heaped
      const r = boneFace(alongX || Math.abs(ny) > Math.abs(nx) ? x : y * SN, z), c = mix(r.c, C.grime, clamp((vn(x / 9 + y / 9, z / 40, 2) - 0.4) * 2) * 0.5);
      return { alb: mul(z < 18 ? mix(c, C.moss, clamp(fbm(x / 14 + y / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 18)) : c, 0.9),
        N: alongX ? [0, Math.sign(ny) || 1, r.N[2]] : [nx, ny + r.N[0] * 0.3, nz + r.N[2] * 0.3], ao: r.ao, spec: 0.04 };
    },
    bounds: [X0 - 2, Y0 - 2 - wy(4), 0, X1 + 2, Y1 + 2, w.h + 8], step: 0.6,
  };
}
/** Stone slates in rows 7 deep along `v` (up the roof), about 9 wide along `u`, each row slid at random and its slates
 *  of uneven width: each lies on the one below, its lower edge catching the light, the next one's shadow over its top;
 *  some paler, some dark, a few gone (the batten's dark), lichen and moss in its joints. */
export function slate(u, v, seed) {
  const r = Math.floor(v / 7), fv = v - r * 7, su = u + 400 + 9 * h2(r, seed, 92), t0 = Math.floor(su / 9);
  const j = (t) => t * 9 + 2.6 * (h2(t, r, seed + 93) - 0.5); // the joints, uneven
  const t = su < j(t0) ? t0 - 1 : su >= j(t0 + 1) ? t0 + 1 : t0, ex = Math.min(su - j(t), j(t + 1) - su), h = (n) => h2(t, r * 7 + n, seed);
  if (h(0) < 0.03) return mul(C.mortar, 0.6); // a slate gone
  let c = mix(mix(C.stC, C.wallD, h(1)), C.stB, h(2) < 0.2 ? 0.6 : 0);
  c = mul(c, 0.8 + 0.3 * h(3) + 0.15 * (vn(u / 3, v / 3, seed) - 0.5));
  c = mix(c, C.moss, clamp(clamp(vn(u / 20, v / 20, seed) - 0.5) * 1.4 + (ex < 1.6 || fv > 5.4 ? 0.25 * clamp(vn(u / 5, v / 5, seed + 1) - 0.4) : 0)));
  if (vn(u / 2.2, v / 2.2, seed + 2) > 0.8 && h(4) < 0.4) c = mix(c, L('#6a6a52'), 0.45); // lichen
  if (ex < 0.8) return mul(C.mortar, 1.4);
  return mul(c, fv < 1 ? 1.18 : fv > 5.6 ? 0.5 : 1 - 0.06 * fv); // its lit edge, the next one's shadow
}
export const inPointed = (u, z, hw, z0, r) => Math.abs(u) < hw && (z < z0 || Math.hypot(Math.abs(u) + (r - hw), z - z0) < r);
export const archTop = (u, hw, z0, r) => z0 + Math.sqrt(Math.max(0, r * r - (Math.abs(u) + r - hw) ** 2));
/** A gatehouse round a shortcut's opening: two piers and a pointed arch over it, in ashlar, taller than the bone wall
 *  (`Z` tall: the raised gate hides in it). */
export function gatehouse(g, Z = 236) {
  const cx = wx((g.x0 + g.x1) / 2), cy = wy((g.y0 + g.y1) / 2), hw = wx(g.x1 - g.x0) / 2, dy = (wy(g.y1) - wy(g.y0)) / 2 + 3;
  return {
    sdf: (x, y, z) => {
      const u = x - cx;
      let d = sdBox(x, y, z, cx, cy, Z / 2, hw + 18, dy, Z / 2, 1);
      d = Math.max(d, Math.min(hw - Math.abs(u), archTop(u, hw, 64, 40) - z)); // the opening
      d = Math.min(d, sdBox(x, y, z, cx, cy, Z + 3, hw + 22, dy + 3, 3, 1)); // cornice
      return d;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const u = x - cx;
      if (nz > 0.7) return { alb: mul(C.wallD, 0.6) };
      let r = ashlar(x, z, 18, 34, 7);
      if (Math.abs(u) < hw + 12 && z > 50 && !inPointed(u, z, hw, 64, 40) && inPointed(u, z, hw + 10, 64, 50)) r = { c: mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - 64, u) * 4) & 1) ? 0.8 : 1.05), N: [0, 1, 0] };
      return { alb: mul(mix(r.c, C.grime, clamp((vn(x / 9, z / 40, 3) - 0.4) * 2) * 0.6), clamp(1.15 - z / 260)), N: r.N, spec: 0.03, ao: 0.6 + 0.4 * clamp(z / 22) };
    },
    bounds: [cx - hw - 26, cy - dy - 6, 0, cx + hw + 26, cy + dy + 6, Z + 8], step: 0.8,
  };
}
/** A small mausoleum: a stone house with a pitched roof along x, a pediment over its shut door, room px w x d. */
export function mausoleum(w, d, seed) {
  const hw = wx(w) / 2, hd = wy(d) / 2, Hb = 92, Hr = 40;
  return {
    sdf: (x, y, z) => {
      let s = sdBox(x, y, z, 0, 0, Hb / 2, hw - 4, hd - 4, Hb / 2, 1);
      s = Math.min(s, Math.max(sdBox(x, y, z, 0, 0, Hb + Hr / 2, hw, hd, Hr / 2 + 2, 1), (z - Hb - Hr * (1 - Math.abs(y) / hd)) * 0.7)); // roof
      s = Math.min(s, sdBox(x, y, z, 0, 0, 4, hw + 2, hd + 2, 4, 1)); // plinth
      s = Math.max(s, -sdBox(x, y, z, 0, hd - 2, 32, 14, 4, 32)); // the door's recess
      return s - 0.5 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5);
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      if (z > Hb + 1 && nz > 0.3) return { alb: mul(slate(x, z, seed),z < Hb + 6 ? 0.55 + 0.45 * clamp((z - Hb) / 6) : 1), spec: 0.03 }; // stone slates, the eave in shade
      if (Math.abs(x) < 14 && y > hd - 7 && z < 64) return { alb: mul(mix(C.iron, C.rust, vn3(x * 0.3, y, z * 0.3, seed)), ((x + 14) % 5.6 < 1.2 || Math.abs(z - 34) < 1.5) ? 0.55 : 1), spec: 0.3, gloss: 30 }; // the iron door, shut: its bars
      let c = stone3(x, y, z, z > Hb ? mul(C.stB, 1.2) : C.stB, seed), u = Math.abs(ny) > Math.abs(nx) ? x : y, U = Math.abs(ny) > Math.abs(nx) ? hw : hd; // its pediment paler
      if (z > Hb - 7 && z <= Hb) c = mul(c, 1.25); else if (z > Hb - 9 && z <= Hb - 7) c = mul(c, 0.5); // the cornice, its shadow under
      else if (Math.abs(u) > U - 11) c = mul(c, Math.floor(z / 11) & 1 ? 1.12 : 0.92); // quoins at its corners
      else if (ny > 0.5 && Math.abs(x) < 11 && z > 68 && z < 80) c = (z - 71) % 4 < 1 && Math.abs(x) < 8 ? mul(C.mortar, 1.5) : mul(c, 1.3); // a name, cut in a plaque
      c = mix(c, C.grime, clamp((vn(x / 9 + y / 7, z / 40, 2) - 0.4) * 2) * 0.6 + 0.35 * clamp((vn(u / 3, z / 40, seed + 5) - 0.6) * 4) * clamp(z / Hb)); // and damp run down from its eave
      return { alb: c, spec: 0.04 };
    },
    bounds: [-hw - 4, -hd - 4, 0, hw + 4, hd + 4, Hb + Hr + 6], step: 0.75,
  };
}
/** A column of rock from the floor up into the vault, its foot spread and broken. */
export function rockColumn(r, seed) {
  const R0 = wx(r), Hh = 150 + (seed % 5) * 22; // a stump of the rock that held the vault, broken off, its top jagged
  return {
    sdf: (x, y, z) => { const rad = R0 * (0.75 + 0.35 * Math.exp(-z / 40) + 0.12 * Math.sin(z / 50 + seed)) * (0.85 + 0.3 * vn3(x / 14, y / 14, z / 24, seed)), top = Hh - 26 * vn(x / 9 + seed, y / 9, 3);
      return Math.max((Math.hypot(x, y * 1.1) - rad) * 0.55, (z - top) * 0.5); },
    mat: (m, x, y, z, nx, ny, nz) => { const n = fbm3(x * 0.06, y * 0.06, z * 0.03, 3, seed); let c = mix(L('#3a342c'), L('#17140f'), clamp(n * 1.6 - 0.3)); if (nz > 0.6) c = mix(c, C.stC, 0.3); // its broken top, rubble
      c = mix(c, C.moss, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed + 3) - 0.6) * (z < 30 ? 1.5 : 0.4)); return { alb: c, spec: 0.05, gloss: 14 }; },
    bounds: [-R0 * 1.4 - 4, -R0 * 1.4 - 4, 0, R0 * 1.4 + 4, R0 * 1.4 + 4, Hh + 4], step: 0.6,
  };
}
export const rimMat = (m, x, y, z, nx, ny, nz) => { const n = fbm3(x * 0.05, y * 0.05, z * 0.05, 3, 61); return { alb: mul(mix(L('#2a251f'), L('#0e0c0a'), clamp(n * 1.6 - 0.3)), z > 26 ? 0.15 : 0.35), spec: 0.02, rim: 0 }; }; // its top fades into the dark (no sheen of the lights grazing it)

export const charred = (m) => ({ ...m, mat: (...a) => { const r = m.mat(...a); return { ...r, alb: mul(r.alb, 0.3) }; } });
export const stake = (h, seed) =>({ sdf: (x, y, z) => Math.max(Math.hypot(x, y) - 3.2 * clamp((h - z) / 10, 0.2, 1), -z, z - h), mat: (m, x, y, z) => ({ alb: mix(C.wood, C.woodD, vn3(x, y, z * 0.2, seed)) }), bounds: [-4, -4, 0, 4, 4, h + 1], step: 0.7 });
/** The Order's banner on a pole: a dull sun on red, torn at the foot. */
export function banner(seed) {
  return {
    sdf: (x, y, z) => Math.min(Math.hypot(x, y) - 1.6 + (z > 150 ? 9 : 0), Math.max(sdBox(x, y, z, 12, 0, 110, 12, 0.8 + 0.3 * Math.sin(z * 0.2), 34), 80 + 8 * vn(x / 3, 0, seed) - z)),
    mat: (m, x, y, z) => { if (Math.hypot(x, y) < 2.4) return { alb: C.wood }; let c = mix(L('#4a0c10'), L('#26070a'), clamp(fbm(x / 4, z / 4, 3, seed) * 1.6 - 0.3)); const r = Math.hypot(x - 12, z - 120); if (r < 6 || (r < 9 && Math.cos(Math.atan2(z - 120, x - 12) * 8) > 0.4)) c = mix(L('#6a5228'), L('#3a2a12'), vn(x, z, 3)); return { alb: c, wrap: 0.4 }; },
    bounds: [-3, -3, 0, 26, 3, 160], step: 0.6,
  };
}
export const pole = (h) => ({ sdf: (x, y, z) => Math.min(Math.max(Math.hypot(x, y) - 1.5, z - h), sdBox(x, y, z, 0, 0, h + 4, 3.5, 3.5, 5, 1)), mat: (m, x, y, z) => (z > h - 2 ? { alb: mul(L('#a8ac5c'), 0.2), emi: mul(L('#a8ac5c'), 0.5), noAO: true } : ironMat(x, y, z)), bounds: [-5, -5, 0, 5, 5, h + 10], step: 0.7 });
/** The winch that raises a shortcut's portcullis: an iron wheel on a post. */
export const lever = () => ({ sdf: (x, y, z) => Math.min(Math.max(Math.hypot(x, y) - 2.5, z - 40), Math.max(Math.abs(Math.hypot(x, z - 40) - 11) - 1.6, Math.abs(y) - 1.5), Math.max(Math.hypot(x, z - 40) - 2.5, Math.abs(y) - 3)), mat: (m, x, y, z) => ironMat(x, y, z), bounds: [-14, -4, 0, 14, 4, 54], step: 0.7 });
/** A sarcophagus on its plinth, the lid carved with a recumbent shape, cracked. */
export function sarcophagus(seed) {
  return { sdf: (x, y, z) => { let d = sdBox(x, y, z, 0, 0, 14, 38, 18, 14, 1.5); d = Math.min(d, sdBox(x, y, z, 0, 0, 30, 40, 20, 3, 1.2)); d = Math.min(d, sdEll(x, y, z, 0, 0, 34, 28, 9, 4)); d = Math.min(d, sdEll(x, y, z, 30, 0, 35, 6, 6, 5)); return Math.max(d, -(Math.abs(x + 8 + 3 * Math.sin(y * 0.5)) - 0.8)) - 0.4 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5); },
    mat: (m, x, y, z, nx, ny, nz) => { // the lid and its effigy pale, the chest darker under its lip, moss from the foot up, streaks run down
      const effigy = z > 33 && (Math.hypot(x / 28, y / 9) < 1.06 || Math.hypot(x - 30, y) < 6.5), lid = z > 26.5;
      let c = stone3(x, y, z, mul(C.stB, effigy ? 1.45 : lid ? 1.25 : 0.85), seed);
      if (lid && !effigy && nz < 0.5) c = mul(c, 1.2); // its lip catching the light
      if (!lid) c = mul(mix(c, C.grime, clamp((vn(x / 2.5 + y / 2.5, z / 14, seed + 4) - 0.45) * 2.5) * 0.6), z > 24 ? 0.6 : 1); // streaks; in the lid's shade
      return { alb: mix(c, C.moss, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed + 1) - 0.55) * 1.4 * (effigy ? 0.35 : lid ? 0.8 : 1.4 - z / 30)), spec: effigy ? 0.06 : 0.04 }; },
    bounds: [-42, -22, 0, 42, 22, 42], step: 0.7 };
}


// ---------- the vault, never seen, and the light let in through its cracks ----------
/** The crack in a vault `VAULT` high that lets light from the way `dir` fall on floor patch x, y, a (, b) (room px):
 *  its middle on the vault and radii, world units. */
export const crackOver = (dir, [x, y, a, b = a], VAULT) => { const t = VAULT / dir[2]; return [wx(x) + dir[0] * t, wy(y) + dir[1] * t, wx(a), wy(b)]; };
const crack = (x, y, ox, oy, a, b, rag) => { const dx = (x - ox) / a, dy = (y - oy) / b, an = Math.atan2(dy, dx); return 1 - Math.hypot(dx, dy) / (1 - rag / 2 + rag * vn(Math.cos(an) * 2.4 + ox / 50, Math.sin(an) * 2.4 + oy / 50, 77)); }; // ragged by `rag`
// A vault, never seen (a ghost: it only casts shadows), over a zone W world units by RH room px, pierced by `holes`; one
// for each light from the sky.
export const vaultOf = (holes, rag, VAULT, W, RH) => ({ sdf: (x, y, z) => Math.max(Math.abs(z - VAULT - 10) - 10, Math.max(...holes.map(([ox, oy, a, b = a]) => crack(x, y, ox, oy, a, b, rag))) * 60 + 6 * (vn(x / 9, y / 9, 71) - 0.5)),
  mat: () => ({ alb: C.void }), bounds: [-400, -400, VAULT - 2, W + 400, wy(RH) + 400, VAULT + 22], step: 0.8 });

/** The air of the shafts of light through the vault's cracks (`list`: each crack's middle, radii, the light's way,
 *  colour, strength), along each pixel's sight line; added to a chunk's render (`x0`, `y0`: its first texel in the zone)
 *  before it is baked. */
export function shafts(img, x0, y0, list, VAULT) {
  const { W: w, H: h } = img, T0 = 4000;
  // each crack: its middle on the vault, radii, the light's way, colour, strength; and where its shaft lies on screen
  const all = list.map((s) => {
    const [ox, oy, a, b, dir] = s, t = VAULT / dir[2];
    return [...s, [ox, oy * SN - VAULT * CS], [ox - dir[0] * t, (oy - dir[1] * t) * SN], Math.max(a, b * SN) + 24];
  });
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = py * w + px, t = Math.min(img.depth[i], 1e5), sy = y0 + py + 0.5, X = x0 + px + 0.5;
    const P = [X, sy * SN + CS * T0 - CS * t, -sy * CS + SN * T0 - SN * t];
    if (P[2] > VAULT) continue;
    for (const [ox, oy, a, b, dir, col, k0, top, foot, reach] of all) {
      if (segDist(X, sy, top, foot) > reach) continue;
      let k = 0;
      for (let s = 0; P[2] + s * SN < VAULT; s += 3) {
        const qx = P[0], qy = P[1] + s * CS, qz = P[2] + s * SN, u = (VAULT - qz) / dir[2];
        const e = 1 - Math.hypot((qx + dir[0] * u - ox) / a, (qy + dir[1] * u - oy) / b);
        if (e > 0) k += Math.min(1, e * 6) * (0.4 + 0.6 * (1 - qz / VAULT)) * clamp(fbm(qx / 26, qz / 18 + qy / 40, 3, 7) * 2.4 - 0.4);
      }
      if (k > 0) for (let c = 0; c < 3; c++) img.out[i * 3 + c] += col[c] * k * k0;
    }
  }
}
