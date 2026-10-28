// Options, in the Relique track (IM Fell, tarnished silver, blood): three tabs, Son, Commandes, Affichage. Commandes
// flags the keys that clash (M: Carte and Couper le son; Échap in full screen) with a red rim and a line saying why.
import { say, dim, patch, crossLine, drop, keycap, C, mix, mul, metal, lin, clamp, fbm, smooth, W, H } from './parts.mjs';
import { mouse } from '../hud/parts.mjs';

const TABS = ['Son', 'Commandes', 'Affichage'];
// action, key, other ('L'/'R': a mouse button), clash, note in the other column
const KEYS = [
  ['Se déplacer', ['Z Q S D', 'W A S D'], ['Flèches']], ['Griffes', ['J'], ['L:clic gauche']], ['Éclat', ['K'], ['R:clic droit']],
  ['Glyphe', ['L'], ['E'], 0, 'L devant, E au pointeur'], ['Brume', ['Espace'], ['Maj']], ['Mordre, fouiller', ['F'], []],
  ['Le sac', ['I'], ['Tab']], ['La Nuée', ['R'], []], ['Carte', ['M'], [], 1], ['Couper le son', ['M'], [], 1], ['Plein écran', ['P'], []],
  ['Pause', ['Échap'], [], 2],
];
const SOUND = [['Volume général', 0.8], ['Ambiance', 0.65], ['Musique', 0.5], ['Effets', 0.9]];
const strs = new Set(KEYS.flatMap(([, k, o]) => [...k, ...o.map((s) => s.replace(/^[LR]:/, ''))]));
export const TEXTS = {
  oTitle: ['Options', '30px fell'], ...Object.fromEntries(TABS.map((s, i) => [`oTab${i}`, [s, '20px fell']])),
  oHAct: ['ACTION', '11px cinzel', 2], oHKey: ['TOUCHE', '11px cinzel', 2], oHAlt: ['AUTRE', '11px cinzel', 2],
  ...Object.fromEntries(KEYS.map(([a], i) => [`oK${i}`, [a, '17px fell']])),
  ...Object.fromEntries([...strs].map((s) => [`oKey:${s}`, [s, '13px fell']])),
  oNote3: ['L devant, E au pointeur', '13px fellI'],
  oClash1: ['M sert deux fois : Carte et Couper le son. Choisis une autre touche pour l’une des deux.', '14px fellI'],
  oClash2: ['Échap : en plein écran, le navigateur s’en sert d’abord pour quitter le plein écran.', '14px fellI'],
  oListen: ['appuie sur une touche…', '13px fellI'],
  oEnt: ['Entrée', '13px fell'], oDel: ['Suppr', '13px fell'], oEsc: ['Échap', '13px fell'], oChange: ['changer', '15px fell'], oClear: ['effacer', '15px fell'], oBack: ['retour', '15px fell'],
  oDefault: ['Tout remettre par défaut', '15px fell'], oLR: ['régler', '15px fell'], oQD: ['Q  D', '13px fell'],
  ...Object.fromEntries(SOUND.map(([s, v], i) => [`oS${i}`, [s, '17px fell']])), ...Object.fromEntries(SOUND.map(([s, v], i) => [`oV${i}`, [String(Math.round(v * 100)), '15px cinzel']])),
  oMute: ['Couper le son', '17px fell'], oFull: ['Plein écran', '17px fell'], oBright: ['Luminosité', '17px fell'], oGrain: ['Grain de l’image', '17px fell'],
  oYes: ['Oui', '16px fell'], oNo: ['Non', '16px fell'], oBrightHelp: ['Règle-la jusqu’à ce que la croix de gauche se devine à peine.', '14px fellI'],
  oM: ['M', '13px fell'], oP: ['P', '13px fell'], oBV: ['50', '15px cinzel'],
};

