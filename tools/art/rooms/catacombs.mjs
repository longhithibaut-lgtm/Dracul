// Les catacombes (docs/extraction.md §4), the second open zone, under the necropolis: 6 x 4 screens (2880 x 1080 room px)
// of galleries dug in bone and rock, baked chunk by chunk by tools/art/zone.gen.mjs like la nécropole (its kit, its
// vocabulary). Down the well at the necropolis' far end; galleries lined with skulls, crossroads, dead ends, ossuary
// niches, black water, rat nests, collapsed passages; two big chambers, le nid (the ghouls' nest) and la prison de Vesna
// (the arena round her sealed reliquary, deepest); the stairs up to the necropolis' near field behind a portcullis
// raised from below (the shortcut). Its plan is the single source of truth for the art and the game, as the necropolis'.
// The rock is one height field over the floor's outline: low where it meets a gallery to its north (so it never hides
// one), tall where its face looks south at the camera, battered on its flanks.
// World units as in common.mjs: x east, y south, z up; a room px of floor is 2 world units across and 2 / SN deep.
import { sdBox, sdEll, clamp, vn, fbm, vn3, fbm3, h2, L, hex, mix, mul, mulberry32 } from '../maquettes/hub3/lib.mjs';
import { pillar, portcullis, skull, slumped, cage } from '../maquettes/grand/cast.mjs';
import { oldCoffin, sign } from '../maquettes/hub3/props2.mjs';
import { candles2, brazier2, rubble, chest } from '../maquettes/hub3/props3.mjs';
import { pitBones } from '../maquettes/hub/props.mjs';
import { cross } from '../maquettes/cloitre/props.mjs';
import { cam, SN, CS, wx, wy, wz, rx, ry, C, broken, scaled, stage, flags, grime, ashlar, stain, segDist, stone3, ironMat } from './common.mjs';
import { ground, pitShadow, medallion, PAL as CRYPT_PAL } from './crypts.mjs';
import { heap, heapMat, boneFace, boneWall, inPointed, archTop, gatehouse, lever, sarcophagus, banner, pole, crackOver, vaultOf, shafts } from './zone-kit.mjs';

export const ABOUT = 'Les catacombes';
export const RW = 2880, RH = 1080, SW = 480, SH = 270; // the zone; a screen, the chunk the game loads
const W = 2 * RW, VAULT = 320, HMAX = 92; // world units: the ceiling never seen, the rock's faces at their tallest
const R = mulberry32(2417);

// ---------- the plan (room px) ----------
// Galleries: [width, polyline]. Chambers: ellipses x, y, rx, ry (a chamber's lobes listed together).
const WAYS = [
  [56, [[2520, 205], [2380, 200], [2210, 210]]], // the well's bottom to the east crossroads
  [52, [[2110, 205], [1960, 180], [1800, 172], [1640, 185], [1500, 240], [1440, 290]]], // the ossuary gallery
  [42, [[1712, 180], [1722, 76]]], // its dead end north, niches all round
  [48, [[1340, 296], [1150, 240], [960, 205], [720, 195], [520, 178], [380, 172]]], // the west gallery to the stairs up
  [40, [[1040, 214], [1062, 92]]], // a dead end north
  [40, [[700, 200], [690, 330]]], // a dead end south, fallen in
  [34, [[262, 210], [218, 320], [262, 420], [360, 470]]], // the rat-run down to the nest
  [50, [[1352, 362], [1160, 420], [960, 470], [830, 540]]], // the great crossroads to the nest
  [46, [[1420, 378], [1440, 520]]], // the great crossroads down to the black water
  [44, [[2160, 250], [2150, 370], [2092, 460]]], // the east crossroads down to the rats
  [44, [[1700, 600], [1850, 568], [1990, 530]]], // the black water to the rats
  [38, [[2140, 545], [2282, 560]]], // the rats' passage, fallen in
  [46, [[1440, 730], [1440, 885]]], // the black water down to the low crossroads
  [50, [[880, 768], [1080, 880], [1380, 930]]], // the nest to the low crossroads
  [52, [[1480, 950], [1700, 1004], [1950, 1014], [2180, 1012]]], // the low gallery to the prison
];
const CHAMBERS = [
  [2600, 200, 92, 66], // the well's bottom
  [2160, 210, 54, 46], // the east crossroads
  [1400, 320, 74, 60], // the great crossroads
  [300, 170, 84, 56], // the stairs up, the shortcut
  [610, 610, 250, 150], [450, 530, 120, 90], [790, 700, 150, 100], [540, 735, 150, 70], // le nid
  [1530, 625, 200, 125], // the black water
  [2060, 510, 110, 66], // the rats
  [1440, 935, 56, 50], // the low crossroads
];
// La prison de Vesna (the arena, closed for now: its boss comes later), its south wall of bones, its antechamber.
export const ARENA = [2100, 660, 2620, 960];
const MED = [2360, 840]; // the medallion carved in its floor (room px)
const WALL_Y = [960, 974], ANTE = [2160, 974, 2560, 1056];
const WATER = [1572, 650, 128, 62]; // the black water's pool: ellipse x, y, rx, ry
// Holes in the floor, down into a deeper dark: x, y, rx, ry.
export const HOLES = [[1342, 344, 14, 8], [700, 560, 18, 10]];
// The ways out: the ladder up the well to the necropolis (its foot in the well's north wall), and the stairs up to the
// necropolis' near field (le caveau) behind the shortcut's portcullis. x: the doorway's middle, y: its threshold, w.
export const DOORS = { puits: { x: 2600, y: 138, w: 32, name: 'La nécropole' }, caveau: { x: 300, y: 118, w: 32, name: 'La nécropole' } };
const RECESS = 14;
// The shortcut: raised from the south (the catacombs' side) at its winch, for good (save.ts); its other side is the
// necropolis' caveau, whose door it opens. The arena's gate in its wall of bones: open until the fight shuts it.
export const GATES = [
  { id: 'caveau', name: 'La grille du caveau', x0: 280, x1: 320, y0: 104, y1: 118, side: 1, lever: { x: 340, y: 150 }, arch: true },
  { id: 'prison', name: 'La grille de la prison', x0: 2330, x1: 2370, y0: WALL_Y[0], y1: WALL_Y[1], side: 1, lever: null, arena: true },
];
export const TUNNEL = [];
const WALLS = [{ x0: 2088, y0: WALL_Y[0], x1: 2330, y1: WALL_Y[1], h: 80 }, { x0: 2370, y0: WALL_Y[0], x1: 2632, y1: WALL_Y[1], h: 80 }];
/** Vesna's reliquary: its feet line's middle; F within reach of `at` says it is sealed (the boss, later, opens it). */
export const RELIQUARY = { x: 2360, y: 704, at: { x: 2360, y: 724 } };

// ---------- ossuaries: the rock's faces where skulls are stacked, the niches cut into them ----------
// Spans of face (room px rects: their foot inside) lined with skulls; the rest is the dug rock.
const OSSUARY = [[1440, 60, 2140, 260], [1690, 40, 1760, 200], [2100, 150, 2230, 260], [1320, 240, 1490, 300], [2080, 620, 2640, 700],
  [2500, 120, 2700, 180], [880, 840, 1400, 940], [1480, 930, 2200, 1000], [1000, 60, 1110, 230], [200, 100, 400, 140]];
