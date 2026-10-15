import Phaser from 'phaser';
import * as Hero from './hero.ts';
import { PALETTE, VIEWS, type Frame } from './wanderer.data.ts';

// The new hero, the wanderer with the violet scarf, behind the training room's « Nouveau héros » box until every pose is
// drawn. He is the old hero's sprite (physics body, shadow, Hero.show's animation logic) wearing another sheet; poses
// this sheet doesn't have yet fall back to his idle pose. The scarf's tail is a rope simulated every frame.

const FW = 32, FH = 40;
const ORIGIN_Y = 22 / FH; // soles (row 36) 14 px below the sprite's y, like the old hero's, so body and shadow line up
const neck = new Map<string, [number, number]>(); // frame name -> where the tail hangs from
const TONE = { V: 0, v: 0, u: 0 }; // the scarf's three tones as Phaser colours, set by bake()

function bake(scene: Phaser.Scene) {
  const sheet: [string, Frame][] = [];
  for (const [view, v] of Object.entries(VIEWS)) {
    // Every frame Hero.show may ask for: idle and blink 0-3, the run, dash 0-1, the action poses (idle for now).
    const add = (name: string, f: Frame) => sheet.push([`${view}-${name}`, f]);
    for (let k = 0; k < 4; k++) add(`idle${k}`, v.idle[k % v.idle.length]);
    for (let k = 0; k < 4; k++) add(`blink${k}`, (v.blink ?? v.idle)[k % (v.blink ?? v.idle).length]);
    v.run.forEach((f, k) => add(`run${k}`, f));
    for (let k = 0; k < 2; k++) add(`dash${k}`, v.run[k % v.run.length]);
    for (const n of ['slash0', 'slash1', 'throw0', 'throw1', 'cast', 'bite']) add(n, v.idle[0]);
  }
  const tex = scene.textures.createCanvas('wanderer', FW * sheet.length, FH)!;
  const ctx = tex.context;
  sheet.forEach(([name, f], i) => {
    f.rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      if (!PALETTE[c]) throw new Error(`wanderer ${name}: unknown pixel '${c}'`);
      ctx.fillStyle = PALETTE[c];
      ctx.fillRect(i * FW + x, y, 1, 1);
    }));
    const dash = name.match(/^(\w+)-dash(\d)$/);
    if (dash) Hero.dissolve(ctx, i * FW, Hero.MIST[+dash[2]], dash[1] === 'side' ? -1 : 0, { side: 0, down: -1, up: 1 }[dash[1]]!, FH, 6);
    tex.add(name, 0, i * FW, 0, FW, FH);
    neck.set(name, f.neck);
  });
  tex.refresh();
  for (const k of ['V', 'v', 'u'] as const) TONE[k] = Phaser.Display.Color.HexStringToColor(PALETTE[k]).color;
}

export function create(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Sprite {
  if (!scene.textures.exists('wanderer')) bake(scene);
  const s = Hero.create(scene, x, y).setTexture('wanderer', 'down-idle0').setOrigin(0.5, ORIGIN_Y);
  s.setSize(8, 6).setOffset(12, 27); // the old hero's feet hitbox, at the same place under his soles
  scarf(scene, s);
  return s;
}

// The tail: LINKS links of LINK px, hung from the frame's neck point. Verlet, in native px per 60 Hz frame.
const LINKS = 7, LINK = 2, GRAVITY = 0.18, DAMP = 0.86;
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }; // the light comes from the top left, like on every sprite

function scarf(scene: Phaser.Scene, s: Phaser.Physics.Arcade.Sprite) {
  const g = scene.add.graphics();
  let pts: { x: number; y: number; px: number; py: number }[] | undefined;
  const step = (time: number, delta: number) => {
    const name = s.frame.name, at = neck.get(name);
    g.clear();
    if (!at || !s.visible) return;
    const tl = s.getTopLeft(), ax = Math.round(tl.x!) + (s.flipX ? FW - 1 - at[0] : at[0]), ay = Math.round(tl.y!) + at[1];
    pts ??= Array.from({ length: LINKS + 1 }, (_, i) => ({ x: ax, y: ay + i * LINK, px: ax, py: ay + i * LINK }));
    const dt = Math.min(delta, 50) / (1000 / 60);
    // Moving, it streams out behind him with a flutter; at rest, it hangs.
    const speed = Math.hypot(ax - pts[0].x, ay - pts[0].y) / dt, lift = Math.min(1, speed / 2.5);
    pts[0] = { x: ax, y: ay, px: ax, py: ay };
    for (let i = 1; i <= LINKS; i++) {
      const p = pts[i], vx = (p.x - p.px) * DAMP ** dt, vy = (p.y - p.py) * DAMP ** dt;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + (GRAVITY * (1 - 0.85 * lift) + Math.sin(time / 90 + i) * 0.25 * lift) * dt * dt;
    }
    for (let n = 0; n < 4; n++) for (let i = 1; i <= LINKS; i++) { // each link pulls its child back to length
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
      b.x -= (dx * (d - LINK)) / d;
      b.y -= (dy * (d - LINK)) / d;
      // Up the screen is away into the room: running at the camera, the tail trails behind his back, not over his head.
      b.y = Math.max(b.y, ay - 3);
    }
    // A 3 px ribbon shaded across its width (light, mid, dark as on the sheet), the mid line drawn last so it wins.
    const px = new Map<string, number>();
    const put = (x: number, y: number, c: number, keep = true) => { const k = `${Math.round(x)},${Math.round(y)}`; if (keep || !px.has(k)) px.set(k, c); };
    for (const pass of [0, 1]) for (let i = 1; i <= LINKS; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, lit = nx * LIGHT.x + ny * LIGHT.y > 0 ? 1 : -1;
      for (let t = 0; t <= 1; t += 0.25) {
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        if (pass) put(x, y, TONE.v);
        else {
          put(x + nx * lit, y + ny * lit, TONE.V, false);
          put(x - nx * lit, y - ny * lit, TONE.u, false);
        }
      }
    }
    const tip = pts[LINKS], last = pts[LINKS - 1], tl2 = Math.hypot(tip.x - last.x, tip.y - last.y) || 1e-6;
    const ux = (tip.x - last.x) / tl2, uy = (tip.y - last.y) / tl2; // a fringe of two threads past the end
    put(tip.x + ux * 1.5 - uy, tip.y + uy * 1.5 + ux, TONE.u);
    put(tip.x + ux * 1.5 + uy, tip.y + uy * 1.5 - ux, TONE.u);
    for (const [k, c] of px) {
      const [x, y] = k.split(',').map(Number);
      g.fillStyle(c).fillRect(x, y, 1, 1);
    }
    const view = name.split('-')[0] as keyof typeof VIEWS;
    g.setDepth(s.depth + (VIEWS[view].tailInFront ? 0.2 : -0.2)).setAlpha(s.alpha);
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  s.once(Phaser.GameObjects.Events.DESTROY, () => { scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step); g.destroy(); });
}
