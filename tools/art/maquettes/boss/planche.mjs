// Assembles the three boss sheets and the overview (1920x1080) from <OUT>/bNN.* (fiche.mjs) and <OUT>/sNN.png (salle.mjs),
// text via Chromium canvas. OUT=<dir> node planche.mjs -> docs/maquettes/boss-catacombes-{1-deratiseur,2-procession,3-nourrice,planche}.png
// SET=nourrice (from nNN / tNN): docs/maquettes/boss-nourrice-{A-araignee,B-matrice,C-sainte,D-emmuree,planche}.png
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
const NOUR = [
  { file: 'A-araignee', n: 'A', name: 'L’Araignée',
    txt: ['La Nourrice étirée jusqu’à l’os, avec trop d’articulations, perchée sur quatre membres comme une araignée au-dessus du héros. Sa tête pend à l’envers sous les épaules, les cheveux jusqu’au sol ; des laisses de l’Ordre, cassées, pendent de son collier et de ses poignets. Des goules s’accrochent à ses membres.',
      'Phase 1 : elle enjambe la salle, vite, et se laisse tomber sur toi ; à chaque pas une goule lâche prise et tombe. Frapper ses articulations la fait boiter. Phase 2, à mi-vie : elle grimpe au mur d’ossuaire et sous la voûte, et se laisse tomber d’en haut : on l’entend craquer au-dessus, ses cheveux pendent avant la chute.',
      'Elle se cabre : le corps s’écrase vers le sol, les deux membres avant se dressent très haut, griffes ouvertes au-dessus de toi, la tête se retourne et la mâchoire se décroche ; ses articulations craquent l’une après l’autre. Puis elle s’abat de tout son poids.'],
    pitch: ['Étirée, trop d’articulations, perchée comme une araignée au-dessus du héros, tête à l’envers, laisses de l’Ordre cassées.', 'Elle enjambe la salle et tombe sur toi en semant ses goules ; à mi-vie, elle passe au mur et à la voûte.', 'Elle se cabre : corps au sol, membres avant dressés très haut, articulations qui craquent, puis elle s’abat.'] },
  { file: 'B-matrice', n: 'B', name: 'La Matrice',
    txt: ['Attachée en croix sur une roue de supplice de l’Ordre, pendue à la voûte par deux chaînes. Son ventre est un sac énorme et translucide où des goules se tordent comme des larves ; des cordons ombilicaux la relient aux goules qui rampent autour d’elle.',
      'Phase 1 : la roue se balance d’un bout à l’autre de la salle et la fait passer à travers ; couper un cordon affame sa goule et la fait hurler. Phase 2, à mi-vie : la roue tourne sur elle-même, le sac se déchire et lâche des portées entières ; les cordons fouettent autour d’elle.',
      'La roue recule d’un coup et tourne d’un cran (cliquet, chaînes qui grincent) ; le sac s’allume de l’intérieur et l’on voit les larves se tordre ; les cordons se tendent. Puis elle revient en balancier.'],
    pitch: ['En croix sur une roue de l’Ordre pendue à la voûte, un ventre-sac translucide plein de larves de goules.', 'La roue balance à travers la salle ; couper les cordons ; à mi-vie le sac se déchire et lâche des portées.', 'La roue recule et tourne d’un cran, le sac s’allume de l’intérieur, les cordons se tendent : le balancier arrive.'] },
  { file: 'C-sainte', n: 'C', name: 'La Sainte',
    txt: ['L’Ordre a fait d’elle un reliquaire vivant : corset-cage de fer, sceaux d’or cloués, cierges plantés dans les épaules et sur une auréole de pointes. La lumière sacrée fuit de ses plaies, de ses paumes et de ses yeux brûlés, et la brûle autant que toi. Une icône blasphématoire.',
      'Phase 1 : elle avance lentement et sa lumière brûle autour d’elle ; on frappe de dos, ou dans les ombres que jettent les barreaux de sa cage. Phase 2, à mi-vie : la cage éclate, les plaies s’ouvrent en grand, la lumière ne s’éteint plus et elle se consume : la tuer vite.',
      'Elle ouvre les bras, renverse la tête, ses plaies se fendent et la lumière enfle, les cierges crépitent ; les barreaux de sa cage jettent au sol des rais d’ombre, la seule protection contre l’éclat : c’est la vraie lumière, rien n’est dessiné au sol.'],
    pitch: ['Un reliquaire vivant : corset-cage, sceaux, cierges plantés en elle, une auréole de pointes ; la lumière fuit de ses plaies.', 'Sa lumière brûle autour d’elle ; on frappe de dos ou dans l’ombre de ses barreaux ; à mi-vie, elle se consume.', 'Bras ouverts, tête renversée, les plaies se fendent : l’éclat, avec pour seul abri les ombres de sa cage.'] },
  { file: 'D-emmuree', n: 'D', name: 'L’Emmurée',
    txt: ['À moitié prise dans le mur d’ossuaire de la salle : un torse immense et deux bras sortent d’une brèche dans les crânes, enchaînés au mur par l’Ordre, des sceaux d’or tout autour. Des goules sortent en rampant des trous du mur.',
      'Phase 1 : elle ne bouge pas, mais ses bras couvrent toute la salle : balayages et mains écrasées ; les goules sortent des trous du mur. Phase 2, à mi-vie : elle s’arrache du mur et rampe sur ses bras en traînant un bas du corps décharné ; le mur s’effondre derrière elle.',
      'Elle arme un bras très haut en arrière, le torse tourné, la mâchoire ouverte ; les os du mur craquent et pleuvent, les sceaux du mur s’allument d’or ; puis le bras balaie la salle. Le bras resté au sol est celui qui écrasera ensuite.'],
    pitch: ['Un torse et des bras immenses sortent d’une brèche du mur d’ossuaire, enchaînés ; des goules sortent des trous.', 'Immobile mais ses bras couvrent la salle ; à mi-vie, elle s’arrache du mur et rampe.', 'Un bras armé très haut, les os du mur pleuvent, les sceaux s’allument : le balayage arrive.'] },
];
const NOU = process.env.SET === 'nourrice', LIST = NOU ? NOUR : BOSS.map((b, i) => ({ ...b, n: String(i + 1) }));
const json = p => JSON.parse(fs.readFileSync(OUT + p));
const data = {
  hero: { mask: b64('b00-mask.png'), meta: json('b00.json') },
  bosses: LIST.map((b, i) => { const t = (NOU ? 'n0' : 'b0') + (i + 1); return { ...b, sub: NOU ? 'gardien des catacombes · variante ' + b.n + '/4 · nom provisoire' : 'gardien des catacombes · piste ' + b.n + '/3 · nom provisoire', card: b64(t + '.png'), mask: b64(t + '-mask.png'), meta: json(t + '.json'), salle: b64((NOU ? 't0' : 's0') + (i + 1) + '.png') }; }),
  title: NOU ? 'La Nourrice des goules — quatre variantes' : 'Le gardien des catacombes — trois pistes',
  note: NOU ? 'à choisir · noms provisoires · détails sur les planches A à D · images ×1' : 'à choisir · noms provisoires · détails sur les planches 1 à 3 · images ×1',
};
const br = await chromium.launch(); const pg = await br.newPage();
const pages = await pg.evaluate(async ({ hero, bosses, title, note }) => {
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
    x.font = `italic 17px ${serif}`; x.fillStyle = '#8f9852'; x.fillText(b.sub, 70 + nw + tw, 46);
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
    const m = b.meta, base = 1040, K = Math.min(1.5, 470 / (m.idle[2] - m.idle[0] + m.tele[2] - m.tele[0] + 40 + hero.meta.idle[2] - hero.meta.idle[0])); // fit the panel
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
  x.fillStyle = '#cfc2a2'; x.font = `600 32px ${serif}`; x.fillText(title, 40, 50);
  x.textAlign = 'right'; x.font = `16px ${serif}`; x.fillStyle = '#8c7e64'; x.fillText(note, 1880, 46); x.textAlign = 'left';
  const cw = 1920 / bosses.length;
  for (let k = 0; k < bosses.length; k++) {
    const b = bosses[k], x0 = k * cw;
    x.fillStyle = '#0d0b09'; x.fillRect(x0 + 6, 72, cw - 12, 1000);
    x.fillStyle = '#b42c1e'; x.font = `600 28px ${serif}`; x.fillText(String(b.n), x0 + 24, 110); const nw = x.measureText(String(b.n)).width;
    x.fillStyle = '#cfc2a2'; x.font = `600 25px ${serif}`; x.fillText(b.name, x0 + 36 + nw, 109);
    const card = await load(b.card), sal = await load(b.salle);
    x.drawImage(card, x0 + cw / 2 - card.width / 2, 130 + (260 - card.height) / 2); x.drawImage(sal, x0 + cw / 2 - sal.width / 2, 404);
    let y = 712;
    for (const [lab, t] of [['Rôle', b.pitch[0]], ['Combat', b.pitch[1]], ['Télégraphe', b.pitch[2]]]) {
      x.font = `600 17px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(lab, x0 + 26, y); y += 25;
      x.font = `17px ${serif}`; x.fillStyle = '#8c7e64'; for (const l of wrap(x, t, cw - 54)) { x.fillText(l, x0 + 26, y); y += 23; } y += 16;
    }
  }
  res.push(C.toDataURL('image/png'));
  return res;
}, data);
const names = [...LIST.map(b => b.file), 'planche'];
pages.forEach((p, i) => fs.writeFileSync(DEST + (NOU ? 'boss-nourrice-' : 'boss-catacombes-') + names[i] + '.png', Buffer.from(p.split(',')[1], 'base64')));
await br.close();
