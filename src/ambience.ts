import type Phaser from 'phaser';
import type { Room } from './room.ts';
import { T } from './tuning.ts';
import { areaAt } from './world.ts';
import * as Nec from './necropolis.data.ts';
import * as Cat from './catacombs.data.ts';
import { voice, type Play } from './sfx.ts';

// The ambient sound and a discreet music, generated like src/sfx.ts (Web Audio on Phaser's context, no audio file):
// - a bed per place (BEDS), crossfaded as the hero goes from place to place and from area to area of a zone;
// - sounds set in the world (braziers, the Order's lanterns, the Dawn's light, water, the camp, le Rongé, the basin),
//   louder as he nears them and panned to their side;
// - tension layers from the game state (tension()): heartbeat, the battue's baying, combat's pulse, the boss' drone, the
//   mix muffled at low blood, silence and a sting at death;
// - sparse dissonant phrases (bells, a lonely string, a drone), often at the refuge, rarely in the zones, never in a fight.
// Everything goes through buses (ambience, music, effects: sfx.ts) into a master, in dB (T.audio, the training panel).

type P = { x: number; y: number };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const dB = (v: number) => 10 ** (v / 20);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- the mixer
export type Mix = {
  ctx: BaseAudioContext; amb: GainNode; music: GainNode; fx: GainNode; master: GainNode;
  hush: GainNode; // ambience and music, silenced at death
  muffle: BiquadFilterNode; // the whole mix, closed down at low blood
  ambVerb: GainNode; fxVerb: GainNode; // sends into the stone's reverb, per bed
  slots: StereoPannerNode[]; // fixed pans the one-shots play through (no panner per sound)
  white: AudioBuffer; brown: AudioBuffer; vol: string;
};
const PANS = [-0.8, -0.4, 0, 0.4, 0.8];
const mixes = new WeakMap<BaseAudioContext, Mix>();

/** The game's audio graph on `ctx`, made once: buses → muffle → master → soft clipper → `dst` (Phaser's mute node). */
export function mixer(ctx: BaseAudioContext, dst: AudioNode): Mix {
  const had = mixes.get(ctx);
  if (had) return had;
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const amb = g(), music = g(), fx = g(), hush = g(), master = g(), half = g(0.5), ambVerb = g(0), fxVerb = g(0), musicVerb = g(0.6);
  const muffle = ctx.createBiquadFilter(), clip = ctx.createWaveShaper(), verb = ctx.createConvolver();
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.7;
  // Unity below 0.6, then a soft knee to 0.98: beds and music summed over a pile of effects bend instead of clipping.
  // The curve spans ±2 (`half` before it).
  clip.curve = Float32Array.from({ length: 2049 }, (_, i) => { const x = (i / 1024 - 1) * 2, a = Math.abs(x); return Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38)); });
  const rate = ctx.sampleRate, n = Math.round(rate * 1.6), ir = ctx.createBuffer(2, n, rate); // short: a convolver's cost grows with it
  for (let c = 0; c < 2; c++) ir.getChannelData(c).forEach((_, i, a) => (a[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.35)))); // stone: a dense tail
  verb.buffer = ir;
  amb.connect(hush);
  music.connect(hush);
  amb.connect(ambVerb).connect(verb);
  fx.connect(fxVerb).connect(verb);
  music.connect(musicVerb).connect(verb);
  verb.connect(hush);
  hush.connect(muffle);
  fx.connect(muffle);
  muffle.connect(master).connect(half).connect(clip).connect(dst);
  const slots = PANS.map((p) => { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(amb); return s; });
  const white = ctx.createBuffer(1, rate * 2, rate), brown = ctx.createBuffer(1, rate * 4, rate);
  white.getChannelData(0).forEach((_, i, a) => (a[i] = Math.random() * 2 - 1));
  let b = 0;
  brown.getChannelData(0).forEach((_, i, a) => (a[i] = b = (b + 0.02 * (Math.random() * 2 - 1)) * 0.998)); // leaky integrated white
  const d = brown.getChannelData(0), top = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  d.forEach((v, i) => (d[i] = v / top));
  const m: Mix = { ctx, amb, music, fx, master, hush, muffle, ambVerb, fxVerb, slots, white, brown, vol: '' };
  mixes.set(ctx, m);
  return m;
}

