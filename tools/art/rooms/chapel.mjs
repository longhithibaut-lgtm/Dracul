// La chapelle aux vitraux (layout 'chapel'), in the « grand pixel » style (crypts.mjs): the Order's chapel. The Dawn
// (low, from the west) pours through stained glass high in the unseen west wall and lays panes of
// holy light on the floor that burn the vampire; the mist goes through unharmed. One source of truth, as in the
// cloister: the floor that burns (rooms.gen.mjs dawn()) is the floor this light reaches through the same shadow rays
// the render lights it with (the windows' frames, the pews, the altar); the glass only dyes it (gold, white in the
// heads, a few red, bronze and pale blue panes, dark lead), and its shafts hang in the dusty air. Banks of pews face the
// altar at the back, low cover from bolts; the gift rises on the altar's dais. By the stairs, the font of the Order's
// holy water between two braziers. Glass the windows lost glints on the slabs.
import { skull } from '../maquettes/grand/cast.mjs';
import { pew, candles2 } from '../maquettes/hub3/props3.mjs';
import { sdBox, clamp, vn, fbm, fbm3, vn3, h2, L, hex, mix, mul } from '../maquettes/hub3/lib.mjs';
import { SN, CS, wx, wy, wz, C, stone3 } from './common.mjs';
import { CX, FX0, W, H, plan, floor, ground, shell, furnish, candles, lights, scene as stage, CANDLE } from './crypts.mjs';
import { PAL as CRYPT } from './crypts.mjs';
export { POST } from './crypts.mjs';

const PROPS = [
  { kind: 'altar', x: CX, y: 104, w: 40, h: 10 },
  { kind: 'brazier', x: 184, y: 100, w: 12, h: 8 }, { kind: 'brazier', x: 296, y: 100, w: 12, h: 8 },
  ...[156, 192, 228, 300, 336, 372].flatMap((y) => [{ kind: 'pew', x: 140, y, w: 64, h: 8 }, { kind: 'pew', x: 340, y, w: 64, h: 8 }]),
  { kind: 'font', x: CX, y: 504, w: 26, h: 10 },
  { kind: 'brazier', x: 184, y: 488, w: 12, h: 8 }, { kind: 'brazier', x: 296, y: 488, w: 12, h: 8 },
  { kind: 'pew', x: 120, y: 572, w: 64, h: 8 }, { kind: 'pew', x: 360, y: 572, w: 64, h: 8 },
];
const CANDLES = [[52, 80, 3], [418, 84, 2], [58, 242, 2], [412, 244, 3], [56, 432, 3], [414, 420, 2], [52, 610, 2], [414, 612, 3], [22, 360, 2], [452, 170, 2], [454, 540, 3]]; // the last: by the side walls
const GIFT = { x: CX, y: 118 };

/** What the game needs (src/chapel.data.ts): the chapel's gameplay; HOLY: the floor its stained glass light burns. */
export const PLAN = plan({
  props: PROPS, start: { x: CX, y: 566 }, gift: GIFT,
  spawns: [{ x: CX, y: 452 }, { x: 90, y: 516 }, { x: 390, y: 516 }, { x: CX, y: 290 }, { x: 74, y: 330 }, { x: 406, y: 306 }, { x: CX, y: 78 }, { x: 74, y: 210 }, { x: 406, y: 120 }],
  spots: [{ x: 206, y: 222 }, { x: 276, y: 132 }, { x: 88, y: 240 }, { x: 400, y: 92 }, { x: 206, y: 352 }, { x: 276, y: 290 }, { x: 88, y: 410 }, { x: 400, y: 404 },
    { x: 160, y: 536 }, { x: 320, y: 540 }, { x: 88, y: 470 }, { x: 400, y: 466 }],
  sections: [432, 248], holy: true,
});

