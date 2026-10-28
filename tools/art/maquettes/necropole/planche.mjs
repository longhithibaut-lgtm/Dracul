// Assembles the three sheets of necropolis foes (1920x1080, five cards each) from <OUT>/fNN.* (fiche.mjs), text via
// Chromium canvas. OUT=<dir> node planche.mjs -> docs/maquettes/necropole-ennemis-planche-{1,2,3}.png
import { chromium } from 'playwright';
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname, OUT = (process.env.OUT || dir + 'out') + '/', DEST = dir + '../../../../docs/maquettes/';
const b64 = p => 'data:image/png;base64,' + fs.readFileSync(OUT + p).toString('base64');
// n: name, kind, zone, then the role, the fight (how to beat or avoid it), what reads without a floor mark
const T = {
  1: ['Les Corneilles', 'créatures · nuée', 'le champ des tombes',
    'Sentinelles : elles picorent les morts ; si elles te voient, elles s’envolent en criant et toute la nécropole t’entend.',
    'Elles fondent en nuée et arrachent du sang à petits coups ; on ne les tue pas une à une : passer loin, dans l’ombre, ou les disperser d’un grand coup.',
    'Toutes les têtes se lèvent vers toi d’un coup, puis les ailes s’ouvrent : le cri monte avant l’envol.'],
  2: ['L’Enterré', 'créature · piège', 'le champ des tombes, les tombes ouvertes',
    'Un mort à fleur de terre sur sa butte, qu’on prend pour un cadavre de plus.',
    'Il saisit la cheville de qui marche sur sa tombe et le tire sous terre ; il ne poursuit pas : contourner les buttes, frapper quand ses bras sont sortis.',
    'Les doigts grattent, la butte se fend en craquant ; il se dresse jusqu’à la taille, bras lancés au ras du sol.'],
  3: ['Le Mendiant', 'créature · leurre', 'le champ des tombes, près de la crypte',
    'Un vampire affamé à genoux, qui tend un crâne pour coupe et supplie qu’on lui donne du sang.',
    'Approché, il bondit, mord, boit le sang que tu portes et s’enfuit entre les tombes ; frapper le premier, ou lui jeter du sang pour qu’il se détourne.',
    'La voix se tait, la coupe tombe, la capuche glisse : deux braises rouges s’allument.'],
  4: ['La Pêcheuse', 'créature · embuscade', 'l’allée des mausolées',
    'Couchée derrière une stèle, elle pend sa lueur là où brûlerait une bougie de tombe.',
    'Elle avale d’un coup ce qui s’approche de la lueur ; lente une fois sortie : la contourner, frapper ses flancs. Sa lueur te montre aussi à l’Ordre.',
    'La lueur ne vacille pas comme une flamme ; avant la gueule, elle part en arrière et la terre glisse de son dos.'],
  5: ['Le Gavé', 'créature · charognard', 'le champ de fosses',
    'Il mange les morts, ceux de la nécropole et ceux que tu laisses derrière toi, et grossit à chaque repas.',
    'Chaque corps avalé le soigne et l’enfle ; il vomit une bile noire qui ronge, en cône devant lui. Le tuer avant qu’il mange, ou lui ôter ses corps.',
    'Il se redresse en arrière, le ventre se soulève, la gorge gonfle avec un bruit de reflux : la bile vient ensuite.'],
  6: ['Le Fouisseur', 'créature · aveugle, chasse au bruit', 'les murs d’ossements, les éboulis',
    'Aveugle : courir, frapper, fouiller une cache l’attirent ; marcher lentement le perd. Une bête à fuir tant qu’il écoute.',
    'Il creuse vers le dernier bruit et ressort sous toi, ses deux pelles levées ; il met du temps à se dégager : c’est là qu’on frappe.',
    'L’étoile de chair de son museau s’ouvre et frémit ; sous terre, le grattement s’arrête net, puis il se dresse, pelles levées.'],
  7: ['La Chose du gouffre', 'créature · on ne la tue pas', 'le gouffre et le pont',
    'Elle vit sous le pont : deux mains géantes agrippées au bord, une tête qui regarde par-dessus.',
    'Elle balaie le tablier d’un bras et jette au gouffre ce qu’elle touche ; passer entre deux coups, ou frapper ses doigts : elle lâche et replonge un temps. Ou prendre la chaussée.',
    'La tête monte au-dessus du bord, la mâchoire tombe ; un bras se dresse très haut, les ongles raclent la pierre avant le coup.'],
  8: ['La Pleureuse', 'créature · traqueuse', 'l’allée des mausolées',
    'Une statue voilée qui ne bouge que lorsque aucune lumière n’est sur elle.',
    'Dans ta lanterne, elle est pierre ; dans l’ombre, elle avance, et l’ombre est là où tu te caches : choisir entre se cacher et la garder dans la lumière.',
    'La pierre craque quand la lumière la quitte ; ses mains s’écartent du visage, la tête se couche sur l’épaule.'],
  9: ['Le Fossoyeur', 'Ordre · porte-lumière', 'le champ des tombes',
    'Sa lanterne de l’Ordre, au bout d’une perche, chasse l’ombre où tu te caches, et sa flaque verte brûle.',
    'Il enterre les morts dont tu te nourris et frappe du plat de la pelle ; un coup sur la lanterne la brise : dans le noir, il appelle à l’aide.',
    'La pelle remonte derrière l’épaule, la perche penche et la lanterne se balance vers toi : la lumière arrive avant le coup.'],
  10: ['Le Chaulier', 'Ordre · zone', 'le champ de fosses',
    'Il jette la chaux vive sur les fosses communes ; blanc de la tête aux pieds, on le voit de loin dans le noir.',
    'Sa pelletée laisse un nuage blanc qui brûle, aveugle et reste là un moment ; frapper quand il replonge la pelle dans son sac.',
    'Il plonge la pelle dans le sac, puis l’arme haut derrière l’épaule, la chaux qui coule en filet.'],
  11: ['Le Crocheteur', 'Ordre · piégeur', 'les murs d’ossements, la chaussée',
    'Il jette un filet lesté et traîne sa prise à la gaffe jusqu’aux autres, ou jusqu’au bûcher du camp.',
    'Pris, il faut se débattre ; le filet ne part qu’en ligne droite : un pas de côté au dernier moment, puis frapper pendant qu’il le ramasse.',
    'Le filet tourne ouvert au-dessus de sa tête comme une roue noire ; les plombs sifflent.'],
  12: ['Le Tireur du mausolée', 'Ordre · tireur', 'l’allée des mausolées, sur les toits',
    'Posté sur les toits, une balle d’argent : un seul coup, qui fait très mal.',
    'Longue recharge : couper la ligne de tir derrière une tombe, puis l’approcher pendant qu’il bourre son arme.',
    'La braise de sa mèche se voit dans le noir ; il pose un genou, le canon sur la fourche, et souffle sur la braise qui rougit.'],
  13: ['Le Miroitier', 'Ordre · lumière', 'la brèche de l’Aube',
    'Avec un grand miroir de bronze, il renvoie l’Aube de la brèche dans l’ombre : la lumière qui brûle te suit.',
    'Loin du jour il est sans arme ; près de la brèche, rester hors de la ligne entre l’Aube et lui, l’approcher par l’ombre, briser le miroir.',
    'Le miroir monte au-dessus de sa tête et s’embrase d’or, puis le rai tombe : de la vraie lumière, rien n’est dessiné au sol.'],
  14: ['Le Tombeur', 'Ordre · brute', 'les tombes ouvertes',
    'Il plante des pieux dans les morts pour qu’ils restent couchés ; avec toi, il fait pareil.',
    'Il charge en ligne droite, pieu en avant ; s’il te touche, il te cloue au sol et il faut se débattre. Il tourne lentement : passer de côté, frapper dans le dos.',
    'Il se ramasse pour charger, le pieu pointé sur toi, le maillet levé haut derrière la tête.'],
  15: ['Le Porte-dalle', 'Ordre · bouclier', 'le pont et la chaussée',
    'Une pierre tombale sanglée au bras pour bouclier : de face, rien ne passe.',
    'Sur le pont et la chaussée, il pousse ce qui est devant lui dans le gouffre ; lent à tourner : le contourner, frapper dans le dos, jamais au bord.',
    'Il cale la dalle à l’épaule, les pieds en arrière ; la pierre racle le sol avant la charge.'],
};
const SHEETS = [[[1, 2, 3], [4, 5]], [[6, 7], [8, 9, 10]], [[11, 12, 13], [14, 15]]];
const json = p => JSON.parse(fs.readFileSync(OUT + p));
const card = n => { const t = 'f' + String(n).padStart(2, '0'); return { n, t: T[n], img: b64(t + '.png'), mask: b64(t + '-mask.png'), meta: json(t + '.json') }; };
const data = { hero: { mask: b64('f00-mask.png'), meta: json('f00.json') }, sheets: SHEETS.map(rows => rows.map(r => r.map(card))) };

