// La nécropole (docs/extraction.md §4), the first open zone round the refuge: one cavern 8 x 5 screens wide (3840 x 1350
// room px), baked chunk by chunk by tools/art/zone.gen.mjs in the « grand pixel » style of the rooms (the mockup engine,
// the crypts' vocabulary). Its plan is the single source of truth for the art and the game: the cavern's outline, the
// chasm and its two crossings, the walls of bones, the four doors into the painted rooms (and the refuge's stairs), the
// two shortcuts' gates, the graves, mausoleums, the Order's camp, the breach where the Dawn falls; collisions are drawn
// from the same shapes (zone.gen.mjs walk()).
// World units as in common.mjs: x east, y south, z up; a room px of floor is 2 world units across and 2 / SN deep.
import { sdBox, sdRC, sdEll, clamp, vn, fbm, vn3, fbm3, h2, L, hex, mix, mul, mulberry32 } from '../maquettes/hub3/lib.mjs';
import { pillar, portcullis, skull, wristCorpse, pitBodies, slumped, cage } from '../maquettes/grand/cast.mjs';
import { oldCoffin } from '../maquettes/hub3/props2.mjs';
import { candles2, brazier2, rubble, statue, chest, trophyPike, weaponRack } from '../maquettes/hub3/props3.mjs';
import { pitBones } from '../maquettes/hub/props.mjs';
import { cross, stele, burnt, exhumed } from '../maquettes/cloitre/props.mjs';
import { cam, SN, CS, wx, wy, wz, rx, ry, C, broken, scaled, block, stage, flags, grime, ashlar, ossuary, stain, segDist, stone3, ironMat } from './common.mjs';
import { ground, pitShadow, PAL as CRYPT_PAL } from './crypts.mjs';
import { heap, heapMat, boneWall, slate, inPointed, archTop, gatehouse, mausoleum, rockColumn, rimMat, charred, stake, banner, pole, lever, sarcophagus, crackOver, vaultOf, shafts } from './zone-kit.mjs';

export const RW = 3840, RH = 1350, SW = 480, SH = 270; // the zone; a screen, the chunk the game loads
export const ABOUT = 'La nécropole';
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
/** The chasm's drawn half-width at room px (X, Y): ragged, a few px either side of its collision edge (the lip). */
const chasmLip = (X, Y) => chasmW(Y) + 2.5 - 7 * fbm(X / 9 + 3, Y / 13, 3, 7) + 1.2 * (vn(X / 3, Y / 3, 5) - 0.5);
/** A hole in the floor at room px (X, Y) (`edge`: the drawn rim's wobble, none for collisions). */
export function pit(X, Y, edge = 0) {
  if (!crossing(Y) && Math.abs(X - chasmX(Y)) < (edge ? chasmLip(X, Y) : chasmW(Y))) return true;
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
  // north-south: thick, battered both sides so the camera (looking north) sees their skulls
  { x0: 2598, y0: 60, x1: 2642, y1: 292, h: 70, end: 1 }, { x0: 2598, y0: 428, x1: 2642, y1: 1340, h: 70, end: -1 },
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
  [1700, 600, 60, 32], [2470, 300, 56, 30], [1610, 1268, 60, 30], [2300, 864, 56, 30], [3700, 700, 60, 32], [3420, 1190, 64, 34], [3020, 266, 56, 30],
  [1890, 1022, 56, 30], [2010, 995, 56, 30], [1930, 1120, 60, 30], [2060, 1092, 56, 30], // the middle's south band: an alley along the path
  [2800, 580, 56, 30]]; // cover from the camp's crossbows past the breach
// Stumps of rock columns, broken: x, y (their foot's middle), r.
const COLS = [[1180, 1250, 22], [660, 300, 20], [2010, 196, 24], [3300, 560, 22], [3772, 420, 18], [2930, 1240, 20], [80, 520, 20],
  [2330, 1130, 22], [1700, 880, 20], [2960, 330, 20]];
// The Order's camp: tents (x, y front middle), its palisade (stakes along these runs), crates, racks, trophies, a cage.
const TENTS = [[3010, 800], [3250, 790], [3110, 990]];
// closed but three ways in: north (x 3080-3150), east (y 900-960), south-west where the path runs (x 2930, y 900-1062)
const PALISADE = [[[2940, 680], [3080, 680]], [[3150, 680], [3370, 680]], [[3384, 700], [3384, 900]], [[3384, 960], [3384, 1062]],
  [[2930, 690], [2930, 900]], [[3000, 1062], [3384, 1062]]];
// Stakes where the Order burns what it catches, charred (the far side).
const STAKES = [[2852, 770], [2874, 806], [3480, 1012], [3504, 1040], [2780, 1172]];
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
// The breach: one wide patch over the whole gap in the wall, so crossing it in the open burns (docs/decisions.md).
const SUNHOLES = [[2620, 360, 130, 100]];
export const SUN_BOX = [2440, 200, 2820, 560]; // room px round the breach: the floor the Dawn may burn (zone.gen.mjs)
const MOONHOLES = [[560, 980, 40], [1900, 520, 30], [2420, 470, 32], [1130, 330, 34], [2150, 600, 40], [1700, 1000, 36], [3100, 440, 40], [3560, 1040, 40], [900, 760, 30], [3000, 1180, 30]];
// Lit braziers (then one at each fork of the paths, landmarks in the dark; then one by each narrow way where the battue
// waits, CHOKES) and candles at graves (room px floor points); more candles at the near field's graves (GRAVE_CANDLES)
// and at each mausoleum's door.
const BRAZIERS = [[180, 132], [282, 132], [1340, 1138], [1490, 1200], [1488, 304], [1562, 304], [3520, 314], [3600, 314],
  [3060, 880], [3236, 872], [3150, 724], [2470, 650], [1928, 760], [1662, 114], [1718, 114], [3232, 114], [3288, 114], [2700, 1170],
  [500, 400], [820, 792], [1800, 1108], [2900, 450], [3200, 380],
  [1318, 1192], [1300, 210], [1556, 234], [2465, 392], [2562, 486], [1714, 228], [2084, 262],
  [2836, 282], [2726, 1006]]; // the gallows, the pyre of les Bûchers: landmarks
const CANDLES = [[742, 486, 3], [780, 488, 2], [1124, 664, 3], [430, 1094, 2], [1870, 344, 2], [1898, 346, 3], [3380, 448, 3], [3548, 316, 2], [3578, 318, 2],
  [560, 676, 2], [312, 886, 3], [2270, 196, 2], [1620, 1284, 2], [3610, 1114, 2], [2730, 1244, 2], [1714, 616, 2], [3712, 716, 2], [1960, 754, 2],
  [1000, 1024, 3], [1158, 136, 2]]; // the way back's landmarks: the sarcophagus mid-trunk, the rubble on the north path
// The Order's lanterns on their poles round the camp: their dirty green pool burns like a planted lantern's (zone.ts).
export const LANTERNS = [[2996, 716], [3320, 716], [2996, 1036], [3320, 1036], [3560, 360], [2918, 292]]; // and one by the gallows
const PYRE = [3120, 846]; // the camp's fire: a pyre of coffin boards and bones

// ---------- the gameplay plan, read by zone.gen.mjs ----------
// The zone's places, as he meets them (named as he enters each, RoomScene), and where the foes stand: by ring (docs/
// extraction.md: farther from the refuge, harder), first match; groups: how many drawn from the place's own pool
// (T.expedition.necropolis, else its ring's). The forecourt by the refuge's stairs and the court behind the grille hold
// none (a sure pause); the causeway, the bridge and the breach only their set pieces (POSTS); x 1400 lies in the chasm.
export const AREAS = [
  { id: 'parvis', name: 'Le Parvis', ring: 1, rect: [100, 60, 460, 360], groups: 0 },
  { id: 'cour', name: 'La Cour de la grille', ring: 2, rect: [1440, 60, 1610, 292], groups: 0 },
  { id: 'chaussee', name: 'La Chaussée', ring: 1, rect: [1240, 150, 1440, 320], groups: 0 },
  { id: 'pont', name: 'Le Gouffre', ring: 2, rect: [1280, 1090, 1540, 1250], groups: 0 },
  { id: 'caveaux', name: 'Les Caveaux', ring: 1, rect: [0, 0, 1400, 520], groups: 2 },
  { id: 'champ', name: 'Le Champ des Croix', ring: 1, rect: [0, 520, 1400, 1350], groups: 3 },
  { id: 'breche', name: 'La Brèche', ring: 3, rect: [2440, 200, 2820, 560], groups: 0 },
  { id: 'fosses', name: 'Les Fosses', ring: 2, rect: [1400, 0, 2612, 707], groups: 3 },
  { id: 'allee', name: "L'Allée des Mausolées", ring: 2, rect: [1400, 707, 2612, 1350], groups: 4 },
  { id: 'camp', name: "Le Camp de l'Ordre", ring: 3, rect: [2920, 680, 3390, 1065], groups: 4 },
  { id: 'buchers', name: 'Les Bûchers', ring: 3, rect: [2612, 640, 3300, 1350], groups: 2 },
  { id: 'postes', name: "Les Postes de l'Ordre", ring: 3, rect: [2612, 0, 3200, 640], groups: 2 },
  { id: 'chapelle', name: 'Le Parvis de la Chapelle', ring: 3, rect: [3200, 0, 3840, 640], groups: 3 },
  { id: 'puits', name: 'Le Puits', ring: 3, rect: [3200, 640, 3840, 1350], groups: 3 },
];
// Blood caches: floor points in front of what is worth searching, by area.
export const CACHES = [[1124, 676], [432, 1102], [1020, 1028], [2270, 206], [1724, 1030], [2190, 960], [3168, 912], [3384, 460], [2730, 1250], [3612, 1124], [3030, 286],
  [1060, 404], [1180, 142], [2470, 314], [1700, 614], [2880, 572],
  [600, 1030], [2850, 300], [2160, 676]]; // the shrine's offerings, the gallows' foot, the heap of the dead
