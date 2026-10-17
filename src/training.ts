// The training room (key T): a DOM panel over the game to call enemies in, toggle the gifts and tune the hero live.
// The knobs change T itself, so a tuned value holds for the whole session, normal runs included, until a reload.
import { T } from './tuning.ts';
import { GIFTS, GIFT_IDS, KINDS, kind, type GiftId } from './gifts.ts';
import type { LayoutId } from './room.ts';

export type Spawn = 'ghoul' | 'crossbow' | 'weak' | 'lantern';
/** Survive the scene restarts (a death in training starts the training room again). */
export const opts = { god: true, passive: false, wanderer: true }; // wanderer: the new hero (wanderer.ts); off = the old one

const ROOMS: [LayoutId, string][] = [['hall', 'La crypte'], ['nave', 'La nef'], ['ossuary', 'L\'ossuaire effondré'], ['chapel', 'La chapelle aux vitraux'], ['cloister', 'Le cloître']];
const SPAWNS: [Spawn, string][] = [['ghoul', 'Goule'], ['crossbow', 'Arbalétrier'], ['weak', 'Arbalétrier affaibli'], ['lantern', 'Lanterne']];
// [label, group, key, min, max, step]
const KNOBS = [
  ['Vitesse de marche', 'hero', 'speed', 50, 160, 5],
  ['Invulnérabilité après un coup (ms)', 'hero', 'hurtInvulnMs', 200, 1500, 50],
  ['Mémoire des touches pressées trop tôt (ms)', 'hero', 'bufferMs', 0, 400, 10],
  ['Brume : vitesse', 'dash', 'speed', 200, 500, 10],
  ['Brume : durée (ms)', 'dash', 'durationMs', 60, 250, 10],
  ['Brume : recharge (ms)', 'dash', 'cooldownMs', 0, 1000, 20],
  ['Attaque en ruée : fenêtre après la brume (ms)', 'dash', 'strikeWindowMs', 0, 400, 10],
  ['Attaque en ruée : dégâts en plus', 'dash', 'strikeBonus', 0, 3, 0.5],
  ['Griffes : portée', 'slash', 'range', 18, 50, 1],
  ['Griffes : angle (°)', 'slash', 'arcDeg', 60, 220, 5],
  ['Griffes : recharge (ms)', 'slash', 'cooldownMs', 100, 500, 10],
  ['Griffes : fenêtre d\'enchaînement (ms)', 'slash', 'comboWindowMs', 200, 900, 25],
  ['Griffes : recul', 'slash', 'knockback', 0, 300, 10],
  ['Griffes : gel à l\'impact (ms)', 'slash', 'hitStopMs', 0, 150, 5],
  ['3e coup : multiplicateur de dégâts', 'slash', 'finisherMult', 1, 4, 0.25],
  ['3e coup : récupération en plus (ms)', 'slash', 'finisherRecoveryMs', 0, 500, 10],
  ['Tir : dégâts', 'shot', 'damage', 0.25, 3, 0.25],
  ['Tir : recharge (ms)', 'shot', 'cooldownMs', 100, 1000, 25],
  ['Tir : vitesse', 'shot', 'speed', 100, 500, 10],
  ['Morsure : portée', 'bite', 'range', 14, 50, 1],
  ['Morsure : durée (ms)', 'bite', 'drainMs', 150, 1000, 25],
  ['Morsure : à genoux, affaibli (ms)', 'bite', 'kneelMs', 0, 4000, 100],
  ['Glyphe : rayon', 'glyph', 'radius', 15, 60, 1],
  ['Glyphe : durée (ms)', 'glyph', 'holdMs', 500, 6000, 100],
  ['Glyphe : recharge (ms)', 'glyph', 'cooldownMs', 0, 10000, 250],
  ['Aube (cloître) : grâce avant de brûler (ms)', 'dawn', 'graceMs', 0, 5000, 100],
  ['Aube (cloître) : une brûlure toutes les (ms)', 'dawn', 'burnEveryMs', 300, 3000, 50],
] as const;

// Folded or not, the panel stays so across the training room's restarts (on a phone, it is folded to play).
let shown = true;

const tuned = T as unknown as Record<string, Record<string, number>>;
const defaults: Record<string, number> = Object.fromEntries(KNOBS.map(([, g, k]) => [`${g}.${k}`, tuned[g][k]]));

const CSS = `
#training{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));width:min(260px,calc(100vw - 16px));
  max-height:calc(100% - 16px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow:auto;overscroll-behavior:contain;box-sizing:border-box;z-index:10;
  padding:8px 10px;background:#170d22ee;border:1px solid #2e1838;color:#e8dcc8;font:13px/1.35 Georgia,"Times New Roman",serif}
#training summary{cursor:pointer;font-weight:700;color:#e0284a;letter-spacing:.06em}
#training small{color:#a8929f;font-weight:400;letter-spacing:0}
#training h3{margin:10px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a8929f}
#training .row{display:flex;flex-wrap:wrap;gap:4px}
#training button{font:inherit;color:inherit;background:#0b0710;border:1px solid #2e1838;padding:3px 6px;cursor:pointer}
#training button:hover{border-color:#8ff0dc;color:#8ff0dc}
#training button:focus-visible,#training input:focus-visible{outline:2px solid #8ff0dc;outline-offset:1px}
#training label{display:block;cursor:pointer}
#training .knob{display:grid;grid-template-columns:1fr auto;margin-top:4px}
#training .knob input{grid-column:1/-1;width:100%;accent-color:#e0284a}
#training output{color:#8ff0dc}
#training textarea{width:100%;box-sizing:border-box;margin:8px 0 4px;background:#0b0710;color:#e8dcc8;border:1px solid #2e1838;
  font:11px/1.3 ui-monospace,monospace;resize:vertical}
@media (pointer:coarse){
  #training{top:calc(52px + env(safe-area-inset-top,0px));width:min(240px,60vw);max-height:calc(100% - 60px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))}
  #training button{padding:6px 8px}
}
@media (pointer:coarse) and (orientation:portrait){ /* over the dark above the room, not over the room */
  #training{left:calc(8px + env(safe-area-inset-left,0px));width:auto;max-height:28vh}
}`;

