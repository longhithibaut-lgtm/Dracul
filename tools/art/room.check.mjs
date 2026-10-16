// Room layout check in headless Chromium, for every layout: on the walk grid, the hero start, every spawn point and the
// foot of the stairs are walkable (off pits and props) and reach the gate, hence each other; the hero can walk away
// from its start in every direction; and wherever it waits (behind props, past pits, in corners) every enemy reaches
// it instead of sticking on an obstacle or the brink of a pit.
// Usage: node tools/art/room.check.mjs [--port=5206] [--only=nave]   (exit code 1 on a failure or a page error)
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const port = Number(arg('port', 5206));
// Where the hero waits for the pack, per layout: behind props, in corners, across the pits.
const WAITS = {
  hall: [[240, 222], [96, 205], [392, 205], [92, 110], [388, 110], [56, 245], [424, 245], [240, 75]],
  nave: [[240, 222], [96, 176], [392, 170], [72, 100], [404, 100], [140, 240], [240, 75]],
  ossuary: [[72, 222], [72, 108], [420, 182], [312, 240], [200, 104], [150, 192], [240, 75]],
  chapel: [[240, 75], [140, 210], [340, 174], [56, 245], [424, 245], [140, 140], [420, 100]],
  // Three screens tall: the well's garden and the south walk, the graves and the first gallery, the yews and the north walk.
  cloister: [[24, 745], [456, 760], [180, 660], [312, 700], [108, 700], [360, 664], [24, 420], [312, 470], [120, 444],
    [456, 520], [240, 540], [240, 75], [24, 160], [456, 250], [312, 196], [240, 306]],
};
const only = arg('only', '');
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));

const state = () => page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  return { x: s.hero.x, y: s.hero.y, e: s.enemies.getChildren().filter((e) => e.body?.enable).map((e) => [e.x, e.y]) };
});
let failed = 0;

for (const layout of Object.keys(WAITS).filter((l) => !only || l === only)) {
  const restart = async (x, y) => {
    await page.evaluate((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
    await page.waitForTimeout(200);
    if (x !== undefined) await page.evaluate(([x, y]) => {
      const s = window.game.scene.getScene('room');
      s.hero.body.reset(x, y);
      s.health = 999; // the hero must survive the wait
      // The first wave rises again with him there (a tall room's, in the part he waits in): a slow first frame may have
      // let its timer beat this reset.
      s.time.removeAllEvents();
      s.enemies.clear(true, true);
      s.wave = 0;
      s.spawnWave();
    }, [x, y]);
  };
  console.log(`--- ${layout}`);

  await restart();
  const reach = await page.evaluate(() => {
    const s = window.game.scene.getScene('room'), r = s.room, steps = s.stepsTo({ x: r.gate.x, y: r.gate.y + 4 });
    const feet = (p, name) => ({ name, x: p.x, y: p.y + 8 }); // sprite position -> feet
    return [feet(r.heroStart, 'hero start'), ...r.spawns.map((p, i) => feet(p, `spawn ${i}`)), { name: 'stairs', x: r.stairs.x, y: r.bounds.bottom - 6 }]
      .map((p) => ({ ...p, open: s.navOpen[s.cellOf(p)], steps: steps[s.cellOf(p)] }));
  });
  for (const p of reach) {
    const ok = p.open && p.steps < Infinity;
    if (!ok) failed++;
    console.log(`${p.name} (${p.x},${p.y}): ${ok ? `${p.steps} cells to the gate` : p.open ? 'CUT OFF from the gate' : 'ON A PIT OR PROP'}`);
  }

  for (const k of ['a', 'd', 'w', 's']) {
    await restart();
    const a = await state();
    await page.keyboard.down(k);
    await page.waitForTimeout(600);
    await page.keyboard.up(k);
    const b = await state();
    const moved = Math.hypot(b.x - a.x, b.y - a.y);
    if (moved < 15) failed++;
    console.log(`walk ${k} from start: ${Math.round(moved)}px`);
  }

  // An enemy is stuck if it stays far from the hero and does not move between two late samples.
  for (const [x, y] of WAITS[layout]) {
    await restart(x, y);
    await page.waitForTimeout(11000);
    const a = await state();
    await page.waitForTimeout(1500);
    const b = await state();
    const stuck = b.e.filter(([ex, ey], i) => Math.hypot(ex - b.x, ey - b.y) > 48 && a.e[i] && Math.hypot(ex - a.e[i][0], ey - a.e[i][1]) < 3);
    if (stuck.length) failed++;
    console.log(`hero waiting at ${x},${y}: ${stuck.length ? `STUCK ${JSON.stringify(stuck.map((p) => p.map(Math.round)))}` : 'every enemy reached it'}`);
  }
}

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(failed || errors.length ? 1 : 0);
