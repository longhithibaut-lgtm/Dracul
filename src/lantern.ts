import Phaser from 'phaser';
import { T } from './tuning.ts';
import { ellipseDist } from './logic.ts';

// Sacred lanterns of the Order: an iron lantern on a pale stone plinth, crowned and marked with the sun of the
// Eternal Dawn, casting a pool of holy light that burns vampires. Gameplay owns hp and timing; this file shows them.

type Scene = Phaser.Scene;
type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };
// Light is drawn twice: a multiply layer soaks up the floor's blue, an additive one pours gold onto it. Gold over blue
// in plain alpha only turns grey.
type Lamp = [mul: G, add: G];
export type Lantern = {
  x: number; y: number; // centre of its footprint and of its pool of light
  hp: number;
  lit: boolean; // false during the telegraph: not solid, no light
  light: Lamp; img?: Phaser.GameObjects.Image; zone?: Phaser.GameObjects.Zone; timer: Phaser.Time.TimerEvent; stutterUntil: number;
};

// Palette "Ordre / lumière sacrée" (docs/art.md): white-hot to bronze gold, the Order's pale stone, iron.
const PAL: Record<string, number> = {
  W: 0xfff6d8, Y: 0xffd75e, G: 0xc8902a, g: 0x7a4a1c,
  B: 0xe8dcc8, b: 0xb7a58f, '4': 0x8a6f8f,
  I: 0x5a4468, K: 0x3b2a4a, k: 0x1c1029,
  '0': 0x0b0710, s: 0x0b0710, // outline; ground shadow, drawn translucent
};
const ABOVE = 9_000; // over characters
const FLOOR = 1.5; // over blood stains, under characters

// 13x27, feet on row 25. Rows above 7 (the sun finial) get no outline: its rays would drown in black.
const BASE = `
......Y......
...Y..Y..G...
....YWWWG....
..YYYWWWYGG..
....GYWYg....
...Y..G..g...
......G......
.....IKk.....
....IIKKk....
...IKKKKKk...
...GWWWWYg...
...YWWWWWg...
...YWWWWYg...
...GYWWYGg...
...IKKKKKk...
....IKKKk....
.....IKk.....
.....IKk.....
.....IKk.....
....BBBBb....
...BBBBBBb...
..BBbbbbbb4..
..BbbbYbbb4..
..BbbYWYbb4..
..BbbbYbbb4..
..b44444444..
...sssssssss.
`;
const FW = 15, FH = 29, FEET = 27; // frame (1 px margin for the outline); feet line in frame rows
const CRACKS = [[[7, 10], [6, 11], [7, 12]], [[5, 11], [4, 12], [5, 13], [8, 11]]];
const FRAMES = ['l3', 'l2', 'l1', 'stub'];

function grid(name: string): string[][] {
  const rows = BASE.trim().split('\n').map((r) => [...r]);
  const hp = +name.slice(1);
  if (hp < 3) for (const [x, y] of CRACKS[0]) rows[y][x] = 'K';
  if (hp < 2) {
    for (let y = 10; y <= 13; y++) rows[y] = rows[y].map((c) => (c === 'W' ? 'Y' : c)); // the glass dims
    for (const [x, y] of CRACKS[1]) rows[y][x] = 'K';
  }
  if (name === 'stub') rows.forEach((r, y) => y < 18 && r.fill('.')); // the broken plinth left behind
  return rows;
}

function bake(scene: Scene) {
  const tex = scene.textures.createCanvas('lantern', FW * FRAMES.length, FH)!;
  const img = tex.context.createImageData(tex.width, tex.height);
  const put = (x: number, y: number, c: number, a = 255) => img.data.set([c >> 16, (c >> 8) & 255, c & 255, a], (y * tex.width + x) * 4);
  FRAMES.forEach((name, n) => {
    const rows = grid(name);
    const at = (x: number, y: number) => rows[y - 1]?.[x - 1] ?? '.';
    const body = (x: number, y: number) => y > 7 && !'.s'.includes(at(x, y));
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const c = at(x, y);
      if (c !== '.' && !(c in PAL)) throw new Error(`lantern art: bad pixel '${c}'`);
      if (c !== '.') put(n * FW + x, y, PAL[c], c === 's' ? 140 : 255);
      else if (body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1)) put(n * FW + x, y, PAL[0]);
    }
    tex.add(name, 0, n * FW, 0, FW, FH);
  });
  tex.putData(img, 0, 0);
  tex.refresh();
}

const px = (g: G, x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(Math.round(x), Math.round(y), 1, 1);

/** Clears and redraws a Graphics every frame with the elapsed ms, for `ms`, then destroys it. */
function animate(scene: Scene, depth: number, ms: number, draw: (g: G, t: number) => void) {
  const g = scene.add.graphics().setDepth(depth);
  draw(g, 0);
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, onUpdate: (tw) => draw(g.clear(), tw.getValue() ?? 0), onComplete: () => g.destroy() });
}

