import { T } from './tuning.ts';

// The quests of the four met in the world (docs/histoire-proposition.md « implémenté », names provisional): their state
// kept in the save for good, the rules that move it, and the short log the bag shows. Pure, so it can be unit tested;
// pnj.ts places them and plays their words, RoomScene hooks it in.

export type QuestId = 'mirelle' | 'greffier' | 'ilse' | 'odo';
export const QUESTS: QuestId[] = ['mirelle', 'greffier', 'ilse', 'odo'];
/** new: not met; open: under way; done: ended (its choice in `c`); failed: lost for good (`c` says how). */
export type Stage = 'new' | 'open' | 'done' | 'failed';
/** n: Mirelle, times fed; Ilse, 1 once her Gavé is dead; Odo, 1 once down at the refuge. at: the night (expedition) of
 *  Mirelle's last meal, or of the meeting. c: the choice made, or how it ended:
 *  mirelle 'refuge' (fed, she joined) | 'goule' (turned) | 'tuee' (turned, then killed); greffier 'registre';
 *  ilse 'mordue' | 'epargnee'; odo 'garde' | 'donne' | 'mort'. */
export type Quest = { s: Stage; n: number; at: number; c?: string };
/** night: expeditions set out on (the clock of Mirelle's hunger). */
export type Quests = { night: number } & Record<QuestId, Quest>;

const STAGES: Stage[] = ['new', 'open', 'done', 'failed'];
const CHOICES: Record<QuestId, string[]> = { mirelle: ['refuge', 'goule', 'tuee'], greffier: ['registre'], ilse: ['mordue', 'epargnee'], odo: ['garde', 'donne', 'mort'] };

export const fresh = (): Quests => ({ night: 0, ...(Object.fromEntries(QUESTS.map((id) => [id, { s: 'new', n: 0, at: 0 }])) as Record<QuestId, Quest>) });

/** Quests read back from a save, whatever it holds (none before version 7): broken fields to their start. */
export function read(o: unknown): Quests {
  const q = fresh(), src = (typeof o === 'object' && o ? o : {}) as Record<string, unknown>;
  const count = (n: unknown) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  q.night = count(src.night);
  for (const id of QUESTS) {
    const r = (typeof src[id] === 'object' && src[id] ? src[id] : {}) as Partial<Quest>;
    q[id] = { s: STAGES.includes(r.s!) ? r.s! : 'new', n: count(r.n), at: Math.min(count(r.at), q.night) };
    if (CHOICES[id].includes(r.c!)) q[id].c = r.c;
  }
  return q;
}

/** Met: the quest opens (from then on Mirelle hungers). */
export function meet(q: Quests, id: QuestId) {
  if (q[id].s !== 'new') return false;
  Object.assign(q[id], { s: 'open', at: q.night });
  return true;
}

/** An expedition sets out: a night goes by; Mirelle, unfed more than T.quests.mirelle.starve nights, turns ghoul (true). */
export function night(q: Quests) {
  q.night++;
  const m = q.mirelle;
  if (m.s !== 'open' || q.night - m.at <= T.quests.mirelle.starve) return false;
  Object.assign(m, { s: 'failed', c: 'goule' });
  return true;
}

// ---- Mirelle l'Emmurée ----

/** She can be fed tonight: met, not yet joined, not already fed this night (the meeting's night is fine). */
export const hungry = (q: Quests) => q.mirelle.s === 'open' && (q.mirelle.n === 0 || q.mirelle.at < q.night);
/** Blood poured through her slit: true if it was taken (`carried` enough, hungry); her last meal makes her join. */
export function feed(q: Quests, carried: number) {
  if (!hungry(q) || carried < T.quests.mirelle.blood) return false;
  const m = q.mirelle;
  Object.assign(m, { n: m.n + 1, at: q.night });
  if (m.n >= T.quests.mirelle.feeds) Object.assign(m, { s: 'done', c: 'refuge' });
  return true;
}
/** Her ghoul is dead (once). */
export function slain(q: Quests) {
  if (q.mirelle.c !== 'goule') return false;
  q.mirelle.c = 'tuee';
  return true;
}

// ---- Le Greffier ----

/** The ledger handed over (it must be carried): done. */
export function deliver(q: Quests, carrying: boolean) {
  if (q.greffier.s !== 'open' || !carrying) return false;
  Object.assign(q.greffier, { s: 'done', c: 'registre' });
  return true;
}
/** The ledger can be taken from the camp: he asked for it, it is not his yet, and not already carried. */
export const ledgerLies = (q: Quests, carrying: boolean) => q.greffier.s === 'open' && !carrying;

// ---- Ilse ----

