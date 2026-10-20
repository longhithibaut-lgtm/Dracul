// Prop/pose check sheet: flat floor, warm key + cold rim, two rows.
import { camera, post, writePNG, L, fbm, mix } from './lib.mjs';
import { vesna, severin, magda, lucian } from './chiefs3.mjs';
import * as P from './props3.mjs';
import { stall, mirror } from '../hub/props.mjs';
const cam = camera(38 * Math.PI / 180);
const W = 1000, H = 380, off = -150;
const objects = [], lights = [];
const add = (m, x, y, yaw = 0, z = 0) => objects.push({ name: 'o' + objects.length, pos: [x, y, z], yaw, sdf: m.sdf, mat: m.mat, bounds: m.bounds, step: m.step || 0.6, noShadow: m.noShadow, id: objects.length });
// row 1 (y=0): chiefs at their stations
add(stall(), 80, 40); add(vesna('count'), 80, 40 - 36, 0);
add(magda('grind'), 230, 0, 0); add(P.grindstone(), 230 + 16, 26, 0);
add(severin('mirror'), 380, 10, -Math.PI / 2); add(mirror(), 380 + 70, 10, Math.PI / 2);
add(P.writingDesk(2), 560, 40); add(lucian('write'), 560, 40 - 26, 0);
add(P.trainingDummy(), 700, 20); add(P.weaponRack(), 760, -10);
add(P.lidUpright(), 860, 0); add(P.chiefCoffin('loup', 3, false), 940, 30);
// row 2 (y=240)
add(P.doorFrame(80, 170, 'sealed', 'rat'), 60, 260, Math.PI); add(P.archSeal(80, 190), 170, 250);
add(P.pew(110, 0), 290, 260); add(P.pew(110, 2, 3), 290, 330); add(P.statue(1), 420, 250); add(P.offering(1), 530, 280);
add(P.armoire(true), 650, 240); add(P.coatRail(['hero', 'rat', 'brume', 'loup', 'chauve-souris']), 780, 260); add(P.jarCrate(), 880, 270); add(P.trophyPike(), 950, 250);
for (const x of [80, 240, 400, 560, 720, 880]) for (const y of [-20, 230]) { lights.push({ p: [x - 60, y + 90, 120], c: L('#d8a060'), I: 3.5, r0: 90, R: 400, soft: 8 }); lights.push({ p: [x + 40, y - 120, 150], c: L('#8098a2'), I: 3, r0: 90, R: 400, soft: 8 }); }
const env = (ox, oy, oz, vx, vy, vz) => { const t = -oz / vz; const x = ox + vx * t, y = oy + vy * t; return { t, P: [x, y, 0], N: [0, 0, 1], alb: mix(L('#1e1a15'), L('#2a241c'), fbm(x / 14, y / 14, 3, 2)), wrap: 0, rim: 0 }; };
const SC = { W, H, cam, off, objects, lights, env, ambient: L('#22262a') };
export async function scene() { return SC; }
export async function finish(img) { const rgba = post(img, { exposure: 3.2, vignette: 0, desat: 0.12, grain: 0.004, dither: 0.015 }); writePNG('test_props.png', rgba, W, H, 2); }
