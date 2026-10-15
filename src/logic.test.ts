import { describe, expect, it } from 'vitest';
import { burnsAfter, dashStopsAt, ellipseDist, inArc, nextCombo, pickSpot } from './logic.ts';

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
