import { describe, expect, it } from 'vitest';
import { BEDS, bedAt, hear, sources, tension, type Hero } from './ambience.ts';
import { WORLD } from './world.ts';
import { ARENA, AREAS } from './catacombs.data.ts';
import { AREAS as NEC } from './necropolis.data.ts';

const mid = (id: string, areas: { id: string; rect: number[] }[]) => { const [x0, y0, x1, y1] = areas.find((a) => a.id === id)!.rect; return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; };
const calm: Hero = { blood: 0, life: 1, combat: false, boss: false, battue: Infinity };

describe('ambience', () => {
  it('gives every place a bed, the catacombs\' nest and prison their own', () => {
    for (const l of Object.keys(WORLD)) expect(BEDS[bedAt(l, 10, 10)], l).toBeDefined();
    expect(bedAt('refuge', 800, 600)).toBe('refuge');
    expect(bedAt('hall', 100, 100)).toBe('crypt');
    expect(bedAt('chapel', 100, 100)).toBe('chapel');
    expect(bedAt('necropolis', mid('camp', NEC).x, mid('camp', NEC).y)).toBe('necropolis'); // the camp: its voices and fires, set in the world
    expect(bedAt('catacombs', mid('nid', AREAS).x, mid('nid', AREAS).y)).toBe('nest');
    expect(bedAt('catacombs', (ARENA[0] + ARENA[2]) / 2, (ARENA[1] + ARENA[3]) / 2)).toBe('prison');
    expect(bedAt('catacombs', mid('croisee', AREAS).x, mid('croisee', AREAS).y)).toBe('catacombs');
    // music at the refuge, rarely in the zones, never in the interiors
    expect(BEDS.refuge.music[1]).toBeLessThan(BEDS.necropolis.music[1]);
    expect('music' in BEDS.crypt || 'music' in BEDS.chapel).toBe(false);
  });

  it('hears a source full near it, fading with distance, panned to its side', () => {
    const at = { x: 0, y: 0 }, R = [30, 180] as const;
    expect(hear([{ x: 10, y: 0 }], at, R).g).toBe(1);
    const mid = hear([{ x: 100, y: 0 }], at, R), far = hear([{ x: 170, y: 0 }], at, R);
    expect(mid.g).toBeGreaterThan(far.g);
    expect(far.g).toBeGreaterThan(0);
    expect(hear([{ x: 200, y: 0 }], at, R).g).toBe(0);
    expect(mid.pan).toBeGreaterThan(0.5);
    expect(hear([{ x: -100, y: 0 }], at, R).pan).toBeLessThan(-0.5);
    expect(hear([{ x: -100, y: 0 }, { x: 100, y: 0 }], at, R).pan).toBeCloseTo(0); // one each side: centred
    expect(hear(Array.from({ length: 9 }, () => ({ x: 5, y: 0 })), at, R).g).toBe(1); // many: never louder than one near
  });

  it('places the world\'s sounds: flames, lanterns, holy light (the chapel\'s sings), the lake, the camp', () => {
    const room = (holy: boolean) => ({ look: { torches: [[10, 20, 1]] }, zone: { lamps: [{ x: 5, y: 5 }] }, holy: () => holy, width: 48, height: 48 }) as unknown as Parameters<typeof sources>[1];
    const nec = sources('necropolis', room(true));
    expect(nec.fire).toEqual([{ x: 10, y: 20 }]);
    expect(nec.hum).toEqual([{ x: 5, y: 5 }]);
    expect(nec.burn!.length).toBe(4);
    expect(nec.voices!.length).toBe(1);
    expect(sources('chapel', room(true)).choir!.length).toBe(4);
    expect(sources('catacombs', room(false)).water!.length).toBeGreaterThan(0);
    expect(sources('refuge', room(false), { breath: { x: 1, y: 2 } }).breath).toEqual([{ x: 1, y: 2 }]);
  });

  it('raises the tension layers with the state', () => {
    const t = (h: Partial<Hero>) => tension({ ...calm, ...h });
    expect(t({})).toMatchObject({ heart: 0, pulse: 0, boss: 0, muffle: 0, bay: 0, music: true });
    expect(t({ blood: 0.4 }).heart).toBe(0);
    expect(t({ blood: 0.7 }).heart).toBeCloseTo(0.5);
    expect(t({ blood: 1 }).heart).toBe(1);
    expect(t({ life: 0.2 })).toMatchObject({ heart: 1, muffle: 1, music: false }); // one blood of five
    expect(t({ life: 0.2 }).beat).toBeLessThan(t({ blood: 1 }).beat); // near death, faster
    expect(t({ life: 0.6 }).muffle).toBe(0);
    expect(t({ combat: true })).toMatchObject({ pulse: 1, music: false });
    expect(t({ combat: true, boss: true })).toMatchObject({ pulse: 0, boss: 1, music: false }); // the boss' drone instead
    expect(t({ battue: 0 }).bay).toBe(1);
    expect(t({ battue: 20 }).bay).toBeCloseTo(0.5);
    expect(t({ battue: 60 }).bay).toBe(0);
  });
});
