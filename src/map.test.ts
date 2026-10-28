import { describe, expect, it } from 'vitest';
import { decode, encode, fog, grid, marks, reveal, revealAll, see, seen } from './map.ts';
import { data, parse } from './save.ts';
import { missing } from './font.ts';
import { T } from './tuning.ts';

describe('la carte', () => {
  it('reveals the cells round him within his sight, not those behind a wall', () => {
    const bits = new Uint8Array(20 * 10), wall = (x: number) => x >= 320 && x < 352; // a wall from x 320 to 352
    expect(reveal(bits, 20, 32, 260, 160, 140, wall, 24)).toBeGreaterThan(20);
    const at = (x: number, y: number) => bits[Math.floor(y / 32) * 20 + Math.floor(x / 32)];
    expect([at(260, 160), at(200, 160), at(150, 120)]).toEqual([1, 1, 1]);
    expect(at(336, 160)).toBe(1); // the wall's face he looks at
    expect([at(400, 160), at(40, 300 - 1)]).toEqual([0, 0]); // behind it; beyond his reach
    expect(reveal(bits, 20, 32, 260, 160, 140, wall, 24)).toBe(0); // seen once, for good
  });

  it('packs the cells seen in the save, and drops a mask of another size', () => {
    const bits = new Uint8Array(5160).map((_, i) => (i % 7 === 0 || i > 5000 ? 1 : 0));
    const s = encode(bits);
    expect(s.length).toBeLessThan(900);
    expect(decode(s, 5160)).toEqual(bits);
    expect(decode(s, 3060).some(Boolean)).toBe(false); // the zone redrawn at another size: unseen again
    expect(decode('#broken', 10).some(Boolean)).toBe(false);
    expect(decode(undefined, 10)).toEqual(new Uint8Array(10));
  });

  it('keeps it in the save for good; an older save comes up with none, a broken one loses it', () => {
    const s = parse(null);
    s.carte = { necropolis: encode(new Uint8Array(5160).fill(1)), catacombs: 'AAAA' };
    expect(parse(JSON.stringify(s))).toEqual(s);
    const old = parse('{"v":3,"banked":50,"shortcuts":["grille"],"vesna":true}');
    expect([old.v, old.carte, old.banked, old.shortcuts, old.vesna]).toEqual([4, {}, 50, ['grille'], true]);
    expect(parse('{"v":4,"carte":{"necropolis":12,"catacombs":"<script>","refuge":"AAAA"}}').carte).toEqual({});
  });

  it('reveals the zone as he walks, his sight stopped by its rock', () => {
    data.carte = {};
    const { cols } = grid('catacombs'), C = T.carte.cell, cell = (x: number, y: number) => fog('catacombs')[Math.floor(y / C) * cols + Math.floor(x / C)];
    see('catacombs', 2600, 200, false); // the well's foot, in its moon
    expect(seen('catacombs')).toBeGreaterThan(10);
    expect([cell(2600, 200), cell(2520, 205)]).toEqual([1, 1]);
    expect(cell(2600, 315)).toBe(0); // deep in the rock south of the well
    expect(data.carte.catacombs).toBe(encode(fog('catacombs')));
    revealAll('necropolis');
    expect(seen('necropolis')).toBe(grid('necropolis').cols * grid('necropolis').rows);
    data.carte = {};
    expect(seen('necropolis')).toBe(0);
  });

  it('marks the doors and the shortcuts as they stand, the prison; its words in the font', () => {
    const shut = marks('necropolis', [], false), open = marks('necropolis', ['grille', 'galerie', 'caveau'], true);
    expect(shut.find((m) => m.name === 'La grille')?.icon).toBe('shut');
    expect(open.find((m) => m.name === 'La grille')?.icon).toBe('raised');
    expect(shut.find((m) => m.name === 'Le caveau')?.icon).toBe('shut'); // its grille, raised from below only
    expect(shut.filter((m) => m.name === 'La porte scellée')).toHaveLength(2); // the gallery's two mouths
    expect(shut.map((m) => m.name)).toEqual(expect.arrayContaining(['Le refuge', 'La crypte', 'La nef', "L'ossuaire", 'La chapelle', 'Le puits']));
    const below = marks('catacombs', [], false);
    expect(below.find((m) => m.icon === 'skull')?.name).toBe('La prison');
    expect(below.find((m) => m.name === "L'escalier du caveau")?.icon).toBe('shut');
    const words = [...shut, ...below].map((m) => m.name).join(' ') + " LA NÉCROPOLE LES CATACOMBES C ou Échap : fermer fermé levé Le champ des tombes Le gouffre La brèche de l'Aube Le camp de l'Ordre Le nid Les eaux noires La grande croisée";
    expect(missing(words)).toEqual([]);
  });
});
