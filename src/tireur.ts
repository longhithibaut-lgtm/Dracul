import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import * as Foes from './foes.ts';
import { SHEETS } from './foes.data.ts';
import { floor, leaves, perchFor, screenLen, shotHits, type Perch } from './fauna.ts';
import type { Ctx } from './foes.ts';

// Le Tireur du mausolée (T.tireur, fauna.ts; docs/maquettes/necropole-ennemis-planche-3.png): a marksman of the Order
// posted on a roof (post), drawn `z` px over his floor point, out of the claws' reach (RoomScene.aloft()); shards reach
// him. Loaded and the hero in range on a clear line, he kneels at his fork and blows on his match's ember, which brightens
// (sight, the tell; his aim on the hero), the lock clicks (his aim held), a beat, the shot: a silver ball along that line,
// a tracer, smoke (shoot). Then he rams the next ball home standing (ram, long). The hero near him or his ladder, he
// leaves the roof by the ladder (descend: along the roof, then down it; its foot is where the claws catch him) for the
// perch whose ladder is farthest from the hero, and climbs it (climb). Foes.show draws his body; this file, his height,
// the ember's glow, the tracer and the smoke. Nothing on the floor: the ember, the click, the shot.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Pt = { x: number; y: number };
const S = SHEETS.tireur;
const ALONG = 0.35; // of a climb, the part walked along the roof (the rest on the ladder)
const MUZZLE = 34; // floor px from the ember to the muzzle, along his aim
const CHEST = 12; // room px over the floor where his ball meets the hero

/** At his first perch (more: where he goes when driven off it); `placeholder`: a stand-in roof and ladder drawn at each
 *  (the training room; the zone's are its own mausoleums). */
export function create(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, perches: Perch[], placeholder: boolean) {
  const p = perches[0], e = Foes.create(scene, group, 'tireur', p.x, p.y);
  if (placeholder) for (const q of perches) roof(scene, q);
  lift(e, p.h);
  return e.setData({ perches, perch: p, loaded: true });
}

/** The training room's perch at floor point p: a roof `T.tireur.h` high, its ladder 34 px east. */
export const perchAt = (p: Pt): Perch => ({ x: p.x, y: p.y, h: T.tireur.h, ladder: { x: p.x + 34, y: p.y } });

/** Up on a roof (or a ladder): his body stays on the floor, never shoved off his perch (RoomScene: immovable). */
export const perched = (e: Sprite) => (e.getData('z') ?? 0) > 0;

// His feet `z` room px over his floor point: the sprite drawn that high, his body (foes.ts FEET) kept on the floor.
function lift(e: Sprite, z: number) {
  e.setOrigin(0.5, (S.SOLE - 20 + 2 * z) / S.FH);
  e.body!.setOffset(S.FW / 2 - 12, S.SOLE - 8 + 2 * z);
  e.setData({ z, unshaded: z > 0 }); // (no shadow laid on a floor he is not on)
}

