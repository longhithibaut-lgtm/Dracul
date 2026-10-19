// Scene: the whole refuge complex. Env: WIN="x0,row0,W,H" (native px), HERO=hall|crypt, OUT=name.
// Screen row = 0.616 y - 0.788 z + 130 - row0 ; screen col = x - x0.
import { post, haze, writePNG, L, hex, clamp, lerp, h2, vn, fbm, mix, mul, mulberry32, PALETTE } from './lib.mjs';
import { cam, C, R, G, makeEnv, envShadow, envAO, HT, OWN, KIND, PROF, PROFILES, NX, heightAt, roomAt, isFloor } from './world.mjs';
import { hero } from '../grand/hero.mjs';
import { pillar, sconce, skull, pitBodies, cage } from '../grand/cast.mjs';
import { vesna, severin, magda, lucian, rats, bats } from '../hub/chiefs.mjs';
import { coffin, lid, basin, candles, stall, shelves, desk, ringStakes, pitBones, hideFrame, brazier, dummy, mirror, armchair, candelabra } from '../hub/props.mjs';
import { chiefCoffin, oldCoffin, ladder } from './props2.mjs';

const [X0, ROW0, W, H] = (process.env.WIN || '1130,0,1340,810').split(',').map(Number);
const HERO_AT = process.env.HERO || 'hall', OUT = process.env.OUT || 'test';
const off = -130 + ROW0;
const { s: SN, c: CS } = cam;

// ---------- surface materials ----------
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); }
function polyDist(px, py, pts) { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(px, py, pts[i], pts[i + 1])); return best; }
function flags(x, y, CW, CH, seed) { // irregular flagstones (from the refuge floor)
  const wx = x + (vn(x / 18, y / 18, 5 + seed) - 0.5) * 7, wy = y + (vn(x / 18, y / 18, 6 + seed) - 0.5) * 7;
  const gx = Math.floor(wx / CW), gy = Math.floor(wy / CH);
  let f1 = 1e9, f2 = 1e9, id = 0, ddx = 0, ddy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (gx + i) * CW + 6 + h2(gx + i, gy + j, 71 + seed) * (CW - 12), cy = (gy + j) * CH + 5 + h2(gx + i, gy + j, 72 + seed) * (CH - 10);
    const d = Math.hypot((wx - cx) / CW, (wy - cy) / CH) * 30;
    if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + (gy + j); ddx = (wx - cx) / CW; ddy = (wy - cy) / CH; } else if (d < f2) f2 = d;
  }
  const e = f2 - f1; let c = mul(mix(mix(C.stA, C.stB, h2(id, 0, 73)), C.stC, h2(id, 0, 74) * 0.7), 0.7 + 0.45 * h2(id, 0, 75)); let N = [0, 0, 1];
  if (e < 1.3) c = mix(C.mortar, c, 0.25 * e);
  else { const bev = clamp(1 - (e - 1.3) / 2.2), l = Math.hypot(ddx, ddy) || 1; N = [ddx / l * bev * 0.7 + (h2(id, 1, 76) - 0.5) * 0.12, ddy / l * bev * 0.7 + (h2(id, 2, 76) - 0.5) * 0.12, 1];
    c = mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9 + (id & 7)) - 0.4) * 2) * 0.85); const sp = h2(x * 2 | 0, y * 2 | 0, 11); if (sp < 0.08) c = mul(c, 0.65); else if (sp > 0.97) c = mul(c, 1.25); }
  return { c, N, id };
}
function grime(c, x, y, k = 1) { const f = fbm(x / 50, y / 40, 4, 21); if (f > 0.5) c = mix(c, C.grime, clamp((f - 0.5) * 4) * 0.8 * k); return mul(c, 0.75 + 0.5 * fbm(x / 90, y / 70, 3, 44)); }
function litter(c, x, y, N) { const cx = Math.floor(x / 6), cy = Math.floor(y / 6), r = h2(cx, cy, 300);
  if (r < 0.03) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 6 + 3), ly = y - (cy * 6 + 3); const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.5 && Math.abs(u) < 3.5) return [r < 0.01 ? C.bone : mix(C.straw, mul(C.straw, 0.6), h2(cx, cy, 302)), [0, 0, 1]]; }
  return [c, N]; }