// ---------- the stained glass ----------
const SUN = (() => { const d = [-0.8, -0.12, 0.58], l = Math.hypot(...d); return d.map((v) => v / l); })(); // toward the Dawn: low in the west, a little north
const XW = 0; // the west wall's inner face (world x), at the view's edge, beyond the low side wall
// Where each window's pane falls on the floor (room px, its centre): the windows are placed on the wall to cast it.
const PANES = [[208, 140], [276, 190], [66, 142], [392, 214], [74, 306], [226, 322], [396, 284], [282, 420], [124, 476], [338, 498], [70, 572]];
const HW = 30, Z0 = 44, AR = 36; // a lancet: half width, its straight sides' height, its pointed head's radius
const WINDOWS = PANES.map(([x, y]) => { const t = (XW - wx(x)) / SUN[0]; return [wy(y) + t * SUN[1], t * SUN[2] - 38]; }); // wall y, sill z
/** The window (index), its local u (along the wall), v (up from the sill) at wall point (y, z), and how far inside its
 *  frame that is; or null. */
function windowAt(y, z) {
  for (let k = 0; k < WINDOWS.length; k++) {
    const u = y - WINDOWS[k][0], v = z - WINDOWS[k][1], e = Math.min(HW - Math.abs(u), v, v < Z0 ? 1e9 : AR - Math.hypot(Math.abs(u) + AR - HW, v - Z0));
    if (e > 0) return [k, u, v, e];
  }
  return null;
}
// The glass's colours: mostly gold, white in the heads, a few red, bronze and pale blue panes; dark lead between.
const GLASS = [[1, 0.58, 0.14], [1, 0.95, 0.8], [0.9, 0.16, 0.1], [0.72, 0.42, 0.14], [0.45, 0.72, 0.85]];
function glassAt(k, u, v) {
  if (Math.abs(u) < 1.8 || Math.abs(v - Z0) < 1.8 || ((u + v) % 13 + 13) % 13 < 2.2 || ((u - v) % 13 + 13) % 13 < 2.2) return [0.1, 0.08, 0.06];
  const h = h2(Math.floor((u + v + 130) / 13), Math.floor((u - v + 130) / 13), k + 7);
  return GLASS[v > Z0 ? (h < 0.6 ? 1 : 0) : h < 0.5 ? 0 : h < 0.65 ? 1 : h < 0.82 ? 2 : h < 0.92 ? 3 : 4];
}
/** The wall point (y, z) the Dawn's ray through world point P crosses. */
const toWall = (P) => { const t = (XW - P[0]) / SUN[0]; return [P[1] + t * SUN[1], P[2] + t * SUN[2]]; };
// The west wall the windows pierce: never seen (beyond the view's edge), it keeps the Dawn out but for its glass.
const glassWall = { sdf: (x, y, z) => { const d = sdBox(x, y, z, XW - 6, 0, 700, 6, 3000, 700); if (d > 1) return d; const w = windowAt(y, z); return w ? Math.max(d, w[3]) : d; },
  mat: () => ({ alb: C.void }), bounds: [XW - 14, -3002, 0, XW + 2, 3002, 1402], step: 0.5 };

// ---------- the floor: the altar's dais, the font's step, fallen glass ----------
function chapelFloor([X, Y], x, y) {
  for (const [d, k] of [[3, 1.35], [0, 1.15]]) if (Math.abs(X - CX) < 30 - 2 * d && Y > 94 + d && Y < 126 - d) { // the dais' two pale steps
    const e = Math.min(30 - 2 * d - Math.abs(X - CX), Y - 94 - d, 126 - d - Y);
    return { c: mul(mix(C.stB, C.stA, vn(x / 7, y / 7, 3) * 0.5), e < 1 ? 0.6 : k), N: e < 1.5 && Y > 120 ? [0, 0.5, 1] : [0, 0, 1] };
  }
  const r = Math.hypot((X - CX) / 24, (Y - 500) / 13); // the font's round step, worn pale where the faithful knelt
  if (r < 1) return { c: mul(mix(C.stB, C.stA, vn(x / 6, y / 6, 4) * 0.5), Math.abs(r - 0.92) < 0.05 ? 0.6 : 1.2), N: [0, 0, 1] };
  if (h2(x | 0, y | 0, 77) < 0.004 && Math.abs(X - CX) > 30) { const g = GLASS[(h2(x | 0, y | 0, 78) * 5) | 0]; return { c: mul(g, 0.5), N: [0.3, 0.3, 1], wet: 0.9 }; } // a shard of glass
  return null;
}

