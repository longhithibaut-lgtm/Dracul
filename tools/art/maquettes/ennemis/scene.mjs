// Readability test: the torture crypt game screen (from ecran.mjs) with the new enemies around the hero.
import { camera, project, post, haze, writePNG, L, hex, clamp, lerp, sstep, h2, vn, fbm, mix, mul, mulberry32 } from './lib.mjs';
import { hero } from './hero.mjs';
import { chien, penitent, pretre, purificateur, pendu, motes } from './foes.mjs';
import { floorFx, place } from './fx.mjs';
import { ghoul, crossbowman, hangingCorpse, wristCorpse, pitBodies, slumped, cage, pillar, sconce, portcullis, skull } from './cast.mjs';

const W = 960, H = 540, cam = camera(38 * Math.PI / 180), off = -150;
const { s: SN, c: CS } = cam;
const C = {
  mortar: L('#0e0c0a'), stA: L('#4a4337'), stB: L('#584e40'), stC: L('#423f39'), grime: L('#1c1813'), moss: L('#3a4426'), mossL: L('#56602f'),
  blood: L('#560710'), bloodF: L('#6e0a12'), bloodD: L('#2e0406'), wall: L('#3a342c'), wallD: L('#221e19'), iron: L('#2a2622'), rust: L('#5b3520'),
  straw: L('#6e5c34'), bone: L('#b0a486'),
};
const HERO = [470, 462], XB = [770, 300], G = [[318, 352, -0.95, 0, 21], [655, 525, 1.9, 1, 22], [292, 584, -2.2, 0, 23]];
const PIT = { x0: 108, x1: 286, y0: 246, y1: 318, D: 30 };
const DRAIN = [528, 318];
const GATE = { x0: 405, x1: 555, cz: 112, r: 75 };

// ---------- floor decals (world units) ----------
const R = mulberry32(7);
const stains = [ // x, y, rx, ry, color, amount, seed, wet
  [DRAIN[0], DRAIN[1], 46, 34, C.blood, 0.95, 41, 1], [DRAIN[0] - 6, DRAIN[1] + 4, 24, 18, C.bloodD, 0.9, 42, 1],
  [650, 82, 20, 12, C.bloodF, 0.95, 61, 1], [650, 82, 9, 6, C.bloodD, 0.9, 62, 1],          // under the gutted corpse
  [850, 318, 34, 16, C.blood, 0.7, 71, 0], [200, 338, 60, 14, C.blood, 0.8, 81, 1],            // cage, pit spill
  [88, 230, 22, 10, C.blood, 0.6, 91, 0], [700, 560, 50, 20, C.grime, 0.6, 93, 0], [380, 140, 30, 12, C.grime, 0.7, 94, 0],
];
const trails = [ // drag marks: polyline, half-width, color, amount
  [[[470, 10], [462, 60], [440, 120], [400, 180], [330, 230], [290, 250]], 9, C.blood, 0.75, 51],
  [[[286, 330], [330, 352], [360, 380]], 6, C.blood, 0.7, 53],
  [[[DRAIN[0] + 30, DRAIN[1] + 20], [600, 420], [640, 500]], 3, C.bloodD, 0.55, 54],
];
const grooves = [[[DRAIN[0] - 16, DRAIN[1] - 6], [480, 296], [440, 290]], [[DRAIN[0] + 14, DRAIN[1] - 8], [570, 280], [590, 250]], [[DRAIN[0] + 4, DRAIN[1] + 16], [536, 360]]];
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)); return [Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t), t]; }
function polyDist(px, py, pts) { let best = 1e9, along = 0, acc = 0; for (let i = 0; i < pts.length - 1; i++) { const [d, t] = segDist(px, py, pts[i], pts[i + 1]); const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (d < best) { best = d; along = acc + t * len; } acc += len; } return [best, along]; }

