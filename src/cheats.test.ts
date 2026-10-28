import { describe, expect, it } from 'vitest';
import * as C from './cheats.ts';
import { parse } from './save.ts';
import { ZONES, isZone } from './world.ts';
import { ARENA } from './catacombs.data.ts';
import { ITEM_IDS } from './items.ts';
import { POWERS, worn } from './powers.ts';
import { T } from './tuning.ts';

// Each « Mode test » cheat changes the save as told, and what it leaves survives the save's own read-back (save.ts parse).
const fresh = () => parse(null);
const kept = (s: ReturnType<typeof parse>) => expect(parse(JSON.stringify(s))).toEqual(s);

describe('mode test', () => {
  it('sets le Rongé\'s ranks within what he sells, or all of it', () => {
    const s = fresh();
    C.rank(s, 'life', 2);
    C.rank(s, 'bag', 99);
    expect(s.unlocks).toEqual({ bite: false, life: 2, bag: T.ronge.bag.ranks });
    C.rank(s, 'life', -1);
    expect(s.unlocks.life).toBe(0);
    C.ronge(s);
    expect(s.unlocks).toEqual({ bite: true, life: T.ronge.life.ranks, bag: T.ronge.bag.ranks });
    kept(s);
  });

  it('buys all of Vesna\'s powers, la Nuée too, and wears one per slot', () => {
    const s = fresh();
    C.wear(s, 'tir', 'jet');
    C.powers(s);
    expect([...s.powers.bought].sort()).toEqual([...POWERS].sort());
    expect(worn(s)).toEqual(['griffes', 'jet', 'nid', 'nuee']); // the slot already worn kept
    kept(s);
  });

  it('wears a power in its own slot only, bought on the way; none empties the slot', () => {
    const s = fresh();
    C.wear(s, 'brume', 'miasme');
    C.wear(s, 'griffes', 'miasme'); // not a claw: nothing
    expect(s.powers).toEqual({ bought: ['miasme'], worn: { brume: 'miasme' } });
    C.wear(s, 'brume');
    expect(s.powers.worn).toEqual({});
    kept(s);
  });

  it('gives items numbered after the last, into the chest for good', () => {
    const s = fresh();
    C.chest(s, 2, ['croc']);
    C.chest(s, 0);
    const bag = C.make(s, ['outre', 'outre'], 1);
    expect(s.stash.length).toBe(1 + ITEM_IDS.length);
    expect(s.stash[0]).toEqual({ n: 0, id: 'croc', r: 2 });
    expect(bag.map((i) => i.n)).toEqual([ITEM_IDS.length + 1, ITEM_IDS.length + 2]);
    expect(s.next).toBe(ITEM_IDS.length + 3);
    kept(s);
  });

  it('ticks and unticks each state: the bite, la Nuée, Vesna, the Nourrice, every shortcut', () => {
    expect(C.SHORTCUTS).toEqual(expect.arrayContaining(['grille', 'galerie', 'caveau']));
    expect(C.SHORTCUTS).not.toContain('prison'); // an arena's grille: a fight shuts it
    const s = fresh();
    for (const [get, set] of Object.values(C.FLAGS)) {
      expect(get(s)).toBe(false);
      set(s, true);
      expect(get(s)).toBe(true);
    }
    expect(s).toMatchObject({ unlocks: { bite: true }, powers: { bought: ['swarm'] }, vesna: true, nourrice: { dead: true }, shortcuts: C.SHORTCUTS });
    kept(s);
    for (const [get, set] of Object.values(C.FLAGS)) {
      set(s, false);
      expect(get(s)).toBe(false);
    }
    expect(s).toEqual(fresh());
  });

  it('drops him on open floor, outside the Nourrice\'s arena', () => {
    for (const [, id, at] of C.PLACES) {
      if (!at || !isZone(id)) continue;
      const Z = ZONES[id], feet = { x: at.x, y: at.y + 6 };
      const inside = ([x, y, w, h]: number[]) => feet.x >= x - 8 && feet.x < x + w + 8 && feet.y >= y - 8 && feet.y < y + h + 8;
      expect([...Z.BOXES, ...Z.PITS].filter(inside), `${id} ${at.x},${at.y}`).toEqual([]);
      expect(feet.x >= 0 && feet.x < Z.W && feet.y >= 0 && feet.y < Z.H).toBe(true);
    }
    const [x0, y0, x1, y1] = ARENA, p = C.PLACES.find(([l]) => l.includes('prison'))![2]!;
    expect(p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1).toBe(false);
  });
});
