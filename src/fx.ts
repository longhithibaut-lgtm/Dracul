import Phaser from 'phaser';
import * as Blood from './fx-blood.ts';

// Combat feedback: slashes, impacts, dash trail, being hurt. Gameplay only says what happened and where. The effects
// themselves are the blood of « A. Sang » (fx-blood.ts); here, the camera's shakes and the hurt pulse.

const BLOOD = 0xa3122f, DRIED = 0x5c0a1c;

// The last swing: impacts land in the same tick as their slash, so they can match its weight.
let swing = { heavy: false, mist: false };

/** A claw swing; `combo` 0, 1, 2: swipe, back-swipe, then the finisher, wider, longer and heavier; 3: the dash strike. */
export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, combo: number) {
  swing = { heavy: combo === 2, mist: combo === 3 };
  Blood.slash(scene, x, y, angle, combo);
}

export function hit(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const { heavy, mist } = swing;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Small, sharp shake, mostly along the blow; the finisher's is the hardest of the claws.
  const cam = scene.cameras.main, kick = heavy ? 4 : mist ? 3 : 2;
  cam.shake(heavy ? 150 : mist ? 90 : 70, new Phaser.Math.Vector2((0.6 + kick * Math.abs(cos)) / cam.width, (0.6 + kick * Math.abs(sin)) / cam.height));
  Blood.hit(scene, x, y, angle, heavy);
}

/** The fangs sink in at the throat (x, y): a short shake, and the blood. */
export function bite(scene: Phaser.Scene, x: number, y: number) {
  const cam = scene.cameras.main;
  cam.shake(90, new Phaser.Math.Vector2(2 / cam.width, 1.5 / cam.height));
  Blood.bite(scene, x, y);
}

export const { dash, shard, splat, snap, drain, heal, drip } = Blood;

/** Clears and redraws a Graphics every frame with the elapsed ms, for `ms`, then destroys it. */
function animate(scene: Phaser.Scene, depth: number, ms: number, draw: (g: Phaser.GameObjects.Graphics, t: number) => void) {
  const g = scene.add.graphics().setDepth(depth);
  draw(g, 0);
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, onUpdate: (tw) => draw(g.clear(), tw.getValue() ?? 0), onComplete: () => g.destroy() });
}

/** The hero is hurt; `k`: how hard the blow was (blood lost), for the shake. */
export function hurt(scene: Phaser.Scene, k = 1) {
  const cam = scene.cameras.main, w = cam.width / cam.zoom, h = cam.height / cam.zoom;
  cam.shake(130 + 50 * (k - 1), new Phaser.Math.Vector2((3 * Math.sqrt(k)) / w, (3 * Math.sqrt(k)) / h));
  // One soft blood-red pulse and a dark frame closing in: short and translucent, never a full-screen white-out.
  animate(scene, 19_000, 260, (g, t) => {
    const k = t / 260, b = Math.round(14 * (1 - k) ** 2);
    g.setScrollFactor(0);
    g.fillStyle(BLOOD, 0.28 * (1 - k) ** 2).fillRect(-8, -8, w + 16, h + 16);
    g.fillStyle(DRIED, 0.75 * (1 - k)).fillRect(-8, -8, w + 16, b + 8).fillRect(-8, h - b, w + 16, b + 8)
      .fillRect(-8, b, b + 8, h - 2 * b).fillRect(w - b, b, b + 8, h - 2 * b);
  });
}
