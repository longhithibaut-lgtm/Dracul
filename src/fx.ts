import Phaser from 'phaser';
import { T } from './tuning.ts';

// Combat feedback: slashes, impacts, dash trail, being hurt. Gameplay only says what happened and where.
// Everything is plotted as 1x1 rects on the native pixel grid and redrawn every frame, so shapes stay crisp at x4
// at any angle: no rotated sprites, no smooth lines.

// Palette "Nuit de sang" (docs/art.md), plus HOT: the near-white pink of the brightest pixels of a blow.
const HOT = 0xffe4ee, GLOW = 0xff4f8b, RED = 0xe0284a, BLOOD = 0xa3122f, DRIED = 0x5c0a1c;
const MIST = [0xe8dcc8, 0x8ff0dc, 0x3fa7a3, 0x1f4a5a]; // vampiric mist: pale, then cold moonlight fading out
const ABOVE = 9_000; // over characters, whose depth is their y
const FLOOR = 2; // on the ground, under characters
const GRAVITY = 520; // px/s², blood droplets

type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };
const rnd = Phaser.Math.FloatBetween;
const ease = Phaser.Math.Easing.Cubic.Out;
const px = (g: G, x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(Math.round(x), Math.round(y), 1, 1);
// Stable per-pixel noise in [0, 1), for dissolves that do not flicker.
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1009 / 1009;

// The last swing: impacts land in the same tick as their slash, so they can match its weight and direction.
let swing = { heavy: false, dir: 1 };

/** Clears and redraws a Graphics every frame with the elapsed ms, for `ms`, then destroys it. */
function animate(scene: Phaser.Scene, depth: number, ms: number, draw: (g: G, t: number) => void) {
  const g = scene.add.graphics().setDepth(depth);
  draw(g, 0);
  scene.tweens.addCounter({ from: 0, to: ms, duration: ms, onUpdate: (tw) => draw(g.clear(), tw.getValue() ?? 0), onComplete: () => g.destroy() });
}

/** 1px line from a to b (Bresenham), coloured from a (k=0) to b (k=1). */
function line(g: G, a: P, b: P, color: (k: number) => number) {
  let x = Math.round(a.x), y = Math.round(a.y);
  const x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  const n = Math.max(dx, -dy);
  for (let i = 0, err = dx + dy; ; i++) {
    px(g, x, y, color(n ? i / n : 0));
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

/** Pixels inside an ellipse whose neighbour is outside: a clean 1px outline. */
function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, keep: (x: number, y: number) => boolean, color: number) {
  const inside = (x: number, y: number) => (x / rx) ** 2 + (y / ry) ** 2 <= 1;
  for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -Math.ceil(rx); x <= rx; x++) {
    if (inside(x, y) && !(inside(x + 1, y) && inside(x - 1, y) && inside(x, y + 1) && inside(x, y - 1)) && keep(x, y)) px(g, cx + x, cy + y, color);
  }
}

/**
 * A crescent swept around (ox, oy): `u` runs 0..1 along the swing, the blade is at `head`, everything before `tail`
 * is gone. Thickest mid-swing and right behind the blade, pointed at both ends; brightest at the blade's edge.
 */
function crescent(g: G, ox: number, oy: number, angle: number, dir: number, half: number, R: number, W: number, head: number, tail: number, cool: number) {
  const r = Math.ceil(R) + 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const cx = dx + 0.5, cy = dy + 0.5; // pixel centres, so the shape is symmetric about the swing axis
    const u = (dir * Phaser.Math.Angle.Wrap(Math.atan2(cy, cx) - angle) + half) / (2 * half);
    if (u < tail || u > head) continue;
    const age = head - u + cool; // 0 at the blade, grows along the trail and as the swing cools
    const w = W * Math.sin(Math.PI * u) ** 0.5 * Math.max(0, 1 - 0.45 * age);
    const v = R - Math.hypot(cx, cy); // depth below the outer edge
    if (v < 0 || v > w) continue;
    // Three flat tones: hot edge, pink body, darker inner rim; all cooling toward blood red along the trail.
    const tone = v < 1.2 ? (age < 0.15 ? 0 : age < 0.6 ? 1 : age < 0.95 ? 2 : 3) : v < w - 1.5 ? (age < 0.55 ? 1 : age < 0.9 ? 2 : 3) : age < 0.3 ? 2 : 3;
    px(g, ox + dx, oy + dy, [HOT, GLOW, RED, BLOOD][tone]);
  }
}

export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, combo: number) {
  const heavy = combo === 2;
  const dir = combo === 1 ? -1 : 1; // swipe, back-swipe, then a wider, heavier finisher
  swing = { heavy, dir };
  const R = heavy ? 32 : 27, W = heavy ? 13 : 9, half = Phaser.Math.DegToRad(heavy ? 88 : 68);
  const swingMs = heavy ? 75 : 50, hold = 25, life = heavy ? 240 : 170;
  const ox = Math.round(x), oy = Math.round(y);
  animate(scene, ABOVE, life, (g, t) => {
    const head = Math.min(1, 0.35 + 0.65 * ease(Math.min(1, t / swingMs)));
    const fade = Math.max(0, (t - swingMs - hold) / (life - swingMs - hold)); // 0 during the swing and a short hold, then 0..1
    crescent(g, ox, oy, angle, dir, half, R + 2 * fade, W * (1 - fade * fade), head, fade ** 0.8, fade * 0.7);
    if (heavy) crescent(g, ox, oy, angle, dir, half * 0.85, R - 11, 4 * (1 - fade), head - 0.12, fade, 0.3 + fade);
    if (t < swingMs + 25) {
      // Glint on the blade's tip while it travels.
      const a = angle + dir * (head * 2 - 1) * half, gx = ox + Math.cos(a) * (R - 1), gy = oy + Math.sin(a) * (R - 1);
      const arm = t < swingMs ? 2 : 1;
      needle(g, gx, gy, 0, arm + 0.5, 1, HOT);
      needle(g, gx, gy, Math.PI / 2, arm + 0.5, 1, HOT);
    }
  });
}

