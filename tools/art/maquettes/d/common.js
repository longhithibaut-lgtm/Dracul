// Shared: layout of the hall's top screen (native px) and where the characters stand, the same in both mockups.
const W = 480, H = 270, N = W * H;
const HERO = [232, 226], XB = [366, 158], G1 = [178, 178], G2 = [300, 250], G3 = [152, 263];
const LANT = [HERO[0] + 10, HERO[1] - 9]; // lantern glass centre on screen (set from the sprite below)
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function h2(x, y, s = 0) { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function vn(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 4, s = 0) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
const hex = s => { const v = parseInt(s.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const L = s => hex(s).map(v => Math.pow(v, 2.2));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
// grid sprite -> list of pixels {x, y, ch, c (linear), e, edge}
function spritePixels(name, ox, oy, flip = false) {
  const s = SPR[name], h = s.rows.length, w = Math.max(...s.rows.map(r => r.length));
  const x0 = Math.round(ox - w / 2), y0 = oy - h + 1, out = [];
  s.rows.forEach((r, j) => [...r].forEach((ch, i0) => {
    if (ch === '.' || ch === ' ') return; const p = s.pal[ch]; if (!p) return;
    const i = flip ? w - 1 - i0 : i0;
    out.push({ x: x0 + i, y: y0 + j, z: h - 1 - j, ch, c: L(p.c || p), e: p.e, o: ch === 'o' });
  }));
  return { px: out, x0, y0, w, h };
}
// The cast: [sprite, x, y, flip], drawn back to front.
const CAST = [['xbow', XB[0], XB[1], false], ['ghoul', G1[0], G1[1], false], ['ghoulUp', G3[0], G3[1], false], ['ghoul', G2[0], G2[1], true], ['hero', HERO[0], HERO[1], false]];
const AIM = [[XB[0] - 12, XB[1] - 18], [HERO[0] + 3, HERO[1] - 18]];
