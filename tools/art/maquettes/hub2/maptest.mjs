// quick top-down dump of the heightfield to check the layout
import { NX, NY, heightAt, roomAt, kindAt } from './world.mjs';
import { writePNG } from './lib.mjs';
const S = 4, W = NX / S | 0, H = NY / S | 0, px = new Uint8ClampedArray(W * H * 4);
const col = [[0,0,0],[160,140,110],[120,110,140],[90,110,160],[170,110,70],[120,150,80],[150,110,170],[110,110,110],[80,80,60]];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x * S + 2, Y = y * S + 2, k = kindAt(X, Y), r = roomAt(X, Y), h = heightAt(X, Y); let c = k === 0 ? [10,10,10] : k === 2 ? [Math.min(255, h / 2), 40, 40] : col[r].map(v => v * (h < 0 ? 0.6 : 1)); const i = (y * W + x) * 4; px[i] = c[0]; px[i+1] = c[1]; px[i+2] = c[2]; }
writePNG('maptest.png', px, W, H, 1);
