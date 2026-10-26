// The world of the expeditions (docs/extraction.md §4): the refuge, la nécropole (one open zone round it, src/zone.ts)
// and the painted rooms, now interiors entered by a door of the zone (the chapel's portcullises lead on to the cloister).
// Going deeper takes a place's forward exits (the refuge's stairs; the zone's doors; the chapel's portcullises); a room's
// stairs, or the zone's way up to the refuge, lead back where he came from. Pure, so it can be unit tested.
import * as Zone from './necropolis.data.ts';
import { stepsFrom, walkCells } from './logic.ts';

export type Place = 'refuge' | 'necropolis' | 'hall' | 'nave' | 'ossuary' | 'chapel' | 'cloister';
type P = { x: number; y: number };

/** Each place: its ring (0 the refuge, deeper is harder; the zone's own is by area, ringAt()), its name, where each
 *  forward exit leads (the zone's: its doors), and its blood caches (the props worth searching; floor points in front). */
export const WORLD: Record<Place, { ring: number; name: string; ahead: Place[]; caches: P[] }> = {
  refuge: { ring: 0, name: 'Le refuge', ahead: ['necropolis'], caches: [] }, // its stairs down
  necropolis: { ring: 1, name: 'La nécropole', ahead: ['hall', 'nave', 'ossuary', 'chapel'], caches: Zone.CACHES.map(([x, y]) => ({ x, y })) },
  hall: { ring: 1, name: 'La crypte', ahead: [], caches: [{ x: 96, y: 242 }, { x: 392, y: 242 }, { x: 104, y: 392 }, { x: 380, y: 392 }] },
  nave: { ring: 2, name: 'La nef', ahead: [], caches: [{ x: 98, y: 214 }, { x: 386, y: 148 }, { x: 98, y: 324 }, { x: 384, y: 596 }] },
  ossuary: { ring: 2, name: "L'ossuaire", ahead: [], caches: [{ x: 66, y: 94 }, { x: 410, y: 246 }, { x: 420, y: 306 }, { x: 70, y: 612 }, { x: 250, y: 492 }] },
  chapel: { ring: 3, name: 'La chapelle', ahead: ['cloister', 'cloister'], caches: [{ x: 240, y: 112 }, { x: 240, y: 512 }] }, // the altar, the font
  cloister: { ring: 4, name: 'Le cloître', ahead: [], caches: [{ x: 330, y: 478 }, { x: 240, y: 118 }] }, // the body the Dawn burnt, the church step
};

/** The zone's ring at floor point (x, y): its area's (Zone.AREAS, first match). */
export const ringAt = (x: number, y: number) => Zone.AREAS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x < x1 && y >= y0 && y < y1)?.ring ?? 1;

/** An expedition's way back: for each place entered going deeper, the place and the exit he came through. */
export type Came = Partial<Record<Place, { from: Place; exit: number }>>;

/** Where exit `exit` of `from` leads: a forward exit (0, 1...) into its place, entered by its stairs (entry -1; the
 *  zone: at the refuge's stairs); the way back (-1) to the place he came from (else the first that leads here), entered
 *  by the exit that leads here (the zone: at that door). `came` is updated going deeper. Undefined: that exit leads
 *  nowhere (the cloister's doors; the refuge has no way back). */
export function go(came: Came, from: Place, exit: number): { to: Place; entry: number } | undefined {
  if (exit >= 0) {
    const to = WORLD[from].ahead[exit];
    if (!to) return undefined;
    came[to] = { from, exit };
    return { to, entry: -1 };
  }
  const back = came[from] ?? parents(from)[0];
  return back && { to: back.from, entry: back.exit };
}

/** The ways into `to` going deeper: each place and exit leading to it. */
export function parents(to: Place) {
  return (Object.keys(WORLD) as Place[]).flatMap((from) => WORLD[from].ahead.flatMap((t, exit) => (t === to ? [{ from, exit }] : [])));
}

// ---------- the zone's chunks (zone.ts loads them round the camera) ----------

