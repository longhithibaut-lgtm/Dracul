import Phaser from 'phaser';
import { prelit } from './dark.ts';
import * as Grand from './grand.data.ts';
import * as Gait from './gait.ts';
import { T } from './tuning.ts';
import grandSheet from './grand-hero.png';

// How the hero looks: the validated « grand » vampire rendered from his 3D model (grand-hero.png,
// tools/art/grand-hero.gen.mjs), already lit, eyes and lantern glowing, drawn at half scale on the x2 view (dark.ts
// ZOOM) so each of his pixels is a screen pixel. Each of his frames carries the lantern glass centre (customData.lamp).
// Gameplay calls create() once, show() every frame and die() when he falls; everything visual lives here. hurtFrom: the
// way the last blow travelled (radians), for the side he reels from.
// parry: his guard up (la parade), struck (clang: a blow just turned aside, a flash), or open after a missed one; charge: le coup chargé, its share of a full charge;
// stalking: a foe that has not noticed him is within reach (T.predator), he darkens.
export type HeroLook = { moving: boolean; dashing: boolean; slashing: boolean; combo: number; throwing: boolean; biting: boolean; casting: boolean; hurt: boolean; hurtFrom?: number; dazed?: boolean; invulnerable: boolean; facing: number; swarm?: boolean; parry?: 'guard' | 'clang' | 'open'; charge?: number; stalking?: boolean }; // swarm: turned into la Nuée (rats.ts draws it)

/** Where the hero stands to bite: this far beside the prey's sprite centre, so his mouth lands on its neck. */
export const BITE_REACH = 8;

/** His sheet loads with the scene (RoomScene.preload). */
export function preload(scene: Phaser.Scene) {
  if (!scene.textures.exists('hero')) scene.load.image('hero', grandSheet);
}