const inSpan = (X, Y, list = OSSUARY) => list.some(([x0, y0, x1, y1]) => X >= x0 && X < x1 && Y >= y0 && Y < y1);
// ---------- the floor's outline ----------
const N = RW * RH, floor = new Uint8Array(N);
const SEGS = WAYS.flatMap(([w, pts]) => pts.slice(1).map((b, k) => [w, pts[k], b]));
const noisy = (X, Y) => 7 * (fbm(X / 22, Y / 22, 3, 5) - 0.5) + 3 * (vn(X / 6, Y / 6, 6) - 0.5); // dug, never straight
const nearDoor = (X, Y) => Math.min(...Object.values(DOORS).map((d) => Math.hypot(X - d.x, (Y - d.y) * 1.4)));
/** How far room px (X, Y) lies outside the dug floor (< 0: on it), as the rock is cut: ragged but at the doors. */
function dug(X, Y) {
  let d = 1e9;
  for (const [w, a, b] of SEGS) d = Math.min(d, segDist(X, Y, a, b) - w / 2);
  for (const [x, y, a, b] of CHAMBERS) d = Math.min(d, (Math.hypot((X - x) / a, (Y - y) / b) - 1) * Math.min(a, b));
  const [x0, y0, x1, y1] = ARENA;
  d = Math.min(d, Math.max(x0 - X, X - x1, y0 - Y, Y - y1), Math.max(x0 + 10 - X, X - x1 + 10, WALL_Y[0] - 4 - Y, Y - WALL_Y[1] - 4), Math.max(ANTE[0] - X, X - ANTE[2], ANTE[1] - 4 - Y, Y - ANTE[3]));
  const built = X > x0 - 30 && X < x1 + 30 && Y > y0 - 30 && Y < ANTE[3] + 30 ? 0.3 : 1; // the Order's walls cut true
  return d + noisy(X, Y) * built * (inSpan(X, Y - 6) ? 0.35 : 1) * clamp(nearDoor(X, Y) / 50); // the ossuaries' faces built straighter
}
for (let Y = 0; Y < RH; Y++) for (let X = 0; X < RW; X++) if (dug(X + 0.5, Y + 0.5) < 0) floor[Y * RW + X] = 1;
for (const d of Object.values(DOORS)) for (let Y = d.y - RECESS - 6; Y < d.y + 8; Y++) for (let X = d.x - d.w / 2; X < d.x + d.w / 2; X++) floor[Y * RW + X] = 1; // their recesses
/** Out of the dug floor: rock. */
export const rock = (X, Y) => { const x = Math.floor(X), y = Math.floor(Y); return x < 0 || y < 0 || x >= RW || y >= RH || !floor[y * RW + x]; };
const inWater = (X, Y, e = 0) => Math.hypot((X - WATER[0]) / WATER[2], (Y - WATER[1]) / WATER[3]) < 1 + e + 0.12 * (fbm(X / 14, Y / 10, 3, 9) - 0.5);
/** What walkers go round: the black water, the holes (`edge`: the drawn rim's wobble, none for collisions). */
export function pit(X, Y, edge = 0) {
  if (!edge && inWater(X, Y)) return true;
  for (const [x, y, a, b] of HOLES) { const dx = (X - x) / a, dy = (Y - y) / b; if (dx * dx + dy * dy < 1 + edge * 0.3 * (vn(X / 4, Y / 4, 6) - 0.5)) return true; }
  return false;
}

// ---------- the rock: its distance from the floor and its height, per room px ----------
/** Squared distances to the nearest site (f 0) along a line of n, `s` world units apart (Felzenszwalb). */
function edt1(f, n, s, out) {
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = -1;
  for (let q = 0; q < n; q++) {
    if (f[q] >= 1e20) continue;
    while (k >= 0) {
      const p = v[k], sq = ((f[q] + (q * s) ** 2) - (f[p] + (p * s) ** 2)) / (2 * s * (q - p));
      if (sq <= z[k]) k--; else { k++; v[k] = q; z[k] = sq; z[k + 1] = Infinity; break; }
    }
    if (k < 0) { k = 0; v[0] = q; z[0] = -Infinity; z[1] = Infinity; }
  }
  if (k < 0) { out.fill(1e20); return; }
  for (let q = 0, j = 0; q < n; q++) { while (z[j + 1] < q * s) j++; out[q] = (q - v[j]) ** 2 * s * s + f[v[j]]; }
}
/** World distance from each room px to the nearest px where `site` holds. */
function edt(site) {
  const g = new Float64Array(N), row = new Float64Array(RW), col = new Float64Array(RH), o1 = new Float64Array(RW), o2 = new Float64Array(RH);
  for (let y = 0; y < RH; y++) { for (let x = 0; x < RW; x++) row[x] = site(y * RW + x) ? 0 : 1e20; edt1(row, RW, 2, o1); g.set(o1, y * RW); }
  for (let x = 0; x < RW; x++) { for (let y = 0; y < RH; y++) col[y] = g[y * RW + x]; edt1(col, RH, 2 / SN, o2); for (let y = 0; y < RH; y++) g[y * RW + x] = Math.sqrt(o2[y]); }
  return g;
}
// D: into the floor (> 0) or the rock (< 0), world units; Hh: the rock's height, low by a gallery to its north, battered
// on its flanks (dSide), tallest over the arena's skulls.
const toRock = edt((i) => !floor[i]), toFloor = edt((i) => floor[i] === 1), D = new Float32Array(N), Hh = new Float32Array(N), ramp = new Uint8Array(N), rampF = new Float32Array(N);
for (let i = 0; i < N; i++) D[i] = floor[i] ? toRock[i] - 1.2 : -(toFloor[i] - 1.2);
{
  const north = new Float32Array(N), side = new Float32Array(N);
  for (let x = 0; x < RW; x++) { let n = 999; for (let y = 0; y < RH; y++) { const i = y * RW + x; n = floor[i] ? 0 : n + 1; north[i] = n; } }
  for (let y = 0; y < RH; y++) {
    let n = 999; for (let x = 0; x < RW; x++) { const i = y * RW + x; n = floor[i] ? 0 : n + 1; side[i] = n; }
    n = 999; for (let x = RW - 1; x >= 0; x--) { const i = y * RW + x; n = floor[i] ? 0 : n + 1; side[i] = Math.min(side[i], n); }
  }
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const i = y * RW + x;
    if (floor[i]) continue;
    const top = HMAX + 40 * clamp(1 - Math.abs(x - 2360) / 300) * clamp(1 - Math.abs(y - 650) / 30) + 10 * (fbm(x / 40, y / 40, 3, 12) - 0.5);
    const r = 0.5 * north[i] * (2 / SN);
    Hh[i] = Math.min(top, r, 1.7 * side[i] * 2);
    if (r < top - 4) ramp[i] = 1; // risen from a gallery to its north: seen from above, dark
  }
  const t = new Float32Array(N); // the ramps smoothed along x (the floor's ragged edge left them in steps)
  for (let y = 0; y < RH; y++) for (let x = 3; x < RW - 3; x++) {
    const i = y * RW + x;
    if (!ramp[i]) { t[i] = Hh[i]; continue; }
    let s = 0, n = 0; for (let d = -3; d <= 3; d++) if (!floor[i + d]) { s += Hh[i + d]; n++; }
    t[i] = s / n;
  }
  Hh.set(t);
  for (let i = 0; i < N; i++) rampF[i] = ramp[i];
  // its faces' height spilt onto the floor's edge (they keep their top); by a ramp's foot, the floor stays flat and calm
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
    const i = y * RW + x;
    if (!floor[i] || Hh[i] || rampF[i]) continue;
    const near = [i - 1, i + 1, i - RW, i + RW];
    if (near.some((n) => (!floor[n] && ramp[n]) || rampF[n] > 0.5)) { rampF[i] = pass ? 0.6 : 1; continue; }
    Hh[i] = Math.max(...near.map((n) => Hh[n])) * (pass ? 0.99 : 1);
  }
}
const bil = (a, X, Y) => {
  X -= 0.5; Y -= 0.5;
  const x = Math.max(0, Math.min(RW - 2, Math.floor(X))), y = Math.max(0, Math.min(RH - 2, Math.floor(Y))), u = clamp(X - x), v = clamp(Y - y), i = y * RW + x;
  return (a[i] * (1 - u) + a[i + 1] * u) * (1 - v) + (a[i + RW] * (1 - u) + a[i + RW + 1] * u) * v;
};
/** The north edge of the floor in column x (its first row), the floor found scanning up from y1 to y0; -1: none. */
const faceY = (x, y0, y1) => { let y = y1; while (y > y0 && !floor[y * RW + x]) y--; if (y <= y0) return -1; while (y > y0 && floor[y * RW + x]) y--; return y > y0 ? y + 1 : -1; };

