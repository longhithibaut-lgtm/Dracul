import Phaser from 'phaser';
import { smear, words } from './hud.ts';
import { label, type Label } from './loot.ts';
import { loop } from './rats.ts';
import { BY_ID, type Note } from './notes.ts';
import { binds, label as keyLabel, once, type Action } from './keys.ts';

// How the notes show (notes.ts): where one lies, a paper on the floor (the baked ones are in the art) and, until read, a
// pale wink over it; read, a page over the paused game in the HUD « Chair »'s italic (bone on the dark, a smear of blood
// under its title); le journal, the notes read in the order he read them, one to reread at a time. Gameplay
// (RoomScene) decides; this file only draws.

const UI = 20_000; // over the room, unlit (dark.ts), as the other panels
const UNLIT = 7981; // over the lit world (loot.ts)
const BONE = '#c4b697', DIM = '#8a7c63', FRESH = '#d01a12', INK = '#0b0907', RIM = '#312b22';
const PAPER = 0x8c8170, PAPER_D = 0x5a5244, WRIT = 0x2a231c;

/** A note lying in the world: its paper (unless baked), its wink while unread, its words as he comes near. */
export type Lying = { note: Note; label: Label; seen(): void };
export function lay(scene: Phaser.Scene, note: Note, read: boolean): Lying {
  const { x, y } = note;
  if (note.paper && !note.baked) { // a sheet on the floor, a corner curled, lines of writing; lit like the floor
    const g = scene.add.graphics().setDepth(y - 2);
    g.fillStyle(0x000000, 0.35).fillRect(x - 3, y, 7, 1);
    g.fillStyle(PAPER).fillRect(x - 4, y - 4, 7, 4).fillStyle(PAPER_D).fillRect(x + 2, y - 4, 1, 1).fillRect(x - 4, y - 1, 7, 1);
    g.fillStyle(WRIT).fillRect(x - 3, y - 3, 4, 1).fillRect(x - 3, y - 2, 5, 1);
  }
  const star = scene.add.graphics().setDepth(UNLIT + 2);
  let stop = loop(scene, (t) => { // a four-point star a moment, every 2.4 s: something to read here
    const w = (t * 1000 + x * 7) % 2400, r = w < 110 ? 2 : 1;
    star.clear();
    if (w < 220) star.fillStyle(0xe8dcc8, 0.8).fillRect(x - r, y - 7, 2 * r + 1, 1).fillRect(x, y - 7 - r, 1, 2 * r + 1);
  }, [star]);
  const seen = () => { stop(); stop = () => {}; };
  if (read) seen();
  return { note, label: label(scene, x, y - 14, [note.title, 'lire (F)']), seen };
}

/** What is open over the game: a note, or le journal (`journal`). click(): a click at screen px (x, y) it used. */
export type Panel = { journal: boolean; close(): void; click(x: number, y: number): boolean };

/** Lines of `text` in the italic at `size`, none wider than `max` screen px. */
function wrap(text: string, size: number, max: number) {
  const g = document.createElement('canvas').getContext('2d')!, lines: string[] = [];
  g.font = `italic ${size}px fellI`;
  for (const w of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && g.measureText(`${lines[last]} ${w}`).width <= max) lines[last] += ` ${w}`;
    else lines.push(w);
  }
  return lines;
}
/** Action `a`'s first key as shown (« F », « N »), as the options bind it. */
const key = (a: Action) => keyLabel(binds[a].flat()[0] ?? '?');
const caps = (s: string) => s === s.toUpperCase(); // an inscription: larger, spaced
type Put = (key: string, x: number, y: number) => void;

/** A page drawn over the paused game, screen px, redrawn on a resize; `done` once it closes. */
function overlay(scene: Phaser.Scene, paint: (ctx: CanvasRenderingContext2D, W: number, H: number, put: Put) => void, done = () => {}) {
  scene.physics.pause();
  scene.tweens.pauseAll();
  scene.time.paused = true;
  const key = 'page', k = scene.cameras.main.zoom;
  const img = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setScrollFactor(0).setDepth(UI).setScale(1 / k);
  const draw = () => {
    const W = scene.scale.width, H = scene.scale.height;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, W, H)!, ctx = tex.context;
    ctx.fillStyle = 'rgba(3, 3, 3, 0.8)';
    ctx.fillRect(0, 0, W, H);
    paint(ctx, W, H, (t, x, y) => ctx.drawImage(scene.textures.get(t).getSourceImage() as CanvasImageSource, Math.round(x), Math.round(y)));
    tex.refresh();
    img.setTexture(key);
  };
  draw();
  scene.scale.on('resize', draw);
  const close = () => {
    scene.scale.off('resize', draw);
    scene.events.off('shutdown', close);
    img.destroy();
    scene.textures.remove(key);
    scene.physics.resume();
    scene.tweens.resumeAll();
    scene.time.paused = false;
    done();
  };
  scene.events.once('shutdown', close);
  return { draw, close };
}

/** The card a note is written on, `w` x `h` at (x, y): the dark, a dusty rim. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = RIM;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

/** Note `n`'s page laid out `w` wide from its top `y` about the middle `cx`: its title over a smear, what it is written
 *  on, its text. `put` draws (none: only measured); returns its height. */
