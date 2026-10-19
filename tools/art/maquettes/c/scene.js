// Take C "Clair-obscur peint": a tiny deferred software renderer (G-buffer, shadows, volumetrics, SSR) + painterly post.
// Screen: x = world x, y = d - h (d = floor depth in screen px, h = height). World 3D for lighting: (x, d*DY, h).
window.renderScene = async function () {
const W = 1920, H = 1080, N = W * H, WALL = 330, DY = 1.39;
const T0 = performance.now(); const log = s => console.log(s + ' ' + Math.round(performance.now() - T0) + 'ms');

// ---------- utils ----------
let seed = 1337; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function hash(a, b) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function gr(h, x, y) { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } }
function noise(x, y) { let X = Math.floor(x), Y = Math.floor(y); x -= X; y -= Y; X &= 255; Y &= 255; const u = fade(x), v = fade(y); const a = P[X] + Y, b = P[X + 1] + Y;
  const n00 = gr(P[a], x, y), n10 = gr(P[b], x - 1, y), n01 = gr(P[a + 1], x, y - 1), n11 = gr(P[b + 1], x - 1, y - 1);
  return (n00 + (n10 - n00) * u + (n01 - n00 + (n11 - n10 - n01 + n00) * u) * v) * 0.7; }
function fbm(x, y, o) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * noise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; } return s; }
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v; const mix = (a, b, t) => a + (b - a) * t;
function sm(a, b, v) { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); }

// ---------- G-buffer ----------
const zD = new Float32Array(N).fill(-1e9), pH = new Float32Array(N);
const nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
const aR = new Float32Array(N), aG = new Float32Array(N), aB = new Float32Array(N);
const KS = new Float32Array(N), SH = new Float32Array(N), WET = new Float32Array(N), AO = new Float32Array(N).fill(1);
const MAT = new Uint8Array(N); // 1 floor 2 wall 3 stone 4 iron 5 sprite 6 sky 7 water 8 brass 9 cloth
const OWN = new Int16Array(N).fill(-1);
const eR = new Float32Array(N), eG = new Float32Array(N), eB = new Float32Array(N);
function put(i, d, h, nx, ny, nz, r, g, b, m, ks, sh, own) {
  if (d <= zD[i]) return false;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  zD[i] = d; pH[i] = h; nX[i] = nx; nY[i] = ny; nZ[i] = nz; aR[i] = r; aG[i] = g; aB[i] = b; MAT[i] = m; KS[i] = ks; SH[i] = sh; OWN[i] = own; WET[i] = 0; AO[i] = 1;
  eR[i] = eG[i] = eB[i] = 0; return true;
}

// ---------- scene layout ----------
// occluders: circles on the floor plane (x, d, world radius, height)
const occ = [];
const pillars = [
  { x: 370, d: 455, r: 56 }, { x: 1530, d: 455, r: 56 },
  { x: 1715, d: 805, r: 64, broken: 175 },
  { x: -55, d: 1190, r: 84, crack: 1 }, { x: 1975, d: 1210, r: 84 },
];
pillars.forEach(p => { p.id = occ.length; occ.push({ x: p.x, Y: p.d * DY, r: p.r * 1.12, h: p.broken || 9999 }); });
const tombs = [
  { x0: 105, x1: 345, d0: 610, d1: 690, h: 62 },
  { x0: 1620, x1: 1860, d0: 372, d1: 448, h: 60 },
];
tombs.forEach(t => { t.id = occ.length; const n = 4; for (let k = 0; k < n; k++) { const cx = mix(t.x0 + 30, t.x1 - 30, k / (n - 1)); occ.push({ x: cx, Y: (t.d0 + t.d1) / 2 * DY, r: 46, h: t.h, grp: t.id }); } });
const chars = {
  hero: { x: 925, d: 852 }, g1: { x: 715, d: 650 }, g2: { x: 1300, d: 640 }, g3: { x: 690, d: 945 }, xb: { x: 1555, d: 650 },
};
for (const k in chars) { const c = chars[k]; c.id = occ.length; occ.push({ x: c.x, Y: c.d * DY, r: k === 'hero' || k === 'xb' ? 17 : 22, h: k === 'hero' || k === 'xb' ? 160 : 95 }); }
const brazier = { x: 1125, d: 735 }; brazier.id = occ.length; occ.push({ x: brazier.x, Y: brazier.d * DY, r: 14, h: 70 });
const sunC = { x: 905, d: 690, R: 178 };

// Moon beam through the broken window/vault: per unit of height toward the light, x -= MX, d -= MD
const MX = 0.36, MD = 1.2;
const MOON = (() => { const v = [-MX, -MD * DY, 1]; const l = Math.hypot(...v); return v.map(c => c / l); })();
function windowSdf(x, h) { // <0 inside the opening, in wall coords (x, height)
  let s;
  if (h < 250) s = Math.max(Math.abs(x - 640) - 120, 110 - h);
  else s = Math.max(Math.hypot(x - 650, h - 250) - 130, Math.hypot(x - 630, h - 250) - 130);
  // collapsed vault: a ragged hole up and right of the window
  const a = Math.atan2(h - 300, x - 770);
  const hole = Math.hypot((x - 770) * 0.9, h - 300) - 112 - 26 * noise(Math.cos(a) * 2 + 4, Math.sin(a) * 2 + 1) - 8 * noise(x * 0.06, h * 0.06);
  s = Math.min(s, hole);
  s = Math.min(s, Math.hypot((x - 1572) / 0.7, h - 575) - 70 - 10 * noise(x * 0.05, h * 0.05)); // crack in the vault, off-screen
  // tracery (left mullion whole, right one broken, half transom)
  s = Math.max(s, 7 + 2 * noise(h * 0.1, 1) - Math.abs(x - 600)); // mullion
  if (h < 205 + 10 * noise(x * 0.2, 3)) s = Math.max(s, 7 + 2 * noise(h * 0.1, 4) - Math.abs(x - 682));
  if (x < 650 + 8 * noise(h * 0.2, 9)) s = Math.max(s, 6 - Math.abs(h - 252));
  return s;
}
function inBeam(x, d, h) {
  if (d < WALL) return 0;
  const t = (d - WALL) / MD; const s = windowSdf(x - MX * t, h + t);
  const soft = 3 + t * 0.1;
  const xa = x - MX * t;
  return sat(0.5 - s / (2 * soft)) * (0.5 + 0.5 * sm(-0.35, 0.45, noise(xa * 0.045, 3.3) + 0.5 * noise(xa * 0.11, 8.1)));
}

// ---------- floor ----------
log('start');
{
  const fH = new Float32Array(N);
  const puddles = [[930, 925, 150, 44], [700, 735, 105, 30], [1240, 790, 95, 30], [455, 905, 110, 32], [1460, 975, 120, 30], [1060, 560, 60, 18], [1140, 885, 95, 26], [610, 1040, 80, 22], [1610, 760, 70, 20]];
  for (let sy = WALL; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    const i = sy * W + sx, x = sx, d = sy;
    const wx = x + 2.5 * noise(x * 0.035, d * 0.035) + 14 * noise(x * 0.003, d * 0.004 + 7), wd = d + 2.5 * noise(x * 0.035 + 9, d * 0.035 + 2) + 9 * noise(x * 0.0035 + 3, d * 0.003);
    const rowH = 82; const rr = Math.floor(wd / rowH), fy = wd / rowH - rr;
    const sw = 105 + hash(rr, 7) * 95, off = hash(rr, 13) * sw;
    const cc = Math.floor((wx + off) / sw), fx = (wx + off) / sw - cc;
    const ex = Math.min(fx, 1 - fx) * sw, ey = Math.min(fy, 1 - fy) * rowH / 0.72;
    const e = Math.min(ex, ey);
    const hs = hash(cc * 7 + 1, rr * 13 + 5), hs2 = hash(cc * 3 + 11, rr * 5 + 2);
    const fine = fbm(x * 0.06, d * 0.085, 3), stain = fbm(x * 0.0045 + 3, d * 0.0065, 4), mid = fbm(x * 0.018, d * 0.026, 3);
    const grout = (1 - sm(0.8, 2.6, e + 1.6 * mid)) * (0.55 + 0.45 * sat(0.5 + 2 * mid));
    let ht = -1.0 * grout + (hs - 0.5) * 1.0 + fine * 1.1 + 0.25 * sm(0, 10, e);
    // chipped corners / broken slabs
    const broken = hs2 < 0.09;
    if (broken) ht -= 1.2 * sm(0.0, 0.25, mid + 0.1);
    let v = 0.72 + 0.5 * hs; let r = 0.19, g = 0.195, b = 0.205;
    if (hs2 > 0.72) { r = 0.21; g = 0.19; b = 0.17; } else if (hs2 < 0.3) { r = 0.165; g = 0.18; b = 0.205; }
    const k = v * (0.78 + 0.6 * stain + 0.2 * fine + 0.14 * mid) * (0.85 + 0.3 * noise(x * 0.3, d * 0.4) * 0.5);
    r *= k; g *= k; b *= k;
    // cracks on some slabs
    if (hs < 0.3) { const an = hash(cc, rr + 77) * Math.PI, lx2 = (fx - 0.5) * sw, ly2 = (fy - 0.5) * rowH / 0.72; const dist = Math.abs(lx2 * Math.sin(an) - ly2 * Math.cos(an) + (hs2 - 0.5) * 40 + 5 * noise(x * 0.05, d * 0.07) + 2 * noise(x * 0.2, d * 0.2)); const c2 = sm(1.3, 0.2, dist) * sm(2, 9, e) * 0.85; r *= 1 - 0.75 * c2; g *= 1 - 0.75 * c2; b *= 1 - 0.75 * c2; ht -= c2 * 1.5; }
    // grout: dark + moss
    const moss = sat(0.5 + fbm(x * 0.01 + 40, d * 0.014, 3) * 1.6);
    r = mix(r, mix(0.05, 0.05, moss), grout * 0.7); g = mix(g, mix(0.055, 0.075, moss), grout * 0.7); b = mix(b, mix(0.055, 0.03, moss), grout * 0.7);
    // grime near the wall and darkness at the edges
    const nearWall = Math.exp(-(d - WALL) / 70);
    r *= 1 - 0.45 * nearWall; g *= 1 - 0.4 * nearWall; b *= 1 - 0.45 * nearWall;
    let m = 1, ks = 0.06 + 0.04 * hs, sh = 18;
    // Order's sun inlaid in brass
    const sdx = x - sunC.x, sdy = (d - sunC.d) / 0.72, sr = Math.hypot(sdx, sdy), sa = Math.atan2(sdy, sdx);
    if (sr < sunC.R + 4) {
      const ray = Math.abs(((sa / (Math.PI * 2) * 16 % 1) + 1) % 1 - 0.5) * 2; // 0 at ray centre
      const rayW = (1 - (sr - 62) / 100) * 0.9;
      const inRay = sr > 62 && sr < 162 && ray < rayW;
      const ring = (sr > 160 && sr < 174) || (sr > 112 && sr < 117) || (sr > 50 && sr < 62);
      const disc = sr < 50;
      if (inRay || ring || disc) {
        const tarn = sat(0.5 + fbm(x * 0.03, d * 0.04, 3) * 1.8);
        r = mix(0.2, 0.06, tarn); g = mix(0.14, 0.075, tarn); b = mix(0.06, 0.06, tarn);
        const kk = 0.6 + 0.5 * sat(0.5 + stain); r *= kk; g *= kk; b *= kk;
        m = 8; ks = 0.55 * (1 - tarn * 0.6); sh = 40; ht = 0.6 + fine * 0.4;
        if (disc) { // engraved face: eye-like rings
          const fr = sr % 14; if (fr < 2.2) { r *= 0.4; g *= 0.4; b *= 0.4; }
        }
      } else if (sr > 62 && sr < 174) { ht -= 0.2; }
    }
    // puddles and damp
    let pot = fbm(x * 0.0032 + 11, d * 0.0047 + 5, 4) * 0.55 - 0.18;
    for (const [px, pd, prx, pry] of puddles) { const q = ((x - px) / prx) ** 2 + ((d - pd) / pry) ** 2; pot += 0.75 * Math.exp(-q * 1.3); }
    pot += 0.07 * fine + 0.05 * mid;
    const water = sm(0.44, 0.5, pot) * (m === 8 ? 0.6 : 1), damp = sm(0.12, 0.42, pot);
    r *= 1 - 0.38 * damp; g *= 1 - 0.36 * damp; b *= 1 - 0.32 * damp;
    ks = mix(ks, 0.45, damp); sh = mix(sh, 70, damp);
    // blood: smears dragged toward the ghouls
    let bl = 0; for (const [bx, bd, brx, bry, ang] of [[1215, 705, 70, 9, -0.35], [1180, 735, 30, 10, 0.2], [770, 705, 40, 12, 0.5], [640, 980, 55, 8, 0.1], [1330, 690, 22, 9, 0]]) {
      const dx = x - bx, dy = (d - bd) / 0.72, u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      bl = Math.max(bl, sm(1.0, 0.6, (u / brx) ** 2 + (v / bry) ** 2 + 0.5 * fbm(x * 0.05, d * 0.06, 3) + 0.25 * noise(x * 0.2, d * 0.2))); }
    if (bl > 0) { bl *= 0.85; r = mix(r, 0.035, bl); g = mix(g, 0.003, bl); b = mix(b, 0.006, bl); ks = mix(ks, 0.5, bl); sh = mix(sh, 60, bl); }
    if (water > 0.5) { m = 7; ht = 0; }
    put(i, d, 0, 0, 0, 1, r, g, b, m, ks, sh, -1);
    WET[i] = water; fH[i] = ht;
  }
  // normals from height
  for (let sy = WALL + 1; sy < H - 1; sy++) for (let sx = 1; sx < W - 1; sx++) {
    const i = sy * W + sx; if (MAT[i] === 7) continue;
    const gx = (fH[i + 1] - fH[i - 1]) * 0.5, gy = (fH[i + W] - fH[i - W]) * 0.5 * 0.72;
    const l = Math.hypot(gx, gy, 1); nX[i] = -gx / l; nY[i] = -gy / l; nZ[i] = 1 / l;
  }
}
log('floor');

