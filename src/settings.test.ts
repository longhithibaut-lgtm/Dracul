import { describe, expect, it } from 'vitest';
import { DEFAULTS, gain, gamma, parse } from './settings.ts';

describe('options', () => {
  it('read back as saved, or their defaults', () => {
    expect(parse(null)).toEqual(DEFAULTS);
    expect(parse('{x')).toEqual(DEFAULTS);
    expect(parse(JSON.stringify({ master: 40, effects: 120, mute: true, bright: 70.4, grain: 'no' }))).toEqual({ ...DEFAULTS, master: 40, mute: true, bright: 70 });
  });
  it('a volume as a gain, the brightness as an exponent', () => {
    expect([gain(0), gain(50), gain(100)]).toEqual([0, 0.25, 1]);
    expect([gamma(0), gamma(50), gamma(100)]).toEqual([2, 1, 0.5]);
  });
});
