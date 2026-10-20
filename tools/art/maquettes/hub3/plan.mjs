// « Le plan du refuge »: Lucian-style parchment map drawn straight from the world heightfield (true sizes), game palette.
import { writePNG, hex, clamp, vn, fbm, h2, mix, PALETTE } from './lib.mjs';
import { KIND, OWN, HT, NX, NY, R, G } from './world.mjs';
import { sign } from './props2.mjs';

const W = 960, H = 540;
const S = 0.205, OX = 40, OY = 22, WX0 = 120, WY0 = 40; // world -> plan px
const toW = (px, py) => [(px - OX) / S + WX0, (py - OY) / S + WY0];
const toP = (x, y) => [(x - WX0) * S + OX, (y - WY0) * S + OY];
const col = h => hex(h);
const PAPER = col('#b3a487'), PAPERL = col('#cfc2a2'), PAPERD = col('#8a7c63'), INK = col('#1e1812'), INKL = col('#544a3b'), RED = col('#781116'), REDL = col('#951c18');
const TINT = { [R.WARD]: col('#a89a8a'), [R.HALL]: col('#a08a6e'), [R.CRYPT]: col('#bdb092'), [R.LUC]: col('#8e9296'), [R.ARENA]: col('#a8845e'), [R.VES]: col('#9a9a78'), [R.SEV]: col('#9a8ea4'), [R.COR]: col('#b3a487'), [R.STAIR]: col('#8a7c63') };
const img = new Float32Array(W * H * 3);
const set = (x, y, c, a = 1) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; for (let k = 0; k < 3; k++) img[i + k] = img[i + k] * (1 - a) + c[k] * a; };

// floor mask at plan resolution (supersampled 2x2)
const FL = new Uint8Array(W * H), RM = new Uint8Array(W * H), PIT = new Uint8Array(W * H);
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  let n = 0, r = 0, pit = 0; for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const [x, y] = toW(px + dx, py + dy); const ix = x | 0, iy = y | 0; if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) continue; const i = iy * NX + ix; if (KIND[i] === 1 || KIND[i] === 3) { n++; r = OWN[i]; if (HT[i] < -1) pit++; } }
  const i = py * W + px; FL[i] = n >= 2 ? 1 : 0; RM[i] = r; PIT[i] = pit >= 2 ? 1 : 0;
}
const near = (px, py, rad) => { let d = 99; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; if (FL[y * W + x]) d = Math.min(d, Math.hypot(dx, dy)); } return d; };

