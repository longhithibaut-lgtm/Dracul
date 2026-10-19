// Captures the real hall's top screen from the game, without hero/HUD: game.png (as in game), base.png (no additive
// lights/particles/vignette), props.png (props only on magenta), objs.json.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'fs';
const D = new URL('.', import.meta.url).pathname;
const PRE = process.env.UNLIT ? 'unlit-' : '';
// UNLIT: the hall painted without its baked light pools (in-memory transform, no file touched)
const unlit = { name: 'unlit', enforce: 'pre', transform(code, id) { if (process.env.UNLIT && id.endsWith('/src/room.ts')) { const out = code.replace('paintLight(p, L);\n  paintPits', 'paintPits'); if (out === code) throw new Error('unlit patch missed'); return out; } } };
const server = await createServer({ root: '/home/user/Dracul', plugins: [unlit], server: { port: 5391, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5391/');
await page.waitForFunction(() => window.game?.scene.getScene('room')?.hero);
const info = await page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  s.time.removeAllEvents(); s.enemies.clear(true, true);
  return { layout: s.layout, h: s.room?.height, w: s.room?.width };
});
console.log(info);
await page.waitForTimeout(2500);
const objs = await page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  s.time.removeAllEvents(); s.enemies.clear(true, true);
  s.hero.setVisible(false);
  for (const o of s.children.list) if (o.texture?.key === 'hero' || o.texture?.key === 'wanderer') o.setVisible(false);
  s.cameras.cameras.slice(1).forEach(c => c.setVisible(false));
  for (const id of ['touch', 'training']) document.getElementById(id)?.remove();
  document.querySelectorAll('body > *:not(canvas)').forEach(e => { if (!e.querySelector('canvas')) e.style.display = 'none'; });
  const c = s.cameras.main; c.stopFollow(); c.setScroll(0, 0);
  return s.children.list.map(o => ({ type: o.type, key: o.texture?.key, frame: o.frame?.name, x: o.x, y: o.y, ox: o.originX, oy: o.originY, w: o.displayWidth, h: o.displayHeight, depth: o.depth, blend: o.blendMode, vis: o.visible, alpha: o.alpha, sf: o.scrollFactorX, name: o.name }));
});
fs.writeFileSync(D + PRE + 'objs.json', JSON.stringify(objs, null, 1));
await page.waitForTimeout(600);
const freeze = on => page.evaluate(on => on ? window.game.loop.sleep() : window.game.loop.wake(), on);
await freeze(true); await page.screenshot({ path: D + PRE + 'game.png' }); await freeze(false);
// base: no additive lights, particles, vignette
await page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  for (const o of s.children.list) if (o.blendMode === 1 || o.type === 'ParticleEmitter' || o.texture?.key === 'room-vignette') o.setVisible(false);
});
await page.waitForTimeout(200);
await freeze(true); await page.screenshot({ path: D + PRE + 'base.png' }); await freeze(false);
// props only on magenta
await page.evaluate(() => {
  const s = window.game.scene.getScene('room');
  for (const o of s.children.list) if (o.visible && (o.depth <= -998 || o.depth >= 8000)) o.setVisible(false);
  s.cameras.main.setBackgroundColor('#ff00ff');
});
await page.waitForTimeout(200);
await freeze(true); await page.screenshot({ path: D + PRE + 'props.png' }); await freeze(false);
await browser.close(); await server.close();
console.log('ok');
