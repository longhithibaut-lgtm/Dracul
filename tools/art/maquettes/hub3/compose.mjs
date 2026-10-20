// Deliverables from the renders: 1920-wide overviews of each state, in-game frames (960x540 shown x2, blood HUD).
import fs from 'fs';
import { writePNG } from './lib.mjs';
import { hud } from './complex.mjs';
const load = (name, W) => { const b = fs.readFileSync(name + '.rgba'); return { px: new Uint8ClampedArray(b.buffer, b.byteOffset, b.length), W, H: b.length / 4 / W }; };
const crop = (im, x0, y0, w, h) => { const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) o.set(im.px.subarray(((y0 + y) * im.W + x0) * 4, ((y0 + y) * im.W + x0 + w) * 4), y * w * 4); return o; };
// area-averaged downscale (4x4 taps per output pixel) for the overviews
function shrink(im, w) {
  const k = im.W / w, h = Math.round(im.H / k), o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const acc = [0, 0, 0];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const sx = Math.min(im.W - 1, ((x + (i + 0.5) / 4) * k) | 0), sy = Math.min(im.H - 1, ((y + (j + 0.5) / 4) * k) | 0), s = (sy * im.W + sx) * 4; acc[0] += im.px[s]; acc[1] += im.px[s + 1]; acc[2] += im.px[s + 2]; }
    const d = (y * w + x) * 4; o[d] = acc[0] / 16; o[d + 1] = acc[1] / 16; o[d + 2] = acc[2] / 16; o[d + 3] = 255; }
  return { px: o, w, h };
}
for (const st of ['complet', 'milieu', 'debut']) { if (!fs.existsSync(st + '.rgba')) continue; const im = load(st, 2870); const s = shrink(im, 1920); writePNG(st + '.png', s.px, s.w, s.h, 1); writePNG(st + '-native.png', im.px, im.W, im.H, 1); }
const out = (name, px, w, h) => { writePNG(name + '-native.png', px, w, h, 1); writePNG(name + '.png', px, w, h, 2); };
const [HX, HY] = (process.env.HALLCROP || '1410,1020').split(',').map(Number);
if (fs.existsSync('complet.rgba')) { const f = crop(load('complet', 2870), HX, HY, 960, 540); hud(f, 960); out('ecran-grande-salle', f, 960, 540); }
if (fs.existsSync('crypte.rgba')) { const f = crop(load('crypte', 960), 0, 0, 960, 540); hud(f, 960); out('ecran-crypte', f, 960, 540); }
