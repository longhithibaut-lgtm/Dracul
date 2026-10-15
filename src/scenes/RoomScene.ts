import Phaser from 'phaser';
import { T } from '../tuning.ts';
import { inArc, waveSizes } from '../logic.ts';
import { makeTextures } from '../textures.ts';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Attack = typeof T.claw | typeof T.bite;

const PILLAR_LAYOUTS = [
  [[300, 200], [660, 200], [300, 360], [660, 360]],
  [[480, 260], [230, 170], [730, 370]],
  [[210, 280], [750, 280], [480, 170]],
];

export class RoomScene extends Phaser.Scene {
  room = 1;
  blood: number = T.player.maxBlood;
  dead = false;
  player!: Sprite;
  ghouls!: Phaser.Physics.Arcade.Group;

  private facing = -Math.PI / 2;
  private mistUntil = 0;
  private mistReadyAt = 0;
  private invulnUntil = 0;
  private readyAt = { claw: 0, bite: 0 };
  private waves: number[] = [];
  private wave = 0;
  private alive = 0;
  private pending = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Graphics;
  private biteIcon!: Phaser.GameObjects.Image;
  private door!: Phaser.GameObjects.Image;
  private bloodFx!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('room');
  }

  init(data: { room?: number; blood?: number }) {
    // Run state is reset here, not in the constructor: the scene instance is reused on restart.
    this.room = data.room ?? 1;
    this.blood = data.blood ?? T.player.maxBlood;
    this.dead = false;
    this.mistUntil = this.mistReadyAt = this.invulnUntil = 0;
    this.readyAt = { claw: 0, bite: 0 };
    this.waves = waveSizes(this.room);
    this.wave = this.alive = this.pending = 0;
  }

  create() {
    makeTextures(this);
    const { width, height, wall } = T;
    this.physics.world.setBounds(wall, wall, width - 2 * wall, height - 2 * wall);

    this.add.tileSprite(width / 2, height / 2, width, height, 'floor');
    this.add.graphics().fillStyle(0x0b080e).fillRect(0, 0, width, wall).fillRect(0, height - wall, width, wall)
      .fillRect(0, 0, wall, height).fillRect(width - wall, 0, wall, height);
    this.door = this.add.image(width / 2, wall / 2, 'door');

    const pillars = this.physics.add.staticGroup();
    for (const [x, y] of PILLAR_LAYOUTS[(this.room - 1) % PILLAR_LAYOUTS.length]) {
      pillars.create(x, y, 'pillar').setDepth(y).setSize(40, 24).setOffset(4, 38);
    }

    this.player = this.physics.add.sprite(width / 2, height - 80, 'player');
    this.player.setCollideWorldBounds(true).setSize(16, 12).setOffset(6, 24);
    this.ghouls = this.physics.add.group();

    this.physics.add.collider(this.player, pillars);
    this.physics.add.collider(this.ghouls, pillars);
    this.physics.add.collider(this.ghouls, this.ghouls);
    this.physics.add.overlap(this.player, this.ghouls, (_p, g) => this.hurt(g as Sprite));

    this.bloodFx = this.add.particles(0, 0, 'blood', {
      speed: { min: 60, max: 180 }, lifespan: 380, scale: { start: 1, end: 0 }, emitting: false,
    }).setDepth(10_000);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,Z,UP,A,Q,LEFT,S,DOWN,D,RIGHT,J,K,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const aim = Math.atan2(p.worldY - this.player.y, p.worldX - this.player.x);
      this.attack(p.rightButtonDown() ? T.bite : T.claw, aim);
    });
    this.keys.J.on('down', () => this.attack(T.claw, this.facing));
    this.keys.K.on('down', () => this.attack(T.bite, this.facing));

    this.hud = this.add.graphics().setDepth(20_000);
    this.biteIcon = this.add.image(250, 23, 'blood').setScale(2.4).setDepth(20_000);
    this.add.text(width - 24, 14, `Salle ${this.room}`, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#d8c8b8' })
      .setOrigin(1, 0).setDepth(20_000);
    this.drawHud();

    if (this.room === 1) {
      const hint = this.add.text(width / 2, height - 22,
        'ZQSD / WASD : se déplacer   ·   Clic gauche : griffes   ·   Clic droit : morsure (soigne)   ·   Espace : brume',
        { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#a89888' }).setOrigin(0.5).setDepth(20_000);
      this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 1000 });
    }

    this.time.delayedCall(600, () => this.spawnWave());
  }

  update(time: number) {
    if (this.dead) return;
    const k = this.keys;
    const x = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.Q.isDown || k.LEFT.isDown);
    const y = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.Z.isDown || k.UP.isDown);
    if (x || y) this.facing = Math.atan2(y, x);

    const wantsMist = Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT);
    if (wantsMist && time >= this.mistReadyAt) {
      this.mistUntil = time + T.mist.durationMs;
      this.mistReadyAt = this.mistUntil + T.mist.cooldownMs;
      this.physics.velocityFromRotation(this.facing, T.mist.speed, this.player.body!.velocity);
      this.player.setAlpha(0.35);
      this.time.delayedCall(T.mist.durationMs, () => this.player.setAlpha(1));
    } else if (time >= this.mistUntil) {
      this.player.setVelocity(x, y);
      this.player.body!.velocity.normalize().scale(T.player.speed);
    }

    for (const g of this.ghouls.getChildren() as Sprite[]) {
      if (!g.body?.enable) continue;
      g.setDepth(g.y);
      if (time >= g.getData('stunnedUntil') && time >= g.getData('until')) this.stepGhoul(g, time);
    }
    this.player.setFlipX(Math.cos(this.facing) < 0).setDepth(this.player.y);
    this.biteIcon.setAlpha(time >= this.readyAt.bite ? 1 : 0.25);
  }

  // Ghoul cycle: chase → windup (stops, glows red) → lunge (the only part that hurts) → recover.
  private stepGhoul(g: Sprite, time: number) {
    const G = T.ghoul;
    switch (g.getData('state')) {
      case 'windup':
        g.clearTint();
        this.physics.velocityFromRotation(g.getData('aim'), G.lungeSpeed, g.body!.velocity);
        g.setData({ state: 'lunge', until: time + G.lungeMs });
        break;
      case 'lunge':
        g.setVelocity(0).setData({ state: 'recover', until: time + G.recoverMs });
        break;
      default: // chase, or recovery finished
        if (Phaser.Math.Distance.BetweenPoints(g, this.player) > G.lungeRange) {
          this.physics.moveToObject(g, this.player, G.speed);
          g.setFlipX(this.player.x < g.x).setData('state', 'chase');
        } else {
          g.setVelocity(0).setTint(0xff5555);
          g.setData({ state: 'windup', until: time + G.windupMs, aim: Phaser.Math.Angle.BetweenPoints(g, this.player) });
        }
    }
  }

  private attack(kind: Attack, angle: number) {
    const now = this.time.now;
    const key = kind === T.claw ? 'claw' : 'bite';
    if (this.dead || now < this.readyAt[key] || now < this.mistUntil) return;
    this.readyAt[key] = now + kind.cooldownMs;
    this.facing = angle;
    this.slashFx(kind, angle);

    let hits = 0;
    for (const g of this.ghouls.getChildren() as Sprite[]) {
      if (!g.body?.enable || !inArc(this.player, angle, g, kind.range, kind.arcDeg)) continue;
      hits++;
      this.hitGhoul(g, kind, angle);
    }
    if (!hits) return;

    // Hit-stop: freeze physics briefly so the impact reads; tweens and timers keep running.
    this.physics.pause();
    this.time.delayedCall(kind.hitStopMs, () => this.physics.resume());
    if (kind === T.bite) {
      this.blood = Math.min(T.player.maxBlood, this.blood + T.bite.heal);
      this.drawHud();
      this.cameras.main.shake(140, 0.006);
    } else {
      this.cameras.main.shake(70, 0.003);
    }
  }

  private hitGhoul(g: Sprite, kind: Attack, angle: number) {
    const hp = g.getData('hp') - kind.damage;
    // A hit interrupts whatever the ghoul was doing, including a windup: aggression is rewarded.
    g.setData({ hp, stunnedUntil: this.time.now + T.ghoul.stunMs, state: 'chase', until: 0 });
    g.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(80, () => g.clearTint());
    this.physics.velocityFromRotation(angle, kind.knockback, g.body!.velocity);
    if (kind === T.bite) this.bloodFx.explode(14, g.x, g.y);
    if (hp > 0) return;

    g.disableBody(false, false);
    this.alive--;
    this.tweens.add({ targets: g, scaleX: 1.4, scaleY: 0.2, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
    this.bloodFx.explode(8, g.x, g.y);
    if (this.alive === 0 && this.pending === 0) this.nextWave();
  }

  private hurt(g: Sprite) {
    const now = this.time.now;
    if (this.dead || g.getData('state') !== 'lunge' || now < this.invulnUntil || now < this.mistUntil) return;
    this.invulnUntil = now + T.player.hurtInvulnMs;
    this.blood -= T.ghoul.damage;
    this.drawHud();
    this.cameras.main.shake(160, 0.012);
    this.player.setTint(0xff3344).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(100, () => this.player.clearTint());
    this.tweens.add({ targets: this.player, alpha: 0.4, duration: 90, yoyo: true, repeat: 3 });
    if (this.blood <= 0) this.die();
  }

  private spawnWave() {
    const count = this.waves[this.wave];
    this.pending = count;
    for (let i = 0; i < count; i++) {
      // Telegraph each spawn so ghouls never appear on top of the player unannounced.
      let x = 0, y = 0;
      do {
        x = Phaser.Math.Between(T.wall + 40, T.width - T.wall - 40);
        y = Phaser.Math.Between(T.wall + 40, T.height - T.wall - 40);
      } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 170);
      const ring = this.add.image(x, y, 'spawn').setDepth(1);
      this.tweens.add({ targets: ring, scale: { from: 1.4, to: 0.6 }, alpha: { from: 0.3, to: 1 }, duration: T.ghoul.spawnTelegraphMs, delay: i * 120 });
      this.time.delayedCall(T.ghoul.spawnTelegraphMs + i * 120, () => {
        ring.destroy();
        if (this.dead) return;
        const g = this.ghouls.create(x, y, 'ghoul') as Sprite;
        g.setSize(22, 14).setOffset(4, 14).setCollideWorldBounds(true);
        g.setData({ hp: T.ghoul.hp, stunnedUntil: 0, state: 'chase', until: 0 });
        this.pending--;
        this.alive++;
      });
    }
  }

  private nextWave() {
    this.wave++;
    if (this.wave < this.waves.length) {
      this.time.delayedCall(500, () => this.spawnWave());
      return;
    }
    // Room cleared: open the door; touching it leads to the next room with current blood.
    this.door.setTexture('door-open');
    this.tweens.add({ targets: this.door, alpha: { from: 0.6, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    const exit = this.add.zone(T.width / 2, T.wall + 10, 80, 20);
    this.physics.add.existing(exit, true);
    let left = false; // the overlap fires every physics step until the restart happens
    this.physics.add.overlap(this.player, exit, () => {
      if (this.dead || left) return;
      left = true;
      this.scene.restart({ room: this.room + 1, blood: this.blood });
    });
  }

  private die() {
    this.dead = true;
    this.player.disableBody(false, false);
    this.tweens.add({ targets: this.player, scaleY: 0, alpha: 0, duration: 700, ease: 'Quad.easeIn' });
    this.bloodFx.explode(30, this.player.x, this.player.y);
    const style = { fontFamily: 'Georgia, serif', color: '#e8d8c8', align: 'center' };
    this.add.text(T.width / 2, T.height / 2 - 30, 'Tu retombes en poussière…', { ...style, fontSize: '34px' }).setOrigin(0.5).setDepth(20_000);
    this.add.text(T.width / 2, T.height / 2 + 20, `Salle atteinte : ${this.room}\n\nEspace ou clic pour renaître`, { ...style, fontSize: '18px' })
      .setOrigin(0.5).setDepth(20_000);
    this.time.delayedCall(800, () => {
      let done = false; // key and click may both fire
      const restart = () => {
        if (done) return;
        done = true;
        this.scene.restart({ room: 1 });
      };
      this.input.keyboard!.once('keydown-SPACE', restart);
      this.input.once('pointerdown', restart);
    });
  }

  private slashFx(kind: Attack, angle: number) {
    const fx = this.add.graphics().setPosition(this.player.x, this.player.y).setDepth(9_000);
    const half = (kind.arcDeg * Math.PI) / 360;
    if (kind === T.claw) {
      fx.lineStyle(3, 0xf2e6da, 0.9);
      for (const r of [kind.range - 18, kind.range - 10, kind.range - 2]) {
        fx.beginPath().arc(0, 0, r, angle - half, angle + half).strokePath();
      }
    } else {
      fx.fillStyle(0xc4182f, 0.8).slice(0, 0, kind.range, angle - half, angle + half).fillPath();
    }
    this.tweens.add({ targets: fx, alpha: 0, duration: 140, onComplete: () => fx.destroy() });
  }

  private drawHud() {
    const w = 200;
    this.hud.clear()
      .fillStyle(0x2a0e14).fillRect(24, 16, w, 14)
      .fillStyle(0xb3122b).fillRect(24, 16, (w * Math.max(0, this.blood)) / T.player.maxBlood, 14)
      .lineStyle(2, 0x5a1a24).strokeRect(24, 16, w, 14);
  }
}
