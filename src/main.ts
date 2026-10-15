import Phaser from 'phaser';
import { T } from './tuning.ts';
import { RoomScene } from './RoomScene.ts';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: T.width,
  height: T.height,
  pixelArt: true, // nearest-neighbour scaling: native 480x270 shown at x2/x3/x4
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  parent: 'game', // falls back to <body> when there is no #game element
  scene: [RoomScene],
});

// Exposed for scripts/shot.mjs and for poking at the game from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
