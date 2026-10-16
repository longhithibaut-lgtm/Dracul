import Phaser from 'phaser';
import { T } from './tuning.ts';
import { BLOOD, bleed, blot, pool, run, stains } from './enemy.ts';

// How the Order's crossbowman looks: a human in a steel kettle hat and a white tabard with the gold cross of the
// Dawn, carrying a crossbow. Gameplay owns the AI state; this file only shows it (and its bolts).
export type CrossbowState = 'chase' | 'aim' | 'shoot' | 'held' | 'kneel'; // held: in the hero's bite; kneel: just weakened

type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;
type Layer = [part: string, dx: number, dy: number, shear?: number];

// Same frame geometry as the ghouls (40x40, feet on row 34, origin row 24), so the shared blood helpers line up.
const SIZE = 40;
const FEET = 34;
const ORIGIN = 24;
const GROUND = FEET - ORIGIN;
/** Bolts fly at chest height: this far above the floor point that collides. */
export const BOLT_HEIGHT = 11;

// "Ordre (humains)" palette (docs/art.md): warm gold, tabard white, steel, against the vampires' wine and moon blue.
const PAL: Record<string, number> = {
  '0': 0x0b0710, '1': 0x1c1029,
  G: 0xffd66e, g: 0xd9982e, o: 0x8c5a1e, // gold
  W: 0xfbf2dc, w: 0xd9c7a0, v: 0x9c8463, // tabard
  S: 0xe4eaf0, s: 0xa0aabb, m: 0x5a6176, // steel
  K: 0xe9b78e, k: 0xb57a52, // skin
  B: 0xa66a3a, b: 0x63391f, L: 0x3c2418, // wood, leather
  n: 0x3b2a4a, // hose
  Y: 0xfff8d8, // glint
  r: 0xa3122f, R: 0x5c0a1c, // blood
  x: 0x0b0710, // ground shadow, drawn translucent
};
// The hit flash rims the body in white and lifts the dark tones, like the ghouls'.
const FLASH: Record<string, number> = { n: 0x5a4468, L: PAL.b, b: PAL.B, m: PAL.s, k: PAL.K, v: PAL.w };

