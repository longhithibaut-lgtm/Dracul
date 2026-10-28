import Phaser from 'phaser';
import { T } from './tuning.ts';
import { edgePip, frameOf, left, turn, type Turn } from './logic.ts';
import { type Item } from './items.ts';
import { icon, RARE } from './satchel.ts';
import { FRAMES, BRANDS, STEPS } from './hud.data.ts';
import atlasUrl from './hud.png';
import fellUrl from './fell-italic.ttf';

// Heads-up display « Chair » (docs/maquettes/hud-2-chair.png; docs/decisions.md): diegetic, little text. Bottom left, a
// heart that blackens from its apex as life is lost, beating (faster when low); the mist's recharge, a vein that
// refills; the blood carried, a skin pouch that soaks red against the bag's size; the bag's items, pale small icons.
// Bottom right, the powers, brands cut in a pinned scrap of skin (griffes, tir, glyphe, la Nuée), open when ready,
// scabbed over the share of their turn still to run. Top, a place's name (or what just happened) over a smear of blood,
// and a guardian's umbilical cord that withers with her blood. Low life: veins crawl in from the screen's edges. What is
// not needed fades. Lit pieces are baked offline (tools/art/hud.gen.mjs: src/hud.png, src/hud.data.ts); words in IM
// Fell English italic (src/fell-italic.ttf, OFL), cut to pixels with no smoothing.
// One HUD pixel is one pixel of the view (dark.ts ZOOM: two screen pixels at 1080p); the pieces keep the mockup's
// distances to their corner of the view, whatever its size.
// Gameplay pushes values in; it never reads from here. Cheap per frame: frames, alphas and positions set.
export type Power = 'griffes' | 'tir' | 'glyphe' | 'brume' | 'nuee';
export type Hud = {
  health(current: number, max: number): void;
  cooldown(id: Power, readyAt: number | undefined): void; // each frame: when it is back (game time); undefined: locked
  title(text: string): void;
  blood(carried: number, bag: number, banked?: number): void; // blood carried out of the bag; at the refuge, banked too
  bag(items: readonly Item[] | undefined, size: number): void; // the items carried, in a bag of `size`; undefined: not shown
  threats(enemies: { x: number; y: number }[]): void; // room px on the view; off it, a pip points at each
  boss(name: string | undefined, hp?: number, max?: number): void; // a guardian's cord at the top; undefined: none
  say(who: string, text: string, ms: number): void; // a line spoken, under the middle of the screen, `ms` long
};

// The mockup's colours as its renderer shows them (tone-mapped, snapped to the palette).
const BONE = '#c4b697', BONE_DIM = '#8a7c63', FRESH = '#d01a12', BLOOD = '#801417', DEEP = [0x37, 0x05, 0x0a], RED = [0x80, 0x14, 0x17];
const MW = 960, MH = 540; // the mockup
const LOW = 0.3; // life share under which the veins come and the heart races (full at a third of it)
const PIPS: [Power, number][] = [['griffes', 0], ['tir', 1], ['glyphe', 2], ['nuee', 3]];

