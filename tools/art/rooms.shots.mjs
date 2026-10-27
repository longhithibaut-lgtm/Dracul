// The run rooms baked in the « grand pixel » style (tools/art/rooms.gen.mjs) in headless Chromium on a 1920x1080 PC
// screen. For each: the whole room, stitched a screen at a time from the stairs to the gate (the hero at his start, no
// foe, no vignette); then in play: its foes placed for its ring (world.ts), the hero walking up into them, the next
// part's, the top of the room by its open portcullises; in the cloister, the hero in the Dawn, the danger building
// until it burns him. Then the frame rate of each and the refuge's (light shader on). The
// expedition through them is scripts/shot.mjs's. Writes <out>/<room>-<what>.png.
// Usage: node tools/art/rooms.shots.mjs [--out=shots/rooms --port=5210 --only=hall,nave,ossuary,chapel,cloister]   (exit code 1 on a page error)
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/rooms');
const port = Number(arg('port', 5210));
const only = arg('only', 'hall,nave,ossuary,chapel,cloister').split(',');

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const shot = async (what) => {
  await run(() => window.game.loop.sleep());
  await page.screenshot({ path: `${out}/${what}.png` });
  await run(() => window.game.loop.wake());
};
const enter = async (layout) => {
  await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), layout);
  await page.waitForFunction((layout) => { const s = window.game.scene.getScene('room'); return s.layout === layout && s.hero?.body && s.sys.isActive(); }, layout);
  await page.waitForTimeout(600);
};
/** The hero put at (x, y), the camera centred on him (it follows him smoothly, too slowly for a capture). */
const put = (x, y) => run(([x, y]) => { const s = window.game.scene.getScene('room'); s.hero.body.reset(x, y); s.cameras.main.centerOn(x, y); }, [x, y]);
const fps = async () => {
  await page.waitForTimeout(800);
  return run(() => new Promise((done) => {
    let n = 0;
    const t0 = performance.now(), tick = () => (++n, performance.now() - t0 < 2500 ? requestAnimationFrame(tick) : done(Math.round((n * 1000) / (performance.now() - t0))));
    requestAnimationFrame(tick);
  }));
};

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body && window.game.scene.isActive('room'));
const rates = {};
for (const id of only) {
  // ---- whole, empty ----
  await enter(id);
  const h = await run(() => {
    const s = window.game.scene.getScene('room');
    s.time.removeAllEvents();
    s.enemies.clear(true, true);
    s.cameras.cameras.filter((c) => c !== s.cameras.main && c.name !== 'dark-over').forEach((c) => c.setVisible(false)); // the HUD
    const f = s.cameras.main.filters.internal.list[0];
    if (f?.look) f.look = { ...f.look, vig: [1, 0, f.look.vig[2], f.look.vig[3]] }; // no vignette at every seam
    return s.room.height;
  });
  await page.waitForTimeout(300); // a frame drawn without them
  const parts = [];
  for (let y = h - 270; ; y = Math.max(0, y - 270)) {
    await run((y) => { const c = window.game.scene.getScene('room').cameras.main; c.stopFollow(); c.setScroll((c.worldView.width - c.width) / 2, y + (c.worldView.height - c.height) / 2); }, y); // zoomed: the room point (0, y) at the top left
    await page.waitForTimeout(150);
    await run(() => window.game.loop.sleep());
    parts.push({ y, png: (await page.screenshot()).toString('base64') });
    await run(() => window.game.loop.wake());
    if (y === 0) break;
  }
  const png = await run(async ({ parts, h }) => {
    const c = document.createElement('canvas');
    c.width = 1920; c.height = h * 4;
    for (const p of parts) { const im = new Image(); im.src = `data:image/png;base64,${p.png}`; await im.decode(); c.getContext('2d').drawImage(im, 0, p.y * 4); }
    return c.toDataURL('image/png').split(',')[1];
  }, { parts, h });
  await writeFile(`${out}/${id}-whole.png`, Buffer.from(png, 'base64'));

  // ---- in play: its foes on their posts ----
  await enter(id);
  await page.waitForFunction(() => window.game.scene.getScene('room').enemies.getChildren().length > 0, null, { timeout: 8000 }).catch(() => errors.push(`${id}: no wave`));
  await page.waitForTimeout(1500);
  await run(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = Infinity; }); // he must outlive the captures
  await shot(`${id}-wave1`);
  for (const k of [0, 1, 2]) { // walking up through it, a frame every 200 ms
    if (k === 0) await page.keyboard.down('z');
    await page.waitForTimeout(200);
  }
  await shot(`${id}-walk`);
  await page.keyboard.up('z');
  const sections = await run(() => window.game.scene.getScene('room').room.sections);
  if (sections.length) { // up into the middle part: its foes in front of him
    await put(240, sections[0] - 20);
    await page.waitForTimeout(2200);
    await run(() => { const s = window.game.scene.getScene('room'); s.cameras.main.centerOn(s.hero.x, s.hero.y); });
    await shot(`${id}-wave2`);
  }
  if (id === 'cloister') { // the Dawn: standing in it, the danger building until it burns; then safe in the shade
    const sun = await run(() => {
      const s = window.game.scene.getScene('room');
      for (let y = 600; y < 740; y += 4) for (let x = 120; x < 360; x += 4) if (s.room.holy(x, y) && s.room.holy(x, y + 8) && !s.room.holy(x, y + 40)) return { x, y };
      return null;
    });
    if (!sun) errors.push('cloister: no sunlit floor near the well');
    else {
      await run(({ x, y }) => { const s = window.game.scene.getScene('room'); s.enemies.clear(true, true); s.time.removeAllEvents(); s.invulnUntil = 0; s.health = 99; s.litMs = 0; }, sun);
      await put(sun.x, sun.y - 8);
      await page.waitForFunction(() => window.game.scene.getScene('room').litMs > 1800, null, { timeout: 8000 }).catch(() => errors.push('cloister: the Dawn does not burn'));
      await shot('cloister-dawn'); // the danger building, 1.8 s into its 2.5 s grace
      const h0 = await run(() => window.game.scene.getScene('room').health);
      await page.waitForFunction((h0) => window.game.scene.getScene('room').health < h0, h0, { timeout: 8000 }).catch(() => errors.push('cloister: the Dawn does not burn'));
      const start = await run(() => window.game.scene.getScene('room').room.heroStart);
      await put(start.x, start.y);
      await page.waitForTimeout(600);
      if (await run(() => window.game.scene.getScene('room').litMs) > 0) errors.push('cloister: the shade of the south walk burns');
      await shot('cloister-shade');
    }
  }
  // The room cleared, the hero walking up to its open portcullises.
  await run(() => { const s = window.game.scene.getScene('room'); s.enemies.clear(true, true); s.time.removeAllEvents(); });
  await put(240, 150);
  rates[id] = await fps();
  await run(() => { const s = window.game.scene.getScene('room'); s.cameras.main.centerOn(240, 135); });
  await shot(`${id}-gate`);
}
await enter('refuge');
rates.refuge = await fps();
console.log(`fps (headless, SwiftShader, 1920x1080): ${JSON.stringify(rates)}`);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