// Pixel grids placed at (x, y) in the 40x40 frame, facing right; '.' is transparent.
const PARTS: Record<string, [x: number, y: number, rows: string]> = {
  shadow: [12, 31, `
...xxxxxxxxxx...
.xxxxxxxxxxxxxx.
xxxxxxxxxxxxxxxx
.xxxxxxxxxxxxxx.
...xxxxxxxxxx...
`],
  helm: [14, 9, `
.....SSs.....
...SSSSsss...
..SSSSssssm..
..SSsssssmm..
..gGGggggoo..
sSSSsssssssmm
.mmmmmmmmmmm.
`],
  face: [15, 16, `
.msmkkkkk.
.smsKKK1Kk
.msmKKKKK.
..smskkk..
`],
  face_hurt: [15, 16, `
.msmkkkkk.
.smsKK11Kk
.msmKK1KK.
..smskkk..
`],
  nape: [15, 16, `
.msmsmsms.
.smsmsmsm.
.msmsmsms.
..smsmsm..
`],
  body: [13, 19, `
...msmsmsm...
.ssWWWWWWWss.
smWWWWWGWWwsm
smWWWWGGGWwsm
smWWWWWGWWwsm
.mWWWWWGWWwm.
.mWWWWWWWWwm.
..LLLLGLLLL..
..WWWWWWWWv..
..WWWWWWWwv..
..gGGGGGGgo..
`],
  // Weakened: the slash wound bleeds through the tabard, a red stain running down to the hem.
  body_weak: [13, 19, `
...msmsmsm...
.ssWWWWWWWss.
smWWWWWGWrwsm
smWWWWGGrrRsm
smWWWWWGrRRsm
.mWWWWWWrRwm.
.mWWWWWWWrwm.
..LLLLGLLrL..
..WWWWWWWrv..
..WWWWWWWRv..
..gGGGGGGgr..
`],
  legs: [15, 30, `
.nn...nn.
.nn...nn.
.nn...nn.
.LL...LL.
.LLL..LLL
`],
  legs_w0: [14, 30, `
..nn...nn...
.11.....nn..
.11.....nn..
.LL......LL.
LLL......LLL
`],
  legs_w1: [14, 30, `
....11nn....
....11nn....
....LLnn....
...LLL.LL...
.......LLL..
`],
  legs_w2: [14, 30, `
..nn...11...
.nn.....11..
.nn.....11..
.LL......LL.
LLL......LLL
`],
  legs_w3: [14, 30, `
....nn11....
....nn11....
....LL11....
...LLL.LL...
.......LLL..
`],
  legs_brace: [13, 30, `
..nn.....nn..
.nn.......nn.
.nn........nn
.LL........LL
LLL........LLL
`],
  arm_far: [24, 21, `
.sm.
.ms.
.sm.
.LL.
`],
  arm_near: [16, 21, `
.Ss...
SsS...
.sS...
..Ss..
..LLL.
`],
  xbow: [12, 23, `
.............Sm...
...........vv.Sm..
.........vv....Sm.
BBBBBBBBBBBBBBmSSY
.bbbbbbbbvv....Sm.
..bb.......vv.Sm..
.............Sm...
`],
  xbow_shot: [12, 23, `
.............Sm...
.............vSm..
.............v.Sm.
BBBBBBBBBBBBBvmSm.
.bbbbbbbbb...v.Sm.
..bb.........vSm..
.............Sm...
`],
  arm_near_aim: [13, 20, `
.Ss...
Ss....
sS.LL.
.sSLL.
`],
  arm_far_aim: [23, 20, `
sm..
.sm.
..LL
..LL
`],
  glint: [29, 20, `
.Y.
YYY
.Y.
`],
  corpse: [3, 24, `
.............BBBBBBBBmSY...........
..............LL..bb..Sm...........
...mSSm.......sm...................
..mSSSSm..ssWWWWWWWWWWw.nnnnnn.LL..
..SSSsssmkKsWWWWGWWWWWwnnnnnnnLLL..
..SSsssmmkKsWWWGGGWWWWw1111111LLL..
..mSssmm.kkmWWWWWGWWWWw.11111..LL..
...mssm.....vwwwwwwwwwv............
...............sm..................
..............LL...................
`],
};

