// 3. Gravure: one forged iron strip at the bottom middle, everything carved in it and inlaid with bone: the life as
// a groove of blood and its numbers in gothic letters, the four powers in bone sockets round a keystone (la Nuée), the
// blood carried and the bag's sockets. Readable first, closer to Darkest Dungeon.
import { W, lin, clamp, fbm } from './lib.mjs';
import { C, EMBLEM, item, mouse, spacebar, mix, mul, say, soft, metal, sdTaper } from './parts.mjs';
import { h2 } from '../../grand/lib.mjs';

export const TEXTS = {
  gPlace: ['Les Catacombes', '27px gotisch', 0.5], gHp: ['38', '24px gotisch'], gHpLow: ['7', '24px gotisch'], gMax: ['/50', '14px gotisch'],
  gBlood: ['126', '16px gotisch'], gBloodB: ['212', '16px gotisch'], gCap: ['/400', '12px gotisch'], gPrompt: ['Fouiller', '17px gotisch'],
  gBoss: ['La Nourrice des goules', '17px gotisch', 0.5], gE: ['E', '12px gotisch'], gR: ['R', '13px gotisch'], gF: ['F', '15px gotisch'],
};
const IRON = [lin('#0c0a08'), lin('#26231e'), lin('#4a4438')]; // warm, near black: the cold greys read as cloth
// forged iron: dark, hammered, rust in patches
const iron = (x, y, lit = 0.5) => { const n = fbm(x * 0.12, y * 0.12, 4, 101), r = fbm(x * 0.1, y * 0.25, 3, 102); return mix(mix(IRON[0], IRON[1], 0.35 + (n - 0.5) * 0.5 + lit * 0.4), C.rust, r > 0.58 ? Math.min(0.7, (r - 0.58) * 3) : 0); };
const inlay = (h = -1.2, c = C.bone) => () => ({ add: true, h, c, s: 0.25 });
const carve = (L, m, x, y, c = C.bone) => L.text(m, x, y, inlay(-1.2, c));

// an iron plate: x0..x1, y0..y1, bevelled, an engraved line round it, a rivet in each corner
function plate(L, x0, y0, x1, y1, { rivets = true, notch = 0 } = {}) {
  L.paint(x0, y0, x1, y1, (x, y) => {
    const d = Math.min(x - x0, x1 - x, y - y0, y1 - y) - (notch ? Math.max(0, notch - Math.min(x - x0, x1 - x)) * 0 : 0);
    if (notch && Math.min(x - x0, x1 - x) < notch && Math.abs(y - (y0 + y1) / 2) > (y1 - y0) / 2 - (notch - Math.min(x - x0, x1 - x))) return; // pointed ends
    const bevel = Math.min(1, d / 2.5), line = Math.abs(d - 4) < 0.6;
    return { h: bevel * 2.5 + fbm(x * 0.3, y * 0.3, 2, 103) * 0.5 - (line ? 1 : 0), c: line ? IRON[0] : iron(x, y, 0.4 + bevel * 0.6), s: 0.25 };
  });
  if (rivets) for (const [x, y] of [[x0 + 7, y0 + 7], [x1 - 7, y0 + 7], [x0 + 7, y1 - 7], [x1 - 7, y1 - 7]]) rivet(L, x, y);
}
function rivet(L, x, y, r = 2.2) { L.paint(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py) => { const d = Math.hypot(px - x, py - y); return d < r ? { add: true, h: Math.sqrt(r * r - d * d) * 1.4, c: iron(px, py, 1), s: 0.6 } : undefined; }); }

