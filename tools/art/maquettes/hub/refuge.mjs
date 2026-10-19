// Hub screen « le refuge »: forgotten chapel under the necropolis. 960x540 native, shown x2 at 1920x1080.
import { camera, project, post, haze, writePNG, L, hex, clamp, lerp, sstep, h2, vn, fbm, mix, mul, mulberry32, PALETTE } from '../grand/lib.mjs';
import { hero } from '../grand/hero.mjs';
import { pillar, sconce, skull } from '../grand/cast.mjs';
import { vesna, severin, magda, lucian, rats, bats } from './chiefs.mjs';
import { coffin, lid, basin, candles, stall, shelves, desk, beam, ringStakes, pitBones, hideFrame, brazier, dummy, mirror, armchair, candelabra } from './props.mjs';

const W = 960, H = 540, cam = camera(38 * Math.PI / 180), off = -150;
const { s: SN, c: CS } = cam;
const C = {
  mortar: L('#0e0c0a'), stA: L('#4a4337'), stB: L('#584e40'), stC: L('#423f39'), grime: L('#1c1813'), moss: L('#3a4426'), mossL: L('#56602f'),
  blood: L('#560710'), bloodF: L('#6e0a12'), bloodD: L('#2e0406'), wall: L('#3e372d'), wallD: L('#231e18'), iron: L('#2a2622'), rust: L('#5b3520'),
  straw: L('#6e5c34'), bone: L('#b0a486'), boneD: L('#5e5440'), ash: L('#6a665e'), ashD: L('#46423b'), rug: L('#4a0c10'), rugD: L('#26070a'), rugB: L('#6a5228'),
  dirt: L('#3a2e22'), dirtD: L('#1e1810'), chalk: L('#8e8a80'), paper: L('#a8996e'), paperD: L('#5e5238'), ink: L('#1e1812'),
};
// ---------- layout (world units, screen x = X, floor Y maps to screen y = 150 + 0.616 Y) ----------
const COF = [480, 92], BAS = [480, 318], HERO = [562, 170];
const STALL = [158, 124], VES = [250, 170], DESK = [812, 40], LUC = [728, 112];
const PIT = { c: [168, 486], R: 72, D: 14 }, MAG = [312, 408], BRZ = [272, 452];
const SEV = [792, 452], MIR = [888, 398], DUM = [688, 404];
const APSE = { x0: 405, x1: 555, zs: 45, R: 150, back: -36 };
const MAP = { x0: 728, x1: 892, z0: 74, z1: 164 };

