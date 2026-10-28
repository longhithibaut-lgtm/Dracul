// La Nourrice des goules, version A « l'Araignée », kept for a later boss (la Matrice guards the catacombs:
// tools/art/matrice.shots.mjs), in headless Chromium at 1920x1080: the training room (T) in the necropolis, she is called
// in by its button; her phase 2 crawls the edges of the view she was called into (her `arena`). Captures: her perched
// (nourrice-perched), the drop's wind-up (nourrice-tele), the rake (nourrice-rake), her goules shaken off by hard blows
// (nourrice-goules), the chains snapping (nourrice-snap), phase 2 on the wall (nourrice-wall), a lump hurled
// (nourrice-hurl), over him under the vault (nourrice-vault), dead (nourrice-dead). The bot plays each attack of both
// phases, the hero mortal (the training room's « Invincible » unticked) and alone with her: standing still (it must
// land) and stepping out REACT ms after the tell starts, at the hero's walk (it must miss): it only knows her state, as
// a player knows her pose. Her blood is cut short between the checks (a cheat; the dodges are real).
// Writes <out>/<what>.png. Usage: node tools/art/nourrice.shots.mjs [--out=shots --port=5211]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots'), port = Number(arg('port', 5211));
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(240000);
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
page.on('console', (m) => m.text().startsWith('expédition') && console.log(m.text()));
await mkdir(out, { recursive: true });
const run = (f, a) => page.evaluate(f, a);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);
const S = `window.game.scene.getScene('room')`;
const BOSS = `${S}.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === 'nourrice')`;

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 5, banked: 900 })));
await page.reload();
await page.waitForFunction(() => window.game?.scene.isActive('room'));
const T = await run(() => import('/src/tuning.ts').then((m) => m.T));
// From here the game is stepped by hand at 60 fps (headless it runs at a few fps).
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const hero = (x, y) => run(([x, y]) => { const s = window.game.scene.getScene('room'); s.hero.body.reset(x, y); }, [x, y]);
const boss = (k) => run(`${BOSS}?.getData('${k}')`);
const set = (data) => run(`(() => { const e = ${BOSS}; e.setData(${JSON.stringify(data, (k, v) => (v === Infinity ? 1e12 : v))}); e.setVelocity(0); })()`); // (JSON has no Infinity)
const health = () => run(() => window.game.scene.getScene('room').health);

// ---- the training room: « Invincible » unticked, her button ----
await page.keyboard.press('t');
await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.training && s.layout === 'necropolis' && s.sys.isActive() && s.hero?.body && document.querySelector('#training'); });
await page.waitForTimeout(2000); // its first chunks
await run(() => import('/src/training.ts').then((m) => void (m.opts.god = false))); // « Invincible ici » unticked (its box folded in the panel)
await page.click('#training [data-spawn="nourrice"]');
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable && e.getData('kind') === 'nourrice'), null, { timeout: 120000 });
await run(() => window.game.loop.sleep());
check(true, "l'Araignée called in by the training room's button");
const arena = await boss('arena'), cx = (arena[0] + arena[2]) / 2, cy = (arena[1] + arena[3]) / 2 + 30;
await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) if (e.getData('kind') !== 'nourrice') e.disableBody(true, true); s.invulnUntil = 0; s.cameras.main.stopFollow(); });
await run(`${S}.cameras.main.centerOn(${cx}, ${cy - 30})`);
await step(500);
await shot('nourrice-intro');
const rested = async () => { for (let i = 0; i < 60 && ['tele', 'spring', 'rakeT', 'rake', 'stuck', 'hold', 'fall', 'snap', 'climb', 'hurlT'].includes(await boss('state')); i++) await step(100); };
await rested();
// held still a moment, perched, the hero before her
await set({ readyAt: Infinity });
await run(`(() => { const e = ${BOSS}; e.body.reset(${cx}, ${cy - 20}); })()`);
await hero(cx - 40, cy + 70);
await step(600);
await shot('nourrice-perched');

// ---- the bot plays each attack: still (it must land), then stepping out REACT ms after the tell (it must miss) ----
const REACT = 250;
/** Sets the hero at `h`, her at `b`; `start()` starts the attack (or she does, ready); then the bot stands, or holds
 *  `key` from REACT ms after her state became `tell` until her attack is over. Returns the blood lost. */
async function play(name, b, h, tell, attack, key, start, after = 150) {
  await rested();
  await run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn')).forEach((e) => ${S}.kill(e))`); // her brood: another check's
  await set({ readyAt: Infinity, state: 'chase', until: 0 });
  await run(`(() => { const e = ${BOSS}; e.body.reset(${b[0]}, ${b[1]}); })()`);
  await hero(...h);
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 10; s.invulnUntil = 0; s.hud.health(10, 10); });
  await step(32);
  if (start) await start(); else await set({ readyAt: 0 });
  for (let t = 0; t < 2000 && (await boss('state')) !== tell; t += 16) await step(16);
  if ((await boss('state')) !== tell) return check(false, `${name}: she never gave her tell (${await boss('state')})`), -1;
  if (name.endsWith('tell')) await shot(`nourrice-${name.split(' ')[0]}`);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = REACT; t < 5000 && [tell, ...attack].includes(await boss('state')); t += 16) await step(16);
  for (let t = 0; t < after; t += 50) { await step(50); await page.waitForTimeout(40); } // what lands just after (a lump in the air, on tweens: on the wall clock)
  if (key) await page.keyboard.up(key);
  return 10 - (await health());
}
const fights = {};
fights['Chute, immobile'] = await play('chute', [cx, cy - 20], [cx - 110, cy - 10], 'tele', ['spring'], null);
fights['Chute, pas de côté'] = await play('tele tell', [cx, cy - 20], [cx - 110, cy - 10], 'tele', ['spring'], 's');
fights['Râteau, immobile'] = await play('rake', [cx, cy - 20], [cx - 45, cy - 15], 'rakeT', ['rake'], null);
fights['Râteau, recule'] = await play('rake tell', [cx, cy - 20], [cx - 45, cy - 15], 'rakeT', ['rake'], 'a');

