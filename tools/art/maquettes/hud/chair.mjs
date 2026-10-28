// 2. Chair: diegetic and organic. Life is a heart that blackens from its apex as it is lost (it beats; faster when low),
// the dash a vein that refills, the blood carried a skin pouch that soaks red, the powers brands cut in a pinned scrap
// of skin (open and bleeding when ready, scabbed while they recharge). Little text, and what is not needed fades.
import { W, H, lin, clamp, fbm, sdCircle, sdSeg, sdArc } from './lib.mjs';
import { C, EMBLEM, item, mouse, spacebar, mix, mul, say, sayRow, soft, metal, sdTaper } from './parts.mjs';
import { h2 } from '../../grand/lib.mjs';

export const TEXTS = {
  cPlace: ['Les catacombes', 'italic 30px fellI'], cPrompt: ['fouiller', 'italic 17px fellI'], cBoss: ['la Nourrice des goules', 'italic 18px fellI', 0.5],
  cGain: ['+16', 'italic 15px fellI'], cLow: ['7', 'italic 22px fellI'], cE: ['E', 'italic 13px fellI'], cR: ['R', 'italic 14px fellI'], cF: ['F', 'italic 17px fellI'],
};
export const LOW = [0.12, 0.0, 0.03];
const SLOTS = ['griffes', 'tir', 'glyphe'];
const FLESH = lin('#8a2a22'), DEAD = lin('#16101a'), BRUISE = lin('#3a2040'), FAT = lin('#b4a070');
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const sdEll = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

// the heart's body and its vessels, in px round its middle
const body = (u, v) => smin(smin(sdEll(u, v, -4, 1, 10, 12), sdEll(u, v, 5, 3, 10, 12.5), 6), sdTaper(u, v, 1, 6, 4, 21, 9, 1.5), 7);
const atria = (u, v) => Math.min(sdCircle(u, v, -8, -9, 5), sdCircle(u, v, 9, -8, 4.5));
const vessels = (u, v) => Math.min(sdSeg(u, v, -1, -8, -1, -17, 3.2), sdArc(u, v, 3, -16, 3.8, Math.PI, Math.PI * 2, 2.4), sdSeg(u, v, 6.8, -16, 6.8, -11, 2.3), sdSeg(u, v, 4, -7, 1, -13, 2.4), sdSeg(u, v, 11, -6, 13, -13, 2));

export function heart(L, cx, cy, frac, low, k = 1.35, halo = true, flesh = true) {
  const dead = cy + (-23 + frac * 44) * k; // the black climbs from the apex
  const at = (x, y) => [(x - cx) / k, (y - cy) / k];
  // its beat, a dull red halo (it would pulse)
  if (halo) L.paint(cx - 34, cy - 38, cx + 36, cy + 40, (x, y) => { const [u, v] = at(x, y), d = Math.min(body(u, v), atria(u, v)) * k; return d > 0 && d < 7 ? { c: mul(C.blood, 0.9), flat: true, op: (low ? 0.2 : 0.35) * (1 - d / 7) ** 2 } : undefined; });
  if (flesh) L.paint(cx - 28, cy - 32, cx + 28, cy + 31, (x, y) => {
    const [u, v] = at(x, y), db = Math.min(body(u, v), atria(u, v) + 0.5), dv = vessels(u, v);
    if (db > 0 && dv > 0) return;
    const n = fbm(x * 0.3, y * 0.3, 3, 41), edge = dead + (fbm(x * 0.2, 0, 2, 42) - 0.5) * 10;
    if (db > 0 || (dv < db && v < -8)) return { h: Math.sqrt(Math.max(0, -dv)) * 1.6 * k + 4, c: mix(lin('#4a1418'), BRUISE, 0.2 + n * 0.5), s: 0.1 }; // the great vessels: dull, a little blue
    const groove = Math.abs(u - 1 - v * 0.15) < 0.8 && v > -6 && v < 17, coronary = Math.abs(u + 6 + Math.sin(v * 0.3) * 2) < 0.6 && v > -4 && v < 13;
    let c = mix(lin('#3e080c'), FLESH, 0.3 + n * 0.7), s = fbm(x * 0.7, y * 0.7, 2, 44) > 0.66 ? 0.35 : 0.08, h = Math.sqrt(-db) * 1.8 * k; // wet glints here and there
    if (v < -4 && fbm(x * 0.5, y * 0.5, 2, 43) > 0.62) c = mix(c, FAT, 0.4); // fat over the atria
    if (groove || coronary) { c = mix(BRUISE, lin('#5a1020'), 0.4); h -= 0.8; }
    if (y > edge) { c = mix(DEAD, lin('#2b251d'), n * 0.7); s = 0.12; h *= 0.7; }
    else if (y > edge - 4) c = mix(c, BRUISE, 0.75);
    return { h, c, s, e: y > edge ? undefined : mul(C.bloodDeep, 0.3) };
  });
}

