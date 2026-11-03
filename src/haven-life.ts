import Phaser from 'phaser';
import { T } from './tuning.ts';
import { inArc } from './logic.ts';
import * as Font from './font.ts';
import * as Haven from './haven.ts';
import * as D from './refuge.data.ts';
import * as V from './refuge-vesna.data.ts';
import * as Save from './save.ts';
import * as Shop from './shop.ts';
import * as Satchel from './satchel.ts';
import * as Loot from './loot.ts';
import * as Fx from './fx.ts';
import * as Sfx from './sfx.ts';
import * as Rats from './rats.ts';
import { CHEST, RONGE, VESNA } from './refuge.ts';

// The refuge's life and keepsakes (haven.ts decides what shows): the basin's blood, its drips and ripples; the flames
// lit by the upgrades (a brazier lights the hall for real: dark.ts takes it as a light); the marks of his deaths by his
// coffin and its ashes spilt; the items of the chest on the wardrobe's walls; the guardians' trophies on the hall's
// wall; the training dummy, the map table; the rats; le Rongé lapping from the basin, Vesna counting her coins; their
// lines as he walks by. All drawn at runtime over the bake (refuge.ts), in room px: what lies on a wall or the floor is
// drawn as it reflects and lit by the bake's light under it; flames and glows unlit over it (dark.ts).

type Scene = Phaser.Scene;
type P = { x: number; y: number };
type Spot = { x: number; y: number; lit: boolean; h?: number; I?: number };
const DECAL = -999; // over the bake's albedo, under its sprites and everything standing
const BOWL = 641.5; // over the basin's sprites (its rows 623 to 641), under le Rongé (645) on its rim
const FLAME = 7982, UNLIT = 9000; // drawn unlit (dark.ts DEPTH 7980 and up)

/** What RoomScene lends it. */
export type Api = { hero: Phaser.Physics.Arcade.Sprite; busy(): boolean; say(who: string, text: string, ms: number): void; title(text: string): void; coffre(): void; map(): void };

// Where things are (room px): F within T.refuge.use of a place's floor point; its words over it.
const COFFIN = { x: 840, y: 256 }, WARD = { x: 1155, y: 352 }, TROPHY = { x: 612, y: 532 }, TABLE = { x: 1035, y: 664 };
export const DUMMY = { x: 650, y: 780 }; // the training dummy of the bake (the mockup's, in the chalk ring)
const BASIN = { x: 840.3, y: 634.3, rx: 13.4, ry: 6.3 }; // the bowl's mouth, as the bake shows it

