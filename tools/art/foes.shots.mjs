// The Order's foes of the « grand pixel » rooms (src/foes.ts: Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur,
// Inquisiteur) in the
// torture room, in headless Chromium at 1920x1080 (the PC target), called in from the training room: each idle, giving
// its tell and attacking (crops round them, x2 of the screen's pixels kept), walking and struck, weakened, killed, full
// frames of them; the bot playing each attack (the crossbowman's too), standing still (it must land) and stepping out
// REACT ms after the tell starts, at the hero's speed (it must miss): nothing on the floor tells it, the bot only knows
// the state, as a player knows the pose (the Sonneur's rings also misted through as they come, the Inquisiteur's sweep
// dodged by slipping into his back, whose claws land where his front parries them); and the frame rate empty, with the
// hound pack, six pénitents, a Sonneur and an Inquisiteur fighting.
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

// The hound pack, a wave of six pénitents, a Sonneur and an Inquisiteur, called in by their buttons, fighting the
// (invincible) hero.
await run(() => { for (const s of ['hounds', 'penitents', 'ringer', 'inquisitor']) document.querySelector(`[data-spawn="${s}"]`).click(); });
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().length === 11);
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

// The Sonneur: his tell and his rings, walking, struck, weakened; a pénitent beside him, quickened by his bell. The
// Inquisiteur: whirling, sweeping, parrying a claw at his front, struck in the back, walking, weakened. Then both dead.
await hero(240, 330);
await call([['ringer', 170, 300], ['inquisitor', 300, 330], ['penitent', 200, 345]]);
await still();
await page.screenshot({ path: `${out}/foes-room2.png` });
await crop('ringer', 'ringer-idle', 420, 440);
await crop('inquisitor', 'inquisitor-idle', 420, 440);
await hero(240, 250);
for (const k of [0, 1, 2]) { await step(110); await crop('ringer', `ringer-walk${k}`, 420, 440); await crop('inquisitor', `inquisitor-walk${k}`, 420, 440); }
await hold();
await hero(240, 330);
await still();
await set('ringer', { readyAt: 0, state: 'chase', until: 0 });
await step(600);
await crop('ringer', 'ringer-tell', 520, 460);
await step(500);
await crop('ringer', 'ringer-attack', 760, 520, -5);
await step(250);
await page.screenshot({ path: `${out}/foes-ringer-rings-full.png` });
await set('penitent', { state: 'chase', until: 0 });
await hero(240, 230); // the pénitent walks after him, quickened
await step(200);
await crop('penitent', 'ringer-haste', 420, 440);
await hold();
await step(1200);
at = await run(`(() => { const e = ${foe('inquisitor')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 24, at.y + 4);
await still();
await set('inquisitor', { readyAt: 0, state: 'chase', until: 0, facing: Math.PI });
await step(500);
await crop('inquisitor', 'inquisitor-tell', 560, 460);
await step(480);
await crop('inquisitor', 'inquisitor-attack', 560, 460);
await hold();
await step(1000);
// Struck from the front (where he faces): parried; from behind: it lands.
const hpOf = (kind) => run(`${foe(kind)}.getData('hp')`);
const strike = async (dx, angle) => {
  await run(`(() => { const s = ${S}, e = ${foe('inquisitor')}; e.setVelocity(0); s.hero.body.reset(e.body.center.x + ${dx}, e.body.center.y); })()`);
  await step(16); // the bodies settle where they were put
  await run(`(() => { const s = ${S}; ${foe('inquisitor')}.setData({ facing: Math.PI, state: 'chase', until: 0, stunnedUntil: 0 }); s.slashReadyAt = 0; s.slash(${angle}); })()`);
};
const hp0 = await hpOf('inquisitor');
await strike(-20, 0);
await step(80); // the sparks at their brightest
await crop('inquisitor', 'inquisitor-parry', 520, 440);
const hpFront = await hpOf('inquisitor');
await step(400);
await strike(20, Math.PI);
await step(60);
await crop('inquisitor', 'inquisitor-hurt', 520, 440);
const hpBack = await hpOf('inquisitor');
const parry = { 'Inquisiteur, griffes de face': hp0 - hpFront, 'Inquisiteur, griffes dans le dos': hp0 - hpBack };
if (hpFront !== hp0 || hpBack >= hp0) errors.push(`parry wrong: ${JSON.stringify(parry)}`);
console.log('hp lost by the Inquisiteur:', JSON.stringify(parry));
await step(400);
await run(`(() => { ${S}.hurtEnemy(${foe('inquisitor')}, ${foe('inquisitor')}.getData('hp') - 1); ${S}.hurtEnemy(${foe('ringer')}, 2); })()`);
await step(300);
await crop('inquisitor', 'inquisitor-weak', 420, 440);
await crop('ringer', 'ringer-weak', 420, 440);
await step(900);
await run(`(() => { ${S}.kill(${foe('ringer')}); ${S}.kill(${foe('inquisitor')}); })()`);
await step(1500);
await page.screenshot({ path: `${out}/foes-dead2.png` });
await clear();

// The bot plays each attack, the hero mortal and alone with the foe: standing still, then stepping out REACT ms after
// the tell starts (holding a key: the hero walks at T.grand.speed). `then(t)`, if given, is what the bot does at each
// step from then on (t: ms since the tell started), for a dodge that is more than a walk.
const REACT = 300;
await run(() => document.querySelector('[data-opt="god"]').click());
const R = await run(() => import('/src/tuning.ts').then((m) => ({ ...m.T.ringer, squash: m.T.lantern.squash })));
async function play(kind, dx, dy, key, tell, attack, then) {
  await clear();
  await hero(240, 330);
  await call([[kind, 240 - dx, 330 - dy]]);
  await still();
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 5; s.invulnUntil = s.dazedUntil = 0; });
  await set(kind, { readyAt: 0, facing: Math.atan2(dy, dx) });
  const state = () => run(`${foe(kind)}.getData('state')`), busy = () => run(`!!${foe(kind)}.getData('rings')`); // a bell's rings still rolling
  for (let t = 0; t < 2000 && (await state()) !== tell; t += 16) await step(16);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = REACT; t < 4000 && ([tell, ...attack].includes(await state()) || (await busy())); t += 16) { await then?.(t); await step(16); }
  await step(700); // a bolt still in flight
  if (key) await page.keyboard.up(key);
  return 5 - (await run(() => window.game.scene.getScene('room').health));
}
const keys = async (down, up = []) => { for (const k of up) await page.keyboard.up(k); for (const k of down) await page.keyboard.down(k); };
// Misting through the rings: once the first is about to reach him (seen: the attack itself), a dash straight at the Sonneur.
let misted = false;
const mist = async () => {
  const near = await run(`(() => { const g = ${foe('ringer')}.getData('rings'), s = ${S}, c = s.hero.body.center; if (!g) return false;
    const r = ${R.ringSpeed} * (s.time.now - g.at) / 1000, d = Math.hypot(c.x - g.x, (c.y - g.y) / ${R.squash}); return r > 0 && d - r < 12; })()`);
  if (!near || misted) return;
  misted = true;
  await keys(['a']);
  await page.keyboard.press('Space');
  await step(150);
  await keys([], ['a']);
};
// Into the Inquisiteur's back: a dash down past his side, then up behind him, staying within his reach.
const behind = async (t) => {
  if (t === REACT) { await keys(['s', 'd']); await page.keyboard.press('Space'); }
  if (t === REACT + 160) await keys(['w'], ['s']);
  if (t === REACT + 400) await keys([], ['w', 'd']);
};
const fights = {
  'Purificateur, immobile': await play('purifier', 28, 4, null, 'ignite', ['fire']), 'Purificateur, pas de côté': await play('purifier', 28, 4, 's', 'ignite', ['fire']),
  'Prêtre, immobile': await play('priest', -90, 30, null, 'pray', []), 'Prêtre, s\'écarte': await play('priest', -90, 30, 'a', 'pray', []),
  'Arbalétrier, immobile': await play('crossbow', 100, 0, null, 'aim', []), 'Arbalétrier, pas de côté': await play('crossbow', 100, 0, 's', 'aim', []),
  'Chien, immobile': await play('hound', 50, 0, null, 'crouch', ['leap']), 'Chien, pas de côté': await play('hound', 50, 0, 's', 'crouch', ['leap']),
  'Pénitent, immobile': await play('penitent', -24, 0, null, 'cock', ['lash']), 'Pénitent, recule': await play('penitent', -24, 0, 'a', 'cock', ['lash']),
  'Sonneur, immobile': await play('ringer', 70, 0, null, 'raise', ['toll']), 'Sonneur, s\'éloigne': await play('ringer', 70, 0, 'd', 'raise', ['toll']),
  'Sonneur, immobile (bis)': await play('ringer', 70, 0, null, 'raise', ['toll']), 'Sonneur, brume à travers les anneaux': await play('ringer', 70, 0, null, 'raise', ['toll'], mist),
  'Inquisiteur, immobile': await play('inquisitor', -24, 0, null, 'whirl', ['sweep']), 'Inquisiteur, recule': await play('inquisitor', -24, 0, 'a', 'whirl', ['sweep']),
  'Inquisiteur, immobile (bis)': await play('inquisitor', -24, 0, null, 'whirl', ['sweep']), 'Inquisiteur, dans son dos': await play('inquisitor', -24, 0, null, 'whirl', ['sweep'], behind),
};
if (!misted) errors.push('the bot never misted through the rings');
const back = await run(`(() => { const e = ${foe('inquisitor')}, c = ${S}.hero.body.center; return { dx: Math.round(c.x - e.body.center.x), dy: Math.round(c.y - e.body.center.y), aim: +e.getData('aim').toFixed(2) }; })()`);
console.log('the hero once behind the Inquisiteur (from his feet, room px; his aim, rad):', JSON.stringify(back));
await run(() => document.querySelector('[data-opt="god"]').click());
const names = Object.keys(fights), fair = names.every((n, i) => (i % 2 ? !fights[n] : fights[n] > 0));
if (!fair) errors.push(`unfair or toothless attacks: ${JSON.stringify(fights)}`);
console.log('blood lost:', JSON.stringify(fights));

await run(() => window.game.loop.wake());
console.log(`${layout}: ${empty} fps empty, ${crowd} fps with the hound pack, six pénitents, a Sonneur and an Inquisiteur fighting, ${await count()} left`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
