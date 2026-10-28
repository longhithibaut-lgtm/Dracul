// The Order's Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur, Inquisiteur, Bourreau and arbalétrier, and the
// ghouls' Amas, for the « grand pixel » rooms (docs/decisions.md): the validated enemy sheets' own 3D models (tools/art/maquettes/ennemis/foes.mjs,
// docs/maquettes/ennemis-planche-1.png and -2.png) posed per frame and rendered with their lights (the cold rim from
// behind, the warm fill, the vampire's lantern off-frame, their own pilot light, monstrance, bell rim and censer) and its post (snapped onto its palette, tarnished gold included). One model unit is one pixel at
// 960x540, like the grand hero (tools/art/grand-hero.gen.mjs): the game draws the sheets at half scale on the x2 view.
// Five views (facing right, down-right, down, up-right, up: the game mirrors them for the left), each: idle (breathing,
// the pilot light or the monstrance flickering), the walk (a stride the game turns by the distance walked), the
// tell (ignite / pray / the hound flattened / the scourge cocked / the mallet raised / the censer whirling / the Amas
// gathering up, arms rising / the axe raised / the crossbow raised, shouldered, the bolt glinting), the attack (the hound's leap, the lash, the bell struck, the censer's
// sweep, the Amas' slam, the axe sunk in the floor), the jet of fire (two flickers; the body and the jet apart, so the
// game can turn the jet to its real aim), the Inquisiteur's parry, the Bourreau wrenching his axe free, the recoil of a
// hit, kneeling (the idle sunk to the knees, cut at the floor); one bloodied corpse.
// Writes src/<id>.png for each (purifier, priest, hound, penitent, ringer, inquisitor, amas, bourreau, crossbow) and
// src/foes.data.ts.
// The necropolis' crow (a flock's, src/crows.ts), Enterré and Gavé: tools/art/maquettes/necropole/creatures.mjs.
// Usage: node tools/art/foes.gen.mjs (~30 s on 4 cores); ONLY=priest renders one of them to
// shots/priest-preview.png (x2, on grey) instead, to try a pose; ONLY=crow,gave WRITE=1 renders those into src/ (their
// sheets and their rows of foes.data.ts), the others left as they are.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { camera, render, post, haze, project, L, mix, vn3 } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { purificateur, pretre, chien, penitent, sonneur, inquisiteur, amas, bourreau } from './maquettes/ennemis/foes.mjs';
import { place } from './maquettes/ennemis/fx.mjs';
import { std, crossbowman } from './maquettes/ennemis/cast.mjs';
import { corneille, enterre, gave, placed0 } from './maquettes/necropole/creatures.mjs';
import { lyingCorpse } from './maquettes/necropole/kit.mjs';

const cam = camera(38 * Math.PI / 180);
const VIEWS = { side: -Math.PI / 2, dside: -Math.PI / 4, down: 0, uside: -3 * Math.PI / 4, up: Math.PI }; // yaw: the model looks down +y
const KNEEL = 18; // sheet px the kneeling frame sinks
const add = (a, b) => a.map((v, i) => v + b[i]);

