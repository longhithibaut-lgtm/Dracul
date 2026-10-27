// A zone's floor material alone, fast (no render): its albedo under a plain light, a texel per px, over regions of room
// px; for judging a floor's pattern between bakes. Writes <out>/<name>.png (480 x 270 room px round each point).
// Usage: node tools/art/floor.preview.mjs [--zone=catacombs] [--out=shots/prev] name:x,y [name:x,y ...]
import { mkdirSync } from 'node:fs';
import { png } from './bake.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const Z = await import(`./rooms/${arg('zone', 'catacombs')}.mjs`);
const sc = await Z.scene(), SN = sc.cam.s, out = arg('out', 'shots/prev');
mkdirSync(out, { recursive: true });
for (const view of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const [name, at] = view.split(':'), [cx, cy] = at.split(',').map(Number), w = 480, h = 270;
  const W = 2 * w, H = 2 * h, img = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const m = sc.env(2 * (cx - w / 2) + i + 0.5, (2 * (cy - h / 2) + j + 0.5) / SN, 0), N = m.N ?? [0, 0, 1], l = Math.hypot(...N); // the floor point under the texel
    const k = 0.55 + 0.45 * Math.max(0, (N[1] * 0.6 + N[2] * 0.8 - N[0] * 0.2) / l);
    for (let c = 0; c < 3; c++) img[(j * W + i) * 4 + c] = Math.round(255 * Math.min(1, m.alb[c] * k * 2.2 + (m.emi?.[c] ?? 0) * 4) ** (1 / 2.2));
    img[(j * W + i) * 4 + 3] = 255;
  }
  png(`${out}/${name}.png`, img, W, H);
}
