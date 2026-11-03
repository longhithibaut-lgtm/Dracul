import Phaser from 'phaser';
import * as Menu from './menu.ts';
import * as Keys from './keys.ts';
import * as Settings from './settings.ts';

// The options (docs/maquettes/options.png, options-son.png, options-affichage.png), from the title screen or the
// pause: three tabs. Son: the master and effects volumes (the ambience and music were taken out), mute. Commandes: every
// action's keys (keys.ts), rebound with Entrée or a click then a key (or a button; the move keys four in a row), cleared
// with Suppr; a key bound twice is red, and the line under the table says which and how to fix it. Affichage: full
// screen, the brightness (with its test: three crosses, darker and darker), the grain. Each tab can go back to its
// defaults. Left and right (or Q, D) set a value; Échap goes back.

type Tab = 'son' | 'commandes' | 'affichage';
const TABS: [Tab, string][] = [['son', 'Son'], ['commandes', 'Commandes'], ['affichage', 'Affichage']];
type Row = { set?: (dx: number) => void; ok?: () => void };
const RESET = 'Tout remettre par défaut';
const COUNT = ['', '', 'deux', 'trois', 'quatre'];

export class OptionsScene extends Phaser.Scene {
  private from = 'title';
  private tab: Tab = 'son';
  private row = 0; // -1: the tabs; the tab's rows; then « Tout remettre par défaut »
  private col = 0; // Commandes: the slot in hand
  private listen?: string[]; // Commandes: the keys pressed so far for the slot in hand (a move slot takes four)
  private hits: [number[], (x: number) => void, number, number?][] = []; // where, what a click there does (at x), the row (and slot) it sets
  private skipUp = false; // a button just bound: its release is not a click

  constructor() {
    super('options');
  }

  init(data: { from?: string }) {
    [this.from, this.row, this.col, this.listen] = [data.from ?? 'title', 0, 0, undefined];
  }

  preload() {
    Menu.preload(this);
  }

