import { describe, expect, it } from 'vitest';
import { WORLD, around, cellAt, expedition, go, homeward, lair, loose, parents, quadOf, ringAt, wayBack, type Came, type Place } from './world.ts';
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
import type { Plan } from './baked.ts';

const PLANS: Record<Exclude<Place, 'refuge' | 'necropolis'>, Plan> = { hall: Crypt, nave: Nave, ossuary: Ossuary, chapel: Chapel, cloister: Cloister };
const places = Object.keys(WORLD) as Place[], rooms = places.filter((p): p is keyof typeof PLANS => p in PLANS);

describe('the world: the refuge, la nécropole round it, the painted rooms as its interiors', () => {
  it("the refuge's stairs lead into the zone; its doors into the crypt, the nave, the ossuary, the chapel; the chapel on to the cloister", () => {
    expect(WORLD.refuge.ahead).toEqual(['necropolis']);
    expect(WORLD.necropolis.ahead).toEqual(['hall', 'nave', 'ossuary', 'chapel']);
    expect(WORLD.chapel.ahead).toEqual(['cloister', 'cloister']);
    for (const p of ['hall', 'nave', 'ossuary', 'cloister'] as const) expect(WORLD[p].ahead).toEqual([]);
    expect(rooms.map((p) => WORLD[p].ring)).toEqual([1, 2, 2, 3, 4]); // an interior keeps its ring
    for (const p of WORLD.necropolis.ahead) expect(Zone.DOORS[p as keyof typeof Zone.DOORS], p).toBeDefined();
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
  const shut = homeward([]), open = homeward(Zone.GATES.map((g) => g.id)), { cols } = shut;
  const steps = (g: typeof shut, p: { x: number; y: number }) => g.steps[cellAt(cols, p.x, p.y)];
  const D = Zone.DOORS, below = (d: { x: number; y: number }) => ({ x: d.x, y: d.y + 14 }); // just out of a door
  const holy = runMask(Zone.HOLY, Zone.W, Zone.H), burns = (x: number, y: number) => holy[Math.floor(y) * Zone.W + Math.floor(x)] === 1;

  it('is 8 x 5 screens, in chunks of one screen, each with its sprites', () => {
    expect([Zone.W, Zone.H, Zone.SW * Zone.COLS, Zone.SH * Zone.ROWS]).toEqual([3840, 1350, 3840, 1350]);
    expect([Zone.SW, Zone.SH]).toEqual([T.width, T.height]); // a chunk is a screen of the view
    expect(Zone.OVER.length).toBe(Zone.COLS * Zone.ROWS);
  });

  it('loads the chunks round the view, never the whole zone', () => {
    expect(around(0, 0, 480, 270, 0)).toEqual([[0, 0]]);
    expect(around(470, 260, 480, 270, 0)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
    expect(around(470, 260, 480, 270, 20)).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]);
    expect(around(1000, 600, 480, 270, 160).length).toBeLessThanOrEqual(16);
    expect(around(-500, -500, 480, 270, 0)).toEqual([]);
    expect(around(3360, 1080, 480, 270, 160).every(([i, j]) => i < Zone.COLS && j < Zone.ROWS)).toBe(true);
    // the light of the 2 x 2 chunks under the view; at the far edges, the last two
    expect(quadOf(10, 10)).toEqual({ i: 0, j: 0 });
    expect(quadOf(500, 300)).toEqual({ i: 1, j: 1 });
    expect(quadOf(3360, 1080)).toEqual({ i: Zone.COLS - 2, j: Zone.ROWS - 2 });
    for (const [x, y] of [[0, 0], [479, 269], [1234, 777], [3360, 1080]]) { // the view always within its 2 x 2
      const { i, j } = quadOf(x, y);
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
    expect(Math.abs(steps(homeward(['grille']), beyond) - steps(homeward(['grille']), near))).toBeLessThan(8);
    // B, the gallery: its far mouth a step from its near one once raised
    const [m0, m1] = Zone.TUNNEL.map(below), both = homeward(['galerie']);
    expect(Math.abs(steps(both, m1) - steps(both, m0))).toBeLessThanOrEqual(2);
    expect(steps(open, m1)).toBeLessThan(steps(shut, m1) * 0.6); // with A, the far side's mouth is near the refuge
    // the way back from the deepest door, walked: each shortcut shortens it, both much more
    const far = trip(shut, below(D.chapel)), a = trip(homeward(['grille']), below(D.chapel)), b = trip(both, below(D.chapel)), ab = trip(open, below(D.chapel));
    expect(a).toBeLessThan(far * 0.85);
    expect(b).toBeGreaterThan(0); // B alone opens the gallery from the middle's north band, still reached the long way
    expect(ab).toBeLessThan(far * 0.6);
    console.info(`the way back from the chapel, walked: ${far | 0} px; A: ${a | 0}; B: ${b | 0}; both: ${ab | 0}`);
  });

  it('places its foes by area and ring: ghouls near the refuge, the Order far from it', () => {
    expect(ringAt(D.refuge.x, D.refuge.y + 40)).toBe(1);
    expect(ringAt(D.hall.x, D.hall.y + 20)).toBe(1);
    expect(ringAt(D.nave.x, D.nave.y + 20)).toBe(2);
    expect(ringAt(D.ossuary.x, D.ossuary.y + 20)).toBe(2);
    expect(ringAt(D.chapel.x, D.chapel.y + 20)).toBe(3);
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

  it('burns under the breach only, never at a door, a lever or a cache', () => {
    let n = 0;
    for (let i = 0; i < holy.length; i++) n += holy[i];
    expect(n).toBeGreaterThan(1000);
    for (let i = 0; i < holy.length; i += 97) if (holy[i]) expect(Math.abs((i % Zone.W) - 2620), 'by the breach').toBeLessThan(260);
    for (const p of [...Object.values(D).map(below), ...Zone.GATES.flatMap((g) => (g.lever ? [g.lever] : [])), ...Zone.CACHES.map(([x, y]) => ({ x, y }))]) expect(burns(p.x, p.y), `${p.x},${p.y}`).toBe(false);
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
    const first = lair(way, hero, T.battue.far, false, T.battue.door)!;
    expect(dist(first)).toBeGreaterThanOrEqual(T.battue.far);
    expect(way.indexOf(lair(way, hero, T.battue.far, false, T.battue.door, 1)!) - way.indexOf(first)).toBe(11); // the next one 90 px on
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

describe('save', () => {
  it('starts afresh without a save, or with a broken one', () => {
    const fresh = { v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [] };
    expect(parse(null)).toEqual(fresh);
    expect(parse('{not json')).toEqual(fresh);
    expect(parse('42')).toEqual(fresh);
    expect(parse('null')).toEqual(fresh);
  });

  it('reads back what it stored', () => {
    const s = { v: VERSION, banked: 120, unlocks: { bite: true, life: 2, bag: 1 }, dry: 2, shortcuts: ['grille'] };
    expect(parse(JSON.stringify(s))).toEqual(s);
  });

  it('brings an older or damaged save up to date: missing fields to their start, bad values cleaned, unknown ones dropped', () => {
    expect(parse('{"banked":37}')).toEqual({ v: VERSION, banked: 37, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [] }); // before versions
    expect(parse('{"v":1,"banked":-5,"unlocks":{"bite":"yes"},"junk":1}')).toEqual({ v: VERSION, banked: 0, unlocks: { bite: false, life: 0, bag: 0 }, dry: 0, shortcuts: [] });
    expect(parse('{"v":1,"banked":12.7}').banked).toBe(12);
    expect(parse('{"v":1,"banked":"NaN"}').banked).toBe(0);
    expect(parse('{"v":1,"unlocks":{"bite":true,"life":-1}}').unlocks).toEqual({ bite: true, life: 0, bag: 0 });
  });

  it('keeps the shortcuts raised for good, each once, whatever else the save holds', () => {
    expect(parse('{"v":1,"shortcuts":["grille","grille","scellee",3,null]}').shortcuts).toEqual(['grille', 'scellee']);
    expect(parse('{"v":1,"shortcuts":"grille"}').shortcuts).toEqual([]);
    const s = parse(null);
    s.shortcuts.push('scellee');
    expect(parse(JSON.stringify(s)).shortcuts).toEqual(['scellee']);
    for (const g of Zone.GATES) expect(missing(`${g.name} : lever (F) Fermée de l'autre côté ${g.name} : ouverte pour toujours.`)).toEqual([]);
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
