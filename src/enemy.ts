import Phaser from 'phaser';
import { T } from './tuning.ts';

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
  e: 0xe0284a, E: 0xff4f8b,
  t: 0x3fa7a3, T: 0x1f4a5a,
  s: 0x0b0710, // ground shadow, drawn translucent
};
const BLOOD = { light: 0xe0284a, mid: 0xa3122f, dark: 0x5c0a1c, dry: 0x3e0820 }; // drops, pools and stains
// The hit flash is white, but the darkest tones stay faintly grey so the face and claws still read in a still frame.
const FLASH: Record<string, number> = { '0': 0x9a8496, '1': 0x9a8496, '2': 0xd6c6d2, d: 0xf0e6ec, e: PAL.e, E: PAL.e };

// Pixel grids placed at (x, y) in the 40x40 frame; '.' is transparent.
const PARTS: Record<string, [x: number, y: number, rows: string]> = {
  head: [12, 8, `
...h.....h.....
...Rh...hRd....
..hRr..hRrd....
..hRrrrRRrrd...
..Rrrrrrrrrrd..
.hRrr2222222d..
.Rr2t00bBBB00..
.Rrt0B0eBB0eBb.
.Rrt0BBBBBBBBBb
RRrdt0bBBBBBbb4
Rrrdt00bbbbb4..
.rrdtt0B000Btd.
.......B...B...
`],
  head_rage: [12, 8, `
...h.....h.....
...Rh...hRd....
..hRr..hRrd....
..hRrrrRRrrd...
..Rrrrrrrrrrd..
.hRrr2222222d..
.Rr2t00bBB00d..
.Rrt0B0EBB0EBb.
.Rrt0BBBBBBBBBb
RRrdt0bBBBBBbb4
Rrrdt0bB000Bb..
.rrdtt0B000B0d.
.......B...B...
`],
  head_hurt: [12, 8, `
...h.....h.....
...Rh...hRd....
..hRr..hRrd....
..hRrrrRRrrd...
..Rrrrrrrrrrd..
.hRrr2222222d..
.Rr2t0bBBBBB2..
.Rrt0B0EBB0EBb.
.Rrt0BBBBBBBBBb
RRrdt0bBBBBBbb4
Rrrdt0bB000Bb..
.rrdtt0B000B0d.
.......B...B...
`],
  hood: [12, 8, `
...h.....h....
...Rh...hRd...
..hRr..hRrd...
..hRrrrRRrrd..
..Rrrrrrrrrrd.
.hRrr2222222d.
.Rr2t0000002..
.Rrt0000000d..
.Rrt000000d...
RRrdt0000d....
Rrrdt000d.....
.rrdtt0dd.....
`],
  head_back: [12, 8, `
...h.....h.....
...Rh...hRd....
..hRr..hRrd....
..hRrrrRRrrd...
..RRrrrrrrrrd..
.hRRrrrrrrrrdt.
.RRrrrrrrrrrdt4
.RRrrrrrrrrddtb
.RRrrrrrrrrdd..
RRRrrrrrrrdd...
dRrrrrrrrdd....
.ddrrrrrdd.....
`],
  body_back: [7, 16, `
..hRr...........rd....
.hRRrr.........rrrd...
hRRRrrrrrrrrrrrrrrdd..
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
....Rr2drrrdrrrdrdd...
`],
  lunge_body: [4, 19, `
.............hRRr.....
...........hRRrrrd....
..........hRrrrrrrd...
.........hRrrrrrrrrd..
........hRrrrrrrrrrrd.
.......hRrrrrrrrrrrrrd
......hRrrrrrrrdrrrrrd
.....RRrrrrrrrdrrrrrdd
....RRrrrrrrrdrrrrrdd.
...RRrr2rrrrdrrrrdd...
..Rrr2.rrrdrrrddd.....
.Rr2..rd.rd.rd........
r2...2111.............
.....b1b..............
`],
  lunge_near: [20, 21, `
............b
.........0BB.
.RRRr...000..
RRrrrrRd11BBb
.rrrrrdd110..
....ddd.00BB.
............b
`],
  lunge_far: [25, 12, `
........b
.....0BB.
..RR000..
.Rrr11BBb
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
..hRr...........rd....
.hRRrr.........rrrd...
hRRRrrr.......rrrrdd..
RRRRrrrrr...drrrrrrdd.
RRRRRrrrrrrdtttdrrrrdd
.RRRRrrrrrrd2T2drrrrdd
..RRRrrrrrrrd2drrrrdd.
...RRrrrrrrrdtdrrrdd..
....RRrrrdrrd2drrdd...
.....Rrrrdrrdtdrrd....
.....RRrrdrrd2drdd....
.....Rrrrdrrd.drdd....
.....Rrrrdrrrdrrdd....
.....RRrrdrrrdrrdd....
....RRrrdrrrrdrrrdd...
....Rr2drrrdrrrdrdd...
`],
  hem0: [10, 32, `
RR.Rr.rr.rr.rd.d
`],
  hem1: [10, 32, `
.RR.Rr.rr.rd.dd.
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
...R..
..RRr.
..Rr2.
..r2..
..r2..
.012..
0110..
01100.
B0B0B.
B.B.B.
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
  arm_far_up: [5, 3, `
b..b..b.
.B.B.B..
.B0B0B..
.01110..
..0110..
..011...
..R11...
..RRr...
..RRrd..
...Rrd..
...RRr..
....Rrd.
....RRr.
....Rrr.
.....Rr.
.....RRr
.....Rrr
`],
  arm_near_up: [23, 3, `
.b..b..b
..B.B.B.
..B0B0B.
..01110.
..0110..
...110..
...11d..
...rdd..
..rrdd..
..rdd...
..rrd...
.rrd....
.rdd....
.rrd....
rrd.....
rrd.....
rd......
`],
  shadow: [12, 31, `
...sssssssssss...
..sssssssssssss..
sssssssssssssssss
sssssssssssssssss
..sssssssssssss..
......sssss......
`],
  glint_big: [28, 1, `
..E..
..B..
EBBBE
..B..
..E..
`],
  glint_small: [29, 2, `
.E.
EBE
.E.
`],
  heap: [8, 27, `
.......h.....h..........
.......Rh...hRd.........
......hRrrrrRrrd........
....hRRrrrrrrrrrd.......
...hRrrr2rrrrdrrrd......
..RRrrrdrrrrrdrrrrdd....
.Rrr2rrdrrdrrrdrrrdd1B.B
Rr2.rd.rd.rd.rd.dd..b.b.
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
  wind0: [['shadow', 0, 0], ['arm_far', 0, 2], ['body', 0, 1], ['hem0', 0, 1], ['legs', 0, 0], ['arm_near', 0, 2], ['head', 0, 2]],
  wind1: [['shadow', 0, 0], ['arm_far_up', 0, 0], ['body', 0, 0], ['hem0', 0, 0], ['legs', 0, 0], ['arm_near_up', 0, 0], ['head_rage', 0, -1], ['glint_big', 0, 0]],
  wind2: [['shadow', 0, 0], ['arm_far_up', 1, 0], ['body', 1, 0], ['hem0', 1, 0], ['legs', 0, 0], ['arm_near_up', 1, 0], ['head_rage', 1, -1], ['glint_small', 1, 0]],
  wind3: [['shadow', 0, 0], ['arm_far_up', 0, 0], ['body', 0, 0], ['hem0', 0, 0], ['legs', 0, 0], ['arm_near_up', 0, 0], ['head_rage', 0, -1]],
  wind4: [['shadow', 0, 0], ['arm_far_up', 1, 0], ['body', 1, 0], ['hem0', 1, 0], ['legs', 0, 0], ['arm_near_up', 1, 0], ['head_rage', 1, -1]],
  lunge: [['shadow', 0, 0], ['lunge_far', 0, 0], ['lunge_body', 0, 0], ['head_rage', 5, 4], ['lunge_near', 1, 2]],
  hurt: [['shadow', 0, 0], ['arm_far_fling', 0, 0], ['body', 0, 0, -0.2], ['hem0', 0, 0, -0.2], ['legs', 0, 0], ['arm_near', -1, -1], ['head_hurt', -4, 0]],
  recover0: [['shadow', 0, 0], ['arm_far', 1, 3], ['body', 0, 2], ['hem0', 0, 1], ['legs', 0, 0], ['arm_near', 1, 3], ['head', 2, 4]],
  recover1: [['shadow', 0, 0], ['arm_far', 1, 2], ['body', 0, 1], ['hem0', 0, 1], ['legs', 0, 0], ['arm_near', 1, 2], ['head', 2, 3]],
  robe: [['shadow', 0, 0], ['arm_far', 0, 0], ['body', 0, 0], ['hem0', 0, 0], ['legs', 0, 0], ['arm_near', 0, 0], ['hood', 0, 0]],
  heap: [['heap', 0, 0]],
  mask: [['mask', 0, 0]],
};
// Seen from behind while it heads up the screen: the same poses with the back of the hood and robe ('b' suffix).
const BACK: Record<string, string> = { head: 'head_back', head_rage: 'head_back', body: 'body_back' };
for (const name of ['idle', 'walk0', 'walk1', 'walk2', 'walk3', 'wind0', 'wind1', 'wind2', 'wind3', 'wind4', 'recover0', 'recover1']) {
  FRAMES[name + 'b'] = FRAMES[name].map(([part, ...rest]) => [BACK[part] ?? part, ...rest] as Layer);
}

// Frames sunk into the floor and cut at the feet: climbing out of the spawn pool, and the emptied robe collapsing.
const SUNK: Record<string, [frame: string, depth: number]> = { rise0: ['idle', 18], rise1: ['idle', 11], rise2: ['idle', 5], slump: ['robe', 7] };

// Stacks parts back to front. Shear leans every row above the feet by that many px per row (the recoil).
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
        if (!(ch in PAL) || x < 0 || x >= SIZE || y < 0 || y >= SIZE) throw new Error(`enemy art: bad pixel '${ch}' in ${part}`);
        plot(x, y, ch);
      });
    });
  }
}

