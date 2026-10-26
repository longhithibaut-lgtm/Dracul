// The offline bake shared by the « grand pixel » rooms (tools/art/refuge.gen.mjs, tools/art/rooms.gen.mjs): a scene of
// the mockup engine (tools/art/maquettes/hub3/lib.mjs) rendered in parallel, then split into what src/dark.ts lights.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const T0 = 4000; // the renderer's ray origin, back along the view
const KEYS = ['out', 'alb', 'emi', 'depth', 'nrm', 'sun'], SIZE = { out: 3, alb: 3, emi: 3, depth: 1, nrm: 3, sun: 1 };

/** The scene rendered by `NW` workers (each runs `script` with workerData { k, NW, ...data }, renders every NW-th row
 *  and posts its buffers), cached in `cache` unless `fresh`. Returns { out, alb, emi, depth, nrm, sun }. */
export async function renderAll(script, data, W, H, cache, fresh) {
  const N = W * H;
  if (existsSync(cache) && !fresh && statSync(cache).size === 4 * N * KEYS.reduce((s, k) => s + SIZE[k], 0)) { // (an older cache, without `sun`, renders again)
    const b = readFileSync(cache), f = new Float32Array(b.buffer, b.byteOffset, b.length / 4), img = {};
    let o = 0;
    for (const k of KEYS) { img[k] = f.slice(o, o + SIZE[k] * N); o += SIZE[k] * N; }
    return img;
  }
  const t0 = Date.now(), NW = availableParallelism();
  const parts = await Promise.all([...Array(NW)].map((_, k) => new Promise((res, rej) => {
    const w = new Worker(script, { workerData: { ...data, k, NW } }); w.on('message', res); w.on('error', rej);
  })));
  const img = Object.fromEntries(KEYS.map((k) => [k, new Float32Array(SIZE[k] * N)]));
  for (let y = 0; y < H; y++) {
    const p = parts[y % NW], a = y * W, b = a + W;
    for (const k of KEYS) if (p[k]) img[k].set(p[k].subarray(a * SIZE[k], b * SIZE[k]), a * SIZE[k]);
  }
  mkdirSync('shots', { recursive: true });
  writeFileSync(cache, Buffer.concat(KEYS.map((k) => Buffer.from(img[k].buffer))));
  console.log(`render ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return img;
}
/** What a worker posts back from render(): the buffers renderAll() reads. */
export const posted = (r) => ({ out: r.out, alb: r.alb3, emi: r.emi3, depth: r.depth, nrm: r.nrm, sun: r.sun });

/** Splits the render into dark.ts's inputs: the albedo (sRGB, what the world camera draws) and three bands of light,
 *  the static light (cbrt(L / 4): the render divided by the albedo), what is left over once that clips (sqrt), the
 *  surface's height z + 64, its floor row's offset Y - y + 64 and its normal's y (128 + 127 ny), in room px. Also each
 *  texel's floor row Yrow (-1: nothing) and height Z, in room px. `extra`: light added over the render (its haze). The
 *  camera: `SN`, `CS` of its tilt, `OFF` its row offset. */
export function bands(img, W, H, SN, CS, OFF, extra) {
  const N = W * H, srgb = (v) => Math.round(Math.min(1, Math.max(0, v)) ** (1 / 2.2) * 255);
  const albedo = new Uint8ClampedArray(N * 4), light = new Uint8ClampedArray(N * 12), Yrow = new Float32Array(N), Z = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const py = (i / W) | 0, t = img.depth[i], sy = py + 0.5 + OFF;
    const y = sy * SN + CS * T0 - CS * t, z = -sy * CS + SN * T0 - SN * t; // the surface point (world)
    Yrow[i] = t > 1e8 ? -1 : (y * SN - OFF) / 2;
    Z[i] = t > 1e8 ? 0 : (z * CS) / 2;
    for (let k = 0; k < 3; k++) { // what does not fit the light (it clips, or glows over black) is left over
      const a = srgb(img.alb[i * 3 + k]), A = (a / 255) ** 2.2, R = Math.max(0, img.out[i * 3 + k] + (extra ? extra[i * 3 + k] : 0));
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
  return { albedo, light, Yrow, Z };
}

/** What stands in front of a floor the hero walks on (`floor`: 1 per walked room px, RW x RH), cut out per texel by
 *  its floor row into sprites, sorted at that row like props: a texel covers the hero when its surface stands on a floor
 *  row south of his feet; kept only where some walked floor lies within his sprite's reach below it (40 px up, 12 to the
 *  sides), north of that row. `skip(i)`: texels left out; `OX`, `OY`: the image's first texel in the floor's (a zone's chunk).
 *  Returns the groups { depth, x0, y0, x1, y1, px } (in the image). */
export function cut(floor, RW, RH, W, H, Yrow, Z, skip = () => false, OX = 0, OY = 0) {
  const reach = new Uint16Array((RH + 1) * RW); // per column: walkable rows above, a column's dilated count
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) {
    let any = 0;
    for (let d = -12; d <= 12 && !any; d++) any = floor[ry * RW + Math.min(RW - 1, Math.max(0, rx + d))];
    reach[(ry + 1) * RW + rx] = reach[ry * RW + rx] + any;
  }
  const walkedIn = (rx, r0, r1) => r1 >= r0 && reach[(Math.min(RH - 1, r1) + 1) * RW + rx] - reach[Math.max(0, r0) * RW + rx] > 0;
  const groups = new Map();
  for (let i = 0; i < W * H; i++) {
    if (Z[i] < 1.5 || Yrow[i] < 0 || skip(i)) continue;
    const px = i % W, py = (i / W) | 0, rx = (px + OX) >> 1, ry = (py + OY) >> 1, Y = Yrow[i];
    if (!walkedIn(rx, ry - 4, Math.min(ry + 42, Math.floor(Y) - 1))) continue;
    const key = `${Math.floor(Y / 2)},${rx >> 6}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { depth: Math.floor(Y / 2) * 2 - 11, x0: W, y0: H, x1: -1, y1: -1, px: [] }));
    g.px.push(i); g.x0 = Math.min(g.x0, px); g.x1 = Math.max(g.x1, px); g.y0 = Math.min(g.y0, py); g.y1 = Math.max(g.y1, py);
  }
  return [...groups.values()];
}

