// Menu mockups for the grand-pixel style, at 1920x1080 over in-game captures: three title screens, two pause menus
// (Relique-like, Gravure-like, the HUD tracks of docs/maquettes/hud-*.png) and the options, then menus-planche.png.
// Usage: node tools/art/maquettes/menus/bg.shots.mjs (the captures, once), then node tools/art/maquettes/menus/menus.gen.mjs [--only=titre-1]
import { Layer, compose, readPNG, texts } from '../hud/lib.mjs';
import { png } from '../../bake.mjs';
import * as Titre from './titre.mjs';
import * as Pause from './pause.mjs';
import * as Options from './options.mjs';
import * as Relique from '../hud/relique.mjs';
import * as Gravure from '../hud/gravure.mjs';

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const bgDir = 'shots/menus-bg', out = 'docs/maquettes';
const bg = (name) => readPNG(`${bgDir}/${name}.png`);
const black = { n: 3, data: new Uint8Array(1920 * 1080 * 3) };
const T = await texts(Object.assign({}, Titre.TEXTS, Pause.TEXTS, Options.TEXTS, Relique.TEXTS, Gravure.TEXTS,
  Object.fromEntries(['1 · Titre, le cercueil', '2 · Titre, la lune', '3 · Titre, la gravure', 'Pause, relique', 'Pause, gravure', 'Options'].map((s, i) => [`pl${i}`, [s, '22px fell']]))));
const HUD = { hp: 38, max: 50, dash: 1, cd: { griffes: 0, tir: 0, glyphe: 0.45 }, nuee: true, blood: 126, cap: 400, bag: 6, items: ['calice', 'faucille', 'chapelet', 'fiole'] };

// a layer drawn over an image (a capture, or what a layer before made: rgba)
const over = (img, draw) => { const L = new Layer(); draw(L); return compose(img, L); };
const rgba = (data) => ({ n: 4, data });
const SCREENS = {
  'titre-1': () => over(bg('crypt-empty'), (L) => Titre.titre1(L, T)),
  'titre-2': () => over(bg('necro'), (L) => Titre.titre2(L, T, [480, 300])),
  'titre-3': () => over(black, (L) => Titre.titre3(L, T)),
  'pause-1': () => over(rgba(over(bg('cata'), (L) => { Pause.dimGame(L); Relique.draw(L, HUD, T); })), (L) => Pause.relique(L, T, HUD)),
  'pause-2': () => over(rgba(over(bg('cata'), (L) => { Pause.dimGame(L); Gravure.draw(L, HUD, T); })), (L) => Pause.gravure(L, T, HUD)),
  options: () => over(bg('cata'), (L) => Options.draw(L, T, 'commandes')),
  'options-son': () => over(bg('cata'), (L) => Options.draw(L, T, 'son')),
  'options-affichage': () => over(bg('cata'), (L) => Options.draw(L, T, 'affichage')),
};
const shots = {};
for (const [name, make] of Object.entries(SCREENS)) {
  if (only && !name.startsWith(only)) continue;
  shots[name] = make();
  png(`${out}/${name}.png`, shots[name], 1920, 1080);
  console.log(`${out}/${name}.png`);
}

// the board: three columns, two rows, at half size, each with its name
if (!only) {
  const order = ['titre-1', 'titre-2', 'titre-3', 'pause-1', 'pause-2', 'options'], PW = 960 * 3, PH = 540 * 2, board = new Uint8ClampedArray(PW * PH * 4);
  order.forEach((name, n) => {
    const img = shots[name], col = n % 3, row = Math.floor(n / 3), m = T[`pl${n}`];
    for (let y = 0; y < 540; y++) for (let x = 0; x < 960; x++) {
      const o = ((row * 540 + y) * PW + col * 960 + x) * 4;
      for (let k = 0; k < 4; k++) { let v = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) v += img[((y * 2 + dy) * 1920 + x * 2 + dx) * 4 + k]; board[o + k] = v / 4; }
    }
    for (let y = 0; y < m.h + 12; y++) for (let x = 0; x < m.w + 20; x++) { // its name on a dark tab, top left
      const o = ((row * 540 + y) * PW + col * 960 + x) * 4, inside = y >= 6 && y < m.h + 6 && x >= 10 && x < m.w + 10, a = inside ? m.a[(y - 6) * m.w + x - 10] / 255 : 0;
      for (let k = 0; k < 3; k++) board[o + k] = 12 + a * ([236, 226, 198][k] - 12);
    }
  });
  for (let y = 0; y < PH; y++) for (const x of [959, 960, 1919, 1920]) for (let k = 0; k < 3; k++) board[(y * PW + x) * 4 + k] = 0;
  for (let x = 0; x < PW; x++) for (const y of [539, 540]) for (let k = 0; k < 3; k++) board[(y * PW + x) * 4 + k] = 0;
  png(`${out}/menus-planche.png`, board, PW, PH);
  console.log(`${out}/menus-planche.png`);
}
