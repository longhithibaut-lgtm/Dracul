import Phaser from 'phaser';
import { T } from './tuning.ts';
import { prelit } from './dark.ts';
import { bleed, run } from './enemy.ts';
import { FW, FH, SOLE, FRAMES, SPOTS } from './matrice.data.ts';
import sheet from './matrice.png';

// How La Matrice looks (docs/maquettes/boss-nourrice-B-matrice.png): her sheet rendered offline from the mockup's own
// model, already lit (tools/art/matrice.gen.mjs), drawn at half scale like the foes; her two chains up to the vault and
// her umbilical cords to the goules drawn here, each frame. Gameplay (RoomScene, boss.ts) owns her state: her body is an
// invisible sprite on the floor under the wheel (where blows and the swing reckon), her look is drawn `z` px above it.
// No mark on the floor tells her swing: the wheel drawn back, the sac's light, the cords pulled taut, the chains' creak.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Scene = Phaser.Scene;
type P = { x: number; y: number };
const STRUCK = 0xff4a3a; // the hit flash: dyed with blood (fx-blood.ts)
export const SLIME = [0x8a8a50, 0x6a6a38, 0xb0aa6a, 0x4a1420]; // what drips from her sac

export function preload(scene: Scene) {
  if (!scene.textures.exists('matrice')) scene.load.image('matrice', sheet);
}

/** Her wheel hung over floor point (x, y), its pivot, in `group`: the body (unseen), her look, her chains and cords. */
export function create(scene: Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  const tex = scene.textures.get('matrice');
  if (!tex.has('dead')) for (const [name, [ax, ay, w, h, ox, oy]] of Object.entries(FRAMES)) tex.add(name, 0, ax, ay, w, h)!.setTrim(FW, FH, ox, oy, w, h);
  const s = (group.create(x, y, 'matrice', 'idle0') as Sprite).setOrigin(0.5, SOLE / FH).setScale(0.5).setVisible(false);
  s.setSize(120, 40).setOffset(FW / 2 - 60, SOLE - 20); // the wheel's foot over the floor (blows reach farther: T.matrice.reach)
  const look = scene.add.image(x, y, 'matrice', 'idle0').setOrigin(0.5, SOLE / FH).setScale(0.5).setBlendMode(prelit(scene));
  s.setData({ img: look, chains: scene.add.graphics(), cords: scene.add.graphics(), lookAt: scene.time.now, z: 0 });
  s.once(Phaser.GameObjects.Events.DESTROY, () => { for (const k of ['img', 'chains', 'cords']) s.getData(k)?.destroy(); });
  return s;
}

/** The frame her state shows. */
function frame(s: Sprite, now: number) {
  const st: string = s.getData('state'), t = now - s.getData('lookAt'), two = s.getData('phase') === 2, M = T.matrice;
  const spin = (ms: number) => `spin${Math.floor(now / ms) % 12}`;
  const hurt = now - (s.getData('hitAt') ?? -1e9) < 200;
  if (st === 'tear') return 'tear';
  if (st === 'dead') return 'dead';
  if (two) return hurt && st === 'low' ? 'hurt2' : spin(st === 'low' ? 260 : st === 'pull' ? 70 : st === 'swing' ? 50 : 140);
  if (st === 'pull') return t < M.teleMs * 0.35 ? 'pull0' : 'pull1';
  if (st === 'swing') return t < M.swingMs * 0.3 ? 'swing0' : 'swing1';
  if (hurt) return 'hurt';
  if (st === 'low') return 'low';
  return `idle${Math.floor((now + 300) / 420) % 4}`;
}

/** Where, on the screen, cell point (cx, cy) of her look is. */
const spot = (look: Phaser.GameObjects.Image, cx: number, cy: number): P => ({ x: look.x + ((cx - FW / 2) / 2) * (look.flipX ? -1 : 1), y: look.y + (cy - SOLE) / 2 });

/** Shows her as her state says, `flash`: struck; her chains up to `pivot` (a floor point, the vault T.matrice.vault over
 *  it) and her cords to the goules `fed` (their feet), taut while `taut`. */