// stains: [x, y, rx, ry, color, amount, seed, wet]
const STAINS = [
  [1800, 1560, 90, 70, C.bloodD, 0.75, 41, 1], [1800, 1250, 60, 40, C.bloodD, 0.5, 42, 1], [1450, 1700, 80, 40, C.grime, 0.7, 44, 0], [2200, 1800, 70, 50, C.grime, 0.6, 45, 0],
  [1800, 290, 90, 30, C.ash, 0.75, 46, 0], [1840, 330, 30, 14, C.ashD, 0.7, 47, 0], [1530, 470, 60, 18, C.bloodD, 0.5, 48, 1], [2070, 670, 50, 16, C.bloodD, 0.5, 49, 1], [1420, 700, 50, 30, C.grime, 0.7, 50, 0],
  [2600, 1380, 70, 30, C.grime, 0.8, 51, 0], [2620, 1360, 20, 10, C.blood, 0.7, 52, 1], [900, 1500, 60, 30, C.bloodD, 0.6, 53, 1], [1000, 1760, 40, 20, C.blood, 0.6, 54, 1], [2700, 2000, 60, 40, C.grime, 0.6, 55, 0],
  [1220, 760, 40, 60, C.grime, 0.6, 56, 0], [2080, 1980, 50, 20, C.bloodD, 0.6, 57, 1],
  ...[...Array(9)].map((_, k) => [1770 + Math.sin(k * 1.3) * 14, 2140 - k * 52, 16, 22, C.bloodD, 0.65, 60 + k, 1]),
];
const CHANNELS = [ // offering grooves bleeding toward the basin from every doorway
  [[1150, 1650], [1450, 1640], [1740, 1590]], [[2450, 1345], [2200, 1420], [1860, 1530]], [[2450, 1905], [2150, 1800], [1860, 1590]], [[1220, 1170], [1400, 1380], [1745, 1540]],
];
const SLABS = [[1460, 1330, 0.1], [2140, 1340, -0.05], [1500, 2000, 0.08], [2120, 2030, 0], [2300, 1600, 0.1], [1330, 1880, -0.1], [1620, 420, 0], [1980, 420, 0], [1620, 650, 0.05], [1980, 640, -0.04], [1450, 560, 0.1], [2160, 560, 0]];
function slabAt(x, y) {
  for (const [sx, sy, a] of SLABS) { const ca = Math.cos(a), sa = Math.sin(a), u = (x - sx) * ca + (y - sy) * sa, v = -(x - sx) * sa + (y - sy) * ca;
    if (Math.abs(u) < 18 && Math.abs(v) < 34) { let c = mul(mix(C.stB, C.wall, 0.4), 0.85 + 0.3 * vn(u / 6, v / 6, 3)); const bu = 18 - Math.abs(u), bv = 34 - Math.abs(v);
      if (Math.min(bu, bv) < 1.1) c = C.mortar; else if (Math.abs(Math.min(bu, bv) - 3.5) < 0.6) c = mul(c, 0.5);
      else if (Math.abs(u) < 1.0 && v > -24 && v < 8 || Math.abs(v + 14) < 1.0 && Math.abs(u) < 8) c = mul(c, 0.45);
      else if (v > 14 && v < 28 && ((v | 0) % 4 === 0) && vn(u * 0.8, v, 9) > 0.3) c = mul(c, 0.6);
      return mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9) - 0.45) * 2) * 0.8); } }
  return null;
}
function runner(x, y, cx, y0, y1, hw) { // worn red carpet strip
  const u = x - cx, fray = vn(x * 0.9, 0, 5) * 5; if (Math.abs(u) > hw || y < y0 - fray || y > y1 + fray || vn(x / 6, y / 6, 61) > 0.86) return null;
  const bd = Math.min(hw - Math.abs(u), y - y0, y1 - y); let rc = mix(C.rug, C.rugD, clamp(fbm(x / 5, y / 5, 3, 62) * 1.6 - 0.3));
  if (bd > 3 && bd < 5) rc = mix(C.rugB, C.rugD, 0.55); else if (bd < 1.5) rc = C.rugD;
  return mix(rc, C.grime, clamp((fbm(x / 12, y / 12, 3, 63) - 0.5) * 2) * 0.6);
}
function floorMat(x, y, z, room) {
  let c, N = [0, 0, 1], spec = 0.04, gloss = 12, wet = 0;
  if (room === R.ARENA) {
    const dx = x - G.arena.c[0], dy = y - G.arena.c[1], r = Math.hypot(dx, dy);
    if (z < -1) { // pit floor: trampled dirt, blood, claw furrows
      c = mix(C.dirt, C.dirtD, clamp(fbm(x / 8, y / 8, 3, 91) * 1.5 - 0.3)); const v = fbm(x / 14, y / 10, 3, 92); c = mix(c, v > 0.6 ? C.blood : C.bloodD, clamp((v - 0.5) * 3) * 0.75); if (v > 0.55) wet = 0.5;
      for (let k = 0; k < 9; k++) { const a = h2(k, 1, 93) * 3, cx = G.arena.c[0] + (h2(k, 2, 93) - 0.5) * 360, cy = G.arena.c[1] + (h2(k, 3, 93) - 0.5) * 300; for (let j = 0; j < 3; j++) { const o = [Math.cos(a + 1.57) * j * 2.5, Math.sin(a + 1.57) * j * 2.5]; if (segDist(x, y, [cx + o[0], cy + o[1]], [cx + o[0] + Math.cos(a) * 16, cy + o[1] + Math.sin(a) * 16]) < 0.6) c = mul(C.dirtD, 0.5); } }
    } else { const f = flags(x, y, 34, 26, 3); c = f.c; N = f.N; c = grime(c, x, y);
      if (r < G.arena.pit + 8) { c = mix(mix(C.wall, C.stB, vn(x / 4, y / 4, 3)), C.bloodD, vn(x / 6, y / 6, 5) > 0.6 ? 0.6 : 0); N = r > G.arena.pit + 4 ? [0, 0, 1] : [dx / r * 0.6, dy / r * 0.6, 1]; if (((Math.atan2(dy, dx) * 60) % 1 + 1) % 1 < 0.05) c = C.mortar; }
      if (vn(x / 30, y / 30, 94) > 0.62) c = mix(c, C.bloodD, 0.6); }
  } else if (room === R.VES) { // rotten boards, straw, rat droppings
    const bw = 13, k = Math.floor(y / bw), u = y - k * bw, off2 = h2(k, 0, 3) * 80, seg = Math.floor((x + off2) / 70);
    c = mix(C.wood, C.woodD, clamp(vn(x * 0.06, y * 0.9, k) * 1.4 - 0.2)); c = mul(c, 0.7 + 0.5 * h2(k, seg, 4));
    if (u < 1 || ((x + off2) % 70) < 1) c = C.mortar; if (vn(x / 9, y / 9, 7) > 0.6) c = mix(c, C.straw, 0.7); if (h2(x * 1.5 | 0, y * 1.5 | 0, 8) < 0.01) c = C.mortar;
    c = grime(c, x, y, 0.8);
  } else if (room === R.SEV) { // checkered marble gone dull, cracked, chalk diagram
    const t = 32, i = Math.floor(x / t), j = Math.floor(y / t); const dark = (i + j) & 1;
    c = dark ? C.marbleB : C.marbleA; c = mix(c, mul(c, 0.6), vn(x / 8, y / 8, i * 7 + j)); if (!dark && Math.abs(Math.sin(x * 0.2 + y * 0.13 + vn(x / 20, y / 20, 2) * 6)) < 0.04) c = mul(c, 0.6);
    const ex = Math.min(x - i * t, y - j * t); if (ex < 0.8) c = C.mortar; spec = 0.35; gloss = 50;
    if (vn(x / 14, y / 14, 3) > 0.7) c = mix(c, C.grime, 0.7);
    const dx = x - 2700, dy = y - 1990, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if ((Math.abs(r - 70) < 0.8 || (Math.abs(r - 40) < 0.6 && Math.sin(a * 6) > 0) || (r < 70 && r > 10 && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.47)) && vn(x / 3, y / 3, 81) > 0.35) c = mix(c, C.chalk, 0.45);
    for (let k = 0; k < 8; k++) { const ka = k * Math.PI / 4 + 0.39, fx = Math.cos(ka) * 55, fy = Math.sin(ka) * 55; const d = Math.hypot(dx - fx, (dy - fy) * 0.8); if (d < 3 && d > 1.6) c = mix(c, C.chalk, 0.4); }
    c = grime(c, x, y, 0.5);
  } else if (room === R.STAIR) {
    const d = -z; c = mix(C.stB, C.stC, vn(x / 6, y / 6, 3)); const k = (y - G.stair[1]) % 20; if (k > 17) c = mul(c, 0.6);
    c = mix(c, C.grime, clamp(fbm(x / 9, y / 9, 3, 4) - 0.3)); c = mul(c, clamp(1 - d / 110) * 0.9 + 0.1); if (vn(x / 7, y / 5, 9) > 0.66) c = mix(c, C.moss, 0.5);
  } else { // stone flags: hall, crypt, Lucian, corridors
    const big = room === R.CRYPT; const f = flags(x, y, big ? 52 : 40, big ? 38 : 30, room * 13); c = f.c; N = f.N;
    const sl = slabAt(x, y); if (sl) { c = sl; N = [0, 0, 1]; }
    c = grime(c, x, y);
    const m = fbm(x / 26, y / 22, 4, 33); if (m > 0.66) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? C.mossL : C.moss, clamp((m - 0.66) * 4) * 0.7);
    [c, N] = litter(c, x, y, N);
    let rr = null;
    if (room === R.HALL) rr = runner(x, y, 1800, 1150, 1500, 30) || runner(x, y, 1800, 1630, 2170, 30);
    else if (room === R.COR && x > 1700 && x < 1900) rr = runner(x, y, 1800, 770, 1170, 30);
    else if (room === R.CRYPT) rr = runner(x, y, 1800, 300, 790, 30);
    if (rr) { c = rr; N = [0, 0, 1]; spec = 0.02; }
    if (room === R.LUC) for (const [px, py, a] of [[1190, 640, 0.4], [1250, 700, -0.3], [1170, 480, 1.1], [1260, 420, 0.9], [1210, 780, 0.2], [1180, 300, -0.6], [1240, 250, 0.3]]) { const u = (x - px) * Math.cos(a) + (y - py) * Math.sin(a), v = -(x - px) * Math.sin(a) + (y - py) * Math.cos(a);
      if (Math.abs(u) < 7 && Math.abs(v) < 5) { c = mix(C.paper, C.paperD, vn(u, v, 3)); if (Math.abs(Math.sin(u * 1.4 + v * 0.3)) < 0.15) c = mix(c, C.ink, 0.6); N = [0, 0, 1]; } }
    if (room === R.CRYPT || room === R.COR) for (let k = 0; k < 14; k++) { const px = 1830 + (k & 1) * 9 - k * 1.5, py = 310 + k * 30; if (Math.hypot((x - px) / 2.4, (y - py) / 3.8) < 1 && HERO_AT === 'hall') c = mix(c, C.ash, 0.75 - k * 0.04); } // ash footprints leaving the coffin
    if (room === R.CRYPT && HERO_AT === 'crypt') for (let k = 0; k < 4; k++) { const px = 1838 + (k & 1) * 8, py = 300 + k * 10; if (Math.hypot((x - px) / 2.4, (y - py) / 3.8) < 1) c = mix(c, C.ash, 0.8); }
  }
  for (const [sx, sy, rx, ry, col, amt, seed, w] of STAINS) { const dx = (x - sx) / rx, dy = (y - sy) / ry, dd = dx * dx + dy * dy; if (dd > 3) continue;
    const v = 1 - Math.sqrt(dd) + (fbm(x / 6, y / 6, 3, seed) - 0.5) * 1.1; if (v > 0) { const a = clamp(v * 3) * amt; c = mix(c, col, a); if (w) wet = Math.max(wet, a); } }
  if (room === R.HALL || room === R.COR) for (const g of CHANNELS) { const d = polyDist(x + (vn(y / 9, x / 9, 66) - 0.5) * 5, y + (vn(x / 9, y / 9, 67) - 0.5) * 3, g); if (d < 2.4) { c = mix(C.mortar, C.bloodD, d < 1.3 && vn(x / 5, y / 5, 68) > 0.25 ? 0.85 : 0.2); N = [0, 0, 1]; wet = Math.max(wet, d < 1.3 ? 0.6 : 0.2); } }
  if (wet > 0.2) { spec = 0.55 * wet; gloss = 70; }
  return { alb: c, N, spec, gloss, ao: envAO(x, y, z) };
}
// ---------- wall faces ----------
function ashlar(x, z, rh, bw, seed) {
  const row = Math.floor(z / rh), rz = z - row * rh, ox = (row * bw * 0.5) % bw, col = Math.floor((x + ox) / bw), rx = x + ox - col * bw, id = col * 131 + row + seed;
  let c = mul(mix(C.wall, C.wallD, h2(id, 0, 3) * 0.8), 0.8 + 0.4 * h2(id, 1, 4)), N = [0, 1, 0];
  const ex = Math.min(rx, bw - rx), ez = Math.min(rz, rh - rz);
  if (ex < 1.3 || ez < 1.3) c = C.mortar;
  else { if (ez < 3) N = [0, 1, rz < rh / 2 ? -0.6 : 0.6]; else if (ex < 3) N = [rx < bw / 2 ? -0.6 : 0.6, 1, 0]; c = mix(c, C.grime, clamp((fbm(x / 8, z / 8, 3, 7) - 0.45) * 2) * 0.8); }
  return { c, N };
}
function ossuary(x, z) {
  const band = 13, row = Math.floor(z / band), rz = z - row * band; let c, N = [0, 1, 0], ao = 1;
  if (rz < 4) { const seg = 15, ux = ((x + row * 7) % seg + seg) % seg, r = Math.abs(rz - 2) / 2, knob = Math.min(ux, seg - ux) < 2.2 ? 1.25 : 1;
    if (r < knob * 0.9) { c = mix(C.bone, C.boneD, vn(x / 3, z, 4) * 0.8); N = [0, 1, (rz - 2) * 0.5]; } else { c = mul(C.mortar, 0.5); ao = 0.5; } }
  else { const cw = 9, ux = ((x + row * 4.5) % cw + cw) % cw - cw / 2, uz = rz - 8.5, e = Math.hypot(ux / 4.0, uz / 4.3);
    if (e < 1) { c = mix(C.bone, C.boneD, clamp(vn(x / 2, z / 2, 5) * 0.9 + e * 0.4)); if (Math.hypot(Math.abs(ux) - 1.5, uz - 0.6) < 1.05 || (Math.abs(ux) < 0.5 && uz < -0.8 && uz > -2.0) || (uz < -2.8 && Math.abs(ux) < 2)) c = mul(C.mortar, 0.4); N = [ux * 0.18, 1, uz * 0.16]; }
    else { c = mul(C.mortar, 0.4); ao = 0.4; } }
  return { c: mul(mix(c, C.grime, clamp((vn(x / 9, z / 40, 2) - 0.45) * 2) * 0.6), 0.8), N, ao };
}
function books(x, z) { // Lucian's wall: shelves of books, rolled maps and bat droppings, all the way up
  const sh = 44, k = Math.floor(z / sh), rz = z - k * sh;
  if (rz < 3) return { c: mix(C.wood, C.woodD, vn(x / 5, z, 3)), N: [0, 1, rz < 1.5 ? 0.6 : -0.3] };
  if (Math.abs(((x - 1150) % 70) - 35) > 33) return { c: C.woodD, N: [0, 1, 0] };
  const bi = Math.floor((x + h2(k, 0, 5) * 9) / 4.2), bh = 22 + h2(bi, k, 6) * 16; const gap = h2(bi, k, 7);
  if (rz - 3 > bh || gap < 0.1) return { c: mul(C.mortar, 0.6), N: [0, 1, 0], ao: 0.5 };
  if (gap < 0.2) { const r = Math.abs(rz - 3 - 5); return { c: mix(C.paper, C.paperD, r / 5), N: [0, 1, (rz - 8) * 0.1] }; } // rolled maps
  let c = C.book[(h2(bi, k, 8) * 6) | 0]; c = mul(c, 0.7 + 0.5 * h2(bi, k, 9)); if (Math.abs(rz - 3 - bh * 0.8) < 1) c = mix(c, L('#6a5a30'), 0.6);
  if (vn(x / 6, z / 30, 12) > 0.7) c = mix(c, L('#8a8470'), 0.5); // guano streaks
  return { c, N: [((x % 4.2) - 2.1) * 0.15, 1, 0] };
}
function bigMap(x, z) { // Lucian's plan of the cathedral, pinned among the shelves
  const x0 = 1166, x1 = 1274, z0 = 140, z1 = 246; const u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0);
  const edge = Math.min(u, 1 - u, v, 1 - v) * 60 + (vn(x / 3, z / 3, 7) - 0.5) * 3; if (edge < 0) return null;
  let c = mix(C.paper, C.paperD, clamp(vn(x / 8, z / 8, 3) * 1.4 - 0.2 + (edge < 2 ? 0.5 : 0)));
  const X = (u - 0.5) * 60, Z = (v - 0.4) * 80;
  const nave = Math.abs(X) < 6 && Math.abs(Z) < 26, trans = Math.abs(Z - 6) < 5 && Math.abs(X) < 20, tower = Math.abs(X) < 4 && Z > 26 && Z < 46;
  const inside = nave || trans || tower, out = inside && !(Math.abs(X) < 5 && Math.abs(Z) < 25 || Math.abs(Z - 6) < 4 && Math.abs(X) < 19 || Math.abs(X) < 3 && Z > 26 && Z < 45);
  if (out) c = mix(c, C.ink, 0.85); if (tower && ((Z | 0) % 5 === 0)) c = mix(c, C.ink, 0.7);
  for (const [mx, mz] of [[-15, 6], [15, 6], [0, -18], [0, 40]]) if (Math.abs(Math.hypot(X - mx, Z - mz) - 3) < 0.8) c = mix(c, C.bloodF, 0.9);
  return { c: mix(c, C.grime, clamp((vn(x / 12, z / 12, 9) - 0.5) * 2) * 0.5), N: [0, 1, 0] };
}
function wallFace(x, y, z, i, room) {
  let r;
  if (room === R.LUC && y < 140) r = bigMap(x, z) || books(x, z);
  else if (room === R.SEV) { // damask wallpaper peeling off the stone, dark wainscot
    const a = ashlar(x, z, 24, 50, 9); r = a;
    if (z < 40) { r = { c: mix(L('#1e1612'), L('#120c0a'), vn(x / 4, z / 9, 3)), N: [0, 1, 0] }; if (Math.abs(z - 38) < 1.5) r.N = [0, 1, 0.6]; }
    else if (vn(x / 24, z / 20, 5) > 0.36) { const u = ((x % 26) + 26) % 26 - 13, v = ((z % 34) + 34) % 34 - 17; const motif = Math.abs(Math.hypot(u * 1.3, v) - 9 - 2 * Math.sin(Math.atan2(v, u) * 4)) < 1.4;
      r = { c: mix(motif ? L('#4e3a5a') : C.violet, C.violetD, clamp(vn(x / 30, z / 50, 6) * 1.4 - 0.3)), N: [0, 1, 0] }; }
  } else if (room === R.VES) { r = ashlar(x, z, 20, 34, 5); r.c = mul(r.c, 0.85); }
  else if (room === R.ARENA) { r = ashlar(x, z, 34, 70, 7);
    for (let k = 0; k < 4; k++) if (Math.abs(((x + z * 0.35) % 60) - 30 - k * 3) < 0.6 && z > 30 && z < 90 && vn(x / 60, 0, 4) > 0.55) r.c = mul(C.mortar, 1.2); // claw rakes
    if (vn(x / 7, z / 7, 8) > 0.7 && z < 70) r.c = mix(r.c, C.bloodD, 0.8); }
  else r = ashlar(x, z, room === R.CRYPT ? 24 : 26, room === R.CRYPT ? 46 : 62, room);
  // stone moulding framing carved openings on the front face
  const pi = PROF[i]; if (pi && KIND[i + NX] !== 2) { let near = 99; for (const [dx, dz] of [[-4, 0], [4, 0], [0, 4], [-8, 0], [8, 0], [0, 8], [-3, 3], [3, 3]]) for (const [a, b] of PROFILES[pi](x + dx)) if (z + dz > a && z + dz < b) near = Math.min(near, Math.hypot(dx, dz));
    if (near < 9) { const c0 = mix(L('#625644'), C.grime, clamp((fbm(x / 6, z / 6, 3, 8) - 0.4) * 2) * 0.6); r = { c: near < 5 ? c0 : mul(c0, 0.8), N: near < 5 ? [0, 1, 0.35] : [0, 1, -0.2] }; } }
  // recess backs (niches, apses)
  const s = i + NX; const pS = PROF[s];
  if (pS && KIND[s] !== 1) { const back = room === R.CRYPT ? (z > 80 ? ossuary(x, z) : null) : (room === R.HALL ? ossuary(x, z) : null);
    if (back) r = back; else r = { c: mul(r.c, 0.6), N: r.N }; r.ao = (r.ao || 1) * 0.55; }
  let c = r.c;
  c = mix(c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.6);
  if (z < 26) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 26));
  const fade = clamp(1.1 - z / (room === R.LUC ? 600 : 300)); c = mul(c, fade);
  const ao = (r.ao || 1) * (0.55 + 0.45 * clamp(z / 22));
  return { alb: c, N: r.N, spec: 0.03, gloss: 10, ao };
}
function mats(x, y, z, face, i, p) {
  const room = OWN[i], kind = KIND[i];
  if (face) return wallFace(x, y, z, i, room);
  if (kind === 1 || (kind === 3 && z < 1)) return floorMat(x, y, z, room === 0 ? R.HALL : room);
  if (kind === 0) return { alb: C.void, noAO: true };
  if (p && z < HT[i] - 1) { const c = mix(C.stA, C.grime, vn(x / 5, y / 5, 3)); return { alb: mul(c, 0.7), ao: 0.6 }; } // niche sill
  // wall top: dark, with a worn lip along the visible edge
  const lip = !isFloor(x, y + 3) ? 0 : 1; const e = heightAt(x, y + 2.5) < HT[i] - 1 ? 1 : 0;
  return { alb: e ? mul(C.wallD, 0.6) : mix(L('#0c0a08'), L('#14110d'), vn(x / 6, y / 6, 3)), N: [0, e ? 0.3 : 0, 1], noAO: true, rim: 0 };
}
const env = makeEnv(mats);

