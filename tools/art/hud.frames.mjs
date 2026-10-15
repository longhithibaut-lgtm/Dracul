// Steps the game by hand and films the HUD corner through its animations: losing drops, dash refill, regaining, restart.
// Usage: node tools/art/hud.frames.mjs --out=<dir> [--port=5206]. Writes <dir>/hud-<case>-<ms>.png (400x120 = 100x30 native).
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots');
const port = Number(arg('port', 5206));

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await page.waitForTimeout(1500);
await page.evaluate(() => window.game.loop.sleep());

// Runs `act` in the page at time t0, then captures the HUD at each offset (ms) by stepping the loop by hand.
async function film(name, act, offsets) {
  await page.evaluate((act) => {
    const g = window.game, s = g.scene.getScene('room');
    window.t0 = g.loop.lastTime + 16;
    g.loop.step(window.t0);
    new Function('s', 't0', act)(s, window.t0);
  }, act);
  for (const ms of offsets) {
    await page.evaluate((ms) => {
      const g = window.game;
      for (let t = g.loop.lastTime + 16; t < window.t0 + ms; t += 16) g.loop.step(t);
      g.loop.step(window.t0 + ms);
    }, ms);
    await page.screenshot({ path: `${out}/hud-${name}-${String(ms).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 400, height: 120 } });
  }
}

const hurt = 's.health -= 1; s.hud.health(s.health, 5);';
// Same state as scripts/shot.mjs's hud.png: 3/5 health, then 200 ms after a dash.
await film('pre', 's.health = 3; s.hud.health(3, 5);', [900]);
await film('shot', 's.dashUntil = t0 + 130; s.dashReadyAt = t0 + 510;', [200]);
await film('heal0', 's.health = 5; s.hud.health(5, 5);', [600]);
await film('hit', hurt, [0, 30, 70, 110, 150, 190, 240, 300, 380, 460, 560, 700]);
await film('dash', 's.dashUntil = t0 + 130; s.dashReadyAt = t0 + 510;', [0, 100, 250, 400, 505, 530, 560, 650]);
await film('low', `${hurt} ${hurt} ${hurt}`, Array.from({ length: 24 }, (_, i) => 700 + i * 50));
await film('heal', 's.health = 5; s.hud.health(5, 5);', [0, 50, 100, 150, 200, 300, 400]);
await film('restart', 's.scene.restart();', [50, 150, 250, 400, 600]);

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
