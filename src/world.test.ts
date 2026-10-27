import { describe, expect, it } from 'vitest';
import { CHOKES, NAV, WORLD, ZONES, around, chokes, cellAt, expedition, go, homeward, isZone, lair, loose, parents, quadOf, ringAt, wayBack, waysUp, type Came, type Place } from './world.ts';
import { parse, VERSION, type Save } from './save.ts';
import { LINES, WARES, WARE_TEXT, bagSize, beast, buy, owned, price } from './shop.ts';
import { T } from './tuning.ts';
import { missing } from './font.ts';
import { runMask } from './logic.ts';
import * as Crypt from './crypt.data.ts';
import * as Nave from './nave.data.ts';
import * as Ossuary from './ossuary.data.ts';
import * as Chapel from './chapel.data.ts';
import * as Cloister from './cloister.data.ts';
import * as Zone from './necropolis.data.ts';
import * as Cat from './catacombs.data.ts';
import type { Plan } from './baked.ts';

const PLANS: Record<Exclude<Place, 'refuge' | 'necropolis' | 'catacombs'>, Plan> = { hall: Crypt, nave: Nave, ossuary: Ossuary, chapel: Chapel, cloister: Cloister };
const places = Object.keys(WORLD) as Place[], rooms = places.filter((p): p is keyof typeof PLANS => p in PLANS);

describe('the world: the refuge, la nécropole round it, les catacombes under it, the painted rooms as its interiors', () => {
  it("the refuge's stairs lead into the zone; its doors into the crypt, the nave, the ossuary, the chapel; the chapel on to the cloister", () => {
    expect(WORLD.refuge.ahead).toEqual(['necropolis']);
    expect(WORLD.necropolis.ahead).toEqual(['hall', 'nave', 'ossuary', 'chapel', 'catacombs', 'catacombs']); // its doors; the well, le caveau
    expect(WORLD.catacombs.ahead).toEqual([]); // the prison's reliquary, sealed for now
    expect(WORLD.chapel.ahead).toEqual(['cloister', 'cloister']);
    for (const p of ['hall', 'nave', 'ossuary', 'cloister'] as const) expect(WORLD[p].ahead).toEqual([]);
    expect(rooms.map((p) => WORLD[p].ring)).toEqual([1, 2, 2, 3, 4]); // an interior keeps its ring
    for (const z of ['necropolis', 'catacombs'] as const) for (const k of [...WORLD[z].doors!, ...WORLD[z].up!]) expect(ZONES[z].DOORS[k], `${z} ${k}`).toBeDefined();
    expect(WORLD.necropolis.doors!.length).toBe(WORLD.necropolis.ahead.length);
    expect(parents('catacombs').map((p) => WORLD.necropolis.doors![p.exit])).toEqual(WORLD.catacombs.up); // each way up comes out at the door that leads down to it
    for (const p of rooms) expect(PLANS[p].EXITS.length).toBeGreaterThanOrEqual(WORLD[p].ahead.length);
    for (const p of places) expect(missing(WORLD[p].name)).toEqual([]);
  });

  it('every place is reached from the refuge, and every place leads back to it', () => {
    const seen = new Set<Place>(['refuge']), todo: Place[] = ['refuge'];
    while (todo.length) for (const to of WORLD[todo.pop()!].ahead) if (!seen.has(to)) seen.add(to), todo.push(to);
    expect([...seen].sort()).toEqual([...places].sort());
    for (const p of places.filter((p) => p !== 'refuge')) {
      let at: Place = p;
      for (let n = 0; at !== 'refuge' && n < 9; n++) at = go({}, at, -1)!.to;
      expect(at).toBe('refuge');
    }
  });

  it('into a room by its stairs; out of it at the door of the zone it was entered by', () => {
    const came: Came = {};
    expect(go(came, 'refuge', 0)).toEqual({ to: 'necropolis', entry: -1 }); // at the refuge's stairs
    expect(go(came, 'necropolis', 3)).toEqual({ to: 'chapel', entry: -1 });
    expect(go(came, 'chapel', 1)).toEqual({ to: 'cloister', entry: -1 });
    expect(go(came, 'cloister', -1)).toEqual({ to: 'chapel', entry: 1 }); // by the portcullis he took
    expect(go(came, 'chapel', -1)).toEqual({ to: 'necropolis', entry: 3 }); // at the chapel's door
    expect(go(came, 'necropolis', -1)).toEqual({ to: 'refuge', entry: 0 }); // up the refuge's stairs
    expect(go({}, 'ossuary', -1)).toEqual({ to: 'necropolis', entry: 2 });
    // down the well, at its foot; down le caveau's stairs, at theirs; back up each at the door it comes out of
    expect(go(came, 'necropolis', 4)).toEqual({ to: 'catacombs', entry: -1 });
    expect(go(came, 'necropolis', 5)).toEqual({ to: 'catacombs', entry: -2 });
    expect(go(came, 'catacombs', -1)).toEqual({ to: 'necropolis', entry: 4 }); // up the well, whichever way he came down
    expect(go(came, 'catacombs', -2)).toEqual({ to: 'necropolis', entry: 5 }); // up le caveau's stairs
    expect(go(came, 'catacombs', -3)).toBeUndefined();
    expect(go(came, 'refuge', -1)).toBeUndefined(); // the refuge has no way back: leave() ignores it
    expect(go(came, 'cloister', 0)).toBeUndefined(); // the deepest: its doors lead nowhere yet
    expect(go(came, 'refuge', -1)).toBeUndefined();
    expect(parents('cloister')).toEqual([{ from: 'chapel', exit: 0 }, { from: 'chapel', exit: 1 }]);
  });

  it('hides the rooms\' blood caches on open floor, enough of them', () => {
    for (const p of rooms) {
      const D = PLANS[p], [x0, y0, w, h] = D.BOUNDS;
      expect(WORLD[p].caches.length).toBeGreaterThanOrEqual(T.expedition.caches[1]);
      for (const c of WORLD[p].caches) {
        expect(c.x > x0 && c.x < x0 + w && c.y > y0 && c.y < y0 + h, `${p} ${c.x},${c.y}`).toBe(true);
        for (const [bx, by, bw, bh] of [...D.BOXES, ...D.PITS.map((b) => [b.x, b.y, b.w, b.h])])
          expect(c.x >= bx && c.x < bx + bw && c.y >= by && c.y < by + bh, `${p} ${c.x},${c.y} in a box`).toBe(false);
      }
    }
  });
});

