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
// follows the hero. No enemy, no wave: the stairs start a run (RoomScene).

/** Its light and finish, from the mockup's post (tools/art/maquettes/hub3/complex.mjs): the ambient is in its bake. */
export const LOOK: Look = {
  light: 'refuge-light', texel: 2, torches: [], flicker: false, amb: '#000000', night: 0,
  lamp: [6, 22, 140], ys: 1 / 0.616, post: [3.4, 0.4, 0.16, 0.012], vig: [1.12, 0.2, 0.02, 0.004], pal: D.PALETTE, wY: 1.6,
};
export const STAIRS = D.STAIRS;

export function build(scene: Phaser.Scene): Room {
  const obstacles = Baked.draw(scene, 'refuge', D.OVER, D.BOXES);
  return {
    bounds: new Phaser.Geom.Rectangle(0, 0, D.W, D.H),
    obstacles,
    pits: scene.physics.add.staticGroup(),
    heroStart: D.START,
    spawns: D.SPAWNS, // the training room's, in the great hall
    spots: D.SPAWNS,
    medallion: D.START,
    gate: D.START,
    stairs: D.START,
    holy: () => false,
    burn: T.lantern,
    width: D.W,
    height: D.H,
    sections: [],
    look: LOOK,
  };
}
