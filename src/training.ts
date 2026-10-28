// The training room (key T): a DOM panel over the game to call enemies in, toggle the gifts and tune the hero live.
// The knobs change T itself, so a tuned value holds for the whole session, expeditions included, until a reload.
import { T } from './tuning.ts';
import { GIFTS, GIFT_IDS, KINDS, RARITY, kind, type GiftId, type Slot } from './gifts.ts';
import type { LayoutId } from './room.ts';
import * as Save from './save.ts';
import * as Cheats from './cheats.ts';
import { ITEMS, ITEM_IDS, type Item, type ItemId } from './items.ts';
import { POWERS, SLOTS, slotOf, type Power } from './powers.ts';
import { itemSlots } from './shop.ts';

export type Spawn = 'ghoul' | 'crossbow' | 'weak' | 'lantern' | 'purifier' | 'priest' | 'hounds' | 'penitents' | 'ringer' | 'inquisitor' | 'amas' | 'bourreau' | 'crows' | 'enterre' | 'gave';
/** Survive the scene restarts (a death in training starts the training room again). out, cool: the « Mode test »'s,
 *  out of the training room too, until a reload: invincible, the mist's, the glyph's and la Nuée's recharges at once. */
export const opts = { god: true, passive: false, out: false, cool: false };

const ROOMS: [LayoutId, string][] = [['hall', 'La crypte'], ['nave', 'La nef'], ['ossuary', 'L\'ossuaire effondré'], ['chapel', 'La chapelle aux vitraux'], ['cloister', 'Le cloître'], ['refuge', 'Le refuge'], ['necropolis', 'La nécropole']];
const SPAWNS: [Spawn, string][] = [['ghoul', 'Goule'], ['crossbow', 'Arbalétrier'], ['weak', 'Arbalétrier affaibli'], ['lantern', 'Lanterne'], ['purifier', 'Purificateur'], ['priest', 'Prêtre'], ['hounds', 'Chiens (3)'], ['penitents', 'Pénitents (6)'], ['ringer', 'Sonneur'], ['inquisitor', 'Inquisiteur'], ['amas', 'Amas'], ['bourreau', 'Bourreau'], ['crows', 'Corneilles'], ['enterre', 'Enterré'], ['gave', 'Gavé']];
// [label, group, key, min, max, step]
const KNOBS = [
  ['Vitesse de marche', 'hero', 'speed', 30, 160, 2],
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
  ['Ennemis « grand pixel » : gel quand ils touchent (ms par sang)', 'foes', 'hitStopMs', 0, 150, 5],
  ['Ennemis « grand pixel » : recul du héros touché', 'foes', 'knock', 0, 300, 10],
  ['Ennemis « grand pixel » : tenue après un coup (ms)', 'foes', 'poiseMs', 0, 2000, 50],
  ['Chien : préparation (ms)', 'hound', 'crouchMs', 150, 1000, 10],
  ['Pénitent : préparation (ms)', 'penitent', 'cockMs', 150, 1000, 10],
  ['Bourreau : préparation (ms)', 'bourreau', 'heaveMs', 300, 1500, 25],
  ['Aube (cloître) : grâce avant de brûler (ms)', 'dawn', 'graceMs', 0, 5000, 100],
  ['Aube (cloître) : une brûlure toutes les (ms)', 'dawn', 'burnEveryMs', 300, 3000, 50],
  ['Son : volume général (dB)', 'audio', 'master', -40, 6, 1],
  ['Son : ambiance (dB)', 'audio', 'ambience', -40, 6, 1],
  ['Son : musique (dB)', 'audio', 'music', -40, 6, 1],
  ['Son : effets (dB)', 'audio', 'effects', -40, 6, 1],
] as const;

// Folded or not, the panel stays so across the training room's restarts.
let shown = true;
let rank = 0; // the rarity of the gifts ticked
// The « Mode test »: its groups unfolded; the item and rarity it gives; what « Aller à » sets out with (the blood bag
// full, the items given into the bag).
const unfolded = new Set(['test']);
let item: ItemId | '' = '', rarity = 0;
const kit = { full: false, bag: [] as Item[] };