describe('la nécropole', () => {
  const shut = homeward('necropolis', []), open = homeward('necropolis', Zone.GATES.map((g) => g.id)), { cols } = shut;
  const steps = (g: typeof shut, p: { x: number; y: number }) => g.steps[cellAt(cols, p.x, p.y)];
  const D = Zone.DOORS, below = (d: { x: number; y: number }) => ({ x: d.x, y: d.y + 14 }); // just out of a door
  const holy = runMask(Zone.HOLY, Zone.W, Zone.H), burns = (x: number, y: number) => holy[Math.floor(y) * Zone.W + Math.floor(x)] === 1;

  it('is 8 x 5 screens, in chunks of one screen, each with its sprites', () => {
    expect([Zone.W, Zone.H, Zone.SW * Zone.COLS, Zone.SH * Zone.ROWS]).toEqual([3840, 1350, 3840, 1350]);
    expect([Zone.SW, Zone.SH]).toEqual([T.width, T.height]); // a chunk is a screen of the view
    expect(Zone.OVER.length).toBe(Zone.COLS * Zone.ROWS);
  });

  it('loads the chunks round the view, never the whole zone', () => {
    expect(around('necropolis', 0, 0, 480, 270, 0)).toEqual([[0, 0]]);
    expect(around('necropolis', 470, 260, 480, 270, 0)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
    expect(around('necropolis', 470, 260, 480, 270, 20)).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]);
    expect(around('necropolis', 1000, 600, 480, 270, 160).length).toBeLessThanOrEqual(16);
    expect(around('necropolis', -500, -500, 480, 270, 0)).toEqual([]);
    expect(around('necropolis', 3360, 1080, 480, 270, 160).every(([i, j]) => i < Zone.COLS && j < Zone.ROWS)).toBe(true);
    // the light of the 2 x 2 chunks under the view; at the far edges, the last two
    expect(quadOf('necropolis', 10, 10)).toEqual({ i: 0, j: 0 });
    expect(quadOf('necropolis', 500, 300)).toEqual({ i: 1, j: 1 });
    expect(quadOf('necropolis', 3360, 1080)).toEqual({ i: Zone.COLS - 2, j: Zone.ROWS - 2 });
    for (const [x, y] of [[0, 0], [479, 269], [1234, 777], [3360, 1080]]) { // the view always within its 2 x 2
      const { i, j } = quadOf('necropolis', x, y);
      expect(x >= i * Zone.SW && x + 480 <= (i + 2) * Zone.SW && y >= j * Zone.SH && y + 270 <= (j + 2) * Zone.SH).toBe(true);
    }
  });

  it('leads from the refuge to every door, lever and cache, the shortcuts shut', () => {
    for (const d of Object.values(D)) expect(steps(shut, below(d)), `${d.x},${d.y}`).toBeLessThan(Infinity);
    for (const g of Zone.GATES) if (g.lever) expect(steps(shut, g.lever), g.id).toBeLessThan(Infinity);
    for (const [x, y] of Zone.CACHES) expect(steps(shut, { x, y: y + 4 }), `${x},${y}`).toBeLessThan(Infinity);
  });

  it('opens its shortcuts from their side only, and they shorten the way back', () => {
    // the length he walks: the way's cells pulled taut (straight on wherever the floor lets him), through the gallery
    const clear = (g: typeof shut, a: { x: number; y: number }, b: { x: number; y: number }) => {
      for (let k = 0, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4); k <= n; k++) if (!g.open[cellAt(cols, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)]) return false;
      return true;
    };
    const trip = (g: typeof shut, from: { x: number; y: number }) => {
      const way = [from, ...wayBack(g.steps, cols, from, g.links)], d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
      let n = 0;
      for (let i = 0; i < way.length - 1;) {
        if (d(way[i], way[i + 1]) > 16) { i++; continue; } // through the gallery: not walked
        let j = i + 1;
        while (j + 1 < way.length && d(way[j], way[j + 1]) <= 16 && clear(g, way[i], way[j + 1])) j++;
        n += d(way[i], way[j]);
        i = j;
      }
      return n;
    };
    for (const g of Zone.GATES) { // each is raised from the south, at its winch (the gallery's other mouth with it)
      expect(g.side).toBe(1);
      if (g.lever) expect(g.lever.y).toBeGreaterThan(g.box[1] + g.box[3]);
    }
    expect(Zone.GATES.filter((g) => g.lever).map((g) => g.id)).toEqual(['grille', 'galerie']);
    // A, la grille: shut, its other side is a long way round; raised, a few steps
    const [x, y, w, h] = Zone.GATES[0].box, beyond = { x: x + w / 2, y: y - 12 }, near = { x: x + w / 2, y: y + h + 12 };
    expect(Math.abs(steps(shut, beyond) - steps(shut, near))).toBeGreaterThan(40);
    expect(Math.abs(steps(homeward('necropolis', ['grille']), beyond) - steps(homeward('necropolis', ['grille']), near))).toBeLessThan(8);
    // B, the gallery: its far mouth a step from its near one once raised
    const [m0, m1] = Zone.TUNNEL.map(below), both = homeward('necropolis', ['galerie']);
    expect(Math.abs(steps(both, m1) - steps(both, m0))).toBeLessThanOrEqual(2);
    expect(steps(open, m1)).toBeLessThan(steps(shut, m1) * 0.6); // with A, the far side's mouth is near the refuge
    // the way back from the deepest door, walked: each shortcut shortens it, both much more
    const far = trip(shut, below(D.chapel)), a = trip(homeward('necropolis', ['grille']), below(D.chapel)), b = trip(both, below(D.chapel)), ab = trip(open, below(D.chapel));
    expect(a).toBeLessThan(far * 0.85);
    expect(b).toBeGreaterThan(0); // B alone opens the gallery from the middle's north band, still reached the long way
    expect(ab).toBeLessThan(far * 0.6);
    console.info(`the way back from the chapel, walked: ${far | 0} px; A: ${a | 0}; B: ${b | 0}; both: ${ab | 0}`);
  });

  it('places its foes by area and ring: ghouls near the refuge, the Order far from it', () => {
    const area = (x: number, y: number) => Zone.AREAS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x < x1 && y >= y0 && y < y1)!;
    expect(area(D.refuge.x, D.refuge.y + 60).groups).toBe(0); // the forecourt at the refuge's stairs: a sure pause
    expect(area(1525, 200).groups).toBe(0); // the court behind the grille: none waits by the shortcut
    expect(area(1525, 200).ring).toBe(2);
    expect([area(1380, 800).id, area(1430, 800).id]).toEqual(['proche-sud', 'milieu-sud']); // the sectors part in the chasm
    expect([area(3120, 880).id, area(2800, 1200).id, area(3500, 600).id]).toEqual(['camp', 'loin-sud', 'loin-est']);
    expect(area(3500, 600).groups).toBeGreaterThanOrEqual(3); // the far end not the emptiest
    expect(ringAt('necropolis', D.refuge.x, D.refuge.y + 40)).toBe(1);
    expect(ringAt('necropolis', D.hall.x, D.hall.y + 20)).toBe(1);
    expect(ringAt('necropolis', D.nave.x, D.nave.y + 20)).toBe(2);
    expect(ringAt('necropolis', D.ossuary.x, D.ossuary.y + 20)).toBe(2);
    expect(ringAt('necropolis', D.chapel.x, D.chapel.y + 20)).toBe(3);
    for (const [k, a] of Zone.AREAS.entries()) {
      const spawns = Zone.SPAWNS.filter((s) => s[2] === k);
      expect(spawns.length, a.id).toBeGreaterThanOrEqual(a.groups * 2);
      expect(T.expedition.pools[a.ring].length).toBeGreaterThan(0);
    }
    for (const [x, y] of Zone.SPAWNS) {
      expect(steps(shut, { x, y }) < Infinity || steps(open, { x, y }) < Infinity, `${x},${y}`).toBe(true);
      expect(burns(x, y), `${x},${y} in the Dawn`).toBe(false);
      expect(Math.hypot(x - D.refuge.x, y - D.refuge.y)).toBeGreaterThan(60);
    }
  });

  it('burns under the breach: crossing it in the open burns him; the stumps\' shade takes him across unburnt', () => {
    const grace = (T.hero.speed * T.dawn.graceMs) / 1000; // px he walks before the Dawn first burns him
    let run = 0, longest = 0;
    for (let x = 2440; x < 2800; x++) { run = burns(x, 360) ? run + 1 : 0; longest = Math.max(longest, run); }
    expect(longest).toBeGreaterThan(grace * 1.25); // straight across, by the path: burnt once at least
    // no row of shade across the gap in the wall (x 2598-2642, y 292-428)
    for (let y = 296; y < 428; y += NAV) expect([2604, 2612, 2620, 2628, 2636].some((x) => burns(x, y)), `y ${y}`).toBe(true);
    // the safest way across (cells of the walk grid): its longest stretch in the Dawn shorter than the grace
    const best = new Map<number, number>(), q: [number, number][] = [];
    for (let y = 296; y < 432; y += NAV) { const c = cellAt(cols, 2470, y); if (shut.open[c]) q.push([c, 0]); }
    let safe = Infinity;
    while (q.length) {
      const [c, r] = q.shift()!;
      if ((c % cols) * NAV >= 2770) { safe = Math.min(safe, r); continue; }
      for (const n of [c + 1, c - 1, c + cols, c - cols]) {
        const x = (n % cols) * NAV + 4, y = Math.floor(n / cols) * NAV + 4;
        if (!shut.open[n] || x < 2440 || x > 2790 || y < 240 || y > 500) continue;
        const nr = burns(x, y) ? r + NAV : 0;
        if (nr > grace || (best.get(n) ?? Infinity) <= nr) continue;
        best.set(n, nr);
        q.push([n, nr]);
      }
    }
    expect(safe).toBeLessThan(grace);
  });

  it('burns under the breach only, never at a door, a lever or a cache; the camp\'s lanterns neither', () => {
    let n = 0;
    for (let i = 0; i < holy.length; i++) n += holy[i];
    expect(n).toBeGreaterThan(1000);
    for (let i = 0; i < holy.length; i += 97) if (holy[i]) expect(Math.abs((i % Zone.W) - 2620), 'by the breach').toBeLessThan(260);
    for (const p of [...Object.values(D).map(below), ...Zone.GATES.flatMap((g) => (g.lever ? [g.lever] : [])), ...Zone.CACHES.map(([x, y]) => ({ x, y }))]) {
      expect(burns(p.x, p.y), `${p.x},${p.y}`).toBe(false);
      for (const [lx, ly] of Zone.LANTERNS) expect(Math.hypot((p.x - lx) / T.lantern.radius, (p.y - ly) / (T.lantern.radius * T.lantern.squash)), `${p.x},${p.y} in a lantern's pool`).toBeGreaterThan(1.2);
    }
  });

  it("walks back to the refuge's stairs downhill", () => {
    const from = below(D.chapel), way = wayBack(shut.steps, cols, from);
    expect(way.length).toBeGreaterThan(200);
    for (let k = 1; k < way.length; k++) expect(steps(shut, way[k])).toBeLessThan(steps(shut, way[k - 1]));
    const end = way[way.length - 1];
    expect(Math.hypot(end.x - D.refuge.x, end.y - D.refuge.y - 12)).toBeLessThan(12);
    expect(wayBack(shut.steps, cols, below(D.refuge))).toEqual([]); // there already
  });

  it("lays the battue's packs on his way back, out of his sight, every other one before the refuge's stairs", () => {
    const P = T.battue.packs, hero = below(D.chapel), way = wayBack(shut.steps, cols, hero), dist = (p: { x: number; y: number }) => Math.hypot(p.x - hero.x, p.y - hero.y);
    // at the narrow ways he must pass, out of his sight, the first he meets first: from the chapel, the breach then the bridge
    const first = lair(way, hero, T.battue.far, false, T.battue.door)!, next = lair(way, hero, T.battue.far, false, T.battue.door, 1)!;
    expect(dist(first)).toBeGreaterThanOrEqual(T.battue.far);
    const at = (p: { x: number; y: number }) => CHOKES.findIndex((c) => c.x === p.x && c.y === p.y);
    expect([at(first), at(next)].map((k) => k >= 0)).toEqual([true, true]);
    expect(first.x).toBeGreaterThan(2400); // the breach
    expect(Math.hypot(next.x - 1320, next.y - 1168)).toBeLessThan(40); // the bridge
    for (const c of CHOKES) { // each on the walk grid, out of the Dawn, away from the doors and the gallery's mouths
      expect(steps(shut, c) < Infinity || steps(open, c) < Infinity, `${c.x},${c.y}`).toBe(true);
      expect(burns(c.x, c.y), `${c.x},${c.y} in the Dawn`).toBe(false);
      for (const d of [...Object.values(D), ...Zone.TUNNEL]) expect(Math.hypot(c.x - d.x, c.y - d.y), `${c.x},${c.y}`).toBeGreaterThanOrEqual(100);
    }
    // no narrow way on his way back (from the crypt's door): the first point out of his sight, the next 90 px on
    const h2 = below(D.hall), w2 = wayBack(shut.steps, cols, h2), a = lair(w2, h2, T.battue.far, false, T.battue.door)!;
    expect(CHOKES.some((c) => c.x === a.x && c.y === a.y)).toBe(false);
    expect(w2.indexOf(lair(w2, h2, T.battue.far, false, T.battue.door, 1)!) - w2.indexOf(a)).toBe(Math.round(90 / NAV));
    expect(lair(way, hero, T.battue.far, true, T.battue.door)).toEqual(way[way.length - 1 - T.battue.door]);
    const exp = expedition(0);
    exp.packs = 4;
    const now = loose(exp, way, hero, P, T.battue.far, T.battue.door);
    expect(now.map((p) => p.kinds)).toEqual([P[0], P[1], P[2], P[2]]); // hounds first, then an Inquisiteur with his; the last repeats
    expect(now.map((p) => Math.hypot(p.at.x - D.refuge.x, p.at.y - D.refuge.y) < 120)).toEqual([false, true, false, true]); // every other one at the stairs
    expect([exp.packs, exp.loosed]).toEqual([0, 4]);
    // by the refuge's stairs: nowhere between him and it, the packs wait
    const home = { x: D.refuge.x + 40, y: D.refuge.y + 60 }, near = expedition(0);
    near.packs = 2;
    expect(loose(near, wayBack(shut.steps, cols, home), home, P, T.battue.far, T.battue.door)).toEqual([]);
    expect([near.packs, near.loosed]).toEqual([2, 0]);
  });
});

