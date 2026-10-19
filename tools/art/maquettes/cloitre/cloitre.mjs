// The cloister under the eternal Dawn: 960x540 native, shown x2. Harsh holy sun from the upper left, hard cool shade.
import { camera, project, post, haze, writePNG, L, hex, clamp, sstep, h2, vn, fbm, mix, mul, mulberry32, sdBox, PALETTE } from './lib.mjs';
import { hero } from './hero.mjs';
import { ghoul, crossbowman, slumped, skull } from './cast.mjs';
import { arcade, well, hedge, cross, stele, cypress, yew, burnt, exhumed, ruin, K } from './props.mjs';

const W = 960, H = 540, cam = camera(38 * Math.PI / 180), off = -105;
const { s: SN, c: CS } = cam;
const SUN = (() => { const d = [-0.55, -0.5, 0.67], l = Math.hypot(...d); return d.map(v => v / l); })();
const C = {
  grav: L('#c6ba98'), gravD: L('#8e8468'), flag: L('#6a604e'), flagD: L('#3e382e'), mortar: L('#1c1914'),
  straw: L('#9a8c4a'), olive: L('#5e6430'), dead: L('#5a4630'), sick: L('#7a8a3c'), earth: L('#4c3c2c'), earthD: L('#2e241a'), curb: L('#a49a80'),
  ash: L('#9c968a'), ashD: L('#4a4640'), scorch: L('#1a120c'), blood: L('#560710'), bloodD: L('#2e0406'), bone: L('#c8bc9a'),
};
const HERO = [322, 190], XB = [800, 62], BURNT = [486, 252], WELL = [480, 425];
const GRAVE = { x0: 676, x1: 782, y0: 288, y1: 322, D: 20 };
const isPath = (x, y) => y < 132 || Math.abs(x - 480) < 36 || (y > 398 && y < 452);
const graves = [[620, 236], [720, 214], [846, 232], [650, 356], [916, 330], [850, 352]]; // [x,y] of mounds (marker at north end)

function lawn(x, y) {
  // dry tufts ~2-3 px, seen slightly from above (taller than wide); dark gaps between them
  const t = vn(x / 2.1, y / 1.5, 21) * 0.7 + vn(x / 1.1, y / 0.8, 22) * 0.3, m = fbm(x / 70, y / 60, 3, 4);
  let c = mix(C.straw, C.olive, clamp(fbm(x / 22, y / 18, 3, 3) * 1.6 - 0.35));
  c = mix(c, C.sick, clamp((fbm(x / 14, y / 14, 2, 5) - 0.55) * 3) * 0.6);
  c = mix(c, C.dead, clamp((m - 0.5) * 3) * 0.7);
  const bare = clamp((fbm(x / 26, y / 26, 3, 6) - 0.63) * 8);
  if (t < 0.36) c = mul(c, 0.42); else if (t > 0.68) c = mix(c, L('#d0c27e'), 0.45);
  c = mix(c, mix(C.earth, C.earthD, vn(x / 3, y / 3, 23)), bare);
  const e = 0.5, gx = vn((x + e) / 2.1, y / 1.5, 21) - vn((x - e) / 2.1, y / 1.5, 21), gy = vn(x / 2.1, (y + e) / 1.5, 21) - vn(x / 2.1, (y - e) / 1.5, 21);
  return { alb: c, N: [-gx * 2.5, -gy * 2.5, 1], wrap: 0.2 };
}
function gravel(x, y) {
  let c = mix(C.grav, C.gravD, clamp(fbm(x / 9, y / 9, 3, 11) * 1.5 - 0.45));
  const p = h2(x * 0.5 | 0, y * 0.6 | 0, 12); if (p < 0.12) c = mul(c, 0.62); else if (p > 0.9) c = mul(c, 1.12);
  c = mix(c, C.dead, clamp((fbm(x / 40, y / 30, 3, 13) - 0.55) * 2) * 0.5); // weeds, dirt
  const N = [(h2(x | 0, y | 0, 14) - 0.5) * 0.5, (h2(x | 0, y | 0, 15) - 0.5) * 0.5, 1];
  return { alb: c, N, spec: 0.03 };
}
function flags(x, y) {
  const CW = 34, CH = 24, gy = Math.floor(y / CH), xs = x + (gy & 1) * 17, gx = Math.floor(xs / CW), xo = xs - gx * CW;
  const id = gx * 97 + gy, e = Math.min(xo, CW - xo, y - gy * CH, (gy + 1) * CH - y);
  let c = mul(mix(C.flag, C.flagD, h2(id, 0, 3)), 0.8 + 0.3 * fbm(x / 6, y / 6, 2, 4));
  if (e < 1.2) c = C.mortar;
  return { alb: c, N: [0, 0, 1], spec: 0.05, ao: 0.55 };
}
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); }

