import { describe, expect, it } from 'vitest';
import { H, W, paintRoom } from './torture.ts';

const inArch = (x: number, y: number, cx: number, hw: number, ys: number, R: number) => { // room.ts's
  const dx = Math.abs(x + 0.5 - cx);
  return y >= ys ? dx < hw : (dx - hw + R) ** 2 + (ys - y) ** 2 < R * R;
};

describe('paintRoom', () => {
  const r = paintRoom((x, y, g) => inArch(x, y, 240, 22 + g, 44, 28 + g));

  it('keeps the portcullis to the gate: open and shut differ nowhere else', () => {
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i / W) | 0;
      if (r.open[i * 4] !== r.shut[i * 4] || r.open[i * 4 + 2] !== r.shut[i * 4 + 2]) expect(inArch(x, y, 240, 22, 44, 28)).toBe(true);
    }
  });

  it('cuts every standing thing out as a sprite with pixels, sorted at its feet below it', () => {
    expect(r.sprites.length).toBeGreaterThan(15);
    for (const s of r.sprites) {
      expect(s.d.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
      expect(s.feet).toBeGreaterThanOrEqual(s.y);
    }
  });

  it('lights the floor by the torches, leaves the far floor dark, and stores flat floor at height 0', () => {
    const light = (x: number, y: number) => r.light[(y * W + x) * 4], z = (x: number, y: number) => r.light[(2 * W * H + y * W + x) * 4] - 64;
    expect(light(112, 118)).toBeGreaterThan(light(240, 250)); // at the first pillar's torch, and mid-floor
    expect(z(240, 250)).toBe(0);
    expect(z(300, 30)).toBeGreaterThan(0); // the back wall stands up
  });
});

// dark.ts's shader computes the mockup's 4x4 Bayer matrix with arithmetic (GLSL ES 1 has no bit ops): the same here.
describe('bayer', () => {
  const m2 = (a: number, b: number) => 2 * a + 3 * b - 4 * a * b;
  const bayer = (x: number, y: number) => 4 * m2(x % 2, y % 2) + m2(Math.floor(x / 2) % 2, Math.floor(y / 2) % 2);
  it('is the mockup matrix', () => {
    const M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(bayer(x, y)).toBe(M[y * 4 + x]);
  });
});
