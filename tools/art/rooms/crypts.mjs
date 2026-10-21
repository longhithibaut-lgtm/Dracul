// What the four crypt rooms of a run share (la crypte, la nef, l'ossuaire, la chapelle), baked by tools/art/rooms.gen.mjs
// in the « grand pixel » style: one screen wide, 638 room px tall, the shell of the validated crypt (crypt.mjs): the
// back wall in ashlar with its two moonlit lancets, its ossuaries, pilasters and rotted banners of the Order, the
// portcullis before a passage climbing to the moon, side walls at the room's edges (the floor fills the view's width),
// the front wall over the stairs, an unseen vault pierced by oculi above the floor's medallions; the refuge's grimy
// flagstones, medallions, grave slabs, old blood; the props on their footprints (pillars with their dying torches,
// broken stumps, braziers, coffins on stone biers); the moon, fills, fires and candles; the moon's shafts in the air.
import { sdBox, clamp, vn, fbm, h2, L, hex, mix, mul, mulberry32, PALETTE } from '../maquettes/hub3/lib.mjs';
import { pillar, portcullis, sconce } from '../maquettes/grand/cast.mjs';
import { oldCoffin } from '../maquettes/hub3/props2.mjs';
import { candles2, brazier2 } from '../maquettes/hub3/props3.mjs';
import { cam, SN, CS, wx, wy, wz, rx, ry, C, scaled, broken, block, stage, flags, grime, ashlar, ossuary, stain, segDist, stone3 } from './common.mjs';

export const RW = 480, RH = 638, FX0 = 12, FX1 = 468, FY0 = 64, FY1 = RH - 14, CX = 240, CY = 160;
export const W = 2 * RW, H = 2 * RH, YW = wy(FY0); // the back wall's face
export const MOONC = L('#9ab0be'), FIRE = L('#e07a30'), CANDLE = L('#d8b070');
const BRAZIER_TOP = 36; // z of the bowl's rim, where its flame stands
const SCONCE_Z = 100; // a dying torch on each whole pillar's face, this high
const row = (y, z) => Math.round(y * SN / 2 - z * CS / 2); // the screen row (room px) of a world point
const pillarFace = (o) => [wx(o.x), wy(o.y - o.h / 2) + 17]; // the middle of a pillar's south face

/** What the game needs (src/<id>.data.ts) from a crypt room's plan: its props' footprints, pits, start, spawns, the
 *  Order's lantern spots, sections and gift (as src/room.ts had them), and its flames. */
export function plan({ props, pits = [], start, spawns, spots, sections, gift = { x: CX, y: CY }, holy = false }) {
  return {
    RW, RH, FY1, BOUNDS: [FX0, FY0, FX1 - FX0, FY1 - FY0],
    BOXES: props.map((o) => [o.x - o.w / 2, o.y - o.h, o.w, o.h]), PITS: pits,
    START: start, SPAWNS: spawns, SPOTS: spots, SECTIONS: sections, GIFT: gift, GATE: { x: CX, y: FY0 }, STAIRS: { x: CX, y: FY1 + 10 },
    // The braziers' flames, drawn over the dark by dark.ts: x, the row under the flame, strength.
    TORCHES: [...props.filter((o) => o.kind === 'brazier').map((o) => [o.x, Math.round(o.y - 4 - BRAZIER_TOP * CS / 2), 1]),
      ...props.filter((o) => o.kind === 'pillar').map((o) => [o.x, row(pillarFace(o)[1] + 9, SCONCE_Z + 14), 0.6])],
    GATEBOX: [CX - 36, 0, CX + 36, FY0], GATE_RISE: 48, // room px: the portcullis' frames, how far it rises up the screen
    HOLY: holy,
  };
}

// ---------- the floor ----------
export const MOON = (() => { const d = [-0.42, -0.3, 0.86], l = Math.hypot(...d); return d.map((v) => v / l); })(); // toward the moon
const VAULT = 340; // the vault's height: the oculi are cut in it above each medallion
/** The vault's oculi letting the moon fall onto the floor rows `rows` ([row, size]): world x, y, radius. */
export const oculi = (rows) => rows.map(([y, s]) => { const t = VAULT / MOON[2]; return [wx(CX) + MOON[0] * t, wy(y) + MOON[1] * t, 100 * s]; });

