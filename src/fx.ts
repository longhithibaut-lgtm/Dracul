import Phaser from 'phaser';
import { T } from './tuning.ts';

// Combat feedback: slashes, impacts, dash trail, being hurt. Gameplay only says what happened and where.
// Everything sits on the native pixel grid: 1x1 rects redrawn every frame, or unrotated 1 px crops of the hero's
// frame for the afterimages. Shapes stay crisp at x4 at any angle: no rotated sprites, no smooth lines.

// Palette "Nuit de sang" (docs/art.md), plus DEEP: a deep magenta bridging the pink of a swing to its purple tail.
const HOT = 0xffe4ee, GLOW = 0xff4f8b, DEEP = 0x8f195e, RED = 0xe0284a, BLOOD = 0xa3122f, DRIED = 0x5c0a1c;
const DUSK = [0x5a4468, 0x3b2a4a]; // stone purples, dithered at the end of a swing
const MIST = [0xe8dcc8, 0x8ff0dc, 0x3fa7a3, 0x1f4a5a]; // vampiric mist: pale, then cold moonlight fading out
const ABOVE = 9_000; // over characters, whose depth is their y
const FLOOR = 2; // on the ground, under characters
const GRAVITY = 520; // px/s², blood droplets
const SQUASH = 0.72; // the ground is seen at an angle: a swing around the body is a flattened ellipse on screen

type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };
const rnd = Phaser.Math.FloatBetween;
const ease = Phaser.Math.Easing.Cubic.Out;
const px = (g: G, x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(Math.round(x), Math.round(y), 1, 1);
// Stable per-pixel noise in [0, 1), for dissolves that do not flicker.
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1009 / 1009;

// The last swing: impacts land in the same tick as their slash, so they can match its weight and direction, and
// tell it that it landed.
let swing = { heavy: false, dir: 1, landed: false };

/** Clears and redraws a Graphics every frame with the elapsed ms, for `ms`, then destroys it. */
function animate(scene: Phaser.Scene, depth: number, ms: number, draw: (g: G, t: number) => void): G {
  const g = scene.add.graphics().setDepth(depth);
  draw(g, 0);
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, onUpdate: (tw) => draw(g.clear(), tw.getValue() ?? 0), onComplete: () => g.destroy() });
  return g;
}

/** 1px line from a to b (Bresenham), coloured from a (k=0) to b (k=1); a negative colour leaves a gap. */
function line(g: G, a: P, b: P, color: (k: number) => number) {
  let x = Math.round(a.x), y = Math.round(a.y);
  const x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  const n = Math.max(dx, -dy);
  for (let i = 0, err = dx + dy; ; i++) {
    const c = color(n ? i / n : 0);
    if (c >= 0) px(g, x, y, c);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Needle: a segment of half-length `len` through (cx, cy) along `a`, `w` thick in the middle and pointed at both ends. */
function needle(g: G, cx: number, cy: number, a: number, len: number, w: number, color: number) {
  const c = Math.cos(a), s = Math.sin(a), r = Math.ceil(len) + 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const along = (dx * c + dy * s) / len, across = Math.abs(-dx * s + dy * c);
    if (Math.abs(along) <= 1 && across <= Math.max(0.5, (w / 2) * (1 - along * along))) px(g, cx + dx, cy + dy, color);
  }
}

/** Four-point star: a long arm along `a`, a short one across, white with a pink rim so it reads on dark and on white. */
function star(g: G, x: number, y: number, a: number, long: number, short: number, w: number) {
  needle(g, x, y, a, long + 1, w + 2, GLOW);
  needle(g, x, y, a + Math.PI / 2, short + 1, w + 2, GLOW);
  needle(g, x, y, a, long, w, HOT);
  needle(g, x, y, a + Math.PI / 2, short, w, HOT);
}

/** Pixels inside an ellipse whose neighbour is outside: a clean 1px outline. */
function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, keep: (x: number, y: number) => boolean, color: number) {
  const inside = (x: number, y: number) => (x / rx) ** 2 + (y / ry) ** 2 <= 1;
  for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -Math.ceil(rx); x <= rx; x++) {
    if (inside(x, y) && !(inside(x + 1, y) && inside(x - 1, y) && inside(x, y + 1) && inside(x, y - 1)) && keep(x, y)) px(g, cx + x, cy + y, color);
  }
}

