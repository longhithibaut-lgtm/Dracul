import Phaser from 'phaser';
import { T } from './tuning.ts';
import { prelit } from './dark.ts';
import { BLOOD, bleed, run, ghoulTexture } from './enemy.ts';
import { octant } from './foes.ts';
import { FW, FH, SOLE, FRAMES, LAMPS, STRIDE, WALK } from './nourrice.data.ts';
import sheet from './nourrice.png';

// How La Nourrice des goules, « l'Araignée », looks (docs/maquettes/boss-nourrice-A-araignee.png): her sheet rendered
// offline from the mockup's own model, already lit (tools/art/nourrice.gen.mjs), drawn at half scale like the foes; her
// clinging goules drawn over her, each until it drops off. Gameplay (RoomScene, boss.ts) owns her state: her body is an
// invisible sprite on the floor (where blows and collisions reckon), her look is drawn `z` px above it (on the walls,
// under the vault, in the air). No mark on the floor tells her blows: her pose, her seal's gold, dust falling off her,
// the sound. Her effects here: the Order's chains snapping off her, dust, the lumps she hurls, her death.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;
const STRUCK = 0xff4a3a; // the hit flash: dyed with blood (fx-blood.ts)
const VIEW = ['side', 'side', 'down', 'side', 'side', 'side', 'up', 'side'], FLIP = [false, false, undefined, true, true, true, undefined, false];
const WALL_DY = 7; // her wall frames' body sits this much lower in their cell than her standing frames'
export const GOULES = 3;

export function preload(scene: Scene) {
  if (!scene.textures.exists('nourrice')) scene.load.image('nourrice', sheet);
}

/** Her at floor point (x, y) in `group`: the body (unseen), her look and her goules over it. */
export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  const tex = scene.textures.get('nourrice');
  if (!tex.has('side-corpse')) for (const [name, [ax, ay, w, h, ox, oy]] of Object.entries(FRAMES)) tex.add(name, 0, ax, ay, w, h)!.setTrim(FW, FH, ox, oy, w, h);
  const s = (group.create(x, y, 'nourrice', 'down-idle0') as Sprite).setOrigin(0.5, SOLE / FH).setScale(0.5).setVisible(false);
  s.setSize(80, 40).setOffset(FW / 2 - 40, SOLE - 20); // her body over the floor (blows reach farther: T.nourrice.reach)
  const blend = prelit(scene), img = () => scene.add.image(x, y, 'nourrice', 'down-idle0').setOrigin(0.5, SOLE / FH).setScale(0.5).setBlendMode(blend);
  s.setData({ img: img(), goules: Array.from({ length: GOULES }, img), clinging: Array(GOULES).fill(true), at: [x, y], walked: 0, born: scene.time.now, lookAt: scene.time.now, z: 0 });
  s.once(Phaser.GameObjects.Events.DESTROY, () => { s.getData('img')?.destroy(); for (const g of s.getData('goules') ?? []) g.destroy(); });
  return s;
}

/** The frame her state shows, `t` ms into it; `flip` her mirrored. */
function frame(s: Sprite, now: number): [string, boolean | undefined] {
  const st: string = s.getData('state'), t = now - s.getData('lookAt'), o = octant(s.getData('facing') ?? Math.PI / 2), v = VIEW[o], N = T.nourrice;
  const [ax, ay] = s.getData('at'), walked = s.getData('walked') + Math.hypot(s.x - ax, (s.y - ay) / 0.616);
  s.setData({ at: [s.x, s.y], walked });
  const crawl = `wall-wall${Math.floor((walked / STRIDE) * 4) % 4}`, dir = s.getData('dir') < 0;
  switch (st) {
    case 'tele': return [`${v}-${t < N.teleMs * 0.35 ? 'tele0' : 'tele1'}`, FLIP[o]];
    case 'snap': return [`${v}-tele1`, FLIP[o]];
    case 'spring': case 'climb': case 'fall': return [`${v}-leap`, FLIP[o]];
    case 'slam': case 'stuck': { const k = t / Math.max(1, s.getData('until') - s.getData('lookAt')); return [`${v}-${k < 0.35 ? 'slam' : k < 0.7 ? 'rise0' : 'rise1'}`, FLIP[o]]; }
    case 'rakeT': return [`${v}-rakeT`, FLIP[o]];
    case 'rake': return [`${v}-rake`, FLIP[o]];
    case 'wall': case 'creep': return [crawl, dir];
    case 'hold': return ['wall-wall0', dir];
    case 'hurlT': return ['wall-hurl', dir];
  }
  if (now - (s.getData('hitAt') ?? -1e9) < 200) return [`${v}-hurt`, FLIP[o]];
  if (s.body!.velocity.lengthSq() > 25) return [`${v}-walk${Math.floor((walked / STRIDE) * WALK) % WALK}`, FLIP[o]];
  return [`${v}-idle${Math.floor((now + 300) / 260) % 4}`, FLIP[o]];
}

