import Phaser from 'phaser';
import { T } from './tuning.ts';
import { viewSize } from './logic.ts';

// The rooms' light, as the mockup's engine lights it. The world camera draws what everything reflects (its albedo, in
// sRGB); one screen shader (FilterDark) lights it: the static lights baked offline with their shadows, haze and rims
// ('<key>-light'), the faint ambient, and the lights that move:
// the hero's lantern (green-yellow, from the glass drawn in his hand, a gentle flicker), his night sight (so shapes
// read in the dark) and the Order's lanterns (small, dirty green). Then the mockup's post: vignette, filmic tone,
// desaturated grade with green-brown shadows, grain, ordered dither snapped onto its palette.
// The refuge (refuge.ts), the rooms (baked.ts: the crypt, the cloister) and the zones are lit from their own bake and
// mockup (their Look): their '<key>-light' holds the whole static render, two texels per room pixel; under the
// cloister's sun, what is drawn over the room's own pixels gets a capped share of that light.
// What glows or warns is drawn unlit over it, by a second camera that sees only what stands at DEPTH and above: the
// eyes, the torch flames, the effects.

/** Screen pixels per room pixel: the « grand pixel » sheets (the hero, the foes) are drawn at half scale, so each of their
 *  pixels is a screen pixel. */
export const ZOOM = 2;

/** Sizes the game to the view (logic.ts viewSize) times ZOOM; on a resize (main.ts). */
export function fit(scale: Phaser.Scale.ScaleManager) {
  const { width, height } = scale.parentSize, v = viewSize(width, height, T.width, T.height), w = v.width * ZOOM, h = v.height * ZOOM;
  if (width && height && (w !== scale.width || h !== scale.height)) scale.setGameSize(w, h);
}

/** A blend mode for what is drawn already lit (the hero, the foes): normal colour, but it clears the alpha it
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

/** The blood of the trial room's effects (mockup « A. Sang », fx-blood.ts), black to arterial. */
export const SANG = [0x120204, 0x260407, 0x3e060b, 0x5a0a10, 0x781116, 0x951c18, 0xb42c1e];
/** A palette dyed with that blood by brightness, as the mockup dyes struck flesh: the hit flash, never white. */
export function bloodied(pal: Record<string, number>) {
  return Object.fromEntries(Object.entries(pal).map(([c, v]) => [c, SANG[1 + Math.min(4, Math.round((((v >> 16) + ((v >> 8) & 255) + (v & 255)) / 765) * 3.2))]]));
}

type Sprite = Phaser.Physics.Arcade.Sprite;
type Spot = { x: number; y: number; lit: boolean; h?: number; I?: number }; // h, I: a light held that high (a priest's monstrance), that strong
type V4 = [number, number, number, number];

const DEPTH = 7980; // from here up, drawn unlit over the lit world: marks over heads (7990), effects (9000)