// a pinned scrap of pale skin: x0..x1, y0..y1
export function skin(L, x0, y0, x1, y1, seed) {
  L.paint(x0 - 4, y0 - 4, x1 + 4, y1 + 4, (x, y) => {
    const e = (fbm(x * 0.08, y * 0.08, 3, seed) - 0.5) * 9, d = Math.max(x0 - x, x - x1, y0 - y, y - y1) + e * 0.6; if (d > 0) return;
    const n = fbm(x * 0.3, y * 0.3, 4, seed + 1), vein = Math.abs(fbm(x * 0.07, y * 0.12, 3, seed + 2) - 0.5) < 0.018;
    return { h: Math.min(3, -d * 0.5) + n * 1.8, c: vein ? mix(C.vein, C.skinDark, 0.3) : mix(mix(lin('#3a2a24'), lin('#8a6a58'), 0.15 + n * 0.7), lin('#5a3040'), fbm(x * 0.15, y * 0.15, 2, seed + 3) > 0.6 ? 0.45 : 0), s: 0.35 };
  });
  for (const [x, y] of [[x0 + 2, y0 + 2], [x1 - 2, y0 + 1], [x0 + 1, y1 - 2], [x1 - 1, y1 - 1]]) L.paint(x - 3, y - 3, x + 4, y + 4, (px, py) => { const d = Math.hypot(px - x - 0.5, py - y - 0.5); return d < 2.6 ? { h: 2 + Math.sqrt(7 - d * d), c: metal(C.rust, px, py, 0.6, 5), s: 0.5 } : undefined; });
}
// a brand cut in the skin: open and bleeding when ready; scabbed over the share still to recharge
export function brand(L, cx, cy, k, emblem, cd, drip) {
  L.paint(cx - k - 3, cy - k - 3, cx + k + 4, cy + k + 4, (x, y) => {
    const dx = x - cx, dy = y - cy, e = EMBLEM[emblem](dx / k, dy / k) * k;
    if (e > 1.6) return;
    if (e > 0.5) return { add: true, c: mix(lin('#8a4a40'), C.skinDark, (e - 0.5) / 1.1) }; // inflamed rim
    const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1, scab = a < cd;
    return scab ? { add: true, h: -0.6, c: mix(lin('#1e120a'), lin('#3e2418'), fbm(x, y, 2, 7)), s: 0.1 } : { add: true, h: -1.6, c: mix(C.bloodDeep, C.bloodLit, clamp(-e / 2)), s: 1, e: mul(C.blood, 0.35) };
  });
  if (drip) L.paint(cx + 1, cy + k * 0.5, cx + 3, cy + k + 13, (x, y) => (x < cx + 2 || y > cy + k + 10 ? { h: 1.5, c: C.blood, s: 1, e: mul(C.bloodDeep, 0.5), op: 1 } : undefined));
}

