import Phaser from 'phaser';
import * as Font from './font.ts';
import { ZOOM, prelit } from './dark.ts';
import { FW, FH, SOLE, FRAMES } from './vesna.data.ts';
import sheet from './vesna.png';
import { GIFTS, ICONS, KINDS, SWARM_ICON } from './gifts.ts';
import { NUEE, SLOTS, slotOf, type Power } from './powers.ts';

// How Vesna la Grise shows (docs/lore.md): her sheet rendered offline already lit (tools/art/vesna.gen.mjs), drawn at
// half scale like the foes: standing, breathing, or holding a coin up to her eye; her eyes in the slit of her reliquary
// and her rising out of it, freed; and her stall at the refuge, the Rat house's powers in the gift cards' style, one
// column per slot. Gameplay (RoomScene, powers.ts) decides; this file only draws.

type Scene = Phaser.Scene;
type Put = (x: number, y: number, c: number) => void;
const VOID = 0x0b0710, NIGHT = 0x1c1029, BONE = 0xe8dcc8, BONE_DIM = 0xb7a58f, SILVER = 0xd4cdd2, GREY = 0x948a91, STONE = 0x5a4468, GLOW = 0xff4f8b;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a];
const UI = 20_000; // over the room and its vignette, unlit (dark.ts)

export function preload(scene: Scene) {
  if (!scene.textures.exists('vesna')) scene.load.image('vesna', sheet);
}

export type Pose = 'idle' | 'count';
/** Her at floor point (x, y), facing the camera. show(): breathing, or the coin to her eye. rise(k): out of her chest,
 *  k from 0 (sunk in it, hidden) to 1 (standing). */
export function create(scene: Scene, x: number, y: number) {
  const tex = scene.textures.get('vesna');
  FRAMES.forEach((n, i) => tex.has(n) || tex.add(n, 0, i * FW, 0, FW, FH));
  const s = scene.add.image(x, y, 'vesna', 'idle0').setOrigin(0.5, SOLE / FH).setScale(0.5).setDepth(y).setBlendMode(prelit(scene));
  return {
    s,
    show(pose: Pose, now: number) {
      s.setFrame(pose === 'count' ? `count${Math.floor(now / 500) % 2}` : `idle${Math.floor(now / 380) % 4}`);
    },
    rise(k: number) {
      const sunk = Math.round((1 - k) * SOLE); // sheet rows still in the chest
      s.setY(y + sunk / 2).setCrop(0, 0, FW, SOLE - sunk + 1);
    },
  };
}

/** Two embers in the dark of her reliquary's slit (x, y, room px): they open, look about, blink. Returns its end. */
export function eyes(scene: Scene, x: number, y: number, depth: number) {
  const g = scene.add.graphics().setDepth(depth), t0 = scene.time.now;
  const draw = () => {
    const t = scene.time.now - t0, open = Math.min(1, t / 500), blink = t % 1700 > 1580, dx = Math.round(Math.sin(t / 700) * 0.6);
    g.clear();
    if (blink) return;
    for (const s of [-1.5, 1.5]) {
      g.fillStyle(0xff8a3a, 0.35 * open).fillRect(x + s + dx - 1, y - 1, 2, 2);
      g.fillStyle(0xffd27a, open).fillRect(x + s + dx - 0.5, y - 0.5, 1, 1);
    }
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  return () => { scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw); g.destroy(); };
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

/** A power on her stall: its price (undefined once bought), bought, worn, affordable. */
export type Offer = { id: Power; price?: number; bought: boolean; worn: boolean; afford: boolean };
const CARD = { w: 108, h: 34, gap: 6 }, NUEE_W = 4 * CARD.w + 3 * CARD.gap;
export const nameOf = (id: Power) => (id === 'swarm' ? NUEE.name : GIFTS[id].name);
export const textOf = (id: Power) => (id === 'swarm' ? NUEE.text : GIFTS[id].text(0));
const foot = (o: Offer) => (o.worn ? 'Porté' : o.bought ? (o.id === 'swarm' ? 'Apprise' : 'Porter') : `${o.price} sang`);

/** One card, W wide, `hot` (hovered) or not: its key, its icon, the power's name on a blood band, its price or what F does. */
function paint(put: Put, o: Offer, key: number, hot: boolean, W: number) {
  const H = CARD.h, rim = o.worn ? GLOW : hot ? BONE : o.bought || o.afford ? SILVER : STONE, shade = hot ? SILVER : GREY;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
      put(x, y, e === 0 ? VOID : e === 1 ? (x === 1 || y === 1 ? rim : shade) : e === 2 || (y === 17 && e > 2) ? BLOOD[1] : y < 17 ? BLOOD[0] : NIGHT);
    }
  for (let y = 4; y < 15; y++) for (let x = 4; x < 13; x++) put(x, y, x === 4 || x === 12 || y === 4 || y === 14 ? shade : VOID);
  Font.draw(String(key), 4 + Math.floor((9 - Font.width(String(key))) / 2), 4, (x, y) => put(x, y, BONE));
  const icon = o.id === 'swarm' ? SWARM_ICON : ICONS[slotOf(o.id)!], ip: Record<string, number> = { S: SILVER, s: GREY, r: BLOOD[2], d: BLOOD[1] };
  icon.forEach((row, y) => [...row].forEach((c, x) => ip[c] !== undefined && put(5 + x, 22 + y, ip[c]))); // its slot's, under the key
  const name = nameOf(o.id);
  Font.draw(name, 15 + Math.floor((W - 17 - Font.width(name)) / 2), 3, (x, y) => put(x, y, BONE));
  const f = foot(o);
  Font.draw(f, Math.floor((W - Font.width(f)) / 2), 20, (x, y) => put(x, y, o.worn ? GLOW : o.bought ? BONE : o.afford ? BLOOD[2] : BLOOD[0]));
}