// ---------------------------------------------------------------- continuous layers
type Src = AudioScheduledSourceNode;
const amp = (c: BaseAudioContext, v: number) => { const g = c.createGain(); g.gain.value = v; return g; };
const tone = (c: BaseAudioContext, type: OscillatorType, f: number) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; };
function loop(c: BaseAudioContext, buf: AudioBuffer, type: BiquadFilterType, f: number, q = 0.7): [AudioBufferSourceNode, BiquadFilterNode] {
  const s = c.createBufferSource(), b = c.createBiquadFilter();
  s.buffer = buf;
  s.loop = true;
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  s.connect(b);
  return [s, b];
}
/** A slow (or fast) sine swaying `param` by ±`depth` round its value. */
function lfo(c: BaseAudioContext, hz: number, depth: number, param: AudioParam) {
  const o = tone(c, 'sine', hz), g = amp(c, depth);
  o.connect(g).connect(param);
  return o;
}

// Each layer is wired into `out` (its level, 0-1, set by tick()); its own levels make the mix at levels 1. Few cutoffs
// swayed by an LFO (the wind's, the chant's): a modulated filter recomputes itself every sample.
const LAYERS = {
  // The refuge's and the crypts' low drone: two sines a hair apart, slowly beating, and their fifth, breathing.
  drone(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const g = amp(c, 0.036), a = tone(c, 'sine', 55), b = tone(c, 'sine', 55.3), f = tone(c, 'triangle', 82.4), h = amp(c, 0.12);
    a.connect(g); b.connect(g); f.connect(h).connect(g); g.connect(out);
    return [a, b, f, lfo(c, 0.05, 0.013, g.gain)];
  },
  // The catacombs' weight: deep brown noise, swelling.
  rumble(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const [s, f] = loop(c, m.brown, 'lowpass', 110), g = amp(c, 0.11);
    f.connect(g).connect(out);
    return [s, lfo(c, 0.07, 0.05, g.gain)];
  },
  // Wind through the cavern: a wandering band of noise drifting side to side, a thin whistle in the cracks.
  wind(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const [s, f] = loop(c, m.white, 'bandpass', 420, 1.3), g = amp(c, 0.4), p = c.createStereoPanner();
    const [w, wf] = loop(c, m.white, 'bandpass', 1300, 9), wg = amp(c, 0.06);
    f.connect(g).connect(p).connect(out); wf.connect(wg).connect(out);
    return [s, w, lfo(c, 0.045, 260, f.frequency), lfo(c, 0.11, 0.18, g.gain), lfo(c, 0.03, 0.6, p.pan), lfo(c, 0.13, 0.05, wg.gain)];
  },
  // A brazier, a pyre: the fire's low roar and its fizz (its crackles: events).
  fire(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const [s, f] = loop(c, m.brown, 'lowpass', 600), g = amp(c, 0.17), [h, hf] = loop(c, m.white, 'highpass', 2500), hg = amp(c, 0.012);
    f.connect(g).connect(out); hf.connect(hg).connect(out);
    return [s, h, lfo(c, 0.6, 0.05, g.gain), lfo(c, 11, 0.012, hg.gain)];
  },
  // The Order's lanterns: a low holy hum, its octave a hair sharp.
  hum(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const g = amp(c, 0.04), a = tone(c, 'sine', 120), b = tone(c, 'sine', 240.6), bg = amp(c, 0.35);
    a.connect(g); b.connect(bg).connect(g); g.connect(out);
    return [a, b, lfo(c, 0.4, 0.014, g.gain)];
  },
  // The Dawn's light: a high burning hum (two tones beating) over a sizzle.
  burn(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const g = amp(c, 0.035), a = tone(c, 'sine', 1318.5), b = tone(c, 'sine', 1323), d = tone(c, 'sine', 1975), dg = amp(c, 0.4);
    const [s, f] = loop(c, m.white, 'bandpass', 6000, 1), sg = amp(c, 0.05);
    a.connect(g); b.connect(g); d.connect(dg).connect(g); g.connect(out); f.connect(sg).connect(out);
    return [a, b, d, s, lfo(c, 13, 0.035, sg.gain)];
  },
  // The chapel's burning windows: a faint choir, D minor, its vowel drifting.
  choir(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = amp(c, 0.1);
    bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 2.5; lp.type = 'lowpass'; lp.frequency.value = 1800;
    const vs = [146.8, 147.3, 174.6, 220, 219.4].map((f) => tone(c, 'sawtooth', f));
    for (const v of vs) v.connect(bp);
    bp.connect(lp).connect(g).connect(out);
    return [...vs, lfo(c, 0.08, 0.033, g.gain)];
  },
  // The black lake: water lapping in slow swells.
  water(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const [s, f] = loop(c, m.brown, 'bandpass', 380, 0.8), g = amp(c, 0.7);
    f.connect(g).connect(out);
    return [s, lfo(c, 0.33, 0.6, g.gain)];
  },
  // The Order's camp: men chanting low behind the tents, muffled, the syllables slow.
  voices(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const lp = c.createBiquadFilter(), g = amp(c, 0.036), vs = [98, 98.6, 146.8].map((f) => tone(c, 'sawtooth', f));
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 5;
    for (const v of vs) v.connect(lp);
    lp.connect(g).connect(out);
    return [...vs, lfo(c, 0.5, 130, lp.frequency), lfo(c, 0.15, 0.018, g.gain), lfo(c, 0.023, 6, vs[2].frequency)];
  },
  // Le Rongé's breathing, near him: a rasp swelling in and out (the sine's two lobes: in, out).
  breath(c: BaseAudioContext, m: Mix, out: AudioNode): Src[] {
    const [s, f] = loop(c, m.white, 'bandpass', 600, 1.5), g = amp(c, 0);
    f.connect(g).connect(out);
    return [s, lfo(c, 0.24, 0.42, g.gain)];
  },
  // Combat: a low pulse (music bus).
  pulse(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const g = amp(c, 0.078), a = tone(c, 'sine', 44), b = tone(c, 'triangle', 88), bg = amp(c, 0.3);
    a.connect(g); b.connect(bg).connect(g); g.connect(out);
    return [a, b, lfo(c, 1.7, 0.078, g.gain)];
  },
  // The guardian's arena: a low cluster a minor second apart, its filter slowly opening and closing (music bus).
  boss(c: BaseAudioContext, _m: Mix, out: AudioNode): Src[] {
    const lp = c.createBiquadFilter(), g = amp(c, 0.076), vs = [55, 58.27, 82.4].map((f) => tone(c, 'sawtooth', f));
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 3;
    for (const v of vs) v.connect(lp);
    lp.connect(g).connect(out);
    return [...vs, lfo(c, 4.5, 0.013, g.gain)];
  },
};
export type LayerId = keyof typeof LAYERS;
const MUSIC_LAYERS: readonly LayerId[] = ['pulse', 'boss'];