const tuned = T as unknown as Record<string, Record<string, number>>;
const defaults: Record<string, number> = Object.fromEntries(KNOBS.map(([, g, k]) => [`${g}.${k}`, tuned[g][k]]));

const CSS = `
#training{position:fixed;top:8px;right:8px;width:min(280px,calc(100vw - 16px));
  max-height:calc(100% - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;z-index:10;
  padding:8px 10px;background:#170d22ee;border:1px solid #2e1838;color:#e8dcc8;font:13px/1.35 Georgia,"Times New Roman",serif}
#training summary{cursor:pointer;font-weight:700;color:#e0284a;letter-spacing:.06em}
#training small{color:#a8929f;font-weight:400;letter-spacing:0}
#training details details{margin:4px 0 0 4px}
#training details details>summary{color:#e8dcc8;font-weight:400;letter-spacing:0}
#training details details[open]>summary{color:#8ff0dc}
#training .pair{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:2px 0}
#training .row+label,#training label+.row{margin-top:3px}
#training h3{margin:10px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a8929f}
#training .row{display:flex;flex-wrap:wrap;gap:4px}
#training button{font:inherit;color:inherit;background:#0b0710;border:1px solid #2e1838;padding:3px 6px;cursor:pointer}
#training button:hover{border-color:#8ff0dc;color:#8ff0dc}
#training button:focus-visible,#training input:focus-visible{outline:2px solid #8ff0dc;outline-offset:1px}
#training label{display:block;cursor:pointer}
#training .knob{display:grid;grid-template-columns:1fr auto;margin-top:4px}
#training .knob input,#training .knob select{grid-column:1/-1;width:100%;accent-color:#e0284a}
#training select{font:inherit;color:inherit;background:#0b0710;border:1px solid #2e1838}
#training output{color:#8ff0dc}
#training textarea{width:100%;box-sizing:border-box;margin:8px 0 4px;background:#0b0710;color:#e8dcc8;border:1px solid #2e1838;
  font:11px/1.3 ui-monospace,monospace;resize:vertical}`;

