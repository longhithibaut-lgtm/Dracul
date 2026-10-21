import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Font from './font.ts';
import { blot } from './enemy.ts';
import { GIFTS, ICONS, KINDS, RARITY, cost, kind, replacing, type GiftId } from './gifts.ts';
import { replaced, type Card } from './logic.ts';
import { ZOOM } from './dark.ts';

// How the Rat house shows: Vesna la Grise's gift waiting on the medallion, the gift cards (rarity, pacts), the rats of
// every gift, the hero turned into la Nuée, and la Peste (on enemies, on shards, leaping with Contagion). Gameplay
// decides what happens; this file only draws it.

type Scene = Phaser.Scene;
type Sprite = Phaser.Physics.Arcade.Sprite;
type Put = (x: number, y: number, c: number, a?: number) => void;

// Vesna's silver greys over the vampires' blood and night (docs/art.md); plague green-greys.
const SILVER = 0xd4cdd2, GREY = 0x948a91, DARK = 0x574e57, MAUVE = 0x8a6f8f;
const VOID = 0x0b0710, NIGHT = 0x1c1029, DUSK = 0x2e1838, BONE = 0xe8dcc8, BONE_DIM = 0xb7a58f;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a], GLOW = 0xff4f8b;
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

const CARD = { w: 128, gap: 12 };
const TEXT_W = CARD.w - 16;
type Offer = Card<GiftId>;
/** The lines of a card: what the gift does at its rarity, then, set apart in red, what a pact costs, the rarity an
 *  upgrade raises it to, or the gift `old` it would replace in its slot. */
const lines = (c: Offer, old?: GiftId) => [Font.wrap(GIFTS[c.id].text(c.rank), TEXT_W),
  GIFTS[c.id].pact ? Font.wrap(cost(c.id), TEXT_W) : c.up ? [`Amélioration : ${RARITY[c.rank]}`] : old ? Font.wrap(replacing(old), TEXT_W) : []];
// A card's frame [rim, shade, trim] by rarity: commun silver, rare blood, épique glowing; a pact's is dark blood.
const FRAME = [[SILVER, GREY, BLOOD[1]], [BLOOD[2], BLOOD[1], BLOOD[1]], [GLOW, BLOOD[2], BLOOD[2]]], PACT = [BLOOD[1], BLOOD[0], BLOOD[0]];

/** One card `H` tall, normal or `hot` (hovered, chosen), at x offset `ox` of its texture: a frame in its rarity's
 *  colours over a blood trim, the key that picks it, its slot's icon and name (or talent's) on a blood band, the gift's
 *  name, its rarity if rare or épique, what it does and, set a little apart in red, what it costs, raises or replaces.
 *  A pact's card is darker: no blood on its band, its frame dark red. */