// ---------------------------------------------------------------- one-shots (sfx.ts voices)
type Ev = (o: Play) => void;
const times = (n: number, f: (i: number) => void) => { for (let i = 0; i < n; i++) f(i); };
const EVENTS = {
  // A drop falls in a puddle, and its echo.
  drip(o) { const f = rand(700, 1600); voice(o, { src: 'sine', f, f2: f * 2.6, gain: 0.17, attack: 0.002, dur: 0.05 }); voice(o, { src: 'sine', f: f * 1.4, f2: f * 3, gain: 0.04, dur: 0.04, delay: 0.21 }); },
  // A candle gutters.
  candle(o) { voice(o, { src: 'noise', filter: 'lowpass', ff: 380, trem: 9, gain: 0.25, attack: 0.15, dur: 0.7 }); },
  // Distant crows: two or three caws.
  crow(o) { times(2 + Math.round(Math.random()), (i) => voice(o, { src: 'sawtooth', f: 560, f2: 430, filter: 'bandpass', ff: 1300, q: 3, trem: 34, gain: 0.7, attack: 0.02, dur: 0.24, delay: i * rand(0.34, 0.45) })); },
  // Wood or rope creaking somewhere.
  creak(o) { voice(o, { src: 'noise', filter: 'bandpass', ff: 280, ff2: 460, q: 14, trem: 24, gain: 2.2, attack: 0.25, dur: 1.1 }); },
  // A far bell of the Order: one toll, inharmonic, faint.
  bell(o) { for (const [r, gain, dur] of [[1, 0.11, 4.5], [2, 0.04, 3], [2.74, 0.035, 2], [5.2, 0.01, 1]]) voice(o, { src: 'sine', f: 110 * r, gain, attack: 0.004, dur }); },
  // Distant dogs: a few barks.
  dogs(o) { times(2 + Math.floor(Math.random() * 3), (i) => { const delay = i * 0.28 + rand(0, 0.1); voice(o, { src: 'triangle', f: 520, f2: 340, filter: 'lowpass', ff: 1100, q: 2, gain: 0.12, attack: 0.01, dur: 0.12, delay }); voice(o, { src: 'noise', filter: 'bandpass', ff: 900, q: 3, gain: 0.07, dur: 0.08, delay }); }); },
  // Rats skittering: claws ticking on stone, a squeak.
  rats(o) { times(9, () => voice(o, { src: 'noise', filter: 'bandpass', ff: 4500, q: 5, gain: 0.25, attack: 0.001, dur: 0.012, delay: rand(0, 0.5) })); voice(o, { src: 'sine', f: 2900, f2: 3700, gain: 0.06, dur: 0.06, delay: rand(0.1, 0.4) }); },
  // A goule moaning far down the galleries.
  moan(o) { voice(o, { src: 'sawtooth', f: 118, f2: 82, filter: 'lowpass', ff: 520, ff2: 260, q: 7, trem: 5, gain: 0.13, attack: 0.8, dur: 2.6 }); voice(o, { src: 'noise', filter: 'bandpass', ff: 420, ff2: 300, q: 5, gain: 0.11, attack: 0.9, dur: 2.2 }); },
  // Le nid: wet chewing, a bone cracking.
  chew(o) { times(3 + Math.floor(Math.random() * 3), (i) => voice(o, { src: 'noise', filter: 'bandpass', ff: 700, ff2: 300, q: 6, gain: 0.18, attack: 0.01, dur: 0.1, delay: i * 0.17 + rand(0, 0.05) })); voice(o, { src: 'noise', filter: 'highpass', ff: 2600, gain: 0.25, attack: 0.001, dur: 0.02, delay: rand(0.2, 0.5) }); },
  // A fire's crackles.
  crackle(o) { times(2 + Math.floor(Math.random() * 4), () => voice(o, { src: 'noise', filter: 'highpass', ff: 1800, gain: 0.14, attack: 0.001, dur: 0.012, delay: rand(0, 0.4) })); },
  // The basin's blood: thick bubbles rising.
  bubble(o) { times(1 + Math.floor(Math.random() * 3), (i) => voice(o, { src: 'sine', f: 140, f2: 360, gain: 0.3, dur: 0.09, delay: i * rand(0.12, 0.3) })); voice(o, { src: 'noise', filter: 'lowpass', ff: 260, gain: 0.3, dur: 0.12 }); },
  // Water against stone.
  lap(o) { voice(o, { src: 'noise', filter: 'bandpass', ff: 600, ff2: 260, q: 2.5, gain: 0.4, attack: 0.18, dur: 0.55 }); },
  // Heartbeat: lub-dub.
  heart(o) { voice(o, { src: 'sine', f: 62, f2: 38, gain: 0.45, attack: 0.006, dur: 0.16 }); voice(o, { src: 'sine', f: 58, f2: 36, gain: 0.3, attack: 0.006, dur: 0.14, delay: 0.26 }); },
  // The battue's hounds baying far off.
  bay(o) { for (const delay of [0, rand(0.5, 0.9)]) voice(o, { src: 'triangle', f: rand(340, 400), f2: 540, filter: 'lowpass', ff: 900, trem: 6, gain: 0.19, attack: 0.25, dur: 1.4, delay }); },
} satisfies Record<string, Ev>;
export type EventId = keyof typeof EVENTS;