// Two-bone IK (as grand-hero.gen.mjs): the knee from hip H toward ankle A, bent forward.
function knee(H, A, L1 = 22.3, L2 = 23.2) {
  let d = A.map((v, i) => v - H[i]), n = Math.hypot(...d);
  if (n > L1 + L2 - 0.3) { d = d.map((v) => v * (L1 + L2 - 0.3) / n); n = L1 + L2 - 0.3; }
  const u = d.map((v) => v / n), a = (L1 * L1 - L2 * L2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pole = [0, 1, 0], pu = pole.map((v, i) => v - u[i] * u[1]), pl = Math.hypot(...pu);
  return H.map((v, i) => v + u[i] * a + (pu[i] / pl) * h);
}
// The walk's legs, frame k of n: each ankle swings STEP ahead and behind, lifted on its way forward. A foot is planted
// half the cycle while the body passes over it, so a cycle walks 4 STEP model units: 2 STEP room px (a foe's STRIDE).
const STEP = 9;
// Another build: its hips `H` (Hr, Hl), thigh and shin `L`, feet `w` apart from the middle, steps `step` long.
function legs(k, n, { H = std, L = [22.3, 23.2], w = 4, step = STEP } = {}) {
  const o = {};
  for (const [s, x, ph] of [['r', -1, 0], ['l', 1, Math.PI]]) {
    const a = (2 * Math.PI * k) / n + ph, f = Math.cos(a), lift = 5 * Math.max(0, -Math.sin(a)); // lifted while f grows: forward
    const A = [x * w, -0.5 + step * f, 4 + lift];
    Object.assign(o, { [`K${s}`]: knee(H[`H${s}`], A, ...L), [`A${s}`]: A, [`T${s}`]: [x * (w + 0.4), A[1] + 6.4, Math.max(1, A[2] - 3 + lift * 0.4)] });
  }
  return o;
}
// The upper body: breathing lifts it, a recoil tips it back about the hips (a < 0), the head thrown further.
const UPPER = ['head', 'neck', 'chest', 'Sr', 'Sl', 'Er', 'El', 'Wr', 'Wl', 'Hr_', 'Hl_'];
const breathe = (J, k) => Object.fromEntries(UPPER.map((n) => [n, add(J[n], [n === 'head' ? 0.3 * k : 0, 0, (n === 'chest' ? 0.5 : 0.8) * k])]));
function lean(J, a) {
  const o = Object.fromEntries(UPPER.map((n) => {
    const y = J[n][1] - J.pelvis[1], z = J[n][2] - J.pelvis[2];
    return [n, [J[n][0], J.pelvis[1] + y * Math.cos(a) + z * Math.sin(a), J.pelvis[2] + z * Math.cos(a) - y * Math.sin(a)]];
  }));
  o.head = add(o.head, [0.8, -2.2, -0.6]);
  return o;
}
// A robe or coat swinging with the stride: shears what hangs below the waist along the model's y, the feet kept planted.
function sway(m, d) {
  const k = (z) => { const t = Math.min(1, Math.max(0, (z - 4) / 10)); return t * t * (3 - 2 * t) * Math.max(0, (62 - z) / 52) ** 1.5; };
  const [x0, y0, z0, x1, y1, z1] = m.bounds;
  return { ...m, sdf: (x, y, z) => m.sdf(x, y - d * k(z), z) * 0.9, mat: (n, x, y, z, ...r) => m.mat(n, x, y - d * k(z), z, ...r), bounds: [x0, y0 - Math.abs(d), z0, x1, y1 + Math.abs(d), z1] };
}

// The card's lance points up and across; the game's jet runs along the floor cone it burns: level and straight ahead.
const AIM = { Er: [-9, 9, 58], Wr: [-1, 18.5, 58.5], Hr_: [0, 21, 58.8] };
const BREATH = [0, 0.5, 1, 0.5], FLAME = [1, 1.4, 0.8, 1.2], GLOW = [1, 1.15, 1.3, 1.1];
// The Sonneur's short fat legs; the Inquisiteur's, a twentieth taller than the standard (his model's).
const RINGER = { H: { Hr: [-5.5, 0, 42], Hl: [5.5, 0, 42] }, L: [20.3, 18.7], w: 6.5, step: 7 };
const INQ = { H: { Hr: [-3.6, 0, 51.45], Hl: [3.6, 0, 51.45] }, L: [23.4, 24.4] };
const HEADSMAN = { H: { Hr: [-8, 0, 74], Hl: [8, 0, 74] }, L: [34.2, 33.2], w: 10, step: 12 }; // the Bourreau's, half as big again

// Each foe: its sheet cell (FW x FH, soles on row SOLE, centred); its walk (WALK frames a cycle of 4 STEP model units);
// its frames: [name,
// () => model, { bob: model z, layer: 'body' (the jet left out) or 'jet' (the jet alone, pivoting on the lance) }].
const FOES = {
  purifier: {
    FW: 230, FH: 176, SOLE: 140, WALK: 6, STEP,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => purificateur('idle', (J) => ({ ...breathe(J, b), flame: FLAME[k] }))]),
      ...[0, 1, 2, 3, 4, 5].map((k) => [`walk${k}`, () => sway(purificateur('idle', legs(k, 6)), -1.6 * Math.sin((2 * Math.PI * k) / 6)), { bob: -0.6 * Math.abs(Math.cos((2 * Math.PI * k) / 6)) }]),
      ['ignite', () => purificateur('tele', AIM)],
      ['fire0', () => purificateur('atk', AIM), { layer: 'body' }], ['fire1', () => purificateur('atk1', AIM), { layer: 'body' }],
      ['jet0', () => purificateur('atk', AIM), { layer: 'jet' }], ['jet1', () => purificateur('atk1', AIM), { layer: 'jet' }],
      ['hurt', () => purificateur('idle', (J) => lean(J, -0.2))],
    ],
    // Face down, the tanks on his back, arms flung out.
    corpse: () => lying(purificateur('idle', { Er: [-17, 4, 80], Wr: [-24, 6, 90], Hr_: [-26, 8, 94], El: [17, 2, 70], Wl: [25, 6, 64], Hl_: [28, 8, 63] }), true),
  },
  priest: {
    FW: 170, FH: 156, SOLE: 140, WALK: 4, STEP,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => pretre('idle', (J) => ({ ...breathe(J, b), glow: GLOW[k] }))]),
      // His toes show at the hem in turn, the robe swinging with each step.
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => sway(pretre('idle', legs(k, 4)), -2.2 * Math.sin((Math.PI * k) / 2)), { bob: -0.8 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['pray', () => ({ ...pretre('atk'), vfx: null })],
      ['hurt', () => pretre('idle', (J) => lean(J, -0.16))],
    ],
    // On his back, his arms fallen open at his sides, the staff fallen by him, the gilded mask turned up.
    corpse: () => lying(pretre('idle', { Er: [-12, 1, 62], Wr: [-17, 3, 48], Hr_: [-18, 4, 43], El: [12, 1, 62], Wl: [17, 3, 48], Hl_: [18, 4, 43] }), false),
  },
  // A trot (diagonal pairs), the body bobbing at each footfall; the tell is the sheet's attack pose (flattened, muzzle
  // open), the leap stretched out in the air.
  hound: {
    FW: 130, FH: 104, SOLE: 80, WALK: 6, STEP: 7,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => chien('idle', { breath: b })]),
      ...[0, 1, 2, 3, 4, 5].map((k) => [`walk${k}`, () => chien('idle', { gait: (2 * Math.PI * k) / 6 }), { bob: -0.8 * Math.abs(Math.cos((2 * Math.PI * k) / 6)) }]),
      ['tele', () => chien('atk')], ['leap', () => chien('leap')],
      ['hurt', () => chien('idle', { recoil: 1 })],
    ],
    corpse: () => onSide(chien('idle')), // on its side, legs out
  },
  // He drags his cross; the tell: the nailed scourge cocked high behind him; the lash, cords down to the floor ahead.
  penitent: {
    FW: 180, FH: 166, SOLE: 134, WALK: 4, STEP,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => penitent('idle', 2, (J) => breathe(J, b))]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => sway(penitent('idle', 2, legs(k, 4)), -1.4 * Math.sin((Math.PI * k) / 2)), { bob: -0.8 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['tele', () => penitent('tele')], ['atk', () => penitent('atk')],
      ['hurt', () => penitent('idle', 2, (J) => lean(J, -0.2))],
    ],
    corpse: () => lying(penitent('idle'), true), // face down under his cross
  },
  // Squat and fat under his yoke, short heavy steps; the tell: the mallet raised, the bell's rim lit; the strike: the
  // mallet on the rim, the bell ringing out.
  ringer: {
    FW: 200, FH: 190, SOLE: 150, WALK: 4, STEP: 7,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => sonneur('idle', (J) => breathe(J, b))]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => sway(sonneur('idle', legs(k, 4, RINGER)), -1.2 * Math.sin((Math.PI * k) / 2)), { bob: -1 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['tele', () => sonneur('atk')], ['atk', () => sonneur('strike')],
      ['hurt', () => sonneur('idle', (J) => lean(J, -0.18))],
    ],
    corpse: () => lying(sonneur('idle'), true), // face down, the bell on his back
  },
  // The tell: the censer whirled overhead (four turns of it); the sweep round his front in three, its trail of embers;
  // the parry: his forearm up before his face.
  inquisitor: {
    FW: 230, FH: 180, SOLE: 140, WALK: 4, STEP,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => inquisiteur('idle', (J) => ({ ...breathe(J, b), glow: GLOW[k] }))]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => sway(inquisiteur('idle', legs(k, 4, INQ)), -1.6 * Math.sin((Math.PI * k) / 2)), { bob: -0.8 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ...[0, 1, 2, 3].map((k) => [`whirl${k}`, () => inquisiteur('atk', { whirl: (Math.PI * k) / 2, glow: 1.4 })]),
      ...[0, 1, 2].map((k) => [`sweep${k}`, () => inquisiteur('sweep', { sweep: 0.2 + 0.35 * k })]),
      ['parry', () => inquisiteur('parry')],
      ['hurt', () => inquisiteur('idle', (J) => lean(J, -0.16))],
    ],
    // On his back, arms fallen open, the censer by his hand.
    corpse: () => lying(inquisiteur('idle', { Er: [-12, 1, 64], Wr: [-17, 3, 50], Hr_: [-18, 4, 45], El: [12, 1, 64], Wl: [17, 3, 50], Hl_: [18, 4, 45] }), false),
  },
  // The mass heaves as it breathes; it crawls on its hands and stumps, each stepping in turn; the tell: it gathers
  // itself up as every arm rises (two frames); the slam: sunk and spread, the arms slapped flat round it.
  amas: {
    FW: 176, FH: 136, SOLE: 81, WALK: 6, STEP: 7, rim: 3, exposure: 2.8, // low, pale flesh lit from above: it would burn out
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => amas('idle', 13, { sx: 1 + 0.012 * b, sz: 1 + 0.035 * b })]),
      ...[0, 1, 2, 3, 4, 5].map((k) => [`walk${k}`, () => amas('idle', 13, { gait: (2 * Math.PI * k) / 6 }), { bob: -1 * Math.abs(Math.cos((2 * Math.PI * k) / 6)) }]),
      ['tele0', () => amas('idle', 13, { lift: 0.5, sx: 0.95, sz: 1.04 })], ['tele1', () => amas('idle', 13, { lift: 1, sx: 0.9, sz: 1.08 })],
      ['atk', () => amas('idle', 13, { slam: true, sx: 1.1, sz: 0.78 })],
      ['hurt', () => amas('idle', 13, { lift: 0.3, sx: 1.04, sz: 0.9 })],
    ],
    // Collapsed for good, sunk and spread, soaked.
    corpse: () => { const m = amas('idle', 13, { slam: true, sx: 1.1, sz: 0.78 }), [x0, y0, , x1, y1, z1] = m.bounds; return fallen(m, (X, Y, Z) => [X, Y, Z / FLAT], [x0, y0, 0, x1, y1, z1 * FLAT], [0, 0, 10]); },
  },
  // Huge and slow, heavy steps; the tell: the axe raised overhead; the blow: bent over it, the blade sunk in the floor
  // ahead; then he wrenches it free (two frames, tugging back on the haft).
  bourreau: {
    FW: 180, FH: 242, SOLE: 177, WALK: 4, STEP: 12,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => bourreau('idle', (J) => breathe(J, 1.5 * b))]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => bourreau('idle', legs(k, 4, HEADSMAN)), { bob: -1.2 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['tele', () => bourreau('atk')], ['atk', () => bourreau('chop')],
      ['pull0', () => bourreau('chop', (J) => lean(J, -0.07))], ['pull1', () => bourreau('chop', (J) => lean(J, -0.15))],
      ['hurt', () => bourreau('idle', (J) => lean(J, -0.12))],
    ],
    // On his back, arms fallen open, the axe by his hand, the reliquary still chained at his hip.
    corpse: () => lying(bourreau('idle', { Er: [-18, 1.5, 93], Wr: [-25, 4, 72], Hr_: [-27, 6, 65], El: [18, 1.5, 93], Wl: [25, 4, 72], Hl_: [27, 6, 65] }), false),
  },
  // The crossbowman (the enemy sheets' own, tools/art/maquettes/ennemis/cast.mjs): the crossbow held low across him; it
  // comes up (raise), is shouldered (aim), the bolt's head glints once the aim is locked (lock); the shot, the string
  // slapped forward, kicks him back a little.
  crossbow: {
    FW: 160, FH: 164, SOLE: 128, WALK: 4, STEP,
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => xbow('idle', (J) => breathe(J, b))]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => xbow('idle', legs(k, 4)), { bob: -0.8 * Math.abs(Math.cos((Math.PI * k) / 2)) }]),
      ['raise', () => xbow('raise')], ['aim', () => xbow('aim')], ['lock', () => xbow('lock')],
      ['shot', () => xbow('shot', (J) => lean(J, -0.1))],
      ['hurt', () => xbow('idle', (J) => lean(J, -0.2))],
    ],
    // On his back, arms fallen open, the crossbow by his side.
    corpse: () => lying(xbow('idle', { Er: [-12, 1, 64], Wr: [-17, 3, 50], Hr_: [-18, 4, 45], El: [12, 1, 64], Wl: [17, 3, 50], Hl_: [18, 4, 45] }), false),
  },
  // The necropolis' own (tools/art/maquettes/necropole/creatures.mjs, docs/maquettes/necropole-ennemis-planche-1.png).
  // One carrion crow (the game draws a flock of them, src/crows.ts): pecking on the ground (idle), a wingbeat (walk),
  // hanging in the air shrieking, talons out (tele), the stoop at the hero (dive), tumbling (hurt). Never killed: its
  // « corpse » is the carrion a flock feeds on, laid across.
  crow: {
    FW: 120, FH: 72, SOLE: 54, WALK: 4, STEP: 4,
    frames: [
      ...[['peck', {}], ['perch', {}], ['peck', { pitch: -0.75 }], ['perch', { pitch: 0.2 }]].map(([m, o], k) => [`idle${k}`, () => corneille(m, o)]),
      ...[1.0, 0.35, -0.4, 0.35].map((w, k) => [`walk${k}`, () => corneille('fly', { wingUp: w })]),
      ['tele', () => corneille('fly', { pitch: 0.95, wingUp: 1.2, talons: true, z: 14 })],
      ['dive', () => corneille('fly', { pitch: -0.55, wingUp: 0.55, sweep: 0.9, talons: true })],
      ['hurt', () => corneille('fly', { pitch: 0.6, wing: [1.3, -0.6] })],
    ],
    corpse: () => ({ ...placed0(lyingCorpse(4, true), [0, 8, 0], Math.PI / 2 - 0.25), lights: [] }),
  },
  // L'Enterré, one with his grave (mound and stele: never turns, the game shows him from the front): under the earth,
  // the fingers clawing at it (idle); the mound cracks, a hand claws up out of it (tele0), the brow (tele1); torn up to
  // the waist, arms flung low for the ankle (grab0), dragging (grab1); thrown back (hurt); half under again (sink);
  // dead, slumped forward out of it.
  enterre: {
    FW: 110, FH: 96, SOLE: 62, WALK: 1, STEP, views: ['down'], rim: 2.5, exposure: 4.2, // dark earth: its back light would turn it to slate
    frames: [
      ...[0, 0.35, 1, 0.6].map((curl, k) => [`idle${k}`, () => enterre('idle', { solid: true, curl })]),
      ['walk0', () => enterre('idle', { solid: true })],
      ['tele0', () => enterre('crack', { solid: true, open: 0.45 })], ['tele1', () => enterre('crack', { solid: true, open: 1 })],
      ['grab0', () => enterre('grab', { solid: true })], ['grab1', () => enterre('grab', { solid: true, pull: 1 })],
      ['sink', () => enterre('sink', { solid: true })],
      ['hurt', () => enterre('grab', { solid: true, lean: 0.7 })],
    ],
    corpse: () => enterre('dead', { solid: true }), // (fallen()'s blood would soak his whole mound)
  },
  // Le Gavé: squatting, the belly heaving (idle); a waddle on its legs and knuckles (walk); its head in a meal, then up
  // tearing a strip off it (eat0, eat1); the slam: up on its legs, arms raised high (tele), then belly first on the floor
  // (atk); the bile: reared back, the throat bulging (gorge), then the head thrust out, the bile pouring (spew0, spew1).
  gave: {
    FW: 180, FH: 132, SOLE: 94, WALK: 4, STEP: 7, rim: 5, exposure: 3.1, // pale flesh lit from behind: it would burn out
    frames: [
      ...BREATH.map((b, k) => [`idle${k}`, () => gave('idle', { solid: true, breath: 2 * b })]),
      ...[0, 1, 2, 3].map((k) => [`walk${k}`, () => gave('walk', { solid: true, gait: (Math.PI * k) / 2 }), { bob: -1 * Math.abs(Math.sin((Math.PI * k) / 2)) }]),
      ['eat0', () => gave('eat', { solid: true, k: 0 })], ['eat1', () => gave('eat', { solid: true, k: 1 })],
      ['tele', () => gave('rear', { solid: true })], ['atk', () => gave('flop', { solid: true })],
      ['gorge', () => gave('gorge', { solid: true })], ['spew0', () => gave('spew', { solid: true, k: 0 })], ['spew1', () => gave('spew', { solid: true, k: 1 })],
      ['hurt', () => gave('hurt', { solid: true })],
    ],
    corpse: () => { const m = gave('dead', { solid: true }), [x0, y0, , x1, y1, z1] = m.bounds; return fallen(m, (X, Y, Z) => [X, Y, Z / FLAT], [x0, y0, 0, x1, y1, z1 * FLAT], [4, 8, 10]); },
  },
};
// The crossbowman's model has no light of its own to cast (his lantern glows, on his back).
const xbow = (...a) => ({ ...crossbowman(...a), lights: [] });
// Lying on the floor, head to the right (model up <- world x), on his back (model forward <- up) or face down, slumped
// (cloth and limbs settle: heights x FLAT); what would sink under the floor is cut off. Blood soaks his chest (or back)
// and his side on the floor.
const GORE = [L('#5a0a10'), L('#7a1016')], FLAT = 0.7;
function lying(m, prone) {
  const [x0, y0, z0, x1, y1, z1] = m.bounds, c = (z0 + z1) / 2, lift = prone ? 9 : -y0 - 2;
  return fallen(m, (X, Y, Z) => [Y, prone ? lift - Z / FLAT : Z / FLAT - lift, X + c], [z0 - c, x0, 0, z1 - c, x1, (prone ? lift - y0 : y1 + lift) * FLAT], [0, prone ? -8 : 8, 62]);
}
// A beast on its right side, head to the right, its legs toward the camera; blood at its throat and belly.
function onSide(m) {
  const [x0, y0, z0, x1, y1, z1] = m.bounds, zc = 30;
  return fallen(m, (X, Y, Z) => [Z / FLAT + x0 + 2, X, zc - Y], [y0, zc - z1, 0, y1, zc - z0, (x1 - x0 - 2) * FLAT], [0, 16, 26]);
}
// The model m laid down: `to` takes a floor point to the model's, `bounds` holds it; blood soaks round model point `gore`.
function fallen(m, to, bounds, gore) {
  const blood = (x, y, z) => Math.min(1, Math.max(0, 1.8 - Math.hypot(x * 0.8, (y - gore[1]) * 0.5, z - gore[2]) / 14 + (vn3(x * 0.4, y * 0.4, z * 0.4, 5) - 0.5) * 1.2));
  return {
    sdf: (X, Y, Z) => Math.max(m.sdf(...to(X, Y, Z)) * FLAT, -Z), mat: (k, X, Y, Z) => {
      const p = to(X, Y, Z), r = m.mat(k, ...p), b = Math.max(blood(...p), Z < 2.5 ? 0.75 : 0);
      return r.emi ? r : { ...r, alb: mix(r.alb.map((v) => v * 0.8), b > 0.6 ? GORE[1] : GORE[0], Math.min(1, b)), spec: (r.spec ?? 0) * (1 - b) + b * 0.15, gloss: 30 };
    },
    bounds, step: m.step, lights: [],
  };
}

