import { describe, expect, it } from 'vitest';
import { SHEETS } from './foes.data.ts';
import { aimAt, inArc } from './logic.ts';
import { T } from './tuning.ts';

// The baked sheets (tools/art/foes.gen.mjs) hold every frame foes.ts show() and die() ask for, in every view.
describe('foes sheets', () => {
  it('has every frame in every view, and the corpse', () => {
    for (const [kind, S] of Object.entries(SHEETS)) {
      const frames = ['idle0', 'idle1', 'idle2', 'idle3', 'hurt', 'kneel', ...Array.from({ length: S.WALK }, (_, k) => `walk${k}`),
        ...{ purifier: ['ignite', 'fire0', 'fire1', 'jet0', 'jet1'], priest: ['pray'], hound: ['tele', 'leap'], penitent: ['tele', 'atk'], ringer: ['tele', 'atk'],
          inquisitor: ['whirl0', 'whirl1', 'whirl2', 'whirl3', 'sweep0', 'sweep1', 'sweep2', 'parry'] }[kind]!];
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

// The Inquisiteur's parry (RoomScene.parried()): a blow from a point in front of where he faces is turned aside, one from
// his back lands, however far the point.
describe('inquisitor parry', () => {
  const front = (facing: number, x: number, y: number) => inArc({ x: 0, y: 0 }, facing, { x, y }, Infinity, 2 * T.inquisitor.parryDeg);
  it('turns aside what comes at his front, never what comes at his back', () => {
    expect(front(0, 30, 0)).toBe(true); // straight ahead
    expect(front(0, 300, -250)).toBe(true); // far, and to the side but ahead
    expect(front(0, -30, 0)).toBe(false); // behind
    expect(front(0, -1, 30)).toBe(false); // just past his side
    expect(front(Math.PI / 2, 2, 30)).toBe(true); // facing down the screen
    expect(front(Math.PI / 2, 0, -30)).toBe(false);
    expect(front(Math.PI - 0.1, -30, -5)).toBe(true); // across the ±PI seam
    expect(front(-Math.PI + 0.1, 30, 5)).toBe(false);
  });
});