export function step(c: Ctx, e: Sprite, time: number) {
  const K = T.tireur, from = e.body!.center, to = c.hero.body!.center, at: number = e.getData('fireAt'), z: number = e.getData('z');
  const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = floor(from, to), perch: Perch = e.getData('perch');
  const fx = fxOf(c.scene, e);
  trail(fx, e, time);
  let state = e.getData('state');
  if (z > 0 && state !== 'descend' && state !== 'climb') {
    e.setPosition(perch.x, perch.y).setVelocity(0); // (a shard's knock, a glyph: he holds his roof)
    if (state === 'chase') state = 'post';
  }
  switch (state) {
    case 'sight': { // the ember brightening, his aim on the hero; at the click, held
      e.setVelocity(0);
      const lock = at - K.delayMs;
      if (time < lock) e.setData({ aim: toHero, facing: toHero });
      else if (!e.getData('clicked')) {
        e.setData('clicked', true);
        Sfx.play(c.scene, 'click');
      }
      ember(fx, e, Phaser.Math.Clamp(1 - (lock - time) / K.blowMs, 0, 1), time);
      if (time >= at) shoot(c, e, from, to, time);
      return;
    }
    case 'shoot':
      e.setVelocity(0);
      if (time >= at) e.setData({ state: 'ram', fireAt: time + K.reloadMs });
      return;
    case 'ram':
      e.setVelocity(0);
      if (z > 0 && c.hunts(e) && leaves(perch, to)) return void descend(e, perchFor(e.getData('perches'), to), time); // the ball left half down
      if (time >= at) e.setData({ state: z > 0 ? 'post' : 'chase', loaded: true, readyAt: time + 300 });
      return;
    case 'descend': case 'climb': { // along the roof to the ladder's head and down it, or up it and along the roof
      const k = Math.min(1, 1 - (at - time) / K.climbMs), down = state === 'descend', from0: Perch = e.getData('from'), to0: Perch = e.getData('perch');
      const roof = down ? from0 : to0, u = down ? k : 1 - k; // u: 0 at the perch's spot, 1 at the ladder's foot
      const p = u < ALONG ? lerp(roof, roof.ladder, u / ALONG) : roof.ladder, h = u < ALONG ? roof.h : roof.h * (1 - (u - ALONG) / (1 - ALONG));
      lift(e, time >= at ? (down ? 0 : roof.h) : h);
      e.setPosition(p.x, p.y).setVelocity(0);
      e.setData('facing', u < ALONG ? Phaser.Math.Angle.BetweenPoints(down ? roof : roof.ladder, down ? roof.ladder : roof) : -Math.PI / 2); // on the ladder, his back to us
      if (time >= at) e.setData({ state: down ? 'chase' : 'post', readyAt: Math.max(e.getData('readyAt') ?? 0, time + 400) });
      return;
    }
  }
  const ready = e.getData('loaded') && time >= (e.getData('readyAt') ?? 0) && c.scene.cameras.main.worldView.contains(from.x, from.y), clear = () => dist <= K.range && c.ray(from, toHero) >= Phaser.Math.Distance.BetweenPoints(from, to) - 2;
  const sight = () => {
    e.setVelocity(0).setData({ state: 'sight', fireAt: time + K.blowMs + K.delayMs, clicked: false, aim: toHero, facing: toHero });
    Sfx.play(c.scene, 'fuse', K.blowMs / 1000);
  };
  if (z > 0) { // on his roof
    e.setData('state', 'post');
    if (!c.hunts(e)) return;
    e.setData('facing', toHero);
    if (leaves(perch, to)) return void descend(e, perchFor(e.getData('perches'), to), time);
    if (!e.getData('loaded')) return void e.setData({ state: 'ram', fireAt: time + K.reloadMs });
    if (ready && clear()) sight();
    return;
  }
  // On the ground: back up a roof when he can, shooting meanwhile.
  e.setData('state', 'chase');
  const next = perchFor(e.getData('perches'), to), hunting = c.hunts(e), away = !hunting || !leaves(next, to);
  e.setData('perch', next);
  if (away && Phaser.Math.Distance.BetweenPoints(e, next.ladder) < 4) {
    e.setData({ state: 'climb', fireAt: time + K.climbMs, from: next });
    return void Sfx.play(c.scene, 'joints', 0.4);
  }
  if (hunting && !e.getData('loaded')) return void e.setVelocity(0).setData({ state: 'ram', fireAt: time + K.reloadMs, facing: toHero });
  if (hunting && ready && dist >= K.near * 0.6 && clear()) return sight();
  if (away) {
    const a = Phaser.Math.Angle.BetweenPoints(e, next.ladder);
    c.scene.physics.velocityFromRotation(a, Math.min(K.speed, Phaser.Math.Distance.BetweenPoints(e, next.ladder) * 8), e.body!.velocity);
    return void e.setData('facing', a);
  }
  c.keepAt(e, toHero, dist, K.near, K.far, K.speed);
}

