import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { HUNCH, hurtOf, idleVariant, pick, stepOf, strideOn, viewOf, walkOf } from './gait.ts';
import type { HeroLook } from './hero.ts';

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

describe('walking', () => {
  // A sprite with every frame, walked right 1 px a frame (60 Hz) facing `facing`, `burden` of a full bag.
  const walker = () => ({ x: 0, y: 0, texture: { has: () => true }, getData: () => ({ squash: 0.6, run: { n: 8, stride: 34 }, trudge: { n: 6, stride: 26 }, back: { n: 6, stride: 24 } }) });
  const look = (facing: number, burden = 0): HeroLook => ({ moving: true, dashing: false, slashing: false, combo: 0, throwing: false, biting: false, casting: false, hurt: false, invulnerable: false, facing, burden });
  const walk = (s: ReturnType<typeof walker>, ms: number, l: HeroLook, t0: number, dx = 1) => Array.from({ length: Math.round(ms / 16) }, (_, i) => {
    s.x += dx;
    return pick(s as unknown as Phaser.GameObjects.Sprite, l, t0 + i * 16);
  });

  it('sets off leaning in, stalks, and plants a foot twice a stride', () => {
    const s = walker(), f = walk(s, 34 * 16, look(0), 1000); // one stride
    expect(f[0].walk?.frame).toBe('go-0');
    expect(f[10].walk?.frame).toMatch(/^run\d$/);
    expect(f.filter((p) => p.footfall).length).toBe(2);
  });

  it('trudges under a full bag', () => {
    const s = walker();
    expect(walk(s, 300, look(0, HUNCH), 1000).at(-1)?.walk?.frame).toMatch(/^trudge\d$/);
    expect(walk(s, 100, look(0, HUNCH - 0.1), 1300).at(-1)?.walk?.frame).toMatch(/^run\d$/);
  });

  it('pivots turning round, through the view toward the camera, then walks the new way', () => {
    const s = walker();
    walk(s, 300, look(0), 1000);
    const [turn] = walk(s, 16, look(Math.PI), 1300, -1), after = walk(s, 200, look(Math.PI), 1316, -1).at(-1)!;
    expect(turn.walk).toMatchObject({ view: 'down', frame: 'pivot-1' }); // right to left through the front: toward his right
    expect(after.walk).toMatchObject({ view: 'side', flip: true });
    expect(after.walk?.frame).toMatch(/^run\d$/);
  });
});

describe('combat and idle frames', () => {
  it('steps a timed action', () => {
    expect([0, 29, 30, 149, 150, 999].map((ms) => stepOf([0, 30, 90, 150], ms))).toEqual([0, 0, 1, 2, 3, 3]);
  });

  it('reels from where the blow came', () => {
    expect(hurtOf(0, undefined, false)).toBe('hurt');
    expect(hurtOf(0, deg(180), false)).toBe('hurt'); // facing right, struck from the right: head-on
    expect(hurtOf(0, deg(10), false)).toBe('hurtb'); // from the left, behind him
    expect(hurtOf(0, deg(90), false)).toBe('hurtl'); // thrown down the screen, to his right: it came from his left
    expect(hurtOf(0, deg(-90), false)).toBe('hurtr');
    expect(hurtOf(deg(180), deg(90), true)).toBe('hurtl'); // facing left (mirrored), thrown down: from his right, drawn as the left mirrored
  });

  it('now and then a gesture when he stands still', () => {
    expect(idleVariant(1000)).toBeUndefined();
    expect(idleVariant(2500)).toBe('glance-0');
    expect(idleVariant(2500 + 600)).toBe('glance-1');
    expect(idleVariant(2500 + 2000)).toBeUndefined();
    expect(idleVariant(2500 + 6000 + 600)).toBe('lift-1');
    expect(idleVariant(2500 + 12000 + 600)).toBe('breath-0');
    expect(idleVariant(2500 + 12000 + 100)).toBeUndefined();
    expect(idleVariant(2500 + 18000 + 600)).toBe('glance-1');
  });
});