// Where the battue lies in wait on his way back (world.ts lair()): on the refuge's side of each narrow way (the bridge, the
// causeway, the grille, the breach's two ways out, west and south under the wall, out of the Dawn; out of the gallery's
// mouth, south to the grille or east past the nave, where its roof no longer hides them): x, y, how near his way must pass.
export const CHOKES = [[1320, 1168, 32], [1318, 233, 32], [1525, 240, 32], [2470, 360, 64], [2585, 476, 32], [1690, 220, 32], [2060, 280, 40]];
const PYRES = () => [PYRE, ...PROPS.filter((o) => o.kind === 'pyre').map((o) => [o.x, o.y])];
export const TORCH_ROWS = () => [...BRAZIERS.map(([x, y]) => [x, Math.round(y - 4 - 36 * CS / 2), 1]), ...PYRES().flatMap(([px, py]) => [-8, 0, 7].map((d) => [px + d, Math.round(py - 6 - 22 * CS / 2), 1]))]; // flames over the dark (dark.ts)
// Where the rot glows pale green (le Puits' dead, its nest), floor points.
const ROT = [[3560, 1150], [3610, 1180], [2236, 660]];

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
  for (const o of PROPS) if (o.solid !== false) out.push(rect(o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y));
  for (const [x, y] of BRAZIERS) out.push(rect(x - 6, y - 8, x + 6, y));
  for (const [x, y] of LANTERNS) out.push(rect(x - 2, y - 3, x + 2, y));
  for (const [x, y] of STAKES) out.push(rect(x - 3, y - 3, x + 3, y));
  out.push(rect(PYRE[0] - 18, PYRE[1] - 12, PYRE[0] + 18, PYRE[1]));
  out.push(rect(WELL.x - 26, WELL.y - 16, WELL.x + 26, WELL.y + 2), rect(WELL.x - 26, WELL.y + 2, WELL.x - 12, WELL.y + 16), rect(WELL.x + 12, WELL.y + 2, WELL.x + 26, WELL.y + 16)); // the well's coping, open at its gap
  return out;
}
/** The shortcuts' openings, closed (room px x, y, w, h). */
export const gateBoxes = () => GATES.map((g) => rect(g.x0, g.y0, g.x1, g.y1));

// ---------- the floor's rasters, one byte per room px ----------
// kind: 0 earth, 1 gravel, 2 paving, 3 the camp's mud; mound: turned earth over a grave; blood: old blood.
// edge: within 8 px of a path's gravel (floorAt() works its border out per texel, and scatters gravel past it)
const N = RW * RH, kind = new Uint8Array(N), mound = new Uint8Array(N), blood = new Uint8Array(N), edge = new Uint8Array(N);
function paint(x0, y0, x1, y1, f) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(RH, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(RW, Math.ceil(x1)); x++) f(y * RW + x, x, y);
}
const SEGS = PATHS.flatMap(([w, pts]) => pts.slice(1).map((b, k) => [w, pts[k], b]));
/** How far room px (X, Y) lies outside the gravel of the paths (< 0: on it), its border ragged. */
const gravel = (X, Y) => { let d = 1e9; for (const [w, a, b] of SEGS) if (X > Math.min(a[0], b[0]) - w - 12 && X < Math.max(a[0], b[0]) + w + 12 && Y > Math.min(a[1], b[1]) - w - 12 && Y < Math.max(a[1], b[1]) + w + 12) d = Math.min(d, segDist(X, Y, a, b) - w / 2); return d - 5 * (vn(X / 3.5, Y / 3.5, 3) - 0.5); };
for (const [w, a, b] of SEGS) paint(Math.min(a[0], b[0]) - w - 12, Math.min(a[1], b[1]) - w - 12, Math.max(a[0], b[0]) + w + 12, Math.max(a[1], b[1]) + w + 12, (i, x, y) => {
  const d = gravel(x + 0.5, y + 0.5);
  if (d < 0 && kind[i] !== 2) kind[i] = 1;
  if (d < 8) edge[i] = 1;
});
/** How far room px (X, Y) lies inside the camp's trodden mud (< 0: out), its edge ragged by 40 px. */
const inCamp = (X, Y) => Math.min(X - CAMP[0], CAMP[2] - X, Y - CAMP[1], CAMP[3] - Y) + 80 * (fbm(X / 40, Y / 40, 3, 37) - 0.5);
paint(CAMP[0] - 45, CAMP[1] - 45, CAMP[2] + 45, CAMP[3] + 45, (i, x, y) => { if (kind[i] === 0 && inCamp(x + 0.5, y + 0.5) > 0) kind[i] = 3; });
for (const [x0, y0, x1, y1] of PAVED) paint(x0, y0, x1, y1, (i, x, y) => { const e = Math.min(x - x0, x1 - x, y - y0, y1 - y); if (e > 7 * vn(x / 5, y / 5, 13) - 1 || y < y0 + 2) kind[i] = 2; }); // broken at its edges
for (const p of DECKS) paint(...p, (i) => (kind[i] = 2));
/** Room px (x, y) clear of paths and paving by `m`. */
let kindC = kind; // what clear() reads: the floor as it was before the ways down were laid (below)
const clear = (x, y, m) => { for (let j = -m; j <= m; j += 2) for (let i = -m; i <= m; i += 2) { const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= RW || Y >= RH || kindC[Y * RW + X] === 1 || kindC[Y * RW + X] === 2) return false; } return true; };

// ---------- props on the floor: graves in their blocks, sarcophagi, statues, rubble, broken pillars ----------
// Props with footprints (x: middle, y: feet line, w x h room px).
const PROPS = [
  { kind: 'statue', x: 1124, y: 662, w: 24, h: 14 }, { kind: 'statue', x: 3384, y: 446, w: 24, h: 14 },
  { kind: 'sarc', x: 432, y: 1090, w: 40, h: 14 }, { kind: 'sarc', x: 2270, y: 194, w: 40, h: 14 }, { kind: 'sarc', x: 3612, y: 1112, w: 40, h: 14 },
  { kind: 'sarc', x: 1020, y: 1016, w: 40, h: 14 }, { kind: 'coffin', x: 2730, y: 1238, w: 46, h: 12 }, { kind: 'coffin', x: 1724, y: 1018, w: 46, h: 12 },
  { kind: 'chest', x: 3168, y: 900, w: 26, h: 12 }, { kind: 'chest', x: 2190, y: 948, w: 26, h: 12 }, { kind: 'sarc', x: 3030, y: 274, w: 40, h: 14 },
  { kind: 'sarc', x: 2880, y: 560, w: 40, h: 14 },
  // the breach: two tall stumps whose shade (thrown north-west) is the way across without burning, a cross in the Dawn
  { kind: 'stump', x: 2600, y: 412, w: 20, h: 10, tall: 70 }, { kind: 'stump', x: 2690, y: 340, w: 20, h: 10, tall: 70 }, { kind: 'stump', x: 2640, y: 300, w: 20, h: 10, tall: 44 },
  { kind: 'cross', x: 2560, y: 332, w: 12, h: 5 },
  { kind: 'banner', x: 2756, y: 330, w: 6, h: 4 }, { kind: 'banner', x: 2756, y: 430, w: 6, h: 4 }, // here begins the Order
  { kind: 'stump', x: 2050, y: 820, w: 22, h: 11, tall: 40 }, { kind: 'stump', x: 2150, y: 1100, w: 22, h: 11, tall: 28 }, { kind: 'pillar', x: 2240, y: 960, w: 22, h: 11 },
  { kind: 'stump', x: 1900, y: 520, w: 22, h: 11, tall: 50 }, { kind: 'pillar', x: 1360, y: 1120, w: 20, h: 10 }, { kind: 'pillar', x: 1470, y: 1120, w: 20, h: 10 },
  { kind: 'trophy', x: 2960, y: 760, w: 6, h: 4 }, { kind: 'trophy', x: 3334, y: 760, w: 6, h: 4 }, { kind: 'rack', x: 3280, y: 962, w: 30, h: 8 },
  { kind: 'banner', x: 3086, y: 690, w: 6, h: 4 }, { kind: 'banner', x: 3144, y: 690, w: 6, h: 4 }, { kind: 'banner', x: 3530, y: 306, w: 6, h: 4 }, { kind: 'banner', x: 3590, y: 306, w: 6, h: 4 },
  { kind: 'lever', x: 1556, y: 312, w: 10, h: 6 }, { kind: 'lever', x: 3316, y: 112, w: 10, h: 6 },
];
// Rubble heaps where galleries fell (walkable round, solid in the middle).
const RUBBLE = [[2080, 880, 26], [2200, 1040, 30], [1980, 1130, 22], [2600, 280, 20], [2610, 444, 22], [1180, 120, 24], [600, 1270, 22], [3420, 620, 24], [2300, 640, 20],
  [1760, 1180, 20], [2380, 1050, 24]];
for (const [x, y, r] of RUBBLE) PROPS.push({ kind: 'rubble', x, y: y + r * 0.3, w: r * 1.2, h: r * 0.5, r });
// Vignettes: scenes that tell without a word (docs/histoire-proposition.md §3, those that fit; never the unvalidated
// revelations), landmarks in the dark. solid: false, decor walked over (low, or in the way of a shade).
PROPS.push(
  { kind: 'gibbet', x: 2880, y: 250, w: 34, h: 6 }, // les Postes: the Order's gallows, one hung by the wrists
  { kind: 'burnt', x: 2690, y: 404, w: 20, h: 8, solid: false }, // la Brèche: one burnt in the Dawn, chained to its ring, reaching for the shade
  { kind: 'shrine', x: 560, y: 1000, w: 30, h: 10 }, // le Champ: an abandoned shrine under a crack of moon, a last candle
  { kind: 'nest', x: 2222, y: 646, w: 44, h: 14, solid: false }, // les Fosses: the dead heaped by the pits, le Gavé's
  { kind: 'opengrave', x: 1700, y: 1072, w: 30, h: 8, solid: false }, // l'Allée: a grave pushed open from inside, its stake broken
  { kind: 'pyre', x: 2760, y: 980, w: 36, h: 12 }, // les Bûchers: one burning now, on his stake
  { kind: 'cage', x: 3270, y: 1030, w: 30, h: 12 }, // the camp: where they bring the ones they catch
  { kind: 'reliquary', x: 2300, y: 1176, w: 30, h: 12 }, // l'Allée: a reliquary in its iron cage, an elite by it
  { kind: 'toll', x: 1300, y: 1146, w: 6, h: 4 }, // le Gouffre: the bridge's toll, fangs nailed in its board
  { kind: 'bucket', x: 3742, y: 1214, w: 12, h: 6 }, // le Puits: a bucket sticky with fresh blood, a basket of raw meat
);
// The burnt shadows under the breach (V10): where the Order makes them kneel in the Dawn, a ring sealed before each.
const SHADOWS = [[2596, 392], [2622, 398], [2648, 402], [2730, 408], [2756, 404]];

