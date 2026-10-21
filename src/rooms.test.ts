import { describe, expect, it } from 'vitest';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import type { Plan } from './baked.ts';
import { runMask } from './logic.ts';

// The run rooms baked by tools/art/rooms.gen.mjs keep the rules their painted versions checked: every start point clear
// of props and pits, the Order's lantern spots too; a way from the stairs to each of its two exits; and out of holy light (the Dawn,
// the chapel's stained glass), the hero's start, the gift and the lanes up to them.
const ROOMS: [string, Plan][] = [['crypt', Crypt], ['nave', Nave], ['ossuary', Ossuary], ['chapel', Chapel], ['cloister', Cloister]];
const boxes = (D: Plan) => [...D.BOXES, ...D.PITS.map((b) => [b.x, b.y, b.w, b.h])];
const dist = (D: Plan, x: number, y: number) => Math.min(...boxes(D).map(([bx, by, bw, bh]) => Math.hypot(Math.max(bx - x, 0, x - bx - bw), Math.max(by - y, 0, y - by - bh))));
const sky = (D: Plan) => { const m = runMask(D.HOLY, D.W, D.H); return (x: number, y: number) => m[Math.floor(y) * D.W + Math.floor(x)] === 1; };
const inside = (D: Plan, x: number, y: number) => x >= D.BOUNDS[0] && y >= D.BOUNDS[1] && x <= D.BOUNDS[0] + D.BOUNDS[2] && y <= D.BOUNDS[1] + D.BOUNDS[3];

describe.each(ROOMS)('%s', (_, D) => {
  it('starts everyone on open floor', () => {
    for (const s of [D.START, ...D.SPAWNS]) expect(inside(D, s.x, s.y + 8) && dist(D, s.x, s.y + 8) > 7, `${s.x},${s.y}`).toBe(true);
    for (const s of D.SPOTS) expect(inside(D, s.x, s.y) && dist(D, s.x, s.y) > 7, `${s.x},${s.y}`).toBe(true);
  });

  it('leads from the stairs to both exits', () => {
    const C = 4, [x0, y0, w, h] = D.BOUNDS, cols = Math.ceil(w / C), rows = Math.ceil(h / C);
    const open = (c: number) => dist(D, x0 + (c % cols) * C + 2, y0 + Math.floor(c / cols) * C + 2) > 4;
    const at = (x: number, y: number) => Math.floor((y - y0) / C) * cols + Math.floor((x - x0) / C);
    const seen = new Set([at(D.STAIRS.x, y0 + h - 2)]), todo = [...seen];
    while (todo.length) {
      const c = todo.pop()!;
      for (const n of [c % cols ? c - 1 : -1, (c + 1) % cols ? c + 1 : -1, c - cols, c + cols]) if (n >= 0 && n < cols * rows && !seen.has(n) && open(n)) seen.add(n), todo.push(n);
    }
    expect(D.EXITS.length).toBe(2);
    for (const g of D.EXITS) expect(seen.has(at(g.x, g.y + 2)), `${g.x},${g.y}`).toBe(true);
  });

  it('keeps the start, the gift and the lanes to them out of the Dawn', () => {
    const holy = sky(D), fy1 = D.FY1;
    const lane = Array.from({ length: Math.floor((fy1 - D.START.y - 8) / 8) + 1 }, (_, i) => ({ x: D.STAIRS.x, y: fy1 - i * 8 }));
    for (const g of D.EXITS) for (let y = D.GIFT.y; y > g.y; y -= 4) lane.push({ x: g.x, y });
    for (const s of [{ x: D.START.x, y: D.START.y + 8 }, D.GIFT, ...lane]) expect(holy(s.x, s.y), `${s.x},${s.y}`).toBe(false);
  });

  it('walks out to its side walls, at the edges of the view (no void bands on a 16:9 screen)', () => {
    expect(D.BOUNDS[0]).toBeLessThanOrEqual(12);
    expect(D.BOUNDS[0] + D.BOUNDS[2]).toBeGreaterThanOrEqual(D.W - 12);
  });

  it('cuts its sprites inside its atlas and its room', () => {
    for (const [, , w, h, x, y] of D.OVER) expect(x >= 0 && y >= 0 && x + w <= 2 * D.W && y + h <= 2 * D.H).toBe(true);
    for (const g of D.GATES) expect(g.frames.length).toBe(17);
  });
});

describe('the cloister under the Dawn', () => {
  const holy = sky(Cloister), [x0, y0, w, h] = Cloister.BOUNDS;
  const lit = (ya: number, yb: number) => { let n = 0, k = 0; for (let y = ya; y < yb; y++) for (let x = x0; x < x0 + w; x++) { n++; if (holy(x, y)) k++; } return k / n; };
  it('burns the open garden and spares the walks', () => {
    expect(lit(y0, 94)).toBe(0); // the north walk, under the church
    expect(lit(304, 324)).toBeLessThan(0.05); // a cross gallery's walk
    expect(lit(Cloister.FY1 - 30, Cloister.FY1)).toBe(0); // the south walk, up from the stairs
    expect(lit(380, 520)).toBeGreaterThan(0.4); // the graves' garden
    expect(lit(y0, y0 + h)).toBeLessThan(0.75);
  });
});

describe('the chapel under its stained glass', () => {
  const holy = sky(Chapel), [x0, y0, w, h] = Chapel.BOUNDS;
  let n = 0, k = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { n++; if (holy(x, y)) k++; }
  it('lays panes of burning light, a few, on the floor', () => {
    expect(k / n).toBeGreaterThan(0.01);
    expect(k / n).toBeLessThan(0.15);
  });
});
