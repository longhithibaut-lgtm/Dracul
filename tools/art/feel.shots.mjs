// Game feel, part 1 (docs/decisions.md): the training room (the necropolis) stepped by hand at 60 Hz in headless
// Chromium at 1920x1080, strips of crops (frames left to right, the ms since the first act on each) and the rules
// checked on the way: a combo pressed early (J), fired by the input buffer the moment each blow is ready; a mist pressed
// in a blow's committed frames, fired as they end, cutting the recovery short, then the dash strike; a Purificateur in
// his tell holding firm through two claws, his poise broken by the finisher (staggered, his tell cut short); the last
// foe's death in slow motion (thrown along the blow, torn open); foes bloodied by their wounds; the camera looking ahead
// along the walk and toward the pointer. Exits 1 on a failed check or a page error.
// Usage: node tools/art/feel.shots.mjs [--out=shots/feel --port=5213]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/feel'), port = Number(arg('port', 5213));
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) errors.push(what); };

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => window.game.scene.getScene('room').scene.restart({ training: true, layout: 'necropolis' }));
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'necropolis' && window.game.scene.getScene('room').hero?.body);
await page.click('#training summary'); // folded, out of the picture
await page.waitForTimeout(1500);
// From here the game is stepped by hand; `ev` records when blows and mists start (ms since `t0`).
await run(async () => {
  const g = window.game, T = (await import('/src/tuning.ts')).T;
  g.loop.sleep();
  window.t = g.loop.now;
  window.ev = [];
  window.seen = [];
  // A key is acted on as it is pressed (between steps), a buffered one in a step: both are noted as they show.
  const note = (s) => {
    if (s.lastSlashAt !== window.seen[0]) window.ev.push({ what: 'griffes', at: Math.round(s.lastSlashAt - window.t0), combo: s.combo, strike: s.lastSlashAt <= s.dashUntil + T.dash.strikeWindowMs && s.dashUntil > window.t0 });
    if (s.dashUntil !== window.seen[1] && s.dashUntil > s.time.now) window.ev.push({ what: 'brume', at: Math.round(s.dashUntil - T.dash.durationMs - window.t0) });
    window.seen = [s.lastSlashAt, s.dashUntil];
  };
  window.play = (ms) => {
    note(g.scene.getScene('room'));
    for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) {
      g.step((window.t += 1000 / 60), 1000 / 60);
      note(g.scene.getScene('room'));
    }
  };
});
const S = `window.game.scene.getScene('room')`;
const play = (ms) => run((ms) => window.play(ms), ms);
const T = await run(() => import('/src/tuning.ts').then((m) => m.T));
const opt = (name) => run((n) => document.querySelector(`[data-opt="${n}"]`).click(), name);
// Every foe gone, and the floor wiped of their blood and bodies, so each strip starts clean.
const clear = async () => {
  await run(`${S}.enemies.getChildren().forEach((e) => ${S}.kill(e))`);
  await play(1600);
  await run(`['enemy-stains', 'foe-corpses'].forEach((n) => ${S}.children.getByName(n)?.clear())`);
};
const hero = (x, y, facing = 0) => run(([x, y, f]) => {
  const s = window.game.scene.getScene('room');
  s.hero.body.reset(x, y);
  Object.assign(s, { facing: f, slashUntil: 0, slashReadyAt: 0, dashUntil: 0, dashReadyAt: 0, combo: 0, lastSlashAt: -1e9, commitUntil: 0 });
  s.cameras.main.centerOn(x, y);
}, [x, y, facing]);
const place = (kind, x, y, data = {}) => run(([k, x, y, d]) => { window.game.scene.getScene('room').place({ x, y }, k, { alert: true }).setData(d); }, [kind, x, y, data]);
const foe = (kind) => `${S}.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === '${kind}')`;

