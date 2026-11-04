// Every game input by its action, rebindable in the options (Commandes) and saved in localStorage (`dracul.keys`).
// A binding is a key by what it types, so a letter is its letter on AZERTY and QWERTY alike (M mutes on both, the
// arrows and named keys by their name: 'Space', 'Shift', 'Tab', 'Escape', 'ArrowUp'...), or a mouse button ('Mouse0'
// left, 'Mouse1' middle, 'Mouse2' right). Moving has both ZQSD and WASD by default, so either hand position works.
// Each action has slots: all but the last are the TOUCHE column, the last is AUTRE; a move slot holds four keys (up,
// left, down, right), any other one key (or none). Pure but for the last part (what is held, the saved copy).

export type Action = 'move' | 'claw' | 'shot' | 'glyph' | 'dash' | 'parry' | 'bite' | 'satchel' | 'swarm' | 'map' | 'journal' | 'mute' | 'fullscreen' | 'pause' | 'training';
export type Binds = Record<Action, string[][]>;

/** The actions in the options' order, with their French name. The glyph's first key casts it ahead of him, its other
 *  at the pointer (while the mouse aims). */
export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'move', name: 'Se déplacer' }, { id: 'claw', name: 'Griffes' }, { id: 'shot', name: 'Éclat' },
  { id: 'glyph', name: 'Glyphe' }, { id: 'dash', name: 'Brume' }, { id: 'parry', name: 'Parade' },
  { id: 'bite', name: 'Mordre, fouiller' }, { id: 'satchel', name: 'Le sac' }, { id: 'swarm', name: 'La Nuée' }, { id: 'map', name: 'Carte' }, { id: 'journal', name: 'Le journal' },
  { id: 'mute', name: 'Couper le son' }, { id: 'fullscreen', name: 'Plein écran' }, { id: 'pause', name: 'Pause' }, { id: 'training', name: 'Entraînement' },
];
export const DIRS = ['haut', 'gauche', 'bas', 'droite'];

