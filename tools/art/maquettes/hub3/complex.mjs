// Scene: the whole refuge complex, in one of three progression states.
// Env: STATE=debut|rat|milieu|complet (rat: Vesna alone freed, the game's refuge once she is), WIN="x0,row0,W,H" (native px), HERO=hall|crypt, OUT=name.
// Screen row = 0.616 y - 0.788 z + 130 - row0 ; screen col = x - x0.
import { post, haze, writePNG, L, hex, clamp, lerp, h2, vn, fbm, mix, mul, mulberry32, PALETTE } from './lib.mjs';
import { cam, C, R, G, ROOMS, makeEnv, envShadow, envAO, HT, OWN, KIND, PROF, PROFILES, NX, heightAt, roomAt, isFloor, floorDist } from './world.mjs';
import { hero } from '../grand/hero.mjs';
import { sconce, skull, pitBodies, cage, hangingCorpse, slumped } from '../grand/cast.mjs';
import { vesna, severin, magda, lucian, rats, bats } from './chiefs3.mjs';
import { coffin, candles, stall, shelves, ringStakes, pitBones, hideFrame, mirror, candelabra } from '../hub/props.mjs';
import { oldCoffin, ladder } from './props2.mjs';
import { candles2, sideDoor, doorFrame, archSeal, chiefCoffin, lidUpright, pew, statue, offering, rubble, trainingDummy, weaponRack, grindstone, writingDesk, armoire, coatRail, chest, jarCrate, trophyPike, sideTable, basin2, brazier2, fencingDummy, armchair2 } from './props3.mjs';

const STATE = process.env.STATE || 'complet', S = { debut: 0, rat: 0, milieu: 1, complet: 2 }[STATE];
const FREE = { rat: S >= 1 || STATE === 'rat', brume: S >= 1, loup: S >= 2, bat: S >= 2 }, UP = S >= 2;
const [X0, ROW0, W, H] = (process.env.WIN || '120,-200,2870,1840').split(',').map(Number);
const HERO_AT = process.env.HERO || (S === 0 ? 'crypt' : 'hall'), OUT = process.env.OUT || 'test';
const off = -130 + ROW0;
const { s: SN, c: CS } = cam;
const sealed = room => (room === R.VES && !FREE.rat) || (room === R.SEV && !FREE.brume) || (room === R.ARENA && !FREE.loup) || (room === R.LUC && !FREE.bat);
const HC = { rat: L('#9aa08e'), brume: L('#9a7ec0'), loup: L('#b02a22'), bat: L('#5a78c8') }; // house colours (station marks)

// ---------- surface materials ----------
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); }
function polyDist(px, py, pts) { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(px, py, pts[i], pts[i + 1])); return best; }
function flags(x, y, CW, CH, seed) {
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
  return { c, N, id, e };
}
function grime(c, x, y, k = 1) { const f = fbm(x / 50, y / 40, 4, 21); if (f > 0.5) c = mix(c, C.grime, clamp((f - 0.5) * 4) * 0.8 * k); return mul(c, 0.75 + 0.5 * fbm(x / 90, y / 70, 3, 44)); }
const DUST = L('#4a463e');
const dust = (c, x, y, k) => mix(c, mix(DUST, C.grime, vn(x / 6, y / 6, 7) * 0.5), clamp(k * (0.6 + 0.6 * fbm(x / 30, y / 30, 3, 12))));
function litter(c, x, y, N) { const cx = Math.floor(x / 6), cy = Math.floor(y / 6), r = h2(cx, cy, 300);
  if (r < 0.03) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 6 + 3), ly = y - (cy * 6 + 3); const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.5 && Math.abs(u) < 3.5) return [r < 0.01 ? C.bone : mix(C.straw, mul(C.straw, 0.6), h2(cx, cy, 302)), [0, 0, 1]]; }
  return [c, N]; }
