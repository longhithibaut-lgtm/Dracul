import Phaser from 'phaser';
import { prelit } from './dark.ts';
import * as Grand from './grand.data.ts';
import * as Gait from './gait.ts';
import grandSheet from './grand-hero.png';

// How the hero looks: the validated « grand » vampire rendered from his 3D model (grand-hero.png,
// tools/art/grand-hero.gen.mjs), already lit, eyes and lantern glowing, drawn at half scale on the x2 view (dark.ts
// ZOOM) so each of his pixels is a screen pixel. Each of his frames carries the lantern glass centre (customData.lamp).
// Gameplay calls create() once and show() every frame; everything visual lives here.
export type HeroLook = { moving: boolean; dashing: boolean; slashing: boolean; combo: number; throwing: boolean; biting: boolean; casting: boolean; hurt: boolean; dazed?: boolean; invulnerable: boolean; facing: number };

/** Where the hero stands to bite: this far beside the prey's sprite centre, so his mouth lands on its neck. */
export const BITE_REACH = 8;

/** His sheet loads with the scene (RoomScene.preload). */
export function preload(scene: Phaser.Scene) {
  if (!scene.textures.exists('hero')) scene.load.image('hero', grandSheet);
}

// Per-hero animation memory: show() only gets the current look, so edges (slash start, dash end...) are kept here.
type State = {
  shadow: Phaser.GameObjects.Image; was: HeroLook; swing: number; slashAt: number; hurtAt: number; dashAt: number; dashEnd: number;
  throwAt: number; castAt: number; biteAt: number;
};
// The steps of a struck claw (<view>-claw<combo>-<i>, ms after the press): the blow lands on the press and fx.ts sweeps
// its arc over the first 60-80 ms, so the anticipation is a glimpse and the strike pose holds through the sweep.
const CLAW = [0, 30, 90, 150];
const states = new WeakMap<Phaser.Physics.Arcade.Sprite, State>();

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
  states.set(s, { shadow, was, swing: 1, slashAt: -1e9, hurtAt: -1e9, dashAt: -1e9, dashEnd: -1e9, throwAt: -1e9, castAt: -1e9, biteAt: -1e9 });
  return s;
}

export function show(s: Phaser.Physics.Arcade.Sprite, look: HeroLook) {
  const st = states.get(s)!, now = s.scene.time.now;
  // A buffered slash starts the frame the last one ends: slashing never drops, the combo step changes.
  if (look.slashing && (!st.was.slashing || look.combo !== st.was.combo)) st.slashAt = now;
  if (look.throwing && !st.was.throwing) { st.swing ^= 1; st.throwAt = now; } // and the two throws
  if (look.casting && !st.was.casting) st.castAt = now;
  if (look.biting && !st.was.biting) st.biteAt = now;
  if (look.hurt && !st.was.hurt) st.hurtAt = now;
  if (look.dashing && !st.was.dashing) st.dashAt = now;
  if (!look.dashing && st.was.dashing) st.dashEnd = now;
  st.was = { ...look };

  // The view he faces (eight ways) and, past the action poses, his walk.
  const g = Gait.pick(s, look, now);
  let { view, flip } = g;
  const has = (f: string) => s.texture.has(`${view}-${f}`);
  // A sheet may break an action into steps, <action>-<i> from at[i] ms in (the grand hero's), else it has `or`.
  const step = (name: string, since: number, at: number[], or: string) => (has(`${name}-0`) ? `${name}-${Math.max(0, at.findLastIndex((t) => now - since >= t))}` : or);
  let frame = `${now % 3600 < 140 ? 'blink' : 'idle'}${Math.floor(now / 260) % 4}`;
  // The body turns to mist during the dash and re-forms just after (fx.ts ghosts the intact run pose instead).
  if (look.dashing) frame = `dash${now - st.dashAt < 40 ? 0 : 1}`;
  else if (look.biting && (view === 'side' || has('bite-0'))) frame = step('bite', st.biteAt, [0, 70], 'bite'); // 70: T.bite.lungeMs
  else if (look.casting) frame = step('cast', st.castAt, [0, 60, 140], 'cast');
  else if ((look.hurt || look.dazed) && has('hurt-0')) frame = step('hurt', st.hurtAt, [0, 60], ''); // dazed by a bell: he reels on
  // The arm rakes the way the arc goes: fx.ts sweeps combo 1 back the other way; a sprite mirrored to face left mirrors it.
  else if (look.slashing && has(`claw${look.combo}-0`)) frame = step(`claw${look.combo < 2 && flip ? 1 - look.combo : look.combo}`, st.slashAt, CLAW, '');
  else if (look.slashing && now - st.slashAt < 150) frame = `slash${Number(look.combo === 1) ^ Number(flip)}`;
  else if (look.throwing) frame = step('throw', st.throwAt, [0, 35, 80], `throw${st.swing}`);
  else if (now - st.dashEnd < 70) frame = 'dash0';
  else if (g.walk) ({ view, flip, frame } = g.walk);
  s.setFrame(`${view}-${frame}`).setFlipX(flip);

  if (look.hurt) s.setTint(now - st.hurtAt < 60 ? 0xffffff : 0xe0284a).setTintMode(Phaser.TintModes.FILL);
  else s.clearTint();
  const blink = look.invulnerable && !look.hurt && Math.floor(now / 70) % 2 === 1;
  s.setAlpha(look.dashing ? 0.85 : blink ? 0.25 : 1);
  st.shadow.setAlpha(look.dashing ? 0.45 : 1).setScale(look.dashing ? 0.75 : 1);
}