// Niches in those faces, where the face is tall and flat enough: x, its foot y, half-width (room px).
const NICHES = [];
for (const [x0, y0, x1, y1] of OSSUARY) for (let x = x0 + 18; x < x1 - 18; x += 30 + 10 * h2(x, y0, 3)) {
  const yf = faceY(Math.round(x), y0 - 40, y1);
  if (yf < 0 || yf > y1 || Hh[(yf - 2) * RW + Math.round(x)] < 64) continue;
  if ([-10, 10].some((d) => Math.abs(faceY(Math.round(x + d), y0 - 40, y1) - yf) > 4)) continue;
  if (Object.values(DOORS).some((d) => Math.abs(d.x - x) < 40 && Math.abs(d.y - yf) < 40) || Math.abs(x - RELIQUARY.x) < 70 && yf < 700) continue;
  NICHES.push([Math.round(x), yf, 8 + Math.round(3 * h2(x, 1, 3))]);
}
const NICHE_D = 9, NICHE_Z = 56, SILL = 8; // room px deep; world height of the arch's spring, its sill
/** Inside a niche's hollow: > 0 how far, the niche's index (world point). */
function niche(x, y, z) {
  const X = rx(x), Y = ry(y);
  for (let k = 0; k < NICHES.length; k++) {
    const [nx, yf, hw] = NICHES[k];
    if (Math.abs(X - nx) > hw + 3 || Y > yf + 2 || Y < yf - NICHE_D - 3) continue;
    const u = x - wx(nx), HW = wx(hw);
    return [Math.min(HW - Math.abs(u), y - wy(yf - NICHE_D), wy(yf + 1) - y, z - SILL, archTop(u, HW, NICHE_Z - 16, HW * 1.15) - z), k];
  }
  return [-1e9, -1];
}

// ---------- the floor's rasters ----------
// kind: 0 dust, 1 flagstones, 2 black water, 3 its mud, 4 the nest's filth, 5 the rats' straw; trod: the patrols' path.
const kind = new Uint8Array(N), blood = new Uint8Array(N), trod = new Uint8Array(N);
const paint = (x0, y0, x1, y1, f) => { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(RH, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(RW, Math.ceil(x1)); x++) f(y * RW + x, x, y); };
for (const [w, a, b] of SEGS) paint(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (i, x, y) => {
  const d = segDist(x, y, a, b) - w * 0.16 - 4 * (vn(x / 9, y / 9, 31) - 0.5);
  if (d < 0) trod[i] = Math.max(trod[i], Math.min(255, -d * 40));
});
const PAVED = [[...ARENA], [ARENA[0] + 10, WALL_Y[0] - 4, ARENA[2] - 10, WALL_Y[1] + 4], [...ANTE], [1340, 270, 1460, 372], [2560, 140, 2640, 200], [260, 118, 340, 176]];
for (const [x0, y0, x1, y1] of PAVED) paint(x0, y0, x1, y1, (i, x, y) => { const e = Math.min(x - x0, x1 - x, y - y0, y1 - y); if (e > 9 * vn(x / 6, y / 6, 13) - 2) kind[i] = 1; }); // broken at its edges
paint(WATER[0] - WATER[2] - 20, WATER[1] - WATER[3] - 20, WATER[0] + WATER[2] + 20, WATER[1] + WATER[3] + 20, (i, x, y) => { if (inWater(x + 0.5, y + 0.5)) kind[i] = 2; else if (inWater(x + 0.5, y + 0.5, 0.18)) kind[i] = 3; });
const NEST = CHAMBERS.slice(4, 8), RATS = CHAMBERS[9];
for (const [cx, cy, a, b] of NEST) paint(cx - a, cy - b, cx + a, cy + b, (i, x, y) => { if (kind[i] === 0 && Math.hypot((x - cx) / a, (y - cy) / b) < 1 && fbm(x / 26, y / 20, 3, 41) > 0.5) kind[i] = 4; });
paint(RATS[0] - RATS[2], RATS[1] - RATS[3], RATS[0] + RATS[2], RATS[1] + RATS[3], (i, x, y) => { if (kind[i] === 0 && Math.hypot((x - RATS[0]) / RATS[2], (y - RATS[1]) / RATS[3]) < 1 && fbm(x / 14, y / 11, 3, 43) > 0.48) kind[i] = 5; });
// Old blood: the nest's feeding grounds, the arena's (pools x, y, rx, ry; drags as polylines).
const POOLS = [[610, 640, 18, 7], [470, 520, 10, 5], [800, 700, 12, 5], [560, 760, 9, 4], [700, 600, 8, 4], [2360, 860, 10, 4], [2250, 760, 7, 3], [1440, 935, 7, 3], [2600, 230, 6, 3], [2060, 520, 6, 3]];
const DRAGS = [[[880, 500], [780, 560], [640, 630]], [[360, 470], [430, 510], [470, 520]], [[880, 770], [820, 720], [800, 700]], [[2360, 860], [2340, 920], [2350, 1000]]];
for (const [px, py, sx, sy] of POOLS) paint(px - 3 * sx, py - 3 * sy, px + 3 * sx, py + 3 * sy, (i, x, y) => { blood[i] = Math.max(blood[i], 255 * stain(x, y, px, py, sx * 1.3, sy * 1.3, 0.85, px + py)); });
for (const d of DRAGS) for (let k = 0; k < d.length - 1; k++) { const a = d[k], b = d[k + 1];
  paint(Math.min(a[0], b[0]) - 4, Math.min(a[1], b[1]) - 4, Math.max(a[0], b[0]) + 4, Math.max(a[1], b[1]) + 4, (i, x, y) => { const t = segDist(x, y, a, b); if (t < 2.6 && vn(x / 1.2, y / 1.2, 36 + k) > 0.3 + t / 6) blood[i] = Math.max(blood[i], 200); }); }
