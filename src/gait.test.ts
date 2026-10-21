import { describe, expect, it } from 'vitest';
import { strideOn, viewOf, walkOf } from './gait.ts';

const deg = (d: number) => (d * Math.PI) / 180;

describe('gait', () => {
  it('faces eight ways, the left ones mirrored, or side-on without diagonals', () => {
    const views = [0, 45, 90, 135, 180, -135, -90, -45].map((d) => viewOf(deg(d), true));
    expect(views.map((v) => v.view)).toEqual(['side', 'downside', 'down', 'downside', 'side', 'upside', 'up', 'upside']);
    expect(views.map((v) => v.flip)).toEqual([false, false, false, true, true, true, false, false]);
    expect(viewOf(deg(60), false)).toEqual({ view: 'side', flip: false });
    expect(viewOf(deg(-120), false)).toEqual({ view: 'side', flip: true });
    expect(viewOf(deg(70), false).view).toBe('down');
  });

  it('walks ahead, backs off or side-steps to his right or left', () => {
    expect(walkOf(0, deg(45), false)).toBe('run');
    expect(walkOf(0, deg(180), false)).toBe('back');
    expect(walkOf(0, deg(-135), false)).toBe('back');
    expect(walkOf(0, deg(90), false)).toBe('strafer'); // facing right, going down the screen: to his right
    expect(walkOf(deg(90), 0, false)).toBe('strafel'); // facing the camera, going right: to his left
    // Facing left (mirrored), going down: to his left, drawn as the right-facing side-step to his right, mirrored.
    expect(walkOf(deg(180), deg(90), true)).toBe('strafer');
  });

  it('turns the walk by the floor walked, shorter up and down the screen', () => {
    expect(strideOn(34, 0, 0.6)).toBeCloseTo(34);
    expect(strideOn(34, deg(90), 0.6)).toBeCloseTo(34 * 0.6);
    expect(strideOn(34, deg(45), 0.6)).toBeLessThan(34);
  });
});