// ---------- objects ----------
const objects = [];
const add = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const lw = (o, l) => [o.pos[0] + Math.cos(o.yaw) * l[0] - Math.sin(o.yaw) * l[1], o.pos[1] + Math.sin(o.yaw) * l[0] + Math.cos(o.yaw) * l[1], o.pos[2] + l[2]];
const rnd = mulberry32(7);
// hero
const hz = hero('idle');
const HP = HERO_AT === 'crypt' ? [1868, 330, 0.25] : [1880, 1700, 0.55];
const oHero = add('hero', hz, [HP[0], HP[1], 0], HP[2], { id: 60 });
// --- crypt ---
const cof = coffin(); add('coffin', cof, [1800, 250, 0]); add('lid', lid(), [1712, 258, 0], Math.PI / 2);
add('candlesC', candles([[1736, 226, 8, 10, 1.3], [1738, 274, 8, 6, 1.2], [1864, 226, 8, 12, 1.3], [1866, 272, 8, 5, 1.1], [1728, 290, 0, 4, 1.1], [1873, 288, 0, 7, 1.2], [1760, 180, 6, 14, 1.4], [1790, 176, 6, 9, 1.3], [1840, 178, 6, 16, 1.4], [1812, 172, 6, 6, 1.2], [1770, 166, 6, 4, 1.1], [1828, 168, 6, 11, 1.2]]), [0, 0, 0]);
const CHIEFC = [['rat', 1530, 430], ['brume', 1530, 640], ['loup', 2070, 430], ['chauve-souris', 2070, 640]];
CHIEFC.forEach(([k, x, y], n) => add('cc_' + k, chiefCoffin(k, n + 1), [x, y, 0]));
[[1428, 174, 1, 1], [1568, 174, 2, 0], [2032, 174, 3, 2], [2172, 174, 4, 1]].forEach(([x, y, s, st]) => add('niche' + s, oldCoffin(s, st), [x, y, 14]));
add('oldFloor1', oldCoffin(7, 2), [1410, 730, 0], 0.35); add('oldFloor2', oldCoffin(8, 1), [2190, 740, 0], -0.25);
for (const [x, y, z, yaw] of [[1410, 176, 98, 0.3], [1440, 172, 98, -0.4], [1556, 174, 98, 0.1], [1584, 178, 98, 0.6], [2020, 176, 98, -0.2], [2160, 174, 98, 0.4], [2186, 178, 98, -0.5], [1500, 760, 0, 1.2], [2110, 720, 0, -0.9], [1660, 520, 0, 0.4], [1950, 560, 0, 2.2]]) add('skullC', skull(), [x, y, z], yaw);
add('candlesN', candles([[1450, 192, 14, 7, 1.1], [1590, 192, 14, 4, 1.0], [2010, 192, 14, 9, 1.1], [2190, 192, 14, 5, 1.0], [1450, 186, 98, 5, 1.0], [1548, 184, 98, 3, 1.0], [2050, 186, 98, 6, 1.1], [2150, 186, 98, 4, 1.0], [1385, 760, 0, 8, 1.2], [2230, 770, 0, 5, 1.1]]), [0, 0, 0]);
add('candelabraC1', candelabra(), [1700, 400, 0]); add('candelabraC2', candelabra(), [1900, 400, 0]); add('candelabraC3', candelabra(), [1700, 700, 0]); add('candelabraC4', candelabra(), [1900, 700, 0]);
add('bonesC1', pitBones(11), [1440, 330, 0]); add('bonesC2', pitBones(13), [2160, 520, 0]); add('bonesC3', pitBones(17), [1780, 560, 0]);
add('ratsC', rats([[1500, 470, 0, 1.2], [1560, 690, 0, -2.0], [1460, 720, 0, 0.5]]), [0, 0, 0]);
// --- Lucian ---
const mL = lucian(); const oL = add('lucian', mL, [1236, 690, 0], -0.35, { id: 64 });
add('desk', desk(), [1220, 580, 0]); add('candlesL', candles([[1176, 106, 223, 5, 1.1], [1186, 107, 223, 3, 1.0], [1266, 106, 311, 6, 1.1], [1206, 106, 135, 4, 1.0], [1214, 107, 135, 7, 1.1]]), [0, 0, 0]); add('ladder', ladder(430, 26), [1262, 104, 0]);
add('batsL', bats([[1160, 104, 470, 0.1, 'hang'], [1184, 104, 470, -0.2, 'hang'], [1198, 104, 426, 0.3, 'hang'], [1230, 104, 382, 0, 'hang'], [1170, 104, 338, 0.2, 'hang'], [1250, 104, 470, -0.1, 'hang'], [1280, 104, 294, 0, 'hang'], [1196, 104, 250, 0.1, 'hang'],
  [1206, 300, 330, 0.15, 'fly'], [1250, 420, 260, -0.35, 'fly'], [1180, 520, 300, 0.4, 'fly'], [1236, 230, 420, -0.2, 'fly']]), [0, 0, 0], 0, { id: 65 });
