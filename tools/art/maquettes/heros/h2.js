// Hero 2: Le Spectre (very tall, tattered cloak fraying into mist, face behind hair, overlong fingers). Accent: violet.
(() => {
  const pal = {
    o: '#080706', w: '#121016', W: '#24202a', s: '#a9a7a2', S: '#d6d3c8', z: '#5c5a60',
    e: { hex: '#d8b0ff', e: [1.3, 0.75, 2.2] }, m: '#160810', t: '#e6dab8',
    k: '#0d0b10', c: '#19151e', h: '#2b2433', v: { hex: '#46265a', e: [0.06, 0.01, 0.1] }, V: { hex: '#643882', e: [0.13, 0.02, 0.23] },
    l: '#3a3428', L: '#4e4a44', G: { hex: '#dfe6e0', e: [1.7, 1.9, 2.0] },
    '~': '#34303c', ':': '#5a5468', x: { hex: '#c890ff', e: [0.9, 0.4, 1.5] }, X: { hex: '#46265a', e: [0.2, 0.05, 0.35] },
  };
  const R = (x, y, s) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + s * 977; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  function mist(g, y0, cx, spread, seed) { // erode the hem and drift smoke below it
    const h = g.length, w = g[0].length;
    for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = (y - y0) / (h - y0), r = R(x, y, seed);
      if (g[y][x] !== '.' && g[y][x] !== 'o') { if (r < t * 1.6) g[y][x] = r < t * 0.8 ? ':' : '~'; continue; }
      const dx = Math.abs(x - cx) / (spread * (1 + t * 0.6));
      if (dx < 1 && r < (1 - t) * 0.7 * (1 - dx * dx) && g[y - 1] && (g[y - 1][x] !== '.' || R(x, y, seed + 1) < 0.25 * (1 - t))) g[y][x] = r < 0.12 ? ':' : '~';
    }
    return g;
  }
  const front = mirrorHalf([
    '..............ww',
    '............wwww',
    '...........wwwWw',
    '...........wwWws',
    '...........wwwSs',
    '..........wwwzSs',
    '..........wwwzes',
    '..........wwwwzs',
    '..........wwWwzs',
    '..........wwwwtm',
    '..........wWwwws',
    '.........hwwWwwo',
    '........khwwwwwk',
    '........khwwWwwc',
    '........khcwwwwc',
    '........khcwwWwc',
    '........khccwwwc',
    '........khccwwWc',
    '.......khcccwwcc',
    '.......khccccwcc',
    '.......khcccccvk',
    '.......khccccvVk',
    '.......khccccvkk',
    '.......khcckcvkk',
    '.......khcckvVkk',
    '......khccckvkkk',
    '......khcckvVkkk',
    '......khcckvkkkk',
    '......khckvVkkkk',
    '......khckvkkkkk',
    '.....khcckvkkkk.',
    '.....khckvVkkk..',
    '.....kh.kvkk....',
    '.....k..k.k.....',
    '................', '................', '................', '................', '................', '................',
  ]);
  const fingers = (g, x, y, dir) => { // overlong pale fingers hanging from a sleeve, spread apart
    stamp(g, x - 1, y, ['sSs']);
    line(g, x - 1, y + 1, x - 3, y + 7, (s, n) => s === n ? 'z' : 's');
    line(g, x, y + 1, x, y + 8, (s, n) => s === n ? 'z' : 'S');
    line(g, x + 1, y + 1, x + 3, y + 6, (s, n) => s === n ? 'z' : 's');
  };
  fingers(front, 6, 20, -1);
  stamp(front, 24, 20, ['sS', 'ss']); line(front, 25, 21, 26, 27, 'l'); stamp(front, 25, 27, ['.LL.', 'LGGL', 'LGGL', 'LGGL', '.LL.']);
  mist(front, 29, 16, 9, 3);
  const back = mirrorHalf([
    '..............ww',
    '............wwww',
    '...........wwwWw',
    '...........wwwww',
    '...........wWwww',
    '..........wwWwww',
    '..........wwWwwW',
    '..........wwwwwW',
    '..........wwwWwW',
    '..........wwwWww',
    '..........wWwWww',
    '.........hwwwwWw',
    '........khwWwwWw',
    '........khwWwwww',
    '........khcwWwWw',
    '........khcwwwWw',
    '........khccwwWw',
    '........khcccwww',
    '.......khccccwwc',
    '.......khcccccwc',
    '.......khcccccck',
    '.......khcccckcc',
    '.......khcccckcc',
    '.......khcckcckc',
    '.......khcckccck',
    '......khccckccck',
    '......khcckcccck',
    '......khcckccckc',
    '......khckcccckc',
    '......khckccckcc',
    '.....khcckcckcc.',
    '.....khckccck...',
    '.....kh.kc.k....',
    '.....k..k.k.....',
    '................', '................', '................', '................', '................', '................',
  ]);
  fingers(back, 25, 20, 1);
  stamp(back, 6, 20, ['Ss', 'ss']); line(back, 6, 21, 5, 27, 'l'); stamp(back, 3, 27, ['.LL.', 'LGGL', 'LGGL', 'LGGL', '.LL.']);
  mist(back, 29, 16, 9, 4);
  const head = [
    '...wwww....',
    '.wwwwwwW...',
    'wwwwwwwWw..',
    'wwwwwwwwSs.',
    'wwwwwwwzSs.',
    'wwwwwwwzes.',
    'wwwwwwwwzsS',
    'wwwwwwwwwzs',
    '.wwwwwwwwmt',
    '.wwwwwwwwws',
    '..wwwwwwww.',
    '..wwwwwWw..',
    '...ww.w.w..',
  ];
  const side = grid(32, 40);
  stamp(side, 10, 13, [ // cloak, hunched, narrow
    '...khccc.',
    '..khccccc',
    '..khcccch',
    '..khccccch',
    '.khcccccch',
    '.khccccccv',
    '.khcccckch',
    '.khccckcch',
    'khcccckcch',
    'khccckccch',
    'khccckccch',
    'khccckcccch',
    'khccckcccck',
    'hcccckcccck',
    'hccckccccck',
    'cccckccckck',
    'cckcc.cckck',
    'c.k.c..c.k.',
    '..k....c...',
  ]);
  stamp(side, 12, 1, head);
  stamp(side, 18, 19, ['cS', 'kSs']); // sleeve end + hand
  line(side, 19, 20, 20, 28, (s, n) => s === n ? 'z' : 'S'); line(side, 20, 20, 22, 27, (s, n) => s === n ? 'z' : 's'); line(side, 18, 20, 18, 27, (s, n) => s === n ? 'z' : 's');
  mist(side, 29, 15, 8, 5);
  const act = grid(40, 40);
  stamp(act, 1, 12, [ // cloak streaming back
    '...........kch',
    '........kkcchh',
    '.....kkccccchc',
    '..kkcccccccchc',
    'kcc.ccc.cccchc',
    '.k..c.cc.cchcc',
    '..c...c.ccchcc',
    '......c.cchccc',
    '.......cchccck',
    '......cchcccck',
    '....kcchccccck',
    '..kcccchcccckk',
    'kcc.cchccccck.',
    '..c.c.hcc.ck..',
    '....c.h.c..k..',
  ]);
  stamp(act, 14, 11, [
    '.khcccc..',
    'khccccch.',
    'khcccccvh',
    'khccccvVh',
    'khcccccvh',
    'khccccccc',
    'khccccccc',
    'kkcccccck',
    '.kccccck.',
    '..kcccck.',
    '..kccck..',
    '..kcck...',
  ]);
  stamp(act, 18, 1, head);
  stamp(act, 20, 13, ['hhhhhhhhS', 'cccccccSs', '.kkkkkk.s']); // reaching arm
  const f = (x1, y1, ch = 'S') => line(act, 29, 14, x1, y1, (s, n) => s === n ? 'z' : ch);
  f(35, 8); f(37, 12, 's'); f(37, 16); f(35, 20, 's'); f(32, 21);
  mist(act, 26, 12, 12, 6);
  HEROES.push({
    name: 'Le Spectre', tag: 'une forme et deux yeux', accent: 'violet', why: 'le violet garde l’ADN de la maquette ; complémentaire du jaune-vert de la crasse, il ressort sans briller',
    pal, views: [front, back, side, act], arc: [27, 14, 12, 13, -1.4, 1.3],
    light: { x: 11, h: 9, z: 22, c: '#a8b4ae', halo: [0.35, 0.4, 0.42] },
  });
})();
