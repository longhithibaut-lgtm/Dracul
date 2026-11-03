import Phaser from 'phaser';
import * as Save from './save.ts';
import * as Rats from './rats.ts';
import * as Loot from './loot.ts';
import * as Sfx from './sfx.ts';
import * as Enemy from './enemy.ts';
import * as Lantern from './lantern.ts';
import { prelit } from './dark.ts';
import type { Hud } from './hud.ts';
import type { Pose } from './ronge.ts';
import { ZONES } from './world.ts';
import { after, leaves, place, readMs, CRYPT, LINES, NECROPOLIS, REFUGE, SPOILS, type Beat, type Event } from './prologue.data.ts';
import type { Run } from './RoomScene.ts';

// The prologue (docs/histoire-proposition.md §2), played in the places that exist: the crypt (layout 'hall'), the
// necropolis from the crypt's door to the refuge's stairs, the refuge dark. RoomScene runs the game as ever and asks
// this director at a few hooks (update, a kill, a pickup, the basin, an exit, a death); the script is prologue.data.ts.
// The save begins at its end (Save.data.prologue).

type Sprite = Phaser.Physics.Arcade.Sprite;
type P = { x: number; y: number };
/** What the director may ask of the room. */
export type Ctx = {
  scene: Phaser.Scene; hero: Sprite; hud: Hud; layout: string; bounds: Phaser.Geom.Rectangle;
  cut(on: boolean): void; // a scene plays: he stands, the world waits
  place(p: P, kind: 'ghoul' | 'crossbow'): Sprite; // a foe at its post, unaware
  lantern(p: P): void; // an Order's lantern planted, lit
  dashing(): boolean; // in his mist
  hurt(amount: number, from: P): boolean; // RoomScene.damageHero
  steps(to: P): number[]; cellOf(p: P): number; // the walk grid (RoomScene.stepsTo, cellOf)
};

/** The run that starts the prologue at `beat` (a new game: 'noir'; after a death: prologue.data.ts reform()). */
export const run = (beat: Beat): Run => ({ layout: 'hall', at: beat === 'noir' || beat === 'pieu' ? CRYPT.lie : CRYPT.rise, prologue: beat });

/** « Nouvelle partie »: a new save, the prologue from the black. */
export function startPrologue(game: Phaser.Game) {
  Save.reset();
  for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'room') s.scene.stop();
  game.scene.start('room', run('noir'));
}

/** Played or passed: the save's real start, at the refuge's coffin. */
function finish(scene: Phaser.Scene) {
  Save.data.prologue = true;
  Save.store();
  scene.scene.restart({} satisfies Run);
}

export type Director = ReturnType<typeof play>;

/** Black over the world, under the HUD's words (on the HUD's own camera: a camera's fade leaves the room's glows lit). */
function curtain(scene: Phaser.Scene, alpha: number) {
  const r = scene.add.rectangle(0, 0, 8000, 8000, 0x000000).setOrigin(0).setScrollFactor(0).setDepth(-1).setAlpha(alpha);
  const hud = scene.cameras.cameras.find((k) => k !== scene.cameras.main && k.name !== 'dark-over');
  if (hud) r.cameraFilter &= ~hud.id; // (dark.ts keeps what the HUD's camera draws off the world's)
  return r;
}

// A broken wax seal (r dark, R red, h its sheen), its two halves apart.
const SEAL = ['.rr...rr.', 'rRhr.rRRr', 'rRRr.rRRr', '.rr...rr.'], WAX = { r: 0x4e080e, R: 0x8a1a1a, h: 0xc04030 };
/** « SANS MAISON. PAS DE CIRE. » in the Order's chalk: upright capitals, rubbed thin here and there. */
function chalk(scene: Phaser.Scene) {
  const key = 'prologue-chalk';
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 120, 34)!, g = t.context;
  g.font = 'bold 13px serif';
  g.textAlign = 'center';
  g.fillStyle = '#d8d0bc';
  LINES.chalk.forEach((l, i) => g.fillText(l, 60, 13 + i * 16));
  const d = g.getImageData(0, 0, 120, 34);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 && Math.random() > 0.22 ? 210 : 0; // hard pixels, gaps
  g.putImageData(d, 0, 0);
  t.refresh();
  return key;
}

