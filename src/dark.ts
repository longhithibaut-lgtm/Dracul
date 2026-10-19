import Phaser from 'phaser';
import { T } from './tuning.ts';
import { TORCHES, L } from './torture.ts';
import { viewSize } from './logic.ts';

// The trial room's light (« Crasse et faim », docs/decisions.md), as the mockup's engine lights it. The world camera
// draws what everything reflects (its albedo, in sRGB); one screen shader (FilterDark) lights it: the static lights
// baked by torture.ts with their shadows, haze and rims ('torture-light'), the faint ambient, and the lights that move:
// the hero's lantern (green-yellow, from the glass drawn in his hand, a gentle flicker), his night sight (so shapes
// read in the dark) and the Order's lanterns (small, dirty green). Then the mockup's post: vignette, filmic tone,
// desaturated grade with green-brown shadows, grain, ordered dither snapped onto its palette.
// What glows or warns is drawn unlit over it, by a second camera that sees only what stands at DEPTH and above: the
// eyes, the torch flames, the aim lines, the effects.

/** The trial room is on: the sprite modules bake and pick their dark skins (wanderer.ts, enemy.ts, crossbow.ts).
 *  `zoom`: screen pixels per room pixel; 2 in the trial room, so its hero (wanderer.ts) keeps his full detail at half
 *  scale while the rest shows its 1x pixels doubled. Every other room stays at 1, the game exactly as before. */
export const skin = { dark: false, zoom: 1 };

/** Sizes the game to the view (logic.ts viewSize) times skin.zoom; on a resize (main.ts) and on entering a room. */
export function fit(scale: Phaser.Scale.ScaleManager) {
  const { width, height } = scale.parentSize, v = viewSize(width, height, T.width, T.height), w = v.width * skin.zoom, h = v.height * skin.zoom;
  if (width && height && (w !== scale.width || h !== scale.height)) scale.setGameSize(w, h);
}

/** A blend mode for what is drawn already lit (the trial room's hero): normal colour, but it clears the alpha it
 *  covers, which the light shader reads as "keep this colour" (anything drawn over it later restores the alpha). */
let prelitMode = -1;
export function prelit(scene: Phaser.Scene) {
  const r = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer, gl = r.gl;
  if (prelitMode < 0) {
    r.addBlendMode([gl.ONE, gl.ONE_MINUS_SRC_ALPHA], gl.FUNC_ADD);
    prelitMode = r.blendModes.length - 1; // addBlendMode's own return value is one short
    r.blendModes[prelitMode].func = [gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA];
  }
  return prelitMode;
}

/** The mockup's readability cheat for the characters: what they reflect, `k` times in linear light (`keep`: not those). */
export function boost(pal: Record<string, number>, k = 2.2, keep = '0o') {
  const ch = (v: number) => Math.min(255, Math.round(((v / 255) ** 2.2 * k) ** (1 / 2.2) * 255));
  return Object.fromEntries(Object.entries(pal).map(([c, v]) => [c, keep.includes(c) ? v : (ch(v >> 16) << 16) | (ch((v >> 8) & 255) << 8) | ch(v & 255)]));
}

type Sprite = Phaser.Physics.Arcade.Sprite;
type Spot = { x: number; y: number; lit: boolean };
type V4 = [number, number, number, number];

const DEPTH = 7980; // from here up, drawn unlit over the lit world: aim lines (7990), effects (9000)