// ---------- back wall, window, gate, banners ----------
function gateSdf(x, h) { // pointed arch opening of the gate
  if (h < 170) return Math.max(Math.abs(x - 960) - 92, -h);
  return Math.max(Math.hypot(x - 1000, h - 170) - 132, Math.hypot(x - 920, h - 170) - 132);
}
function nicheSdf(x, h, cx) { if (h < 175) return Math.max(Math.abs(x - cx) - 46, 70 - h); return Math.max(Math.hypot(x - cx - 22, h - 175) - 68, Math.hypot(x - cx + 22, h - 175) - 68); }
const niches = [1290, 1420, 165];
const banners = [{ x0: 1112, x1: 1192, top: 300, bot: 92 }, { x0: 1708, x1: 1790, top: 315, bot: 120 }];
for (let sy = 0; sy < WALL; sy++) for (let sx = 0; sx < W; sx++) {
  const i = sy * W + sx, x = sx, h = WALL - sy;
  const ws = windowSdf(x, h);
  if (ws < 0) { // sky
    put(i, WALL - 900, h, 0, 1, 0, 0, 0, 0, 6, 0, 1, -1);
    const cl = fbm(x * 0.006 + 2, h * 0.012, 5), moonD = Math.hypot(x - 690, h - 330);
    const glow = 0.5 * Math.exp(-moonD / 70) + 0.25 * Math.exp(-moonD / 220);
    const cloud = sm(-0.1, 0.35, cl);
    const dk = 0.55; eR[i] = dk * (0.025 + 0.25 * glow + cloud * (0.03 + 0.5 * glow)); eG[i] = dk * (0.04 + 0.33 * glow + cloud * (0.045 + 0.6 * glow)); eB[i] = dk * (0.085 + 0.48 * glow + cloud * (0.08 + 0.7 * glow));
    if (moonD < 26) { const e = sm(26, 22, moonD) * 6; eR[i] += e * 0.8; eG[i] += e * 0.9; eB[i] += e; }
    continue;
  }
  const gs = gateSdf(x, h);
  if (gs < 0) { // recessed gate: bars in front of a dark corridor
    const bx = ((x - 960) % 26 + 26) % 26, by = h % 46;
    const bar = (bx < 6) || (by < 6 && h < 230);
    if (bar) { const l = (bx < 6 ? Math.sin(bx / 6 * Math.PI) : 1); put(i, WALL - 8, h, (bx - 3) / 4, 0.8, 0.1, 0.03 * l + 0.012, 0.03 * l + 0.012, 0.032 * l + 0.014, 4, 0.5, 30, -1); AO[i] = 0.8; }
    else { put(i, WALL - 160, h, 0, 1, 0, 0.05, 0.05, 0.055, 2, 0.05, 10, -1); AO[i] = 0.25; const f = 0.16 * sm(-20, 160, h) * (0.5 + fbm(x * 0.02, h * 0.03, 3)) * (1 - 0.6 * sm(60, 0, Math.abs(x - 960) - 30)); eR[i] = f * 0.5; eG[i] = f * 0.75; eB[i] = f * 1.2; }
    if (Math.abs(h - 18 - 8 * Math.sin(x * 0.7)) < 2 && !bar) { /* spikes nothing */ }
    continue;
  }
  // ashlar blocks
  const wx = x + 1.5 * noise(x * 0.05, h * 0.05), wh = h + 1.5 * noise(x * 0.05 + 3, h * 0.05);
  const rowH = 44, rr = Math.floor(wh / rowH), fy = wh / rowH - rr;
  const bw = 80 + hash(rr, 3) * 70, off = hash(rr, 9) * bw, cc = Math.floor((wx + off) / bw), fx = (wx + off) / bw - cc;
  const e = Math.min(Math.min(fx, 1 - fx) * bw, Math.min(fy, 1 - fy) * rowH);
  const hs = hash(cc + 101, rr * 7 + 3);
  const fine = fbm(x * 0.07, h * 0.07, 3), stain = fbm(x * 0.005, h * 0.01, 4);
  let k = (0.7 + 0.5 * hs) * (0.85 + 0.4 * stain + 0.15 * fine);
  let r = 0.17 * k, g = 0.17 * k, b = 0.18 * k;
  const mortar = 1 - sm(0.8, 2.6, e + fine * 1.5);
  r = mix(r, 0.04, mortar); g = mix(g, 0.045, mortar); b = mix(b, 0.045, mortar);
  // drips and damp at the foot
  const drip = sm(0.2, 0.6, noise(x * 0.09, h * 0.004 + 4) + 0.3 * fbm(x * 0.02, h * 0.02, 2));
  const damp = sat(sm(110, 0, h) + drip * 0.5);
  r *= 1 - 0.45 * damp; g *= 1 - 0.38 * damp; b *= 1 - 0.42 * damp;
  const moss = sm(70, 0, h + 30 * fbm(x * 0.02, 0, 3)) * sat(0.6 + fbm(x * 0.03, h * 0.05, 3) * 2);
  r = mix(r, 0.05, moss * 0.7); g = mix(g, 0.075, moss * 0.7); b = mix(b, 0.035, moss * 0.7);
  let d = WALL, nx = (-(fine) * 0.15) - (e < 3 ? 0 : 0), ny = 1, nz = (fy < 0.15 ? 0.4 : fy > 0.85 ? -0.4 : 0) * mortar;
  let m = 2, ao = 1, ks = 0.08 + 0.3 * damp, sh = 25;
  // gate frame: protruding voussoirs
  if (gs < 26) { d = WALL + 10; const v = Math.floor(Math.atan2(h - 140, x - 960) * 9); const vk = 0.85 + 0.3 * hash(v, 77); r = 0.2 * vk * (0.9 + 0.2 * fine); g = r; b = r * 1.05; if (gs > 22 || gs < 2) { r *= 0.5; g *= 0.5; b *= 0.5; } nz = 0.15; }
  // window jambs: wall thickness edge lit by the moon
  if (ws < 10) { const t = sat(1 - ws / 10); nx = 0; ny = 0.4; nz = 0.6; r = mix(r, 0.2, t); g = mix(g, 0.2, t); b = mix(b, 0.22, t); }
  // niches
  for (const cx of niches) { const ns = nicheSdf(x, h, cx); if (ns < 0) { d = WALL - 22; ao = 0.45 + 0.4 * sm(-30, 0, ns); r *= 0.8; g *= 0.8; b *= 0.8; } else if (ns < 7) { d = WALL + 6; nz = 0.3; r *= 1.05; } }
  // banners of the Order
  for (const bn of banners) {
    const cx = (bn.x0 + bn.x1) / 2, hw = (bn.x1 - bn.x0) / 2;
    const rag = bn.bot + 10 * Math.abs(noise(x * 0.15, 1)) + (Math.abs(x - cx) < hw * 0.4 ? -20 : 0) * 0;
    const tri = bn.bot - 28 + Math.abs(x - cx) * 0.8; // swallow-tail
    if (x > bn.x0 && x < bn.x1 && h < bn.top && h > Math.max(rag, tri) + 6 * noise(x * 0.3, 5)) {
      const fold = Math.sin((x - bn.x0) * 0.16 + noise(h * 0.01, x * 0.01));
      const torn = hash(Math.floor(x / 6), Math.floor(h / 9)) < 0.03;
      if (torn) continue;
      let br = 0.17, bg = 0.03, bb = 0.035; // faded crimson
      const sdx = x - cx, sdh = h - (bn.top - 70), srr = Math.hypot(sdx, sdh), saa = Math.atan2(sdh, sdx);
      const rays = Math.abs(((saa / (Math.PI * 2) * 12 % 1) + 1) % 1 - 0.5) * 2;
      if (srr < 14 || (Math.abs(srr - 18) < 2) || (srr > 20 && srr < 34 && rays < 0.45 * (1 - (srr - 20) / 14))) { br = 0.36; bg = 0.25; bb = 0.08; }
      if (h > bn.top - 10) { br = 0.05; bg = 0.04; bb = 0.035; } // pole wrap
      const dirt = 0.6 + 0.5 * sat(0.5 + fbm(x * 0.03, h * 0.02, 3));
      const sh2 = 0.65 + 0.35 * fold; br *= dirt * sh2; bg *= dirt * sh2; bb *= dirt * sh2;
      put(i, WALL + 12, h, fold * 0.35, 1, 0, br, bg, bb, 9, 0.05, 8, -1); AO[i] = 0.9; m = -1; break;
    }
  }
  if (m === -1) continue;
  put(i, d, h, nx, ny, nz, r, g, b, m, ks, sh, -1); AO[i] = ao * (0.55 + 0.45 * sm(0, 60, h));
}
log('wall');

