// The world of the expeditions (docs/extraction.md §4): the refuge, two open zones (src/zone.ts): la nécropole round it,
// les catacombes under it (down the well at its far end, or the stairs of its caveau once their gate is raised from
// below), and the painted rooms, interiors entered by a door of the necropolis (the chapel's portcullises lead on to the
// cloister). Going deeper takes a place's forward exits (the refuge's stairs; a zone's doors; the chapel's
// portcullises); a room's stairs, or a zone's ways up, lead back. Pure, so it can be unit tested.
import * as Nec from './necropolis.data.ts';
import * as Cat from './catacombs.data.ts';
import { stepsFrom, walkCells } from './logic.ts';
import type { Item } from './items.ts';

export type Place = 'refuge' | 'necropolis' | 'catacombs' | 'hall' | 'nave' | 'ossuary' | 'chapel' | 'cloister';
type P = { x: number; y: number };

/** An open zone's plan, as tools/art/zone.gen.mjs bakes it (src/<zone>.data.ts). */
export type ZoneData = {
  W: number; H: number; SW: number; SH: number; COLS: number; ROWS: number;
  OVER: [number, number, number, number, number, number, number][][];
  BOXES: [number, number, number, number][]; PITS: [number, number, number, number][];
  GATES: { id: string; name: string; side: number; lever: P | null; arch: boolean; arena: boolean; box: [number, number, number, number]; at: [number, number]; w: number; h: number; depth: number; frames: [number, number][] }[];
  OPENS?: { id: string; at: [number, number]; w: number; h: number; depth: number; frames: [number, number][] }[]; // what opens once (Vesna's reliquary)
  TUNNEL: { x: number; y: number; w: number }[]; DOORS: Record<string, { x: number; y: number; w: number }>;
  AREAS: { id: string; ring: number; rect: [number, number, number, number]; groups: number }[];
  SPAWNS: [number, number, number][]; CACHES: [number, number][]; CHOKES: [number, number, number][];
  TORCHES: [number, number, number][]; HOLY: string; LANTERNS: [number, number][]; PALETTE: string[];
};
export type ZoneId = 'necropolis' | 'catacombs';
export const ZONES: Record<ZoneId, ZoneData> = { necropolis: Nec, catacombs: Cat };
export const isZone = (p: string): p is ZoneId => p in ZONES;

/** Each place: its ring (0 the refuge, deeper is harder; a zone's own is by area, ringAt()), its name, where each
 *  forward exit leads, and its blood caches (the props worth searching; floor points in front). A zone's `doors`: the
 *  door of each forward exit; `up`: the doors of its ways back, in the order of the exits leading into it (parents()). */
export const WORLD: Record<Place, { ring: number; name: string; ahead: Place[]; caches: P[]; doors?: string[]; up?: string[] }> = {
  refuge: { ring: 0, name: 'Le refuge', ahead: ['necropolis'], caches: [] }, // its stairs down
  necropolis: { ring: 1, name: 'La nécropole', ahead: ['hall', 'nave', 'ossuary', 'chapel', 'catacombs', 'catacombs'], doors: ['hall', 'nave', 'ossuary', 'chapel', 'puits', 'caveau'],
    up: ['refuge'], caches: Nec.CACHES.map(([x, y]) => ({ x, y })) },
  catacombs: { ring: 3, name: 'Les catacombes', ahead: [], doors: [], up: ['puits', 'caveau'], caches: Cat.CACHES.map(([x, y]) => ({ x, y })) }, // up the well, up le caveau's stairs
  hall: { ring: 1, name: 'La crypte', ahead: [], caches: [{ x: 96, y: 242 }, { x: 392, y: 242 }, { x: 104, y: 392 }, { x: 380, y: 392 }] },
  nave: { ring: 2, name: 'La nef', ahead: [], caches: [{ x: 98, y: 214 }, { x: 386, y: 148 }, { x: 98, y: 324 }, { x: 384, y: 596 }] },
  ossuary: { ring: 2, name: "L'ossuaire", ahead: [], caches: [{ x: 66, y: 94 }, { x: 410, y: 246 }, { x: 420, y: 306 }, { x: 70, y: 612 }, { x: 250, y: 492 }] },
  chapel: { ring: 3, name: 'La chapelle', ahead: ['cloister', 'cloister'], caches: [{ x: 240, y: 112 }, { x: 240, y: 512 }] }, // the altar, the font
  cloister: { ring: 4, name: 'Le cloître', ahead: [], caches: [{ x: 330, y: 478 }, { x: 240, y: 118 }] }, // the body the Dawn burnt, the church step
};

