import { describe, expect, it } from 'vitest';
import { T } from './tuning.ts';
import { missing } from './font.ts';
import { cellAt, homeward } from './world.ts';
import * as Zone from './necropolis.data.ts';
import { MOUNDS, NOTES, POSTS, RATS, ROUTES, advance, corpses, elite, inFile, mound, relics, setPieces } from './haunts.ts';

const KINDS = ['ghoul', 'crossbow', 'purifier', 'priest', 'hound', 'penitent', 'ringer', 'inquisitor', 'amas', 'bourreau', 'crows', 'enterre', 'gave', 'chose', 'crocheteur'];
const area = (x: number, y: number) => Zone.AREAS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x < x1 && y >= y0 && y < y1)!;

describe('la nécropole: its places and what lives there', () => {
  const g = homeward('necropolis', []), open = (x: number, y: number) => g.open[cellAt(g.cols, x, y)];

  it('names every place, in letters the font has; their rings rise from the refuge to the far side', () => {
    for (const a of Zone.AREAS) expect(a.name && missing(a.name), a.id).toEqual([]);
    expect(area(300, 900).ring).toBe(1);
    expect(area(2000, 400).ring).toBe(2);
    expect(area(3150, 880).ring).toBe(3);
    expect(['caveaux', 'champ', 'fosses', 'allee', 'camp', 'buchers', 'postes', 'chapelle', 'puits'].map((id) => Zone.AREAS.find((a) => a.id === id)?.name).every(Boolean)).toBe(true);
  });

  it("draws each place's groups from its own pool, of foes that exist; harder with the ring", () => {
    const P = T.expedition.necropolis;
    for (const a of Zone.AREAS) if (a.groups) expect(P[a.id] ?? T.expedition.pools[a.ring], a.id).toBeTruthy();
    for (const pool of Object.values(P)) for (const group of pool) for (const k of group) expect(KINDS, k).toContain(k);
    const size = (ids: string[]) => { const gs = ids.flatMap((id) => P[id]); return gs.reduce((s, g) => s + g.length, 0) / gs.length; };
    const order = (ids: string[]) => ids.flatMap((id) => P[id]).flat().filter((k) => !['ghoul', 'crows', 'enterre'].includes(k)).length / ids.flatMap((id) => P[id]).flat().length;
    expect(size(['caveaux', 'champ'])).toBeLessThan(size(['fosses', 'allee']));
    expect(size(['fosses', 'allee'])).toBeLessThanOrEqual(size(['postes', 'camp', 'chapelle', 'puits']));
    expect(order(['caveaux', 'champ'])).toBeLessThan(order(['fosses', 'allee']));
    expect(order(['fosses', 'allee'])).toBeLessThan(order(['postes', 'camp', 'chapelle']));
  });

  it('sets its set pieces, their dead, reliquaries, nests and the notes\' spots on open floor', () => {
    for (const p of POSTS) {
      if (p.kinds.includes('chose')) continue; // on the bridge's edge
      expect(open(p.x, p.y), p.id).toBe(true);
      expect(area(p.x, p.y), p.id).toBeTruthy();
    }
    for (const c of [...corpses(), ...relics()]) expect(open(c.x, c.y + 4), `${c.x},${c.y}`).toBe(true);
    for (const [x, y] of RATS) expect(open(x, y), `rats ${x},${y}`).toBe(true);
    for (const n of NOTES) expect(open(n.x, n.y), `note ${n.id}`).toBe(true);
    for (const p of POSTS) if (p.kinds.includes('enterre')) expect(mound(p, 120), p.id).toBeTruthy(); // l'Enterré has his mound
    expect(MOUNDS.length).toBeGreaterThan(200);
  });

  it("walks its patrols' routes straight from waypoint to waypoint, every step on open floor", () => {
    for (const [id, r] of Object.entries(ROUTES)) {
      expect(r.pts.length, id).toBeGreaterThan(1);
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const [a, b] = [r.pts[k], r.pts[k + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
        for (let s = 0; s <= n; s++) { const x = a[0] + ((b[0] - a[0]) * s) / n, y = a[1] + ((b[1] - a[1]) * s) / n; expect(open(x, y), `${id} ${Math.round(x)},${Math.round(y)}`).toBe(true); }
      }
    }
    for (const p of POSTS) if (p.route) { expect(ROUTES[p.route], p.id).toBeTruthy(); expect(Math.hypot(ROUTES[p.route].pts[0][0] - p.x, ROUTES[p.route].pts[0][1] - p.y), p.id).toBeLessThan(30); }
    expect(ROUTES[POSTS.find((p) => p.prisoner)!.route!].once).toBe(true); // the prisoner is dragged to the camp, and stays
    expect(area(...ROUTES.camp.pts.at(-1)!).id).toBe('camp');
  });

  it('places the set pieces: feeders by their dead, a patrol in file behind its bearer, the elites marked', () => {
    const all = setPieces();
    const feeders = all.filter((f) => f.haunt?.feed);
    expect(feeders.length).toBeGreaterThanOrEqual(4);
    for (const f of feeders) expect(Math.hypot(f.x - f.haunt!.feed!.x, f.y - f.haunt!.feed!.y)).toBeLessThan(24);
    const ronde = all.filter((f) => f.haunt?.route === 'breche');
    expect(ronde.map((f) => f.haunt!.slot)).toEqual([0, 1, 2]);
    expect(all.filter((f) => f.haunt?.elite).length).toBe(POSTS.filter((p) => p.elite !== undefined).length);
    for (const f of all.filter((f) => f.haunt?.elite)) expect(['crows', 'enterre', 'chose']).not.toContain(f.kind);
    const behind = inFile({ x: 100, y: 100 }, 0, 2);
    expect(behind.x).toBeLessThan(100);
  });

  it('walks a route back and forth, or once to its end', () => {
    const r = { pts: [[0, 0], [100, 0], [200, 0]] as [number, number][] };
    expect(advance(r, 1, 1, { x: 50, y: 0 })).toEqual({ leg: 1, dir: 1 }); // not there yet
    expect(advance(r, 1, 1, { x: 99, y: 0 })).toEqual({ leg: 2, dir: 1 });
    expect(advance(r, 2, 1, { x: 200, y: 2 })).toEqual({ leg: 1, dir: -1 }); // back
    expect(advance(r, 0, -1, { x: 0, y: 0 })).toEqual({ leg: 1, dir: 1 });
    expect(advance({ ...r, once: true }, 2, 1, { x: 200, y: 0 })).toEqual({ leg: 2, dir: 1 }); // there it stays
  });

  it('makes elites by ring, never of a flock, an Enterré nor la Chose', () => {
    expect(elite('ghoul', 1, () => 0)).toBe(false); // none by the refuge
    expect(elite('penitent', 3, () => 0.1)).toBe(true);
    expect(elite('crows', 3, () => 0)).toBe(false);
    expect(T.elite.chance[3]).toBeGreaterThan(T.elite.chance[2]);
    expect(Math.round(T.enemy.hp * T.elite.hp)).toBeGreaterThan(T.predator.damage); // the strike from the shade no longer kills one outright
  });
});
