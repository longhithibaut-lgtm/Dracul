// Le Rongé's wares (docs/extraction.md §7, docs/lore.md): what he sells for the blood banked in the basin, at prices
// growing geometrically with each rank bought, and what he says. Pure, so it can be unit tested; ronge.ts shows him and
// his panel, RoomScene decides.
import { T } from './tuning.ts';
import type { Save } from './save.ts';

export type Ware = 'bite' | 'life' | 'bag';
export const WARES: Ware[] = ['bite', 'life', 'bag'];

/** Each ware's name and what it does, as his panel shows them. */
export const WARE_TEXT: Record<Ware, { name: string; text: string }> = {
  bite: { name: 'La morsure', text: 'Mordre un humain affaibli, à genoux : boire son sang rend la vie.' },
  life: { name: `+${T.ronge.life.hp} PV max`, text: 'Plus de vie, pour toujours.' },
  bag: { name: '+ taille du sac', text: `Porter ${T.ronge.bag.size} sang et un objet de plus.` },
};

/** His lines, half-lucid: greeting, a sale, too little banked, nothing left to sell, gone beast. */
export const LINES = {
  greet: ['Encore toi... Tu sens le sang.', 'Approche. Mes dents ne mordent plus... presque plus.', 'Verse, et je me souviens.', 'Les catacombes parlent de toi.'],
  sold: ['Oui... ça me revient.', 'Prends. Avant que j\'oublie.', 'Le sang ouvre ma mémoire.'],
  poor: ['Pas assez. Il me faut plus de sang.', 'Le bassin est trop sec pour ça.', 'Reviens plus lourd.'],
  none: ['Je n\'ai plus rien à te rendre.'],
  beast: ['Grrr... sang... SANG...', 'Faim... faim...', 'Va-t\'en... ou verse.'],
};

/** How many ranks of `w` are bought in save `s`; how many are sold. */
export const owned = (s: Save, w: Ware) => (w === 'bite' ? Number(s.unlocks.bite) : s.unlocks[w]);
export const ranks = (w: Ware) => (w === 'bite' ? 1 : T.ronge[w].ranks);

/** The price of the next rank of `w` once `n` are bought: cost x mult^n (the bite: its one price), times `cut`;
 *  undefined: sold out. */
export function price(w: Ware, n: number, cut = 1) {
  if (n >= ranks(w)) return undefined;
  return Math.round((w === 'bite' ? T.ronge.bite : T.ronge[w].cost * T.ronge[w].mult ** n) * cut);
}
/** What he asks of the price: less once he was given Maître Odo (quests.ts). */
export const cut = (s: Save) => (s.quests.odo.c === 'donne' ? T.quests.odo.cut : 1);

/** Buys the next rank of `w` with the blood banked in `s` (changed in place; the caller stores it): 'sold', 'poor' (too
 *  little banked: nothing changes) or 'none' (sold out). */
export function buy(s: Save, w: Ware): 'sold' | 'poor' | 'none' {
  const p = price(w, owned(s, w), cut(s));
  if (p === undefined) return 'none';
  if (s.banked < p) return 'poor';
  s.banked -= p;
  if (w === 'bite') s.unlocks.bite = true;
  else s.unlocks[w]++;
  return 'sold';
}

/** Gone beast: back too many times without pouring blood (T.ronge.hunger; one more with Mirelle by him); never once
 *  given Maître Odo (quests.ts). */
export const beast = (s: Save) => s.quests.odo.c !== 'donne' && s.dry >= T.ronge.hunger + (s.quests.mirelle.c === 'refuge' ? 1 : 0);
/** His greetings; one more once he was given Odo. */
export const greet = (s: Save) => (s.quests.odo.c === 'donne' ? [...LINES.greet, 'Il était bon. Ne me regarde pas comme ça.'] : LINES.greet);

/** How much blood the bag holds, with its ranks bought. */
export const bagSize = (s: Save) => T.blood.bag + s.unlocks.bag * T.ronge.bag.size;
/** How many items the bag holds, with its ranks bought. */
export const itemSlots = (s: Save) => T.items.bag + s.unlocks.bag;