// a bone socket sunk in the iron, its emblem carved; cd: the share still to recharge, darkened
function socket(L, cx, cy, hw, emblem, cd = 0, glow = 0) {
  L.paint(cx - hw, cy - hw, cx + hw, cy + hw, (x, y) => {
    const dx = x - cx, dy = y - cy, d = hw - Math.max(Math.abs(dx), Math.abs(dy)), k = hw - 3.5;
    if (d < 1.2) return { add: true, h: -0.5, c: IRON[0] }; // the seat's shadow
    const e = emblem ? EMBLEM[emblem](dx / k, dy / k) * k : 9, cut = e < 0.2, n = fbm(x * 0.4, y * 0.4, 3, 104);
    let c = cut ? mix(lin('#2a1c12'), lin('#4a2a1a'), n) : mix(C.boneDim, C.bone, 0.25 + n * 0.6), em;
    if (cut && glow) { c = mix(C.bloodDeep, C.bloodLit, n); em = mul(C.blood, 0.6 * glow); }
    const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
    if (cd && a < cd) { c = mul(c, 0.45); em = undefined; }
    return { add: true, h: -1.5 + Math.min(1, d / 2) * 0.8 - (cut ? 1 : 0), c, s: cut ? 0.1 : 0.3, e: em };
  });
}

