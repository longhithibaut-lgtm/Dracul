import Phaser from 'phaser';
import { T } from './tuning.ts';
import { gesture, type Gesture } from './logic.ts';

// L'ombre, the touch control: the player does not steer the hero but his shadow, and the body follows it. This module
// reads the finger (or the mouse, to test on a PC) and draws the shadow; RoomScene decides what it does.

type Sprite = Phaser.Physics.Arcade.Sprite;
type P = { x: number; y: number };

/** The shadow's state, shared with RoomScene: a floor point, lying under the body (`free` false) or left by the finger. */
export type Shade = {
  x: number; y: number;
  free: boolean;
  target?: Sprite; tx: number; ty: number; // the enemy it lies on, and where that one stood last frame
  mark?: 'claw' | 'bite'; // what the body will do to it
  litMs: number; // time spent in holy light
  stuckMs: number; // time the body has walked into something without getting closer
  charge: number; // the long press filling up, 0-1 (-1: no press)
  glyph: P; glyphReady: boolean; // where a long press would cast the glyph, and whether it can
};

const DEPTH = 1.8; // over holy light (1.5-1.6) and the glyph (1.7), under the floor effects (2) and the characters
const VOID = 0x0b0710, SCARF = 0xa970ff, RED = 0xe0284a, GLOW = 0xff4f8b, HOT = 0xffe4ee, DUSK = 0x5a4468;
// The three looks of the shadow: [fill, its alpha, rim, its alpha]. Dark with the scarf's violet at its edge, so it reads
// on the gold of holy light and on the dark cobalt alike; blood red on an enemy; with a pale rim on a prey.
const LOOKS = { idle: [VOID, 0.68, SCARF, 0.75], claw: [0x5c0a1c, 0.8, RED, 1], bite: [0x5c0a1c, 0.8, HOT, 1] } as const;
const SQUASH = 0.6, SHEAR = 0.4; // the figure laid down: this much of its height, slanting this many px right per row

/**
 * The hero's figure (frame down-idle0 of `src`) laid on the floor as a cast shadow: feet at the anchor, the body
 * stretched away down and to the right (the light comes from the top left), squashed. Baked once per sheet.
 */