const STAINS = [
  [1800, 1560, 90, 70, C.bloodD, 0.75, 41, 1], [1800, 1250, 60, 40, C.bloodD, 0.5, 42, 1], [1450, 1700, 80, 40, C.grime, 0.7, 44, 0], [2200, 1800, 70, 50, C.grime, 0.6, 45, 0],
  [1800, 290, 90, 30, C.ash, 0.75, 46, 0], [1840, 330, 30, 14, C.ashD, 0.7, 47, 0], [1530, 470, 60, 18, C.bloodD, 0.5, 48, 1], [2070, 670, 50, 16, C.bloodD, 0.5, 49, 1], [1420, 700, 50, 30, C.grime, 0.7, 50, 0],
  [2600, 1380, 70, 30, C.grime, 0.8, 51, 0], [2620, 1360, 20, 10, C.blood, 0.7, 52, 1], [900, 1500, 60, 30, C.bloodD, 0.6, 53, 1], [1000, 1760, 40, 20, C.blood, 0.6, 54, 1], [2700, 2000, 60, 40, C.grime, 0.6, 55, 0],
  [1220, 760, 40, 60, C.grime, 0.6, 56, 0], [2080, 1980, 50, 20, C.bloodD, 0.6, 57, 1], [1700, 1648, 40, 18, C.bloodD, 0.7, 58, 1], [1910, 1486, 40, 18, C.bloodD, 0.7, 59, 1], [2440, 780, 60, 30, C.grime, 0.6, 70, 0],
  ...[...Array(9)].map((_, k) => [1770 + Math.sin(k * 1.3) * 14, 2140 - k * 52, 16, 22, C.bloodD, 0.65, 60 + k, 1]),
];
// offering grooves bleeding toward the basin from each house's door: they fill as the houses come back
const CHANNELS = [
  [[[1150, 1650], [1450, 1640], [1740, 1590]], FREE.loup], [[[2450, 1345], [2200, 1420], [1860, 1530]], FREE.rat], [[[2450, 1905], [2150, 1800], [1860, 1590]], FREE.brume], [[[1220, 1170], [1400, 1380], [1745, 1540]], FREE.bat],
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
function runner(x, y, cx, y0, y1, hw) {
  const u = x - cx, fray = vn(x * 0.9, 0, 5) * 5; if (Math.abs(u) > hw || y < y0 - fray || y > y1 + fray || vn(x / 6, y / 6, 61) > 0.86) return null;
  const bd = Math.min(hw - Math.abs(u), y - y0, y1 - y); let rc = mix(C.rug, C.rugD, clamp(fbm(x / 5, y / 5, 3, 62) * 1.6 - 0.3));
  if (bd > 3 && bd < 5) rc = mix(C.rugB, C.rugD, 0.55); else if (bd < 1.5) rc = C.rugD;
  return mix(rc, C.grime, clamp((fbm(x / 12, y / 12, 3, 63) - 0.5) * 2) * 0.6);
}
// station marks: where the hero stands to talk to a chief (a worn rug in the house colour, its sign, a faint glow), and the dummy's ring
const DUMMY = [1420, 2010];
const STATIONS = [
  FREE.rat && { c: [2610, 1398], rx: 44, ry: 26, col: HC.rat, rug: L('#3a3a32'), sign: 'rat' },
  FREE.brume && { c: [2730, 1960], rx: 62, ry: 54, col: HC.brume, rug: L('#2a2034'), sign: 'brume' },
  FREE.loup && { c: [985, 1530], rx: 50, ry: 40, col: HC.loup, rug: L('#2e0e0a'), sign: 'loup' },
  FREE.bat && { c: [1220, 636], rx: 40, ry: 30, col: HC.bat, rug: L('#141a2e'), sign: 'chauve-souris' },
  { c: DUMMY, rx: 70, ry: 56, col: L('#7a6a50'), rug: null, ring: 'chalk' },
  { c: [2470, 812], rx: 34, ry: 24, col: L('#6a5a7a'), rug: L('#24161a') }, // wardrobe: a small rug before the mirror
].filter(Boolean);
import { sign } from './props2.mjs';
function station(c, x, y) {
  let glow = 0;
  for (const s of STATIONS) { const u = (x - s.c[0]) / s.rx, v = (y - s.c[1]) / s.ry, r = Math.hypot(u, v); if (r > 1.25) continue;
    const ragged = r + (vn(x / 3, y / 3, 17) - 0.5) * 0.06;
    if (s.rug && ragged < 1) { let rc = mix(s.rug, mul(s.rug, 0.5), clamp(fbm(x / 4, y / 4, 3, 19) * 1.5 - 0.3)); if (Math.abs(ragged - 0.86) < 0.035 || Math.abs(ragged - 0.78) < 0.02) rc = mix(rc, s.col, 0.55); // woven border
      if (s.sign && sign(s.sign, u / 0.55, -v / 0.55)) rc = mix(rc, s.col, 0.45); c = mix(rc, C.grime, clamp((fbm(x / 9, y / 9, 3, 23) - 0.55) * 2) * 0.5); }
    if (s.ring === 'chalk') { const a = Math.atan2(v, u); if ((Math.abs(r - 1) < 0.025 || Math.abs(r - 0.4) < 0.03 && Math.sin(a * 10) > 0) && vn(x / 2, y / 2, 31) > 0.3) c = mix(c, C.chalk, 0.55); // chalk ring, foot marks
      for (let k = 0; k < 6; k++) { const ka = k * 1.047 + 0.3, fx = Math.cos(ka) * 0.72, fy = Math.sin(ka) * 0.72; if (Math.hypot(u - fx, (v - fy) * 1.4) < 0.07) c = mix(c, C.bloodD, 0.7); } }
    if (Math.abs(ragged - 1.0) < 0.03 && s.rug) { c = mix(c, s.col, 0.7); glow = 0.35; }
  }
  return [c, glow];
}
function floorMat(x, y, z, room) {
  let c, N = [0, 0, 1], spec = 0.04, gloss = 12, wet = 0, emi = 0;
  const shut = sealed(room);
  if (room === R.ARENA) {
    const dx = x - G.arena.c[0], dy = y - G.arena.c[1], r = Math.hypot(dx, dy);
    if (z < -1) {
      c = mix(C.dirt, C.dirtD, clamp(fbm(x / 8, y / 8, 3, 91) * 1.5 - 0.3)); const v = fbm(x / 14, y / 10, 3, 92); c = mix(c, v > 0.6 ? C.blood : C.bloodD, clamp((v - 0.5) * 3) * (shut ? 0.35 : 0.75)); if (v > 0.55 && !shut) wet = 0.5;
      for (let k = 0; k < 9; k++) { const a = h2(k, 1, 93) * 3, cx = G.arena.c[0] + (h2(k, 2, 93) - 0.5) * 360, cy = G.arena.c[1] + (h2(k, 3, 93) - 0.5) * 300; for (let j = 0; j < 3; j++) { const o = [Math.cos(a + 1.57) * j * 2.5, Math.sin(a + 1.57) * j * 2.5]; if (segDist(x, y, [cx + o[0], cy + o[1]], [cx + o[0] + Math.cos(a) * 16, cy + o[1] + Math.sin(a) * 16]) < 0.6) c = mul(C.dirtD, 0.5); } }
    } else { const f = flags(x, y, 34, 26, 3); c = f.c; N = f.N; c = grime(c, x, y);
      if (r < G.arena.pit + 8) { c = mix(mix(C.wall, C.stB, vn(x / 4, y / 4, 3)), C.bloodD, vn(x / 6, y / 6, 5) > 0.6 ? 0.6 : 0); N = r > G.arena.pit + 4 ? [0, 0, 1] : [dx / r * 0.6, dy / r * 0.6, 1]; if (((Math.atan2(dy, dx) * 60) % 1 + 1) % 1 < 0.05) c = C.mortar; }
      if (vn(x / 30, y / 30, 94) > 0.62) c = mix(c, C.bloodD, shut ? 0.3 : 0.6); }
  } else if (room === R.VES) {
    const bw = 13, k = Math.floor(y / bw), u = y - k * bw, off2 = h2(k, 0, 3) * 80;
    c = mix(C.wood, C.woodD, clamp(vn(x * 0.06, y * 0.9, k) * 1.4 - 0.2)); c = mul(c, 0.7 + 0.5 * h2(k, Math.floor((x + off2) / 70), 4));
    if (u < 1 || ((x + off2) % 70) < 1) c = C.mortar; if (vn(x / 9, y / 9, 7) > 0.6) c = mix(c, C.straw, 0.7); if (h2(x * 1.5 | 0, y * 1.5 | 0, 8) < 0.01) c = C.mortar;
    c = grime(c, x, y, 0.8);
  } else if (room === R.SEV) {
    const t = 32, i = Math.floor(x / t), j = Math.floor(y / t); const dark = (i + j) & 1;
    c = dark ? C.marbleB : C.marbleA; c = mix(c, mul(c, 0.6), vn(x / 8, y / 8, i * 7 + j)); if (!dark && Math.abs(Math.sin(x * 0.2 + y * 0.13 + vn(x / 20, y / 20, 2) * 6)) < 0.04) c = mul(c, 0.6);
    const ex = Math.min(x - i * t, y - j * t); if (ex < 0.8) c = C.mortar; spec = shut ? 0.1 : 0.35; gloss = 50;
    if (vn(x / 14, y / 14, 3) > (UP ? 0.8 : 0.7)) c = mix(c, C.grime, 0.7);
    if (UP && Math.hypot((x - 2890) / 70, (y - 2020) / 50) < 1) { const rr = Math.hypot((x - 2890) / 70, (y - 2020) / 50); c = mix(L('#3a2448'), L('#1e1426'), clamp(fbm(x / 4, y / 4, 3, 5) * 1.5 - 0.3)); if (Math.abs(rr - 0.86) < 0.03) c = L('#6a5228'); spec = 0.05; } // a rug laid under the chair
    c = grime(c, x, y, 0.5);
  } else if (room === R.STAIR) {
    const d = -z; c = mix(C.stB, C.stC, vn(x / 6, y / 6, 3)); const k = (y - G.stair[1]) % 20; if (k > 17) c = mul(c, 0.6);
    c = mix(c, C.grime, clamp(fbm(x / 9, y / 9, 3, 4) - 0.3)); c = mul(c, clamp(1 - d / 110) * 0.9 + 0.1); if (vn(x / 7, y / 5, 9) > 0.66) c = mix(c, C.moss, 0.5);
  } else { // stone flags: hall, crypt, Lucian, corridors, wardrobe
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
    if (room === R.LUC && !shut) for (const [px, py, a] of [[1190, 700, 0.4], [1250, 740, -0.3], [1170, 480, 1.1], [1260, 420, 0.9], [1210, 800, 0.2], [1180, 300, -0.6], [1240, 250, 0.3], ...(UP ? [[1175, 560, 0.7], [1265, 600, -0.8], [1200, 860, 1.4], [1255, 330, 0.1], [1170, 380, -0.3]] : [])]) { const u = (x - px) * Math.cos(a) + (y - py) * Math.sin(a), v = -(x - px) * Math.sin(a) + (y - py) * Math.cos(a);
      if (Math.abs(u) < 7 && Math.abs(v) < 5) { c = mix(C.paper, C.paperD, vn(u, v, 3)); if (Math.abs(Math.sin(u * 1.4 + v * 0.3)) < 0.15) c = mix(c, C.ink, 0.6); N = [0, 0, 1]; } }
    if ((room === R.CRYPT || room === R.COR) && HERO_AT === 'hall') for (let k = 0; k < 14; k++) { const px = 1830 + (k & 1) * 9 - k * 1.5, py = 310 + k * 30; if (Math.hypot((x - px) / 2.4, (y - py) / 3.8) < 1) c = mix(c, C.ash, 0.75 - k * 0.04); }
    if (room === R.CRYPT && HERO_AT === 'crypt') for (let k = 0; k < 4; k++) { const px = 1838 + (k & 1) * 8, py = 300 + k * 10; if (Math.hypot((x - px) / 2.4, (y - py) / 3.8) < 1) c = mix(c, C.ash, 0.8); }
  }
  for (const [sx, sy, rx, ry, col, amt, seed, w] of STAINS) { const dx = (x - sx) / rx, dy = (y - sy) / ry, dd = dx * dx + dy * dy; if (dd > 3) continue;
    if (S === 0 && col !== C.ash && col !== C.ashD && w && room !== R.STAIR) continue; // nobody has bled here for a long time
    const v = 1 - Math.sqrt(dd) + (fbm(x / 6, y / 6, 3, seed) - 0.5) * 1.1; if (v > 0) { const a = clamp(v * 3) * amt; c = mix(c, col, a); if (w) wet = Math.max(wet, a); } }
  if (room === R.HALL || room === R.COR) for (const [g, full] of CHANNELS) { const d = polyDist(x + (vn(y / 9, x / 9, 66) - 0.5) * 5, y + (vn(x / 9, y / 9, 67) - 0.5) * 3, g); if (d < 2.4) { c = full ? mix(C.mortar, C.bloodD, d < 1.3 && vn(x / 5, y / 5, 68) > 0.25 ? 0.85 : 0.2) : mul(C.mortar, d < 1.3 ? 0.7 : 1.3); N = [0, 0, 1]; if (full) wet = Math.max(wet, d < 1.3 ? 0.6 : 0.2); } }
  // derelict: dust over sealed rooms, and over the whole hall before the first rescue
  if (shut) c = dust(c, x, y, 0.55); else if (S === 0 && (room === R.HALL || room === R.CRYPT || room === R.COR || room === R.WARD)) c = dust(c, x, y, 0.32 * (1 - clamp(1 - Math.abs(x - 1800) / 40)));
  let glow; [c, glow] = station(c, x, y); if (glow) N = [0, 0, 1];
  if (wet > 0.2) { spec = 0.55 * wet; gloss = 70; }
  return { alb: c, N, spec, gloss, ao: envAO(x, y, z), emi: glow ? mul(c, glow * 0.15) : undefined };
}
// ---------- the rock the refuge is carved into: masonry where walls are, then raw necropolis earth with roots and old bones ----------
const LD = [-0.45, -0.35, 0.82];
function rootAt(x, y) { // tree roots of the cemetery above: meandering, tapering dark cords; returns [t across (0 centre..1 edge), side] or null
  const w = fbm(x / 170 + 3, y / 170, 3, 410) - 0.5, rv = fbm(x / 110 + w * 2.2, y / 110 - w * 2.2, 3, 411) - 0.5;
  const thick = 0.004 + 0.01 * clamp(vn(x / 260, y / 260, 412) * 1.6 - 0.4);
  if (Math.abs(rv) < thick) return [Math.abs(rv) / thick, Math.sign(rv)];
  const rv2 = fbm(x / 40 + 9, y / 40, 2, 413) - 0.5; if (Math.abs(rv2) < 0.006 && vn(x / 70, y / 70, 414) > 0.55) return [0.7, 1];
  return null;
}
function rockColor(x, y, d) {
  const n1 = fbm(x / 80, y / 80, 4, 401), n2 = fbm(x / 7, y / 7, 3, 402);
  let c = mix(L('#2a241d'), L('#3a3229'), clamp(n1 * 1.6 - 0.3)); c = mix(c, L('#17130f'), clamp((n2 - 0.42) * 2.4) * 0.65);
  const cr = Math.abs(fbm(x / 60 + n1 * 1.5, y / 60, 3, 403) - 0.5); if (cr < 0.01) c = mul(c, 0.4); else if (cr < 0.018) c = mul(c, 0.75);
  return c;
}
function rockTop(x, y, z, kind) {
  const d = floorDist(x, y);
  let c, N = [0, 0, 1];
  if (kind === 2 || d < 22) { // top of the walls: big dressed blocks, the thickness of the masonry
    const bw = 30, bh = 18, row = Math.floor(y / bh), ox = (row & 1) * 15, bx = ((x + ox) % bw + bw) % bw, by = y - row * bh; const bid = Math.floor((x + ox) / bw) * 31 + row;
    c = mix(L('#332d25'), L('#26211b'), h2(bid, 1, 407)); if (bx < 1.2 || by < 1.2) c = L('#0e0c0a'); else if (bx > bw - 2.5 || by > bh - 2.5) N = [0.3, 0.3, 1];
    c = mix(c, L('#18140f'), clamp((fbm(x / 9, y / 9, 3, 408) - 0.45) * 2) * 0.8);
  } else {
    c = rockColor(x, y, d);
    const sc = 13, si = Math.floor(x / sc), sj = Math.floor(y / sc); // stones bedded in the earth
    if (h2(si, sj, 420) < 0.22) { const u = x - (si + 0.3 + h2(si, sj, 423) * 0.4) * sc, v = y - (sj + 0.3 + h2(si, sj, 424) * 0.4) * sc, rr = 2.2 + h2(si, sj, 421) * 3.2; const q = Math.hypot(u, v * 1.2) / rr; if (q < 1) { c = mix(L('#3e372d'), L('#2a251e'), h2(si, sj, 422)); N = [u / rr * 0.6, v / rr * 0.6, 1]; } }
    const bc = 52, bi = Math.floor(x / bc), bj = Math.floor(y / bc), r = h2(bi, bj, 415); // old burials: a skull, a long bone
    if (r < 0.07 && d > 30) { const cx = (bi + 0.3 + h2(bi, bj, 416) * 0.4) * bc, cy = (bj + 0.3 + h2(bi, bj, 417) * 0.4) * bc, a = h2(bi, bj, 418) * 3.14; const u = (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a), v = -(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
      const BONE = mix(L('#5e5646'), L('#3a342a'), vn(x / 2, y / 2, 419));
      if (r < 0.025) { if (Math.hypot(u / 4.2, v / 5) < 1) { c = BONE; N = [u * 0.12, v * 0.1, 1]; if (Math.hypot(Math.abs(u) - 1.6, v - 1) < 1.0 || Math.abs(u) < 0.5 && v < -1 && v > -2.2) c = L('#0a0806'); } }
      else if (Math.max(Math.abs(u) - 8, 0) ** 2 + v * v < 1.0 || Math.hypot(Math.abs(u) - 8, v) < 1.6) { c = BONE; N = [0, v * 0.3, 1]; } }
  }
  const rt = rootAt(x, y); if (rt) { const [t, sd] = rt; c = mix(mul(c, 0.8), L('#100d0a'), clamp(1.2 - t * 0.6 + (sd > 0 ? 0.1 : -0.2))); N = [0, sd * t * 0.4, 1]; }
  const nl = Math.hypot(...N); N = N.map(v => v / nl);
  const lam = 0.45 + 0.55 * Math.max(0, N[0] * LD[0] + N[1] * LD[1] + N[2] * LD[2]);
  const k = [0.22, 0.3, 0.3][S] * lam * (0.4 + 0.6 * Math.exp(-d / 280)) * (kind === 2 || d < 22 ? 1.15 : 1);
  return { alb: mul(c, 0.15), N, noAO: true, emi: mul(c, k), rim: 0, spec: 0 };
}
function rockFace(x, z, top) { // the cut ends of walls seen from the south: rough rock, a course of masonry at the top
  let c = rockColor(x * 1.3, z * 2.2 + 900, 99), N = [0, 1, 0];
  if (Math.abs(((z + vn(x / 30, 0, 5) * 6) % 23) - 11) > 10.3) c = mul(c, 0.55); // strata
  if (top - z < 14) c = mix(L('#2e2922'), L('#1e1a15'), vn(x / 5, z / 5, 6));
  const rt = wallRoots(x, z, top); if (rt) { c = rt.c; N = rt.N; }
  return { alb: mul(c, 0.2), N, spec: 0, ao: 1, emi: mul(c, [0.13, 0.18, 0.18][S] * (0.6 + 0.4 * clamp(z / top))) };
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
function books(x, z) { // Lucian's wall: shelves of books and rolled maps; bare and webbed while he is still captive
  const sh = 44, k = Math.floor(z / sh), rz = z - k * sh;
  if (rz < 3) return { c: mix(C.wood, C.woodD, vn(x / 5, z, 3)), N: [0, 1, rz < 1.5 ? 0.6 : -0.3] };
  if (Math.abs(((x - 1150) % 70) - 35) > 33) return { c: C.woodD, N: [0, 1, 0] };
  const bi = Math.floor((x + h2(k, 0, 5) * 9) / 4.2), bh = 22 + h2(bi, k, 6) * 16; const gap = h2(bi, k, 7);
  if (!FREE.bat) { if (h2(bi, k, 9) > 0.86 && rz - 3 < 6) return { c: mul(C.book[(h2(bi, k, 8) * 6) | 0], 0.6), N: [0, 1, 0.6] }; return { c: mix(mul(C.mortar, 0.6), DUST, vn(x / 3, z / 3, 4) > 0.6 ? 0.5 : 0), N: [0, 1, 0], ao: 0.5 }; } // a few fallen books, dust
  if (rz - 3 > bh || gap < 0.1) return { c: mul(C.mortar, 0.6), N: [0, 1, 0], ao: 0.5 };
  if (gap < (UP ? 0.32 : 0.2)) { const r = Math.abs(rz - 3 - 5); return { c: mix(C.paper, C.paperD, r / 5), N: [0, 1, (rz - 8) * 0.1] }; }
  let c = C.book[(h2(bi, k, 8) * 6) | 0]; c = mul(c, 0.7 + 0.5 * h2(bi, k, 9)); if (Math.abs(rz - 3 - bh * 0.8) < 1) c = mix(c, L('#6a5a30'), 0.6);
  if (vn(x / 6, z / 30, 12) > 0.7) c = mix(c, L('#8a8470'), 0.5);
  return { c, N: [((x % 4.2) - 2.1) * 0.15, 1, 0] };
}
function mapSheet(x, z, x0, x1, z0, z1, seed, kind) { // a chart pinned among the shelves: the cathedral, or a tower, or the catacombs
  const u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0);
  const edge = Math.min(u, 1 - u, v, 1 - v) * 60 + (vn(x / 3, z / 3, 7 + seed) - 0.5) * 3; if (edge < 0) return null;
  let c = mix(C.paper, C.paperD, clamp(vn(x / 8, z / 8, 3 + seed) * 1.4 - 0.2 + (edge < 2 ? 0.5 : 0)));
  const X = (u - 0.5) * 60, Z = (v - 0.4) * 80;
  if (kind === 0) { const nave = Math.abs(X) < 6 && Math.abs(Z) < 26, trans = Math.abs(Z - 6) < 5 && Math.abs(X) < 20, tower = Math.abs(X) < 4 && Z > 26 && Z < 46;
    const inside = nave || trans || tower, out = inside && !(Math.abs(X) < 5 && Math.abs(Z) < 25 || Math.abs(Z - 6) < 4 && Math.abs(X) < 19 || Math.abs(X) < 3 && Z > 26 && Z < 45);
    if (out) c = mix(c, C.ink, 0.85); if (tower && ((Z | 0) % 5 === 0)) c = mix(c, C.ink, 0.7);
    for (const [mx, mz] of [[-15, 6], [15, 6], [0, -18], [0, 40]]) if (Math.abs(Math.hypot(X - mx, Z - mz) - 3) < 0.8) c = mix(c, C.bloodF, 0.9); }
  else if (kind === 1) { const ring = Math.abs(Math.hypot(X, Z - 6) - 18) < 0.9 || Math.abs(Math.hypot(X, Z - 6) - 9) < 0.7; if (ring || Math.abs(X) < 0.6 && Math.abs(Z - 6) < 18) c = mix(c, C.ink, 0.8); if (Math.hypot(X, Z - 6) < 2.5) c = mix(c, C.bloodF, 0.9); }
  else { const t = Math.abs(Math.sin(X * 0.25 + Math.sin(Z * 0.2) * 2)) < 0.12 || Math.abs(Math.sin(Z * 0.3 + X * 0.05)) < 0.1; if (t && Math.abs(X) < 24 && Math.abs(Z) < 30) c = mix(c, C.ink, 0.7); if (Math.hypot(X - 10, Z + 10) < 2.2) c = mix(c, C.bloodF, 0.9); }
  return { c: mix(c, C.grime, clamp((vn(x / 12, z / 12, 9 + seed) - 0.5) * 2) * 0.5), N: [0, 1, 0] };
}
function wallRoots(x, z, top) { // roots hanging down from the wall tops
  const rc = Math.floor(x / 41), rx0 = rc * 41 + 8 + h2(rc, 0, 431) * 25; if (h2(rc, 1, 431) > 0.42) return null;
  const Lr = 25 + h2(rc, 2, 431) ** 2 * 140, dz = top - z; if (dz < 0 || dz > Lr) return null;
  const t = dz / Lr, cx = rx0 + Math.sin(dz * 0.06 + rc) * 5 + Math.sin(dz * 0.17 + rc * 3) * 1.6, w = 3.2 * (1 - t) + 0.5;
  const u = x - cx; if (Math.abs(u) < w) return { c: mix(L('#3a2a1a'), L('#140c08'), clamp(Math.abs(u) / w + 0.2 - (u < 0 ? 0.3 : 0))), N: [u / w * 0.8, 1, 0] };
  const u2 = x - (cx + (dz > Lr * 0.4 ? (dz - Lr * 0.4) * 0.35 * (h2(rc, 3, 431) < 0.5 ? 1 : -1) : 1e3)); if (Math.abs(u2) < w * 0.45) return { c: L('#1e140c'), N: [0, 1, 0] };
  return null;
}
function wallFace(x, y, z, i, room) {
  const ks = KIND[i + NX]; if ((ks === 0 || ks === 2) && !PROF[i]) return rockFace(x, z, HT[i]);
  let r;
  if (room === R.LUC && y < 140) r = (FREE.bat && (mapSheet(x, z, 1166, 1274, 140, 246, 0, 0) || (UP && (mapSheet(x, z, 1160, 1214, 290, 352, 3, 1) || mapSheet(x, z, 1222, 1284, 380, 432, 5, 2) || mapSheet(x, z, 1200, 1262, 30, 84, 6, 2))))) || books(x, z);
  else if (room === R.SEV) {
    const a = ashlar(x, z, 24, 50, 9); r = a;
    if (z < 40) { r = { c: mix(L('#1e1612'), L('#120c0a'), vn(x / 4, z / 9, 3)), N: [0, 1, 0] }; if (Math.abs(z - 38) < 1.5) r.N = [0, 1, 0.6]; }
    else if (vn(x / 24, z / 20, 5) > (UP ? 0.18 : FREE.brume ? 0.36 : 0.52)) { const u = ((x % 26) + 26) % 26 - 13, v = ((z % 34) + 34) % 34 - 17; const motif = Math.abs(Math.hypot(u * 1.3, v) - 9 - 2 * Math.sin(Math.atan2(v, u) * 4)) < 1.4;
      r = { c: mix(motif ? L('#4e3a5a') : C.violet, C.violetD, clamp(vn(x / 30, z / 50, 6) * 1.4 - 0.3)), N: [0, 1, 0] }; }
  } else if (room === R.VES) { r = ashlar(x, z, 20, 34, 5); r.c = mul(r.c, 0.85); }
  else if (room === R.WARD) { r = ashlar(x, z, 22, 44, 11); if (z < 70) { const p = ((x % 36) + 36) % 36; r = { c: mix(L('#2a1c12'), L('#160e08'), vn(x / 3, z / 20, 4)), N: [0, 1, 0] }; if (p < 1.5 || Math.abs(z - 68) < 1.5 || Math.abs(z - 8) < 1.5) r = { c: L('#0e0a06'), N: [0, 1, 0.4] }; } }
  else if (room === R.ARENA) { r = ashlar(x, z, 34, 70, 7);
    for (let k = 0; k < 4; k++) if (Math.abs(((x + z * 0.35) % 60) - 30 - k * 3) < 0.6 && z > 30 && z < 90 && vn(x / 60, 0, 4) > 0.55) r.c = mul(C.mortar, 1.2);
    if (vn(x / 7, z / 7, 8) > 0.7 && z < 70) r.c = mix(r.c, C.bloodD, 0.8); }
  else r = ashlar(x, z, room === R.CRYPT ? 24 : 26, room === R.CRYPT ? 46 : 62, room);
  const pi = PROF[i]; if (pi && KIND[i + NX] !== 2) { let near = 99; for (const [dx, dz] of [[-4, 0], [4, 0], [0, 4], [-8, 0], [8, 0], [0, 8], [-3, 3], [3, 3]]) for (const [a, b] of PROFILES[pi](x + dx)) if (z + dz > a && z + dz < b) near = Math.min(near, Math.hypot(dx, dz));
    if (near < 9) { const c0 = mix(L('#625644'), C.grime, clamp((fbm(x / 6, z / 6, 3, 8) - 0.4) * 2) * 0.6); r = { c: near < 5 ? c0 : mul(c0, 0.8), N: near < 5 ? [0, 1, 0.35] : [0, 1, -0.2] }; } }
  const s = i + NX; const pS = PROF[s];
  if (pS && KIND[s] !== 1) { const back = room === R.CRYPT ? (z > 80 ? ossuary(x, z) : null) : (room === R.HALL ? ossuary(x, z) : null);
    if (back) r = back; else r = { c: mul(r.c, 0.6), N: r.N }; r.ao = (r.ao || 1) * 0.55; }
  else { const rt = wallRoots(x, z, HT[i]); if (rt) r = rt; }
  let c = r.c;
  c = mix(c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.6);
  if (z < 26) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 26));
  if (sealed(room) || (S === 0 && room !== R.STAIR)) c = mix(c, DUST, 0.15);
  const fade = clamp(1.1 - z / (room === R.LUC ? 600 : 300)); c = mul(c, fade);
  const ao = (r.ao || 1) * (0.55 + 0.45 * clamp(z / 22));
  return { alb: c, N: r.N, spec: 0.03, gloss: 10, ao };
}
function mats(x, y, z, face, i, p) {
  if (i < 0) return rockTop(x, y, z, 0);
  const room = OWN[i], kind = KIND[i];
  if (face) return wallFace(x, y, z, i, room);
  if (kind === 1 || (kind === 3 && z < 1)) return floorMat(x, y, z, room === 0 ? R.HALL : room);
  if (kind === 0) return rockTop(x, y, z, 0);
  if (p && z < HT[i] - 1) { const c = mix(C.stA, C.grime, vn(x / 5, y / 5, 3)); return { alb: mul(c, 0.7), ao: 0.6 }; }
  const e = heightAt(x, y + 2.5) < HT[i] - 1 ? 1 : 0; // worn lip along the visible edge of a wall top
  if (e) return { alb: mul(C.wallD, 0.6), N: [0, 0.3, 1], noAO: true, rim: 0, emi: mul(L('#4a4236'), 0.22) };
  return rockTop(x, y, z, 2);
}
const env = makeEnv(mats);

