// node crop.mjs file x0 y0 w h scale -> out/crop.png
import { readPNG } from './contact.mjs'; import { writePNG } from './lib.mjs';
const [f, x0, y0, w, h, S] = [process.argv[2], ...process.argv.slice(3).map(Number)]; const im = readPNG(f); const o = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) o.set(im.px.subarray(((y0 + y) * im.W + x0) * 4, ((y0 + y) * im.W + x0 + w) * 4), y * w * 4);
writePNG('out/crop.png', o, w, h, S);
