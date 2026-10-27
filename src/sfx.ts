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
  // Claws through air: a bandpassed swish; the finisher (2) longer, lower, with body and a low boom; the dash strike (3)
  // the mist's airy rise snapping into a swish.
  slash(o: Play, combo: number) {
    if (combo === 3) {
      voice(o, { src: 'noise', filter: 'bandpass', ff: 900, ff2: 3400, q: 0.9, gain: 0.6, attack: 0.01, dur: 0.07 });
      return voice(o, { src: 'noise', filter: 'bandpass', ff: 4800, ff2: 800, q: 2, gain: 1.3, attack: 0.008, dur: 0.14, delay: 0.03 });
    }
    if (combo < 2) return voice(o, { src: 'noise', filter: 'bandpass', ff: combo ? 4400 : 3800, ff2: combo ? 1100 : 900, q: 2.5, gain: 1.2, attack: 0.012, dur: 0.12 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 2600, ff2: 300, q: 1.5, gain: 1.1, attack: 0.025, dur: 0.24 });
    voice(o, { src: 'sine', f: 180, f2: 50, gain: 0.6, attack: 0.02, dur: 0.22 });
    voice(o, { src: 'sine', f: 70, f2: 35, gain: 0.5, attack: 0.04, dur: 0.24 });
  },
  // Wet impact (low thump + resonant squelch) and a bone crunch (sharp clicks); heavier on the dash strike (3) and
  // heaviest on the finisher (2), which also lands a deep blow.
  hit(o: Play, combo: number) {
    const s = combo === 2 ? 1.6 : combo === 3 ? 1.25 : 1;
    voice(o, { src: 'sine', f: 150 / s, f2: 45 / s, gain: 0.9, dur: 0.12 * s });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 1800, ff2: 250, q: 6, gain: 0.8, attack: 0.003, dur: 0.1 * s });
    bursts(o, s > 1 ? [0, 0.014, 0.031, 0.05] : [0, 0.014, 0.031], { src: 'noise', filter: 'highpass', ff: 2500, q: 0.7, gain: 0.45, attack: 0.001, dur: 0.025 });
    if (combo === 2) voice(o, { src: 'sine', f: 62, f2: 30, gain: 0.8, attack: 0.003, dur: 0.2 });
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
  // Audio telegraph: two teeth snaps, then a short rising growl; a rhythm no other sound in the mix has.
  windup(o: Play) {
    bursts(o, [0, 0.09], { src: 'noise', filter: 'bandpass', ff: 2200, q: 5, gain: 0.7, attack: 0.001, dur: 0.035 });
    voice(o, { src: 'sawtooth', f: 90, f2: 140, filter: 'lowpass', ff: 500, ff2: 1100, q: 3, trem: 14, gain: 0.55, attack: 0.08, dur: 0.26, delay: 0.16 });
  },
  // The lunge: a low rush with a short bark.
  lunge(o: Play) {
    voice(o, { src: 'noise', filter: 'lowpass', ff: 1400, ff2: 300, gain: 0.9, attack: 0.01, dur: 0.18 });
    voice(o, { src: 'sawtooth', f: 160, f2: 70, filter: 'lowpass', ff: 800, trem: 40, gain: 0.5, dur: 0.12 });
  },
  // Crossbow telegraph: a creaking wooden draw over ratchet ticks, then a bright click when the aim locks (`lock` s in).
  aim(o: Play, lock: number) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 600, ff2: 1500, q: 7, trem: 28, gain: 1.8, attack: 0.06, dur: 0.32 });
    bursts(o, [0.02, 0.09, 0.16, 0.23], { src: 'noise', filter: 'highpass', ff: 3200, q: 1, gain: 0.35, attack: 0.001, dur: 0.02 });
    voice(o, { src: 'square', f: 2300, filter: 'bandpass', ff: 2300, q: 6, gain: 0.5, attack: 0.001, dur: 0.06, delay: lock });
  },
  // The bolt leaves: a taut string twang, the prod's knock and the bolt hissing away.
  twang(o: Play) {
    voice(o, { src: 'sawtooth', f: 300, f2: 150, filter: 'lowpass', ff: 3200, ff2: 600, q: 4, gain: 0.45, attack: 0.002, dur: 0.2 });
    voice(o, { src: 'triangle', f: 150, f2: 90, gain: 0.6, attack: 0.002, dur: 0.12 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 3000, ff2: 1200, q: 1.5, gain: 0.5, attack: 0.01, dur: 0.14 });
  },
  // A bolt bites into stone or wood: a dry knock and the shaft quivering.
  thunk(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1700, q: 3, gain: 0.9, attack: 0.001, dur: 0.05 });
    voice(o, { src: 'sine', f: 320, f2: 120, gain: 0.5, dur: 0.07 });
    voice(o, { src: 'triangle', f: 190, f2: 170, trem: 34, gain: 0.3, attack: 0.005, dur: 0.2 });
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
  // A sacred lantern kindles: a small bright bell (inharmonic partials) over a shimmering hum, the mix's only pure,
  // high and sweet sound.
  holy(o: Play) {
    for (const [r, gain, dur] of [[1, 0.4, 0.9], [2.76, 0.16, 0.5], [5.4, 0.08, 0.25]]) voice(o, { src: 'sine', f: 784 * r, gain, attack: 0.004, dur });
    voice(o, { src: 'triangle', f: 392, gain: 0.25, attack: 0.25, dur: 0.8 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 6000, ff2: 9000, q: 5, trem: 12, gain: 0.35, attack: 0.3, dur: 0.75 });
  },
  // Holy light sears the hero: a crackling hiss, like fat on a fire.
  burn(o: Play) {
    voice(o, { src: 'noise', filter: 'highpass', ff: 2500, ff2: 6000, trem: 38, gain: 0.7, attack: 0.01, dur: 0.38 });
    bursts(o, [0, 0.04, 0.09, 0.13, 0.2, 0.27], { src: 'noise', filter: 'bandpass', ff: 4500, q: 3, gain: 0.5, attack: 0.001, dur: 0.02 });
  },
  // The bite latches: fangs piercing (two tight clicks), a wet resonant squelch and a soft thump.
  bite(o: Play) {
    bursts(o, [0, 0.011], { src: 'noise', filter: 'highpass', ff: 3000, q: 0.7, gain: 0.45, attack: 0.001, dur: 0.02 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1100, ff2: 260, q: 6, gain: 1.1, attack: 0.004, dur: 0.17, delay: 0.012 });
    voice(o, { src: 'sine', f: 140, f2: 55, gain: 0.7, dur: 0.13 });
  },
  // Drinking: three sucking pulls (a filtered slurp rising), each with a low gulp, like a slowing heartbeat.
  drain(o: Play) {
    for (const delay of [0.02, 0.17, 0.32]) {
      voice(o, { src: 'noise', filter: 'bandpass', ff: 280, ff2: 950, q: 5, gain: 1.1, attack: 0.04, dur: 0.11, delay });
      voice(o, { src: 'sine', f: 75, f2: 115, gain: 0.45, attack: 0.03, dur: 0.09, delay: delay + 0.05 });
    }
  },
  // Blood regained: a warm rising chord (an octave sweep of a fifth over a soft low saw), never the holy bell's purity.
  heal(o: Play) {
    voice(o, { src: 'triangle', f: 262, f2: 523, gain: 0.45, attack: 0.08, dur: 0.42 });
    voice(o, { src: 'sine', f: 392, f2: 784, gain: 0.22, attack: 0.12, dur: 0.38 });
    voice(o, { src: 'sawtooth', f: 131, f2: 262, filter: 'lowpass', ff: 500, ff2: 1400, gain: 0.22, attack: 0.1, dur: 0.42 });
  },
  // A bite at nothing: a quick breath of the lunge, then dry teeth clicking shut.
  snap(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1200, ff2: 2600, q: 1, gain: 0.35, attack: 0.02, dur: 0.06 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 3600, q: 8, gain: 2, attack: 0.001, dur: 0.03, delay: 0.05 });
    voice(o, { src: 'square', f: 1900, f2: 1300, filter: 'bandpass', ff: 1900, q: 10, gain: 0.2, attack: 0.001, dur: 0.025, delay: 0.05 });
  },
  // Le Tir leaves the hand: a quick wet flick, a short rising swish and a small liquid plip. Fired a lot: short and quiet.
  shoot(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1400, ff2: 4200, q: 3, gain: 0.6, attack: 0.008, dur: 0.08 });
    voice(o, { src: 'sine', f: 500, f2: 1300, gain: 0.22, attack: 0.002, dur: 0.035, delay: 0.01 });
  },
  // A shard bursts: a soft wet pat; on a wall or a prop (arg 1), smaller and drier.
  splat(o: Play, wall: number) {
    voice(o, { src: 'noise', filter: 'lowpass', ff: wall ? 2200 : 1400, ff2: 250, q: 5, gain: wall ? 0.35 : 0.5, attack: 0.002, dur: 0.07 });
    if (!wall) voice(o, { src: 'sine', f: 190, f2: 70, gain: 0.35, dur: 0.07 });
  },
  // Le Glyphe burns into the floor: a low diminished chord (D, F, A flat) swelling under breathy whispers.
  glyph(o: Play) {
    for (const [f, gain] of [[73.4, 0.24], [87.3, 0.18], [103.8, 0.16]]) voice(o, { src: 'sawtooth', f, filter: 'lowpass', ff: 260, ff2: 900, q: 2, gain, attack: 0.16, dur: 0.75 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 900, ff2: 2300, q: 4, trem: 7, gain: 0.6, attack: 0.22, dur: 0.6 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 2600, ff2: 1500, q: 6, trem: 11, gain: 0.35, attack: 0.18, dur: 0.5, delay: 0.08 });
  },
  // The glyph catches: chains rattle tight, then snap taut with an iron clank, a ringing link and a low jolt.
  bind(o: Play) {
    bursts(o, [0, 0.022, 0.04, 0.055], { src: 'noise', filter: 'bandpass', ff: 3600, q: 6, gain: 0.45, attack: 0.001, dur: 0.03 });
    voice(o, { src: 'noise', filter: 'highpass', ff: 2200, gain: 0.6, attack: 0.001, dur: 0.05, delay: 0.07 });
    voice(o, { src: 'square', f: 420, f2: 370, filter: 'bandpass', ff: 1700, q: 5, gain: 0.4, attack: 0.001, dur: 0.18, delay: 0.07 });
    voice(o, { src: 'triangle', f: 1270, gain: 0.14, attack: 0.002, dur: 0.28, delay: 0.07 });
    voice(o, { src: 'sine', f: 110, f2: 48, gain: 0.6, dur: 0.18, delay: 0.07 });
  },
  // A lantern struck: a glass tink and an iron clank. Broken (arg 1): glass bursts, shards tinkle, its light dies down.
  shatter(o: Play, broken: number) {
    voice(o, { src: 'triangle', f: 2100, gain: 0.4, dur: 0.14 });
    voice(o, { src: 'square', f: 330, f2: 300, filter: 'bandpass', ff: 1400, q: 4, gain: 0.35, dur: 0.1 });
    voice(o, { src: 'noise', filter: 'highpass', ff: 4000, gain: 0.5, attack: 0.001, dur: 0.05 });
    if (!broken) return;
    voice(o, { src: 'noise', filter: 'highpass', ff: 2500, ff2: 7000, gain: 0.7, attack: 0.002, dur: 0.28 });
    voice(o, { src: 'sine', f: 120, f2: 40, gain: 0.6, dur: 0.18 });
    voice(o, { src: 'sine', f: 1568, f2: 196, gain: 0.25, attack: 0.01, dur: 0.55 }); // the light going out
    for (let i = 0; i < 6; i++) voice(o, { src: 'sine', f: 2600 + Math.random() * 2400, gain: 0.18, dur: 0.06, delay: 0.05 + i * 0.05 + Math.random() * 0.03 });
  },
  // The room is cleared: a deep blow, then open fifths climbing (stark, not cheerful) over a breath of air.
  clear(o: Play) {
    voice(o, { src: 'sine', f: 70, f2: 40, gain: 0.5, dur: 0.5 });
    for (const [f, delay] of [[196, 0], [294, 0.11], [392, 0.22]]) voice(o, { src: 'triangle', f, gain: 0.32, attack: 0.008, dur: 0.85, delay });
    voice(o, { src: 'sawtooth', f: 98, filter: 'lowpass', ff: 300, ff2: 900, q: 2, gain: 0.25, attack: 0.25, dur: 0.9 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 700, ff2: 2800, q: 1, gain: 0.25, attack: 0.2, dur: 0.6 });
  },
  // A gift of the Rat house: rats scurry and squeak, and a coin rings, Vesna being a fence. Confirmed (arg 1): a
  // low thump gives the choice its weight.
  gift(o: Play, confirm: number) {
    bursts(o, [0, 0.03, 0.055, 0.09, 0.11], { src: 'noise', filter: 'bandpass', ff: 4200, q: 4, gain: 0.35, attack: 0.001, dur: 0.02 });
    bursts(o, [0.05, 0.16], { src: 'sine', f: 2300, f2: 3600, gain: 0.22, attack: 0.004, dur: 0.06 });
    for (const [f, gain, dur] of [[2093, 0.3, 0.45], [3136, 0.15, 0.3], [5274, 0.06, 0.15]]) voice(o, { src: 'triangle', f, gain, attack: 0.002, dur, delay: 0.2 });
    if (confirm) voice(o, { src: 'sine', f: 140, f2: 60, gain: 0.45, dur: 0.25 });
  },
  // The portcullis winches up: a clank, a chain rattling over a grinding rumble, then it locks in place.
  gate(o: Play) {
    voice(o, { src: 'square', f: 110, f2: 80, filter: 'lowpass', ff: 900, q: 3, gain: 0.4, attack: 0.002, dur: 0.15 });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 260, q: 2, trem: 9, gain: 0.5, attack: 0.15, dur: 1.0 });
    bursts(o, Array.from({ length: 14 }, (_, i) => 0.06 + i * 0.065 + Math.random() * 0.02),
      { src: 'noise', filter: 'bandpass', ff: 3000, q: 6, gain: 0.3, attack: 0.001, dur: 0.03 });
    voice(o, { src: 'sine', f: 75, f2: 45, gain: 0.45, dur: 0.2, delay: 1.0 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1500, q: 3, gain: 0.4, attack: 0.001, dur: 0.06, delay: 1.0 });
  },
  // A sonneur's bell. As his mallet rises (0), the bronze already hums, swelling (a rim rubbed); struck (1), it tolls:
  // deep inharmonic partials, a hard clang of the mallet and a long beating drone, the mix's lowest and longest sound.
  toll(o: Play, strike: number) {
    if (!strike) return void voice(o, { src: 'sine', f: 147, trem: 6, gain: 0.35, attack: 0.7, dur: 0.95 });
    for (const [r, gain, dur] of [[1, 0.6, 2.2], [1.19, 0.25, 1.4], [2.0, 0.22, 1.1], [2.74, 0.12, 0.6], [5.2, 0.06, 0.3]]) voice(o, { src: 'sine', f: 73.5 * r, gain, attack: 0.003, dur });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 1800, q: 4, gain: 0.7, attack: 0.001, dur: 0.06 });
    voice(o, { src: 'sine', f: 74.5, trem: 2, gain: 0.3, attack: 0.05, dur: 2.4 });
  },
  // An inquisiteur's censer whirling up for `dur` s: its chain hissing round faster and faster, embers roaring.
  whirl(o: Play, dur: number) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 500, ff2: 1600, q: 3, trem: 7, gain: 0.7, attack: dur * 0.6, dur });
    bursts(o, [0, 0.27, 0.5, 0.68, 0.82], { src: 'noise', filter: 'highpass', ff: 3500, gain: 0.25, attack: 0.002, dur: 0.04 });
  },
  // An Amas gathering itself up for `dur` s: many throats groaning at once, slightly apart, swelling, a wet creak of flesh.
  groan(o: Play, dur: number) {
    for (const f of [62, 74, 93]) voice(o, { src: 'sawtooth', f, f2: f * 1.5, filter: 'lowpass', ff: 300, ff2: 900, q: 4, trem: 9 + f / 20, gain: 0.3, attack: dur * 0.7, dur });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 420, ff2: 900, q: 6, trem: 5, gain: 0.5, attack: dur * 0.5, dur });
  },
  // A bourreau raising his axe for `dur` s: the haft's leather creaking in his grip, a deep breath drawn, the chain of
  // his reliquary rattling once.
  heave(o: Play, dur: number) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 380, ff2: 760, q: 8, trem: 22, gain: 2.6, attack: 0.05, dur: dur * 0.5 });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 500, ff2: 900, gain: 0.7, attack: dur * 0.8, dur });
    bursts(o, [0.08, 0.12, 0.17], { src: 'noise', filter: 'bandpass', ff: 3400, q: 6, gain: 0.3, attack: 0.001, dur: 0.03 });
  },
  // A blow on the floor. The Amas' slam (0): a deep wet thud of many bodies, a splash. The axe (1): an iron bite, stone
  // splitting in a running crackle, a low rumble under it.
  slam(o: Play, axe: number) {
    voice(o, { src: 'sine', f: axe ? 90 : 70, f2: 28, gain: 1, dur: 0.4 });
    voice(o, { src: 'noise', filter: 'lowpass', ff: axe ? 3000 : 900, ff2: 120, gain: 0.9, attack: 0.002, dur: 0.35 });
    if (!axe) return void voice(o, { src: 'noise', filter: 'bandpass', ff: 700, ff2: 250, q: 5, gain: 0.7, attack: 0.01, dur: 0.2, delay: 0.03 });
    voice(o, { src: 'square', f: 260, f2: 200, filter: 'bandpass', ff: 1800, q: 5, gain: 0.35, attack: 0.001, dur: 0.12 });
    bursts(o, [0.02, 0.04, 0.07, 0.09, 0.12, 0.16], { src: 'noise', filter: 'highpass', ff: 2200, gain: 0.45, attack: 0.001, dur: 0.03 });
    voice(o, { src: 'noise', filter: 'lowpass', ff: 200, trem: 12, gain: 0.5, attack: 0.05, dur: 0.8 });
  },
  // The battue loosed: a hunting horn far off (two long brassy calls, muffled by the stone), then the hounds baying.
  horn(o: Play) {
    for (const [f, delay, dur] of [[196, 0, 0.75], [262, 0.8, 1.1]]) {
      voice(o, { src: 'sawtooth', f, f2: f * 0.97, filter: 'lowpass', ff: 700, ff2: 450, q: 2, gain: 0.5, attack: 0.18, dur, delay });
      voice(o, { src: 'square', f: f * 2, filter: 'lowpass', ff: 900, gain: 0.06, attack: 0.25, dur, delay });
    }
    for (const delay of [1.7, 2.15]) {
      voice(o, { src: 'triangle', f: 420, f2: 640, filter: 'lowpass', ff: 1400, gain: 0.35, attack: 0.08, dur: 0.35, delay });
      voice(o, { src: 'triangle', f: 640, f2: 330, filter: 'lowpass', ff: 1200, trem: 9, gain: 0.32, attack: 0.02, dur: 0.6, delay: delay + 0.33 });
    }
  },
  // Le Rongé gone beast: a long wet growl in the throat.
  growl(o: Play) {
    voice(o, { src: 'sawtooth', f: 70, f2: 95, filter: 'lowpass', ff: 380, ff2: 600, q: 4, trem: 23, gain: 0.7, attack: 0.12, dur: 0.9 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 300, q: 3, trem: 17, gain: 0.35, attack: 0.15, dur: 0.8 });
  },
  // La Nourrice winding up for `dur` s: her joints cracking one after another, dry and loud, over a creak of stretched
  // sinew; held over him under the vault, the same, slower.
  joints(o: Play, dur: number) {
    const n = Math.max(3, Math.round(dur * 7));
    bursts(o, Array.from({ length: n }, (_, i) => (i / n) * dur * (0.6 + 0.4 * (i / n)) + Math.random() * 0.03), { src: 'noise', filter: 'bandpass', ff: 1900, q: 3, gain: 1.8, attack: 0.001, dur: 0.035 });
    bursts(o, Array.from({ length: n }, (_, i) => (i / n) * dur * (0.6 + 0.4 * (i / n)) + 0.01), { src: 'sine', f: 180, f2: 70, gain: 0.6, attack: 0.001, dur: 0.06 });
    voice(o, { src: 'noise', filter: 'bandpass', ff: 300, ff2: 520, q: 9, trem: 14, gain: 1.2, attack: dur * 0.5, dur });
  },
  // The Order's chains snapping off her: links straining, then three iron snaps, and the links rattling to the floor.
  chains(o: Play) {
    voice(o, { src: 'noise', filter: 'bandpass', ff: 900, ff2: 1600, q: 6, trem: 30, gain: 0.6, attack: 0.3, dur: 0.45 });
    for (const delay of [0.45, 0.62, 0.74]) {
      voice(o, { src: 'square', f: 520, f2: 300, filter: 'bandpass', ff: 2200, q: 4, gain: 0.45, attack: 0.001, dur: 0.12, delay });
      voice(o, { src: 'noise', filter: 'highpass', ff: 3000, gain: 0.7, attack: 0.001, dur: 0.05, delay });
    }
    bursts(o, Array.from({ length: 12 }, (_, i) => 0.85 + i * 0.05 + Math.random() * 0.03), { src: 'noise', filter: 'bandpass', ff: 3400, q: 6, gain: 0.3, attack: 0.001, dur: 0.03 });
  },
  // A blow turned aside: steel on steel, a bright ring over a dry knock.
  parry(o: Play) {
    voice(o, { src: 'noise', filter: 'highpass', ff: 3000, gain: 0.8, attack: 0.001, dur: 0.05 });
    for (const [f, gain, dur] of [[1870, 0.3, 0.45], [2960, 0.18, 0.3], [4410, 0.1, 0.2]]) voice(o, { src: 'triangle', f, gain, attack: 0.001, dur });
    voice(o, { src: 'square', f: 220, f2: 180, filter: 'lowpass', ff: 1200, gain: 0.3, attack: 0.001, dur: 0.08 });
  },
};
export type SfxName = keyof typeof recipes;

// Master gain (-6 dB) into a tanh soft clipper that never outputs more than 0.89: overlapping sounds saturate
// instead of clipping, and a single sound keeps its transients (a DynamicsCompressor squashed the hits by 10 dB).
// The curve tops out at 0.87: the 2x oversampling filters overshoot it by up to 2 % when a pile-up saturates.
export function bus(ctx: BaseAudioContext, dst: AudioNode): Bus {
  const master = ctx.createGain(), clip = ctx.createWaveShaper(), range = 4; // the curve spans ±4 of master output
  master.gain.value = 0.5 / range;
  clip.curve = Float32Array.from({ length: 2049 }, (_, i) => 0.87 * Math.tanh(((i / 1024 - 1) * range) / 0.87));
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
