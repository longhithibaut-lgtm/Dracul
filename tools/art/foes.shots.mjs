// The Purificateur and the Prêtre (src/foes.ts) in the torture room, in headless Chromium at 1920x1080 (the PC target),
// called in from the training room: each idle, telegraphing and attacking (crops round them, x2 of the screen's pixels
// kept; the jet aimed off the eight views), the Purificateur walking and struck, weakened, killed, a full frame of both;
// the bot playing each attack, standing still (it must burn) and stepping out when the telegraph shows, after a
// human's reaction time, at the hero's speed (it must miss); and the frame rate with neither, then with both fighting.
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
page.setDefaultTimeout(180000); // a screenshot waits for every frame stepped by hand to be drawn (software GL: slow)
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
await hero(at.x + 28, at.y + 14); // down and to his right, between two of his views
await set('purifier', { readyAt: 0, state: 'chase', until: 0 });
await step(450);
await crop('purifier', 'purifier-telegraph', 640, 420);
await step(450);
await crop('purifier', 'purifier-attack', 640, 420);
await hold();
await step(1200);
// Walking up to a hero out of reach (his steps follow the floor he covers), then struck by a claw (no damage).
await hero(at.x + 130, at.y - 20);
for (const k of [0, 1, 2]) { await step(110); await crop('purifier', `purifier-walk${k}`, 360, 320); await crop('priest', `priest-walk${k}`, 360, 360); }
await run(`(() => { const s = window.game.scene.getScene('room'), e = ${foe('purifier')}; s.hitEnemy(e, 0, 0, 140, 0); })()`);
await step(60);
await crop('purifier', 'purifier-hurt', 360, 320);
await step(600);

// The Prêtre: the hero within his sight, the circle filling under him, then the light falling.
at = await run(`(() => { const e = ${foe('priest')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 70, at.y + 30);
await set('priest', { readyAt: 0, state: 'chase', until: 0 });
await step(700);
await page.screenshot({ path: `${out}/foes-priest-telegraph-full.png` });
await crop('priest', 'priest-telegraph', 760, 440, -10);
await step(550);
await crop('priest', 'priest-attack', 760, 440, -10);

// The bot plays each attack, the hero mortal: standing still, then stepping out once the telegraph shows (after
// REACT ms, holding a key: the hero walks at T.grand.speed).
const REACT = 300;
await run(() => document.querySelector('[data-opt="god"]').click());
async function play(kind, dx, dy, key) {
  await hold();
  await step(200);
  const p = await run(`(() => { const s = window.game.scene.getScene('room'), e = ${foe(kind)}; s.health = 5; s.invulnUntil = 0; for (const o of s.enemies.getChildren()) o.setData({ state: 'chase', until: 0 }); return { x: e.x, y: e.y }; })()`);
  await hero(p.x + dx, p.y + dy);
  await set(kind, { readyAt: 0 });
  const state = () => run(`${foe(kind)}.getData('state')`);
  for (let t = 0; t < 1500 && !['ignite', 'pray'].includes(await state()); t += 16) await step(16);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = 0; t < 2500 && ['ignite', 'fire', 'pray'].includes(await state()); t += 16) await step(16);
  if (key) await page.keyboard.up(key);
  return 5 - (await run(() => window.game.scene.getScene('room').health));
}
const fights = {
  'Purificateur, immobile': await play('purifier', 28, 4), 'Purificateur, pas de côté': await play('purifier', 28, 4, 's'),
  'Prêtre, immobile': await play('priest', -90, 30), 'Prêtre, sort du cercle': await play('priest', -90, 30, 'a'),
};
await run(() => document.querySelector('[data-opt="god"]').click());
const fair = fights['Purificateur, immobile'] > 0 && fights['Prêtre, immobile'] > 0 && !fights['Purificateur, pas de côté'] && !fights['Prêtre, sort du cercle'];
if (!fair) errors.push(`unfair or toothless attacks: ${JSON.stringify(fights)}`);
console.log('blood lost:', JSON.stringify(fights));

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
