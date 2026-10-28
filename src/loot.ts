import Phaser from 'phaser';
import { words } from './hud.ts';
import { ZOOM } from './dark.ts';
import { blot } from './enemy.ts';
import { loop, motes } from './rats.ts';

// How the blood of the expeditions shows, with no new art: the blood a body leaves to pick up, a cache's scent over the
// prop worth searching, the words that appear as the hero comes near (where an exit leads, the basin, « fouiller »).
// Drawn unlit over the dark rooms (dark.ts), so blood is found in the dark. Gameplay decides; this file only draws.

const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a], GLOW = 0xff4f8b, BONE = 0xe8dcc8;
const UNLIT = 7981; // over the lit world, under the marks over heads (dark.ts)

/** A pool of light breathing at floor point (x, y), `rx` wide, in `c`, `k` strong. */
const pool = (g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, c: number, k: number, t: number) => {
  const b = Math.floor(t * 2.5) % 2;
  for (const [r, a] of [[rx, 0.12], [rx * 0.6, 0.2], [rx * 0.3, 0.32]]) {
    g.fillStyle(c, a * k);
    blot(x, y, r + b, (r + b) * 0.4, (bx, by, w) => g.fillRect(bx, by, w, 1));
  }
};

export type Drop = { x: number; y: number; take(to: { x: number; y: number }): void };

/** Blood a body left at floor point (x, y): a red glow on the floor and a bead of blood bobbing over it. take() sends
 *  it flying to `to` (the hero) and clears it. */
export function drop(scene: Phaser.Scene, x: number, y: number): Drop {
  const glow = scene.add.graphics().setDepth(UNLIT).setBlendMode(Phaser.BlendModes.ADD);
  const bead = scene.add.graphics().setDepth(UNLIT + 1);
  let moteAt = 0;
  const stop = loop(scene, (t) => {
    glow.clear();
    pool(glow, x, y, 9, BLOOD[2], Math.min(1, t * 4), t);
    const by = y - 5 - Math.round(Math.sin(t * 3) + 1);
    bead.clear().fillStyle(BLOOD[1]).fillRect(x - 1, by, 3, 3).fillRect(x, by - 1, 1, 1).fillStyle(GLOW).fillRect(x - 1, by, 1, 1);
    if (t > moteAt) {
      moteAt = t + 0.3;
      motes(scene, x + Phaser.Math.Between(-4, 4), y - 2, 1, [BLOOD[2], BLOOD[1]], UNLIT, 1, 8);
    }
  }, [glow, bead]);
  return {
    x, y, take(to) {
      stop();
      for (let i = 0; i < 8; i++) {
        const p = scene.add.rectangle(x + Phaser.Math.Between(-4, 4), y - Phaser.Math.Between(2, 8), 1, 2, BLOOD[i % 3]).setDepth(UNLIT + 1);
        scene.tweens.add({ targets: p, x: to.x, y: to.y, delay: i * 18, duration: 180, ease: 'Quad.easeIn', onComplete: () => p.destroy() });
      }
    },
  };
}

export type Cache = { take(): void };

/** The scent of blood over a prop worth searching, at floor point (x, y): a faint red breath on the floor, drops of
 *  blood rising now and then. take(): searched, it bursts and is gone. */
export function cache(scene: Phaser.Scene, x: number, y: number): Cache {
  const glow = scene.add.graphics().setDepth(UNLIT).setBlendMode(Phaser.BlendModes.ADD);
  let moteAt = 0;
  const stop = loop(scene, (t) => {
    glow.clear();
    pool(glow, x, y, 14, BLOOD[1], 0.5 + 0.25 * Math.sin(t * 2), t);
    if (t > moteAt) {
      moteAt = t + 0.5;
      motes(scene, x + Phaser.Math.Between(-10, 10), y - Phaser.Math.Between(0, 6), 1, [BLOOD[1], BLOOD[2]], UNLIT, 2, 14);
    }
  }, [glow]);
  return { take() { stop(); motes(scene, x, y - 6, 20, [...BLOOD, GLOW], UNLIT + 1, 12, 18); } };
}

export type Glint = { take(): void };

/** An item lying at floor point (x, y) (its icon, `key`, satchel.ts): a pool of its rarity's `color` breathing on the
 *  floor, the icon bobbing over it, a white glint winking at its corner now and then. take(): picked up, it bursts. */
export function glint(scene: Phaser.Scene, x: number, y: number, key: string, color: number): Glint {
  const glow = scene.add.graphics().setDepth(UNLIT).setBlendMode(Phaser.BlendModes.ADD);
  const star = scene.add.graphics().setDepth(UNLIT + 2);
  const im = scene.add.image(x, y - 10, key).setDepth(UNLIT + 1);
  let moteAt = 0;
  const stop = loop(scene, (t) => {
    glow.clear();
    pool(glow, x, y, 15, color, 1.3, t);
    im.setY(y - 10 - Math.round(Math.sin(t * 2.5) + 1));
    const w = (t * 1000) % 1400; // the wink: a four-point star a moment, every 1.4 s
    star.clear();
    if (w < 160) {
      const r = w < 80 ? 2 : 1, sx = x + 4, sy = im.y - 4;
      star.fillStyle(BONE).fillRect(sx - r, sy, 2 * r + 1, 1).fillRect(sx, sy - r, 1, 2 * r + 1);
    }
    if (t > moteAt) {
      moteAt = t + 0.6;
      motes(scene, x + Phaser.Math.Between(-6, 6), y - 2, 1, [color, BONE], UNLIT, 2, 12);
    }
  }, [glow, star, im]);
  return { take() { stop(); motes(scene, x, y - 10, 16, [color, BONE, GLOW], UNLIT + 1, 10, 16); } };
}

export type Label = { near(on: boolean): void; destroy(): void };

/** Words over floor point (x, y) (a line, or several), shown while the hero is near (near(true)), fading in and out; in
 *  the HUD's italic, one of its pixels a pixel of the view (« F fouiller »: a line ending in « (F) » starts with the key). */
export function label(scene: Phaser.Scene, x: number, y: number, text: string | string[]): Label {
  const im = scene.add.image(x, y, words(scene, [text].flat(), 17)).setOrigin(0.5, 1).setScale(1 / ZOOM).setDepth(7985).setAlpha(0);
  let close = false;
  const stop = loop(scene, () => im.setAlpha(Phaser.Math.Clamp(im.alpha + (close ? 0.1 : -0.1), 0, 1)), [im]);
  return { near: (on) => (close = on), destroy: stop };
}