function bake(scene: Phaser.Scene, src: string) {
  const key = `shade-${src}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.get(src), f = tex.get('down-idle0'), img = tex.getSourceImage() as HTMLCanvasElement;
  const fw = f.cutWidth, fh = f.cutHeight, px = img.getContext('2d')!.getImageData(f.cutX, f.cutY, fw, fh).data;
  const solid = (x: number, y: number) => y >= 0 && px[(y * fw + x) * 4 + 3] > 0;
  let top = fh, bottom = 0, sum = 0, n = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (solid(x, y)) [top, bottom] = [Math.min(top, y), Math.max(bottom, y)];
  for (let x = 0; x < fw; x++) if (solid(x, bottom)) (sum += x), n++;
  const rows = Math.ceil((bottom - top + 1) * SQUASH), w = fw + Math.ceil(rows * SHEAR) + 2, h = rows + 2, ax = Math.round(sum / n) + 1;
  // Floor pixel of figure pixel (x, y): row j counts from the soles.
  const at = (x: number, y: number) => { const j = Math.floor((bottom - y) * SQUASH); return x + 1 + Math.floor(j * SHEAR) + (j + 1) * w; };
  const on = new Set<number>(), eyes = new Set<number>();
  for (let j = 0; j < rows; j++) for (let x = 0; x < fw; x++) if (solid(x, bottom - Math.floor(j / SQUASH))) on.add(x + 1 + Math.floor(j * SHEAR) + (j + 1) * w);
  // His red eyes open in it, at the far end: the shadow is alive.
  for (let y = top; y < top + 8; y++) for (let x = 0; x < fw; x++) if (px[(y * fw + x) * 4] === 0xe0 && px[(y * fw + x) * 4 + 1] === 0x28) eyes.add(at(x, y));
  const canvas = scene.textures.createCanvas(key, w * 3, h)!, ctx = canvas.context;
  const css = (c: number, a: number) => `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${a})`;
  Object.entries(LOOKS).forEach(([name, [fill, fa, rim, ra]], i) => {
    for (const p of on) {
      const x = p % w, y = Math.floor(p / w), edge = [p - 1, p + 1, p - w, p + w].some((q) => !on.has(q));
      ctx.fillStyle = eyes.has(p) ? css(i ? HOT : RED, 1) : edge ? css(rim, ra) : css(fill, fa);
      ctx.fillRect(i * w + x, y, 1, 1);
    }
    canvas.add(name, 0, i * w, 0, w, h);
  });
  canvas.refresh();
  anchors.set(key, ax);
  return key;
}
const anchors = new Map<string, number>();

/** The shadow of `hero`, under him at first; drawn after physics every frame, from the state RoomScene keeps. */
export function create(scene: Phaser.Scene, hero: Sprite): Shade {
  const key = bake(scene, hero.texture.key), body = hero.body!;
  const s: Shade = { x: body.center.x, y: body.center.y, free: false, tx: 0, ty: 0, litMs: 0, stuckMs: 0, charge: -1, glyph: { x: 0, y: 0 }, glyphReady: true };
  const img = scene.add.image(0, 0, key, 'idle').setDisplayOrigin(anchors.get(key)!, 1).setDepth(DEPTH);
  const g = scene.add.graphics().setDepth(DEPTH + 0.05);
  const draw = () => {
    const now = scene.time.now, feet = body.center;
    if (!s.free) [s.x, s.y] = [feet.x, feet.y];
    const x = Math.round(s.x), y = Math.round(s.y), lit = Math.min(1, s.litMs / T.shadow.lingerMs);
    // Feet line on the body's soles (its bottom edge), so under the hero it is exactly his.
    img.setPosition(x, y + 2).setFrame(s.mark ?? 'idle').setVisible(body.enable)
      .setAlpha(lit && Math.floor(now / 50) % 2 ? 1 - 0.75 * lit : 1); // holy light eats at it: it flickers out
    g.clear();
    if (!body.enable) return;
    // The tether: a dotted line from the feet to the shadow, flowing toward it, once they are apart.
    const dx = x - feet.x, dy = y - feet.y, d = Math.hypot(dx, dy);
    if (s.free && d > 20) for (let k = 8 + ((now / 25) % 5); k < d - 6; k += 5)
      g.fillStyle(SCARF, 0.7).fillRect(Math.round(feet.x + (dx * k) / d), Math.round(feet.y + (dy * k) / d), 1, 1);
    // On an enemy, three claw marks across the shadow, beating; on a prey, a pair of fangs. Below its feet, where the
    // shadow shows past the enemy's sprite.
    const beat = Math.floor(now / 160) % 2 ? GLOW : HOT, my = y + 5;
    if (s.mark === 'claw') for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) g.fillStyle(k === 2 ? beat : RED).fillRect(x + i * 3 + (k >> 1), my + k, 1, 1);
    if (s.mark === 'bite') for (const [fx, fh] of [[0, 4], [1, 3], [5, 4], [4, 3]]) g.fillStyle(beat).fillRect(x + fx, my, 1, fh);
    // The long press: the glyph's ring draws itself round where it will land, grey while the glyph recharges.
    if (s.charge > 0.2) {
      const k = (s.charge - 0.2) / 0.8, rx = T.glyph.radius, ry = rx * T.lantern.squash, steps = Math.round(rx * 5);
      for (let i = 0; i < steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI, on = i / steps <= k;
        g.fillStyle(on ? (s.glyphReady ? RED : DUSK) : VOID, on ? 1 : 0.35).fillRect(Math.round(s.glyph.x + Math.cos(a) * rx), Math.round(s.glyph.y + Math.sin(a) * ry), 1, 1);
      }
    }
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  hero.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw));
  return s;
}

/** The shadow burnt away by holy light at (x, y): its dark and violet bits fly up and fade. */
export function dissolve(scene: Phaser.Scene, x: number, y: number) {
  const bits = Array.from({ length: 18 }, (_, i) => ({ x: x + Phaser.Math.Between(-6, 10), y: y + Phaser.Math.Between(0, 8), c: i % 3 ? VOID : SCARF,
    vx: Phaser.Math.FloatBetween(-12, 12), vy: -Phaser.Math.FloatBetween(10, 34), end: Phaser.Math.Between(250, 450) }));
  const g = scene.add.graphics().setDepth(DEPTH + 0.1);
  scene.tweens.addCounter({ from: 0, to: 450, duration: 450, onComplete: () => g.destroy(), onUpdate: (tw) => {
    const t = tw.getValue() ?? 0;
    g.clear();
    for (const b of bits) if (t < b.end) g.fillStyle(t < 60 ? HOT : b.c, 1 - t / b.end).fillRect(Math.round(b.x + (b.vx * t) / 1000), Math.round(b.y + (b.vy * t) / 1000), 1, 1);
  } });
}

/**
 * One finger on the game (the mouse's left button too): `start` when it lands, `drag` as it moves past the slop (in
 * native px on the screen, before the gain), `end` with what it was once lifted (see gesture()), or 'press' while still
 * held. charge(), polled every frame, says how far a long press has filled (-1: none) and fires it when full.
 */
export function listen(scene: Phaser.Scene, on: { start(): void; drag(dx: number, dy: number): void; end(g: Gesture, angle: number): void }) {
  const canvas = scene.game.canvas, S = T.shadow, now = () => performance.now();
  let id: number | undefined, x0 = 0, y0 = 0, x = 0, y = 0, sx = 0, sy = 0, at = 0, moved = 0, pressed = false, lastTap = -Infinity, sinceTap = Infinity;
  const read = (up: boolean) => gesture({ ms: now() - at, moved, dist: Math.hypot(x - x0, y - y0), up, sinceTap }, S);
  const down = (e: PointerEvent) => {
    if (id !== undefined || e.button !== 0) return;
    id = e.pointerId;
    try { canvas.setPointerCapture(id); } catch { /* a pointer already gone: its release still comes */ }
    x0 = x = sx = e.clientX;
    y0 = y = sy = e.clientY;
    at = now();
    moved = 0;
    pressed = false;
    sinceTap = at - lastTap;
    on.start();
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    [x, y] = [e.clientX, e.clientY];
    moved = Math.max(moved, Math.hypot(x - x0, y - y0));
    if (moved <= S.slopPx) return;
    const k = scene.scale.width / canvas.getBoundingClientRect().width; // native px per CSS px
    on.drag((x - sx) * k, (y - sy) * k);
    [sx, sy] = [x, y];
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    move(e);
    id = undefined;
    if (pressed || e.type === 'pointercancel') return;
    const g = read(true);
    lastTap = g === 'tap' ? now() : -Infinity; // a third tap starts a new pair
    on.end(g, Math.atan2(y - y0, x - x0));
  };
  const menu = (e: Event) => e.preventDefault(); // a long press must not open a menu
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', menu);
  return {
    charge() {
      if (id === undefined || pressed) return -1;
      const g = read(false);
      if (g === 'press') {
        pressed = true;
        on.end('press', 0);
      }
      return g === 'wait' ? (now() - at) / S.pressMs : -1;
    },
    off() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('contextmenu', menu);
    },
  };
}