// ---------- what lives here (src/haunts.ts, RoomScene; numbers in T.haunts, T.elite) ----------
// Set pieces, placed every expedition at the zone's key points: kinds (the first carries the lantern on a route), the
// dead they eat (feed: bodies on the floor, src/foes.ts' corpse), elite: which one is (an index), route: the one they
// walk, relic: the cache they guard (always there, always an item), prisoner: the one they drag along their route.
export const POSTS = [
  { id: 'festin-caveaux', x: 1000, y: 300, kinds: ['ghoul', 'ghoul'], feed: [[1004, 312]] },
  { id: 'corneilles-champ', x: 430, y: 960, kinds: ['crows'] },
  { id: 'tertre-champ', x: 760, y: 1000, kinds: ['enterre'] },
  { id: 'chaussee', x: 1290, y: 252, kinds: ['crocheteur', 'penitent'] },
  { id: 'pont', x: 1415, y: 1150, kinds: ['chose'] },
  { id: 'nid', x: 2190, y: 666, kinds: ['gave', 'ghoul', 'ghoul'], feed: [[2240, 662], [2196, 648], [2264, 674]] },
  { id: 'festin-fosses', x: 1760, y: 470, kinds: ['ghoul', 'ghoul', 'ghoul'], feed: [[1764, 482]] },
  { id: 'corneilles-fosses', x: 2400, y: 300, kinds: ['crows'] },
  { id: 'tombe-ouverte', x: 1700, y: 1090, kinds: ['enterre', 'crows'] },
  { id: 'reliquaire-allee', x: 2300, y: 1200, kinds: ['penitent', 'hound', 'hound'], elite: 0, relic: [2300, 1190] },
  { id: 'breche-est', x: 2800, y: 380, kinds: ['crocheteur', 'crossbow', 'crossbow'], elite: 1 },
  { id: 'gibet', x: 2880, y: 280, kinds: ['penitent', 'penitent', 'crossbow', 'crossbow'], elite: 0 },
  { id: 'bucher', x: 2780, y: 1012, kinds: ['purifier', 'penitent', 'penitent'], elite: 0 },
  { id: 'reliquaire-chapelle', x: 3384, y: 480, kinds: ['inquisitor', 'penitent', 'penitent', 'crossbow'], elite: 0, relic: [3384, 460] },
  { id: 'nid-puits', x: 3560, y: 1140, kinds: ['gave', 'ghoul', 'ghoul', 'ghoul'], feed: [[3580, 1150], [3540, 1160]], elite: 0 },
  { id: 'ronde-breche', x: 3115, y: 660, kinds: ['crossbow', 'penitent', 'penitent'], route: 'breche' },
  { id: 'ronde-chapelle', x: 3220, y: 360, kinds: ['priest', 'penitent', 'penitent'], route: 'chapelle' },
  { id: 'ronde-puits', x: 3420, y: 930, kinds: ['crossbow', 'hound', 'hound'], route: 'puits' },
  { id: 'ronde-milieu', x: 2470, y: 560, kinds: ['crossbow', 'penitent', 'penitent'], route: 'milieu' },
  { id: 'prisonnier', x: 3360, y: 338, kinds: ['crocheteur', 'crossbow'], route: 'camp', prisoner: true },
];
// The patrols' routes (room px waypoints, walked straight from one to the next): `once`, to its end; else back and forth.
export const ROUTES = {
  breche: { pts: [[3115, 660], [3050, 610], [2960, 480], [2930, 440]] },
  chapelle: { pts: [[3220, 360], [3380, 335], [3520, 330]] },
  puits: { pts: [[3420, 930], [3600, 1000], [3660, 1110]] },
  milieu: { pts: [[2470, 560], [2500, 700], [2450, 900], [2150, 1000], [1800, 1080]] },
  camp: { pts: [[3360, 338], [3200, 352], [3040, 392], [2960, 470], [3050, 610], [3115, 680], [3150, 820]], once: true },
};
// Rats' nests (src/rats.ts, RoomScene scurry()): a few nose about each, flee him.
export const RATS = [[600, 700], [1000, 1150], [1750, 500], [2200, 1150], [2900, 1200], [3500, 1250], [2300, 600], [450, 1200], [3000, 1180]];
// Where the notes another hand will add may lie (id, x, y): clear floor by the vignettes.
export const NOTES = [{ id: 'parvis', x: 300, y: 200 }, { id: 'peage', x: 1300, y: 1166 }, { id: 'tombe', x: 1730, y: 1086 }, { id: 'breche', x: 2560, y: 450 },
  { id: 'gibet', x: 2860, y: 270 }, { id: 'camp', x: 3200, y: 1000 }, { id: 'puits', x: 3720, y: 1240 }, { id: 'sanctuaire', x: 590, y: 1020 }];
/** Le Tireur's perch on mausoleum `m` of MAUS (x, front feet line y, w, d): his feet at its roof's front edge (his body,
 *  a few px lower, sticks out of its box), its eave's height, the foot of its ladder by its east side. */
const roofOf = ([x, y, w, d]) => ({ x, y: y - 2, h: Math.round((92 * CS) / 2), ladder: { x: x + w / 2 + 8, y: y - d / 2 } });
const LATE = [ // laid after the graves were (they keep off nothing new)
  { id: 'tireur-allee', kinds: ['tireur'], roofs: [[2010, 995, 56, 30], [1890, 1022, 56, 30], [2060, 1092, 56, 30]] },
  { id: 'tireur-puits', kinds: ['tireur'], roofs: [[3420, 1190, 64, 34], [3700, 700, 60, 32]] },
].map(({ roofs, ...p }) => { const perches = roofs.map(roofOf); return { ...p, x: perches[0].x, y: perches[0].y, perches }; });
LATE.push({ id: 'miroir-breche', x: 2768, y: 452, kinds: ['miroitier', 'penitent'] }); // the Dawn within his mirror's reach
const KEEP = [...POSTS.flatMap((p) => [[p.x, p.y], ...(p.feed ?? []), ...(p.relic ? [p.relic] : [])]), ...RATS, ...NOTES.map((n) => [n.x, n.y])]; // graves keep off them
POSTS.push(...LATE);
Object.assign(NOTES.find((n) => n.id === 'sanctuaire'), { x: 562, y: 1036 }); // clear of the shrine's cache (after the graves keep off its first spot)

// The north cliff's talus: rock fallen at its foot every 60-90 px, but at the arches, doors, the court and the walls;
// decor only (a solid heap against the rock would squeeze a walker into it).
const TALUS = [];
for (let x = 70; x < RW - 60; x += 60 + 30 * h2(x, 0, 91)) {
  if (ARCHES.some((a) => Math.abs(x - a.x) < 100) || [[1330, 1620], [1780, 1980], [2570, 2670], [3470, 3650]].some(([a, b]) => x > a && x < b)) continue;
  TALUS.push([Math.round(x), Math.round(north(x)), Math.round(14 + 10 * h2(x, 1, 91))]);
}
// What taken() sees: the zone as it was before the ways down were laid (below), so its random graves, skulls and bones
// fall where they were baked.
const BEFORE = { doors: Object.values(DOORS), gates: [...GATES], facades: [...FACADES], props: [...PROPS], braziers: [...BRAZIERS], caches: [...CACHES] };
const taken = (x, y, m) => {
  const near = (x0, y0, x1, y1) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  return pit(x, y) || pit(x, y + 8) || pit(x, y - 8) || rock(x, y - 20) || rock(x, y + 12) || WALLS.some((w) => near(w.x0, w.y0 - 30, w.x1, w.y1 + 10))
    || BEFORE.facades.some((f) => near(f.x0, f.y0, f.x1, DOORS[f.door].y + 40)) || MAUS.some(([mx, my, w, d]) => near(mx - w / 2, my - d - 20, mx + w / 2, my + 6))
    || COLS.some(([cx, cy, r]) => near(cx - r, cy - r, cx + r, cy + 6)) || TENTS.some(([tx, ty]) => near(tx - 36, ty - 50, tx + 36, ty + 6)) || near(...CAMP)
    || BEFORE.props.some((o) => near(o.x - o.w / 2, o.y - o.h - 16, o.x + o.w / 2, o.y + 6)) || BEFORE.doors.some((d) => Math.hypot(d.x - x, d.y - y) < 70)
    || BEFORE.gates.some((g) => near(g.x0 - 40, g.y0 - 40, g.x1 + 40, g.y1 + 50)) || BEFORE.braziers.some(([bx, by]) => Math.hypot(bx - x, by - y) < 18)
    || SUNHOLES.some(([sx, sy, a]) => Math.hypot(sx - x, sy - y) < a + 30) || STAKES.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 16) || BEFORE.caches.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 24)
    || KEEP.some(([kx, ky]) => Math.hypot(kx - x, ky - y) < 26);
};
// Each grave: x, y (its feet line), kind, footprint w x h, seed.
// Clearings and clusters (a slow noise over the blocks), jittered, sized +-25 %, some sunk or broken.
const GRAVES = [];
for (const [x0, y0, x1, y1, sx, sy] of BLOCKS) for (let y = y0; y < y1; y += sy) for (let x = x0; x < x1; x += sx) {
  const m = fbm(x / 170, y / 140, 3, 404);
  for (const [ox, oy] of m > 0.6 ? [[0, 0], [sx / 2, sy / 2]] : [[0, 0]]) {
    const gx = Math.round(x + ox + (R() - 0.5) * sx * 0.6), gy = Math.round(y + oy + (R() - 0.5) * sy * 0.45), r = R(), s = 0.75 + 0.5 * R();
    if (r < 0.18 || m < 0.4 || taken(gx, gy, 10) || !clear(gx, gy + 10, 8) || !clear(gx, gy - 6, 6) || GRAVES.some((g) => Math.abs(g.x - gx) < 24 && Math.abs(g.y - gy) < 16)) continue;
    const k = r < 0.5 ? 'cross' : r < 0.78 ? 'stele' : r < 0.9 ? 'tomb' : 'lying', q = k === 'tomb' ? 1 : s;
    GRAVES.push({ x: gx, y: gy, kind: k, s: q, w: Math.round((k === 'tomb' ? 30 : k === 'lying' ? 14 : 12) * q), h: Math.max(3, Math.round((k === 'tomb' ? 12 : k === 'lying' ? 4 : 5) * q)), seed: (R() * 1e4) | 0 });
  }
}
// Candles at the near field's graves, two or three to a screen (the near side is where they still come to mourn).
const GRAVE_CANDLES = [];
for (const g of GRAVES) if (g.x < 1380 && g.kind !== 'tomb' && h2(g.seed, 7, 3) < 0.2 && [...CANDLES, ...GRAVE_CANDLES].every(([x, y]) => Math.hypot(x - g.x, y - g.y) > 110)) GRAVE_CANDLES.push([g.x + 8, g.y + 5, 2 + (g.seed % 2)]);

