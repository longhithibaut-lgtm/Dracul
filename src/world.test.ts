import { describe, expect, it } from 'vitest';
import { WORLD, expedition, go, lair, loose, parents, wayBack, type Came, type Place } from './world.ts';
import { parse, VERSION, type Save } from './save.ts';
import { LINES, WARES, WARE_TEXT, bagSize, beast, buy, owned, price } from './shop.ts';
import { T } from './tuning.ts';
import { missing } from './font.ts';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import type { Plan } from './baked.ts';

const PLANS: Record<Exclude<Place, 'refuge'>, Plan> = { hall: Crypt, nave: Nave, ossuary: Ossuary, chapel: Chapel, cloister: Cloister };
const places = Object.keys(WORLD) as Place[];

describe('the world by depth', () => {
  it('the refuge, then the crypt, the nave or the ossuary, the chapel, the cloister deepest', () => {
    expect(places.map((p) => WORLD[p].ring)).toEqual([0, 1, 2, 2, 3, 4]);
    expect(WORLD.refuge.ahead).toEqual(['hall']);
    expect(WORLD.hall.ahead).toEqual(['nave', 'ossuary']); // one portcullis to each
    expect(WORLD.cloister.ahead).toEqual([]);
    for (const p of places) for (const to of WORLD[p].ahead) expect(WORLD[to].ring).toBe(WORLD[p].ring + 1);
    for (const p of places) if (p !== 'refuge') expect(PLANS[p].EXITS.length).toBeGreaterThanOrEqual(WORLD[p].ahead.length);
    for (const p of places) expect(missing(WORLD[p].name)).toEqual([]);
  });

  it('every room is reached from the refuge, and every room leads back to it', () => {
    const seen = new Set<Place>(['refuge']), todo: Place[] = ['refuge'];
    while (todo.length) for (const to of WORLD[todo.pop()!].ahead) if (!seen.has(to)) seen.add(to), todo.push(to);
    expect([...seen].sort()).toEqual([...places].sort());
    for (const p of places.filter((p) => p !== 'refuge')) {
      let at: Place = p;
      for (let n = 0; at !== 'refuge' && n < 9; n++) at = go({}, at, -1)!.to;
      expect(at).toBe('refuge');
    }
  });

  it('forward into a room by its stairs; back the way he came, by the exit he took', () => {
    const came: Came = {};
    expect(go(came, 'refuge', 0)).toEqual({ to: 'hall', entry: -1 });
    expect(go(came, 'hall', 1)).toEqual({ to: 'ossuary', entry: -1 });
    expect(go(came, 'ossuary', 0)).toEqual({ to: 'chapel', entry: -1 });
    expect(go(came, 'chapel', -1)).toEqual({ to: 'ossuary', entry: 0 }); // not the nave: the way he came
    expect(go(came, 'ossuary', -1)).toEqual({ to: 'hall', entry: 1 });
    expect(go(came, 'hall', -1)).toEqual({ to: 'refuge', entry: 0 }); // up the refuge's stairs
    expect(go({}, 'chapel', -1)).toEqual({ to: 'nave', entry: 0 }); // never came: the first way in
    expect(go(came, 'cloister', 0)).toBeUndefined(); // the deepest: its doors lead nowhere yet
    expect(go(came, 'refuge', -1)).toBeUndefined();
    expect(wayBack(came, 'chapel')).toEqual(['ossuary', 'hall']); // where the battue waits for him
    expect(wayBack(came, 'hall')).toEqual([]);
    expect(parents('chapel')).toEqual([{ from: 'nave', exit: 0 }, { from: 'nave', exit: 1 }, { from: 'ossuary', exit: 0 }, { from: 'ossuary', exit: 1 }]);
  });

  it("lays the battue's packs on his way back: the nearest room free, never the room he is in, the heaviest nearest", () => {
    const P = T.battue.packs, exp = expedition(0), room = () => ({ foes: [], caches: [], drops: [] });
    go(exp.came, 'refuge', 0);
    exp.rooms.hall = room();
    exp.packs = 1;
    expect(loose(exp, 'hall', P)).toEqual([]); // in the crypt: nowhere between him and the refuge, it waits
    expect([exp.packs, exp.loosed]).toEqual([1, 0]);
    go(exp.came, 'hall', 0);
    exp.rooms.nave = room();
    expect(loose(exp, 'nave', P)).toEqual([{ at: 'hall', kinds: P[0] }]); // deeper: the crypt is behind him now
    expect([exp.packs, exp.loosed, exp.rooms.nave.battue]).toEqual([0, 1, undefined]);
    go(exp.came, 'nave', 1);
    exp.rooms.chapel = room();
    exp.packs = 3;
    expect(loose(exp, 'chapel', P).map((p) => p.at)).toEqual(['nave', 'nave', 'nave']); // the crypt holds one: the nave's grows
    expect(exp.rooms.nave.battue).toEqual({ kinds: P[2], stairs: true }); // the 4th: the last pack again, before the stairs
    expect(exp.rooms.hall.battue).toEqual({ kinds: P[0], stairs: false });
    expect(exp.rooms.chapel.battue).toBeUndefined();
    expect([exp.packs, exp.loosed]).toEqual([0, 4]);
    expect(P[0].every((k) => k === 'hound') && (P[P.length - 1] as readonly string[]).includes('inquisitor')).toBe(true); // hounds first, then an Inquisiteur
    expect(lair(['nave', 'hall'], (p) => p === 'nave')).toBe('hall');
    expect(lair([], () => false)).toBeUndefined();
  });

  it('hides its blood caches on open floor, enough of them', () => {
    for (const p of places.filter((p) => p !== 'refuge')) {
      const D = PLANS[p], [x0, y0, w, h] = D.BOUNDS;
      expect(WORLD[p].caches.length).toBeGreaterThanOrEqual(T.expedition.caches[1]);
      for (const c of WORLD[p].caches) {
        expect(c.x > x0 && c.x < x0 + w && c.y > y0 && c.y < y0 + h, `${p} ${c.x},${c.y}`).toBe(true);
        for (const [bx, by, bw, bh] of [...D.BOXES, ...D.PITS.map((b) => [b.x, b.y, b.w, b.h])])
          expect(c.x >= bx && c.x < bx + bw && c.y >= by && c.y < by + bh, `${p} ${c.x},${c.y} in a box`).toBe(false);
      }
    }
  });
});

