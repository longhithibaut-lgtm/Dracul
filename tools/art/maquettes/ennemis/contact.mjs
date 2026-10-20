// Debug contact sheet: tiles native card images (written by writePNG: RGBA, filter 0) at an integer scale.
import fs from 'fs'; import zlib from 'zlib'; import { writePNG } from './lib.mjs';
export function readPNG(p) { const b = fs.readFileSync(p); let o = 8, W, H, id = []; while (o < b.length) { const n = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8); if (t === 'IHDR') { W = b.readUInt32BE(o + 8); H = b.readUInt32BE(o + 12); } if (t === 'IDAT') id.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(id)); const px = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) px.set(raw.subarray(y * (W * 4 + 1) + 1, (y + 1) * (W * 4 + 1)), y * W * 4); return { W, H, px }; }
if ((process.argv[1] || '').endsWith('contact.mjs')) {
  const ids = process.argv.slice(3).map(Number), S = +process.argv[2];
  const ims = ids.map(i => readPNG(`out/f${String(i).padStart(2, '0')}.png`));
  const W = Math.max(...ims.map(i => i.W)), H = ims.reduce((a, i) => a + i.H + 2, 0); const out = new Uint8ClampedArray(W * H * 4).fill(40);
  let y0 = 0; for (const im of ims) { for (let y = 0; y < im.H; y++) out.set(im.px.subarray(y * im.W * 4, (y + 1) * im.W * 4), ((y0 + y) * W) * 4); y0 += im.H + 2; }
  writePNG('out/contact.png', out, W, H, S);
}