/** Opens the panel; returns what closes it. */
export function panel(api: { gifts: GiftId[]; spawn(s: Spawn): void; clear(): void; heal(): void; toggle(id: GiftId, on: boolean): void; restart(layout?: LayoutId): void }) {
  // Every gift can be ticked, several in one slot too: the one-per-slot rule is the run's, not the training room's.
  const gifts = (slotted: boolean) => GIFT_IDS.filter((id) => !!GIFTS[id].slot === slotted).map((id) =>
    `<label><input type="checkbox" data-gift="${id}"${api.gifts.includes(id) ? ' checked' : ''}> ${GIFTS[id].name}${slotted ? ` <small>· ${KINDS[kind(id)]}</small>` : ''}</label>`).join('');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('aside');
  root.id = 'training';
  root.innerHTML = `<style>${CSS}</style><details${shown ? ' open' : ''}><summary>ENTRAÎNEMENT${coarse ? '' : ' <small>· T pour quitter</small>'}</summary>
    <h3>Salle</h3>
    <div class="row">${ROOMS.map(([id, l]) => `<button type="button" data-layout="${id}">${l}</button>`).join('')}</div>
    <h3>Ennemis</h3>
    <div class="row">${SPAWNS.map(([s, l]) => `<button type="button" data-spawn="${s}">+ ${l}</button>`).join('')}<button type="button" data-act="clear">Vider la salle</button></div>
    <label><input type="checkbox" data-opt="passive"> Ennemis passifs (mannequins)</label>
    <h3>Héros</h3>
    <label><input type="checkbox" data-opt="god"> Invincible</label>
    <label><input type="checkbox" data-opt="wanderer"> Nouveau héros (décocher : l'ancien, pour comparer)</label>
    <div class="row"><button type="button" data-act="heal">Soigner</button></div>
    <h3>Dons du Rat : emplacements</h3>${gifts(true)}
    <h3>Dons du Rat : talents</h3>${gifts(false)}
    <h3>Réglages</h3>
    ${KNOBS.map(([l, g, k, min, max, step]) => `<label class="knob">${l}<output>${tuned[g][k]}</output><input type="range" data-knob="${g}.${k}" min="${min}" max="${max}" step="${step}" value="${tuned[g][k]}"></label>`).join('')}
    <textarea readonly rows="3" aria-label="Réglages modifiés" placeholder="Les réglages modifiés s'affichent ici : copie-les dans le chat."></textarea>
    <div class="row"><button type="button" data-act="reset">Réinitialiser les réglages</button></div></details>`;
  for (const i of root.querySelectorAll<HTMLInputElement>('[data-opt]')) i.checked = opts[i.dataset.opt as keyof typeof opts];

  const changes = root.querySelector('textarea')!;
  const show = () => (changes.value = KNOBS.filter(([, g, k]) => tuned[g][k] !== defaults[`${g}.${k}`])
    .map(([l, g, k]) => `${g}.${k} (${l}) : ${defaults[`${g}.${k}`]} → ${tuned[g][k]}`).join('\n'));
  const knobs = () => root.querySelectorAll<HTMLInputElement>('[data-knob]');
  const set = (i: HTMLInputElement, v: number) => {
    const [g, k] = i.dataset.knob!.split('.');
    tuned[g][k] = v;
    i.value = String(v);
    i.previousElementSibling!.textContent = String(v);
  };
  // Focus is handed back after each use: a focused button or slider would also catch Space and the arrows meant for the hero.
  const release = () => (document.activeElement as HTMLElement | null)?.blur();

  root.addEventListener('input', (ev) => {
    const i = ev.target as HTMLInputElement;
    if (i.dataset.knob) set(i, Number(i.value)), show();
  });
  root.addEventListener('change', (ev) => {
    const i = ev.target as HTMLInputElement;
    if (i.dataset.opt) opts[i.dataset.opt as keyof typeof opts] = i.checked;
    if (i.dataset.opt === 'wanderer') api.restart(); // a new sprite: the room starts again around him
    if (i.dataset.gift) api.toggle(i.dataset.gift as GiftId, i.checked);
    release();
  });
  root.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.layout) api.restart(b.dataset.layout as LayoutId);
    else if (b.dataset.spawn) api.spawn(b.dataset.spawn as Spawn);
    else if (b.dataset.act === 'clear') api.clear();
    else if (b.dataset.act === 'heal') api.heal();
    else if (b.dataset.act === 'reset') knobs().forEach((i) => set(i, defaults[i.dataset.knob!])), show();
    release();
  });
  changes.addEventListener('focus', () => changes.select());
  root.querySelector('details')!.addEventListener('toggle', (ev) => (shown = (ev.target as HTMLDetailsElement).open));

  document.body.append(root);
  show();
  return () => root.remove();
}
