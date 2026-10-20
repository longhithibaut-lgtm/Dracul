// The refuge (src/refuge.ts) in headless Chromium on a 1920x1080 PC screen: the game's first frame (the hero by his
// coffin), the mockup's two in-game frames (the crypt, the great hall round the basin, refuge2-*-ecran.png framing),
// the hero hidden by what stands in front of him (a chief's coffin, the hall's wall over the corridor), the stairs, the frame rate with the light shader on and off, then down the stairs into room 1 and, dying there, back
// at the coffin. Writes <out>/<what>.png. Usage: node tools/art/refuge.shots.mjs [--out=shots/refuge --port=5209]
// (exit code 1 on a page error or a wrong room).
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/refuge');
const port = Number(arg('port', 5209));

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const shot = async (what) => {
  await run(() => window.game.loop.sleep());
  await page.screenshot({ path: `${out}/${what}.png` });
  await run(() => window.game.loop.wake());
};
const layout = () => run(() => window.game.scene.getScene('room').layout);
// The hero put at a room point, the camera held on the room point (x, y) at the screen's top left (the mockup's frames).
const frame = (hx, hy, x, y) => run(([hx, hy, x, y]) => {
  const s = window.game.scene.getScene('room');
  s.hero.body.reset(hx, hy);
  s.cameras.main.stopFollow().setScroll(x - s.cameras.main.width / 2 + s.cameras.main.worldView.width / 2, y - s.cameras.main.height / 2 + s.cameras.main.worldView.height / 2);
}, [hx, hy, x, y]);

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body && window.game.scene.isActive('room'));
if ((await layout()) !== 'refuge') errors.push(`the game starts in ${await layout()}, not the refuge`);
await page.waitForTimeout(1200); // its fade in
await shot('start');
for (const k of [0, 1, 2]) { // walking down from the coffin, a frame every 130 ms
  if (k === 0) await page.keyboard.down('s');
  await page.waitForTimeout(130);
  if (k === 2) await shot('walk');
}
await page.keyboard.up('s');
await frame(874, 267, 745, 145); // refuge2-crypte-ecran.png's frame
await page.waitForTimeout(300);
await shot('crypt');
await frame(950, 650, 705, 510); // refuge2-grande-salle-ecran.png's frame
await page.waitForTimeout(300);
await shot('hall');
// What stands in front of him hides him: behind a chief's coffin, then up the corridor under the great hall's wall.
await frame(705, 272, 705 - 240, 272 - 135);
await page.waitForTimeout(300);
await shot('behind-coffin');
await frame(840, 455, 840 - 240, 455 - 135);
await page.waitForTimeout(300);
await shot('behind-wall');
await frame(840, 800, 600, 640); // the stairs
await page.waitForTimeout(300);
await shot('stairs');
await run(() => window.game.scene.getScene('room').cameras.main.startFollow(window.game.scene.getScene('room').hero, true));
const fps = async () => {
  await page.waitForTimeout(800);
  return run(() => new Promise((done) => {
    let n = 0;
    const t0 = performance.now(), tick = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : done(Math.round((n * 1000) / (performance.now() - t0))));
    requestAnimationFrame(tick);
  }));
};
const on = await fps();
await run(() => { for (const f of window.game.scene.getScene('room').cameras.main.filters.internal.list) f.setActive(false); });
const off = await fps();
await shot('unlit');
console.log(`view ${await run(() => `${window.game.scale.width}x${window.game.scale.height}`)}, ${on} fps lit, ${off} fps unlit`);
// Down the stairs: room 1 of a run.
await run(() => { const s = window.game.scene.getScene('room'); for (const f of s.cameras.main.filters.internal.list) f.setActive(true); s.hero.body.reset(840, 820); });
await page.keyboard.down('s');
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'hall' && window.game.scene.getScene('room').hero?.body, null, { timeout: 15000 }).catch(() => {});
await page.keyboard.up('s');
if ((await layout()) !== 'hall') errors.push(`the stairs lead to ${await layout()}, not the crypt`);
await page.waitForTimeout(600);
await shot('run');
// Killed there: back in the refuge, by the coffin.
await run(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = s.dashUntil = 0; s.damageHero(99); });
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'refuge' && window.game.scene.getScene('room').hero?.body, null, { timeout: 15000 }).catch(() => {});
if ((await layout()) !== 'refuge') errors.push(`a death leads to ${await layout()}, not the refuge`);
await page.waitForTimeout(1200);
await shot('reformed');
// The training room's panel lists it.
await page.keyboard.press('t');
await page.waitForSelector('#training [data-layout="refuge"]');
await page.click('#training [data-layout="refuge"]');
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'refuge' && window.game.scene.getScene('room').hero?.body);
await page.waitForTimeout(800);
await shot('training');

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
