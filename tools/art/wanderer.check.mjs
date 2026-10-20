// Contact sheet of the new hero (the wanderer) moving in the game: idle facing down, running left (scarf streaming),
// stopped (scarf falling back), running up (back view), running down, mid-dash: shots/wanderer.png (crops at x4, labelled).
// Then a filmstrip of each view's run cycle, every frame in order: shots/walk.png; then the action poses with their
// effects, a row per view and the bite: shots/poses.png. --old does the same for the old hero
// (wanderer-old.png, walk-old.png, poses-old.png), to compare; --dark for the torture room's vampire, in its room
// (wanderer-dark.png...). Usage: node tools/art/wanderer.check.mjs [--old|--dark] [--port=5207] [--out=shots].
// Exit code 1 on a page error.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const port = Number(arg('port', 5207)), out = arg('out', 'shots'), old = process.argv.includes('--old'), dark = process.argv.includes('--dark'), tag = old ? '-old' : dark ? '-dark' : '';
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' }); // no reload mid-capture on an edit
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero);
await page.keyboard.press('t');
await page.waitForSelector('#training');
if (old) { // the new hero is the default: tick him off for the old one
  await page.click('#training [data-opt="wanderer"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').hero?.texture.key === 'hero');
}
if (dark) {
  await page.evaluate(() => window.game.scene.getScene('room').scene.restart({ training: true, layout: 'torture' }));
  await page.waitForFunction(() => window.game.scene.getScene('room').hero?.texture.key === 'wanderer-dark');
}
await page.evaluate(() => (document.querySelector('#training').hidden = true));
await page.waitForTimeout(1600); // the title card is gone

let tiles = [];
// Each shot pauses the room scene, not the game loop: a slept loop wakes with a long frame the hero catches up in one
// step, which the scarf would take for a lash.
const snap = async (label, { w, h, dy } = dark ? { w: 280, h: 224, dy: 6 } : { w: 200, h: 144, dy: 4 }) => { // the dark hero stands 40 px tall
  // Not on a frame where an invulnerable hero blinks out (latched in a bite, he does).
  const { x, y } = await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); if (s.hero.alpha > 0.5) { s.scene.pause(); const v = s.cameras.main.worldView; return { x: s.hero.x - v.x, y: s.hero.y - v.y }; } }).then((h) => h.jsonValue());
  await page.waitForTimeout(50); // a render of the paused frame
  const hw = w / 8, hh = h / 8, cx = Math.max(hw, Math.min(480 - hw, x)), cy = Math.max(hh, Math.min(270 - hh, y - dy));
  tiles.push({ label, w, h, png: (await page.screenshot({ clip: { x: (cx - hw) * 4, y: (cy - hh) * 4, width: w, height: h } })).toString('base64') });
  await page.evaluate(() => window.game.scene.getScene('room').scene.resume());
};
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); };

await snap('repos, face');
await hold('a', 700);
await snap('course, profil');
await page.keyboard.up('a');
await page.waitForTimeout(250);
await snap('arrêt (0,25 s)');
await page.waitForTimeout(900);
await snap('arrêt (1,1 s)');
await hold('w', 700);
await snap('course, dos');
await page.keyboard.up('w');
await hold('s', 700);
await snap('course, face');
await page.keyboard.press('Space');
await page.waitForTimeout(60);
await snap('brume');
await page.keyboard.up('s');

// A sheet: a plain page of the crops, screenshotted.
const sheet = await browser.newPage({ viewport: { width: 1700, height: 400 } });
const save = async (name, rows) => {
  await sheet.setContent(`<body style="margin:0;background:#0b0710;color:#e8dcc8;font:16px Georgia,serif;padding:8px;display:grid;gap:8px">${rows
    .map((row) => `<div style="display:flex;flex-wrap:wrap;gap:8px">${row.map((t) => `<figure style="margin:0"><img src="data:image/png;base64,${t.png}" width="${t.w}" height="${t.h}" style="display:block;image-rendering:pixelated"><figcaption>${t.label}</figcaption></figure>`).join('')}</div>`)
    .join('')}</body>`);
  await sheet.screenshot({ path: `${out}/${name}${tag}.png`, fullPage: true });
};
await save('wanderer', [tiles]);