function floorAt(x, y) {
  // flagstones: jittered-grid Voronoi, F2-F1 for mortar + bevel normals
  const CW = 36, CH = 27;
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
  if (e < 1.3) { c = mix(C.mortar, c, 0.25 * e); N = [0, 0, 1]; }
  else {
    const bev = clamp(1 - (e - 1.3) / 2.2); const l = Math.hypot(ddx, ddy) || 1;
    N = [ddx / l * bev * 0.7 + tl[0], ddy / l * bev * 0.7 + tl[1], 1];
    const g = fbm(x / 7, y / 7, 3, 9 + (id & 7)); c = mix(c, C.grime, clamp((g - 0.4) * 2) * 0.85);
    const sp = h2(x * 2 | 0, y * 2 | 0, 11); if (sp < 0.08) c = mul(c, 0.65); else if (sp > 0.97) c = mul(c, 1.25);
    if (vn(x / 3, y / 3, 13) > 0.8 && vn(x / 40, y / 40, 14) > 0.5) c = mul(c, 0.45); // cracks
  }
  // filth, moss near the wall, damp
  const f = fbm(x / 50, y / 40, 4, 21); if (f > 0.5) c = mix(c, C.grime, clamp((f - 0.5) * 4) * 0.8);
  const m = fbm(x / 26, y / 22, 4, 33), nearW = clamp(1 - y / 70);
  if (m * (0.6 + nearW) > 0.6) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? C.mossL : C.moss, clamp((m * (0.6 + nearW) - 0.6) * 4) * 0.8);
  c = mul(c, 0.75 + 0.5 * fbm(x / 90, y / 70, 3, 44));
  // straw and bone splinters
  { const cx = Math.floor(x / 6), cy = Math.floor(y / 6), r = h2(cx, cy, 300);
    if (r < 0.035) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 6 + 3), ly = y - (cy * 6 + 3); const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.5 && Math.abs(u) < 3.5) { c = r < 0.006 ? C.bone : mix(C.straw, mul(C.straw, 0.6), h2(cx, cy, 302)); N = [0, 0, 1]; } } }
  // decals
  let wet = 0;
  for (const [sx, sy, rx, ry, col, amt, seed, w] of stains) {
    const dx = (x - sx) / rx, dy = (y - sy) / ry; const dd = dx * dx + dy * dy; if (dd > 3) continue;
    const v = 1 - Math.sqrt(dd) + (fbm(x / 6, y / 6, 3, seed) - 0.5) * 1.1;
    if (v > 0) { const a = clamp(v * 3) * amt; c = mix(c, col, a); if (w) wet = Math.max(wet, a); }
  }
  for (const [pts, hw, col, amt, seed] of trails) {
    const [d, along] = polyDist(x, y, pts); if (d > hw * 1.5) continue;
    const streak = vn(d * (Math.sign(segDist(x, y, pts[0], pts[1])[0]) || 1) * 0.6 + 40, along / 8, seed);
    const v = streak - (d / hw) ** 2 * 0.8 - 0.15 + (fbm(x / 3, y / 3, 2, seed + 1) - 0.5) * 0.6;
    if (v > 0) { const a = clamp(v * 2) * amt; c = mix(c, col, a); wet = Math.max(wet, a * 0.5); }
  }
  for (const g of grooves) { const [d] = polyDist(x, y, g); if (d < 2.2) { c = mix(C.mortar, C.bloodD, d < 1.4 ? 0.9 : 0.3); N = [0, 0, 1]; wet = Math.max(wet, 0.7); } }
  // bloody claw prints from the pit to the hero
  for (let k = 0; k < 7; k++) { const px = 300 + k * 22 + (k & 1) * 6, py = 360 + k * 13 + ((k & 1) ? 8 : 0); for (let t = 0; t < 4; t++) { const [d] = segDist(x, y, [px + t * 2.4 - 3, py], [px + t * 3.2 - 5, py + 5]); if (d < 0.8) c = mix(c, C.blood, 0.8 - k * 0.07); } }
  // drain
  const ddr = Math.hypot(x - DRAIN[0], y - DRAIN[1]);
  if (ddr < 18) {
    if (ddr > 14) { c = ddr > 16.5 ? C.mortar : mix(C.iron, C.rust, h2(x | 0, y | 0, 9) * 0.8); N = [0, 0, 1]; spec = 0.4; gloss = 30; }
    else if (((x + 400) % 5) < 1.6 || ((y + 400) % 6) < 1.6) { c = mix(C.iron, C.rust, vn(x / 3, y / 3, 9)); N = [0, 0, 1]; spec = 0.4; gloss = 30; }
    else return { alb: [0.002, 0.0004, 0.0003], N: [0, 0, 1], spec: 0, ao: 0.2 };
  }
  if (wet > 0.2) { spec = 0.55 * wet; gloss = 70; }
  return { alb: c, N, spec, gloss };
}

