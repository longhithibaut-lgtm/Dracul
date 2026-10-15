import Phaser from 'phaser';
import { T } from './tuning.ts';

// Heads-up display, top-left and wordless like Hyper Light Drifter's: a lintel that is the dash meter, a bat emblem
// that lights up when the dash is ready, and one blood drop per health point.
// Gameplay pushes values in; it never reads from here. Redrawn every frame into one Graphics, in native pixels.
export type Hud = { health(current: number, max: number): void; dashReady(ready: boolean): void };

// "Nuit de sang" palette (docs/art.md).
const C = {
  void: 0x0b0710, night: 0x1c1029, dusk: 0x2e1838, stone: 0x3b2a4a, stoneLight: 0x8a6f8f,
  bone: 0xe8dcc8, boneDim: 0xb7a58f, blood: [0x5c0a1c, 0xa3122f, 0xe0284a], glow: 0xff4f8b, moon: 0x8ff0dc,
};

// Swallowtail banner hanging from the lintel. B cloth, L lit edge, r shaded edge, d shadow under the rod.
const BANNER = [
  'ddddddddddddddddddd',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBBBBBBBBBBBBBr',
  'LBBBBBB.....BBBBBBr',
  'LBBB...........BBBr',
  'L.................r',
];
// Knob at each end of the lintel.
const FINIAL = [
  '.O.',
  'OOo',
  'Ooo',
  '.o.',
];
// X lit, x shade.
const BAT = [
  'X.............X',
  'XXX...X.X...XXX',
  '.XXXX.XXX.XXXX.',
  '.xXXXXXXXXXXXx.',
  '..xx.xXXXx.xx..',
  '..x...xXx...x..',
  '.......x.......',
];
// H highlight, R blood, D shade, S glint.
const DROP = [
  '...H...',
  '..HRR..',
  '.HRRRR.',
  '.HRRRR.',
  'HSRRRRR',
  'RRRRRRR',
  'RRRRRRD',
  '.RRRRD.',
  '..DDD..',
];
// A drop about to burst.
const CRACK = [
  '.......',
  '...c...',
  '...c...',
  '..c....',
  '...c...',
  '...cc..',
  '....c..',
  '...c...',
  '.......',
];
// E rim, r dried blood.
const EMPTY = [
  '...E...',
  '..E.E..',
  '.E...E.',
  '.E...E.',
  'E.....E',
  'E.....E',
  'E.....E',
  '.ErrrE.',
  '..EEE..',
];

const X0 = 8, Y0 = 6; // top-left corner of the HUD
const PITCH = 8; // drop spacing: 7 px drop + 1 px gap
const FLASH_MS = 60; // a lost drop flashes white, cracks, then bursts
const BURST_MS = 140;
const FILL_MS = 120; // a regained drop fills from the bottom

type Shard = { x: number; y: number; vx: number; vy: number; c: number; t0: number; life: number; size: number };

