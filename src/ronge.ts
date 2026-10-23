import Phaser from 'phaser';
import * as Font from './font.ts';
import { ZOOM, prelit } from './dark.ts';
import { FW, FH, SOLE, FRAMES } from './ronge.data.ts';
import sheet from './ronge.png';
import { WARE_TEXT, type Ware } from './shop.ts';

// How le Rongé shows (docs/lore.md): crouched by the refuge's basin, his sheet rendered offline already lit
// (tools/art/ronge.gen.mjs), drawn at half scale like the foes; and his wares, a panel of cards over the dimmed refuge in
// the gift cards' style (frame, key badge, blood band). Gameplay (RoomScene, shop.ts) decides; this file only draws.

type Scene = Phaser.Scene;
type Put = (x: number, y: number, c: number) => void;
const VOID = 0x0b0710, NIGHT = 0x1c1029, BONE = 0xe8dcc8, BONE_DIM = 0xb7a58f, SILVER = 0xd4cdd2, GREY = 0x948a91, STONE = 0x5a4468;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a];
const UI = 20_000; // over the room and its vignette, unlit (dark.ts)

export function preload(scene: Scene) {
  if (!scene.textures.exists('ronge')) scene.load.image('ronge', sheet);
}

export type Pose = 'idle' | 'look' | 'beast';
/** Him at floor point (x, y), facing down-left (toward the basin). show(): crouched breathing, reared with his head
 *  raised (the hero near), or gone beast, heaving. */
export function create(scene: Scene, x: number, y: number) {
  const tex = scene.textures.get('ronge');
  FRAMES.forEach((n, i) => tex.has(n) || tex.add(n, 0, i * FW, 0, FW, FH));
  const s = scene.add.image(x, y, 'ronge', 'idle0').setOrigin(0.5, SOLE / FH).setScale(0.5).setFlipX(true).setDepth(y).setBlendMode(prelit(scene));
  return {
    show(pose: Pose, now: number) {
      s.setFrame(pose === 'beast' ? `beast${Math.floor(now / 140) % 2}` : `${pose}${Math.floor(now / (pose === 'look' ? 260 : 340)) % 4}`);
    },
  };
}

/** A canvas texture painted once, pixel by pixel. */
function bake(scene: Scene, key: string, w: number, h: number, paint: (put: Put) => void) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!;
  paint((x, y, c) => {
    t.context.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    t.context.fillRect(x, y, 1, 1);
  });
  t.refresh();
  return key;
}

/** A ware on his panel: its price for the next rank (undefined: sold out), ranks owned and sold, affordable or not. */
export type Offer = { ware: Ware; price?: number; owned: number; ranks: number; afford: boolean };
const CARD = { w: 112, gap: 10 }, TEXT_W = CARD.w - 14;
const foot = (o: Offer) => (o.price === undefined ? (o.ware === 'bite' ? 'Apprise' : 'Tout acheté') : `${o.price} sang`);

/** One card `H` tall, `hot` (hovered) or not: a frame over a blood trim, its key, the ware's name on a blood band, what
 *  it does, its ranks, and its price in red (dim when the basin holds too little). */
function paint(put: Put, o: Offer, key: number, hot: boolean, H: number) {
  const W = CARD.w, rim = hot ? BONE : o.price !== undefined && o.afford ? SILVER : STONE, shade = hot ? SILVER : GREY;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue; // cut corners
      put(x, y, e === 0 ? VOID : e === 1 ? (x === 1 || y === 1 ? rim : shade) : e === 2 || (y === 18 && e > 2) ? BLOOD[1] : y < 18 ? BLOOD[0] : NIGHT);
    }
  for (let y = 5; y < 16; y++) for (let x = 5; x < 14; x++) put(x, y, x === 5 || x === 13 || y === 5 || y === 15 ? shade : VOID);
  Font.draw(String(key), 5 + Math.floor((9 - Font.width(String(key))) / 2), 5, (x, y) => put(x, y, BONE));
  const { name, text } = WARE_TEXT[o.ware];
  Font.draw(name, 16 + Math.floor((W - 18 - Font.width(name)) / 2), 4, (x, y) => put(x, y, BONE));
  const lines = Font.wrap(text, TEXT_W);
  lines.forEach((l, i) => Font.draw(l, Math.floor((W - Font.width(l)) / 2), 22 + i * Font.LINE, (x, y) => put(x, y, BONE_DIM)));
  const rank = o.ranks > 1 ? `Rang ${o.owned} / ${o.ranks}` : '', f = foot(o);
  if (rank) Font.draw(rank, Math.floor((W - Font.width(rank)) / 2), H - 28, (x, y) => put(x, y, GREY));
  for (let x = 16; x < W - 16; x++) put(x, H - 16, BLOOD[1]);
  Font.draw(f, Math.floor((W - Font.width(f)) / 2), H - 14, (x, y) => put(x, y, o.price === undefined ? GREY : o.afford ? BLOOD[2] : BLOOD[0]));
}

