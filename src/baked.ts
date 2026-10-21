import Phaser from 'phaser';
import type { Room } from './room.ts';
import type { Look } from './dark.ts';
import { runMask } from './logic.ts';

// The rooms baked offline in the « grand pixel » style (tools/art/bake.mjs): src/<key>-albedo.png, what the world camera
// draws, two texels per room px; src/<key>-light.png, read by dark.ts; src/<key>-over.png, what stands in front of the
// floor cut into sprites sorted at their floor row (in a run room also the front wall over the stairs, always on top,
// and the portcullis' frames). The refuge (refuge.ts) and the run rooms of tools/art/rooms.gen.mjs (src/<key>.data.ts).
const URLS = import.meta.glob('./*-{albedo,light,over}.png', { eager: true, import: 'default' }) as Record<string, string>;

export function preload(scene: Phaser.Scene, key: string) {
  for (const k of ['albedo', 'light', 'over']) if (!scene.textures.exists(`${key}-${k}`)) scene.load.image(`${key}-${k}`, URLS[`./${key}-${k}.png`]);
}

type Box = [number, number, number, number];
/** Draws the room `key`: its albedo and its sprites (`over`: atlas x, y, w, h, where, depth, in texels); returns the
 *  bodies of its solid boxes (room px). */
export function draw(scene: Phaser.Scene, key: string, over: [...Box, number, number, number][], boxes: Box[]) {
  scene.add.image(0, 0, `${key}-albedo`).setOrigin(0).setScale(0.5).setDepth(-1000);
  const tex = scene.textures.get(`${key}-over`);
  over.forEach(([ax, ay, w, h, x, y, depth], n) => {
    if (!tex.has(String(n))) tex.add(String(n), 0, ax, ay, w, h);
    scene.add.image(x / 2, y / 2, `${key}-over`, String(n)).setOrigin(0).setScale(0.5).setDepth(depth);
  });
  const obstacles = scene.physics.add.staticGroup();
  for (const [x, y, w, h] of boxes) obstacles.add(scene.add.zone(x + w / 2, y + h / 2, w, h));
  return obstacles;
}

type P = { x: number; y: number };
/** A run room's bake (src/<key>.data.ts, see its header). */
export type Plan = {
  W: number; H: number; FY1: number; BOUNDS: Box; START: P; GIFT: P; GATE: P; STAIRS: P; SPAWNS: P[]; SPOTS: P[]; SECTIONS: number[];
  BOXES: Box[]; PITS: { x: number; y: number; w: number; h: number }[]; OVER: [...Box, number, number, number][];
  GATES: { at: number[]; w: number; h: number; frames: [number, number][] }; TORCHES: [number, number, number][]; HOLY: string; PALETTE: string[];
};

/** Builds the run room `key` from its plan, lit by dark.ts as `look` says; its holy light (HOLY) burns as `burn` says. */
export function room(scene: Phaser.Scene, key: string, D: Plan, look: Look, burn: Room['burn']): Room {
  const obstacles = draw(scene, key, D.OVER, D.BOXES);
  // The portcullis: its frames from closed to raised (raise()), over the closed one the albedo shows.
  const tex = scene.textures.get(`${key}-over`);
  D.GATES.frames.forEach(([ax, ay], n) => tex.has(`g${n}`) || tex.add(`g${n}`, 0, ax, ay, D.GATES.w, D.GATES.h));
  scene.add.image(D.GATES.at[0] / 2, D.GATES.at[1] / 2, `${key}-over`, 'g0').setOrigin(0).setScale(0.5).setDepth(-999).setName('room-gate-frames');
  const pits = scene.physics.add.staticGroup();
  for (const b of D.PITS) pits.add(scene.add.zone(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h));
  const holy = sky(D);
  return {
    bounds: new Phaser.Geom.Rectangle(...D.BOUNDS),
    obstacles,
    pits,
    heroStart: D.START,
    spawns: D.SPAWNS,
    spots: D.SPOTS,
    medallion: D.GIFT,
    gate: D.GATE,
    stairs: D.STAIRS,
    holy,
    burn,
    width: D.W,
    height: D.H,
    sections: D.SECTIONS,
    look: { ...look, light: `${key}-light`, torches: D.TORCHES, pal: D.PALETTE, albedo: `${key}-albedo` },
  };
}

/** Winches the baked portcullis up over `ms` (false: the room has none). */
export function raise(scene: Phaser.Scene, ms: number) {
  const g = scene.children.getByName('room-gate-frames') as Phaser.GameObjects.Image | null;
  if (!g) return false;
  const n = g.texture.getFrameNames().filter((f) => f[0] === 'g').length;
  scene.tweens.addCounter({ from: 0, to: n - 1, duration: ms, ease: 'Sine.easeInOut', onUpdate: (tw) => g.setFrame(`g${Math.round(tw.getValue() ?? 0)}`) });
  return true;
}

/** The floor the Dawn burns (its HOLY runs, worked out once per plan): true on such a floor point. */
const SKIES = new Map<Plan, Uint8Array>();
function sky(D: Plan) {
  if (!D.HOLY) return () => false;
  if (!SKIES.has(D)) SKIES.set(D, runMask(D.HOLY, D.W, D.H));
  const lit = SKIES.get(D)!;
  return (x: number, y: number) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < D.W && y < D.H && lit[y * D.W + x] === 1; };
}
