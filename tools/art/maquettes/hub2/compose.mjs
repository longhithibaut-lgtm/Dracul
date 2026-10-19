// Crops the big renders into deliverables + in-game frames (960x540 shown x2, with the blood HUD).
import fs from 'fs';
import { writePNG } from './lib.mjs';
import { hud } from './complex.mjs';
const load = (name, W) => { const b = fs.readFileSync(name + '.rgba'); return { px: new Uint8ClampedArray(b.buffer, b.byteOffset, b.length), W, H: b.length / 4 / W }; };
const crop = (im, x0, y0, w, h) => { const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) o.set(im.px.subarray(((y0 + y) * im.W + x0) * 4, ((y0 + y) * im.W + x0 + w) * 4), y * w * 4); return o; };
const full = load('full', 2870), cr = load('crypt', 1180);
const out = (name, px, w, h) => { writePNG(name + '-native.png', px, w, h, 1); writePNG(name + '.png', px, w, h, 2); };
out('grande-salle', full.px, full.W, full.H);
const c = crop(cr, 0, 50, 1180, cr.H - 50); out('crypte', c, 1180, cr.H - 50);
let f = crop(full, 1500, 1110, 960, 540); hud(f, 960); out('grande-salle-ecran', f, 960, 540);
f = crop(cr, 220, 120, 960, 540); hud(f, 960); out('crypte-ecran', f, 960, 540);
