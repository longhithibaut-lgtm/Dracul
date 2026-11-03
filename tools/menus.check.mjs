// The title screen, the pause menu and the options in headless Chromium, at 1920x1080: captures next to their mockups
// (shots/menus/: titre, pause, options-son, options, options-affichage, and compare-*.png, the mockup left, the game
// right) and checks: the title starts a game (Continuer), Échap pauses (the room's clock stands still) and resumes, a
// key rebound in the options acts in the game (and the old one no longer), a clash is told, Quitter vers le titre on an
// expedition loses what he carries.
// Usage: node tools/menus.check.mjs [--port=5216]   (exit code 1 on a failure or a page error)
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 5216), out = 'shots/menus';
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await mkdir(out, { recursive: true });
const run = (f, a) => page.evaluate(f, a);
const until = (f, a, timeout = 90000) => // patient: a loaded machine runs the game at a few frames a second
  page.waitForFunction(f, a, { timeout }).then(() => true, () => false);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);
const active = (k) => run((k) => window.game.scene.isActive(k), k);
// a key, then two frames: each press is seen in a frame of its own (a loaded machine runs a frame a second)
const frames = (n) => run((n) => new Promise((r) => { const g = window.game, f = g.loop.frame, t = () => (g.loop.frame >= f + n ? r() : setTimeout(t, 20)); t(); }), n);
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await frames(2); } };
const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png` }); };
const compare = (mockup, name) => execFileSync('python3', ['-c', `
from PIL import Image
a = Image.open('docs/maquettes/${mockup}.png').convert('RGB'); b = Image.open('${out}/${name}.png').convert('RGB')
c = Image.new('RGB', (a.width + b.width + 16, max(a.height, b.height)), (60, 0, 0)); c.paste(a, (0, 0)); c.paste(b, (a.width + 16, 0))
c.resize((c.width // 2, c.height // 2)).save('${out}/compare-${name}.png')`]);
const room = (f) => run(`(() => { const s = window.game.scene.getScene('room'); return (${f})(s); })()`);

// ---- the title, no save: Continuer off; then a save: Continuer, where he is ----
await page.goto(`http://localhost:${port}/`);
await run(() => localStorage.clear());
await page.reload();
check(await until(() => window.game?.scene.isActive('title')), 'the game opens on the title screen');
check(!(await room((s) => s.hero.visible)) && !(await room((s) => s.input.keyboard.enabled)), 'under it the refuge, no hero, no input');
check(await run(() => window.game.scene.getScene('title').cursor === 1), 'no save: the cursor on Nouvelle partie (Continuer off)');
await shot('titre-sans');
await run(() => localStorage.setItem('dracul.save', JSON.stringify({ v: 6, banked: 900, shortcuts: ['grille'], carte: { necropolis: 'AA==' } })));
await page.reload();
await until(() => window.game?.scene.isActive('title'));
await page.waitForTimeout(2500);
await shot('titre');
compare('titre-1', 'titre');
await key('Enter');
check(await until(() => { const s = window.game.scene.getScene('room'); return !window.game.scene.isActive('title') && s.sys.isActive() && !s.titled && s.hero.visible && s.layout === 'refuge' && s.phase === 'play'; }), 'Continuer: in the refuge, the hero at his coffin');

// ---- the pause, on an expedition: the catacombs, blood and two finds carried ----
await room((s) => s.scene.restart({ layout: 'catacombs', carried: 126, bag: [{ n: 90, id: 'calice', r: 0 }, { n: 91, id: 'faucille', r: 1 }] }));
await until(() => { const s = window.game.scene.getScene('room'); return s.layout === 'catacombs' && s.sys.isActive() && s.phase === 'play'; });
await room((s) => { s.invulnUntil = Infinity; for (const e of s.enemies.getChildren()) if (Math.hypot(e.x - s.hero.x, e.y - s.hero.y) < 200) e.disableBody(true, true); });
await page.waitForTimeout(1500);
const t0 = await room((s) => s.time.now), w0 = Date.now();
await key('Escape');
check(await until(() => window.game.scene.isActive('pause') && window.game.scene.getScene('room').sys.isPaused()), 'Échap: the pause menu, the room paused');
const tA = await room((s) => s.time.now);
await page.waitForTimeout(1500);
check(tA === (await room((s) => s.time.now)), 'paused: the room\'s clock stands still');
await key('ArrowDown', 3);
await shot('pause');
compare('pause-1', 'pause');
await page.waitForTimeout(1500);
await key('Escape');
await until(() => !window.game.scene.isActive('pause') && window.game.scene.getScene('room').sys.isActive());
await page.waitForTimeout(300);
const t1 = await room((s) => s.time.now), w1 = Date.now();
check(t1 - t0 < w1 - w0 - 2000, `Échap again: the game goes on, its clock stood still meanwhile (${Math.round(t1 - t0)} ms of game time over ${w1 - w0} ms)`);

// ---- the options, from the pause: each tab ----
await key('Escape');
await until(() => window.game.scene.isActive('pause'));
await key('ArrowDown');
await key('Enter');
check(await until(() => window.game.scene.isActive('options')), 'Options from the pause');
await key('ArrowDown');
await shot('options-son');
compare('options-son', 'options-son');
await key('ArrowUp', 2); // onto the tabs
await key('ArrowRight', 2);
await key('ArrowDown', 2);
await shot('options-affichage');
compare('options-affichage', 'options-affichage');
await key('ArrowUp', 2);
await key('ArrowLeft');
// Commandes: la Carte onto M (a clash), Griffes from J to U
await key('ArrowDown', 10);
await key('Enter');
await key('m');
const clash = await run(() => JSON.parse(localStorage.getItem('dracul.keys')).binds.map[0][0]);
check(clash === 'm', `la Carte rebound to M (${clash}): a clash with Couper le son`);
await key('Enter'); // listening again, as in the mockup
await shot('options');
compare('options', 'options');
await key('Escape'); // gives up listening
await key('ArrowUp', 8);
await key('Enter');
await key('u');
check(await run(() => (JSON.parse(localStorage.getItem('dracul.keys')).binds.claw[0][0] === 'u')), 'Griffes rebound to U, saved');
await key('Escape'); // the options
await key('Escape'); // the pause
check(await until(() => !window.game.scene.isActive('options') && !window.game.scene.isActive('pause') && window.game.scene.getScene('room').sys.isActive()), 'back to the game');
await page.waitForTimeout(1000);
const slashes = async (k) => { const before = await room((s) => s.lastSlashAt); await key(k); await page.waitForTimeout(500); return (await room((s) => s.lastSlashAt)) !== before; };
check(await slashes('u'), 'U slashes now');
await page.waitForTimeout(800);
check(!(await slashes('j')), 'J no longer');

// ---- Quitter vers le titre, on an expedition: what he carried is lost; the bindings back to their defaults ----
const dry = (await run(() => JSON.parse(localStorage.getItem('dracul.save')).dry)) ?? 0;
await key('Escape');
await until(() => window.game.scene.isActive('pause'));
await key('ArrowUp'); // from Reprendre up to the last: Quitter vers le titre
await key('Enter');
check(await until(() => window.game.scene.isActive('title') && window.game.scene.getScene('room').titled), 'Quitter vers le titre: the title screen');
const log = await run(() => JSON.parse(localStorage.getItem('dracul.log')).at(-1));
check(log?.end === 'abandon' && log.blood === 126 && (await run(() => JSON.parse(localStorage.getItem('dracul.save')).dry)) === dry + 1, `on an expedition, given up as at a death (${JSON.stringify(log)})`);
await run(() => localStorage.removeItem('dracul.keys'));

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `${failed.length} FAILED` : 'all ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
