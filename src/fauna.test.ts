import { describe, expect, it } from 'vitest';
import { alarmed, blow, bulk, caught, decks, feed, floor, flung, haul, inPit, meal, nearestEdge, netAt, netted, pecked, startles, stirs, struggle, swept, wakes } from './fauna.ts';
import { PITS } from './necropolis.data.ts';
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

describe('La Chose du gouffre', () => {
  const K = T.chose, edge = { x: 0, y: 0 }, walk = (ms: number) => (T.hero.speed * ms) / 1000;
  it("grips the necropolis' two decks over the chasm: the causeway and the bridge, nothing else", () => {
    const d = decks(PITS.map(([x, y, width, height]) => ({ x, y, width, height })));
    expect(d.map((e) => [e.y, e.depth])).toEqual([[216, 32], [1152, 40]]);
    expect(nearestEdge(d, { x: 1300, y: 1100 })!.y).toBe(1152);
    expect(nearestEdge(d, { x: 900, y: 100 })!.y).toBe(216);
  });
  it('stirs at the hero on its deck, and its sweep strikes only who the hand passes', () => {
    expect(stirs(edge, { x: K.span + K.notice, y: 20 })).toBe(true);
    expect(stirs(edge, { x: 0, y: -20 })).toBe(false); // over the chasm side
    expect(swept(edge, 10, { x: 10 + K.hand, y: 20 })).toBe(true);
    expect(swept(edge, 10, { x: 10 + K.hand + 1, y: 20 })).toBe(false);
    expect(swept(edge, 0, { x: 0, y: K.reach + 1 })).toBe(false);
  });
  it('flings a hero struck on a deck into the chasm (the fall), one struck on solid floor onto it', () => {
    const pits = [{ x: -50, y: -60, width: 100, height: 60 }, { x: -50, y: 40, width: 100, height: 80 }]; // a deck 40 deep
    const to = flung({ x: 0, y: 20 });
    expect(to.y).toBeGreaterThan(40); // past the deck's far edge
    expect(inPit(pits, to)).toBe(true);
    expect(inPit([pits[0]], to)).toBe(false); // no chasm beyond: thrown onto the stone
  });
  it('misses a hero who walks off along the deck 250 ms into the tell', () => {
    expect(10 + walk(K.teleMs - 250)).toBeGreaterThan(K.span + K.hand); // stood 10 px from its middle
  });
});

describe('Le Crocheteur', () => {
  const K = T.crocheteur, flight = (K.netRange / K.netSpeed) * 1000;
  it('nets a hero standing where it flies, misses one who stepped aside 250 ms into the tell', () => {
    const from = { x: 0, y: 0 }, tFly = (70 / K.netSpeed) * 1000;
    expect(netted(netAt(from, 0, tFly), { x: 70, y: 0 })).toBe(true);
    // he stands 70 px off and walks down the screen from 250 ms; the aim follows him until netLockMs before the net leaves
    const y = (ms: number) => (T.hero.speed * Math.max(0, ms - 250)) / 1000, aim = Math.atan2(y(K.netTeleMs - K.netLockMs) / T.lantern.squash, 70);
    let caught = false;
    for (let t = 0; t <= flight; t += 16) caught ||= netted(netAt(from, aim, t), { x: 70, y: y(K.netTeleMs + t) });
    expect(caught).toBe(false);
  });
  it('is torn off sooner with claws than with keys', () => {
    let s = { points: 0, free: false }, keys = 0, blows = 0;
    while (!s.free) (s = struggle(s.points, 'key', K)), keys++;
    s = { points: 0, free: false };
    while (!s.free) (s = struggle(s.points, 'blow', K)), blows++;
    expect([keys, blows]).toEqual([Math.ceil(K.free / K.key), Math.ceil(K.free / K.blow)]);
  });
  it('hauls him to the nearest foe or lantern in reach, else to his post', () => {
    const home = { x: -500, y: 0 }, foe = { x: 100, y: 0 }, lamp = { x: 60, y: 0 };
    expect(haul({ x: 0, y: 0 }, [foe, lamp], home)).toBe(lamp);
    expect(haul({ x: 0, y: 0 }, [{ x: K.dragRange + 1, y: 0 }], home)).toBe(home);
  });
});
