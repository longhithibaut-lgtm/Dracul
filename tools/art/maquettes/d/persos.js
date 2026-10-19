// "Personnages seuls": the hall exactly as the game draws it today, only the cast redrawn in take B's style.
const img = new Uint8ClampedArray(CAP.game);
const get = (x, y) => { const i = (y * W + x) * 4; return [img[i] / 255, img[i + 1] / 255, img[i + 2] / 255]; };
const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; img[i] = clamp(c[0]) * 255; img[i + 1] = clamp(c[1]) * 255; img[i + 2] = clamp(c[2]) * 255; };
const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const srgb = c => c.map(v => Math.pow(v, 1 / 2.2));
// the game's own vignette and darkening at a point: captured frame over the frame without vignette/additive light
const VIG = (x, y) => { let a = 0, b = 0; for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const xx = clamp(x + i, 0, W - 1) | 0, yy = clamp(y + j, 0, H - 1) | 0, k = (yy * W + xx) * 4; a += CAP.game[k] + CAP.game[k + 1] + CAP.game[k + 2]; b += CAP['unlit-base'][k] + CAP['unlit-base'][k + 1] + CAP['unlit-base'][k + 2]; } return clamp(a / Math.max(1, b), 0.45, 1); };
// shadows: the game's dark ellipse under every character
for (const [n, x, y] of CAST) { const rx = n === 'ghoul' ? 11 : n === 'ghoulUp' ? 8 : 7; for (let j = -3; j <= 2; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / 6.5 <= 1) set(x + i, y + j, mix(get(x + i, y + j), [11 / 255, 7 / 255, 16 / 255], 0.5)); }
// warm sources of the room (braziers, candles) for a warm rim; the moon comes from above (the gate)
const WARM = [[198, 70, 1], [282, 70, 1], [54, 230, 0.5], [128, 234, 0.5], [62, 76, 0.5], [414, 74, 0.5], [334, 240, 0.5]];
const owner = new Int16Array(N).fill(-1), outl = new Uint8Array(N), glowAt = [];
const draw = (name, ox, oy, flip, id) => {
  const sp = spritePixels(name, ox, oy, flip);
  for (const q of sp.px) { if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) continue; const i = q.y * W + q.x; owner[i] = id; outl[i] = q.o ? 1 : 0;
    let c = srgb(q.c); if (!q.o) c = mul(c, 1.12); if (q.e) { c = srgb(q.c.map((v, k) => v + q.e[k])); if (q.e[0] + q.e[1] + q.e[2] > 1.5) glowAt.push([q.x, q.y, q.c]); } set(q.x, q.y, c); }
  return sp;
};
CAST.forEach(([n, x, y, flip], k) => { draw(n, x, y, flip, k + 1); if (n === 'hero') { const s = SPR.hero, w = s.rows[0].length, x0 = Math.round(x - w / 2), y0 = y - s.rows.length + 1; draw('lantern', x0 + s.lantern[0], y0 + s.lantern[1] + 8, false, k + 1); } });
// rim: the edge facing up toward the moonlit gate gets cold, the edge facing a fire gets warm
const rim = new Float32Array(N * 3);
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const i = y * W + x; if (owner[i] < 0 || outl[i]) continue;
  const up = owner[i - W] !== owner[i] || outl[i - W], ul = owner[i - W - 1] !== owner[i] || outl[i - W - 1], left = owner[i - 1] !== owner[i] || outl[i - 1];
  if (up || ul || left) { const k = up ? 0.3 : 0.18; rim[i * 3] += 0.56 * k; rim[i * 3 + 1] += 0.94 * k; rim[i * 3 + 2] += 0.86 * k; }
  for (const [lx, ly, s] of WARM) { const d = Math.hypot(lx - x, ly - y); if (d > 90) continue; const dx = Math.round((lx - x) / d * 1.4), dy = Math.round((ly - y) / d * 1.4), j = (y + dy) * W + x + dx;
    if (owner[j] !== owner[i] || outl[j]) { const k = s * 0.45 * (1 - d / 90); rim[i * 3] += 1 * k; rim[i * 3 + 1] += 0.7 * k; rim[i * 3 + 2] += 0.28 * k; } }
}
for (let i = 0; i < N; i++) if (owner[i] >= 0) { const x = i % W, y = (i / W) | 0, c = get(x, y); set(x, y, [c[0] + rim[i * 3], c[1] + rim[i * 3 + 1], c[2] + rim[i * 3 + 2]]); }
// the game's vignette over the cast too
for (let i = 0; i < N; i++) if (owner[i] >= 0) { const x = i % W, y = (i / W) | 0; set(x, y, mul(get(x, y), VIG(x, y))); }
// glows: eyes and lantern, additive, small
for (const [x, y, c] of glowAt) { const s = srgb(c), big = lum(s) > 0.8 && c[2] > 0.3; const r = big ? 6 : 2;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = Math.hypot(i, j); if (d > r || !d) continue; const k = (big ? 0.05 : 0.12) * (1 - d / r); const o = get(x + i, y + j); set(x + i, y + j, [o[0] + s[0] * k, o[1] + s[1] * k, o[2] + s[2] * k]); } }
// the crossbow's aim telegraph, as the game draws it: short gold dashes
{ const [[x0, y0], [x1, y1]] = AIM, n = Math.hypot(x1 - x0, y1 - y0); for (let s = 6; s < n - 6; s++) if ((s % 7) < 3) { const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n); if (owner[y * W + x] < 0) set(x, y, hex('#ffd75e')); } }
window.IMG = img;
