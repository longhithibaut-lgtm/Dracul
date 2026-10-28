// The Rongé's sheets (1920x1080), text via Chromium canvas: one per proposal (its three poses, the scale by the hero in
// red, a crop of it in the refuge, its pitch and two lines) and one setting the three side by side, from <OUT>/c*.png
// (card.mjs) and docs/maquettes/ronge-<n>-<key>-scene.png (insitu.mjs).
// OUT=<dir> node planche.mjs -> docs/maquettes/ronge-<n>-<key>.png, ronge-planche.png
import { chromium } from 'playwright';
import fs from 'fs';
import { tmpdir } from 'os';
import { DESIGNS, POSES } from './ronge.mjs';

const dir = new URL('.', import.meta.url).pathname, OUT = (process.env.OUT || tmpdir() + '/dracul-ronge') + '/', DEST = dir + '../../../../docs/maquettes/';
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const json = (p) => JSON.parse(fs.readFileSync(p));
// per proposal: the pitch (two lines), what reads at the game's scale, his two lines (provisional), and the in-game crop
// (screen px of the 1920x1080 capture: x, y, w, h)
const T = [
  { pitch: ['Perché sur la margelle comme une gargouille, il boit dans ses mains en coupe le sang qu’on verse au bassin.',
    'Il ne le quitte jamais : c’est sa source et sa laisse ; le héros le trouve là à chaque retour.'],
  read: 'Une tête dressée sur des épaules d’homme, le col du manteau, les mains rouges à la bouche ; les rares fois où il se baisse, c’est la bête.',
  lines: ['Verse, petit. Quand j’ai bu, je me souviens.', 'Ce sang-là a le goût d’en haut. Verse encore.'] },
  { pitch: ['Plié sous ce qu’il arrache aux catacombes la nuit : os, chaînes, une lanterne morte, un soleil doré de l’Ordre.',
    'Ses marchandises sur le dos, sa canne, une bougie dans un bocal : il revient au bassin vendre contre du sang.'],
  read: 'La bosse du ballot, la canne, la bougie qui pend : une silhouette de vieux colporteur, debout, à la hauteur du héros.',
  lines: ['Trouvé ça sous un prêtre mort. Pour toi : du sang, rien d’autre.', 'Les catacombes donnent tout à qui fouille la nuit.'] },
  { pitch: ['Il vit dans une niche de l’ossuaire, près du bassin, roulé parmi les crânes : deux braises et de longues mains sur le rebord.',
    'Il ne se penche dehors que quand le héros approche ; affamé, il recule au fond et grogne.'],
  read: 'Le reliquaire de crânes et sa bougie se voient de loin ; dedans, un visage pâle, deux braises, des mains : on cherche l’homme.',
  lines: ['Approche… Je les ai vus, en bas, ceux qui ne dorment plus.', 'Encore un peu de sang, et la mémoire me revient.'] },
];
const POSE_T = { idle: 'au repos', speak: 'il se penche pour parler (le héros approche)', beast: 'la bête : trop longtemps sans sang, boutique fermée' };
const CROP = [690, 330, 560, 430];
const card = (n, p) => ({ img: b64(`${OUT}c${n}-${p}.png`), mask: b64(`${OUT}c${n}-${p}-mask.png`), meta: json(`${OUT}c${n}-${p}.json`) });
const data = {
  hero: { mask: b64(`${OUT}c0-hero-mask.png`), meta: json(`${OUT}c0-hero.json`) }, POSE_T, CROP,
  designs: DESIGNS.map((d, i) => ({ n: i + 1, name: d.name, t: T[i], poses: POSES.map((p) => ({ p, ...card(i + 1, p) })), scene: b64(`${DEST}ronge-${i + 1}-${d.key}-scene.png`) })),
};

