import { describe, expect, it } from 'vitest';
import { alertness, biteTarget, carry, scent, edgePip, viewSize, burnsAfter, dashStopsAt, dashStrikes, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, pickSpot, placeGroups, rayDistance, stepsFrom, swarmUnlocked, wound } from './logic.ts';
import { GIFTS, GIFT_IDS, KINDS, RARITY, kind, shelf, value } from './gifts.ts';
import { T } from './tuning.ts';
import { missing, width } from './font.ts';
import * as Crypt from './crypt.data.ts';

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

describe('gifts (training room)', () => {
  it('shelves slot gifts in slot order, then talents as taken, then pacts', () => {
    expect(shelf(['fuite', 'nuee', 'rongeur', 'griffes', 'nid'])).toEqual(['griffes', 'nid', 'nuee', 'fuite', 'rongeur']);
    expect(shelf(['maigre', 'rongeur', 'jet'])).toEqual(['jet', 'rongeur', 'maigre']);
    expect(kind('maigre')).toBe('pacte');
  });

  it('every gift text, at every rarity, is in the typeface; names fit on one line', () => {
    for (const id of GIFT_IDS) {
      const g = GIFTS[id], texts = [0, 1, 2].map(g.text);
      for (const t of texts) expect(missing(t)).toEqual([]);
      expect(missing(g.name + KINDS[kind(id)].toUpperCase() + RARITY.join('').toUpperCase())).toEqual([]);
      expect(width(g.name)).toBeLessThanOrEqual(120);
      if (g.ranked) expect(new Set(texts).size).toBe(3);
      for (const r of g.requires ?? []) expect(GIFT_IDS).toContain(r);
    }
  });

  it('a gift with a rarity is stronger at each rarity; the others have none', () => {
    for (const id of GIFT_IDS.filter((id) => GIFTS[id].ranked)) expect(value(id, 0) < value(id, 1) && value(id, 1) < value(id, 2)).toBe(true);
    expect(GIFTS.griffes.ranked && !GIFTS.perce.ranked && !GIFTS.contagion.ranked && !GIFTS.maigre.ranked).toBe(true);
    expect(value('perce', 2)).toBe(0);
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

  it('with the bite locked, a human is wounded like a ghoul (human false): weakened, it dies, never kneels', () => {
    expect(wound(2, 1, false, 1, false)).toEqual({ hp: 1, kneels: false });
    expect(wound(1, 1, false, 1, false)).toEqual({ hp: 0, kneels: false });
  });

  it('kneeling, no blow takes hp away; overkill from above still kills', () => {
    expect(wound(1, 2, true, 1, true)).toEqual({ hp: 1, kneels: false });
    expect(wound(2, 2, true, 1, false)).toEqual({ hp: 1, kneels: true }); // a heavy blow on a fresh human: he kneels
    expect(wound(2, 2, false, 1, false)).toEqual({ hp: 0, kneels: false }); // a ghoul just dies
  });
});

describe('expedition', () => {
  it('a foe sees the hero and hunts him; it gives up once it has not seen him for a while', () => {
    const G = 4000;
    let s = { alert: false, seenAt: -1e9 };
    expect((s = alertness(s, false, 1000, G))).toEqual({ alert: false, seenAt: -1e9 }); // idle, nothing seen
    expect((s = alertness(s, true, 2000, G))).toEqual({ alert: true, seenAt: 2000 });
    expect((s = alertness(s, false, 5999, G)).alert).toBe(true); // lost him 3.999 s ago: still hunting
    expect(alertness(s, true, 5999, G)).toEqual({ alert: true, seenAt: 5999 }); // seen again: the clock starts over
    expect((s = alertness(s, false, 6000, G)).alert).toBe(false); // 4 s without seeing him: gives up
    expect(alertness(s, false, 9000, G).alert).toBe(false); // and stays idle until it sees him again
  });

  it('carries blood up to the bag, leaving the rest behind', () => {
    expect(carry(0, 12, 400)).toEqual({ carried: 12, left: 0 });
    expect(carry(395, 12, 400)).toEqual({ carried: 400, left: 7 });
    expect(carry(400, 12, 400)).toEqual({ carried: 400, left: 12 });
  });

  it("the blood's scent calls a pack of the battue at each threshold crossed", () => {
    expect([scent(0, 49, 50), scent(49, 50, 50), scent(40, 160, 50), scent(100, 120, 50)]).toEqual([0, 1, 3, 0]);
  });

  it('pays more blood the deeper the ring: x1, x3, x8, x20', () => {
    expect(T.blood.ring.slice(1)).toEqual([1, 3, 8, 20]);
    const ghoul = T.blood.drops.ghoul;
    expect([1, 2, 3, 4].map((r) => ghoul * T.blood.ring[r])).toEqual([1, 3, 8, 20].map((k) => ghoul * k));
    for (const k of Object.values(T.blood.drops)) expect(k).toBeGreaterThan(0);
  });

  it('places the groups of a ring from its pool, away from where the hero comes in, apart from each other', () => {
    const stairs = { x: Crypt.STAIRS.x, y: Crypt.FY1 }, E = T.expedition;
    for (const ring of [1, 2, 3, 4]) {
      const pool = E.pools[ring] as readonly (readonly string[])[];
      for (let i = 0; i < 50; i++) {
        const groups = placeGroups(pool, E.groups[ring], Crypt.SPAWNS, stairs, E.clear, E.gap, Math.random);
        expect(groups.length).toBe(E.groups[ring]);
        for (const g of groups) {
          expect(pool).toContain(g.kinds);
          expect(Math.hypot(g.at.x - stairs.x, g.at.y - stairs.y)).toBeGreaterThanOrEqual(E.clear);
          for (const o of groups) if (o !== g) expect(Math.hypot(g.at.x - o.at.x, g.at.y - o.at.y)).toBeGreaterThanOrEqual(E.gap);
        }
      }
    }
    expect(E.pools[1].flat().every((k) => k === 'ghoul' || k === 'crossbow')).toBe(true); // gentle first
  });

  it('places fewer groups when the room has few points clear of the hero', () => {
    const near = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 500, y: 0 }];
    expect(placeGroups([['a']], 3, near, { x: 0, y: 0 }, 100, 50, Math.random)).toEqual([{ at: { x: 500, y: 0 }, kinds: ['a'] }]);
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