// --- great hall ---
add('basin', basin(), [1800, 1560, 0]);
{ const bc = [], r2 = mulberry32(3); for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + 0.2 + (r2() - 0.5) * 0.3, r = 50 + r2() * 10; bc.push([1800 + Math.cos(a) * r, 1560 + Math.sin(a) * r * 0.9, 0, 4 + r2() * 9, 1.1 + r2() * 0.5]); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.6; bc.push([1800 + Math.cos(a) * 42, 1560 + Math.sin(a) * 42, 5, 3 + r2() * 5, 1.0]); } add('candlesB', candles(bc), [0, 0, 0]); }
const HBZ = [[1330, 1330], [2270, 1330], [1330, 1960], [2270, 1960]]; HBZ.forEach(([x, y], k) => add('brazierH' + k, brazier(), [x, y, 0]));
add('candlesD', candles([[1756, 1000, 0, 8, 1.2], [1846, 960, 0, 5, 1.1], [1752, 880, 0, 6, 1.1], [1194, 1100, 0, 7, 1.1], [1246, 1000, 0, 4, 1.0]]), [0, 0, 0]);
for (const x of [1440, 1680, 1920, 2160, 2380]) add('sconceH', sconce(0.8), [x, 1160, 128]);
add('candlesA', candles([[1520, 1150, 6, 9, 1.2], [1540, 1146, 6, 5, 1.1], [1590, 1148, 6, 12, 1.3], [2010, 1150, 6, 7, 1.1], [2060, 1146, 6, 11, 1.2], [2080, 1150, 6, 4, 1.0]]), [0, 0, 0]);
const bzL = brazier(); add('brazierS1', bzL, [1700, 2110, 0]); add('brazierS2', bzL, [1900, 2110, 0]);
for (const [x, y, yaw] of [[1500, 1300, 0.4], [2050, 1350, -0.8], [1350, 2050, 1.2], [2300, 1980, 2.2], [1620, 2050, 0.3], [2330, 1250, -0.5], [1990, 1820, 0.9]]) add('skullH', skull(), [x, y, 0], yaw);
for (const [x, y, sd] of [[1240, 1300, 21], [1260, 2060, 23], [2350, 2070, 25], [1560, 1240, 27], [2080, 1260, 29], [1500, 1780, 31], [2130, 1640, 33]]) add('bonesH', pitBones(sd), [x, y, 0]);
add('oldH1', oldCoffin(12, 2), [1240, 1820, 0], 1.3); add('oldH2', oldCoffin(14, 1), [2370, 1560, 0], -1.5);
add('cageH1', cage(34, 26, 62), [1230, 1440, 0], 0.2); add('skullCg1', skull(), [1232, 1442, 0], 0.5); add('skullCg2', skull(), [2378, 1758, 0], -1.0); add('cageH2', cage(34, 26, 62), [2380, 1760, 0], -0.3);
add('ratsH', rats([[1650, 1650, 0, 1.0], [1990, 1500, 0, -2.5], [2440, 1360, 0, 3.0], [2380, 1330, 0, 0.3]]), [0, 0, 0]);
add('batsH', bats([[1300, 1280, 150, 0.2, 'fly'], [1360, 1350, 120, -0.4, 'fly']]), [0, 0, 0], 0, { id: 66 });
// --- Magda's arena ---
const AC = G.arena.c;
add('ring', ringStakes(316, 30), [AC[0], AC[1], 0]);
add('pitBones1', pitBones(3), [AC[0] - 60, AC[1] + 60, -48]); add('pitBones2', pitBones(5), [AC[0] + 130, AC[1] - 60, -48]); add('pitBones3', pitBones(9), [AC[0] - 140, AC[1] - 110, -48]); add('pitBodies', pitBodies(9, 150, 60), [AC[0] + 20, AC[1] - 10, -48]);
const bzA = brazier(); const BRZA = [0.6, 2.2, 3.8, 5.3].map(a => [AC[0] + Math.cos(a) * 395, AC[1] + Math.sin(a) * 395]);
BRZA.forEach(([x, y], k) => add('brazierA' + k, bzA, [x, y, 0]));
for (const [x, yaw] of [[440, 0.25], [650, 0], [860, -0.25]]) { const y = AC[1] - Math.sqrt(G.arena.R ** 2 - (x - AC[0]) ** 2) + 26; add('hide', hideFrame(), [x, y, 0], yaw); }
const mM = magda(); add('magda', mM, [1010, 1740, 0], 0.5, { id: 63 });
for (const [x, y, yaw] of [[300, 1700, 0.4], [520, 1980, -0.8], [980, 1500, 1.2]]) add('skullA', skull(), [x, y, 0], yaw);
// --- Vesna ---
add('shelves', shelves(180), [2600, 1250, 0]);
const st = stall(); const oSt = add('stall', st, [2610, 1335, 0]);
const mV = vesna(); const oV = add('vesna', mV, [2672, 1396, 0], -0.5, { id: 61 });
add('candlesV', candles([[2690, 1410, 0, 6, 1.2], [2694, 1416, 0, 3.5, 1.1]]), [0, 0, 0]);
const sh = lw(oV, [8.5, 2.5, 63.5]);
add('ratsV', rats([[2560, 1390, 0, 1.2], [2520, 1300, 0, -0.5], [2690, 1290, 0, 2.0], [2620, 1415, 0, -2.5], [sh[0], sh[1], sh[2], -0.6], [2470, 1350, 0, 0.9]]), [0, 0, 0]);
// --- Séverin ---
add('dummy', dummy(), [2590, 1800, 0], -1.0); for (const [k, x, y] of [[1, 2428, 1296], [2, 2428, 1398], [3, 2428, 1846], [4, 2428, 1966], [5, 1176, 1594], [6, 1176, 1708]]) add('candelabraD' + k, candelabra(), [x, y, 0]);
add('sconceS', sconce(0.8), [2600, 1700, 120]);
add('mirror', mirror(), [2880, 1760, 0], 0.35); add('armchair', armchair(), [2900, 2060, 0], 0.95);
add('candelabra1', candelabra(), [2820, 1752, 0]); add('candelabra2', candelabra(), [2540, 2040, 0]);
const mS = severin(); add('severin', mS, [2720, 1940, 0], 0.55, { id: 62 });

