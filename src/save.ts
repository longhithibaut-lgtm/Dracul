// What outlives the page: the blood banked in the refuge's basin and what is unlocked, a small versioned JSON in
// localStorage; plus a log of the expeditions for the playtests (docs/extraction.md §12: returns, deaths, depth). The
// game runs without storage (a private window, a framed preview): it then starts afresh each time.

export const VERSION = 1;
// unlocks: what the Rongé will sell for banked blood (pass 2); the bite for now.
export type Save = { v: number; banked: number; unlocks: { bite: boolean } };
const KEY = 'dracul.save', LOG = 'dracul.log';

/** A save read back from `json`, whatever it holds: brought up to this version, missing or broken fields to their
 *  start (nothing banked, nothing unlocked), unknown ones dropped. */
export function parse(json: string | null): Save {
  let o: Partial<Save> | null = null;
  try { o = JSON.parse(json ?? 'null'); } catch { /* broken: start afresh */ }
  if (typeof o !== 'object' || !o) o = {};
  const banked = Number(o.banked);
  return { v: VERSION, banked: Number.isFinite(banked) && banked > 0 ? Math.floor(banked) : 0, unlocks: { bite: o.unlocks?.bite === true } };
}

const storage = () => { try { return localStorage; } catch { return undefined; } }; // a sandboxed frame throws on access

/** The save, loaded once; change it, then store(). */
export const data: Save = parse((() => { try { return storage()?.getItem(KEY) ?? null; } catch { return null; } })());

export function store() {
  try { storage()?.setItem(KEY, JSON.stringify(data)); } catch { /* full or refused: it lives on until the page closes */ }
}

/** One expedition ended: back at the refuge or dead. deepest: the deepest ring reached; blood: carried at its end;
 *  life: health left; s: how long it lasted. Kept (the last 200) in localStorage and shown in the console. */
export type Entry = { end: 'retour' | 'mort'; deepest: number; blood: number; life: number; s: number; at: string };
export function log(e: Omit<Entry, 'at'>) {
  const entry = { ...e, at: new Date().toISOString() };
  console.info('expédition', JSON.stringify(entry));
  try {
    const all = JSON.parse(storage()?.getItem(LOG) ?? '[]') as Entry[];
    storage()?.setItem(LOG, JSON.stringify([...all, entry].slice(-200)));
  } catch { /* the console has it */ }
}
