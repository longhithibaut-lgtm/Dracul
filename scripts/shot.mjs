// Plays a scripted fight in headless Chromium and saves comparable screenshots (1920x1080 = native x4).
// Usage: npm run shot [-- --out=shots --port=5199]
// Writes room.png and combat.png (full frames, combat taken 40 ms after a dash-in slash) plus crops:
// hero.png (running diagonally), enemy.png (winding up an attack), fx.png, hud.png (3/5 health, dash spent, a full
// shelf: four slot gifts, talents, a pact, rare and épique marks, la Nuée ready),
// light.png (a lit lantern, the hero at the edge of its holy light), crossbow.png (a crossbowman aiming), weak.png (a
// weakened crossbowman, its heartbeat drop on the beat), bite.png (the hero latched onto it, mid-drain), gifts.png
// (full frame, the room cleared and three cards dealt: Rat de jet rare replacing Éclats pestilents, Glyphe pestilent
// épique, hovered, and the pact Vermine), doors-hall.png (the top of the crypt: its two portcullises up, the reward
// behind each hung lit in its arch, a gift choice and blood, the hero come up to the left one, its name shown), then
// one exit of every kind taken (blood, an upgrade, a pact, a gift choice) and the next room's medallion caught with that
// reward risen on it, medal-sang.png, medal-upgrade.png, medal-pacte.png, medal-gift.png; training.png (full frame: the training room, its panel, enemies called in from it), tir.png
// (the hero mid-throw, a plagued shard of blood in flight toward a ghoul) and glyph.png (the glyph cast with E at the
// pointer, binding two ghouls, the hero beside it), then rooms-hall.png, rooms-nave.png, rooms-ossuary.png,
// rooms-chapel.png and rooms-cloister.png (each room layout whole, empty, from the gate down to the stairs: they are
// taller than the screen, so a screen at a time stitched together, without the HUD and the vignette) and dawn.png (the
// hero standing in the cloister's Eternal Dawn, the danger building before the first burn: smoke, glow, gauge),
// doors-cloister.png (the church's two doors open on an upgrade and a pact, the hero under the north walk), and
// swarm.png (the hero turned into la Nuée from the training panel, running through two dummies and biting them).
// The rooms are taller than the screen and the camera follows the hero: crops are given in room coordinates.
// Exit code 1 if the page logged an error or a capture is missing.
import { mkdir, writeFile } from 'node:fs/promises';
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const state = () => page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  const live = s.enemies.getChildren().filter((e) => e.body?.enable);
  return { hx: s.hero.x, hy: s.hero.y, health: s.health, enemies: live.map((e) => ({ x: e.x, y: e.y, st: e.getData('state') })) };
});
const freeze = (on) => page.evaluate((on) => (on ? window.game.loop.sleep() : window.game.loop.wake()), on);
// The room point at the screen's top left, and that point to screenshot pixels.
const view = () => page.evaluate(() => { const w = window.game.scene.getScene('room').cameras.main.worldView; return { x: w.x, y: w.y }; });
const screen = async (x, y) => { const v = await view(); return { x: (x - v.x) * X, y: (y - v.y) * X }; };
// The camera straight onto the hero, after he is moved (it follows him smoothly, too slowly for a capture).
const snap = () => page.evaluate(() => { const s = window.game.scene.getScene('room'); s.cameras.main.centerOn(s.hero.x, s.hero.y); });
// Crop of `w`x`h` screenshot pixels centred on a room point, kept inside the frame.
const clip = async (cx, cy, w, h) => {
  const p = await screen(cx, cy);
  return { x: Math.min(Math.max(p.x - w / 2, 0), 1920 - w), y: Math.min(Math.max(p.y - h / 2, 0), 1080 - h), width: w, height: h };
};
const shot = (name, c) => page.screenshot({ path: `${out}/${name}.png`, clip: c });

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
// The game starts in the refuge: a run, room 1 in the crypt.
await page.evaluate(() => window.game.scene.getScene('room').scene.restart({ layout: 'hall' }));
await page.waitForFunction(() => window.game.scene.getScene('room').layout === 'hall' && window.game.scene.getScene('room').hero?.body && window.game.scene.isActive('room'));
await page.waitForTimeout(400);