export function show(s: Sprite, now: number, flash: boolean, pivot: P | undefined, fed: P[], taut: boolean) {
  const look = s.getData('img') as Phaser.GameObjects.Image, st = s.getData('state');
  if (st !== s.getData('was')) s.setData({ was: st, lookAt: now });
  if (flash && !s.getData('flashOn')) s.setData('hitAt', now);
  s.setData('flashOn', flash);
  const f = frame(s, now), z = s.getData('z') ?? 0;
  const shake = st === 'tear' || (st === 'pull' && s.getData('phase') === 2) ? (Math.floor(now / 45) % 2 ? 0.6 : -0.6) : 0; // the wheel shuddering
  look.setFrame(f).setPosition(s.x + shake, s.y - z).setFlipX(!!s.getData('flip')).setDepth(s.y + (z > 6 ? 300 : 0)); // up, over who walks under
  if (flash && now - (s.getData('hitAt') ?? -1e9) < 110) look.setTint(STRUCK); else look.clearTint();
  const [sx, sy, hx, hy] = SPOTS[f], sac = spot(look, sx, sy), hub = spot(look, hx, hy);
  // her chains: from the hub's axle, behind the wheel, up to the vault
  const ch = (s.getData('chains') as Phaser.GameObjects.Graphics).clear().setDepth(look.depth - 0.2);
  if (pivot && st !== 'dead') for (const k of [-1, 1]) {
    const a = { x: hub.x + k * 4, y: hub.y }, b = { x: pivot.x + k * 10, y: pivot.y - T.matrice.vault }, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let i = 0; i < n; i++) ch.fillStyle(i % 2 ? 0x6e6052 : 0x3a322c, 1).fillRect(Math.round(a.x + ((b.x - a.x) * i) / n) - (i % 2 ? 0 : 1), Math.round(a.y + ((b.y - a.y) * i) / n), i % 2 ? 1 : 2, 2);
  }
  // her cords: from the sac to each goule, sagging, pulled taut on the tell
  const co = (s.getData('cords') as Phaser.GameObjects.Graphics).clear().setDepth(look.depth + 0.1);
  for (const g of fed) {
    const to = { x: g.x, y: g.y - 3 }, sag = taut ? 2 : 10 + 0.08 * Math.hypot(to.x - sac.x, to.y - sac.y), n = 24;
    const pt = (t: number) => ({ x: Phaser.Math.Linear(sac.x, to.x, t), y: Phaser.Math.Linear(sac.y, to.y, t) + sag * 4 * t * (1 - t) + Math.sin(now / 180 + t * 9) * (taut ? 0.2 : 0.8) * t });
    co.lineStyle(2.4, 0x3a0e18, 1).strokePoints(Array.from({ length: n + 1 }, (_, i) => pt(i / n)) as Phaser.Math.Vector2[]);
    co.lineStyle(1, 0xb06068, 0.9).strokePoints(Array.from({ length: n + 1 }, (_, i) => { const p = pt(i / n); return { x: p.x, y: p.y - 0.5 }; }) as Phaser.Math.Vector2[]);
  }
}

/** Where her sac glows (dark.ts): its floor point and height, room px. */
export function lamp(s: Sprite) {
  const look = s.getData('img') as Phaser.GameObjects.Image, [sx, sy] = SPOTS[look.frame.name] ?? [FW / 2, SOLE - 60];
  return { x: spot(look, sx, sy).x, y: s.y, h: (SOLE - sy) / 2 + (s.getData('z') ?? 0) };
}

/** Her sac's heart on the screen, and its height over her floor point (where a goule is born from, where slime drips). */
export function sac(s: Sprite) {
  const look = s.getData('img') as Phaser.GameObjects.Image, [sx, sy] = SPOTS[look.frame.name] ?? [FW / 2, SOLE - 60], p = spot(look, sx, sy);
  return { x: p.x, y: s.y + 4, z: s.y + 4 - p.y };
}

/** The sac tearing (phase 2's tell): slime and blood bursting out of it, the chains' links snapping, the room shaken. */
export function tear(scene: Scene, s: Sprite) {
  const p = sac(s);
  scene.cameras.main.shake(400, new Phaser.Math.Vector2(4 / scene.cameras.main.width, 4 / scene.cameras.main.height));
  bleed(scene, p.x, p.y, -Math.PI / 2, 30, Math.PI, 1.1, p.z, SLIME);
  bleed(scene, p.x, p.y, -Math.PI / 2, 14, Math.PI, 0.9, p.z);
  const g = scene.add.graphics().setDepth(s.y + 500), at = scene.time.now, top = { x: s.x, y: s.y - (s.getData('z') ?? 0) - 70 };
  const bits = Array.from({ length: 16 }, (_, k) => ({ a: (k / 16) * 6.28, v: 30 + ((k * 37) % 40) }));
  run(scene, 800, () => {
    const t = (scene.time.now - at) / 1000;
    g.clear();
    for (const b of bits) g.fillStyle(0x6a6058, 1).fillRect(Math.round(top.x + Math.cos(b.a) * b.v * t) - 1, Math.round(top.y + Math.sin(b.a) * b.v * t * 0.7 + 140 * t * t), 3, 1);
  }, () => g.destroy());
}

/** A drop of slime falling from the torn sac. */
export function drip(scene: Scene, s: Sprite) {
  const p = sac(s);
  bleed(scene, p.x + Phaser.Math.Between(-6, 6), p.y, Math.PI / 2, 1, 0.4, 0.2, p.z, SLIME, 0.5);
}

/** She dies: the chains give, the wheel crashes down, and lies on its back on the floor in a spreading pool. */
export function die(scene: Scene, s: Sprite) {
  const look = s.getData('img') as Phaser.GameObjects.Image, { x, y } = s, z0 = s.getData('z') ?? 0;
  (s.getData('cords') as Phaser.GameObjects.Graphics).clear();
  (s.getData('chains') as Phaser.GameObjects.Graphics).clear();
  look.setTint(STRUCK).setFrame('fall');
  scene.tweens.addCounter({ from: z0, to: 0, duration: 260 + z0 * 4, ease: 'Quad.easeIn', onUpdate: (tw) => look.setPosition(x, y - (tw.getValue() ?? 0)), onComplete: () => {
    look.clearTint().setFrame('dead').setDepth(1.6).setPosition(x, y);
    scene.cameras.main.shake(400, new Phaser.Math.Vector2(6 / scene.cameras.main.width, 6 / scene.cameras.main.height));
    for (let i = 0; i < 6; i++) bleed(scene, x, y, (i * Math.PI) / 3, 10, Math.PI / 5, 1.2, 6, i % 2 ? SLIME : undefined);
  } });
}
