// Renders the cards and the scenes, then the sheets. From this folder: OUT=<dir> node make.mjs [cards] [scenes] [sheets]
// (all three when none is named); CARDS=1,5,7 renders only those cards (0: the hero's scale mask).
import { spawnSync } from 'child_process';
const dir = new URL('.', import.meta.url).pathname, OUT = process.env.OUT || dir + 'out';
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['cards', 'scenes', 'sheets'];
const run = (args, env = {}) => { const r = spawnSync('node', args, { cwd: dir, stdio: 'inherit', env: { ...process.env, OUT, ...env } }); if (r.status) process.exit(r.status); };
if (steps.includes('cards')) for (const n of process.env.CARDS?.split(',') ?? [...Array(16).keys()]) run(['../ennemis/run.mjs', '../necropole/fiche.mjs'], { FOE: String(n) });
if (steps.includes('scenes')) for (const n of process.env.SCENES?.split(',') ?? ['1', '2']) run(['scene.mjs'], { SCENE: n });
if (steps.includes('sheets')) run(['planche.mjs']);
