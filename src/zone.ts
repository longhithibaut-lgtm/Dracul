import Phaser from 'phaser';
import type { Room } from './room.ts';
import { lightMap, type Look, type Quads } from './dark.ts';
import { T } from './tuning.ts';
import { runMask } from './logic.ts';
import * as Lantern from './lantern.ts';
import { WORLD, around, quadOf } from './world.ts';
import * as D from './necropolis.data.ts';

// La nécropole (docs/extraction.md §4), the open zone round the refuge: one cavern of 8 x 5 screens baked offline by
// tools/art/zone.gen.mjs in chunks of one screen (src/necropolis/c<i>-<j>-*.webp), loaded round the camera as it goes
// and dropped behind it, so the GPU never holds the whole zone; its collisions, doors, gates, spawns are data
// (necropolis.data.ts). Lit by dark.ts like the crypts, chunk by chunk (quads()).
const URLS = import.meta.glob('./necropolis/*.webp', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
const { SW, SH, COLS } = D, CW = 2 * SW, CH = 2 * SH;
type P = { x: number; y: number };

/** The crypts' look (room.ts CRYPT): their moonlit dark, the braziers guttering; the light is the chunks'. Its baked
 *  light warms what is drawn already lit only a little (`warm`: the Dawn is in it, the men would go flat beige by it). */
export const LOOK: Look = { light: 'necropolis', texel: 2, torches: D.TORCHES, flicker: true, amb: '#000000', night: 0.2,
  lamp: [5, 40, 180], ys: 1 / 0.616, post: [3.3, 0.42, 0.18, 0.02], vig: [1.15, 0.4, 0.02, 0.004], pal: D.PALETTE, wY: 1.6, warm: 0.3 };

const at = (i: number, j: number) => j * COLS + i;
const key = (i: number, j: number) => `nec-${i}-${j}`;
/** A chunk's images: its albedo, light (two bands), the light's geometry band, its sprites. */
const files = (i: number, j: number) => (['a', 'l', 'g', 'o'] as const).map((k) => [`${key(i, j)}-${k}`, URLS[`./necropolis/c${i}-${j}-${k}.webp`]] as const);
/** What the zone needs loaded before it shows: the chunks round where the hero comes in (`p`), the gates. */
export function preload(scene: Phaser.Scene, p: P) {
  for (const [i, j] of around(p.x - SW / 2, p.y - SH / 2, SW, SH, SW / 3)) for (const [k, u] of files(i, j)) if (!scene.textures.exists(k)) scene.load.image(k, u);
  if (!scene.textures.exists('nec-gates')) scene.load.image('nec-gates', URLS['./necropolis/gates.webp']);
}

/** The chunks shown: loaded as the camera comes near (`near` px round the view), dropped once `far` behind it. */
export class Chunks {
  shown = new Map<number, Phaser.GameObjects.Image[]>();
  private lights = new Map<number, (x: number, y: number) => number>(); // each shown chunk's baked light, read back (dark.ts lightMap())
  private asked = new Set<number>();
  private scene: Phaser.Scene;
  private near: number;
  private far: number;
  constructor(scene: Phaser.Scene, near = 160, far = 420) {
    this.scene = scene;
    this.near = near;
    this.far = far;
    if (!scene.textures.exists('nec-black')) scene.textures.createCanvas('nec-black', 1, 1)!.refresh(); // no light yet
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { for (const n of [...this.shown.keys()]) this.drop(n); });
  }

  /** Each frame: asks for the chunks near the view `v`, shows those loaded, drops those far behind. */
  stream(v: Phaser.Geom.Rectangle) {
    const s = this.scene, keep = new Set(around(v.x, v.y, v.width, v.height, this.far).map(([i, j]) => at(i, j)));
    let asked = false;
    for (const [i, j] of around(v.x, v.y, v.width, v.height, this.near)) {
      const n = at(i, j), fs = files(i, j);
      if (this.shown.has(n)) continue;
      if (fs.every(([k]) => s.textures.exists(k))) this.show(i, j);
      else if (!this.asked.has(n)) {
        this.asked.add(n);
        for (const [k, u] of fs) if (!s.textures.exists(k)) s.load.image(k, u);
        asked = true;
      }
    }
    if (asked && !s.load.isLoading()) s.load.start();
    for (const n of [...this.shown.keys()]) if (!keep.has(n)) this.drop(n);
  }

  /** The light of the 2 x 2 chunks under the view (dark.ts), black where one is not shown yet. */
  quads: Quads = (v) => {
    const { i, j } = quadOf(v.x, v.y);
    return { quad: [i * SW, j * SH, SW, SH], keys: [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => (this.shown.has(at(a, b)) ? `${key(a, b)}-L` : 'nec-black')) };
  };

  /** The baked light at floor point (x, y), 0 where its chunk is not shown. */
  light(x: number, y: number) {
    const i = Math.floor(x / SW), j = Math.floor(y / SH);
    return this.lights.get(at(i, j))?.(x - i * SW, y - j * SH) ?? 0;
  }

  private show(i: number, j: number) {
    const s = this.scene, k = key(i, j), n = at(i, j);
    // its light: the two images in one texture, the three bands dark.ts reads
    const c = s.textures.createCanvas(`${k}-L`, CW, 3 * CH)!;
    c.context.drawImage(s.textures.get(`${k}-l`).getSourceImage() as CanvasImageSource, 0, 0);
    c.context.drawImage(s.textures.get(`${k}-g`).getSourceImage() as CanvasImageSource, 0, 2 * CH);
    c.refresh();
    this.lights.set(n, lightMap(c.canvas, SW, SH, 2));
    s.textures.remove(`${k}-l`);
    s.textures.remove(`${k}-g`);
    const imgs = [s.add.image(i * SW, j * SH, `${k}-a`).setOrigin(0).setScale(0.5).setDepth(-1000)], tex = s.textures.get(`${k}-o`);
    D.OVER[n].forEach(([ax, ay, w, h, x, y, depth], f) => {
      tex.add(String(f), 0, ax, ay, w, h);
      imgs.push(s.add.image(x / 2, y / 2, `${k}-o`, String(f)).setOrigin(0).setScale(0.5).setDepth(depth));
    });
    this.shown.set(n, imgs);
    this.asked.delete(n);
  }

  private drop(n: number) {
    const k = key(n % COLS, Math.floor(n / COLS));
    for (const im of this.shown.get(n)!) im.destroy();
    this.shown.delete(n);
    this.lights.delete(n);
    for (const t of ['a', 'o', 'L']) this.scene.textures.remove(`${k}-${t}`);
  }
}

