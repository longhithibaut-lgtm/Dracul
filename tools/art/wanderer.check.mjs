// Contact sheet of the new hero (the wanderer) moving in the game: idle facing down, running left (scarf streaming),
// stopped (scarf falling back), running up (back view), running down, mid-dash: shots/wanderer.png (crops at x4, labelled).
// Then a filmstrip of each view's run cycle, every frame in order: shots/walk.png. --old does the same for the old hero
// (wanderer-old.png, walk-old.png), to compare. Usage: node tools/art/wanderer.check.mjs [--old] [--port=5207] [--out=shots].
// Exit code 1 on a page error.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const port = Number(arg('port', 5207)), out = arg('out', 'shots'), old = process.argv.includes('--old'), tag = old ? '-old' : '';
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
if (!old) {
  await page.click('#training [data-opt="wanderer"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').hero?.texture.key === 'wanderer');
}
await page.evaluate(() => (document.querySelector('#training').hidden = true));
await page.waitForTimeout(1600); // the title card is gone

let tiles = [];
// Each shot pauses the room scene, not the game loop: a slept loop wakes with a long frame the hero catches up in one
// step, which the scarf would take for a lash.
const snap = async (label) => {
  const { x, y } = await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.scene.pause(); return { x: s.hero.x, y: s.hero.y }; });
  await page.waitForTimeout(50); // a render of the paused frame
  const cx = Math.max(25, Math.min(455, x)), cy = Math.max(18, Math.min(252, y - 4));
  tiles.push({ label, png: (await page.screenshot({ clip: { x: (cx - 25) * 4, y: (cy - 18) * 4, width: 200, height: 144 } })).toString('base64') });
  await page.evaluate(() => window.game.scene.getScene('room').scene.resume());
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

// A sheet: a plain page of the crops, screenshotted.
const sheet = await browser.newPage({ viewport: { width: 1700, height: 400 } });
const save = async (name, rows) => {
  await sheet.setContent(`<body style="margin:0;background:#0b0710;color:#e8dcc8;font:16px Georgia,serif;padding:8px;display:grid;gap:8px">${rows
    .map((row) => `<div style="display:flex;flex-wrap:wrap;gap:8px">${row.map((t) => `<figure style="margin:0"><img src="data:image/png;base64,${t.png}" width="200" height="144" style="display:block;image-rendering:pixelated"><figcaption>${t.label}</figcaption></figure>`).join('')}</div>`)
    .join('')}</body>`);
  await sheet.screenshot({ path: `${out}/${name}${tag}.png`, fullPage: true });
};
await save('wanderer', [tiles]);

// Filmstrip: from the middle of the room, each view's run cycle, one crop per frame shown, until a frame comes back.
const strips = [];
for (const [key, label] of [['a', 'profil'], ['s', 'face'], ['w', 'dos']]) {
  await page.evaluate(() => window.game.scene.getScene('room').hero.body.reset(300, 150));
  await page.waitForTimeout(400);
  tiles = [];
  const seen = [];
  await page.keyboard.down(key);
  for (;;) {
    const name = await page.waitForFunction((seen) => { const f = window.game.scene.getScene('room').hero.frame.name; return f.includes('-run') && f !== seen.at(-1) && f; }, seen, { timeout: 3000 }).then((h) => h.jsonValue(), () => null);
    if (!name || seen.includes(name)) break;
    seen.push(name);
    await snap(`${label} ${name.split('-run')[1]}`);
    await page.keyboard.up(key); // a paused scene lets go of held keys: press it again
    await page.keyboard.down(key);
  }
  await page.keyboard.up(key);
  strips.push(tiles);
}
await save('walk', strips);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `ok: ${out}/wanderer${tag}.png, ${out}/walk${tag}.png`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
