import Phaser from 'phaser';
import { T } from './tuning.ts';
import { dashStopsAt, inArc, nextCombo } from './logic.ts';
import * as Hero from './hero.ts';
import * as Enemy from './enemy.ts';
import * as Room from './room.ts';
import * as Fx from './fx.ts';
import * as Hud from './hud.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;

// Gameplay only: movement, combat, enemy AI, waves. Every visual decision lives in the modules above.
export class RoomScene extends Phaser.Scene {
  health: number = T.hero.maxHealth;
  hero!: Sprite;
  enemies!: Phaser.Physics.Arcade.Group;

  private room!: Room.Room;
  private hud!: Hud.Hud;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing = Math.PI / 2;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private slashReadyAt = 0;
  private slashUntil = 0;
  private lastSlashAt = -1e9;
  private combo = 0;
  private invulnUntil = 0;
  private hurtAt = -1e9;
  private dashRequested = false;
  private dead = false;

  constructor() {
    super('room');
  }

  init() {
    // The scene instance is reused on restart, so run state is reset here.
    this.health = T.hero.maxHealth;
    this.facing = Math.PI / 2; // start facing the camera
    this.dashUntil = this.dashReadyAt = this.slashReadyAt = this.slashUntil = this.invulnUntil = this.combo = 0;
    this.lastSlashAt = this.hurtAt = -1e9;
    this.dead = false;
    this.dashRequested = false;
  }

  create() {
    this.room = Room.build(this);
    const b = this.room.bounds;
    this.physics.world.setBounds(b.x, b.y, b.width, b.height);

    this.hero = Hero.create(this, this.room.heroStart.x, this.room.heroStart.y);
    this.hero.setCollideWorldBounds(true);
    this.enemies = this.physics.add.group();
    this.physics.add.collider(this.hero, this.room.obstacles);
    this.physics.add.collider(this.enemies, this.room.obstacles);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.hero, this.enemies, (_h, e) => this.hurt(e as Sprite));

    this.hud = Hud.create(this);
    this.hud.health(this.health, T.hero.maxHealth);

    this.keys = this.input.keyboard!.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.slash(Math.atan2(p.worldY - this.hero.y, p.worldX - this.hero.x)));
    this.keys.J.on('down', () => this.slash(this.facing));
    // Key events, not JustDown polling: a tap shorter than one frame would otherwise be lost.
    for (const k of [this.keys.SPACE, this.keys.SHIFT]) k.on('down', () => (this.dashRequested = true));

    this.time.delayedCall(900, () => this.spawnWave());
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    const k = this.keys;
    const x = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown);
    const y = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown);
    if ((x || y) && time >= this.slashUntil) this.facing = Math.atan2(y, x);

    const wantsDash = this.dashRequested;
    this.dashRequested = false;
    if (wantsDash && time >= this.dashReadyAt) {
      this.dashUntil = time + T.dash.durationMs;
      this.dashReadyAt = this.dashUntil + T.dash.cooldownMs;
      Fx.dash(this, this.hero, this.facing);
      this.physics.velocityFromRotation(this.facing, T.dash.speed, this.hero.body!.velocity);
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
        this.dashReadyAt = time + T.dash.cooldownMs;
      }
    }
    if (time >= this.dashUntil) {
      this.hero.setVelocity(x, y);
      this.hero.body!.velocity.normalize().scale(time < this.slashUntil ? T.hero.speed * 0.3 : T.hero.speed);
    }

    Hero.show(this.hero, {
      moving: (x || y) !== 0, dashing: time < this.dashUntil, slashing: time < this.slashUntil,
      hurt: time - this.hurtAt < 120, invulnerable: time < this.invulnUntil, facing: this.facing,
    });
    // Mid-swing the hero stands in front of what he strikes, so a dash-in never buries him inside a flashing enemy.
    this.hero.setDepth(this.hero.y + (time < this.slashUntil ? 12 : 0));
    this.hud.dashReady(time >= this.dashReadyAt);

    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable) continue;
      if (time >= e.getData('stunnedUntil') && time >= e.getData('until')) this.stepEnemy(e, time);
      Enemy.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'));
      e.setDepth(e.y);
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
        if (!waiting && dist <= E.lungeRange) {
          e.setVelocity(0).setData({ state: 'windup', until: time + E.windupMs, facing: toHero });
          break;
        }
        // A waiting enemy on the ring circles the hero, or backs off if too close.
        const turn = !waiting || dist > E.holdRange ? 0 : (dist < E.holdRange - 12 ? Math.PI : Math.PI / 2) * e.getData('side');
        const v = this.physics.velocityFromRotation(toHero + turn, E.speed, e.body!.velocity);
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

  private slash(angle: number) {
    const now = this.time.now;
    if (this.dead || now < this.slashReadyAt || now < this.dashUntil) return;
    this.combo = nextCombo(this.combo, now - this.lastSlashAt, T.slash.comboWindowMs);
    this.lastSlashAt = now;
    this.slashReadyAt = now + T.slash.cooldownMs;
    this.slashUntil = now + T.slash.cooldownMs;
    this.facing = angle;
    Fx.slash(this, this.hero.x, this.hero.y, angle, this.combo);

    let hits = 0;
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable || !inArc(this.hero, angle, e, T.slash.range, T.slash.arcDeg)) continue;
      hits++;
      this.hitEnemy(e, angle);
    }
    if (!hits) return;
    // Hit-stop: freeze physics briefly so the impact reads; tweens and timers keep running.
    this.physics.pause();
    this.time.delayedCall(T.slash.hitStopMs, () => this.physics.resume());
  }

  private hitEnemy(e: Sprite, angle: number) {
    const now = this.time.now;
    const hp = e.getData('hp') - T.slash.damage;
    // A hit interrupts whatever the enemy was doing, including a windup: aggression is rewarded.
    e.setData({ hp, state: 'chase', until: 0, stunnedUntil: now + T.enemy.stunMs, flashUntil: now + 70 });
    const kb = this.combo === 2 ? T.slash.knockback * 1.6 : T.slash.knockback;
    this.physics.velocityFromRotation(angle, kb, e.body!.velocity);
    Fx.hit(this, e.x, e.y, angle);
    if (hp > 0) return;
    e.disableBody(false, false);
    Enemy.die(this, e);
    if (!this.enemies.getChildren().some((o) => (o as Sprite).body?.enable)) this.time.delayedCall(1500, () => this.spawnWave());
  }

  private hurt(e: Sprite) {
    const now = this.time.now;
    if (this.dead || e.getData('state') !== 'lunge' || now < this.invulnUntil || now < this.dashUntil) return;
    this.invulnUntil = now + T.hero.hurtInvulnMs;
    this.hurtAt = now;
    this.health -= T.enemy.damage;
    this.hud.health(this.health, T.hero.maxHealth);
    Fx.hurt(this);
    if (this.health > 0) return;
    this.dead = true;
    this.hero.disableBody(false, false);
    this.time.delayedCall(1200, () => this.scene.restart());
  }

  private spawnWave() {
    if (this.dead) return;
    for (const p of this.room.spawns) {
      Enemy.telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
      this.time.delayedCall(T.enemy.spawnTelegraphMs, () => {
        if (this.dead) return;
        const e = Enemy.create(this, this.enemies, p.x, p.y).setCollideWorldBounds(true);
        e.setData({ hp: T.enemy.hp, state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, restUntil: 0, steadyUntil: 0 });
      });
    }
  }
}