// ---------- primitives ----------
function stoneTex(u, v, sd) { // painted stone value
  const f = fbm(u * 0.05 + sd, v * 0.05, 4), c = fbm(u * 0.012, v * 0.008 + sd, 3);
  return 0.8 + 0.35 * f + 0.25 * c;
}
function cylinder(cx, cd, r, h0, h1, own, opt) {
  for (let sx = Math.ceil(cx - r); sx <= Math.floor(cx + r); sx++) {
    if (sx < 0 || sx >= W) continue;
    const u = (sx - cx) / r, s = Math.sqrt(Math.max(0, 1 - u * u)), d = cd + r * s * 0.72;
    const arc = Math.asin(Math.max(-1, Math.min(1, u))) * r + cx * 3.1;
    const y0 = Math.max(0, Math.ceil(d - h1)), y1 = Math.min(H - 1, Math.floor(d - h0));
    for (let sy = y0; sy <= y1; sy++) {
      const h = d - sy, i = sy * W + sx;
      if (opt.top && h > opt.top(sx) ) continue;
      const k = stoneTex(arc, h, opt.sd || 0);
      const joint = h % opt.drum; const j = joint < 2.2 ? 0.45 : joint < 4 ? 1.12 : 1;
      let r0 = 0.165 * k * j, g0 = 0.165 * k * j, b0 = 0.175 * k * j;
      const damp = sm(140, 0, h + 40 * fbm(arc * 0.02, 1, 2));
      const moss = sm(60, 0, h + 30 * fbm(arc * 0.03, 7, 3)) * sat(0.5 + 2 * fbm(arc * 0.05, h * 0.05, 2));
      r0 *= 1 - 0.4 * damp; g0 *= 1 - 0.35 * damp; b0 *= 1 - 0.4 * damp;
      r0 = mix(r0, 0.05, moss * 0.6); g0 = mix(g0, 0.08, moss * 0.6); b0 = mix(b0, 0.035, moss * 0.6);
      if (opt.crack) { const cr = Math.abs(arc - cx * 3.1 - 8 - 22 * fbm(h * 0.012, 3, 4)); if (cr < 3.5 && h > 90 && h < 700) { const t = 1 - cr / 3.5; r0 *= 1 - 0.85 * t; g0 *= 1 - 0.85 * t; b0 *= 1 - 0.85 * t; } }
      const ny = s, nx = u;
      if (put(i, d, h, nx, ny, 0, r0, g0, b0, 3, 0.1 + 0.25 * damp, 22, own)) AO[i] = 0.5 + 0.5 * sm(0, 50, h);
    }
  }
}
function box(x0, x1, d0, d1, h0, h1, own, colf) {
  for (let sy = Math.max(0, Math.ceil(d0 - h1)); sy <= Math.min(H - 1, Math.floor(d1 - h1)); sy++) { const d = sy + h1; for (let x = Math.ceil(x0); x <= x1; x++) { if (x < 0 || x >= W) continue; const c = colf(x, d, h1, 0); const i = sy * W + x; put(i, d, h1, c[3] || 0, 0, 1, c[0], c[1], c[2], 3, 0.12, 25, own); } }
  for (let sy = Math.max(0, Math.ceil(d1 - h1)); sy <= Math.min(H - 1, Math.floor(d1 - h0)); sy++) { const h = d1 - sy; for (let x = Math.ceil(x0); x <= x1; x++) { if (x < 0 || x >= W) continue; const c = colf(x, d1, h, 1); const i = sy * W + x; if (put(i, d1, h, 0, 1, 0, c[0], c[1], c[2], 3, 0.1, 25, own)) AO[i] = 0.55 + 0.45 * sm(0, 25, h - h0); } }
}
function hfield(x0, x1, d0, d1, fn, colf, own, m = 3) {
  for (let d = d0; d <= d1; d += 0.5) for (let x = Math.floor(x0); x <= x1; x++) {
    const h = fn(x, d); if (h < 0) continue;
    const sy = Math.round(d - h); if (sy < 0 || sy >= H || x < 0 || x >= W) continue;
    const i = sy * W + x; if (d <= zD[i]) continue;
    const gx = (fn(x + 1, d) - fn(x - 1, d)) * 0.5, gy = (fn(x, d + 1) - fn(x, d - 1)) * 0.5 / DY;
    const l = Math.hypot(gx, gy, 1); const c = colf(x, d, h);
    put(i, d, h, -gx / l, -gy / l, 1 / l, c[0], c[1], c[2], m, 0.12, 25, own);
  }
}

// pillars
for (const p of pillars) {
  const opt = { drum: 64 + (p.x % 9), sd: p.x * 0.01, crack: p.crack };
  if (p.broken) { const B = p.broken; opt.top = sx => B + 28 * noise(sx * 0.05, 2) + 12 * noise(sx * 0.17, 5); }
  const R = p.r;
  // compound pier: core + colonnettes
  const parts = [[0, 0, R], [-R * 0.95, 0, R * 0.34], [R * 0.95, 0, R * 0.34], [-R * 0.62, R * 0.62, R * 0.3], [R * 0.62, R * 0.62, R * 0.3], [0, R * 0.92, R * 0.32]];
  for (const [ox, oy, rr] of parts) cylinder(p.x + ox, p.d + oy * 0.72, rr, 52, 3000, p.id, opt);
  // moulded base + plinth
  cylinder(p.x, p.d, R * 1.32, 34, 52, p.id, { drum: 1000, sd: 3 });
  box(p.x - R * 1.42, p.x + R * 1.42, p.d - R * 1.05, p.d + R * 1.05, 0, 34, p.id, (x, d, h, f) => { const k = stoneTex(x, d + h, 5); const c = 0.15 * k * (f ? 0.95 : 1.1); return [c, c * 1.02, c * 1.08]; });
  if (p.broken) { // rough broken top surface seen from above
    const B = p.broken;
    hfield(p.x - R * 1.3, p.x + R * 1.3, p.d - R, p.d + R, (x, d) => { const q = ((x - p.x) / (R * 1.25)) ** 2 + ((d - p.d) / (R * 0.72 * 1.25)) ** 2; if (q > 1) return -1; return B - 10 + 30 * noise(x * 0.05, 2) + 12 * noise(x * 0.17, 5) + 14 * fbm(x * 0.04, d * 0.05, 3) * (1 - q); },
      (x, d, h) => { const k = stoneTex(x, d, 9); return [0.2 * k, 0.2 * k, 0.21 * k]; }, p.id);
  }
}
log('pillars');

// tombs with effigies
for (const t of tombs) {
  box(t.x0, t.x1, t.d0, t.d1, 0, t.h - 10, t.id, (x, d, h, f) => { const k = stoneTex(x, d + h * 2, 11); let c = 0.16 * k; if (f && h > 14 && h < t.h - 22 && Math.abs(((x - t.x0) % 60) - 30) > 26) c *= 0.55; return [c, c, c * 1.06]; });
  box(t.x0 - 8, t.x1 + 8, t.d0 - 6, t.d1 + 6, t.h - 10, t.h, t.id, (x, d, h, f) => { const k = stoneTex(x * 1.3, d, 12); const c = 0.19 * k * (f ? 0.85 : 1); return [c, c, c * 1.05]; });
  const cx = (t.x0 + t.x1) / 2, cd = (t.d0 + t.d1) / 2;
  hfield(t.x0, t.x1, t.d0, t.d1, (x, d) => {
    const u = (x - cx) / ((t.x1 - t.x0) * 0.42), v = (d - cd) / ((t.d1 - t.d0) * 0.4);
    let e = 0;
    const body = 1 - u * u * 0.8 - v * v; if (body > 0) e = Math.max(e, 16 * Math.sqrt(body));
    const hd = 1 - ((u + 1.02) / 0.17) ** 2 - (v / 0.42) ** 2; if (hd > 0) e = Math.max(e, 20 * Math.sqrt(hd));
    const hands = 1 - ((u + 0.45) / 0.12) ** 2 - (v / 0.25) ** 2; if (hands > 0) e = Math.max(e, 20 + 6 * Math.sqrt(hands));
    const sword = Math.abs(v) < 0.06 && u > -0.5 && u < 0.85; if (sword) e = Math.max(e, 19);
    if (e <= 0) return -1; return t.h + e + 0.8 * noise(x * 0.3, d * 0.3);
  }, (x, d, h) => { const k = stoneTex(x * 2, d * 2, 13); const c = 0.21 * k; return [c, c, c * 1.04]; }, t.id);
}
// steps before the gate
box(820, 1100, WALL, WALL + 26, 0, 22, -1, (x, d, h) => { const k = stoneTex(x, d + h * 3, 21); const c = 0.17 * k; return [c, c, c * 1.05]; });
box(845, 1075, WALL - 2, WALL + 8, 22, 40, -1, (x, d, h) => { const k = stoneTex(x, d + h * 3, 22); const c = 0.17 * k; return [c, c, c * 1.05]; });
// rubble from the collapsed vault
const rocks = [];
{ seed = 77; for (let k = 0; k < 46; k++) { const a = rnd(), b = rnd(); const x = 560 + a * 330 + (b - 0.5) * 80, d = WALL + 18 + Math.pow(b, 1.6) * 200; const r = 6 + Math.pow(rnd(), 2.2) * 34 * (1 - b * 0.5); rocks.push([x, d, r]); }
  rocks.push([700, 470, 46], [770, 440, 38], [640, 420, 34], [1640, 900, 26], [1780, 880, 34], [1700, 940, 18], [1600, 860, 14], [320, 860, 16], [120, 700, 14]); }
for (const [rx, rd, rr] of rocks) {
  const sd = rx * 0.13 + rd;
  hfield(rx - rr * 1.3, rx + rr * 1.3, rd - rr, rd + rr, (x, d) => { const q = ((x - rx) / rr) ** 2 + ((d - rd) / (rr * 0.72)) ** 2; const n = 0.28 * noise(x * 0.09 + sd, d * 0.12) + 0.12 * noise(x * 0.3, d * 0.4 + sd); const qq = q * (1 - n); if (qq > 1) return -1; return rr * 0.75 * Math.pow(1 - qq, 0.6) * (1 + 0.3 * Math.floor((noise(x * 0.06 + sd, d * 0.06) + 1) * 2) / 2); },
    (x, d, h) => { const k = stoneTex(x * 1.5, d * 1.5, sd); return [0.17 * k, 0.17 * k, 0.18 * k]; }, -1);
}
log('props');

// ---------- sprites (painted on canvases, inserted in the G-buffer) ----------
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const lin = v => Math.pow(v, 1 / 2.2); // author albedo in linear, canvas stores gamma
const col = (r, g, b, a = 1) => `rgba(${Math.round(lin(r) * 255)},${Math.round(lin(g) * 255)},${Math.round(lin(b) * 255)},${a})`;
function texturize(ctx, w, h, amt, sc) { // painterly mottling, only where already painted
  const id = ctx.getImageData(0, 0, w, h), a = id.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!a[i + 3]) continue; const n = 1 + amt * (fbm(x * sc, y * sc, 3) + 0.4 * noise(x * 0.6, y * 0.6)); a[i] *= n; a[i + 1] *= n; a[i + 2] *= n; }
  ctx.putImageData(id, 0, 0);
}
function insertSprite(cv, em, ax, ay, bx, bd, own, halfW, opts = {}) {
  const w = cv.width, h = cv.height; const a = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const e = em ? em.getContext('2d').getImageData(0, 0, w, h).data : null;
  // blurred alpha for silhouette normals
  const al = new Float32Array(w * h); for (let k = 0; k < w * h; k++) al[k] = a[k * 4 + 3] / 255;
  const bl = new Float32Array(w * h); const R = 4;
  { const tmp = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -R; k <= R; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); s += al[y * w + xx]; } tmp[y * w + x] = s / (2 * R + 1); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -R; k <= R; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); s += tmp[yy * w + x]; } bl[y * w + x] = s / (2 * R + 1); } }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x; const ea = e ? e[k * 4 + 3] : 0;
    if (al[k] < 0.5 && ea < 10) continue;
    const sx = Math.round(bx + x - ax), sy = Math.round(bd - (opts.hb || 0) + y - ay); if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
    const i = sy * W + sx;
    if (al[k] >= 0.5) {
      const u = Math.max(-1, Math.min(1, (x - ax) / halfW)); const s = Math.sqrt(1 - u * u);
      let nx = u * 0.8, ny = 0.81 * s, nz = 0.58 * s + 0.15;
      const gx = bl[k + 1] - bl[k - 1], gy = bl[k + w] - bl[k - w]; const gl = Math.hypot(gx, gy);
      if (gl > 0.01) { const ex = -gx / gl, eu = gy / gl; const wgt = sat(gl * 4) * (1 - bl[k]) * 2.2; nx = mix(nx, ex, sat(wgt)); ny = mix(ny, -0.58 * eu, sat(wgt)); nz = mix(nz, 0.81 * eu, sat(wgt)); }
      const l = Math.hypot(nx, ny, nz) || 1;
      const d = bd + 4 * s + (opts.dz || 0), hh = d - sy;
      const r = Math.pow(a[k * 4] / 255, 2.2), g = Math.pow(a[k * 4 + 1] / 255, 2.2), b = Math.pow(a[k * 4 + 2] / 255, 2.2);
      if (!put(i, d, hh, nx / l, ny / l, nz / l, r, g, b, opts.mat || 5, opts.ks || 0.15, opts.sh || 20, own)) continue;
      AO[i] = 0.7 + 0.3 * sm(0, 40, hh);
    }
    if (ea >= 10 && (zD[i] <= bd + 8)) { const s = (opts.eI || 1) * ea / 255; eR[i] += Math.pow(e[k * 4] / 255, 2.2) * s; eG[i] += Math.pow(e[k * 4 + 1] / 255, 2.2) * s; eB[i] += Math.pow(e[k * 4 + 2] / 255, 2.2) * s; }
  }
}
function P2(ctx, pts, fill, close = true) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 6) ctx.bezierCurveTo(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], pts[k + 4], pts[k + 5]); if (close) ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function limb(ctx, pts, w0, w1, fill) { // tapered stroke through points
  ctx.fillStyle = fill; const n = pts.length / 2 - 1;
  for (let k = 0; k < n; k++) { const x0 = pts[k * 2], y0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], y1 = pts[k * 2 + 3]; for (let t = 0; t <= 1; t += 0.05) { const w = mix(w0, w1, (k + t) / n); ctx.beginPath(); ctx.arc(mix(x0, x1, t), mix(y0, y1, t), w / 2, 0, 7); ctx.fill(); } }
}
function stroke(ctx, pts, w, c) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }

