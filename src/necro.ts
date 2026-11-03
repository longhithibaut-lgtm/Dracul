import Phaser from 'phaser';
import { T } from './tuning.ts';
import { prelit } from './dark.ts';
import { SHEETS } from './foes.data.ts';
import { ROUTES, inFile } from './haunts.ts';
import * as Sfx from './sfx.ts';

// La nécropole's life as it shows (haunts.ts the rules, RoomScene the foes): the dead laid on its floor for its feeders,
// the glass of a patrol's lantern, the prisoner the Order drags to its camp.
type Sprite = Phaser.Physics.Arcade.Sprite;
type P = { x: number; y: number };
const SQ = T.lantern.squash;

/** Sheet `key`'s frames, cut once (foes.ts does it on a foe's first coming). */
function frames(scene: Phaser.Scene, key: keyof typeof SHEETS) {
  const S = SHEETS[key], tex = scene.textures.get(key);
  if (!tex.has('corpse')) for (const [name, { cell }] of Object.entries(S.FRAMES)) tex.add(name, 0, (cell % S.COLS) * S.FW, Math.floor(cell / S.COLS) * S.FH, S.FW, S.FH);
  return S;
}

/** A body on the floor at (x, y) (the crows' carrion frame, as foes.ts lays its dead): food for a Gavé (eat() erases it). */
export function corpse(scene: Phaser.Scene, p: P) {
  const S = frames(scene, 'crow'), im = scene.add.image(p.x, p.y - 11, 'crow', 'corpse').setScale(0.5).setOrigin(0.5, (S.SOLE - 20) / S.FH).setDepth(1.5).setBlendMode(prelit(scene)).setTint(0xa0a0a0);
  return { x: p.x, y: p.y, eat: () => im.destroy() };
}

/** The lit glass of the lantern each patrol's bearer carries, drawn over the dark; `bearers`: those carrying one now. */
export function glasses(scene: Phaser.Scene, shown: Map<Sprite, Phaser.GameObjects.Rectangle>, bearers: Sprite[]) {
  for (const [e, g] of shown) if (!bearers.includes(e)) { g.destroy(); shown.delete(e); }
  for (const e of bearers) {
    let g = shown.get(e);
    if (!g) shown.set(e, (g = scene.add.rectangle(0, 0, 2, 3, 0xe6e08a).setDepth(7985)));
    g.setPosition(e.x + (e.flipX ? -5 : 5), e.y - 4).setAlpha(0.75 + 0.25 * Math.sin(scene.time.now / 90 + e.x));
  }
}

/** The prisoner: dragged at a rope's length behind his captors' first (the patrol of route `camp`), kneeling once they
 *  stop or turn on the hero; freed (F), he runs off into the dark. */
export class Prisoner {
  s: Phaser.GameObjects.Image;
  rope: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, at: P) {
    frames(scene, 'penitent');
    this.s = scene.add.image(at.x, at.y, 'penitent', 'down-kneel').setScale(0.5).setOrigin(0.5, (SHEETS.penitent.SOLE - 4) / SHEETS.penitent.FH).setBlendMode(prelit(scene)).setTint(0xb0a090);
    this.rope = scene.add.graphics().setDepth(at.y - 1);
  }
  get at() { return { x: this.s.x, y: this.s.y }; }

  /** Each frame: behind `lead` (none: he kneels where he is), a rope from its hand. */
  step(lead: Sprite | undefined, delta: number, time: number) {
    this.rope.clear();
    if (!lead || lead.getData('alert')) return void this.s.setFrame('down-kneel').setDepth(this.s.y);
    const R = ROUTES.camp, h = lead.getData('haunt'), [wx, wy] = R.pts[h.leg], heading = Math.atan2(wy - lead.y, wx - lead.x);
    const to = inFile(lead, heading, 1), d = Math.hypot(to.x - this.s.x, to.y - this.s.y), step = Math.min(d, (40 * delta) / 1000);
    if (d > 1) this.s.setPosition(this.s.x + ((to.x - this.s.x) / d) * step, this.s.y + ((to.y - this.s.y) / d) * step);
    const view = Math.abs(Math.cos(heading)) > 0.7 ? 'side' : Math.sin(heading) > 0 ? 'down' : 'up', moving = lead.body!.velocity.length() > 2;
    this.s.setFrame(moving ? `${view}-walk${Math.floor(time / 220) % 4}` : 'down-kneel').setFlipX(Math.cos(heading) < 0).setDepth(this.s.y);
    this.rope.setDepth(this.s.y - 1).lineStyle(1, 0x3a2e22, 0.9).lineBetween(lead.x, lead.y - 10, this.s.x, this.s.y - 12);
  }

  /** Freed: he gets up and runs into the dark, away from `from`, a word thrown back. */
  free(scene: Phaser.Scene, from: P) {
    this.rope.destroy();
    const a = Math.atan2(this.s.y - from.y, this.s.x - from.x);
    Sfx.play(scene, 'spawn');
    scene.tweens.add({ targets: this.s, x: this.s.x + Math.cos(a) * 90, y: this.s.y + Math.sin(a) * 90 * SQ, alpha: 0, duration: T.haunts.fleeMs, onComplete: () => this.s.destroy() });
  }

  destroy() { this.s.destroy(); this.rope.destroy(); }
}