// Bakes every frame three times: as drawn, as a white hit flash ('!') and as a flat lunge after-image ('~').
function bake(scene: Scene) {
  const names = [...Object.keys(FRAMES), ...Object.keys(SUNK)];
  const tex = scene.textures.createCanvas('enemy', SIZE * names.length, SIZE * 3)!;
  const img = tex.context.createImageData(tex.width, tex.height);
  const put = (x: number, y: number, c: number, a = 255) => img.data.set([c >> 16, (c >> 8) & 255, c & 255, a], (y * tex.width + x) * 4);
  names.forEach((name, n) => {
    const x0 = n * SIZE;
    const [base, sink] = SUNK[name] ?? [name, 0];
    compose(FRAMES[base], sink, (x, y, ch) => {
      if (ch === 's') return void (put(x0 + x, y, PAL.s, 140), put(x0 + x, SIZE + y, PAL.s, 140));
      put(x0 + x, y, PAL[ch]);
      put(x0 + x, SIZE + y, FLASH[ch] ?? 0xffffff);
      put(x0 + x, 2 * SIZE + y, PAL.h);
    });
    tex.add(name, 0, x0, 0, SIZE, SIZE);
    tex.add(name + '!', 0, x0, SIZE, SIZE, SIZE);
    tex.add(name + '~', 0, x0, 2 * SIZE, SIZE, SIZE);
  });
  tex.putData(img, 0, 0);
  tex.refresh();
}

