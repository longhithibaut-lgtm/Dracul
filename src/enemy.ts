import Phaser from 'phaser';
import { T } from './tuning.ts';
import { skin, boost, bloodied, SANG } from './dark.ts';

// How enemies look. Gameplay owns the AI state; this file only shows it.
export type EnemyState = 'chase' | 'windup' | 'lunge' | 'recover';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;
type Layer = [part: string, dx: number, dy: number, shear?: number];

// A blood thrall: bat-eared hood, fanged bone mask, long claws. Drawn facing right; show() mirrors it.
// Frames are 40x40 with the feet on row 34. The origin row keeps the feet 10 px under the sprite position,
// about where the hero's are, so gameplay's sort-by-y draws whoever stands lower in front.
const SIZE = 40;
const FEET = 34;
const ORIGIN = 24;
const GROUND = FEET - ORIGIN; // floor level below the sprite position: shadows, pools, landing blood
const RISE_MS = 240;

// "Nuit de sang" palette, plus four wine tones for the robe (d, r, R, h) so it stays apart from blood and from the hero.
const PAL: Record<string, number> = {
  '0': 0x0b0710, '1': 0x1c1029, '2': 0x2e1838, '4': 0x8a6f8f,
  d: 0x33102a, r: 0x521030, R: 0x7a1a3e, h: 0xb03a5e,
  B: 0xe8dcc8, b: 0xb7a58f,
  e: 0xe0284a, E: 0xff4f8b, W: 0xffe4ee, '8': 0x8f195e, // eyes and their glow
  t: 0x3fa7a3, T: 0x1f4a5a,
  s: 0x0b0710, // ground shadow, drawn translucent
};
// Drops, pools and stains; in the trial room, the darker blood of its effects (fx-blood.ts).
const BLOODS = [{ light: 0xe0284a, mid: 0xa3122f, dark: 0x5c0a1c, dry: 0x3e0820 }, { light: SANG[4], mid: SANG[3], dark: SANG[2], dry: SANG[1] }];
export const BLOOD = {
  get light() { return BLOODS[+skin.dark].light; }, get mid() { return BLOODS[+skin.dark].mid; },
  get dark() { return BLOODS[+skin.dark].dark; }, get dry() { return BLOODS[+skin.dark].dry; },
};
// The hit flash rims the body in white and lifts the robe a tone instead of filling it white, so the struck thrall
// stays a dark shape apart from the pale hero standing at it.
const FLASH: Record<string, number> = { d: PAL.r, r: PAL.R, R: PAL.h, h: PAL.E };

// Pixel grids placed at (x, y) in the 40x40 frame; '.' is transparent.
const PARTS: Record<string, [x: number, y: number, rows: string]> = {
  head: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..Rrrrrrrrrrd..
.RRrrdddddddd..
.Rrd000bBBB00..
.Rr00B0eBB0eBb.
.Rr00BBBBBBBBBb
RRrd00bBBBBBbb4
Rrrd000bbbbb4..
.rrd000B000B0d.
.......B...B...
`],
  head_rage: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..Rrrrrrrrrrd..
.RRrrdddddddd..
.Rrd000bBB00d..
.Rr00B0EBB0EBb.
.Rr00BBBBBBBBBb
RRrd00bBBBBBbb4
Rrrd00bB000Bb..
.rrd000B000B0d.
.......B...B...
`],
  head_glare: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..Rrrrrrrrrrd..
.RRrrdddddddd..
.Rrd08W8BBW80..
.Rr08EW8B8WEb..
.Rr00BBBBBBBBBb
RRrd00bBBBBBbb4
Rrrd00bB000Bb..
.rrd000B000B0d.
.......B...B...
`],
  head_flare: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..Rrrrrrrrrrd..
.RRrrdddddddd..
.Rrd0EWEBBEWE0.
.Rr0EWWEBEWWEb.
.Rr00BBBBBBBBBb
RRrd00bBBBBBbb4
Rrrd00bB000Bb..
.rrd000B000B0d.
.......B...B...
`],
  head_hurt: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..Rrrrrrrrrrd..
.RRrrdddddddd..
.Rrd00bBBBBBd..
.Rr00B0EBB0EBb.
.Rr00BBBBBBBBBb
RRrd00bBBBBBbb4
Rrrd00bB000Bb..
.rrd000B000B0d.
.......B...B...
`],
  hood: [12, 8, `
...R.....R....
...RR...RRd...
..RRr..RRrd...
..RRrrrRRrrd..
..Rrrrrrrrrrd.
.RRrrdddddddd.
.Rrd0000000d..
.Rr00000000d..
.Rr0000000d...
RRrd00000d....
Rrrd0000d.....
.rrd000dd.....
`],
  head_back: [12, 8, `
