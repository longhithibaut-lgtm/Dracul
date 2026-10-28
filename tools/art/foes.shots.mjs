// The foes of the « grand pixel » rooms (src/foes.ts: Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur,
// Inquisiteur, Amas, Bourreau; the arbalétrier, crossbow.ts) in the training room (the necropolis), in headless Chromium at 1920x1080 (the PC target), called in from the training room: each idle, giving
// its tell and attacking (crops round them, x2 of the screen's pixels kept), walking and struck, weakened, killed, full
// frames of them; the bot playing each attack (the crossbowman's too), standing still (it must land) and stepping out
// REACT ms after the tell starts, at the hero's speed (it must miss): nothing on the floor tells it, the bot only knows
// the state, as a player knows the pose (the Sonneur's rings also misted through as they come, the Inquisiteur's sweep
// dodged by slipping into his back, whose claws land where his front parries them; the Amas sprawled and the Bourreau
// wrenching his axe free are struck without being cut short, the Amas losing a ghoul to each blow); and the frame rate
// empty, with the hound pack, six pénitents, a Sonneur, an Inquisiteur, an Amas and a Bourreau fighting.
// The necropolis' crows, Enterré and Gavé likewise (their alarm, grip and meals checked too).
// Writes <out>/foes-<what>.png. Usage: node tools/art/foes.shots.mjs [--out=shots --port=5209 --layout=necropolis --only=fauna]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots'), port = Number(arg('port', 5209)), layout = arg('layout', 'necropolis'), only = arg('only'); // only=fauna: the necropolis' own alone
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' }); // no hmr: an edit to src/ mid-run would reload the page under the bot
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
const T = await run(() => import('/src/tuning.ts').then((m) => m.T));
const count = () => run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable).length);
const empty = await fps();

// The hound pack, a wave of six pénitents, a Sonneur, an Inquisiteur, an Amas and a Bourreau, called in by their
// buttons, fighting the (invincible) hero.
let crowd = 0;
if (!only) {
await run(() => { for (const s of ['hounds', 'penitents', 'ringer', 'inquisitor', 'amas', 'bourreau']) document.querySelector(`[data-spawn="${s}"]`).click(); });
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().length >= 13);
crowd = await fps();
await page.screenshot({ path: `${out}/foes-crowd-live.png` });
}

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