// paper
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  let c = mix(PAPERL, PAPER, clamp(fbm(px / 60, py / 60, 4, 3) * 1.4 - 0.2));
  c = mix(c, PAPERD, clamp(fbm(px / 25, py / 25, 3, 7) - 0.55) * 1.6);
  const e = Math.min(px, py, W - 1 - px, H - 1 - py) + (vn(px / 9, py / 9, 5) - 0.5) * 10; // burnt, ragged edge
  if (e < 14) c = mix(c, col('#3e362b'), clamp(1 - e / 14) ** 1.5); if (e < 3) c = col('#0c0a08');
  const i = py * W + px;
  if (FL[i]) { c = mix(c, TINT[RM[i]] || PAPER, 0.55); if (PIT[i]) { c = mix(c, col('#6e624e'), 0.6); if (((px - py) & 3) === 0) c = mix(c, INKL, 0.5); } }
  else { const d = near(px, py, 8) + (vn(px / 4, py / 4, 9) - 0.5) * 2; if (d <= 1.5) c = INK; else if (d <= 8 && ((px + py) % 3 === 0)) c = mix(c, INK, 0.6 * clamp(1.4 - d / 8)); else if (d <= 5 && ((px - py + 999) % 4 === 0)) c = mix(c, INKL, 0.4); }
  set(px, py, c);
}
// stairs: treads
{ const [x0, y0] = toP(G.stair[0], G.stair[1]), [x1, y1] = toP(G.stair[2], G.stair[3]); for (let y = y0 + 2; y < y1; y += 3) for (let x = x0 + 1; x < x1 - 1; x++) set(x, y, INK, 0.7); }
// objects: hero's coffin (red), chiefs' coffins, niches, basin, stakes ring
const rect = (cx, cy, w, h, c, a = 1) => { const [x, y] = toP(cx, cy); for (let j = -h / 2; j < h / 2; j++) for (let i = -w / 2; i < w / 2; i++) set(x + i, y + j, c, a); };
const ring = (cx, cy, r, c, th = 0.7) => { const [x, y] = toP(cx, cy); const rr = r * S; for (let j = -rr - 2; j <= rr + 2; j++) for (let i = -rr - 2; i <= rr + 2; i++) if (Math.abs(Math.hypot(i, j) - rr) < th) set(x + i, y + j, c); };
rect(1800, 250, 24, 7, RED); rect(1800, 250, 22, 5, REDL);
for (const [x, y] of [[1530, 430], [1530, 640], [2070, 430], [2070, 640]]) { rect(x, y, 24, 8, INK); rect(x, y, 22, 6, PAPERD); }
for (const x of [1428, 1568, 2032, 2172]) rect(x, 174, 22, 6, INKL);
ring(1800, 1560, 46, INK, 0.8); ring(1800, 1560, 30, RED, 1.0); { const [x, y] = toP(1800, 1560); for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) if (Math.hypot(i, j) < 4.5) set(x + i, y + j, RED); }
for (let k = 0; k < 30; k++) { const a = k / 30 * Math.PI * 2; const [x, y] = toP(G.arena.c[0] + Math.cos(a) * 316, G.arena.c[1] + Math.sin(a) * 316); set(x, y, INK); set(x + 1, y, INK); }
rect(2610, 1342, 23, 4, INK, 0.8); rect(1220, 574, 18, 6, INK, 0.8);
// wardrobe: armoire, rail of coats, glass
rect(2410, 584, 16, 4, INK, 0.85); rect(2440, 690, 25, 2, INKL, 0.9); for (let k = 0; k < 5; k++) rect(2392 + k * 24, 694, 2, 4, [RED, INKL, INKL, INKL, INKL][k], 0.9); rect(2512, 606, 6, 2, INKL);
// training dummy: chalk ring + a cross
ring(1420, 2010, 62, INKL, 0.6); { const [x, y] = toP(1420, 2010); for (let k = -4; k <= 4; k++) { set(x + k, y + k, INK); set(x + k, y - k, INK); set(x + k + 1, y + k, INK); set(x + k + 1, y - k, INK); } }
// where each chief is spoken to: a small ring in the room
for (const [x, y] of [[2610, 1398], [2730, 1960], [985, 1530], [1220, 636]]) ring(x, y, 32, RED, 0.6);
// house doors: drawn walled up, the house seal on the wall, until the chief is freed
const seal = (kind, cx, cy, vertical) => { const [x, y] = toP(cx, cy); const hw = vertical ? 2 : 9, hh = vertical ? 9 : 2; for (let j = -hh; j <= hh; j++) for (let i = -hw; i <= hw; i++) set(x + i, y + j, INK);
  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) { const d = Math.hypot(i, j); if (d < 7.6) set(x + i, y + j, d > 6.4 ? INK : PAPERL); } for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (sign(kind, i / 5.5, -j / 5.5)) set(x + i, y + j, RED, 0.95); };
seal('rat', 2475, 1345, true); seal('brume', 2475, 1905, true); seal('loup', 1125, 1650, true); seal('chauve-souris', 1220, 1140, false);
// path of a night: dotted red line crypt -> basin -> stairs
{ const pts = [[1800, 280], [1800, 1520], [1800, 1600], [1800, 2380]]; for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [toP(...pts[k]), toP(...pts[k + 1])]; const n = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < n; t++) if ((t | 0) % 4 < 2) { const x = a[0] + (b[0] - a[0]) * t / n, y = a[1] + (b[1] - a[1]) * t / n; set(x, y, RED, 0.9); } } }
// arrow at the bottom of the stairs
{ const [x, y] = toP(1800, 2390); for (let j = 0; j < 7; j++) for (let i = -(6 - j); i <= 6 - j; i++) set(x + i, y + j - 4, RED); }
// house signs inside the rooms
const icon = (kind, cx, cy, r, c) => { const [x, y] = toP(cx, cy); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (sign(kind, i / r, -j / r)) set(x + i, y + j, c, 0.9); };
icon('rat', 2545, 1300, 8, RED); icon('brume', 2870, 1800, 13, RED); icon('loup', 650, 1650, 22, RED); icon('chauve-souris', 1220, 340, 10, RED);