export function medallion(x, y, my, s) { // carved in the floor round (CX, my): a ring of voussoirs, a blood channel, an eight-point star, a drain
  const dx = x - wx(CX), dy = y - wy(my), d = Math.hypot(dx, dy) / s, a = Math.atan2(dy, dx);
  if (d > 130) return null;
  const R = 110, r0 = 92, n = 24;
  let c = null, N = null, wet = 0;
  if (d < R) {
    c = mix(C.stB, C.stA, vn(x / 9, y / 9, 3) * 0.6);
    if (d > r0) { const v = (((a / Math.PI) * (n / 2) + n + 0.5) % n); c = mul(mix(C.wall, C.stB, h2(Math.floor(v), 0, 6)), 0.9); if (Math.abs((v % 1) - 0.5) < 0.05 * (100 / d)) { c = C.mortar; N = [0, 0, 1]; } }
    const S = 74, ax = Math.abs(dx / s), ay = Math.abs(dy / s), star = ax + ay <= S || Math.max(ax, ay) <= S / Math.SQRT2;
    if (d <= r0 && star) c = mix(c, C.stC, 0.5);
    if (d <= r0 && star && (Math.abs(ax + ay - S) < 1.4 || Math.abs(Math.max(ax, ay) - S / Math.SQRT2) < 1.4)) c = C.mortar; // the star's edges, cut
    if (Math.abs(d - 84) < 2.6) { c = mix(C.bloodD, C.blood, vn(x / 4, y / 4, 5) > 0.55 ? 0.8 : 0.2); wet = 0.6; } // the blood channel
    if (Math.abs(d - 50) < 1.1 || Math.abs(d - 32) < 1.1 || Math.abs(d - R) < 1.4 || Math.abs(d - r0) < 1.1) c = C.mortar;
    if (d < 13) { c = mix(L('#0a0806'), C.bloodD, 0.4); N = [dx / (d * s + 0.1) * 0.6, dy / (d * s + 0.1) * 0.6, 1]; wet = 0.5; } // the drain
    c = mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9) - 0.45) * 2) * 0.6);
  } else if (Math.abs(d - 118) < 4) c = mix(C.wall, C.bloodD, 0.35); // an inlaid band of dark red stone
  return c && { c, N, wet };
}
function ledgerAt(ledgers, x, y) { // a grave slab set in the floor: raised edge, carved border, a skull; some split in two
  for (const [lx, ly, brk] of ledgers) {
    const u = rx(x) - lx, v = ry(y) - ly;
    if (u < 0 || v < 0 || u >= 28 || v >= 16) continue;
    let c = mul(mix(C.stB, C.wall, 0.35), 0.85 + 0.3 * vn(x / 6, y / 6, lx)), N = [0, 0, 1];
    const e = Math.min(u, 28 - u, v, 16 - v);
    if (e < 0.6) c = C.mortar; else if (e < 1.5) { N = [u < 1.5 ? -0.5 : u > 26.5 ? 0.5 : 0, v < 1.5 ? -0.5 : v > 14.5 ? 0.5 : 0, 1]; c = mul(c, 1.15); }
    else if (Math.abs(e - 3.2) < 0.45) c = mul(c, 0.5);
    else { const sk = ['.###.', '#####', '#.#.#', '.###.', '.#.#.'][Math.floor(v - 5)]?.[Math.floor(u - 11.5)]; if (sk === '#') c = mul(c, 0.5); }
    if (brk && Math.abs(u - 19 - Math.sin(v * 1.3) * 1.5) < 0.6) c = C.mortar;
    return { c: mix(c, C.grime, clamp((fbm(x / 7, y / 7, 3, 9) - 0.45) * 2) * 0.8), N };
  }
  return null;
}
/** A crypt floor: `meds` medallions down the middle ([row, size]), `ledgers` grave slabs (top left room px, broken),
 *  old blood `pools` (room px: x, y, rx, ry) and `drags` (polylines); `under(r, x, y)`: what a room lays on it instead of
 *  the flags ({ c, N, wet }, or nothing), before the blood. */
