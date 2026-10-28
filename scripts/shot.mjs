// Plays the expeditions through la nécropole in headless Chromium (1920x1080 = native x4) and saves captures of the loop.
// Usage: npm run shot [-- --out=shots --port=5199 --only=catacombs|fps|map --gpu]   (--only: expedition 3 alone, the frame rates alone, or la carte alone; --gpu on a PC with a graphics card)
// A fresh save. Expedition 1: the bot walks from the coffin down the refuge's stairs into the zone (zone-refuge.png),
// comes up unseen on a group at its post (group.png), fights the ghouls that hunt him, picks up their blood, goes into
// the crypt by its door (zone-crypt-door.png), fights there, searches a cache that hides an item (item-glint.png: it lies
// on the floor), takes it (F) into his bag, opens le sac (I, sac.png) and wears it (Enter); his bag full, F on another
// item asks which to leave (swap.png); he comes back out at the same door (hud.png: the bag's shelf); crosses
// the chasm by the bridge (zone-bridge.png), the middle (zone-middle.png), the breach where the Dawn falls (zone-breach.png,
// he burns there), the far side (zone-far.png, the Order's camp), raises the sealed door of the gallery from its side
// (shortcut-gallery-before.png, -after.png); his scent looses the battue across the zone on his way back; through the
// gallery he comes out in the middle, walks on to the battue waiting at a narrow way (battue.png, once the gallery's fade is
// over), raises the grille from its side (shortcut-grille-before.png, -after.png), goes back by the causeway to the refuge and pours his blood into the basin (basin.png);
// his items are in le coffre (F by it, coffre.png), acquired.
// Expedition 2: the zone new, the shortcuts still open (saved), blood picked up, a new item taken and worn, then the bot
// lets the foes kill him: he re-forms at his coffin with nothing carried, the new item lost, the acquired one still worn. Le Rongé's wares (ronge.png, shop.png). Hounds follow him through one
// door, never a second. Headless FPS of every place, and of the zone walked across chunk borders. In the training room
// a crossbowman clawed to his knees, then bitten; its two bosses called in (la Matrice, l'Araignée: tools/art/nourrice.shots.mjs). The whole zone's map: shots/necropolis-overview.png (its bake).
// La carte (C): the necropolis' after the first fight (map-necropolis), the catacombs' at the great crossroads
// (map-catacombs), both whole at the end (map-*-full, every cell revealed by map.ts's test hook).
// Expedition 3, les catacombes: across the necropolis by its shortcuts, down the well (well-top, cata-well-bottom), a gallery,
// a crossroads, la grille du caveau raised from below (cata-shortcut-before, -after; caveau-before from above), le nid, the
// prison: its grille drops behind him, La Matrice (cata-matrice), put down (her fight: tools/art/matrice.shots.mjs), the grille rises,
// F at the reliquary frees Vesna (cata-prison), the battue down there and up in the necropolis, back up le caveau (caveau-after), home: Vesna there.
// Exit code 1 if the page logged an error or a step failed.
import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots');
const port = Number(arg('port', 5199));

// no hmr: an edit to src/ mid-run would reload the page under the bot
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
// SwiftShader gives WebGL without a GPU (cloud containers); harmless on a desktop.
// --gpu: a machine with a real graphics card (the user's PC) renders with it; else WebGL in software (SwiftShader).
const gpu = process.argv.includes('--gpu');
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], failed = [], report = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('crash', () => errors.push('the page crashed'));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
page.on('console', (m) => m.text().startsWith('expédition') && report.push(m.text()));
page.on('console', (m) => m.text().startsWith('kept') && console.log(m.text()));

const run = (f, a) => page.evaluate(f, a);
const until = (f, a, timeout = 10000) => page.waitForFunction(f, a, { timeout }).then(() => true, () => false);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);
const freeze = (on) => run((on) => (on ? window.game.loop.sleep() : window.game.loop.wake()), on);
const shot = async (name, clip) => { await freeze(true); await page.screenshot({ path: `${out}/${name}.png`, clip }); await freeze(false); };
const state = () => run(() => {
  const s = window.game.scene.getScene('room'), f = s.sys.isActive() ? s.hero?.body?.center : undefined; // mid-restart: nothing yet
  return { layout: s.layout, phase: s.phase, active: s.sys.isActive(), health: s.health, carried: s.carried, hero: f && { x: f.x, y: f.y },
    live: (f && s.enemies?.getChildren().filter((e) => e.body?.enable).length) || 0, drops: s.drops?.length ?? 0, caches: s.caches?.length ?? 0 };
});
const arrived = (layout) => until((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.sys.isActive() && s.phase === 'play'; }, layout, 15000);
// kept from harm (he blinks); a blow that lands anyway is told
const keep = (on) => run((on) => {
  const s = window.game.scene.getScene('room'), hit = Object.getPrototypeOf(s).damageHero;
  s.invulnUntil = on ? Infinity : 0;
  if (on) s.damageHero = function (...a) { if (this.health - a[0] <= 0) console.log(`kept from death: ${a[0]} at ${Math.round(this.hero.x)},${Math.round(this.hero.y)} (${this.layout}, invuln ${this.invulnUntil})`); return this.health - a[0] <= 0 ? false : hit.apply(this, a); };
  else delete s.damageHero;
}, on);
const save = () => run(() => JSON.parse(localStorage.getItem('dracul.save')) ?? { banked: 0, shortcuts: [] });