// ---------- floor ----------
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)); return [Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t), t]; }
function polyDist(px, py, pts) { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(px, py, pts[i], pts[i + 1])[0]); return best; }
const stains = [ // x, y, rx, ry, color, amount, seed, wet
  [BAS[0], BAS[1], 70, 52, C.bloodD, 0.7, 41, 1], [COF[0], COF[1] + 44, 80, 22, C.ash, 0.75, 42, 0], [COF[0] + 40, COF[1] + 60, 30, 14, C.ashD, 0.7, 43, 0],
  [STALL[0] + 10, STALL[1] + 30, 70, 20, C.grime, 0.7, 44, 0], [STALL[0] + 40, STALL[1] + 28, 16, 8, C.blood, 0.8, 45, 1],
  [PIT.c[0], PIT.c[1] - 70, 50, 14, C.bloodD, 0.7, 46, 1], [MAG[0] - 20, MAG[1] + 30, 30, 14, C.blood, 0.6, 47, 1],
  [DESK[0] - 10, DESK[1] + 40, 50, 18, C.grime, 0.6, 48, 0], [130, 330, 60, 30, C.grime, 0.7, 49, 0], [640, 600, 90, 30, C.grime, 0.6, 50, 0], [900, 250, 40, 40, C.grime, 0.6, 51, 0],
];
const channels = [ // offering grooves: every corner bleeds toward the basin
  [[STALL[0] + 70, STALL[1] + 40], [330, 230], [430, 288]], [[LUC[0] - 10, LUC[1] + 30], [640, 230], [532, 290]],
  [[MAG[0] - 10, MAG[1] - 20], [380, 370], [438, 346]], [[DUM[0] - 20, DUM[1] - 10], [600, 370], [522, 346]],
];
const slabs = [[372, 186, 0.1], [610, 252, -0.05], [380, 520, 0.08], [590, 548, 0], [930, 300, 0.1]];
function floorAt(x, y) {
  const CW = 40, CH = 30;
  const wx = x + (vn(x / 18, y / 18, 5) - 0.5) * 7, wy = y + (vn(x / 18, y / 18, 6) - 0.5) * 7;
  const gx = Math.floor(wx / CW), gy = Math.floor(wy / CH);
  let f1 = 1e9, f2 = 1e9, id = 0, ddx = 0, ddy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (gx + i) * CW + 6 + h2(gx + i, gy + j, 71) * (CW - 12), cy = (gy + j) * CH + 5 + h2(gx + i, gy + j, 72) * (CH - 10);
    const d = Math.hypot((wx - cx) / CW, (wy - cy) / CH) * 30;
    if (d < f1) { f2 = f1; f1 = d; id = (gx + i) * 997 + (gy + j); ddx = (wx - cx) / CW; ddy = (wy - cy) / CH; } else if (d < f2) f2 = d;
  }
  const e = f2 - f1;
  let c = mix(mix(C.stA, C.stB, h2(id, 0, 73)), C.stC, h2(id, 0, 74) * 0.7);
  c = mul(c, 0.7 + 0.45 * h2(id, 0, 75));
  let N = [0, 0, 1], spec = 0.04, gloss = 12;
  const tl = [(h2(id, 1, 76) - 0.5) * 0.12, (h2(id, 2, 76) - 0.5) * 0.12];
  // grave slabs set in the floor (necropolis): rectangular, engraved border + worn lines
  let onSlab = false;
  for (const [sx, sy, a] of slabs) { const ca = Math.cos(a), sa = Math.sin(a), u = (x - sx) * ca + (y - sy) * sa, v = -(x - sx) * sa + (y - sy) * ca;
    if (Math.abs(u) < 18 && Math.abs(v) < 34) { onSlab = true; c = mul(mix(C.stB, C.wall, 0.4), 0.85 + 0.3 * vn(u / 6, v / 6, 3)); const bu = 18 - Math.abs(u), bv = 34 - Math.abs(v);
      if (Math.min(bu, bv) < 1.1) { c = C.mortar; } else if (Math.abs(Math.min(bu, bv) - 3.5) < 0.6) { c = mul(c, 0.5); N = [0, 0, 1]; }
      else if (Math.abs(u) < 1.0 && v > -24 && v < 8 || Math.abs(v + 14) < 1.0 && Math.abs(u) < 8) c = mul(c, 0.45); // engraved cross
      else if (v > 14 && v < 28 && ((v | 0) % 4 === 0) && vn(u * 0.8, v, 9) > 0.3) c = mul(c, 0.6);                // inscription
      c = mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9) - 0.45) * 2) * 0.8); } }
  if (!onSlab) {
    if (e < 1.3) { c = mix(C.mortar, c, 0.25 * e); N = [0, 0, 1]; }
    else {
      const bev = clamp(1 - (e - 1.3) / 2.2); const l = Math.hypot(ddx, ddy) || 1;
      N = [ddx / l * bev * 0.7 + tl[0], ddy / l * bev * 0.7 + tl[1], 1];
      const g = fbm(x / 7, y / 7, 3, 9 + (id & 7)); c = mix(c, C.grime, clamp((g - 0.4) * 2) * 0.85);
      const sp = h2(x * 2 | 0, y * 2 | 0, 11); if (sp < 0.08) c = mul(c, 0.65); else if (sp > 0.97) c = mul(c, 1.25);
      if (vn(x / 3, y / 3, 13) > 0.8 && vn(x / 40, y / 40, 14) > 0.5) c = mul(c, 0.45);
    }
  }
  const f = fbm(x / 50, y / 40, 4, 21); if (f > 0.5) c = mix(c, C.grime, clamp((f - 0.5) * 4) * 0.8);
  const m = fbm(x / 26, y / 22, 4, 33), nearW = clamp(1 - y / 60);
  if (m * (0.5 + nearW) > 0.62) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.5 + nearW) - 0.62) * 4) * 0.7);
  c = mul(c, 0.75 + 0.5 * fbm(x / 90, y / 70, 3, 44));
  { const cx = Math.floor(x / 6), cy = Math.floor(y / 6), r = h2(cx, cy, 300);
    if (r < 0.035) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 6 + 3), ly = y - (cy * 6 + 3); const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.5 && Math.abs(u) < 3.5) { c = r < 0.008 ? C.bone : mix(C.straw, mul(C.straw, 0.6), h2(cx, cy, 302)); N = [0, 0, 1]; } } }
  let wet = 0;
  // the worn red runner from the coffin to the basin
  { const u = x - 480, v = y - 198; const fray = vn(x * 0.9, 0, 5) * 5;
    if (Math.abs(u) < 27 && Math.abs(v) < 66 + fray && vn(x / 6, y / 6, 61) < 0.86) {
      const bd = Math.min(27 - Math.abs(u), 66 - Math.abs(v)); let rc = mix(C.rug, C.rugD, clamp(fbm(x / 5, y / 5, 3, 62) * 1.6 - 0.3));
      if (bd > 3 && bd < 5) rc = mix(C.rugB, C.rugD, 0.55); else if (bd < 1.5 && Math.abs(v) < 66) rc = C.rugD;
      if (Math.abs(v) > 64) rc = mix(C.rugB, C.rugD, (x * 2 | 0) & 1 ? 0.3 : 0.8);
      c = mix(rc, C.grime, clamp((fbm(x / 12, y / 12, 3, 63) - 0.5) * 2) * 0.6); N = [0, 0, 1]; spec = 0.02;
      
    } }
  for (const [sx, sy, rx, ry, col, amt, seed, w] of stains) {
    const dx = (x - sx) / rx, dy = (y - sy) / ry; const dd = dx * dx + dy * dy; if (dd > 3) continue;
    const v = 1 - Math.sqrt(dd) + (fbm(x / 6, y / 6, 3, seed) - 0.5) * 1.1;
    if (v > 0) { const a = clamp(v * 3) * amt; c = mix(c, col, a); if (w) wet = Math.max(wet, a); }
  }
  for (const g of channels) { const d = polyDist(x + (vn(y / 9, x / 9, 66) - 0.5) * 5, y + (vn(x / 9, y / 9, 67) - 0.5) * 3, g); if (d < 2.2) { c = mix(C.mortar, C.bloodD, d < 1.2 && vn(x / 5, y / 5, 68) > 0.25 ? 0.8 : 0.2); N = [0, 0, 1]; wet = Math.max(wet, d < 1.2 ? 0.6 : 0.2); } }
  // ashy footprints from the dais to where he stands
  for (let k = 0; k < 5; k++) { const px = 532 + k * 7 + (k & 1) * 4, py = 128 + k * 9; if (Math.hypot((x - px) / 2.2, (y - py) / 3.6) < 1) c = mix(c, C.ash, 0.8 - k * 0.1); }
  // Séverin's footwork diagram: chalk circle, arcs and stepping marks under the mist
  { const dx = x - SEV[0] + 30, dy = y - SEV[1] - 40, r = Math.hypot(dx, dy * 1.0), a = Math.atan2(dy, dx);
    const ring = Math.abs(r - 46) < 0.7 || (Math.abs(r - 26) < 0.5 && Math.sin(a * 6) > 0);
    const spoke = r < 46 && r > 8 && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.47;
    if ((ring || spoke) && vn(x / 3, y / 3, 81) > 0.35) c = mix(c, C.chalk, 0.3);
    for (let k = 0; k < 8; k++) { const ka = k * Math.PI / 4 + 0.39, fx = Math.cos(ka) * 36, fy = Math.sin(ka) * 36; if (Math.hypot(dx - fx, (dy - fy) * 0.8) < 2.2 && Math.hypot(dx - fx, (dy - fy) * 0.8) > 1.2) c = mix(c, C.chalk, 0.35); } }
  // Lucian's dropped sketches near the desk
  for (const [px, py, a] of [[760, 150, 0.4], [690, 170, -0.3], [865, 110, 1.1], [655, 130, 0.9]]) { const u = (x - px) * Math.cos(a) + (y - py) * Math.sin(a), v = -(x - px) * Math.sin(a) + (y - py) * Math.cos(a);
    if (Math.abs(u) < 7 && Math.abs(v) < 5) { c = mix(C.paper, C.paperD, vn(u, v, 3)); if (Math.abs(Math.sin(u * 1.4 + v * 0.3)) < 0.15) c = mix(c, C.ink, 0.6); N = [0, 0, 1]; } }
  // wax puddles around the basin candles
  if (wet > 0.2) { spec = 0.55 * wet; gloss = 70; }
  return { alb: c, N, spec, gloss };
}

