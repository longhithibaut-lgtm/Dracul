// The refuge (« grand pixel », docs/lore.md « Le refuge ») for the game, baked from the validated mockup's own scene
// (tools/art/maquettes/hub3/complex.mjs, state « début »: no chief freed, every house's door walled up) without its
// hero, whom the game draws. Its 3D render (~70 s on 4 cores, cached in shots/refuge.cache) is split into what dark.ts
// lights the way it lights the torture room: the albedo (src/refuge-albedo.png, what the world camera draws), and three
// bands of light (src/refuge-light.png): the static light (cbrt(L / 4): the whole render divided by the albedo), what is
// left over once that clips (sqrt), the surface's height z + 64, its floor row's offset Y - y + 64 and its normal's y
// (128 + 127 ny), in room px. One texel is one mockup px, half a room px: the game shows it at the mockup's density.
// What stands in front of a floor the hero walks on is cut out per pixel, by its floor row, into the sprites of
// src/refuge-over.png (sorted at that row like props); the floor he walks on, its walls and solid props become boxes.
// All of it, with the spawn and the stairs, goes to src/refuge.data.ts.
// --vesna: the refuge once Vesna is freed (the mockup's state « rat »: her coffin open, her shop open and walkable, her
// door's candelabras and light, the offering groove from it run red), without her (the game draws her): its own sprites
// and boxes (src/refuge-vesna-over.png, src/refuge-vesna.data.ts), and its albedo and light only where they differ from
// the first state's (src/refuge-vesna-albedo.png, -light.png: transparent elsewhere; the game lays them over the first's).
// The first state's bake must have run before (it leaves its bands in shots/refuge-bands.raw).
// Usage: node tools/art/refuge.gen.mjs [--vesna] [--fresh] (re-renders) ; also writes shots/refuge[-vesna]-walk.png (the boxes over it).
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { renderAll, posted, bands, cut, pack, boxes as boxesOf, png } from './bake.mjs';

process.env.STATE ??= process.argv.includes('--vesna') ? 'rat' : 'debut'; process.env.HERO = 'crypt'; process.env.NOHERO = '1'; // (workers inherit it)
const VESNA = process.env.STATE === 'rat', KEY = VESNA ? 'refuge-vesna' : 'refuge';
const hub = './maquettes/hub3/';
const { render, haze } = await import(hub + 'lib.mjs');
const C = await import(hub + 'complex.mjs');
const Wd = await import(hub + 'world.mjs');
const sc = await C.scene();
const { W, H } = sc, N = W * H, X0 = sc.offX, OFF = sc.off, SN = sc.cam.s, CS = sc.cam.c;

if (!isMainThread) { // a worker: every NW-th row
  sc.rowN = workerData.NW; sc.rowK = workerData.k;
  parentPort.postMessage(posted(render(sc)));
} else bake({ ...(await renderAll(new URL(import.meta.url), {}, W, H, `shots/${KEY}.cache`, process.argv.includes('--fresh'))), W, H });

