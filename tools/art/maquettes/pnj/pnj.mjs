// The four met in the world (docs/histoire-proposition.md « implémenté », names provisional), for the game's sheets
// (tools/art/pnj.gen.mjs): Mirelle l'Emmurée behind the wall of her mausoleum (and, joined, sitting at the refuge), le
// Greffier kneeling at his skulls, Ilse la Fossoyeuse against a grave stele, Maître Odo bound. Built like the Order's men
// of the necropolis (../necropole/ordre.mjs): SDF parts, x = their left, y = forward (toward the camera at yaw 0),
// z = up, feet at z = 0, the hero ~100 tall.
import { sdEll, sdBox, clamp, lerp, vn3, fbm3, L, mix, mul } from '../ennemis/lib.mjs';
import { humanoid, std, S, skinTex } from '../ennemis/cast.mjs';
import { B, done, claws, glow, ironM, K, FIRE } from '../ennemis/foes.mjs';
import { add, sc, nz, clone, oel, oelN, obox, kitMat, stele } from '../necropole/kit.mjs';

const cloth = (a, b2, x, y, z, s = 1, k = 1) => ({ alb: mix(a, b2, clamp(fbm3(x * 0.3, y * 0.3, z * 0.3, 3, s) * 1.6 - 0.35) * k), wrap: 0.3, spec: 0.04, gloss: 10 });
const human = (x, y, z, seed) => ({ alb: skinTex(L('#a88a72'), L('#6e5444'), x, y, z, seed), sss: 0.4, wrap: 0.3, spec: 0.2, gloss: 30 });
const pale = (x, y, z, seed) => ({ alb: skinTex(L('#c2bca6'), L('#857f6a'), x, y, z, seed), sss: 0.5, wrap: 0.3, spec: 0.12, gloss: 22 });
const EMBER = [1.1, 0.06, 0.03];
// Ember eyes on head H (a vampire's), `look` along +y.
const eyes = (b, H, open = 1) => { for (const s of [-1, 1]) b.el(add(H, [s * 1.5, 3.9, 0.4]), [0.75, 0.5, 0.45 * open], 30); };

// Sitting on the floor, back to a wall or a stone behind (y < 0), knees drawn up: joints for humanoid().
const SIT = {
  head: [0, -1, 49], neck: [0, -2.5, 42], chest: [0, -3, 32], pelvis: [0, -1, 13],
  Sr: [-8, -3, 38], Er: [-10.5, 4, 29], Wr: [-6, 13, 25], Hr_: [-3.5, 15, 25],
  Sl: [8, -3, 38], El: [10.5, 4, 29], Wl: [6, 13, 25], Hl_: [3.5, 15, 25],
  Hr: [-4, 1, 11], Kr: [-5, 15, 22], Ar: [-4.5, 19, 4], Tr: [-4.8, 25, 1],
  Hl: [4, 1, 11], Kl: [5, 15, 21], Al: [4.5, 20, 4], Tl: [4.8, 26, 1],
};

