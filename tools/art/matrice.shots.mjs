// La Matrice and Vesna freed, in headless Chromium at 1920x1080 (the PC target): the catacombs' arena opened directly
// (a save with le caveau's grille raised, money banked), the hero walks in: the grille drops behind him, her wheel comes
// down from the vault and her first goules are born on their cords. Captures: hanging (matrice-hang), the pull-back tell
// (matrice-pull), the swing (matrice-swing), grounded after it (matrice-low), her cords (matrice-cords) and one cut
// (matrice-cut), the sac tearing (matrice-tear), the wheel spinning, torn (matrice-spin), dead (matrice-dead). The bot
// plays the swing of both phases, the hero mortal and alone with her: standing still (it must land) and stepping out
// REACT ms after the tell starts, at the hero's walk (it must miss): it only knows her state, as a player knows her pose.
// The cords' rule is checked with real claws: fed by three cords, a blow does nothing; one cut, a third of it. Her blood
// is cut short between the checks (a cheat; the dodges are real). Then F at the reliquary: the freeing scene (free-eyes,
// free-open, free-rise, free-lines), Vesna saved freed; up le caveau, home to the refuge: her coffin open
// (refuge-crypt-vesna), her shop (vesna-refuge), her stall (vesna-stall): a power bought and worn, then the next
// expedition sets out with it.
// Writes <out>/<what>.png. Usage: node tools/art/matrice.shots.mjs [--out=shots --port=5211]
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
const BOSS = `${S}.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === 'matrice')`;
const BROOD = `${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn'))`;

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 4, banked: 900, shortcuts: ['grille', 'galerie', 'caveau'] })));
await page.reload();
await page.waitForFunction(() => window.game?.scene.isActive('room'));
const T = await run(() => import('/src/tuning.ts').then((m) => m.T));
const M = T.matrice;
const A = await run(() => import('/src/catacombs.data.ts').then((m) => ({ arena: m.ARENA, rel: m.RELIQUARY })));
const into = async (layout, data = {}) => {
  await run(([layout, data]) => window.game.scene.getScene('room').scene.restart({ layout, ...data }), [layout, data]);
  await page.waitForFunction((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.sys.isActive() && s.hero?.body; }, layout);
};
await into('catacombs');
await page.waitForTimeout(3000); // its first chunks
// From here the game is stepped by hand at 60 fps (headless it runs at a few fps).
await run(() => window.game.loop.sleep());
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const hero = (x, y) => run(([x, y]) => { const s = window.game.scene.getScene('room'); s.hero.body.reset(x, y); }, [x, y]);
const boss = (k) => run(`${BOSS}?.getData('${k}')`);
const set = (data) => run(`(() => { const e = ${BOSS}; e.setData(${JSON.stringify(data, (k, v) => (v === Infinity ? 1e12 : v))}); e.setVelocity(0); })()`); // (JSON has no Infinity)
const now = () => run(`${S}.time.now`);
const health = () => run(() => window.game.scene.getScene('room').health);
const heal = () => run(() => { const s = window.game.scene.getScene('room'); s.health = 10; s.invulnUntil = 0; s.hud.health(10, 10); });
const until = async (cond, ms = 6000) => { for (let t = 0; t < ms && !(await run(cond)); t += 50) await step(50); return run(cond); };
// the zone's own foes out of the way: this is her fight
await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) e.disableBody(true, true); s.invulnUntil = 0; });

// ---- in: the grille drops, her wheel comes down, her goules are born on their cords ----
await hero(A.rel.x - 10, A.arena[3] + 30);
await step(200);
for (let i = 0; i < 40 && !(await run(`!!${S}.fight`)); i++) { await hero(A.rel.x - 10, A.arena[3] - 40 - i); await step(50); }
check(await run(`!!${S}.fight && !${S}.fight.gate.open && ${BOSS}?.getData('kind') === 'matrice'`), 'into the arena: the grille drops behind him, la Matrice is the guardian');
check(JSON.parse(await run(() => localStorage.getItem('dracul.save'))).nourrice.tries === 1, 'the attempt is saved');
const pv = await boss('pivot');
await hero(pv.x - 60, pv.y + 70);
await step(1000);
await shot('matrice-intro');
check(await until(`${S}.fed(${BOSS}).length === ${M.cords}`), `her first ${M.cords} goules born on their cords`);
await set({ readyAt: Infinity });
await hero(pv.x - 30, pv.y + 80);
await step(1200);
await shot('matrice-hang');