// ---------- back wall: ashlar, apse ossuary recess, cathedral map ----------
const inApse = (x, z) => x > APSE.x0 && x < APSE.x1 && (z < APSE.zs || (Math.hypot(x - APSE.x1, z - APSE.zs) < APSE.R && Math.hypot(x - APSE.x0, z - APSE.zs) < APSE.R));
function ossuary(x, z) { // stacked skull rows alternating with femur rows
  const band = 13, row = Math.floor(z / band), rz = z - row * band;
  let c, N = [0, 1, 0], ao = 1;
  if (rz < 4) { // femurs lying along x
    const seg = 15, ux = ((x + row * 7) % seg + seg) % seg; const r = Math.abs(rz - 2) / 2; const knob = Math.min(ux, seg - ux) < 2.2 ? 1.25 : 1;
    if (r < knob * 0.9) { c = mix(C.bone, C.boneD, vn(x / 3, z, 4) * 0.8); N = [0, 1, (rz - 2) * 0.5]; } else { c = mul(C.mortar, 0.5); ao = 0.5; }
  } else { // skulls
    const cw = 9, ux = ((x + row * 4.5) % cw + cw) % cw - cw / 2, uz = rz - 8.5; const e = Math.hypot(ux / 4.0, uz / 4.3);
    if (e < 1) { c = mix(C.bone, C.boneD, clamp(vn(x / 2, z / 2, 5) * 0.9 + e * 0.4));
      if (Math.hypot(Math.abs(ux) - 1.5, uz - 0.6) < 1.05 || (Math.abs(ux) < 0.5 && uz < -0.8 && uz > -2.0) || (uz < -2.8 && Math.abs(ux) < 2)) c = mul(C.mortar, 0.4);
      N = [ux * 0.18, 1, uz * 0.16]; }
    else { c = mul(C.mortar, 0.4); ao = 0.4; }
  }
  c = mix(c, C.grime, clamp((vn(x / 9, z / 40, 2) - 0.45) * 2) * 0.6);
  return { alb: mul(c, 0.8), N, spec: 0.1, gloss: 20, ao };
}
function mapAt(x, z) { // Lucian's plan of the cathedral pinned to the wall
  const u = (x - MAP.x0) / (MAP.x1 - MAP.x0), v = (z - MAP.z0) / (MAP.z1 - MAP.z0);
  const edge = Math.min(u, 1 - u, v, 1 - v) * 60 + (vn(x / 3, z / 3, 7) - 0.5) * 3;
  if (edge < 0) return null;
  let c = mix(C.paper, C.paperD, clamp(vn(x / 8, z / 8, 3) * 1.4 - 0.2 + (edge < 2 ? 0.5 : 0)));
  // plan: nave + transept (cross), apse, tower to the right with stacked floors, crypt rings below
  const X = (u - 0.42) * 100, Z = (v - 0.55) * 60;
  const nave = Math.abs(X) < 30 && Math.abs(Z) < 7, trans = Math.abs(X + 8) < 6 && Math.abs(Z) < 22, apse = Math.hypot(X - 30, Z) < 7 && X > 30;
  const inside = nave || trans || apse;
  const outline = inside && !(Math.abs(X) < 29 && Math.abs(Z) < 6 || Math.abs(X + 8) < 5 && Math.abs(Z) < 21 || Math.hypot(X - 30, Z) < 6 && X > 30);
  if (outline) c = mix(c, C.ink, 0.85);
  if (inside && !outline && ((Math.round(X) % 6 === 0 && Math.abs(Z) < 6) || (Math.round(Z) % 7 === 0 && Math.abs(X + 8) < 5))) c = mix(c, C.ink, 0.4);
  const tower = Math.abs(X - 46) < 4 && Z > -26 && Z < 26; if (tower && (Math.abs(Math.abs(X - 46) - 4) < 0.8 || Math.abs(((Z + 26) % 8) - 0) < 0.7)) c = mix(c, C.ink, 0.85);
  if (Math.abs(Math.hypot(X + 22, Z + 18) - 5) < 0.6 || Math.abs(Math.hypot(X + 12, Z + 20) - 3.5) < 0.6) c = mix(c, C.ink, 0.7); // crypt rings
  // red marks: freed reliquaries (circled) and the bell tower (crossed)
  for (const [mx, mz] of [[-22, 0], [-8, 16], [-8, -16], [30, 0]]) if (Math.abs(Math.hypot(X - mx, Z - mz) - 3.2) < 0.9) c = mix(c, C.bloodF, 0.9);
  if (Math.abs(X - 46) < 4 && Math.abs(Z - 18) < 4 && (Math.abs((X - 46) - (Z - 18)) < 0.9 || Math.abs((X - 46) + (Z - 18)) < 0.9)) c = mix(c, C.bloodF, 0.95);
  if (Math.min(Math.hypot(u - 0.02, v - 0.96), Math.hypot(u - 0.98, v - 0.96), Math.hypot(u - 0.02, v - 0.04), Math.hypot(u - 0.98, v - 0.04)) < 0.018) c = C.iron; // nails
  c = mix(c, C.grime, clamp((vn(x / 12, z / 12, 9) - 0.5) * 2) * 0.5);
  return { alb: c, N: [0, 1, 0.05 * Math.sin(x * 0.3)], spec: 0.03, gloss: 8 };
}
function wallAt(x, z) {
  const mp = x > MAP.x0 - 4 && x < MAP.x1 + 4 && z > MAP.z0 - 4 && z < MAP.z1 + 4 ? mapAt(x, z) : null; if (mp) return mp;
  const rh = 26, row = Math.floor(z / rh), rz = z - row * rh;
  const bw = 62, ox = (row * 31) % bw; const col = Math.floor((x + ox) / bw), rx = x + ox - col * bw;
  const id = col * 131 + row;
  let c = mix(C.wall, C.wallD, h2(id, 0, 3) * 0.8); c = mul(c, 0.8 + 0.4 * h2(id, 1, 4));
  let N = [0, 1, 0];
  const ex = Math.min(rx, bw - rx), ez = Math.min(rz, rh - rz);
  if (ex < 1.3 || ez < 1.3) c = C.mortar;
  else { if (ez < 3) N = [0, 1, rz < 13 ? -0.6 : 0.6]; else if (ex < 3) N = [rx < bw / 2 ? -0.6 : 0.6, 1, 0];
    c = mix(c, C.grime, clamp((fbm(x / 8, z / 8, 3, 7) - 0.45) * 2) * 0.8); }
  c = mix(c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.7);
  if (z < 26) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 26));
  // arch moulding around the apse
  const dA = Math.max(Math.hypot(x - APSE.x1, z - APSE.zs), Math.hypot(x - APSE.x0, z - APSE.zs)) - APSE.R;
  const jamb = z < APSE.zs ? Math.min(Math.abs(x - APSE.x0), Math.abs(x - APSE.x1)) : dA;
  if (jamb < 9 && jamb > 0) { c = mix(L('#5a5040'), C.grime, clamp((fbm(x / 6, z / 6, 3, 8) - 0.4) * 2) * 0.6); N = jamb < 3 ? [0, 1, 0.4] : jamb > 6 ? [0, 1, -0.3] : [0, 1, 0]; if (((z + x * 0.2) % 20) < 1.2) c = C.mortar; }
  // soot plumes above the sconces and the stall lantern
  for (const sx of [330, 630, 204]) { const d = Math.abs(x - sx + 3 * Math.sin(z * 0.08)); if (z > 100 && d < 14 - (z - 100) * 0.05) c = mix(c, L('#0a0806'), 0.55 * (1 - d / 14)); }
  // a bloody hand smeared down the wall by the stall
  if (Math.hypot(x - 268, z - 70) < 4 || (Math.abs(x - 268 + (z - 70) * 0.05) < 2.5 && z < 70 && z > 40 && vn(x, z / 4, 3) > 0.3)) c = mix(c, C.bloodD, 0.8);
  c = mul(c, clamp(1.15 - z / 250));
  return { alb: c, N, spec: 0.03, gloss: 10 };
}

