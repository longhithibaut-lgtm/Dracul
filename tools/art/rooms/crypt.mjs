// La crypte (layout 'hall'), room 1 of every run, in the « grand pixel » style: the validated hall's plan (the props'
// footprints, the medallions, the braziers, the tombs, the three parts) rebuilt as a 3D scene with the refuge's
// vocabulary (crypts.mjs): grimy flagstones, ashlar, an ossuary in the back wall, mouldy coffins on stone biers, broken
// pillars, braziers, candles, bones, old blood. Moonlight falls through two oculi in the vault onto the medallions (the
// shafts in the air are baked in), through the lancets and up the stairs beyond the portcullis.
import { pitBones } from '../maquettes/hub/props.mjs';
import { skull } from '../maquettes/grand/cast.mjs';
import { wx, wy, wz } from './common.mjs';
import { CX, CY, plan, oculi, floor, ground, shell, furnish, candles, lights, scene as stage, shafts } from './crypts.mjs';
export { PAL, POST } from './crypts.mjs';

const MEDS = [[CY, 1], [540, 0.62]]; // medallions down the middle: row, size
// The hall's props, footprint centre x, feet line y, footprint w x h.
const PROPS = [
  { kind: 'pillar', x: 92, y: 140, w: 24, h: 12 }, { kind: 'stump', x: 388, y: 140, w: 24, h: 12, tall: 58 },
  { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 }, { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
  { kind: 'coffin', x: 96, y: 234, w: 46, h: 14 }, { kind: 'coffinOpen', x: 392, y: 234, w: 62, h: 14 },
  { kind: 'coffinOpen', x: 104, y: 384, w: 62, h: 14 }, { kind: 'coffin', x: 380, y: 384, w: 46, h: 14 },
  { kind: 'stump', x: 172, y: 342, w: 24, h: 12, tall: 50 }, { kind: 'stump', x: 308, y: 342, w: 24, h: 12, tall: 40, flip: true },
  { kind: 'pillar', x: 92, y: 490, w: 24, h: 12 }, { kind: 'stump', x: 388, y: 490, w: 24, h: 12, tall: 46, flip: true },
  { kind: 'brazier', x: 182, y: 474, w: 12, h: 8 }, { kind: 'brazier', x: 298, y: 474, w: 12, h: 8 },
];
const CANDLES = [[54, 236, 3], [128, 240, 2], [62, 82, 3], [414, 80, 2], [334, 246, 3], [146, 300, 2], [58, 432, 3], [410, 436, 2], [56, 604, 3], [404, 608, 2], [150, 610, 2],
  [20, 168, 2], [452, 196, 3], [18, 470, 3], [450, 560, 2]]; // the last: by the side walls

/** What the game needs (src/crypt.data.ts): the hall's gameplay. */
export const PLAN = plan({
  props: PROPS, start: { x: CX, y: 532 },
  spawns: [{ x: CX, y: 460 }, { x: 128, y: 560 }, { x: 352, y: 560 }, { x: CX, y: 296 }, { x: 56, y: 340 }, { x: 424, y: 340 }, { x: CX, y: 88 }, { x: 120, y: CY }, { x: 360, y: CY }],
  spots: [{ x: 176, y: 125 }, { x: 304, y: 125 }, { x: 176, y: 209 }, { x: 304, y: 209 }, { x: 180, y: 292 }, { x: 300, y: 292 }, { x: 180, y: 404 }, { x: 300, y: 404 },
    { x: 152, y: 532 }, { x: 328, y: 532 }, { x: 152, y: 604 }, { x: 328, y: 604 }],
  sections: [432, 248],
});

const HOLES = oculi(MEDS);
const env = ground(floor({
  meds: MEDS,
  ledgers: [[108, 168, 0], [346, 160, 1], [190, 296, 0], [262, 300, 1], [186, 372, 0], [266, 376, 0], [54, 292, 1], [398, 300, 0], [13, 322, 0], [439, 250, 1]],
  // Old blood: pools by the open coffins, dragged toward the medallions, splashes (room px: x, y, rx, ry).
  pools: [[350, 230, 12, 6], [66, 246, 14, 6], [350, 316, 11, 5], [70, 592, 13, 6], [134, 400, 8, 4], [204, 506, 4, 3], [282, 572, 3, 3], [126, 452, 4, 3], [360, 446, 3, 3], [196, 128, 4, 3], [112, 172, 5, 3], [286, 196, 3, 2]],
  drags: [[[352, 212], [318, 196], [286, 178]], [[336, 324], [300, 350], [270, 380]], [[110, 380], [150, 420], [196, 470], [220, 506]]],
}));
const room = shell(HOLES), { S, port } = room;
furnish(room, PROPS);
// candles in clusters on the floor, a skull or two, bones
candles(room, CANDLES);
for (const [x, y, a] of [[70, 152, 0.3], [424, 128, -0.6], [120, 250, 1.2], [236, 266, 2.4], [66, 462, 0.4], [422, 572, -1], [420, 420, 0.8], [352, 236, 2], [26, 282, 0.9], [454, 420, -0.4]]) S.add('skull', skull(), [wx(x), wy(y), 0], a);
S.add('bones', pitBones(5), [wx(70), wy(600), 0], 0.3); S.add('bones', pitBones(9), [wx(410), wy(440), 0], -0.8);
S.add('bones', pitBones(3), [wx(28), wy(112), 0], 1.1); S.add('bones', pitBones(11), [wx(452), wy(330), 0], -0.3);
lights(room, PROPS, CANDLES);

const SC = stage(S, env);
export async function scene() { return SC; }
/** The portcullis raised `d` room px up the screen (the game's gate frames). */
export function raise(sc, d) { port.pos[2] = wz(d); }
export const finish = shafts(HOLES);