// ---- the bot plays the swing: still (it must land), then stepping out REACT ms after the tell (it must miss) ----
const REACT = 250;
const rested = async () => { for (let i = 0; i < 80 && !['hang', 'low'].includes(await boss('state')); i++) await step(100); };
/** Her brood gone (another check's), the hero at `h`; `start()` sets her ready; then the bot stands, or holds `key` from
 *  REACT ms after her state became the tell until the swing is over. Shots `name`-pull and -swing on the way. Returns
 *  the blood lost. */
async function play(name, h, key, start, shots) {
  await rested();
  await run(`${BROOD}.forEach((e) => ${S}.kill(e))`);
  await set({ birthAt: Infinity });
  await hero(...h);
  await heal();
  await step(32);
  await start();
  for (let t = 0; t < 3000 && (await boss('state')) !== 'pull'; t += 16) await step(16);
  if ((await boss('state')) !== 'pull') return check(false, `${name}: she never gave her tell (${await boss('state')})`), -1;
  await step(REACT);
  if (key) await page.keyboard.down(key);
  let shotPull = !shots, shotSwing = !shots;
  for (let t = REACT; t < 5000 && ['pull', 'swing'].includes(await boss('state')); t += 16) {
    await step(16);
    const st = await boss('state'), k = (await now()) - (await boss('at'));
    if (!shotPull && st === 'pull' && k > (await boss('phase') === 2 ? M.tele2Ms : M.teleMs) - 120) { shotPull = true; await shot(`${shots}-pull`); }
    if (!shotSwing && st === 'swing' && k > 160) { shotSwing = true; await shot(`${shots}-swing`); }
  }
  await step(150);
  if (key) await page.keyboard.up(key);
  return 10 - (await health());
}
const fights = {};
const hang = async () => { await set({ state: 'hang', phase: 1, z: M.hangZ, readyAt: 0, path: undefined }); await run(`${BOSS}.body.reset(${pv.x}, ${pv.y})`); };
await set({ state: 'hang', readyAt: Infinity });
fights['Balancier, immobile'] = await play('swing', [pv.x - 90, pv.y], null, hang, 'matrice');
await step(300);
await shot('matrice-low');
check((await boss('state')) === 'low' && (await boss('z')) === 0, 'the swing over, the wheel grounded: the time to strike');
fights['Balancier, pas de côté'] = await play('swing tell', [pv.x - 90, pv.y], 's', hang);
fights['Balancier vers le bas, immobile'] = await play('swing down', [pv.x + 20, pv.y + 70], null, hang);
fights['Balancier vers le bas, pas de côté'] = await play('swing down tell', [pv.x + 20, pv.y + 70], 'd', hang);

