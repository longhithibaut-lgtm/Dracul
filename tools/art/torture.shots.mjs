// The torture room trial (« Crasse et faim », src/torture.ts, src/dark.ts) in headless Chromium, on the phone held
// sideways and upright (touch emulation): mid-fight (ghouls and a crossbowman), three frames of the hero walking, then
// the frame rate with the light shader (dark.ts) on and off. Writes <out>/<shape>-<what>.png.
// Usage: node tools/art/torture.shots.mjs [--out=shots/torture --port=5208]   (exit code 1 on a page error)
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/torture');
const port = Number(arg('port', 5208));
const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const SHAPES = { 'phone-land': { viewport: { width: 915, height: 412 }, ...touch }, 'phone-port': { viewport: { width: 412, height: 915 }, ...touch } };

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];

for (const [shape, opts] of Object.entries(SHAPES)) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => errors.push(`${shape}: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(`${shape}: ${m.text()}`));
  const run = (f, a) => page.evaluate(f, a);
  const shot = async (what) => {
    await run(() => window.game.loop.sleep());
    await page.screenshot({ path: `${out}/${shape}-${what}.png`, scale: 'css' });
    await run(() => window.game.loop.wake());
  };
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.game?.scene.isActive('room'));
  await run(() => window.game.scene.getScene('room').scene.restart({ training: true, layout: 'torture' }));
  await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'torture' && window.game.scene.getScene('room').hero?.body);
  await page.click('#training summary'); // folded, as on a phone to play
  // The middle part's wave (ghouls, a crossbowman, a lantern), the hero just below it.
  await run(() => {
    const s = window.game.scene.getScene('room');
    s.hero.body.reset(240, 440); // the training room's hero is invincible
    s.wave = 1;
    s.spawnWave();
  });
  await page.waitForTimeout(2500);
  await shot('fight');
  { // device pixels round the hero
    const { x, y } = await run(() => { const s = window.game.scene.getScene('room'), c = s.cameras.main; return { x: (s.hero.x - c.worldView.x) * window.innerWidth / s.scale.width, y: (s.hero.y - c.worldView.y) * window.innerHeight / s.scale.height }; });
    await run(() => window.game.loop.sleep());
    await page.screenshot({ path: `${out}/${shape}-crisp.png`, clip: { x: Math.max(0, x - 110), y: Math.max(0, y - 90), width: 220, height: 160 } });
    await run(() => window.game.loop.wake());
  }
  for (const k of [0, 1, 2]) { // walking left, a frame every 130 ms
    if (k === 0) await page.keyboard.down('a');
    await page.waitForTimeout(130);
    await shot(`walk${k}`);
  }
  await page.keyboard.up('a');
  // Frame rate, light shader on then off (2 s each, after a settle).
  const fps = async () => {
    await page.waitForTimeout(800);
    return run(() => new Promise((done) => {
      let n = 0;
      const t0 = performance.now(), tick = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : done(Math.round((n * 1000) / (performance.now() - t0))));
      requestAnimationFrame(tick);
    }));
  };
  const on = await fps();
  await run(() => { for (const f of window.game.scene.getScene('room').cameras.main.filters.internal.list) f.setActive(false); }); // the light shader off
  const off = await fps();
  await shot('unlit');
  console.log(`${shape}: view ${await run(() => `${window.game.scale.width}x${window.game.scale.height}`)}, ${on} fps lit, ${off} fps unlit`);
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
