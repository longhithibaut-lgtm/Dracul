// Assembles the three boss sheets and the overview (1920x1080) from <OUT>/bNN.* (fiche.mjs) and <OUT>/sNN.png (salle.mjs),
// text via Chromium canvas. OUT=<dir> node planche.mjs -> docs/maquettes/boss-catacombes-{1-deratiseur,2-procession,3-nourrice,planche}.png
import { chromium } from 'playwright';
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname, OUT = (process.env.OUT || dir + 'out') + '/', DEST = dir + '../../../../docs/maquettes/';
const b64 = p => 'data:image/png;base64,' + fs.readFileSync(OUT + p).toString('base64');
const BOSS = [
  { file: '1-deratiseur', name: 'Le Dératiseur',
    txt: ['Le tueur de rats de l’Ordre, maître des catacombes : l’ennemi naturel de la Maison du Rat. Cuir ciré, masque à fumée, chapeau large ; sur son dos, en cage, des rats de Vesna.',
      'Phase 1 : il sème des pièges à mâchoires (des objets qui luisent à la lanterne) et harponne de loin avec son croc. Phase 2, à mi-vie : il fracasse son pot de soufre, une fumée jaune rampe et brûle ; ses cages, brisées par tes coups, lâchent des rats qui le mordent.',
      'Il fait tournoyer le pot au-dessus de sa tête : la flamme de soufre s’emballe et jaunit toute la salle, la chaîne siffle ; puis il l’abat devant lui. Le croc se lève avant le harpon.'],
    pitch: ['L’exterminateur de l’Ordre, ennemi naturel des rats, porte en cage ceux de Vesna.', 'Pièges à mâchoires et croc, puis pot de soufre brisé ; ses cages brisées lâchent des rats contre lui.', 'Le pot tournoie au-dessus de sa tête et la flamme jaunit la salle avant qu’il l’abatte.'] },
  { file: '2-procession', name: 'La Procession',
    txt: ['Une châsse géante de l’Ordre portée par quatre moines aveugles : une zone de lumière sacrée qui avance, lentement, dans les galeries. Elle brûle le vampire ; l’ombre des porteurs est le seul abri près d’elle.',
      'Phase 1 : elle marche sur toi ; on frappe les porteurs depuis leur ombre, chaque porteur tué fait pencher la châsse et basculer la lumière. Phase 2, deux porteurs morts : la châsse s’écrase, éclate et pulse par salves ; les moines restants tâtonnent vers ton bruit.',
      'Les porteurs s’arrêtent, chantent et lèvent la châsse à bout de bras ; ses lancettes s’ouvrent, la lumière enfle, puis l’éclair brûle tout ce qui n’est pas à l’ombre. La zone, c’est la vraie lumière et ses vraies ombres : rien n’est dessiné au sol.'],
    pitch: ['Une châsse géante portée par quatre moines aveugles : une zone de lumière sacrée qui marche.', 'On tue les porteurs depuis leur ombre ; à deux porteurs tombés, la châsse s’écrase et pulse.', 'Ils lèvent la châsse, les lancettes s’ouvrent, la lumière enfle : à l’ombre, vite.'] },
  { file: '3-nourrice', name: 'La Nourrice des goules',
    txt: ['Une vampire affamée devenue géante, que l’Ordre garde vivante comme chienne de garde : pieux dans les épaules, collier, sceaux d’or cloués au front et au sternum. Les jeunes goules tètent à son ventre.',
      'Phase 1 : enchaînée, sa portée s’arrête au bout des chaînes, qu’on voit au sol ; elle frappe et lâche ses goules une à une. Phase 2, à mi-vie : elle arrache ses pieux, libre, plus vive ; ses sceaux la brûlent et flambent à chaque assaut.',
      'Elle se dresse de toute sa hauteur, bras levés, mâchoire décrochée (hurlement) ; les chaînes se tendent et grincent, les sceaux s’allument d’or ; puis elle s’abat devant elle. Les goules se détachent avant qu’elle n’en lâche d’autres.'],
    pitch: ['Une vampire affamée devenue géante, enchaînée par l’Ordre, qui allaite les goules.', 'Enchaînée, sa portée s’arrête aux chaînes ; à mi-vie elle arrache ses pieux et chasse.', 'Elle se dresse, bras levés, chaînes tendues et sceaux d’or allumés, puis elle s’abat.'] },
];
const json = p => JSON.parse(fs.readFileSync(OUT + p));
const data = {
  hero: { mask: b64('b00-mask.png'), meta: json('b00.json') },
  bosses: BOSS.map((b, i) => { const t = 'b0' + (i + 1); return { ...b, n: i + 1, card: b64(t + '.png'), mask: b64(t + '-mask.png'), meta: json(t + '.json'), salle: b64('s0' + (i + 1) + '.png') }; }),
};
const br = await chromium.launch(); const pg = await br.newPage();
const pages = await pg.evaluate(async ({ hero, bosses }) => {
  const load = async s => { const im = new Image(); im.src = s; await im.decode(); return im; };
  const serif = 'Georgia, "DejaVu Serif", serif';
  const canvas = () => { const C = document.createElement('canvas'); C.width = 1920; C.height = 1080; const x = C.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#070605'; x.fillRect(0, 0, 1920, 1080); return [C, x]; };
  // a mask's grey level v becomes colour col (alpha = match)
  const sil = async (src, v, col) => { const im = await load(src); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const on = Math.abs(d.data[i] - v) < 20; d.data[i] = col[0]; d.data[i + 1] = col[1]; d.data[i + 2] = col[2]; d.data[i + 3] = on ? 255 : 0; } g.putImageData(d, 0, 0); return c; };
  const wrap = (x, t, w) => { const out = []; let line = ''; for (const word of t.split(' ')) { const s = line ? line + ' ' + word : word; if (x.measureText(s).width > w && line) { out.push(line); line = word; } else line = s; } out.push(line); return out; };
  const heroSil = await sil(hero.mask, 255, [149, 28, 24]);
  const res = [];
  for (const b of bosses) {
    const [C, x] = canvas();
    x.fillStyle = '#b42c1e'; x.font = `600 34px ${serif}`; x.fillText(String(b.n), 40, 48); const nw = x.measureText(String(b.n)).width;
    x.fillStyle = '#cfc2a2'; x.font = `600 32px ${serif}`; x.fillText(b.name, 54 + nw, 48); const tw = x.measureText(b.name).width;
    x.font = `italic 17px ${serif}`; x.fillStyle = '#8f9852'; x.fillText('gardien des catacombes · piste ' + b.n + '/3 · nom provisoire', 70 + nw + tw, 46);
    x.textAlign = 'right'; x.font = `16px ${serif}`; x.fillStyle = '#8c7e64';
    x.fillText('aucune marque au sol : le corps, la lumière qu’il porte et le son annoncent l’attaque', 1880, 30);
    x.fillText('modèles 3D posés et éclairés, réduits au pixel (même chaîne que les ennemis)', 1880, 52); x.textAlign = 'left';
    // left: the card (idle, wind-up) x2
    x.fillStyle = '#0d0b09'; x.fillRect(8, 70, 932, 566);
    const card = await load(b.card), S = Math.floor(920 / card.width); x.drawImage(card, 14, 100, card.width * S, card.height * S);
    x.font = `italic 16px ${serif}`; x.fillStyle = '#ad9e80'; x.textAlign = 'center';
    x.fillText('au repos', 14 + b.meta.fx * S, 92); x.fillText('préparation : le télégraphe', 14 + b.meta.ax * S, 92); x.textAlign = 'left';
    // right: in the prison of Vesna x2
    const sal = await load(b.salle); x.drawImage(sal, 952, 96, sal.width * 2, sal.height * 2);
    x.font = `italic 16px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText('en situation : la prison de Vesna, sa cage-reliquaire au fond (écran de jeu, vue ×2)', 960, 88);
    // bottom left: silhouettes at scale (x1.5): hero red, idle and wind-up in bone
    x.fillStyle = '#0d0b09'; x.fillRect(8, 646, 560, 426);
    const K = 1.5, base = 1040, m = b.meta;
    const iS = await sil(b.mask, 255, [124, 110, 88]), tS = await sil(b.mask, 128, [92, 82, 66]);
    const [hx0, hy0, hx1] = hero.meta.idle, hw = (hx1 - hx0 + 1) * K, hh = (hero.meta.feet - hy0 + 2) * K;
    let cx = 30; x.drawImage(heroSil, hx0, hy0, hx1 - hx0 + 1, hero.meta.feet - hy0 + 2, cx, base - hh, hw, hh); cx += hw + 14;
    for (const [S, bb] of [[iS, m.idle], [tS, m.tele]]) { const [x0, y0, x1] = bb, w = (x1 - x0 + 1) * K, h = (m.feet - y0 + 2) * K; x.drawImage(S, x0, y0, x1 - x0 + 1, m.feet - y0 + 2, cx, base - h, w, h); cx += w + 10; }
    x.fillStyle = '#3e362b'; x.fillRect(22, base + 1, 536, 1);
    x.font = `13px ${serif}`; x.fillStyle = '#6e624e'; x.fillText('échelle : le héros en rouge, le gardien au repos et dressé', 24, 668);
    // bottom right: the three paragraphs
    x.fillStyle = '#0d0b09'; x.fillRect(580, 646, 1332, 426);
    let y = 690;
    for (const [lab, t] of [['Rôle', b.txt[0]], ['Le combat', b.txt[1]], ['Lisible sans marque au sol', b.txt[2]]]) {
      x.font = `600 21px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(lab, 604, y); y += 31;
      x.font = `20px ${serif}`; x.fillStyle = '#8c7e64'; for (const l of wrap(x, t, 1280)) { x.fillText(l, 604, y); y += 28; } y += 22;
    }
    res.push(C.toDataURL('image/png'));
  }
  // overview: the three side by side
  const [C, x] = canvas();
  x.fillStyle = '#cfc2a2'; x.font = `600 32px ${serif}`; x.fillText('Le gardien des catacombes — trois pistes', 40, 50);
  x.textAlign = 'right'; x.font = `16px ${serif}`; x.fillStyle = '#8c7e64'; x.fillText('à choisir · noms provisoires · détails sur les planches 1 à 3 · images ×1', 1880, 46); x.textAlign = 'left';
  for (let k = 0; k < 3; k++) {
    const b = bosses[k], x0 = k * 640;
    x.fillStyle = '#0d0b09'; x.fillRect(x0 + 6, 72, 628, 1000);
    x.fillStyle = '#b42c1e'; x.font = `600 28px ${serif}`; x.fillText(String(b.n), x0 + 24, 110); const nw = x.measureText(String(b.n)).width;
    x.fillStyle = '#cfc2a2'; x.font = `600 25px ${serif}`; x.fillText(b.name, x0 + 36 + nw, 109);
    const card = await load(b.card), sal = await load(b.salle);
    x.drawImage(card, x0 + 320 - card.width / 2, 130 + (260 - card.height) / 2); x.drawImage(sal, x0 + 80, 404);
    let y = 712;
    for (const [lab, t] of [['Rôle', b.pitch[0]], ['Combat', b.pitch[1]], ['Télégraphe', b.pitch[2]]]) {
      x.font = `600 17px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(lab, x0 + 26, y); y += 25;
      x.font = `17px ${serif}`; x.fillStyle = '#8c7e64'; for (const l of wrap(x, t, 586)) { x.fillText(l, x0 + 26, y); y += 23; } y += 16;
    }
  }
  res.push(C.toDataURL('image/png'));
  return res;
}, data);
const names = [...BOSS.map(b => b.file), 'planche'];
pages.forEach((p, i) => fs.writeFileSync(DEST + 'boss-catacombes-' + names[i] + '.png', Buffer.from(p.split(',')[1], 'base64')));
await br.close();