// ---- her cords: fed by all three, a blow does nothing; one cut, a third of it ----
await rested();
await set({ state: 'hang', readyAt: Infinity });
await run(`${BOSS}.body.reset(${pv.x}, ${pv.y})`);
await hero(pv.x - 100, pv.y + 30);
await step(100);
await run(`(() => { const s = ${S}, e = ${BOSS}; for (let i = 0; i < ${M.cords}; i++) s.birth(e, true); })()`); // (one is born every ${M.birthMs} ms: three at once here)
check(await until(`${S}.fed(${BOSS}).length === ${M.cords}`, 8000), `${M.cords} goules born on their cords again`);
await run(`${S}.fed(${BOSS}).forEach((g, i) => { g.setData('stunnedUntil', Infinity); g.setVelocity(0); g.body.reset(${pv.x} + 80, ${pv.y} - 70 + i * 70); })`); // still, east of her, apart, to aim at their cords
await step(400);
await shot('matrice-cords');
const strike = async () => { // the hero's claws, a single blow beside her grounded wheel
  await run(`(() => { const s = ${S}, e = ${BOSS}; e.setData({ state: 'low', at: s.time.now, z: 0 }); s.slashReadyAt = 0; s.lastSlashAt = -1e9; s.combo = 0; s.hero.body.reset(e.x - 30, e.y + 2); s.invulnUntil = s.time.now + 5000; s.slash(0); })()`);
  await step(60);
};
let hp0 = await boss('hp');
await strike();
check((await boss('hp')) === hp0, `fed by ${M.cords} cords: her sac takes nothing (${hp0} -> ${await boss('hp')})`);
// a claw across a cord: the hero beside its middle, slashing at it
const cut = await run(`(() => { const g = ${S}.fed(${BOSS})[0]; return { gx: g.x, gy: g.y }; })()`);
const sac = await run(`(() => { const e = ${BOSS}; return { x: e.getData('img').x, y: e.y }; })()`);
const mid = { x: cut.gx + (sac.x - cut.gx) * 0.25, y: cut.gy + (sac.y - cut.gy) * 0.25 }; // its low part, by the goule
await set({ state: 'hang', z: M.hangZ });
await run(`(() => { const s = ${S}; s.slashReadyAt = 0; s.hero.body.reset(${mid.x}, ${mid.y - 16}); s.slash(Math.PI / 2); })()`);
await step(120);
await shot('matrice-cut');
check((await run(`${S}.fed(${BOSS}).length`)) === M.cords - 1, `a claw across a cord cuts it (${await run(`${S}.fed(${BOSS}).length`)} left)`);
hp0 = await boss('hp');
await strike();
const took = hp0 - (await boss('hp'));
check(Math.abs(took - 1 / M.cords) < 1e-6, `one cord cut: a blow of 1 takes ${took.toFixed(3)} (1/${M.cords})`);
await run(`${BROOD}.forEach((e) => ${S}.kill(e))`);
await step(100);
check((await run(`${S}.fed(${BOSS}).length`)) === 0, 'her goules killed: their cords gone with them');
hp0 = await boss('hp');
await strike();
check(hp0 - (await boss('hp')) === 1, 'no cord left: the blow lands whole');

// ---- phase 2: at half her blood, hanging, the sac tears ----
await set({ hp: M.hp / 2, state: 'hang', readyAt: Infinity, birthAt: Infinity, z: M.hangZ });
await run(`${BOSS}.body.reset(${pv.x}, ${pv.y})`);
await hero(pv.x - 50, pv.y + 70);
for (let t = 0; t < 2000 && (await boss('state')) !== 'tear'; t += 16) await step(16);
check((await boss('state')) === 'tear' && (await boss('phase')) === 2, 'at half her blood: the chains snap, the sac tears, phase 2');
await step(500);
await shot('matrice-tear');
check(await until(`${BOSS}.getData('state') === 'low'`, 4000) && (await run(`${BROOD}.length + ${BOSS}.getData('pending')`)) >= 1, 'torn, down to the bottom of its swing: a brood spills out');
await step(800);
await shot('matrice-spin');
const lowFrom = async () => { await set({ state: 'low', phase: 2, z: 0, at: (await now()) - M.low2Ms + 50, path: undefined }); await run(`${BOSS}.body.reset(${pv.x}, ${pv.y})`); };
fights['Balancier, phase 2, immobile'] = await play('swing 2', [pv.x - 90, pv.y], null, lowFrom, 'matrice-2');
fights['Balancier, phase 2, pas de côté'] = await play('swing 2 tell', [pv.x - 90, pv.y], 's', lowFrom);
fights['Balancier, phase 2, en haut, immobile'] = await play('swing 2 up', [pv.x + 30, pv.y - 60], null, lowFrom);
fights['Balancier, phase 2, en haut, pas de côté'] = await play('swing 2 up tell', [pv.x + 30, pv.y - 60], 'a', lowFrom);
check((await boss('state')) === 'low' && (await boss('z')) === 0, 'back at the bottom of its swing, low');
hp0 = await boss('hp');
await strike();
check((await boss('hp')) < hp0, 'struck at the bottom of its swing, the sac torn: the blow lands whole');
console.log('blood lost:', JSON.stringify(fights));
const names = Object.keys(fights);
check(names.every((n, i) => (i % 2 ? fights[n] === 0 : fights[n] > 0)), `each swing lands on a still hero and misses one who steps out ${REACT} ms after the tell`);