export function floor({ meds = [], ledgers = [], pools = [], drags = [], under }) {
  return (x, y) => {
    const r = [rx(x), ry(y)];
    if (r[0] < FX0 - 12 || r[0] > FX1 + 12) return { alb: C.void, N: [0, 0, 1], noAO: true };
    if (r[1] > FY1) { // the stairs down, in the front wall's gap: steps sinking into the dark
      const k = Math.floor((r[1] - FY1) / 4), edge = (r[1] - FY1) % 4 < 1;
      return { alb: mul(mix(C.stB, C.stC, vn(x / 6, y / 6, 3)), (edge ? 1.2 : 0.8) * Math.max(0.1, 1 - k * 0.3)), N: edge ? [0, 0.4, 1] : [0, 0, 1] };
    }
    const f = flags(x, y, 46, 34, 7);
    let c = f.c, N = f.N, wet = 0;
    c = grime(c, x, y);
    const md = meds.map(([my, s]) => medallion(x, y, my, s)).find(Boolean), lg = !md && ledgerAt(ledgers, x, y), u = !md && !lg && under?.(r, x, y);
    if (md) { c = md.c; if (md.N) N = md.N; wet = md.wet; } else if (lg) { c = lg.c; N = lg.N; } else if (u) { c = u.c; N = u.N ?? N; wet = u.wet ?? 0; }
    const m = fbm(x / 26, y / 22, 4, 33); if (m > 0.68) c = mix(c, h2(x | 0, y | 0, 5) < 0.3 ? C.mossL : C.moss, clamp((m - 0.68) * 4) * 0.6);
    // the dark creeps in from the walls
    const dw = Math.min(r[0] - FX0, FX1 - r[0], (r[1] - FY0) * 1.6); if (dw < 14) c = mix(c, C.grime, (1 - dw / 14) * 0.5);
    let a = 0;
    for (const [px, py, sx, sy] of pools) a = Math.max(a, stain(r[0], r[1], px, py, sx * 1.3, sy * 1.3, 0.85, px + py));
    for (const d of drags) for (let k = 0; k < d.length - 1; k++) { const t = segDist(r[0], r[1], d[k], d[k + 1]); if (t < 2.4 && vn(x / 2.5, y / 2.5, 36 + k) > 0.3 + t / 6) a = Math.max(a, 0.8); }
    if (a > 0) { c = mix(c, mix(C.bloodD, C.blood, vn(x / 4, y / 4, 8) * 0.6), a); wet = Math.max(wet, a * 0.7); N = [0, 0, 1]; }
    // bone splinters and teeth
    { const cx = Math.floor(x / 7), cy = Math.floor(y / 7);
      if (h2(cx, cy, 300) < 0.012) { const an = h2(cx, cy, 301) * 3.14, lx = x - (cx * 7 + 3.5), ly = y - (cy * 7 + 3.5), u = lx * Math.cos(an) + ly * Math.sin(an), v = -lx * Math.sin(an) + ly * Math.cos(an);
        if (Math.abs(v) < 0.6 && Math.abs(u) < 3) { c = C.bone; N = [0, 0, 1]; } } }
    return { alb: c, N, spec: wet > 0.2 ? 0.55 * wet : 0.04, gloss: wet > 0.2 ? 70 : 12 };
  };
}
/** The scene's ground: the floor plane, or (`pit(x, y)`, room px: true in a hole) down a pit's sheer sides into the dark. */
export function ground(floorAt, pit) {
  return (ox, oy, oz) => {
    const t = oz / SN, y = oy - CS * t;
    if (!pit?.(rx(ox), ry(y))) return { t, P: [ox, y, 0], ...floorAt(ox, y), id: -1 };
    // in the hole: on down the ray (it runs north as it sinks) until it leaves the hole's outline, into its far side
    for (let k = 1; k < 400; k++) {
      const yy = y - k * 0.5, z = -k * 0.5 * SN / CS;
      if (pit(rx(ox), ry(yy))) continue;
      const d = clamp(1 + z / 140), n = vn(ox / 5, z / 7, 8);
      return { t: t + k * 0.5 / CS, P: [ox, yy, z], N: [(vn(ox / 3, z / 3, 9) - 0.5) * 0.8, 1, (n - 0.5) * 0.6],
        alb: mul(mix(C.stC, C.wallD, n), (0.25 + 0.75 * d * d) * (z > -6 ? 1.1 : 0.8)), ao: 0.4 + 0.6 * d, spec: 0.02, id: -1 };
    }
    return { t: t + 200, P: [ox, y - 200, -200], N: [0, 1, 0], alb: C.void, noAO: true, id: -1 };
  };
}
/** What the floor keeps from a light over a pit: none of it reaches below the floor but through the hole. */
export const pitShadow = (pit) => (px, py, pz, lx, ly, lz) => {
  if (pz >= 0 || lz <= 0) return 1;
  const k = -pz / (lz - pz);
  return pit(rx(px + (lx - px) * k), ry(py + (ly - py) * k)) ? 1 : 0;
};