// ======================= MIRELLE L'EMMURÉE =======================
// 'wall0', 'wall1': her mausoleum's walled door, a slit at eye height, her pale fingers hooked over its lip (curled more
// in wall1); 'eyes': her two embers in the slit, the fingers drawn in; 'broken': the wall broken from the inside, a black
// hole, bricks fallen out on the gravel. 'sit0', 'sit1': joined, at the refuge, sitting against the wall, knees drawn up,
// her ribbon in her hair (breathing). Her faded red ribbon is tied to the ring by her door.
export function mirelle(pose = 'wall0') {
  if (pose.startsWith('sit')) return mirelleSits(pose === 'sit1' ? 1 : 0);
  const b = B(), broken = pose === 'broken', SL = [0, 11.5, 64]; // the slit, on the wall's face
  b.box([0, 0, 40], [23, 11, 40], 41, 0, 0.6); // the mausoleum
  b.box([0, 0, 82], [27, 14, 2.6], 53, 0, 0.5); b.box([0, 0, 87], [21, 11, 2.4], 53, 0, 0.6); // its cap
  for (const s of [-1, 1]) b.box([s * 19, 11.4, 37], [3.6, 1.6, 37], 41, 0, 0.4); // pilasters
  b.box([0, 11.4, 75], [18.5, 1.6, 2.8], 41, 0, 0.4); // lintel
  b.box([0, 11.2, 36], [15.4, 0.9, 36], 50, 0, 0.2); // the bricked door
  b.parts.push({ f: (x, y, z) => sdBox(x, y, z, SL[0], SL[1], SL[2], 6.5, 4, 1.3, 0.2), sub: true, k: 0.2 }); // its slit
  b.parts.push({ f: (x, y, z) => sdBox(x, y, z, 0, 4, 40, 19, 6.5, 33, 0.5), sub: true, k: 0.3 }); // the dark inside
  b.tor([11.5, 12.8, 52], [0, 1, 0], 1.6, 0.35, 9); // the ring by the door, her ribbon on it
  b.rc([11.5, 12.8, 50.5], [13, 13.2, 42], 0.6, 0.35, 51); b.rc([11.5, 12.8, 50.5], [10, 13.4, 43.5], 0.55, 0.3, 51);
  if (broken) {
    b.parts.push({ f: (x, y, z) => sdEll(x, y, z, 0.5, 11, 36, 10 + 3 * (vn3(x * 0.4, 0, z * 0.3, 5) - 0.5), 4, 27 + 4 * (vn3(x * 0.2, 1, z * 0.2, 6) - 0.5)), sub: true, k: 0.4 });
    for (let i = 0; i < 9; i++) obox(b, [-10 + i * 2.6 + (i % 3), 17 + (i % 4) * 3, 1.2 + (i % 2) * 1.4], [Math.cos(i * 1.7), Math.sin(i * 1.7), 0.2], [0, 0, 1], [2.2, 1.1, 1.1], 50, 0, 0.2);
    for (const p of [[-4, 18, 0.4], [5, 23, 0.4], [1, 27, 0.3]]) b.el(p, [3, 1.6, 0.4], 52); // dark streaks: dragged out
  } else if (pose === 'eyes') eyes(b, [0, 5.8, 63.6], 1);
  else for (let f = 0; f < 4; f++) { // her fingers over the slit's lip, from the dark
    const x = -3.3 + f * 2.2, c = pose === 'wall1' ? 1 : 0, a = [x, 8, 63.6], m = [x + 0.2, 12.4, 63.1 + 0.3 * c], t = [x + 0.3, 13.3 - 0.4 * c, 61.4 - 0.6 * c];
    b.rc(a, m, 0.62, 0.5, 31, 0.3); b.rc(m, t, 0.5, 0.32, 31, 0.2); b.el(t, [0.42, 0.42, 0.55], 32);
  }
  const mat = (m, x, y, z) => {
    switch (m) {
      case 30: return glow(EMBER, 1.2);
      case 31: return pale(x, y, z, 301);
      case 32: return { alb: L('#16110c'), spec: 0.5, gloss: 50 };
      case 50: { // old bricks, mortar between, blackened low down
        const row = Math.floor(z / 3.2), u = x + (row % 2) * 2.6, mort = (z % 3.2) < 0.55 || ((u % 5.2) + 5.2) % 5.2 < 0.55;
        let c = mix(L('#4e4034'), L('#2a2018'), clamp(vn3(Math.floor(u / 5.2), row, 3, 9) * 1.4 - 0.2));
        if (mort) c = L('#5e5446');
        return { alb: mix(c, L('#120e0a'), clamp((14 - z) / 14) * 0.6), spec: 0.04, gloss: 8 };
      }
      case 51: return cloth(L('#6e1e1a'), L('#3a0c0c'), x, y, z, 303);
      case 52: return { alb: S.bloodD, spec: 0.6, gloss: 50 };
      case 53: { const r = kitMat(41, x, y, z); return { ...r, alb: mul(r.alb, 0.55) }; } // the cap, under the drip of the vault
      case 9: return ironM(x, y, z);
    }
    return kitMat(m, x, y, z) ?? kitMat(41, x, y, z);
  };
  return done(b, mat);
}
function mirelleSits(br) {
  const b = B(), J = clone(SIT);
  Object.assign(J, { head: [0, 1.5, 47 + 0.4 * br], chest: [0, -2.5, 32 + 0.5 * br] }); // her head bowed on her knees
  humanoid(J, b, { thin: 0.85, torsoM: 2, armM: 2, legM: 2 });
  b.rev(0, -0.5, 8, 40, (t) => lerp(10, 7, t), 2, 1, 0.8, { fold: [6, 0.8] }); // a torn shroud of a dress
  for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; b.rc(add(J.head, [Math.sin(a) * 3.8, -1.5 - Math.cos(a), 3.5]), add(J.head, [Math.sin(a) * 5, -3.5 - Math.cos(a) * 1.2, -11 + (i % 2) * 2]), 1.1, 0.5, 33, 0.5); } // long black hair
  b.tor(add(J.head, [0, -3.5, 1]), [0, 0.3, 1], 3.6, 0.5, 51); b.rc(add(J.head, [2, -4.6, 0.5]), add(J.head, [3, -5.5, -6]), 0.6, 0.3, 51); // the ribbon
  eyes(b, J.head, 0.6);
  claws(b, J.Hr_, [0.3, 1, -0.1], -1, 31, 32, 3.5); claws(b, J.Hl_, [-0.3, 1, -0.1], 1, 31, 32, 3.5);
  const mat = (m, x, y, z) => {
    switch (m) {
      case 2: return { ...cloth(L('#4a4440'), L('#1e1a18'), x, y, z, 311), alb: mix(cloth(L('#4a4440'), L('#1e1a18'), x, y, z, 311).alb, S.bloodD, clamp(vn3(x * 0.3, y * 0.3, z * 0.3, 312) * 2 - 1.1)) };
      case 30: return glow(EMBER, 0.9);
      case 32: return { alb: L('#16110c'), spec: 0.5, gloss: 50 };
      case 33: return { alb: mix(L('#141012'), L('#2a2426'), vn3(x * 0.6, y * 0.6, z * 0.6, 4)), wrap: 0.3, spec: 0.2, gloss: 30 };
      case 51: return cloth(L('#6e1e1a'), L('#3a0c0c'), x, y, z, 303);
    }
    return pale(x, y, z, 313);
  };
  return done(b, mat);
}