  create() {
    // the game's HUD hidden meanwhile (from the pause; under the title it is already)
    const room = this.scene.get('room'), huds = room.cameras.cameras.filter((c) => c !== room.cameras.main && c.name !== 'dark-over' && c.visible);
    for (const c of huds) c.setVisible(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => huds.forEach((c) => c.setVisible(true)));
    Menu.setup(this, () => this.draw(), (n, ev) => this.key(n, ev), (x, y) => this.hover(x, y), (x, y, b) => this.click(x, y, b));
    // a mouse button bound: pressed, not released (the release is the click that started the listening)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.listen) { this.skipUp = true; this.press(`Mouse${p.button}`); } });
    this.input.mouse!.disableContextMenu();
    const full = () => this.draw();
    document.addEventListener('fullscreenchange', full);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('fullscreenchange', full));
  }

  /** The rows of the tab open, each with what left/right and Entrée do. */
  private rows(): Row[] {
    const S = Settings.data, set = (c: Partial<Settings.Settings>) => Settings.set(this.game, c);
    const slider = (k: 'master' | 'effects' | 'bright'): Row => ({ set: (dx) => set({ [k]: Phaser.Math.Clamp(S[k] + dx * 5, 0, 100) }) });
    const yes = (get: () => boolean, put: (on: boolean) => void): Row => ({ set: (dx) => put(dx < 0), ok: () => put(!get()) });
    if (this.tab === 'son') return [slider('master'), slider('effects'), yes(() => S.mute, (mute) => set({ mute }))];
    if (this.tab === 'affichage') return [yes(() => !!document.fullscreenElement, (on) => Settings.fullscreen(on)), slider('bright'), yes(() => S.grain, (grain) => set({ grain }))];
    return Keys.ACTIONS.map(({ id }) => ({
      set: (dx) => { this.col = Phaser.Math.Clamp(this.col + dx, 0, Keys.binds[id].length - 1); },
      ok: () => { this.listen = []; },
    }));
  }

  private reset() {
    if (this.tab === 'commandes') Keys.set(Keys.DEFAULTS);
    else if (this.tab === 'son') Settings.set(this.game, { master: Settings.DEFAULTS.master, effects: Settings.DEFAULTS.effects, mute: Settings.DEFAULTS.mute });
    else Settings.set(this.game, { bright: Settings.DEFAULTS.bright, grain: Settings.DEFAULTS.grain });
  }

  private draw() {
    this.children.removeAll(true);
    this.hits = [];
    const cx = Menu.W / 2;
    Menu.dim(this, 0.78, 0.15);
    Menu.say(this, 'Options', 30, Menu.BONE, cx, 24, { origin: 0.5 });
    Menu.piece(this, 'line90', cx, 68);
    // the tabs
    const tabs = TABS.map(([id, s]) => Menu.say(this, s, 20, id === this.tab ? Menu.BONE : Menu.DIM, 0, 80)), tw = tabs.reduce((s, t) => s + Menu.inkW(t) + 40, -40);
    let tx = cx - tw / 2;
    TABS.forEach(([id], i) => {
      const t = tabs[i], on = id === this.tab, w = Menu.inkW(t);
      t.setX(Math.round(tx)).setAlpha(on || this.row === -1 ? 1 : 0.8);
      if (on) { this.add.rectangle(tx, 80 + t.height + 1, w - 3, 1, 0xa39a86).setOrigin(0); Menu.piece(this, 'drop', tx - 10, 80 + 15); }
      if (on && this.row === -1) this.add.rectangle(tx, 80 + t.height + 2, w - 3, 1, 0xd6caa9).setOrigin(0);
      this.hits.push([[tx - 10, 76, tx + w + 10, 108], () => { [this.tab, this.row, this.col] = [id, 0, 0]; }, -1]);
      tx += w + 40;
    });
    this.add.rectangle(150, 116, 660, 1, 0x544a3b, 0.6).setOrigin(0);
    if (this.tab === 'commandes') this.commands();
    else this.values();
    const n = this.rows().length, reset = Menu.say(this, RESET, 15, this.row === n ? Menu.BONE : Menu.DIM, 760, 499, { origin: 1 });
    if (this.row === n) Menu.piece(this, 'drop', 760 - Menu.inkW(reset) - 12, 499 + 13);
    this.hits.push([[760 - Menu.inkW(reset) - 6, 494, 766, 520], () => this.reset(), n]);
  }

  /** Son, Affichage: rows of a name and a slider (an ampoule of blood, its number) or Oui / Non. */
  private values() {
    const S = Settings.data, ax = 230, sx0 = 420, sx1 = 680, y0 = 150, rh = 46;
    const name = (s: string, y: number, i: number) => {
      const sel = i === this.row;
      if (sel) Menu.band(this, ax - 26, 760, y - 6, y + 26);
      Menu.say(this, s, 17, sel ? Menu.BONE : Menu.SOFT, ax, y);
    };
    const slider = (s: string, v: number, y: number, i: number, put: (v: number) => void) => {
      name(s, y, i);
      const full = Menu.piece(this, 'full', sx0, y + 11), cut = Math.round(7 + (v / 100) * (sx1 - sx0)); // the blood up to v (the brass ends and ticks on both)
      full.setCrop(0, 0, cut, full.height);
      Menu.piece(this, 'empty', sx0, y + 11).setCrop(cut, 0, full.width - cut, full.height);
      Menu.say(this, String(v), 15, i === this.row ? Menu.BONE : Menu.DIM, sx1 + 16, y + 3, { face: 'cinzel' });
      this.hits.push([[ax - 26, y - 6, sx0 - 4, y + 26], () => {}, i], [[sx0 - 8, y - 6, sx1 + 8, y + 26], (px) => put(Math.round(Phaser.Math.Clamp((px - sx0) / (sx1 - sx0), 0, 1) * 20) * 5), i]);
    };
    const yesNo = (s: string, on: boolean, y: number, i: number, put: (on: boolean) => void, key?: string) => {
      name(s, y, i);
      [['Oui', true], ['Non', false]].reduce((x, [w, v]) => {
        const t = Menu.say(this, w as string, 16, on === v ? Menu.BONE : '#6b604d', x, y + 1), tw = Menu.inkW(t);
        if (on === v) this.add.rectangle(x + 2, y + t.height - 2, tw - 3, 1, 0xa39a86).setOrigin(0);
        this.hits.push([[x - 4, y - 6, x + tw + 6, y + 26], () => put(v as boolean), i]);
        return x + tw + 14;
      }, sx0);
      if (key) Menu.slot(this, [key], sx1 + 16, y + 2);
      this.hits.push([[ax - 26, y - 6, sx0 - 4, y + 26], () => {}, i]);
    };
    if (this.tab === 'son') {
      slider('Volume général', S.master, y0, 0, (master) => Settings.set(this.game, { master }));
      slider('Effets', S.effects, y0 + rh, 1, (effects) => Settings.set(this.game, { effects }));
      yesNo('Couper le son', S.mute, y0 + 2 * rh + 10, 2, (mute) => Settings.set(this.game, { mute }), Keys.binds.mute.flat()[0]);
      return Menu.footer(this, [[`${Keys.label(Keys.binds.move[0][1] ?? 'ArrowLeft')}  ${Keys.label(Keys.binds.move[0][3] ?? 'ArrowRight')}`, 'régler'], [Keys.label(Keys.FIXED), 'retour']], 200, 500);
    }
    yesNo('Plein écran', !!document.fullscreenElement, y0, 0, (on) => Settings.fullscreen(on), Keys.binds.fullscreen.flat()[0]);
    slider('Luminosité', S.bright, y0 + rh, 1, (bright) => Settings.set(this.game, { bright }));
    // the test: three crosses, darker and darker, on black, through the same brightness as the game (dark.ts)
    const ty = y0 + rh + 40, g = Settings.gamma(S.bright), lv = (v: number) => Math.round(255 * (v / 255) ** g);
    this.add.rectangle(sx0, ty, sx1 - sx0, 50, Phaser.Display.Color.GetColor(lv(11), lv(11), lv(11))).setOrigin(0);
    [23, 38, 57].forEach((v, i) => {
      const x = sx0 + 45 + i * 85, y = ty + 25, c = Phaser.Display.Color.GetColor(lv(v), lv(v * 0.95), lv(v * 0.85));
      this.add.rectangle(x - 2, y - 17, 5, 35, c).setOrigin(0);
      this.add.rectangle(x - 10, y - 8, 21, 5, c).setOrigin(0);
    });
    Menu.say(this, 'Règle-la jusqu’à ce que la croix de gauche se devine à peine.', 14, '#6e624e', (sx0 + sx1) / 2, ty + 56, { face: 'italic fellI', origin: 0.5 });
    yesNo('Grain de l’image', S.grain, ty + 92, 2, (grain) => Settings.set(this.game, { grain }));
    Menu.footer(this, [[`${Keys.label(Keys.binds.move[0][1] ?? 'ArrowLeft')}  ${Keys.label(Keys.binds.move[0][3] ?? 'ArrowRight')}`, 'régler'], [Keys.label(Keys.FIXED), 'retour']], 200, 500);
  }

  /** Commandes: each action, its keys (TOUCHE), its other (AUTRE). */
  private commands() {
    const ax = 200, kx = 430, ox = 560, y0 = 132, rh = 22, B = Keys.binds, clash = Keys.clashes(B), fixed = (b: string) => b === Keys.FIXED;
    for (const [s, x] of [['ACTION', ax], ['TOUCHE', kx], ['AUTRE', ox]] as const) Menu.say(this, s, 11, Menu.DIM, x, y0 - 4, { face: 'cinzel', spacing: 2 });
    Keys.ACTIONS.forEach(({ id, name }, i) => {
      const y = y0 + 14 + i * rh, sel = i === this.row, slots = B[id], bad = slots.flat().some((b) => clash.has(b));
      if (sel) Menu.band(this, ax - 26, 790, y - 3, y + rh - 3);
      Menu.say(this, name, 17, sel ? Menu.BONE : bad ? '#c08f6a' : Menu.SOFT, ax, y - 2);
      if (bad) Menu.piece(this, 'dropred', kx - 9, y + 14);
      let x = kx;
      slots.forEach((keys, k) => {
        if (k === slots.length - 1) x = Math.max(x, ox);
        const here = sel && k === this.col, x0 = x;
        if (here && this.listen) {
          const t = Menu.say(this, id === 'move' ? `touche ${Keys.DIRS[this.listen.length]}…` : 'appuie sur une touche…', 13, Menu.LISTEN, x, y, { face: 'italic fellI' });
          x += Menu.inkW(t) + 8;
        } else if (keys.length) x += Menu.slot(this, keys, x, y + 1, { clash: (b) => clash.has(b) || (fixed(b) && !!document.fullscreenElement), lit: here }) + 8;
        else {
          this.add.rectangle(x + 2, y + 9, 10, 1, here ? 0xd6caa9 : 0x544a3b).setOrigin(0);
          x += 20;
        }
        this.hits.push([[x0 - 2, y - 2, Math.max(x, x0 + 16), y + rh - 4], () => { [this.row, this.col, this.listen] = [i, k, id === 'pause' && k === 0 ? undefined : []]; }, i, k]);
      });
      if (id === 'glyph' && !(sel && this.listen)) Menu.say(this, `${Keys.slotLabel(slots[0]) || '—'} devant, ${Keys.slotLabel(slots[1]) || '—'} au pointeur`, 13, '#6e624e', x + 4, y, { face: 'italic fellI' });
      this.hits.push([[ax - 26, y - 3, kx - 12, y + rh - 3], () => {}, i]);
    });
    // what clashes, and why (at most two lines); Échap in full screen
    const lines = [...clash].map(([b, acts]) => {
      const names = acts.map((a) => Keys.ACTIONS.find((o) => o.id === a)!.name), list = `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
      return `${Keys.label(b)} sert ${COUNT[acts.length] ?? `${acts.length}`} fois : ${list}. Choisis une autre touche pour ${acts.length > 2 ? 'les autres' : 'l’une des deux'}.`;
    });
    if (document.fullscreenElement) lines.push('Échap : en plein écran, le navigateur s’en sert d’abord pour quitter le plein écran.');
    if (this.row === Keys.ACTIONS.findIndex((a) => a.id === 'pause') && this.col === 0) lines.unshift('Échap met toujours en pause et sert de retour : ajoute une autre touche à côté.');
    lines.slice(0, 2).forEach((s, k) => {
      const y = y0 + 14 + Keys.ACTIONS.length * rh + 4 + k * 18;
      Menu.piece(this, 'dropred', ax - 14, y + 13);
      Menu.say(this, s, 14, Menu.WARN, ax, y, { face: 'italic fellI' });
    });
    Menu.footer(this, [['Entrée', 'changer'], ['Suppr', 'effacer'], [Keys.label(Keys.FIXED), 'retour']], 200, 500);
  }

  private hover(x: number, y: number) {
    if (this.listen) return;
    const h = this.hits.find(([r]) => Menu.inside(x, y, r));
    if (!h || (h[2] === this.row && (h[3] === undefined || h[3] === this.col))) return;
    [this.row, this.col] = [h[2], h[3] ?? (h[2] === this.row ? this.col : 0)];
    this.draw();
  }

  private click(x: number, y: number, button: number) {
    if (this.skipUp) return void (this.skipUp = false);
    if (this.listen || button !== 0) return;
    const h = this.hits.find(([r]) => Menu.inside(x, y, r));
    if (!h) return;
    h[1](x);
    this.draw();
  }

  /** A key or button for the slot in hand: the slot set once it has all it takes. */
  private press(b: string) {
    if (!this.listen) return;
    const id = Keys.ACTIONS[this.row].id;
    this.listen.push(b);
    if (this.listen.length >= (id === 'move' ? 4 : 1)) {
      Keys.set(Keys.rebind(Keys.binds, id, this.col, this.listen));
      this.listen = undefined;
    }
    this.draw();
  }

  private key(n: Menu.Nav | undefined, ev: KeyboardEvent) {
    if (this.listen) { // Échap gives up; any other key is taken as it is
      if (Keys.name(ev) === Keys.FIXED) this.listen = undefined;
      else return this.press(Keys.name(ev));
      return this.draw();
    }
    Menu.globals(this, n);
    const rows = this.rows(), last = rows.length;
    if (n === 'back') return this.close();
    if (n === 'up' || n === 'down') this.row = Phaser.Math.Clamp(this.row + (n === 'up' ? -1 : 1), -1, last);
    else if ((n === 'left' || n === 'right') && this.row === -1) {
      const i = TABS.findIndex(([id]) => id === this.tab);
      this.tab = TABS[(i + (n === 'left' ? TABS.length - 1 : 1)) % TABS.length][0];
      this.col = 0;
    } else if (n === 'left' || n === 'right') rows[this.row]?.set?.(n === 'left' ? -1 : 1);
    else if (n === 'ok') {
      if (this.row === last) this.reset();
      else if (!(this.tab === 'commandes' && Keys.ACTIONS[this.row].id === 'pause' && this.col === 0)) rows[this.row]?.ok?.();
    } else if (Keys.name(ev) === 'Delete' && this.tab === 'commandes' && this.row >= 0 && this.row < last) {
      Keys.set(Keys.rebind(Keys.binds, Keys.ACTIONS[this.row].id, this.col, []));
    } else return;
    if (this.tab === 'commandes' && this.row >= 0 && this.row < last) this.col = Math.min(this.col, Keys.binds[Keys.ACTIONS[this.row].id].length - 1);
    this.draw();
  }

  private close() {
    this.scene.stop();
    this.scene.wake(this.from);
  }
}
