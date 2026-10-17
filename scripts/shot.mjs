// Plays a scripted fight in headless Chromium and saves comparable screenshots (1920x1080 = native x4).
// Usage: npm run shot [-- --out=shots --port=5199]
// A bot plays room 1 of the horde to the gate (see below), then the rest is staged. Writes room.png, horde.png,
// combat.png, level.png and gifts.png (full frames: the room, the biggest horde, a finisher in the press, the first
// level-up cards, the room's end and the three gift cards open, TIR, GLYPHE and TALENT, the second hovered) plus crops:
// hero.png (running diagonally), enemy.png (a ghoul winding up its swipe), fx.png, gate.png (the portcullis up),
// hud.png (3/5 health, dash spent, 5 gifts, 4 upgrades, blood bar half full), light.png (a lit lantern, the hero at the
// edge of its holy light), crossbow.png (a crossbowman aiming), weak.png (a weakened crossbowman, its heartbeat drop on
// the beat), bite.png (the hero latched onto it, mid-drain), training.png (full frame: the training room, its panel,
// enemies called in from it), tir.png (the hero mid-throw, a plagued shard of blood in flight toward a ghoul) and
// glyph.png (the glyph binding two ghouls, the hero beside it), then rooms-hall.png, rooms-nave.png, rooms-ossuary.png,
// rooms-chapel.png and rooms-cloister.png (each room layout whole, empty, from the gate down to the stairs: they are
// taller than the screen, so a screen at a time stitched together, without the HUD and the vignette) and dawn.png (the
// hero standing in the cloister's Eternal Dawn, the danger building before the first burn: smoke, glow, gauge).
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


await mkdir(out, { recursive: true });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
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

// The hero's own attacks, held for staged captures: each is then called on purpose.
const still = (on) => page.evaluate((on) => { const s = window.game.scene.getScene('room'); s.shotReadyAt = s.slashReadyAt = s.glyphReadyAt = on ? Infinity : 0; }, on);

// The first enemy to reach the idle hero (his claws held), winding up its attack: its most menacing, telegraphed pose,
// before the melee clutters the frame.
{
  await still(true);
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
  await still(false);
}