function wallAt(x, z) {
  const row = Math.floor(z / 22), rz = z - row * 22;
  const bw = 52, ox = (row * 29) % bw; const col = Math.floor((x + ox) / bw), rx = x + ox - col * bw;
  const id = col * 131 + row;
  let c = mix(C.wall, C.wallD, h2(id, 0, 3) * 0.8); c = mul(c, 0.8 + 0.4 * h2(id, 1, 4));
  let N = [0, 1, 0];
  const ex = Math.min(rx, bw - rx), ez = Math.min(rz, 22 - rz);
  if (ex < 1.3 || ez < 1.3) c = C.mortar;
  else {
    if (ez < 3) N = [0, 1, rz < 11 ? -0.6 : 0.6]; else if (ex < 3) N = [rx < bw / 2 ? -0.6 : 0.6, 1, 0];
    c = mix(c, C.grime, clamp((fbm(x / 8, z / 8, 3, 7) - 0.45) * 2) * 0.8);
  }
  c = mix(c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.7); // damp streaks
  if (z < 30) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 30));
  // old blood smeared down the wall under the hooks
  for (const hx of [300, 650, 860]) { const d = Math.abs(x - hx + 3 * Math.sin(z * 0.1)); if (d < 9 && z < 140 && vn(x / 3, z / 20, hx) > 0.35) c = mix(c, C.bloodD, 0.7 * (1 - d / 9)); }
  c = mul(c, clamp(1.15 - z / 260)); // soot toward the vault
  return { alb: c, N, spec: 0.03, gloss: 10 };
}

function env(ox, oy, oz, vx, vy, vz) {
  // back wall Y=0
  const tw = oy / CS, zw = oz - SN * tw, xw = ox;
  if (zw > 0) {
    const inGate = xw > GATE.x0 && xw < GATE.x1 && (zw < GATE.cz || Math.hypot(xw - 480, zw - GATE.cz) < GATE.r);
    if (!inGate) { const w = wallAt(xw, zw); return { t: tw, P: [xw, 0, zw], ...w, id: -2 }; }
    // tunnel beyond the gate
    const tf = oz / SN, yf = oy - CS * tf;
    if (yf > -150) { return { t: tf, P: [ox, yf, 0], alb: mix(C.stA, C.grime, 0.6 + 0.4 * vn(ox / 9, yf / 9, 3)), N: [0, 0, 1], spec: 0.3, gloss: 40, id: -3 }; }
    const tb = (oy + 150) / CS, zb = oz - SN * tb; const fog = (0.35 + 0.65 * fbm(ox / 30, zb / 18, 3, 77)) * clamp(1 - zb / 160) * 0.05; return { t: tb, P: [ox, -150, zb], alb: mul(C.wallD, 0.4), N: [0, 1, 0], id: -3, emi: [fog * 0.55, fog * 0.7, fog * 0.68], noAO: true };
  }
  // floor
  const tf = oz / SN, yf = oy - CS * tf, xf = ox;
  if (xf > PIT.x0 && xf < PIT.x1 && yf > PIT.y0 && yf < PIT.y1) {
    const tb = (oz + PIT.D) / SN, yb = oy - CS * tb;
    if (yb >= PIT.y0) return { t: tb, P: [xf, yb, -PIT.D], alb: mix(C.grime, C.bloodD, 0.5), N: [0, 0, 1], spec: 0.4, gloss: 50, id: -4 };
    const t2 = (oy - PIT.y0) / CS, z2 = oz - SN * t2; // inner north face
    const w = wallAt(xf * 1.3, z2 + 60); return { t: t2, P: [xf, PIT.y0, z2], alb: mix(mul(w.alb, 0.8), C.bloodD, clamp((-z2 - 20) / 20) * 0.7), N: [0, 1, 0], id: -4 };
  }
  const f = floorAt(xf, yf);
  // pit lip: darker worn edge
  const lip = Math.min(Math.abs(xf - PIT.x0), Math.abs(xf - PIT.x1), Math.abs(yf - PIT.y0), Math.abs(yf - PIT.y1));
  if (xf > PIT.x0 - 5 && xf < PIT.x1 + 5 && yf > PIT.y0 - 5 && yf < PIT.y1 + 5 && lip < 5) { f.alb = mix(C.wall, C.grime, 0.3); f.N = [0, 0, 1]; }
  return { t: tf, P: [xf, yf, 0], ...f, emi: floorFx(xf, yf, FX), id: -1 };
}