// ======================= LE GREFFIER =======================
// An old scribe of the night kneeling in his long black robe, bald, bent over a heap of skulls lit by three candles,
// scratching a name into one with the long nail of his right hand (carve0, carve1); 'look': his head raised to whoever
// speaks to him, the nail lifted.
export function greffier(pose = 'carve0') {
  const b = B(), look = pose === 'look', k = pose === 'carve1' ? 1 : 0, J = clone(std);
  Object.assign(J, {
    head: look ? [0, 9, 51] : [0, 13, 45.5], neck: look ? [0, 6.5, 44] : [0, 9.5, 40], chest: [0, 5, 33], pelvis: [0, 0, 17],
    Sr: [-8, 4, 39], Er: [-12, 11, 30], Wr: look ? [-9, 15, 31] : [-5 + k, 20, 28.5 + k], Hr_: look ? [-8, 17, 34] : [-3 + k, 23, 28 + k],
    Sl: [8, 4, 39], El: [11, 11, 29], Wl: [5, 19, 25], Hl_: [3, 22, 25.5],
    Hr: [-4, 1, 15], Kr: [-4.5, 13, 4], Ar: [-4.5, -6, 3.5], Tr: [-4.5, -11, 1],
    Hl: [4, 1, 15], Kl: [4.5, 13, 4], Al: [4.5, -6, 3.5], Tl: [4.5, -11, 1],
  });
  humanoid(J, b, { thin: 0.9, torsoM: 2, armM: 2, legM: 2 });
  oelN(b, [0, 2, 5], [1, 0, 0], [0, 1, 0], [14, 15, 6], 2, 2, 1.2, 0.3); // the robe spread on the floor
  for (const s of [-1, 1]) b.rc(add(J.head, [s * 3.8, -0.6, 0.8]), add(J.head, [s * 5.6, -2, 3.2]), 0.6, 0.15, 1, 0.4); // long ears
  eyes(b, J.head, look ? 1 : 0.5);
  claws(b, J.Hr_, look ? [0, 0.4, 1] : [0.3, 1, -0.2], -1, 1, 32, 5.5); claws(b, J.Hl_, [0, 1, 0.2], 1, 1, 32, 4);
  // the heap of skulls, the one in his hand, three candles
  const skull = (c, yaw = 0) => { const cs = Math.cos(yaw), sn = Math.sin(yaw); b.el(add(c, [0, 0, 2.2]), [2.6, 3, 2.6], 34, 0.3); b.rc(add(c, [sn * 1.4, cs * 1.4, 1.2]), add(c, [sn * 3, cs * 3, 0.2]), 1.7, 1.1, 34, 0.8);
    for (const s of [-1, 1]) b.parts.push({ f: (x, y, z) => Math.hypot(x - c[0] - s * 1.05 * cs - sn * 2.6, y - c[1] + s * 1.05 * sn - cs * 2.6, z - c[2] - 2.3) - 0.75, sub: true, k: 0.3 }); };
  for (const [x, y, z, yaw] of [[-14, 18, 0, 0.3], [-9, 22, 0, -0.2], [-12, 13, 0, 0.6], [-11, 17, 4.5, 0.1], [12, 17, 0, -0.4], [15, 12, 0, -0.8], [13, 15, 4.4, -0.3], [-4, 26, 0, 0], [6, 25, 0, 0.2]]) skull([x, y, z], yaw);
  skull(add(J.Hl_, [-1, 2, 1.5]), 0);
  const flames = [];
  for (const [x, y, h] of [[-16, 22, 7], [16, 20, 9], [9, 29, 5]]) { b.rc([x, y, 0], [x, y, h], 1.0, 0.9, 35, 0.2); b.el([x, y, h + 1.8], [0.6, 0.6, 1.4], 36); flames.push([x, y, h + 2]); }
  const mat = (m, x, y, z) => {
    switch (m) {
      case 1: return pale(x, y, z, 321);
      case 2: { const c = cloth(L('#2a2428'), L('#0e0b0d'), x, y, z, 322); c.alb = mix(c.alb, L('#3a3226'), clamp((4 - z) / 4) * 0.6); return { ...c, rim: 0.8 }; } // dust at the hem
      case 30: return glow(EMBER, 1.0);
      case 32: return { alb: L('#1a1510'), spec: 0.5, gloss: 50 };
      case 34: return { alb: mix(L('#8a7e62'), L('#4a4232'), vn3(x, y, z, 2)), spec: 0.15, gloss: 25 };
      case 35: return { alb: mix(L('#cfc4a4'), L('#8a7e60'), clamp((x + y) * 0.1 % 1)), sss: 0.6, wrap: 0.4, spec: 0.3, gloss: 40 };
      case 36: return glow(FIRE, 0.8);
    }
    return pale(x, y, z, 323);
  };
  return done(b, mat, { lights: flames.map((p) => ({ p, c: L('#ffb060'), I: 1.4, r0: 12, R: 70, pad: 3 })) });
}
// The Order's ledger, lying on a crate at the camp: thick, its leather cover, brass corners, a strap.
export function ledger() {
  const b = B(), up = nz([0, -0.25, 1]);
  obox(b, [0, 0, 8], [1, 0, 0], [0, 1, 0], [11, 8, 8], 42, 0, 0.6); // the crate
  obox(b, [0, 1, 18.5], [1, 0, 0], [0, 1, 0.25], [8, 10, 2.4], 37, 0, 0.6); // the ledger
  obox(b, [0.6, 1.4, 18.5], [1, 0, 0], [0, 1, 0.25], [7.4, 9.6, 1.6], 38, 0, 0.2); // its pages' edge
  for (const s of [-1, 1]) for (const t of [-1, 1]) obox(b, [s * 7.6, 1 + t * 9.4, 18.5 + t * 2.2], [1, 0, 0], [0, 1, 0.25], [0.9, 0.9, 2.6], 39, 0, 0.2);
  obox(b, [0, 1, 18.6], [1, 0, 0], [0, 1, 0.25], [8.6, 1, 2.8], 37, 0, 0.2); // the strap
  void up;
  const mat = (m, x, y, z) => {
    switch (m) {
      case 37: return { alb: mix(K.oxblood, L('#1a0808'), clamp(fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 371) * 1.6 - 0.3)), spec: 0.35, gloss: 30 };
      case 38: return { alb: mix(L('#b8ad90'), L('#7a6e56'), vn3(x * 2, y * 0.2, z * 3, 381)), wrap: 0.3 };
      case 39: return { alb: K.brass, spec: 0.8, gloss: 50 };
    }
    return kitMat(m, x, y, z);
  };
  return done(b, mat);
}

