import Phaser from 'phaser';
import { T } from './tuning.ts';
import { viewSize } from './logic.ts';
import { RoomScene } from './RoomScene.ts';
import { fit } from './dark.ts';

// The view follows the screen's shape, in native pixels: a 480x270 box along its long side (exactly 480x270 on 16:9,
// x4 on 1080p), the other side grown to fill it, upright too. ENVELOP covers the screen, cropping the rounding's
// fraction of a pixel, so there are never bars; nearest-neighbour scaling (pixelArt) keeps the pixels sharp.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  ...viewSize(innerWidth, innerHeight, T.width, T.height),
  pixelArt: true,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  parent: 'game', // falls back to <body> when there is no #game element
  scene: [RoomScene],
});
// Live, on a resize or a turn of the phone; the scene re-frames itself on the same event (RoomScene.frame). The game
// draws it at dark.ts ZOOM.
game.scale.on(Phaser.Scale.Events.RESIZE, () => fit(game.scale));

// The installable app (public/manifest.webmanifest) needs a service worker; pages that may not register one (a framed
// preview) just skip it.
navigator.serviceWorker?.register('sw.js').catch(() => {});

// Exposed for scripts/shot.mjs and for poking at the game from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
