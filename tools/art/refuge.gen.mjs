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
// Usage: node tools/art/refuge.gen.mjs [--fresh] (re-renders) ; also writes shots/refuge-walk.png (the boxes over it).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { deflateSync } from 'node:zlib';

process.env.STATE = 'debut'; process.env.HERO = 'crypt'; process.env.NOHERO = '1';
const hub = './maquettes/hub3/';
const { render, haze } = await import(hub + 'lib.mjs');
const C = await import(hub + 'complex.mjs');
const Wd = await import(hub + 'world.mjs');
const sc = await C.scene();
const { W, H } = sc, N = W * H, X0 = sc.offX, OFF = sc.off, SN = sc.cam.s, CS = sc.cam.c, T0 = 4000;

if (!isMainThread) { // a worker: every NW-th row
  sc.rowN = workerData.NW; sc.rowK = workerData.k;
  const r = render(sc);
  parentPort.postMessage({ out: r.out, alb: r.alb3, emi: r.emi3, depth: r.depth, nrm: r.nrm });
} else {
  const cache = 'shots/refuge.cache';
  let img;
  if (existsSync(cache) && !process.argv.includes('--fresh')) {
    const b = readFileSync(cache), f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    img = { W, H, out: f.slice(0, 3 * N), alb: f.slice(3 * N, 6 * N), emi: f.slice(6 * N, 9 * N), depth: f.slice(9 * N, 10 * N), nrm: f.slice(10 * N, 13 * N) };
  } else {
    const t0 = Date.now(), NW = availableParallelism();
    const parts = await Promise.all([...Array(NW)].map((_, k) => new Promise((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { k, NW } }); w.on('message', res); w.on('error', rej);
    })));
    img = { W, H, out: new Float32Array(3 * N), alb: new Float32Array(3 * N), emi: new Float32Array(3 * N), depth: new Float32Array(N), nrm: new Float32Array(3 * N) };
    for (let y = 0; y < H; y++) {
      const p = parts[y % NW], a = y * W, b = a + W;
      for (const k of ['out', 'alb', 'emi', 'nrm']) img[k].set(p[k].subarray(a * 3, b * 3), a * 3);
      img.depth.set(p.depth.subarray(a, b), a);
    }
    mkdirSync('shots', { recursive: true });
    writeFileSync(cache, Buffer.concat(['out', 'alb', 'emi', 'depth', 'nrm'].map((k) => Buffer.from(img[k].buffer))));
    console.log(`render ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  bake(img);
}

function bake(img) {
  C.decorate(img, sc, true); // cobwebs, smoke; the haze apart, into what glows
  const hz = { W, H, out: new Float32Array(3 * N) };
  haze(hz, sc);
  const srgb = (v) => Math.round(Math.min(1, Math.max(0, v)) ** (1 / 2.2) * 255);
  const RW = W / 2, RH = H / 2; // the room, in room px
  const albedo = new Uint8ClampedArray(N * 4), light = new Uint8ClampedArray(N * 12);
  const Yrow = new Float32Array(N), Z = new Float32Array(N); // per texel: its surface's floor row, its height (room px)
  for (let i = 0; i < N; i++) {
    const px = i % W, py = (i / W) | 0, t = img.depth[i], sy = py + 0.5 + OFF;
    const y = sy * SN + CS * T0 - CS * t, z = -sy * CS + SN * T0 - SN * t; // the surface point (world)
    Yrow[i] = t > 1e8 ? -1 : (y * SN - OFF) / 2;
    Z[i] = t > 1e8 ? 0 : (z * CS) / 2;
    for (let k = 0; k < 3; k++) { // what does not fit the light (it clips, or glows over black) is left over
      const a = srgb(img.alb[i * 3 + k]), A = (a / 255) ** 2.2, R = Math.max(0, img.out[i * 3 + k] + hz.out[i * 3 + k]);
      const l = A > 0 ? Math.round(Math.cbrt(Math.min(1, R / A / 4)) * 255) : 0, rest = A === 0 || R / A > 4 ? Math.max(0, R - A * (l / 255) ** 3 * 4) : 0;
      albedo[i * 4 + k] = a;
      light[i * 4 + k] = l;
      light[(N + i) * 4 + k] = Math.round(Math.sqrt(Math.min(1, rest)) * 255);
    }
    albedo[i * 4 + 3] = 255;
    const g = (2 * N + i) * 4, by = (py + 0.5) / 2;
    light[g] = Math.round(Math.min(255, Math.max(0, Z[i] + 64)));
    light[g + 1] = Math.round(Math.min(255, Math.max(0, (Yrow[i] < 0 ? by : Yrow[i]) - by + 64)));
    light[g + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, img.nrm[i * 3 + 1])));
    for (const b of [0, N, 2 * N]) light[(b + i) * 4 + 3] = 255;
  }

  // ---- where the hero walks: the floor of the rooms that are open (the house rooms are walled up), less the props ----
  const { R, G } = Wd, inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const OPEN = [R.HALL, R.CRYPT, R.WARD, R.STAIR];
  const world = (rx, ry) => [rx * 2 + X0 + 1, (ry * 2 + 1 + OFF) / SN]; // a room px's floor point
  const floor = new Uint8Array(RW * RH);
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) {
    const [x, y] = world(rx, ry), r = Wd.roomAt(x, y);
    if (!Wd.isFloor(x, y)) continue;
    // A body's half width off the walls; the corridors to the crypt and to the wardrobe only (the others are walled up).
    const ok = OPEN.includes(r) ? (r === R.STAIR ? y < G.stair[3] - 30 : true) : r === R.COR && (inR(x, y, G.cors[0]) || inR(x, y, G.cors[5]));
    if (ok && [[-8, 0], [8, 0], [0, -6], [0, 6]].every(([dx, dy]) => Wd.isFloor(x + dx, y + dy))) floor[ry * RW + rx] = 1;
  }
  // Solid props: their world box's footprint.
  const SOLID = /^(coffin|lidUp|cc_|oldFloor|oldH|candelabra|torch[WD12_]|armoire|wmirror|rail|chestW|basin|brazier|statue|pew|cage|dummy|rack)/;
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
  // Boxes over all that is not walked on: cells of 4 room px, runs along a row, merged down while the next row repeats them.
  const CELL = 4, CW = Math.ceil(RW / CELL), CH = Math.ceil(RH / CELL);
  const blocked = (cx, cy) => !walk[Math.min(RH - 1, cy * CELL + 2) * RW + Math.min(RW - 1, cx * CELL + 2)];
  const boxes = [], open = new Map();
  for (let cy = 0; cy <= CH; cy++) {
    const runs = [];
    for (let cx = 0; cy < CH && cx < CW;) {
      if (!blocked(cx, cy)) { cx++; continue; }
      const a = cx; while (cx < CW && blocked(cx, cy)) cx++;
      runs.push(`${a},${cx}`);
    }
    for (const [k, b] of open) if (!runs.includes(k)) { boxes.push(b); open.delete(k); }
    for (const k of runs) if (open.has(k)) open.get(k)[3] += CELL; else { const [a, e] = k.split(',').map(Number); open.set(k, [a * CELL, cy * CELL, (e - a) * CELL, CELL]); }
  }

  // ---- what stands in front of that floor, cut into sprites by floor row ----
  // A texel covers the hero when its surface stands on a floor row south of his feet: kept only where some floor he
  // walks on lies within his sprite's reach below it (40 px up, 12 to the sides), north of that row.
  const reach = new Uint16Array((RH + 1) * RW); // per column: walkable rows above, a column's dilated count
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) {
    let any = 0;
    for (let d = -12; d <= 12 && !any; d++) any = floor[ry * RW + Math.min(RW - 1, Math.max(0, rx + d))];
    reach[(ry + 1) * RW + rx] = reach[ry * RW + rx] + any;
  }
  const walkedIn = (rx, r0, r1) => r1 >= r0 && reach[(Math.min(RH - 1, r1) + 1) * RW + rx] - reach[Math.max(0, r0) * RW + rx] > 0;
  const groups = new Map();
  for (let i = 0; i < N; i++) {
    if (Z[i] < 1.5 || Yrow[i] < 0) continue;
    const px = i % W, py = (i / W) | 0, rx = px >> 1, ry = py >> 1, Y = Yrow[i];
    if (!walkedIn(rx, ry - 4, Math.min(ry + 42, Math.floor(Y) - 1))) continue;
    const key = `${Math.floor(Y / 2)},${rx >> 6}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { depth: Math.floor(Y / 2) * 2 - 11, x0: W, y0: H, x1: -1, y1: -1, px: [] }));
    g.px.push(i); g.x0 = Math.min(g.x0, px); g.x1 = Math.max(g.x1, px); g.y0 = Math.min(g.y0, py); g.y1 = Math.max(g.y1, py);
  }
  // Shelf-packed into one atlas, tallest first.
  const list = [...groups.values()].sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0));
  const AW = 2048;
  let ax = 0, ay = 0, shelf = 0;
  for (const g of list) {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
    if (ax + w > AW) { ax = 0; ay += shelf; shelf = 0; }
    g.ax = ax; g.ay = ay; ax += w; shelf = Math.max(shelf, h);
  }
  const AH = ay + shelf, atlas = new Uint8ClampedArray(AW * AH * 4);
  for (const g of list) for (const i of g.px) atlas.set(albedo.subarray(i * 4, i * 4 + 4), ((g.ay + ((i / W) | 0) - g.y0) * AW + g.ax + (i % W) - g.x0) * 4);

  // ---- the spawn by the hero's coffin, the stairs, training spawns ----
  const room = (x, y) => [Math.round((x - X0) / 2), Math.round((y * SN - OFF) / 2)]; // world floor point -> room px
  const isWalk = ([x, y]) => walk[y * RW + x] === 1;
  // Sprite positions: the hero's soles 15 room px below his (where the mockup stands him), an enemy's feet 8 below its.
  const START = room(1868, 330), STAIRS = room(1800, G.stair[1] + 20)[1];
  START[1] -= 15;
  const SPAWNS = [[1500, 1700], [2100, 1700], [1800, 1900], [1500, 1350], [2100, 1400], [1800, 1250]].map(([x, y]) => room(x, y - 26));
  for (const [p, feet] of [[START, 11], ...SPAWNS.map((p) => [p, 8])]) if (!isWalk([p[0], p[1] + feet])) throw new Error(`refuge: ${p} is not walkable`);

  png('src/refuge-albedo.png', albedo, W, H);
  png('src/refuge-light.png', light, W, 3 * H);
  png('src/refuge-over.png', atlas, AW, AH, true);
  const pal = C.PAL.map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  writeFileSync('src/refuge.data.ts', `// Generated by tools/art/refuge.gen.mjs from the refuge mockup's scene: edit the scene there, not this table.
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
  png('shots/refuge-walk.png', chk, W, H);
  console.log(`refuge ${RW}x${RH} room px: ${boxes.length} boxes, ${list.length} sprites (atlas ${AW}x${AH})`);
}

/** A PNG, RGB (or RGBA), each row filtered the way that leaves the smallest sum (none, sub or up). */
function png(path, rgba, w, h, alpha = false) {
  const n = alpha ? 4 : 3, row = w * n, raw = Buffer.alloc((row + 1) * h), cur = Buffer.alloc(row), prev = Buffer.alloc(row), f = [0, 1, 2].map(() => Buffer.alloc(row));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) for (let k = 0; k < n; k++) cur[x * n + k] = rgba[(y * w + x) * 4 + k];
    for (let i = 0; i < row; i++) { f[0][i] = cur[i]; f[1][i] = cur[i] - (i >= n ? cur[i - n] : 0); f[2][i] = cur[i] - prev[i]; }
    const cost = f.map((b) => b.reduce((s, v) => s + (v < 128 ? v : 256 - v), 0)), best = cost.indexOf(Math.min(...cost));
    raw[y * (row + 1)] = best; f[best].copy(raw, y * (row + 1) + 1); cur.copy(prev);
  }
  const crcT = new Int32Array(256).map((_, c) => { for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(12 + data.length);
    let c = -1; for (const b of td) c = crcT[(c ^ b) & 255] ^ (c >>> 8);
    out.writeUInt32BE(data.length); td.copy(out, 4); out.writeUInt32BE((c ^ -1) >>> 0, 8 + data.length);
    return out;
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = alpha ? 6 : 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