...R.....R.....
...RR...RRd....
..RRr..RRrd....
..RRrrrRRrrd...
..RRrrrrrrrrd..
.RRRrrrrrrrrd0.
.RRrrrrrrrrrd04
.RRrrrrrrrrdd0b
.RRrrrrrrrrdd..
RRRrrrrrrrdd...
dRrrrrrrrdd....
.ddrrrrrdd.....
`],
  body_back: [7, 16, `
..RRr...........rd....
.RRRrr.........rrrd...
RRRRrrrrrrrrrrrrrrdd..
RRRRrrrrrrrrrrrrrrrdd.
RRRRRrrrrddddrrdrrrrdd
.RRRRrrrrrrrrrrdrrrrdd
..RRRrrrrrrrrrdrrrrdd.
...RRrrrrrrrrrdrrrdd..
....RRrrrdrrrrdrrdd...
.....Rrrrdrrrrdrrd....
.....RRrrdrrrrdrdd....
.....Rrrrdrrrrdrdd....
.....Rrrrdrrrdrrdd....
.....RRrrdrrrdrrdd....
....RRrrdrrrrdrrrdd...
....Rrddrrrdrrrdrdd...
`],
  lunge_body: [4, 19, `
.............RRRr.....
...........RRRrrrd....
..........RRrrrrrrd...
.........RRrrrrrrrrd..
........RRrrrrrrrrrrd.
.......RRrrrrrrrrrrrrd
......RRrrrrrrrdrrrrrd
.....RRrrrrrrrdrrrrrdd
....RRrrrrrrrdrrrrrdd.
...RRrrdrrrrdrrrrdd...
..rrrd.rrrdrrrddd.....
.rrd..rd.rd.rd........
rd...d111.............
.....b1b..............
`],
  lunge_near: [20, 21, `
............b
.........0BB.
.RRRr...000..
RRrrrrrd11BBb
.rrrrrdd110..
....ddd.00BB.
............b
`],
  lunge_far: [25, 12, `
........b
.....0BB.
..RR000..
.rrr11BBb
rrd.110..
....00BB.
........b
`],
  arm_far_fling: [1, 11, `
b..b...
.B.B.B.
.B0B0B.
.01110.
..0111.
...1RR.
....RRr
.....Rr
`],
  body: [7, 16, `
..RRr...........rd....
.RRRrr.........rrrd...
RRRRrrr.......rrrrdd..
RRRRrrrrr...rrrrrrrdd.
RRRRRrrrrrrrrrrrrrrdd.
.RRRRrrrrrrrrrrrrrrdd.
..RRRrrrrrrrrrrrrrdd..
...RRrrrrrrrrrrrrdd...
....RRrrrrrrrrrddd....
.....RRrrrrrrrdddd....
.....RRrrrrrdddddd....
.....RRrrrrddddddd....
.....RRrrrdddddddd....
....RRrrrddddddddd....
....RRrrdddddddddd....
...RRrdddddddddddd....
`],
  hem0: [10, 32, `
RR.rr.rr.rr.rd.d
`],
  hem1: [10, 32, `
.RR.rr.rr.rd.dd.
`],
  legs: [10, 33, `
...11.......11..
..bBb......bBb..
`],
  legs_w0: [10, 33, `
..11.........11.
.bBb........bBb.
`],
  legs_w1: [10, 32, `
..........11....
.....bBb..11....
.........bBb....
`],
  legs_w2: [10, 33, `
....11.....11...
...bBb....bBb...
`],
  legs_w3: [10, 32, `
......11........
......11.bBb....
.....bBb........
`],
  arm_far: [5, 19, `
...R...
..RRr..
..rrd..
..rd...
..rd...
.01d...
0110...
01100..
B0B0B..
B.B.B..
b..b..b
`],
  arm_near: [25, 19, `
.r......
rrrr....
drrrr...
.d.rrd..
...rrd..
...1d...
..0110..
..01100.
..B0B0B.
..B.B.B.
.b..b..b
`],
  arm_cock: [2, 0, `
B..B..B.....
.B..B..B....
..B..B.B....
...B.B.B....
...0B0B0....
...01110....
....0110....
............
...RRR11....
..RRRrr1....
..RRrrrrr...
.RRrrrdrrd..
.Rrrrddrrrd.
.rrdrrddrrr.
.rd.rdddrrr.
.d..d..drrr.
.......ddrr.
........ddr.
`],
  arm_thrust: [20, 20, `
..............BB...
...RRRr......B.....
..RRrrrrRRr0B......
..rrrrrrrrd011BBB..
..ddddrrddd0111..b.
...dddddd..01BB....
...........0..BB...
................b..
`],
  legs_brace: [8, 32, `
..d1.........11...
.d11..........11..
bBb............bBb
`],
  wing_l: [1, 1, `
