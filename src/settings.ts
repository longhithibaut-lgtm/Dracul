// The player's options (the options' Son and Affichage tabs), saved in localStorage (`dracul.options`), read by
// what they change: the sound's volume (Phaser's master) and mute, the effects' bus (sfx.ts), the brightness and
// grain of the rooms' light (dark.ts). The ambience and music were taken out (docs/decisions.md): no slider for them.
import type Phaser from 'phaser';

export type Settings = { master: number; effects: number; mute: boolean; bright: number; grain: boolean };
export const DEFAULTS: Settings = { master: 100, effects: 100, mute: false, bright: 50, grain: true };

/** The options read back from `json`: each one as saved when it is sound (volumes 0 to 100), else its default. */
export function parse(json: string | null): Settings {
  let o: Partial<Settings> = {};
  try { o = JSON.parse(json ?? '{}') ?? {}; } catch { /* broken: the defaults */ }
  const pct = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : d);
  const yes = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return { master: pct(o.master, DEFAULTS.master), effects: pct(o.effects, DEFAULTS.effects), mute: yes(o.mute, DEFAULTS.mute), bright: pct(o.bright, DEFAULTS.bright), grain: yes(o.grain, DEFAULTS.grain) };
}

const storage = () => { try { return localStorage; } catch { return undefined; } };
export const data: Settings = parse((() => { try { return storage()?.getItem('dracul.options') ?? null; } catch { return null; } })());

/** A volume slider (0 to 100) as a gain: squared, so its middle sounds like the middle (-12 dB). */
export const gain = (v: number) => (v / 100) ** 2;
/** The brightness slider (0 to 100, 50 as rendered) as the exponent laid on the final image: 0.5 (brighter) to 2. */
export const gamma = (bright: number) => 2 ** ((50 - bright) / 50);

/** Changes some options: in use at once, saved. */
export function set(game: Phaser.Game, change: Partial<Settings>) {
  Object.assign(data, change);
  apply(game);
  try { storage()?.setItem('dracul.options', JSON.stringify(data)); } catch { /* lives until the page closes */ }
}
/** What Phaser holds: the master volume and mute. */
export function apply(game: Phaser.Game) {
  game.sound.volume = gain(data.master);
  game.sound.mute = data.mute;
}

/** Full screen in and out (the whole page, so the training panel comes along); refused: nothing happens. */
export function fullscreen(on = !document.fullscreenElement) {
  (on ? document.documentElement.requestFullscreen() : document.fullscreenElement ? document.exitFullscreen() : Promise.resolve()).catch(() => {});
}
