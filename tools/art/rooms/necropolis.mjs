// La nécropole (docs/extraction.md §4), the first open zone round the refuge: one cavern 8 x 5 screens wide (3840 x 1350
// room px), baked chunk by chunk by tools/art/zone.gen.mjs in the « grand pixel » style of the rooms (the mockup engine,
// the crypts' vocabulary). Its plan is the single source of truth for the art and the game: the cavern's outline, the
// chasm and its two crossings, the walls of bones, the four doors into the painted rooms (and the refuge's stairs), the
// two shortcuts' gates, the graves, mausoleums, the Order's camp, the breach where the Dawn falls; collisions are drawn
// from the same shapes (zone.gen.mjs walk()).
// World units as in common.mjs: x east, y south, z up; a room px of floor is 2 world units across and 2 / SN deep.
import { sdBox, sdRC, sdEll, clamp, vn, fbm, vn3, fbm3, h2, L, hex, mix, mul, mulberry32 } from '../maquettes/hub3/lib.mjs';
import { pillar, portcullis, skull } from '../maquettes/grand/cast.mjs';
import { oldCoffin } from '../maquettes/hub3/props2.mjs';
import { candles2, brazier2, rubble, statue, chest, trophyPike, weaponRack } from '../maquettes/hub3/props3.mjs';
import { pitBones } from '../maquettes/hub/props.mjs';
import { cross, stele } from '../maquettes/cloitre/props.mjs';
import { cam, SN, CS, wx, wy, wz, rx, ry, C, broken, block, stage, flags, grime, ashlar, ossuary, stain, segDist, stone3, ironMat } from './common.mjs';
import { ground, pitShadow, PAL as CRYPT_PAL } from './crypts.mjs';

export const RW = 3840, RH = 1350, SW = 480, SH = 270; // the zone; a screen, the chunk the game loads
const W = 2 * RW, H = 2 * RH, VAULT = 420;
const R = mulberry32(1913);

// ---------- the cavern's outline (room px) ----------
const XW = 22, XE = RW - 22;
// Arches cut into the north cliff: the refuge's stairs, and the two mouths of the gallery under it (shortcut B).
export const ARCHES = [{ x: 230, kind: 'stairs' }, { x: 1690, kind: 'gallery' }, { x: 3260, kind: 'gallery' }];
/** The north cliff's foot: flat where the arches come out of it. */
export const north = (x) => { let v = 84 + 10 * Math.sin(x / 260 + 0.7) + 7 * Math.sin(x / 123 + 2.1); for (const a of ARCHES) v += (92 - v) * clamp(1 - Math.abs(x - a.x) / 90); return v; };
export const south = (x) => 1322 - 6 * Math.sin(x / 210 + 1);
// The chasm from north to south, crossed by the bridge (south) and the causeway (north).
const chasmX = (y) => 1405 + 20 * Math.sin(y / 180 + 0.4), chasmW = (y) => 46 + 6 * Math.sin(y / 101 + 1);
export const BRIDGE = { x0: 1350, x1: 1480, y0: 1148, y1: 1188 }, CAUSEWAY = { x0: 1338, x1: 1478, y0: 216, y1: 250 };
const crossing = (Y) => (Y >= BRIDGE.y0 && Y < BRIDGE.y1) || (Y >= CAUSEWAY.y0 && Y < CAUSEWAY.y1);
// Holes: the pit field (mid-north), opened graves (mid-south, the far side): ellipses x, y, rx, ry.
export const HOLES = [[2080, 420, 26, 12], [2170, 474, 34, 14], [2292, 430, 22, 10], [2240, 546, 30, 12], [2108, 566, 20, 9], [2364, 520, 18, 9],
  [1622, 1012, 12, 6], [1664, 1064, 12, 6], [1724, 1004, 12, 6], [2282, 1222, 12, 6], [1582, 884, 12, 6], [3452, 806, 12, 6], [3508, 862, 12, 6]];
/** A hole in the floor at room px (X, Y) (`edge`: the drawn rim's wobble, none for collisions). */
export function pit(X, Y, edge = 0) {
  if (!crossing(Y) && Math.abs(X - chasmX(Y)) < chasmW(Y) + edge * 1.6 * (vn(X / 5, Y / 5, 5) - 0.5)) return true;
  for (const [x, y, a, b] of HOLES) { const dx = (X - x) / a, dy = (Y - y) / b; if (dx * dx + dy * dy < 1 + edge * 0.3 * (vn(X / 4, Y / 4, 6) - 0.5)) return true; }
  return false;
}
/** Out of the cavern: the cliffs and the rock rims. */
export const rock = (X, Y) => X < XW || X > XE || (Y < north(X) && !ARCHES.some((a) => Math.abs(X - a.x) < 18 && Y > 62)) || Y > south(X); // but the arches

// ---------- what was built (room px rects x0, y0, x1, y1) ----------
// Walls of bones: the long wall across the middle, the wall between the middle and the far side (broken at the breach),
// the court of the causeway. h: world height.
export const WALLS = [
  { x0: 1440, y0: 698, x1: 2380, y1: 716, h: 76 },
  { x0: 2604, y0: 60, x1: 2636, y1: 292, h: 84, end: 1 }, { x0: 2604, y0: 428, x1: 2636, y1: 1340, h: 84, end: -1 },
  { x0: 1450, y0: 278, x1: 1505, y1: 292, h: 80 }, { x0: 1545, y0: 278, x1: 1600, y1: 292, h: 80 }, { x0: 1576, y0: 60, x1: 1600, y1: 292, h: 80 },
];
// The shortcuts: a portcullis raised only from its side (+1: the south), forever once raised (save.ts); x0..x1 the opening
// in the wall y0..y1, lever: where he stands to raise it (none: raised with the other of its id). A: la grille, in the
// court where the causeway lands, raised from the middle. B: la porte scellée of the gallery under the north cliff, from
// the far side's mouth; its other mouth, in the middle, opens with it, and the gallery links them (TUNNEL).
export const GATES = [
  { id: 'grille', name: 'La grille', x0: 1505, x1: 1545, y0: 278, y1: 292, side: 1, lever: { x: 1525, y: 312 } },
  { id: 'galerie', name: 'La porte scellée', x0: 3240, x1: 3280, y0: 78, y1: 92, side: 1, lever: { x: 3302, y: 118 }, arch: true },
  { id: 'galerie', name: 'La porte scellée', x0: 1670, x1: 1710, y0: 78, y1: 92, side: 1, lever: null, arch: true },
];
/** The gallery's two mouths (its doors, as DOORS), the middle's then the far side's. */
export const TUNNEL = [{ x: 1690, y: 92, w: 36 }, { x: 3260, y: 92, w: 36 }];
// The doors: the refuge's stairs out of the north cliff, and the four painted rooms' doors (their stairs lead back here).
// x: the doorway's middle, y: its threshold (the floor row where the facade stands), w: its width.
export const DOORS = {
  refuge: { x: 230, y: 92, w: 36, name: 'Le refuge' },
  hall: { x: 760, y: 478, w: 32, name: 'La crypte' },
  nave: { x: 1880, y: 330, w: 36, name: 'La nef' },
  ossuary: { x: 1950, y: 738, w: 28, name: "L'ossuaire" },
  chapel: { x: 3560, y: 300, w: 32, name: 'La chapelle' },
};
// The facades round those doors (footprints), how they look.
const FACADES = [
  { door: 'hall', kind: 'crypt', x0: 704, y0: 432, x1: 816, h: 120 },
  { door: 'nave', kind: 'church', x0: 1790, y0: 236, x1: 1970, h: 250 },
  { door: 'ossuary', kind: 'bones', x0: 1915, y0: 700, x1: 1985, h: 120 },
  { door: 'chapel', kind: 'chapel', x0: 3480, y0: 196, x1: 3640, h: 230 },
];
const RECESS = 14; // how deep a doorway goes into its facade (room px)
// Mausoleums (decor): front feet line x, y; w x d room px.
const MAUS = [[520, 660, 60, 34], [1060, 390, 56, 30], [300, 870, 64, 34], [1010, 1010, 60, 32], [150, 1180, 56, 30],
  [1700, 600, 60, 32], [2470, 300, 56, 30], [1610, 1268, 60, 30], [2300, 864, 56, 30], [3700, 700, 60, 32], [3420, 1190, 64, 34], [3020, 266, 56, 30]];