// ---------------------------------------------------------------- music (sparse, dissonant: D, E flat, A flat, A)
const NOTES = [73.42, 77.78, 103.83, 110, 146.83, 155.56, 207.65];
const MUSIC = {
  // Two bells a hair apart, beating.
  bell(o: Play, f: number) { for (const [r, gain, dur] of [[1, 0.1, 7], [2.01, 0.04, 5], [2.76, 0.026, 3], [5.4, 0.01, 1.5]]) for (const d of [1, 1.011]) voice(o, { src: 'sine', f: f * 2 * r * d, gain: gain / 2, attack: 0.004, dur }); },
  // A lonely string: two saws a hair apart, swelling slowly, fading.
  string(o: Play, f: number) { for (const d of [1, 1.004]) voice(o, { src: 'sawtooth', f: f * 2 * d, filter: 'lowpass', ff: 700, ff2: 1000, q: 0.8, gain: 0.025, attack: 3, dur: 9 }); },
  // A drone a minor second wide.
  drone(o: Play, f: number) { for (const r of [1, 1.0595]) voice(o, { src: 'sine', f: f * r, gain: 0.065, attack: 4, dur: 12 }); },
};
function phrase(o: Play) {
  const f = NOTES[Math.floor(Math.random() * NOTES.length)], r = Math.random();
  if (r < 0.4) return MUSIC.bell(o, f);
  if (r < 0.75) { MUSIC.string(o, f); return MUSIC.bell({ ...o, t: o.t + 3 }, f * 1.5); } // over it, a tritone off the string
  MUSIC.drone(o, f / 2);
  MUSIC.string({ ...o, t: o.t + 2 }, f);
}
/** Death's sting: low bells in a cluster, a string falling. */
function sting(o: Play) {
  for (const f of [73.42, 77.78, 103.83]) MUSIC.bell({ ...o, v: 0.7 }, f / 2);
  voice(o, { src: 'sawtooth', f: 220, f2: 104, filter: 'lowpass', ff: 900, ff2: 300, gain: 0.12, attack: 0.6, dur: 3.5 });
}