/** Plays the prologue from `beat` in the room `c` describes. */
export function play(c: Ctx, beat: Beat) {
  const { scene, hero, hud } = c, said = new Set<string>(), timers: Phaser.Time.TimerEvent[] = [];
  const S = {
    beat, posed: false, ronge: 'beast' as Pose | undefined, // posed: the hero drawn here (lying, rising), not by Hero.show; ronge: his pose (none: as ever)
    lights: [] as { x: number; y: number; lit: boolean; h: number; I: number }[], // the ray's, for dark.ts
  };
  const at = (ms: number, fn: () => void) => timers.push(scene.time.delayedCall(ms, fn));
  const move = (e: Event) => (S.beat = after(S.beat, e));
  const dist = (a: P, b: P) => Phaser.Math.Distance.BetweenPoints(a, b);
  const feet = () => hero.body!.center;
  /** Lines of the voice one after the other at the top (`mid`: cards in the middle); returns when the last is gone. */
  const voice = (lines: readonly string[], mid = false, from = 0) => {
    let t = from;
    for (const l of lines) { at(t, () => hud.title(l, { ms: readMs(l), mid })); t += readMs(l) + 150; }
    return t;
  };
  const once = (key: string, fn: () => void) => { if (!said.has(key)) { said.add(key); fn(); } };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timers.forEach((t) => t.remove()));

  // Échap twice: the prologue passed (for those who played it before).
  let escAt = -1e9;
  scene.input.keyboard!.on('keydown-ESC', () => {
    if (scene.time.now - escAt < 2500) return finish(scene);
    escAt = scene.time.now;
    hud.title(LINES.skip, { ms: 2500 });
  });
  let fDown = () => {}; // what F does now
  scene.input.keyboard!.on('keydown-F', (ev: KeyboardEvent) => !ev.repeat && fDown());

  // ---- the guide rat: it runs on its walk grid to a point, waits for him when he lags, goes on when he comes ----
  type Guide = { s: Phaser.GameObjects.Sprite; way: P[]; then?: () => void; heading: number; alone?: boolean }; // alone: it goes, waiting for no one
  let rat: Guide | undefined;
  const ratAt = (p: P) => { rat?.s.destroy(); rat = { s: Rats.rat(scene, p.x, p.y), way: [], heading: 0 }; Rats.motes(scene, p.x, p.y - 2, 5, [0x948a91, 0xd4cdd2], p.y, 4, 5); };
  const ratTo = (to: P, then?: () => void, alone = false) => {
    if (!rat) return;
    const b = c.bounds, steps = c.steps(to), cols = Math.ceil(b.width / 8), way: P[] = [];
    let k = c.cellOf(rat.s);
    for (let n = 0; n < 2000 && steps[k] > 0 && steps[k] < Infinity; n++) {
      const x = k % cols, next = [k - cols, k + cols, k - 1, k + 1, k - cols - 1, k - cols + 1, k + cols - 1, k + cols + 1]
        .filter((m) => Math.abs((m % cols) - x) <= 1 && steps[m] < steps[k]).sort((m, o) => steps[m] - steps[o])[0];
      if (next === undefined) break;
      way.push({ x: b.x + (next % cols) * 8 + 4, y: b.y + Math.floor(next / cols) * 8 + 4 });
      k = next;
    }
    rat.way = [...way, to];
    [rat.then, rat.alone] = [then, alone];
  };
  const stepRat = (time: number, delta: number) => {
    if (!rat) return;
    const r = rat.s, d = dist(r, feet()), next = rat.way[0];
    const lag = !rat.alone && (d > 80 || (d > 50 && r.getData('waiting'))); // it waits till he comes within 50 px
    r.setData('waiting', lag);
    if (!next || lag) {
      if (!next && rat.then) { const t = rat.then; rat.then = undefined; t(); }
      if (!rat?.s.active) return;
      const look = Phaser.Math.Angle.BetweenPoints(r, feet()); // stopped, it turns to him
      Rats.scurry(r, look, 0);
      return void (r.getData('high') && r.setDepth(r.getData('high'))); // up on a lid
    }
    const step = (75 * delta) / 1000, a = Phaser.Math.Angle.BetweenPoints(r, next);
    if (dist(r, next) <= step) { r.setPosition(next.x, next.y); rat.way.shift(); } else r.setPosition(r.x + Math.cos(a) * step, r.y + Math.sin(a) * step);
    Rats.scurry(r, a, time);
  };
  const ratGone = () => { if (rat) Rats.vanish(scene, rat.s); rat = undefined; };

  // ---- the places ----
  let ghoul: Sprite | undefined, guard: Sprite | undefined, guardDead = false, lying: (() => void) | undefined;
  const update: ((time: number, delta: number) => void)[] = [];
  /** `o`'s alpha to `to` over `ms` of the game's clock (a tween runs on the wall clock). */
  const fade = (o: Phaser.GameObjects.Rectangle, to: number, ms: number) => { const from = o.alpha, t0 = scene.time.now; update.push((time) => void (o.active && o.setAlpha(from + (to - from) * Math.min(1, (time - t0) / ms)))); };

  if (place(beat) === 'hall') {
    // Chalk on his sarcophagus' flank; the three others emptied, their red wax seals broken, their chains cut.
    scene.add.image(CRYPT.lie.x, CRYPT.lie.y + 15, chalk(scene)).setScale(0.5).setDepth(CRYPT.lie.y + 12).setAngle(-3);
    const g = scene.add.graphics();
    for (const s of CRYPT.seals) { // a disc of red wax cracked in two, the halves apart; a cut chain hanging either side
      g.setDepth(s.y + 14);
      SEAL.forEach((row, j) => [...row].forEach((k, i) => k !== '.' && g.fillStyle(WAX[k as keyof typeof WAX]).fillRect(s.x - 4 + i, s.y + 8 + j, 1, 1)));
      for (let i = 0; i < 6; i++) {
        g.fillStyle(i % 2 ? 0x3a3632 : 0x77716a).fillRect(s.x - 17 + i * 2, s.y + 9 + Math.round(i * 0.6), 2, i % 2 ? 1 : 2);
        g.fillStyle(i % 2 ? 0x3a3632 : 0x77716a).fillRect(s.x + 6 + i * 2, s.y + 12 - Math.round(i * 0.2) + (i > 3 ? i - 3 : 0), 2, i % 2 ? 1 : 2);
      }
    }
    // The Dawn through a crack in the vault: a sheet of gold across the floor (unlit, over the world), its motes.
    const [y0, y1] = CRYPT.ray, b = c.bounds, ray = scene.add.graphics().setDepth(7981).setBlendMode(Phaser.BlendModes.ADD);
    S.lights = [b.left + b.width * 0.25, b.left + b.width * 0.75].map((x) => ({ x, y: (y0 + y1) / 2, lit: true, h: 30, I: 2.6 }));
    update.push((time) => {
      ray.clear();
      const flick = 0.9 + 0.1 * Math.sin(time / 230);
      for (let k = 0; k < 6; k++) ray.fillStyle(0xe8b860, (0.05 + k * 0.012) * flick).fillRect(b.left, y0 + k * 2, b.width, y1 - y0 - k * 4);
      for (let k = 0; k < 10; k++) ray.fillStyle(0xd8a040, 0.022 * (10 - k) * flick).fillRect(b.left, y0 - 8 * (k + 1), b.width, 8); // the shaft, fading up
      if (Math.random() < 0.3) Rats.motes(scene, Phaser.Math.Between(b.left, b.right), Phaser.Math.Between(y0, y1), 1, [0xffd890, 0xe8a040], 7982, 2, 18);
    });
    // In it on foot, he burns and is thrown back the way he came; in his mist he goes through (ending it inside, on).
    let side = feet().y < y0 ? -1 : 1, misted = false, burntAt = -1e9;
    update.push((time) => {
      const f = feet(), inside = f.y > y0 - 2 && f.y < y1 + 2;
      if (!inside) return void ([side, misted] = [f.y < y0 ? -1 : 1, false]);
      if (c.dashing()) return void (misted = true);
      const to = misted ? -side : side, edge = to < 0 ? y0 - 6 : y1 + 8;
      hero.body!.reset(f.x, edge - (hero.body!.center.y - hero.y)); // back out (or on, out of his mist)
      if (misted) return void ([side, misted] = [to, false]);
      if (time - burntAt > 600) {
        burntAt = time;
        c.hurt(5, { x: f.x, y: to < 0 ? y1 + 20 : y0 - 20 });
        Lantern.sizzle(scene, hero, true);
        Sfx.play(scene, 'burn');
        once('light', () => hud.title(LINES.light, { ms: readMs(LINES.light) }));
      }
    });

    if (beat === 'noir' || beat === 'pieu') { // lying under the stake, the rat gnawing it
      S.posed = true;
      c.cut(true);
      hero.body!.checkCollision.none = true;
      hero.setFrame('down-blink1').setAngle(-90).setFlipX(false).setDepth(CRYPT.lie.y);
      const stake = scene.add.graphics().setDepth(CRYPT.lie.y + 3), sx = CRYPT.lie.x + 2, sy = CRYPT.lie.y - 2;
      stake.fillStyle(0x1a1009).fillRect(sx - 1, sy - 13, 4, 13).fillStyle(0x4a3220).fillRect(sx, sy - 13, 1, 10).fillStyle(0x6e5a44).fillRect(sx - 1, sy - 14, 1, 2).fillRect(sx + 1, sy - 15, 1, 2).fillRect(sx + 2, sy - 14, 1, 1); // black, soft, splintered
      ratAt({ x: sx + 7, y: sy + 2 });
      rat!.s.setDepth(CRYPT.lie.y + 4);
      const gnaw = (time: number) => { if (S.beat === 'pieu' || S.beat === 'noir') { rat!.s.setFrame(String(Math.floor(time / 110) % 2)).setFlipX(true).setDepth(CRYPT.lie.y + 4); if (time % 900 < 20) Sfx.play(scene, 'chew', 0.2); } };
      update.push(gnaw);
      let label: Loot.Label | undefined;
      lying = () => { // F: he tears the stake out, it crumbles; he rises (three images: on his hands, on his knees, standing)
        if (S.beat !== 'pieu') return;
        move('stake');
        label?.destroy();
        Rats.motes(scene, sx, sy - 5, 16, [0x24170e, 0x3d2a1a, 0x5a4a3a], CRYPT.lie.y + 4, 6, 12);
        stake.destroy();
        Sfx.play(scene, 'crack', 200);
        rat!.s.setPosition(CRYPT.lie.x + 20, CRYPT.rise.y + 2); // it leaps off
        const r = CRYPT.rise;
        [[0, 'down-death-2', 160], [160, 'down-death-1', 320], [340, 'down-death-0', 520], [560, 'down-idle0', 0]].forEach(([t, f, ms]) => at(t as number, () => {
          hero.setAngle(0).setFrame(f as string);
          hero.body!.reset(r.x, r.y);
          if (!ms) {
            [S.posed, hero.body!.checkCollision.none] = [false, false];
            hero.setDepth(hero.y);
          }
        }));
        const end = voice(LINES.stake, false, 700);
        at(Math.min(end, 2600), () => { c.cut(false); ratTo(CRYPT.way[0], () => ratTo(CRYPT.way[1], () => ratTo(CRYPT.way[2]))); });
      };
      if (beat === 'noir') {
        const black = curtain(scene, 1);
        const end = voice(LINES.noir, true, 600);
        at(end, () => {
          move('captions');
          fade(black, 0, 2400);
          at(2600, () => { label = Loot.label(scene, sx, sy - 14, 'le pieu (F)'); label.near(true); });
        });
      } else at(500, () => { label = Loot.label(scene, sx, sy - 14, 'le pieu (F)'); label.near(true); });
    } else { // re-formed after a death: standing at his sarcophagus, the rat waiting by it
      ratAt({ x: CRYPT.rise.x + 24, y: CRYPT.rise.y + 4 });
      if (beat === 'rat') ratTo(CRYPT.way[0], () => ratTo(CRYPT.way[1], () => ratTo(CRYPT.way[2])));
      else ratTo(CRYPT.slit);
    }
    // The ghoul at its meal (a vampire's body), back to the way in, hunched over it; until the ray, then the stairs.
    if (S.beat !== 'rai') {
      const m = CRYPT.meal;
      scene.add.image(m.x, m.y, 'hero', 'side-idle0').setScale(0.5).setAngle(96).setTint(0x6a5458).setDepth(m.y - 6).setBlendMode(prelit(scene));
      Enemy.bleed(scene, m.x, m.y, Math.PI / 2, 14, 1.6, 0.4);
      ghoul = c.place(CRYPT.ghoul, 'ghoul').setData({ feeding: true, turnAt: Infinity, facing: Phaser.Math.Angle.BetweenPoints(CRYPT.ghoul, m), spoils: SPOILS.ghoul });
    }
    update.push(() => {
      const f = feet();
      for (const s of CRYPT.seals) if (S.beat === 'rat' && dist(f, s) < 75) once('seal', () => hud.title(LINES.seal, { ms: readMs(LINES.seal) }));
      if (S.beat === 'rat' && ghoul?.active && (dist(f, ghoul) < 115 || ghoul.getData('alert'))) { // it turns from its meal, slowly
        move('ghoul');
        if (rat) { const r = rat; r.way = []; ratTo(CRYPT.hide, () => { ratGone(); }); }
        ghoul.setData({ facing: Phaser.Math.Angle.BetweenPoints(ghoul, f), turnAt: Infinity });
        at(700, () => ghoul?.active && ghoul.setData({ alert: true, seenAt: scene.time.now, feeding: false }));
      }
    });
  }

  if (place(beat) === 'necropolis') {
    const D = ZONES.necropolis.DOORS, R = D.refuge, H = D.hall, off = (o: { dx: number; dy: number }, d: P) => ({ x: d.x + o.dx, y: d.y + o.dy });
    guard = c.place(off(NECROPOLIS.guard, R), 'crossbow').setData({ facing: -Math.PI / 2, turnAt: Infinity, spoils: SPOILS.crossbow });
    c.lantern(off(NECROPOLIS.lantern, R));
    for (const o of NECROPOLIS.ghouls) c.place(off(o, H), 'ghoul');
    ratAt({ x: H.x + 10, y: H.y + 14 });
    ratTo(off(NECROPOLIS.wait, R));
    at(1400, () => hud.title(LINES.tomb, { ms: readMs(LINES.tomb) }));
  }

  if (place(beat) === 'refuge') {
    ratAt({ x: 852, y: 820 });
    ratTo({ x: 880, y: 700 });
    update.push(() => {
      const f = feet();
      if (S.beat === 'refuge' && f.y < 760) once('beast', () => { Sfx.play(scene, 'growl'); hud.say('le Rongé', LINES.beast, readMs(LINES.beast)); });
      if (S.beat !== 'cercueils') return;
      REFUGE.coffins.forEach((p, i) => dist(f, p) < 40 && once(`house${i}`, () => hud.title(LINES.houses[i], { ms: 1800 })));
      if (REFUGE.coffins.every((_, i) => said.has(`house${i}`))) once('nobles', () => {
        const end = voice(LINES.nobles, false, 1900);
        at(end - 1500, () => ratTo(REFUGE.sign, () => (rat?.s.setData('high', REFUGE.sign.y + 60), at(1600, () => { // up on the lid, sat on the sign; then gone through a crack
          ratGone();
          at(400, () => hud.say('le Rongé', LINES.ratGone, readMs(LINES.ratGone)));
          move('coffins');
          at(9000, () => S.beat === 'cercueil' && Loot.label(scene, REFUGE.mine.x, REFUGE.mine.y - 30, 'ton cercueil (F)').near(true)); // only if he lingers
        })), true));
      });
    });
    lying = () => { // F at his coffin: he lies in it, the dark, the title, the save begins
      if (S.beat !== 'cercueil' || dist(feet(), REFUGE.mine) > 34) return;
      move('lay');
      c.cut(true);
      S.posed = true;
      hero.body!.checkCollision.none = true;
      hero.body!.reset(REFUGE.bed.x, REFUGE.bed.y);
      hero.setFrame('down-blink1').setAngle(-90).setDepth(REFUGE.bed.y + 2);
      at(600, () => fade(curtain(scene, 0), 1, 1600));
      at(2400, () => hud.title(LINES.title, { ms: 4200, size: 72, mid: true }));
      at(6800, () => finish(scene));
    };
  }
  fDown = () => lying?.();

  return {
    get beat() { return S.beat; }, get posed() { return S.posed; }, get ronge() { return S.ronge; }, lights: () => S.lights,
    update(time: number, delta: number) { stepRat(time, delta); for (const u of update) u(time, delta); },
    /** A foe killed: the ghoul (the rat back, to the ray), the crossbowman. */
    killed(e: Sprite) {
      if (e === ghoul) {
        move('ghoulDead');
        at(900, () => { ratAt({ x: CRYPT.hide.x, y: CRYPT.hide.y }); ratTo(CRYPT.slit, () => { ratGone(); at(500, () => { ratAt(CRYPT.beyond); ratTo(CRYPT.stairs); }); }); });
      }
      if (e === guard) guardDead = true;
    },
    /** Blood picked up: the ghoul's dead blood; the crossbowman's, heavy (the rat on to the refuge's stairs). */
    picked() {
      if (c.layout === 'hall') once('blood', () => hud.title(LINES.blood, { ms: readMs(LINES.blood) }));
      if (c.layout === 'necropolis' && guardDead && S.beat === 'necropole') {
        move('guardDead');
        hud.title(LINES.heavy, { ms: 2200 });
        const R = ZONES.necropolis.DOORS.refuge;
        at(600, () => ratTo({ x: R.x, y: R.y + 14 }, () => at(300, ratGone)));
      }
    },
    /** At the basin: le Rongé drinks it all (nothing banked), comes to, speaks. */
    poured() {
      if (S.beat !== 'refuge') return;
      c.cut(true);
      Sfx.play(scene, 'drain');
      at(300, () => (S.ronge = 'lap')); // into the basin, his hands, his mouth
      at(1900, () => {
        S.ronge = undefined;
        let t = 600;
        for (const l of LINES.ronge) { at(t, () => hud.say('le Rongé', l, readMs(l))); t += readMs(l) + 250; }
        at(t, () => { move('poured'); c.cut(false); ratTo({ x: 840, y: 400 }); });
      });
    },
    /** The beat he leaves `exit` into, or undefined: not now (prologue.data.ts leaves()). */
    leave(exit: number): Beat | undefined {
      return leaves(S.beat, exit) ? after(S.beat, S.beat === 'rai' ? 'out' : 'up') : undefined;
    },
  };
}
