import Phaser from 'phaser';

// Heads-up display. Gameplay pushes values in; it never reads from here.
export type Hud = { health(current: number, max: number): void; dashReady(ready: boolean): void };

export function create(scene: Phaser.Scene): Hud {
  // shortcut: placeholder bar, replaced in the hud piece.
  const g = scene.add.graphics().setDepth(20_000);
  return {
    health(current, max) {
      g.clear();
      for (let i = 0; i < max; i++) g.fillStyle(i < current ? 0xc4182f : 0x3a1018).fillRect(10 + i * 9, 8, 7, 7);
    },
    dashReady() {},
  };
}