const FRAG = `
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uMainSampler;
uniform sampler2D uLight;
uniform sampler2D uLut;
uniform vec4 uView;
uniform vec2 uRoom;
uniform vec4 uLamp;
uniform vec3 uGlass;
uniform vec4 uNight;
uniform vec4 uOrder0;
uniform vec4 uOrder1;
uniform vec4 uOrder2;
uniform vec4 uOrder3;
uniform float uTorch;
uniform float uFrame;
uniform float uZoom;
varying vec2 outTexCoord;
// Textures other than the camera's are bottom-up: v = 1 - row / height.

const vec3 AMB = ${vec(L('#16181a').map((v) => v * 0.9))};
const vec3 LAMP = ${vec(L('#c8c874'))};
const vec3 NIGHT = ${vec(L('#7c8a86'))};
const vec3 ORDER = ${vec(L('#a8ac5c'))};

float fall(float d, float I, float r0, float R) {
  float q = max(0.0, 1.0 - (d / R) * (d / R));
  return I / (1.0 + (d / r0) * (d / r0)) * q * q;
}
vec3 point(vec3 P, vec3 n, vec3 p, float I, float r0, float R, vec3 c) {
  vec3 v = p - P;
  float d = max(length(v), 0.001);
  if (d > R) return vec3(0.0);
  return c * fall(d, I, r0, R) * max(0.0, (dot(n, v / d) + 0.45) / 1.45);
}
vec3 haze(vec2 w, vec2 s, float k, float r0, vec3 c) {
  return c * k * exp(-length(vec2(w.x - s.x, (w.y - s.y) * 1.2)) / (r0 * 1.4));
}
vec3 order(vec3 P, vec3 n, vec2 w, vec4 o) {
  if (o.z <= 0.0) return vec3(0.0);
  return point(P, n, vec3(o.xy, 16.0), o.z, 16.0, 72.0, ORDER);
}
float bayer(vec2 p) {
  vec2 a = mod(p, 2.0), b = mod(floor(p * 0.5), 2.0);
  float m1 = 2.0 * a.x + 3.0 * a.y - 4.0 * a.x * a.y, m2 = 2.0 * b.x + 3.0 * b.y - 4.0 * b.x * b.y;
  return (4.0 * m1 + m2 + 0.5) / 16.0 - 0.5;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 sp = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uView.zw); // screen pixel
  vec2 w = floor(uView.xy + (sp + 0.5) / uZoom); // room pixel: the light works on those, whatever the zoom
  vec4 src = texture2D(uMainSampler, outTexCoord);
  vec3 alb = pow(src.rgb, vec3(2.2));
  vec3 Lt = vec3(0.0), E = vec3(0.0), T = vec3(0.0);
  vec2 uv = (w + 0.5) / uRoom;
  if (uv.x >= 0.0 && uv.x < 1.0 && uv.y >= 0.0 && uv.y < 1.0) {
    vec3 s = texture2D(uLight, vec2(uv.x, 1.0 - uv.y / 3.0)).rgb;
    vec3 e = texture2D(uLight, vec2(uv.x, 1.0 - (uv.y + 1.0) / 3.0)).rgb;
    vec3 g = floor(texture2D(uLight, vec2(uv.x, 1.0 - (uv.y + 2.0) / 3.0)).rgb * 255.0 + 0.5);
    float ny = (g.b - 128.0) / 127.0;
    vec3 P = vec3(w.x, w.y + g.g - 64.0, g.r - 64.0), n = vec3(0.0, ny, sqrt(max(0.0, 1.0 - ny * ny)));
    T = s * s * s * 4.0 * uTorch;
    Lt = T + AMB;
    E = e * e;
    Lt += point(P, n, uNight.xyz, uNight.w, 140.0, 420.0, NIGHT);
    Lt += point(P, n, uLamp.xyz, uLamp.w, 46.0, 200.0, LAMP);
    Lt += order(P, n, w, uOrder0) + order(P, n, w, uOrder1) + order(P, n, w, uOrder2) + order(P, n, w, uOrder3);
  }
  // The lantern's halo round its glass and its haze; the Order's lanterns' haze.
  float dg = length(vec2(w.x - uGlass.x, (w.y - uGlass.y) * 1.1));
  if (dg < 6.5) E += vec3(0.5, 0.55, 0.2) * pow(1.0 - dg / 6.5, 2.0) * 0.35 * uGlass.z;
  E += haze(w, uGlass.xy, uLamp.w * 0.0025, 46.0, LAMP);
  if (uOrder0.z > 0.0) E += haze(w, uOrder0.xy - vec2(0.0, 16.0), uOrder0.z * 0.012, 16.0, ORDER);
  if (uOrder1.z > 0.0) E += haze(w, uOrder1.xy - vec2(0.0, 16.0), uOrder1.z * 0.012, 16.0, ORDER);
  vec3 c = alb * Lt + E;
  // Vignette, filmic shoulder back to sRGB, contrast.
  vec2 v = (sp - uView.zw * vec2(0.5, 0.55)) / (uView.zw * 0.5);
  float vig = clamp(1.15 - 0.55 * dot(v, v), 0.0, 1.0);
  c *= vig;
  c *= 3.2;
  c = pow(c / (1.0 + c), vec3(1.0 / 2.2));
  c += (c * c * (3.0 - 2.0 * c) - c) * 0.45;
  // Grade: desaturated but where something glows, shadows pushed green-brown; grain; ordered dither onto the palette.
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(lum), 0.24 * (1.0 - clamp((E.r + E.g + E.b) * 3.0, 0.0, 1.0)));
  c += vec3(0.012, 0.014, 0.0) * (1.0 - lum) - vec3(0.0, 0.0, 0.004);
  vec2 sq = floor(sp / uZoom);
  c += (hash(sq + uFrame) + hash(sq.yx + uFrame * 1.7) - 1.0) * 0.03 * (0.5 + lum);
  vec3 q = min(floor(clamp(c + bayer(w) * 0.04, 0.0, 1.0) * 255.0 / 4.0), 63.0);
  vec3 lit = texture2D(uLut, vec2((mod(q.b, 8.0) * 64.0 + q.r + 0.5) / 512.0, 1.0 - (floor(q.b / 8.0) * 64.0 + q.g + 0.5) / 512.0)).rgb;
  // Drawn already lit (prelit(): alpha cleared): its own colour, only vignetted, warmed a little by the torches' baked
  // light where he stands (it reads the floor behind him: a hint, not a relight).
  vec3 warm = sqrt(min(T, vec3(1.0)));
  gl_FragColor = vec4(mix(src.rgb * pow(vig, 0.45) * (1.0 + 0.8 * warm) + warm * vec3(0.05, 0.035, 0.02), lit, src.a), 1.0);
}`;
function vec(c: number[]) { return `vec3(${c.map((v) => v.toFixed(5)).join(', ')})`; }