/**
 * A swing smear around (ox, oy), on the ground plane seen squashed. `u` runs 0..1 along the swing, from `a0` to `a1`
 * radians past the aim (in the swing's direction); the blade is at `head`, nothing is left before `tail`. Thick and
 * white at the blade, it tapers through pink and deep magenta to a 1 px dithered purple tail, so the direction of
 * travel reads in a single frame. Pixels on the far side of the body go to `back`, drawn behind the hero.
 */
function crescent(front: G, back: G, ox: number, oy: number, aim: number, dir: number, a0: number, a1: number, R: number, W: number, head: number, tail: number) {
  if (head <= tail) return;
  const r = Math.ceil(R) + 1, len = (a1 - a0) * R; // arc length in px
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const gx = dx + 0.5, gy = (dy + 0.5) / SQUASH; // pixel centre, back on the ground plane
    const u = (dir * Phaser.Math.Angle.Wrap(Math.atan2(gy, gx) - aim) - a0) / (a1 - a0);
    if (u < tail || u > head) continue;
    const q = (head - u) / (head - tail); // 0 at the blade, 1 at the end of the tail
    const w = (1 + (W - 1) * (1 - q) ** 0.8) * Math.min(1, ((head - u) * len) / 3) ** 0.5; // pointed front, 1 px tail
    const v = R - Math.hypot(gx, gy); // depth below the outer edge
    if (v < 0 || v > w) continue;
    const odd = (ox + dx + oy + dy) & 1;
    const c = (v < 1.3 && q < 0.5) || q < 0.14 ? HOT : q < 0.46 ? GLOW : q < 0.7 ? DEEP : q < 0.85 ? DUSK[odd] : odd ? -1 : DUSK[1];
    if (c >= 0) px(gy < 0 ? back : front, ox + dx, oy + dy, c);
  }
}

export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, combo: number) {
  const heavy = combo === 2;
  const dir = combo === 1 ? -1 : 1; // swipe, back-swipe, then a wider, heavier finisher
  swing = { heavy, dir, landed: false };
  const sw = swing;
  // The swing starts behind the body and follows through a little past the aim, so it wraps around the hero.
  const R = heavy ? 31 : 27, W = heavy ? 13 : 10, a0 = Phaser.Math.DegToRad(heavy ? -165 : -125), a1 = Phaser.Math.DegToRad(heavy ? 45 : 30);
  const swingMs = heavy ? 80 : 60, hold = 20, life = heavy ? 250 : 190;
  const ox = Math.round(x), oy = Math.round(y) + 1;
  const aim = Math.atan2(Math.sin(angle) / SQUASH, Math.cos(angle)); // the aim, on the ground plane
  const back = scene.add.graphics().setDepth(y - 0.5);
  animate(scene, ABOVE, life, (g, t) => {
    back.clear();
    const head = Math.min(1, 0.55 + 0.45 * ease(Math.min(1, t / swingMs))); // already a wide smear on its first frame
    const fade = Math.max(0, (t - swingMs - hold) / (life - swingMs - hold)); // 0 during the swing and a short hold, then 0..1
    // Follow-through: once the blade stops, the tail catches up with it while the smear thins.
    crescent(g, back, ox, oy, aim, dir, a0, a1, R + 2 * fade, W * (1 - fade * fade), head, Math.min(head - 0.02, fade ** 0.7));
    if (heavy) crescent(g, back, ox, oy, aim, dir, a0 + 0.5, a1, R - 10, 4 * (1 - fade), head - 0.1, fade);
    // The blade's tip glints while it travels, and flashes where the swing ends unless an impact already does.
    const a = aim + dir * (a0 + head * (a1 - a0)), tx = ox + Math.cos(a) * (R - 1), ty = oy + Math.sin(a) * (R - 1) * SQUASH;
    if (t < swingMs) star(g, tx, ty, 0, 2, 2, 1);
    else if (t < swingMs + 50 && !sw.landed) star(g, tx, ty, 0, 5 - (t - swingMs) / 15, 4 - (t - swingMs) / 15, 2);
  }).once('destroy', () => back.destroy());
}

