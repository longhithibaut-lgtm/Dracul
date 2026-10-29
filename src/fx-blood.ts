import Phaser from 'phaser';
import { T } from './tuning.ts';
import { prelit, SANG, ZOOM } from './dark.ts';
import { stains } from './enemy.ts';

// « A. Sang » (docs/maquettes/fx-a-sang.png): the combat effects (fx.ts hands
// over to these). Arterial dark red, sprays of drops that fall and stay on the
// floor, clotted vapour; nothing glows, nothing is white. Drawn on the hero's fine grid: Graphics scaled 1/Z, so a unit
// here is one screen pixel of the x2 room (coordinates are room px times Z). What lands goes into the floor's blood
// layer (enemy.ts stains), which keeps it for the rest of the fight. Over the lit room, unlit (ABOVE, or the prelit
// blend for what sorts among the characters), like the mockup.

const Z = ZOOM; // fine px per room px
const B = SANG; // the mockup's blood, black to arterial
const BONE = [0xad9e80, 0xcfc2a2];
const ABOVE = 9_000;
const SQ = 0.72; // the ground seen at an angle (fx.ts SQUASH)
const GRAVITY = 520 * Z; // fine px/s²
const LIFT = 14 * Z; // a swing's plane above the floor: 1 px under the hero's y (fx.ts), whose soles are 15 below
const SHOT_HEIGHT = 11; // Le Tir flies this far above its floor point (fx.ts)

type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };
const rnd = Phaser.Math.FloatBetween;
const ease = Phaser.Math.Easing.Cubic.Out;
const pick = (a: number[]) => a[Math.floor(Math.random() * a.length)];
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const dot = (g: G, x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(Math.round(x), Math.round(y), 1, 1);
function seg(g: G, x0: number, y0: number, x1: number, y1: number, c0: number, c1 = c0) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) dot(g, x0 + ((x1 - x0) * i) / (n || 1), y0 + ((y1 - y0) * i) / (n || 1), i * 2 < n ? c1 : c0);
}

// Value noise, as the mockup's generator (its hash2 and vn).
function h2(x: number, y: number, s: number) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Graphics are kept and handed out again (hidden meanwhile): a fight throws dozens of effects a second.
const spare: G[] = [];
function take(scene: Phaser.Scene, depth: number, blend: number) {
  for (let g = spare.pop(); g; g = spare.pop()) if (g.scene === scene) return g.clear().setDepth(depth).setBlendMode(blend).setVisible(true);
  return scene.add.graphics().setScale(1 / Z).setDepth(depth).setBlendMode(blend);
}
const give = (g: G) => g.scene && spare.push(g.clear().setVisible(false));

/** Clears and redraws a Graphics every frame with the elapsed ms, for `ms`, then gives it back and calls `done`. */
function anim(scene: Phaser.Scene, depth: number, ms: number, draw: (g: G, t: number) => void, blend = 0, done?: () => void) {
  const g = take(scene, depth, blend);
  draw(g, 0);
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, onUpdate: (tw) => draw(g.clear(), tw.getValue() ?? 0), onComplete: () => (give(g), done?.()) });
  return g;
}

/** A drop of blood thrown at t0 ms from floor point (x, y), z above it (fine px, px/s); it stains the floor where it
 *  lands, `n` px smeared along its way. */
type Drop = { t0: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; c: number; n: number; back: boolean; land: number; on: boolean };
function drop(t0: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, c: number, n = 1, back = false): Drop {
  return { t0, x, y, z, vx, vy, vz, c, n, back, land: t0 + ((vz + Math.sqrt(vz * vz + 2 * GRAVITY * Math.max(0, z))) / GRAVITY) * 1000, on: true };
}
const until = (drops: Drop[], ms: number) => drops.reduce((m, d) => Math.max(m, d.land + 20), ms);