// Value noise, as the mockups' (tools/art/grand/lib.mjs), for what is drawn here: the smear, the veins.
const h2 = (x: number, y: number, s: number) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const vn = (x: number, y: number, s: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x: number, y: number, o: number, s: number) => { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

let fontQueued = false;
/** The HUD's atlas and its typeface. */
export function preload(scene: Phaser.Scene) {
  if (!scene.textures.exists('hud')) scene.load.image('hud', atlasUrl);
  if (!fontQueued) { fontQueued = true; scene.load.font('fellI', fellUrl); } // no style given: italic is asked of it, as in the mockups
}

/** A texture of `lines` in the HUD's italic, `size` px, centred, cut to pixels, in `color` over a shadow below right; a
 *  line ending in « (F) » starts with that key in red instead (« F fouiller »). Returns its key. */
export function words(scene: Phaser.Scene, lines: string[], size: number, color = BONE, op = 1, spacing = 0) {
  const key = `fell:${size}:${color}:${op}:${spacing}:${lines.join('\n')}`;
  if (scene.textures.exists(key)) return key;
  const rows = lines.map((l) => (l.endsWith(' (F)') ? [['F', FRESH], [l.slice(0, -4), color]] : [[l, color]]));
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true })!;
  const font = () => { g.font = `italic ${size}px fellI`; g.letterSpacing = `${spacing}px`; };
  font();
  // as the mockups measure: the ink's own ascent and descent, 2 px round it
  const gap = Math.round(size / 4), m = lines.map((l) => g.measureText(l)), asc = Math.ceil(Math.max(...m.map((t) => t.actualBoundingBoxAscent)));
  const lh = asc + Math.ceil(Math.max(...m.map((t) => t.actualBoundingBoxDescent))) + 2;
  const widths = rows.map((r) => r.reduce((w, [s]) => w + g.measureText(s).width, 0) + gap * (r.length - 1));
  c.width = Math.ceil(Math.max(1, ...widths)) + 6;
  c.height = lh * rows.length + 1;
  font();
  rows.forEach((r, i) => {
    let x = 2 + (c.width - 6 - widths[i]) / 2;
    for (const [s, col] of r) { g.fillStyle = col; g.fillText(s, x, i * lh + asc + 1); x += g.measureText(s).width + gap; }
  });
  const src = g.getImageData(0, 0, c.width, c.height), out = g.createImageData(c.width, c.height), d = src.data, o = out.data, W = c.width;
  const on = (i: number) => d[i * 4 + 3] > 107; // the mockups' cut: more than 42 % covered
  const ink = [9, 8, 6];
  for (let i = 0; i < W * c.height; i++) {
    if (on(i)) { o.set([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 255 * op], i * 4); continue; }
    const j = i - W - 1; // the shadow, below right
    if (i % W > 0 && j >= 0 && on(j)) o.set([...ink, 255 * op * 0.85], i * 4);
  }
  g.putImageData(out, 0, 0);
  scene.textures.addCanvas(key, c);
  return key;
}

/** A soft dark patch, `w` x `h`, darkest `k` at its middle (the mockups' scrim under a cluster). */
function soft(scene: Phaser.Scene, w: number, h: number, k: number, cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2) {
  const key = `hud-soft:${w}:${h}:${k}:${cx}:${cy}:${rx}:${ry}`;
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!, img = t.context.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data[(y * w + x) * 4 + 3] = 255 * k * (1 - smooth(0.35, 1, Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)));
  t.context.putImageData(img, 0, 0);
  t.refresh();
  return key;
}

/** The finger of blood smeared under a title `w` px wide (its text `h` px tall): the mockup's, in flat colours. */
function smear(scene: Phaser.Scene, w: number) {
  const key = `hud-smear:${w}`;
  if (scene.textures.exists(key)) return key;
  const W = w + 14, H = 9, t = scene.textures.createCanvas(key, W, H)!, img = t.context.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, half = 2.6 * Math.sin(u * Math.PI) ** 0.6, dist = Math.abs(y + 0.5 - (4 + Math.sin(u * 5) * 0.8));
    if (dist >= half || fbm(x * 0.5, y * 0.9, 2, 81) <= 0.3 + u * 0.25) continue;
    const k = fbm(x * 0.3, y, 2, 82);
    img.data.set([...DEEP.map((v, i) => v + (RED[i] - v) * k), 230], (y * W + x) * 4);
  }
  t.context.putImageData(img, 0, 0);
  t.refresh();
  return key;
}

