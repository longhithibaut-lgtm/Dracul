// The Purificateur and the Prêtre (src/foes.ts) in the torture room, in headless Chromium at 1920x1080 (the PC target),
// called in from the training room: each idle, telegraphing and attacking (crops round them, x2 of the screen's pixels
// kept), weakened, killed, a full frame of both; and the frame rate with neither, then with both fighting.
// Writes <out>/foes-<what>.png. Usage: node tools/art/foes.shots.mjs [--out=shots --port=5209 --layout=torture]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots'), port = Number(arg('port', 5209)), layout = arg('layout', 'torture');
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await mkdir(out, { recursive: true });
const run = (f, a) => page.evaluate(f, a);

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run((layout) => window.game.scene.getScene('room').scene.restart({ training: true, layout }), layout);
await page.waitForFunction((layout) => window.game.scene.getScene('room').layout === layout && window.game.scene.getScene('room').hero?.body, layout);
await page.click('#training summary'); // folded, out of the picture
const fps = async () => {
  await page.waitForTimeout(800);
  return run(() => new Promise((done) => {
    let n = 0;
    const t0 = performance.now(), tick = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : done(Math.round((n * 1000) / (performance.now() - t0))));
    requestAnimationFrame(tick);
  }));
};
const empty = await fps();

// Both called in, the hero between them, then the game stepped by hand at 60 fps (headless it runs at a few fps).
await run(() => {
  const s = window.game.scene.getScene('room');
  s.hero.body.reset(240, 330);
  s.spawn({ x: 180, y: 300 }, 'purifier');
  s.spawn({ x: 330, y: 270 }, 'priest');
});
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().length === 2);
const both = await fps(); // fighting the hero
await run(() => window.game.loop.sleep());
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
await step(1600);
const foe = (kind) => `window.game.scene.getScene('room').enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === '${kind}')`;
// Holds them where they stand, not attacking, facing the hero.
const hold = () => run(() => { for (const e of window.game.scene.getScene('room').enemies.getChildren()) e.setData({ readyAt: Infinity }); });
const crop = async (kind, what, w = 520, h = 400, dy = -30) => {
  const { x, y } = await run(`(() => { const e = ${foe(kind)}, c = window.game.scene.getScene('room').cameras.main, k = 1920 / c.worldView.width; return { x: (e.x - c.worldView.x) * k, y: (e.y - c.worldView.y) * k }; })()`);
  await page.screenshot({ path: `${out}/foes-${what}.png`, clip: { x: Math.min(Math.max(0, x - w / 2), 1920 - w), y: Math.min(Math.max(0, y - h / 2 + dy * 4), 1080 - h), width: w, height: h } });
};
const set = (kind, data) => run(`(() => { const e = ${foe(kind)}; e.setData(${JSON.stringify(data)}); e.setVelocity(0); })()`);
const hero = (x, y) => run(([x, y]) => { const s = window.game.scene.getScene('room'); s.hero.body.reset(x, y); s.cameras.main.centerOn(x, y); }, [x, y]);

await hold();
// Back where they were called in, standing, the hero between them.
await run(() => {
  const s = window.game.scene.getScene('room');
  s.hero.body.reset(240, 330);
  s.cameras.main.centerOn(240, 330);
  for (const e of s.enemies.getChildren()) e.body.reset(...(e.getData('kind') === 'purifier' ? [180, 300] : [330, 270])), e.setData({ state: 'chase', until: 0 });
});
for (let i = 0; i < 20; i++) { await run(() => { for (const e of window.game.scene.getScene('room').enemies.getChildren()) e.body?.velocity.set(0); }); await step(16); }
await page.screenshot({ path: `${out}/foes-room.png` });
await crop('purifier', 'purifier-idle');
await crop('priest', 'priest-idle');

// The Purificateur: the hero in reach to his right; he ignites, then burns.
let at = await run(`(() => { const e = ${foe('purifier')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x + 34, at.y + 2);
await set('purifier', { readyAt: 0, state: 'chase', until: 0 });
await step(450);
await crop('purifier', 'purifier-telegraph', 640, 420);
await step(450);
await crop('purifier', 'purifier-attack', 640, 420);
await hold();
await step(1200);

// The Prêtre: the hero within his sight, the circle filling under him, then the light falling.
at = await run(`(() => { const e = ${foe('priest')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 70, at.y + 30);
await set('priest', { readyAt: 0, state: 'chase', until: 0 });
await step(700);
await page.screenshot({ path: `${out}/foes-priest-telegraph-full.png` });
await crop('priest', 'priest-telegraph', 760, 440, -10);
await step(550);
await crop('priest', 'priest-attack', 760, 440, -10);

// Weakened (kneeling, the heartbeat drop), and killed (a corpse in its blood).
await hold();
await run(`(() => { const s = window.game.scene.getScene('room'); s.hurtEnemy(${foe('purifier')}, 2); s.kill(${foe('priest')}); })()`);
await step(300);
await crop('purifier', 'purifier-weak');
await step(900);
await page.screenshot({ path: `${out}/foes-dead.png` });
await run(() => window.game.loop.wake());
const after = await fps();
console.log(`${layout}: ${empty} fps empty, ${both} fps with both fighting, ${after} fps after the captures`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
