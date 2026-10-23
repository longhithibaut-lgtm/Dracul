// Plays two expeditions in headless Chromium (1920x1080 = native x4) and saves captures of the loop.
// Usage: npm run shot [-- --out=shots --port=5199]
// A fresh save. Expedition 1: the bot walks from the coffin down the refuge's stairs into the crypt, captures an enemy
// group on its post (group.png, full frame), fights the crypt clear (kept from harm), picks up the blood of the dead
// and searches a cache (cache.png: the cache before F), captures the HUD with the blood carried (hud-blood.png, full frame; hud.png, the corner), goes
// deeper through the left portcullis into the nave, fights a little there, comes back down its stairs (the crypt's dead
// must still be dead), up to the refuge and into the basin (basin.png, full frame: the blood poured, banked and saved).
// Expedition 2: down again (the world new), blood picked up, then the bot lets the crypt's foes kill him: he re-forms
// at his coffin with nothing carried and the bank untouched (death.png). Expedition 3, the battue: blood picked up in the
// nave looses packs (the horn and its line) into the crypt behind him, never the nave; going back down, the pack is
// there, hunting him (battue.png, full frame); fought, the blood banked. Le Rongé by the basin (ronge.png), his wares
// opened with F (shop.png): the bite bought with key 1, +1 max life with a click, left with Escape. Then the expedition
// log, two hunting hounds following him through one exit but not a second, the headless FPS of every room, and in the
// training room a crossbowman clawed to his knees, then bitten (the bite bought from le Rongé).
// Exit code 1 if the page logged an error or a step failed.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots');
const port = Number(arg('port', 5199));
const X = 4; // native -> screenshot scale

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
// SwiftShader gives WebGL without a GPU (cloud containers); harmless on a desktop.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], failed = [], report = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
page.on('console', (m) => m.text().startsWith('expédition') && report.push(m.text()));

const run = (f, a) => page.evaluate(f, a);
const until = (f, a, timeout = 10000) => page.waitForFunction(f, a, { timeout }).then(() => true, () => false);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);
const freeze = (on) => run((on) => (on ? window.game.loop.sleep() : window.game.loop.wake()), on);
const shot = async (name, clip) => { await freeze(true); await page.screenshot({ path: `${out}/${name}.png`, clip }); await freeze(false); };
const state = () => run(() => {
  const s = window.game.scene.getScene('room'), f = s.hero?.body?.center;
  return { layout: s.layout, phase: s.phase, active: s.sys.isActive(), health: s.health, carried: s.carried, hero: f && { x: f.x, y: f.y },
    live: s.enemies?.getChildren().filter((e) => e.body?.enable).length ?? 0, drops: s.drops?.length ?? 0, caches: s.caches?.length ?? 0 };
});
const arrived = (layout) => until((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.sys.isActive() && s.phase === 'play'; }, layout, 15000);
const keep = (on) => run((on) => { window.game.scene.getScene('room').invulnUntil = on ? Infinity : 0; }, on); // kept from harm (he blinks)

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** One step of a walk to floor point (x, y) along the room's walk grid (the way its enemies go round pits), toward
 *  the cell a few steps ahead; false once his feet are within `r`. */
