import Phaser from 'phaser';

// How the hero looks. Gameplay calls create() once and show() every frame; everything visual lives here.
export type HeroLook = { moving: boolean; dashing: boolean; slashing: boolean; hurt: boolean; invulnerable: boolean; facing: number };

export function create(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Sprite {
  // shortcut: placeholder rectangles, replaced by real pixel art in the hero piece.
  if (!scene.textures.exists('hero')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x7a1426).fillRect(2, 8, 10, 14).fillStyle(0xe6dacb).fillRect(3, 1, 8, 8);
    g.generateTexture('hero', 14, 22);
    g.destroy();
  }
  const s = scene.physics.add.sprite(x, y, 'hero');
  s.setSize(8, 6).setOffset(3, 16); // feet hitbox, the rest of the sprite overlaps freely
  return s;
}

export function show(s: Phaser.Physics.Arcade.Sprite, look: HeroLook) {
  s.setFlipX(Math.cos(look.facing) < 0).setAlpha(look.dashing ? 0.4 : 1);
  if (look.hurt) s.setTint(0xff4060).setTintMode(Phaser.TintModes.FILL);
  else s.clearTint();
}