export function hit(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const { heavy, dir } = swing;
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
    // Flash: a cut across the blow (a cross for the finisher), white with a pink rim so it reads both over the dark
    // floor and over a body flashing white. Longer than a body is wide, so its tips always show.
    if (t < 110) {
      const k = t / 110, long = (heavy ? 18 : 15) * (1 - k * k), short = 8 * (1 - k), w = heavy ? 4 : 3, cut = angle + dir * 1.2;
      needle(g, ix, iy, cut, long + 1, w + 2, GLOW);
      if (heavy) needle(g, ix, iy, cut + Math.PI / 2, short + 1, w + 2, GLOW);
      if (t < 70) {
        needle(g, ix, iy, cut, long, w, HOT);
        if (heavy) needle(g, ix, iy, cut + Math.PI / 2, short, w, HOT);
      }
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

// Opaque pixels of a texture frame as [x, y, lit] (lit: nothing above it), read once per frame and cached: the
// afterimages are redrawn from them.
type Px = [number, number, boolean];
const shapes = new Map<string, Px[]>();
function silhouette(s: Phaser.GameObjects.Sprite): Px[] {
  const f = s.frame, key = `${s.texture.key}#${f.name}`, w = f.cutWidth, h = f.cutHeight;
  let pts = shapes.get(key);
  if (pts) return pts;
  pts = [];
  const img = f.source.image;
  if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
    const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d')!;
    ctx.drawImage(img, f.cutX, f.cutY, w, h, 0, 0, w, h);
    const a = ctx.getImageData(0, 0, w, h).data, solid = (x: number, y: number) => y >= 0 && a[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) pts.push([x, y, !solid(x, y - 1)]);
  }
  shapes.set(key, pts);
  return pts;
}

export function dash(scene: Phaser.Scene, from: { x: number; y: number }, angle: number) {
  // Gameplay passes the hero itself, so the trail can follow it for the whole dash.
  const hero = from as Partial<Phaser.GameObjects.Sprite> & P;
  const sprite = hero.frame ? (hero as Phaser.GameObjects.Sprite) : undefined;
  const feet = (hero.displayHeight ?? 16) / 2 - 1, back = angle + Math.PI;
  const ghosts: { t: number; x: number; y: number; h: number; pts: Px[] }[] = [];
  const wisps: { t: number; x: number; y: number; vx: number; vy: number; life: number; phase: number }[] = [];
  const rings: { t: number; x: number; y: number; big: boolean }[] = [];
  const GHOST_MS = 260, EVERY = 40, life = T.dash.durationMs + 500;

  const sample = (t: number) => {
    if (sprite) {
      const tl = sprite.getTopLeft(), pts = silhouette(sprite), w = sprite.frame.cutWidth;
      ghosts.push({ t, x: Math.round(tl.x), y: Math.round(tl.y), h: sprite.frame.cutHeight, pts: sprite.flipX ? pts.map(([x, y, l]) => [w - 1 - x, y, l]) : pts });
    }
    for (let i = 0; i < 2; i++) {
      const sp = rnd(8, 22), a = back + rnd(-0.7, 0.7);
      wisps.push({ t, x: hero.x + rnd(-4, 4), y: hero.y + rnd(-7, 5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(14, 28), life: rnd(280, 440), phase: rnd(0, 6) });
    }
  };
  rings.push({ t: 0, x: Math.round(hero.x), y: Math.round(hero.y + feet), big: true });
  sample(0);
  let next = EVERY;

  animate(scene, FLOOR, life, (floor, t) => {
    for (const r of rings) {
      const k = (t - r.t) / 280;
      if (k < 0 || k >= 1) continue;
      const rx = (r.big ? 5 : 3) + (r.big ? 9 : 5) * ease(k);
      // Breaks into arcs as it spreads.
      ellipse(floor, r.x, r.y, rx, rx * 0.4, (x, y) => hash(Math.floor((Math.atan2(y * 2.5, x) + 4) * 2), r.t) > k * 1.1 - 0.1, k < 0.25 ? MIST[0] : k < 0.6 ? MIST[1] : MIST[2]);
    }
  });
  animate(scene, ABOVE, life, (g, t) => {
    if (t >= next && t <= T.dash.durationMs) {
      sample(t);
      next += EVERY;
      if (next > T.dash.durationMs) rings.push({ t, x: Math.round(hero.x), y: Math.round(hero.y + feet), big: false });
    }
    g.setDepth(hero.y - 1); // just behind the hero, wherever it went
    for (const gh of ghosts) {
      const k = (t - gh.t) / GHOST_MS;
      if (k < 0 || k >= 1) continue;
      const tone = k < 0.12 ? 0 : k < 0.4 ? 1 : k < 0.7 ? 2 : 3;
      for (const [x, y, lit] of gh.pts) {
        // Turns to mist from the feet up along a ragged edge, each column drifting up at its own pace.
        const n = hash(x, gh.t + 1);
        if (y / gh.h > 1.15 - 1.4 * k + 0.5 * (n - 0.5) * k) continue;
        px(g, gh.x + x, gh.y + y - Math.floor(k * (2 + 7 * n)), MIST[lit ? Math.max(0, tone - 1) : tone]); // lit from above
      }
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
  });
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