// ---------- the ways down to les catacombes (docs/extraction.md §4) ----------
// The well at the far end (the path from the camp's east gate ends at it), whose rungs go down; le caveau in the near
// field, a vault against the cliff whose stairs come up from the catacombs, its iron gate raised from below (the
// shortcut). Laid after the graves were drawn (BEFORE, kindC), so the rest of the zone stays as baked; the ground they
// stand on is cleared of graves, skulls and bones (aside()).
export const WELL = { x: 3700, y: 1192 };
const ASIDE = [[WELL.x, WELL.y + 4, 64], [720, 128, 74]]; // x, y, r
const aside = (x, y) => ASIDE.some(([ax, ay, r]) => Math.hypot(ax - x, (ay - y) * 1.4) < r);
for (const list of [GRAVES, GRAVE_CANDLES, TALUS]) for (let k = list.length - 1; k >= 0; k--) { const g = list[k]; if (aside(g.x ?? g[0], g.y ?? g[1])) list.splice(k, 1); }
Object.assign(DOORS, { puits: { x: WELL.x, y: WELL.y + 16, w: 24, name: 'Le puits', well: true }, caveau: { x: 720, y: 150, w: 28, name: 'Le caveau' } });
GATES.push({ id: 'caveau', name: 'La grille du caveau', x0: 704, x1: 736, y0: 136, y1: 150, side: 1, lever: null, arch: true });
FACADES.push({ door: 'caveau', kind: 'vault', x0: 684, y0: 94, x1: 756, h: 150 });
BRAZIERS.push([3652, 1226]);
CANDLES.push([694, 156, 2], [744, 158, 3], [3730, 1222, 2]);
kindC = kind.slice();
paint(696, 150, 744, 178, (i, x, y) => { if (Math.min(x - 696, 744 - x, 178 - y) > 6 * vn(x / 5, y / 5, 13) - 1 || y < 152) kind[i] = 2; }); // the vault's step, its paving broken
for (const g of GRAVES) if (g.kind !== 'tomb') paint(g.x - 14, g.y, g.x + 14, g.y + 24, (i, x, y) => {
  const dx = (x - g.x) / (8 * g.s), dy = (y - g.y - 9 * g.s) / (7 * g.s), v = 1 - dx * dx - dy * dy + (vn(x / 3, y / 3, g.seed) - 0.5) * 0.5;
  if (v > 0 && kind[i] === 0) mound[i] = Math.max(mound[i], Math.min(255, v * 300)); // a low dome
});
// Old blood: pools and drags (room px x, y, rx, ry; polylines).
const POOLS = [[3150, 860, 14, 6], [3040, 960, 10, 5], [2960, 780, 8, 4], [760, 500, 9, 4], [1124, 680, 8, 4], [1952, 760, 9, 4], [3560, 330, 10, 4], [2700, 380, 8, 4],
  [1500, 1170, 7, 3], [436, 1112, 6, 3], [1880, 350, 6, 3], [2480, 1090, 8, 4], [3300, 1000, 9, 4], [600, 900, 6, 3], [2240, 560, 7, 3]];
const DRAGS = [[[3150, 860], [3100, 900], [3040, 960]], [[1952, 760], [1940, 800], [1900, 860]], [[760, 500], [740, 560], [700, 600]], [[3560, 330], [3500, 380], [3420, 400]],
  [[3340, 348], [3200, 360], [3040, 400], [2970, 478], [3050, 616]], [[2222, 650], [2180, 690], [2120, 700]], [[1004, 316], [1040, 350], [1060, 396]]]; // the prisoner's way to the camp; dragged to the heap; out of the mausoleum
// blood under the dead the feeders eat, the heap, the gallows, the pyre
POOLS.push(...POSTS.flatMap((p) => (p.feed ?? []).map(([x, y]) => [x, y + 2, 10, 4])), [2222, 648, 18, 7], [2880, 256, 8, 3], [2760, 986, 12, 5], [2300, 1180, 6, 3]);
for (const [px, py, sx, sy] of POOLS) paint(px - 3 * sx, py - 3 * sy, px + 3 * sx, py + 3 * sy, (i, x, y) => { blood[i] = Math.max(blood[i], 255 * stain(x, y, px, py, sx * 1.3, sy * 1.3, 0.85, px + py)); });
for (const d of DRAGS) for (let k = 0; k < d.length - 1; k++) { const a = d[k], b = d[k + 1];
  paint(Math.min(a[0], b[0]) - 4, Math.min(a[1], b[1]) - 4, Math.max(a[0], b[0]) + 4, Math.max(a[1], b[1]) + 4, (i, x, y) => { const t = segDist(x, y, a, b); if (t < 2.4 && vn(x / 1.2, y / 1.2, 36 + k) > 0.3 + t / 6) blood[i] = Math.max(blood[i], 200); }); }

// ---------- the floor ----------
const E = { earth: L('#3a3128'), earthD: L('#2a231c'), dust: L('#6a6250'), moss: L('#344024'), mossL: L('#4e5a2c'), grav: L('#5a5446'), gravD: L('#3c372e'),
  mud: L('#2a221a'), mudD: L('#15110d'), straw: L('#6a5a34'), turned: L('#2e241a'), turnedL: L('#352a1f'), ash: L('#4a4640') };
const moundAt = (X, Y) => { const x = Math.floor(X), y = Math.floor(Y); return x < 0 || y < 0 || x >= RW || y >= RH ? 0 : mound[y * RW + x] / 255; };
/** The bare earth at world (x, y) (room px X, Y): its noise drawn at (x, y * SN), round on screen; dark, mossy near the
 *  refuge, bone dust in the middle (paler north of the wall), ash on the far side; half-buried old flags, clods, puddles,
 *  pebbles; turned earth over the graves, in relief. */