// ======================= ILSE LA FOSSOYEUSE =======================
// A human gravedigger asleep sitting against a grave stele, a dirty linen bound over her burnt eyes, her spade by her:
// 'sleep0', 'sleep1' (her head on her knees, breathing); 'wake': her head up, turned toward a sound; 'offer': her right
// sleeve pushed back, the wrist held out to you; 'dead': slumped on her side against the stone, her throat torn.
export function ilse(pose = 'sleep0') {
  const b = B(), J = clone(SIT), br = pose === 'sleep1' ? 1 : 0, dead = pose === 'dead';
  if (pose.startsWith('sleep')) Object.assign(J, { head: [0, 2, 46 + 0.4 * br], neck: [0, -0.5, 40.5], chest: [0, -2.5, 32 + 0.5 * br] });
  if (pose === 'wake') Object.assign(J, { head: [2, -1.5, 50], neck: [1, -2.5, 43] });
  if (pose === 'offer') Object.assign(J, { head: [1, 0, 49.5], Er: [-10, 8, 33], Wr: [-8, 18, 35], Hr_: [-7.5, 22, 35.5] });
  if (dead) Object.assign(J, { // slumped, her head fallen on her shoulder, an arm dropped on the ground
    head: [6, 1, 41], neck: [3, -1, 39], chest: [1, -2.5, 31], Er: [-11, 2, 22], Wr: [-13, 7, 8], Hr_: [-13.5, 10, 4], El: [11, 6, 28], Wl: [5, 13, 24], Hl_: [3, 15, 23],
  });
  humanoid(J, b, { thin: 0.9, torsoM: 2, armM: 2, legM: 5 });
  if (pose === 'offer') b.rc(lerpV(J.Er, J.Wr, 0.55), J.Wr, 1.25, 1.05, 1, 0.5); // the bare forearm
  b.rev(0, -1, 6, 30, (t) => lerp(12, 8.5, t), 2, 1, 0.8, { fold: [7, 1] }); // the coat's skirt on the ground
  b.tor(add(J.head, [0, 0.4, 0.8]), [0, 0.15, 1], 4.3, 1.0, 43); // the linen over her eyes
  b.rc(add(J.head, [-1, -4.4, 0.8]), add(J.head, [-2, -6.5, -4]), 0.8, 0.4, 43);
  for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; b.rc(add(J.head, [Math.sin(a) * 3.6, -1 - Math.cos(a) * 1.4, 3]), add(J.head, [Math.sin(a) * 4.2, -3 - Math.cos(a), -6]), 0.9, 0.5, 33, 0.5); } // lank hair
  stele(b, [0, -11, 0], 20, 44, -0.06); // her stone
  b.rc([17, 2, 6], [19, -2, 44], 0.9, 0.9, 42); obox(b, [16.6, 2.6, 3], [1, 0, 0], [-0.05, 0.1, 1], [3, 0.5, 4], 9, 0, 0.5); // her spade, planted
  const mat = (m, x, y, z) => {
    switch (m) {
      case 2: { const c = cloth(L('#3a3426'), L('#17140f'), x, y, z, 331); if (vn3(x * 0.2, y * 0.2, z * 0.2, 332) > 0.64) c.alb = mix(c.alb, L('#4a3e2a'), 0.6); c.alb = mix(c.alb, L('#1e170e'), clamp((6 - z) / 6) * 0.7); return c; }
      case 5: return { alb: mix(L('#2e261c'), L('#14100b'), fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 333)), wrap: 0.3 };
      case 9: return ironM(x, y, z);
      case 33: return { alb: mix(L('#3a3028'), L('#5a5044'), vn3(x * 0.6, y * 0.6, z * 0.6, 6)), wrap: 0.3, spec: 0.1 };
    }
    if (m === 1) {
      const sk = human(x, y, z, 334);
      if (dead) { sk.alb = mix(sk.alb, L('#b8b0a0'), 0.45); if (Math.hypot(x - J.neck[0], y - J.neck[1] - 1.5, z - J.neck[2] + 1) < 3.2) return { alb: S.bloodF, spec: 0.7, gloss: 60 }; }
      if (pose === 'offer' && Math.abs(x - J.Wr[0]) < 1.6 && Math.abs(y - J.Wr[1] + 1.2) < 0.5) return { alb: S.blood, spec: 0.7, gloss: 60 }; // the cut she made
      return sk;
    }
    return kitMat(m, x, y, z) ?? human(x, y, z, 335);
  };
  return done(b, mat);
}
const lerpV = (a, c, t) => [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)];