/** The light's inputs, updated every frame (see light()). */
class Dark extends Phaser.Filters.Controller {
  light!: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
  lut!: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
  room: [number, number] = [0, 0];
  lamp: V4 = [0, 0, 0, 0];
  glass: [number, number, number] = [0, 0, 0];
  night: V4 = [0, 0, 0, 0];
  order: V4[] = [];
  torch = 1;
  frame = 0;
  constructor(camera: Phaser.Cameras.Scene2D.Camera) { super(camera, 'FilterDark'); }
}

class DarkNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) { super('FilterDark', manager, undefined, FRAG); }
  setupTextures(c: Dark, textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[]) {
    textures[1] = c.light;
    textures[2] = c.lut;
  }
  setupUniforms(c: Dark) {
    const pm = this.programManager, v = c.camera.worldView;
    pm.setUniform('uLight', 1);
    pm.setUniform('uLut', 2);
    pm.setUniform('uView', [v.x, v.y, c.camera.width, c.camera.height]);
    pm.setUniform('uZoom', c.camera.zoom);
    pm.setUniform('uRoom', c.room);
    pm.setUniform('uLamp', c.lamp);
    pm.setUniform('uGlass', c.glass);
    pm.setUniform('uNight', c.night);
    for (let i = 0; i < 4; i++) pm.setUniform(`uOrder${i}`, c.order[i] ?? [0, 0, 0, 0]);
    pm.setUniform('uTorch', c.torch);
    pm.setUniform('uFrame', c.frame);
  }
}

// The mockup's palette and its colour distance; LUT: the nearest colour of every rgb / 4, 64 blue tiles of 64x64.
const PAL = ['#1c140e', '#281c13', '#362619', '#463220', '#5a4228', '#745632', '#927040', '#000000', '#070605', '#0d0b09', '#13110d', '#1a1712', '#221e18', '#2b261e', '#353026', '#423a2e', '#504637', '#615541', '#76674e', '#8e7d60', '#a99878', '#c8b896', '#e6dab8',
  '#141a10', '#1f2717', '#2d371f', '#3f4a29', '#566236', '#717f44', '#929e58', '#b8c070', '#dfe29a',
  '#2e0d09', '#3a0408', '#5a0a10', '#7e1018', '#43130c', '#5c1a10', '#7a2416', '#a0301c', '#ff3a2a',
  '#5a2a0e', '#8a4516', '#c06a20', '#e8a040', '#ffd890',
  '#1e1222', '#2e1a36', '#46265a', '#643882', '#8a52a8',
  '#1a1e20', '#262c2e', '#384042', '#58605e', '#8a908a', '#c4c8bc', '#f2f4e4'].map((s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)));
