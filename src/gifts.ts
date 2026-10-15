import { T } from './tuning.ts';

// The gifts (« Dons ») of the Rat house (Vesna la Grise), built like Hades' boons. A slot gift grafts the house's
// effect onto one action: at most one per slot, and a new one replaces it (see take() in logic.ts). A talent has no
// slot and stacks; some are only offered once one of the gifts they require is held. What they are called and say;
// effects live in RoomScene, numbers in tuning.ts, looks in rats.ts.

export type Slot = 'griffes' | 'tir' | 'glyphe' | 'brume';
/** What a card's band and the HUD show of a gift: its slot, or talent. In the HUD shelf's order. */
export type Kind = Slot | 'talent';
export const KINDS: Record<Kind, string> = { griffes: 'Griffes', tir: 'Tir', glyphe: 'Glyphe', brume: 'Brume', talent: 'Talent' };
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
};

type Gift = { name: string; text: string; slot?: Slot; requires?: readonly string[] }; // requires: any one of these
const G = T.gifts, rats = `${G.rats} rats`;
const DEFS = {
  // Slot gifts, in slot order.
  griffes: { name: 'Griffes pestilentes', slot: 'griffes', text: 'Tes griffes infectent de Peste.' },
  eclats: { name: 'Éclats pestilents', slot: 'tir', text: 'Tes éclats infectent de Peste.' },
  nid: { name: 'Glyphe du nid', slot: 'glyphe', text: `Quand ton glyphe s'arme, ${rats} en jaillissent et se ruent sur les ennemis.` },
  nuee: { name: 'Nuée', slot: 'brume', text: `Ta brume lâche ${rats} qui se ruent sur l'ennemi le plus proche.` },
  // Talents.
  rongeur: { name: 'Rongeur', text: `Le 3e coup de ton enchaînement inflige ${G.gnaw} dégât de plus.` },
  perce: { name: 'Éclats rongeurs', text: 'Tes éclats traversent les ennemis.' },
  fuite: { name: 'Fuite du rat', text: `Ta brume se recharge ${Math.round((G.dashRecharge - 1) * 100)} % plus vite.` },
  morsure: { name: 'Morsure de rat', text: `Ta morsure rend ${G.bite} sang de plus.` },
  survivant: { name: 'Survivant', text: `+${G.blood} sang maximum, et tu regagnes ${G.blood} sang.` },
  contagion: { name: 'Contagion', requires: ['griffes', 'eclats'], text: 'Quand un ennemi pestiféré meurt, la Peste saute sur les ennemis proches.' },
} satisfies Record<string, Gift>;
export type GiftId = keyof typeof DEFS;
export const GIFTS: Record<GiftId, Gift> = DEFS;
export const GIFT_IDS = Object.keys(GIFTS) as GiftId[];

export const kind = (id: GiftId): Kind => GIFTS[id].slot ?? 'talent';
/** The gifts held as the HUD shelves them: slot gifts in slot order, then talents in the order taken. */
export const shelf = (held: readonly GiftId[]) => [...held].sort((a, b) => Object.keys(KINDS).indexOf(kind(a)) - Object.keys(KINDS).indexOf(kind(b)));
/** The line of a card whose gift would replace `old`; the name never breaks across lines. */
export const replacing = (old: GiftId) => `Remplace : ${GIFTS[old].name.replaceAll(' ', ' ')}`;
