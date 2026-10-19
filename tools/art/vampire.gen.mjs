// The torture room's hero (« Crasse et faim », docs/decisions.md): the mockup's gaunt vampire (black hair over a
// grey-pale face, red eyes, a violet shawl, a long near-black coat split at the hem, a lantern in his left hand),
// composed from parts into the wanderer's 32x40 frames (soles on row 36, centred on column 16), then rimmed from the
// top left and outlined here. Writes src/vampire.data.ts. Usage: node tools/art/vampire.gen.mjs
import { writeFileSync } from 'node:fs';

const W = 32, H = 40;
// Silhouette pixels lit by the top-left light (left or upper neighbour empty) take their material's rim tone.
const RIM = { k: 'r', c: 'r', d: 'r', H: 'R', V: 'P', v: 'P', u: 'v', n: 'd', b: 'B' };

/** Paints parts ([rows, x, y], '.' transparent) in order, rims and outlines them. `lamp`: the lantern glass's centre. */
function frame(parts, lamp) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const [rows, x, y] of parts) rows.forEach((r, j) => [...r].forEach((c, i) => {
    if (c === '.') return;
    if (g[y + j]?.[x + i] === undefined) throw new Error(`pixel out of the frame at ${x + i},${y + j}`);
    g[y + j][x + i] = c;
  }));
  const at = (x, y) => g[y]?.[x] ?? '.';
  const rim = g.map((r, y) => r.map((c, x) => (RIM[c] && (at(x - 1, y) === '.' || at(x, y - 1) === '.') ? RIM[c] : c)));
  const out = rim.map((r, y) => r.map((c, x) => (c === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !'.o'.includes(at(x + dx, y + dy))) ? 'o' : c)));
  return { lamp, rows: out.map((r) => r.join('')) };
}

// The lantern: ring, cap, glass (lit from within), base. Its glass centre is (x + 2, y + 3).
const LANTERN = ['.ll.', 'LLLL', 'LGGL', 'LGgL', '.LL.'];
const lantern = (x, y) => ({ part: [LANTERN, x, y], lamp: [x + 2, y + 3] });
const shift = (rows, dx) => rows.map((r) => (dx > 0 ? '.'.repeat(dx) + r : r.slice(-dx) + '.'.repeat(-dx)));

// ---- down: facing us, the lantern in his left hand (our right), the claws in his right (our left) ----
const D = {
  head: ['.HHHH.', 'HHHHHH', 'HHHWWH', 'HeWWeH', 'HWWWwH', 'HHwwHH', 'H....H'],
  mantle: [
    '...vVVVVVVv....',
    '.VVVVVVVVVVVVv.',
    'VVVVVVVVVVVvvvv',
    'VVvuVVVVVVvvuvu',
    'uu..uVVVVvu..uu',
    '......uVvu.....',
  ],
  torso: [
    '..kcddcccckk...',
    '..kcddccccck...',
    'cc.kcdcckck.cc.',
    'dc.kcdcckck.ck.',
    'dc.kcdcckck.ck.',
    'dc.kcdcckck.ck.',
    'dc.kcdcckck.ck.',
  ],
  skirt: [
    '..kcddcckccck..',
    '..kcdccckccck..',
    '..kcdcckcccck..',
    '.kcddcckccccck.',
  ],
  hem: [
    '.kcdcck.kcccck.',
    '.kcdcck.kccccck',
    'kcddck...kcccck',
    'kcdcck...kcccck',
  ],
  legs: ['.nn.nn.', '.nn.nn.', '.nn.nn.', '.nn.nn.', '.nn.nn.', 'bbb.bbb', 'bbb.bbb'],
  hand: ['ww', 'wW'],
};
// A raised step: the leg shorter and its boot off the floor.
const RAISED = ['.nn', '.nn', '.nn', 'bbb', 'bbb', '...', '...']; // the boot two rows up
const legsD = (lift) => D.legs.map((row, j) => `${lift === 'l' ? RAISED[j] : row.slice(0, 3)}.${lift === 'r' ? RAISED[j].split('').reverse().join('') : row.slice(4)}`);
function down({ bob = 0, lift = '', hem = 0, lx = 0, ly = 0, arm = 'idle' } = {}) {
  const l = lantern(22 + lx, 26 + bob + ly);
  const parts = [[legsD(lift), 13, 29], [D.skirt, 9, 25], [shift(D.hem, hem), 9, 29], [D.torso, 9, 19 + bob], [D.mantle, 9, 17 + bob], [D.head, 13, 11 + bob], [['ww'], 22, 25 + bob]];
  if (arm === 'idle') parts.push([D.hand, 9, 26 + bob]);
  if (arm === 'up') parts.push([['WW....', '.WWW..', '..wcc.', '...dcc', '....cc'], 4, 14 + bob]); // raised out to the left, claws spread
  if (arm === 'across') parts.push([['cc.....', 'dcc....', '.ccdcw.', '...cwWW', '.....WW'], 11, 25 + bob]); // raked down across his front
  parts.push(l.part);
  return frame(parts, l.lamp);
}