const env = ground(floor({
  under: chapelFloor,
  ledgers: [[52, 300, 0], [396, 330, 1], [52, 470, 1], [398, 452, 0], [13, 200, 1], [439, 384, 0]],
  pools: [[104, 176, 9, 4], [380, 352, 9, 4], [362, 214, 4, 3], [170, 132, 3, 2], [150, 316, 3, 3], [300, 540, 4, 3], [196, 456, 3, 2]],
  drags: [[[110, 182], [150, 200], [190, 210]], [[372, 360], [330, 380], [300, 400]]],
}));
const room = shell([]), { S, ports } = room;
furnish(room, PROPS);
const { add, light } = S;
const gilt = (x, y, z) => ({ alb: mix(L('#8a6428'), L('#3a2a12'), clamp(vn3(x * 0.5, y * 0.5, z * 0.5, 3) * 1.8 - 0.5)), spec: 0.8, gloss: 40 });
for (const o of PROPS) {
  const X = wx(o.x), Y = wy(o.y - o.h / 2);
  if (o.kind === 'pew') add('pew', pew(2 * o.w - 6, (o.x + o.y) % 7 === 0 ? 1 : 0, o.y % 5), [X, Y - 2, 0], Math.PI); // facing the altar
  else if (o.kind === 'altar') { // stone, a soiled cloth, the Order's gilded sun on its post, candles
    add('altar', { sdf: (x, y, z) => Math.min(sdBox(x, y, z, 0, 0, 20, 36, 13, 20, 1), sdBox(x, y, z, 0, 0, 41.5, 40, 15.5, 2, 0.6)), mat: (m, x, y, z) => ({ alb: mul(stone3(x, y, z, C.stB), 1.5), spec: 0.05 }),
      bounds: [-42, -18, 0, 42, 18, 45], step: 0.8 }, [X, Y, 0]);
    add('cloth', { sdf: (x, y, z) => Math.min(sdBox(x, y, z, 0, 0, 44, 30, 14, 0.6, 0.3), sdBox(x, y, z, 0, 15.6, 34 + Math.sin(x * 0.4) * 0.8, 24, 0.6, 10, 0.3)),
      mat: (m, x, y, z) => ({ alb: mix(mix(L('#a89e86'), L('#6a6250'), clamp(fbm3(x * 0.2, y * 0.2, z * 0.2, 3, 5) * 1.6 - 0.4)), L('#4a0a0e'), clamp(vn3(x * 0.2, y * 0.3, z * 0.2, 6) * 2 - 1.1)), wrap: 0.3 }),
      bounds: [-31, -15, 22, 31, 17, 46], step: 0.6 }, [X, Y, 0]);
    add('sun', { sdf: (x, y, z) => { const r = Math.hypot(x, z - 84), a = Math.atan2(z - 84, x), ray = 12 + 7 * Math.max(0, Math.cos(a * 8)) ** 3;
      return Math.min(Math.max(r - ray, Math.abs(y) - 1.2), sdBox(x, y, z, 0, 0, 62, 1.4, 1.4, 18)); }, mat: (m, x, y, z) => gilt(x, y, z), bounds: [-20, -3, 42, 20, 3, 104], step: 0.6 }, [X, Y - 8, 0]);
    add('candlesA', candles2([[X - 30, Y - 4, 44, 9, 1.4, 0.2, 0], [X - 24, Y + 2, 44, 6, 1.2, -0.2, 0], [X + 27, Y - 2, 44, 10, 1.4, 0, 0], [X + 33, Y + 3, 44, 5, 1.2, 0.3, 0]]), [0, 0, 0]);
    light({ p: [X, Y + 6, 62], c: CANDLE, I: 2.2, r0: 24, R: 260, soft: 4, pad: 3, haze: 0.012, hazeR: 4, skip: ['candlesA', 'sun'] });
  } else if (o.kind === 'font') { // a stone basin on a pedestal, the holy water dark and still
    add('font', { sdf: (x, y, z) => { const r = Math.hypot(x, y / 0.8);
      return Math.min(Math.max(r - 7 - Math.max(0, 10 - z) * 0.6, z - 30), Math.max(Math.abs(Math.hypot(r, (z - 36) * 1.6) - 18) - 2.2, z - 37, 24 - z)); },
      mat: (m, x, y, z) => ({ alb: mul(stone3(x, y, z, C.stB), 1.6), spec: 0.05 }), bounds: [-23, -19, 0, 23, 19, 40], step: 0.6 }, [X, Y, 0]);
    add('water', { sdf: (x, y, z) => Math.max(Math.hypot(x, y / 0.8) - 17, Math.abs(z - 34) - 0.4), mat: () => ({ alb: L('#0e1010'), spec: 1, gloss: 120 }), bounds: [-18, -15, 33, 18, 15, 35], step: 0.8 }, [X, Y, 0]);
  }
}
candles(room, CANDLES);
for (const [x, y, a] of [[424, 236, 0.3], [60, 136, -0.6], [420, 548, 1.2], [64, 392, 2.4], [28, 520, 1], [450, 330, -0.5], [452, 96, 2]]) add('skull', skull(), [wx(x), wy(y), 0], a);
add('glasswall', glassWall, [0, 0, 0], 0, { ghost: true });
lights(room, PROPS.filter((o) => o.kind === 'brazier'), CANDLES);
// The Dawn through the glass: its shade is the floor's safety (rooms.gen.mjs dawn()); the side walls and the vault are
// cut away for it (the side wall does not reach the windows), the west wall's glass lets it in.
const FAR = 1e5, DAWN = L('#f8dca0'), DI = 4;
light({ name: 'dawn', mask: true, p: [wx(CX) + SUN[0] * FAR, wy(300) + SUN[1] * FAR, SUN[2] * FAR], c: DAWN, I: DI, r0: 1e9, R: 1e12, soft: 150, pad: 10, skip: ['sides', 'vault'] });

