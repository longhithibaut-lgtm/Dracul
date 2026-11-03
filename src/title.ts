import Phaser from 'phaser';
import * as Menu from './menu.ts';
import * as Save from './save.ts';
import * as Prologue from './prologue.ts';
import type { RoomScene } from './RoomScene.ts';

// The title screen, « Le cercueil » (docs/maquettes/titre-1.png): over the refuge's crypt as the game draws it (the room
// scene under it, RoomScene `title`), the hero's coffin empty, its ashes glowing, embers rising; « DRACUL » in
// tarnished silver; Continuer (with a save only; where he is and the blood banked under it), Nouvelle partie (over a
// save: asks first, it erases it), Options, Quitter.

const ITEMS = ['Continuer', 'Nouvelle partie', 'Options', 'Quitter'];
const COFFIN = { x: 840, y: 237 }; // his coffin's ashes, room px (refuge.data.ts START is by it)

/** A save worth going back to: anything but a fresh one. */
export const saved = () => JSON.stringify(Save.data) !== JSON.stringify(Save.parse(null));

/** Nouvelle partie's first steps: the prologue (prologue.ts: a new save, the waking under the stake). */
export function startPrologue(room: Phaser.Scene) {
  Prologue.startPrologue(room.game);
}

export class TitleScene extends Phaser.Scene {
  private cursor = 0;
  private ask = false; // Nouvelle partie over a save: « effacer ? » (cursor 0 Non, 1 Oui)
  private note = '';
  private hits: [number[], number][] = [];
  private embers!: Phaser.GameObjects.Graphics;

  constructor() {
    super('title');
  }

  preload() {
    Menu.preload(this);
  }

  create() {
    [this.cursor, this.ask, this.note] = [saved() ? 0 : 1, false, ''];
    this.input.keyboard!.enabled = true; // (left off by start(), the last time)
    this.embers = this.add.graphics().setDepth(1);
    Menu.setup(this, () => this.draw(), (n) => this.key(n), (x, y) => this.hover(x, y), (x, y, b) => b === 0 && this.hover(x, y) && this.choose());
  }

  private get room() {
    return this.scene.get('room') as RoomScene;
  }

  /** The ashes' place on the menu's 960 x 540, from where the room's camera stands. */
  private coffin() {
    const cam = this.room.cameras.main, v = cam.worldView, z = cam.zoom;
    return this.cameras.main.getWorldPoint((COFFIN.x - v.x) * z, (COFFIN.y - v.y) * z);
  }

  private choices() {
    return this.ask ? ['Non', 'Oui, effacer'] : ITEMS;
  }
  private enabled(i: number) {
    return this.ask || i !== 0 || saved();
  }

  private draw() {
    for (const o of [...this.children.list]) if (o !== this.embers) o.destroy();
    this.hits = [];
    const c = this.coffin(), cx = Menu.W / 2;
    // The mockup's scrims, its overall dim lighter: the crypt renders darker than in its capture.
    Menu.dim(this, 0.12, 0.55, c.x, c.y);
    Menu.patch(this, cx, 52, 260, 60, 0.49); // over the dim: 0.55 and 0.75 dark, as the mockup's
    Menu.patch(this, cx, 430, 200, 95, 0.72);
    Menu.patch(this, c.x, c.y + 2, 70, 26, 0.38, '#bf1f0f', 0.2).setName('glow'); // the ashes glow: he re-forms
    Menu.piece(this, 'title', cx, 22);
    let y = 360;
    if (this.ask) {
      Menu.say(this, 'Effacer la partie ?', 24, Menu.BONE, cx, y - 46, { origin: 0.5 });
      Menu.say(this, 'Le sang au bassin, le coffre et tout ce qui est acquis seront perdus.', 14, Menu.WARN, cx, y - 16, { face: 'italic fellI', origin: 0.5 });
      y += 12;
    }
    this.choices().forEach((s, i) => {
      const on = this.enabled(i), sel = i === this.cursor, t = Menu.say(this, s, 24, !on ? Menu.DARK : sel ? Menu.BONE : Menu.DIM, cx, y, { origin: 0.5, op: on && !sel ? 0.85 : 1 });
      const w = Menu.inkW(t), x0 = cx - w / 2;
      this.hits.push([[x0 - 20, y, x0 + w + 20, y + t.height], i]);
      if (sel) { Menu.piece(this, 'drop', x0 - 12, y + 15); Menu.piece(this, 'drop', x0 + w + 10, y + 15); }
      y += t.height + (sel || this.ask ? 1 : 8);
      if (i === 0 && !this.ask && on) { // where he is, the blood banked
        const s = Save.data, place = s.carte.catacombs ? 'Les catacombes' : s.carte.necropolis || s.shortcuts.length ? 'La nécropole' : 'Le refuge';
        y += Menu.say(this, `${place} · ${s.banked} de sang au bassin`, 13, '#82755d', cx, y, { face: 'italic fellI', origin: 0.5 }).height + 7;
      } else if (sel || this.ask) y += 7;
    });
    if (this.note) Menu.say(this, this.note, 14, Menu.DIM, cx, y + 6, { face: 'italic fellI', origin: 0.5 });
  }

