// Captures the game at screen shapes other than 16:9 (see scripts/shot.mjs for 1920x1080), in headless Chromium: a
// phone (the Nothing Phone (3): 20:9, DPR 3) held sideways and upright, with touch emulation, a 4:3 tablet and a 21:9
// window. In each: the crypt hall, the chapel and the cloister mid-fight (the second wave: ghouls, a crossbowman and a
// lantern), then the gift cards; on the phone also the training panel (open, then folded), and, upright, a turn to
// sideways and back mid-fight, which must keep the run as it was (room, health, enemies, gifts), and a room's entry.
// Writes <out>/<shape>-<what>.png at CSS-pixel scale, plus <out>/phone-land-crisp.png (device pixels around the hero).
// Usage: node scripts/views.mjs [--out=shots/views --port=5207 --only=phone-port]   (exit code 1 on a page error or a lost run)
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/views');
const port = Number(arg('port', 5207));
const touch = { isMobile: true, hasTouch: true };
const SHAPES = {
  'phone-land': { viewport: { width: 915, height: 412 }, deviceScaleFactor: 3, ...touch },
  'phone-port': { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, ...touch },
  tablet: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, ...touch },
  wide: { viewport: { width: 2560, height: 1080 } },
};

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
let lost = '';

for (const [shape, opts] of Object.entries(SHAPES).filter(([s]) => !arg('only', '') || s === arg('only', ''))) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${shape}: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(`${shape}: ${m.text()}`));
  const run = (f, a) => page.evaluate(f, a);
  const shot = async (what) => {
    await run(() => window.game.loop.sleep());
    await page.screenshot({ path: `${out}/${shape}-${what}.png`, scale: 'css' });
    await run(() => window.game.loop.wake());
  };
  // The room's state that a turn of the phone must keep.
  const state = () => run(() => {
    const s = window.game.scene.getScene('room');
    return { layout: s.layout, room: s.roomNo, health: s.health, gifts: s.gifts.join(), wave: s.wave,
      enemies: s.enemies.getChildren().filter((e) => e.body?.enable).length, hero: [Math.round(s.hero.x), Math.round(s.hero.y)] };
  });
  // Room 1 of `layout`, its second wave called at once, the hero out of harm's way; he walks a little first.
  const fight = async (layout, walk) => {
    await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
    await page.waitForFunction((layout) => window.game.scene.getScene('room').layout === layout && window.game.scene.getScene('room').hero, layout);
    await page.waitForTimeout(200);
    await run(() => {
      const s = window.game.scene.getScene('room');
      s.hero.body.reset(240, s.room.sections[0] - 40); // into the tall room's middle part, where wave 2 rises
      s.time.removeAllEvents();
      s.invulnUntil = Infinity;
      s.wave = 1;
      s.spawnWave();
    });
    await page.keyboard.down(walk);
    await page.waitForTimeout(500);
    await page.keyboard.up(walk);
    await page.waitForTimeout(1500);
  };

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.game?.scene.isActive('room'));
  await page.waitForTimeout(300);
  console.log(`--- ${shape}: view ${await run(() => `${window.game.scale.width}x${window.game.scale.height}`)}, touch controls: ${await run(() => !!document.querySelector('#touch'))}`);

  for (const [layout, walk] of [['hall', 'a'], ['chapel', 'd'], ['cloister', 'w']]) {
    await fight(layout, walk);
    await shot(layout);
  }
  if (shape === 'phone-land') { // device pixels: are the native pixels sharp?
    const { x, y } = await run(() => { const s = window.game.scene.getScene('room'), c = s.cameras.main; return { x: (s.hero.x - c.worldView.x) * window.innerWidth / s.scale.width, y: (s.hero.y - c.worldView.y) * window.innerHeight / s.scale.height }; });
    await page.screenshot({ path: `${out}/${shape}-crisp.png`, clip: { x: Math.max(0, x - 60), y: Math.max(0, y - 50), width: 120, height: 100 } });
  }

  // The gift cards, as shot.mjs opens them.
  await fight('hall', 's');
  await run(() => {
    const s = window.game.scene.getScene('room');
    s.gifts = ['griffes', 'nuee', 'rongeur', 'fuite', 'morsure', 'survivant', 'contagion'];
    s.hud.gifts(s.gifts);
    s.wave = s.roomNo * 3;
    for (const e of s.enemies.getChildren().filter((e) => e.body?.enable)) s.kill(e);
  });
  if (await page.waitForFunction(() => window.game.scene.getScene('room').pickup?.ready, null, { timeout: 8000 }).catch(() => null)) {
    await run(() => { const s = window.game.scene.getScene('room'), m = s.room.medallion; s.hero.body.reset(m.x, m.y - 8); });
    await page.waitForFunction(() => window.game.scene.getScene('room').cards);
    await page.waitForTimeout(600);
    await shot('gifts');
  } else errors.push(`${shape}: no gift`);

  if (shape === 'phone-port') {
    // A turn of the phone mid-fight, and back: nothing of the run may change.
    await fight('ossuary', 'd');
    await run(() => { const s = window.game.scene.getScene('room'); s.health = 3; s.hud.health(3, 5); s.gifts = ['griffes', 'nuee']; s.hud.gifts(s.gifts); });
    await run(() => window.game.loop.sleep());
    const before = await state();
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(100);
    await run(() => window.game.loop.wake());
    await page.waitForTimeout(150);
    await shot('turned');
    const after = await state();
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);
    await shot('turned-back');
    const view = await run(() => `${window.game.scale.width}x${window.game.scale.height}`);
    const keep = ['layout', 'room', 'health', 'gifts', 'wave', 'enemies'].filter((k) => before[k] !== after[k]);
    if (keep.length || Math.hypot(after.hero[0] - before.hero[0], after.hero[1] - before.hero[1]) > 12) lost = `${JSON.stringify(before)} -> ${JSON.stringify(after)}`;
    console.log(`turned mid-fight: ${lost ? `LOST ${lost}` : `kept ${JSON.stringify(after)}`}; back upright: view ${view}`);
  }

  if (shape === 'phone-port') { // room 2: the hero climbs in from the stairs, shown only above the steps
    await run(() => window.game.scene.getScene('room').scene.restart({ room: 2, layout: 'nave' }));
    await page.waitForTimeout(350);
    await shot('enter');
  }

  if (shape.startsWith('phone')) {
    await page.keyboard.press('t');
    await page.waitForSelector('#training');
    await page.waitForTimeout(300);
    await shot('training');
    await page.click('#training summary');
    await page.waitForTimeout(100);
    await shot('training-folded');
  }
  await context.close();
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || lost ? 1 : 0);