function paintCard(put: Put, ox: number, c: Offer, key: number, hot: boolean, H: number, old?: GiftId) {
  const W = CARD.w, g = GIFTS[c.id], at: Put = (x, y, k) => put(ox + x, y, k), pact = !!g.pact;
  const [r0, s0, t0] = pact ? PACT : FRAME[c.rank];
  const rim = hot ? (pact ? BLOOD[2] : BONE) : r0, shade = hot ? r0 : s0, trim = hot ? BLOOD[2] : t0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue; // cut corners
      at(x, y, e === 0 ? VOID : e === 1 ? (x === 1 || y === 1 ? rim : shade) : e === 2 || (y === 18 && e > 2) ? trim : y < 18 && !pact ? BLOOD[0] : pact ? VOID : NIGHT);
    }
  // Key badge.
  for (let y = 5; y < 16; y++) for (let x = 5; x < 14; x++) at(x, y, x === 5 || x === 13 || y === 5 || y === 15 ? shade : VOID);
  const k = String(key);
  Font.draw(k, 5 + Math.floor((9 - Font.width(k)) / 2), 5, (x, y) => at(x, y, BONE));
  // Kind: icon and name, centred on the band.
  const band = KINDS[kind(c.id)].toUpperCase(), sx = Math.floor((W - 11 - Font.width(band)) / 2);
  grid(at, sx, 6, ICONS[kind(c.id)], ICON);
  Font.draw(band, sx + 11, 4, (x, y) => at(x, y, pact ? BLOOD[2] : SILVER));
  // Name, a rule with a diamond (or the rarity, in its colour), the effect, then the red line.
  Font.draw(g.name, Math.floor((W - Font.width(g.name)) / 2), 21, (x, y) => at(x, y, BONE));
  const rank = c.rank && !pact ? RARITY[c.rank].toUpperCase() : '', rw = Font.width(rank);
  for (let x = 16; x < W - 16; x++) if (!rank || Math.abs(x - W / 2) > rw / 2 + 3) at(x, 37, trim);
  if (rank) Font.draw(rank, Math.floor((W - rw) / 2), 32, (x, y) => at(x, y, FRAME[c.rank][0]));
  else grid(at, W / 2 - 2, 36, ['.#.', '###', '.#.'], { '#': rim });
  const [text, foot] = lines(c, old);
  [...text, ...foot].forEach((l, i) => Font.draw(l, Math.floor((W - Font.width(l)) / 2), 42 + i * Font.LINE + (i < text.length ? 0 : 3),
    (x, y) => at(x, y, i < text.length ? BONE_DIM : BLOOD[2])));
}
const card = (scene: Scene, c: Offer, key: number, h: number, old?: GiftId) =>
  bake(scene, `rat-card:${c.id}:${c.rank}:${c.up}:${key}:${h}:${old}`, CARD.w * 2, h, (put) => [false, true].forEach((hot, i) => paintCard(put, i * CARD.w, c, key, hot, h, old)),
    [['n', 0, 0, CARD.w, h], ['h', CARD.w, 0, CARD.w, h]]);

export type Cards = {
  at(x: number, y: number): number; // the card under a point, or -1
  hover(i: number): void;
  choose(i: number, done: () => void): boolean; // false when it cannot be chosen (yet)
};

/** The choice of gifts `ids` (cards of an offer) over the dimmed room, the hero holding `held`: Vesna's coin, a
 *  heading, one card per gift sliding in, all as tall as the fullest, a hint. Laid out on the view, live: side by side, or stacked when it is
 *  too narrow for that (an upright phone). */
