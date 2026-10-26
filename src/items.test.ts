import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS, SLOTS, acquired, bank, chest, describe as say, die, equip, find, rarity, stats, stow, swap, unequip, type Item, type ItemId } from './items.ts';
import { parse, VERSION } from './save.ts';
import { T } from './tuning.ts';
import { missing } from './font.ts';

/** A seeded stream of numbers in [0, 1). */
const seeded = (a: number) => () => ((a = (a * 1664525 + 1013904223) % 4294967296) / 4294967296);
const item = (n: number, id: ItemId, r = 0): Item => ({ n, id, r });

describe('items: what they are', () => {
  it('three families in their slots: one weapon, two relics, three talismans; 15 to 20 items, each family at least four', () => {
    expect(SLOTS).toEqual(['arme', 'relique', 'relique', 'talisman', 'talisman', 'talisman']);
    expect(ITEM_IDS.length).toBeGreaterThanOrEqual(15);
    expect(ITEM_IDS.length).toBeLessThanOrEqual(20);
    for (const f of ['arme', 'relique', 'talisman']) expect(ITEM_IDS.filter((id) => ITEMS[id].fam === f).length).toBeGreaterThanOrEqual(4);
  });

  it('each has its numbers for the three rarities, never worse a rarity up, and says so in letters the font has', () => {
    for (const id of ITEM_IDS) {
      for (const v of Object.values(T.items.defs[id]) as readonly number[][]) {
        expect(v.length).toBe(3);
        for (let r = 1; r < 3; r++) expect(Math.abs(v[r])).toBeGreaterThanOrEqual(Math.abs(v[r - 1]));
      }
      expect(ITEMS[id].icon.length).toBe(7);
      for (const row of ITEMS[id].icon) expect(row).toMatch(/^[SsBbrdgwmv.]{7}$/);
      for (let r = 0; r < 3; r++) expect(missing(ITEMS[id].name + say({ id, r }))).toEqual([]);
    }
    expect(say({ id: 'acier', r: 2 })).toBe('Tes griffes frappent 60 % plus fort.');
    expect(missing('Ramasser (F) Le coffre (F) LE SAC LE COFFRE Porté Sac Coffre Au sol Arme Relique Talisman Commun Rare Épique Sac plein objets au coffre perdus Pas encore rapporté : perdu si tu meurs. Remplacer lequel ? Entrée Échap clic flèches souris')).toEqual([]);
  });

  it('stats: the bonuses of the items worn, summed; none worn, all nought', () => {
    const none = stats([null, null]);
    expect(Object.values(none).every((v) => v === 0)).toBe(true);
    const s = stats([item(1, 'acier', 2), null, item(2, 'croc', 0), item(3, 'croc', 1), item(4, 'chapelet', 2)]);
    expect(s.claw).toBe(T.items.defs.acier.claw[2]);
    expect(s.dmg).toBeCloseTo(T.items.defs.croc.dmg[0] + T.items.defs.croc.dmg[1]);
    expect(s.life).toBe(2);
    expect(s.pace).toBe(0);
    expect(stats([item(1, 'fer', 1)])).toMatchObject({ finisher: 1, knock: 0.5, pace: 0.08 });
  });
});

describe('items: where they come from', () => {
  const draws = (ring: number, sure: boolean, n = 20000) => {
    const rnd = seeded(ring * 7 + 1), got = [0, 0, 0];
    let found = 0;
    for (let i = 0; i < n; i++) { const f = find(ring, rnd, sure); if (f) { found++; got[f.r]++; } }
    return { found: found / n, rarities: got.map((g) => g / Math.max(1, found)) };
  };

  it('a cache holds one by its ring\'s chance; deeper, more often and rarer; ring 1 never épique', () => {
    const [r1, r2, r3] = [1, 2, 3].map((r) => draws(r, false));
    expect(r1.found).toBeCloseTo(T.items.cache[1], 1);
    expect(r3.found).toBeCloseTo(T.items.cache[3], 1);
    expect(r1.rarities[2]).toBe(0);
    expect(r1.rarities[0]).toBeGreaterThan(0.8);
    expect(r2.rarities[0]).toBeLessThan(r1.rarities[0]);
    expect(r3.rarities[1] + r3.rarities[2]).toBeGreaterThan(0.5);
    expect(r3.rarities[2]).toBeGreaterThan(0.1);
    expect(draws(0, false).found).toBe(0); // nothing at the refuge
  });

  it('sure (the camp chest, an elite): always one; every item can come up', () => {
    expect(draws(3, true).found).toBe(1);
    const rnd = seeded(5), seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(find(2, rnd, true)!.id);
    expect(seen.size).toBe(ITEM_IDS.length);
  });

  it('rarity follows the odds, past the last ring too', () => {
    expect(rarity(1, () => 0.95)).toBe(1);
    expect(rarity(1, () => 0.5)).toBe(0);
    expect(rarity(9, () => 0.999)).toBe(2);
  });

  it('an expedition through ring 1 (five caches) likely finds a commun; ring 3 (camp chest, an Inquisiteur, four caches) a rare or better', () => {
    const rnd = seeded(11);
    let near = 0, deep = 0;
    for (let k = 0; k < 2000; k++) {
      if ([0, 1, 2, 3, 4].some(() => find(1, rnd))) near++;
      const got = [find(3, rnd, true), find(3, rnd, true), ...[0, 1, 2, 3].map(() => find(3, rnd))];
      if (got.some((g) => g && g.r >= 1)) deep++;
    }
    expect(near / 2000).toBeGreaterThan(0.7);
    expect(deep / 2000).toBeGreaterThan(0.9);
  });
});

