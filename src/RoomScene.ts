import Phaser from 'phaser';
import { T } from './tuning.ts';
import { aimAt, alertness, biteTarget, burnsAfter, carry, dashStopsAt, dashStrikes, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, onLine, pickSpot, placeGroups, rayDistance, scent, stepsFrom, swarmUnlocked, walkCells, wound } from './logic.ts';
import * as Hero from './hero.ts';
import * as Enemy from './enemy.ts';
import * as Crossbow from './crossbow.ts';
import * as Foes from './foes.ts';
import * as Room from './room.ts';
import * as Fx from './fx.ts';
import * as Hud from './hud.ts';
import * as Sfx from './sfx.ts';
import * as Lantern from './lantern.ts';
import * as Glyph from './glyph.ts';
import * as Rats from './rats.ts';
import * as Training from './training.ts';
import * as Dark from './dark.ts';
import * as Touch from './touch.ts';
import * as Refuge from './refuge.ts';
import * as Loot from './loot.ts';
import * as Save from './save.ts';
import * as Shop from './shop.ts';
import * as Ronge from './ronge.ts';
import * as Zone from './zone.ts';
import * as Nec from './necropolis.data.ts';
import { WORLD, expedition, galleryOpen, go, homeward, loose, parents, ringAt, wayBack, type Expedition, type Place, type RoomState } from './world.ts';
import { value, type GiftId } from './gifts.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;
/** What an expedition carries from room to room, through scene.restart(data); {} is the refuge, where the game starts
 *  and the hero re-forms after a death (`lost`: the blood he died with); its stairs start an expedition in the crypt.
 *  exp: the expedition under way (its rooms as he left them, the way back), ended back at the refuge; carried: the
 *  blood in his bag; entry: where he comes in, -1 up a room's stairs, i down its exit i (the refuge: 0, up its stairs),
 *  none at the room's start; hounds: the hp of the hounds hunting him through the exit. In the training room: gifts and
 *  their ranks (0 commun, 1 rare, 2 épique; none: commun). */
export type Run = {
  layout?: Room.LayoutId; health?: number; carried?: number; exp?: Expedition; entry?: number; hounds?: number[]; lost?: number;
  gifts?: GiftId[]; ranks?: Ranks; training?: boolean;
};
type Ranks = Partial<Record<GiftId, number>>;
type Rat = { s: Phaser.GameObjects.Sprite; heading: number; phase: number; until: number; from?: 'dash' | 'jet'; dmg: number; bites: number; next: number; prey?: Sprite };
// A room: the hero walks in (up its stairs, or down from one of its exits), plays, and walks out by any exit when he
// pleases: deeper up through its open portcullises, back down its stairs.
type Phase = 'enter' | 'play' | 'leave';
type Placed = { hp?: number; home?: { x: number; y: number }; alert?: boolean; followed?: boolean; pack?: number };
type Blood = { x: number; y: number; blood: number };
const NAV = 8; // walk grid cell, px
type Kind = 'ghoul' | 'crossbow' | Foes.Kind;
/** A kind's hp and pace. */
const stats = (kind: string): { hp: number; speed: number } => (kind === 'ghoul' ? T.enemy : T[kind as Exclude<Kind, 'ghoul'>]);

// Gameplay only: movement, combat, enemy AI, the expedition. Every visual decision lives in the modules above.
export class RoomScene extends Phaser.Scene {
  health: number = T.hero.maxHealth;
  hero!: Sprite;
  enemies!: Phaser.Physics.Arcade.Group;
  bolts!: Phaser.Physics.Arcade.Group;
  shards!: Phaser.Physics.Arcade.Group; // Le Tir in flight: bodies on the floor, drawn by Fx.shard

  private room!: Room.Room;
  private layout: Room.LayoutId = 'hall';
  // Walking round the pits: a grid of NAV px cells over the floor, open where a body fits; steps to the hero's cell.
  navOpen: boolean[] = [];
  private navCols = 0;
  private navFrom = -1;
  private nav: number[] = [];
  private pitBoxes: { x: number; y: number; width: number; height: number }[] = [];
  private hud!: Hud.Hud;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing = Math.PI / 2;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private slashReadyAt = 0;
  private slashUntil = 0;
  private lastSlashAt = -1e9;
  private combo = 0;
  private shotReadyAt = 0;
  private shotUntil = 0; // the throw: he moves at half speed, facing it
  private invulnUntil = 0;
  private hurtAt = -1e9;
  private shoveUntil = 0; // thrown by a hound's leap: he goes along `shove` until then
  private shove = new Phaser.Math.Vector2();
  private dazedUntil = 0; // stunned by a bell's ring: no move, no dash, no blow until then
  private dashPressedAt = -1e9;
  private queued?: { act: () => boolean; until: number }; // the input buffer, see press()
  private dead = false;
  private lanterns: Lantern.Lantern[] = [];
  private litMs = 0; // time the hero has stood in holy light, back to 0 when he steps out
  private biteAt = -1e9;
  private biteReadyAt = 0;
  private prey?: Sprite; // the human the hero is latched onto, from the snap until it dies
  private gifts: GiftId[] = [];
  private ranks: Ranks = {};
  private kills = 0; // this room's, for La curée
  private phase: Phase = 'play';
  private walk = -1; // the way he walks on his own, coming in or going out: -1 up the screen, 1 down
  private exp?: Expedition;
  private entry?: number;
  private carried = 0; // blood in his bag
  private hounds: number[] = [];
  private lost = 0;
  private drops: (Blood & { fx: Loot.Drop })[] = [];
  private caches: (Blood & { fx: Loot.Cache; label: Loot.Label })[] = [];
  private labels: { at: { x: number; y: number }; l: Loot.Label }[] = []; // where the exits lead, the basin
  private gateWords = new Map<string, { at: { x: number; y: number }; l: Loot.Label }[]>(); // a shut shortcut's, by its id
  private propBoxes: Phaser.Physics.Arcade.StaticBody[] = []; // what stops bolts (and sight)
  private passage?: { x: number; y: number }; // out of the zone's gallery: the mouth he comes out of
  private rats: Rat[] = [];
  // La Nuée: the hero a swarm until swarmUntil; when each enemy may be bitten again.
  private swarmUntil = 0;
  private swarmReadyAt = 0;
  private swarmFx?: Rats.Swarm;
  private gnawAt = new Map<Sprite, number>();
  private training = false; // the training room (key T): no expedition, enemies on demand, see training.ts
  private glyph?: Glyph.Glyph; // the blood sigil on the floor, from its cast until it has crumbled
  private glyphReadyAt = 0;
  private castUntil = 0; // the hero's cast pose
  private nestAt = Infinity; // Glyphe du nid: when the glyph arms and lets its rats out
  private ronge?: ReturnType<typeof Ronge.create>; // at the refuge, by the basin
  private counter?: Ronge.Counter; // his wares, open: the hero waits

  constructor() {
    super('room');
  }

  init(data: Run) {
    // The scene instance is reused on restart, so every field is reset here; the expedition carries on through `data`.
    this.layout = data.layout ?? 'refuge';
    this.exp = data.exp;
    this.entry = data.entry;
    this.carried = data.carried ?? 0;
    this.hounds = data.hounds ?? [];
    this.lost = data.lost ?? 0;
    this.drops = [];
    this.caches = [];
    this.labels = [];
    this.gateWords = new Map();
    this.passage = undefined;
    this.navFrom = -1;
    this.training = !!data.training;
    this.gifts = [...(data.gifts ?? [])];
    this.ranks = { ...data.ranks };
    this.kills = 0;
    this.swarmUntil = this.swarmReadyAt = 0;
    this.swarmFx = undefined;
    this.gnawAt = new Map();
    this.health = data.health ?? this.maxHealth();
    this.facing = Math.PI / 2; // start facing the camera
    this.dashUntil = this.dashReadyAt = this.slashReadyAt = this.slashUntil = this.shotReadyAt = this.shotUntil = this.invulnUntil = this.combo = this.shoveUntil = this.dazedUntil = 0;
    this.lastSlashAt = this.hurtAt = -1e9;
    this.dead = false;
    this.dashPressedAt = -1e9;
    this.queued = undefined;
    this.litMs = 0;
    this.lanterns = [];
    this.biteAt = -1e9;
    this.biteReadyAt = 0;
    this.prey = undefined;
    this.phase = data.entry !== undefined ? 'enter' : 'play';
    this.walk = this.layout === 'necropolis' ? 1 : this.layout === 'refuge' || data.entry === -1 ? -1 : 1; // up from stairs, down from an exit (out of the zone's doors)
    this.rats = [];
    this.glyph = undefined; // the last scene's is ended on its shutdown
    this.glyphReadyAt = this.castUntil = 0;
    this.nestAt = Infinity;
    this.ronge = this.counter = undefined;
  }

  preload() {
    Hero.preload(this);
    Room.preload(this, this.layout, this.zoneDoor() ?? { x: 0, y: 0 });
    Foes.preload(this); // the training room calls them into any room
    if (this.layout === 'refuge') Ronge.preload(this);
  }