// --- painting helpers for sprites (drawn at 2x, downsampled) ---
function catmull(pts, n, closed) {
  const Q = []; for (let i = 0; i < pts.length; i += 2) Q.push([pts[i], pts[i + 1]]);
  const L = Q.length, out = [], get = k => closed ? Q[(k + L) % L] : Q[Math.max(0, Math.min(L - 1, k))];
  const segs = closed ? L : L - 1;
  for (let i = 0; i < segs; i++) { const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3); out.push([f(0), f(1)]); } }
  if (!closed) out.push(Q[L - 1]); return out;
}
function blob(ctx, pts, fill) { const c = catmull(pts, 10, true); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const p of c) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function ribbon(ctx, pts, w0, w1, fill, jag = 0) {
  const c = catmull(pts, 10, false), Lp = [], Rp = [];
  for (let k = 0; k < c.length; k++) { const a = c[Math.max(0, k - 1)], b = c[Math.min(c.length - 1, k + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = k / (c.length - 1), w = mix(w0, w1, t) / 2 * (1 + jag * (hash(k, 3) - 0.5)); Lp.push([c[k][0] - ty * w, c[k][1] + tx * w]); Rp.push([c[k][0] + ty * w, c[k][1] - tx * w]); }
  ctx.beginPath(); ctx.moveTo(Lp[0][0], Lp[0][1]); for (const p of Lp) ctx.lineTo(p[0], p[1]); for (let k = Rp.length - 1; k >= 0; k--) ctx.lineTo(Rp[k][0], Rp[k][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function brush(ctx, n, x0, y0, x1, y1, cols, len, ang, w, angJ = 0.4) { // painted strokes, only over what is already painted
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) { const x = mix(x0, x1, rnd()), y = mix(y0, y1, rnd()), a = ang + (rnd() - 0.5) * angJ, l = len * (0.5 + rnd());
    ctx.strokeStyle = cols[(rnd() * cols.length) | 0]; ctx.lineWidth = w * (0.6 + rnd() * 0.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  ctx.restore();
}
function sprite(w, h, ax, ay, hw, draw) {
  const big = mk(w * 2, h * 2), bigE = mk(w * 2, h * 2), c = big.getContext('2d'), e = bigE.getContext('2d');
  c.scale(2, 2); e.scale(2, 2); draw(c, e);
  const cv = mk(w, h), em = mk(w, h); cv.getContext('2d').drawImage(big, 0, 0, w, h); em.getContext('2d').drawImage(bigE, 0, 0, w, h);
  return { cv, em, ax, ay, hw };
}

// --- hero: the Houseless, gaunt vampire, long dark coat, violet scarf ---
function drawHero() {
  seed = 4242;
  return sprite(270, 300, 124, 266, 40, (c, e) => {
    const coat = col(0.05, 0.048, 0.062), coatD = col(0.025, 0.024, 0.032), coatL = col(0.11, 0.1, 0.13);
    const vio = col(0.09, 0.03, 0.3), vioD = col(0.04, 0.014, 0.15), vioL = col(0.2, 0.09, 0.52);
    const skin = col(0.5, 0.47, 0.52), skinD = col(0.24, 0.21, 0.27), hair = col(0.015, 0.015, 0.022);
    // scarf tail trailing in the air
    ribbon(c, [140, 124, 160, 132, 182, 126, 204, 134, 226, 126, 246, 134], 13, 6, col(0.06, 0.02, 0.24), 0.25);
    ribbon(c, [138, 128, 158, 140, 178, 138, 198, 148, 216, 144, 234, 154], 9, 4, vioD, 0.3);
    brush(c, 30, 140, 112, 250, 156, [vioL, vioD], 10, 0.1, 1.4, 0.5);
    e.globalAlpha = 0.045; ribbon(e, [140, 124, 160, 132, 182, 126, 204, 134, 226, 126, 246, 134], 13, 6, 'rgb(110,50,255)'); blob(e, [104, 122, 112, 114, 126, 116, 140, 114, 146, 122, 142, 132, 126, 136, 108, 134], 'rgb(110,50,255)'); ribbon(e, [120, 132, 118, 150, 121, 168, 118, 182], 10, 9, 'rgb(110,50,255)'); e.globalAlpha = 1;
    // coat tail swept back
    blob(c, [146, 128, 166, 168, 186, 206, 204, 236, 214, 250, 196, 244, 184, 256, 166, 248, 150, 258, 136, 246, 130, 200, 134, 150], coatD);
    // legs and boots
    ribbon(c, [114, 190, 106, 222, 96, 256], 16, 12, col(0.03, 0.028, 0.035)); ribbon(c, [134, 190, 146, 224, 154, 255], 16, 12, col(0.03, 0.028, 0.035));
    blob(c, [84, 258, 92, 250, 104, 252, 108, 262, 98, 266, 86, 265], col(0.02, 0.018, 0.02)); blob(c, [148, 256, 154, 249, 165, 252, 168, 261, 158, 264, 148, 263], col(0.02, 0.018, 0.02));
    stroke(c, [92, 252, 102, 253], 1, col(0.2, 0.2, 0.24)); stroke(c, [153, 251, 163, 254], 1, col(0.2, 0.2, 0.24));
    // long coat, open in front
    blob(c, [102, 130, 96, 170, 90, 204, 80, 238, 92, 236, 100, 244, 110, 232, 114, 196, 118, 158, 118, 134], coat);
    blob(c, [140, 130, 148, 166, 156, 198, 170, 234, 158, 236, 150, 242, 140, 230, 132, 196, 128, 158, 126, 134], coat);
    blob(c, [113, 134, 111, 166, 113, 196, 122, 202, 131, 196, 133, 166, 131, 134], col(0.045, 0.03, 0.04)); // waistcoat
    stroke(c, [116, 186, 130, 186], 3, col(0.1, 0.08, 0.05)); c.fillStyle = col(0.35, 0.3, 0.2); c.fillRect(121, 184.5, 3, 3);
    brush(c, 60, 82, 140, 172, 244, [coatL, coatD, col(0.08, 0.075, 0.1)], 22, Math.PI / 2, 1.6, 0.25);
    // shoulder capelet with scalloped hem
    blob(c, [100, 126, 122, 120, 146, 126, 156, 146, 152, 158, 144, 152, 136, 160, 126, 154, 116, 160, 106, 152, 96, 158, 94, 144], coat);
    brush(c, 25, 94, 124, 156, 160, [coatL, coatD], 12, Math.PI / 2, 1.3, 0.6);
    // arms: left reaching with claws, right holding a rapier low
    ribbon(c, [104, 134, 90, 152, 80, 166, 72, 174], 15, 10, coat);
    c.fillStyle = coatL; c.beginPath(); c.ellipse(74, 172, 5, 4, 0.6, 0, 7); c.fill();
    blob(c, [64, 176, 70, 170, 76, 174, 74, 182, 66, 184], skin);
    for (const [dx, dy] of [[-12, 4], [-11, 9], [-7, 14], [-2, 15]]) { const sx = 66 + dx * 0.3, sy = 180 + dy * 0.2; stroke(c, [sx, sy, 66 + dx * 0.7, 180 + dy * 0.7, 66 + dx, 180 + dy], 1.3, skin); }
    ribbon(c, [146, 134, 156, 160, 160, 186, 161, 192], 15, 10, coatD);
    blob(c, [156, 192, 163, 188, 168, 194, 164, 202, 157, 199], skin);
    stroke(c, [156, 199, 162, 194, 170, 199, 165, 205], 1.5, col(0.4, 0.33, 0.15)); // swept hilt
    stroke(c, [164, 201, 216, 264], 2.4, col(0.35, 0.37, 0.42)); stroke(c, [165, 200, 215, 262], 0.8, col(0.85, 0.88, 0.95));
    // stand-up collar behind the head
    blob(c, [104, 126, 98, 108, 100, 92, 110, 100, 120, 112, 132, 112, 142, 100, 152, 92, 152, 108, 146, 126, 124, 122], coatD);
    stroke(c, [100, 94, 104, 112], 1.2, coatL); stroke(c, [151, 94, 148, 112], 1.2, coatL);
    // scarf wrap and hanging end with fringe
    blob(c, [104, 122, 112, 114, 126, 116, 140, 114, 146, 122, 142, 132, 126, 136, 108, 134], vio);
    ribbon(c, [120, 132, 118, 150, 121, 168, 118, 182], 10, 9, vio, 0.2);
    for (let k = 0; k < 5; k++) stroke(c, [114 + k * 2, 182, 114 + k * 2 + (k - 2) * 0.5, 188], 0.9, vio);
    brush(c, 30, 104, 112, 146, 184, [vioL, vioD, vio], 7, 0.3, 1.2, 1.4);
    // gaunt face
    blob(c, [111, 104, 112, 92, 120, 86, 129, 89, 133, 98, 131, 110, 125, 118, 118, 120, 113, 114], skin);
    blob(c, [112, 106, 116, 112, 120, 116, 117, 116, 113, 112], skinD); blob(c, [128, 106, 130, 110, 126, 115, 125, 111], skinD);
    stroke(c, [119, 116, 123, 116], 0.8, col(0.15, 0.05, 0.08)); // thin mouth
    // hair swept back by the motion
    blob(c, [110, 100, 109, 88, 116, 81, 127, 80, 136, 83, 142, 88, 138, 94, 134, 97, 129, 90, 121, 89, 114, 94], hair);
    for (const [a, b, cc, d] of [[136, 84, 150, 82], [139, 89, 152, 90], [136, 94, 147, 97]]) stroke(c, [a, b, (a + cc) / 2, (b + d) / 2 - 1.5, cc, d], 1, hair);
    brush(c, 12, 106, 76, 160, 96, [col(0.08, 0.08, 0.12)], 10, 0, 0.8, 0.4);
    c.fillStyle = col(0.04, 0.02, 0.04); c.beginPath(); c.ellipse(116, 99, 3.8, 2, 0.15, 0, 7); c.ellipse(126.5, 99.5, 3.4, 1.9, -0.1, 0, 7); c.fill();
    e.fillStyle = 'rgb(255,40,36)'; e.beginPath(); e.ellipse(116.5, 99.2, 1.8, 0.9, 0.15, 0, 7); e.fill(); e.beginPath(); e.ellipse(126.8, 99.6, 1.6, 0.85, -0.1, 0, 7); e.fill();
    stroke(e, [178, 220, 214, 262], 0.8, 'rgba(170,200,255,0.45)');
    e.globalCompositeOperation = 'destination-over'; e.globalAlpha = 0.035; blob(e, [112, 104, 113, 93, 120, 88, 128, 90, 132, 99, 130, 110, 124, 117, 118, 119, 113, 113], 'rgb(150,160,210)'); blob(e, [64, 176, 70, 170, 76, 174, 74, 182, 66, 184], 'rgb(150,160,210)'); e.globalAlpha = 1; e.globalCompositeOperation = 'source-over';
  });
}
// --- ghoul: emaciated hunched biped, long arms, pale eyes (faces right) ---
function drawGhoul() {
  seed = 99;
  return sprite(240, 196, 104, 176, 55, (c, e) => {
    const sk = col(0.2, 0.215, 0.2), skD = col(0.075, 0.08, 0.08), skL = col(0.34, 0.35, 0.32), bruise = col(0.12, 0.08, 0.11), rag = col(0.055, 0.045, 0.04), ragL = col(0.1, 0.085, 0.07);
    // far limbs
    ribbon(c, [84, 112, 70, 140, 76, 172], 13, 7, skD); blob(c, [68, 172, 76, 168, 88, 172, 84, 176, 70, 177], skD);
    ribbon(c, [118, 76, 122, 112, 132, 146, 140, 164], 10, 6, skD);
    for (const dx of [-3, 2, 7]) stroke(c, [140, 164, 146 + dx, 174], 1.4, skD);
    // torso, hunched: back arched high
    blob(c, [76, 114, 78, 92, 88, 72, 104, 60, 124, 58, 140, 66, 144, 80, 134, 96, 120, 106, 100, 116, 84, 120], sk);
    blob(c, [92, 116, 108, 108, 126, 100, 140, 82, 142, 92, 128, 106, 108, 118], skD); // belly shadow
    for (let k = 0; k < 5; k++) stroke(c, [108 + k * 7, 72 + k * 1.5, 112 + k * 7, 86 + k * 2, 108 + k * 6.5, 100 + k * 1.2], 1.3, skD);
    for (let k = 0; k < 8; k++) { const t = k / 7; const x = mix(80, 132, t), y = 92 - Math.sin(t * Math.PI * 0.85 + 0.25) * 32; c.fillStyle = skL; c.beginPath(); c.ellipse(x, y, 2.6, 2, 0, 0, 7); c.fill(); }
    brush(c, 40, 76, 58, 146, 120, [skL, skD, bruise, sk], 6, 0.6, 1.4, 2.5);
    // torn shroud over the shoulders, loincloth
    blob(c, [100, 62, 120, 58, 128, 66, 122, 82, 118, 96, 112, 90, 108, 100, 104, 88, 96, 92, 98, 76], rag);
    blob(c, [76, 108, 98, 112, 102, 126, 100, 140, 96, 132, 92, 144, 88, 134, 82, 142, 80, 128], rag);
    brush(c, 20, 76, 58, 130, 146, [ragL, col(0.03, 0.025, 0.02)], 9, Math.PI / 2, 1, 0.5);
    // near leg (digitigrade, bent)
    ribbon(c, [92, 114, 114, 136, 104, 158, 108, 172], 15, 7, sk);
    blob(c, [100, 172, 108, 167, 122, 170, 126, 176, 110, 178, 100, 178], skD);
    // neck and skull thrust forward
    ribbon(c, [134, 70, 146, 76, 154, 82], 12, 10, sk);
    blob(c, [146, 72, 156, 64, 172, 64, 182, 72, 184, 82, 176, 90, 164, 92, 152, 88], sk);
    blob(c, [160, 88, 172, 90, 184, 86, 188, 92, 178, 104, 166, 104, 158, 96], skD); // hanging jaw
    for (let k = 0; k < 5; k++) stroke(c, [166 + k * 4, 91, 167 + k * 4, 95], 1.1, col(0.55, 0.52, 0.42));
    stroke(c, [150, 70, 162, 64, 176, 66], 1.4, skL);
    c.fillStyle = col(0.02, 0.02, 0.02); c.beginPath(); c.ellipse(168, 76, 4.5, 3.4, 0, 0, 7); c.ellipse(178.5, 77, 3.6, 3, 0, 0, 7); c.fill();
    e.fillStyle = 'rgb(205,255,228)'; e.beginPath(); e.arc(168.5, 76.5, 2.1, 0, 7); e.fill(); e.beginPath(); e.arc(178.8, 77.3, 1.7, 0, 7); e.fill();
    // near arm reaching forward, long fingers
    ribbon(c, [134, 74, 146, 102, 162, 128, 180, 146], 12, 7, sk);
    c.fillStyle = skL; c.beginPath(); c.ellipse(146, 102, 3.6, 3, 0, 0, 7); c.fill();
    for (const [dx, dy] of [[16, 6], [18, 12], [13, 17], [6, 19]]) stroke(c, [180, 146, 180 + dx * 0.6, 146 + dy * 0.5, 180 + dx, 146 + dy], 1.5, col(0.25, 0.24, 0.2));
    stroke(c, [130, 70, 144, 84, 150, 100], 1.6, skL);
  });
}
function flip(s) { const o = mk(s.cv.width, s.cv.height), oe = mk(s.cv.width, s.cv.height); for (const [src, dst] of [[s.cv, o], [s.em, oe]]) { const x = dst.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); } return { cv: o, em: oe, ax: s.cv.width - s.ax, ay: s.ay, hw: s.hw }; }
// --- Order crossbowman (faces left), kettle hat, sun tabard, lantern ---
function drawXbow() {
  seed = 515;
  return sprite(260, 300, 126, 266, 40, (c, e) => {
    const steel = col(0.22, 0.23, 0.25), steelL = col(0.5, 0.52, 0.56), steelD = col(0.08, 0.085, 0.095);
    const tab = col(0.36, 0.33, 0.26), tabD = col(0.19, 0.17, 0.13), tabL = col(0.5, 0.47, 0.38), gold = col(0.6, 0.4, 0.08), wood = col(0.14, 0.07, 0.035);
    // cape
    blob(c, [130, 120, 156, 132, 166, 180, 176, 240, 162, 236, 152, 250, 140, 240, 124, 248, 118, 196, 120, 146], col(0.11, 0.025, 0.02));
    brush(c, 25, 118, 120, 178, 250, [col(0.18, 0.04, 0.03), col(0.05, 0.01, 0.01)], 20, Math.PI / 2, 1.4, 0.3);
    // legs
    ribbon(c, [118, 198, 108, 230, 100, 258], 17, 13, col(0.07, 0.05, 0.04)); ribbon(c, [138, 198, 146, 230, 150, 258], 17, 13, col(0.055, 0.04, 0.03));
    blob(c, [88, 262, 92, 253, 106, 254, 110, 263, 100, 268, 89, 267], col(0.035, 0.025, 0.02)); blob(c, [143, 258, 148, 251, 161, 254, 162, 262, 153, 266, 144, 264], col(0.035, 0.025, 0.02));
    // mail skirt and sleeves
    blob(c, [104, 180, 102, 206, 104, 220, 124, 226, 146, 222, 152, 206, 150, 180], steel);
    for (let y = 182; y < 224; y += 3) for (let x = 102; x < 154; x += 3) { c.fillStyle = (x + y) % 2 ? steelD : steelL; c.globalAlpha = 0.35; c.fillRect(x + (y % 6 ? 1.5 : 0), y, 1.2, 1.2); }
    c.globalAlpha = 1;
    // tabard with folds
    blob(c, [104, 128, 100, 160, 102, 200, 106, 234, 116, 228, 124, 236, 132, 228, 142, 234, 148, 226, 152, 200, 152, 160, 146, 128], tab);
    brush(c, 50, 100, 128, 152, 236, [tabL, tabD, col(0.28, 0.25, 0.19)], 20, Math.PI / 2, 1.5, 0.3);
    // dirt and blood at the hem
    brush(c, 18, 100, 214, 152, 236, [col(0.12, 0.1, 0.07), col(0.18, 0.04, 0.03)], 6, 0, 2, 3);
    stroke(c, [102, 186, 152, 186], 4.5, col(0.08, 0.05, 0.03)); c.fillStyle = col(0.45, 0.32, 0.1); c.fillRect(122, 184, 6, 5);
    // golden sun on the chest
    c.save(); c.translate(126, 158); c.fillStyle = gold; for (let k = 0; k < 12; k++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(-3.2, 9); c.lineTo(0, k % 2 ? 17 : 21); c.lineTo(3.2, 9); c.fill(); } c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill();
    c.fillStyle = col(0.3, 0.18, 0.04); c.beginPath(); c.arc(0, 0, 5.5, 0, 7); c.fill(); c.fillStyle = gold; c.beginPath(); c.arc(0, 0, 3.6, 0, 7); c.fill(); c.restore();
    // pauldrons and arms
    blob(c, [98, 128, 100, 116, 114, 112, 122, 120, 118, 134, 104, 138], steel); stroke(c, [100, 120, 112, 114, 120, 120], 1.4, steelL);
    blob(c, [132, 120, 140, 110, 154, 114, 158, 128, 150, 138, 138, 134], steel); stroke(c, [136, 114, 148, 112, 156, 120], 1.4, steelL);
    ribbon(c, [146, 130, 136, 148, 118, 154], 13, 11, steel); ribbon(c, [104, 132, 90, 146, 76, 152], 13, 11, steel);
    // crossbow aimed left
    stroke(c, [142, 150, 48, 150], 6.5, wood); stroke(c, [140, 147.5, 52, 147.5], 1.2, col(0.3, 0.17, 0.08));
    blob(c, [57, 128, 51, 140, 51, 160, 57, 172, 61, 170, 55, 158, 55, 142, 61, 130], steelD); stroke(c, [57, 130, 52, 150, 57, 170], 1, steelL);
    stroke(c, [58, 131, 96, 149, 58, 169], 0.9, col(0.4, 0.38, 0.33));
    stroke(c, [96, 147, 38, 147], 1.8, col(0.25, 0.2, 0.15)); poly(c, [39, 143.5, 28, 147, 39, 150.5], steelL);
    c.fillStyle = col(0.09, 0.06, 0.035); c.beginPath(); c.arc(76, 153, 5.5, 0, 7); c.fill(); c.beginPath(); c.arc(117, 154, 5.5, 0, 7); c.fill();
    // face under a kettle hat
    blob(c, [108, 116, 106, 104, 114, 98, 124, 100, 130, 108, 130, 118, 122, 126, 112, 124], col(0.33, 0.21, 0.15));
    blob(c, [104, 114, 100, 120, 108, 128, 120, 126, 126, 118, 116, 116], col(0.13, 0.09, 0.07)); // beard
    c.fillStyle = steel; c.beginPath(); c.ellipse(120, 100, 31, 10, -0.06, 0, 7); c.fill();
    c.fillStyle = steelL; c.beginPath(); c.ellipse(120, 98.5, 30, 8.5, -0.06, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = steel; c.beginPath(); c.arc(122, 93, 15, Math.PI, 0); c.fill(); c.fillRect(107, 92, 30, 6);
    stroke(c, [111, 86, 121, 79, 133, 86], 1.8, steelL); stroke(c, [122, 79, 122, 98], 1.4, steelD);
    c.fillStyle = col(0.02, 0.015, 0.015); c.fillRect(104, 104, 22, 3.5);
    // lantern at the belt
    stroke(c, [104, 186, 99, 196], 1.4, col(0.05, 0.04, 0.03)); c.fillStyle = col(0.06, 0.05, 0.04); c.fillRect(92, 196, 14, 18); c.fillRect(90, 194, 18, 3); c.fillRect(90, 213, 18, 3);
    e.fillStyle = 'rgba(255,200,120,1)'; e.fillRect(94, 198, 10, 14); e.fillStyle = 'rgba(255,250,220,1)'; e.fillRect(97, 202, 4, 7);
    poly(e, [30, 145, 22, 147, 30, 149], 'rgba(255,240,220,0.6)');
  });
}
function drawBrazier() {
  const cv = mk(140, 240), em = mk(140, 240), c = cv.getContext('2d'), e = em.getContext('2d');
  const iron = col(0.05, 0.05, 0.055);
  for (const [fx, fy] of [[36, 230], [104, 230], [72, 236]]) limb(c, [70, 160, (70 + fx) / 2, 196, fx, fy], 6, 4, iron);
  c.fillStyle = iron; c.beginPath(); c.ellipse(70, 140, 40, 13, 0, 0, Math.PI); c.lineTo(70, 168); c.fill();
  P2(c, [30, 140, 34, 158, 54, 168, 70, 170, 86, 168, 106, 158, 110, 140], iron);
  c.fillStyle = col(0.09, 0.08, 0.08); c.beginPath(); c.ellipse(70, 140, 40, 13, 0, 0, 7); c.fill();
  c.fillStyle = col(0.03, 0.02, 0.02); c.beginPath(); c.ellipse(70, 140, 34, 10, 0, 0, 7); c.fill();
  // coals
  for (let k = 0; k < 60; k++) { const a = rnd() * 7, r = Math.sqrt(rnd()); const x = 70 + Math.cos(a) * r * 32, y = 140 + Math.sin(a) * r * 9; e.fillStyle = `rgba(255,${80 + rnd() * 120 | 0},20,${0.5 + rnd() * 0.5})`; e.beginPath(); e.arc(x, y, 2 + rnd() * 3, 0, 7); e.fill(); }
  return { cv, em, ax: 70, ay: 232, hw: 40 };
}
function drawCandles(n, sd) {
  const cv = mk(90, 90), em = mk(90, 90), c = cv.getContext('2d'), e = em.getContext('2d'); seed = sd;
  c.fillStyle = col(0.35, 0.31, 0.24); c.beginPath(); c.ellipse(45, 80, 30, 7, 0, 0, 7); c.fill();
  const list = []; for (let k = 0; k < n; k++) list.push([20 + rnd() * 50, 74 + rnd() * 10, 8 + rnd() * 34, 3 + rnd() * 2.5]);
  list.sort((a, b) => a[1] - b[1]);
  const flames = [];
  for (const [x, y, hh, r] of list) {
    const g = c.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, col(0.3, 0.26, 0.2)); g.addColorStop(0.5, col(0.55, 0.5, 0.4)); g.addColorStop(1, col(0.25, 0.21, 0.16));
    c.fillStyle = g; c.fillRect(x - r, y - hh, r * 2, hh); c.beginPath(); c.ellipse(x, y - hh, r, r * 0.4, 0, 0, 7); c.fill();
    c.fillStyle = col(0.5, 0.45, 0.36); c.fillRect(x - r * 0.6, y - hh, 1.5, hh * 0.5);
    flames.push([x, y - hh]);
  }
  for (const [x, y] of flames) { const g = e.createRadialGradient(x, y - 5, 0, x, y - 5, 6); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.4, 'rgba(255,190,90,0.9)'); g.addColorStop(1, 'rgba(255,90,20,0)'); e.fillStyle = g; e.beginPath(); e.ellipse(x, y - 5, 3, 7, 0, 0, 7); e.fill(); }
  return { cv, em, ax: 45, ay: 80, hw: 30, flames };
}
const hero = drawHero(), gh = drawGhoul(), ghF = flip(gh), xb = drawXbow(), br = drawBrazier();
insertSprite(hero.cv, hero.em, hero.ax, hero.ay, chars.hero.x, chars.hero.d, chars.hero.id, hero.hw, { eI: 5 });
insertSprite(gh.cv, gh.em, gh.ax, gh.ay, chars.g1.x, chars.g1.d, chars.g1.id, gh.hw, { eI: 4 });
insertSprite(ghF.cv, ghF.em, ghF.ax, ghF.ay, chars.g2.x, chars.g2.d, chars.g2.id, gh.hw, { eI: 4 });
insertSprite(gh.cv, gh.em, gh.ax, gh.ay, chars.g3.x, chars.g3.d, chars.g3.id, gh.hw, { eI: 4 });
insertSprite(xb.cv, xb.em, xb.ax, xb.ay, chars.xb.x, chars.xb.d, chars.xb.id, xb.hw, { eI: 3 });
insertSprite(br.cv, br.em, br.ax, br.ay, brazier.x, brazier.d, brazier.id, br.hw, { eI: 8, mat: 4, ks: 0.4 });
{ // ivy and roots hanging from the collapse
  const iv = mk(520, 300), c = iv.getContext('2d'); seed = 31;
  for (let k = 0; k < 26; k++) {
    let x = 470 + rnd() * 450, y = 0; const len = 40 + rnd() * rnd() * 230; if (windowSdf(x, WALL - 5) > 30 && rnd() < 0.6) continue;
    const pts = [x - 470, y]; for (let t = 0; t < len; t += 12) { x += (rnd() - 0.5) * 7; pts.push(x - 470, t); }
    stroke(c, pts, 1 + rnd() * 1.6, col(0.025, 0.035, 0.02));
    for (let j = 2; j < pts.length; j += 2) if (rnd() < 0.8) { c.fillStyle = rnd() < 0.5 ? col(0.03, 0.05, 0.025) : col(0.055, 0.08, 0.035); c.beginPath(); c.ellipse(pts[j] + (rnd() - 0.5) * 8, pts[j + 1], 3 + rnd() * 3, 2 + rnd() * 2, rnd() * 3, 0, 7); c.fill(); }
  }
  insertSprite(iv, null, 0, 0, 470, WALL, -1, 1e4, { hb: WALL, dz: 3, mat: 3, ks: 0.05 });
}
const candleSets = [[838, WALL + 8, 22, 5], [1082, WALL + 8, 22, 4], [150, 650, 62, 5], [1290, WALL - 22, 72, 3], [560, 1015, 0, 7], [440, 512, 34, 4], [1468, 514, 34, 4], [1625, 880, 0, 5]];
const lights = [];
candleSets.forEach(([x, d, hb, n], k) => {
  const s = drawCandles(n, 100 + k);
  insertSprite(s.cv, s.em, s.ax, s.ay, x, d + 0.5, -1, 30, { eI: 6, hb, mat: 5, ks: 0.3 });
  // candle sprites on raised surfaces: shift up by hb (their base drawn at sy = d - hb)
  const onPlinth = hb === 34;
  lights.push({ x, d: d + (onPlinth ? 16 : 6), h: hb + 34, c: [1.0, 0.62, 0.3], I: (onPlinth ? 6500 : 3000) * Math.min(n, 5) / 4, size: 6, rad: onPlinth ? 520 : 300 });
});
lights.push({ x: chars.xb.x - 26, d: chars.xb.d + 12, h: 56, c: [1.0, 0.78, 0.5], I: 1600, size: 4, rad: 380 });
lights.push({ x: brazier.x, d: brazier.d, h: 130, c: [1.0, 0.5, 0.2], I: 3.6e4, size: 22, rad: 2400, main: 1 });
lights.push({ x: 760, d: 640, h: 70, c: [0.35, 0.45, 0.62], I: 2.2e4, size: 300, rad: 800, bounce: 1 }); // moonlight bounce
log('sprites');

// ---------- floor contact AO ----------
for (let sy = WALL; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
  const i = sy * W + sx; if (MAT[i] !== 1 && MAT[i] !== 7 && MAT[i] !== 8) continue;
  const x = sx, d = zD[i]; let ao = 0.55 + 0.45 * sm(0, 90, d - WALL);
  for (const p of pillars) { const dx = Math.max(0, Math.abs(x - p.x) - p.r * 1.42), dd = Math.max(0, Math.abs(d - p.d) - p.r * 1.05 * 0.72) / 0.72; const q = Math.hypot(dx, dd); ao *= 1 - 0.55 * Math.exp(-q / 28); }
  for (const t of tombs) { const dx = Math.max(0, t.x0 - 8 - x, x - t.x1 - 8), dd = Math.max(0, t.d0 - 6 - d, d - t.d1 - 6) / 0.72; ao *= 1 - 0.5 * Math.exp(-Math.hypot(dx, dd) / 22); }
  for (const k in chars) { const c = chars[k]; const q = ((x - c.x) / 34) ** 2 + ((d - c.d) / 14) ** 2; ao *= 1 - 0.75 * Math.exp(-q * 1.5); }
  for (const [rx, rd, rr] of rocks) { const q = Math.hypot(x - rx, (d - rd) / 0.72) / rr; if (q < 2) ao *= 1 - 0.45 * Math.exp(-(q - 0.8) * 3); }
  AO[i] *= ao;
}
log('ao');

// ---------- lighting ----------
const V = [0, 0.812, 0.584];
const MOONC = [0.55, 0.72, 1.0], MI = 2.3;
function shadowPt(px, pY, ph, lx, lY, lh, size, own, list) {
  let s = 1; const dx = lx - px, dy = lY - pY, len2 = dx * dx + dy * dy; if (len2 < 1) return 1;
  for (let k = 0; k < list.length; k++) { const oi = list[k], o = occ[oi]; if (oi === own || o.grp === own) continue;
    const t = ((o.x - px) * dx + (o.Y - pY) * dy) / len2; if (t <= 0 || t >= 1) continue;
    const hAt = ph + t * (lh - ph); if (hAt > o.h + 8) continue;
    const cx = px + t * dx - o.x, cy = pY + t * dy - o.Y, dist = Math.sqrt(cx * cx + cy * cy);
    const pen = Math.min(90, 1 + size * t / Math.max(0.02, 1 - t));
    let f = sm(o.r - pen, o.r + pen, dist); if (hAt > o.h) f = mix(f, 1, (hAt - o.h) / 8);
    s *= f; if (s < 0.01) return 0; }
  return s;
}
const MDX = -MX, MDY = -MD * DY;
function shadowMoon(px, pY, ph, own) {
  let s = 1; const l2 = MDX * MDX + MDY * MDY;
  for (let oi = 0; oi < occ.length; oi++) { if (oi === own) continue; const o = occ[oi]; if (o.grp === own && own >= 0) continue;
    const t = ((o.x - px) * MDX + (o.Y - pY) * MDY) / l2; if (t <= 0) continue; const hAt = ph + t; if (hAt > o.h + 6) continue;
    const cx = px + t * MDX - o.x, cy = pY + t * MDY - o.Y, dist = Math.hypot(cx, cy), pen = 1.5 + t * 0.05;
    s *= sm(o.r - pen, o.r + pen, dist); }
  return s;
}
for (const L of lights) { L.Y = L.d * DY; L.occ = []; occ.forEach((o, k) => { if (Math.hypot(o.x - L.x, o.Y - L.Y) < L.rad + o.r && !L.bounce) L.occ.push(k); }); }
const lit = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const m = MAT[i]; if (!m) continue;
  if (m === 6) { lit[i * 3] = eR[i]; lit[i * 3 + 1] = eG[i]; lit[i * 3 + 2] = eB[i]; continue; }
  const x = i % W, sy = (i / W) | 0, d = zD[i], h = pH[i], pY = d * DY, own = OWN[i];
  const nx = nX[i], ny = nY[i], nz = nZ[i], ao = AO[i], spr = m === 5;
  const reg = 0.3 + 0.8 * Math.exp(-(((x - 960) / 820) ** 2 + ((d - 760) / 420) ** 2));
  const ak = (spr ? 1.9 : 1) * ao * reg * (0.6 + 0.4 * nz + 0.2 * ny);
  let dr = 0.02 * ak, dg = 0.028 * ak, db = 0.042 * ak, sr = 0, sg = 0, sb = 0;
  for (const L of lights) {
    const lx = L.x - x, lY = L.Y - pY, lz = L.h - h, d2 = lx * lx + lY * lY + lz * lz; if (d2 > L.rad * L.rad) continue;
    const dist = Math.sqrt(d2); let ndl = (nx * lx + ny * lY + nz * lz) / dist; if (spr) ndl = (ndl + 0.3) / 1.3; if (ndl <= 0 && !spr) continue;
    let att = L.I / (d2 + (L.main ? 9000 : 900)) * (1 - sm(L.rad * 0.55, L.rad, dist)); if (L.bounce) att *= ao;
    if (att < 0.002) continue;
    const s = L.bounce ? 1 : shadowPt(x, pY, h, L.x, L.Y, L.h, L.size, own, L.occ); if (s <= 0) continue;
    if (spr && !L.bounce) { const rf = Math.pow(Math.max(0, 1 - Math.max(0, ny * V[1] + nz * V[2])), 2.5) * sat(0.35 - (lY * V[1] + lz * V[2]) / dist) * att * s * 0.5 * sat((nx * lx + ny * lY + nz * lz) / dist + 0.45); sr += L.c[0] * rf * (0.3 + 3 * aR[i]); sg += L.c[1] * rf * (0.3 + 3 * aG[i]); sb += L.c[2] * rf * (0.3 + 3 * aB[i]); }
    if (ndl <= 0) continue;
    const k = ndl * att * s; dr += L.c[0] * k; dg += L.c[1] * k; db += L.c[2] * k;
    if (!L.bounce && KS[i] > 0) { let hx = lx / dist, hy = lY / dist + V[1], hz = lz / dist + V[2]; const hl = Math.hypot(hx, hy, hz); const nh = Math.min(1, Math.max(0, (nx * hx + ny * hy + nz * hz) / hl)); const sp = Math.pow(nh, SH[i]) * KS[i] * att * s * (SH[i] + 8) / 40; sr += L.c[0] * sp; sg += L.c[1] * sp; sb += L.c[2] * sp; }
  }
  const bm = inBeam(x, d, h);
  if (bm > 0) {
    let ndl = nx * MOON[0] + ny * MOON[1] + nz * MOON[2]; if (spr) ndl = (ndl + 0.35) / 1.35;
    if (spr) { const rf = Math.pow(Math.max(0, 1 - Math.max(0, ny * V[1] + nz * V[2])), 2.5) * 0.4 * MI * bm * shadowMoon(x, pY, h, own) * sat(nx * MOON[0] + ny * MOON[1] + nz * MOON[2] + 0.4); sr += MOONC[0] * rf * (0.5 + 3 * aR[i]); sg += MOONC[1] * rf * (0.5 + 3 * aG[i]); sb += MOONC[2] * rf * (0.5 + 3 * aB[i]); }
    if (ndl > 0) { const s = shadowMoon(x, pY, h, own) * bm; const k = ndl * s * MI; dr += MOONC[0] * k; dg += MOONC[1] * k; db += MOONC[2] * k;
      if (KS[i] > 0) { let hx = MOON[0], hy = MOON[1] + V[1], hz = MOON[2] + V[2]; const hl = Math.hypot(hx, hy, hz); const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl); const sp = Math.pow(nh, SH[i]) * KS[i] * s * MI * (SH[i] + 8) / 40; sr += MOONC[0] * sp; sg += MOONC[1] * sp; sb += MOONC[2] * sp; } }
  }
  if (spr) { // soft cold rim so silhouettes always read
    const fr = Math.pow(Math.max(0, 1 - Math.max(0, nx * V[0] + ny * V[1] + nz * V[2])), 3) * reg; dr += 0.1 * fr; dg += 0.14 * fr; db += 0.2 * fr; }
  let r = aR[i] * dr, g = aG[i] * dg, b = aB[i] * db;
  if (m === 8) { r += sr * aR[i] * 4; g += sg * aG[i] * 4; b += sb * aB[i] * 4; } else { r += sr; g += sg; b += sb; }
  lit[i * 3] = r + eR[i]; lit[i * 3 + 1] = g + eG[i]; lit[i * 3 + 2] = b + eB[i];
}
log('light'); { let mx=0, mi=-1, nf=0; for (let i=0;i<N*3;i++){ if(!Number.isFinite(lit[i])) nf++; else if(lit[i]>mx){mx=lit[i];mi=i;} } const p=(mi/3)|0; console.log('lit max', mx, p%W, (p/W)|0, 'mat', MAT[p], 'nonfinite', nf); }

// ---------- painterly pass on surfaces: Kuwahara (summed-area tables, HDR) ----------
{
  const W1 = W + 1, S = [0, 1, 2, 3, 4].map(() => new Float64Array(W1 * (H + 1)));
  const tl = v => v / (1 + v);
  for (let k = 0; k < lit.length; k++) if (!Number.isFinite(lit[k])) lit[k] = 0;
  for (let y = 0; y < H; y++) { const a = [0, 0, 0, 0, 0]; for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; const r = lit[i], g = lit[i + 1], b = lit[i + 2], l = tl(0.3 * r + 0.59 * g + 0.11 * b); a[0] += r; a[1] += g; a[2] += b; a[3] += l; a[4] += l * l;
    const o = (y + 1) * W1 + x + 1, u = y * W1 + x + 1; for (let c = 0; c < 5; c++) S[c][o] = S[c][u] + a[c]; } }
  const out = new Float32Array(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, R = MAT[i] === 5 ? 1 : MAT[i] === 6 ? 1 : 3;
    let best = 1e18, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
    for (let q = 0; q < 4; q++) { let x0 = q & 1 ? x : x - R, y0 = q & 2 ? y : y - R, x1 = x0 + R + 1, y1 = y0 + R + 1; x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
      const n = (x1 - x0) * (y1 - y0), A = y0 * W1 + x0, B = y0 * W1 + x1, C = y1 * W1 + x0, D = y1 * W1 + x1;
      const m = (S[3][D] - S[3][B] - S[3][C] + S[3][A]) / n, v = (S[4][D] - S[4][B] - S[4][C] + S[4][A]) / n - m * m;
      if (v < best) { best = v; bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; } }
    const n = (bx1 - bx0) * (by1 - by0), A = by0 * W1 + bx0, B = by0 * W1 + bx1, C = by1 * W1 + bx0, D = by1 * W1 + bx1;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = (S[c][D] - S[c][B] - S[c][C] + S[c][A]) / n;
  }
  for (let k = 0; k < out.length; k++) if (!Number.isFinite(out[k])) out[k] = 0;
  lit.set(out);
}
log('kuwahara');

// ---------- volumetric scattering (half res) ----------
const VW = W / 2, VH = H / 2, vol = new Float32Array(VW * VH * 4);
const fire = lights.find(L => L.main);
const firOcc = fire.occ.filter(k => k !== brazier.id);
const nearC = lights.filter(L => !L.main && !L.bounce);
for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
  const sx = vx * 2 + 1, sy = vy * 2 + 1, i = sy * W + sx;
  let ds = zD[i], hs = pH[i]; if (MAT[i] === 6 || ds < WALL) { ds = WALL; hs = WALL - sy; }
  let ar = 0, ag = 0, ab = 0, T = 1; const st = 7;
  for (let s = st * hash(sx, sy); ; s += st) {
    const d = ds + s, h = hs + s; if (h > 620 || d > H + 500) break;
    const x = sx;
    const den = 0.0011 * (0.25 + 0.75 * sat(0.55 + 1.3 * fbm(x * 0.0045 + h * 0.0025, d * 0.006 - h * 0.003, 3))) * (Math.exp(-h / 300) + 0.8 * Math.exp(-h / 30));
    const bm = inBeam(x, d, h);
    if (bm > 0.001) { const s2 = bm * shadowMoon(x, d * DY, h, -1); const k = s2 * den * st * MI * 0.7 * T; ar += MOONC[0] * k; ag += MOONC[1] * k; ab += MOONC[2] * k; }
    const lx = fire.x - x, lY = fire.Y - d * DY, lz = fire.h - h, d2 = lx * lx + lY * lY + lz * lz;
    if (d2 < 1.6e6) { const att = fire.I / (d2 + 2500); const s3 = shadowPt(x, d * DY, h, fire.x, fire.Y, fire.h, fire.size, -1, firOcc); const k = att * s3 * den * st * 0.55 * T; ar += fire.c[0] * k; ag += fire.c[1] * k; ab += fire.c[2] * k; }
    for (const L of nearC) { const qx = L.x - x, qY = L.Y - d * DY, qz = L.h - h, q2 = qx * qx + qY * qY + qz * qz; if (q2 < 40000) { const fo = (1 - q2 / 40000) ** 2; const k = L.I / (q2 + 300) * den * st * 0.5 * T * fo; ar += L.c[0] * k; ag += L.c[1] * k; ab += L.c[2] * k; } }
    T *= Math.exp(-den * st * 0.35);
  }
  const o = (vy * VW + vx) * 4; vol[o] = ar; vol[o + 1] = ag; vol[o + 2] = ab; vol[o + 3] = T;
}
log('volume');
function volAt(x, y, c) { const fx = Math.min(VW - 1.001, Math.max(0, (x - 1) / 2)), fy = Math.min(VH - 1.001, Math.max(0, (y - 1) / 2)); const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0; const o = (y0 * VW + x0) * 4 + c; return mix(mix(vol[o], vol[o + 4], tx), mix(vol[o + VW * 4], vol[o + VW * 4 + 4], tx), ty); }
const comp = new Float32Array(N * 3);
for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
  const i = sy * W + sx, T = volAt(sx, sy, 3);
  // atmospheric depth: the back of the hall sinks into cold haze
  const far = MAT[i] === 6 ? 0.2 : sat((980 - zD[i]) / 900) * 0.55;
  for (let c = 0; c < 3; c++) { const v = lit[i * 3 + c] * T * (1 - far) + [0.006, 0.009, 0.014][c] * far + volAt(sx, sy, c); comp[i * 3 + c] = Number.isFinite(v) ? v : 0; }
}
log('composite'); { let mx=0, mi=-1; for (let i=0;i<N*3;i++){ if(comp[i]>mx){mx=comp[i];mi=i;} } const p=(mi/3)|0; console.log('comp max', mx, p%W, (p/W)|0, 'mat', MAT[p]); }