/** Opens the panel; returns what closes it. */
export function panel(api: {
  gifts: GiftId[]; spawn(s: Spawn): void; clear(): void; heal(): void; toggle(id: GiftId, on: boolean, rank: number): void; rank(rank: number): void;
  swarm(): void; restart(layout?: LayoutId): void; battue(): void; reset(): void;
  go(layout: LayoutId, at: { x: number; y: number } | undefined, full: boolean, bag: Item[]): void;
}) {
  const S = Save.data, box = (attr: string, on: boolean, label: string) => `<label><input type="checkbox" ${attr}${on ? ' checked' : ''}> ${label}</label>`;
  const pick = (attr: string, label: string, options: [string | number, string][], v: string | number) =>
    `<label class="pair">${label}<select ${attr}>${options.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const group = (id: string, title: string, body: string) => `<details data-group="${id}"${unfolded.has(id) ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
  const flag = (f: keyof typeof Cheats.FLAGS, label: string) => box(`data-flag="${f}"`, Cheats.FLAGS[f][0](S), label);
  const ware = (w: 'life' | 'bag', label: string) => pick(`data-ware="${w}"`, label, Array.from({ length: T.ronge[w].ranks + 1 }, (_, n) => [n, `+${n}`]), S.unlocks[w]);
  // The « Mode test », on the real save: drawn again after each change, so what it shows is the save's.
  const test = () => [
    group('sang', `Sang <small>· ${S.banked} au bassin</small>`, `<div class="row"><button type="button" data-blood="100">+100 au bassin</button><button type="button" data-blood="1000">+1000 au bassin</button></div>
      ${box('data-kit', kit.full, 'Sac de sang plein à l\'arrivée <small>· Aller à</small>')}`),
    group('ronge', 'Améliorations du Rongé', `${flag('bite', 'La morsure')}${ware('life', 'Vie max')}${ware('bag', 'Taille du sac')}
      <div class="row"><button type="button" data-cheat="ronge">Tout au maximum</button></div>`),
    group('vesna', 'Pouvoirs de Vesna', `${flag('vesna', 'Vesna libérée <small>· au refuge</small>')}${flag('swarm', 'La Nuée (R)')}
      ${SLOTS.map((k) => pick(`data-slot="${k}"`, KINDS[k], [['', '—'], ...POWERS.filter((id) => slotOf(id) === k).map((id): [string, string] => [id, GIFTS[id as GiftId].name])], S.powers.worn[k] ?? '')).join('')}
      <div class="row"><button type="button" data-cheat="powers">Tous les pouvoirs et la Nuée</button></div>`),
    group('objets', `Objets <small>· ${S.stash.length} au coffre, ${kit.bag.length}/${itemSlots(S)} au sac</small>`, `${pick('data-item', 'Objet', [['', 'Un de chaque'], ...ITEM_IDS.map((id): [string, string] => [id, ITEMS[id].name])], item)}
      ${pick('data-rarity', 'Rareté', RARITY.map((r, i): [number, string] => [i, r]), rarity)}
      <div class="row"><button type="button" data-cheat="chest">Au coffre</button><button type="button" data-cheat="bag">Au sac <small>· Aller à</small></button><button type="button" data-cheat="all">Tout le coffre <small>· 3 raretés</small></button></div>`),
    group('monde', 'Monde', `${flag('shortcuts', 'Tous les raccourcis ouverts')}${flag('nourrice', 'La Nourrice tuée <small>· décocher : la recombattre</small>')}`),
    group('aller', 'Aller à <small>· en expédition, T revient ici</small>', `<div class="row">${Cheats.PLACES.map(([l], i) => `<button type="button" data-go="${i}">${l}</button>`).join('')}</div>`),
    group('heros', 'Héros', `${box('data-opt="god"', opts.god, 'Invincible ici')}${box('data-opt="out"', opts.out, 'Invincible en expédition aussi')}
      ${box('data-opt="cool"', opts.cool, 'Recharges instantanées <small>· brume, glyphe, Nuée</small>')}<div class="row"><button type="button" data-act="heal">Soigner</button></div>`),
    group('reset', 'Réinitialiser', '<div class="row"><button type="button" data-act="reset-save">Effacer la sauvegarde</button></div>'),
  ].join('');

  // Every gift can be ticked, several in one slot too: the one-per-slot rule is the run's, not the training room's.
  const gifts = (k: (id: GiftId) => boolean) => GIFT_IDS.filter(k).map((id) =>
    `<label><input type="checkbox" data-gift="${id}"${api.gifts.includes(id) ? ' checked' : ''}> ${GIFTS[id].name}${GIFTS[id].slot ? ` <small>· ${KINDS[kind(id)]}</small>` : ''}</label>`).join('');
  const root = document.createElement('aside');
  root.id = 'training';
  root.innerHTML = `<style>${CSS}</style><details${shown ? ' open' : ''}><summary>ENTRAÎNEMENT <small>· T pour quitter · P plein écran</small></summary>
    <details data-group="test"${unfolded.has('test') ? ' open' : ''}><summary>MODE TEST <small>· la vraie sauvegarde</small></summary><div data-test>${test()}</div></details>
    <h3>Salle</h3>
    <div class="row">${ROOMS.map(([id, l]) => `<button type="button" data-layout="${id}">${l}</button>`).join('')}</div>
    <h3>Ennemis</h3>
    <div class="row">${SPAWNS.map(([s, l]) => `<button type="button" data-spawn="${s}">+ ${l}</button>`).join('')}<button type="button" data-act="clear">Vider la salle</button><button type="button" data-act="battue">Lâcher une battue</button></div>
    <label><input type="checkbox" data-opt="passive"> Ennemis passifs (mannequins)</label>
    <h3>Dons du Rat : emplacements</h3>${gifts((id) => !!GIFTS[id].slot)}
    <h3>Dons du Rat : talents</h3>${gifts((id) => kind(id) === 'talent')}
    <h3>Pactes de sang</h3>${gifts((id) => kind(id) === 'pacte')}
    <label class="knob">Rareté des Dons cochés<select data-rank>${RARITY.map((r, i) => `<option value="${i}"${i === rank ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="row"><button type="button" data-act="swarm">La Nuée (touche R)</button></div>
    <h3>Réglages</h3>
    ${KNOBS.map(([l, g, k, min, max, step]) => `<label class="knob">${l}<output>${tuned[g][k]}</output><input type="range" data-knob="${g}.${k}" min="${min}" max="${max}" step="${step}" value="${tuned[g][k]}"></label>`).join('')}
    <textarea readonly rows="3" aria-label="Réglages modifiés" placeholder="Les réglages modifiés s'affichent ici : copie-les dans le chat."></textarea>
    <div class="row"><button type="button" data-act="reset">Réinitialiser les réglages</button></div></details>`;
  for (const i of root.querySelectorAll<HTMLInputElement>('[data-opt="passive"]')) i.checked = opts.passive;
  const tested = root.querySelector<HTMLElement>('[data-test]')!;
  const saved = () => (Save.store(), api.heal(), (tested.innerHTML = test())); // healed: to the new max life

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
    if (i.dataset.kit !== undefined) kit.full = i.checked;
    if (i.dataset.item !== undefined) item = i.value as ItemId | '';
    if (i.dataset.rarity !== undefined) rarity = Number(i.value);
    if (i.dataset.flag) Cheats.FLAGS[i.dataset.flag as keyof typeof Cheats.FLAGS][1](S, i.checked), saved();
    if (i.dataset.ware) Cheats.rank(S, i.dataset.ware as 'life' | 'bag', Number(i.value)), saved();
    if (i.dataset.slot) Cheats.wear(S, i.dataset.slot as Slot, (i.value || undefined) as Power | undefined), saved();
    if (i.dataset.gift) api.toggle(i.dataset.gift as GiftId, i.checked, rank);
    if (i.dataset.rank !== undefined) api.rank((rank = Number(i.value)));
    release();
  });
  root.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.layout) api.restart(b.dataset.layout as LayoutId);
    else if (b.dataset.spawn) api.spawn(b.dataset.spawn as Spawn);
    else if (b.dataset.act === 'clear') api.clear();
    else if (b.dataset.act === 'heal') api.heal();
    else if (b.dataset.act === 'swarm') api.swarm();
    else if (b.dataset.act === 'battue') api.battue();
    else if (b.dataset.act === 'reset-save' && confirm('Effacer la sauvegarde (sang au bassin, achats, objets, Vesna, raccourcis) ?')) kit.bag = [], api.reset();
    else if (b.dataset.blood) S.banked += Number(b.dataset.blood), saved();
    else if (b.dataset.cheat === 'ronge') Cheats.ronge(S), saved();
    else if (b.dataset.cheat === 'powers') Cheats.powers(S), saved();
    else if (b.dataset.cheat === 'chest') Cheats.chest(S, rarity, item ? [item] : ITEM_IDS), saved();
    else if (b.dataset.cheat === 'all') RARITY.forEach((_, r) => Cheats.chest(S, r)), saved();
    else if (b.dataset.cheat === 'bag') kit.bag.push(...Cheats.make(S, (item ? [item] : ITEM_IDS).slice(0, Math.max(0, itemSlots(S) - kit.bag.length)), rarity)), saved();
    else if (b.dataset.go) { const [, layout, at] = Cheats.PLACES[Number(b.dataset.go)]; api.go(layout, at, kit.full, kit.bag.splice(0)); }
    else if (b.dataset.act === 'reset') knobs().forEach((i) => set(i, defaults[i.dataset.knob!])), show();
    release();
  });
  changes.addEventListener('focus', () => changes.select());
  root.querySelector('details')!.addEventListener('toggle', (ev) => (shown = (ev.target as HTMLDetailsElement).open));
  root.addEventListener('toggle', (ev) => { const d = ev.target as HTMLDetailsElement, g = d.dataset.group; if (g) unfolded[d.open ? 'add' : 'delete'](g); }, true); // toggle does not bubble

  document.body.append(root);
  show();
  return () => root.remove();
}
