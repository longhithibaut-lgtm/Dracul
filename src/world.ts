// The world of the expeditions (docs/extraction.md): the refuge and the baked rooms as a graph by depth (rings). Going
// deeper takes a room's forward exits (its portcullises at the top; the refuge's stairs down); its stairs at the bottom
// lead back toward the refuge. Pure, so it can be unit tested.

export type Place = 'refuge' | 'hall' | 'nave' | 'ossuary' | 'chapel' | 'cloister';
type P = { x: number; y: number };

/** Each place: its ring (0 the refuge, deeper is harder), its name, where each forward exit leads, and its blood caches
 *  (the props worth searching: coffins, bone heaps, the altar, a body; floor points in front of them). */
export const WORLD: Record<Place, { ring: number; name: string; ahead: Place[]; caches: P[] }> = {
  refuge: { ring: 0, name: 'Le refuge', ahead: ['hall'], caches: [] }, // its stairs down
  hall: { ring: 1, name: 'La crypte', ahead: ['nave', 'ossuary'], caches: [{ x: 96, y: 242 }, { x: 392, y: 242 }, { x: 104, y: 392 }, { x: 380, y: 392 }] },
  nave: { ring: 2, name: 'La nef', ahead: ['chapel', 'chapel'], caches: [{ x: 98, y: 214 }, { x: 386, y: 148 }, { x: 98, y: 324 }, { x: 384, y: 596 }] },
  ossuary: { ring: 2, name: "L'ossuaire", ahead: ['chapel', 'chapel'], caches: [{ x: 66, y: 94 }, { x: 410, y: 246 }, { x: 420, y: 306 }, { x: 70, y: 612 }, { x: 250, y: 492 }] },
  chapel: { ring: 3, name: 'La chapelle', ahead: ['cloister', 'cloister'], caches: [{ x: 240, y: 112 }, { x: 240, y: 512 }] }, // the altar, the font
  cloister: { ring: 4, name: 'Le cloître', ahead: [], caches: [{ x: 330, y: 478 }, { x: 240, y: 118 }] }, // the body the Dawn burnt, the church step
};

/** An expedition's way back: for each room entered going deeper, the room and the exit he came through. */
export type Came = Partial<Record<Place, { from: Place; exit: number }>>;

/** Where exit `exit` of `from` leads: a forward exit (0, 1) one ring deeper, entered by its stairs (entry -1); the stairs
 *  (-1) back to the room he came from (else the first that leads here), entered by the exit that leads here. `came` is
 *  updated going deeper. Undefined: that exit leads nowhere (the cloister's doors, the refuge has no way back). */
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

/** The rooms between `from` and the refuge on his way back, nearest first: where the battue lies in wait. */
export function wayBack(came: Came, from: Place): Place[] {
  const rooms: Place[] = [];
  for (let at = go(came, from, -1)?.to; at && at !== 'refuge'; at = go(came, at, -1)?.to) rooms.push(at);
  return rooms;
}

/** Where the battue's next pack lies in wait, of the rooms on his way back (`way`, nearest first): the nearest with no
 *  pack waiting yet (`waiting`), else the nearest (its pack replaced by this heavier one); undefined: no room between him
 *  and the refuge. */
export const lair = (way: Place[], waiting: (p: Place) => boolean): Place | undefined => way.find((p) => !waiting(p)) ?? way[0];

/** The ways into `to` going deeper: each room and exit leading to it. */
export function parents(to: Place) {
  return (Object.keys(WORLD) as Place[]).flatMap((from) => WORLD[from].ahead.flatMap((t, exit) => (t === to ? [{ from, exit }] : [])));
}

/** A room of an expedition as the hero left it: its foes alive (where they stood, their hp, their post; a hound that
 *  already followed him through an exit), its caches not yet searched, the blood left on its floor; `battue`: a pack of
 *  the battue lying in wait for him on his way back (its kinds; before the stairs, else near the exit he comes back by),
 *  placed hunting as he comes in. */
export type RoomState = {
  foes: { kind: string; x: number; y: number; hp: number; home: P; followed?: boolean }[];
  caches: (P & { blood: number })[];
  drops: (P & { blood: number })[];
  battue?: { kinds: readonly string[]; stairs: boolean };
};
/** The expedition under way: when it started, the deepest ring reached, the way back, the rooms entered; `packs`: the
 *  battue's packs his scent has called (logic.ts scent()) still waiting for a room on his way back; `loosed`: the packs
 *  laid in wait so far, `met`: those he walked into. */
export type Expedition = { startedAt: number; deepest: number; came: Came; rooms: Partial<Record<Place, RoomState>>; packs: number; loosed: number; met: number };
export const expedition = (deepest: number): Expedition => ({ startedAt: Date.now(), deepest, came: {}, rooms: {}, packs: 0, loosed: 0, met: 0 });

/** Lays the packs his scent has called (`exp.packs`) in wait on his way back from `here`, each in its lair() among the
 *  rooms entered: the k-th of the expedition is `packs[k - 1]` (the last repeats), every other one before the stairs.
 *  Those with no room to go wait (the crypt: the refuge is next). Returns the packs loosed now. */
export function loose(exp: Expedition, here: Place, packs: readonly (readonly string[])[]) {
  const way = wayBack(exp.came, here).filter((p) => exp.rooms[p]), now: { at: Place; kinds: readonly string[] }[] = [];
  for (; exp.packs > 0; exp.packs--) {
    const at = lair(way, (p) => !!exp.rooms[p]!.battue);
    if (!at) break;
    const kinds = packs[Math.min(++exp.loosed, packs.length) - 1];
    exp.rooms[at]!.battue = { kinds, stairs: exp.loosed % 2 === 0 };
    now.push({ at, kinds });
  }
  return now;
}