// ---------- reflections on water (screen-space) ----------
{
  const src = comp.slice();
  for (let sy = WALL; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    const i = sy * W + sx, w = WET[i]; if (w < 0.02) continue;
    const d = zD[i]; const rip = 1.8 * noise(sx * 0.04, sy * 0.25) + 0.8 * noise(sx * 0.15, sy * 0.6);
    let rr = 0.012, rg = 0.018, rb = 0.028, hitS = 900;
    for (let s = 2; s < 900; s += 1.5) {
      const yy = Math.round(sy - 2 * s), xx = Math.round(sx + rip * (1 + s * 0.02)); if (yy < 0) break; if (xx < 0 || xx >= W) break;
      const j = yy * W + xx, D = zD[j], rd = d - s;
      if (D >= rd - 1 && D - rd < 70) { rr = src[j * 3]; rg = src[j * 3 + 1]; rb = src[j * 3 + 2]; hitS = s; break; }
    }
    // light shafts and fire glow seen in the water (in-scatter along the reflected ray)
    for (let s = 6 * hash(sx, sy); s < Math.min(hitS, 620); s += 12) {
      const x = sx + rip, dd = d - s, h = s; if (dd < WALL) break;
      const den = 0.0011 * (Math.exp(-h / 300) + 0.8 * Math.exp(-h / 30));
      const bm = inBeam(x, dd, h); if (bm > 0.001) { const k = bm * den * 12 * MI * 0.6; rr += MOONC[0] * k; rg += MOONC[1] * k; rb += MOONC[2] * k; }
      const lx = fire.x - x, lY = fire.Y - dd * DY, lz = fire.h - h, d2 = lx * lx + lY * lY + lz * lz; const k = fire.I / (d2 + 2500) * den * 12 * 0.55; rr += fire.c[0] * k; rg += fire.c[1] * k; rb += fire.c[2] * k;
    }
    const F = MAT[i] === 7 ? 0.62 * w : 0.0;
    comp[i * 3] = mix(comp[i * 3] * 0.6, rr, F); comp[i * 3 + 1] = mix(comp[i * 3 + 1] * 0.6, rg, F); comp[i * 3 + 2] = mix(comp[i * 3 + 2] * 0.6, rb, F);
  }
}
log('ssr');

