import type Phaser from 'phaser';
import * as Font from './font.ts';
import * as Save from './save.ts';
import { T } from './tuning.ts';
import { runMask } from './logic.ts';
import { NAV, WORLD, ZONES, gateOpen, type ZoneId } from './world.ts';
import { ARENA } from './catacombs.data.ts';
import { MAPS } from './map.data.ts';
import necropolisMap from './map/necropolis.png';
import catacombsMap from './map/catacombs.png';

// La carte (key C): an open zone's map, drawn offline from its plan (tools/art/map.gen.mjs: src/map/<zone>.png), shown
// over the game paused. Only what the hero has seen shows (the fog): the cells of T.carte.cell px within his sight, kept
// in the save for good, per zone (Save.carte, a bitmask in base64). Over it: him and where he faces, the doors, the
// shortcuts shut or raised, the prison once seen, a few places' names. Never the caches nor the foes.
const URL: Record<ZoneId, string> = { necropolis: necropolisMap, catacombs: catacombsMap };
type P = { x: number; y: number };

// ---------- the fog ----------

/** Zone `z`'s fog grid. */
export const grid = (z: ZoneId) => ({ cols: Math.ceil(ZONES[z].W / T.carte.cell), rows: Math.ceil(ZONES[z].H / T.carte.cell) });