// Phosphorescent rot where the dead lie thick: the nest, the rats, the low gallery, the black water's shore (x, y, r).
const ROT = [[470, 600, 40], [700, 700, 46], [560, 470, 30], [820, 620, 30], [380, 690, 26], [2020, 490, 30], [2110, 545, 22], [1180, 900, 30], [1640, 990, 26], [1420, 590, 26], [1700, 690, 24], [990, 480, 18], [2260, 570, 18]];
const rotAt = (X, Y) => { let k = 0; for (const [x, y, r] of ROT) { const d = Math.hypot(X - x, (Y - y) * 1.3) / r; if (d < 1.6) k = Math.max(k, clamp(1.2 - d) * clamp((fbm(X / 7, Y / 6, 3, x) - 0.48) * 4)); } return k; };

// ---------- the floor ----------
const E = { dust: L('#403a31'), dustD: L('#29241d'), dustL: L('#625a4b'), bone: L('#6c6452'), mud: L('#1c1a14'), water: L('#05080a'), filth: L('#2a1c14'),
  rag: L('#3e3428'), straw: L('#5e5032'), rot: L('#5a9a7a') };
function floorAt(x, y) {
  const X = rx(x), Y = ry(y), xi = Math.floor(X), yi = Math.floor(Y);
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RH || !floor[yi * RW + xi]) return { alb: mul(mix(L('#2a251f'), L('#0c0a08'), vn(x / 9, y / 9, 71)), 0.3), N: [0, 0, 1], spec: 0.02 }; // under the rock's low edge: its scree
  const i = yi * RW + xi, k = kind[i], ys = y * SN;
  let c, Nn = [0, 0, 1], spec = 0.03, gloss = 12, emi;
  // the ways out: steps up into the dark
  for (const d of Object.values(DOORS)) if (Math.abs(X - d.x) < d.w / 2 + 1 && Y < d.y + 1 && Y > d.y - RECESS - 8) {
    const t = clamp((d.y - Y) / (RECESS + 6)), step = Math.floor((d.y - Y) / 3) & 1;
    return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6, 3)), (step ? 0.75 : 1) * (1 - 0.9 * t)), N: step ? [0, 0.3, 1] : [0, 0, 1], spec: 0.03 };
  }
  if (k === 1) {
    const f = flags(x, y, 40, 30, 23); c = grime(mul(f.c, 0.85), x, y, 0.9); Nn = f.N;
    const m = Math.abs(X - MED[0]) < 90 && Math.abs(Y - MED[1]) < 60 && medallion(x - wx(MED[0]) + wx(240), y, MED[1], 1.25); // the arena's: carved round its middle
    if (m) { c = m.c; if (m.N) Nn = m.N; if (m.wet) { spec = m.wet * 0.6; gloss = 60; } }
  }
  else if (k === 2) { // black water: still, a faint swell, the light lying on it
    c = mul(E.water, 0.8 + 0.4 * vn(x / 30, ys / 30, 51)); spec = 0.9; gloss = 120;
    Nn = [(vn(x / 11, ys / 7, 52) - 0.5) * 0.12, (vn(x / 11, ys / 7, 53) - 0.5) * 0.12, 1];
  } else {
    c = mix(E.dust, E.dustD, clamp(fbm(x / 24, ys / 24, 4, 101) * 1.3 - 0.15));
    c = mix(c, E.bone, clamp((fbm(x / 50, ys / 50, 3, 102) - 0.5) * 2.5) * (inSpan(X, Y + 30) ? 0.7 : 0.35)); // bone dust under the skulls
    c = mix(c, E.dustL, (trod[i] / 255) * 0.5 * clamp(fbm(x / 16, ys / 16, 3, 104) * 1.6 - 0.2)); // the patrols' beaten path
    const f = (u, v) => vn(u / 14, v / 14, 21); Nn = [-(f(x + 1, ys) - f(x - 1, ys)) * 0.4, -(f(x, ys + 1) - f(x, ys - 1)) * 0.4, 1];
    const cx = Math.floor(x / 9), cy = Math.floor(ys / 9);
    if (h2(cx, cy, 120) < 0.025) { // a stone, a lump of dust
      const ox = (cx + 0.2 + 0.6 * h2(cx, cy, 121)) * 9, oy = (cy + 0.2 + 0.6 * h2(cx, cy, 122)) * 9, r = 1.5 + 2.5 * h2(cx, cy, 123), d = Math.hypot(x - ox, ys - oy) / r;
      if (d < 1) { Nn = [(x - ox) / r * 0.5, (ys - oy) / r * 0.5, 1]; c = mul(c, 0.8 + 0.3 * (1 - d)); }
    }
    const p = fbm(x / 34, ys / 34, 3, 121); if (p > 0.74) { c = mul(c, 0.55); spec = 0.35 * clamp((p - 0.74) * 12); gloss = 70; Nn = [0, 0, 1]; } // seeping water
    if (k === 3) { c = mix(E.mud, mul(E.mud, 0.6), vn(x / 5, ys / 5, 54)); spec = 0.45; gloss = 60; Nn = [0, 0, 1]; }
    if (k === 4) c = mix(c, mix(E.filth, E.rag, clamp(vn(x / 9, ys / 9, 55) * 1.4 - 0.2)), 0.7 * clamp((fbm(x / 26, ys / 20, 3, 41) - 0.5) * 6)); // rags, filth
    if (k === 5) { const s = vn(x / 2, ys / 6, 57); c = mix(mix(E.straw, E.rag, s), C.grime, 0.3 + 0.4 * vn(x / 9, ys / 9, 58)); Nn = [(s - 0.5) * 0.6, 0, 1]; }
  }
  // the edge of the rock: its dust heaped, darker
  const dr = bil(D, X, Y); if (dr < 14) c = mix(c, E.dustD, (1 - Math.max(0, dr) / 14) * 0.55);
  if (blood[i]) { const a = blood[i] / 255; c = mix(c, mix(C.bloodD, C.blood, vn(x / 4, y / 4, 8) * 0.6), a); if (a > 0.3) { spec = 0.4 * a; gloss = 70; Nn = [0, 0, 1]; } }
  // bone splinters and teeth, thicker under the ossuaries and in the nest
  { const cx = Math.floor(x / 7), cy = Math.floor(y / 7), n = k === 4 ? 0.012 : inSpan(X, Y + 30) ? 0.01 : 0.004;
    if (h2(cx, cy, 300) < n) { const an = h2(cx, cy, 301) * 3.14, lx = x - (cx * 7 + 3.5), ly = y - (cy * 7 + 3.5), u = lx * Math.cos(an) + ly * Math.sin(an), v = -lx * Math.sin(an) + ly * Math.cos(an);
      if (Math.abs(v) < 0.7 && Math.abs(u) < 3) { c = mix(c, C.bone, 0.65); Nn = [0, 0, 1]; } } }
  const rot = rotAt(X, Y); if (rot > 0) { c = mix(c, mul(E.rot, 0.3), rot * 0.4); emi = mul(E.rot, rot * 0.05); }
  return { alb: c, N: Nn, spec, gloss, emi };
}

