// The grand hero's combat animations: <out>/hero-sheet.png, a contact sheet of his action frames straight from the
// sheet (src/grand-hero.png, a row per action and view, x2 on grey), and <out>/hero.png, crops of the game played by
// hand at 60 Hz on a 1920x1080 PC screen (as tools/art/walk.shots.mjs): the claw combo walking into it three ways, the
// throw, the mist's start and arrival, the bite (training room, a crossbowman clawed to his knees), hurt from the
// front, the back and a side, stunned by a bell, the idle gestures, and death. Exits 1 on a page error.
// Usage: node tools/art/hero.shots.mjs [--out=shots/hero --port=5211 --only=<part of a strip label>] (DEBUG=1: each crop's frame)
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/hero');
const port = Number(arg('port', 5211));
const only = arg('only', ''); // the strips whose label holds this (debugging one)
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ---- The contact sheet, from the sheet itself ----
const data = await readFile('src/grand.data.ts', 'utf8'), num = (k) => Number(data.match(new RegExp(`${k} = (\\d+)`))[1]);
const FW = num('FW'), FH = num('FH'), COLS = num('COLS'), FRAMES = JSON.parse(data.match(/FRAMES[^=]*= (\{.*\});/)[1]);
const png = (await readFile('src/grand-hero.png')).toString('base64');
const ACTS = ['claw0', 'claw1', 'claw2', 'fin', 'dash', 'throw', 'bite', 'hurt', 'hurtb', 'hurtl', 'hurtr', 'stagger', 'death', 'glance', 'lift', 'breath'];
const VIEWS = ['down', 'downside', 'side', 'upside', 'up'];
// A row per action, its views side by side (at the sheet's scale, a game px on the x2 view).
const cell = (name) => { const c = FRAMES[name].cell; return `<div class="c" title="${name}" style="background-position:-${(c % COLS) * FW}px -${Math.floor(c / COLS) * FH}px"></div>`; };
const lines = ACTS.map((a) => `<div style="display:flex;align-items:center;gap:14px"><div style="width:70px">${a}</div>${VIEWS.map((v) =>
  `<div style="display:flex">${Object.keys(FRAMES).filter((n) => new RegExp(`^${v}-${a}-?\\d$`).test(n)).map(cell).join('')}</div>`).join('')}</div>`);
const sheet = await browser.newPage({ viewport: { width: 80 + 30 * FW + 5 * 14 + 10, height: 400 } });
await sheet.setContent(`<style>.c{width:${FW}px;height:${FH}px;background:url(data:image/png;base64,${png}) 0 0;image-rendering:pixelated}</style>
<body style="margin:4px;background:#46464b;color:#ddd;font:14px sans-serif">${lines.join('')}</body>`);
await sheet.screenshot({ path: `${out}/hero-sheet.png`, fullPage: true });
await sheet.close();

// ---- In game ----
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(180000); // a loaded machine renders slowly
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 3, unlocks: { bite: true } }))); // the bite bought
const run = (f, a) => page.evaluate(f, a);
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body && window.game.scene.isActive('room'));
await page.waitForTimeout(1200); // the fade in
await run(() => { window.game.loop.sleep(); window.t = window.game.loop.now; });
// `ms` of game in steps of `dt` (60 Hz; coarser to stand a while), then the camera on the hero.
const play = (ms, dt = 1000 / 60) => run(([ms, dt]) => {
  const s = window.game.scene.getScene('room');
  for (let i = 0; i < Math.round(ms / dt); i++) window.game.step((window.t += dt), dt);
  s.cameras.main.centerOn(s.hero.x, s.hero.y);
  window.game.step((window.t += 0.001), 0.001);
}, [ms, dt]);
const S = 1920 / 480 / 2;
// A crop round him, wherever he is on screen (the camera kept inside a room may not centre him).
const grab = async () => {
  const [x, y] = await run(() => { const s = window.game.scene.getScene('room'), v = s.cameras.main.worldView, k = 1920 / v.width; return [(s.hero.x - v.x) * k, (s.hero.y - v.y) * k]; });
  return page.screenshot({ clip: { x: Math.max(0, Math.min(1920 - 100 * S, x - 50 * S)), y: Math.max(0, Math.min(1080 - 104 * S, y - 62 * S)), width: 100 * S, height: 104 * S } });
};
const keys = async (ks, down) => { for (const k of ks) await (down ? page.keyboard.down(k) : page.keyboard.up(k)); };
const click = (a, button = 'left') => page.mouse.click(960 + Math.cos(a) * 120, 540 + Math.sin(a) * 120, { button });
// A blow `amount` from a point `d` room px away at angle `a` from him (RoomScene.damageHero).
const blow = (a, amount = 1, d = 20) => run(([a, amount, d]) => {
  const s = window.game.scene.getScene('room'), c = s.hero.body.center;
  s.invulnUntil = 0;
  s.damageHero(amount, { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d });
}, [a, amount, d]);
const reset = (facing, at = [950, 650]) => run(([f, [x, y]]) => {
  const s = window.game.scene.getScene('room');
  s.hero.body.reset(x, y);
  Object.assign(s, { facing: f, slashUntil: 0, slashReadyAt: 0, invulnUntil: 0, dazedUntil: 0, combo: 0, lastSlashAt: -1e9, health: 50 });
}, [facing, at]);

