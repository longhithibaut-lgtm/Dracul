// Plays the expeditions through la nécropole in headless Chromium (1920x1080 = native x4) and saves captures of the loop.
// Usage: npm run shot [-- --out=shots --port=5199]
// A fresh save. Expedition 1: the bot walks from the coffin down the refuge's stairs into the zone (zone-refuge.png),
// comes up unseen on a group at its post (group.png), fights the ghouls that hunt him, picks up their blood, goes into
// the crypt by its door (zone-crypt-door.png), fights there, searches a cache, comes back out at the same door; crosses
// the chasm by the bridge (zone-bridge.png), the middle (zone-middle.png), the breach where the Dawn falls (zone-breach.png,
// he burns there), the far side (zone-far.png, the Order's camp), raises the sealed door of the gallery from its side
// (shortcut-gallery-before.png, -after.png); his scent looses the battue across the zone on his way back; through the
// gallery he comes out in the middle, raises the grille from its side (shortcut-grille-before.png, -after.png), meets the
// battue (battue.png), goes back by the causeway to the refuge and pours his blood into the basin (basin.png).
// Expedition 2: the zone new, the shortcuts still open (saved), blood picked up, then the bot lets the foes kill him: he
// re-forms at his coffin with nothing carried. Le Rongé's wares (ronge.png, shop.png). Hounds follow him through one
// door, never a second. Headless FPS of every place, and of the zone walked across chunk borders. In the training room
// a crossbowman clawed to his knees, then bitten. The whole zone's map: shots/necropolis-overview.png (its bake).
// Exit code 1 if the page logged an error or a step failed.
import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots');
const port = Number(arg('port', 5199));

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
// SwiftShader gives WebGL without a GPU (cloud containers); harmless on a desktop.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], failed = [], report = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('crash', () => errors.push('the page crashed'));
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
const save = () => run(() => JSON.parse(localStorage.getItem('dracul.save')));

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** One step of a walk to floor point (x, y) along the walk grid (the way its enemies go round pits), toward the cell a
 *  few steps ahead, misting forward while far; false once his feet are within `r`. */
let last;
async function step(x, y, r = 6) {
  const d = await run(([x, y, r]) => {
    const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, b = s.room.bounds, cols = s.navCols;
    if (!f || s.phase !== 'play' || Math.hypot(x - f.x, y - f.y) < r) return null; // there, or gone through an exit
    const key = `${s.layout}:${x}:${y}:${s.navOpen.length}:${s.navOpen.filter(Boolean).length}`;
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
  if (d.far > 120 && Math.hypot(d.dx, d.dy) > 20) page.keyboard.press('Space'); // the mist: the zone is wide
  await hold(keys.length ? keys : ['ArrowUp'], d.far > 40 ? 220 : 100); // long strides while far: the round trips are slow headless
  return true;
}
async function walk(x, y, ms = 40000, r = 6) {
  for (const end = Date.now() + ms; Date.now() < end;) if (!(await step(x, y, r))) return true;
  return false;
}
/** A walk by way of `points` ([x, y]...), each within 24 px; logs where it was cut short. */
async function route(points, ms = 60000) {
  for (const [x, y] of points) if (!(await walk(x, y, ms, 24))) { console.log(`walk to ${x},${y} cut short at ${JSON.stringify((await state()).hero)}`); return false; }
  return true;
}
/** Walks into a door: to floor point (x, y) just before it, then on (`key`) until the next place has come in. */
async function exit(x, y, key, to) {
  if (!(await walk(x, y, 40000, 8))) console.log(`walk to ${x},${y} cut short at ${JSON.stringify((await state()).hero)}`);
  await page.keyboard.down(key);
  const ok = await arrived(to);
  await page.keyboard.up(key);
  return ok;
}

/** Fights the enemies within `reach` (all: Infinity), the nearest first, for at most `ms`: walks up to it, claws it
 *  toward it. True once none is left there. */
async function fight(ms, reach = Infinity) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const t = await run((reach) => {
      const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, c = s.cameras.main.worldView;
      if (!f) return undefined;
      const live = s.enemies.getChildren().filter((e) => e.body?.enable).map((e) => ({ x: e.body.center.x, y: e.body.center.y, d: Math.hypot(e.body.center.x - f.x, e.body.center.y - f.y) }));
      const e = live.filter((e) => e.d < reach).sort((a, b) => a.d - b.d)[0];
      return e && { ...e, sx: (e.x - c.x) * 4, sy: (e.y - 8 - c.y) * 4 };
    }, reach);
    if (!t) return true;
    if (t.d > 24) await step(t.x, t.y, 20);
    else { await page.mouse.click(t.sx, t.sy); await page.waitForTimeout(80); }
  }
  return false;
}
/** Picks up the blood lying within `reach` (all: Infinity), the nearest first. */
async function gather(ms = 20000, reach = Infinity) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const d = await run((reach) => { const s = window.game.scene.getScene('room'), f = s.hero?.body?.center; return f && s.drops.map((d) => ({ x: d.x, y: d.y, k: Math.hypot(d.x - f.x, d.y - f.y) })).filter((d) => d.k < reach).sort((a, b) => a.k - b.k)[0]; }, reach);
    if (!d) return true;
    await walk(d.x, d.y, 8000, 10); // picked up within 16
    await page.waitForTimeout(100);
  }
  return false;
}
/** The camera on floor point (x, y) a moment (the hero's view stays his), for a capture; then back on him. */
async function look(name, x, y) {
  await run(([x, y]) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.centerOn(x, y); }, [x, y]);
  await page.waitForTimeout(900); // its chunks come in
  await shot(name);
  await run(() => { const s = window.game.scene.getScene('room'); s.cameras.main.startFollow(s.hero, true, 0.08, 0.08); });
}
const where = async () => { const h = (await state()).hero; return `${Math.round(h.x)},${Math.round(h.y)}`; };

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await run(() => localStorage.clear());
await page.reload();
await arrived('refuge');
await page.waitForTimeout(500);

