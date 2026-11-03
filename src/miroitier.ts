import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Sfx from './sfx.ts';
import * as Foes from './foes.ts';
import { run } from './enemy.ts';
import { SHEETS } from './foes.data.ts';
import { inArc, poiseHit } from './logic.ts';
import { floor, floorAngle, inBeam, sweepTo } from './fauna.ts';
import type { Ctx } from './foes.ts';

// Le Miroitier (T.miroitier, fauna.ts; docs/maquettes/necropole-ennemis-planche-3.png): an acolyte of the Order with a
// great bronze mirror and a small lantern at his hip. He keeps at the beam's range; the hero in reach on a clear line,
// he lifts the mirror over his head and tilts it, catching the light (lift, the tell: a glare swelling on the bronze, a
// hum rising), then throws it (beam): a shaft of holy light falling on the floor ahead of him, the Dawn's near the breach
// (farther), his lantern's elsewhere, turning slowly after the hero; props and walls cut it, and the hero in it burns as
// in any holy light (RoomScene). Aware, he holds the bronze before him: a blow on his front rings off it (guards()), the
// claws wear it, and worn through it shatters (he reels, bare from then on, and runs). Foes.show draws his body; this
// file, the glare and the beam. Nothing on the floor but the light itself.
type Sprite = Phaser.Physics.Arcade.Sprite;
type Pt = { x: number; y: number };
const S = SHEETS.miroitier, SQ = T.lantern.squash;

export function step(c: Ctx, e: Sprite, time: number) {
  const M = T.miroitier, from = e.body!.center, to = c.hero.body!.center, at: number = e.getData('fireAt');
  const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = floor(from, to), dt = Math.min(50, time - (e.getData('stepAt') ?? time));
  const fx = fxOf(c.scene, e);
  e.setData({ stepAt: time, burning: false });
  switch (e.getData('state')) {
    case 'lift': // the mirror coming up, his aim on the hero until just before the beam
      e.setVelocity(0);
      if (time < at - M.lockMs) e.setData({ aim: toHero, facing: toHero, beamAim: floorAngle(from, to) });
      glare(fx, e, Phaser.Math.Clamp(1 - (at - time) / M.liftMs, 0, 1), time);
      if (time >= at) {
        e.setData({ state: 'beam', fireAt: time + M.beamMs });
        Sfx.play(c.scene, 'holy');
      }
      return;
    case 'beam': { // turning after him, cut short by what stands in its way
      e.setVelocity(0);
      const a = sweepTo(e.getData('beamAim'), floorAngle(from, to), dt), sa = Math.atan2(Math.sin(a) * SQ, Math.cos(a));
      const reach = M.reach[e.getData('dawn') ? 1 : 0], len = Math.min(reach, c.ray(from, sa) * Math.hypot(Math.cos(sa), Math.sin(sa) / SQ)); // floor px
      const burning = inBeam(from, a, len, to) && c.ray(from, toHero) >= Phaser.Math.Distance.BetweenPoints(from, to) - 2;
      e.setData({ beamAim: a, aim: sa, facing: sa, burning, beamLen: len });
      beam(fx, e, from, a, len, time);
      glare(fx, e, 1, time);
      if (time >= at) e.setData({ state: 'recover', fireAt: time + M.recoverMs, readyAt: time + M.reloadMs });
      return;
    }
    case 'recover':
      e.setVelocity(0);
      if (time < at) return;
  }
  e.setData('state', 'chase');
  if (!c.hunts(e)) return c.idle(e);
  if (e.getData('bare')) return c.keepAt(e, toHero, dist, M.bare[0], M.bare[1], M.speed); // his mirror broken: he runs
  const dawn = c.holy(from.x, from.y) || Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4).some((a) => c.holy(from.x + Math.cos(a) * M.dawn, from.y + Math.sin(a) * M.dawn * SQ));
  if (time >= (e.getData('readyAt') ?? 0) && c.scene.cameras.main.worldView.contains(from.x, from.y) && dist <= M.reach[dawn ? 1 : 0] * 0.9
    && c.ray(from, toHero) >= Phaser.Math.Distance.BetweenPoints(from, to) - 2) {
    e.setVelocity(0).setData({ state: 'lift', fireAt: time + M.liftMs, aim: toHero, facing: toHero, beamAim: floorAngle(from, to), dawn });
    return void Sfx.play(c.scene, 'glare', M.liftMs / 1000);
  }
  c.keepAt(e, toHero, dist, M.near, M.far, M.speed);
}