/** The game's time (ms), its frames' deltas summed: on a loaded machine it runs slower than the clock (a frame of 200 ms
 *  at most), and a key held for the clock's 200 ms may never be seen down. The bot holds keys and gives up on game time. */
const clock = () => run(() => { const g = window.game; if (g.botClock === undefined) { g.botClock = 0; g.events.on('step', (t, d) => (g.botClock += d)); } return g.botClock; });
/** A deadline `ms` of game time away: true while it is not past (nor 6 times as long on the clock: the game stalled). */
async function timer(ms) {
  const t = await clock(), w = Date.now() + 6 * ms;
  return async () => Date.now() < w && (await clock()) < t + ms;
}
async function hold(keys, ms) {
  const t = await clock();
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForFunction(([t, ms]) => window.game.botClock >= t + ms, [t, ms], { timeout: 6 * ms + 1000 }).catch(() => {});
  for (const k of keys) await page.keyboard.up(k);
}

/** One step of a walk to floor point (x, y) along the walk grid (the way its enemies go round pits), toward the cell a
 *  few steps ahead, misting forward while far; false once his feet are within `r`. */
let last;
async function step(x, y, r = 6) {
  const d = await run(([x, y, r]) => {
    const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, b = s.room.bounds, cols = s.navCols;
    if (!f || s.phase !== 'play') return { wait: true }; // going through an exit, or coming in
    if (Math.hypot(x - f.x, y - f.y) < r) return null; // there
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
  if (d.wait) { await page.waitForTimeout(200); return true; }
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
  const from = (await state()).layout;
  for (const left = await timer(ms); await left();) if (!(await step(x, y, r)) || (await state()).layout !== from) return true;
  return false;
}
/** Chasing foes in the zone, the bot may walk into a door: back out by the place's stairs (the refuge's go down: a
 *  new expedition, which fails the run). */
async function stay() {
  const l = (await state()).layout;
  if (l === 'necropolis') return;
  if (l === 'refuge') check(false, 'walked up into the refuge mid-expedition: it ends there');
  console.log(`(walked into ${l} by mistake: back out)`);
  await until(() => window.game.scene.getScene('room').phase === 'play', null, 5000);
  await run((l) => window.game.scene.getScene('room').leave(l === 'refuge' ? 0 : -1), l);
  await arrived('necropolis');
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

/** The doors of the place, its ways up, the gallery's mouths: the bot never goes after a foe or blood within 48 px of
 *  one (chasing, it would walk through). */
const doors = () => run(() => { const s = window.game.scene.getScene('room'); return [...s.room.exits, s.room.stairs, ...(s.layout === 'necropolis' ? [{ x: 1690, y: 92 }, { x: 3260, y: 92 }] : [])]; });
/** Fights the enemies within `reach` (all: Infinity) of where he stood at the start, none by a door, the nearest first,
 *  for at most `ms`: walks up to it, claws it toward it. True once none is left there. */
async function fight(ms, reach = Infinity) {
  const at = (await state()).hero, by = await doors();
  for (const left = await timer(ms); await left();) {
    const t = await run(([reach, at, by]) => {
      const s = window.game.scene.getScene('room'), f = s.hero?.body?.center, c = s.cameras.main.worldView;
      if (!f) return undefined;
      at ??= f;
      const live = s.enemies.getChildren().filter((e) => e.body?.enable).map((e) => ({ x: e.body.center.x, y: e.body.center.y, d: Math.hypot(e.body.center.x - f.x, e.body.center.y - f.y) }));
      const e = live.filter((e) => Math.hypot(e.x - at.x, e.y - at.y) < reach && by.every((d) => Math.hypot(e.x - d.x, e.y - d.y) > 48)).sort((a, b) => a.d - b.d)[0];
      return e && { ...e, sx: (e.x - c.x) * 4, sy: (e.y - 8 - c.y) * 4 };
    }, [reach, at, by]);
    if (!t) return true;
    if (t.d > 24) await step(t.x, t.y, 20);
    else { await page.mouse.click(t.sx, t.sy); await page.waitForTimeout(80); }
  }
  return false;
}
/** Picks up the blood lying within `reach` (all: Infinity) of where he stood at the start, none by a door, the nearest first. */
async function gather(ms = 20000, reach = Infinity) {
  const at = (await state()).hero, by = await doors();
  for (const left = await timer(ms); await left();) {
    const d = await run(([reach, at, by]) => { const s = window.game.scene.getScene('room'), f = s.hero?.body?.center; at ??= f; return f && s.drops.map((d) => ({ x: d.x, y: d.y, k: Math.hypot(d.x - f.x, d.y - f.y) })).filter((d) => Math.hypot(d.x - at.x, d.y - at.y) < reach && by.every((o) => Math.hypot(d.x - o.x, d.y - o.y) > 48)).sort((a, b) => a.k - b.k)[0]; }, [reach, at, by]);
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
/** La carte (C) over the game, paused: captured (`name`.png), its cells seen counted (map.ts; `whole`: all of them
 *  first, the test hook), then closed by C. */
async function carte(name, whole = false) {
  const z = (await state()).layout, M = (f, z) => run(([f, z]) => import('/src/map.ts').then((M) => M[f](z)), [f, z]);
  if (whole) await M('revealAll', z);
  await page.keyboard.press('c');
  const open = await until(() => { const s = window.game.scene.getScene('room'); return !!s.carte && s.time.paused && s.physics.world.isPaused; }, null, 3000);
  const seen = await M('seen', z), { cols, rows } = await M('grid', z);
  check(open && seen > (whole ? cols * rows - 1 : 20), `C: la carte of ${z} over the game paused, ${seen} of ${cols * rows} cells seen (${name}.png)`);
  await page.waitForTimeout(300);
  await shot(name);
  await page.keyboard.press('c');
  check(await until(() => { const s = window.game.scene.getScene('room'); return !s.carte && !s.time.paused; }, null, 3000), 'C again: la carte closed, the game goes on');
}
/** Both zones' maps whole (the test hook: every cell seen), from their way in. */
async function wholeMaps() {
  for (const layout of ['necropolis', 'catacombs']) {
    await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
    await arrived(layout);
    await until(() => !!window.game.scene.getScene('room').hero?.body, null, 5000);
    await page.waitForTimeout(500);
    await carte(`map-${layout}-full`, true);
  }
}
/** F at a shortcut's winch until it is raised (a press mid-mist or mid-swing is not taken), then its rise. */
async function winch(id) {
  for (let k = 0; k < 6 && !(await save()).shortcuts.includes(id); k++) { await page.keyboard.press('f'); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
}
/** The panel's cursor down onto the list (the bag's, the chest's first item). */
async function cursorDown() {
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    const c = await run(() => { const s = window.game.scene.getScene('room'); return { cursor: s.satchel?.view.cursor, down: s.keys.DOWN.isDown, s: s.keys.S.isDown }; });
    if (c.cursor >= 6) return true;
    console.log(`ArrowDown not taken: ${JSON.stringify(c)}`);
  }
  return false;
}
const where = async () => { const h = (await state()).hero; return `${Math.round(h.x)},${Math.round(h.y)}`; };

// ---- Les catacombes: across the necropolis (its shortcuts open) to the well at its far end, down it; a gallery, a
// crossroads, le caveau's gate raised from below (the shortcut), le nid, the arena and Vesna's sealed reliquary; the
// battue loosed down there and up in the necropolis; back up le caveau's stairs, home. ----
const cull = (r) => run((r) => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; for (const e of s.enemies.getChildren()) if (e.body?.enable && Math.hypot(e.x - f.x, e.y - f.y) < r) s.kill(e); }, r);
/** A walk by way of `points`, the foes near him put down as he goes (what is checked here is the way, not the fights). */
async function trek(points, what) {
  for (const [x, y] of points) {
    await cull(220);
    if (!(await walk(x, y, 40000, 24))) return check(false, `${what}: walk to ${x},${y} cut short at ${await where()}`);
  }
  return check(true, what);
}
async function catacombs() {
  await run(() => { const s = JSON.parse(localStorage.getItem('dracul.save')); s.shortcuts = s.shortcuts.filter((k) => k !== 'caveau'); localStorage.setItem('dracul.save', JSON.stringify(s)); });
  await page.reload();
  await arrived('refuge');
  check(await walk(840, 846) || (await state()).layout === 'necropolis', 'expedition 3: down the stairs');
  check(await arrived('necropolis'), 'in la nécropole, its grille and its gallery open');
  await keep(true);
  const shutTop = await run(() => window.game.scene.getScene('room').room.zone.gates.filter((g) => !g.open).map((g) => g.id));
  check(shutTop.join() === 'caveau', `le caveau shut from the other side, from the necropolis (${shutTop.join()})`);
  await look('caveau-before', 720, 140);
  // the grille, the court, the gallery to the far side, the camp, the path to the well
  await trek([[700, 196], [1100, 232], [1400, 233], [1525, 250], [1525, 300], [1560, 330], [1690, 130], [1690, 104]], 'across the necropolis to the gallery');
  await page.keyboard.down('ArrowUp');
  await until(() => window.game.scene.getScene('room').phase !== 'play', null, 4000);
  await page.keyboard.up('ArrowUp');
  check(await until(() => { const s = window.game.scene.getScene('room'); return s.phase === 'play' && s.hero.body.center.x > 3000; }, null, 8000), `through the gallery to the far side (${await where()})`);
  await trek([[3220, 300], [2950, 430], [3050, 640], [3115, 720], [3150, 860], [3300, 930], [3420, 940], [3600, 1000], [3690, 1180], [3700, 1226]], 'through the camp, down the path to the well');
  await look('well-top', 3700, 1190);
  check(await exit(3700, 1222, 'ArrowUp', 'catacombs'), 'down the well, into les catacombes');
  await keep(true);
  const bottom = await state();
  check(Math.abs(bottom.hero.x - 2600) < 20 && bottom.hero.y < 200, `at the well's foot (${await where()})`);
  await until(() => window.game.scene.getScene('room').room.zone.chunks.shown.size >= 4, null, 10000); // its chunks in
  await page.waitForTimeout(500);
  await shot('cata-well-bottom');
  const placed = await run(() => { const s = window.game.scene.getScene('room'), live = s.enemies.getChildren().filter((e) => e.body?.enable), kinds = {}; for (const e of live) kinds[e.getData('kind')] = (kinds[e.getData('kind')] ?? 0) + 1;
    return { n: live.length, kinds, caches: s.caches.length, rats: s.vermin.length, chunks: s.room.zone.chunks.shown.size, light: s.room.light(2600, 210), shade: s.room.light(1100, 880) }; });
  check(placed.n > 15 && placed.caches >= 8, `catacombs: ${placed.n} foes by area (${JSON.stringify(placed.kinds)}), ${placed.caches} caches, ${placed.rats} rats about their nests, ${placed.chunks} chunks shown of 24; baked light ${placed.light.toFixed(2)} in the well's moon, ${placed.shade.toFixed(2)} in the low gallery`);
  await trek([[2400, 205], [2160, 215], [1960, 190]], 'the well to the ossuary gallery');
  await look('cata-gallery', 1880, 200);
  await trek([[1640, 195], [1440, 300], [1400, 330]], 'along the ossuary gallery to the great crossroads');
  await look('cata-crossroads', 1400, 320);
  await carte('map-catacombs');
  await trek([[1150, 245], [960, 210], [720, 200], [520, 180], [380, 175], [345, 160]], "the west gallery to le caveau's stairs");
  await walk(342, 154, 8000, 4);
  await look('cata-shortcut-before', 310, 150);
  await winch('caveau');
  await look('cata-shortcut-after', 310, 150);
  check((await save()).shortcuts.includes('caveau'), `F at its winch: la grille du caveau raised from below, saved (${(await save()).shortcuts.join(', ')})`);
  await trek([[262, 215], [218, 320], [262, 420], [360, 470], [520, 560]], 'down the rat-run into le nid');
  await look('cata-nid', 610, 630);
  await trek([[800, 720], [880, 770], [1080, 880], [1380, 930], [1450, 950], [1700, 1004], [1950, 1014], [2180, 1012], [2350, 1000]], 'the low gallery to the prison');
  // into the arena: its grille drops behind him, La Matrice comes down (her fight is tools/art/matrice.shots.mjs's: here she is put down)
  await walk(2350, 900, 8000, 6);
  check(await until(() => !!window.game.scene.getScene('room').fight, null, 8000), 'into the prison: its grille shut behind him, La Matrice comes down');
  await page.waitForTimeout(2500);
  await shot('cata-matrice');
  await run(() => { const s = window.game.scene.getScene('room'), e = s.fight.boss; s.kill(e); }); // (a blow would sink into her sac while her cords feed her)
  check(await until(() => { const s = window.game.scene.getScene('room'); return !s.fight && s.room.zone.gates.find((g) => g.arena).open; }, null, 8000) && (await save()).nourrice.dead, 'she dead: the grille rises, her death saved');
  await trek([[2360, 760], [2360, 728]], 'to her reliquary');
  for (let k = 0; k < 4 && !(await run(() => window.game.scene.getScene('room').cut)); k++) { await page.keyboard.press('f'); await page.waitForTimeout(400); }
  check(await run(() => window.game.scene.getScene('room').cut), "F at Vesna's reliquary: its seals break");
  check(await until(() => !window.game.scene.getScene('room').cut, null, 60000) && (await save()).vesna, 'Vesna freed, saved for good; the scene over');
  await look('cata-prison', 2360, 740);
  // his scent, down here: packs at the catacombs' narrow ways, and every other one up in the necropolis on his way home
  const scent = await run(async () => {
    const s = window.game.scene.getScene('room'), f = s.hero.body.center;
    s.addDrop({ x: f.x, y: f.y + 4, blood: 260 });
    await new Promise((r) => setTimeout(r, 1800));
    const down = s.enemies.getChildren().filter((e) => e.body?.enable && e.getData('pack')).map((e) => `${e.getData('kind')} ${Math.round(e.x)},${Math.round(e.y)}`);
    const up = s.exp.rooms.necropolis.foes.filter((f) => f.pack).map((f) => `${f.kind} ${Math.round(f.x)},${Math.round(f.y)}`);
    return { loosed: s.exp.loosed, down, up };
  });
  check(scent.down.length > 0 && scent.up.length > 0, `the battue: ${scent.loosed} packs loosed; down here: ${scent.down.join(' | ')}; up in the necropolis: ${scent.up.join(' | ')}`);
  await trek([[2350, 1000], [2180, 1012], [1700, 1004], [1450, 950], [1080, 880], [880, 770], [600, 650], [360, 470], [262, 420], [218, 320], [262, 215], [300, 150]], "back by the low gallery, le nid and the rat-run to le caveau's stairs");
  await walk(300, 134, 8000, 3); // square in its recess
  check(await exit(300, 134, 'ArrowUp', 'necropolis'), "up le caveau's stairs");
  const top = (await state()).hero;
  check(Math.abs(top.x - 720) < 20 && top.y > 150 && top.y < 200, `out of le caveau, in the near field (${Math.round(top.x)},${Math.round(top.y)})`);
  await page.waitForTimeout(600);
  await shot('caveau-after');
  await keep(true);
  await trek([[700, 196], [500, 185], [330, 175]], 'home from le caveau');
  check(await exit(230, 100, 'ArrowUp', 'refuge'), 'up the stairs into the refuge');
  const log = await run(() => JSON.parse(localStorage.getItem('dracul.log')).at(-1));
  check(log.end === 'retour' && log.deepest === 4 && log.boss === 'tuée', `expedition 3 logged: ${log.end}, ring ${log.deepest}, ${log.blood} blood, ${log.loosed}/${log.met} packs, the Nourrice ${log.boss}`);
  check(await until(() => !!window.game.scene.getScene('room').vesna, null, 8000), 'Vesna at the refuge, behind her stall');
}
const rate = (ms) => run((ms) => new Promise((done) => { const f0 = window.game.loop.frame, t0 = performance.now(); setTimeout(() => done(((window.game.loop.frame - f0) * 1000) / (performance.now() - t0)), ms); }), ms);
/** Headless FPS in the catacombs: opened directly, then walked west along the ossuary gallery across chunk borders. */
async function catacombsFps(fps) {
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'catacombs' }));
  await arrived('catacombs');
  await keep(true);
  await page.waitForTimeout(4000); // its first chunks read back (their light): a slow start
  fps.push(`catacombs ${(await rate(2000)).toFixed(1)}`);
  await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) e.disableBody(true, true); });
  await run(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(2520, 205); });
  await page.waitForTimeout(800);
  const chunks = [], measure = rate(9000);
  for (const left = await timer(9000); await left();) { await step(1500, 240, 8); chunks.push(await run(() => window.game.scene.getScene('room').room.zone?.chunks.shown.size ?? -1)); }
  const n = await measure, x = (await state()).hero.x;
  fps.push(`catacombs walked across chunk borders ${n.toFixed(1)} (to x ${Math.round(x)}, ${Math.min(...chunks)}-${Math.max(...chunks)} chunks shown)`);
  check(x < 2400 && Math.max(...chunks) <= 12, `walking west across the catacombs' chunk borders, ${Math.max(...chunks)} chunks held at most`);
}
/** The end: the zones' overviews, the log, the verdict. */
async function end() {
  for (const z of ['necropolis', 'catacombs']) if (existsSync(`shots/${z}-overview.png`) && out !== 'shots') await copyFile(`shots/${z}-overview.png`, `${out}/${z}-overview.png`);
  console.log(report.join('\n'));
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
  console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
  await browser.close();
  await server.close();
  process.exit(errors.length || failed.length ? 1 : 0);
}

