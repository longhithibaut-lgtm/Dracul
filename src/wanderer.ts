import Phaser from 'phaser';
import * as Hero from './hero.ts';
import { PALETTE, VIEWS, type Frame } from './wanderer.data.ts';
import { skin } from './dark.ts';
import * as Vampire from './vampire.data.ts';

// The hero, the wanderer with the violet scarf (the training room's box brings the old one back to compare). He is the
// old hero's sprite (physics body, shadow, Hero.show's animation logic) wearing another sheet. The scarf's tail is a
// rope simulated every frame.

const FW = 32, FH = 40;
const ORIGIN_Y = 22 / FH; // soles (row 36) 14 px below the sprite's y, like the old hero's, so body and shadow line up
const neck = new Map<string, [number, number]>(); // frame name -> where the tail hangs from
const TONES = new Map<string, { V: number; v: number; u: number }>(); // per sheet: the scarf's three tones, set by bake()
// The torture room's hero (« Crasse et faim », dark.ts) is another sheet on the same frame names: the mockup's vampire
// (vampire.data.ts) with the lantern in his hand; it has no scarf tail, and its sheet also holds the eyes and the
// lantern glass alone ('*' frames) to glow in the dark. Each of its frames carries the glass centre (customData.lamp).

function bake(scene: Phaser.Scene, key: string, pal: Record<string, string>, views: typeof VIEWS) {
  const eyes = pal !== PALETTE;
  const sheet: [string, Frame][] = [];
  for (const [view, v] of Object.entries(views)) {
    // Every frame Hero.show may ask for: idle and blink 0-3, the run, dash 0-1, the action poses (the bite is side-on only).
    const add = (name: string, f: Frame) => sheet.push([`${view}-${name}`, f]);
    for (let k = 0; k < 4; k++) add(`idle${k}`, v.idle[k % v.idle.length]);
    for (let k = 0; k < 4; k++) add(`blink${k}`, (v.blink ?? v.idle)[k % (v.blink ?? v.idle).length]);
    v.run.forEach((f, k) => add(`run${k}`, f));
    for (let k = 0; k < 2; k++) add(`dash${k}`, v.run[k % v.run.length]);
    for (let k = 0; k < 2; k++) { add(`slash${k}`, v.slash[k]); add(`throw${k}`, v.throw[k]); }
    add('cast', v.cast);
    if (v.bite) add('bite', v.bite);
  }
  const tex = scene.textures.createCanvas(key, FW * sheet.length, eyes ? 2 * FH : FH)!;
  const ctx = tex.context;
  sheet.forEach(([name, f], i) => {
    f.rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      if (!pal[c]) throw new Error(`wanderer ${name}: unknown pixel '${c}'`);
      ctx.fillStyle = pal[c];
      ctx.fillRect(i * FW + x, y, 1, 1);
      if (eyes && (c === 'e' || c === 'G')) ctx.fillRect(i * FW + x, FH + y, 1, 1);
    }));
    if (eyes) tex.add(`${name}*`, 0, i * FW, FH, FW, FH);
    const dash = name.match(/^(\w+)-dash(\d)$/);
    if (dash) Hero.dissolve(ctx, i * FW, Hero.MIST[+dash[2]], dash[1] === 'side' ? -1 : 0, { side: 0, down: -1, up: 1 }[dash[1]]!, FH, 6);
    Object.assign(tex.add(name, 0, i * FW, 0, FW, FH)!.customData, { lamp: f.lamp });
    if (f.neck) neck.set(name, f.neck);
  });
  tex.refresh();
  const tone = (c: string) => Phaser.Display.Color.HexStringToColor(pal[c]).color;
  TONES.set(key, { V: tone('V'), v: tone('v'), u: tone('u') });
}

export function create(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Sprite {
  const key = skin.dark ? 'wanderer-dark' : 'wanderer';
  if (!scene.textures.exists(key)) bake(scene, key, skin.dark ? Vampire.PALETTE : PALETTE, skin.dark ? Vampire.VIEWS : VIEWS);
  const s = Hero.create(scene, x, y).setTexture(key, 'down-idle0').setOrigin(0.5, ORIGIN_Y);
  s.setSize(8, 6).setOffset(12, 27); // the old hero's feet hitbox, at the same place under his soles
  if (!skin.dark) scarf(scene, s);
  return s;
}

// The tail: LINKS links of LINK px hung from the frame's neck point, simulated in that point's frame of reference so
// that a new pose or view moves it whole: only the body's own travel drags it (Verlet, native px per 60 Hz frame).
const LINKS = 7, LINK = 2, GRAVITY = 0.18, DAMP = 0.86;
const DEPTH = 0.35; // up and down the screen is mostly into and out of the room: it drags the tail that much less
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }; // the light comes from the top left, like on every sprite

