import Phaser from 'phaser';
import { T } from './tuning.ts';
import { biteTarget, burnsAfter, dashStopsAt, inArc, keepDistance, nextCombo, pickSpot, rayDistance } from './logic.ts';
import * as Hero from './hero.ts';
import * as Enemy from './enemy.ts';
import * as Crossbow from './crossbow.ts';
import * as Room from './room.ts';
import * as Fx from './fx.ts';
import * as Hud from './hud.ts';
import * as Sfx from './sfx.ts';
import * as Lantern from './lantern.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;

// Gameplay only: movement, combat, enemy AI, waves. Every visual decision lives in the modules above.
export class RoomScene extends Phaser.Scene {
  health: number = T.hero.maxHealth;
  hero!: Sprite;
  enemies!: Phaser.Physics.Arcade.Group;
  bolts!: Phaser.Physics.Arcade.Group;

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
  private wave = 0;
  private lanterns: Lantern.Lantern[] = [];
  private litMs = 0; // time the hero has stood in holy light, back to 0 when he steps out
  private biteAt = -1e9;
  private biteReadyAt = 0;
  private prey?: Sprite; // the human the hero is latched onto, from the snap until it dies

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
    this.wave = this.litMs = 0;
    this.lanterns = [];
    this.biteAt = -1e9;
    this.biteReadyAt = 0;
    this.prey = undefined;
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
    this.bolts = this.physics.add.group();
    // A bolt that lands is spent; one that misses (dash, invulnerability) flies on.
    this.physics.add.overlap(this.hero, this.bolts, (_h, b) => this.damageHero(T.crossbow.damage) && b.destroy());

    this.hud = Hud.create(this);
    this.hud.health(this.health, T.hero.maxHealth);

