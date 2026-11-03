import { describe, expect, it } from 'vitest';
import { NOTES, at, keep, lying } from './notes.ts';
import { parse, VERSION } from './save.ts';
import { WORLD, ZONES, isZone } from './world.ts';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import * as Nec from './necropolis.data.ts';

// Les notes (notes.ts): each lies on open floor where it is said to, away from what F would take first; read, it is
// kept in the save for good, an older save coming up with none.
const ROOMS: Record<string, { BOXES: number[][]; PITS: { x: number; y: number; w: number; h: number }[]; BOUNDS: number[] }> = { hall: Crypt, nave: Nave, ossuary: Ossuary, chapel: Chapel, cloister: Cloister };
const gap = (boxes: number[][], x: number, y: number) => Math.min(...boxes.map(([bx, by, bw, bh]) => Math.hypot(Math.max(bx - x, 0, x - bx - bw), Math.max(by - y, 0, y - by - bh))));

describe('the notes', () => {
  it('have their own ids and titles, and words to read', () => {
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
    expect(new Set(NOTES.map((n) => n.title)).size).toBe(NOTES.length); // the journal lists them by title
    for (const n of NOTES) expect(n.text.length && n.text.every((p) => p.trim()), n.id).toBeTruthy();
  });

  it('lie on open floor, clear of caches', () => {
    const off = NOTES.filter((n) => {
      const Z = isZone(n.place) ? ZONES[n.place] : undefined, R = ROOMS[n.place];
      const [x0, y0, w, h] = Z ? [0, 0, Z.W, Z.H] : R.BOUNDS, boxes = Z ? [...Z.BOXES, ...Z.PITS] : [...R.BOXES, ...R.PITS.map((p) => [p.x, p.y, p.w, p.h])];
      return !(n.x > x0 && n.y > y0 && n.x < x0 + w && n.y < y0 + h) || gap(boxes, n.x, n.y) <= 6 || WORLD[n.place].caches.some((c) => Math.hypot(c.x - n.x, c.y - n.y) <= 30);
    });
    expect(off.map((n) => n.id)).toEqual([]);
  });

  it('lie on the necropolis’ note spots once its plan has them', () => {
    const spots = (Nec as unknown as { NOTES?: { id: string; x: number; y: number }[] }).NOTES;
    if (!spots) return; // the plan before its redesign: the notes' own x, y
    for (const n of NOTES.filter((n) => n.spot)) expect(spots.find((s) => s.id === n.spot && s.x === n.x && s.y === n.y), n.id).toBeDefined();
  });

  it('are read where they lie, the nearest within reach; Vesna’s days once she is out', () => {
    const cat = lying('catacombs', false);
    expect(cat.some((n) => n.id === 'jours')).toBe(false);
    expect(lying('catacombs', true).some((n) => n.id === 'jours')).toBe(true);
    const g = cat.find((n) => n.id === 'gardien')!;
    expect(at(cat, { x: g.x + 10, y: g.y }, 24)).toBe(g);
    expect(at(cat, { x: g.x + 40, y: g.y }, 24)).toBeUndefined();
  });

  it('go into the journal once, in the order read', () => {
    const found: string[] = [];
    expect([keep(found, 'seau'), keep(found, 'lent'), keep(found, 'seau')]).toEqual([true, true, false]);
    expect(found).toEqual(['seau', 'lent']);
  });
});

describe('the journal in the save', () => {
  it('comes up empty from an older save', () => {
    const s = parse('{"v":6,"banked":30,"vesna":true}');
    expect([s.v, s.notes, s.banked, s.vesna]).toEqual([VERSION, [], 30, true]);
    expect(parse('{"v":7,"prologue":true}')).toMatchObject({ v: VERSION, notes: [], prologue: true }); // the prologue's 7
  });

  it('keeps the notes read, once each, in order; drops what is no note', () => {
    expect(parse('{"v":8,"notes":["lent","seau","lent",4,"nothing"]}').notes).toEqual(['lent', 'seau']);
    expect(parse(JSON.stringify(parse('{"v":8,"notes":["gardien"]}'))).notes).toEqual(['gardien']);
  });
});
