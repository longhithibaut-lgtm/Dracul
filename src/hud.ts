import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Font from './font.ts';
import { ICONS, kind, shelf, type GiftId } from './gifts.ts';
import { edgePip } from './logic.ts';

// Heads-up display, top-left and wordless like Hyper Light Drifter's: a banner with a bat that dims while the dash
// recharges, one blood drop per health point, under them three dash pips that refill over the cooldown, beside them
// the glyph's blood seal that fills back up over its cooldown, and a shelf with the icon of each gift taken (its slot,
// or talent): slot gifts first, in slot order.
// Also the title card of a new room ("Salle 2"), centred, and a pip on the screen's edge pointing at each enemy off it.
// It sits in the screen's safe area (clear of a phone's notch or rounded corners) and follows the view's size.
// Gameplay pushes values in; it never reads from here. Redrawn every frame into one Graphics, in native pixels.
export type Hud = {
  health(current: number, max: number): void;
  dashReady(ready: boolean, readyAt: number): void; // readyAt: when a spent dash is back
  glyphReady(ready: boolean, readyAt: number): void; // the same for the glyph
  gifts(held: readonly GiftId[]): void;
  title(text: string): void;
  threats(enemies: { x: number; y: number; aim: boolean }[]): void; // on the screen's coordinates; off it, a pip points at each
};

// "Nuit de sang" palette (docs/art.md), plus the Rat house's silver and grey for the gift icons.
const C = {
  void: 0x0b0710, night: 0x1c1029, dusk: 0x2e1838, stoneMid: 0x5a4468,
  bone: 0xe8dcc8, boneDim: 0xb7a58f, blood: [0x5c0a1c, 0xa3122f, 0xe0284a], glow: 0xff4f8b, moon: 0x8ff0dc,
  silver: 0xd4cdd2, grey: 0x948a91,
};
const ICON = { S: C.silver, s: C.grey, r: C.blood[2], d: C.blood[1] }, POP = { S: C.bone, s: C.bone, r: C.bone, d: C.bone };

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

// The glyph's seal: a blood disc with the sigil's fang triangle cut in it. L lit rim, R rim, D shaded rim, F disc, V the
// triangle (bone once the glyph is ready).
const SEAL = [
  '....LLR....',
  '..LLFFFRR..',
  '.LFFFFFFFD.',
  '.LVVVVVVVD.',
  'LFFVFFFVFFD',
  'LFFFVFVFFFD',
  'RFFFFVFFFFD',
  '.RFFFFFFFD.',
  '.DFFFFFFFD.',
  '..DDFFFDD..',
  '....DDD....',
];
const SEAL_W = 11 + 3; // with its gap from the drops

const X0 = 8, Y0 = 6; // top-left corner of the HUD, in from the safe area's
const PITCH = 8; // drop spacing: 7 px drop + 1 px gap
const PIPS = 3, PIP_GAP = 3; // dash pips under the drops
const FLASH_MS = 60; // a lost drop flashes white, cracks, then bursts
const BURST_MS = 140;
const FILL_MS = 120; // a regained drop fills from the bottom
// An off-screen enemy's pip, tip outward: rows of a triangle from the tip (a straight way), or a corner (a diagonal).
const PIP = 4;

// The safe area's insets in CSS pixels (env(safe-area-inset-*), 0 off phones), read off a hidden probe.
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 0 env(safe-area-inset-left,0px)';
document.body.append(probe);

type Shard = { x: number; y: number; vx: number; vy: number; c: number; t0: number; life: number; size: number };