// The bot plays room 1 of the horde with the keyboard alone, as a player would: a brawler that keeps the nearest ghoul
// in claw reach without letting a ring close round it, mists out when four press in or sideways out of a bolt about
// to fly at it, hunts the crossbowman when the ghouls leave it room, keeps out of lanterns' light,
// gathers the blood when nothing is near, picks a level-up card at random each time the bar fills; at the end it walks
// the walk grid to the gift, takes the first card, and walks out through the gate into room 2. Captured on the way:
// horde.png (full frame, the biggest horde on the screen, from 60 s in), combat.png and fx.png (a finisher landing in
// the press), level.png (the first level-up cards), gifts.png, gate.png. The frame rate and the game's own time per
// frame (logic, render) are measured with a full horde.
await page.evaluate(() => {
  const s = window.game.scene.getScene('room'), ev = window.game.events, p = (window.perf = { step: 0, render: 0, n: 0, fps: [] });
  let a = 0, r = 0;
  const full = () => s.enemies.getChildren().filter((e) => e.body?.enable).length >= 40 && !s.cards;
  ev.on('prestep', () => (a = performance.now()));
  ev.on('poststep', () => { if (full()) { p.step += performance.now() - a; p.n++; } });
  ev.on('prerender', () => (r = performance.now()));
  ev.on('postrender', () => { if (full()) p.render += performance.now() - r; });
  // Where the bot wants to go: [dx, dy], whether to mist, and what it sees.
  window.botStep = () => {
    const s = window.game.scene.getScene('room'), h = s.hero.body.center, b = s.room.bounds;
    const live = s.enemies.getChildren().filter((e) => e.body?.enable).map((e) => e.body.center);
    const dist = (p) => Math.hypot(p.x - h.x, p.y - h.y);
    const seen = { phase: s.phase, room: s.roomNo, health: s.health, level: s.level, dead: s.dead, cards: !!s.cards, levelCards: s.offerUps.length > 0,
      enemies: live.length, near: live.filter((p) => dist(p) < 80).length, fight: s.fightMs, fin: s.combo === 2 && s.time.now < s.slashUntil, pickup: !!s.pickup?.ready };
    let dx = 0, dy = 0;
    const goal = s.phase === 'gift' && s.pickup?.ready ? s.room.medallion : s.phase === 'exit' ? { x: s.room.gate.x, y: b.y + 2 } : null;
    if (goal) { // down the walk grid's steps to the goal
      const steps = s.stepsTo(goal), cols = s.navCols, c = s.cellOf(h);
      let best = c;
      for (const n of [c - cols - 1, c - cols, c - cols + 1, c - 1, c + 1, c + cols - 1, c + cols, c + cols + 1])
        if (Math.abs((n % cols) - (c % cols)) <= 1 && steps[n] < steps[best]) best = n;
      const to = best === c ? goal : { x: b.x + (best % cols) * 8 + 4, y: b.y + Math.floor(best / cols) * 8 + 4 };
      return { ...seen, dx: to.x - h.x, dy: to.y - h.y, mist: false };
    }
    const near = [...live].sort((p, q) => dist(p) - dist(q));
    for (const e of live) {
      const d = dist(e) || 1;
      if (d < 26) { dx += ((h.x - e.x) / d) * (26 - d) * 12; dy += ((h.y - e.y) / d) * (26 - d) * 12; }
    }
    const bows = s.enemies.getChildren().filter((e) => e.body?.enable && e.getData('kind') === 'crossbow');
    const shot = bows.find((e) => e.getData('state') === 'aim' && e.getData('fireAt') - s.time.now < 220);
    if (shot) { // sideways out of its line, in the mist
      const a = e => e.getData('facing'), side = Math.sign(Math.sin(a(shot)) * (h.x - shot.x) - Math.cos(a(shot)) * (h.y - shot.y)) || 1;
      return { ...seen, dx: -Math.sin(a(shot)) * side, dy: Math.cos(a(shot)) * side, mist: true };
    }
    const prey = bows.find((e) => dist(e.body.center) < 160);
    if (prey && live.filter((e) => dist(e) < 40).length < 3) { dx += (prey.x - h.x) * 3; dy += (prey.y - h.y) * 3; }
    else if (near[0] && dist(near[0]) > 34 && dist(near[0]) < 140) { dx += (near[0].x - h.x) * 2; dy += (near[0].y - h.y) * 2; }
    for (const l of s.lanterns) {
      const ex = h.x - l.x, ey = (h.y - l.y) / 0.72, d = Math.hypot(ex, ey) || 1;
      if (d < 60) { dx += (ex / d) * 400; dy += (ey / d) * 400; }
    }
    const drops = s.drops.filter((d) => !d.pulled).map((d) => d.img);
    if ((!near[0] || dist(near[0]) > 50) && drops.length) { const d = drops.reduce((a, c) => (dist(a) < dist(c) ? a : c)); dx += (d.x - h.x) * 8; dy += (d.y - h.y) * 8; }
    dx += ((b.x + b.right) / 2 - h.x) * 0.5; // off the walls
    dy += ((b.y + b.bottom) / 2 - h.y) * 0.25;
    return { ...seen, dx: dx - dy * 0.25, dy: dy + dx * 0.25, mist: live.filter((e) => dist(e) < 24).length >= 4 };
  };
});
const held = new Set();
const steer = async (want) => {
  for (const k of held) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
};
const horde = { deaths: 0, levels: 0, cards: 0, gate: false, biggest: 0, fps: 0, captured: [], peak: 0, health: [], at: [] };
let captured = false, gifts = false, gate = false, lastLevel = 1;
{
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const r = await page.evaluate(() => window.botStep());
    if (r.room > 1) { gate = horde.gate = true; break; }
    if (r.dead) { horde.deaths++; await steer([]); await page.waitForFunction(() => !window.game.scene.getScene('room').dead, null, { timeout: 5000 }).catch(() => {}); lastLevel = 1; continue; }
    horde.peak = Math.max(horde.peak, r.enemies);
    if (r.health !== horde.health.at(-1)) horde.health.push(r.health);
    if (r.level > lastLevel) { horde.levels += r.level - lastLevel; lastLevel = r.level; horde.at.push(Math.round(r.fight / 1000)); }
    if (r.cards) {
      await steer([]);
      await page.waitForTimeout(600); // slid in
      if (r.levelCards) {
        if (!horde.captured.includes('level')) { await page.mouse.move(240 * X, 140 * X); await page.waitForTimeout(100); await shot('level'); horde.captured.push('level'); }
        await page.keyboard.press(String(1 + Math.floor(Math.random() * 3)));
        horde.cards++;
      } else {
        await page.mouse.move(240 * X, 140 * X); // hover the middle card
        await page.waitForTimeout(100);
        await freeze(true);
        await shot('gifts');
        await freeze(false);
        gifts = true;
        await page.keyboard.press('1');
        await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.phase === 'exit' && s.time.now > s.gateUpAt + 100; }, null, { timeout: 8000 });
        await freeze(true);
        await shot('gate', await clip(240, 38, 400, 300));
        await freeze(false);
      }
      await page.waitForFunction(() => !window.game.scene.getScene('room').cards, null, { timeout: 3000 }).catch(() => {});
      continue;
    }
    // Every gift but three held, so the draw is always the same: Éclats pestilents (TIR), Glyphe du nid (GLYPHE),
    // Éclats rongeurs (TALENT).
    if (r.pickup) await page.evaluate(() => { const s = window.game.scene.getScene('room'); if (s.gifts.length < 7) { s.gifts = ['griffes', 'nuee', 'rongeur', 'fuite', 'morsure', 'survivant', 'contagion']; s.hud.gifts(s.gifts); } });
    if (r.fight > 40000 && r.enemies > horde.biggest && r.near >= 12 && r.enemies >= 30) {
      horde.biggest = r.enemies;
      horde.fps = await page.evaluate(() => window.game.loop.actualFps);
      await freeze(true);
      await shot('horde');
      await freeze(false);
    }
    if (!captured && r.fin && r.near >= 10 && r.fight > 30000) {
      await freeze(true);
      const s = await state();
      await shot('combat');
      await shot('fx', await clip(s.hx, s.hy, 480, 270));
      await freeze(false);
      captured = true;
    }
    const n = Math.hypot(r.dx, r.dy) || 1, want = [];
    if (r.dx / n > 0.38) want.push('d'); else if (r.dx / n < -0.38) want.push('a');
    if (r.dy / n > 0.38) want.push('s'); else if (r.dy / n < -0.38) want.push('w');
    if (r.mist) want.push('Space');
    await steer(want);
    await page.waitForTimeout(50);
  }
  await steer([]);
  const p = await page.evaluate(() => window.perf);
  horde.step = p.n ? (p.step / p.n).toFixed(2) : '?';
  horde.render = p.n ? (p.render / p.n).toFixed(2) : '?';
}