/** The drops in flight at t ms, streaked when fast (onto `back` those behind the hero); lays those that have landed. */
function rain(front: G, back: G | null, drops: Drop[], t: number) {
  let floor: ReturnType<typeof stains> | undefined;
  for (const d of drops) {
    if (!d.on || t < d.t0) continue;
    const at = (ms: number) => {
      const s = (Math.min(ms, d.land) - d.t0) / 1000;
      return { x: d.x + d.vx * s, y: d.y + d.vy * s, z: Math.max(0, d.z + d.vz * s - (GRAVITY / 2) * s * s) };
    };
    const p = at(t);
    if (t >= d.land) {
      d.on = false;
      floor ??= stains(front.scene);
      const v = Math.hypot(d.vx, d.vy) || 1, x = Math.round(p.x), y = Math.round(p.y);
      for (let i = 0; i < d.n; i++) floor.fill(i ? B[2] : B[3], 1, Math.round(x - (d.vx / v) * i) / Z, Math.round(y - (d.vy / v) * i * 0.6) / Z, 1 / Z, 1 / Z);
      continue;
    }
    const q = at(t - 14), g = d.back && back ? back : front;
    if (Math.abs(p.x - q.x) + Math.abs(p.y - p.z - q.y + q.z) > 2) seg(g, q.x, q.y - q.z, p.x, p.y - p.z, B[3], d.c);
    else dot(g, p.x, p.y - p.z, d.c);
  }
  floor?.render();
}

/**
 * A claw swing, on fx.ts's geometry (combo 0, 1, 2: swipe, back-swipe, finisher; 3: the dash strike): three wet rakes
 * (four on the finisher and the dash strike) around the body on the ground plane seen squashed, their outer lip
 * glistening near the claws, over a dark brushed smear; drops flung off the claws all along, falling to the floor, some
 * dripping straight down. The dash strike's tail is the clotted vapour it came out of.
 */
