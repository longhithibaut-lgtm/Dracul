// Each proposed Rongé in the real refuge: the game itself in headless Chromium (as scripts/shot.mjs plays it), its own
// Rongé's texture swapped at run time for the sprite card.mjs rendered (SPRITE=1, in the pose ronge.mjs DESIGNS names), drawn
// as the game draws him (half scale, mirrored to face the basin, the room's light and finish over him). Nothing in the
// game changes. From this folder: OUT=<dir> node insitu.mjs -> docs/maquettes/ronge-<n>-<key>-scene.png (1920x1080)
import fs from 'fs';
import { tmpdir } from 'os';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { DESIGNS } from './ronge.mjs';

const dir = new URL('.', import.meta.url).pathname, OUT = (process.env.OUT || tmpdir() + '/dracul-ronge') + '/', DEST = dir + '../../../../docs/maquettes/';
// where each one is (the room's floor point): on the basin's east rim (Refuge.BASIN 840,644, its bowl ~16 px round), or
// at the game's own spot (Refuge.RONGE); and where the hero stands, come up to him
const AT = [{ x: 857, y: 645 }, { x: 896, y: 650 }, { x: 900, y: 642 }], HERO = { x: 868, y: 676 };
const server = await createServer({ root: dir + '../../../../', server: { port: 5233, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:5233/');
await page.waitForFunction(() => { const s = window.game?.scene.getScene('room'); return s?.layout === 'refuge' && s.sys.isActive() && s.phase === 'play'; }, null, { timeout: 90000 });
for (let n = 1; n <= DESIGNS.length; n++) {
  const tag = `s${n}-${DESIGNS[n - 1].insitu}`, meta = JSON.parse(fs.readFileSync(OUT + tag + '.json')), src = 'data:image/png;base64,' + fs.readFileSync(OUT + tag + '.png').toString('base64');
  await page.evaluate(async ({ n, src, meta, at, hero }) => {
    const s = window.game.scene.getScene('room'), im = new Image();
    im.src = src; await im.decode();
    s.textures.exists(`ronge-${n}`) || s.textures.addImage(`ronge-${n}`, im);
    const r = s.children.list.find((c) => c.texture?.key.startsWith('ronge'));
    r.setTexture(`ronge-${n}`).setOrigin(0.5, meta.sole / meta.FH).setPosition(at.x, at.y).setDepth(at.y);
    s.ronge.show = () => {}; // his pose held
    for (const c of s.children.list) if (c.depth === 7985) c.setVisible(false); // the names over the basin and him: they would hide him
    s.hero.body.reset(hero.x, hero.y);
    s.facing = Math.atan2(at.y - hero.y, at.x - hero.x);
    s.cameras.main.stopFollow().centerOn(872, 640); // the basin, the hero and him in the middle of the view
  }, { n, src, meta, at: AT[n - 1], hero: HERO });
  await page.waitForTimeout(1500);
  const where = await page.evaluate(() => window.game.scene.getScene('room').layout);
  if (where !== 'refuge') throw new Error(`left the refuge (${where})`);
  await page.screenshot({ path: `${DEST}ronge-${n}-${DESIGNS[n - 1].key}-scene.png` });
  console.log('scene', n);
}
await browser.close();
await server.close();
