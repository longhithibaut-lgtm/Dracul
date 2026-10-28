// Le Rongé (src/ronge.ts) on the basin's rim, in headless Chromium on a 1920x1080 PC screen, framed as
// docs/maquettes/ronge-1-bassin-scene.png: idle (the hero far), leaning to speak (the hero come up to him), his wares
// open (F), then gone beast (back too many times without pouring). Writes <out>/<what>.png.
// Usage: node tools/art/ronge.shots.mjs [--out=shots/ronge --port=5211] (exit code 1 on a page error or a wrong state).
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/ronge'), port = Number(arg('port', 5211));
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
const run = (f, a) => page.evaluate(f, a);
const shot = (what) => page.screenshot({ path: `${out}/${what}.png` });
const ready = async () => {
  await page.waitForFunction(() => { const s = window.game?.scene.getScene('room'); return s?.layout === 'refuge' && s.sys.isActive() && s.phase === 'play'; }, null, { timeout: 90000 });
  await page.waitForTimeout(1200); // its fade in
};
// The hero at (x, y), the camera on the basin, the hero and him (the mockup's framing); then what pose he shows.
const at = async (x, y) => {
  await run(([x, y]) => {
    const s = window.game.scene.getScene('room');
    s.hero.body.reset(x, y);
    s.cameras.main.stopFollow().centerOn(872, 640);
  }, [x, y]);
  await page.waitForTimeout(700);
  return run(() => window.game.scene.getScene('room').ronge && window.game.scene.getScene('room').children.list.find((c) => c.texture?.key === 'ronge')?.frame.name);
};
const save = (o) => run((o) => localStorage.setItem('dracul.save', JSON.stringify({ ...JSON.parse(localStorage.getItem('dracul.save') ?? '{}'), ...o })), o);
const want = (got, pose) => got?.startsWith(pose) || errors.push(`expected him ${pose}, got ${got}`);

await page.goto(`http://localhost:${port}/`);
await ready();
await save({ banked: 200, dry: 0 });
await page.reload();
await ready();
want(await at(960, 730), 'idle');
await shot('idle');
want(await at(866, 670), 'look');
await shot('look');
await page.keyboard.press('f');
await page.waitForTimeout(400);
if (!(await run(() => !!window.game.scene.getScene('room').counter))) errors.push('F by him: his wares did not open');
await shot('shop');
await page.keyboard.press('Escape');
await save({ dry: 99 });
await page.reload();
await ready();
want(await at(866, 670), 'beast');
await shot('beast');

await browser.close();
await server.close();
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `ok: ${out}/idle, look, shop, beast`);
process.exit(errors.length ? 1 : 0);
