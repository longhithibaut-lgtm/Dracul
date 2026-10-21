// The Order's foes of the « grand pixel » rooms (src/foes.ts: Purificateur, Prêtre, Chien de chasse, Pénitent) in the
// torture room, in headless Chromium at 1920x1080 (the PC target), called in from the training room: each idle, giving
// its tell and attacking (crops round them, x2 of the screen's pixels kept), walking and struck, weakened, killed, full
// frames of them; the bot playing each attack (the crossbowman's too), standing still (it must land) and stepping out
// REACT ms after the tell starts, at the hero's speed (it must miss): nothing on the floor tells it, the bot only knows
// the state, as a player knows the pose; and the frame rate empty, with the hound pack and six pénitents fighting.
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
const count = () => run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable).length);
const empty = await fps();

// The hound pack and a wave of six pénitents, called in by their buttons, fighting the (invincible) hero.
await run(() => { for (const s of ['hounds', 'penitents']) document.querySelector(`[data-spawn="${s}"]`).click(); });
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().length === 9);
const crowd = await fps();
await page.screenshot({ path: `${out}/foes-crowd-live.png` });

// From here the game is stepped by hand at 60 fps (headless it runs at a few fps).
await run(() => window.game.loop.sleep());
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const S = `window.game.scene.getScene('room')`;
const foe = (kind) => `${S}.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === '${kind}')`;
await step(1500);
await page.screenshot({ path: `${out}/foes-crowd.png` });

// Holds them where they stand, not attacking, facing the hero.
const hold = () => run(() => { for (const e of window.game.scene.getScene('room').enemies.getChildren()) e.setData({ readyAt: Infinity }); });
const crop = async (kind, what, w = 520, h = 400, dy = -30) => {
  const { x, y } = await run(`(() => { const e = ${foe(kind)}, c = ${S}.cameras.main, k = 1920 / c.worldView.width; return { x: (e.x - c.worldView.x) * k, y: (e.y - c.worldView.y) * k }; })()`);
  await page.screenshot({ path: `${out}/foes-${what}.png`, clip: { x: Math.min(Math.max(0, x - w / 2), 1920 - w), y: Math.min(Math.max(0, y - h / 2 + dy * 4), 1080 - h), width: w, height: h } });
};
const set = (kind, data) => run(`(() => { const e = ${foe(kind)}; e.setData(${JSON.stringify(data)}); e.setVelocity(0); })()`);
const hero = (x, y) => run(([x, y]) => { const s = window.game.scene.getScene('room'); s.hero.body.reset(x, y); s.cameras.main.centerOn(x, y); }, [x, y]);
const clear = async () => { await run(`${S}.enemies.getChildren().forEach((e) => ${S}.kill(e))`); await step(1600); };
// Calls foes in at room points, waits for them to rise, holds them there facing the hero.
const call = async (list) => {
  await run((list) => { const s = window.game.scene.getScene('room'); for (const [k, x, y] of list) s.spawn({ x, y }, k); }, list);
  await step(900);
  await hold();
  await run((list) => {
    const s = window.game.scene.getScene('room'), es = s.enemies.getChildren().filter((e) => e.body?.enable);
    es.forEach((e, i) => { e.body.reset(list[i][1], list[i][2]); e.setData({ state: 'chase', until: 0 }); });
  }, list);
};
const still = async () => { for (let i = 0; i < 20; i++) { await run(() => { for (const e of window.game.scene.getScene('room').enemies.getChildren()) e.body?.velocity.set(0); }); await step(16); } };

// The pack and the wave held round the hero: a full frame to look at against the sheet.
await hold();
await still();
await page.screenshot({ path: `${out}/foes-crowd-held.png` });
await crop('hound', 'hound-idle', 360, 300, -10);
await crop('penitent', 'penitent-idle', 360, 400);
await clear();