// ---------- models ----------
const TUFF = [L('#4a4438'), L('#2c271f')];
/** The rock's face: dug tuff in beds, the picks' strokes slanting across them, damp running down, rot at its foot. */
function tuff(u, z, x, y) {
  const zs = z + 6 * (vn(u / 50, 0, 61) - 0.5), bed = Math.floor(zs / 14);
  let c = mix(TUFF[0], TUFF[1], clamp(fbm3(x * 0.05, y * 0.05, z * 0.05, 3, 62) * 1.6 - 0.3));
  c = mul(c, 0.82 + 0.3 * h2(bed, 0, 63));
  let N = [0, 1, 0];
  if (zs - bed * 14 < 1.3) { c = mul(c, 0.5); N = [0, 0.7, -0.7]; } // the seams between beds
  const pk = ((u + z * 0.6 + 40 * h2(bed, 1, 64)) % 7 + 7) % 7; // pick strokes
  if (pk < 1.1 && vn(u / 5, z / 9, 65) > 0.45) { c = mul(c, 0.68); N = [-0.5, 1, 0.3]; }
  c = mix(c, L('#161a12'), clamp((vn3(x * 0.03, 0, z * 0.07, 66) - 0.5) * 3) * 0.55); // damp
  return { c, N };
}
/** The rock: one height field over the floor's outline (D, Hh), its faces ragged, the niches hollowed out of it. */
function rockField() {
  return {
    sdf: (x, y, z) => {
      const X = rx(x), Y = ry(y), h = bil(Hh, X, Y);
      let s = Math.max(bil(D, X, Y) + 2.6 * (vn3(x / 9, y / 9, z / 13, 67) - 0.5) * (1 - bil(rampF, X, Y)), (z - h) * 0.5);
      if (s < 12 && NICHES.length) { const [n] = niche(x, y, z); s = Math.max(s, n); }
      return s;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const X = rx(x), Y = ry(y), bones = inSpan(X, Y + 2);
      const [inN, k] = niche(x, y, z);
      if (k >= 0 && inN > -3) { // in a niche: skulls stacked at its back, on its sill
        if (nz > 0.6) return { alb: mul(heapMat(x, y, 91).alb, 0.9), N: heapMat(x, y, 91).N, spec: 0.08, ao: 0.6 };
        const r = boneFace(x, z); return { alb: mul(r.c, 0.85), N: [0, 1, r.N[2]], ao: 0.55 * (r.ao ?? 1), spec: 0.05 };
      }
      const h = bil(Hh, X, Y), xi = Math.floor(X), yi = Math.floor(Y);
      if (nz > 0.7 || z > h - 3 || ramp[Math.max(0, Math.min(RW * RH - 1, yi * RW + xi))] || ramp[Math.max(0, Math.min(RW * RH - 1, (yi + 1) * RW + xi))]) { // its top: the dark it rises into; low by the galleries, scree
        const n = fbm3(x * 0.05, y * 0.05, z * 0.05, 3, 68), crackL = Math.abs(vn(x / 30, y / 30, 70) - 0.5) < 0.025;
        const c = mix(L('#2e2922'), L('#0c0a08'), clamp(n * 1.6 - 0.3));
        return { alb: mul(c, (z > 24 ? 0.2 : 0.38 - z * 0.008) * (crackL ? 0.4 : 1)), spec: 0.02, rim: 0 };
      }
      let c, N;
      if (Math.abs(nx) > Math.abs(ny) * 1.2) { // a flank, battered
        if (bones) { const r = heapMat(y, z * 1.4, 89); c = r.alb; N = [nx, ny + r.N[0] * 0.3, nz + r.N[2] * 0.3]; }
        else { const r = tuff(y * SN, z, x, y); c = r.c; N = [nx, ny, nz + (r.N[2] || 0) * 0.3]; }
      } else if (bones) { const r = boneFace(x, z); c = mix(r.c, C.grime, clamp((vn(x / 9, z / 40, 2) - 0.4) * 2) * 0.5); N = [nx * 0.5, Math.max(0.3, ny), r.N[2]]; }
      else { const r = tuff(x, z, x, y); c = r.c; N = [nx + r.N[0] * 0.3, ny, nz + r.N[2] * 0.3]; }
      if (z < 22) c = mix(c, C.grime, (1 - z / 22) * 0.5); // dust banked at its foot
      const rot = rotAt(X, Y + 3); let emi;
      if (rot > 0 && z < 40) { const k = rot * clamp(1 - z / 40) * clamp((vn3(x * 0.2, y * 0.2, z * 0.15, 69) - 0.45) * 4); c = mix(c, mul(E.rot, 0.4), k * 0.6); emi = mul(E.rot, k * 0.12); }
      return { alb: mul(c, clamp(1.12 - z / 230)), N, spec: 0.04, gloss: 14, emi, ao: 0.6 + 0.4 * clamp(z / 24) };
    },
    bounds: [-60, -60, -2, W + 60, wy(RH) + 60, HMAX + 60], step: 0.6,
  };
}
/** A way out cut in the rock's face (DOORS): an arch of ashlar round the doorway, the masonry up to the rock's top over
 *  it; the stairs (le caveau) or a ladder of iron rungs up the well's shaft climb into the dark behind. */
function doorway(d, kind) {
  const cx = wx(d.x), YF = wy(d.y), YB = wy(d.y - RECESS - 10), hw = d.w, top = HMAX + 6, R0 = hw * 1.2;
  return {
    sdf: (x, y, z) => {
      const u = x - cx;
      let s = sdBox(x, y, z, cx, (YB + YF) / 2 - 2, top / 2, hw + 22, (YF - YB) / 2 + 3, top / 2, 1);
      s = Math.max(s, Math.min(hw - Math.abs(u), archTop(u, hw, 62, R0) - z, YF + 10 - y)); // the doorway, hollow
      if (kind === 'well') for (let zz = 16; zz < 140; zz += 18) s = Math.min(s, sdBox(x, y, z, cx, YB + 4, zz, hw * 0.55, 1.2, 1.2, 0.4)); // its rungs
      return s;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const u = x - cx;
      if (kind === 'well' && Math.abs(u) < hw * 0.6 && y < YB + 8) return ironMat(x, y, z);
      if (Math.abs(u) < hw + 1 && y < YF - 2 && z < archTop(u, hw, 62, R0) + 1) return { alb: mul(C.stC, 0.25), spec: 0.02, ao: 0.4 }; // inside, the dark
      if (nz > 0.7) return { alb: mul(C.wallD, 0.25) };
      let r = ashlar(x, z, 16, 30, 3);
      if (z > 48 && !inPointed(u, z, hw, 62, R0) && inPointed(u, z, hw + 10, 62, R0 + 10)) r = { c: mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - 62, u) * 4) & 1) ? 0.8 : 1.05), N: [0, 1, 0] };
      if (z > 100 && z < 116 && Math.abs(u) < 24) r = { c: mix(C.bone, C.boneD, vn(x / 2, z / 2, 5)), N: [0, 1, 0] }; // skulls set over it
      return { alb: mul(mix(r.c, C.grime, 0.35), clamp(1.1 - z / 200)), N: r.N, spec: 0.03, ao: 0.6 + 0.4 * clamp(z / 22) };
    },
    bounds: [cx - hw - 26, YB - 6, 0, cx + hw + 26, YF + 8, top + 6], step: 0.7,
  };
}
/** Vesna's reliquary: a dais of two steps, an iron cage round a reliquary chest bound in tarnished gilt, sealed with the
 *  Order's red wax and chained across; the Rat's sign on a silver plaque at the dais' foot. */
