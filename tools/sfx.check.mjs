// Sound check in headless Chromium, since nobody here can listen: renders every sound of src/sfx.ts offline and
// checks it is not silent, not NaN, of the expected length, and peaks below 0.9, alone and with many overlapping.
// Then renders the ambience's beds and tension layers of src/ambience.ts (peak and RMS, no clipping, the death's silence)
// and writes them as WAV previews to shots/audio/ to listen to. Then checks the game keeps silent before the first
// input, plays after it (the ambience too), and that M toggles mute.
// Usage: node tools/sfx.check.mjs [--port=5207]   (exit code 1 on a failure or a page error)
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 5207);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
// Real browsers' autoplay rule, which headless Chromium does not apply by default.
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));

// [name, arg, expected length to -60 dB, range in ms]
const sounds = [['slash', 0, 60, 140], ['slash', 1, 60, 140], ['slash', 2, 120, 260], ['slash', 3, 100, 200], ['hit', 0, 60, 140], ['hit', 2, 100, 220], ['hit', 3, 80, 180],
  ['dash', 0, 120, 240], ['hurt', 0, 150, 280], ['windup', 0, 300, 450], ['lunge', 0, 80, 200], ['kill', 0, 250, 450],
  ['spawn', 0, 400, 700], ['death', 0, 900, 1600], ['aim', 0.45, 450, 600], ['twang', 0, 120, 260], ['thunk', 0, 120, 260],
  ['holy', 0, 500, 900], ['burn', 0, 250, 420], ['shatter', 0, 80, 180],
  ['shatter', 1, 350, 600], ['bite', 0, 70, 180], ['drain', 0, 380, 520], ['heal', 0, 250, 450], ['snap', 0, 50, 130],
  ['shoot', 0, 30, 110], ['splat', 0, 30, 120], ['splat', 1, 30, 110],
  ['clear', 0, 650, 1000], ['gift', 0, 380, 650], ['gift', 1, 380, 650], ['gate', 0, 1000, 1300],
  ['glyph', 0, 450, 900], ['bind', 0, 220, 420], ['groan', 0.9, 600, 950], ['heave', 1, 700, 1050], ['slam', 0, 250, 450], ['slam', 1, 300, 500], ['horn', 0, 1800, 3300], ['growl', 0, 550, 1050], ['joints', 0.9, 600, 1100], ['chains', 0, 1300, 1700]];
const results = await page.evaluate(async (sounds) => {
  const m = await import('/src/sfx.ts');
  const rate = 44100;
  // Renders plays [name, arg, at seconds] through the real bus; `raw` skips the soft clipper to see what it catches.
  async function render(plays, secs, raw) {
    const ctx = new OfflineAudioContext(1, rate * secs, rate);
    const b = m.bus(ctx, ctx.destination);
    if (raw) { b.dst = ctx.createGain(); b.dst.gain.value = 0.5; b.dst.connect(ctx.destination); } // master gain, no clipper
    for (const [name, arg, at] of plays) m.recipes[name]({ ...m.vary(b), t: at }, arg);
    const d = (await ctx.startRendering()).getChannelData(0);
    let peak = 0, nan = false, last = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (Number.isNaN(d[i])) nan = true;
      if (a > peak) peak = a;
      if (a > 0.001) last = i; // -60 dB
    }
    return { peak, raw: 0, nan, ms: Math.round((last / rate) * 1000) };
  }
  const out = [];
  for (const [name, arg] of sounds) {
    const r = { peak: 0, raw: 0, nan: false, ms: 0 };
    for (let i = 0; i < 6; i++) { // random variation: keep the worst of several takes
      const a = await render([[name, arg, 0]], 2), b = await render([[name, arg, 0]], 2, true);
      r.peak = Math.max(r.peak, a.peak); r.raw = Math.max(r.raw, b.peak); r.nan ||= a.nan; r.ms = Math.max(r.ms, a.ms);
    }
    out.push(r);
  }
  // Worst case: a finisher hitting three enemies (one dies) while the hero is hurt, an enemy winds up, a wave spawns
  // and crossbows aim, shoot and hit, a bite latches, drains and heals, a shard is thrown and bursts on an enemy and on a
  // wall, the room clears, a gift is taken, the gate rises and a glyph burns in and binds.
  const pile = [['slash', 2, 0], ['hit', 2, 0], ['hit', 2, 0], ['hit', 2, 0], ['slash', 3, 0], ['hit', 3, 0], ['kill', 0, 0], ['hurt', 0, 0.01],
    ['windup', 0, 0], ['lunge', 0, 0.02], ['spawn', 0, 0], ['spawn', 0, 0], ['spawn', 0, 0], ['spawn', 0, 0], ['death', 0, 0.02],
    ['aim', 0.45, 0], ['twang', 0, 0.01], ['twang', 0, 0], ['thunk', 0, 0.02],
    ['burn', 0, 0], ['shatter', 1, 0], ['holy', 0, 0], ['bite', 0, 0], ['drain', 0, 0], ['heal', 0, 0.01], ['snap', 0, 0],
    ['shoot', 0, 0], ['splat', 0, 0], ['splat', 1, 0.01], ['clear', 0, 0], ['gift', 1, 0], ['gate', 0, 0], ['glyph', 0, 0], ['bind', 0, 0]];
  out.push(await render(pile, 2), (await render(pile, 2, true)).peak);
  return out;
}, sounds);