// Frames stack parts back to front as [part, dx, dy, shear].
const FRAMES: Record<string, Layer[]> = {
  idle: [['shadow', 0, 0], ['arm_far', 0, 0], ['legs', 0, 0], ['body', 0, 0], ['xbow', 0, 0], ['arm_near', 0, 0], ['helm', 0, 0], ['face', 0, 0]],
  walk0: [['shadow', 0, 0], ['arm_far', 0, 0], ['legs_w0', 0, 0], ['body', 0, 0], ['xbow', 0, 0], ['arm_near', 0, 0], ['helm', 0, 0], ['face', 0, 0]],
  walk1: [['shadow', 0, 0], ['arm_far', 0, -1], ['legs_w1', 0, 0], ['body', 0, -1], ['xbow', 0, -1], ['arm_near', 0, -1], ['helm', 0, -1], ['face', 0, -1]],
  walk2: [['shadow', 0, 0], ['arm_far', 0, 0], ['legs_w2', 0, 0], ['body', 0, 0], ['xbow', 0, 0], ['arm_near', 0, 0], ['helm', 0, 0], ['face', 0, 0]],
  walk3: [['shadow', 0, 0], ['arm_far', 0, -1], ['legs_w3', 0, 0], ['body', 0, -1], ['xbow', 0, -1], ['arm_near', 0, -1], ['helm', 0, -1], ['face', 0, -1]],
  // Raising the crossbow to the cheek, then sighting along it, braced.
  raise: [['shadow', 0, 0], ['arm_far_aim', 0, 2], ['legs_brace', 0, 0], ['body', 0, 0], ['helm', 0, 1], ['face', 0, 1], ['xbow', 1, -2], ['arm_near_aim', 0, 2]],
  aim: [['shadow', 0, 0], ['arm_far_aim', 1, 0], ['legs_brace', 0, 0], ['body', 0, 0, 0.05], ['helm', 1, 2], ['face', 1, 2], ['xbow', 3, -5], ['arm_near_aim', 1, 0]],
  lock: [['shadow', 0, 0], ['arm_far_aim', 1, 0], ['legs_brace', 0, 0], ['body', 0, 0, 0.05], ['helm', 1, 2], ['face', 1, 2], ['xbow', 3, -5], ['arm_near_aim', 1, 0], ['glint', 2, 0]],
  shot: [['shadow', 0, 0], ['arm_far_aim', 0, -2], ['legs_brace', 0, 0], ['body', 0, 0, -0.1], ['helm', -1, 1], ['face', -1, 1], ['xbow_shot', 2, -7], ['arm_near_aim', 0, -2]],
  hurt: [['shadow', 0, 0], ['arm_far', 0, 0], ['legs', 0, 0], ['body', 0, 0, -0.2], ['xbow', -3, 2], ['arm_near', -2, 0], ['helm', -4, 0], ['face_hurt', -4, 0]],
  // In the bite: the crossbow dropped (it lies by the corpse), the head thrown back, the throat bared to the fangs.
  held: [['shadow', 0, 0], ['arm_far', 0, 0], ['legs', 0, 0], ['body', 0, 0, -0.2], ['arm_near', -2, 0], ['helm', -4, 0], ['face_hurt', -4, 0]],
  corpse: [['corpse', 0, 0]],
};
// Seen from behind while heading up the screen: the face gives way to the mail coif.
for (const name of ['idle', 'walk0', 'walk1', 'walk2', 'walk3']) {
  FRAMES[name + 'b'] = FRAMES[name].map(([part, ...rest]) => [part === 'face' ? 'nape' : part, ...rest] as Layer);
}
// Weakened ('~'): the same frames bloodied, the head sunk into hunched shoulders and the crossbow sagging.
for (const name of Object.keys(FRAMES)) {
  if (name === 'corpse') continue;
  const sag = name !== 'hurt' && name !== 'held';
  FRAMES[name + '~'] = FRAMES[name].map(([part, dx, dy, shear]): Layer => part === 'body' ? ['body_weak', dx, dy, shear]
    : sag && ['helm', 'face', 'nape'].includes(part) ? [part, dx + 1, dy + 1, shear]
    : sag && part.startsWith('xbow') ? [part, dx, dy + 1, shear] : [part, dx, dy, shear]);
}
// Frames sunk into the floor and cut at the feet: buckling at the knees before falling.
// 'down~': on its knees, weakened, waiting for the bite.
const SUNK: Record<string, [frame: string, depth: number]> = { kneel: ['hurt', 6], 'down~': ['idle~', 3] };

// Stacks parts back to front. Shear leans every row above the feet by that many px per row.
function compose(layers: Layer[], sink: number, plot: (x: number, y: number, ch: string) => void) {
  for (const [part, dx, dy, shear = 0] of layers) {
    const [px, py, rows] = PARTS[part];
    const lift = part === 'shadow' ? 0 : sink;
    rows.trim().split('\n').forEach((row, j) => {
      const y = py + dy + j + lift;
      if (lift && y > FEET) return;
      const off = Math.round((FEET - y) * shear);
      [...row].forEach((ch, i) => {
        const x = px + dx + i + off;
        if (ch === '.') return;
        const edge = ch === 'x' ? 0 : 1; // body pixels keep a free border for the outline
        if (!(ch in PAL) || x < edge || x >= SIZE - edge || y < edge || y >= SIZE - edge) throw new Error(`crossbow art: bad pixel '${ch}' in ${part}`);
        plot(x, y, ch);
      });
    });
  }
}