// ---------- objects ----------
const objects = [];
const add = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const lw = (o, l) => [o.pos[0] + Math.cos(o.yaw) * l[0] - Math.sin(o.yaw) * l[1], o.pos[1] + Math.sin(o.yaw) * l[0] + Math.cos(o.yaw) * l[1], o.pos[2] + l[2]];
const lights = [], L_ = (o) => lights.push(o);
const WARM = L('#d89a50'), CANDLE = L('#d8b070'), FIRE = L('#e07a30'), COLD = L('#5a6a78');
const lightCand = (p, I = 2.6, name) => L_({ p, c: CANDLE, I, r0: 40, R: 260, soft: 5, haze: 0.025, hazeR: 6, skip: name ? [name] : undefined });
// hero
if (!process.env.NOHERO) { // NOHERO: the game's refuge (tools/art/refuge.gen.mjs), which draws its own hero and lantern
  const hz = hero('idle');
  const HP = HERO_AT === 'crypt' ? [1868, 330, 0.25] : [1880, 1700, 0.55];
  const oHero = add('hero', hz, [HP[0], HP[1], 0], HP[2], { id: 60 });
  L_({ name: 'lantern', p: lw(oHero, hz.P._lantern), c: L('#d0cc78'), I: 6, r0: 44, R: 280, pad: 3.6, soft: 6, haze: 0.012, hazeR: 4 });
}

