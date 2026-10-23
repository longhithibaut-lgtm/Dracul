// Le Rongé (docs/lore.md), the refuge's merchant, for the « grand pixel » refuge: a vampire half gone ghoul. The ghouls'
// own model (tools/art/maquettes/ennemis/cast.mjs ghoul()) grown to a man's size, under the rags of a vampire's coat
// (the hero's dark cloth, its violet lining and old blood, tools/art/grand/hero.mjs) draped over his back, two dim embers
// in his sockets. Lit like the foes (tools/art/foes.gen.mjs: the cold rim, the warm fill, the hero's lantern off-frame)
// and snapped onto their palette. One view, three-quarter facing down-right (the game mirrors it to face the basin):
// crouched, breathing (idle0-3); reared up, his head raised at the hero near (look0-3); gone beast, jaw down, heaving
// (beast0-1). The cells are cropped to what all frames cover.
// Writes src/ronge.png and src/ronge.data.ts. Usage: node tools/art/ronge.gen.mjs (about a minute);
// PREVIEW=1 writes shots/ronge-preview.png (x2, on grey) instead.
import { writeFileSync, mkdirSync } from 'node:fs';
import { camera, render, post, haze, L, mix, clamp, vn3, h2, setMat, MAT } from './maquettes/ennemis/lib.mjs';
import { writePNG } from './grand/lib.mjs'; // keeps the alpha channel
import { ghoul } from './maquettes/ennemis/cast.mjs';

const cam = camera(38 * Math.PI / 180);
const K = 1.7; // the ghoul grown to a vampire's size (a crouched man)
const YAW = -Math.PI / 4; // the foes' « dside »: facing down-right
const W0 = 240, H0 = 200, SOLE0 = 150; // the render cell, before the crop
const RAGS = 20; // material id of the coat's rags
const C = { coat: L('#222020'), coatW: L('#36302c'), lining: L('#4c2a5a'), mud: L('#2c2418'), blood: L('#5e0710'), bloodD: L('#350608') };

// The spine (pelvis, ribs, neck) of the ghoul's poses (cast.mjs): the rags hang from it.
const SPINE = { 0: [[0, -15, 25], [0, 4, 24], [0, 17, 21]], 1: [[0, -15, 22], [0, 4, 22], [0, 17, 20]], 2: [[0, -15, 25], [0, 4, 30], [0, 17, 34]] };

/** The rags of a coat thrown over the spine `S` of pose `v`: an arch over his back whose sides hang down, flaring, to a
 *  hem torn in strips; moth holes; open before the neck and behind the haunches. Ghoul units. */
function rags(S) {
  const zAt = (y) => (y < S[1][1] ? S[0][2] + (S[1][2] - S[0][2]) * clamp((y - S[0][1]) / (S[1][1] - S[0][1])) : S[1][2] + (S[2][2] - S[1][2]) * clamp((y - S[1][1]) / (S[2][1] - S[1][1])));
  return (x, y, z) => {
    const hump = 2.5 * Math.exp(-(((y - S[1][1]) / 9) ** 2)), zc = zAt(y) + hump, r = 5.6 + hump * 0.4, R = r + 0.35 * Math.max(0, zc - z); // a hunch over the ribs, flaring as it falls
    let d = z > zc ? Math.abs(Math.hypot(x, (z - zc) * 1.2) - r) : Math.abs(Math.abs(x) - R);
    d -= 0.55;
    const strip = Math.floor((y + 40) / 3.2) * 2 + (x > 0 ? 1 : 0);
    const hem = zc - 13 + h2(strip, 3, 7) * 6 + (h2(strip, 5, 7) < 0.3 ? 4 : 0); // to his knees, torn in strips, some short
    d = Math.max(d, hem - z, S[0][1] - 2 - h2(Math.floor(z / 3), 1, 9) * 3 - y, y - S[2][1] - 1.5); // its back and front edges ragged too
    d = Math.max(d, (vn3(x * 0.35, y * 0.35, z * 0.35, 12) - 0.8) * 4); // moth holes
    return d;
  };
}