// ---------- lights ----------
const LANT = lw(oHero, hz.P._lantern), LCAN = lw(oL, mL.P._candle), LAMP = lw(oSt, st.lamp);
const chars = ['hero', 'vesna', 'severin', 'magda', 'lucian', 'batsL', 'batsH', 'ratsV', 'ratsH', 'ratsC'];
const lights = [
  { name: 'lantern', p: LANT, c: L('#d0cc78'), I: 6, r0: 44, R: 280, pad: 3.6, soft: 6, haze: 0.012, hazeR: 4 },
  // crypt
  { p: [1800, 262, 48], c: L('#d89048'), I: 3.6, r0: 55, R: 300, soft: 8, haze: 0.012, hazeR: 10, skip: ['candlesC'] },
  { p: [1800, 190, 40], c: L('#e0a050'), I: 2.6, r0: 40, R: 240, soft: 6, haze: 0.02, hazeR: 8, skip: ['candlesC'] },
  ...CHIEFC.map(([k, x, y]) => ({ p: [x - 50, y - 12, 56], c: L('#d89a50'), I: 3.2, r0: 40, R: 280, soft: 5, haze: 0.015, hazeR: 4, skip: ['cc_' + k] })),
  ...[1428, 1568, 2032, 2172].map(x => ({ p: [x + (x < 1800 ? 14 : -14), 190, 112], c: L('#d89a50'), I: 1.4, r0: 25, R: 140, soft: 4, haze: 0.02, hazeR: 4, skip: ['candlesN'] })),
  ...[1428, 1568, 2032, 2172].map(x => ({ p: [x + 10, 214, 70], c: L('#d89a50'), I: 1.8, r0: 35, R: 240, soft: 5, haze: 0.015, hazeR: 5 })),
  { p: [1800, 480, 120], c: L('#b07a48'), I: 0.9, r0: 200, R: 600, noShadow: true },
  { p: [1386, 770, 14], c: L('#d89a50'), I: 2.4, r0: 30, R: 220, soft: 4, skip: ['candlesN'] }, { p: [2230, 778, 12], c: L('#d89a50'), I: 2.2, r0: 30, R: 220, soft: 4, skip: ['candlesN'] },
  { p: [1800, 760, 60], c: L('#5a6a78'), I: 0.9, r0: 120, R: 420, noShadow: true },
  ...[[1700, 400], [1900, 400], [1700, 700], [1900, 700]].map(([x, y], k) => ({ p: [x, y, 74], c: L('#d8b070'), I: 2.4, r0: 40, R: 260, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabraC' + (k + 1)] })),
  // Lucian
  { p: [1254, 588, 52], c: L('#e0b060'), I: 2.2, r0: 30, R: 260, soft: 5, haze: 0.02, hazeR: 6, skip: ['desk'] },
  { name: 'lucCandle', p: LCAN, c: L('#e0b060'), I: 1.6, r0: 30, R: 160, pad: 2, soft: 4, haze: 0.02, hazeR: 3, skip: ['lucian'] },
  { p: [1220, 330, 300], c: L('#56688a'), I: 3.6, r0: 160, R: 600, soft: 10 },
  { p: [1181, 112, 232], c: L('#e0b060'), I: 1.6, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] }, { p: [1266, 112, 320], c: L('#e0b060'), I: 1.6, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] }, { p: [1210, 112, 145], c: L('#e0b060'), I: 1.8, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] },
  // hall
  { name: 'basin', p: [1810, 1612, 15], c: L('#e09a50'), I: 5.5, r0: 60, R: 380, soft: 8, haze: 0.02, hazeR: 12, skip: ['candlesB'] },
  { p: [1794, 1498, 42], c: L('#d88a44'), I: 2.2, r0: 50, R: 260, soft: 8, skip: ['candlesB'] },
  ...[1440, 1680, 1920, 2160, 2380].map(x => ({ p: [x, 1170, 146], c: L('#c8783a'), I: 2.2, r0: 45, R: 320, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceH'] })),
  { p: [1560, 1150, 22], c: L('#d89a50'), I: 1.3, r0: 30, R: 200, soft: 4, skip: ['candlesA'] }, { p: [2040, 1150, 22], c: L('#d89a50'), I: 1.3, r0: 30, R: 200, soft: 4, skip: ['candlesA'] },
  { p: [1700, 2110, 40], c: L('#e07a30'), I: 4.5, r0: 45, R: 340, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazierS1'] },
  { p: [1900, 2110, 40], c: L('#e07a30'), I: 4.5, r0: 45, R: 340, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazierS2'] },
  { p: [1800, 2330, -40], c: L('#6a8478'), I: 2.4, r0: 60, R: 260, soft: 8 },
  ...HBZ.map(([x, y], k) => ({ p: [x, y, 40], c: L('#e07a30'), I: 4.2, r0: 50, R: 420, pad: 6, soft: 6, haze: 0.035, hazeR: 10, skip: ['brazierH' + k] })),
  { p: [1800, 1650, 260], c: L('#8a6a50'), I: 0.7, r0: 400, R: 1000, noShadow: true },
  { p: [1800, 960, 30], c: L('#d89a50'), I: 1.8, r0: 40, R: 240, soft: 4, skip: ['candlesD'] }, { p: [1220, 1050, 30], c: L('#d89a50'), I: 1.4, r0: 40, R: 220, soft: 4, skip: ['candlesD'] },
  // arena
  { p: [650, 1600, 260], c: L('#8a5a40'), I: 0.6, r0: 400, R: 800, noShadow: true },
  ...BRZA.map(([x, y], k) => ({ p: [x, y, 40], c: L('#e07a30'), I: 5.0, r0: 50, R: 460, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazierA' + k] })),
  // Vesna
  { name: 'lamp', p: LAMP, c: L('#d8a050'), I: 5.2, r0: 45, R: 280, pad: 4, soft: 5, haze: 0.03, hazeR: 5 },
  { p: [2692, 1412, 14], c: L('#d89a50'), I: 2.0, r0: 30, R: 160, soft: 4, haze: 0.02, hazeR: 4, skip: ['candlesV'] },
  ...[[1, 2428, 1296], [2, 2428, 1398], [3, 2428, 1846], [4, 2428, 1966], [5, 1176, 1594], [6, 1176, 1708]].map(([k, x, y]) => ({ p: [x, y, 74], c: L('#d8b070'), I: 2.6, r0: 40, R: 260, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabraD' + k] })),
  { p: [650, 1640, -20], c: L('#a0402a'), I: 1.2, r0: 200, R: 420, noShadow: true },
  // Séverin
  { p: [2600, 1712, 140], c: L('#c8783a'), I: 2.4, r0: 45, R: 320, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceS'] },
  { p: [2820, 1752, 74], c: L('#d8b070'), I: 3.2, r0: 40, R: 280, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra1'] },
  { p: [2540, 2040, 74], c: L('#d8b070'), I: 3.0, r0: 40, R: 280, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra2'] },
  { p: [2730, 1960, 14], c: L('#8a82a6'), I: 1.0, r0: 100, R: 300, noShadow: true },
  // cold rim lights on the figures (from behind, like the dungeon)
  ...[[1800, 100], [1800, 1300], [700, 1450], [2650, 1250], [2700, 1750], [1220, 400]].map(([x, y]) => ({ p: [x, y - 220, 190], c: L('#9aa8a4'), I: 2.4, r0: 400, R: 900, soft: 10, only: chars, noEnv: true })),
];
const SC = { W, H, cam, off, offX: X0, objects, lights, env, envShadow, ambient: L('#22262a') };
export async function scene() { return SC; }

// ---------- post ----------
const PAL = [...PALETTE, ...['#141a26', '#1e283a', '#2c3a52', '#2a2830', '#3e3a46', '#58525f', '#6e6680', '#9a92aa'].map(h => hex(h).map(v => v * 255))];
const FONT = { '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'] };
export function hud(rgba, w, x0 = 24, y0 = 20) {
  const put = (x, y, h) => { const c = hex(h); const i = (y * w + x) * 4; rgba[i] = c[0] * 255; rgba[i + 1] = c[1] * 255; rgba[i + 2] = c[2] * 255; };
  const drop = ['....#....', '....#....', '...###...', '...###...', '..#####..', '.#######.', '.#######.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'];
  for (let x = x0; x <= x0 + 68; x++) for (let y = y0; y <= y0 + 18; y++) put(x, y, (x === x0 || x === x0 + 68 || y === y0 || y === y0 + 18) ? '#3e362b' : '#0c0a08');
  drop.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '#') return; const left = x < 4, top = y < 7; put(x0 + 5 + x, y0 + 3 + y, (x === 3 && y > 5 && y < 10) ? '#b42c1e' : left && !top ? '#781116' : left ? '#951c18' : y > 9 ? '#3e060b' : '#5a0a10'); }));
  [...'1486'].forEach((ch, k) => FONT[ch].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') { put(x0 + 19 + k * 7 + x + 1, y0 + 6 + y + 1, '#030303'); put(x0 + 19 + k * 7 + x, y0 + 6 + y, y < 2 ? '#ece2c6' : '#cfc2a2'); } })));
}
export async function finish(img, sc) {
  const T0 = 4000;
  // mist pooling over Séverin's floor, and a little breathing out of the brume coffin
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, t = img.depth[i]; if (t > 1e8) continue;
    const sy = py + 0.5 + off; const y = sy * SN + CS * T0 - CS * t, z = sy * -CS + SN * T0 - SN * t, x = px + 0.5 + X0;
    let m = 0;
    if (x > 2440 && y > 1640) m = 0.7 * clamp(1.2 - Math.hypot((x - 2730) / 300, (y - 1930) / 240)) ** 1.2;
    m += 0.8 * clamp(1 - Math.hypot((x - 1530) / 90, (y - 660) / 50));
    if (m <= 0) continue;
    const n = fbm(x / 70 + z * 0.02, y / 9, 4, 301); const dens = clamp(m * (0.25 + clamp(n * 2.2 - 0.75)) * Math.exp(-Math.max(0, z - (x < 2000 ? 50 : 0) + 2) / 16) * 1.1);
    const mc = [0.052, 0.046, 0.056];
    for (let k = 0; k < 3; k++) img.out[i * 3 + k] = img.out[i * 3 + k] * (1 - dens * 0.7) + mc[k] * dens;
  }
  // cobwebs in the upper corners of rooms and arches (screen space, thin pale threads)
  const P2 = (x, y, z) => [x - X0, y * SN - z * CS - off];
  const webAt = (x, y, z, dir, size, seed) => { const [cx, cy] = P2(x, y, z); const rr = mulberry32(seed);
    const plot = (px, py, a) => { px |= 0; py |= 0; if (px < 0 || py < 0 || px >= W || py >= H) return; const i = py * W + px; for (let k = 0; k < 3; k++) img.out[i * 3 + k] = lerp(img.out[i * 3 + k], 0.05, a); };
    const n = 4 + (rr() * 3 | 0), rays = []; for (let k = 0; k < n; k++) { const a = (k / (n - 1)) * Math.PI / 2 + (rr() - 0.5) * 0.3; rays.push([Math.cos(a) * dir, Math.sin(a), size * (0.7 + rr() * 0.4)]); }
    for (const [dx, dy, l] of rays) for (let t = 0; t < l; t += 0.5) plot(cx + dx * t, cy + dy * t + Math.sin(t / l * Math.PI) * l * 0.05, 0.2 * (1 - t / l * 0.5));
    for (let ring = 1; ring <= 4; ring++) { const rad = size * ring / 4.6 * (0.9 + rr() * 0.2); for (let k = 0; k < n - 1; k++) { if (rr() < 0.25) continue; const [ax, ay] = rays[k], [bx, by] = rays[k + 1]; for (let t = 0; t <= 1; t += 0.04) { const sag = Math.sin(t * Math.PI) * rad * 0.12; plot(cx + (ax + (bx - ax) * t) * rad + 0, cy + (ay + (by - ay) * t) * rad + sag, 0.15); } } } };
  const WEBS = [[1350, 200, 210, 1, 34], [2250, 200, 210, -1, 34], [1150, 100, 440, 1, 30], [1290, 100, 440, -1, 26], [1150, 1160, 230, 1, 40], [2450, 1160, 230, -1, 40], [2500, 1250, 145, 1, 22], [2700, 1250, 145, -1, 26],
    [2500, 1700, 192, 1, 30], [2960, 1700, 192, -1, 36], [1366, 200, 128, 1, 16], [1490, 200, 128, -1, 14], [2110, 200, 128, 1, 14], [2234, 200, 128, -1, 16], [1700, 200, 205, 1, 22], [1900, 200, 205, -1, 22], [1740, 1160, 228, 1, 18], [1860, 1160, 228, -1, 18]];
  WEBS.forEach(([x, y, z, d, sz], k) => webAt(x, y, z, d, sz, k + 3));
  haze(img, sc);
  const rgba = post(img, { exposure: 3.4, vignette: Number(process.env.VIG ?? 0.2), desat: 0.16, grain: 0.012, dither: 0.02, palette: PAL });
  writePNG(OUT + '-native.png', rgba, W, H, 1);
  writePNG(OUT + '.png', rgba, W, H, 2);
  const fs = await import('fs'); fs.writeFileSync(OUT + '.rgba', Buffer.from(rgba.buffer));
}