await freeze(true);
await shot('room');
await freeze(false);
// The hero mid-stride on a diagonal, like the reference.
await page.keyboard.down('d');
await page.keyboard.down('s');
await page.waitForTimeout(250);
await freeze(true);
let s = await state();
await shot('hero', await clip(s.hx, s.hy - 4, 240, 200));
await freeze(false);
await page.keyboard.up('d');
await page.keyboard.up('s');

// The first enemy to reach the idle hero, winding up its attack: its most menacing, telegraphed pose, before the
// melee clutters the frame.
{
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren()
    .some((e) => e.body?.enable && e.getData('state') === 'windup' && e.getData('flashUntil') < window.game.scene.getScene('room').time.now), null, { timeout: 8000 });
  await page.waitForTimeout(150); // mid-windup
  await freeze(true);
  const w = await page.evaluate(() => {
    const e = window.game.scene.getScene('room').enemies.getChildren().find((o) => o.body?.enable && o.getData('state') === 'windup');
    return e ? { x: e.x, y: e.y } : null;
  });
  if (w) await shot('enemy', await clip(w.x, w.y - 4, 240, 200));
  await freeze(false);
}

// Line up horizontally with an enemy, mist-dash in and slash, like the reference frame: the capture shows the dash
// trail, the swing and the impact together.
await page.waitForFunction(() => window.game.scene.getScene('room').enemies.countActive() > 0);
let captured = false;
for (let i = 0; i < 200 && !captured; i++) {
  s = await state();
  if (!s.enemies.length) { await page.waitForTimeout(100); continue; }
  const dist = (e) => Math.hypot(e.x - s.hx, e.y - s.hy);
  const side = s.enemies.filter((e) => Math.abs(e.x - s.hx) > 20);
  const e = (side.length ? side : s.enemies).reduce((a, b) => (dist(a) < dist(b) ? a : b));
  const dx = e.x - s.hx, dy = e.y - s.hy;
  if (Math.abs(dy) > 6 || Math.abs(dx) > 72) {
    const keys = [];
    if (Math.abs(dx) > 72) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 6) keys.push(dy > 0 ? 's' : 'w');
    await hold(keys, 60);
    continue;
  }
  if (Math.abs(dx) < 50) { await hold([dx > 0 ? 'a' : 'd'], 60); continue; } // back off for a run-up
  const pre = { x: s.hx, y: s.hy };
  await page.keyboard.down(dx > 0 ? 'd' : 'a');
  // Space is held until the dash is over: Phaser drops a key pressed and released between two updates (slow frames
  // in headless). The click right after is the dash strike (mist-tinted swing).
  await page.keyboard.down('Space');
  await page.waitForFunction(() => { const r = window.game.scene.getScene('room'); return r.dashUntil > 0 && r.time.now >= r.dashUntil; });
  await page.keyboard.up('Space');
  await page.keyboard.up(dx > 0 ? 'd' : 'a');
  s = await state();
  const target = s.enemies.length ? s.enemies.reduce((a, b) => (dist(a) < dist(b) ? a : b)) : e;
  const at = await screen(target.x, target.y);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(40);
  await freeze(true);
  s = await state();
  await shot('combat');
  await shot('fx', await clip((pre.x + target.x) / 2, s.hy, 480, 270));
  await freeze(false);
  captured = true;
}

