import { chromium } from 'playwright';
import fs from 'fs';
const D = new URL('.', import.meta.url).pathname;
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent('<canvas id=c></canvas>');
await p.addScriptTag({ content: fs.readFileSync(D + 'sprites.js', 'utf8') });
const url = await p.evaluate(() => {
  const names = Object.keys(SPR); const S = 8; let X = 4; const c = document.getElementById('c'); c.width = 1400; c.height = 360; const x = c.getContext('2d');
  x.fillStyle = '#2a3560'; x.fillRect(0, 0, c.width, c.height);
  for (const n of names) { const s = SPR[n]; const w = Math.max(...s.rows.map(r => r.length));
    s.rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; const q = s.pal[ch]; if (!q) { x.fillStyle = '#ff00ff'; } else x.fillStyle = q.c || q; x.fillRect(X + i * S, 4 + j * S, S, S); }));
    X += w * S + 10; if (X > 1300) break; }
  return c.toDataURL();
});
fs.writeFileSync(D + 'preview.png', Buffer.from(url.split(',')[1], 'base64')); await b.close();
