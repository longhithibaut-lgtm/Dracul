import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Font from './font.ts';
import { blot } from './enemy.ts';
import { GIFTS, SLOTS, SLOT_ICONS, type GiftId } from './gifts.ts';

// How the Rat house shows: Vesna la Grise's gift waiting on the medallion, the gift cards, the rats of Nuée and the
// plague of Griffes pestilentes. Gameplay decides what happens; this file only draws it.

type Scene = Phaser.Scene;
type Sprite = Phaser.Physics.Arcade.Sprite;
type Put = (x: number, y: number, c: number, a?: number) => void;

// Vesna's silver greys over the vampires' blood and night (docs/art.md); plague green-greys.
const SILVER = 0xd4cdd2, GREY = 0x948a91, DARK = 0x574e57, MAUVE = 0x8a6f8f;
const VOID = 0x0b0710, NIGHT = 0x1c1029, DUSK = 0x2e1838, BONE = 0xe8dcc8, BONE_DIM = 0xb7a58f;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a];
const PLAGUE = [0xc2cc8f, 0x86935e, 0x4f5a3a];
const UI = 20_000; // over the room and its vignette
const ICON = { S: SILVER, s: GREY, r: BLOOD[2], d: BLOOD[1] };

const grid = (put: Put, x: number, y: number, rows: string[], pal: Record<string, number>) =>
  rows.forEach((r, j) => [...r].forEach((k, i) => pal[k] !== undefined && put(x + i, y + j, pal[k])));

/** A canvas texture painted once, pixel by pixel, with `frames` [name, x, y, w, h] cut from it. */
function bake(scene: Scene, key: string, w: number, h: number, paint: (put: Put) => void, frames: [string, number, number, number, number][] = []) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!;
  paint((x, y, c, a = 1) => {
    t.context.fillStyle = `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${a})`;
    t.context.fillRect(x, y, 1, 1);
  });
  for (const [name, x, y, fw, fh] of frames) t.add(name, 0, x, y, fw, fh);
  t.refresh();
  return key;
}

/** Calls draw(seconds) every frame until the returned function is called (or the scene shuts down), which also
 *  destroys `objs`. */
function loop(scene: Scene, draw: (t: number) => void, objs: Phaser.GameObjects.GameObject[]) {
  const born = scene.time.now, step = () => draw((scene.time.now - born) / 1000);
  const stop = () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, step);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, stop);
    objs.forEach((o) => o.destroy());
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  step();
  return stop;
}