// ---------------------------------------------------------------- beds: what plays where
type Bed = { layers: Partial<Record<LayerId, number>>; events: Partial<Record<EventId, number>>; verb: number; music?: [number, number, number] };
/** Per bed: continuous layers' levels (0-1), one-shots per minute, the reverb send, the music's first phrase and gap
 *  after (s; none: no music). Sounds set in the world (Pos) come on top, wherever they are. */
export const BEDS = {
  refuge: { layers: { drone: 1 }, events: { drip: 5, candle: 5 }, verb: 0.35, music: [4, 12, 26] },
  necropolis: { layers: { wind: 1 }, events: { crow: 2.5, creak: 2.5, bell: 0.6, dogs: 1 }, verb: 0.12, music: [60, 80, 160] },
  catacombs: { layers: { rumble: 1, drone: 0.35 }, events: { drip: 9, rats: 3, moan: 1.2 }, verb: 0.3, music: [60, 90, 180] },
  nest: { layers: { rumble: 1, drone: 0.35 }, events: { drip: 3, rats: 2, moan: 4, chew: 10 }, verb: 0.3 },
  prison: { layers: { rumble: 0.8, boss: 0.35 }, events: { drip: 4, moan: 0.6 }, verb: 0.4 },
  crypt: { layers: { drone: 0.6, rumble: 0.3 }, events: { drip: 5, creak: 1.5, rats: 1 }, verb: 0.6 },
  chapel: { layers: { drone: 0.5, rumble: 0.25 }, events: { drip: 3, creak: 1 }, verb: 0.75 },
  cloister: { layers: { wind: 0.7 }, events: { crow: 4, bell: 1.2, dogs: 1 }, verb: 0.2 },
} satisfies Record<string, Bed>;
export type BedId = keyof typeof BEDS;

/** The bed at floor point (x, y) of `layout`: a zone's by area (the catacombs' nest and prison their own). */
export function bedAt(layout: string, x: number, y: number): BedId {
  if (layout === 'catacombs') { const a = areaAt('catacombs', x, y)?.id; return a === 'nid' ? 'nest' : a === 'prison' ? 'prison' : 'catacombs'; }
  if (layout === 'hall' || layout === 'nave' || layout === 'ossuary') return 'crypt';
  return layout in BEDS ? (layout as BedId) : 'crypt';
}