// --- crypt: the hero's coffin always burns; the chiefs' coffins open as they come back ---
add('coffin', coffin(), [1800, 250, 0]); add('lidUp', lidUpright(), [1712, 176, 0], 0.05);
add('candlesC', candles2([[1736, 226, 8, 10, 1.3, 0.6, 0.4], [1738, 274, 8, 6, 1.2], [1864, 226, 8, 12, 1.3, -0.8, 0.2], [1866, 272, 8, 5, 1.1, 0, 0, 1], [1728, 290, 0, 4, 1.1], [1873, 288, 0, 7, 1.2, 0.9, 0.6], [1760, 180, 6, 14, 1.4], [1790, 176, 6, 9, 1.3, 0.5, 0], [1840, 178, 6, 16, 1.4], [1812, 172, 6, 6, 1.2, 0, 0, 1], [1770, 166, 6, 4, 1.1], [1828, 168, 6, 11, 1.2, -0.6, 0.3]]), [0, 0, 0]);
L_({ p: [1800, 262, 48], c: L('#d89048'), I: 3.6, r0: 55, R: 300, soft: 8, haze: 0.012, hazeR: 10, skip: ['candlesC'] });
L_({ p: [1800, 190, 40], c: L('#e0a050'), I: 2.6, r0: 40, R: 240, soft: 6, haze: 0.02, hazeR: 8, skip: ['candlesC'] });
const CHIEFC = [['rat', 1530, 430, FREE.rat], ['brume', 1530, 640, FREE.brume], ['loup', 2070, 430, FREE.loup], ['chauve-souris', 2070, 640, FREE.bat]];
CHIEFC.forEach(([k, x, y, open], n) => { add('cc_' + k, chiefCoffin(k, n + 1, open), [x, y, 0]); if (open) L_({ p: [x - 50, y - 12, 56], c: L('#d89a50'), I: 3.2, r0: 40, R: 280, soft: 5, haze: 0.015, hazeR: 4, skip: ['cc_' + k] }); });
[[1428, 174, 1, 1], [1568, 174, 2, 0], [2032, 174, 3, 2], [2172, 174, 4, 1]].forEach(([x, y, s, st]) => add('niche' + s, oldCoffin(s, st), [x, y, 14]));
add('oldFloor1', oldCoffin(7, 2), [1410, 730, 0], 0.35); add('oldFloor2', oldCoffin(8, 1), [2190, 740, 0], -0.25);
for (const [x, y, z, yaw] of [[1410, 176, 98, 0.3], [1440, 172, 98, -0.4], [1556, 174, 98, 0.1], [1584, 178, 98, 0.6], [2020, 176, 98, -0.2], [2160, 174, 98, 0.4], [2186, 178, 98, -0.5], [1500, 760, 0, 1.2], [2110, 720, 0, -0.9], [1660, 520, 0, 0.4], [1950, 560, 0, 2.2]]) add('skullC', skull(), [x, y, z], yaw);
const nicheLit = S === 0 ? [] : S === 1 ? [1428, 1568] : [1428, 1568, 2032, 2172];
add('candlesN', candles2([[1450, 192, 14, 7, 1.1, 0, 0, !nicheLit.includes(1428)], [1590, 192, 14, 4, 1.0, 0, 0, !nicheLit.includes(1568)], [2010, 192, 14, 9, 1.1, 0, 0, !nicheLit.includes(2032)], [2190, 192, 14, 5, 1.0, 0, 0, !nicheLit.includes(2172)], [1450, 186, 98, 5, 1.0, 0, 0, !nicheLit.includes(1428)], [1548, 184, 98, 3, 1.0, 0, 0, !nicheLit.includes(1568)], [2050, 186, 98, 6, 1.1, 0, 0, !nicheLit.includes(2032)], [2150, 186, 98, 4, 1.0, 0, 0, !nicheLit.includes(2172)], [1385, 760, 0, 8, 1.2, 0, 0, S === 0], [2230, 770, 0, 5, 1.1, 0, 0, S === 0]]), [0, 0, 0]);
for (const x of nicheLit) { L_({ p: [x + (x < 1800 ? 14 : -14), 190, 112], c: WARM, I: 1.4, r0: 25, R: 140, soft: 4, haze: 0.02, hazeR: 4, skip: ['candlesN'] }); L_({ p: [x + 10, 214, 70], c: WARM, I: 1.8, r0: 35, R: 240, soft: 5, haze: 0.015, hazeR: 5 }); }
L_({ p: [1800, 480, 120], c: L('#b07a48'), I: S === 0 ? 0.45 : 0.9, r0: 200, R: 600, noShadow: true });
if (S > 0) { L_({ p: [1386, 770, 14], c: WARM, I: 2.4, r0: 30, R: 220, soft: 4, skip: ['candlesN'] }); L_({ p: [2230, 778, 12], c: WARM, I: 2.2, r0: 30, R: 220, soft: 4, skip: ['candlesN'] }); }
L_({ p: [1800, 760, 60], c: COLD, I: 0.9, r0: 120, R: 420, noShadow: true });
[[1700, 400], [1900, 400], [1700, 700], [1900, 700]].forEach(([x, y], k) => { add('candelabraC' + (k + 1), candelabra(), [x, y, 0]); if (S > 0 || k === 1 || k === 3) lightCand([x, y, 74], S === 0 ? 1.5 : 2.4, 'candelabraC' + (k + 1)); });
add('bonesC1', pitBones(11), [1440, 330, 0]); add('bonesC2', pitBones(13), [2160, 520, 0]); add('bonesC3', pitBones(17), [1780, 560, 0]);
add('ratsC', rats([[1500, 470, 0, 1.2], [1560, 690, 0, -2.0], [1460, 720, 0, 0.5], [1690, 330, 0, 2.6]]), [0, 0, 0]);
// crypt -> wardrobe doorway (east wall)
add('frameW', sideDoor(150, 220, 'open', 'rat', 40), [2250, 735, 0], 0);
add('torchW1', candelabra(), [2214, 640, 0]); add('torchW2', candelabra(), [2214, 830, 0]); lightCand([2214, 640, 74], 2.0, 'torchW1'); lightCand([2214, 830, 74], 2.0, 'torchW2');
add('candlesWd', candles2([[2306, 680, 0, 8, 1.2, 0.5, 0.2], [2312, 790, 0, 5, 1.1]]), [0, 0, 0]); L_({ p: [2310, 734, 16], c: WARM, I: 1.8, r0: 30, R: 220, soft: 4, skip: ['candlesWd'] });

