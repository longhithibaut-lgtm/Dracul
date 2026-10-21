// Le cloître sous l'Aube (layout 'cloister'), in the « grand pixel » style of its validated mockup
// (docs/maquettes/cloitre.png, tools/art/maquettes/cloitre/): its harsh holy sun from the upper left, hard cool shade,
// arcades of pale and red voussoirs on paired colonnettes, the covered well, box hedges, stone crosses and steles over
// turned earth, dry lawns, pale gravel, flagstones under the walks, a body the Dawn burnt. On the painted cloister's
// plan (src/room.ts LAYOUT.cloister): the same arcades, piers, well, hedges, graves, spawns and parts, but far fewer
// trees. The walks' roofs are cut away to show who walks under them; they still cast their shade, where the sun sees
// them. The floor the Dawn burns is that render's own shade (rooms.gen.mjs dawn()).
import { sdBox, sdRC, clamp, vn, fbm, vn3, fbm3, h2, L, hex, mix, mul, mulberry32, PALETTE } from '../maquettes/hub3/lib.mjs';
import { well, hedge, cross, stele, cypress, yew, burnt, K } from '../maquettes/cloitre/props.mjs';
import { skull } from '../maquettes/cloitre/cast.mjs';
import { portcullis } from '../maquettes/grand/cast.mjs';
import { cam, SN, CS, wx, wy, wz, rx, ry, stage, ashlar, segDist, stain, flags as slabs } from './common.mjs';

const RW = 480, RH = 810, FY0 = 64, FY1 = RH - 14, CX = 240, CM = 8;
const W = 2 * RW, H = 2 * RH, YW = wy(FY0);
// The painted cloister's plan (src/room.ts): arcades' feet lines, the walks, bays, the well, hedges, graves.
const ARC = { n: 100, s: FY1 - 36, d: 6, walk: 30 };
const CROSS = [560, 330];
const ARCADES = [ARC.n, ...CROSS.flatMap((c) => [c - ARC.walk + ARC.d, c]), ARC.s];
const WALKS = [[FY0, ARC.n], ...CROSS.map((c) => [c - ARC.walk, c]), [ARC.s - ARC.d, FY1]]; // under the walks' roofs
const roofed = (y) => WALKS.some(([a, b]) => y >= a && y < b);
const BAYS = Array.from({ length: 11 }, (_, k) => 40 + k * 40);
const WELL = { x: CX, y: 662 };
const HEDGES = [
  { x: 124, y: WELL.y - 18, w: 80, h: 8 }, { x: 276, y: WELL.y - 18, w: 80, h: 8 }, { x: 124, y: WELL.y + 16, w: 80, h: 8 }, { x: 276, y: WELL.y + 16, w: 80, h: 8 },
  { x: 168, y: 180, w: 48, h: 8 }, { x: 264, y: 180, w: 48, h: 8 },
];
const GRAVES = [36, 76, 116, 156, 324, 364, 404, 444].flatMap((x) => [400, 456].map((y) => ({ x, y: y + (x % 3) * 2 })));
// Far fewer trees than the painted cloister's fifty (the user's ask): two great yews before the church, a yew and two
// cypresses among the graves, a yew and a cypress in the well's garden. Trunk foot, kind, seed.
const TREES = [[142, 158, 'yew', 40], [367, 236, 'yew', 43], [94, 430, 'yew', 34], [CX - 32, 382, 'cypress', 10], [CX + 32, 500, 'cypress', 21], [84, 616, 'yew', 1], [404, 712, 'cypress', 5]];
const BURNT = [330, 470]; // a body the Dawn caught in the open, in the graves' garden