/** Shows her as her state says, `flash`: struck. */
export function show(s: Sprite, now: number, flash: boolean) {
  const look = s.getData('img') as Phaser.GameObjects.Image, st = s.getData('state');
  if (st !== s.getData('was')) s.setData({ was: st, lookAt: now });
  if (flash && !s.getData('flashOn')) { s.setData('hitAt', now); bleed(s.scene, s.x, s.y, (s.getData('facing') ?? 0) + Math.PI, 8, 0.8, 0.9, 30); }
  s.setData('flashOn', flash);
  const [f, flip] = frame(s, now), wall = f.startsWith('wall'), z = s.getData('z') ?? 0;
  // trembling: her joints cracking as she rears, the chains snapping, holding over him
  const shake = ['tele', 'snap', 'hold'].includes(st) ? (Math.floor(now / 45) % 2 ? 0.5 : -0.5) * (st === 'snap' ? 2 : 1) : 0;
  const x = s.x + shake, y = s.y - z + (wall ? WALL_DY : 0), over = ['creep', 'hold', 'fall'].includes(st); // under the vault: over everyone
  if (flip !== undefined) s.setData('flip', flip);
  const fl = s.getData('flip') ?? false, hurt = now - (s.getData('hitAt') ?? -1e9) < 110 && flash;
  look.setFrame(f).setPosition(x, y).setFlipX(fl).setDepth(s.y + (over ? 400 : z > 0 ? 100 : 0)); // up the wall: before what stands at its foot (the reliquary)
  if (hurt) look.setTint(STRUCK); else look.clearTint();
  (s.getData('goules') as Phaser.GameObjects.Image[]).forEach((g, k) => {
    const on = s.getData('clinging')[k] && look.texture.has(`${f}-g${k}`);
    g.setVisible(on);
    if (on) { g.setFrame(`${f}-g${k}`).setPosition(x, y).setFlipX(fl).setDepth(look.depth + 0.1); if (hurt) g.setTint(STRUCK); else g.clearTint(); }
  });
}

/** Where her seal shines (dark.ts): its floor point and height, room px. */
export function lamp(s: Sprite) {
  const look = s.getData('img') as Phaser.GameObjects.Image, [lx, ly] = LAMPS[look.frame.name] ?? [FW / 2, SOLE - 200];
  return { x: look.x + ((lx - FW / 2) / 2) * (look.flipX ? -1 : 1), y: s.y, h: (SOLE - ly) / 2 + (s.getData('z') ?? 0) };
}

/** Goule `k` lets go of her: hidden; where it was (a floor point and its height, room px). */
export function shed(s: Sprite, k: number) {
  const look = s.getData('img') as Phaser.GameObjects.Image, g = (s.getData('goules') as Phaser.GameObjects.Image[])[k], f = FRAMES[`${look.frame.name}-g${k}`];
  s.getData('clinging')[k] = false;
  g.setVisible(false);
  const cx = f ? f[4] + f[2] / 2 : FW / 2, cy = f ? f[5] + f[3] / 2 : SOLE - 120;
  return { x: look.x + ((cx - FW / 2) / 2) * (look.flipX ? -1 : 1), y: s.y + 6, z: Math.max(0, (SOLE - cy) / 2 + (s.getData('z') ?? 0)) };
}

/** A goule falling `z` px to floor point (x, y) (the enemy sheet's ghoul, curled), then done(). */
export function fall(scene: Scene, x: number, y: number, z: number, done: () => void) {
  ghoulTexture(scene);
  const g = scene.add.image(x, y - z, 'enemy', 'lunge').setOrigin(0.5, 24 / 40).setDepth(y + 1);
  scene.tweens.add({ targets: g, y, angle: 160, duration: 180 + z * 3, ease: 'Quad.easeIn', onComplete: () => { g.destroy(); bleed(scene, x, y, -Math.PI / 2, 6, Math.PI, 0.6, 4); done(); } });
}

