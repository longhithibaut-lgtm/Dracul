// The three title screens. 1 Le cercueil: the refuge's crypt, the hero's coffin glowing as he re-forms. 2 La lune: the
// hero at the necropolis' edge under a moon shaft. 3 La gravure: the Ancestor's tower and the Aube, scratched in blood.
import { emboss, silver, say, dim, patch, crossLine, drop, embers, C, mix, mul, metal, lin, clamp, fbm, smooth, h2, W, H } from './parts.mjs';

const ITEMS = ['Continuer', 'Nouvelle partie', 'Options', 'Quitter'];
export const TEXTS = {
  t1Title: ['DRACUL', '84px cinzel', 14], t2Title: ['DRACUL', '64px cinzel', 22], t3Title: ['Dracul', '92px gotisch', 2],
  ...Object.fromEntries(ITEMS.map((s, i) => [`t1m${i}`, [s, '24px fell']])),
  ...Object.fromEntries(ITEMS.map((s, i) => [`t2m${i}`, [s.toUpperCase(), '15px cinzel', 3]])),
  ...Object.fromEntries(ITEMS.map((s, i) => [`t3m${i}`, [s, '24px gotisch', 0.5]])),
  tSave: ['La nécropole · 900 de sang au bassin', '13px fellI'], tSave2: ['La nécropole · 900 de sang au bassin', '13px fellI'],
};

// 1. Le cercueil
export function titre1(L, T) {
  const cx = 412, cy = 240; // the hero's coffin, its ashes
  dim(L, 0.3, 0.55, cx, cy);
  L.scrim(0, 0, W, H, patch(480, 52, 260, 60, 0.55));
  L.scrim(0, 0, W, H, patch(480, 430, 200, 95, 0.75));
  // the ashes glow: he re-forms
  L.wash(cx - 90, cy - 80, cx + 90, cy + 50, (x, y) => { const d = Math.hypot((x - cx) / 70, (y - cy - 2) / 26); return [0.75, 0.12, 0.06, 0.38 * (1 - smooth(0.2, 1, d))]; });
  embers(L, cx, cy - 4, 90, 130, 140, 3);
  // the title in tarnished silver, the reliquary line under it
  const m = T.t1Title, x = W / 2 - m.w / 2 + 7, y = 22;
  L.text(m, x + 2, y + 2, () => ({ c: C.ink, flat: true, op: 0.9 }));
  emboss(L, m, x, y, silver(3), 3);
  crossLine(L, W / 2, y + m.h + 8, 140);
  // the menu, centred over the carpet
  let my = 360;
  ITEMS.forEach((_, i) => {
    const t = T[`t1m${i}`], sel = i === 0, tx = W / 2 - t.w / 2;
    say(L, t, tx, my, sel ? C.bone : C.boneDim, sel ? 1 : 0.85);
    if (sel) {
      drop(L, tx - 12, my + t.asc - 2, 0.9); drop(L, tx + t.w + 10, my + t.asc - 2, 0.9);
      my += t.h + 1;
      say(L, T.tSave, W / 2 - T.tSave.w / 2, my, mix(C.boneDim, C.boneDark, 0.3));
      my += T.tSave.h + 8;
    } else my += t.h + 8;
  });
}

// 2. La lune
export function titre2(L, T, hero) {
  const [hx, hy] = hero; // the hero's feet in the capture (native px)
  dim(L, 0.2, 0.6, hx, hy - 40);
  // the moon shaft: cold light falling from the top left onto him, dust in it
  const ax = hx - 120, ay = -20, bx = hx, by = hy - 10, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
  L.wash(0, 0, W, H, (x, y) => {
    const t = ((x - ax) * ux + (y - ay) * uy) / len, d = Math.abs((x - ax) * uy - (y - ay) * ux), r = 22 + t * 30;
    if (t < 0 || t > 1.15) return;
    const k = (1 - smooth(r * 0.55, r, d)) * smooth(0, 0.3, t) * (1 - smooth(1, 1.15, t));
    return [0.62, 0.7, 0.76, 0.16 * k * (0.75 + 0.5 * fbm(x * 0.05 + y * 0.02, y * 0.03, 3, 7))];
  });
  for (let i = 0; i < 70; i++) { // motes
    const t = h2(i, 1, 9), s = (h2(i, 2, 9) - 0.5) * 2, r = 22 + t * 30, x = Math.round(ax + ux * t * len + uy * s * r * 0.8), y = Math.round(ay + uy * t * len - ux * s * r * 0.8);
    L.paint(x, y, x + 1, y + 1, () => ({ c: lin('#c8d4dc'), flat: true, op: 0.35 + h2(i, 3, 9) * 0.5 }));
  }
  L.scrim(0, 0, W, H, (x, y) => 0.5 * smooth(560, 760, x)); // the chasm and the ossuary's wall, out of the way
  // the title, bottom left, wide and thin, cold silver; the menu under it
  const m = T.t2Title, x = 64, y = 296;
  L.scrim(0, 0, W, H, patch(x + m.w / 2, y + 110, m.w / 2 + 110, 170, 0.8));
  L.text(m, x + 2, y + 2, () => ({ c: C.ink, flat: true, op: 0.9 }));
  emboss(L, m, x, y, silver(5, lin('#8a8a84')), 2.5);
  L.paint(x, y + m.h + 8, x + m.w - 20, y + m.h + 9, (px) => ({ h: 1, c: metal(C.silver, px, y, 0.9, 6), s: 0.8, op: 1 - smooth(0.4, 1, (px - x) / (m.w - 20)) }));
  let my = y + m.h + 30;
  ITEMS.forEach((_, i) => {
    const t = T[`t2m${i}`], sel = i === 0;
    if (sel) L.paint(x, my + t.asc / 2 - 1, x + 14, my + t.asc / 2 + 1, (px) => ({ c: C.fresh, flat: true, op: 0.4 + 0.6 * ((px - x) / 14), e: mul(C.blood, 0.4) }));
    say(L, t, x + (sel ? 22 : 0), my, sel ? C.bone : C.boneDim, sel ? 1 : 0.8);
    my += t.h + 10;
  });
}
export { titre3 } from './titre3.mjs';