// ---- her death: the wheel crashes, the grille rises, saved for good ----
await run(`${BROOD}.forEach((e) => ${S}.kill(e))`);
await hero(pv.x - 40, pv.y + 80);
await run(`(() => { const s = ${S}, e = ${BOSS}; s.hurtEnemy(e, e.getData('hp')); })()`);
await step(1400);
await shot('matrice-dead');
const saved = JSON.parse(await run(() => localStorage.getItem('dracul.save')));
check(!(await run(`!!${S}.fight`)) && (await run(`${S}.room.zone.gates.find((g) => g.arena).open`)) && saved.nourrice.dead, 'dead: the grille rises, her death saved');

// ---- Vesna freed ----
await hero(A.rel.at.x, A.rel.at.y + 4);
await step(200);
await run(`${S}.bite()`);
check(await run(`${S}.cut`), 'F at the reliquary: the scene plays');
await step(1500);
await shot('free-eyes');
await step(2300);
check(JSON.parse(await run(() => localStorage.getItem('dracul.save'))).vesna === true, 'the cage open: Vesna freed, saved for good');
await step(700);
await shot('free-open');
await step(1800);
await shot('free-rise');
await step(1000);
await shot('free-lines');
await step(7000);
check(!(await run(`${S}.cut`)), 'the scene over, he is his own again');

// ---- home, by le caveau: the refuge, her coffin open, her shop, her stall ----
await run(() => window.game.loop.wake());
await run(`${S}.leave(-2)`);
await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.layout === 'necropolis' && s.sys.isActive() && s.phase === 'play'; }, null, { timeout: 30000 });
await run(`${S}.leave(-1)`);
await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.layout === 'refuge' && s.sys.isActive() && s.vesna; }, null, { timeout: 60000 });
const log = await run(() => JSON.parse(localStorage.getItem('dracul.log')).at(-1));
check(log.end === 'retour' && log.boss === 'tuée', `the expedition logged: ${log.end}, the guardian ${log.boss}`);
await run(() => window.game.loop.sleep());
const look = async (name, x, y) => { await run(([x, y]) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.centerOn(x, y); }, [x, y]); await step(300); await shot(name); };
await look('refuge-crypt-vesna', 760, 300);
const V = await run(() => import('/src/refuge.ts').then((m) => m.VESNA));
await hero(V.x, V.y + 30);
await run(() => { const s = window.game.scene.getScene('room'); s.cameras.main.startFollow(s.hero, true, 1, 1); });
await step(600);
await shot('vesna-refuge');
await run(`${S}.bite()`);
check(await run(`!!${S}.stall`), 'F by Vesna: her stall');
await step(100);
await run(`${S}.trade(0)`); // Griffes pestilentes: bought, worn in its empty slot
await run(`${S}.trade(2)`); // Éclats pestilents
await run(`${S}.trade(3)`); // Rat de jet: bought, then worn in place of the Éclats
await run(`${S}.trade(3)`);
await run(`${S}.stall.hover(3)`);
await step(100);
await shot('vesna-stall');
const s3 = JSON.parse(await run(() => localStorage.getItem('dracul.save')));
check(s3.powers.bought.join() === 'griffes,eclats,jet' && s3.powers.worn.griffes === 'griffes' && s3.powers.worn.tir === 'jet' && s3.banked === 900 - 100 - 150 - 225,
  `bought from the bank (${s3.banked} left), worn one per slot: ${JSON.stringify(s3.powers)}`);
await run(`${S}.closeStall()`);
await run(() => window.game.loop.wake());
await into('necropolis', { entry: -1 });
check((await run(`${S}.gifts.join()`)) === 'griffes,jet', 'the next expedition sets out wearing them');

await run(() => window.game.loop.wake());
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