// HUD in a representative mid-fight state, like the reference: 3 of 5 health, dash just spent, five gifts shown (one
// per slot, then a talent).
if (captured) {
  // The gifts held for the frame only (the pact and the others would change the fights to come), so la Nuée is ready.
  const held = await page.evaluate(() => {
    const s = window.game.scene.getScene('room'), held = [s.gifts, s.ranks];
    s.gifts = ['rongeur', 'nid', 'griffes', 'eclats', 'miasme', 'fievre', 'glaneur', 'noires'];
    s.ranks = { griffes: 1, nid: 2, fievre: 1 };
    s.health = 3; s.hud.health(3, 5); s.hud.gifts(s.gifts, s.ranks);
    return held;
  });
  await page.waitForTimeout(900); // let the lost-health animation settle
  await page.keyboard.press('Space', { delay: 100 }); // held across a couple of frames, see above
  await page.waitForTimeout(100);
  await freeze(true);
  await shot('hud', { x: 0, y: 0, width: 480, height: 160 }); // with the gift shelf
  await freeze(false);
  await page.evaluate(([g, r]) => { const s = window.game.scene.getScene('room'); s.gifts = g; s.ranks = r; s.hud.gifts(g, r); }, held);
}

// A sacred lantern, lit, with the hero just inside the edge of its holy light, smoking before the first burn lands.
// The fight is cleared away first so the frame only holds the two of them.
let lit = false;
if (captured) {
  const l = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    if (s.dead) return null;
    s.enemies.clear(true, true);
    const l = s.addLantern();
    return l ? { x: l.x, y: l.y } : null;
  });
  if (l) {
    await page.waitForFunction(() => window.game.scene.getScene('room').lanterns[0]?.lit);
    await page.waitForTimeout(300); // all bands up
    const hx = l.x + (l.x > 240 ? -34 : 34); // toward the middle of the hall; feet 0.85 of the radius out
    await page.evaluate(({ x, y }) => window.game.scene.getScene('room').hero.body.reset(x, y), { x: hx, y: l.y - 8 }); // feet 8 px below
    await snap();
    await page.waitForFunction(() => window.game.scene.getScene('room').litMs > 200); // smoking, inside the burn's grace
    await freeze(true);
    await shot('light', await clip((l.x + hx) / 2, l.y - 8, 240, 200));
    await freeze(false);
    lit = true;
  }
}

// A crossbowman of the Order mid-aim, raised and sighting, not yet locked. They join from the second wave, so
// that wave is called now, with the hero kept alive for it, in the room's middle part where it rises.
let bow = null;
{
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    s.invulnUntil = Infinity;
    s.hero.body.reset(240, s.room.sections[0] - 40);
    s.wave = 1;
    s.spawnWave();
  });
  await snap();
  await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.enemies.getChildren()
    .some((e) => e.body?.enable && e.getData('kind') === 'crossbow' && e.getData('state') === 'aim' && e.getData('fireAt') - s.time.now < 400); }, null, { timeout: 30000 }).catch(() => {});
  await freeze(true);
  bow = await page.evaluate(() => {
    const e = window.game.scene.getScene('room').enemies.getChildren().find((o) => o.body?.enable && o.getData('state') === 'aim');
    return e ? { x: e.x, y: e.y } : null;
  });
  if (bow) await shot('crossbow', await clip(bow.x, bow.y - 4, 240, 200));
  await freeze(false);
}