// ---------- objects ----------
const objects = [];
const add = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const hz = hero('idle');
const heroYaw = 0.35;
add('hero', hz, [HERO[0], HERO[1], 0], heroYaw, { id: 60 });
// the new enemies: priest calling light under the hero, hound lunging, two penitents closing in, a purifier, a hanged ghoul waiting
const FX = [], FL = [];
const foe = (name, m, x, y, yaw, fx = true) => { const P = { x, y, yaw }; add(name, m, [x, y, 0], yaw, { id: 70 + objects.length });
  if (m.vfx && fx) add(name + 'vfx', { ...m.vfx, noShadow: true, noSelfAO: true }, [x, y, 0], yaw, { id: 69 });
  for (const l of fx ? m.lights : m.lights.slice(0, 1)) FL.push({ soft: 5, R: 200, ...l, p: place(P, l.p) }); if (fx) for (const f of m.fx) FX.push({ ...f, P }); };
const toward = (x, y) => Math.atan2(-(HERO[0] - x), HERO[1] - y); // yaw whose forward (local +y) faces the hero
foe('pretre', pretre('atk'), 735, 236, toward(735, 236), false);
FX.push({ k: 'zone', c: [HERO[0], HERO[1] - 2], r: 24, col: 'holy', P: { x: 0, y: 0, yaw: 0 } });
add('motes', { ...motes([HERO[0], HERO[1] - 2], 20, 26), noShadow: true, noSelfAO: true }, [0, 0, 0], 0, { id: 69 });
FL.push({ p: [HERO[0], HERO[1], 8], c: L('#e8c878'), I: 1.6, r0: 20, R: 80, haze: 0.025, hazeR: 9, noShadow: true });
foe('chien', chien('atk'), 372, 436, toward(372, 436));
foe('pen0', penitent('idle', 2), 405, 318, toward(405, 318), false);
foe('pen1', penitent('idle', 4), 610, 600, toward(610, 600), false);
foe('pen2', penitent('idle', 5), 300, 560, toward(300, 560), false);
foe('purif', purificateur('idle'), 735, 470, toward(735, 470), false);
foe('pendu', pendu('idle', 7), 596, 372, 0.4, false);
add('pillarL', pillar(), [215, 13, 0]); add('pillarR', pillar(), [745, 13, 0]);
add('sconceL', sconce(0.8), [215, 26, 88]); add('sconceR', sconce(0.55), [745, 26, 88]); add('sconceM', sconce(0.4), [338, 0, 84]);
add('gate', portcullis(150, 190), [480, -4, 0]); // raised a little: bottom spikes hang above the floor
add('corpseUp', hangingCorpse(3, 520), [196, 286, -16], 0.4);
add('corpseWr', wristCorpse(5, 520), [650, 80, 0], -0.2);
add('pitBodies', pitBodies(9, 170, 64), [197, 282, -PIT.D + 10]);
add('cage', cage(36, 28, 66), [852, 320, 0], -0.15);
add('prisoner', slumped(11), [852, 316, 2], 0.3);
add('hcage', cage(30, 24, 48, true, 520), [104, 176, 40], 0.3);
for (const [x, y, yaw] of [[402, 410, 0.8], [612, 360, -0.4], [118, 420, 2.0], [760, 470, 0.2], [560, 230, 1.0]]) add('skull', skull(), [x, y, 0], yaw);

