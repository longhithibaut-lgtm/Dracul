// Three HUD directions for the grand-pixel style, each over two in-game captures (exploring; the boss with low life):
// docs/maquettes/hud-1-relique.png, hud-2-chair.png, hud-3-gravure.png (+ -boss.png each) and hud-planche.png.
// Usage: node tools/art/maquettes/hud/bg.shots.mjs (the captures, once), then node tools/art/maquettes/hud/hud.gen.mjs [--only=relique]
import { Layer, W, H, compose, readPNG, texts, smooth } from './lib.mjs';
import { BAG } from './parts.mjs';
import { png } from '../../bake.mjs';
import * as Relique from './relique.mjs';
import * as Chair from './chair.mjs';
import * as Gravure from './gravure.mjs';

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const bgDir = 'shots/hud-bg', out = 'docs/maquettes';
const BG = { explore: readPNG(`${bgDir}/explore.png`), boss: readPNG(`${bgDir}/boss.png`) };
// the game's state in each capture; cd: the share of a cooldown still to run; prompt: over the cross by the hero (HUD px)
const STATES = {
  explore: { hp: 38, max: 50, dash: 1, cd: { griffes: 0, tir: 0, glyphe: 0.45 }, nuee: true, blood: 126, cap: 400, bag: 6, items: BAG, place: 'Les catacombes', prompt: [492, 112] },
  boss: { hp: 7, max: 50, dash: 0.4, cd: { griffes: 0, tir: 0.7, glyphe: 0 }, nuee: true, blood: 212, cap: 400, bag: 6, items: [...BAG, 'sablier'], boss: { name: 'La Nourrice des goules', frac: 0.62 }, low: true },
};
const DIRS = { '1-relique': Relique, '2-chair': Chair, '3-gravure': Gravure };
const T = await texts(Object.assign({ pl1: ['1 · Relique', '22px fell'], pl2: ['2 · Chair', '22px fell'], pl3: ['3 · Gravure', '22px fell'] }, ...Object.values(DIRS).map((d) => d.TEXTS)));

// the screen's edges darken and redden (low life)
export function lowLife(L, colour, k) {
  L.wash(0, 0, W, H, (x, y) => { const vx = (x - W / 2) / (W / 2), vy = (y - H / 2) / (H / 2), t = smooth(0.6, 1.4, Math.hypot(vx * 0.9, vy)); return [colour[0], colour[1], colour[2], t * k]; });
}

const shots = {};
for (const [name, dir] of Object.entries(DIRS)) {
  if (only && !name.includes(only)) continue;
  for (const st of ['explore', 'boss']) {
    const L = new Layer(), S = STATES[st];
    if (S.low) lowLife(L, dir.LOW ?? [0.14, 0.01, 0.02], 0.5);
    dir.draw(L, S, T);
    const img = compose(BG[st], L), file = `${out}/hud-${name}${st === 'boss' ? '-boss' : ''}.png`;
    png(file, img, 1920, 1080);
    shots[`${name}-${st}`] = img;
    console.log(file);
  }
}

// the board: each direction a column, exploring above, the boss below, at half size, with its name
if (!only) {
  const PW = 960 * 3, PH = 540 * 2, board = new Uint8ClampedArray(PW * PH * 4);
  Object.keys(DIRS).forEach((name, col) => ['explore', 'boss'].forEach((st, row) => {
    const img = shots[`${name}-${st}`];
    for (let y = 0; y < 540; y++) for (let x = 0; x < 960; x++) {
      const o = ((row * 540 + y) * PW + col * 960 + x) * 4;
      for (let k = 0; k < 4; k++) { let v = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) v += img[((y * 2 + dy) * 1920 + x * 2 + dx) * 4 + k]; board[o + k] = v / 4; }
    }
    if (row === 0) { // its name, top left of the column, on a dark tab
      const m = T[`pl${col + 1}`];
      for (let y = 0; y < m.h + 12; y++) for (let x = 0; x < m.w + 20; x++) {
        const o = ((y) * PW + col * 960 + x) * 4, a = (m.a[(y - 6) * m.w + x - 10] ?? 0) / 255, inside = y >= 6 && y < m.h + 6 && x >= 10 && x < m.w + 10;
        for (let k = 0; k < 3; k++) board[o + k] = 12 + (inside ? a * ([236, 226, 198][k] - 12) : 0);
      }
    }
  }));
  for (let y = 0; y < PH; y++) for (const x of [959, 960, 1919, 1920]) for (let k = 0; k < 3; k++) board[(y * PW + x) * 4 + k] = 0;
  for (let x = 0; x < PW; x++) for (const y of [539, 540]) for (let k = 0; k < 3; k++) board[(y * PW + x) * 4 + k] = 0;
  png(`${out}/hud-planche.png`, board, PW, PH);
  console.log(`${out}/hud-planche.png`);
}
