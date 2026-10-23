import Phaser from 'phaser';
import type { Room } from './room.ts';
import type { Look } from './dark.ts';
import { T } from './tuning.ts';
import * as D from './refuge.data.ts';
import * as Baked from './baked.ts';

// The refuge (docs/lore.md « Le refuge »), as its validated mockup shows it before any chief is freed: the crypt of
// coffins where the hero re-forms (his coffin, the four chiefs' shut on their catafalques), the great hall round the dry
// blood basin, the wardrobe off the crypt, the stairs down to the runs; the house rooms walled up. Baked offline from
// the mockup's own scene by tools/art/refuge.gen.mjs (src/refuge.data.ts and three images, one texel per screen px of
// the x2 view, two per room px), lit by dark.ts like the torture room. Bigger than the view both ways: the camera
// follows the hero. No enemy: the stairs start an expedition, the basin banks its blood (RoomScene).

/** Its light and finish, from the mockup's post (tools/art/maquettes/hub3/complex.mjs): the ambient is in its bake. */
export const LOOK: Look = {
  light: 'refuge-light', texel: 2, torches: [], flicker: false, amb: '#000000', night: 0,
  lamp: [6, 22, 140], ys: 1 / 0.616, post: [3.4, 0.4, 0.16, 0.012], vig: [1.12, 0.2, 0.02, 0.004], pal: D.PALETTE, wY: 1.6,
};
export const STAIRS = D.STAIRS;
// The basin of the great hall (its box in refuge.data.ts; the mockup's basin at world 1800, 1560), floor point.
export const BASIN = { x: 840, y: 644 };
// Le Rongé's corner, right of the basin, his floor point (he faces it): his body stops walkers.
export const RONGE = { x: 896, y: 650 };
// Where the hero comes up the stairs from the crypt, his feet below STAIRS in its well (x 816-864).
const STAIRWAY = { x: 840, y: 876 };

export function build(scene: Phaser.Scene): Room {
  const obstacles = Baked.draw(scene, 'refuge', D.OVER, D.BOXES);
  obstacles.add(scene.add.zone(RONGE.x, RONGE.y, 44, 16));
  return {
    bounds: new Phaser.Geom.Rectangle(0, 0, D.W, D.H),
    obstacles,
    pits: scene.physics.add.staticGroup(),
    heroStart: D.START,
    spawns: D.SPAWNS, // the training room's, in the great hall
    spots: D.SPAWNS,
    medallion: D.START,
    exits: [STAIRWAY], // its stairs, down to the crypt
    stairs: STAIRWAY,
    holy: () => false,
    burn: T.lantern,
    width: D.W,
    height: D.H,
    sections: [],
    look: LOOK,
  };
}