// Stumps of rock columns, broken: x, y (their foot's middle), r.
const COLS = [[1180, 1250, 22], [660, 300, 20], [2010, 196, 24], [3300, 560, 22], [3772, 420, 18], [2930, 1240, 20], [80, 520, 20]];
// The Order's camp: tents (x, y front middle), its palisade (stakes along these runs), crates, racks, trophies, a cage.
const TENTS = [[3010, 800], [3250, 790], [3110, 990]];
const PALISADE = [[[2940, 680], [3080, 680]], [[3150, 680], [3370, 680]], [[3384, 700], [3384, 900]], [[3384, 960], [3384, 1040]]];
const CRATES = [[3184, 900], [3206, 930], [2972, 900]];
// Graves of the fields: generated in blocks (x0, y0, x1, y1, step x, step y) clear of paths, doors and the rest.
const BLOCKS = [[60, 520, 600, 1290, 44, 56], [600, 600, 1310, 1290, 48, 58], [380, 130, 1320, 430, 46, 54],
  [1520, 790, 2400, 1300, 64, 70], [1620, 380, 2580, 680, 62, 66], [3300, 560, 3790, 1300, 52, 60], [2470, 1110, 2900, 1300, 50, 56], [2700, 200, 3420, 600, 70, 72]];
// Paths of gravel (polylines, width) and paving (rects).
const PATHS = [
  [18, [[280, 200], [470, 420], [640, 560], [820, 760], [1040, 960], [1240, 1110], [1352, 1168]]], [14, [[640, 560], [760, 500]]],
  [14, [[300, 170], [700, 196], [1100, 232], [1338, 233]]], [12, [[470, 420], [300, 700], [250, 1000], [380, 1250]]], [12, [[820, 760], [1120, 660]]],
  [18, [[1480, 1168], [1800, 1080], [2150, 1000], [2450, 900], [2500, 740], [2500, 660], [2450, 520], [2560, 370]]], [12, [[1800, 1080], [1950, 760]]],
  [14, [[1525, 292], [1700, 360], [1880, 344], [2050, 330], [2300, 250], [2560, 360]]], [12, [[1600, 330], [1690, 120]]],
  [16, [[2660, 360], [2900, 420], [3200, 350], [3560, 316]]], [14, [[2900, 420], [3050, 640], [3110, 700], [3150, 820]]], [12, [[3260, 120], [3200, 350]]],
  [14, [[3150, 900], [2900, 1050], [2700, 1180]]], [12, [[3384, 930], [3600, 1000], [3700, 1200]]],
];
const PAVED = [[150, 92, 320, 232], [715, 478, 805, 526], [1846, 330, 1914, 384], [1930, 738, 1970, 772], [3520, 300, 3600, 352], [1471, 120, 1580, 278],
  [1500, 292, 1550, 330], [1660, 92, 1720, 128], [3230, 92, 3290, 128]];
const DECKS = [[BRIDGE.x0, BRIDGE.y0, BRIDGE.x1, BRIDGE.y1], [CAUSEWAY.x0, CAUSEWAY.y0, CAUSEWAY.x1, CAUSEWAY.y1]]; // paved, edge to edge
const CAMP = [2930, 690, 3380, 1060]; // trampled mud
// Where the Dawn falls through the vault (the breach), and the moon through its cracks: floor patches x, y, r (room px).
const SUNHOLES = [[2622, 362, 62, 50], [2694, 300, 24, 18], [2552, 444, 22, 16]];
const MOONHOLES = [[560, 980, 40], [1130, 330, 34], [2150, 600, 40], [1700, 1000, 36], [3100, 440, 40], [3560, 1040, 40], [900, 760, 30], [3000, 1180, 30]];
// Lit braziers and candles at graves (room px floor points).
const BRAZIERS = [[180, 132], [282, 132], [1340, 1138], [1490, 1200], [1488, 304], [1562, 304], [3520, 314], [3600, 314],
  [3060, 880], [3236, 872], [3150, 724], [2470, 650], [1928, 760], [1662, 114], [1718, 114], [3232, 114], [3288, 114], [2700, 1170]];
const CANDLES = [[742, 486, 3], [780, 488, 2], [1124, 664, 3], [430, 1094, 2], [1870, 344, 2], [1898, 346, 3], [3380, 448, 3], [3548, 316, 2], [3578, 318, 2],
  [560, 676, 2], [312, 886, 3], [2270, 196, 2], [1620, 1284, 2], [3610, 1114, 2], [2730, 1244, 2], [1714, 616, 2], [3712, 716, 2], [1960, 754, 2]];
// The Order's lanterns on their poles round the camp (their dirty green light).
const LANTERNS = [[2996, 716], [3320, 716], [2996, 1036], [3320, 1036], [3560, 360]];
const PYRE = [3120, 846]; // the camp's fire: a pyre of coffin boards and bones

// ---------- the gameplay plan, read by zone.gen.mjs ----------
// Areas where the foes stand (docs/extraction.md: rings by distance from the refuge), first match; groups: how many.
export const AREAS = [
  { id: 'proche-nord', ring: 1, rect: [0, 0, 1350, 520], groups: 2 },
  { id: 'proche-sud', ring: 1, rect: [0, 520, 1350, 1350], groups: 3 },
  { id: 'milieu-nord', ring: 2, rect: [1350, 0, 2612, 707], groups: 3 },
  { id: 'milieu-sud', ring: 2, rect: [1350, 707, 2612, 1350], groups: 3 },
  { id: 'camp', ring: 3, rect: [2612, 640, 3300, 1350], groups: 4 },
  { id: 'loin-ouest', ring: 3, rect: [2612, 0, 3200, 640], groups: 2 },
  { id: 'loin-est', ring: 3, rect: [3200, 0, 3840, 1350], groups: 2 },
];
// Blood caches: floor points in front of what is worth searching, by area.
export const CACHES = [[1124, 676], [432, 1102], [1020, 1028], [2270, 206], [1724, 1030], [2190, 960], [3168, 912], [3384, 460], [2730, 1250], [3612, 1124], [3030, 286]];
export const TORCH_ROWS = () => [...BRAZIERS.map(([x, y]) => [x, Math.round(y - 4 - 36 * CS / 2), 1]), ...[-8, 0, 7].map((d) => [PYRE[0] + d, Math.round(PYRE[1] - 6 - 22 * CS / 2), 1])]; // flames over the dark (dark.ts)

// ---------- solid footprints (room px x, y, w, h): what stops walkers ----------
const rect = (x0, y0, x1, y1) => [x0, y0, x1 - x0, y1 - y0];
/** Every solid footprint but the cavern's rock and the pits (zone.gen.mjs adds those from rock() and pit()); a gate's
 *  opening is its own (gates()). */
export function solids() {
  const out = WALLS.map((w) => rect(w.x0, w.y0, w.x1, w.y1));
  for (const f of FACADES) {
    const d = DOORS[f.door], dx0 = d.x - d.w / 2, dx1 = d.x + d.w / 2;
    out.push(rect(f.x0, f.y0, dx0, d.y), rect(dx1, f.y0, f.x1, d.y), rect(dx0, f.y0, dx1, d.y - RECESS));
  }
  for (const g of GATES) if (!g.arch) out.push(rect(g.x0 - 8, g.y0 - 2, g.x0, g.y1 + 2), rect(g.x1, g.y0 - 2, g.x1 + 8, g.y1 + 2)); // the gatehouses' piers
  for (const [x0, y0, x1, y1] of DECKS) out.push(rect(x0, y0, x1, y0 + 4), rect(x0, y1 - 4, x1, y1)); // the parapets
  for (const [x, y, w, d] of MAUS) out.push(rect(x - w / 2, y - d, x + w / 2, y));
  for (const [x, y, r] of COLS) out.push(rect(x - r, y - r * 0.6, x + r, y + 2));
  for (const [x, y] of TENTS) out.push(rect(x - 22, y - 26, x + 22, y));
  for (const run of PALISADE) { const [[a, b], [c, d]] = run; out.push(a === c ? rect(a - 3, b, a + 3, d) : rect(a, b - 3, c, b + 3)); }
  for (const [x, y] of CRATES) out.push(rect(x - 14, y - 9, x + 14, y));
  for (const g of GRAVES) out.push(rect(g.x - g.w / 2, g.y - g.h, g.x + g.w / 2, g.y));
  for (const o of PROPS) out.push(rect(o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y));
  for (const [x, y] of BRAZIERS) out.push(rect(x - 6, y - 8, x + 6, y));
  for (const [x, y] of LANTERNS) out.push(rect(x - 2, y - 3, x + 2, y));
  out.push(rect(PYRE[0] - 18, PYRE[1] - 12, PYRE[0] + 18, PYRE[1]));
  return out;
}
/** The shortcuts' openings, closed (room px x, y, w, h). */
export const gateBoxes = () => GATES.map((g) => rect(g.x0, g.y0, g.x1, g.y1));

