import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import { floor, haul, netAt, netted } from './fauna.ts';
import type { Ctx } from './foes.ts';

// Le Crocheteur (T.crocheteur, fauna.ts; docs/maquettes/necropole-ennemis-planche-3.png): a netter of the Order. He keeps
// at mid range and backs off from the claws. He whirls his weighted net open over his head, faster and faster, the leads
// whistling (spin, the tell: his aim on the hero until just before it leaves), then flings it straight (toss): it flies
// open, turning, and nets the hero it passes over (RoomScene net(): no mist nor blows, slowed, until he tears free). The
// hero netted, he comes in and raises his boat-hook (hook), takes the net with it and hauls him (drag) toward the nearest
// other foe or lantern, else his post. Foes.show draws his body; this file, the net flying and the hook's pole to it.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Net = { x: number; y: number; aim: number; at: number; caught?: boolean };
const SQ = T.lantern.squash;
const flight = () => (T.crocheteur.netRange / T.crocheteur.netSpeed) * 1000;

export function step(c: Ctx, e: Sprite, time: number) {
  const K = T.crocheteur, from = e.body!.center, to = c.hero.body!.center, at: number = e.getData('fireAt');
  const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
  const fx = fxOf(c.scene, e);
  fx.clear();
  const net = e.getData('net') as Net | undefined;
  if (net) { // in flight, then lying where it fell a moment
    const p = netAt(net, net.aim, time - net.at);
    if (!net.caught && time - net.at <= flight() && !c.netted() && !c.dodging() && netted(p, to)) {
      net.caught = true;
      c.net();
      c.damageHero(K.netDamage, p);
      Sfx.play(c.scene, 'thunk');
    }
    if (net.caught || time - net.at > flight() + 600) e.setData('net', undefined);
    else { // flying in at his chest's height, sinking as it goes; then lying flat
      const k = (time - net.at) / flight();
      drawNet(fx, p.x, p.y - (k > 1 ? 0 : 8 + 16 * (1 - k)), 12, (time - net.at) / 90, k > 1 ? 0.5 : 1);
    }
  }
  switch (e.getData('state')) {
    case 'spin': // his aim follows the hero, then holds; the net leaves
      if (time < at - K.netLockMs) e.setData({ aim: toHero, facing: toHero });
      if (time < at) return void e.setVelocity(0);
      e.setVelocity(0).setData({ state: 'toss', fireAt: time + flight(), net: { x: from.x, y: from.y, aim: e.getData('aim'), at: time } });
      return void Sfx.play(c.scene, 'swoosh', 0.3);
    case 'toss':
      e.setVelocity(0);
      if (time >= at) e.setData({ state: 'recover', fireAt: time + K.recoverMs, readyAt: time + (c.netted() ? K.recoverMs : K.reloadMs) }); // caught: straight in for the hook
      return;
    case 'hook':
      e.setVelocity(0);
      if (time < at) return;
      if (!c.netted() || dist > K.gaffReach + 8) return void e.setData({ state: 'recover', fireAt: time + K.recoverMs, readyAt: time + K.reloadMs / 2 });
      c.damageHero(K.hookDamage, from);
      e.setData({ state: 'drag', fireAt: time + K.dragMs, haul: haul(to, c.marks(e), e.getData('home')) });
      c.hold(e, { ...e.getData('haul'), speed: K.dragSpeed });
      return void Sfx.play(c.scene, 'chains');
    case 'drag': { // ahead of him toward where he hauls him, walking backward, the hook in the net
      const h = e.getData('haul');
      if (time >= at || !c.netted() || floor(to, h) < 24) return void letGo(c, e, time);
      const a = Phaser.Math.Angle.BetweenPoints(to, h), spot = { x: to.x + Math.cos(a) * K.gaff, y: to.y + Math.sin(a) * K.gaff * SQ };
      if (Phaser.Math.Distance.BetweenPoints(from, spot) > 3) c.scene.physics.velocityFromRotation(Phaser.Math.Angle.BetweenPoints(from, spot), K.dragSpeed * 1.5, e.body!.velocity);
      else e.setVelocity(0);
      e.setData({ facing: toHero, aim: toHero });
      return void pole(fx, e, c.hero);
    }
    case 'recover':
      e.setVelocity(0);
      if (time < at) return;
  }
  e.setData('state', 'chase');
  if (!c.hunts(e)) return c.idle(e);
  const ready = time >= (e.getData('readyAt') ?? 0) && c.scene.cameras.main.worldView.contains(from.x, from.y), fl = floor(from, to);
  if (c.netted()) { // in for the hook
    if (ready && dist <= K.gaffReach) {
      e.setVelocity(0).setData({ state: 'hook', fireAt: time + K.hookTeleMs, facing: toHero, aim: toHero });
      return void Sfx.play(c.scene, 'heave', K.hookTeleMs / 1000);
    }
    c.scene.physics.velocityFromRotation(c.way(e).angle, K.speed, e.body!.velocity);
    return void e.setData('facing', toHero);
  }
  if (ready && fl >= K.flee && fl <= K.netRange * 0.9 && c.way(e).straight) {
    e.setVelocity(0).setData({ state: 'spin', fireAt: time + K.netTeleMs, facing: toHero, aim: toHero });
    return void Sfx.play(c.scene, 'spin', K.netTeleMs / 1000);
  }
  if (fl < K.flee) { // away from the claws
    c.scene.physics.velocityFromRotation(toHero + Math.PI, K.fleeSpeed, e.body!.velocity);
    return void e.setData('facing', toHero);
  }
  c.keepAt(e, toHero, dist, K.near, K.far, K.speed);
}