// ---- Expedition 1: out into the zone, the crypt, across, the shortcuts, the battue, back, banked ----
check(await walk(840, 846) || (await state()).layout === 'necropolis', 'walked from the coffin down the refuge stairs');
check(await arrived('necropolis'), 'expedition 1: in la nécropole, at the foot of the refuge stairs');
await page.waitForTimeout(600);
await shot('zone-refuge');
const placed = await run(() => {
  const s = window.game.scene.getScene('room'), live = s.enemies.getChildren().filter((e) => e.body?.enable), f = s.hero.body.center;
  const kinds = {}; for (const e of live) kinds[e.getData('kind')] = (kinds[e.getData('kind')] ?? 0) + 1;
  return { n: live.length, idle: live.filter((e) => !e.getData('alert')).length, kinds, caches: s.caches.length, chunks: s.room.zone.chunks.shown.size,
    near: Math.min(...live.map((e) => Math.hypot(e.x - f.x, e.y - f.y))), at: live.map((e) => ({ x: e.body.center.x, y: e.body.center.y, kind: e.getData('kind') })) };
});
check(placed.n > 30 && placed.idle === placed.n && placed.near > 150, `zone: ${placed.n} foes on their posts by area, none hunting him (${JSON.stringify(placed.kinds)}), the nearest ${Math.round(placed.near)} px away; ${placed.caches} caches; ${placed.chunks} chunks shown of 40`);
const byRing = await run(() => { const s = window.game.scene.getScene('room'), r = {}; for (const e of s.enemies.getChildren()) { const k = e.x < 1350 ? 'proche' : e.x < 2612 ? 'milieu' : 'loin'; (r[k] ??= new Set()).add(e.getData('kind')); } return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].join(' ')])); });
check(!/inquisitor|ringer|purifier|priest/.test(byRing.proche ?? ''), `foes by distance: near ${byRing.proche} | middle ${byRing.milieu} | far ${byRing.loin}`);
{ // The nearest group on its post, the hero coming up to it unseen (just out of its sight), between them on screen.
  const f = (await state()).hero, g = placed.at.filter((e) => e.x < 1300).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  for (let end = Date.now() + 30000; Date.now() < end;) {
    const h = (await state()).hero;
    if (Math.hypot(g.x - h.x, g.y - h.y) < 175) break;
    await step(g.x, g.y, 165);
  }
  const h = (await state()).hero, hunting = await run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.getData('alert')).length);
  await look('group', (g.x + h.x) / 2, (g.y + h.y) / 2);
  console.log(`group.png: ${g.kind} ${Math.round(Math.hypot(g.x - h.x, g.y - h.y))} px from the hero, ${hunting} hunting him`);
}
await keep(true);
check(await fight(60000, 260), 'near the refuge: the ghouls fought');
check(await gather(20000, 300), 'their blood picked up');
let carried = (await state()).carried;
check(carried > 0, `blood carried: ${carried}`);
// the crypt, an interior: in by its door, out by its stairs at the same door
await route([[760, 540]]);
await look('zone-crypt-door', 760, 470);
check(await exit(760, 486, 'ArrowUp', 'hall'), 'into the crypt by its door');
await keep(true);
const crypt = await state();
check(crypt.live > 0, `the crypt, ring 1: ${crypt.live} foes placed`);
await fight(30000);
await gather(10000);
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
check(await exit(240, 616, 'ArrowDown', 'necropolis'), 'out of the crypt by its stairs');
const outside = (await state()).hero;
check(Math.abs(outside.x - 760) < 20 && outside.y > 478 && outside.y < 540, `back in the zone at the crypt's door (${Math.round(outside.x)},${Math.round(outside.y)})`);
await keep(false);
await page.waitForTimeout(700);
await shot('hud-blood');
await shot('hud', { x: 0, y: 0, width: 520, height: 260 });
await keep(true);
// across: the field, the bridge, the middle, the breach, the far side
const cull = (r) => run((r) => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; for (const e of s.enemies.getChildren()) if (e.body?.enable && Math.hypot(e.x - f.x, e.y - f.y) < r) s.kill(e); }, r);
const t0 = Date.now();
check(await route([[1040, 960], [1300, 1168]]), 'across the field of graves to the bridge');
await route([[1415, 1168]]);
await shot('zone-bridge');
check(await route([[1800, 1080], [2150, 1000], [2450, 880], [2500, 690]]), 'over the chasm, along the middle\'s south band to the wall\'s end');
await fight(15000, 200);
await gather(8000, 220);
await route([[2350, 560]]);
await shot('zone-middle');
check(await route([[2540, 380]]), 'up to the breach');
await keep(false);
await run(() => { const s = window.game.scene.getScene('room'); s.health = s.maxHealth(); s.hud.health(s.health, s.health); });
await walk(2622, 362, 8000, 6);
const sun = await run(() => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; return { holy: s.room.holy(f.x, f.y), lit: s.litMs }; });
await page.waitForTimeout(300);
await shot('zone-breach');
check(sun.holy, `in the breach, under the Dawn (it burns: ${Math.round(sun.lit)} ms in it)`);
await keep(true);
check(await route([[2720, 380], [2900, 420]]), 'through the breach onto the far side');
console.log(`refuge to the far side, walked: ${Math.round((Date.now() - t0) / 1000)} s headless`);
await cull(150);
await route([[3000, 640]]);
await look('zone-far', 3110, 860);
check(await route([[3200, 350], [3302, 140]]), 'to the gallery\'s far mouth, under the north cliff');
await walk(3302, 120, 8000, 4);
await look('shortcut-gallery-before', 3270, 150);
await page.keyboard.press('f');
await page.waitForTimeout(1800);
await look('shortcut-gallery-after', 3270, 150);
check((await save()).shortcuts.includes('galerie'), `F at its winch: the sealed door raised, saved (${JSON.stringify((await save()).shortcuts)})`);
// his scent: two packs of the battue loosed across the zone, between him and the refuge
const scent = await run(async () => {
  const s = window.game.scene.getScene('room'), f = s.hero.body.center, warn = s.warn.bind(s), warned = [];
  s.warn = (inq) => (warned.push(inq), warn(inq));
  s.addDrop({ x: f.x, y: f.y + 4, blood: 170 }); // two thresholds (or three) crossed at once
  await new Promise((r) => setTimeout(r, 1800));
  const packs = s.enemies.getChildren().filter((e) => e.body?.enable && e.getData('pack')).map((e) => ({ kind: e.getData('kind'), x: Math.round(e.x), y: Math.round(e.y), d: Math.round(Math.hypot(e.x - f.x, e.y - f.y)) }));
  return { carried: s.carried, loosed: s.exp.loosed, waiting: s.exp.packs, packs, warned };
});
check(scent.loosed >= 2 && scent.packs.length >= 5 && scent.packs.every((p) => p.d >= 300) && scent.warned.length === 1,
  `scent: ${scent.carried} blood carried loosed ${scent.loosed} packs (the horn and its line), out of his sight on his way back: ${scent.packs.map((p) => `${p.kind} ${p.x},${p.y}`).join(' | ')}`);