// ---------- the shell: back wall (lancets, gate, ossuary, pilasters, banners), side walls, front wall, the vault ----------
const LANCETS = [wx(CX - 100), wx(CX + 100)];
const inPointed = (u, z, hw, z0, r) => Math.abs(u) < hw && (z < z0 || Math.hypot(Math.abs(u) + (r - hw), z - z0) < r); // a pointed arch, springing at z0
const GATE_HW = 44, GATE_Z = 104;
const archTop = (u, hw, z0, r) => z0 + Math.sqrt(Math.max(0, r * r - (Math.abs(u) + r - hw) ** 2)); // a pointed arch's crown over u
const stairUp = (y) => Math.max(0, Math.floor((YW - 70 - y) / 22) * 9); // the passage's steps, climbing north beyond the gate
/** How far inside the gate's opening and the passage beyond (> 0 inside): a carve. */
const inGate = (x, y, z) => { const u = x - wx(CX), f = stairUp(y); return Math.min(GATE_HW - Math.abs(u), z - f, archTop(u, GATE_HW, GATE_Z, 52) + f - z, y - (YW - 380)); };
function wallSdf(x, y, z) { // 40 deep, up to the vault; the lancets and the gate cut through it
  let d = sdBox(x, y, z, W / 2, YW - 20, 200, W / 2 + 40, 20, 200);
  for (const c of [wx(CX - 48), wx(CX + 48), wx(CX - 152), wx(CX + 152)]) d = Math.min(d, sdBox(x, y, z, c, YW, 200, 13, 9, 200, 1)); // pilasters
  for (const c of LANCETS) if (Math.abs(x - c) < 30) d = Math.max(d, Math.min(16 - Math.abs(x - c), z - 46, archTop(x - c, 16, 112, 22) - z));
  if (Math.abs(x - wx(CX)) < GATE_HW + 30) d = Math.max(d, inGate(x, y, z));
  return d;
}
function passageSdf(x, y, z) { // beyond the gate: a vaulted passage, its steps climbing to the moonlit way out
  return Math.max(sdBox(x, y, z, wx(CX), YW - 220, 200, GATE_HW + 24, 180, 200), inGate(x, y, z));
}
function wallMat(m, x, y, z, nx, ny, nz) {
  const u = x - wx(CX);
  if (Math.abs(u) < GATE_HW + 1 && y < YW - 2) { // the passage: steps and walls in the moonlight's way
    const c = mul(mix(C.stB, C.stC, vn(x / 7, z / 7 + y / 9, 3)), ny < -0.5 ? 0.6 : 1);
    return { alb: mix(c, C.moss, clamp(vn(x / 9, y / 9, 4) - 0.5) * 0.8), spec: 0.04 };
  }
  if (ny < 0.7 && nz > 0.7) return { alb: mul(C.wallD, 0.5) }; // tops
  let r = ashlar(x, z, 24, 46, 5);
  const nearL = LANCETS.some((c) => Math.abs(x - c) < 24) && z > 40;
  if (!nearL && (Math.abs(x - wx(61)) < 30 || Math.abs(x - wx(419)) < 30) && z > 22 && z < 150) r = ossuary(x, z); // the ossuaries
  if (Math.abs(u) < GATE_HW + 12 && z < GATE_Z + 64 && !inPointed(u, z, GATE_HW, GATE_Z, 52)) { const k = inPointed(u, z, GATE_HW + 10, GATE_Z, 62); if (k) r = { c: mul(mix(C.stB, C.wall, 0.4), (Math.floor(Math.atan2(z - GATE_Z, u) * 4) & 1) ? 0.8 : 1.05), N: [0, 1, 0] }; } // voussoirs
  let c = r.c;
  c = mix(c, C.grime, clamp((vn(x / 9, z / 60, 2) - 0.4) * 2) * 0.6);
  if (z < 26) c = mix(c, C.moss, clamp(fbm(x / 14, z / 10, 3, 5) - 0.45) * 2 * (1 - z / 26)); // damp at the foot
  if (z < 40 && vn(x / 5, z / 12, 9) > 0.62 && h2(Math.floor(x / 30), 0, 9) < 0.4) c = mix(c, C.bloodD, 0.7); // smears where something was dragged in
  return { alb: mul(c, clamp(1.15 - z / 260)), N: r.N, spec: 0.03, gloss: 10, ao: (r.ao || 1) * (0.55 + 0.45 * clamp(z / 22)) };
}
function sideSdf(x, y, z) { // the side walls, cut low at the room's edges so their tops catch the light, and the front wall with the stairs' gap
  const side = Math.min(sdBox(x, y, z, wx(FX0 - 6), wy(RH / 2), 30, 12, wy(RH / 2) + 40, 30), sdBox(x, y, z, wx(FX1 + 6), wy(RH / 2), 30, 12, wy(RH / 2) + 40, 30));
  const front = Math.max(sdBox(x, y, z, wx(RW / 2), (wy(FY1) + wy(RH + 6)) / 2, 7, wx(RW / 2), (wy(RH + 6) - wy(FY1)) / 2, 7, 1), -(Math.abs(x - wx(CX)) - 44));
  return Math.min(side, front);
}
function sideMat(m, x, y, z, nx, ny, nz) {
  const row = Math.floor((y * SN + 3) / 12), j = (x + row * 9) % 36;
  let c = nz > 0.6 ? mul(mix(C.wallD, C.stC, 0.3 + 0.4 * h2(Math.floor((x + row * 9) / 36), row, 4)), 0.9) : mul(C.wallD, 0.6);
  if (nz > 0.6 && (j < 1.4 || (y * SN + 3) % 12 < 1.4)) c = C.mortar;
  return { alb: mix(c, C.grime, clamp(fbm(x / 9, y / 9, 3, 4) - 0.4)), spec: 0.03 };
}
const GLASS = L('#8aa8b4');
function lancetGlass() { // leaded diamond panes, glowing with the moon behind
  return {
    sdf: (x, y, z) => Math.max(Math.abs(y) - 1, inPointed(x, z, 16, 112, 22) && z > 46 ? -1 : 1),
    mat: (m, x, y, z) => {
      const lead = (x + z + 400) % 7 < 1.1 || (x - z + 400) % 7 < 1.1 || Math.abs(x) < 1.4 || Math.abs(z - 92) < 1.2;
      const k = 0.35 + 0.65 * clamp((z - 46) / 100);
      return lead ? { alb: L('#141210'), rim: 0 } : { alb: mul(GLASS, 0.3), emi: mul(GLASS, 0.11 * k), noAO: true, rim: 0 };
    },
    bounds: [-18, -2, 44, 18, 2, 136], step: 0.8, noShadow: true,
  };
}
function banner(seed) { // the Order's banner, rotted, hung on a pilaster: a dull sun on red, torn at the foot
  const tear = (x) => 30 + 10 * vn(x / 3, 0, seed) + (Math.abs(x) < 3 ? 8 : 0);
  return {
    sdf: (x, y, z) => Math.max(sdBox(x, y, z, 0, 0, 100, 14, 0.8 + Math.sin(z * 0.2 + x * 0.1) * 0.3, 70), tear(x) - z),
    mat: (m, x, y, z) => {
      let c = mix(L('#4a0c10'), L('#26070a'), clamp(fbm(x / 4, z / 4, 3, seed) * 1.6 - 0.3));
      const r = Math.hypot(x, (z - 120) * 0.9);
      if (r < 7 || (r < 11 && Math.cos(Math.atan2(z - 120, x) * 8) > 0.4)) c = mix(L('#6a5228'), L('#3a2a12'), vn(x, z, 3));
      if (Math.abs(x) > 12.5 || z > 166) c = mix(L('#6a5228'), c, 0.5);
      return { alb: mix(c, C.grime, clamp((vn(x / 8, z / 12, seed + 2) - 0.45) * 2) * 0.7), wrap: 0.4 };
    },
    bounds: [-15, -3, 26, 15, 3, 171], step: 0.6, noShadow: false,
  };
}

