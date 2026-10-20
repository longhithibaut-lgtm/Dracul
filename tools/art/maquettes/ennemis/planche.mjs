// Assembles the two enemy boards (1920x1080) from out/fNN.png + masks, text via Chromium canvas.
// node planche.mjs -> ennemis-planche-1.png, ennemis-planche-2.png
import { chromium } from 'playwright';
import fs from 'fs';
import { FOES } from './foes.mjs';
const dir = new URL('.', import.meta.url).pathname;
const b64 = p => 'data:image/png;base64,' + fs.readFileSync(dir + p).toString('base64');
const TXT = {
  1: ['Rabatteur rapide, chasse en meute de trois et te pousse vers les tireurs.', 's’aplatit, muselière ouverte, puis bond en ligne droite — s’écarter de côté.'],
  2: ['Chair à canon en vagues de six ; traîne sa croix, ne recule jamais.', 'arme son fouet clouté, puis cône court — reculer ou frapper avant.'],
  3: ['Tireur lourd ; brûle aussi les cadavres dont tu te nourris.', 'veilleuse allumée et cône au sol, puis jet de feu — sortir du cône.'],
  4: ['Contrôle de zone, reste derrière les soldats ; sa monstrance éclaire toute la salle.', 'pointe la monstrance : un cercle d’or se remplit sous toi, puis la lumière tombe — en sortir avant qu’il soit plein.'],
  5: ['Soutien, sourd (oreilles en sang) : chaque coup de cloche rend ses alliés plus rapides.', 'maillet levé, le bord de la cloche s’allume, puis trois anneaux qui étourdissent — les traverser d’un bond.'],
  6: ['Soigneuse aveugle : elle t’entend courir. À tuer en premier.', 'lève le reliquaire, fils vers les blessés, soin en 2 s — l’interrompre.'],
  7: ['Embuscade parmi les pendus ; seuls deux yeux pâles le trahissent.', 'la chaîne grince, ombre rouge au sol, il tombe — ne pas rester dessous.'],
  8: ['Élite : commande les autres et pare tout coup porté de face.', 'l’encensoir tourne, arc doré au sol, balayage à 180° — passer dans son dos.'],
  9: ['Tank lent de goules soudées ; chaque coup lui en arrache une qui rampe vers toi.', 'se contracte, tous les bras se lèvent, cercle rouge, puis il s’abat — sortir du cercle, frapper après.'],
  10: ['Mini-boss de la crypte : garde le reliquaire du chef de maison, enchaîné à sa ceinture.', 'lève la hache, long couloir rouge devant lui, puis coup qui fend le sol — s’écarter, frapper pendant qu’il la dégage.'],
};
const TAG = { 1: 'lore', 2: 'nouveau', 3: 'nouveau', 4: 'lore', 5: 'nouveau', 6: 'nouveau', 7: 'nouveau · goule', 8: 'lore', 9: 'nouveau · goules', 10: 'lore (gardien) · design nouveau' };
const NAME = { 10: 'Le Bourreau, gardien de la crypte' };
const card = n => { const t = 'out/f' + String(n).padStart(2, '0'); return { n, name: NAME[n] || FOES[n - 1].name, tag: TAG[n], txt: TXT[n], img: b64(t + '.png'), mask: b64(t + '-mask.png'), meta: JSON.parse(fs.readFileSync(dir + t + '.json')) }; };
const hero = { mask: b64('out/f00-mask.png'), meta: JSON.parse(fs.readFileSync(dir + 'out/f00.json')) };
const boards = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]];