// Half-width of each row of a pixel ellipse, -1 past its top and bottom.
const half = (rx: number, ry: number, dy: number) => (Math.abs(dy) > Math.floor(ry) ? -1 : Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)));

function fill(g: G, cx: number, cy: number, rx: number, ry: number, c: number, a: number) {
  g.fillStyle(c, a);
  for (let dy = -Math.floor(ry); dy <= ry; dy++) { const w = half(rx, ry, dy); g.fillRect(cx - w, cy + dy, 2 * w + 1, 1); }
}

/** A clean 1 px outline of the same ellipse; `keep` can break it into dashes. */
function rim(g: G, cx: number, cy: number, rx: number, ry: number, c: number, a: number, keep = (_dx: number, _dy: number) => true) {
  for (let dy = -Math.floor(ry); dy <= ry; dy++) {
    const w = half(rx, ry, dy), next = half(rx, ry, dy + Math.sign(dy || 1));
    for (let x = Math.min(next + 1, w); x <= w; x++) for (const dx of [-x, x]) if (keep(dx, dy)) px(g, cx + dx, cy + dy, c, a);
  }
}

const lamp = (scene: Scene): Lamp => [scene.add.graphics().setDepth(FLOOR).setBlendMode(Phaser.BlendModes.MULTIPLY),
  scene.add.graphics().setDepth(FLOOR + 0.1).setBlendMode(Phaser.BlendModes.ADD)];
const AMBER = 0xff9830; // what the multiply layer lets through: red, some green, little blue

/** The pool: hard-stepped bands, brightest under the lantern, with a crisp edge that is exactly where it burns. Only the
 *  inner bands flicker (`flick`, in px); the edge never moves. `s` scales it (lighting up, going out). */
function pool([m, a]: Lamp, x: number, y: number, s: number, bands: number, flick: number, boost = 1) {
  const rx = T.lantern.radius * s, ry = rx * T.lantern.squash;
  if (rx < 1) return;
  if (bands > 0) { fill(m, x, y, rx, ry, AMBER, 0.75); fill(a, x, y, rx, ry, PAL.G, 0.32 * boost); }
  if (bands > 1) fill(a, x, y, rx * 0.64 + flick, ry * 0.64 + flick, PAL.Y, 0.2 * boost);
  if (bands > 2) fill(a, x, y, rx * 0.34 + flick, ry * 0.34 + flick, PAL.W, 0.28 * boost);
  rim(m, x, y, rx, ry, AMBER, 1);
  rim(a, x, y, rx, ry, PAL.Y, 0.65);
}

/** The sun of the Order, as on the finial, painted on the floor in light. */
function sign([m, a]: Lamp, x: number, y: number, k: number) {
  BASE.trim().split('\n').slice(0, 6).forEach((row, j) => [...row].forEach((c, i) => {
    if (c !== '.') { px(m, x + i - 6, y + j - 3, AMBER); px(a, x + i - 6, y + j - 3, PAL[c], k); }
  }));
}

/** Telegraphs the lantern for `ms`, then plants it: solid, lit, and added to `obstacles`. */
export function create(scene: Scene, obstacles: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, ms: number): Lantern {
  if (!scene.textures.exists('lantern')) bake(scene);
  const born = scene.time.now, R = T.lantern.radius, sq = T.lantern.squash;
  let flick = 0;
  const l: Lantern = { x, y, hp: T.lantern.hp, lit: false, light: lamp(scene), stutterUntil: 0, timer: undefined! };
  const step = () => {
    const t = scene.time.now - born, g = l.light;
    g.forEach((o) => o.clear());
    if (t < ms) {
      // The edge of the coming light, dashed, turning and blinking faster as it nears, around the Order's sun.
      const k = t / ms, s = 0.55 + 0.45 * Phaser.Math.Easing.Cubic.Out(Math.min(1, k / 0.4)), turn = k * 4;
      const on = Math.floor(k * (k > 0.65 ? 18 : 8)) % 2 === 0;
      const dash = (dx: number, dy: number) => Math.floor(((Math.atan2(dy / sq, dx) + Math.PI) * R) / 4 + turn) % 2 === 0;
      rim(g[0], x, y, R * s, R * sq * s, AMBER, 1, dash);
      rim(g[1], x, y, R * s, R * sq * s, on ? PAL.Y : PAL.G, 0.9, dash);
      sign(g, x, y, on ? 0.9 : 0.5);
      return;
    }
    if (!l.lit) {
      l.lit = true;
      l.img = scene.add.image(x - 7, y + 3 - FEET, 'lantern', 'l3').setOrigin(0).setDepth(y + 3 - 11) // sorts like room props
        .setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.time.delayedCall(80, () => l.img?.clearTint());
      l.zone = scene.add.zone(x, y, 10, 6);
      obstacles.add(l.zone);
    }
    // Lights up band by band, then breathes: an inner band shifts by a pixel now and then, more once the glass cracks.
    if (Math.random() < (l.hp < 2 ? 0.5 : 0.25)) flick = Phaser.Math.Between(-1, 1);
    const up = t - ms, bands = scene.time.now < l.stutterUntil ? 1 : Math.min(3, 1 + Math.floor(up / 80));
    pool(g, x, y, 1, bands, up < 240 ? 0 : flick, l.hp < 2 && Math.random() < 0.15 ? 0.6 : 1);
  };
  l.timer = scene.time.addEvent({ delay: 40, loop: true, callback: step });
  step();
  return l;
}