describe('les catacombes', () => {
  const shut = homeward('catacombs', []), open = homeward('catacombs', ['caveau']), { cols } = shut, nec = homeward('necropolis', []);
  const steps = (g: typeof shut, p: { x: number; y: number }) => g.steps[cellAt(g.cols, p.x, p.y)];
  const D = Cat.DOORS, below = (d: { x: number; y: number }) => ({ x: d.x, y: d.y + 14 });
  const area = (x: number, y: number) => Cat.AREAS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x < x1 && y >= y0 && y < y1)!;

  it('is 6 x 4 screens, in chunks of one screen, each with its sprites', () => {
    expect([Cat.W, Cat.H, Cat.SW * Cat.COLS, Cat.SH * Cat.ROWS]).toEqual([2880, 1080, 2880, 1080]);
    expect([Cat.SW, Cat.SH]).toEqual([T.width, T.height]);
    expect(Cat.OVER.length).toBe(Cat.COLS * Cat.ROWS);
    expect(isZone('catacombs') && isZone('necropolis') && !isZone('hall')).toBe(true);
    expect(around('catacombs', 2400, 810, 480, 270, 160).every(([i, j]) => i < Cat.COLS && j < Cat.ROWS)).toBe(true);
    expect(quadOf('catacombs', 2870, 1070)).toEqual({ i: Cat.COLS - 2, j: Cat.ROWS - 2 });
  });

  it("from the well's foot, every way, lever, cache, the arena and its reliquary are reached; the arena's gate stands open", () => {
    for (const d of Object.values(D)) expect(steps(shut, below(d)), `${d.x},${d.y}`).toBeLessThan(Infinity);
    for (const g of Cat.GATES) if (g.lever) expect(steps(shut, g.lever), g.id).toBeLessThan(Infinity);
    for (const [x, y] of Cat.CACHES) expect(steps(shut, { x, y: y + 4 }), `cache ${x},${y}`).toBeLessThan(Infinity);
    expect(Cat.CACHES.length).toBe(WORLD.catacombs.caches.length);
    const [x0, y0, x1, y1] = Cat.ARENA, prison = Cat.GATES.find((g) => g.id === 'prison')!;
    expect(steps(shut, Cat.RELIQUARY.at)).toBeLessThan(Infinity);
    expect(steps(shut, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 })).toBeLessThan(Infinity);
    expect(prison.arena && !prison.lever && prison.frames.length > 2).toBe(true); // open now; its frames, to shut it behind him later
    expect(prison.box[0] > x0 && prison.box[0] + prison.box[2] < x1 && Math.abs(prison.box[1] - y1) < 4).toBe(true); // in the arena's south wall
    expect(Cat.RELIQUARY.at.x > x0 && Cat.RELIQUARY.at.x < x1 && Cat.RELIQUARY.at.y > y0 && Cat.RELIQUARY.at.y < y1).toBe(true);
    expect(missing('Le reliquaire est scellé. Le reliquaire (F)')).toEqual([]);
  });

  it('places its foes by area and ring: ring 3 by the well, 4 deep; none at its ways up nor in the arena', () => {
    expect([area(D.puits.x, D.puits.y + 40).groups, area(D.caveau.x, D.caveau.y + 40).groups, area(2360, 800).groups]).toEqual([0, 0, 0]);
    expect([ringAt('catacombs', D.puits.x, D.puits.y + 40), ringAt('catacombs', 2160, 210)]).toEqual([3, 3]); // the well, the east crossroads
    expect([ringAt('catacombs', 610, 610), ringAt('catacombs', 1530, 625), ringAt('catacombs', 2360, 800)]).toEqual([4, 4, 4]); // le nid, the black water, the prison
    expect(area(610, 610).groups).toBeGreaterThanOrEqual(3); // le nid, the ghouls' own
    for (const [k, a] of Cat.AREAS.entries()) {
      expect(Cat.SPAWNS.filter((s) => s[2] === k).length, a.id).toBeGreaterThanOrEqual(a.groups * 2);
      if (a.groups) expect(T.expedition.catacombs[a.ring].length, a.id).toBeGreaterThan(0);
    }
    for (const [x, y] of Cat.SPAWNS) {
      expect(steps(shut, { x, y }), `${x},${y}`).toBeLessThan(Infinity);
      for (const d of Object.values(D)) expect(Math.hypot(x - d.x, y - d.y), `${x},${y} by a way up`).toBeGreaterThan(60);
    }
    for (const c of chokes('catacombs')) { // the battue's narrow ways: on the walk grid, away from the ways up
      expect(steps(shut, c), `${c.x},${c.y}`).toBeLessThan(Infinity);
      for (const d of Object.values(D)) expect(Math.hypot(c.x - d.x, c.y - d.y), `${c.x},${c.y}`).toBeGreaterThanOrEqual(100);
    }
  });

  it("raises le caveau's gate from below only, for good: the shortcut brings the refuge near", () => {
    const g = Cat.GATES.find((g) => g.id === 'caveau')!, top = Zone.GATES.find((g) => g.id === 'caveau')!;
    expect(g.lever!.y).toBeGreaterThan(g.box[1] + g.box[3]); // its winch below, on the catacombs' side
    expect(top.lever).toBeNull(); // le caveau's side: shut from the other side
    const foot = { x: D.caveau.x, y: D.caveau.y - 8 }; // in its recess, the stairs' foot
    expect([steps(shut, foot), steps(open, foot) < Infinity]).toEqual([Infinity, true]);
    expect([waysUp('catacombs', []), waysUp('catacombs', ['caveau'])]).toEqual([[0], [0, 1]]);
    // the way home from the reliquary: up the nearest way open, then across the necropolis to the refuge's stairs (steps)
    const home = (g: typeof shut, n: typeof nec) => {
      const way = wayBack(g.steps, g.cols, Cat.RELIQUARY.at), end = way[way.length - 1], k = WORLD.catacombs.up!.findIndex((u) => Math.hypot(D[u].x - end.x, D[u].y - end.y) < 30);
      return way.length + steps(n, below(Zone.DOORS[WORLD.necropolis.doors![parents('catacombs')[k].exit]]));
    };
    const viaWell = home(shut, nec), viaCaveau = home(open, homeward('necropolis', ['caveau']));
    expect(viaCaveau).toBeLessThan(viaWell * 0.6);
    expect(steps(nec, below(Zone.DOORS.puits))).toBeGreaterThan(steps(nec, below(Zone.DOORS.caveau)) * 4); // the well: the necropolis' far end; le caveau by the refuge
    console.info(`the way home from Vesna's reliquary, in steps: ${viaWell} up the well, ${viaCaveau} up le caveau`);
  });

  it('lays the battue at its narrow ways, every other pack up in the necropolis on his way home', () => {
    const P = T.battue.packs, hero = Cat.RELIQUARY.at, way = wayBack(shut.steps, cols, hero), out = below(Zone.DOORS.puits);
    const up = wayBack(nec.steps, nec.cols, out), exp = expedition(0);
    exp.packs = 4;
    const now = loose(exp, way, hero, P, T.battue.far, T.battue.door, chokes('catacombs'), (k) => lair(up, out, T.battue.up, false, T.battue.door, k));
    expect(now.map((p) => !!p.up)).toEqual([false, true, false, true]);
    const down = now.filter((p) => !p.up);
    for (const p of down) expect(Math.hypot(p.at.x - hero.x, p.at.y - hero.y)).toBeGreaterThanOrEqual(T.battue.far);
    expect(down.some((p) => chokes('catacombs').some((c) => c.x === p.at.x && c.y === p.at.y))).toBe(true);
    for (const p of now.filter((p) => p.up)) expect(steps(nec, p.at), `${p.at.x},${p.at.y} in the necropolis`).toBeLessThan(steps(nec, out));
  });
});