// The Purificateur and the Prêtre, the hero between them.
await hero(240, 330);
await call([['purifier', 180, 300], ['priest', 330, 270]]);
await still();
await page.screenshot({ path: `${out}/foes-room.png` });
await crop('purifier', 'purifier-idle');
await crop('priest', 'priest-idle');
let at = await run(`(() => { const e = ${foe('purifier')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x + 28, at.y + 14);
await set('purifier', { readyAt: 0, state: 'chase', until: 0 });
await step(450);
await crop('purifier', 'purifier-tell', 640, 420);
await step(450);
await crop('purifier', 'purifier-attack', 640, 420);
await hold();
await step(1200);
await hero(at.x + 130, at.y - 20);
for (const k of [0, 1, 2]) { await step(110); await crop('purifier', `purifier-walk${k}`, 360, 320); await crop('priest', `priest-walk${k}`, 360, 360); }
await run(`${S}.hitEnemy(${foe('purifier')}, 0, 0, 140, 0)`);
await step(60);
await crop('purifier', 'purifier-hurt', 360, 320);
await step(600);
at = await run(`(() => { const e = ${foe('priest')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 70, at.y + 30);
await set('priest', { readyAt: 0, state: 'chase', until: 0 });
await step(700);
await page.screenshot({ path: `${out}/foes-priest-tell-full.png` });
await crop('priest', 'priest-tell', 760, 440, -10);
await step(550);
await crop('priest', 'priest-attack', 760, 440, -10);
await run(`(() => { ${S}.hurtEnemy(${foe('purifier')}, 2); })()`);
await step(300);
await crop('purifier', 'purifier-weak');
await clear();

// The hound: trotting, flattened, leaping, struck. The pénitent: dragging his cross, the scourge cocked, the lash.
await hero(240, 330);
await call([['hound', 150, 330], ['penitent', 320, 330]]);
await hero(240, 250);
for (const k of [0, 1, 2]) { await step(90); await crop('hound', `hound-walk${k}`, 360, 300, -10); await crop('penitent', `penitent-walk${k}`, 360, 400); }
await hold();
at = await run(`(() => { const e = ${foe('hound')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x + 50, at.y + 8);
await set('hound', { readyAt: 0, state: 'chase', until: 0 });
await step(300);
await crop('hound', 'hound-tell', 520, 360, -10);
await step(300);
await crop('hound', 'hound-attack', 640, 360, -10);
await hold();
await step(1200);
at = await run(`(() => { const e = ${foe('penitent')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 26, at.y + 6);
await set('penitent', { readyAt: 0, state: 'chase', until: 0 });
await step(400);
await crop('penitent', 'penitent-tell', 520, 420);
await step(300);
await crop('penitent', 'penitent-attack', 520, 420);
await hold();
await step(800);
await run(`${S}.hitEnemy(${foe('hound')}, 0, 0, 140, 0)`);
await step(60);
await crop('hound', 'hound-hurt', 360, 300, -10);
await run(`${S}.hitEnemy(${foe('penitent')}, Math.PI, 1, 140, 0)`);
await step(300);
await crop('penitent', 'penitent-weak', 360, 400);
await step(900);
await run(`(() => { ${S}.kill(${foe('hound')}); ${S}.kill(${foe('penitent')}); })()`);
await step(1500);
await page.screenshot({ path: `${out}/foes-dead.png` });
await clear();

// The bot plays each attack, the hero mortal and alone with the foe: standing still, then stepping out REACT ms after
// the tell starts (holding a key: the hero walks at T.grand.speed).
const REACT = 300;
await run(() => document.querySelector('[data-opt="god"]').click());
async function play(kind, dx, dy, key, tell, attack) {
  await clear();
  await hero(240, 330);
  await call([[kind, 240 - dx, 330 - dy]]);
  await still();
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 5; s.invulnUntil = 0; });
  await set(kind, { readyAt: 0 });
  const state = () => run(`${foe(kind)}.getData('state')`);
  for (let t = 0; t < 2000 && (await state()) !== tell; t += 16) await step(16);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = 0; t < 2500 && [tell, ...attack].includes(await state()); t += 16) await step(16);
  await step(700); // a bolt still in flight
  if (key) await page.keyboard.up(key);
  return 5 - (await run(() => window.game.scene.getScene('room').health));
}
const fights = {
  'Purificateur, immobile': await play('purifier', 28, 4, null, 'ignite', ['fire']), 'Purificateur, pas de côté': await play('purifier', 28, 4, 's', 'ignite', ['fire']),
  'Prêtre, immobile': await play('priest', -90, 30, null, 'pray', []), 'Prêtre, s\'écarte': await play('priest', -90, 30, 'a', 'pray', []),
  'Arbalétrier, immobile': await play('crossbow', 100, 0, null, 'aim', []), 'Arbalétrier, pas de côté': await play('crossbow', 100, 0, 's', 'aim', []),
  'Chien, immobile': await play('hound', 50, 0, null, 'crouch', ['leap']), 'Chien, pas de côté': await play('hound', 50, 0, 's', 'crouch', ['leap']),
  'Pénitent, immobile': await play('penitent', -24, 0, null, 'cock', ['lash']), 'Pénitent, recule': await play('penitent', -24, 0, 'a', 'cock', ['lash']),
};
await run(() => document.querySelector('[data-opt="god"]').click());
const names = Object.keys(fights), fair = names.every((n, i) => (i % 2 ? !fights[n] : fights[n] > 0));
if (!fair) errors.push(`unfair or toothless attacks: ${JSON.stringify(fights)}`);
console.log('blood lost:', JSON.stringify(fights));

await run(() => window.game.loop.wake());
console.log(`${layout}: ${empty} fps empty, ${crowd} fps with the hound pack and six pénitents fighting, ${await count()} left`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