// the dash: a vein from the heart, swollen with blood where it has refilled (dash: 0..1)
export function vein(L, hx, dash) {
  const pts = Array.from({ length: 121 }, (_, i) => { const t = i / 120; return [hx + 14 + t * 92, 528 - Math.sin(t * Math.PI * 1.5) * 2 - Math.max(0, 0.12 - t) * 90, t]; });
  L.paint(hx + 8, 500, hx + 112, 534, (x, y) => {
    let best = 1e9, bt = 0; for (const [px, py, t] of pts) { const d = Math.hypot(x - px, y - py); if (d < best) { best = d; bt = t; } }
    const full = bt <= dash, r = full ? 2.8 + (bt > 0.96 && dash >= 1 ? 1 : 0) : 1.3; if (best > r) return;
    return { h: Math.sqrt(r * r - best * best) * 1.6, c: full ? mix(lin('#3e080c'), FLESH, 0.4 + fbm(x * 0.4, y, 2, 66) * 0.5) : mix(C.vein, C.skinDark, 0.5), s: full ? 0.4 : 0.1, e: full ? mul(C.bloodDeep, 0.35) : undefined };
  });
}
// the pouch of skin that soaks red with the blood carried (soak: 0..1 of the bag)
export function pouch(L, px, py, soak, pw = 26, ph = 36) {
  L.paint(px - 2, py - 12, px + pw + 2, py + ph + 1, (x, y) => {
    const u = (x - px - pw / 2) / (pw / 2), v = (y - py) / ph; // v 0 at the neck, 1 at the bottom
    const neck = v < 0.18 && Math.abs(u) < 0.22 + v * 1.2, bag = v >= 0.12 && Math.hypot(u / (0.8 + v * 0.35), (v - 0.62) / 0.48) < 1 + (fbm(x * 0.2, y * 0.2, 2, 61) - 0.5) * 0.15;
    const tuft = v < 0 && v > -0.28 && Math.abs(u + Math.sin(v * 20) * 0.15) < 0.45 + v * 0.8; // the gathered top above the cord
    if (!neck && !bag && !tuft) return;
    const n = fbm(x * 0.35, y * 0.35, 4, 62), cord = Math.abs(v - 0.1) < 0.035 && Math.abs(u) < 0.6;
    const wet = fbm(x * 0.18, y * 0.22, 3, 63) + (v - (1 - soak * 1.6)) * 0.9 > 0.65 && v > 0.15;
    const h = (bag ? Math.sqrt(Math.max(0, 1 - u * u - ((v - 0.6) / 0.5) ** 2)) * 6 : 2) + n * 1.6 + (Math.abs(Math.sin(u * 6 + v * 9 + n * 4)) < 0.2 ? -1 : 0); // wrinkles
    if (cord) return { h: h + 1.5, c: metal(C.wood, x, y, 0.7, 64), s: 0.2 };
    return { h, c: wet ? mix(C.bloodBlack, C.blood, n * 1.2) : mix(lin('#2a2018'), lin('#7a6650'), 0.2 + n * 0.7), s: wet ? 0.85 : 0.2, e: wet ? mul(C.bloodDeep, 0.25) : undefined };
  });
}

// her umbilical cord from x0 to x1 at yc, plump where her blood remains (frac), withered where it is spent
export function cord(L, x0, x1, yc, frac) {
  const fx = x0 + frac * (x1 - x0);
  L.paint(x0 - 8, yc - 7, x1 + 10, yc + 8, (x, y) => {
    const full = x < fx, r = full ? 4.2 + Math.sin(x * 0.21) * 0.5 : 2.2, ripple = (fx - x) / 6, rr = x >= fx && x < fx + 6 ? 4.2 - (4.2 - 2.2) * (1 - Math.max(0, -ripple)) : r;
    const yy = yc + Math.sin(x * 0.045) * 1.5, dy = y - yy;
    if (x < x0) { const d = Math.hypot(x - x0 + 3, dy * 1.1); return d < 6 ? { h: Math.sqrt(36 - d * d), c: mix(C.bloodDeep, FLESH, fbm(x, y, 2, 91)), s: 0.7 } : undefined; } // the knot
    if (x > x1) { const d = sdArc(x, y, x1 + 5, yy + 3, 4, -Math.PI * 0.5, Math.PI * 0.9, 1); return d < 0 ? { h: 2, c: metal(C.iron, x, y, 0.8, 92), s: 0.7 } : undefined; } // the hook
    const R = x >= fx ? Math.min(rr, 4.2) : r; if (Math.abs(dy) > R) return;
    const helix = Math.sin(x * 0.3 + (dy / R) * 2.2) > 0.7;
    if (!full) return { h: Math.sqrt(R * R - dy * dy) * 1.1, c: helix ? lin('#2a2026') : mix(lin('#3a3228'), C.skinDark, fbm(x * 0.3, y, 2, 93)), s: 0.05 };
    return { h: Math.sqrt(R * R - dy * dy) * 1.2, c: helix ? mix(C.vein, lin('#3e080c'), 0.5) : mix(lin('#4a0c14'), FLESH, 0.3 + fbm(x * 0.2, y * 0.4, 2, 94) * 0.6), s: 0.06, e: mul(C.bloodDeep, 0.35) };
  });
}

