// Plays L'ombre (src/shadow.ts) with synthetic touch on the phone (Nothing Phone (3), 20:9, DPR 3), upright then
// sideways, in headless Chromium: in the training room the shadow dragged around, onto a ghoul (claws), a flick (a
// shard), a double tap (the mist), a long press (the glyph), into a lantern's pool (it dissolves), onto a kneeling
// crossbowman (the bite); then room 1 of a run played by the finger alone, wave by wave, to the gift (a card tapped)
// and out through the gate. Writes <out>/<shape>-<what>.png at CSS-pixel scale.
// Usage: node scripts/shadow.mjs [--out=shots/shadow --port=5208 --only=port]   (exit code 1 on a page error or a failed step)
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/shadow');
const port = Number(arg('port', 5208));
const SHAPES = { port: { width: 412, height: 915 }, land: { width: 915, height: 412 } };

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [shape, viewport] of Object.entries(SHAPES).filter(([s]) => !arg('only', '') || s === arg('only', ''))) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${shape}: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(`${shape}: ${m.text()}`));
  const cdp = await context.newCDPSession(page);
  const run = (f, a) => page.evaluate(f, a);
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${shape}: ${what}`); if (!ok) errors.push(`${shape}: ${what}`); };
  // The whole screen, and a close-up in device pixels between the hero and his shadow.
  const shot = async (what) => {
    await run(() => window.game.loop.sleep());
    await page.screenshot({ path: `${out}/${shape}-${what}.png`, scale: 'css' });
    const c = await run(() => {
      const s = window.game.scene.getScene('room'), r = s.game.canvas.getBoundingClientRect(), k = r.width / s.scale.width, v = s.cameras.main.worldView;
      return { x: r.left + ((s.hero.x + s.shade.x) / 2 - v.x) * k, y: r.top + ((s.hero.y + s.shade.y) / 2 - v.y) * k };
    });
    const w = 150, h = 110;
    await page.screenshot({ path: `${out}/${shape}-${what}-zoom.png`, clip: { x: Math.min(Math.max(c.x - w / 2, 0), viewport.width - w), y: Math.min(Math.max(c.y - h / 2, 0), viewport.height - h), width: w, height: h } });
    await run(() => window.game.loop.wake());
  };
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // A finger from (x, y) by (dx, dy) CSS px over about `ms`, then lifted (or not). Each touch event takes a frame or so
  // to go through here (~50 ms in SwiftShader), so the steps are that long.
  const swipe = async (x, y, dx, dy, ms, lift = true) => {
    await touch('touchStart', x, y);
    const n = Math.max(2, Math.round(ms / 50));
    for (let i = 1; i <= n; i++) await touch('touchMove', x + (dx * i) / n, y + (dy * i) / n);
    if (lift) await touch('touchEnd');
  };
  const tap = async () => { await touch('touchStart', viewport.width / 2, viewport.height * 0.7); await wait(50); await touch('touchEnd'); };
  const scene = () => window.game.scene.getScene('room');
  const settle = () => page.waitForFunction(() => !window.game.scene.getScene('room').shade.free, null, { timeout: 3000 }).catch(() => {});
  const S = () => run(() => { const s = window.game.scene.getScene('room'); return { x: s.shade.x, y: s.shade.y, free: s.shade.free, mark: s.shade.mark ?? '', hx: s.hero.body.center.x, hy: s.hero.body.center.y }; });
  // Drag the shadow onto room point (x, y): finger travel = room travel / gain, in one or more strokes that stay on the screen.
  const shadeTo = async (x, y) => {
    for (let k = 0; k < 4; k++) {
      const { css, dx, dy } = await run(([x, y]) => {
        const s = window.game.scene.getScene('room'), r = s.game.canvas.getBoundingClientRect(), css = r.width / s.scale.width;
        return { css, dx: (x - s.shade.x) * css / window.T.shadow.gain, dy: (y - s.shade.y) * css / window.T.shadow.gain };
      }, [x, y]);
      if (Math.hypot(dx, dy) < 14) return; // a shorter stroke would be a tap
      const max = Math.min(viewport.width, viewport.height) * 0.7, k2 = Math.min(1, max / Math.hypot(dx, dy));
      await swipe(viewport.width / 2 - (dx * k2) / 2, viewport.height / 2 - (dy * k2) / 2, dx * k2, dy * k2, 320);
      await wait(30);
    }
  };

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.game?.scene.isActive('room'));
  await run(async () => { window.T = (await import('/src/tuning.ts')).T; });
  // The training room, its panel folded, enemies as dummies.
  await run(() => window.game.scene.getScene('room').scene.restart({ training: true, layout: 'hall' }));
  await page.waitForSelector('#training');
  await page.click('#training [data-opt="passive"]');
  await page.click('#training summary');
  await wait(400);
  check(await run(() => !!window.game.scene.getScene('room').shade && !document.querySelector('#touch .pad') && document.querySelectorAll('#touch button').length === 2), 'shadow mode by default, no stick nor action buttons');
  await run(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(240, s.room.sections[0] - 40); s.cameras.main.centerOn(s.hero.x, s.hero.y); });
  await wait(300);
  await shot('start');

  // Drag: the shadow goes ahead, the body follows it and stops on it.
  let a = await S();
  await swipe(viewport.width / 2, viewport.height / 2, 50, -30, 300, false);
  await wait(120);
  await shot('drag');
  await touch('touchEnd');
  let b = await S();
  check(b.free && Math.hypot(b.x - a.x, b.y - a.y) > 40, `drag moves the shadow (${Math.round(b.x - a.x)}, ${Math.round(b.y - a.y)})`);
  await wait(1200);
  let c = await S();
  check(!c.free && Math.hypot(c.hx - b.x, c.hy - b.y) < 3, 'the body walked onto the shadow and it lies under him again');

  // Onto a ghoul: claws.
  await run(() => { const s = window.game.scene.getScene('room'); s.spawn({ x: s.hero.x + 60, y: s.hero.y + 10 }, 'ghoul'); });
  await wait(900);
  let g = await run(() => { const e = window.game.scene.getScene('room').enemies.getChildren().find((e) => e.body?.enable); return { x: e.body.center.x, y: e.body.center.y }; });
  await shadeTo(g.x, g.y);
  await wait(250);
  await shot('target');
  check((await S()).mark === 'claw', 'the shadow on the ghoul marks it for the claws');
  await page.waitForFunction(() => !window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable), null, { timeout: 5000 }).catch(() => {});
  await wait(60);
  check(await run(() => !window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable)), 'the body clawed the ghoul down');
  await wait(800);

  // A flick: a shard thrown its way, the shadow left where it was.
  await settle();
  a = await S();
  await touch('touchStart', viewport.width / 2, viewport.height / 2);
  await touch('touchMove', viewport.width / 2 + 70, viewport.height / 2); // one quick stroke: a touch event takes ~50 ms here
  await touch('touchEnd');
  await wait(30);
  b = await S();
  const shards = await run(() => window.game.scene.getScene('room').shards.getLength());
  // Under him it stays under him, though he took a half step into the throw while the flick still looked like a drag.
  check(shards > 0 && b.free === a.free && Math.hypot(b.x - a.x, b.y - a.y) < 12, `a flick throws a shard and leaves the shadow be (${shards} shard, moved ${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px)`);
  await shot('flick');
  await wait(500);

  // A double tap: the mist into the shadow, farther than a plain dash.
  await settle();
  a = await S();
  await shadeTo(a.hx - 70, a.hy);
  a = await S();
  await tap(); await wait(90); await tap();
  await wait(60);
  check(await run(() => { const s = window.game.scene.getScene('room'); return s.time.now < s.dashUntil; }), 'a double tap mists into the shadow');
  await shot('mist');
  await wait(400);
  b = await S();
  check(Math.hypot(b.hx - a.x, b.hy - a.y) < 6, `the mist went into the shadow (${Math.round(Math.hypot(a.hx - a.x, a.hy - a.y))} px)`);
  await wait(200);

  // A long press: the ring fills, then the glyph.
  await touch('touchStart', viewport.width / 2, viewport.height * 0.7);
  await wait(300);
  await shot('charge');
  await wait(250);
  await touch('touchEnd');
  await wait(200);
  await shot('glyph');
  check(await run(() => !!window.game.scene.getScene('room').glyph), 'a long press casts the glyph');
  await wait(400);

  // A lantern: the shadow left in its light dissolves and goes back to the body.
  const l = await run(() => { const s = window.game.scene.getScene('room'), l = s.addLantern(); return l && { x: l.x, y: l.y }; });
  check(!!l, 'a lantern was planted');
  if (l) {
    await wait(1100);
    await shadeTo(l.x + 22, l.y + 6);
    await wait(150);
    await shot('light');
    await wait(600);
    await shot('dissolved');
    check(!(await S()).free, 'the shadow dissolved in the holy light and lies under the body again');
  }

  // A kneeling crossbowman: the bite.
  await run(() => window.game.scene.getScene('room').time.removeAllEvents());
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 3; s.hud.health(3, 5); s.lanterns.forEach((l) => s.hitLantern(l, 0, Infinity)); s.spawn({ x: s.hero.x - 50, y: s.hero.y + 20 }, 'crossbow'); });
  await wait(900);
  const bow = await run(() => { const s = window.game.scene.getScene('room'), e = s.enemies.getChildren().find((e) => e.body?.enable); s.hurtEnemy(e, 1); return { x: e.body.center.x, y: e.body.center.y, kneel: s.kneeling(e) }; });
  check(bow.kneel, 'the crossbowman kneels');
  await shadeTo(bow.x, bow.y);
  await wait(30);
  await shot('prey');
  check((await S()).mark === 'bite' || (await run(() => !!window.game.scene.getScene('room').prey)), 'the shadow on the kneeling crossbowman marks it for the bite');
  await wait(200);
  await shot('bite');
  await wait(1200);
  check(await run(() => window.game.scene.getScene('room').health === 4), 'the body bit him and drank (3 -> 4 blood)');

  // Room 1 of a run, by the finger alone: every wave clawed, the gift, the gate.
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'hall' }));
  await page.waitForFunction(() => !document.querySelector('#training') && window.game.scene.getScene('room').hero);
  await run(() => { window.game.scene.getScene('room').invulnUntil = Infinity; });
  const t0 = Date.now();
  let shotFight = false;
  while (Date.now() - t0 < 120000) {
    const st = await run(() => {
      const s = window.game.scene.getScene('room'), live = s.enemies.getChildren().filter((e) => e.body?.enable), h = s.hero.body.center;
      const d = (e) => Math.hypot(e.body.center.x - h.x, e.body.center.y - h.y);
      const e = live.sort((a, b) => d(a) - d(b))[0];
      return { phase: s.phase, e: e && { x: e.body.center.x, y: e.body.center.y }, onIt: !!s.shade.target, due: s.waveDue, hy: h.y, top: s.room.bounds.y };
    });
    if (st.phase !== 'fight' && st.phase !== 'enter') break;
    if (st.e && !st.onIt) await shadeTo(st.e.x, st.e.y);
    else if (!st.e && st.due) await shadeTo(240, st.hy - 120); // up into the next part, where the next wave waits
    if (st.e && st.onIt && !shotFight && Date.now() - t0 > 4000) { await shot('fight'); shotFight = true; }
    await wait(300);
  }
  check(await run(() => window.game.scene.getScene('room').phase === 'gift'), 'room 1 cleared by the finger');
  await page.waitForFunction(() => window.game.scene.getScene('room').pickup?.ready, null, { timeout: 8000 }).catch(() => {});
  const m = await run(() => window.game.scene.getScene('room').room.medallion);
  for (let k = 0; k < 6 && !(await run(() => !!window.game.scene.getScene('room').cards)); k++) { await shadeTo(m.x, m.y); await wait(1200); }
  check(await run(() => !!window.game.scene.getScene('room').cards), 'the shadow led him onto the gift: the cards');
  await wait(700);
  await shot('gifts');
  // Tap the first card: its middle, in CSS px.
  const card = await run(() => {
    const s = window.game.scene.getScene('room'), r = s.game.canvas.getBoundingClientRect(), k = r.width / s.scale.width;
    for (let y = 0; y < s.scale.height; y += 4) for (let x = 0; x < s.scale.width; x += 4) if (s.cards.at(x, y) === 0) return { x: r.left + (x + 20) * k, y: r.top + (y + 30) * k };
  });
  await touch('touchStart', card.x, card.y); await wait(60); await touch('touchEnd');
  await page.waitForFunction(() => window.game.scene.getScene('room').phase === 'exit', null, { timeout: 4000 }).catch(() => {});
  check(await run(() => window.game.scene.getScene('room').phase === 'exit' && window.game.scene.getScene('room').gifts.length === 1), 'a tap took the card, the gate rises');
  await wait(1300);
  const gate = await run(() => { const s = window.game.scene.getScene('room'); return { x: s.room.gate.x, y: s.room.bounds.y + 3 }; });
  for (let k = 0; k < 8 && (await run(() => window.game.scene.getScene('room').roomNo === 1 && window.game.scene.getScene('room').phase === 'exit')); k++) { await shadeTo(gate.x, gate.y); await wait(900); }
  await page.waitForFunction(() => window.game.scene.getScene('room').roomNo === 2, null, { timeout: 5000 }).catch(() => {});
  check(await run(() => window.game.scene.getScene('room').roomNo === 2), 'out through the gate: room 2');
  await wait(1400);
  await shot('room2');
  await context.close();
}

// On a PC the shadow is off (keyboard and mouse as ever) until its box is ticked in the training room; then the mouse,
// left button held, is the finger.
if (!arg('only', '') || arg('only', '') === 'pc') {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(`pc: ${e.message}`));
  const run = (f, a) => page.evaluate(f, a);
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} pc: ${what}`); if (!ok) errors.push(`pc: ${what}`); };
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.game?.scene.isActive('room'));
  check(await run(() => !window.game.scene.getScene('room').shade), 'no shadow by default');
  await page.keyboard.press('t');
  await page.waitForSelector('#training');
  await page.click('#training [data-opt="shadow"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').shade);
  await new Promise((r) => setTimeout(r, 400));
  const a = await run(() => window.game.scene.getScene('room').shade.x);
  await page.mouse.move(700, 600);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(700 - i * 15, 600);
  await page.mouse.up();
  const b = await run(() => window.game.scene.getScene('room').shade);
  check(b.free && b.x < a - 30, `a mouse drag moves the shadow (${Math.round(b.x - a)} px)`);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/pc-drag.png` });
  await page.close();
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors, every step passed');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