// ---- up: his back, the lantern in his left hand (our left), the claws in his right (our right) ----
const U = {
  head: ['.HHHH.', 'HHHHHH', 'HHHHHH', 'HHHHHH', 'HHHHHH', 'HHHHHH', 'HHHHHH', '.HHHH.'],
  mantle: [
    '...vVVVVVVv....',
    '.VVVVVVVVVVVVv.',
    'VVVVVVVVVVVvvvv',
    'VVvuVVVVVVvvuvu',
    'uu..uVVVVvu..uu',
    '......uVvu.....',
  ],
  torso: D.torso,
  skirt: ['..kcddcckccck..', '..kcdccckccck..', '..kcdccckccck..', '.kcddccckcccck.'],
  hem: ['.kcdcck.kcccck.', '.kcdcck.kccccck', 'kcddck.k.kcccck', 'kcdcck...kcccck'],
};
function up({ bob = 0, lift = '', hem = 0, lx = 0, ly = 0, arm = 'idle' } = {}) {
  const l = lantern(6 + lx, 26 + bob + ly);
  const parts = [[legsD(lift), 13, 29], [U.skirt, 9, 25], [shift(U.hem, hem), 9, 29], [U.torso, 9, 19 + bob], [U.mantle, 9, 17 + bob], [U.head, 13, 11 + bob], [['ww'], 8, 25 + bob]];
  if (arm === 'idle') parts.push([['ww', 'Ww'], 22, 26 + bob]);
  if (arm === 'up') parts.push([['....WW', '..WWW.', '.ccw..', 'ccd...', 'cc....'], 22, 13 + bob]);
  if (arm === 'across') parts.push([['WW......', 'WWwcc...', '..cdccc.', '.....cc.'], 13, 15 + bob]); // swept over to the upper left
  parts.push(l.part);
  return frame(parts, l.lamp);
}

// ---- side: facing right (flipped for the left), the lantern in his far hand behind his back ----
const S = {
  head: ['.HHHH..', 'HHHHHH.', 'HHHHHWW', 'HHHHWeW', 'HHHHWWw', 'HHH.ww.', 'HH.....'],
  mantle: ['...vVVVv.', '.VVVVVVVv', 'VVVVVVVvu', 'uVVVVVvvu', '.uVVVvvu.', '..uvVvu..', '....uu...'],
  torso: ['.kcddcck.', '.kcddccck', '.kcdccckk', '.kcdcckck', '.kcdccckk', '.kcdcckck', '.kcdcckck'],
  skirt: ['..kcdcccck.', '..kcdccckck', '.kcddcccckk', '.kcdccckcck'],
  hem: ['kcddcck.kck', 'kcdccck.kcc', 'kcdcck...kc', 'kcdcck....k'],
  arm: ['cc', 'dc', 'dc', 'dc', 'cc', 'ww', 'wW'],
};
// Legs [back x, front x] and their boots' lifts; the boot points right.
function legsS(back, front, liftB = 0, liftF = 0) {
  const g = Array.from({ length: 7 }, () => Array(12).fill('.'));
  for (const [x, lift] of [[back, liftB], [front, liftF]]) {
    for (let j = 0; j < 5 - lift; j++) g[j][x] = g[j][x + 1] = 'n';
    for (const j of [5 - lift, 6 - lift]) for (let i = 0; i < 3; i++) g[j][x + i] = 'b';
  }
  return g.map((r) => r.join(''));
}
function side({ bob = 0, legs = [3, 6, 0, 0], hem = 0, lx = 0, ly = 0, arm = 'idle', lean = 0 } = {}) {
  const l = lantern(7 + lx, 25 + bob + ly), b = bob + (lean ? 1 : 0);
  const parts = [l.part, [['ww'], 8 + lx, 24 + bob + ly], [legsS(...legs), 9, 29], [S.skirt, 9, 25], [shift(S.hem, hem), 8, 29], [S.torso, 11 + lean, 19 + b], [S.mantle, 10 + lean, 17 + b], [S.head, 13 + lean, 11 + b]];
  if (arm === 'idle') parts.push([S.arm, 16 + lean, 21 + b]);
  if (arm === 'swing') parts.push([shift(S.arm, 1), 16 + lean, 20 + b]);
  if (arm === 'back') parts.push([S.arm, 14 + lean, 21 + b]);
  if (arm === 'up') parts.push([['......W.W', '.....WWW.', '....WwW..', '...cw....', '..cdc....', '.cdc.....', 'cdc......', 'cc.......'], 18 + lean, 12 + b]); // raised, claws high
  if (arm === 'out') parts.push([['ccc......', 'dccdcwWWW', '..ccwWWW.', '.......W.'], 16 + lean, 21 + b]); // raked out in front
  return frame(parts, l.lamp);
}

