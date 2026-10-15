// Contact sheet of the new hero (the wanderer) moving in the game: idle facing down, running left (scarf streaming),
// stopped (scarf falling back), running up (back view), running down, mid-dash. Writes shots/wanderer.png (crops at x4, labelled).
// Usage: node tools/art/wanderer.check.mjs [--port=5207] [--out=shots]. Exit code 1 on a page error.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const port = Number(arg('port', 5207)), out = arg('out', 'shots');
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero);
await page.keyboard.press('t');
await page.waitForSelector('#training');
await page.click('#training [data-opt="wanderer"]');
await page.waitForFunction(() => window.game.scene.getScene('room').hero?.texture.key === 'wanderer');
await page.evaluate(() => (document.querySelector('#training').hidden = true));
await page.waitForTimeout(1600); // the title card is gone

const freeze = (on) => page.evaluate((on) => (on ? window.game.loop.sleep() : window.game.loop.wake()), on);
const tiles = [];
const snap = async (label) => {
  await freeze(true);
  const { x, y } = await page.evaluate(() => { const h = window.game.scene.getScene('room').hero; return { x: h.x, y: h.y }; });
  const cx = Math.max(25, Math.min(455, x)), cy = Math.max(18, Math.min(252, y - 4));
  tiles.push({ label, png: (await page.screenshot({ clip: { x: (cx - 25) * 4, y: (cy - 18) * 4, width: 200, height: 144 } })).toString('base64') });
  await freeze(false);
};
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); };

await snap('repos, face');
await hold('a', 700);
await snap('course, profil');
await page.keyboard.up('a');
await page.waitForTimeout(250);
await snap('arrêt (0,25 s)');
await page.waitForTimeout(900);
await snap('arrêt (1,1 s)');
await hold('w', 700);
await snap('course, dos');
await page.keyboard.up('w');
await hold('s', 700);
await snap('course, face');
await page.keyboard.press('Space');
await page.waitForTimeout(60);
await snap('brume');
await page.keyboard.up('s');

// The sheet: a plain page of the crops, screenshotted.
const sheet = await browser.newPage({ viewport: { width: 1280, height: 400 } });
await sheet.setContent(`<body style="margin:0;background:#0b0710;color:#e8dcc8;font:16px Georgia,serif;display:flex;flex-wrap:wrap;gap:8px;padding:8px">${tiles
  .map((t) => `<figure style="margin:0"><img src="data:image/png;base64,${t.png}" width="200" height="144" style="display:block;image-rendering:pixelated"><figcaption>${t.label}</figcaption></figure>`)
  .join('')}</body>`);
await sheet.screenshot({ path: `${out}/wanderer.png`, fullPage: true });
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `ok: ${out}/wanderer.png`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