if (!only) { // (--only=fauna: the necropolis' own alone, further down)
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
await step(T.purifier.igniteMs * 0.6);
await crop('purifier', 'purifier-tell', 640, 420);
await step(T.purifier.igniteMs * 0.4 + T.purifier.fireMs / 3);
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
await step(T.priest.fillMs * 0.65);
await page.screenshot({ path: `${out}/foes-priest-tell-full.png` });
await crop('priest', 'priest-tell', 760, 440, -10);
await step(T.priest.fillMs * 0.35 + 150);
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
await step(T.hound.crouchMs * 0.6);
await crop('hound', 'hound-tell', 520, 360, -10);
await step(T.hound.crouchMs * 0.4 + 100);
await crop('hound', 'hound-attack', 640, 360, -10);
await hold();
await step(1200);
at = await run(`(() => { const e = ${foe('penitent')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 26, at.y + 6);
await set('penitent', { readyAt: 0, state: 'chase', until: 0 });
await step(T.penitent.cockMs * 0.7);
await crop('penitent', 'penitent-tell', 520, 420);
await step(T.penitent.cockMs * 0.3 + T.penitent.lashMs / 2);
await crop('penitent', 'penitent-attack', 520, 420);
await step(T.penitent.lashMs / 2 + T.penitent.recockMs + T.penitent.lashMs / 2);
await crop('penitent', 'penitent-attack2', 520, 420); // the second lash
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
await step(T.ringer.raiseMs * 0.7);
await crop('ringer', 'ringer-tell', 520, 460);
await step(T.ringer.raiseMs * 0.3 + 200);
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
await step(T.inquisitor.whirlMs * 0.6);
await crop('inquisitor', 'inquisitor-tell', 560, 460);
await step(T.inquisitor.whirlMs * 0.4 + T.inquisitor.sweepMs * 0.6);
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

// The Amas: crawling, gathering itself up (two frames), slamming, sprawled; struck while sprawled (not cut short, a ghoul
// torn off it at each blow, crawling at the hero). The Bourreau: walking, the axe raised, the blow and its crack,
// wrenching the axe free and struck meanwhile (not cut short), weakened. Then both dead.
await hero(240, 330);
await call([['amas', 165, 315], ['bourreau', 315, 320]]);
await still();
await page.screenshot({ path: `${out}/foes-room3.png` });
await crop('amas', 'amas-idle', 520, 400, -5);
await crop('bourreau', 'bourreau-idle', 520, 560);
await hero(240, 240);
for (const k of [0, 1, 2]) { await step(110); await crop('amas', `amas-walk${k}`, 520, 400, -5); await crop('bourreau', `bourreau-walk${k}`, 520, 560); }
await hold();
await step(600);
at = await run(`(() => { const e = ${foe('amas')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x + 26, at.y + 4);
await still();
await set('amas', { readyAt: 0, state: 'chase', until: 0 });
await step(T.amas.contractMs * 0.3);
await crop('amas', 'amas-tell0', 560, 420, -5);
await step(T.amas.contractMs * 0.5);
await crop('amas', 'amas-tell', 560, 420, -5);
await step(T.amas.contractMs * 0.2 + 60);
await crop('amas', 'amas-attack', 720, 480, -5);
await page.screenshot({ path: `${out}/foes-amas-slam-full.png` });
await step(T.amas.slamMs + 200);
await crop('amas', 'amas-sprawl', 560, 420, -5);
const ghouls = () => run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && e.getData('torn')).length`);
const punish = async (kind, state) => {
  const before = { hp: await hpOf(kind), torn: await ghouls() };
  await run(`(() => { const s = ${S}, e = ${foe(kind)}, c = e.body.center; s.hero.body.reset(c.x + 20, c.y); s.slashReadyAt = 0; s.slash(Math.PI); })()`);
  await step(16);
  const r = { hp: before.hp - (await hpOf(kind)), torn: (await ghouls()) - before.torn, state: await run(`${foe(kind)}.getData('state')`) };
  if (!r.hp || r.state !== state) errors.push(`${kind} not punished while ${state}: ${JSON.stringify(r)}`);
  return r;
};
const punished = { Amas: await punish('amas', 'sprawl') };
await step(60);
await crop('amas', 'amas-hurt', 560, 420, -5);
await hold();
for (let i = 0; i < 3; i++) { await run(`${S}.hurtEnemy(${foe('amas')}, 1)`); await step(200); }
await hero(at.x + 90, at.y + 10);
await step(700);
if ((await ghouls()) < 2) errors.push('the Amas tore no ghouls off');
await page.screenshot({ path: `${out}/foes-amas-torn-full.png` });
await crop('amas', 'amas-torn', 900, 520, -5);
await run(`${S}.enemies.getChildren().filter((e) => e.getData('torn') || e.getData('kind') === 'amas').forEach((e) => ${S}.kill(e))`); // the Bourreau alone now
await step(800);
at = await run(`(() => { const e = ${foe('bourreau')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 60, at.y + 6);
await still();
await set('bourreau', { readyAt: 0, state: 'chase', until: 0 });
await step(T.bourreau.heaveMs * 0.6);
await crop('bourreau', 'bourreau-tell', 600, 600);
await step(T.bourreau.heaveMs * 0.4 + T.bourreau.crackMs);
await crop('bourreau', 'bourreau-attack', 900, 600);
await page.screenshot({ path: `${out}/foes-bourreau-crack-full.png` });
await step(T.bourreau.chopMs + 200);
punished.Bourreau = await punish('bourreau', 'wrench');
await step(60);
await crop('bourreau', 'bourreau-wrench', 900, 600);
console.log('struck in the punish window:', JSON.stringify(punished));
await hold();
await step(1600);
at = await run(`(() => { const e = ${foe('bourreau')}; return { x: e.x, y: e.y }; })()`);
await hero(at.x - 30, at.y + 6);
await still();
await set('bourreau', { readyAt: 0, state: 'chase', until: 0 });
await step(T.bourreau.heaveMs + T.bourreau.chopMs + T.bourreau.ripMs * 0.6);
if ((await run(`${foe('bourreau')}.getData('state')`)) !== 'rip') errors.push('the Bourreau did not rip his axe out at the hero in front');
await crop('bourreau', 'bourreau-rip', 900, 600);
await step(T.bourreau.ripMs * 0.4 + T.bourreau.swingMs / 2);
await crop('bourreau', 'bourreau-swing', 900, 600);
await hold();
await step(1600);
await run(`${S}.hitEnemy(${foe('bourreau')}, 0, 0, 140, 0)`);
await step(60);
await crop('bourreau', 'bourreau-hurt', 520, 560);
await run(`(() => { ${S}.hurtEnemy(${foe('bourreau')}, ${foe('bourreau')}.getData('hp') - 1); })()`);
await step(300);
await crop('bourreau', 'bourreau-weak', 520, 560);
await step(900);
await run(`${S}.kill(${foe('bourreau')})`);
await step(1500);
await page.screenshot({ path: `${out}/foes-dead3.png` });
await clear();

// The crossbowman: idle, walking, raising and shouldering his crossbow, the bolt's glint once the aim is locked, the
// shot's kick, struck, weakened, dead.
await hero(240, 330);
await call([['crossbow', 330, 300]]);
await still();
await crop('crossbow', 'crossbow-idle', 420, 440);
await hero(150, 250);
for (const k of [0, 1, 2]) { await step(120); await crop('crossbow', `crossbow-walk${k}`, 420, 440); }
await hold();
await step(600);
await hero(150, 330);
await still();
await set('crossbow', { readyAt: 0, state: 'chase', until: 0 });
for (const [ms, what] of [[60, 'raise'], [250, 'aim'], [T.crossbow.aimMs - T.crossbow.lockMs + 60 - 310, 'lock'], [T.crossbow.lockMs + 40, 'shot']]) { await step(ms); await crop('crossbow', `crossbow-${what}`, 520, 440); }
await page.screenshot({ path: `${out}/foes-crossbow-full.png` });
await hold();
await step(1200);
await run(`${S}.hitEnemy(${foe('crossbow')}, 0, 0, 140, 0)`);
await step(60);
await crop('crossbow', 'crossbow-hurt', 420, 440);
await step(600);
await run(`(() => { ${S}.hurtEnemy(${foe('crossbow')}, ${foe('crossbow')}.getData('hp') - 1); })()`);
await step(300);
await crop('crossbow', 'crossbow-weak', 420, 440);
await step(900);
await run(`${S}.kill(${foe('crossbow')})`);
await step(1500);
await crop('crossbow', 'crossbow-dead', 420, 440).catch(() => {});
await page.screenshot({ path: `${out}/foes-dead4.png` });
await clear();
}

// The necropolis' own. Les Corneilles: on their dead, the hero coming near (they burst up cawing), wheeling over him,
// one hanging over him (the tell) and stooping (the attack), scattered by a claw. L'Enterré: under his mound, the earth
// cracking (the tell), the hero caught by the ankle (the attack), struggling free with his keys, sinking back. Le Gavé:
// waddling, eating a body the hero left (it grows), its slam (tell, attack) and its bile (tell, the pool).
const fauna = async () => {
  const S2 = (k) => run(`${foe(k)}.getData('state')`);
  await hero(330, 330);
  await call([['crows', 200, 330]]);
  await step(400);
  await crop('crows', 'crows-idle', 420, 300, -4);
  await hero(240, 330); // 40 px off: they see him
  await step(250);
  await crop('crows', 'crows-burst', 520, 360, -10);
  await step(T.crows.burstMs + 200);
  for (let t = 0; t < 4000 && !(await run(`${foe('crows')}.getData('birds').some((b) => b.mode === 'tele')`)); t += 16) await step(16);
  await step(T.crows.diveTellMs * 0.6);
  await crop('crows', 'crows-tell', 520, 400, -12);
  await step(T.crows.diveTellMs * 0.4 + T.crows.diveMs * 0.7);
  await crop('crows', 'crows-attack', 520, 400, -12);
  await page.screenshot({ path: `${out}/foes-crows-full.png` });
  await run(`(() => { const s = ${S}, b = ${foe('crows')}.getData('birds')[0]; s.slashReadyAt = 0; s.slash(Math.atan2(b.y - 10 - s.hero.y, b.x - s.hero.x)); })()`); // at one of them
  await step(300);
  if ((await S2('crows')) !== 'scatter') errors.push(`a claw did not scatter the crows: ${await S2('crows')}`);
  await crop('crows', 'crows-scatter', 620, 420, -12);
  await clear();

  // Their alarm: a fight heard near them (a claw swung), the ghoul 250 px off (out of the hero's sight) comes to look; the
  // one 400 px off does not. Out of the training room's rule (everything hunts there) for this.
  await hero(150, 330);
  await run(`(() => { const s = ${S}; s.training = false; s.place({ x: 200, y: 330 }, 'crows'); s.place({ x: 450, y: 330 }, 'ghoul'); s.place({ x: 600, y: 330 }, 'ghoul'); })()`);
  await step(300);
  await run(`(() => { const s = ${S}; s.slashReadyAt = 0; s.slash(Math.PI); })()`);
  await step(2500);
  const looked = await run(`${S}.enemies.getChildren().filter((e) => e.body?.enable && !e.getData('kind')).map((e) => ({ x: Math.round(e.x), heard: !!e.getData('heard') }))`);
  console.log('the crows\' alarm (ghouls placed at 450 and 600, the crows at 200):', JSON.stringify(looked));
  if (!(looked[0].heard && looked[0].x < 420 && !looked[1].heard && looked[1].x === 600)) errors.push(`the crows' alarm went wrong: ${JSON.stringify(looked)}`);
  await page.screenshot({ path: `${out}/foes-crows-alarm-full.png` });
  await run(`${S}.training = true`);
  await clear();

  // L'Enterré.
  await hero(330, 330);
  await call([['enterre', 240, 300]]);
  await step(300);
  await crop('enterre', 'enterre-idle', 360, 300, -4);
  await set('enterre', { readyAt: 0 }); // (call() held it)
  await run(`(() => { const s = ${S}, m = ${foe('enterre')}.body.center, h = s.hero; h.body.reset(m.x + 16 + h.x - h.body.center.x, m.y + 2 + h.y - h.body.center.y); })()`); // on its edge, beside it (not hiding it)
  await step(T.enterre.crackMs * 0.6);
  if ((await S2('enterre')) !== 'crack') errors.push(`l'Enterré did not wake: ${await S2('enterre')}`);
  await crop('enterre', 'enterre-tell', 420, 340, -4);
  await step(T.enterre.crackMs * 0.4 + 200);
  await crop('enterre', 'enterre-attack', 520, 380, -4);
  await page.screenshot({ path: `${out}/foes-enterre-full.png` });
  let presses = 0;
  while ((await run(`!!${S}.heldBy`)) && presses < 20) { await page.keyboard.press(presses % 2 ? 'a' : 'd'); await step(60); presses++; }
  console.log(`l'Enterré let go after ${presses} keys pressed anew`);
  if (presses >= 20) errors.push('the hero never struggled free of l\'Enterré');
  await step(200);
  await crop('enterre', 'enterre-sink', 420, 340, -4);
  await step(T.enterre.sinkMs);
  await run(`(() => { ${S}.hurtEnemy(${foe('enterre')}, 1); })()`);
  if ((await run(`${foe('enterre')}.getData('hp')`)) !== T.enterre.hp) errors.push('a blow reached l\'Enterré under the earth');
  await clear();

  // Le Gavé: walking, then a ghoul killed by it (the hero far): it goes and eats the body, and grows.
  await hero(330, 330);
  await call([['gave', 200, 330]]);
  await crop('gave', 'gave-idle', 480, 400, -12);
  await hero(330, 250);
  await set('gave', { readyAt: 0, state: 'chase', until: 0 });
  for (const k of [0, 1, 2]) { await step(140); await crop('gave', `gave-walk${k}`, 480, 400, -12); }
  await hold();
  await run(`(() => { const s = ${S}, e = ${foe('gave')}; e.body.reset(200, 330); s.bodies.length = 0; s.kill(s.place({ x: 236, y: 336 }, 'ghoul')); })()`);
  await hero(330, 420);
  await step(1200);
  for (let t = 0; t < 4000 && (await S2('gave')) !== 'eat'; t += 16) await step(16);
  await step(600);
  await crop('gave', 'gave-eat', 480, 400, -12);
  const before = await run(`${foe('gave')}.getData('hp')`);
  await step(T.gave.eatMs);
  const fed = await run(`(() => { const e = ${foe('gave')}; return { fed: e.getData('fed'), hp: e.getData('hp'), max: e.getData('max'), scale: +e.scaleX.toFixed(3), bodies: ${S}.bodies.length }; })()`);
  console.log('the Gavé fed on a body (hp before', before, '):', JSON.stringify(fed));
  if (fed.fed !== 1 || fed.scale <= 0.5 || fed.bodies !== 0) errors.push(`the Gavé did not feed: ${JSON.stringify(fed)}`);
  await crop('gave', 'gave-fed', 480, 400, -12);
  let at = await run(`(() => { const e = ${foe('gave')}; return { x: e.body.center.x, y: e.body.center.y }; })()`);
  await hero(at.x + 26, at.y);
  await still();
  await set('gave', { readyAt: 0, state: 'chase', until: 0 });
  await step(T.gave.slamTeleMs * 0.6);
  await crop('gave', 'gave-tell', 520, 440, -14);
  await step(T.gave.slamTeleMs * 0.4 + 60);
  await crop('gave', 'gave-attack', 600, 440, -10);
  await hold();
  await step(1500);
  at = await run(`(() => { const e = ${foe('gave')}; return { x: e.body.center.x, y: e.body.center.y }; })()`);
  await hero(at.x + 50, at.y + 6);
  await still();
  await set('gave', { readyAt: 0, state: 'chase', until: 0 });
  await step(T.gave.bileTeleMs * 0.6);
  await crop('gave', 'gave-tell2', 520, 440, -14);
  await step(T.gave.bileTeleMs * 0.4 + T.gave.spewMs * 0.7);
  await crop('gave', 'gave-attack2', 640, 440, -10);
  await step(T.gave.spewMs * 0.3 + 500);
  await crop('gave', 'gave-pool', 640, 440, -10);
  await page.screenshot({ path: `${out}/foes-gave-full.png` });
  await hold();
  await run(`${S}.kill(${foe('gave')})`);
  await step(1500);
  await page.screenshot({ path: `${out}/foes-dead5.png` });
  await clear();
};
await fauna();

// The bot plays each attack, the hero mortal and alone with the foe: standing still, then stepping out REACT ms after
// the tell starts (holding a key: the hero walks at T.hero.speed). `then(t)`, if given, is what the bot does at each
// step from then on (t: ms since the tell started), for a dodge that is more than a walk.
const REACT = 250;
await run(() => document.querySelector('[data-opt="god"]').click());
const R = await run(() => import('/src/tuning.ts').then((m) => ({ ...m.T.ringer, squash: m.T.lantern.squash })));
const struck = new Set();
async function play(kind, dx, dy, key, tell, attack, then) {
  await clear();
  await hero(240, 330);
  await call([[kind, 240 - dx, 330 - dy]]);
  await still();
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 50; s.invulnUntil = s.dazedUntil = 0; s.bodies.length = 0; }); // (no meal to tempt a Gavé)
  await set(kind, { readyAt: 0, facing: Math.atan2(dy, dx) });
  const state = () => run(`${foe(kind)}.getData('state')`), busy = () => run(`!!${foe(kind)}.getData('rings')`); // a bell's rings still rolling
  for (let t = 0; t < 2000 && (await state()) !== tell; t += 16) await step(16);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = REACT; t < 4000 && ([tell, ...attack].includes(await state()) || (await busy())); t += 16) {
    await then?.(t);
    await step(16);
    if (!struck.has(kind) && (await run(() => window.game.scene.getScene('room').health)) < 50) { // the blow as it lands: hit-stop, shake, blood
      struck.add(kind);
      const { x, y } = await run(() => { const s = window.game.scene.getScene('room'), c = s.cameras.main, k = 1920 / c.worldView.width; return { x: (s.hero.x - c.worldView.x) * k, y: (s.hero.y - c.worldView.y) * k }; });
      await page.screenshot({ path: `${out}/foes-hits-${kind}.png`, clip: { x: Math.min(Math.max(0, x - 380), 1920 - 760), y: Math.min(Math.max(0, y - 300), 1080 - 520), width: 760, height: 520 } });
    }
  }
  await step(700); // a bolt still in flight
  await keys([], ['w', 'a', 's', 'd']);
  return 50 - (await run(() => window.game.scene.getScene('room').health));
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
// Off the crack's line but still close in front of the Bourreau: a short step aside; then, `away`, out of reach REACT ms
// after he starts tearing his axe out of the stone at him.
const stay = (away) => {
  let ripAt;
  return async (t) => {
    if (t === REACT + 160) await keys([], ['s']);
    if (ripAt === undefined && (await run(`${foe('bourreau')}.getData('state')`)) === 'rip') ripAt = t;
    if (away && ripAt !== undefined && t - ripAt >= REACT && t - ripAt < REACT + 16) await keys(['d']); // released by play()
  };
};
const fights = only ? {} : {
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
if (!only) {
if (!misted) errors.push('the bot never misted through the rings');
const back = await run(`(() => { const e = ${foe('inquisitor')}, c = ${S}.hero.body.center; return { dx: Math.round(c.x - e.body.center.x), dy: Math.round(c.y - e.body.center.y), aim: +e.getData('aim').toFixed(2) }; })()`);
console.log('the hero once behind the Inquisiteur (from his feet, room px; his aim, rad):', JSON.stringify(back));
// The Amas and the Bourreau, after the Inquisiteur is looked at from behind.
Object.assign(fights, {
  'Amas, immobile': await play('amas', 26, 0, null, 'contract', ['slam']), 'Amas, s\'éloigne': await play('amas', 26, 0, 'd', 'contract', ['slam']),
  'Amas, immobile (en haut)': await play('amas', 0, -16, null, 'contract', ['slam']), 'Amas, s\'éloigne (en haut)': await play('amas', 0, -16, 'w', 'contract', ['slam']),
  'Bourreau, immobile': await play('bourreau', 50, 0, null, 'heave', ['chop']), 'Bourreau, pas de côté': await play('bourreau', 50, 0, 's', 'heave', ['chop']),
  'Bourreau, immobile (loin)': await play('bourreau', 0, 70, null, 'heave', ['chop']), 'Bourreau, pas de côté (loin)': await play('bourreau', 0, 70, 'd', 'heave', ['chop']),
  'Bourreau, reste devant après la fente': await play('bourreau', 30, 0, 's', 'heave', ['chop', 'rip', 'swing'], stay(false)),
  'Bourreau, s\'éloigne de l\'arrachement': await play('bourreau', 30, 0, 's', 'heave', ['chop', 'rip', 'swing'], stay(true)),
});
}
// The necropolis' own. A crow of the flock wheeling over him: it hangs over where he stands (the tell), then stoops on
// that spot; he stands, or walks off REACT ms into the tell. L'Enterré: woken on his mound's edge, he stands or walks off;
// caught, the bot's keys free him (checked above). Le Gavé: its slam close, its bile farther, its pool left behind.
async function peck(key) {
  await clear();
  await hero(240, 330);
  await call([['crows', 200, 330]]);
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 50; s.invulnUntil = 0; });
  for (let t = 0; t < 6000 && !(await run(`${foe('crows')}.getData('birds').some((b) => b.mode === 'tele')`)); t += 16) await step(16);
  await step(REACT);
  if (key) await page.keyboard.down(key);
  for (let t = REACT; t < 1500 && (await run(`${foe('crows')}.getData('birds').some((b) => b.mode !== 'fly')`)); t += 16) await step(16);
  await step(100);
  await keys([], ['w', 'a', 's', 'd']);
  return 50 - (await run(() => window.game.scene.getScene('room').health));
}
Object.assign(fights, {
  'Corneilles, immobile': await peck(null), 'Corneilles, s\'écarte': await peck('s'),
  'Enterré, immobile': await play('enterre', 16, 0, null, 'crack', ['grab']), 'Enterré, s\'éloigne': await play('enterre', 16, 0, 'd', 'crack', ['grab']),
  'Gavé, immobile (écrasement)': await play('gave', 26, 0, null, 'rear', ['flop']), 'Gavé, pas de côté (écrasement)': await play('gave', 26, 0, 's', 'rear', ['flop']),
  'Gavé, immobile (bile)': await play('gave', 50, 0, null, 'gorge', ['spew']), 'Gavé, pas de côté (bile)': await play('gave', 50, 0, 's', 'gorge', ['spew']),
});
await run(() => document.querySelector('[data-opt="god"]').click());
const names = Object.keys(fights), fair = names.every((n, i) => (i % 2 ? !fights[n] : fights[n] > 0));
if (!fair) errors.push(`unfair or toothless attacks: ${JSON.stringify(fights)}`);
console.log('blood lost:', JSON.stringify(fights));

await run(() => window.game.loop.wake());
console.log(`${layout}: ${empty} fps empty, ${crowd} fps with the hound pack, six pénitents, a Sonneur, an Inquisiteur, an Amas and a Bourreau fighting, ${await count()} left`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
