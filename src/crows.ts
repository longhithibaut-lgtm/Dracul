import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import * as Foes from './foes.ts';
import { prelit } from './dark.ts';
import { SHEETS } from './foes.data.ts';
import { alarmed, floor, pecked, startles } from './fauna.ts';
import type { Ctx } from './foes.ts';

// Les Corneilles (T.crows, fauna.ts; docs/maquettes/necropole-ennemis-planche-1.png): a flock of carrion crows, one foe
// for the room (an unseen anchor in its enemies, with no body to bump into) drawn as T.crows.birds crows of the crow
// sheet (foes.gen.mjs). On their dead (feed) they peck; the hero seen, or a fight heard near them, and they burst up
// cawing (burst), calling every foe around to come and look; up, they wheel over him (wheel) and one at a time hangs
// shrieking over where he stands (its tell) and stoops on it; he leaves, they settle back (land). Struck, they scatter
// (scatter), are gone a while (gone), and come back to their dead. They never die but by the room's end (die()).
type Sprite = Phaser.Physics.Arcade.Sprite;
type Bird = { s: Phaser.GameObjects.Image; x: number; y: number; z: number; a: number; gx: number; gy: number; phase: number; mode: 'fly' | 'tele' | 'dive'; at: number; spot?: { x: number; y: number }; from?: { x: number; y: number; z: number } };
const SQ = T.lantern.squash, S = SHEETS.crow;

export function create(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Sprite {
  const e = Foes.create(scene, group, 'crow', x, y).setVisible(false);
  e.body!.checkCollision.none = true; // over their heads, round his: nothing bumps into a flock
  const birds: Bird[] = Array.from({ length: T.crows.birds }, (_, i) => {
    const a = i * 2.4, r = 5 + (i % 3) * 6;
    return { s: scene.add.image(x, y, 'crow', 'down-idle0').setScale(0.5).setOrigin(0.5, S.SOLE / S.FH).setBlendMode(prelit(scene)),
      x, y, z: 0, a: a + Math.PI, gx: Math.cos(a) * r, gy: Math.sin(a) * r * SQ, phase: i * 977, mode: 'fly', at: 0 };
  });
  return e.setData('birds', birds);
}

export function step(c: Ctx, e: Sprite, time: number, delta: number) {
  const C = T.crows, home = e.getData('home'), hero = c.hero.body!.center, birds: Bird[] = e.getData('birds'), dt = delta / 1000;
  const at = (x: number, y: number) => e.body!.reset(x, y); // claws find the flock where it is
  const flap = (b: Bird) => 'walk' + (Math.floor((time + b.phase) / 70) % 4);
  // a bird toward floor point (x, y) at height z, at `speed`; true once there
  const fly = (b: Bird, x: number, y: number, z: number, speed: number = C.speed) => {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy), s = speed * dt;
    if (d > 0.5) b.a = Math.atan2(dy, dx);
    if (d > s) [b.x, b.y] = [b.x + (dx / d) * s, b.y + (dy / d) * s];
    else [b.x, b.y] = [x, y];
    b.z += Phaser.Math.Clamp(z - b.z, -s, s);
    return d <= s && Math.abs(z - b.z) < 1;
  };
  let frame = (b: Bird) => flap(b);
  switch (e.getData('state')) {
    case 'feed': // pecking on their dead, turning now and then
      at(home.x, home.y);
      for (const b of birds) {
        [b.x, b.y, b.z] = [home.x + b.gx, home.y + b.gy, 0];
        if ((time + b.phase) % 3100 < delta) b.a += Phaser.Math.FloatBetween(-2, 2);
      }
      frame = (b) => 'idle' + (Math.floor((time + b.phase) / (260 + (b.phase % 300))) % 4);
      if (startles(home, hero, c.lit())) startle(c, e, time);
      break;
    case 'burst': // up off the dead, wings beating hard
      at(home.x, home.y);
      for (const b of birds) fly(b, home.x + b.gx * 2.2, home.y + b.gy * 2.2, C.height, C.speed * 1.2);
      if (time >= e.getData('fireAt')) e.setData({ state: 'wheel', nextDive: time + C.diveEveryMs / 2 });
      break;
    case 'wheel': { // round over his head; one at a time hangs over where he stands, then stoops on it
      at(hero.x, hero.y);
      if (floor(home, hero) > C.stay && !birds.some((b) => b.mode !== 'fly')) return void e.setData({ state: 'land' }); // he is gone: back to their dead
      if (time >= e.getData('nextDive') && !birds.some((b) => b.mode !== 'fly')) {
        const b = birds.reduce((m, b) => (Phaser.Math.Distance.Between(b.x, b.y, hero.x, hero.y) < Phaser.Math.Distance.Between(m.x, m.y, hero.x, hero.y) ? b : m));
        Object.assign(b, { mode: 'tele', at: time, spot: { x: hero.x, y: hero.y } });
        Sfx.play(c.scene, 'caw', 1);
      }
      birds.forEach((b, i) => {
        if (b.mode === 'tele') { // shrieking over the spot, talons out, its aim locked
          fly(b, b.spot!.x, b.spot!.y, C.height * 0.8, C.speed * 1.5);
          if (time - b.at < C.diveTellMs) return;
          Object.assign(b, { mode: 'dive', at: time, from: { x: b.x, y: b.y, z: b.z } });
        }
        if (b.mode === 'dive') { // the stoop
          const k = Math.min(1, (time - b.at) / C.diveMs), f = b.from!, s = b.spot!;
          [b.x, b.y, b.z] = [Phaser.Math.Linear(f.x, s.x, k), Phaser.Math.Linear(f.y, s.y, k), Phaser.Math.Linear(f.z, 2, k * k)];
          if (k < 1) return;
          if (!c.dodging() && pecked(s, hero)) c.damageHero(C.damage, { x: s.x, y: s.y - 1 });
          b.mode = 'fly';
          e.setData('nextDive', time + C.diveEveryMs);
          return;
        }
        const w = (i * 2 * Math.PI) / birds.length + (time / 1000) * (i % 2 ? 1.3 : -1.1);
        fly(b, hero.x + Math.cos(w) * C.wheel * (0.7 + 0.3 * (i % 3)), hero.y + Math.sin(w) * C.wheel * SQ, C.height + 5 * Math.sin(time / 300 + i));
      });
      frame = (b) => (b.mode === 'fly' ? flap(b) : b.mode);
      break;
    }
    case 'land': { // back down onto their dead
      at(home.x, home.y);
      let down = 0;
      for (const b of birds) {
        const d = Math.hypot(home.x + b.gx - b.x, home.y + b.gy - b.y);
        if (fly(b, home.x + b.gx, home.y + b.gy, Math.min(C.height, d * 0.5))) down++;
        b.s.setAlpha(Math.min(1, b.s.alpha + dt * 2));
      }
      if (down === birds.length) e.setData('state', 'feed');
      break;
    }
    case 'scatter': // away from him in every way, high, out of sight
      at(home.x, home.y);
      for (const b of birds) {
        fly(b, b.x + Math.cos(b.a) * 50, b.y + Math.sin(b.a) * 50, 70, C.speed * 1.6);
        b.s.setAlpha(Math.max(0, 1 - (time - e.getData('fireAt') + 1200) / 1200));
      }
      if (time >= e.getData('fireAt')) e.setData({ state: 'gone', fireAt: time + C.backMs });
      break;
    case 'gone': // back after a while, from afar
      for (const b of birds) b.s.setVisible(false);
      if (time < e.getData('fireAt')) return;
      for (const b of birds) Object.assign(b, { x: home.x + Math.cos(b.a) * 160, y: home.y + Math.sin(b.a) * 160 * SQ, z: 70, mode: 'fly' }), b.s.setVisible(true).setAlpha(0);
      e.setData('state', 'land');
      break;
    default: // just called in: on their dead
      e.setData('state', 'feed');
  }
  for (const b of birds) {
    const [view, flip] = Foes.viewOf(b.a);
    if (flip !== undefined) b.s.setFlipX(flip);
    b.s.setFrame(`${view}-${frame(b)}`).setPosition(b.x, b.y - b.z).setDepth(b.y);
  }
}

