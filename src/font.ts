import type Phaser from 'phaser';

// The game's typeface: a proportional pixel font drawn in code, so it ships inside the JS bundle and stays crisp at any
// integer zoom. Capitals 7 px tall, lowercase 5 px with 2 px descenders, French accents included.
// A glyph box is 11 rows: row 0 holds the accents of capitals, rows 1-2 those of lowercase letters, capitals stand on
// rows 2-8, lowercase on rows 4-8, descenders reach row 10.

export const LINE = 12; // line height, 1 px of leading
const GAP = 1; // between letters
const SPACE = 2; // width of a space, plus GAP

// Glyphs drawn side by side, one space between them: each strip is [characters, first row, rows].
const STRIPS: [string, number, string[]][] = [
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 2, [
    '.##. ###. .### ###. #### #### .### #..# ### ...# #..# #... #...# #..# .##. ###. .##. ###. .### ##### #..# #...# #...# #...# #...# #### .##. .#. .##. ###. #..# #### .##. #### .##. .##.',
    '#..# #..# #... #..# #... #... #... #..# .#. ...# #..# #... ##.## ##.# #..# #..# #..# #..# #... ..#.. #..# #...# #...# #...# #...# ...# #..# ##. #..# ...# #..# #... #... ...# #..# #..#',
    '#..# #..# #... #..# #... #... #... #..# .#. ...# #.#. #... #.#.# ##.# #..# #..# #..# #..# #... ..#.. #..# #...# #...# .#.#. .#.#. ...# #..# .#. ...# ...# #..# #... #... ...# #..# #..#',
    '#### ###. #... #..# ###. ###. #.## #### .#. ...# ##.. #... #.#.# #.## #..# ###. #..# ###. .##. ..#.. #..# .#.#. #.#.# ..#.. ..#.. ..#. #.## .#. ..#. .##. #### ###. ###. ..#. .##. .###',
    '#..# #..# #... #..# #... #... #..# #..# .#. ...# #.#. #... #...# #.## #..# #... #..# #.#. ...# ..#.. #..# .#.#. #.#.# .#.#. ..#.. .#.. ##.# .#. .#.. ...# ...# ...# #..# .#.. #..# ...#',
    '#..# #..# #... #..# #... #... #..# #..# .#. #..# #..# #... #...# #..# #..# #... #.#. #..# ...# ..#.. #..# .#.#. ##.## #...# ..#.. #... #..# .#. #... ...# ...# ...# #..# .#.. #..# ...#',
    '#..# ###. .### ###. #### #... .### #..# ### .##. #..# #### #...# #..# .##. #... .#.# #..# ###. ..#.. .##. ..#.. #...# #...# ..#.. #### .##. ### #### ###. ...# ###. .##. .#.. .##. .##.',
  ]],
  ['acemnorsuvwxzœ', 4, [
    '.##. .### .##. ####. ###. .##. #.## .### #..# #...# #...# #..# #### .##.##.',
    '...# #... #..# #.#.# #..# #..# ##.. #... #..# #...# #...# #..# ...# #..#..#',
    '.### #... #### #.#.# #..# #..# #... .##. #..# .#.#. #.#.# .##. .##. #..####',
    '#..# #... #... #.#.# #..# #..# #... ...# #..# .#.#. #.#.# #..# #... #..#...',
    '.### .### .### #.#.# #..# .##. #... ###. .### ..#.. .#.#. #..# #### .##.###',
  ]],
  ['bdfhklt', 2, [
    '#... ...# .## #... #... #. ...',
    '#... ...# #.. #... #... #. #..',
    '###. .### ### ###. #..# #. ###',
    '#..# #..# #.. #..# #.#. #. #..',
    '#..# #..# #.. #..# ##.. #. #..',
    '#..# #..# #.. #..# #.#. #. #..',
    '###. .### #.. #..# #..# .# .##',
  ]],
  ['gpqy', 4, [
    '.### ###. .### #..#',
    '#..# #..# #..# #..#',
    '#..# #..# #..# #..#',
    '#..# #..# #..# #..#',
    '.### ###. .### .###',
    '...# #... ...# ...#',
    '.##. #... ...# .##.',
  ]],
  ['ijîï.,\':;!?-+%«»()/', 1, [
    '. ... .#. ... . .. . . .. . .... ... ... ..... .... .... .. .. ....',
    '# ..# #.# #.# . .. # . .. # .##. ... ... ##... .... .... .# #. ...#',
    '. ... ... ... . .. # . .. # #..# ... ... ##..# .... .... #. .# ...#',
    '# ..# .#. .#. . .. . . .. # ...# ... ... ...#. .... .... #. .# ..#.',
    '# ..# .#. .#. . .. . # .# # ..#. ... .#. ..#.. .#.# #.#. #. .# ..#.',
    '# ..# .#. .#. . .. . . .. # .#.. ### ### .#... #.#. .#.# #. .# .#..',
    '# ..# .#. .#. . .. . . .. . .... ... .#. #..## .#.# #.#. #. .# .#..',
    '# ..# .#. .#. # .# . # .# # .#.. ... ... ...## .... .... #. .# #...',
    '. ..# ... ... . #. . . #. . .... ... ... ..... .... .... .# #. #...',
    '. ##. ... ... . .. . . .. . .... ... ... ..... .... .... .. .. ....',
  ]],
];

