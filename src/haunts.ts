// What lives in la nécropole (docs/extraction.md §4; T.haunts, T.elite): its set pieces at key points (POSTS: ghouls on
// their dead, l'Enterré under his mound, le Gavé at the fosses, la Chose at the bridge, the Order's posts and
// reliquaries' elites), the Order's patrols walking their routes with a lantern, the prisoner they drag to the camp.
// The plan is tools/art/rooms/necropolis.mjs (src/necropolis.data.ts); these are its pure rules, tested
// (haunts.test.ts); RoomScene plays them.
import { T } from './tuning.ts';
import * as Nec from './necropolis.data.ts';

type P = { x: number; y: number };
export type Post = { id: string; x: number; y: number; kinds: string[]; feed?: number[][]; elite?: number; route?: string; relic?: number[]; prisoner?: boolean };
export type Route = { pts: [number, number][]; once?: boolean };
export const POSTS = Nec.POSTS as Post[];
export const ROUTES = Nec.ROUTES as unknown as Record<string, Route>;
export const MOUNDS = Nec.MOUNDS as unknown as [number, number][];
export const RATS = Nec.RATS as unknown as [number, number][];
export const NOTES = Nec.NOTES as { id: string; x: number; y: number }[];

/** What a placed foe of the zone is beyond its kind: an elite; eating the dead at `feed`; walking `route` (its `slot` in
 *  the patrol, 0 the lantern bearer; `leg`: the waypoint it heads for, `dir` its way along). Kept with it in the room's state. */
export type Haunt = { elite?: boolean; feed?: P; route?: string; slot?: number; leg?: number; dir?: number };
export type Placing = P & { kind: string; haunt?: Haunt };

/** The zone's set pieces, as foes to place: side by side at their post (feeding ghouls round their dead, a patrol in file). */
export function setPieces(posts: readonly Post[] = POSTS): Placing[] {
  return posts.flatMap((p) => p.kinds.map((kind, i) => {
    const feed = p.feed && kind === 'ghoul' ? p.feed[i % p.feed.length] : undefined;
    const at = feed ? { x: feed[0] + (i % 2 ? 14 : -14), y: feed[1] + (i > 1 ? 6 : 0) } : p.route ? { x: p.x, y: p.y + 10 * i } : { x: p.x + (i % 2 ? 14 : -14) * Math.ceil(i / 2), y: p.y };
    const haunt: Haunt = { ...(p.elite === i ? { elite: true } : {}), ...(feed ? { feed: { x: feed[0], y: feed[1] } } : {}), ...(p.route ? { route: p.route, slot: i, leg: 0, dir: 1 } : {}) };
    return { ...at, kind, ...(Object.keys(haunt).length ? { haunt } : {}) };
  }));
}

/** The dead laid on the zone's floor for its feeders (ghouls, le Gavé): every post's. */
export const corpses = (posts: readonly Post[] = POSTS): P[] => posts.flatMap((p) => (p.feed ?? []).map(([x, y]) => ({ x, y })));
/** The caches the zone's elites guard: always there, always an item. */
export const relics = (posts: readonly Post[] = POSTS): P[] => posts.flatMap((p) => (p.relic ? [{ x: p.relic[0], y: p.relic[1] }] : []));

/** The mound nearest `p` within `r` (an Enterré lies there), none taken already. */
export function mound(p: P, r: number, taken: readonly P[] = []): P | undefined {
  let best: P | undefined, d = r;
  for (const [x, y] of MOUNDS) { const e = Math.hypot(x - p.x, y - p.y); if (e <= d && !taken.some((t) => t.x === x && t.y === y)) [best, d] = [{ x, y }, e]; }
  return best;
}

/** Whether a group's first foe is an elite, in a place of ring `ring`. Never a flock, an Enterré nor la Chose. */
export const elite = (kind: string, ring: number, rnd: () => number) => !['crows', 'enterre', 'chose'].includes(kind) && rnd() < (T.elite.chance[ring] ?? 0);

/** A patrol's leader at `at` heading for waypoint `leg` of `route` going `dir`: once within T.haunts.reach of it, the next
 *  one (back and forth, or to its end for a route walked once). */
export function advance(route: Route, leg: number, dir: number, at: P) {
  const [x, y] = route.pts[leg];
  if (Math.hypot(at.x - x, at.y - y) > T.haunts.reach) return { leg, dir };
  const n = route.pts.length;
  if (leg + dir >= 0 && leg + dir < n) return { leg: leg + dir, dir };
  return route.once ? { leg, dir } : { leg: leg - dir, dir: -dir };
}

/** Where a patrol's `slot`-th walks: behind its leader (at `lead`, heading `heading`), in file. */
export const inFile = (lead: P, heading: number, slot: number): P => ({ x: lead.x - Math.cos(heading) * 16 * slot, y: lead.y - Math.sin(heading) * 12 * slot });
