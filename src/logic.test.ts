import { describe, expect, it } from 'vitest';
import { biteTarget, burnsAfter, dashStopsAt, dashStrikes, drawGifts, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, offerable, pickSpot, rayDistance, replaced, take, wound } from './logic.ts';
import { GIFTS, GIFT_IDS, KINDS, kind, replacing, shelf } from './gifts.ts';
import { missing, width, wrap } from './font.ts';

describe('inArc', () => {
  const o = { x: 0, y: 0 };

  it('hits ahead in range, misses out of range or behind', () => {
    expect(inArc(o, 0, { x: 25, y: 0 }, 30, 90)).toBe(true);
    expect(inArc(o, 0, { x: 35, y: 0 }, 30, 90)).toBe(false);
    expect(inArc(o, 0, { x: -20, y: 0 }, 30, 90)).toBe(false);
  });

  it('respects the arc edge and the ±PI seam', () => {
    const t = { x: Math.cos((40 * Math.PI) / 180) * 20, y: Math.sin((40 * Math.PI) / 180) * 20 };
    expect(inArc(o, 0, t, 30, 90)).toBe(true);
    expect(inArc(o, 0, t, 30, 60)).toBe(false);
    expect(inArc(o, Math.PI, { x: -25, y: -4 }, 30, 90)).toBe(true);
  });
});

describe('biteTarget', () => {
  const o = { x: 0, y: 0 };
  const human = (x: number, y: number, hp: number) => ({ x, y, hp, human: true });

  it('bites the nearest weakened human ahead, in reach', () => {
    const near = human(15, 2, 1), far = human(24, 0, 1);
    expect(biteTarget(o, 0, [far, near], 26, 140, 1)).toBe(near);
  });

  it('never a healthy human, a ghoul, one out of reach or behind', () => {
    expect(biteTarget(o, 0, [human(15, 0, 2)], 26, 140, 1)).toBeUndefined(); // not weakened yet
    expect(biteTarget(o, 0, [{ x: 15, y: 0, hp: 1, human: false }], 26, 140, 1)).toBeUndefined(); // dead blood
    expect(biteTarget(o, 0, [human(30, 0, 1)], 26, 140, 1)).toBeUndefined();
    expect(biteTarget(o, 0, [human(-15, 0, 1)], 26, 140, 1)).toBeUndefined();
  });

  it('unaimed (a full circle): the nearest one all around, behind included', () => {
    const behind = human(-12, 3, 1);
    expect(biteTarget(o, 0, [human(20, 0, 1), behind], 26, 360, 1)).toBe(behind);
  });
});

describe('nextCombo', () => {
  it('chains 0→1→2→0 inside the window and restarts outside it', () => {
    expect(nextCombo(0, 100, 450)).toBe(1);
    expect(nextCombo(1, 100, 450)).toBe(2);
    expect(nextCombo(2, 100, 450)).toBe(0);
    expect(nextCombo(1, 900, 450)).toBe(0);
  });
});

describe('dashStopsAt', () => {
  const v = { x: 100, y: 0 }; // 0.1 s covers 10 px

  it('stops at contact with a target the dash would end on, including on its last frame', () => {
    expect(dashStopsAt({ x: 0, y: 0 }, v, 0.4, { x: 30, y: 0 }, 20)).toBe(false); // not in contact yet
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 30, y: 0 }, 20)).toBe(true);
    expect(dashStopsAt({ x: 25, y: 0 }, v, 0, { x: 40, y: 0 }, 20)).toBe(true);
  });

  it('passes through targets mid-path and never stops for one behind or off to the side', () => {
    expect(dashStopsAt({ x: 0, y: 0 }, v, 0.4, { x: 10, y: 0 }, 20)).toBe(false);
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 2, y: 0 }, 20)).toBe(false);
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 30, y: 25 }, 20)).toBe(false);
  });
});

describe('rayDistance', () => {
  const room = { x: 0, y: 0, width: 100, height: 100 };
  const from = { x: 50, y: 50 };
  const prop = { x: 70, y: 40, width: 10, height: 20 };

  it('stops at the first prop ahead, else at the wall', () => {
    expect(rayDistance(from, 0, room, [prop])).toBeCloseTo(20);
    expect(rayDistance(from, Math.PI, room, [prop])).toBeCloseTo(50); // prop behind
    expect(rayDistance(from, -Math.PI / 2, room, [prop])).toBeCloseTo(50); // straight up, prop off to the side
    expect(rayDistance({ x: 50, y: 10 }, 0, room, [prop])).toBeCloseTo(50); // passes above it
  });

  it('clips a prop corner on a diagonal', () => {
    expect(rayDistance({ x: 60, y: 30 }, Math.PI / 4, room, [prop])).toBeCloseTo(Math.SQRT2 * 10);
  });
});