/** Her Gavé is dead (her quest open). */
export function rid(q: Quests) {
  if (q.ilse.s !== 'open' || q.ilse.n) return false;
  q.ilse.n = 1;
  return true;
}
/** Her Gavé still prowls: placed each night until killed. */
export const prowls = (q: Quests) => q.ilse.s === 'open' && !q.ilse.n;
/** She offers her blood: bitten or spared, for good. */
export function offer(q: Quests, bite: boolean) {
  if (q.ilse.s !== 'open' || !q.ilse.n) return false;
  Object.assign(q.ilse, { s: 'done', c: bite ? 'mordue' : 'epargnee' });
  return true;
}

// ---- Maître Odo, the escort ----

/** How an escort ends: down the refuge's stairs (`near`: him close enough behind), out by another door, the hero dead,
 *  or Odo killed. Returns what becomes of the quest: 'arrived' (at the refuge, the choice waits), 'back' (he is back at
 *  his stake: not lost), or 'dead' (failed for good). */
export function escortEnds(q: Quests, how: 'stairs' | 'door' | 'death' | 'killed', near: boolean) {
  const o = q.odo;
  if (o.s !== 'open' || o.n) return undefined;
  if (how === 'killed') {
    Object.assign(o, { s: 'failed', c: 'mort' });
    return 'dead';
  }
  if (how !== 'stairs' || !near) return 'back';
  o.n = 1;
  return 'arrived';
}
/** At the refuge, the choice: kept as a craftsman, or given to le Rongé. */
export function decide(q: Quests, keep: boolean) {
  if (q.odo.s !== 'open' || !q.odo.n) return false;
  Object.assign(q.odo, { s: 'done', c: keep ? 'garde' : 'donne' });
  return true;
}
/** A blow on him: his blood left, 0 at worst. */
export const struck = (hp: number) => Math.max(0, hp - T.quests.odo.hit);

/** What reforging a weapon of rarity `r` costs (undefined: épique, nothing more to do). */
export const forgeCost = (r: number) => T.quests.odo.forge[r];

// ---- where the four are ----

/** Mirelle sits at the refuge. Le Rongé, given Odo, never turns beast; with Mirelle by him, he holds one more night. */
export const atRefuge = (q: Quests, id: QuestId) =>
  id === 'mirelle' ? q.mirelle.c === 'refuge' : id === 'odo' && ((q.odo.s === 'open' && q.odo.n === 1) || q.odo.c === 'garde');

/** The log the bag shows: one line a quest met, what is left to do or how it ended. */
export function log(q: Quests): string[] {
  const L: string[] = [], m = q.mirelle, g = q.greffier, i = q.ilse, o = q.odo, M = T.quests.mirelle;
  if (m.s === 'open') L.push(`La fente (Mirelle) : verser ${M.blood} sang par sa fente, une fois par nuit. ${m.n} / ${M.feeds}.${q.night - m.at >= M.starve ? ' Elle a faim.' : ''}`);
  if (m.s === 'done') L.push('La fente (Mirelle) : elle a cassé son mur. Elle est au refuge.');
  if (m.c === 'goule') L.push('La fente (Mirelle) : le mur est cassé de l\'intérieur. Quelque chose rôde au mausolée.');
  if (m.c === 'tuee') L.push('La fente (Mirelle) : tu l\'as tuée. Elle avait encore son nom.');
  if (g.s === 'open') L.push('Les noms (le Greffier) : rapporter le registre de l\'Ordre, au camp, jusqu\'à lui dans l\'ossuaire.');
  if (g.s === 'done') L.push('Les noms (le Greffier) : il a le registre. Il grave.');
  if (i.s === 'open') L.push(i.n ? 'De quoi dormir (Ilse) : le Gavé est mort. Elle t\'attend.' : 'De quoi dormir (Ilse) : tuer le Gavé qui mange les morts près de sa tombe.');
  if (i.c === 'mordue') L.push('De quoi dormir (Ilse) : tu l\'as bue. Elle dort.');
  if (i.c === 'epargnee') L.push('De quoi dormir (Ilse) : elle dort dans le noir.');
  if (o.s === 'open') L.push(o.n ? 'Le lanternier (Odo) : il attend au refuge que tu décides.' : 'Le lanternier (Odo) : le ramener vivant du camp jusqu\'à l\'escalier du refuge.');
  if (o.c === 'garde') L.push('Le lanternier (Odo) : il travaille pour toi, au refuge.');
  if (o.c === 'donne') L.push('Le lanternier (Odo) : le Rongé n\'a plus faim.');
  if (o.c === 'mort') L.push('Le lanternier (Odo) : mort en chemin.');
  return L;
}
