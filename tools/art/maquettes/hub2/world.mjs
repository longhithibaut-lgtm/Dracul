// The refuge as a small complex: coffin crypt (north) -> great hall -> four house rooms + the stairs down to the runs.
// One world, one heightfield (walls, niches, arches, pit, stairs), rendered with the same 3/4 ortho camera as ecran.png.
// World units: x east, y south (toward camera), z up. Characters ~100 u tall.
import { camera, L, hex, clamp, lerp, sstep, h2, vn, fbm, mix, mul, mulberry32, PALETTE } from './lib.mjs';

export const cam = camera(38 * Math.PI / 180);
const SN = cam.s, CS = cam.c;
export const C = {
  mortar: L('#0e0c0a'), stA: L('#4a4337'), stB: L('#584e40'), stC: L('#423f39'), grime: L('#1c1813'), moss: L('#3a4426'), mossL: L('#56602f'),
  blood: L('#560710'), bloodF: L('#6e0a12'), bloodD: L('#2e0406'), wall: L('#3e372d'), wallD: L('#231e18'), iron: L('#2a2622'), rust: L('#5b3520'),
  straw: L('#6e5c34'), bone: L('#b0a486'), boneD: L('#5e5440'), ash: L('#6a665e'), ashD: L('#46423b'), rug: L('#4a0c10'), rugD: L('#26070a'), rugB: L('#6a5228'),
  dirt: L('#3a2e22'), dirtD: L('#1e1810'), chalk: L('#8e8a80'), paper: L('#a8996e'), paperD: L('#5e5238'), ink: L('#1e1812'),
  wood: L('#3a2818'), woodD: L('#1c130b'), void: L('#050404'), violet: L('#3a2c46'), violetD: L('#1c1424'), marbleA: L('#6a6470'), marbleB: L('#242128'),
  book: [L('#3a1e14'), L('#1e2232'), L('#2e2a1c'), L('#3a1418'), L('#1a2a20'), L('#4a3a24')],
};

// ---------- rooms ----------
export const R = { VOID: 0, HALL: 1, CRYPT: 2, LUC: 3, ARENA: 4, VES: 5, SEV: 6, COR: 7, STAIR: 8 };
export const ROOMS = {
  [R.VOID]: { H: 0, T: -1e7 }, [R.HALL]: { H: 240, T: 40 }, [R.CRYPT]: { H: 220, T: 60 }, [R.LUC]: { H: 460, T: 30 }, [R.ARENA]: { H: 210, T: 36 },
  [R.VES]: { H: 150, T: 24 }, [R.SEV]: { H: 200, T: 30 }, [R.COR]: { H: 200, T: 24 }, [R.STAIR]: { H: 0, T: 0 },
};
export const G = {
  hall: [1150, 1160, 2450, 2160], crypt: [1350, 200, 2250, 780], luc: [1150, 100, 1290, 900], ves: [2500, 1250, 2700, 1430], sev: [2500, 1700, 2960, 2120],
  arena: { c: [650, 1650], R: 500, pit: 300, D: 48 }, stair: [1740, 2160, 1860, 2400],
  cors: [[1740, 780, 1860, 1160], [1180, 900, 1260, 1160], [1100, 1610, 1150, 1690], [2450, 1310, 2500, 1380], [2450, 1860, 2500, 1950]],
};
const inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
function floorRoom(x, y) {
  if (inR(x, y, G.hall)) return R.HALL; if (inR(x, y, G.crypt)) return R.CRYPT; if (inR(x, y, G.luc)) return R.LUC;
  if (inR(x, y, G.ves)) return R.VES; if (inR(x, y, G.sev)) return R.SEV; if (inR(x, y, G.stair)) return R.STAIR;
  if (Math.hypot(x - G.arena.c[0], y - G.arena.c[1]) < G.arena.R) return R.ARENA;
  for (const c of G.cors) if (inR(x, y, c)) return R.COR;
  return 0;
}
// openings carved in wall bands: arch doors (open from the floor) and wall niches (open between two heights)
const arch = (x0, x1, spring, pointed = 0, rise = 1) => x => { const w = (x1 - x0) / 2, u = (x - (x0 + x1) / 2) / w; if (Math.abs(u) >= 1) return -1; return spring + rise * w * (pointed ? (Math.sqrt(1 - Math.abs(u) * 0.5) * 1.15 - 0.2 * Math.abs(u)) * 0.95 : Math.sqrt(1 - u * u)); };
export const PROFILES = [null];
const CARVES = []; // [x0, y0, x1, y1, H, profileIndex]
function carve(rect, H, intervalsOf) { PROFILES.push(intervalsOf); CARVES.push([...rect, H, PROFILES.length - 1]); }
{ // great hall north wall: crypt arch (axis), Lucian's lancet, two ossuary apses
  const a1 = arch(1740, 1860, 120); carve([1740, 1120, 1860, 1160], 240, x => [[0, a1(x)]]);
  const a2 = arch(1180, 1260, 150, 1); carve([1180, 1130, 1260, 1160], 240, x => [[0, a2(x)]]);
  for (const cx of [1560, 2040]) { const a = arch(cx - 70, cx + 70, 110); carve([cx - 70, 1128, cx + 70, 1160], 240, x => [[6, a(x)]]); }
  // crypt north wall: two tiers of loculi (lower: old coffins, upper: skulls), honour apse at the axis
  for (const cx of [1428, 1568, 2032, 2172]) {
    const lo = arch(cx - 62, cx + 62, 58, 0, 0.25), up = arch(cx - 54, cx + 54, 120, 0, 0.75);
    carve([cx - 62, 148, cx + 62, 200], 220, x => { const r = []; const a = lo(x), b = up(x); if (a > 0) r.push([14, a]); if (b > 0) r.push([98, b]); return r; }); }
  { const a = arch(1700, 1900, 100); carve([1700, 150, 1900, 200], 220, x => [[0, a(x)]]); } // apse behind the hero's coffin
  // crypt south passage: low arch over the corridor
  // great hall: corridor lintels toward Vesna / Séverin are edge-on, left open
}

