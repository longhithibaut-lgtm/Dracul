// Les notes and le journal at 1920x1080 (src/notes.ts, src/journal.ts): the refuge's lectern; a note where it lies, as
// he comes near (its wink, its words), then read (F); le journal (N) with a few read, and empty. Writes <out>/<name>.png,
// exits 1 on a page error.
// Usage: node tools/art/notes.shots.mjs [--out=shots/notes --port=5212] [--note=gardien] [--only=lutrin,note,lue,journal,vide]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/notes'), port = Number(arg('port', 5212)), id = arg('note', 'gardien'), only = arg('only', 'lutrin,note,lue,journal,vide').split(',');

const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);
const room = () => run(() => window.game.scene.getScene('room').layout);
const arrived = (layout) => page.waitForFunction((l) => { const s = window.game.scene.getScene('room'); return s.layout === l && s.sys.isActive() && s.phase === 'play'; }, layout, { timeout: 30000 });
const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}.png` }); console.log(`${out}/${name}.png`); };
/** The hero at floor point (x, y), the foes put away, the camera on him; the zone's chunks round him in. */
const stand = (x, y) => run(([x, y]) => {
  const s = window.game.scene.getScene('room');
  s.invulnUntil = Infinity;
  for (const e of s.enemies.getChildren()) e.disableBody(true, true);
  s.hero.body.reset(x, y);
}, [x, y]);

await page.goto(`http://localhost:${port}/?play`); // past the title
await arrived('refuge');
const notes = await run(async () => (await import('/src/notes.ts')).NOTES);
if (only.includes('lutrin')) {
  const L = await run(async () => (await import('/src/refuge.ts')).LUTRIN);
  await stand(L.x - 18, L.y + 20);
  await page.waitForTimeout(800);
  await shot('lutrin');
}
const n = notes.find((n) => n.id === id);
if (only.includes('note') || only.includes('lue')) {
  await run((layout) => window.game.scene.getScene('room').scene.restart({ layout }), n.place);
  await arrived(n.place);
  await stand(n.x, n.y + 6);
  await page.waitForTimeout(2500);
  // the zone's chunks under the view in, then their light read back (as tools/art/catacombs.shots.mjs)
  await page.waitForFunction(() => { const s = window.game.scene.getScene('room'), z = s.room.zone, v = s.cameras.main.worldView; if (!z) return true;
    for (const x of [v.x, v.right - 1]) for (const y of [v.y, v.bottom - 1]) if (!z.chunks.shown.has(Math.floor(y / 270) * z.chunks.D.COLS + Math.floor(x / 480))) return false; return true; }, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  if (only.includes('note')) await shot(`note-${id}`);
  await page.keyboard.press('f');
  await shot(`lue-${id}`);
  await page.keyboard.press('Escape');
}
if (only.includes('journal')) {
  await run(async (ids) => { const Save = await import('/src/save.ts'); Save.data.notes.splice(0, Infinity, ...ids); }, notes.filter((m) => m.id !== 'jours').slice(0, 9).map((m) => m.id));
  await page.keyboard.press('n');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await shot('journal');
  await page.keyboard.press('n');
}
if (only.includes('vide')) {
  await run(async () => { const Save = await import('/src/save.ts'); Save.data.notes.splice(0, Infinity); });
  await page.keyboard.press('n');
  await shot('journal-vide');
  await page.keyboard.press('n');
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors', await room());
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
