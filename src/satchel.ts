import Phaser from 'phaser';
import * as Font from './font.ts';
import { ZOOM, prelit } from './dark.ts';
import { FW, FH, SOLE } from './chest.data.ts';
import chestSheet from './chest.png';
import { FAMILY, ITEMS, RARITY, SLOTS, describe, type Family, type Item, type ItemId, type Worn } from './items.ts';

// How the items show (items.ts): their 7x7 icons in the HUD shelf's palette, and the panel where they are worn: « Le
// sac » on an expedition (the slots worn and the bag, pausing the game) and « Le coffre » at the refuge (the slots and
// the chest), in the Rongé's cards' style, pinned to the view. Gameplay (RoomScene) decides; this file only draws.

const VOID = 0x0b0710, NIGHT = 0x1c1029, DUSK = 0x2e1838, STONE = 0x5a4468, BONE = 0xe8dcc8, BONE_DIM = 0xb7a58f, SILVER = 0xd4cdd2, GREY = 0x948a91;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a], GLOW = 0xff4f8b;
/** The icons' letters (items.ts). */
export const PAL: Record<string, number> = { S: SILVER, s: GREY, B: BONE, b: BONE_DIM, r: BLOOD[2], d: BLOOD[1], g: 0xc9a45a, w: 0x8a5e3a, m: 0x8ff0dc, v: 0x6a5684 };
/** A rarity's colour: its underline, its name. */
export const RARE = [GREY, BLOOD[2], GLOW];
/** An empty slot shows a ghost of its family. */
const GHOST: Record<Family, ItemId> = { arme: 'acier', relique: 'flacon', talisman: 'chapelet' };
const UI = 20_000; // over the room and its vignette, unlit (dark.ts)

/** Le coffre of the refuge (tools/art/chest.gen.mjs, rendered already lit like le Rongé), its floor point at (x, y). */
export function preloadChest(scene: Phaser.Scene) {
  if (!scene.textures.exists('chest')) scene.load.image('chest', chestSheet);
}
export const chest = (scene: Phaser.Scene, x: number, y: number) =>
  scene.add.image(x, y, 'chest').setOrigin(0.5, SOLE / FH).setScale(0.5).setDepth(y).setBlendMode(prelit(scene)).setSize(FW, FH);

/** Item `id`'s icon at (x, y), `k` px a pixel; `ghost`: all in one dim colour. */
export function paint(put: (x: number, y: number, w: number, c: number) => void, id: ItemId, x: number, y: number, k = 1, ghost?: number) {
  ITEMS[id].icon.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && put(x + i * k, y + j * k, k, ghost ?? PAL[ch])));
}