// Room 2, its horde held back (no director) for the staged captures, the hero kept alive.
const calm = () => page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  s.fightFrom = Infinity;
  for (const e of s.enemies.getChildren().filter((e) => e.body?.enable)) s.kill(e);
  s.bolts.clear(true, true);
});
await page.waitForFunction(() => window.game.scene.getScene('room').phase === 'fight', null, { timeout: 8000 }).catch(() => {});
await calm();

// HUD in a representative mid-fight state: 3 of 5 health, dash just spent, five gifts and four upgrades shown, the
// blood bar half full.
{
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    s.health = 3; s.hud.health(3, 5); s.hud.gifts(['rongeur', 'nid', 'griffes', 'eclats', 'nuee']);
    s.hud.ups({ reach: 2, shards: 1, mist: 3, magnet: 1 }); s.hud.level(4, 30, 60);
  });
  await page.waitForTimeout(900); // let the lost-health animation settle
  await page.keyboard.press('Space', { delay: 100 }); // held across a couple of frames: headless frames are slow
  await page.waitForTimeout(100);
  await freeze(true);
  await shot('hud', { x: 0, y: 0, width: 480, height: 224 });
  await freeze(false);
}
await still(true);

// A sacred lantern, lit, with the hero just inside the edge of its holy light, smoking before the first burn lands.
let lit = false;
{
  const l = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    for (const l of [...s.lanterns]) s.hitLantern(l, 0, Infinity);
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
    await page.evaluate(() => { const s = window.game.scene.getScene('room'); for (const l of [...s.lanterns]) s.hitLantern(l, 0, Infinity); });
  }
}