// old blood dripped on the parchment, a wax drop
for (const [bx, by, br, sd] of [[880, 470, 16, 1], [905, 455, 6, 2], [120, 440, 10, 3], [470, 40, 8, 4]]) for (let j = -br * 2; j <= br * 2; j++) for (let i = -br * 2; i <= br * 2; i++) { const v = 1 - Math.hypot(i, j) / br + (fbm((bx + i) / 6, (by + j) / 6, 3, sd) - 0.5) * 1.2; if (v > 0) set(bx + i, by + j, v > 0.35 ? col('#3e060b') : RED, v > 0.1 ? 0.85 : 0.5); }
// ---------- pixel font ----------
const F = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 11110 10001 10001 10001 11110', C: '01111 10000 10000 10000 10000 10000 01111', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 11110 10000 10000 10000 11111', F: '11111 10000 11110 10000 10000 10000 10000', G: '01111 10000 10000 10011 10001 10001 01111', H: '10001 10001 11111 10001 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 11100 10010 10001 10001 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10010 10001 10001', S: '01111 10000 01110 00001 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 01010 01010 00100', W: '10001 10001 10001 10101 10101 11011 10001', X: '10001 01010 00100 00100 01010 10001 10001',
  Y: '10001 01010 00100 00100 00100 00100 00100', Z: '11111 00010 00100 01000 10000 10000 11111', '-': '00000 00000 00000 01110 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100',
  "'": '00100 00100 01000 00000 00000 00000 00000', ',': '00000 00000 00000 00000 00110 00100 01000', ':': '00000 01100 01100 00000 01100 01100 00000', ' ': '00000 00000 00000 00000 00000 00000 00000',
  '1': '00100 01100 00100 00100 00100 00100 01110', '2': '01110 10001 00001 00110 01000 10000 11111', '3': '11110 00001 00001 01110 00001 00001 11110', '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110', '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000', '0': '01110 10001 10011 10101 11001 10001 01110', '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
};
const ACC = { 'É': ['E', 1], 'È': ['E', -1], 'À': ['A', -1], 'Ù': ['U', -1], 'Ê': ['E', 0], 'Î': ['I', 0] };
function text(str, x, y, c, sc = 1, shadow = null) {
  for (const ch of str) {
    let g = F[ch], acc = null; if (!g && ACC[ch]) { g = F[ACC[ch][0]]; acc = ACC[ch][1]; } if (!g) { x += 4 * sc; continue; }
    const rows = g.split(' ');
    const dot = (i, j, cc) => { for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(x + i * sc + a, y + j * sc + b, cc); };
    rows.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') { if (shadow) dot(i + 1 / sc, j + 1 / sc, shadow); dot(i, j, c); } }));
    if (acc !== null) { if (acc === 1) { dot(2, -2, c); dot(3, -3, c); } else if (acc === -1) { dot(2, -2, c); dot(1, -3, c); } else { dot(1, -2, c); dot(2, -3, c); dot(3, -2, c); } }
    x += 6 * sc;
  }
  return x;
}
const marker = (n, cx, cy) => { const [x, y] = toP(cx, cy); for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) { const d = Math.hypot(i, j); if (d < 6.5) set(x + i, y + j, d > 5.3 ? INK : PAPERL); } text(String(n), x - 2, y - 3, RED); };
marker(1, 1560, 300); marker(2, 1560, 1450); marker(3, 2660, 1290); marker(4, 2620, 1760); marker(5, 400, 1350); marker(6, 1220, 160); marker(7, 2500, 830); marker(8, 1960, 2330); marker(9, 1300, 2120);
// title cartouche + compass
text('LE REFUGE', 40, 30, INK, 2); text('SOUS LA NÉCROPOLE', 40, 50, INKL);
{ const x = 610, y = 40; for (let j = 0; j < 16; j++) for (let i = -((16 - j) / 4 | 0); i <= ((16 - j) / 4 | 0); i++) set(x + i, y + j, j < 8 ? RED : INK); text('N', x - 2, y - 11, INK); }
// legend
const LX = 668; let ly = 108;
const item = (n, a, b) => { const x = LX, y = ly; for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) { const d = Math.hypot(i, j); if (d < 6) set(x + i + 6, y + j + 3, d > 4.8 ? INK : PAPERL); } text(String(n), x + 4, y, RED); text(a, x + 18, y, INK); if (b) text(b, x + 18, y + 11, INKL); ly += b ? 27 : 18; };
text('LÉGENDE', LX, 80, INK, 2);
item(1, 'CRYPTE AUX CERCUEILS', 'TON CERCUEIL, CEUX DES CHEFS');
item(2, 'GRANDE SALLE', 'BASSIN DES OFFRANDES');
item(3, 'ÉCHOPPE DE VESNA', "S'OUVRE APRÈS LES CATACOMBES");
item(4, 'SALON DE SÉVERIN', "APRÈS LA CRYPTE DE L'ORDRE");
item(5, 'ARÈNE DE MAGDA', 'APRÈS LE CLOÎTRE');
item(6, 'SALLE DES CARTES DE LUCIAN', 'APRÈS LE CLOCHER');
item(7, 'GARDE-ROBE', 'TES TENUES, AUX COULEURS LIBÉRÉES');
item(8, 'VERS LES FUITES', 'ESCALIER DES CATACOMBES');
item(9, "MANNEQUIN D'ENTRAÎNEMENT", 'ESSAIE TES COUPS');
ly += 6; { const x = LX; for (let t = 0; t < 14; t++) if (t % 4 < 2) set(x + t, ly + 3, RED); text('LE CHEMIN DE CHAQUE NUIT', x + 18, ly, INKL); }
ly += 16; rect(...toW(LX + 7, ly + 3), 14, 6, RED); text('LÀ OÙ TU TE REFORMES', LX + 18, ly, INKL);
ly += 16; { const [x, y] = [LX + 7, ly + 3]; for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) { const d = Math.hypot(i, j); if (d < 7.6) set(x + i, y + j, d > 6.4 ? INK : PAPERL); } for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (sign('rat', i / 5.5, -j / 5.5)) set(x + i, y + j, RED); }
text('PORTE MURÉE, AU SCEAU DE LA MAISON,', LX + 18, ly - 2, INKL); text("TANT QUE SON CHEF EST CAPTIF", LX + 18, ly + 9, INKL);
ly += 24; { const [x, y] = [LX + 7, ly + 3]; for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (Math.abs(Math.hypot(i, j) - 4.5) < 0.7) set(x + i, y + j, RED); } text('LÀ OÙ PARLER AU CHEF', LX + 18, ly, INKL);

// quantize to the game palette (ordered dither) and write
const pal = PALETTE; const out = new Uint8ClampedArray(W * H * 4); const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0, d = bay[(y & 3) * 4 + (x & 3)] * 0.035; const r = clamp(img[i * 3] + d) * 255, g = clamp(img[i * 3 + 1] + d) * 255, b = clamp(img[i * 3 + 2] + d) * 255;
  let best = 0, bd = 1e9; for (let p = 0; p < pal.length; p++) { const Q = pal[p]; const dr = r - Q[0], dg = g - Q[1], db = b - Q[2]; const dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2; const dd = dY * dY * 1.6 + dCo * dCo * 0.6 + dCg * dCg * 0.7; if (dd < bd) { bd = dd; best = p; } }
  out[i * 4] = pal[best][0]; out[i * 4 + 1] = pal[best][1]; out[i * 4 + 2] = pal[best][2]; out[i * 4 + 3] = 255; }
writePNG('plan-native.png', out, W, H, 1); writePNG('plan.png', out, W, H, 2);