export function create(scene: Phaser.Scene): Hud {
  const g = scene.add.graphics();

  // Own camera, so the HUD never shakes, flashes or zooms with the world camera.
  const cam = scene.cameras.add(0, 0, T.width, T.height);
  cam.ignore(scene.children.list.filter((o) => o !== g));
  scene.cameras.main.ignore(g);
  const ignoreNew = (o: Phaser.GameObjects.GameObject) => cam.ignore(o);

  let hp = 0, max = 0, hitAt = -1e9;
  const changedAt: number[] = []; // per drop: when it was last lost or regained
  let shards: Shard[] = [];
  let ready = true, spentAt = -1e9, readyAt = -1e9;

  // Draws a pixel grid, one rectangle per horizontal run, rows from `fromRow` down.
  const grid = (x: number, y: number, rows: string[], px: Record<string, number>, fromRow = 0) => {
    for (let j = fromRow; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; ) {
        let n = 1;
        while (row[i + n] === row[i]) n++;
        if (px[row[i]] !== undefined) g.fillStyle(px[row[i]]).fillRect(x + i, y + j, n, 1);
        i += n;
      }
    }
  };
  const solid = (c: number) => ({ H: c, R: c, D: c, S: c });
  const blood = { H: C.glow, R: C.blood[2], D: C.blood[1], S: C.bone };

  const draw = () => {
    const now = scene.time.now;
    g.clear();
    const sinceHit = now - hitAt;
    const x0 = X0 + (sinceHit < 160 ? [1, -1, 1, -1][Math.floor(sinceHit / 40)] : 0), y0 = Y0;

    // Lintel: drains when the dash is used and refills over its cooldown; the bat dims meanwhile.
    const charge = ready ? 1 : Math.min(1, (now - spentAt) / (T.dash.durationMs + T.dash.cooldownMs));
    const pop = now - readyAt < 90;
    const lintel = 23 + max * PITCH; // banner, then the drops tile with 2 px padding
    const fill = Math.round(lintel * charge);
    g.fillStyle(C.stone).fillRect(x0, y0, lintel, 2);
    g.fillStyle(pop ? C.moon : ready ? C.bone : C.stoneLight).fillRect(x0, y0, fill, 1);
    g.fillStyle(pop ? C.moon : ready ? C.boneDim : C.stoneLight).fillRect(x0, y0 + 1, fill, 1);
    grid(x0 - 3, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });
    grid(x0 + lintel, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });

    grid(x0, y0 + 2, BANNER, { B: C.blood[0], L: C.blood[1], r: C.dusk, d: C.night });
    grid(x0 + 2, y0 + 6, BAT, pop ? { X: C.moon, x: C.moon } : ready ? { X: C.bone, x: C.boneDim } : { X: C.stone, x: C.stone });
    g.fillStyle(C.night, 0.9).fillRect(x0 + 20, y0 + 3, lintel - 20, 13);
    g.fillStyle(C.dusk).fillRect(x0 + 20, y0 + 3, lintel - 20, 1);

    for (let i = 0; i < max; i++) {
      const x = x0 + 22 + i * PITCH, y = y0 + 5;
      const t = now - (changedAt[i] ?? -1e9);
      if (i >= hp) {
        if (t < FLASH_MS) grid(x, y, DROP, solid(C.bone));
        else if (t < BURST_MS) {
          grid(x, y, DROP, blood);
          grid(x, y, CRACK, { c: C.void });
        } else grid(x, y, EMPTY, { E: t < 300 ? C.blood[2] : t < 450 ? C.blood[1] : C.stone, r: C.blood[0] });
      } else if (t < 0) {
        grid(x, y, EMPTY, { E: C.stone, r: C.blood[0] });
      } else if (t < FILL_MS) {
        grid(x, y, EMPTY, { E: C.stone });
        grid(x, y, DROP, blood, Math.floor(DROP.length * (1 - t / FILL_MS)));
      } else if (t < FILL_MS + 60) {
        grid(x, y, DROP, solid(C.bone));
      } else {
        // Last drop left: a faint double heartbeat.
        const beat = now % 1100;
        grid(x, y, DROP, hp === 1 && (beat < 70 || (beat > 190 && beat < 260)) ? { ...blood, R: C.glow, H: C.bone } : blood);
      }
    }

    shards = shards.filter((s) => now - s.t0 < s.life);
    for (const s of shards) {
      const t = (now - s.t0) / 1000;
      if (t >= 0) g.fillStyle(s.c).fillRect(Math.round(s.x + s.vx * t), Math.round(s.y + s.vy * t + 300 * t * t), s.size, s.size);
    }
  };

  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreNew);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreNew);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw);
  });

  return {
    health(current, m) {
      const now = scene.time.now;
      current = Math.max(0, current);
      max = m;
      for (let i = current; i < hp; i++) {
        changedAt[i] = now;
        hitAt = now;
        const x = X0 + 22 + i * PITCH, y = Y0 + 5;
        for (let k = 0; k < 9; k++) {
          shards.push({
            x: x + 1 + (k % 5), y: y + 2 + (k % 6), vx: -20 + Math.random() * 80, vy: -40 - Math.random() * 70,
            c: [C.blood[2], C.blood[1], C.glow][k % 3], t0: now + BURST_MS, life: 350 + Math.random() * 300, size: k < 3 ? 2 : 1,
          });
        }
      }
      // Regained drops fill in one after another (also the intro when a run starts).
      for (let i = hp; i < current; i++) changedAt[i] = now + (i - hp) * 60;
      hp = current;
    },
    dashReady(r) {
      if (r === ready) return;
      ready = r;
      if (r) readyAt = scene.time.now;
      else spentAt = scene.time.now;
    },
  };
}