describe('save', () => {
  it('starts afresh without a save, or with a broken one', () => {
    const fresh = { v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0 };
    expect(parse(null)).toEqual(fresh);
    expect(parse('{not json')).toEqual(fresh);
    expect(parse('42')).toEqual(fresh);
    expect(parse('null')).toEqual(fresh);
  });

  it('reads back what it stored', () => {
    const s = { v: VERSION, banked: 120, unlocks: { bite: true, life: 2, bag: 1 }, dry: 2 };
    expect(parse(JSON.stringify(s))).toEqual(s);
  });

  it('brings an older or damaged save up to date: missing fields to their start, bad values cleaned, unknown ones dropped', () => {
    expect(parse('{"banked":37}')).toEqual({ v: VERSION, banked: 37, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0 }); // before versions
    expect(parse('{"v":1,"banked":-5,"unlocks":{"bite":"yes"},"junk":1}')).toEqual({ v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0 });
    expect(parse('{"v":1,"banked":12.7}').banked).toBe(12);
    expect(parse('{"v":1,"banked":"NaN"}').banked).toBe(0);
    expect(parse('{"v":1,"unlocks":{"bite":true,"life":-1}}').unlocks).toEqual({ bite: true, life: 0, bag: 0 });
  });
});

describe("the Rongé's wares", () => {
  const save = (banked: number): Save => parse(JSON.stringify({ banked }));

  it('prices: the bite once, life and the bag by ranks, each x1.8 the last, then sold out', () => {
    expect(price('bite', 0)).toBe(T.ronge.bite);
    expect(price('bite', 1)).toBeUndefined();
    expect([0, 1, 2, 3, 4].map((n) => price('life', n))).toEqual([40, 72, 130, 233, undefined]);
    expect([0, 1, 2, 3].map((n) => price('bag', n))).toEqual([60, 108, 194, undefined]);
    for (let n = 1; n < 3; n++) expect(price('life', n)! / price('life', n - 1)!).toBeCloseTo(T.ronge.life.mult, 1);
  });

  it('buys from the bank: the price taken, the rank saved; too little banked changes nothing', () => {
    const s = save(130);
    expect(buy(s, 'bite')).toBe('sold');
    expect([s.banked, s.unlocks.bite]).toEqual([50, true]);
    expect(buy(s, 'bite')).toBe('none');
    expect(buy(s, 'life')).toBe('sold'); // 40
    expect(buy(s, 'life')).toBe('poor'); // 72 > 10
    expect([s.banked, s.unlocks.life, owned(s, 'life')]).toEqual([10, 1, 1]);
    expect(parse(JSON.stringify(s))).toEqual(s); // what is bought outlives the page
    const b = save(1000);
    while (buy(b, 'bag') === 'sold');
    expect([b.unlocks.bag, bagSize(b), b.banked]).toEqual([3, T.blood.bag + 3 * T.ronge.bag.size, 1000 - 60 - 108 - 194]);
  });

  it('turns beast after too many returns without pouring', () => {
    const s = save(0);
    s.dry = T.ronge.hunger - 1;
    expect(beast(s)).toBe(false);
    s.dry++;
    expect(beast(s)).toBe(true);
  });

  it('speaks and labels his wares in letters the font has', () => {
    for (const w of WARES) expect(missing(WARE_TEXT[w].name + WARE_TEXT[w].text)).toEqual([]);
    for (const l of Object.values(LINES).flat()) expect(missing(l)).toEqual([]);
    expect(missing('Les chiens ont flairé ton sang. Un Inquisiteur lâche ses chiens. Le Rongé (F) Bassin : sang Échap pour partir')).toEqual([]);
  });
});