describe('keepDistance', () => {
  it('closes in when far, strafes in the band, backs off when close, on its side', () => {
    expect(Math.abs(keepDistance(200, 110, 140, 1))).toBeLessThan(0.2 * Math.PI + 1e-9);
    expect(keepDistance(125, 110, 140, 1)).toBeCloseTo(Math.PI / 2);
    expect(keepDistance(125, 110, 140, -1)).toBeCloseTo(-Math.PI / 2);
    expect(keepDistance(60, 110, 140, 1)).toBeGreaterThan(0.85 * Math.PI);
  });
});

describe('glyphSpot', () => {
  const room = { x: 0, y: 0, width: 200, height: 100 };

  it('lands on the target in reach, else at the end of the reach toward it', () => {
    expect(glyphSpot({ x: 50, y: 50 }, { x: 80, y: 90 }, 110, room)).toEqual({ x: 80, y: 90 });
    const far = glyphSpot({ x: 20, y: 50 }, { x: 180, y: 50 }, 110, room);
    expect(far).toEqual({ x: 130, y: 50 });
  });

  it('stays in the room, never farther than the reach from a hero inside it', () => {
    const p = glyphSpot({ x: 190, y: 90 }, { x: 260, y: 160 }, 110, room);
    expect(p).toEqual({ x: 200, y: 100 });
    const q = glyphSpot({ x: 10, y: 10 }, { x: -100, y: 60 }, 110, room);
    expect(q.x).toBe(0);
    expect(Math.hypot(q.x - 10, q.y - 10)).toBeLessThanOrEqual(110);
  });
});

describe('holy light', () => {
  it('pools are squashed ellipses: wider than tall', () => {
    const c = { x: 100, y: 100 };
    expect(ellipseDist(c, { x: 139, y: 100 }, 40, 29)).toBeLessThan(1);
    expect(ellipseDist(c, { x: 100, y: 128 }, 40, 29)).toBeLessThan(1);
    expect(ellipseDist(c, { x: 100, y: 131 }, 40, 29)).toBeGreaterThan(1);
    expect(ellipseDist(c, { x: 130, y: 122 }, 40, 29)).toBeGreaterThan(1); // past the edge on the diagonal
  });

  it('burns after a grace, then on a steady beat', () => {
    expect(burnsAfter(0, 400, 900)).toBe(0);
    expect(burnsAfter(399, 400, 900)).toBe(0);
    expect(burnsAfter(400, 400, 900)).toBe(1);
    expect(burnsAfter(1299, 400, 900)).toBe(1);
    expect(burnsAfter(1300, 400, 900)).toBe(2);
  });

  it('plants the lantern nearest the hero, never lighting him nor on a taken spot', () => {
    const spots = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 200, y: 0 }];
    expect(pickSpot(spots, { x: 10, y: 0 }, [], 40, 29, 1.3)).toEqual({ x: 70, y: 0 }); // (0,0) would light him
    expect(pickSpot(spots, { x: 10, y: 0 }, [{ x: 70, y: 0 }], 40, 29, 1.3)).toEqual({ x: 200, y: 0 });
    expect(pickSpot(spots.slice(0, 1), { x: 10, y: 0 }, [], 40, 29, 1.3)).toBeUndefined();
  });
});

