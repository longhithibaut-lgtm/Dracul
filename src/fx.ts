import Phaser from 'phaser';

// Combat feedback: slashes, impacts, dash trail, being hurt. Gameplay only says what happened and where.

export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, combo: number) {
  // shortcut: placeholder arc, replaced in the fx piece.
  const half = Phaser.Math.DegToRad(65);
  const g = scene.add.graphics().setPosition(x, y).setDepth(9_000);
  g.lineStyle(combo === 2 ? 2 : 1, 0xf2e6da).beginPath().arc(0, 0, 24, angle - half, angle + half).strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
}

export function hit(scene: Phaser.Scene, _x: number, _y: number, _angle: number) {
  scene.cameras.main.shake(60, 0.004);
}

export function dash(_scene: Phaser.Scene, _from: { x: number; y: number }, _angle: number) {}

export function hurt(scene: Phaser.Scene) {
  scene.cameras.main.shake(140, 0.01);
}