export const DEFAULTS: Binds = {
  move: [['z', 'q', 's', 'd'], ['w', 'a', 's', 'd'], ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']],
  claw: [['j'], ['Mouse0']], shot: [['k'], ['Mouse2']], glyph: [['l'], ['e']], dash: [['Space'], ['Shift']], parry: [['x'], ['Mouse1']],
  bite: [['f'], []], satchel: [['i'], ['Tab']], swarm: [['r'], []], map: [['c'], []], journal: [['n'], []], mute: [['m'], []], fullscreen: [['p'], []],
  pause: [['Escape'], []], training: [['t'], []],
};
/** Échap always pauses and always goes back (it cancels a rebinding): its slot is fixed and no other action takes it. */
export const FIXED = 'Escape';

export const copy = (b: Binds): Binds => Object.fromEntries(Object.entries(b).map(([a, s]) => [a, s.map((k) => [...k])])) as Binds;

/** A key event's binding name: a character as typed, lower case; else the key's name (a dead key: its place). */
export function name(ev: Pick<KeyboardEvent, 'key' | 'code'>) {
  if (ev.key === ' ') return 'Space';
  if (ev.key.length === 1) return ev.key.toLowerCase();
  return ev.key === 'Dead' || ev.key === 'Unidentified' ? ev.code : ev.key;
}

const NAMES: Record<string, string> = {
  Space: 'Espace', Shift: 'Maj', Escape: 'Échap', Enter: 'Entrée', Tab: 'Tab', Control: 'Ctrl', Alt: 'Alt', AltGraph: 'Alt Gr',
  Backspace: 'Retour', Delete: 'Suppr', CapsLock: 'Verr. maj', Insert: 'Inser', Home: 'Début', End: 'Fin', PageUp: 'Pg préc', PageDown: 'Pg suiv',
  ArrowUp: 'Haut', ArrowDown: 'Bas', ArrowLeft: 'Gauche', ArrowRight: 'Droite', Mouse0: 'clic gauche', Mouse1: 'clic milieu', Mouse2: 'clic droit',
};
/** How a binding is shown: « M », « Espace », « clic gauche ». */
export const label = (b: string) => NAMES[b] ?? (b.length === 1 ? b.toUpperCase() : b);
/** A slot as shown: « Z Q S D », « Flèches », « J ». */
export function slotLabel(s: string[]) {
  if (s.length === 4 && s.join() === DEFAULTS.move[2].join()) return 'Flèches';
  return s.map(label).join(' ');
}

/** The actions binding `b` sets off: which slot, and where in it (a move slot: the direction). */
export function lookup(binds: Binds, b: string) {
  const out: { action: Action; slot: number; index: number }[] = [];
  for (const { id } of ACTIONS) binds[id].forEach((s, slot) => { const index = s.indexOf(b); if (index >= 0) out.push({ action: id, slot, index }); });
  return out;
}

/** The bindings set off by more than one action, and those actions (in the options' order). */
export function clashes(binds: Binds) {
  const by = new Map<string, Action[]>();
  for (const { id } of ACTIONS) for (const b of new Set(binds[id].flat())) by.set(b, [...(by.get(b) ?? []), id]);
  return new Map([...by].filter(([, a]) => a.length > 1));
}

/** `binds` with slot `slot` of `action` set to `keys` (none: cleared); Échap and the pause's own slot never change. */
export function rebind(binds: Binds, action: Action, slot: number, keys: string[]): Binds {
  const out = copy(binds);
  if (slot < 0 || slot >= out[action].length || (action === 'pause' && slot === 0) || keys.includes(FIXED)) return out;
  if (keys.length && keys.length !== (action === 'move' ? 4 : 1)) return out;
  out[action][slot] = [...keys];
  return out;
}

/** The bindings read back from `json`, whatever it holds: each action's slots as saved when they are well formed,
 *  else its defaults; the pause keeps Échap. */
export function parse(json: string | null): Binds {
  let o: unknown = null;
  try { o = JSON.parse(json ?? 'null'); } catch { /* broken: the defaults */ }
  const saved = (o && typeof o === 'object' ? (o as { binds?: unknown }).binds : undefined) as Record<string, unknown> | undefined;
  const out = copy(DEFAULTS);
  for (const { id } of ACTIONS) {
    const s = saved?.[id], n = id === 'move' ? 4 : 1;
    if (Array.isArray(s) && s.length === out[id].length && s.every((k) => Array.isArray(k) && (k.length === 0 || k.length === n) && k.every((b) => typeof b === 'string' && b && b !== FIXED)))
      out[id] = s.map((k) => [...k]);
  }
  out.pause[0] = [FIXED];
  return out;
}
export const serialize = (b: Binds) => JSON.stringify({ v: 1, binds: b });

// ---- The live copy, and what is held right now (window events: they are seen even while a scene is paused). ----

const storage = () => { try { return localStorage; } catch { return undefined; } };
/** `f` called once per key event. Phaser hands its frame's queued key events to the listeners again on each new one
 *  (KeyboardPlugin.update; its duplicate check only looks at the last), so with three in a frame a press came twice: F
 *  opened a panel and closed it. Each listener of a scene's keyboard goes through this. */
export function once<E extends object>(f: (ev: E) => void) {
  const seen = new WeakSet<E>();
  return (ev: E) => { if (!seen.has(ev)) { seen.add(ev); f(ev); } };
}

/** The bindings in use; change them with set(). */
export const binds: Binds = parse((() => { try { return storage()?.getItem('dracul.keys') ?? null; } catch { return null; } })());
/** New bindings, in use at once and saved. */
export function set(b: Binds) {
  Object.assign(binds, copy(b));
  try { storage()?.setItem('dracul.keys', serialize(binds)); } catch { /* lives until the page closes */ }
}

const held = new Map<string, string>(); // by physical key (or mouse button): the binding it was pressed as
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (ev) => held.set(ev.code, name(ev)));
  window.addEventListener('keyup', (ev) => held.delete(ev.code));
  window.addEventListener('pointerdown', (ev) => held.set(`Mouse${ev.button}`, `Mouse${ev.button}`));
  window.addEventListener('pointerup', (ev) => held.delete(`Mouse${ev.button}`));
  window.addEventListener('blur', () => held.clear());
}
const isHeld = (b: string) => [...held.values()].includes(b);
/** A key or button of action `a` held right now. */
export const down = (a: Action) => binds[a].some((s) => s.some(isHeld));

/** Keeps the page's own use of a bound key from it (Tab moves the focus, Space and the arrows scroll), not with a
 *  modifier (Ctrl+R still reloads), nor in the training panel's fields. Called once Phaser listens (main.ts): Phaser
 *  drops a key event already prevented, so this one must come after its own. */
export function capture() {
  window.addEventListener('keydown', (ev) => {
    const field = ev.target instanceof HTMLElement && ev.target.closest('input, textarea, select');
    if (!field && !ev.ctrlKey && !ev.metaKey && !ev.altKey && (lookup(binds, name(ev)).length || ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(name(ev)))) ev.preventDefault();
  });
}

/** The way the move keys held point: x and y each -1, 0 or 1. */
export function axis() {
  const on = (i: number) => binds.move.some((s) => s[i] !== undefined && isHeld(s[i]));
  return { x: Number(on(3)) - Number(on(1)), y: Number(on(2)) - Number(on(0)) };
}