const ONLY = process.env.ONLY?.split(','), WRITE = !!process.env.WRITE; // WRITE: the ONLY ones into the game's files, the others' kept
const JOBS = Object.entries(FOES).filter(([id]) => !ONLY || ONLY.includes(id)).flatMap(([id, f]) => [
  ...(f.views ?? Object.keys(VIEWS)).flatMap((view) => f.frames.map(([name], n) => ({ id, view, name, n }))),
  { id, view: 'side', name: 'corpse', n: -1 },
]);

// The enemy sheets' lighting, the foe standing at the cell's centre turned to `yaw`.
function scene(job) {
  const F = FOES[job.id], CX = F.FW / 2, dead = job.name === 'corpse', still = !!F.views, yaw = dead && !still ? 0.25 : VIEWS[still ? F.views[0] : job.view]; // one that never turns dies where it is
  const [, make, { bob = 0, layer } = {}] = dead ? [] : F.frames[job.n];
  const m = dead ? F.corpse() : make();
  const P = { x: CX, y: dead && !still ? -12 : 0, yaw }, objects = [];
  if (layer !== 'jet') objects.push({ name: 'foe', pos: [P.x, P.y, bob], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 1, step: m.step });
  if (m.vfx && layer !== 'body') objects.push({ name: 'vfx', pos: [P.x, P.y, bob], yaw, sdf: m.vfx.sdf, mat: m.vfx.mat, bounds: m.vfx.bounds, id: 2, step: m.vfx.step, noShadow: true, noSelfAO: true });
  const lights = [
    { p: [P.x + 30, P.y - 60, 75], c: L('#8098a2'), I: dead ? 3 : F.rim ?? 9, r0: 90, R: 260, soft: 10, only: ['foe'] }, // (it would lay a cold sheen all over a body lying down, or a low one)
    { p: [P.x - 70, P.y + 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
    { p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 }, // the vampire's lantern, off-frame
    // its own (the priest's light on the holy zone falls on the floor, which the game draws)
    ...m.lights.filter((l) => !l.noShadow).map((l) => ({ soft: 5, R: 200, ...l, p: add(place(P, l.p), [0, 0, bob]) })),
  ];
  // Where its own light is (the jet: where it leaves the lance, its pivot in the game).
  const at = layer === 'jet' ? m.tip : m.lights[0]?.p, own = at ? project(cam, ...add(place(P, at), [0, 0, bob]), -F.SOLE) : [CX, 0];
  return { sc: { W: F.FW, H: F.FH, cam, off: -F.SOLE, objects, lights, env: null, ambient: L('#1a1c1e').map((v) => v * 0.6) }, lamp: own };
}

if (isMainThread) {
  const t0 = Date.now(), N = Math.min(availableParallelism(), 8);
  const done = await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { w, N } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const all = done.flat();
  const data = {};
  for (const [id, F] of Object.entries(FOES)) {
    if (ONLY && !ONLY.includes(id)) continue;
    // Cells: per view its frames then the kneel; the corpse last.
    const cells = [], frames = {};
    for (const view of F.views ?? Object.keys(VIEWS)) {
      for (const [name] of F.frames) cells.push([`${view}-${name}`, all.find((j) => j.id === id && j.view === view && j.name === name)]);
      const idle = cells.find(([n]) => n === `${view}-idle0`)[1], px = new Uint8ClampedArray(idle.px.length);
      for (let y = 0; y + KNEEL <= F.SOLE; y++) px.set(idle.px.subarray(y * F.FW * 4, (y + 1) * F.FW * 4), (y + KNEEL) * F.FW * 4);
      cells.push([`${view}-kneel`, { px, lamp: [idle.lamp[0], idle.lamp[1] + KNEEL] }]);
    }
    cells.push(['corpse', all.find((j) => j.id === id && j.name === 'corpse')]);
    const COLS = Math.ceil(Math.sqrt(cells.length * F.FH / F.FW)), W = COLS * F.FW, H = Math.ceil(cells.length / COLS) * F.FH, rgba = new Uint8ClampedArray(W * H * 4);
    cells.forEach(([name, c], i) => {
      const ox = (i % COLS) * F.FW, oy = Math.floor(i / COLS) * F.FH;
      for (let y = 0; y < F.FH; y++) rgba.set(c.px.subarray(y * F.FW * 4, (y + 1) * F.FW * 4), ((oy + y) * W + ox) * 4);
      frames[name] = { cell: i, lamp: c.lamp.map((v) => Math.round(v)) };
    });
    if (ONLY && !WRITE) {
      for (let p = 0; p < W * H; p++) if (!rgba[p * 4 + 3]) rgba.set([70, 70, 74, 255], p * 4);
      writePNG(`shots/${id}-preview.png`, rgba, W, H, 2);
      continue;
    }
    writePNG(`src/${id}.png`, rgba, W, H);
    data[id] = { FW: F.FW, FH: F.FH, COLS, SOLE: F.SOLE, WALK: F.WALK, STRIDE: 2 * F.STEP, FRAMES: frames };
    console.log(`src/${id}.png ${W}x${H}, ${cells.length} cells`);
  }
  if (WRITE) Object.assign(data, { ...JSON.parse(readFileSync('src/foes.data.ts', 'utf8').match(/SHEETS: .* = (\{.*\});\n/)[1]), ...data });
  if (!ONLY || WRITE) writeFileSync('src/foes.data.ts', `// Generated by tools/art/foes.gen.mjs: edit the models there (and in tools/art/maquettes/ennemis/foes.mjs, ../necropole/creatures.mjs), not this table.
// The foes' sheets (src/<kind>.png): FW x FH cells, COLS per row, soles on row SOLE, centred; WALK frames a walk cycle, which covers STRIDE room px of floor (screen rows / ${cam.s.toFixed(4)}); each frame's
// cell and where its own light is (sheet px: the pilot light, the monstrance; for the jet, its pivot on the lance).
export const FLOOR = ${cam.s.toFixed(4)}; // how much the sheets' floor is foreshortened up the screen
export type Sheet = { FW: number; FH: number; COLS: number; SOLE: number; WALK: number; STRIDE: number; FRAMES: Record<string, { cell: number; lamp: [number, number] }> };
export const SHEETS: Record<${Object.keys(data).map((k) => `'${k}'`).join(' | ')}, Sheet> = ${JSON.stringify(data)};
`);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const { w, N } = workerData, out = [];
  for (let i = w; i < JOBS.length; i += N) {
    const job = JOBS[i], { sc, lamp } = scene(job), img = render(sc);
    haze(img, sc);
    const px = post(img, { exposure: FOES[job.id].exposure ?? 3.6, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
    for (let p = 0; p < sc.W * sc.H; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
    out.push({ ...job, px, lamp });
  }
  parentPort.postMessage(out);
}