const SEL = mix(C.bone, C.bone, 0), DIMC = C.boneDim, WARN = mix(C.fresh, C.bone, 0.3);
// a key: a cap with its label (a red rim when it clashes); a mouse button: the mouse and its words. Returns the width.
function key(L, T, s, x, y, clash) {
  const m = s.match(/^([LR]):(.*)$/);
  if (m) { mouse(L, x + 1, y + 2, m[1] === 'L' ? 'l' : 'r', C.boneDim, C.bone); const t = T[`oKey:${m[2]}`]; say(L, t, x + 12, y - 1, DIMC); return 12 + t.w; }
  return keycap(L, T[`oKey:${s}`], x, y, clash ? { base: lin('#b42c1e') } : {});
}
// a slider: a glass ampoule filled with blood up to v, its number after it
function ampoule(L, x0, x1, yc, v, sel) {
  const r = 4, fx = x0 + v * (x1 - x0);
  L.paint(x0, yc - r, x1, yc + r + 1, (x, y) => {
    const dy = y - yc, h = Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.9; if (Math.abs(dy) > r) return;
    if (Math.abs(dy + 2) < 0.6 && fbm(x * 0.15, 0, 2, 25) > 0.45) return { h, c: C.bone, flat: true, op: 0.4 };
    if (x < fx) return { h, c: dy < -1.5 && x > fx - 2 ? C.bloodLit : mix(C.bloodDeep, C.blood, fbm(x * 0.2, y * 0.5, 2, 21)), s: 0.9, e: mul(C.bloodDeep, sel ? 0.8 : 0.4) };
    return { h, c: fbm(x * 0.4, y, 2, 22) > 0.6 ? C.bloodBlack : C.glass, s: 1, op: 0.3 };
  });
  for (let k = 1; k < 4; k++) { const x = Math.round(x0 + (k / 4) * (x1 - x0)); L.paint(x, yc - r - 1, x + 2, yc + r + 2, (px, py) => ({ h: 1.5, c: metal(C.brass, px, py, 0.8, 24), s: 0.6 })); }
  for (const [ex, dir] of [[x0, -1], [x1, 1]]) L.paint(ex - 8, yc - 6, ex + 9, yc + 7, (x, y) => { const u = (x - ex) * dir, dy = y - yc; if (u < -1 || u > 7) return; const hw = u < 3 ? 5 : u < 5 ? 3 : 2; if (Math.abs(dy) > hw) return; return { h: Math.sqrt(Math.max(0, hw * hw - dy * dy)), c: metal(C.brass, x, y, 0.7, 23), s: 0.7 }; });
}
// a highlighted row: a dark blood band, a drop at its left
function selRow(L, x0, x1, y0, y1) {
  L.wash(x0, y0, x1, y1, (x) => [0.2, 0.02, 0.03, 0.55 * (1 - smooth(0.6, 1, Math.abs(x - (x0 + x1) / 2) / ((x1 - x0) / 2)))]);
  drop(L, x0 + 8, y0 + (y1 - y0) / 2 + 5, 0.9);
}
// Oui / Non, the chosen one bright and underlined
function yesNo(L, T, x, y, yes) {
  for (const [m, on, dx] of [[T.oYes, yes, 0], [T.oNo, !yes, T.oYes.w + 14]]) {
    say(L, m, x + dx, y, on ? SEL : mix(DIMC, C.boneDark, 0.4));
    if (on) L.paint(x + dx + 2, y + m.h - 1, x + dx + m.w - 3, y + m.h, (px) => ({ h: 1, c: metal(C.silver, px, y, 1, 4), s: 0.8 }));
  }
}