function bake(img) {
  C.decorate(img, sc, true); // cobwebs, smoke; the haze apart, into what glows
  const hz = { W, H, out: new Float32Array(3 * N) };
  haze(hz, sc);
  const RW = W / 2, RH = H / 2; // the room, in room px
  const { albedo, light, Yrow, Z } = bands(img, W, H, SN, CS, OFF, hz.out);

  // ---- where the hero walks: the floor of the rooms that are open (the house rooms are walled up, Vesna's open once she is free), less the props ----
  const { R, G } = Wd, inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const OPEN = [R.HALL, R.CRYPT, R.WARD, R.STAIR, ...(VESNA ? [R.VES] : [])];
  const world = (rx, ry) => [rx * 2 + X0 + 1, (ry * 2 + 1 + OFF) / SN]; // a room px's floor point
  const floor = new Uint8Array(RW * RH);
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) {
    const [x, y] = world(rx, ry), r = Wd.roomAt(x, y);
    if (!Wd.isFloor(x, y)) continue;
    // A body's half width off the walls; the corridors to the crypt and to the wardrobe only (the others are walled up).
    const ok = OPEN.includes(r) ? (r === R.STAIR ? y < G.stair[3] - 30 : true) : r === R.COR && (inR(x, y, G.cors[0]) || inR(x, y, G.cors[5]) || (VESNA && inR(x, y, G.cors[3])));
    if (ok && [[-8, 0], [8, 0], [0, -6], [0, 6]].every(([dx, dy]) => Wd.isFloor(x + dx, y + dy))) floor[ry * RW + rx] = 1;
  }
  // Solid props: their world box's footprint.
  const SOLID = /^(stall|shelves|crate|coffin|lidUp|cc_|oldFloor|oldH|candelabra|torch[WD12_]|armoire|wmirror|rail|chestW|basin|brazier|statue|pew|cage|dummy|rack)/;
  const walk = floor.slice(), feet = [];
  for (const o of sc.objects) {
    if (!SOLID.test(o.name)) continue;
    const [x0, y0, , x1, y1] = o.bounds, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
    const xs = [], ys = [];
    for (const X of [x0, x1]) for (const Y of [y0, y1]) { xs.push(o.pos[0] + c * X - s * Y); ys.push(o.pos[1] + s * X + c * Y); }
    const shrink = /candelabra|torch/.test(o.name) ? 0.45 : 0.85; // a stand's arms overhang its foot
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const hw = ((Math.max(...xs) - Math.min(...xs)) / 2) * shrink, hh = ((Math.max(...ys) - Math.min(...ys)) / 2) * shrink;
    const b = [Math.floor((cx - hw - X0) / 2), Math.floor(((cy - hh) * SN - OFF) / 2), Math.ceil((cx + hw - X0) / 2), Math.ceil(((cy + hh) * SN - OFF) / 2)];
    feet.push(b);
    for (let ry = Math.max(0, b[1] - 3); ry < Math.min(RH, b[3]); ry++) for (let rx = Math.max(0, b[0] - 4); rx < Math.min(RW, b[2] + 4); rx++) walk[ry * RW + rx] = 0;
  }
  const boxes = boxesOf(walk, RW, RH);

  // ---- what stands in front of that floor, cut into sprites by floor row ----
  const list = cut(floor, RW, RH, W, H, Yrow, Z);
  const { atlas, AW, AH } = pack(list, albedo, W);

  // ---- the spawn by the hero's coffin, the stairs, training spawns ----
  const room = (x, y) => [Math.round((x - X0) / 2), Math.round((y * SN - OFF) / 2)]; // world floor point -> room px
  const isWalk = ([x, y]) => walk[y * RW + x] === 1;
  // Sprite positions: the hero's soles 15 room px below his (where the mockup stands him), an enemy's feet 8 below its.
  const START = room(1868, 330), STAIRS = room(1800, G.stair[1] + 20)[1];
  START[1] -= 15;
  const SPAWNS = [[1500, 1700], [2100, 1700], [1800, 1900], [1500, 1350], [2100, 1400], [1800, 1250]].map(([x, y]) => room(x, y - 26));
  for (const [p, feet] of [[START, 11], ...SPAWNS.map((p) => [p, 8])]) if (!isWalk([p[0], p[1] + feet])) throw new Error(`refuge: ${p} is not walkable`);

  if (!VESNA) {
    png('src/refuge-albedo.png', albedo, W, H);
    png('src/refuge-light.png', light, W, 3 * H);
    writeFileSync('shots/refuge-bands.raw', Buffer.concat([albedo, light].map((a) => Buffer.from(a.buffer, a.byteOffset, a.length)))); // for --vesna's difference
  } else { // only where Vesna's state differs from the first (any of the three bands), a texel of margin round it
    const raw = readFileSync('shots/refuge-bands.raw'), A0 = raw.subarray(0, 4 * N), L0 = raw.subarray(4 * N), diff = new Uint8Array(N);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3 && !diff[i]; k++) diff[i] = albedo[4 * i + k] !== A0[4 * i + k] || [0, N, 2 * N].some((b) => light[4 * (b + i) + k] !== L0[4 * (b + i) + k]) ? 1 : 0;
    const keep = diff.map((_, i) => { const x = i % W, y = (i / W) | 0; for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (diff[Math.min(H - 1, Math.max(0, y + j)) * W + Math.min(W - 1, Math.max(0, x + k))]) return 1; return 0; });
    for (let i = 0; i < N; i++) if (!keep[i]) { albedo.fill(0, 4 * i, 4 * i + 4); for (const b of [0, N, 2 * N]) light.fill(0, 4 * (b + i), 4 * (b + i) + 4); } // all nought: it packs small
    png('src/refuge-vesna-albedo.png', albedo, W, H, true);
    png('src/refuge-vesna-light.png', light, W, 3 * H, true);
    console.log(`vesna: ${keep.reduce((s, v) => s + v, 0)} of ${N} texels differ`);
  }
  png(`src/${KEY}-over.png`, atlas, AW, AH, true);
  const pal = C.PAL.map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  writeFileSync(`src/${KEY}.data.ts`, `// Generated by tools/art/refuge.gen.mjs${VESNA ? ' --vesna' : ''} from the refuge mockup's scene: edit the scene there, not this table.
// Room px (two texels of the refuge's images each). W x H: the room. BOXES: what stops walkers (walls, the walled-up
// doors, solid props), x, y, w, h. OVER: the sprites cut from src/refuge-over.png, atlas x, y, w, h (texels), where they
// go (texels), their depth. START: by the hero's coffin. STAIRS: the feet line where the stairs down to the runs begin.
// PALETTE: the mockup's, for dark.ts.
export const W = ${RW}, H = ${RH};
export const START = { x: ${START[0]}, y: ${START[1]} }, STAIRS = ${STAIRS};
export const SPAWNS = ${JSON.stringify(SPAWNS.map(([x, y]) => ({ x, y })))};
export const BOXES: [number, number, number, number][] = ${JSON.stringify(boxes)};
export const OVER: [number, number, number, number, number, number, number][] = ${JSON.stringify(list.map((g) => [g.ax, g.ay, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1, g.x0, g.y0, g.depth]))};
export const PALETTE = ${JSON.stringify(pal)};
`);
  // A check: the walked floor (green), the boxes (red outlines), the props' feet (yellow), over the albedo.
  const chk = Uint8ClampedArray.from(albedo);
  const dot = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) chk.set(c, (y * W + x) * 4); };
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) if (walk[ry * RW + rx] && (rx + ry) % 3 === 0) dot(rx * 2, ry * 2, [60, 200, 60, 255]);
  for (const [x, y, w, h] of boxes) for (let k = 0; k < 2 * w; k++) { dot(2 * x + k, 2 * y, [220, 40, 40, 255]); dot(2 * x + k, 2 * (y + h) - 1, [220, 40, 40, 255]); }
  for (const [x0, y0, x1, y1] of feet) for (let x = 2 * x0; x < 2 * x1; x++) { dot(x, 2 * y0, [240, 220, 40, 255]); dot(x, 2 * y1, [240, 220, 40, 255]); }
  for (const p of [START, ...SPAWNS]) for (let d = -4; d <= 4; d++) { dot(2 * p[0] + d, 2 * p[1], [80, 160, 255, 255]); dot(2 * p[0], 2 * p[1] + d, [80, 160, 255, 255]); }
  png(`shots/${KEY}-walk.png`, chk, W, H);
  console.log(`refuge ${RW}x${RH} room px: ${boxes.length} boxes, ${list.length} sprites (atlas ${AW}x${AH})`);
}
