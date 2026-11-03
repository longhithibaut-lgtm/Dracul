import { describe, expect, it } from 'vitest';
import * as H from './haven.ts';
import * as C from './cheats.ts';
import * as D from './refuge.data.ts';
import * as V from './refuge-vesna.data.ts';
import { missing } from './font.ts';
import { parse, type Entry } from './save.ts';
import { ITEM_IDS } from './items.ts';

// The refuge's answer to progress (haven.ts).
const entry = (end: Entry['end']): Entry => ({ end, deepest: 1, blood: 0, life: 50, s: 60, loosed: 0, met: 0, at: '' });
const inBox = (boxes: number[][], x: number, y: number) => boxes.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh);

describe('haven', () => {
  it('fills the basin with what is banked, never brimming over', () => {
    expect(H.fill(0)).toBe(0);
    expect(H.fill(800)).toBeCloseTo(0.5);
    expect(H.fill(100)).toBeLessThan(H.fill(1000));
    expect(H.fill(1e7)).toBeLessThan(1);
  });

  it('lights a step per upgrade, all of them once everything is bought', () => {
    const s = parse(null);
    expect(H.lit(s)).toEqual([]);
    s.unlocks.bite = true;
    expect(H.lit(s).map((f) => f.kind)).toEqual(['brazier']);
    C.ronge(s);
    C.powers(s);
    expect(H.upgrades(s)).toBe(H.LIGHTS.length);
    expect(H.lit(s)).toEqual(H.LIGHTS.flat());
  });

  it('counts his deaths and returns from the log', () => {
    expect(H.tally([entry('mort'), entry('retour'), entry('mort')])).toEqual({ deaths: 2, returns: 1 });
  });

  it('shows each kind in the chest once, at its best', () => {
    const s = parse(null);
    C.chest(s, 0, ['acier', 'acier']);
    C.chest(s, 2, ['acier']);
    C.chest(s, 1, [ITEM_IDS[ITEM_IDS.length - 1]]);
    expect(H.shown(s.stash).map((i) => [i.id, i.r])).toEqual([['acier', 2], [ITEM_IDS[ITEM_IDS.length - 1], 1]]);
  });

  it('says only what fits his progress, not twice running', () => {
    const s = parse(null);
    expect(H.line('ronge', s, 0)).toBe('Le bassin est sec. Ma tête aussi.');
    s.banked = 2000;
    expect(H.line('ronge', s, 0)).toMatch(/^Tant de sang/);
    expect(H.line('ronge', s, 5, 'Tant de sang... Je me souviens de choses que j\'avais perdues.')).toMatch(/cendres/);
    expect(H.line('vesna', s, 0)).toMatch(/rats/);
    for (const who of ['ronge', 'vesna'] as const) for (const l of H.LINES[who]) expect(missing(l.line)).toEqual([]);
    expect(missing('F ou Échap : fermer ; flèches : l\'autre carte')).toEqual([]); // the map table's keys, in the panels' font
  });

  it('keeps its rats on open floor', () => {
    for (const r of H.RATS) expect(inBox(r.vesna ? V.BOXES : D.BOXES, r.x, r.y)).toBe(false);
    for (const r of H.RATS.filter((r) => !r.vesna)) expect(inBox(V.BOXES, r.x, r.y)).toBe(false);
  });
});