/** A canvas texture `w` x `h`, painted once by `paint` (its 2d context). */
function canvas(scene: Scene, key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h)!;
  paint(t.context);
  t.refresh();
  return key;
}
const rgb = (c: number[]) => `rgb(${c.join(',')})`;
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export function create(scene: Scene, api: Api) {
  const S = Save.data, freed = S.vesna, { deaths, returns } = Haven.tally(Save.journal());
  const labels: { at: P; l: Loot.Label }[] = [];
  const word = (at: P, y: number, text: string) => labels.push({ at, l: Loot.label(scene, at.x, y, text) });
  word(COFFIN, 214, 'Ton cercueil (F)');
  word(WARD, 330, 'La garde-robe (F)');
  word(TROPHY, 452, 'Les trophées (F)');
  word(TABLE, 658, 'La table des cartes (F)');
  word(DUMMY, 744, 'Le mannequin');

  // ---- the basin: its blood at the level banked, drips and their rings ----
  const basin = scene.add.image(826, 626, '__DEFAULT').setOrigin(0).setScale(0.5).setDepth(BOWL);
  const rings: { x: number; y: number; t0: number }[] = [], ripples = scene.add.graphics().setDepth(BOWL + 0.1);
  let level = 0;
  const pour = () => { // the liquid ellipse at its height (mockup z 11.2 dry to 23.2 brimming), seen through the bowl's mouth
    level = Haven.fill(S.banked);
    basin.setTexture(canvas(scene, 'haven-basin', 60, 34, (g) => {
      if (!level) return;
      const z = 12 + 11.2 * level, k = 0.55 + 0.45 * level, cy = 645.5 - 0.394 * z, rx = 13.8 * k, ry = 8.5 * k;
      for (let ty = 0; ty < 34; ty++) for (let tx = 0; tx < 60; tx++) {
        const x = 826 + (tx + 0.5) / 2, y = 626 + (ty + 0.5) / 2, m = ((x - BASIN.x) / BASIN.rx) ** 2 + ((y - BASIN.y) / BASIN.ry) ** 2, q = ((x - 840) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (m > 1 || q > 1) continue;
        const back = y < cy - ry * 0.55 && q > 0.55, edge = q > 0.8 || m > 0.85, n = hash(tx, ty);
        g.fillStyle = rgb(back ? [124, 24, 30] : edge ? [40, 4, 8] : n < 0.12 ? [88, 13, 20] : [66, 8, 14]);
        g.fillRect(tx, ty, 1, 1);
      }
    }));
  };
  pour();
  const drip = (now: number) => {
    if (!level) return;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
    rings.push({ x: 840 + Math.cos(a) * r * 9 * level, y: 637 - 3 * level + Math.sin(a) * r * 3, t0: now });
  };

  // ---- the flames the upgrades lit, a glow round each; a brazier lights the room (lights()) ----
  const glowKey = canvas(scene, 'haven-glow', 32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,170,80,0.9)');
    r.addColorStop(0.35, 'rgba(200,100,40,0.35)');
    r.addColorStop(1, 'rgba(120,50,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  });
  const flames = Haven.lit(S), fires: { f: Haven.Flame; glow: Phaser.GameObjects.Image; I: number }[] = [];
  const stubs = scene.add.graphics().setDepth(DECAL + 1);
  for (const f of flames) {
    const big = f.kind === 'brazier', k = big ? 1 : f.kind === 'sconce' ? 0.75 : 0.5;
    for (const dx of big ? [-2, 0, 2] : [0]) scene.add.sprite(f.x + dx, f.y + (dx ? 1 : 0), 'dark-flame').setOrigin(0.5, 1).setScale(k).setDepth(FLAME).play({ key: 'dark-flame', startFrame: (f.x + dx) % 3 });
    if (f.kind === 'stub') { // a stub of wax on the floor under its flame
      stubs.fillStyle(0x8a7c63).fillRect(f.x - 0.5, f.y, 1, 2.5).fillStyle(0x4a4236).fillRect(f.x, f.y, 0.5, 2.5);
    }
    const glow = scene.add.image(f.x, f.y - (big ? 3 : 1.5), glowKey).setDepth(FLAME - 1).setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 2.4 : f.kind === 'sconce' ? 1.3 : 0.7).setAlpha(0.3);
    fires.push({ f, glow, I: 1 });
  }

  // ---- his deaths: a mark scratched on the apse's wall for each, by fives; his ashes spilt before the coffin ----
  const g = scene.add.graphics().setDepth(DECAL);
  for (let i = 0; i < Math.min(deaths, 120); i++) { // shortcut: 120 marks fill the wall, more are only counted (F)
    const grp = Math.floor(i / 5), j = i % 5, x = 896 + (grp % 4) * 6.5, y = 156 + Math.floor(grp / 4) * 8;
    if (j < 4) g.fillStyle(0x16120e).fillRect(x + j * 1.5 + 0.5, y + 0.5, 0.5, 4).fillStyle(0x857868).fillRect(x + j * 1.5, y, 0.5, 4);
    else for (let t = 0; t < 6; t++) g.fillStyle(0x857868).fillRect(x - 0.5 + t, y + 3.5 - t * 0.6, 0.5, 0.5);
  }
  const ash = Math.min(1, deaths / 20);
  if (deaths) for (let i = 0; i < 6 + 40 * ash; i++) {
    const a = hash(i, 1) * Math.PI * 2, r = Math.sqrt(hash(i, 2));
    g.fillStyle(hash(i, 3) < 0.5 ? 0x5e5a52 : 0x3a3732).fillRect(Math.round((834 + Math.cos(a) * r * (4 + 8 * ash)) * 2) / 2, Math.round((261 + Math.sin(a) * r * (2 + 3 * ash)) * 2) / 2, 0.5, 0.5);
  }

  // ---- the wardrobe: each kind of item brought back, on a peg on its walls (both sides of the armoire) ----
  const pegs = [...[1172, 1183, 1194, 1205].flatMap((x) => [267, 278, 289, 300].map((y) => ({ x, y }))), ...[1089, 1100, 1111].flatMap((x) => [267, 278, 289, 300].map((y) => ({ x, y })))]
    .sort((a, b) => a.y - b.y || a.x - b.x);
  Haven.shown(S.stash).slice(0, pegs.length).forEach((it, i) => {
    const p = pegs[i];
    g.fillStyle(0x1a1410).fillRect(p.x + 4, p.y - 1, 1, 1);
    scene.add.image(p.x, p.y, Satchel.icon(scene, it.id)).setOrigin(0).setDepth(DECAL + 1);
    if (it.r) g.fillStyle(Satchel.RARE[it.r]).fillRect(p.x + 2, p.y + 9, 5, 0.5);
  });

  // ---- the trophies: four hooks on the hall's wall, a guardian's on each once killed (la Matrice's wheel) ----
  for (const x of [590, 610, 630, 650]) g.fillStyle(0x0e0c0a).fillRect(x - 0.5, 455, 1.5, 1).fillRect(x, 455, 0.5, 2.5).fillStyle(0x5a5650).fillRect(x - 0.5, 454.5, 1, 0.5);
  if (S.nourrice.dead) scene.add.image(590, 456, wheel(scene)).setOrigin(0.5, 0).setScale(0.5).setDepth(DECAL + 1);

  // ---- the map table: his sheets laid on the old pew ----
  scene.add.image(TABLE.x, 678, canvas(scene, 'haven-sheets', 56, 18, (c) => {
    for (const [x0, y0, w, h, tone] of [[1, 4, 24, 13, 0], [20, 1, 26, 14, 1], [36, 5, 19, 12, 2]]) {
      c.fillStyle = rgb([[200, 180, 140], [176, 156, 118], [190, 168, 128]][tone]);
      c.fillRect(x0, y0, w, h);
      c.fillStyle = rgb([70, 56, 40]);
      for (let i = 0; i < 9; i++) c.fillRect(x0 + 2 + Math.floor(hash(i, tone) * (w - 5)), y0 + 2 + Math.floor(hash(tone, i) * (h - 4)), 1 + (i % 3), 1); // inked ways
    }
  })).setScale(0.5).setDepth(700); // over the pew's sprites

  // ---- the rats: each about its home, still a while, then a dash; away from him when he comes near ----
  const solid = [...(freed ? V.BOXES : D.BOXES), [CHEST.x - 14, CHEST.y - 8, 28, 12], [RONGE.x - 7, RONGE.y - 8, 20, 16], ...(freed ? [[VESNA.x - 14, VESNA.y - 7, 28, 10]] : [])];
  const free = (x: number, y: number) => !solid.some(([bx, by, bw, bh]) => x >= bx - 3 && x < bx + bw + 3 && y >= by - 2 && y < by + bh + 2);
  const clear = (a: P, b: P) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2); for (let i = 1; i <= n; i++) if (!free(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false; return true; };
  const rats = Haven.RATS.filter((r) => !r.vesna || freed).map((home) => ({ home, s: Rats.rat(scene, home.x, home.y).setDepth(home.y - 11), to: undefined as P | undefined, until: 0 }));
  const aim = (r: (typeof rats)[number], away?: P) => {
    for (let k = 0; k < 12; k++) {
      const a = away ? Math.atan2(r.s.y - away.y, r.s.x - away.x) + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2, d = away ? 30 + Math.random() * 30 : 12 + Math.random() * T.refuge.roam;
      const to = away ? { x: r.s.x + Math.cos(a) * d, y: r.s.y + Math.sin(a) * d * 0.6 } : { x: r.home.x + Math.cos(a) * d, y: r.home.y + Math.sin(a) * d * 0.6 };
      if (free(to.x, to.y) && clear(r.s, to)) return void (r.to = to);
    }
  };

  // ---- le Rongé laps from the basin, Vesna counts; their lines ----
  const R = T.refuge, t0 = scene.time.now;
  let lapAt = t0 + Phaser.Math.Between(R.lapEvery[0] / 3, R.lapEvery[1] / 2), lapUntil = 0, dripAt = t0 + 800, lineAt = t0 + R.firstMs, said = 0, last: string | undefined, emberAt = 0;
  const step = (now: number, dt: number) => {
    if (api.busy()) return;
    const h = api.hero.body!.center;
    if (now >= lapAt) [lapUntil, lapAt] = [now + R.lapMs, now + Phaser.Math.Between(R.lapEvery[0], R.lapEvery[1])];
    if (now >= dripAt) { drip(now); dripAt = now + (now < lapUntil ? Phaser.Math.Between(250, 500) : Phaser.Math.Between(1400, 3200)); }
    ripples.clear();
    for (const r of [...rings]) {
      const k = (now - r.t0) / 900;
      if (k >= 1) { rings.splice(rings.indexOf(r), 1); continue; }
      ripples.fillStyle(0xc0303a, 0.7 * (1 - k));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = r.x + Math.cos(a) * (0.5 + 4 * k), y = r.y + Math.sin(a) * (0.5 + 4 * k) * 0.4;
        if (((x - BASIN.x) / BASIN.rx) ** 2 + ((y - BASIN.y) / BASIN.ry) ** 2 < 0.8) ripples.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, 0.5, 0.5);
      }
    }
    for (const f of fires) { // the fire gutters
      f.I = Phaser.Math.Clamp(f.I + (Math.random() - 0.5) * 0.25, 0.75, 1.15);
      f.glow.setAlpha(0.22 + 0.1 * f.I);
      if (f.f.kind === 'brazier' && now >= emberAt) Rats.motes(scene, f.f.x + Phaser.Math.Between(-2, 2), f.f.y - 3, 1, [0xffb050, 0xe07a30], FLAME + 1, 2, 12);
    }
    if (now >= emberAt) emberAt = now + 260;
    for (const r of rats) {
      if (!r.to && Phaser.Math.Distance.BetweenPoints(h, r.s) < R.flee) aim(r, h);
      else if (!r.to && now >= r.until) aim(r);
      if (!r.to) continue;
      const dx = r.to.x - r.s.x, dy = r.to.y - r.s.y, d = Math.hypot(dx, dy), v = (R.ratSpeed * dt) / 1000;
      if (d <= v) { r.s.setPosition(r.to.x, r.to.y).setFrame('0'); r.to = undefined; r.until = now + Phaser.Math.Between(900, 4500); continue; }
      r.s.setPosition(r.s.x + (dx / d) * v, r.s.y + (dy / d) * v);
      Rats.scurry(r.s, Math.atan2(dy, dx), now);
    }
    if (now < lineAt || said >= R.lines) return;
    const who = Phaser.Math.Distance.BetweenPoints(h, RONGE) < R.say && !Shop.beast(S) ? 'ronge' : freed && Phaser.Math.Distance.BetweenPoints(h, VESNA) < R.say ? 'vesna' : undefined;
    const text = who && Haven.line(who, S, deaths, last);
    if (!who || !text) return;
    api.say(who === 'ronge' ? 'Le Rongé' : 'Vesna', text, 2800);
    [last, lineAt, said] = [text, now + R.lineMs, said + 1];
  };
  const tick = (now: number, dt: number) => step(now, dt);
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, tick));

  const near = (p: P, at: P) => Phaser.Math.Distance.BetweenPoints(p, at) < R.use;
  return {
    labels,
    /** F at `p`: the coffin, the wardrobe, the trophies or the map table; false: none at hand. */
    use(p: P) {
      if (near(p, COFFIN)) api.title(deaths || returns ? `${deaths} mort${deaths > 1 ? 's' : ''}, ${returns} retour${returns > 1 ? 's' : ''}` : 'Tes cendres t\'attendent ici');
      else if (near(p, WARD)) api.coffre();
      else if (near(p, TROPHY)) api.title(S.nourrice.dead ? 'La roue de la Matrice' : 'Des crochets vides');
      else if (near(p, TABLE)) api.map();
      else return false;
      return true;
    },
    /** A claw (from `from` toward `angle`, `range` and `arc` long, `damage`, combo `kind`) on the dummy: it shakes out
     *  straw, the blow's number rises off it. False: out of reach. */
    strike(from: P, angle: number, range: number, arc: number, damage: number, kind: number) {
      if (!inArc(from, angle, DUMMY, range + 6, arc)) return false;
      Fx.hit(scene, DUMMY.x, DUMMY.y - 12, angle, kind >= 2);
      Sfx.play(scene, 'hit', kind);
      Rats.motes(scene, DUMMY.x, DUMMY.y - 14, 4 + 2 * kind, [0xc9a45a, 0x8a5e3a, 0xb7a58f], UNLIT, 8, 12);
      const n = scene.add.image(DUMMY.x + Phaser.Math.Between(12, 18), DUMMY.y - 20, Font.bake(scene, [String(Math.round(damage))], kind >= 2 ? 0xe0284a : 0xe8dcc8, 0x0b0710))
        .setOrigin(0.5, 1).setDepth(UNLIT + 1);
      scene.tweens.add({ targets: n, y: n.y - 14, alpha: 0, delay: 250, duration: 650, ease: 'Quad.easeOut', onComplete: () => n.destroy() });
      return true;
    },
    /** The braziers lit, as the Order's lights are given to dark.ts: warm, held up, guttering. */
    lights: (): Spot[] => fires.filter((f) => f.f.kind === 'brazier').map((f) => ({ x: f.f.x, y: f.f.floor, lit: true, h: 16, I: 0.9 * f.I })),
    lap: (now: number) => now < lapUntil,
    counting: (now: number) => now % 11000 < 3200,
    /** Blood was poured: the basin rises, rippling. */
    poured() { pour(); for (let i = 0; i < 4; i++) drip(scene.time.now - i * 180); },
  };
}
export type Life = ReturnType<typeof create>;