/** A crypt room's stage with its shell built: `holes` the vault's oculi (oculi()). Returns the stage, its portcullis
 *  and the random the props draw from. */
export function shell(holes) {
  const S = stage();
  const { add } = S;
  add('backwall', { sdf: wallSdf, mat: wallMat, bounds: [-60, YW - 42, 0, W + 60, YW + 12, 400], step: 0.8 }, [0, 0, 0]);
  add('passage', { sdf: passageSdf, mat: wallMat, bounds: [wx(CX) - GATE_HW - 26, YW - 402, 0, wx(CX) + GATE_HW + 26, YW - 38, 400], step: 0.7 }, [0, 0, 0]);
  add('sides', { sdf: sideSdf, mat: sideMat, bounds: [wx(FX0 - 20), wy(FY0) - 60, 0, wx(FX1 + 20), wy(RH + 8), 320], step: 0.8 }, [0, 0, 0]);
  // The vault and the side walls up to it: never seen (the view cuts them away), they keep the moon out but for the oculi.
  add('vault', { sdf: (x, y, z) => Math.min(Math.max(sdBox(x, y, z, W / 2, wy(RH / 2), VAULT + 20, W / 2 + 40, wy(RH / 2) + 400, 20), ...holes.map(([ox, oy, r]) => r - Math.hypot(x - ox, y - oy))),
    sdBox(x, y, z, wx(FX0 - 30), wy(RH / 2), VAULT / 2, 36, wy(RH / 2) + 400, VAULT / 2), sdBox(x, y, z, wx(FX1 + 30), wy(RH / 2), VAULT / 2, 36, wy(RH / 2) + 400, VAULT / 2)),
    mat: () => ({ alb: C.void }), bounds: [-40, -400, 0, W + 40, wy(RH) + 400, VAULT + 40], step: 0.9 }, [0, 0, 0], 0, { ghost: true });
  for (const c of LANCETS) add('glass', lancetGlass(), [c, YW - 20, 0]);
  const port = add('portcullis', portcullis(2 * GATE_HW + 6, GATE_Z + 52), [wx(CX), YW - 20, 0]);
  [wx(CX - 48), wx(CX + 48)].forEach((c, k) => add('banner', banner(5 + k), [c, YW + 10, 0]));
  return { S, port, R: mulberry32(7) };
}