const F = {
  DOWN_IDLE0: down(),
  DOWN_IDLE1: down({ bob: 1, lx: -1 }),
  DOWN_RUN0: down({ lift: 'l', hem: 1, lx: 1 }),
  DOWN_RUN1: down({ bob: -1, ly: -1 }),
  DOWN_RUN2: down({ lift: 'r', hem: -1, lx: -1 }),
  DOWN_RUN3: down({ bob: -1, ly: -1 }),
  DOWN_SLASH0: down({ arm: 'up' }),
  DOWN_SLASH1: down({ arm: 'across', bob: 1 }),
  UP_IDLE0: up(),
  UP_IDLE1: up({ bob: 1, lx: 1 }),
  UP_RUN0: up({ lift: 'l', hem: 1, lx: 1 }),
  UP_RUN1: up({ bob: -1, ly: -1 }),
  UP_RUN2: up({ lift: 'r', hem: -1, lx: -1 }),
  UP_RUN3: up({ bob: -1, ly: -1 }),
  UP_SLASH0: up({ arm: 'up' }),
  UP_SLASH1: up({ arm: 'across', bob: 1 }),
  SIDE_IDLE0: side(),
  SIDE_IDLE1: side({ bob: 1, lx: -1 }),
  SIDE_RUN0: side({ legs: [1, 8, 0, 0], hem: -1, lx: -2, arm: 'swing' }),
  SIDE_RUN1: side({ bob: -1, legs: [4, 5, 1, 0], arm: 'idle' }),
  SIDE_RUN2: side({ legs: [1, 8, 0, 0], hem: -2, lx: 1, arm: 'back' }),
  SIDE_RUN3: side({ bob: -1, legs: [5, 4, 0, 1], hem: -1, arm: 'idle' }),
  SIDE_SLASH0: side({ arm: 'up' }),
  SIDE_SLASH1: side({ arm: 'out', bob: 1, lx: -1 }),
  SIDE_BITE: side({ arm: 'out', lean: 2, lx: -2 }),
};

const body = Object.entries(F).map(([n, f]) => `const ${n}: Frame = { lamp: [${f.lamp}], rows: [\n${f.rows.map((r) => `  '${r}',`).join('\n')}\n] };`).join('\n');
writeFileSync(new URL('../../src/vampire.data.ts', import.meta.url), `// Generated by tools/art/vampire.gen.mjs: edit the parts there, not these grids.
// The torture room's hero (« Crasse et faim »), on the wanderer's frame layout (wanderer.data.ts); \`lamp\` is the
// lantern glass's centre, where dark.ts hangs his light.
import type { Frame, View } from './wanderer.data.ts';

export const PALETTE: Record<string, string> = { o: '#080706', H: '#17131a', R: '#4c4c58', W: '#cfc8b8', w: '#8f877a', e: '#ff2a2a',
  P: '#b47ed6', V: '#8a4eaa', v: '#6a3a7f', u: '#3f204c', k: '#0f0d10', c: '#1d191d', d: '#2e282e', r: '#5c5e68', n: '#262028',
  b: '#0c0a0a', B: '#3a3432', L: '#5a5038', l: '#34301f', G: '#f2f4c0', g: '#c8cc70' };

${body}

// Dash: the run (wanderer.ts); throw: the slash poses; cast: the idle; bite: the side slash leaning in.
export const VIEWS: Record<'down' | 'up' | 'side', View> = {
  down: { idle: [DOWN_IDLE0, DOWN_IDLE0, DOWN_IDLE1, DOWN_IDLE1], run: [DOWN_RUN0, DOWN_RUN1, DOWN_RUN2, DOWN_RUN3], slash: [DOWN_SLASH0, DOWN_SLASH1], throw: [DOWN_SLASH1, DOWN_SLASH0], cast: DOWN_IDLE0 },
  up: { idle: [UP_IDLE0, UP_IDLE0, UP_IDLE1, UP_IDLE1], run: [UP_RUN0, UP_RUN1, UP_RUN2, UP_RUN3], slash: [UP_SLASH0, UP_SLASH1], throw: [UP_SLASH1, UP_SLASH0], cast: UP_IDLE0 },
  side: { idle: [SIDE_IDLE0, SIDE_IDLE0, SIDE_IDLE1, SIDE_IDLE1], run: [SIDE_RUN0, SIDE_RUN1, SIDE_RUN2, SIDE_RUN3], slash: [SIDE_SLASH0, SIDE_SLASH1], throw: [SIDE_SLASH1, SIDE_SLASH0], cast: SIDE_IDLE0, bite: SIDE_BITE },
};
`);