const SC = stage(S, env);
// The crypts' palette, with the glass's: the bleached holy light, its golds, a red and a blue.
export const PAL = [...CRYPT, ...['#5a3a10', '#8a5a18', '#b8822a', '#e0aa40', '#f4d27a', '#fbecc0', '#fff8e4', '#6a1410', '#a8281a', '#3a5868', '#6c98aa'].map((h) => hex(h).map((v) => v * 255))];
export async function scene() { return SC; }
export function raise(sc, d) { for (const p of ports) p.pos[2] = wz(d); }
/** The glass dyes the Dawn it lets in (the render lit it white-gold): each lit texel takes its window's colour where its
 *  ray crossed the wall, the lead's dark lines too; and its shafts hang in the dusty air, dyed the same. */
export function finish(img) {
  const T0 = 4000, l = [SUN[0], SUN[1], SUN[2]];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, t = Math.min(img.depth[i], 1e5), sy = py + 0.5;
    const P = [px + 0.5, sy * SN + CS * T0 - CS * t, -sy * CS + SN * T0 - SN * t];
    if (img.sun[i] > 0 && t < 1e5) {
      const w = windowAt(...toWall(P));
      if (w) {
        const g = glassAt(...w), n = [img.nrm[i * 3], img.nrm[i * 3 + 1], img.nrm[i * 3 + 2]], ndl = n[0] * l[0] + n[1] * l[1] + n[2] * l[2];
        const k = DI * img.sun[i] * Math.max(0, (ndl + 0.2) / 1.2); // what the render added from it (its diffuse)
        for (let c = 0; c < 3; c++) img.out[i * 3 + c] += img.alb[i * 3 + c] * DAWN[c] * k * (g[c] - 1);
      }
    }
    // the shafts: the air between the surface and the eye that the Dawn reaches through a window
    let s3 = [0, 0, 0];
    for (let s = 0; P[2] + s * SN < 340; s += 3) {
      const Q = [P[0], P[1] + s * CS, P[2] + s * SN], w = windowAt(...toWall(Q));
      if (!w || Q[0] < wx(FX0 - 12)) continue; // (not over the side wall's top)
      const g = glassAt(...w), k = (0.5 + 0.5 * (1 - Q[2] / 340)) * clamp(fbm(Q[0] / 26, Q[2] / 18 + Q[1] / 40, 3, 7) * 2.4 - 0.6);
      for (let c = 0; c < 3; c++) s3[c] += g[c] * k;
    }
    for (let c = 0; c < 3; c++) img.out[i * 3 + c] += DAWN[c] * s3[c] * 0.0016;
  }
}