/** A fight heard at floor point `p` (a claw swung, a blow on him, a death): the flocks on their dead near it take fright. */
export function din(c: Ctx, p: { x: number; y: number }, time: number) {
  for (const e of c.enemies.getChildren() as Sprite[])
    if (e.body?.enable && e.getData('kind') === 'crows' && e.getData('state') === 'feed' && startles(e.getData('home'), c.hero.body!.center, c.lit(), p)) startle(c, e, time);
}

/** Up off their dead, cawing: every foe around comes to look. */
function startle(c: Ctx, e: Sprite, time: number) {
  e.setData({ state: 'burst', fireAt: time + T.crows.burstMs });
  Sfx.play(c.scene, 'caw', T.crows.birds);
  alarm(c, e, time);
}

/** Every foe within T.crows.alarm not hunting yet comes to where the flock rose (RoomScene idle(): `heard`). */
function alarm(c: Ctx, e: Sprite, time: number) {
  const home = e.getData('home'), foes = (c.enemies.getChildren() as Sprite[]).filter((o) => o.body?.enable && o.getData('kind') !== 'crows')
    .map((o) => ({ x: o.x, y: o.y, hunting: !!o.getData('alert'), o }));
  for (const f of alarmed(home, foes)) f.o.setData('heard', { x: home.x, y: home.y, until: time + T.crows.lookMs });
}

/** Struck: they scatter cawing, the alarm raised again, and are gone a while. */
export function scatter(c: Ctx, e: Sprite, time: number) {
  if (['scatter', 'gone'].includes(e.getData('state'))) return;
  const hero = c.hero.body!.center;
  for (const b of e.getData('birds') as Bird[]) Object.assign(b, { mode: 'fly', a: Math.atan2(b.y - hero.y, b.x - hero.x) + Phaser.Math.FloatBetween(-0.6, 0.6) });
  e.setData({ state: 'scatter', fireAt: time + 1200 });
  Sfx.play(c.scene, 'caw', T.crows.birds);
  alarm(c, e, time);
}

/** Gone for good (the room cleared): they fly off and are not seen again. */
export function die(scene: Phaser.Scene, e: Sprite) {
  for (const k of ['jet', 'markG']) e.getData(k)?.destroy();
  for (const b of e.getData('birds') as Bird[]) scene.tweens.add({ targets: b.s, y: b.s.y - 60, alpha: 0, duration: 700, onComplete: () => b.s.destroy() });
  e.destroy();
}
