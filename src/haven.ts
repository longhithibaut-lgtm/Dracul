// The refuge as it answers the hero's progress (docs/extraction.md §7 « le refuge change à l'œil »): the basin's blood
// rising with what is banked, the braziers, sconces and candles lit one per upgrade bought, his ashes and the marks of
// his deaths, the items brought back shown in the wardrobe, the guardians' trophies, the few lines le Rongé and Vesna
// say as he walks by. Pure, so it can be unit tested; haven-life.ts draws it and runs its life, RoomScene decides.
import { T } from './tuning.ts';
import { ITEM_IDS, type Item } from './items.ts';
import type { Entry, Save } from './save.ts';

type P = { x: number; y: number };

/** How full the basin is, 0 (dry) to almost 1, for the blood banked. */
export const fill = (banked: number) => (banked > 0 ? banked / (banked + T.refuge.fill) : 0);

/** The upgrades bought: le Rongé's bite and ranks, Vesna's powers. */
export const upgrades = (s: Save) => Number(s.unlocks.bite) + s.unlocks.life + s.unlocks.bag + s.powers.bought.length;

/** A flame the bake left out (the mockup's « début » state, tools/art/maquettes/hub3/complex.mjs), in room px: a
 *  brazier (its flame and the floor point under it), a sconce on the hall's wall, a candle in the crypt's niches, or
 *  stubs set round the basin. One more is lit per upgrade, in this order (17: all of them, everything bought). */
export type Flame = { kind: 'brazier' | 'sconce' | 'candle' | 'stub'; x: number; y: number; floor: number };
const brazier = (x: number, y: number, floor: number): Flame => ({ kind: 'brazier', x, y, floor });
const at = (kind: Flame['kind'], ...ps: [number, number][]) => ps.map(([x, y]): Flame => ({ kind, x, y, floor: y }));
export const LIGHTS: Flame[][] = [ // a step each, all its flames at once
  [brazier(1075, 560, 575)], [brazier(605, 560, 575)], ...at('sconce', [660, 463], [1020, 463]).map((f) => [f]),
  [brazier(1075, 754, 769)], [brazier(585, 736, 750)], [at('sconce', [1130, 463])[0]],
  ...at('candle', [665, 216], [945, 216], [735, 216], [1035, 216], [665, 181], [965, 181], [714, 181], [1015, 181]).map((f) => [f]),
  at('stub', [812, 656], [816, 662], [822, 666]), at('stub', [868, 656], [864, 662], [858, 666]),
];
/** The flames lit for save `s`. */
export const lit = (s: Save) => LIGHTS.slice(0, upgrades(s)).flat();

/** How many times he came back to the refuge and how many he re-formed in his coffin, from the expedition log. */
export function tally(log: Entry[]) {
  return { returns: log.filter((e) => e.end === 'retour').length, deaths: log.filter((e) => e.end !== 'retour').length }; // given up (the pause menu): as a death
}

/** What the wardrobe shows: each kind of item in the chest once, at its best rarity, weapons first (items.ts order). */
export function shown(stash: Item[]) {
  return ITEM_IDS.flatMap((id) => {
    const all = stash.filter((i) => i.id === id);
    return all.length ? [all.reduce((a, b) => (b.r > a.r ? b : a))] : [];
  });
}

// Their lines as he walks by, by progress: provisional (written by Claude in their voices, to validate with the user,
// docs/lore.md).
type Said = { line: string; when: (s: Save, deaths: number) => boolean };
export const LINES: Record<'ronge' | 'vesna', Said[]> = {
  ronge: [
    { line: 'Le bassin est sec. Ma tête aussi.', when: (s) => s.banked < 100 },
    { line: 'Tant de sang... Je me souviens de choses que j\'avais perdues.', when: (s) => s.banked >= 1000 },
    { line: 'Encore des cendres dans ton cercueil. Elles se relèvent toujours.', when: (_, d) => d >= 3 },
    { line: 'La vieille aux rats compte le sang. Moi, je le bois.', when: (s) => s.vesna },
  ],
  vesna: [
    { line: 'Mes rats connaissent chaque pierre de ce trou.', when: () => true },
    { line: 'Tu reviens en cendres et tu repars. Têtu comme un rat.', when: (_, d) => d >= 3 },
    { line: 'Ta roue, au mur... Je l\'entendais grincer, de ma cage.', when: (s) => s.nourrice.dead },
  ],
};
/** A line of `who`'s for save `s` and `deaths`, not `last` when another fits; none fits: undefined. */
export function line(who: 'ronge' | 'vesna', s: Save, deaths: number, last?: string, rnd = Math.random) {
  const ok = LINES[who].filter((l) => l.when(s, deaths)).map((l) => l.line), fresh = ok.length > 1 ? ok.filter((l) => l !== last) : ok;
  return fresh.length ? fresh[Math.floor(rnd() * fresh.length)] : undefined;
}

/** Where the rats live (room px, open floor): a few about the crypt and the great hall, more in Vesna's shop and by her
 *  door once she is freed. They run about within `T.refuge.roam` of home. */
export const RATS: (P & { vesna?: boolean })[] = [
  { x: 640, y: 330 }, { x: 1100, y: 545 }, { x: 560, y: 700 }, { x: 1010, y: 795 },
  { x: 1215, y: 590, vesna: true }, { x: 1262, y: 588, vesna: true }, { x: 1130, y: 600, vesna: true }, { x: 1150, y: 545, vesna: true },
];
