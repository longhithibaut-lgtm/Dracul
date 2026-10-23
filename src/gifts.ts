import { T } from './tuning.ts';

// The gifts (« Dons ») of the Rat house (Vesna la Grise), built like Hades' boons; since the expeditions replaced the
// runs, none is offered: they are toggled in the training room (docs/extraction.md: they will be the refuge's powers).
// A slot gift grafts the house's effect onto one action. A talent has no slot; some require one of the gifts listed. A
// pact (« Pacte de sang ») is a talent with a cost. A gift whose number in T.gifts is a triple has a rarity (commun,
// rare, épique) that picks one of them. What they are called and say; effects live in RoomScene, numbers in tuning.ts,
// looks in rats.ts.

export type Slot = 'griffes' | 'tir' | 'glyphe' | 'brume';
/** What a card's band and the HUD show of a gift: its slot, talent or pact. In the HUD shelf's order. */
export type Kind = Slot | 'talent' | 'pacte';
export const KINDS: Record<Kind, string> = { griffes: 'Griffes', tir: 'Tir', glyphe: 'Glyphe', brume: 'Brume', talent: 'Talent', pacte: 'Pacte' };
export const RARITY = ['Commun', 'Rare', 'Épique'];
// 7x7 icons of the kinds, on the cards and in the HUD: S silver, s grey, r and d blood.
export const ICONS: Record<Kind, string[]> = {
  griffes: [
    '..s.s.s',
    '..S.S.S',
    '.S.S.S.',
    '.S.S.S.',
    'S.S.S..',
    'r.r.r..',
    'd.d.d..',
  ],
  tir: [ // a sliver of blood flying, its point white-hot, drops left behind
    '.....SS',
    '....SrS',
    '...rrS.',
    '..rr...',
    '.d.....',
    '.......',
    'd......',
  ],
  glyphe: [ // the sigil: its ring and the fang triangle
    '..SSS..',
    '.S...S.',
    'S.rrr.S',
    'S.r.r.s',
    'S..d..s',
    '.s...s.',
    '..sss..',
  ],
  brume: [
    '.SS...S',
    'S..SSS.',
    '.......',
    'S...SS.',
    '.SSS..S',
    '.......',
    '.ss..ss',
  ],
  talent: [ // a gem, lit from the top left
    '...S...',
    '..SSS..',
    '.SSrSS.',
    'SSrdrss',
    '.Ssrss.',
    '..sss..',
    '...s...',
  ],
  pacte: [ // two fangs, blood running off them
    'S.....S',
    'SS...SS',
    '.S...S.',
    '.s...s.',
    '..r.r..',
    '...r...',
    '...d...',
  ],
};
/** La Nuée in the HUD: a rat, its eye red. */
export const SWARM_ICON = [
  '...SS..',
  '.SSSSS.',
  'SrSSSSS',
  '.SSSSSs',
  '..s.s.s',
  '......s',
  '....ss.',
];

