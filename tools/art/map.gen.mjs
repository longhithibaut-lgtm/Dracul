// La carte (src/map.ts): each open zone drawn from its own plan (tools/art/rooms/<zone>.mjs: its rock, pits, floor
// kinds, walls and footprints) as an engraved chart on dark parchment, in the zone's palette, ordered-dithered: the rock
// black and hatched along its edges, the floor's outline inked, gravel and flagstones lighter, graves as stipple, the
// walls of bones in bone, the pits black, the black water rippled. No marks: doors, gates, the hero and the words are
// drawn by the game over it, under the fog. Writes src/map/<zone>.png (MW wide, its height to scale) and src/map.data.ts
// (each map's scale, and the cells, NAV room px, that stop sight: the fog's line of sight).
// Usage: node tools/art/map.gen.mjs [--zone=necropolis|catacombs] (both by default)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { png } from './bake.mjs';
import { fbm, h2 } from './maquettes/hub3/lib.mjs';

const MW = 912; // native px: the 960 of the view less its margins
const NAV = 8; // room px of a sight cell (world.ts NAV)
const BIG = 1000, SMALL = 200; // room px²: a footprint this large (a mausoleum, a facade, a wall) is drawn as a building and stops sight; this
// small (a grave, a brazier), a cross
const ZONES = process.argv.find((a) => a.startsWith('--zone='))?.slice(7).split(',') ?? ['necropolis', 'catacombs'];
const hex = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
const C = Object.fromEntries(Object.entries({
  void: '#030303', ink: '#0e0a07', rock: '#110e0b', rock1: '#1a1611', hatch: '#252019', hatch1: '#312b22',
  floorD: '#312b22', floor: '#3e362b', floorL: '#4d4336', path: '#5d5241', pathL: '#6e624e', bone: '#97896d', boneL: '#ad9e80',
  mud: '#2e2015', mudL: '#412c1c', straw: '#553a23', blood: '#4e080e', water: '#1a2124', waterL: '#2b3436', waterD: '#0e1214',
}).map(([k, v]) => [k, hex(v)]));
/** The plans' floor kinds (their floorKind()). */
const KINDS = { necropolis: ['earth', 'gravel', 'paving', 'mud'], catacombs: ['bare', 'paving', 'water', 'mud', 'filth', 'straw'] };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const data = existsSync('src/map.data.ts') ? readFileSync('src/map.data.ts', 'utf8') : '';
const old = Object.fromEntries([...data.matchAll(/^ {2}(\w+): (\{.*\}),$/gm)].map((m) => [m[1], m[2]]));
mkdirSync('src/map', { recursive: true });

