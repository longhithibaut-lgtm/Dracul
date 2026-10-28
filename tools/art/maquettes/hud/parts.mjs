// Shared pieces of the HUD mockups: materials, the power emblems and the item icons as distance fields.
import { lin, sdCircle, sdSeg, sdArc, clamp, fbm, smooth } from './lib.mjs';

export const C = {
  bone: lin('#cfc2a2'), boneDim: lin('#8a7c63'), boneDark: lin('#544a3b'), ink: lin('#0c0a08'),
  blood: lin('#781116'), bloodDeep: lin('#3e060b'), bloodLit: lin('#b42c1e'), bloodBlack: lin('#1a0406'), fresh: lin('#d01a12'),
  iron: lin('#435052'), ironDark: lin('#1a2124'), ironLit: lin('#959c94'), rust: lin('#5a2a0e'),
  silver: lin('#7a7262'), patina: lin('#1a2013'), brass: lin('#8a6a34'), gold: lin('#a87c3c'),
  leather: lin('#4c3420'), leatherDark: lin('#21170f'), thread: lin('#ad9e80'), wood: lin('#664629'),
  glass: lin('#959c94'), skin: lin('#b3a487'), skinDark: lin('#5f5444'), vein: lin('#4a2c56'), sand: lin('#c06a20'),
  mist: lin('#6e3a32'),
};
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// segment whose radius goes from r0 at a to r1 at b
export function sdTaper(x, y, ax, ay, bx, by, r0, r1) {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay, t = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - dx * t, py - dy * t) - (r0 + (r1 - r0) * t);
}
const sdEll = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

export const flat = (c, op = 1) => () => ({ c, flat: true, op });
// light text with a drop shadow (below right, never round it)
export function say(L, m, x, y, c, op = 1, shadow = 0.85) {
  L.text(m, x + 1, y + 1, flat(C.ink, op * shadow));
  L.text(m, x, y, flat(c, op));
}
// masks side by side on one baseline: [[mask, colour], ...]
export function sayRow(L, parts, x, base, gap = 2) {
  for (const [m, c] of parts) { say(L, m, x, base - m.asc, c); x += m.w - 4 + gap; }
  return x;
}
// a soft dark patch under a cluster, so it reads over a lit floor
export const soft = (cx, cy, rx, ry, k) => (x, y) => k * (1 - smooth(0.35, 1, Math.hypot((x - cx) / rx, (y - cy) / ry)));
// metal with its tarnish: polished where raised (rubbed), dark where sunk
export const metal = (base, x, y, raised, seed = 1) => mix(mix(C.patina, base, 0.35 + 0.65 * raised), mul(base, 0.6), fbm(x * 0.35, y * 0.35, 3, seed) * 0.5);

// ---- the power emblems, in units (-1..1) ----
export const EMBLEM = {
  griffes: (u, v) => Math.min(...[-1, 0, 1].map((i) => sdTaper(u, v, -0.42 + 0.42 * i, -0.78, -0.02 + 0.42 * i + 0.1, 0.8, 0.17, 0.03))),
  tir: (u, v) => Math.min(sdTaper(u, v, -0.7, 0.7, 0.25, -0.25, 0.04, 0.24), sdTaper(u, v, 0.25, -0.25, 0.72, -0.72, 0.24, 0.02), sdCircle(u, v, -0.62, 0.05, 0.11), sdCircle(u, v, -0.15, 0.62, 0.09)),
  glyphe: (u, v) => { // the blood seal: a ring round its eye, two nails across
    const r = Math.hypot(u, v);
    return Math.min(Math.abs(r - 0.66) - 0.1, r - 0.2, sdSeg(u, v, -0.95, 0, -0.42, 0, 0.08), sdSeg(u, v, 0.42, 0, 0.95, 0, 0.08));
  },
  brume: (u, v) => Math.min(sdArc(u, v, -0.1, 0.05, 0.5, Math.PI * 0.55, Math.PI * 2.1, 0.09), sdArc(u, v, 0.32, -0.42, 0.26, Math.PI * 0.9, Math.PI * 2.3, 0.08), sdArc(u, v, 0.35, 0.5, 0.22, Math.PI * 1.1, Math.PI * 2.4, 0.07)),
  rat: (u, v) => Math.min(sdEll(u, v, -0.05, 0.12, 0.5, 0.3), sdTaper(u, v, 0.35, 0.02, 0.86, 0.16, 0.25, 0.05), sdCircle(u, v, 0.36, -0.22, 0.13),
    sdArc(u, v, -0.62, -0.1, 0.32, Math.PI * 0.2, Math.PI * 1.05, 0.05), sdSeg(u, v, 0.15, 0.3, 0.22, 0.52, 0.06), sdSeg(u, v, -0.3, 0.3, -0.36, 0.52, 0.06)),
};