/** Low life over a view `w` x `h`: the edges darkened and reddened, veins crawling in from them (the mockup's). */
function veins(scene: Phaser.Scene, w: number, h: number) {
  const key = `hud-veins:${w}:${h}`;
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!, img = t.context.createImageData(w, h), a = new Float32Array(w * h);
  for (let i = 0; i < 26; i++) {
    const side = i % 4, r0 = h2(i, 1, 51);
    let x = side === 0 ? 0 : side === 1 ? w - 1 : r0 * w, y = side < 2 ? r0 * h : side === 2 ? 0 : h - 1, ang = [0, Math.PI, Math.PI / 2, -Math.PI / 2][side], r = 2.2;
    for (let s = 0; s < 60 && r > 0.4; s++) {
      ang += (h2(i, s, 52) - 0.5) * 0.8; x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5; r -= 0.03;
      for (let py = Math.max(0, Math.floor(y - r)); py < Math.min(h, Math.ceil(y + r + 1)); py++)
        for (let px = Math.max(0, Math.floor(x - r)); px < Math.min(w, Math.ceil(x + r + 1)); px++)
          if (Math.hypot(px + 0.5 - x, py + 0.5 - y) < r) a[py * w + px] = clamp(r / 2.2) * 0.8;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, wa = smooth(0.6, 1.4, Math.hypot(((x + 0.5 - w / 2) / (w / 2)) * 0.9, (y + 0.5 - h / 2) / (h / 2))) * 0.5, va = a[i], al = wa + va - wa * va;
    if (al <= 0) continue;
    img.data.set([(31 * wa * (1 - va) + 0x23 * va) / al, 0, (8 * wa * (1 - va) + 4 * va) / al, 255 * al], i * 4);
  }
  t.context.putImageData(img, 0, 0);
  t.refresh();
  return key;
}

export function create(scene: Phaser.Scene): Hud {
  // Own camera at one view pixel a pixel, so the HUD never shakes, flashes or zooms with the world camera.
  const cam = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height).setOrigin(0); // resized with the view by Phaser
  cam.ignore(scene.children.list);
  const before = new Set(scene.children.list);

  const tex = scene.textures.get('hud');
  if (!tex.has('heart0')) {
    for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) tex.add(name, 0, x, y, w, h);
    // each brand's column of the strip, at every step of its turn, plain, and la Nuée bleeding
    const [, , sw, sh, ox] = FRAMES.strip;
    BRANDS.forEach(([a, b], k) => {
      const x0 = Math.max(a, ox) - ox, w = Math.min(b, ox + sw) - ox - x0;
      for (const s of [...Array.from({ length: STEPS.strip + 1 }, (_, i) => String(i)), '', 'drip']) {
        const f = FRAMES[`strip${s}`];
        tex.add(`b${k}:${s || 'plain'}`, 0, f[0] + x0, f[1], w, sh);
      }
    });
  }
  // Every piece is made now (what changes later changes frame, texture or alpha), so the HUD camera alone draws them.
  const img = (frame: string) => scene.add.image(0, 0, 'hud', frame).setOrigin(0);
  const blank = () => scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false);
  const scrimL = scene.add.image(0, 0, soft(scene, 330, 140, 0.6, 90, 105, 160, 80)).setOrigin(0);
  const scrimR = scene.add.image(0, 0, soft(scene, 200, 120, 0.6, 130, 88, 120, 60)).setOrigin(0);
  const low = blank().setAlpha(0), lowNum = blank();
  const halo = img('halo'), heart = img('heart40'), vein = img('vein24'), space = img('space');
  const pouch = img('pouch0'), gain = blank(), basin = blank();
  const slots = Array.from({ length: 9 }, () => ({ icon: blank().setScale(2), mark: blank(), rare: scene.add.rectangle(0, 0, 10, 2, 0).setOrigin(0).setVisible(false) }));
  const strip = img('strip'), brands = PIPS.map(([, k]) => img(`b${k}:0`)), mice = img('mice');
  const keyE = scene.add.image(0, 0, words(scene, ['E'], 13, BONE_DIM, 0.75)).setOrigin(0), keyR = scene.add.image(0, 0, words(scene, ['R'], 14, BONE, 0.85)).setOrigin(0);
  const bossScrim = blank(), cord0 = img('cord0').setVisible(false), cord1 = img('cord1').setVisible(false), bossName = blank();
  const titleScrim = blank(), titleSmear = blank(), titleText = blank();
  const band = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.6).setOrigin(0).setVisible(false), lineRows = Array.from({ length: 5 }, blank);
  const pips = scene.add.graphics();
  scene.cameras.main.ignore(scene.children.list.filter((o) => !before.has(o)));
  // Every object made after this is the world's: the HUD camera ignores it.
  const ignoreNew = (o: Phaser.GameObjects.GameObject) => cam.ignore(o);

  let hp = 0, max = 1, hitAt = -1e9, healAt = -1e9;
  const cool: Record<Power, Turn & { usedAt: number }> = {
    griffes: { readyAt: 0, spentAt: 0, usedAt: -1e9 }, tir: { readyAt: 0, spentAt: 0, usedAt: -1e9 }, glyphe: { readyAt: 0, spentAt: 0, usedAt: -1e9 },
    brume: { readyAt: 0, spentAt: 0, usedAt: -1e9 }, nuee: { readyAt: undefined, spentAt: 0, usedAt: -1e9 },
  };
  let carried = -1, bagSize = 1, banked: number | undefined, gotAt = -1e9;
  let items: readonly Item[] | undefined, size = 0, itemAt = -1e9;
  let titleAt = -1e9, lineEnd = -1e9, lowKey = '';
  let boss: { hp: number; max: number; hitAt: number; shown: number } | undefined;
  let threats: { x: number; y: number }[] = [];

  // An alpha eased toward `to` (fades, never pops).
  const ease = (o: { alpha: number; setAlpha(a: number): unknown }, to: number, k = 0.12) => o.setAlpha(o.alpha + (to - o.alpha) * k);

  const draw = () => {
    const now = scene.time.now, W = cam.width, H = cam.height;
    // where a piece of the mockup lands: bottom left, bottom right, top centre
    const bl = (o: Phaser.GameObjects.Image, x: number, y: number) => o.setPosition(x, H - MH + y);
    const br = (o: Phaser.GameObjects.Image, x: number, y: number) => o.setPosition(W - MW + x, H - MH + y);
    const at = (o: Phaser.GameObjects.Image, f: string, put = bl) => put(o, FRAMES[f][4], FRAMES[f][5]);

    // Life: the heart, on the beat (lub-dub) swollen a pixel, its halo breathing; faster and the veins in when low.
    const f = hp / max, lowK = clamp((LOW - f) / (LOW * 2 / 3)), period = f <= LOW ? 620 : 1100, beat = now % period;
    const step = frameOf(f, STEPS.heart), up = beat < 110 || (beat > 190 && beat < 270), shake = now - hitAt < 160 ? [2, -2, 1, -1][Math.floor((now - hitAt) / 40)] : 0;
    heart.setFrame(`${up ? 'beat' : 'heart'}${step}`);
    at(heart, `heart${step}`);
    heart.x += shake;
    at(halo, 'halo');
    halo.setAlpha((f <= LOW ? 0.57 : 1) * (0.55 + 0.45 * (up ? 1 : 0)) + (now - healAt < 300 ? 0.5 : 0));
    if (lowK > 0) {
      const key = veins(scene, W, H);
      if (key !== lowKey) low.setTexture((lowKey = key)).setVisible(true);
      low.setPosition(0, 0);
    }
    low.setAlpha(lowK * (0.85 + 0.15 * (up ? 1 : 0)));
    lowNum.setVisible(f <= LOW && hp > 0);
    bl(lowNum, 56, 456);

    // The mist: its vein refills; the vein and its key fade once all is ready a while.
    const mist = cool.brume, fresh = (c: (typeof cool)[Power]) => left(c, now) > 0 || now - c.usedAt < 2500;
    vein.setFrame(`vein${frameOf(1 - left(mist, now), STEPS.vein)}`);
    at(vein, 'vein0');
    at(space, 'space');
    for (const o of [vein, space]) ease(o, fresh(mist) ? 1 : 0.5);

    // The powers' brands; the strip and its keys fade once all is ready a while.
    let busy = false;
    PIPS.forEach(([id, k]) => {
      const c = cool[id], s = left(c, now);
      busy ||= fresh(c);
      brands[k].setFrame(id === 'nuee' && c.readyAt === undefined ? `b${k}:plain` : id === 'nuee' && !s ? `b${k}:drip` : `b${k}:${frameOf(s, STEPS.strip)}`);
      br(brands[k], Math.max(BRANDS[k][0], FRAMES.strip[4]), FRAMES.strip[5]);
    });
    at(strip, 'strip', br);
    at(mice, 'mice', br);
    br(keyE, 900, 475);
    br(keyR, 926, 474);
    for (const o of [strip, mice, keyE, keyR, ...brands]) ease(o, busy ? 1 : 0.55);
    keyR.setVisible(cool.nuee.readyAt !== undefined);
    br(scrimR, 760, 420);
    bl(scrimL, 0, 400);

    // The blood carried: the pouch soaks red against the bag; the last pickup's « +n » fades; at the refuge, the basin.
    const shown = carried >= 0;
    pouch.setVisible(shown).setFrame(`pouch${frameOf(carried / bagSize, STEPS.pouch)}`);
    at(pouch, 'pouch0');
    ease(pouch, now - gotAt < 3000 ? 1 : 0.8);
    gain.setVisible(shown && now - gotAt < 1600).setAlpha(clamp((1600 - (now - gotAt)) / 600));
    bl(gain, 178, 470);
    basin.setVisible(shown && banked !== undefined);
    bl(basin, 186, 506);
    // The bag: its items pale (bright a moment when one comes in), its empty slots a faint cross.
    slots.forEach((o, i) => {
      const it = items?.[i], on = shown && !!items && i < size;
      o.icon.setVisible(on && !!it);
      o.mark.setVisible(on && !it);
      o.rare.setVisible(on && !!it?.r);
      if (!on) return;
      const x = 186 + i * 19;
      bl(o.icon, x - 1, 509);
      bl(o.mark, x + 6, 516);
      o.rare.setPosition(x + 3, H - MH + 528);
      ease(o.icon, now - itemAt < 1500 ? 1 : 0.45);
    });

    // A place's name, or what just happened: at the top, over its smear; it fades out.
    const tt = now - titleAt, ta = tt < T.expedition.titleMs - 400 ? 1 : clamp((T.expedition.titleMs - tt) / 400);
    for (const o of [titleScrim, titleSmear, titleText]) o.setAlpha(ta).setVisible(ta > 0 && titleText.texture.key !== '__DEFAULT');
    titleText.setPosition(Math.round((W - titleText.width) / 2), 40);
    titleSmear.setPosition(titleText.x - 6, 40 + titleText.height - 3);
    titleScrim.setPosition(Math.round(W / 2 - titleScrim.width / 2), 10);

    // A guardian: her name over her cord, plump where her blood remains, withered behind; a blow drains it after a beat.
    for (const o of [bossScrim, cord0, cord1, bossName]) o.setVisible(!!boss);
    if (boss) {
      boss.shown = Math.max(boss.hp, boss.shown - (now - boss.hitAt > 400 ? boss.max * 0.004 : 0));
      const x0 = Math.round(W / 2) - MW / 2;
      cord0.setPosition(x0 + FRAMES.cord0[4], FRAMES.cord0[5]);
      cord1.setPosition(x0 + FRAMES.cord1[4], FRAMES.cord1[5]);
      cord1.setCrop(0, 0, 300 - FRAMES.cord1[4] + Math.round((360 * boss.shown) / boss.max), FRAMES.cord1[3]);
      bossName.setPosition(Math.round((W - bossName.width) / 2), 10);
      bossScrim.setPosition(Math.round(W / 2) - 220, 0);
    }

    // A line spoken, under the middle of the screen; it fades out at its end.
    const la = clamp((lineEnd - now) / 300), rows = lineRows.filter((r) => r.texture.key !== '__DEFAULT');
    band.setVisible(la > 0 && rows.length > 0);
    if (la > 0) {
      let y = Math.round(H * 0.74);
      band.setPosition(0, y - 6).setSize(W, rows.reduce((s, r) => s + r.height, 0) + 8).setAlpha(0.6 * la);
      for (const r of rows) { r.setPosition(Math.round((W - r.width) / 2), y).setAlpha(la).setVisible(true); y += r.height + 2; }
    } else for (const r of lineRows) r.setVisible(false);

    // Enemies off the screen: a small blood-red triangle on its edge points at each (where it is, never what it is about
    // to do), outlined in ink so it reads on any floor; two view pixels a cell.
    pips.clear();
    const PIP = 4;
    for (const e of threats) {
      const p = edgePip(e.x, e.y, W / 2, H / 2, PIP + 2);
      if (!p) continue;
      const tx = p.x + p.dx * PIP, ty = p.y + p.dy * PIP, cells: [number, number][] = [];
      for (let a = 0; a <= PIP; a++)
        for (let c = -a; c <= a; c++)
          if (!p.dx || !p.dy) cells.push(p.dx ? [tx - p.dx * a, ty + c] : [tx + c, ty - p.dy * a]);
          else if (c >= 0 && a - c <= PIP - 1) cells.push([tx - p.dx * c, ty - p.dy * (a - c)]);
      pips.fillStyle(0x090806);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const [x, y] of cells) pips.fillRect((x + dx) * 2, (y + dy) * 2, 2, 2);
      pips.fillStyle(0xb42c1e);
      for (const [x, y] of cells) pips.fillRect(x * 2, y * 2, 2, 2);
    }
  };

  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreNew);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreNew);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw);
  });

  return {
    health(current, m) {
      const now = scene.time.now;
      current = Math.max(0, current);
      if (current < hp) hitAt = now;
      else if (current > hp) healAt = now;
      [hp, max] = [current, Math.max(1, m)];
      lowNum.setTexture(words(scene, [String(Math.ceil(hp))], 22, FRESH));
    },
    cooldown(id, readyAt) {
      const c = cool[id], now = scene.time.now;
      if (readyAt !== c.readyAt) c.usedAt = now;
      turn(c, readyAt, now);
    },
    blood(c, b, k) {
      if (c > carried && carried >= 0) {
        gotAt = scene.time.now;
        gain.setTexture(words(scene, [`+${c - carried}`], 15, BLOOD, 0.8));
      }
      if (k !== undefined && k !== banked) basin.setTexture(words(scene, [`au bassin : ${k}`], 15, BONE_DIM, 0.8));
      [carried, bagSize, banked] = [c, Math.max(1, b), k];
    },
    bag(list, n) {
      if (list && items && list.length > items.length) itemAt = scene.time.now;
      [items, size] = [list && [...list], n];
      slots.forEach((o, i) => {
        const it = items?.[i];
        if (it) { o.icon.setTexture(icon(scene, it.id)); o.rare.setFillStyle(RARE[it.r]); }
        if (o.mark.texture.key === '__DEFAULT') o.mark.setTexture(cross(scene)).setAlpha(0.35);
      });
    },
    title(t) {
      titleAt = scene.time.now;
      if (!t) return void titleText.setTexture('__DEFAULT');
      titleText.setTexture(words(scene, [t], 30, BONE, 0.85));
      titleSmear.setTexture(smear(scene, titleText.width - 2));
      titleScrim.setTexture(soft(scene, titleText.width + 120, 100, 0.45, (titleText.width + 120) / 2, 46, titleText.width / 2 + 70, 40));
    },
    threats(list) {
      threats = list;
    },
    boss(name, h = 0, m = 1) {
      if (!name) return void (boss = undefined);
      if (!boss) {
        bossName.setTexture(words(scene, [name], 18, BONE, 0.85, 0.5));
        bossScrim.setTexture(soft(scene, 440, 80, 0.5, 220, 34, 220, 44));
      }
      boss = { hp: Math.max(0, h), max: m, hitAt: h < (boss?.hp ?? h) ? scene.time.now : boss?.hitAt ?? -1e9, shown: boss?.shown ?? h };
    },
    say(who, text, ms) {
      lineEnd = scene.time.now + ms;
      const c = document.createElement('canvas').getContext('2d')!, max = Math.min(640, cam.width - 80), lines: string[] = [];
      c.font = 'italic 17px fellI';
      for (const w of text.split(' ')) {
        const last = lines.length - 1;
        if (last >= 0 && c.measureText(`${lines[last]} ${w}`).width <= max) lines[last] += ` ${w}`;
        else lines.push(w);
      }
      lineRows.forEach((r, i) => r.setTexture(i === 0 ? words(scene, [who], 15, BONE_DIM) : i <= lines.length ? words(scene, [lines[i - 1]], 17, BONE) : '__DEFAULT'));
    },
  };
}

/** An empty slot of the bag: a small faint cross. */
function cross(scene: Phaser.Scene) {
  const key = 'hud-cross';
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 5, 5)!;
  t.context.fillStyle = BONE_DIM;
  for (let i = 0; i < 5; i++) { t.context.fillRect(i, i, 1, 1); t.context.fillRect(4 - i, i, 1, 1); }
  t.refresh();
  return key;
}