export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  if (!scene.textures.exists('enemy')) bake(scene);
  const s = (group.create(x, y, 'enemy', 'rise0') as Sprite).setOrigin(0.5, ORIGIN / SIZE);
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
    // crouch, claws up with a glint, tremble, and a last glint just before the lunge
    f = t < 100 ? 'wind0' : t < 150 || t >= T.enemy.windupMs - 60 ? 'wind1' : t < 200 ? 'wind2' : Math.floor(t / 45) % 2 ? 'wind4' : 'wind3';
  } else if (state === 'lunge') {
    f = 'lunge';
    trail(s, now);
  } else if (state === 'recover') f = t > 200 && Math.floor(t / 180) % 2 ? 'recover1' : 'recover0';
  else f = s.body!.velocity.lengthSq() > 25 ? 'walk' + (Math.floor((now + s.getData('phase')) / 120) % 4) : 'idle';
  if (Math.sin(facing) < -0.5 && FRAMES[f + 'b']) f += 'b';
  s.setFrame(flash && hurt > 0 && hurt < 50 ? f + '!' : f); // impact frame in colour, then a white pop of a few frames
}

// After-images left behind during the lunge.
function trail(s: Sprite, now: number) {
  if (now - (s.getData('trailAt') ?? -1e9) < 45) return;
  s.setData('trailAt', now);
  const g = image(s.scene, s.x, s.y, 'lunge~', s.flipX).setAlpha(0.35).setDepth(s.y - 1);
  s.scene.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
}