// La Morsure. A crossbowman left alone with one blood (weakened, as after one slash) and the hero kept out of frame:
// its hunch, bloodied tabard and beating drop. Then the hero bites it through the real bite, caught mid-drain.
let bit = null;
{
  const p = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const prey = s.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === 'crossbow');
    if (s.dead || !prey) return null;
    for (const e of s.enemies.getChildren().slice()) if (e !== prey) { e.getData('markG')?.destroy(); e.destroy(); }
    s.bolts.clear(true, true);
    s.invulnUntil = 0; // nothing left can hurt him, and an invulnerable hero blinks
    prey.body.reset(256, 226); // below the medallion, out of every lantern's light
    prey.setVelocity(0).setData({ hp: 1, state: 'chase', until: Infinity, facing: Math.PI });
    s.hero.body.reset(prey.x - 45, prey.y - 1);
    s.facing = 0;
    return { x: prey.x, y: prey.y, phase: prey.getData('phase') };
  });
  await snap();
  if (p) {
    await page.waitForFunction((phase) => { const n = (window.game.scene.getScene('room').time.now + phase) % 700; return n > 10 && n < 60; }, p.phase);
    await freeze(true);
    await shot('weak', await clip(p.x, p.y - 10, 240, 200));
    await freeze(false);
    const hp = await page.evaluate(({ x, y }) => {
      const s = window.game.scene.getScene('room');
      s.health = 3;
      s.hud.health(3, 5);
      s.hero.body.reset(x - 20, y - 1);
      s.bite();
      return s.health;
    }, p);
    await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.time.now - s.biteAt > 150; }); // mid-drain, with frames to spare in the dark rooms' slower headless frames
    await freeze(true);
    const latched = await page.evaluate(() => !!window.game.scene.getScene('room').prey);
    if (latched) await shot('bite', await clip(p.x - 6, p.y - 8, 240, 200));
    await freeze(false);
    await page.waitForFunction(() => !window.game.scene.getScene('room').prey, null, { timeout: 3000 }).catch(() => {});
    bit = latched && `${hp} -> ${await page.evaluate(() => window.game.scene.getScene('room').health)} blood`;
  }
}

// The room cleared and its gift taken: the cards open. The bot never clears a room on its own, so the fight is
// moved on to the room's last wave and its enemies are killed; then the hero is put on the gift and the cards are
// dealt (the draw is random): a rare, an épique and a pact, the first replacing a gift held.
const room = () => page.evaluate(() => { const s = window.game.scene.getScene('room'); return { phase: s.phase, no: s.roomNo, gifts: s.gifts }; });
// The two exits' rewards are random: `pair` makes them these two kinds (in either order), the next room's canOffer()
// left alone.
const rig = (pair) => page.evaluate((pair) => { const s = window.game.scene.getScene('room'); s.canOffer = (k) => pair.includes(k); }, pair);
const unrig = () => page.evaluate(() => delete window.game.scene.getScene('room').canOffer);
// Out through the exit announcing `kind`: the hero walks up into it, into the next room.
const through = async (kind) => {
  const no = await page.evaluate((kind) => {
    const s = window.game.scene.getScene('room'), g = s.room.exits[s.doors.indexOf(kind)];
    s.hero.body.reset(g.x, g.y + 20);
    return s.roomNo;
  }, kind);
  await page.keyboard.down('w');
  const ok = await page.waitForFunction((no) => { const s = window.game.scene.getScene('room'); return s.roomNo === no + 1 && s.sys.isActive() && s.hero?.body; }, no, { timeout: 8000 }).then(() => true, () => false);
  await page.keyboard.up('w');
  return ok;
};
let gifts = false, gate = false;
const medals = [];
{
  // The bite's kill calls the next wave in: wait for it, then end it as the room's last.
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().some((e) => e.body?.enable), null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    s.gifts = ['griffes', 'eclats', 'nuee', 'rongeur', 'fuite', 'morsure', 'survivant'];
    s.hud.gifts(s.gifts);
    s.wave = s.roomNo * 3; // T.run.wavesPerRoom
    for (const e of s.enemies.getChildren().filter((e) => e.body?.enable)) s.kill(e);
  });
  if (await page.waitForFunction(() => window.game.scene.getScene('room').pickup?.ready, null, { timeout: 8000 }).catch(() => null)) {
    await page.evaluate(() => {
      const s = window.game.scene.getScene('room'), m = s.room.medallion;
      s.hero.body.reset(m.x, m.y - 8); // feet on it
      s.openGifts('gift', [{ id: 'jet', rank: 1 }, { id: 'pestilent', rank: 2 }, { id: 'vermine', rank: 0 }]);
    });
    await snap();
    await page.waitForFunction(() => window.game.scene.getScene('room').cards);
    await page.waitForTimeout(600); // the cards have slid in
    await page.mouse.move(240 * X, 140 * X); // hover the middle card
    await page.waitForTimeout(100);
    await freeze(true);
    await shot('gifts');
    await freeze(false);
    gifts = true;
    // The two exits open on a gift choice and blood; the hero comes up to the left one, its name shows.
    await rig(['gift', 'sang']);
    await page.keyboard.press('1');
    await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.phase === 'exit' && s.time.now > s.gateUpAt + 300; }, null, { timeout: 8000 });
    await unrig();
    await page.evaluate(() => { const s = window.game.scene.getScene('room'), g = s.room.exits[0]; s.hero.body.reset(g.x + 10, g.y + 34); });
    await page.waitForTimeout(500); // the camera settles on the top of the room, the name fades in
    await freeze(true);
    await shot('doors-hall', { x: 0, y: 0, width: 1920, height: 640 });
    await freeze(false);
    gate = true;
  }
}