// Filmstrip: from the middle of the room, each view's run cycle, one crop per frame shown, until a frame comes back.
const strips = [];
for (const [key, label] of [['a', 'profil'], ['s', 'face'], ['w', 'dos']]) {
  await page.evaluate(() => window.game.scene.getScene('room').hero.body.reset(300, 150));
  await page.waitForTimeout(400);
  tiles = [];
  const seen = [];
  await page.keyboard.down(key);
  for (;;) {
    const name = await page.waitForFunction((seen) => { const f = window.game.scene.getScene('room').hero.frame.name; return f.includes('-run') && f !== seen.at(-1) && f; }, seen, { timeout: 3000 }).then((h) => h.jsonValue(), () => null);
    if (!name || seen.includes(name)) break;
    seen.push(name);
    await snap(`${label} ${name.split('-run')[1]}`);
    await page.keyboard.up(key); // a paused scene lets go of held keys: press it again
    await page.keyboard.down(key);
  }
  await page.keyboard.up(key);
  strips.push(tiles);
}
await save('walk', strips);

// The action poses, with their effects, a row per view: the three slashes of a combo, two throws, the cast;
// last, the bite on a weakened crossbowman. Wider crops, the slash arc reaches 30 px out.
const wide = { w: 320, h: 224, dy: 8 };
const act = (f, arg) => page.evaluate(f, arg);
const rows = [];
for (const [a, label] of [[0, 'profil'], [Math.PI / 2, 'face'], [-Math.PI / 2, 'dos']]) {
  tiles = [];
  await act(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(240, 160); s.glyphReadyAt = 0; });
  await page.waitForTimeout(400);
  // The dark room runs at a few fps headless, which would skip his actions' 30-60 ms steps: there the game is stepped
  // by hand at 60 fps while they are shot, each on its strike (claw<combo>-1, throw-1, cast-1).
  const tick = (ms, re) => act(([ms, re]) => {
    const g = window.game, h = g.scene.getScene('room').hero;
    for (let t = 0; t < ms && !(re && new RegExp(re).test(h.frame.name)); t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60);
  }, [ms, re]);
  if (dark) await act(() => window.game.loop.sleep());
  for (const [n, call, ms, gap] of [['coup 1', 'slash', 40, 120], ['coup 2', 'slash', 40, 120], ['coup 3', 'slash', 50, 500], ['tir 1', 'shoot', 30, 450], ['tir 2', 'shoot', 30, 450], ['glyphe', 'cast', 80, 400]]) {
    await act(([a, call]) => {
      const s = window.game.scene.getScene('room'), h = s.hero;
      s[call](call === 'cast' ? { x: h.x + Math.cos(a) * 60, y: h.y + Math.sin(a) * 60 } : a);
    }, [a, call]);
    await (dark ? tick(400, '-(claw\\d|throw|cast)-1$') : page.waitForTimeout(ms));
    await snap(`${label}, ${n}`, wide);
    await (dark ? tick(Math.max(gap, 250)) : page.waitForTimeout(gap)); // stepped, the next claw waits out the cooldown
  }
  if (dark) await act(() => window.game.loop.wake());
  rows.push(tiles);
}
tiles = [];
await act(() => { const s = window.game.scene.getScene('room'); s.spawn({ x: 240, y: 150 }, 'crossbow', 1); });
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable));
for (const side of [-1, 1]) {
  await act((side) => {
    const s = window.game.scene.getScene('room'), e = s.enemies.getChildren().find((e) => e.body?.enable);
    s.hero.body.reset(e.x + side * 16, e.y);
    s.facing = side < 0 ? 0 : Math.PI;
    s.bite();
  }, side);
  await page.waitForTimeout(220);
  await snap(`morsure ${side < 0 ? '→' : '←'}`, wide);
  if (side < 0) { // a second weakened one for the other side
    await page.waitForTimeout(800);
    await act(() => window.game.scene.getScene('room').spawn({ x: 240, y: 150 }, 'crossbow', 1));
    await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable));
  }
}
rows.push(tiles);
await save('poses', rows);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `ok: ${out}/wanderer${tag}.png, ${out}/walk${tag}.png, ${out}/poses${tag}.png`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
