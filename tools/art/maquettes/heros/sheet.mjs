import { chromium } from 'playwright';
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const files = (process.env.H || '1,2,3').split(',').map(n => `h${n}.js`);
const lib = fs.readFileSync(dir + 'lib.js', 'utf8'), scene = fs.readFileSync(dir + 'scene-h.js', 'utf8');
const browser = await chromium.launch();
const heroes = [];
for (const f of files) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('ERR', f, e.message));
  await page.setContent('<canvas id=c></canvas>');
  await page.addScriptTag({ content: 'var HEROES = [];\n' + lib + '\n' + fs.readFileSync(dir + f, 'utf8') });
  const hero = await page.evaluate(() => {
    const h = HEROES[0];
    h.views = h.views.map((g, i) => { outline(g); if (i === 3 && h.arc) arc(g, ...h.arc); return rowsOf(g); });
    const lin = hx => { const v = parseInt(hx.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255].map(c => Math.pow(c, 2.2)); };
    const pal = {};
    for (const [k, v] of Object.entries(h.pal)) if (!FX.has(k)) pal[k] = typeof v === 'string' ? lin(v) : { c: lin(v.hex), e: v.e };
    const rows = h.views[0].slice(); while (!/[^.]/.test(rows[rows.length - 1])) rows.pop();
    globalThis.HERO_ROWS = rows; globalThis.HERO_PAL = pal; globalThis.HERO_LIGHT = h.light; globalThis.MODE = 'final';
    return h;
  });
  await page.addScriptTag({ content: scene });
  hero.crop = await page.evaluate(() => {
    const s = document.createElement('canvas'); s.width = W; s.height = H;
    s.getContext('2d').putImageData(new ImageData(IMG, W, H), 0, 0);
    return s.toDataURL('image/png');
  });
  heroes.push(hero); await page.close();
}
const page = await browser.newPage({ viewport: { width: 1920, height: 1400 } });
await page.setContent('<canvas id=c></canvas>');
const png = await page.evaluate(async heroes => {
  const CW = 640, Wd = CW * heroes.length, Hd = 1400;
  const c = document.getElementById('c'); c.width = Wd; c.height = Hd; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = '#0b0a09'; x.fillRect(0, 0, Wd, Hd);
  const hexOf = v => typeof v === 'string' ? v : v.hex;
  const drawSprite = (rows, pal, X, Y, k) => {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; const p = pal[ch]; if (!p) { console.log('missing', ch); return; } x.fillStyle = hexOf(p); x.fillRect(X + i * k, Y + j * k, k, k); }));
  };
  const panel = (X, Y, w, h) => { x.fillStyle = '#1d1a17'; x.fillRect(X, Y, w, h); x.strokeStyle = '#2b2620'; x.lineWidth = 2; x.strokeRect(X + 1, Y + 1, w - 2, h - 2); };
  const label = (t, X, Y, size = 17, col = '#8e7d60', font = 'DejaVu Serif') => { x.font = `${size}px "${font}"`; x.fillStyle = col; x.fillText(t, X, Y); };
  for (const [hi, h] of heroes.entries()) {
    const X0 = hi * CW + 28; const acc = hexOf(h.pal.e);
    if (hi) { x.fillStyle = '#1a1712'; x.fillRect(hi * CW, 20, 2, Hd - 40); }
    label(h.name, X0, 62, 44, '#c8b896');
    label(h.tag, X0, 92, 18, '#76674e', 'DejaVu Serif');
    x.fillStyle = acc; x.fillRect(X0, 104, 22, 10); label('accent : ' + h.accent, X0 + 32, 114, 16, '#8e7d60', 'DejaVu Sans');
    const names = ['face', 'dos', 'profil', 'attaque : griffe'];
    const pos = [[X0, 150], [X0 + 290, 150], [X0, 520], [X0 + 270, 520]];
    h.views.forEach((rows, i) => {
      const [px, py] = pos[i], w = rows[0].length * 8;
      label(names[i] + '  ×8', px, py - 10, 15, '#615541', 'DejaVu Sans');
      panel(px, py, w, 320); drawSprite(rows, h.pal, px, py, 8);
    });
    // in-game crop x4
    const img = new Image(); img.src = h.crop; await img.decode();
    const cx = 240 - 70, cy = 214 - 82, cw = 146, ch = 98;
    label('en jeu  ×4  (sa propre lumière, salle de la maquette)', X0, 878, 15, '#615541', 'DejaVu Sans');
    x.drawImage(img, cx, cy, cw, ch, X0, 888, cw * 4, ch * 4);
    x.strokeStyle = '#2b2620'; x.strokeRect(X0, 888, cw * 4, ch * 4);
    x.font = '15px "DejaVu Serif"'; x.fillStyle = '#76674e';
    const words = h.why.split(' '); let line = '', ly = 1310;
    for (const w of words) { if (x.measureText(line + w).width > 580) { x.fillText(line, X0, ly); ly += 20; line = ''; } line += w + ' '; } x.fillText(line, X0, ly);
  }
  return c.toDataURL('image/png');
}, heroes);
page.on('console', m => console.log('page:', m.text()));
fs.writeFileSync(dir + (process.env.OUT || 'planche.png'), Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
console.log('ok');
