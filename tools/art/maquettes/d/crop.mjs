// node crop.mjs in.png x y w h scale out.png  (native coords on a x4 image)
import { chromium } from 'playwright'; import fs from 'fs';
const [inp, x, y, w, h, s, outp] = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage();
const u = await p.evaluate(async ({ d, x, y, w, h, s }) => { const im = new Image(); im.src = d; await im.decode(); const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, x * 4, y * 4, w * 4, h * 4, 0, 0, w * s, h * s); return c.toDataURL(); },
  { d: 'data:image/png;base64,' + fs.readFileSync(inp).toString('base64'), x: +x, y: +y, w: +w, h: +h, s: +s });
fs.writeFileSync(outp, Buffer.from(u.split(',')[1], 'base64')); await b.close();
