import Phaser from 'phaser';
import { words } from './hud.ts';
import * as Keys from './keys.ts';
import * as Settings from './settings.ts';
import { FRAMES } from './menu.data.ts';
import atlasUrl from './menu.png';
import fellUrl from './fell.ttf';
import cinzelUrl from './cinzel.ttf';

// The menus' pieces, in the Relique track of the mockups (docs/maquettes/titre-1.png, pause-1.png, options*.png): words
// in IM Fell (roman; the notes in the HUD's italic; numbers and heads in Cinzel) over a shadow, blood drops on each side
// of the choice in hand, key caps, a dark blood band under the row in hand. The lit pieces are baked offline
// (tools/art/menu.gen.mjs: « DRACUL », the reliquary lines, the drops, the ampoules, the mice). Laid out in the mockups'
// 960 x 540, one of its pixels a pixel of the x2 view, centred; a smaller view is zoomed out to fit it (fit()).
// Each menu scene redraws itself whole on a change (cheap: every text is a texture, made once).
export const W = 960, H = 540;
export const BONE = '#d6caa9', SOFT = '#a19479', DIM = '#83775e', DARK = '#4e4536', WARN = '#a3703f', LISTEN = '#cfc2a2';

let fonts = false;
/** The atlas and the menus' typefaces (the italic is the HUD's, loaded with the room). */
export function preload(scene: Phaser.Scene) {
  if (!scene.textures.exists('menu')) scene.load.image('menu', atlasUrl);
  if (!fonts) { fonts = true; scene.load.font('fell', fellUrl); scene.load.font('cinzel', cinzelUrl); }
}

/** Ready to draw: the atlas cut into its frames; the camera on the mockups' 960 x 540, again on every resize, with
 *  `redraw`; the menu's keys and clicks: `key` (a key pressed, its menu meaning), `hover`, `click` (menu px). */
export function setup(scene: Phaser.Scene, redraw: () => void, key: (n: Nav | undefined, ev: KeyboardEvent) => void, hover: (x: number, y: number) => void, click: (x: number, y: number, button: number) => void) {
  const t = scene.textures.get('menu');
  if (!t.has('title')) for (const [k, [x, y, w, h]] of Object.entries(FRAMES)) t.add(k, 0, x, y, w, h);
  const fit = () => {
    const cam = scene.cameras.main.setSize(scene.scale.width, scene.scale.height);
    cam.setZoom(Math.min(1, cam.width / W, cam.height / H)).centerOn(W / 2, H / 2);
    redraw();
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, fit);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, fit));
  // A key held repeats: the cursor runs on; anything else acts once. Stopped here: no scene under the menu sees it.
  scene.input.keyboard!.on('keydown', (ev: KeyboardEvent) => {
    ev.stopPropagation();
    const n = nav(ev);
    if (ev.repeat && !['up', 'down', 'left', 'right'].includes(n ?? '')) return;
    key(n, ev);
  });
  const at = (p: Phaser.Input.Pointer) => scene.cameras.main.getWorldPoint(p.x, p.y);
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => { const w = at(p); hover(w.x, w.y); });
  scene.input.on('pointerup', (p: Phaser.Input.Pointer) => { const w = at(p); click(w.x, w.y, p.button); }); // on release: the room under it never sees the press
  fit();
}

export type Nav = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'mute' | 'fullscreen';
/** What a key means in a menu: the arrows and the move keys move, Entrée and Espace choose, Échap and the pause's keys
 *  go back; the sound's and the full screen's keys work everywhere. */
export function nav(ev: KeyboardEvent): Nav | undefined {
  const n = Keys.name(ev), hits = Keys.lookup(Keys.binds, n);
  if (n === 'Enter' || n === 'Space') return 'ok';
  if (hits.some((h) => h.action === 'pause')) return 'back';
  const d = hits.find((h) => h.action === 'move')?.index ?? Keys.DEFAULTS.move[2].indexOf(n);
  if (d >= 0) return (['up', 'left', 'down', 'right'] as const)[d];
  return hits.find((h) => h.action === 'mute' || h.action === 'fullscreen')?.action as Nav | undefined;
}
/** The sound's and the full screen's keys, as in the game. */
export function globals(scene: Phaser.Scene, n: Nav | undefined) {
  if (n === 'mute') Settings.set(scene.game, { mute: !Settings.data.mute });
  if (n === 'fullscreen') Settings.fullscreen();
}

/** Words at (x, y), their top left (`origin` 0.5: their top middle, 1: their top right); `face` 'fell' (roman), 'italic
 *  fellI' (the HUD's italic) or 'cinzel'. */
export function say(scene: Phaser.Scene, s: string, size: number, color: string, x: number, y: number, { face = 'fell', origin = 0, op = 1, spacing = 0 } = {}) {
  return scene.add.image(Math.round(x), Math.round(y), words(scene, [s], size, color, op, spacing, face)).setOrigin(origin, 0);
}
/** A word's ink width (its texture less words()' margins). */
export const inkW = (im: Phaser.GameObjects.Image) => im.width - 6;

/** A baked piece, drawn from (x, y) as baked (menu.gen.mjs: the title from its top middle, a drop from its foot, an
 *  ampoule from its left end's middle, a line from its middle, a mouse from its top left). */
