import { T } from './tuning.ts';
import { RARITY } from './gifts.ts';

// The items of the expeditions (docs/extraction.md §6), a family of their own (not the Rat's gifts): found in caches and
// on elites, carried in a bag of a few, worn in slots by family (one weapon, two relics, three talismans), lost at death
// until brought back to the refuge, where they are acquired for good (its chest). What they are called, say and look
// like; their numbers live in T.items.defs, their effects in RoomScene (through stats()). Pure, so it can be unit tested.

export type Family = 'arme' | 'relique' | 'talisman';
export const FAMILY: Record<Family, string> = { arme: 'Arme', relique: 'Relique', talisman: 'Talisman' };
export { RARITY };
const D = T.items.defs;
export type ItemId = keyof typeof D;
export type Stat = { [K in ItemId]: keyof (typeof D)[K] }[ItemId];
/** An item found: its kind, its rarity (0 commun, 1 rare, 2 épique), and a number of its own (`n`: which one). */
export type Item = { n: number; id: ItemId; r: number };
/** The worn slots, in this order: one per entry, by family (T.items.slots). */
export const SLOTS: Family[] = (Object.keys(T.items.slots) as Family[]).flatMap((f) => Array<Family>(T.items.slots[f]).fill(f));
export type Worn = (Item | null)[];