export function hit(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const { heavy, dir } = swing;
  swing.landed = true;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Small, sharp shake, mostly along the blow.
  const cam = scene.cameras.main, kick = heavy ? 3 : 2;
  cam.shake(heavy ? 110 : 70, new Phaser.Math.Vector2((0.6 + kick * Math.abs(cos)) / cam.width, (0.6 + kick * Math.abs(sin)) / cam.height));

  const ix = Math.round(x - cos * 5), iy = Math.round(y - sin * 5); // the blade meets the near side of the body
  const floorY = Math.round(y) + 9, z0 = Math.max(3, floorY - iy); // droplets start at the wound, above the feet
  const sparks = Array.from({ length: heavy ? 10 : 7 }, () => ({ a: angle + rnd(-1.5, 1.5), s: rnd(280, 480), life: rnd(70, 140) }));
  const stains: { x: number; y: number; c: number; wet: number; dry: number }[] = [];
  const drops = Array.from({ length: heavy ? 22 : 14 }, () => {
    // The blade drags most droplets along the swing in slow arcs; a few jets shoot low and fast with the blow and
    // streak the floor further away.
    const jet = Math.random() < 0.3, a = jet ? angle + rnd(-0.4, 0.4) : angle + dir * 0.8 + rnd(-0.7, 0.7), s = jet ? rnd(140, 230) : rnd(20, 100);
    const vz = jet ? rnd(5, 30) : rnd(10, 90), big = jet || Math.random() < 0.4;
    const land = ((vz + Math.sqrt(vz * vz + 2 * GRAVITY * z0)) / GRAVITY) * 1000;
    const lx = ix + (Math.cos(a) * s * land) / 1000, ly = floorY + (Math.sin(a) * s * land) / 1000;
    // Its stain: a few pixels smeared along the droplet's travel.
    for (let i = 0, n = jet ? Phaser.Math.Between(4, 7) : big ? Phaser.Math.Between(3, 5) : Phaser.Math.Between(1, 2); i < n; i++) {
      stains.push({ x: lx + Math.cos(a) * i * 0.8 + (i ? rnd(-0.7, 0.7) : 0), y: ly + Math.sin(a) * i * 0.5 + (i ? rnd(-0.6, 0.6) : 0),
        c: Math.random() < 0.35 ? BLOOD : DRIED, wet: land, dry: land + rnd(600, 1400) });
    }
    return { a, s, vz, big, land, glow: Math.random() < 0.2 };
  });
  // The gush: a puddle on the ground just past the feet, stretched along the blow (ground y is seen squashed by half).
  const sx = Math.round(x + cos * 9), sy = Math.round(floorY + sin * 5), rx = heavy ? 7 : 5, ry = heavy ? 4 : 3;
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const along = dx * cos + 2 * dy * sin, across = -dx * sin + 2 * dy * cos, d = Math.hypot(along / rx, across / ry);
    if (d > 1 + 0.5 * (hash(dx + 20, dy + 20) - 0.5)) continue;
    stains.push({ x: sx + dx, y: sy + dy, c: d < 0.55 ? BLOOD : DRIED, wet: 120 + d * 60, dry: 900 + (1 - d) * 1000 + hash(dx, dy) * 200 });
  }

  animate(scene, ABOVE, 420, (g, t) => {
    // Impact star: three frames at full size, then it shrinks away.
    if (t < 110) {
      const k = Math.max(0, (t - 50) / 60);
      star(g, ix, iy, angle + Math.PI / 2, (heavy ? 9 : 7) * (1 - k), (heavy ? 7 : 5) * (1 - k), heavy ? 3 : 2);
    }
    // The finisher also sends a ring out, breaking up as it widens.
    if (heavy && t < 160) {
      const k = t / 160, r = 4 + 12 * ease(k);
      ellipse(g, ix, iy, r, r, (ex, ey) => Math.floor((Math.atan2(ey, ex) + 4) * 3) % 4 > k * 4 - 1, k < 0.4 ? HOT : GLOW);
    }
    for (const p of sparks) {
      if (t >= p.life) continue;
      const k = t / p.life, d = ((p.s * t) / 1000) * (1 - 0.5 * k), len = 1 + 5 * (1 - k);
      const c = Math.cos(p.a), s = Math.sin(p.a);
      line(g, { x: ix + c * d, y: iy + s * d }, { x: ix + c * (d - len), y: iy + s * (d - len) }, (j) => (k < 0.5 && j < 0.5 ? HOT : k < 0.75 ? GLOW : RED));
    }
    for (const d of drops) {
      if (t >= d.land) continue;
      const at = (ms: number) => {
        const s = ms / 1000;
        return { x: ix + Math.cos(d.a) * d.s * s, y: floorY + Math.sin(d.a) * d.s * s - (z0 + d.vz * s - (GRAVITY / 2) * s * s) };
      };
      const p = at(t), q = at(Math.max(0, t - 18));
      if (Math.hypot(p.x - q.x, p.y - q.y) > 1.5) line(g, q, p, () => BLOOD);
      const c = d.glow ? GLOW : RED;
      if (d.big) g.fillStyle(c).fillRect(Math.round(p.x), Math.round(p.y), 2, 1).fillStyle(BLOOD).fillRect(Math.round(p.x), Math.round(p.y) + 1, 2, 1);
      else px(g, p.x, p.y, c);
    }
  });
  animate(scene, FLOOR, Math.max(...stains.map((p) => p.dry)), (g, t) => {
    for (const p of stains) if (t >= p.wet && t < p.dry) px(g, p.x, p.y, t - p.wet < 120 ? RED : p.c);
  });
}