  create() {
    // Clocks and physics outlive a restart: undo a slow motion or a pause it may have cut short.
    this.time.timeScale = this.tweens.timeScale = this.physics.world.timeScale = 1;
    this.physics.resume();
    Dark.fit(this.scale);
    this.cameras.main.setZoom(Dark.ZOOM);
    this.room = Room.build(this, this.layout);
    const b = this.room.bounds;
    this.physics.world.setBounds(b.x, b.y, b.width, b.height);
    this.walkGrid();

    // Coming in: up the stairs (the refuge's, from below), or down from exit `entry`, from above the room's top.
    const door = this.zoneDoor(), start = door && this.phase === 'enter' ? { x: door.x, y: door.y - 8 } // out of a door of the zone
      : this.phase !== 'enter' ? this.room.heroStart : this.walk < 0 ? this.room.stairs : { x: this.room.exits[this.entry!].x, y: this.room.bounds.top - 18 };
    this.hero = Hero.create(this, start.x, start.y);
    this.room.zone?.chunks.stream(new Phaser.Geom.Rectangle(start.x - 240, start.y - 135, 480, 270));
    this.frame();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.frame, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.frame, this));
    this.hero.setCollideWorldBounds(this.phase !== 'enter' || !!door);
    this.enemies = this.physics.add.group();
    // Pits stop walkers (the mist too) but not what flies: bolts and shards only stop on obstacles (boltReach).
    this.physics.add.collider(this.hero, [this.room.obstacles, this.room.pits]);
    this.physics.add.collider(this.enemies, [this.room.obstacles, this.room.pits]);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.hero, this.enemies, (_h, e) => this.hurt(e as Sprite));
    this.bolts = this.physics.add.group();
    // A bolt that lands is spent; one that misses (dash, invulnerability) flies on.
    this.physics.add.overlap(this.hero, this.bolts, (_h, b) => this.damageHero(T.crossbow.damage) && b.destroy());
    this.shards = this.physics.add.group();
    // The Order's lights: each priest's monstrance (brightening as he prays), each inquisiteur's censer (fanned as it
    // whirls), each bourreau's reliquary, each purificateur's pilot while it flares and burns, each sonneur's bell while
    // its rim glows and rings, then its lanterns. Their bodies' tells, in the dark rooms.
    const lights = () => [...(this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && (['priest', 'inquisitor', 'bourreau'].includes(e.getData('kind')) || ['ignite', 'fire', 'raise', 'toll'].includes(e.getData('state'))))
      .map((e) => ({ ...Foes.lamp(e), lit: true, I: this.glow(e) })), ...this.lanterns];
    if (this.room.zone) Dark.light(this, this.hero, this.enemies, lights, [Nec.SW, Nec.SH], this.room.look, this.room.zone.chunks.quads);
    else Dark.light(this, this.hero, this.enemies, lights, [this.room.width, this.room.height], this.room.look);
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    this.physics.add.overlap(this.shards, this.enemies, (b, e) => this.shardHit(b as Phaser.GameObjects.Zone, e as Sprite));

    this.hud = Hud.create(this);
    // Vermine's price: climbing into a new room, its rats take their due (never his last blood).
    if (this.phase === 'enter' && this.has('vermine') && this.health > 1) {
      this.health = Math.max(1, this.health - T.pacts.vermine.toll);
      this.time.delayedCall(T.expedition.fadeMs, () => Fx.hurt(this, 1));
    }
    this.hud.health(this.health, this.maxHealth());
    this.hud.gifts(this.gifts, this.ranks);

    this.keys = this.input.keyboard!.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,K,F,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // Left click slashes, right click shoots, both toward the pointer; J and K do the same toward where he faces. F bites,
    // unaimed, or searches what is at hand.
    const world = (p: Phaser.Input.Pointer) => this.cameras.main.getWorldPoint(p.x, p.y);
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.counter) { // a card buys, anywhere else leaves
        const i = this.counter.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM);
        return void (i < 0 ? this.closeShop() : this.sell(i));
      }
      const w = world(p), a = Math.atan2(w.y - this.hero.y, w.x - this.hero.x);
      if (p.button === 0) this.press(() => this.slash(a));
      else if (p.button === 2) this.press(() => this.shoot(a));
    });
    this.keys.J.on('down', () => { const a = this.facing; this.press(() => this.slash(a)); });
    this.keys.K.on('down', () => { const a = this.facing; this.press(() => this.shoot(a)); });
    this.keys.F.on('down', () => (this.counter ? this.closeShop() : this.press(() => this.bite())));
    // Le Rongé's wares: hovered, bought by their key or a click, left with Escape (or F).
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.counter?.hover(this.counter.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM)));
    ['ONE', 'TWO', 'THREE'].forEach((k, i) => this.input.keyboard!.on(`keydown-${k}`, () => this.counter && this.sell(i)));
    this.input.keyboard!.on('keydown-ESC', () => this.closeShop());
    // Key events, not JustDown polling: a tap shorter than one frame would otherwise be lost.
    for (const k of [this.keys.SPACE, this.keys.SHIFT]) k.on('down', () => (this.dashPressedAt = this.time.now));
    // Le Glyphe: E casts it at the pointer, L ahead of the hero (keyboard only).
    this.input.keyboard!.on('keydown-E', () => {
      const to = world(this.input.activePointer);
      this.press(() => this.cast(to));
    });
    const castAhead = () => {
      const f = this.hero.body!.center, to = { x: f.x + Math.cos(this.facing) * T.glyph.near, y: f.y + Math.sin(this.facing) * T.glyph.near };
      this.press(() => this.cast(to));
    };
    this.input.keyboard!.on('keydown-L', castAhead);
    this.input.keyboard!.on('keydown-R', () => this.press(() => this.swarm(this.training))); // la Nuée
    this.input.keyboard!.on('keydown-M', () => (this.sound.mute = !this.sound.mute));
    // P: full screen in and out (the whole page, so the training panel and touch buttons come along); refused: nothing happens.
    this.input.keyboard!.on('keydown-P', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));

    const toggleTraining = () => this.scene.restart((this.training ? {} : { training: true, layout: 'hall' }) satisfies Run); // its panel picks a room
    this.input.keyboard!.on('keydown-T', toggleTraining);
    // Touch screens: the same actions as J, K, L, F and Space, aimed where he faces, and T.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, Touch.controls((a) => {
      if (a === 'slash') this.press(() => this.slash(this.facing));
      else if (a === 'shoot') this.press(() => this.shoot(this.facing));
      else if (a === 'bite') this.press(() => this.bite());
      else if (a === 'cast') castAhead();
      else if (a === 'dash') this.dashPressedAt = this.time.now;
      else toggleTraining();
    }));
    if (this.training) {
      this.hud.title('Entraînement');
      let calls = 0;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, Training.panel({
        gifts: this.gifts,
        spawn: (k) => {
          if (k === 'lantern') return void this.addLantern();
          // Each call takes the next spawn point on screen and not on top of the hero, so two calls never stack two enemies.
          // A pack of hounds, a wave of pénitents: several calls at once.
          const view = this.cameras.main.worldView;
          const free = this.room.spawns.filter((p) => view.contains(p.x, p.y) && Phaser.Math.Distance.BetweenPoints(p, this.hero) > 50);
          for (let n = k === 'hounds' ? 3 : k === 'penitents' ? 6 : 1; n > 0; n--) {
            const p = free[calls++ % free.length] ?? this.room.spawns[0];
            this.spawn(p, k === 'weak' ? 'crossbow' : k === 'hounds' ? 'hound' : k === 'penitents' ? 'penitent' : k, k === 'weak' ? T.bite.weakAt : undefined);
          }
        },
        clear: () => {
          for (const e of this.enemies.getChildren() as Sprite[]) this.kill(e);
          for (const l of [...this.lanterns]) this.hitLantern(l, 0, Infinity);
          this.bolts.clear(true, true);
          this.shards.clear(true, true);
        },
        restart: (layout = this.layout) => this.scene.restart({ training: true, gifts: this.gifts, ranks: this.ranks, layout } satisfies Run),
        heal: () => {
          this.health = this.maxHealth();
          this.hud.health(this.health, this.health);
        },
        toggle: (id, on, rank) => this.gain(() => { // free: no one-per-slot rule here
          this.gifts = on ? [...this.gifts, id] : this.gifts.filter((g) => g !== id);
          this.ranks = { ...this.ranks, [id]: rank };
        }),
        rank: (rank) => this.gain(() => (this.ranks = Object.fromEntries(this.gifts.map((g) => [g, rank])))),
        swarm: () => this.swarm(true),
        battue: () => { // the next pack of a battue, called in now, with its warning
          const kinds = T.battue.packs[calls++ % T.battue.packs.length], view = this.cameras.main.worldView;
          const p = this.room.spawns.find((p) => view.contains(p.x, p.y) && Phaser.Math.Distance.BetweenPoints(p, this.hero) > 60) ?? this.room.spawns[0];
          this.warn((kinds as readonly string[]).includes('inquisitor'));
          kinds.forEach((k, i) => this.spawn({ x: p.x + (i % 2 ? 12 : -12) * Math.ceil(i / 2), y: p.y }, k as Kind));
        },
        reset: () => {
          Save.reset();
          this.scene.restart({ training: true, gifts: this.gifts, ranks: this.ranks, layout: this.layout } satisfies Run);
        },
      }));
      return;
    }
    this.cameras.main.fadeIn(T.expedition.fadeMs);
    this.showBlood();
    if (this.layout === 'refuge') return this.home();
    this.hud.title(WORLD[this.here].name);
    this.enterRoom();
  }

  /** At the refuge: back from an expedition, it ends (logged; the world will be new) and he rests to his full blood;
   *  re-formed after a death, the blood he lost is said. The basin takes what he carries (update()). */
  private home() {
    const B = Refuge.BASIN, S = this.room.exits[0], R = Refuge.RONGE;
    this.labels.push({ at: B, l: Loot.label(this, B.x, B.y - 22, 'Bassin de sang') }, { at: { x: S.x, y: Refuge.STAIRS }, l: Loot.label(this, S.x, Refuge.STAIRS - 20, WORLD.necropolis.name) });
    this.ronge = Ronge.create(this, R.x, R.y);
    if (this.exp) {
      Save.log({ end: 'retour', deepest: this.exp.deepest, blood: this.carried, life: this.health, s: Math.round((Date.now() - this.exp.startedAt) / 1000), loosed: this.exp.loosed, met: this.exp.met });
      Save.data.dry++; // back: le Rongé hungers until blood is poured
      Save.store();
      this.exp = undefined;
      this.health = this.maxHealth();
      this.hud.health(this.health, this.health);
    } else if (this.lost) this.hud.title(`${this.lost} sang perdu`);
    this.labels.push({ at: R, l: Loot.label(this, R.x, R.y - 30, Shop.beast(Save.data) ? 'Il grogne' : 'Le Rongé (F)') });
  }

  /** A place of the expedition, as he left it, or, entered for the first time, its foes placed and its caches hidden
   *  (the zone's by area, each from its ring's pools); the words over its exits; the hounds that hunted him here come
   *  in after him. */
  private enterRoom() {
    const W = WORLD[this.here], E = T.expedition, ring = W.ring, r = this.room, zone = this.room.zone, d = this.zoneDoor();
    if (W.ahead.length && !zone) Room.raiseGate(this, 1); // open: he goes deeper when he pleases
    const at = d ?? (this.entry === undefined ? r.heroStart : this.entry < 0 ? { x: r.stairs.x, y: r.bounds.bottom } : r.exits[this.entry]);
    this.exp ??= expedition(ring); // a room opened directly (scripts, tools): an expedition of its own
    const groups = (pool: number, n: number, spawns: { x: number; y: number }[]) => placeGroups(E.pools[pool] as readonly (readonly string[])[], n, spawns, at, E.clear, E.gap, Math.random)
      .flatMap((g) => g.kinds.map((kind, i) => ({ x: g.at.x + (i % 2 ? 12 : -12) * Math.ceil(i / 2), y: g.at.y, kind }))); // side by side: they push each other off
    const hide = (list: { x: number; y: number }[]) => Phaser.Utils.Array.Shuffle([...list]).slice(0, Phaser.Math.Between(E.caches[0], E.caches[1]));
    const inArea = (p: { x: number; y: number }, [x0, y0, x1, y1]: readonly number[]) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
    const st: RoomState = (this.exp.rooms[this.here] ??= {
      foes: (zone
        ? Nec.AREAS.flatMap((a, k) => groups(a.ring, a.groups, Nec.SPAWNS.filter((p) => p[2] === k).map(([x, y]) => ({ x, y }))))
        : [...groups(ring, E.groups[ring], r.spawns), ...((E.guards as Record<string, readonly string[]>)[this.layout] ?? []).map((kind) => ({ ...r.medallion, kind }))]
      ).map((f) => ({ ...f, hp: stats(f.kind).hp, home: { x: f.x, y: f.y } })),
      // the zone's: one or two in each area
      caches: (zone ? Nec.AREAS.flatMap((a) => hide(W.caches.filter((c) => inArea(c, a.rect) && Nec.AREAS.find((b) => inArea(c, b.rect)) === a))) : hide(W.caches))
        .map((c) => ({ ...c, blood: T.blood.cache * T.blood.ring[this.ring(c)] })),
      drops: [],
    });
    for (const f of st.foes) this.place(f, f.kind as Kind, f);
    for (const c of st.caches) this.caches.push({ ...c, fx: Loot.cache(this, c.x, c.y), label: Loot.label(this, c.x, c.y - 26, 'Fouiller (F)') });
    for (const d of st.drops) this.addDrop(d);
    this.loose(T.expedition.titleMs); // packs his scent called with nowhere to go, now that he is farther from the refuge
    r.exits.forEach((g, i) => W.ahead[i] && this.labels.push({ at: g, l: Loot.label(this, g.x, g.y - (zone ? 40 : 4), WORLD[W.ahead[i]].name) }));
    const back = this.exp.came[this.here]?.from ?? parents(this.here)[0].from;
    if (zone) {
      this.labels.push({ at: r.stairs, l: Loot.label(this, r.stairs.x, r.stairs.y - 44, WORLD.refuge.name) });
      for (const g of zone.gates) if (!g.open) this.gateLabels(g);
      if (galleryOpen(Save.data.shortcuts)) this.galleryLabels();
    } else this.labels.push({ at: { x: r.stairs.x, y: r.bounds.bottom }, l: Loot.label(this, r.stairs.x, r.bounds.bottom - 26, WORLD[back].name) });
    const door = d ? { x: d.x, y: d.y - 4 } : (this.entry ?? -1) < 0 ? { x: at.x, y: r.bounds.bottom - 16 } : { x: at.x, y: r.bounds.top + 4 }; // sprite, feet inside
    for (const hp of this.hounds) this.time.delayedCall(T.sight.followMs, () => !this.dead && this.place(door, 'hound', { hp, alert: true, followed: true }));
  }

  /** In the zone, the door he comes out of (the refuge's stairs, else the door of the place he comes back from). */
  private zoneDoor() {
    if (this.layout !== 'necropolis') return undefined;
    const e = this.entry ?? -1;
    return e < 0 ? Nec.DOORS.refuge : Zone.DOORS[e];
  }

  /** The ring where floor point `p` lies: the zone's by area, a room's own. */
  private ring(p: { x: number; y: number }) {
    return this.room.zone ? ringAt(p.x, p.y) : WORLD[this.here].ring;
  }

  /** A shortcut's words: at its winch, how to raise it; on its other side (the gallery's other mouth), that it is shut
   *  from there. */
  private gateLabels(g: Zone.Gate) {
    const [x, y, w, h] = g.box, other = { x: x + w / 2, y: g.lever ? y - 14 : y + h + 14 }, words = this.gateWords.get(g.id) ?? [];
    if (g.lever) words.push({ at: g.lever, l: Loot.label(this, g.lever.x, g.lever.y - 34, `${g.name} : lever (F)`) });
    if (!g.lever || !g.arch) words.push({ at: other, l: Loot.label(this, other.x, other.y - 40, "Fermée de l'autre côté") });
    this.gateWords.set(g.id, words);
    this.labels.push(...words);
  }

  /** The gallery's two mouths, once open: where each leads. */
  private galleryLabels() {
    for (const t of Nec.TUNNEL) this.labels.push({ at: t, l: Loot.label(this, t.x, t.y - 44, 'La galerie') });
  }

  /** Into a mouth of the gallery: fade to black, out of its other mouth (`to`), the zone as it is. */
  private through(to: { x: number; y: number }) {
    this.phase = 'leave';
    this.walk = -1;
    this.cameras.main.fadeOut(T.expedition.fadeMs);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.dead) return;
      this.hero.body!.reset(to.x, to.y - 8);
      this.cameras.main.centerOn(to.x, to.y);
      [this.phase, this.walk, this.passage] = ['enter', 1, to];
      this.time.delayedCall(350, () => this.cameras.main.fadeIn(T.expedition.fadeMs)); // its chunks load meanwhile
    });
  }

  /** F by a shortcut's winch, on its side: it rises for good (saved), the way opens, the zone's ways back change. */
  private lever() {
    const f = this.hero.body!.center, g = this.room.zone?.gates.find((g) => !g.open && g.lever && Phaser.Math.Distance.BetweenPoints(f, g.lever) < T.blood.search + 8);
    if (!g) return false;
    for (const o of this.room.zone!.gates) if (o.id === g.id) Zone.raise(this, o, this.room.obstacles, 1400); // the gallery: both its mouths
    for (const l of this.gateWords.get(g.id) ?? []) { l.l.destroy(); this.labels.splice(this.labels.indexOf(l), 1); }
    Save.data.shortcuts = [...Save.data.shortcuts, g.id];
    Save.store();
    if (galleryOpen(Save.data.shortcuts) && g.id === 'galerie') this.galleryLabels();
    this.walkGrid();
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    this.castUntil = this.time.now + T.glyph.castMs;
    this.cameras.main.shake(900, new Phaser.Math.Vector2(1.5 / this.cameras.main.width, 1.5 / this.cameras.main.height));
    Sfx.play(this, 'thunk');
    this.hud.title(`${g.name} : ouverte pour toujours.`);
    return true;
  }

  /** Frames the room in the view (see main.ts), on creation and live on every resize: a turn of the phone mid-fight
   *  keeps everything as it is. Along a side where the room is smaller than the view, it sits in the middle, its
   *  surroundings round it; where it is larger (an upright phone, the tall cloister), the camera follows the hero,
   *  smoothly, kept inside the room. */
  private frame() {
    const w = this.scale.width / Dark.ZOOM, h = this.scale.height / Dark.ZOOM, rw = this.room.width, rh = this.room.height;
    this.cameras.main.setBounds(Math.min(0, Math.floor((rw - w) / 2)), Math.min(0, Math.floor((rh - h) / 2)), Math.max(rw, w), Math.max(rh, h))
      .startFollow(this.hero, true, 0.08, 0.08);
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    if (this.ronge) this.ronge.show(Shop.beast(Save.data) ? 'beast' : Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.RONGE) < T.ronge.notice ? 'look' : 'idle', time);
    if (this.counter) { // he stands before the Rongé's wares, the words over the room gone
      for (const l of this.labels) l.l.near(false);
      return void this.hero.setVelocity(0);
    }
    const k = this.keys;
    // Coming in or going out by an exit, the hero walks on his own.
    const auto = this.phase === 'enter' || this.phase === 'leave', dazed = time < this.dazedUntil;
    const x = auto || dazed ? 0 : Phaser.Math.Clamp(Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown) + Touch.stick.x, -1, 1);
    const y = dazed ? 0 : auto ? this.walk : Phaser.Math.Clamp(Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown) + Touch.stick.y, -1, 1);
    const posing = time < this.slashUntil || time < this.castUntil;
    if ((x || y) && !posing && time >= this.shotUntil && !this.prey) this.facing = Math.atan2(y, x);

    const wantsDash = time - this.dashPressedAt <= T.hero.bufferMs && !auto && !dazed; // buffered like the actions, see press()
    if (wantsDash && time >= this.dashReadyAt && !this.prey && time >= this.swarmUntil) {
      this.dashPressedAt = -1e9;
      if (x || y) this.facing = Math.atan2(y, x); // the way he walks, even mid-swing; else the way he faces
      this.dashUntil = time + T.dash.durationMs;
      this.dashReadyAt = this.dashUntil + this.dashCooldown();
      Fx.dash(this, this.hero, this.facing);
      Sfx.play(this, 'dash');
      this.physics.velocityFromRotation(this.facing, T.dash.speed, this.hero.body!.velocity);
      if (this.has('nuee')) this.releaseRats(this.hero.body!.center, this.v('nuee') - this.rats.filter((r) => r.from === 'dash').length, { from: 'dash' });
    } else if (time - delta < this.dashUntil) {
      // The mist halts at contact with an enemy it would otherwise end on, so hero and target stay two shapes. Bodies,
      // not sprites: physics has already moved them this frame, including the dash's last step. Never for a lunging
      // enemy: dashing through a lunge is the dodge.
      // Brume pestilente: the mist goes through them instead, infecting each one it touches.
      const b = this.hero.body!, left = Math.max(0, this.dashUntil - time) / 1000, miasma = this.has('miasme');
      if (miasma) for (const e of this.enemies.getChildren() as Sprite[])
        if (e.body?.enable && Phaser.Math.Distance.BetweenPoints(b.center, e.body.center) < T.dash.stopShort) this.infect(e, this.v('miasme'));
      const e = !miasma && (this.enemies.getChildren() as Sprite[]).find((e) => e.body?.enable && e.getData('state') !== 'lunge'
        && dashStopsAt(b.center, b.velocity, left, e.body.center, T.dash.stopShort));
      if (e) {
        // Back out to exact contact; physics moves the sprite to its body after update().
        const c = e.body!.center, back = new Phaser.Math.Vector2(b.center.x - c.x, b.center.y - c.y).setLength(T.dash.stopShort);
        b.position.add(back.add(c).subtract(b.center));
        this.dashUntil = time;
        this.dashReadyAt = time + this.dashCooldown();
      }
    }
    if (time < this.shoveUntil && time >= this.dashUntil && !this.prey) this.hero.setVelocity(this.shove.x, this.shove.y);
    else if (time >= this.dashUntil && !this.prey) { // latched, the bite moves him
      this.hero.setVelocity(x, y);
      this.hero.body!.velocity.normalize().scale(T.hero.speed * (time < this.swarmUntil ? T.swarm.speed : posing ? 0.3 : time < this.shotUntil ? 0.5 : 1));
    }

    if (this.queued && (time > this.queued.until || (!dazed && this.queued.act()))) this.queued = undefined;
    Hero.show(this.hero, {
      moving: (x || y) !== 0, dashing: time < this.dashUntil, slashing: time < this.slashUntil, combo: this.combo, throwing: time < this.shotUntil,
      biting: !!this.prey || time - this.biteAt < 130, casting: time < this.castUntil,
      hurt: time - this.hurtAt < 120, dazed, invulnerable: time < this.invulnUntil, facing: this.facing, swarm: time < this.swarmUntil,
    });
    // Mid-swing the hero stands in front of what he strikes, so a dash-in never buries him inside a flashing enemy;
    // biting, in front of his prey.
    this.hero.setDepth(this.hero.y + (time < this.slashUntil || this.prey ? 12 : 0));
    this.hud.dashReady(time >= this.dashReadyAt, this.dashReadyAt);
    this.hud.glyphReady(time >= this.glyphReadyAt, this.glyphReadyAt);
    // In the training room la Nuée is always at hand (see swarm()).
    this.hud.swarm(this.swarmFx ? 'spent' : this.training ? 'ready' : !swarmUnlocked(this.gifts, T.swarm.gifts) ? 'locked' : time < this.swarmReadyAt ? 'spent' : 'ready');

    const feet = this.hero.body!, b = this.room.bounds, near = (p: { x: number; y: number }, r: number) => Phaser.Math.Distance.BetweenPoints(feet.center, p) < r;
    const door = this.passage ?? this.zoneDoor(), zone = this.room.zone;
    zone?.chunks.stream(this.cameras.main.worldView);
    if (this.phase === 'enter' && (door ? feet.bottom > door.y + 6 : this.layout === 'refuge' ? feet.bottom < Refuge.STAIRS - 10 : this.walk < 0 ? feet.bottom < b.bottom - 16 : feet.top > b.top + 8)) {
      this.phase = 'play';
      this.passage = undefined;
      this.hero.setCollideWorldBounds(true);
    }
    // Out by any exit, when he pleases: down the refuge's stairs; up through a room's open portcullises, or down its stairs.
    if (this.phase === 'play' && this.layout === 'refuge' && feet.bottom > Refuge.STAIRS) this.leave(0);
    else if (this.phase === 'play' && !this.training && zone) { // into a door of the zone: up into its dark
      const into = (d: { x: number; y: number; w: number }) => Math.abs(feet.center.x - d.x) < d.w / 2 - 4 && feet.bottom < d.y - 3;
      const exit = Zone.DOORS.findIndex(into), mouth = galleryOpen(Save.data.shortcuts) ? Nec.TUNNEL.findIndex(into) : -1;
      if (into(Nec.DOORS.refuge)) this.leave(-1);
      else if (exit >= 0) this.leave(exit);
      else if (mouth >= 0) this.through(Nec.TUNNEL[1 - mouth]);
      if (this.exp) this.exp.deepest = Math.max(this.exp.deepest, ringAt(feet.center.x, feet.center.y));
    } else if (this.phase === 'play' && !this.training && this.layout !== 'refuge') {
      const exit = this.room.exits.findIndex((g, i) => Math.abs(feet.center.x - g.x) < 14 && WORLD[this.here].ahead[i]);
      if (feet.top <= b.top + 1 && exit >= 0) this.leave(exit);
      else if (feet.bottom >= b.bottom - 1 && Math.abs(feet.center.x - this.room.stairs.x) < 24) this.leave(-1);
    }
    for (const l of this.labels) l.l.near(near(l.at, 64)); // the basin's before he pours (T.blood.basin)
    for (const c of this.caches) c.label.near(near(c, T.blood.search + 8));
    for (const d of [...this.drops]) if (near(d, T.blood.pickup)) this.pickUp(d);
    // The refuge's basin takes the blood he carries: banked.
    if (this.layout === 'refuge' && this.carried && near(Refuge.BASIN, T.blood.basin)) this.pour();

    // Holy light (a lantern's pool, the chapel's stained glass, the Dawn): free for a grace on stepping in, then it burns
    // on a steady beat until he steps out (or mists through); the room's own light at its own pace. The Dawn's grace is
    // long, so the danger is shown building up all through it. It disperses la Nuée at once, and with Griffes noires
    // it burns twice as fast.
    const c = this.hero.body!.center, lamp = this.lanterns.some((l) => Lantern.lights(l, c));
    let dawn = false;
    if (lamp || this.room.holy(c.x, c.y)) {
      if (this.swarmFx) this.unswarm();
      const L = lamp ? T.lantern : this.room.burn, before = burnsAfter(this.litMs, L.graceMs, L.burnEveryMs);
      this.litMs += delta * (this.has('noires') ? T.pacts.noires.burn : 1);
      dawn = L === T.dawn;
      if (!dawn) Lantern.sizzle(this, this.hero);
      if (burnsAfter(this.litMs, L.graceMs, L.burnEveryMs) > before && this.damageHero(L.damage)) {
        Lantern.sizzle(this, this.hero, true);
        Sfx.play(this, 'burn');
      }
    } else this.litMs = 0;
    Lantern.exposure(this, this.hero, dawn ? this.litMs : 0, T.dawn.graceMs, T.dawn.burnEveryMs);

    const held: Sprite[] = []; // bound by the glyph this frame
    // The inquisiteurs standing (not on their knees) command the Order's men round them.
    const commanders = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && e.getData('kind') === 'inquisitor' && !this.kneeling(e));
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable) continue;
      if (e.getData('rings')) this.rollRings(e, time); // rolling on whatever befalls the bell's sonneur
      // La Peste: an infected enemy smokes, then the plague takes its due; with Fièvre, again and again.
      const sick = e.getData('plagueAt');
      if (sick && time < sick) Rats.plagued(this, e, time);
      else if (sick) {
        Rats.plague(this, e);
        Sfx.play(this, 'hit');
        const left = e.getData('plagueLeft');
        this.hurtEnemy(e, e.getData('plagueDmg')); // still sick if it dies of it, for Contagion
        e.setData({ plagueAt: left > 0 ? time + T.gifts.plagueMs : 0, plagueLeft: left - 1 });
        if (!e.body?.enable) continue;
      }
      const kind = e.getData('kind'), bow = kind === 'crossbow';
      // Bound by the glyph, it stops dead, its lunge or aim cancelled, and cannot be shoved; it resumes once let go. A
      // prey in the hero's jaws is held by the bite instead.
      const bound = !!this.glyph && Glyph.binds(this.glyph, e.body.center, time);
      const kneeling = this.kneeling(e); // a human just weakened, down on its knees: see hurtEnemy()
      e.setImmovable(bound || e === this.prey || kneeling);
      if (bound && e !== this.prey) {
        held.push(e);
        if (this.has('pestilent')) this.infect(e, this.v('pestilent'));
        e.setVelocity(0).setData({ state: 'chase', until: 0 });
      } else if (kneeling) e.setVelocity(0);
      else if (time >= e.getData('stunnedUntil') && time >= e.getData('until')) {
        if (this.training && Training.opts.passive) e.setVelocity(0).setData('state', 'chase'); // a training dummy
        else if (!this.hunts(e, time)) this.idle(e);
        else if (bow) this.stepCrossbow(e, time);
        else if (kind === 'purifier') this.stepPurifier(e, time);
        else if (kind === 'priest') this.stepPriest(e, time);
        else if (kind === 'hound') this.stepHound(e, time);
        else if (kind === 'penitent') this.stepPenitent(e, time);
        else if (kind === 'ringer') this.stepRinger(e, time);
        else if (kind === 'inquisitor') this.stepInquisitor(e, time, delta);
        else if (kind === 'amas') this.stepAmas(e, time);
        else if (kind === 'bourreau') this.stepBourreau(e, time);
        else this.stepEnemy(e, time);
        // Quickened by a sonneur's bell: faster on its feet (its walk, set afresh each frame it closes in or keeps its distance).
        if (e.getData('state') === 'chase' && time < (e.getData('hasteUntil') ?? 0)) e.body!.velocity.scale(T.ringer.haste);
        if (e.getData('state') === 'chase' && e.getData('torn')) e.body!.velocity.scale(T.amas.crawl); // torn off an Amas, it crawls
      }
      // Commanded: its wait between attacks runs out faster.
      if (this.order(e) && e.getData('readyAt') > time && commanders.some((c) => c !== e && Phaser.Math.Distance.BetweenPoints(c, e) < T.inquisitor.commandRange))
        e.setData('readyAt', e.getData('readyAt') - delta * (T.inquisitor.command - 1));
      const prey = Save.data.unlocks.bite && e.getData('hp') <= T.bite.weakAt; // its beating drop: it can be bitten
      if (Foes.isFoe(kind)) Foes.show(e, kneeling ? 'kneel' : e.getData('state'), time < e.getData('flashUntil'), e.getData('human') && prey);
      else if (bow) Crossbow.show(e, kneeling ? 'kneel' : e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'), prey);
      else Enemy.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'));
      e.setDepth(e.y);
    }
    // Enemies hunting him off the screen (an upright phone, the tall cloister) are pointed at from its edge, all alike:
    // where they are, never what they are about to do; on screen, they are not marked, nor those that have not seen him.
    const view = this.cameras.main.worldView;
    this.hud.threats((this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && e.getData('alert')).map((e) => ({ x: e.x - view.x, y: e.y - view.y })));
    if (this.glyph) {
      if (held.length && this.glyph.caughtAt < 0) Sfx.play(this, 'bind'); // once per glyph
      // Glyphe du nid: as it arms, rats burst out of its centre. On the clock the glyph keeps, not a timer's.
      if (time >= this.nestAt) {
        this.nestAt = Infinity;
        this.releaseRats(this.glyph, this.v('nid'));
      }
      if (!Glyph.show(this.glyph, time, held)) this.glyph = undefined;
    }
    this.stepRats(time, delta);
    if (this.swarmFx) this.stepSwarm(time);
    // Bolts fly until the prop or wall they were aimed into.
    for (const b of [...this.bolts.getChildren()] as Sprite[]) {
      b.setDepth(b.y + Crossbow.BOLT_HEIGHT - 10); // sorted by its floor point, like the characters
      const { x0, y0, angle, reach } = b.data.values;
      if (Phaser.Math.Distance.Between(x0, y0, b.body!.center.x, b.body!.center.y) < reach) continue;
      b.setPosition(x0 + Math.cos(angle) * reach, y0 + Math.sin(angle) * reach - Crossbow.BOLT_HEIGHT);
      Crossbow.boltHit(this, b);
      Sfx.play(this, 'thunk');
    }
    // Shards too, unless an enemy stopped them first (shardHit); one thrown into a lantern hits it.
    for (const b of [...this.shards.getChildren()] as Phaser.GameObjects.Zone[]) {
      const { x0, y0, angle, reach } = b.data.values;
      if (Phaser.Math.Distance.Between(x0, y0, b.x, b.y) < reach) continue;
      b.destroy();
      const x = x0 + Math.cos(angle) * reach, y = y0 + Math.sin(angle) * reach;
      const l = this.lanterns.find((l) => l.lit && Phaser.Math.Distance.Between(l.x, l.y, x, y) < 8);
      if (l) this.hitLantern(l, angle, T.shot.damage);
      else Sfx.play(this, 'splat', 1);
      Fx.splat(this, x, y, angle, false);
    }
  }

  // Enemy cycle: chase → windup (stops, telegraphs) → lunge (the only part that hurts) → recover.
  private stepEnemy(e: Sprite, time: number) {
    const E = T.enemy;
    const toHero = Phaser.Math.Angle.BetweenPoints(e, this.hero);
    switch (e.getData('state')) {
      case 'windup':
        this.physics.velocityFromRotation(e.getData('facing'), E.lungeSpeed, e.body!.velocity);
        e.setData({ state: 'lunge', until: time + E.lungeMs });
        Sfx.play(this, 'lunge');
        break;
      case 'lunge':
        e.setVelocity(0).setData({ state: 'recover', until: time + E.recoverMs, restUntil: time + E.recoverMs + E.restMs });
        break;
      default: { // chase, or recovery finished
        const pack = (this.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable);
        const dist = Phaser.Math.Distance.BetweenPoints(e, this.hero);
        // One attacker at a time, and never twice in a row: the others wait their turn on a ring around the hero
        // instead of piling onto him.
        const waiting = time < e.getData('restUntil') || pack.some((o) => o.getData('state') === 'windup' || o.getData('state') === 'lunge');
        const way = this.wayToHero(e); // round the pits
        if (!waiting && dist <= E.lungeRange && way.straight) {
          e.setVelocity(0).setData({ state: 'windup', until: time + E.windupMs, facing: toHero });
          Sfx.play(this, 'windup');
          break;
        }
        // A waiting enemy on the ring circles the hero, or backs off if too close.
        const turn = !waiting || dist > E.holdRange ? 0 : (dist < E.holdRange - 12 ? Math.PI : Math.PI / 2) * e.getData('side');
        // A chaser pressed head-on against a prop (a straight line to the hero past its corner) slips along it a moment.
        const b = e.body!;
        if (!turn && !b.blocked.none && b.velocity.length() < E.speed / 3 && time >= (e.getData('slipUntil') ?? 0)) e.setData('slipUntil', time + 250);
        const slip = !turn && time < (e.getData('slipUntil') ?? 0) ? (Math.PI / 2) * e.getData('side') : 0;
        const v = this.physics.velocityFromRotation(way.angle + turn + slip, E.speed, b.velocity);
        // Close packmates push each other apart, so the pack surrounds the hero instead of stacking.
        for (const o of pack) {
          const d = Phaser.Math.Distance.BetweenPoints(e, o);
          if (d < E.spacing) v.add(new Phaser.Math.Vector2(e.x - o.x, e.y - o.y).setLength(E.speed * (1 - d / E.spacing)));
        }
        // Circling turns back at walls, props and packmates in the way, then holds its new course a moment so it never
        // dithers in place: a waiting enemy keeps moving.
        if (turn && time >= e.getData('steadyUntil') && (!e.body!.blocked.none || v.length() < E.speed / 3))
          e.setData({ side: -e.getData('side'), steadyUntil: time + 400 });
        v.limit(E.speed);
        e.setData({ state: 'chase', facing: toHero });
      }
    }
  }

  // Crossbowman: keeps its distance and strafes; aims (stops, raises and sights, then its aim locks), shoots one bolt, reloads.
  private stepCrossbow(e: Sprite, time: number) {
    const C = T.crossbow;
    const from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to);
    const dist = Phaser.Math.Distance.BetweenPoints(from, to);
    if (e.getData('state') === 'aim') {
      // It tracks the hero, then holds its line for the last moments: a sidestep then dodges the bolt.
      if (time < e.getData('fireAt') - C.lockMs) e.setData('facing', toHero);
      if (time < e.getData('fireAt')) return;
      const angle = e.getData('facing'), reach = this.boltReach(from, angle);
      const b = Crossbow.bolt(this, this.bolts, from.x + Math.cos(angle) * 10, from.y + Math.sin(angle) * 10, angle);
      this.physics.velocityFromRotation(angle, C.boltSpeed, b.body!.velocity);
      b.setData({ x0: from.x, y0: from.y, angle, reach });
      e.setData({ state: 'shoot', until: time + C.recoilMs, readyAt: time + C.reloadMs, bolt: b });
      Sfx.play(this, 'twang');
      return;
    }
    const others = (this.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable);
    // Fair shots: one crossbowman aims at a time, never with its last bolt still flying, only along a clear line, and
    // never from off the screen (a tall room).
    if (time >= e.getData('readyAt') && !e.getData('bolt')?.active && dist >= C.minShot && dist <= C.maxShot && this.cameras.main.worldView.contains(from.x, from.y)
      && !others.some((o) => o.getData('state') === 'aim') && this.boltReach(from, toHero) >= dist) {
      e.setVelocity(0).setData({ state: 'aim', fireAt: time + C.aimMs, facing: toHero });
      Sfx.play(this, 'aim', (C.aimMs - C.lockMs) / 1000);
      return;
    }
    const v = this.physics.velocityFromRotation(toHero + keepDistance(dist, C.near, C.far, e.getData('side')), C.speed, e.body!.velocity);
    for (const o of others) {
      const d = Phaser.Math.Distance.BetweenPoints(e, o);
      if (d < T.enemy.spacing) v.add(new Phaser.Math.Vector2(e.x - o.x, e.y - o.y).setLength(C.speed * (1 - d / T.enemy.spacing)));
    }
    // Like circling ghouls, it turns back at walls, props and packmates, then holds its course a moment.
    if (time >= e.getData('steadyUntil') && (!e.body!.blocked.none || v.length() < C.speed / 3))
      e.setData({ side: -e.getData('side'), steadyUntil: time + 600 });
    v.limit(C.speed);
    e.setData({ state: 'chase', facing: toHero });
  }

  // Purificateur: walks into flame range; ignites (stops, aims at the hero, locked, the pilot flaring), then burns along
  // that aim; recovers, reloads.
  private stepPurifier(e: Sprite, time: number) {
    const P = T.purifier, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    // The jet sweeps a cone of the floor: angles and reach are measured with the ground's foreshortening undone.
    const inCone = () => inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / T.lantern.squash }, P.reach, 2 * P.halfDeg);
    switch (e.getData('state')) {
      case 'ignite':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'fire', fireUntil: time + P.fireMs });
        this.physics.velocityFromRotation(e.getData('facing'), P.press, e.body!.velocity);
        Sfx.play(this, 'burn');
        this.cameras.main.shake(140, new Phaser.Math.Vector2(2.5 / this.cameras.main.width, 2.5 / this.cameras.main.height));
        return;
      case 'fire':
        if (inCone()) this.damageHero(P.damage, from);
        if (time >= e.getData('fireUntil')) e.setVelocity(0).setData({ state: 'recover', until: time + P.recoverMs, readyAt: time + P.reloadMs });
        return;
    }
    if (time >= e.getData('readyAt') && dist <= P.reach && this.cameras.main.worldView.contains(from.x, from.y)) {
      e.setVelocity(0).setData({ state: 'ignite', fireAt: time + P.igniteMs, facing: toHero, aim: aimAt(to.x - from.x, to.y - from.y, T.lantern.squash, Foes.DIRS) });
      Sfx.play(this, 'aim', P.igniteMs / 1000);
      return;
    }
    this.keepAt(e, toHero, dist, P.near, P.far, P.speed);
  }

  // Prêtre: keeps far behind; prays (stops, points the monstrance, brightening), then the light falls where the hero
  // stood when he began, burning him if he is still there; reloads.
  private stepPriest(e: Sprite, time: number) {
    const P = T.priest, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    switch (e.getData('state')) {
      case 'pray':
        if (time < e.getData('smiteAt')) return;
        if (ellipseDist(e.getData('zone'), to, P.radius, P.radius * T.lantern.squash) <= 1 && this.damageHero(P.damage, e.getData('zone'))) Sfx.play(this, 'burn');
        e.setData({ state: 'smite', until: time + P.smiteMs, readyAt: time + P.reloadMs });
        Sfx.play(this, 'holy');
        return;
    }
    if (time >= e.getData('readyAt') && dist <= P.maxCast && this.cameras.main.worldView.contains(from.x, from.y)) {
      e.setVelocity(0).setData({ state: 'pray', smiteAt: time + P.fillMs, facing: toHero, zone: { x: to.x, y: to.y } });
      Sfx.play(this, 'aim', P.fillMs / 1000);
      return;
    }
    this.keepAt(e, toHero, dist, P.near, P.far, P.speed);
  }

  /** How bright an Order light carried by `e` burns (the dark rooms, dark.ts): a monstrance rising through the prayer,
   *  a pilot flaring through the ignition, half as much again for the jet; a bell's rim kindling as the mallet rises,
   *  half as much again as it rings; a censer fanned by its whirl. */
  private glow(e: Sprite) {
    const now = this.time.now, P = T.purifier, R = T.priest, B = T.ringer, I = T.inquisitor;
    if (e.getData('kind') === 'bourreau') return T.bourreau.light;
    if (e.getData('kind') === 'inquisitor') return ['whirl', 'sweep'].includes(e.getData('state')) ? I.whirlLight : I.light;
    switch (e.getData('state')) {
      case 'toll': return B.light * 1.5;
      case 'raise': return B.light * Phaser.Math.Clamp(1 - (e.getData('fireAt') - now) / B.raiseMs, 0.1, 1);
      case 'fire': return P.pilotLight * 1.5;
      case 'ignite': return P.pilotLight * Phaser.Math.Clamp(1 - (e.getData('fireAt') - now) / P.igniteMs, 0.2, 1);
      case 'pray': return Phaser.Math.Linear(R.light, R.prayLight, Phaser.Math.Clamp(1 - (e.getData('smiteAt') - now) / R.fillMs, 0, 1));
      case 'smite': return R.prayLight;
    }
    return R.light;
  }

  // Chien de chasse: the pack keeps a ring round the hero on the side away from the Order's shooters, spread apart; in
  // turn, they flatten (the aim locked), then leap straight through him, shoving him on toward them; one that missed
  // flattens again at once and leaps a second time; it recovers, and rests before it may leap again.
  private stepHound(e: Sprite, time: number) {
    const H = T.hound, from = e.body!.center, to = this.hero.body!.center;
    const alive = (this.enemies.getChildren() as Sprite[]).filter((o) => o.body?.enable);
    const pack = alive.filter((o) => o.getData('kind') === 'hound'), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), crouch = (ms: number, again: boolean) => {
      e.setVelocity(0).setData({ state: 'crouch', until: time + ms, crouchAt: time, again, facing: toHero, aim: aimAt(to.x - from.x, to.y - from.y, T.lantern.squash, Foes.DIRS) });
      Sfx.play(this, 'windup');
    };
    switch (e.getData('state')) {
      case 'crouch':
        this.physics.velocityFromRotation(e.getData('facing'), H.leapSpeed, e.body!.velocity);
        e.setData({ state: 'leap', until: time + H.leapMs, struck: false });
        Sfx.play(this, 'lunge');
        return;
      case 'leap':
        if (!e.getData('struck') && !e.getData('again') && dist <= H.leapRange && this.wayToHero(e).straight) return crouch(H.releapMs, true);
        e.setVelocity(0).setData({ state: 'recover', until: time + H.recoverMs, readyAt: time + H.recoverMs + H.restMs });
        return;
    }
    if (time >= e.getData('readyAt') && dist <= H.leapRange && !pack.some((o) => time - (o.getData('crouchAt') ?? -1e9) < H.staggerMs)
      && this.wayToHero(e).straight && this.cameras.main.worldView.contains(from.x, from.y)) {
      crouch(H.crouchMs, false);
      Sfx.play(this, 'windup');
      return;
    }
    // Its place on the ring: beyond the hero from the shooters (with none, on the pack's side), spread by its rank.
    const shooters = alive.filter((o) => ['crossbow', 'purifier', 'priest'].includes(o.getData('kind')));
    const ref = shooters.length ? shooters : pack, c = ref.reduce((m, o) => m.add(o.body!.center), new Phaser.Math.Vector2()).scale(1 / ref.length);
    const side = shooters.length ? Phaser.Math.Angle.Between(c.x, c.y, to.x, to.y) : Phaser.Math.Angle.Between(to.x, to.y, c.x, c.y);
    const a = side + (pack.indexOf(e) - (pack.length - 1) / 2) * Phaser.Math.DegToRad(H.spreadDeg);
    const spot = { x: to.x + Math.cos(a) * H.ring, y: to.y + Math.sin(a) * H.ring }, d = Phaser.Math.Distance.BetweenPoints(from, spot);
    // shortcut: runs straight to its spot (a pit or a prop in the way stops it), upgrade to the walk grid if hounds stick.
    this.physics.velocityFromRotation(Phaser.Math.Angle.BetweenPoints(from, spot), d < 4 ? 0 : H.speed * Math.min(1, d / 24), e.body!.velocity);
    e.setData({ state: 'chase', facing: toHero });
  }

  // Pénitent: drags his cross straight at the hero, never backing off; with him close, cocks his scourge (its aim locked),
  // leaning back, then lashes a short cone, stepping into it, and once more at once; recovers, reloads. A few at a time
  // and in turn, so a wave of six presses without striking all at once.
  private stepPenitent(e: Sprite, time: number) {
    const P = T.penitent, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    const cock = (ms: number, again: boolean) => {
      this.physics.velocityFromRotation(toHero + Math.PI, P.drawBack, e.body!.velocity); // leaning back
      e.setData({ state: 'cock', fireAt: time + ms, cockAt: time, again, facing: toHero, aim: aimAt(to.x - from.x, to.y - from.y, T.lantern.squash, Foes.DIRS) });
      Sfx.play(this, 'aim', ms / 1000);
    };
    switch (e.getData('state')) {
      case 'cock':
        if (time < e.getData('fireAt')) return;
        this.physics.velocityFromRotation(e.getData('facing'), P.lunge, e.body!.velocity);
        e.setData({ state: 'lash', fireUntil: time + P.lashMs });
        Sfx.play(this, 'lunge');
        return;
      case 'lash':
        if (inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / T.lantern.squash }, P.reach, 2 * P.halfDeg)) this.damageHero(P.damage, from);
        if (time < e.getData('fireUntil')) return;
        if (!e.getData('again')) return cock(P.recockMs, true); // the backhand
        e.setVelocity(0).setData({ state: 'recover', until: time + P.recoverMs, readyAt: time + P.reloadMs });
        return;
    }
    const pack = (this.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable);
    if (time >= e.getData('readyAt') && dist <= P.strikeRange && pack.filter((o) => ['cock', 'lash'].includes(o.getData('state'))).length < P.together
      && !pack.some((o) => time - (o.getData('cockAt') ?? -1e9) < P.staggerMs)) return cock(P.cockMs, false);
    // Close packmates push apart a little (half a ghoul's spacing), so a wave crowds round him without stacking.
    const v = this.physics.velocityFromRotation(this.wayToHero(e).angle, dist < 16 ? 0 : P.speed, e.body!.velocity);
    for (const o of pack) {
      const d = Phaser.Math.Distance.BetweenPoints(e, o), r = T.enemy.spacing / 2;
      if (d < r) v.add(new Phaser.Math.Vector2(e.x - o.x, e.y - o.y).setLength(P.speed * (1 - d / r)));
    }
    v.limit(P.speed);
    e.setData({ state: 'chase', facing: toHero });
  }

  // Sonneur: keeps far behind; raises his mallet (his bell's rim kindling), then strikes: three rings roll out along the
  // floor (rollRings) and the Order's men round him are quickened; recovers, reloads. Deaf, his own bell spares him.
  private stepRinger(e: Sprite, time: number) {
    const R = T.ringer, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    switch (e.getData('state')) {
      case 'raise':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'toll', until: time + R.strikeMs, readyAt: time + R.reloadMs, rings: { x: from.x, y: from.y, at: time } });
        for (const o of this.enemies.getChildren() as Sprite[])
          if (o !== e && o.body?.enable && this.order(o) && Phaser.Math.Distance.BetweenPoints(o, e) < R.hasteRange) o.setData('hasteUntil', time + R.hasteMs);
        Sfx.play(this, 'toll', 1);
        return;
      case 'toll':
        e.setData({ state: 'recover', until: time + R.recoverMs });
        return;
    }
    const floor = Math.hypot(to.x - from.x, (to.y - from.y) / T.lantern.squash); // the rings roll along the floor
    if (time >= e.getData('readyAt') && floor <= R.reach - 15 && !e.getData('rings') && this.cameras.main.worldView.contains(from.x, from.y)) {
      e.setVelocity(0).setData({ state: 'raise', fireAt: time + R.raiseMs, facing: toHero });
      Sfx.play(this, 'toll', 0);
      return;
    }
    this.keepAt(e, toHero, dist, R.near, R.far, R.speed);
  }

  /** A sonneur's three rings rolling out from where he struck (Foes.ringAt): each that passes over the hero hurts and dazes
   *  him, unless he mists through it; gone once they have all died out. */
  private rollRings(e: Sprite, time: number) {
    const R = T.ringer, g = e.getData('rings'), c = this.hero.body!.center, d = Math.hypot(c.x - g.x, (c.y - g.y) / T.lantern.squash);
    if (Foes.ringAt(g.at, time, 2) > R.reach) return void e.setData('rings', undefined);
    for (let i = 0; i < 3; i++) {
      const r = Foes.ringAt(g.at, time, i);
      if (r > 0 && r <= R.reach && Math.abs(r - d) <= R.ringHalf && this.damageHero(R.damage, g)) this.dazedUntil = time + R.stunMs;
    }
  }

  // Inquisiteur: closes in, turning to the hero only so fast (his back is the way in); with him close, whirls his censer
  // overhead (his aim locked), then sweeps the half circle in front of him; recovers, reloads. He parries (parried()).
  private stepInquisitor(e: Sprite, time: number, delta: number) {
    const I = T.inquisitor, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    switch (e.getData('state')) {
      case 'whirl':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'sweep', fireUntil: time + I.sweepMs });
        this.physics.velocityFromRotation(e.getData('facing'), I.lunge, e.body!.velocity);
        Sfx.play(this, 'lunge');
        return;
      case 'sweep':
        if (inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / T.lantern.squash }, I.reach, 180)) this.damageHero(I.damage, from);
        if (time >= e.getData('fireUntil')) e.setVelocity(0).setData({ state: 'recover', until: time + I.recoverMs, readyAt: time + I.reloadMs });
        return;
    }
    const facing = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.RotateTo(e.getData('facing'), toHero, Phaser.Math.DegToRad(I.turnDeg) * (delta / 1000)));
    if (time >= e.getData('readyAt') && dist <= I.strikeRange && this.cameras.main.worldView.contains(from.x, from.y)) {
      // He swings where he faces: a hero slipped round to his side or back is out of it.
      e.setVelocity(0).setData({ state: 'whirl', fireAt: time + I.whirlMs, facing, aim: aimAt(Math.cos(facing), Math.sin(facing), T.lantern.squash, Foes.DIRS) });
      Sfx.play(this, 'whirl', I.whirlMs / 1000);
      return;
    }
    this.keepAt(e, toHero, dist, I.near, I.far, I.speed);
    e.setData('facing', facing);
  }

  /** One of the Order: its men and hounds (not the ghouls, nor their Amas), whom a sonneur quickens and an inquisiteur commands. */
  private order(e: Sprite) {
    const kind = e.getData('kind');
    return kind === 'crossbow' || (Foes.isFoe(kind) && kind !== 'amas');
  }

  // Amas: crawls straight at the hero; with him close, gathers itself up, every arm rising, then slams down all round it,
  // the blow spreading out over the floor (Foes.slam), striking him where it passes; lies sprawled a while, reloads.
  private stepAmas(e: Sprite, time: number) {
    const A = T.amas, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), floor = Math.hypot(to.x - from.x, (to.y - from.y) / T.lantern.squash);
    switch (e.getData('state')) {
      case 'contract':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'slam', slamAt: time });
        Foes.slam(this, from.x, from.y);
        Sfx.play(this, 'slam');
        return;
      case 'slam':
        if (floor <= Foes.slamAt(e.getData('slamAt'), time) + 3) this.damageHero(A.damage, from);
        if (time >= e.getData('slamAt') + A.slamMs) e.setData({ state: 'sprawl', until: time + A.sprawlMs, readyAt: time + A.reloadMs });
        return;
    }
    if (time >= e.getData('readyAt') && floor <= A.strikeRange && this.cameras.main.worldView.contains(from.x, from.y)) {
      e.setVelocity(0).setData({ state: 'contract', fireAt: time + A.contractMs, facing: toHero });
      Sfx.play(this, 'groan', A.contractMs / 1000);
      return;
    }
    this.physics.velocityFromRotation(this.wayToHero(e).angle, floor < 16 ? 0 : A.speed, e.body!.velocity);
    e.setData({ state: 'chase', facing: toHero });
  }

  /** A blow on an Amas tears one of its ghouls off it, which crawls at the hero once it has found its limbs; no more
   *  than T.amas.thralls of them at once. */
  private tear(e: Sprite) {
    const A = T.amas, now = this.time.now, c = e.body!.center;
    if ((this.enemies.getChildren() as Sprite[]).filter((o) => o.body?.enable && o.getData('torn') === e).length >= A.thralls) return;
    const a = Phaser.Math.Angle.BetweenPoints(c, this.hero.body!.center) + Phaser.Math.FloatBetween(-1.2, 1.2);
    const g = Enemy.create(this, this.enemies, c.x + Math.cos(a) * 16, c.y + Math.sin(a) * 16 * T.lantern.squash - 10).setCollideWorldBounds(true);
    g.setData({ state: 'chase', until: 0, stunnedUntil: now + 450, flashUntil: 0, facing: a, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, kneelUntil: 0, hp: A.thrallHp, restUntil: 0, torn: e,
      alert: true, seenAt: now, home: { x: g.x, y: g.y } });
    Sfx.play(this, 'spawn');
  }

  // Bourreau: walks at the hero; with him in reach, raises his axe overhead (his aim locked), then the blow splits the
  // floor in a line ahead of him (Foes.crack), striking the hero where the crack reaches; the axe stuck in the stone, he
  // wrenches it free (the time to strike him), recovers, reloads. With the hero still close in front, he tears it out at
  // him instead: a hard tug, then the axe rips up through the half circle before him; a longer recovery.
  private stepBourreau(e: Sprite, time: number) {
    const B = T.bourreau, sq = T.lantern.squash, from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to), dist = Phaser.Math.Distance.BetweenPoints(from, to);
    const front = (r: number) => inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / sq }, r, 180);
    switch (e.getData('state')) {
      case 'heave': {
        if (time < e.getData('fireAt')) return;
        // The crack runs along his aim until a prop or a wall stops it, out from where his blade lands (the way his body faces).
        const aim = e.getData('aim'), k = Math.hypot(Math.cos(aim), Math.sin(aim) * sq), o = (Foes.octant(aim) * Math.PI) / 4, blade = 30;
        const len = Math.min(B.reach, this.boltReach(from, Math.atan2(Math.sin(aim) * sq, Math.cos(aim))) / k);
        e.setData({ state: 'chop', chopAt: time, len });
        Foes.crack(this, from.x + Math.cos(o) * blade, from.y + Math.sin(o) * blade * sq, aim, Math.max(0, len - blade));
        Sfx.play(this, 'slam', 1);
        return;
      }
      case 'chop': {
        const t = time - e.getData('chopAt');
        if (onLine({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / sq }, e.getData('len') * Math.min(1, t / B.crackMs), B.half)) this.damageHero(B.damage, from);
        if (t < B.chopMs) return;
        if (front(B.ripRange)) e.setData({ state: 'rip', fireAt: time + B.ripMs });
        else e.setData({ state: 'wrench', until: time + B.wrenchMs, readyAt: time + B.wrenchMs + B.reloadMs });
        return;
      }
      case 'rip':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'swing', fireUntil: time + B.swingMs });
        Sfx.play(this, 'lunge');
        return;
      case 'swing':
        if (front(B.ripRange)) this.damageHero(B.ripDamage, from);
        if (time >= e.getData('fireUntil')) e.setData({ state: 'recover', until: time + B.ripRecoverMs, readyAt: time + B.ripRecoverMs + B.reloadMs });
        return;
      case 'wrench': // the axe comes free
        e.setData({ state: 'recover', until: time + B.recoverMs });
        return;
    }
    if (time >= e.getData('readyAt') && dist <= B.strikeRange && this.cameras.main.worldView.contains(from.x, from.y)) {
      e.setVelocity(0).setData({ state: 'heave', fireAt: time + B.heaveMs, facing: toHero, aim: aimAt(to.x - from.x, to.y - from.y, sq, Foes.DIRS) });
      Sfx.play(this, 'heave', B.heaveMs / 1000);
      return;
    }
    this.keepAt(e, toHero, dist, B.near, B.far, B.speed);
  }

  /** An inquisiteur turns aside a blow coming at his front from floor point `from` (claws, a shard): sparks off his
   *  gauntlet, a ringing clang, and nothing else: no wound, no flinch. True when he did. */
  private parried(e: Sprite, from: { x: number; y: number }) {
    const c = e.body!.center;
    if (e.getData('kind') !== 'inquisitor' || this.kneeling(e) || e === this.prey || !inArc(c, e.getData('facing'), from, Infinity, 2 * T.inquisitor.parryDeg)) return false;
    const a = Phaser.Math.Angle.Between(from.x, from.y, c.x, c.y);
    e.setData('parryAt', this.time.now);
    Foes.parry(this, c.x - Math.cos(a) * 6, c.y - Math.sin(a) * 6, a);
    Sfx.play(this, 'parry');
    return true;
  }

  /** A human of the Order keeping between `near` and `far` of the hero, like the crossbowman: closes in, strafes, backs
   *  off, pushed apart from its packmates, turning back at walls. */
  private keepAt(e: Sprite, toHero: number, dist: number, near: number, far: number, speed: number) {
    const v = this.physics.velocityFromRotation(toHero + keepDistance(dist, near, far, e.getData('side')), speed, e.body!.velocity);
    for (const o of this.enemies.getChildren() as Sprite[]) {
      const d = Phaser.Math.Distance.BetweenPoints(e, o);
      if (o !== e && o.body?.enable && d < T.enemy.spacing) v.add(new Phaser.Math.Vector2(e.x - o.x, e.y - o.y).setLength(speed * (1 - d / T.enemy.spacing)));
    }
    if (this.time.now >= e.getData('steadyUntil') && (!e.body!.blocked.none || v.length() < speed / 3))
      e.setData({ side: -e.getData('side'), steadyUntil: this.time.now + 600 });
    v.limit(speed);
    e.setData({ state: 'chase', facing: toHero });
  }

  // How far a bolt flies from floor point `from` along `angle` before a prop or a wall stops it.
  private boltReach(from: Phaser.Types.Math.Vector2Like, angle: number) {
    return rayDistance({ x: from.x!, y: from.y! }, angle, this.room.bounds, this.propBoxes);
  }

  /** The walk grid: a cell is open where a ghoul's feet (12x6) fit at its centre, clear of pits and props. */
  private walkGrid() {
    const b = this.room.bounds, boxes = [this.room.pits, this.room.obstacles].flatMap((g) => g.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody));
    this.navCols = Math.ceil(b.width / NAV);
    this.navOpen = walkCells(b, boxes, NAV);
    // For a straight walk to cross no pit, a body's half-width away from them.
    this.pitBoxes = this.room.pits.getChildren().map((o) => {
      const p = o.body as Phaser.Physics.Arcade.StaticBody;
      return { x: p.x - 6, y: p.y - 3, width: p.width + 12, height: p.height + 6 };
    });
  }

  cellOf(p: Phaser.Types.Math.Vector2Like) {
    const b = this.room.bounds, col = Phaser.Math.Clamp(Math.floor((p.x! - b.x) / NAV), 0, this.navCols - 1);
    return col + Phaser.Math.Clamp(Math.floor((p.y! - b.y) / NAV), 0, this.navOpen.length / this.navCols - 1) * this.navCols;
  }

  /** Steps from every cell of the walk grid to floor point `p` (Infinity: no way there). */
  stepsTo(p: Phaser.Types.Math.Vector2Like) {
    // Someone pressed against a prop stands on a closed cell, maybe walled in by closed cells: the walk ends at the
    // nearest open cell instead, and the last steps are straight.
    const c = this.cellOf(p), cols = this.navCols, x = c % cols;
    let goal = c;
    for (let r = 1; !this.navOpen[goal] && r <= 3; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (!this.navOpen[goal] && x + dx >= 0 && x + dx < cols && this.navOpen[c + dx + dy * cols]) goal = c + dx + dy * cols;
    return stepsFrom(this.navOpen, cols, this.navOpen[goal] ? goal : c);
  }

  /** Where an enemy walks to reach the hero: straight at him, unless a pit lies across the way (`straight` false); then
   *  toward the next cell of the shortest walk round it. */
  private wayToHero(e: Sprite): { angle: number; straight: boolean } {
    const from = e.body!.center, to = this.hero.body!.center, angle = Phaser.Math.Angle.BetweenPoints(from, to);
    if (!this.pitBoxes.length || rayDistance(from, angle, this.room.bounds, this.pitBoxes) >= Phaser.Math.Distance.BetweenPoints(from, to))
      return { angle, straight: true };
    const goal = this.cellOf(to);
    if (goal !== this.navFrom) [this.navFrom, this.nav] = [goal, this.stepsTo(to)];
    const c = this.cellOf(from), cols = this.navCols, x = c % cols;
    if (c === goal || this.nav[c] === 0) return { angle, straight: false }; // there: a step to a neighbour would only turn back
    let best = -1;
    for (const n of [c - cols - 1, c - cols, c - cols + 1, c - 1, c + 1, c + cols - 1, c + cols, c + cols + 1])
      if (Math.abs((n % cols) - x) <= 1 && this.nav[n] < (this.nav[best] ?? Infinity)) best = n;
    if (best < 0) return { angle, straight: false };
    const b = this.room.bounds, cx = b.x + (best % cols) * NAV + NAV / 2, cy = b.y + Math.floor(best / cols) * NAV + NAV / 2;
    return { angle: Phaser.Math.Angle.Between(from.x, from.y, cx, cy), straight: false };
  }

  /** Input buffer: an action pressed while the hero is still busy (mid-swing, dashing, cooling down...) is kept for
   *  T.hero.bufferMs and fired by update() the moment it can be, so a press a hair early is never lost. */
  private press(act: () => boolean) {
    // Pressed mid-dash, it is kept until the dash is over: a slash then becomes the dash strike.
    // Dazed by a bell, it waits for him to come to.
    const now = this.time.now;
    if (this.counter) return;
    if (now < this.dazedUntil || !act()) this.queued = { act, until: Math.max(now, this.dashUntil, this.dazedUntil) + T.hero.bufferMs };
  }

  /** The claws. Swipe, back-swipe, then the finisher (heavier, wider, longer, slower to recover from); a slash pressed
   *  during the mist or just after it is the dash strike instead, which opens the combo. */
  private slash(angle: number) {
    const now = this.time.now, S = T.slash, D = T.dash;
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.slashReadyAt || now < this.dashUntil) return false;
    const dash = dashStrikes(now, this.dashUntil, this.lastSlashAt, D.strikeWindowMs);
    this.combo = dash ? 0 : nextCombo(this.combo, now - this.lastSlashAt, S.comboWindowMs);
    const fin = !dash && this.combo === 2, kind = dash ? 3 : this.combo; // kind 3: the dash strike, for effects and sounds
    this.lastSlashAt = now;
    this.slashReadyAt = now + S.cooldownMs + (fin ? S.finisherRecoveryMs : 0);
    this.slashUntil = now + S.cooldownMs;
    this.facing = angle;
    Fx.slash(this, this.hero.x, this.hero.y, angle, kind);
    Sfx.play(this, 'slash', kind);

    const range = fin ? S.finisherRange : S.range, arc = dash ? D.strikeArcDeg : fin ? S.finisherArcDeg : S.arcDeg;
    const damage = (dash ? S.damage + D.strikeBonus : fin ? S.damage * S.finisherMult + this.v('rongeur') : S.damage) * (this.has('noires') ? T.pacts.noires.mult : 1);
    const knock = S.knockback * (dash ? D.strikeKnock : fin ? S.finisherKnock : 1);
    if (fin && this.has('grouillantes')) this.releaseRats(this.hero.body!.center, this.v('grouillantes'));
    let hits = 0;
    for (const e of [...this.enemies.getChildren()] as Sprite[]) { // not the ghouls this blow tears off an Amas
      if (!e.body?.enable || !inArc(this.hero, angle, e, range, arc)) continue;
      hits++;
      this.hitEnemy(e, angle, damage, knock, kind);
    }
    for (const l of [...this.lanterns]) { // aimed at its glass, about the hero's chest height
      if (!l.lit || !inArc(this.hero, angle, { x: l.x, y: l.y - 5 }, range, arc)) continue;
      hits++;
      this.hitLantern(l, angle, damage);
    }
    if (!hits) return true;
    // Hit-stop: freeze physics briefly so the impact reads; tweens and timers keep running.
    this.physics.pause();
    this.time.delayedCall(S.hitStopMs + (fin ? S.finisherHitStopMs : 0), () => this.physics.resume());
    return true;
  }

  /** Le Tir: a shard of blood flicked toward `angle`, without limit. It flies until the first enemy it touches (through
   *  them all with Éclats rongeurs), or the lantern, prop or wall it was thrown into. It carries the gifts it was
   *  thrown with. */
  private shoot(angle: number) {
    const now = this.time.now, S = T.shot;
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.shotReadyAt || now < this.dashUntil || now < this.slashUntil) return false;
    if (this.has('jet') && this.rats.filter((r) => r.from === 'jet').length >= T.gifts.jetRats) return false; // the thrown rats still running
    this.shotReadyAt = now + S.cooldownMs;
    this.shotUntil = now + S.throwMs;
    this.facing = angle;
    const from = this.hero.body!.center, reach = this.boltReach(from, angle);
    Sfx.play(this, 'shoot');
    // Rat de jet: a rat instead, at the live enemy nearest the aim (within 60°), else the nearest.
    if (this.has('jet')) {
      const off = (e: Sprite) => Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.BetweenPoints(from, e.body!.center) - angle));
      const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable).sort((a, b) => off(a) - off(b));
      this.releaseRats({ x: from.x + Math.cos(angle) * 8, y: from.y + Math.sin(angle) * 8 }, 1, { from: 'jet', heading: angle, dmg: this.v('jet'), prey: live.find((e) => off(e) < Math.PI / 3) });
      return true;
    }
    // It leaves from the hand, flung out ahead of him.
    const b = this.add.zone(from.x + Math.cos(angle) * 10, from.y + Math.sin(angle) * 10, 8, 8);
    const plague = this.v('eclats');
    b.setData({ x0: from.x, y0: from.y, angle, reach, plague, pierce: this.has('perce'), hit: [] });
    this.shards.add(b);
    this.physics.velocityFromRotation(angle, S.speed, (b.body as Phaser.Physics.Arcade.Body).velocity);
    Fx.shard(this, b, angle, (reach / S.speed) * 1000);
    if (plague) Rats.plagueShard(this, b);
    return true;
  }

  /** A shard lands on an enemy: a light blow (flash, a flinch, small knockback) without hit-stop. Unlike a claw it never
   *  interrupts a windup or an aim, so an endless tir can't keep an enemy pinned. A piercing shard flies on, striking
   *  each enemy once. */
  private shardHit(b: Phaser.GameObjects.Zone, e: Sprite) {
    if (!b.active || !e.body?.enable || b.getData('hit').includes(e)) return;
    const { x, y } = b, { angle, plague, pierce, hit, x0, y0 } = b.data.values;
    const turned = this.parried(e, { x: x0, y: y0 }); // a parried shard falls
    if (pierce && !turned) hit.push(e);
    else b.destroy();
    if (turned) return;
    if (e !== this.prey && !this.kneeling(e) && !this.heavy(e)) { // a prey stays held in the bite, a kneeling human down
      e.setData('stunnedUntil', Math.max(e.getData('stunnedUntil'), this.time.now + T.shot.stunMs));
      this.physics.velocityFromRotation(angle, T.shot.knockback, e.body.velocity);
    }
    Fx.splat(this, x, y, angle, true);
    Sfx.play(this, 'splat');
    if (plague) this.infect(e, plague);
    this.hurtEnemy(e, T.shot.damage);
  }

  /** A claw lands: `kind` is the slash's (combo step 0-2, 3 the dash strike). */
  private hitEnemy(e: Sprite, angle: number, damage: number, knock: number, kind: number) {
    const now = this.time.now;
    if (this.parried(e, this.hero.body!.center)) { // his arm jars back
      this.physics.velocityFromRotation(angle + Math.PI, 110, this.shove);
      this.shoveUntil = now + 90;
      return;
    }
    // A hit interrupts whatever the enemy was doing, including a windup: aggression is rewarded. Not the heavy ones', nor
    // the attack a grand foe began soon after it was last cut short (its poise): claws cannot pin it down.
    const heavy = this.heavy(e) || (now < (e.getData('poiseUntil') ?? 0) && !['chase', 'recover'].includes(e.getData('state')));
    if (!heavy) e.setData({ state: 'chase', until: 0, stunnedUntil: now + T.enemy.stunMs, poiseUntil: Foes.isFoe(e.getData('kind')) ? now + T.foes.poiseMs : 0 });
    if (!this.kneeling(e) && !heavy) this.physics.velocityFromRotation(angle, knock, e.body!.velocity);
    Fx.hit(this, e.x, e.y, angle);
    Sfx.play(this, 'hit', kind);
    if (this.has('griffes')) this.infect(e, this.v('griffes'));
    this.hurtEnemy(e, damage);
  }

  /** The Amas and the Bourreau: blows never cut them short nor push them back. */
  private heavy(e: Sprite) {
    return ['amas', 'bourreau'].includes(e.getData('kind'));
  }

  private kneeling(e: Sprite) {
    return this.time.now < e.getData('kneelUntil');
  }

  /** La Peste, from any source (claws, shards, glyph, mist, Contagion): T.gifts.plagueMs later the enemy loses `damage`
   *  hp, and as many times again as Fièvre says (see update()). An enemy already sick stays as it is. Returns true when
   *  it fell sick. */
  private infect(e: Sprite, damage: number) {
    if (!e.body?.enable || e.getData('plagueAt')) return false;
    e.setData({ plagueAt: this.time.now + T.gifts.plagueMs, plagueDmg: damage, plagueLeft: this.v('fievre') });
    return true;
  }

  /** Damage to an enemy from any source (claws, shards, plague, rats): it flashes, hunts the hero, and dies through
   *  kill(). Once the bite is unlocked, a human it weakens drops to its knees for T.bite.kneelMs, cut short in whatever
   *  it was doing; nothing but the bite kills it meanwhile, so it is never killed by accident before the hero can drink. */
  private hurtEnemy(e: Sprite, amount: number) {
    if (!e.body?.enable) return;
    amount *= this.has('maigre') ? T.pacts.maigre.mult : 1;
    // Until the bite is unlocked, a human is wounded like any foe: weakened, it dies (it kneels only for the bite).
    const now = this.time.now, { hp, kneels } = wound(e.getData('hp'), amount, !!e.getData('human') && Save.data.unlocks.bite, T.bite.weakAt, this.kneeling(e));
    if (!e.getData('alert')) this.rouse(e);
    e.setData({ hp, flashUntil: now + 70 });
    if (kneels) e.setVelocity(0).setData({ state: 'chase', until: 0, kneelUntil: now + T.bite.kneelMs });
    if (hp <= 0) this.kill(e);
    else if (e.getData('kind') === 'amas') this.tear(e);
  }

  /** Every enemy death goes through here: on an expedition, it leaves its blood (an Amas' torn ghouls none). */
  private kill(e: Sprite) {
    if (!e.body?.enable) return; // already dead: plague or rats can finish a prey mid-bite
    const c = { ...e.body.center };
    e.disableBody(false, false);
    const kind = e.getData('kind');
    (kind === 'crossbow' ? Crossbow : Foes.isFoe(kind) ? Foes : Enemy).die(this, e);
    Sfx.play(this, 'kill');
    // Contagion: a sick enemy's plague leaps onto those around it.
    if (e.getData('plagueAt') && this.has('contagion'))
      for (const o of this.enemies.getChildren() as Sprite[])
        if (Phaser.Math.Distance.BetweenPoints(o, e) < T.gifts.contagion && this.infect(o, e.getData('plagueDmg') ?? T.gifts.plagueDamage)) Rats.leap(this, e.x, e.y, o);
    // Vermine: rats pour out of the body. La curée: every few kills, blood back.
    if (this.has('vermine')) this.releaseRats(e, T.pacts.vermine.rats);
    if (this.has('curee') && ++this.kills % T.pacts.curee.every === 0) this.heal(T.pacts.curee.heal);
    if (!this.exp || e.getData('torn')) return;
    this.addDrop({ x: c.x, y: c.y, blood: T.blood.drops[(kind ?? 'ghoul') as Kind] * T.blood.ring[this.ring(c)] });
  }

  /**
   * La Morsure, unaimed, once unlocked (save.ts). On the nearest weakened human in reach, the hero snaps to its side,
   * latches on its throat and drains it: both are held, and he takes every blow meanwhile. Then it dies like any kill
   * and he regains blood. With no prey, he searches the cache at hand, else a teeth snap in place.
   */
  private bite() {
    const now = this.time.now, B = T.bite;
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.biteReadyAt || now < this.dashUntil || now < this.slashUntil) return false;
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable), fangs = Save.data.unlocks.bite;
    const prey = fangs ? biteTarget(this.hero, this.facing, live.map((e) => ({ x: e.x, y: e.y, hp: e.getData('hp'), human: !!e.getData('human'), e })),
      B.range, B.arcDeg, B.weakAt)?.e : undefined;
    if (!prey && this.ronge && Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.RONGE) < T.ronge.talk) return this.talk();
    if (!prey && (this.search() || this.lever())) return true;
    if (!fangs) return true; // the bite is not his yet (the Rongé will teach it)
    this.biteAt = now;
    if (!prey) {
      this.biteReadyAt = now + B.whiffCooldownMs;
      Fx.snap(this, this.hero.x, this.hero.y, this.facing);
      Sfx.play(this, 'snap');
      return true;
    }
    this.prey = prey;
    // The bite is drawn side-on: he lands beside it, feet in line with its feet, face at its neck. It faces him.
    const side = this.hero.x < prey.x ? -1 : 1;
    this.facing = side < 0 ? 0 : Math.PI;
    prey.setVelocity(0).setImmovable(true).setData({ state: 'held', until: Infinity, kneelUntil: 0, facing: this.facing + Math.PI });
    this.hero.setVelocity(0);
    // A tween, not velocity: he must land exactly at the throat (physics reads the moved sprite on its next step).
    this.tweens.add({ targets: this.hero, x: prey.x + side * Hero.BITE_REACH, y: prey.y - 1, duration: B.lungeMs, ease: 'Quad.easeOut' });
    this.time.delayedCall(B.lungeMs, () => {
      if (this.dead) return;
      const mouth = { x: prey.x + side, y: prey.y - 4 };
      this.physics.pause(); // hit-stop on the latch
      this.time.delayedCall(B.hitStopMs, () => this.physics.resume());
      Fx.bite(this, mouth.x, mouth.y);
      Fx.drain(this, prey, mouth, B.drainMs);
      Sfx.play(this, 'bite');
      Sfx.play(this, 'drain');
      this.time.delayedCall(B.drainMs, () => {
        if (this.dead) return;
        this.prey = undefined;
        this.kill(prey);
        if (!this.has('curee')) return this.heal(B.heal + this.v('morsure'));
        this.health = Math.max(1, this.health - T.pacts.curee.bite); // La curée's price: the bite feeds the rats, never his last blood
        this.hud.health(this.health, this.maxHealth());
      });
    });
    return true;
  }

  /** Le Glyphe: a blood sigil drawn on the floor at `to`, within reach and wholly on the floor; once armed, it binds
   *  every enemy standing in it for a while. One at a time: a new one replaces the last. */
  private cast(to: { x: number; y: number }) {
    const now = this.time.now, G = T.glyph;
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.glyphReadyAt || now < this.dashUntil) return false;
    const feet = this.hero.body!.center, b = this.room.bounds, rx = G.radius, ry = rx * T.lantern.squash;
    const at = glyphSpot(feet, to, G.range, { x: b.x + rx, y: b.y + ry, width: b.width - 2 * rx, height: b.height - 2 * ry });
    this.glyph?.end();
    this.glyph = Glyph.cast(this, at.x, at.y, feet);
    this.nestAt = this.has('nid') ? now + G.armMs : Infinity;
    this.glyphReadyAt = now + G.cooldownMs;
    this.castUntil = now + G.castMs;
    this.facing = Math.atan2(at.y - feet.y, at.x - feet.x);
    Sfx.play(this, 'glyph');
    return true;
  }

  /** Gifts change (`change`): a higher max blood is gained as blood too (Survivant), a lower one caps it (Sang maigre). */
  private gain(change: () => void) {
    const before = this.maxHealth();
    change();
    const max = this.maxHealth();
    this.health = Math.max(1, Math.min(max, this.health + Math.max(0, max - before)));
    this.hud.health(this.health, max);
    this.hud.gifts(this.gifts, this.ranks);
  }

  /** Blood back (the bite, La curée), up to his max. */
  private heal(n: number) {
    if (this.dead || n <= 0) return;
    this.health = Math.min(this.maxHealth(), this.health + n);
    this.hud.health(this.health, this.maxHealth());
    Fx.heal(this, this.hero);
    Sfx.play(this, 'heal');
  }

  private has(id: GiftId) {
    return this.gifts.includes(id);
  }

  /** The number of gift `id` at the rarity it is held at; 0 when it is not held. */
  private v(id: GiftId) {
    return this.has(id) ? value(id, this.ranks[id]) : 0;
  }

  // ---- The expedition's blood: dropped by the dead, hidden in caches, carried up to the bag, banked at the refuge. ----

  /** Blood lying at floor point (x, y), to be picked up. */
  private addDrop(d: Blood) {
    this.drops.push({ ...d, fx: Loot.drop(this, d.x, d.y) });
  }

  /** He walks over blood: as much as his bag takes (the rest stays on the floor). */
  private pickUp(d: (typeof this.drops)[number]) {
    const bag = Shop.bagSize(Save.data), { carried, left } = carry(this.carried, d.blood, bag);
    if (carried === this.carried) return;
    if (carried === bag) this.hud.title('Sac plein');
    this.exp!.packs += scent(this.carried, carried, T.battue.every);
    this.carried = carried;
    this.loose();
    d.blood = left;
    if (!left) {
      d.fx.take({ x: this.hero.x, y: this.hero.y - 6 });
      this.drops.splice(this.drops.indexOf(d), 1);
    }
    Sfx.play(this, 'drain');
    this.showBlood();
  }

  /** F by a cache: he stoops a moment and its blood spills out at his feet (picked up as he stands in it). */
  private search() {
    const f = this.hero.body!.center, c = this.caches.find((c) => Phaser.Math.Distance.BetweenPoints(f, c) < T.blood.search);
    if (!c) return false;
    this.caches.splice(this.caches.indexOf(c), 1);
    c.fx.take();
    c.label.destroy();
    this.castUntil = this.time.now + T.glyph.castMs;
    this.addDrop({ x: f.x, y: f.y, blood: c.blood });
    Sfx.play(this, 'splat', 1);
    return true;
  }

  /** At the refuge's basin: the blood he carries is poured in, banked for good (saved). */
  private pour() {
    Save.data.banked += this.carried;
    Save.data.dry = 0; // le Rongé drinks: lucid again
    Save.store();
    Fx.drain(this, this.hero.body!.center, Refuge.BASIN, 600);
    Sfx.play(this, 'gift', 1);
    this.hud.title(`${this.carried} sang au bassin`);
    this.carried = 0;
    this.showBlood();
  }

  private showBlood() {
    if (!this.training) this.hud.blood(this.carried, Shop.bagSize(Save.data), this.layout === 'refuge' ? Save.data.banked : undefined);
  }

  // ---- The battue (the blood's scent) and le Rongé's wares. ----

  /** Lays the packs his scent has called in wait across the zone, on his way back from where he is (in a room, from
   *  its door; world.ts loose()), out of his sight; a distant horn and a line say so, `delay` ms later (after a place's
   *  name). In the zone they stand there at once; else they wait in its state for him to come back out. */
  private loose(delay = 0) {
    const exp = this.exp!, st = exp.rooms.necropolis;
    if (!exp.packs || !st) return;
    let from: { x: number; y: number } = this.hero.body!.center;
    if (!this.room.zone) { // the door of the zone he went in by
      let p = this.here;
      while (exp.came[p] && exp.came[p]!.from !== 'necropolis') p = exp.came[p]!.from;
      const d = Zone.DOORS[exp.came[p]?.exit ?? -1];
      if (!d) return;
      from = d;
    }
    const g = homeward(Save.data.shortcuts), now = loose(exp, wayBack(g.steps, g.cols, from, g.links), from, T.battue.packs, T.battue.far, T.battue.door);
    for (const { at, kinds } of now) kinds.forEach((kind, i) => {
      const p = { x: at.x + (i % 2 ? 12 : -12) * Math.ceil(i / 2), y: at.y }; // side by side
      if (this.room.zone) this.place(p, kind as Kind, { pack: exp.loosed });
      else st.foes.push({ kind, ...p, hp: stats(kind).hp, home: p, pack: exp.loosed });
    });
    if (now.length) this.time.delayedCall(delay, () => !this.dead && this.warn(now.some((p) => p.kinds.includes('inquisitor'))));
  }

  /** A pack of the battue is loosed: the horn far off, the hounds baying, a line. No mark on the map. */
  private warn(inquisitor: boolean) {
    Sfx.play(this, 'horn');
    this.hud.title(inquisitor ? 'Un Inquisiteur lâche ses chiens.' : 'Les chiens ont flairé ton sang.');
  }

  /** F by le Rongé: his wares, or, gone beast, a growl. */
  private talk() {
    if (Shop.beast(Save.data)) {
      Sfx.play(this, 'growl');
      this.hud.title(Phaser.Utils.Array.GetRandom(Shop.LINES.beast));
      return true;
    }
    this.hero.setVelocity(0);
    this.counter = Ronge.counter(this, this.offers(), Save.data.banked, Phaser.Utils.Array.GetRandom(Shop.LINES.greet));
    return true;
  }

  private offers(): Ronge.Offer[] {
    const S = Save.data;
    return Shop.WARES.map((ware) => {
      const owned = Shop.owned(S, ware), price = Shop.price(ware, owned);
      return { ware, owned, ranks: Shop.ranks(ware), price, afford: price !== undefined && S.banked >= price };
    });
  }

  /** Buys card `i` from the bank (saved); max life bought is gained as life at once. He answers. */
  private sell(i: number) {
    const w = Shop.WARES[i];
    if (!w || !this.counter) return;
    const before = this.maxHealth(), got = Shop.buy(Save.data, w);
    if (got === 'sold') {
      Save.store();
      Sfx.play(this, 'gift', 1);
      this.health += this.maxHealth() - before;
      this.hud.health(this.health, this.maxHealth());
      this.showBlood();
    } else Sfx.play(this, 'snap');
    this.counter.set(this.offers(), Save.data.banked, Phaser.Utils.Array.GetRandom(Shop.LINES[got]));
  }

  private closeShop() {
    this.counter?.close();
    this.counter = undefined;
  }

  /** Out by exit `exit` (a forward one, or -1 down a room's stairs; the refuge's 0, its stairs): fade to black, then the
   *  room it leads to (world.ts), this one kept as he leaves it, the hounds hunting him at his heels. Leaving the refuge
   *  starts an expedition. In the training room, the refuge's stairs lead to the training crypt. */
  private leave(exit: number) {
    this.phase = 'leave';
    this.walk = this.room.zone ? -1 : exit < 0 || this.layout === 'refuge' ? 1 : -1;
    this.hero.setCollideWorldBounds(false);
    this.cameras.main.fadeOut(T.expedition.fadeMs);
    let next: Run = { training: true, gifts: this.gifts, ranks: this.ranks, layout: 'hall' };
    if (!this.training) {
      const exp = this.exp ?? expedition(0), live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
      const hounds = live.filter((e) => e.getData('kind') === 'hound' && e.getData('alert') && !e.getData('followed'));
      const st = exp.rooms[this.here];
      if (st) Object.assign(st, { // as he leaves it; an Amas' torn ghouls are its own, gone with it
        foes: live.filter((e) => !hounds.includes(e) && !e.getData('torn')).map((e) => ({ kind: e.getData('kind') ?? 'ghoul', x: e.x, y: e.y, hp: e.getData('hp'), home: e.getData('home'), followed: e.getData('followed'), pack: e.getData('pack') })),
        caches: this.caches.map(({ x, y, blood }) => ({ x, y, blood })),
        drops: this.drops.map(({ x, y, blood }) => ({ x, y, blood })),
      });
      const way = go(exp.came, this.here, exit)!;
      exp.deepest = Math.max(exp.deepest, WORLD[way.to].ring);
      next = { layout: way.to, entry: way.entry, exp, health: this.health, carried: this.carried, hounds: hounds.map((e) => e.getData('hp')) };
    }
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(next));
  }

  /** The room as a place of the world (the training's torture room is none). */
  private get here() {
    return this.layout as Place;
  }

  private maxHealth() {
    return T.hero.maxHealth + Save.data.unlocks.life + this.v('survivant') - (this.has('maigre') ? T.pacts.maigre.maxBlood : 0);
  }

  private dashCooldown() {
    return T.dash.cooldownMs / (this.v('fuite') || 1);
  }

  /** `n` rats let loose at floor point `at`, by any gift: `from` the mist (Brume aux rats, which keeps count of
   *  them) or Rat de jet's (counted too); `heading`, the way they start off; `dmg`, their bite; `prey`, the enemy they go for (Rat de jet). */
  private releaseRats(at: { x: number; y: number }, n: number, o: { from?: Rat['from']; heading?: number; dmg?: number; prey?: Sprite } = {}) {
    for (let i = 0; i < n; i++)
      this.rats.push({ s: Rats.rat(this, at.x + Phaser.Math.Between(-6, 6), at.y + Phaser.Math.Between(-3, 3)), heading: o.heading ?? Math.random() * 2 * Math.PI,
        phase: i * 2.1, until: this.time.now + T.gifts.ratLifeMs, from: o.from, dmg: o.dmg ?? T.gifts.ratDamage, bites: this.v('grouillement') || 1, next: 0, prey: o.prey });
  }

  /** Each rat zigzags at its prey, or the enemy nearest to it, and bites (once, or as often as Grouillement says); with
   *  none left it runs off and is gone. */
  private stepRats(time: number, delta: number) {
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
    this.rats = this.rats.filter((r) => {
      const d = (e: Sprite) => Phaser.Math.Distance.Between(r.s.x, r.s.y, e.body!.center.x, e.body!.center.y);
      const e = r.prey?.body?.enable ? r.prey : live.length ? live.reduce((a, b) => (d(a) < d(b) ? a : b)) : undefined;
      if (e) r.heading = Phaser.Math.Angle.Between(r.s.x, r.s.y, e.body!.center.x, e.body!.center.y);
      const angle = r.heading + Math.sin(time / 70 + r.phase) * 0.6, step = (T.gifts.ratSpeed * delta) / 1000;
      r.s.setPosition(r.s.x + Math.cos(angle) * step, r.s.y + Math.sin(angle) * step);
      Rats.scurry(r.s, angle, time);
      if (e && d(e) < 6 && time >= r.next) {
        this.hurtEnemy(e, r.dmg);
        Sfx.play(this, 'hit');
        r.bites--;
        r.next = time + T.gifts.ratBiteMs;
      }
      if (r.bites > 0 && time < r.until && this.room.bounds.contains(r.s.x, r.s.y)) return true;
      Rats.vanish(this, r.s);
      return false;
    });
  }

  /** La Nuée: R turns the hero into a swarm of rats (see T.swarm), once he holds enough gifts (`force`: the training
   *  room's button, regardless) and it has come back. */
  swarm(force = false) {
    const now = this.time.now;
    if (!force && (!swarmUnlocked(this.gifts, T.swarm.gifts) || now < this.swarmReadyAt)) return false;
    if (this.dead || this.prey || this.swarmFx || this.phase === 'enter' || this.phase === 'leave' || now < this.dashUntil || now < this.slashUntil || now < this.castUntil) return false;
    this.swarmUntil = now + T.swarm.durationMs;
    this.swarmReadyAt = this.swarmUntil + T.swarm.cooldownMs;
    this.gnawAt.clear();
    const f = this.hero.body!.center;
    this.swarmFx = Rats.swarm(this, f.x, f.y + 4, T.swarm.rats, T.swarm.radius);
    Sfx.play(this, 'dash');
    return true;
  }

  /** The swarm runs with the hero and bites every enemy it covers, each once every T.swarm.tickMs, until its time is up. */
  private stepSwarm(time: number) {
    const f = this.hero.body!.center;
    if (time >= this.swarmUntil) return this.unswarm();
    this.swarmFx!.move(f.x, f.y + 4, time);
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable || time < (this.gnawAt.get(e) ?? 0) || ellipseDist(f, e.body.center, T.swarm.radius, T.swarm.radius * T.lantern.squash) > 1) continue;
      this.gnawAt.set(e, time + T.swarm.tickMs);
      Rats.gnawed(this, e.x, e.y);
      Sfx.play(this, 'hit');
      this.hurtEnemy(e, T.swarm.damage);
    }
  }

  /** The swarm gathers back into the hero: its time up, or dispersed by holy light. */
  private unswarm() {
    this.swarmFx?.end();
    this.swarmFx = undefined;
    this.swarmUntil = 0;
  }

  private hitLantern(l: Lantern.Lantern, angle: number, damage: number) {
    l.hp -= damage;
    Sfx.play(this, 'shatter', Number(l.hp <= 0));
    if (l.hp > 0) return Lantern.hit(this, l, angle);
    Lantern.shatter(this, l, angle);
    this.lanterns.splice(this.lanterns.indexOf(l), 1);
  }

  /** The Order plants a lantern on the free spot (of `spots`) nearest the hero that leaves him out of its light. */
  private addLantern(spots = this.room.spots) {
    const L = T.lantern, p = pickSpot(spots, this.hero.body!.center, this.lanterns, L.radius, L.radius * L.squash, L.clear);
    if (!p) return;
    const l = Lantern.create(this, this.room.obstacles, p.x, p.y, L.telegraphMs);
    this.lanterns.push(l);
    Sfx.play(this, 'holy');
    return l;
  }

  private hurt(e: Sprite) {
    if (this.time.now < this.swarmUntil) return; // through la Nuée: no blow, no shove
    const state = e.getData('state');
    if (state === 'lunge') this.damageHero(T.enemy.damage);
    // A hound's leap strikes once and throws him along it, unless he mists through.
    else if (state === 'leap' && !e.getData('struck') && this.time.now >= this.dashUntil) {
      e.setData('struck', true);
      this.damageHero(T.hound.damage, e.body!.center);
      this.physics.velocityFromRotation(e.getData('facing'), T.hound.shove, this.shove);
      this.shoveUntil = this.time.now + T.hound.shoveMs;
    }
  }

  /** Every source of harm to the hero goes through here (lunges, bolts, holy light): invulnerability, the mist dash,
   *  HUD, feedback and death are handled once. A grand foe's blow comes `from` a floor point: it lands harder (hit-stop,
   *  shake and knockback scaled to the blood lost, blood flung off him). Returns false when the hit didn't land. */
  damageHero(amount: number, from?: Phaser.Types.Math.Vector2Like): boolean {
    const now = this.time.now;
    // Blows go through la Nuée; only holy light breaks it (update()).
    if (this.dead || (this.training && Training.opts.god) || now < this.invulnUntil || now < this.dashUntil || now < this.swarmUntil) return false;
    this.invulnUntil = now + T.hero.hurtInvulnMs;
    this.hurtAt = now;
    this.health -= amount;
    this.hud.health(this.health, this.maxHealth());
    Fx.hurt(this, from ? amount : 1);
    Sfx.play(this, 'hurt');
    if (from) {
      const F = T.foes, a = Phaser.Math.Angle.BetweenPoints(from, this.hero.body!.center), stop = F.hitStopMs * amount;
      Enemy.bleed(this, this.hero.x, this.hero.y, a, 6 * amount, 0.7, 0.8 + 0.3 * amount);
      this.physics.velocityFromRotation(a, F.knock * amount, this.shove);
      this.shoveUntil = now + stop + F.knockMs; // the freeze holds him; then he is thrown
      this.physics.pause();
      this.time.delayedCall(stop, () => this.physics.resume());
    }
    if (this.health > 0) return true;
    this.dead = true;
    Sfx.play(this, 'death');
    this.hero.disableBody(false, false);
    // Back to the refuge, re-formed at his coffin, all the blood he carried lost and the world reset; or back to the
    // training room.
    if (this.exp) {
      Save.log({ end: 'mort', deepest: this.exp.deepest, blood: this.carried, life: 0, s: Math.round((Date.now() - this.exp.startedAt) / 1000), loosed: this.exp.loosed, met: this.exp.met });
      Save.data.dry++; // re-formed empty-handed: le Rongé hungers
      Save.store();
    }
    this.time.delayedCall(1200, () => this.scene.restart((this.training ? { training: true, gifts: this.gifts, ranks: this.ranks, layout: this.layout } : { lost: this.carried }) satisfies Run));
    return true;
  }

  /** A placed foe on the watch (alertness()): it notices the hero in reach with no prop between them, and hunts him
   *  with its pack; it keeps him in sight farther, and gives up a while after it lost him. True while it hunts. The
   *  training room's hunt from the start. */
  private hunts(e: Sprite, time: number) {
    if (this.training) return true;
    const from = e.body!.center, to = this.hero.body!.center, d = Phaser.Math.Distance.BetweenPoints(from, to), was = !!e.getData('alert');
    const sees = d <= (was ? T.sight.keep : T.sight.range) && this.boltReach(from, Phaser.Math.Angle.BetweenPoints(from, to)) >= d;
    const s = alertness({ alert: was, seenAt: e.getData('seenAt') }, sees, time, T.sight.giveUpMs);
    e.setData(s);
    if (s.alert && !was) this.rouse(e);
    return s.alert;
  }

  /** `e` hunts the hero, and the others of its pack not yet hunting (within T.sight.call) with it. */
  private rouse(e: Sprite) {
    const now = this.time.now, pack = e.getData('pack');
    if (pack && this.exp) { // a pack of the battue has found him: counted once, they hunt like the others now
      this.exp.met++;
      for (const o of this.enemies.getChildren() as Sprite[]) if (o.getData('pack') === pack) o.setData('pack', 0);
    }
    for (const o of this.enemies.getChildren() as Sprite[])
      if (o === e || (o.body?.enable && !o.getData('alert') && Phaser.Math.Distance.BetweenPoints(o, e) < T.sight.call)) o.setData({ alert: true, seenAt: now });
  }

  /** Not hunting: it stands at its post, or walks back to it.
   *  shortcut: straight back to its post (a pit or prop in the way stops it), upgrade to the walk grid if foes stick. */
  private idle(e: Sprite) {
    const home = e.getData('home'), d = Phaser.Math.Distance.BetweenPoints(e, home), a = Phaser.Math.Angle.BetweenPoints(e, home);
    if (d < 4) e.setVelocity(0);
    else this.physics.velocityFromRotation(a, stats(e.getData('kind') ?? 'ghoul').speed * T.sight.homeSpeed, e.body!.velocity);
    e.setData({ state: 'chase', ...(d < 4 ? {} : { facing: a }) });
  }

  /** The training room calls an enemy in at `p`: it rises after its telegraph, hunting (`hp` to start it weakened). */
  private spawn(p: { x: number; y: number }, kind: Kind, hp?: number) {
    const human = kind !== 'ghoul' && kind !== 'amas'; // the Order's gold sigil (its hounds' too), else the ghouls' pool of blood
    (human ? Crossbow : Enemy).telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
    if (!human) Sfx.play(this, 'spawn');
    this.time.delayedCall(T.enemy.spawnTelegraphMs, () => !this.dead && this.place(p, kind, { hp, alert: true }));
  }

  /** An enemy at `p`, at once: a ghoul, or one of the Order: a crossbowman, a purificateur, a prêtre, a hound, a pénitent,
   *  a sonneur, an inquisiteur or a bourreau, or an Amas of ghouls. `hp` (else its kind's), its post `home` (else `p`),
   *  `alert`: hunting already; `followed`: a hound that came through an exit after the hero (never a second one). */
  private place(p: { x: number; y: number }, kind: Kind, o: Placed = {}) {
    const bow = kind === 'crossbow', now = this.time.now;
    const e = (Foes.isFoe(kind) ? Foes.create(this, this.enemies, kind, p.x, p.y) : (bow ? Crossbow : Enemy).create(this, this.enemies, p.x, p.y)).setCollideWorldBounds(true);
    const common = { state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, kneelUntil: 0,
      hp: o.hp ?? stats(kind).hp, home: o.home ?? { x: p.x, y: p.y }, alert: !!o.alert, seenAt: o.alert ? now : -1e9, followed: !!o.followed, pack: o.pack ?? 0 };
    if (Foes.isFoe(kind)) e.setData({ ...common, kind, human: kind !== 'hound' && kind !== 'amas', readyAt: now + T[kind].firstMs, aim: Math.PI / 2 });
    else if (bow) e.setData({ ...common, kind: 'crossbow', human: true, readyAt: now + T.crossbow.firstShotMs });
    else e.setData({ ...common, restUntil: 0, ...(o.alert ? {} : { born: -1e9 }) }); // a ghoul on its post, not rising
  }
}