const pc = (v: number) => `${Math.round(Math.abs(v) * 100)} %`;
const fr = (n: number) => String(n).replace('.', ','); // French decimals
// 7x7 icons (S silver, s grey, B bone, b dim bone, r and d blood, g gold, w wood, m mist, v dusk), with what each says
// at its rarity, from its numbers `v` there.
type Def = { fam: Family; name: string; icon: string[]; text: (v: Record<string, number>) => string };
const DEFS: Record<ItemId, Def> = {
  acier: { fam: 'arme', name: "Griffes d'acier", text: (v) => `Tes griffes frappent ${pc(v.claw)} plus fort.`,
    icon: ['..S.S.S', '.S.S.S.', '.S.S.S.', 'S.S.S..', 'S.S.S..', 'sssss..', '.sss...'] },
  stylet: { fam: 'arme', name: 'Stylet de pénitent', text: (v) => `Tes coups de griffe s'enchaînent ${pc(v.pace)} plus vite.`,
    icon: ['......S', '.....S.', '....S..', '...S...', '.gS....', '.wg....', 'w......'] },
  fer: { fam: 'arme', name: 'Fer du bourreau', text: (v) => `Ton coup final frappe x${fr(2 + v.finisher)} et repousse ${pc(v.knock)} plus loin ; tes coups sont un peu plus lents.`,
    icon: ['.SSS...', 'SSSSw..', 'SSSSw..', '.SS.w..', '....w..', '....w..', '....w..'] },
  faucille: { fam: 'arme', name: 'Faucille du fossoyeur', text: (v) => `Tes griffes portent plus loin (+${v.reach}) et balaient plus large (+${v.arc} degrés).`,
    icon: ['..SSS..', '.S...S.', 'S.....S', '......S', '.....S.', '...ww..', '..w....'] },
  saignee: { fam: 'arme', name: 'Crocs de saignée', text: (v) => `Chaque coup de griffe fait saigner : ${fr(v.bleed)} PV en ${T.items.bleedMs / 1000} s.`,
    icon: ['SSSSSSS', 'S.S.S.S', 'S.S.S.S', 'r.r.r.r', '..r...r', 'd.....d', '.......'] },
  goule: { fam: 'arme', name: 'Main de goule', text: (v) => `Un coup final qui tue a ${pc(v.leech)} de chances de te rendre ${T.items.leechHeal} PV.`,
    icon: ['.b.b.b.', '.b.b.b.', '.bbbbb.', 'bbbbbb.', '.bbbb..', '..bb...', '..bb...'] },
  linceul: { fam: 'relique', name: 'Linceul noir', text: (v) => `Dans l'ombre, on te remarque ${pc(v.shade)} moins loin.`,
    icon: ['..sSs..', '.sSSSs.', '.sSSSs.', 'sSSSSSs', 'sSsSsSs', 'sSsSsSs', 's.s.s.s'] },
  voile: { fam: 'relique', name: 'Voile de suie', text: (v) => `La lumière sacrée te brûle ${pc(v.burn)} moins vite.`,
    icon: ['vvvvvvv', 'vsvsvsv', 'v.v.v.v', 'v.....v', '.v...v.', '..v.v..', '...v...'] },
  flacon: { fam: 'relique', name: 'Flacon scellé', text: (v) => `Ton sang sent moins : la battue attend ${pc(v.scent)} de sang porté en plus.`,
    icon: ['..ggg..', '...S...', '..S.S..', '.S...S.', '.SrrrS.', '.SrrrS.', '..SSS..'] },
  calice: { fam: 'relique', name: 'Calice fêlé', text: (v) => `Les morts lâchent ${pc(v.spoils)} de sang en plus.`,
    icon: ['SSSSSSS', '.SrrrS.', '.SrdrS.', '..SSS..', '...S...', '...S...', '.SSSSS.'] },
  outre: { fam: 'relique', name: 'Outre de peau', text: (v) => `Tu portes ${v.purse} sang de plus.`,
    icon: ['...ww..', '..w....', '.wwww..', 'wwrwww.', 'wwwwwww', 'wwwwwww', '.wwwww.'] },
  cor: { fam: 'relique', name: 'Cor de chasse volé', text: (v) => `Tu entends la battue : ses meutes à moins de ${v.horn} pas sont montrées au bord de l'écran.`,
    icon: ['......g', '.....gg', 'g...ggg', 'gg.ggg.', '.ggg...', '.......', '.......'] },
  fiole: { fam: 'relique', name: 'Fiole de brume', text: (v) => `Ta brume dure ${pc(v.mist)} de plus : plus loin, insaisissable plus longtemps.`,
    icon: ['..ggg..', '...S...', '..SmS..', '.SmmmS.', '.SmmmS.', '.SmmmS.', '..SSS..'] },
  chapelet: { fam: 'talisman', name: "Chapelet d'os", text: (v) => `+${v.life} PV max.`,
    icon: ['.B.B.B.', 'B.....B', '.......', 'B.....B', '.B...B.', '...B...', '..BBB..'] },
  eperon: { fam: 'talisman', name: 'Éperon rouillé', text: (v) => `Tu marches ${pc(v.speed)} plus vite.`,
    icon: ['.......', 'S......', 'SSSSS..', '....SgS', '.....g.', '....SgS', '.......'] },
  sablier: { fam: 'talisman', name: 'Sablier fêlé', text: (v) => `Ta brume se recharge ${pc(v.dash)} plus vite.`,
    icon: ['SSSSSSS', '.SrrrS.', '..SrS..', '...S...', '..S.S..', '.SrrrS.', 'SSSSSSS'] },
  croc: { fam: 'talisman', name: 'Croc limé', text: (v) => `+${pc(v.dmg)} de dégâts.`,
    icon: ['BBBBB..', '.BBBB..', '.BBBB..', '..BBB..', '..BBb..', '...Bb..', '...b...'] },
  cendre: { fam: 'talisman', name: 'Cendre de bûcher', text: (v) => `La lumière sacrée t'épargne ${fr(v.grace / 1000)} s de plus avant de brûler.`,
    icon: ['.......', '...r...', '..sds..', '.sssss.', 'ssrssss', 'sssssss', '.......'] },
};
export const ITEMS = DEFS;
export const ITEM_IDS = Object.keys(DEFS) as ItemId[];

/** Item `id`'s numbers at rarity `r`. */
export const numbers = (id: ItemId, r: number) =>
  Object.fromEntries(Object.entries(D[id]).map(([k, v]) => [k, (v as readonly number[])[r]])) as Record<string, number>;
/** What item `it` does, in words. */
export const describe = (it: Pick<Item, 'id' | 'r'>) => DEFS[it.id].text(numbers(it.id, it.r));
export const family = (it: Pick<Item, 'id'>) => DEFS[it.id].fam;

