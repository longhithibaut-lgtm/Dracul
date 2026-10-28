import Phaser from 'phaser';
import type { Room } from './room.ts';
import type { Look } from './dark.ts';
import { T } from './tuning.ts';
import * as D from './refuge.data.ts';
import * as V from './refuge-vesna.data.ts';
import * as Baked from './baked.ts';
import * as Save from './save.ts';

// The refuge (docs/lore.md « Le refuge »), as its validated mockup shows it before any chief is freed: the crypt of
// coffins where the hero re-forms (his coffin, the four chiefs' shut on their catafalques), the great hall round the dry
// blood basin, the wardrobe off the crypt, the stairs down to the runs; the house rooms walled up. Baked offline from
// the mockup's own scene by tools/art/refuge.gen.mjs (src/refuge.data.ts and three images, one texel per screen px of
// the x2 view, two per room px), lit by dark.ts. Bigger than the view both ways: the camera
// follows the hero. No enemy: the stairs start an expedition, the basin banks its blood (RoomScene).
// Once Vesna is freed (save.ts), the mockup's state « rat » (tools/art/refuge.gen.mjs --vesna): her coffin open, her shop
// open and walkable; its images are laid over the first's where they differ, its sprites and boxes its own.

/** Its light and finish, from the mockup's post (tools/art/maquettes/hub3/complex.mjs): the ambient is in its bake. */
export const LOOK: Look = {
  light: 'refuge-light', texel: 2, torches: [], flicker: false, amb: '#000000', night: 0,
  lamp: [6, 22, 140], ys: 1 / 0.616, post: [3.4, 0.4, 0.16, 0.012], vig: [1.12, 0.2, 0.02, 0.004], pal: D.PALETTE, wY: 1.6,
};
export const STAIRS = D.STAIRS;
// The basin of the great hall (its box in refuge.data.ts; the mockup's basin at world 1800, 1560), floor point.
export const BASIN = { x: 840, y: 644 };
// Le Rongé, perched on the basin's east rim (docs/maquettes/ronge-1-bassin-scene.png), the floor point under him; the
// basin's box stops walkers, his body too where it hangs past it.
export const RONGE = { x: 857, y: 645 };
// Le coffre, left of the basin as le Rongé is right of it (floor point): the items brought back. Its body stops walkers.
export const CHEST = { x: 762, y: 652 };
// Vesna's place behind her stall, in her shop off the great hall (the mockup's): her floor point; her body stops walkers.
export const VESNA = { x: 1240, y: 564 };
// Where the hero comes up the stairs from the crypt, his feet below STAIRS in its well (x 816-864).
const STAIRWAY = { x: 840, y: 876 };

export function preload(scene: Phaser.Scene) {
  if (!Save.data.vesna) return Baked.preload(scene, 'refuge');
  for (const k of ['albedo', 'light']) if (!scene.textures.exists(`refuge-vesna-${k}`)) { // the first state's, and hers over it, to lay together
    if (!scene.textures.exists(`refuge-${k}`)) scene.load.image(`refuge-${k}`, Baked.url(`refuge-${k}`));
    scene.load.image(`refuge-vesna-${k}~`, Baked.url(`refuge-vesna-${k}`));
  }
  if (!scene.textures.exists('refuge-vesna-over')) scene.load.image('refuge-vesna-over', Baked.url('refuge-vesna-over'));
}

/** Vesna freed: her state's albedo and light, the first's with hers laid over where they differ (one canvas each). */
function layered(scene: Phaser.Scene) {
  for (const k of ['albedo', 'light']) {
    const key = `refuge-vesna-${k}`;
    if (scene.textures.exists(key)) continue;
    const base = scene.textures.get(`refuge-${k}`).getSourceImage() as HTMLImageElement, over = scene.textures.get(`${key}~`).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas'); // a plain one (a Phaser CanvasTexture keeps a copy of its pixels too)
    [c.width, c.height] = [base.width, base.height];
    const g = c.getContext('2d')!;
    g.drawImage(base, 0, 0);
    g.drawImage(over, 0, 0);
    scene.textures.addImage(key, c as unknown as HTMLImageElement);
    for (const k2 of [`${key}~`, `refuge-${k}`]) scene.textures.remove(k2); // a big room: never both states held at once (headless, it ran out of memory)
  }
}

export function build(scene: Phaser.Scene): Room {
  const freed = Save.data.vesna;
  if (freed) layered(scene);
  const obstacles = freed ? Baked.draw(scene, 'refuge-vesna', V.OVER, V.BOXES) : Baked.draw(scene, 'refuge', D.OVER, D.BOXES);
  obstacles.add(scene.add.zone(RONGE.x + 3, RONGE.y, 20, 16));
  if (freed) obstacles.add(scene.add.zone(VESNA.x, VESNA.y - 2, 28, 10));
  obstacles.add(scene.add.zone(CHEST.x, CHEST.y - 2, 28, 12));
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
    look: freed ? { ...LOOK, light: 'refuge-vesna-light' } : LOOK,
  };
}
