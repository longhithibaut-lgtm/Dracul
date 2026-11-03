// The four met in the world (src/pnj.ts, src/quests.ts) in headless Chromium on a 1920x1080 PC screen: each one where
// they stand, a dialogue with its choices, the quest log in the bag; and each quest's main path and each of its
// choices played through the game's own keys and hooks, checked against the save. Writes <out>/<what>.png.
// Usage: node tools/art/pnj.shots.mjs [--out=shots/pnj --port=5213 --only=mirelle,greffier,ilse,odo] (exit code 1 on a page error or a wrong state).
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = arg('out', 'shots/pnj'), port = Number(arg('port', 5213));
const server = await createServer({ server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(out, { recursive: true });
const errors = [], done = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(120000);
const run = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (what) => { await page.screenshot({ path: `${out}/${what}.png`, timeout: 180000 }); done.push(what); };
const check = (ok, what) => ok || errors.push(what);
const ready = (layout) => page.waitForFunction((l) => { const s = window.game?.scene.getScene('room'); return s?.layout === l && s.sys.isActive() && s.phase === 'play' && !!s.hud; }, layout, { timeout: 120000 });
const save = () => run(() => JSON.parse(localStorage.getItem('dracul.save') ?? '{}'));
const quests = async () => (await save()).quests;
/** A fresh game with `quests` (and `more` of the save) set; the page reloaded at the refuge. */
const fresh = async (q = {}, more = {}) => {
  await run(([q, more]) => { localStorage.clear(); localStorage.setItem('dracul.save', JSON.stringify({ v: 9, prologue: true, quests: q, ...more })); }, [q, more]);
  await page.reload();
  await ready('refuge');
};
/** Into `layout` with the hero at (x, y) (and `carried` blood): an expedition of its own. */
const go = async (layout, x, y, carried = 0) => {
  await run(([layout, x, y, carried]) => window.game.scene.getScene('room').scene.restart({ layout, at: { x, y }, carried }), [layout, x, y, carried]);
  await ready(layout);
  await wait(900); // the fade in, the chunks round him
};
const busy = () => run(() => !!window.game.scene.getScene('room').pnj?.busy());
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(160); } };
/** The box `n` lines on (or closed): F again until it moves (a press can come too soon after the last). */
const lines = async (n = 1) => {
  for (let k = 0; k < n; k++) {
    const l = await run(() => window.game.scene.getScene('room').pnj?.line());
    if (l === undefined) return;
    for (let t = 0; t < 4; t++) {
      await key('f');
      if (await page.waitForFunction((l) => window.game.scene.getScene('room').pnj?.line() !== l, l, { timeout: 1500 }).then(() => true, () => false)) break;
    }
  }
};
const talk = async () => { await key('f'); return page.waitForFunction(() => !!window.game.scene.getScene('room').pnj?.busy(), null, { timeout: 4000 }).then(() => true, () => false); }; // (a title, not a box: false after a wait)
const P = { mirelle: [402, 604], ilse: [1194, 600], odo: [3102, 888], ledger: [3282, 816], greffier: [1870, 158], rMirelle: [726, 300], rGreffier: [690, 573], rOdo: [990, 588] };
const by = (p, dx = -24, dy = 16) => [p[0] + dx, p[1] + dy];
const kill = (quest) => run((q) => { const s = window.game.scene.getScene('room'), e = s.enemies.getChildren().find((o) => o.getData('quest') === q && o.body?.enable); if (e) s.kill(e); return !!e; }, quest);