/** Headless FPS: each place opened directly (its foes on their posts, the hero kept from harm); the zones walked across
 *  chunk borders. */
async function measureFps() {
  const fps = [];
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
    await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) e.disableBody(true, true); s.hero.body.reset(330, 176); }); // the north path, out of the way
    await page.waitForTimeout(800);
    const chunks = [], measure = rate(9000);
    let x = 0; // past x 960: the walk is checked, not how far 9 s on a loaded machine's clock take him
    for (const left = await timer(30000); x <= 1000 && await left();) { // east along the north path, through x 480 and 960: chunk borders
      await step(1300, 233, 8);
      chunks.push(await run(() => { const s = window.game.scene.getScene('room'); return s.room.zone?.chunks.shown.size ?? -1; }));
      x = (await state()).hero?.x ?? x;
    }
    const n = await measure;
    if (chunks.includes(-1)) console.log(`left the zone while walking: ${(await state()).layout}`);
    fps.push(`necropolis walked across chunk borders ${n.toFixed(1)} (to x ${Math.round(x)}, ${Math.min(...chunks)}-${Math.max(...chunks)} chunks shown)`);
    check(x > 960 && Math.max(...chunks) <= 12, `walking east across chunk borders, ${Math.max(...chunks)} chunks held at most`);
  }
  await catacombsFps(fps);
  console.log(`headless fps: ${fps.join(', ')}`);
}

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await run(() => localStorage.clear());
await page.reload();
await arrived('refuge');
await page.waitForTimeout(500);
if (arg('only', '') === 'fps') { await measureFps(); await end(); } // the frame rates alone
if (arg('only', '') === 'map') { // la carte alone: each zone's after a short walk, then whole
  check(await walk(840, 846) || (await state()).layout === 'necropolis', 'down the stairs');
  check(await arrived('necropolis'), 'in la nécropole');
  await keep(true);
  await trek([[330, 176], [700, 196], [1100, 232], [1100, 420], [800, 520]], 'a walk along the north path, into the field');
  await carte('map-necropolis');
  await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'catacombs' }));
  await arrived('catacombs');
  await until(() => !!window.game.scene.getScene('room').hero?.body, null, 5000); // the restart's init() already says 'play'
  await keep(true);
  await trek([[2400, 205], [2160, 215], [1960, 190], [1640, 195], [1440, 300]], 'from the well along the ossuary gallery');
  await carte('map-catacombs');
  await wholeMaps();
  await end();
}
if (arg('only', '') === 'catacombs') { // the catacombs alone, from a save with the necropolis' shortcuts open
  await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 2, banked: 0, shortcuts: ['grille', 'galerie'] })));
  await catacombs();
  const fps = [];
  await catacombsFps(fps);
  console.log(`headless fps: ${fps.join(', ')}`);
  await end();
}

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
// the shade: by the braziers of the refuge's forecourt he stands in light, in the field's dark not (RoomScene hunts())
const light = await run(() => { const s = window.game.scene.getScene('room'); return { forecourt: s.room.light(190, 142), field: s.room.light(900, 330), lit: s.inLight }; });
check(light.forecourt >= 0.6 && light.field < 0.6, `the baked light read back: ${light.forecourt.toFixed(2)} by the forecourt's braziers, ${light.field.toFixed(2)} in the field (he is ${light.lit ? 'in light' : 'in the shade'})`);
check(placed.n > 30 && placed.idle === placed.n && placed.near > 150, `zone: ${placed.n} foes on their posts by area, none hunting him (${JSON.stringify(placed.kinds)}), the nearest ${Math.round(placed.near)} px away; ${placed.caches} caches; ${placed.chunks} chunks shown of 40`);
const byRing = await run(() => { const s = window.game.scene.getScene('room'), r = {}; for (const e of s.enemies.getChildren()) { const k = e.x < 1350 ? 'proche' : e.x < 2612 ? 'milieu' : 'loin'; (r[k] ??= new Set()).add(e.getData('kind')); } return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].join(' ')])); });
check(!/inquisitor|ringer|purifier|priest/.test(byRing.proche ?? ''), `foes by distance: near ${byRing.proche} | middle ${byRing.milieu} | far ${byRing.loin}`);
{ // The nearest group on its post, the hero coming up to it unseen (just out of its sight), between them on screen.
  const f = (await state()).hero, g = placed.at.filter((e) => e.x < 1300).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  for (const left = await timer(30000); await left();) {
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
await carte('map-necropolis'); // what he has seen of it so far
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
    const hid = await run(() => { const s = window.game.scene.getScene('room'), c = s.caches.find((c) => Math.hypot(c.x - s.hero.body.center.x, c.y - s.hero.body.center.y) < 24); c.item ??= s.found(1, true); return c.item; }); // this one hides an item
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    await gather(5000);
    check((await state()).carried > before, `cache searched (F): ${before} -> ${(await state()).carried} blood`);
    // the item it hid, on the floor beside the blood: taken (F), into the bag
    const lying = await run(() => window.game.scene.getScene('room').loot.map(({ x, y, item }) => ({ x, y, n: item.n })));
    const it = lying.find((l) => l.n === hid.n);
    if (check(!!it, `the cache hid an item: ${hid.id} (rarity ${hid.r}), lying on the floor`)) {
      await walk(it.x - 26, it.y + 14, 8000, 6); // near enough for its words, the glint in sight
      await page.waitForTimeout(600);
      await shot('item-glint');
      await walk(it.x - 8, it.y + 4, 6000, 4);
      await page.keyboard.press('f');
      await page.waitForTimeout(300);
      const bag = await run(() => window.game.scene.getScene('room').bag.map((b) => b.n));
      check(bag.includes(hid.n), `F: ${hid.id} taken into the bag (${bag.length} carried)`);
      // le sac: I, the cursor down onto it, Enter wears it
      await page.keyboard.press('i');
      check(await until(() => window.game.scene.getScene('room').satchel?.mode === 'sac', null, 2000), 'I: le sac opens, the game paused');
      await page.waitForTimeout(200);
      check(await cursorDown(), 'ArrowDown: the cursor on the bag');
      await shot('sac');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const worn = await run(() => { const s = window.game.scene.getScene('room'); return { worn: JSON.parse(localStorage.getItem('dracul.save')).worn.filter(Boolean).map((w) => w.n), bag: s.bag.length, paused: s.time.paused }; });
      check(worn.worn.includes(hid.n) && worn.bag === 0 && worn.paused, `Enter: ${hid.id} worn in the field (bag ${worn.bag}), the game paused meanwhile`);
      await page.keyboard.press('Escape');
      check(await until(() => !window.game.scene.getScene('room').satchel && !window.game.scene.getScene('room').time.paused, null, 2000), 'Escape: le sac closed, the game goes on');
      // the bag full, another item on the floor: F asks which to leave; Enter leaves the first, the new one in its place
      const full = await run(() => {
        const s = window.game.scene.getScene('room'), f = s.hero.body.center;
        while (s.bag.length < 4) s.bag.push(s.found(1, true));
        s.showBlood();
        const it = s.found(2, true);
        s.addLoot({ x: f.x + 6, y: f.y + 2, item: it });
        return { first: s.bag[0].n, it: it.n };
      });
      await page.waitForTimeout(400);
      await page.keyboard.press('f');
      check(await until(() => !!window.game.scene.getScene('room').satchel?.ground, null, 2000), 'the bag full: F on an item opens le sac to choose what to leave');
      await page.waitForTimeout(200);
      await shot('swap');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const swapped = await run(() => { const s = window.game.scene.getScene('room'); return { bag: s.bag.map((b) => b.n), floor: s.loot.map((l) => l.item.n), open: !!s.satchel }; });
      check(swapped.bag[0] === full.it && swapped.floor.includes(full.first) && swapped.bag.length === 4 && !swapped.open, `swapped: the new item in the bag, the one left on the floor (bag ${swapped.bag.join(' ')})`);
    }
  }
}
check(await exit(240, 616, 'ArrowDown', 'necropolis'), 'out of the crypt by its stairs');
const outside = (await state()).hero;
check(Math.abs(outside.x - 760) < 20 && outside.y > 478 && outside.y < 540, `back in the zone at the crypt's door (${Math.round(outside.x)},${Math.round(outside.y)})`);
await keep(false);
await page.waitForTimeout(700);
await shot('hud-blood');
await shot('hud', { x: 0, y: 820, width: 1100, height: 260 }); // the HUD's bottom left: heart, vein, pouch, the bag
await keep(true);
// across: the field, the bridge, the middle, the breach, the far side
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
await cull(320); // the far side's foes: what is checked here is the winch
await walk(3302, 120, 8000, 4);
await look('shortcut-gallery-before', 3270, 150);
await winch('galerie');
await look('shortcut-gallery-after', 3270, 150);
check((await save()).shortcuts.includes('galerie'), `F at its winch: the sealed door raised, saved (${JSON.stringify((await save()).shortcuts)})`);
// his scent: two packs of the battue loosed across the zone, between him and the refuge
const scent = await run(async () => {
  const s = window.game.scene.getScene('room'), f = s.hero.body.center, warn = s.warn.bind(s), warned = [];
  s.warn = (inq) => (warned.push(inq), warn(inq));
  s.addDrop({ x: f.x, y: f.y + 4, blood: 400 }); // two thresholds or more crossed at once, even with a worn Flacon scellé (it raises them)
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
// the battue posted on his way back, at a narrow way out of the gallery: he walks on toward it until they are upon him
const upon = () => run(() => { const s = window.game?.scene.getScene('room'), f = s?.hero?.body?.center; if (!f || !s.sys.isActive()) return false; return s.enemies.getChildren().some((e) => e.body?.enable && Math.hypot(e.x - f.x, e.y - f.y) < 90 && (e.getData('pack') || e.getData('kind') === 'hound')); });
const pack = () => run(() => { const s = window.game.scene.getScene('room'), f = s.hero.body.center; return s.enemies.getChildren().filter((e) => e.body?.enable && (e.getData('pack') || e.getData('kind') === 'hound')).map((e) => ({ x: e.body.center.x, y: e.body.center.y, d: Math.hypot(e.x - f.x, e.y - f.y) })).sort((a, b) => a.d - b.d)[0]; });
let met = false;
for (const left = await timer(30000); !(met ||= await upon()) && await left();) { const p = await pack(); if (p) await step(p.x, p.y, 40); else await page.waitForTimeout(150); }
if (met) {
  await keep(false);
  await until(() => { const s = window.game.scene.getScene('room'); return s.phase === 'play' && !s.cameras.main.fadeEffect.isRunning; }, null, 5000); // out of the gallery's fade: the pack seen
  await page.waitForTimeout(200);
  await shot('battue');
  await keep(true);
  check(await fight(60000, 260), 'the battue met on the way back (by the gallery), fought off');
  await stay();
  await gather(8000, 200);
  await stay();
} else check(false, `the battue met on the way back (${await where()})`);
await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) if (e.body?.enable && !e.getData('pack') && Math.hypot(e.x - 1525, e.y - 316) < 260) s.kill(e); }); // the middle's, by the grille
check(await route([[1560, 340], [1525, 316]]), 'to the grille, on its side');
await walk(1525, 314, 6000, 4);
await look('shortcut-grille-before', 1525, 270);
await winch('grille');
await look('shortcut-grille-after', 1525, 270);
check((await save()).shortcuts.includes('grille'), `the grille raised, saved (${JSON.stringify((await save()).shortcuts)})`);
// back through it, by the court, the causeway and the field's north path; the other pack holds the refuge's stairs
check(await route([[1525, 250], [1400, 233], [1100, 232], [700, 196], [330, 175]]), 'through the grille, over the causeway, along the north path');
check(await fight(40000, 260), 'the other pack, holding the refuge stairs, fought off'); // its hounds would shove him off the stairs
await stay();
await gather(8000, 200);
await stay();
const back = await run(() => window.game.scene.getScene('room').exp);
console.log(`the battue: ${back.loosed} packs loosed, ${back.met} found him`);
const bring = (await state()).carried;
console.log(`before the stairs: ${JSON.stringify(await run(() => { const s = window.game.scene.getScene('room'); return { health: s.health, invuln: s.invulnUntil, carried: s.carried }; }))}`);
check(await exit(230, 100, 'ArrowUp', 'refuge'), 'up the stairs into the refuge');
check(await run(() => !window.game.scene.getScene('room').lost), 'came up alive');
check(await walk(840, 684, 20000, 8) && (await until(() => window.game.scene.getScene('room').carried === 0, null, 5000)), 'walked to the basin');
await page.waitForTimeout(350);
await shot('basin');
const bank = await save();
check(bank?.banked === bring && bank.shortcuts.length === 2, `poured ${bring} blood into the basin: banked ${bank?.banked}, the shortcuts kept (${bank.shortcuts.join(', ')})`);
// home: what he carried and wore is in le coffre, acquired for good
const kept = bank.worn.filter(Boolean).map((w) => w.n);
check(kept.length === 1 && bank.stash.length === 5 && kept.every((n) => bank.stash.some((s) => s.n === n)), `le coffre holds ${bank.stash.length} items (the bag's 4 and the one worn: ${bank.stash.map((s) => s.id).join(', ')})`);
check(await walk(762, 678, 15000, 6), 'walked up to le coffre');
await page.keyboard.press('f');
check(await until(() => window.game.scene.getScene('room').satchel?.mode === 'coffre', null, 3000), 'F: le coffre opens');
await page.waitForTimeout(200);
await cursorDown();
await shot('coffre');
await page.keyboard.press('Escape');

