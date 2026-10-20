import { describe, expect, it } from 'vitest';
import { BOXES, H, OVER, SPAWNS, START, STAIRS, W } from './refuge.data.ts';

// The baked refuge (tools/art/refuge.gen.mjs): where the hero and the training room's enemies start is clear of every
// box, and a way leads from his coffin down to the stairs.
const inBox = (x: number, y: number) => BOXES.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh);

describe('refuge', () => {
  it('starts the hero and the enemies on open floor', () => {
    expect(inBox(START.x, START.y + 11)).toBe(false); // his feet
    for (const s of SPAWNS) expect(inBox(s.x, s.y + 8)).toBe(false);
  });

  it('leads from the coffin to the stairs', () => {
    const C = 4, cols = Math.ceil(W / C), open = (c: number) => !inBox((c % cols) * C + 2, Math.floor(c / cols) * C + 2);
    const seen = new Set([Math.floor((START.y + 11) / C) * cols + Math.floor(START.x / C)]), todo = [...seen];
    let deepest = 0;
    while (todo.length) {
      const c = todo.pop()!;
      deepest = Math.max(deepest, Math.floor(c / cols) * C);
      for (const n of [c - 1, c + 1, c - cols, c + cols]) if (n >= 0 && n < cols * Math.ceil(H / C) && !seen.has(n) && open(n)) seen.add(n), todo.push(n);
    }
    expect(deepest).toBeGreaterThan(STAIRS);
  });

  it('cuts its sprites inside its atlas and its room', () => {
    for (const [, , w, h, x, y] of OVER) expect(x >= 0 && y >= 0 && x + w <= 2 * W && y + h <= 2 * H).toBe(true);
  });
});
