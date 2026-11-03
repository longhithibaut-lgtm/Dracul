import Phaser from 'phaser';
import * as Menu from './menu.ts';
import * as Keys from './keys.ts';
import { icon } from './satchel.ts';
import type { Item } from './items.ts';
import type { RoomScene } from './RoomScene.ts';

// The pause menu (Échap), « Relique » (docs/maquettes/pause-1.png): over the game standing still (the room scene paused,
// its world dimmed, its HUD lit), the place's name, Reprendre, Options, Le sac (its key), and on an expedition
// Abandonner l'expédition, which says what is lost (as at a death: the blood carried and what was found on the way, shown);
// Quitter vers le titre (on an expedition, the same loss).

/** What the room tells the menu: where, on an expedition or not, the blood carried, the items that would be lost. */
export type Info = { place: string; exp: boolean; carried: number; lost: Item[] };
const LOSS = 'Comme à la mort : le sang porté et ce qui a été trouvé en route sont perdus.';

export class PauseScene extends Phaser.Scene {
  private info!: Info;
  private cursor = 0;
  private hits: [number[], number][] = [];

  constructor() {
    super('pause');
  }

  init(info: Info) {
    [this.info, this.cursor] = [info, 0];
  }

  preload() {
    Menu.preload(this);
  }

  create() {
    const world = this.room.cameras.main;
    world.setAlpha(0.4); // the game dimmed (dark.ts dims its unlit layer with it), the HUD's own camera lit
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => world.setAlpha(1));
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.draw()); // back from the options: a key may have changed
    Menu.setup(this, () => this.draw(), (n, ev) => this.key(n, ev), (x, y) => this.hover(x, y), (x, y, b) => b === 0 && this.hover(x, y) && this.choose());
  }

  private get room() {
    return this.scene.get('room') as RoomScene;
  }

  private items() {
    const sac = Keys.binds.satchel.flat()[0];
    return [['Reprendre'], ['Options'], ['Le sac', sac], ...(this.info.exp ? [['Abandonner l’expédition']] : []), ['Quitter vers le titre']] as [string, string?][];
  }

  private draw() {
    this.children.removeAll(true);
    this.hits = [];
    const cx = Menu.W / 2, items = this.items();
    Menu.patch(this, cx, 240, 260, 210, 0.45);
    const place = Menu.say(this, this.info.place, 30, Menu.BONE, cx, 70, { origin: 0.5 });
    Menu.piece(this, 'line100', cx, 70 + place.height + 7);
    let y = 150;
    items.forEach(([s, key], i) => {
      const sel = i === this.cursor, t = Menu.say(this, s, 22, sel ? Menu.BONE : Menu.DIM, cx - (key ? 10 : 0), y, { origin: 0.5, op: sel ? 1 : 0.9 });
      const w = Menu.inkW(t), x0 = Math.round(cx - (key ? 10 : 0) - w / 2);
      if (key) Menu.slot(this, [key], x0 + w + 4, y + 5);
      this.hits.push([[x0 - 20, y, x0 + w + 40, y + t.height], i]);
      if (sel) { Menu.piece(this, 'drop', x0 - 12, y + 14); Menu.piece(this, 'drop', x0 + w + (key ? 30 : 10), y + 14); }
      y += t.height + (sel ? 3 : 9);
      if (sel && this.info.exp && i >= items.length - 2) { // what giving up loses, as at a death
        y += Menu.say(this, LOSS, 14, Menu.WARN, cx, y, { face: 'italic fellI', origin: 0.5 }).height + 4;
        const blood = Menu.say(this, String(this.info.carried), 16, Menu.BONE, 0, y + 2, { face: 'cinzel' }), lw = 24 + Menu.inkW(blood) + this.info.lost.length * 22;
        let x = Math.round(cx - lw / 2);
        Menu.piece(this, 'drop', x + 5, y + 13);
        blood.setX(x + 14);
        x += 24 + Menu.inkW(blood);
        for (const it of this.info.lost) { this.add.image(x + 10, y + 11, icon(this, it.id)).setScale(2); x += 22; }
        y += 30 - 6;
      }
    });
    const back = Keys.label(Keys.FIXED);
    Menu.footer(this, [[back, 'reprendre'], ['Entrée', 'choisir']], cx - 100, 470);
  }

  private hover(x: number, y: number) {
    const h = this.hits.find(([r]) => Menu.inside(x, y, r));
    if (!h) return false;
    if (h[1] !== this.cursor) { this.cursor = h[1]; this.draw(); }
    return true;
  }

  private key(n: Menu.Nav | undefined, ev: KeyboardEvent) {
    Menu.globals(this, n);
    const k = this.items().length;
    if (n === 'up' || n === 'down') { this.cursor = (this.cursor + (n === 'up' ? k - 1 : 1)) % k; this.draw(); }
    else if (n === 'ok') this.choose();
    else if (n === 'back') this.resume();
    else if (Keys.lookup(Keys.binds, Keys.name(ev)).some((h) => h.action === 'satchel')) this.resume(true);
  }

  private choose() {
    const s = this.items()[this.cursor][0];
    if (s === 'Reprendre') return this.resume();
    if (s === 'Options') { this.scene.sleep(); return void this.scene.launch('options', { from: 'pause' }); }
    if (s === 'Le sac') return this.resume(true);
    const room = this.room;
    this.scene.stop();
    room.abandon(s.startsWith('Quitter'));
  }

  /** Back to the game (`sac`: into le sac). */
  private resume(sac = false) {
    const room = this.room;
    this.scene.stop();
    room.scene.resume();
    if (sac) room.sac();
  }
}
