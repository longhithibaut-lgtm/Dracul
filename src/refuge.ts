import Phaser from 'phaser';
import type { Room } from './room.ts';
import type { Look } from './dark.ts';
import { T } from './tuning.ts';
import * as D from './refuge.data.ts';
import albedo from './refuge-albedo.png';
import light from './refuge-light.png';
import over from './refuge-over.png';

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

export function preload(scene: Phaser.Scene) {
  for (const [key, url] of [['refuge-albedo', albedo], ['refuge-light', light], ['refuge-over', over]])
    if (!scene.textures.exists(key)) scene.load.image(key, url);
}

export function build(scene: Phaser.Scene): Room {
  scene.add.image(0, 0, 'refuge-albedo').setOrigin(0).setScale(0.5).setDepth(-1000);
  // What stands in front of the floor, sorted at its floor row like a prop.
  const tex = scene.textures.get('refuge-over');
  D.OVER.forEach(([ax, ay, w, h, x, y, depth], n) => {
    if (!tex.has(String(n))) tex.add(String(n), 0, ax, ay, w, h);
    scene.add.image(x / 2, y / 2, 'refuge-over', String(n)).setOrigin(0).setScale(0.5).setDepth(depth);
  });
  const obstacles = scene.physics.add.staticGroup();
  for (const [x, y, w, h] of D.BOXES) obstacles.add(scene.add.zone(x + w / 2, y + h / 2, w, h));
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
    arcades: [],
    width: D.W,
    height: D.H,
    sections: [],
    look: LOOK,
  };
}
