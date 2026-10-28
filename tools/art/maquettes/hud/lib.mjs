// HUD mockups: a native 960x540 layer (one HUD pixel = two screen pixels at 1920x1080) painted as height, albedo,
// gloss and glow, lit like the game's props (key from the top left, cold rim from behind), snapped to the grand-pixel
// palette, then laid over an in-game capture. Text comes from Chromium's canvas as masks.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PALETTE, clamp, hex, fbm } from '../../grand/lib.mjs';

export const W = 960, H = 540;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[((y | 0) & 3) * 4 + ((x | 0) & 3)]; // ordered dither threshold 0..1
export const lin = (s) => hex(s).map((v) => Math.pow(v, 2.2));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- 2D distance fields ----------
export const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
export function sdSeg(x, y, ax, ay, bx, by, r = 0) {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay, t = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - dx * t, py - dy * t) - r;
}
export const sdBox = (x, y, cx, cy, hw, hh, r = 0) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
// arc of radius r round (cx, cy) from angle a0 to a1 (radians, y down), thickness w
export function sdArc(x, y, cx, cy, r, a0, a1, w) {
  let a = Math.atan2(y - cy, x - cx); while (a < a0) a += Math.PI * 2;
  if (a <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
  return Math.min(Math.hypot(x - cx - r * Math.cos(a0), y - cy - r * Math.sin(a0)), Math.hypot(x - cx - r * Math.cos(a1), y - cy - r * Math.sin(a1))) - w;
}

// ---------- the layer ----------
export class Layer {
  constructor() {
    const N = W * H;
    this.h = new Float32Array(N); this.alb = new Float32Array(N * 3); this.em = new Float32Array(N * 3);
    this.sp = new Float32Array(N); this.op = new Float32Array(N); this.flat = new Uint8Array(N);
    this.dark = new Float32Array(N); this.tint = new Float32Array(N * 4); // over the capture: darken, then a colour mixed in
  }
  // fn(x, y) at pixel centres -> undefined, or { h, c: linear rgb, s: gloss, e: glow rgb, op: opacity, flat: unlit,
  // add: true to raise/sink what is there by h and multiply its colour by m }
  paint(x0, y0, x1, y1, fn) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      const r = fn(x + 0.5, y + 0.5); if (!r) continue;
      const i = y * W + x;
      if (r.add) {
        if (!this.op[i]) continue;
        this.h[i] += r.h ?? 0;
        if (r.m !== undefined) for (let k = 0; k < 3; k++) this.alb[i * 3 + k] *= r.m;
        if (r.c) for (let k = 0; k < 3; k++) this.alb[i * 3 + k] = r.c[k];
        if (r.e) for (let k = 0; k < 3; k++) this.em[i * 3 + k] += r.e[k];
        if (r.s !== undefined) this.sp[i] = r.s;
        continue;
      }
      this.h[i] = r.h ?? 0; this.sp[i] = r.s ?? 0; this.op[i] = r.op ?? 1; this.flat[i] = r.flat ? 1 : 0;
      for (let k = 0; k < 3; k++) { this.alb[i * 3 + k] = r.c[k]; this.em[i * 3 + k] = r.e ? r.e[k] : 0; }
    }
  }
  // fn -> darkening 0..1 of the capture (kept: the strongest)
  scrim(x0, y0, x1, y1, fn) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      const i = y * W + x; this.dark[i] = Math.max(this.dark[i], clamp(fn(x + 0.5, y + 0.5) ?? 0));
    }
  }
  // fn -> [r, g, b, amount] (srgb 0..1) mixed into the capture
  wash(x0, y0, x1, y1, fn) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      const t = fn(x + 0.5, y + 0.5); if (!t || t[3] <= 0) continue;
      const i = (y * W + x) * 4; if (t[3] > this.tint[i + 3]) { this.tint[i] = t[0]; this.tint[i + 1] = t[1]; this.tint[i + 2] = t[2]; this.tint[i + 3] = t[3]; }
    }
  }
  // a text mask (see Text) at x, y (its top left); style(alpha, x, y) -> a paint result or undefined
  text(m, x, y, style) {
    x = Math.round(x); y = Math.round(y);
    this.paint(x, y, x + m.w, y + m.h, (px, py) => { const a = m.a[(Math.floor(py) - y) * m.w + Math.floor(px) - x] / 255; return a > 0.42 ? style(a, px, py) : undefined; });
  }
  // light, then the palette: rgba (srgb 0..255, alpha = opacity)
  shade() {
    const out = new Uint8ClampedArray(W * H * 4), Lk = norm([-0.55, -0.8, 0.9]), Rm = norm([0.75, 0.55, 0.35]), Hv = norm([Lk[0], Lk[1], Lk[2] + 1]);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5), cache = new Map();
    const hAt = (x, y, i) => (x < 0 || y < 0 || x >= W || y >= H || !this.op[y * W + x]) ? this.h[i] : this.h[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!this.op[i]) continue;
      let c;
      if (this.flat[i]) c = [0, 1, 2].map((k) => this.alb[i * 3 + k] + this.em[i * 3 + k]);
      else {
        const nx = -(hAt(x + 1, y, i) - hAt(x - 1, y, i)) * 0.5, ny = -(hAt(x, y + 1, i) - hAt(x, y - 1, i)) * 0.5, n = norm([nx, ny, 1]);
        const d = Math.max(0, dot(n, Lk)), rim = Math.pow(Math.max(0, dot(n, Rm)), 2) * 0.5, sp = this.sp[i] * Math.pow(Math.max(0, dot(n, Hv)), 40) * 1.4;
        c = [0, 1, 2].map((k) => this.alb[i * 3 + k] * (0.1 + 1.0 * d * [1, 0.93, 0.8][k] + rim * [0.55, 0.65, 0.8][k]) + sp * [1, 0.95, 0.85][k] + this.em[i * 3 + k]);
      }
      c = c.map((v) => { v = Math.max(0, v) * 1.25; v = v / (1 + v * 0.35); return Math.pow(v, 1 / 2.2); });
      const dth = bayer[(y & 3) * 4 + (x & 3)] * 0.045, r = clamp(c[0] + dth) * 255, g = clamp(c[1] + dth) * 255, b = clamp(c[2] + dth) * 255;
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let best = cache.get(key);
      if (best === undefined) {
        let bd = 1e9; best = 0;
        for (let p = 0; p < PALETTE.length; p++) { const Q = PALETTE[p], dr = r - Q[0], dg = g - Q[1], db = b - Q[2], dY = 0.3 * dr + 0.59 * dg + 0.11 * db, dCo = dr - db, dCg = dg - (dr + db) / 2, dd = dY * dY * 1.0 + dCo * dCo * 1.3 + dCg * dCg * 1.3; /* hue weighs more than in the rooms: a lit red stays red */ if (dd < bd) { bd = dd; best = p; } }
        cache.set(key, best);
      }
      const q = PALETTE[best];
      out[i * 4] = q[0]; out[i * 4 + 1] = q[1]; out[i * 4 + 2] = q[2]; out[i * 4 + 3] = clamp(this.op[i]) * 255;
    }
    return out;
  }
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// the capture (1920x1080 rgb) with the layer laid over it, each HUD pixel two screen pixels
export function compose(bg, layer) {
  const rgba = layer.shade(), out = new Uint8ClampedArray(1920 * 1080 * 4);
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
    const o = (y * 1920 + x) * 4, i = (y >> 1) * W + (x >> 1), t = i * 4, a = rgba[i * 4 + 3] / 255, dk = 1 - layer.dark[i], ta = layer.tint[t + 3];
    for (let k = 0; k < 3; k++) {
      let v = bg.data[(y * 1920 + x) * bg.n + k] * dk;
      v = v + (layer.tint[t + k] * 255 - v) * ta;
      out[o + k] = v + (rgba[i * 4 + k] - v) * a;
    }
    out[o + 3] = 255;
  }
  return out;
}