// ---------------------------------------------------------------- sounds set in the world
export type Pos = 'fire' | 'hum' | 'burn' | 'choir' | 'water' | 'voices' | 'breath' | 'basin';
// px within which each is heard at full, and beyond which not at all (squared falloff between)
const REACH: Record<Pos, [number, number]> = { fire: [30, 180], hum: [20, 110], burn: [60, 330], choir: [60, 300], water: [60, 320], voices: [80, 420], breath: [20, 140], basin: [20, 160] };
const PER_MIN: Partial<Record<Pos, [EventId, number]>> = { fire: ['crackle', 40], basin: ['bubble', 12], water: ['lap', 14] }; // their one-shots, near
export type Heard = { g: number; pan: number };

/** How loud (0-1) the sources at `points` are at `at`, and their pan (-1 left, 1 right; a third of the view off = full). */
export function hear(points: readonly P[], at: P, [near, far]: readonly [number, number]): Heard {
  let g = 0, pan = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d >= far) continue;
    const k = d <= near ? 1 : ((far - d) / (far - near)) ** 2;
    g += k;
    pan += k * Math.max(-1, Math.min(1, (p.x - at.x) / 160));
  }
  return { g: Math.min(1, g), pan: g ? pan / g : 0 };
}

const inRect = (p: P, [x0, y0, x1, y1]: readonly number[]) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
const LAKE = Cat.PITS.map(([x, y, w, h]) => ({ x: x + w / 2, y: y + h / 2 })).filter((p) => inRect(p, Cat.AREAS.find((a) => a.id === 'eaux-noires')!.rect));
const CAMP = (([x0, y0, x1, y1]) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }))(Nec.AREAS.find((a) => a.id === 'camp')!.rect);

/** What sounds where in `room`: its flames, its lanterns, its holy light (the chapel's windows sing, the Dawn hums), the
 *  catacombs' lake, the necropolis' camp, and `spots` (the refuge's Rongé and basin). */
export function sources(layout: string, room: Pick<Room, 'look' | 'zone' | 'holy' | 'width' | 'height'>, spots: Partial<Record<Pos, P>> = {}) {
  const holy: P[] = [];
  for (let y = 0; y < room.height; y += 24) for (let x = 0; x < room.width; x += 24) if (room.holy(x, y)) holy.push({ x, y });
  const s: Partial<Record<Pos, P[]>> = { fire: room.look.torches.map(([x, y]) => ({ x, y })), hum: room.zone?.lamps ?? [] };
  s[layout === 'chapel' ? 'choir' : 'burn'] = holy;
  for (const [k, p] of Object.entries(spots)) s[k as Pos] = [p];
  if (layout === 'catacombs') s.water = LAKE;
  if (layout === 'necropolis') s.voices = [CAMP];
  return s;
}

// ---------------------------------------------------------------- tension
export type Hero = { blood: number; life: number; combat: boolean; boss: boolean; battue: number }; // blood: carried / bag; life: / max; battue: s since loosed
/** The tension layers' levels (0-1) from the hero's state; `beat`: s between heartbeats; `music`: phrases allowed. */
export function tension(h: Hero) {
  const low = clamp01((0.5 - h.life) / 0.3); // from half his blood, full at a fifth
  return {
    heart: Math.max(clamp01((h.blood - 0.4) / 0.6), low), // a full bag, or near death
    beat: 1.25 - 0.45 * low,
    pulse: h.combat && !h.boss ? 1 : 0,
    boss: h.boss ? 1 : 0,
    muffle: low,
    bay: clamp01(1 - h.battue / 40),
    music: !h.combat && !h.boss && !low,
  };
}

// ---------------------------------------------------------------- the engine
type Layer = { out: GainNode; pan: StereoPannerNode; srcs: Src[]; level: number; at: number; quietAt: number };
type Engine = { ctx: BaseAudioContext; mix: Mix; layers: Map<LayerId, Layer>; t: number; bed?: BedId; music: number; beat: number; battueAt: number; deadAt: number; hushed: boolean; muffle: number };
export type Moment = { bed: BedId; near: Partial<Record<Pos, Heard>>; ten: ReturnType<typeof tension> };