describe('gifts', () => {
  const seq = (...v: number[]) => () => v.shift() ?? 0;

  it('draws distinct untaken gifts, as many as are left', () => {
    const held = ['griffes', 'fuite'] as const;
    const d = drawGifts(offerable(GIFTS, held), 3, Math.random);
    expect(new Set(d).size).toBe(3);
    expect(d.some((g) => (held as readonly string[]).includes(g))).toBe(false);
    expect(drawGifts(offerable(GIFTS, GIFT_IDS.slice(0, -1)), 3, Math.random)).toEqual(GIFT_IDS.slice(-1));
    expect(drawGifts(offerable(GIFTS, GIFT_IDS), 3, Math.random)).toEqual([]);
  });

  it('follows the injected random function', () => {
    expect(drawGifts(['a', 'b', 'c'], 3, seq(0.99, 0.99))).toEqual(['a', 'b', 'c']); // every swap in place
    expect(drawGifts(['a', 'b', 'c'], 3, seq(0, 0))).toEqual(['b', 'c', 'a']);
  });

  // A made-up second house sharing the claws slot, until one exists.
  const defs = { a: { slot: 'griffes' }, b: { slot: 'tir' }, wolf: { slot: 'griffes' }, t: {}, u: {}, needs: { requires: ['a', 'b'] } };

  it('one gift per slot: a slot gift replaces the one in its slot, talents stack', () => {
    expect(replaced(defs, ['a', 't'], 'wolf')).toBe('a');
    expect(take(defs, ['a', 'b', 't'], 'wolf')).toEqual(['b', 't', 'wolf']);
    expect(take(defs, ['wolf', 't'], 'a')).toEqual(['t', 'a']);
    expect(replaced(defs, ['a', 'b'], 't')).toBeUndefined();
    expect(take(defs, ['a', 't'], 'u')).toEqual(['a', 't', 'u']);
    expect(take(defs, ['t'], 'b')).toEqual(['t', 'b']); // an empty slot
  });

  it('offers a gift with a prerequisite only once one of them is held', () => {
    expect(offerable(defs, ['t'])).not.toContain('needs');
    expect(offerable(defs, ['b'])).toContain('needs');
    expect(offerable(defs, ['a', 'needs'])).not.toContain('needs');
    expect(offerable(GIFTS, [])).not.toContain('contagion');
    expect(offerable(GIFTS, ['eclats'])).toContain('contagion');
    for (const g of Object.values(GIFTS)) expect(GIFT_IDS).toEqual(expect.arrayContaining([...(g.requires ?? [])]));
  });

  it('shelves slot gifts in slot order, then talents as taken', () => {
    expect(shelf(['fuite', 'nuee', 'rongeur', 'griffes', 'nid'])).toEqual(['griffes', 'nid', 'nuee', 'fuite', 'rongeur']);
  });

  it('every gift text is in the typeface and wraps to card width', () => {
    for (const id of GIFT_IDS) {
      const g = GIFTS[id];
      expect(missing(g.name + g.text + KINDS[kind(id)].toUpperCase() + replacing(id))).toEqual([]);
      for (const t of [g.text, replacing(id)]) expect(wrap(t, 112).every((l) => width(l) <= 112)).toBe(true);
    }
    expect(missing('Don de la Maison du Rat · Vesna la Grise · Salle 9')).toEqual(['·']);
  });
});

describe('dashStrikes', () => {
  it('at the end of the dash and up to the window after it, not later, and never before any dash', () => {
    expect(dashStrikes(1100, 1100, 500, 120)).toBe(true); // pressed mid-dash, fired as it ends
    expect(dashStrikes(1220, 1100, 500, 120)).toBe(true);
    expect(dashStrikes(1221, 1100, 500, 120)).toBe(false);
    expect(dashStrikes(50, 0, -1e9, 120)).toBe(false);
  });

  it('once per dash: the next slash in the window is an ordinary one', () => {
    expect(dashStrikes(1200, 1100, 1100, 120)).toBe(false);
  });
});

describe('wound', () => {
  it('a human brought down to weakAt kneels; a ghoul or a human already weak does not', () => {
    expect(wound(2, 1, true, 1, false)).toEqual({ hp: 1, kneels: true });
    expect(wound(2, 0.5, true, 1, false)).toEqual({ hp: 1.5, kneels: false });
    expect(wound(2, 1, false, 1, false)).toEqual({ hp: 1, kneels: false });
    expect(wound(1, 1, true, 1, false)).toEqual({ hp: 0, kneels: false }); // after the kneel: killable
  });

  it('kneeling, no blow takes hp away; overkill from above still kills', () => {
    expect(wound(1, 2, true, 1, true)).toEqual({ hp: 1, kneels: false });
    expect(wound(2, 2, true, 1, false)).toEqual({ hp: 1, kneels: true }); // a heavy blow on a fresh human: he kneels
    expect(wound(2, 2, false, 1, false)).toEqual({ hp: 0, kneels: false }); // a ghoul just dies
  });
});
