// Sound check in headless Chromium, since nobody here can listen: renders every sound of src/sfx.ts offline and
// checks it is not silent, not NaN, of the expected length, and peaks below 0.9, alone and with many overlapping.
// Then checks the game keeps silent before the first input, plays after it, and that M toggles mute.
// Usage: node tools/sfx.check.mjs   (exit code 1 on a failure or a page error)
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5207, strictPort: true }, logLevel: 'error' });
await server.listen();
// Real browsers' autoplay rule, which headless Chromium does not apply by default.
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5207/');
await page.waitForFunction(() => window.game?.scene.isActive('room'));

// [name, arg, expected length to -60 dB, range in ms]
const sounds = [['slash', 0, 60, 140], ['slash', 1, 60, 140], ['slash', 2, 120, 240], ['hit', 0, 60, 140], ['hit', 2, 100, 200],
  ['dash', 0, 120, 240], ['hurt', 0, 150, 280], ['windup', 0, 300, 450], ['lunge', 0, 80, 200], ['kill', 0, 250, 450],
  ['spawn', 0, 400, 700], ['death', 0, 900, 1600], ['aim', 0.45, 450, 600], ['twang', 0, 120, 260], ['thunk', 0, 120, 260],
  ['holy', 0, 500, 900], ['burn', 0, 250, 420], ['shatter', 0, 80, 180],
  ['shatter', 1, 350, 600], ['bite', 0, 70, 180], ['drain', 0, 380, 520], ['heal', 0, 250, 450], ['snap', 0, 50, 130],
  ['clear', 0, 650, 1000], ['gift', 0, 380, 650], ['gift', 1, 380, 650], ['gate', 0, 1000, 1300],
  ['glyph', 0, 450, 900], ['bind', 0, 220, 420]];
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
  // and crossbows aim, shoot and hit, a bite latches, drains and heals, the room clears, a gift is taken, the gate rises
  // and a glyph burns in and binds.
  const pile = [['slash', 2, 0], ['hit', 2, 0], ['hit', 2, 0], ['hit', 2, 0], ['kill', 0, 0], ['hurt', 0, 0.01],
    ['windup', 0, 0], ['lunge', 0, 0.02], ['spawn', 0, 0], ['spawn', 0, 0], ['spawn', 0, 0], ['spawn', 0, 0], ['death', 0, 0.02],
    ['aim', 0.45, 0], ['twang', 0, 0.01], ['twang', 0, 0], ['thunk', 0, 0.02],
    ['burn', 0, 0], ['shatter', 1, 0], ['holy', 0, 0], ['bite', 0, 0], ['drain', 0, 0], ['heal', 0, 0.01], ['snap', 0, 0],
    ['clear', 0, 0], ['gift', 1, 0], ['gate', 0, 0], ['glyph', 0, 0], ['bind', 0, 0]];
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
const locked = await nodes(true), unlocked = await nodes(false);
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