// A strip: `acts` ([ms, fn]) fired on time, a crop `w` x `h` room px round the room point `at` at each of `times` (ms).
const rows = [];
async function strip(label, times, acts, at, w = 120, h = 76) {
  await run(() => { const s = window.game.scene.getScene('room'); window.t0 = s.time.now; window.ev = []; window.seen = [s.lastSlashAt, s.dashUntil]; });
  const todo = [...acts], shots = [];
  let t = 0;
  for (const ms of times) {
    while (todo.length && todo[0][0] <= ms) { const [when, f] = todo.shift(); await play(when - t); t = when; await f(); }
    if (process.env.DEBUG) console.log(label, ms, await run(() => { const s = window.game.scene.getScene('room'); return [Math.round(s.time.now - window.t0), Math.round(s.lastSlashAt - window.t0), Math.round(s.slashReadyAt - window.t0), s.phase, !!s.queued, s.hero.frame.name, window.ev.length]; }));
    await play(ms - t);
    t = ms;
    const { x, y, k } = await run(([ax, ay]) => { const v = window.game.scene.getScene('room').cameras.main.worldView, k = 1920 / v.width; return { x: (ax - v.x) * k, y: (ay - v.y) * k, k }; }, [at.x, at.y]);
    const clip = { x: Math.max(0, Math.min(1920 - w * k, x - (w * k) / 2)), y: Math.max(0, Math.min(1080 - h * k, y - (h * k) / 2)), width: w * k, height: h * k };
    shots.push({ ms, png: (await page.screenshot({ clip })).toString('base64') });
  }
  rows.push(label);
  const sheet = await browser.newPage({ viewport: { width: 400, height: 200 } });
  await sheet.setContent(`<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;width:${5 * (w * 3 + 4)}px">
    <style>figure{margin:2px;position:relative}img{width:${w * 3}px;image-rendering:pixelated;display:block}
    figcaption{position:absolute;top:2px;left:4px;color:#fff;font:14px monospace;text-shadow:0 0 3px #000}</style>
    ${shots.map((s) => `<figure><img src="data:image/png;base64,${s.png}"><figcaption>${s.ms} ms</figcaption></figure>`).join('')}</body>`);
  await sheet.screenshot({ path: `${out}/feel-${label}.png`, fullPage: true });
  await sheet.close();
  return run(() => window.ev);
}
const near = (a, b) => Math.abs(a - b) <= 17; // a 60 Hz frame
const every = (ms, n, from = 0) => Array.from({ length: n }, (_, i) => from + i * ms);

// ---- A combo pressed early: J at 0, 70 (140 ms before the claws are back) and 350 (70 ms early): the buffer fires
// each blow the moment it can, the third the finisher. A passive Bourreau with blood to spare (no blow moves him).
await clear();
await opt('passive');
await hero(240, 330, 0);
await place('bourreau', 266, 332, { hp: 99, hp0: 99 });
await play(400);
let ev = await strip('combo', every(35, 15), [[0, () => page.keyboard.press('j')], [70, () => page.keyboard.press('j')], [350, () => page.keyboard.press('j')]], { x: 258, y: 318 }, 130, 84);
const claws = ev.filter((e) => e.what === 'griffes'); // (a key is read on the next frame)
console.log('combo pressed at 0, 70, 350 ms:', JSON.stringify(claws));
check(claws.length === 3 && near(claws[1].at - claws[0].at, T.slash.cooldownMs) && near(claws[2].at - claws[0].at, 2 * T.slash.cooldownMs) && claws[2].combo === 2,
  `the buffer fires each blow as the claws are back (${T.slash.cooldownMs} ms apart), the third the finisher`);

// ---- A mist pressed 17 ms into a claw: it waits out the committed frames, then cuts the recovery short; J pressed in
// the mist is the dash strike as it ends.
await clear();
await hero(220, 330, 0);
await place('penitent', 290, 332, { hp: 99, hp0: 99 });
await play(400);
ev = await strip('dash-cancel', every(25, 15), [[0, () => page.keyboard.press('j')], [17, () => page.keyboard.press('Space')], [120, () => page.keyboard.press('j')]], { x: 250, y: 322 }, 140);
const mist = ev.find((e) => e.what === 'brume'), [first, strike] = ev.filter((e) => e.what === 'griffes'), after = mist && first && mist.at - first.at;
console.log('claw at 0, mist pressed at 17, J at 120:', JSON.stringify(ev));
check(after >= T.slash.commitMs && after <= T.slash.commitMs + 17 && after < T.slash.cooldownMs, `the mist waits out the committed ${T.slash.commitMs} ms, then cuts the ${T.slash.cooldownMs} ms recovery short`);
check(!!strike?.strike, 'J pressed in the mist: the dash strike as it ends');
await opt('passive');

