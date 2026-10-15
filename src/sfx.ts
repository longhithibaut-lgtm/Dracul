import Phaser from 'phaser';

// Procedural combat sounds: Web Audio synthesis on Phaser's audio context, no audio files.
// Phaser resumes its context on the first key or click (autoplay rules) and owns mute (`scene.sound.mute`).

type Bus = { ctx: BaseAudioContext; dst: AudioNode; noise: AudioBuffer };
type Play = Bus & { t: number; p: number; v: number }; // start time, pitch and volume variation of this one play

// One enveloped voice: an oscillator (or looped white noise) through an optional filter, both swept exponentially.
type Voice = {
  src: OscillatorType | 'noise';
  f?: number; f2?: number; // oscillator pitch sweep
  filter?: BiquadFilterType; ff?: number; ff2?: number; q?: number; // filter cutoff sweep
  trem?: number; // amplitude flutter in Hz: a growl on a low saw
  gain: number; attack?: number; dur: number; delay?: number;
};

function voice(o: Play, v: Voice) {
  const { ctx } = o;
  const t = o.t + (v.delay ?? 0), end = t + v.dur;
  let src: AudioScheduledSourceNode;
  if (v.src === 'noise') {
    const b = ctx.createBufferSource();
    b.buffer = o.noise;
    b.loop = true;
    src = b;
  } else {
    const osc = ctx.createOscillator();
    osc.type = v.src;
    osc.frequency.setValueAtTime(v.f! * o.p, t);
    if (v.f2) osc.frequency.exponentialRampToValueAtTime(v.f2 * o.p, end);
    src = osc;
  }
  let node: AudioNode = src;
  if (v.filter) {
    const f = ctx.createBiquadFilter();
    f.type = v.filter;
    f.Q.value = v.q ?? 1;
    f.frequency.setValueAtTime(v.ff! * o.p, t);
    if (v.ff2) f.frequency.exponentialRampToValueAtTime(v.ff2 * o.p, end);
    node = node.connect(f);
  }
  if (v.trem) {
    const am = ctx.createGain(), depth = ctx.createGain(), lfo = ctx.createOscillator();
    am.gain.value = depth.gain.value = 0.5;
    lfo.frequency.value = v.trem;
    lfo.connect(depth).connect(am.gain);
    lfo.start(t);
    lfo.stop(end);
    node = node.connect(am);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v.gain * o.v, t + (v.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  node.connect(g).connect(o.dst);
  if (src instanceof AudioBufferSourceNode) src.start(t, Math.random()); // random slice of the noise
  else src.start(t);
  src.stop(end + 0.02);
}

const bursts = (o: Play, at: number[], v: Voice) => at.forEach((delay) => voice(o, { ...v, delay }));

export const recipes = {
  // Claws through air: a bandpassed swish, the finisher longer, lower and with body.
  slash(o: Play, combo: number) {
    if (combo < 2) return voice(o, { src: 'noise', filter: 'bandpass', ff: combo ? 4400 : 3800, ff2: combo ? 1100 : 900, q: 2.5, gain: 1.2, attack: 0.012, dur: 0.12 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 2600, ff2: 350, q: 1.5, gain: 1, attack: 0.025, dur: 0.22 });
    voice(o, { src: 'sine', f: 180, f2: 55, gain: 0.5, attack: 0.02, dur: 0.2 });
  },
  // Wet impact (low thump + resonant squelch) and a bone crunch (three sharp clicks); heavier on the finisher.
  hit(o: Play, combo: number) {
    const s = combo === 2 ? 1.5 : 1;
    voice(o, { src: 'sine', f: 150 / s, f2: 45 / s, gain: 0.9, dur: 0.12 * s });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 1800, ff2: 250, q: 6, gain: 0.8, attack: 0.003, dur: 0.1 * s });
    bursts(o, s > 1 ? [0, 0.014, 0.031, 0.05] : [0, 0.014, 0.031], { src: 'noise', filter: 'highpass', ff: 2500, q: 0.7, gain: 0.45, attack: 0.001, dur: 0.025 });
  },
  // Mist dash: an airy rising whoosh with a breath of high hiss.
  dash(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 500, ff2: 2600, q: 0.8, gain: 0.8, attack: 0.06, dur: 0.22 });
    voice(o, { src: 'noise', filter: 'highpass', ff: 6000, gain: 0.15, attack: 0.04, dur: 0.16 });
  },
  // The hero is struck: a dissonant falling pair (a tritone apart) over a thud.
  hurt(o: Play) {
    for (const f of [260, 368]) voice(o, { src: 'sawtooth', f, f2: f * 0.42, filter: 'lowpass', ff: 1400, ff2: 400, q: 2, gain: 0.35, dur: 0.25 });
    voice(o, { src: 'sine', f: 110, f2: 40, gain: 0.8, dur: 0.15 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 900, gain: 0.4, dur: 0.08 });
  },
  // Audio telegraph: a swelling hiss over a growling snarl, the only sustained, rising sound in the mix.
  windup(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 3500, ff2: 6500, q: 3, gain: 0.9, attack: 0.3, dur: 0.4 });
    voice(o, { src: 'sawtooth', f: 85, f2: 120, filter: 'lowpass', ff: 600, ff2: 1500, q: 4, trem: 26, gain: 0.7, attack: 0.15, dur: 0.4 });
  },
  // The lunge: a low rush with a short bark.
  lunge(o: Play) {
    voice(o, { src: 'noise', filter: 'lowpass', ff: 1400, ff2: 300, gain: 0.9, attack: 0.01, dur: 0.18 });
    voice(o, { src: 'sawtooth', f: 160, f2: 70, filter: 'lowpass', ff: 800, trem: 40, gain: 0.5, dur: 0.12 });
  },
  // An enemy bursts: deep thump, a falling blast, then droplets splattering.
  kill(o: Play) {
    voice(o, { src: 'sine', f: 100, f2: 28, gain: 0.9, dur: 0.45 });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 4000, ff2: 120, gain: 0.8, attack: 0.002, dur: 0.4 });
    bursts(o, [0.05, 0.11, 0.2], { src: 'noise', filter: 'bandpass', ff: 1800, q: 4, gain: 0.4, dur: 0.04 });
  },
  // Blood wells up where an enemy will appear: a low swell and a few bubbles popping.
  spawn(o: Play) {
    voice(o, { src: 'noise', filter: 'lowpass', ff: 300, gain: 0.3, attack: 0.4, dur: 0.6 });
    for (const delay of [0, 0.13, 0.3, 0.48]) {
      const f = 240 + Math.random() * 120;
      voice(o, { src: 'sine', f, f2: f * 3, gain: 0.3, dur: 0.07, delay: delay + Math.random() * 0.05 });
    }
  },
  // The hero falls to ashes: a tolling bell (inharmonic partials), a detuned drone sinking, ash hissing away.
  death(o: Play) {
    for (const [r, gain, dur] of [[1, 0.4, 1.6], [2.4, 0.15, 0.9], [4.07, 0.08, 0.4]]) voice(o, { src: 'sine', f: 98 * r, gain, attack: 0.003, dur });
    for (const f of [110, 116]) voice(o, { src: 'sawtooth', f, f2: f * 0.26, filter: 'lowpass', ff: 1800, ff2: 80, q: 3, gain: 0.3, attack: 0.01, dur: 1.4 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 2500, ff2: 300, q: 0.7, gain: 0.35, attack: 0.2, dur: 1.2 });
    voice(o, { src: 'sine', f: 90, f2: 30, gain: 0.8, dur: 0.5 });
  },
};
export type SfxName = keyof typeof recipes;

