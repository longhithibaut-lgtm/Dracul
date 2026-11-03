// The menus' lit pieces (docs/maquettes/titre-1.png, pause-1.png, options*.png), baked offline from the mockups' own
// functions (tools/art/maquettes/menus/), lit and snapped to the palette like them: src/menu.png, an atlas, and
// src/menu.data.ts, where each frame sits in it and its top left from the point it is drawn at. The words, the key caps
// and the bands are drawn by the game (src/menu.ts), whose texts change.
// Frames: title (« DRACUL » in tarnished silver and its reliquary line), line100 and line90 (the line under the pause's
// place and the options' title), drop and dropred (the blood drop marking a choice, a clash), full and empty (a slider's
// ampoule), mousel, mouser, mousem (a mouse, its button lit).
// Usage: node tools/art/menu.gen.mjs
import { writeFileSync } from 'node:fs';
import { Layer, W, H, texts } from './maquettes/hud/lib.mjs';
import { C, mouse } from './maquettes/hud/parts.mjs';
import { emboss, silver, crossLine, drop } from './maquettes/menus/parts.mjs';
import { ampoule } from './maquettes/menus/options.mjs';
import { png } from './bake.mjs';

const T = await texts({ title: ['DRACUL', '84px cinzel', 14] });
const AX = 480, AY = 270; // where each piece is drawn from
const PIECES = {
  title: (L) => { // titre.mjs titre1, its top at AY
    const m = T.title, x = AX - m.w / 2 + 7;
    L.text(m, x + 2, AY + 2, () => ({ c: C.ink, flat: true, op: 0.9 }));
    emboss(L, m, x, AY, silver(3), 3);
    crossLine(L, AX, AY + m.h + 8, 140);
  },
  line100: (L) => crossLine(L, AX, AY, 100),
  line90: (L) => crossLine(L, AX, AY, 90),
  drop: (L) => drop(L, AX, AY, 0.9),
  dropred: (L) => drop(L, AX, AY, 0.8, 0.9),
  full: (L) => ampoule(L, AX, AX + 260, AY, 1, true),
  empty: (L) => ampoule(L, AX, AX + 260, AY, 0, false),
  mousel: (L) => mouse(L, AX, AY, 'l', C.boneDim, C.bone),
  mouser: (L) => mouse(L, AX, AY, 'r', C.boneDim, C.bone),
  mousem: (L) => { mouse(L, AX, AY, 'm', C.boneDim, C.bone); L.paint(AX + 3, AY + 1, AX + 4, AY + 4, () => ({ c: C.bone, flat: true })); },
};

const shots = Object.entries(PIECES).map(([name, paint]) => {
  const L = new Layer();
  paint(L);
  const img = L.shade();
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  return { name, img, x0, y0, w: x1 - x0, h: y1 - y0 };
});
// shelf-packed into one atlas, 1 px apart
const AW = 512;
let ax = 0, ay = 0, row = 0;
for (const s of shots) {
  if (ax + s.w > AW) { ax = 0; ay += row + 1; row = 0; }
  Object.assign(s, { ax, ay });
  ax += s.w + 1; row = Math.max(row, s.h);
}
const AH = ay + row, atlas = new Uint8ClampedArray(AW * AH * 4);
for (const s of shots) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) for (let k = 0; k < 4; k++) atlas[((s.ay + y) * AW + s.ax + x) * 4 + k] = s.img[((s.y0 + y) * W + s.x0 + x) * 4 + k];
png('src/menu.png', atlas, AW, AH, true);
writeFileSync('src/menu.data.ts', `// Baked by tools/art/menu.gen.mjs: do not edit.
/** Each frame: x, y, w, h in src/menu.png; its top left from the point it is drawn at (one pixel: one of the x2 view). */
export const FRAMES: Record<string, [number, number, number, number, number, number]> = {
${shots.map((s) => `  ${s.name}: [${s.ax}, ${s.ay}, ${s.w}, ${s.h}, ${s.x0 - AX}, ${s.y0 - AY}],`).join('\n')}
};
`);
console.log(`src/menu.png ${AW}x${AH}, ${shots.length} frames`);