const rows = [];
// A strip: the hero reset facing `facing`, `ks` held, `acts` ([ms, fn]) fired on time, a crop at each of `at` (ms).
async function strip(label, { facing = 0, ks = [], at, acts = [], pos, dt }) {
  if (!label.includes(only)) return;
  await reset(facing, pos);
  await play(300);
  await keys(ks, true);
  const shots = [], todo = [...acts];
  let t = 0;
  for (const ms of at) {
    while (todo.length && todo[0][0] <= ms) { const [when, f] = todo.shift(); await play(when - t); t = when; await f(); }
    await play(ms - t, dt);
    t = ms;
    if (process.env.DEBUG) console.log(label, ms, await run(() => { const s = window.game.scene.getScene('room'); return [s.hero.frame.name, Math.round(s.time.now), s.cut, s.phase, s.hero.body.velocity.x]; }));
    shots.push((await grab()).toString('base64'));
  }
  await keys(ks, false);
  rows.push({ label, shots });
}
const every = (ms, n, from = 17) => Array.from({ length: n }, (_, i) => from + i * ms);
const R = 0, D = Math.PI / 2, U = -Math.PI / 2, L = Math.PI;

// The combo walking into it: three blows 225 ms apart, then the finisher's recovery.
for (const [label, ks, a] of [['griffes, droite', ['d'], R], ['griffes, bas', ['s'], D], ['griffes, haut-gauche', ['a', 'w'], -3 * Math.PI / 4]])
  await strip(label, { facing: a, ks, at: every(45, 19), acts: [[0, () => click(a)], [225, () => click(a)], [450, () => click(a)]] });
await strip('griffes, droite, sur place', { facing: R, at: every(45, 19), acts: [[0, () => click(R)], [225, () => click(R)], [450, () => click(R)]] });
await strip('tir, bas-droite', { facing: Math.PI / 4, ks: ['d', 's'], at: every(25, 8), acts: [[0, () => click(Math.PI / 4, 'right')]] });
await strip('tir, haut', { facing: U, at: every(25, 8), acts: [[0, () => click(U, 'right')]] });
await strip('brume, droite', { facing: R, ks: ['d'], at: every(20, 14), acts: [[0, () => page.keyboard.press('Space')]] });
await strip('brume, bas', { facing: D, ks: ['s'], at: every(20, 14), acts: [[0, () => page.keyboard.press('Space')]] });
await strip('coup de face', { facing: R, at: every(30, 6), acts: [[0, () => blow(R)]] });
await strip('coup de dos', { facing: R, at: every(30, 6), acts: [[0, () => blow(L)]] });
await strip('coup de côté (sa gauche)', { facing: D, at: every(30, 6), acts: [[0, () => blow(R)]] });
const bell = () => run(() => { const s = window.game.scene.getScene('room'); s.dazedUntil = s.time.now + 900; });
await strip('cloche : sonné', { facing: D, at: every(80, 12), acts: [[0, () => blow(U)], [1, bell]] });
// A step to start his stillness (Gait.idleVariant: a gesture 2.5 s in, then every 6 s).
const nudge = async () => { await keys(['s'], true); await play(50); await keys(['s'], false); };
await strip('repos (gestes)', { facing: D, dt: 100, at: [100, 2700, 3200, 8700, 9200, 15200, 15400], acts: [[0, nudge]] });
// Death (in the refuge: the training room spares him), then the room restarts, re-formed at his coffin.
await strip('mort', { facing: D, at: every(80, 15), acts: [[0, () => run(() => { window.game.scene.getScene('room').health = 1; })], [1, () => blow(R)]] });
// The room (re)started: the game stepped until it is up, its hero standing.
const ready = async () => { for (let i = 0; i < 100 && !(await run(() => window.game.scene.isActive('room') && !!window.game.scene.getScene('room').hero?.body?.enable)); i++) await play(100); };
await play(500);
await ready();

// The bite, in the training room: a passive crossbowman clawed to his knees, then bitten.
if ('morsure'.includes(only)) {
  await run(() => window.game.scene.getScene('room').scene.restart({ training: true, layout: 'necropolis' })); // key T
  await play(200);
  await ready();
  await page.waitForSelector('#training', { timeout: 10000 });
  await page.click('#training [data-opt="passive"]');
  await page.click('#training [data-spawn="crossbow"]');
  for (let i = 0; i < 40 && !(await run(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable))); i++) await play(100);
  const prey = await run(() => { const e = window.game.scene.getScene('room').enemies.getChildren().find((e) => e.body?.enable); return { x: e.x, y: e.y }; });
  await strip('morsure', { facing: R, pos: [prey.x - 18, prey.y], at: [...every(45, 4), 230, 260, 330, 500, 700, 790, 830, 880, 960], acts: [
    [0, () => run(() => window.game.scene.getScene('room').slash(0))], // (the camera may not centre on him here: no click)
    [200, () => run(() => { const s = window.game.scene.getScene('room'), e = s.enemies.getChildren().find((e) => e.body?.enable); s.hero.body.reset(e.x - 18, e.y); s.bite(); })],
  ] });
}

const html = `<body style="margin:0;background:#111;color:#bbb;font:14px sans-serif">${rows.map((r) => `<div style="display:flex;align-items:center;gap:4px;margin:2px 4px"><div style="width:150px">${r.label}</div>${r.shots.map((b) => `<img src="data:image/png;base64,${b}" width="160">`).join('')}</div>`).join('')}</body>`;
const film = await browser.newPage({ viewport: { width: 150 + 19 * 164 + 10, height: 400 } });
await film.setContent(html);
await film.screenshot({ path: `${out}/hero.png`, fullPage: true });

console.log(errors.length ? `errors:\n${errors.join('\n')}` : `${out}/hero-sheet.png, ${out}/hero.png, no page errors`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
