// The Rat house's powers (docs/extraction.md §6: « les Dons du Rat deviennent des pouvoirs débloqués au refuge auprès
// de Vesna »): the slot gifts of gifts.ts (their effects live in RoomScene), bought for good from Vesna once she is
// freed, with the blood banked, and worn at her stall one per slot (griffes, tir, glyphe, brume), like the old Dons;
// la Nuée, the house's form of the night (R), the dearest. At their commun rarity. What she says. Pure, so it can be
// unit tested; vesna.ts shows her and her stall, RoomScene decides.
import { T } from './tuning.ts';
import { GIFTS, type GiftId, type Slot } from './gifts.ts';
import type { Save } from './save.ts';

export const SLOTS: Slot[] = ['griffes', 'tir', 'glyphe', 'brume'];
/** What she sells: two slot gifts for each slot, in slot order, then la Nuée. */
export const POWERS = ['griffes', 'grouillantes', 'eclats', 'jet', 'nid', 'pestilent', 'nuee', 'miasme', 'swarm'] as const;
export type Power = (typeof POWERS)[number];
export type Worn = Partial<Record<Slot, GiftId>>;
export const isPower = (id: unknown): id is Power => POWERS.includes(id as Power);
export const NUEE = { name: 'La Nuée', text: 'R : tu deviens une nuée de rats, rapide, que les coups traversent ; elle mord tout ce qu\'elle couvre.' };
/** Its slot (la Nuée none). */
export const slotOf = (id: Power) => (id === 'swarm' ? undefined : GIFTS[id].slot);

/** The price of `id` with the powers already bought in `s`: the slot powers geometric in how many were bought, la Nuée its own. */
export function price(s: Save, id: Power) {
  if (id === 'swarm') return T.vesna.swarm;
  return Math.round(T.vesna.cost * T.vesna.mult ** s.powers.bought.filter((p) => p !== 'swarm').length);
}

/** Buys `id` with the blood banked (changed in place; the caller stores it): 'sold' (worn at once in its slot if that is
 *  empty), 'poor' (too little banked: nothing changes) or 'owned'. */
export function buy(s: Save, id: Power): 'sold' | 'poor' | 'owned' {
  if (s.powers.bought.includes(id)) return 'owned';
  const p = price(s, id);
  if (s.banked < p) return 'poor';
  s.banked -= p;
  s.powers.bought.push(id);
  const slot = slotOf(id);
  if (slot && !s.powers.worn[slot]) s.powers.worn[slot] = id as GiftId;
  return 'sold';
}

/** Wears `id` in its slot (in place of what was there), or takes it off if it is worn; 'locked' if not bought (or la Nuée). */
export function wear(s: Save, id: Power): 'worn' | 'off' | 'locked' {
  const slot = slotOf(id);
  if (!slot || !s.powers.bought.includes(id)) return 'locked';
  if (s.powers.worn[slot] === id) {
    delete s.powers.worn[slot];
    return 'off';
  }
  s.powers.worn[slot] = id as GiftId;
  return 'worn';
}

/** The gifts worn, in slot order: what the hero sets out with. */
export const worn = (s: Save): GiftId[] => SLOTS.flatMap((k) => (s.powers.worn[k] ? [s.powers.worn[k]!] : []));
/** La Nuée bought. */
export const swarm = (s: Save) => s.powers.bought.includes('swarm');

/** Her lines (provisional, docs/lore.md's voice: a sharp old fence): greeting, a sale, too little banked, wearing. */
export const LINES = {
  greet: ['Alors, gamin, on fait affaire ?', 'Du sang frais ? Montre voir.', 'Mes rats t\'ont vu venir.'],
  sold: ['Marché conclu. Mes petits te suivront.', 'Prends. Et ne le gâche pas.'],
  poor: ['Pas de sang, pas de rats.', 'Reviens les poches pleines, gamin.'],
  worn: ['Bon choix.', 'Ça te va mieux qu\'à un noble.'],
};
