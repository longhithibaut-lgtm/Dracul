import Phaser from 'phaser';
import { T } from './tuning.ts';
import { viewSize } from './logic.ts';
import { RoomScene } from './RoomScene.ts';
import { TitleScene } from './title.ts';
import { PauseScene } from './pause.ts';
import { OptionsScene } from './options.ts';
import * as Settings from './settings.ts';
import * as Keys from './keys.ts';
import { fit } from './dark.ts';

// The view follows the screen's shape, in native pixels: a 480x270 box along its long side (exactly 480x270 on 16:9,
// x4 on 1080p), the other side grown to fill it. ENVELOP covers the screen, cropping the rounding's
// fraction of a pixel, so there are never bars; nearest-neighbour scaling (pixelArt) keeps the pixels sharp.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  ...viewSize(innerWidth, innerHeight, T.width, T.height),
  pixelArt: true,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  parent: 'game', // falls back to <body> when there is no #game element
  scene: [],
});
// The game opens on the title screen (title.ts), over the refuge's crypt; `?play` skips it, straight into the refuge
// (scripts/shot.mjs and the tools' bots). The menus are drawn over the room by their own scenes.
game.scene.add('room', RoomScene, true, new URLSearchParams(location.search).has('play') ? {} : { title: true });
game.scene.add('title', TitleScene);
game.scene.add('pause', PauseScene);
game.scene.add('options', OptionsScene);
game.events.once(Phaser.Core.Events.READY, () => { Settings.apply(game); Keys.capture(); }); // booted: its sound, its key listener
// Live, on a resize; the scene re-frames itself on the same event (RoomScene.frame). The game
// draws it at dark.ts ZOOM.
game.scale.on(Phaser.Scale.Events.RESIZE, () => fit(game.scale));

// Exposed for scripts/shot.mjs and for poking at the game from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