export function draw(L, S, T) {
  const x0 = 262, x1 = 698, y0 = 500, y1 = 537, mid = W / 2;
  L.scrim(x0 - 50, y0 - 40, x1 + 50, 540, (x, y) => 0.55 * (1 - clamp((Math.max(x0 - x, x - x1, y0 - 14 - y, 0)) / 40)));
  plate(L, x0, y0, x1, y1);
  // the keystone over la Nuée
  L.paint(mid - 22, y0 - 16, mid + 23, y1, (x, y) => {
    const dx = x - mid, top = y0 - 16 + Math.max(0, Math.abs(dx) - 10) * 0.9; if (y < top || Math.abs(dx) > 22) return;
    const d = Math.min(22 - Math.abs(dx), y - top), bevel = Math.min(1, d / 2.5);
    return { h: 3 + bevel * 2.5 + fbm(x * 0.5, y * 0.5, 2, 105) * 0.6, c: iron(x, y, 0.5 + bevel * 0.5), s: 0.4 };
  });
  // section dividers: a carved groove with a rivet
  for (const x of [410, 552]) { L.paint(x, y0 + 5, x + 1, y1 - 5, () => ({ add: true, h: -1, c: IRON[0] })); rivet(L, x + 0.5, (y0 + y1) / 2); }

  // the life: its numbers carved and inlaid with bone (blood red when low), the groove of blood beside them
  const hm = S.low ? T.gHpLow : T.gHp, hc = S.low ? C.fresh : C.bone, base = 527;
  if (S.low) L.text(hm, 300 - hm.w, base - hm.asc, () => ({ add: true, h: -1.2, c: C.fresh, e: mul(C.blood, 0.6), s: 0.2 }));
  else carve(L, hm, 300 - hm.w, base - hm.asc);
  carve(L, T.gMax, 300, base - T.gMax.asc, C.boneDim);
  const gx0 = 326, gx1 = 400, gy0 = 509, gy1 = 521, fill = gx0 + (S.hp / S.max) * (gx1 - gx0);
  L.paint(gx0 - 1, gy0 - 1, gx1 + 1, gy1 + 1, (x, y) => {
    const edge = x < gx0 || x >= gx1 || y < gy0 || y >= gy1;
    if (edge) return { add: true, h: -0.8, c: IRON[0] };
    const v = (y - gy0) / (gy1 - gy0), tick = (Math.round(x - gx0) % Math.round((gx1 - gx0) / 5) === 0) && x > gx0 + 1;
    if (x < fill) return { add: true, h: -2 + Math.sin(v * Math.PI) * 1.2, c: v < 0.2 ? C.bloodLit : mix(C.blood, C.bloodDeep, v), s: 0.3, e: mul(C.bloodDeep, 0.5) };
    return { add: true, h: -2.5, c: tick ? IRON[1] : mix(IRON[0], C.bloodBlack, fbm(x * 0.4, y * 0.4, 2, 107) > 0.55 ? 0.8 : 0), s: 0.1 };
  });
  if (S.low) { // a crack across the plate by the groove, blood seeping in it
    let x = 318, y = y0 + 2;
    for (let i = 0; i < 40 && y < y1 - 1; i++) {
      const px = Math.round(x), py = Math.round(y);
      L.paint(px, py, px + 2, py + 1, () => ({ add: true, h: -2, c: i % 3 ? C.bloodDeep : C.ink, e: i % 3 ? mul(C.blood, 0.4) : undefined }));
      x += (h2(i, 5, 108) - 0.35) * 2; y += h2(i, 6, 108) > 0.3 ? 1 : 0;
    }
  }

  // the powers: griffes, tir | la Nuée | glyphe, brume
  const keyY = 534;
  [['griffes', 425], ['tir', 448], ['glyphe', 512], ['brume', 535]].forEach(([e, x]) => {
    const cd = e === 'brume' ? 1 - S.dash : S.cd[e];
    socket(L, x, 513, 10, e, cd);
    if (e === 'griffes' || e === 'tir') mouse(L, x - 3, keyY - 9, e === 'griffes' ? 'l' : 'r', C.boneDim, C.bone);
    else if (e === 'glyphe') carve(L, T.gE, x - T.gE.w / 2 + 1, keyY - T.gE.asc + 1, C.boneDim);
    else spacebar(L, x - 6, keyY - 4, C.boneDim);
  });
  L.paint(mid - 15, 490, mid + 16, 521, (x, y) => { const d = Math.hypot(x - mid, y - 505); return d < 15 && d > 13 ? { add: true, h: -1, c: IRON[0] } : undefined; });
  L.paint(mid - 13, 492, mid + 14, 519, (x, y) => { // the Nuée's bone disc, the rat carved, red when ready
    const dx = x - mid, dy = y - 505, d = Math.hypot(dx, dy); if (d > 12.5) return;
    const e = EMBLEM.rat(dx / 10, dy / 10) * 10, cut = e < 0.5, n = fbm(x * 0.4, y * 0.4, 3, 109);
    return cut ? { add: true, h: -2, c: S.nuee ? mix(C.bloodDeep, C.bloodLit, n) : lin('#2a1c12'), s: 0.2, e: S.nuee ? mul(C.blood, 0.7) : undefined }
      : { add: true, h: -0.5 + Math.sqrt(Math.max(0, 156 - d * d)) * 0.12, c: mix(C.boneDim, C.bone, 0.3 + n * 0.6), s: 0.3 };
  });
  carve(L, T.gR, mid - T.gR.w / 2 + 1, keyY - T.gR.asc + 1, S.nuee ? C.bone : C.boneDim);

  // the blood carried, then the bag's sockets (a riveted plate over the places not bought yet)
  const bx = 562;
  L.paint(bx, 504, bx + 8, 515, (x, y) => { const u = x - (bx + 4), v = y - 511; const inside = v < 0 ? Math.abs(u) < (v + 7) * 0.5 : Math.hypot(u, v) < 3.6; return inside ? { add: true, h: -1.5, c: C.blood, e: mul(C.bloodDeep, 0.5), s: 0.4 } : undefined; });
  const bm = S.boss ? T.gBloodB : T.gBlood;
  carve(L, bm, bx + 10, 516 - bm.asc);
  carve(L, T.gCap, bx + 10 + bm.w - 3, 516 - T.gCap.asc, C.boneDim);
  for (let i = 0; i < 7; i++) {
    const cx = bx + 7 + i * 17, cy = 526;
    if (i >= S.bag) { L.paint(cx - 7, cy - 7, cx + 8, cy + 8, (x, y) => ({ add: true, h: 0.8, c: iron(x, y, 0.8) })); rivet(L, cx + 0.5, cy + 0.5, 1.8); continue; }
    L.paint(cx - 7, cy - 7, cx + 8, cy + 8, (x, y) => { const d = 7.5 - Math.max(Math.abs(x - cx - 0.5), Math.abs(y - cy - 0.5)); return { add: true, h: -1.8 + Math.min(1, d / 2), c: d < 1 ? IRON[0] : mix(lin('#1a1611'), lin('#2b251d'), fbm(x * 0.5, y * 0.5, 2, 110)) }; });
    if (S.items[i]) item(L, S.items[i], cx + 0.5, cy + 0.5, 1, 1.15);
  }

  if (S.place) { // the place's name carved in an iron plaque with pointed ends
    const m = T.gPlace, pw = m.w + 56, px0 = mid - pw / 2, py0 = 28, py1 = py0 + m.h + 12;
    L.scrim(px0 - 30, py0 - 20, px0 + pw + 30, py1 + 24, soft(mid, (py0 + py1) / 2, pw / 2 + 30, 40, 0.5));
    plate(L, px0, py0, px0 + pw, py1, { rivets: false, notch: 10 });
    rivet(L, px0 + 16, (py0 + py1) / 2); rivet(L, px0 + pw - 16, (py0 + py1) / 2);
    carve(L, m, mid - m.w / 2, py0 + 6);
  }
  if (S.prompt) { // « Fouiller »: an iron tag, its key in a bone socket
    const [qx, qy] = S.prompt, m = T.gPrompt, tw = m.w + 34, tx = qx - tw / 2;
    L.scrim(tx - 16, qy - 14, tx + tw + 16, qy + 34, soft(qx, qy + 10, tw / 2 + 16, 20, 0.5));
    plate(L, tx, qy - 2, tx + tw, qy + 22, { rivets: false });
    socket(L, tx + 13, qy + 10, 7.5, null);
    carve(L, T.gF, tx + 13 - T.gF.w / 2 + 1, qy + 15 - T.gF.asc, lin('#2a1c12'));
    carve(L, m, tx + 24, qy + 16 - m.asc);
  }
  if (S.boss) { // her blood in an iron frame between two skulls, her name on a plate above
    const m = T.gBoss, bx0 = 300, bx1 = 660, by0 = 34, by1 = 48, fx = bx0 + 8 + S.boss.frac * (bx1 - bx0 - 16);
    L.scrim(bx0 - 50, 0, bx1 + 50, 80, soft(mid, 34, 230, 46, 0.55));
    plate(L, bx0, by0, bx1, by1, { rivets: false });
    L.paint(bx0 + 7, by0 + 4, bx1 - 7, by1 - 4, (x, y) => {
      const v = (y - by0 - 4) / (by1 - by0 - 8);
      if (x < fx) return { add: true, h: -1.5 + Math.sin(v * Math.PI), c: v < 0.3 ? C.bloodLit : mix(C.bloodDeep, C.blood, fbm(x * 0.2, y * 0.5, 2, 111)), s: 0.5, e: mul(C.bloodDeep, 0.5) };
      return { add: true, h: -2.2, c: mix(IRON[0], C.bloodBlack, fbm(x * 0.3, y * 0.6, 2, 112) > 0.55 ? 0.8 : 0) };
    });
    for (let k = 1; k < 4; k++) { const x = Math.round(bx0 + (k / 4) * (bx1 - bx0)); L.paint(x, by0 + 2, x + 1, by1 - 2, () => ({ add: true, h: 1, c: IRON[2] })); }
    const pw = m.w + 40, px0 = mid - pw / 2;
    plate(L, px0, 8, px0 + pw, by0 + 1, { rivets: false, notch: 8 });
    carve(L, m, mid - m.w / 2, 13);
    for (const sx of [bx0 - 8, bx1 + 8]) skull(L, sx, (by0 + by1) / 2);
  }
}

// a small skull in bone
function skull(L, cx, cy) {
  L.paint(cx - 10, cy - 11, cx + 11, cy + 12, (x, y) => {
    const u = x - cx, v = y - cy, cran = Math.hypot(u, (v + 2) * 1.05) < 8.5, jaw = Math.abs(u) < 5 - Math.max(0, v - 5) * 0.4 && v >= 3 && v < 10;
    if (!cran && !jaw) return;
    const eye = Math.hypot(Math.abs(u) - 3.4, v - 0.5) < 2.2, nose = Math.abs(u) < 1.2 && v > 3 && v < 5.5 - Math.abs(u), teeth = v > 6.5 && v < 7.5 && Math.round(u) % 2 === 0;
    const n = fbm(x * 0.5, y * 0.5, 3, 113);
    if (eye || nose || teeth) return { h: 1, c: C.ink, s: 0 };
    return { h: (cran ? Math.sqrt(Math.max(0, 72 - u * u - (v + 2) ** 2)) * 0.6 : 2) + n, c: mix(C.boneDim, C.bone, 0.2 + n * 0.6), s: 0.3 };
  });
}