..B..B..B.......
...B..B..B......
....B..B.B......
.....B.BB.......
.....00BB0......
.....01110......
.....hh110......
.hhhhRRRRh......
hRRRRddrRRh.....
.dddddrddRRh....
..ddddrdddRRh...
...rddrddddRRh..
..rdddrdddddRRh.
.rddddrddddddRRh
r..dddrdddddddRR
....ddrddddddddR
....drdddddddddd
....rddddddddd..
....rd...dddd...
....r.....d.....
`],
  wing_r: [25, 7, `
......hhhhhhh.
.....hRRRRRRRR
....hRRddddd..
...hRRdrddd...
..hRRddrdddr..
.hRRdddrddddr.
hRRddddrdddddr
RRdddddrddd...
ddddddrdd.....
ddddddrddd....
ddddd...dd....
`],
  shadow: [12, 31, `
...sssssssssss...
..sssssssssssss..
sssssssssssssssss
sssssssssssssssss
..sssssssssssss..
......sssss......
`],
  heap: [8, 27, `
.......R.....R..........
.......RR...RRd.........
......RRrrrrRrrd........
....RRRrrrrrrrrrd.......
...RRrrrdrrrrdrrrd......
..RRrrrdrrrrrdrrrrdd....
.rrrdrrdrrdrrrdrrrdd1B.B
rrd.rd.rd.rd.rd.dd..b.b.
`],
  mask: [17, 30, `