// Each place's own floor: how much moss, bone dust, ash, black wet mud, old flags and bone chips its earth shows.
const FLAVOR = {
  parvis: [0.8, 0.1, 0, 0, 0.8, 0.3], caveaux: [0.9, 0.15, 0, 0.15, 0.5, 0.4], champ: [1, 0.1, 0, 0.25, 0.15, 0.3], chaussee: [0.2, 0.4, 0, 0, 0.3, 0.6],
  pont: [0.3, 0.3, 0, 0.2, 0.3, 0.5], fosses: [0.15, 1, 0, 0, 0.15, 1.6], allee: [0.15, 0.45, 0, 0.1, 0.9, 0.6], breche: [0, 0.25, 0.5, 0, 0.3, 0.5],
  postes: [0, 0.2, 0.8, 0.3, 0.2, 0.4], camp: [0, 0.1, 0.5, 0.4, 0, 0.3], buchers: [0, 0.1, 1.3, 0.2, 0.1, 0.5], chapelle: [0, 0.25, 0.4, 0, 1, 0.3], puits: [0.1, 0.1, 0.2, 1, 0.2, 0.7],
};
const FL0 = [0.6, 0.4, 0.3, 0.2, 0.4, 0.5];
const flavorOf = (X, Y) => FLAVOR[AREAS.find(({ rect: [x0, y0, x1, y1] }) => X >= x0 && X < x1 && Y >= y0 && Y < y1)?.id] ?? FL0;
/** The floor's flavour at room px (X, Y): moss, dust, ash, mud, flags, bones; four samples over a ragged border of places. */
const FLC = new Float32Array(RW * RH * 6).fill(-1); // worked out once per room px
function flavor(X, Y) {
  const i = (Math.min(RH - 1, Math.max(0, Math.floor(Y))) * RW + Math.min(RW - 1, Math.max(0, Math.floor(X)))) * 6;
  if (FLC[i] < 0) FLC.set(flavor0(Math.floor(X) + 0.5, Math.floor(Y) + 0.5), i);
  return FLC.subarray(i, i + 6);
}
function flavor0(X, Y) {
  const out = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 4; k++) { const f = flavorOf(X + 90 * (vn(X / 70, Y / 70, 120 + k) - 0.5), Y + 90 * (vn(X / 70, Y / 70, 130 + k) - 0.5)); for (let j = 0; j < 6; j++) out[j] += f[j] / 4; }
  return out;
}
function earthAt(x, y, X, Y, i) {
  const ys = y * SN, [moss, dust, ash, wet, old] = flavor(X, Y), a0 = moundAt(X, Y);
  let c = mix(E.earth, E.earthD, clamp(fbm(x / 26, ys / 26, 4, 101) * 1.2 - 0.1) * 0.4), spec = 0.03, gloss = 12; // calm: the detail gathers by the graves
  c = mix(c, E.dust, clamp((fbm(x / 60, ys / 60, 3, 102) - 0.55 + dust * 0.4) * 0.9) * (0.45 + 0.4 * dust)); // bone dust, the middle's ossuaries
  const ak = Math.min(1, ash) * clamp((fbm(x / 40, ys / 40, 3, 103) - 0.45 + 0.15 * ash) * 1.3); // ash where the Order burns, charcoal at its pyres
  c = mix(c, mul(ash > 1 ? mul(E.ash, 0.45) : E.ash, 0.85 + 0.3 * vn(x / 5, ys / 5, 105)), ak);
  if (ak > 0.2) { const ch = item2(x, ys, 9, 0.15 * ak, 106); if (ch && ch.d < 1) c = ch.h < 0.15 ? mix(C.bone, E.ash, 0.5) : mul(L('#14100c'), 0.8 + 0.4 * ch.h); } // charcoal, a burnt bone
  c = mix(c, E.mudD, wet * clamp((fbm(x / 34, ys / 34, 3, 104) - 0.42) * 2.4) * 0.8); // black wet mud
  const m = fbm(x / 30, ys / 30, 4, 33), m0 = 0.72 - 0.1 * moss; if (m > m0) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? E.mossL : E.moss, clamp((m - m0) * 4) * 0.65 * Math.min(1, moss));
  const f = (u, v) => vn(u / 14, v / 14, 21), gx = f(x + 1, ys) - f(x - 1, ys), gy = f(x, ys + 1) - f(x, ys - 1);
  let N = [-gx * 0.4, -gy * 0.4, 1];
  // half-buried old flags where a slow noise says so, the earth over their edges
  const fl = fbm(x / 140, ys / 140, 3, 110), f0 = 0.72 - 0.14 * old;
  if (fl > f0 && fbm(x / 12, ys / 12, 3, 111) < 0.25 + (fl - f0) * 3) { const g = flags(x, y, 46, 34, 17); c = mix(c, mul(g.c, 0.7), 0.85); N = g.N; }
  else {
    const cx = Math.floor(x / 9), cy = Math.floor(ys / 9);
    if (h2(cx, cy, 120) < 0.025) { // a clod
      const ox = (cx + 0.2 + 0.6 * h2(cx, cy, 121)) * 9, oy = (cy + 0.2 + 0.6 * h2(cx, cy, 122)) * 9, r = 2.8 + 2.4 * h2(cx, cy, 123), d = Math.hypot(x - ox, ys - oy) / r;
      if (d < 1) { N = [(x - ox) / r * 0.5, (ys - oy) / r * 0.5, 1]; c = mul(c, 0.85 + 0.25 * (1 - d)); }
    }
    // an old grave fallen in, its stone long gone: a sunken plot, its inner walls catching the light, turned earth round it
    const hx = Math.floor(x / 70), hy = Math.floor(ys / 64);
    if (!a0 && h2(hx, hy, 150) < 0.13 * Math.min(1, moss + 0.6 * old)) {
      const du = (x - (hx + 0.3 + 0.4 * h2(hx, hy, 151)) * 70) / (9 + 3 * h2(hx, hy, 153)), dv = (ys - (hy + 0.3 + 0.4 * h2(hx, hy, 152)) * 64) / (17 + 5 * h2(hx, hy, 154));
      const e = (du ** 4 + dv ** 4) ** 0.25 + 0.22 * (vn(x / 4, ys / 4, 155) - 0.5), side = Math.abs(du) > Math.abs(dv);
      if (e < 1) { const w = clamp((1 - e) * 4); c = mix(c, mul(E.turned, 0.75), 0.45 + 0.3 * w); N = w < 1 ? (side ? [-Math.sign(du) * 0.7, 0, 1] : [0, -Math.sign(dv) * 0.7, 1]) : N;
        if (w >= 1) c = mix(c, E.moss, 0.3 * clamp((vn(x / 6, ys / 6, 156) - 0.4) * 2)); }
      else if (e < 1.35) { c = mix(c, E.turnedL, 0.35); N = side ? [Math.sign(du) * 0.3, 0, 1] : [0, Math.sign(dv) * 0.3, 1]; } // its lip
    }
    // a flat stone sunk in the earth, its edge catching the light: forms a few px across that read at a glance, in drifts
    const sx = Math.floor(x / 16), sy = Math.floor(ys / 16);
    if (h2(sx, sy, 140) < (0.02 + 0.05 * old) * 2.2 * clamp(fbm(x / 90, ys / 90, 2, 148) - 0.25)) {
      const ox = (sx + 0.25 + 0.5 * h2(sx, sy, 141)) * 16, oy = (sy + 0.25 + 0.5 * h2(sx, sy, 142)) * 16, r = 3 + 3 * h2(sx, sy, 143), a = h2(sx, sy, 144) * 3;
      const u = ((x - ox) * Math.cos(a) + (ys - oy) * Math.sin(a)) / r, v = (-(x - ox) * Math.sin(a) + (ys - oy) * Math.cos(a)) / (r * 0.65), d = Math.hypot(u, v) + 0.15 * (vn(x / 2, ys / 2, 145) - 0.5);
      if (d < 1) { c = mul(mix(C.stB, C.stC, h2(sx, sy, 146)), d > 0.8 ? 0.6 : 0.8 + 0.1 * vn(x / 2, ys / 2, 147)); N = d > 0.8 ? [(x - ox) / r, (ys - oy) / r, 1] : [0, 0, 1]; }
    }
    const p = fbm(x / 36, ys / 36, 3, 121), p0 = 0.84 - 0.14 * wet; if (p > p0) { c = mul(c, 0.6); spec = 0.25 * clamp((p - p0) * 12); gloss = 60; N = [0, 0, 1]; } // a puddle
  }
  const q = h2(x / 4 | 0, ys / 4 | 0, 17); if (q < 0.012) c = mul(c, 0.7); // pebbles
  // under the breach the Dawn has baked it: scorched dark, a crust split in plates whose edges curl and catch the light
  for (const [sx, sy, a] of SUNHOLES) { const d = Math.hypot(X - sx, (Y - sy) * 1.2) / (a * 1.1); if (d > 1.2) continue;
    const w = clamp((1.15 - d) * 3 + 0.5 * (vn(x / 10, ys / 10, 160) - 0.5)), p = flags(x, ys, 40, 40, 161), cr = p.e < 0.9 && vn(x / 9, ys / 9, 163) > 0.45; // split only here and there
    c = mix(c, mul(mix(L('#2c1f14'), L('#433020'), 0.5 * h2(p.id, 1, 162) + 0.5 * vn(x / 6, ys / 6, 164)), cr ? 0.4 : 1), 0.75 * w); if (w > 0.3 && cr) N = [0, 0, 1]; else if (w > 0.3 && p.e < 2.5 && vn(x / 9, ys / 9, 163) > 0.45) N = p.N; }
  // under a crack of moon the damp gets in: darker earth, moss, a wet sheen the moon glints on
  for (const [mx, my, r] of MOONHOLES) { const d = Math.hypot(X - mx, (Y - my) * 1.3) / r; if (d > 1.4) continue;
    const w = clamp((1.25 - d) * 2 + 0.6 * (vn(x / 8, ys / 8, 157) - 0.5));
    c = mix(mul(c, 1 - 0.3 * w), E.moss, 0.25 * w * clamp((fbm(x / 10, ys / 10, 2, 158) - 0.4) * 3));
    const sh = w * clamp((fbm(x / 7, ys / 7, 2, 159) - 0.45) * 4); if (sh > 0.1) { spec = Math.max(spec, 0.35 * sh); gloss = 70; } }
  const a = a0;
  if (a) {
    c = mix(c, mix(E.turned, E.turnedL, vn(x / 3, ys / 3, 23)), clamp(a * 1.5) * 0.55);
    N = [N[0] - (moundAt(X + 1, Y) - moundAt(X - 1, Y)) * 0.6, N[1] - (moundAt(X, Y + 1) - moundAt(X, Y - 1)) * 0.6, 1]; // its relief
  }
  return { c, N, spec, gloss };
}
/** A stone of the s-texel cell round (u, v) there with chance p: where on it (dx, dy, d < 1 on it), a hash; or null. */
function item2(u, v, s, p, seed) {
  const cx = Math.floor(u / s), cy = Math.floor(v / s);
  if (p <= 0 || h2(cx, cy, seed) >= p) return null;
  const r = s * (0.2 + 0.2 * h2(cx, cy, seed + 3)), dx = (u - (cx + 0.3 + 0.4 * h2(cx, cy, seed + 1)) * s) / r, dy = (v - (cy + 0.3 + 0.4 * h2(cx, cy, seed + 2)) * s) / r;
  return { dx, dy, d: Math.hypot(dx, dy) + 0.25 * (vn(u / 2, v / 2, seed + 4) - 0.5), h: h2(cx, cy, seed + 5) };
}
function floorAt(x, y) {
  const X = rx(x), Y = ry(y), xi = Math.floor(X), yi = Math.floor(Y);
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RH) return { alb: C.void, N: [0, 0, 1], noAO: true };
  const i = yi * RW + xi, camp = kind[i] === 3 || (edge[i] && inCamp(X, Y) > 0);
  let k = kind[i], c, Nn = [0, 0, 1], spec = 0.03, gloss = 12, scatter = 0;
  if (edge[i] && k !== 2) { const d = gravel(X, Y); k = d < 0 ? 1 : camp ? 3 : 0; scatter = clamp(1 - d / 4); } // the gravel's border per texel
  let lifted = false; // a forecourt's edge: its flags thinning out into the earth, flag by flag, the hollows of the ones taken
  if (k === 0 || k === 2) for (const [x0, y0, x1, y1] of PAVED) { if (X < x0 - 12 || X > x1 + 12 || Y < y0 || Y > y1 + 12) continue;
    const er = Math.min(X - x0, x1 - X, y1 - Y); if (er > 14) break;
    k = h2(flags(x, y, 46, 34, 11).id, 9, 77) < clamp(0.45 + er / 24) ? 2 : 0; lifted = k === 0 && er > -2; break; }
  if (k === 2) { const f = flags(x, y, 46, 34, 11); c = grime(f.c, x, y, 0.8); Nn = f.N; }
  else if (k === 1) {
    // pebbles two or three texels across, each its own tone, in grit; its middle trodden firm and dark, its sides loose
    const firm = clamp((-gravel(X, Y) - 3) / 5), pb = heap(x, y * SN + 0.37 * x, 4.6, 12), ph = h2(pb.id, 1, 13), on = pb.d < 1 && ph > 0.2 + 0.3 * firm;
    c = mix(E.grav, E.gravD, clamp(fbm(x / 9, y / 9, 3, 11) * 1.5 - 0.4));
    if (on) { c = mul(mix(c, ph < 0.55 ? E.gravD : mul(E.grav, 1.15), 0.6), 1.05 - 0.3 * pb.d * pb.d); Nn = [pb.du * (0.6 - 0.4 * firm), pb.dv * (0.6 - 0.4 * firm), 1]; }
    else c = mul(mix(c, E.earthD, 0.5), 0.75);
    c = mix(c, E.earthD, clamp((fbm(x / 30, y / 24, 3, 13) - 0.5) * 2) * 0.6 + 0.35 * firm);
  } else {
    const e = earthAt(x, y, X, Y, i);
    c = e.c; Nn = e.N; spec = e.spec; gloss = e.gloss;
    if (lifted) { const f = flags(x, y, 46, 34, 11); c = mul(mix(c, E.turned, 0.3), f.e < 2.5 ? 0.7 : 0.88); Nn = f.e < 2.5 ? f.N.map((v, j) => (j < 2 ? -v : v)) : [0, 0, 1]; } // a flag's hollow
    if (k === 3) { // the camp's mud, trodden, fading out into the earth at its ragged edge
      let u = mix(E.mud, E.mudD, clamp(fbm(x / 14, y / 12, 3, 31) * 1.6 - 0.4));
      if (h2(x | 0, y | 0, 32) > 0.985) u = mix(u, E.straw, 0.5); // straw trodden in
      const t = clamp(inCamp(X, Y) / 50) * (1 - clamp((0.45 - fbm(x / 60, y / 50, 3, 9)) * 4) * 0.7);
      c = mix(c, u, t);
      const w = fbm(x / 24, y / 18, 3, 33); if (w > 0.62 && t > 0.5) { c = mul(c, 0.7); spec = 0.5 * clamp((w - 0.62) * 8); gloss = 70; Nn = [0, 0, 1]; } // puddles
    } else if (scatter > 0) { const pb = heap(x, y * SN + 0.37 * x, 4.6, 12); if (pb.d < 0.85 && h2(pb.id, 2, 13) < 0.7 * scatter) { c = mul(mix(E.grav, E.gravD, h2(pb.id, 1, 13)), 1 - 0.3 * pb.d * pb.d); Nn = [pb.du * 0.6, pb.dv * 0.6, 1]; } } // gravel kicked into the earth
  }
  // a doorway's floor: steps going down into the dark
  for (const d of [...Object.values(DOORS), ...TUNNEL]) if (Math.abs(X - d.x) < d.w / 2 + 1 && Y < d.y + 1 && Y > d.y - RECESS - 40) {
    const t = clamp((d.y - Y) / (RECESS + (d.y < 100 ? 16 : 0))), step = Math.floor((d.y - Y) / 3) & 1;
    return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6, 3)), (step ? 0.75 : 1) * (1 - 0.9 * t)), N: step ? [0, 0.3, 1] : [0, 0, 1], spec: 0.03 };
  }
  // a pit's lip: earth thrown up round it, paler, bones in it, raised toward the drop
  for (const [hx, hy, a, b] of HOLES) { const dx = (X - hx) / a, dy = (Y - hy) / b, d = Math.hypot(dx, dy), out = 1.3 + 0.5 * vn(X / 6, Y / 6, 44); if (d < 1 || d > out) continue;
    const t = 1 - (d - 1) / (out - 1), n = vn(x / 3.5, y / 3.5, 43), cl = vn(x / 2, y * SN / 2, 46), lump = cl > 0.6 ? (cl - 0.6) * 2.5 : 0; // spoil thrown up, in clods; a bone in it
    c = mix(c, n > 0.8 ? mix(C.bone, C.boneD, 0.3) : mul(mix(E.turned, E.turnedL, cl), 0.85 + 0.4 * lump), clamp(t * 1.6) * 0.9); Nn = [dx * 0.6 * t + lump * 0.4 * (cl - 0.7), dy * 0.6 * t - lump * 0.3, 1]; }
  // the chasm's lip: broken stone, paler, then the drop
  { const e = Math.abs(X - chasmX(Y)) - chasmLip(X, Y); if (!crossing(Y) && e > -1 && e < 6 + 3 * vn(X / 6, Y / 6, 42)) { // blocks of it, cracked off
    const b = flags(x * 1.6, y * 1.6, 20, 14, 41), t = clamp(e / 7);
    c = mix(mul(mix(C.stB, C.stC, vn(x / 3, y / 3, 41)), b.e < 1.3 ? 0.4 : 0.8 + 0.35 * (1 - t)), C.grime, t * 0.6); Nn = b.e < 1.3 ? [0, 0, 1] : b.N; } }
  // the dark creeps in from the cliffs
  const dn = Y - north(X), ds = south(X) - Y, dw = Math.min(X - XW, XE - X, dn * 1.4, ds * 2) + 14 * (fbm(X / 16, Y / 16, 2, 45) - 0.5); // ragged, scree at its foot
  if (dw < 22) { c = mix(c, E.earthD, (1 - Math.max(0, dw) / 22) * 0.7); const sc = item2(x, y * SN, 7, clamp(1 - dw / 12) * 0.5, 46); if (sc && sc.d < 1) { c = mul(mix(C.stC, C.wallD, sc.h), 0.5 + 0.4 * (1 - sc.d)); Nn = [sc.dx * 0.6, sc.dy * 0.6, 1]; } }
  if (blood[i]) { const a = blood[i] / 255; c = mix(c, mix(C.bloodD, C.blood, vn(x / 4, y / 4, 8) * 0.6), a); if (a > 0.3) { spec = 0.4 * a; gloss = 70; Nn = [0, 0, 1]; } }
  // the burnt shadows under the breach (V10): each a figure on its knees burnt into the earth, the iron ring it was chained to before it
  for (const [sx, sy] of SHADOWS) { const dx = X - sx, dy = Y - sy; if (Math.abs(dx) > 9 || Math.abs(dy) > 14) continue;
    const e = (ex, ey, a, b) => ((dx - ex) / a) ** 2 + ((dy - ey) / b) ** 2 < 1, rag = vn(x / 1.5, y / 1.5, sx) > 0.25;
    if (rag && (e(0, -9, 2.4, 2.2) || e(0, -3, 3.6, 4.6) || e(0, 3, 4.8, 2.6) || e(-4.5, -3, 1.2, 4) || e(4.5, -2, 1.2, 4.2))) { c = mix(c, L('#100c0a'), 0.85); Nn = [0, 0, 1]; spec = 0.02; }
    if (Math.abs(Math.hypot(dx, (dy - 10) * 1.6) - 2.2) < 0.6) { c = mix(C.iron, C.rust, 0.4); Nn = [0, 0.4, 1]; spec = 0.4; gloss = 40; } }
  // bone splinters and teeth, more in the fields
  { const cx = Math.floor(x / 10), cy = Math.floor(y * SN / 10); // two texels thick at the least: no specks
    if (h2(cx, cy, 300) < (k === 0 ? 0.003 + 0.005 * flavor(X, Y)[5] : 0.002)) { const an = h2(cx, cy, 301) * 3.14, lx = x - (cx * 10 + 5), ly = y * SN - (cy * 10 + 5), u = lx * Math.cos(an) + ly * Math.sin(an), v = -lx * Math.sin(an) + ly * Math.cos(an), L2 = 2.5 + 1.5 * h2(cx, cy, 302);
      if (Math.abs(v) < (Math.abs(u) > L2 - 0.8 ? 1.3 : 1) && Math.abs(u) < L2) { c = mix(c, mix(C.bone, C.boneD, 0.3 * h2(cx, cy, 303)), 0.7); Nn = [0, -v * 0.5, 1]; }
      else if (v > 0 && v < 1.8 && Math.abs(u) < L2) c = mul(c, 0.7); } }
  return { alb: c, N: Nn, spec, gloss };
}