// her goules, shaken off by hard blows (the finisher's, the dash strike's)
await rested();
await set({ readyAt: Infinity, state: 'chase', until: 0 });
await run(`(() => { const e = ${BOSS}; e.body.reset(${cx}, ${cy - 10}); })()`);
for (let k = 0; k < 2; k++) {
  await hero(cx - 26, cy - 8);
  await run(`(() => { const s = ${S}; s.hitEnemy(${BOSS}, 0, 2, 140, 2); })()`);
  await step(500);
}
// (tweens run on the wall clock, its lag capped: stepped fast, a goule's fall needs more frames)
for (let t = 0; t < 4000 && (await run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn')).length`)) < 2; t += 100) await step(100);
const brood = await run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn')).length`);
check(brood === 2 && (await boss('clinging')).filter(Boolean).length === 1, `two hard blows shake two goules off her (${brood} hunting him)`);
await step(300);
await shot('nourrice-goules');
await run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn')).forEach((e) => ${S}.kill(e))`);

// ---- phase 2: at half her blood, the chains snap; up the walls ----
await rested();
await set({ hp: T.nourrice.hp / 2, readyAt: 0, state: 'chase', until: 0 });
await hero(cx - 60, cy + 50);
for (let t = 0; t < 2000 && (await boss('state')) !== 'snap'; t += 16) await step(16);
check((await boss('state')) === 'snap' && (await boss('phase')) === 2, 'at half her blood: the chains snap, phase 2');
await step(300);
await shot('nourrice-snap');
for (let t = 0; t < 4000 && (await boss('state')) !== 'wall'; t += 16) await step(16);
await set({ nextHurl: Infinity });
await step(1200);
check((await boss('z')) >= T.nourrice.wallZ && (await run(`${BOSS}.body.checkCollision.none`)), 'on the wall: off the floor, out of reach');
const hpUp = await boss('hp');
await run(`(() => { const s = ${S}; s.slashReadyAt = 0; const e = ${BOSS}; s.hero.body.reset(e.x + 10, e.y + 6); s.slash(Math.PI); })()`);
await step(50);
check((await boss('hp')) === hpUp, 'the claws cannot reach her on the wall');
await hero(cx, cy + 50);
await step(900);
await shot('nourrice-wall');
// her throws: debris at where he stands
const hurl = (name, key) => play(name, [cx, cy - 20], [cx - 30, cy + 50], 'hurlT', [], key, async () => {
  await set({ state: 'wall', hurls: 1, nextHurl: 0, z: T.nourrice.wallZ });
}, T.nourrice.flightMs + 300);
// (play() puts her body at its point first: back on the wall's foot nearest him)
const onWall = async () => run(`(() => { const s = ${S}, e = ${BOSS}; e.setData({ s: 600 }); })()`);
await onWall();
fights['Jet, immobile'] = await hurl('hurl', null);
await onWall();
fights['Jet, pas de côté'] = await hurl('hurl tell', 's');
// over him under the vault, then down
const vault = (name, key) => play(name, [cx - 30, cy + 40], [cx - 30, cy + 40], 'hold', ['fall'], key, async () => {
  await set({ state: 'hold', z: T.nourrice.vaultZ, fireAt: await run(`${S}.time.now`) + T.nourrice.holdMs, target: { x: cx - 30, y: cy + 40 }, phase: 2 });
  await run(`${BOSS}.body.checkCollision.none = true`);
});
fights['Voûte, immobile'] = await vault('vault', null);
fights['Voûte, pas de côté'] = await vault('vault tell', 's');
check((await boss('state')) === 'stuck' && (await boss('z')) === 0, 'down from the vault, she pulls herself up: the time to strike');
const before = await boss('hp');
await run(`(() => { const s = ${S}; s.slashReadyAt = 0; const e = ${BOSS}; s.hero.body.reset(e.x - 24, e.y + 2); s.slash(0); })()`);
await step(50);
check((await boss('hp')) < before, 'struck while she pulls herself up');
console.log('blood lost:', JSON.stringify(fights));
const names = Object.keys(fights);
check(names.every((n, i) => (i % 2 ? fights[n] === 0 : fights[n] > 0)), `each attack lands on a still hero and misses one who steps out ${REACT} ms after the tell`);

// ---- her death: she dies like any foe of the training room ----
await rested();
await run(`(() => { const s = ${S}, e = ${BOSS}; s.hurtEnemy(e, e.getData('hp')); })()`);
await step(1200);
await shot('nourrice-dead');
check(!(await run(`!!${BOSS}`)) && !(await run(`!!${S}.fight`)), 'dead: no fight to end, no arena to open');

await run(() => window.game.loop.wake());
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