/** A grid's cells (0 or 1 each) packed 8 to a byte, in base64. */
export function encode(bits: Uint8Array) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7); });
  return btoa(String.fromCharCode(...bytes));
}
/** `n` cells from encode()'s `s`; none seen when it is absent, broken, or of another grid's size (the zone was redrawn). */
export function decode(s: string | undefined, n: number) {
  const bits = new Uint8Array(n);
  let raw = '';
  try { raw = atob(s ?? ''); } catch { return bits; }
  if (raw.length !== Math.ceil(n / 8)) return bits;
  for (let i = 0; i < n; i++) bits[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}

/** Sets the cells of a grid `cols` wide (`cell` px) whose middle lies within `r` of (x, y) and in his sight: the line to
 *  it clear of what is `blocked` but for its last `into` px (the face of a wall he looks at). Returns how many were new. */
export function reveal(bits: Uint8Array, cols: number, cell: number, x: number, y: number, r: number, blocked: (x: number, y: number) => boolean, into: number) {
  const rows = bits.length / cols;
  let n = 0;
  for (let j = Math.max(0, Math.floor((y - r) / cell)); j <= Math.min(rows - 1, Math.floor((y + r) / cell)); j++)
    for (let i = Math.max(0, Math.floor((x - r) / cell)); i <= Math.min(cols - 1, Math.floor((x + r) / cell)); i++) {
      const k = j * cols + i, cx = (i + 0.5) * cell, cy = (j + 0.5) * cell, d = Math.hypot(cx - x, cy - y);
      if (bits[k] || d > r) continue;
      let seen = true;
      for (let s = 12; s < d - into; s += 4) if (blocked(x + ((cx - x) * s) / d, y + ((cy - y) * s) / d)) { seen = false; break; } // his own feet's cell aside
      if (seen) { bits[k] = 1; n++; }
    }
  return n;
}

const sights = new Map<ZoneId, (x: number, y: number) => boolean>();
/** What stops sight in zone `z` (rock, buildings, walls of bones: map.data.ts), at room px (x, y). */
function sight(z: ZoneId) {
  if (!sights.has(z)) {
    const cols = Math.ceil(ZONES[z].W / NAV), rows = Math.ceil(ZONES[z].H / NAV), m = runMask(MAPS[z].sight, cols, rows);
    sights.set(z, (x, y) => { const i = Math.floor(x / NAV), j = Math.floor(y / NAV); return i < 0 || j < 0 || i >= cols || j >= rows || m[j * cols + i] === 1; });
  }
  return sights.get(z)!;
}

const fogs = new Map<ZoneId, { src: string | undefined; bits: Uint8Array }>();
/** Zone `z`'s cells seen, as the save holds them. */
export function fog(z: ZoneId) {
  const src = Save.data.carte[z], f = fogs.get(z);
  if (f && f.src === src) return f.bits;
  const { cols, rows } = grid(z), bits = decode(src, cols * rows);
  fogs.set(z, { src, bits });
  return bits;
}
const keep = (z: ZoneId, bits: Uint8Array) => { Save.data.carte[z] = encode(bits); fogs.set(z, { src: Save.data.carte[z], bits }); };
/** How many cells of zone `z` he has seen. */
export const seen = (z: ZoneId) => fog(z).reduce((s, b) => s + b, 0);
/** Every cell of zone `z` seen (scripts/shot.mjs's captures of the whole map). */
export function revealAll(z: ZoneId) { keep(z, fog(z).fill(1)); }

let was = '', storedAt = 0;
/** Each frame in zone `z`, him at (x, y), `lit` (in light he sees farther): what he sees is revealed, saved now and then.
 *  shortcut: what was seen in the last 2 s before the page closes may be lost; store on pagehide if it ever matters. */
export function see(z: ZoneId, x: number, y: number, lit: boolean) {
  const at = `${z}:${Math.round(x / 4)}:${Math.round(y / 4)}:${lit}`;
  if (at === was) return;
  was = at;
  const bits = fog(z), C = T.carte;
  if (!reveal(bits, grid(z).cols, C.cell, x, y, lit ? C.lit : C.dark, sight(z), C.into)) return;
  keep(z, bits);
  if (Date.now() - storedAt > 2000) { storedAt = Date.now(); Save.store(); }
}

// ---------- the map shown ----------

const UI = 20_000; // over the room, unlit (dark.ts), as the other panels
const INK = '#0e0a07', BONE = '#c4b697', DIM = '#82755d', RED = '#b42c1e', HERO = '#e0284a';
// Marks, a char a pixel: b its colour, k ink, . nothing (outlined in ink when drawn).
const ICONS = {
  door: ['.bbb.', 'bkkkb', 'bkkkb', 'bkkkb', 'bkkkb'],
  stairs: ['bbbbb', '.....', '.bbb.', '.....', '..b..'],
  well: ['.bbb.', 'bkkkb', 'bkkkb', 'bkkkb', '.bbb.'],
  shut: ['bbbbb', 'b.b.b', 'b.b.b', 'b.b.b', 'b.b.b'],
  raised: ['bbbbb', 'b.b.b', '.....', '.....', '.....'],
  skull: ['.bbb.', 'bbbbb', 'bkbkb', 'bbbbb', '.b.b.'],
};
type Mark = P & { icon: keyof typeof ICONS; name: string; color: string };
// The doors' names (the painted rooms': WORLD's); a door a shortcut shuts takes the gate's mark.
const DOORS: Record<ZoneId, Record<string, [keyof typeof ICONS, string]>> = {
  necropolis: { refuge: ['stairs', 'Le refuge'], hall: ['door', WORLD.hall.name], nave: ['door', WORLD.nave.name], ossuary: ['door', WORLD.ossuary.name], chapel: ['door', WORLD.chapel.name], puits: ['well', 'Le puits'], caveau: ['door', 'Le caveau'] },
  catacombs: { puits: ['stairs', 'L\'échelle du puits'], caveau: ['stairs', 'L\'escalier du caveau'] },
};
// A few places' names, under their middle (room px), shown once seen.
const PLACES: Record<ZoneId, [string, number, number][]> = {
  necropolis: [['Le champ des tombes', 640, 900], ['Le gouffre', 1405, 470], ['La brèche de l\'Aube', 2960, 360], ['Le camp de l\'Ordre', 3155, 1100]],
  catacombs: [['Le nid', 610, 640], ['Les eaux noires', 1540, 760], ['La grande croisée', 1400, 400]],
};

/** Zone `z`'s marks: its doors, its shortcuts (`opened`: raised; the arenas' are the prison's), the prison (`dead`: its
 *  guardian killed). */
export function marks(z: ZoneId, opened: readonly string[], dead: boolean): Mark[] {
  const Z = ZONES[z], out: Mark[] = [], mid = (g: (typeof Z.GATES)[number]) => ({ x: g.box[0] + g.box[2] / 2, y: g.box[1] + g.box[3] / 2 });
  const gates = Z.GATES.filter((g) => !g.arena), gated = (d: P) => gates.find((g) => Math.hypot(mid(g).x - d.x, mid(g).y - d.y) < 40);
  const gate = (g: (typeof gates)[number]) => (gateOpen(g, opened) ? { icon: 'raised' as const, color: BONE } : { icon: 'shut' as const, color: RED });
  for (const [k, d] of Object.entries(Z.DOORS)) {
    const [icon, name] = DOORS[z][k], g = gated(d);
    out.push({ x: d.x, y: d.y - 8, name, ...(g ? gate(g) : { icon, color: BONE }) });
  }
  for (const g of gates) if (!Object.values(Z.DOORS).some((d) => gated(d) === g)) out.push({ ...mid(g), name: g.name, ...gate(g) });
  if (z === 'catacombs') out.push({ x: (ARENA[0] + ARENA[2]) / 2, y: (ARENA[1] + ARENA[3]) / 2, icon: 'skull', name: 'La prison', color: dead ? BONE : RED });
  return out;
}

/** The fog over map px (u, v) of zone `z` (S room px a px): its cells seen, smoothed (0 unseen, 1 seen). */
function fogAt(z: ZoneId, bits: Uint8Array, X: number, Y: number) {
  const { cols, rows } = grid(z), u = X / T.carte.cell - 0.5, v = Y / T.carte.cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= cols || b >= rows ? 0 : bits[b * cols + a]);
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function preload(scene: Phaser.Scene, z: string) {
  if (z in URL && !scene.textures.exists(`carte-${z}`)) scene.load.image(`carte-${z}`, URL[z as ZoneId]);
}

/** Opens zone `z`'s map over the game, paused until close(): him at `hero`, facing `facing` (radians). */
export function open(scene: Phaser.Scene, z: ZoneId, hero: P, facing: number) {
  Save.store(); // what he has seen so far, for good
  scene.physics.pause();
  scene.tweens.pauseAll();
  scene.time.paused = true;
  const key = 'carte', { S, w, h } = MAPS[z], bits = fog(z), k = scene.cameras.main.zoom; // k native px a pixel of the words
  const img = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setScrollFactor(0).setDepth(UI).setScale(1 / k);
  const draw = () => {
    const W = scene.scale.width, H = scene.scale.height;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, W, H)!, ctx = tex.context, x0 = Math.round((W - w) / 2), y0 = Math.round((H - h) / 2);
    ctx.fillStyle = 'rgba(3, 3, 3, 0.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#030303';
    ctx.fillRect(x0, y0, w, h);
    // the map, under the fog: seen, its charred edge, then nothing (ordered dither)
    const src = document.createElement('canvas');
    [src.width, src.height] = [w, h];
    const sctx = src.getContext('2d')!;
    sctx.drawImage(scene.textures.get(`carte-${z}`).getSourceImage() as CanvasImageSource, 0, 0);
    const px = sctx.getImageData(0, 0, w, h), d = px.data, char = [0x1e, 0x15, 0x0e]; // the parchment burnt
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const f = fogAt(z, bits, (x + 0.5) * S, (y + 0.5) * S), t = BAYER[(y & 3) * 4 + (x & 3)], i = 4 * (y * w + x);
      if (f > 0.35 + 0.5 * t) continue;
      if (f > 0.05 + 0.3 * t) d.set(char, i);
      else d[i + 3] = 0;
    }
    sctx.putImageData(px, 0, 0);
    ctx.drawImage(src, x0, y0);
    // its frame, the zone's name, how to close it
    ctx.fillStyle = '#312b22';
    ctx.fillRect(x0 - 3, y0 - 3, w + 6, 1); ctx.fillRect(x0 - 3, y0 + h + 2, w + 6, 1); ctx.fillRect(x0 - 3, y0 - 3, 1, h + 6); ctx.fillRect(x0 + w + 2, y0 - 3, 1, h + 6);
    const text = (s: string, x: number, y: number, color: string, gap?: number) => {
      for (const [c, o] of [[INK, k], [color, 0]] as const) { ctx.fillStyle = c; Font.draw(s, x + o, y + o, (a, b) => ctx.fillRect(x + o + (a - x - o) * k, y + o + (b - y - o) * k, k, k), gap); }
    };
    const icon = (rows: string[], cx: number, cy: number, color: string) => {
      const x = Math.round(cx - (rows[0].length * k) / 2), y = Math.round(cy - (rows.length * k) / 2), on = (i: number, j: number) => (rows[j]?.[i] ?? '.') !== '.';
      ctx.fillStyle = INK;
      for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= rows[0].length; i++) if (!on(i, j) && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => on(i + a, j + b))) ctx.fillRect(x + i * k, y + j * k, k, k);
      rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '.') return; ctx.fillStyle = c === 'k' ? INK : color; ctx.fillRect(x + i * k, y + j * k, k, k); }));
    };
    const label = (s: string, cx: number, y: number, color: string) => text(s, Math.round(Math.min(Math.max(cx - (Font.width(s) * k) / 2, x0), x0 + w - Font.width(s) * k)), y, color);
    const title = WORLD[z].name.toUpperCase();
    text(title, Math.round((W - Font.width(title, 2) * k) / 2), y0 - 14 * k, BONE, 2); // centred: the HUD holds the corner
    const hint = 'C ou Échap : fermer';
    text(hint, x0 + w - Font.width(hint) * k, y0 + h + 5 * k, DIM);
    icon(ICONS.shut, x0 + 3 * k, y0 + h + 10 * k, RED);
    text('fermé', x0 + 8 * k, y0 + h + 5 * k, DIM);
    icon(ICONS.raised, x0 + 40 * k, y0 + h + 10 * k, BONE);
    text('levé', x0 + 45 * k, y0 + h + 5 * k, DIM);
    const there = (p: P) => fogAt(z, bits, p.x, p.y) > 0.5, on = (p: P) => ({ x: x0 + p.x / S, y: y0 + p.y / S });
    for (const [s, x, y] of PLACES[z]) if (there({ x, y })) label(s, on({ x, y }).x, Math.round(on({ x, y }).y), DIM);
    for (const m of marks(z, Save.data.shortcuts, Save.data.nourrice.dead)) {
      if (!there(m)) continue;
      const p = on(m);
      icon(ICONS[m.icon], p.x, p.y, m.color);
      label(m.name, p.x, Math.round(p.y + 4 * k), BONE);
    }
    // him: an arrowhead the way he faces
    const c = on(hero), f = { x: Math.cos(facing), y: Math.sin(facing) };
    for (const [r, color] of [[1.5, INK], [1, HERO]] as const) {
      const a = { x: c.x + f.x * 8 * r, y: c.y + f.y * 8 * r }, b = { x: c.x - f.x * 5 * r - f.y * 6 * r, y: c.y - f.y * 5 * r + f.x * 6 * r }, e = { x: c.x - f.x * 5 * r + f.y * 6 * r, y: c.y - f.y * 5 * r - f.x * 6 * r };
      const side = (p: P, q: P, x: number, y: number) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
      ctx.fillStyle = color;
      for (let y = Math.floor(c.y - 13); y <= c.y + 13; y++) for (let x = Math.floor(c.x - 13); x <= c.x + 13; x++) {
        const s = [side(a, b, x + 0.5, y + 0.5), side(b, e, x + 0.5, y + 0.5), side(e, a, x + 0.5, y + 0.5)];
        if (s.every((v) => v >= 0) || s.every((v) => v <= 0)) ctx.fillRect(x, y, 1, 1);
      }
    }
    tex.refresh();
    img.setTexture(key);
  };
  draw();
  scene.scale.on('resize', draw);
  const close = () => {
    scene.scale.off('resize', draw);
    scene.events.off('shutdown', close);
    img.destroy();
    scene.textures.remove(key);
    scene.physics.resume();
    scene.tweens.resumeAll();
    scene.time.paused = false;
  };
  scene.events.once('shutdown', close);
  return { close };
}
export type Carte = ReturnType<typeof open>;