describe('save', () => {
  const V3 = { nourrice: { tries: 0, dead: false }, vesna: false, powers: { bought: [], worn: {} } }; // version 3's, at their start
  it('starts afresh without a save, or with a broken one', () => {
    const fresh = { v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [], stash: [], worn: [null, null, null, null, null, null], next: 0, ...V3 };
    expect(parse(null)).toEqual(fresh);
    expect(parse('{not json')).toEqual(fresh);
    expect(parse('42')).toEqual(fresh);
    expect(parse('null')).toEqual(fresh);
  });

  it('reads back what it stored', () => {
    const s = { v: VERSION, banked: 120, unlocks: { bite: true, life: 2, bag: 1 }, dry: 2, shortcuts: ['grille'], stash: [], worn: [null, null, null, null, null, null], next: 0, ...V3 };
    expect(parse(JSON.stringify(s))).toEqual(s);
  });

  it('brings an older or damaged save up to date: missing fields to their start, bad values cleaned, unknown ones dropped', () => {
    expect(parse('{"banked":37}')).toEqual({ v: VERSION, banked: 37, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [], stash: [], worn: [null, null, null, null, null, null], next: 0, ...V3 }); // before versions
    expect(parse('{"v":1,"banked":-5,"unlocks":{"bite":"yes"},"junk":1}')).toEqual({ v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [], stash: [], worn: [null, null, null, null, null, null], next: 0, ...V3 });
    expect(parse('{"v":1,"banked":12.7}').banked).toBe(12);
    expect(parse('{"v":1,"banked":"NaN"}').banked).toBe(0);
    expect(parse('{"v":1,"unlocks":{"bite":true,"life":-1}}').unlocks).toEqual({ bite: true, life: 0, bag: 0 });
  });

  it('keeps the shortcuts raised for good, each once, whatever else the save holds', () => {
    expect(parse('{"v":1,"shortcuts":["grille","grille","scellee",3,null]}').shortcuts).toEqual(['grille', 'scellee']);
    expect(parse('{"v":1,"shortcuts":"grille"}').shortcuts).toEqual([]);
    expect(parse('{"v":2,"shortcuts":["galerie","caveau"]}').shortcuts).toEqual(['galerie', 'caveau']); // le caveau, raised in the catacombs
    const s = parse(null);
    s.shortcuts.push('scellee');
    expect(parse(JSON.stringify(s)).shortcuts).toEqual(['scellee']);
    for (const g of [...Zone.GATES, ...Cat.GATES]) expect(missing(`${g.name} : lever (F) Fermée de l'autre côté ${g.name} : ouverte pour toujours.`)).toEqual([]);
  });
});