// The torture room's paler pillars, so they stand out of the dark floor.
const pale = (m, k = 1.7) => ({ ...m, mat: (...a) => { const r = m.mat(...a); return { ...r, alb: mix(mul(r.alb, k), C.grime, clamp(0.3 - a[3] / 400)) }; } });
/** Pillars (with their dying torch), broken stumps (their rubble strewn on the side they broke), braziers, coffins
 *  (shut, or open on their bones) on stone biers with candles burnt down, each on its footprint. */
export function furnish({ S, R }, props) {
  const { add, light } = S;
  for (const o of props) {
    const X = wx(o.x), Y = wy(o.y - o.h / 2);
    if (o.kind === 'pillar') {
      add('pillar', pale(pillar(48, 34, VAULT + 10)), [X, Y, 0], 0);
      const [fx, fy] = pillarFace(o);
      add('sconce', sconce(0.8), [fx, fy, SCONCE_Z]);
    }
    else if (o.kind === 'stump') {
      const top = wz(o.tall - 10), f = o.flip ? -1 : 1;
      add('stump', broken(pale(pillar(48, 34, top + 30)), (x, y) => top - 10 + f * x * 0.35 + 9 * vn(x / 5, y / 5, o.x)), [X, Y, 0]);
      for (let k = 0; k < 4; k++) add('rubble', block(-5, -4, 0, 5, 4, 6 + R() * 4, (m, x, y, z) => ({ alb: stone3(x + o.x, y, z) }), 1.5), [X + f * (30 + R() * 24), Y + (R() - 0.3) * 30, 0], R() * 3);
    } else if (o.kind === 'brazier') add('brazier', brazier2(true), [X, wy(o.y - 4), 0]);
    else if (o.kind === 'coffin' || o.kind === 'coffinOpen') {
      const open = o.kind === 'coffinOpen', side = o.x < CX ? -1 : 1, cx = open ? X - side * 12 : X;
      add('bier', block(-46, -20, 0, 46, 20, 9, (m, x, y, z) => ({ alb: mul(stone3(x + o.x * 3, y, z, C.stB), 1.4) }), 1.5), [cx, Y, 0]);
      add(open ? 'coffinOpen' : 'coffin', pale(scaled(oldCoffin(3 + o.x % 7, open ? 1 + (o.y > 300 ? 1 : 0) : 0), 0.86, 1.15, 1.1), 1.5), [cx, Y, 9], (R() - 0.5) * 0.06);
      // candles burnt down on the lid, or on the bier's edge by an open one
      const cz = open ? 9 : 9 + 28, cs = [[-20, -4, 7], [-12, 3, 4], [24, -2, 9]].map(([dx, dy, h], k) => [cx + dx * (open ? -side : 1) + (open ? side * 10 : 0), Y + dy + (open ? 14 : 0), cz, h, 1.2, (h2(o.x, k, 7) - 0.5) * 0.6, 0]);
      add('candlesT', candles2(open ? cs.slice(0, 2) : cs), [0, 0, 0]);
      light({ p: [cx, Y + (open ? 14 : 0), cz + 14], c: CANDLE, I: 1.6, r0: 20, R: 240, soft: 4, pad: 3, haze: 0.012, hazeR: 3, skip: ['candlesT'] });
      if (open) add('lid', block(-42, -15, 0, 42, 15, 3, (m, x, y, z) => ({ alb: mix(mix(C.wood, C.woodD, vn(x * 0.08, y * 1.2, 4)), L('#3a3a2a'), clamp(vn(x * 0.2, y * 0.2, 9) - 0.5)) }), 1),
        [X + side * 18, Y + 8, 33], side * 0.3); // pushed aside
    }
  }
}
/** Candles in clusters on the floor ([x, y, n], room px). */
export function candles({ S }, list) {
  const out = [];
  for (const [x, y, n] of list) for (let k = 0; k < n; k++) out.push([wx(x + k * 3 + 1), wy(y) + (k % 2) * 4, 0, 4 + h2(x, k, 3) * 9, 1.2 + h2(x, k, 4) * 0.3, (h2(x, k, 5) - 0.5) * 0.8, 0]);
  S.add('candles', candles2(out), [0, 0, 0]);
}
/** The moon through the oculi, the cold fills, the lancets and the way out beyond the gate; the torches, braziers and
 *  candles of `props` and `candleList`. `fill`: the fills' strength. */
