// Plays a scripted fight in headless Chromium and saves comparable screenshots (1920x1080 = native x4).
// Usage: npm run shot [-- --out=shots --port=5199]
// Writes room.png and combat.png (full frames) plus crops: hero.png, enemy.png, fx.png, hud.png.
// Exit code 1 if the page logged an error.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots');
const port = Number(arg('port', 5199));
const X = 4; // native -> screenshot scale

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
// SwiftShader gives WebGL without a GPU (cloud containers); harmless on a desktop.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const state = () => page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  const live = s.enemies.getChildren().filter((e) => e.body?.enable);
  return { hx: s.hero.x, hy: s.hero.y, health: s.health, enemies: live.map((e) => ({ x: e.x, y: e.y, st: e.getData('state') })) };
});
const freeze = (on) => page.evaluate((on) => (on ? window.game.loop.sleep() : window.game.loop.wake()), on);
// Crop of `w`x`h` screenshot pixels centred on a native-coordinate point, kept inside the frame.
const clip = (cx, cy, w, h) => ({
  x: Math.min(Math.max(cx * X - w / 2, 0), 1920 - w), y: Math.min(Math.max(cy * X - h / 2, 0), 1080 - h), width: w, height: h,
});
const shot = (name, c) => page.screenshot({ path: `${out}/${name}.png`, clip: c });

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await page.waitForTimeout(400);

let s = await state();
await freeze(true);
await shot('room');
await shot('hero', clip(s.hx, s.hy - 4, 240, 200));
await freeze(false);

// Walk to the nearest enemy and slash it; capture the frame right after a hit lands.
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.countActive() > 0);
let captured = false;
for (let i = 0; i < 120 && !captured; i++) {
  s = await state();
  if (!s.enemies.length) { await page.waitForTimeout(100); continue; }
  const dist = (e) => Math.hypot(e.x - s.hx, e.y - s.hy);
  const e = s.enemies.reduce((a, b) => (dist(a) < dist(b) ? a : b));
  if (dist(e) > 24) {
    const keys = [];
    if (e.x > s.hx + 4) keys.push('d'); else if (e.x < s.hx - 4) keys.push('a');
    if (e.y > s.hy + 4) keys.push('s'); else if (e.y < s.hy - 4) keys.push('w');
    await hold(keys, 80);
    continue;
  }
  await page.mouse.click(e.x * X, e.y * X);
  await page.waitForTimeout(50);
  await freeze(true);
  s = await state();
  const target = s.enemies.length ? s.enemies.reduce((a, b) => (dist(a) < dist(b) ? a : b)) : e;
  await shot('combat');
  await shot('fx', clip(s.hx, s.hy, 480, 270));
  await shot('enemy', clip(target.x, target.y - 4, 240, 200));
  await shot('hud', { x: 0, y: 0, width: 400, height: 120 });
  await freeze(false);
  captured = true;
}

console.log(`captured: ${captured ? 'yes' : 'NO (combat frame missing)'}; state: ${JSON.stringify(await state())}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || !captured ? 1 : 0);
