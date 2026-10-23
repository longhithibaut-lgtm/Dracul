import { describe, expect, it } from 'vitest';
import { WORLD, go, parents, type Came, type Place } from './world.ts';
import { parse, VERSION } from './save.ts';
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
    expect(parents('chapel')).toEqual([{ from: 'nave', exit: 0 }, { from: 'nave', exit: 1 }, { from: 'ossuary', exit: 0 }, { from: 'ossuary', exit: 1 }]);
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
    const fresh = { v: VERSION, banked: 0, unlocks: { bite: false } };
    expect(parse(null)).toEqual(fresh);
    expect(parse('{not json')).toEqual(fresh);
    expect(parse('42')).toEqual(fresh);
    expect(parse('null')).toEqual(fresh);
  });

  it('reads back what it stored', () => {
    const s = { v: VERSION, banked: 120, unlocks: { bite: true } };
    expect(parse(JSON.stringify(s))).toEqual(s);
  });

  it('brings an older or damaged save up to date: missing fields to their start, bad values cleaned, unknown ones dropped', () => {
    expect(parse('{"banked":37}')).toEqual({ v: VERSION, banked: 37, unlocks: { bite: false } }); // before versions
    expect(parse('{"v":1,"banked":-5,"unlocks":{"bite":"yes"},"junk":1}')).toEqual({ v: VERSION, banked: 0, unlocks: { bite: false } });
    expect(parse('{"v":1,"banked":12.7}').banked).toBe(12);
    expect(parse('{"v":1,"banked":"NaN"}').banked).toBe(0);
  });
});
