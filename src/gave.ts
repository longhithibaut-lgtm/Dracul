import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import * as Foes from './foes.ts';
import { run } from './enemy.ts';
import { aimAt, inArc } from './logic.ts';
import { blow, bulk, feed, floor, meal } from './fauna.ts';
import type { Ctx } from './foes.ts';

// Le Gavé (T.gave, fauna.ts; docs/maquettes/necropole-ennemis-planche-1.png): a corpse-eater. Not hunting, or with a body
// nearer than the hero, it waddles to the dead and eats (eat: its head in the body, tearing), each body making it bigger,
// heavier-handed and healed; then the body is gone from the floor. Hunting: the slam (rear: up on its legs, arms high;
// then flop: belly first on the floor ahead, sprawl) close, the bile (gorge: reared back, the throat bulging, a reflux;
// then spew: black bile poured in a cone, which lies there a moment as a pool) farther. Its body and its sounds tell
// them; the bile on the floor is the attack itself.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Pool = { x: number; y: number; aim: number; at: number };
const SQ = T.lantern.squash;

export function step(c: Ctx, e: Sprite, time: number) {
  const G = T.gave, from = e.body!.center, to = c.hero.body!.center, fed: number = e.getData('fed') ?? 0;
  const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
  const inCone = (p: { x: number; y: number }, aim: number) => inArc({ x: 0, y: 0 }, aim, { x: to.x - p.x, y: (to.y - p.y) / SQ }, G.bileReach, 2 * G.bileHalfDeg);
  // Its bile on the floor burns whoever stands in it, until it has soaked away.
  const pools = (e.getData('pools') as Pool[] | undefined)?.filter((p) => time < p.at + G.spewMs + G.poolMs) ?? [];
  e.setData('pools', pools);
  if (pools.some((p) => time > p.at + G.spewMs && inCone(p, p.aim))) c.damageHero(G.poolDamage);
  switch (e.getData('state')) {
    case 'eat': {
      const b = e.getData('meal');
      if (!c.bodies.includes(b)) return void e.setData('state', 'chase'); // gone from under it
      if (time < e.getData('fireAt')) return;
      b.eat();
      c.bodies.splice(c.bodies.indexOf(b), 1);
      const g = feed({ fed, hp: e.getData('hp'), max: e.getData('max') ?? G.hp });
      e.setData({ ...g, state: 'chase', meal: undefined }).setScale(0.5 * bulk(g.fed));
      return void Sfx.play(c.scene, 'groan', 0.6);
    }
    case 'rear': { // down belly first along its aim
      if (time < e.getData('fireAt')) return;
      const aim = e.getData('aim'), at = { x: from.x + Math.cos(aim) * G.slamAhead, y: from.y + Math.sin(aim) * G.slamAhead * SQ };
      Foes.slam(c.scene, at.x, at.y, G.slamRadius);
      Sfx.play(c.scene, 'slam', 0);
      if (floor(at, to) <= G.slamRadius) c.damageHero(blow(G.slamDamage, fed), at);
      return void e.setData({ state: 'sprawl', until: time + G.sprawlMs, readyAt: time + G.sprawlMs + G.reloadMs });
    }
    case 'gorge': {
      if (time < e.getData('fireAt')) return;
      const p = { x: from.x, y: from.y, aim: e.getData('aim'), at: time };
      e.setData({ state: 'spew', fireUntil: time + G.spewMs, pools: [...pools, p] });
      bile(c.scene, p);
      return void Sfx.play(c.scene, 'reflux', 0);
    }
    case 'spew':
      if (inCone(from, e.getData('aim'))) c.damageHero(blow(G.bileDamage, fed), from);
      if (time >= e.getData('fireUntil')) e.setData({ state: 'recover', until: time + G.recoverMs, readyAt: time + G.reloadMs });
      return;
  }
  // The dead within its smell, not another Gavé's meal: unless it hunts him and he is nearer, it goes to eat.
  const taken = (c.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable).map((o) => o.getData('meal'));
  const hunting = c.hunts(e), body = meal(from, c.bodies.filter((b) => !taken.includes(b)));
  if (body && (!hunting || floor(from, body) < floor(from, to))) {
    const spot = { x: body.x + (from.x < body.x ? -14 : 14), y: body.y }; // its mouth over the body
    if (Phaser.Math.Distance.BetweenPoints(from, spot) < 5) {
      e.setVelocity(0).setData({ state: 'eat', fireAt: time + G.eatMs, meal: body, facing: Phaser.Math.Angle.BetweenPoints(from, body) });
      return void Sfx.play(c.scene, 'chew', G.eatMs / 1000);
    }
    c.scene.physics.velocityFromRotation(Phaser.Math.Angle.BetweenPoints(from, spot), G.speed, e.body!.velocity);
    return void e.setData({ state: 'chase', facing: Phaser.Math.Angle.BetweenPoints(from, spot) });
  }
  if (!hunting) return c.idle(e);
  const fl = floor(from, to);
  if (time >= e.getData('readyAt') && c.scene.cameras.main.worldView.contains(from.x, from.y) && (fl <= G.slamRange || (fl <= G.bileRange && c.way(e).straight))) {
    const slam = fl <= G.slamRange;
    e.setVelocity(0).setData({ state: slam ? 'rear' : 'gorge', fireAt: time + (slam ? G.slamTeleMs : G.bileTeleMs), facing: toHero, aim: aimAt(to.x - from.x, to.y - from.y, SQ, Foes.DIRS) });
    return void Sfx.play(c.scene, slam ? 'groan' : 'reflux', (slam ? G.slamTeleMs : G.bileTeleMs) / 1000);
  }
  c.keepAt(e, toHero, dist, G.near, G.far, G.speed);
}