/** Pixels (`size` square) flung from (x, y): they rise or fly out, then fade. */
function motes(scene: Scene, x: number, y: number, n: number, colors: readonly number[], depth: number, spread: number, rise: number, size = 1) {
  for (let i = 0; i < n; i++) {
    const p = scene.add.rectangle(x, y, size, size, colors[i % colors.length]).setDepth(depth);
    scene.tweens.add({ targets: p, x: x + Phaser.Math.Between(-spread, spread), y: y - Phaser.Math.Between(rise / 2, rise) + Phaser.Math.Between(-spread, spread) / 2,
      alpha: 0, duration: Phaser.Math.Between(400, 800), ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

// ---------- the gift on the medallion ----------

// Vesna's sigil, a rat in profile: S silver, s grey, k dark grey (feet), n mauve (ear, nose), e blood (eye).
const SIGIL = [
  '..ss.........',
  '.snSs........',
  '.SSSSSs......',
  'SeSSSSSSSs...',
  'nSSSSSSSSSs..',
  '.ssSSSSSSSSs.',
  '...k.k..k.ks.',
  '...........s.',
  '........sss..',
];

/** A coin of the Rat house, 21 px: dark rim, silver ring, blood field, the rat; lit from the top left. */
function paintCoin(put: Put) {
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const d = Math.hypot(x - 10, y - 10), lit = x + y < 20;
      if (d < 10.4) put(x, y, d > 9.4 ? VOID : d > 8.1 ? (lit ? SILVER : GREY) : lit ? BLOOD[1] : BLOOD[0]);
    }
  [[5, 3], [4, 4], [3, 5]].forEach(([x, y]) => put(x, y, BONE)); // glint on the ring
  grid(put, 4, 6, SIGIL, { S: SILVER, s: GREY, k: DARK, n: MAUVE, e: BLOOD[2] });
}
const coin = (scene: Scene) => bake(scene, 'rat-coin', 21, 21, paintCoin);

export type Pickup = { x: number; y: number; ready: boolean; take(): void };

/** Vesna's gift: her coin climbs out of the medallion's drain at floor point (x, y) and floats over a pool of red
 *  light, shedding silver and red motes. ready once it has risen. */
export function pickup(scene: Scene, x: number, y: number): Pickup {
  const c = scene.add.image(x, y, coin(scene)).setOrigin(0.5, 1).setDepth(y).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  const glow = scene.add.graphics().setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD);
  const shadow = scene.add.graphics().setDepth(1.6);
  const p: Pickup = { x, y, ready: false, take };
  let moteAt = 0;
  motes(scene, x, y, 14, [GREY, DARK, SILVER], y + 1, 10, 6); // the dust of rats scattering from the drain
  const stop = loop(scene, (t) => {
    const k = Math.min(1, t / 0.5), lift = Math.round(9 * Phaser.Math.Easing.Back.Out(k)) + 2 + Math.round(Math.sin(t * 3.3));
    if (t > 0.08) c.clearTint();
    c.setY(y - lift);
    p.ready = k >= 1;
    shadow.clear().fillStyle(VOID, 0.5);
    blot(x, y, 4 - lift / 6, 1, (bx, by, w) => shadow.fillRect(bx, by, w, 1));
    // Stepped red pool, breathing a pixel in and out.
    const b = Math.floor(t * 2.5) % 2;
    glow.clear();
    for (const [rx, ry, a] of [[15, 6, 0.14], [10, 4, 0.2], [5, 2, 0.3]]) {
      glow.fillStyle(BLOOD[2], a * k);
      blot(x, y, rx + b, ry, (bx, by, w) => glow.fillRect(bx, by, w, 1));
    }
    if (t > moteAt) {
      moteAt = t + 0.12;
      motes(scene, x + Phaser.Math.Between(-7, 7), y - lift - Phaser.Math.Between(2, 14), 1, [Math.random() < 0.5 ? SILVER : BLOOD[2]], y + 1, 2, 12);
    }
  }, [c, glow, shadow]);

  function take() {
    p.ready = false;
    stop();
    motes(scene, x, y - 10, 18, [SILVER, BLOOD[2], BONE], UI - 1, 14, 18);
  }
  return p;
}

// ---------- the gift cards ----------

const CARD = { w: 128, h: 82, gap: 12 };
const TEXT_W = CARD.w - 16;

/** One card, normal or `hot` (hovered, chosen), at x offset `ox` of its texture: a frame of silver over a blood
 *  trim, the key that picks it, the slot's icon and name on a blood band, the gift's name and what it does. */
function paintCard(put: Put, ox: number, id: GiftId, key: number, hot: boolean) {
  const { w: W, h: H } = CARD, g = GIFTS[id], at: Put = (x, y, c) => put(ox + x, y, c);
  const rim = hot ? BONE : SILVER, shade = hot ? SILVER : GREY, trim = hot ? BLOOD[2] : BLOOD[1];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue; // cut corners
      at(x, y, e === 0 ? VOID : e === 1 ? (x === 1 || y === 1 ? rim : shade) : e === 2 || (y === 18 && e > 2) ? trim : y < 18 ? BLOOD[0] : NIGHT);
    }
  // Key badge.
  for (let y = 5; y < 16; y++) for (let x = 5; x < 14; x++) at(x, y, x === 5 || x === 13 || y === 5 || y === 15 ? shade : VOID);
  const k = String(key);
  Font.draw(k, 5 + Math.floor((9 - Font.width(k)) / 2), 5, (x, y) => at(x, y, BONE));
  // Slot: icon and name, centred on the band.
  const slot = SLOTS[g.slot].toUpperCase(), sx = Math.floor((W - 11 - Font.width(slot)) / 2);
  grid(at, sx, 6, SLOT_ICONS[g.slot], ICON);
  Font.draw(slot, sx + 11, 4, (x, y) => at(x, y, SILVER));
  // Name, a rule with a silver diamond, then the effect.
  Font.draw(g.name, Math.floor((W - Font.width(g.name)) / 2), 21, (x, y) => at(x, y, BONE));
  for (let x = 16; x < W - 16; x++) at(x, 35, trim);
  grid(at, W / 2 - 2, 34, ['.#.', '###', '.#.'], { '#': rim });
  Font.wrap(g.text, TEXT_W).forEach((l, i) => Font.draw(l, Math.floor((W - Font.width(l)) / 2), 39 + i * 12, (x, y) => at(x, y, BONE_DIM)));
}
const card = (scene: Scene, id: GiftId, key: number) =>
  bake(scene, `rat-card:${id}:${key}`, CARD.w * 2, CARD.h, (put) => [false, true].forEach((hot, i) => paintCard(put, i * CARD.w, id, key, hot)),
    [['n', 0, 0, CARD.w, CARD.h], ['h', CARD.w, 0, CARD.w, CARD.h]]);

export type Cards = {
  at(x: number, y: number): number; // the card under a point, or -1
  hover(i: number): void;
  choose(i: number, done: () => void): boolean; // false when it cannot be chosen (yet)
};

/** The choice of gifts over the dimmed room: Vesna's coin, a heading, one card per gift sliding in, a hint. */
export function cards(scene: Scene, ids: GiftId[]): Cards {
  const born = scene.time.now, n = ids.length, top = 56;
  const dim = scene.add.rectangle(0, 0, T.width, T.height, VOID, 0.78).setOrigin(0).setDepth(UI);
  const crest = scene.add.image(T.width / 2, top, coin(scene)).setOrigin(0.5, 0).setDepth(UI + 1);
  const head = scene.add.image(T.width / 2, top + 22, Font.bake(scene, ['Don de la Maison du Rat'], SILVER, VOID)).setOrigin(0.5, 0).setDepth(UI + 1);
  const x0 = Math.round((T.width - n * CARD.w - (n - 1) * CARD.gap) / 2), y = top + 44;
  const imgs = ids.map((id, i) => scene.add.image(x0 + i * (CARD.w + CARD.gap), y, card(scene, id, i + 1), 'n').setOrigin(0).setDepth(UI + 2));
  const keys = ids.map((_, i) => i + 1).join(', ');
  const hint = scene.add.image(T.width / 2, y + CARD.h + 6, Font.bake(scene, [`${keys} ou clic`], GREY)).setOrigin(0.5, 0).setDepth(UI + 1);
  const all = [dim, crest, head, ...imgs, hint];
  scene.tweens.add({ targets: dim, alpha: { from: 0, to: dim.alpha }, duration: 160 });
  scene.tweens.add({ targets: [crest, head, hint], alpha: { from: 0, to: 1 }, duration: 160 });
  imgs.forEach((im, i) => scene.tweens.add({ targets: im, y: { from: y + 10, to: y }, alpha: { from: 0, to: 1 }, delay: 60 * i, duration: 180, ease: 'Cubic.easeOut' }));
  const ready = () => scene.time.now - born > 60 * n + 200; // a click that opened nothing yet never picks a card
  let hot = -1, picked = false;
  const show = (i: number) => imgs.forEach((im, k) => im.setFrame(k === i ? 'h' : 'n').setY(y - (k === i ? 3 : 0)));
  return {
    at: (px, py) => imgs.findIndex((im) => px >= im.x && px < im.x + CARD.w && py >= y - 3 && py < y + CARD.h),
    hover(i) {
      if (picked || !ready() || i === hot) return;
      show((hot = i));
    },
    choose(i, done) {
      if (picked || !ready() || !imgs[i]) return false;
      picked = true;
      show(i);
      const im = imgs[i].setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.time.delayedCall(70, () => im.clearTint());
      scene.tweens.add({ targets: imgs.filter((o) => o !== im), alpha: 0, duration: 150 });
      scene.tweens.add({ targets: im, y: y - 8, delay: 300, duration: 260, ease: 'Cubic.easeIn' });
      scene.tweens.add({ targets: [dim, crest, head, hint, im], alpha: 0, delay: 360, duration: 200, onComplete: () => {
        all.forEach((o) => o.destroy());
        done();
      } });
      return true;
    },
  };
}

// ---------- Nuée: the rats ----------

// Two strides, facing right, outlined so they read on the moonlit floor too: o outline, L grey back, g dark belly,
// k feet, e eye, n mauve (nose, tail), x ground shadow.
const RAT = [[
  '......oo....',
  '...oooLLo...',
  '..oLLLLLLoo.',
  'nnoLLLLLLLeo',
  '..ogggggggon',
  '...ok.o.ko..',
  '..xxxxxxxx..',
], [
  '......oo....',
  '...oooLLo...',
  '..oLLLLLLoo.',
  '.noLLLLLLLeo',
  'n.ogggggggon',
  '...ko..ok...',
  '..xxxxxxxx..',
]];

/** A rat of the swarm at floor point (x, y). */
export function rat(scene: Scene, x: number, y: number) {
  const key = bake(scene, 'rat', 24, 7, (put) => RAT.forEach((rows, f) => rows.forEach((r, j) => [...r].forEach((k, i) => {
    if (k === 'x') put(f * 12 + i, j, VOID, 0.45);
    else if (k !== '.') put(f * 12 + i, j, { o: VOID, L: GREY, g: DARK, k: DUSK, e: BLOOD[2], n: MAUVE }[k]!);
  }))), [['0', 0, 0, 12, 7], ['1', 12, 0, 12, 7]]);
  return scene.add.sprite(x, y, key, '0').setOrigin(0.5, 6 / 7);
}

/** The rat runs along `angle`: legs pattering, facing where it goes, sorted like the characters (11 px above feet). */
export function scurry(r: Phaser.GameObjects.Sprite, angle: number, now: number) {
  r.setFrame(String(Math.floor(now / 50) % 2)).setFlipX(Math.cos(angle) < 0).setDepth(r.y - 11);
}

/** The rat is gone: a puff of grey. */
export function vanish(scene: Scene, r: Phaser.GameObjects.Sprite) {
  motes(scene, r.x, r.y - 2, 5, [GREY, SILVER, DARK], r.y, 4, 5);
  r.destroy();
}

// ---------- Griffes pestilentes: the plague ----------

/** An infected enemy: a sickly cast that throbs, and wisps of plague rising off it. Called every frame while it lasts. */
export function plagued(scene: Scene, e: Sprite, now: number) {
  e.setTint(Math.floor(now / 220) % 2 ? PLAGUE[0] : PLAGUE[1]);
  if (now < (e.getData('miasmaAt') ?? 0)) return;
  e.setData('miasmaAt', now + 90);
  motes(scene, e.x + Phaser.Math.Between(-5, 5), e.y + Phaser.Math.Between(-14, -4), 1, [Math.random() < 0.7 ? PLAGUE[0] : PLAGUE[1]], e.y + 1, 3, 14, 2);
}

/** The plague strikes: its cast lifts in a burst of sick green. */
export function plague(scene: Scene, e: Sprite) {
  e.clearTint();
  motes(scene, e.x, e.y - 2, 14, PLAGUE, e.y + 1, 12, 14);
}