function floorAt(x, y) {
  if (y < 76) return flags(x, y);
  let f;
  const dw = Math.hypot(x - WELL[0], (y - WELL[1]) * 1.0);
  if (dw < 42) { f = flags(x * 0.8 + 900, y * 0.8); f.alb = mix(f.alb, C.grav, 0.45); f.ao = 1; }
  else if (isPath(x, y)) f = gravel(x, y);
  else {
    // stone curb between path and lawn
    const dPath = Math.min(Math.abs(y - 132), Math.abs(Math.abs(x - 480) - 36), Math.abs(y - 398), Math.abs(y - 452));
    f = dPath < 3.2 ? { alb: mul(C.curb, 0.8 + 0.3 * h2(x / 12 | 0, y / 12 | 0, 3)), N: [0, 0, 1], spec: 0.04 } : lawn(x, y);
  }
  let c = f.alb;
  // grave mounds (earth, turned over)
  for (const [gx, gy] of graves) { const dx = (x - gx) / 13, dy = (y - gy - 24) / 22; const d = dx * dx + dy * dy; if (d < 1.25) { const v = 1 - d + (vn(x / 4, y / 4, gx) - 0.5) * 0.6; if (v > 0) { c = mix(c, mix(C.earth, C.earthD, vn(x / 3, y / 3, gy)), clamp(v * 3)); f.N = [dx * 0.4, dy * 0.4, 1]; } } }
  // open grave: spoil heap
  { const dx = (x - 806) / 22, dy = (y - 300) / 16; const d = dx * dx + dy * dy; if (d < 1.3) { const v = 1.1 - d + (vn(x / 3, y / 3, 77) - 0.5) * 0.5; if (v > 0) { c = mix(c, mix(C.earth, C.earthD, vn(x / 2, y / 2, 78)), clamp(v * 3)); f.N = [dx * 0.8, dy * 0.8, 1]; } } }
  // ash and scorch under the burnt one; ash blown down-right by the light
  { const dx = x - BURNT[0], dy = y - BURNT[1] + 4; const d = Math.hypot(dx / 34, dy / 60);
    const v = 1 - d + (fbm(x / 5, y / 5, 3, 31) - 0.5) * 0.9; if (v > 0) c = mix(c, v > 0.3 ? C.scorch : mix(C.ashD, C.ash, fbm(x / 3, y / 3, 2, 32) * 0.7), clamp(v * 2.5));
    const t = segDist(x, y, [BURNT[0] + 6, BURNT[1] + 30], [BURNT[0] + 60, BURNT[1] + 86]); if (t < 9 && vn(x / 3, y / 3, 33) > 0.3 + t / 14) c = mix(c, C.ash, 0.75); }
  // dried blood dragged from the open grave into the north hedge
  { const t = Math.min(segDist(x, y, [690, 300], [610, 268]), segDist(x, y, [610, 268], [560, 262])); if (t < 4 && vn(x / 2.5, y / 2.5, 35) > 0.35 + t / 8) c = mix(c, C.bloodD, 0.8); }
  // fresh drag trail: the lunging ghoul pulled something out of the open grave, across the gravel
  { const pts = [[712, 326], [690, 372], [664, 420], [640, 468], [630, 486]]; let t = 1e9; for (let k = 0; k < pts.length - 1; k++) t = Math.min(t, segDist(x, y, pts[k], pts[k + 1]));
    if (t < 10) { const v = vn(x / 2.5, y / 5, 36) * 0.6 + 0.35 - t / 9 + (fbm(x / 2, y / 2, 2, 37) - 0.5) * 0.5; if (v > 0) { c = mix(c, v > 0.3 ? C.bloodD : C.blood, clamp(v * 4) * 0.95); f.spec = 0.5; f.gloss = 60; } } }
  // bone splinters and teeth scattered on the lawn by the cemetery
  { const cx = Math.floor(x / 7), cy = Math.floor(y / 7), r = h2(cx, cy, 300); const nearG = x > 560 && y > 180 && y < 400;
    if (r < (nearG ? 0.05 : 0.008)) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 7 + 3.5), ly = y - (cy * 7 + 3.5); const u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.6 && Math.abs(u) < 3) { c = C.bone; f.N = [0, 0, 1]; } } }
  f.alb = c; return f;
}

