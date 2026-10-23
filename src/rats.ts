import Phaser from 'phaser';
import { blot } from './enemy.ts';

// How the Rat house shows: the rats of every gift, the hero turned into la Nuée, and la Peste (on enemies, on shards,
// leaping with Contagion). Gameplay decides what happens; this file only draws it.

type Scene = Phaser.Scene;
type Sprite = Phaser.Physics.Arcade.Sprite;
type Put = (x: number, y: number, c: number, a?: number) => void;

// Vesna's silver greys over the vampires' blood and night (docs/art.md); plague green-greys.
const SILVER = 0xd4cdd2, GREY = 0x948a91, DARK = 0x574e57, MAUVE = 0x8a6f8f;
const VOID = 0x0b0710, DUSK = 0x2e1838;
const BLOOD = [0x5c0a1c, 0xa3122f, 0xe0284a];
const PLAGUE = [0xc2cc8f, 0x86935e, 0x4f5a3a];

/** A canvas texture painted once, pixel by pixel, with `frames` [name, x, y, w, h] cut from it. */
function bake(scene: Scene, key: string, w: number, h: number, paint: (put: Put) => void, frames: [string, number, number, number, number][] = []) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!;
  paint((x, y, c, a = 1) => {
    t.context.fillStyle = `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${a})`;
    t.context.fillRect(x, y, 1, 1);
  });
  for (const [name, x, y, fw, fh] of frames) t.add(name, 0, x, y, fw, fh);
  t.refresh();
  return key;
}

/** Calls draw(seconds) every frame until the returned function is called (or the scene shuts down), which also
 *  destroys `objs`. */
export function loop(scene: Scene, draw: (t: number) => void, objs: Phaser.GameObjects.GameObject[]) {
  const born = scene.time.now, step = () => draw((scene.time.now - born) / 1000);
  const stop = () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, step);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, stop);
    objs.forEach((o) => o.destroy());
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  step();
  return stop;
}