// ---------- fire, glows, motes, embers (additive emissive layer) ----------
const fx = mk(W, H), f = fx.getContext('2d'); f.globalCompositeOperation = 'lighter';
function glow(x, y, r, c, a) { const g = f.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); f.fillStyle = g; f.fillRect(x - r, y - r, 2 * r, 2 * r); }
{ // brazier flames
  const bx = brazier.x, by = brazier.d - 92; seed = 5;
  for (let k = 0; k < 44; k++) { const ox = (rnd() - 0.5) * 60, hh = 30 + rnd() * rnd() * 130 * (1 - Math.abs(ox) / 36), w = 4 + rnd() * 7, lean = (rnd() - 0.45) * 26;
    const g = f.createLinearGradient(0, by, 0, by - hh); g.addColorStop(0, 'rgba(255,215,140,0.3)'); g.addColorStop(0.3, 'rgba(255,120,35,0.22)'); g.addColorStop(1, 'rgba(160,25,5,0)');
    f.fillStyle = g; f.beginPath(); f.moveTo(bx + ox - w, by); f.bezierCurveTo(bx + ox - w * 0.8, by - hh * 0.4, bx + ox + lean * 0.6 - w * 0.3, by - hh * 0.7, bx + ox + lean, by - hh); f.bezierCurveTo(bx + ox + lean * 0.5 + w * 0.4, by - hh * 0.6, bx + ox + w * 0.9, by - hh * 0.35, bx + ox + w, by); f.fill(); }
  glow(bx, by - 14, 26, '255,235,180', 0.4); glow(bx, by - 30, 110, '255,110,40', 0.05);
  for (let k = 0; k < 70; k++) { const t = rnd(); const ex = bx + (rnd() - 0.5) * 60 + Math.sin(t * 9 + k) * 30 * t - t * 40, ey = by - 30 - t * 420; const a = (1 - t) * 0.9; glow(ex, ey, 2.5 + rnd() * 2, '255,150,60', a); }
}
for (const [x, d, hb] of candleSets) glow(x, d - hb - 26, 34, '255,170,90', 0.12);
{ // dust motes in the moon shaft
  seed = 9; let n = 0;
  while (n < 220) { const x = 450 + rnd() * 600, d = WALL + rnd() * 520, h = rnd() * 420; const b = inBeam(x, d, h); if (b < 0.3) continue; const sy = d - h; n++; const r = 0.5 + rnd() * 1.1; const a = b * (0.06 + rnd() * 0.22) * (rnd() < 0.12 ? 2 : 1);
    f.fillStyle = `rgba(200,225,255,${a})`; f.beginPath(); f.arc(x, sy, r, 0, 7); f.fill(); }
}
glow(690, WALL - 330, 260, '150,190,255', 0.1);
const FXA = new Uint8Array(N); { const id = f.getImageData(0, 0, W, H).data; for (let i = 0; i < N; i++) { const a = id[i * 4 + 3] / 255; FXA[i] = id[i * 4 + 3]; if (!a) continue; for (let c = 0; c < 3; c++) comp[i * 3 + c] += Math.pow(id[i * 4 + c] / 255, 2.2) * a * 2.6; }
  // brazier flame mirrored in the puddles (it is not in the G-buffer, so SSR cannot see it)
  for (let sy = brazier.d; sy < H; sy++) for (let sx = brazier.x - 110; sx < brazier.x + 110; sx++) { const i = sy * W + sx; if (MAT[i] !== 7) continue;
    const yy = 2 * brazier.d - sy, xx = Math.round(sx + 2.5 * noise(sx * 0.05, sy * 0.3)); if (yy < 0) continue; const j = yy * W + xx, a = id[j * 4 + 3] / 255; if (!a) continue;
    for (let c = 0; c < 3; c++) comp[i * 3 + c] += Math.pow(id[j * 4 + c] / 255, 2.2) * a * 1.6 * WET[i]; } }