export function dash(scene: Phaser.Scene, from: { x: number; y: number }, angle: number) {
  // Gameplay passes the hero itself, so the trail can follow it for the whole dash.
  const hero = from as Partial<Phaser.GameObjects.Sprite> & P;
  const sprite = hero.frame ? (hero as Phaser.GameObjects.Sprite) : undefined;
  const feet = 15, back = angle + Math.PI, D = T.dash.durationMs; // feet: just under the soles, 14 px below y on both hero sheets
  const GHOST_MS = 420, STREAK_MS = 340, RING_MS = 460, EVERY = 60, life = D + 520;
  type Strip = Phaser.GameObjects.Image;
  const ghosts: { t: number; y: number; h: number; strips: Strip[] }[] = [];
  const wisps: { t: number; x: number; y: number; vx: number; vy: number; life: number; phase: number }[] = [];
  const rings: { t: number; x: number; y: number; big: boolean }[] = [];
  const path: { t: number; x: number; y: number }[] = [];
  const ringAt = [0, D / 2, D];

  const sample = (t: number) => {
    if (sprite) {
      // An afterimage: the hero's current frame cut into 1 px columns, so each column can fray and drift on its own
      // (cropped copies of the texture: no pixel read-back from the GPU). Mid-dash the hero is a mist frame whose
      // streaks would fill into a solid block, so the ghost takes the intact run pose, translucent, behind the action.
      const f = sprite.frame, name = f.name.replace(/dash\d$/, 'run1'), tl = sprite.getTopLeft(), w = f.cutWidth, x0 = Math.round(tl.x), y0 = Math.round(tl.y);
      const strips = Array.from({ length: w }, (_, x) => scene.add.image(x0 + (sprite.flipX ? w - 1 - 2 * x : 0), y0, sprite.texture, name)
        .setOrigin(0).setCrop(x, 0, 1, f.cutHeight).setTint(MIST[0]).setTintMode(Phaser.TintModes.FILL).setAlpha(0.55));
      ghosts.push({ t, y: y0, h: f.cutHeight, strips });
    }
    for (let i = 0; i < 2; i++) {
      const sp = rnd(8, 22), a = back + rnd(-0.7, 0.7);
      wisps.push({ t, x: hero.x + rnd(-4, 4), y: hero.y + rnd(-7, 5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(14, 28), life: rnd(280, 440), phase: rnd(0, 6) });
    }
  };
  sample(0);
  let next = EVERY;

  animate(scene, FLOOR, life, (floor, t) => {
    // Mist rings on the ground where the dash leaves, crosses and lands; whole at first, breaking into arcs later.
    while (ringAt.length && t >= ringAt[0]) rings.push({ t: ringAt.shift()!, x: Math.round(hero.x), y: Math.round(hero.y + feet), big: !rings.length });
    for (const r of rings) {
      const k = (t - r.t) / RING_MS;
      if (k < 0 || k >= 1) continue;
      const rx = (r.big ? 6 : 4) + (r.big ? 8 : 5) * ease(k);
      ellipse(floor, r.x, r.y, rx, rx * 0.4, (x, y) => hash(Math.floor((Math.atan2(y * 2.5, x) + 4) * 2), r.t) > (k - 0.45) * 2, k < 0.2 ? MIST[0] : k < 0.6 ? MIST[1] : MIST[2]);
    }
  });
  animate(scene, ABOVE, life, (g, t) => {
    if (t <= D + 20) path.push({ t, x: hero.x, y: hero.y });
    if (t >= next && t <= D) {
      sample(t);
      next += EVERY;
    }
    g.setDepth(hero.y - 1); // just behind the hero, wherever it went
    // A speed streak along the path at chest height: pale near the hero, broken up toward the tail, which retracts.
    const live = path.filter((p) => t - p.t < STREAK_MS);
    if (live.length > 1) {
      const a = live[0], b = live[live.length - 1];
      line(g, { x: a.x, y: a.y - 2 }, { x: b.x, y: b.y - 2 }, (j) => (j < 0.35 && Math.floor(j * 40) % 2 ? -1 : MIST[j > 0.8 ? 0 : j > 0.45 ? 1 : 2]));
    }
    for (const gh of ghosts) {
      const k = (t - gh.t) / GHOST_MS;
      if (k >= 1) gh.strips.forEach((s) => s.destroy());
      if (k >= 1 || !gh.strips[0]?.active) continue;
      const tone = MIST[k < 0.1 ? 0 : k < 0.35 ? 1 : k < 0.65 ? 2 : 3];
      gh.strips.forEach((s, x) => {
        // Turns to mist from the feet up along a ragged edge, each column drifting up at its own pace.
        const n = hash(x, gh.t + 1), keep = Math.round(gh.h * Phaser.Math.Clamp(1.15 - 1.4 * k + 0.5 * (n - 0.5) * k, 0, 1));
        s.setCrop(x, 0, 1, keep).setVisible(keep > 0).setY(gh.y - Math.floor(k * (2 + 7 * n))).setTint(tone).setDepth(hero.y - 1);
      });
    }
    for (const w of wisps) {
      const k = (t - w.t) / w.life;
      if (k < 0 || k >= 1) continue;
      // A curl of smoke: the swaying path of the last 60 ms, shortening as it fades.
      const at = (ms: number) => {
        const s = Math.max(0, ms) / 1000;
        return { x: w.x + w.vx * s + Math.sin(w.phase + s * 16) * 2, y: w.y + w.vy * s };
      };
      const age = t - w.t;
      line(g, at(age - 60 * (1 - k)), at(age), (j) => MIST[j > 0.6 ? (k < 0.5 ? 1 : 2) : k < 0.5 ? 2 : 3]);
    }
  }).once('destroy', () => ghosts.forEach((gh) => gh.strips.forEach((s) => s.destroy())));
}

// Le Tir flies at chest height, this far above the floor point that collides (like the crossbow's bolts).
const SHOT_HEIGHT = 11;

/**
 * Le Tir: a thin shard of blood flicked from the hand, drawn over its floor body `b` while it flies (`ms` at most): a
 * crimson splinter with a white-hot point, and a short dark trail that catches up with it once it is gone. A few drops
 * fly off the fingers with it.
 */
export function shard(scene: Phaser.Scene, b: P & { active: boolean }, angle: number, ms: number) {
  const c = Math.cos(angle), s = Math.sin(angle), x0 = b.x, y0 = b.y - SHOT_HEIGHT;
  const path: (P & { t: number })[] = [];
  const flung = Array.from({ length: 3 }, () => ({ a: angle + rnd(-0.4, 0.4), v: rnd(60, 130) }));
  // Lives past its expected flight: a pause (hit-stop, gift cards) holds the body back.
  animate(scene, b.y, ms + 400, (g, t) => {
    if (b.active) path.push({ t, x: b.x, y: b.y - SHOT_HEIGHT });
    while (path.length > 1 && t - path[0].t > 45) path.shift();
    g.setDepth(path[path.length - 1].y + SHOT_HEIGHT - 8); // sorts like a character standing on its floor point
    for (const f of flung) {
      const k = t / 160, d = f.v * (t / 1000);
      if (k < 1) px(g, x0 + Math.cos(f.a) * d, y0 + Math.sin(f.a) * d + 8 * k * k, k < 0.5 ? RED : BLOOD);
    }
    const head = path[path.length - 1], trail = (k: number) => (k < 0.4 && (k * 16) & 1 ? -1 : k < 0.4 ? DRIED : BLOOD);
    if (!b.active) {
      if (path.length > 1) line(g, path[0], head, trail);
      return;
    }
    const tail = { x: head.x - c * 4, y: head.y - s * 4 }, sh = -s + c < 0 ? { x: s, y: -c } : { x: -s, y: c };
    line(g, path[0], tail, trail);
    // A sliver: its underside in shadow (light from the top left), the crimson core whitening to the point.
    line(g, { x: tail.x + sh.x, y: tail.y + sh.y }, { x: head.x + sh.x, y: head.y + sh.y }, () => BLOOD);
    line(g, tail, { x: head.x + c * 2, y: head.y + s * 2 }, (k) => (k < 0.6 ? RED : k < 0.85 ? GLOW : HOT));
  });
}

/** A shard bursts where it struck: a small star and drops spattering back that dot the floor a moment; `big` off an
 *  enemy, smaller on a wall or a prop. (x, y) is its floor point. */
export function splat(scene: Phaser.Scene, x: number, y: number, angle: number, big: boolean) {
  const cx = Math.round(x - Math.cos(angle) * 2), cy = Math.round(y - Math.sin(angle) * 2), z0 = SHOT_HEIGHT;
  const drops = Array.from({ length: big ? 7 : 4 }, () => {
    const a = angle + Math.PI + rnd(-1.4, 1.4), v = rnd(20, big ? 75 : 50), vz = rnd(10, 60);
    const land = ((vz + Math.sqrt(vz * vz + 2 * GRAVITY * z0)) / GRAVITY) * 1000;
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz, land, c: Math.random() < 0.3 ? GLOW : RED };
  });
  // Where drop d is at t ms: its floor point and its height.
  const at = (d: (typeof drops)[number], t: number) => {
    const u = Math.min(t, d.land) / 1000;
    return { x: cx + d.vx * u, y: cy + d.vy * u, z: Math.max(0, z0 + d.vz * u - (GRAVITY / 2) * u * u) };
  };
  animate(scene, ABOVE, 300, (g, t) => {
    if (t < 80) {
      const k = Math.max(0, (t - 30) / 50);
      star(g, cx, cy - z0, 0, (big ? 4 : 3) * (1 - k), (big ? 3 : 2) * (1 - k), 1); // square to the grid: crisp at 1 px
    }
    for (const d of drops) if (t < d.land) {
      const p = at(d, t);
      px(g, p.x, p.y - p.z, t < 120 ? d.c : BLOOD);
    }
  });
  animate(scene, FLOOR, 700, (g, t) => {
    for (const d of drops) if (t >= d.land && t < d.land + 400) px(g, at(d, t).x, at(d, t).y, t - d.land < 120 ? BLOOD : DRIED);
  });
}