// --- wardrobe corner (hero's outfits): armoire, cheval glass, rail of coats that fills with each house's colours ---
add('armoire', armoire(S > 0), [2410, 584, 0]); add('wmirror', mirror(), [2512, 606, 0], -0.25);
add('rail', coatRail(S === 0 ? ['hero', null, null, null, null] : S === 1 ? ['hero', 'rat', 'brume', null, null] : ['hero', 'rat', 'brume', 'loup', 'chauve-souris']), [2440, 690, 0], 0);
add('chestW', chest(2), [2350, 840, 0], 0.2); add('candlesW', candles2([[2340, 840, 36, 6, 1.2, 0.4, 0.1], [2356, 836, 36, 3, 1.0]]), [0, 0, 0]);
L_({ p: [2460, 790, 110], c: CANDLE, I: S === 0 ? 1.8 : 2.8, r0: 60, R: 280, soft: 6 }); L_({ p: [2470, 650, 140], c: CANDLE, I: 1.0, r0: 50, R: 200, soft: 6 }); L_({ p: [2348, 838, 46], c: WARM, I: 1.6, r0: 30, R: 200, soft: 4, skip: ['candlesW'] });
add('candelabraW', candelabra(), [2530, 760, 0]); lightCand([2530, 760, 74], S === 0 ? 1.6 : 2.8, 'candelabraW');
L_({ p: [2290, 735, 60], c: WARM, I: 1.4, r0: 40, R: 220, soft: 5, haze: 0.03, hazeR: 8 }); // its light spills into the crypt

// --- Lucian ---
if (FREE.bat) {
  const oL = add('lucian', lucian('write'), [1220, 548, 0], 0, { id: 64 });
  add('desk', writingDesk(UP ? 3 : 1), [1220, 574, 0]);
  L_({ p: [1258, 568, 52], c: L('#e0b060'), I: 2.6, r0: 30, R: 260, soft: 5, haze: 0.02, hazeR: 6, skip: ['desk'] });
  L_({ p: [1220, 636, 8], c: HC.bat, I: 1.2, r0: 30, R: 120, noShadow: true, haze: 0.02, hazeR: 6 }); // station glow
  add('candlesL', candles2([[1176, 106, 223, 5, 1.1, 0.4, 0], [1186, 107, 223, 3, 1.0], [1266, 106, 311, 6, 1.1, -0.5, 0.1], [1206, 106, 135, 4, 1.0], [1214, 107, 135, 7, 1.1]]), [0, 0, 0]);
  L_({ p: [1181, 112, 232], c: L('#e0b060'), I: 1.6, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] }); L_({ p: [1266, 112, 320], c: L('#e0b060'), I: 1.6, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] }); L_({ p: [1210, 112, 145], c: L('#e0b060'), I: 1.8, r0: 30, R: 200, soft: 4, haze: 0.03, hazeR: 4, skip: ['candlesL'] });
} else { add('rubbleL', rubble(31, 40), [1215, 640, 0]); add('rubbleL2', rubble(33, 28), [1190, 300, 0]); }
add('ladder', ladder(430, 26), [1262, 104, 0]);
L_({ p: [1220, 330, 300], c: L('#56688a'), I: FREE.bat ? 3.6 : 2.4, r0: 160, R: 700, soft: 10, haze: FREE.bat ? 0 : 0.02, hazeR: 30 });
add('batsL', bats([[1160, 104, 470, 0.1, 'hang'], [1184, 104, 470, -0.2, 'hang'], [1198, 104, 426, 0.3, 'hang'], [1230, 104, 382, 0, 'hang'], [1170, 104, 338, 0.2, 'hang'], [1250, 104, 470, -0.1, 'hang'], [1280, 104, 294, 0, 'hang'], [1196, 104, 250, 0.1, 'hang'],
  [1206, 300, 330, 0.15, 'fly', 0.6], [1250, 420, 260, -0.35, 'fly', -0.3], [1180, 520, 300, 0.4, 'fly', 0.12], [1236, 230, 420, -0.2, 'fly', 0.9]]), [0, 0, 0], 0, { id: 65 });