// Bakes every frame twice: as drawn with a 1px near-black outline, and as a white-rimmed hit flash ('!').
function bake(scene: Scene) {
  const names = [...Object.keys(FRAMES), ...Object.keys(SUNK)];
  const tex = scene.textures.createCanvas('crossbow', SIZE * names.length, SIZE * 2)!;
  const img = tex.context.createImageData(tex.width, tex.height);
  const put = (x: number, y: number, c: number, a = 255) => img.data.set([c >> 16, (c >> 8) & 255, c & 255, a], (y * tex.width + x) * 4);
  names.forEach((name, n) => {
    const x0 = n * SIZE;
    const [base, sink] = SUNK[name] ?? [name, 0];
    const grid: string[] = [];
    compose(FRAMES[base], sink, (x, y, ch) => (grid[y * SIZE + x] = ch));
    const body = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && (grid[y * SIZE + x] ?? 'x') !== 'x';
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = grid[y * SIZE + x];
        if (body(x, y)) {
          put(x0 + x, y, PAL[ch]);
          put(x0 + x, SIZE + y, FLASH[ch] ?? PAL[ch]);
        } else if (body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1)) {
          put(x0 + x, y, PAL[0]);
          put(x0 + x, SIZE + y, PAL.Y);
        } else if (ch === 'x') {
          put(x0 + x, y, PAL.x, 140);
          put(x0 + x, SIZE + y, PAL.x, 140);
        }
      }
    }
    tex.add(name, 0, x0, 0, SIZE, SIZE);
    tex.add(name + '!', 0, x0, SIZE, SIZE, SIZE);
  });
  tex.putData(img, 0, 0);
  tex.refresh();
}

// Bolts: one frame per 16th of a turn, re-rasterised rather than rotated (docs/art.md): glinting steel head, wooden
// shaft, white fletching, a dark outline, and a shadow dot on the floor below.
const BW = 24, BY = 7; // frame size, and the row of the bolt's centre
function bakeBolt(scene: Scene) {
  const tex = scene.textures.createCanvas('bolt', BW * 16, BW)!;
  const ctx = tex.context;
  for (let d = 0; d < 16; d++) {
    const a = (d * Math.PI) / 8, x0 = d * BW + BW / 2;
    const pts = Array.from({ length: 10 }, (_, i) => [x0 + Math.round(Math.cos(a) * (i - 5)), BY + Math.round(Math.sin(a) * (i - 5))]);
    ctx.fillStyle = hex(PAL[0]);
    for (const [x, y] of pts) ctx.fillRect(x - 1, y - 1, 3, 3);
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = hex(i < 2 ? PAL.W : i < 7 ? PAL.B : i < 9 ? PAL.S : PAL.Y);
      ctx.fillRect(x, y, 1, 1);
    });
    ctx.fillStyle = 'rgba(11,7,16,0.55)';
    ctx.fillRect(x0 - 1, BY + BOLT_HEIGHT, 3, 1);
    tex.add(d, 0, d * BW, 0, BW, BW);
  }
  tex.refresh();
}
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** A bolt leaving the crossbow at floor point (x, y): the sprite shows at chest height, its body on the floor. */
export function bolt(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number, angle: number): Sprite {
  if (!scene.textures.exists('bolt')) bakeBolt(scene);
  const d = Math.round((Phaser.Math.Angle.Wrap(angle) * 8) / Math.PI) & 15;
  const b = (group.create(x, y - BOLT_HEIGHT, 'bolt', d) as Sprite).setOrigin(0.5, BY / BW).setDepth(y - BOLT_HEIGHT);
  b.setSize(6, 6).setOffset(BW / 2 - 3, BY + BOLT_HEIGHT - 3); // on the floor, under the shadow dot
  return b;
}

