// Tiny char-grid sprite toolkit (browser global scope).
function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill('.')); }
function stamp(g, x, y, rows) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && ch !== ' ' && g[y + j] && x + i >= 0 && x + i < g[0].length) g[y + j][x + i] = ch === '_' ? '.' : ch; })); return g; }
function mirrorHalf(half) { return half.map(r => { r = r.padEnd(16, '.'); return [...r, ...[...r].reverse()]; }); }
function px(g, x, y, ch) { x = Math.round(x); y = Math.round(y); if (g[y] && x >= 0 && x < g[0].length) g[y][x] = ch; }
function line(g, x0, y0, x1, y1, ch) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let s = 0; s <= n; s++) px(g, x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, typeof ch === 'function' ? ch(s, n) : ch); }
function outline(g) { // 4-neighbour 1px outline 'o'; '~' cells (mist, fx) are not outlined
  const h = g.length, w = g[0].length, solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== '.' && g[y][x] !== 'o' && !FX.has(g[y][x]);
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === '.' && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push([x, y]);
  add.forEach(([x, y]) => g[y][x] = 'o'); return g;
}
const FX = new Set(['x', 'X', '~', '-', ':']); // effect chars: never outlined
function arc(g, cx, cy, rx, ry, a0, a1, inner = 'x', outer = 'X') { // slash trail, only on empty cells
  for (let a = a0; a <= a1; a += 0.01) {
    const t = (a - a0) / (a1 - a0), th = Math.sin(t * Math.PI); // thick in the middle, tapered ends
    for (let d = 0; d <= th * 2.2; d += 0.5) {
      const x = Math.round(cx + Math.cos(a) * (rx - d)), y = Math.round(cy + Math.sin(a) * (ry - d));
      if (g[y] && g[y][x] === '.') g[y][x] = d < 0.6 && th > 0.35 ? inner : outer;
    }
  }
  return g;
}
const rowsOf = g => g.map(r => r.join(''));
const fromRows = (rows, w, h) => { const g = grid(w, h); stamp(g, 0, h - rows.length, rows.map(r => r.replace(/\./g, '.'))); return g; };