/** The Rongé in ghoul pose `v` (0 crouched, 2 reared, 1 lunging), breathing by `b` (0-1): ghoul units grown K times. */
function ronge(v, b) {
  const g = ghoul(v, 4), coat = rags(SPINE[v]), sz = 1 + 0.03 * b;
  const eyes = [-1, 1].map((s) => [g.head[0] + s * 1.4, g.head[1] + 3.6, g.head[2] + 0.9]);
  const local = (x, y, z) => [x / K, y / K, z / K / sz];
  return {
    sdf: (x, y, z) => {
      const p = local(x, y, z), d0 = g.sdf(...p), m0 = MAT, d1 = coat(...p);
      setMat(d1 < d0 ? RAGS : m0);
      return Math.min(d0, d1) * K * 0.9;
    },
    mat: (m, x, y, z, nx, ny, nz) => {
      const p = local(x, y, z);
      if (m !== RAGS) {
        if (eyes.some((e) => Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) < 1.15)) return { alb: [0.05, 0, 0], emi: [0.9, 0.05, 0.02], noAO: true, wrap: 0 };
        return g.mat(m, ...p, nx, ny, nz);
      }
      // Inside the arch: the violet lining; outside, the worn black cloth, muddied at the hem, old blood on it.
      const n = vn3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6, 11), up = p[2] > SPINE[v][1][2], inner = up ? nz < -0.2 : Math.sign(p[0]) * nx < -0.2;
      if (inner) return { alb: mix(C.lining, C.lining.map((c) => c * 0.5), n), spec: 0.1, gloss: 25 };
      let c = mix(C.coat, C.coatW, clamp((n - 0.5) * 2) * 0.6);
      c = mix(c, C.mud, clamp((12 - p[2]) / 9) * 0.7);
      if (vn3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 43) > 0.68) c = mix(c, n > 0.5 ? C.blood : C.bloodD, 0.6);
      return { alb: c, spec: 0.05, gloss: 12, wrap: 0.3 };
    },
    bounds: [-30 * K, -34 * K, -1, 30 * K, 40 * K, 46 * K * sz], step: 0.6,
  };
}

const FRAMES = [
  ...[0, 0.5, 1, 0.5].map((b, k) => [`idle${k}`, 0, b]),
  ...[0, 0.5, 1, 0.5].map((b, k) => [`look${k}`, 2, b]),
  ...[0, 1].map((b, k) => [`beast${k}`, 1, b * 1.6]),
];

// The foes' lighting (foes.gen.mjs scene()), at the cell's centre.
function frame([, v, b]) {
  const m = ronge(v, b), P = { x: W0 / 2, y: 0 };
  const sc = {
    W: W0, H: H0, cam, off: -SOLE0, env: null, ambient: L('#1a1c1e').map((c) => c * 0.6),
    objects: [{ name: 'foe', pos: [P.x, P.y, 0], yaw: YAW, sdf: m.sdf, mat: m.mat, bounds: m.bounds, id: 1, step: m.step }],
    lights: [
      { p: [P.x + 30, P.y - 60, 75], c: L('#8098a2'), I: 7, r0: 90, R: 260, soft: 10, only: ['foe'] },
      { p: [P.x - 70, P.y + 70, 140], c: L('#a08a70'), I: 0.9, r0: 130, R: 420, soft: 12 },
      { p: [P.x + 28, P.y + 50, 60], c: L('#b8a68a'), I: 2.4, r0: 40, R: 170, soft: 6 }, // the vampire's lantern, off-frame
    ],
  };
  const img = render(sc);
  haze(img, sc);
  const px = post(img, { exposure: 3.4, vignette: 0, desat: 0.15, grain: 0.004, dither: 0.015 });
  for (let p = 0; p < W0 * H0; p++) px[p * 4 + 3] = img.oid[p] >= 0 ? 255 : 0;
  return px;
}

const t0 = Date.now(), cells = FRAMES.map(frame);
// Crop every cell to the box all frames cover, a pixel of air round it.
let x0 = W0, y0 = H0, x1 = 0, y1 = 0;
for (const px of cells) for (let p = 0; p < W0 * H0; p++) if (px[p * 4 + 3]) {
  const x = p % W0, y = (p - x) / W0;
  [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
}
// Centred on the cell's middle, so mirroring keeps his feet in place.
const half = Math.max(W0 / 2 - x0, x1 + 1 - W0 / 2) + 1, FW = 2 * half, FH = y1 - y0 + 3, top = y0 - 1, left = W0 / 2 - half;
const rgba = new Uint8ClampedArray(FW * FH * FRAMES.length * 4);
cells.forEach((px, i) => {
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const sx = left + x, sy = top + y;
    if (sx >= 0 && sx < W0 && sy >= 0 && sy < H0) rgba.set(px.subarray((sy * W0 + sx) * 4, (sy * W0 + sx) * 4 + 4), ((y * FRAMES.length + 0) * FW + i * FW + x) * 4);
  }
});
const W = FW * FRAMES.length;
if (process.env.PREVIEW) {
  for (let p = 0; p < W * FH; p++) if (!rgba[p * 4 + 3]) rgba.set([70, 70, 74, 255], p * 4);
  mkdirSync('shots', { recursive: true });
  writePNG('shots/ronge-preview.png', rgba, W, FH, 2);
} else {
  writePNG('src/ronge.png', rgba, W, FH);
  writeFileSync('src/ronge.data.ts', `// Generated by tools/art/ronge.gen.mjs: edit the model there, not this table.
// Le Rongé's sheet (src/ronge.png): one row of FW x FH cells, his soles on row SOLE, centred; facing down-right.
export const FW = ${FW}, FH = ${FH}, SOLE = ${SOLE0 - top};
export const FRAMES = ${JSON.stringify(FRAMES.map(([n]) => n))};
`);
}
console.log(`${FRAMES.length} frames ${FW}x${FH}, soles on row ${SOLE0 - top}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
