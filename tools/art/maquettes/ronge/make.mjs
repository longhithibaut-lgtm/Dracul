// The Rongé's three proposals, from this folder: [OUT=<dir>] node make.mjs [cards] [sprites] [scenes] [sheets] (all four
// when none is named): the cards (card.mjs, every pose and the hero for the scale), the sprites for the
// captures in the refuge (insitu.mjs), the sheets (planche.mjs); about 3 min. -> docs/maquettes/ronge-*.png
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { DESIGNS, POSES } from './ronge.mjs';
const dir = new URL('.', import.meta.url).pathname, OUT = process.env.OUT || tmpdir() + '/dracul-ronge'; // the cards: work files, kept out of the repo
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['cards', 'sprites', 'scenes', 'sheets'];
const run = (args, env = {}) => { const r = spawnSync('node', args, { cwd: dir, stdio: 'inherit', env: { ...process.env, OUT, ...env } }); if (r.status) process.exit(r.status); };
const card = (env) => run(['../ennemis/run.mjs', '../ronge/card.mjs'], env);
if (steps.includes('cards')) { card({ DESIGN: '0' }); DESIGNS.forEach((_, i) => POSES.forEach((p) => card({ DESIGN: String(i + 1), POSE: p }))); }
if (steps.includes('sprites')) DESIGNS.forEach((d, i) => card({ DESIGN: String(i + 1), POSE: d.insitu, SPRITE: '1' }));
if (steps.includes('scenes')) run(['insitu.mjs']);
if (steps.includes('sheets')) run(['planche.mjs']);