// ---------- the floor's rasters, one byte per room px ----------
// kind: 0 earth, 1 gravel, 2 paving, 3 the camp's mud; mound: turned earth over a grave; blood: old blood.
const N = RW * RH, kind = new Uint8Array(N), mound = new Uint8Array(N), blood = new Uint8Array(N);
function paint(x0, y0, x1, y1, f) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(RH, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(RW, Math.ceil(x1)); x++) f(y * RW + x, x, y);
}
for (const [w, pts] of PATHS) for (let k = 0; k < pts.length - 1; k++) {
  const a = pts[k], b = pts[k + 1];
  paint(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (i, x, y) => {
    if (segDist(x + 0.5, y + 0.5, a, b) < w / 2 + 2.5 * (vn(x / 7, y / 7, 3) - 0.5) && kind[i] !== 2) kind[i] = 1;
  });
}
paint(...CAMP, (i) => { if (kind[i] === 0) kind[i] = 3; });
for (const [x0, y0, x1, y1] of PAVED) paint(x0, y0, x1, y1, (i, x, y) => { const e = Math.min(x - x0, x1 - x, y - y0, y1 - y); if (e > 7 * vn(x / 5, y / 5, 13) - 1 || y < y0 + 2) kind[i] = 2; }); // broken at its edges
for (const p of DECKS) paint(...p, (i) => (kind[i] = 2));
/** Room px (x, y) clear of paths and paving by `m`. */
const clear = (x, y, m) => { for (let j = -m; j <= m; j += 2) for (let i = -m; i <= m; i += 2) { const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= RW || Y >= RH || kind[Y * RW + X] === 1 || kind[Y * RW + X] === 2) return false; } return true; };

// ---------- props on the floor: graves in their blocks, sarcophagi, statues, rubble, broken pillars ----------
// Props with footprints (x: middle, y: feet line, w x h room px).
const PROPS = [
  { kind: 'statue', x: 1124, y: 662, w: 24, h: 14 }, { kind: 'statue', x: 3384, y: 446, w: 24, h: 14 },
  { kind: 'sarc', x: 432, y: 1090, w: 40, h: 14 }, { kind: 'sarc', x: 2270, y: 194, w: 40, h: 14 }, { kind: 'sarc', x: 3612, y: 1112, w: 40, h: 14 },
  { kind: 'sarc', x: 1020, y: 1016, w: 40, h: 14 }, { kind: 'coffin', x: 2730, y: 1238, w: 46, h: 12 }, { kind: 'coffin', x: 1724, y: 1018, w: 46, h: 12 },
  { kind: 'chest', x: 3168, y: 900, w: 26, h: 12 }, { kind: 'chest', x: 2190, y: 948, w: 26, h: 12 }, { kind: 'sarc', x: 3030, y: 274, w: 40, h: 14 },
  { kind: 'stump', x: 2582, y: 360, w: 20, h: 10, tall: 34 }, { kind: 'stump', x: 2660, y: 410, w: 20, h: 10, tall: 22 }, { kind: 'stump', x: 2640, y: 300, w: 20, h: 10, tall: 44 },
  { kind: 'stump', x: 2050, y: 820, w: 22, h: 11, tall: 40 }, { kind: 'stump', x: 2150, y: 1100, w: 22, h: 11, tall: 28 }, { kind: 'pillar', x: 2240, y: 960, w: 22, h: 11 },
  { kind: 'stump', x: 1900, y: 520, w: 22, h: 11, tall: 50 }, { kind: 'pillar', x: 1360, y: 1120, w: 20, h: 10 }, { kind: 'pillar', x: 1470, y: 1120, w: 20, h: 10 },
  { kind: 'trophy', x: 2960, y: 760, w: 6, h: 4 }, { kind: 'trophy', x: 3334, y: 760, w: 6, h: 4 }, { kind: 'rack', x: 3280, y: 962, w: 30, h: 8 },
  { kind: 'banner', x: 3086, y: 690, w: 6, h: 4 }, { kind: 'banner', x: 3144, y: 690, w: 6, h: 4 }, { kind: 'banner', x: 3530, y: 306, w: 6, h: 4 }, { kind: 'banner', x: 3590, y: 306, w: 6, h: 4 },
  { kind: 'lever', x: 1556, y: 312, w: 10, h: 6 }, { kind: 'lever', x: 3316, y: 112, w: 10, h: 6 },
];
// Rubble heaps where galleries fell (walkable round, solid in the middle).
const RUBBLE = [[2080, 880, 26], [2200, 1040, 30], [1980, 1130, 22], [2600, 280, 20], [2610, 444, 22], [1180, 120, 24], [600, 1270, 22], [3420, 620, 24], [2300, 640, 20]];
for (const [x, y, r] of RUBBLE) PROPS.push({ kind: 'rubble', x, y: y + r * 0.3, w: r * 1.2, h: r * 0.5, r });
const taken = (x, y, m) => {
  const near = (x0, y0, x1, y1) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  return pit(x, y) || pit(x, y + 8) || pit(x, y - 8) || rock(x, y - 20) || rock(x, y + 12) || WALLS.some((w) => near(w.x0, w.y0 - 30, w.x1, w.y1 + 10))
    || FACADES.some((f) => near(f.x0, f.y0, f.x1, DOORS[f.door].y + 40)) || MAUS.some(([mx, my, w, d]) => near(mx - w / 2, my - d - 20, mx + w / 2, my + 6))
    || COLS.some(([cx, cy, r]) => near(cx - r, cy - r, cx + r, cy + 6)) || TENTS.some(([tx, ty]) => near(tx - 36, ty - 50, tx + 36, ty + 6)) || near(...CAMP)
    || PROPS.some((o) => near(o.x - o.w / 2, o.y - o.h - 16, o.x + o.w / 2, o.y + 6)) || Object.values(DOORS).some((d) => Math.hypot(d.x - x, d.y - y) < 70)
    || GATES.some((g) => near(g.x0 - 40, g.y0 - 40, g.x1 + 40, g.y1 + 50)) || BRAZIERS.some(([bx, by]) => Math.hypot(bx - x, by - y) < 18)
    || SUNHOLES.some(([sx, sy, a]) => Math.hypot(sx - x, sy - y) < a + 30) || CACHES.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 24);
};
// Each grave: x, y (its feet line), kind, footprint w x h, seed.
const GRAVES = [];
for (const [x0, y0, x1, y1, sx, sy] of BLOCKS) for (let y = y0; y < y1; y += sy) for (let x = x0; x < x1; x += sx) {
  const gx = Math.round(x + (R() - 0.5) * sx * 0.35), gy = Math.round(y + (R() - 0.5) * sy * 0.25), r = R();
  if (r < 0.18 || taken(gx, gy, 10) || !clear(gx, gy + 10, 8) || !clear(gx, gy - 6, 6)) continue;
  const k = r < 0.5 ? 'cross' : r < 0.78 ? 'stele' : r < 0.9 ? 'tomb' : 'lying';
  GRAVES.push({ x: gx, y: gy, kind: k, w: k === 'tomb' ? 30 : k === 'lying' ? 14 : 12, h: k === 'tomb' ? 12 : k === 'lying' ? 4 : 5, seed: (R() * 1e4) | 0 });
}
for (const g of GRAVES) if (g.kind !== 'tomb') paint(g.x - 12, g.y, g.x + 12, g.y + 20, (i, x, y) => {
  const dx = (x - g.x) / 8, dy = (y - g.y - 9) / 7, v = 1 - dx * dx - dy * dy + (vn(x / 3, y / 3, g.seed) - 0.5) * 0.5;
  if (v > 0 && kind[i] === 0) mound[i] = Math.max(mound[i], Math.min(255, v * 600));
});
// Old blood: pools and drags (room px x, y, rx, ry; polylines).
const POOLS = [[3150, 860, 14, 6], [3040, 960, 10, 5], [2960, 780, 8, 4], [760, 500, 9, 4], [1124, 680, 8, 4], [1952, 760, 9, 4], [3560, 330, 10, 4], [2700, 380, 8, 4],
  [1500, 1170, 7, 3], [436, 1112, 6, 3], [1880, 350, 6, 3], [2480, 1090, 8, 4], [3300, 1000, 9, 4], [600, 900, 6, 3], [2240, 560, 7, 3]];
const DRAGS = [[[3150, 860], [3100, 900], [3040, 960]], [[1952, 760], [1940, 800], [1900, 860]], [[760, 500], [740, 560], [700, 600]], [[3560, 330], [3500, 380], [3420, 400]]];
for (const [px, py, sx, sy] of POOLS) paint(px - 3 * sx, py - 3 * sy, px + 3 * sx, py + 3 * sy, (i, x, y) => { blood[i] = Math.max(blood[i], 255 * stain(x, y, px, py, sx * 1.3, sy * 1.3, 0.85, px + py)); });
for (const d of DRAGS) for (let k = 0; k < d.length - 1; k++) { const a = d[k], b = d[k + 1];
  paint(Math.min(a[0], b[0]) - 4, Math.min(a[1], b[1]) - 4, Math.max(a[0], b[0]) + 4, Math.max(a[1], b[1]) + 4, (i, x, y) => { const t = segDist(x, y, a, b); if (t < 2.4 && vn(x / 1.2, y / 1.2, 36 + k) > 0.3 + t / 6) blood[i] = Math.max(blood[i], 200); }); }