/** A blow (a claw of `weight`, a shard: 0) coming from `from`: aware, his mirror whole, and it comes at his front, the
 *  bronze takes it (sparks, a ring): it wears it as poise; worn through, it shatters (he reels, bare from then on). True
 *  when the mirror took it (RoomScene.parried()). */
export function guards(c: Ctx, e: Sprite, from: Pt, weight: number, now: number) {
  const M = T.miroitier, centre = e.body!.center;
  if (e.getData('bare') || !e.getData('alert') || now < (e.getData('staggerUntil') ?? 0) || !inArc(centre, e.getData('facing') ?? 0, from, Infinity, 2 * M.guardDeg)) return false;
  const { taken, breaks } = poiseHit({ taken: e.getData('wear') ?? 0, lastAt: e.getData('wearAt') ?? -1e9, steadyUntil: 0 }, now, weight, M.mirror, T.poise.regenMs);
  const a = Phaser.Math.Angle.BetweenPoints(from, centre);
  e.setData({ wear: taken, wearAt: now });
  if (!breaks) {
    Foes.parry(c.scene, centre.x - Math.cos(a) * 8, centre.y - Math.sin(a) * 8, a);
    Sfx.play(c.scene, 'parry');
    return true;
  }
  e.setVelocity(0).setData({ bare: true, burning: false, state: 'chase', until: 0, stunnedUntil: now + M.shatterMs, staggerUntil: now + M.shatterMs, poiseUntil: now + M.shatterMs });
  shatter(c.scene, mirrorAt(e), a);
  c.scene.cameras.main.shake(140, new Phaser.Math.Vector2(3 / c.scene.cameras.main.width, 3 / c.scene.cameras.main.height));
  Sfx.play(c.scene, 'shatter', 1);
  return true;
}

/** Where the mirror's middle is (his sheet's lamp, wherever this frame has it), on the screen. */
function mirrorAt(e: Sprite) {
  const [lx, ly] = (e.frame.customData as { lamp: [number, number] }).lamp;
  return { x: e.x + ((lx - S.FW / 2) / 2) * (e.flipX ? -1 : 1), y: e.y + (ly - S.SOLE) / 2 + 10 };
}

/** His lights in the dark rooms (dark.ts): his lantern; the glare swelling on the bronze; the beam's light on the floor. */
export function lights(e: Sprite, time: number) {
  const st = e.getData('state'), feet = e.y + 10, out: { x: number; y: number; h: number; lit: boolean; I: number }[] = [];
  if (st === 'lift' || st === 'beam') {
    const m = mirrorAt(e), k = st === 'beam' ? 1 : Phaser.Math.Clamp(1 - (e.getData('fireAt') - time) / T.miroitier.liftMs, 0, 1);
    out.push({ x: m.x, y: feet, h: feet - m.y, lit: true, I: 0.4 + 2.2 * k });
    if (st === 'beam') { // two thirds of the way down the shaft, on the floor
      const a: number = e.getData('beamAim'), d = (e.getData('beamLen') ?? 0) * 0.66, c = e.body!.center;
      out.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * SQ, h: 0, lit: true, I: 2.4 });
    }
  } else out.push({ x: e.x + (e.flipX ? -5 : 5), y: feet, h: 10, lit: true, I: 0.35 }); // his lantern at his hip
  return out;
}

// The glare on the bronze, `k` 0 to 1 as it catches the light: a soft bloom swelling, a white core, a cross of rays that
// lengthen and shimmer.
function glare(g: Phaser.GameObjects.Graphics, e: Sprite, k: number, time: number) {
  const m = mirrorAt(e), s = 0.85 + 0.15 * Math.sin(time / 37) * Math.sin(time / 61), x = Math.round(m.x), y = Math.round(m.y);
  g.fillStyle(0xffe8a0, (0.06 + 0.22 * k) * s).fillCircle(x, y, 3 + 10 * k * s);
  g.fillStyle(0xfff4d0, (0.25 + 0.5 * k) * s).fillCircle(x, y, 1 + 3.5 * k);
  const r = Math.round((3 + 14 * k * k) * s);
  g.fillStyle(0xfffaf0, 0.3 + 0.6 * k).fillRect(x - r, y, 2 * r + 1, 1).fillRect(x, y - Math.round(r * 0.6), 1, Math.round(r * 1.2) + 1);
  if (k > 0.5) g.fillStyle(0xffffff, (k - 0.5) * 2 * s).fillRect(x - 1, y - 1, 3, 3);
}