// Lucian's lancet in the hall's north wall
if (!FREE.bat) { add('sealL', archSeal(80, 200, 'chauve-souris'), [1220, 1160, 0]); L_({ p: [1220, 1260, 170], c: L('#7a8690'), I: 3.2, r0: 90, R: 280, soft: 6 }); }

// --- great hall ---
add('basin', basin2(S === 0 ? 0 : S === 1 ? 0.5 : 1), [1800, 1560, 0]);
if (S > 0) { const bc = [], r2 = mulberry32(3); const n = S === 1 ? 6 : 11; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.2 + (r2() - 0.5) * 0.3, r = 50 + r2() * 10; bc.push([1800 + Math.cos(a) * r, 1560 + Math.sin(a) * r * 0.9, 0, 4 + r2() * 9, 1.1 + r2() * 0.5, (r2() - 0.5) * 1.6, (r2() - 0.5) * 0.8]); }
  if (S === 2) for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.6; bc.push([1800 + Math.cos(a) * 42, 1560 + Math.sin(a) * 42, 5, 3 + r2() * 5, 1.0]); } add('candlesB', candles2(bc), [0, 0, 0]);
  L_({ name: 'basin', p: [1810, 1612, 15], c: L('#e09a50'), I: S === 1 ? 3.2 : 5.5, r0: 60, R: 380, soft: 8, haze: 0.02, hazeR: 12, skip: ['candlesB'] });
  L_({ p: [1794, 1498, 42], c: L('#d88a44'), I: S === 1 ? 1.2 : 2.2, r0: 50, R: 260, soft: 8, skip: ['candlesB'] }); }
const HBZ = [[1330, 1330, S >= 2], [2270, 1330, S >= 1], [1290, 1900, S >= 2], [2270, 1960, S >= 1]];
HBZ.forEach(([x, y, lit], k) => { add('brazierH' + k, brazier2(lit), [x, y, 0]); if (lit) L_({ p: [x, y, 40], c: FIRE, I: 4.0, r0: 50, R: 420, pad: 6, soft: 6, haze: 0.035, hazeR: 10, skip: ['brazierH' + k] }); });
// the path of every night: candle stubs along the runner, the corridor candles, two braziers at the stairs
add('candlesD', candles2([[1756, 1000, 0, 8, 1.2, 0.5, 0.2], [1846, 960, 0, 5, 1.1], [1752, 880, 0, 6, 1.1, -0.4, 0.3], [1194, 1100, 0, 7, 1.1, 0, 0, !FREE.bat], [1246, 1000, 0, 4, 1.0, 0, 0, !FREE.bat],
  [1762, 1250, 0, 5, 1.1, 0.6, 0.1], [1840, 1420, 0, 4, 1.0], [1760, 1720, 0, 6, 1.1, -0.5, 0.4], [1842, 1900, 0, 3, 1.0, 0, 0, S === 2], [1762, 2060, 0, 5, 1.1, 0.4, -0.2]]), [0, 0, 0]);