export type Counter = {
  at(x: number, y: number): number; // the card under a point (native px of the view), or -1
  hover(i: number): void;
  set(offers: Offer[], banked: number, line: string): void; // after a sale, or a word from him
  close(): void;
};

/** His wares `offers` over the dimmed refuge: his name, what he says (`line`), a card each, the blood in the basin, the
 *  keys. Pinned to the view, laid out live: side by side, or stacked on a view too narrow (an upright phone). */
export function counter(scene: Scene, offers: Offer[], banked: number, line: string): Counter {
  const dim = scene.add.rectangle(0, 0, 10, 10, VOID, 0.8).setOrigin(0).setDepth(UI);
  const head = scene.add.image(0, 0, Font.bake(scene, ['LE RONGÉ'], SILVER, VOID, 2)).setOrigin(0.5, 0).setDepth(UI + 1);
  const said = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0).setDepth(UI + 1);
  const bank = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0).setDepth(UI + 1);
  const keys = matchMedia('(pointer: coarse)').matches ? 'touche une carte' : '1, 2, 3 ou clic : acheter ; Échap ou F : partir';
  const hint = scene.add.image(0, 0, Font.bake(scene, [keys], GREY)).setOrigin(0.5, 0).setDepth(UI + 1);
  let cards: Phaser.GameObjects.Image[] = [], xs: number[] = [], ys: number[] = [], hot = -1, h = 0, now = offers;
  const all = () => [dim, head, said, bank, hint, ...cards];
  const place = () => {
    const W = scene.scale.width / ZOOM, H = scene.scale.height / ZOOM, n = cards.length, row = n * CARD.w + (n - 1) * CARD.gap, stack = W < row + 16;
    const top = Math.max(4, Math.round((H - 50 - (stack ? n * (h + 4) : h) - 30) / 2));
    xs = cards.map((_, i) => (stack ? Math.round((W - CARD.w) / 2) : Math.round((W - row) / 2) + i * (CARD.w + CARD.gap)));
    ys = cards.map((_, i) => top + 40 + (stack ? i * (h + 4) : 0));
    dim.setSize(W, H);
    head.setPosition(W / 2, top);
    said.setPosition(W / 2, top + 16);
    cards.forEach((c, i) => c.setPosition(xs[i], ys[i] - (i === hot ? 3 : 0)));
    const end = ys[n - 1] + h + 6;
    bank.setPosition(W / 2, end);
    hint.setPosition(W / 2, end + 13);
  };
  const draw = () => {
    cards.forEach((c) => c.destroy());
    h = 62 + Math.max(...now.map((o) => Font.wrap(WARE_TEXT[o.ware].text, TEXT_W).length)) * Font.LINE;
    cards = now.map((o, i) => scene.add.image(0, 0, bake(scene, `ronge-card:${JSON.stringify(o)}:${i === hot}:${h}`, CARD.w, h, (put) => paint(put, o, i + 1, i === hot, h)))
      .setOrigin(0).setDepth(UI + 2));
    all().forEach((o) => o.setScrollFactor(0)); // on the screen, wherever the camera is in the refuge
    place();
  };
  const set = (offers: Offer[], banked: number, line: string) => {
    now = offers;
    said.setTexture(Font.bake(scene, [`« ${line} »`], BONE, VOID));
    bank.setTexture(Font.bake(scene, [`Bassin : ${banked} sang`], BLOOD[2], VOID));
    draw();
  };
  set(offers, banked, line);
  scene.scale.on(Phaser.Scale.Events.RESIZE, place);
  const close = () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, place);
    all().forEach((o) => o.destroy());
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
  return {
    at: (px, py) => cards.findIndex((_, i) => px >= xs[i] && px < xs[i] + CARD.w && py >= ys[i] - 3 && py < ys[i] + h),
    hover(i) {
      if (i === hot) return;
      hot = i;
      draw();
    },
    set,
    close() {
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
      close();
    },
  };
}