/** A bite at nothing: two rows of bone-white fangs clamp shut in front of the face, a small glint where they meet. */
export function snap(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const cx = Math.round(x + Math.cos(angle) * 11), cy = Math.round(y - 5 + Math.sin(angle) * 7);
  animate(scene, ABOVE, 170, (g, t) => {
    const gap = Math.max(0, Math.round(4 * (1 - t / 60))), c = t < 60 ? HOT : MIST[0];
    if (t < 130) for (const s of [-1, 1]) { // upper jaw comes down, lower jaw comes up
      const fy = cy + s * (gap + 1);
      g.fillStyle(c).fillRect(cx - 3, fy + s, 7, 1);
      for (const fx of s < 0 ? [-2, 2] : [-1, 1]) px(g, cx + fx, fy, c);
    }
    if (t >= 55 && t < 110) star(g, cx, cy, 0, 3 - (t - 55) / 25, 2 - (t - 55) / 30, 1);
  });
}

/** The fangs sink in at the throat (x, y): a short shake, a white-hot star and a few drops of blood spurting free. */
export function bite(scene: Phaser.Scene, x: number, y: number) {
  const cam = scene.cameras.main;
  cam.shake(90, new Phaser.Math.Vector2(2 / cam.width, 1.5 / cam.height));
  const drops = Array.from({ length: 8 }, () => ({ vx: rnd(-40, 40), vy: rnd(-90, -30), c: Math.random() < 0.3 ? GLOW : RED }));
  animate(scene, ABOVE, 300, (g, t) => {
    if (t < 100) {
      const k = Math.max(0, (t - 40) / 60);
      star(g, x, y, Math.PI / 4, 5 * (1 - k), 4 * (1 - k), 2);
    }
    const s = t / 1000;
    for (const d of drops) px(g, x + d.vx * s, y + d.vy * s + (GRAVITY / 2) * s * s, t < 200 ? d.c : BLOOD);
  });
}

