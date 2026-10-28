// The training panel's « Mode test » (training.ts): shortcuts through the progression, straight on the real save
// (changed in place; the caller stores it), and the places it drops the hero at. Pure, so it can be unit tested.
import { T } from './tuning.ts';
import { ZONES } from './world.ts';
import { ITEM_IDS, type Item, type ItemId } from './items.ts';
import { POWERS, slotOf, type Power } from './powers.ts';
import type { GiftId, Slot } from './gifts.ts';
import type { LayoutId } from './room.ts';
import type { Save } from './save.ts';

/** Every shortcut of the zones (not the arenas' grilles: a fight shuts those). */
export const SHORTCUTS = [...new Set(Object.values(ZONES).flatMap((Z) => Z.GATES.filter((g) => !g.arena).map((g) => g.id)))];

/** Where « Aller à » drops him, on an expedition of its own (none: the place's own start). */
export const PLACES: [string, LayoutId, { x: number; y: number }?][] = [
  ['Le refuge', 'refuge'],
  ['Nécropole : l\'escalier', 'necropolis'],
  ['Nécropole : l\'autre bout', 'necropolis', { x: 3200, y: 350 }],
  ['Nécropole : le puits', 'necropolis', { x: 3700, y: 1236 }],
  ['Catacombes : pied du puits', 'catacombs'],
  ['Catacombes : le nid', 'catacombs', { x: 604, y: 610 }],
  ['Catacombes : devant la prison', 'catacombs', { x: 2350, y: 1010 }],
  ['La crypte', 'hall'], ['La nef', 'nave'], ['L\'ossuaire', 'ossuary'], ['La chapelle', 'chapel'], ['Le cloître', 'cloister'],
];

/** Le Rongé's ranks of `w` set to `n` (within what he sells). */
export function rank(s: Save, w: 'life' | 'bag', n: number) {
  s.unlocks[w] = Math.max(0, Math.min(T.ronge[w].ranks, Math.floor(n)));
}
/** All le Rongé sells: the bite, every rank. */
export function ronge(s: Save) {
  s.unlocks.bite = true;
  rank(s, 'life', Infinity);
  rank(s, 'bag', Infinity);
}

/** Every power of Vesna's bought, la Nuée too; each empty slot wears its first. */
export function powers(s: Save) {
  for (const id of POWERS) {
    if (!s.powers.bought.includes(id)) s.powers.bought.push(id);
    const k = slotOf(id);
    if (k && !s.powers.worn[k]) s.powers.worn[k] = id as GiftId;
  }
}
/** Slot `k` wears `id` (bought if it was not; one of another slot: nothing changes); none: the slot emptied. */
export function wear(s: Save, k: Slot, id?: Power) {
  if (!id) return void delete s.powers.worn[k];
  if (slotOf(id) !== k) return;
  if (!s.powers.bought.includes(id)) s.powers.bought.push(id);
  s.powers.worn[k] = id as GiftId;
}

/** New items (numbered from the save's `next`), of kinds `ids` at rarity `r`: for the bag, or the chest (chest()). */
export const make = (s: Save, ids: readonly ItemId[], r: number): Item[] => ids.map((id) => ({ n: s.next++, id, r }));
/** Into the chest, acquired: `ids` at rarity `r` (none: one of each kind). */
export function chest(s: Save, r: number, ids: readonly ItemId[] = ITEM_IDS) {
  s.stash.push(...make(s, ids, r));
}

/** The save's on/off states, as the panel's boxes show and set them: the bite, la Nuée, Vesna freed, the catacombs' guardian (la Matrice)
 *  dead (unticked: to fight again), every shortcut raised (unticked: all shut again). */
export const FLAGS: Record<'bite' | 'swarm' | 'vesna' | 'nourrice' | 'shortcuts', [(s: Save) => boolean, (s: Save, on: boolean) => void]> = {
  bite: [(s) => s.unlocks.bite, (s, on) => void (s.unlocks.bite = on)],
  swarm: [(s) => s.powers.bought.includes('swarm'), (s, on) => void (s.powers.bought = [...s.powers.bought.filter((p) => p !== 'swarm'), ...(on ? ['swarm' as const] : [])])],
  vesna: [(s) => s.vesna, (s, on) => void (s.vesna = on)],
  nourrice: [(s) => s.nourrice.dead, (s, on) => void (s.nourrice.dead = on)],
  shortcuts: [(s) => SHORTCUTS.every((id) => s.shortcuts.includes(id)), (s, on) => void (s.shortcuts = on ? [...SHORTCUTS] : [])],
};
