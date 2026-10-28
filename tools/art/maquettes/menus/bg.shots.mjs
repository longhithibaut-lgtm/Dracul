// Backgrounds for the menu mockups: in-game captures at 1920x1080, the HUD's camera hidden.
// crypt.png: the refuge's crypt, the hero by his coffin; crypt-empty.png: the same, the hero not re-formed yet.
// necro.png: la nécropole, the hero in a moon shaft by the chasm. cata.png: les catacombes, a fight paused.
// Usage: node tools/art/maquettes/menus/bg.shots.mjs [--out=shots/menus-bg --port=5214 --only=crypt|necro|cata --necro=x,y;x,y]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/menus-bg'), port = Number(arg('port', 5214)), necro = arg('necro', '1310,296').split(';').map((p) => p.split(',').map(Number)), only = arg('only', '');
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir(out, { recursive: true });
const run = (f, a) => page.evaluate(f, a);

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.game?.scene.isActive('room'));
await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 3, banked: 900, shortcuts: ['grille', 'galerie', 'caveau'] })));
await page.reload();
await page.waitForFunction(() => window.game?.scene.isActive('room') && window.game.scene.getScene('room').hero?.body);
await page.waitForTimeout(3000);
await run(() => window.game.loop.sleep());
// stepped by hand at 60 fps (headless runs at a few)
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const noHud = () => run(() => { const s = window.game.scene.getScene('room'); for (const c of s.cameras.cameras) if (c !== s.cameras.main) c.setVisible(false); });
const hero = (x, y) => run(([x, y]) => window.game.scene.getScene('room').hero.body.reset(x, y), [x, y]);
const settle = async (n = 30) => { for (let i = 0; i < n; i++) { await step(100); await page.waitForTimeout(150); } };
// the loop sleeps: step it until the room is up
const enter = async (layout) => {
  await run((l) => window.game.scene.getScene('room').scene.restart({ layout: l }), layout);
  for (let i = 0; i < 400 && !(await run((l) => { const s = window.game.scene.getScene('room'); return s.layout === l && s.sys.isActive() && !!s.hero?.body; }, layout)); i++) { await step(50); await page.waitForTimeout(100); }
  await run(() => { window.game.scene.getScene('room').invulnUntil = Infinity; });
};
const calm = () => run(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = 0; s.hero.setAlpha(1); for (const e of s.enemies?.getChildren() ?? []) e.disableBody(true, true); });

// ---- the crypt: by his coffin, then without him ----
if (!only || only === 'crypt') {
await settle(20);
await calm();
await noHud();
await step(50);
await page.screenshot({ path: `${out}/crypt.png` });
await run(() => window.game.scene.getScene('room').hero.setVisible(false));
await step(50);
await page.screenshot({ path: `${out}/crypt-empty.png` });
}

// ---- la nécropole: in a moon shaft ----
if (!only || only === 'necro') {
await enter('necropolis');
for (const [i, at] of necro.entries()) {
  await hero(...at);
  await settle();
  await calm();
  await hero(...at);
  await step(400);
  await noHud();
  await step(50);
  await page.screenshot({ path: `${out}/necro${necro.length > 1 ? `-${at.join('-')}` : ''}.png` });
}

}

// ---- les catacombes: the crossroads, three ghouls coming ----
if (!only || only === 'cata') {
await enter('catacombs');
await hero(1392, 330);
await settle();
await run(() => {
  const s = window.game.scene.getScene('room');
  for (const e of s.enemies.getChildren()) e.disableBody(true, true);
  for (const [x, y] of [[1500, 246], [1532, 226], [1436, 418]]) s.place({ x, y }, 'ghoul', { alert: true });
  s.invulnUntil = 0;
});
await step(700);
await noHud();
await step(50);
await page.screenshot({ path: `${out}/cata.png` });
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