/** What the game needs (src/cloister.data.ts): gameplay as in src/room.ts LAYOUT.cloister, but for the trees. */
export const PLAN = {
  RW, RH, FY1, BOUNDS: [CM, FY0, RW - 2 * CM, FY1 - FY0],
  BOXES: [
    ...ARCADES.flatMap((y) => [{ x: 12, w: 24 }, ...BAYS.slice(1).map((c) => ({ x: c - 20, w: 8 })), { x: RW - 12, w: 24 }].map((b) => [b.x - b.w / 2, y - ARC.d, b.w, ARC.d])),
    ...TREES.map(([x, y]) => [x - 3, y - 2, 6, 4]),
    ...GRAVES.map((g) => [g.x - 3, g.y - 2, 6, 4]),
    [WELL.x - 13, WELL.y - 8, 26, 16],
  ],
  PITS: HEDGES,
  START: { x: CX, y: FY1 - 28 },
  SPAWNS: [{ x: 168, y: 612 }, { x: 348, y: 610 }, { x: 450, y: 690 }, { x: 120, y: 500 }, { x: 360, y: 494 }, { x: CX, y: 466 }, { x: 120, y: 214 }, { x: 406, y: 236 }, { x: CX, y: 240 }],
  SPOTS: [{ x: 132, y: 118 }, { x: 348, y: 118 }, { x: 132, y: 348 }, { x: 348, y: 348 }, { x: 132, y: 578 }, { x: 348, y: 578 }, { x: 108, y: 778 }, { x: 372, y: 778 }],
  SECTIONS: CROSS.map((c) => c - ARC.d), GIFT: { x: CX, y: 112 }, GATE: { x: CX, y: FY0 }, STAIRS: { x: CX, y: FY1 + 10 },
  TORCHES: [], GATEBOX: [CX - 36, 0, CX + 36, FY0], GATE_RISE: 48,
  HOLY: true,
};

