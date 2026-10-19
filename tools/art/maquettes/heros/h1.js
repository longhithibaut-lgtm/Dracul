// Hero 1: L'Écorché (starved, open coat on ribs, dried-blood bib, long claws). Accent: blood red.
(() => {
  const pal = {
    o: '#080706', w: '#17131a', W: '#2e2734', s: '#8e877a', S: '#b9b09e', z: '#4a443c',
    e: { hex: '#ff3a2a', e: [2.2, 0.1, 0.06] }, m: '#1c0406', t: '#e6dab8',
    r: '#6a0a10', R: '#3a0408', k: '#100e12', c: '#1d1920', h: '#302a35',
    n: '#a99878', N: '#615541', b: '#0d0b09',
    L: '#4a4230', l: '#3a3428', G: { hex: '#e8f0a0', e: [2.6, 2.9, 1.0] },
    x: { hex: '#ff3a2a', e: [1.2, 0.05, 0.03] }, X: { hex: '#7e1018', e: [0.35, 0.01, 0.01] },
  };
  const front = mirrorHalf([
    '................',
    '................',
    '..............ww',
    '............wwwW',
    '...........wwWww',
    '...........wwwws',
    '...........wwwSs',
    '..........cwwzSs',
    '..........cwwzes',
    '..........chwSzs',
    '..........chwztm',
    '.........chwwozr',
    '.........chwwooR',
    '........hcckwzsr',
    '........hckhwSsr',
    '........hckhzzzR',
    '........hckhwSsr',
    '........hckhzzzR',
    '........hckhzSsr',
    '........hckhzzzR',
    '........hckhzSsr',
    '........hckhzzzr',
    '........hckhozsz',
    '........hckhozzz',
    '........hckhokkk',
    '........Sskhokcc',
    '.......sSskhokcc',
    '.......n.nkhokco',
    '.......n.nkhokco',
    '......N..NkhokcO',
    '......r..rkhhkco',
    '.........kchhkco',
    '........kcchhkco',
    '.......kcchhokco',
    '......k.c.h..kco',
    '......k...h..kco',
    '.............kco',
    '.............kbo',
    '............bbbo',
    '................',
  ].map(r => r.replace('O', 'o')));
  stamp(front, 21, 27, ['_.ll...', '_LLLL..', '_LGGL..', '_LGGL..', '_.LL...']);
  const back = mirrorHalf([
    '................',
    '................',
    '..............ww',
    '............wwwW',
    '...........wwWww',
    '...........wwwww',
    '...........wWwww',
    '..........cwWwww',
    '..........cwWwwW',
    '..........chwwwW',
    '..........chwwwW',
    '.........chwwWwW',
    '.........chwwWww',
    '........hcckwWww',
    '........hckcwwWw',
    '........hckccwWw',
    '........hckcccWw',
    '........hckccccw',
    '........hckcckcc',
    '........hckcckcc',
    '........hckcckcc',
    '........hckcckcc',
    '........hckcckcc',
    '........hckcckcc',
    '........hckkckkk',
    '........Sskcckcc',
    '.......sSskcckcc',
    '.......n.nkcckcc',
    '.......n.nkcckcc',
    '......N..Nkcckcc',
    '......r..rkcckcc',
    '.........kccckcc',
    '........kcccckcc',
    '.......kcckcckcc',
    '......k.c.c..kco',
    '......k...c..kco',
    '.............kco',
    '.............kbo',
    '............bbbo',
    '................',
  ]);
  stamp(back, 4, 27, ['...ll._', '..LLLL_', '..LGGL_', '..LGGL_', '...LL._']);
  const head = [ // side head, facing right (12 wide), top-left at hair
    '....wwww....',
    '..wwwwwWw...',
    '.wwwwwWwww..',
    'wwwwwwwwwss.',
    'wwwwwwwwsSs.',
    'wwwwwwSwzSs.',
    'wwwwwSSwzesS',
    'wwwwwwSwSzss',
    'wwwwwwwozzmt',
    '.wwwwwwozrRr',
    '.wwwwwkhzRr.',
  ];
  const side = grid(32, 40);
  stamp(side, 10, 2, head);
  stamp(side, 10, 13, [
    'wwwwkcchzSr',
    '.wwkckchzSr',
    '.wwkckchzzR',
    '..wkckchzSr',
    '..kcckchzzR',
    '..kcckchzSr',
    '..kcckchzz',
    '..kcckchzS',
    '..kcckchzz',
    '..kcckchoz',
    '..kcckchkk',
    '..kcckchkk',
    '.kccckSskk',
    '.kccckkSsk',
    '.kcccckkSk',
    'kcccckkkkk',
    'kcccckckkk',
    'kccccckckk',
    'kcccc.kckk',
    'ccc.c..kck',
    '.c..c..kck',
    '.c.....kck',
    '.......kck',
    '.......kcb',
    '.......bbbb',
  ].map(r => r)); // rows 13..37
  // hanging claw hand: three long curved claws
  line(side, 19, 27, 20, 31, (s, n) => s === n ? 'r' : 'n');
  line(side, 18, 28, 18, 32, (s, n) => s === n ? 'r' : 'N');
  line(side, 20, 27, 22, 30, (s, n) => s === n ? 'r' : 'n');
  // action: lunge right, front claw swiped across
  const act = grid(40, 40);
  stamp(act, 3, 20, [ // coat flaring back
    '..........kc',
    '........kcck',
    '......kccchk',
    '....kcccchck',
    '..kccccchcck',
    'kccc.cc.hcck',
    '.k..c..c.hck',
    '.....c....hk',
  ]);
  line(act, 17, 24, 11, 33, 'k'); line(act, 18, 24, 12, 33, 'c'); line(act, 11, 34, 8, 36, 'b'); stamp(act, 7, 35, ['bbbb']); // back leg
  line(act, 15, 17, 9, 23, 'c'); line(act, 15, 18, 9, 24, 'k'); px(act, 8, 24, 'S'); px(act, 8, 25, 's'); // back arm
  line(act, 7, 25, 5, 28, 'n'); line(act, 8, 26, 7, 29, 'n'); px(act, 5, 29, 'r'); px(act, 7, 30, 'r');
  stamp(act, 14, 13, [ // leaning torso
    '...kcchzRr',
    '..kccchzSr',
    '.kcckchzzR',
    '.kcckczSr.',
    'kcckczzR..',
    'kcckzSsr..',
    'kcckzzzr..',
    'kcckzSz...',
    'kcckozz...',
    'kcckkkk...',
    '.kkkkkkk..',
  ]);
  stamp(act, 17, 3, head);
  line(act, 21, 24, 24, 29, 'k'); line(act, 22, 24, 25, 29, 'c'); line(act, 25, 29, 24, 35, 'k'); line(act, 26, 29, 25, 35, 'c'); stamp(act, 24, 36, ['bbbbb']); // front leg
  stamp(act, 20, 14, ['hhhhhhhhhSs', 'ccccccccSSs', '.kkkkkkksss']); // extended arm
  line(act, 31, 13, 35, 10, (s, n) => s === n ? 'r' : 'n');
  line(act, 31, 14, 37, 13, (s, n) => s === n ? 'r' : 'n');
  line(act, 31, 15, 37, 16, (s, n) => s === n ? 'r' : 'n');
  line(act, 30, 16, 34, 19, (s, n) => s === n ? 'r' : 'N');
  HEROES.push({
    name: "L'Écorché", tag: 'affamé, griffes croûtées', accent: 'rouge sang', why: 'le rouge du sang frais : la faim, seule couleur chaude saturée de la salle',
    pal, views: [front, back, side, act], arc: [27, 15, 12, 14, -1.45, 1.35],
    light: { x: 8, h: 11, z: 24, c: '#c8c874', halo: [0.5, 0.55, 0.2] },
  });
})();
