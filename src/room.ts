import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Refuge from './refuge.ts';
import * as Baked from './baked.ts';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import type { Look } from './dark.ts';
import * as Zone from './zone.ts';
import * as Save from './save.ts';
import type { ZoneId } from './world.ts';

type P = { x: number; y: number };
// Where the arena's solid parts are, and how it is lit.
export type Room = {
  bounds: Phaser.Geom.Rectangle; // walkable area
  obstacles: Phaser.Physics.Arcade.StaticGroup; // props: they stop walkers, bolts and shards
  pits: Phaser.Physics.Arcade.StaticGroup; // holes in the floor: they stop walkers only, everything flies over them
  heroStart: P;
  spawns: P[]; // fixed, so screenshots are comparable run to run
  spots: P[]; // where the Order may plant its lanterns
  medallion: P; // centre of the ritual medallion, on the floor: where a room's guard stands
  exits: P[]; // middle of each exit, on the back edge of the floor
  stairs: P; // where the hero climbs in from, below the front edge
  holy(x: number, y: number): boolean; // a floor point in holy light that never goes out (stained glass, the open sky)
  burn: { graceMs: number; burnEveryMs: number; damage: number }; // how that light burns: like a lantern, or the Dawn's
  light?(x: number, y: number): number; // its baked light at a floor point (dark.ts lightMap()): in the light, he is seen from farther
  width: number; height: number; // of the whole room (the camera follows the hero)
  look: Look; // in the dark (dark.ts): how it is lit
  sections: number[]; // feet lines the hero climbs past into the room's next part, bottom first (none: one part)
  zone?: { id: ZoneId; chunks: Zone.Chunks; gates: Zone.Gate[]; lamps: P[]; opens: Zone.Opening[] }; // an open zone (zone.ts): which, its chunks round the camera, its shortcuts, its lanterns' pools, what opens once
};

// The run's rooms, in the « grand pixel » style (docs/art.md), baked offline by tools/art/rooms.gen.mjs from their 3D
// scenes (tools/art/rooms/<key>.mjs) into src/<key>-*.png and src/<key>.data.ts, lit by dark.ts as their Look says (the
// hero's lantern, the flames, the Order's lights): la crypte (room 1), la nef, l'ossuaire effondré, la chapelle aux
// vitraux, le cloître sous l'Aube.
export const LAYOUTS = ['hall', 'nave', 'ossuary', 'chapel', 'cloister'] as const;
// The refuge (refuge.ts) is where the game starts and where the hero re-forms after a death.
export type LayoutId = (typeof LAYOUTS)[number] | 'refuge' | 'necropolis' | 'catacombs';

// The crypts' look (their mockups' post): their moonlit dark, the braziers and torches guttering (its light, torches and
// palette: the room's own, baked.ts).
const CRYPT: Look = { light: '', texel: 2, torches: [], flicker: true, amb: '#000000', night: 0.2,
  lamp: [5, 40, 180], ys: 1 / 0.616, post: [3.3, 0.42, 0.18, 0.02], vig: [1.15, 0.4, 0.02, 0.004], pal: [], wY: 1.6 };
const BAKED: Record<(typeof LAYOUTS)[number], { key: string; D: Baked.Plan; look: Look; dawn?: true }> = {
  hall: { key: 'crypt', D: Crypt, look: CRYPT },
  nave: { key: 'nave', D: Nave, look: CRYPT },
  ossuary: { key: 'ossuary', D: Ossuary, look: CRYPT },
  chapel: { key: 'chapel', D: Chapel, look: CRYPT }, // its stained glass's holy light burns like a lantern's
  // Under the Dawn, brighter than the crypts (its mockup's post): the light is the sun's, the lantern a glow.
  cloister: { key: 'cloister', D: Cloister, dawn: true, look: { ...CRYPT, flicker: false, night: 0,
    lamp: [1.6, 13, 70], post: [3, 0.4, 0.2, 0.01], vig: [1.12, 0.22, 0.022, 0.004], sprites: 0.4, warm: 0.25 } },
};
/** What a room's build needs loaded: a baked room's images; the zone's round where the hero comes in (`at`). */
export function preload(scene: Phaser.Scene, id: LayoutId, at: { x: number; y: number }) {
  if (id === 'necropolis' || id === 'catacombs') Zone.preload(scene, id, at);
  else if (id === 'refuge') Refuge.preload(scene);
  else Baked.preload(scene, BAKED[id].key);
}

/** Winches the portcullises up over `ms`, letting the moonlight in. */
export const raiseGate = Baked.raise;

export function build(scene: Phaser.Scene, id: LayoutId): Room {
  if (id === 'refuge') return Refuge.build(scene);
  if (id === 'necropolis' || id === 'catacombs') return Zone.build(scene, id, Save.data.shortcuts, Save.data.vesna ? ['reliquary'] : []);
  const b = BAKED[id];
  return Baked.room(scene, b.key, b.D, b.look, b.dawn ? T.dawn : T.lantern);
}