let last;
async function step(x, y, r = 6) {
  const d = await run(([x, y, r]) => {
    const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, b = s.room.bounds, cols = s.navCols;
    if (!f || s.phase !== 'play' || Math.hypot(x - f.x, y - f.y) < r) return null; // there, or gone through an exit
    const key = `${s.layout}:${x}:${y}`;
    if (window.walkTo?.key !== key) window.walkTo = { key, steps: s.stepsTo({ x, y }) };
    const steps = window.walkTo.steps;
    let c = s.cellOf(f);
    for (let k = 0; k < 3 && steps[c] > 1; k++) {
      let best = c;
      for (const n of [c - cols - 1, c - cols, c - cols + 1, c - 1, c + 1, c + cols - 1, c + cols, c + cols + 1])
        if (Math.abs((n % cols) - (c % cols)) <= 1 && steps[n] < steps[best]) best = n;
      c = best;
    }
    const to = steps[c] <= 1 ? { x, y } : { x: b.x + (c % cols) * 8 + 4, y: b.y + Math.floor(c / cols) * 8 + 4 };
    return { dx: to.x - f.x, dy: to.y - f.y, far: Math.hypot(x - f.x, y - f.y), at: [f.x, f.y] };
  }, [x, y, r]);
  if (!d) return false;
  // Snagged on a prop's corner (the grid is cut for a ghoul's feet, his are wider): a sidestep, either way.
  if (last && Math.hypot(d.at[0] - last[0], d.at[1] - last[1]) < 0.5) await hold([['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][Math.floor(Math.random() * 4)]], 250);
  last = d.at;
  const keys = [];
  if (Math.abs(d.dx) > 2) keys.push(d.dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  if (Math.abs(d.dy) > 2) keys.push(d.dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await hold(keys.length ? keys : ['ArrowUp'], d.far > 40 ? 220 : 100); // long strides while far: the round trips are slow headless
  return true;
}
async function walk(x, y, ms = 40000, r = 6) {
  for (const end = Date.now() + ms; Date.now() < end;) if (!(await step(x, y, r))) return true;
  return false;
}
/** Walks out by an exit: to floor point (x, y) just inside it, then on (`key`) until the next room has come in. */
async function exit(x, y, key, to) {
  if (!(await walk(x, y, 40000, 8))) console.log(`walk to ${x},${y} cut short at ${JSON.stringify((await state()).hero)}`);
  await page.keyboard.down(key);
  const ok = await arrived(to);
  await page.keyboard.up(key);
  return ok;
}

/** Fights the enemies of the room (the nearest first) for at most `ms`: walks up to it, claws it toward it. True once
 *  none is left alive. */
async function fight(ms) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const t = await run(() => {
      const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, c = s.cameras.main.worldView;
      if (!f) return undefined;
      const live = s.enemies.getChildren().filter((e) => e.body?.enable).map((e) => ({ x: e.body.center.x, y: e.body.center.y, d: Math.hypot(e.body.center.x - f.x, e.body.center.y - f.y) }));
      const e = live.sort((a, b) => a.d - b.d)[0];
      return e && { ...e, sx: (e.x - c.x) * 4, sy: (e.y - 8 - c.y) * 4 };
    });
    if (!t) return true;
    if (t.d > 24) await step(t.x, t.y, 20);
    else { await page.mouse.click(t.sx, t.sy); await page.waitForTimeout(80); }
  }
  return false;
}
/** Picks up the blood lying in the room, the nearest first. */
async function gather(ms = 20000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const d = await run(() => { const s = window.game.scene.getScene('room'), f = s.hero?.body?.center; return f && s.drops.map((d) => ({ x: d.x, y: d.y, k: Math.hypot(d.x - f.x, d.y - f.y) })).sort((a, b) => a.k - b.k)[0]; });
    if (!d) return true;
    await walk(d.x, d.y, 8000, 10); // picked up within 16: never pressed against a wall, maybe by an exit
    await page.waitForTimeout(100);
  }
  return false;
}

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await run(() => localStorage.clear());
await page.reload();
await arrived('refuge');
await page.waitForTimeout(500);

// ---- Expedition 1: out, the crypt, deeper, back, banked ----
check(await walk(840, 846) || (await state()).layout === 'hall', 'walked from the coffin down the refuge stairs');
check(await arrived('hall'), 'expedition 1: in the crypt');
const placed = await run(() => {
  const s = window.game.scene.getScene('room'), live = s.enemies.getChildren().filter((e) => e.body?.enable);
  return { n: live.length, idle: live.filter((e) => !e.getData('alert')).length, groups: s.exp.rooms.hall.foes.map((f) => f.kind).join(' '), caches: s.caches.length,
    at: live.map((e) => ({ x: e.body.center.x, y: e.body.center.y })) };
});
check(placed.n > 0 && placed.idle === placed.n, `crypt: ${placed.n} foes placed on their posts, ${placed.idle} not hunting him yet (${placed.groups}); ${placed.caches} cache(s)`);
{ // The nearest group on its post, the hero coming up to it unseen (just out of its sight), between them on screen.
  const f = (await state()).hero, g = placed.at.sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  for (let end = Date.now() + 20000; Date.now() < end;) {
    const h = (await state()).hero;
    if (Math.hypot(g.x - h.x, g.y - h.y) < 175) break;
    await step(g.x, g.y, 165);
  }
  const h = (await state()).hero, hunting = await run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.getData('alert')).length);
  await run(([x, y]) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.centerOn(x, y); }, [(g.x + h.x) / 2, (g.y + h.y) / 2]);
  await page.waitForTimeout(400);
  await shot('group');
  console.log(`group.png: ${Math.round(Math.hypot(g.x - h.x, g.y - h.y))} px from the hero, ${hunting} hunting him`);
  await run(() => { const s = window.game.scene.getScene('room'); s.cameras.main.startFollow(s.hero, true, 0.08, 0.08); });
}
await keep(true);
check(await fight(90000), 'crypt fought clear');
check(await gather(), 'crypt: the blood of the dead picked up');
{
  const c = await run(() => { const s = window.game.scene.getScene('room'); return s.caches[0] && { x: s.caches[0].x, y: s.caches[0].y }; });
  if (c) {
    const before = (await state()).carried;
    await walk(c.x, c.y, 15000, 10);
    await page.waitForTimeout(500);
    await shot('cache'); // its scent and « Fouiller (F) » over it
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    await gather(5000);
    check((await state()).carried > before, `cache searched (F): ${before} -> ${(await state()).carried} blood`);
  }
}
let carried = (await state()).carried;
check(carried > 0, `blood carried out of the crypt: ${carried}`);
await keep(false);
await page.waitForTimeout(900);
await shot('hud-blood');
await shot('hud', { x: 0, y: 0, width: 520, height: 260 });
await keep(true);

