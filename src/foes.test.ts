import { describe, expect, it } from 'vitest';
import { SHEETS } from './foes.data.ts';
import { aimAt } from './logic.ts';

// The baked sheets (tools/art/foes.gen.mjs) hold every frame foes.ts show() and die() ask for, in every view.
describe('foes sheets', () => {
  it('has every frame in every view, and the corpse', () => {
    for (const [kind, S] of Object.entries(SHEETS)) {
      const frames = ['idle0', 'idle1', 'idle2', 'idle3', 'hurt', 'kneel', ...Array.from({ length: S.WALK }, (_, k) => `walk${k}`),
        ...(kind === 'purifier' ? ['ignite', 'fire0', 'fire1', 'jet0', 'jet1'] : ['pray'])];
      for (const view of ['side', 'dside', 'down', 'uside', 'up']) for (const f of frames) expect(S.FRAMES[`${view}-${f}`], `${kind} ${view}-${f}`).toBeDefined();
      expect(S.FRAMES.corpse).toBeDefined();
    }
  });
});

describe('aimAt', () => {
  it('aims along the floor, the ground foreshortening undone, snapped', () => {
    expect(aimAt(10, 0, 0.72, 64)).toBeCloseTo(0);
    expect(aimAt(0, 10, 0.72, 64)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(aimAt(-10, 0, 0.72, 64))).toBeCloseTo(Math.PI);
    expect(aimAt(10, 7.2, 0.72, 64)).toBeCloseTo(Math.PI / 4); // a screen diagonal flattened by the squash is 45° on the floor
    expect(aimAt(10, 1, 1, 8)).toBe(0); // snapped to the nearest of 8
  });
});