const br = await chromium.launch(); const pg = await br.newPage();
for (let bi = 0; bi < 2; bi++) {
  const data = { cards: boards[bi].map(card), hero, bi };
  const out = await pg.evaluate(async ({ cards, hero, bi }) => {
    const load = async s => { const im = new Image(); im.src = s; await im.decode(); return im; };
    const C = document.createElement('canvas'); C.width = 1920; C.height = 1080; const x = C.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#070605'; x.fillRect(0, 0, 1920, 1080);
    const serif = 'Georgia, "DejaVu Serif", serif';
    x.fillStyle = '#cfc2a2'; x.font = `600 32px ${serif}`; x.fillText(`Les ennemis — planche ${bi + 1}/2`, 40, 46);
    x.font = `16px ${serif}`; x.fillStyle = '#8c7e64'; x.textAlign = 'right';
    x.fillText('à gauche la face, à droite l’attaque et son télégraphe (×3, bourreau ×2) · silhouettes à l’échelle, héros en rouge', 1880, 30);
    // telegraph colour legend
    const leg = [['#ff2a1a', 'coup physique'], ['#e8c070', 'lumière sacrée'], ['#c8cbbf', 'soin'], ['#e8a040', 'feu']];
    let lx = 1880; x.font = `15px ${serif}`;
    for (let i = leg.length - 1; i >= 0; i--) { const [c, t] = leg[i]; const w = x.measureText(t).width; x.fillStyle = '#8c7e64'; x.fillText(t, lx, 54); lx -= w + 8; x.fillStyle = c; x.fillRect(lx - 14, 44, 14, 3); lx -= 30; }
    x.fillStyle = '#8c7e64'; x.fillText('télégraphes au sol :', lx, 54); x.textAlign = 'left';
    const sil = async (src, col) => { const im = await load(src); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); const [r, gg, b] = col; for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b; d.data[i + 3] = a; } g.putImageData(d, 0, 0); return c; };
    const heroSil = await sil(hero.mask, [149, 28, 24]);
    const Y0 = 72, RH = 500;
    for (let k = 0; k < 5; k++) {
      const c = cards[k]; const big = k >= 3; const cw = big ? 960 : 640; const cx = big ? (k - 3) * 960 : k * 640, cy = Y0 + (big ? RH + 4 : 0);
      x.fillStyle = '#0d0b09'; x.fillRect(cx + 6, cy, cw - 12, RH - 4);
      // title
      x.fillStyle = '#b42c1e'; x.font = `600 30px ${serif}`; x.fillText(String(c.n), cx + 20, cy + 36);
      const nw = x.measureText(String(c.n)).width;
      x.fillStyle = '#cfc2a2'; x.font = `600 25px ${serif}`; x.fillText(c.name, cx + 30 + nw, cy + 35);
      const tw = x.measureText(c.name).width; x.font = `italic 15px ${serif}`; x.fillStyle = c.tag.startsWith('lore') ? '#ad9e80' : '#8f9852'; x.fillText(c.tag, cx + 42 + nw + tw, cy + 34);
      // image
      const im = await load(c.img); const S = c.n === 10 ? 2 : 3; const iw = im.width * S, ih = im.height * S;
      const ix = cx + 14, iy = cy + 48; x.drawImage(im, ix, iy, iw, ih);
      // scale silhouettes (×1.5): enemy in bone, hero in blood red, feet aligned
      const sx0 = ix + iw + 8, sw = cx + cw - 14 - sx0; const base = iy + ih - 6; const K = 1.5;
      const es = await sil(c.mask, [110, 98, 78]); const [x0, y0, x1, y1] = c.meta.bbox; const ew = (x1 - x0 + 1) * K, eh = (c.meta.feet - y0 + 2) * K;
      const [hx0, hy0, hx1] = hero.meta.bbox; const hw = (hx1 - hx0 + 1) * K, hh = (hero.meta.feet - hy0 + 2) * K;
      const ex = Math.min(sx0 + Math.max(0, (sw - ew) / 2 + hw * 0.35), sx0 + sw - ew);
      x.drawImage(es, x0, y0, x1 - x0 + 1, c.meta.feet - y0 + 2, ex, base - eh, ew, eh);
      x.drawImage(heroSil, hx0, hy0, hx1 - hx0 + 1, hero.meta.feet - hy0 + 2, Math.max(sx0, ex - hw * 0.75), base - hh, hw, hh);
      x.fillStyle = '#3e362b'; x.fillRect(sx0, base + 1, sw, 1);
      x.font = `13px ${serif}`; x.fillStyle = '#6e624e'; x.textAlign = 'center'; x.fillText('échelle', sx0 + sw / 2, iy + 16); x.textAlign = 'left';
      // two lines
      const ty = iy + ih + 26; const fit = (t, w, sz) => { x.font = `${sz}px ${serif}`; while (x.measureText(t).width > w && sz > 13) { sz -= 0.5; x.font = `${sz}px ${serif}`; } };
      const line = (lab, t, y) => { x.font = `600 16px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(lab, cx + 22, y); const lw = x.measureText(lab).width; fit(t, cw - 56 - lw, 16); x.fillStyle = '#8c7e64'; x.fillText(t, cx + 28 + lw, y); };
      line('Rôle', c.txt[0], ty); line('Télégraphe', c.txt[1], ty + 24);
    }
    return C.toDataURL('image/png');
  }, data);
  fs.writeFileSync(dir + `ennemis-planche-${bi + 1}.png`, Buffer.from(out.split(',')[1], 'base64'));
}
await br.close();