function reliquary() {
  const gilt = L('#7a5a24'), giltD = L('#3a2a10'), wax = L('#7a1010'), silver = L('#9a9a90');
  const bars = cage(64, 40, 120);
  const parts = [
    { f: (x, y, z) => Math.min(sdBox(x, y, z, 0, 0, 5, 58, 36, 5, 1), sdBox(x, y, z, 0, 0, 13, 48, 28, 3.5, 1)), m: 'dais' },
    { f: (x, y, z) => bars.sdf(x, y, z - 16), m: 'iron' },
    { f: (x, y, z) => { const q = Math.max(Math.abs(x) / 34, Math.abs(y) / 22); return Math.max(q * 34 - 34 * clamp(1 - (z - 136) / 44), 136 - z, z - 182); }, m: 'roof' }, // its pointed roof
    { f: (x, y, z) => sdBox(x, y, z, 0, 0, 72, 20, 12, 54, 2), m: 'chest' },
    { f: (x, y, z) => Math.min(...[-1, 1].map((s) => Math.max(Math.abs((x - s * 0) * 0.62 + s * (z - 80) * 0.78) - 1.6, Math.abs(y - 21) - 1.6, Math.abs(x) - 34, Math.abs(z - 80) - 46))), m: 'chain' }, // chained across, an X
    { f: (x, y, z) => sdBox(x, y, z, 0, 37, 9, 13, 1.5, 7, 0.5), m: 'plaque' },
  ];
  const sdf = (x, y, z) => Math.min(...parts.map((p) => p.f(x, y, z)));
  return {
    sdf,
    mat: (m, x, y, z) => {
      const p = parts.reduce((a, b) => (b.f(x, y, z) < a.f(x, y, z) ? b : a));
      if (p.m === 'dais') return { alb: mix(stone3(x, y, z, mul(C.stB, 1.1), 5), C.grime, 0.3), spec: 0.05 };
      if (p.m === 'iron' || p.m === 'chain') return ironMat(x, y, z);
      if (p.m === 'roof') return { alb: mix(gilt, giltD, vn3(x * 0.3, y * 0.3, z * 0.3, 7)), spec: 0.6, gloss: 40 };
      if (p.m === 'plaque') return sign('rat', x / 9, (z - 9) / 6) ? { alb: silver, spec: 0.9, gloss: 60 } : { alb: mul(silver, 0.35), spec: 0.4, gloss: 40 };
      // the chest: dark wood bound in gilt bands, the seals of wax
      if (Math.abs(z - 40) < 3 || Math.abs(z - 104) < 3 || Math.abs(x) > 17) return { alb: mix(gilt, giltD, vn3(x, y, z, 8)), spec: 0.5, gloss: 40 };
      if (Math.hypot(x - 8, z - 72) < 4.5 || Math.hypot(x + 9, z - 88) < 4) return { alb: wax, spec: 0.5, gloss: 50 };
      return { alb: mix(C.woodD, L('#0e0a07'), vn3(x * 0.3, y * 0.3, z * 0.1, 9)), spec: 0.08 };
    },
    bounds: [-60, -38, 0, 60, 40, 186], step: 0.6,
  };
}
/** A rat's nest: a low heap of rags, straw and gnawed bones. */
function ratNest(seed) {
  return {
    sdf: (x, y, z) => sdEll(x, y, z, 0, 0, 0, 22, 16, 9) - 2.5 * (vn3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5),
    mat: (m, x, y, z) => { const s = vn3(x * 0.4, y * 0.4, z * 0.4, seed + 1); return { alb: s > 0.7 ? mix(C.bone, C.boneD, 0.4) : mix(E.straw, E.rag, s * 1.4), wrap: 0.4 }; },
    bounds: [-26, -20, -2, 26, 20, 12], step: 0.6,
  };
}
/** The nest's mound: the remains the ghouls bring back, skulls on top. */
function mound(r, h, seed) {
  const top = (x, y) => h * clamp(1 - Math.hypot(x / r, y / (r * 0.8))) ** 0.7 + 5 * (vn(x / 6, y / 6, seed) - 0.5) + (heap(x, y, 9, seed).d < 1 ? 3 : 0);
  return {
    sdf: (x, y, z) => Math.max((z - top(x, y)) * 0.45, Math.hypot(x / r, y / (r * 0.8)) * r - r - 2, -z),
    mat: (m, x, y, z) => { const k = heapMat(x, y, 90 + seed); return vn(x / 9, y / 9, seed + 1) > 0.62 ? { alb: mix(C.bloodD, E.filth, 0.5), spec: 0.15, gloss: 40 } : { ...k, alb: mul(k.alb, 0.75), spec: 0.03 }; },
    bounds: [-r - 4, -r - 4, -2, r + 4, r + 4, h + 6], step: 0.6,
  };
}

// ---------- props ----------
const PROPS = [ // kind, floor x, feet line y (room px)
  { kind: 'reliquary', x: RELIQUARY.x, y: RELIQUARY.y, w: 116, h: 70 },
  { kind: 'pillar', x: 2236, y: 776, w: 22, h: 11, tall: 60 }, { kind: 'pillar', x: 2486, y: 776, w: 22, h: 11, tall: 90 },
  { kind: 'sarc', x: 2160, y: 238, w: 40, h: 14 }, { kind: 'sarc', x: 1100, y: 892, w: 40, h: 14 }, { kind: 'chest', x: 2500, y: 1040, w: 26, h: 12 }, { kind: 'chest', x: 1722, y: 90, w: 26, h: 12 },
  { kind: 'coffin', x: 380, y: 140, w: 46, h: 12 }, { kind: 'coffin', x: 1375, y: 588, w: 46, h: 12, sunk: true }, { kind: 'coffin', x: 1062, y: 108, w: 46, h: 12 },
  { kind: 'cross', x: 1400, y: 286, w: 12, h: 5 }, { kind: 'banner', x: 2290, y: 980, w: 6, h: 4 }, { kind: 'banner', x: 2410, y: 980, w: 6, h: 4 },
  { kind: 'lever', x: 352, y: 146, w: 10, h: 6 },
  { kind: 'mound', x: 610, y: 650, w: 50, h: 22 }, { kind: 'corpse', x: 450, y: 528, w: 16, h: 8 }, { kind: 'corpse', x: 820, y: 742, w: 16, h: 8 }, { kind: 'corpse', x: 2560, y: 236, w: 16, h: 8 },
  { kind: 'corpse', x: 2056, y: 548, w: 16, h: 8 }, { kind: 'coffin', x: 760, y: 610, w: 46, h: 12, open: true }, { kind: 'coffin', x: 470, y: 760, w: 46, h: 12, open: true },
  { kind: 'nest', x: 2020, y: 500, w: 20, h: 10 }, { kind: 'nest', x: 2110, y: 520, w: 20, h: 10 }, { kind: 'nest', x: 2075, y: 470, w: 20, h: 10 }, { kind: 'nest', x: 240, y: 380, w: 20, h: 10 },
];
// Rubble where galleries fell in (solid in the middle): the dead ends' ends, the rats' passage.
const RUBBLE = [[690, 338, 26], [2290, 562, 26], [2312, 580, 18], [1180, 210, 14], [1900, 1040, 16], [960, 520, 14], [2700, 250, 18], [640, 520, 14]];
for (const [x, y, r] of RUBBLE) PROPS.push({ kind: 'rubble', x, y: y + r * 0.3, w: r * 1.2, h: r * 0.5, r });
// The flames: braziers by the arena's reliquary and its gate (the Order watches its prisoner), one at the great
// crossroads; the patrols' candles at niches and crossroads (x, y, how many); the Order's lanterns whose pools burn.
const BRAZIERS = [[2290, 716], [2430, 716], [2310, 992], [2392, 992], [1452, 276]];
const CANDLES = [[2340, 724, 3], [2386, 726, 2], [2316, 736, 2], [2404, 738, 3], [1384, 300, 3], [1414, 302, 2], [2140, 236, 2], [1960, 200, 2], [1604, 206, 2],
  [330, 140, 3], [262, 146, 2], [1722, 104, 2], [1100, 902, 2], [2600, 170, 2], [1462, 920, 2], [2240, 990, 2], [1064, 122, 2]];
