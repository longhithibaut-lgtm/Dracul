// The refuge as it answers progress (src/haven.ts, src/haven-life.ts) in headless Chromium on a 1920x1080 PC screen,
// in four states set on the real save with the training panel's « Mode test » shortcuts (src/cheats.ts) and an
// expedition log written to match: a fresh save; mid-way (blood banked, the bite and a few ranks, items in the chest,
// some deaths); Vesna freed (la Matrice dead, her powers, more blood); everything bought (every item, a full basin, many
// deaths). In each: the great hall round the basin (near le Rongé, who speaks), the crypt (the marks of his deaths), the
// wardrobe, the trophies; mid-way also the dummy struck (a combo) and the map table open; Vesna's shop once she is free.
// Writes <out>/<state>-<what>.png. Usage: node tools/art/haven.shots.mjs [--out=shots/haven --port=5231 --only=<state>]
// (exit code 1 on a page error).
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/haven');
const port = Number(arg('port', 5231)), only = arg('only'); // --only=mid: that state alone

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const ready = () => page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body && window.game.scene.isActive('room') && window.game.scene.getScene('room').layout === 'refuge');
let state = '';
const shot = async (what) => {
  await run(() => window.game.loop.sleep());
  await page.screenshot({ path: `${out}/${state}-${what}.png` });
  await run(() => window.game.loop.wake());
};
// The hero at room point (hx, hy), the camera centred on (x, y).
const frame = async (hx, hy, x, y, ms = 400) => {
  await run(([hx, hy, x, y]) => {
    const s = window.game.scene.getScene('room');
    s.hero.body.reset(hx, hy);
    s.cameras.main.stopFollow().centerOn(x, y);
  }, [hx, hy, x, y]);
  await page.waitForTimeout(ms);
};

/** The save set by the « Mode test » shortcuts, a log of `deaths` and `returns`, and the refuge rebuilt from it. */
const set = async (name, how) => {
  state = name;
  await run(async (how) => {
    const Save = await import('/src/save.ts'), C = await import('/src/cheats.ts'), Items = await import('/src/items.ts');
    Save.reset();
    const s = Save.data;
    s.banked = how.banked;
    if (how.bite) C.FLAGS.bite[1](s, true);
    if (how.life) C.rank(s, 'life', how.life);
    if (how.bag) C.rank(s, 'bag', how.bag);
    if (how.all) { C.ronge(s); C.powers(s); C.chest(s, 2); }
    if (how.items) C.chest(s, 1, how.items.map((i) => Items.ITEM_IDS[i]));
    if (how.boss) C.FLAGS.nourrice[1](s, true);
    if (how.vesna) C.FLAGS.vesna[1](s, true);
    for (const id of how.powers ?? []) s.powers.bought.push(id);
    Save.store();
    const e = (end) => ({ end, deepest: 1, blood: 0, life: 0, s: 300, loosed: 0, met: 0, at: new Date().toISOString() });
    localStorage.setItem('dracul.log', JSON.stringify([...Array(how.deaths).fill(0).map(() => e('mort')), ...Array(how.returns).fill(0).map(() => e('retour'))]));
    window.game.scene.getScene('room').scene.restart({});
  }, how);
  await page.waitForTimeout(500);
  await ready();
  await page.waitForTimeout(1500); // its fade in
};

// The map table, then its map (the necropolis seen whole: as if walked through, on the real save).
const table = async () => {
  await frame(1035, 640, 1035, 620);
  await shot('table');
  await run(async () => { (await import('/src/map.ts')).revealAll('necropolis'); window.game.scene.getScene('room').openTable(0); });
  await page.waitForTimeout(300);
  await shot('table-map');
  await run(() => window.game.scene.getScene('room').closeMap());
};
const tour = async (more) => {
  await frame(905, 668, 860, 640, 3400); // by le Rongé: the basin, a brazier; his line once in a while
  await shot('hall');
  await frame(874, 262, 870, 250);
  await shot('crypt');
  await frame(1150, 362, 1110, 330);
  await shot('wardrobe');
  await frame(612, 545, 660, 560);
  await shot('trophies');
  await more?.();
};

await page.goto(`http://localhost:${port}/?play`);
await ready();
if (!only || only === 'fresh') await set('fresh', { banked: 0, deaths: 0, returns: 0 }), await tour();
if (!only || only === 'mid') await set('mid', { banked: 900, bite: true, life: 2, bag: 1, items: [0, 3, 7, 12], deaths: 4, returns: 3 }), await tour(async () => {
  await frame(626, 786, 650, 740);
  for (const k of [0, 1, 2]) { // a combo on the dummy, then the blow's number
    await run(() => { const s = window.game.scene.getScene('room'); s.slashReadyAt = s.dashUntil = 0; s.slash(0); });
    await page.waitForTimeout(k < 2 ? 260 : 140);
  }
  await shot('dummy');
  await run(() => { window.game.scene.getScene('room').haven.lap = () => true; }); // le Rongé laps (as he does every 9 to 16 s), the hero away
  await frame(760, 700, 840, 640, 900);
  await shot('lap');
  await table();
});
if (!only || only === 'vesna') await set('vesna', { banked: 2400, bite: true, life: 3, bag: 2, items: [0, 3, 7, 12, 1, 9], boss: true, vesna: true, powers: ['griffes', 'eclats', 'swarm'], deaths: 9, returns: 7 }), await tour(async () => {
  await frame(1190, 580, 1180, 560, 3400);
  await shot('shop');
});
if (!only || only === 'full') await set('full', { banked: 7000, all: true, boss: true, vesna: true, deaths: 23, returns: 31 }), await tour();

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