    this.keys = this.input.keyboard!.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,K,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // Left click slashes, right click bites, both toward the pointer; J and K do the same toward where he faces.
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const a = Math.atan2(p.worldY - this.hero.y, p.worldX - this.hero.x);
      if (p.button === 0) this.slash(a);
      else if (p.button === 2) this.bite(a);
    });
    this.keys.J.on('down', () => this.slash(this.facing));
    this.keys.K.on('down', () => this.bite(this.facing));
    // Key events, not JustDown polling: a tap shorter than one frame would otherwise be lost.
    for (const k of [this.keys.SPACE, this.keys.SHIFT]) k.on('down', () => (this.dashRequested = true));
    this.input.keyboard!.on('keydown-M', () => (this.sound.mute = !this.sound.mute));

    this.time.delayedCall(900, () => this.spawnWave());
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    const k = this.keys;
    const x = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown);
    const y = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown);
    if ((x || y) && time >= this.slashUntil && !this.prey) this.facing = Math.atan2(y, x);

    const wantsDash = this.dashRequested;
    this.dashRequested = false;
    if (wantsDash && time >= this.dashReadyAt && !this.prey) {
      this.dashUntil = time + T.dash.durationMs;
      this.dashReadyAt = this.dashUntil + T.dash.cooldownMs;
      Fx.dash(this, this.hero, this.facing);
      Sfx.play(this, 'dash');
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
    if (time >= this.dashUntil && !this.prey) { // latched, the bite moves him
      this.hero.setVelocity(x, y);
      this.hero.body!.velocity.normalize().scale(time < this.slashUntil ? T.hero.speed * 0.3 : T.hero.speed);
    }

    Hero.show(this.hero, {
      moving: (x || y) !== 0, dashing: time < this.dashUntil, slashing: time < this.slashUntil, biting: !!this.prey || time - this.biteAt < 130,
      hurt: time - this.hurtAt < 120, invulnerable: time < this.invulnUntil, facing: this.facing,
    });
    // Mid-swing the hero stands in front of what he strikes, so a dash-in never buries him inside a flashing enemy;
    // biting, in front of his prey.
    this.hero.setDepth(this.hero.y + (time < this.slashUntil || this.prey ? 12 : 0));
    this.hud.dashReady(time >= this.dashReadyAt);

    // Holy light: free for a grace on stepping in, then it burns on a steady beat until he steps out (or mists through).
    if (this.lanterns.some((l) => Lantern.lights(l, this.hero.body!.center))) {
      const L = T.lantern, before = burnsAfter(this.litMs, L.graceMs, L.burnEveryMs);
      this.litMs += delta;
      Lantern.sizzle(this, this.hero);
      if (burnsAfter(this.litMs, L.graceMs, L.burnEveryMs) > before && this.damageHero(L.damage)) {
        Lantern.sizzle(this, this.hero, true);
        Sfx.play(this, 'burn');
      }
    } else this.litMs = 0;

    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable) continue;
      const bow = e.getData('kind') === 'crossbow';
      if (time >= e.getData('stunnedUntil') && time >= e.getData('until')) {
        if (bow) this.stepCrossbow(e, time);
        else this.stepEnemy(e, time);
      }
      if (bow) Crossbow.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'), e.getData('reach'), e.getData('hp') <= T.bite.weakAt);
      else Enemy.show(e, e.getData('state'), e.getData('facing'), time < e.getData('flashUntil'));
      e.setDepth(e.y);
    }
    // Bolts fly until the prop or wall they were aimed into.
    for (const b of [...this.bolts.getChildren()] as Sprite[]) {
      b.setDepth(b.y);
      const { x0, y0, angle, reach } = b.data.values;
      if (Phaser.Math.Distance.Between(x0, y0, b.body!.center.x, b.body!.center.y) < reach) continue;
      b.setPosition(x0 + Math.cos(angle) * reach, y0 + Math.sin(angle) * reach - Crossbow.BOLT_HEIGHT);
      Crossbow.boltHit(this, b);
      Sfx.play(this, 'thunk');
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
        if (!waiting && dist <= E.lungeRange) {
          e.setVelocity(0).setData({ state: 'windup', until: time + E.windupMs, facing: toHero });
          Sfx.play(this, 'windup');
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

  // Crossbowman: keeps its distance and strafes; aims (stops, telegraphs, then the line locks), shoots one bolt, reloads.
  private stepCrossbow(e: Sprite, time: number) {
    const C = T.crossbow;
    const from = e.body!.center, to = this.hero.body!.center;
    const toHero = Phaser.Math.Angle.BetweenPoints(from, to);
    const dist = Phaser.Math.Distance.BetweenPoints(from, to);
    if (e.getData('state') === 'aim') {
      // It tracks the hero, then holds its line for the last moments: a sidestep then dodges the bolt.
      if (time < e.getData('fireAt') - C.lockMs) e.setData('facing', toHero);
      const angle = e.getData('facing'), reach = this.boltReach(from, angle);
      e.setData('reach', reach);
      if (time < e.getData('fireAt')) return;
      const b = Crossbow.bolt(this, this.bolts, from.x + Math.cos(angle) * 10, from.y + Math.sin(angle) * 10, angle);
      this.physics.velocityFromRotation(angle, C.boltSpeed, b.body!.velocity);
      b.setData({ x0: from.x, y0: from.y, angle, reach });
      e.setData({ state: 'shoot', until: time + C.recoilMs, readyAt: time + C.reloadMs, bolt: b });
      Sfx.play(this, 'twang');
      return;
    }
    const others = (this.enemies.getChildren() as Sprite[]).filter((o) => o !== e && o.body?.enable);
    // Fair shots: one crossbowman aims at a time, never with its last bolt still flying, and only along a clear line.
    if (time >= e.getData('readyAt') && !e.getData('bolt')?.active && dist >= C.minShot && dist <= C.maxShot
      && !others.some((o) => o.getData('state') === 'aim') && this.boltReach(from, toHero) >= dist) {
      e.setVelocity(0).setData({ state: 'aim', fireAt: time + C.aimMs, facing: toHero, reach: dist });
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

  // How far a bolt flies from floor point `from` along `angle` before a prop or a wall stops it.
  private boltReach(from: Phaser.Types.Math.Vector2Like, angle: number) {
    const props = this.room.obstacles.getChildren().map((o) => o.body as Phaser.Physics.Arcade.StaticBody);
    return rayDistance({ x: from.x!, y: from.y! }, angle, this.room.bounds, props);
  }

  private slash(angle: number) {
    const now = this.time.now;
    if (this.dead || this.prey || now < this.slashReadyAt || now < this.dashUntil) return;
    this.combo = nextCombo(this.combo, now - this.lastSlashAt, T.slash.comboWindowMs);
    this.lastSlashAt = now;
    this.slashReadyAt = now + T.slash.cooldownMs;
    this.slashUntil = now + T.slash.cooldownMs;
    this.facing = angle;
    Fx.slash(this, this.hero.x, this.hero.y, angle, this.combo);
    Sfx.play(this, 'slash', this.combo);

    let hits = 0;
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.body?.enable || !inArc(this.hero, angle, e, T.slash.range, T.slash.arcDeg)) continue;
      hits++;
      this.hitEnemy(e, angle);
    }
    for (const l of [...this.lanterns]) { // aimed at its glass, about the hero's chest height
      if (!l.lit || !inArc(this.hero, angle, { x: l.x, y: l.y - 5 }, T.slash.range, T.slash.arcDeg)) continue;
      hits++;
      this.hitLantern(l, angle);
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
    Sfx.play(this, 'hit', this.combo);
    if (hp <= 0) this.kill(e);
  }

  /** Every enemy death (slash or bite) goes through here, so the wave-clear check lives in one place. */
  private kill(e: Sprite) {
    e.disableBody(false, false);
    (e.getData('kind') === 'crossbow' ? Crossbow : Enemy).die(this, e);
    Sfx.play(this, 'kill');
    if (!this.enemies.getChildren().some((o) => (o as Sprite).body?.enable)) this.time.delayedCall(1500, () => this.spawnWave());
  }

  /**
   * La Morsure. On a weakened human in reach ahead, the hero snaps to its side, latches on its throat and drains it:
   * both are held, and he takes every blow meanwhile. Then it dies like any kill and he regains blood. With no prey,
   * a teeth snap in place.
   */
  private bite(angle: number) {
    const now = this.time.now, B = T.bite;
    if (this.dead || this.prey || now < this.biteReadyAt || now < this.dashUntil || now < this.slashUntil) return;
    const live = (this.enemies.getChildren() as Sprite[]).filter((e) => e.body?.enable);
    const prey = biteTarget(this.hero, angle, live.map((e) => ({ x: e.x, y: e.y, hp: e.getData('hp'), human: !!e.getData('human'), e })),
      B.range, B.arcDeg, B.weakAt)?.e;
    this.biteAt = now;
    this.facing = angle;
    if (!prey) {
      this.biteReadyAt = now + B.whiffCooldownMs;
      Fx.snap(this, this.hero.x, this.hero.y, angle);
      Sfx.play(this, 'snap');
      return;
    }
    this.prey = prey;
    // The bite is drawn side-on: he lands beside it, feet in line with its feet, face at its neck. It faces him.
    const side = this.hero.x < prey.x ? -1 : 1;
    this.facing = side < 0 ? 0 : Math.PI;
    prey.setVelocity(0).setImmovable(true).setData({ state: 'held', until: Infinity, facing: this.facing + Math.PI });
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
        this.health = Math.min(T.hero.maxHealth, this.health + B.heal);
        this.hud.health(this.health, T.hero.maxHealth);
        Fx.heal(this, this.hero);
        Sfx.play(this, 'heal');
      });
    });
  }

  private hitLantern(l: Lantern.Lantern, angle: number) {
    l.hp -= T.slash.damage;
    Sfx.play(this, 'shatter', Number(l.hp <= 0));
    if (l.hp > 0) return Lantern.hit(this, l, angle);
    Lantern.shatter(this, l, angle);
    this.lanterns.splice(this.lanterns.indexOf(l), 1);
  }

  /** The Order plants a lantern on the free spot nearest the hero that leaves him out of its light. */
  private addLantern() {
    const L = T.lantern, p = pickSpot(Lantern.SPOTS, this.hero.body!.center, this.lanterns, L.radius, L.radius * L.squash, L.clear);
    if (!p) return;
    const l = Lantern.create(this, this.room.obstacles, p.x, p.y, L.telegraphMs);
    this.lanterns.push(l);
    Sfx.play(this, 'holy');
    return l;
  }

  private hurt(e: Sprite) {
    if (e.getData('state') === 'lunge') this.damageHero(T.enemy.damage);
  }

  /** Every source of harm to the hero goes through here (lunges, bolts, holy light): invulnerability, the mist dash,
   *  HUD, feedback and death are handled once. Returns false when the hit didn't land. */
  damageHero(amount: number): boolean {
    const now = this.time.now;
    if (this.dead || now < this.invulnUntil || now < this.dashUntil) return false;
    this.invulnUntil = now + T.hero.hurtInvulnMs;
    this.hurtAt = now;
    this.health -= amount;
    this.hud.health(this.health, T.hero.maxHealth);
    Fx.hurt(this);
    Sfx.play(this, 'hurt');
    if (this.health > 0) return true;
    this.dead = true;
    Sfx.play(this, 'death');
    this.hero.disableBody(false, false);
    this.time.delayedCall(1200, () => this.scene.restart());
    return true;
  }

  private spawnWave() {
    if (this.dead) return;
    // From the second wave the Order joins in: crossbowmen (one, then two) take the spawn points farthest from the hero.
    const far = (p: { x: number; y: number }) => Phaser.Math.Distance.BetweenPoints(p, this.hero);
    const bows = [...this.room.spawns].sort((a, b) => far(b) - far(a)).slice(0, Math.min(2, ++this.wave - 1));
    const lanterns = this.wave >= T.lantern.twoFromWave ? 2 : this.wave >= T.lantern.fromWave ? 1 : 0;
    while (this.lanterns.length < lanterns && this.addLantern());
    for (const p of this.room.spawns) {
      if (bows.includes(p)) {
        Crossbow.telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
        this.time.delayedCall(T.enemy.spawnTelegraphMs, () => {
          if (this.dead) return;
          const e = Crossbow.create(this, this.enemies, p.x, p.y).setCollideWorldBounds(true);
          e.setData({ kind: 'crossbow', human: true, hp: T.crossbow.hp, state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, steadyUntil: 0, readyAt: this.time.now + T.crossbow.firstShotMs, reach: 0 });
        });
        continue;
      }
      Enemy.telegraphSpawn(this, p.x, p.y, T.enemy.spawnTelegraphMs);
      Sfx.play(this, 'spawn');
      this.time.delayedCall(T.enemy.spawnTelegraphMs, () => {
        if (this.dead) return;
        const e = Enemy.create(this, this.enemies, p.x, p.y).setCollideWorldBounds(true);
        e.setData({ hp: T.enemy.hp, state: 'chase', until: 0, stunnedUntil: 0, flashUntil: 0, facing: Math.PI / 2, side: Math.random() < 0.5 ? -1 : 1, restUntil: 0, steadyUntil: 0 });
      });
    }
  }
}