/** Sprites ({ x0, y0, x1, y1, px: texel indices, or rgba: their own pixels }) shelf-packed into one atlas, tallest
 *  first (sorts `list` so; each gets ax, ay): returns { atlas, AW, AH }. */
export function pack(list, albedo, W, AW = 2048) {
  const sorted = list.sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0));
  let ax = 0, ay = 0, shelf = 0;
  for (const g of sorted) {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
    if (ax + w > AW) { ax = 0; ay += shelf; shelf = 0; }
    g.ax = ax; g.ay = ay; ax += w; shelf = Math.max(shelf, h);
  }
  const AH = ay + shelf, atlas = new Uint8ClampedArray(AW * AH * 4);
  for (const g of sorted) {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
    if (g.rgba) for (let y = 0; y < h; y++) atlas.set(g.rgba.subarray(y * w * 4, (y + 1) * w * 4), ((g.ay + y) * AW + g.ax) * 4);
    else for (const i of g.px) atlas.set(albedo.subarray(i * 4, i * 4 + 4), ((g.ay + ((i / W) | 0) - g.y0) * AW + g.ax + (i % W) - g.x0) * 4);
  }
  return { atlas, AW, AH };
}

/** Boxes over every room px not walked on (`walk`, RW x RH): cells of `CELL` px, runs along a row, merged down while
 *  the next row repeats them. */
export function boxes(walk, RW, RH, CELL = 4) {
  const CW = Math.ceil(RW / CELL), CH = Math.ceil(RH / CELL);
  const blocked = (cx, cy) => !walk[Math.min(RH - 1, cy * CELL + 2) * RW + Math.min(RW - 1, cx * CELL + 2)];
  const out = [], open = new Map();
  for (let cy = 0; cy <= CH; cy++) {
    const runs = [];
    for (let cx = 0; cy < CH && cx < CW;) {
      if (!blocked(cx, cy)) { cx++; continue; }
      const a = cx; while (cx < CW && blocked(cx, cy)) cx++;
      runs.push(`${a},${cx}`);
    }
    for (const [k, b] of open) if (!runs.includes(k)) { out.push(b); open.delete(k); }
    for (const k of runs) if (open.has(k)) open.get(k)[3] += CELL; else { const [a, e] = k.split(',').map(Number); open.set(k, [a * CELL, cy * CELL, (e - a) * CELL, CELL]); }
  }
  return out;
}

/** A PNG, RGB (or RGBA), each row filtered the way that leaves the smallest sum (none, sub or up). */
export function png(path, rgba, w, h, alpha = false) {
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
