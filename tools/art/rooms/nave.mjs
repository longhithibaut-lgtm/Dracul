// La nef (layout 'nave'), in the « grand pixel » style (crypts.mjs): a central lane up a rotted red runner between two
// rows of pillars (whole at the back, snapped further down, one fallen across the left aisle by the stairs) that shelter
// the side aisles from bolts; crossbowmen rise in the aisles and shoot through the gaps. Halfway, the rows open on a
// crossing: a second rosette on the runner, a brazier at each end. Graves in the aisles, coffins, the snapped pillars'
// drums, old blood. The moon falls through two oculi onto the rosettes.
import { pitBones } from '../maquettes/hub/props.mjs';
import { skull } from '../maquettes/grand/cast.mjs';
import { clamp, vn, fbm, h2, L, mix, mul } from '../maquettes/hub3/lib.mjs';
import { wx, wy, wz, C, block, stone3 } from './common.mjs';
import { CX, CY, FY0, FY1, plan, oculi, floor, ground, shell, furnish, candles, lights, scene as stage, shafts } from './crypts.mjs';
export { PAL, POST } from './crypts.mjs';

const MEDS = [[CY, 0.6], [420, 0.5]]; // the rosettes on the runner: row, size
const PROPS = [
  { kind: 'pillar', x: 168, y: 112, w: 24, h: 12 }, { kind: 'pillar', x: 312, y: 112, w: 24, h: 12 },
  { kind: 'stump', x: 168, y: 168, w: 24, h: 12, tall: 58 }, { kind: 'stump', x: 312, y: 168, w: 24, h: 12, tall: 58, flip: true },
  { kind: 'stump', x: 168, y: 224, w: 24, h: 12, tall: 44, flip: true }, { kind: 'stump', x: 312, y: 224, w: 24, h: 12, tall: 48 },
  { kind: 'stump', x: 168, y: 280, w: 24, h: 12, tall: 52 }, { kind: 'stump', x: 312, y: 280, w: 24, h: 12, tall: 56, flip: true },
  { kind: 'stump', x: 168, y: 336, w: 24, h: 12, tall: 36, flip: true }, { kind: 'stump', x: 312, y: 336, w: 24, h: 12, tall: 42 },
  { kind: 'stump', x: 168, y: 504, w: 24, h: 12, tall: 46 }, { kind: 'stump', x: 312, y: 504, w: 24, h: 12, tall: 32, flip: true },
  { kind: 'stump', x: 312, y: 560, w: 24, h: 12, tall: 52 },
  { kind: 'fallen', x: 118, y: 568, w: 64, h: 10 },
  { kind: 'brazier', x: 198, y: 86, w: 12, h: 8 }, { kind: 'brazier', x: 282, y: 86, w: 12, h: 8 },
  { kind: 'brazier', x: 112, y: 424, w: 12, h: 8 }, { kind: 'brazier', x: 368, y: 424, w: 12, h: 8 },
  { kind: 'coffin', x: 98, y: 206, w: 46, h: 14 }, { kind: 'coffinOpen', x: 386, y: 140, w: 62, h: 14 },
  { kind: 'coffin', x: 98, y: 316, w: 46, h: 14 }, { kind: 'coffinOpen', x: 384, y: 588, w: 62, h: 14 },
];
const CANDLES = [[58, 84, 3], [184, 120, 2], [290, 120, 2], [54, 240, 3], [408, 246, 2], [406, 82, 2], [184, 290, 2], [290, 344, 2], [54, 452, 3], [410, 380, 2], [52, 604, 2], [184, 514, 3], [20, 330, 2], [450, 300, 3], [18, 470, 2]]; // the last: by the side walls

/** What the game needs (src/nave.data.ts): the nave's gameplay. */
export const PLAN = plan({
  props: PROPS, start: { x: CX, y: 566 },
  spawns: [{ x: CX, y: 470 }, { x: 96, y: 500 }, { x: 384, y: 500 }, { x: CX, y: 330 }, { x: 96, y: 380 }, { x: 384, y: 356 }, { x: CX, y: 92 }, { x: 96, y: 134 }, { x: 386, y: 194 }],
  spots: [{ x: 206, y: 130 }, { x: 274, y: 204 }, { x: 98, y: 98 }, { x: 384, y: 234 }, { x: 206, y: 300 }, { x: 274, y: 380 }, { x: 98, y: 350 }, { x: 384, y: 290 },
    { x: 206, y: 526 }, { x: 274, y: 594 }, { x: 98, y: 600 }, { x: 384, y: 470 }],
  sections: [452, 248],
});