// ---------- models ----------
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
    if (f.kind === 'vault') return Hh + 46 * clamp(1 - Math.max(u / half, Math.abs(y - yc) / hd)); // le caveau: a stone pyramid
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
        if (f.kind === 'bones') return heapMat(x, y); // heaped skulls, as the walls' crest
        const s = slate(x, y * 0.6 + z, f.x0);
        return { alb: mul(s, 0.9 * (z < Hh + 6 ? 0.55 + 0.45 * clamp((z - Hh) / 6) : 1)), spec: 0.04 }; // its eave in shade
      }
      if (f.kind === 'bones' && z > Hh - 12) return heapMat(x, y); // its ragged top's steep bits
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
/** The north cliff and the arches cut into it: the refuge's stairs climbing into the dark, the gallery's two mouths. */
function cliff() {
  const hw = DOORS.refuge.w, YD = wy(92), R0 = hw * 1.2;
  const arch = (x) => ARCHES.reduce((b, a) => (Math.abs(x - wx(a.x)) < Math.abs(x - wx(b.x)) ? a : b));
  return {
    sdf: (x, y, z) => {
      const X = rx(x), zs = z + 9 * (vn(x / 60, 0, 54) - 0.5), bed = Math.floor(zs / 11); // its beds of rock, each standing out or back: ledges
      const face = wy(north(X)) + 7 * (fbm(x / 40, z / 30, 3, 41) - 0.5) + 6 * (vn(x / 45 + bed * 7.3, bed * 3.1, 58) - 0.5) + 2 * (vn(x / 9, z / 7, 59) - 0.5) - z * 0.06;
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
      const n = fbm3(x * 0.04, y * 0.04, z * 0.05, 4, 51), zs = z + 9 * (vn(x / 60, 0, 54) - 0.5); // strata, dipping a little
      let c = mix(L('#3c352c'), L('#14110d'), clamp(n * 1.7 - 0.35)), Nn;
      c = mul(c, 0.8 + 0.35 * h2(Math.floor(zs / 11), 0, 55)); // the beds of rock, each its own shade
      if (zs % 11 < 1.4) { c = mul(c, 0.45); Nn = [0, 0.6, -0.8]; } // and the seams between them
      if (Math.abs(vn(x / 7, z / 60, 56) - 0.5) < 0.03) { c = mul(c, 0.35); Nn = [0, 1, 0]; } // cracks down the face
      c = mix(c, L('#1a2014'), clamp((vn3(x * 0.02, 0, z * 0.08, 52) - 0.5) * 3) * 0.6); // seeping damp
      if (z < 30) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 53) - 0.45) * 2 * (1 - z / 30));
      if (nz > 0.45) c = mix(mul(c, 0.7), C.grime, 0.4); // grit settled on its ledges
      return { alb: mul(c, clamp(1.1 - z / 220)), N: Nn, spec: 0.06, gloss: 16 };
    },
    bounds: [0, -40, 0, W, wy(110), VAULT + 20], step: 0.7,
  };
}
/** The rock round the cavern but the north cliff: west, east and south rims, rising low past the floor's edge. */
function rim(x0, x1, y0, y1, out) {
  return { sdf: (x, y, z) => (z - Math.min(30, Math.max(-4, (out(rx(x), ry(y)) + 8 * fbm(x / 30, y / 30, 2, 62) - 6) * 3))) * 0.3, mat: rimMat, bounds: [wx(x0), wy(y0), -2, wx(x1), wy(y1), 34], step: 0.9 };
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
/** The well at the far end: a round coping broken open on its south side, where iron rungs go down into the dark; a
 *  winch on two posts, its chain hanging down the shaft. */
function wellHead() {
  const R1 = 52, R0 = 38, Z = 26, gap = (x, y) => y > 0 && Math.abs(x) < 24;
  return {
    sdf: (x, y, z) => {
      const r = Math.hypot(x, y * 1.0);
      let d = Math.max(Math.abs(r - (R0 + R1) / 2) - (R1 - R0) / 2, Math.abs(z - Z / 2) - Z / 2) - 1.2 * (vn3(x * 0.2, y * 0.2, z * 0.2, 4) - 0.5);
      if (gap(x, y)) d = Math.max(d, 24 - Math.abs(x)); // broken open
      d = Math.min(d, Math.max(r - R0 - 1, Math.abs(z - 1) - 1)); // the dark down the shaft
      for (const s of [-1, 1]) d = Math.min(d, sdBox(x, y, z, s * (R1 - 4), -6, 48, 3, 3, 48, 0.6)); // the winch's posts
      d = Math.min(d, sdBox(x, y, z, 0, -6, 92, R1 - 2, 2.4, 2.4, 0.8), sdBox(x, y, z, 0, -6, 92, 7, 7, 7, 1)); // its beam, its drum
      d = Math.min(d, Math.max(Math.hypot(x, y + 6) - 0.9, z - 92, -z + 4)); // its chain
      for (let zz = 4; zz < 26; zz += 7) d = Math.min(d, sdBox(x, y, z, 0, R0 + 2, zz, 11, 1, 1, 0.3)); // the rungs, down the gap
      return d;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const r = Math.hypot(x, y);
      if (r < R0 + 0.5 && z < 2.5) return { alb: C.void, noAO: true }; // the dark down the shaft
      if (z > 30 || Math.abs(Math.hypot(x, y + 6)) < 1.5) return z > 84 && Math.abs(x) < 10 ? ironMat(x, y, z) : z > 30 && Math.abs(x) > R1 - 9 ? { alb: mix(C.wood, C.woodD, vn3(x, y, z * 0.2, 3)) } : ironMat(x, y, z);
      if (y > R0 && Math.abs(x) < 12) return ironMat(x, y, z);
      let c = stone3(x, y, z, mul(C.stB, 1.05), 9);
      if (r < R0 + 3 && nz < 0.5) c = mul(c, clamp(z / Z) * 0.8); // its inner wall sinking into the dark
      if (nz > 0.6) c = mix(c, C.grime, 0.3);
      return { alb: mix(c, C.moss, clamp(vn3(x * 0.1, y * 0.1, z * 0.1, 5) - 0.55) * 1.2), spec: 0.04 };
    },
    bounds: [-R1 - 4, -R1 - 4, -1, R1 + 4, R1 + 4, 104], step: 0.6,
  };
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
/** A grave's stone: dirty as cut, mossy, or dark granite; on the far side blackened by the Order's fires, no moss. */
const weathered = (m, g) => {
  const t = g.x > 2640 ? 3 : Math.floor(h2(g.seed, 2, 3) * 3);
  return t === 0 ? m : { ...m, mat: (...a) => { const r = m.mat(...a); return { ...r, alb: t === 1 ? mix(r.alb, C.moss, 0.35) : t === 2 ? mul(r.alb, 0.55) : mul(mix(r.alb, C.grime, 0.5), 0.45) }; } };
};
for (const g of GRAVES) {
  const P = [wx(g.x), wy(g.y - g.h / 2), h2(g.seed, 3, 3) < 0.2 ? -2 - 6 * h2(g.seed, 4, 3) : 0], a = (h2(g.seed, 0, 3) - 0.5) * 0.3; // some sunk
  let m = g.kind === 'cross' ? cross(38 + (g.seed % 5) * 2) : g.kind === 'stele' ? stele(30 + (g.seed % 4) * 2) : g.kind === 'lying' ? cross(36, true) : sarcophagus(g.seed);
  if (g.s !== 1) m = scaled(m, g.s);
  if ((g.kind === 'cross' || g.kind === 'stele') && h2(g.seed, 5, 3) < 0.15) m = broken(m, (x, y) => (14 + 8 * h2(g.seed, 6, 3)) * g.s + 3 * vn(x / 3, y / 3, g.seed)); // broken off
  add('grave', weathered(m, g), P, g.kind === 'lying' ? Math.PI / 2 + a : g.kind === 'tomb' ? a * 0.3 : a);
}
const wood = (m, x, y, z) => ({ alb: mix(C.wood, C.woodD, vn3(x * 0.3, y * 0.3, z * 0.05, 3)), spec: 0.05 });
const stoneM = (m, x, y, z) => ({ alb: stone3(x, y, z, C.stB, 9), spec: 0.04 });
/** The vignettes' models, each a few objects of its own at its feet line (room px o.x, o.y). */
const VIGNETTES = {
  gibbet: (o) => { const P = [wx(o.x), wy(o.y - 3), 0];
    for (const s of [-1, 1]) add('gibbet', block(s * 34 - 3, -3, 0, s * 34 + 3, 3, 156, wood, 0.6), P);
    add('gibbet', block(-40, -3, 150, 40, 3, 157, wood, 0.6), P);
    add('corpse', wristCorpse(5, 150), [P[0], P[1] + 2, 0]); },
  burnt: (o) => { add('corpse', burnt(), [wx(o.x), wy(o.y - 4), 0], -0.4); add('stake', charred(stake(64, 5)), [wx(o.x) - 5, wy(o.y - 4) - 12, 0]); /* staked down */add('ring', block(-5, -1.5, 0, 5, 1.5, 3, ironMat, 1), [wx(o.x - 12), wy(o.y - 14), 0]); },
  shrine: (o) => { const P = [wx(o.x), wy(o.y - 5), 0];
    add('shrine', block(-26, -14, 0, 26, 14, 12, stoneM, 1.5), P);
    add('statue', broken(statue(4), (x, y) => 128 + 14 * vn(x / 6, y / 6, 4)), [P[0], P[1], 12]);
    for (const [dx, dy] of [[-20, 18], [-8, 22], [10, 21], [22, 17]]) add('skull', skull(), [P[0] + dx, P[1] + dy, 0], dx * 0.1); },
  nest: (o) => { const P = [wx(o.x), wy(o.y - 6), 0]; add('nest', scaled(pitBodies(9, 80, 30), 1.6), P, 0.2); add('bones', pitBones(4), [P[0] + 60, P[1] + 14, 0], 1.2); add('bones', pitBones(6), [P[0] - 64, P[1] - 4, 0], 2.2);
    for (let k = 0; k < 7; k++) add('skull', skull(), [P[0] - 50 + k * 16, P[1] + 30 + 6 * Math.sin(k * 2), 0], k); },
  opengrave: (o) => { const P = [wx(o.x), wy(o.y - 4), 0]; add('corpse', exhumed(13), P, 1.4); add('stake', broken(stake(40, 3), (x) => 18 + x), [P[0] + 30, P[1] - 6, 0]);
    add('rubble', rubble(7, 16, 8), [P[0] - 34, P[1] - 4, 0], 0.5); },
  pyre: (o) => { const P = [wx(o.x), wy(o.y - 6), 0]; add('pyre', pyre(), P); add('stake', stake(170, 4), P);
    add('corpse', charred(wristCorpse(7, 150)), [P[0], P[1] + 4, 18]); },
  cage: (o) => { const P = [wx(o.x), wy(o.y - 6), 0]; add('cage', cage(46, 30, 70), P); add('corpse', slumped(11), [P[0] - 4, P[1] - 4, 1]); },
  reliquary: (o) => { const P = [wx(o.x), wy(o.y - 6), 0]; add('dais', block(-30, -16, 0, 30, 16, 8, stoneM, 1), P);
    add('chest', chest(3), [P[0], P[1], 8]); add('cage', cage(40, 26, 52), [P[0], P[1], 8]); },
  toll: (o) => { const P = [wx(o.x), wy(o.y - 2), 0]; add('post', block(-2, -2, 0, 2, 2, 74, wood, 0.4), P);
    add('toll', block(-16, -1.5, 46, 16, 1.5, 68, (m, x, y, z) => { // the board, fangs nailed into it in rows
      const fx = Math.floor((x + 16) / 3.2), fz = Math.floor((z - 46) / 4.4);
      return h2(fx, fz, 61) < 0.45 && Math.abs(((x + 16) % 3.2) - 1.6) < 0.7 && ((z - 46) % 4.4) < 2.6 ? { alb: mix(C.bone, C.wax, 0.4), spec: 0.3, gloss: 40 } : wood(m, x, y, z); }, 0.3), P); },
  bucket: (o) => { const P = [wx(o.x), wy(o.y - 3), 0];
    add('bucket', { sdf: (x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - 6) - 1, Math.abs(z - 8) - 8), mat: (m, x, y, z, nx, ny, nz) => ({ alb: z > 12 || nz > 0.5 ? mix(C.blood, C.bloodF, 0.5) : wood(m, x, y, z).alb, spec: z > 12 ? 0.5 : 0.05, gloss: 60 }),
      bounds: [-8, -8, 0, 8, 8, 17], step: 0.6 }, P);
    add('basket', scaled(chest(5), 0.5), [P[0] + 18, P[1] + 6, 0], 0.3); },
};
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
  else if (o.kind === 'cross') add('cross', cross(46), P, 0.15);
  else if (VIGNETTES[o.kind]) VIGNETTES[o.kind](o);
  else if (o.kind === 'rubble') add('rubble', rubble(o.x % 31, wx(o.r) * 0.8, 18), [wx(o.x), wy(o.y - o.h), 0], h2(o.x, 0, 3) * 6);
}
for (const [x, y, r] of TALUS) add('rubble', rubble(x % 31, wx(r) * 0.8, 18), [wx(x), wy(y), 0], h2(x, 0, 3) * 6);
for (const [x, y] of BRAZIERS) add('brazier', brazier2(true), [wx(x), wy(y - 4), 0]);
add('pyre', pyre(), [wx(PYRE[0]), wy(PYRE[1] - 6), 0]);
add('well', wellHead(), [wx(WELL.x), wy(WELL.y), 0]);
for (const [x, y] of [[3672, 1214], [3724, 1170], [3746, 1206]]) add('skull', skull(), [wx(x), wy(y), 0], x % 6);
for (const [x, y] of LANTERNS) add('lantern', pole(120), [wx(x), wy(y), 0]);
for (const [x, y] of STAKES) { add('stake', charred(stake(78, x % 7)), [wx(x), wy(y), 0]); add('skull', skull(), [wx(x + 4), wy(y + 3), 0], 2); }
/** A group of `n` candles at room px (x, y), as an object of its own (culled with the chunks). */
const candles = (x, y, n) => add('candles', candles2([...Array(n)].map((_, k) => [wx(k * 3 + 1), (k % 2) * 4, 0, 4 + h2(x, k, 3) * 9, 1.2 + h2(x, k, 4) * 0.3, (h2(x, k, 5) - 0.5) * 0.8, 0])), [wx(x), wy(y), 0]);
for (const [x, y, n] of [...CANDLES, ...GRAVE_CANDLES]) candles(x, y, n);
for (const [x, y] of MAUS) { candles(x - 18, y + 3, 2); candles(x + 12, y + 3, 1); } // a pair at each mausoleum's door
// Skulls on the floor, most of them in the middle's north band; bones; skulls and bones fallen at the walls' feet.
for (let k = 0; k < 250; k++) {
  const mid = k >= 60, x = mid ? 1450 + R() * 1140 : 60 + R() * (RW - 120), y = mid ? 100 + R() * 590 : 120 + R() * (RH - 200);
  if (!taken(x, y, 4) && clear(x | 0, y | 0, 2)) { const yaw = R() * 6; if (!aside(x, y)) add('skull', skull(), [wx(x), wy(y), 0], yaw); }
}
for (let k = 0; k < 24; k++) { const x = 60 + R() * (RW - 120), y = 120 + R() * (RH - 200); if (!taken(x, y, 12) && clear(x | 0, y | 0, 6)) { const yaw = R() * 6; if (!aside(x, y)) add('bones', pitBones(k + 3), [wx(x), wy(y), 0], yaw); } }
add('bones', pitBones(9), [wx(2655), wy(342), 0], 0.4); // in the Dawn, their shadows long
const fallen = (x, y, n) => { if (!pit(x, y) && !rock(x, y) && Object.values(DOORS).every((d) => Math.hypot(d.x - x, d.y - y) > 50)) for (let k = 0; k < n; k++) add('skull', skull(), [wx(x + (R() - 0.5) * 10), wy(y + (R() - 0.5) * 4), 0], R() * 6); };
for (const w of WALLS.filter((w) => w.h > 70 || w.end)) {
  if (w.x1 - w.x0 > w.y1 - w.y0) for (let x = w.x0 + 15; x < w.x1 - 10; x += 30 + 10 * R()) { fallen(x, w.y1 + 3 + R() * 3, 2 + (R() * 3 | 0)); if (R() < 0.3) fallen(x + 12, w.y0 - 3, 1); }
  else for (let y = w.y0 + 20; y < w.y1 - 10; y += 30 + 10 * R()) { fallen(w.x0 - 3 - R() * 3, y, 1 + (R() * 2 | 0)); fallen(w.x1 + 3 + R() * 3, y, 1 + (R() * 2 | 0)); }
}
// The vault, never seen: it keeps the moon and the Dawn out but through its cracks.
const MOON = (() => { const d = [-0.5, -0.35, 0.6], l = Math.hypot(...d); return d.map((v) => v / l); })();
const SUN = (() => { const d = [0.2, 0.36, 0.91], l = Math.hypot(...d); return d.map((v) => v / l); })();
const hole = (dir, p) => crackOver(dir, p, VAULT);
const MOONH = MOONHOLES.map((m) => hole(MOON, m)), SUNH = SUNHOLES.map((s) => hole(SUN, s));
const vault = (holes, rag) => vaultOf(holes, rag, VAULT, W, RH);
add('vault-moon', vault(MOONH, 0.8), [0, 0, 0], 0, { ghost: true });
add('vault-sun', vault(SUNH, 0.2), [0, 0, 0], 0, { ghost: true }); // the breach less ragged: its Dawn fills the gap in the wall