// ---------- heightfield ----------
export const NX = 3000, NY = 2420;
const HT = new Float32Array(NX * NY), OWN = new Uint8Array(NX * NY), PROF = new Uint8Array(NX * NY), KIND = new Uint8Array(NX * NY); // KIND: 0 void, 1 floor, 2 band
export const colMax = new Float32Array(NX);
const VOIDH = 10;
{
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x, r = floorRoom(x + 0.5, y + 0.5); OWN[i] = r; KIND[i] = r ? 1 : 0; HT[i] = r ? 0 : VOIDH; }
  // pit + stairs
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x;
    if (OWN[i] === R.ARENA && Math.hypot(x + 0.5 - G.arena.c[0], y + 0.5 - G.arena.c[1]) < G.arena.pit) HT[i] = -G.arena.D;
    if (OWN[i] === R.STAIR) HT[i] = -9 * (1 + Math.floor((y - G.stair[1]) / 20)); }
  // bands: north of floor (seen face) and beside floor (edge-on), unless floor lies just north (then it would hide that floor)
  const band = new Float32Array(NX * NY), bown = new Uint8Array(NX * NY);
  for (let x = 0; x < NX; x++) { let lastY = -1, lastR = 0; for (let y = NY - 1; y >= 0; y--) { const i = y * NX + x;
    if (KIND[i] === 1) { if (OWN[i] !== R.STAIR) { lastY = y; lastR = OWN[i]; } else lastY = -1; continue; }
    if (lastY >= 0 && lastY - y <= ROOMS[lastR].T) { band[i] = ROOMS[lastR].H; bown[i] = lastR; } } }
  const northFloor = new Int32Array(NX * NY).fill(1e6); // distance to nearest floor cell to the north
  for (let x = 0; x < NX; x++) { let last = -1e6; for (let y = 0; y < NY; y++) { const i = y * NX + x; if (KIND[i] === 1) last = y; northFloor[i] = y - last; } }
  for (let y = 0; y < NY; y++) for (const dir of [1, -1]) { let lastX = -1e6, lastR = 0;
    for (let k = 0; k < NX; k++) { const x = dir > 0 ? k : NX - 1 - k, i = y * NX + x;
      if (KIND[i] === 1) { if (OWN[i] !== R.STAIR) { lastX = x; lastR = OWN[i]; } else lastX = -1e6; continue; }
      if (Math.abs(x - lastX) <= ROOMS[lastR].T + 4 && northFloor[i] > 1.3 * ROOMS[lastR].H && band[i] < ROOMS[lastR].H) { band[i] = ROOMS[lastR].H; bown[i] = lastR; } } }
  for (let i = 0; i < NX * NY; i++) if (KIND[i] !== 1 && band[i] > 0) { HT[i] = band[i]; OWN[i] = bown[i]; KIND[i] = 2; }
  for (const [x0, y0, x1, y1, H, p] of CARVES) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * NX + x; HT[i] = H; PROF[i] = p; if (KIND[i] !== 1) KIND[i] = 2; else KIND[i] = 3; }
  for (let x = 0; x < NX; x++) { let m = 0; for (let y = 0; y < NY; y++) m = Math.max(m, HT[y * NX + x]); colMax[x] = m; }
}
export const cell = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= NX || y >= NY) return -1; return y * NX + x; };
export function solid(x, y, z) {
  const i = cell(x, y); if (i < 0) return z < VOIDH; if (z >= HT[i]) return false;
  const p = PROF[i]; if (p) { for (const [a, b] of PROFILES[p](x)) if (z > a && z < b) return false; }
  return true;
}
export const heightAt = (x, y) => { const i = cell(x, y); return i < 0 ? VOIDH : HT[i]; };
export const roomAt = (x, y) => { const i = cell(x, y); return i < 0 ? 0 : OWN[i]; };
export const kindAt = (x, y) => { const i = cell(x, y); return i < 0 ? 0 : KIND[i]; };
export const isFloor = (x, y) => { const i = cell(x, y); return i >= 0 && (KIND[i] === 1 || KIND[i] === 3); };