// ---------- lights ----------
const lw = (o, l) => [o.pos[0] + Math.cos(o.yaw) * l[0] - Math.sin(o.yaw) * l[1], o.pos[1] + Math.sin(o.yaw) * l[0] + Math.cos(o.yaw) * l[1], l[2]];
const LANT = lw(objects[0], hz.P._lantern);
const lights = [
  { name: 'lantern', p: LANT, c: L('#d0cc78'), I: 9, r0: 48, R: 330, pad: 3.6, soft: 6, haze: 0.012, hazeR: 4 },
  { name: 'torchL', p: [215, 36, 106], c: L('#c8783a'), I: 4, r0: 45, R: 340, soft: 5, haze: 0.03, hazeR: 7, skip: ['sconceL'] },
  { name: 'torchR', p: [745, 36, 104], c: L('#b86a32'), I: 3, r0: 40, R: 300, soft: 5, haze: 0.03, hazeR: 6, skip: ['sconceR'] },
  { name: 'gate', p: [480, -40, 150], c: L('#8aa4a0'), I: 1.7, r0: 110, R: 440, soft: 8, skip: ['gate'] },
  { name: 'gateBack', p: [480, -120, 60], c: L('#8aa4a0'), I: 2.0, r0: 60, R: 200, soft: 8, only: ['gate'] },
  { name: 'torchM', p: [338, 10, 102], c: L('#a85a2a'), I: 1.3, r0: 30, R: 200, soft: 5, haze: 0.03, hazeR: 4, skip: ['sconceM'] },
  { name: 'rim', p: [560, -160, 140], c: L('#9aa8a4'), I: 2.2, r0: 400, R: 1200, soft: 10, only: ['hero', 'pretre', 'chien', 'pen0', 'pen1', 'pen2', 'purif', 'pendu', 'prisoner', 'corpseUp', 'corpseWr'] },
  ...FL,
  { name: 'night', p: [HERO[0] - 40, HERO[1] + 60, 160], c: L('#7a8a8e'), I: 1.1, r0: 260, R: 700, noShadow: true },
];
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#22262a').map(v => v * 1.0) };
export async function scene() { return SC; }

export async function finish(img, sc) {
  haze(img, sc);
  const rgba = post(img, { exposure: 3.4, vignette: 0.45, desat: 0.18, grain: 0.012, dither: 0.02, noPal: !!process.env.NOPAL });
  const put = (x, y, h) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const c = hex(h); const i = (y * W + x) * 4; rgba[i] = c[0] * 255; rgba[i + 1] = c[1] * 255; rgba[i + 2] = c[2] * 255; };
  // HUD: blood vial bar + three hunger fangs (top-left)
  for (let x = 24; x <= 166; x++) for (let y = 22; y <= 33; y++) {
    const edge = x === 24 || x === 166 || y === 22 || y === 33, fill = x < 112;
    put(x, y, edge ? '#3e362b' : fill ? (y === 23 ? '#951c18' : y < 29 ? '#5a0a10' : '#3e060b') : '#0c0a08');
  }
  for (let x = 25; x < 112; x += 9) put(x, 24, '#b42c1e');
  for (let k = 0; k < 3; k++) for (let y = 0; y < 9; y++) for (let x = 0; x < 6; x++) { const w = 3 - Math.floor(y / 3); if (Math.abs(x - 2.5) < w) put(26 + k * 10 + x, 40 + y, k < 2 ? (x < 3 ? '#cfc2a2' : '#8c7e64') : '#2b251d'); }
  writePNG('ennemis-scene-native.png', rgba, W, H, 1);
  writePNG('ennemis-scene.png', rgba, W, H, 2);
}