// A crossbowman of the Order mid-aim, its dotted aim line out but not yet locked.
let bow = null;
{
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    s.invulnUntil = Infinity;
    s.hero.body.reset(240, 300);
    s.spawn({ x: 330, y: 230 }, 'crossbow');
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

// La Morsure. The crossbowman left alone with one blood (weakened) and the hero kept out of reach: its hunch, bloodied
// tabard and beating drop. Then the hero walks up to it and bites it on his own, caught mid-drain.
let bit = null;
{
  const p = await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const prey = s.enemies.getChildren().find((e) => e.body?.enable && e.getData('kind') === 'crossbow');
    if (s.dead || !prey) return null;
    s.bolts.clear(true, true);
    s.invulnUntil = 0; // nothing left can hurt him, and an invulnerable hero blinks
    prey.body.reset(256, 226); // below the medallion
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
    const hp = await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.health = 3; s.hud.health(3, 5); return s.health; });
    await page.keyboard.down('d'); // into its reach: the bite is automatic
    await page.waitForFunction(() => !!window.game.scene.getScene('room').prey, null, { timeout: 3000 }).catch(() => {});
    await page.keyboard.up('d');
    await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.time.now - s.biteAt > 300; });
    await freeze(true);
    const latched = await page.evaluate(() => !!window.game.scene.getScene('room').prey);
    if (latched) await shot('bite', await clip(p.x - 6, p.y - 8, 240, 200));
    await freeze(false);
    await page.waitForFunction(() => !window.game.scene.getScene('room').prey, null, { timeout: 3000 }).catch(() => {});
    bit = latched && `${hp} -> ${await page.evaluate(() => window.game.scene.getScene('room').health)} blood`;
  }
}
const room = () => page.evaluate(() => { const s = window.game.scene.getScene('room'); return { phase: s.phase, no: s.roomNo, level: s.level, ups: s.ups, gifts: s.gifts }; });

// The training room (key T): its panel calls enemies in, freezes them and hands out gifts.
let training = false;
{
  await page.keyboard.press('t');
  if (await page.waitForSelector('#training', { timeout: 5000 }).catch(() => null)) {
    await still(true); // the dummies are for the captures below, not for his automatic attacks
    for (const s of ['ghoul', 'weak', 'lantern']) await page.click(`#training [data-spawn="${s}"]`);
    await page.click('#training [data-opt="passive"]');
    for (const g of ['nuee', 'eclats', 'perce']) await page.click(`#training [data-gift="${g}"]`);
    await page.waitForTimeout(1200); // past the spawn telegraphs
    training = await page.evaluate(() => {
      const s = window.game.scene.getScene('room');
      return s.training && s.gifts.includes('nuee') && s.enemies.getChildren().filter((e) => e.body?.enable).length === 2 && s.lanterns.length === 1;
    });
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
    w.body.reset(290, 160);
    w.body.reset(290, 160 + g.body.center.y - w.body.center.y); // feet in line with the ghoul's
    return { x: 203, y: 156, hp: g.getData('hp'), whp: w.getData('hp') };
  });
  await snap();
  if (p) {
    await page.waitForTimeout(100); // a physics step puts the bodies back under their sprites
    await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.shotReadyAt = 0; s.shoot(0); s.shotReadyAt = s.shotUntil = Infinity; }); // held mid-throw
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
// casts it at the floor between them; caught once both are bound and the snap is over.
let glyph = false;
if (training) {
  await page.click('#training [data-act="clear"]');
  for (let i = 0; i < 2; i++) await page.click('#training [data-spawn="ghoul"]');
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().filter((e) => e.body?.enable).length === 2, null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => {
    const s = window.game.scene.getScene('room');
    const [a, b] = s.enemies.getChildren().filter((e) => e.body?.enable);
    a?.body.reset(312, 190); // sprite centres: feet 10 px lower
    b?.body.reset(335, 202);
    s.hero.body.reset(275, 201);
  });
  await snap();
  await page.waitForTimeout(50);
  await page.evaluate(() => { const s = window.game.scene.getScene('room'); s.glyphReadyAt = 0; s.cast({ x: 322, y: 206 }); });
  glyph = await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.glyph?.chains.size === 2 && s.time.now - s.glyph.caughtAt > 300; }, null, { timeout: 5000 })
    .then(() => true, () => false);
  await freeze(true);
  await shot('glyph', await clip(300, 195, 480, 320));
  await freeze(false);
}