  update(time: number) {
    // The embers rising from his ashes (the mockup's: 140, spread 90 px, up to 130), each on its own slow loop.
    const g = this.embers.clear(), c = this.coffin();
    for (let i = 0; i < 140; i++) {
      const r1 = hash(i, 1), r2 = hash(i, 2), r3 = hash(i, 3), t = (time / (5200 + r3 * 3000) + r2) % 1;
      const x = Math.round(c.x + (r1 - 0.5) * 90 * (1 + t * 0.6) + Math.sin(i * 1.7 + t * 6) * 4), y = Math.round(c.y - 4 - t * 130), hot = r3 > 0.55 && t < 0.5;
      g.fillStyle(hot ? 0xffb060 : t < 0.6 ? 0xe0401a : 0x8a1810, (1 - t * 0.5) * Math.min(1, t * 12)).fillRect(x, y, 1, hot ? 2 : 1);
    }
    (this.children.getByName('glow') as Phaser.GameObjects.Image | null)?.setAlpha(0.34 + 0.06 * Math.sin(time / 700));
  }

  private hover(x: number, y: number) {
    const h = this.hits.find(([r]) => Menu.inside(x, y, r));
    if (!h || !this.enabled(h[1])) return false;
    if (h[1] !== this.cursor) { this.cursor = h[1]; this.draw(); }
    return true;
  }

  private key(n: Menu.Nav | undefined) {
    Menu.globals(this, n);
    const k = this.choices().length;
    if (n === 'up' || n === 'down') {
      do this.cursor = (this.cursor + (n === 'up' ? k - 1 : 1)) % k; while (!this.enabled(this.cursor));
      this.draw();
    } else if (n === 'ok') this.choose();
    else if (n === 'back' && this.ask) { [this.ask, this.cursor] = [false, 1]; this.draw(); }
  }

  private choose() {
    const i = this.cursor;
    if (this.ask) {
      if (i === 0) return void ([this.ask, this.cursor] = [false, 1], this.draw());
      return this.start(startPrologue); // (it resets the save)
    }
    if (i === 0) return this.start((room) => room.scene.restart({}));
    if (i === 1) {
      if (!saved()) return this.start(startPrologue);
      [this.ask, this.cursor] = [true, 0];
      return this.draw();
    }
    if (i === 2) {
      this.scene.sleep();
      return void this.scene.launch('options', { from: 'title' });
    }
    // Quitter: a page cannot close a tab it did not open; then it says so.
    window.close();
    this.note = 'Tu peux fermer l’onglet.';
    this.draw();
  }

  /** Into the game: the screen fades to black, then `go` with the room. */
  private start(go: (room: Phaser.Scene) => void) {
    this.input.keyboard!.enabled = false;
    this.cameras.main.fadeOut(400);
    this.room.cameras.main.fadeOut(400);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const room = this.room;
      this.scene.stop();
      go(room);
    });
  }
}

const hash = (i: number, k: number) => { let n = Math.imul(i, 374761393) + Math.imul(k, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