const FRAG = `
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uMainSampler;
uniform sampler2D uLight0;
uniform sampler2D uLight1;
uniform sampler2D uLight2;
uniform sampler2D uLight3;
uniform sampler2D uLut;
uniform sampler2D uAlbedo;
uniform vec2 uKeep;
uniform vec4 uView;
uniform vec2 uRoom;
uniform vec4 uQuad;
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
uniform float uTexel;
uniform vec3 uAmb;
uniform vec3 uLampR;
uniform vec4 uPost;
uniform vec4 uVig;
varying vec2 outTexCoord;
// Textures other than the camera's are bottom-up: v = 1 - row / height.

const vec3 LAMP = ${vec(L('#c8c874'))};
const vec3 NIGHT = ${vec(L('#7c8a86'))};
const vec3 ORDER = ${vec(L('#a8ac5c'))};
const vec3 HOLY = ${vec(L('#e8c878'))};

float fall(float d, float I, float r0, float R) {
  float q = max(0.0, 1.0 - (d / R) * (d / R));
  return I / (1.0 + (d / r0) * (d / r0)) * q * q;
}
vec3 point(vec3 P, vec3 n, vec3 p, float I, float r0, float R, vec3 c) {
  vec3 v = (p - P) * vec3(1.0, uLampR.z, 1.0); // up and down the screen is foreshortened depth: uLampR.z undoes it
  float d = max(length(v), 0.001);
  if (d > R) return vec3(0.0);
  return c * fall(d, I, r0, R) * max(0.0, (dot(n, v / d) + 0.45) / 1.45);
}
vec3 haze(vec2 w, vec2 s, float k, float r0, vec3 c) {
  return c * k * exp(-length(vec2(w.x - s.x, (w.y - s.y) * 1.2)) / (r0 * 1.4));
}
// The Order's lights: a lantern (w 0), or a priest's monstrance (a purificateur's pilot) held w px high, gold, lighting the room.
vec3 order(vec3 P, vec3 n, vec2 w, vec4 o) {
  if (o.z <= 0.0) return vec3(0.0);
  if (o.w > 0.0) return point(P, n, vec3(o.xy, o.w), o.z, 40.0, 220.0, HOLY);
  return point(P, n, vec3(o.xy, 16.0), o.z, 16.0, 72.0, ORDER);
}
vec3 orderHaze(vec2 w, vec4 o) {
  if (o.z <= 0.0) return vec3(0.0);
  if (o.w > 0.0) return haze(w, o.xy - vec2(0.0, o.w), o.z * 0.02, 7.0, HOLY);
  return haze(w, o.xy - vec2(0.0, 16.0), o.z * 0.012, 16.0, ORDER);
}
// The baked light comes in up to four textures, a 2 x 2 block of a zone's chunks (uQuad: its first room px, a chunk's
// size); a room's is one, the first.
vec3 baked(vec2 qd, vec2 uv) {
  if (qd.y < 0.5) return qd.x < 0.5 ? texture2D(uLight0, uv).rgb : texture2D(uLight1, uv).rgb;
  return qd.x < 0.5 ? texture2D(uLight2, uv).rgb : texture2D(uLight3, uv).rgb;
}
float bayer(vec2 p) {
  vec2 a = mod(p, 2.0), b = mod(floor(p * 0.5), 2.0);
  float m1 = 2.0 * a.x + 3.0 * a.y - 4.0 * a.x * a.y, m2 = 2.0 * b.x + 3.0 * b.y - 4.0 * b.x * b.y;
  return (4.0 * m1 + m2 + 0.5) / 16.0 - 0.5;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 sp = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uView.zw); // screen pixel
  // The texel of the room's images under this pixel (uTexel per room pixel), and its room position: the light works on
  // those, whatever the zoom.
  vec2 tx = floor((uView.xy + (sp + 0.5) / uZoom) * uTexel), w = tx / uTexel;
  vec4 src = texture2D(uMainSampler, outTexCoord);
  vec3 alb = pow(src.rgb, vec3(2.2));
  vec3 Lt = vec3(0.0), E = vec3(0.0), T = vec3(0.0);
  vec2 cs = uQuad.zw * uTexel, qt = tx - uQuad.xy * uTexel;
  if (qt.x >= 0.0 && qt.y >= 0.0 && qt.x < uRoom.x * uTexel && qt.y < uRoom.y * uTexel) {
    vec2 qd = step(cs, qt), uv = (qt - qd * cs + 0.5) / cs;
    vec3 s = baked(qd, vec2(uv.x, 1.0 - uv.y / 3.0));
    vec3 e = baked(qd, vec2(uv.x, 1.0 - (uv.y + 1.0) / 3.0));
    vec3 g = floor(baked(qd, vec2(uv.x, 1.0 - (uv.y + 2.0) / 3.0)) * 255.0 + 0.5);
    float ny = (g.b - 128.0) / 127.0;
    vec3 P = vec3(w.x, w.y + g.g - 64.0, g.r - 64.0), n = vec3(0.0, ny, sqrt(max(0.0, 1.0 - ny * ny)));
    T = s * s * s * 4.0 * uTorch;
    Lt = T + uAmb;
    E = e * e;
    Lt += point(P, n, uNight.xyz, uNight.w, 140.0, 420.0, NIGHT);
    Lt += point(P, n, uLamp.xyz, uLamp.w, uLampR.x, uLampR.y, LAMP);
    Lt += order(P, n, w, uOrder0) + order(P, n, w, uOrder1) + order(P, n, w, uOrder2) + order(P, n, w, uOrder3);
    // Not the room's own pixel (a character lit with the room's light): what faces us stands with its back to the sun,
    // so it gets at most uKeep.x of it (a rim of sun, the shade's bounce), never the full glare the floor gets.
    if (uKeep.x > 0.0 && distance(texture2D(uAlbedo, vec2(uv.x, 1.0 - uv.y)).rgb, src.rgb) > 0.01) Lt = min(Lt, vec3(uKeep.x));
  }
  // The lantern's halo round its glass and its haze; the Order's lanterns' haze.
  float dg = length(vec2(w.x - uGlass.x, (w.y - uGlass.y) * 1.1));
  if (dg < 6.5) E += vec3(0.5, 0.55, 0.2) * pow(1.0 - dg / 6.5, 2.0) * 0.35 * uGlass.z;
  E += haze(w, uGlass.xy, uLamp.w * 0.0025, uLampR.x, LAMP);
  E += orderHaze(w, uOrder0) + orderHaze(w, uOrder1);
  vec3 c = alb * Lt + E;
  // Vignette, filmic shoulder back to sRGB, contrast.
  vec2 v = (sp - uView.zw * vec2(0.5, 0.55)) / (uView.zw * 0.5);
  float vig = clamp(uVig.x - uVig.y * dot(v, v), 0.0, 1.0);
  c *= vig;
  c = max(c * uPost.x - uVig.w, 0.0);
  c = pow(c / (1.0 + c), vec3(1.0 / 2.2));
  c += (c * c * (3.0 - 2.0 * c) - c) * uPost.y;
  // Grade: desaturated but where something glows, shadows pushed green-brown; grain; ordered dither onto the palette.
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(lum), uPost.z * (1.0 - clamp((E.r + E.g + E.b) * 3.0, 0.0, 1.0)));
  c += vec3(0.012, 0.014, 0.0) * (1.0 - lum) - vec3(0.0, 0.0, 0.004);
  vec2 sq = floor(sp / uZoom * uTexel);
  c += (hash(sq + uFrame) + hash(sq.yx + uFrame * 1.7) - 1.0) * uPost.w * (0.5 + lum);
  vec3 q = min(floor(clamp(c + bayer(tx) * uVig.z, 0.0, 1.0) * 255.0 / 4.0), 63.0);
  vec3 lit = texture2D(uLut, vec2((mod(q.b, 8.0) * 64.0 + q.r + 0.5) / 512.0, 1.0 - (floor(q.b / 8.0) * 64.0 + q.g + 0.5) / 512.0)).rgb;
  // Drawn already lit (prelit(): alpha cleared): its own colour, only vignetted, warmed a little by the torches' baked
  // light where he stands (it reads the floor behind him: a hint, not a relight).
  vec3 warm = sqrt(min(T, vec3(1.0)));
  gl_FragColor = vec4(mix(src.rgb * pow(vig, 0.45) * (1.0 + uKeep.y * warm) + warm * vec3(0.0625, 0.044, 0.025) * uKeep.y, lit, src.a), 1.0);
}`;
function vec(c: number[]) { return `vec3(${c.map((v) => v.toFixed(5)).join(', ')})`; }