// ---- Expedition 2: the zone new, the shortcuts still open, blood picked up, death ----
check(await walk(840, 846) || (await state()).layout === 'necropolis', 'down the stairs again');
check(await arrived('necropolis'), 'expedition 2: in the zone, the world new');
const fresh = await run(() => { const s = window.game.scene.getScene('room'); return { live: s.enemies.getChildren().filter((e) => e.body?.enable).length, open: s.room.zone.gates.filter((g) => g.open).map((g) => g.id) }; });
check(fresh.live > 30 && fresh.open.length === 3, `zone repopulated: ${fresh.live} foes; open for good: ${fresh.open.join(', ')}`);
await keep(true);
for (let i = 0; i < 6 && (await state()).carried === 0; i++) { await fight(10000, 900); await stay(); await gather(5000, 600); await stay(); }
const lost = (await state()).carried;
check(lost > 0, `blood carried before dying: ${lost}`);
// a new item, of another family than the one acquired: taken and worn, not yet brought back
const fresh2 = await run(() => {
  const s = window.game.scene.getScene('room'), f = s.hero.body.center, mine = JSON.parse(localStorage.getItem('dracul.save')).worn.find(Boolean);
  const it = { n: 9000, id: ['acier', 'stylet', 'fer', 'faucille', 'saignee', 'goule'].includes(mine.id) ? 'linceul' : 'acier', r: 2 }; // a free slot of its own
  s.addLoot({ x: f.x + 6, y: f.y + 2, item: it });
  return { it, mine: mine.n };
});
await page.waitForTimeout(300);
await page.keyboard.press('f');
await page.waitForTimeout(300);
await page.keyboard.press('i');
await until(() => !!window.game.scene.getScene('room').satchel, null, 2000);
await page.waitForTimeout(200);
await cursorDown();
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check((await save()).worn.some((w) => w?.n === 9000), `expedition 2: a new item (${fresh2.it.id}) taken and worn, not yet brought back`);
await keep(false);
await run(() => { const s = window.game.scene.getScene('room'); s.health = 1; s.hud.health(1, s.maxHealth()); });
for (const left = await timer(30000); (await state()).layout === 'necropolis' && await left();) {
  const s = await state();
  if (s.live) await fight(1500); else break;
}
if ((await state()).layout === 'necropolis') await run(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = s.dashUntil = 0; s.damageHero(99); }); // nothing near enough to kill him
check(await arrived('refuge'), 'died: re-formed at the coffin');
await page.waitForTimeout(300);
await shot('death');
const after = await run(() => ({ carried: window.game.scene.getScene('room').carried, save: JSON.parse(localStorage.getItem('dracul.save')), log: JSON.parse(localStorage.getItem('dracul.log')) }));
check(after.carried === 0 && after.save?.banked === bank?.banked, `the blood carried is lost (${lost}), the bank untouched (${after.save?.banked})`);
check(!after.save.worn.some((w) => w?.n === 9000) && !after.save.stash.some((s) => s.n === 9000) && after.save.worn.some((w) => w?.n === fresh2.mine) && after.save.stash.length === 5,
  `at death the new item is lost; the one brought back is still worn, le coffre still holds ${after.save.stash.length}`);
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