// Per-hero animation memory: show() only gets the current look, so edges (slash start, dash end...) are kept here.
type State = {
  shadow: Phaser.GameObjects.Image; was: HeroLook; swing: number; slashAt: number; hurtAt: number; dashAt: number; dashEnd: number;
  throwAt: number; castAt: number; biteAt: number; hurtFrom?: number; dazeAt: number; tearAt: number; finAt: number; stillAt: number;
};
// The steps of a struck claw (<view>-claw<combo>-<i>, ms after the press): the blow lands on the press and fx.ts sweeps
// its arc over the first 60-80 ms, so the anticipation is a glimpse and the strike pose holds through the sweep.
const CLAW = [0, 30, 90, 150];
const TEAR_MS = 160; // torn away from the prey, after the drink
// Dying (die()): the knees give, on his knees, slumped, then the body breaks into vapour (RoomScene restarts at 1200 ms).
const DEATH = [0, 110, 300, 560, 720, 880];
const states = new WeakMap<Phaser.Physics.Arcade.Sprite, State>();
// A multiply tint from none (0) to the predator's dark (1).
const darken = (k: number) => {
  const c = T.predator.tint, ch = (sh: number) => Math.round(255 + (((c >> sh) & 255) - 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export function create(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Sprite {
  const tex = scene.textures.get('hero');
  if (!tex.has('down-idle0')) for (const [name, { cell, lamp }] of Object.entries(Grand.FRAMES))
    Object.assign(tex.add(name, 0, (cell % Grand.COLS) * Grand.FW, Math.floor(cell / Grand.COLS) * Grand.FH, Grand.FW, Grand.FH)!.customData, { lamp });
  // Soles 15 room px below his y, the 8x6 feet hitbox 5 px below it (sheet px: two per room px).
  const s = scene.physics.add.sprite(x, y, 'hero', 'down-idle0').setOrigin(0.5, (Grand.SOLE - 30) / Grand.FH).setScale(0.5);
  s.setSize(16, 12).setOffset(Grand.FW / 2 - 8, Grand.SOLE - 20).setBlendMode(prelit(scene))
    .setData('gait', { squash: Grand.SQUASH, ...Grand.GAIT }); // his walks, turned by the distance walked (gait.ts)
  // A soft dark smudge on the floor under him; physics moves the sprite after update(), so it follows on POST_UPDATE.
  if (!scene.textures.exists('hero-shadow')) {
    const t = scene.textures.createCanvas('hero-shadow', 32, 32)!;
    t.context.fillStyle = 'rgba(11,7,16,0.55)';
    ['...xxxxxxxx...', '.xxxxxxxxxxxx.', 'xxxxxxxxxxxxxx', '.xxxxxxxxxxxx.', '...xxxxxxxx...'].forEach((r, j) => [...r].forEach((c, i) => c === 'x' && t.context.fillRect(9 + i, 24 + j, 1, 1)));
    t.refresh();
  }
  const shadow = scene.add.image(x, y, 'hero-shadow');
  const follow = () => shadow.setPosition(s.x, s.y).setDepth(s.depth - 0.5);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, follow);
  s.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, follow));
  const was = { moving: false, dashing: false, slashing: false, combo: 0, throwing: false, biting: false, casting: false, hurt: false, invulnerable: false, facing: 0 };
  states.set(s, { shadow, was, swing: 1, slashAt: -1e9, hurtAt: -1e9, dashAt: -1e9, dashEnd: -1e9, throwAt: -1e9, castAt: -1e9, biteAt: -1e9, dazeAt: -1e9, tearAt: -1e9, finAt: -1e9, stillAt: scene.time.now });
  return s;
}

export function show(s: Phaser.Physics.Arcade.Sprite, look: HeroLook) {
  const st = states.get(s)!, now = s.scene.time.now;
  // A buffered slash starts the frame the last one ends: slashing never drops, the combo step changes.
  if (look.slashing && (!st.was.slashing || look.combo !== st.was.combo)) st.slashAt = now;
  if (look.throwing && !st.was.throwing) { st.swing ^= 1; st.throwAt = now; } // and the two throws
  if (look.casting && !st.was.casting) st.castAt = now;
  if (look.biting && !st.was.biting) st.biteAt = now;
  if (look.hurt && !st.was.hurt) { st.hurtAt = now; st.hurtFrom = look.hurtFrom; }
  if (look.dazed && !st.was.dazed) st.dazeAt = now;
  if (!look.biting && st.was.biting && now - st.biteAt > 200) st.tearAt = now; // latched and drunk (a bite at nothing is 130 ms)
  if (!look.slashing && st.was.slashing && st.was.combo === 2) st.finAt = now; // the finisher's recovery
  if (look.dashing && !st.was.dashing) st.dashAt = now;
  if (!look.dashing && st.was.dashing) st.dashEnd = now;
  st.was = { ...look };

  // The view he faces (eight ways) and, past the action poses, his walk.
  const g = Gait.pick(s, look, now);
  let { view, flip } = g;
  const has = (f: string) => s.texture.has(`${view}-${f}`);
  // A sheet may break an action into steps, <action>-<i> from at[i] ms in (the grand hero's; a step drawn for some
  // views only falls back to the one before), else it has `or`.
  const step = (name: string, since: number, at: number[], or: string) => {
    if (!has(`${name}-0`)) return or;
    let i = Gait.stepOf(at, now - since);
    while (i && !has(`${name}-${i}`)) i--;
    return `${name}-${i}`;
  };
  const idle = `${now % 3600 < 140 ? 'blink' : 'idle'}${Math.floor(now / 260) % 4}`;
  let frame = idle;
  // The body turns to mist during the dash (after the push-off) and re-forms just after (fx.ts ghosts the intact run
  // pose instead).
  if (look.dashing) frame = `dash${now - st.dashAt < 40 ? 0 : 1}`;
  // La parade: the forearm raised before him (his flinch's first frame); missed, stooped forward, open (the finisher's weight).
  else if (look.parry && has('hurt-0')) frame = look.parry === 'open' ? 'fin-0' : 'hurt-0';
  // Le coup chargé: reared back on his back foot, the claw drawn high (the finisher's anticipation), held.
  else if (look.charge !== undefined && has('claw2-0')) frame = 'claw2-0';
  // 70: T.bite.lungeMs; latched side-on, he drinks, then tears away.
  else if (look.biting && (view === 'side' || has('bite-0'))) frame = step('bite', st.biteAt, [0, 70, 200], 'bite');
  else if (look.casting) frame = step('cast', st.castAt, [0, 60, 140], 'cast');
  else if (look.hurt && has('hurt-0')) {
    const h = Gait.hurtOf(look.facing, st.hurtFrom, flip);
    frame = step(has(`${h}-0`) ? h : 'hurt', st.hurtAt, [0, 60], '');
  } else if (look.dazed && has('hurt-0')) frame = has('stagger-0') ? `stagger-${Math.floor((now - st.dazeAt) / 150) % 4}` : 'hurt-1'; // a bell: he reels
  // The arm rakes the way the arc goes: fx.ts sweeps combo 1 back the other way; a sprite mirrored to face left mirrors it.
  else if (look.slashing && has(`claw${look.combo}-0`)) frame = step(`claw${look.combo < 2 && flip ? 1 - look.combo : look.combo}`, st.slashAt, CLAW, '');
  else if (look.slashing && now - st.slashAt < 150) frame = `slash${Number(look.combo === 1) ^ Number(flip)}`;
  else if (look.throwing) frame = step('throw', st.throwAt, [0, 35, 80], `throw${st.swing}`);
  else if (now - st.dashEnd < 70) frame = has('dash2') ? 'dash2' : 'dash0';
  else if (now - st.tearAt < TEAR_MS && has('bite-3')) frame = 'bite-3';
  // The finisher's weight, standing (walking off, the walk takes over at once).
  else if (!look.moving && now - st.finAt < T.slash.finisherRecoveryMs && has('fin-0')) frame = step('fin', st.finAt, [0, 80], '');
  else if (g.walk) ({ view, flip, frame } = g.walk);
  if (frame !== idle) st.stillAt = now;
  else if (has('glance-0')) frame = Gait.idleVariant(now - st.stillAt) ?? idle; // standing a while, now and then a gesture
  s.setFrame(`${view}-${frame}`).setFlipX(flip);

  if (look.hurt) s.setTint(now - st.hurtAt < 60 ? 0xffffff : 0xe0284a).setTintMode(Phaser.TintModes.FILL);
  else if (look.parry === 'clang') s.setTint(0xffe8c8).setTintMode(Phaser.TintModes.FILL); // the blow turned aside: a pale flash
  // Charging, he sinks into the dark as it grows, throbbing once full; stalking an unaware foe, he darkens.
  else if (look.charge !== undefined) s.clearTint().setTint(darken(look.charge < 1 ? look.charge * 0.7 : 0.8 + 0.2 * Math.sin(now / 45)));
  else if (look.stalking) s.clearTint().setTint(T.predator.tint);
  else s.clearTint();
  const blink = look.invulnerable && !look.hurt && Math.floor(now / 70) % 2 === 1;
  s.setAlpha(look.swarm ? 0 : look.dashing ? 0.85 : blink ? 0.25 : 1);
  st.shadow.setAlpha(look.swarm ? 0 : look.dashing ? 0.45 : 1).setScale(look.dashing ? 0.75 : 1);
}

/** He falls (RoomScene.damageHero, the last blood): show() stops, this plays the collapse and the dissolve facing the
 *  way he last faced, the lantern left burning on the floor. */
export function die(s: Phaser.Physics.Arcade.Sprite) {
  const st = states.get(s);
  if (!st) return;
  const { view, flip } = Gait.viewOf(st.was.facing, s.texture.has('downside-idle0'));
  if (!s.texture.has(`${view}-death-0`)) return;
  const t0 = s.scene.time.now; // on the scene's clock, as RoomScene's restart
  s.scene.tweens.addCounter({ from: 0, to: 1, duration: 1300, onUpdate: () => {
    const t = s.scene.time.now - t0;
    s.setFrame(`${view}-death-${Gait.stepOf(DEATH, t)}`).setFlipX(flip).setAlpha(1);
    if (t > 90) s.clearTint(); // past the blow's flash
    st.shadow.setAlpha(Phaser.Math.Clamp(1 - (t - DEATH[3]) / 400, 0, 1));
  } });
}