// text: what it does at a rarity. requires: any one of these. pact: what it costs, for the rest of the run.
type Gift = { name: string; text: (rank: number) => string; slot?: Slot; requires?: readonly string[]; pact?: string };
const G = T.gifts, P = T.pacts, num = G as Record<string, unknown>;
const fr = (n: number) => String(n).replace('.', ','); // French decimals
/** A gift's number at a rarity, for its text. */
const v = (id: string, rank: number) => fr((num[id] as readonly number[])[rank]);
const plague = (id: string, r: number) => `${G.plagueMs / 1000} s après, l'ennemi perd ${v(id, r)} PV.`;
const PLAGUE = ['griffes', 'eclats', 'pestilent', 'miasme'], RATS = ['grouillantes', 'jet', 'nid', 'nuee'];
const DEFS = {
  // Slot gifts, in slot order.
  griffes: { name: 'Griffes pestilentes', slot: 'griffes', text: (r) => `Tes griffes infectent de Peste : ${plague('griffes', r)}` },
  grouillantes: { name: 'Griffes grouillantes', slot: 'griffes', text: (r) => `Ton coup final lâche ${v('grouillantes', r)} rats qui se ruent sur les ennemis.` },
  eclats: { name: 'Éclats pestilents', slot: 'tir', text: (r) => `Tes éclats infectent de Peste : ${plague('eclats', r)}` },
  jet: { name: 'Rat de jet', slot: 'tir', text: (r) => `Ton tir lance un rat qui court mordre l'ennemi visé : ${v('jet', r)} PV.` },
  nid: { name: 'Glyphe du nid', slot: 'glyphe', text: (r) => `Quand ton glyphe s'arme, ${v('nid', r)} rats en jaillissent et se ruent sur les ennemis.` },
  pestilent: { name: 'Glyphe pestilent', slot: 'glyphe', text: (r) => `Ton glyphe infecte de Peste ceux qu'il retient : ${plague('pestilent', r)}` },
  nuee: { name: 'Brume aux rats', slot: 'brume', text: (r) => `Ta brume lâche ${v('nuee', r)} rats qui se ruent sur l'ennemi le plus proche.` },
  miasme: { name: 'Brume pestilente', slot: 'brume', text: (r) => `Ta brume traverse les ennemis et les infecte : ${plague('miasme', r)}` },
  // Talents.
  rongeur: { name: 'Rongeur', text: (r) => `Le 3e coup de ton enchaînement inflige ${v('rongeur', r)} dégât de plus.` },
  perce: { name: 'Éclats rongeurs', text: () => 'Tes éclats traversent les ennemis.' },
  fuite: { name: 'Fuite du rat', text: (r) => `Ta brume se recharge ${Math.round((G.fuite[r] - 1) * 100)} % plus vite.` },
  morsure: { name: 'Morsure de rat', text: (r) => `Ta morsure rend ${v('morsure', r)} sang de plus.` },
  survivant: { name: 'Survivant', text: (r) => `+${v('survivant', r)} sang maximum, et tu regagnes ${v('survivant', r)} sang.` },
  glaneur: { name: 'Glaneur', text: (r) => `Chaque salle vidée te rend ${v('glaneur', r)} sang.` },
  // Combos: offered once one of the gifts they build on is held.
  contagion: { name: 'Contagion', requires: PLAGUE, text: () => 'Quand un ennemi pestiféré meurt, la Peste saute sur les ennemis proches.' },
  fievre: { name: 'Fièvre', requires: PLAGUE, text: (r) => `La Peste frappe ${v('fievre', r)} fois de plus, toutes les ${G.plagueMs / 1000} s.` },
  grouillement: { name: 'Grouillement', requires: RATS, text: (r) => `Tes rats survivent à leur morsure : chacun mord ${v('grouillement', r)} fois.` },
  // Pactes de sang: Vesna's darker gifts.
  maigre: { name: 'Sang maigre', pact: `${P.maigre.maxBlood} sang maximum en moins.`, text: () => `Tous tes dégâts (griffes, tir, Peste, rats) sont multipliés par ${fr(P.maigre.mult)}.` },
  noires: { name: 'Griffes noires', pact: `la lumière sacrée te brûle ${P.noires.burn} fois plus vite.`, text: () => `Tes griffes frappent ${P.noires.mult} fois plus fort.` },
  curee: { name: 'La curée', pact: `ta morsure ne soigne plus, elle te coûte ${P.curee.bite} sang.`, text: () => `Tous les ${P.curee.every} ennemis tués, tu regagnes ${P.curee.heal} sang.` },
  vermine: { name: 'Vermine', pact: `à chaque nouvelle salle, tes rats te prennent ${P.vermine.toll} sang.`, text: () => `Chaque ennemi tué lâche ${P.vermine.rats} rats sur les autres.` },
} satisfies Record<string, Gift>;
export type GiftId = keyof typeof DEFS;
type Def = Gift & { ranked: boolean }; // ranked: it has a rarity, its number in T.gifts being a triple
export const GIFTS = Object.fromEntries(Object.entries(DEFS).map(([id, g]) => [id, { ...g, ranked: Array.isArray(num[id]) }])) as Record<GiftId, Def>;
export const GIFT_IDS = Object.keys(GIFTS) as GiftId[];
/** The number of gift `id` at rarity `rank`; 0 for a gift without one. */
export const value = (id: GiftId, rank = 0) => (num[id] as readonly number[] | undefined)?.[rank] ?? 0;

export const kind = (id: GiftId): Kind => (GIFTS[id].pact ? 'pacte' : GIFTS[id].slot ?? 'talent');
/** The gifts held as the HUD shelves them: slot gifts in slot order, then talents in the order taken, then pacts. */
export const shelf = (held: readonly GiftId[]) => [...held].sort((a, b) => Object.keys(KINDS).indexOf(kind(a)) - Object.keys(KINDS).indexOf(kind(b)));