/**
 * Drinking: blood is pulled out of the prey's whole body (around `from`) into the bite at `mouth`, in three pulls over
 * `ms`: motes dark as they leave the body, glowing as they reach the mouth. Drawn just over the prey, under the hero
 * bent on it, so they vanish into him.
 */
export function drain(scene: Phaser.Scene, from: P, mouth: P, ms: number) {
  const pull = ms / 3;
  const motes = Array.from({ length: 27 }, (_, i) => ({ t0: (i % 3) * pull + rnd(0, pull * 0.4), x: from.x + rnd(-7, 7), y: from.y + rnd(-6, 9), life: rnd(130, 190) }));
  animate(scene, from.y + 1, ms, (g, t) => {
    for (const m of motes) {
      const k = (t - m.t0) / m.life;
      if (k < 0 || k >= 1) continue;
      const at = (k: number) => ({ x: m.x + (mouth.x - m.x) * k * k, y: m.y + (mouth.y - m.y) * k * k }); // sucked in, faster and faster
      line(g, at(Math.max(0, k - 0.2)), at(k), (j) => (k < 0.35 ? (j < 0.5 ? DRIED : BLOOD) : k < 0.7 ? (j < 0.5 ? BLOOD : RED) : j < 0.5 ? RED : GLOW));
    }
  });
}