export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, combo: number) {
  const heavy = combo === 2, mist = combo === 3, dir = combo === 1 ? -1 : 1;
  const R = (heavy ? T.slash.finisherRange - 1 : T.slash.range - 3) * Z, n = heavy || mist ? 4 : 3, sp = heavy ? 3.8 : 3.1, W = sp * n + 2;
  const a0 = Phaser.Math.DegToRad(heavy ? -170 : mist ? -150 : -125), a1 = Phaser.Math.DegToRad(heavy ? 50 : mist ? 40 : 30), span = a1 - a0, len = span * R;
  const swingMs = heavy ? 80 : 60, hold = heavy ? 40 : 20, life = heavy ? 340 : mist ? 300 : 250;
  const ox = Math.round(x * Z), oy = Math.round(y * Z) + Z, aim = Math.atan2(Math.sin(angle) / SQ, Math.cos(angle));
  const wmax = (i: number) => (heavy ? 2.8 : 2.3) - 0.3 * i;
  // Every pixel the swing may cover, with what stays put while it plays: x, y, along the swing (u, 0..1), behind the
  // body, the smear's brush streaks, the vapour's clots, then each rake's signed distance (outward < 0; they wobble).
  const K = 6 + n, cells: number[] = [], r = R + 2, ry = Math.ceil(r * SQ), STEPS = 256;
  const wobble = Array.from({ length: n }, (_, i) => Array.from({ length: STEPS + 1 }, (_, k) => // along the swing only: a table
    1.5 + i * sp + (heavy ? i * 0.6 : 0) + (vn((k / STEPS) * len / 7, i * 7, i) - 0.5) * 1.6 + (vn(((k / STEPS) * len) / 2, i * 3, i + 1) - 0.5) * 0.5));
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -r; dx <= r; dx++) {
    const gx = dx + 0.5, gy = (dy + 0.5) / SQ, depth = R - Math.hypot(gx, gy);
    if (depth < -1 || depth > W) continue;
    const u = (dir * Phaser.Math.Angle.Wrap(Math.atan2(gy, gx) - aim) - a0) / span;
    if (u < 0 || u > 1) continue;
    const X = ox + dx, Y = oy + dy;
    cells.push(X, Y, u, gy < 0 ? 1 : 0, vn((u * len) / 2.5, depth * 0.9, 5), mist ? 0.6 * vn(X / 4, Y / 4, 3) + 0.4 * vn(X / 2, Y / 2, 4) : 0);
    for (let i = 0; i < n; i++) cells.push(depth - wobble[i][Math.round(u * STEPS)]);
  }
  const head = (t: number) => Math.min(1, 0.55 + 0.45 * ease(Math.min(1, t / swingMs)));
  // The spray: each drop leaves a rake as the claws pass there (before the first frame: already flying).
  const drops: Drop[] = [];
  for (let k = 0, N = heavy ? 60 : mist ? 44 : 34; k < N; k++) {
    const u = Math.random(), t0 = u < 0.55 ? (u - 0.55) * 160 : (1 - Math.cbrt(1 - (u - 0.55) / 0.45)) * swingMs;
    const A = aim + dir * (a0 + u * span), rr = R - rnd(0, W - 2), tan = A + (dir * Math.PI) / 2, drip = Math.random() < 0.3;
    const vr = drip ? rnd(0, 8) : rnd(30, heavy ? 130 : 100), vt = drip ? 0 : rnd(10, 70);
    drops.push(drop(t0, ox + Math.cos(A) * rr, oy + Math.sin(A) * rr * SQ + LIFT, LIFT, Math.cos(A) * vr + Math.cos(tan) * vt, (Math.sin(A) * vr + Math.sin(tan) * vt) * SQ,
      drip ? 0 : rnd(-20, 70), pick([B[3], B[4], B[4], B[5]]), drip ? 1 : vr > 80 ? 3 : 2, Math.sin(A) < 0));
  }
  const u0 = new Float64Array(n), u1 = new Float64Array(n);
  const back = take(scene, y - 0.5, prelit(scene)); // the far side of the swing, behind the hero
  anim(scene, ABOVE, until(drops, life), (g, t) => {
    back.clear();
    const h = head(t), fade = Math.min(1, Math.max(0, (t - swingMs - hold) / (life - swingMs - hold))), tail = Math.min(h - 0.02, fade ** 0.7);
    for (let i = 0; i < n; i++) { u0[i] = tail + 0.05 * i + 0.04 * h2(i, 3, 9); u1[i] = h - 0.03 * i - 0.03 * h2(i, 5, 9); }
    if (fade < 1) for (let p = 0; p < cells.length; p += K) {
      const u = cells[p + 2];
      if (u < tail || u > h) continue;
      const q = (h - u) / (h - tail);
      let c = -1, a = 1;
      for (let i = 0; i < n; i++) {
        if (u < u0[i] || u > u1[i]) continue;
        const qi = (u1[i] - u) / (u1[i] - u0[i]), d = cells[p + 6 + i];
        const w = wmax(i) * Math.min(1, ((u1[i] - u) * len) / 6) ** 0.5 * (0.35 + 0.65 * (1 - qi) ** 1.2) * (1 - 0.6 * fade);
        const e = Math.abs(d) - w / 2;
        if (e >= 0.15) continue;
        if (qi > 0.8 && (cells[p] + cells[p + 1]) & 1) break; // the rake's end, dithered
        const k = Math.max(0, 1 - qi * 1.25) * (1 - 0.2 * i) - fade * 0.6;
        c = e > -0.9 && d < 0 && qi < 0.22 && i < 2 && fade < 0.3 ? B[6] : k > 0.6 ? B[5] : k > 0.25 ? B[4] : B[3];
        break;
      }
      const clot = cells[p + 5];
      if (c < 0 && mist && q > 0.45 && clot > 0.42 + 0.3 * (1 - q)) {
        c = clot > 0.62 ? B[3] : clot > 0.52 ? B[2] : B[1];
        a = 0.8;
      } else if (c < 0 && cells[p + 4] > 0.25 + 0.6 * q) {
        c = B[2];
        a = 0.5 * (1 - q) ** 1.3 * (1 - fade);
      }
      if (c >= 0 && a > 0.04) (cells[p + 3] ? back : g).fillStyle(c, a).fillRect(cells[p], cells[p + 1], 1, 1);
    }
    rain(g, back, drops, t);
  }, 0, () => give(back));
}

/** A wound bursts at (ix, iy), the floor at fy below it (fine px), thrown along `angle`: a dark clot with a wet glint,
 *  a cone of drops, jets that streak the floor farther off, and a puddle. `k` sizes it (1: a claw). */
