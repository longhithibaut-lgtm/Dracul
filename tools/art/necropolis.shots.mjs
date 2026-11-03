// Fixed views of la nécropole at 1920x1080, one per named place (tools/art/rooms/necropolis.mjs AREAS), for judging its
// look and its life: opened directly, the hero kept from harm and unseen (no foe hunts him), the camera on a set point.
// Default: its foes put away (the floor, props and light alone): <out>/<view>.png. --life: its foes, patrols, rats, the
// prisoner left where they are and as they go, shot after `wait` ms: <out>/<view>-life.png. Then the headless frame
// rate standing in the camp with its foes (--fps). Exits 1 on a page error.
// Usage: node tools/art/necropolis.shots.mjs [--out=shots/necro --only=camp,breche --life --wait=2500 --fps --port=5212]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/necro');
const port = Number(arg('port', 5212));
const life = process.argv.includes('--life'), wait = Number(arg('wait', 2500));
// view: the hero's feet, the camera's middle (room px)
const VIEWS = {
  parvis: [[230, 150], [250, 170]], caveaux: [[960, 330], [980, 320]], champ: [[560, 900], [560, 900]], pont: [[1300, 1168], [1400, 1150]],
  chaussee: [[1290, 236], [1380, 240]], fosses: [[2150, 640], [2180, 540]], allee: [[1960, 1050], [1980, 1010]], breche: [[2520, 380], [2640, 370]],
  postes: [[2880, 470], [2900, 420]], camp: [[3060, 930], [3150, 870]], buchers: [[2780, 1080], [2800, 980]], chapelle: [[3560, 380], [3540, 380]],
  puits: [[3600, 1100], [3590, 1110]],
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
const arrived = (layout) => page.waitForFunction((l) => { const s = window.game.scene.getScene('room'); return s.layout === l && s.sys.isActive() && s.phase === 'play'; }, layout, { timeout: 180000 });

await page.goto(`http://localhost:${port}/`);
await arrived('refuge');
await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'necropolis' }));
await arrived('necropolis');
await run((life) => {
  const s = window.game.scene.getScene('room');
  s.invulnUntil = Infinity;
  s.hunts = () => false; // he walks unseen: what lives there goes on as if he were not
  if (!life) for (const e of s.enemies.getChildren()) e.disableBody(true, true);
}, life);
for (const [name, [[hx, hy], [cx, cy]]] of Object.entries(VIEWS).filter(([n]) => !arg('only', '') || arg('only', '').split(',').includes(n))) {
  await run(([hx, hy, cx, cy]) => {
    const s = window.game.scene.getScene('room');
    s.hero.body.reset(hx, hy);
    const c = s.cameras.main; c.stopFollow(); c.centerOn(cx, cy);
  }, [hx, hy, cx, cy]);
  // its chunks under the view in, then their light read back
  await page.waitForFunction(([cx, cy]) => { const z = window.game.scene.getScene('room').room.zone, sh = z.chunks.shown;
    for (const x of [cx - 240, cx + 239]) for (const y of [cy - 135, cy + 134]) if (!sh.has(Math.floor(y / 270) * 8 + Math.floor(x / 480))) return false; return true; }, [cx, cy], { timeout: 180000 })
    .catch(async (e) => { console.log(await run(() => { const s = window.game.scene.getScene('room'), v = s.cameras.main.worldView; return JSON.stringify({ l: s.layout, v: [v.x, v.y], shown: [...s.room.zone.chunks.shown.keys()] }); })); throw e; });
  await page.waitForTimeout(life ? wait : 2500);
  await run(() => window.game.loop.sleep());
  await page.screenshot({ path: `${out}/${name}${life ? '-life' : ''}.png` });
  await run(() => window.game.loop.wake());
}
if (process.argv.includes('--fps')) {
  await run(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(3100, 960); const c = s.cameras.main; c.stopFollow(); c.centerOn(3150, 870); });
  await page.waitForTimeout(3000);
  const fps = await run(() => new Promise((done) => { const f0 = window.game.loop.frame, t0 = performance.now(); setTimeout(() => done(((window.game.loop.frame - f0) * 1000) / (performance.now() - t0)), 3000); }));
  console.log(`headless fps in the camp (${life ? 'its foes there' : 'no foes'}): ${fps.toFixed(1)}`);
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