// Every kind of exit, taken once: blood out of room 1, then an upgrade, a pact, a gift choice. In each next room its
// reward rises on the medallion (caught there), is taken (the first card), and the exits open on the next pair.
{
  const route = [['sang', ['upgrade', 'pacte']], ['upgrade', ['pacte', 'gift']], ['pacte', ['gift', 'sang']], ['gift', ['gift', 'sang']]];
  for (let i = 0; gate && i < route.length; i++) {
    const [kind, next] = route[i];
    if (!(await through(kind))) break;
    await page.waitForFunction(() => window.game.scene.getScene('room').phase === 'fight', null, { timeout: 8000 }).catch(() => {});
    const ok = await page.evaluate((kind) => { // the room cleared at once, its waves called off
      const s = window.game.scene.getScene('room');
      s.time.removeAllEvents();
      s.enemies.clear(true, true);
      s.invulnUntil = Infinity;
      s.health = 2;
      s.hud.health(2, s.maxHealth());
      s.wave = s.roomNo * 3;
      s.roomCleared();
      return s.reward === kind;
    }, kind);
    if (!ok || !(await page.waitForFunction(() => window.game.scene.getScene('room').pickup?.ready, null, { timeout: 8000 }).then(() => true, () => false))) break;
    const m = await page.evaluate(() => { const s = window.game.scene.getScene('room'), m = s.room.medallion; s.hero.body.reset(m.x + 34, m.y - 6); return m; });
    await snap();
    await page.waitForTimeout(700); // the camera's view settles (slow headless frames)
    await freeze(true);
    await shot(`medal-${kind}`, await clip(m.x, m.y - 12, 400, 260));
    await freeze(false);
    await rig(next);
    await page.evaluate(() => { const s = window.game.scene.getScene('room'), m = s.room.medallion; s.hero.body.reset(m.x, m.y - 8); });
    if (kind !== 'sang') {
      await page.waitForFunction(() => window.game.scene.getScene('room').cards, null, { timeout: 5000 });
      // The first card, pressed until it is taken: a press before the cards are ready picks nothing.
      for (let k = 0; k < 8 && (await page.evaluate(() => window.game.scene.getScene('room').phase === 'choose')); k++) {
        await page.keyboard.press('1');
        await page.waitForTimeout(500);
      }
    }
    if (!(await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.phase === 'exit' && s.time.now > s.gateUpAt + 300; }, null, { timeout: 8000 }).then(() => true, () => false))) {
      console.log(`exit of a ${kind} room not reached:`, await page.evaluate(() => { const s = window.game.scene.getScene('room'); return JSON.stringify({ phase: s.phase, cards: !!s.cards, offer: s.offer, now: s.time.now, gate: s.gateUpAt, reward: s.reward }); }));
      break;
    }
    await unrig();
    medals.push(await page.evaluate((kind) => { const s = window.game.scene.getScene('room'); return `${kind} in room ${s.roomNo} (${s.layout}, ${s.health} blood, ${s.gifts.length} gifts; exits ${s.doors.join('/')})`; }, kind));
  }
}