let failed = 0;
const fail = (msg) => { failed++; console.log(`FAIL ${msg}`); };
sounds.forEach(([name, arg, lo, hi], i) => {
  const r = results[i];
  console.log(`${`${name}${arg ? ` ${arg}` : ''}`.padEnd(8)} peak ${r.peak.toFixed(2)} (raw ${r.raw.toFixed(2)})  ${r.ms} ms`);
  if (r.nan) fail(`${name}: NaN`);
  if (r.peak < 0.05) fail(`${name}: nearly silent`);
  if (r.peak >= 0.9) fail(`${name}: peak ${r.peak}`);
  if (r.ms < lo || r.ms > hi) fail(`${name}: ${r.ms} ms, expected ${lo}-${hi}`);
});
const [pile, pileRaw] = results.slice(sounds.length);
console.log(`overlap  peak ${pile.peak.toFixed(2)} (raw ${pileRaw.toFixed(2)})`);
if (pile.nan || pile.peak >= 0.9) fail(`overlap: peak ${pile.peak}`);

// The ambience: each bed (and what is set in the world near the hero: `near`), each tension layer, the death; rendered
// offline through the real mixer, the worst case over the full pile of effects above. [file, bed, near, hero, s, dead]
const calm = { blood: 0, life: 1, combat: false, boss: false, battue: 1e9 };
const beds = [['refuge', 'refuge', { breath: { g: 0.7, pan: 0.3 }, basin: { g: 0.7, pan: -0.3 } }, {}, 14],
  ['necropolis', 'necropolis', {}, {}, 10], ['necropolis-camp', 'necropolis', { voices: { g: 0.9, pan: 0.2 }, fire: { g: 1, pan: -0.3 }, hum: { g: 0.5, pan: 0.6 } }, {}, 8],
  ['necropolis-breach', 'necropolis', { burn: { g: 1, pan: 0.2 } }, {}, 8], ['catacombs', 'catacombs', {}, {}, 10], ['catacombs-lake', 'catacombs', { water: { g: 1, pan: -0.4 } }, {}, 8],
  ['catacombs-nest', 'nest', {}, {}, 8], ['crypt', 'crypt', { fire: { g: 0.6, pan: 0.5 } }, {}, 8], ['chapel', 'chapel', { choir: { g: 0.9, pan: 0 } }, {}, 8],
  ['cloister', 'cloister', { burn: { g: 1, pan: 0 } }, {}, 8], ['tension-blood', 'necropolis', {}, { blood: 1 }, 8], ['tension-battue', 'necropolis', {}, { battue: 0 }, 10],
  ['tension-combat', 'catacombs', {}, { combat: true }, 8], ['tension-low-life', 'catacombs', {}, { combat: true, life: 0.2 }, 8],
  ['boss', 'prison', {}, { combat: true, boss: true }, 8], ['death', 'necropolis', {}, {}, 6, true]];