await walk(3260, 104, 8000, 4);
await page.keyboard.down('ArrowUp'); // into its mouth, until the fade takes him
await until(() => window.game.scene.getScene('room').phase !== 'play', null, 4000);
await page.keyboard.up('ArrowUp');
check(await until(() => { const s = window.game.scene.getScene('room'); return s.phase === 'play' && s.hero.body.center.x < 1800; }, null, 8000), `out of the gallery\'s other mouth, in the middle (${await where()})`);
check(await route([[1560, 340], [1525, 316]]), 'to the grille, on its side');
await walk(1525, 314, 6000, 4);
await look('shortcut-grille-before', 1525, 270);
await page.keyboard.press('f');
await page.waitForTimeout(1800);
await look('shortcut-grille-after', 1525, 270);
check((await save()).shortcuts.includes('grille'), `the grille raised, saved (${JSON.stringify((await save()).shortcuts)})`);
// back by the court, the causeway and the field's north path; the battue posted on it
const upon = () => run(() => { const s = window.game?.scene.getScene('room'), f = s?.hero?.body?.center; if (!f) return false; return s.enemies.getChildren().some((e) => e.body?.enable && Math.hypot(e.x - f.x, e.y - f.y) < 90 && (e.getData('pack') || e.getData('kind') === 'hound')); });
let met = false;
for (const [x, y] of [[1525, 250], [1400, 233], [1100, 232], [700, 196], [300, 170]]) {
  for (let end = Date.now() + 40000; Date.now() < end && !(met ||= await upon());) if (!(await step(x, y, 24))) break;
  if (met) break;
}
if (met) {
  await keep(false);
  await page.waitForTimeout(60);
  await shot('battue');
  await keep(true);
  check(await fight(60000, 220), 'the battue met on the way back, fought off');
  await gather(8000, 200);
} else check(false, `the battue met on the way back (${await where()})`);
await route([[700, 196], [320, 170]]);
check(await fight(40000, 260), 'the other pack, holding the refuge stairs, fought off'); // its hounds would shove him off the stairs
await gather(8000, 200);
const back = await run(() => window.game.scene.getScene('room').exp);
console.log(`the battue: ${back.loosed} packs loosed, ${back.met} found him`);
const bring = (await state()).carried;
check(await exit(230, 100, 'ArrowUp', 'refuge'), 'up the stairs into the refuge');
check(await walk(840, 684, 20000, 8) && (await until(() => window.game.scene.getScene('room').carried === 0, null, 5000)), 'walked to the basin');
await page.waitForTimeout(350);
await shot('basin');
const bank = await save();
check(bank?.banked === bring && bank.shortcuts.length === 2, `poured ${bring} blood into the basin: banked ${bank?.banked}, the shortcuts kept (${bank.shortcuts.join(', ')})`);