// The training room (key T): its panel calls enemies in, freezes them and hands out gifts.
let training = false;
{
  // Not while a room is fading out to the next (its restart would swallow the key).
  await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.sys.isActive() && s.hero?.body && s.phase !== 'leave'; }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.keyboard.press('t');
  if (await page.waitForSelector('#training', { timeout: 5000 }).catch(() => null)) {
    for (const s of ['ghoul', 'weak', 'lantern']) await page.click(`#training [data-spawn="${s}"]`);
    await page.click('#training [data-opt="passive"]');
    for (const g of ['nuee', 'eclats', 'perce']) await page.click(`#training [data-gift="${g}"]`);
    training = await page.waitForFunction(() => { // past the spawn telegraphs (slower in game time when frames are slow)
      const s = window.game.scene.getScene('room');
      return s.training && s.gifts.includes('nuee') && s.enemies.getChildren().filter((e) => e.body?.enable).length === 2 && s.lanterns.length === 1;
    }, null, { timeout: 20000 }).then(() => true, () => false); // slow, headless: the panel's clicks and the telegraphs take seconds
    await freeze(true);
    await shot('training');
    await freeze(false);
  }
}

// Le Tir, in the training room (its dummies hold still), with Éclats pestilents and Éclats rongeurs: the hero flicks a
// shard at a ghoul on his row, caught mid-throw with the plagued shard in flight; then it must land, infect the ghoul
// and fly on through it into the weakened crossbowman behind.
let tir = null;
if (training) {
  const p = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const live = s.enemies.getChildren().filter((e) => e.body?.enable);
    const g = live.find((e) => e.getData('kind') !== 'crossbow'), w = live.find((e) => e.getData('kind') === 'crossbow');
    if (!g || !w) return null;
    s.hero.body.reset(170, 160); // across the medallion, out of every lantern's light
    g.body.reset(236, 160);
    w.body.reset(290, 160); // feet in line with the ghoul's: both 10 px below the sprite
    return { x: 203, y: 156, hp: g.getData('hp'), whp: w.getData('hp') };
  });
  await snap();
  if (p) {
    await page.waitForTimeout(100); // a physics step puts the bodies back under their sprites
    await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.shoot(0); s.shotUntil = Infinity; }); // held mid-throw
    await page.waitForFunction(() => { const s = window.game.scene.getScene('room'), b = s.shards.getChildren()[0]; return !b || b.x > s.hero.x + 28; });
    await freeze(true);
    const flying = await page.evaluate(() => window.game.scene.getScene('room').shards.countActive() > 0);
    if (flying) await shot('tir', await clip(p.x, p.y, 400, 200));
    await page.evaluate(() => (window.game.scene.getScene('room').shotUntil = 0));
    await freeze(false);
    await page.waitForTimeout(700);
    const [g, w] = await page.evaluate(() => ['ghoul', 'crossbow'].map((k) => {
      const e = window.game.scene.getScene('room').enemies.getChildren().find((e) => e.body?.enable && (e.getData('kind') ?? 'ghoul') === k);
      return e && { hp: e.getData('hp'), plagueAt: e.getData('plagueAt') };
    }));
    tir = flying && g?.hp < p.hp && g.plagueAt > 0 && w?.hp < p.whp && `ghoul ${p.hp} -> ${g.hp} hp, plagued; pierced into the crossbowman ${p.whp} -> ${w.hp} hp`;
  }
}