// The runner up the lane: worn red wool, a lozenge every slab, frayed edges, rucked in folds, bald where feet wore it.
const FOLDS = [102, 206, 228, 306, 362, 472, 538, 596];
function runner([X, Y], x, y) {
  const e = 16 - Math.abs(X - CX);
  if (e < 0 || Y < FY0 + 3 || (e < 2 && vn(x / 3, y / 3, 71) > 0.6 - e * 0.1)) return null;
  const dx = Math.abs(X - CX), dy = Math.abs(((Y - FY0 + 8) % 16) - 8), dia = dx + dy;
  let c = mix(L('#4a0a10'), L('#2a0608'), clamp(fbm(x / 5, y / 5, 3, 72) * 1.6 - 0.3));
  if (e < 1) c = mul(c, 0.6); else if (Math.abs(e - 3) < 0.6) c = mix(c, L('#6a1a14'), 0.6); // its border
  if (dia <= 4 && dia > 2.6) c = mix(c, L('#7a5a3a'), 0.4); // a lozenge
  if (dia <= 1.2) c = mix(c, L('#6a1a14'), 0.7);
  c = mix(c, C.grime, clamp((vn(x / 8, y / 8, 73) - 0.5) * 2.5) * 0.7); // trodden in
  if (vn(x / 7, y / 7, 74) > 0.78) c = mix(c, mul(C.stB, 0.7), 0.6); // worn bald
  let N = [0, 0, 1];
  for (const f of FOLDS) { const d = Y - f; if (Math.abs(d) < 1.5) N = [0, d < 0 ? -0.35 : 0.35, 1]; }
  return { c, N, wet: 0 };
}

const HOLES = oculi(MEDS);
const env = ground(floor({
  meds: MEDS, under: runner,
  ledgers: [[42, 150, 0], [350, 172, 1], [46, 404, 0], [372, 300, 1], [50, 528, 1], [380, 400, 0], [438, 520, 1], [13, 236, 0]],
  pools: [[372, 154, 10, 5], [382, 572, 10, 5], [90, 440, 8, 4], [214, 196, 4, 3], [120, 178, 3, 2], [268, 112, 3, 2], [214, 460, 4, 3], [120, 336, 3, 2], [268, 552, 3, 2]],
  drags: [[[360, 160], [330, 176], [300, 200]], [[368, 566], [330, 540], [300, 520]], [[96, 330], [130, 360], [150, 390]]],
}));
const room = shell(HOLES), { S, ports, R } = room;
furnish(room, PROPS.filter((o) => o.kind !== 'fallen'));
// One pillar fallen whole across the left aisle: its drums lying in a row along x, its plinth's stub left standing.
for (const o of PROPS.filter((o) => o.kind === 'fallen')) {
  const X = wx(o.x), Y = wy(o.y - o.h / 2), r = 16;
  for (let k = 0; k < 3; k++) {
    const len = 30 + h2(k, 0, 9) * 3, x0 = -36 + k * 33.5, seg = (x, y, z) => Math.max(Math.hypot(y, z - r) - r + 0.4 * vn(x / 3, z / 3, k), Math.abs(x - x0 - len / 2) - len / 2);
    S.add('fallen', { sdf: seg, mat: (m, x, y, z) => ({ alb: mul(stone3(x + o.x, y * 2, z, C.stB), 1.5) }), bounds: [x0 - 1, -r - 1, 0, x0 + len + 1, r + 1, 2 * r + 1], step: 0.8 }, [X, Y, 0], (h2(k, 1, 9) - 0.5) * 0.12);
  }
  S.add('rubble', block(-12, -12, 0, 12, 12, 14, (m, x, y, z) => ({ alb: mul(stone3(x, y, z, C.stB), 1.5) }), 1.5), [X - 51, Y, 0], 0.05);
  for (let k = 0; k < 5; k++) S.add('rubble', block(-5, -4, 0, 5, 4, 5 + R() * 4, (m, x, y, z) => ({ alb: stone3(x + o.x, y, z) }), 1.5), [X - 40 + R() * 100, Y + 20 + R() * 16, 0], R() * 3);
}
candles(room, CANDLES);
for (const [x, y, a] of [[66, 186, 0.3], [418, 112, -0.6], [136, 248, 1.2], [70, 470, 0.4], [412, 336, -1], [140, 300, 2.4], [402, 518, 0.8], [26, 262, -0.4], [454, 470, 1.9], [24, 600, 0.6]]) S.add('skull', skull(), [wx(x), wy(y), 0], a);
S.add('bones', pitBones(4), [wx(76), wy(196), 0], 0.4); S.add('bones', pitBones(7), [wx(404), wy(612), 0], -0.5);
S.add('bones', pitBones(2), [wx(24), wy(412), 0], 1.3); S.add('bones', pitBones(12), [wx(452), wy(156), 0], -0.9);
lights(room, PROPS, CANDLES);

const SC = stage(S, env);
export async function scene() { return SC; }
export function raise(sc, d) { for (const p of ports) p.pos[2] = wz(d); }
export const finish = shafts(HOLES);
