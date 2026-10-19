// Renders a scene script (melange.js / persos.js) over the captured hall: node render.mjs melange
import { chromium } from 'playwright';
import fs from 'fs';
const D = new URL('.', import.meta.url).pathname;
const name = process.argv[2] || 'melange';
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', m => console.log('page:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
await p.setContent('<canvas id=c></canvas>');
const imgs = Object.fromEntries(['unlit-base', 'unlit-props', 'game'].map(n => [n, 'data:image/png;base64,' + fs.readFileSync(D + n + '.png').toString('base64')]));
await p.evaluate(async (imgs) => { // 1920x1080 captures -> 480x270 native (exact x4, sample pixel centres)
  window.CAP = {};
  for (const [k, u] of Object.entries(imgs)) {
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, 1920, 1080).data, o = new Uint8ClampedArray(480 * 270 * 4);
    for (let y = 0; y < 270; y++) for (let i = 0; i < 480; i++) for (let q = 0; q < 4; q++) o[(y * 480 + i) * 4 + q] = d[((y * 4 + 2) * 1920 + i * 4 + 2) * 4 + q];
    CAP[k] = o;
  }
}, imgs);
const t = Date.now();
await p.addScriptTag({ content: fs.readFileSync(D + 'sprites.js', 'utf8') });
await p.addScriptTag({ content: fs.readFileSync(D + 'common.js', 'utf8') });
await p.addScriptTag({ content: fs.readFileSync(D + name + '.js', 'utf8') });
const [full, native] = await p.evaluate(() => {
  const s = document.createElement('canvas'); s.width = 480; s.height = 270;
  s.getContext('2d').putImageData(new ImageData(IMG, 480, 270), 0, 0);
  const c = document.getElementById('c'); c.width = 1920; c.height = 1080;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, 1920, 1080);
  return [c.toDataURL('image/png'), s.toDataURL('image/png')];
});
fs.writeFileSync(D + name + '.png', Buffer.from(full.split(',')[1], 'base64'));
fs.writeFileSync(D + name + '-480.png', Buffer.from(native.split(',')[1], 'base64'));
console.log('done', name, Date.now() - t, 'ms');
await b.close();
