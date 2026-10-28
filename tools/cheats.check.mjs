// The training panel's « Mode test » in headless Chromium: clicks each of its controls and checks the real save (and
// the game) changed as told; « Aller à » every place; a capture of the panel, every group unfolded, at 1920x1080
// (shots/test-mode.png). Usage: node tools/cheats.check.mjs   (exit code 1 on a failure or a page error)
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5208, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept()); // « Effacer la sauvegarde » asks first
const run = (f, a) => page.evaluate(f, a);
const check = (ok, what) => (ok ? console.log(`ok: ${what}`) : (failed.push(what), console.log(`FAILED: ${what}`)), ok);
const save = () => run(() => JSON.parse(localStorage.getItem('dracul.save') ?? '{}'));
const scene = () => run(() => { const s = window.game.scene.getScene('room'), f = s.hero?.body?.center;
  return { layout: s.layout, training: s.training, hero: f && { x: Math.round(f.x), y: Math.round(f.y) }, carried: s.carried, bag: s.bag.length, health: s.health, max: s.maxHealth() }; });
const arrived = (layout, training) => page.waitForFunction(([l, t]) => { const s = window.game.scene.getScene('room'); return s.layout === l && s.training === t && s.sys.isActive() && s.phase === 'play'; }, [layout, training], { timeout: 20000 }).then(() => true, () => false);
const unfold = () => run(() => document.querySelectorAll('#training [data-group]').forEach((d) => (d.open = true)));
const training = async () => {
  await page.keyboard.press('t');
  await page.waitForSelector('#training [data-test]');
  await unfold();
};
const click = (sel) => page.click(`#training ${sel}`);
const go = async (label) => { await click(`[data-go]:text-is("${label}")`); };

await page.goto('http://localhost:5208/');
await run(() => localStorage.clear());
await page.reload();
await arrived('refuge', false);
await training();
check(await arrived('necropolis', true), 'T: the training room, its panel');

await click('[data-blood="100"]');
await click('[data-blood="1000"]');
check((await save()).banked === 1100, `Sang: +100, +1000 au bassin (${(await save()).banked})`);

await click('[data-flag="bite"]');
await page.selectOption('#training [data-ware="life"]', '2');
let s = await save(), sc = await scene();
check(s.unlocks.bite && s.unlocks.life === 2 && sc.max === sc.health && sc.max === 50 + 2 * 10, `Rongé: la morsure, vie max +2 rangs (${JSON.stringify(s.unlocks)}, ${sc.health}/${sc.max})`);
await click('[data-cheat="ronge"]');
s = await save();
check(s.unlocks.bite && s.unlocks.life === 4 && s.unlocks.bag === 3, `Rongé: tout au maximum (${JSON.stringify(s.unlocks)})`);

await click('[data-flag="vesna"]');
await click('[data-flag="swarm"]');
await page.selectOption('#training [data-slot="tir"]', 'jet');
s = await save();
check(s.vesna && s.powers.bought.join() === 'swarm,jet' && s.powers.worn.tir === 'jet', `Vesna: libérée, la Nuée, le Rat de jet porté (${JSON.stringify(s.powers)})`);
await click('[data-cheat="powers"]');
s = await save();
check(s.powers.bought.length === 9 && Object.keys(s.powers.worn).length === 4 && s.powers.worn.tir === 'jet', `Vesna: tous les pouvoirs (${JSON.stringify(s.powers)})`);
await page.selectOption('#training [data-slot="griffes"]', '');
check(!(await save()).powers.worn.griffes, 'Vesna: griffes, rien de porté');

