import Phaser from 'phaser';
import { T } from './tuning.ts';
import { aimAt, alertness, behind, biteTarget, chargeOf, charging, notice, parries, predatory, buffered, burnsAfter, carry, dashFree, dashStopsAt, dashStrikes, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, onLine, pickSpot, placeGroups, poiseHit, rayDistance, scent, sightRange, stepsFrom, walkCells, wound, burden } from './logic.ts';
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
import * as Refuge from './refuge.ts';
import * as Loot from './loot.ts';
import * as Save from './save.ts';
import * as Shop from './shop.ts';
import * as Ronge from './ronge.ts';
import * as Zone from './zone.ts';
import * as Items from './items.ts';
import * as Cat from './catacombs.data.ts';
import * as Satchel from './satchel.ts';
import * as Boss from './boss.ts';
import * as Nourrice from './nourrice.ts';
import * as Matrice from './matrice.ts';
import * as Vesna from './vesna.ts';
import * as Powers from './powers.ts';
import * as Carte from './map.ts';
import * as Crows from './crows.ts';
import * as Enterre from './enterre.ts';
import * as Gave from './gave.ts';
import * as Chose from './chose.ts';
import * as Crocheteur from './crocheteur.ts';
import { decks, nearestEdge, struggle } from './fauna.ts';
import { WORLD, ZONES, areaAt, chokes, expedition, galleryOpen, go, homeward, isZone, lair, loose, parents, ringAt, wayBack, type Expedition, type Place, type RoomState, type ZoneId } from './world.ts';
import { value, type GiftId } from './gifts.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;
/** What an expedition carries from room to room, through scene.restart(data); {} is the refuge, where the game starts
 *  and the hero re-forms after a death (`lost`: the blood he died with); its stairs start an expedition in la nécropole.
 *  exp: the expedition under way (its rooms as he left them, the way back), ended back at the refuge; carried: the
 *  blood in his bag; entry: where he comes in, -1 up a room's stairs (the zone: at the refuge's stairs), i down its exit i (the
 *  zone: out of its door i; the refuge: 0, up its stairs),
 *  none at the room's start; hounds: the hp of the hounds hunting him through the exit; bag: the items in his bag
 *  (`lostItems`: those he died with, and those worn not yet brought back). In the training room: gifts and
 *  their ranks (0 commun, 1 rare, 2 épique; none: commun). at: where he stands at the start (the training panel's « Aller à »). */
