// An open zone (--zone=necropolis, la nécropole, tools/art/rooms/necropolis.mjs; --zone=catacombs, les catacombes) baked
// for the game in chunks of one screen (480 x 270 room px, 960 x 540 texels), each rendered alone from the zone's one
// scene (only what can touch it: its objects and lights culled), then split like a room (bake.mjs bands, cut, pack) into
// src/<zone>/:
//   c<i>-<j>-a.webp  the albedo, lossy (the light shader dithers it onto the palette: the loss does not show)
//   c<i>-<j>-l.webp  dark.ts's static light and leftover glow (its first two bands), lossy
//   c<i>-<j>-g.webp  its third band, the surfaces' height, floor row and normal: data, lossless
//   c<i>-<j>-o.webp  what stands in front of the floor cut into sprites, lossless with alpha
//   gates.webp       the shortcuts' portcullises, shut to raised, lossless with alpha
// and src/<zone>.data.ts: the sprites, collisions (the zone's rock, the pits, every footprint), doors, gates, areas,
// spawn points, caches, flames, the floor the Dawn burns, and what the scene adds (its DATA). WebP is written by Python's
// Pillow (python3 -I -c).
// Usage: node tools/art/zone.gen.mjs [--zone=necropolis] [--only=i,j;i,j | --plan] [--fresh] [--final] — renders are cached
// in shots/<zone>/ (--fresh re-renders after the scene changed); --only re-bakes those chunks and keeps the others' sprite
// lists. Also writes shots/<zone>-overview.png (the whole zone posted like the mockups, a quarter size), and
// shots/<zone>-plan.png (the collisions, spawns, doors over the albedo, a quarter size).
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { render, haze, post } from './maquettes/hub3/lib.mjs';
import { posted, bands, cut, pack, boxes, png } from './bake.mjs';

const ZONE = isMainThread ? process.argv.find((a) => a.startsWith('--zone='))?.slice(7) ?? 'necropolis' : workerData.zone;
const Z = await import(`./rooms/${ZONE}.mjs`);
const sc = await Z.scene();
const { RW, RH, SW, SH } = Z, CW = 2 * SW, CH = 2 * SH, COLS = RW / SW, ROWS = RH / SH, SN = sc.cam.s, CS = sc.cam.c;

// ---------- culling: the scene as one region of it sees it ----------
function prep() { // each object's world box (as render() computes it)
  for (const o of sc.objects) {
    if (o.wmin && o.prepped) continue;
    const [x0, y0, z0, x1, y1, z1] = o.bounds, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const X of [x0, x1]) for (const Y of [y0, y1]) for (const Zz of [z0, z1]) {
      const w = [o.pos[0] + c * X - s * Y, o.pos[1] + s * X + c * Y, o.pos[2] + Zz];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
    }
    o.box = [mn, mx];
  }
}
/** The scene of the texels x0..x0+w, y0..y0+h of the zone: what can be seen there, cast a shadow or light it. */
function region(x0, y0, w, h) {
  prep();
  const M = 440, bx = [x0 - M, (y0) / SN - M, -10], by = [x0 + w + M, (y0 + h + 460 * CS) / SN + M, 1e9];
  const near = (mn, mx) => mn[0] < by[0] && mx[0] > bx[0] && mn[1] < by[1] && mx[1] > bx[1];
  const objects = sc.objects.filter((o) => o.ghost || near(...o.box));
  const lights = sc.lights.filter((l) => l.R > 1e6 || (Math.max(bx[0] - l.p[0], 0, l.p[0] - by[0]) ** 2 + Math.max(bx[1] - l.p[1], 0, l.p[1] - by[1]) ** 2 < (l.R + 40) ** 2));
  return { ...sc, W: w, H: h, offX: x0, off: y0, objects, lights };
}

if (!isMainThread) { // a worker: rows k, k + NW... of the region it is sent; or a gate's frame
  parentPort.on('message', ({ x0, y0, w, h, k, NW, gate }) => {
    if (gate) Z.raise(sc, gate.k, gate.d);
    const sub = { ...region(x0, y0, w, h), rowN: NW, rowK: k };
    const r = posted(render(sub));
    if (gate) Z.raise(sc, gate.k, Z.GATE_RISE);
    parentPort.postMessage(r, Object.values(r).map((a) => a.buffer));
  });
} else await main();