log('fx');

// ---------- bloom ----------
{
  const s = 4, bw = W / s, bh = H / s, bb = new Float32Array(bw * bh * 3);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let c = 0; c < 3; c++) { let a = 0; for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) a += comp[((y * s + j) * W + x * s + k) * 3 + c]; a /= s * s; bb[(y * bw + x) * 3 + c] = Math.max(0, a - 0.55); }
  const blur = (src, R) => { const out = new Float32Array(src.length), tmp = new Float32Array(src.length); const wts = []; let ws = 0; for (let k = -R; k <= R; k++) { const w = Math.exp(-k * k / (R * R / 4)); wts.push(w); ws += w; }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let c = 0; c < 3; c++) { let a = 0; for (let k = -R; k <= R; k++) { const xx = Math.min(bw - 1, Math.max(0, x + k)); a += src[(y * bw + xx) * 3 + c] * wts[k + R]; } tmp[(y * bw + x) * 3 + c] = a / ws; }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let c = 0; c < 3; c++) { let a = 0; for (let k = -R; k <= R; k++) { const yy = Math.min(bh - 1, Math.max(0, y + k)); a += tmp[(yy * bw + x) * 3 + c] * wts[k + R]; } out[(y * bw + x) * 3 + c] = a / ws; } return out; };
  const b1 = blur(bb, 6), b2 = blur(bb, 24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const fx2 = Math.min(bw - 1.001, x / s), fy2 = Math.min(bh - 1.001, y / s), x0 = fx2 | 0, y0 = fy2 | 0, tx = fx2 - x0, ty = fy2 - y0;
    for (let c = 0; c < 3; c++) { const o = (y0 * bw + x0) * 3 + c; const v1 = mix(mix(b1[o], b1[o + 3], tx), mix(b1[o + bw * 3], b1[o + bw * 3 + 3], tx), ty), v2 = mix(mix(b2[o], b2[o + 3], tx), mix(b2[o + bw * 3], b2[o + bw * 3 + 3], tx), ty); comp[(y * W + x) * 3 + c] += v1 * 0.35 + v2 * 0.45; } }
}
log('bloom');

