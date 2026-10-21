import Phaser from 'phaser';
import { T } from './tuning.ts';
import { aimAt, biteTarget, burnsAfter, dashStopsAt, dashStrikes, drawGifts, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, nextLayout, offerable, onLine, pickSpot, rayDistance, stepsFrom, take, wound } from './logic.ts';
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
import { GIFTS, type GiftId } from './gifts.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;
/** What a run carries from room to room, through scene.restart(data); {} is the refuge, where the game starts and the
 *  hero re-forms after a death; its stairs start a run in the crypt (layout 'hall', room 1). */
type Run = { room?: number; layout?: Room.LayoutId; health?: number; gifts?: GiftId[]; training?: boolean };
// A room: the hero climbs in (from room 2), fights its waves, takes the gift of the Rat house on the medallion (cards
// open, the action pauses), then walks out through the portcullis it raised.
type Phase = 'enter' | 'fight' | 'gift' | 'choose' | 'exit' | 'leave';
const NAV = 8; // walk grid cell, px

// Gameplay only: movement, combat, enemy AI, waves, the run. Every visual decision lives in the modules above.
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
  private wave = 0;
  private lanterns: Lantern.Lantern[] = [];
  private litMs = 0; // time the hero has stood in holy light, back to 0 when he steps out
  private biteAt = -1e9;
  private biteReadyAt = 0;
  private prey?: Sprite; // the human the hero is latched onto, from the snap until it dies
  private roomNo = 1;
  private gifts: GiftId[] = [];
  private phase: Phase = 'fight';
  private pickup?: Rats.Pickup;
  private cards?: Rats.Cards;
  private offer: GiftId[] = [];
  private gateUpAt = Infinity;
  private rats: { s: Phaser.GameObjects.Sprite; heading: number; phase: number; until: number; nest: boolean }[] = [];
  private training = false; // the training room (key T): no waves, enemies on demand, see training.ts
  private glyph?: Glyph.Glyph; // the blood sigil on the floor, from its cast until it has crumbled
  private glyphReadyAt = 0;
  private castUntil = 0; // the hero's cast pose
  private nestAt = Infinity; // Glyphe du nid: when the glyph arms and lets its rats out
  private waveDue = false; // a tall room's next wave, waiting for the hero to climb into its part

  constructor() {
    super('room');
  }

  init(data: Run) {
    // The scene instance is reused on restart, so every field is reset here; the run carries on through `data`.
    this.roomNo = data.room ?? 1;
    this.layout = data.layout ?? 'refuge';
    this.navFrom = -1;
    this.training = !!data.training;
    this.gifts = [...(data.gifts ?? [])];
    this.health = data.health ?? this.maxHealth();
    this.facing = Math.PI / 2; // start facing the camera
    this.dashUntil = this.dashReadyAt = this.slashReadyAt = this.slashUntil = this.shotReadyAt = this.shotUntil = this.invulnUntil = this.combo = this.shoveUntil = this.dazedUntil = 0;
    this.lastSlashAt = this.hurtAt = -1e9;
    this.dead = false;
    this.dashPressedAt = -1e9;
    this.queued = undefined;
    this.litMs = 0;
    this.wave = (this.roomNo - 1) * T.run.wavesPerRoom; // the count carries on, and so does the difficulty
    this.lanterns = [];
    this.biteAt = -1e9;
    this.biteReadyAt = 0;
    this.prey = undefined;
    this.phase = this.roomNo > 1 ? 'enter' : 'fight';
    this.pickup = this.cards = undefined;
    this.offer = [];
    this.gateUpAt = Infinity;
    this.rats = [];
    this.glyph = undefined; // the last scene's is ended on its shutdown
    this.glyphReadyAt = this.castUntil = 0;
    this.nestAt = Infinity;
    this.waveDue = false;
  }

  preload() {
    Hero.preload(this);
    Room.preload(this, this.layout);
    Foes.preload(this); // the training room calls them into any room
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

    const start = this.phase === 'enter' ? this.room.stairs : this.room.heroStart;
    this.hero = Hero.create(this, start.x, start.y);
    this.frame();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.frame, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.frame, this));
    this.hero.setCollideWorldBounds(this.phase !== 'enter');
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
    Dark.light(this, this.hero, this.enemies, lights, [this.room.width, this.room.height], this.room.look);
    this.physics.add.overlap(this.shards, this.enemies, (b, e) => this.shardHit(b as Phaser.GameObjects.Zone, e as Sprite));

    this.hud = Hud.create(this);
    this.hud.health(this.health, this.maxHealth());
    this.hud.gifts(this.gifts);

    this.keys = this.input.keyboard!.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,K,F,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // Left click slashes, right click shoots, both toward the pointer; J and K do the same toward where he faces. F bites,
    // unaimed. While the gift cards are open, a click picks one.
    // The cards sit on the screen, the rest in the room under the camera.
    const world = (p: Phaser.Input.Pointer) => this.cameras.main.getWorldPoint(p.x, p.y);
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.cards) return this.pick(this.cards.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM));
      const w = world(p), a = Math.atan2(w.y - this.hero.y, w.x - this.hero.x);
      if (p.button === 0) this.press(() => this.slash(a));
      else if (p.button === 2) this.press(() => this.shoot(a));
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.cards?.hover(this.cards.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM)));
    this.keys.J.on('down', () => { const a = this.facing; this.press(() => this.slash(a)); });
    this.keys.K.on('down', () => { const a = this.facing; this.press(() => this.shoot(a)); });
    this.keys.F.on('down', () => this.press(() => this.bite()));
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
    this.input.keyboard!.on('keydown-M', () => (this.sound.mute = !this.sound.mute));
    // P: full screen in and out (the whole page, so the training panel and touch buttons come along); refused: nothing happens.
    this.input.keyboard!.on('keydown-P', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));
    // Gift cards: the 1, 2, 3 keys of the top row (by position, so AZERTY works unshifted) or of the numpad.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const n = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
      if (n) this.pick(Number(n[1]) - 1);
    });

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
        restart: (layout = this.layout) => this.scene.restart({ training: true, gifts: this.gifts, layout } satisfies Run),
        heal: () => {
          this.health = this.maxHealth();
          this.hud.health(this.health, this.health);
        },
        toggle: (id, on) => { // free: no one-per-slot rule here
          this.gifts = on ? [...this.gifts, id] : this.gifts.filter((g) => g !== id);
          this.health = Math.min(this.health + (on && id === 'survivant' ? T.gifts.blood : 0), this.maxHealth());
          this.hud.health(this.health, this.maxHealth());
          this.hud.gifts(this.gifts);
        },
      }));
      return;
    }
    if (this.layout === 'refuge') return void this.cameras.main.fadeIn(T.run.fadeMs); // no wave: the stairs start a run
    if (this.phase === 'enter') {
      this.cameras.main.fadeIn(T.run.fadeMs);
      this.hud.title(`Salle ${this.roomNo}`);
    }
    this.time.delayedCall(this.phase === 'enter' ? T.run.titleMs : 900, () => this.spawnWave());
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
    if (this.dead || this.phase === 'choose') return;
    const k = this.keys;
    // Climbing in from the stairs or walking out through the gate (down the refuge's stairs), the hero moves on his own.
    const auto = this.phase === 'enter' || this.phase === 'leave', dazed = time < this.dazedUntil;
    const x = auto || dazed ? 0 : Phaser.Math.Clamp(Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown) + Touch.stick.x, -1, 1);
    const y = dazed ? 0 : auto ? (this.layout === 'refuge' ? 1 : -1) : Phaser.Math.Clamp(Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown) + Touch.stick.y, -1, 1);
    const posing = time < this.slashUntil || time < this.castUntil;
    if ((x || y) && !posing && time >= this.shotUntil && !this.prey) this.facing = Math.atan2(y, x);

    const wantsDash = time - this.dashPressedAt <= T.hero.bufferMs && !auto && !dazed; // buffered like the actions, see press()
    if (wantsDash && time >= this.dashReadyAt && !this.prey) {
      this.dashPressedAt = -1e9;
      if (x || y) this.facing = Math.atan2(y, x); // the way he walks, even mid-swing; else the way he faces
      this.dashUntil = time + T.dash.durationMs;
      this.dashReadyAt = this.dashUntil + this.dashCooldown();
      Fx.dash(this, this.hero, this.facing);
      Sfx.play(this, 'dash');
      this.physics.velocityFromRotation(this.facing, T.dash.speed, this.hero.body!.velocity);
      if (this.gifts.includes('nuee')) this.releaseRats(this.hero.body!.center, T.gifts.rats - this.rats.filter((r) => !r.nest).length);
    } else if (time - delta < this.dashUntil) {
      // The mist halts at contact with an enemy it would otherwise end on, so hero and target stay two shapes. Bodies,
      // not sprites: physics has already moved them this frame, including the dash's last step. Never for a lunging
      // enemy: dashing through a lunge is the dodge.
      const b = this.hero.body!, left = Math.max(0, this.dashUntil - time) / 1000;
      const e = (this.enemies.getChildren() as Sprite[]).find((e) => e.body?.enable && e.getData('state') !== 'lunge'
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
      this.hero.body!.velocity.normalize().scale(T.hero.speed * (posing ? 0.3 : time < this.shotUntil ? 0.5 : 1));
    }

    if (this.queued && (time > this.queued.until || (!dazed && this.queued.act()))) this.queued = undefined;
    Hero.show(this.hero, {
      moving: (x || y) !== 0, dashing: time < this.dashUntil, slashing: time < this.slashUntil, combo: this.combo, throwing: time < this.shotUntil,
      biting: !!this.prey || time - this.biteAt < 130, casting: time < this.castUntil,
      hurt: time - this.hurtAt < 120, dazed, invulnerable: time < this.invulnUntil, facing: this.facing,
    });
    // Mid-swing the hero stands in front of what he strikes, so a dash-in never buries him inside a flashing enemy;
    // biting, in front of his prey.
    this.hero.setDepth(this.hero.y + (time < this.slashUntil || this.prey ? 12 : 0));
    this.hud.dashReady(time >= this.dashReadyAt, this.dashReadyAt);
    this.hud.glyphReady(time >= this.glyphReadyAt, this.glyphReadyAt);

    const feet = this.hero.body!;
    if (this.phase === 'enter' && feet.bottom < this.room.bounds.bottom - 16) {
      this.phase = 'fight';
      this.hero.setCollideWorldBounds(true);
    }
    if (this.waveDue) this.spawnWave();
    if (this.phase === 'gift' && this.pickup?.ready && Phaser.Math.Distance.BetweenPoints(feet.center, this.pickup) < 10) this.openGifts();
    if (this.layout === 'refuge' && this.phase === 'fight' && feet.bottom > Refuge.STAIRS) this.leave();
    if (this.phase === 'exit' && time >= this.gateUpAt && feet.top <= this.room.bounds.top + 1 && Math.abs(feet.center.x - this.room.gate.x) < 14) this.leave();

    // Holy light (a lantern's pool, the chapel's stained glass, the Dawn): free for a grace on stepping in, then it burns
    // on a steady beat until he steps out (or mists through); the room's own light at its own pace. The Dawn's grace is
    // long, so the danger is shown building up all through it.
    const c = this.hero.body!.center, lamp = this.lanterns.some((l) => Lantern.lights(l, c));
    let dawn = false;
    if (lamp || this.room.holy(c.x, c.y)) {
      const L = lamp ? T.lantern : this.room.burn, before = burnsAfter(this.litMs, L.graceMs, L.burnEveryMs);
      this.litMs += delta;
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
      // La Peste: an infected enemy smokes, then the plague takes its due.
      const sick = e.getData('plagueAt');
      if (sick && time < sick) Rats.plagued(this, e, time);
      else if (sick) {
        Rats.plague(this, e);
        Sfx.play(this, 'hit');
        this.hurtEnemy(e, T.gifts.plagueDamage); // still sick if it dies of it, for Contagion
        e.setData('plagueAt', 0);
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
        e.setVelocity(0).setData({ state: 'chase', until: 0 });
      } else if (kneeling) e.setVelocity(0);
      else if (time >= e.getData('stunnedUntil') && time >= e.getData('until')) {
        if (this.training && Training.opts.passive) e.setVelocity(0).setData('state', 'chase'); // a training dummy
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
      if (Foes.isFoe(kind)) Foes.show(e, kneeling ? 'kneel' : e.getData('state'), time < e.getData('flashUntil'), e.getData('human') && e.getData('hp') <= T.bite.weakAt);
      else if (bow) Crossbow.show(e, kneeling ? 'kneel' : e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'), e.getData('hp') <= T.bite.weakAt);
      else Enemy.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'));
      e.setDepth(e.y);
    }
    // Enemies off the screen (an upright phone, the tall cloister) are pointed at from its edge, all alike: where they
    // are, never what they are about to do; on screen, they are not marked.
    const view = this.cameras.main.worldView;
    this.hud.threats((this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable).map((e) => ({ x: e.x - view.x, y: e.y - view.y })));
    if (this.glyph) {
      if (held.length && this.glyph.caughtAt < 0) Sfx.play(this, 'bind'); // once per glyph
      // Glyphe du nid: as it arms, rats burst out of its centre. On the clock the glyph keeps, not a timer's.
      if (time >= this.nestAt) {
        this.nestAt = Infinity;
        this.releaseRats(this.glyph, T.gifts.rats, true);
      }
      if (!Glyph.show(this.glyph, time, held)) this.glyph = undefined;
    }
    this.stepRats(time, delta);
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
    g.setData({ state: 'chase', until: 0, stunnedUntil: now + 450, flashUntil: 0, facing: a, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, kneelUntil: 0, hp: A.thrallHp, restUntil: 0, torn: e });
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
    const props = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    return rayDistance({ x: from.x!, y: from.y! }, angle, this.room.bounds, props);
  }

  /** The walk grid: a cell is open where a ghoul's feet (12x6) fit at its centre, clear of pits and props. */
  private walkGrid() {
    const b = this.room.bounds, boxes = [this.room.pits, this.room.obstacles].flatMap((g) => g.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody));
    this.navCols = Math.ceil(b.width / NAV);
    this.navOpen = Array.from({ length: this.navCols * Math.ceil(b.height / NAV) }, (_, c) => {
      const x = b.x + (c % this.navCols) * NAV + NAV / 2, y = b.y + Math.floor(c / this.navCols) * NAV + NAV / 2;
      return y + 3 <= b.bottom && x + 6 <= b.right && boxes.every((o) => x + 6 <= o.x || x - 6 >= o.right || y + 3 <= o.y || y - 3 >= o.bottom);
    });
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
    if (now < this.dazedUntil || !act()) this.queued = { act, until: Math.max(now, this.dashUntil, this.dazedUntil) + T.hero.bufferMs };
  }

  /** The claws. Swipe, back-swipe, then the finisher (heavier, wider, longer, slower to recover from); a slash pressed
   *  during the mist or just after it is the dash strike instead, which opens the combo. */
  private slash(angle: number) {
    const now = this.time.now, S = T.slash, D = T.dash;
    if (this.dead || this.prey || this.cards || this.phase === 'enter' || this.phase === 'leave' || now < this.slashReadyAt || now < this.dashUntil) return false;
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
    const damage = dash ? S.damage + D.strikeBonus : fin ? S.damage * S.finisherMult + (this.gifts.includes('rongeur') ? T.gifts.gnaw : 0) : S.damage;
    const knock = S.knockback * (dash ? D.strikeKnock : fin ? S.finisherKnock : 1);
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
    this.time.delayedCall(S.hitStopMs + (fin ? S.finisherHitStopMs : 0), () => this.phase !== 'choose' && this.physics.resume());
    return true;
  }

  /** Le Tir: a shard of blood flicked toward `angle`, without limit. It flies until the first enemy it touches (through
   *  them all with Éclats rongeurs), or the lantern, prop or wall it was thrown into. It carries the gifts it was
   *  thrown with. */
  private shoot(angle: number) {
    const now = this.time.now, S = T.shot;
    if (this.dead || this.prey || this.cards || this.phase === 'enter' || this.phase === 'leave' || now < this.shotReadyAt || now < this.dashUntil || now < this.slashUntil) return false;
    this.shotReadyAt = now + S.cooldownMs;
    this.shotUntil = now + S.throwMs;
    this.facing = angle;
    const from = this.hero.body!.center, reach = this.boltReach(from, angle);
    // It leaves from the hand, flung out ahead of him.
    const b = this.add.zone(from.x + Math.cos(angle) * 10, from.y + Math.sin(angle) * 10, 8, 8);
    const plague = this.gifts.includes('eclats');
    b.setData({ x0: from.x, y0: from.y, angle, reach, plague, pierce: this.gifts.includes('perce'), hit: [] });
    this.shards.add(b);
    this.physics.velocityFromRotation(angle, S.speed, (b.body as Phaser.Physics.Arcade.Body).velocity);
    Fx.shard(this, b, angle, (reach / S.speed) * 1000);
    if (plague) Rats.plagueShard(this, b);
    Sfx.play(this, 'shoot');
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
    if (plague) this.infect(e);
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
    if (this.gifts.includes('griffes')) this.infect(e);
    this.hurtEnemy(e, damage);
  }

  /** The Amas and the Bourreau: blows never cut them short nor push them back. */
  private heavy(e: Sprite) {
    return ['amas', 'bourreau'].includes(e.getData('kind'));
  }

  private kneeling(e: Sprite) {
    return this.time.now < e.getData('kneelUntil');
  }

  /** La Peste, from any source (claws, shards, Contagion): T.gifts.plagueMs later the enemy loses T.gifts.plagueDamage
   *  hp (see update()). An enemy already sick stays as it is. Returns true when it fell sick. */
  private infect(e: Sprite) {
    if (!e.body?.enable || e.getData('plagueAt')) return false;
    e.setData('plagueAt', this.time.now + T.gifts.plagueMs);
    return true;
  }

  /** Damage to an enemy from any source (claws, shards, plague, rats): it flashes, and dies through kill(). A human it
   *  weakens drops to its knees for T.bite.kneelMs, cut short in whatever it was doing; nothing but the bite kills it
   *  meanwhile, so it is never killed by accident before the hero can drink. */
  private hurtEnemy(e: Sprite, amount: number) {
    if (!e.body?.enable) return;
    const now = this.time.now, { hp, kneels } = wound(e.getData('hp'), amount, !!e.getData('human'), T.bite.weakAt, this.kneeling(e));
    e.setData({ hp, flashUntil: now + 70 });
    if (kneels) e.setVelocity(0).setData({ state: 'chase', until: 0, kneelUntil: now + T.bite.kneelMs });
    if (hp <= 0) this.kill(e);
    else if (e.getData('kind') === 'amas') this.tear(e);
  }

  /** Every enemy death goes through here, and here only it is decided whether the wave, or the room, is over. */
  private kill(e: Sprite) {
    if (!e.body?.enable) return; // already dead: plague or rats can finish a prey mid-bite
    e.disableBody(false, false);
    const kind = e.getData('kind');
    (kind === 'crossbow' ? Crossbow : Foes.isFoe(kind) ? Foes : Enemy).die(this, e);
    Sfx.play(this, 'kill');
    // Contagion: a sick enemy's plague leaps onto those around it.
    if (e.getData('plagueAt') && this.gifts.includes('contagion'))
      for (const o of this.enemies.getChildren() as Sprite[])
        if (Phaser.Math.Distance.BetweenPoints(o, e) < T.gifts.contagion && this.infect(o)) Rats.leap(this, e.x, e.y, o);
    if (this.training) return;
    if ((this.enemies.getChildren() as Sprite[]).some((o) => o.body?.enable)) return;
    if (this.wave < this.roomNo * T.run.wavesPerRoom) this.time.delayedCall(1500, () => this.spawnWave());
    else this.roomCleared();
  }

  /**
   * La Morsure, unaimed. On the nearest weakened human in reach, the hero snaps to its side, latches on its throat and
   * drains it: both are held, and he takes every blow meanwhile. Then it dies like any kill and he regains blood. With
   * no prey, a teeth snap in place.
   */
  private bite() {
    const now = this.time.now, B = T.bite;
    if (this.dead || this.prey || this.cards || this.phase === 'enter' || this.phase === 'leave' || now < this.biteReadyAt || now < this.dashUntil || now < this.slashUntil) return false;
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
    const prey = biteTarget(this.hero, this.facing, live.map((e) => ({ x: e.x, y: e.y, hp: e.getData('hp'), human: !!e.getData('human'), e })),
      B.range, B.arcDeg, B.weakAt)?.e;
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
        this.health = Math.min(this.maxHealth(), this.health + B.heal + (this.gifts.includes('morsure') ? T.gifts.bite : 0));
        this.hud.health(this.health, this.maxHealth());
        Fx.heal(this, this.hero);
        Sfx.play(this, 'heal');
      });
    });
    return true;
  }

  /** Le Glyphe: a blood sigil drawn on the floor at `to`, within reach and wholly on the floor; once armed, it binds
   *  every enemy standing in it for a while. One at a time: a new one replaces the last. */
  private cast(to: { x: number; y: number }) {
    const now = this.time.now, G = T.glyph;
    if (this.dead || this.prey || this.cards || this.phase === 'enter' || this.phase === 'leave' || now < this.glyphReadyAt || now < this.dashUntil) return false;
    const feet = this.hero.body!.center, b = this.room.bounds, rx = G.radius, ry = rx * T.lantern.squash;
    const at = glyphSpot(feet, to, G.range, { x: b.x + rx, y: b.y + ry, width: b.width - 2 * rx, height: b.height - 2 * ry });
    this.glyph?.end();
    this.glyph = Glyph.cast(this, at.x, at.y, feet);
    this.nestAt = this.gifts.includes('nid') ? now + G.armMs : Infinity;
    this.glyphReadyAt = now + G.cooldownMs;
    this.castUntil = now + G.castMs;
    this.facing = Math.atan2(at.y - feet.y, at.x - feet.x);
    Sfx.play(this, 'glyph');
    return true;
  }

  /** The room's last enemy is down: it falls in slow motion with a sting, then the gift of the Rat house rises on the
   *  medallion; once every gift is taken, the gate opens straight away. */
  private roomCleared() {
    if (this.dead) return;
    this.phase = 'gift';
    Sfx.play(this, 'clear');
    const k = T.run.slowMo;
    this.time.timeScale = this.tweens.timeScale = k;
    this.physics.world.timeScale = 1 / k; // Arcade's scale is a slowdown factor
    this.time.delayedCall(T.run.slowMoMs * k, () => {
      this.time.timeScale = this.tweens.timeScale = this.physics.world.timeScale = 1;
      this.time.delayedCall(T.run.giftDelayMs, () => {
        if (this.dead) return;
        if (!offerable(GIFTS, this.gifts).length) this.openGate();
        else this.pickup = Rats.pickup(this, this.room.medallion.x, this.room.medallion.y);
      });
    });
  }

  /** The hero steps on the gift: the action pauses and up to three gifts that may be offered are. */
  private openGifts() {
    this.phase = 'choose';
    this.hero.setVelocity(0);
    this.physics.pause();
    this.pickup!.take();
    this.pickup = undefined;
    Sfx.play(this, 'gift');
    this.offer = drawGifts(offerable(GIFTS, this.gifts), 3, Math.random);
    this.cards = Rats.cards(this, this.offer, this.gifts);
  }

  /** Card `i` of the offer is taken (a key or a click), replacing the gift in its slot if any; the cards close, the
   *  action resumes, the gate rises. */
  private pick(i: number) {
    if (!this.cards?.choose(i, () => {
      this.cards = undefined;
      this.physics.resume();
      this.openGate();
    })) return;
    const id = this.offer[i];
    this.gifts = take(GIFTS, this.gifts, id);
    if (id === 'survivant') this.health += T.gifts.blood;
    this.hud.health(this.health, this.maxHealth());
    this.hud.gifts(this.gifts);
    Sfx.play(this, 'gift', 1);
  }

  private openGate() {
    this.phase = 'exit';
    Room.raiseGate(this, T.run.gateMs);
    this.gateUpAt = this.time.now + T.run.gateMs;
    Sfx.play(this, 'gate');
  }

  /** Into the open gate: fade to black, then the next room (another layout than this one), health and gifts kept. Down
   *  the refuge's stairs: a new run, room 1 in the crypt (in training, the training room). */
  private leave() {
    this.phase = 'leave';
    this.hero.setCollideWorldBounds(false);
    this.cameras.main.fadeOut(T.run.fadeMs);
    const next: Run = this.layout !== 'refuge' ? { room: this.roomNo + 1, layout: nextLayout(this.roomNo + 1, this.layout, Room.LAYOUTS, Math.random), health: this.health, gifts: this.gifts }
      : this.training ? { training: true, gifts: this.gifts, layout: 'hall' } : { layout: 'hall' };
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(next));
  }

  private maxHealth() {
    return T.hero.maxHealth + (this.gifts.includes('survivant') ? T.gifts.blood : 0);
  }

  private dashCooldown() {
    return T.dash.cooldownMs / (this.gifts.includes('fuite') ? T.gifts.dashRecharge : 1);
  }

  /** `n` rats let loose at floor point `at`: by the mist (Nuée) or out of the glyph's `nest` (Glyphe du nid). */
  private releaseRats(at: { x: number; y: number }, n: number, nest = false) {
    for (let i = 0; i < n; i++)
      this.rats.push({ s: Rats.rat(this, at.x + Phaser.Math.Between(-6, 6), at.y + Phaser.Math.Between(-3, 3)), heading: Math.random() * 2 * Math.PI, phase: i * 2.1, until: this.time.now + T.gifts.ratLifeMs, nest });
  }

  /** Each rat zigzags at the enemy nearest to it and bites once; with none left it runs off and is gone. */
  private stepRats(time: number, delta: number) {
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
    this.rats = this.rats.filter((r) => {
      const d = (e: Sprite) => Phaser.Math.Distance.Between(r.s.x, r.s.y, e.body!.center.x, e.body!.center.y);
      const e = live.length ? live.reduce((a, b) => (d(a) < d(b) ? a : b)) : undefined;
      if (e) r.heading = Phaser.Math.Angle.Between(r.s.x, r.s.y, e.body!.center.x, e.body!.center.y);
      const angle = r.heading + Math.sin(time / 70 + r.phase) * 0.6, step = (T.gifts.ratSpeed * delta) / 1000;
      r.s.setPosition(r.s.x + Math.cos(angle) * step, r.s.y + Math.sin(angle) * step);
      Rats.scurry(r.s, angle, time);
      if (e && d(e) < 6) {
        this.hurtEnemy(e, T.gifts.ratDamage);
        Sfx.play(this, 'hit');
      } else if (time < r.until && this.room.bounds.contains(r.s.x, r.s.y)) return true;
      Rats.vanish(this, r.s);
      return false;
    });
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
    if (this.dead || (this.training && Training.opts.god) || now < this.invulnUntil || now < this.dashUntil) return false;
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
      this.time.delayedCall(stop, () => this.phase !== 'choose' && this.physics.resume());
    }
    if (this.health > 0) return true;
    this.dead = true;
    Sfx.play(this, 'death');
    this.hero.disableBody(false, false);
    // Back to the refuge, re-formed at his coffin (a new run starts down its stairs), or back to the training room.
    this.time.delayedCall(1200, () => this.scene.restart((this.training ? { training: true, gifts: this.gifts, layout: this.layout } : {}) satisfies Run));
    return true;
  }

  /** The part of the room a feet line `y` is in (the hero's by default): 0 at the bottom, one more past each line. */
  private section(y = this.hero.body!.bottom) {
    return this.room.sections.filter((l) => y < l).length;
  }

  private spawnWave() {
    if (this.dead) return;
    // A tall room's waves follow the hero up: the next one waits until he has climbed into its part, then rises from
    // the spawn points of the part he is in, and its lanterns are counted and planted there.
    const part = this.section(), here = (p: { y: number }) => this.section(p.y) === part;
    this.waveDue = part < Math.min(this.wave - (this.roomNo - 1) * T.run.wavesPerRoom, this.room.sections.length);
    if (this.waveDue) return;
    const spawns = this.room.spawns.filter((p) => here({ y: p.y + 8 })); // sprite position -> feet
    // From the second wave the Order joins in: crossbowmen (one, then two) take the spawn points farthest from the hero.
    const far = (p: { x: number; y: number }) => Phaser.Math.Distance.BetweenPoints(p, this.hero);
    const bows = [...spawns].sort((a, b) => far(b) - far(a)).slice(0, Math.min(2, ++this.wave - 1));
    const lanterns = this.wave >= T.lantern.twoFromWave ? 2 : this.wave >= T.lantern.fromWave ? 1 : 0;
    while (this.lanterns.filter(here).length < lanterns && this.addLantern(this.room.spots.filter(here)));
    for (const p of spawns) this.spawn(p, bows.includes(p) ? 'crossbow' : 'ghoul');
  }

  /** An enemy rises at `p` after its telegraph: a ghoul, or one of the Order: a crossbowman (`hp` to start it
   *  weakened), a purificateur, a prêtre, a hound, a pénitent, a sonneur, an inquisiteur or a bourreau, or an Amas of
   *  ghouls (the training room's only, for now). */
  private spawn(p: { x: number; y: number }, kind: 'ghoul' | 'crossbow' | Foes.Kind, hp?: number) {
    const bow = kind === 'crossbow', human = kind !== 'ghoul' && kind !== 'amas'; // the Order's gold sigil (its hounds' too), else the ghouls' pool of blood
    (human ? Crossbow : Enemy).telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
    if (!human) Sfx.play(this, 'spawn');
    this.time.delayedCall(T.enemy.spawnTelegraphMs, () => {
      if (this.dead) return;
      const e = (Foes.isFoe(kind) ? Foes.create(this, this.enemies, kind, p.x, p.y) : (bow ? Crossbow : Enemy).create(this, this.enemies, p.x, p.y)).setCollideWorldBounds(true);
      const common = { state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, kneelUntil: 0 };
      if (Foes.isFoe(kind)) e.setData({ ...common, kind, human: kind !== 'hound' && kind !== 'amas', hp: T[kind].hp, readyAt: this.time.now + T[kind].firstMs, aim: Math.PI / 2 });
      else if (bow) e.setData({ ...common, kind: 'crossbow', human: true, hp: hp ?? T.crossbow.hp, readyAt: this.time.now + T.crossbow.firstShotMs });
      else e.setData({ ...common, hp: hp ?? T.enemy.hp, restUntil: 0 });
    });
  }
}