/** A shortcut (docs/extraction.md: la grille, la porte scellée): shut over its opening until raised from its side,
 *  then open for good (save.ts). */
export type Gate = (typeof D.GATES)[number] & { open: boolean; img: Phaser.GameObjects.Image; body?: Phaser.GameObjects.Zone };
function gates(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.StaticGroup, opened: readonly string[]): Gate[] {
  const tex = scene.textures.get('nec-gates');
  return D.GATES.map((g, k) => {
    g.frames.forEach(([ax, ay], n) => tex.has(`g${k}-${n}`) || tex.add(`g${k}-${n}`, 0, ax, ay, g.w, g.h));
    const open = opened.includes(g.id), [x, y, w, h] = g.box;
    const img = scene.add.image(g.at[0] / 2, g.at[1] / 2, 'nec-gates', `g${k}-0`).setOrigin(0).setScale(0.5).setDepth(g.depth).setVisible(!open); // open: the bake shows it
    const body = open ? undefined : scene.add.zone(x + w / 2, y + h / 2, w, h);
    if (body) obstacles.add(body);
    return { ...g, open, img, body };
  });
}
/** Winches gate `g` up over `ms` (its frames), and lets walkers through. */
export function raise(scene: Phaser.Scene, g: Gate, obstacles: Phaser.Physics.Arcade.StaticGroup, ms: number) {
  const k = D.GATES.findIndex((o) => o.box === g.box), n = g.frames.length - 1;
  g.open = true;
  scene.tweens.addCounter({ from: 0, to: n, duration: ms, ease: 'Sine.easeInOut', onUpdate: (tw) => g.img.setFrame(`g${k}-${Math.round(tw.getValue() ?? 0)}`),
    onComplete: () => g.img.setVisible(false) }); // raised, the bake shows the way open (and he may walk under it)
  if (g.body) obstacles.remove(g.body, true, true);
  g.body = undefined;
}

/** The zone's doors, the forward exits: in the order of WORLD.necropolis.ahead. */
export const DOORS = WORLD.necropolis.ahead.map((p) => D.DOORS[p as keyof typeof D.DOORS]);

/** Builds la nécropole: its collisions, its gates (`opened`: raised for good), the chunks round the camera. */
export function build(scene: Phaser.Scene, opened: readonly string[]): Room {
  const obstacles = scene.physics.add.staticGroup(), pits = scene.physics.add.staticGroup();
  for (const [x, y, w, h] of D.BOXES) obstacles.add(scene.add.zone(x + w / 2, y + h / 2, w, h));
  for (const [x, y, w, h] of D.PITS) pits.add(scene.add.zone(x + w / 2, y + h / 2, w, h));
  const lit = runMask(D.HOLY, D.W, D.H), r = D.DOORS.refuge, spawns = D.SPAWNS.map(([x, y]) => ({ x, y })), chunks = new Chunks(scene);
  const lamps = D.LANTERNS.map(([x, y]) => ({ x, y }));
  for (const l of lamps) Lantern.still(scene, l.x, l.y); // their pools burn like a planted lantern's (RoomScene)
  return {
    bounds: new Phaser.Geom.Rectangle(0, 0, D.W, D.H),
    obstacles,
    pits,
    heroStart: { x: r.x, y: r.y + 20 },
    spawns,
    spots: spawns,
    medallion: { x: r.x, y: r.y + 20 },
    exits: DOORS.map((d) => ({ x: d.x, y: d.y })),
    stairs: { x: r.x, y: r.y },
    holy: (x, y) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < D.W && y < D.H && lit[y * D.W + x] === 1; },
    burn: T.dawn,
    light: (x, y) => chunks.light(x, y),
    width: D.W,
    height: D.H,
    sections: [],
    look: LOOK,
    zone: { chunks, gates: gates(scene, obstacles, opened), lamps },
  };
}