// ---------- tone map + grade ----------
const ctx = document.getElementById('c').getContext('2d');
const img = ctx.createImageData(W, H), o8 = img.data;
const EXP = 1.4; const aces = v => sat((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14));
for (let i = 0; i < N; i++) {
  let r = aces(comp[i * 3] * EXP), g = aces(comp[i * 3 + 1] * EXP), b = aces(comp[i * 3 + 2] * EXP);
  r = r * r * (3 - 2 * r) * 0.55 + r * 0.45; g = g * g * (3 - 2 * g) * 0.55 + g * 0.45; b = b * b * (3 - 2 * b) * 0.55 + b * 0.45;
  const l = 0.3 * r + 0.59 * g + 0.11 * b; const ds = 0.85; r = mix(l, r, ds); g = mix(l, g, ds); b = mix(l, b, ds);
  const sh = Math.pow(1 - l, 6); r += 0.004 * sh; g += 0.008 * sh; b += 0.014 * sh;
  o8[i * 4] = Math.pow(sat(r), 1 / 2.2) * 255; o8[i * 4 + 1] = Math.pow(sat(g), 1 / 2.2) * 255; o8[i * 4 + 2] = Math.pow(sat(b), 1 / 2.2) * 255; o8[i * 4 + 3] = 255;
}
log('tonemap');

// ---------- painterly pass: Kuwahara via summed-area tables ----------
function kuwahara(data, R) {
  const S = new Float64Array((W + 1) * (H + 1) * 4); // sum r,g,b, sum lum^2
  for (let y = 0; y < H; y++) { let a0 = 0, a1 = 0, a2 = 0, a3 = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2], l = 0.3 * r + 0.59 * g + 0.11 * b; a0 += r; a1 += g; a2 += b; a3 += l * l;
    const o = ((y + 1) * (W + 1) + x + 1) * 4, u = (y * (W + 1) + x + 1) * 4; S[o] = S[u] + a0; S[o + 1] = S[u + 1] + a1; S[o + 2] = S[u + 2] + a2; S[o + 3] = S[u + 3] + a3; } }
  const Ls = new Float64Array((W + 1) * (H + 1)); // sum lum
  for (let y = 0; y < H; y++) { let a = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; a += 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; Ls[(y + 1) * (W + 1) + x + 1] = Ls[y * (W + 1) + x + 1] + a; } }
  const out = new Uint8ClampedArray(data.length);
  const rect = (x0, y0, x1, y1, c) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1); const A = (y0 * (W + 1) + x0) * 4, B = (y0 * (W + 1) + x1) * 4, C = (y1 * (W + 1) + x0) * 4, D = (y1 * (W + 1) + x1) * 4; return S[D + c] - S[B + c] - S[C + c] + S[A + c]; };
  const rl = (x0, y0, x1, y1) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1); return [Ls[y1 * (W + 1) + x1] - Ls[y0 * (W + 1) + x1] - Ls[y1 * (W + 1) + x0] + Ls[y0 * (W + 1) + x0], (x1 - x0) * (y1 - y0)]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 1e18, bi = null;
    for (const [x0, y0] of [[x - R, y - R], [x, y - R], [x - R, y], [x, y]]) { const [sl, n] = rl(x0, y0, x0 + R + 1, y0 + R + 1); const m = sl / n, v = rect(x0, y0, x0 + R + 1, y0 + R + 1, 3) / n - m * m; if (v < best) { best = v; bi = [x0, y0, n]; } }
    const [x0, y0, n] = bi, o = (y * W + x) * 4;
    out[o] = rect(x0, y0, x0 + R + 1, y0 + R + 1, 0) / n; out[o + 1] = rect(x0, y0, x0 + R + 1, y0 + R + 1, 1) / n; out[o + 2] = rect(x0, y0, x0 + R + 1, y0 + R + 1, 2) / n; out[o + 3] = 255;
  }
  data.set(out);
}
// vignette + grain + canvas weave
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; const vx = (x - 960) / 960, vy = (y - 600) / 620; const v = 1 - 0.5 * sm(0.45, 1.3, Math.hypot(vx * 0.92, vy));
  const gn = (hash(x, y) - 0.5) * 7 + 3 * (Math.sin(x * 1.9) * Math.sin(y * 1.9)) ;
  for (let c = 0; c < 3; c++) o8[i + c] = o8[i + c] * v + gn;
}
ctx.putImageData(img, 0, 0);
{ // brush strokes along the image structure (background only)
  const src = new Uint8ClampedArray(o8); const lum = (x, y) => { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); const i = (y * W + x) * 4; return 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]; };
  seed = 2024; ctx.lineCap = 'round';
  for (let k = 0; k < 150000; k++) {
    const x = (rnd() * W) | 0, y = (rnd() * H) | 0, i = (y * W + x) * 4, q = y * W + x; if (MAT[q] === 5 || FXA[q] > 60 || eR[q] + eG[q] > 0.3) continue;
    const gx = lum(x + 3, y) - lum(x - 3, y), gy = lum(x, y + 3) - lum(x, y - 3); const gm = Math.hypot(gx, gy);
    const ang = gm > 2 ? Math.atan2(gy, gx) + Math.PI / 2 : (rnd() - 0.5) * 0.6 + (MAT[y * W + x] === 2 ? Math.PI / 2 : 0);
    const l0 = 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
    const len = (gm > 12 ? 4 : 8) + rnd() * (l0 < 40 ? 10 : 5), w = 1.4 + rnd() * (l0 < 40 ? 2.6 : 1.5);
    const j = (rnd() - 0.5) * 8; ctx.strokeStyle = `rgba(${src[i] + j},${src[i + 1] + j},${src[i + 2] + j * 1.2},0.5)`; ctx.lineWidth = w;
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2; ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.quadraticCurveTo(x + dy * 0.15, y - dx * 0.15, x + dx, y + dy); ctx.stroke();
  }
  // keep characters and light sources crisp
  const id2 = ctx.getImageData(0, 0, W, H), d2 = id2.data;
  for (let p = 0; p < N; p++) { const keep = MAT[p] === 5 || FXA[p] > 60 || eR[p] + eG[p] > 0.3 ? 1 : 0; if (keep) { d2[p * 4] = src[p * 4]; d2[p * 4 + 1] = src[p * 4 + 1]; d2[p * 4 + 2] = src[p * 4 + 2]; } }
  ctx.putImageData(id2, 0, 0);
}
{ // crossbow aim telegraph (danger read)
  const x0 = chars.xb.x - 98, y0 = chars.xb.d - 119, x1 = chars.hero.x + 2, y1 = chars.hero.d - 96;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,60,50,0.55)'); g.addColorStop(1, 'rgba(255,60,50,0.12)');
  ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.setLineDash([10, 9]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,40,30,0.06)'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.restore();
}
{ // minimal HUD: health and blood (thirst)
  ctx.save(); const X = 54, Y = 48;
  ctx.fillStyle = 'rgba(8,6,10,0.75)'; ctx.fillRect(X - 6, Y - 6, 312, 24);
  ctx.strokeStyle = 'rgba(150,130,110,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(X - 6.5, Y - 6.5, 313, 25);
  const hg = ctx.createLinearGradient(0, Y, 0, Y + 12); hg.addColorStop(0, '#9a1b26'); hg.addColorStop(1, '#4a0a12'); ctx.fillStyle = hg; ctx.fillRect(X, Y, 300 * 0.68, 12);
  ctx.fillStyle = 'rgba(255,200,190,0.25)'; ctx.fillRect(X, Y, 300 * 0.68, 2);
  ctx.fillStyle = 'rgba(60,10,16,0.6)'; ctx.fillRect(X + 300 * 0.68, Y, 300 * 0.1, 12);
  for (let k = 0; k < 5; k++) { const cx = X + 8 + k * 22, cy = Y + 40; ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.bezierCurveTo(cx + 7, cy - 1, cx + 6, cy + 6, cx, cy + 6); ctx.bezierCurveTo(cx - 6, cy + 6, cx - 7, cy - 1, cx, cy - 9);
    ctx.fillStyle = k < 3 ? '#5b1f8a' : 'rgba(40,20,55,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,150,220,0.4)'; ctx.stroke(); }
  ctx.restore();
}
log('done');
};