function page(scene: Phaser.Scene, n: Note, cx: number, y: number, w: number, put?: Put) {
  const y0 = y, size = (key: string) => scene.textures.get(key).getSourceImage();
  const at = (key: string) => { put?.(key, cx - size(key).width / 2, y); y += size(key).height; };
  const title = words(scene, [n.title], 26, BONE, 0.95), t = size(title);
  put?.(smear(scene, t.width - 2), cx - t.width / 2 - 6, y + t.height - 3); // as under the HUD's title
  at(title);
  y += 8;
  at(words(scene, wrap(n.on, 14, w), 14, DIM));
  y += 16;
  for (const p of n.text) { at(caps(p) ? words(scene, wrap(p, 21, w), 21, BONE, 1, 1) : words(scene, wrap(p, 17, w), 17, BONE)); y += 6; }
  return y - y0;
}
/** Words `key` centred on x at y. */
const centred = (scene: Phaser.Scene, put: Put, key: string, x: number, y: number) => put(key, x - scene.textures.get(key).getSourceImage().width / 2, y);

/** Reads note `n` over the paused game; `fresh`: just kept in the journal. */
export function read(scene: Phaser.Scene, n: Note, fresh: boolean): Panel {
  const o = overlay(scene, (ctx, W, H, put) => {
    const w = Math.min(440, W - 100), h = page(scene, n, 0, 0, w) + 16, x = Math.round((W - w - 60) / 2), y = Math.round((H - h - 50) / 2);
    card(ctx, x, y, w + 60, h + 50);
    page(scene, n, W / 2, y + 22, w, put);
    centred(scene, put, words(scene, [`${fresh ? 'Gardé au journal.     ' : ''}${key('bite')} ou Échap : fermer     ${key('journal')} : le journal`], 13, DIM), W / 2, y + h + 26);
  });
  return { journal: false, close: o.close, click: () => false };
}

/** Le journal over the paused game: the notes read (`found`, oldest first), their titles down the left, the one under
 *  the cursor (`at`, the last read by default) on the right; the arrows (Z, S, W) or a click on a title move it. */
export function journal(scene: Phaser.Scene, found: readonly string[], at = found.length - 1): Panel {
  const list = found.map((id) => BY_ID[id]).filter(Boolean);
  let cur = Math.max(0, Math.min(at, list.length - 1)), rows: { x: number; y: number; w: number; h: number }[] = [];
  const move = (d: number) => { const c = Math.max(0, Math.min(list.length - 1, cur + d)); if (c !== cur) { cur = c; o.draw(); } };
  const keys = once((ev: KeyboardEvent) => move(/^(ArrowUp|KeyW|KeyZ)$/.test(ev.code) ? -1 : /^(ArrowDown|KeyS)$/.test(ev.code) ? 1 : 0));
  const o = overlay(scene, (ctx, W, H, put) => {
    const LW = 190, RW = Math.min(400, W - LW - 120), bw = LW + RW + 60, bh = Math.min(H - 60, 400), x = Math.round((W - bw) / 2), y = Math.round((H - bh) / 2), lx = x + 16 + LW / 2;
    card(ctx, x, y, bw, bh);
    const head = words(scene, ['Le journal'], 26, BONE, 0.95), hw = scene.textures.get(head).getSourceImage().width;
    put(smear(scene, hw - 2), lx - hw / 2 - 6, y + 16 + scene.textures.get(head).getSourceImage().height - 3);
    centred(scene, put, head, lx, y + 16);
    centred(scene, put, words(scene, [list.length ? `${list.length} ${list.length > 1 ? 'notes lues' : 'note lue'}` : 'Rien de lu encore'], 13, DIM), lx, y + 52);
    // the titles, the cursor's in bone by a red mark, a window of them round it
    const RH = 21, top = y + 78, shown = Math.max(1, Math.floor((bh - 110) / RH)), first = Math.max(0, Math.min(cur - Math.floor(shown / 2), list.length - shown));
    rows = [];
    list.slice(first, first + shown).forEach((n, i) => {
      const k = first + i, ry = top + i * RH;
      rows[k] = { x: x + 10, y: ry - 2, w: LW, h: RH };
      if (k === cur) { ctx.fillStyle = FRESH; ctx.fillRect(x + 16, ry + 7, 3, 3); }
      put(words(scene, [n.title], 15, k === cur ? BONE : DIM, k === cur ? 1 : 0.8), x + 24, ry);
    });
    ctx.fillStyle = RIM;
    ctx.fillRect(x + LW + 24, y + 18, 1, bh - 50);
    if (list[cur]) page(scene, list[cur], x + LW + 30 + RW / 2, y + 22, RW, put);
    else centred(scene, put, words(scene, ['Ce que tu lis en chemin reste ici.'], 15, DIM), x + LW + 30 + RW / 2, y + bh / 2 - 10);
    centred(scene, put, words(scene, [`Flèches : choisir     ${key('journal')} ou Échap : fermer`], 13, DIM), W / 2, y + bh - 24);
  }, () => scene.input.keyboard!.off('keydown', keys));
  scene.input.keyboard!.on('keydown', keys);
  return {
    journal: true,
    close: o.close,
    click(x, y) {
      const k = rows.findIndex((r) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (k < 0) return false;
      if (k !== cur) { cur = k; o.draw(); }
      return true;
    },
  };
}