// ---------- lights ----------
const MOONC = L('#9ab0be'), FIRE = L('#e07a30'), CANDLE = L('#d8b070'), SUNC = L('#fbf4bc'), ORDER = L('#a8ac5c'), FAR = 1e5;
light({ name: 'moon', p: [W / 2 + MOON[0] * FAR, wy(RH / 2) + MOON[1] * FAR, MOON[2] * FAR], c: MOONC, I: 0.38, r0: 1e9, R: 1e12, soft: 90, pad: 10, skip: ['vault-sun'] });
light({ name: 'sun', mask: true, p: [W / 2 + SUN[0] * FAR, wy(RH / 2) + SUN[1] * FAR, SUN[2] * FAR], c: SUNC, I: 1.8, r0: 1e9, R: 1e12, soft: 25, pad: 10, skip: ['vault-moon'] });
// the cold that the cracks let in: a faint fill from above and from the south, so shapes read in the dark
light({ p: [W / 2 + 0.2 * FAR, wy(RH / 2) + 0.5 * FAR, 0.85 * FAR], c: MOONC, I: 0.3, r0: 1e9, R: 1e12, noShadow: true });
for (const [x, y] of BRAZIERS) light({ p: [wx(x), wy(y - 4), 48], c: FIRE, I: 4, r0: 40, R: 420, soft: 6, pad: 8, haze: 0.02, hazeR: 7, skip: ['brazier'] });
light({ p: [wx(PYRE[0]), wy(PYRE[1] - 6), 40], c: FIRE, I: 9, r0: 60, R: 700, soft: 10, pad: 14, haze: 0.03, hazeR: 14, skip: ['pyre'] });
for (const [x, y, n] of CANDLES) light({ p: [wx(x + n * 1.5), wy(y) + 2, 16], c: CANDLE, I: 0.8 + 0.4 * n, r0: 20, R: 220, soft: 4, pad: 3, haze: 0.012, hazeR: 3, skip: ['candles'] });
for (const [x, y, n] of GRAVE_CANDLES) light({ p: [wx(x + n * 1.5), wy(y) + 2, 16], c: CANDLE, I: 0.6 + 0.4 * n, r0: 18, R: 160, soft: 4, pad: 3, haze: 0.01, hazeR: 3, skip: ['candles'] });
for (const [x, y] of MAUS) light({ p: [wx(x), wy(y + 3) + 2, 16], c: CANDLE, I: 1.4, r0: 18, R: 180, soft: 4, pad: 3, haze: 0.01, hazeR: 3, skip: ['candles'] });
for (const [x, y] of LANTERNS) light({ p: [wx(x), wy(y), 124], c: ORDER, I: 6, r0: 30, R: 300, soft: 6, pad: 6, haze: 0.012, hazeR: 5, skip: ['lantern'] });
for (const d of Object.values(DOORS)) if (!d.well) light({ p: [wx(d.x), wy(d.y - RECESS - 6), 26], c: CANDLE, I: 1.4, r0: 16, R: 160, soft: 4, pad: 4 }); // a glow deep in each doorway
// The vignettes' own: les Bûchers' pyre, the shrine's last candle; the rot glowing pale green round le Puits' dead.
for (const o of PROPS.filter((o) => o.kind === 'pyre')) light({ p: [wx(o.x), wy(o.y - 6), 40], c: FIRE, I: 8, r0: 50, R: 600, soft: 10, pad: 12, haze: 0.03, hazeR: 12, skip: ['pyre', 'corpse', 'stake'] });
for (const o of PROPS.filter((o) => o.kind === 'shrine')) { candles(o.x + 14, o.y + 3, 1); light({ p: [wx(o.x + 15), wy(o.y + 3) + 2, 16], c: CANDLE, I: 1.1, r0: 18, R: 160, soft: 4, pad: 3, skip: ['candles'] }); }
for (const [x, y] of ROT) light({ p: [wx(x), wy(y), 8], c: L('#8a9a4a'), I: 1.3, r0: 20, R: 170, soft: 6, pad: 4, haze: 0.008, hazeR: 4 });
for (const [x, y] of MOONHOLES) light({ p: [wx(x), wy(y), 30], c: MOONC, I: 0.3, r0: 60, R: 260, noShadow: true, noEnv: true }); // what a moonlit patch throws back