// ---------- the floor ----------
const E = { earth: L('#3a3128'), earthD: L('#1d1814'), dust: L('#6a6250'), moss: L('#344024'), mossL: L('#4e5a2c'), grav: L('#6c6556'), gravD: L('#3c372e'),
  mud: L('#2a221a'), mudD: L('#15110d'), straw: L('#6a5a34'), turned: L('#2e241a'), turnedL: L('#4a3a28'), ash: L('#4a4640') };
function floorAt(x, y) {
  const X = rx(x), Y = ry(y), xi = Math.floor(X), yi = Math.floor(Y);
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RH) return { alb: C.void, N: [0, 0, 1], noAO: true };
  const i = yi * RW + xi, k = kind[i];
  let c, Nn = [0, 0, 1], spec = 0.03, gloss = 12;
  if (k === 2) { const f = flags(x, y, 46, 34, 11); c = grime(f.c, x, y, 0.8); Nn = f.N; }
  else if (k === 1) {
    c = mix(E.grav, E.gravD, clamp(fbm(x / 9, y / 9, 3, 11) * 1.5 - 0.4));
    const p = h2(x * 0.5 | 0, y * 0.6 | 0, 12); if (p < 0.14) c = mul(c, 0.6); else if (p > 0.92) c = mul(c, 1.18);
    c = mix(c, E.earthD, clamp((fbm(x / 30, y / 24, 3, 13) - 0.5) * 2) * 0.6);
    Nn = [(h2(x | 0, y | 0, 14) - 0.5) * 0.5, (h2(x | 0, y | 0, 15) - 0.5) * 0.5, 1];
  } else if (k === 3) {
    c = mix(mix(E.mud, E.mudD, clamp(fbm(x / 14, y / 12, 3, 31) * 1.6 - 0.4)), E.earth, Math.max(clamp((0.45 - fbm(x / 60, y / 50, 3, 9)) * 4) * 0.7, clamp(1 - Math.min(X - CAMP[0], CAMP[2] - X, Y - CAMP[1], CAMP[3] - Y) / 70 + 0.3 * (fbm(x / 20, y / 20, 3, 8) - 0.5)))); // trodden, fading out at its edges
    if (h2(x | 0, y | 0, 32) > 0.985) c = mix(c, E.straw, 0.5); // straw trodden in
    const w = fbm(x / 24, y / 18, 3, 33); if (w > 0.62) { c = mul(c, 0.7); spec = 0.5 * clamp((w - 0.62) * 8); gloss = 70; } // puddles
  } else {
    const n = fbm(x / 26, y / 22, 4, 101);
    c = mix(E.earth, E.earthD, clamp(n * 1.7 - 0.35));
    const mid = clamp(1 - Math.abs(X - 2000) / 700), far = clamp((X - 2600) / 500);
    c = mix(c, E.dust, clamp((fbm(x / 60, y / 50, 3, 102) - 0.55 + mid * 0.25) * 2.5) * (0.5 + 0.2 * mid)); // bone dust, the middle's ossuaries
    c = mix(c, E.ash, far * clamp((fbm(x / 40, y / 34, 3, 103) - 0.4) * 2) * 0.6); // ash where the Order burns
    const m = fbm(x / 30, y / 26, 4, 33); if (m > 0.66) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? E.mossL : E.moss, clamp((m - 0.66) * 4) * 0.6);
    const e = 1, gx = vn((x + e) / 7, y / 7, 21) - vn((x - e) / 7, y / 7, 21), gy = vn(x / 7, (y + e) / 7, 21) - vn(x / 7, (y - e) / 7, 21);
    Nn = [-gx * 1.2, -gy * 1.2, 1];
    const p = h2(x * 0.4 | 0, y * 0.4 | 0, 17); if (p < 0.03) c = mul(c, 0.75); else if (p > 0.995) c = mix(c, E.dust, 0.4); // pebbles
    if (mound[i]) { const a = mound[i] / 255; c = mix(c, mix(E.turned, E.turnedL, vn(x / 3, y / 3, 23)), clamp(a * 1.5)); }
  }
  // a doorway's floor: steps going down into the dark
  for (const d of [...Object.values(DOORS), ...TUNNEL]) if (Math.abs(X - d.x) < d.w / 2 + 1 && Y < d.y + 1 && Y > d.y - RECESS - 40) {
    const t = clamp((d.y - Y) / (RECESS + (d.y < 100 ? 16 : 0))), step = Math.floor((d.y - Y) / 3) & 1;
    return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6, 3)), (step ? 0.75 : 1) * (1 - 0.9 * t)), N: step ? [0, 0.3, 1] : [0, 0, 1], spec: 0.03 };
  }
  // the chasm's lip: broken stone, paler, then the drop
  { const e = Math.abs(X - chasmX(Y)) - chasmW(Y); if (!crossing(Y) && e > -2 && e < 5) { c = mix(mix(C.stB, C.stC, vn(x / 3, y / 3, 41)), C.grime, clamp(e / 5) * 0.6); Nn = [0, 0, 1]; } }
  // the dark creeps in from the cliffs
  const dn = Y - north(X), ds = south(X) - Y, dw = Math.min(X - XW, XE - X, dn * 1.4, ds * 2); if (dw < 18) c = mix(c, E.earthD, (1 - Math.max(0, dw) / 18) * 0.6);
  if (blood[i]) { const a = blood[i] / 255; c = mix(c, mix(C.bloodD, C.blood, vn(x / 4, y / 4, 8) * 0.6), a); if (a > 0.3) { spec = 0.4 * a; gloss = 70; Nn = [0, 0, 1]; } }
  // bone splinters and teeth, more in the fields
  { const cx = Math.floor(x / 7), cy = Math.floor(y / 7);
    if (h2(cx, cy, 300) < (k === 0 ? 0.003 : 0.0015)) { const an = h2(cx, cy, 301) * 3.14, lx = x - (cx * 7 + 3.5), ly = y - (cy * 7 + 3.5), u = lx * Math.cos(an) + ly * Math.sin(an), v = -lx * Math.sin(an) + ly * Math.cos(an);
      if (Math.abs(v) < 0.6 && Math.abs(u) < 3) { c = mix(c, C.bone, 0.6); Nn = [0, 0, 1]; } } }
  return { alb: c, N: Nn, spec, gloss };
}