export function lights({ S }, props, candleList, fill = 1) {
  const { light } = S, FAR = 1e5;
  light({ name: 'moon', p: [wx(CX) + MOON[0] * FAR, wy(300) + MOON[1] * FAR, MOON[2] * FAR], c: MOONC, I: 0.9, r0: 1e9, R: 1e12, soft: 60, pad: 10 });
  // what the moon and the fires leave in the air: a faint cold fill over the whole crypt, so shapes read in the dark
  light({ p: [wx(CX), wy(RH / 2), 600], c: MOONC, I: 0.24 * fill, r0: 900, R: 3000, noShadow: true });
  light({ p: [wx(CX), wy(RH) + 900, 500], c: MOONC, I: 0.34 * fill, r0: 1400, R: 4000, noShadow: true }); // and on what faces us
  for (const c of LANCETS) light({ p: [c - 40, YW - 160, 210], c: MOONC, I: 5, r0: 120, R: 700, soft: 20, noEnv: true });
  light({ p: [wx(CX), YW - 320, stairUp(YW - 320) + 70], c: MOONC, I: 9, r0: 90, R: 700, soft: 12, haze: 0.01, hazeR: 14 }); // up the stairs, beyond the gate
  for (const o of props.filter((o) => o.kind === 'pillar')) { const [fx, fy] = pillarFace(o); light({ p: [fx, fy + 10, SCONCE_Z + 16], c: FIRE, I: 2.2, r0: 36, R: 360, soft: 6, pad: 6, haze: 0.015, hazeR: 5, skip: ['sconce'] }); }
  for (const o of props.filter((o) => o.kind === 'brazier')) light({ p: [wx(o.x), wy(o.y - 4), BRAZIER_TOP + 12], c: FIRE, I: 4, r0: 40, R: 420, soft: 6, pad: 8, haze: 0.02, hazeR: 7, skip: ['brazier'] });
  for (const [x, y, n] of candleList) light({ p: [wx(x + n * 1.5), wy(y) + 2, 16], c: CANDLE, I: 0.8 + 0.4 * n, r0: 20, R: 220, soft: 4, pad: 3, haze: 0.012, hazeR: 3, skip: ['candles'] });
}
export const scene = (S, env, envShadow) => ({ W, H, cam, off: 0, objects: S.objects, lights: S.lights, env, envShadow, ambient: L('#3a4450').map((v) => v * 0.05) });

