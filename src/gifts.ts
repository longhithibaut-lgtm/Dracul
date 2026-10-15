import { T } from './tuning.ts';

// The gifts of the Rat house (Vesna la Grise): what they are called and say. Effects live in RoomScene, numbers in
// tuning.ts, looks in rats.ts. Each can be taken once per run.

export type Slot = 'griffes' | 'brume' | 'morsure' | 'passif';
export const SLOTS: Record<Slot, string> = { griffes: 'Griffes', brume: 'Brume', morsure: 'Morsure', passif: 'Passif' };
// 7x7 icons of the slots, on the cards and in the HUD: S silver, s grey, r and d blood.
export const SLOT_ICONS: Record<Slot, string[]> = {
  griffes: [
    '..s.s.s',
    '..S.S.S',
    '.S.S.S.',
    '.S.S.S.',
    'S.S.S..',
    'r.r.r..',
    'd.d.d..',
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
  morsure: [
    'SSSSSSS',
    'SS...SS',
    '.S...S.',
    '.S...S.',
    '.S...r.',
    '.....r.',
    '.....d.',
  ],
  passif: [
    '...r...',
    '..rrr..',
    '.rrrrr.',
    'rSrrrrd',
    'rrrrrrd',
    '.rrrrd.',
    '..ddd..',
  ],
};

const G = T.gifts;
export const GIFTS = {
  griffes: { name: 'Griffes pestilentes', slot: 'griffes', text: `Tes coups infectent\u00a0: l'ennemi perd ${G.plagueDamage}\u00a0PV de plus ${G.plagueMs / 1000}\u00a0s après.` },
  nuee: { name: 'Nuée', slot: 'brume', text: `Ta brume lâche ${G.rats}\u00a0rats qui se ruent sur l'ennemi le plus proche.` },
  fuite: { name: 'Fuite du rat', slot: 'brume', text: `Ta brume se recharge ${Math.round((G.dashRecharge - 1) * 100)}\u00a0% plus vite.` },
  rongeur: { name: 'Rongeur', slot: 'griffes', text: `Le 3e coup de ton enchaînement inflige ${G.gnaw}\u00a0dégât de plus.` },
  morsure: { name: 'Morsure de rat', slot: 'morsure', text: `Ta morsure rend ${G.bite}\u00a0sang de plus.` },
  survivant: { name: 'Survivant', slot: 'passif', text: `+${G.blood}\u00a0sang maximum, et tu regagnes ${G.blood}\u00a0sang.` },
} as const satisfies Record<string, { name: string; slot: Slot; text: string }>;
export type GiftId = keyof typeof GIFTS;
export const GIFT_IDS = Object.keys(GIFTS) as GiftId[];