check(await exit(140, 72, 'ArrowUp', 'nave'), 'deeper: up through the left portcullis into the nave');
await keep(true);
const nave = await state();
check(nave.live > 0, `nave: ${nave.live} foes placed`);
await fight(25000);
await gather(8000);
const hounds = await run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable && e.getData('kind') === 'hound' && e.getData('alert')).length);
carried = (await state()).carried;
console.log(`nave: blood carried ${carried}, hounds hunting him as he leaves: ${hounds}`);
check(await exit(240, 616, 'ArrowDown', 'hall'), 'back down the nave stairs into the crypt');
await keep(true);
const back = await run(() => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; return { y: f.y, live: s.enemies.getChildren().filter((e) => e.body?.enable && !e.getData('followed')).length }; });
check(back.y < 120 && back.live === 0, `back in the crypt by its left portcullis (feet y ${Math.round(back.y)}), its dead still dead (${back.live} alive)`);
await fight(20000); // the hounds that followed him, if any
await gather(5000);
carried = (await state()).carried;
console.log(`the battue with ${carried} blood: ${JSON.stringify(await run(() => { const e = window.game.scene.getScene('room').exp; return { loosed: e.loosed, waiting: e.packs, met: e.met }; }))}`);
check(await exit(240, 616, 'ArrowDown', 'refuge'), 'down the crypt stairs, up into the refuge');
check(await walk(840, 684, 20000, 8) && (await until(() => window.game.scene.getScene('room').carried === 0, null, 5000)), 'walked to the basin');
await page.waitForTimeout(350);
await shot('basin');
const bank = await run(() => JSON.parse(localStorage.getItem('dracul.save')));
check(bank?.banked === carried, `poured ${carried} blood into the basin: banked ${bank?.banked}, saved`);

// ---- Expedition 2: out again, blood picked up, death ----
check(await walk(840, 846), 'down the stairs again');
check(await arrived('hall'), 'expedition 2: in the crypt, the world new');
const fresh = await state();
check(fresh.live > 0, `crypt repopulated: ${fresh.live} foes`);
await keep(true);
for (let i = 0; i < 6 && (await state()).carried === 0; i++) { await fight(6000); await gather(4000); }
const lost = (await state()).carried;
check(lost > 0, `blood carried before dying: ${lost}`);
await keep(false);
await run(() => { const s = window.game.scene.getScene('room'); s.health = 1; s.hud.health(1, 5); });
for (let end = Date.now() + 30000; Date.now() < end && (await state()).layout === 'hall';) {
  const s = await state();
  if (s.live) await fight(1500); else break;
}
if ((await state()).layout === 'hall') await run(() => window.game.scene.getScene('room').damageHero(99)); // nothing left to kill him
check(await arrived('refuge'), 'died: re-formed at the coffin');
await page.waitForTimeout(300);
await shot('death');
const after = await run(() => ({ carried: window.game.scene.getScene('room').carried, save: JSON.parse(localStorage.getItem('dracul.save')), log: JSON.parse(localStorage.getItem('dracul.log')) }));
check(after.carried === 0 && after.save?.banked === bank?.banked, `the blood carried is lost (${lost}), the bank untouched (${after.save?.banked})`);
check(after.log?.length === 2 && after.log[0].end === 'retour' && after.log[1].end === 'mort' && after.log[1].blood >= lost, `expedition log: ${(after.log ?? []).map((e) => `${e.end} ring ${e.deepest}, ${e.blood} blood, ${e.life} life, ${e.s} s`).join(' | ')}`);