// ---------- models ----------
const BONE_TOP = L('#2a251e');
/** A wall of bones (room px rect), its top ragged; `end`: broken down toward its north (1) or south (-1) end, the breach. */
function boneWall(w) {
  const X0 = wx(w.x0), X1 = wx(w.x1), Y0 = wy(w.y0), Y1 = wy(w.y1), alongX = X1 - X0 > Y1 - Y0;
  const top = (x, y) => {
    let h = w.h - 7 * vn(x / 9 + y / 9, 0, 4);
    if (w.end) { const t = w.end > 0 ? (Y1 - y) / 120 : (y - Y0) / 120; h *= clamp(0.25 + t * 0.75 + 0.2 * (vn(y / 7, 0, 5) - 0.5)); }
    return h;
  };
  return {
    sdf: (x, y, z) => Math.max(sdBox(x, y, z, (X0 + X1) / 2, (Y0 + Y1) / 2, 100, (X1 - X0) / 2, (Y1 - Y0) / 2, 100, 1), (z - top(x, y)) * 0.6),
    mat: (m, x, y, z, nx, ny, nz) => {
      if (nz > 0.6) { // its top: skulls and long bones heaped, pale against the dark floor
        const v = vn(x / 2.2, y / 2.2, 7), gap = h2(x / 3 | 0, y / 3 | 0, 8) < 0.22;
        return { alb: gap ? mul(C.mortar, 0.6) : mix(C.boneD, C.bone, clamp(v * 1.4 - 0.2)), N: [(vn(x / 2, y / 2, 9) - 0.5) * 0.8, (vn(x / 2, y / 2, 10) - 0.5) * 0.8, 1], spec: 0.1, gloss: 20 };
      }
      const r = ossuary(alongX ? x : y * 0.6, z), c = mix(r.c, C.grime, clamp((vn(x / 9 + y / 9, z / 40, 2) - 0.4) * 2) * 0.5);
      return { alb: mul(z < 18 ? mix(c, C.moss, clamp(fbm(x / 14 + y / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 18)) : c, 0.9), N: alongX ? [0, Math.sign(ny) || 1, r.N[2]] : [Math.sign(nx) || 1, 0, r.N[2]], ao: r.ao, spec: 0.04 };
    },
    bounds: [X0 - 2, Y0 - 2, 0, X1 + 2, Y1 + 2, w.h + 4], step: 0.7,
  };
}
const inPointed = (u, z, hw, z0, r) => Math.abs(u) < hw && (z < z0 || Math.hypot(Math.abs(u) + (r - hw), z - z0) < r);
const archTop = (u, hw, z0, r) => z0 + Math.sqrt(Math.max(0, r * r - (Math.abs(u) + r - hw) ** 2));
/** A gatehouse round a shortcut's opening: two piers and a pointed arch over it, in ashlar, taller than the bone wall. */
function gatehouse(g) {
  const cx = wx((g.x0 + g.x1) / 2), cy = wy((g.y0 + g.y1) / 2), hw = wx(g.x1 - g.x0) / 2, dy = (wy(g.y1) - wy(g.y0)) / 2 + 3, Z = 236; // tall: the raised gate hides in it
  return {
    sdf: (x, y, z) => {
      const u = x - cx;
      let d = sdBox(x, y, z, cx, cy, Z / 2, hw + 18, dy, Z / 2, 1);
      d = Math.max(d, Math.min(hw - Math.abs(u), archTop(u, hw, 64, 40) - z)); // the opening
      d = Math.min(d, sdBox(x, y, z, cx, cy, Z + 3, hw + 22, dy + 3, 3, 1)); // cornice
      return d;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const u = x - cx;
      if (nz > 0.7) return { alb: mul(C.wallD, 0.6) };
      let r = ashlar(x, z, 18, 34, 7);
      if (Math.abs(u) < hw + 12 && z > 50 && !inPointed(u, z, hw, 64, 40) && inPointed(u, z, hw + 10, 64, 50)) r = { c: mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - 64, u) * 4) & 1) ? 0.8 : 1.05), N: [0, 1, 0] };
      return { alb: mul(mix(r.c, C.grime, clamp((vn(x / 9, z / 40, 3) - 0.4) * 2) * 0.6), clamp(1.15 - z / 260)), N: r.N, spec: 0.03, ao: 0.6 + 0.4 * clamp(z / 22) };
    },
    bounds: [cx - hw - 26, cy - dy - 6, 0, cx + hw + 26, cy + dy + 6, Z + 8], step: 0.8,
  };
}
/** A facade round a door (room px footprint, its door): a crypt's squat front, a ruined church's gable, a gatehouse of
 *  bones, a chapel's portal; the doorway goes RECESS deep into it, onto steps sinking into the dark. */
