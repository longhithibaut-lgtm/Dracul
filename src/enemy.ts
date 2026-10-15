import Phaser from 'phaser';

// How enemies look. Gameplay owns the AI state; this file only shows it.
export type EnemyState = 'chase' | 'windup' | 'lunge' | 'recover';

export function create(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, x: number, y: number): Phaser.Physics.Arcade.Sprite {
  // shortcut: placeholder rectangles, replaced by real pixel art in the enemy piece.
  if (!scene.textures.exists('enemy')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x3d4836).fillRect(1, 6, 16, 14).fillStyle(0xffd23a).fillRect(5, 9, 2, 2).fillRect(11, 9, 2, 2);
    g.generateTexture('enemy', 18, 20);
    g.destroy();
  }
  const s = group.create(x, y, 'enemy') as Phaser.Physics.Arcade.Sprite;
  s.setSize(12, 6).setOffset(3, 14);
  return s;
}

/** Marker shown where an enemy is about to appear. */
export function telegraphSpawn(scene: Phaser.Scene, x: number, y: number, ms: number) {
  const ring = scene.add.circle(x, y, 9).setStrokeStyle(1, 0xc4182f).setDepth(1);
  scene.tweens.add({ targets: ring, scale: { from: 1.6, to: 0.5 }, duration: ms, onComplete: () => ring.destroy() });
}

export function show(s: Phaser.Physics.Arcade.Sprite, state: EnemyState, facing: number, flash: boolean) {
  s.setFlipX(Math.cos(facing) < 0);
  if (flash) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  else if (state === 'windup') s.setTint(0xff5050).setTintMode(Phaser.TintModes.MULTIPLY);
  else s.clearTint();
}

export function die(scene: Phaser.Scene, s: Phaser.Physics.Arcade.Sprite) {
  scene.tweens.add({ targets: s, scaleX: 1.4, scaleY: 0.2, alpha: 0, duration: 240, onComplete: () => s.destroy() });
}
