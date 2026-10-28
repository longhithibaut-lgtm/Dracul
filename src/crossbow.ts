import Phaser from 'phaser';
import { blot, run } from './enemy.ts';
import * as Foes from './foes.ts';

// How the Order's crossbowman looks: a man of the Order in the « grand pixel » style like the others (foes.ts; his sheet,
// src/crossbow.png, rendered by tools/art/foes.gen.mjs from the enemy sheets' model): kettle hat, quilted gambeson under
// the tabard of the Dawn, a lantern on a pole over his head, a heavy crossbow. His aim is told by his body alone: the
// crossbow raised, shouldered, the bolt's head glinting once the aim is locked; never by a line on the floor
// (docs/decisions.md). Gameplay owns the AI state; this file shows it, and its bolts.
export type CrossbowState = 'chase' | 'aim' | 'shoot' | 'held' | 'kneel'; // held: in the hero's bite; kneel: just weakened

type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;

/** Bolts fly at the crossbow's height: this far above the floor point that collides. */
export const BOLT_HEIGHT = 22;
const GOLD = { Y: 0xfff8d8, G: 0xffd66e, g: 0xd9982e }; // the Order's

export const create = (scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite => Foes.create(scene, group, 'crossbow', x, y);
export const die = Foes.die;

/** Shows the crossbowman facing `facing` (his aim while he aims). `weak`: hurt enough to be bitten. */
export function show(s: Sprite, state: CrossbowState, facing: number, flash: boolean, weak: boolean) {
  s.setData('aim', facing);
  Foes.show(s, state, flash, weak);
}

/** Marker shown where a man of the Order is about to appear: the Dawn's gold sigil burning into the floor. */
export function telegraphSpawn(scene: Scene, x: number, y: number, ms: number) {
  const fy = y + 10;
  const g = scene.add.graphics().setDepth(1);
  run(scene, ms + 200, (t) => {
    const k = Math.min(1, (t * 1000) / ms);
    const r = 3 + 8 * Phaser.Math.Easing.Cubic.Out(k);
    const c = k > 0.7 && Math.floor(t * 24) % 2 ? GOLD.Y : GOLD.G; // flickers just before it appears
    g.clear().setAlpha(t * 1000 > ms ? 1 - (t * 1000 - ms) / 200 : 1);
    let first = true;
    blot(x, fy, r, r * 0.4, (px, py, w) => {
      g.fillStyle(first ? c : GOLD.g).fillRect(px, py, 1, 1).fillRect(px + w - 1, py, 1, 1);
      if (first) g.fillRect(px, py, w, 1);
      first = false;
    });
    g.fillStyle(c).fillRect(x - 1, fy - 1, 3, 1).fillRect(x, fy - 2, 1, 4); // the cross at its heart
  }, () => g.destroy());
}

// Bolts: one frame per 16th of a turn, re-rasterised rather than rotated, at the screen's fine pixels (drawn at half
// scale): a glinting steel head, a wooden shaft, pale fletching, a dark edge, and a shadow dot on the floor below.
const BW = 48, BH = 64, BY = 14; // frame size, and the row of the bolt's centre (fine px)
function bakeBolt(scene: Scene) {
  const tex = scene.textures.createCanvas('bolt', BW * 16, BH)!;
  const ctx = tex.context, hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
  for (let d = 0; d < 16; d++) {
    const a = (d * Math.PI) / 8, x0 = d * BW + BW / 2;
    const pts = Array.from({ length: 21 }, (_, i) => [x0 + Math.round(Math.cos(a) * (i - 10)), BY + Math.round(Math.sin(a) * (i - 10))]);
    ctx.fillStyle = hex(0x14110d);
    for (const [x, y] of pts) ctx.fillRect(x - 1, y - 1, 3, 3);
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = hex(i < 4 ? 0xcfcbb8 : i < 15 ? 0x8c663e : i < 19 ? 0xa0a4a8 : 0xf0f2f4);
      ctx.fillRect(x, y, 1, 1);
    });
    ctx.fillStyle = 'rgba(8,7,6,0.55)';
    ctx.fillRect(x0 - 2, BY + 2 * BOLT_HEIGHT, 5, 2);
    tex.add(d, 0, d * BW, 0, BW, BH);
  }
  tex.refresh();
}

/** A bolt leaving the crossbow at floor point (x, y): the sprite shows at the crossbow's height, its body on the floor. */
export function bolt(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number, angle: number): Sprite {
  if (!scene.textures.exists('bolt')) bakeBolt(scene);
  const d = Math.round((Phaser.Math.Angle.Wrap(angle) * 8) / Math.PI) & 15;
  const b = (group.create(x, y - BOLT_HEIGHT, 'bolt', d) as Sprite).setOrigin(0.5, BY / BH).setScale(0.5).setDepth(y - 10);
  b.setSize(12, 12).setOffset(BW / 2 - 6, BY + 2 * BOLT_HEIGHT - 6); // on the floor, under the shadow dot
  return b;
}

/** The bolt stops: it sticks where it struck for a moment, with a puff of splinters. */
export function boltHit(scene: Scene, b: Sprite) {
  const { x, y, depth } = b;
  const frame = b.frame.name;
  b.destroy();
  const stuck = scene.add.image(x, y, 'bolt', frame).setOrigin(0.5, BY / BH).setScale(0.5).setDepth(depth);
  scene.tweens.add({ targets: stuck, alpha: 0, delay: 1200, duration: 400, onComplete: () => stuck.destroy() });
  for (let i = 0; i < 6; i++) {
    const p = scene.add.rectangle(x, y, 0.5, 0.5, i % 2 ? 0x8c663e : 0xa0a4a8).setDepth(depth + 1);
    scene.tweens.add({ targets: p, x: x + Phaser.Math.Between(-7, 7), y: y + Phaser.Math.Between(-6, 3), alpha: 0,
      duration: Phaser.Math.Between(160, 300), ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

// The tell of a human weak enough to bite: a blood drop over its head, beating like
// a racing heart (lub-dub) and swelling to a bright, bigger drop on each beat. Blood red in a dark rim: never the gold
// of the Order, nor a white hit flash. o rim, R r e blood dark to light, g glow, H glint.
const MARK_PAL: Record<string, number> = { o: 0x0b0710, R: 0x5c0a1c, r: 0xa3122f, e: 0xe0284a, g: 0xff4f8b, H: 0xffe4ee };
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
export function mark(g: Phaser.GameObjects.Graphics, x: number, bottom: number, t: number, period: number) {
  const beat = t % period, rows = MARK[Number(beat < 80 || (beat >= 160 && beat < 240))];
  const x0 = Math.round(x) - (rows[0].length >> 1), y0 = Math.round(bottom) - rows.length;
  rows.forEach((row, j) => [...row].forEach((c, i) => c !== '.' && g.fillStyle(MARK_PAL[c]).fillRect(x0 + i, y0 + j, 1, 1)));
}