export type Run = {
  layout?: Room.LayoutId; health?: number; carried?: number; exp?: Expedition; entry?: number; hounds?: number[]; lost?: number;
  bag?: Items.Item[]; lostItems?: number;
  gifts?: GiftId[]; ranks?: Ranks; training?: boolean; at?: { x: number; y: number };
};
type Ranks = Partial<Record<GiftId, number>>;
type Rat = { s: Phaser.GameObjects.Sprite; heading: number; phase: number; until: number; from?: 'dash' | 'jet'; dmg: number; bites: number; next: number; prey?: Sprite };
// A room: the hero walks in (up its stairs, or down from one of its exits), plays, and walks out by any exit when he
// pleases: deeper up through its open portcullises, back down its stairs.
type Phase = 'enter' | 'play' | 'leave';
type Placed = { hp?: number; home?: { x: number; y: number }; alert?: boolean; followed?: boolean; pack?: number };
type Blood = { x: number; y: number; blood: number };
type Lying = { x: number; y: number; item: Items.Item; fx: Loot.Glint; label: Loot.Label }; // an item on the floor
const NAV = 8; // walk grid cell, px
type Kind = 'ghoul' | 'crossbow' | 'nourrice' | 'matrice' | 'crows' | Foes.Kind;
const BOSS: Record<string, string> = { nourrice: 'La Nourrice', matrice: 'La Matrice' }; // their names, on their blood bar
/** The necropolis' creatures with their own AI module (crows.ts, enterre.ts, gave.ts, chose.ts): neither the Order nor human. */
const FAUNA: readonly string[] = ['crows', 'enterre', 'gave', 'chose'];
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
  private hurtFrom?: number; // the way the last blow travelled, when it came from a point (Hero.show: the side he reels from)
  private shoveUntil = 0; // thrown by a hound's leap: he goes along `shove` until then
  private shove = new Phaser.Math.Vector2();
  private dazedUntil = 0; // stunned by a bell's ring: no move, no dash, no blow until then
  private dashPressedAt = -1e9;
  private queued?: { act: () => boolean; at: number; wait: number }; // the input buffer, see press()
  private commitUntil = 0; // an action's committed frames: the mist waits for their end (logic.ts dashFree)
  private aimMouse = false; // the mouse aims (moved or clicked last), else the keys (J, K, L pressed last): see create()
  private look = new Phaser.Math.Vector2(); // the camera's look ahead (T.camera), room px
  private slowAt = -1e9; // the last foe of a fight down: the world's clocks run slow from then (T.feel, update())
  private parryAt = -1e9; // la parade raised (T.parry): its window from then
  private openUntil = 0; // the parry's pose, and after a miss its recovery: no blow, mist, shard, glyph nor parry until then
  private parriedAt = -1e9; // the last blow he turned aside
  private clawDownAt = 0; // the claws held since (the button or J; 0: let go), for le coup chargé (T.charge)
  private clawMouse = false; // held on the mouse: the charge aims at the pointer, else where he faces
  private chargeAt = 0; // charging since (0: not)
  private chargeFull = false; // its full charge already told (the glint)
  private dead = false;
  private lanterns: Lantern.Lantern[] = [];
  private litMs = 0; // time the hero has stood in holy light, back to 0 when he steps out
  private inLight = true; // he stands in light (baked, a lantern's pool): the foes notice him from farther (hunts())
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
  private at?: { x: number; y: number };
  private carried = 0; // blood in his bag
  private dripAt = 0; // when his bag drips next (weight())
  private hounds: number[] = [];
  private lost = 0;
  private drops: (Blood & { fx: Loot.Drop })[] = [];
  private caches: (Blood & { item?: Items.Item; fx: Loot.Cache; label: Loot.Label })[] = [];
  private labels: { at: { x: number; y: number }; l: Loot.Label }[] = []; // where the exits lead, the basin
  private gateWords = new Map<string, { at: { x: number; y: number }; l: Loot.Label }[]>(); // a shut shortcut's, by its id
  private propBoxes: Phaser.Physics.Arcade.StaticBody[] = []; // what stops bolts (and sight)
  private passage?: { x: number; y: number }; // out of the zone's gallery: the mouth he comes out of
  private passedAt = -1e9; // when he last came out of it: its mouths take him again a while later only
  private rats: Rat[] = [];
  private vermin: { s: Phaser.GameObjects.Sprite; home: { x: number; y: number }; heading: number; turnAt: number }[] = []; // the catacombs' rats, about their nests
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
  private bag: Items.Item[] = []; // the items carried (Save.data.worn: those worn)
  private lostItems = 0;
  private loot: Lying[] = []; // items on the floor
  private gear = Items.stats([]); // the bonuses of the items worn (dress())
  // The items' panel, open: le sac (an expedition: the game paused) or le coffre (the refuge); `ground`: the item on the
  // floor he would take, his bag full.
  private satchel?: { panel: Satchel.Panel; view: Satchel.View; mode: 'sac' | 'coffre'; ground?: Lying };
  private fight?: { boss: Sprite; gate: Zone.Gate; eye: Phaser.GameObjects.Zone }; // La Matrice's, in the catacombs' arena, its grille shut behind him; `eye`: what the camera follows meanwhile
  private cut = false; // a scene plays (Vesna freed): he stands, the world waits
  private vesna?: ReturnType<typeof Vesna.create>; // at the refuge, freed, behind her stall
  private stall?: Vesna.Stall; // her powers, open: the hero waits
  private carte?: Carte.Carte; // the zone's map, open (key C): the game paused
  private heldBy?: Sprite; // l'Enterré holding him by the ankle, a Crocheteur's hook in his net: he stands, dragged, until he struggles free
  private pull?: { x: number; y: number; speed: number }; // where the hold drags him (none: toward who holds him)
  private netUntil = 0; // under a Crocheteur's net until then, or until he tears free (netPoints)
  private netPoints = 0;
  private netG?: Phaser.GameObjects.Graphics;
  private fly?: { x: number; y: number; dx: number; dy: number; at: number; into: boolean }; // flung by la Chose du gouffre
  private bodies: Foes.Ctx['bodies'] = []; // the dead lying on the floor (a Gavé eats them)
  private ctx!: Foes.Ctx; // what the foes' own AI modules may ask of this room

  constructor() {
    super('room');
  }

  init(data: Run) {
    // The scene instance is reused on restart, so every field is reset here; the expedition carries on through `data`.
    this.layout = data.layout ?? 'refuge';
    this.exp = data.exp;
    this.entry = data.entry;
    this.at = data.at;
    this.carried = data.carried ?? 0;
    this.hounds = data.hounds ?? [];
    this.lost = data.lost ?? 0;
    this.drops = [];
    this.caches = [];
    this.labels = [];
    this.gateWords = new Map();
    this.passage = undefined;
    this.passedAt = -1e9;
    this.navFrom = -1;
    this.training = !!data.training;
    // the training room's gifts, toggled; out there, the Rat house's powers worn (bought from Vesna, at their commun rarity)
    this.gifts = data.training ? [...(data.gifts ?? [])] : Powers.worn(Save.data);
    this.ranks = data.training ? { ...data.ranks } : {};
    this.kills = 0;
    this.swarmUntil = this.swarmReadyAt = 0;
    this.swarmFx = undefined;
    this.gnawAt = new Map();
    this.gear = Items.stats(Save.data.worn); // before maxHealth()
    this.health = data.health ?? this.maxHealth();
    this.facing = Math.PI / 2; // start facing the camera
    this.dashUntil = this.dashReadyAt = this.slashReadyAt = this.slashUntil = this.shotReadyAt = this.shotUntil = this.invulnUntil = this.combo = this.shoveUntil = this.dazedUntil = 0;
    this.lastSlashAt = this.hurtAt = -1e9;
    this.dead = false;
    this.dashPressedAt = -1e9;
    this.queued = undefined;
    this.commitUntil = 0;
    this.look.set(0);
    this.slowAt = -1e9;
    this.litMs = 0;
    this.lanterns = [];
    this.biteAt = -1e9;
    this.biteReadyAt = 0;
    this.prey = undefined;
    this.phase = data.entry !== undefined ? 'enter' : 'play';
    this.walk = isZone(this.layout) ? 1 : this.layout === 'refuge' || data.entry === -1 ? -1 : 1; // up from stairs, down from an exit (out of a zone's doors)
    this.rats = [];
    this.vermin = [];
    this.glyph = undefined; // the last scene's is ended on its shutdown
    this.glyphReadyAt = this.castUntil = 0;
    this.nestAt = Infinity;
    this.ronge = this.counter = undefined;
    this.bag = [...(data.bag ?? [])];
    this.lostItems = data.lostItems ?? 0;
    this.loot = [];
    this.satchel = undefined;
    this.fight = this.vesna = this.stall = this.carte = undefined;
    this.cut = false;
    this.heldBy = this.pull = this.netG = this.fly = undefined;
    this.netUntil = this.netPoints = 0;
    this.bodies = [];
  }

  preload() {
    Hero.preload(this);
    Hud.preload(this);
    Room.preload(this, this.layout, this.zoneDoor() ?? { x: 0, y: 0 });
    Foes.preload(this); // the training room calls them into any room
    if (this.layout === 'refuge') { Ronge.preload(this); Satchel.preloadChest(this); }
    if (this.layout === 'refuge' || this.layout === 'catacombs') Vesna.preload(this);
    if (this.layout === 'catacombs' || this.training) { Matrice.preload(this); Nourrice.preload(this); } // the training room calls l'Araignée in too
    Carte.preload(this, this.layout);
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
      : this.phase !== 'enter' ? this.at ?? this.room.heroStart : this.walk < 0 ? this.room.stairs : { x: this.room.exits[this.entry!].x, y: this.room.bounds.top - 18 };
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
    const lights = () => [...(this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && (['priest', 'inquisitor', 'bourreau', 'nourrice', 'matrice'].includes(e.getData('kind')) || ['ignite', 'fire', 'raise', 'toll'].includes(e.getData('state'))))
      .map((e) => ({ ...(e.getData('kind') === 'nourrice' ? Nourrice.lamp(e) : e.getData('kind') === 'matrice' ? Matrice.lamp(e) : Foes.lamp(e)), lit: true, I: this.glow(e) })), ...this.lanterns];
    if (this.room.zone) Dark.light(this, this.hero, this.enemies, lights, [ZONES[this.room.zone.id].SW, ZONES[this.room.zone.id].SH], this.room.look, this.room.zone.chunks.quads);
    else Dark.light(this, this.hero, this.enemies, lights, [this.room.width, this.room.height], this.room.look);
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    this.physics.add.overlap(this.shards, this.enemies, (b, e) => this.shardHit(b as Phaser.GameObjects.Zone, e as Sprite));
    this.ctx = {
      scene: this, hero: this.hero, enemies: this.enemies, bodies: this.bodies,
      lit: () => this.inLight, loud: () => this.weight().notice, dodging: () => this.time.now < this.dashUntil || this.time.now < this.swarmUntil,
      damageHero: (a, from) => this.damageHero(a, from), hunts: (e) => this.hunts(e, this.time.now), idle: (e) => this.idle(e),
      way: (e) => this.wayToHero(e), keepAt: (...a) => this.keepAt(...a),
      hold: (by, pull) => { [this.heldBy, this.pull] = [by, pull]; if (by) this.hero.setVelocity(0); }, heldBy: () => this.heldBy,
      pits: this.room.pits.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody),
      fling: (dx, dy, into) => this.fling(dx, dy, into),
      netted: () => this.netted(), net: () => { [this.netUntil, this.netPoints] = [this.time.now + T.crocheteur.netMs, 0]; },
      marks: (e) => [...(this.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable && !this.aloft(o) && !['crows', 'chose', 'enterre'].includes(o.getData('kind'))).map((o) => o.body!.center),
        ...this.lanterns.filter((l) => l.lit), ...(this.room.zone?.lamps ?? [])],
    };
    // The dead as they settle on the floor (foes.ts, enemy.ts): food for a Gavé.
    const lie = (b: Foes.Ctx['bodies'][number]) => this.bodies.push(b);
    this.events.on('corpse', lie);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('corpse', lie));
    // Held by l'Enterré, or netted: each direction key pressed anew is a struggle.
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => !ev.repeat && /^(Key[WASDZQ]|Arrow)/.test(ev.code) && this.struggle('key'));

    this.hud = Hud.create(this);
    // Vermine's price: climbing into a new room, its rats take their due (never his last blood).
    if (this.phase === 'enter' && this.has('vermine') && this.health > 1) {
      this.health = Math.max(1, this.health - T.pacts.vermine.toll);
      this.time.delayedCall(T.expedition.fadeMs, () => Fx.hurt(this, 1));
    }
    this.hud.health(this.health, this.maxHealth());

    this.keys = this.input.keyboard!.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,K,F,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // Left click slashes, right click shoots, both toward the pointer; J and K do the same toward where he faces. F bites,
    // unaimed, or searches what is at hand. The aim: the mouse once moved or clicked, the keys once J, K or L is pressed;
    // E casts the glyph at the pointer or, the keys aiming, ahead of him like L (no blow aims at a pointer left aside).
    // The claws held on (the left button, J) charge a heavy blow, let go to strike (T.charge). X or the middle button
    // parries (T.parry), toward the pointer while the mouse aims, else where he faces: X is X on AZERTY and QWERTY alike,
    // under the left hand, and free.
    const world = (p: Phaser.Input.Pointer) => this.cameras.main.getWorldPoint(p.x, p.y);
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.carte) return void this.closeMap();
      if (this.counter) { // a card buys, anywhere else leaves
        const i = this.counter.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM);
        return void (i < 0 ? this.closeShop() : this.sell(i));
      }
      if (this.stall) { // Vesna's: a card buys, wears or takes off; anywhere else leaves
        const i = this.stall.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM);
        return void (i < 0 ? this.closeStall() : this.trade(i));
      }
      if (this.satchel) { // a cell is worn or taken off, anywhere else closes
        const i = this.satchel.panel.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM);
        return void (i < 0 ? this.closeSatchel() : this.act(i));
      }
      this.aimMouse = true;
      const w = world(p), a = Math.atan2(w.y - this.hero.y, w.x - this.hero.x);
      if (p.button === 0) {
        [this.clawDownAt, this.clawMouse] = [this.time.now, true];
        this.press(() => this.slash(a));
      } else if (p.button === 1) this.press(() => this.parry(a));
      else if (p.button === 2) this.press(() => this.shoot(a));
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => p.button === 0 && this.clawMouse && this.release());
    this.keys.J.on('down', () => {
      const a = this.facing;
      [this.aimMouse, this.clawDownAt, this.clawMouse] = [false, this.time.now, false];
      this.press(() => this.slash(a));
    });
    this.keys.J.on('up', () => !this.clawMouse && this.release());
    this.input.keyboard!.on('keydown-X', (ev: KeyboardEvent) => { if (ev.repeat) return; const a = this.aimMouse ? Phaser.Math.Angle.BetweenPoints(this.hero, world(this.input.activePointer)) : this.facing; this.press(() => this.parry(a)); });
    this.keys.K.on('down', () => { const a = this.facing; this.aimMouse = false; this.press(() => this.shoot(a)); });
    this.keys.F.on('down', () => (this.counter ? this.closeShop() : this.stall ? this.closeStall() : this.satchel ? this.closeSatchel() : this.press(() => this.bite())));
    // Le Rongé's wares: hovered, bought by their key or a click, left with Escape (or F).
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.aimMouse = true;
      this.counter?.hover(this.counter.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM));
      this.stall?.hover(this.stall.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM));
      const i = this.satchel?.panel.at(p.x / Dark.ZOOM, p.y / Dark.ZOOM) ?? -1, moved = p.x !== p.prevPosition.x || p.y !== p.prevPosition.y; // a still mouse leaves the keys' cursor be
      if (i >= 0 && moved && i !== this.satchel!.view.cursor) this.showSatchel({ cursor: i });
    });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'].forEach((k, i) => this.input.keyboard!.on(`keydown-${k}`, () => (this.counter ? this.sell(i) : this.stall ? this.trade(i) : this.satchel && i < 7 && this.act(Items.SLOTS.length + i))));
    this.input.keyboard!.on('keydown-ESC', () => (this.carte ? this.closeMap() : this.satchel ? this.closeSatchel() : this.stall ? this.closeStall() : this.closeShop()));
    // The items' panel: I (or Tab) opens le sac and closes it; the arrows (or ZQSD, WASD) move the cursor, Enter or
    // Space wears or takes off what it is on.
    this.input.keyboard!.addKeys('TAB,I,ENTER,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE'); // their Key objects: a key held, or a doubled keydown, acts once
    for (const k of ['I', 'TAB']) this.input.keyboard!.on(`keydown-${k}`, () => (this.satchel ? this.closeSatchel() : this.openSatchel('sac')));
    for (const [keys, dx, dy] of [[['LEFT', 'Q', 'A'], -1, 0], [['RIGHT', 'D'], 1, 0], [['UP', 'Z', 'W'], 0, -1], [['DOWN', 'S'], 0, 1]] as const)
      for (const k of keys) this.input.keyboard!.on(`keydown-${k}`, () => this.satchel && this.showSatchel({ cursor: this.satchel.panel.next(this.satchel.view.cursor, dx, dy) }));
    for (const k of ['ENTER', 'SPACE']) this.input.keyboard!.on(`keydown-${k}`, () => this.satchel && this.act(this.satchel.view.cursor));
    // Key events, not JustDown polling: a tap shorter than one frame would otherwise be lost.
    for (const k of [this.keys.SPACE, this.keys.SHIFT]) k.on('down', () => !this.satchel && !this.carte && (this.dashPressedAt = this.time.now));
    this.input.keyboard!.on('keydown-C', () => (this.carte ? this.closeMap() : this.openMap())); // la carte (M mutes)
    // Le Glyphe: E casts it at the pointer (the mouse aiming), L ahead of the hero.
    const castAt = (to: { x: number; y: number }) => this.press(() => this.cast(to));
    const ahead = () => {
      const f = this.hero.body!.center;
      return { x: f.x + Math.cos(this.facing) * T.glyph.near, y: f.y + Math.sin(this.facing) * T.glyph.near };
    };
    this.input.keyboard!.on('keydown-E', () => castAt(this.aimMouse ? world(this.input.activePointer) : ahead()));
    this.input.keyboard!.on('keydown-L', () => { this.aimMouse = false; castAt(ahead()); });
    this.input.keyboard!.on('keydown-R', () => this.press(() => this.swarm(this.training))); // la Nuée
    this.input.keyboard!.on('keydown-M', () => (this.sound.mute = !this.sound.mute));
    // P: full screen in and out (the whole page, so the training panel comes along); refused: nothing happens.
    this.input.keyboard!.on('keydown-P', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));

    const toggleTraining = () => this.scene.restart((this.training ? {} : { training: true, layout: 'necropolis' }) satisfies Run); // at the necropolis' stairs up, spawn points all round; its panel picks another room
    this.input.keyboard!.on('keydown-T', toggleTraining);
    if (this.training) {
      this.hud.title('Entraînement');
      let calls = 0;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, Training.panel({
        gifts: this.gifts,
        spawn: (k) => {
          if (k === 'lantern') return void this.addLantern();
          if (k === 'chose') { // at the chasm's nearest deck (the bridge, the causeway); elsewhere at a spawn point, over a placeholder edge
            const edge = nearestEdge(decks(this.ctx.pits), this.hero.body!.center), view = this.cameras.main.worldView;
            return void this.spawn(edge ?? this.room.spawns.find((p) => view.contains(p.x, p.y) && Phaser.Math.Distance.BetweenPoints(p, this.hero) > 50) ?? this.room.spawns[0], 'chose');
          }
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
        go: (layout, at, full, bag) => this.scene.restart({ layout, at, bag, carried: full ? this.bloodBag() : 0 } satisfies Run), // out of the training room, on an expedition of its own
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
   *  what he carries and wears goes into le coffre, acquired for good. Re-formed after a death, what he lost is said.
   *  The basin takes the blood he carries (update()). */
  private home() {
    const B = Refuge.BASIN, S = this.room.exits[0], R = Refuge.RONGE, C = Refuge.CHEST;
    this.labels.push({ at: B, l: Loot.label(this, B.x - 12, B.y - 2, 'Bassin de sang') }, { at: { x: S.x, y: Refuge.STAIRS }, l: Loot.label(this, S.x, Refuge.STAIRS - 20, WORLD.necropolis.name) });
    this.ronge = Ronge.create(this, R.x, R.y);
    Satchel.chest(this, C.x, C.y);
    this.labels.push({ at: C, l: Loot.label(this, C.x, C.y - 24, 'Le coffre (F)') });
    if (this.exp) {
      Save.log({ end: 'retour', deepest: this.exp.deepest, blood: this.carried, life: this.health, s: Math.round((Date.now() - this.exp.startedAt) / 1000), loosed: this.exp.loosed, met: this.exp.met, boss: this.exp.boss });
      Save.data.dry++; // back: le Rongé hungers until blood is poured
      const kept = Items.bank(Save.data, this.bag);
      Save.store();
      this.exp = undefined;
      this.health = this.maxHealth();
      this.hud.health(this.health, this.health);
      if (kept) this.hud.title(`${kept} objet${kept > 1 ? 's' : ''} au coffre`);
    } else if (this.lost || this.lostItems) {
      const k = this.lostItems, things = k ? `${k} objet${k > 1 ? 's' : ''}` : '';
      this.hud.title(this.lost && k ? `${this.lost} sang et ${things} perdus` : k ? `${things} perdu${k > 1 ? 's' : ''}` : `${this.lost} sang perdu`);
    }
    this.labels.push({ at: R, l: Loot.label(this, R.x, R.y - 35, Shop.beast(Save.data) ? 'Il grogne' : 'Le Rongé (F)') });
    if (Save.data.vesna) { // freed: back at her shop, behind her stall
      const V = Refuge.VESNA;
      this.vesna = Vesna.create(this, V.x, V.y);
      this.labels.push({ at: { x: V.x, y: V.y + 28 }, l: Loot.label(this, V.x, V.y - 44, 'Vesna (F)') });
    }
  }

  /** A place of the expedition, as he left it, or, entered for the first time, its foes placed and its caches hidden
   *  (a zone's by area, each from its ring's pools: the catacombs' their own); the words over its exits; the hounds that
   *  hunted him here come in after him. */
  private enterRoom() {
    const W = WORLD[this.here], E = T.expedition, ring = W.ring, r = this.room, zone = this.room.zone, d = this.zoneDoor(), Z = zone && ZONES[zone.id];
    if (W.ahead.length && !zone) Room.raiseGate(this, 1); // open: he goes deeper when he pleases
    const at = this.at ?? d ?? (this.entry === undefined ? r.heroStart : this.entry < 0 ? { x: r.stairs.x, y: r.bounds.bottom } : r.exits[this.entry]);
    this.exp ??= expedition(ring); // a room opened directly (scripts, tools): an expedition of its own
    const pools = (zone?.id === 'catacombs' ? E.catacombs : E.pools) as readonly (readonly (readonly string[])[])[];
    const groups = (pool: number, n: number, spawns: { x: number; y: number }[]) => placeGroups(pools[pool], n, spawns, at, E.clear, zone ? E.zoneGap : E.gap, Math.random)
      .flatMap((g) => g.kinds.map((kind, i) => ({ x: g.at.x + (i % 2 ? 12 : -12) * Math.ceil(i / 2), y: g.at.y, kind }))); // side by side: they push each other off
    const hide = (list: { x: number; y: number }[]) => Phaser.Utils.Array.Shuffle([...list]).slice(0, Phaser.Math.Between(E.caches[0], E.caches[1]));
    const inArea = (p: { x: number; y: number }, [x0, y0, x1, y1]: readonly number[]) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
    const st: RoomState = (this.exp.rooms[this.here] ??= {
      foes: (Z
        ? Z.AREAS.flatMap((a, k) => groups(a.ring, a.groups, Z.SPAWNS.filter((p) => p[2] === k).map(([x, y]) => ({ x, y }))))
        : [...groups(ring, E.groups[ring], r.spawns), ...((E.guards as Record<string, readonly string[]>)[this.layout] ?? []).map((kind) => ({ ...r.medallion, kind }))]
      ).map((f) => ({ ...f, hp: stats(f.kind).hp, home: { x: f.x, y: f.y } })),
      // the zone's: one or two in each area
      caches: (Z ? Z.AREAS.flatMap((a) => hide(W.caches.filter((c) => inArea(c, a.rect) && Z.AREAS.find((b) => inArea(c, b.rect)) === a))) : hide(W.caches))
        .map((c) => ({ ...c, blood: T.blood.cache * T.blood.ring[this.ring(c)], item: this.found(this.ring(c), !!zone && (T.items.sure as readonly string[]).includes(areaAt(zone.id, c.x, c.y)?.id ?? '')) })),
      drops: [],
      items: [],
    });
    for (const f of st.foes) this.place(f, f.kind as Kind, f);
    for (const c of st.caches) this.caches.push({ ...c, fx: Loot.cache(this, c.x, c.y), label: Loot.label(this, c.x, c.y - 26, 'fouiller (F)') });
    for (const d of st.drops) this.addDrop(d);
    for (const l of st.items) this.addLoot(l);
    this.loose(T.expedition.titleMs); // packs his scent called with nowhere to go, now that he is farther from the refuge
    const back = this.exp.came[this.here]?.from ?? parents(this.here)[0].from;
    if (zone) {
      this.doorLabels();
      for (const g of zone.gates) if (!g.open) this.gateLabels(g);
      if (galleryOpen(Save.data.shortcuts)) this.galleryLabels();
      if (zone.id === 'catacombs' && !Save.data.vesna) { const a = Cat.RELIQUARY.at; this.labels.push({ at: a, l: Loot.label(this, a.x, a.y - 70, 'Le reliquaire (F)') }); }
    } else {
      r.exits.forEach((g, i) => W.ahead[i] && this.labels.push({ at: g, l: Loot.label(this, g.x, g.y - 4, WORLD[W.ahead[i]].name) }));
      this.labels.push({ at: { x: r.stairs.x, y: r.bounds.bottom }, l: Loot.label(this, r.stairs.x, r.bounds.bottom - 26, WORLD[back].name) });
    }
    const door = d ? { x: d.x, y: d.y - 4 } : (this.entry ?? -1) < 0 ? { x: at.x, y: r.bounds.bottom - 16 } : { x: at.x, y: r.bounds.top + 4 }; // sprite, feet inside
    for (const hp of this.hounds) this.time.delayedCall(T.sight.followMs, () => !this.dead && this.place(door, 'hound', { hp, alert: true, followed: true }));
  }

  /** In a zone, the door he comes out of: the way up he came in by (entry -1 - k: the necropolis' refuge stairs, the
   *  catacombs' well or caveau), else the door of the place he comes back from. */
  private zoneDoor() {
    if (!isZone(this.layout)) return undefined;
    const e = this.entry ?? -1;
    return e < 0 ? Zone.ups(this.layout)[-1 - e] : Zone.exits(this.layout)[e];
  }

  /** The ring where floor point `p` lies: a zone's by area, a room's own. */
  private ring(p: { x: number; y: number }) {
    return this.room.zone ? ringAt(this.room.zone.id, p.x, p.y) : WORLD[this.here].ring;
  }

  /** A zone's words over its doors and ways up (`only`: that one's): where each leads; none while a gate shuts it. */
  private doorLabels(only?: string) {
    const z = this.room.zone!, W = WORLD[this.here], D = ZONES[z.id].DOORS, shut = (k: string) => z.gates.some((g) => g.id === k && !g.open);
    const put = (k: string, to: Place) => { if (!shut(k) && (!only || k === only)) this.labels.push({ at: D[k], l: Loot.label(this, D[k].x, D[k].y - 44, WORLD[to].name) }); };
    W.doors!.forEach((k, i) => put(k, W.ahead[i]));
    W.up!.forEach((k, i) => put(k, parents(this.here)[i].from));
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
    for (const t of ZONES[this.room.zone!.id].TUNNEL) this.labels.push({ at: t, l: Loot.label(this, t.x, t.y - 44, 'La galerie') });
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
      [this.phase, this.walk, this.passage, this.passedAt] = ['enter', 1, to, Infinity];
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
    this.doorLabels(g.id); // le caveau's stairs: where they lead
    this.walkGrid();
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    this.castUntil = this.time.now + T.glyph.castMs;
    this.cameras.main.shake(900, new Phaser.Math.Vector2(1.5 / this.cameras.main.width, 1.5 / this.cameras.main.height));
    Sfx.play(this, 'thunk');
    this.hud.title(`${g.name} : ouverte pour toujours.`);
    return true;
  }

  /** Frames the room in the view (see main.ts), on creation and live on every resize: a resize mid-fight
   *  keeps everything as it is. Along a side where the room is smaller than the view, it sits in the middle, its
   *  surroundings round it; where it is larger (a tall window, the tall cloister), the camera follows the hero,
   *  smoothly, kept inside the room. */
  private frame() {
    const w = this.scale.width / Dark.ZOOM, h = this.scale.height / Dark.ZOOM, rw = this.room.width, rh = this.room.height;
    this.cameras.main.setBounds(Math.min(0, Math.floor((rw - w) / 2)), Math.min(0, Math.floor((rh - h) / 2)), Math.max(rw, w), Math.max(rh, h))
      .startFollow(this.hero, true, 0.08, 0.08);
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    // The last foe of a fight down (kill()): the clocks of tweens and timers (its death, its blood) run slow, easing back.
    const slow = time - this.slowAt;
    this.time.timeScale = this.tweens.timeScale = slow >= 0 && slow < T.feel.slowMs ? Phaser.Math.Linear(T.feel.slow, 1, (slow / T.feel.slowMs) ** 2) : 1;
    if (this.ronge) this.ronge.show(Shop.beast(Save.data) ? 'beast' : Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.RONGE) < T.ronge.notice ? 'look' : 'idle', time, this.hero.x);
    this.vesna?.show(this.stall || Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, this.vesna.s) < T.ronge.notice ? 'count' : 'idle', time);
    if (this.cut) { // a scene plays: he stands, the world waits, the zone streams round the camera
      this.hero.setVelocity(0);
      this.room.zone?.chunks.stream(this.cameras.main.worldView);
      for (const l of this.labels) l.l.near(false);
      return void Hero.show(this.hero, { moving: false, dashing: false, slashing: false, combo: 0, throwing: false, biting: false, casting: false, hurt: false, dazed: false, invulnerable: false, facing: -Math.PI / 2, swarm: false });
    }
    if (this.counter || this.satchel || this.stall || this.carte) { // he stands before the Rongé's wares, Vesna's, or his items, the words over the room gone
      for (const l of this.labels) l.l.near(false);
      return void this.hero.setVelocity(0);
    }
    const k = this.keys;
    // Coming in or going out by an exit, the hero walks on his own.
    const auto = this.phase === 'enter' || this.phase === 'leave', dazed = time < this.dazedUntil;
    const x = auto || dazed ? 0 : Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown);
    const y = dazed ? 0 : auto ? this.walk : Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown);
    // Le coup chargé: the claws held on past their press, he rears back (T.charge); a daze, a hold or a net cancel it.
    if (this.chargeAt && (dazed || this.heldBy || this.fly || this.netted() || this.prey)) this.clawDownAt = this.chargeAt = 0;
    else if (!this.chargeAt && charging(this.clawDownAt, time, T.charge.startMs) && !auto && !this.dead && time >= this.slashReadyAt && time >= this.dashUntil
      && time >= this.openUntil && time >= this.castUntil && time >= this.shotUntil && time >= this.swarmUntil && !this.queued) {
      [this.chargeAt, this.chargeFull] = [time, false];
      Sfx.play(this, 'charge', 0);
    }
    if (this.chargeAt && this.clawMouse) this.facing = Phaser.Math.Angle.BetweenPoints(this.hero, this.cameras.main.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y));
    if (this.chargeAt && !this.chargeFull && time - this.chargeAt >= T.charge.fullMs) {
      this.chargeFull = true;
      Fx.glint(this, this.hero.x + Math.cos(this.facing) * 5, this.hero.y - 18 + Math.sin(this.facing) * 3); // at the claw drawn high
      Sfx.play(this, 'charge', 1);
    }
    const posing = time < this.slashUntil || time < this.castUntil || time < this.openUntil || !!this.chargeAt;
    if ((x || y) && !posing && time >= this.shotUntil && !this.prey) this.facing = Math.atan2(y, x);

    if (Training.opts.cool) this.dashReadyAt = Math.min(this.dashReadyAt, this.dashUntil), this.swarmReadyAt = Math.min(this.swarmReadyAt, this.swarmUntil), this.glyphReadyAt = 0; // the test panel's
    if (this.heldBy && (!this.heldBy.body?.enable || (this.heldBy.getData('kind') === 'crocheteur' && this.heldBy.getData('state') !== 'drag'))) this.heldBy = undefined; // he died holding him, or was cut short
    if (this.netUntil && time >= this.netUntil) this.unnet();
    const wantsDash = buffered(time, this.dashPressedAt, 0, T.hero.bufferMs) && !auto && !dazed && !this.heldBy && !this.fly && !this.netted(); // buffered like the actions, see press()
    if (wantsDash && dashFree(time, this.dashReadyAt, this.commitUntil) && !this.prey && time >= this.swarmUntil) {
      this.dashPressedAt = -1e9;
      this.clawDownAt = this.chargeAt = 0; // the mist lets a charge go, unstruck
      if (x || y) this.facing = Math.atan2(y, x); // the way he walks, even mid-swing; else the way he faces
      // It cuts short the recovery of a blow, a throw or a cast: the claws are ready again (the dash strike as it ends).
      this.slashUntil = Math.min(this.slashUntil, time);
      this.slashReadyAt = Math.min(this.slashReadyAt, time);
      this.shotUntil = Math.min(this.shotUntil, time);
      this.castUntil = Math.min(this.castUntil, time);
      this.dashUntil = time + T.dash.durationMs * (1 + this.gear.mist);
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
      const e = !miasma && (this.enemies.getChildren() as Sprite[]).find((e) => e.body?.enable && e.getData('state') !== 'lunge' && e.getData('kind') !== 'chose' // (over the chasm: nothing to stop on)
        && dashStopsAt(b.center, b.velocity, left, e.body.center, T.dash.stopShort));
      if (e) {
        // Back out to exact contact; physics moves the sprite to its body after update().
        const c = e.body!.center, back = new Phaser.Math.Vector2(b.center.x - c.x, b.center.y - c.y).setLength(T.dash.stopShort);
        b.position.add(back.add(c).subtract(b.center));
        this.dashUntil = time;
        this.dashReadyAt = time + this.dashCooldown();
      }
    }
    if (this.fly) { // flung off the deck: through the air, no say in it; landing in the chasm, the fall
      const f = this.fly, k = Math.min(1, (time - f.at) / T.chose.throwMs);
      this.hero.setVelocity(0).body!.reset(f.x + f.dx * k, f.y + f.dy * k - Math.sin(k * Math.PI) * 8);
      if (k === 1 && f.into) this.fall();
      else if (k === 1) [this.fly, this.hero.body!.checkCollision.none] = [undefined, false];
    } else if (this.heldBy) { // held by the ankle: dragged toward the dead man's mound; hooked by the net: toward where he is hauled
      const m = this.pull ?? this.heldBy.body!.center, f = this.hero.body!.center, d = Phaser.Math.Distance.BetweenPoints(f, m);
      this.hero.setVelocity(0);
      if (d > 8) this.physics.velocityFromRotation(Phaser.Math.Angle.BetweenPoints(f, m), this.pull?.speed ?? T.enterre.drag, this.hero.body!.velocity);
    } else if (time < this.shoveUntil && time >= this.dashUntil && !this.prey) this.hero.setVelocity(this.shove.x, this.shove.y);
    else if (time >= this.dashUntil && !this.prey) { // latched, the bite moves him
      this.hero.setVelocity(x, y);
      this.hero.body!.velocity.normalize().scale(T.hero.speed * (1 + this.gear.speed) * (time < this.swarmUntil ? T.swarm.speed : posing ? 0.3 : time < this.shotUntil ? 0.5 : 1) * (this.netted() ? T.crocheteur.slow : 1) * this.weight().walk);
    }
    const W = T.blood.weight, fill = this.weight().fill; // the bag well filled drips behind him as he walks
    if (fill >= W.dripFrom && time >= this.dripAt && time >= this.dashUntil && this.hero.body!.velocity.lengthSq() > 1) {
      this.dripAt = time + W.dripMs / fill;
      Fx.drip(this, this.hero.body!.center.x, this.hero.body!.center.y, W.dripMs * 10);
    }
    if (this.netted()) { // the net over him, shaken as he struggles
      this.netG ??= this.add.graphics();
      this.netG.clear().setDepth(this.hero.depth + 13);
      Crocheteur.drawNetted(this.netG, this.hero.x, this.hero.y, Math.sin(time / 40) * Math.min(1.5, this.netPoints * 0.4));
    }

    if (this.queued && (!buffered(time, this.queued.at, this.queued.wait, T.hero.bufferMs) || (!dazed && this.queued.act()))) this.queued = undefined;
    // The predator's cue: a foe that has not noticed him within reach, he darkens (T.predator).
    const stalking = !this.dead && (this.enemies.getChildren() as Sprite[]).some((e) => e.body?.enable && !this.aloft(e) && predatory(e.getData('kind') ?? 'ghoul', !!e.getData('alert'), T.predator.immune)
      && Phaser.Math.Distance.BetweenPoints(e.body.center, this.hero.body!.center) < T.predator.near);
    const P = T.parry, guard = time < this.parryAt + P.windowMs || time - this.parriedAt < P.holdMs + 60;
    Hero.show(this.hero, {
      parry: time - this.parriedAt < 70 ? 'clang' : guard ? 'guard' : time < this.openUntil ? 'open' : undefined, charge: this.chargeAt ? chargeOf(this.chargeAt, time, T.charge.fullMs) : undefined, stalking,
      moving: (x || y) !== 0 && !this.heldBy && !this.fly, dashing: time < this.dashUntil, slashing: time < this.slashUntil, combo: this.combo, throwing: time < this.shotUntil,
      biting: !!this.prey || time - this.biteAt < 130, casting: time < this.castUntil,
      hurt: time - this.hurtAt < 120 || !!this.fly, hurtFrom: this.hurtFrom, dazed, invulnerable: time < this.invulnUntil, facing: this.facing, swarm: time < this.swarmUntil,
    });
    // Mid-swing the hero stands in front of what he strikes, so a dash-in never buries him inside a flashing enemy;
    // biting, in front of his prey.
    this.hero.setDepth(this.hero.y + (time < this.slashUntil || this.prey ? 12 : 0));
    // The camera looks ahead: toward the pointer while the mouse aims (from the screen's middle, so it never chases its
    // own scroll), else along his walk; eased, bounded, none in the boss arena (its own framing) nor walking in or out.
    const C = T.camera, cam = this.cameras.main, p = this.input.activePointer, walking = (x || y) && !auto;
    const [lx, ly] = this.fight || auto ? [0, 0] : this.aimMouse ? [((p.x - cam.width / 2) / cam.zoom) * C.mouse, ((p.y - cam.height / 2) / cam.zoom) * C.mouse]
      : walking ? [Math.cos(Math.atan2(y, x)) * C.look, Math.sin(Math.atan2(y, x)) * C.lookY] : [0, 0];
    this.look.lerp({ x: Phaser.Math.Clamp(lx, -C.look, C.look), y: Phaser.Math.Clamp(ly, -C.lookY, C.lookY) }, 1 - Math.exp(-delta / C.lookMs));
    cam.setFollowOffset(-this.look.x, -this.look.y);
    this.hud.cooldown('brume', this.dashReadyAt);
    this.hud.cooldown('griffes', this.slashReadyAt);
    this.hud.cooldown('tir', this.shotReadyAt);
    this.hud.cooldown('glyphe', this.glyphReadyAt);
    // In the training room la Nuée is always at hand (see swarm()).
    this.hud.cooldown('nuee', this.training ? (this.swarmFx ? this.swarmUntil : 0) : Powers.swarm(Save.data) ? this.swarmReadyAt : undefined);

    const feet = this.hero.body!, b = this.room.bounds, near = (p: { x: number; y: number }, r: number) => Phaser.Math.Distance.BetweenPoints(feet.center, p) < r;
    const door = this.passage ?? this.zoneDoor(), zone = this.room.zone;
    zone?.chunks.stream(this.cameras.main.worldView);
    this.scurry(time, delta);
    if (zone?.id === 'catacombs' && !this.fight && !this.training && this.phase === 'play' && Boss.fightStarts(Save.data, feet.center, Cat.ARENA)) this.startFight();
    if (this.fight) { // the camera between them both (her body as drawn, up the walls), him kept well inside the view
      const { boss: e, eye } = this.fight, v = this.cameras.main.worldView, mx = v.width / 2 - 40, my = v.height / 2 - 30; // (his feet clear of her blood bar)
      const tx = (this.hero.x + e.x) / 2, ty = (this.hero.y + e.y - (e.getData('z') ?? 0) - 50) / 2;
      eye.setPosition(Phaser.Math.Clamp(tx, this.hero.x - mx, this.hero.x + mx), Phaser.Math.Clamp(ty, this.hero.y - my, this.hero.y + my));
      this.hud.boss(BOSS[e.getData('kind')], e.getData('hp'), T[e.getData('kind') as 'matrice'].hp);
    }
    if (this.phase === 'enter' && (door ? feet.bottom > door.y + 6 : this.layout === 'refuge' ? feet.bottom < Refuge.STAIRS - 10 : this.walk < 0 ? feet.bottom < b.bottom - 16 : feet.top > b.top + 8)) {
      this.phase = 'play';
      if (this.passage) this.passedAt = time;
      this.passage = undefined;
      this.hero.setCollideWorldBounds(true);
    }
    // Out by any exit, when he pleases: down the refuge's stairs; into a door of the zone (its stairs up to the refuge); up
    // through a room's open portcullises, or down its stairs.
    if (this.phase === 'play' && this.layout === 'refuge' && feet.bottom > Refuge.STAIRS) this.leave(0);
    else if (this.phase === 'play' && !this.training && zone) { // into a door of the zone: up into its dark (a shut gate keeps him out of its recess)
      const into = (d: { x: number; y: number; w: number }) => Math.abs(feet.center.x - d.x) < d.w / 2 - 4 && feet.bottom < d.y - 3 && feet.bottom > d.y - 40; // in its recess
      const Z = ZONES[zone.id], tunnel = galleryOpen(Save.data.shortcuts) ? Z.TUNNEL : [];
      const up = Zone.ups(zone.id).findIndex(into), exit = Zone.exits(zone.id).findIndex(into), mouth = tunnel.findIndex(into);
      if (up >= 0) this.leave(-1 - up);
      else if (exit >= 0) this.leave(exit);
      else if (mouth >= 0 && time > this.passedAt + T.expedition.fadeMs * 4) this.through(tunnel[1 - mouth]);
      if (this.exp) this.exp.deepest = Math.max(this.exp.deepest, ringAt(zone.id, feet.center.x, feet.center.y));
    } else if (this.phase === 'play' && !this.training && this.layout !== 'refuge') {
      const exit = this.room.exits.findIndex((g, i) => Math.abs(feet.center.x - g.x) < 14 && WORLD[this.here].ahead[i]);
      if (feet.top <= b.top + 1 && exit >= 0) this.leave(exit);
      else if (feet.bottom >= b.bottom - 1 && Math.abs(feet.center.x - this.room.stairs.x) < 24) this.leave(-1);
    }
    for (const l of this.labels) l.l.near(near(l.at, 64)); // the basin's before he pours (T.blood.basin)
    for (const c of this.caches) c.label.near(near(c, T.blood.search + 8));
    for (const l of this.loot) l.label.near(near(l, T.items.pickup + 8));
    for (const d of [...this.drops]) if (near(d, T.blood.pickup)) this.pickUp(d);
    // The refuge's basin takes the blood he carries: banked.
    if (this.layout === 'refuge' && this.carried && near(Refuge.BASIN, T.blood.basin)) this.pour();

    // Holy light (a lantern's pool, the chapel's stained glass, the Dawn): free for a grace on stepping in, then it burns
    // on a steady beat until he steps out (or mists through); the room's own light at its own pace. The Dawn's grace is
    // long, so the danger is shown building up all through it. It disperses la Nuée at once, and with Griffes noires
    // it burns twice as fast.
    const c = this.hero.body!.center, R = T.lantern.radius; // the planted lanterns' pools, the zone's on their poles
    const lamp = this.lanterns.some((l) => Lantern.lights(l, c)) || !!this.room.zone?.lamps.some((l) => ellipseDist(l, c, R, R * T.lantern.squash) <= 1);
    this.inLight = lamp || (this.room.light?.(c.x, c.y) ?? Infinity) >= T.sight.lit;
    if (zone && !this.training) Carte.see(zone.id, c.x, c.y, this.inLight); // the map's fog
    let dawn = false;
    if (lamp || this.room.holy(c.x, c.y)) {
      if (this.swarmFx) this.unswarm();
      const L = lamp ? T.lantern : this.room.burn, grace = L.graceMs + this.gear.grace, before = burnsAfter(this.litMs, grace, L.burnEveryMs);
      this.litMs += delta * (this.has('noires') ? T.pacts.noires.burn : 1) * Math.max(0, 1 + this.gear.burn);
      dawn = L === T.dawn;
      if (!dawn) Lantern.sizzle(this, this.hero);
      if (burnsAfter(this.litMs, grace, L.burnEveryMs) > before && this.damageHero(L.damage)) {
        Lantern.sizzle(this, this.hero, true);
        Sfx.play(this, 'burn');
      }
    } else this.litMs = 0;
    Lantern.exposure(this, this.hero, dawn ? this.litMs : 0, T.dawn.graceMs + this.gear.grace, T.dawn.burnEveryMs);

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
      if (e.getData('bleedLeft') > 0 && time >= e.getData('bleedAt')) { // a weapon's bleed (Crocs de saignée): a blow at a time
        e.setData({ bleedLeft: e.getData('bleedLeft') - 1, bleedAt: time + T.items.bleedMs / T.items.bleedTicks });
        Enemy.bleed(this, e.x, e.y, -Math.PI / 2, 3, 0.8, 0.5);
        this.hurtEnemy(e, e.getData('bleedDmg'));
        if (!e.body?.enable) continue;
      }
      const kind = e.getData('kind'), bow = kind === 'crossbow';
      // Bound by the glyph, it stops dead, its lunge or aim cancelled, and cannot be shoved; it resumes once let go. A
      // prey in the hero's jaws is held by the bite instead.
      const boss = kind === 'nourrice' || kind === 'matrice', bound = !!this.glyph && !boss && kind !== 'crows' && kind !== 'enterre' && kind !== 'chose' && Glyph.binds(this.glyph, e.body.center, time); // the glyph cannot hold her, a flock, nor what lies in the earth
      const kneeling = this.kneeling(e); // a human just weakened, down on its knees: see hurtEnemy()
      e.setImmovable(bound || e === this.prey || kneeling || boss); // her brood never shoves her
      if (bound && e !== this.prey) {
        held.push(e);
        if (this.has('pestilent')) this.infect(e, this.v('pestilent'));
        e.setVelocity(0).setData({ state: 'chase', until: 0 });
      } else if (kneeling) e.setVelocity(0);
      else if (time < e.getData('stunnedUntil')) { if (!this.physics.world.isPaused) e.body.velocity.scale(Math.exp(-delta / T.poise.slideMs)); } // thrown back by a blow, it slides to a stop (not during the hit-stop)
      else if (time >= e.getData('until')) {
        if (this.training && Training.opts.passive) e.setVelocity(0).setData('state', 'chase'); // a training dummy
        else if (kind === 'nourrice') this.stepNourrice(e, time, delta); // she hunts him till one of them dies
        else if (kind === 'matrice') this.stepMatrice(e, time, delta);
        else if (kind === 'crows') Crows.step(this.ctx, e, time, delta); // the necropolis' own watch and hunt their own way
        else if (kind === 'enterre') Enterre.step(this.ctx, e, time);
        else if (kind === 'gave') Gave.step(this.ctx, e, time);
        else if (kind === 'chose') Chose.step(this.ctx, e, time);
        else if (kind === 'crocheteur') Crocheteur.step(this.ctx, e, time);
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
      if (kind === 'crows') continue; // its birds drawn by its step
      if (kind === 'chose') Chose.show(e, time);
      else if (kind === 'nourrice') Nourrice.show(e, time, time < e.getData('flashUntil'));
      else if (kind === 'matrice') Matrice.show(e, time, time < e.getData('flashUntil'), e.getData('pivot'), this.fed(e).map((g) => ({ x: g.x, y: g.y })), e.getData('state') === 'pull');
      else if (Foes.isFoe(kind)) Foes.show(e, kneeling ? 'kneel' : e.getData('state'), time < e.getData('flashUntil'), e.getData('human') && prey);
      else if (bow) Crossbow.show(e, kneeling ? 'kneel' : e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'), prey);
      else Enemy.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'));
      e.setDepth(e.y);
    }
    // Enemies hunting him off the screen (a tall window, the tall cloister) are pointed at from its edge, all alike:
    // where they are, never what they are about to do; on screen, they are not marked, nor those that have not seen him
    // (but the battue's packs in wait near him, with the Cor de chasse volé).
    const view = this.cameras.main.worldView, horn = (e: Sprite) => !!e.getData('pack') && Phaser.Math.Distance.BetweenPoints(e, feet.center) < this.gear.horn;
    this.hud.threats((this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && (e.getData('alert') || horn(e))).map((e) => ({ x: e.x - view.x, y: e.y - view.y })));
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
    if (e.getData('kind') === 'matrice') return e.getData('state') === 'pull' || e.getData('state') === 'tear' ? T.matrice.teleLight : T.matrice.light; // her sac blazing on the tell
    if (e.getData('kind') === 'nourrice') return ['tele', 'snap', 'hold', 'hurlT', 'rakeT'].includes(e.getData('state')) ? T.nourrice.teleLight : T.nourrice.light; // her seal flaring as she winds up
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
        if (inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / T.lantern.squash }, P.reach, 2 * P.halfDeg) && !this.damageHero(P.damage, from, e) && e.getData('state') !== 'lash') return; // parried: he reels
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
        if (inArc({ x: 0, y: 0 }, e.getData('aim'), { x: to.x - from.x, y: (to.y - from.y) / T.lantern.squash }, I.reach, 180) && !this.damageHero(I.damage, from, e) && e.getData('state') !== 'sweep') return; // parried: he reels
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

  // ---- The catacombs' guardian, la Matrice (T.matrice, boss.ts); la Nourrice « l'Araignée » kept for later (T.nourrice); Vesna freed. ----

  /** Off the floor (on the walls, under the vault, in the air), or under it (l'Enterré buried): out of the claws',
   *  shards' and rats' reach. */
  private aloft(e: Sprite) {
    return (e.getData('z') ?? 0) > 6 || (e.getData('kind') === 'enterre' && Enterre.under(e)) || (e.getData('kind') === 'chose' && Chose.under(e));
  }

  /** Into the arena, she alive: its grille drops behind him, the battue left outside; her wheel comes down from the vault. */
  private startFight() {
    const zone = this.room.zone!, gate = zone.gates.find((g) => g.arena)!, now = this.time.now, A = Cat.ARENA;
    Zone.lower(this, gate, this.room.obstacles, 700);
    this.walkGrid();
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    Sfx.play(this, 'gate');
    Save.data.nourrice.tries++;
    Save.store();
    if (this.exp) this.exp.boss ??= 'essai';
    const boss = this.place({ x: Cat.RELIQUARY.x, y: (A[1] + A[3]) / 2 + 10 }, 'matrice'); // hung over the arena's middle
    boss.setData({ state: 'descend', at: now, z: T.matrice.vault - 40 }); // above, in the dark, then down
    boss.body!.checkCollision.none = true;
    this.fight = { boss, gate, eye: this.add.zone(this.hero.x, this.hero.y, 1, 1) };
    this.cameras.main.startFollow(this.fight.eye, true, 0.06, 0.06);
    this.hud.title('La Matrice');
    Sfx.play(this, 'creak', 1.6);
  }

  /** The guardian is dead: the grille rises, her brood dies with her, it is saved for good. (L'Araignée, called in by
   *  the training room, fights no fight.) */
  private won(e: Sprite) {
    const f = this.fight;
    if (!f || f.boss !== e) return;
    this.fight = undefined;
    this.cameras.main.startFollow(this.hero, true, 0.08, 0.08);
    f.eye.destroy();
    Zone.raise(this, f.gate, this.room.obstacles, 1400);
    this.walkGrid();
    this.propBoxes = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    Save.data.nourrice.dead = true;
    Save.store();
    if (this.exp) this.exp.boss = 'tuée';
    this.hud.boss(undefined);
    this.time.delayedCall(600, () => { for (const o of this.enemies.getChildren() as Sprite[]) if (o.body?.enable && o.getData('torn') === e) this.kill(o); });
    this.time.delayedCall(900, () => { Sfx.play(this, 'clear'); this.hud.title(`${BOSS[e.getData('kind')]} est morte.`); });
  }

  /** Her goules alive (shaken off her, hurled). */
  private brood(e: Sprite) {
    return (this.enemies.getChildren() as Sprite[]).filter((o) => o.body?.enable && o.getData('torn') === e).length;
  }

  /** One of her goules at floor point `p`, hunting him (no blood worth drinking: like an Amas' thrall); `data`: more. */
  private hatch(e: Sprite, p: { x: number; y: number }, data = {}) {
    if (this.dead || !e.body?.enable) return;
    const b = this.room.bounds;
    this.place({ x: Phaser.Math.Clamp(p.x, b.x + 8, b.right - 8), y: Phaser.Math.Clamp(p.y, b.y + 8, b.bottom - 8) }, 'ghoul', { alert: true }).setData({ torn: e, stunnedUntil: this.time.now + 400, ...data });
  }

  /** A blow of `dmg` on her: hard enough, it shakes a clinging goule off her, which drops to the floor and hunts him. */
  private shake(e: Sprite, dmg: number) {
    const k = Boss.shed(e.getData('clinging'), this.brood(e), dmg);
    if (k < 0) return;
    const p = Nourrice.shed(e, k);
    Nourrice.fall(this, p.x, p.y, p.z, () => this.hatch(e, p));
    Sfx.play(this, 'spawn');
  }

  /**
   * La Nourrice. Phase 1: she stalks him perched high on her limbs; close, the rake (a fore-limb drawn back, then swept
   * low across her front); farther, the drop (the body sinks, the fore-limbs rear high, her joints crack, then she leaps
   * and slams down where he stood; she pulls herself up after: the time to strike). At half her blood, the Order's
   * chains snap off her (the tell) and she climbs the walls: phase 2, she crawls along the arena's edge out of reach,
   * hurls debris or a goule at him, crosses the vault over him, holds (dust falling, her joints creaking) and drops; down,
   * she pulls herself up and walks the floor a while (the rake, the drop), then climbs again.
   */
  private stepNourrice(e: Sprite, time: number, delta: number) {
    const N = T.nourrice, b = e.body!, A = e.getData('arena') as number[], from = { x: e.x, y: e.y }, to = this.hero.body!.center;
    const d = Boss.floor(from, to), toHero = Phaser.Math.Angle.BetweenPoints(from, to), st = e.getData('state');
    const lift = (z: number) => { e.setData('z', z); b.checkCollision.none = z > 0; };
    const put = (p: { x: number; y: number }) => { b.reset(p.x, p.y); e.setVelocity(0); };
    const slam = (at: { x: number; y: number }, ms: number) => {
      put(at);
      lift(0);
      Foes.slam(this, at.x, at.y, N.radius);
      Sfx.play(this, 'slam');
      if (Boss.struck(at, to, N.radius)) this.damageHero(N.dropDamage, at);
      e.setData({ state: 'stuck', until: time + ms, readyAt: time + ms + N.reloadMs });
    };
    switch (st) {
      case 'tele': { // the drop's wind-up: her eyes on him, then her aim locked
        if (time < e.getData('trackUntil')) e.setData('target', { x: to.x, y: to.y });
        const t = e.getData('target');
        e.setData('facing', Phaser.Math.Angle.BetweenPoints(from, t));
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'spring', from, springAt: time });
        return void Sfx.play(this, 'lunge');
      }
      case 'spring': { // through the air onto where he stood
        const k = (time - e.getData('springAt')) / N.leapMs, f = e.getData('from'), t = e.getData('target');
        if (k < 1) { put({ x: Phaser.Math.Linear(f.x, t.x, k), y: Phaser.Math.Linear(f.y, t.y, k) }); return lift(1 + 28 * Math.sin(Math.PI * k)); }
        return slam(t, N.stuckMs);
      }
      case 'rakeT':
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'rake', fireUntil: time + N.rakeMs });
        return void Sfx.play(this, 'lunge');
      case 'rake':
        if (Boss.raked(from, e.getData('aim'), to)) this.damageHero(N.rakeDamage, from);
        if (time >= e.getData('fireUntil')) e.setData({ state: 'recover', until: time + N.rakeRecoverMs, readyAt: time + N.rakeRecoverMs + N.reloadMs });
        return;
      case 'snap': // the chains snapped: up the wall
        if (time < e.getData('fireAt')) return;
        return this.climb(e, time);
      case 'climb': {
        const k = Math.min(1, (time - e.getData('springAt')) / N.climbMs), f = e.getData('from'), t = Boss.edge(A, e.getData('s'));
        put({ x: Phaser.Math.Linear(f.x, t.x, k), y: Phaser.Math.Linear(f.y, t.y, k) });
        lift(k * N.wallZ + 24 * Math.sin(Math.PI * k) + 1);
        if (k >= 1) e.setData({ state: 'wall' });
        return;
      }
      case 'wall': { // along the walls toward him; a lump hurled now and then; then over the vault
        const s = e.getData('s'), goal = Boss.nearestEdge(A, to), step = (N.wallSpeed * delta) / 1000, s2 = s + Phaser.Math.Clamp(goal - s, -step, step);
        if (s2 !== s) e.setData('dir', Math.sign(s2 - s) * (Boss.edge(A, s2).wall === 'e' ? -1 : 1));
        put(Boss.edge(A, s2));
        lift(N.wallZ);
        e.setData({ s: s2, facing: toHero });
        if (time < e.getData('nextHurl')) return;
        if (e.getData('hurls') > 0) {
          e.setData({ state: 'hurlT', fireAt: time + N.hurlMs });
          return void Sfx.play(this, 'heave', N.hurlMs / 1000);
        }
        e.setData({ state: 'creep', creepUntil: time + N.creepMs, creepAt: time });
        return void Sfx.play(this, 'joints', 0.8);
      }
      case 'hurlT': { // thrown at where he stands as it leaves her claws
        if (time < e.getData('fireAt')) return;
        const t = { x: to.x, y: to.y }, goule = e.getData('hurls') % 2 === 1 && this.brood(e) < N.goules;
        Nourrice.hurl(this, { x: e.x, y: e.y, z: N.wallZ + 30 }, t, N.flightMs, goule, () => {
          if (this.dead) return;
          Sfx.play(this, 'thunk');
          if (Boss.struck(t, this.hero.body!.center, N.hurlRadius)) this.damageHero(N.hurlDamage, t);
          if (goule) this.hatch(e, t);
        });
        e.setData({ state: 'wall', hurls: e.getData('hurls') - 1, nextHurl: time + N.hurlGapMs });
        return void Sfx.play(this, 'lunge');
      }
      case 'creep': { // across the vault, over him
        const k = Math.min(1, (time - e.getData('creepAt')) / 400), step = (N.vaultSpeed * delta) / 1000, dx = to.x - e.x, dy = to.y - e.y, l = Math.hypot(dx, dy);
        put(l > step ? { x: e.x + (dx / l) * step, y: e.y + (dy / l) * step } : { x: to.x, y: to.y });
        lift(Phaser.Math.Linear(N.wallZ, N.vaultZ, k));
        e.setData('dir', Math.sign(dx) || 1);
        if (time % 140 < delta) Nourrice.dust(this, e.x, e.y, N.vaultZ);
        if ((l < 4 && k >= 1) || time >= e.getData('creepUntil')) {
          e.setData({ state: 'hold', fireAt: time + N.holdMs, target: { x: e.x, y: e.y } });
          Sfx.play(this, 'joints', N.holdMs / 1000);
        }
        return;
      }
      case 'hold': // over him, locked: dust falling, joints creaking
        if (time % 70 < delta) Nourrice.dust(this, e.x, e.y, e.getData('z'));
        if (time < e.getData('fireAt')) return;
        e.setData({ state: 'fall', springAt: time, z0: e.getData('z') });
        return;
      case 'fall': {
        const k = (time - e.getData('springAt')) / N.fallMs;
        if (k < 1) return lift(Math.max(1, e.getData('z0') * (1 - k * k)));
        slam(e.getData('target'), e.getData('phase') === 2 ? N.stuck2Ms : N.stuckMs);
        if (e.getData('phase') === 2) e.setData('floorUntil', time + N.stuck2Ms + N.floorMs);
        return;
      }
    }
    // On the floor: at half her blood the chains snap; in phase 2, back up the walls after a while.
    if (e.getData('phase') === 1 && Boss.phaseOf(e.getData('hp')) === 2) {
      e.setVelocity(0).setData({ state: 'snap', fireAt: time + N.snapMs, phase: 2, facing: toHero });
      Nourrice.snap(this, e);
      return void Sfx.play(this, 'chains');
    }
    if (e.getData('phase') === 2 && time >= (e.getData('floorUntil') ?? 0)) return this.climb(e, time);
    const choice = time >= e.getData('readyAt') && this.cameras.main.worldView.contains(from.x, from.y) ? Boss.choose(d) : 'stalk';
    if (choice === 'rake') {
      e.setVelocity(0).setData({ state: 'rakeT', fireAt: time + N.rakeTeleMs, facing: toHero, aim: Math.atan2((to.y - from.y) / T.lantern.squash, to.x - from.x) });
      return void Sfx.play(this, 'windup');
    }
    if (choice === 'drop') {
      e.setVelocity(0).setData({ state: 'tele', fireAt: time + N.teleMs, trackUntil: time + N.trackMs, target: { x: to.x, y: to.y }, facing: toHero });
      return void Sfx.play(this, 'joints', N.teleMs / 1000);
    }
    this.keepAt(e, toHero, d, N.near, N.far, N.speed);
  }

  /** Up the nearest wall: then along the walls, her throws counted afresh. */
  private climb(e: Sprite, time: number) {
    const s = Boss.nearestEdge(e.getData('arena'), e);
    e.setVelocity(0).setData({ state: 'climb', from: { x: e.x, y: e.y }, springAt: time, s, hurls: T.nourrice.hurls, nextHurl: time + T.nourrice.climbMs + T.nourrice.hurlGapMs });
    Sfx.play(this, 'lunge');
  }

  /** La Matrice's goules on their cords, alive. */
  private fed(e: Sprite) {
    return (this.enemies.getChildren() as Sprite[]).filter((o) => o.body?.enable && o.getData('tether') === e);
  }

  /** A goule born from her sac: it drops under it, then hunts him; `tethered`, on a cord (fed, leashed). */
  private birth(e: Sprite, tethered: boolean) {
    if (this.dead || !e.body?.enable) return;
    const p = Matrice.sac(e);
    e.setData('pending', e.getData('pending') + 1);
    Nourrice.fall(this, p.x, p.y, p.z, () => { e.setData('pending', e.getData('pending') - 1); this.hatch(e, p, tethered ? { tether: e, fedAt: this.time.now + T.matrice.feedMs } : {}); });
    Sfx.play(this, 'spawn');
  }

  /** A claw across goule `g`'s cord at `at`: cut, the goule starved (it howls, hunts on, unfed); her sac a share barer. */
  private cutCord(g: Sprite, at: { x: number; y: number }) {
    g.setData('tether', false);
    Enemy.bleed(this, at.x, at.y, -Math.PI / 2, 8, Math.PI, 0.6, 6, Matrice.SLIME);
    Sfx.play(this, 'splat');
    Sfx.play(this, 'growl');
  }

  /**
   * La Matrice. Phase 1, the pendulum: hanging over the arena's middle (out of reach), her wheel is drawn back away from
   * him (the tell: the sac lit from within, the cords taut, the chains creaking), then swings low through the arena to
   * past where he stood and grounds there (the time to strike), and is hauled back up. Her goules on their cords are fed
   * and leashed; each cord cut bares her sac a share (boss.ts bared()); new ones are born while fewer. At half her blood,
   * hanging: the chains snap, the wheel shudders and spins, the sac tears and spills a brood. Phase 2: from the bottom of
   * its swing (the time to strike), the tell, then a faster, wider swing out and back, and so on; more of the brood born.
   */
  private stepMatrice(e: Sprite, time: number, delta: number) {
    const M = T.matrice, two = e.getData('phase') === 2, pv = e.getData('pivot'), A = e.getData('arena'), to = this.hero.body!.center, st = e.getData('state');
    const t = time - (e.getData('at') ?? time), sq = T.lantern.squash;
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({ x: Phaser.Math.Linear(a.x, b.x, k), y: Phaser.Math.Linear(a.y, b.y, k) });
    const lift = (z: number) => { e.setData('z', z); e.body!.checkCollision.none = z > 0; };
    const put = (p: { x: number; y: number }) => { e.body!.reset(p.x, p.y); e.setVelocity(0); };
    const go = (state: string, data = {}) => e.setData({ state, at: time, ...data });
    // her goules: those on cords fed and leashed to the pivot; new ones born
    const fed = this.fed(e), pending = e.getData('pending');
    for (const g of fed) {
      if (time >= g.getData('fedAt')) g.setData({ fedAt: time + M.feedMs, hp: Math.min(T.enemy.hp, g.getData('hp') + 1) });
      const dx = g.x - pv.x, dy = (g.y - pv.y) / sq, d = Math.hypot(dx, dy);
      if (d > M.tether) g.body!.reset(pv.x + (dx / d) * M.tether, pv.y + (dy / d) * M.tether * sq);
    }
    if (!two && fed.length + pending >= M.cords) e.setData('birthAt', time + M.birthMs); // the clock runs once a cord is cut
    else if (st !== 'descend' && st !== 'tear' && time >= e.getData('birthAt') && (!two || this.brood(e) + pending < M.brood)) {
      this.birth(e, !two);
      e.setData('birthAt', time + (two ? M.broodMs : M.birthMs));
    }
    if (two && time % 300 < delta) Matrice.drip(this, e);
    const swingZ = M.hangZ + 14;
    switch (st) {
      case 'descend': { // down out of the dark of the vault, then her first goules
        const k = Math.min(1, t / 1600);
        lift(Phaser.Math.Linear(M.vault - 40, M.hangZ, 1 - (1 - k) ** 2));
        if (k < 1) return;
        for (let i = 0; i < M.cords; i++) this.time.delayedCall(200 + i * 350, () => this.birth(e, true));
        return void go('hang', { readyAt: time + M.reloadMs + 1200, birthAt: time + M.birthMs });
      }
      case 'pull': { // the tell: drawn back away from him; her aim follows him a moment, then is locked
        const tele = two ? M.tele2Ms : M.teleMs, k = Math.min(1, t / tele), ease = Math.sin((k * Math.PI) / 2);
        if (t < M.trackMs || !e.getData('path')) e.setData('path', Boss.swingPath(pv, to, A, M.back, two ? M.over2 : M.over, two ? M.arm2 : M.arm));
        const path = e.getData('path');
        put(lerp(e.getData('start'), path.from, ease));
        lift(Phaser.Math.Linear(e.getData('z0'), swingZ, ease));
        e.setData('flip', Math.cos(path.aim) < 0);
        if (t < tele) return;
        Sfx.play(this, 'swoosh', (two ? M.swing2Ms : M.swingMs) / 1000);
        return void go('swing');
      }
      case 'swing': { // low through the arena: whoever it passes is struck; phase 2, out and back
        const path = e.getData('path'), k = Math.min(1, t / (two ? M.swing2Ms : M.swingMs)), out = !two || k < 0.55, kk = two ? (out ? k / 0.55 : (k - 0.55) / 0.45) : k;
        const p = out ? lerp(path.from, path.to, kk) : lerp(path.to, pv, kk), z = out ? swingZ * Math.max(0, 1 - kk / 0.22) ** 2 + 3 * (1 - kk) : 3 * (1 - kk);
        put(p);
        lift(z);
        if (two) e.setData('flip', (Math.cos(path.aim) < 0) === out);
        if (z < 16 && Boss.struck(p, to, M.radius)) this.damageHero(M.damage, p);
        if (k < 1) return;
        lift(0);
        Foes.slam(this, p.x, p.y, M.radius);
        Sfx.play(this, 'slam');
        return void go('low');
      }
      case 'low': // grounded: the time to strike her
        if (t < (two ? M.low2Ms : M.lowMs)) return;
        if (!two) return void go('haul', { start: { x: e.x, y: e.y } });
        Sfx.play(this, 'creak', M.tele2Ms / 1000);
        return void go('pull', { start: { x: e.x, y: e.y }, z0: 0, path: undefined });
      case 'haul': { // hauled back up to the pivot
        const k = Math.min(1, t / M.haulMs), ease = (1 - Math.cos(k * Math.PI)) / 2;
        put(lerp(e.getData('start'), pv, ease));
        lift(M.hangZ * ease);
        if (k >= 1) go('hang', { readyAt: time + M.reloadMs });
        return;
      }
      case 'tear': // the chains snap, the wheel shudders, the sac tears: then down to the bottom of its swing, spinning
        if (t < M.tearMs) return;
        for (let i = 0; i < M.burst; i++) this.time.delayedCall(i * 160, () => this.birth(e, false));
        put(pv);
        lift(0);
        Foes.slam(this, pv.x, pv.y, M.radius);
        Sfx.play(this, 'slam');
        return void go('low', { birthAt: time + M.broodMs });
    }
    // hanging (phase 1): at half her blood, the tear; else, ready, the tell
    put({ x: pv.x + Math.sin(time / 700) * 2, y: pv.y });
    lift(M.hangZ);
    if (Boss.phaseOf(e.getData('hp'), M.hp) === 2) {
      for (const g of fed) g.setData('tether', false);
      Matrice.tear(this, e);
      Sfx.play(this, 'chains');
      return void go('tear', { phase: 2 });
    }
    if (time < e.getData('readyAt') || !this.cameras.main.worldView.contains(e.x, e.y)) return;
    Sfx.play(this, 'creak', M.teleMs / 1000);
    go('pull', { start: { x: e.x, y: e.y }, z0: M.hangZ, path: undefined });
  }

  /** F at the reliquary, its guardian dead: the seals break, her eyes in the slit, the cage opens, rats pour out, Vesna
   *  rises and speaks (docs/lore.md; the lines marked provisional are), then goes home on her own, a swarm of rats.
   *  Freed for good the moment the cage opens (saved), whatever befalls him after. */
  private free() {
    const R = Cat.RELIQUARY, cam = this.cameras.main, o = this.room.zone!.opens.find((p) => p.id === 'reliquary')!;
    const at = (ms: number, f: () => void) => this.time.delayedCall(ms, () => !this.dead && f());
    this.cut = true;
    for (const l of this.labels.filter((l) => l.at === R.at)) { l.l.destroy(); this.labels.splice(this.labels.indexOf(l), 1); }
    cam.stopFollow();
    cam.pan(R.x, R.y - 30, 700, 'Sine.easeInOut');
    Sfx.play(this, 'shatter', 1); // the Order's seals
    for (const [dx, dy] of [[4, -44], [-5, -52]]) Enemy.bleed(this, R.x + dx, R.y + dy + 30, -Math.PI / 2, 10, Math.PI, 0.6, 30, [0x7a1010, 0x5a0a0a, 0xa01818]);
    let shut = () => {};
    at(500, () => { shut = Vesna.eyes(this, R.x, R.y - 62, o.depth + 1); this.hud.say('Vesna', 'Les nobles crachaient sur les rats, gamin. Les rats, eux, ont survécu.', 2600); });
    at(3000, () => { // the cage opens: freed for good
      shut();
      Zone.open(this, o, 1400);
      Sfx.play(this, 'gate');
      cam.shake(1200, new Phaser.Math.Vector2(1 / cam.width, 1 / cam.height));
      Save.data.vesna = true;
      Save.store();
    });
    at(3600, () => { // her rats pour out, scatter, are gone into the dark
      for (let i = 0; i < 26; i++) at(i * 40, () => {
        const r = Rats.rat(this, R.x + Phaser.Math.Between(-6, 6), R.y + 6), a = Math.PI / 2 + Phaser.Math.FloatBetween(-1.3, 1.3), ms = Phaser.Math.Between(900, 1700);
        Enemy.run(this, ms, () => { r.setPosition(r.x + Math.cos(a) * 2.2, r.y + Math.sin(a) * 2.2); Rats.scurry(r, a, this.time.now); }, () => Rats.vanish(this, r));
      });
      Sfx.play(this, 'gift');
    });
    const v = Vesna.create(this, R.x, R.y - 27), pose = { now: 'idle' as Vesna.Pose }; // on the chest's floor, up on its dais
    v.s.setDepth(o.depth + 1); // in it: before its dark inside
    v.rise(0);
    const look = () => v.s.active && v.show(pose.now, this.time.now);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, look);
    at(4400, () => this.tweens.addCounter({ from: 0, to: 1, duration: 1200, ease: 'Sine.easeOut', onUpdate: (tw) => v.rise(tw.getValue() ?? 0) }));
    at(5800, () => { pose.now = 'count'; this.hud.say('Vesna', 'Un sans-maison qui ouvre ma cage... Le monde tourne à l\'envers. Tant mieux.', 2600); }); // provisional
    at(8600, () => { pose.now = 'idle'; this.hud.say('Vesna', 'Je rentre par mes chemins. Rapporte du sang au refuge : on fera affaire.', 2800); }); // provisional
    at(11600, () => { // she goes, a swarm of rats into the dark
      const sw = Rats.swarm(this, v.s.x, v.s.y, 16, 14);
      this.tweens.add({ targets: v.s, alpha: 0, duration: 500, onComplete: () => { this.events.off(Phaser.Scenes.Events.POST_UPDATE, look); v.s.destroy(); } });
      Sfx.play(this, 'dash');
      Enemy.run(this, 1600, (t) => sw.move(R.x - 60 * t, R.y + 90 * t, this.time.now), () => sw.end());
    });
    at(13400, () => {
      this.cut = false;
      cam.startFollow(this.hero, true, 0.08, 0.08);
      this.hud.title('Vesna est libre.');
    });
    return true;
  }

  /** F by Vesna at the refuge: her stall. */
  private openStall() {
    this.hero.setVelocity(0);
    this.stall = Vesna.stall(this, this.powers(), Save.data.banked, Phaser.Utils.Array.GetRandom(Powers.LINES.greet));
    return true;
  }

  private powers(): Vesna.Offer[] {
    const S = Save.data;
    return Powers.POWERS.map((id) => {
      const bought = S.powers.bought.includes(id), price = bought ? undefined : Powers.price(S, id), k = Powers.slotOf(id);
      return { id, price, bought, worn: !!k && S.powers.worn[k] === id, afford: price !== undefined && S.banked >= price };
    });
  }

  /** Card `i` of her stall: bought with the bank, else worn (in its slot, in place of the other) or taken off. Saved. */
  private trade(i: number) {
    const id = Powers.POWERS[i], S = Save.data;
    if (!id || !this.stall) return;
    let line: string;
    if (!S.powers.bought.includes(id)) {
      const got = Powers.buy(S, id);
      Sfx.play(this, got === 'sold' ? 'gift' : 'snap', 1);
      line = Phaser.Utils.Array.GetRandom(Powers.LINES[got === 'sold' ? 'sold' : 'poor']);
    } else {
      const got = Powers.wear(S, id);
      Sfx.play(this, got === 'locked' ? 'snap' : 'gift', 0);
      line = got === 'worn' ? Phaser.Utils.Array.GetRandom(Powers.LINES.worn) : got === 'off' ? 'Comme tu veux.' : 'Celle-là, tu l\'as déjà.';
    }
    Save.store();
    this.gifts = Powers.worn(S);
    this.showBlood();
    this.stall.set(this.powers(), S.banked, line);
  }

  private closeStall() {
    this.stall?.close();
    this.stall = undefined;
  }

  /** One of the Order: its men and hounds (not the ghouls, nor their Amas), whom a sonneur quickens and an inquisiteur commands. */
  private order(e: Sprite) {
    const kind = e.getData('kind');
    return kind === 'crossbow' || (Foes.isFoe(kind) && kind !== 'amas' && !FAUNA.includes(kind));
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
    if (e.getData('kind') !== 'inquisitor' || this.kneeling(e) || e === this.prey || !e.getData('alert') || this.time.now < (e.getData('staggerUntil') ?? 0) || !inArc(c, e.getData('facing'), from, Infinity, 2 * T.inquisitor.parryDeg)) return false;
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
    if (this.counter || this.satchel || this.carte) return;
    if (now < this.dazedUntil || !act()) this.queued = { act, at: now, wait: Math.max(this.dashUntil, this.dazedUntil) };
  }

  /** La parade (T.parry): turned to `angle`, his guard up a short window; the blow it turns aside, deflect(). Missed, he
   *  stands open a while (openUntil). */
  private parry(angle: number) {
    const now = this.time.now, P = T.parry;
    if (this.dead || this.prey || this.heldBy || this.fly || this.netted() || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.dashUntil
      || now < this.slashUntil || now < this.castUntil || now < this.shotUntil || now < this.openUntil) return false;
    this.clawDownAt = this.chargeAt = 0;
    [this.facing, this.parryAt, this.openUntil] = [angle, now, now + P.windowMs + P.recoverMs];
    this.commitUntil = Math.max(this.commitUntil, this.openUntil); // no mist out of a missed parry
    Sfx.play(this, 'dash');
    return true;
  }

  /** A blow of `e`'s meets his parry: turned aside (true), or not. Its poise broken, it reels, open to the riposte. */
  private deflect(e: Sprite) {
    const now = this.time.now, P = T.parry, f = this.hero.body!.center, c = e.body!.center, a = Phaser.Math.Angle.BetweenPoints(c, f);
    if (!parries(now, this.parryAt, e.getData('kind') ?? 'ghoul', a + Math.PI - this.facing, P)) return false;
    [this.parriedAt, this.parryAt] = [now, -1e9];
    this.openUntil = this.commitUntil = now + P.holdMs; // free again at once: the riposte
    e.setVelocity(0).setData({ state: 'chase', until: 0, struck: true, stunnedUntil: now + P.staggerMs, staggerUntil: now + P.staggerMs, poiseUntil: now + P.staggerMs, poiseTaken: 0, riposteUntil: now + P.riposteMs });
    this.physics.velocityFromRotation(a + Math.PI, P.knock, e.body!.velocity);
    Foes.parry(this, f.x - Math.cos(a) * 6, f.y - Math.sin(a) * 6 + 4, a);
    Sfx.play(this, 'parry');
    const cam = this.cameras.main;
    cam.shake(110, new Phaser.Math.Vector2(3 / cam.width, 2 / cam.height));
    this.physics.pause();
    this.time.delayedCall(P.hitStopMs, () => this.physics.resume());
    return true;
  }

  /** The claws let go: charged past its start, le coup chargé strikes (T.charge), toward the pointer or where he faces. */
  private release() {
    const at = this.chargeAt, now = this.time.now;
    this.clawDownAt = this.chargeAt = 0;
    if (!at) return;
    const p = this.input.activePointer, angle = this.clawMouse ? Phaser.Math.Angle.BetweenPoints(this.hero, this.cameras.main.getWorldPoint(p.x, p.y)) : this.facing;
    this.slash(angle, chargeOf(at, now, T.charge.fullMs));
  }

  /** The claws. Swipe, back-swipe, then the finisher (heavier, wider, longer, slower to recover from); a slash pressed
   *  during the mist or just after it is the dash strike instead, which opens the combo. */
  private slash(angle: number, charge?: number) {
    const now = this.time.now, S = T.slash, D = T.dash, C = T.charge, P = T.poise;
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.slashReadyAt || now < this.dashUntil || now < this.openUntil) return false;
    if (this.netted()) { // netted: the claws tear at the mesh instead, a swing's time each
      this.slashReadyAt = now + S.cooldownMs;
      return this.struggle('blow');
    }
    const g = this.gear, pace = 1 + g.pace; // the weapon worn (items.ts): its pace, reach, arc, blows
    const heavy = charge !== undefined, full = Number(heavy && charge >= 1);
    const ripe = (e: Sprite) => now < (e.getData('riposteUntil') ?? 0) && !!e.body?.enable && inArc(this.hero, angle, e, S.finisherRange + g.reach, S.finisherArcDeg + g.arc);
    const riposte = !heavy && (this.enemies.getChildren() as Sprite[]).some(ripe);
    const dash = !heavy && !riposte && dashStrikes(now, this.dashUntil, this.lastSlashAt, D.strikeWindowMs);
    this.combo = heavy || riposte ? 2 : dash ? 0 : nextCombo(this.combo, now - this.lastSlashAt, S.comboWindowMs);
    const fin = !dash && this.combo === 2, kind = dash ? 3 : this.combo; // kind 3: the dash strike, for effects and sounds
    this.lastSlashAt = now;
    this.slashReadyAt = now + (heavy ? C.recoverMs : (S.cooldownMs + (fin ? S.finisherRecoveryMs : 0)) * pace);
    this.slashUntil = now + (heavy ? C.strikeMs : S.cooldownMs * pace);
    this.commitUntil = now + (heavy ? C.commitMs : fin ? S.finisherCommitMs : S.commitMs);
    this.facing = angle;
    Fx.slash(this, this.hero.x, this.hero.y, angle, kind);
    Sfx.play(this, 'slash', kind);
    Crows.din(this.ctx, this.hero.body!.center, now); // a fight is heard

    const range = (heavy ? C.range : fin ? S.finisherRange : S.range) + g.reach, arc = (heavy ? C.arcDeg : dash ? D.strikeArcDeg : fin ? S.finisherArcDeg : S.arcDeg) + g.arc;
    const mult = (this.has('noires') ? T.pacts.noires.mult : 1) * (1 + g.claw);
    const damage = (heavy ? C.damage[full] : dash ? S.damage + D.strikeBonus : fin ? S.damage * (S.finisherMult + g.finisher) + this.v('rongeur') : S.damage) * mult;
    const knock = S.knockback * (heavy ? C.knock : dash ? D.strikeKnock : fin ? S.finisherKnock * (1 + g.knock) : 1);
    const weight = heavy ? C.poise[full] : kind === 2 ? P.finisher : kind === 3 ? P.dash : P.claw;
    if (fin && this.has('grouillantes')) this.releaseRats(this.hero.body!.center, this.v('grouillantes'));
    let hits = 0, killed = false, extra = 0;
    for (const e of [...this.enemies.getChildren()] as Sprite[]) { // not the ghouls this blow tears off an Amas
      if (!e.body?.enable || this.aloft(e) || !(e.getData('kind') === 'crows' ? Crows.reached(e, this.hero, angle, range, arc) : inArc(this.hero, angle, e, range + (e.getData('kind') === 'nourrice' ? T.nourrice.reach : e.getData('kind') === 'matrice' ? T.matrice.reach : e.getData('kind') === 'chose' ? T.chose.grasp : 0), arc))) continue; // their bodies are broad; up on the walls, hanging, out of reach; a flock, by any of its crows
      hits++;
      const rip = riposte && ripe(e);
      if (rip) e.setData('riposteUntil', 0);
      extra = Math.max(extra, this.hitEnemy(e, angle, rip ? Math.max(damage, T.parry.riposte * mult) : damage, knock, kind, rip ? Infinity : weight, rip));
      killed ||= !e.body?.enable;
    }
    if (fin && killed && Math.random() < g.leech) this.heal(T.items.leechHeal); // Main de goule
    for (const o of [...this.enemies.getChildren()] as Sprite[]) { // la Matrice's cords: their low part, from a goule's feet toward her (nearer her they hang high)
      const m = o.getData('tether') as Sprite | undefined;
      if (!m?.body?.enable || !o.body?.enable) continue;
      const top = Matrice.sac(m), along = Array.from({ length: 6 }, (_, i) => ({ x: Phaser.Math.Linear(o.x, top.x, i / 10), y: Phaser.Math.Linear(o.y, m.y, i / 10) }));
      const cut = along.find((p) => inArc(this.hero, angle, p, range, arc));
      if (!cut) continue;
      hits++;
      this.cutCord(o, cut);
    }
    for (const l of [...this.lanterns]) { // aimed at its glass, about the hero's chest height
      if (!l.lit || !inArc(this.hero, angle, { x: l.x, y: l.y - 5 }, range, arc)) continue;
      hits++;
      this.hitLantern(l, angle, damage);
    }
    if (!hits) return true;
    // Hit-stop: freeze physics briefly so the impact reads, longer the heavier the blow; tweens and timers keep running.
    // The last foe of a fight down (kill()), the slow motion starts after it.
    const stop = (heavy ? C.hitStopMs[full] : S.hitStopMs + (fin ? S.finisherHitStopMs : 0) + (dash ? D.strikeHitStopMs : 0)) + extra;
    if (this.slowAt === now) this.slowAt += stop;
    this.physics.pause();
    this.time.delayedCall(stop, () => this.physics.resume());
    return true;
  }

  /** Le Tir: a shard of blood flicked toward `angle`, without limit. It flies until the first enemy it touches (through
   *  them all with Éclats rongeurs), or the lantern, prop or wall it was thrown into. It carries the gifts it was
   *  thrown with. */
  private shoot(angle: number) {
    const now = this.time.now, S = T.shot;
    if (this.dead || this.prey || this.netted() || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.shotReadyAt || now < this.dashUntil || now < this.slashUntil || now < this.openUntil || this.chargeAt) return false;
    if (this.has('jet') && this.rats.filter((r) => r.from === 'jet').length >= T.gifts.jetRats) return false; // the thrown rats still running
    this.shotReadyAt = now + S.cooldownMs;
    this.shotUntil = now + S.throwMs;
    this.commitUntil = now + S.commitMs;
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
      e.setData({ stunnedUntil: Math.max(e.getData('stunnedUntil'), this.time.now + T.shot.stunMs), blow: { angle, at: this.time.now, force: T.shot.knockback / T.slash.knockback } });
      this.physics.velocityFromRotation(angle, T.shot.knockback, e.body.velocity);
    }
    Fx.splat(this, x, y, angle, true);
    Sfx.play(this, 'splat');
    if (plague) this.infect(e, plague);
    this.hurtEnemy(e, T.shot.damage);
  }

  /** A claw lands: `kind` is the slash's (combo step 0-2, 3 the dash strike), `weight` its poise weight (T.poise),
   *  `riposte` on a foe reeling from a parry. On a foe that has not noticed him, the predator strike (T.predator). The
   *  hit-stop it adds to the blow's: a broken poise's, a predator strike's or a riposte's. */
  private hitEnemy(e: Sprite, angle: number, damage: number, knock: number, kind: number, weight: number, riposte = false) {
    const now = this.time.now;
    if (e.getData('kind') === 'chose') { // a claw on its fingers: it lets go and sinks a while (it never dies)
      Fx.hit(this, e.x, e.y + 8, angle);
      Sfx.play(this, 'hit', kind);
      Chose.struck(this.ctx, e, now);
      return 0;
    }
    if (this.parried(e, this.hero.body!.center)) { // his arm jars back
      this.physics.velocityFromRotation(angle + Math.PI, 110, this.shove);
      this.shoveUntil = now + 90;
      return 0;
    }
    // L'attaque dans l'ombre: it never saw him coming. A dark lunge onto it in his mist, its blood bursting.
    const prey = predatory(e.getData('kind') ?? 'ghoul', !!e.getData('alert'), T.predator.immune) && !this.kneeling(e) && e !== this.prey;
    if (prey) {
      const f = this.hero.body!.center, d = Math.max(0, Math.min(T.predator.lunge, Phaser.Math.Distance.BetweenPoints(e.body!.center, f) - 14));
      [damage, weight] = [Math.max(damage, T.predator.damage), Infinity];
      Fx.dash(this, f, angle);
      this.tweens.add({ targets: this.hero, x: this.hero.x + Math.cos(angle) * d, y: this.hero.y + Math.sin(angle) * d, duration: 60, ease: 'Quad.easeOut' });
      Fx.gore(this, e.x, e.y, angle, T.predator.gore);
      Sfx.play(this, 'predator');
    } else if (riposte) {
      Fx.gore(this, e.x, e.y, angle, T.feel.goreHeavy);
      Sfx.play(this, 'kill');
    }
    // Its poise worn through (T.poise), it staggers, cut short in whatever it was doing, a wind-up too: aggression is
    // rewarded. Holding, it flinches walking or recovering, and holds firm mid-attack; the heavy ones never budge.
    const P = T.poise, state = e.getData('state'), heavy = this.heavy(e);
    const { taken, breaks } = poiseHit({ taken: e.getData('poiseTaken') ?? 0, lastAt: e.getData('poiseAt') ?? -1e9, steadyUntil: e.getData('poiseUntil') ?? 0 },
      now, weight, heavy ? Infinity : P.of[e.getData('kind') ?? 'ghoul'] ?? Infinity, P.regenMs);
    const firm = heavy || this.kneeling(e) || (!breaks && !['chase', 'recover'].includes(state));
    e.setData({ poiseTaken: taken, poiseAt: now, blow: { angle, at: now, force: knock / T.slash.knockback } });
    if (breaks) e.setData({ state: 'chase', until: 0, stunnedUntil: now + P.staggerMs, staggerUntil: now + P.staggerMs, poiseUntil: now + P.steadyMs });
    else if (!firm) e.setData('stunnedUntil', Math.max(e.getData('stunnedUntil'), now + P.flinchMs));
    if (!firm) this.physics.velocityFromRotation(angle, knock * (breaks ? 1 : P.flinchKnock), e.body!.velocity);
    Fx.hit(this, e.x, e.y, angle, breaks);
    Sfx.play(this, 'hit', kind);
    if (this.has('griffes')) this.infect(e, this.v('griffes'));
    if (this.gear.bleed) e.setData({ bleedLeft: T.items.bleedTicks, bleedAt: now + T.items.bleedMs / T.items.bleedTicks, bleedDmg: this.gear.bleed / T.items.bleedTicks });
    if (e.getData('kind') === 'nourrice') this.shake(e, damage);
    this.hurtEnemy(e, damage, prey);
    return prey ? T.predator.hitStopMs : riposte ? T.parry.riposteStopMs : breaks ? P.breakStopMs : 0;
  }

  /** Those without poise (T.poise.of): the Amas and the Bourreau, the bosses and the necropolis' own. Blows never cut
   *  them short nor push them back. */
  private heavy(e: Sprite) {
    return !((e.getData('kind') ?? 'ghoul') in T.poise.of);
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
  private hurtEnemy(e: Sprite, amount: number, predator = false) {
    if (!e.body?.enable) return;
    const kind = e.getData('kind');
    if (kind === 'crows') return Crows.scatter(this.ctx, e, this.time.now); // struck, a flock scatters: it never dies of it
    if (kind === 'enterre' && Enterre.under(e)) return; // into the earth
    if (kind === 'chose') return; // only a claw on its fingers moves it (hitEnemy)
    if (kind === 'enterre') Enterre.struggled(this.ctx, e, 'blow', this.time.now); // a claw on the hand that holds him
    if (kind === 'matrice' && !(amount *= Boss.bared(this.fed(e).length, e.getData('phase')))) return void Sfx.play(this, 'thunk'); // fed by every cord: the blow sinks into the sac
    amount *= (this.has('maigre') ? T.pacts.maigre.mult : 1) * (1 + this.gear.dmg);
    // Until the bite is unlocked, a human is wounded like any foe: weakened, it dies (it kneels only for the bite).
    // A predator strike kills a human outright (no kneeling), and its clean kill rouses no one.
    const now = this.time.now, { hp, kneels } = wound(e.getData('hp'), amount, !!e.getData('human') && Save.data.unlocks.bite && !predator, T.bite.weakAt, this.kneeling(e));
    if (!e.getData('alert') && !(predator && hp <= 0)) this.rouse(e);
    e.setData({ hp, flashUntil: now + 70 });
    if (kneels) e.setVelocity(0).setData({ state: 'chase', until: 0, kneelUntil: now + T.bite.kneelMs });
    if (hp <= 0) this.kill(e);
    else if (e.getData('kind') === 'amas') this.tear(e);
  }

  /** Every enemy death goes through here: on an expedition, it leaves its blood (an Amas' torn ghouls none). */
  private kill(e: Sprite) {
    if (!e.body?.enable) return; // already dead: plague or rats can finish a prey mid-bite
    const c = { ...e.body.center }, now = this.time.now, F = T.feel;
    e.disableBody(false, false);
    const kind = e.getData('kind'), blow = e.getData('blow') as { angle: number; at: number; force: number } | undefined;
    // Its last blow tears it open and throws the body along it (the heavy ones fall where they stand), short of props
    // and walls; foes.ts and enemy.ts lay it there.
    if (kind !== 'chose' && kind !== 'crows' && kind !== 'nourrice' && kind !== 'matrice' && blow && now - blow.at < 100) {
      Fx.gore(this, e.x, e.y, blow.angle, blow.force > 1 || now < (e.getData('staggerUntil') ?? 0) ? F.goreHeavy : F.gore);
      e.setData('gored', true);
      if (!this.heavy(e)) e.setData('fling', { angle: blow.angle, d: Math.max(0, Math.min(F.fling * blow.force, this.boltReach(c, blow.angle) - 6)) });
    }
    // The last foe of a fight (none left hunting him: the flocks and the Chose never die) and the world slows a moment.
    if (!(this.enemies.getChildren() as Sprite[]).some((o) => o.body?.enable && o.getData('alert') && o.getData('kind') !== 'crows' && o.getData('kind') !== 'chose')) this.slowAt = now;
    if (kind === 'chose') Chose.die(e); // the room cleared: gone, no body
    else (kind === 'crossbow' ? Crossbow : Foes.isFoe(kind) ? Foes : kind === 'nourrice' ? Nourrice : kind === 'matrice' ? Matrice : kind === 'crows' ? Crows : Enemy).die(this, e);
    if (kind === 'nourrice' || kind === 'matrice') this.won(e);
    if (this.heldBy === e) this.heldBy = undefined; // the hand lets go
    if (kind === 'crows' || kind === 'chose') return; // a flock gone off, the Chose: no blood, no din
    Sfx.play(this, 'kill');
    Crows.din(this.ctx, c, this.time.now);
    // Contagion: a sick enemy's plague leaps onto those around it.
    if (e.getData('plagueAt') && this.has('contagion'))
      for (const o of this.enemies.getChildren() as Sprite[])
        if (Phaser.Math.Distance.BetweenPoints(o, e) < T.gifts.contagion && this.infect(o, e.getData('plagueDmg') ?? T.gifts.plagueDamage)) Rats.leap(this, e.x, e.y, o);
    // Vermine: rats pour out of the body. La curée: every few kills, blood back.
    if (this.has('vermine')) this.releaseRats(e, T.pacts.vermine.rats);
    if (this.has('curee') && ++this.kills % T.pacts.curee.every === 0) this.heal(T.pacts.curee.heal);
    if (!this.exp || e.getData('torn')) return;
    this.addDrop({ x: c.x, y: c.y, blood: Math.round(T.blood.drops[(kind ?? 'ghoul') as Exclude<Kind, 'crows' | 'chose'>] * T.blood.ring[this.ring(c)] * (1 + this.gear.spoils)) });
    if ((T.items.elites as readonly string[]).includes(kind)) this.addLoot({ x: c.x + 12, y: c.y + 4, item: this.found(this.ring(c), true)! }); // an elite's
  }

  /**
   * La Morsure, unaimed, once unlocked (save.ts). On the nearest weakened human in reach, the hero snaps to its side,
   * latches on its throat and drains it: both are held, and he takes every blow meanwhile. Then it dies like any kill
   * and he regains blood. With no prey, he searches the cache at hand, else a teeth snap in place.
   */
  private bite() {
    const now = this.time.now, B = T.bite;
    if (this.dead || this.prey || this.heldBy || this.netted() || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.biteReadyAt || now < this.dashUntil || now < this.slashUntil || now < this.openUntil) return false;
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable), fangs = Save.data.unlocks.bite;
    const prey = fangs ? biteTarget(this.hero, this.facing, live.map((e) => ({ x: e.x, y: e.y, hp: e.getData('hp'), human: !!e.getData('human'), e })),
      B.range, B.arcDeg, B.weakAt)?.e : undefined;
    if (!prey && this.ronge && Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.RONGE) < T.ronge.talk) return this.talk();
    if (!prey && this.ronge && Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.CHEST) < T.ronge.talk) return this.openSatchel('coffre');
    if (!prey && this.vesna && Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Refuge.VESNA) < T.vesna.talk) return this.openStall();
    if (!prey && (this.search() || this.lever() || this.reliquary() || this.take())) return true;
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
    if (this.dead || this.prey || this.phase === 'enter' || this.phase === 'leave' || now < this.swarmUntil || now < this.glyphReadyAt || now < this.dashUntil || now < this.openUntil || this.chargeAt) return false;
    const feet = this.hero.body!.center, b = this.room.bounds, rx = G.radius, ry = rx * T.lantern.squash;
    const at = glyphSpot(feet, to, G.range, { x: b.x + rx, y: b.y + ry, width: b.width - 2 * rx, height: b.height - 2 * ry });
    this.glyph?.end();
    this.glyph = Glyph.cast(this, at.x, at.y, feet);
    this.nestAt = this.has('nid') ? now + G.armMs : Infinity;
    this.glyphReadyAt = now + G.cooldownMs;
    this.castUntil = now + G.castMs;
    this.commitUntil = now + G.commitMs;
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
    const bag = this.bloodBag(), { carried, left } = carry(this.carried, d.blood, bag);
    if (carried === this.carried) return;
    if (carried === bag) this.hud.title('Sac plein');
    this.exp!.packs += scent(this.carried, carried, T.battue.every * (1 + this.gear.scent));
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

  /** F by Vesna's reliquary, in the catacombs' arena: sealed while its guardian lives; she dead, its seals break and
   *  Vesna is freed; empty after. */
  private reliquary() {
    if (this.room.zone?.id !== 'catacombs' || this.fight || Phaser.Math.Distance.BetweenPoints(this.hero.body!.center, Cat.RELIQUARY.at) > T.blood.search + 12) return false;
    if (Save.data.nourrice.dead && !Save.data.vesna) return this.free();
    Sfx.play(this, 'thunk');
    this.hud.title(Save.data.vesna ? 'Le reliquaire est vide.' : 'Le reliquaire est scellé.');
    return true;
  }

  /** The catacombs' rats: a few about each nest, nosing here and there, scattering from the hero; never far from home. */
  private scurry(time: number, delta: number) {
    if (this.room.zone?.id === 'catacombs' && !this.vermin.length && this.navOpen.length)
      for (const [x, y] of Cat.RATS) for (let k = 0; k < 3; k++) this.vermin.push({ s: Rats.rat(this, x + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-6, 6)), home: { x, y }, heading: Math.random() * 6.3, turnAt: 0 });
    const f = this.hero.body!.center;
    for (const v of this.vermin) {
      const away = Phaser.Math.Distance.BetweenPoints(v.s, f) < 70, home = Phaser.Math.Distance.BetweenPoints(v.s, v.home);
      if (away) v.heading = Phaser.Math.Angle.Between(f.x, f.y, v.s.x, v.s.y);
      else if (time > v.turnAt) [v.heading, v.turnAt] = [home > 60 ? Phaser.Math.Angle.Between(v.s.x, v.s.y, v.home.x, v.home.y) : Math.random() * 6.3, time + Phaser.Math.Between(300, 1200)];
      const step = ((away ? T.gifts.ratSpeed : T.gifts.ratSpeed * 0.4) * delta) / 1000, to = { x: v.s.x + Math.cos(v.heading) * step, y: v.s.y + Math.sin(v.heading) * step };
      if (this.navOpen[this.cellOf(to)] && Phaser.Math.Distance.BetweenPoints(to, v.home) < 110) v.s.setPosition(to.x, to.y);
      else v.turnAt = 0; // a wall, too far: another way
      Rats.scurry(v.s, v.heading, away || time % 1400 < 900 ? time : 0);
    }
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
    if (c.item) this.addLoot({ x: f.x + 14, y: f.y + 2, item: c.item }); // what it hid, beside the blood
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
    if (this.training) return;
    this.hud.blood(this.carried, this.bloodBag(), this.layout === 'refuge' ? Save.data.banked : undefined);
    this.hud.bag(this.layout === 'refuge' ? undefined : this.bag, Shop.itemSlots(Save.data));
  }

  /** How much blood he carries at most: the bag's, and an Outre de peau's. */
  private bloodBag() {
    return Shop.bagSize(Save.data) + this.gear.purse;
  }

  /** What the blood he carries weighs (logic.ts burden()): slower, the mist slower back, noticed from farther. */
  private weight() {
    return burden(this.carried, this.bloodBag(), this.gear.scent, T.blood.weight);
  }

  // ---- The battue (the blood's scent) and le Rongé's wares. ----

  /** Lays the packs his scent has called in wait across the zone, on his way back from where he is (in a room, from
   *  its door; world.ts loose()), out of his sight; a distant horn and a line say so, `delay` ms later (after a place's
   *  name). In the zone they stand there at once; else they wait in its state for him to come back out. */
  private loose(delay = 0) {
    const exp = this.exp!;
    if (!exp.packs || this.fight) return; // the battue keeps out of the arena: its packs wait till the fight is over
    // the zone where they lie in wait: the one he is in, else the zone whose door he went in by (from that door)
    let z: ZoneId, from: { x: number; y: number } = this.hero.body!.center;
    if (this.room.zone) z = this.room.zone.id;
    else {
      let p = this.here;
      while (exp.came[p] && !isZone(exp.came[p]!.from)) p = exp.came[p]!.from;
      const c = exp.came[p], d = c && isZone(c.from) ? Zone.exits(c.from)[c.exit] : undefined;
      if (!c || !d) return;
      z = c.from as ZoneId;
      from = d;
    }
    const st = exp.rooms[z], nec = exp.rooms.necropolis;
    if (!st) return;
    const g = homeward(z, Save.data.shortcuts), way = wayBack(g.steps, g.cols, from, g.links);
    // down in the catacombs, every other pack waits up in the necropolis, at the narrow ways of his way home from the
    // door he will come up by (the way up his way back ends at)
    let above: ((k: number) => { x: number; y: number } | undefined) | undefined;
    if (z === 'catacombs' && nec && way.length) {
      const end = way[way.length - 1], ups = Zone.ups(z), k = ups.reduce((b, d, i) => (Math.hypot(d.x - end.x, d.y - end.y) < Math.hypot(ups[b].x - end.x, ups[b].y - end.y) ? i : b), 0);
      const top = Zone.exits('necropolis')[parents('catacombs')[k].exit], out = { x: top.x, y: top.y + 14 }, ng = homeward('necropolis', Save.data.shortcuts);
      const home = wayBack(ng.steps, ng.cols, out, ng.links), laid = new Set(nec.foes.flatMap((f) => (f.pack ? [f.pack] : []))).size; // those already up there
      above = (n) => lair(home, out, T.battue.up, false, T.battue.door, laid + n); // a little way from the door: he sees them coming out
    }
    const now = loose(exp, way, from, T.battue.packs, T.battue.far, T.battue.door, chokes(z), above);
    for (const { at, kinds, up } of now) kinds.forEach((kind, i) => {
      const p = { x: at.x + (i % 2 ? 12 : -12) * Math.ceil(i / 2), y: at.y }; // side by side
      if (!up && this.room.zone) this.place(p, kind as Kind, { pack: exp.loosed });
      else (up ? nec! : st).foes.push({ kind, ...p, hp: stats(kind).hp, home: p, pack: exp.loosed });
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

  // ---- The items: found in caches and on elites, carried in the bag, worn, kept in le coffre at the refuge. ----

  /** An item found in ring `ring` (`sure`: always one; else by its chance, T.items.cache), numbered; or none. */
  private found(ring: number, sure: boolean): Items.Item | undefined {
    const f = Items.find(ring, Math.random, sure);
    return f && { n: Save.data.next++, ...f };
  }

  /** An item lying at floor point (x, y): its glint, its name and « Ramasser (F) » as he comes near. */
  private addLoot(l: { x: number; y: number; item: Items.Item }) {
    const it = l.item;
    this.loot.push({ ...l, fx: Loot.glint(this, l.x, l.y, Satchel.icon(this, it.id), Satchel.RARE[it.r]), label: Loot.label(this, l.x, l.y - 18, [Items.ITEMS[it.id].name, 'ramasser (F)']) });
  }

  private dropLoot(l: Lying) {
    l.fx.take();
    l.label.destroy();
    this.loot.splice(this.loot.indexOf(l), 1);
  }

  /** F by an item on the floor: into the bag; the bag full, le sac opens to choose what he leaves in its place. */
  private take() {
    const f = this.hero.body!.center, l = this.loot.find((l) => Phaser.Math.Distance.BetweenPoints(f, l) < T.items.pickup);
    if (!l) return false;
    if (!Items.stow(this.bag, Shop.itemSlots(Save.data), l.item)) return this.openSatchel('sac', l);
    this.dropLoot(l);
    this.castUntil = this.time.now + T.glyph.castMs;
    Sfx.play(this, 'gift', 1);
    this.hud.title(`${Items.ITEMS[l.item.id].name} : dans le sac (I)`);
    this.showBlood();
    return true;
  }

  /** The list under the worn slots: the bag, or the chest's items (the newest first). */
  private list(mode: 'sac' | 'coffre') {
    return mode === 'sac' ? this.bag : Items.chest(Save.data).reverse();
  }

  /** Opens the items' panel: le sac (on an expedition the game pauses meanwhile), `ground` the item on the floor to take
   *  in place of one of the bag's; or le coffre at the refuge. */
  private openSatchel(mode: 'sac' | 'coffre', ground?: Lying) {
    if (this.satchel || this.carte || this.counter || this.training || this.dead || this.prey || this.phase !== 'play') return false;
    this.hero.setVelocity(0);
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    const view: Satchel.View = { title: mode === 'sac' ? 'LE SAC' : 'LE COFFRE', listName: '', worn: Save.data.worn, list: [], size: 0, cursor: ground ? Items.SLOTS.length : 0, line: '', hint: '', fresh: () => false };
    this.satchel = { panel: undefined!, view, mode, ground };
    this.hud.title(''); // no title card over it
    this.satchel.panel = Satchel.panel(this, this.showSatchel({ line: ground ? `Sac plein : que laisser pour ${Items.ITEMS[ground.item.id].name} ?` : '' }));
    Sfx.play(this, 'snap');
    return true;
  }

  /** The panel redrawn, `change` made to what it shows; returns what it shows. */
  private showSatchel(change: Partial<Satchel.View> = {}) {
    const s = this.satchel!, sac = s.mode === 'sac', list = this.list(s.mode), size = sac ? Shop.itemSlots(Save.data) : Math.max(12, Math.ceil(list.length / 12) * 12);
    s.view = { ...s.view, ...change, list, size, ground: s.ground?.item, listName: sac ? `Sac ${list.length} / ${size}` : `Coffre ${list.length}`,
      fresh: (it) => !Items.acquired(Save.data, it),
      hint: s.ground ? 'Entrée ou clic\u00a0: laisser cet objet\u00a0; Échap\u00a0: rien' : `Entrée ou clic\u00a0: porter, ${sac ? 'ranger au sac' : 'rendre au coffre'}\u00a0; Échap\u00a0: fermer` };
    s.panel?.draw(s.view);
    return s.view;
  }

  /** Enter or a click on cell `i` of the panel: a worn slot is taken off (into the bag, or the chest); an item of the
   *  list is worn (in its family's free slot, else the slot chosen next: Remplacer lequel ?); the bag full and an item
   *  on the floor, the item chosen is left there in its place. */
  private act(i: number) {
    const s = this.satchel!, worn = Save.data.worn, list = this.list(s.mode), k = i - Items.SLOTS.length, held = s.view.held;
    let line = '';
    if (s.ground) {
      if (k < 0 || !list[k]) return;
      const left = Items.swap(this.bag, k, s.ground.item), at = { x: s.ground.x, y: s.ground.y };
      this.dropLoot(s.ground);
      this.addLoot({ ...at, item: left });
      this.closeSatchel();
      Sfx.play(this, 'gift', 1);
      this.hud.title(`${Items.ITEMS[this.bag[k].id].name} : dans le sac`);
      return this.showBlood();
    }
    if (held !== undefined) { // a relic or a talisman waiting for its slot
      if (k < 0 && !Items.equip(worn, list, held, i)) line = `Pas un emplacement de ${Items.FAMILY[Items.family(list[held])].toLowerCase()}.`;
    } else if (k < 0) {
      if (worn[i] && !Items.unequip(worn, i, list, s.mode === 'sac' ? Shop.itemSlots(Save.data) : Infinity)) line = 'Sac plein.';
    } else if (list[k] && !Items.equip(worn, list, k)) return void this.showSatchel({ held: k, line: 'Remplacer lequel ?' });
    this.dress();
    this.showSatchel({ held: undefined, line });
  }

  /** Opens the zone's map over the game, paused (map.ts); elsewhere, or busy, nothing. */
  private openMap() {
    const z = this.room.zone?.id;
    if (!z || this.satchel || this.counter || this.stall || this.dead || this.prey || this.cut || this.phase !== 'play') return;
    this.hero.setVelocity(0);
    this.carte = Carte.open(this, z, this.hero.body!.center, this.facing);
    Sfx.play(this, 'snap');
  }

  private closeMap() {
    this.carte?.close();
    this.carte = undefined;
  }

  private closeSatchel() {
    if (!this.satchel) return;
    this.satchel.panel.close();
    this.satchel = undefined;
    this.physics.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
  }

  /** What he wears changed: its bonuses taken up (at the refuge he rests to his full life; out there a lower max life
   *  caps it, a higher one is not blood regained), and kept (save.ts drops on reading what was not brought back). */
  private dress() {
    this.gear = Items.stats(Save.data.worn);
    this.health = this.layout === 'refuge' ? this.maxHealth() : Math.min(this.health, this.maxHealth());
    this.hud.health(this.health, this.maxHealth());
    Save.store();
    this.showBlood();
  }

  /** Out by exit `exit` (a forward one, or -1 down a room's stairs; the refuge's 0, its stairs): fade to black, then the
   *  room it leads to (world.ts), this one kept as he leaves it, the hounds hunting him at his heels. Leaving the refuge
   *  starts an expedition. In the training room, the refuge's stairs lead to the training crypt. */
  private leave(exit: number) {
    const exp = this.exp ?? expedition(0), way = this.training ? undefined : go(exp.came, this.here, exit);
    if (!this.training && !way) return console.warn(`no way out of ${this.layout} by exit ${exit}: ignored`); // e.g. the refuge's -1
    this.phase = 'leave';
    this.walk = this.room.zone ? -1 : exit < 0 || this.layout === 'refuge' ? 1 : -1;
    this.hero.setCollideWorldBounds(false);
    this.cameras.main.fadeOut(T.expedition.fadeMs);
    let next: Run = { training: true, gifts: this.gifts, ranks: this.ranks, layout: 'hall' };
    if (!this.training) {
      const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
      const hounds = live.filter((e) => e.getData('kind') === 'hound' && e.getData('alert') && !e.getData('followed'));
      const st = exp.rooms[this.here];
      if (st) Object.assign(st, { // as he leaves it; an Amas' torn ghouls are its own, gone with it
        foes: live.filter((e) => !hounds.includes(e) && !e.getData('torn')).map((e) => ({ kind: e.getData('kind') ?? 'ghoul', x: e.x, y: e.y, hp: e.getData('hp'), home: e.getData('home'), followed: e.getData('followed'), pack: e.getData('pack') })),
        caches: this.caches.map(({ x, y, blood, item }) => ({ x, y, blood, item })),
        drops: this.drops.map(({ x, y, blood }) => ({ x, y, blood })),
        items: this.loot.map(({ x, y, item }) => ({ x, y, item })),
      });
      exp.deepest = Math.max(exp.deepest, WORLD[way!.to].ring);
      next = { layout: way!.to, entry: way!.entry, exp, health: this.health, carried: this.carried, hounds: hounds.map((e) => e.getData('hp')), bag: this.bag };
    }
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(next));
  }

  /** The room as a place of the world. */
  private get here() {
    return this.layout as Place;
  }

  private maxHealth() {
    return T.hero.maxHealth + Save.data.unlocks.life * T.ronge.life.hp + this.gear.life + this.v('survivant') - (this.has('maigre') ? T.pacts.maigre.maxBlood : 0);
  }

  private dashCooldown() {
    return (T.dash.cooldownMs / (this.v('fuite') || 1)) * (1 + this.gear.dash) * this.weight().mist;
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
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable && !this.aloft(e));
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
    if (!force && (!Powers.swarm(Save.data) || now < this.swarmReadyAt)) return false;
    if (this.dead || this.prey || this.swarmFx || this.phase === 'enter' || this.phase === 'leave' || now < this.dashUntil || now < this.slashUntil || now < this.castUntil) return false;
    this.swarmUntil = now + T.swarm.durationMs;
    this.swarmReadyAt = this.swarmUntil + T.swarm.cooldownMs;
    this.gnawAt.clear();
    const f = this.hero.body!.center;
    this.swarmFx = Rats.swarm(this, f.x, f.y + 4, T.swarm.rats, T.swarm.radius);
    Sfx.play(this, 'dash');
    if (this.heldBy) (this.heldBy.getData('kind') === 'crocheteur' ? Crocheteur : Enterre).letGo(this.ctx, this.heldBy, now); // rats slip out of any grip, and any net
    this.unnet();
    return true;
  }

  /** The swarm runs with the hero and bites every enemy it covers, each once every T.swarm.tickMs, until its time is up. */
  private stepSwarm(time: number) {
    const f = this.hero.body!.center;
    if (time >= this.swarmUntil) return this.unswarm();
    this.swarmFx!.move(f.x, f.y + 4, time);
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable || this.aloft(e) || time < (this.gnawAt.get(e) ?? 0) || ellipseDist(f, e.body.center, T.swarm.radius, T.swarm.radius * T.lantern.squash) > 1) continue;
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
    if (state === 'lunge') this.damageHero(T.enemy.damage, undefined, e);
    // A hound's leap strikes once and throws him along it, unless he mists through (or turns it aside).
    else if (state === 'leap' && !e.getData('struck') && this.time.now >= this.dashUntil) {
      e.setData('struck', true);
      this.damageHero(T.hound.damage, e.body!.center, e);
      if (e.getData('state') !== 'leap') return; // parried
      this.physics.velocityFromRotation(e.getData('facing'), T.hound.shove, this.shove);
      this.shoveUntil = this.time.now + T.hound.shoveMs;
    }
  }

  /** Every source of harm to the hero goes through here (lunges, bolts, holy light): invulnerability, the mist dash,
   *  HUD, feedback and death are handled once. A grand foe's blow comes `from` a floor point: it lands harder (hit-stop,
   *  shake and knockback scaled to the blood lost, blood flung off him). A foe's own blow (`by`) may meet his parry
   *  (deflect()). Returns false when the hit didn't land. */
  damageHero(amount: number, from?: Phaser.Types.Math.Vector2Like, by?: Sprite): boolean {
    const now = this.time.now;
    // Blows go through la Nuée; only holy light breaks it (update()).
    if (this.dead || (by && now >= this.dashUntil && now >= this.swarmUntil && this.deflect(by)) || (this.training ? Training.opts.god : Training.opts.out) || now < this.invulnUntil || now < this.dashUntil || now < this.swarmUntil) return false;
    this.clawDownAt = this.chargeAt = 0; // a blow taken lets a charge go
    this.invulnUntil = now + T.hero.hurtInvulnMs;
    this.hurtAt = now;
    this.hurtFrom = from && Phaser.Math.Angle.BetweenPoints(from, this.hero.body!.center);
    this.health -= amount;
    this.hud.health(this.health, this.maxHealth());
    const k = amount / 10; // the feel of a blow, per 10 HP (one drop of the old 5-drop life)
    Fx.hurt(this, from ? k : 1);
    Sfx.play(this, 'hurt');
    Crows.din(this.ctx, this.hero.body!.center, now);
    if (from) {
      const F = T.foes, a = Phaser.Math.Angle.BetweenPoints(from, this.hero.body!.center), stop = F.hitStopMs * k;
      Enemy.bleed(this, this.hero.x, this.hero.y, a, Math.round(6 * k), 0.7, 0.8 + 0.3 * k);
      this.physics.velocityFromRotation(a, F.knock * k, this.shove);
      this.shoveUntil = now + stop + F.knockMs; // the freeze holds him; then he is thrown
      this.physics.pause();
      this.time.delayedCall(stop, () => this.physics.resume());
    }
    if (this.health > 0) return true;
    this.perish();
    return true;
  }

  /** Thrown `dx`, `dy` through the air (la Chose du gouffre's sweep): over the chasm's edge, nothing stops him; landing
   *  `into` it, the fall (update()). */
  private fling(dx: number, dy: number, into: boolean) {
    if (this.dead) return;
    this.heldBy = undefined;
    this.hero.body!.checkCollision.none = true;
    this.fly = { x: this.hero.x, y: this.hero.y, dx, dy, at: this.time.now, into };
  }

  /** Into the chasm: he drops out of sight, his cry going down, and the expedition ends as any death does. */
  private fall() {
    this.fly = undefined;
    this.unnet();
    Sfx.play(this, 'fall');
    this.hud.health(0, this.maxHealth());
    this.tweens.add({ targets: this.hero, y: this.hero.y + 60, scale: this.hero.scale * 0.3, alpha: 0, duration: 1100, ease: 'Quad.easeIn' });
    this.perish(true);
  }

  /** The hero's death (`fell`: into the chasm, no body left to dissolve). */
  private perish(fell = false) {
    this.health = Math.min(this.health, 0);
    this.dead = true;
    Sfx.play(this, 'death');
    this.hero.disableBody(false, false);
    if (!fell) Hero.die(this.hero);
    // Back to the refuge, re-formed at his coffin, all the blood he carried lost and the world reset; or back to the
    // training room.
    let lostItems = 0;
    if (this.exp) {
      Save.log({ end: 'mort', deepest: this.exp.deepest, blood: this.carried, life: 0, s: Math.round((Date.now() - this.exp.startedAt) / 1000), loosed: this.exp.loosed, met: this.exp.met, boss: this.exp.boss });
      Save.data.dry++; // re-formed empty-handed: le Rongé hungers
      lostItems = this.bag.filter((it) => !Items.acquired(Save.data, it)).length + Items.die(Save.data); // the bag, and what he wore not yet brought back
      Save.store();
    }
    this.time.delayedCall(fell ? 1800 : 1200, () => this.scene.restart((this.training ? { training: true, gifts: this.gifts, ranks: this.ranks, layout: this.layout } : { lost: this.carried, lostItems }) satisfies Run));
  }

  /** Under a Crocheteur's net. */
  private netted() {
    return this.time.now < this.netUntil;
  }

  /** The net off him (torn, slipped out of as rats, or its time up). */
  private unnet() {
    this.netUntil = this.netPoints = 0;
    this.netG?.clear();
  }

  /** Netted, or held by l'Enterré: a direction key pressed anew (`key`) or a claw (`blow`, on the net or the hand that
   *  holds him) counts toward getting free. True when it counted. */
  private struggle(how: 'blow' | 'key') {
    if (this.netted()) {
      const s = struggle(this.netPoints, how, T.crocheteur);
      this.netPoints = s.points;
      if (s.free) {
        this.unnet();
        Sfx.play(this, 'snap');
      }
      return true;
    }
    if (this.heldBy?.getData('kind') !== 'enterre' || how === 'blow') return false; // (a claw on him: hurtEnemy())
    Enterre.struggled(this.ctx, this.heldBy, 'key', this.time.now);
    return true;
  }

  /** A placed foe on the watch (alertness()): it notices the hero in reach (nearer when he keeps out of the light, see
   *  sightRange()) with no prop between them, and hunts him with its pack; it keeps him in sight farther, and gives up
   *  a while after it lost him. True while it hunts. The training room's hunt from the start. */
  private hunts(e: Sprite, time: number) {
    if (this.training) return true;
    const from = e.body!.center, to = this.hero.body!.center, d = Phaser.Math.Distance.BetweenPoints(from, to), was = !!e.getData('alert');
    const k = this.weight().notice, S = { ...T.sight, range: T.sight.range * k, shade: T.sight.shade * (1 + this.gear.shade) * k, back: T.sight.back * k }; // the blood he drips; a Linceul noir
    const way = Phaser.Math.Angle.BetweenPoints(from, to), back = !was && behind(from, e.getData('facing') ?? 0, to); // on the watch it sees the half it faces
    const sees = d <= sightRange(S, was, this.inLight, back) && this.boltReach(from, way) >= d;
    // Seeing him on the watch, it first turns to him; it hunts only once it has kept him in sight a beat (unaware till then).
    const n = was ? { spotAt: 0, knows: sees } : notice(e.getData('spotAt') ?? 0, sees, time, T.sight.noticeMs);
    if (n.spotAt) e.setData('facing', way);
    const s = alertness({ alert: was, seenAt: e.getData('seenAt') }, n.knows, time, T.sight.giveUpMs);
    e.setData({ ...s, spotAt: n.spotAt });
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

  /** Not hunting: it stands at its post, or walks back to it; called by a flock of crows (`heard`), it goes to look where
   *  they rose first, until it gives up.
   *  shortcut: straight back to its post (a pit or prop in the way stops it), upgrade to the walk grid if foes stick. */
  private idle(e: Sprite) {
    const heard = e.getData('heard'), home = heard?.until > this.time.now ? heard : e.getData('home'), d = Phaser.Math.Distance.BetweenPoints(e, home), a = Phaser.Math.Angle.BetweenPoints(e, home);
    if (d < 4) e.setVelocity(0);
    else this.physics.velocityFromRotation(a, stats(e.getData('kind') ?? 'ghoul').speed * T.sight.homeSpeed, e.body!.velocity);
    e.setData({ state: 'chase', ...(d < 4 ? {} : { facing: a }) });
    // At its post it looks the other way now and then (its back the way in, T.sight), not while it turns to him.
    const now = this.time.now, [lo, hi] = T.sight.turnMs;
    if (d < 4 && !e.getData('spotAt') && now >= (e.getData('turnAt') ?? 0))
      e.setData({ facing: Phaser.Math.Angle.Wrap((e.getData('facing') ?? 0) + Math.PI + Phaser.Math.FloatBetween(-0.6, 0.6)), turnAt: now + Phaser.Math.Between(lo, hi) });
  }

  /** The training room calls an enemy in at `p`: it rises after its telegraph, hunting (`hp` to start it weakened). */
  private spawn(p: { x: number; y: number }, kind: Kind, hp?: number) {
    const human = !['ghoul', 'amas', 'matrice', 'nourrice', ...FAUNA].includes(kind); // the Order's gold sigil (its hounds' too), else the ghouls' pool of blood
    (human ? Crossbow : Enemy).telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
    if (!human) Sfx.play(this, 'spawn');
    this.time.delayedCall(T.enemy.spawnTelegraphMs, () => !this.dead && this.place(p, kind, { hp, alert: true }));
  }

  /** An enemy at `p`, at once: a ghoul, or one of the Order: a crossbowman, a purificateur, a prêtre, a hound, a pénitent,
   *  a sonneur, an inquisiteur or a bourreau, or an Amas of ghouls; the necropolis' crows, Enterré, Gavé. `hp` (else its
   *  kind's), its post `home` (else `p`), `alert`: hunting already; `followed`: a hound that came through an exit after
   *  the hero (never a second one). */
  private place(p: { x: number; y: number }, kind: Kind, o: Placed = {}) {
    const bow = kind === 'crossbow', now = this.time.now;
    const edge = kind === 'chose' ? nearestEdge(decks(this.ctx.pits), p) : undefined, gripped = !!edge && Phaser.Math.Distance.BetweenPoints(edge, p) < 40; // a deck's edge: the chasm's
    const e = (kind === 'chose' ? Chose.create(this, this.enemies, gripped ? edge! : { x: p.x, y: p.y, span: T.chose.span, depth: 40 }, !gripped)
      : Foes.isFoe(kind) ? Foes.create(this, this.enemies, kind, p.x, p.y) : kind === 'nourrice' ? Nourrice.create(this, this.enemies, p.x, p.y) : kind === 'matrice' ? Matrice.create(this, this.enemies, p.x, p.y)
      : kind === 'crows' ? Crows.create(this, this.enemies, p.x, p.y) : (bow ? Crossbow : Enemy).create(this, this.enemies, p.x, p.y)).setCollideWorldBounds(true);
    // hp0: its blood as it came, for its wounds (enemy.ts wounded).
    const common = { state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, kneelUntil: 0,
      hp: o.hp ?? stats(kind).hp, hp0: o.hp ?? stats(kind).hp, home: o.home ?? { x: p.x, y: p.y }, alert: !!o.alert, seenAt: o.alert ? now : -1e9, followed: !!o.followed, pack: o.pack ?? 0 };
    if (Foes.isFoe(kind)) e.setData({ ...common, kind, human: kind !== 'hound' && kind !== 'amas' && !FAUNA.includes(kind), readyAt: now + T[kind].firstMs, aim: Math.PI / 2 });
    else if (kind === 'crows') e.setData({ ...common, kind, state: 'feed', alert: false }); // on their dead, watching
    else if (kind === 'nourrice' || kind === 'matrice') { // in the training room, an arena of what the view shows
      const v = this.cameras.main.worldView, arena = this.training ? [v.x + 20, v.y + 40, v.right - 20, v.bottom - 10] : Cat.ARENA;
      e.setData({ ...common, kind, alert: true, readyAt: 0, phase: 1, arena, ...(kind === 'matrice' ? { state: 'hang', pivot: { x: p.x, y: p.y }, z: T.matrice.hangZ, readyAt: now + T.matrice.reloadMs, birthAt: now, pending: 0 } : {}) });
    }
    else if (bow) e.setData({ ...common, kind: 'crossbow', human: true, readyAt: now + T.crossbow.firstShotMs });
    else e.setData({ ...common, restUntil: 0, ...(o.alert ? {} : { born: -1e9 }) }); // a ghoul on its post, not rising
    return e;
  }
}