/** A hole's far side at world (x, z < 0), the necropolis cut through: turned earth with the dead in it (bones, skulls,
 *  a coffin's end), then beds of rock into the dark; `dim`: how the depth darkens it (as ground() does). */
function cutAt(x, z, dim) {
  const soil = 30 + 16 * vn(x / 40, 0, 47), d = -z;
  let c;
  if (d < soil) {
    c = mix(E.turned, E.earthD, clamp(fbm(x / 9, z / 6, 3, 48) * 1.4 - 0.2));
    if (d < 4 + 2 * vn(x / 5, 0, 49)) c = mix(c, E.moss, 0.4); // the sod
    const cx = Math.floor(x / 26), cz = Math.floor(d / 22), hc = h2(cx, cz, 50);
    if (hc < 0.12 && d > 8) { const u = x - (cx + 0.2 + 0.6 * h2(cx, cz, 51)) * 26, v = d - (cz + 0.5) * 22; // a coffin's end, rotten
      if (Math.abs(u) < 7 && Math.abs(v) < 5) c = Math.abs(u) > 6 || Math.abs(v) > 4 ? mul(C.woodD, 0.6) : mix(C.wood, C.woodD, vn(x / 2, d / 0.8, 52)); }
    const bx = Math.floor(x / 8), bz = Math.floor(d / 6), hb = h2(bx, bz, 53);
    if (hb < 0.13 && d > 5) { const u = x - (bx + 0.5) * 8, v = d - (bz + 0.5) * 6;
      if (hb < 0.035 ? Math.hypot(u / 2.8, v / 2.4) < 1 : Math.abs(v + u * (h2(bx, bz, 54) - 0.5)) < 0.9 && Math.abs(u) < 3.6) c = hb < 0.035 && Math.hypot(Math.abs(u) - 1, v + 0.4) < 0.7 ? C.mortar : mix(C.bone, C.boneD, 0.35 + 0.4 * vn(x, d, 55)); }
  } else { // the rock's beds
    const zs = d + 6 * (vn(x / 50, 0, 56) - 0.5);
    c = mul(mix(L('#3c352c'), L('#14110d'), clamp(fbm(x / 20, d / 10, 3, 57) * 1.7 - 0.35)), (0.8 + 0.35 * h2(Math.floor(zs / 10), 0, 58)) * (zs % 10 < 1.3 ? 0.45 : 1));
  }
  return mul(c, dim);
}
const ground0 = ground(floorAt, (X, Y) => pit(X, Y, 1));
const env = (ox, oy, oz) => { const r = ground0(ox, oy, oz); const z = r.P[2]; return z < 0 && r.alb !== C.void ? { ...r, alb: cutAt(r.P[0], z, (0.25 + 0.75 * clamp(1 + z / 140) ** 2) * (z > -6 ? 1.1 : 0.8)) } : r; };
const SC = { W, H, cam, off: 0, offX: 0, objects: S.objects, lights: S.lights, env, envShadow: pitShadow((X, Y) => pit(X, Y, 1)), ambient: L('#3a4450').map((v) => v * 0.07) };
export async function scene() { return SC; }
/** Gate `k` of GATES let down to `d` room px above its sill (d >= its height: raised out of sight). */
export function raise(sc, k, d) { ports[k].pos[2] = d >= GATE_RISE ? -400 : wz(d); }
export const GATE_RISE = 44; // room px: a gate's travel up into its gatehouse, its frames 4 px apart

/** The air of the moon's and the Dawn's shafts, along each pixel's sight line through the cracks; added to a chunk's
 *  render (`x0`, `y0`: its first texel in the zone) before it is baked. */
export const finish = (img, x0, y0) => shafts(img, x0, y0, [...MOONH.map((o) => [o[0], o[1], o[2], o[2], MOON, MOONC, 0.006]), ...SUNH.map((o) => [...o, SUN, SUNC, 0.05])], VAULT);
export const PAL = [...CRYPT_PAL, ...[['#b8a466', '#d8c886', '#ece0a8', '#f8f0cc', '#fffbe8']].flatMap((s) => s.map((c) => hex(c).map((v) => v * 255)))];
export const POST = { exposure: 3.3, vignette: 0.2, desat: 0.18, grain: 0.012, dither: 0.02 };
export const GRAVE_COUNT = GRAVES.length;
/** What the game places from the plan (src/necropolis.data.ts): the set pieces, routes, nests, the notes' spots, and the
 *  mounds an Enterré may lie under (each grave's but a tomb's, its middle). */
export const DATA = { POSTS, ROUTES, RATS, NOTES, MOUNDS: GRAVES.filter((g) => g.kind !== 'tomb').map((g) => [g.x, Math.round(g.y + 9 * g.s)]) };
/** The floor's kind at room px (X, Y), for the map (tools/art/map.gen.mjs): 0 earth, 1 gravel, 2 paving, 3 the camp's mud. */
export const floorKind = (X, Y) => kind[Math.floor(Y) * RW + Math.floor(X)] ?? 0;