L_({ p: [1800, 960, 30], c: WARM, I: 1.8, r0: 40, R: 240, soft: 4, skip: ['candlesD'] }); if (FREE.bat) L_({ p: [1220, 1050, 30], c: WARM, I: 1.4, r0: 40, R: 220, soft: 4, skip: ['candlesD'] });
for (const [x, y] of [[1762, 1250], [1840, 1420], [1760, 1720], [1762, 2060]]) L_({ p: [x, y, 14], c: WARM, I: S === 0 ? 1.3 : 0.8, r0: 25, R: 170, soft: 4, skip: ['candlesD'] });
const SCX = [1440, 1680, 1920, 2160, 2380], scLit = x => S === 2 || (S === 1 ? x !== 1440 : (x === 1680 || x === 1920));
for (const x of SCX) { add('sconceH', sconce(scLit(x) ? 0.8 : 0.01), [x, 1160, 128]); if (scLit(x)) L_({ p: [x, 1170, 146], c: L('#c8783a'), I: S === 0 ? 1.4 : 2.2, r0: 45, R: 320, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceH'] }); }
// desecrated saints: two in the ossuary apses, two flanking the stairs
add('statueA1', statue(1), [1560, 1152, 6]); add('statueA2', statue(2), [2040, 1152, 6]); add('statueS1', statue(3), [1600, 2085, 0], 0.15); add('statueS2', statue(4), [2000, 2085, 0], -0.15);
add('candlesA', candles2([[1528, 1176, 0, 9, 1.2, 0, 0, S === 0], [1592, 1178, 0, 5, 1.1, 0.5, 0.2, S === 0], [2010, 1176, 0, 7, 1.1, 0, 0, S < 2], [2070, 1178, 0, 11, 1.2, -0.4, 0, S < 2]]), [0, 0, 0]);
if (S > 0) L_({ p: [1560, 1185, 22], c: WARM, I: 1.6, r0: 30, R: 220, soft: 4, skip: ['candlesA'] }); if (S === 2) L_({ p: [2040, 1185, 22], c: WARM, I: 1.6, r0: 30, R: 220, soft: 4, skip: ['candlesA'] });
const bzL = brazier2(true); add('brazierS1', bzL, [1700, 2110, 0]); add('brazierS2', bzL, [1900, 2110, 0]);
for (const x of [1700, 1900]) L_({ p: [x, 2110, 40], c: FIRE, I: S === 0 ? 2.6 : 4.5, r0: 45, R: 340, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazierS' + (x === 1700 ? 1 : 2)] });
L_({ p: [1800, 2330, -40], c: L('#6a8478'), I: 2.4, r0: 60, R: 260, soft: 8 });
L_({ p: [1800, 1650, 260], c: S === 0 ? L('#646568') : L('#8a6a50'), I: S === 0 ? 2.0 : S === 1 ? 0.8 : 0.7, r0: S === 0 ? 520 : 400, R: 1200, noShadow: true });
if (S === 0) L_({ p: [1800, 480, 260], c: L('#646568'), I: 1.0, r0: 400, R: 900, noShadow: true });
// pews, broken and tipped, out of the paths; the dead offered around the basin; cages
for (const [x, y, br, sd] of [[1400, 1290, 0, 1], [1420, 1380, 1, 2], [1390, 1478, 2, 3], [2190, 1690, 0, 4], [2210, 1780, 2, 5], [1980, 1250, 1, 6]]) add('pew', pew(110, br, sd), [x, y, 0], (h2(x, y, 3) - 0.5) * 0.2);
if (S > 0) add('offer1', offering(1), [1680, 1660, 0], 2.6);
if (S === 2) { add('offer2', offering(2), [1920, 1478, 0], -0.5); add('offer3', offering(3, false), [1640, 1500, 0], 3.6);
  add('offer4', offering(4), [2090, 1720, 0], -2.2); }
for (const [x, y, yaw] of [[1500, 1300, 0.4], [2050, 1350, -0.8], [1350, 2050, 1.2], [2300, 1980, 2.2], [2330, 1250, -0.5], [1990, 1820, 0.9]]) add('skullH', skull(), [x, y, 0], yaw);
for (const [x, y, sd] of [[1240, 1300, 21], [2350, 2070, 25], [1560, 1240, 27], [2080, 1260, 29], [2130, 1640, 33]]) add('bonesH', pitBones(sd), [x, y, 0]);
add('oldH1', oldCoffin(12, 2), [1240, 1820, 0], 1.3); add('oldH2', oldCoffin(14, 1), [2370, 1560, 0], -1.5);
add('cageH1', cage(34, 26, 62), [1230, 1440, 0], 0.2); add('cageH2', cage(34, 26, 62), [2380, 1760, 0], -0.3);
if (S === 2) { add('prisoner', slumped(11), [2380, 1760, 2], -0.3 + Math.PI); } else add('skullCg1', skull(), [2378, 1758, 0], -1.0);
add('skullCg2', skull(), [1232, 1442, 0], 0.5);
add('ratsH', rats([[1650, 1650, 0, 1.0], [1990, 1500, 0, -2.5], [2440, 1360, 0, 3.0], [2380, 1330, 0, 0.3], [1460, 1500, 0, -1.4], [1330, 2120, 0, 0.6]]), [0, 0, 0]);
add('batsH', bats([[1300, 1280, 150, 0.2, 'fly', 0.7], [1360, 1350, 120, -0.4, 'fly', -0.35], [1250, 1220, 175, 0.5, 'fly', 0.2], [1420, 1240, 190, -0.1, 'fly', 0.95]]), [0, 0, 0], 0, { id: 66 });
// training corner (south-west): the dummy in the Order's colours, a rack, a chalk ring
add('dummy', trainingDummy(), [DUMMY[0], DUMMY[1], 0], 0.25); add('rack', weaponRack(), [1250, 2075, 0], 0.5);
add('strawDummy', rubble(41, 22, 6), [1220, 2130, 0]); add('torchD', candelabra(), [1500, 1950, 0]); lightCand([1500, 1950, 74], 2.6, 'torchD');
// side doorways of the hall: stone jambs + lintel; open = torches each side + the room's own light spilling out; sealed = bricked, boarded, the house seal
const DOORS = [['loup', 1162, 1650, 80, Math.PI, FREE.loup, L('#c0402a')], ['rat', 2438, 1345, 70, 0, FREE.rat, L('#b8a868')], ['brume', 2438, 1905, 90, 0, FREE.brume, L('#8a74b0')]];
for (const [k, x, y, span, yaw, open, col] of DOORS) { const shaftI = k === 'loup' ? 2.2 : 3.4;
  add('frame_' + k, sideDoor(span, 240, open ? 'open' : 'sealed', k, 50), [yaw ? 1150 : 2450, y, 0], yaw);
  if (!open) L_({ p: [x + (yaw ? 70 : -70), y + 40, 190], c: L('#7a8690'), I: 4.0, r0: 100, R: 300, soft: 6 }); // a grey draught of light picks out the seal
  if (open) { const dx = yaw ? 26 : -26, py = span / 2 + 24;
    add('torch_' + k, candelabra(), [x + dx, y - py, 0]); add('torch2_' + k, candelabra(), [x + dx, y + py, 0]);
    lightCand([x + dx, y - py, 74], 2.4, 'torch_' + k); lightCand([x + dx, y + py, 74], 2.4, 'torch2_' + k);
    L_({ p: [x - dx * 2.2, y, 60], c: col, I: shaftI, r0: 50, R: 330, soft: 6, haze: 0.035, hazeR: 16 }); } // a shaft of the room's light through the door
}

// --- Magda's arena ---
const AC = G.arena.c;
add('pitBones1', pitBones(3), [AC[0] - 60, AC[1] + 60, -48]); add('pitBones3', pitBones(9), [AC[0] - 140, AC[1] - 110, -48]);
L_({ p: [650, 1600, 260], c: L('#8a5a40'), I: FREE.loup ? 0.6 : 0.25, r0: 400, R: 800, noShadow: true });
if (FREE.loup) {
  add('ring', ringStakes(316, 30), [AC[0], AC[1], 0]); add('pitBones2', pitBones(5), [AC[0] + 130, AC[1] - 60, -48]); add('pitBodies', pitBodies(9, 150, 60), [AC[0] + 20, AC[1] - 10, -48]);
  const BRZA = [1.0, 2.4, 3.6, 4.6].map(a => [AC[0] + Math.cos(a) * 395, AC[1] + Math.sin(a) * 395]); const bzA = brazier2(true);
  BRZA.forEach(([x, y], k) => { add('brazierA' + k, bzA, [x, y, 0]); L_({ p: [x, y, 40], c: FIRE, I: 4.2, r0: 50, R: 420, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazierA' + k] }); });
  for (const [x, yaw] of [[440, 0.25], [650, 0], [860, -0.25], ...(UP ? [[330, 0.5], [960, -0.5]] : [])]) { const y = AC[1] - Math.sqrt(G.arena.R ** 2 - (x - AC[0]) ** 2) + 26; add('hide', hideFrame(), [x, y, 0], yaw); }
  if (UP) for (const [a, sd] of [[2.0, 1], [2.9, 2], [4.1, 3], [0.4, 4]]) add('trophy', trophyPike(sd), [AC[0] + Math.cos(a) * 440, AC[1] + Math.sin(a) * 440, 0], 0.2 * (sd - 2));
  const oM = add('magda', magda('grind'), [1000, 1468, 0], 0.35, { id: 63 }); const oG = add('grind', grindstone(), lw(oM, [16, 20, 0]), 0.35);
  const sp = lw(oG, [4, 6, 58]); L_({ p: sp, c: L('#ffd890'), I: 2.2, r0: 14, R: 120, soft: 3, haze: 0.05, hazeR: 4, skip: ['grind', 'magda'] }); // sparks
  L_({ p: lw(oM, [-60, 50, 130]), c: L('#9aa8b4'), I: 2.8, r0: 70, R: 260, soft: 8 }); // cold key on Magda (she is not lit by the fire)
  L_({ p: [985, 1530, 8], c: HC.loup, I: 1.4, r0: 30, R: 130, noShadow: true, haze: 0.02, hazeR: 8 });
  L_({ p: [650, 1640, -20], c: L('#a0402a'), I: 1.2, r0: 200, R: 420, noShadow: true });
} else {
  add('rubbleA', rubble(51, 50, 18), [880, 1360, 0]); add('rubbleA2', rubble(53, 40), [420, 1900, 0]); add('stakesBroken', rubble(55, 30, 8), [600, 1330, 0]); add('rubbleA3', rubble(57, 36, 12), [1020, 1790, 0]); add('pitBonesS', pitBones(7), [AC[0] + 120, AC[1] + 90, -48]); add('rubbleA4', rubble(59, 30, 10), [300, 1500, 0]);
  L_({ p: [700, 1560, 330], c: L('#6a7680'), I: 2.0, r0: 360, R: 950, soft: 10, haze: 0.02, hazeR: 26 }); // grey light through a crack in the vault
}
for (const [x, y, yaw] of [[300, 1700, 0.4], [520, 1980, -0.8], [980, 1700, 1.2]]) add('skullA', skull(), [x, y, 0], yaw);

// --- Vesna ---
if (FREE.rat) {
  add('shelves', shelves(180), [2600, 1250, 0]); if (UP) { add('shelves2', shelves(150), [2585, 1250, 44]); add('crate1', jarCrate(3), [2530, 1405, 0], 0.3); add('crate2', jarCrate(5, 6), [2680, 1408, 0], -0.2); }
  const oSt = add('stall', stall(), [2610, 1342, 0]); if (!process.env.NOHERO) add('vesna', vesna('count'), [2600, 1316, 0], 0, { id: 61 }); // the game draws her
  const LAMP = lw(oSt, [46, -10, 80]); L_({ name: 'lamp', p: LAMP, c: L('#d8a050'), I: 5.2, r0: 45, R: 280, pad: 4, soft: 5, haze: 0.03, hazeR: 5 });
  L_({ p: [2610, 1398, 8], c: HC.rat, I: 1.2, r0: 30, R: 110, noShadow: true, haze: 0.02, hazeR: 6 });
  add('ratsV', rats([[2560, 1390, 0, 1.2], [2520, 1300, 0, -0.5], [2690, 1290, 0, 2.0], [2620, 1418, 0, -2.5], [2470, 1350, 0, 0.9], [2612, 1349, 42, 2.8]]), [0, 0, 0]);
} else { add('rubbleV', rubble(61, 34), [2620, 1330, 0]); add('ratsV', rats([[2560, 1390, 0, 1.2], [2650, 1300, 0, 2.0]]), [0, 0, 0]);
  L_({ p: [2600, 1330, 260], c: L('#6a7680'), I: 1.4, r0: 160, R: 420, soft: 8, haze: 0.02, hazeR: 16 }); }

// --- Séverin ---
if (FREE.brume) {
  add('fdummy', fencingDummy(UP), [2590, 1790, 0], -0.5); lightCand([2550, 1745, 74], 3.0, 'candelabraD'); add('candelabraD', candelabra(), [2550, 1745, 0]);
  add('mirror', mirror(), [2888, 1800, 0], 1.16); add('armchair', armchair2(UP), [2900, 2040, 0], 0.95);
  add('candelabra1', candelabra(), [2840, 1730, 0]); add('candelabra2', candelabra(), [2540, 2040, 0]);
  L_({ p: [2840, 1730, 74], c: CANDLE, I: 3.2, r0: 40, R: 280, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra1'] }); L_({ p: [2540, 2040, 74], c: CANDLE, I: 3.0, r0: 40, R: 280, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra2'] });
  if (UP) { add('sideTable', sideTable(), [2850, 2060, 0]); add('candelabra3', candelabra(), [2940, 1950, 0]); L_({ p: [2940, 1950, 74], c: CANDLE, I: 2.6, r0: 40, R: 260, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra3'] }); }
  add('severin', severin('mirror'), [2800, 1846, 0], -1.98, { id: 62 });
  add('sconceS', sconce(0.8), [2600, 1700, 120]); L_({ p: [2600, 1712, 140], c: L('#c8783a'), I: 2.0, r0: 45, R: 320, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceS'] });
  L_({ p: [2730, 1960, 14], c: HC.brume, I: 1.6, r0: 60, R: 260, noShadow: true, haze: 0.02, hazeR: 10 });
} else { add('rubbleS', rubble(71, 40), [2780, 1820, 0]); add('chairS', armchair2(false), [2640, 2000, 0], 2.2);
  L_({ p: [2730, 1900, 280], c: L('#6a7680'), I: 1.6, r0: 220, R: 560, soft: 8, haze: 0.02, hazeR: 20 }); }

// cold rim lights on the figures (from behind, like the dungeon)
const chars = ['hero', 'vesna', 'severin', 'magda', 'lucian', 'batsL', 'batsH', 'ratsV', 'ratsH', 'ratsC', 'dummy', 'fdummy'];
for (const [x, y] of [[1800, 100], [1800, 1300], [900, 1300], [2650, 1250], [2780, 1700], [1220, 400], [1420, 1850]]) L_({ p: [x, y - 220, 190], c: L('#9aa8a4'), I: 2.4, r0: 400, R: 900, soft: 10, only: chars, noEnv: true });
const SC = { W, H, cam, off, offX: X0, objects, lights, env, envShadow, ambient: L('#22262a') };
export async function scene() { return SC; }

// ---------- post ----------
export const PAL = [...PALETTE, ...['#141a26', '#1e283a', '#2c3a52', '#2a2830', '#3e3a46', '#58525f', '#6e6680', '#9a92aa', '#3a1a16', '#5a2a20'].map(h => hex(h).map(v => v * 255))];
const FONT = { '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'] };
export function hud(rgba, w, x0 = 24, y0 = 20) {
  const put = (x, y, h) => { const c = hex(h); const i = (y * w + x) * 4; rgba[i] = c[0] * 255; rgba[i + 1] = c[1] * 255; rgba[i + 2] = c[2] * 255; };
  const drop = ['....#....', '....#....', '...###...', '...###...', '..#####..', '.#######.', '.#######.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'];
  for (let x = x0; x <= x0 + 68; x++) for (let y = y0; y <= y0 + 18; y++) put(x, y, (x === x0 || x === x0 + 68 || y === y0 || y === y0 + 18) ? '#3e362b' : '#0c0a08');
  drop.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '#') return; const left = x < 4, top = y < 7; put(x0 + 5 + x, y0 + 3 + y, (x === 3 && y > 5 && y < 10) ? '#b42c1e' : left && !top ? '#781116' : left ? '#951c18' : y > 9 ? '#3e060b' : '#5a0a10'); }));
  [...'1486'].forEach((ch, k) => FONT[ch].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') { put(x0 + 19 + k * 7 + x + 1, y0 + 6 + y + 1, '#030303'); put(x0 + 19 + k * 7 + x, y0 + 6 + y, y < 2 ? '#ece2c6' : '#cfc2a2'); } })));
}
const P2 = (x, y, z) => [x - X0, y * SN - z * CS - off];
export async function finish(img, sc) {
  decorate(img, sc);
  const rgba = post(img, { exposure: 3.4, vignette: Number(process.env.VIG ?? 0.2), desat: 0.16, grain: 0.012, dither: 0.02, palette: PAL });
  writePNG(OUT + '-native.png', rgba, W, H, 1);
  writePNG(OUT + '.png', rgba, W, H, 2);
  const fs = await import('fs'); fs.writeFileSync(OUT + '.rgba', Buffer.from(rgba.buffer));
}
/** What is laid over the render before the post: mist, cobwebs, smoke, wing blur, then the lights' haze (unless noHaze). */
export function decorate(img, sc, noHaze = false) {
  const T0 = 4000;
  // mist: pooling over Séverin's floor (soft rolling banks, not stripes), breathing out of the brume coffin once it is open
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, t = img.depth[i]; if (t > 1e8) continue;
    const sy = py + 0.5 + off; const y = sy * SN + CS * T0 - CS * t, z = sy * -CS + SN * T0 - SN * t, x = px + 0.5 + X0;
    let m = 0;
    if (FREE.brume && x > 2440 && y > 1640 && y < 2140) m = 0.75 * clamp(1.25 - Math.hypot((x - 2740) / 300, (y - 1930) / 230)) ** 1.1;
    if (FREE.brume) m += 0.8 * clamp(1 - Math.hypot((x - 1530) / 90, (y - 660) / 50));
    if (m <= 0) continue;
    const wv = fbm(x / 120, y / 90, 3, 305); const n = fbm(x / 48 + wv * 2, y / 34 + z * 0.012 - wv, 4, 301);
    const dens = clamp(m * (0.15 + clamp(n * 2.0 - 0.75)) * Math.exp(-Math.max(0, z - (x < 2000 ? 50 : 6) + 2) / 16) * 0.85);
    const mc = [0.05, 0.045, 0.058];
    for (let k = 0; k < 3; k++) img.out[i * 3 + k] = img.out[i * 3 + k] * (1 - dens * 0.7) + mc[k] * dens;
  }
  const plot = (px, py, a, v = 0.05) => { px |= 0; py |= 0; if (px < 0 || py < 0 || px >= W || py >= H) return; const i = py * W + px; for (let k = 0; k < 3; k++) img.out[i * 3 + k] = lerp(img.out[i * 3 + k], v, a); };
  // cobwebs: torn, sagging, each different; some with a hanging thread and a wrapped carcass
  const webAt = (x, y, z, dir, size, seed) => { const [cx, cy] = P2(x, y, z); const rr = mulberry32(seed * 7 + 1);
    const n = 3 + (rr() * 5 | 0), span = Math.PI / 2 * (0.6 + rr() * 0.4), a0 = rr() * (Math.PI / 2 - span), rays = [], sag = 0.05 + rr() * 0.2, dense = 0.12 + rr() * 0.14;
    for (let k = 0; k < n; k++) { const a = a0 + (k / (n - 1)) * span + (rr() - 0.5) * 0.25; rays.push([Math.cos(a) * dir, Math.sin(a), size * (0.5 + rr() * 0.6)]); }
    for (const [dx, dy, l] of rays) { if (rr() < 0.15) continue; for (let t = 0; t < l; t += 0.5) plot(cx + dx * t, cy + dy * t + Math.sin(t / l * Math.PI) * l * sag * 0.4, dense * (1 - t / l * 0.6)); }
    const rings = 2 + (rr() * 4 | 0); for (let ring = 1; ring <= rings; ring++) { const rad = size * ring / (rings + 0.8) * (0.85 + rr() * 0.3); for (let k = 0; k < n - 1; k++) { if (rr() < 0.3) continue; const [ax, ay, la] = rays[k], [bx, by, lb] = rays[k + 1]; if (rad > Math.min(la, lb)) continue; for (let t = 0; t <= 1; t += 0.04) { const s = Math.sin(t * Math.PI) * rad * sag; plot(cx + (ax + (bx - ax) * t) * rad, cy + (ay + (by - ay) * t) * rad + s, dense * 0.8); } } }
    if (rr() < 0.45) { const hx = cx + dir * size * (0.2 + rr() * 0.4), hl = 6 + rr() * 16; for (let t = 0; t < hl; t += 0.5) plot(hx + Math.sin(t * 0.3) * 0.6, cy + size * 0.3 + t, 0.14); if (rr() < 0.6) for (let j = -1; j <= 1; j++) for (let k = 0; k < 3; k++) plot(hx + j * 0.6, cy + size * 0.3 + hl + k, 0.35, 0.09); } };
  const WEBS = [[1350, 200, 210, 1, 34], [2250, 200, 214, -1, 22], [1150, 100, 440, 1, 30], [1290, 100, 430, -1, 18], [1150, 1160, 232, 1, 44], [2450, 1160, 226, -1, 26], [2700, 1250, 145, -1, 30],
    [2500, 1700, 192, 1, 22], [2960, 1700, 190, -1, 40], [1366, 200, 128, 1, 12], [2234, 200, 124, -1, 18], [1900, 200, 205, -1, 26], [1740, 1160, 224, 1, 14], [2320, 560, 186, 1, 24], [2560, 560, 186, -1, 16],
    ...(S < 2 ? [[1490, 200, 128, -1, 16], [2110, 200, 120, 1, 14], [1700, 200, 205, 1, 20], [2500, 1250, 145, 1, 26], [1860, 1160, 224, -1, 20]] : [])];
  WEBS.forEach(([x, y, z, d, sz], k) => webAt(x, y, z, d, sz, k + 3 + S * 101));
  // ambient motion: smoke from snuffed candles, wing-blur behind the bats taking off, dust kicked by a running rat
  const smoke = (x, y, z, seed) => { const [cx, cy] = P2(x, y, z); const rr = mulberry32(seed); const ph = rr() * 6; for (let t = 0; t < 26; t += 0.4) plot(cx + Math.sin(t * 0.32 + ph) * (1 + t * 0.14), cy - t, 0.18 * (1 - t / 26), 0.16); };
  for (const [x, y, z, s] of [[1866, 272, 14, 1], [1812, 172, 13, 2], [1842, 1900, 4, 3], ...(S === 0 ? [[1450, 192, 22, 4], [2010, 192, 24, 5], [1528, 1176, 10, 6]] : [])]) smoke(x, y, z, s);
  const blur = (x, y, z, dx, dy, seed) => { const [cx, cy] = P2(x, y, z); for (let t = 2; t < 14; t += 0.5) for (let w = -2; w <= 2; w++) plot(cx - dx * t + (dy ? w : 0), cy - dy * t + (dx ? w * 0.6 : 0), 0.05 * (1 - t / 14), 0.02); };
  for (const [x, y, z] of [[1300, 1280, 150], [1360, 1350, 120], [1250, 1220, 175], [1420, 1240, 190], [1206, 300, 330], [1236, 230, 420]]) blur(x, y, z, 0.6, 0.8, 1);
  if (!noHaze) haze(img, sc);
}
