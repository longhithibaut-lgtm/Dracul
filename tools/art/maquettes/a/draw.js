(function () {
const W = 1920, H = 1080;
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
let seed = 1337;
function R() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + R() * (b - a);
const pick = a => a[Math.floor(R() * a.length)];
const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const hsh = (x, y) => P[(P[x & 255] + y) & 255] / 255;
function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * noise(x * f + i * 17, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const INK = '#120b09';
// ---------- ink primitives ----------
function resample(pts, seg) { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / seg)); for (let k = 0; k < n; k++) { const t = k / n; out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } } out.push(pts[pts.length - 1]); return out; }
// brush stroke: variable width, wobbly, tapered ends
function stroke(ctx, pts, w, o = {}) {
  const col = o.col || INK, jit = o.jit ?? 1.1, closed = !!o.closed, taper = o.taper ?? !closed;
  if (closed) pts = [...pts, pts[0]];
  const p = resample(pts, o.seg || 5), N = p.length, off = R() * 500;
  const q = p.map((a, i) => { const b = p[Math.min(N - 1, i + 1)], c = p[Math.max(0, i - 1)]; let dx = b[0] - c[0], dy = b[1] - c[1]; const l = Math.hypot(dx, dy) || 1; const j = (noise(off + i * 0.18, 3.7) - 0.5) * 2 * jit; return [a[0] - dy / l * j, a[1] + dx / l * j]; });
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < N - 1; i++) {
    const t = i / (N - 1); const tp = taper ? Math.min(1, Math.min(t, 1 - t) * 6 + 0.2) : 1;
    ctx.lineWidth = Math.max(0.35, w * tp * (0.6 + 0.8 * noise(off + i * 0.11, 9.1)));
    ctx.beginPath(); ctx.moveTo(q[i][0], q[i][1]); ctx.lineTo(q[i + 1][0], q[i + 1][1]); ctx.stroke();
  }
}
function smooth(pts, closed = true, n = 6) { const out = [], L = pts.length; const g = i => closed ? pts[(i + L) % L] : pts[Math.max(0, Math.min(L - 1, i))]; const m = closed ? L : L - 1; for (let i = 0; i < m; i++) { const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2); for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3); out.push([f(0), f(1)]); } } if (!closed) out.push(pts[L - 1]); return out; }
function path(ctx, pts, close = true) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); }
function blob(ctx, pts, fill, w = 3, sm = true) { const p = sm ? smooth(pts, true, 5) : pts; path(ctx, p); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (w > 0) stroke(ctx, p, w, { closed: true }); return p; }
function line(ctx, pts, w, o = {}) { stroke(ctx, o.sm === false ? pts : (pts.length > 2 ? smooth(pts, false, 6) : pts), w, o); }
function ell(cx, cy, rx, ry, n = 28, a0 = 0, a1 = Math.PI * 2) { const o = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / (a1 - a0 >= 6.28 ? n : n - 1); o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
// hatching clipped by one or more polygons; dashes for a hand-made feel
let HS = 1; // hatch scale: keeps line density constant in screen px when a drawing is scaled up
function hatch(ctx, clips, box, ang, sp, w, o = {}) {
  sp /= HS; w /= HS;
  ctx.save(); for (const c of clips) { path(ctx, c); ctx.clip(); }
  ctx.globalAlpha = o.alpha ?? 1; ctx.strokeStyle = o.col || INK; ctx.lineCap = 'round';
  const [x0, y0, x1, y1] = box, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
  for (let s = -r; s <= r; s += sp * rr(0.75, 1.25)) {
    let t = -r - rr(0, 30);
    while (t < r) {
      const len = o.dash ? rr(o.dash[0], o.dash[1]) : 2 * r + 60;
      const a = [cx + nx * s + dx * t, cy + ny * s + dy * t], b = [cx + nx * s + dx * (t + len), cy + ny * s + dy * (t + len)];
      ctx.lineWidth = w * rr(0.6, 1.3);
      const mx = (a[0] + b[0]) / 2 + nx * rr(-1, 1) * (o.wob ?? 1.2), my = (a[1] + b[1]) / 2 + ny * rr(-1, 1) * (o.wob ?? 1.2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
      t += len + (o.gap ? rr(o.gap[0], o.gap[1]) : 0);
    }
  }
  ctx.restore();
}
const bbox = pts => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
const half = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function shadeIn(ctx, shape, region, ang, sp, w, alpha = 0.9) { hatch(ctx, region ? [shape, region] : [shape], bbox(shape), ang, sp, w, { alpha }); }

// tapered organic limb through joints: pts [[x,y,w],...]
function limb(ctx, pts, fill, w = 2.8) {
  const L = [], Rr = [];
  pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; L.push([p[0] - dy / l * p[2], p[1] + dx / l * p[2]]); Rr.push([p[0] + dy / l * p[2], p[1] - dx / l * p[2]]); });
  return blob(ctx, [...L, ...Rr.reverse()], fill, w);
}
// ---------- canvases ----------
const out = document.getElementById('c'), O = out.getContext('2d');
const env = mk(), E = env.getContext('2d');
const chr = mk(), C = chr.getContext('2d');
const emi = mk(), M = emi.getContext('2d');

// ---------- lights ----------
const lights = [
  { x: 650, y: 530, r: 520, i: 1.2 }, { x: 1270, y: 530, r: 520, i: 1.2 },
  { x: 790, y: 205, r: 330, i: 0.75 }, { x: 1130, y: 205, r: 330, i: 0.75 },
  { x: 960, y: 800, r: 430, i: 0.45 },
  { x: 1700, y: 600, r: 230, i: 0.45 }, { x: 300, y: 630, r: 240, i: 0.42 }, { x: 335, y: 330, r: 230, i: 0.5 }, { x: 1585, y: 330, r: 230, i: 0.5 },
];
function light(x, y) {
  let L = 0;
  for (const l of lights) { const dx = x - l.x, dy = (y - l.y) * 1.2; const d = Math.sqrt(dx * dx + dy * dy) / l.r; if (d < 1) { const f = 1 - d; L += l.i * f * f * (1 + f); } }
  return L * (0.78 + 0.44 * fbm(x / 150, y / 150, 3));
}

