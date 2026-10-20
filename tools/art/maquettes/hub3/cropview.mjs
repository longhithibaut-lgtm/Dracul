// node cropview.mjs <name> x y w h [scale] -> view_<name>.png (crop of <name>-native rgba, nearest-scaled)
import fs from 'fs'; import { writePNG } from './lib.mjs';
const [name, x0, y0, w, h, sc = 2] = process.argv.slice(2); const W = name === 'crypte' ? 960 : 2870;
const b = fs.readFileSync(name + '.rgba'); const px = new Uint8ClampedArray(b.buffer, b.byteOffset, b.length);
const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) o.set(px.subarray(((+y0 + y) * W + +x0) * 4, ((+y0 + y) * W + +x0 + +w) * 4), y * w * 4);
writePNG(`view_${name}_${x0}_${y0}.png`, o, +w, +h, +sc);