function burst(scene: Phaser.Scene, ix: number, iy: number, fy: number, angle: number, k: number, spread = 0.55, runnels = false) {
  const z = Math.max(4, fy - iy), drops: Drop[] = [];
  for (let i = 0, N = Math.round(22 * k); i < N; i++) {
    const a = angle + gauss() * spread, v = rnd(30, 110) * Math.sqrt(k);
    drops.push(drop(0, ix, fy, z, Math.cos(a) * v, Math.sin(a) * v * 0.8, rnd(-10, 90), pick([B[4], B[5], B[5], B[6]]), v > 80 ? 2 : 1));
  }
  for (let i = 0, N = Math.round(6 * k); i < N; i++) {
    const a = angle + gauss() * 0.3 * Math.min(1, spread * 2), v = rnd(150, 260);
    drops.push(drop(rnd(0, 30), ix, fy, z, Math.cos(a) * v, Math.sin(a) * v * 0.5, rnd(0, 25), B[4], Phaser.Math.Between(3, 7)));
  }
  const ca = Math.cos(angle), sa = Math.sin(angle), rc = k > 1.2 ? 4.5 : k > 0.8 ? 3.5 : 2.5;
  let pooled = false;
  anim(scene, ABOVE, until(drops, 300), (g, t) => {
    if (t < 260) { // the clot, drying and shrinking
      const r = rc * (1 - (0.5 * t) / 260);
      for (let Y = iy - 6; Y <= iy + 6; Y++) for (let X = ix - 6; X <= ix + 6; X++) {
        const dd = Math.hypot(X - ix, (Y - iy) * 1.2) + (vn(X / 1.5, Y / 1.5, 2) - 0.5) * 3;
        if (dd < r) g.fillStyle(dd < 2 && t < 160 ? B[4] : B[2]).fillRect(X, Y, 1, 1);
      }
      if (t < 120) dot(g, ix - 1, iy - 1, B[6]).fillRect(ix + 1, iy - 2, 1, 1);
    }
    if (runnels) for (const [dx, l] of [[-1, 6], [3, 4]]) { // it runs down from the wound
      const e = Math.min(1, t / 160) * l;
      seg(g, ix + dx, iy + 1, ix + dx + (2 * e) / l, iy + 1 + e, B[3], B[5]);
    }
    rain(g, null, drops, t);
    if (!pooled && t >= 120) { // the gush, on the floor just past the wound
      pooled = true;
      const floor = stains(scene), px = Math.round(ix + ca * 10), py = Math.round(fy + sa * 4), rx = 5 * k, ryy = rx * 0.55;
      for (let Y = Math.floor(-ryy - 2); Y <= ryy + 2; Y++) for (let X = Math.floor(-rx - 2); X <= rx + 2; X++) {
        const d = Math.hypot(X / rx, Y / ryy) + (vn((px + X) / 2, (py + Y) / 2, 5) - 0.5) * 0.6;
        if (d < 1) floor.fill(B[1 + Math.min(3, Math.floor((1 - d) * 0.9 * 4))], 1, (px + X) / Z, (py + Y) / Z, 1 / Z, 1 / Z);
      }
      floor.fill(B[5], 1, Math.round(px - rx * 0.3) / Z, Math.round(py - ryy * 0.3) / Z, 1 / Z, 1 / Z).render();
    }
  });
}

/** A claw lands on an enemy at (x, y): the wound opens on the side the blow came from. */
export function hit(scene: Phaser.Scene, x: number, y: number, angle: number, heavy: boolean) {
  burst(scene, Math.round((x - Math.cos(angle) * 5) * Z), Math.round((y - Math.sin(angle) * 5) * Z), Math.round((y + 9) * Z), angle, heavy ? 1.4 : 1);
}

/** A body torn open by its death blow at (x, y), thrown along `angle` (`k`: how hard, T.feel): a great burst all
 *  round the wound, running down it, and a jet along the blow. */
export function gore(scene: Phaser.Scene, x: number, y: number, angle: number, k: number) {
  const ix = Math.round((x - Math.cos(angle) * 3) * Z), iy = Math.round((y - 2) * Z), fy = Math.round((y + 9) * Z);
  burst(scene, ix, iy, fy, angle, k, 0.9, true);
  burst(scene, ix, iy - Z, fy, angle, k * 0.6, 0.22);
}

/**
 * The mist dash, clotted: a puff of red-black vapour where he leaves, a plume along his way thick at his heels and
 * breaking up behind, clots dripping from it to the floor, dark afterimages crumbling from the feet, and the vapour
 * drawn back into him where he lands. Drops thrown out round his feet at both ends.
 */