await page.goto(`http://localhost:${port}/?play`); // past the title
await ready('refuge');
const only = arg('only', 'mirelle,greffier,ilse,odo').split(',');
try {

if (only.includes('mirelle')) {
// ---- Mirelle: met, fed three nights, she joins the refuge ----
await fresh();
await go('necropolis', ...by(P.mirelle));
await shot('mirelle');
check(await talk(), 'F by Mirelle: no dialogue');
await shot('dialogue');
await lines(3);
await shot('dialogue-choices');
await key('1');
check((await quests()).mirelle.s === 'open', 'Mirelle not met');
for (let night = 0; night < 3; night++) {
  await go('necropolis', ...by(P.mirelle), 100);
  check(await talk(), 'F by Mirelle (to feed): no dialogue');
  await key('1'); // « Verser 30 sang »
  await wait(300);
  if (await busy()) await lines(3);
  const m = (await quests()).mirelle;
  check(m.n === night + 1, `Mirelle fed ${m.n}, expected ${night + 1}`);
  check((await run(() => window.game.scene.getScene('room').carried)) === 70, 'the blood poured was not taken from the bag');
  if (night === 0) { // once a night
    await talk();
    await key('Escape');
    check((await quests()).mirelle.n === 1, 'Mirelle fed twice the same night');
  }
  await run(() => { const s = JSON.parse(localStorage.getItem('dracul.save')); s.quests.night++; localStorage.setItem('dracul.save', JSON.stringify(s)); });
  await page.reload();
  await ready('refuge');
}
check((await quests()).mirelle.c === 'refuge', 'Mirelle did not join the refuge');
await go('refuge', ...by(P.rMirelle, 30, 10));
await shot('refuge-mirelle');
check(await talk(), 'F by Mirelle at the refuge: no dialogue');
await shot('refuge-mirelle-talk');
await lines();

// ---- Mirelle neglected: she turns ghoul as a night goes by (leaving the refuge), her ghoul killed ----
await fresh({ night: 3, mirelle: { s: 'open', n: 0, at: 0 } });
await run(() => { const s = window.game.scene.getScene('room'); s.hero.body.reset(840, 900); });
await ready('necropolis');
check((await quests()).mirelle.c === 'goule', 'Mirelle did not turn ghoul');
await go('necropolis', ...by(P.mirelle, 40, 50));
await shot('mirelle-goule');
check(await kill('mirelle'), 'no ghoul of Mirelle');
check((await quests()).mirelle.c === 'tuee', 'her ghoul killed: not counted');

}
if (only.includes('greffier')) {
// ---- Le Greffier: met in the catacombs, the ledger from the camp up to the refuge; lost at death ----
await fresh();
await go('catacombs', ...by(P.greffier));
await shot('greffier');
check(await talk(), 'F by le Greffier: no dialogue');
await lines(3);
await shot('greffier-choices');
await key('1');
check((await quests()).greffier.s === 'open', 'le Greffier not met');
await go('necropolis', ...by(P.ledger));
await shot('ledger');
await talk();
const slow = await run(() => window.game.scene.getScene('room').weight().walk);
check(slow < 1, 'the ledger weighs nothing');
await key('i');
await wait(300);
await shot('log');
await key('i');
await run(() => window.game.scene.getScene('room').perish());
await ready('refuge');
await go('necropolis', ...by(P.ledger));
check((await run(() => window.game.scene.getScene('room').weight().walk)) === 1, 'the ledger outlived his death');
await talk();
await run(() => window.game.scene.getScene('room').scene.restart({}));
await ready('refuge');
check((await quests()).greffier.s === 'done', 'the ledger brought up: le Greffier not done');
await go('refuge', ...by(P.rGreffier, 0, 22));
await shot('refuge-greffier');
check(await talk(), 'F by le Greffier at the refuge: no dialogue');
const l0 = await run(() => window.game.scene.getScene('room').pnj.line());
await lines();
const l1 = await run(() => window.game.scene.getScene('room').pnj.line());
check(l0 === 0 && l1 === 1, `le Greffier's lines: ${l0} then ${l1}, expected 0 then 1`);
await shot('greffier-reveal');
await lines(3);
const sv = await save();
check(sv.quests.greffier.n === 1 && (sv.carte?.catacombs ?? '').length > 100 && sv.banked >= 80, 'le Greffier gave no map nor blood');

}
if (only.includes('ilse')) {
// ---- Ilse: met, her Gavé killed, then bitten; again, spared (the sickle) ----
for (const choice of ['1', '2']) {
  await fresh();
  await go('necropolis', ...by(P.ilse));
  if (choice === '1') await shot('ilse');
  check(await talk(), 'F by Ilse: no dialogue');
  await lines(3);
  await key('1');
  check((await quests()).ilse.s === 'open', 'Ilse not met');
  await wait(600);
  if (choice === '1') await shot('ilse-gave');
  check(await kill('ilse'), 'no Gavé of Ilse');
  check((await quests()).ilse.n === 1, 'her Gavé killed: not counted');
  await run(() => { const s = window.game.scene.getScene('room'); s.health = 10; });
  await talk();
  await lines(2);
  if (choice === '1') await shot('ilse-offer');
  await wait(400);
  await key(choice);
  await wait(400);
  const i = (await quests()).ilse;
  check(i.c === (choice === '1' ? 'mordue' : 'epargnee'), `Ilse: ${i.c} after choice ${choice}`);
  if (choice === '1') check((await run(() => window.game.scene.getScene('room').health)) > 10, 'bitten: no blood back');
  else { await lines(2); check(await run(() => window.game.scene.getScene('room').loot.some((l) => l.item.id === 'faucille')), 'spared: no sickle'); await shot('ilse-spared'); }
}

}
if (only.includes('odo')) {
// ---- Maître Odo: freed, escorted to the refuge's stairs, then kept (and his forge) or given to le Rongé ----
for (const choice of ['1', '2']) {
  await fresh({}, { banked: 500, stash: [{ n: 0, id: 'acier', r: 0 }], worn: [{ n: 0, id: 'acier', r: 0 }], next: 1 });
  await go('necropolis', ...by(P.odo));
  if (choice === '1') await shot('odo');
  check(await talk(), 'F by Odo: no dialogue');
  await lines(2);
  await key('1');
  check((await quests()).odo.s === 'open', 'Odo not freed');
  await wait(1500);
  if (choice === '1') await shot('odo-escort');
  await run(() => window.game.scene.getScene('room').hero.body.reset(230, 140)); // by the refuge's stairs (he catches up)
  await wait(2500);
  check((await run(() => window.game.scene.getScene('room').pnj.odo()?.hp)) > 0, 'Odo lost on the way');
  await run(() => window.game.scene.getScene('room').leave(-1));
  await ready('refuge');
  check((await quests()).odo.n === 1, 'Odo did not come down');
  await go('refuge', ...by(P.rOdo, 0, 24));
  if (choice === '1') await shot('refuge-odo');
  check(await talk(), 'F by Odo at the refuge: no dialogue');
  await lines(2);
  if (choice === '1') await shot('odo-choices');
  await key(choice);
  await wait(300);
  const o = (await quests()).odo;
  check(o.c === (choice === '1' ? 'garde' : 'donne'), `Odo: ${o.c} after choice ${choice}`);
  if (choice === '1') {
    check(await talk(), 'F by Odo kept: no dialogue');
    await shot('odo-forge');
    await key('1');
    await wait(300);
    const s = await save();
    check(s.worn[0]?.r === 1 && s.banked === 500 - 120, 'Odo did not reforge the weapon');
  }
}
// left behind: by another door, he is back at his stake; struck to death on the way, for good
await fresh();
await go('necropolis', ...by(P.odo));
await talk();
await lines(2);
await key('1');
await run(() => window.game.scene.getScene('room').leave(0)); // into the crypt
await page.waitForFunction(() => { const s = window.game?.scene.getScene('room'); return s?.layout !== 'necropolis' && s.sys.isActive() && s.phase === 'play'; }, null, { timeout: 120000 });
check((await quests()).odo.s === 'open' && (await quests()).odo.n === 0, 'left at a door: not back at his stake');
await go('necropolis', ...by(P.odo));
await talk();
await lines(1);
await key('1');
await wait(400);
await run(() => { const s = window.game.scene.getScene('room'), o = s.pnj.odo(); s.invulnUntil = Infinity; for (let k = 0; k < 3; k++) s.place({ x: o.x - 10 + 10 * k, y: o.y + 6 }, 'ghoul', { alert: true }); });
await page.waitForFunction(() => JSON.parse(localStorage.getItem('dracul.save')).quests.odo.c === 'mort', null, { timeout: 30000 }).catch(() => {});
check((await quests()).odo.c === 'mort', 'Odo struck by ghouls: not dead');
}
} catch (e) { errors.push(`stopped: ${e.message.split('\n')[0]}`); }

await browser.close();
await server.close();
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `ok: ${out}/${done.join(', ')}`);
process.exit(errors.length ? 1 : 0);
