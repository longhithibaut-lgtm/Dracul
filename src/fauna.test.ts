import { describe, expect, it } from 'vitest';
import { alarmed, blow, bulk, caught, feed, floor, meal, pecked, startles, struggle, wakes } from './fauna.ts';
import { T } from './tuning.ts';

const sq = T.lantern.squash, C = T.crows, E = T.enterre, G = T.gave;

describe('Les Corneilles', () => {
  const flock = { x: 0, y: 0 };
  it('take fright at the hero nearer out of the light, or at a fight near them', () => {
    expect(startles(flock, { x: C.notice - 1, y: 0 }, true)).toBe(true);
    expect(startles(flock, { x: C.notice - 1, y: 0 }, false)).toBe(false); // in the shade he slips by
    expect(startles(flock, { x: C.shade - 1, y: 0 }, false)).toBe(true);
    expect(startles(flock, { x: 400, y: 0 }, false, { x: C.noise - 5, y: 0 })).toBe(true);
    expect(startles(flock, { x: 400, y: 0 }, false, { x: C.noise + 5, y: 0 })).toBe(false);
  });
  it('call every foe within the alarm radius not already hunting, the floor foreshortened', () => {
    const foes = [{ x: C.alarm - 1, y: 0, hunting: false }, { x: C.alarm + 1, y: 0, hunting: false }, { x: 10, y: 0, hunting: true },
      { x: 0, y: (C.alarm - 1) * sq, hunting: false }, { x: 0, y: (C.alarm + 1) * sq, hunting: false }];
    expect(alarmed(flock, foes)).toEqual([foes[0], foes[3]]);
  });
  it('peck only within their radius of the spot locked at the tell', () => {
    expect(pecked({ x: 0, y: 0 }, { x: C.peckRadius, y: 0 })).toBe(true);
    expect(pecked({ x: 0, y: 0 }, { x: C.peckRadius + 1, y: 0 })).toBe(false);
  });
  it('miss a hero who walks off 250 ms after the tell starts', () => {
    expect((T.hero.speed * (C.diveTellMs - 250)) / 1000).toBeGreaterThan(C.peckRadius);
  });
});

describe("L'Enterré", () => {
  const mound = { x: 0, y: 0 };
  it('wakes at the hero on his mound, catches him only still in reach at the end of the tell', () => {
    expect(wakes(mound, { x: E.trigger, y: 0 })).toBe(true);
    expect(wakes(mound, { x: E.trigger + 1, y: 0 })).toBe(false);
    expect(caught(mound, { x: E.reach, y: 0 })).toBe(true);
    // woken at the trigger's edge, walking off 250 ms into the tell takes him out of reach
    expect(caught(mound, { x: E.trigger + (T.hero.speed * (E.crackMs - 250)) / 1000, y: 0 })).toBe(false);
  });
  it('lets go after enough struggle: claws on him count more than keys', () => {
    let s = { points: 0, free: false }, keys = 0, blows = 0;
    while (!s.free) (s = struggle(s.points, 'key')), keys++;
    s = { points: 0, free: false };
    while (!s.free) (s = struggle(s.points, 'blow')), blows++;
    expect(keys).toBe(Math.ceil(E.free / E.key));
    expect(blows).toBe(Math.ceil(E.free / E.blow));
    expect(blows).toBeLessThan(keys);
  });
});

describe('Le Gavé', () => {
  it('grows and heals with each body, up to its max', () => {
    let g: { fed: number; hp: number; max: number } = { fed: 0, hp: 5, max: G.hp };
    g = feed(g);
    expect(g).toEqual({ fed: 1, max: G.hp + G.grow.hp, hp: 5 + G.grow.heal });
    for (let i = 0; i < 10; i++) g = feed(g);
    expect(g.fed).toBe(G.max);
    expect(g.max).toBe(G.hp + G.max * G.grow.hp);
    expect(g.hp).toBeLessThanOrEqual(g.max);
    expect(bulk(G.max)).toBeCloseTo(1 + G.max * G.grow.scale);
    expect(blow(G.slamDamage, 0)).toBe(G.slamDamage);
    expect(blow(G.slamDamage, 2)).toBe(G.slamDamage + Math.floor(2 * G.grow.damage));
  });
  it('smells the nearest body within its reach', () => {
    const bodies = [{ x: 100, y: 0 }, { x: 40, y: 0 }, { x: 0, y: (G.smell + 5) * sq }];
    expect(meal({ x: 0, y: 0 }, bodies)).toBe(bodies[1]);
    expect(meal({ x: 0, y: 0 }, [bodies[2]])).toBeUndefined();
    expect(floor({ x: 0, y: 0 }, { x: 0, y: sq })).toBeCloseTo(1);
  });
  it('slam and bile miss a hero who steps aside 250 ms after the tell starts', () => {
    const walk = (ms: number) => (T.hero.speed * (ms - 250)) / 1000;
    expect(Math.hypot(30 - G.slamAhead, walk(G.slamTeleMs))).toBeGreaterThan(G.slamRadius); // he stood 30 ahead
    expect(Math.atan2(walk(G.bileTeleMs) / sq, 50) * (180 / Math.PI)).toBeGreaterThan(G.bileHalfDeg); // 50 ahead, down the screen
  });
});
