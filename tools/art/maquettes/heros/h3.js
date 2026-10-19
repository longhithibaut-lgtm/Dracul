// Hero 3: Le Supplicié (hood, broken manacles with chain ends, bandages, bitten bloody iron collar, torch). Accent: ember orange.
(() => {
  const pal = {
    o: '#080706', u: '#2a241c', U: '#3c3428', y: '#16130f', k: '#0a0908',
    s: '#7c766c', S: '#a39b8c', z: '#403b34', e: { hex: '#ffa040', e: [2.4, 1.0, 0.15] }, t: '#e6dab8', m: '#1c0406',
    I: '#7e7a70', i: '#3e3b37', q: '#6b3a1e', r: '#7e1018', R: '#43130c',
    b: '#5f5747', B: '#3d372d', a: '#171411', A: '#25201a',
    l: '#3a2a18', F: { hex: '#ffd890', e: [2.6, 1.9, 0.6] }, f: { hex: '#e8a040', e: [1.6, 0.7, 0.12] }, g: { hex: '#a0301c', e: [0.5, 0.1, 0.02] },
    x: { hex: '#ffb050', e: [1.5, 0.7, 0.1] }, X: { hex: '#a0301c', e: [0.4, 0.08, 0.02] },
  };
  const front = mirrorHalf([
    '................',
    '..............uu',
    '............uuUU',
    '...........yuUuu',
    '..........yuuUkk',
    '..........yuuUkk',
    '..........yuuUek',
    '..........yuuUzs',
    '..........yuuuts',
    '..........yuuyzs',
    '.........yuuuUIi',
    '........yuUuuyiq',
    '.......yuuUuyzrs',
    '.......yu.uyyzsr',
    '.......y.yuyuyzR',
    '.........zsayuSr',
    '.........zsayybz',
    '.........zsayuyb',
    '.........BbayyzS',
    '.........bBayuSz',
    '.........BbayyzR',
    '.........bBayuyy',
    '........IiiayyuA',
    '........IiiaqqqR',
    '.........ss.aaAA',
    '.........sz.aaAa',
    '.........z..aaAa',
    '............aAaa',
    '............aAa.',
    '............aAa.',
    '...........aaAa.',
    '...........a.aa.',
    '............bB..',
    '............BR..',
    '............bB..',
    '............sB..',
    '............bB..',
    '...........bBB..',
    '...........BBB..',
    '................',
  ]);
  const chainEnd = (g, x, y, len) => { for (let k = 0; k < len; k++) px(g, x + (k > 2 ? (x < 16 ? -1 : 1) : 0), y + k, k % 2 ? 'i' : 'I'); };
  chainEnd(front, 8, 24, 7);
  // right hand holds the torch, flame at shoulder height
  stamp(front, 21, 21, ['_ss..', '_szl.', '__.l.']);
  line(front, 24, 21, 26, 13, 'l');
  stamp(front, 24, 6, ['..g..', '.gf..', '.fFf.', 'fFFfg', 'fFFf.', '.ff..', '..l..']);
  stamp(front, 22, 22, ['IiiI']); px(front, 23, 24, 'I'); px(front, 24, 25, 'i'); px(front, 24, 26, 'I');
  const back = mirrorHalf([
    '................',
    '..............uu',
    '............uuUU',
    '...........yuUuu',
    '..........yuuUuu',
    '..........yuuuUu',
    '..........yuUuuu',
    '..........yuuuuU',
    '..........yuuUuu',
    '..........yuuuuu',
    '.........yuuuUuu',
    '........yuUuuuyu',
    '.......yuuUuyuuu',
    '.......yu.uyuuyu',
    '.......y.yuyuyuy',
    '.........zsayuyy',
    '.........zsayyuy',
    '.........zsaybyy',
    '.........Bbayyby',
    '.........bBayuyb',
    '.........Bbayyyy',
    '.........bBayuyy',
    '........IiiayyuA',
    '........IiiaqqqR',
    '.........ss.aaAA',
    '.........sz.aaAa',
    '.........z..aaAa',
    '............aAaa',
    '............aAa.',
    '............aAa.',
    '...........aaAa.',
    '...........a.aa.',
    '............bB..',
    '............BR..',
    '............bB..',
    '............sB..',
    '............bB..',
    '...........bBB..',
    '...........BBB..',
    '................',
  ]);
  chainEnd(back, 23, 24, 7);
  stamp(back, 6, 21, ['..ss_', '.lzs_', '.l.__']); line(back, 7, 21, 5, 13, 'l');
  stamp(back, 3, 6, ['..g..', '..fg.', '.fFf.', 'gfFFf', '.fFFf', '..ff.', '..l..']);
  stamp(back, 6, 22, ['IiiI']);
  const head = [
    '....uuuU...',
    '..uuuUUuu..',
    '.yuuUuuuUu.',
    'yuuuuuUkkk.',
    'yuuuuUkkkk.',
    'yuuuuUkkek.',
    'yuuuuuUkzs.',
    'yuuuuuuUts.',
    '.yuuuuuyzs.',
    '.yuuuuyIIi.',
    '..yuuuyiqi.',
  ];
  const side = grid(32, 40);
  stamp(side, 10, 13, [
    '.yuuuUuyzrr',
    'yuuUuuuyabs',
    'yuyuUuyaabR',
    '.y.yuyabbbb',
    '....ayuzsyy',
    '....ayyzsyz',
    '....ayuzsyS',
    '....ayyBbyR',
    '....ayubByy',
    '....ayyIiiy',
    '....aqqIiiq',
    '.....aaassA',
    '.....aaAszA',
    '.....aaAa.',
    '.....aAaa',
    '.....aAaa',
    '....aAa.a',
    '....aA..aa',
    '.....bB.bB',
    '.....sS.sS',
    '.....bB.bB',
    '.....sS.sS',
    '....bBB.bBB',
    '....BBB.BBBB',
  ]);
  stamp(side, 10, 2, head);
  chainEnd(side, 19, 25, 7); // chain end swinging from the near wrist
  const act = grid(40, 40);
  stamp(act, 13, 3, head);
  stamp(act, 10, 13, [ // torso pitched forward
    '...yuuuUuyzrr.',
    '..yuuUuuuyabsR',
    '.yuyuUuyaabbb.',
    '..y.yuyBbbbb..',
    '.....ayuyzSr..',
    '....ayuyyzR...',
    '....ayyuyzS...',
    '...ayuyyyz....',
    '...aqqqqqA....',
    '...aaaAaaa....',
    '..aaAa.aAa....',
  ]);
  line(act, 12, 23, 8, 31, 'a'); line(act, 13, 23, 9, 31, 'A'); line(act, 8, 32, 7, 35, 'b'); stamp(act, 5, 36, ['BBBb']); // back leg
  line(act, 18, 23, 22, 28, 'a'); line(act, 19, 23, 23, 28, 'A'); line(act, 22, 29, 22, 35, 'b'); line(act, 23, 29, 23, 35, 'B'); stamp(act, 21, 36, ['bBBBB']);
  // back arm with torch, trailing
  line(act, 14, 16, 8, 20, 's'); line(act, 14, 17, 8, 21, 'z'); stamp(act, 6, 19, ['IiI', 'iIi']); line(act, 6, 21, 2, 15, 'l');
  stamp(act, 0, 9, ['..g..', '.gfg.', '.fFf.', 'fFFfg', 'fFFf.', '.ff..']);
  chainEnd(act, 7, 22, 4);
  stamp(act, 20, 14, ['ssssSSSIi', 'zzzsssSIi', '......sIi']); // slashing arm, manacle at wrist
  const c = (x1, y1) => line(act, 30, 15, x1, y1, (s, n) => s === n ? 'r' : 'b');
  c(34, 11); c(36, 14); c(35, 18);
  line(act, 29, 17, 31, 20, 'I'); px(act, 32, 21, 'i'); px(act, 32, 22, 'I'); // chain end flying
  HEROES.push({
    name: 'Le Supplicié', tag: 'chaînes brisées, collier mordu', accent: 'orange braise', why: 'l’orange braise des yeux et de la torche : chaud contre la crasse froide, et sa propre lumière tranche avec la lanterne verdâtre',
    pal, views: [front, back, side, act], arc: [27, 15, 12, 13, -1.4, 1.3],
    light: { x: 9, h: 31, z: 34, c: '#e09040', halo: [0.75, 0.35, 0.08] },
  });
})();