async function main() {
  const NW = availableParallelism(), pool = [...Array(NW)].map(() => new Worker(new URL(import.meta.url), { workerData: { zone: ZONE } }));
  const KEYS = ['out', 'alb', 'emi', 'depth', 'nrm', 'sun'], SIZE = { out: 3, alb: 3, emi: 3, depth: 1, nrm: 3, sun: 1 };
  /** The texels x0, y0, w x h of the zone rendered by every worker (rows shared out), cached in `cache` unless --fresh. */
  async function renderRegion(x0, y0, w, h, cache, gate) {
    const N = w * h;
    if (cache && existsSync(cache) && !process.argv.includes('--fresh') && statSync(cache).size === 4 * N * 14) {
      const b = readFileSync(cache), f = new Float32Array(b.buffer, b.byteOffset, b.length / 4), img = {};
      let o = 0;
      for (const k of KEYS) { img[k] = f.slice(o, o + SIZE[k] * N); o += SIZE[k] * N; }
      return img;
    }
    const parts = await Promise.all(pool.map((wk, k) => new Promise((res) => { wk.once('message', res); wk.postMessage({ x0, y0, w, h, k, NW, gate }); })));
    const img = Object.fromEntries(KEYS.map((k) => [k, new Float32Array(SIZE[k] * N)]));
    for (let y = 0; y < h; y++) { const p = parts[y % NW], a = y * w, b = a + w; for (const k of KEYS) img[k].set(p[k].subarray(a * SIZE[k], b * SIZE[k]), a * SIZE[k]); }
    if (cache) writeFileSync(cache, Buffer.concat(KEYS.map((k) => Buffer.from(img[k].buffer))));
    return img;
  }

  // ---------- the plan: where walkers go (room px), the collision boxes ----------
  const walk = new Uint8Array(RW * RH), solid = Z.solids(), gates = Z.gateBoxes();
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) walk[y * RW + x] = Z.rock(x + 0.5, y + 0.5) || Z.pit(x + 0.5, y + 0.5) ? 0 : 1;
  const stamp = (list, v) => { for (const [x, y, w, h] of list) for (let j = Math.max(0, Math.floor(y)); j < Math.min(RH, Math.ceil(y + h)); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(RW, Math.ceil(x + w)); i++) walk[j * RW + i] = v; };
  stamp(solid, 0); stamp(gates, 1); // the gates' openings walked through, once open
  const mask = (f) => { const m = new Uint8Array(RW * RH); for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) m[y * RW + x] = f(x + 0.5, y + 0.5) ? 0 : 1; return m; };
  const rockBoxes = boxes(mask((x, y) => Z.rock(x, y)), RW, RH, 8);
  const chasmBoxes = boxes(mask((x, y) => Z.pit(x, y) && !(Z.HOLES ?? []).some(([hx, hy, a, b]) => Math.hypot((x - hx) / a, (y - hy) / b) < 1.2)), RW, RH, 8);
  const holeBoxes = (Z.HOLES ?? []).map(([x, y, a, b]) => [Math.round(x - a * 0.85), Math.round(y - b * 0.8), Math.round(a * 1.7), Math.round(b * 1.6)]);
  const BOXES = [...rockBoxes, ...solid.map((b) => b.map(Math.round))], PITS = [...chasmBoxes, ...holeBoxes];
  console.log(`collisions: ${rockBoxes.length} rock, ${solid.length} footprints, ${PITS.length} pits`);

  // ---------- the Dawn: the floor its light reaches through the breach (the same shadow rays as the render) ----------
  const sun = sc.lights.find((l) => l.mask), SB = Z.SUN_BOX; // room px round the breach
  const lit = new Uint8Array(RW * RH);
  if (sun) { const sub = region(2 * SB[0], 2 * SB[1], 2 * (SB[2] - SB[0]), 2 * (SB[3] - SB[1])); sub.clip = [0, 0, 0, 0]; render(sub);
    for (let y = SB[1]; y < SB[3]; y++) for (let x = SB[0]; x < SB[2]; x++) if (walk[y * RW + x]) lit[y * RW + x] = sub.shadow(2 * x + 1, (2 * y + 1) / SN, 0.3, ...sun.p, sun) >= 0.5 ? 1 : 0; }
  const holy = []; for (let y = 0; y < RH; y++) { const runs = []; let v = 0, n = 0; for (let x = 0; x < RW; x++) { if (lit[y * RW + x] === v) n++; else { runs.push(n); v ^= 1; n = 1; } } runs.push(n); holy.push(runs.map((k) => k.toString(36)).join(',')); }
  console.log(`dawn: ${lit.reduce((s, v) => s + v, 0)} room px burn`);

  // ---------- each chunk ----------
  mkdirSync(`src/${ZONE}`, { recursive: true }); mkdirSync(`shots/${ZONE}`, { recursive: true });
  // --plan: the data and the plan only (no chunk re-rendered); --only=i,j;...: those chunks
  const only = process.argv.includes('--plan') ? [] : process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(';').map((s) => s.split(',').map(Number));
  const dataPath = `src/${ZONE}.data.ts`, old = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8').match(/OVER: \[number[^=]*= (.*);/)?.[1] ?? 'null') : null;
  const OVER = old ?? [];
  const OW = RW / 2, OH = RH / 2; // the overview: a quarter of the texels each way
  const ovr = existsSync(`shots/${ZONE}/overview.raw`) ? new Uint8ClampedArray(readFileSync(`shots/${ZONE}/overview.raw`)) : new Uint8ClampedArray(OW * OH * 4);
  const alb4 = existsSync(`shots/${ZONE}/albedo.raw`) ? new Uint8ClampedArray(readFileSync(`shots/${ZONE}/albedo.raw`)) : new Uint8ClampedArray(OW * OH * 4);
  const t0 = Date.now();
  let bytes = 0;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (only && !only.some(([a, b]) => a === i && b === j)) continue;
    const x0 = i * CW, y0 = j * CH, t = Date.now();
    const img = await renderRegion(x0, y0, CW, CH, `shots/${ZONE}/c${i}-${j}.cache`);
    const T = (l) => process.env.PROF && console.log(l, Date.now() - t);
    T('render'); Z.finish(img, x0, y0); T('finish');
    rim(img, x0, y0);
    const hz = { W: CW, H: CH, out: new Float32Array(3 * CW * CH) };
    haze(hz, region(x0, y0, CW, CH));
    const { albedo, light, Yrow, Z: Zt } = bands(img, CW, CH, SN, CS, y0, hz.out);
    for (let p = 0; p < CW * CH; p++) if (Yrow[p] >= 0) Yrow[p] += y0 / 2; // bands() counts floor rows from the chunk's top: the zone's
    T('bands'); const sprites = cut(walk, RW, RH, CW, CH, Yrow, Zt, undefined, x0, y0); T('cut');
    const { atlas, AW, AH } = sprites.length ? pack(sprites, albedo, CW, 1024) : { atlas: new Uint8ClampedArray(4), AW: 1, AH: 1 };
    const base = `src/${ZONE}/c${i}-${j}`;
    bytes += webp(`${base}-a.webp`, albedo, CW, CH, 'rgb', 88) + webp(`${base}-l.webp`, light.subarray(0, CW * CH * 8), CW, 2 * CH, 'rgb', 90)
      + webp(`${base}-g.webp`, light.subarray(CW * CH * 8), CW, CH, 'rgb', 0) + webp(`${base}-o.webp`, atlas, AW, AH, 'rgba', 0);
    T('webp'); OVER[j * COLS + i] = sprites.map((g) => [g.ax, g.ay, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1, g.x0 + x0, g.y0 + y0, g.depth]);
    // the overview: posted like the mockups (no hero, no moving light), a quarter size; the albedo for the plan
    const pre = post({ ...img, W: CW, H: CH, out: img.out.map((v, k) => v + hz.out[k]), emis: img.emi.filter((_, k) => k % 3 === 0).map((v, k) => v + img.emi[k * 3 + 1] + img.emi[k * 3 + 2]) }, { ...Z.POST, palette: Z.PAL });
    png(`shots/${ZONE}/c${i}-${j}.png`, pre, CW, CH);
    for (let y = 0; y < CH / 4; y++) for (let x = 0; x < CW / 4; x++) for (let c = 0; c < 4; c++) {
      ovr[((y0 / 4 + y) * OW + x0 / 4 + x) * 4 + c] = pre[((4 * y) * CW + 4 * x) * 4 + c];
      alb4[((y0 / 4 + y) * OW + x0 / 4 + x) * 4 + c] = albedo[((4 * y) * CW + 4 * x) * 4 + c];
    }
    console.log(`chunk ${i},${j}: ${((Date.now() - t) / 1000).toFixed(0)} s, ${sprites.length} sprites (atlas ${AW}x${AH})`);
  }
  writeFileSync(`shots/${ZONE}/overview.raw`, ovr); writeFileSync(`shots/${ZONE}/albedo.raw`, alb4);

  // ---------- the gates' frames: each rendered shut to raised over its opening, kept where any differs from open ----------
  const gframes = [], GATES = [];
  for (const [k, g] of Z.GATES.entries()) {
    const yc = (g.y0 + g.y1) / 2, gx0 = 2 * g.x0 - 8, gw = 2 * (g.x1 - g.x0) + 16, gy1 = Math.round(2 * yc + 6), gy0 = Math.round(2 * yc - 2 * 110 * CS / 2 - 14), gh = gy1 - gy0;
    const shot = async (d) => { const r = await renderRegion(gx0, gy0, gw, gh, `shots/${ZONE}/gate${k}-${d}.cache`, { k, d }); const a = new Uint8ClampedArray(gw * gh * 4);
      for (let p = 0; p < gw * gh; p++) for (let c = 0; c < 3; c++) a[p * 4 + c] = Math.round(Math.min(1, Math.max(0, r.alb[p * 3 + c])) ** (1 / 2.2) * 255); return a; };
    const open = await shot(Z.GATE_RISE), frames = [];
    for (let d = 0; d < Z.GATE_RISE; d += 4) frames.push(await shot(d));
    frames.push(open);
    for (let p = 0; p < gw * gh; p++) { const on = frames.some((f) => [0, 1, 2].some((c) => f[p * 4 + c] !== open[p * 4 + c])); for (const f of frames) f[p * 4 + 3] = on ? 255 : 0; }
    const list = frames.map((rgba) => ({ x0: gx0, y0: gy0, x1: gx0 + gw - 1, y1: gy0 + gh - 1, rgba }));
    gframes.push(...list);
    GATES.push({ id: g.id, name: g.name, side: g.side, lever: g.lever, arch: !!g.arch, arena: !!g.arena, box: [g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0], at: [gx0, gy0], w: gw, h: gh, depth: Math.floor(yc / 2) * 2 - 11, list });
  }
  const ga = pack(gframes, null, 0, 1024);
  bytes += webp(`src/${ZONE}/gates.webp`, ga.atlas, ga.AW, ga.AH, 'rgba', 0);

  // ---------- spawn points: open floor with room round, out of the Dawn, away from doors and gates ----------
  const area = (x, y) => Z.AREAS.findIndex((a) => x >= a.rect[0] && x < a.rect[2] && y >= a.rect[1] && y < a.rect[3]);
  const roomy = (x, y) => { for (let j = -8; j <= 10; j += 3) for (let i = -16; i <= 16; i += 4) { const X = Math.round(x + i), Y = Math.round(y + j); if (X < 0 || Y < 0 || X >= RW || Y >= RH || !walk[Y * RW + X] || lit[Y * RW + X]) return false; } return true; };
  const SPAWNS = [];
  for (let y = 60; y < RH; y += 36) for (let x = 30; x < RW; x += 36) {
    const px = x + ((y / 36) % 2) * 18;
    if (roomy(px, y) && [...Object.values(Z.DOORS), ...Z.TUNNEL].every((d) => Math.hypot(d.x - px, d.y - y) > 70) && Z.GATES.every((g) => Math.hypot((g.x0 + g.x1) / 2 - px, g.y1 - y) > 60)) SPAWNS.push([px, y, area(px, y)]);
  }
  const caches = Z.CACHES.filter(([x, y]) => walk[y * RW + x]);
  if (caches.length < Z.CACHES.length) console.log('WARNING: a cache stands off the floor');

  // ---------- the data ----------
  const J = JSON.stringify;
  writeFileSync(dataPath, `// Generated by tools/art/zone.gen.mjs from tools/art/rooms/${ZONE}.mjs: edit the scene there, not this table.
// ${Z.ABOUT}: an open zone, W x H room px, in chunks of SW x SH (one screen) loaded round the camera (src/zone.ts), two
// texels per room px in src/${ZONE}/c<i>-<j>-{a,l,g,o}.webp (albedo, light and glow, the light's geometry band, the
// sprites). OVER: per chunk (j * COLS + i), its sprites: atlas x, y, w, h, where (zone texels), depth. BOXES: what stops
// walkers and shots (rock, walls, facades, props: x, y, w, h); PITS: what walkers go round. GATES: the shortcuts, shut
// over their opening (box) until raised from their side (+1: the south) at their lever (none: raised with the other of
// its id; arena: open until a fight shuts it); their frames in src/${ZONE}/gates.webp (shut to raised). TUNNEL: a
// gallery's two mouths, linked once its gates are raised. DOORS: the ways out (x, threshold y, width).
// AREAS: where foes stand by ring (first match); SPAWNS: x, y, area; CACHES: blood to search; CHOKES: where the battue
// lies in wait (world.ts lair(): x, y, how near his way passes). TORCHES: flames over the dark; HOLY: the floor the Dawn
// burns (rows of run lengths, base 36); LANTERNS: the Order's lanterns on their poles, whose pools burn. PALETTE: for dark.ts.
export const W = ${RW}, H = ${RH}, SW = ${SW}, SH = ${SH}, COLS = ${COLS}, ROWS = ${ROWS};
export const OVER: [number, number, number, number, number, number, number][][] = ${J(OVER)};
export const BOXES: [number, number, number, number][] = ${J(BOXES)};
export const PITS: [number, number, number, number][] = ${J(PITS)};
export const GATES = ${J(GATES.map(({ list, ...g }) => ({ ...g, frames: list.map((f) => [f.ax, f.ay]) })))} as { id: string; name: string; side: number; lever: { x: number; y: number } | null; arch: boolean; arena: boolean; box: [number, number, number, number]; at: [number, number]; w: number; h: number; depth: number; frames: [number, number][] }[];
export const TUNNEL: { x: number; y: number; w: number }[] = ${J(Z.TUNNEL)};
export const DOORS: Record<string, { x: number; y: number; w: number }> = ${J(Object.fromEntries(Object.entries(Z.DOORS).map(([k, d]) => [k, { x: d.x, y: d.y, w: d.w }])))};
export const AREAS = ${J(Z.AREAS)} as { id: string; ring: number; rect: [number, number, number, number]; groups: number }[];
export const SPAWNS: [number, number, number][] = ${J(SPAWNS)};
export const CACHES: [number, number][] = ${J(caches)};
export const CHOKES: [number, number, number][] = ${J(Z.CHOKES)};
export const TORCHES: [number, number, number][] = ${J(Z.TORCH_ROWS())};
export const HOLY = '${holy.join(';')}';
export const LANTERNS: [number, number][] = ${J(Z.LANTERNS ?? [])};
export const PALETTE = ${J(Z.PAL.map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')))};
${Object.entries(Z.DATA ?? {}).map(([k, v]) => `export const ${k} = ${J(v)};\n`).join('')}`);

  // ---------- checks: the overview, the plan over the albedo ----------
  png(`shots/${ZONE}-overview.png`, ovr, OW, OH);
  const P = Uint8ClampedArray.from(alb4), dot = (x, y, c) => { x = Math.round(x / 2); y = Math.round(y / 2); if (x >= 0 && y >= 0 && x < OW && y < OH) P.set(c, (y * OW + x) * 4); };
  for (let y = 0; y < RH; y += 2) for (let x = 0; x < RW; x += 2) { if (walk[y * RW + x] && (x + y) % 8 === 0) dot(x, y, [60, 200, 60, 255]); if (lit[y * RW + x] && (x + y) % 4 === 2) dot(x, y, [255, 190, 0, 255]); }
  const frame = (list, c) => { for (const [x, y, w, h] of list) { for (let k = 0; k < w; k += 2) { dot(x + k, y, c); dot(x + k, y + h - 1, c); } for (let k = 0; k < h; k += 2) { dot(x, y + k, c); dot(x + w - 1, y + k, c); } } };
  frame(BOXES, [220, 40, 40, 255]); frame(PITS, [200, 60, 220, 255]); frame(GATES.map((g) => g.box), [255, 255, 255, 255]);
  const A = [[80, 160, 255, 255], [240, 220, 40, 255], [255, 120, 40, 255], [255, 255, 255, 255], [220, 60, 255, 255]];
  for (const [x, y, a] of SPAWNS) for (let d = -4; d <= 4; d += 2) { dot(x + d, y, A[Z.AREAS[a]?.ring ?? 4]); dot(x, y + d, A[Z.AREAS[a]?.ring ?? 4]); }
  for (const d of Object.values(Z.DOORS)) for (let k = -12; k <= 12; k++) { dot(d.x + k, d.y, [255, 255, 255, 255]); dot(d.x + k, d.y + 1, [255, 255, 255, 255]); }
  for (const [x, y] of caches) for (let k = -6; k <= 6; k++) { dot(x + k, y + k, [255, 40, 120, 255]); dot(x + k, y - k, [255, 40, 120, 255]); }
  png(`shots/${ZONE}-plan.png`, P, OW, OH);
  console.log(`baked in ${((Date.now() - t0) / 1000).toFixed(0)} s; this run wrote ${(bytes / 1e6).toFixed(2)} MB of webp; ${SPAWNS.length} spawn points`);
  for (const w of pool) w.terminate();

  /** Its yellow rim, as the cloister has it: the burning room px that touch the shade (rooms.gen.mjs dawn()). */
  function rim(img, x0, y0) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < RW && y < RH ? lit[y * RW + x] : 1);
    for (let p = 0; p < CW * CH; p++) {
      const tx = x0 + (p % CW), ty = y0 + ((p / CW) | 0), x = tx >> 1, y = ty >> 1;
      if (!lit[y * RW + x] || img.depth[p] > 1e8) continue;
      if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) continue; // a room px wide: it reads at a glance
      img.out[p * 3] *= 1.35; img.out[p * 3 + 1] *= 1.0; img.out[p * 3 + 2] *= 0.3;
    }
  }
}

/** `rgba` (w x h) as WebP at `path`: 'rgb' or 'rgba', lossy at quality q (0: lossless). Returns its size. */
function webp(path, rgba, w, h, mode, q) {
  const M = process.argv.includes('--final') ? 6 : 4; // --final: the smallest files, slowly
  const n = mode === 'rgb' ? 3 : 4, raw = Buffer.alloc(w * h * n);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < n; c++) raw[p * n + c] = rgba[p * 4 + c];
  const py = `import sys; from PIL import Image; im = Image.frombytes('${mode.toUpperCase()}', (${w}, ${h}), sys.stdin.buffer.read()); im.save('${path}', 'WEBP', ${q ? `quality=${q}, method=${M}` : `lossless=True, quality=${M > 4 ? 100 : 60}, method=${M}`})`;
  const r = spawnSync('python3', ['-I', '-c', py], { input: raw, maxBuffer: 1 << 30 });
  if (r.status) throw new Error(`webp ${path}: ${r.stderr}`);
  return statSync(path).size;
}