/** The bonuses of the items `worn`, summed by stat (0 for those none gives). */
export function stats(worn: readonly (Item | null | undefined)[]): Record<Stat, number> {
  const s = {} as Record<Stat, number>;
  for (const k of ITEM_IDS.flatMap((id) => Object.keys(D[id]))) s[k as Stat] = 0;
  for (const it of worn) if (it) for (const [k, v] of Object.entries(numbers(it.id, it.r))) s[k as Stat] += v;
  return s;
}

// ---------- where they come from ----------

/** A rarity drawn from ring `ring`'s odds. */
export function rarity(ring: number, rnd: () => number) {
  const odds = T.items.odds[Math.min(ring, T.items.odds.length - 1)];
  let k = rnd() * odds.reduce<number>((a, b) => a + b, 0);
  return Math.max(0, odds.findIndex((o) => (k -= o) < 0));
}
/** An item found in ring `ring` (`sure`: always one, else by the ring's cache chance), its kind and rarity drawn; none
 *  found: undefined. */
export function find(ring: number, rnd: () => number, sure = false): Pick<Item, 'id' | 'r'> | undefined {
  if (!sure && rnd() >= (T.items.cache[Math.min(ring, T.items.cache.length - 1)] ?? 0)) return undefined;
  return { id: ITEM_IDS[Math.floor(rnd() * ITEM_IDS.length)], r: rarity(ring, rnd) };
}

// ---------- the bag, the worn slots, the chest ----------

/** Puts `it` in `bag` (holding `size`): false when it is full. */
export function stow(bag: Item[], size: number, it: Item) {
  if (bag.length >= size) return false;
  bag.push(it);
  return true;
}
/** A full bag: `ground` takes the place of bag item `k`, which is left on the ground (returned). */
export function swap(bag: Item[], k: number, ground: Item) {
  const left = bag[k];
  bag[k] = ground;
  return left;
}
/** Wears `list[k]` (the bag, or the chest's): in slot `slot`, else its family's first free slot, else its family's only
 *  slot; what was worn there takes its place in `list`. False (nothing changes) when it must be told which slot (a
 *  family of several, all taken) or `slot` is not of its family. */
export function equip(worn: Worn, list: Item[], k: number, slot?: number) {
  const it = list[k], mine = SLOTS.flatMap((f, i) => (f === family(it) ? [i] : []));
  const s = slot ?? mine.find((i) => !worn[i]) ?? (mine.length === 1 ? mine[0] : undefined);
  if (s === undefined || !mine.includes(s)) return false;
  const old = worn[s];
  worn[s] = it;
  if (old) list[k] = old;
  else list.splice(k, 1);
  return true;
}
/** Takes off worn slot `s` into `list` (holding `size`): false when it is empty, or the list full. */
export function unequip(worn: Worn, s: number, list: Item[], size = Infinity) {
  const it = worn[s];
  if (!it || list.length >= size) return false;
  list.push(it);
  worn[s] = null;
  return true;
}

type Owner = { stash: Item[]; worn: Worn };
/** Brought back to the refuge for good. */
export const acquired = (o: Owner, it: Item) => o.stash.some((s) => s.n === it.n);
/** The chest's items not worn. */
export const chest = (o: Owner) => o.stash.filter((s) => !o.worn.some((w) => w?.n === s.n));
/** Back at the refuge: the bag's items and those worn not yet brought back go into the chest (acquired); `bag` emptied.
 *  Returns how many were new to it. */
export function bank(o: Owner, bag: Item[]) {
  const fresh = [...bag, ...o.worn.filter((w): w is Item => !!w)].filter((it, i, all) => !acquired(o, it) && all.findIndex((b) => b.n === it.n) === i);
  o.stash.push(...fresh);
  bag.length = 0;
  return fresh.length;
}
/** Dead: what was worn and not yet brought back is gone (the bag is the caller's to drop). Returns how many. */
export function die(o: Owner) {
  let lost = 0;
  o.worn.forEach((w, i) => { if (w && !acquired(o, w)) { o.worn[i] = null; lost++; } });
  return lost;
}