export function dash(scene: Phaser.Scene, from: P, angle: number) {
  const hero = from as Partial<Phaser.GameObjects.Sprite> & P, sprite = hero.frame ? (hero as Phaser.GameObjects.Sprite) : undefined;
  const D = T.dash.durationMs, GHOST_MS = 420, blend = prelit(scene);
  const puffs: { t: number; x: number; y: number; r: number; life: number; s: number; rise: number }[] = [], drops: Drop[] = [];
  const ghosts: { t: number; img: Phaser.GameObjects.Image; y: number; h: number }[] = [];
  const feet = () => Math.round((hero.y + 15) * Z);
  const puff = (t: number, x: number, y: number, r: number, life: number) => {
    puffs.push({ t, x, y, r, life, s: Phaser.Math.Between(0, 999), rise: rnd(4, 12) });
    if (Math.random() < 0.45) drops.push(drop(t + rnd(60, 220), x + rnd(-r, r) * 0.6, feet() + rnd(-2, 2), feet() - y - r * 0.5, rnd(-6, 6), 0, 0, B[3]));
  };
  const thrown = (t: number, m: number) => { // clots thrown round his feet
    for (let i = 0; i < m; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(40, 110);
      drops.push(drop(t, hero.x * Z, feet(), 3, Math.cos(a) * v, Math.sin(a) * v * 0.4, 30, B[4], 2));
    }
  };
  const ghost = (t: number) => {
    if (!sprite) return;
    const f = sprite.frame, name = f.name.replace(/dash\d$/, 'run1'); // the intact run pose, not the vapour
    const img = scene.add.image(sprite.x, sprite.y, sprite.texture, name).setOrigin(sprite.originX, sprite.originY).setScale(sprite.scaleX).setFlipX(sprite.flipX)
      .setTint(B[1]).setTintMode(Phaser.TintModes.FILL).setBlendMode(blend).setAlpha(0.6).setDepth(sprite.depth - 1);
    ghosts.push({ t, img, y: sprite.y, h: f.cutHeight });
  };
  for (let i = 0; i < 5; i++) puff(0, hero.x * Z + rnd(-10, 10), (hero.y - 4) * Z + rnd(-16, 22), rnd(7, 12), rnd(450, 600));
  thrown(0, 14);
  ghost(0);
  let last = { x: hero.x * Z, y: hero.y * Z }, arrived = -1, ghosted = false;
  const wisps = Array.from({ length: 12 }, () => ({ a: angle + Math.PI + rnd(-1.3, 1.3), r: rnd(10, 22) })); // from behind him
  anim(scene, hero.y - 1, D + 700, (g, t) => {
    const hx = hero.x * Z, hy = hero.y * Z;
    if (t <= D) { // the plume: a puff every few px of his way
      for (let d = Math.hypot(hx - last.x, hy - last.y), k = 5; k <= d; k += 5)
        puff(t, last.x + ((hx - last.x) * k) / d + rnd(-3, 3), last.y + ((hy - last.y) * k) / d - 8 + rnd(-10, 14), rnd(5, 9), rnd(300, 460));
      if (Math.hypot(hx - last.x, hy - last.y) >= 5) last = { x: hx, y: hy };
      if (!ghosted && t >= D / 2) (ghosted = true), ghost(t);
    } else if (arrived < 0) {
      arrived = t;
      for (let i = 0; i < 3; i++) puff(t, hx + rnd(-6, 6), hy + rnd(-10, 16), rnd(4, 7), rnd(250, 350));
      thrown(t, 6);
    }
    g.setDepth(hero.y - 1); // just behind him, wherever he went
    for (const p of puffs) {
      const k = (t - p.t) / p.life;
      if (k < 0 || k >= 1) continue;
      // Ragged 2x2 clumps, darker and thinner as it ages; lighter on top.
      const rx = p.r * (0.8 + 0.5 * k), ry = rx * 0.8, cy = p.y - p.rise * k;
      for (let dy = -ry; dy <= ry; dy += 2) for (let dx = -rx; dx <= rx; dx += 2) {
        const e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (e > 1) continue;
        const v = vn((p.x + dx) / 4.5, (cy + dy) / 3.5, p.s) + (1 - Math.sqrt(e)) * 0.6 - k * 0.45;
        if (v < 0.55) continue;
        const tone = (v - 0.55) * 2.2 - dy / (ry * 4) - k * 0.5;
        g.fillStyle(tone > 0.6 ? B[4] : tone > 0.35 ? B[3] : tone > 0.1 ? B[2] : B[1], 0.92).fillRect(Math.round(p.x + dx), Math.round(cy + dy), 2, 2);
      }
    }
    for (const gh of ghosts) { // crumbling from the feet up, rising a little
      const k = (t - gh.t) / GHOST_MS;
      if (k >= 1) { if (gh.img.active) gh.img.destroy(); continue; }
      gh.img.setCrop(0, 0, gh.img.frame.cutWidth, Math.round(gh.h * (1 - k))).setY(gh.y - k * 1.5).setAlpha(0.6 * (1 - k * 0.5));
    }
    rain(g, null, drops, t);
    if (arrived >= 0 && t - arrived < 160) { // the vapour drawn back into him
      const k = (t - arrived) / 160, cx = hx, cy = hy - 6;
      for (const w of wisps) {
        const r = w.r * (1 - k), x = cx + Math.cos(w.a) * r, y = cy + Math.sin(w.a) * r * 0.9;
        seg(g, x, y, x - Math.cos(w.a) * 4, y - Math.sin(w.a) * 4, B[2], B[3]);
      }
    }
  }, blend, () => ghosts.forEach((gh) => gh.img.destroy()));
}