// ---- Expedition 2: the zone new, the shortcuts still open, blood picked up, death ----
check(await walk(840, 846) || (await state()).layout === 'necropolis', 'down the stairs again');
check(await arrived('necropolis'), 'expedition 2: in the zone, the world new');
const fresh = await run(() => { const s = window.game.scene.getScene('room'); return { live: s.enemies.getChildren().filter((e) => e.body?.enable).length, open: s.room.zone.gates.filter((g) => g.open).map((g) => g.id) }; });
check(fresh.live > 30 && fresh.open.length === 3, `zone repopulated: ${fresh.live} foes; open for good: ${fresh.open.join(', ')}`);
await keep(true);
for (let i = 0; i < 6 && (await state()).carried === 0; i++) { await fight(8000, 400); await gather(4000, 400); }
const lost = (await state()).carried;
check(lost > 0, `blood carried before dying: ${lost}`);
await keep(false);
await run(() => { const s = window.game.scene.getScene('room'); s.health = 1; s.hud.health(1, 5); });
for (let end = Date.now() + 30000; Date.now() < end && (await state()).layout === 'necropolis';) {
  const s = await state();
  if (s.live) await fight(1500); else break;
}
if ((await state()).layout === 'necropolis') await run(() => window.game.scene.getScene('room').damageHero(99)); // nothing near enough to kill him
check(await arrived('refuge'), 'died: re-formed at the coffin');
await page.waitForTimeout(300);
await shot('death');
const after = await run(() => ({ carried: window.game.scene.getScene('room').carried, save: JSON.parse(localStorage.getItem('dracul.save')), log: JSON.parse(localStorage.getItem('dracul.log')) }));
check(after.carried === 0 && after.save?.banked === bank?.banked, `the blood carried is lost (${lost}), the bank untouched (${after.save?.banked})`);
check(after.log?.length === 2 && after.log[0].end === 'retour' && after.log[0].deepest === 3 && after.log[1].end === 'mort', `expedition log: ${(after.log ?? []).map((e) => `${e.end} ring ${e.deepest}, ${e.blood} blood, ${e.life} life, ${e.s} s, ${e.loosed}/${e.met} packs`).join(' | ')}`);

