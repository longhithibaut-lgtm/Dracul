import { describe, expect, it } from 'vitest';
import { inArc, nextCombo } from './logic.ts';

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
