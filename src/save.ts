// What outlives the page: the blood banked in the refuge's basin and what is unlocked, a small versioned JSON in
// localStorage; plus a log of the expeditions for the playtests (docs/extraction.md §12: returns, deaths, depth). The
// game runs without storage (a private window, a framed preview): it then starts afresh each time.
import { ITEMS, SLOTS, type Item, type Worn } from './items.ts';
import { isPower, slotOf, type Power, type Worn as Powers } from './powers.ts';

export const VERSION = 4; // 2: the items (stash, worn, next); 3: the Nourrice, Vesna, her powers; 4: the map's fog. An older save comes up without what it lacks
// unlocks: what the Rongé sold for banked blood (shop.ts): the bite, the ranks of max life (`life`) and of the bag (`bag`)
// bought. dry: how many times in a row the hero came back (or re-formed) without pouring blood: the Rongé's hunger.
// shortcuts: the zone's gates raised for good (necropolis.data.ts GATES ids). stash: the items brought back (the
// refuge's chest, acquired for good); worn: what he wears, by slot (items.ts SLOTS; on an expedition it may hold items
// not yet brought back: those are dropped when read back, as at death); next: the number the next item found takes.
// nourrice: the catacombs' guardian, fights begun and her death (for good); vesna: freed (for good, even if he dies on
// his way back); powers: the Rat house's powers bought from her, and those worn, one per slot (powers.ts). carte: per
// open zone, the map's cells he has seen, a bitmask in base64 (map.ts; one of another size is dropped there).
export type Save = { v: number; banked: number; unlocks: { bite: boolean; life: number; bag: number }; dry: number; shortcuts: string[]; stash: Item[]; worn: Worn; next: number;
  nourrice: { tries: number; dead: boolean }; vesna: boolean; powers: { bought: Power[]; worn: Powers }; carte: Partial<Record<'necropolis' | 'catacombs', string>> };
const KEY = 'dracul.save', LOG = 'dracul.log';

/** A save read back from `json`, whatever it holds: brought up to this version, missing or broken fields to their
 *  start (nothing banked, nothing unlocked), unknown ones dropped. */
export function parse(json: string | null): Save {
  let o: Partial<Save> | null = null;
  try { o = JSON.parse(json ?? 'null'); } catch { /* broken: start afresh */ }
  if (typeof o !== 'object' || !o) o = {};
  const count = (n: unknown) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const shortcuts = Array.isArray(o.shortcuts) ? [...new Set(o.shortcuts.filter((s): s is string => typeof s === 'string'))] : [];
  const item = (i: Partial<Item> | null | undefined): Item | undefined =>
    i && Number.isInteger(i.n) && i.n! >= 0 && typeof i.id === 'string' && Object.hasOwn(ITEMS, i.id) && [0, 1, 2].includes(i.r!) ? { n: i.n!, id: i.id, r: i.r! } : undefined;
  const stash = (Array.isArray(o.stash) ? o.stash.map(item) : []).filter((i, k, all): i is Item => !!i && all.findIndex((j) => j?.n === i.n) === k);
  const worn: Worn = [];
  SLOTS.forEach((f, s) => { // only what is in the chest, in a slot of its family, worn once
    const w = stash.find((i) => i.n === o.worn?.[s]?.n); // the chest's own
    worn.push(w && ITEMS[w.id].fam === f && !worn.includes(w) ? w : null);
  });
  const next = Math.max(count(o.next), ...stash.map((i) => i.n + 1));
  const bought = Array.isArray(o.powers?.bought) ? [...new Set(o.powers.bought.filter(isPower))] : [], wearing: Powers = {};
  for (const id of bought) { const k = slotOf(id); if (k && o.powers?.worn?.[k] === id) wearing[k] = id as Powers[typeof k]; } // only what is bought, in its own slot
  const carte: Save['carte'] = {};
  for (const z of ['necropolis', 'catacombs'] as const) { const s = o.carte?.[z]; if (typeof s === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(s)) carte[z] = s; }
  return { v: VERSION, banked: count(o.banked), unlocks: { bite: o.unlocks?.bite === true, life: count(o.unlocks?.life), bag: count(o.unlocks?.bag) }, dry: count(o.dry), shortcuts, stash, worn, next,
    nourrice: { tries: count(o.nourrice?.tries), dead: o.nourrice?.dead === true }, vesna: o.vesna === true, powers: { bought, worn: wearing }, carte };
}

const storage = () => { try { return localStorage; } catch { return undefined; } }; // a sandboxed frame throws on access

/** The save, loaded once; change it, then store(). */
export const data: Save = parse((() => { try { return storage()?.getItem(KEY) ?? null; } catch { return null; } })());

/** A new game: the save back to its start (the expedition log is kept). */
export function reset() {
  Object.assign(data, parse(null));
  store();
}

export function store() {
  try { storage()?.setItem(KEY, JSON.stringify(data)); } catch { /* full or refused: it lives on until the page closes */ }
}

/** One expedition ended: back at the refuge or dead. deepest: the deepest ring reached; blood: carried at its end;
 *  life: health left; s: how long it lasted; loosed, met: the battue's packs his scent loosed, and those he walked into;
 *  boss: the Nourrice fought (« essai ») or killed (« tuée ») on it.
 *  Kept (the last 200) in localStorage and shown in the console. */
export type Entry = { end: 'retour' | 'mort'; deepest: number; blood: number; life: number; s: number; loosed: number; met: number; boss?: 'essai' | 'tuée'; at: string };
export function log(e: Omit<Entry, 'at'>) {
  const entry = { ...e, at: new Date().toISOString() };
  console.info('expédition', JSON.stringify(entry));
  try {
    const all = JSON.parse(storage()?.getItem(LOG) ?? '[]') as Entry[];
    storage()?.setItem(LOG, JSON.stringify([...all, entry].slice(-200)));
  } catch { /* the console has it */ }
}