// Le Glyphe, in the training room (dummies stay put): two ghouls called in and set side by side, the hero beside them
// casts it at them with E, the pointer on the floor between them; caught once both are bound and the snap is over.
let glyph = false;
if (training) {
  await page.click('#training [data-act="clear"]');
  for (let i = 0; i < 2; i++) await page.click('#training [data-spawn="ghoul"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable).length === 2, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const [a, b] = s.enemies.getChildren().filter((e) => e.body?.enable);
    a?.body.reset(312, 190); // sprite centres: feet 10 px lower
    b?.body.reset(335, 202);
    s.hero.body.reset(275, 201);
  });
  await snap();
  await page.waitForTimeout(300); // the camera's view is updated on its next frame (slow, headless, in the dark rooms)
  const to = await screen(322, 206);
  await page.mouse.move(to.x, to.y);
  await page.waitForTimeout(400); // the pointer is read on Phaser's next step (a slow one, headless, in the dark rooms)
  await page.keyboard.press('e');
  glyph = await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.glyph?.chains.size === 2 && s.time.now - s.glyph.caughtAt > 300; }, null, { timeout: 15000 })
    .then(() => true, () => false);
  await freeze(true);
  await shot('glyph', await clip(300, 195, 480, 320));
  await freeze(false);
}

// La Nuée, in the training room (dummies stay put): two ghouls side by side, the hero turned into the swarm from the
// panel runs through them; caught mid-run, once it has bitten them.
let swarm = null;
if (training) {
  await page.click('#training [data-act="clear"]');
  for (let i = 0; i < 2; i++) await page.click('#training [data-spawn="ghoul"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable).length === 2, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const [a, b] = s.enemies.getChildren().filter((e) => e.body?.enable);
    a?.body.reset(312, 201); // where the glyph was, on its feet line
    b?.body.reset(334, 201);
    s.hero.body.reset(268, 196);
    s.glyph?.end();
  });
  await snap();
  await page.waitForTimeout(1500); // the glyph crumbled away
  await page.click('#training [data-act="swarm"]');
  await page.keyboard.down('d');
  // Caught as it reaches the first ghoul; then it must bite them both on its way through.
  swarm = await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.swarmFx && s.hero.x > 284; }, null, { timeout: 8000 })
    .then(() => true, () => false);
  await freeze(true);
  const at = await page.evaluate(() => { const s = window.game.scene.getScene('room'); return { x: s.hero.x, y: s.hero.y }; });
  await shot('swarm', await clip(at.x + 20, at.y, 720, 400));
  await freeze(false);
  const bitten = await page.waitForFunction(() => window.game.scene.getScene('room').gnawAt.size === 2, null, { timeout: 8000 }).then(() => true, () => false);
  await page.keyboard.up('d');
  swarm = swarm && bitten && 'both ghouls bitten';
}