export function nearest(r: number, g: number, b: number) {
  let best = PAL[0], bd = Infinity;
  for (const q of PAL) {
    const dr = r - q[0], dg = g - q[1], db = b - q[2], dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2;
    const d = dY * dY * 1.4 + dCo * dCo * 0.6 + dCg * dCg * 0.7;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function lut(scene: Phaser.Scene) {
  const key = 'dark-lut';
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 512, 512)!, img = t.context.createImageData(512, 512);
  for (let b = 0; b < 64; b++) for (let g = 0; g < 64; g++) for (let r = 0; r < 64; r++) // the mockup snaps rgb >> 2: each cell takes its centre's colour
    img.data.set([...nearest(r * 4 + 2, g * 4 + 2, b * 4 + 2), 255], (((b >> 3) * 64 + g) * 512 + (b & 7) * 64 + r) * 4);
  t.putData(img, 0, 0);
  t.refresh();
  return key;
}

/** Pixel grids into one canvas texture, one frame each. */
function grids(scene: Phaser.Scene, key: string, frames: string[][], pal: Record<string, string>) {
  if (scene.textures.exists(key)) return key;
  const w = frames[0][0].length, h = frames[0].length, t = scene.textures.createCanvas(key, w * frames.length, h)!;
  frames.forEach((rows, f) => {
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      t.context.fillStyle = pal[c];
      t.context.fillRect(f * w + x, y, 1, 1);
    }));
    t.add(String(f), 0, f * w, 0, w, h);
  });
  t.refresh();
  return key;
}
const FLAME = ['..W..|.yWy.|.YWY.|yYWYy|.oYo.|..o..', '.....|..y..|.yW..|.YWYy|yYWY.|.oYo.', '.....|..y..|..Wy.|yYWY.|.YWYy|.oYo.'].map((f) => f.split('|'));
const FLAME_PAL = { W: '#ffd890', Y: '#e8a040', y: '#c06a20', o: '#8a4516' };

let registered = false;

/** Lights the room around `hero`; `lanterns()`: the Order's lanterns standing. The world camera's light is its filter
 *  'dark' (set it inactive to see the room unlit: albedo only). */