/** The Order's chains snapping off her (the phase's tell): iron links and sparks flung from her neck and wrists. */
export function snap(scene: Scene, s: Sprite) {
  const g = scene.add.graphics().setDepth(s.y + 500), at = scene.time.now, look = s.getData('img') as Phaser.GameObjects.Image;
  const from = [[0, -48], [-26, -30], [26, -30], [-34, -10], [34, -10]].map(([dx, dy]) => ({ x: look.x + dx, y: s.y + dy }));
  const bits = from.flatMap((p, i) => Array.from({ length: 7 }, (_, k) => ({ ...p, a: (k / 7) * 6.28 + i, v: 30 + ((k * 37 + i * 11) % 40), link: k < 3 })));
  scene.cameras.main.shake(260, new Phaser.Math.Vector2(4 / scene.cameras.main.width, 4 / scene.cameras.main.height));
  run(scene, 700, () => {
    const t = (scene.time.now - at) / 1000;
    g.clear();
    for (const b of bits) {
      const x = b.x + Math.cos(b.a) * b.v * t, y = b.y + Math.sin(b.a) * b.v * t * 0.7 + 120 * t * t;
      if (b.link) g.fillStyle(0x6a6058, 1).fillRect(Math.round(x) - 1, Math.round(y), 3, 1).fillStyle(0x9a8e80, 1).fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
      else if (t < 0.35) g.fillStyle(t < 0.15 ? 0xfff2c8 : 0xe8a040, 1).fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }, () => g.destroy());
}

/** Dust and grit falling off her from `z` px over floor point (x, y): a few motes, each drifting down to the floor. */
export function dust(scene: Scene, x: number, y: number, z: number) {
  for (let i = 0; i < 3; i++) {
    const dx = Phaser.Math.Between(-22, 22), m = scene.add.rectangle(x + dx, y - z + Phaser.Math.Between(-6, 6), 1, Phaser.Math.Between(1, 2), Phaser.Utils.Array.GetRandom([0x9a8c76, 0x6e6252, 0xb0a288])).setDepth(y + 450).setAlpha(0.8);
    scene.tweens.add({ targets: m, y: y + Phaser.Math.Between(-4, 4), x: m.x + Phaser.Math.Between(-3, 3), duration: 300 + z * 5, ease: 'Quad.easeIn', onComplete: () => m.destroy() });
  }
}

/** A lump of bones and earth (or, `goule`, one of her brood) hurled from (x, y - z) to floor point `to`, landing `ms`
 *  later on a high arc; then land(). Seen in the air only: nothing marks where it falls. */
export function hurl(scene: Scene, from: { x: number; y: number; z: number }, to: { x: number; y: number }, ms: number, goule: boolean, land: () => void) {
  if (goule) ghoulTexture(scene);
  const o = goule ? scene.add.image(0, 0, 'enemy', 'lunge').setOrigin(0.5, 0.6) : scene.add.graphics();
  if (!goule) (o as Phaser.GameObjects.Graphics).fillStyle(0x3a3026).fillRect(-3, -2, 6, 4).fillStyle(0xb4a68c).fillRect(-2, -3, 3, 2).fillStyle(0x6e6252).fillRect(0, 0, 3, 2).fillStyle(0xd8ccb0).fillRect(-3, 0, 1, 1);
  run(scene, ms, (t) => {
    const k = Math.min(1, (t * 1000) / ms), x = Phaser.Math.Linear(from.x, to.x, k), y = Phaser.Math.Linear(from.y, to.y, k), h = from.z * (1 - k) + 50 * Math.sin(Math.PI * k);
    o.setPosition(Math.round(x), Math.round(y - h)).setDepth(y + 1).setAngle(k * 540);
  }, () => {
    o.destroy();
    bleed(scene, to.x, to.y, -Math.PI / 2, 10, Math.PI, 0.8, 2, goule ? undefined : [0xb4a68c, 0x6e6252, 0x3a3026, BLOOD.dark]);
    land();
  });
}

/** She dies: struck, she sinks on her limbs, collapses, and her corpse stays, legs curled, in a spreading pool. */
export function die(scene: Scene, s: Sprite) {
  const look = s.getData('img') as Phaser.GameObjects.Image, { x, y } = s, fl = look.flipX;
  for (const g of s.getData('goules') as Phaser.GameObjects.Image[]) g.setVisible(false);
  look.setTint(STRUCK).setFrame(look.frame.name.startsWith('wall') ? 'side-leap' : `${look.frame.name.split('-')[0]}-hurt`).setPosition(x, y);
  bleed(scene, x, y, -Math.PI / 2, 40, Math.PI, 1.4, 40);
  scene.time.delayedCall(260, () => look.clearTint().setFrame('side-slam'));
  scene.time.delayedCall(700, () => {
    look.setFrame('side-corpse').setDepth(1.6).setFlipX(fl).setTint(0xb0b0b0);
    scene.cameras.main.shake(300, new Phaser.Math.Vector2(4 / scene.cameras.main.width, 4 / scene.cameras.main.height));
    for (let i = 0; i < 6; i++) bleed(scene, x, y, (i * Math.PI) / 3, 10, Math.PI / 5, 1.2, 4);
  });
}