await catacombs();

// ---- Headless FPS: each place opened directly (its foes on their posts, the hero kept from harm); the zones walked
// across chunk borders ----
await measureFps();

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
    const until = async (f) => { for (const end = Date.now() + 8000; !f() && Date.now() < end;) await wait(20); return f(); }; // on game time, not the clock's
    s.health = 3; s.hud.health(3, s.maxHealth());
    s.hero.body.reset(e.x - 18, e.y);
    const t0 = s.time.now;
    await until(() => s.time.now > t0 + 200);
    s.slash(Math.atan2(e.body.center.y - s.hero.body.center.y, e.body.center.x - s.hero.body.center.x));
    const knelt = await until(() => s.time.now < e.getData('kneelUntil')), hp = e.getData('hp');
    await until(() => s.time.now >= s.slashUntil); // no bite mid-swing
    s.hero.body.reset(e.x - 18, e.y); // the claw's knockback may have carried it out of reach on a slow frame
    s.bite();
    const dead = await until(() => !e.body?.enable);
    await until(() => s.health > 3); // healed as it dies
    return { knelt, hp, health: s.health, dead };
  });
  check(bit.knelt && bit.hp === 1 && bit.dead && bit.health > 3, `clawed to ${bit.hp} hp, he kneels (${bit.knelt}); bitten (${bit.dead ? 'dead' : 'alive'}): 3 -> ${bit.health} blood`);
  await page.click('#training [data-spawn="matrice"]');
  await page.click('#training [data-spawn="nourrice"]');
  const bosses = await until(() => ['matrice', 'nourrice'].every((k) => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable && e.getData('kind') === k)), null, 10000);
  await page.waitForTimeout(1500);
  await shot('training-bosses');
  check(bosses, 'the training room calls in la Matrice and l\'Araignée');
  await page.click('#training [data-opt="passive"]');
}
await wholeMaps();
await end();