// Every room layout whole and empty: as a run's room 1, its first wave called off. The camera is moved up the room a
// screen at a time, from the stairs to the gate, and the screens are stitched together.
const layouts = [];
for (const id of ['hall', 'nave', 'ossuary', 'chapel', 'cloister']) {
  await page.evaluate((layout) => window.game.scene.getScene('room').scene.restart({ layout }), id);
  await page.waitForFunction((id) => { const s = window.game.scene.getScene('room'); return s.layout === id && !s.training && s.sys.isActive(); }, id); // active: a baked room's images loaded
  await page.evaluate(() => { // no wave: the room empty (a slow first build's long frame may already have called it)
    const s = window.game.scene.getScene('room');
    s.time.removeAllEvents();
    s.enemies.clear(true, true);
  });
  await page.waitForTimeout(400);
  if (!(await page.evaluate((id) => window.game.scene.getScene('room').layout === id && !document.querySelector('#training'), id))) continue;
  const h = await page.evaluate(() => { // the HUD's camera and the vignette framing the screen would show at every seam
    const s = window.game.scene.getScene('room');
    s.cameras.cameras.filter((c) => c !== s.cameras.main && c.name !== 'dark-over').forEach((c) => c.setVisible(false));
    s.children.list.find((o) => o.texture?.key === 'room-vignette')?.setVisible(false);
    const f = s.cameras.main.filters.internal.list[0]; // a room in the dark: its light's own vignette
    if (f?.look) f.look = { ...f.look, vig: [1, 0, f.look.vig[2], f.look.vig[3]] };
    return s.room.height;
  });
  const parts = [];
  for (let y = h - 270; ; y = Math.max(0, y - 270)) {
    await page.evaluate((y) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.setScroll((c.worldView.width - c.width) / 2, y + (c.worldView.height - c.height) / 2); }, y); // zoomed or not: the room point (0, y) at the top left
    await page.waitForTimeout(100);
    await freeze(true);
    parts.push({ y, png: (await page.screenshot()).toString('base64') });
    await freeze(false);
    if (y === 0) break;
  }
  const png = await page.evaluate(async ({ parts, h, X }) => {
    const c = document.createElement('canvas');
    c.width = 480 * X;
    c.height = h * X;
    for (const p of parts) {
      const im = new Image();
      im.src = `data:image/png;base64,${p.png}`;
      await im.decode();
      c.getContext('2d').drawImage(im, 0, p.y * X);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { parts, h, X });
  await writeFile(`${out}/rooms-${id}.png`, Buffer.from(png, 'base64'));
  layouts.push(id);
}

// The Eternal Dawn over the cloister: the hero stands in it, 1.8 s into its 2.5 s grace.
let dawn = false;
if (layouts.at(-1) === 'cloister') {
  const at = { x: 330, y: 470 }; // the graves' garden, in the light
  if (await page.evaluate(({ x, y }) => {
    const s = window.game.scene.getScene('room');
    s.hero.body.reset(x, y);
    s.cameras.main.stopFollow(); s.cameras.main.centerOn(x, y);
    s.litMs = 0;
    return s.room.holy(x, y + 8);
  }, at)) {
    await page.waitForFunction(() => window.game.scene.getScene('room').litMs > 1800);
    await freeze(true);
    await shot('dawn', await clip(at.x, at.y - 6, 240, 200));
    await freeze(false);
    dawn = true;
  }
}

// The cloister's two exits open (the church's doors), on an upgrade and a pact, the hero in the north walk's shade.
let cloister = false;
if (dawn) {
  await rig(['upgrade', 'pacte']);
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    s.health = 99; // out of the Dawn's reach in the shade, but the burns that landed meanwhile
    s.hero.body.reset(s.room.exits[1].x - 12, 84);
    s.cameras.main.startFollow(s.hero);
    s.openGate();
  });
  await snap();
  cloister = await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.time.now > s.gateUpAt + 300; }, null, { timeout: 8000 }).then(() => true, () => false);
  await unrig();
  await page.waitForTimeout(500);
  await freeze(true);
  await shot('doors-cloister', { x: 0, y: 0, width: 1920, height: 640 });
  await freeze(false);
}

console.log(`captured: ${captured ? 'yes' : 'NO (combat frame missing)'}; light: ${lit ? 'yes' : 'NO'}; crossbow: ${bow ? 'yes' : 'NO'}; bite: ${bit || 'NO'}; gifts: ${gifts ? 'yes' : 'NO'}; doors: ${gate ? 'yes' : 'NO'}; exits taken: ${medals.join(', ') || 'NO'}; training: ${training ? 'yes' : 'NO'}; tir: ${tir || 'NO'}; glyph: ${glyph ? 'yes' : 'NO'}; swarm: ${swarm || 'NO'}; rooms: ${layouts.join(', ') || 'NO'}; dawn: ${dawn ? 'yes' : 'NO'}; cloister doors: ${cloister ? 'yes' : 'NO'}; room: ${JSON.stringify(await room())}; state: ${JSON.stringify(await state())}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || !captured || !bow || !bit || !gifts || !gate || medals.length < 4 || !cloister || !training || !tir || !glyph || !swarm || layouts.length < 3 || !dawn ? 1 : 0);