function engine(ctx: BaseAudioContext, dst: AudioNode): Engine {
  return { ctx, mix: mixer(ctx, dst), layers: new Map(), t: 0, music: Infinity, beat: 0, battueAt: -1e9, deadAt: -1e9, hushed: false, muffle: 0 };
}

const slot = (m: Mix, pan: number) => m.slots[Math.max(0, Math.min(PANS.length - 1, Math.round((pan + 0.8) / 0.4)))];
function play(E: Engine, id: EventId, t: number, pan: number, g: number) {
  EVENTS[id]({ ctx: E.ctx, dst: slot(E.mix, pan), noise: E.mix.white, t, p: 2 ** (rand(-1, 1) / 12), v: g * rand(0.8, 1) });
}

/** Layer `id` toward `want` (0-1) and `pan`: made when first wanted, crossfaded, stopped once silent a while. */
function level(E: Engine, id: LayerId, want: number, pan: number, t: number) {
  let L = E.layers.get(id);
  if (!L) {
    if (want < 0.005) return;
    const out = amp(E.ctx, 0), p = E.ctx.createStereoPanner();
    out.connect(p).connect(MUSIC_LAYERS.includes(id) ? E.mix.music : E.mix.amb);
    L = { out, pan: p, srcs: LAYERS[id](E.ctx, E.mix, out), level: 0, at: 0, quietAt: t };
    for (const s of L.srcs) s instanceof AudioBufferSourceNode ? s.start(t, Math.random()) : s.start(t); // each noise its own stretch of the buffer
    E.layers.set(id, L);
  }
  if (Math.abs(L.level - want) > 0.01 || (want === 0 && L.level)) { L.out.gain.setTargetAtTime(want, t, want > L.level ? 0.8 : 1.5); L.level = want; }
  if (Math.abs(L.at - pan) > 0.03) { L.pan.pan.setTargetAtTime(pan, t, 0.3); L.at = pan; }
  if (want >= 0.005) L.quietAt = t;
  else if (t - L.quietAt > 8) { // faded out long ago
    for (const s of L.srcs) s.stop(t);
    L.pan.disconnect();
    E.layers.delete(id);
  }
}

const LAYER_IDS = Object.keys(LAYERS) as LayerId[];
/** `dt` s of sound at time `t`: the bed's layers and one-shots, the world's sounds, the tension, the music. */
function tick(E: Engine, t: number, dt: number, { bed, near, ten }: Moment) {
  const M = E.mix, B: Bed = BEDS[bed], A = T.audio, vol = `${A.master},${A.ambience},${A.music},${A.effects}`;
  if (vol !== M.vol) { // the training panel's knobs
    M.vol = vol;
    for (const [n, v] of [[M.master, A.master], [M.amb, A.ambience], [M.music, A.music], [M.fx, A.effects]] as const) n.gain.setTargetAtTime(dB(v), t, 0.05);
  }
  if (bed !== E.bed) {
    E.bed = bed;
    M.ambVerb.gain.setTargetAtTime(B.verb, t, 1);
    M.fxVerb.gain.setTargetAtTime(B.verb * 0.5, t, 1);
    E.music = B.music ? t + B.music[0] * rand(0.5, 1) : Infinity;
  }
  const hushed = t < E.deadAt + 3; // dead: silence, then the refuge comes back slowly
  if (hushed !== E.hushed) { M.hush.gain.setTargetAtTime(hushed ? 0 : 1, t, hushed ? 0.08 : 1.5); E.hushed = hushed; }
  if (Math.abs(ten.muffle - E.muffle) > 0.02) { M.muffle.frequency.setTargetAtTime(20000 * 0.11 ** ten.muffle, t, 0.5); E.muffle = ten.muffle; } // down to 2.2 kHz: the foes' tells still heard

  for (const id of LAYER_IDS) {
    const h = near[id as Pos];
    level(E, id, Math.max(B.layers[id] ?? 0, h?.g ?? 0, id === 'pulse' ? ten.pulse : id === 'boss' ? ten.boss : 0), h?.pan ?? 0, t);
  }
  const roll = (perMin: number) => Math.random() < (perMin * dt) / 60;
  for (const [id, n] of Object.entries(B.events) as [EventId, number][]) if (roll(n)) play(E, id, t + rand(0, dt), rand(-1, 1), rand(0.5, 1));
  for (const [pos, [id, n]] of Object.entries(PER_MIN) as [Pos, [EventId, number]][]) { const h = near[pos]; if (h?.g && roll(n * h.g)) play(E, id, t + rand(0, dt), h.pan, h.g); }
  if (roll(10 * ten.bay)) play(E, 'bay', t + rand(0, dt), rand(-1, 1), 0.4 + 0.6 * ten.bay);
  if (ten.heart < 0.02) E.beat = t;
  else if (t + dt >= E.beat) { const at = Math.max(t, E.beat); play(E, 'heart', at, 0, ten.heart); E.beat = at + ten.beat; }

  if (!ten.music || !B.music) E.music = Math.max(E.music, t + 8); // never in a fight; a while after one
  else if (t >= E.music) {
    phrase({ ctx: E.ctx, dst: M.music, noise: M.white, t, p: 1, v: 1 });
    E.music = t + rand(B.music[1], B.music[2]) * (bed === 'refuge' || Math.random() < 0.5 ? 1 : 2); // in the zones, often skipped
  }
}