export function piece(scene: Phaser.Scene, name: string, x: number, y: number) {
  const f = FRAMES[name];
  return scene.add.image(Math.round(x) + f[4], Math.round(y) + f[5], 'menu', name).setOrigin(0);
}

/** A key cap (a dark slab in a worn silver rim, its name in bone; a red rim when it clashes, a bright one in hand),
 *  or a mouse button (the mouse, its button lit, and its words). Returns its width. */
export function cap(scene: Phaser.Scene, b: string, x: number, y: number, { clash = false, lit = false } = {}) {
  const m = /^Mouse([0-2])$/.exec(b);
  if (m) {
    piece(scene, `mouse${'lmr'[Number(m[1])]}`, x + 1, y + 2);
    const t = say(scene, Keys.label(b), 13, lit ? BONE : DIM, x + 11, y - 1, { face: 'italic fellI' });
    if (clash || lit) scene.add.rectangle(x + 11, y + 14, inkW(t), 1, clash ? 0x991e19 : 0xd6caa9).setOrigin(0);
    return 12 + inkW(t);
  }
  return keycap(scene, Keys.label(b), x, y, { clash, lit });
}
export function keycap(scene: Phaser.Scene, s: string, x: number, y: number, { clash = false, lit = false } = {}) {
  const t = words(scene, [s], 13, LISTEN, 1, 0, 'fell'), w = Math.max(14, scene.textures.get(t).getSourceImage().width), h = 15;
  scene.add.graphics().fillStyle(clash ? 0x991e19 : lit ? 0xd6caa9 : 0x7d725d).fillRoundedRect(x, y, w, h, 2.5).fillStyle(0x1f1a15).fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 1.5);
  scene.add.image(x + Math.round(w / 2), y - 1, t).setOrigin(0.5, 0);
  return w;
}
/** A slot of bindings: its keys side by side (a move slot as one cap: « Z Q S D »). Returns the width. */
export function slot(scene: Phaser.Scene, keys: string[], x: number, y: number, o: { clash?: (b: string) => boolean; lit?: boolean } = {}) {
  if (keys.length > 1) return keycap(scene, Keys.slotLabel(keys), x, y, { clash: keys.some((b) => o.clash?.(b)), lit: o.lit });
  return cap(scene, keys[0], x, y, { clash: o.clash?.(keys[0]), lit: o.lit });
}

/** The row in hand: a dark blood band fading at its ends, a drop at its left. */
export function band(scene: Phaser.Scene, x0: number, x1: number, y0: number, y1: number) {
  const g = scene.add.graphics(), c = 0x330508, a = 0.55, f = (x1 - x0) * 0.2;
  g.fillGradientStyle(c, c, c, c, 0, a, 0, a).fillRect(x0, y0, f, y1 - y0);
  g.fillStyle(c, a).fillRect(x0 + f, y0, x1 - x0 - 2 * f, y1 - y0);
  g.fillGradientStyle(c, c, c, c, a, 0, a, 0).fillRect(x1 - f, y0, f, y1 - y0);
  piece(scene, 'drop', x0 + 8, y0 + (y1 - y0) / 2 + 5);
}

/** A soft patch of `color` (`k` at its middle, gone at its rim), round (cx, cy), radii rx, ry: the mockups' scrims. */
export function patch(scene: Phaser.Scene, cx: number, cy: number, rx: number, ry: number, k: number, color = '#000000', inner = 0.4) {
  const key = `menu-patch:${color}:${inner}`;
  if (!scene.textures.exists(key)) {
    const t = scene.textures.createCanvas(key, 64, 64)!, g = t.context, r = g.createRadialGradient(32, 32, 32 * inner, 32, 32, 32);
    r.addColorStop(0, color); r.addColorStop(1, `${color}00`);
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t.refresh();
  }
  return scene.add.image(cx, cy, key).setDisplaySize(2 * rx, 2 * ry).setAlpha(k);
}
/** The whole view darkened: `k`, and up to `edge` more toward its edges (round (cx, cy)); as the mockups' dim(). A
 *  patch() laid over it darkens on top of it (the mockups keep the darkest of the two). */
export function dim(scene: Phaser.Scene, k: number, edge = 0, cx = W / 2, cy = H / 2) {
  scene.add.rectangle(-W, -H, 3 * W, 3 * H, 0, k).setOrigin(0);
  if (edge > 0) { // the edge: clear within half the view's half-size round (cx, cy), all black from 1.3 times it
    const key = 'menu-edge';
    if (!scene.textures.exists(key)) {
      const t = scene.textures.createCanvas(key, 128, 128)!, g = t.context, r = g.createRadialGradient(64, 64, 12.8, 64, 64, 33.3); // its half-size: 25.6 texels
      r.addColorStop(0, '#00000000'); r.addColorStop(1, '#000000');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      t.refresh();
    }
    scene.add.image(cx, cy, key).setDisplaySize(W * 2.5, H * 2.5).setAlpha(Math.min(1, edge / (1 - k)));
  }
}

/** Keys and their words along the bottom, from x: [[key, word], ...]. */
export function footer(scene: Phaser.Scene, pairs: [string, string][], x: number, y: number) {
  for (const [k, w] of pairs) {
    x += keycap(scene, k, x, y) + 5;
    x += inkW(say(scene, w, 15, DIM, x, y - 1)) + 18;
  }
}

/** Menu px (x, y) inside [x0, y0, x1, y1]. */
export const inside = (x: number, y: number, r: number[]) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
