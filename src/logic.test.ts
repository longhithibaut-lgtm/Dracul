import { describe, expect, it } from 'vitest';
import { inArc, waveSizes } from './logic.ts';

describe('inArc', () => {
  const o = { x: 0, y: 0 };

  it('hits a target straight ahead and in range', () => {
    expect(inArc(o, 0, { x: 50, y: 0 }, 60, 90)).toBe(true);
  });

  it('misses out of range or behind', () => {
    expect(inArc(o, 0, { x: 70, y: 0 }, 60, 90)).toBe(false);
    expect(inArc(o, 0, { x: -30, y: 0 }, 60, 90)).toBe(false);
  });

  it('respects the arc edge', () => {
    // 40° off-axis: inside a 90° arc (±45°), outside a 60° arc (±30°).
    const t = { x: Math.cos((40 * Math.PI) / 180) * 50, y: Math.sin((40 * Math.PI) / 180) * 50 };
    expect(inArc(o, 0, t, 60, 90)).toBe(true);
    expect(inArc(o, 0, t, 60, 60)).toBe(false);
  });

  it('works across the ±PI seam', () => {
    // Facing left (PI), target slightly below-left (angle ≈ -170°).
    expect(inArc(o, Math.PI, { x: -50, y: -9 }, 60, 90)).toBe(true);
  });
});

describe('waveSizes', () => {
  it('starts with one wave of 3 and keeps the total growing', () => {
    expect(waveSizes(1)).toEqual([3]);
    expect(waveSizes(2)).toEqual([2, 2]);
    expect(waveSizes(5)).toEqual([4, 3]);
  });
});
