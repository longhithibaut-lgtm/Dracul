import Phaser from 'phaser';
import { T } from './tuning.ts';

// Heads-up display, top-left and wordless like Hyper Light Drifter's: a banner with a bat that dims while the dash
// recharges, one blood drop per health point, and under them three dash pips that refill over the cooldown.
// Gameplay pushes values in; it never reads from here. Redrawn every frame into one Graphics, in native pixels.
export type Hud = { health(current: number, max: number): void; dashReady(ready: boolean): void };

// "Nuit de sang" palette (docs/art.md).
const C = {
  void: 0x0b0710, night: 0x1c1029, dusk: 0x2e1838, stoneMid: 0x5a4468,
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
// E rim, v hollow, r dried blood.
const EMPTY = [
  '...E...',
  '..EvE..',
  '.EvvvE.',
  '.EvvvE.',
  'EvvvvvE',
  'EvvvvvE',
  'EvvvvvE',
  '.ErrrE.',
  '..EEE..',
];

const X0 = 8, Y0 = 6; // top-left corner of the HUD
const PITCH = 8; // drop spacing: 7 px drop + 1 px gap
const PIPS = 3, PIP_GAP = 3; // dash pips under the drops
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

    const row = max * PITCH - 1; // width of the drop row, shared by the pip row
    const lintel = row + 24; // banner, then the tile with 2 px padding
    g.fillStyle(C.bone).fillRect(x0, y0, lintel, 1);
    g.fillStyle(C.boneDim).fillRect(x0, y0 + 1, lintel, 1);
    grid(x0 - 3, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });
    grid(x0 + lintel, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });

    // Dash: the bat dims and the pips empty when it is used, then refill one by one over the cooldown.
    const charge = ready ? 1 : Math.min(1, (now - spentAt) / (T.dash.durationMs + T.dash.cooldownMs));
    const pop = now - readyAt < 90;
    grid(x0, y0 + 2, BANNER, { B: C.blood[0], L: C.blood[1], r: C.dusk, d: C.night });
    grid(x0 + 2, y0 + 7, BAT, pop ? { X: C.moon, x: C.moon } : ready ? { X: C.bone, x: C.boneDim } : { X: C.night, x: C.night });
    // Droplets of a burst drop fall behind the tile and drip out below it, never over the readout.
    shards = shards.filter((s) => now - s.t0 < s.life);
    for (const s of shards) {
      const t = (now - s.t0) / 1000;
      if (t >= 0) g.fillStyle(s.c).fillRect(Math.round(s.x + s.vx * t), Math.round(s.y + s.vy * t + 300 * t * t), 1, s.size);
    }
    g.fillStyle(C.night, 0.9).fillRect(x0 + 20, y0 + 3, lintel - 20, 17);
    g.fillStyle(C.dusk).fillRect(x0 + 20, y0 + 3, lintel - 20, 1);

    const pw = Math.floor((row - (PIPS - 1) * PIP_GAP) / PIPS);
    for (let k = 0; k < PIPS; k++) {
      const x = x0 + 22 + k * (pw + PIP_GAP), y = y0 + 15, p = Math.min(1, Math.max(0, charge * PIPS - k));
      // Chamfered 4-row pip: solid bone when charged, a hollow plum outline when spent.
      g.fillStyle(p < 1 ? C.stoneMid : pop ? C.moon : C.bone).fillRect(x + 1, y, pw - 2, 1).fillRect(x, y + 1, pw, 1);
      g.fillStyle(p < 1 ? C.stoneMid : pop ? C.moon : C.boneDim).fillRect(x, y + 2, pw, 1).fillRect(x + 1, y + 3, pw - 2, 1);
      if (p < 1) g.fillStyle(C.void).fillRect(x + 1, y + 1, pw - 2, 2).fillStyle(C.boneDim).fillRect(x + 1, y + 1, Math.round((pw - 2) * p), 2);
    }

    for (let i = 0; i < max; i++) {
      const x = x0 + 22 + i * PITCH, y = y0 + 5;
      const t = now - (changedAt[i] ?? -1e9);
      if (i >= hp) {
        if (t < FLASH_MS) grid(x, y, DROP, solid(C.bone));
        else if (t < BURST_MS) {
          grid(x, y, DROP, blood);
          grid(x, y, CRACK, { c: C.void });
        } else grid(x, y, EMPTY, { E: t < 300 ? C.blood[2] : t < 450 ? C.blood[1] : C.stoneMid, v: C.void, r: C.blood[0] });
      } else if (t < 0) {
        grid(x, y, EMPTY, { E: C.stoneMid, v: C.void, r: C.blood[0] });
      } else if (t < FILL_MS) {
        grid(x, y, EMPTY, { E: C.stoneMid, v: C.void });
        grid(x, y, DROP, blood, Math.floor(DROP.length * (1 - t / FILL_MS)));
      } else if (t < FILL_MS + 60) {
        grid(x, y, DROP, solid(C.bone));
      } else {
        // Last drop left: a faint double heartbeat.
        const beat = now % 1100;
        grid(x, y, DROP, hp === 1 && (beat < 70 || (beat > 190 && beat < 260)) ? { ...blood, R: C.glow, H: C.bone } : blood);
      }
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
            x: x + 1 + (k % 5), y: y + 6 + (k % 3), vx: (Math.random() - 0.5) * 30, vy: Math.random() * 30,
            c: [C.blood[2], C.blood[1], C.glow][k % 3], t0: now + BURST_MS, life: 450 + Math.random() * 350, size: k < 4 ? 2 : 1,
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