export function create(scene: Phaser.Scene): Hud {
  const g = scene.add.graphics();

  // Own camera, so the HUD never shakes, flashes or zooms with the world camera.
  const cam = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height); // resized with the view by Phaser
  cam.ignore(scene.children.list.filter((o) => o !== g));
  scene.cameras.main.ignore(g);
  const ignoreNew = (o: Phaser.GameObjects.GameObject) => cam.ignore(o);

  let hp = 0, max = 0, hitAt = -1e9;
  const changedAt: number[] = []; // per drop: when it was last lost or regained
  let shards: Shard[] = [];
  let ready = true, spentAt = -1e9, readyAt = -1e9, dueAt = 0;
  const glyph = { ready: true, spentAt: -1e9, readyAt: -1e9, dueAt: 0 };
  // gifts: undefined until first set; fresh: the one just taken.
  let gifts: GiftId[] | undefined, fresh: GiftId | undefined, giftAt = -1e9, title = '', titleAt = -1e9;
  let threats: { x: number; y: number; aim: boolean }[] = [];
  // The corner, in from the safe area (native px per CSS px: the scale manager's displayScale).
  const corner = () => {
    const css = getComputedStyle(probe), k = scene.scale.displayScale.x;
    return { x: X0 + Math.ceil(parseFloat(css.paddingLeft) * k || 0), y: Y0 + Math.ceil(parseFloat(css.paddingTop) * k || 0) };
  };
  let at = corner();
  const place = () => (at = corner());

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
    const x0 = at.x + (sinceHit < 160 ? [1, -1, 1, -1][Math.floor(sinceHit / 40)] : 0), y0 = at.y;

    const row = max * PITCH - 1; // width of the drop row, shared by the pip row
    const lintel = row + 24 + SEAL_W; // banner, then the tile (drops, the seal) with 2 px padding
    g.fillStyle(C.bone).fillRect(x0, y0, lintel, 1);
    g.fillStyle(C.boneDim).fillRect(x0, y0 + 1, lintel, 1);
    grid(x0 - 3, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });
    grid(x0 + lintel, y0 - 1, FINIAL, { O: C.bone, o: C.boneDim });

    // Dash: the bat dims and the pips empty when it is used, then refill one by one over the cooldown.
    const charge = ready ? 1 : Math.min(1, (now - spentAt) / Math.max(1, dueAt - spentAt));
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

    // Glyph: the seal empties when cast and fills back with blood from the bottom over the cooldown, flashes bone when
    // it is back, then shows its triangle in bone.
    {
      const x = x0 + 22 + row + 3, y = y0 + 6, k = glyph.ready ? 1 : Math.min(1, (now - glyph.spentAt) / Math.max(1, glyph.dueAt - glyph.spentAt));
      const lit = { L: C.glow, R: C.blood[2], D: C.blood[1], F: C.blood[0], V: glyph.ready ? C.bone : C.dusk };
      if (now - glyph.readyAt < 90) grid(x, y, SEAL, { L: C.bone, R: C.bone, D: C.bone, F: C.bone, V: C.bone });
      else if (k >= 1) grid(x, y, SEAL, lit);
      else {
        grid(x, y, SEAL, { L: C.stoneMid, R: C.stoneMid, D: C.stoneMid, F: C.void, V: C.dusk });
        grid(x, y, SEAL, lit, Math.round(SEAL.length * (1 - k)));
      }
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

    // Gifts taken: a shelf of their icons under the tile; the newest pops white.
    if (gifts?.length) {
      const y = y0 + 22, n = gifts.length;
      g.fillStyle(C.night, 0.9).fillRect(x0 + 20, y, n * 9 + 3, 11);
      g.fillStyle(C.dusk).fillRect(x0 + 20, y, n * 9 + 3, 1);
      gifts.forEach((id, i) => grid(x0 + 22 + i * 9, y + 2, ICONS[kind(id)], id === fresh && now - giftAt < 120 ? POP : ICON));
    }

    // Title card: bone letters between two red rules, then it steps out.
    const tt = now - titleAt, out = T.run.titleMs - 200;
    if (tt < T.run.titleMs) {
      const a = tt < out ? 1 : 1 - Math.ceil((tt - out) / 67) / 3, w = Font.width(title, 2);
      const x = Math.round((scene.scale.width - w) / 2), y = Math.round(scene.scale.height / 2) - 23;
      for (const side of [-1, 1]) {
        const rx = side < 0 ? x - 46 : x + w + 8;
        g.fillStyle(C.blood[1], a).fillRect(rx, y + 5, 38, 1);
        g.fillStyle(C.silver, a).fillRect(side < 0 ? rx - 2 : rx + 38, y + 4, 2, 3);
      }
      for (const [c, d] of [[C.void, 1], [C.bone, 0]]) {
        g.fillStyle(c, a);
        Font.draw(title, x + d, y + d, (px, py) => g.fillRect(px, py, 1, 1), 2);
      }
    }

    // Enemies off the screen: a small triangle on its edge points at each, blood red; one aiming its crossbow blinks
    // rose and white. Outlined in the void, so it reads on any floor.
    for (const e of threats) {
      const p = edgePip(e.x, e.y, scene.scale.width, scene.scale.height, PIP + 2);
      if (!p) continue;
      const tx = p.x + p.dx * PIP, ty = p.y + p.dy * PIP, cells: [number, number][] = [];
      for (let a = 0; a <= PIP; a++)
        for (let c = -a; c <= a; c++)
          if (!p.dx || !p.dy) cells.push(p.dx ? [tx - p.dx * a, ty + c] : [tx + c, ty - p.dy * a]);
          else if (c >= 0 && a - c <= PIP - 1) cells.push([tx - p.dx * c, ty - p.dy * (a - c)]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const [x, y] of cells) g.fillStyle(C.void).fillRect(x + dx, y + dy, 1, 1);
      g.fillStyle(e.aim ? (Math.floor(now / 90) % 2 ? C.glow : C.bone) : C.blood[2]);
      for (const [x, y] of cells) g.fillRect(x, y, 1, 1);
    }
  };

  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, ignoreNew);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  scene.scale.on(Phaser.Scale.Events.RESIZE, place);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, place);
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
        const x = at.x + 22 + i * PITCH, y = at.y + 5;
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
    dashReady(r, at) {
      dueAt = at;
      if (r === ready) return;
      ready = r;
      if (r) readyAt = scene.time.now;
      else spentAt = scene.time.now;
    },
    glyphReady(r, at) {
      glyph.dueAt = at;
      if (r === glyph.ready) return;
      glyph.ready = r;
      if (r) glyph.readyAt = scene.time.now;
      else glyph.spentAt = scene.time.now;
    },
    gifts(held) {
      if (gifts && (fresh = held.find((g) => !gifts!.includes(g)))) giftAt = scene.time.now; // not the ones a room starts with
      gifts = shelf(held);
    },
    title(t) {
      title = t;
      titleAt = scene.time.now;
    },
    threats(list) {
      threats = list;
    },
  };
}
