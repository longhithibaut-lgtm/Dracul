// Plays the game in headless Chromium with a crude bot and saves screenshots to shots/.
// Usage: npm run shot   (exit code 1 if the page logged an error)
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
// SwiftShader gives WebGL without a GPU (cloud containers); harmless on a desktop.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); // 1:1 with game pixels
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const state = () => page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  const live = s.ghouls.getChildren().filter((g) => g.body?.enable);
  return { room: s.room, blood: s.blood, dead: s.dead, px: s.player.x, py: s.player.y, ghouls: live.map((g) => ({ x: g.x, y: g.y, st: g.getData('state') })) };
});
const shot = (name) => page.screenshot({ path: `shots/${name}.png` });

// Walk toward (x, y) for `ms` milliseconds.
async function walk(s, x, y, ms) {
  const keys = [];
  if (x > s.px + 8) keys.push('d'); else if (x < s.px - 8) keys.push('a');
  if (y > s.py + 8) keys.push('s'); else if (y < s.py - 8) keys.push('w');
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

await mkdir('shots', { recursive: true });
await page.goto('http://localhost:5199/');
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await shot('1-start');
await page.waitForTimeout(1400);
await shot('2-spawn');

let combatShot = false;
let dodges = 0;
for (let i = 0; i < 200; i++) {
  const s = await state();
  if (s.dead || s.room > 2) break;
  if (!s.ghouls.length) { await walk(s, 480, 30, 200); continue; } // head for the door
  const dist = (g) => Math.hypot(g.x - s.px, g.y - s.py);
  const threat = s.ghouls.find((g) => g.st === 'windup' && dist(g) < 110);
  if (threat) { // dodge: mist away from the ghoul that is winding up
    const keys = [s.px < threat.x ? 'a' : 'd', s.py < threat.y ? 'w' : 's'];
    for (const k of keys) await page.keyboard.down(k);
    await page.keyboard.press('Space');
    for (const k of keys) await page.keyboard.up(k);
    dodges++;
    continue;
  }
  const g = s.ghouls.reduce((a, b) => (dist(a) < dist(b) ? a : b));
  const d = dist(g);
  if (d > 60) await walk(s, g.x, g.y, 120);
  await page.mouse.click(g.x, g.y, { button: d < 44 ? 'right' : 'left' });
  if (!combatShot && d < 70) { combatShot = true; await page.waitForTimeout(30); await shot('3-combat'); }
  await page.waitForTimeout(60);
}
console.log('dodges:', dodges);
await page.waitForTimeout(700);
await shot('4-end');

console.log('state:', JSON.stringify(await state()));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
