// The HUD « Chair » (docs/maquettes/hud-2-chair.png), baked offline from the mockup's own pieces
// (tools/art/maquettes/hud/chair.mjs), each lit and snapped to the palette like the mockup, at its place in the mockup's
// 960x540 (one HUD pixel = one pixel of the x2 view): src/hud.png, an atlas, and src/hud.data.ts, where each frame sits in
// the atlas and in the mockup. The game (src/hud.ts) shows a frame by state and anchors it to the view's corner.
// Frames: heart<i> (life i/40, the black climbing from the apex) and beat<i> (the same, swollen on the beat), halo;
// vein<i> (the mist's recharge i/24); pouch<i> (the blood carried i/20 of the bag); strip (the pinned skin, no brand),
// strip<i> (every brand scabbed over i/12 of its turn), stripdrip (open, la Nuée's bleeding); cord1, cord0 (the
// guardian's cord, plump, withered); space, mice (the keys).
// Usage: node tools/art/hud.gen.mjs
import { writeFileSync } from 'node:fs';
import { Layer, W, H } from './maquettes/hud/lib.mjs';
import { C, mouse, spacebar } from './maquettes/hud/parts.mjs';
import { heart, vein, pouch, skin, brand, cord } from './maquettes/hud/chair.mjs';
import { png } from './bake.mjs';

const HX = 38, HY = 494, PX = 152, PY = 484, SLOTS = ['griffes', 'tir', 'glyphe'];
const BRANDS = [[852, 9, 'griffes'], [879, 9, 'tir'], [906, 9, 'glyphe'], [932, 11, 'rat']]; // x, size, emblem (y 511; the rat 509)
const strip = (L, cd, drip = false, bare = false) => {
  skin(L, 836, 494, 946, 528, 71);
  if (!bare) BRANDS.forEach(([x, k, e]) => brand(L, x, e === 'rat' ? 509 : 511, k, e, cd, drip && e === 'rat'));
};
const GROUPS = {
  heart: [
    ...Array.from({ length: 41 }, (_, i) => [`heart${i}`, (L) => heart(L, HX, HY, i / 40, false, 1.35, false)]),
    ...Array.from({ length: 41 }, (_, i) => [`beat${i}`, (L) => heart(L, HX, HY, i / 40, false, 1.42, false)]),
  ],
  halo: [['halo', (L) => heart(L, HX, HY, 1, false, 1.35, true, false)]],
  vein: Array.from({ length: 25 }, (_, i) => [`vein${i}`, (L) => vein(L, HX, i / 24)]),
  pouch: Array.from({ length: 21 }, (_, i) => [`pouch${i}`, (L) => pouch(L, PX, PY, i / 20)]),
  strip: [['strip', (L) => strip(L, 0, false, true)], ...Array.from({ length: 13 }, (_, i) => [`strip${i}`, (L) => strip(L, i / 12)]), ['stripdrip', (L) => strip(L, 0, true)]],
  cord: [['cord1', (L) => cord(L, 300, 660, 40, 1)], ['cord0', (L) => cord(L, 300, 660, 40, 0)]],
  space: [['space', (L) => spacebar(L, HX + 116, 526, C.boneDim, 0.6)]],
  mice: [['mice', (L) => [[849, 'l'], [876, 'r']].forEach(([x, s]) => mouse(L, x, 480, s, C.boneDim, C.bone, 0.75))]],
};

// each frame lit, then cropped to its group's box (the union of what its frames cover), so frames of a group align
const shots = [];
for (const [group, frames] of Object.entries(GROUPS)) {
  const imgs = frames.map(([name, paint]) => { const L = new Layer(); paint(L); return [name, L.shade()]; });
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const [, img] of imgs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  for (const [name, img] of imgs) shots.push({ name, img, x0, y0, w: x1 - x0, h: y1 - y0 });
}

// shelf-packed into one atlas, 1 px apart
const AW = 1024;
let ax = 0, ay = 0, row = 0;
for (const s of shots) {
  if (ax + s.w > AW) { ax = 0; ay += row + 1; row = 0; }
  Object.assign(s, { ax, ay });
  ax += s.w + 1; row = Math.max(row, s.h);
}
const AH = ay + row, atlas = new Uint8ClampedArray(AW * AH * 4);
for (const s of shots) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) for (let k = 0; k < 4; k++) atlas[((s.ay + y) * AW + s.ax + x) * 4 + k] = s.img[((s.y0 + y) * W + s.x0 + x) * 4 + k];
png('src/hud.png', atlas, AW, AH, true);
writeFileSync('src/hud.data.ts', `// Baked by tools/art/hud.gen.mjs: do not edit.
/** Each frame: x, y, w, h in src/hud.png; x, y where it sits in the mockup's 960 x 540. */
export const FRAMES: Record<string, [number, number, number, number, number, number]> = {
${shots.map((s) => `  ${s.name}: [${s.ax}, ${s.ay}, ${s.w}, ${s.h}, ${s.x0}, ${s.y0}],`).join('\n')}
};
/** The brands on the strip, in its order (griffes, tir, glyphe, la Nuée): the columns of it each one owns, mockup x. */
export const BRANDS: [number, number][] = [[0, 866], [866, 893], [893, 919], [919, 960]];
/** Steps of each state's frames: life (heart, beat), mist (vein), blood (pouch), cooldown (strip). */
export const STEPS = { heart: 40, vein: 24, pouch: 20, strip: 12 };
`);
console.log(`src/hud.png ${AW}x${AH}, ${shots.length} frames; ${SLOTS.length + 1} brands`);
