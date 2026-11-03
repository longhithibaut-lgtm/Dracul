import Phaser from 'phaser';
import { words } from './hud.ts';

// The dialogue box of the four met in the world (pnj.ts), in the HUD « Chair »'s hand: a dark band across the bottom
// of the screen, a smear of blood on its top edge, who speaks (dim), the line (bone, IM Fell italic), one line at a
// time; at the last, up to three choices, their key in red. Drawn by the HUD's own camera, over it (one view pixel,
// two screen pixels at 1080p), never lit nor shaken. F, Space, Enter or a click: the next line; 1-3 or a click: a
// choice; Escape: leave. Gameplay (pnj.ts) decides; this file only draws and reads keys.

/** A choice: its words, what it does (after the box closes); `off`: shown dim, not to be taken (and why, in its words). */
export type Choice = { text: string; act?: () => void; off?: boolean };
export type Talk = { who: string; lines: string[]; choices?: Choice[] };
export type Box = {
  next(): void; // F, Space, Enter
  pick(i: number): void; // 1-3
  hover(x: number, y: number): void; // the pointer, in game px
  click(x: number, y: number): void;
  close(): void; // Escape: leave, nothing chosen
};

const BONE = '#c4b697', BONE_DIM = '#8a7c63', FRESH = '#d01a12', VOID = 0x090806, SMEAR = 0x5c0a10;
const DEPTH = 30_000, PAD = 14, TEXT = 17, NAME = 15, HINT = 13;

/** The lines of `text` in the HUD's italic at `size`, each at most `max` px wide. */
function wrap(text: string, size: number, max: number) {
  const c = document.createElement('canvas').getContext('2d')!, lines: string[] = [];
  c.font = `italic ${size}px fellI`;
  for (const w of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && c.measureText(`${lines[last]} ${w}`).width <= max) lines[last] += ` ${w}`;
    else lines.push(w);
  }
  return lines;
}

/** Opens `t` over the game; `done` once it closes (before a choice acts). */
export function open(scene: Phaser.Scene, t: Talk, done: () => void): Box {
  const main = scene.cameras.main, hud = scene.cameras.cameras.find((c) => c !== main && c.name !== 'dark-over');
  let made: Phaser.GameObjects.GameObject[] = [], line = 0, hot = -1, rows: { y0: number; y1: number; i: number }[] = [], shut = false;
  // Only the HUD's camera draws it (dark.ts hands every object the HUD's camera does not ignore to it alone).
  const own = <O extends Phaser.GameObjects.GameObject & { setDepth(d: number): O }>(o: O) => {
    o.setDepth(DEPTH);
    if (hud) o.cameraFilter &= ~hud.id;
    made.push(o);
    return o;
  };
  const img = (key: string, x: number, y: number) => own(scene.add.image(Math.round(x), Math.round(y), key).setOrigin(0));
  const draw = () => {
    for (const o of made) o.destroy();
    made = [];
    const W = scene.scale.width, H = scene.scale.height, w = Math.min(640, W - 2 * PAD), x0 = Math.round((W - w) / 2);
    const last = line >= t.lines.length - 1, choices = last ? t.choices ?? [] : [];
    const said = wrap(t.lines[line] ?? '', TEXT, w).map((l) => words(scene, [l], TEXT, BONE));
    const opts = choices.map((c, i) => ({ key: words(scene, [String(i + 1)], TEXT, c.off ? BONE_DIM : FRESH, c.off ? 0.6 : 1), text: wrap(c.text, TEXT, w - 22).map((l) => words(scene, [l], TEXT, c.off ? BONE_DIM : i === hot ? FRESH : BONE, c.off ? 0.6 : 1)) }));
    const hint = words(scene, [choices.length ? 'Échap : partir' : last ? 'F : finir' : 'F : suite'], HINT, BONE_DIM, 0.8);
    const h = (k: string) => scene.textures.get(k).getSourceImage().height;
    const tall = 8 + h(words(scene, [t.who], NAME, BONE_DIM)) + said.reduce((s, k) => s + h(k), 0) + (opts.length ? 6 : 0) + opts.reduce((s, o) => s + o.text.reduce((a, k) => a + h(k), 0) + 2, 0) + h(hint) + 14;
    let y = H - tall;
    own(scene.add.rectangle(0, y - 6, W, tall + 6, VOID, 0.86).setOrigin(0));
    own(scene.add.rectangle(x0 - 6, y - 6, w + 12, 2, SMEAR, 0.9).setOrigin(0)); // the smear on its edge
    own(scene.add.rectangle(x0 + 12, y - 4, w - 40, 1, SMEAR, 0.6).setOrigin(0));
    y += 4;
    const name = img(words(scene, [t.who], NAME, BONE_DIM), x0, y);
    y += name.height;
    for (const k of said) y += img(k, x0, y).height;
    y += opts.length ? 6 : 0;
    rows = [];
    opts.forEach((o, i) => {
      const y0 = y;
      img(o.key, x0 + 4, y);
      for (const k of o.text) y += img(k, x0 + 22, y).height;
      rows.push({ y0, y1: y, i });
      y += 2;
    });
    img(hint, x0 + w - scene.textures.get(hint).getSourceImage().width, y + 2);
  };
  const close = () => {
    if (shut) return;
    shut = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, draw);
    for (const o of made) o.destroy();
    done();
  };
  const choose = (i: number) => {
    const c = line >= t.lines.length - 1 ? t.choices?.[i] : undefined;
    if (!c || c.off) return;
    close();
    c.act?.();
  };
  draw();
  scene.scale.on(Phaser.Scale.Events.RESIZE, draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
  const at = (y: number) => rows.find((r) => y >= r.y0 - 1 && y < r.y1 + 1)?.i ?? -1;
  return {
    next() {
      if (line < t.lines.length - 1) { line++; hot = -1; return draw(); }
      if (!t.choices?.length) close();
    },
    pick: choose,
    hover(_x, y) {
      const i = at(y);
      if (i !== hot) { hot = i; draw(); }
    },
    click(_x, y) {
      const i = at(y);
      if (i >= 0) choose(i);
      else this.next();
    },
    close,
  };
}
