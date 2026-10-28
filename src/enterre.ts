import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import { caught, struggle, wakes } from './fauna.ts';
import type { Ctx } from './foes.ts';

// L'Enterré (T.enterre, fauna.ts; docs/maquettes/necropole-ennemis-planche-1.png): a dead man half under his grave mound.
// Buried (his idle frames: only fingers and eyes), blows go into the earth. The hero's feet on his mound: the earth
// cracks and a hand claws up (crack, the tell, heard); still in reach at its end, he is caught by the ankle (grab): held
// where he stands, dragged and hurt on a beat until he struggles free (keys pressed anew, claws on the dead man), then
// the dead man sinks back (sink: the time to strike him) and waits a moment under. He never moves nor turns (foes.ts
// draws him from the front).
type Sprite = Phaser.Physics.Arcade.Sprite;

/** Under the earth: out of the claws', shards' and rats' reach. */
export const under = (e: Sprite) => !['crack', 'grab', 'sink'].includes(e.getData('state'));

export function step(c: Ctx, e: Sprite, time: number) {
  const E = T.enterre, mound = e.body!.center, feet = c.hero.body!.center;
  e.setVelocity(0).setData({ facing: Math.PI / 2, aim: Math.PI / 2 });
  switch (e.getData('state')) {
    case 'crack':
      if (time < e.getData('fireAt')) return;
      if (c.dodging() || !caught(mound, feet)) return void e.setData({ state: 'sink', fireAt: time + E.sinkMs }); // clawed at nothing
      e.setData({ state: 'grab', points: 0, tickAt: time + E.tickMs });
      c.hold(e);
      c.damageHero(E.damage);
      return void Sfx.play(c.scene, 'bite');
    case 'grab':
      if (time < e.getData('tickAt')) return;
      e.setData('tickAt', time + E.tickMs);
      if (c.damageHero(E.damage)) Sfx.play(c.scene, 'drain');
      return;
    case 'sink':
      if (time < e.getData('fireAt')) return;
      return void e.setData({ state: 'buried', readyAt: time + E.rearmMs });
  }
  e.setData('state', 'buried');
  if (time < (e.getData('readyAt') ?? 0) || !wakes(mound, feet)) return;
  e.setData({ state: 'crack', fireAt: time + E.crackMs });
  Sfx.play(c.scene, 'crack', E.crackMs / 1000);
}

/** The hero he holds struggles (`how`: a key pressed anew, a claw on him): free at last, he lets go. */
export function struggled(c: Ctx, e: Sprite, how: 'blow' | 'key', time: number) {
  if (e.getData('state') !== 'grab') return;
  const s = struggle(e.getData('points'), how);
  e.setData('points', s.points);
  if (s.free) letGo(c, e, time);
}

/** He lets go (freed, the hero turned to rats, or dead): back under the earth. */
export function letGo(c: Ctx, e: Sprite, time: number) {
  c.hold(undefined);
  e.setData({ state: 'sink', fireAt: time + T.enterre.sinkMs });
  Sfx.play(c.scene, 'crack', 0.3);
}
