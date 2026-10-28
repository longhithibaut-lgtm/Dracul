// Shared pieces of the menu mockups, over the HUD mockups' layer (../hud/lib.mjs) and materials (../hud/parts.mjs).
import { W, H, lin, clamp, fbm, smooth, bayer } from '../hud/lib.mjs';
import { C, mix, mul, metal } from '../hud/parts.mjs';
import { h2 } from '../../grand/lib.mjs';

// a text mask in relief: fn(t, x, y) -> a paint result, t 0 at the letter's edge to 1 at `depth` px inside
export function emboss(L, m, x, y, fn, depth = 2.5) {
  x = Math.round(x); y = Math.round(y);
  const w = m.w, h = m.h, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m.a[i] > 107 ? 99 : 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; if (d[k]) d[k] = Math.min(d[k], (i ? d[k - 1] : 0) + 1, (j ? d[k - w] : 0) + 1); }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) { const k = j * w + i; if (d[k]) d[k] = Math.min(d[k], (i < w - 1 ? d[k + 1] : 0) + 1, (j < h - 1 ? d[k + w] : 0) + 1); }
  L.paint(x, y, x + w, y + h, (px, py) => { const k = (Math.floor(py) - y) * w + Math.floor(px) - x; return d[k] ? fn(Math.min(1, (d[k] - 0.5) / depth), px, py) : undefined; });
}
// tarnished silver letters, rubbed bright on their crest
export const silver = (seed = 1, base = C.silver) => (t, x, y) => ({ h: t * 3, c: metal(base, x, y, 0.35 + t * 0.65, seed), s: 0.7 });

// light text: a dark halo below right, then the letters flat
export function say(L, m, x, y, c, op = 1) {
  L.text(m, x + 1, y + 1, () => ({ c: C.ink, flat: true, op: 0.85 * op }));
  L.text(m, x, y, () => ({ c, flat: true, op }));
}
// the capture dimmed: k at the middle, more at the edges
export function dim(L, k, edge = 0.2, cx = W / 2, cy = H / 2) {
  L.scrim(0, 0, W, H, (x, y) => k + edge * smooth(0.5, 1.3, Math.hypot((x - cx) / (W / 2), (y - cy) / (H / 2))));
}
// a soft dark patch (scrim), round (cx, cy), radii rx, ry
export const patch = (cx, cy, rx, ry, k) => (x, y) => k * (1 - smooth(0.4, 1, Math.hypot((x - cx) / rx, (y - cy) / ry)));

// a thin engraved line with a reliquary cross in its middle (the HUD's place name underline)
export function crossLine(L, cx, y, half, seed = 4) {
  L.paint(cx - half, y - 4, cx + half + 1, y + 4, (px, py) => {
    const dx = px - cx, cross = (Math.abs(dx) < 1 && Math.abs(py - y) < 3.5) || (Math.abs(py - y + 1) < 0.6 && Math.abs(dx) < 2.6);
    const line = Math.abs(py - y) < 0.6 && Math.abs(dx) > 6 && bayer(px, 1) < 1.1 - Math.abs(dx) / half;
    return cross || line ? { h: 1.2, c: metal(C.silver, px, py, 1, seed), s: 0.8 } : undefined;
  });
}
// a drop of blood, point up, about 6 x 9 px, its bottom middle at (x, y)
export function drop(L, x, y, k = 1, glow = 0.5) {
  L.paint(x - 4 * k, y - 10 * k, x + 4 * k + 1, y + 1, (px, py) => {
    const u = (px - x) / k, v = (py - y) / k + 3.6; const d = v < 0 ? Math.abs(u) - (v + 6.5) * 0.45 : Math.hypot(u, v) - 3.4;
    if (d > 0 || v < -6.5) return;
    return { h: Math.sqrt(Math.max(0, 12 - u * u - Math.max(0, v) ** 2)) * k, c: C.blood, s: 1, e: mul(C.bloodDeep, glow) };
  });
}
// a key cap: a dark slab in a worn silver rim, its letter(s) in bone; returns its width
export function keycap(L, m, x, y, { base = C.silver, ink = C.bone, minW = 14, h = 15 } = {}) {
  const w = Math.max(minW, m.w + 6);
  L.paint(x, y, x + w, y + h, (px, py) => {
    const dx = Math.min(px - x, x + w - px), dy = Math.min(py - y, y + h - py), d = Math.min(dx, dy), r = 2.5;
    if (dx < r && dy < r && Math.hypot(r - dx, r - dy) > r) return;
    return d < 1.4 ? { h: 1.6, c: metal(base, px, py, 0.9, 8), s: 0.6 } : { h: 1, c: mix(C.ink, C.leatherDark, 0.5), s: 0.2 };
  });
  L.text(m, x + w / 2 - m.w / 2, y + h / 2 - m.asc / 2 - 1, () => ({ c: ink, flat: true }));
  return w;
}
// embers rising from (cx, cy), spread over w, up to `rise` px, n of them
export function embers(L, cx, cy, w, rise, n, seed = 1) {
  for (let i = 0; i < n; i++) {
    const r1 = h2(i, 1, seed), r2 = h2(i, 2, seed), r3 = h2(i, 3, seed);
    const t = clamp(r2 * 1.6 - 0.3), x = Math.round(cx + (r1 - 0.5) * w * (1 + t * 0.6) + Math.sin(i * 1.7 + t * 6) * 4), y = Math.round(cy - t * rise);
    const hot = r3 > 0.55 && t < 0.5, c = hot ? lin('#ffb060') : t < 0.6 ? lin('#e0401a') : lin('#8a1810');
    L.paint(x, y, x + 1, y + (hot ? 2 : 1), () => ({ c, flat: true, op: 1 - t * 0.5 }));
  }
}
export { C, mix, mul, metal, lin, clamp, fbm, smooth, bayer, h2, W, H };