.bBBBb.
bB0BB0b
4bBBBb4
.B...B.
`],
};
// Frames stack parts back to front as [part, dx, dy, shear].
const FRAMES: Record<string, Layer[]> = {
  idle: [['shadow', 0, 0], ['arm_far', 0, 0], ['body', 0, 0], ['hem0', 0, 0], ['legs', 0, 0], ['arm_near', 0, 0], ['head', 0, 0]],
  walk0: [['shadow', 0, 0], ['arm_far', 0, -1], ['body', 0, 0], ['hem0', 0, 0], ['legs_w0', 0, 0], ['arm_near', 0, 1], ['head', 0, 0]],
  walk1: [['shadow', 0, 0], ['arm_far', 0, -1], ['body', 0, -1], ['hem1', 0, -1], ['legs_w1', 0, 0], ['arm_near', 0, 0], ['head', 0, -1]],
  walk2: [['shadow', 0, 0], ['arm_far', 0, 1], ['body', 0, 0], ['hem0', 0, 0], ['legs_w2', 0, 0], ['arm_near', 0, -1], ['head', 0, 0]],
  walk3: [['shadow', 0, 0], ['arm_far', 0, 0], ['body', 0, -1], ['hem1', 0, -1], ['legs_w3', 0, 0], ['arm_near', 0, -1], ['head', 0, -1]],
  wind0: [['shadow', 0, 0], ['arm_cock', 3, 6], ['body', 0, 1, -0.05], ['hem0', 0, 1, -0.05], ['legs_brace', 0, 0], ['head_glare', 1, 2], ['arm_thrust', -4, 1]],
  wind1: [['shadow', 0, 0], ['wing_r', 0, 0], ['wing_l', 0, 0], ['body', 0, 0, 0.15], ['hem0', 0, 0, 0.15], ['legs_brace', 0, 0], ['head_glare', 3, 1], ['arm_thrust', 0, 0]],
  wind2: [['shadow', 0, 0], ['wing_r', 0, -1], ['wing_l', 1, 0], ['body', 1, 0, 0.15], ['hem0', 1, 0, 0.15], ['legs_brace', 0, 0], ['head_glare', 4, 1], ['arm_thrust', 1, 0]],
  wind3: [['shadow', 0, 0], ['wing_r', 0, 0], ['wing_l', 0, 0], ['body', 0, 0, 0.15], ['hem0', 0, 0, 0.15], ['legs_brace', 0, 0], ['head_flare', 3, 1], ['arm_thrust', 0, 0]],
  lunge: [['shadow', 0, 0], ['lunge_far', 0, 0], ['lunge_body', 0, 0], ['head_rage', 5, 4], ['lunge_near', 1, 2]],
  hurt: [['shadow', 0, 0], ['arm_far_fling', 0, 0], ['body', 0, 0, -0.2], ['hem0', 0, 0, -0.2], ['legs', 0, 0], ['arm_near', -1, -1], ['head_hurt', -4, 0]],
  recover0: [['shadow', 0, 0], ['arm_far', 1, 3], ['body', 0, 2], ['hem0', 0, 1], ['legs', 0, 0], ['arm_near', 1, 3], ['head', 2, 4]],
  recover1: [['shadow', 0, 0], ['arm_far', 1, 2], ['body', 0, 1], ['hem0', 0, 1], ['legs', 0, 0], ['arm_near', 1, 2], ['head', 2, 3]],
  robe: [['shadow', 0, 0], ['arm_far', 0, 0], ['body', 0, 0], ['hem0', 0, 0], ['legs', 0, 0], ['arm_near', 0, 0], ['hood', 0, 0]],
  heap: [['heap', 0, 0]],
  mask: [['mask', 0, 0]],
};
// Seen from behind while it heads up the screen: the same poses with the back of the hood and robe ('b' suffix).
const BACK: Record<string, string> = { head: 'head_back', head_glare: 'head_back', head_flare: 'head_back', body: 'body_back' };
for (const name of ['idle', 'walk0', 'walk1', 'walk2', 'walk3', 'wind0', 'wind1', 'wind2', 'wind3', 'recover0', 'recover1']) {
  FRAMES[name + 'b'] = FRAMES[name].map(([part, ...rest]) => [BACK[part] ?? part, ...rest] as Layer);
}

// Parts that get a dark seam where a later part overlaps them (hem, legs and loose pieces stay seamless).
const SEAMED = /^(wing|body|head|hood|arm|lunge)/;

// Frames sunk into the floor and cut at the feet: climbing out of the spawn pool, and the emptied robe collapsing.
const SUNK: Record<string, [frame: string, depth: number]> = { rise0: ['idle', 18], rise1: ['idle', 11], rise2: ['idle', 5], slump: ['robe', 7] };

// Stacks parts back to front. Shear leans every row above the feet by that many px per row (the recoil).
function compose(layers: Layer[], sink: number, plot: (x: number, y: number, ch: string, part: string, k: number) => void) {
  layers.forEach(([part, dx, dy, shear = 0], k) => {
    const [px, py, rows] = PARTS[part];
    const lift = part === 'shadow' ? 0 : sink;
    rows.trim().split('\n').forEach((row, j) => {
      const y = py + dy + j + lift;
      if (lift && y > FEET) return;
      const off = Math.round((FEET - y) * shear);
      [...row].forEach((ch, i) => {
        const x = px + dx + i + off;
        if (ch === '.') return;
        const edge = ch === 's' ? 0 : 1; // body pixels keep a free border for the outline
        if (!(ch in PAL) || x < edge || x >= SIZE - edge || y < edge || y >= SIZE - edge) throw new Error(`enemy art: bad pixel '${ch}' in ${part}`);
        plot(x, y, ch, part, k);
      });
    });
  });
}

// Bakes every frame three times: as drawn, as a white-rimmed hit flash ('!') and as a flat lunge after-image ('~').
// The body gets a 1px near-black outline so it reads against any floor, red rings included (the shadow is not body),
// and each wing, arm, hood and robe gets one where it passes behind another, so they read as separate shapes.
function bake(scene: Scene) {
  const names = [...Object.keys(FRAMES), ...Object.keys(SUNK)];
  const tex = scene.textures.createCanvas('enemy', SIZE * names.length, SIZE * 3)!;
  const img = tex.context.createImageData(tex.width, tex.height);
  const put = (x: number, y: number, c: number, a = 255) => img.data.set([c >> 16, (c >> 8) & 255, c & 255, a], (y * tex.width + x) * 4);
  names.forEach((name, n) => {
    const x0 = n * SIZE;
    const [base, sink] = SUNK[name] ?? [name, 0];
    const grid: string[] = [];
    const layer: number[] = [];
    compose(FRAMES[base], sink, (x, y, ch, part, k) => ((grid[y * SIZE + x] = ch), (layer[y * SIZE + x] = SEAMED.test(part) ? k : -1)));
    const body = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && (grid[y * SIZE + x] ?? 's') !== 's';
    const above = (x: number, y: number, k: number) => body(x, y) && layer[y * SIZE + x] > k;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = grid[y * SIZE + x];
        if (body(x, y)) {
          const k = layer[y * SIZE + x];
          const seam = k >= 0 && (above(x - 1, y, k) || above(x + 1, y, k) || above(x, y - 1, k) || above(x, y + 1, k));
          put(x0 + x, y, seam ? PAL[0] : PAL[ch]);
          put(x0 + x, SIZE + y, seam ? PAL[0] : FLASH[ch] ?? PAL[ch]);
          put(x0 + x, 2 * SIZE + y, PAL.h);
        } else if (body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1)) {
          put(x0 + x, y, PAL[0]);
          put(x0 + x, SIZE + y, PAL.W);
        } else if (ch === 's') {
          put(x0 + x, y, PAL.s, 140);
          put(x0 + x, SIZE + y, PAL.s, 140);
        }
      }
    }
    tex.add(name, 0, x0, 0, SIZE, SIZE);
    tex.add(name + '!', 0, x0, SIZE, SIZE, SIZE);
    tex.add(name + '~', 0, x0, 2 * SIZE, SIZE, SIZE);
  });
  tex.putData(img, 0, 0);
  tex.refresh();
}

// The torture room's ghoul (« Crasse et faim », dark.ts): the mockup's emaciated pale crawler on all fours, facing right,
// its eyes glowing. Same frame names as the thrall's, posed by moving its body and limbs: its legs are the rows from 9
// down (the hind ones left of column 9, the fore ones under the head); its sheet also holds the eyes alone ('*' frames).
const GHOUL = [
  '.......oooo..........',
  '.....oodFFdoo........',
  '....odFFffFFdo.......',
  '...odffrfrfrfdoo.....',
  '..odfrfrfrfffFFdoo...',
  '..odfffffffffffFFdoo.',
  '.odfdooffffffffFfFFdo',
  '.odo.odfdddooodfdFefo',
  'odo..odfo.....odffdeo',
  'odo..odfo....odmmfdo.',
  'o...odfo....odfmmdo..',
  '....odfo...odfoooo...',
  '...odfdo..odfo.......',
  '..odfdo..odfdo.......',
  '.onnoo..onnno........',
];
const GHOUL_PAL: Record<string, number> = { ...boost({ o: 0x080706, f: 0x6b675a, F: 0x9a9482, d: 0x423e36, r: 0x2c2924, m: 0x5a0c08, n: 0xb8ae90 }), e: 0xeef6d0 }; // the mockup's, lit 2.2x
const GHOUL_FLASH = bloodied(GHOUL_PAL); // struck: dyed with blood, no white rim (fx-blood.ts opens the wound)
// body: [dx, dy]; hind, fore: how far the feet swing (the hip stays put); shear: lean per row up from the feet.
type Pose = { body?: [number, number]; hind?: number; fore?: number; shear?: number; flare?: true; flat?: true };
const POSES: Record<string, Pose> = {
  idle: {}, walk0: { hind: 2, fore: -2 }, walk1: { body: [0, 1] }, walk2: { hind: -2, fore: 2 }, walk3: { body: [0, 1] },
  wind0: { body: [-1, 1], fore: 1 }, wind1: { body: [-2, 1], fore: 2 }, wind2: { body: [-1, 1], fore: 2 }, wind3: { body: [-2, 1], fore: 2, flare: true },
  lunge: { body: [2, 0], shear: 0.3, hind: -3, fore: 4, flare: true }, hurt: { body: [-1, 0], shear: -0.25 },
  recover0: { body: [0, 2] }, recover1: { body: [0, 1] }, robe: { body: [0, 3], hind: -2, fore: 2 }, heap: { flat: true }, mask: {},
};

function bakeGhoul(scene: Scene) {
  const names = [...Object.keys(FRAMES), ...Object.keys(SUNK)];
  const tex = scene.textures.createCanvas('enemy-dark', SIZE * names.length, SIZE * 4)!;
  const img = tex.context.createImageData(tex.width, tex.height);
  const put = (x: number, y: number, c: number, a = 255) => img.data.set([c >> 16, (c >> 8) & 255, c & 255, a], (y * tex.width + x) * 4);
  names.forEach((name, n) => {
    const x0 = n * SIZE, [base, sink] = SUNK[name] ?? [name.replace(/b$/, ''), 0], pose = POSES[base];
    const grid: string[] = [];
    const plot = (x: number, y: number, ch: string) => { y += sink; if (x > 0 && x < SIZE - 1 && y > 0 && y <= FEET) grid[y * SIZE + x] = ch; };
    if (base === 'mask') for (const [x, y] of [[19, 33], [20, 33], [21, 32]]) plot(x, y, 'n'); // a shard of bone
    else GHOUL.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      if (pose.flat) return plot(10 + i - (j < 9 ? 1 : 0), FEET - Math.round((14 - j) * 0.4), ch === 'e' ? 'd' : ch); // collapsed
      const hind = j >= 9 && i <= 8, fore = j >= 11 && i >= 8 && i <= 13, [bx, by] = hind || fore ? [0, 0] : pose.body ?? [0, 0];
      const swing = hind ? Math.round(((pose.hind ?? 0) * (j - 8)) / 6) : fore ? Math.round(((pose.fore ?? 0) * (j - 10)) / 4) : 0;
      const x = 10 + i + bx + swing + Math.round((14 - j) * (pose.shear ?? 0)), y = 20 + j + by;
      plot(x, y, ch);
      if (ch === 'e' && pose.flare) plot(x - 1, y, 'e');
    }));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const ch = grid[y * SIZE + x];
        if (ch) {
          put(x0 + x, y, GHOUL_PAL[ch]);
          put(x0 + x, SIZE + y, GHOUL_FLASH[ch] ?? GHOUL_PAL[ch]);
          put(x0 + x, 2 * SIZE + y, 0x929e58);
          if (ch === 'e') put(x0 + x, 3 * SIZE + y, GHOUL_PAL.e);
        } else {
          if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([i, j]) => grid[(y + j) * SIZE + x + i] === 'e')) put(x0 + x, 3 * SIZE + y, GHOUL_PAL.e, 80); // their halo
          if (base !== 'mask' && ((x + 0.5 - 21) / 10) ** 2 + ((y + 0.5 - FEET) / 2.5) ** 2 <= 1) { put(x0 + x, y, PAL.s, 140); put(x0 + x, SIZE + y, PAL.s, 140); }
        }
      }
    tex.add(name, 0, x0, 0, SIZE, SIZE);
    tex.add(name + '!', 0, x0, SIZE, SIZE, SIZE);
    tex.add(name + '~', 0, x0, 2 * SIZE, SIZE, SIZE);
    tex.add(name + '*', 0, x0, 3 * SIZE, SIZE, SIZE);
  });
  tex.putData(img, 0, 0);
  tex.refresh();
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  const key = skin.dark ? 'enemy-dark' : 'enemy';
  if (!scene.textures.exists(key)) (skin.dark ? bakeGhoul : bake)(scene);
  const s = (group.create(x, y, key, 'rise0') as Sprite).setOrigin(0.5, ORIGIN / SIZE);
  s.setSize(12, 6).setOffset(14, 30); // feet
  s.setData({ born: scene.time.now, phase: Math.round(x * 3) });
  bleed(scene, x, y, -Math.PI / 2, 6, Math.PI, 0.5, 1); // blood thrown up as it climbs out of the pool
  return s;
}

/** Marker shown where an enemy is about to appear: blood drips into a dark pool that the thrall climbs out of. */
export function telegraphSpawn(scene: Scene, x: number, y: number, ms: number) {
  const fy = y + GROUND;
  const g = scene.add.graphics().setDepth(1);
  const fill = (c: number, px: number, py: number, w: number) => g.fillStyle(c).fillRect(px, py, w, 1);
  run(scene, ms + 300, (t) => {
    const k = (t * 1000) / ms;
    const grow = k < 1 ? Phaser.Math.Easing.Cubic.Out(k) : 1 - ((k - 1) * ms) / 300;
    const rim = k > 0.7 && k < 1 && Math.floor(t * 24) % 2 ? BLOOD.light : BLOOD.mid; // flickers just before it rises
    g.clear();
    for (const [dx, dy, rx, ry] of [[-10, 2, 2, 1], [11, -1, 1.5, 1], [-4, 1, 6, 3], [5, -1, 6, 2.6]]) pool(x + dx * grow, fy + dy, rx * grow, ry * grow, fill, rim, BLOOD.dry);
    pool(x, fy, 9 * grow, 3.6 * grow, fill, rim, BLOOD.dry, PAL[0]);
  }, () => g.destroy());
  for (let i = 0; i < 6; i++) {
    scene.time.delayedCall((i * ms) / 10, () => {
      const o = scene.add.rectangle(0, 0, 1, 2, i % 2 ? BLOOD.mid : BLOOD.light).setOrigin(0);
      fly(scene, [{ o, x: x + Phaser.Math.Between(-6, 6), y: fy + Phaser.Math.Between(-1, 1), z: Phaser.Math.Between(26, 40), vx: 0, vy: 0, vz: -40, d: 0,
        land: (rx, ry) => ripple(scene, rx, ry) }]);
    });
  }
}

// A ring spreading where a drop hits the pool.
function ripple(scene: Scene, x: number, y: number) {
  const g = scene.add.graphics().setDepth(1);
  run(scene, 260, (t) => {
    const c = t < 0.13 ? BLOOD.light : BLOOD.mid;
    const rows = 2 * Math.floor(0.6 + t * 6) + 1;
    let i = 0;
    g.clear();
    blot(x, y, 1 + t * 22, 0.6 + t * 6, (px, py, w) => {
      g.fillStyle(c);
      if (i === 0 || i === rows - 1) g.fillRect(px, py, w, 1);
      else g.fillRect(px, py, 1, 1).fillRect(px + w - 1, py, 1, 1);
      i++;
    });
  }, () => g.destroy());
}

export function show(s: Sprite, state: EnemyState, facing: number, flash: boolean) {
  const now = s.scene.time.now;
  const c = Math.cos(facing);
  if (Math.abs(c) > 0.2) s.setFlipX(c < 0); // no flicker while the hero is straight above or below
  if (s.getData('look') !== state) s.setData({ look: state, lookAt: now });
  if (flash && !s.getData('flashOn')) {
    s.setData('hitAt', now);
    bleed(s.scene, s.x, s.y, facing + Math.PI, 5, 0.7, 0.8);
  }
  s.setData('flashOn', flash);
  const t = now - s.getData('lookAt');
  const hurt = now - (s.getData('hitAt') ?? -1e9);
  const age = now - s.getData('born');
  let f: string;
  if (hurt < 220) f = 'hurt';
  else if (age < RISE_MS) f = 'rise' + Math.floor((age * 3) / RISE_MS);
  else if (state === 'windup') {
    // coil back, then cock one claw behind the head and aim the other at the hero, trembling; the eyes flare just before the lunge
    f = t < 80 ? 'wind0' : t >= T.enemy.windupMs - 60 ? 'wind3' : Math.floor(t / 50) % 2 ? 'wind2' : 'wind1';
  } else if (state === 'lunge') {
    f = 'lunge';
    trail(s, now);
  } else if (state === 'recover') f = t > 200 && Math.floor(t / 180) % 2 ? 'recover1' : 'recover0';
  else f = s.body!.velocity.lengthSq() > 25 ? 'walk' + (Math.floor((now + s.getData('phase')) / 120) % 4) : 'idle';
  if (Math.sin(facing) < -0.5 && FRAMES[f + 'b']) f += 'b';
  s.setFrame(flash && hurt > 0 && hurt < 50 ? f + '!' : f); // impact frame in colour, then a white-rim pop for a few frames
}

// After-images left behind during the lunge.
function trail(s: Sprite, now: number) {
  if (now - (s.getData('trailAt') ?? -1e9) < 45) return;
  s.setData('trailAt', now);
  const g = image(s.scene, s.texture.key, s.x, s.y, 'lunge~', s.flipX).setAlpha(0.35).setDepth(s.y - 1);
  s.scene.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
}

export function die(scene: Scene, s: Sprite) {
  const key = s.texture.key;
  s.setFrame('hurt!');
  scene.time.delayedCall(70, () => {
    const { x, y, flipX } = s;
    const away = (s.getData('facing') ?? 0) + Math.PI;
    const fy = y + GROUND;
    s.destroy();
    // It bursts: blood everywhere, ash drifting up, the empty robe drops into a spreading pool and the mask flies off.
    bleed(scene, x, y, away, 24, 1.4, 1);
    bleed(scene, x, y, away, 7, 1.8, 0.7, 10, [PAL.R, PAL.r, PAL.d], 1); // shreds of robe
    for (let i = 0; i < 18; i++) {
      const a = scene.add.rectangle(x + Phaser.Math.Between(-7, 7), y + Phaser.Math.Between(-10, 8), 1, 1,
        Phaser.Utils.Array.GetRandom(skin.dark ? [SANG[1], SANG[2], 0x2b261e, BLOOD.light] : [PAL[2], PAL[4], 0x5a4468, BLOOD.light])).setDepth(y + 1);
      scene.tweens.add({ targets: a, y: a.y - Phaser.Math.Between(14, 30), x: a.x + Phaser.Math.Between(-6, 6), alpha: 0,
        duration: Phaser.Math.Between(700, 1400), ease: 'Sine.easeOut', onComplete: () => a.destroy() });
    }
    const heap = image(scene, key, x, y, 'slump', flipX).setDepth(y);
    scene.time.delayedCall(90, () => heap.setFrame('heap'));
    run(scene, 360, (t) => {
      const k = Phaser.Math.Easing.Quadratic.Out(t / 0.36);
      const rt = stains(scene);
      pool(x, fy, 2 + 9 * k, 1 + 3 * k, (c, px, py, w) => rt.fill(c, 1, px, py, w, 1), BLOOD.mid, BLOOD.dark);
      rt.render();
    }, () => {
      stains(scene).stamp(key, 'heap', x, y, { originY: ORIGIN / SIZE, scaleX: flipX ? -1 : 1 }).render();
      heap.destroy();
    });
    fly(scene, [{ o: image(scene, key, x, y, 'mask', flipX), x, y, z: 16, vx: Math.cos(away) * 28, vy: Math.sin(away) * 18, vz: 80, d: 0,
      land: (mx, my) => stains(scene).stamp(key, 'mask', mx, my, { originY: ORIGIN / SIZE, scaleX: flipX ? -1 : 1 }).render() }]);
  });
}

type Flier = { o: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image; x: number; y: number; z: number; vx: number; vy: number; vz: number; d: number; land: (x: number, y: number) => void; t0?: number };
const GRAVITY = 300;

// Moves objects on ballistic arcs: (x, y) on the floor, z the height above it, d their depth offset from y.
// Each calls land() where it touches down.
// t0 starts a flier part-way along its arc, so a burst is already spread on its first frame.
function fly(scene: Scene, items: Flier[]) {
  const ends = items.map((p) => (p.vz + Math.sqrt(p.vz * p.vz + 2 * GRAVITY * p.z)) / GRAVITY);
  const step = (time: number) => items.forEach((p, i) => {
    if (!p.o.active) return;
    const t = time + (p.t0 ?? 0);
    const tt = Math.min(t, ends[i]);
    const gx = Math.round(p.x + p.vx * tt);
    const gy = Math.round(p.y + p.vy * tt);
    p.o.setPosition(gx, gy - Math.round(p.z + p.vz * tt - (GRAVITY * tt * tt) / 2)).setDepth(gy + p.d);
    if (t < ends[i]) return;
    p.o.destroy();
    p.land(gx, gy);
  });
  step(0);
  run(scene, Math.max(...ends) * 1000, step);
}

// Drops (blood by default) from the chest of a thrall at (x, y), flung around `angle`; they stain the floor where they land.
export function bleed(scene: Scene, x: number, y: number, angle: number, n: number, spread: number, power: number, z = 12,
  colors = [BLOOD.light, BLOOD.mid, BLOOD.mid, BLOOD.dark], big = 0.2) {
  const items: Flier[] = [];
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() * 2 - 1) * spread;
    const v = (15 + Math.random() ** 2 * 80) * power; // most drops land close, a few fly far
    const c = Phaser.Utils.Array.GetRandom(colors);
    const w = Math.random() < big ? 2 : 1;
    const o = scene.add.rectangle(0, 0, w, w, c).setOrigin(0);
    items.push({ o, x, y: y + GROUND, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, vz: (40 + Math.random() * 80) * power, d: -GROUND, t0: Math.random() * 0.04,
      land: (gx, gy) => stains(scene).fill(c === BLOOD.light ? BLOOD.mid : c === BLOOD.mid ? BLOOD.dark : BLOOD.dry, 1, gx, gy, v > 60 ? w + 1 : w, 1).render() });
  }
  fly(scene, items);
}

// A loose frame of the thrall (after-image, falling robe, flying mask), placed like the sprite.
function image(scene: Scene, key: string, x: number, y: number, frame: string, flipX: boolean) {
  return scene.add.image(x, y, key, frame).setOrigin(0.5, ORIGIN / SIZE).setFlipX(flipX);
}

// Floor layer that keeps blood, robes and masks for the rest of the fight, over the whole room (the physics world is its
// floor), however tall. Recreated after a scene restart. The trial room's has its hero's resolution (dark.ts skin.zoom),
// for fx-blood.ts's drops; callers still give room pixels (fractions reach its finer ones).
type Stains = {
  fill(c: number, a: number, x: number, y: number, w: number, h: number): Stains;
  stamp(key: string, frame: string, x: number, y: number, o: { originY: number; scaleX: number }): Stains;
  render(): Stains;
};
export function stains(scene: Scene): Stains {
  const b = scene.physics.world.bounds, Z = skin.zoom;
  const rt = (scene.children.getByName('enemy-stains') as Phaser.GameObjects.RenderTexture | null)
    ?? scene.add.renderTexture(0, 0, (b.right + 40) * Z, (b.bottom + 16) * Z).setOrigin(0).setScale(1 / Z).setDepth(1).setName('enemy-stains');
  const s: Stains = {
    fill: (c, a, x, y, w, h) => (rt.fill(c, a, x * Z, y * Z, w * Z, h * Z), s),
    stamp: (key, frame, x, y, o) => (rt.stamp(key, frame, x * Z, y * Z, { ...o, scaleX: o.scaleX * Z, scaleY: Z }), s),
    render: () => (rt.render(), s),
  };
  return s;
}

// A blood pool with a lit rim along its top-left edge (light comes from the top left) and an optional dark core.
export function pool(x: number, y: number, rx: number, ry: number, fill: (c: number, x: number, y: number, w: number) => void, lit: number, body: number, core?: number) {
  let top = true;
  blot(x, y, rx, ry, (px, py, w) => {
    fill(body, px, py, w);
    if (top) fill(lit, px, py, Math.max(1, Math.round(w * 0.6)));
    else if (py < y) fill(lit, px, py, 1);
    top = false;
  });
  if (core !== undefined) blot(x + 1, y + 0.5, rx - 3, ry - 1.5, (px, py, w) => fill(core, px, py, w));
}

// A pixel ellipse drawn one row at a time, so it stays crisp at native resolution.
export function blot(cx: number, cy: number, rx: number, ry: number, row: (x: number, y: number, w: number) => void) {
  if (rx < 0.5 || ry < 0.5) return;
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    row(Math.round(cx) - hw, Math.round(cy) + dy, 2 * hw + 1);
  }
}

// Calls fn(seconds elapsed) every frame for `ms`, then done(). Tweens stop with the scene, so nothing outlives a restart.
export function run(scene: Scene, ms: number, fn: (t: number) => void, done?: () => void) {
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, ease: 'Linear',
    onUpdate: (tw) => fn((tw.getValue() ?? 0) / 1000), onComplete: () => (fn(ms / 1000), done?.()) });
}