export function die(scene: Scene, s: Sprite) {
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
        Phaser.Utils.Array.GetRandom([PAL[2], PAL[4], 0x5a4468, BLOOD.light])).setDepth(y + 1);
      scene.tweens.add({ targets: a, y: a.y - Phaser.Math.Between(14, 30), x: a.x + Phaser.Math.Between(-6, 6), alpha: 0,
        duration: Phaser.Math.Between(700, 1400), ease: 'Sine.easeOut', onComplete: () => a.destroy() });
    }
    const heap = image(scene, x, y, 'slump', flipX).setDepth(y);
    scene.time.delayedCall(90, () => heap.setFrame('heap'));
    run(scene, 360, (t) => {
      const k = Phaser.Math.Easing.Quadratic.Out(t / 0.36);
      const rt = stains(scene);
      pool(x, fy, 2 + 9 * k, 1 + 3 * k, (c, px, py, w) => rt.fill(c, 1, px, py, w, 1), BLOOD.mid, BLOOD.dark);
      rt.render();
    }, () => {
      stains(scene).stamp('enemy', 'heap', x, y, { originY: ORIGIN / SIZE, scaleX: flipX ? -1 : 1 }).render();
      heap.destroy();
    });
    fly(scene, [{ o: image(scene, x, y, 'mask', flipX), x, y, z: 16, vx: Math.cos(away) * 28, vy: Math.sin(away) * 18, vz: 80, d: 0,
      land: (mx, my) => stains(scene).stamp('enemy', 'mask', mx, my, { originY: ORIGIN / SIZE, scaleX: flipX ? -1 : 1 }).render() }]);
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
function bleed(scene: Scene, x: number, y: number, angle: number, n: number, spread: number, power: number, z = 12,
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
function image(scene: Scene, x: number, y: number, frame: string, flipX: boolean) {
  return scene.add.image(x, y, 'enemy', frame).setOrigin(0.5, ORIGIN / SIZE).setFlipX(flipX);
}

// Floor layer that keeps blood, robes and masks for the rest of the fight. Recreated after a scene restart.
function stains(scene: Scene) {
  return (scene.children.getByName('enemy-stains') as Phaser.GameObjects.RenderTexture | null)
    ?? scene.add.renderTexture(0, 0, scene.scale.width, scene.scale.height).setOrigin(0).setDepth(1).setName('enemy-stains');
}

// A blood pool with a lit rim along its top-left edge (light comes from the top left) and an optional dark core.
function pool(x: number, y: number, rx: number, ry: number, fill: (c: number, x: number, y: number, w: number) => void, lit: number, body: number, core?: number) {
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
function blot(cx: number, cy: number, rx: number, ry: number, row: (x: number, y: number, w: number) => void) {
  if (rx < 0.5 || ry < 0.5) return;
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    row(Math.round(cx) - hw, Math.round(cy) + dy, 2 * hw + 1);
  }
}

// Calls fn(seconds elapsed) every frame for `ms`, then done(). Tweens stop with the scene, so nothing outlives a restart.
function run(scene: Scene, ms: number, fn: (t: number) => void, done?: () => void) {
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, ease: 'Linear',
    onUpdate: (tw) => fn((tw.getValue() ?? 0) / 1000), onComplete: () => (fn(ms / 1000), done?.()) });
}
