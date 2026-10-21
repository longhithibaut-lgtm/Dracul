// The grand hero's walk in the refuge's great hall, on a 1920x1080 PC screen, the game stepped by hand at 60 Hz so every
// capture lands at an exact time: the eight directions, walking one way while facing a blow struck another way
// (strafe both ways, backpedal), the start, the stop and the turn round. Writes <out>/walk.png, a contact sheet of the
// hero crops (a row per case, a crop every `every` ms), and exits 1 on a page error.
// Usage: node tools/art/walk.shots.mjs [--out=shots/walk --port=5210]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/walk');
const port = Number(arg('port', 5210));

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'assert') && errors.push(m.text()));
const run = (f, a) => page.evaluate(f, a);

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero?.body && window.game.scene.isActive('room'));
await page.waitForTimeout(1200); // the fade in
await run(() => { window.game.loop.sleep(); window.t = window.game.loop.now; });
// `ms` of game at 60 Hz, then the camera on the hero.
const play = (ms) => run((ms) => {
  const s = window.game.scene.getScene('room');
  for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) window.game.step((window.t += 1000 / 60), 1000 / 60);
  s.cameras.main.centerOn(s.hero.x, s.hero.y);
  window.game.step((window.t += 0.001), 0.001); // redraw with the camera moved, the world still
}, ms);
const S = 1920 / 480 / 2; // screen px per sheet px: the hero's sheet is drawn at one game px per sheet px, the game x2 on screen
const grab = async () => page.screenshot({ clip: { x: 960 - 50 * S, y: 540 - 62 * S, width: 100 * S, height: 104 * S } });
const reset = () => run(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(950, 650); s.facing = Math.PI / 2; s.slashUntil = s.slashReadyAt = 0; });
const keys = async (ks, down) => { for (const k of ks) await (down ? page.keyboard.down(k) : page.keyboard.up(k)); };
// A click `dist` room px from the hero at angle a (the camera is on him, so he is at the screen's centre).
const click = (a, dist = 30) => page.mouse.click(960 + Math.cos(a) * dist * 4, 540 + Math.sin(a) * dist * 4);

const rows = [];
async function strip(label, ks, { before = 400, every = 50, n = 8, act, release } = {}) {
  await reset();
  await play(300);
  await keys(ks, true);
  await play(before);
  if (act) await act();
  const shots = [];
  for (let i = 0; i < n; i++) {
    if (release && i === release.at) await keys(release.keys, false), release.press && (await keys(release.press, true));
    await play(i ? every : 0);
    shots.push((await grab()).toString('base64'));
  }
  await keys([...ks, ...(release?.press ?? [])], false);
  rows.push({ label, shots, every });
}

const DIRS = { droite: ['d'], 'bas-droite': ['d', 's'], bas: ['s'], 'bas-gauche': ['a', 's'], gauche: ['a'], 'haut-gauche': ['a', 'w'], haut: ['w'], 'haut-droite': ['d', 'w'] };
for (const [label, ks] of Object.entries(DIRS)) await strip(label, ks);
// A blow struck one way while walking another: past the claw's pose, he keeps facing it while he walks on.
await strip('droite, frappe en haut (pas chassés)', ['d'], { before: 300, act: () => click(-Math.PI / 2), every: 60 });
await strip('droite, frappe en bas (pas chassés)', ['d'], { before: 300, act: () => click(Math.PI / 2), every: 60 });
await strip('droite, frappe à gauche (recul)', ['d'], { before: 300, act: () => click(Math.PI), every: 60 });
await strip('bas, frappe en haut (recul)', ['s'], { before: 300, act: () => click(-Math.PI / 2), every: 60 });
await strip('bas-droite, frappe en haut-gauche (recul)', ['d', 's'], { before: 300, act: () => click(-3 * Math.PI / 4), every: 60 });
await strip('départ', [], { before: 0, every: 33, act: () => keys(['d'], true) });
await keys(['d'], false);
await strip('arrêt', ['d'], { before: 500, every: 33, release: { at: 1, keys: ['d'] } });
await strip('demi-tour', ['d'], { before: 500, every: 33, release: { at: 1, keys: ['d'], press: ['a'] } });

// The contact sheet: a page of the crops, labelled, screenshotted whole.
const html = `<body style="margin:0;background:#111;color:#bbb;font:14px sans-serif">${rows.map((r) => `<div style="display:flex;align-items:center;gap:4px;margin:2px 4px"><div style="width:150px">${r.label}<br><small>toutes les ${r.every} ms</small></div>${r.shots.map((b) => `<img src="data:image/png;base64,${b}" width="200">`).join('')}</div>`).join('')}</body>`;
const sheet = await browser.newPage({ viewport: { width: 150 + 8 * 204 + 10, height: 400 } });
await sheet.setContent(html);
await sheet.screenshot({ path: `${out}/walk.png`, fullPage: true });

console.log(errors.length ? `errors:\n${errors.join('\n')}` : `${out}/walk.png, no page errors`);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