// ---------- the ground (the mockup's lawn, gravel, flagstones, kerbs, graves) ----------
const G = {
  grav: L('#c6ba98'), gravD: L('#8e8468'), flag: L('#6a604e'), flagD: L('#3e382e'), mortar: L('#1c1914'),
  straw: L('#9a8c4a'), olive: L('#5e6430'), dead: L('#5a4630'), sick: L('#7a8a3c'), earth: L('#4c3c2c'), earthD: L('#2e241a'), curb: L('#a49a80'),
  ash: L('#9c968a'), ashD: L('#4a4640'), scorch: L('#1a120c'), blood: L('#560710'), bloodD: L('#2e0406'), bone: L('#c8bc9a'),
};
function lawn(x, y) {
  const t = vn(x / 2.1, y / 1.5, 21) * 0.7 + vn(x / 1.1, y / 0.8, 22) * 0.3, m = fbm(x / 70, y / 60, 3, 4);
  let c = mix(G.straw, G.olive, clamp(fbm(x / 22, y / 18, 3, 3) * 1.6 - 0.35));
  c = mix(c, G.sick, clamp((fbm(x / 14, y / 14, 2, 5) - 0.55) * 3) * 0.6);
  c = mix(c, G.dead, clamp((m - 0.5) * 3) * 0.7);
  const bare = clamp((fbm(x / 26, y / 26, 3, 6) - 0.63) * 8);
  if (t < 0.36) c = mul(c, 0.42); else if (t > 0.68) c = mix(c, L('#d0c27e'), 0.45);
  c = mix(c, mix(G.earth, G.earthD, vn(x / 3, y / 3, 23)), bare);
  const e = 0.5, gx = vn((x + e) / 2.1, y / 1.5, 21) - vn((x - e) / 2.1, y / 1.5, 21), gy = vn(x / 2.1, (y + e) / 1.5, 21) - vn(x / 2.1, (y - e) / 1.5, 21);
  return { alb: c, N: [-gx * 2.5, -gy * 2.5, 1], wrap: 0.2 };
}
function gravel(x, y) {
  let c = mix(G.grav, G.gravD, clamp(fbm(x / 9, y / 9, 3, 11) * 1.5 - 0.45));
  const p = h2(x * 0.5 | 0, y * 0.6 | 0, 12); if (p < 0.12) c = mul(c, 0.62); else if (p > 0.9) c = mul(c, 1.12);
  c = mix(c, G.dead, clamp((fbm(x / 40, y / 30, 3, 13) - 0.55) * 2) * 0.5);
  return { alb: c, N: [(h2(x | 0, y | 0, 14) - 0.5) * 0.5, (h2(x | 0, y | 0, 15) - 0.5) * 0.5, 1], spec: 0.03 };
}
function flags(x, y, CW, CH) {
  const gy = Math.floor(y / CH), xs = x + (gy & 1) * CW / 2, gx = Math.floor(xs / CW), xo = xs - gx * CW;
  const id = gx * 97 + gy, e = Math.min(xo, CW - xo, y - gy * CH, (gy + 1) * CH - y);
  let c = mul(mix(G.flag, G.flagD, h2(id, 0, 3)), 0.8 + 0.3 * fbm(x / 6, y / 6, 2, 4));
  if (e < 1.2) c = G.mortar;
  return { alb: c, N: [0, 0, 1], spec: 0.05, ao: 0.55 };
}
const path = (x, y) => Math.abs(x - CX) < 10 || Math.abs(y - WELL.y) < 8 || Math.hypot((x - CX) / 32, (y - WELL.y) / 20) < 1; // room px
function floorAt(x, y) {
  const X = rx(x), Y = ry(y);
  if (Y >= FY1) { // the stairs down, in the front wall's gap
    const k = Math.floor((Y - FY1) / 4), edge = (Y - FY1) % 4 < 1;
    return { alb: mul(mix(G.flag, G.flagD, vn(x / 6, y / 6, 3)), (edge ? 1.2 : 0.8) * Math.max(0.1, 1 - k * 0.3)), N: [0, 0, 1] };
  }
  let f;
  const near = (d) => WALKS.some(([a, b]) => Y >= a - d && Y < b + d);
  if (roofed(Y)) { const r = slabs(x, y, 44, 30, 3); f = { alb: mul(mix(r.c, G.grav, 0.25), 1.3), N: r.N, spec: 0.05 }; } // the walks' worn slabs
  else if (near(4)) f = flags(x, y, 17, 12); // the drip course along each arcade
  else if (path(X, Y)) f = gravel(x, y);
  else if ([[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([i, j]) => path(X + i, Y + j))) f = { alb: mul(G.curb, 0.8 + 0.3 * h2(x / 12 | 0, y / 12 | 0, 3)), N: [0, 0, 1], spec: 0.04 }; // kerb
  else f = lawn(x, y);
  let c = f.alb;
  // each grave a low mound of turned earth south of its cross
  for (const g of GRAVES) { const dx = (X - g.x) / 7, dy = (Y - g.y - 8) / 6, d = dx * dx + dy * dy; if (d < 1.25) { const v = 1 - d + (vn(x / 4, y / 4, g.x) - 0.5) * 0.6; if (v > 0) { c = mix(c, mix(G.earth, G.earthD, vn(x / 3, y / 3, g.y)), clamp(v * 3)); f.N = [dx * 0.4, dy * 0.4, 1]; } } }
  // ash and scorch under the burnt one, blown down-right by the light
  { const dx = X - BURNT[0], dy = Y - BURNT[1]; const d = Math.hypot(dx / 17, dy / 12);
    const v = 1 - d + (fbm(x / 5, y / 5, 3, 31) - 0.5) * 0.9; if (v > 0) c = mix(c, v > 0.3 ? G.scorch : mix(G.ashD, G.ash, fbm(x / 3, y / 3, 2, 32) * 0.7), clamp(v * 2.5));
    const t = segDist(X, Y, [BURNT[0] + 3, BURNT[1] + 6], [BURNT[0] + 30, BURNT[1] + 22]); if (t < 4.5 && vn(x / 3, y / 3, 33) > 0.3 + t / 7) c = mix(c, G.ash, 0.75); }
  // dried blood dragged along the walks and across the gravel; old pools
  for (const d of [[[60, 772], [140, 778], [210, 770]], [[300, 546], [250, 580], [244, 640]], [[420, 316], [380, 290], [330, 270]]]) for (let k = 0; k < d.length - 1; k++) {
    const t = segDist(X, Y, d[k], d[k + 1]) + (vn(x / 9, y / 9, 38) - 0.5) * 2; if (t < 2.6 && fbm(x / 3, y / 3, 2, 36 + k) > 0.25 + t / 6) c = mix(c, G.bloodD, 0.85); }
  for (const [px, py, sx, sy] of [[210, 770, 9, 4], [244, 640, 6, 3], [330, 270, 8, 4], [72, 128, 7, 3]]) { const a = stain(X, Y, px, py, sx, sy, 0.85, px); if (a) { c = mix(c, G.bloodD, a); f.spec = 0.4; f.gloss = 60; } }
  // bone splinters and teeth by the graves
  { const cx = Math.floor(x / 7), cy = Math.floor(y / 7), r = h2(cx, cy, 300), nearG = Y > 380 && Y < 500;
    if (r < (nearG ? 0.04 : 0.006)) { const a = h2(cx, cy, 301) * 3.14, lx = x - (cx * 7 + 3.5), ly = y - (cy * 7 + 3.5), u = lx * Math.cos(a) + ly * Math.sin(a), v = -lx * Math.sin(a) + ly * Math.cos(a); if (Math.abs(v) < 0.6 && Math.abs(u) < 3) { c = G.bone; f.N = [0, 0, 1]; } } }
  f.alb = c;
  return f;
}
const env = (ox, oy, oz) => { const t = oz / SN, y = oy - CS * t; return { t, P: [ox, y, 0], ...floorAt(ox, y), id: -1 }; };

// ---------- the arcades: the mockup's, on the game's bays (an opening every 40 room px, 8 px piers, solid end piers) ----------
const A = { spring: 64, r: 32, top: 112, t: 7 }; // world z of the arches' springing, their radius, the cornice; half thickness
const stoneTex = (x, y, z, s = 1) => {
  const n = fbm3(x * 0.12, y * 0.12, z * 0.12, 3, 41);
  let c = mix(K.lime, K.limeD, clamp(n * 1.5 - 0.35));
  c = mix(c, K.lichen, clamp((vn3(x * 0.07, y * 0.07, z * 0.07, 43) - 0.55) * 3) * 0.6);
  return mix(c, K.soot, clamp((vn3(x * 0.15, y * 0.4, z * 0.03, 44) - 0.5) * 2.5) * 0.55 * s); // rain and damp streaks
};
function arcade(seed) {
  const inner = (x) => x > 48 && x < W - 48; // the bays between the end piers
  const sdf = (x, y, z) => {
    let d = sdBox(x, y, z, W / 2, 0, A.top / 2, W / 2, A.t, A.top / 2);
    if (inner(x)) {
      const u = x - 80 * Math.round(x / 80), v = x - 40 - 80 * Math.round((x - 40) / 80);
      d = Math.max(d, -(z < A.spring ? Math.abs(u) - A.r : Math.hypot(u, z - A.spring) - A.r)); // the arch
      d = Math.max(d, -Math.max(Math.abs(v) - 10, z - A.spring + 6)); // the pier's shaft, cut away...
      d = Math.min(d, Math.max(Math.hypot(Math.abs(v) - 4.6, y) - 2.9, z - A.spring + 6)); // ...for paired colonnettes
      d = Math.min(d, sdBox(v, y, z, 0, 0, A.spring - 3, 10, A.t, 3, 0.5)); // their capital
      d = Math.min(d, sdBox(v, y, z, 0, 0, 2, 8.5, A.t - 1, 2, 0.5)); // their base
    }
    return Math.min(d, sdBox(x, y, z, W / 2, 0, A.top + 3, W / 2, A.t + 2.5, 3, 0.8)); // cornice
  };
  const mat = (m, x, y, z, nx, ny, nz) => {
    let c = stoneTex(x, y, z);
    if (inner(x)) {
      const u = x - 80 * Math.round(x / 80), r = Math.hypot(u, z - A.spring);
      if (z > A.spring - 1 && r > A.r - 1 && r < A.r + 7) { // alternating pale and red voussoirs
        const a = Math.atan2(z - A.spring, u); c = (Math.floor(a / (Math.PI / 9)) & 1) ? mix(K.red, K.redD, vn3(x * 0.3, 0, z * 0.3, 2) * 0.6) : mul(c, 1.1);
        if (r > A.r + 6 || r < A.r - 0.2) c = mul(c, 0.6);
      }
    }
    if (z < 20) c = mix(c, L('#3a2e1e'), clamp((vn3(x * 0.2, 0, z * 0.5, 7) - 0.4) * 2) * 0.7 * (1 - z / 20)); // splash dirt
    if (z < 26 && vn3(x * 0.12, seed, z * 0.4, 12) > 0.62) c = mix(c, G.bloodD, 0.75); // blood smeared where someone hid
    return { alb: c, spec: 0.04, gloss: 10 };
  };
  return { sdf, mat, bounds: [-2, -A.t - 4, 0, W + 2, A.t + 4, A.top + 8], step: 0.75 };
}
// ---------- the church's south wall at the back: buttresses, two tall windows dark from outside, the door ----------
const DOOR = { hw: 40, z0: 100 };
const inDoor = (x, z) => { const u = x - wx(CX); return Math.min(DOOR.hw - Math.abs(u), z - 0.5, DOOR.z0 + Math.sqrt(Math.max(0, DOOR.hw * DOOR.hw - u * u)) - z); };
function churchSdf(x, y, z) {
  let d = sdBox(x, y, z, W / 2, YW - 100, 220, W / 2 + 60, 100, 220);
  for (const c of [CX - 76, CX + 76, CX - 172, CX + 172]) d = Math.min(d, sdBox(x, y, z, wx(c), YW, 220, 12, 10, 220, 1)); // buttresses
  if (Math.abs(x - wx(CX)) < DOOR.hw + 4) d = Math.max(d, Math.min(inDoor(x, z), y - YW + 150)); // the door, into the dark nave
  return Math.min(d, Math.max(sdBox(x, y, z, W / 2, (wy(FY1) + wy(RH + 6)) / 2, 7, W / 2 + 4, (wy(RH + 6) - wy(FY1)) / 2, 7, 1), 44 - Math.abs(x - wx(CX)))); // the front wall, the stairs' gap
  return d;
}
function churchMat(m, x, y, z, nx, ny, nz) {
  const u = x - wx(CX);
  if (y > YW + 20) return { alb: mul(K.limeD, 0.7 * (nz > 0.6 ? 1 : 0.6)), spec: 0.03 }; // the front wall
  if (Math.abs(u) < DOOR.hw + 1 && y < YW - 2) return { alb: mul(L('#2a241c'), 0.6), ao: 0.5 }; // inside
  let r = ashlar(x, z, 20, 48, 9), c = mix(r.c, K.limeD, 0.35);
  for (const w of [CX - 124, CX + 124]) { const v = x - wx(w); if (Math.abs(v) < 16 && z > 60 && z < 150 + Math.sqrt(Math.max(0, 256 - v * v))) c = Math.abs(v) < 12 && z < 150 + Math.sqrt(Math.max(0, 144 - v * v)) ? mul(L('#0e0c0a'), 1 + 0.6 * ((x + z) % 6 < 1 ? 1 : 0)) : mul(K.lime, 0.9); } // tall windows
  if (Math.abs(u) < DOOR.hw + 12 && inDoor(x, z) > -12 && inDoor(x, z) < 0) c = (Math.floor(Math.atan2(z - DOOR.z0, u) * 5) & 1) ? mix(K.red, K.redD, 0.4) : K.lime; // voussoirs
  c = mix(c, K.soot, clamp((vn3(x * 0.1, 0, z * 0.02, 44) - 0.45) * 2) * 0.6);
  return { alb: c, N: r.N, spec: 0.03, ao: 0.6 + 0.4 * clamp(z / 30) };
}

// ---------- the scene ----------
const S = stage();
const { add, light, objects } = S;
const SUN = (() => { const d = [-0.55, -0.5, 0.67], l = Math.hypot(...d); return d.map((v) => v / l); })(); // toward the Dawn (the mockup's)
add('church', { sdf: churchSdf, mat: churchMat, bounds: [-70, YW - 210, 0, W + 70, wy(RH + 8), 440], step: 0.8 }, [0, 0, 0]);
// the west range's wall, just off the left edge: only its shade shows (as in the painted cloister)
add('westwall', { sdf: (x, y, z) => sdBox(x, y, z, 0, 0, 66, 10, wy(RH), 66), mat: () => ({ alb: K.lime }), bounds: [-12, -wy(RH) - 2, 0, 12, wy(RH) + 2, 134], step: 0.9 }, [-14, 0, 0]);
ARCADES.forEach((a, k) => add('arcade', arcade(k), [0, wy(a - ARC.d / 2), 0]));
// The walks' roofs, cut away from view, as the Dawn sees them: a slab shading exactly its walk, laid where the sun's
// rays to that walk cross the roof's height.
const ROOF = 120, shift = [SUN[0] / SUN[2] * ROOF, SUN[1] / SUN[2] * ROOF];
for (const [a, b] of WALKS) add('roof', { sdf: (x, y, z) => sdBox(x, y, z, W / 2, (wy(a) + wy(b)) / 2, 4, W / 2 + 130, (wy(b) - wy(a)) / 2 + 2, 4), mat: () => ({ alb: K.tile }),
  bounds: [-140, wy(a) - 4, -1, W + 140, wy(b) + 4, 9], step: 0.9 }, [shift[0], shift[1], ROOF], 0, { ghost: true });
const port = add('portcullis', portcullis(2 * DOOR.hw + 6, DOOR.z0 + DOOR.hw), [wx(CX), YW - 14, 0]);
add('well', well(), [wx(WELL.x), wy(WELL.y), 0]);
HEDGES.forEach((b, k) => add('hedge', hedge(2 * b.w, 26, 26, k + 1), [wx(b.x + b.w / 2), wy(b.y + b.h / 2), 0]));
for (const [x, y, kind, seed] of TREES) add(kind, kind === 'yew' ? yew(seed) : cypress(200, 17, seed), [wx(x), wy(y), 0], h2(seed, 1, 3) * 6);
GRAVES.forEach((g, i) => add('grave', i % 3 === 1 ? stele(32 + (i % 4) * 2) : cross(40 + (i % 5) * 2), [wx(g.x), wy(g.y), 0], (h2(i, 0, 3) - 0.5) * 0.3));
add('burnt', burnt(), [wx(BURNT[0]), wy(BURNT[1]), 0], 0.12);
for (const [x, y, a] of [[300, 418, 0.5], [418, 520, -0.8], [126, 506, 2.4], [348, 470, 0.9], [60, 760, 1.4], [176, 268, 0.3]]) add('skull', skull(), [wx(x), wy(y), 0], a);

// ---------- lights (the mockup's) ----------
const FAR = 1e5, SUNC = L('#fbf4bc');
light({ name: 'sun', mask: true, p: [W / 2 + SUN[0] * FAR, wy(RH / 2) + SUN[1] * FAR, SUN[2] * FAR], c: SUNC, I: 3.6, r0: 1e9, R: 1e12, soft: 150, pad: 10 });
light({ name: 'rim', p: [140, -200, 160], c: L('#9aa8b4'), I: 2.0, r0: 400, R: 1600, soft: 10, only: ['well', 'grave', 'burnt'] });
light({ name: 'bounce', p: [W / 2, wy(RH / 2), 14], c: L('#c8b48a'), I: 0.9, r0: 600, R: 2400, soft: 2, noShadow: true, only: ['arcade', 'church', 'hedge', 'well', 'yew', 'cypress', 'grave'] });
light({ p: [wx(CX), YW - 110, 40], c: L('#d89048'), I: 1.4, r0: 30, R: 160, soft: 4 }); // the church's candles, beyond the door

const SC = { W, H, cam, off: 0, objects, lights: S.lights, env, ambient: L('#41516a').map((v) => v * 0.48) };
export async function scene() { return SC; }
export function raise(sc, d) { port.pos[2] = wz(d); }
/** The mockup's veil: light scattered by the dust over the open garth, a little into the shade. */
export function finish(img) {
  const N = W * H, blur = (src, r) => { const a = new Float32Array(N), b = new Float32Array(N);
    for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x < W + r; x++) { if (x + r < W) s += src[y * W + Math.min(W - 1, x + r)]; if (x - r - 1 >= 0) s -= src[y * W + x - r - 1]; if (x >= 0 && x < W) a[y * W + x] = s / (2 * r + 1); } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y < H + r; y++) { if (y + r < H) s += a[Math.min(H - 1, y + r) * W + x]; if (y - r - 1 >= 0) s -= a[(y - r - 1) * W + x]; if (y >= 0 && y < H) b[y * W + x] = s / (2 * r + 1); } }
    return b; };
  const lit = new Float32Array(N); for (let i = 0; i < N; i++) lit[i] = Math.max(0, img.out[i * 3] + img.out[i * 3 + 1] - 0.7);
  const g1 = blur(blur(lit, 3), 3), g2 = blur(blur(img.sun, 24), 24);
  for (let i = 0; i < N; i++) { const k = g2[i] * 0.03 * (0.2 + 0.8 * img.sun[i]) + g1[i] * 0.05 * (0.4 + 0.6 * img.sun[i]); img.out[i * 3] += SUNC[0] * k; img.out[i * 3 + 1] += SUNC[1] * k; img.out[i * 3 + 2] += SUNC[2] * k * 0.8; }
}
const ramp = (stops, n) => { const c = stops.map(hex), r = []; for (let i = 0; i < n; i++) { const t = i / (n - 1) * (c.length - 1), k = Math.min(c.length - 2, Math.floor(t)); r.push(mix(c[k], c[k + 1], t - k)); } return r; };
// The mockup's palette: the validated one, a bleached holy-light ramp and a cold shade ramp.
export const PAL = [...PALETTE,
  ...ramp(['#b8a466', '#d8c886', '#ece0a8', '#f8f0cc', '#fffbe8'], 7).map((c) => c.map((v) => v * 255)),
  ...ramp(['#0e1218', '#18202a', '#233040', '#33425a', '#4c5c72'], 6).map((c) => c.map((v) => v * 255)),
];
export const POST = { exposure: 3.0, vignette: 0.22, desat: 0.2, grain: 0.01, dither: 0.022 };
