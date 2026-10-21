import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Torture from './torture.ts';
import * as Refuge from './refuge.ts';
import * as Baked from './baked.ts';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import { TORTURE, type Look } from './dark.ts';

type P = { x: number; y: number };
// Where the arena's solid parts are, and how it is lit.
export type Room = {
  bounds: Phaser.Geom.Rectangle; // walkable area
  obstacles: Phaser.Physics.Arcade.StaticGroup; // props: they stop walkers, bolts and shards
  pits: Phaser.Physics.Arcade.StaticGroup; // holes in the floor: they stop walkers only, everything flies over them
  heroStart: P;
  spawns: P[]; // fixed, so screenshots are comparable run to run
  spots: P[]; // where the Order may plant its lanterns
  medallion: P; // centre of the ritual medallion, on the floor: the gift rises there
  gate: P; // middle of the exit, on the back edge of the floor
  stairs: P; // where the hero climbs in from, below the front edge
  holy(x: number, y: number): boolean; // a floor point in holy light that never goes out (stained glass, the open sky)
  burn: { graceMs: number; burnEveryMs: number; damage: number }; // how that light burns: like a lantern, or the Dawn's
  width: number; height: number; // of the whole room (the camera follows the hero)
  look: Look; // in the dark (dark.ts): how it is lit
  sections: number[]; // feet lines the hero climbs past into the room's next part, bottom first (none: one part)
};

// The run's rooms, in the « grand pixel » style (docs/art.md), baked offline by tools/art/rooms.gen.mjs from their 3D
// scenes (tools/art/rooms/<key>.mjs) into src/<key>-*.png and src/<key>.data.ts, lit by dark.ts as their Look says (the
// hero's lantern, the flames, the Order's lights): la crypte (room 1), la nef, l'ossuaire effondré, la chapelle aux
// vitraux, le cloître sous l'Aube.
export const LAYOUTS = ['hall', 'nave', 'ossuary', 'chapel', 'cloister'] as const;
// The torture room (torture.ts, painted at its first build) is a training room, reached from the training room only. The
// refuge (refuge.ts) is where the game starts and where the hero re-forms after a death.
export type LayoutId = (typeof LAYOUTS)[number] | 'torture' | 'refuge';

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
/** What a room's build needs loaded: a baked room's images. */
export function preload(scene: Phaser.Scene, id: LayoutId) {
  if (id !== 'torture') Baked.preload(scene, id === 'refuge' ? 'refuge' : BAKED[id].key);
}

/** Winches the portcullis up over `ms`, letting the moonlight in. */
export function raiseGate(scene: Phaser.Scene, ms: number) {
  if (Baked.raise(scene, ms)) return;
  let last = 0;
  scene.tweens.addCounter({ from: 0, to: 1, duration: ms, ease: 'Sine.easeInOut', onUpdate: (tw) => {
    const d = 3 * Math.round(((tw.getValue() ?? 0) * GATE_RISE) / 3); // in jerks of a few pixels
    if (d !== last) drawGate(scene, (last = d));
  } });
}

export function build(scene: Phaser.Scene, id: LayoutId): Room {
  if (id === 'refuge') return Refuge.build(scene);
  if (id === 'torture') return torture(scene);
  const b = BAKED[id];
  return Baked.room(scene, b.key, b.D, b.look, b.dawn ? T.dawn : T.lantern);
}

// ---------- the torture room ----------

// « La salle de torture (essai) »: the « Crasse et faim » trial (torture.ts paints it, dark.ts lights it), on the crypt's
// shell: its six pillars and four floor cages solid, its two body pits gone round. Painted on its first build (about a
// second), kept across restarts; its portcullis is where the room painted shut differs from it painted open, and slides up
// into the masonry, clipped to the arch.
const CX = 240, FX0 = 40, FX1 = 440, FY0 = Torture.WB, FY1 = Torture.H - 14;
const GATE = { hw: 22, ys: 44, R: 28 }, GX = CX - GATE.hw, GY = 4, GW = GATE.hw * 2 + 1, GH = 59, GATE_RISE = 48;
/** Inside the gate's pointed arch (`grow` px wider all round), at room px (x, y). */
const inGate = (x: number, y: number, grow = 0) => {
  const dx = Math.abs(x + 0.5 - CX), hw = GATE.hw + grow, R = GATE.R + grow;
  return y >= GATE.ys ? dx < hw : (dx - hw + R) ** 2 + (GATE.ys - y) ** 2 < R * R;
};
let painted: ReturnType<typeof Torture.paintRoom> | undefined;
let bars: Uint8ClampedArray<ArrayBuffer>;
const texture = (scene: Phaser.Scene, key: string, w: number, h: number, d: Uint8ClampedArray<ArrayBuffer>) => {
  if (!scene.textures.exists(key)) {
    const t = scene.textures.createCanvas(key, w, h)!;
    t.context.putImageData(new ImageData(d, w, h), 0, 0);
    t.refresh();
  }
  return key;
};