/** Pixels (`size` square) flung from (x, y): they rise or fly out, then fade. */
export function motes(scene: Scene, x: number, y: number, n: number, colors: readonly number[], depth: number, spread: number, rise: number, size = 1) {
  for (let i = 0; i < n; i++) {
    const p = scene.add.rectangle(x, y, size, size, colors[i % colors.length]).setDepth(depth);
    scene.tweens.add({ targets: p, x: x + Phaser.Math.Between(-spread, spread), y: y - Phaser.Math.Between(rise / 2, rise) + Phaser.Math.Between(-spread, spread) / 2,
      alpha: 0, duration: Phaser.Math.Between(400, 800), ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

// ---------- Nuée: the rats ----------

// Two strides, facing right, outlined so they read on the moonlit floor too: o outline, L grey back, g dark belly,
// k feet, e eye, n mauve (nose, tail), x ground shadow.
const RAT = [[
  '......oo....',
  '...oooLLo...',
  '..oLLLLLLoo.',
  'nnoLLLLLLLeo',
  '..ogggggggon',
  '...ok.o.ko..',
  '..xxxxxxxx..',
], [
  '......oo....',
  '...oooLLo...',
  '..oLLLLLLoo.',
  '.noLLLLLLLeo',
  'n.ogggggggon',
  '...ko..ok...',
  '..xxxxxxxx..',
]];

/** A rat of the swarm at floor point (x, y). */
export function rat(scene: Scene, x: number, y: number) {
  const key = bake(scene, 'rat', 24, 7, (put) => RAT.forEach((rows, f) => rows.forEach((r, j) => [...r].forEach((k, i) => {
    if (k === 'x') put(f * 12 + i, j, VOID, 0.45);
    else if (k !== '.') put(f * 12 + i, j, { o: VOID, L: GREY, g: DARK, k: DUSK, e: BLOOD[2], n: MAUVE }[k]!);
  }))), [['0', 0, 0, 12, 7], ['1', 12, 0, 12, 7]]);
  return scene.add.sprite(x, y, key, '0').setOrigin(0.5, 6 / 7);
}

/** The rat runs along `angle`: legs pattering, facing where it goes, sorted like the characters (11 px above feet). */
export function scurry(r: Phaser.GameObjects.Sprite, angle: number, now: number) {
  r.setFrame(String(Math.floor(now / 50) % 2)).setFlipX(Math.cos(angle) < 0).setDepth(r.y - 11);
}

/** The rat is gone: a puff of grey. */
export function vanish(scene: Scene, r: Phaser.GameObjects.Sprite) {
  motes(scene, r.x, r.y - 2, 5, [GREY, SILVER, DARK], r.y, 4, 5);
  r.destroy();
}

// ---------- la Peste ----------

/** Éclats pestilents: a shard in flight (its floor point; drawn 11 px above it, see Fx.shard) sheds wisps of plague,
 *  over it, until it is spent. */
export function plagueShard(scene: Scene, b: Phaser.GameObjects.Zone) {
  b.once(Phaser.GameObjects.Events.DESTROY, loop(scene, () =>
    motes(scene, b.x, b.y - 11, 1, [Math.random() < 0.6 ? PLAGUE[0] : PLAGUE[1]], b.y + 4, 3, 8, 2), []));
}

/** Contagion: a clot of plague leaps in an arc from floor point (x, y), where a sick enemy died, onto `e`, and bursts. */
export function leap(scene: Scene, x: number, y: number, e: Sprite) {
  const blob = scene.add.rectangle(x - 1, y - 7, 3, 3, PLAGUE[0]).setOrigin(0).setDepth(9_000); // over the characters
  scene.tweens.addCounter({ from: 0, to: 1, duration: 320, onUpdate: (tw) => {
    const k = tw.getValue() ?? 0;
    blob.setPosition(Math.round(x + (e.x - x) * k) - 1, Math.round(y + (e.y - y) * k - 6 - Math.sin(k * Math.PI) * 16) - 1);
    motes(scene, blob.x + 1, blob.y + 1, 1, [Math.random() < 0.5 ? PLAGUE[0] : PLAGUE[1]], blob.depth - 1, 2, 4, 2);
  }, onComplete: () => {
    blob.destroy();
    motes(scene, e.x, e.y - 6, 8, PLAGUE, e.y + 1, 6, 8);
  } });
}

/** An infected enemy: a sickly cast that throbs, and wisps of plague rising off it. Called every frame while it lasts. */
export function plagued(scene: Scene, e: Sprite, now: number) {
  e.setTint(Math.floor(now / 220) % 2 ? PLAGUE[0] : PLAGUE[1]);
  if (now < (e.getData('miasmaAt') ?? 0)) return;
  e.setData('miasmaAt', now + 90);
  motes(scene, e.x + Phaser.Math.Between(-5, 5), e.y + Phaser.Math.Between(-14, -4), 1, [Math.random() < 0.7 ? PLAGUE[0] : PLAGUE[1]], e.y + 1, 3, 14, 2);
}

/** The plague strikes: its cast lifts in a burst of sick green. */
export function plague(scene: Scene, e: Sprite) {
  e.clearTint();
  motes(scene, e.x, e.y - 2, 14, PLAGUE, e.y + 1, 12, 14);
}

// ---------- la Nuée: the hero become a swarm ----------

export type Swarm = { move(x: number, y: number, now: number): void; end(): void };
const SWARM = 8_900; // over the lit world, under the effects (dark.ts)

/** La Nuée: the hero, at floor point (x, y), bursts into `n` rats that mill round where he goes (move(), every frame),
 *  `radius` across at most, over a stepped pool of shadow that makes them one mass, shedding grey dust; end() puffs
 *  them back into one body. Drawn unlit over the room, like the effects (dark.ts), so his own lantern does not bleach
 *  them. */
export function swarm(scene: Scene, x: number, y: number, n: number, radius: number): Swarm {
  motes(scene, x, y - 8, 24, [GREY, SILVER, DARK, BLOOD[1]], y + 1, 14, 16);
  // Each rat runs its own loop round the pack's middle, at its own distance and pace, half of them the other way.
  const pack = Array.from({ length: n }, (_, i) => ({ s: rat(scene, x, y), a: (i / n) * 2 * Math.PI, r: 4 + ((i * 7) % (radius + 3)), w: (i % 2 ? 1 : -1) * (3 + (i % 4)) }));
  const shade = scene.add.graphics().setDepth(SWARM - 1);
  let dustAt = 0, at = { x, y };
  return {
    move(x, y, now) {
      at = { x, y };
      shade.clear();
      for (const [k, a] of [[1.4, 0.35], [1, 0.45]]) {
        shade.fillStyle(VOID, a);
        blot(x, y + 2, radius * k, radius * k * 0.6, (bx, by, w) => shade.fillRect(bx, by, w, 1));
      }
      for (const p of pack) {
        const a = p.a + (now / 1000) * p.w, nx = x + Math.cos(a) * p.r, ny = y + Math.sin(a) * p.r * 0.7;
        const heading = Math.atan2(ny - p.s.y, nx - p.s.x);
        p.s.setPosition(nx, ny);
        scurry(p.s, heading, now);
        p.s.setDepth(SWARM + ny / 1000);
      }
      if (now < dustAt) return;
      dustAt = now + 60;
      motes(scene, x + Phaser.Math.Between(-radius, radius), y + Phaser.Math.Between(-4, 4), 1, [GREY, DARK], y + 1, 3, 6);
    },
    end() {
      shade.destroy();
      pack.forEach((p) => vanish(scene, p.s));
      motes(scene, at.x, at.y - 8, 18, [GREY, SILVER, DARK], at.y + 1, 10, 14);
    },
  };
}

/** The swarm bites an enemy at floor point (x, y): a spray of blood. */
export function gnawed(scene: Scene, x: number, y: number) {
  motes(scene, x, y - 6, 6, BLOOD, y + 1, 6, 8);
}
