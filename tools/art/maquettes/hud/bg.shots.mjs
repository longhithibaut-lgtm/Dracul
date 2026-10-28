// Backgrounds for the HUD mockups: two in-game captures at 1920x1080 with the HUD's camera hidden.
// explore.png: les catacombes, the crossroads by the Order's lantern, a cache by the hero, three ghouls coming.
// boss.png: the prison, La Nourrice down from the vault, the hero before her.
// Usage: node tools/art/maquettes/hud/bg.shots.mjs [--out=shots/hud-bg --port=5213]
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/hud-bg'), port = Number(arg('port', 5213));
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
await page.waitForFunction(() => window.game?.scene.isActive('room'));
const A = await run(() => import('/src/catacombs.data.ts').then((m) => ({ arena: m.ARENA, rel: m.RELIQUARY })));
await run(() => window.game.scene.getScene('room').scene.restart({ layout: 'catacombs' }));
await page.waitForFunction(() => { const s = window.game.scene.getScene('room'); return s.layout === 'catacombs' && s.sys.isActive() && s.hero?.body; });
await page.waitForTimeout(3000);
await run(() => window.game.loop.sleep());
// stepped by hand at 60 fps (headless runs at a few)
const step = (ms) => run((ms) => { const g = window.game; for (let t = 0; t < ms; t += 1000 / 60) g.step((g.loop.time += 1000 / 60), 1000 / 60); }, ms);
const noHud = () => run(() => { const s = window.game.scene.getScene('room'); for (const c of s.cameras.cameras) if (c !== s.cameras.main) c.setVisible(false); });
const hero = (x, y) => run(([x, y]) => window.game.scene.getScene('room').hero.body.reset(x, y), [x, y]);
const chunksIn = async () => { for (let i = 0; i < 30; i++) { await step(100); await page.waitForTimeout(150); } };

// ---- explore: the crossroads, three ghouls from the east ----
await run(() => { window.game.scene.getScene('room').invulnUntil = Infinity; });
await hero(1392, 330);
await chunksIn();
await run(() => {
  const s = window.game.scene.getScene('room');
  for (const e of s.enemies.getChildren()) e.disableBody(true, true);
  for (const [x, y] of [[1500, 246], [1532, 226], [1436, 418]]) s.place({ x, y }, 'ghoul', { alert: true });
  s.invulnUntil = 0; // not blinking
});
await step(700);
await noHud();
await step(50);
await page.screenshot({ path: `${out}/explore.png` });

// ---- boss: into the arena, she comes down ----
await run(() => { const s = window.game.scene.getScene('room'); for (const e of s.enemies.getChildren()) e.disableBody(true, true); });
await hero(A.rel.x - 10, A.arena[3] + 30);
await step(200);
for (let i = 0; i < 40 && !(await run(() => !!window.game.scene.getScene('room').fight)); i++) { await hero(A.rel.x - 10, A.arena[3] - 40 - i); await step(50); }
await hero(A.rel.x - 30, 870);
await chunksIn();
await run(() => { const s = window.game.scene.getScene('room'); s.invulnUntil = 0; s.hero.setAlpha(1).setVisible(true); });
await noHud();
await step(50);
await page.screenshot({ path: `${out}/boss.png` });

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