/** He lets the hook go (the hero free, there, or the haul too long): back off a moment. */
export function letGo(c: Ctx, e: Sprite, time: number) {
  if (c.heldBy() === e) c.hold(undefined);
  e.setData({ state: 'recover', fireAt: time + T.crocheteur.recoverMs, readyAt: time + T.crocheteur.reloadMs });
}

// His own layer for the net in flight and the hook's pole (Foes.show clears his markG), over the floor's sprites.
function fxOf(scene: Phaser.Scene, e: Sprite) {
  let g = e.getData('fxG') as Phaser.GameObjects.Graphics | undefined;
  if (!g) {
    g = scene.add.graphics().setDepth(7980);
    e.setData('fxG', g).once(Phaser.GameObjects.Events.DESTROY, () => g!.destroy());
  }
  return g;
}

/** The weighted net, open, seen from above at floor point (x, y) (its middle `r` px out), turned by `turn` rad: its cords
 *  in rings and spokes, its leads round the rim. */
export function drawNet(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, turn: number, alpha = 1) {
  const spokes = 12;
  g.lineStyle(0.5, 0x7a6a4c, 0.9 * alpha); // (tarred cord catching the light)
  for (let i = 0; i < spokes; i++) {
    const a = turn + (i * 2 * Math.PI) / spokes;
    g.lineBetween(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r * SQ);
  }
  for (const k of [0.35, 0.68, 1]) g.strokeEllipse(x, y, 2 * r * k, 2 * r * k * SQ, 24);
  for (let i = 0; i < spokes; i++) {
    const a = turn + ((i + 0.5) * 2 * Math.PI) / spokes;
    g.fillStyle(i % 2 ? 0x6a6a72 : 0x9a9aa2, alpha).fillRect(Math.round(x + Math.cos(a) * r) - 0.5, Math.round(y + Math.sin(a) * r * SQ) - 0.5, 1, 1);
  }
}

/** The net over the hero standing at (x, y) (his sprite's point), the leads hanging at his knees; `shake`: his struggle. */
export function drawNetted(g: Phaser.GameObjects.Graphics, x: number, y: number, shake: number) {
  const top = { x: x + shake, y: y - 22 }, bot = y + 7, w = 8;
  g.lineStyle(0.5, 0x2e271c, 0.85);
  for (let i = 0; i <= 8; i++) g.lineBetween(top.x, top.y, x - w + (i * 2 * w) / 8 + shake * 0.4, bot); // cords draped from his head
  for (const k of [0.3, 0.55, 0.8, 1]) g.strokeEllipse(top.x + (x - top.x) * k, top.y + (bot - top.y) * k, 2 * w * k + 1, 3 * k + 1, 16); // and their knots, round him
  for (let i = 0; i < 6; i++) g.fillStyle(0x3a3a40, 1).fillRect(Math.round(x - w + (i * 2 * w) / 5 + shake * 0.4) - 0.5, bot - (i % 2) * 0.5, 1, 1); // the leads at his feet
}

// The hook's iron bitten into the net on the hero (his sheet holds the pole out to him, `gaff` long).
function pole(g: Phaser.GameObjects.Graphics, e: Sprite, hero: Sprite) {
  const a = Math.atan2(e.y - hero.y, e.x - hero.x);
  g.lineStyle(1, 0x8a8a90, 1).beginPath().arc(hero.x + Math.cos(a) * 3, hero.y - 8, 2.5, a - 2, a + 2).strokePath();
}