describe("the Rongé's wares", () => {
  const save = (banked: number): Save => parse(JSON.stringify({ banked }));

  it('prices: the bite once, life and the bag by ranks, each x1.8 the last, then sold out', () => {
    expect(price('bite', 0)).toBe(T.ronge.bite);
    expect(price('bite', 1)).toBeUndefined();
    expect([0, 1, 2, 3, 4].map((n) => price('life', n))).toEqual([40, 72, 130, 233, undefined]);
    expect([0, 1, 2, 3].map((n) => price('bag', n))).toEqual([60, 108, 194, undefined]);
    for (let n = 1; n < 3; n++) expect(price('life', n)! / price('life', n - 1)!).toBeCloseTo(T.ronge.life.mult, 1);
  });

  it('buys from the bank: the price taken, the rank saved; too little banked changes nothing', () => {
    const s = save(130);
    expect(buy(s, 'bite')).toBe('sold');
    expect([s.banked, s.unlocks.bite]).toEqual([50, true]);
    expect(buy(s, 'bite')).toBe('none');
    expect(buy(s, 'life')).toBe('sold'); // 40
    expect(buy(s, 'life')).toBe('poor'); // 72 > 10
    expect([s.banked, s.unlocks.life, owned(s, 'life')]).toEqual([10, 1, 1]);
    expect(parse(JSON.stringify(s))).toEqual(s); // what is bought outlives the page
    const b = save(1000);
    while (buy(b, 'bag') === 'sold');
    expect([b.unlocks.bag, bagSize(b), b.banked]).toEqual([3, T.blood.bag + 3 * T.ronge.bag.size, 1000 - 60 - 108 - 194]);
  });

  it('turns beast after too many returns without pouring', () => {
    const s = save(0);
    s.dry = T.ronge.hunger - 1;
    expect(beast(s)).toBe(false);
    s.dry++;
    expect(beast(s)).toBe(true);
  });

  it('speaks and labels his wares in letters the font has', () => {
    for (const w of WARES) expect(missing(WARE_TEXT[w].name + WARE_TEXT[w].text)).toEqual([]);
    for (const l of Object.values(LINES).flat()) expect(missing(l)).toEqual([]);
    expect(missing('Les chiens ont flairé ton sang. Un Inquisiteur lâche ses chiens. Le Rongé (F) Bassin : sang Échap pour partir')).toEqual([]);
  });
});
