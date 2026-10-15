import Phaser from 'phaser';
import { T } from './tuning.ts';

// How the arena looks and where its solid parts are.
export type Room = {
  bounds: Phaser.Geom.Rectangle; // walkable area
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  heroStart: { x: number; y: number };
  spawns: { x: number; y: number }[]; // fixed, so screenshots are comparable run to run
};

export function build(scene: Phaser.Scene): Room {
  // shortcut: placeholder flat colours, replaced by real pixel art in the room piece.
  const wall = 16;
  scene.add.rectangle(0, 0, T.width, T.height, 0x1a1420).setOrigin(0);
  scene.add.graphics().fillStyle(0x0b080e)
    .fillRect(0, 0, T.width, wall).fillRect(0, T.height - wall, T.width, wall)
    .fillRect(0, 0, wall, T.height).fillRect(T.width - wall, 0, wall, T.height);

  const obstacles = scene.physics.add.staticGroup();
  for (const [x, y] of [[150, 110], [330, 110], [150, 190], [330, 190]]) {
    const p = scene.add.rectangle(x, y, 20, 26, 0x2c2632).setDepth(y + 13);
    obstacles.add(p);
  }
  return {
    bounds: new Phaser.Geom.Rectangle(wall, wall, T.width - 2 * wall, T.height - 2 * wall),
    obstacles,
    heroStart: { x: 240, y: 220 },
    spawns: [{ x: 240, y: 70 }, { x: 90, y: 150 }, { x: 390, y: 150 }],
  };
}