// Accents, 2 rows, centred over their letter: rows 1-2 on lowercase, rows 0-1 on capitals; the cedilla goes below.
const MARKS: Record<string, string[]> = { acute: ['.#', '#.'], grave: ['#.', '.#'], circ: ['.##.', '#..#'], uml: ['....', '#..#'], ced: ['.#', '#.'] };
const ACCENTED: Record<string, [string, keyof typeof MARKS]> = {
  'à': ['a', 'grave'], 'â': ['a', 'circ'], 'é': ['e', 'acute'], 'è': ['e', 'grave'], 'ê': ['e', 'circ'], 'ë': ['e', 'uml'],
  'ô': ['o', 'circ'], 'ù': ['u', 'grave'], 'û': ['u', 'circ'], 'ü': ['u', 'uml'], 'ç': ['c', 'ced'],
  'À': ['A', 'grave'], 'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circ'], 'Ç': ['C', 'ced'],
};

/** Each glyph as its width and the [x, y] of its pixels in the glyph box. */
const GLYPHS = new Map<string, { w: number; px: [number, number][] }>();
for (const [chars, top, rows] of STRIPS) {
  const cells = rows.map((r) => r.split(' '));
  console.assert(cells.every((c) => c.length === chars.length), 'font: strip out of step', chars);
  [...chars].forEach((ch, i) => {
    const w = cells[0][i].length, px: [number, number][] = [];
    cells.forEach((c, y) => {
      console.assert(c[i].length === w, 'font: ragged glyph', ch);
      [...c[i]].forEach((p, x) => p === '#' && px.push([x, top + y]));
    });
    GLYPHS.set(ch, { w, px });
  });
}
for (const [ch, [base, mark]] of Object.entries(ACCENTED)) {
  const b = GLYPHS.get(base)!, m = MARKS[mark], dx = Math.floor((b.w - m[0].length) / 2);
  const dy = mark === 'ced' ? 9 : base === base.toUpperCase() ? 0 : 1;
  const px = [...b.px];
  m.forEach((r, y) => [...r].forEach((p, x) => p === '#' && px.push([dx + x, dy + y])));
  GLYPHS.set(ch, { w: b.w, px });
}
GLYPHS.set(' ', { w: SPACE, px: [] });
GLYPHS.set('\u00a0', { w: SPACE, px: [] }); // no-break space, before « : ; ! ? % » in French
GLYPHS.set('’', GLYPHS.get("'")!);

/** Characters of `s` the font cannot draw. */
export const missing = (s: string) => [...new Set(s)].filter((c) => !GLYPHS.has(c));

/** Width in pixels of one line of text. */
export function width(s: string, gap = GAP) {
  return [...s].reduce((w, c) => w + (GLYPHS.get(c)?.w ?? 0) + gap, 0) - gap;
}

/** Splits text into lines no wider than `max`, at spaces (a no-break space keeps its neighbours together). */
export function wrap(s: string, max: number) {
  const lines: string[] = [];
  for (const word of s.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && width(`${lines[last]} ${word}`) <= max) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Calls put(x, y) for every pixel of one line of text whose glyph box starts at (x, y). */
export function draw(s: string, x: number, y: number, put: (x: number, y: number) => void, gap = GAP) {
  for (const c of s) {
    const g = GLYPHS.get(c);
    console.assert(!!g, 'font: no glyph for', c);
    if (!g) continue;
    for (const [px, py] of g.px) put(x + px, y + py);
    x += g.w + gap;
  }
}

/** A texture holding `lines` centred, in `color` over a 1 px `shadow` below and to the right; returns its key. */
export function bake(scene: Phaser.Scene, lines: string[], color: number, shadow?: number, gap = GAP) {
  const key = `font:${color}:${shadow}:${gap}:${lines.join('\n')}`;
  if (scene.textures.exists(key)) return key;
  const w = Math.max(...lines.map((l) => width(l, gap))) + 1, h = lines.length * LINE;
  const t = scene.textures.createCanvas(key, w, h)!, ctx = t.context;
  for (const [c, d] of shadow === undefined ? [[color, 0]] : [[shadow, 1], [color, 0]]) {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    lines.forEach((l, i) => draw(l, Math.floor((w - 1 - width(l, gap)) / 2) + d, i * LINE + d, (x, y) => ctx.fillRect(x, y, 1, 1), gap));
  }
  t.refresh();
  return key;
}