function descend(e: Sprite, next: Perch, time: number) {
  e.setData({ state: 'descend', fireAt: time + T.tireur.climbMs, from: e.getData('perch'), perch: next });
}

// The shot along his held aim: the ball flies on until a prop, a wall or its range stops it; the hero's feet on its
// line are struck (the mist lets it through, damageHero()). A tracer, smoke, the boom.
function shoot(c: Ctx, e: Sprite, from: Pt, to: Pt, time: number) {
  const K = T.tireur, aim: number = e.getData('aim'), reach = Math.min(c.ray(from, aim), screenLen(K.range * 1.25, aim));
  const hit = shotHits(from, aim, reach, to);
  if (hit) c.damageHero(K.damage, from);
  // The ball drops from his muzzle to the height of the hero's chest where he was aimed at, and on down to the floor.
  const m = muzzle(e), h0 = from.y + 8 - m.y, aimed = Math.max(20, (to.x - from.x) * Math.cos(aim) + (to.y - from.y) * Math.sin(aim)), d = hit ? aimed : reach;
  const h = Math.max(0, h0 + ((CHEST - h0) * d) / aimed), end = { x: from.x + Math.cos(aim) * d, y: from.y + 8 + Math.sin(aim) * d - h };
  e.setData({ state: 'shoot', fireAt: time + K.shotMs, loaded: false, tracer: { m, end, at: time } });
  c.scene.cameras.main.shake(90, new Phaser.Math.Vector2(2 / c.scene.cameras.main.width, 2 / c.scene.cameras.main.height));
  Sfx.play(c.scene, 'arquebus');
}

/** Where his match's ember glows (his sheet's lamp, wherever this frame has it), on the screen. */
function emberAt(e: Sprite) {
  const [lx, ly] = (e.frame.customData as { lamp: [number, number] }).lamp;
  return { x: e.x + ((lx - S.FW / 2) / 2) * (e.flipX ? -1 : 1), y: e.y + (ly - S.SOLE) / 2 + 10 - (e.getData('z') ?? 0) };
}
const muzzle = (e: Sprite) => {
  const p = emberAt(e), a: number = e.getData('aim'), d = screenLen(MUZZLE, a);
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
};

/** His lights in the dark rooms (dark.ts): the ember blown bright on the tell, the flash of the shot. */
export function lights(e: Sprite, time: number) {
  const p = emberAt(e), feet = e.y + 10, st = e.getData('state');
  if (st === 'sight') return [{ x: p.x, y: feet, h: feet - p.y, lit: true, I: 0.3 + 1.2 * Phaser.Math.Clamp(1 - (e.getData('fireAt') - T.tireur.delayMs - time) / T.tireur.blowMs, 0, 1) }];
  if (st === 'shoot' && time - e.getData('tracer').at < 90) return [{ ...muzzle(e), y: feet, h: feet - muzzle(e).y, lit: true, I: 3.5 }];
  return [];
}

// The ember blown on: a coal brightening to white-hot, its halo swelling and breathing with his breath.
function ember(g: Phaser.GameObjects.Graphics, e: Sprite, k: number, time: number) {
  const p = emberAt(e), breath = 0.75 + 0.25 * Math.sin(time / 70), x = Math.round(p.x), y = Math.round(p.y);
  g.fillStyle(0xff6a18, (0.12 + 0.3 * k) * breath).fillCircle(x, y, 1.5 + 3.5 * k * breath);
  g.fillStyle(0xffa040, 0.35 + 0.5 * k).fillCircle(x, y, 0.8 + 1.2 * k);
  g.fillStyle(k > 0.95 ? 0xfff4d0 : 0xffd080, 0.7 + 0.3 * k).fillRect(x - 0.5, y - 0.5, 1, 1);
}