/** The moon's shafts in the dusty air through `holes`: along each pixel's sight line, the air lit through an oculus,
 *  faint toward the vault, stronger near the floor. Added to the render before it is baked. */
export const shafts = (holes) => (img) => {
  const T0 = 4000;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, t = Math.min(img.depth[i], 1e5), sy = py + 0.5;
    const P = [px + 0.5, sy * SN + CS * T0 - CS * t, -sy * CS + SN * T0 - SN * t];
    if (P[2] > VAULT) continue;
    let k = 0;
    for (let s = 0; P[2] + s * SN < VAULT; s += 3) {
      const qx = P[0], qy = P[1] + s * CS, qz = P[2] + s * SN, u = (VAULT - qz) / MOON[2], hx = qx + MOON[0] * u, hy = qy + MOON[1] * u;
      for (const [ox, oy, r] of holes) { const e = r - Math.hypot(hx - ox, hy - oy); if (e > 0) k += Math.min(1, e / 8) * (0.4 + 0.6 * (1 - qz / VAULT)) * clamp(fbm(qx / 26, qz / 18 + qy / 40, 3, 7) * 2.4 - 0.7); }
    }
    if (k > 0) for (let c = 0; c < 3; c++) img.out[i * 3 + c] += MOONC[c] * k * 0.001;
  }
};
// The refuge's palette (tools/art/maquettes/hub3/complex.mjs PAL): the validated one with its cold moon ramp.
export const PAL = [...PALETTE, ...['#141a26', '#1e283a', '#2c3a52', '#2a2830', '#3e3a46', '#58525f', '#6e6680', '#9a92aa', '#3a1a16', '#5a2a20'].map((h) => hex(h).map((v) => v * 255))];
export const POST = { exposure: 3.3, vignette: 0.2, desat: 0.18, grain: 0.012, dither: 0.02 };
