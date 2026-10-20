import { describe, expect, it } from 'vitest';
import { SHEETS } from './foes.data.ts';

// The baked sheets (tools/art/foes.gen.mjs) hold every frame foes.ts show() and die() ask for, in every view.
describe('foes sheets', () => {
  const asked = { purifier: ['idle', 'walk0', 'walk3', 'ignite', 'fire0', 'fire1', 'kneel'], priest: ['idle', 'walk0', 'walk1', 'pray', 'kneel'] };
  it('has every frame in every view, and the corpse', () => {
    for (const [kind, frames] of Object.entries(asked)) {
      const S = SHEETS[kind as keyof typeof SHEETS];
      for (const view of ['side', 'dside', 'down', 'uside', 'up']) for (const f of frames) expect(S.FRAMES[`${view}-${f}`], `${kind} ${view}-${f}`).toBeDefined();
      expect(S.FRAMES.corpse).toBeDefined();
    }
  });
});
