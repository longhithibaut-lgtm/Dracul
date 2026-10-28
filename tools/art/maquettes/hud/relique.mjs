// 1. Relique: life as blood in a glass reliquary vial (bottom left), the dash as a bulb of blood mist hung from it,
// the bag as pockets in a worn leather strap, the powers as tarnished medallions on a chain (bottom right).
import { W, lin, clamp, fbm, bayer } from './lib.mjs';
import { C, EMBLEM, item, mouse, spacebar, mix, mul, say, sayRow, soft, metal } from './parts.mjs';
import { h2 } from '../../grand/lib.mjs';

export const TEXTS = {
  rPlace: ['Les catacombes', '30px fell'], rHp: ['38', '23px cinzel'], rHpLow: ['7', '23px cinzel'], rMax: ['/ 50', '13px cinzel'],
  rBlood: ['126', '16px cinzel'], rBloodB: ['212', '16px cinzel'], rCap: ['/ 400', '12px cinzel'], rPrompt: ['Fouiller', '17px fell'],
  rBoss: ['La Nourrice des goules', '18px fell', 0.5], rE: ['E', '13px cinzel'], rR: ['R', '15px cinzel'], rF: ['F', '12px cinzel'],
};
const SLOTS = ['griffes', 'tir', 'glyphe']; // the brume slot is the bulb: its cooldown is the dash's

// rim, hammered field, emblem in relief (rubbed bright, tarnish in the hollows); cd: the dark sector still to recharge
export function medallion(L, cx, cy, r, emblem, { base = C.silver, cd = 0, glow = 0, seed = 1 } = {}) {
  const k = r - 3.2;
  if (glow) L.paint(cx - r - 6, cy - r - 6, cx + r + 6, cy + r + 6, (x, y) => { const d = Math.hypot(x - cx, y - cy) - r; return d > 0 && d < 5 ? { c: mul(C.fresh, 0.5 + 0.5 * (1 - d / 5)), flat: true, op: glow * 0.8 * (1 - d / 5) ** 1.6 } : undefined; });
  L.paint(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > r) return;
    const rim = d > r - 2.2 ? Math.sqrt(Math.max(0, 1 - ((d - (r - 1.1)) / 1.3) ** 2)) : 0, e = EMBLEM[emblem](dx / k, dy / k) * k, raised = clamp(0.6 - e);
    let c = metal(base, x, y, Math.max(rim, raised), seed), em;
    if (glow && raised > 0.3) em = mul(C.blood, 0.45 * glow);
    if (cd && d < r - 2) { const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1; if (a < cd) { c = mul(c, 0.28); em = undefined; } }
    return { h: rim * 2 + 0.6 + raised * 1.4 + fbm(x * 0.8, y * 0.8, 2, seed) * 0.4, c, s: 0.55 * (0.4 + raised), e: em };
  });
}

