// Fixed views of les catacombes at 1920x1080 for judging their floor: opened directly, its foes put away, the hero
// (his lantern) standing in each place, the camera on a set point. Writes <out>/<view>.png and <out>/<view>-crop.png
// (a 480x270 screen px crop round the hero's feet, at native pixels), exits 1 on a page error.
// Usage: node tools/art/catacombs.shots.mjs [--out=shots/cata-views --port=5211]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/cata-views');
const port = Number(arg('port', 5211));
// view: the hero's feet, the camera's middle (room px)
const VIEWS = {
  galerie: [[1880, 186], [1880, 230]], croisee: [[1430, 340], [1400, 320]], boyau: [[700, 250], [700, 250]], nid: [[560, 690], [610, 640]],
  lac: [[1440, 600], [1530, 630]], prison: [[2300, 800], [2360, 800]], puits: [[2560, 236], [2600, 210]],
};

const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const arrived = (layout) => page.waitForFunction((l) => { const s = window.game.scene.getScene('room'); return s.layout === l && s.sys.isActive() && s.phase === 'play'; }, layout, { timeout: 20000 });

await page.goto(`http://localhost:${port}/`);
await arrived('refuge');
await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'catacombs' }));
await arrived('catacombs');
for (const [name, [[hx, hy], [cx, cy]]] of Object.entries(VIEWS).filter(([n]) => !arg('only', '') || arg('only', '').split(',').includes(n))) {
  await run(([hx, hy, cx, cy]) => {
    const s = window.game.scene.getScene('room');
    s.invulnUntil = Infinity;
    for (const e of s.enemies.getChildren()) e.disableBody(true, true);
    s.hero.body.reset(hx, hy);
    const c = s.cameras.main; c.stopFollow(); c.centerOn(cx, cy);
  }, [hx, hy, cx, cy]);
  // its chunks under the view in, then their light read back
  await page.waitForFunction(([cx, cy]) => { const z = window.game.scene.getScene('room').room.zone, sh = z.chunks.shown;
    for (const x of [cx - 240, cx + 239]) for (const y of [cy - 135, cy + 134]) if (!sh.has(Math.floor(y / 270) * 6 + Math.floor(x / 480))) return false; return true; }, [cx, cy], { timeout: 30000 });
  await page.waitForTimeout(3000);
  await run(() => window.game.loop.sleep());
  await page.screenshot({ path: `${out}/${name}.png` });
  const sx = 960 + (hx - cx) * 4, sy = 540 + (hy - cy) * 4;
  await page.screenshot({ path: `${out}/${name}-crop.png`, clip: { x: Math.max(0, Math.min(1440, sx - 240)), y: Math.max(0, Math.min(810, sy - 135)), width: 480, height: 270 } });
  await run(() => window.game.loop.wake());
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