/** Le Tir: a sliver of dark blood flicked from the hand, its top edge wet, a short smear hanging behind it that drips
 *  to the floor, and a few drops off the fingers. Drawn over its floor body `b` while it flies (`ms` at most). */
export function shard(scene: Phaser.Scene, b: P & { active: boolean }, angle: number, ms: number) {
  const c = Math.cos(angle), s = Math.sin(angle), path: (P & { t: number })[] = [], z = SHOT_HEIGHT * Z;
  const drops = Array.from({ length: 3 }, () => { const v = rnd(60, 130); return drop(0, b.x * Z, b.y * Z, z, c * v, s * v * 0.6, rnd(10, 40), B[4]); });
  let drip = 30;
  // Lives past its expected flight: a pause (hit-stop, gift cards) holds the body back.
  anim(scene, b.y, ms + 500, (g, t) => {
    if (b.active) path.push({ t, x: b.x * Z, y: (b.y - SHOT_HEIGHT) * Z });
    while (path.length > 1 && t - path[0].t > 80) path.shift();
    const head = path[path.length - 1];
    g.setDepth(head.y / Z + SHOT_HEIGHT - 8); // sorts like a character standing on its floor point
    if (b.active && t >= drip) (drip = t + 30), drops.push(drop(t, head.x, head.y + z, z, c * 20, s * 12, 0, B[3]));
    if (path.length > 1) {
      const a = path[0], L = Math.ceil(Math.hypot(head.x - a.x, head.y - a.y));
      for (let j = 0; j <= L; j++) {
        const k = j / L, x = a.x + (head.x - a.x) * k, y = a.y + (head.y - a.y) * k;
        if (k < 0.5 && j % 2) continue;
        dot(g, x, y, k < 0.6 ? B[2] : B[3]);
        if (k > 0.55) dot(g, x, y + 1, B[1]);
      }
    }
    if (b.active) { // 16 px long, 4 thick in the middle, pointed at both ends; lit on top, its underside in shadow
      for (let j = 0; j <= 16; j++) {
        const th = Math.max(1, Math.round(4 * Math.sin(Math.PI * Math.min(1, (j / 16) * 1.15)) ** 0.7)), x = head.x - c * (16 - j), y = head.y - s * (16 - j);
        for (let i = 0; i < th; i++) dot(g, x, y - (th >> 1) + i, i === 0 ? B[6] : i === th - 1 && th > 2 ? B[1] : B[4]);
      }
      dot(g, head.x + c, head.y + s, B[6]);
    }
    rain(g, null, drops, t);
  }, prelit(scene));
}

/** A shard bursts where it struck, (x, y) its floor point: through an enemy (`big`), back off a wall or a prop. */
export function splat(scene: Phaser.Scene, x: number, y: number, angle: number, big: boolean) {
  burst(scene, Math.round((x - Math.cos(angle) * 2) * Z), Math.round((y - SHOT_HEIGHT) * Z), Math.round(y * Z), big ? angle : angle + Math.PI, big ? 0.7 : 0.4, big ? 0.6 : 1.2);
}