/** True when `p` (the hero's feet) stands in the lantern's light. */
export const lights = (l: Lantern, p: P) => l.lit && ellipseDist(l, p, T.lantern.radius, T.lantern.radius * T.lantern.squash) <= 1;

type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; c: number };

/** Glass and iron bits flung from the lantern's glass, away from the blow: they fly, land and glint out. */
function shards(scene: Scene, l: Lantern, angle: number, n: number, power: number) {
  const bits: Bit[] = Array.from({ length: n }, (_, i) => {
    const a = angle + Phaser.Math.FloatBetween(-1.2, 1.2), v = Phaser.Math.FloatBetween(20, 90) * power;
    return { x: l.x, y: l.y + 3, z: 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: Phaser.Math.FloatBetween(10, 70) * power,
      c: i % 5 === 4 ? PAL.K : i % 3 ? PAL.W : PAL.Y };
  });
  animate(scene, ABOVE, 700, (g, t) => {
    const s = t / 1000;
    for (const b of bits) {
      const land = (b.vz + Math.sqrt(b.vz ** 2 + 2 * 300 * b.z)) / 300, u = Math.min(s, land);
      const z = Math.max(0, b.z + b.vz * u - 150 * u * u);
      if (s > land + 0.25 && (s * 20 + b.x) % 2 < 1) continue; // glinting out on the floor
      px(g, b.x + b.vx * u, b.y + b.vy * u - z, b.c);
    }
  });
}

/** A blow that did not break it: a white flash, a shudder of the light, cracks and a spray of glass. */
export function hit(scene: Scene, l: Lantern, angle: number) {
  l.img?.setFrame(`l${Math.max(1, Math.ceil(l.hp))}`).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  scene.time.delayedCall(60, () => l.img?.clearTint());
  l.stutterUntil = scene.time.now + 100;
  scene.cameras.main.shake(60, new Phaser.Math.Vector2(1.5 / T.width, 1.5 / T.height));
  shards(scene, l, angle, 6, 0.6);
}

/** It shatters: the light flares once and dies, glass flies, the broken plinth stays. */
export function shatter(scene: Scene, l: Lantern, angle: number) {
  l.timer.remove();
  l.light.forEach((g) => g.destroy());
  l.img?.destroy();
  l.zone?.destroy();
  scene.add.image(l.x - 7, l.y + 3 - FEET, 'lantern', 'stub').setOrigin(0).setDepth(l.y + 3 - 11);
  scene.cameras.main.shake(120, new Phaser.Math.Vector2(3 / T.width, 3 / T.height));
  shards(scene, l, angle, 26, 1);
  const out = lamp(scene);
  scene.tweens.addCounter({ from: 0, to: 260, duration: 260, onComplete: () => out.forEach((g) => g.destroy()), onUpdate: (tw) => {
    const t = tw.getValue() ?? 0, k = Math.floor((t / 260) * 5) / 5; // a flare, then a stepped collapse
    out.forEach((g) => g.clear());
    pool(out, l.x, l.y, 1 - k, t < 50 ? 3 : 1, 0, t < 50 ? 2 : 1);
  } });
}

/** The hero in holy light smokes: dark wisps and white embers rise off him; `burst` when a burn lands. */
export function sizzle(scene: Scene, hero: Phaser.GameObjects.Sprite, burst = false) {
  const life = burst ? 900 : 700, x = hero.x, y = hero.y;
  // Dark smoke and white embers: both read on the lit gold floor, the embers also on the dark hero.
  const bits = Array.from({ length: burst ? 24 : 2 }, () => {
    const ember = Math.random() < 0.5;
    return { x: Phaser.Math.Between(-5, 5), y: Phaser.Math.Between(-10, 4), rise: Phaser.Math.Between(12, burst ? 28 : 22), drift: Phaser.Math.FloatBetween(-3, 3),
      end: Phaser.Math.Between(400, life), ember, c: Phaser.Utils.Array.GetRandom(ember ? [PAL.W, PAL.W, PAL.Y] : [PAL.k, PAL.K, PAL.I]) };
  });
  animate(scene, hero.depth + 1, life, (g, t) => {
    for (const b of bits) {
      if (t >= b.end) continue;
      const k = Phaser.Math.Easing.Sine.Out(t / b.end), bx = Math.round(x + b.x + b.drift * k), by = Math.round(y + b.y - b.rise * k);
      g.fillStyle(b.c).fillRect(bx, by, 1, b.ember ? 2 : 1); // embers streak up
    }
  });
}