function scarf(scene: Phaser.Scene, s: Phaser.Physics.Arcade.Sprite) {
  const g = scene.add.graphics();
  const hang = () => Array.from({ length: LINKS + 1 }, (_, i) => ({ x: 0, y: i * LINK, px: 0, py: i * LINK }));
  let pts = hang(), last = { x: s.x, y: s.y, flip: s.flipX };
  const TONE = TONES.get(s.texture.key)!;
  const step = (time: number, delta: number) => {
    const name = s.frame.name, at = neck.get(name);
    g.clear();
    if (!at || !s.visible) return;
    const dt = Math.min(delta, 50) / (1000 / 60), mx = s.x - last.x, my = s.y - last.y;
    if (Math.hypot(mx, my) > 40) pts = hang(); // a teleport, not a motion (a dash at 20 fps covers 17 px)
    else if (s.flipX !== last.flip) for (const p of pts) { p.x = -p.x; p.px = -p.px; } // he turned round: mirror it
    last = { x: s.x, y: s.y, flip: s.flipX };
    // Sub-steps of at most one 60 Hz frame, so a slow machine (or a headless capture) gets the same scarf.
    const steps = Math.ceil(dt), sdt = dt / steps, sx = mx / steps, sy = my / steps;
    for (let n = 0; n < steps; n++) {
      // The body moved under the tail: in the neck's frame the tail keeps its place and its speed in the world.
      for (const p of pts.slice(1)) { p.x -= sx; p.px -= sx; p.y -= sy * DEPTH; p.py -= sy * DEPTH; }
      // Running sideways it flies out flat behind him and ripples, a wave running down to the tip; running up or down
      // the screen it only sways; standing, it hangs.
      const run = Math.min(1, Math.abs(sx) / sdt / 1.6), move = Math.min(1, Math.hypot(sx, sy) / sdt / 1.6), t = time - (steps - 1 - n) * sdt * (1000 / 60);
      for (let i = 1; i <= LINKS; i++) {
        const p = pts[i], q = pts[i - 1], k = DAMP ** sdt, vx = (p.x - p.px) * k, vy = (p.y - p.py) * k;
        const len = Math.hypot(p.x - q.x, p.y - q.y) || 1e-6, wave = Math.sin(t / 70 - i * 0.9) * (0.06 * run + 0.03 * move) * (i / LINKS);
        const nx = -(p.y - q.y) / len, ny = (p.x - q.x) / len; // across the link: the ripple pushes that way
        p.px = p.x;
        p.py = p.y;
        p.x += vx + nx * wave * sdt * sdt;
        p.y += vy + ny * wave * sdt * sdt + GRAVITY * (1 - 0.8 * run) * sdt * sdt;
      }
      for (let c = 0; c < 4; c++) for (let i = 1; i <= LINKS; i++) { // each link pulls its child back to length
        const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        b.x -= (dx * (d - LINK)) / d;
        b.y -= (dy * (d - LINK)) / d;
      }
      for (const p of pts) p.y = Math.min(p.y, 36 - at[1]); // a low pose (the cast) lays it on the floor, at his soles' row
    }
    // A ribbon shaded across its width (light, mid, dark as on the sheet), the mid line painted last so it wins; it
    // narrows to 2 px for its last third and ends in a fringe of two threads.
    const tl = s.getTopLeft(), ax = Math.round(tl.x!) + (s.flipX ? FW - 1 - at[0] : at[0]), ay = Math.round(tl.y!) + at[1];
    const px = new Map<string, number>();
    const put = (x: number, y: number, c: number, keep = true) => { const k = `${Math.round(ax + x)},${Math.round(ay + y)}`; if (keep || !px.has(k)) px.set(k, c); };
    for (const pass of [0, 1]) for (let i = 1; i <= LINKS; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, lit = nx * LIGHT.x + ny * LIGHT.y > 0 ? 1 : -1;
      for (let t = 0; t <= 1; t += 0.25) {
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        if (pass) put(x, y, TONE.v);
        else {
          put(x + nx * lit, y + ny * lit, TONE.V, false);
          if (i <= LINKS * 0.66) put(x - nx * lit, y - ny * lit, TONE.u, false);
        }
      }
    }
    const tip = pts[LINKS], prev = pts[LINKS - 1], tlen = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1e-6;
    const ux = (tip.x - prev.x) / tlen, uy = (tip.y - prev.y) / tlen;
    for (const side of [-1, 1]) {
      put(tip.x + ux - uy * side * 0.6, tip.y + uy + ux * side * 0.6, TONE.u);
      put(tip.x + ux * 2 - uy * side, tip.y + uy * 2 + ux * side, TONE.u);
    }
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