await page.selectOption('#training [data-item]', 'croc');
await page.selectOption('#training [data-rarity]', '2');
await click('[data-cheat="chest"]');
s = await save();
check(s.stash.length === 1 && s.stash[0].id === 'croc' && s.stash[0].r === 2, `Objets: un Croc limé épique au coffre (${JSON.stringify(s.stash)})`);
await click('[data-cheat="all"]');
check((await save()).stash.length === 1 + 18 * 3, `Objets: tout le coffre (${(await save()).stash.length})`);
await page.selectOption('#training [data-item]', '');
await click('[data-cheat="bag"]');
await click('[data-cheat="bag"]'); // full: nothing more
check((await run(() => document.querySelector('#training [data-group="objets"] summary').textContent)).includes('7/7 au sac'), 'Objets: un de chaque au sac, jusqu\'à le remplir (7)');

await click('[data-flag="shortcuts"]');
await click('[data-flag="nourrice"]');
s = await save();
check(s.shortcuts.join() === 'grille,galerie,caveau' && s.nourrice.dead, `Monde: raccourcis ouverts (${s.shortcuts}), la Matrice tuée`);

await click('[data-opt="out"]');
await click('[data-opt="cool"]');
await click('[data-kit]');
await mkdir('shots', { recursive: true });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/test-mode.png' });

// Aller à: a real expedition there, with a full blood bag and the items given into the bag
await go('Catacombes : devant la prison');
check(await arrived('catacombs', false), 'Aller à: les catacombes, pour de vrai');
sc = await scene();
check(Math.hypot(sc.hero.x - 2350, sc.hero.y - 1010) < 30 && sc.carried === 700 && sc.bag === 7, `devant la prison (${JSON.stringify(sc)}): sac de sang plein, 7 objets au sac`);
check(!(await run(() => window.game.scene.getScene('room').damageHero(1))), 'invincible en expédition');
const cool = await run(async () => { const s = window.game.scene.getScene('room'); s.cast({ x: s.hero.x, y: s.hero.y - 30 }); await new Promise((r) => setTimeout(r, 300)); return s.glyphReadyAt; });
check(cool === 0, 'recharges instantanées: le glyphe aussitôt prêt');
await run(() => window.game.scene.getScene('room').hero.body.reset(2350, 900));
await page.waitForTimeout(1500);
check(!(await run(() => window.game.scene.getScene('room').fight)), 'la Nourrice tuée: pas de combat dans la prison');
await training();
await click('[data-flag="nourrice"]');
check(!(await save()).nourrice.dead, 'Monde: la Matrice à recombattre');
await go('Catacombes : devant la prison');
await arrived('catacombs', false);
await run(() => window.game.scene.getScene('room').hero.body.reset(2350, 900));
check(await page.waitForFunction(() => !!window.game.scene.getScene('room').fight, null, { timeout: 8000 }).then(() => true, () => false), 'dans la prison: la Nourrice descend');

await training();
const places = await run(() => [...document.querySelectorAll('#training [data-go]')].map((b) => b.textContent));
const at = { 'Nécropole : l\'autre bout': [3200, 350], 'Nécropole : le puits': [3700, 1236], 'Catacombes : le nid': [604, 610] };
const layouts = ['refuge', 'necropolis', 'necropolis', 'necropolis', 'catacombs', 'catacombs', 'catacombs', 'hall', 'nave', 'ossuary', 'chapel', 'cloister'];
for (const [i, label] of places.entries()) {
  if (!(await scene()).training) await training();
  await go(label);
  const ok = await arrived(layouts[i], false), p = (await scene()).hero, want = at[label];
  check(ok && (!want || Math.hypot(p.x - want[0], p.y - want[1]) < 30), `Aller à « ${label} »: ${layouts[i]} ${JSON.stringify(p)}`);
  if (layouts[i] === 'refuge') check(await run(() => !!window.game.scene.getScene('room').vesna), 'Vesna libérée: au refuge, derrière son étal');
}
await training();
await click('[data-act="reset-save"]');
await arrived('necropolis', true);
s = await save();
check(s.banked === 0 && !s.vesna && s.stash.length === 0 && s.shortcuts.length === 0, 'Effacer la sauvegarde');

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'all steps ok');
await browser.close();
await server.close();
process.exit(errors.length || failed.length ? 1 : 0);