// The ball's streak flying from the muzzle (a hot white head, a fading tail), the muzzle's flash, its smoke rolling up
// and drifting along the aim, dust or blood where it ends.
function trail(g: Phaser.GameObjects.Graphics, e: Sprite, time: number) {
  const tr = e.getData('tracer') as { m: Pt; end: Pt; at: number } | undefined, age = tr ? time - tr.at : Infinity;
  if (!tr || age > 1400) return;
  const { m, end } = tr, at = (k: number) => ({ x: m.x + (end.x - m.x) * k, y: m.y + (end.y - m.y) * k });
  if (age < 220) {
    const head = at(Math.min(1, age / 50)), tail = at(Phaser.Math.Clamp((age - 30) / 190, 0, 1)), f = 1 - age / 220;
    g.lineStyle(2, 0xffb050, 0.35 * f).lineBetween(tail.x, tail.y, head.x, head.y);
    g.lineStyle(1, 0xfff6dc, f).lineBetween(tail.x, tail.y, head.x, head.y);
  }
  if (age < 70) { // the flash
    const f = 1 - age / 70, r = 2 + 4 * f;
    g.fillStyle(0xffd27a, 0.5 * f).fillCircle(m.x, m.y, r);
    g.fillStyle(0xffffff, f).fillRect(Math.round(m.x) - r, Math.round(m.y), 2 * r + 1, 1).fillRect(Math.round(m.x), Math.round(m.y) - r / 2, 1, r + 1);
  }
  for (let i = 0; i < 9; i++) { // the smoke
    const k = Math.min(1, age / 1400), h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h), d = i * 2.2 * (0.4 + k);
    const a = Math.atan2(end.y - m.y, end.x - m.x), x = m.x + Math.cos(a) * d + (u - 0.5) * 6 * k, y = m.y + Math.sin(a) * d - 10 * k * (0.5 + u);
    g.fillStyle(u > 0.5 ? 0x8a8478 : 0x6a655c, 0.45 * (1 - k)).fillCircle(x, y, 1.2 + 4 * k * (0.5 + u));
  }
  if (age >= 50 && age < 400) { // where it ends: chips and dust
    const k = (age - 50) / 350;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.45, v = 10 + i * 3;
      g.fillStyle(i % 2 ? 0xb4a68c : 0x6e6252, 1 - k).fillRect(Math.round(end.x + Math.cos(a) * v * k), Math.round(end.y + Math.sin(a) * v * k + 20 * k * k), 1, 1);
    }
  }
}

const lerp = (a: Pt, b: Pt, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// His own layer (over the floor's sprites, unlit: the ember and the shot show in the dark), cleared every frame before
// he is stepped (so a daze leaves nothing behind).
function fxOf(scene: Phaser.Scene, e: Sprite) {
  let g = e.getData('fxG') as Phaser.GameObjects.Graphics | undefined;
  if (!g) {
    const gg = (g = scene.add.graphics().setDepth(9000)), clear = () => gg.clear();
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, clear);
    e.setData('fxG', g).once(Phaser.GameObjects.Events.DESTROY, () => { scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, clear); gg.destroy(); });
  }
  return g;
}

// shortcut: a stand-in mausoleum (a wall, its roof, a ladder) with nothing solid, for the training room; the zone's own
// mausoleums are the real perches.
function roof(scene: Phaser.Scene, p: Perch) {
  const w = 56, top = p.y + 10 - p.h, l = p.ladder, g = scene.add.graphics().setDepth(p.y - 0.5);
  g.fillStyle(0x3a342c).fillRect(p.x - w / 2 - 2, top - 18, w + 4, 18); // the roof
  g.fillStyle(0x4c463c).fillRect(p.x - w / 2 - 2, top - 1, w + 4, 2); // its edge
  g.fillStyle(0x24201c).fillRect(p.x - w / 2, top + 1, w, p.h - 1); // the wall
  g.fillStyle(0x16130f).fillRect(p.x - 6, top + p.h - 16, 12, 16); // the door
  g.fillStyle(0x5a4a34);
  for (const dx of [-3, 3]) g.fillRect(l.x + dx, top - 4, 1, l.y + 10 - top + 4); // the ladder's rails
  for (let y = l.y + 7; y > top - 2; y -= 5) g.fillRect(l.x - 3, y, 7, 1);
}
