// The pause menu (Échap), over the game dimmed, the HUD left lit: 1 Relique (silver, IM Fell, blood drops), 2 Gravure
// (an iron plate, the words carved and inlaid with bone). Abandoning says what is lost: the blood and the finds carried.
import { emboss, silver, say, dim, patch, crossLine, drop, keycap, C, mix, mul, metal, lin, clamp, fbm, W, H } from './parts.mjs';
import { item } from '../hud/parts.mjs';

const ITEMS = ['Reprendre', 'Options', 'Le sac', 'Abandonner l’expédition', 'Quitter vers le titre'];
const LOSS = 'Comme à la mort : le sang porté et ce qui a été trouvé en route sont perdus.';
export const TEXTS = {
  ...Object.fromEntries(ITEMS.map((s, i) => [`p1m${i}`, [s, '22px fell']])),
  ...Object.fromEntries(ITEMS.map((s, i) => [`p2m${i}`, [s, '20px gotisch', 0.3]])),
  p1Place: ['Les catacombes', '30px fell'], p1Loss: [LOSS, '14px fellI'], p1Blood: ['126', '16px cinzel'],
  p1I: ['I', '11px cinzel'], p1Esc: ['Échap', '13px fell'], p1Ent: ['Entrée', '13px fell'], p1Back: ['reprendre', '15px fell'], p1Ok: ['choisir', '15px fell'],
  p2Place: ['Les Catacombes', '24px gotisch', 0.5], p2Loss: ['perdus : le sang porté et les trouvailles', '13px gotisch', 0.3], p2Blood: ['126', '15px gotisch'],
  p2I: ['I', '12px cinzel'], p2Back: ['Échap : reprendre', '12px gotisch', 0.3],
};
// what the pause draws under the HUD: the game dimmed
export const dimGame = (L) => dim(L, 0.6, 0.3);

// the blood and the finds carried, in a row: what abandoning loses; its width
const LOSS_W = (T, S) => 24 + T.p1Blood.w + S.items.length * 22;
function losses(L, T, S, x, y, blood) {
  drop(L, x + 5, y + 13, 1.1);
  blood(x + 14, y);
  let ix = x + 24 + T.p1Blood.w;
  for (const name of S.items) { item(L, name, ix + 10, y + 9, 1, 1.5); ix += 22; }
}

// 1. Relique
export function relique(L, T, S) {
  const cx = W / 2;
  L.scrim(0, 0, W, H, patch(cx, 240, 260, 210, 0.45));
  const pm = T.p1Place;
  say(L, pm, cx - pm.w / 2, 70, C.bone);
  crossLine(L, cx, 70 + pm.h + 7, 100);
  let y = 150;
  ITEMS.forEach((_, i) => {
    const m = T[`p1m${i}`], sel = i === 3, x = cx - m.w / 2 - (i === 2 ? 10 : 0);
    say(L, m, x, y, sel ? C.bone : C.boneDim, sel ? 1 : 0.9);
    if (i === 2) keycap(L, T.p1I, x + m.w + 4, y + m.asc - 12);
    if (sel) {
      drop(L, x - 12, y + m.asc - 2, 0.9); drop(L, x + m.w + 10, y + m.asc - 2, 0.9);
      y += m.h + 3;
      const l = T.p1Loss; say(L, l, cx - l.w / 2, y, mix(C.fresh, C.bone, 0.3));
      y += l.h + 4;
      losses(L, T, S, cx - LOSS_W(T, S) / 2, y, (bx, by) => say(L, T.p1Blood, bx, by + 2, C.bone));
      y += 30;
    } else y += m.h + 9;
  });
  // the keys, bottom middle
  let kx = cx - 100; const ky = 470;
  kx += keycap(L, T.p1Esc, kx, ky) + 4; say(L, T.p1Back, kx, ky - 1, C.boneDim); kx += T.p1Back.w + 18;
  kx += keycap(L, T.p1Ent, kx, ky) + 4; say(L, T.p1Ok, kx, ky - 1, C.boneDim);
}