describe('items: the bag, the slots, the chest', () => {
  it('a bag holds so many; full, the item on the ground trades places with the one chosen', () => {
    const bag: Item[] = [];
    for (let n = 0; n < T.items.bag; n++) expect(stow(bag, T.items.bag, item(n, 'acier'))).toBe(true);
    expect(stow(bag, T.items.bag, item(9, 'croc'))).toBe(false);
    expect(bag.length).toBe(T.items.bag);
    const left = swap(bag, 2, item(9, 'croc'));
    expect(left.n).toBe(2);
    expect(bag.map((b) => b.n)).toEqual([0, 1, 9, 3]);
  });

  it('wears an item in its family\'s free slot; the weapon swaps; relics and talismans full ask which, then swap', () => {
    const worn = SLOTS.map(() => null as Item | null), bag = [item(1, 'acier'), item(2, 'stylet'), item(3, 'voile'), item(4, 'cor'), item(5, 'calice')];
    expect(equip(worn, bag, 0)).toBe(true); // acier into the weapon slot
    expect(worn[0]?.n).toBe(1);
    expect(equip(worn, bag, 0)).toBe(true); // the stylet: acier back into the bag in its place
    expect([worn[0]?.n, bag[0].n]).toEqual([2, 1]);
    expect(equip(worn, bag, 1)).toBe(true); // voile
    expect(equip(worn, bag, 1)).toBe(true); // cor
    expect([worn[1]?.n, worn[2]?.n]).toEqual([3, 4]);
    expect(equip(worn, bag, 1)).toBe(false); // calice: both relic slots taken: which?
    expect(equip(worn, bag, 1, 0)).toBe(false); // not the weapon's
    expect(equip(worn, bag, 1, 2)).toBe(true);
    expect([worn[2]?.n, bag.map((b) => b.n)]).toEqual([5, [1, 4]]);
    expect(unequip(worn, 0, bag, 2)).toBe(false); // the bag full
    expect(unequip(worn, 0, bag, 3)).toBe(true);
    expect([worn[0], bag.map((b) => b.n)]).toEqual([null, [1, 4, 2]]);
    expect(unequip(worn, 0, bag)).toBe(false); // nothing worn there
  });

  it('home: the bag and what is worn go into the chest, acquired for good; at death only what was not brought back is lost', () => {
    const save = parse(null);
    save.stash.push(item(1, 'acier', 1));
    save.worn[0] = save.stash[0];
    const bag = [item(2, 'croc'), item(3, 'voile', 2)];
    save.worn[3] = item(4, 'chapelet'); // found and worn in the field
    expect(bank(save, bag)).toBe(3);
    expect([bag.length, save.stash.map((s) => s.n)]).toEqual([0, [1, 2, 3, 4]]);
    expect(chest(save).map((s) => s.n)).toEqual([2, 3]);
    expect(bank(save, [save.stash[1]])).toBe(0); // brought back twice: once in the chest
    // next expedition: a new item found and worn, then death
    save.worn[1] = item(5, 'linceul', 2);
    expect(die(save)).toBe(1);
    expect(save.worn.map((w) => w?.n ?? null)).toEqual([1, null, null, 4, null, null]);
    expect(acquired(save, item(4, 'chapelet'))).toBe(true);
  });
});

describe('items: the save', () => {
  it('a version 1 save comes up with an empty chest and nothing worn', () => {
    const s = parse('{"v":1,"banked":40,"unlocks":{"bite":true,"life":1,"bag":2},"dry":0,"shortcuts":["grille"]}');
    expect([s.v, s.banked, s.stash, s.worn, s.next]).toEqual([VERSION, 40, [], [null, null, null, null, null, null], 0]);
  });

  it('reads back the chest and what is worn; drops what is broken, worn twice, in a wrong slot, or not brought back', () => {
    const s = parse(null);
    s.stash.push(item(3, 'acier', 2), item(7, 'voile', 1), item(8, 'croc'));
    s.worn[0] = s.stash[0];
    s.worn[1] = s.stash[1];
    s.worn[4] = item(12, 'chapelet'); // found this expedition: not in the chest
    s.next = 13;
    const back = parse(JSON.stringify(s));
    expect(back.stash).toEqual(s.stash);
    expect(back.worn.map((w) => w?.n ?? null)).toEqual([3, 7, null, null, null, null]);
    expect(back.next).toBe(13);
    const bad = parse(JSON.stringify({ stash: [{ n: 1, id: 'acier', r: 0 }, { n: 1, id: 'croc', r: 0 }, { n: 2, id: 'nope', r: 0 }, { n: 3, id: 'croc', r: 5 }, { n: -1, id: 'croc', r: 0 }, null, { n: 4, id: 'cor', r: 1 }],
      worn: [{ n: 4 }, { n: 4 }, { n: 4 }, { n: 1 }], next: 2 }));
    expect(bad.stash.map((i) => i.n)).toEqual([1, 4]);
    expect(bad.worn.map((w) => w?.n ?? null)).toEqual([null, 4, null, null, null, null]); // the cor in a relic slot, once; acier not in a talisman's
    expect(bad.next).toBe(5); // never a number already taken
  });
});
