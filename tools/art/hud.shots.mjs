// The HUD « Chair » in the game, at 1920x1080, beside its mockup (docs/maquettes/hud-2-chair.png, -boss.png): in the
// catacombs, the hero's state set by hand (a cheat; the HUD only shows what it is pushed). Captures: hud-explore (38/50,
// 126 blood of 400, the glyph halfway back, a place's name, « F fouiller » by a cache), hud-blood (the bag nearly full,
// a pickup's « +n »), hud-cooldown (the mist, the tir, the glyph and la Nuée spent), hud-low (7/50: the veins, the heart
// racing), hud-boss (la Matrice's cord, low life), hud-resize (a 1440x1080 window: the corners hold).
// Writes <out>/<what>.png. Usage: node tools/art/hud.shots.mjs [--out=shots --port=5213]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots'), port = Number(arg('port', 5213));
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(240000);
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
await mkdir(out, { recursive: true });
const run = (f, a) => page.evaluate(f, a);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 6, banked: 900, shortcuts: ['grille', 'galerie', 'caveau'], powers: { bought: ['swarm'], worn: {} } })));
await page.reload();
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'catacombs' }));
await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.layout === 'catacombs' && s.sys.isActive() && s.hero?.body; });
await page.waitForTimeout(3000); // its first chunks
await run(() => window.game.loop.sleep()); // stepped by hand at 60 fps from here
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
// the hero's state, and the foes out of the way (this is the HUD's capture)
const state = (o) => run((o) => {
  const s = window.game.scene.getScene('room'), now = s.time.now;
  for (const e of s.enemies.getChildren()) if (e.getData('kind') !== 'matrice') e.disableBody(true, true);
  s.damageHero = () => false; // (no blinking invulnerability: nothing hurts him)
  if (o.health !== undefined) { s.health = o.health; s.hud.health(s.health, s.maxHealth()); }
  if (o.carried !== undefined) { s.carried = o.carried; s.showBlood(); }
  if (o.bag) { s.bag = o.bag.map((id, n) => ({ n: 900 + n, id, r: n === 1 ? 1 : 0 })); s.showBlood(); }
  for (const [k, ms] of Object.entries(o.spend ?? {})) s[k] = now + ms; // a cooldown just spent, `ms` long
}, o);

const caches = await run(() => window.game.scene.getScene('room').caches.map((c) => ({ x: c.x, y: c.y })));
check(caches.length > 0, `caches in the catacombs: ${caches.length}`);
const c = caches[0];
await run(([x, y]) => window.game.scene.getScene('room').hero.body.reset(x, y), [c.x, c.y + 14]);
await state({ health: 38, carried: 110, bag: ['calice', 'faucille', 'chapelet', 'fiole'], spend: { glyphReadyAt: 5000 } });
await step(600);
await state({ carried: 126 }); // a pickup: « +16 »
await run(() => window.game.scene.getScene('room').hud.title('Les catacombes'));
await step(2200); // the glyph near halfway back; the name still up
await run(() => window.game.scene.getScene('room').hud.title('Les catacombes'));
await step(300);
await shot('hud-explore');

await state({ carried: 330 });
await step(200);
await state({ carried: 352 });
await step(300);
await shot('hud-blood');

await state({ spend: { dashReadyAt: 380, shotReadyAt: 400, glyphReadyAt: 5000, swarmReadyAt: 18000 } });
await step(150);
await shot('hud-cooldown');

await step(3000);
await state({ health: 7 });
await step(400);
await shot('hud-low');

// la Matrice: into her arena, the fight starts as he walks in
const A = await run(() => import('/src/catacombs.data.ts').then((m) => m.ARENA));
await run(([x, y]) => window.game.scene.getScene('room').hero.body.reset(x, y), [(A[0] + A[2]) / 2, A[3] - 60]);
for (let t = 0; t < 8000 && !(await run(() => !!window.game.scene.getScene('room').fight)); t += 200) await step(200);
check(await run(() => !!window.game.scene.getScene('room').fight), 'the fight with la Matrice starts');
await step(4000);
await run(() => { const s = window.game.scene.getScene('room'), e = s.fight.boss; e.setData('hp', Math.round(e.getData('hp') * 0.62)); });
await step(1500);
await state({ health: 7, spend: { shotReadyAt: 400 } });
await step(200);
await shot('hud-boss');

await page.setViewportSize({ width: 1440, height: 1080 });
await page.waitForTimeout(500);
await step(300);
await shot('hud-resize');

await browser.close();
await server.close();
if (errors.length) console.log('page errors:', errors);
console.log(failed.length || errors.length ? `FAILED: ${failed.join('; ')}` : 'all checks passed');
process.exit(failed.length || errors.length ? 1 : 0);