function facade(f) {
  const d = DOORS[f.door], X0 = wx(f.x0), X1 = wx(f.x1), Y0 = wy(f.y0), YF = wy(d.y), cx = wx(d.x), hw = d.w, Hh = f.h;
  const dz0 = f.kind === 'church' ? 120 : f.kind === 'chapel' ? 110 : 70, dr = hw * 1.2, YR = wy(d.y - RECESS);
  const half = (X1 - X0) / 2, yc = (Y0 + YF) / 2, hd = (YF - Y0) / 2;
  const roof = (x, y) => { // the roof's height over (x, y): a ridge along x for the crypt, along y for the church and the chapel
    const u = Math.abs(x - (X0 + X1) / 2);
    if (f.kind === 'crypt') return Hh + 44 * (1 - Math.abs(y - yc) / hd);
    if (f.kind === 'church') return Hh + 70 * (1 - u / half) - (x > X0 + half * 1.3 ? 50 * clamp((x - X0 - half * 1.3) / 50) * (0.6 + 0.4 * vn(x / 9, y / 9, 3)) : 0); // fallen in on its east side
    if (f.kind === 'chapel') return Hh + 80 * clamp(1 - u / half) + (u < 14 && y > YF - 34 ? 60 : 0); // and its bell-cote over the door
    return Hh - 8 * vn(x / 9, 0, 3);
  };
  const door = (x, y, z) => { const u = x - cx; return Math.min(hw - Math.abs(u), z - (y < YF - 4 ? -(YF - y) * 0.6 : 0), archTop(u, hw, dz0, dr) - z, y - YR); };
  return {
    sdf: (x, y, z) => {
      let s = Math.max(sdBox(x, y, z, (X0 + X1) / 2, yc, Hh, half, hd, Hh + 80, 1), (z - roof(x, y)) * 0.6);
      if (f.kind === 'church' || f.kind === 'chapel') for (const bx of [X0 + 10, X1 - 10]) s = Math.min(s, sdBox(x, y, z, bx, YF - 6, Hh * 0.6, 10, 12, Hh * 0.6, 1)); // buttresses
      if (f.kind === 'crypt') for (const bx of [cx - hw - 16, cx + hw + 16]) s = Math.min(s, sdBox(x, y, z, bx, YF + 3, 52, 7, 7, 52, 1)); // pilasters
      return Math.max(s, door(x, y, z));
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const u = x - cx;
      if (Math.abs(u) < hw + 1 && y < YF - 2 && z < archTop(u, hw, dz0, dr) + 1) { // inside the doorway: steps down into the dark
        const k = clamp((YF - y) / (YF - YR));
        return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6 + z / 6, 3)), 0.9 * (1 - k * 0.85)), spec: 0.03, ao: 1 - k * 0.6 };
      }
      if (nz > 0.25 && z > Hh - 2 && ny < 0.9) { // the roof: stone slates, mossy (the wall of bones: its ragged top)
        if (f.kind === 'bones') return { alb: mix(BONE_TOP, C.bone, clamp(vn(x / 3, y / 3, 7) - 0.62) * 1.5), spec: 0.03 };
        const t = Math.floor((x + 400) / 9), r = Math.floor((y * 0.6 + z) / 7);
        let c = mix(mix(C.stC, C.wallD, h2(t, r, f.x0)), C.moss, clamp(vn(x / 20, y / 20, f.x0) - 0.5) * 1.4);
        if (((x + 400) % 9) < 1 || ((y * 0.6 + z) % 7) < 0.8) c = C.mortar;
        return { alb: mul(c, 0.9), spec: 0.04 };
      }
      let r = f.kind === 'bones' ? ossuary(x, z) : ashlar(x, z, f.kind === 'church' ? 24 : 20, f.kind === 'church' ? 46 : 38, 5 + f.x0 % 7);
      // voussoirs round the door
      if (Math.abs(u) < hw + 12 && z > dz0 - 10 && !inPointed(u, z, hw, dz0, dr) && inPointed(u, z, hw + 10, dz0, dr + 10))
        r = { c: f.kind === 'bones' ? mix(C.bone, C.boneD, 0.4) : mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - dz0, u) * 5) & 1) ? 0.8 : 1.05), N: [0, 1, 0] };
      if (f.kind === 'church') { const v = Math.hypot(u, z - (Hh - 30)); if (v < 30) r = { c: v < 26 && (v < 4 || Math.abs(((Math.atan2(z - Hh + 30, u) / Math.PI) * 6 + 12) % 1 - 0.5) > 0.15) ? mul(C.void, 2) : mix(C.stB, C.wall, 0.3), N: [0, 1, 0] }; } // the rose, dark
      if (f.kind === 'chapel' && Math.abs(u) < 7 && z > Hh + 70 && z < Hh + 116) r = { c: mul(C.void, 2), N: [0, 1, 0] }; // the bell-cote's opening
      if (f.kind === 'crypt' && Math.abs(z - (Hh - 6)) < 5) r = { c: mul(C.stB, 1.1), N: [0, 1, 0.4] }; // the cornice
      let c = mix(r.c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.6);
      if (z < 26) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 26));
      if (z < 40 && vn(x / 5, z / 12, 9) > 0.64 && Math.abs(u) < hw + 30) c = mix(c, C.bloodD, 0.7); // smears by the door
      return { alb: mul(c, clamp(1.15 - z / 340)), N: r.N, spec: 0.03, gloss: 10, ao: (r.ao || 1) * (0.55 + 0.45 * clamp(z / 22)) };
    },
    bounds: [X0 - 30, Y0 - 4, 0, X1 + 30, YF + 30, Hh + 140], step: 0.75,
  };
}
/** A small mausoleum: a stone house with a pitched roof along x, a pediment over its shut door, room px w x d. */
function mausoleum(w, d, seed) {
  const hw = wx(w) / 2, hd = wy(d) / 2, Hb = 92, Hr = 40;
  return {
    sdf: (x, y, z) => {
      let s = sdBox(x, y, z, 0, 0, Hb / 2, hw - 4, hd - 4, Hb / 2, 1);
      s = Math.min(s, Math.max(sdBox(x, y, z, 0, 0, Hb + Hr / 2, hw, hd, Hr / 2 + 2, 1), (z - Hb - Hr * (1 - Math.abs(y) / hd)) * 0.7)); // roof
      s = Math.min(s, sdBox(x, y, z, 0, 0, 4, hw + 2, hd + 2, 4, 1)); // plinth
      s = Math.max(s, -sdBox(x, y, z, 0, hd - 2, 32, 14, 4, 32)); // the door's recess
      return s - 0.5 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5);
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      if (z > Hb + 1 && nz > 0.3) { const t = Math.floor((x + 400) / 9); let c = mix(mix(C.stC, C.wallD, h2(t, Math.floor(z / 7), seed)), C.moss, clamp(vn(x / 20, y / 20, seed) - 0.5) * 1.4); if (((x + 400) % 9) < 1) c = C.mortar; return { alb: c, spec: 0.03 }; } // stone slates
      if (Math.abs(x) < 14 && y > hd - 7 && z < 64) return { alb: mix(C.iron, C.rust, vn3(x * 0.3, y, z * 0.3, seed)), spec: 0.3, gloss: 30 }; // the iron door, shut
      return { alb: mix(stone3(x, y, z, C.stB, seed), C.grime, clamp((vn(x / 9 + y / 7, z / 40, 2) - 0.4) * 2) * 0.6), spec: 0.04 };
    },
    bounds: [-hw - 4, -hd - 4, 0, hw + 4, hd + 4, Hb + Hr + 6], step: 0.75,
  };
}
/** A column of rock from the floor up into the vault, its foot spread and broken. */
function rockColumn(r, seed) {
  const R0 = wx(r), Hh = 150 + (seed % 5) * 22; // a stump of the rock that held the vault, broken off, its top jagged
  return {
    sdf: (x, y, z) => { const rad = R0 * (0.75 + 0.35 * Math.exp(-z / 40) + 0.12 * Math.sin(z / 50 + seed)) * (0.85 + 0.3 * vn3(x / 14, y / 14, z / 24, seed)), top = Hh - 26 * vn(x / 9 + seed, y / 9, 3);
      return Math.max((Math.hypot(x, y * 1.1) - rad) * 0.55, (z - top) * 0.5); },
    mat: (m, x, y, z, nx, ny, nz) => { const n = fbm3(x * 0.06, y * 0.06, z * 0.03, 3, seed); let c = mix(L('#3a342c'), L('#17140f'), clamp(n * 1.6 - 0.3)); if (nz > 0.6) c = mix(c, C.stC, 0.3); // its broken top, rubble
      c = mix(c, C.moss, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed + 3) - 0.6) * (z < 30 ? 1.5 : 0.4)); return { alb: c, spec: 0.05, gloss: 14 }; },
    bounds: [-R0 * 1.4 - 4, -R0 * 1.4 - 4, 0, R0 * 1.4 + 4, R0 * 1.4 + 4, Hh + 4], step: 0.6,
  };
}
/** The north cliff and the arches cut into it: the refuge's stairs climbing into the dark, the gallery's two mouths. */
function cliff() {
  const hw = DOORS.refuge.w, YD = wy(92), R0 = hw * 1.2;
  const arch = (x) => ARCHES.reduce((b, a) => (Math.abs(x - wx(a.x)) < Math.abs(x - wx(b.x)) ? a : b));
  return {
    sdf: (x, y, z) => {
      const X = rx(x), face = wy(north(X)) + 10 * (fbm(x / 22, z / 16, 3, 41) - 0.5) - z * 0.06;
      let s = (y - face) * 0.55;
      const u = x - wx(arch(x).x), inArch = Math.min(hw - Math.abs(u), archTop(u, hw, 60, R0) - z, y - (YD - 90));
      if (Math.abs(u) < hw + 30) { s = Math.min(s, Math.max(sdBox(u, y, z, 0, YD - 3, 70, hw + 22, 6, 70, 1), -inArch)); s = Math.max(s, inArch); }
      return s;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const a = arch(x), u = x - wx(a.x);
      if (Math.abs(u) < hw + 1 && y < YD - 4 && z < archTop(u, hw, 60, R0) + 1) { // inside: the refuge's stairs, or the gallery, into the dark
        const k = clamp((YD - y) / 90), step = a.kind === 'stairs' && Math.floor((YD - y) / 9) & 1;
        return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6 + z / 9, 3)), (step ? 0.8 : 1) * (1 - k * 0.92)), spec: 0.03 };
      }
      if (Math.abs(u) < hw + 23 && y > YD - 12 && z < 142) { // the arch's masonry
        let r = ashlar(x, z, 18, 30, 3);
        if (z > 50 && !inPointed(u, z, hw, 60, R0)) r = { c: mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - 60, u) * 4) & 1) ? 0.8 : 1.05), N: [0, 1, 0] };
        if (a.kind === 'gallery' && z > 112 && z < 128 && Math.abs(u) < 26) r = { c: mix(C.bone, C.boneD, vn(x / 2, z / 2, 5)), N: [0, 1, 0] }; // skulls set over the gallery's mouths
        return { alb: mix(r.c, C.grime, 0.3), N: r.N, spec: 0.03 };
      }
      const n = fbm3(x * 0.04, y * 0.04, z * 0.05, 4, 51);
      let c = mix(L('#3c352c'), L('#14110d'), clamp(n * 1.7 - 0.35));
      c = mix(c, L('#1a2014'), clamp((vn3(x * 0.02, 0, z * 0.08, 52) - 0.5) * 3) * 0.6); // seeping damp
      if (z < 30) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 53) - 0.45) * 2 * (1 - z / 30));
      return { alb: mul(c, clamp(1.1 - z / 500)), spec: 0.06, gloss: 16 };
    },
    bounds: [0, -40, 0, W, wy(110), VAULT + 20], step: 0.7,
  };
}
const rimMat = (m, x, y, z, nx, ny, nz) => { const n = fbm3(x * 0.05, y * 0.05, z * 0.05, 3, 61); return { alb: mul(mix(L('#2a251f'), L('#0e0c0a'), clamp(n * 1.6 - 0.3)), z > 26 ? 0.15 : 0.7), spec: 0.02 }; }; // its top fades into the dark
/** The rock round the cavern but the north cliff: west, east and south rims, rising low past the floor's edge. */
function rim(x0, x1, y0, y1, out) {
  return { sdf: (x, y, z) => (z - Math.min(30, Math.max(-4, out(rx(x), ry(y)) * 3))) * 0.3, mat: rimMat, bounds: [wx(x0), wy(y0), -2, wx(x1), wy(y1), 34], step: 0.9 };
}
/** A bell tent of the Order: canvas round a pole, its flap open on the dark toward the south, the sun of the Order on it. */
function tent(seed) {
  const R0 = 46, Hh = 84;
  return {
    sdf: (x, y, z) => { const r = Math.hypot(x, y), k = R0 / Hh; let d = (r - R0 * (1 - z / Hh) * (0.92 + 0.08 * Math.cos(Math.atan2(y, x) * 8))) / Math.hypot(1, k); d = Math.max(d, -z); // the cone, its folds
      return Math.max(d, -Math.max(Math.abs(x) - 12 * (1 - z / 56), -y + 10, z - 56)); }, // the open flap
    mat: (m, x, y, z, nx, ny, nz) => {
      const a = Math.atan2(y, x), r = Math.hypot(x, y);
      if (r < R0 * (1 - z / Hh) - 2) return { alb: mul(C.void, 2) }; // inside, dark
      let c = mix(L('#6a5c44'), L('#2e271d'), clamp(fbm3(x * 0.08, y * 0.08, z * 0.08, 3, seed) * 1.5 - 0.3));
      if (((a * 8 / Math.PI + 16) % 2) < 0.12) c = mul(c, 0.6); // seams
      c = mix(c, C.grime, clamp(1 - z / 24) * 0.6);
      const sun = Math.hypot(x - 0, z - 40) < 9 && y > 0 && Math.abs(x) > 14; if (sun) c = mix(L('#7a3416'), L('#b07a26'), 0.4);
      if (vn3(x * 0.1, y * 0.1, z * 0.1, seed + 2) > 0.72) c = mix(c, C.bloodD, 0.5);
      return { alb: c, wrap: 0.4, spec: 0.02 };
    },
    bounds: [-R0 - 4, -R0 - 4, 0, R0 + 4, R0 + 4, Hh + 2], step: 0.6,
  };
}
/** The camp's pyre: coffin boards stacked crosswise, bones in the embers, burning. */
function pyre() {
  const boards = [...Array(9)].map((_, k) => ({ a: (k * 1.1) % Math.PI, z: 4 + k * 3.2, l: 34 - k * 2 }));
  return {
    sdf: (x, y, z) => { let d = Math.max(Math.hypot(x, y * 1.3) - 30, z - 6, -z); for (const b of boards) { const c = Math.cos(b.a), s = Math.sin(b.a); d = Math.min(d, sdBox(c * x + s * y, -s * x + c * y, z, 0, 0, b.z, b.l, 3, 1.6, 0.5)); } return d; },
    mat: (m, x, y, z) => { const ember = z < 8 || vn3(x * 0.3, y * 0.3, z * 0.3, 4) > 0.62; return ember ? { alb: [0.04, 0.015, 0.01], emi: [1.4, 0.35, 0.05].map((v) => v * (0.5 + vn3(x * 0.2, y * 0.2, z * 0.2, 5))), noAO: true } : { alb: mix(C.woodD, L('#120d09'), vn3(x * 0.2, y * 0.2, z, 6)), spec: 0.05 }; },
    bounds: [-40, -40, 0, 40, 40, 36], step: 0.6,
  };
}
const stake = (h, seed) => ({ sdf: (x, y, z) => Math.max(Math.hypot(x, y) - 3.2 * clamp((h - z) / 10, 0.2, 1), -z, z - h), mat: (m, x, y, z) => ({ alb: mix(C.wood, C.woodD, vn3(x, y, z * 0.2, seed)) }), bounds: [-4, -4, 0, 4, 4, h + 1], step: 0.7 });
/** The Order's banner on a pole: a dull sun on red, torn at the foot. */
function banner(seed) {
  return {
    sdf: (x, y, z) => Math.min(Math.hypot(x, y) - 1.6 + (z > 150 ? 9 : 0), Math.max(sdBox(x, y, z, 12, 0, 110, 12, 0.8 + 0.3 * Math.sin(z * 0.2), 34), 80 + 8 * vn(x / 3, 0, seed) - z)),
    mat: (m, x, y, z) => { if (Math.hypot(x, y) < 2.4) return { alb: C.wood }; let c = mix(L('#4a0c10'), L('#26070a'), clamp(fbm(x / 4, z / 4, 3, seed) * 1.6 - 0.3)); const r = Math.hypot(x - 12, z - 120); if (r < 6 || (r < 9 && Math.cos(Math.atan2(z - 120, x - 12) * 8) > 0.4)) c = mix(L('#6a5228'), L('#3a2a12'), vn(x, z, 3)); return { alb: c, wrap: 0.4 }; },
    bounds: [-3, -3, 0, 26, 3, 160], step: 0.6,
  };
}
const pole = (h) => ({ sdf: (x, y, z) => Math.min(Math.max(Math.hypot(x, y) - 1.5, z - h), sdBox(x, y, z, 0, 0, h + 4, 3.5, 3.5, 5, 1)), mat: (m, x, y, z) => (z > h - 2 ? { alb: mul(L('#a8ac5c'), 0.2), emi: mul(L('#a8ac5c'), 0.5), noAO: true } : ironMat(x, y, z)), bounds: [-5, -5, 0, 5, 5, h + 10], step: 0.7 });
/** The winch that raises a shortcut's portcullis: an iron wheel on a post. */
const lever = () => ({ sdf: (x, y, z) => Math.min(Math.max(Math.hypot(x, y) - 2.5, z - 40), Math.max(Math.abs(Math.hypot(x, z - 40) - 11) - 1.6, Math.abs(y) - 1.5), Math.max(Math.hypot(x, z - 40) - 2.5, Math.abs(y) - 3)), mat: (m, x, y, z) => ironMat(x, y, z), bounds: [-14, -4, 0, 14, 4, 54], step: 0.7 });
/** A sarcophagus on its plinth, the lid carved with a recumbent shape, cracked. */
function sarcophagus(seed) {
  return { sdf: (x, y, z) => { let d = sdBox(x, y, z, 0, 0, 14, 38, 18, 14, 1.5); d = Math.min(d, sdBox(x, y, z, 0, 0, 30, 40, 20, 3, 1.2)); d = Math.min(d, sdEll(x, y, z, 0, 0, 34, 28, 9, 4)); d = Math.min(d, sdEll(x, y, z, 30, 0, 35, 6, 6, 5)); return Math.max(d, -(Math.abs(x + 8 + 3 * Math.sin(y * 0.5)) - 0.8)) - 0.4 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5); },
    mat: (m, x, y, z) => ({ alb: mix(stone3(x, y, z, mul(C.stB, 1.2), seed), C.moss, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, seed + 1) - 0.55) * 1.4), spec: 0.04 }), bounds: [-42, -22, 0, 42, 22, 42], step: 0.7 };
}