/** Black bile poured from where it stands along floor angle `aim`: it spreads out over T.gave.spewMs to the cone's
 *  reach, glistening, then soaks away over the rest of T.gave.poolMs. On the floor, lit by the dark like the blood. */
function bile(scene: Phaser.Scene, p: Pool) {
  const G = T.gave, g = scene.add.graphics().setDepth(1.6), rnd = new Phaser.Math.RandomDataGenerator([`${p.x}${p.y}${p.at}`]);
  // Puddles filling the cone (bigger toward its middle line), a dark wet rim round each, splashes beyond.
  const half = Phaser.Math.DegToRad(G.bileHalfDeg), blobs = Array.from({ length: 150 }, () => {
    const r = 5 + Math.sqrt(rnd.frac()) * (G.bileReach - 5), off = rnd.realInRange(-1, 1), a = p.aim + off * half * (0.7 + 0.3 * (r / G.bileReach));
    return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * SQ, r, w: rnd.realInRange(2.5, 6.5) * (1 - 0.45 * Math.abs(off)) * (1 - 0.25 * (r / G.bileReach)), shine: rnd.frac() };
  });
  run(scene, G.spewMs + G.poolMs, (t) => {
    const ms = t * 1000, reach = G.bileReach * Math.min(1, ms / G.spewMs), fade = 1 - Phaser.Math.Clamp((ms - G.spewMs - G.poolMs + 700) / 700, 0, 1);
    g.clear();
    for (const b of blobs) if (b.r <= reach) g.fillStyle(0x23261a, 0.8 * fade).fillEllipse(b.x, b.y, 2 * b.w + 1.5, (2 * b.w + 1.5) * SQ);
    for (const b of blobs) if (b.r <= reach) g.fillStyle(0x060704, 0.95 * fade).fillEllipse(b.x, b.y, 2 * b.w, 2 * b.w * SQ);
    for (const b of blobs) if (b.r <= reach && b.shine > 0.8) // its wet sheen: a streak of green-grey light
      g.fillStyle(b.shine > 0.95 ? 0x8a9070 : 0x3a4030, 0.9 * fade).fillRect(Math.round(b.x - b.w * 0.5), Math.round(b.y - b.w * SQ * 0.4), 2, 0.5);
  }, () => g.destroy());
}