const br = await chromium.launch(); const pg = await br.newPage();
const pages = await pg.evaluate(async ({ hero, designs, POSE_T, CROP }) => {
  const load = async (s) => { const im = new Image(); im.src = s; await im.decode(); return im; };
  const serif = 'Georgia, "DejaVu Serif", serif';
  const sil = async (src, col, grey) => { const im = await load(src); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i], on = v > 200 || (grey && v > 100); const k = v > 200 ? col : grey; if (on) { d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; } d.data[i + 3] = on ? 255 : 0; } g.putImageData(d, 0, 0); return c; };
  const wrap = (x, t, w) => { const out = []; let line = ''; for (const word of t.split(' ')) { const s = line ? line + ' ' + word : word; if (x.measureText(s).width > w && line) { out.push(line); line = word; } else line = s; } out.push(line); return out; };
  const page = () => { const C = document.createElement('canvas'); C.width = 1920; C.height = 1080; const x = C.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#070605'; x.fillRect(0, 0, 1920, 1080); return [C, x]; };
  const crop = (m) => { const [ax0, ay0, ax1, ay1] = m.all, [fx0, fy0, fx1, fy1] = m.mask; return [Math.max(0, ax0, fx0 - 14), Math.max(0, ay0, fy0 - 8), Math.min(m.W, ax1 + 1, fx1 + 15), Math.min(m.H, ay1 + 1, fy1 + 18)]; }; // him, and what is round him
  const heroSil = await sil(hero.mask, [149, 28, 24]);
  /** the hero in red, then each pose's silhouette (him bone, what he lives in darker), soles on one line, at scale K */
  async function scale(x, d, px0, base, K, room) {
    const [hx0, hy0, hx1, hy1] = hero.meta.fig; let px = px0;
    K = Math.min(K, room / (hx1 - hx0 + 11 + d.poses.reduce((a, p) => a + p.meta.mask[2] - p.meta.mask[0] + 7, 0))); // x2 when it fits
    x.drawImage(heroSil, hx0, hy0, hx1 - hx0 + 1, hy1 - hy0 + 1, px, base - (hy1 - hy0 + 1) * K, (hx1 - hx0 + 1) * K, (hy1 - hy0 + 1) * K); px += (hx1 - hx0 + 1) * K + 10 * K;
    for (const p of d.poses) { const S2 = await sil(p.mask, [124, 110, 88], [70, 62, 50]), bx = p.meta.mask, w = bx[2] - bx[0] + 1, h = bx[3] - bx[1] + 1;
      x.drawImage(S2, bx[0], bx[1], w, h, px, base - h * K, w * K, h * K); px += w * K + 6 * K; }
    return px;
  }
  const res = [];
  for (const d of designs) {
    const [C, x] = page();
    x.fillStyle = '#b42c1e'; x.font = `600 31px ${serif}`; x.fillText(String(d.n), 40, 48); const nw = x.measureText(String(d.n)).width;
    x.fillStyle = '#cfc2a2'; x.fillText(`${d.name}`, 56 + nw, 48);
    x.font = `15px ${serif}`; x.fillStyle = '#8c7e64'; x.textAlign = 'right';
    x.fillText('Le Rongé, proposition ' + d.n + '/3 : un homme qui fut vampire, à moitié goule · nom provisoire', 1880, 28);
    x.fillText('les poses en gros plan · l’échelle et la capture : la taille du jeu en 1080p · héros en rouge', 1880, 50); x.textAlign = 'left';
    // the three poses, each in a third of the left part, at the largest whole scale that fits
    const PW = 450, PY = 80, PH = 720;
    for (let k = 0; k < 3; k++) {
      const p = d.poses[k], im = await load(p.img), [sx0, sy0, sx1, sy1] = crop(p.meta), cx = 30 + k * (PW + 16);
      x.fillStyle = '#0d0b09'; x.fillRect(cx, PY, PW, PH);
      let S = 5; while (S > 2 && ((sx1 - sx0) * S > PW - 20 || (sy1 - sy0) * S > PH - 70)) S--;
      const iw = (sx1 - sx0) * S, ih = (sy1 - sy0) * S, ix = cx + Math.floor((PW - iw) / 2), iy = PY + 56 + Math.floor((PH - 66 - ih) / 2);
      x.fillStyle = '#000'; x.fillRect(ix - 4, iy - 4, iw + 8, ih + 8); x.drawImage(im, sx0, sy0, sx1 - sx0, sy1 - sy0, ix, iy, iw, ih);
      x.font = `italic 17px ${serif}`; x.fillStyle = '#ad9e80'; x.textAlign = 'center';
      for (const [i, l] of wrap(x, POSE_T[p.p], PW - 30).entries()) x.fillText(l, cx + PW / 2, PY + 26 + i * 20);
      x.font = `italic 13px ${serif}`; x.fillStyle = '#6e624e'; x.textAlign = 'right'; x.fillText('×' + S, ix + iw - 6, iy + ih - 8); x.textAlign = 'left';
    }
    // right: the scale, then him in the refuge (a crop of the capture, 1:1)
    const RX = 1440, RW = 450;
    x.fillStyle = '#0d0b09'; x.fillRect(RX, PY, RW, 236);
    x.font = `14px ${serif}`; x.fillStyle = '#6e624e'; x.fillText('échelle (×2, la taille du jeu) : le héros, puis repos, parler, bête', RX + 14, PY + 22);
    x.fillStyle = '#3e362b'; x.fillRect(RX + 12, PY + 222, RW - 24, 1);
    await scale(x, d, RX + 18, PY + 222, 2, RW - 36);
    const sc = await load(d.scene), [cx0, cy0, cw, ch] = CROP, SY = PY + 250, SH = PH - 250, k = Math.min((RW) / cw, SH / ch);
    x.fillStyle = '#0d0b09'; x.fillRect(RX, SY, RW, SH);
    const vw = Math.round(cw * k), vh = Math.round(ch * k); x.imageSmoothingEnabled = true; x.drawImage(sc, cx0, cy0, cw, ch, RX + (RW - vw) / 2, SY + (SH - vh) / 2, vw, vh); x.imageSmoothingEnabled = false;
    x.font = `italic 13px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(`au refuge, près du bassin (capture du jeu, ronge-${d.n}-…-scene.png)`, RX + 10, SY + SH - 8);
    // the text: pitch, what reads, his lines
    let y = PY + PH + 48;
    x.font = `19px ${serif}`; x.fillStyle = '#cfc2a2'; for (const l of d.t.pitch) { for (const w of wrap(x, l, 1840)) { x.fillText(w, 40, y); y += 27; } }
    y += 10; x.font = `600 17px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText('Lisible', 40, y); const lw = x.measureText('Lisible  ').width; x.font = `17px ${serif}`; x.fillStyle = '#8c7e64'; x.fillText(d.t.read, 40 + lw, y);
    y += 32; x.font = `600 17px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText('Répliques (provisoires)', 40, y); const rw = x.measureText('Répliques (provisoires)  ').width;
    x.font = `italic 19px ${serif}`; x.fillStyle = '#c8a050'; x.fillText(d.t.lines.map((l) => `« ${l} »`).join('   '), 40 + rw, y);
    res.push(C.toDataURL('image/png'));
  }
  // the three side by side: in the refuge, then the three poses at the game's own scale
  {
    const [C, x] = page();
    x.fillStyle = '#cfc2a2'; x.font = `600 31px ${serif}`; x.fillText('Le Rongé — trois propositions', 40, 48);
    x.font = `15px ${serif}`; x.fillStyle = '#8c7e64'; x.textAlign = 'right';
    x.fillText('le marchand du refuge : un vampire sans maison comme le héros, affamé, à moitié goule · noms provisoires', 1880, 28);
    x.fillText('en haut la capture du jeu (1:1), en bas repos, parler et bête à la taille du jeu en 1080p (×2) · héros en rouge', 1880, 50); x.textAlign = 'left';
    const CW = 620;
    for (const d of designs) {
      const cx = 20 + (d.n - 1) * (CW + 10), sc = await load(d.scene), [cx0, cy0, cw, ch] = CROP;
      x.fillStyle = '#0d0b09'; x.fillRect(cx, 70, CW, 990);
      x.fillStyle = '#b42c1e'; x.font = `600 26px ${serif}`; x.fillText(String(d.n), cx + 16, 104); const nw = x.measureText(String(d.n)).width;
      x.fillStyle = '#cfc2a2'; x.font = `600 22px ${serif}`; x.fillText(d.name, cx + 26 + nw, 103);
      x.drawImage(sc, cx0, cy0 + 10, cw, ch - 10, cx + 30, 122, cw, ch - 10);
      // poses at x2 on one line with the hero
      const base = 122 + ch + 230; let px = cx + 20;
      const [hx0, hy0, hx1, hy1] = hero.meta.fig; x.drawImage(heroSil, hx0, hy0, hx1 - hx0 + 1, hy1 - hy0 + 1, px, base - (hy1 - hy0 + 1) * 2, (hx1 - hx0 + 1) * 2, (hy1 - hy0 + 1) * 2); px += (hx1 - hx0 + 1) * 2 + 8;
      for (const p of d.poses) { const im = await load(p.img), [sx0, sy0, sx1, sy1] = crop(p.meta), w = sx1 - sx0, h = sy1 - sy0, K = Math.min(2, (CW - 110) / 3 / w); x.drawImage(im, sx0, sy0, w, h, px, base - h * K, w * K, h * K); px += w * K + 6; }
      x.fillStyle = '#3e362b'; x.fillRect(cx + 12, base + 1, CW - 24, 1);
      let y = base + 40; x.font = `17px ${serif}`; x.fillStyle = '#ad9e80';
      for (const l of d.t.pitch) for (const w of wrap(x, l, CW - 40)) { x.fillText(w, cx + 20, y); y += 23; }
      y += 8; x.font = `italic 17px ${serif}`; x.fillStyle = '#c8a050'; for (const l of d.t.lines) for (const w of wrap(x, `« ${l} »`, CW - 40)) { x.fillText(w, cx + 20, y); y += 23; }
    }
    res.push(C.toDataURL('image/png'));
  }
  return res;
}, data);
const names = [...DESIGNS.map((d, i) => `ronge-${i + 1}-${d.key}.png`), 'ronge-planche.png'];
pages.forEach((p, i) => fs.writeFileSync(DEST + names[i], Buffer.from(p.split(',')[1], 'base64')));
await br.close();