/** La Matrice's trophy: a broken quarter of her wheel, spokes and iron band, stained, hung from its chain (texels). */
function wheel(scene: Scene) {
  return canvas(scene, 'haven-wheel', 40, 36, (c) => {
    const put = (x: number, y: number, col: number[]) => { c.fillStyle = rgb(col); c.fillRect(x, y, 1, 1); };
    const hub = { x: 6, y: 33 };
    for (let y = 0; y < 36; y++) for (let x = 0; x < 40; x++) {
      const dx = x + 0.5 - hub.x, dy = y + 0.5 - hub.y, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), n = hash(x, y);
      const span = a > -1.62 && a < -0.08 + 0.12 * Math.sin(r);
      const rim = span && r > 27 && r < 33.5 - (n < 0.2 ? 1 : 0), band = rim && [-1.45, -0.85, -0.3].some((b) => Math.abs(a - b) < 0.06);
      const spoke = r > 4 && r < 28 && [-1.2, -0.55].some((b) => Math.abs(Math.sin(a - b)) * r < 1.4 && Math.cos(a - b) > 0);
      const center = r < 5;
      if (band) put(x, y, n < 0.3 ? [96, 92, 90] : [54, 52, 54]);
      else if (rim || spoke || center) put(x, y, (y * 7 + x) % 11 === 0 ? [36, 22, 14] : n < 0.18 ? [110, 20, 22] : n < 0.6 ? [92, 62, 40] : [70, 46, 30]);
    }
    for (let y = 0; y < 6; y++) put(20 + (y % 2), y, [70, 68, 70]); // its chain from the hook (the middle of the top) down to the rim
  });
}