// The shaft from the mirror down onto the floor along floor angle `a`, out to `len`: a wedge of pale gold light, a
// brighter core, motes turning in it, and its strip on the floor, glazed.
function beam(g: Phaser.GameObjects.Graphics, e: Sprite, from: Pt, a: number, len: number, time: number) {
  const M = T.miroitier, m = mirrorAt(e), tan = Math.tan((M.halfDeg * Math.PI) / 180), ca = Math.cos(a), sa = Math.sin(a);
  const at = (d: number, side: number) => { const w = Math.max(M.width, d * tan) * side; return { x: from.x + ca * d - sa * w, y: from.y + (sa * d + ca * w) * SQ }; };
  const n0 = 10, flick = 0.9 + 0.1 * Math.sin(time / 53);
  const [nl, nr, fl, fr] = [at(n0, -1), at(n0, 1), at(len, -1), at(len, 1)];
  poly(g.fillStyle(0xffe6a0, 0.13 * flick), [m, fl, fr]); // the shaft through the air
  poly(g.fillStyle(0xfff2c8, 0.12 * flick), [m, at(len, -0.4), at(len, 0.4)]);
  poly(g.fillStyle(0xffe8b0, 0.3 * flick), [nl, fl, fr, nr]); // where it falls
  poly(g.fillStyle(0xfff6dc, 0.25 * flick), [at(n0, -0.45), at(len, -0.45), at(len, 0.45), at(n0, 0.45)]);
  g.lineStyle(0.5, 0xfffaf0, 0.5 * flick).lineBetween(fl.x, fl.y, fr.x, fr.y); // its edge where it is cut
  for (let i = 0; i < 14; i++) { // motes
    const h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h), k = ((u + time / 2600) % 1), p = at(n0 + (len - n0) * k, (u * 7) % 2 - 1);
    g.fillStyle(0xfffaf0, 0.6 * Math.sin(k * Math.PI)).fillRect(Math.round(m.x + (p.x - m.x) * k), Math.round(m.y + (p.y - m.y) * k), 1, 1);
  }
}

const poly = (g: Phaser.GameObjects.Graphics, p: Pt[]) => {
  g.beginPath().moveTo(p[0].x, p[0].y);
  for (const q of p.slice(1)) g.lineTo(q.x, q.y);
  g.closePath().fillPath();
};

// The mirror shattering at `at`, struck from angle `a`: bronze shards flung out and falling, glinting as they turn.
function shatter(scene: Phaser.Scene, at: Pt, a: number) {
  const g = scene.add.graphics().setDepth(9000);
  run(scene, 700, (t) => {
    g.clear();
    const k = t / 0.7;
    for (let i = 0; i < 16; i++) {
      const h = Math.sin(i * 78.233) * 43758.5453, u = h - Math.floor(h), d = a + (u - 0.5) * 2.6, v = 20 + 40 * ((i * 0.618) % 1);
      const x = at.x + Math.cos(d) * v * k, y = at.y + Math.sin(d) * v * k * SQ + 46 * k * k;
      g.fillStyle(Math.sin(t * 30 + i) > 0.3 ? 0xffe8a0 : i % 2 ? 0xa07a3a : 0x5a3e1a, 1 - k * k).fillRect(Math.round(x), Math.round(y), i % 3 ? 1 : 2, 1);
    }
    if (k < 0.3) g.fillStyle(0xfff4d0, (0.3 - k) * 3).fillCircle(at.x, at.y, 3 + 14 * k);
  }, () => g.destroy());
}

// His own layer (over the floor's sprites, unlit: the light shows in the dark), cleared every frame before he is
// stepped (so a daze cuts the beam off at once).
function fxOf(scene: Phaser.Scene, e: Sprite) {
  let g = e.getData('fxG') as Phaser.GameObjects.Graphics | undefined;
  if (!g) {
    const gg = (g = scene.add.graphics().setDepth(7985).setBlendMode(Phaser.BlendModes.ADD)), clear = () => gg.clear();
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, clear);
    e.setData('fxG', g).once(Phaser.GameObjects.Events.DESTROY, () => { scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, clear); gg.destroy(); });
  }
  return g;
}