// ======================= MAÎTRE ODO =======================
// The Order's lantern-maker: stout, bald, a grey fringe, round spectacles, an Order smock under a scorched leather apron,
// his wrists bound together before him with rope. 'stake': his arms behind him round a wooden stake; 'idle': standing,
// bound; 'plead': his bound hands raised to you; 'hurt': cowering, hands over his head. `over` sets joints (the walk).
export function odo(pose = 'idle', over = {}) {
  const b = B(), J = clone(std), stake = pose === 'stake';
  Object.assign(J, { head: [0, 1.5, 88], neck: [0, 1, 80.5], chest: [0, 1.5, 69], Sr: [-9, 0, 76], Sl: [9, 0, 76] });
  Object.assign(J, stake ? { Er: [-11, -4, 60], Wr: [-3, -10, 52], Hr_: [-1, -11, 50], El: [11, -4, 60], Wl: [3, -10, 52], Hl_: [1, -11, 50] }
    : pose === 'plead' ? { head: [0, 2.5, 87], Er: [-10, 8, 66], Wr: [-2.2, 15, 74], Hr_: [-1.2, 17, 77], El: [10, 8, 66], Wl: [2.2, 15, 74], Hl_: [1.2, 17, 77] }
      : pose === 'hurt' ? { head: [0, 4, 82], neck: [0, 3, 76], chest: [0, 3, 66], Er: [-12, 8, 80], Wr: [-4, 5, 90], Hr_: [-2, 3, 92], El: [12, 8, 80], Wl: [4, 5, 90], Hl_: [2, 3, 92] }
        : { Er: [-10.5, 5, 62], Wr: [-2.4, 11, 55], Hr_: [-1.2, 13, 53.5], El: [10.5, 5, 62], Wl: [2.4, 11, 55], Hl_: [1.2, 13, 53.5] });
  Object.assign(J, typeof over === 'function' ? over(J) : over);
  humanoid(J, b, { thin: 1.25, torsoM: 2, armM: 2, legM: 5 });
  b.el(add(J.chest, [0, 4, -9]), [8.5, 7.5, 10], 2, 2.5); // his paunch
  b.rev(0, 1, 36, 58, (t) => lerp(11.5, 9.5, t), 2, 1.2, 0.9, { fold: [7, 0.6] }); // the smock's skirt, to the knee
  b.f((x, y, z) => Math.max(Math.abs(y - 14 + Math.max(0, z - 56) * 0.25 + Math.max(0, 50 - z) * 0.12) - 0.7, Math.abs(x) - 6.5 - (66 - z) * 0.06, z - 66, 34 - z), [-11, 8, 32, 11, 16, 68], 6, 0.6, { pri: 1 }); // the apron, over his paunch
  for (let i = 0; i < 9; i++) { const a = Math.PI * 0.35 + i * (Math.PI * 1.3 / 8); b.el(add(J.head, [Math.cos(a) * 4, Math.sin(a) * 4.4 - 0.5, -1]), [1.3, 1.3, 1.6], 33, 0.6); } // the fringe, round the back
  for (const s of [-1, 1]) b.tor(add(J.head, [s * 1.6, 4.5, 0.3]), [0, 1, 0], 1.25, 0.25, 9); // spectacles
  b.rc(add(J.head, [-0.4, 4.6, 0.3]), add(J.head, [0.4, 4.6, 0.3]), 0.25, 0.25, 9);
  b.el(add(J.head, [0, 3.2, -3.6]), [2.6, 2, 2], 33, 0.8); // a grey stubble at the chin
  if (!stake && pose !== 'hurt') for (let i = 0; i < 3; i++) b.tor(add(lerpV(J.Wr, J.Wl, 0.5), [0, 0, -1 + i * 1]), [1, 0, 0.2], 1.9, 0.45, 44); // the rope
  if (stake) { b.rc([0, -12, -2], [0, -12, 104], 2.6, 2.2, 42); for (let i = 0; i < 3; i++) b.tor([0, -11, 49 + i], [0, 0, 1], 3, 0.45, 44); }
  // the Order's sun on his smock
  b.f((x, y, z) => Math.max(Math.hypot(x, z - 72) - 1.8, Math.abs(y - J.chest[1] - 5) - 0.5), [-3, J.chest[1] + 3, 69, 3, J.chest[1] + 7, 75], 45, 0.2, { pri: 2 });
  const mat = (m, x, y, z) => {
    switch (m) {
      case 2: { const c = cloth(S.tabard, S.tabardD, x, y, z, 341); c.alb = mix(c.alb, L('#2a2016'), clamp((40 - z) / 12) * 0.5); return { ...c, rim: 0.8 }; }
      case 5: return { alb: mix(L('#2e261c'), L('#14100b'), fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 342)), wrap: 0.3 };
      case 6: { let c = mix(L('#4a3220'), L('#22160c'), fbm3(x * 0.4, y * 0.4, z * 0.4, 3, 343)); if (vn3(x * 0.5, y * 0.5, z * 0.5, 344) > 0.68) c = mul(c, 0.45); return { alb: c, spec: 0.35, gloss: 35 }; } // scorched
      case 9: return { alb: L('#3a3430'), spec: 0.9, gloss: 60 };
      case 33: return { alb: mix(L('#8a8478'), L('#5a564e'), vn3(x * 0.8, y * 0.8, z * 0.8, 7)), wrap: 0.3 };
      case 44: return { alb: mix(L('#6a5c44'), L('#3e3428'), vn3(x * 2, y * 2, z * 2, 8)), wrap: 0.4 };
      case 45: return { alb: S.sun, spec: 0.8, gloss: 40 };
      case 42: return kitMat(42, x, y, z);
    }
    return human(x, y, z, 345);
  };
  return done(b, mat);
}