export function draw(L, S, T) {
  // the reliquary vial, bottom left, standing at the strap's end
  const cx = 34, top = 442, bot = 514, R = 11, level = bot - (S.hp / S.max) * (bot - top - 3);
  L.scrim(0, 380, 300, 540, soft(90, 500, 150, 80, 0.6));
  L.paint(cx - R, top, cx + R + 1, bot + 1, (x, y) => {
    const dx = x - cx, dy = y - Math.min(y, bot - R), d = Math.hypot(dx, dy); if (d > R) return;
    const h = Math.sqrt(R * R - d * d) * 0.9, full = y >= level, grime = fbm(x * 0.3, y * 0.15, 3, 31);
    if (Math.abs(dx + R * 0.55) < 0.9 && y > top + 3 && y < bot - 8 && grime < 0.62) return { h, c: C.bone, flat: true, op: full ? 0.75 : 0.55 }; // the glass catching the light
    if (full) {
      const surf = y < level + 1.5, core = 1 - (dx / R) ** 2;
      return { h, c: surf ? C.bloodLit : mix(C.bloodDeep, C.blood, fbm(x * 0.4, y * 0.2, 3, 4)), s: 0.9, e: mul(surf ? C.blood : C.bloodDeep, (surf ? 0.7 : 0.4) * core * (S.low ? 1.5 : 1)) };
    }
    const stain = fbm(x * 0.5, y * 0.5, 3, 8) > 0.6 && y > level - 14; // the dried line it fell from
    return { h, c: stain ? C.bloodBlack : mix(mul(C.glass, 0.6), C.patina, grime), s: 1, op: stain ? 0.85 : 0.12 + grime * 0.22 };
  });
  for (let k = 10; k < S.max; k += 10) { const y = Math.round(bot - (k / S.max) * (bot - top - 3)); L.paint(cx + R - 4, y, cx + R + 1, y + 1, (x) => ({ h: 2, c: metal(C.brass, x, y, 1, 2), s: 0.6 })); }
  if (S.low) { // cracks, and the blood seeping out of one
    for (const [sx, sy, n, s] of [[cx - 3, level - 2, 12, 3], [cx + 4, top + 10, 10, 5], [cx - 5, top + 26, 8, 9], [cx + 2, top + 40, 9, 12]]) {
      let x = sx, y = sy;
      for (let i = 0; i < n; i++) { const px = Math.round(x), py = Math.round(y); L.paint(px, py, px + 1, py + 1, () => ({ c: C.bone, flat: true, op: 0.95 })); x += (h2(i, s, 3) - 0.5) * 2.4; y += h2(i, s, 4) > 0.25 ? 1 : 0; }
    }
    L.paint(cx + R, level + 2, cx + R + 2, bot + 12, (x, y) => (x < cx + R + 1 || y > bot + 6 ? { h: 1, c: C.blood, s: 1, e: mul(C.bloodDeep, 0.4) } : undefined));
  }
  // collar with its little crown, stopper and the cross on top
  L.paint(cx - R - 3, top - 7, cx + R + 4, top + 1, (x, y) => {
    const dx = x - cx; if (Math.abs(dx) > R + 3) return;
    const r = Math.sqrt(Math.max(0, (R + 3) ** 2 - dx * dx)), band = Math.abs(y - (top - 3.5)) < 0.7;
    return { h: r * 0.5 + (band ? 0.8 : 0), c: metal(C.silver, x, y, (r / (R + 3)) * (band ? 1 : 0.6), 3), s: 0.7 };
  });
  L.paint(cx - R - 3, top - 12, cx + R + 4, top - 6, (x, y) => { const dx = x - cx, p = Math.abs(((dx + R + 3) % 5.5) - 2.75); return y > top - 7 - (2.75 - p) * 1.8 && Math.abs(dx) <= R + 3 ? { h: 1.5, c: metal(C.silver, x, y, 0.8, 3), s: 0.7 } : undefined; });
  L.paint(cx - 6, top - 16, cx + 7, top - 7, (x, y) => { const d = Math.hypot(x - cx, (y - (top - 7)) * 0.9); if (d > 6) return; return { h: Math.sqrt(36 - d * d), c: metal(C.silver, x, y, 1 - d / 6, 3), s: 0.7 }; });
  L.paint(cx - 4, top - 27, cx + 5, top - 15, (x, y) => (Math.abs(x - cx) < 1.1 || (Math.abs(y - (top - 23)) < 1 && Math.abs(x - cx) < 4) ? { h: 2, c: metal(C.silver, x, y, 1, 5), s: 0.8 } : undefined));
  // the foot
  L.paint(cx - R - 8, bot - 1, cx + R + 9, bot + 15, (x, y) => { const t = (y - bot + 1) / 15, hw = R + 1 + t * 7, dx = x - cx; if (Math.abs(dx) > hw) return; return { h: Math.sqrt(Math.max(0, 1 - (dx / hw) ** 2)) * 3.5 - (Math.abs(y - (bot + 5)) < 0.6 ? 1 : 0), c: metal(C.silver, x, y, 0.6, 6), s: 0.6 }; });

  // the mist: a bulb of clotted-blood vapour hung from the collar, full when the dash is back
  const bx = cx + R + 18, by = top + 4, br = 8;
  L.paint(cx + R + 3, top - 5, bx - br + 2, top - 3, (x, y) => ({ h: 1, c: metal(C.silver, x, y, 0.6), s: 0.8 }));
  L.paint(bx - 3, by - br - 6, bx + 4, by - br + 1, (x, y) => ({ h: 1.5, c: metal(C.silver, x, y, 0.7, 4), s: 0.7 }));
  L.paint(bx - br, by - br, bx + br + 1, by + br + 1, (x, y) => {
    const d = Math.hypot(x - bx, y - by); if (d > br) return;
    const h = Math.sqrt(br * br - d * d), filled = y > by + br - 2 * br * S.dash, n = fbm(x * 0.45, y * 0.45 + 3, 3, 11);
    if (Math.abs(x - bx + 4) < 0.8 && y < by - 1) return { h, c: C.bone, flat: true, op: 0.65 };
    return filled ? { h, c: mix(C.bloodBlack, C.mist, n * 1.2), s: 0.9, e: mul(C.mist, S.dash >= 1 ? 0.22 : 0.04) } : { h, c: C.glass, s: 1, op: 0.22 };
  });
  spacebar(L, bx - 6, by + br + 3, C.boneDim);

  // the life and the blood carried, in numbers
  const nx = cx + R + 9;
  sayRow(L, [[S.low ? T.rHpLow : T.rHp, S.low ? C.fresh : C.bone], [T.rMax, C.boneDim]], nx, 482);
  const dy = 488, ddx = nx;
  L.paint(ddx, dy, ddx + 10, dy + 14, (x, y) => { const u = x - (ddx + 5), v = y - (dy + 9); const d = v < 0 ? Math.abs(u) - (v + 9) * 0.5 : Math.hypot(u, v) - 4.4; if (d > 0 || (v < 0 && Math.abs(u) > 4.5)) return; return { h: Math.sqrt(Math.max(0, 20 - u * u - Math.max(0, v) ** 2)), c: C.blood, s: 1, e: mul(C.bloodDeep, 0.5) }; });
  sayRow(L, [[S.boss ? T.rBloodB : T.rBlood, C.bone], [T.rCap, C.boneDim]], ddx + 13, dy + 13);

  // the worn leather strap: a pocket per place in the bag
  const sx = cx + R + 6, sy = 508, sh = 24, sw = 12 + S.bag * 22;
  L.paint(sx, sy, sx + sw, sy + sh, (x, y) => {
    const fray = (fbm(y * 0.5, x * 0.02, 2, 13) - 0.5) * 7; if (x < sx + 3 + fray || x > sx + sw - 3 - fray) return;
    const u = (y - sy) / sh, stitch = (Math.abs(y - (sy + 2.5)) < 0.6 || Math.abs(y - (sy + sh - 2.5)) < 0.6) && (x - sx) % 4 < 2;
    const wear = fbm(x * 0.2, y * 0.35, 4, 14), scratch = fbm(x * 0.9, y * 0.12, 2, 15) > 0.7;
    const seam = (x - sx - 6) % 22 < 1 && x > sx + 10 && x < sx + sw - 10 && (y - sy) % 3 < 2; // the loops' stitching
    return { h: Math.sin(u * Math.PI) * 2.2 + wear * 1.4 + (stitch || seam ? 0.8 : 0), c: stitch || seam ? C.thread : scratch ? C.leatherDark : mix(lin('#120a05'), lin('#5c2e16'), 0.1 + wear * 0.8), s: 0.15 };
  });
  for (let i = 0; i < S.bag; i++) {
    const px = sx + 17 + i * 22, py = sy + sh / 2;
    if (S.items[i]) item(L, S.items[i], px, py, 1, 1.45);
    else L.paint(px - 5, py - 5, px + 6, py + 6, (x, y) => (Math.abs(Math.hypot(x - px, (y - py) * 1.2) - 4) < 0.8 ? { add: true, h: -1, m: 0.45 } : undefined)); // an empty loop's worn ring
  }

  // the powers: tarnished medallions hung from a chain, bottom right; la Nuée the big one, red when ready
  const x0 = 800, x1 = 948, chainY = (x) => 474 + Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 5;
  L.scrim(720, 400, 960, 540, soft(870, 505, 150, 75, 0.6));
  for (let x = x0; x < x1; x += 4) {
    const y = chainY(x), even = Math.round((x - x0) / 4) % 2 === 0;
    L.paint(x - 3, y - 3, x + 4, y + 3, (px, py) => { const d = even ? Math.abs(Math.hypot((px - x - 0.5) / 2.6, (py - y) / 1.7) - 1) : Math.abs(py - y) < 0.7 && Math.abs(px - x - 0.5) < 2.4 ? 0 : 1; return d < 0.42 ? { h: 1.5, c: metal(C.iron, px, py, 0.7, 2), s: 0.6 } : undefined; });
  }
  const at = [[814, 13], [846, 13], [878, 13], [922, 18]];
  [...SLOTS, 'rat'].forEach((e, i) => {
    const [x, r] = at[i], y = chainY(x) + r + 4, rat = e === 'rat';
    L.paint(x - 1, chainY(x), x + 2, y - r + 1, () => ({ h: 1, c: C.iron, s: 0.5 }));
    medallion(L, x, y, r, e, { base: rat ? C.gold : C.silver, cd: rat ? 0 : S.cd[e], glow: rat && S.nuee ? 1 : 0, seed: i + 2 });
    const ky = y + r + 4;
    if (e === 'griffes' || e === 'tir') mouse(L, x - 3, ky, e === 'griffes' ? 'l' : 'r', C.boneDim, C.bone);
    else { const m = rat ? T.rR : T.rE; say(L, m, x - m.w / 2, ky - 3, rat ? C.bone : C.boneDim); }
  });

  if (S.place) { // the place's name on entry, over a thin engraved line with a reliquary cross
    const m = T.rPlace, x = W / 2 - m.w / 2, y = 36;
    L.scrim(x - 60, y - 30, x + m.w + 60, y + 70, soft(W / 2, y + 16, m.w / 2 + 70, 40, 0.5));
    say(L, m, x, y, C.bone);
    L.paint(W / 2 - 90, y + m.h + 4, W / 2 + 91, y + m.h + 11, (px, py) => {
      const dx = px - W / 2, yy = y + m.h + 7.5, cross = (Math.abs(dx) < 1 && Math.abs(py - yy) < 3.5) || (Math.abs(py - yy + 1) < 0.6 && Math.abs(dx) < 2.6);
      const line = Math.abs(py - yy) < 0.6 && Math.abs(dx) > 6 && bayer(px, 1) < 1.1 - Math.abs(dx) / 80;
      return cross || line ? { h: 1.2, c: metal(C.silver, px, py, 1, 4), s: 0.8 } : undefined;
    });
  }
  if (S.prompt) { // « Fouiller » with its key on a small coin
    const [px, py] = S.prompt, m = T.rPrompt, x0 = px - (m.w + 18) / 2;
    L.scrim(x0 - 14, py - 14, x0 + m.w + 34, py + 26, soft(px, py + 7, m.w / 2 + 26, 16, 0.55));
    L.paint(x0, py, x0 + 16, py + 16, (x, y) => { const d = Math.hypot(x - x0 - 8, y - py - 8); if (d > 7.5) return; return { h: d > 6 ? 1.6 : 0.4, c: metal(C.silver, x, y, d > 6 ? 0.9 : 0.15, 8), s: 0.6 }; });
    L.text(T.rF, x0 + 8 - T.rF.w / 2 + 0.5, py + 8 - T.rF.h / 2 + 0.5, () => ({ add: true, h: 1.4, c: C.bone }));
    say(L, m, x0 + 20, py, C.bone);
  }
  if (S.boss) { // her blood in a long glass ampoule, top middle; her name above it
    const m = T.rBoss, x0 = 300, x1 = 660, yc = 40, r = 4, fx = x0 + S.boss.frac * (x1 - x0);
    L.scrim(x0 - 40, 0, x1 + 40, 80, soft(W / 2, 32, 220, 44, 0.55));
    say(L, m, W / 2 - m.w / 2, 10, C.bone);
    L.paint(x0, yc - r, x1, yc + r + 1, (x, y) => {
      const dy = y - yc, h = Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.9; if (Math.abs(dy) > r) return;
      if (Math.abs(dy + 2) < 0.6 && fbm(x * 0.15, 0, 2, 25) > 0.45) return { h, c: C.bone, flat: true, op: 0.4 };
      if (x < fx) return { h, c: dy < -1.5 && x > fx - 2 ? C.bloodLit : mix(C.bloodDeep, C.blood, fbm(x * 0.2, y * 0.5, 2, 21)), s: 0.9, e: mul(C.bloodDeep, 0.5) };
      return { h, c: fbm(x * 0.4, y, 2, 22) > 0.6 ? C.bloodBlack : C.glass, s: 1, op: 0.3 };
    });
    for (let k = 1; k < 4; k++) { const x = Math.round(x0 + (k / 4) * (x1 - x0)); L.paint(x, yc - r - 1, x + 2, yc + r + 2, (px, py) => ({ h: 1.5, c: metal(C.brass, px, py, 0.8, 24), s: 0.6 })); }
    for (const [ex, dir] of [[x0, -1], [x1, 1]]) L.paint(ex - 13, yc - 8, ex + 14, yc + 9, (x, y) => {
      const u = (x - ex) * dir, dy = y - yc; if (u < -2 || u > 12) return;
      const hw = u < 4 ? 6.5 : u < 7 ? 4 : u < 10 ? 2 : 3; if (Math.abs(dy) > hw) return;
      return { h: Math.sqrt(Math.max(0, hw * hw - dy * dy)), c: metal(C.brass, x, y, 0.7, 23), s: 0.7 };
    });
  }
}