/** Blood regained: the hero flushes rose (never white then red, which is being hurt), a ring spreads at his feet and
 *  warm motes rise off him. */
export function heal(scene: Phaser.Scene, hero: Phaser.GameObjects.Sprite) {
  const flush = scene.add.image(hero.x, hero.y, hero.texture, hero.frame.name).setTint(GLOW).setTintMode(Phaser.TintModes.FILL);
  const motes = Array.from({ length: 14 }, () => ({ x: rnd(-7, 7), y: rnd(-9, 7), rise: rnd(10, 24), end: rnd(260, 520), c: Math.random() < 0.4 ? HOT : GLOW }));
  animate(scene, FLOOR, 360, (g, t) => {
    const k = t / 360, r = 5 + 11 * ease(k);
    ellipse(g, hero.x, hero.y + 10, r, r * 0.4, (x, y) => hash(Math.floor((Math.atan2(y * 2.5, x) + 4) * 3), 7) > k * 1.4 - 0.4, k < 0.3 ? HOT : GLOW);
  });
  animate(scene, ABOVE, 520, (g, t) => {
    // The flush follows the hero and his pose, fading out.
    flush.setPosition(hero.x, hero.y).setFrame(hero.frame.name).setFlipX(hero.flipX).setDepth(hero.depth + 0.1)
      .setAlpha(Math.max(0, 0.8 * (1 - t / 320)));
    for (const m of motes) {
      if (t >= m.end) continue;
      const k = Phaser.Math.Easing.Sine.Out(t / m.end);
      g.fillStyle(t / m.end < 0.6 ? m.c : DEEP).fillRect(Math.round(hero.x + m.x), Math.round(hero.y + m.y - m.rise * k), 1, 2);
    }
  }).once('destroy', () => flush.destroy());
}

export function hurt(scene: Phaser.Scene) {
  const cam = scene.cameras.main, w = cam.width, h = cam.height;
  cam.shake(130, new Phaser.Math.Vector2(3 / w, 3 / h));
  // One soft blood-red pulse and a dark frame closing in: short and translucent, never a full-screen white-out.
  animate(scene, 19_000, 260, (g, t) => {
    const k = t / 260, b = Math.round(14 * (1 - k) ** 2);
    g.setScrollFactor(0);
    g.fillStyle(BLOOD, 0.28 * (1 - k) ** 2).fillRect(-8, -8, w + 16, h + 16);
    g.fillStyle(DRIED, 0.75 * (1 - k)).fillRect(-8, -8, w + 16, b + 8).fillRect(-8, h - b, w + 16, b + 8)
      .fillRect(-8, b, b + 8, h - 2 * b).fillRect(w - b, b, b + 8, h - 2 * b);
  });
}