function env(ox, oy, oz, vx, vy, vz) {
  const tf = oz / SN, yf = oy - CS * tf, xf = ox;
  if (xf > GRAVE.x0 && xf < GRAVE.x1 && yf > GRAVE.y0 && yf < GRAVE.y1) {
    const tb = (oz + GRAVE.D) / SN, yb = oy - CS * tb;
    return { t: tb, P: [xf, yb, -GRAVE.D], alb: mix(mul(C.earthD, 0.7), C.bloodD, 0.6 * vn(xf / 4, yb / 4, 3)), N: [0, 0, 1], spec: 0.3, gloss: 40, id: -4 };
  }
  const f = floorAt(xf, yf);
  return { t: tf, P: [xf, yf, 0], ...f, id: -1 };
}

// ---------- objects ----------
const objects = [];
const add = (name, m, pos, yaw = 0, extra = {}) => { const o = { name, pos, yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step, noSelfAO: m.noSelfAO, noShadow: m.noShadow, id: objects.length, ...extra }; objects.push(o); return o; };
const hz = hero('idle');
add('hero', hz, [HERO[0], HERO[1], 0], 0.55, { id: 60 });
add('arcade', arcade(), [0, 0, 0]);
// the west gallery wall, just off screen: only its shadow shows
add('westwall', { sdf: (x, y, z) => sdBox(x, y, z, 0, 0, 75, 10, 600, 75), mat: () => ({ alb: K.lime }), bounds: [-12, -602, 0, 12, 602, 152], step: 0.9 }, [-62, 300, 0]);
const xb = crossbowman(); add('xbow', xb, [XB[0], XB[1], 0], 1.33, { id: 80 });
[[232, 318, -2.65, 0, 21], [626, 486, 2.1, 1, 22]].forEach(([x, y, yaw, v, seed], i) => add('ghoul' + i, ghoul(v, seed), [x, y, 0], yaw, { id: 70 + i }));
add('well', well(), [WELL[0], WELL[1], 0]);
add('hedgeNW', hedge(200, 13, 26, 1), [418, 268, 0], Math.PI / 2);
add('hedgeNE', hedge(150, 13, 26, 2), [544, 236, 0], Math.PI / 2);
add('hedgeSW', hedge(240, 13, 26, 3), [286, 494, 0]);
add('hedgeSE', hedge(150, 13, 26, 4), [544, 560, 0], Math.PI / 2);
add('cypress', cypress(200, 17, 3), [196, 236, 0]);
add('yew', yew(5), [790, 560, 0]);
add('burnt', burnt(), [BURNT[0], BURNT[1], 0], 0.12);
{ const gx = (GRAVE.x0 + GRAVE.x1) / 2, gy = (GRAVE.y0 + GRAVE.y1) / 2, hx = (GRAVE.x1 - GRAVE.x0) / 2, hy = (GRAVE.y1 - GRAVE.y0) / 2;
  add('pit', { sdf: (x, y, z) => Math.max(sdBox(x, y, z, 0, 0, -11, hx + 8, hy + 8, 10.5), -sdBox(x, y, z, 0, 0, 0, hx, hy, 30)) - 0.5 * (vn(x / 2 + z / 3, y / 2, 4) - 0.5),
    mat: (m, x, y, z) => ({ alb: mix(C.earth, C.earthD, vn(x / 2, z / 2 + y / 2, 5)), wrap: 0.1 }), bounds: [-hx - 9, -hy - 9, -22, hx + 9, hy + 9, 0], step: 0.8 }, [gx, gy, 0]); }
add('monk', exhumed(13), [729, 305, -GRAVE.D + 1], Math.PI / 2 + 0.06);
add('ruin', ruin(84, 7), [196, 590, 0], 0.08);
add('slumped', slumped(11), [196, 608, 0], -0.25);
graves.forEach(([x, y], i) => { if (i === 5) return; add('grave' + i, i % 2 ? stele(32 + i * 2) : cross(42 + i * 2), [x, y, 0], (h2(i, 0, 3) - 0.5) * 0.3); });
add('fallen', cross(46, true), [872, 384, 0], 1.25);
for (const [x, y, z, yaw] of [[428, 226, 0, 0.5], [427, 318, 2, -0.8], [250, 503, 0, 2.4], [796, 330, 0, 0.9], [702, 330, 0, -0.3], [554, 520, 0, 1.4], [330, 504, 0, 0.3]]) add('skull', skull(), [x, y, z], yaw);