// ---------- PNG in ----------
export function readPNG(path) {
  const b = fs.readFileSync(path); let p = 8, w, h, type, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || d[12]) throw new Error(`${path}: 8-bit, non-interlaced only`); }
    if (t === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const n = { 2: 3, 6: 4 }[type]; if (!n) throw new Error(`${path}: RGB or RGBA only`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), row = w * n, data = new Uint8Array(w * h * n);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
    for (let i = 0; i < row; i++) {
      const a = i >= n ? data[dst + i - n] : 0, u = y ? data[dst - row + i] : 0, c = y && i >= n ? data[dst - row + i - n] : 0, v = raw[src + i];
      const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
      data[dst + i] = (v + [0, a, u, (a + u) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? u : c][f]) & 255;
    }
  }
  return { w, h, n, data };
}

// ---------- text, from Chromium's canvas ----------
const FONTS = { // OFL fonts from Google Fonts, fetched once into the cache
  fell: 'https://fonts.gstatic.com/s/imfellenglish/v14/Ktk1ALSLW8zDe0rthJysWrnLsAz3Fw.ttf',
  fellI: 'https://fonts.gstatic.com/s/imfellenglish/v14/Ktk3ALSLW8zDe0rthJysWrnLsAzHFaOd.ttf',
  gotisch: 'https://fonts.gstatic.com/s/grenzegotisch/v20/Fh4hPjjqNDz1osh_jX9YfjudpBJBNV5y5wf_k1i5yDhUcA.ttf',
  cinzel: 'https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnTYo.ttf', // lining figures, for numbers
};
// texts: { key: [string, css font, letterSpacing px?] } -> { key: { w, h, a (alpha bytes), asc } }
export async function texts(list, cache = 'shots/hud-fonts') {
  fs.mkdirSync(cache, { recursive: true });
  const faces = Object.entries(FONTS).map(([name, url]) => {
    const f = `${cache}/${name}.ttf`;
    if (!fs.existsSync(f)) execFileSync('curl', ['-sSf', '-m', '60', '-o', f, url]);
    return `@font-face{font-family:${name};src:url(data:font/ttf;base64,${fs.readFileSync(f).toString('base64')})}`;
  });
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.setContent(`<style>${faces.join('')}</style>`);
  const res = await page.evaluate(async ([list, names]) => {
    await Promise.all(names.map((f) => document.fonts.load(`20px ${f}`)));
    const out = {};
    for (const [key, [s, font, sp]] of Object.entries(list)) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      g.font = font; g.letterSpacing = `${sp ?? 0}px`;
      const m = g.measureText(s), asc = Math.ceil(m.actualBoundingBoxAscent), w = Math.ceil(m.width) + 4, h = asc + Math.ceil(m.actualBoundingBoxDescent) + 2;
      c.width = w; c.height = h; g.font = font; g.letterSpacing = `${sp ?? 0}px`; g.fillStyle = '#fff'; g.fillText(s, 2, asc + 1);
      const d = g.getImageData(0, 0, w, h).data, a = [];
      for (let i = 3; i < d.length; i += 4) a.push(d[i]);
      out[key] = { w, h, a, asc: asc + 1 };
    }
    return out;
  }, [list, Object.keys(FONTS)]);
  await browser.close();
  return res;
}

export { clamp, fbm };