/** Item `id`'s icon as a 9 x 9 texture, outlined in the void so it reads on any floor. */
export function icon(scene: Phaser.Scene, id: ItemId) {
  const key = `item:${id}`;
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 9, 9)!, ctx = t.context, rows = ITEMS[id].icon;
  const on = (x: number, y: number) => (rows[y]?.[x] ?? '.') !== '.';
  ctx.fillStyle = '#0b0710';
  for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) ctx.fillRect(x + 1, y + 1, 1, 1);
  paint((x, y, w, c) => { ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`; ctx.fillRect(x, y, w, w); }, id, 1, 1);
  t.refresh();
  return key;
}

/** What the panel shows: its title; the slots worn; the list under them in `size` cells (the bag's slots, or the
 *  chest's rows) and its name; `ground`: an item on the ground to take, the bag full (pick the one to leave); `held`: the list item
 *  waiting for the slot it replaces; the cell under the cursor; a word (`line`); the keys; which items are not yet
 *  brought back (lost at death). */
export type View = { title: string; listName: string; worn: Worn; list: Item[]; size: number; ground?: Item; held?: number; cursor: number; line: string; hint: string; fresh(it: Item): boolean };
export type Panel = {
  at(x: number, y: number): number; // the cell under a point (native px of the view): 0-5 worn, 6... the list; -1 none
  next(i: number, dx: number, dy: number): number; // the cell from `i` the way (dx, dy) goes
  draw(v: View): void;
  close(): void;
};
const CELL = 20, GAP = 3, COLS = 12, ROWS = 3, PW = COLS * CELL + (COLS - 1) * GAP;
/** The chest shows this many of its items at most.
 *  shortcut: no scrolling, the oldest past it unseen; upgrade to pages once a chest holds that many. */
export const SHOWN = COLS * ROWS;

export function panel(scene: Phaser.Scene, first: View): Panel {
  const dim = scene.add.rectangle(0, 0, 10, 10, VOID, 0.8).setOrigin(0).setDepth(UI).setScrollFactor(0);
  const g = scene.add.graphics().setDepth(UI + 1).setScrollFactor(0);
  let v = first, cells: { x: number; y: number }[] = [], picks = 0; // picks: the cells that can be chosen (not the ground's)
  const text = (s: string, x: number, y: number, c: number, gap?: number) => { g.fillStyle(c); Font.draw(s, x, y, (px, py) => g.fillRect(px, py, 1, 1), gap); };
  const cell = (x: number, y: number, it: Item | null | undefined, f: Family | undefined, rim: number, fresh: boolean) => {
    g.fillStyle(VOID).fillRect(x + 1, y, CELL - 2, CELL).fillRect(x, y + 1, CELL, CELL - 2);
    g.fillStyle(rim).fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    g.fillStyle(NIGHT).fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    const put = (px: number, py: number, w: number, c: number) => g.fillStyle(c).fillRect(px, py, w, w);
    if (it) {
      paint(put, it.id, x + 3, y + 2, 2);
      g.fillStyle(RARE[it.r]).fillRect(x + 4, y + 17, CELL - 8, 1);
      if (fresh) g.fillStyle(GLOW).fillRect(x + CELL - 5, y + 3, 2, 2);
    } else if (f) paint(put, GHOST[f], x + 3, y + 2, 2, DUSK);
  };
  const draw = () => {
    const W = scene.scale.width / ZOOM, H = scene.scale.height / ZOOM, x0 = Math.round((W - PW) / 2);
    const shown = Math.min(SHOWN, v.size), rows = Math.ceil(shown / COLS);
    const it = v.cursor < SLOTS.length ? v.worn[v.cursor] : v.list[v.cursor - SLOTS.length];
    const words = it ? Font.wrap(describe(it), PW) : [], hint = Font.wrap(v.hint, PW);
    const tall = 14 + 14 + CELL + 10 + 12 + rows * (CELL + GAP) + 8 + 24 + Math.max(2, words.length) * 12 + 14 + hint.length * 12;
    let y = Math.max(2, Math.round((H - tall) / 2));
    dim.setSize(W, H);
    g.clear();
    // its board: the night, a dusk rim, cut corners
    const bx = x0 - 10, by = y - 8, bw = PW + 20, bh = tall + 14;
    g.fillStyle(VOID).fillRect(bx + 1, by - 1, bw - 2, bh + 2).fillRect(bx - 1, by + 1, bw + 2, bh - 2);
    g.fillStyle(DUSK).fillRect(bx + 1, by, bw - 2, bh).fillRect(bx, by + 1, bw, bh - 2);
    g.fillStyle(NIGHT, 0.95).fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    g.fillStyle(BLOOD[0]).fillRect(bx + 1, by + 1, bw - 2, 1);
    const title = v.title, tw = Font.width(title, 2);
    text(title, Math.round((W - tw) / 2) + 1, y + 1, VOID, 2);
    text(title, Math.round((W - tw) / 2), y, SILVER, 2);
    y += 16;
    // the slots worn, by family
    cells = [];
    let x = x0, last: Family | undefined;
    SLOTS.forEach((f) => {
      if (last && f !== last) x += 10;
      if (f !== last) text(FAMILY[f] + (SLOTS.filter((s) => s === f).length > 1 ? 's' : ''), x, y, GREY);
      cells.push({ x, y: y + 13 });
      x += CELL + GAP;
      last = f;
    });
    y += 13 + CELL + 10;
    text(v.listName, x0, y, GREY);
    if (v.ground) text('Au sol', x0 + (v.size + 1) * (CELL + GAP), y, GREY);
    y += 13;
    for (let k = 0; k < shown; k++) cells.push({ x: x0 + (k % COLS) * (CELL + GAP), y: y + Math.floor(k / COLS) * (CELL + GAP) });
    picks = cells.length;
    if (v.ground) cells.push({ x: x0 + (v.size + 1) * (CELL + GAP), y });
    const held = v.held !== undefined ? v.list[v.held] : undefined;
    cells.forEach((c, i) => {
      const w = i < SLOTS.length, item = w ? v.worn[i] : i < picks ? v.list[i - SLOTS.length] : v.ground;
      const rim = i === v.cursor ? BONE : held && (i === v.held! + SLOTS.length) ? GLOW : held && w && SLOTS[i] === ITEMS[held.id].fam ? BLOOD[2] : i >= picks ? BONE_DIM : STONE;
      cell(c.x, c.y, item, w ? SLOTS[i] : undefined, rim, !!item && v.fresh(item));
    });
    y += rows * (CELL + GAP) + 8;
    // what the cursor is on
    if (it) {
      text(ITEMS[it.id].name, x0, y, it.r ? RARE[it.r] : BONE);
      text(`${FAMILY[ITEMS[it.id].fam]}, ${RARITY[it.r].toLowerCase()}${v.fresh(it) ? ' : pas encore rapporté, perdu si tu meurs' : ''}`, x0, y + 12, v.fresh(it) ? BLOOD[2] : GREY);
    } else text(v.cursor < SLOTS.length ? `${FAMILY[SLOTS[v.cursor]]} : rien de porté` : 'Vide', x0, y, GREY);
    y += 24;
    words.forEach((l, i) => text(l, x0, y + i * 12, BONE_DIM));
    y += Math.max(2, words.length) * 12 + 2;
    if (v.line) text(v.line, Math.round((W - Font.width(v.line)) / 2), y, GLOW);
    y += 12;
    hint.forEach((l, i) => text(l, Math.round((W - Font.width(l)) / 2), y + i * 12, GREY));
  };
  draw();
  const place = () => draw();
  scene.scale.on(Phaser.Scale.Events.RESIZE, place);
  const close = () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, place);
    dim.destroy();
    g.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
  return {
    at: (px, py) => cells.findIndex((c) => px >= c.x && px < c.x + CELL && py >= c.y && py < c.y + CELL),
    next(i, dx, dy) {
      const c = cells[i];
      let best = i, bd = Infinity;
      for (let j = 0; j < picks; j++) {
        const p = cells[j], ahead = (p.x - c.x) * dx + (p.y - c.y) * dy, side = Math.abs(dx ? p.y - c.y : p.x - c.x);
        if (ahead > 0 && ahead + side * 3 < bd) [best, bd] = [j, ahead + side * 3];
      }
      return best;
    },
    draw(nv) {
      v = nv;
      draw();
    },
    close() {
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
      close();
    },
  };
}