export const LANTERNS = [[1468, 362], [2470, 1012]];
// Moon down the wells to the necropolis: floor patches x, y, r; the nest's a crack over its mound.
const MOONHOLES = [[2600, 214, 44], [1396, 330, 34], [1610, 650, 26]];

// ---------- the gameplay plan, read by zone.gen.mjs ----------
// Areas (first match): ring 3 near the well, 4 deep; none by the ways out and in the arena (its boss, later).
export const AREAS = [
  { id: 'puits', ring: 3, rect: [2440, 60, 2880, 330], groups: 0 },
  { id: 'escalier', ring: 3, rect: [180, 60, 440, 250], groups: 0 },
  { id: 'prison', ring: 4, rect: [2080, 640, 2640, 1080], groups: 0 },
  { id: 'galeries-est', ring: 3, rect: [1700, 0, 2880, 440], groups: 2 },
  { id: 'croisee', ring: 3, rect: [1180, 0, 1700, 470], groups: 2 },
  { id: 'galeries-ouest', ring: 3, rect: [0, 0, 1180, 420], groups: 2 },
  { id: 'nid', ring: 4, rect: [0, 420, 1000, 850], groups: 4 },
  { id: 'eaux-noires', ring: 4, rect: [1000, 420, 1800, 820], groups: 2 },
  { id: 'rats', ring: 4, rect: [1800, 420, 2880, 640], groups: 1 },
  { id: 'galerie-basse', ring: 4, rect: [0, 820, 2880, 1080], groups: 3 },
];
// Caches: floor points before what is worth searching.
export const CACHES = [[2552, 248], [2160, 252], [1722, 104], [1928, 196], [1062, 122], [1384, 316], [380, 154], [700, 312], [610, 680], [450, 548], [820, 762], [1375, 604],
  [2056, 562], [1100, 906], [2500, 1046], [1720, 1018], [760, 628]];
// Where the battue lies in wait on his way back (to the well, or the stairs up once open): the narrow ways.
export const CHOKES = [[2390, 204, 32], [1800, 176, 32], [1424, 450, 32], [1060, 440, 36], [1440, 820, 32], [1160, 900, 36], [680, 192, 32], [236, 330, 28]];
export const TORCH_ROWS = () => BRAZIERS.map(([x, y]) => [x, Math.round(y - 4 - 36 * CS / 2), 1]);
/** What the game adds: the arena (the boss' hook), the reliquary, the rats' nests (ambient rats). */
export const DATA = { ARENA, RELIQUARY, RATS: PROPS.filter((o) => o.kind === 'nest').map((o) => [o.x, o.y + 6]) };

// ---------- solid footprints (room px x, y, w, h) ----------
const rect = (x0, y0, x1, y1) => [x0, y0, x1 - x0, y1 - y0];
/** Every solid footprint but the rock and the pits (zone.gen.mjs adds those from rock() and pit()). */
export function solids() {
  const out = WALLS.map((w) => rect(w.x0, w.y0, w.x1, w.y1));
  for (const g of GATES) if (!g.arch) out.push(rect(g.x0 - 8, g.y0 - 2, g.x0, g.y1 + 2), rect(g.x1, g.y0 - 2, g.x1 + 8, g.y1 + 2)); // the gatehouse's piers
  for (const o of PROPS) if (o.kind !== 'nest' && o.kind !== 'corpse') out.push(rect(o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y));
  for (const [x, y] of BRAZIERS) out.push(rect(x - 6, y - 8, x + 6, y));
  for (const [x, y] of LANTERNS) out.push(rect(x - 2, y - 3, x + 2, y));
  return out;
}
export const gateBoxes = () => GATES.map((g) => rect(g.x0, g.y0, g.x1, g.y1));

