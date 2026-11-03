// The prologue (src/prologue.ts) played start to end in headless Chromium at 1920x1080, the game stepped by hand at
// 60 Hz: a bot walks each beat (it follows the rat, fights the ghoul with its claws, burns once in the ray and mists
// through it, comes up behind the crossbowman and strikes, carries his blood up to the refuge, pours it, passes the four
// coffins, lies in his own) and saves a capture of each beat in shots/prologue/. Then a death mid-prologue (back in the
// crypt's sarcophagus) and Échap twice (passed). Exits 1 on a page error or a failed check.
// Usage: node tools/prologue.shots.mjs [--out=shots/prologue --port=5221 --from=refuge]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/prologue'), port = Number(arg('port', 5221)), from = arg('from', ''); // --from=refuge: the refuge's beats alone
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) run(() => JSON.stringify(window.state())).then((s) => console.log('   ', s), () => {}); if (!ok) errors.push(what); return ok; };
let n = 0;
const shot = async (name) => { await page.waitForTimeout(400); await run(() => window.draw()); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log('  ', f); };

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
// The bot, in the page: the game stepped by hand; the hero walked by his keys (set down or up each frame).
await run(() => {
  const g = window.game, S = () => g.scene.getScene('room');
  g.loop.sleep();
  window.t = g.loop.now;
  window.S = S;
  const keys = (dx, dy) => { const k = S().keys; if (!k) return; k.D.isDown = dx > 0; k.A.isDown = dx < 0; k.S.isDown = dy > 0; k.W.isDown = dy < 0; };
  window.keys = keys;
  window.play = (ms, each) => { for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) { if (each?.() === true) break; g.headlessStep((window.t += 1000 / 60), 1000 / 60); S().cameras?.main?.preRender(); } }; // (the camera follows, and the zone streams round it, in its preRender) // (drawn only for a capture: software WebGL at 1080p is slow)
  window.draw = () => g.step((window.t += 1000 / 60), 1000 / 60);
  /** Walks to (x, y) by the walk grid, to within `r` px, for `ms` at most; true there. */
  window.walk = (x, y, r = 8, ms = 20000) => {
    let s = S(), steps = s.stepsTo({ x, y }), done = false;
    const b = () => s.room.bounds, cols = () => Math.ceil(b().width / 8);
    window.play(ms, () => {
      if (done || S() !== s || !s.hero?.body) return keys(0, 0) ?? true;
      const f = s.hero.body.center;
      if (Math.hypot(f.x - x, f.y - y) < r) { done = true; return keys(0, 0); }
      let c = s.cellOf(f), to = { x, y };
      const cx = c % cols(), next = [c - cols(), c + cols(), c - 1, c + 1, c - cols() - 1, c - cols() + 1, c + cols() - 1, c + cols() + 1]
        .filter((m) => Math.abs((m % cols()) - cx) <= 1 && steps[m] < steps[c]).sort((m, o) => steps[m] - steps[o])[0];
      if (next !== undefined && steps[c] > 2) to = { x: b().x + (next % cols()) * 8 + 4, y: b().y + Math.floor(next / cols()) * 8 + 4 };
      const dx = to.x - f.x, dy = to.y - f.y;
      keys(Math.abs(dx) > 2 ? Math.sign(dx) : 0, Math.abs(dy) > 2 ? Math.sign(dy) : 0);
    });
    keys(0, 0);
    return done;
  };
  window.state = () => { const s = S(), f = s.hero?.body?.center; return { layout: s.layout, beat: s.prologue?.beat, phase: s.phase, cut: s.cut, x: f && Math.round(f.x), y: f && Math.round(f.y), carried: s.carried, health: s.health, active: s.sys.isActive() }; };
  /** Claws at `e` from where he stands, until it dies (`ms` at most), stepping closer when out of reach. */
  window.fight = (e, ms = 15000) => {
    const s = S();
    window.play(ms, () => {
      if (!e.body?.enable) return keys(0, 0) ?? true; // dead: done
      const f = s.hero.body.center, d = Math.hypot(e.x - f.x, e.y - f.y), a = Math.atan2(e.y - f.y, e.x - f.x);
      if (d > 24) keys(Math.abs(Math.cos(a)) > 0.38 ? Math.sign(Math.cos(a)) : 0, Math.abs(Math.sin(a)) > 0.38 ? Math.sign(Math.sin(a)) : 0);
      else { keys(0, 0); if (s.time.now >= s.slashReadyAt) s.press(() => s.slash(a)); }
    });
    keys(0, 0);
    return !e.body?.enable;
  };
});
const play = (ms) => run((ms) => window.play(ms), ms);
const state = () => run(() => window.state());
const walk = (x, y, r, ms) => run(([x, y, r, ms]) => window.walk(x, y, r, ms), [x, y, r, ms]);
/** Plays until `cond` (page code) holds, `ms` of game time at most, giving the page real time too (its loads). */
async function until(cond, ms = 20000) {
  for (let t = 0; t < ms; t += 100) {
    if (await run((c) => { try { return !!new Function(`return ${c}`)(); } catch { return false; } }, cond)) return true;
    await play(100);
    await page.waitForTimeout(15);
  }
  return false;
}
const press = async (key) => { await page.keyboard.press(key); await play(50); };