// ---- the bag's items: fn(x, y) in px round their middle (about 11 px across) -> { h, c, s } ----
export const ITEM = {
  calice: (x, y) => { // cracked chalice
    const bowl = y >= -3.5 && y <= 0.5 && Math.hypot(x, (y + 3.5) * 1.15) <= 4.2, stem = Math.abs(x) <= 0.9 && y > 0 && y <= 3, foot = y > 3 && y <= 4.6 && Math.abs(x) <= 3 - (4.6 - y) * 0.6;
    if (!bowl && !stem && !foot) return;
    const crack = bowl && Math.abs(x - 1 - (y + 3.5) * 0.35) < 0.5 && y < -0.5;
    return { h: bowl ? 2 + Math.sqrt(Math.max(0, 16 - x * x)) * 0.4 : 1.4, c: crack ? C.ink : mix(C.gold, C.brass, fbm(x * 0.7, y * 0.7, 2, 3)), s: 0.8 };
  },
  chapelet: (x, y) => { // bone rosary
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 - Math.PI / 2; const d = Math.hypot(x - Math.cos(a) * 3.6, y + 1.2 - Math.sin(a) * 3.2); if (d < 1.15) return { h: 1.5 + Math.sqrt(1.3 - d * d), c: C.bone, s: 0.4 }; }
    if (sdSeg(x, y, 0, 2.3, 0, 5.4, 0.6) < 0 || sdSeg(x, y, -1.4, 3.6, 1.4, 3.6, 0.55) < 0) return { h: 1.6, c: C.boneDim, s: 0.3 };
  },
  faucille: (x, y) => { // sickle
    if (sdTaper(x, y, -3.6, 0.6, -2.6, 5, 0.9, 0.8) < 0) return { h: 1.4, c: C.wood, s: 0.2 };
    const d = sdArc(x, y, 0.4, -0.2, 3.9, Math.PI * 1.0, Math.PI * 2.05, 0.75 + 0.35 * clamp((-x + 3) / 6));
    if (d < 0) return { h: 1.6 - d * 0.6, c: mix(C.ironLit, C.rust, fbm(x, y, 2, 5) * 0.6), s: 0.9 };
  },
  fiole: (x, y) => { // phial of mist
    if (Math.abs(x) <= 1 && y >= -5.2 && y < -3.4) return { h: 1.5, c: C.wood, s: 0.2 };
    if (Math.abs(x) <= 0.9 && y >= -3.4 && y < -1.8) return { h: 1.6, c: C.glass, s: 1 };
    const d = Math.hypot(x, y - 1.4); if (d > 3.6) return;
    return { h: 1.4 + Math.sqrt(13 - d * d) * 0.5, c: y > 0.2 ? mix(C.mist, C.bloodDeep, fbm(x, y, 2, 9)) : C.glass, s: 1 };
  },
  sablier: (x, y) => { // cracked hourglass
    if ((Math.abs(y) >= 4.2 && Math.abs(y) <= 5.4 && Math.abs(x) <= 4) || (Math.abs(x) >= 3 && Math.abs(x) <= 3.8 && Math.abs(y) < 4.2)) return { h: 1.8, c: C.wood, s: 0.25 };
    const half = 2.6 * (Math.abs(y) / 4.2) + 0.4; if (Math.abs(x) > half || Math.abs(y) >= 4.2) return;
    const sand = (y > 0 && y > 4.2 - 2.2) || (y < 0 && y > -1.8);
    return { h: 1.3, c: sand ? C.sand : C.glass, s: sand ? 0.2 : 1 };
  },
};
export const BAG = ['calice', 'faucille', 'chapelet', 'fiole']; // what the mockups carry

// the item at (cx, cy), `k` times its drawn size
export function item(L, name, cx, cy, op = 1, k = 1.6) {
  const e = 7 * k;
  L.paint(cx - e, cy - e, cx + e, cy + e, (x, y) => { const r = ITEM[name]((x - cx) / k, (y - cy) / k); return r && { ...r, h: (r.h + 3) * k, op }; });
}

// a key: the mouse (left or right button lit), the space bar, or a letter mask
export function mouse(L, x, y, side, c, lit, op = 1) {
  L.paint(x, y, x + 7, y + 10, (px, py) => {
    const dx = px - (x + 3.5), dy = py - (y + 5); if (Math.hypot(dx / 3.5, dy / 5) > 1.05 || (Math.abs(dx) < 0.6 && dy < 0) || Math.abs(dy + 0.5) < 0.5) return;
    const btn = dy < -0.3 && (side === 'l' ? dx < 0 : dx > 0);
    return { c: btn ? lit : c, flat: true, op };
  });
}
export function spacebar(L, x, y, c, op = 1) { L.paint(x, y, x + 13, y + 4, (px, py) => (py > y + 2 || px < x + 1 || px > x + 12 ? { c, flat: true, op } : undefined)); }