// ---------- lights ----------
const lw = (o, l) => [o.pos[0] + Math.cos(o.yaw) * l[0] - Math.sin(o.yaw) * l[1], o.pos[1] + Math.sin(o.yaw) * l[0] + Math.cos(o.yaw) * l[1], l[2]];
const LANT = lw(objects[0], hz.P._lantern), XL = lw(objects.find(o => o.name === 'xbow'), xb.lantern);
const FAR = 1e5;
const SUNC = L(process.env.SUNC || '#fbf4bc');
const lights = [
  { name: 'sun', mask: true, p: [480 + SUN[0] * FAR, 300 + SUN[1] * FAR, SUN[2] * FAR], c: SUNC, I: +(process.env.SUNI || 3.6), r0: 1e9, R: 1e12, soft: 150, pad: 10 },
  { name: 'lantern', p: LANT, c: L('#d0cc78'), I: 1.6, r0: 26, R: 140, pad: 3.6, soft: 6, haze: 0.006, hazeR: 3 },
  { name: 'xlan', p: XL, c: L('#e09040'), I: 3.5, r0: 34, R: 220, pad: 2.6, soft: 5, haze: 0.025, hazeR: 3 },
  { name: 'rim', p: [140, -200, 160], c: L('#9aa8b4'), I: 2.0, r0: 400, R: 1200, soft: 10, only: ['hero', 'xbow', 'slumped'] },
  { name: 'bounce', p: [470, 330, 14], c: L('#c8b48a'), I: 0.9, r0: 260, R: 900, soft: 2, only: ['hero', 'arcade', 'xbow', 'slumped', 'hedgeNW', 'hedgeNE', 'hedgeSW', 'hedgeSE', 'well', 'cypress', 'yew'] },
];
const SC = { W, H, cam, off, objects, lights, env, ambient: L(process.env.AMB || '#41516a').map(v => v * +(process.env.AMBK || 0.48)) };
export async function scene() { return SC; }

// palette: the validated one, plus a bleached holy-light ramp and a cold shade ramp
const ramp = (stops, n) => { const c = stops.map(hex), r = []; for (let i = 0; i < n; i++) { const t = i / (n - 1) * (c.length - 1), k = Math.min(c.length - 2, Math.floor(t)); r.push(mix(c[k], c[k + 1], t - k)); } return r; };
const PAL = [...PALETTE,
  ...ramp(['#b8a466', '#d8c886', '#ece0a8', '#f8f0cc', '#fffbe8'], 7).map(c => c.map(v => v * 255)),   // holy light, blown
  ...ramp(['#0e1218', '#18202a', '#233040', '#33425a', '#4c5c72'], 6).map(c => c.map(v => v * 255)),   // cold shade
];