/** The light's inputs, updated every frame (see light()). */
type Tex = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
/** A zone's light round the view: the first room px of the 2 x 2 chunks it shows, a chunk's size, their light
 *  textures (src/zone.ts). */
export type Quads = (view: Phaser.Geom.Rectangle) => { quad: [number, number, number, number]; keys: string[] };
class Dark extends Phaser.Filters.Controller {
  lights!: Tex[];
  quad: [number, number, number, number] = [0, 0, 1, 1];
  quads?: Quads;
  tex!: (key: string) => Tex;
  lut!: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
  albedo!: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
  room: [number, number] = [0, 0];
  lamp: V4 = [0, 0, 0, 0];
  glass: [number, number, number] = [0, 0, 0];
  night: V4 = [0, 0, 0, 0];
  order: V4[] = [];
  torch = 1;
  frame = 0;
  look: Look;
  constructor(camera: Phaser.Cameras.Scene2D.Camera, look: Look) { super(camera, 'FilterDark'); this.look = look; }
}

class DarkNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) { super('FilterDark', manager, undefined, FRAG); }
  setupTextures(c: Dark, textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[]) {
    if (c.quads) { const q = c.quads(c.camera.worldView); c.quad = q.quad; c.lights = q.keys.map(c.tex); }
    c.lights.forEach((t, i) => (textures[1 + i] = t));
    textures[5] = c.lut;
    textures[6] = c.albedo;
  }
  setupUniforms(c: Dark) {
    const pm = this.programManager, v = c.camera.worldView;
    for (let i = 0; i < 4; i++) pm.setUniform(`uLight${i}`, 1 + i);
    pm.setUniform('uLut', 5);
    pm.setUniform('uAlbedo', 6);
    pm.setUniform('uQuad', c.quad);
    // Where the camera really draws the room: it rounds each image to whole screen pixels (roundPixels), so must the
    // light, or a half-pixel scroll lays each texel's light on its neighbour.
    const z = c.camera.zoom, snap = (a: number) => -Math.round(-a * z) / z;
    pm.setUniform('uView', [snap(v.x), snap(v.y), c.camera.width, c.camera.height]);
    pm.setUniform('uZoom', c.camera.zoom);
    pm.setUniform('uRoom', c.room);
    pm.setUniform('uLamp', c.lamp);
    pm.setUniform('uGlass', c.glass);
    pm.setUniform('uNight', c.night);
    for (let i = 0; i < 4; i++) pm.setUniform(`uOrder${i}`, c.order[i] ?? [0, 0, 0, 0]);
    pm.setUniform('uTorch', c.torch);
    pm.setUniform('uFrame', c.frame);
    const k = c.look;
    pm.setUniform('uTexel', k.texel);
    pm.setUniform('uKeep', [k.albedo ? k.sprites ?? 0 : 0, k.warm ?? 0.8]);
    pm.setUniform('uAmb', L(k.amb).map((v) => v * 0.9));
    pm.setUniform('uLampR', [k.lamp[1], k.lamp[2], k.ys]);
    pm.setUniform('uPost', k.post);
    pm.setUniform('uVig', k.vig);
  }
}