// ---------- props ----------
function sun(ctx, x, y, r, fill, rays = 12, w = 2.5) {
  const pts = []; for (let i = 0; i < rays * 2; i++) { const a = i / (rays * 2) * Math.PI * 2 - Math.PI / 2; const rad = i % 2 ? r * 0.62 : (i % 4 ? r * 0.86 : r); pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]); }
  blob(ctx, pts, fill, w, false);
  blob(ctx, ell(x, y, r * 0.5, r * 0.5, 24), fill, w * 0.9, false);
  stroke(ctx, ell(x, y, r * 0.32, r * 0.32, 20), w * 0.6, { closed: true });
}
function skull(ctx, x, y, s, bone = '#cfc2a4', rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  blob(ctx, [[-9, -2], [-8, -10], [0, -14], [8, -10], [9, -2], [6, 4], [5, 9], [-5, 9], [-6, 4]], bone, 2.2);
  blob(ctx, [[-6, -3], [-2, -4], [-2, 1], [-6, 1]], '#1a110d', 0);
  blob(ctx, [[6, -3], [2, -4], [2, 1], [6, 1]], '#1a110d', 0);
  blob(ctx, [[0, 2], [1.5, 5], [-1.5, 5]], '#1a110d', 0, false);
  stroke(ctx, [[-4, 7], [4, 7]], 1); for (let i = -3; i <= 3; i += 2) stroke(ctx, [[i, 6], [i, 9]], 0.8);
  ctx.restore();
}
function bone(ctx, x0, y0, x1, y1, w = 5, col = '#c4b597') {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
  blob(ctx, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], col, 1.6, false);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { blob(ctx, ell(x + nx * 0.8, y + ny * 0.8, w * 0.65, w * 0.65, 10), col, 1.6); blob(ctx, ell(x - nx * 0.8, y - ny * 0.8, w * 0.65, w * 0.65, 10), col, 1.6); }
}
function chain(ctx, pts, link = 13, w = 2, col = '#3b3532') {
  const p = resample(smooth(pts, false, 8), link * 0.8);
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1]; const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.save(); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(a);
    const wide = i % 2 === 0;
    const e = ell(0, 0, link * 0.62, wide ? link * 0.36 : link * 0.13, 16);
    path(ctx, e); ctx.fillStyle = col; ctx.fill(); stroke(ctx, e, w, { closed: true, jit: 0.3 });
    if (wide) { stroke(ctx, ell(0, 0, link * 0.32, link * 0.1, 12), w * 0.8, { closed: true, jit: 0.2 }); ctx.fillStyle = 'rgba(200,180,150,0.35)'; ctx.fillRect(-link * 0.3, -link * 0.3, link * 0.25, 1.5); }
    ctx.restore();
  }
}
function flame(ctx, x, y, s, seedOff = 0) {
  const tongue = (dx, h, wd, c1, lw) => { const tip = [x + dx + rr(-4, 4) * s, y - h * s]; blob(ctx, [[x + dx - wd * s, y], [x + dx - wd * 0.7 * s, y - h * 0.35 * s], [x + dx - wd * 0.25 * s + rr(-3, 3), y - h * 0.7 * s], tip, [x + dx + wd * 0.3 * s, y - h * 0.65 * s], [x + dx + wd * 0.75 * s, y - h * 0.3 * s], [x + dx + wd * s, y], [x + dx, y + 4 * s]], c1, lw); };
  tongue(-8 * s, 50, 14, '#b4471b', 2.6); tongue(9 * s, 44, 13, '#b4471b', 2.6); tongue(0, 70, 18, '#d9762a', 2.8);
  tongue(-4 * s, 44, 11, '#efb04a', 0); tongue(5 * s, 36, 9, '#efb04a', 0); tongue(0, 28, 7, '#fbe6a6', 0);
}
function fireGlow(ctx, x, y, r, a = 0.5) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,190,90,${a})`); g.addColorStop(0.35, `rgba(220,110,40,${a * 0.35})`); g.addColorStop(1, 'rgba(120,40,10,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
function shadow(ctx, x, y, rx, ry, a = 0.55) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#0b0605'; path(ctx, ell(x, y, rx, ry, 24)); ctx.fill(); ctx.restore(); hatch(ctx, [ell(x, y, rx, ry, 24)], [x - rx, y - ry, x + rx, y + ry], 0.6, 4, 1.2, { alpha: 0.6 }); }

// ================= ENVIRONMENT =================
E.fillStyle = '#0d0907'; E.fillRect(0, 0, W, H);
const FLOOR = 335;
// ---- back wall: ashlar ----
{
  E.fillStyle = '#2a201a'; E.fillRect(0, 30, W, FLOOR - 30);
  let y = 30, row = 0;
  while (y < FLOOR - 28) {
    const h = 36 + rr(-3, 3); let x = row % 2 ? -rr(30, 70) : -rr(0, 30);
    while (x < W) {
      const w = rr(70, 130), pts = [[x + 2 + rr(-1, 1), y + 2], [x + w - 2, y + 2 + rr(-1, 1)], [x + w - 2 + rr(-1, 1), y + h - 2], [x + 2, y + h - 2 + rr(-1, 1)]];
      const greenish = sst(200, 330, y) * R();
      const col = greenish > 0.55 ? pick(['#4f5446', '#4a5040']) : pick(['#5e5043', '#57493d', '#64554a', '#5a4c42', '#615346']);
      blob(E, pts, col, 2.6, false);
      E.save(); E.globalAlpha = 0.35; stroke(E, [[x + 6, y + 5], [x + w - 6, y + 5]], 1.6, { col: '#b8a588' }); E.restore();
      if (R() < 0.6) hatch(E, [pts], [x, y, x + w, y + h], -0.9, 5, 1, { alpha: 0.75, dash: [6, 14], gap: [6, 30] });
      if (R() < 0.25) line(E, [[x + rr(10, w - 10), y + 3], [x + rr(10, w - 10), y + h * 0.5], [x + rr(10, w - 10), y + h - 3]], 1.3);
      x += w;
    }
    y += h; row++;
  }
  // base course + wet streaks + moss drips
  blob(E, [[0, FLOOR - 26], [W, FLOOR - 26], [W, FLOOR], [0, FLOOR]], '#4b4037', 3, false);
  E.save(); E.globalAlpha = 0.4; stroke(E, [[0, FLOOR - 22], [W, FLOOR - 22]], 2, { col: '#a8977c', taper: false }); E.restore();
  hatch(E, [half(0, FLOOR - 14, W, FLOOR)], [0, FLOOR - 14, W, FLOOR], 0.9, 5, 1.1, { alpha: 0.8 });
  for (let i = 0; i < 26; i++) { const x = rr(0, W), y0 = rr(60, 200), y1 = y0 + rr(60, 160); E.save(); E.globalAlpha = 0.25; line(E, [[x, y0], [x + rr(-4, 4), (y0 + y1) / 2], [x + rr(-4, 4), y1]], rr(4, 10), { col: '#1d1712' }); E.restore(); }
  for (let i = 0; i < 40; i++) { const x = rr(0, W), y0 = FLOOR - 30; E.save(); E.globalAlpha = 0.6; line(E, [[x, y0], [x + rr(-2, 2), y0 - rr(10, 45)]], rr(2, 5), { col: '#3e4a36' }); E.restore(); }
}
// ---- ossuary niches ----
function niche(cx) {
  const top = 115, bot = FLOOR - 40, w = 120;
  const arch = [[cx - w / 2, bot], [cx - w / 2, top + 50], ...ell(cx, top + 50, w / 2, 55, 14, Math.PI, Math.PI * 1.5).slice(1), [cx, top - 8], ...ell(cx, top + 50, w / 2, 55, 14, Math.PI * 1.5, Math.PI * 2).slice(1), [cx + w / 2, top + 50], [cx + w / 2, bot]];
  // voussoir ring
  const ring = arch.map(([x, y]) => [cx + (x - cx) * 1.2, y + (y - bot) * 0.08 - 6]);
  blob(E, ring, '#6a5b4c', 3, false);
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += Math.PI / 6) stroke(E, [[cx + Math.cos(a) * w * 0.5, top + 50 + Math.sin(a) * 55], [cx + Math.cos(a) * w * 0.62, top + 46 + Math.sin(a) * 66]], 2);
  blob(E, arch, '#140e0b', 3, false);
  // stacked skulls and long bones
  for (let r = 0; r < 4; r++) { const y = bot - 12 - r * 22; for (let k = -2; k <= 2; k++) { const x = cx + k * 21 + (r % 2) * 10; if (Math.abs(x - cx) < w / 2 - 12 && (r < 3 || Math.abs(k) < 2)) skull(E, x, y, 0.95 + rr(-0.1, 0.1), pick(['#b9ab8e', '#a99a7e', '#c4b697']), rr(-0.15, 0.15)); } }
  for (let i = 0; i < 4; i++) bone(E, cx - 45, bot - 5 - i * 6 + rr(-2, 2), cx + 45, bot - 5 - i * 6 + rr(-2, 2), 5, '#a39477');
  hatch(E, [arch], [cx - w / 2, top - 10, cx + w / 2, bot], 0.75, 4, 1, { alpha: 0.9 });
  hatch(E, [arch, half(cx - w / 2, top - 10, cx + w / 2, top + 80)], [cx - w / 2, top - 10, cx + w / 2, bot], -0.75, 4, 1, { alpha: 0.9 });
  blob(E, [[cx - w / 2 - 8, bot], [cx + w / 2 + 8, bot], [cx + w / 2 + 12, bot + 12], [cx - w / 2 - 12, bot + 12]], '#6b5c4d', 2.6, false);
}
[130, 335, 1585, 1790].forEach(niche);
// ---- great gate ----
{
  const x0 = 815, x1 = 1105, cx = 960, top = 55, spring = 175;
  const archPts = (k, dy = 0) => { const pts = [[cx - (cx - x0) * k, FLOOR + dy]]; const rx = (cx - x0) * k, ry = (spring - top) * k + 20 * (k - 1); for (let i = 0; i <= 20; i++) { const a = Math.PI + Math.PI * i / 20; let x = cx + Math.cos(a) * rx, y = spring + Math.sin(a) * ry; y -= Math.max(0, 1 - Math.abs(x - cx) / rx) * 25 * k; pts.push([x, y]); } pts.push([cx + (cx - x0) * k, FLOOR + dy]); return pts; };
  const outer = archPts(1.2), inner = archPts(1.0);
  blob(E, outer, '#6e5e4e', 3.5, false);
  // voussoirs
  for (let i = 0; i <= 14; i++) { const a = Math.PI + Math.PI * i / 14; const r0 = (cx - x0), r1 = (cx - x0) * 1.2; const b0 = (spring - top), b1 = (spring - top) * 1.2 + 4; const f = (rx, ry) => { let x = cx + Math.cos(a) * rx, y = spring + Math.sin(a) * ry; y -= Math.max(0, 1 - Math.abs(x - cx) / rx) * 25 * rx / r0; return [x, y]; }; stroke(E, [f(r0, b0), f(r1, b1)], 2.4); }
  for (const s of [-1, 1]) for (let y = spring; y < FLOOR - 20; y += 34) stroke(E, [[cx + s * (cx - x0), y], [cx + s * (cx - x0) * 1.2, y]], 2.4);
  hatch(E, [outer], [x0 - 60, top - 40, x1 + 60, FLOOR], -0.8, 6, 1, { alpha: 0.5, dash: [8, 20], gap: [5, 25] });
  blob(E, inner, '#090605', 3.5, false);
  // tympanum with the Order's sun
  const tymp = inner.filter(p => p[1] <= spring + 2).concat([[x1, spring + 6], [x0, spring + 6]]);
  blob(E, [...inner.filter(p => p[1] <= spring + 2), [x1, spring + 8], [x0, spring + 8]], '#5c4e41', 3, false);
  sun(E, cx, spring - 45, 46, '#8c6b35', 12, 2.6);
  hatch(E, [tymp], [x0, top, x1, spring + 8], 0.5, 5, 1, { alpha: 0.55, dash: [5, 12], gap: [4, 18] });
  line(E, [[cx + 18, spring - 95], [cx + 26, spring - 60], [cx + 14, spring - 30], [cx + 30, spring + 4]], 2.2); // crack through the sun
  blob(E, [[x0 - 4, spring + 4], [x1 + 4, spring + 4], [x1 + 4, spring + 18], [x0 - 4, spring + 18]], '#6e5e4e', 3, false); // lintel
  // portcullis
  const gy0 = spring + 18;
  for (let y = gy0 + 25; y < FLOOR - 10; y += 46) { blob(E, [[x0 + 4, y], [x1 - 4, y], [x1 - 4, y + 8], [x0 + 4, y + 8]], '#3a3330', 2.4, false); }
  for (let x = x0 + 16; x < x1 - 8; x += 24) {
    const b = [[x - 4, gy0], [x + 4, gy0], [x + 4, FLOOR - 12], [x, FLOOR - 2], [x - 4, FLOOR - 12]];
    blob(E, b, '#3d3532', 2.4, false);
    E.save(); E.globalAlpha = 0.55; stroke(E, [[x - 1.5, gy0 + 4], [x - 1.5, FLOOR - 16]], 1.4, { col: '#9a8a78' }); E.restore();
    for (let k = 0; k < 4; k++) { E.save(); E.globalAlpha = 0.7; E.fillStyle = '#6e3b20'; path(E, ell(x + rr(-2, 2), rr(gy0, FLOOR - 20), 3, rr(3, 9), 8)); E.fill(); E.restore(); }
  }
  hatch(E, [half(x0, gy0, x1, FLOOR)], [x0, gy0, x1, FLOOR], 0.8, 4, 1, { alpha: 0.45, dash: [10, 30], gap: [10, 40] });
}
// ---- banners ----
function banner(cx) {
  const y0 = 70, y1 = 300, w = 46;
  stroke(E, [[cx - w - 14, y0], [cx + w + 14, y0]], 5, { taper: false });
  for (const s of [-1, 1]) blob(E, ell(cx + s * (w + 14), y0, 5, 5, 10), '#2e2826', 2);
  const pts = [[cx - w, y0], [cx + w, y0], [cx + w + 4, y1 - 30]];
  for (let i = 0; i <= 8; i++) { const x = cx + w - i * (2 * w / 8); pts.push([x + rr(-3, 3), y1 - (i % 2 ? rr(0, 28) : rr(-12, 4)) - (i === 4 ? 30 : 0)]); }
  pts.push([cx - w - 3, y1 - 26]);
  const b = blob(E, pts, '#5e1915', 3, false);
  hatch(E, [b], [cx - w, y0, cx + w, y1], Math.PI / 2, 9, 1.4, { alpha: 0.75, dash: [20, 70], gap: [10, 40], wob: 2 });
  hatch(E, [b, half(cx + w * 0.3, y0, cx + w + 6, y1)], [cx - w, y0, cx + w + 6, y1], 0.6, 4, 1, { alpha: 0.8 });
  E.save(); E.globalAlpha = 0.5; for (const x of [cx - w + 6, cx + w - 6]) stroke(E, [[x, y0 + 8], [x, y1 - 40]], 2, { col: '#a3803c' }); E.restore();
  sun(E, cx, y0 + 85, 26, '#a07a35', 12, 2.2);
  for (let i = 0; i < 3; i++) { const hx = cx + rr(-w * 0.6, w * 0.6), hy = rr(y0 + 30, y1 - 70); blob(E, ell(hx, hy, rr(3, 6), rr(4, 8), 10), '#0f0806', 1.5); }
}
banner(670); banner(1250);
// ---- wall shackles ----
function shackles(cx) { blob(E, ell(cx, 170, 7, 7, 10), '#2f2926', 2.4); chain(E, [[cx, 176], [cx - 18, 215], [cx - 26, 255]], 11, 1.8); chain(E, [[cx, 176], [cx + 16, 220], [cx + 20, 262]], 11, 1.8); for (const [x, y] of [[cx - 26, 268], [cx + 21, 274]]) { stroke(E, ell(x, y, 10, 7, 16), 4, { closed: true, col: '#3d3532' }); stroke(E, ell(x, y, 12, 9, 16), 1.6, { closed: true }); } E.save(); E.globalAlpha = 0.5; E.fillStyle = '#4a120f'; path(E, ell(cx - 2, 300, 22, 6, 16)); E.fill(); E.restore(); }
shackles(480); shackles(1440);
// ---- wall torches ----
function sconce(x, y) { blob(E, [[x - 10, y + 10], [x + 10, y + 10], [x + 6, y + 40], [x - 6, y + 40]], '#2f2926', 2.4, false); stroke(E, [[x, y + 40], [x, y + 64]], 4, { taper: false }); blob(E, ell(x, y + 66, 6, 4, 10), '#2f2926', 2); blob(E, [[x - 7, y - 2], [x + 7, y - 2], [x + 5, y + 14], [x - 5, y + 14]], '#4a2f1d', 2.4, false); flame(M, x, y - 2, 0.55); }
sconce(790, 205); sconce(1130, 205);

function rubble(x, y, n = 6) { for (let i = 0; i < n; i++) { const rx = x + rr(-40, 40), ry = y + rr(-12, 12), s = rr(5, 13); const p = []; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; p.push([rx + Math.cos(a) * s * rr(0.6, 1.1), ry + Math.sin(a) * s * 0.7 * rr(0.6, 1.1)]); } blob(E, p, pick(['#6e5e4c', '#5f5244', '#7a6955']), 2, false); hatch(E, [p, half(rx, ry - 20, rx + 20, ry + 20)], [rx - s, ry - s, rx + s, ry + s], 0.8, 3, 0.9, { alpha: 0.8 }); } }
// ---- floor flagstones (shared jittered row seams, irregular slabs) ----
{
  E.fillStyle = '#1c140f'; E.fillRect(0, FLOOR, W, H - FLOOR);
  const seams = [FLOOR]; while (seams[seams.length - 1] < H + 20) { const y = seams[seams.length - 1]; seams.push(y + rr(56, 74) + (y - FLOOR) / 745 * 18); }
  const sy = (b, x) => seams[b] + (b ? (noise(x / 90, b * 3.1) - 0.5) * 12 : 0);
  for (let b = 0; b < seams.length - 1; b++) {
    let x = -rr(0, 150);
    while (x < W) {
      const w = rr(110, 230), x1 = x + w, s0 = rr(-6, 6), s1 = rr(-6, 6);
      const top = [], bot = [];
      for (let k = 0; k <= 6; k++) { const xx = x + w * k / 6; top.push([xx + s0 * (1 - k / 6) + s1 * (k / 6) * 0, sy(b, xx)]); bot.push([xx, sy(b + 1, xx)]); }
      top[0][0] += s0 * 0.5; bot[0][0] -= s0 * 0.5; top[6][0] += s1 * 0.5; bot[6][0] -= s1 * 0.5;
      let pts = [...top, ...bot.reverse()];
      const y0 = seams[b], y1 = seams[b + 1];
      const edge = Math.min(x, W - x1) < 300 ? R() : 0, broken = R() < 0.07;
      const col = broken ? '#2a2019' : edge > 0.45 ? pick(['#4d5243', '#535846', '#484d3f']) : pick(['#6a5a49', '#625444', '#6f5e4b', '#5c4f42', '#66594c', '#6b5f50', '#574b3f', '#73624f']);
      blob(E, pts, col, 3.2, false);
      if (broken) { rubble(x + w / 2, (y0 + y1) / 2, 6); x = x1; continue; }
      E.save(); E.globalAlpha = 0.28; stroke(E, top.map(([a, c]) => [a, c + 5]).slice(1, 6), 2, { col: '#cdb99a' }); E.restore();
      E.save(); E.globalAlpha = 0.5; stroke(E, bot.map(([a, c]) => [a, c - 5]).slice(1, 6), 3.5, { col: '#251b15' }); E.restore();
      if (R() < 0.6) hatch(E, [pts, half(x + w * rr(0.45, 0.75), y0 - 10, x1 + 10, y1 + 10)], [x, y0 - 8, x1, y1 + 8], -0.85, 5, 1.1, { alpha: 0.8, dash: [6, 16], gap: [4, 22] });
      if (R() < 0.3) { const cx0 = x + rr(20, w - 20); line(E, [[cx0, y0 + 4], [cx0 + rr(-25, 25), (y0 + y1) / 2], [cx0 + rr(-30, 30), y1 - 4]], 1.6); if (R() < 0.5) line(E, [[cx0 + rr(-10, 10), (y0 + y1) / 2], [cx0 + rr(30, 60), (y0 + y1) / 2 + rr(-12, 12)]], 1.2); }
      if (R() < 0.35) { const cx0 = x + (R() < 0.5 ? 6 : w - 30), cy0 = R() < 0.5 ? y0 + 4 : y1 - 18; blob(E, [[cx0, cy0], [cx0 + rr(14, 26), cy0 + rr(-2, 2)], [cx0 + rr(4, 12), cy0 + rr(10, 16)]], '#2a2019', 1.6, false); }
      for (let k = 0; k < 7; k++) { E.fillStyle = 'rgba(20,12,9,0.55)'; E.fillRect(x + rr(8, w - 8), rr(y0 + 6, y1 - 6), 1.8, 1.8); }
      x = x1;
    }
  }
  // moss creeping in the seams near the walls
  for (let i = 0; i < 160; i++) { const x = R() < 0.5 ? rr(0, 420) : rr(1500, W), b = Math.floor(rr(0, seams.length - 1)); E.save(); E.globalAlpha = 0.55; stroke(E, [[x, sy(b, x)], [x + rr(10, 40), sy(b, x + 20)]], rr(2, 4), { col: '#3e4a35' }); E.restore(); }
  hatch(E, [half(0, FLOOR, W, FLOOR + 34)], [0, FLOOR, W, FLOOR + 34], 0.85, 4, 1.2, { alpha: 0.85 });
  E.save(); E.globalAlpha = 0.6; E.fillStyle = '#0d0907'; E.fillRect(0, FLOOR, W, 12); E.restore();
}
// ---- ritual circle ----
const RC = { x: 960, y: 690, rx: 370, ry: 225 };
{
  const { x, y, rx, ry } = RC;
  // groove rings
  for (const k of [1, 0.93, 0.74, 0.69]) stroke(E, ell(x, y, rx * k, ry * k, 90), k === 1 || k === 0.74 ? 3 : 2, { closed: true, jit: 1.5 });
  E.save(); path(E, ell(x, y, rx, ry, 90)); path(E, ell(x, y, rx * 0.93, ry * 0.93, 90)); E.restore();
  hatch(E, [ell(x, y, rx, ry, 90)], [x - rx, y - ry, x + rx, y + ry], 0.4, 3.5, 1, { alpha: 0 });
  // dark grooves between double rings (clip ring = outer minus inner via evenodd)
  for (const [a, b] of [[1, 0.93], [0.74, 0.69]]) { E.save(); E.beginPath(); for (const k of [a, b]) { const e = ell(x, y, rx * k, ry * k, 90); E.moveTo(e[0][0], e[0][1]); e.forEach(p => E.lineTo(p[0], p[1])); E.closePath(); } E.fillStyle = 'rgba(30,14,10,0.85)'; E.fill('evenodd'); E.restore(); }
  // runes between rings
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, rm = 0.835; const cxr = x + Math.cos(a) * rx * rm, cyr = y + Math.sin(a) * ry * rm;
    const t = i % 4; E.save(); E.translate(cxr, cyr); E.scale(1, 0.7);
    if (t === 0) { stroke(E, ell(0, 0, 8, 8, 12), 2, { closed: true }); stroke(E, [[0, -14], [0, 14]], 2); }
    else if (t === 1) { stroke(E, [[-9, -9], [9, 9]], 2); stroke(E, [[9, -9], [-9, 9]], 2); stroke(E, [[0, -12], [0, -4]], 2); }
    else if (t === 2) { stroke(E, [[-8, 10], [0, -12], [8, 10]], 2.2); stroke(E, [[-5, 2], [5, 2]], 1.6); }
    else { stroke(E, ell(0, 0, 4, 4, 8), 2, { closed: true }); for (let k = 0; k < 4; k++) { const b = k * Math.PI / 2; stroke(E, [[Math.cos(b) * 7, Math.sin(b) * 7], [Math.cos(b) * 13, Math.sin(b) * 13]], 1.6); } }
    E.restore();
  }
  // sun rays as blood channels from the inner ring to the drain
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + 0.13; const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 0.15, r1 = i % 2 ? 0.52 : 0.68, wd = 0.06;
    const pa = [x + Math.cos(a - wd) * rx * r0, y + Math.sin(a - wd) * ry * r0], pb = [x + ca * rx * r1, y + sa * ry * r1], pc = [x + Math.cos(a + wd) * rx * r0, y + Math.sin(a + wd) * ry * r0];
    blob(E, [pa, pb, pc], '#7f6236', 2.6, false); // tarnished brass inlay
    const ch = [[x + Math.cos(a - 0.025) * rx * r0, y + Math.sin(a - 0.025) * ry * r0], [x + ca * rx * r1 * 0.92, y + sa * ry * r1 * 0.92], [x + Math.cos(a + 0.025) * rx * r0, y + Math.sin(a + 0.025) * ry * r0]];
    blob(E, ch, '#4a0f0d', 1.4, false);
    E.save(); E.globalAlpha = 0.5; stroke(E, [pa, pb], 1.6, { col: '#5b8a72' }); E.restore(); // verdigris edge
  }
  // dried blood pools (noise-edged blobs)
  const pool = (px, py, r, sx = 1, sy = 0.6, col = '#4f0f0d') => { const pts = []; const o = R() * 50; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; const k = 0.55 + 0.75 * fbm(o + Math.cos(a) * 1.3, o + Math.sin(a) * 1.3, 3); pts.push([px + Math.cos(a) * r * k * sx, py + Math.sin(a) * r * k * sy]); } E.save(); E.globalAlpha = 0.88; blob(E, pts, col, 0); E.restore(); stroke(E, smooth(pts, true, 3), 1.8, { closed: true, col: '#25070a' }); E.save(); E.globalAlpha = 0.35; stroke(E, smooth(pts.slice(3, 12), false, 3).map(([a, b]) => [a + (px - a) * 0.15, b + (py - b) * 0.15]), 2, { col: '#a33a2c' }); E.restore(); };
  pool(x + 10, y + 8, 120, 1.25, 0.6, '#4a0c0b');
  pool(x - 160, y + 60, 60, 1.2, 0.5, '#360908');
  pool(x + 190, y - 40, 48, 1.3, 0.55, '#3b0a09');
  pool(x - 60, y + 170, 40, 1.6, 0.5, '#360908');
  // drag smear toward the left sarcophagus
  for (let k = 0; k < 6; k++) { E.save(); E.globalAlpha = 0.4; line(E, [[x - 120, y + 20 + k * 6], [x - 260, y - 30 + k * 7], [x - 420, y - 90 + k * 6], [x - 560, y - 120 + k * 5]], rr(3, 7), { col: '#350a08', jit: 2 }); E.restore(); }
  for (let i = 0; i < 90; i++) { const a = rr(0, 6.28), d = rr(0.3, 1.25); E.fillStyle = pick(['#360908', '#43100d', '#2a0707']); path(E, ell(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, rr(1.5, 6), rr(1, 3.5), 8)); E.fill(); }
  // central drain grate
  blob(E, ell(x, y, 62, 38, 30), '#3b3430', 3.5);
  E.save(); path(E, ell(x, y, 54, 32, 30)); E.clip(); E.fillStyle = '#080505'; E.fill();
  for (let gx = x - 60; gx < x + 60; gx += 13) { E.fillStyle = '#3e3633'; E.fillRect(gx, y - 40, 5, 80); stroke(E, [[gx, y - 40], [gx, y + 40]], 1.5); stroke(E, [[gx + 5, y - 40], [gx + 5, y + 40]], 1.5); }
  E.fillStyle = '#3e3633'; E.fillRect(x - 60, y - 3, 120, 6); E.restore();
  stroke(E, ell(x, y, 54, 32, 30), 2.5, { closed: true });
  // anchor rings + floor chains with open shackles
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const ax = x + Math.cos(a) * rx * 0.6, ay = y + Math.sin(a) * ry * 0.6;
    blob(E, ell(ax, ay, 12, 8, 14), '#2b2522', 2.6); stroke(E, ell(ax, ay + 4, 14, 10, 16), 4, { closed: true, col: '#47403b' }); stroke(E, ell(ax, ay + 4, 16, 12, 16), 1.6, { closed: true });
    const ex = ax + Math.cos(a + 2.4) * 70, ey = ay + Math.sin(a + 2.4) * 40;
    chain(E, [[ax, ay + 10], [(ax + ex) / 2 + rr(-15, 15), (ay + ey) / 2 + 14], [ex, ey]], 12, 1.8, '#3d3633');
    stroke(E, ell(ex + 8, ey + 4, 11, 7, 14, 0.4, 5.6), 4.5, { col: '#47403b' }); stroke(E, ell(ex + 8, ey + 4, 13, 9, 14, 0.4, 5.6), 1.4);
  }
}
for (let i = 0; i < 260; i++) { const x = rr(0, W), y = rr(40, H), r = rr(10, 60); const pts = []; const o = R() * 99; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; pts.push([x + Math.cos(a) * r * (0.5 + fbm(o + Math.cos(a), o + Math.sin(a), 2)), y + Math.sin(a) * r * 0.6 * (0.5 + fbm(o + Math.cos(a), o + Math.sin(a), 2))]); } E.save(); E.globalAlpha = rr(0.08, 0.22); blob(E, pts, pick(['#1a120c', '#2a1d12', '#1c2016']), 0); E.restore(); }
// ---- floor debris: bones, skulls, rubble, candles ----
function candles(x, y, n) { for (let i = 0; i < n; i++) { const cx = x + rr(-30, 30), h = rr(14, 34), cy = y + rr(-8, 10); blob(E, ell(cx, cy, 9, 4, 12), '#bfb08f', 1.6); blob(E, [[cx - 5, cy], [cx - 5, cy - h], [cx + 5, cy - h], [cx + 5, cy]], '#d4c6a6', 2, false); E.save(); E.globalAlpha = 0.5; stroke(E, [[cx + 2, cy - h + 3], [cx + 2, cy - 3]], 2.2, { col: '#8f8268' }); E.restore(); stroke(E, ell(cx, cy - h, 5, 2, 10), 1.3, { closed: true }); flame(M, cx, cy - h - 1, 0.18); } }
// bones near the wall and around
[[560, 380], [1300, 400], [760, 960], [1240, 990], [430, 700], [1500, 820]].forEach(([x, y]) => { for (let i = 0; i < 3; i++) bone(E, x + rr(-30, 10), y + rr(-10, 10), x + rr(10, 40), y + rr(-14, 14), 5); skull(E, x + rr(-20, 20), y + rr(-6, 6), 1.1, '#bcae8f', rr(-0.5, 0.5)); });
candles(335, 352, 4); candles(1585, 352, 4); rubble(1420, 990, 7); rubble(520, 1000, 5); rubble(1720, 470, 6);

// ================= depth-sorted objects =================
const objs = [];
// pillar
objs.push(...[[560, 470], [1360, 470]].map(([x, y]) => ({ y, d: () => pillar(x, y) })));
function pillar(bx, by) {
  shadow(E, bx + 30, by + 8, 110, 30, 0.55);
  // plinth
  const pw = 78, ph = 34, pd = 26;
  const front = [[bx - pw, by - ph], [bx + pw, by - ph], [bx + pw, by], [bx - pw, by]];
  blob(E, front, '#5d4f42', 3, false);
  hatch(E, [front], [bx - pw, by - ph, bx + pw, by], -0.9, 4, 1.1, { alpha: 0.8 });
  const top = [[bx - pw + 8, by - ph - pd], [bx + pw - 8, by - ph - pd], [bx + pw, by - ph], [bx - pw, by - ph]];
  blob(E, top, '#7a6a57', 3, false);
  // shaft (drawn upward past the top edge of the screen)
  const sw = 48, sb = by - ph - pd / 2, st = -40;
  const shaft = [[bx - sw, sb], [bx - sw + 2, st], [bx + sw - 2, st], [bx + sw, sb]];
  const g = E.createLinearGradient(bx - sw, 0, bx + sw, 0); g.addColorStop(0, '#3a3029'); g.addColorStop(0.35, '#6e5e4d'); g.addColorStop(0.55, '#7d6b58'); g.addColorStop(1, '#3d3229');
  path(E, shaft); E.fillStyle = g; E.fill();
  for (let k = -3; k <= 3; k++) { const fx = bx + k * sw / 3.6; E.save(); E.globalAlpha = 0.7; stroke(E, [[fx, sb - 6], [fx + rr(-1, 1), st]], 1.4, { seg: 14 }); E.restore(); }
  hatch(E, [shaft, half(bx - sw - 2, st, bx - sw * 0.35, sb)], [bx - sw, st, bx + sw, sb], 0.25, 5, 1.2, { alpha: 0.85, dash: [20, 60], gap: [3, 12] });
  hatch(E, [shaft, half(bx + sw * 0.45, st, bx + sw + 2, sb)], [bx - sw, st, bx + sw, sb], -0.25, 4.5, 1.2, { alpha: 0.9, dash: [20, 60], gap: [3, 12] });
  hatch(E, [shaft, half(bx + sw * 0.75, st, bx + sw + 2, sb)], [bx - sw, st, bx + sw, sb], 0.6, 4, 1.1, { alpha: 0.9 });
  stroke(E, [[bx - sw, sb], [bx - sw + 2, st]], 3.4, { seg: 10, taper: false }); stroke(E, [[bx + sw, sb], [bx + sw - 2, st]], 3.4, { seg: 10, taper: false });
  // torus moulding
  blob(E, ell(bx, sb - 4, sw + 10, 13, 24, 0, Math.PI).concat([[bx - sw - 10, sb - 14], [bx + sw + 10, sb - 14]].reverse()), '#6a5b4b', 3, false);
  stroke(E, ell(bx, sb - 14, sw + 10, 9, 24, 0, Math.PI), 2);
  // crack and moss
  line(E, [[bx + 10, 120], [bx + 2, 180], [bx + 16, 240], [bx + 6, 300]], 2);
  for (let i = 0; i < 10; i++) { E.save(); E.globalAlpha = 0.55; line(E, [[bx + rr(-sw, sw), sb - 10], [bx + rr(-sw, sw), sb - rr(20, 60)]], rr(2, 5), { col: '#3f4c37' }); E.restore(); }
}
// hanging gibbet cage (floor shadow tells its height)
objs.push({ y: 300, d: () => { const cx = 1490; E.save(); E.globalAlpha = 0.45; E.fillStyle = '#0b0605'; path(E, ell(cx + 10, 610, 50, 18, 20)); E.fill(); E.restore(); chain(E, [[cx, -10], [cx, 150]], 14, 2, '#3a3431'); blob(E, ell(cx, 160, 10, 6, 12), '#2f2926', 2); const top = 172, bot = 320; blob(E, ell(cx, bot, 46, 14, 24), '#2b2522', 2.6); skull(E, cx - 6, bot - 18, 1.2, '#b4a689', 0.3); bone(E, cx - 30, bot - 8, cx + 20, bot - 28, 5); bone(E, cx - 10, bot - 6, cx + 30, bot - 10, 4); for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; const x = cx - Math.cos(a) * 46; stroke(E, [[cx - Math.cos(a) * 20, top], [x, top + 30], [x, bot + Math.sin(a) * 14]], 2.6, { col: '#2f2926', taper: false }); stroke(E, [[x - 1.5, top + 30], [x - 1.5, bot]], 1, { col: INK }); } blob(E, ell(cx, top + 30, 46, 12, 24), null, 2.8); stroke(E, ell(cx, top, 20, 6, 16), 2.6, { closed: true }); } });
// sarcophagi
function sarcophagus(cx, by, w, d, h, opts = {}) {
  shadow(E, cx + 14, by + 6, w * 0.6, 22, 0.6);
  const front = [[cx - w / 2, by - h], [cx + w / 2, by - h], [cx + w / 2, by], [cx - w / 2, by]];
  blob(E, front, '#55483c', 3.2, false);
  // carved front: sun + quatrefoils
  sun(E, cx, by - h / 2, h * 0.32, '#6a5945', 10, 1.8);
  for (const s of [-1, 1]) { const qx = cx + s * w * 0.3, qy = by - h / 2; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; stroke(E, ell(qx + Math.cos(a) * 6, qy + Math.sin(a) * 6, 6, 6, 10), 1.5, { closed: true }); } }
  hatch(E, [front], [cx - w / 2, by - h, cx + w / 2, by], -0.85, 4.5, 1.1, { alpha: 0.8 });
  hatch(E, [front, half(cx + w * 0.2, by - h, cx + w / 2, by)], [cx - w / 2, by - h, cx + w / 2, by], 0.85, 4.5, 1.1, { alpha: 0.85 });
  const top = [[cx - w / 2 - 6, by - h - d], [cx + w / 2 + 6, by - h - d], [cx + w / 2 + 6, by - h + 2], [cx - w / 2 - 6, by - h + 2]];
  if (opts.open) {
    const inner = [[cx - w / 2 + 6, by - h - d + 6], [cx + w / 2 - 6, by - h - d + 6], [cx + w / 2 - 6, by - h - 4], [cx - w / 2 + 6, by - h - 4]];
    blob(E, [[cx - w / 2, by - h - d], [cx + w / 2, by - h - d], [cx + w / 2, by - h], [cx - w / 2, by - h]], '#6f5f4e', 3, false);
    blob(E, inner, '#120c09', 2.6, false);
    hatch(E, [inner], bbox(inner), 0.8, 3.5, 1, { alpha: 0.9 });
    skull(E, cx - w / 2 + 30, by - h - d / 2, 1.1, '#a89a7d', -1.2); bone(E, cx - w / 2 + 45, by - h - d / 2 - 6, cx - 10, by - h - d / 2 + 4, 5, '#9c8e72');
    // lid slid aside, cracked
    E.save(); E.translate(cx + w * 0.47, by - h - d / 2 + 2); E.rotate(0.07);
    const lid = [[-w / 2, -d / 2 - 4], [w / 2 - 20, -d / 2 - 4], [w / 2 - 34, 0], [w / 2 - 22, d / 2 + 2], [-w / 2, d / 2 + 2]];
    blob(E, [[-w / 2, d / 2 + 2], [w / 2 - 22, d / 2 + 2], [w / 2 - 22, d / 2 + 16], [-w / 2, d / 2 + 16]], '#55483c', 3, false);
    hatch(E, [[[-w / 2, d / 2 + 2], [w / 2 - 22, d / 2 + 2], [w / 2 - 22, d / 2 + 16], [-w / 2, d / 2 + 16]]], [-w / 2, d / 2, w / 2, d / 2 + 16], -0.8, 3.5, 1, { alpha: 0.9 });
    blob(E, lid, '#7d6c58', 3, false);
    effigy(0 - 20, 0, w * 0.7, d * 0.7);
    E.restore();
    // broken lid chunk on the floor
    const ch = [[cx + w / 2 + 30, by + 4], [cx + w / 2 + 80, by - 6], [cx + w / 2 + 96, by + 18], [cx + w / 2 + 40, by + 26]];
    blob(E, ch, '#6e5e4c', 2.6, false); hatch(E, [ch], bbox(ch), -0.8, 3.5, 1, { alpha: 0.8 });
  } else {
    blob(E, top, '#7d6c58', 3.2, false);
    E.save(); E.globalAlpha = 0.35; stroke(E, [[cx - w / 2, by - h - d + 4], [cx + w / 2, by - h - d + 4]], 2, { col: '#d6c4a4' }); E.restore();
    E.save(); E.translate(cx, by - h - d / 2); effigy(0, 0, w * 0.82, d * 0.72); E.restore();
  }
  function effigy(x, y, ew, ed) {
    // carved knight lying in state, head to the left
    const hx = x - ew / 2 + 12;
    blob(E, ell(hx, y, 11, 9, 14), '#8e7c66', 2.2);
    blob(E, [[hx + 10, y - ed / 2 + 2], [x + ew / 2 - 20, y - ed / 2 + 6], [x + ew / 2, y - 4], [x + ew / 2, y + 4], [x + ew / 2 - 20, y + ed / 2 - 6], [hx + 10, y + ed / 2 - 2]], '#8a7862', 2.2);
    stroke(E, [[hx + 18, y], [x + ew / 2 - 8, y]], 2.4); stroke(E, [[hx + 34, y - 9], [hx + 34, y + 9]], 2.2); // sword
    blob(E, ell(hx + 46, y, 7, 6, 10), '#9a8771', 1.6); // hands
    hatch(E, [[[hx + 10, y + 2], [x + ew / 2, y + 2], [x + ew / 2, y + ed / 2], [hx + 10, y + ed / 2]]], [hx, y, x + ew / 2, y + ed / 2], 0.3, 3.5, 0.9, { alpha: 0.7 });
  }
}
objs.push({ y: 610, d: () => { sarcophagus(380, 610, 230, 60, 46, { open: true }); candles(300, 650, 3); } });
objs.push({ y: 565, d: () => { sarcophagus(1600, 565, 240, 62, 48); candles(1700, 612, 4); } });
objs.push({ y: 860, d: () => sarcophagus(210, 860, 230, 60, 46) });
// fallen column drum, front right
objs.push({ y: 950, d: () => { const x = 1620, y = 950; shadow(E, x + 10, y + 6, 130, 22, 0.55); const body = [[x - 110, y - 52], [x + 90, y - 62], [x + 96, y - 4], [x - 104, y + 4]]; blob(E, body, '#655646', 3.2, false); for (let k = 1; k < 6; k++) { E.save(); E.globalAlpha = 0.6; stroke(E, [[x - 108 + k * 33, y - 54 - k * 1.6], [x - 104 + k * 33, y + 3 - k * 1.3]], 1.4); E.restore(); } hatch(E, [body, half(x - 120, y - 25, x + 110, y + 10)], bbox(body), -0.2, 4, 1.1, { alpha: 0.85 }); blob(E, ell(x + 93, y - 33, 18, 30, 20), '#857360', 3); stroke(E, ell(x + 93, y - 33, 8, 14, 14), 1.4, { closed: true }); line(E, [[x - 40, y - 56], [x - 30, y - 30], [x - 46, y]], 1.8); } });
// braziers
function brazier(x, y) {
  shadow(E, x + 6, y + 4, 44, 14, 0.6);
  for (const [dx, dy] of [[-30, 2], [30, 2], [4, 10]]) { stroke(E, [[x + dx * 0.4, y - 52], [x + dx, y + dy]], 6, { col: '#2b2522', taper: false }); stroke(E, [[x + dx * 0.4 - 3, y - 52], [x + dx - 3, y + dy]], 1.5); stroke(E, [[x + dx * 0.4 + 3, y - 52], [x + dx + 3, y + dy]], 1.5); }
  const bowl = [...ell(x, y - 70, 44, 14, 20, 0, Math.PI), [x - 30, y - 50], [x + 30, y - 50]].reverse();
  const bw = [[x - 46, y - 72], [x + 46, y - 72], [x + 32, y - 46], [x, y - 40], [x - 32, y - 46]];
  blob(E, bw, '#3e4a3a', 3.2); E.save(); E.globalAlpha = 0.7; stroke(E, [[x - 40, y - 66], [x - 26, y - 48]], 2.4, { col: '#79a088' }); E.restore();
  hatch(E, [smooth(bw, true, 5), half(x + 5, y - 80, x + 50, y - 38)], [x - 46, y - 80, x + 46, y - 38], 0.7, 3.5, 1, { alpha: 0.9 });
  sun(E, x, y - 58, 8, '#6d5530', 8, 1.4);
  blob(E, ell(x, y - 72, 46, 12, 24), '#1b1210', 3);
  M.save(); path(M, ell(x, y - 72, 40, 9, 20)); M.fillStyle = '#c4501e'; M.fill(); for (let i = 0; i < 14; i++) { M.fillStyle = pick(['#f2a53c', '#7a2410', '#ffd27a']); path(M, ell(x + rr(-34, 34), y - 72 + rr(-5, 5), rr(3, 7), rr(2, 3), 8)); M.fill(); } M.restore();
  flame(M, x - 12, y - 74, 1.0); flame(M, x + 14, y - 74, 0.85); flame(M, x, y - 76, 1.25);
}
objs.push({ y: 560, d: () => brazier(650, 560) });
objs.push({ y: 561, d: () => brazier(1270, 561) });

// ================= CHARACTERS =================
const HERO = { x: 960, y: 905 }, G = [{ x: 900, y: 615, dir: 1 }, { x: 1185, y: 740, dir: -1 }, { x: 690, y: 805, dir: 1 }], XB = { x: 1470, y: 668 };
const SC = 1.18;
const braz = [[650, 560], [1270, 561]];
function charShadow(x, y, rx) {
  shadow(E, x, y, rx, rx * 0.3, 0.6);
  // long hard ink shadows cast by the braziers
  for (const [bx, by] of braz) { const dx = x - bx, dy = (y - by), d = Math.hypot(dx, dy); if (d > 700) continue; const ux = dx / d, uy = dy / d, len = 70 + d * 0.25, a = 0.5 * (1 - d / 700); const px = -uy * rx * 0.55, py = ux * rx * 0.55 * 0.6; const tip = [x + ux * len, y + uy * len * 0.55]; const sh = [[x + px, y + py], [tip[0] + px * 0.5, tip[1] + py * 0.5], [tip[0] - px * 0.5, tip[1] - py * 0.5], [x - px, y - py]]; E.save(); E.globalAlpha = a; E.fillStyle = '#0b0605'; blob(E, sh, '#0b0605', 0); E.restore(); hatch(E, [smooth(sh, true, 4)], bbox(sh), 0.5, 4, 1.1, { alpha: a * 1.3 }); }
}
function hero(c, m, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  // scarf tails streaming behind
  const t1 = [[10, -146], [36, -152], [62, -166], [90, -154], [118, -166], [110, -150], [122, -140], [96, -138], [70, -144], [44, -132], [14, -134]];
  const p1 = blob(c, t1, '#5c2c7a', 2.8); hatch(c, [p1, half(0, -146, 160, -120)], [0, -170, 160, -120], 0.6, 3.5, 1, { alpha: 0.85 });
  const t2 = [[12, -136], [40, -126], [64, -130], [86, -118], [100, -124], [92, -106], [66, -112], [42, -112], [14, -126]];
  const p2 = blob(c, t2, '#45205e', 2.6); hatch(c, [p2], [10, -132, 125, -100], 0.6, 3.2, 1, { alpha: 0.9 });
  // coat back / lining
  const back = [[-28, -138], [26, -138], [34, -100], [44, -54], [64, -10], [48, -14], [38, -2], [22, -10], [-14, -8], [-28, -2], [-38, -12], [-54, -6], [-42, -54], [-32, -100]];
  blob(c, back, '#2e1830', 3.4, false);
  // legs & boots
  for (const [hx, fx] of [[-8, -13], [8, 13]]) { const lg = [[hx - 6, -86], [hx + 6, -86], [fx + 5, -16], [fx + 9, -2], [fx - 8, -2], [fx - 5, -16]]; blob(c, lg, '#1b1720', 2.6, false); blob(c, [[fx - 7, -18], [fx + 6, -18], [fx + 10, -2], [fx - 9, -2]], '#100c10', 2.4, false); c.save(); c.globalAlpha = 0.6; stroke(c, [[fx - 4, -14], [fx - 5, -4]], 1.4, { col: '#6a6070' }); c.restore(); }
  // front coat panels
  const fl = [[-28, -138], [-4, -132], [-6, -94], [-12, -52], [-16, -14], [-28, -2], [-38, -12], [-54, -6], [-42, -54], [-32, -100]];
  const fr = [[26, -138], [4, -132], [6, -94], [14, -52], [20, -12], [38, -2], [48, -14], [64, -10], [44, -54], [34, -100]];
  const pl = blob(c, fl, '#221e29', 3.4, false), pr = blob(c, fr, '#221e29', 3.4, false);
  c.save(); path(c, pr); c.clip(); c.globalAlpha = 0.85; c.fillStyle = INK; path(c, [[22, -140], [80, -140], [80, 0], [30, 0], [16, -60]]); c.fill(); c.restore(); hatch(c, [pr], bbox(pr), 0.95, 4, 1.15, { alpha: 0.9 }); hatch(c, [pr, half(24, -140, 70, 0)], bbox(pr), -0.5, 4, 1.1, { alpha: 0.9 });
  hatch(c, [pl, half(-60, -60, 0, 0)], bbox(pl), 0.95, 5, 1.1, { alpha: 0.7, dash: [8, 30], gap: [4, 14] });
  c.save(); c.globalAlpha = 0.9; line(c, [[-30, -132], [-34, -100], [-42, -56], [-52, -10]], 2.6, { col: '#7d7088' }); line(c, [[-8, -128], [-9, -96], [-14, -52]], 1.6, { col: '#5d5468' }); c.restore();
  // vest
  const vest = [[-4, -132], [4, -132], [6, -94], [-6, -94]]; blob(c, vest, '#3c1519', 2.4, false); for (let i = 0; i < 4; i++) blob(c, ell(0, -126 + i * 9, 1.8, 1.8, 6), '#9a8460', 1);
  blob(c, [[-16, -96], [16, -96], [17, -88], [-17, -88]], '#151116', 2.2, false); blob(c, [[-4, -97], [4, -97], [4, -87], [-4, -87]], '#8a7550', 1.4, false);
  // hanging arm (screen right)
  const ra = [[22, -136], [34, -122], [40, -96], [44, -78], [32, -76], [28, -96], [20, -116]];
  const rp = blob(c, ra, '#25202c', 3); hatch(c, [rp], bbox(rp), 0.8, 3.5, 1, { alpha: 0.9 });
  blob(c, [[32, -78], [44, -78], [45, -70], [36, -68]], '#d3c7af', 2.2);
  for (const k of [0, 4, 8, 12]) { const cl = [[34 + k * 0.6, -70], [35 + k * 0.9, -56], [31 + k, -40]]; line(c, cl, 4.2); line(c, cl, 1.8, { col: '#e6dcc4', jit: 0.3 }); }
  // reaching arm (screen left) with spread claws
  const la = [[-22, -136], [-44, -126], [-66, -118], [-80, -116], [-80, -104], [-64, -104], [-42, -110], [-24, -116]];
  const lp = blob(c, la, '#221e29', 3); hatch(c, [lp, half(-90, -112, -20, -95)], bbox(lp), 0.8, 3.5, 1, { alpha: 0.85 });
  c.save(); c.globalAlpha = 0.8; line(c, [[-30, -134], [-60, -122], [-78, -118]], 2, { col: '#7d7088' }); c.restore();
  blob(c, [[-80, -116], [-90, -117], [-94, -110], [-90, -103], [-80, -103]], '#d8ccb4', 2.2);
  for (const [ax, ay] of [[-124, -130], [-130, -116], [-128, -102], [-118, -90]]) { const cl = [[-90, -110], [(-90 + ax) / 2, (-110 + ay) / 2 - 4], [ax, ay]]; line(c, cl, 4.4); line(c, cl, 1.9, { col: '#e6dcc4', jit: 0.3 }); }
  // high flared collar
  blob(c, [[-20, -140], [-34, -176], [-26, -172], [-12, -150]], '#221e29', 2.8, false); blob(c, [[-22, -146], [-30, -168], [-14, -150]], '#4a2440', 0, false);
  blob(c, [[18, -140], [32, -178], [24, -174], [10, -150]], '#221e29', 2.8, false); blob(c, [[20, -146], [28, -170], [12, -150]], '#4a2440', 0, false);
  // scarf around the neck
  const sc = [[-16, -150], [16, -150], [18, -136], [6, -130], [-6, -130], [-18, -136]];
  const sp = blob(c, sc, '#6e3794', 3); c.save(); c.globalAlpha = 0.75; line(c, [[-12, -145], [10, -143]], 2.2, { col: '#b07ed0' }); c.restore(); hatch(c, [sp, half(2, -152, 22, -128)], bbox(sp), 0.7, 3, 1, { alpha: 0.85 });
  // head: gaunt face, long black hair swept back (drawn a bit large for readability)
  c.save(); c.translate(0, -146); c.scale(1.18, 1.18); c.translate(0, 146);
  const hair = [[-14, -168], [-10, -186], [4, -192], [17, -184], [24, -166], [30, -148], [36, -130], [22, -138], [14, -152]];
  blob(c, hair, '#141016', 3); c.save(); c.globalAlpha = 0.6; line(c, [[4, -188], [18, -176], [26, -156], [32, -138]], 1.3, { col: '#5a5260' }); c.restore();
  const face = [[-12, -180], [8, -182], [13, -170], [12, -158], [5, -146], [-1, -143], [-8, -150], [-13, -166]];
  const fp = blob(c, face, '#cfc2a8', 2.8);
  hatch(c, [fp, half(-16, -168, -3, -140)], [-16, -184, 14, -140], 0.9, 2.2, 0.9, { alpha: 0.95 }); hatch(c, [fp, half(-16, -158, 14, -140)], [-16, -184, 14, -140], -0.9, 2.6, 0.8, { alpha: 0.6 });
  hatch(c, [fp, half(-16, -174, 14, -169)], [-16, -184, 14, -140], 0.1, 2.2, 0.7, { alpha: 0.7 });
  line(c, [[-10, -160], [-6, -151]], 1.3); line(c, [[9, -160], [6, -151]], 1.3);
  c.save(); c.globalAlpha = 0.85; for (const ex of [-5, 5]) blob(c, ell(ex, -164, 5, 3.4, 10), '#2a1c1c', 0); c.restore();
  stroke(c, [[-5, -170], [-1, -168]], 1.6); stroke(c, [[3, -168], [8, -170]], 1.6); // brows
  stroke(c, [[-4, -149], [4, -150]], 1.3); blob(c, [[2, -150], [3.5, -150], [2.8, -146]], '#f2ead8', 0.6, false); // fang
  blob(c, [[-14, -178], [-2, -188], [12, -182], [2, -176], [-6, -172], [-13, -168]], '#141016', 2);
  blob(c, [[12, -168], [20, -176], [17, -160]], '#cfc3ab', 1.6, false);
  blob(c, [[-12, -178], [-17, -164], [-16, -146], [-11, -138], [-11, -156]], '#141016', 2);
  c.restore(); c.restore();
  m.save(); m.translate(x, y); m.scale(s, s); for (const ex of [-5, 5]) { m.fillStyle = '#ff2f52'; path(m, ell(ex * 1.18, -146 - 18 * 1.18, 3, 1.7, 8)); m.fill(); } m.restore();
}
function ghoul(c, m, x, y, dir, pose, s) {
  c.save(); c.translate(x, y); c.scale(dir * s, s);
  const skin = '#86866d', dark = '#55563f', hi = '#b9b597';
  // far limbs
  limb(c, [[-34, -56, 9], [-16, -36, 6], [-14, -33, 5], [-30, -12, 4], [-20, -2, 3]], dark, 2.8);
  limb(c, pose ? [[12, -82, 8], [36, -98, 5], [40, -98, 5], [64, -100, 4], [84, -90, 3.5]] : [[12, -80, 8], [26, -58, 5], [29, -54, 5], [40, -26, 3.5], [48, -4, 3.5]], dark, 2.8); if (pose) for (let k = -1; k <= 1; k++) line(c, [[84, -88], [94, -88 + k * 6], [104, -90 + k * 10]], 1.8); else for (let k = -1; k <= 1; k++) line(c, [[44, -4], [52 + k * 4, -2], [58 + k * 6, 1]], 1.6);
  // torso hunched forward, spine arched
  const tor = pose ? [[-44, -60], [-36, -80], [-16, -94], [6, -98], [26, -94], [40, -84], [38, -70], [20, -62], [-4, -56], [-26, -52]] : [[-42, -58], [-36, -80], [-20, -96], [0, -100], [18, -94], [30, -82], [28, -66], [12, -58], [-8, -52], [-28, -50]];
  const tp = blob(c, tor, skin, 3.6, false);
  hatch(c, [tp, half(-50, -72, 50, -40)], [-50, -104, 50, -40], 0.6, 3.6, 1.1, { alpha: 0.9 });
  hatch(c, [tp, half(-50, -64, 50, -40)], [-50, -104, 50, -40], -0.6, 3.6, 1.1, { alpha: 0.9 });
  c.save(); path(c, tp); c.clip(); c.globalAlpha = 0.8; c.fillStyle = INK; path(c, smooth([[-50, -58], [-10, -64], [40, -72], [50, -40], [-50, -40]], true, 4)); c.fill(); c.restore();
  for (let i = 0; i < 5; i++) line(c, [[-16 + i * 9, -88 + i * 1.5], [-12 + i * 9.5, -74], [-18 + i * 9.5, -60]], 1.5); // ribs
  for (let i = 0; i < 6; i++) blob(c, ell(-32 + i * 9.5, -80 - Math.sin(i / 5 * Math.PI) * 16, 3, 2.4, 6), skin, 1.6);
  c.save(); c.globalAlpha = 0.7; line(c, [[-34, -78], [-18, -94], [2, -98], [20, -92]], 2.2, { col: '#d6d1b0' }); c.restore();
  // loincloth rags
  const rag = [[-42, -58], [-14, -50], [8, -56], [4, -40], [-2, -30], [-6, -44], [-14, -24], [-20, -42], [-30, -26], [-34, -44]];
  const rp = blob(c, rag, '#3d3226', 2.6, false); hatch(c, [rp], bbox(rp), 1.2, 3.5, 1, { alpha: 0.85 });
  // near leg, crouched
  const lgp = limb(c, [[-22, -54, 12], [0, -36, 7], [2, -32, 6], [-12, -12, 4.5], [0, -2, 3.5]], skin, 3);
  c.save(); path(c, lgp); c.clip(); c.globalAlpha = 0.75; c.fillStyle = INK; c.fillRect(-40, -34, 50, 40); c.restore(); hatch(c, [lgp, half(-40, -30, 10, 0)], bbox(lgp), 0.8, 3.4, 1, { alpha: 0.85 });
  for (let k = -1; k <= 1; k++) line(c, [[-4, -2], [4 + k * 3, 0], [10 + k * 4, 2]], 1.5);
  // long near arm
  const fp = limb(c, pose ? [[18, -84, 10], [46, -98, 6], [50, -98, 6], [80, -100, 4.5], [104, -94, 4]] : [[16, -82, 10], [34, -58, 6], [37, -54, 6], [50, -28, 4.5], [58, -4, 4]], skin, 3); hatch(c, [fp, half(-10, pose ? -94 : -60, 120, 0)], [10, -110, 120, 0], 0.7, 3.4, 1, { alpha: 0.85 });
  if (pose) for (let k = -1; k <= 1.01; k += 0.66) line(c, [[104, -92], [116, -92 + k * 8], [130, -90 + k * 14]], 2.1); else for (let k = -1; k <= 1; k++) line(c, [[58, -4], [68 + k * 4, -2], [76 + k * 7, 2]], 2);
  // long-skulled head thrust forward on a thin neck
  const hx = pose ? 52 : 40, hy = pose ? -88 : -74;
  blob(c, [[22, -88], [hx - 6, hy - 6], [hx - 2, hy + 6], [24, -74]], dark, 2.4, false);
  const hd = [[hx - 10, hy - 6], [hx - 2, hy - 14], [hx + 14, hy - 14], [hx + 24, hy - 6], [hx + 26, hy + 4], [hx + 16, hy + 10], [hx + 2, hy + 10], [hx - 8, hy + 4]];
  const hp = blob(c, hd, '#a3a185', 3.2);
  hatch(c, [hp, half(hx - 12, hy + 2, hx + 30, hy + 14)], bbox(hp), -0.7, 2.8, 1, { alpha: 0.9 });
  const jaw = [[hx + 8, hy + 6], [hx + 26, hy + 2], [hx + 26, hy + 14], [hx + 12, hy + 18]]; blob(c, jaw, '#1a0d0b', 2.4, false);
  for (let i = 0; i < 4; i++) { stroke(c, [[hx + 12 + i * 4, hy + 5], [hx + 13 + i * 4, hy + 10]], 1.4, { col: '#dcd2b0' }); stroke(c, [[hx + 13 + i * 3.5, hy + 16], [hx + 14 + i * 3.5, hy + 12]], 1.2, { col: '#c8bd9c' }); }
  line(c, [[hx + 4, hy - 10], [hx + 18, hy - 7]], 2); blob(c, [[hx - 4, hy - 8], [hx - 8, hy - 18], [hx + 2, hy - 12]], '#a3a185', 1.4, false);
  blob(c, ell(hx + 12, hy - 3, 5, 3.6, 10), '#0e0706', 1.4); blob(c, ell(hx + 20, hy - 2, 3.6, 3, 10), '#0e0706', 1.4);
  c.restore();
  m.save(); m.translate(x, y); m.scale(dir * s, s); for (const [ex, ey, r] of [[hx + 12, hy - 3, 2.4], [hx + 20, hy - 2, 1.8]]) { m.fillStyle = '#eef6d4'; path(m, ell(ex, ey, r, r * 0.8, 8)); m.fill(); } m.restore();
  glowPts.push([x + dir * (hx + 16) * s, y + (hy - 3) * s, 'rgba(210,240,180,0.5)', 18]);
}
function crossbowman(c, m, x, y, s) {
  c.save(); c.translate(x, y); c.scale(-s, s);
  // short cloak behind
  const cl = [[-24, -128], [22, -128], [30, -60], [20, -48], [-26, -46], [-34, -62]]; blob(c, cl, '#3a2a22', 3, false);
  for (const sx of [-1, 1]) { const lg = [[sx * 3, -50], [sx * 15, -50], [sx * 16, -10], [sx * 20, -2], [sx * 3, -2], [sx * 5, -10]]; const p = blob(c, lg, '#3d3029', 2.6, false); hatch(c, [p], bbox(p), 0.7, 3.5, 1, { alpha: 0.6 }); blob(c, [[sx * 4, -14], [sx * 16, -14], [sx * 21, -2], [sx * 3, -2]], '#21180f', 2.2, false); }
  blob(c, [[-22, -124], [22, -124], [26, -86], [24, -46], [-24, -46], [-26, -86]], '#6b5a44', 3.2, false);
  const tab = [[-17, -126], [17, -126], [21, -48], [18, -30], [6, -36], [-2, -28], [-10, -36], [-19, -30], [-21, -48]];
  const tp = blob(c, tab, '#cdbf9c', 3.2, false);
  c.save(); path(c, tp); c.clip(); c.lineWidth = 8; c.strokeStyle = '#6e1a16'; path(c, tab); c.stroke(); c.restore(); stroke(c, tab, 3, { closed: true });
  sun(c, 0, -90, 15, '#bf8c30', 10, 1.8);
  hatch(c, [tp, half(6, -128, 30, -20)], [-24, -128, 30, -20], 0.8, 3.6, 1, { alpha: 0.85 });
  hatch(c, [tp, half(-30, -60, 30, -20)], [-24, -128, 30, -20], -0.8, 4, 1, { alpha: 0.6 });
  for (let i = 0; i < 4; i++) { c.fillStyle = '#4e1612'; path(c, ell(rr(-14, 14), rr(-72, -40), rr(2, 5), rr(2, 4), 8)); c.fill(); }
  blob(c, [[-22, -66], [22, -66], [22, -59], [-22, -59]], '#3b2a1c', 2.2, false); blob(c, [[-3, -68], [5, -68], [5, -57], [-3, -57]], '#8c7a52', 1.6, false);
  // arms + heavy crossbow aimed at the hero
  blob(c, [[16, -120], [34, -110], [48, -102], [46, -94], [30, -100], [14, -108]], '#5c4c39', 2.8);
  const stock = [[-8, -106], [72, -100], [74, -93], [-6, -97]]; blob(c, stock, '#5b3a22', 2.6, false);
  line(c, [[66, -126], [76, -110], [78, -96], [76, -82], [66, -68]], 6, { col: '#3a3431' }); line(c, [[66, -126], [76, -110], [78, -96], [76, -82], [66, -68]], 1.6);
  stroke(c, [[66, -125], [40, -101], [66, -69]], 1, { jit: 0.2 });
  stroke(c, [[40, -101], [94, -101]], 2.2, { taper: false }); blob(c, [[94, -104.5], [104, -101], [94, -97.5]], '#a7acb0', 1.2, false);
  blob(c, [[-18, -120], [-4, -108], [6, -102], [2, -96], [-8, -102], [-22, -112]], '#5c4c39', 2.8);
  blob(c, ell(42, -96, 5, 4, 8), '#c99d7c', 1.6); blob(c, ell(4, -100, 5, 4, 8), '#c99d7c', 1.6);
  // kettle helmet, face in shade under the brim
  const fc = [[-10, -142], [10, -142], [12, -127], [-10, -127]]; blob(c, fc, '#b88864', 2.4, false); hatch(c, [fc], [-12, -144, 14, -125], 0.8, 2.5, 0.9, { alpha: 0.9 });
  blob(c, ell(0, -144, 28, 7.5, 22), '#5f5a54', 3);
  const dome = [[-15, -144], [-14, -158], [-6, -167], [6, -167], [14, -158], [15, -144]]; blob(c, dome, '#6a645d', 3);
  c.save(); c.globalAlpha = 0.75; line(c, [[-8, -161], [-11, -148]], 2.2, { col: '#cfc8bb' }); c.restore(); stroke(c, [[0, -167], [0, -145]], 1.4);
  hatch(c, [ell(0, -144, 28, 7.5, 22), half(0, -152, 30, -130)], [-28, -152, 28, -136], 0.8, 3, 1, { alpha: 0.9 });
  c.restore();
}
const glowPts = [];
objs.push({ y: HERO.y, d: () => { charShadow(HERO.x, HERO.y + 2, 46); hero(C, M, HERO.x, HERO.y, SC); } });
G.forEach((g, i) => objs.push({ y: g.y, d: () => { charShadow(g.x + g.dir * 12, g.y + 2, 56); ghoul(C, M, g.x, g.y, g.dir, i === 2 ? 1 : 0, SC); } }));
objs.push({ y: XB.y, d: () => { charShadow(XB.x, XB.y + 2, 44); crossbowman(C, M, XB.x, XB.y, SC); } });
objs.sort((a, b) => a.y - b.y).forEach(o => o.d());

// ================= LIGHTING PASS =================
// global hatch layers (darkness is drawn as ink, not as a gradient)
const hl = [mk(), mk(), mk()];
seed = 999;
hatch(hl[0].getContext('2d'), [half(0, 0, W, H)], [0, 0, W, H], -0.8, 6.5, 1.4, { dash: [30, 120], gap: [2, 14], wob: 2 });
hatch(hl[1].getContext('2d'), [half(0, 0, W, H)], [0, 0, W, H], 0.75, 5.5, 1.4, { dash: [30, 120], gap: [2, 14], wob: 2 });
hatch(hl[2].getContext('2d'), [half(0, 0, W, H)], [0, 0, W, H], 0.05, 4.5, 1.5, { dash: [30, 120], gap: [2, 14], wob: 2 });
const hd = hl.map(c => c.getContext('2d').getImageData(0, 0, W, H).data);
const Lmap = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Lmap[y * W + x] = light(x, y);
{
  const id = E.getImageData(0, 0, W, H), d = id.data;
  const ink = [10, 7, 6];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x), p = i * 4, L = Lmap[i];
    const mot = 0.8 + 0.4 * fbm(x / 70, y / 45, 3);
    const k = Math.min(1.2, L), f = 0.3 + 0.78 * Math.pow(k, 1.3);
    let r = d[p] * mot * f * 1.06, g = d[p + 1] * mot * f * 0.95, b = d[p + 2] * mot * f * 0.8;
    // cold sickly shift in the half-dark
    const cold = sst(0.6, 0.2, L) * 0.35; const lum = (r + g + b) / 3; r = r + (lum * 0.78 - r) * cold; g = g + (lum * 0.98 - g) * cold; b = b + (lum * 0.95 - b) * cold;
    const jn = (noise(x / 9, y / 9) - 0.5) * 0.12;
    const t1 = sst(0.72 + jn, 0.5 + jn, L) * hd[0][p + 3] / 255, t2 = sst(0.5 + jn, 0.32 + jn, L) * hd[1][p + 3] / 255, t3 = sst(0.34 + jn, 0.2 + jn, L) * hd[2][p + 3] / 255;
    const t = Math.min(1, t1 * 0.9 + t2 * 0.95 + t3);
    const black = sst(0.21 + jn * 2, 0.1 + jn * 2, L);
    const m = Math.max(t, black);
    d[p] = r + (ink[0] - r) * m; d[p + 1] = g + (ink[1] - g) * m; d[p + 2] = b + (ink[2] - b) * m;
  }
  E.putImageData(id, 0, 0);
}
{
  const id = C.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < W * H; i++) { const p = i * 4; if (!d[p + 3]) continue; const L = Math.min(1.1, Lmap[i]); const f = 0.55 + 0.55 * L; d[p] *= f * 1.08; d[p + 1] *= f * 0.97; d[p + 2] *= f * 0.86; }
  C.putImageData(id, 0, 0);
}
O.drawImage(env, 0, 0);

// ================= FLOOR TELEGRAPHS (gameplay readability) =================
{
  // ghoul leap path toward the hero
  const g = G[2], ax = g.x + 70, ay = g.y + 4, bx = HERO.x - 24, by = HERO.y - 4;
  const ang = Math.atan2(by - ay, bx - ax), ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy * 22, ny = ux * 22;
  const band = [[ax + nx, ay + ny], [bx + nx, by + ny], [bx + ux * 14, by + uy * 14], [bx - nx, by - ny], [ax - nx, ay - ny]];
  O.save(); O.globalAlpha = 0.3; path(O, band); O.fillStyle = '#9e1f1a'; O.fill(); O.restore();
  hatch(O, [band], bbox(band), 0.9, 5, 1.3, { col: '#a82620', alpha: 0.7 });
  stroke(O, band, 2.6, { col: '#c8442c', closed: true, jit: 0.6 });
  for (const t of [0.3, 0.55, 0.8]) { const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t; stroke(O, [[cx - ux * 6 + nx * 0.6, cy - uy * 6 + ny * 0.6], [cx + ux * 8, cy + uy * 8], [cx - ux * 6 - nx * 0.6, cy - uy * 6 - ny * 0.6]], 3.2, { col: '#f06a44', taper: false, jit: 0.3 }); }
  // crossbow aim line
  const sx = XB.x - 124, sy = XB.y - 119, tx = HERO.x + 4, ty = HERO.y - 125;
  O.save(); O.setLineDash([14, 10]); O.lineWidth = 2.5; O.strokeStyle = 'rgba(220,60,40,0.85)'; O.beginPath(); O.moveTo(sx, sy); O.lineTo(tx, ty); O.stroke(); O.restore();
  // hero's ground ring (violet = the player)
  O.save(); O.globalAlpha = 0.9; stroke(O, ell(HERO.x, HERO.y + 2, 56, 19, 30), 3.2, { closed: true, col: '#9a5cc4', jit: 0.6 }); O.restore();
  O.save(); O.globalAlpha = 0.5; stroke(O, ell(HERO.x, HERO.y + 2, 63, 22, 30), 1.4, { closed: true, col: '#9a5cc4', jit: 0.6 }); O.restore();
}
{ const sil = mk(), S = sil.getContext('2d'); S.drawImage(chr, 0, 0); S.globalCompositeOperation = 'source-in'; S.fillStyle = INK; S.fillRect(0, 0, W, H); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; O.drawImage(sil, Math.cos(a) * 3, Math.sin(a) * 3); } }
O.drawImage(chr, 0, 0);
// target bracket on the hero (crossbow lock)
{ const x = HERO.x + 4, y = HERO.y - 125; O.save(); O.strokeStyle = 'rgba(225,70,45,0.95)'; O.lineWidth = 2.5; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { O.beginPath(); O.moveTo(x + sx * 22, y + sy * 12); O.lineTo(x + sx * 30, y + sy * 12); O.lineTo(x + sx * 30, y + sy * 4); O.stroke(); } O.restore(); }
// emissive + glow
O.drawImage(emi, 0, 0);
O.save(); O.globalCompositeOperation = 'lighter';
fireGlow(O, 650, 480, 200, 0.42); fireGlow(O, 1270, 480, 200, 0.42); fireGlow(O, 650, 540, 380, 0.12); fireGlow(O, 1270, 540, 380, 0.12); fireGlow(O, 790, 190, 110, 0.4); fireGlow(O, 1130, 190, 110, 0.4); fireGlow(O, 300, 620, 60, 0.3); fireGlow(O, 335, 320, 60, 0.3); fireGlow(O, 1585, 320, 60, 0.3); fireGlow(O, 1700, 585, 70, 0.3);
for (const [x, y, c, r] of glowPts) { const g = O.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); O.fillStyle = g; O.fillRect(x - r, y - r, 2 * r, 2 * r); }
{ const g = O.createRadialGradient(HERO.x, HERO.y - 194, 0, HERO.x, HERO.y - 194, 14); g.addColorStop(0, 'rgba(255,60,80,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); O.fillStyle = g; O.fillRect(HERO.x - 20, HERO.y - 214, 40, 40); }
O.restore();
// embers
for (let i = 0; i < 40; i++) { const bx = pick([650, 1270]), x = bx + rr(-60, 60), y = rr(250, 470); O.fillStyle = `rgba(255,${Math.floor(rr(140, 210))},90,${rr(0.4, 0.9)})`; O.fillRect(x, y, rr(1.5, 3), rr(1.5, 3)); }

// enemy health bars
function hpBar(x, y, f) { O.fillStyle = '#0e0807'; O.fillRect(x - 33, y - 5, 66, 10); O.fillStyle = '#3a0c0c'; O.fillRect(x - 30, y - 2, 60, 4); O.fillStyle = '#b8201e'; O.fillRect(x - 30, y - 2, 60 * f, 4); }
hpBar(G[0].x + 14, G[0].y + 26, 1); hpBar(G[1].x - 14, G[1].y + 26, 0.55); hpBar(G[2].x + 14, G[2].y + 26, 0.8); hpBar(XB.x, XB.y + 26, 1);

// ================= HUD =================
{
  const x = 120, y = 975;
  // portrait medallion
  O.save(); O.fillStyle = '#0e0907'; path(O, ell(x, y, 66, 66, 40)); O.fill(); O.restore();
  O.save(); path(O, ell(x, y, 56, 56, 40)); O.clip(); O.fillStyle = '#2a2026'; O.fillRect(x - 60, y - 60, 120, 120);
  HS = 1.6; hero(O, O, x - 4, y + 1.6 * 162, 1.6); HS = 1;
  O.restore();
  stroke(O, ell(x, y, 57, 57, 40), 6, { closed: true, col: '#3d3530', taper: false, jit: 0.4 });
  stroke(O, ell(x, y, 61, 61, 40), 2.5, { closed: true, jit: 0.4 });
  stroke(O, ell(x, y, 53, 53, 40), 2, { closed: true, jit: 0.4 });
  // blood health bar
  const bx = 190, by = 950, bw = 380, bh = 24;
  O.fillStyle = '#0e0807'; O.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
  O.fillStyle = '#2b0a0b'; O.fillRect(bx, by, bw, bh);
  const gr = O.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#b42a24'); gr.addColorStop(0.5, '#8e1a18'); gr.addColorStop(1, '#5e0f10'); O.fillStyle = gr; O.fillRect(bx, by, bw * 0.72, bh);
  hatch(O, [half(bx, by + bh * 0.55, bx + bw * 0.72, by + bh)], [bx, by, bx + bw, by + bh], 0.9, 4, 1, { alpha: 0.5 });
  O.save(); O.globalAlpha = 0.5; O.fillStyle = '#e9b4a0'; O.fillRect(bx + 4, by + 4, bw * 0.72 - 8, 2); O.restore();
  stroke(O, half(bx - 2, by - 2, bx + bw + 2, by + bh + 2), 2.6, { closed: true, jit: 0.4, col: '#6e5e4e' });
  stroke(O, half(bx - 6, by - 6, bx + bw + 6, by + bh + 6), 2.2, { closed: true, jit: 0.4 });
  O.font = 'italic 600 19px "FreeSerif", "DejaVu Serif", serif'; O.fillStyle = '#d9c9a8'; O.textBaseline = 'middle';
  O.fillText('Sang  54 / 75', bx + 12, by + bh / 2 + 1);
  // abilities
  const icons = ['claw', 'mist', 'bite', 'rat'];
  icons.forEach((ic, i) => {
    const sx = bx + i * 70, sy = by + 44, s = 52;
    O.fillStyle = '#120c0a'; O.fillRect(sx, sy, s, s); O.fillStyle = '#2a211c'; O.fillRect(sx + 4, sy + 4, s - 8, s - 8);
    stroke(O, half(sx, sy, sx + s, sy + s), 2.6, { closed: true, jit: 0.4, col: '#6e5e4e' });
    const cx = sx + s / 2, cy = sy + s / 2;
    if (ic === 'claw') for (let k = -1; k <= 1; k++) line(O, [[cx - 12 + k * 7, cy - 14], [cx + k * 7, cy], [cx + 4 + k * 7, cy + 14]], 3, { col: '#d9c9a8' });
    if (ic === 'mist') for (let k = 0; k < 3; k++) line(O, [[cx - 16, cy - 10 + k * 10], [cx - 4, cy - 14 + k * 10], [cx + 6, cy - 8 + k * 10], [cx + 16, cy - 12 + k * 10]], 2.6, { col: '#a0a8b8' });
    if (ic === 'bite') { blob(O, [[cx - 14, cy - 8], [cx + 14, cy - 8], [cx + 10, cy + 2], [cx - 10, cy + 2]], '#a3122f', 2); for (const k of [-6, 6]) blob(O, [[cx + k - 3, cy + 2], [cx + k + 3, cy + 2], [cx + k, cy + 14]], '#e8dcc8', 1.5, false); }
    if (ic === 'rat') { blob(O, [[cx - 14, cy + 6], [cx - 8, cy - 6], [cx + 6, cy - 8], [cx + 14, cy], [cx + 6, cy + 8]], '#8a8070', 2); line(O, [[cx - 14, cy + 6], [cx - 22, cy + 12], [cx - 18, cy + 18]], 2); O.fillStyle = '#e0284a'; O.fillRect(cx + 8, cy - 3, 3, 3); }
    O.font = '600 13px "FreeSerif", serif'; O.fillStyle = '#b8a888'; O.fillText(['Clic', 'Espace', 'E', 'R'][i], sx + 4, sy + s - 8);
    if (i === 2) { O.save(); O.globalAlpha = 0.6; O.fillStyle = '#000'; O.fillRect(sx + 4, sy + 4, s - 8, (s - 8) * 0.55); O.restore(); }
  });
  // room title, top centre
  O.textAlign = 'center'; O.font = 'italic 30px "FreeSerif", "DejaVu Serif", serif'; O.fillStyle = '#cdbb98';
  O.fillText('La crypte de l’Ordre', W / 2, 32);
  stroke(O, [[W / 2 - 220, 54], [W / 2 - 40, 54]], 2, { col: '#7a6a55' }); stroke(O, [[W / 2 + 40, 54], [W / 2 + 220, 54]], 2, { col: '#7a6a55' });
  O.save(); O.translate(W / 2, 54); O.rotate(Math.PI / 4); O.fillStyle = '#8e1a18'; O.fillRect(-6, -6, 12, 12); O.strokeStyle = INK; O.lineWidth = 2; O.strokeRect(-6, -6, 12, 12); O.restore();
}
// ================= paper grain =================
{
  const id = O.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 4; const n = (R() - 0.5) * 14 + (fbm(x / 3, y / 3, 1) - 0.5) * 10; d[p] += n; d[p + 1] += n * 0.95; d[p + 2] += n * 0.85; }
  O.putImageData(id, 0, 0);
}
window.__done = out.toDataURL('image/png');
})();
