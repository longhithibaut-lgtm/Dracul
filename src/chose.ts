import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import * as Foes from './foes.ts';
import { flung, inPit, stirs, swept, type Edge } from './fauna.ts';
import { SHEETS } from './foes.data.ts';
import type { Ctx } from './foes.ts';

// La Chose du gouffre (T.chose, fauna.ts; docs/maquettes/necropole-ennemis-planche-2.png, -scene-2.png): it lives in the
// chasm under a bridge, its two huge hands gripping the deck's north edge, its crown and pale eyes just over it (grip).
// The hero on the deck near it: its fingers dig into the stone, the bridge creaks, grit trickles off the deck's face,
// the head rises, an arm rears high (clench, the tell); then the arm sweeps the deck (swipe) and flings whoever it hits
// off it, into the chasm if he lands there (RoomScene fling()); the arm lies there a moment (rest). Clawed on its
// fingers, it tears its hands back (recoil), sinks (sink), stays under (under) and climbs back (rise). It never dies and
// never turns (one view, from the front); nothing bumps into it. Nothing on the floor: its body, the creak, the grit.
type Sprite = Phaser.Physics.Arcade.Sprite;
const S = SHEETS.chose, LIP = 32; // sheet px from its soles up to the top of the deck's parapet lip (the zone's bridge: 12 room px over the pit's line, less 6 sprite px)
const SINK = 50; // room px it slides down going under

/** At `edge`: its sprite so that the model's edge (14 model units behind its soles) lies on the deck's; in a room with no
 *  chasm (the training room elsewhere), a patch of void drawn behind it. */
export function create(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, edge: Edge, voidBehind: boolean) {
  const e = Foes.create(scene, group, 'chose', edge.x, edge.y - 6);
  e.body!.checkCollision.none = true;
  const hole = voidBehind ? scene.add.rectangle(edge.x, edge.y - 30, 2 * edge.span + 40, 60, 0x000000).setDepth(1.4) : undefined; // shortcut: a placeholder edge, the real ones are the zone's decks
  return e.setData({ edge, hole, state: 'grip', unshaded: true });
}

/** Under the edge: out of the claws', shards' and rats' reach. */
export const under = (e: Sprite) => ['sink', 'under'].includes(e.getData('state'));

export function step(c: Ctx, e: Sprite, time: number) {
  const C = T.chose, edge: Edge = e.getData('edge'), feet = c.hero.body!.center, at: number = e.getData('fireAt');
  e.setVelocity(0).setData({ facing: Math.PI / 2, aim: Math.PI / 2 });
  switch (e.getData('state')) {
    case 'clench':
      if (time < at) return;
      e.setData({ state: 'swipe', fireAt: time + C.sweepMs, struck: false });
      return void Sfx.play(c.scene, 'swoosh', C.sweepMs / 1000);
    case 'swipe': { // its hand across the deck, from its right (the screen's left) to its left
      const hx = edge.x + (2 * Math.min(1, 1 - (at - time) / C.sweepMs) - 1) * C.span;
      if (!e.getData('struck') && !c.dodging() && swept(edge, hx, feet)) {
        e.setData('struck', true);
        const to = flung(feet);
        if (c.damageHero(C.damage, { x: hx, y: feet.y - 6 })) c.fling(to.x - feet.x, to.y - feet.y, inPit(c.pits, to));
      }
      if (time >= at) e.setData({ state: 'rest', fireAt: time + C.restMs });
      return;
    }
    case 'rest':
      if (time >= at) e.setData({ state: 'grip', readyAt: time + C.reloadMs });
      return;
    case 'recoil':
      if (time >= at) e.setData({ state: 'sink', fireAt: time + C.sinkMs });
      return;
    case 'sink':
      if (time >= at) e.setData({ state: 'under', fireAt: time + C.underMs });
      return;
    case 'under':
      if (time >= at) e.setData({ state: 'rise', fireAt: time + C.riseMs });
      return;
    case 'rise':
      if (time >= at) e.setData({ state: 'grip', readyAt: time + C.reloadMs / 2 });
      return;
  }
  if (time < (e.getData('readyAt') ?? 0) || !stirs(edge, feet)) return;
  e.setData({ state: 'clench', fireAt: time + C.teleMs });
  Sfx.play(c.scene, 'grind', C.teleMs / 1000);
}

/** A claw on its fingers: it tears its hands back off the stone and goes under a while. */
export function struck(c: Ctx, e: Sprite, time: number) {
  if (under(e) || e.getData('state') === 'recoil') return;
  e.setData({ state: 'recoil', fireAt: time + T.chose.recoilMs });
  Sfx.play(c.scene, 'groan', 0.5);
}

/** Its look for its state: the hands' grip flexing, the tell in three (fingers dug in, head up, arm reared), the sweep,
 *  the rest, the recoil, sinking out of sight and climbing back; trembling while it clenches, grit falling off the
 *  deck's face and its edge. */
export function show(e: Sprite, time: number) {
  const C = T.chose, state = e.getData('state'), at: number = e.getData('fireAt') ?? 0, edge: Edge = e.getData('edge');
  const left = (ms: number) => 1 - Math.max(0, at - time) / ms; // how far through a state of `ms` (0..1)
  let f = 'idle' + (Math.floor((time + e.getData('phase')) / 420) % 4), alpha = 1, dx = 0, sunk = 0;
  if (state === 'clench') { const k = left(C.teleMs); f = k < 0.4 ? 'tele0' : k < 0.72 ? 'tele1' : 'tele2'; dx = Math.sin(time / 23) * 0.5; }
  else if (state === 'swipe') f = 'swipe' + Math.min(2, Math.floor(left(C.sweepMs) * 3));
  else if (state === 'rest') f = 'rest';
  else if (state === 'recoil') f = 'hurt';
  else if (state === 'sink') [f, sunk] = ['hurt', Phaser.Math.Easing.Quadratic.In(left(C.sinkMs))];
  else if (state === 'under') alpha = 0;
  else if (state === 'rise') [f, sunk] = ['tele0', 1 - Phaser.Math.Easing.Quadratic.Out(left(C.riseMs))]; // fingers first, clawing back over
  // Going under (and back): it slides down behind the deck's lip, nothing of it drawn over the deck.
  const drop = SINK * sunk;
  e.setFrame(`down-${f}`).setAlpha(alpha).setPosition(edge.x + dx, edge.y - 6 + drop);
  if (sunk > 0) e.setCrop(0, 0, S.FW, Math.max(0, S.SOLE - LIP - 2 * drop));
  else e.setCrop();
  const g = e.getData('markG') as Phaser.GameObjects.Graphics;
  g.clear();
  if (state !== 'clench') return;
  // Grit and dust trickling off the deck's face into the void, and off its edge by the fingers: more as it clenches.
  const k = left(C.teleMs), n = Math.round(10 + 30 * k);
  for (let i = 0; i < n; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h), lip = i % 3 ? edge.y + edge.depth : edge.y;
    const fall = ((time / 1000) * (40 + 50 * u) + u * 60) % 60, x = edge.x + (u * 2 - 1) * edge.span;
    g.fillStyle(u > 0.7 ? 0xb4a68c : 0x6e6252, (1 - fall / 60) * 0.9).fillRect(Math.round(x), Math.round(lip + fall), 1, u > 0.85 ? 2 : 1);
  }
}

/** Gone (the room cleared): its void too. It never dies of a blow. */
export function die(e: Sprite) {
  for (const k of ['jet', 'markG', 'hole']) e.getData(k)?.destroy();
  e.destroy();
}