// A look's palette and its colour distance; LUT: the nearest colour of every rgb / 4, 64 blue tiles of 64x64.
function rgb(s: string) { return [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)); }
/** A '#rrggbb' colour in linear light (hoisted: the shader's source uses it). */
function L(s: string) { return rgb(s).map((v) => (v / 255) ** 2.2); }
/** The nearest colour of `pal` (rgb) to r, g, b; `wY`: the weight of brightness against hue. */
function nearest(r: number, g: number, b: number, pal: number[][], wY: number) {
  let best = pal[0], bd = Infinity;
  for (const q of pal) {
    const dr = r - q[0], dg = g - q[1], db = b - q[2], dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2;
    const d = dY * dY * wY + dCo * dCo * 0.6 + dCg * dCg * 0.7;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function lut(scene: Phaser.Scene, look: Look) {
  const key = `dark-lut-${look.light}`, pal = look.pal.map(rgb);
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 512, 512)!, img = t.context.createImageData(512, 512);
  for (let b = 0; b < 64; b++) for (let g = 0; g < 64; g++) for (let r = 0; r < 64; r++) // the mockup snaps rgb >> 2: each cell takes its centre's colour
    img.data.set([...nearest(r * 4 + 2, g * 4 + 2, b * 4 + 2, pal, look.wY), 255], (((b >> 3) * 64 + g) * 512 + (b & 7) * 64 + r) * 4);
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

/** How a room in the dark is lit and finished, from its mockup. `light`: the texture of its baked light (three bands,
 *  `texel` texels per room px); `torches`: flames drawn over it (x, the row under the flame, strength), `flicker` all its
 *  baked light with them; `amb`: the ambient added to it; `night`: the hero's night sight; `lamp`: his lantern's
 *  strength, near and far radius; `ys`: how much a screen row counts in depth; `post`: exposure, contrast, desaturation,
 *  grain; `vig`: vignette centre and fall, dither, black level (taken off after the exposure); `pal`, `wY`: the palette and its brightness weight;
 *  `albedo`: the texture of the room's own pixels, so `sprites` caps the light on whatever else is drawn (a sun made for
 *  the ground would burn the dark skins white); `warm`: how much the baked light brightens what is drawn already lit. */
export type Look = {
  light: string; texel: number; torches: [number, number, number][]; flicker: boolean; amb: string; night: number;
  lamp: [number, number, number]; ys: number; post: [number, number, number, number]; vig: [number, number, number, number]; pal: string[]; wY: number;
  albedo?: string; sprites?: number; warm?: number;
};

/** The baked light of `src` (its first band, `texel` texels a room px), w x h room px, read back once: at each room px the
 *  floor's light as dark.ts draws it (its T, 4 at full, without the flicker), for the foes' sight (RoomScene hunts()). */
export function lightMap(src: CanvasImageSource, w: number, h: number, texel: number) {
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, w * texel, h * texel, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = Math.max(d[4 * i], d[4 * i + 1], d[4 * i + 2]);
  return (x: number, y: number) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < w && y < h ? 4 * (m[y * w + x] / 255) ** 3 : 0; };
}

/** Lights the room (`size`, room px) around `hero`; `lanterns()`: the Order's lanterns standing; `quads`: an open
 *  zone's light, chunk by chunk (its look has none of its own). The world camera's light is its filter 'dark' (set it
 *  inactive to see the room unlit: albedo only). */
export function light(scene: Phaser.Scene, hero: Sprite, enemies: Phaser.Physics.Arcade.Group, lanterns: () => Spot[], size: [number, number], look: Look, quads?: Quads) {
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!registered) renderer.renderNodes.addNodeConstructor('FilterDark', DarkNode);
  registered = true;
  const main = scene.cameras.main, f = main.filters.internal.add(new Dark(main, look)) as Dark;
  f.tex = (key) => scene.textures.get(key).source[0].glTexture!;
  f.lut = f.tex(lut(scene, look));
  if (quads) { f.quads = quads; f.room = [2 * size[0], 2 * size[1]]; f.albedo = f.lut; }
  else { f.lights = [0, 1, 2, 3].map(() => f.tex(look.light)); f.quad = [0, 0, ...size]; f.room = size; f.albedo = f.tex(look.albedo ?? look.light); }

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
  for (const [x, y, k] of look.torches) scene.add.sprite(x, y, flameKey).setOrigin(0.5, 1).setDepth(DEPTH + 5).setAlpha(0.6 + 0.4 * k).play({ key: 'dark-flame', startFrame: x % 3 });
  const eyes = new Map<Sprite, Phaser.GameObjects.Image>(), shades = new Map<Sprite, Phaser.GameObjects.Image>();
  let tick = 0, lamp0 = 1, torch = 1;

  const step = (time: number) => {
    // The lantern glass in his hand, wherever this frame of his sheet has it (hero.ts).
    const [ax, ay] = (hero.frame.customData as { lamp: [number, number] }).lamp, tl = hero.getTopLeft();
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
      // A half-scale sheet (foes.ts) casts at its scale.
      sh.setTexture(s.texture.key, s.frame.name).setPosition(s.x, s.body!.bottom)
        .setOrigin(s.originX, (s.displayOriginY + (s.body!.bottom - s.y) / s.scaleY) / s.frame.height)
        .setFlipX(s.flipX).setRotation(Math.atan2(dy, dx) + Math.PI / 2).setScale(s.scaleX, s.scaleY * Math.min(3.2, Math.max(0.8, d / 22)))
        .setAlpha(0.85 * Math.min(1, 2 - d / 75) * s.alpha).setDepth(s.depth - 0.01);
    }
    for (const [s, e] of eyes) if (!s.active) { e.destroy(); eyes.delete(s); }
    for (const [s, e] of shades) if (!s.active) { e.destroy(); shades.delete(s); }
    if (++tick % 6 === 0) { // ten times a second: the torches gutter, the lamp breathes, the grain moves
      if (look.flicker) torch = Math.random() < 0.12 ? 0.8 + Math.random() * 0.1 : 0.94 + Math.random() * 0.06;
      lamp0 = 0.9 + 0.08 * Math.sin(time / 400) + Math.random() * 0.04;
      f.frame = (f.frame + 1) % 97;
    }
    f.torch = torch;
    f.lamp = [lx, feet + 1, feet - ly, hero.visible ? look.lamp[0] * lamp0 : 0];
    f.glass = [lx, ly, hero.visible ? lamp0 : 0];
    f.night = [hero.x, feet, 90, look.night];
    f.order = lanterns().filter((l) => l.lit).slice(0, 4).map((l): V4 => [l.x, l.y, l.I ?? 1.8, l.h ?? 0]);
    sort();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step));
}