for (const zone of ZONES) {
  const t0 = Date.now(), Z = await import(`./rooms/${zone}.mjs`), { RW, RH } = Z;
  const S = RW / MW, MH = Math.round(RH / S);
  // ---------- the plan, one byte per room px: 1 rock, 2 pit, 3 water; footprints: 1 small, 2 large, 3 bone wall ----------
  const N = RW * RH, ground = new Uint8Array(N), foot = new Uint8Array(N);
  const isWater = (X, Y) => zone === 'catacombs' && Z.floorKind(X, Y) === 2;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) ground[y * RW + x] = Z.rock(x + 0.5, y + 0.5) ? 1 : Z.pit(x + 0.5, y + 0.5) ? (isWater(x, y) ? 3 : 2) : 0;
  const stamp = ([x, y, w, h], v) => { for (let j = Math.max(0, Math.floor(y)); j < Math.min(RH, Math.ceil(y + h)); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(RW, Math.ceil(x + w)); i++) foot[j * RW + i] = Math.max(foot[j * RW + i], v); };
  const graves = [];
  for (const b of Z.solids()) if (b[2] * b[3] < SMALL) graves.push(b); else stamp(b, b[2] * b[3] >= BIG ? 2 : 1);
  for (const w of Z.WALLS ?? []) stamp([w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0], 3);
  for (const b of Z.gateBoxes()) stamp(b, 0); // the gates' openings: the game draws them

  // ---------- each map px: what most of its 4 x 4 samples are ----------
  const M = MW * MH, cls = new Uint8Array(M), prop = new Uint8Array(M), kind = new Uint8Array(M);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const n = [0, 0, 0, 0], f = [0, 0, 0, 0], k = new Uint8Array(8);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const X = Math.min(RW - 1, Math.floor((x + (i + 0.5) / 4) * S)), Y = Math.min(RH - 1, Math.floor((y + (j + 0.5) / 4) * S)), g = ground[Y * RW + X];
      n[g]++; f[foot[Y * RW + X]]++;
      if (!g) k[Z.floorKind(X, Y)]++;
    }
    const m = y * MW + x;
    cls[m] = n[1] >= 8 ? 1 : n[3] >= 6 ? 3 : n[2] >= 6 ? 2 : 0;
    prop[m] = f[3] >= 5 ? 3 : f[2] >= 6 ? 2 : f[1] + f[2] >= 3 ? 1 : 0;
    kind[m] = k.indexOf(Math.max(...k));
  }
  // how far each px lies from the rock's edge (8-way steps, up to 9): into the rock for rock, into the floor for the rest
  const dist = new Uint8Array(M).fill(9);
  for (let m = 0; m < M; m++) {
    const x = m % MW, y = (m / MW) | 0, r = cls[m] === 1;
    for (let d = 1; d < 9 && dist[m] === 9; d++) for (let j = -d; j <= d && dist[m] === 9; j++) for (let i = -d; i <= d; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
      const X = x + i, Y = y + j;
      if (X >= 0 && Y >= 0 && X < MW && Y < MH && (cls[Y * MW + X] === 1) !== r) { dist[m] = d; break; }
    }
  }

  // ---------- the drawing ----------
  const out = new Uint8ClampedArray(M * 4), at = (x, y) => cls[Math.max(0, Math.min(MH - 1, y)) * MW + Math.max(0, Math.min(MW - 1, x))];
  const pick = (a, b, t, x, y) => (t > bayer(x, y) ? b : a); // two palette tones mixed by `t`, dithered
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const m = y * MW + x, d = dist[m], X = x * S, Y = y * S, grain = fbm(X / 90, Y / 90, 3, 7), fine = h2(x, y, 11);
    let c;
    if (cls[m] === 1) { // the rock: inked at its edge, hatched along it (engraved hachures), a faint cross-hatch deeper in
      const reach = 2 + 5 * fbm(X / 40, Y / 40, 2, 3);
      if (d === 1) c = C.ink;
      else if (d <= reach && (x + y) % 3 === 0) c = d <= 3 ? C.hatch1 : C.hatch;
      else if (d > reach && (x - y + 900) % 7 === 0 && grain > 0.55) c = C.rock1;
      else c = C.rock;
    } else if (cls[m] === 2) c = at(x, y - 1) !== 2 && at(x, y - 1) !== 1 ? C.floorL : C.void; // a pit: its far lip lit
    else if (cls[m] === 3) { // the black water: ripples, darker at its shore
      const edge = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((v) => v !== 3);
      c = edge ? C.waterD : y % 3 === 0 && (x + 2 * Math.floor(y / 3) + Math.floor(6 * fbm(X / 30, Y / 30, 2, 5))) % 7 < 3 ? C.waterL : C.water;
    } else { // the floor: parchment, mottled, shaded under the rock's edge
      const k = KINDS[zone][kind[m]];
      c = pick(C.floorD, C.floor, grain * 1.6 - 0.25, x, y);
      if (grain > 0.62) c = pick(C.floor, C.floorL, (grain - 0.62) * 5, x, y);
      if (k === 'gravel') c = fine < 0.7 ? C.path : C.floor;
      else if (k === 'paving') c = x % 3 === 0 || y % 3 === 0 ? C.floorL : C.path; // its joints
      else if (k === 'mud') c = pick(C.floorD, C.mud, grain, x, y);
      else if (k === 'filth') c = fine < 0.04 ? C.blood : pick(C.floorD, C.mudL, grain, x, y);
      else if (k === 'straw') c = pick(C.mudL, C.straw, fine, x, y);
      if (d <= 2 && cls[m] === 0) c = d === 1 ? C.ink : C.floorD;
      const p = prop[m];
      if (p === 3) c = [m - MW, m + MW, m - 1, m + 1].some((n) => prop[n] !== 3) ? C.ink : (x + 2 * (y % 2)) % 4 < 2 ? C.boneL : C.bone; // skulls stacked
      else if (p === 2) c = prop[m - MW] !== 2 || prop[m - 1] !== 2 ? C.pathL : C.rock1; // a building: dark, its top and west edges lit
      else if (p === 1) c = C.ink; // coffins, sarcophagi, tombs
    }
    out.set([...c, 255], m * 4);
  }
  for (const [x, y, w, h] of graves) { // a cross where each stands
    const cx = Math.round((x + w / 2) / S), cy = Math.round((y + h / 2) / S);
    for (const [i, j] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) if (cls[(cy + j) * MW + cx + i] === 0) out.set([...C.ink, 255], ((cy + j) * MW + cx + i) * 4);
  }
  png(`src/map/${zone}.png`, out, MW, MH);

  // ---------- what stops sight, per NAV cell: rock or a building, most of it ----------
  const cols = Math.ceil(RW / NAV), rows = Math.ceil(RH / NAV), sight = [];
  for (let j = 0; j < rows; j++) {
    const runs = []; let v = 0, n = 0;
    for (let i = 0; i < cols; i++) {
      let k = 0;
      for (let b = 1; b < NAV; b += 2) for (let a = 1; a < NAV; a += 2) { const X = Math.min(RW - 1, i * NAV + a), Y = Math.min(RH - 1, j * NAV + b); k += ground[Y * RW + X] === 1 || foot[Y * RW + X] >= 2 ? 1 : 0; }
      const s = k >= 8 ? 1 : 0;
      if (s === v) n++; else { runs.push(n); v ^= 1; n = 1; }
    }
    runs.push(n);
    sight.push(runs.map((r) => r.toString(36)).join(','));
  }
  old[zone] = JSON.stringify({ S, w: MW, h: MH, sight: sight.join(';') });
  console.log(`${zone}: src/map/${zone}.png ${MW} x ${MH} (${S.toFixed(3)} room px a px), sight ${cols} x ${rows}, ${Date.now() - t0} ms`);
}

writeFileSync('src/map.data.ts', `// Generated by tools/art/map.gen.mjs from the zones' plans: edit those, not this table.
// Each zone's map (src/map/<zone>.png): S room px a map px, its size w x h; sight: the NAV (8) room px cells that stop the
// hero's sight (rock, buildings, walls), rows of base-36 run lengths, clear and blocked by turns (logic.ts runMask()).
export const MAPS: Record<string, { S: number; w: number; h: number; sight: string }> = {
${Object.entries(old).map(([k, v]) => `  ${k}: ${v},`).join('\n')}
};
`);