// ---- Poise: a Purificateur in his tell (held there), clawed at 0 and 220 (holds firm, still in his tell), then the
// finisher at 440 breaks his poise: staggered, his tell cut short, thrown back.
await clear();
await place('purifier', 210, 332, { readyAt: Infinity, hp: 99, hp0: 99 });
await hero(236, 334, Math.PI);
await play(300);
await run(`(() => { const e = ${foe('purifier')}, s = ${S}; e.body.reset(210, 332); e.setVelocity(0).setData({ state: 'ignite', fireAt: s.time.now + 1e5, facing: 0, aim: 0, readyAt: Infinity }); s.hero.body.reset(236, 334); })()`);
await play(50);
const states = [];
const claw = (i) => async () => { await run(`(() => { const s = ${S}; s.slashReadyAt = 0; s.slash(Math.PI); })()`); states[i] = await run(`(() => { const e = ${foe('purifier')}; return { state: e.getData('state'), taken: e.getData('poiseTaken'), staggered: e.getData('staggerUntil') > ${S}.time.now }; })()`); };
await strip('poise', [...every(70, 7), 440, 470, 500, 540, 600, 680, 760, 840], [[0, claw(0)], [220, claw(1)], [440, claw(2)]], { x: 214, y: 322 }, 130);
console.log('the Purificateur after each blow:', JSON.stringify(states));
check(states[0]?.state === 'ignite' && states[0].taken === 1 && states[1]?.state === 'ignite' && states[1].taken === 2 && states[2]?.state === 'chase' && states[2]?.staggered, 'two claws: he holds firm in his tell; the finisher breaks his poise, staggered');

// ---- The last foe of the fight, a ghoul, killed by the finisher: hit-stop, then slow motion, the body thrown along
// the blow and torn open.
await clear();
await opt('passive');
await hero(240, 250, 0);
await place('ghoul', 262, 252, { hp: 2, hp0: 3 });
await play(400);
const scales = [];
const slowAt = (ms) => async () => scales.push([ms, await run(`${S}.tweens.timeScale`)]);
await strip('last-kill', [...every(50, 6, 17), 350, 450, 550, 700, 850, 1100, 1500], [[0, () => run(`(() => { const s = ${S}; s.combo = 1; s.lastSlashAt = s.time.now - 100; s.slashReadyAt = 0; s.slash(0); })()`)],
  ...[60, 200, 400, 650, 900].map((ms) => [ms, slowAt(ms)])], { x: 268, y: 242 }, 140);
console.log('tweens\' time scale after the last kill (ms, scale):', JSON.stringify(scales));
const stop = T.slash.hitStopMs + T.slash.finisherHitStopMs + T.poise.breakStopMs;
check(scales[0][1] === 1 && scales[1][1] < 0.5 && scales.at(-1)[1] === 1, `${stop} ms of hit-stop, then the slow motion, back to full pace by ${stop + T.feel.slowMs} ms`);

// ---- Wounds: three Inquisiteurs and three ghouls, whole, half bled and nearly dead, dripping where they stand.
await clear();
await hero(240, 280, Math.PI / 2);
for (const [i, k] of [[0, 1], [1, 0.5], [2, 0.15]]) {
  await place('inquisitor', 200 + i * 40, 330, { hp: 6 * k, hp0: 6 });
  await place('ghoul', 200 + i * 40, 372, { hp: 3 * k, hp0: 3 });
}
await play(2500);
{ // one full crop: the drops they shed lie under them
  const { x, y, k } = await run(() => { const v = window.game.scene.getScene('room').cameras.main.worldView, k = 1920 / v.width; return { x: (240 - v.x) * k, y: (345 - v.y) * k, k }; });
  await page.screenshot({ path: `${out}/feel-wounds.png`, clip: { x: x - 75 * k, y: y - 45 * k, width: 150 * k, height: 90 * k } });
  rows.push('wounds');
}
await opt('passive');

// ---- The camera: walking right (the keys aim), it looks ahead along the walk; the mouse moved to the screen's top left,
// toward it; the hero always well inside the view.
await clear();
await hero(330, 300, 0);
const view = () => run(`(() => { const s = ${S}, c = s.cameras.main, v = c.worldView; return { off: [Math.round(-c.followOffset.x), Math.round(-c.followOffset.y)], hero: [+((s.hero.x - v.x) / v.width).toFixed(2), +((s.hero.y - v.y) / v.height).toFixed(2)] }; })()`);
await page.keyboard.down('d');
await play(1200);
const walk = await view();
await page.keyboard.up('d');
await play(1500);
const still = await view();
await page.mouse.move(200, 150);
await play(1500);
const mouse = await view();
console.log('camera look-ahead (room px; the hero where on screen, 0-1):', JSON.stringify({ walk, still, mouse }));
const inside = (v) => v.hero.every((k) => k > 0.3 && k < 0.7);
check(walk.off[0] >= T.camera.look - 2 && Math.abs(still.off[0]) <= 2 && mouse.off[0] < -10 && mouse.off[1] < -5 && [walk, still, mouse].every(inside), 'the camera looks ahead along the walk, back when he stands, toward the pointer; the hero well inside the view');

console.log(`strips: ${rows.map((r) => `${out}/feel-${r}.png`).join(' ')}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