// ---------------------------------------------------------------- the game's hooks (RoomScene)
let E: Engine | undefined;
let here = { layout: 'refuge', src: {} as Partial<Record<Pos, P[]>> };

/** A place entered (every scene start): what sounds where in it. */
export function enter(layout: string, room: Parameters<typeof sources>[1], spots?: Partial<Record<Pos, P>>) {
  here = { layout, src: sources(layout, room, spots) };
}

/** Each frame: the hero at `at`, his state. Nothing on a locked (no input yet) or paused context: no backlog. */
export function update(scene: Phaser.Scene, at: P, hero: Omit<Hero, 'battue'>) {
  const sm = scene.sound as Phaser.Sound.WebAudioSoundManager, ctx = sm.context;
  if (ctx?.state !== 'running') return;
  if (E?.ctx !== ctx) E = engine(ctx, sm.destination);
  const t = ctx.currentTime;
  if (t - E.t < 0.1) return; // ten times a second
  const dt = Math.min(0.5, t - E.t), near: Moment['near'] = {};
  E.t = t;
  for (const [k, ps] of Object.entries(here.src) as [Pos, P[]][]) if (ps.length) near[k] = hear(ps, at, REACH[k]);
  tick(E, t, dt, { bed: bedAt(here.layout, at.x, at.y), near, ten: tension({ ...hero, battue: t - E.battueAt }) });
}

/** The battue loosed: its hounds bay far off, fading. */
export function battue() {
  if (E) E.battueAt = E.ctx.currentTime;
}

/** The hero falls: the ambience and music cut, then a sting. */
export function death() {
  if (!E) return;
  const t = E.ctx.currentTime;
  E.deadAt = t;
  E.hushed = true;
  E.mix.hush.gain.setTargetAtTime(0, t, 0.08);
  sting({ ctx: E.ctx, dst: E.mix.muffle, noise: E.mix.white, t: t + 1.1, p: 1, v: 1 });
}

/** For tools/sfx.check.mjs: the live engine's clock and layers playing. */
export const live = () => E && { t: E.t, layers: [...E.layers.keys()] };

/** For tools/sfx.check.mjs: `secs` of bed `bed` on an offline context, the world's sounds heard as `near`, the hero as
 *  `hero` (`battue` counting on), a phrase of music at 1 s if allowed; `dead`: he falls at 0.5 s. */
export function preview(ctx: BaseAudioContext, bed: BedId, near: Moment['near'], hero: Hero, secs: number, dead = false) {
  const P = engine(ctx, ctx.destination);
  tick(P, 0, 0.1, { bed, near, ten: tension(hero) });
  P.music = 1;
  for (let t = 0.1; t < secs; t += 0.1) {
    if (dead && Math.abs(t - 0.5) < 0.05) { P.deadAt = t; sting({ ctx, dst: P.mix.muffle, noise: P.mix.white, t: t + 1.1, p: 1, v: 1 }); }
    tick(P, t, 0.1, { bed, near, ten: tension({ ...hero, battue: hero.battue + t }) });
  }
}