const br = await chromium.launch(); const pg = await br.newPage();
const pages = await pg.evaluate(async ({ hero, sheets }) => {
  const load = async s => { const im = new Image(); im.src = s; await im.decode(); return im; };
  const serif = 'Georgia, "DejaVu Serif", serif';
  const sil = async (src, v, col) => { const im = await load(src); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const on = Math.abs(d.data[i] - v) < 20; d.data[i] = col[0]; d.data[i + 1] = col[1]; d.data[i + 2] = col[2]; d.data[i + 3] = on ? 255 : 0; } g.putImageData(d, 0, 0); return c; };
  const wrap = (x, t, w) => { const out = []; let line = ''; for (const word of t.split(' ')) { const s = line ? line + ' ' + word : word; if (x.measureText(s).width > w && line) { out.push(line); line = word; } else line = s; } out.push(line); return out; };
  const heroSil = await sil(hero.mask, 255, [149, 28, 24]);
  const res = [];
  for (let si = 0; si < sheets.length; si++) {
    const C = document.createElement('canvas'); C.width = 1920; C.height = 1080; const x = C.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#070605'; x.fillRect(0, 0, 1920, 1080);
    x.fillStyle = '#cfc2a2'; x.font = `600 31px ${serif}`; x.fillText(`La nécropole — ennemis proposés, planche ${si + 1}/3`, 40, 46);
    x.font = `15px ${serif}`; x.fillStyle = '#8c7e64'; x.textAlign = 'right';
    x.fillText('à gauche au repos, à droite l’attaque qui s’annonce : le corps, la lumière qu’il porte et le son, aucune marque au sol', 1880, 28);
    x.fillText('vue ×2, l’échelle du jeu en 1080p (×3 : les plus petits) · héros en rouge · noms provisoires', 1880, 50); x.textAlign = 'left';
    const Y0 = 66, RH = 504;
    for (let ri = 0; ri < 2; ri++) {
      const row = sheets[si][ri], cw = 1920 / row.length;
      for (let k = 0; k < row.length; k++) {
        const c = row[k], cx = k * cw, cy = Y0 + ri * (RH + 4), [name, kind, zone, role, fight, tell] = c.t;
        x.fillStyle = '#0d0b09'; x.fillRect(cx + 6, cy, cw - 12, RH);
        // title: number, name, kind; the zone under it
        x.fillStyle = '#b42c1e'; x.font = `600 28px ${serif}`; x.fillText(String(c.n), cx + 20, cy + 33); const nw = x.measureText(String(c.n)).width;
        x.fillStyle = '#cfc2a2'; x.font = `600 24px ${serif}`; x.fillText(name, cx + 30 + nw, cy + 32); const tw = x.measureText(name).width;
        x.font = `italic 15px ${serif}`; x.fillStyle = kind.startsWith('Ordre') ? '#ad9e80' : '#8f9852'; x.fillText(kind, cx + 42 + nw + tw, cy + 31);
        x.font = `italic 14px ${serif}`; x.fillStyle = '#7d8a5a'; x.fillText('où : ' + zone, cx + 24, cy + 53);
        // the text block (measured first: the image gets what is left)
        const TW = cw - 50, lines = [];
        for (const [lab, t] of [['Rôle', role], ['Combat', fight], ['Lisible', tell]]) { x.font = `600 16px ${serif}`; const lw = x.measureText(lab + '  ').width; x.font = `16px ${serif}`; const ls = wrap(x, t, TW - lw); ls.forEach((l, i) => lines.push([i ? '' : lab, l, lw])); }
        const LH = 21, textH = lines.length * LH + 8, ty0 = cy + RH - textH;
        // the card image, cropped round what it shows, at the largest whole scale that fits beside the scale panel
        const im = await load(c.img), m = c.meta, [ax0, ay0, ax1, ay1] = m.all, pad = 5;
        const sx0 = Math.max(0, ax0 - pad - 4), sy0 = Math.max(0, ay0 - 8), sx1 = Math.min(m.W, ax1 + pad + 5), sy1 = Math.min(m.H, Math.max(ay1, m.feet) + 8);
        const PW = 150, IT = cy + 80, boxW = cw - 36 - PW, boxH = ty0 - IT - 4;
        let S = 3; while (S > 1 && ((sx1 - sx0) * S > boxW || (sy1 - sy0) * S > boxH)) S--; // x2: the game's own scale on a 1080p screen; x3 when it fits
        const iw = (sx1 - sx0) * S, ih = (sy1 - sy0) * S, ix = cx + 18 + Math.floor((boxW - iw) / 2), iy = IT + Math.max(0, Math.floor((boxH - ih) / 2));
        x.fillStyle = '#000'; x.fillRect(ix - 4, iy - 4, iw + 8, ih + 8);
        x.drawImage(im, sx0, sy0, sx1 - sx0, sy1 - sy0, ix, iy, iw, ih);
        x.font = `italic 13px ${serif}`; x.fillStyle = '#8c7e64';
        if (S !== 2) { x.textAlign = 'right'; x.fillText('vue ×' + S, ix + iw - 6, iy + 16); }
        x.textAlign = 'center';
        x.fillText('au repos', ix + (m.fx - sx0) * S, Math.max(iy - 9, cy + 74)); x.fillText('l’attaque s’annonce', ix + (m.ax - sx0) * S, Math.max(iy - 9, cy + 74)); x.textAlign = 'left';
        // the scale panel: the hero in red, the foe at rest and winding up, feet on one line
        const px0 = cx + cw - 14 - PW, base = ty0 - 14;
        x.fillStyle = '#3e362b'; x.fillRect(px0, base + 1, PW - 4, 1);
        x.font = `13px ${serif}`; x.fillStyle = '#6e624e'; x.textAlign = 'center'; x.fillText('échelle', px0 + PW / 2, IT - 8); x.textAlign = 'left';
        const iS = await sil(c.mask, 255, [124, 110, 88]), tS = await sil(c.mask, 128, [92, 82, 66]);
        const [hx0, hy0, hx1] = hero.meta.idle, hw = hx1 - hx0 + 1, hh = hero.meta.feet - hy0 + 2;
        const ws = [m.idle, m.tele].map(bb => bb[2] - bb[0] + 1), hs = [m.idle, m.tele].map(bb => m.feet - bb[1] + 2);
        const K = Math.min(1.5, (PW - 16) / (hw + ws[0] + ws[1] + 8), (base - cy - 70) / Math.max(hh, ...hs));
        let px = px0 + 2; x.drawImage(heroSil, hx0, hy0, hw, hh, px, base - hh * K, hw * K, hh * K); px += hw * K + 3;
        [[iS, m.idle], [tS, m.tele]].forEach(([S2, bb], i) => { x.drawImage(S2, bb[0], bb[1], ws[i], hs[i], px, base - hs[i] * K, ws[i] * K, hs[i] * K); px += ws[i] * K + 3; });
        // the lines
        let y = ty0 + 14;
        for (const [lab, l, lw] of lines) { if (lab) { x.font = `600 16px ${serif}`; x.fillStyle = '#ad9e80'; x.fillText(lab, cx + 24, y); } x.font = `16px ${serif}`; x.fillStyle = '#8c7e64'; x.fillText(l, cx + 24 + lw, y); y += LH; }
      }
    }
    res.push(C.toDataURL('image/png'));
  }
  return res;
}, data);
pages.forEach((p, i) => fs.writeFileSync(DEST + `necropole-ennemis-planche-${i + 1}.png`, Buffer.from(p.split(',')[1], 'base64')));
await br.close();