function env(ox, oy, oz, vx, vy, vz) {
  const tw = oy / CS, zw = oz - SN * tw, xw = ox;
  if (zw > 0) {
    if (!inApse(xw, zw)) return { t: tw, P: [xw, 0, zw], ...wallAt(xw, zw), id: -2 };
    const tb = (oy - APSE.back) / CS, zb = oz - SN * tb; // recess back wall
    if (zb > 0) { const o = ossuary(xw, zb); o.alb = mul(o.alb, 0.75); return { t: tb, P: [xw, APSE.back, zb], ...o, id: -3 }; }
  }
  const tf = oz / SN, yf = oy - CS * tf, xf = ox;
  const dpx = xf - PIT.c[0], dpy = yf - PIT.c[1];
  if (dpx * dpx + dpy * dpy < PIT.R * PIT.R) {
    const tb = (oz + PIT.D) / SN, yb = oy - CS * tb;
    if (dpx * dpx + (yb - PIT.c[1]) ** 2 < PIT.R * PIT.R) { // pit floor: trampled dirt, blood, claw furrows
      let c = mix(C.dirt, C.dirtD, clamp(fbm(xf / 8, yb / 8, 3, 91) * 1.5 - 0.3));
      const v = fbm(xf / 14, yb / 10, 3, 92); c = mix(c, v > 0.6 ? C.blood : C.bloodD, clamp((v - 0.5) * 3) * 0.75);
      for (let k = 0; k < 4; k++) { const a = h2(k, 1, 93) * 3, cx = PIT.c[0] + (h2(k, 2, 93) - 0.5) * 80, cy = PIT.c[1] + (h2(k, 3, 93) - 0.5) * 60; for (let j = 0; j < 3; j++) { const ox2 = Math.cos(a + 1.57) * j * 2.5, oy2 = Math.sin(a + 1.57) * j * 2.5; if (segDist(xf, yb, [cx + ox2, cy + oy2], [cx + ox2 + Math.cos(a) * 14, cy + oy2 + Math.sin(a) * 14])[0] < 0.6) c = mul(C.dirtD, 0.5); } }
      return { t: tb, P: [xf, yb, -PIT.D], alb: c, N: [0, 0, 1], spec: v > 0.55 ? 0.5 : 0.05, gloss: 50, id: -4 };
    }
    const tW = (oy - PIT.c[1] + Math.sqrt(Math.max(0, PIT.R * PIT.R - dpx * dpx))) / CS, yW = oy - CS * tW, zW = oz - SN * tW; // inner wall (far side)
    const a = Math.atan2(yW - PIT.c[1], dpx); const wl = wallAt(a * 90 + 2000, zW + 40);
    const nW = [-dpx / PIT.R, -(yW - PIT.c[1]) / PIT.R, 0];
    return { t: tW, P: [xf, yW, zW], alb: mix(mul(wl.alb, 0.8), C.bloodD, clamp((-zW - 6) / 8) * 0.7 + (vn(a * 30, zW * 0.2, 4) > 0.6 ? 0.5 : 0)), N: nW, id: -4 };
  }
  const f = floorAt(xf, yf);
  const lipD = Math.hypot(dpx, dpy) - PIT.R; // stone curb around the pit
  if (lipD < 6) { f.alb = mix(mix(C.wall, C.stB, vn(xf / 4, yf / 4, 3)), C.bloodD, vn(xf / 6, yf / 6, 5) > 0.6 ? 0.6 : 0); f.N = lipD < 2 ? [dpx / PIT.R * 0.6, dpy / PIT.R * 0.6, 1] : [0, 0, 1]; if (Math.abs(((Math.atan2(dpy, dpx) * 14) % 1 + 1) % 1) < 0.05) f.alb = C.mortar; }
  return { t: tf, P: [xf, yf, 0], ...f, id: -1 };
}

