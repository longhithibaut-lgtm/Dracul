// Plays a scripted fight in headless Chromium and saves comparable screenshots (1920x1080 = native x4).
// Usage: npm run shot [-- --out=shots --port=5199]
// Writes room.png and combat.png (full frames, combat taken 40 ms after a dash-in slash) plus crops:
// hero.png (running diagonally), enemy.png (winding up an attack), fx.png, hud.png (taken at 3/5 health, dash spent)
// light.png (a lit lantern, the hero at the edge of its holy light), crossbow.png (a crossbowman aiming), weak.png (a
// weakened crossbowman, its heartbeat drop on the beat) and bite.png (the hero latched onto it, mid-drain).
// Exit code 1 if the page logged an error or the combat, crossbow or bite frame is missing.
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

// A sacred lantern, lit, with the hero just inside the edge of its holy light, smoking before the first burn lands.
// The fight is cleared away first so the frame only holds the two of them.
let lit = false;
if (captured) {
  const l = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    if (s.dead) return null;
    s.enemies.clear(true, true);
    const l = s.addLantern();
    return l ? { x: l.x, y: l.y } : null;
  });
  if (l) {
    await page.waitForFunction(() => window.game.scene.getScene('room').lanterns[0]?.lit);
    await page.waitForTimeout(300); // all bands up
    const hx = l.x + (l.x > 240 ? -34 : 34); // toward the middle of the hall; feet 0.85 of the radius out
    await page.evaluate(({ x, y }) => window.game.scene.getScene('room').hero.body.reset(x, y), { x: hx, y: l.y - 8 }); // feet 8 px below
    await page.waitForFunction(() => window.game.scene.getScene('room').litMs > 200); // smoking, inside the burn's grace
    await freeze(true);
    await shot('light', clip((l.x + hx) / 2, l.y - 8, 240, 200));
    await freeze(false);
    lit = true;
  }
}

// A crossbowman of the Order mid-aim, its dotted aim line out but not yet locked. They join from the second wave, so
// that wave is called now, with the hero kept alive for it.
let bow = null;
{
  await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = Infinity; s.wave = Math.max(s.wave, 1); s.spawnWave(); });
  await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.enemies.getChildren()
    .some((e) => e.body?.enable && e.getData('kind') === 'crossbow' && e.getData('state') === 'aim' && e.getData('fireAt') - s.time.now < 400); }, null, { timeout: 15000 }).catch(() => {});
  await freeze(true);
  bow = await page.evaluate(() => {
    const e = window.game.scene.getScene('room').enemies.getChildren().find((o) => o.body?.enable && o.getData('state') === 'aim');
    return e ? { x: e.x, y: e.y } : null;
  });
  if (bow) await shot('crossbow', clip(bow.x, bow.y - 4, 240, 200));
  await freeze(false);
}

// La Morsure. A crossbowman left alone with one blood (weakened, as after one slash) and the hero kept out of frame:
// its hunch, bloodied tabard and beating drop. Then the hero bites it through the real bite, caught mid-drain.
let bit = null;
{
  const p = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const prey = s.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === 'crossbow');
    if (s.dead || !prey) return null;
    for (const e of s.enemies.getChildren().slice()) if (e !== prey) { e.getData('aimG')?.destroy(); e.destroy(); }
    s.bolts.clear(true, true);
    s.invulnUntil = 0; // nothing left can hurt him, and an invulnerable hero blinks
    prey.body.reset(256, 226); // below the medallion, out of every lantern's light
    prey.setVelocity(0).setData({ hp: 1, state: 'chase', until: Infinity, facing: Math.PI });
    s.hero.body.reset(prey.x - 45, prey.y - 1);
    s.facing = 0;
    return { x: prey.x, y: prey.y, phase: prey.getData('phase') };
  });
  if (p) {
    await page.waitForFunction((phase) => { const n = (window.game.scene.getScene('room').time.now + phase) % 700; return n > 10 && n < 60; }, p.phase);
    await freeze(true);
    await shot('weak', clip(p.x, p.y - 10, 240, 200));
    await freeze(false);
    const hp = await page.evaluate(({ x, y }) => {
      const s = window.game.scene.getScene('room');
      s.health = 3;
      s.hud.health(3, 5);
      s.hero.body.reset(x - 20, y - 1);
      s.bite(0);
      return s.health;
    }, p);
    await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.time.now - s.biteAt > 300; });
    await freeze(true);
    const latched = await page.evaluate(() => !!window.game.scene.getScene('room').prey);
    if (latched) await shot('bite', clip(p.x - 6, p.y - 8, 240, 200));
    await freeze(false);
    await page.waitForFunction(() => !window.game.scene.getScene('room').prey, null, { timeout: 3000 }).catch(() => {});
    bit = latched && `${hp} -> ${await page.evaluate(() => window.game.scene.getScene('room').health)} blood`;
  }
}

console.log(`captured: ${captured ? 'yes' : 'NO (combat frame missing)'}; light: ${lit ? 'yes' : 'NO'}; crossbow: ${bow ? 'yes' : 'NO'}; bite: ${bit || 'NO'}; state: ${JSON.stringify(await state())}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || !captured || !bow || !bit ? 1 : 0);