// Every room layout whole and empty: as a run's room 1, its first wave called off. The camera is moved up the room a
// screen at a time, from the stairs to the gate, and the screens are stitched together.
const layouts = [];
for (const id of ['hall', 'nave', 'ossuary', 'chapel', 'cloister']) {
  await page.evaluate((layout) => window.game.scene.getScene('room').scene.restart({ layout }), id);
  await page.waitForFunction((id) => { const s = window.game.scene.getScene('room'); return s.layout === id && !s.training; }, id);
  await page.evaluate(() => { // no wave: the room empty (a slow first build's long frame may already have called it)
    const s = window.game.scene.getScene('room');
    s.time.removeAllEvents();
    s.fightFrom = Infinity; // no horde
    s.enemies.clear(true, true);
  });
  await page.waitForTimeout(400);
  if (!(await page.evaluate((id) => window.game.scene.getScene('room').layout === id && !document.querySelector('#training'), id))) continue;
  const h = await page.evaluate(() => { // the HUD's camera and the vignette framing the screen would show at every seam
    const s = window.game.scene.getScene('room');
    s.cameras.cameras.slice(1).forEach((c) => c.setVisible(false));
    s.children.list.find((o) => o.texture?.key === 'room-vignette')?.setVisible(false);
    return s.room.height;
  });
  const parts = [];
  for (let y = h - 270; ; y = Math.max(0, y - 270)) {
    await page.evaluate((y) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.setScroll(0, y); }, y);
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
    s.cameras.main.setScroll(0, y - 135);
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

const played = !horde.deaths && horde.levels >= 2 && horde.cards >= 2 && horde.gate && horde.biggest > 0 && horde.captured.includes('level');
console.log(`horde: ${played ? 'ok' : 'FAILED'}: deaths ${horde.deaths} (health ${horde.health.join(' ')}), ${horde.levels} levels gained (at ${horde.at.join(', ')} s), ${horde.cards} cards picked, gate ${horde.gate ? 'reached' : 'NOT reached'}; `
  + `most alive ${horde.peak}, biggest horde captured ${horde.biggest} enemies at ${Math.round(horde.fps)} fps; with 40+ enemies: ${horde.step} ms of logic and ${horde.render} ms of render calls per frame`);
console.log(`captured: ${captured ? 'yes' : 'NO (combat frame missing)'}; light: ${lit ? 'yes' : 'NO'}; crossbow: ${bow ? 'yes' : 'NO'}; bite: ${bit || 'NO'}; gifts: ${gifts ? 'yes' : 'NO'}; gate: ${gate ? 'yes' : 'NO'}; training: ${training ? 'yes' : 'NO'}; tir: ${tir || 'NO'}; glyph: ${glyph ? 'yes' : 'NO'}; rooms: ${layouts.join(', ') || 'NO'}; dawn: ${dawn ? 'yes' : 'NO'}; room: ${JSON.stringify(await room())}; state: ${JSON.stringify(await state())}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length || !played || !captured || !bow || !bit || !gifts || !training || !tir || !glyph || layouts.length < 3 || !dawn ? 1 : 0);