export type Stall = {
  at(x: number, y: number): number; // the card under a point (native px of the view), or -1
  hover(i: number): void;
  set(offers: Offer[], banked: number, line: string): void;
  close(): void;
};

/** Her stall over the dimmed refuge: her name, what she says (`line`), a column of cards per slot and la Nuée under
 *  them, what the card under the pointer does, the blood in the basin, the keys. Pinned to the view. */
export function stall(scene: Scene, offers: Offer[], banked: number, line: string): Stall {
  const dim = scene.add.rectangle(0, 0, 10, 10, VOID, 0.82).setOrigin(0).setDepth(UI);
  const head = scene.add.image(0, 0, Font.bake(scene, ['VESNA LA GRISE'], SILVER, VOID, 2)).setOrigin(0.5, 0).setDepth(UI + 1);
  const said = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0).setDepth(UI + 1);
  const slots = SLOTS.map((k) => scene.add.image(0, 0, Font.bake(scene, [KINDS[k].toUpperCase()], GREY, VOID)).setOrigin(0.5, 0).setDepth(UI + 1));
  const about = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0).setDepth(UI + 1);
  const bank = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0).setDepth(UI + 1);
  const keys = matchMedia('(pointer: coarse)').matches ? 'touche une carte' : '1 à 9 ou clic : acheter, porter, ôter ; Échap ou F : partir';
  const hint = scene.add.image(0, 0, Font.bake(scene, [keys], GREY)).setOrigin(0.5, 0).setDepth(UI + 1);
  let cards: Phaser.GameObjects.Image[] = [], xs: number[] = [], ys: number[] = [], hot = -1, now = offers;
  const width = (i: number) => (now[i].id === 'swarm' ? NUEE_W : CARD.w);
  const all = () => [dim, head, said, ...slots, about, bank, hint, ...cards];
  const place = () => {
    const W = scene.scale.width / ZOOM, H = scene.scale.height / ZOOM, x0 = Math.round((W - NUEE_W) / 2), top = Math.max(2, Math.round((H - 214) / 2) + 12); // (clear of the HUD's corner)
    xs = now.map((o, i) => (o.id === 'swarm' ? x0 : x0 + Math.floor(i / 2) * (CARD.w + CARD.gap)));
    ys = now.map((o, i) => (o.id === 'swarm' ? top + 44 + 2 * (CARD.h + 4) + 4 : top + 44 + (i % 2) * (CARD.h + 4)));
    dim.setSize(W, H);
    head.setPosition(W / 2, top);
    said.setPosition(W / 2, top + 16);
    slots.forEach((s, k) => s.setPosition(x0 + k * (CARD.w + CARD.gap) + CARD.w / 2, top + 31));
    cards.forEach((c, i) => c.setPosition(xs[i], ys[i] - (i === hot ? 2 : 0)));
    const end = top + 44 + 3 * (CARD.h + 4) + 8;
    about.setPosition(W / 2, end);
    bank.setPosition(W / 2, end + 2 * Font.LINE + 4);
    hint.setPosition(W / 2, end + 3 * Font.LINE + 6);
  };
  const draw = () => {
    cards.forEach((c) => c.destroy());
    cards = now.map((o, i) => scene.add.image(0, 0, bake(scene, `vesna-card:${JSON.stringify(o)}:${i === hot}`, width(i), CARD.h, (put) => paint(put, o, i + 1, i === hot, width(i))))
      .setOrigin(0).setDepth(UI + 2));
    const o = now[hot], text = o ? `${nameOf(o.id)} : ${textOf(o.id)}${o.bought || o.id === 'swarm' ? '' : (() => { const k = slotOf(o.id)!, w = now.find((p) => p.worn && slotOf(p.id) === k); return w ? ` Remplace : ${nameOf(w.id)}.` : ''; })()}` : 'Les pouvoirs de la Maison du Rat, pour toujours. Un seul porté par emplacement.';
    about.setTexture(Font.bake(scene, Font.wrap(text, NUEE_W).slice(0, 2), BONE_DIM, VOID));
    all().forEach((c) => c.setScrollFactor(0));
    place();
  };
  const set = (offers: Offer[], banked: number, l: string) => {
    now = offers;
    said.setTexture(Font.bake(scene, [`« ${l} »`], BONE, VOID));
    bank.setTexture(Font.bake(scene, [`Bassin : ${banked} sang`], BLOOD[2], VOID));
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
    at: (px, py) => now.findIndex((_, i) => px >= xs[i] && px < xs[i] + width(i) && py >= ys[i] - 2 && py < ys[i] + CARD.h),
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