/** The bolt stops: it sticks where it struck for a moment, with a puff of splinters. */
export function boltHit(scene: Scene, b: Sprite) {
  const { x, y, depth } = b;
  const frame = b.frame.name;
  b.destroy();
  const stuck = scene.add.image(x, y, 'bolt', frame).setOrigin(0.5, BY / BW).setDepth(depth);
  scene.tweens.add({ targets: stuck, alpha: 0, delay: 1200, duration: 400, onComplete: () => stuck.destroy() });
  for (let i = 0; i < 5; i++) {
    const p = scene.add.rectangle(x, y, 1, 1, i % 2 ? PAL.B : PAL.S).setDepth(depth + 1);
    scene.tweens.add({ targets: p, x: x + Phaser.Math.Between(-7, 7), y: y + Phaser.Math.Between(-6, 3), alpha: 0,
      duration: Phaser.Math.Between(160, 300), ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  if (!scene.textures.exists('crossbow')) bake(scene);
  const s = (group.create(x, y, 'crossbow', 'idle!') as Sprite).setOrigin(0.5, ORIGIN / SIZE);
  s.setSize(12, 6).setOffset(14, 30); // feet
  s.setData({ born: scene.time.now, phase: Math.round(x * 3), aimG: scene.add.graphics().setDepth(7990) });
  return s;
}

/** Marker shown where a crossbowman is about to appear: the Dawn's gold sigil burning into the floor. */
export function telegraphSpawn(scene: Scene, x: number, y: number, ms: number) {
  const fy = y + GROUND;
  const g = scene.add.graphics().setDepth(1);
  run(scene, ms + 200, (t) => {
    const k = Math.min(1, (t * 1000) / ms);
    const r = 3 + 8 * Phaser.Math.Easing.Cubic.Out(k);
    const c = k > 0.7 && Math.floor(t * 24) % 2 ? PAL.Y : PAL.G; // flickers just before it appears
    g.clear().setAlpha(t * 1000 > ms ? 1 - (t * 1000 - ms) / 200 : 1);
    let first = true;
    blot(x, fy, r, r * 0.4, (px, py, w) => {
      g.fillStyle(first ? c : PAL.g).fillRect(px, py, 1, 1).fillRect(px + w - 1, py, 1, 1);
      if (first) g.fillRect(px, py, w, 1);
      first = false;
    });
    g.fillStyle(c).fillRect(x - 1, fy - 1, 3, 1).fillRect(x, fy - 2, 1, 4); // the cross at its heart
  }, () => g.destroy());
}

/** Shows the crossbowman; while it aims, `reach` is how far its bolt would fly along `facing` (the aim line). `weak`:
 *  hurt enough to be bitten. */
export function show(s: Sprite, state: CrossbowState, facing: number, flash: boolean, reach: number, weak: boolean) {
  const now = s.scene.time.now;
  const c = Math.cos(facing);
  if (Math.abs(c) > 0.2) s.setFlipX(c < 0);
  if (s.getData('look') !== state) s.setData({ look: state, lookAt: now });
  if (flash && !s.getData('flashOn')) {
    s.setData('hitAt', now);
    bleed(s.scene, s.x, s.y, facing + Math.PI, 5, 0.7, 0.8);
  }
  s.setData('flashOn', flash);
  const t = now - s.getData('lookAt');
  const hurt = now - (s.getData('hitAt') ?? -1e9);
  const age = now - s.getData('born');
  const C = T.crossbow;
  let f: string;
  if (state === 'held') f = 'held';
  else if (state === 'kneel') f = 'down'; // stays down when struck
  else if (hurt < 220) f = 'hurt';
  else if (state === 'aim') f = t < 100 ? 'raise' : t >= C.aimMs - C.lockMs ? 'lock' : 'aim';
  else if (state === 'shoot') f = 'shot';
  else f = s.body!.velocity.lengthSq() > 25 ? 'walk' + (Math.floor((now + s.getData('phase')) / 130) % 4) : 'idle';
  if (Math.sin(facing) < -0.5 && FRAMES[f + 'b']) f += 'b';
  if (weak) f += '~';
  // It appears in a flash of the Dawn's light, then the white rim pops on each hit.
  s.setFrame(age < 120 || (flash && hurt > 0 && hurt < 50) ? f + '!' : f);
  aimLine(s, state === 'aim' && hurt >= 220 ? t : -1, facing, reach);
  // Over the hunched head; on its knees, lower and on a slower, failing beat.
  const down = state === 'kneel';
  if (weak && state !== 'held') mark(s.getData('aimG'), s.x + (s.flipX ? -1 : 1), s.y - (down ? 16 : 19), now + s.getData('phase'), down ? 1100 : 700);
}

// The tell of a human weak enough to bite: a blood drop over its head, like a drop of the hero's health, beating like
// a racing heart (lub-dub) and swelling to a bright, bigger drop on each beat. Blood red in a dark rim: never the gold
// of the Order, nor a white hit flash. o rim, R r e blood dark to light, g glow, H glint.
const MARK_PAL: Record<string, number> = { o: PAL[0], R: 0x5c0a1c, r: 0xa3122f, e: 0xe0284a, g: 0xff4f8b, H: 0xffe4ee };
const MARK = [`
...o...
..oeo..
.oerro.
oerrrro
oerrrRo
oerrRRo
.oRRRo.
..ooo..
`, `
....o....
...oHo...
..oHgeo..
.oHgeeeo.
.ogeeeeo.
ogeeeeero
oeeeeeero
oeeeeerro
.oeeerro.
..orrro..
...ooo...
`].map((m) => m.trim().split('\n'));
function mark(g: Phaser.GameObjects.Graphics, x: number, bottom: number, t: number, period: number) {
  const beat = t % period, rows = MARK[Number(beat < 80 || (beat >= 160 && beat < 240))];
  const x0 = Math.round(x) - (rows[0].length >> 1), y0 = Math.round(bottom) - rows.length;
  rows.forEach((row, j) => [...row].forEach((c, i) => c !== '.' && g.fillStyle(MARK_PAL[c]).fillRect(x0 + i, y0 + j, 1, 1)));
}

// The telegraph: a dotted gold line along the bolt's path, marching toward the target, that turns solid and
// flickers white once the aim is locked. It ends where the bolt would stop.
function aimLine(s: Sprite, t: number, facing: number, reach: number) {
  const g = s.getData('aimG') as Phaser.GameObjects.Graphics;
  g.clear();
  if (t < 0) return;
  const C = T.crossbow;
  const locked = t >= C.aimMs - C.lockMs;
  const cx = Math.cos(facing), cy = Math.sin(facing);
  const x0 = s.body!.center.x, y0 = s.body!.center.y - BOLT_HEIGHT;
  const march = Math.floor(t / 60);
  const len = Math.min(reach, 12 + (reach - 12) * Math.min(1, t / 200)); // shoots out as it is raised
  const color = locked && Math.floor(t / 50) % 2 ? PAL.Y : PAL.G;
  g.fillStyle(color, locked ? 1 : 0.6 + 0.4 * Math.min(1, t / (C.aimMs - C.lockMs)));
  for (let k = 14; k < len; k++) if (locked || (k - march) % 5 < 3) g.fillRect(Math.round(x0 + cx * k), Math.round(y0 + cy * k), 1, 1);
  if (len >= reach) {
    const ex = Math.round(x0 + cx * reach), ey = Math.round(y0 + cy * reach);
    g.fillRect(ex - 2, ey, 5, 1).fillRect(ex, ey - 2, 1, 5); // where it would land
  }
}

export function die(scene: Scene, s: Sprite) {
  (s.getData('aimG') as Phaser.GameObjects.Graphics).destroy();
  s.setFrame('hurt!');
  scene.time.delayedCall(70, () => {
    const { x, y, flipX } = s;
    const away = (s.getData('facing') ?? 0) + Math.PI;
    s.destroy();
    // Humans bleed: a red burst, it buckles at the knees, falls on its back and a pool spreads under it.
    bleed(scene, x, y, away, 20, 1.2, 1);
    const body = scene.add.image(x, y, 'crossbow', 'kneel').setOrigin(0.5, ORIGIN / SIZE).setFlipX(flipX).setDepth(y);
    scene.time.delayedCall(160, () => {
      body.setFrame('corpse');
      run(scene, 500, (t) => {
        const k = Phaser.Math.Easing.Quadratic.Out(t / 0.5);
        const rt = stains(scene);
        pool(x + (flipX ? 2 : -2), y + GROUND - 2, 2 + 10 * k, 1 + 3 * k, (c, px, py, w) => rt.fill(c, 1, px, py, w, 1), BLOOD.mid, BLOOD.dark);
        rt.render();
      }, () => {
        stains(scene).stamp('crossbow', 'corpse', x, y, { originY: ORIGIN / SIZE, scaleX: flipX ? -1 : 1 }).render();
        body.destroy();
      });
    });
  });
}