// 2. Gravure: the HUD's forged iron
const IRON = [lin('#0c0a08'), lin('#26231e'), lin('#4a4438')];
const iron = (x, y, lit = 0.5) => { const n = fbm(x * 0.12, y * 0.12, 4, 101), r = fbm(x * 0.1, y * 0.25, 3, 102); return mix(mix(IRON[0], IRON[1], 0.35 + (n - 0.5) * 0.5 + lit * 0.4), C.rust, r > 0.58 ? Math.min(0.7, (r - 0.58) * 3) : 0); };
const carve = (L, m, x, y, c = C.bone, e) => L.text(m, x, y, () => ({ add: true, h: -1.2, c, s: 0.25, e }));
function plate(L, x0, y0, x1, y1, { rivets = true, notch = 0 } = {}) {
  L.paint(x0, y0, x1, y1, (x, y) => {
    const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);
    if (notch && Math.min(x - x0, x1 - x) < notch && Math.abs(y - (y0 + y1) / 2) > (y1 - y0) / 2 - (notch - Math.min(x - x0, x1 - x))) return;
    const bevel = Math.min(1, d / 2.5), line = Math.abs(d - 4) < 0.6;
    return { h: bevel * 2.5 + fbm(x * 0.3, y * 0.3, 2, 103) * 0.5 - (line ? 1 : 0), c: line ? IRON[0] : iron(x, y, 0.4 + bevel * 0.6), s: 0.25 };
  });
  if (rivets) for (const [x, y] of [[x0 + 7, y0 + 7], [x1 - 7, y0 + 7], [x0 + 7, y1 - 7], [x1 - 7, y1 - 7]]) rivet(L, x, y);
}
function rivet(L, x, y, r = 2.2, glow) { L.paint(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py) => { const d = Math.hypot(px - x, py - y); return d < r ? { add: true, h: Math.sqrt(r * r - d * d) * 1.4, c: glow ? mix(C.bloodDeep, C.bloodLit, 1 - d / r) : iron(px, py, 1), s: 0.6, e: glow ? mul(C.blood, 0.6) : undefined } : undefined; }); }

export function gravure(L, T, S) {
  const cx = W / 2, x0 = cx - 150, x1 = cx + 150, y0 = 108, y1 = 420;
  L.scrim(x0 - 60, y0 - 70, x1 + 60, y1 + 50, patch(cx, (y0 + y1) / 2, 230, 220, 0.5));
  plate(L, x0, y0, x1, y1);
  // the place on a plaque with pointed ends, over the plate's top edge
  const pm = T.p2Place, pw = pm.w + 50;
  plate(L, cx - pw / 2, y0 - 22, cx + pw / 2, y0 + 14, { rivets: false, notch: 10 });
  rivet(L, cx - pw / 2 + 15, y0 - 4); rivet(L, cx + pw / 2 - 15, y0 - 4);
  carve(L, pm, cx - pm.w / 2, y0 - 19);
  // the entries, each in its band, a groove between them; the chosen one with a blood groove and two red rivets
  let y = y0 + 34;
  ITEMS.forEach((_, i) => {
    const m = T[`p2m${i}`], sel = i === 0, bh = i === 3 ? 70 : 42, mid = y + (i === 3 ? 20 : bh / 2);
    if (i) L.paint(x0 + 14, y - 1, x1 - 14, y, () => ({ add: true, h: -1, c: IRON[0] }));
    if (sel) {
      L.paint(x0 + 22, mid - 15, x1 - 22, mid + 15, (px, py) => { const d = Math.min(px - x0 - 22, x1 - 22 - px, py - mid + 15, mid + 15 - py); return { add: true, h: d < 1.2 ? -0.5 : -1.8, c: d < 1.2 ? IRON[0] : mix(C.bloodBlack, C.bloodDeep, fbm(px * 0.2, py * 0.3, 2, 120)), s: 0.3, e: mul(C.bloodDeep, 0.25) }; });
      rivet(L, x0 + 34, mid, 2.6, true); rivet(L, x1 - 34, mid, 2.6, true);
    }
    const tx = cx - m.w / 2 - (i === 2 ? 11 : 0);
    carve(L, m, tx, mid - m.asc / 2 - 2 - (i === 3 ? 0 : 0), sel ? C.bone : mix(C.boneDim, C.bone, 0.35));
    if (i === 2) { // the key in a bone socket
      const sx = tx + m.w + 6, sy = mid - 8;
      L.paint(sx, sy, sx + 15, sy + 15, (px, py) => { const d = 7.5 - Math.max(Math.abs(px - sx - 7.5), Math.abs(py - sy - 7.5)); return { add: true, h: -1.5 + Math.min(1, d / 2) * 0.8, c: d < 1.2 ? IRON[0] : mix(C.boneDim, C.bone, 0.3 + fbm(px * 0.4, py * 0.4, 3, 104) * 0.6), s: 0.3 }; });
      carve(L, T.p2I, sx + 7.5 - T.p2I.w / 2 + 1, sy + 12 - T.p2I.asc, lin('#2a1c12'));
    }
    if (i === 3) { // what is lost, carved in red, and the finds behind a red bar
      const l = T.p2Loss; carve(L, l, cx - l.w / 2, mid + 11, C.bloodLit, mul(C.bloodDeep, 0.4));
      losses(L, T, S, cx - LOSS_W(T, S) / 2, mid + 27, (bx, by) => carve(L, T.p2Blood, bx, by + 2));
    }
    y += bh;
  });
  carve(L, T.p2Back, cx - T.p2Back.w / 2, y1 - 22, C.boneDim);
}