/** A bite at nothing: two rows of bone fangs clamp shut in front of the face. */
export function snap(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const cx = Math.round((x + Math.cos(angle) * 11) * Z), cy = Math.round((y - 5 + Math.sin(angle) * 7) * Z);
  anim(scene, ABOVE, 150, (g, t) => {
    const gap = Math.max(0, Math.round(7 * (1 - t / 60)));
    if (t < 130) for (const s of [-1, 1]) { // upper jaw comes down, lower jaw comes up
      const fy = cy + s * (gap + 2);
      g.fillStyle(BONE[0]).fillRect(cx - 5, fy + s, 11, 1).fillStyle(BONE[1]);
      for (const fx of s < 0 ? [-4, -1, 2, 4] : [-3, 0, 3]) g.fillRect(cx + fx, s < 0 ? fy : fy - 1, 1, 2);
    }
  });
}

/** The fangs sink in at the throat (x, y): a dark spurt and runnels down the neck (the shake is fx.ts's). */
export function bite(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, Math.round(x * Z), Math.round(y * Z), Math.round((y + 18) * Z), -Math.PI / 2, 0.6, 0.9, true);
}

/** Drinking: threads of blood pulled out of the prey's body (around `from`) into the bite at `mouth`, in three pulls. */
export function drain(scene: Phaser.Scene, from: P, mouth: P, ms: number) {
  const pull = ms / 3, mx = mouth.x * Z, my = mouth.y * Z;
  const motes = Array.from({ length: 27 }, (_, i) => ({ t0: (i % 3) * pull + rnd(0, pull * 0.4), x: (from.x + rnd(-7, 7)) * Z, y: (from.y + rnd(-6, 9)) * Z, life: rnd(130, 190), bend: rnd(-8, 8) }));
  anim(scene, from.y + 1, ms, (g, t) => {
    for (const m of motes) {
      const k = (t - m.t0) / m.life;
      if (k < 0 || k >= 1) continue;
      const at = (k: number) => ({ x: m.x + (mx - m.x) * k * k + Math.sin(k * Math.PI) * m.bend, y: m.y + (my - m.y) * k * k }); // faster and faster
      const p = at(Math.max(0, k - 0.25)), q = at(k);
      seg(g, p.x, p.y, q.x, q.y, k < 0.4 ? B[1] : B[2], k < 0.4 ? B[2] : k < 0.75 ? B[3] : B[5]);
    }
  }, prelit(scene));
}

/** Blood regained: he darkens with it a moment, a ring spreads at his feet and drops rise off him. */
export function heal(scene: Phaser.Scene, hero: Phaser.GameObjects.Sprite) {
  const blend = prelit(scene), flush = scene.add.image(hero.x, hero.y, hero.texture, hero.frame.name).setScale(hero.scaleX).setTint(B[4]).setTintMode(Phaser.TintModes.FILL).setBlendMode(blend);
  const motes = Array.from({ length: 16 }, () => ({ x: rnd(-14, 14), y: rnd(-40, 14), rise: rnd(16, 40), end: rnd(260, 520), c: pick([B[5], B[6]]) }));
  anim(scene, 2, 380, (g, t) => {
    const k = t / 380, r = 10 + 22 * ease(k), x = hero.x * Z, y = (hero.y + 10) * Z;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      if (h2(Math.floor((a + 4) * 3), 7, 1) > 1.4 - k * 1.4) dot(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, k < 0.3 ? B[5] : B[3]);
    }
  }, blend);
  anim(scene, ABOVE, 520, (g, t) => {
    flush.setPosition(hero.x, hero.y).setFrame(hero.frame.name).setFlipX(hero.flipX).setDepth(hero.depth + 0.1).setAlpha(Math.max(0, 0.6 * (1 - t / 320)));
    for (const m of motes) {
      if (t >= m.end) continue;
      const k = Phaser.Math.Easing.Sine.Out(t / m.end);
      g.fillStyle(t / m.end < 0.6 ? m.c : B[3]).fillRect(Math.round(hero.x * Z + m.x), Math.round(hero.y * Z + m.y - m.rise * k), 1, 2);
    }
  }, 0, () => flush.destroy());
}