// ---------- objects ----------
const objects = [];
const add = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const lw = (o, l) => [o.pos[0] + Math.cos(o.yaw) * l[0] - Math.sin(o.yaw) * l[1], o.pos[1] + Math.sin(o.yaw) * l[0] + Math.cos(o.yaw) * l[1], o.pos[2] + l[2]];
const hz = hero('idle');
const oHero = add('hero', hz, [HERO[0], HERO[1], 0], 0.55, { id: 60 });
const mV = vesna(), mS = severin(), mM = magda(), mL = lucian();
const oV = add('vesna', mV, [VES[0], VES[1], 0], -0.45, { id: 61 });
const oS = add('severin', mS, [SEV[0], SEV[1], 0], 0.55, { id: 62 });
const oM = add('magda', mM, [MAG[0], MAG[1], 0], 0.35, { id: 63 });
const oL = add('lucian', mL, [LUC[0], LUC[1], 0], -0.6, { id: 64 });
add('pillarL', pillar(), [330, 13, 0]); add('pillarR', pillar(), [630, 13, 0]);
add('sconceL', sconce(0.8), [330, 26, 88]); add('sconceR', sconce(0.6), [630, 26, 88]);
add('beam', beam(0, 960, 166), [0, 0, 0]);
const cof = coffin(); add('coffin', cof, [COF[0], COF[1], 0]);
add('lid', lid(), [392, 100, 0], Math.PI / 2);
add('basin', basin(), [BAS[0], BAS[1], 0]);
const R = mulberry32(3), bc = [];
for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.2 + (R() - 0.5) * 0.3, r = 50 + R() * 10; bc.push([BAS[0] + Math.cos(a) * r, BAS[1] + Math.sin(a) * r * 0.9, 0, 4 + R() * 9, 1.1 + R() * 0.5]); }
for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.6, r = 42; bc.push([BAS[0] + Math.cos(a) * r, BAS[1] + Math.sin(a) * r, 5, 3 + R() * 5, 1.0]); }
add('candlesB', candles(bc), [0, 0, 0]);
add('candlesC', candles([[416, 68, 8, 10, 1.3], [420, 116, 8, 6, 1.2], [544, 68, 8, 12, 1.3], [546, 114, 8, 5, 1.1], [410, 132, 0, 4, 1.1], [553, 130, 0, 7, 1.2]]), [0, 0, 0]);
add('candlesV', candles([[272, 192, 0, 6, 1.2], [279, 197, 0, 3.5, 1.1], [270, 199, 0, 2.5, 1.0]]), [0, 0, 0]);
const st = stall(); const oSt = add('stall', st, [STALL[0], STALL[1], 0]);
add('shelves', shelves(170), [STALL[0] - 8, 0, 0]);
add('desk', desk(), [DESK[0], DESK[1], 0]);
add('ring', ringStakes(84, 12), [PIT.c[0], PIT.c[1], 0]);
add('pitBones', pitBones(3), [PIT.c[0], PIT.c[1] + 8, -PIT.D]);
add('hide', hideFrame(), [58, 372, 0], 0.3);
const bz = brazier(); add('brazier', bz, [BRZ[0], BRZ[1], 0]);
add('dummy', dummy(), [DUM[0], DUM[1], 0], -1.0);
add('mirror', mirror(), [MIR[0], MIR[1], 0], 0.62);
add('armchair', armchair(), [905, 492, 0], 0.95);
add('candelabra', candelabra(), [848, 418, 0]);
for (const [x, y, yaw] of [[92, 300, 0.4], [300, 300, -0.8], [120, 590, 1.2], [36, 450, 2.2], [262, 600, 0.3], [700, 590, -0.5]]) add('skull', skull(), [x, y, 0], yaw);
// rats: around the stall, one on Vesna's shoulder, strays toward the basin
const sh = lw(oV, [8.5, 2.5, 63.5]);
add('rats', rats([[214, 196, 0, 1.2], [104, 176, 0, -0.5], [56, 152, 0, 2.0], [300, 222, 0, -2.5], [272, 150, 0, 0.3], [392, 262, 0, 1.0], [sh[0], sh[1], sh[2], -0.6], [240, 120, 0, -1.4], [30, 206, 0, 0.9]]), [0, 0, 0]);
// bats: roosting under the beam above the map, two in flight
add('bats', bats([[712, 8, 166, 0.1, 'hang'], [738, 9, 166, -0.2, 'hang'], [751, 8, 166, 0.3, 'hang'], [802, 9, 166, 0, 'hang'], [846, 8, 166, 0.2, 'hang'], [872, 9, 166, -0.1, 'hang'], [925, 8, 166, 0, 'hang'], [610, 8, 166, 0.1, 'hang'],
  [796, 34, 128, 0.15, 'fly'], [626, 44, 150, -0.35, 'fly'], [905, 120, 118, 0.4, 'fly']]), [0, 0, 0], 0, { id: 65 });