if (from !== 'refuge') {
// ---- 1. Le noir ----
await run(() => import('/src/prologue.ts').then((P) => P.startPrologue(window.game)));
await until(`window.S().layout === 'hall' && window.S().sys.isActive() && window.S().prologue`, 30000);
check((await state()).beat === 'noir' && (await state()).layout === 'hall', 'Nouvelle partie: the prologue starts in the crypt, black');
await play(1200);
await shot('noir-1');
await play(3200);
await shot('noir-3');
check(await until(`window.S().prologue?.beat === 'pieu'`, 12000), 'the three captions, then the stake');
// ---- 2. Le pieu ----
await play(3000);
await shot('pieu');
await press('KeyF');
await play(350);
await shot('pieu-arrache');
await play(1200);
await shot('debout');
check((await state()).beat === 'rat', 'F tears the stake out: he rises');
// ---- 3. Le rat ----
await play(1600);
await shot('rat');
const ratFollow = (cond, ms) => run(([c, ms]) => { // walks after the rat until `c`
  const s = window.S(), stop = new Function(`return ${c}`);
  let ok = false;
  for (let k = 0; k < ms / 500 && !ok; k++) {
    const r = s.prologue && s.children.list.find((o) => o.texture?.key === 'rat' && o.active);
    if (r) window.walk(r.x, r.y + 4, 22, 500); else window.play(500);
    ok = stop();
  }
  return ok;
}, [cond, ms]);
check(await ratFollow(`window.S().hud && Math.hypot(window.S().hero.x - 392, window.S().hero.y - 240) < 70`, 20000), 'the rat leads him past the emptied sarcophagi');
await play(300);
await shot('sceaux');
// ---- 4. La goule ----
check(await ratFollow(`window.S().prologue.beat === 'goule'`, 20000), 'the ghoul turns from its meal');
await shot('goule');
await play(900);
const killed = await run(() => { const s = window.S(), e = s.enemies.getChildren().find((e) => e.body?.enable); return window.fight(e); });
check(killed && (await state()).beat === 'rai', 'the ghoul clawed to death');
await shot('goule-morte');
await run(() => { const s = window.S(), d = s.drops[0]; if (d) window.walk(d.x, d.y, 6, 6000); });
await play(400);
await shot('sang');
check((await state()).carried > 0, 'its blood picked up');
// ---- 5. Le rai ----
const ray = await run(() => import('/src/prologue.data.ts').then((m) => m.CRYPT.ray));
await walk(240, ray[0] - 20, 6, 15000);
await play(800);
await shot('rai');
const hp0 = (await state()).health;
await run(() => { window.keys(0, 1); window.play(400); window.keys(0, 0); window.play(300); });
await shot('rai-brule');
const burnt = await state();
check(burnt.health < hp0 && burnt.y < ray[0], `on foot he burns (${hp0} → ${burnt.health}) and is thrown back`);
await play(1500);
await walk(240, ray[0] - 12, 4, 4000);
await run(() => { const s = window.S(); window.keys(0, 1); window.play(50); s.dashPressedAt = s.time.now; window.play(80); });
await shot('brume');
await run(() => { window.play(250); window.keys(0, 0); });
const through = await state();
check(through.y > ray[1] && through.health === burnt.health, 'in his mist he goes through, unburnt');
// ---- 6. La nécropole ----
await walk(240, 640, 6, 8000);
check(await until(`window.S().layout === 'necropolis' && window.S().phase === 'play'`, 8000), 'up the crypt stairs into the necropolis');
await play(1600);
await shot('necropole');
const guard = await run(() => { const e = window.S().enemies.getChildren().find((e) => e.getData('kind') === 'crossbow'); return { x: e.x, y: e.y }; });
// round to his back: well south of him, then straight up behind him
await walk(guard.x + 6, guard.y + 70, 8, 30000);
await walk(guard.x + 2, guard.y + 30, 4, 6000);
await shot('guet');
const crossbowAware = await run(() => window.S().enemies.getChildren().find((e) => e.getData('kind') === 'crossbow').getData('alert'));
check(!crossbowAware, 'the crossbowman on watch has not seen him behind');
await run(() => { const s = window.S(), e = s.enemies.getChildren().find((e) => e.getData('kind') === 'crossbow'); window.fight(e, 8000); });
await play(200);
await shot('frappe');
await run(() => { const s = window.S(), d = s.drops[s.drops.length - 1]; if (d) window.walk(d.x, d.y, 6, 6000); });
await play(300);
await shot('poids');
check((await state()).beat === 'poids' && (await state()).carried >= 300, 'his blood carried, heavy');
const door = await run(() => import('/src/necropolis.data.ts').then((m) => m.DOORS.refuge));
await walk(door.x, door.y + 12, 6, 15000);
await run(() => { window.keys(0, -1); window.play(1200); window.keys(0, 0); });
check(await until(`window.S().layout === 'refuge' && window.S().phase === 'play'`, 8000), 'up the stairs into the refuge');
} else {
  await run(() => import('/src/prologue.ts').then((P) => P.startPrologue(window.game)));
  await until(`window.S().prologue`, 30000);
  await run(() => window.S().scene.restart({ layout: 'refuge', entry: 0, carried: 340, prologue: 'refuge' }));
  check(await until(`window.S().layout === 'refuge' && window.S().phase === 'play'`, 30000), 'in the refuge');
}
// ---- 7. Le refuge ----
await walk(840, 740, 6, 8000);
await play(600);
await shot('refuge-noir');
await walk(840, 686, 4, 6000);
await play(1200);
await shot('verse');
await play(2600);
await shot('ronge-lucide');
check(await until(`window.S().prologue.beat === 'cercueils' && !window.S().cut`, 40000), 'le Rongé speaks, then lets him go');
check((await run(() => JSON.parse(localStorage.getItem('dracul.save')).banked)) === 0, 'nothing banked: he drank it');
// ---- 8. Les quatre cercueils ----
const R = await run(() => import('/src/prologue.data.ts').then((m) => m.REFUGE));
for (const i of [1, 3, 2, 0]) { const p = R.coffins[i]; await walk(p.x, p.y, 10, 15000); await play(500); if (i === 1 || i === 0) await shot(`cercueil-${i}`); } // the Rat's last: its sign in view
if (await until(`window.S().children.list.some((o) => o.texture?.key === 'rat' && o.getData('high'))`, 15000)) await shot('rat-signe'); // up on the Rat's coffin
check(await until(`window.S().prologue.beat === 'cercueil'`, 15000), 'the four coffins, the nobles, the rat gone');
await shot('rat-parti');
await walk(R.mine.x, R.mine.y, 6, 10000);
await press('KeyF');
await play(700);
await shot('couche');
await play(2600);
await shot('dracul');
check(await until(`window.S().layout === 'refuge' && !window.S().prologue && window.S().sys.isActive()`, 8000), 'the title, then the refuge: the save begins');
check(await run(() => JSON.parse(localStorage.getItem('dracul.save')).prologue === true), 'saved: prologue done');
await play(1200);
await shot('apres');

// ---- A death in the necropolis: back in the crypt's sarcophagus, the ghoul gone, the ray to cross ----
await run(() => window.S().scene.restart({ layout: 'necropolis', entry: 0, prologue: 'necropole' }));
await until(`window.S().layout === 'necropolis' && window.S().phase === 'play'`, 8000);
await run(() => window.S().damageHero(999));
check(await until(`window.S().layout === 'hall' && window.S().prologue?.beat === 'rai' && window.S().sys.isActive()`, 6000), 'dead: re-formed in the crypt, at the ray');
await play(800);
await shot('reforme');
// ---- Échap twice: passed ----
await run(() => import('/src/prologue.ts').then((P) => P.startPrologue(window.game)));
await until(`window.S().layout === 'hall' && window.S().sys.isActive() && window.S().prologue`, 30000);
await press('Escape');
await play(300);
await shot('passer');
await press('Escape');
check(await until(`window.S().layout === 'refuge' && !window.S().prologue && window.S().sys.isActive()`, 4000), 'Échap twice: the prologue passed, at the refuge');

console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nno page error');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
