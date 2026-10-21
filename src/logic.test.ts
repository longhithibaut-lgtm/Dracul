import { describe, expect, it } from 'vitest';
import { biteTarget, edgePip, viewSize, burnsAfter, dashStopsAt, dashStrikes, drawGifts, drawOffer, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, nextLayout, offerable, pickSpot, rayDistance, replaced, rollRarity, stepsFrom, swarmUnlocked, take, wound } from './logic.ts';
import { GIFTS, GIFT_IDS, KINDS, RARITY, cost, kind, replacing, shelf, value } from './gifts.ts';
import { T } from './tuning.ts';
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

  it('every gift text, at every rarity, is in the typeface and wraps to card width; names fit on one line', () => {
    for (const id of GIFT_IDS) {
      const g = GIFTS[id], texts = [0, 1, 2].map(g.text);
      for (const t of [...texts, replacing(id), cost(id)]) {
        expect(missing(t)).toEqual([]);
        expect(wrap(t, 112).every((l) => width(l) <= 112)).toBe(true);
      }
      expect(missing(g.name + KINDS[kind(id)].toUpperCase() + RARITY.join('').toUpperCase())).toEqual([]);
      expect(width(g.name)).toBeLessThanOrEqual(120);
      if (g.ranked) expect(new Set(texts).size).toBe(3); // the card shows the rarity's numbers
    }
    expect(missing('Don de la Maison du Rat · Vesna la Grise · Salle 9 · La Nuée répond : touche R · Amélioration : ')).toEqual(['·']);
  });

  it('a gift with a rarity is stronger at each rarity; the others have none', () => {
    for (const id of GIFT_IDS.filter((id) => GIFTS[id].ranked)) expect(value(id, 0) < value(id, 1) && value(id, 1) < value(id, 2)).toBe(true);
    expect(GIFTS.griffes.ranked && !GIFTS.perce.ranked && !GIFTS.contagion.ranked && !GIFTS.maigre.ranked).toBe(true);
    expect(value('perce', 2)).toBe(0);
  });

  const odds = { rare: [0.1, 0.03, 0.4], epic: [0.02, 0.015, 0.2] };
  it('rolls rare and épique gifts, more often as the run goes on, never past the cap', () => {
    expect(rollRarity(1, odds, () => 0.019)).toBe(2);
    expect(rollRarity(1, odds, () => 0.02)).toBe(1);
    expect(rollRarity(1, odds, () => 0.119)).toBe(1);
    expect(rollRarity(1, odds, () => 0.121)).toBe(0);
    expect(rollRarity(6, odds, () => 0.3)).toBe(1); // 9.5 % épique + 25 % rare
    expect(rollRarity(6, odds, () => 0.35)).toBe(0);
    expect(rollRarity(99, odds, () => 0.199)).toBe(2);
    expect(rollRarity(99, odds, () => 0.599)).toBe(1);
    expect(rollRarity(99, odds, () => 0.601)).toBe(0);
  });

  const O = { rarity: odds, pacts: { chance: 0.3, fromRoom: 2 } };
  const pacts = (cards: { id: string }[]) => cards.filter((c) => GIFTS[c.id as keyof typeof GIFTS].pact).length;
  it('a gift choice: three gifts, at most one pact and never in the first room', () => {
    for (let i = 0; i < 200; i++) {
      expect(pacts(drawOffer(GIFTS, [], {}, 'gift', 1, O, Math.random))).toBe(0);
      const d = drawOffer(GIFTS, ['griffes'], {}, 'gift', 3, O, Math.random);
      expect(d.length).toBe(3);
      expect(pacts(d)).toBeLessThanOrEqual(1);
      expect(d.some((c) => c.id === 'griffes')).toBe(false);
      if (pacts(d)) expect(GIFTS[d[2].id].pact).toBeTruthy(); // the pact is the last card, the others normal gifts
    }
    // rnd 0: a pact whenever one may be offered, every gift épique.
    expect(pacts(drawOffer(GIFTS, [], {}, 'gift', 2, O, () => 0))).toBe(1);
    expect(drawOffer<keyof typeof GIFTS>(GIFTS, [], {}, 'gift', 2, O, () => 0).filter((c) => GIFTS[c.id].ranked).every((c) => c.rank === 2)).toBe(true);
    // Nothing but pacts left: no gift choice.
    expect(drawOffer(GIFTS, GIFT_IDS.filter((id) => !GIFTS[id].pact), {}, 'gift', 3, O, () => 0)).toEqual([]);
  });

  it('a pact choice: two pacts and a gift to refuse them with; an upgrade: held gifts a rarity up', () => {
    const d = drawOffer(GIFTS, [], {}, 'pacte', 1, O, Math.random);
    expect(pacts(d)).toBe(2);
    expect(d.length).toBe(3);
    expect(drawOffer(GIFTS, ['maigre', 'noires', 'curee', 'vermine'], {}, 'pacte', 3, O, Math.random)).toEqual([]);
    const up = drawOffer(GIFTS, ['griffes', 'perce', 'fuite', 'maigre'], { griffes: 2, fuite: 1 }, 'upgrade', 3, O, Math.random);
    expect(up).toEqual([{ id: 'fuite', rank: 2, up: true }]); // perce and the pact have no rarity, griffes is épique
  });

  it('a pact is taken like a talent; a combo is offered once a gift it builds on is held', () => {
    expect(take(GIFTS, ['griffes', 'rongeur'], 'maigre')).toEqual(['griffes', 'rongeur', 'maigre']);
    expect(take(GIFTS, ['griffes', 'maigre'], 'grouillantes')).toEqual(['maigre', 'grouillantes']);
    expect(kind('maigre')).toBe('pacte');
    expect(shelf(['maigre', 'rongeur', 'jet'])).toEqual(['jet', 'rongeur', 'maigre']);
    expect(offerable(GIFTS, [])).not.toContain('fievre');
    expect(offerable(GIFTS, ['miasme'])).toEqual(expect.arrayContaining(['fievre', 'contagion']));
    expect(offerable(GIFTS, ['miasme'])).not.toContain('grouillement');
    expect(offerable(GIFTS, ['jet'])).toContain('grouillement');
  });

  it('la Nuée answers a hero holding enough gifts', () => {
    expect(swarmUnlocked(['griffes', 'jet'], T.swarm.gifts)).toBe(false);
    expect(swarmUnlocked(['griffes', 'jet', 'maigre'], T.swarm.gifts)).toBe(true);
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

describe('nextLayout', () => {
  const ids = ['hall', 'nave', 'ossuary'] as const;

  it('room 1 is always the hall, whatever came before', () => {
    expect(nextLayout(1, 'nave', ids, () => 0.99)).toBe('hall');
  });

  it('from room 2, any layout but the last one, each of them in turn', () => {
    const seen = new Set<string>();
    for (const prev of ids)
      for (const r of [0, 0.3, 0.5, 0.7, 0.999]) {
        const next = nextLayout(2, prev, ids, () => r);
        expect(next).not.toBe(prev);
        expect(ids).toContain(next);
        seen.add(next);
      }
    expect(seen.size).toBe(3);
  });
});

describe('stepsFrom', () => {
  // 4x3, a wall down the second column but for its bottom cell: the way round goes under it.
  const open = [true, false, true, true, true, false, true, true, true, true, true, true];

  it('counts the steps round closed cells, never cutting their corners', () => {
    const d = stepsFrom(open, 4, 0);
    expect(d[9]).toBe(3); // down, down, right: not diagonally past the wall's foot
    expect(d[2]).toBe(6); // then right, up, up
  });

  it('Infinity where no way leads', () => {
    expect(stepsFrom([true, false, true], 3, 0)[2]).toBe(Infinity);
  });
});

describe('viewSize', () => {
  it('shows 480x270 on any 16:9 screen, and grows the other side to the screen', () => {
    expect(viewSize(1920, 1080, 480, 270)).toEqual({ width: 480, height: 270 });
    expect(viewSize(915, 412, 480, 270)).toEqual({ width: 480, height: 216 }); // 20:9 phone, landscape: as wide as a room
    expect(viewSize(412, 915, 480, 270)).toEqual({ width: 270, height: 600 }); // and upright
    expect(viewSize(1024, 768, 480, 270)).toEqual({ width: 480, height: 360 }); // 4:3
    expect(viewSize(2560, 1080, 480, 270)).toEqual({ width: 480, height: 203 }); // 21:9
  });
});

describe('edgePip', () => {
  it('pins a point off the screen to its edge, pointing its way', () => {
    expect(edgePip(100, 50, 480, 270, 6)).toBeUndefined();
    expect(edgePip(-40, 50, 480, 270, 6)).toEqual({ x: 6, y: 50, dx: -1, dy: 0 });
    expect(edgePip(600, 400, 480, 270, 6)).toEqual({ x: 474, y: 264, dx: 1, dy: 1 });
  });
});