/** The zone's chunks (i, j; a screen each) within `m` px of the rectangle x, y, w, h. */
export function around(x: number, y: number, w: number, h: number, m: number): [number, number][] {
  const { SW, SH, COLS, ROWS } = Zone, out: [number, number][] = [];
  const i0 = Math.max(0, Math.floor((x - m) / SW)), i1 = Math.min(COLS - 1, Math.ceil((x + w + m) / SW) - 1);
  const j0 = Math.max(0, Math.floor((y - m) / SH)), j1 = Math.min(ROWS - 1, Math.ceil((y + h + m) / SH) - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}
/** The first of the 2 x 2 chunks whose light a view at (x, y) needs (a view is one screen at most). */
export const quadOf = (x: number, y: number) => ({ i: Math.min(Zone.COLS - 2, Math.max(0, Math.floor(x / Zone.SW))), j: Math.min(Zone.ROWS - 2, Math.max(0, Math.floor(y / Zone.SH))) });

// ---------- the zone's way back, where the battue lies in wait ----------

export const NAV = 8; // the walk grid's cell, px (RoomScene's)
const grids = new Map<string, { open: boolean[]; cols: number; steps: number[]; links: Map<number, number> }>();
export const cellAt = (cols: number, x: number, y: number) => Math.floor(y / NAV) * cols + Math.floor(x / NAV);
/** Raised for good: the gallery (shortcut B), its two mouths linked. */
export const galleryOpen = (opened: readonly string[]) => opened.includes('galerie');
/** The zone's walk grid (cells NAV px; the shortcuts not in `opened` shut; the gallery's mouths a step apart once open)
 *  and the steps from every cell to the refuge's stairs. Worked out once per set of open shortcuts. */
export function homeward(opened: readonly string[]) {
  const key = [...new Set(Zone.GATES.filter((g) => opened.includes(g.id)).map((g) => g.id))].join();
  if (!grids.has(key)) {
    const box = ([x, y, width, height]: readonly number[]) => ({ x, y, width, height });
    const shut = Zone.GATES.filter((g) => !opened.includes(g.id)).map((g) => g.box);
    const open = walkCells(box([0, 0, Zone.W, Zone.H]), [...Zone.BOXES, ...Zone.PITS, ...shut].map(box), NAV), cols = Math.ceil(Zone.W / NAV);
    const [a, b] = Zone.TUNNEL.map((t) => cellAt(cols, t.x, t.y + 12)), links = new Map<number, number>(galleryOpen(opened) ? [[a, b], [b, a]] : []);
    const d = Zone.DOORS.refuge;
    grids.set(key, { open, cols, links, steps: stepsFrom(open, cols, cellAt(cols, d.x, d.y + 12), links) });
  }
  return grids.get(key)!;
}

/** His way back to the refuge's stairs from floor point `from`, on a walk grid `cols` wide whose `steps` count the
 *  steps to them (`links`: the gallery's mouths): each cell's centre, downhill, to the stairs. Empty when there is no way. */
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

/** Where a pack of the battue lies in wait on his way back (`way`, from him to the stairs): the first point at least
 *  `far` from him (out of his sight), `k` packs already laid pushing it `gap` px further along the way each; before the stairs
 *  (`door` points short of them), every other pack, if that is far enough from him. Undefined: no room between him and
 *  the refuge for it. */
export function lair(way: readonly P[], hero: P, far: number, stairs: boolean, door: number, k = 0, gap = 90): P | undefined {
  const d = (p: P) => Math.hypot(p.x - hero.x, p.y - hero.y);
  if (stairs) { const p = way[Math.max(0, way.length - 1 - door)]; return p && d(p) >= far ? p : undefined; }
  const i = way.findIndex((p) => d(p) >= far);
  return i < 0 ? undefined : way[Math.min(way.length - 1, i + Math.round((k * gap) / NAV))];
}

/** A place of an expedition as the hero left it: its foes alive (where they stood, their hp, their post; a hound that
 *  already followed him through an exit; `pack`: the battue's pack it belongs to, until it found him), its caches not yet searched, the blood left on its floor. */
export type RoomState = {
  foes: { kind: string; x: number; y: number; hp: number; home: P; followed?: boolean; pack?: number }[];
  caches: (P & { blood: number })[];
  drops: (P & { blood: number })[];
};
/** The expedition under way: when it started, the deepest ring reached, the way back, the places entered; `packs`: the
 *  battue's packs his scent has called (logic.ts scent()) still waiting for a lair; `loosed`: the packs laid in wait so
 *  far, `met`: those that found him. */
export type Expedition = { startedAt: number; deepest: number; came: Came; rooms: Partial<Record<Place, RoomState>>; packs: number; loosed: number; met: number };
export const expedition = (deepest: number): Expedition => ({ startedAt: Date.now(), deepest, came: {}, rooms: {}, packs: 0, loosed: 0, met: 0 });

/** Lays the packs his scent has called (`exp.packs`) in wait across the zone, on his way back from `hero` (`way`, see
 *  wayBack()): the k-th of the expedition is `packs[k - 1]` (the last repeats), every other one before the stairs.
 *  Those with no lair wait (he is too near the refuge). Returns the packs loosed now and where. */
export function loose(exp: Expedition, way: readonly P[], hero: P, packs: readonly (readonly string[])[], far: number, door: number) {
  const now: { at: P; kinds: readonly string[] }[] = [];
  let ahead = 0;
  for (; exp.packs > 0; exp.packs--) {
    const stairs = (exp.loosed + 1) % 2 === 0, at = lair(way, hero, far, stairs, door, stairs ? 0 : ahead);
    if (!at) break;
    if (!stairs) ahead++;
    now.push({ at, kinds: packs[Math.min(++exp.loosed, packs.length) - 1] });
  }
  return now;
}
