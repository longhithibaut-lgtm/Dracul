// Adds French labels around the x4 hero sheet (Chromium canvas for text).
import { chromium } from 'playwright';
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const img = 'data:image/png;base64,' + fs.readFileSync(dir + 'heros-native.png').toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async (src) => {
  const im = new Image(); im.src = src; await im.decode();
  const c = document.createElement('canvas'); c.width = 1920; c.height = 900; const x = c.getContext('2d');
  x.fillStyle = '#070605'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false;
  x.drawImage(im, 0, 44, 320, 116, 0, 76, 1920, 696);
  x.fillStyle = '#cfc2a2'; x.font = '600 34px Georgia, "DejaVu Serif", serif'; x.fillText('Le vampire — planche du héros', 48, 50);
  x.fillStyle = '#8c7e64'; x.font = '18px Georgia, "DejaVu Serif", serif'; x.textAlign = 'right';
  x.fillText('pixels natifs ×6 · ~80 px de haut en jeu (affiché ×2 en 1080p)', 1872, 50);
  x.textAlign = 'center'; x.font = '600 26px Georgia, "DejaVu Serif", serif';
  const lab = [[252, 'Face — repos'], [696, 'Profil'], [1140, 'Dos'], [1620, 'Coup de griffe']];
  for (const [cx, t] of lab) { x.fillStyle = '#cfc2a2'; x.fillText(t, cx, 822); }
  x.font = '18px Georgia, "DejaVu Serif", serif'; x.fillStyle = '#76674e';
  const sub = [[252, 'lanterne au poing, crocs, mains en sang'], [696, 'manteau long, cheveux raides'], [1140, 'col haut, ourlet en lambeaux'], [1620, 'trois griffures dans l’air']];
  for (const [cx, t] of sub) x.fillText(t, cx, 852);
  return c.toDataURL('image/png');
}, img);
fs.writeFileSync(dir + 'heros.png', Buffer.from(out.split(',')[1], 'base64'));
await b.close();
