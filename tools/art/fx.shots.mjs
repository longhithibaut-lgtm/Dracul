// Plays each combat effect on a fixed 60 fps clock and saves one contact sheet per effect (frames left to right,
// native pixels x3), for tuning src/fx.ts. Usage: node tools/art/fx.shots.mjs [--out=dir] [--port=5205]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/fx');
const port = Number(arg('port', 5205));
const X = 4; // native -> screenshot scale
const HX = 240, HY = 150; // hero stand-in position for every scenario

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body);
// The game starts in the refuge: a run, room 1 in the crypt.
await page.evaluate(() => window.game.scene.getScene('room').scene.restart({ layout: 'hall' }));
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'hall' && window.game.scene.getScene('room').hero?.body);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.enemies?.countActive() >= 3, null, { timeout: 15000 });

// Freeze the real loop and drive the game (and the tweens' Date.now clock) by hand, one 60 fps frame per step.
await page.evaluate(async () => {
  window.Fx = await import('/src/fx.ts');
  window.T = (await import('/src/tuning.ts')).T;
  const game = window.game;
  game.loop.sleep();
  let now = Date.now(), time = game.loop.now;
  Date.now = () => now;
  window.step = (n = 1) => { for (let i = 0; i < n; i++) { now += 1000 / 60; time += 1000 / 60; game.step(time, 1000 / 60); } };
});

// Hero at (HX, HY), one tough enemy parked at (ex, ey), the others out of the way, nobody moving on their own.
const stage = (ex, ey) => page.evaluate(([hx, hy, ex, ey]) => {
  const s = window.game.scene.getScene('room');
  s.hero.setPosition(hx, hy).setVelocity(0);
  s.enemies.getChildren().forEach((e, i) => {
    e.setPosition(i ? 40 + i * 400 : ex, i ? 40 : ey).setVelocity(0);
    e.setData({ hp: 99, state: 'chase', until: 0, stunnedUntil: 1e12 });
  });
  window.step(2);
}, [HX, HY, ex, ey]);

// Captures the frames at the given times (ms since `act`), native pixels x3, as one sheet left to right.
async function sheet(name, times, act, w = 110, h = 70) {
  const clip = { x: Math.max(0, HX * X - (w * X) / 2), y: Math.max(0, Math.min(1080 - h * X, HY * X - (h * X) / 2)), width: w * X, height: h * X };
  const shown = Math.min(w * 3, 480), imgs = [];
  let frame = 0;
  await act();
  for (const ms of times) {
    const target = Math.round(ms / (1000 / 60));
    await page.evaluate((n) => window.step(n), Math.max(1, target - frame));
    frame = Math.max(frame + 1, target);
    imgs.push(`<figure><img src="data:image/png;base64,${(await page.screenshot({ clip })).toString('base64')}"><figcaption>${ms}ms</figcaption></figure>`);
  }
  const sheetPage = await browser.newPage({ viewport: { width: 400, height: 200 } });
  await sheetPage.setContent(`<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;width:${4 * (shown + 4)}px">
    <style>figure{margin:2px;position:relative}img{width:${shown}px;image-rendering:pixelated;display:block}
    figcaption{position:absolute;top:2px;left:4px;color:#fff;font:12px monospace}</style>${imgs.join('')}</body>`);
  await sheetPage.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await sheetPage.close();
}

const frames = (n) => Array.from({ length: n }, (_, i) => Math.round(((i + 1) * 1000) / 60));
const slashAt = (angle) => page.evaluate((a) => window.game.scene.getScene('room').slash(a), angle);

for (const [name, ex, ey] of [['up', HX, HY - 22], ['right', HX + 22, HY + 4], ['downleft', HX - 16, HY + 16]]) {
  await stage(ex, ey);
  await sheet(`slash-${name}`, [...frames(12), 400, 700, 1000, 1400], () => slashAt(Math.atan2(ey - HY, ex - HX)));
}

// The full combo: three swings 260 ms apart (cooldown 210, combo window 450), queued on the game clock.
await stage(HX + 18, HY - 14);
await sheet('combo', [17, 50, 100, 283, 300, 317, 350, 400, 533, 550, 567, 583, 600, 633, 667, 700], () => page.evaluate((a) => {
  const s = window.game.scene.getScene('room'), e = s.enemies.getChildren()[0], at = { x: e.x, y: e.y };
  const swing = () => { e.setPosition(at.x, at.y).setVelocity(0); s.slash(a); }; // put it back in reach after each knockback
  swing();
  s.time.delayedCall(260, swing);
  s.time.delayedCall(520, swing);
}, Math.atan2(-14, 18)));

for (const [name, angle] of [['dash-right', 0], ['dash-up', -Math.PI / 2], ['dash-downleft', (3 * Math.PI) / 4]]) {
  await stage(60, 60);
  // Same steps as RoomScene.update when the dash key is pressed.
  await sheet(name, [...frames(20), 450, 600], () => page.evaluate((a) => {
    const s = window.game.scene.getScene('room'), D = window.T.dash;
    s.facing = a;
    s.dashUntil = s.time.now + D.durationMs;
    s.dashReadyAt = s.dashUntil + D.cooldownMs;
    window.Fx.dash(s, s.hero, a);
    s.physics.velocityFromRotation(a, D.speed, s.hero.body.velocity);
  }, angle), 160, 90);
}

await stage(60, 60);
await sheet('hurt', [...frames(8), 200, 260], () => page.evaluate(() => window.Fx.hurt(window.game.scene.getScene('room'))), 480, 270);

console.log(errors.length ? `errors:\n${errors.join('\n')}` : `no page errors; sheets in ${out}`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