// Master gain (-6 dB) into a tanh soft clipper that can never output more than 0.89: overlapping sounds saturate
// instead of clipping, and a single sound keeps its transients (a DynamicsCompressor squashed the hits by 10 dB).
export function bus(ctx: BaseAudioContext, dst: AudioNode): Bus {
  const master = ctx.createGain(), clip = ctx.createWaveShaper(), range = 4; // the curve spans ±4 of master output
  master.gain.value = 0.5 / range;
  clip.curve = Float32Array.from({ length: 2049 }, (_, i) => 0.89 * Math.tanh(((i / 1024 - 1) * range) / 0.89));
  clip.oversample = '2x';
  master.connect(clip).connect(dst);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  noise.getChannelData(0).forEach((_, i, a) => (a[i] = Math.random() * 2 - 1));
  return { ctx, dst: master, noise };
}

// Small random pitch (about ±1.5 semitones) and volume offsets, so repeats never sound mechanical.
export const vary = (b: Bus): Play => ({ ...b, t: b.ctx.currentTime, p: 2 ** ((Math.random() * 3 - 1.5) / 12), v: 0.85 + Math.random() * 0.15 });

let live: Bus | undefined;
export function play(scene: Phaser.Scene, name: SfxName, arg = 0) {
  const sm = scene.sound as Phaser.Sound.WebAudioSoundManager;
  // Nothing before the first user input: a locked context would replay its backlog all at once on unlock.
  if (sm.context?.state !== 'running') return;
  if (live?.ctx !== sm.context) live = bus(sm.context, sm.destination);
  recipes[name](vary(live), arg);
}
