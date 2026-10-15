// Plays a scripted fight in headless Chromium and saves comparable screenshots (1920x1080 = native x4).
// Usage: npm run shot [-- --out=shots --port=5199]
// Writes room.png and combat.png (full frames, combat taken 40 ms after a dash-in slash) plus crops:
// hero.png (running diagonally), enemy.png (winding up an attack), fx.png, and hud.png (taken at 3/5 health, dash spent).
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

await freeze(true);
await shot('room');
await freeze(false);
// The hero mid-stride on a diagonal, like the reference.
await page.keyboard.down('d');
await page.keyboard.down('s');
await page.waitForTimeout(250);
await freeze(true);
let s = await state();
await shot('hero', clip(s.hx, s.hy - 4, 240, 200));
await freeze(false);
await page.keyboard.up('d');
await page.keyboard.up('s');

// The first enemy to reach the idle hero, winding up its attack: its most menacing, telegraphed pose, before the
// melee clutters the frame.
{
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren()
    .some((e) => e.body?.enable && e.getData('state') === 'windup' && e.getData('flashUntil') < window.game.scene.getScene('room').time.now), null, { timeout: 8000 });
  await page.waitForTimeout(150); // mid-windup
  await freeze(true);
  const w = await page.evaluate(() => {
    const e = window.game.scene.getScene('room').enemies.getChildren().find((o) => o.body?.enable && o.getData('state') === 'windup');
    return e ? { x: e.x, y: e.y } : null;
  });
  if (w) await shot('enemy', clip(w.x, w.y - 4, 240, 200));
  await freeze(false);
}

// Line up horizontally with an enemy, mist-dash in and slash, like the reference frame: the capture shows the dash
// trail, the swing and the impact together.
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.countActive() > 0);
let captured = false;
for (let i = 0; i < 200 && !captured; i++) {
  s = await state();
  if (!s.enemies.length) { await page.waitForTimeout(100); continue; }
  const dist = (e) => Math.hypot(e.x - s.hx, e.y - s.hy);
  const side = s.enemies.filter((e) => Math.abs(e.x - s.hx) > 20);
  const e = (side.length ? side : s.enemies).reduce((a, b) => (dist(a) < dist(b) ? a : b));
  const dx = e.x - s.hx, dy = e.y - s.hy;
  if (Math.abs(dy) > 6 || Math.abs(dx) > 72) {
    const keys = [];
    if (Math.abs(dx) > 72) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 6) keys.push(dy > 0 ? 's' : 'w');
    await hold(keys, 60);
    continue;
  }
  if (Math.abs(dx) < 50) { await hold([dx > 0 ? 'a' : 'd'], 60); continue; } // back off for a run-up
  const pre = { x: s.hx, y: s.hy };
  await page.keyboard.down(dx > 0 ? 'd' : 'a');
  // Space is held until the dash is over: Phaser drops a key pressed and released between two updates (slow frames
  // in headless), and a slash during the dash is ignored.
  await page.keyboard.down('Space');
  await page.waitForFunction(() => { const r = window.game.scene.getScene('room'); return r.dashUntil > 0 && r.time.now >= r.dashUntil; });
  await page.keyboard.up('Space');
  await page.keyboard.up(dx > 0 ? 'd' : 'a');
  s = await state();
  const target = s.enemies.length ? s.enemies.reduce((a, b) => (dist(a) < dist(b) ? a : b)) : e;
  await page.mouse.click(target.x * X, target.y * X);
  await page.waitForTimeout(40);
  await freeze(true);
  s = await state();
  await shot('combat');
  await shot('fx', clip((pre.x + target.x) / 2, s.hy, 480, 270));
  await freeze(false);
  captured = true;
}

// HUD in a representative mid-fight state, like the reference: 3 of 5 health, dash just spent.
if (captured) {
  await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.health = 3; s.hud.health(3, 5); });
  await page.waitForTimeout(900); // let the lost-health animation settle
  await page.keyboard.press('Space', { delay: 100 }); // held across a couple of frames, see above
  await page.waitForTimeout(100);
  await freeze(true);
  await shot('hud', { x: 0, y: 0, width: 400, height: 120 });
  await freeze(false);
}

console.log(`captured: ${captured ? 'yes' : 'NO (combat frame missing)'}; state: ${JSON.stringify(await state())}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || !captured ? 1 : 0);