const amb = await page.evaluate(async ({ beds, calm, pile }) => {
  const m = await import('/src/ambience.ts'), s = await import('/src/sfx.ts'), rate = 24000;
  const rms = (d, a, b) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, b - a)); };
  const out = [];
  for (const [name, bed, near, hero, secs, dead] of beds) {
    const ctx = new OfflineAudioContext(2, rate * secs, rate);
    m.preview(ctx, bed, near, { ...calm, ...hero }, secs, dead);
    const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    let peak = 0, nan = false;
    for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); nan ||= Number.isNaN(L[i] + R[i]); }
    // 16-bit stereo WAV, base64
    const v = new DataView(new ArrayBuffer(44 + n * 4)), str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(v.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const both = (a, b) => Math.hypot(rms(L, a, b), rms(R, a, b)) / Math.SQRT2;
    out.push({ name, peak, nan, rms: both(rate, n), cut: dead ? [both(0, rate * 0.5), both(rate * 0.85, rate * 1.1)] : undefined, wav: btoa(bin) }); // rms after the first second's fade in
  }
  // the loudest bed and tension under the pile of effects (the effects bus): the master's soft clipper holds
  const ctx = new OfflineAudioContext(2, rate * 4, rate);
  m.preview(ctx, 'prison', { fire: { g: 1, pan: 0 } }, { ...calm, combat: true, boss: true, life: 0.2, blood: 1, battue: 0 }, 4);
  const b = s.bus(ctx, m.mixer(ctx, ctx.destination).fx);
  for (const [name, arg, at] of pile) s.recipes[name]({ ...s.vary(b), t: 1 + at }, arg);
  const d = (await ctx.startRendering()).getChannelData(0);
  return { out, pile: d.reduce((p, x) => Math.max(p, Math.abs(x)), 0) };
}, { beds, calm, pile: [['slash', 2, 0], ['hit', 2, 0], ['hit', 2, 0], ['kill', 0, 0], ['hurt', 0, 0.01], ['windup', 0, 0], ['spawn', 0, 0], ['spawn', 0, 0], ['death', 0, 0.02], ['clear', 0, 0], ['gate', 0, 0], ['glyph', 0, 0], ['slam', 1, 0], ['horn', 0, 0]] });
await mkdir('shots/audio', { recursive: true });
const db = (a) => (20 * Math.log10(Math.max(a, 1e-9))).toFixed(1);
for (const r of amb.out) {
  await writeFile(`shots/audio/${r.name}.wav`, Buffer.from(r.wav, 'base64'));
  console.log(`${r.name.padEnd(18)} peak ${db(r.peak)} dBFS  rms ${db(r.rms)} dBFS${r.cut ? `  death: ${db(r.cut[0])} → ${db(r.cut[1])} dB` : ''}`);
  if (r.nan) fail(`${r.name}: NaN`);
  if (r.peak >= 0.9) fail(`${r.name}: peak ${r.peak}`);
  if (r.rms < 0.001) fail(`${r.name}: nearly silent`); // -60 dB
  if (r.rms > 0.1) fail(`${r.name}: rms ${db(r.rms)} dB, louder than an ambience`); // -20 dB
  if (r.cut && r.cut[1] > r.cut[0] / 10) fail(`${r.name}: no silence after the fall`);
}
const rmsOf = (n) => amb.out.find((r) => r.name === n).rms;
for (const [t, base] of [['tension-blood', 'necropolis'], ['tension-combat', 'catacombs'], ['boss', 'catacombs']]) if (rmsOf(t) <= rmsOf(base)) fail(`${t} no louder than ${base}`);
console.log(`ambience under the effects' pile: peak ${amb.pile.toFixed(2)}; previews in shots/audio/`);
if (amb.pile >= 1) fail(`master: peak ${amb.pile}`);

// Live game. Headless Chromium starts audio unlocked whatever the flags, so the lock is simulated by suspending the
// context: a locked context must get no sound at all (it would pile up and burst out on unlock).
const nodes = (suspend) => page.evaluate(async (suspend) => {
  const m = await import('/src/sfx.ts');
  const ctx = window.game.sound.context;
  await (suspend ? ctx.suspend() : ctx.resume());
  let n = 0;
  const make = ctx.createGain;
  ctx.createGain = function () { n++; return make.call(this); };
  for (const name of Object.keys(m.recipes)) m.play(window.game.scene.getScene('room'), name, 2);
  delete ctx.createGain;
  return n;
}, suspend);
const locked = await nodes(true);
const ambLocked = await page.evaluate(async () => { const m = await import('/src/ambience.ts'), t = m.live()?.t; await new Promise((r) => setTimeout(r, 400)); return m.live()?.t === t; });
const unlocked = await nodes(false);
await page.waitForTimeout(400);
const ambLive = await page.evaluate(async () => (await import('/src/ambience.ts')).live()?.layers ?? []);
console.log(`ambience: still while locked ${ambLocked}, playing after: ${ambLive.join(', ')}`);
if (!ambLocked || !ambLive.includes('drone')) fail('the ambience must keep still on a locked context and play the refuge after');
const mute = () => page.evaluate(() => window.game.sound.mute);
await page.keyboard.press('m');
await page.waitForTimeout(100); // Phaser handles keys on its next step
const muted = await mute();
await page.keyboard.press('m');
await page.waitForTimeout(100);
const unmuted = !(await mute());
console.log(`live: ${locked} gain nodes while locked, ${unlocked} unlocked; M mutes ${muted}, M again unmutes ${unmuted}`);
if (locked || !unlocked) fail('sounds must play only on a running context');
if (!muted || !unmuted) fail('M must toggle mute');

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(failed || errors.length ? 1 : 0);