export function draw(L, T, tab) {
  dim(L, 0.78, 0.15);
  const cx = W / 2;
  say(L, T.oTitle, cx - T.oTitle.w / 2, 24, C.bone);
  crossLine(L, cx, 24 + T.oTitle.h + 7, 90);
  // the tabs
  const tw = TABS.reduce((s, _, i) => s + T[`oTab${i}`].w + 40, -40);
  let tx = cx - tw / 2;
  TABS.forEach((name, i) => {
    const m = T[`oTab${i}`], on = name.toLowerCase() === tab;
    say(L, m, tx, 80, on ? SEL : DIMC, on ? 1 : 0.8);
    if (on) { L.paint(tx, 80 + m.h + 1, tx + m.w - 3, 80 + m.h + 2, (px) => ({ h: 1, c: metal(C.silver, px, 80, 1, 4), s: 0.8 })); drop(L, tx - 10, 80 + m.asc - 2, 0.8); }
    tx += m.w + 40;
  });
  L.paint(150, 116, 810, 117, (x) => ({ c: C.boneDark, flat: true, op: 0.6 * (1 - smooth(0.7, 1, Math.abs(x - cx) / 330)) }));

  if (tab === 'commandes') {
    const ax = 200, kx = 430, ox = 560, y0 = 132, rh = 25;
    for (const [m, x] of [[T.oHAct, ax], [T.oHKey, kx], [T.oHAlt, ox]]) say(L, m, x, y0 - 4, DIMC);
    KEYS.forEach(([, k, o, clash, note], i) => {
      const y = y0 + 14 + i * rh, sel = i === 8;
      if (sel) selRow(L, ax - 26, 790, y - 3, y + rh - 5);
      say(L, T[`oK${i}`], ax, y, sel ? SEL : clash ? mix(C.bone, WARN, 0.4) : mix(DIMC, C.bone, 0.3));
      let x = kx;
      k.forEach((s) => { x += key(L, T, s, x, y + 1, clash) + 8; });
      x = ox;
      o.forEach((s) => { x += key(L, T, s, x, y + 1) + 8; });
      if (sel) say(L, T.oListen, x, y + 1, C.bone);
      else if (note) say(L, T.oNote3, x + 4, y + 1, mix(DIMC, C.boneDark, 0.3));
      else if (!o.length) L.paint(x + 2, y + 9, x + 12, y + 10, () => ({ c: C.boneDark, flat: true }));
      if (clash) drop(L, kx - 9, y + 14, 0.8, 0.9);
    });
    const ny = y0 + 14 + KEYS.length * rh + 6;
    drop(L, ax - 14, ny + 13, 0.8, 0.9); say(L, T.oClash1, ax, ny, WARN);
    drop(L, ax - 14, ny + 31, 0.8, 0.9); say(L, T.oClash2, ax, ny + 18, WARN);
    footer(L, T, [[T.oEnt, T.oChange], [T.oDel, T.oClear], [T.oEsc, T.oBack]], true);
  }
  if (tab === 'son') {
    const ax = 230, sx0 = 420, sx1 = 680, y0 = 150, rh = 46;
    SOUND.forEach(([, v], i) => {
      const y = y0 + i * rh, sel = i === 2;
      if (sel) selRow(L, ax - 26, 760, y - 6, y + 26);
      say(L, T[`oS${i}`], ax, y, sel ? SEL : mix(DIMC, C.bone, 0.3));
      ampoule(L, sx0, sx1, y + 11, v, sel);
      say(L, T[`oV${i}`], sx1 + 16, y + 3, sel ? SEL : DIMC);
    });
    const y = y0 + SOUND.length * rh + 10;
    say(L, T.oMute, ax, y, mix(DIMC, C.bone, 0.3)); yesNo(L, T, sx0, y + 1, false); keycap(L, T.oM, sx1 + 16, y + 2);
    footer(L, T, [[T.oQD, T.oLR], [T.oEsc, T.oBack]], true);
  }
  if (tab === 'affichage') {
    const ax = 230, sx0 = 420, sx1 = 680, y0 = 150, rh = 46;
    say(L, T.oFull, ax, y0, mix(DIMC, C.bone, 0.3)); yesNo(L, T, sx0, y0 + 1, true); keycap(L, T.oP, sx1 + 16, y0 + 2);
    selRow(L, ax - 26, 760, y0 + rh - 6, y0 + rh + 26);
    say(L, T.oBright, ax, y0 + rh, SEL); ampoule(L, sx0, sx1, y0 + rh + 11, 0.5, true); say(L, T.oBV, sx1 + 16, y0 + rh + 3, SEL);
    // the test: three crosses, darker and darker, on black
    const ty = y0 + rh + 40;
    L.paint(sx0, ty, sx1, ty + 50, (x, y) => ({ c: lin('#030303'), flat: true }));
    [0.004, 0.012, 0.03].forEach((k, i) => {
      const x = sx0 + 45 + i * 85, y = ty + 25;
      L.paint(x - 12, y - 18, x + 13, y + 19, (px, py) => (Math.abs(px - x) < 3 || (Math.abs(py - y + 6) < 3 && Math.abs(px - x) < 11)) && Math.abs(py - y) < 18 ? { c: [k, k * 0.95, k * 0.85], flat: true } : undefined);
    });
    say(L, T.oBrightHelp, sx0 + (sx1 - sx0) / 2 - T.oBrightHelp.w / 2, ty + 56, mix(DIMC, C.boneDark, 0.2));
    const gy = ty + 92;
    say(L, T.oGrain, ax, gy, mix(DIMC, C.bone, 0.3)); yesNo(L, T, sx0, gy + 1, true);
    footer(L, T, [[T.oQD, T.oLR], [T.oEsc, T.oBack]], true);
  }
}
// the keys at the bottom; and « Tout remettre par défaut » at the right
function footer(L, T, pairs, reset) {
  let x = 200; const y = 500;
  for (const [k, w] of pairs) { x += keycap(L, k, x, y) + 5; say(L, w, x, y - 1, DIMC); x += w.w + 18; }
  if (reset) say(L, T.oDefault, 760 - T.oDefault.w, y - 1, mix(DIMC, C.boneDark, 0.3));
}