/** Zone `z`'s area at floor point (x, y) (its AREAS, first match). */
export const areaAt = (z: ZoneId, x: number, y: number) => ZONES[z].AREAS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x < x1 && y >= y0 && y < y1);
/** Zone `z`'s ring at floor point (x, y): its area's. */
export const ringAt = (z: ZoneId, x: number, y: number) => areaAt(z, x, y)?.ring ?? WORLD[z].ring;

/** An expedition's way back: for each place entered going deeper, the place and the exit he came through. */
export type Came = Partial<Record<Place, { from: Place; exit: number }>>;

/** Where exit `exit` of `from` leads: a forward exit (0, 1...) into its place, entered by its stairs (entry -1; a zone:
 *  at the way up this exit comes out of, -1 - k: the necropolis at the refuge's stairs, the catacombs at the well's foot
 *  or le caveau's stairs); the way back (-1) to the place he came from (else the first that leads here), entered by the
 *  exit that leads here (the necropolis: at that door); a zone's way back -1 - k (up[k]) to where it leads, at the exit
 *  that leads here. `came` is updated going deeper. Undefined: that exit leads nowhere (the cloister's doors; the
 *  refuge has no way back). */
export function go(came: Came, from: Place, exit: number): { to: Place; entry: number } | undefined {
  if (exit >= 0) {
    const to = WORLD[from].ahead[exit];
    if (!to) return undefined;
    came[to] = { from, exit };
    return { to, entry: isZone(to) ? -1 - Math.max(0, parents(to).findIndex((p) => p.from === from && p.exit === exit)) : -1 };
  }
  const back = isZone(from) ? parents(from)[-1 - exit] : came[from] ?? parents(from)[0];
  return back && { to: back.from, entry: back.exit };
}

/** The ways into `to` going deeper: each place and exit leading to it. */
export function parents(to: Place) {
  return (Object.keys(WORLD) as Place[]).flatMap((from) => WORLD[from].ahead.flatMap((t, exit) => (t === to ? [{ from, exit }] : [])));
}

// ---------- a zone's chunks (zone.ts loads them round the camera) ----------