// ---- Le Rongé's wares ----
await run(() => { const s = JSON.parse(localStorage.getItem('dracul.save')); s.banked = Math.max(s.banked, 200); localStorage.setItem('dracul.save', JSON.stringify(s)); });
await page.reload();
await arrived('refuge');
const banked = (await save()).banked;
check(await walk(896, 678, 15000, 6), 'walked up to le Rongé');
await page.waitForTimeout(700);
await shot('ronge');
await page.keyboard.press('f');
check(await until(() => !!window.game.scene.getScene('room').counter, null, 3000), 'F: his wares open');
await page.waitForTimeout(300);
await shot('shop');
await page.keyboard.press('1');
await page.waitForTimeout(200);
const bit = await save();
check(bit.unlocks.bite && bit.banked === banked - 80, `key 1: the bite bought, ${banked} -> ${bit.banked} banked`);
await page.keyboard.press('Escape');
check(await until(() => !window.game.scene.getScene('room').counter, null, 2000), 'Escape: his wares closed');

// ---- Hounds hunting him follow him through one door, never a second ----
{
  const hounds = () => run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable && e.getData('kind') === 'hound').map((e) => e.getData('followed')));
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'necropolis', entry: 0 })); // at the crypt's door
  await arrived('necropolis');
  await keep(true);
  await run(() => { const s = window.game.scene.getScene('room'); s.enemies.clear(true, true); for (const x of [740, 780]) s.place({ x, y: 560 }, 'hound', { alert: true }); s.leave(0); });
  await arrived('hall');
  await keep(true);
  await page.waitForTimeout(2500);
  const came = await hounds();
  await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) if (e.getData('kind') !== 'hound') e.disableBody(true, true); s.leave(-1); });
  await arrived('necropolis');
  await page.waitForTimeout(2500);
  const again = await run(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable && e.getData('kind') === 'hound' && e.getData('followed')).length);
  check(came.filter(Boolean).length === 2 && again === 0, `hounds: ${came.filter(Boolean).length} followed him into the crypt, ${again} back out into the zone`);
}

// ---- Headless FPS: each place opened directly (its foes on their posts, the hero kept from harm); the zone walked
// east across chunk borders ----
const fps = [];
const rate = (ms) => run((ms) => new Promise((done) => { const f0 = window.game.loop.frame, t0 = performance.now(); setTimeout(() => done(((window.game.loop.frame - f0) * 1000) / (performance.now() - t0)), ms); }), ms);
for (const layout of ['refuge', 'necropolis', 'hall', 'nave', 'ossuary', 'chapel', 'cloister']) {
  await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
  await until((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.sys.isActive(); }, layout);
  await keep(true);
  await page.waitForTimeout(1000);
  fps.push(`${layout} ${(await rate(2000)).toFixed(1)}`);
}
{
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'necropolis' }));
  await arrived('necropolis');
  await keep(true);
  await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) e.disableBody(true, true); s.hero.body.reset(380, 172); }); // the north path, out of the way
  await page.waitForTimeout(800);
  const chunks = [], measure = rate(9000);
  for (let end = Date.now() + 9000; Date.now() < end;) { // east along the path, through x 480 and 960: chunk borders
    page.keyboard.press('Space');
    await hold(['ArrowRight'], 400);
    chunks.push(await run(() => window.game.scene.getScene('room').room.zone.chunks.shown.size));
  }
  const n = await measure, x = (await state()).hero.x;
  fps.push(`necropolis walked across chunk borders ${n.toFixed(1)} (to x ${Math.round(x)}, ${Math.min(...chunks)}-${Math.max(...chunks)} chunks shown)`);
  check(x > 960 && Math.max(...chunks) <= 12, `walking east across chunk borders, ${Math.max(...chunks)} chunks held at most`);
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
if (existsSync('shots/necropolis-overview.png') && out !== 'shots') await copyFile('shots/necropolis-overview.png', `${out}/necropolis-overview.png`);

console.log(report.join('\n'));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