// ---------- the scene ----------
const S = stage();
const { add, light } = S;
add('cliff', cliff(), [0, 0, 0]);
add('rim', rim(0, XW + 30, 0, RH, (X) => XW - X), [0, 0, 0]);
add('rim', rim(XE - 30, RW, 0, RH, (X) => X - XE), [0, 0, 0]);
for (let x = 0; x < RW; x += 480) add('rim', rim(x, x + 480, 1290, RH, (X, Y) => Y - south(X)), [0, 0, 0]);
for (const w of WALLS) add('bones', boneWall(w), [0, 0, 0]);
for (const f of FACADES) add('facade', facade(f), [0, 0, 0]);
// the gates, open in the bake (the game draws them shut over it: zone.gen.mjs gateFrames()); `ports` for raise()
const ports = GATES.map((g) => { if (!g.arch) add('gatehouse', gatehouse(g), [0, 0, 0]); return add('portcullis', portcullis(wx(g.x1 - g.x0) + 6, 110), [wx((g.x0 + g.x1) / 2), wy((g.y0 + g.y1) / 2), -400]); });
for (const [x0, y0, x1, y1] of DECKS) for (const y of [y0 + 2, y1 - 2]) add('parapet', block(wx(x0), -5, 0, wx(x1), 5, 22, (m, x, yy, z) => ({ alb: mul(stone3(x, yy, z, C.stB, 7), 1.2), spec: 0.04 }), 1.5), [0, wy(y), 0]);
for (const [x, y, w, d] of MAUS) add('mausoleum', mausoleum(w, d, x % 97), [wx(x), wy(y - d / 2), 0]);
for (const [x, y, r] of COLS) add('column', rockColumn(r, x % 13), [wx(x), wy(y - r * 0.3), 0]);
for (const [x, y] of TENTS) add('tent', tent(x % 11), [wx(x), wy(y - 14), 0]);
for (const run of PALISADE) { const [[a, b], [c, d]] = run, n = Math.round(Math.hypot(c - a, d - b) / 7); for (let k = 0; k <= n; k++) add('stake', stake(46 + 10 * h2(a + k, b, 3), k), [wx(a + (c - a) * k / n), wy(b + (d - b) * k / n), 0]); }
for (const [x, y] of CRATES) add('crate', chest(x % 7), [wx(x), wy(y - 4), 0], 0.1);
for (const g of GRAVES) {
  const P = [wx(g.x), wy(g.y - g.h / 2), 0], a = (h2(g.seed, 0, 3) - 0.5) * 0.3;
  if (g.kind === 'cross') add('grave', cross(38 + (g.seed % 5) * 2), P, a);
  else if (g.kind === 'stele') add('grave', stele(30 + (g.seed % 4) * 2), P, a);
  else if (g.kind === 'lying') add('grave', cross(36, true), P, Math.PI / 2 + a);
  else add('grave', sarcophagus(g.seed), P, a * 0.3);
}
for (const o of PROPS) {
  const P = [wx(o.x), wy(o.y - o.h / 2), 0];
  if (o.kind === 'statue') add('statue', statue(o.x % 5), P, 0);
  else if (o.kind === 'sarc') add('sarc', sarcophagus(o.x % 17), P, 0);
  else if (o.kind === 'coffin') add('coffin', oldCoffin(o.x % 7, 1), P, 0);
  else if (o.kind === 'chest') add('chest', chest(o.x % 5), P, 0);
  else if (o.kind === 'pillar') add('pillar', pillar(40, 30, 150), P, 0);
  else if (o.kind === 'stump') add('stump', broken(pillar(40, 30, wz(o.tall) + 30), (x, y) => wz(o.tall) - 10 + x * 0.3 + 9 * vn(x / 5, y / 5, o.x)), P, 0);
  else if (o.kind === 'trophy') add('trophy', trophyPike(o.x % 5), P, 0);
  else if (o.kind === 'rack') add('rack', weaponRack(), P, 0);
  else if (o.kind === 'banner') add('banner', banner(o.x % 9), P, 0);
  else if (o.kind === 'lever') add('lever', lever(), P, 0);
  else if (o.kind === 'rubble') add('rubble', rubble(o.x % 31, wx(o.r) * 0.8, 18), [wx(o.x), wy(o.y - o.h), 0], h2(o.x, 0, 3) * 6);
}
for (const [x, y] of BRAZIERS) add('brazier', brazier2(true), [wx(x), wy(y - 4), 0]);
add('pyre', pyre(), [wx(PYRE[0]), wy(PYRE[1] - 6), 0]);
for (const [x, y] of LANTERNS) add('lantern', pole(120), [wx(x), wy(y), 0]);
{ const out = [];
  for (const [x, y, n] of CANDLES) for (let k = 0; k < n; k++) out.push([wx(x + k * 3 + 1), wy(y) + (k % 2) * 4, 0, 4 + h2(x, k, 3) * 9, 1.2 + h2(x, k, 4) * 0.3, (h2(x, k, 5) - 0.5) * 0.8, 0]);
  add('candles', candles2(out), [0, 0, 0]); }
