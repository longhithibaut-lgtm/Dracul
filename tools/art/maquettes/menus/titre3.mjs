// 3. La gravure: a scratchboard in blood. Each place has a tone (how lit, 0..1) and a hatch; lines are scratched out
// of the black where lit: blood red, the Aube's gold where brightest.
import { C, mix, lin, clamp, fbm, W, H } from './parts.mjs';

const ITEMS = ['Continuer', 'Nouvelle partie', 'Options', 'Quitter'];
const fr = (v) => v - Math.floor(v);

export function titre3(L, T) {
  const tx = 480, sun = [480, 108], horizon = 330; // the tower; the Aube pours from its top, where the Ancestor bleeds
  const ridge = (x) => 418 + Math.sin(x * 0.011) * 7 + Math.sin(x * 0.029 + 1) * 3 - Math.max(0, Math.abs(x - 480) - 260) * 0.12 + Math.max(0, 200 - Math.abs(x - 480)) * 0.12;
  const tower = (x, y) => { // < 0 inside
    const dx = Math.abs(x - tx);
    if (y < 18) return 1;
    if (y < 104) return dx - (y - 18) * 0.17; // the spire
    if (y < 118) return dx - 24; // the belfry ledge
    if (y < 290) return dx - 19 - (y > 250 ? (y - 250) * 0.2 : 0) - (Math.abs(y - 200) < 3 ? 3 : 0);
    return dx - 27 - (y - 290) * 0.35 - (dx > 30 && dx < 44 && y > 300 - (dx - 30) * 1.5 ? 20 : 0); // the buttressed foot
  };
  const GRAVES = [[40, 0], [96, 1], [150, 0], [214, 2], [262, 1], [700, 1], [748, 0], [800, 2], [858, 0], [912, 1]];
  const grave = (x, y) => {
    for (const [gx, k] of GRAVES) {
      const gy = ridge(gx) + 4, h = k === 0 ? 40 : k === 1 ? 24 : 30, dx = x - gx, dy = gy - y;
      if (dy < 0 || dy > h) continue;
      if (k === 0 && (Math.abs(dx) < 2.5 || (Math.abs(dy - h * 0.72) < 2.2 && Math.abs(dx) < 11))) return true;
      if (k === 1 && Math.abs(dx) < 8 && (dy < h - 8 || Math.hypot(dx, dy - (h - 8)) < 8)) return true;
      if (k === 2 && Math.abs(dx + dy * 0.18) < 2.2) return true; // a leaning stake
    }
    return false;
  };
  const hero = (x, y) => { // the Sans-Maison on the ridge, small, his coat to the ground, looking at the tower
    const fx = 236, fy = ridge(fx) + 1, dx = x - fx, dy = fy - y;
    if (dy < 0 || dy > 50) return false;
    if (dy > 41) return Math.hypot(dx, dy - 45) < 4.8; // head, hair to the shoulders
    if (dy > 35) return Math.abs(dx) < 6.4 - (dy - 35) * 0.3; // collar
    return Math.abs(dx - (35 - dy) * 0.08) < 4 + (35 - dy) * 0.22 + (dy < 6 ? 1.5 : 0) || (dy > 14 && dy < 30 && Math.abs(dx - 10) < 1.5); // the coat; the lantern's cord
  };
  // the place at (x, y): [tone, hatch angles or 'ray' (along the radius from the Aube) or 'win']
  const at = (x, y) => {
    const h = Math.hypot(x - sun[0], (y - sun[1]) * 1.15);
    if (hero(x, y) || grave(x, y)) return [0, []];
    if (y > ridge(x)) return [0.2 * (1 - clamp((y - ridge(x)) / 60)), [0]];
    const t = tower(x, y);
    if (t < 0) {
      const win = (y > 150 && y < 250 && Math.abs(Math.abs(x - tx) - 8) < 2 && fr((y - 150) / 50) < 0.6) || (y > 104 && y < 118 && fr((x - tx + 1) / 6) < 0.5);
      if (win) return [1, 'win'];
      const u = (x - tx) / 20, rim = clamp(1 + t / 2.5);
      const course = fr((y - 130) / 40) < 0.06 && y > 130 && y < 290; // string courses, lit from above
      return [course ? 0.55 * clamp(1 - u) : 0.05 + rim * (u < 0 ? 0.6 : 0.2) + clamp(-u) * 0.1, course ? [0] : [Math.PI / 2]];
    }
    if (y > horizon) return [0.4 + 0.25 * Math.exp(-Math.abs(x - tx) / 160) - 0.12 * clamp((y - horizon) / 80), [0]]; // the plain under the Aube, lit
    return [Math.min(0.78, 0.14 + 0.85 * Math.exp(-h / 160) + 0.22 * clamp((y - horizon + 110) / 110)), 'ray'];
  };
  const INK = [lin('#0c0a08'), lin('#3e060b'), lin('#781116'), lin('#b42c1e')], GOLD = lin('#d0b070'), BONE = C.bone;
  L.paint(0, 0, W, H, (x, y) => {
    const [v, hatch] = at(x, y), wob = fbm(x * 0.04, y * 0.04, 2, 34) * 0.8;
    let n = 0;
    if (hatch === 'win') n = 3;
    else if (hatch === 'ray') { // radial lines, merging into light near the Aube; rings where brightest
      const a = Math.atan2(y - sun[1], x - sun[0]), r = Math.hypot(x - sun[0], y - sun[1]);
      if (r > 40 ? fr(a * 150 / Math.PI + wob * 0.2) < v * 0.85 : fr(a * 30 / Math.PI) < 0.5) n++;
    } else hatch.forEach((a, i) => { if (fr((Math.floor(x * Math.sin(a) + y * Math.cos(a)) + 0.5) / 3) < clamp(i ? (v - 0.6) * 1.5 : v * 1.1)) n++; }); // crisp rows of pixels
    const c = n === 0 ? mix(INK[0], lin('#1a1611'), fbm(x * 0.02, y * 0.02, 3, 35) * 0.6) : v > 0.97 && n > 1 ? BONE : v > 0.8 ? GOLD : INK[clamp(n + (v > 0.5 ? 1 : 0), 1, 3)];
    return { c, flat: true };
  });
  // the Aube: a sunburst of gold rays round the belfry, long and short by turns, wavy every other one
  L.paint(sun[0] - 130, sun[1] - 130, sun[0] + 131, sun[1] + 131, (x, y) => {
    if (tower(x, y) < 0) return;
    const a = Math.atan2(y - sun[1], x - sun[0]), r = Math.hypot(x - sun[0], y - sun[1]), k = Math.round(a / (Math.PI / 16)), d = a - k * (Math.PI / 16);
    const long = k % 2 === 0, len = long ? 120 : 76, wav = long ? 0 : Math.sin(r * 0.25) * 0.012;
    const hw = (1 - r / len) * (long ? 0.075 : 0.06);
    if (r < 26 || r > len || Math.abs(d + wav) > hw) return;
    return { c: r < 60 && Math.abs(d + wav) < hw * 0.45 ? BONE : GOLD, flat: true };
  });
  // the frame: a double rule in blood
  L.paint(0, 0, W, H, (x, y) => { const d = Math.min(x, y, W - 1 - x, H - 1 - y); return d === 10.5 || d === 13.5 ? { c: INK[2], flat: true } : d < 10 ? { c: INK[0], flat: true } : undefined; });
  // the title in a black cartouche over the tower's foot, bone scratched in; the menu below on the dark ground
  const m = T.t3Title, x = W / 2 - m.w / 2, y = 352, cx0 = x - 26, cx1 = x + m.w + 26, cy0 = y + 8, cy1 = y + m.h - 4;
  L.paint(cx0 - 6, cy0, cx1 + 6, cy1, (px, py) => {
    const d = Math.min(px - cx0, cx1 - px, py - cy0, cy1 - py), notch = Math.min(px - cx0 + 6, cx1 + 6 - px) - Math.abs(py - (cy0 + cy1) / 2) * 0.5;
    if (d < 0 && notch < 0) return;
    return { c: (d > 1.5 && d < 3) || (d < 0 && notch < 1.5) ? INK[3] : INK[0], flat: true };
  });
  L.text(m, x, y, (a, px, py) => ({ c: fr((px - py) / 5) < 0.2 ? INK[3] : BONE, flat: true }));
  const my = 466, gap = 46;
  let mx = W / 2 - ITEMS.reduce((s, _, i) => s + T[`t3m${i}`].w + gap, -gap) / 2;
  ITEMS.forEach((_, i) => {
    const t = T[`t3m${i}`], sel = i === 0;
    if (sel) L.paint(mx - 12, my + 3, mx + t.w + 12, my + t.h + 3, (px, py) => { const d = Math.min(px - mx + 12, mx + t.w + 12 - px, py - my - 3, my + t.h + 3 - py); return { c: d < 1.5 ? INK[3] : INK[1], flat: true }; });
    L.text(t, mx, my, () => ({ c: sel ? BONE : INK[3], flat: true }));
    mx += t.w + gap;
  });
  const sv = T.tSave2; L.text(sv, W / 2 - sv.w / 2, my + 32, () => ({ c: INK[3], flat: true }));
}