export function light(scene: Phaser.Scene, hero: Sprite, enemies: Phaser.Physics.Arcade.Group, lanterns: () => Spot[], height: number) {
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!registered) renderer.renderNodes.addNodeConstructor('FilterDark', DarkNode);
  registered = true;
  const main = scene.cameras.main, f = main.filters.internal.add(new Dark(main)) as Dark;
  f.light = scene.textures.get('torture-light').source[0].glTexture!;
  f.lut = scene.textures.get(lut(scene)).source[0].glTexture!;
  f.room = [T.width, height];

  // The unlit layer: its own camera, scrolled with the world's once that one has followed the hero this frame.
  const over = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height).setName('dark-over');
  const pre = over.preRender.bind(over);
  over.preRender = () => {
    // Origin 0: what is pinned to the screen (scroll factor 0: cards, flashes) lands at its place times the zoom.
    over.setOrigin(0).setZoom(main.zoom).setScroll(main.worldView.x, main.worldView.y).setSize(main.width, main.height).setAlpha(1 - (main.fadeEffect as unknown as { alpha: number }).alpha);
    pre();
  };
  const sort = () => { // every object to one of the two (the HUD's own camera keeps its own)
    const hud = scene.cameras.cameras.find((c) => c !== main && c !== over), both = main.id | over.id;
    for (const o of scene.children.list) {
      const m = o as Phaser.GameObjects.GameObject & { depth: number };
      if (hud && !(m.cameraFilter & hud.id)) m.cameraFilter |= both;
      else m.cameraFilter = (m.cameraFilter & ~both) | (m.depth >= DEPTH ? main.id : over.id);
    }
  };

  const flameKey = grids(scene, 'dark-flame', FLAME, FLAME_PAL);
  if (!scene.anims.exists('dark-flame')) scene.anims.create({ key: 'dark-flame', frames: [0, 1, 2].map((n) => ({ key: flameKey, frame: String(n) })), frameRate: 8, repeat: -1 });
  for (const [x, y, k] of TORCHES) scene.add.sprite(x, y, flameKey).setOrigin(0.5, 1).setDepth(DEPTH + 5).setAlpha(0.6 + 0.4 * k).play({ key: 'dark-flame', startFrame: x % 3 });
  const eyes = new Map<Sprite, Phaser.GameObjects.Image>(), shades = new Map<Sprite, Phaser.GameObjects.Image>();
  let tick = 0, lamp0 = 1, torch = 1;

  const step = (time: number) => {
    // The lantern glass in his hand, wherever this frame of his sheet has it (wanderer.ts); the old hero has none.
    const [ax, ay] = (hero.frame.customData as { lamp?: [number, number] }).lamp ?? [hero.frame.width / 2, 29], tl = hero.getTopLeft();
    const lx = Math.round(tl.x! + (hero.flipX ? hero.frame.width - ax : ax) * hero.scaleX), ly = Math.round(tl.y! + ay * hero.scaleY), feet = hero.body!.bottom;
    // Eyes over the dark: each sprite's own eye pixels (its sheet's '*' frames), placed like it.
    for (const s of [hero, ...(enemies.getChildren() as Sprite[])]) {
      const fr = `${s.frame.name.replace('!', '')}*`;
      let e = eyes.get(s);
      if (!e) eyes.set(s, (e = scene.add.image(0, 0, s.texture.key).setDepth(DEPTH + 5)));
      if (!s.texture.has(fr)) { e.setVisible(false); continue; }
      e.setTexture(s.texture.key, fr).setPosition(s.x, s.y).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setVisible(s.visible).setAlpha(s.alpha);
    }
    // Each enemy's shadow from the lantern: its silhouette laid on the floor away from the glass, longer farther off.
    for (const s of enemies.getChildren() as Sprite[]) {
      let sh = shades.get(s);
      if (!sh) shades.set(s, (sh = scene.add.image(0, 0, s.texture.key).setTintMode(Phaser.TintModes.FILL).setTint(0)));
      const dx = s.x - lx, dy = s.body!.bottom - feet, d = Math.hypot(dx, dy);
      sh.setVisible(s.visible && d > 6 && d < 150);
      if (!sh.visible) continue;
      sh.setTexture(s.texture.key, s.frame.name).setPosition(s.x, s.body!.bottom).setOrigin(s.originX, (s.displayOriginY + s.body!.bottom - s.y) / s.frame.height)
        .setFlipX(s.flipX).setRotation(Math.atan2(dy, dx) + Math.PI / 2).setScale(1, Math.min(3.2, Math.max(0.8, d / 22)))
        .setAlpha(0.85 * Math.min(1, 2 - d / 75) * s.alpha).setDepth(s.depth - 0.01);
    }
    for (const [s, e] of eyes) if (!s.active) { e.destroy(); eyes.delete(s); }
    for (const [s, e] of shades) if (!s.active) { e.destroy(); shades.delete(s); }
    if (++tick % 6 === 0) { // ten times a second: the torches gutter, the lamp breathes, the grain moves
      torch = Math.random() < 0.12 ? 0.8 + Math.random() * 0.1 : 0.94 + Math.random() * 0.06;
      lamp0 = 0.9 + 0.08 * Math.sin(time / 400) + Math.random() * 0.04;
      f.frame = (f.frame + 1) % 97;
    }
    f.torch = torch;
    f.lamp = [lx, feet + 1, feet - ly, hero.visible ? 5 * lamp0 : 0];
    f.glass = [lx, ly, hero.visible ? lamp0 : 0];
    f.night = [hero.x, feet, 90, 0.26];
    f.order = lanterns().filter((l) => l.lit).slice(0, 4).map((l): V4 => [l.x, l.y, 1.8, 0]);
    sort();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step));
}
