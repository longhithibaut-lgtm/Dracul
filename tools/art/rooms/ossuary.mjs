// L'ossuaire effondré (layout 'ossuary'), in the « grand pixel » style (crypts.mjs): the floor has fallen into the dark
// along the walls and in holes (sheer sides of broken slabs sinking out of sight); walkers go round, bolts and shards
// fly over. Few props, little cover: braziers, heaps of skulls and bones spilled from the fallen niches. Halfway up, the
// great collapse cuts the room across: two bridges over it, one up the middle under a moon shaft, one along the east
// wall. The collapse began at the cracked medallion's drain.
import { pitBones } from '../maquettes/hub/props.mjs';
import { skull } from '../maquettes/grand/cast.mjs';
import { sdEll, clamp, vn, vn3, fbm3, h2, mix, mul, mulberry32 } from '../maquettes/hub3/lib.mjs';
import { wx, wy, wz, rx, ry, C, block, stone3, segDist } from './common.mjs';
import { CX, CY, FX0, FX1, plan, oculi, floor, ground, pitShadow, shell, furnish, candles, lights, scene as stage, shafts } from './crypts.mjs';
export { PAL, POST } from './crypts.mjs';

const MEDS = [[CY, 0.68]];
const PROPS = [
  { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 }, { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
  { kind: 'heap', x: 66, y: 86, w: 24, h: 8 }, { kind: 'heap', x: 410, y: 238, w: 24, h: 8 },
  { kind: 'brazier', x: 196, y: 402, w: 12, h: 8 }, { kind: 'brazier', x: 284, y: 402, w: 12, h: 8 },
  { kind: 'heap', x: 420, y: 298, w: 24, h: 8 }, { kind: 'heap', x: 70, y: 604, w: 24, h: 8 }, { kind: 'heap', x: 250, y: 484, w: 24, h: 8 },
];
// The holes against a side wall run into it (FX0, FX1).
const PITS = [
  { x: FX0, y: 128, w: 120 - FX0, h: 48 }, { x: FX0, y: 172, w: 88 - FX0, h: 28 }, { x: 96, y: 120, w: 32, h: 28 }, // west: against the wall
  { x: 360, y: 96, w: FX1 - 360, h: 48 }, { x: 392, y: 140, w: FX1 - 392, h: 20 }, { x: 346, y: 116, w: 24, h: 24 }, // east
  { x: 152, y: 80, w: 32, h: 32 }, // back left
  { x: 280, y: 200, w: 64, h: 32 }, // front right, where the medallion's crack ran
  { x: 128, y: 216, w: 32, h: 24 }, // front left
  // The great collapse, west and east of the middle bridge, short of the east wall.
  { x: FX0, y: 332, w: 212 - FX0, h: 40 }, { x: 72, y: 318, w: 72, h: 18 }, { x: 120, y: 368, w: 64, h: 16 },
  { x: 268, y: 332, w: FX1 - 40 - 268, h: 40 }, // the east bridge: 40 wide along the wall { x: 300, y: 368, w: 56, h: 16 }, { x: 328, y: 320, w: 40, h: 14 },
  // Down by the stairs: the floor gone along both walls and in two holes.
  { x: FX0, y: 468, w: 92 - FX0, h: 64 }, { x: FX0, y: 450, w: 68 - FX0, h: 24 },
  { x: 392, y: 500, w: FX1 - 392, h: 72 }, { x: 372, y: 520, w: 24, h: 28 },
  { x: 300, y: 446, w: 40, h: 26 }, { x: 140, y: 546, w: 40, h: 28 },
];
const CANDLES = [[62, 236, 3], [404, 80, 2], [296, 248, 2], [176, 300, 2], [412, 430, 3], [58, 420, 2], [300, 600, 3], [110, 456, 2], [20, 262, 2], [450, 420, 3], [22, 590, 2]]; // the last: by the side walls

/** What the game needs (src/ossuary.data.ts): the ossuary's gameplay. */
export const PLAN = plan({
  props: PROPS, pits: PITS, start: { x: CX, y: 580 },
  spawns: [{ x: CX, y: 446 }, { x: 120, y: 456 }, { x: 352, y: 516 }, { x: CX, y: 300 }, { x: 100, y: 410 }, { x: 380, y: 410 }, { x: CX, y: 92 }, { x: 102, y: 100 }, { x: 392, y: 194 }],
  spots: [{ x: 172, y: 154 }, { x: 306, y: 164 }, { x: 190, y: 226 }, { x: 318, y: 112 }, { x: 150, y: 290 }, { x: 320, y: 290 }, { x: 150, y: 420 }, { x: 336, y: 420 },
    { x: 196, y: 470 }, { x: 290, y: 540 }, { x: 116, y: 604 }, { x: 350, y: 604 }],
  sections: [440, 248],
});

/** In a hole (room px): the pits' boxes, their rims broken a pixel or two either way. */
const pit = (X, Y) => { const j = (vn(X / 3, Y / 3, 91) - 0.5) * 3; return PITS.some((b) => X > b.x - j && X < b.x + b.w + j && Y > b.y - j && Y < b.y + b.h + j); };
const nearPit = (X, Y, d) => PITS.some((b) => X > b.x - d && X < b.x + b.w + d && Y > b.y - d && Y < b.y + b.h + d);
// Cracks running from the holes and from the medallion's drain to the hole the collapse began with (room px polylines).
const CRACKS = [[[CX + 4, CY + 5], [262, 182], [284, 202]], [[CX - 6, CY - 2], [214, 150], [196, 128]], [[122, 140], [140, 132], [150, 122]], [[92, 202], [104, 214], [110, 232]],
  [[356, 120], [338, 128], [330, 140]], [[186, 94], [200, 98], [214, 92]], [[162, 228], [180, 234], [194, 230]], [[346, 214], [360, 224], [370, 222]],
  [[214, 330], [222, 312], [230, 300]], [[268, 374], [262, 392], [266, 410]], [[94, 492], [112, 494], [124, 488]], [[390, 540], [372, 548], [360, 560]],
  [[180, 560], [196, 566], [210, 562]], [[336, 460], [350, 452], [356, 440]]];
function broken([X, Y], x, y) {
  let c = null;
  // the slabs round a hole tilted and split, dark grit in the cracks
  if (nearPit(X, Y, 5) && vn(x / 4, y / 4, 92) > 0.45) c = mul(mix(C.stB, C.stC, vn(x / 3, y / 3, 93)), 0.75);
  for (const k of CRACKS) for (let i = 0; i < k.length - 1; i++) if (segDist(X, Y, k[i], k[i + 1]) + (vn(x / 3, y / 3, 94 + i) - 0.5) * 1.6 < 0.7) return { c: C.mortar, N: [0, 0, 1] };
  return c && { c, N: [(vn(x / 5, y / 5, 95) - 0.5) * 0.6, (vn(x / 5, y / 5, 96) - 0.5) * 0.6, 1] };
}

const HOLES = oculi([[CY, 0.68], [356, 0.5]]);
const env = ground(floor({
  meds: MEDS, under: broken,
  ledgers: [[200, 260, 1], [300, 280, 1], [180, 500, 0], [330, 590, 1]],
  pools: [[98, 236, 10, 5], [372, 432, 9, 4], [222, 196, 4, 3], [330, 150, 3, 2], [236, 420, 4, 3], [120, 300, 3, 2], [330, 590, 4, 3]],
  drags: [[[110, 236], [150, 250], [190, 262]], [[370, 440], [330, 430], [300, 420]]],
}), pit);
const room = shell(HOLES), { S, ports } = room;
furnish(room, PROPS);
// Heaps of the dead spilled from the fallen niches: a mound of earth and bone meal, skulls and long bones on it.
const R = mulberry32(83);
const dust = (m, x, y, z) => ({ alb: mix(mix(C.boneD, C.grime, clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, 4) * 1.6 - 0.3)), C.bone, clamp(vn3(x * 0.9, y * 0.9, z * 0.9, 5) - 0.55) * 1.8), spec: 0.1, gloss: 20 });
for (const o of PROPS.filter((o) => o.kind === 'heap')) {
  const X = wx(o.x), Y = wy(o.y - o.h / 2);
  S.add('heap', { sdf: (x, y, z) => Math.max(sdEll(x, y, z, 0, 0, 0, 25, 13, 16) - 1.2 * vn3(x / 3, y / 3, z / 3, o.x), -z), mat: dust, bounds: [-28, -16, 0, 28, 16, 19], step: 0.7 }, [X, Y, 0], (R() - 0.5) * 0.4);
  for (let k = 0; k < 7; k++) { const a = R() * 6.28, d = R(), u = Math.cos(a) * d * 20, v = Math.sin(a) * d * 10; S.add('skull', skull(), [X + u, Y + v, Math.max(0, 15 * Math.sqrt(Math.max(0, 1 - d * d)) - 3)], R() * 6.28); }
  S.add('bones', pitBones(o.x % 13), [X, Y + 10, 0], R() * 6.28);
}
// The dead strewn over the floor, never on the medallion nor in a hole; rubble round the holes.
for (let i = 0; i < 46; i++) {
  const x = 60 + R() * 360, y = 80 + R() * 520, a = R() * 6.28;
  if (nearPit(x, y, 8) || Math.hypot(x - CX, (y - CY) * 1.3) < 60 || Math.abs(x - CX) < 16 || PROPS.some((b) => Math.abs(x - b.x) < 20 && Math.abs(y - b.y) < 14)) continue;
  S.add('skull', skull(), [wx(x), wy(y), 0], a);
}
for (const b of PITS) for (let k = 0; k < 3; k++) {
  const side = R(), x = side < 0.5 ? b.x + R() * b.w : (R() < 0.5 ? b.x - 3 : b.x + b.w + 3), y = side < 0.5 ? b.y + b.h + 3 : b.y + R() * b.h;
  if (x < FX0 + 6 || x > FX1 - 6 || pit(x, y) || nearPit(x, y, -1)) continue;
  S.add('rubble', block(-4, -3, 0, 4, 3, 3 + R() * 4, (m, x, y, z) => ({ alb: stone3(x + b.x, y, z) }), 1.2), [wx(x), wy(y), 0], R() * 3);
}
for (const [x, y, a] of [[26, 300, 0.4], [30, 410, 2.2], [448, 238, -0.7], [452, 600, 1.4]]) S.add('skull', skull(), [wx(x), wy(y), 0], a); // by the side walls
S.add('bones', pitBones(6), [wx(26), wy(92), 0], 0.9); S.add('bones', pitBones(10), [wx(452), wy(470), 0], -1.1);
candles(room, CANDLES);
lights(room, PROPS, CANDLES);

const SC = stage(S, env, pitShadow(pit));
export async function scene() { return SC; }
export function raise(sc, d) { for (const p of ports) p.pos[2] = wz(d); }
export const finish = shafts(HOLES);