for (let k = 0; k < 60; k++) { const x = 60 + R() * (RW - 120), y = 120 + R() * (RH - 200); if (!taken(x, y, 4) && clear(x | 0, y | 0, 2)) add('skull', skull(), [wx(x), wy(y), 0], R() * 6); }
for (let k = 0; k < 24; k++) { const x = 60 + R() * (RW - 120), y = 120 + R() * (RH - 200); if (!taken(x, y, 12) && clear(x | 0, y | 0, 6)) add('bones', pitBones(k + 3), [wx(x), wy(y), 0], R() * 6); }
// The vault, never seen: it keeps the moon and the Dawn out but through its cracks.
const MOON = (() => { const d = [-0.42, -0.3, 0.86], l = Math.hypot(...d); return d.map((v) => v / l); })();
const SUN = (() => { const d = [0.2, 0.36, 0.91], l = Math.hypot(...d); return d.map((v) => v / l); })();
const hole = (dir, [x, y, a, b = a]) => { const t = VAULT / dir[2]; return [wx(x) + dir[0] * t, wy(y) + dir[1] * t, wx(a), wy(b)]; }; // a floor patch's crack in the vault
const MOONH = MOONHOLES.map((m) => hole(MOON, m)), SUNH = SUNHOLES.map((s) => hole(SUN, s));
const crack = (x, y, ox, oy, a, b) => { const dx = (x - ox) / a, dy = (y - oy) / b, an = Math.atan2(dy, dx); return 1 - Math.hypot(dx, dy) / (0.7 + 0.6 * vn(Math.cos(an) * 1.6 + ox / 50, Math.sin(an) * 1.6 + oy / 50, 77)); }; // ragged
// Two vaults, never seen, one each light from the sky sees: the moon's cracks for the moon, the breach for the Dawn.
const vault = (holes) => ({ sdf: (x, y, z) => Math.max(Math.abs(z - VAULT - 10) - 10, Math.max(...holes.map(([ox, oy, a, b = a]) => crack(x, y, ox, oy, a, b))) * 60 + 6 * (vn(x / 9, y / 9, 71) - 0.5)),
  mat: () => ({ alb: C.void }), bounds: [-400, -400, VAULT - 2, W + 400, wy(RH) + 400, VAULT + 22], step: 0.8 });
add('vault-moon', vault(MOONH), [0, 0, 0], 0, { ghost: true });
add('vault-sun', vault(SUNH), [0, 0, 0], 0, { ghost: true });

// ---------- lights ----------
const MOONC = L('#9ab0be'), FIRE = L('#e07a30'), CANDLE = L('#d8b070'), SUNC = L('#fbf4bc'), ORDER = L('#a8ac5c'), FAR = 1e5;
light({ name: 'moon', p: [W / 2 + MOON[0] * FAR, wy(RH / 2) + MOON[1] * FAR, MOON[2] * FAR], c: MOONC, I: 0.75, r0: 1e9, R: 1e12, soft: 90, pad: 10, skip: ['vault-sun'] });
light({ name: 'sun', mask: true, p: [W / 2 + SUN[0] * FAR, wy(RH / 2) + SUN[1] * FAR, SUN[2] * FAR], c: SUNC, I: 4.6, r0: 1e9, R: 1e12, soft: 120, pad: 10, skip: ['vault-moon'] });
// the cold that the cracks let in: a faint fill from above and from the south, so shapes read in the dark
light({ p: [W / 2 + 0.2 * FAR, wy(RH / 2) + 0.5 * FAR, 0.85 * FAR], c: MOONC, I: 0.3, r0: 1e9, R: 1e12, noShadow: true });
for (const [x, y] of BRAZIERS) light({ p: [wx(x), wy(y - 4), 48], c: FIRE, I: 4, r0: 40, R: 420, soft: 6, pad: 8, haze: 0.02, hazeR: 7, skip: ['brazier'] });
light({ p: [wx(PYRE[0]), wy(PYRE[1] - 6), 40], c: FIRE, I: 9, r0: 60, R: 700, soft: 10, pad: 14, haze: 0.03, hazeR: 14, skip: ['pyre'] });
for (const [x, y, n] of CANDLES) light({ p: [wx(x + n * 1.5), wy(y) + 2, 16], c: CANDLE, I: 0.8 + 0.4 * n, r0: 20, R: 220, soft: 4, pad: 3, haze: 0.012, hazeR: 3, skip: ['candles'] });
for (const [x, y] of LANTERNS) light({ p: [wx(x), wy(y), 124], c: ORDER, I: 2.2, r0: 30, R: 300, soft: 6, pad: 6, haze: 0.012, hazeR: 5, skip: ['lantern'] });
for (const d of Object.values(DOORS)) light({ p: [wx(d.x), wy(d.y - RECESS - 6), 26], c: CANDLE, I: 1.4, r0: 16, R: 160, soft: 4, pad: 4 }); // a glow deep in each doorway
for (const [x, y] of MOONHOLES) light({ p: [wx(x), wy(y), 30], c: MOONC, I: 0.6, r0: 60, R: 260, noShadow: true, noEnv: true }); // what a moonlit patch throws back

const env = ground(floorAt, (X, Y) => pit(X, Y, 1));
const SC = { W, H, cam, off: 0, offX: 0, objects: S.objects, lights: S.lights, env, envShadow: pitShadow((X, Y) => pit(X, Y, 1)), ambient: L('#3a4450').map((v) => v * 0.07) };
export async function scene() { return SC; }
/** Gate `k` of GATES let down to `d` room px above its sill (d >= its height: raised out of sight). */
export function raise(sc, k, d) { ports[k].pos[2] = d >= GATE_RISE ? -400 : wz(d); }
export const GATE_RISE = 44; // room px: a gate's travel up into its gatehouse, its frames 4 px apart

/** The air of the moon's and the Dawn's shafts, along each pixel's sight line through the cracks; added to a chunk's
 *  render (`x0`, `y0`: its first texel in the zone) before it is baked. */
export function finish(img, x0, y0) {
  const { W: w, H: h } = img, T0 = 4000;
  // each crack: its middle on the vault, radii, the light's way, colour, strength; and where its shaft lies on screen
  const shafts = [...MOONH.map((o) => [o[0], o[1], o[2], o[2], MOON, MOONC, 0.0012]), ...SUNH.map((o) => [...o, SUN, SUNC, 0.004])].map((s) => {
    const [ox, oy, a, b, dir] = s, t = VAULT / dir[2];
    return [...s, [ox, oy * SN - VAULT * CS], [ox - dir[0] * t, (oy - dir[1] * t) * SN], Math.max(a, b * SN) + 24];
  });
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = py * w + px, t = Math.min(img.depth[i], 1e5), sy = y0 + py + 0.5, X = x0 + px + 0.5;
    const P = [X, sy * SN + CS * T0 - CS * t, -sy * CS + SN * T0 - SN * t];
    if (P[2] > VAULT) continue;
    for (const [ox, oy, a, b, dir, col, k0, top, foot, reach] of shafts) {
      if (segDist(X, sy, top, foot) > reach) continue;
      let k = 0;
      for (let s = 0; P[2] + s * SN < VAULT; s += 3) {
        const qx = P[0], qy = P[1] + s * CS, qz = P[2] + s * SN, u = (VAULT - qz) / dir[2];
        const e = 1 - Math.hypot((qx + dir[0] * u - ox) / a, (qy + dir[1] * u - oy) / b);
        if (e > 0) k += Math.min(1, e * 6) * (0.4 + 0.6 * (1 - qz / VAULT)) * clamp(fbm(qx / 26, qz / 18 + qy / 40, 3, 7) * 2.4 - 0.7);
      }
      if (k > 0) for (let c = 0; c < 3; c++) img.out[i * 3 + c] += col[c] * k * k0;
    }
  }
}
export const PAL = [...CRYPT_PAL, ...[['#b8a466', '#d8c886', '#ece0a8', '#f8f0cc', '#fffbe8']].flatMap((s) => s.map((c) => hex(c).map((v) => v * 255)))];
export const POST = { exposure: 3.3, vignette: 0.2, desat: 0.18, grain: 0.012, dither: 0.02 };
export const GRAVE_COUNT = GRAVES.length;
