// Launch headless Chromium, run scene.js, save the canvas as PNG.
import { chromium } from 'playwright';
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const out = process.argv[2] || dir + 'salle-c.png';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[err]', e.message));
await page.setContent('<html><body style="margin:0;background:#000"><canvas id="c" width="1920" height="1080"></canvas></body></html>');
await page.addScriptTag({ path: dir + 'scene.js' });
const url = await page.evaluate(async () => { await window.renderScene(); return document.getElementById('c').toDataURL('image/png'); }, { timeout: 0 });
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', out);