export function cards(scene: Scene, ids: Offer[], held: readonly GiftId[]): Cards {
  const born = scene.time.now, n = ids.length;
  const olds = ids.map((c) => (c.up ? undefined : replaced(GIFTS, held, c.id)));
  // 85 with three lines of text, like most.
  const h = 49 + Math.max(...ids.map((c, i) => { const [t, f] = lines(c, olds[i]); return (t.length + f.length) * Font.LINE + (f.length ? 3 : 0); }));
  const dim = scene.add.rectangle(0, 0, T.width, T.height, VOID, 0.78).setOrigin(0).setDepth(UI);
  const crest = scene.add.image(0, 0, coin(scene)).setOrigin(0.5, 0).setDepth(UI + 1);
  const head = scene.add.image(0, 0, Font.bake(scene, ['Don de la Maison du Rat'], SILVER, VOID)).setOrigin(0.5, 0).setDepth(UI + 1);
  const imgs = ids.map((c, i) => scene.add.image(0, 0, card(scene, c, i + 1, h, olds[i]), 'n').setOrigin(0).setDepth(UI + 2));
  const keys = matchMedia('(pointer: coarse)').matches ? 'touche une carte' : `${ids.map((_, i) => i + 1).join(', ')} ou clic`;
  const hint = scene.add.image(0, 0, Font.bake(scene, [keys], GREY)).setOrigin(0.5, 0).setDepth(UI + 1);
  const all = [dim, crest, head, ...imgs, hint];
  all.forEach((o) => o.setScrollFactor(0)); // on the screen, wherever the camera is in a tall room
  let hot = -1, picked = false, xs: number[] = [], ys: number[] = [];
  const slide = ids.map(() => 10); // each card rises this much into place as it comes in
  const place = () => {
    const W = scene.scale.width / ZOOM, H = scene.scale.height / ZOOM, row = n * CARD.w + (n - 1) * CARD.gap, stack = W < row + 16, gap = 6;
    // Side by side as high as on a 16:9 screen, the block kept in the middle of a taller view; stacked, centred.
    const top = stack ? Math.max(4, Math.round((H - 57 - n * h - (n - 1) * gap) / 2)) : 56 + Math.round((H - T.height) / 2);
    xs = ids.map((_, i) => (stack ? Math.round((W - CARD.w) / 2) : Math.round((W - row) / 2) + i * (CARD.w + CARD.gap)));
    ys = ids.map((_, i) => top + 44 + (stack ? i * (h + gap) : 0));
    dim.setSize(W, H);
    crest.setPosition(W / 2, top);
    head.setPosition(W / 2, top + 22);
    hint.setPosition(W / 2, ys[n - 1] + h + 6);
    if (!picked) imgs.forEach((im, i) => im.setPosition(xs[i], ys[i] + slide[i] - (i === hot ? 3 : 0)));
  };
  place();
  const off = () => scene.scale.off(Phaser.Scale.Events.RESIZE, place);
  scene.scale.on(Phaser.Scale.Events.RESIZE, place);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  scene.tweens.add({ targets: dim, alpha: { from: 0, to: dim.alpha }, duration: 160 });
  scene.tweens.add({ targets: [crest, head, hint], alpha: { from: 0, to: 1 }, duration: 160 });
  imgs.forEach((im, i) => {
    scene.tweens.add({ targets: im, alpha: { from: 0, to: 1 }, delay: 60 * i, duration: 180, ease: 'Cubic.easeOut' });
    scene.tweens.addCounter({ from: 10, to: 0, delay: 60 * i, duration: 180, ease: 'Cubic.easeOut', onUpdate: (tw) => { slide[i] = tw.getValue() ?? 0; place(); } });
  });
  const ready = () => scene.time.now - born > 60 * n + 200; // a click that opened nothing yet never picks a card
  const show = (i: number) => {
    hot = i;
    imgs.forEach((im, k) => im.setFrame(k === i ? 'h' : 'n'));
    place();
  };
  return {
    at: (px, py) => imgs.findIndex((_, i) => px >= xs[i] && px < xs[i] + CARD.w && py >= ys[i] - 3 && py < ys[i] + h),
    hover(i) {
      if (picked || !ready() || i === hot) return;
      show(i);
    },
    choose(i, done) {
      if (picked || !ready() || !imgs[i]) return false;
      show(i);
      picked = true;
      const im = imgs[i].setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.time.delayedCall(70, () => im.clearTint());
      scene.tweens.add({ targets: imgs.filter((o) => o !== im), alpha: 0, duration: 150 });
      scene.tweens.add({ targets: im, y: ys[i] - 8, delay: 300, duration: 260, ease: 'Cubic.easeIn' });
      scene.tweens.add({ targets: [dim, crest, head, hint, im], alpha: 0, delay: 360, duration: 200, onComplete: () => {
        off();
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

// ---------- la Peste ----------

/** Éclats pestilents: a shard in flight (its floor point; drawn 11 px above it, see Fx.shard) sheds wisps of plague,
 *  over it, until it is spent. */
export function plagueShard(scene: Scene, b: Phaser.GameObjects.Zone) {
  b.once(Phaser.GameObjects.Events.DESTROY, loop(scene, () =>
    motes(scene, b.x, b.y - 11, 1, [Math.random() < 0.6 ? PLAGUE[0] : PLAGUE[1]], b.y + 4, 3, 8, 2), []));
}

/** Contagion: a clot of plague leaps in an arc from floor point (x, y), where a sick enemy died, onto `e`, and bursts. */
export function leap(scene: Scene, x: number, y: number, e: Sprite) {
  const blob = scene.add.rectangle(x - 1, y - 7, 3, 3, PLAGUE[0]).setOrigin(0).setDepth(9_000); // over the characters
  scene.tweens.addCounter({ from: 0, to: 1, duration: 320, onUpdate: (tw) => {
    const k = tw.getValue() ?? 0;
    blob.setPosition(Math.round(x + (e.x - x) * k) - 1, Math.round(y + (e.y - y) * k - 6 - Math.sin(k * Math.PI) * 16) - 1);
    motes(scene, blob.x + 1, blob.y + 1, 1, [Math.random() < 0.5 ? PLAGUE[0] : PLAGUE[1]], blob.depth - 1, 2, 4, 2);
  }, onComplete: () => {
    blob.destroy();
    motes(scene, e.x, e.y - 6, 8, PLAGUE, e.y + 1, 6, 8);
  } });
}

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

// ---------- la Nuée: the hero become a swarm ----------

export type Swarm = { move(x: number, y: number, now: number): void; end(): void };
const SWARM = 8_900; // over the lit world, under the effects (dark.ts)

/** La Nuée: the hero, at floor point (x, y), bursts into `n` rats that mill round where he goes (move(), every frame),
 *  `radius` across at most, over a stepped pool of shadow that makes them one mass, shedding grey dust; end() puffs
 *  them back into one body. Drawn unlit over the room, like the effects (dark.ts), so his own lantern does not bleach
 *  them. */
export function swarm(scene: Scene, x: number, y: number, n: number, radius: number): Swarm {
  motes(scene, x, y - 8, 24, [GREY, SILVER, DARK, BLOOD[1]], y + 1, 14, 16);
  // Each rat runs its own loop round the pack's middle, at its own distance and pace, half of them the other way.
  const pack = Array.from({ length: n }, (_, i) => ({ s: rat(scene, x, y), a: (i / n) * 2 * Math.PI, r: 4 + ((i * 7) % (radius + 3)), w: (i % 2 ? 1 : -1) * (3 + (i % 4)) }));
  const shade = scene.add.graphics().setDepth(SWARM - 1);
  let dustAt = 0, at = { x, y };
  return {
    move(x, y, now) {
      at = { x, y };
      shade.clear();
      for (const [k, a] of [[1.4, 0.35], [1, 0.45]]) {
        shade.fillStyle(VOID, a);
        blot(x, y + 2, radius * k, radius * k * 0.6, (bx, by, w) => shade.fillRect(bx, by, w, 1));
      }
      for (const p of pack) {
        const a = p.a + (now / 1000) * p.w, nx = x + Math.cos(a) * p.r, ny = y + Math.sin(a) * p.r * 0.7;
        const heading = Math.atan2(ny - p.s.y, nx - p.s.x);
        p.s.setPosition(nx, ny);
        scurry(p.s, heading, now);
        p.s.setDepth(SWARM + ny / 1000);
      }
      if (now < dustAt) return;
      dustAt = now + 60;
      motes(scene, x + Phaser.Math.Between(-radius, radius), y + Phaser.Math.Between(-4, 4), 1, [GREY, DARK], y + 1, 3, 6);
    },
    end() {
      shade.destroy();
      pack.forEach((p) => vanish(scene, p.s));
      motes(scene, at.x, at.y - 8, 18, [GREY, SILVER, DARK], at.y + 1, 10, 14);
    },
  };
}

/** The swarm bites an enemy at floor point (x, y): a spray of blood. */
export function gnawed(scene: Scene, x: number, y: number) {
  motes(scene, x, y - 6, 6, BLOOD, y + 1, 6, 8);
}