/** Zone `z`'s chunks (i, j; a screen each) within `m` px of the rectangle x, y, w, h. */
export function around(z: ZoneId, x: number, y: number, w: number, h: number, m: number): [number, number][] {
  const { SW, SH, COLS, ROWS } = ZONES[z], out: [number, number][] = [];
  const i0 = Math.max(0, Math.floor((x - m) / SW)), i1 = Math.min(COLS - 1, Math.ceil((x + w + m) / SW) - 1);
  const j0 = Math.max(0, Math.floor((y - m) / SH)), j1 = Math.min(ROWS - 1, Math.ceil((y + h + m) / SH) - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}
/** The first of zone `z`'s 2 x 2 chunks whose light a view at (x, y) needs (a view is one screen at most). */
export const quadOf = (z: ZoneId, x: number, y: number) => { const Z = ZONES[z]; return { i: Math.min(Z.COLS - 2, Math.max(0, Math.floor(x / Z.SW))), j: Math.min(Z.ROWS - 2, Math.max(0, Math.floor(y / Z.SH))) }; };

// ---------- a zone's way back, where the battue lies in wait ----------

export const NAV = 8; // the walk grid's cell, px (RoomScene's)
const grids = new Map<string, { open: boolean[]; cols: number; steps: number[]; links: Map<number, number> }>();
export const cellAt = (cols: number, x: number, y: number) => Math.floor(y / NAV) * cols + Math.floor(x / NAV);
/** Raised for good: the gallery (shortcut B), its two mouths linked. */
export const galleryOpen = (opened: readonly string[]) => opened.includes('galerie');
/** A zone's gate open: raised for good (`opened`), or an arena's, open but while a fight (`fight`) shuts it. */
export const gateOpen = (g: ZoneData['GATES'][number], opened: readonly string[], fight = false) => (g.arena ? !fight : opened.includes(g.id));
/** Zone `z`'s ways up open (the indexes in WORLD[z].up of those whose door no gate shuts). */
export const waysUp = (z: ZoneId, opened: readonly string[]) => WORLD[z].up!.flatMap((k, i) => (ZONES[z].GATES.some((g) => g.id === k && !gateOpen(g, opened)) ? [] : [i]));
/** Zone `z`'s walk grid (cells NAV px; the shortcuts not in `opened` shut; the gallery's mouths a step apart once open)
 *  and the steps from every cell to its nearest way up open (the necropolis: the refuge's stairs; the catacombs: the
 *  well's foot, or le caveau's stairs once raised). Worked out once per zone and set of open shortcuts. */
export function homeward(z: ZoneId, opened: readonly string[]) {
  const Z = ZONES[z], key = `${z}:${[...new Set(Z.GATES.filter((g) => opened.includes(g.id)).map((g) => g.id))].join()}`;
  if (!grids.has(key)) {
    const box = ([x, y, width, height]: readonly number[]) => ({ x, y, width, height });
    const shut = Z.GATES.filter((g) => !gateOpen(g, opened)).map((g) => g.box);
    const open = walkCells(box([0, 0, Z.W, Z.H]), [...Z.BOXES, ...Z.PITS, ...shut].map(box), NAV), cols = Math.ceil(Z.W / NAV);
    const [a, b] = Z.TUNNEL.map((t) => cellAt(cols, t.x, t.y + 12)), links = new Map<number, number>(galleryOpen(opened) && Z.TUNNEL.length ? [[a, b], [b, a]] : []);
    const ups = waysUp(z, opened).map((i) => Z.DOORS[WORLD[z].up![i]]);
    grids.set(key, { open, cols, links, steps: stepsFrom(open, cols, ups.map((d) => cellAt(cols, d.x, d.y + 12)), links) });
  }
  return grids.get(key)!;
}

/** His way back to a zone's way up (homeward()) from floor point `from`, on a walk grid `cols` wide whose `steps` count
 *  the steps to it (`links`: the gallery's mouths): each cell's centre, downhill, to it. Empty when there is no way. */
export function wayBack(steps: readonly number[], cols: number, from: P, links: ReadonlyMap<number, number> = new Map()): P[] {
  let c = cellAt(cols, from.x, from.y);
  if (!(steps[c] < Infinity)) { // pressed against a prop: the nearest cell with a way
    const x = c % cols;
    for (let r = 1; r <= 3 && !(steps[c] < Infinity); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const n = c + dx + dy * cols;
      if (x + dx >= 0 && x + dx < cols && steps[n] < (steps[c] ?? Infinity)) c = n;
    }
    if (!(steps[c] < Infinity)) return [];
  }
  const way: P[] = [];
  while (steps[c] > 0) {
    const x = c % cols;
    let best = c;
    for (const n of [c - cols, c + cols, c - 1, c + 1, c - cols - 1, c - cols + 1, c + cols - 1, c + cols + 1])
      if (Math.abs((n % cols) - x) <= 1 && steps[n] < steps[best]) best = n;
    const l = links.get(c);
    if (l !== undefined && steps[l] < steps[best]) best = l; // through the gallery
    if (best === c) break;
    way.push({ x: ((c = best) % cols) * NAV + NAV / 2, y: Math.floor(c / cols) * NAV + NAV / 2 });
  }
  return way;
}

/** Zone `z`'s narrow ways (the necropolis' bridge, causeway, grille, breach, gallery's mouth; the catacombs' galleries
 *  between their chambers), where packs wait. */
export const chokes = (z: ZoneId): readonly (P & { r: number })[] => ZONES[z].CHOKES.map(([x, y, r]) => ({ x, y, r }));
export const CHOKES = chokes('necropolis');
/** Where a pack of the battue lies in wait on his way back (`way`, from him to the way up): at the narrow ways he must
 *  pass (`chokes`) at least `far` from him (out of his sight), the k-th he meets for the k-th pack already laid; past them,
 *  the first point of the way that far from him, `k` packs already laid pushing it `gap` px further along each; before
 *  the way up (`door` points short of it), every other pack, if that is far enough from him. Undefined: no room
 *  between him and the way up for it. */
export function lair(way: readonly P[], hero: P, far: number, stairs: boolean, door: number, k = 0, gap = 90, chokes = CHOKES): P | undefined {
  const d = (p: P) => Math.hypot(p.x - hero.x, p.y - hero.y);
  if (stairs) { const p = way[Math.max(0, way.length - 1 - door)]; return p && d(p) >= far ? p : undefined; }
  const i = way.findIndex((p) => d(p) >= far);
  if (i < 0) return undefined;
  const met = chokes.filter((c) => d(c) >= far).map((c) => ({ c, at: way.findIndex((p, j) => j >= i && Math.hypot(p.x - c.x, p.y - c.y) <= c.r) }))
    .filter((m) => m.at >= 0).sort((a, b) => a.at - b.at);
  return (met[k] && { x: met[k].c.x, y: met[k].c.y }) ?? way[Math.min(way.length - 1, i + Math.round((k * gap) / NAV))];
}

/** A place of an expedition as the hero left it: its foes alive (where they stood, their hp, their post; a hound that
 *  already followed him through an exit; `pack`: the battue's pack it belongs to, until it found him), its caches not
 *  yet searched (their blood, the item some hide), the blood and the items left on its floor. */
export type RoomState = {
  foes: { kind: string; x: number; y: number; hp: number; home: P; followed?: boolean; pack?: number }[];
  caches: (P & { blood: number; item?: Item })[];
  drops: (P & { blood: number })[];
  items: (P & { item: Item })[];
};
/** The expedition under way: when it started, the deepest ring reached, the way back, the places entered; `packs`: the
 *  battue's packs his scent has called (logic.ts scent()) still waiting for a lair; `loosed`: the packs laid in wait so
 *  far, `met`: those that found him. */
export type Expedition = { startedAt: number; deepest: number; came: Came; rooms: Partial<Record<Place, RoomState>>; packs: number; loosed: number; met: number; boss?: 'essai' | 'tuée' }; // boss: the Nourrice fought, or killed
export const expedition = (deepest: number): Expedition => ({ startedAt: Date.now(), deepest, came: {}, rooms: {}, packs: 0, loosed: 0, met: 0 });

/** Lays the packs his scent has called (`exp.packs`) in wait across a zone, on his way back from `hero` (`way`, see
 *  wayBack(); `zoneChokes`: its narrow ways): the k-th of the expedition is `packs[k - 1]` (the last repeats), every
 *  other one before the way up, or up in the zone above where `above(k)` (its k-th such pack) gives a place (`up`: the
 *  catacombs' battue waits in the necropolis too, on his way home). Those with no lair wait (he is too near the way up).
 *  Returns the packs loosed now and where. */
export function loose(exp: Expedition, way: readonly P[], hero: P, packs: readonly (readonly string[])[], far: number, door: number, zoneChokes = CHOKES, above?: (k: number) => P | undefined) {
  const now: { at: P; kinds: readonly string[]; up?: true }[] = [];
  let ahead = 0, high = 0;
  for (; exp.packs > 0; exp.packs--) {
    const stairs = (exp.loosed + 1) % 2 === 0, up = stairs ? above?.(high) : undefined, at = up ?? lair(way, hero, far, stairs, door, stairs ? 0 : ahead, 90, zoneChokes);
    if (!at) break;
    if (up) high++;
    else if (!stairs) ahead++;
    now.push({ at, kinds: packs[Math.min(++exp.loosed, packs.length) - 1], ...(up ? { up: true as const } : {}) });
  }
  return now;
}