// ---------- the scene ----------
const S = stage();
const { add, light } = S;
add('rock', rockField(), [0, 0, 0]);
add('doorway', doorway(DOORS.puits, 'well'), [0, 0, 0]);
add('doorway', doorway(DOORS.caveau, 'stairs'), [0, 0, 0]);
for (const w of WALLS) add('bones', boneWall(w), [0, 0, 0]);
const ports = GATES.map((g) => { if (!g.arch) add('gatehouse', gatehouse(g), [0, 0, 0]); return add('portcullis', portcullis(wx(g.x1 - g.x0) + 6, 110), [wx((g.x0 + g.x1) / 2), wy((g.y0 + g.y1) / 2), -400]); });
for (const o of PROPS) {
  const P = [wx(o.x), wy(o.y - o.h / 2), 0];
  if (o.kind === 'reliquary') add('reliquary', reliquary(), P, 0);
  else if (o.kind === 'pillar') add('pillar', broken(pillar(40, 30, wz(o.tall) + 30), (x, y) => wz(o.tall) - 10 + x * 0.3 + 9 * vn(x / 5, y / 5, o.x)), P, 0);
  else if (o.kind === 'sarc') add('sarc', sarcophagus(o.x % 17), P, 0);
  else if (o.kind === 'chest') add('chest', chest(o.x % 5), P, 0);
  else if (o.kind === 'coffin') add('coffin', oldCoffin(o.x % 7, o.open ? 2 : 0), [P[0], P[1], o.sunk ? -9 : 0], o.sunk ? 0.25 : 0);
  else if (o.kind === 'cross') add('cross', cross(46), P, 0);
  else if (o.kind === 'banner') add('banner', banner(o.x % 9), P, 0);
  else if (o.kind === 'lever') add('lever', lever(), P, 0);
  else if (o.kind === 'mound') add('mound', mound(70, 18, 3), P, 0);
  else if (o.kind === 'corpse') add('corpse', slumped(o.x % 13), P, h2(o.x, 0, 3) * 6);
  else if (o.kind === 'nest') add('nest', ratNest(o.x % 11), P, h2(o.x, 1, 3) * 3);
  else if (o.kind === 'rubble') add('rubble', rubble(o.x % 31, wx(o.r) * 0.8, 18), [wx(o.x), wy(o.y - o.h), 0], h2(o.x, 0, 3) * 6);
}
for (const [x, y] of BRAZIERS) add('brazier', brazier2(true), [wx(x), wy(y - 4), 0]);
for (const [x, y] of LANTERNS) add('lantern', pole(110), [wx(x), wy(y), 0]);
const candles = (x, y, n) => add('candles', candles2([...Array(n)].map((_, k) => [wx(k * 3 + 1), (k % 2) * 4, 0, 4 + h2(x, k, 3) * 9, 1.2 + h2(x, k, 4) * 0.3, (h2(x, k, 5) - 0.5) * 0.8, 0])), [wx(x), wy(y), 0]);
// the patrols' candles at a niche in three, on the floor before it
for (const [k, [x, yf]] of NICHES.entries()) if (k % 3 === 1 && Object.values(DOORS).every((d) => Math.hypot(d.x - x, d.y - yf) > 60) && Math.abs(x - RELIQUARY.x) > 120) CANDLES.push([x - 3, yf + 5, 2 + (k % 2)]);
for (const [x, y, n] of CANDLES) candles(x, y, n);
// Real skulls: on the niches' sills, fallen at the ossuaries' feet, strewn in the nest and round the well's bottom.
for (const [x, yf, hw] of NICHES) for (let k = 0; k < 2 + (h2(x, 2, 3) * 3 | 0); k++) add('skull', skull(), [wx(x + (k - 1) * hw * 0.6 + (R() - 0.5) * 3), wy(yf - NICHE_D / 2 - 1) + (R() - 0.5) * 4, SILL], R() * 6 - 3);
const open = (x, y, m) => { for (let j = -m; j <= m; j += 2) for (let i = -m; i <= m; i += 2) { const X = Math.round(x + i), Y = Math.round(y + j); if (rock(X, Y) || pit(X, Y) || bil(D, X, Y) < 6) return false; } return !PROPS.some((o) => Math.abs(o.x - x) < o.w / 2 + 6 && y > o.y - o.h - 8 && y < o.y + 6) && !CACHES.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 16) && Object.values(DOORS).every((d) => Math.hypot(d.x - x, d.y - y) > 40); };
for (let k = 0; k < 26; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 0.8; add('skull', skull(), [wx(610) + Math.cos(a) * d * 70, wy(650 - 9) + Math.sin(a) * d * 56, 18 * (1 - d * d) ** 0.7], R() * 6); } // on the nest's mound
for (const [x0, y0, x1, y1] of OSSUARY) for (let x = x0 + 8; x < x1 - 8; x += 22 + 12 * R()) { // fallen from the faces
  const yf = faceY(Math.round(x), y0 - 40, y1);
  if (yf > 0 && open(x, yf + 6, 2)) for (let k = 0; k < 1 + (R() * 3 | 0); k++) add('skull', skull(), [wx(x + (R() - 0.5) * 10), wy(yf + 4 + R() * 4), 0], R() * 6);
}
for (let k = 0; k < 220; k++) {
  const [cx, cy, a, b] = k < 110 ? NEST[k % 4] : k < 140 ? CHAMBERS[0] : k < 170 ? CHAMBERS[9] : [1700, 600, 900, 420], x = cx + (R() * 2 - 1) * a, y = cy + (R() * 2 - 1) * b, yaw = R() * 6;
  if (open(x, y, 3)) add('skull', skull(), [wx(x), wy(y), 0], yaw);
}
for (let k = 0; k < 40; k++) {
  const [cx, cy, a, b] = k < 22 ? NEST[k % 4] : k < 28 ? CHAMBERS[0] : [1440, 540, 1440, 540], x = cx + (R() * 2 - 1) * a, y = cy + (R() * 2 - 1) * b, seed = k + 3;
  if (open(x, y, 10)) add('bones', pitBones(seed), [wx(x), wy(y), 0], R() * 6);
}
// The vault, never seen: the moon falls only down the wells.
const MOON = (() => { const d = [-0.22, -0.16, 0.96], l = Math.hypot(...d); return d.map((v) => v / l); })();
const MOONH = MOONHOLES.map((m) => crackOver(MOON, m, VAULT));
add('vault-moon', vaultOf(MOONH, 0.5, VAULT, W, RH), [0, 0, 0], 0, { ghost: true });

// ---------- lights ----------
const MOONC = L('#9ab0be'), FIRE = L('#e07a30'), CANDLE = L('#d8b070'), ORDER = L('#a8ac5c'), ROTC = L('#6ab08a'), FAR = 1e5;
light({ name: 'moon', p: [W / 2 + MOON[0] * FAR, wy(RH / 2) + MOON[1] * FAR, MOON[2] * FAR], c: MOONC, I: 0.32, r0: 1e9, R: 1e12, soft: 30, pad: 10 });
light({ p: [W / 2 + 0.15 * FAR, wy(RH / 2) + 0.55 * FAR, 0.82 * FAR], c: MOONC, I: 0.3, r0: 1e9, R: 1e12, noShadow: true }); // the faint cold the wells let in
for (const [x, y] of BRAZIERS) light({ p: [wx(x), wy(y - 4), 48], c: FIRE, I: 4, r0: 40, R: 420, soft: 6, pad: 8, haze: 0.02, hazeR: 7, skip: ['brazier'] });
for (const [x, y, n] of CANDLES) light({ p: [wx(x + n * 1.5), wy(y) + 2, 16], c: CANDLE, I: 0.9 + 0.4 * n, r0: 20, R: 240, soft: 4, pad: 3, haze: 0.012, hazeR: 3, skip: ['candles'] });
for (const [x, y] of LANTERNS) light({ p: [wx(x), wy(y), 114], c: ORDER, I: 6, r0: 30, R: 300, soft: 6, pad: 6, haze: 0.012, hazeR: 5, skip: ['lantern'] });
for (const [x, y, r] of ROT) light({ p: [wx(x), wy(y), 10], c: ROTC, I: 0.35 + r / 120, r0: 30, R: 5 * r + 80, noShadow: true }); // the rot's own pale glow
for (const [x, y, r] of MOONHOLES) light({ p: [wx(x), wy(y), 30], c: MOONC, I: 0.25, r0: 50, R: 5 * r + 60, noShadow: true, noEnv: true }); // what a moonlit patch throws back
for (const d of Object.values(DOORS)) light({ p: [wx(d.x), wy(d.y - RECESS - 4), 30], c: d === DOORS.puits ? MOONC : CANDLE, I: 1.2, r0: 16, R: 150, soft: 4, pad: 4 }); // the way up

const env = ground(floorAt, (X, Y) => pit(X, Y, 1));
const SC = { W, H: 2 * RH, cam, off: 0, offX: 0, objects: S.objects, lights: S.lights, env, envShadow: pitShadow((X, Y) => pit(X, Y, 1)), ambient: L('#3a4450').map((v) => v * 0.1) };
export async function scene() { return SC; }
/** Gate `k` of GATES let down to `d` room px above its sill (d >= its height: raised out of sight). */
export function raise(sc, k, d) { ports[k].pos[2] = d >= GATE_RISE ? -400 : wz(d); }
export const GATE_RISE = 44; // room px: a gate's travel up, its frames 4 px apart
export const finish = (img, x0, y0) => shafts(img, x0, y0, MOONH.map((o) => [o[0], o[1], o[2], o[2], MOON, MOONC, 0.003]), VAULT);
export const PAL = [...CRYPT_PAL, ...[['#1a2a24', '#2e4a3c', '#4e7a62', '#8ac0a0']].flatMap((s) => s.map((c) => hex(c).map((v) => v * 255)))];
export const POST = { exposure: 3.3, vignette: 0.2, desat: 0.18, grain: 0.012, dither: 0.02 };