export function draw(L, S, T) {
  if (S.low) { // veins crawl in from the edges
    for (let i = 0; i < 26; i++) {
      const side = i % 4, t = h2(i, 1, 51);
      let x = side === 0 ? 0 : side === 1 ? W - 1 : t * W, y = side < 2 ? t * H : side === 2 ? 0 : H - 1, a = side === 0 ? 0 : side === 1 ? Math.PI : side === 2 ? Math.PI / 2 : -Math.PI / 2, w = 2.2;
      for (let s = 0; s < 60 && w > 0.4; s++) {
        a += (h2(i, s, 52) - 0.5) * 0.8; x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5; w -= 0.03;
        const op = clamp(w / 2.2) * 0.8, r = w;
        L.paint(x - r, y - r, x + r + 1, y + r + 1, (px, py) => (Math.hypot(px - x, py - y) < r ? { c: lin('#1e040a'), flat: true, op } : undefined));
      }
    }
  }
  // the heart, bottom left
  const hx = 38, hy = 494;
  L.scrim(0, 400, 330, 540, soft(90, 505, 160, 80, 0.6));
  heart(L, hx, hy, S.hp / S.max, S.low);
  if (S.low) say(L, T.cLow, hx + 18, hy - 30, C.fresh);

  vein(L, hx, S.dash);
  spacebar(L, hx + 116, 526, C.boneDim, 0.6);

  const px = 152, py = 484, pw = 26;
  pouch(L, px, py, S.blood / S.cap);
  if (S.place) say(L, T.cGain, px + pw + 2, py - 8, C.blood, 0.8); // the last pickup, fading

  // the bag's items, faint unless they change (the bag opens with I)
  for (let i = 0; i < S.bag; i++) {
    const x = px + pw + 16 + i * 19, y = 518;
    if (S.items[i]) item(L, S.items[i], x, y, 0.45, 1.3);
    else L.paint(x - 2, y - 2, x + 3, y + 3, (qx, qy) => (Math.abs(qx - x - 0.5) === Math.abs(qy - y - 0.5) ? { c: C.boneDim, flat: true, op: 0.35 } : undefined));
  }

  // the powers: brands on a pinned scrap of skin, bottom right
  L.scrim(760, 420, 960, 540, soft(890, 508, 120, 60, 0.6));
  skin(L, 836, 494, 946, 528, 71);
  [[852, 9], [879, 9], [906, 9]].forEach(([x, k], i) => brand(L, x, 511, k, SLOTS[i], S.cd[SLOTS[i]], false));
  brand(L, 932, 509, 11, 'rat', S.nuee ? 0 : 1, S.nuee);
  [[849, 'l'], [876, 'r']].forEach(([x, s]) => mouse(L, x, 480, s, C.boneDim, C.bone, 0.75));
  say(L, T.cE, 902, 477, C.boneDim, 0.75);
  say(L, T.cR, 928, 476, C.bone, 0.85);

  if (S.place) { // the place's name, smeared under with a finger of blood; it fades out
    const m = T.cPlace, x = W / 2 - m.w / 2, y = 40;
    L.scrim(x - 60, y - 30, x + m.w + 60, y + 70, soft(W / 2, y + 16, m.w / 2 + 70, 40, 0.45));
    L.paint(x - 6, y + m.h - 2, x + m.w + 8, y + m.h + 6, (px, py) => {
      const t = (px - x + 6) / (m.w + 14), w = 2.6 * Math.sin(t * Math.PI) ** 0.6, d = Math.abs(py - (y + m.h + 2 + Math.sin(t * 5) * 0.8));
      return d < w && fbm(px * 0.5, py * 0.9, 2, 81) > 0.3 + t * 0.25 ? { h: 1, c: mix(C.bloodDeep, C.blood, fbm(px * 0.3, py, 2, 82)), s: 0.8, op: 0.9 } : undefined;
    });
    say(L, m, x, y, C.bone, 0.85);
  }
  if (S.prompt) { // « F fouiller », nothing round it
    const [qx, qy] = S.prompt, m = T.cPrompt, x0 = qx - (m.w + T.cF.w) / 2;
    L.scrim(x0 - 14, qy - 14, x0 + m.w + 34, qy + 26, soft(qx, qy + 8, m.w / 2 + 24, 15, 0.5));
    sayRow(L, [[T.cF, C.fresh], [m, C.bone]], x0, qy + 14, 4);
  }
  if (S.boss) { // her umbilical cord across the top, plump where her blood remains, withered where it is spent
    const m = T.cBoss, x0 = 300, x1 = 660, yc = 40;
    L.scrim(x0 - 40, 0, x1 + 40, 80, soft(W / 2, 34, 220, 44, 0.5));
    say(L, m, W / 2 - m.w / 2, 10, C.bone, 0.85);
    cord(L, x0, x1, yc, S.boss.frac);
  }
}