// ---- Expedition 3: the battue, then le Rongé's wares ----
check(await walk(840, 846) || (await state()).layout === 'hall', 'down the stairs a third time');
check(await arrived('hall'), 'expedition 3: in the crypt');
await keep(true);
const cull = () => run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) s.kill(e); }); // the battue is what is checked here
await cull();
check(await exit(140, 72, 'ArrowUp', 'nave'), 'expedition 3: up into the nave');
await keep(true);
await cull();
const scent = await run(async () => {
  const s = window.game.scene.getScene('room'), f = s.hero.body.center, warn = s.warn.bind(s), warned = [];
  s.warn = (inq) => (warned.push(inq), warn(inq));
  s.addDrop({ x: f.x, y: f.y, blood: 160 }); // two thresholds of the scent crossed at once
  await new Promise((r) => setTimeout(r, 400));
  const e = s.exp;
  return { carried: s.carried, loosed: e.loosed, waiting: e.packs, hall: e.rooms.hall.battue, nave: e.rooms.nave.battue ?? null, warned };
});
check(scent.loosed === 2 && scent.hall?.kinds.length === 3 && scent.nave === null && scent.warned.length === 1,
  `scent: ${scent.carried} blood carried loosed ${scent.loosed} packs (horn and line: ${scent.warned.length}), lying in wait in the crypt behind him (${scent.hall?.kinds.join(' ')}, ${scent.hall?.stairs ? 'before the stairs' : 'by his way in'}), none in the nave`);
check(await exit(240, 616, 'ArrowDown', 'hall'), 'expedition 3: back down into the crypt');
await keep(true);
const met = await run(() => {
  const s = window.game.scene.getScene('room'), live = s.enemies.getChildren().filter((e) => e.body?.enable);
  return { met: s.exp.met, waiting: !!s.exp.rooms.hall.battue, hunting: live.filter((e) => e.getData('kind') === 'hound' && e.getData('alert')).length };
});
check(met.met === 1 && !met.waiting && met.hunting === 3, `the battue met on the way back: ${met.hunting} hounds hunting him in the crypt`);
// Down toward the stairs until the pack is upon him (a hound within 80 px); the hero shown (not blinking) for the capture.
const upon = () => run(() => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; return s.enemies.getChildren().some((e) => e.body?.enable && Math.hypot(e.x - f.x, e.y - f.y) < 80); });
for (let end = Date.now() + 20000; Date.now() < end && !(await upon());) await step(240, 560, 6);
await keep(false);
await page.waitForTimeout(60);
await shot('battue');
await keep(true);
check(await fight(60000), 'the battue fought off');
await gather(8000);
const bring = (await state()).carried;
check(await exit(240, 616, 'ArrowDown', 'refuge'), 'expedition 3: back at the refuge');
check(await walk(840, 684, 20000, 8) && (await until(() => window.game.scene.getScene('room').carried === 0, null, 5000)), 'poured at the basin');
const banked = await run(() => JSON.parse(localStorage.getItem('dracul.save')).banked);
check(banked === bank.banked + bring, `banked ${bring} more: ${banked}`);
const log3 = await run(() => JSON.parse(localStorage.getItem('dracul.log')).at(-1));
check(log3.loosed === 2 && log3.met === 1, `log: ${log3.loosed} packs loosed, ${log3.met} met`);
// Le Rongé: up to him, he raises his head; F opens his wares.
check(await walk(Math.round(896), 678, 15000, 6), 'walked up to le Rongé');
await page.waitForTimeout(700);
await shot('ronge');
await page.keyboard.press('f');
check(await until(() => !!window.game.scene.getScene('room').counter, null, 3000), 'F: his wares open');
await page.waitForTimeout(300);
await shot('shop');
await page.keyboard.press('1');
await page.waitForTimeout(200);
const bit = await run(() => JSON.parse(localStorage.getItem('dracul.save')));
check(bit.unlocks.bite && bit.banked === banked - 80, `key 1: the bite bought, ${banked} -> ${bit.banked} banked`);
const card = await run(() => { // the second card's middle, on the page
  const c = window.game.scene.getScene('room').counter;
  for (let y = 0; y < 270; y += 2) for (let x = 0; x < 480; x += 2) if (c.at(x, y) === 1) return { x: (x + 20) * 4, y: (y + 30) * 4 };
});
await page.mouse.move(card.x, card.y);
await page.waitForTimeout(150);
await page.mouse.click(card.x, card.y);
await page.waitForTimeout(200);
const life = await run(() => { const s = window.game.scene.getScene('room'); return { save: JSON.parse(localStorage.getItem('dracul.save')), max: s.maxHealth(), health: s.health }; });
check(life.save.unlocks.life === 1 && life.max === 6 && life.health === 6 && life.save.banked === bit.banked - 40, `click: +1 max life bought (${life.max} drops), ${life.save.banked} banked`);
await shot('shop-bought');
await page.keyboard.press('Escape');
check(await until(() => !window.game.scene.getScene('room').counter, null, 2000), 'Escape: his wares closed');