// ---------- env ray: DDA over cells along -y (x is constant: the camera has no yaw) ----------
export function makeEnv(mats) {
  return function env(ox, oy, oz) {
    const x = ox; const ix = Math.floor(x); if (ix < 0 || ix >= NX) return null;
    const zTop = colMax[ix] + 1; let t = (oz - zTop) / SN;
    let y = oy - CS * t, z = zTop; let iy = Math.floor(y);
    const dzc = SN / CS; // z drop per unit of y
    for (let n = 0; n < 4000; n++) {
      if (iy < 0) return null;
      if (iy >= NY) { z -= (y - NY) * dzc; y = NY; iy = NY - 1; }
      const i = iy * NX + ix, H = HT[i], p = PROF[i];
      const zOut = z - (y - iy) * dzc; // z when leaving this cell through its north edge
      let hitZ = null, face = false, ivs = p ? PROFILES[p](x) : null;
      const openAt = zz => { if (!ivs) return false; for (const [a, b] of ivs) if (zz > a && zz < b) return true; return false; };
      if (z < H && !openAt(z)) { hitZ = z; face = true; }
      else { // highest solid point below the entry height
        let s = z < H ? z : H;
        if (ivs) for (let g = 0; g < 4; g++) { let mv = false; for (const [a, b] of ivs) if (s > a && s <= b + 1e-6) { s = a; mv = true; } if (!mv) break; }
        if (s >= zOut) hitZ = s;
      }
      if (hitZ !== null) {
        const yy = face ? y : y - (z - hitZ) / dzc; const tt = (oz - hitZ) / SN;
        const P = [x, yy, hitZ];
        const m = mats(x, yy, hitZ, face, i, p);
        return { t: tt, P, N: m.N || (face ? [0, 1, 0] : [0, 0, 1]), ...m, id: -2 };
      }
      z = zOut; y = iy; iy -= 1;
      if (z < -200) return null;
    }
    return null;
  };
}
// hard shadows from the heightfield (walls, lintels, pit rim)
export function envShadow(px, py, pz, lx, ly, lz) {
  const dx = lx - px, dy = ly - py, dz = lz - pz, d = Math.hypot(dx, dy, dz); const n = Math.ceil(d / 1.6);
  for (let k = 2; k < n; k++) { const t = k / n; const z = pz + dz * t; const x = px + dx * t, y = py + dy * t; const i = cell(x, y); if (i < 0) continue;
    if (z < HT[i] && solid(x, y, z)) return 0; }
  return 1;
}
// cheap AO for env surfaces: how much tall stuff surrounds a floor point
export function envAO(x, y, z) {
  let occ = 0;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; for (const r of [5, 13, 26]) { const h = heightAt(x + Math.cos(a) * r, y + Math.sin(a) * r) - z; if (h > 2) occ += Math.min(1, h / r) * (r === 5 ? 0.06 : r === 13 ? 0.045 : 0.03); } }
  return clamp(1 - occ);
}
export { HT, OWN, KIND, PROF };