function torture(scene: Phaser.Scene): Room {
  if (!painted) {
    painted = Torture.paintRoom(inGate);
    bars = new Uint8ClampedArray(GW * GH * 4);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = ((GY + y) * Torture.W + GX + x) * 4;
      if ([0, 1, 2].some((k) => painted!.open[i + k] !== painted!.shut[i + k])) bars.set(painted.shut.subarray(i, i + 4), (y * GW + x) * 4);
    }
  }
  const { W, H } = Torture;
  texture(scene, 'torture-light', W, 3 * H, painted.light); // read by dark.ts
  scene.add.image(0, 0, texture(scene, 'torture-bg', W, H, painted.open)).setOrigin(0).setDepth(-1000);
  scene.add.image(0, 0, 'torture-bg').setOrigin(0).setDepth(7970).setCrop(0, FY1, W, 14); // its front wall, under the light layer
  // What stands, each sorted at its feet line like a prop.
  painted.sprites.forEach((t, n) => scene.add.image(t.x, t.y, texture(scene, `torture-prop-${n}`, t.w, t.h, t.d)).setOrigin(0).setDepth(t.feet - 11));
  drawGate(scene, 0); // the previous visit left it open
  scene.add.image(GX, GY, 'torture-gate').setOrigin(0).setDepth(-999);
  const obstacles = scene.physics.add.staticGroup(), pits = scene.physics.add.staticGroup();
  for (const [x, y] of [...Torture.PILLARS, ...Torture.CAGES]) obstacles.add(scene.add.zone(x, y - 6, 24, 12));
  for (const b of Torture.PITS) pits.add(scene.add.zone(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h));
  return {
    bounds: new Phaser.Geom.Rectangle(FX0, FY0, FX1 - FX0, FY1 - FY0),
    obstacles,
    pits,
    heroStart: { x: CX, y: 566 },
    spawns: [{ x: CX, y: 470 }, { x: 120, y: 560 }, { x: 360, y: 560 }, { x: CX, y: 280 }, { x: 80, y: 380 }, { x: 400, y: 400 }, { x: CX, y: 96 }, { x: 120, y: 200 }, { x: 400, y: 200 }],
    spots: [{ x: 176, y: 120 }, { x: 304, y: 120 }, { x: 176, y: 210 }, { x: 304, y: 210 }, { x: 150, y: 300 }, { x: 300, y: 290 }, { x: 120, y: 410 }, { x: 260, y: 440 },
      { x: 170, y: 520 }, { x: 310, y: 520 }, { x: 100, y: 600 }, { x: 330, y: 600 }],
    medallion: { x: CX, y: 160 },
    gate: { x: CX, y: FY0 },
    stairs: { x: CX, y: FY1 + 10 }, // feet off screen, the head showing above the steps
    holy: () => false,
    burn: T.lantern,
    width: W,
    height: H,
    sections: [432, 248],
    look: TORTURE,
  };
}

/** The torture room's portcullis raised by `d` px: its bars slide up into the masonry, clipped to the opening. */
function drawGate(scene: Phaser.Scene, d: number) {
  const t = (scene.textures.exists('torture-gate') ? scene.textures.get('torture-gate') : scene.textures.createCanvas('torture-gate', GW, GH)!) as Phaser.Textures.CanvasTexture;
  const img = new ImageData(GW, GH);
  for (let y = 0; y + d < GH; y++)
    for (let x = 0; x < GW; x++) if (inGate(GX + x, GY + y)) img.data.set(bars.subarray(((y + d) * GW + x) * 4, ((y + d) * GW + x) * 4 + 4), (y * GW + x) * 4);
  t.context.putImageData(img, 0, 0);
  t.refresh();
}