export async function finish(img, sc) {
  const { out, sun } = img, N = W * H;
  haze(img, sc);
  // veil glare: light scattered by the dust, strongest over the open court, a little into the shade
  const blur = (src, r) => { const a = new Float32Array(N), b = new Float32Array(N);
    for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x < W + r; x++) { if (x + r < W) s += src[y * W + Math.min(W - 1, x + r)]; if (x - r - 1 >= 0) s -= src[y * W + x - r - 1]; if (x >= 0 && x < W) a[y * W + x] = s / (2 * r + 1); } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y < H + r; y++) { if (y + r < H) s += a[Math.min(H - 1, y + r) * W + x]; if (y - r - 1 >= 0) s -= a[(y - r - 1) * W + x]; if (y >= 0 && y < H) b[y * W + x] = s / (2 * r + 1); } }
    return b; };
  const lit = new Float32Array(N); for (let i = 0; i < N; i++) lit[i] = Math.max(0, out[i * 3] + out[i * 3 + 1] - 0.7);
  const g1 = blur(blur(lit, 3), 3), g2 = blur(blur(sun, 24), 24);
  const VEIL = +(process.env.VEIL || 0.03), GLOW = +(process.env.GLOW || 0.05);
  for (let i = 0; i < N; i++) { const k = g2[i] * VEIL * (0.2 + 0.8 * sun[i]) + g1[i] * GLOW * (0.4 + 0.6 * sun[i]); out[i * 3] += SUNC[0] * k; out[i * 3 + 1] += SUNC[1] * k; out[i * 3 + 2] += SUNC[2] * k * 0.8; }
  // light edge: a 1 px raw yellow fringe on the lit side of every floor shadow (the burn boundary, as in the game)
  { const edge = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (img.oid[i] >= 0 || sun[i] < 0.5) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (img.oid[j] < 0 && sun[j] < 0.3) { edge[i] = 1; break; } }
    for (let i = 0; i < N; i++) if (edge[i]) { out[i * 3] *= 1.2; out[i * 3 + 1] *= 0.95; out[i * 3 + 2] *= 0.35; } }
  // smoke curling off the burnt one: thin, lit by the Dawn
  { const [sx, sy] = project(cam, BURNT[0] - 4, BURNT[1] - 20, 6, off);
    for (let y = Math.max(0, sy - 90 | 0); y < sy; y++) for (let x = sx - 40 | 0; x < sx + 40; x++) {
      const h = (sy - y) / 90, cx = sx + Math.sin(h * 5 + 1) * 6 * h + h * 22, w = 2 + h * 10;
      const d = Math.abs(x - cx) / w; if (d > 1) continue;
      const k = clamp((1 - d) * (1 - h) * (fbm(x / 4, y / 5 + h * 3, 3, 90) - 0.3) * 1.2) * 0.6, i = y * W + x;
      out[i * 3] = out[i * 3] * (1 - k) + 0.09 * k; out[i * 3 + 1] = out[i * 3 + 1] * (1 - k) + 0.085 * k; out[i * 3 + 2] = out[i * 3 + 2] * (1 - k) + 0.075 * k;
    } }
  const rgba = post(img, { exposure: +(process.env.EXP || 3.0), vignette: 0.22, desat: 0.2, grain: 0.01, dither: 0.022, palette: PAL, noPal: !!process.env.NOPAL });
  const put = (x, y, hc, a = 1) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const c = hex(hc); const i = (y * W + x) * 4; rgba[i] = rgba[i] * (1 - a) + c[0] * 255 * a; rgba[i + 1] = rgba[i + 1] * (1 - a) + c[1] * 255 * a; rgba[i + 2] = rgba[i + 2] * (1 - a) + c[2] * 255 * a; };
  // dust: bright motes show where lit air hangs in front of the shade; faint gold specks over the glare
  { const R = mulberry32(5); for (let n = 0; n < 9000; n++) { const x = R() * W | 0, y = R() * H | 0, i = y * W + x, s = sun[i], near = g2[i];
      if (s < 0.5 && near > 0.12 && R() < near * 0.9) { put(x, y, '#f8f0cc', 0.45 + 0.4 * near); if (R() < 0.25) put(x, y - 1, '#ece0a8', 0.3); }
      else if (s > 0.5 && R() < 0.06) put(x, y, '#b8a466', 0.25); } }
  // crossbow aim telegraph
  { const a = project(cam, ...lw(objects.find(o => o.name === 'xbow'), xb.boltTip), off), b = project(cam, HERO[0], HERO[1], 60, off);
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 4; s < n - 8; s += 0.5) { const x = Math.round(a[0] + (b[0] - a[0]) * s / n), y = Math.round(a[1] + (b[1] - a[1]) * s / n); if ((s % 9) < 5) put(x, y, (s % 9) < 1.5 ? '#d01a12' : '#ff2a1a'); } }
  // HUD as in the crypt screen: blood vial bar + three hunger fangs (a soft dark backing so it reads over the tiles)
  for (let y = 16; y < 56; y++) for (let x = 18; x < 174; x++) { const e = Math.min(x - 18, 173 - x, y - 16, 55 - y); put(x, y, '#0c0a08', 0.55 * clamp(e / 6)); }
  for (let x = 24; x <= 166; x++) for (let y = 22; y <= 33; y++) {
    const edge = x === 24 || x === 166 || y === 22 || y === 33, fill = x < 112;
    put(x, y, edge ? '#3e362b' : fill ? (y === 23 ? '#951c18' : y < 29 ? '#5a0a10' : '#3e060b') : '#0c0a08');
  }
  for (let x = 25; x < 112; x += 9) put(x, 24, '#b42c1e');
  for (let k = 0; k < 3; k++) for (let y = 0; y < 9; y++) for (let x = 0; x < 6; x++) { const w = 3 - Math.floor(y / 3); if (Math.abs(x - 2.5) < w) put(26 + k * 10 + x, 40 + y, k < 2 ? (x < 3 ? '#cfc2a2' : '#8c7e64') : '#2b251d'); }
  writePNG('cloitre-native.png', rgba, W, H, 1);
  writePNG('cloitre.png', rgba, W, H, 2);
}