// ---- Hounds hunting him follow him through one exit, never a second ----
{
  const hounds = () => run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable && e.getData('kind') === 'hound').map((e) => e.getData('followed')));
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'hall' }));
  await arrived('hall');
  await keep(true);
  await run(() => { const s = window.game.scene.getScene('room'); s.enemies.clear(true, true); for (const x of [200, 280]) s.place({ x, y: 300 }, 'hound', { alert: true }); s.leave(0); });
  await arrived('nave');
  await keep(true);
  await page.waitForTimeout(2500);
  const came = await hounds();
  await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) if (e.getData('kind') !== 'hound') e.disableBody(true, true); s.leave(-1); });
  await arrived('hall');
  await page.waitForTimeout(2500);
  const again = await hounds();
  check(came.filter(Boolean).length === 2 && again.length === 0, `hounds: ${came.filter(Boolean).length} followed him into the nave, ${again.length} back into the crypt`);
}

// ---- Headless FPS, room by room (each opened directly, its foes on their posts, the hero kept from harm) ----
const fps = [];
for (const layout of ['refuge', 'hall', 'nave', 'ossuary', 'chapel', 'cloister']) {
  await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
  await until((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.sys.isActive(); }, layout);
  await keep(true);
  await page.waitForTimeout(1000);
  const n = await run(() => new Promise((done) => { const f0 = window.game.loop.frame, t0 = performance.now(); setTimeout(() => done(((window.game.loop.frame - f0) * 1000) / (performance.now() - t0)), 2000); }));
  fps.push(`${layout} ${n.toFixed(1)}`);
}
console.log(`headless fps: ${fps.join(', ')}`);

// ---- The bite, bought from le Rongé: a crossbowman clawed to his knees, then bitten ----
await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'refuge' }));
await arrived('refuge');
await page.keyboard.press('t');
if (check(!!(await page.waitForSelector('#training', { timeout: 5000 }).catch(() => null)), 'training room')) {
  await page.click('#training [data-opt="passive"]'); // a dummy: it neither shoots nor flees
  await page.click('#training [data-spawn="crossbow"]');
  await until(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable), null, 10000);
  const bit = await run(async () => {
    const s = window.game.scene.getScene('room'), e = s.enemies.getChildren().find((e) => e.body?.enable), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    s.health = 3; s.hud.health(3, s.maxHealth());
    s.hero.body.reset(e.x - 18, e.y);
    await wait(200);
    s.slash(Math.atan2(e.body.center.y - s.hero.body.center.y, e.body.center.x - s.hero.body.center.x));
    await wait(100);
    const knelt = s.time.now < e.getData('kneelUntil'), hp = e.getData('hp');
    await wait(250);
    s.bite();
    await wait(1500);
    return { knelt, hp, health: s.health, dead: !e.body?.enable };
  });
  check(bit.knelt && bit.hp === 1 && bit.dead && bit.health > 3, `clawed to ${bit.hp} hp, he kneels; bitten: 3 -> ${bit.health} blood`);
  await page.click('#training [data-opt="passive"]');
}

console.log(report.join('\n'));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
