import Phaser from 'phaser';
import { T } from './tuning.ts';
import { RoomScene } from './scenes/RoomScene.ts';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: T.width,
  height: T.height,
  backgroundColor: '#07040a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  scene: [RoomScene],
});

// Exposed for scripts/shot.mjs and for poking at the game from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