// ---------- lights ----------
const LANT = lw(oHero, hz.P._lantern), LCAN = lw(oL, mL.P._candle), LAMP = lw(oSt, st.lamp), FIRE = lw(objects.find(o => o.name === 'brazier'), bz.fire);
const chars = ['hero', 'vesna', 'severin', 'magda', 'lucian', 'bats', 'rats'];
const lights = [
  { name: 'lantern', p: LANT, c: L('#d0cc78'), I: 6, r0: 44, R: 260, pad: 3.6, soft: 6, haze: 0.012, hazeR: 4 },
  { name: 'basin', p: [BAS[0] + 10, BAS[1] + 50, 15], c: L('#e09a50'), I: 5.5, r0: 55, R: 320, soft: 8, haze: 0.02, hazeR: 12, skip: ['candlesB'] },
  { name: 'basinB', p: [BAS[0] - 6, BAS[1] - 62, 42], c: L('#d88a44'), I: 2.0, r0: 45, R: 220, soft: 8, skip: ['candlesB'] },
  { name: 'torchA', p: [101, 437, 50], c: L('#c8702e'), I: 3.2, r0: 40, R: 260, soft: 5, haze: 0.03, hazeR: 6, skip: ['ring'] },
  { name: 'coffin', p: [COF[0], COF[1] + 10, 46], c: L('#d89048'), I: 3.2, r0: 50, R: 230, soft: 8, haze: 0.012, hazeR: 10, skip: ['candlesC'] },
  { name: 'torchL', p: [330, 36, 106], c: L('#c8783a'), I: 2.4, r0: 45, R: 300, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceL'] },
  { name: 'torchR', p: [630, 36, 104], c: L('#b86a32'), I: 2.0, r0: 40, R: 280, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceR'] },
  { name: 'vesCandles', p: [276, 194, 14], c: L('#d89a50'), I: 2.4, r0: 30, R: 170, soft: 4, haze: 0.02, hazeR: 4, skip: ['candlesV'] },
  { name: 'lamp', p: LAMP, c: L('#d8a050'), I: 5.2, r0: 45, R: 260, pad: 4, soft: 5, haze: 0.03, hazeR: 5 },
  { name: 'desk', p: [DESK[0] + 34, DESK[1] + 7, 60], c: L('#e0b060'), I: 1.8, r0: 30, R: 240, soft: 5, haze: 0.02, hazeR: 6, skip: ['desk'] },
  { name: 'lucCandle', p: LCAN, c: L('#e0b060'), I: 1.6, r0: 30, R: 140, pad: 2, soft: 4, haze: 0.02, hazeR: 3, skip: ['lucian'] },
  { name: 'fire', p: FIRE, c: L('#e07a30'), I: 5.5, r0: 45, R: 340, pad: 6, soft: 6, haze: 0.04, hazeR: 10, skip: ['brazier'] },
  { name: 'candelabra', p: [848, 418, 74], c: L('#d8b070'), I: 3.2, r0: 40, R: 240, soft: 5, haze: 0.025, hazeR: 6, skip: ['candelabra'] },
  { name: 'mist', p: [SEV[0], SEV[1] + 20, 14], c: L('#8a82a6'), I: 0.9, r0: 90, R: 260, noShadow: true },
  { name: 'rim', p: [480, -220, 170], c: L('#9aa8a4'), I: 2.4, r0: 400, R: 1300, soft: 10, only: chars },
  { name: 'night', p: [480, 420, 220], c: L('#7a8a8e'), I: 0.5, r0: 300, R: 900, noShadow: true },
];
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#22262a') };
export async function scene() { return SC; }

// ---------- post: mist, grade, HUD ----------
const PAL = [...PALETTE, ...['#141a26', '#1e283a', '#2c3a52', '#2a2830', '#3e3a46', '#58525f', '#6e6680', '#9a92aa'].map(h => hex(h).map(v => v * 255))]; // + night blue (Lucian), pale violet (Séverin)
const FONT = { '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'] };
export async function finish(img, sc) {
  // mist pooling on the floor of Séverin's corner (and thin wisps across the front)
  const T0 = 4000;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, t = img.depth[i]; if (t > 1e8) continue;
    const sy = py + 0.5 + off; const y = sy * SN + CS * T0 - CS * t, z = sy * -CS + SN * T0 - SN * t, x = px + 0.5;
    const dx = (x - SEV[0] - 10) / 190, dy = (y - SEV[1] - 30) / 120; let m = clamp(1.15 - Math.hypot(dx, dy)) ** 1.5;
    m += 0.25 * clamp(1 - Math.abs(y - 610) / 60) * clamp((x - 480) / 300);
    if (m <= 0) continue;
    const n = fbm(x / 70 + z * 0.02, y / 9, 4, 301); const dens = clamp(m * (0.25 + clamp(n * 2.2 - 0.75)) * Math.exp(-Math.max(0, z + 2) / 16) * 1.1);
    const mc = [0.052, 0.046, 0.056];
    for (let k = 0; k < 3; k++) img.out[i * 3 + k] = img.out[i * 3 + k] * (1 - dens * 0.7) + mc[k] * dens;
  }
  haze(img, sc);
  const rgba = post(img, { exposure: 3.4, vignette: 0.45, desat: 0.16, grain: 0.012, dither: 0.02, noPal: !!process.env.NOPAL, palette: PAL });
  const put = (x, y, h) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const c = hex(h); const i = (y * W + x) * 4; rgba[i] = c[0] * 255; rgba[i + 1] = c[1] * 255; rgba[i + 2] = c[2] * 255; };
  // HUD: blood-drop counter, top-left (same frame colours as the dungeon HUD)
  const drop = ['....#....', '....#....', '...###...', '...###...', '..#####..', '.#######.', '.#######.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'];
  for (let x = 24; x <= 92; x++) for (let y = 20; y <= 38; y++) { const edge = x === 24 || x === 92 || y === 20 || y === 38; put(x, y, edge ? '#3e362b' : '#0c0a08'); }
  drop.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '#') return; const left = x < 4, top = y < 7; put(29 + x, 23 + y, (x === 3 && y > 5 && y < 10) ? '#b42c1e' : left && !top ? '#781116' : left ? '#951c18' : y > 9 ? '#3e060b' : '#5a0a10'); }));
  const txt = '1486'; [...txt].forEach((ch, k) => FONT[ch].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') { put(43 + k * 7 + x + 1, 26 + y + 1, '#030303'); put(43 + k * 7 + x, 26 + y, y < 2 ? '#ece2c6' : '#cfc2a2'); } })));
  writePNG('refuge-native.png', rgba, W, H, 1);
  writePNG('refuge.png', rgba, W, H, 2);
}
