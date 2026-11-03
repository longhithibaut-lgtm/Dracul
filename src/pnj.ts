import Phaser from 'phaser';
import { T } from './tuning.ts';
import * as Save from './save.ts';
import * as Q from './quests.ts';
import * as Loot from './loot.ts';
import * as Dialogue from './dialogue.ts';
import * as Carte from './map.ts';
import * as Sfx from './sfx.ts';
import { ITEMS, type ItemId } from './items.ts';
import { prelit } from './dark.ts';
import { SHEETS } from './pnj.data.ts';
import mirelleUrl from './pnj-mirelle.png';
import greffierUrl from './pnj-greffier.png';
import ilseUrl from './pnj-ilse.png';
import odoUrl from './pnj-odo.png';

// The four met in the world (docs/histoire-proposition.md « implémenté »; names and lines provisional, to be validated):
// Mirelle l'Emmurée behind the wall of a mausoleum, le Greffier at his skulls in the catacombs' ossuary gallery, Ilse la
// Fossoyeuse asleep at a stone of the tomb field, Maître Odo bound to a stake in the Order's camp; and those of them who
// come down to the refuge. Each stands at a place of its own (PLACES), breathes, turns to the hero, says its lines in
// the dialogue box (dialogue.ts) on F; quests.ts keeps what was done and chosen. Odo follows the hero once freed (the
// escort). The quests' foes (Mirelle turned ghoul, Ilse's Gavé) are placed through the room (Host.place), tagged
// 'quest'. RoomScene hooks this in: create(), step(), talk() on F, killed(), leaving(); died() and setOut() between.

type Sprite = Phaser.Physics.Arcade.Sprite;
type P = { x: number; y: number };
/** What this module may ask of the room. */
export type Host = {
  layout: string; hero: Sprite; enemies: Phaser.Physics.Arcade.Group; obstacles: Phaser.Physics.Arcade.StaticGroup; pits: Phaser.Physics.Arcade.StaticGroup;
  title(t: string): void;
  carried(): number; spend(n: number): void; give(n: number): void; // the blood in his bag
  heal(n: number): void;
  place(p: P, kind: 'ghoul' | 'gave', hp?: number): Sprite; // a foe of the room's, at once, on its post
  drop(p: P, blood: number): void; // blood on the floor
  loot(p: P, id: ItemId, r: number): void; // an item on the floor
  way(s: Phaser.GameObjects.GameObject): { angle: number }; // toward the hero, round the pits
  pause(on: boolean): void; // the world held while a dialogue is open
  stored(): void; // the save changed what he wears or carries: the room takes it up (RoomScene.dress)
};

// Where each stands (floor points). shortcut: fixed coordinates in the necropolis and the catacombs; when their plans
// are redrawn (the necropolis' redesign), move these to where the plan wants them.
export const PLACES = {
  necropolis: { mirelle: { x: 402, y: 604 }, ilse: { x: 1194, y: 600 }, gave: { x: 1104, y: 640 }, odo: { x: 3102, y: 888 }, ledger: { x: 3282, y: 816 } },
  catacombs: { greffier: { x: 1870, y: 158 } },
  refuge: { mirelle: { x: 726, y: 300 }, greffier: { x: 690, y: 573 }, odo: { x: 990, y: 588 } },
};

export function preload(scene: Phaser.Scene) {
  for (const [id, url] of [['mirelle', mirelleUrl], ['greffier', greffierUrl], ['ilse', ilseUrl], ['odo', odoUrl]] as const)
    if (!scene.textures.exists(`pnj-${id}`)) scene.load.image(`pnj-${id}`, url);
}

// ---- What outlives a room but not an expedition: the ledger carried (lost at death). ----
let ledger = false;
/** The ledger is carried: it weighs like this much blood (RoomScene.weight()). */
export const load = () => (ledger ? T.quests.greffier.weight : 0);
/** The hero died: what he carried of theirs is lost (the ledger back at the camp; Odo back at his stake). */
export function died() { ledger = false; }
/** An expedition sets out from the refuge: a night goes by (Mirelle's hunger). */
export function setOut() {
  Q.night(Save.data.quests);
  Save.store();
}
/** The quest log, as the bag shows it. */
export const log = () => [...(ledger ? ['Tu portes le registre de l\'Ordre. Lourd.'] : []), ...Q.log(Save.data.quests)];

/** One of the four, drawn at floor point `at` from its sheet: show(frame) sets its frame, its depth by its feet. */
function figure(scene: Phaser.Scene, id: keyof typeof SHEETS, at: P, frame: string) {
  const S = SHEETS[id], tex = scene.textures.get(`pnj-${id}`);
  S.FRAMES.forEach((n, i) => tex.has(n) || tex.add(n, 0, i * S.FW, 0, S.FW, S.FH));
  return scene.add.image(at.x, at.y, `pnj-${id}`, frame).setOrigin(0.5, S.SOLE / S.FH).setScale(0.5).setDepth(at.y).setBlendMode(prelit(scene));
}

type Npc = { at: P; s: Phaser.GameObjects.Image; label: Loot.Label; talk(): Dialogue.Talk | string | undefined; show(time: number, near: boolean): void; r?: number };

export type Pnj = ReturnType<typeof create>;
/** The four of this room, as the quests stand. */
export function create(scene: Phaser.Scene, host: Host) {
  const q = Save.data.quests, npcs: Npc[] = [], here = host.layout;
  let box: Dialogue.Box | undefined, escort: { feet: Phaser.GameObjects.Zone; s: Phaser.GameObjects.Image; hp: number; hitAt: number; hurtAt: number; flip: boolean; walked: number } | undefined;
  const store = () => Save.store();
  const say = (who: string, lines: string[], choices?: Dialogue.Choice[]) => ({ who, lines, choices }) satisfies Dialogue.Talk;
  const add = (n: Omit<Npc, 'label'> & { name(): string; lift: number }) => {
    const label = Loot.label(scene, n.at.x, n.at.y - n.lift, n.name());
    npcs.push({ ...n, label });
    return n;
  };
  const block = (at: P, w: number, h: number) => { const z = scene.add.zone(at.x, at.y - h / 2, w, h); host.obstacles.add(z); return z; };
  const near = (p: P, r: number) => Phaser.Math.Distance.BetweenPoints(host.hero.body!.center, p) < r;

  // ---------- Mirelle l'Emmurée ----------
  const M = T.quests.mirelle;
  if (here === 'necropolis') {
    const at = PLACES.necropolis.mirelle, m = q.mirelle, walled = m.s === 'new' || m.s === 'open';
    const s = figure(scene, 'mirelle', at, walled ? 'wall0' : 'broken');
    block(at, 44, 12);
    let eyesUntil = 0;
    add({ at: { x: at.x, y: at.y + 6 }, s, lift: 50,
      name: () => (m.s === 'new' ? 'Le mausolée muré (F)' : walled ? 'Mirelle (F)' : 'Le mur est cassé'),
      show: (time, close) => { if (q.mirelle.s === 'new' || q.mirelle.s === 'open') s.setFrame(close || time < eyesUntil ? 'eyes' : `wall${Math.floor(time / 900) % 2}`); },
      talk: () => {
        eyesUntil = scene.time.now + 2500;
        if (m.s === 'new') return say('Derrière le mur', ['« Ne regarde pas. Parle-moi seulement. »', '« Je me suis murée. Avant que la faim me prenne la tête. »', '« J\'ai encore mon nom. Mirelle. Pour combien de temps ? »', '« Du sang. Par la fente. Un peu chaque nuit, et je reste moi. »'],
          [{ text: 'Je reviendrai.', act: () => { Q.meet(q, 'mirelle'); store(); } }, { text: 'Non.', act: () => { Q.meet(q, 'mirelle'); store(); host.title('Ses doigts rentrent dans le noir.'); } }]);
        if (m.s === 'open') {
          const starving = q.night - m.at >= M.starve, open = starving ? ['« Ça gratte, dans ma tête. Vite. »'] : [];
          if (!Q.hungry(q)) return say('Mirelle', ['« Demain. Va. »']);
          if (host.carried() < M.blood) return say('Mirelle', [...open, '« Tu n\'as rien. Reviens les mains rouges. »']);
          return say('Mirelle', [...open, '« Tu sens le sang. »'], [
            { text: `Verser ${M.blood} sang par la fente.`, act: () => {
              host.spend(M.blood);
              Q.feed(q, M.blood);
              store();
              Sfx.play(scene, 'drain');
              if (m.s === 'done') { s.setFrame('broken'); Sfx.play(scene, 'crack'); return open1(say('Mirelle', ['« Assez. Recule. »', 'Le mur cède. Elle passe sans te regarder.', '« Je descends chez toi. Ne dis rien au vieux. »'])); }
              open1(say('Mirelle', [m.n === 1 ? '« ...Je l\'entends moins. »' : '« Encore une nuit, et je casse ce mur. »']));
            } },
            { text: 'Garder le sang.', act: () => host.title('Ses doigts rentrent dans le noir.') },
          ]);
        }
        return m.c === 'tuee' ? 'Un ruban rouge, dans la poussière.' : 'Il n\'y a plus personne.';
      } });
    if (m.c === 'goule') { // she turned: her ghoul prowls before her broken wall
      const g = host.place({ x: at.x, y: at.y + 22 }, 'ghoul', M.ghoulHp);
      g.setData({ quest: 'mirelle' });
    }
  }
  if (here === 'refuge' && Q.atRefuge(q, 'mirelle')) {
    const at = PLACES.refuge.mirelle, s = figure(scene, 'mirelle', at, 'sit0');
    block(at, 20, 8);
    const lines = ['« Le Rongé ne parle pas. C\'est bien. »', '« Je compte mes dents. Elles sont toutes là. »', '« Ne me regarde pas trop longtemps. »', '« J\'ai encore mon nom. Ne le dis à personne. »'];
    let k = q.night;
    add({ at, s, lift: 34, name: () => 'Mirelle (F)', show: (time) => s.setFrame(`sit${Math.floor(time / 1100) % 2}`), talk: () => say('Mirelle', [lines[k++ % lines.length]]) });
  }

  // ---------- Le Greffier ----------
  const greffier = (at: P) => {
    const s = figure(scene, 'greffier', at, 'carve0'), g = q.greffier;
    block(at, 26, 8);
    add({ at, s, lift: 30, name: () => (g.s === 'new' ? 'Un vieux (F)' : 'Le Greffier (F)'),
      show: (time, close) => s.setFrame(close ? 'look' : `carve${Math.floor(time / 260) % 2}`),
      talk: () => {
        if (g.s === 'new') return say('Un vieux', ['« Ne marche pas sur les noms. »', '« Chaque crâne, un nom. Ils comptent. Moi, je nomme. »', '« L\'Ordre tient un registre, là-haut, au camp. Tous ceux qu\'ils ont pris. »', '« Monte-le au refuge. Je viendrai le lire. »'],
          [{ text: 'J\'irai.', act: () => { Q.meet(q, 'greffier'); store(); } }, { text: 'Pas mon affaire.', act: () => host.title('Il gratte. Il ne t\'entend plus.') }]);
        if (g.s === 'open') return say('Le Greffier', [ledger ? '« Tu l\'as. Ne meurs pas avec. Monte-le au refuge. »' : '« Le registre. Au camp. Lourd comme un mort. »']);
        if (!g.n) { // the first word after he read it: the catacombs as he knows them
          g.n = 1;
          Carte.revealAll('catacombs');
          Save.data.banked += T.quests.greffier.reward;
          store();
          host.stored();
          return say('Le Greffier', ['« J\'ai lu. Tous. »', '« Toi aussi, ils t\'ont inscrit. Pas de nom. Juste ça : SANS MAISON. PAS DE CIRE. »', '« Toi, tu n\'as pas de nom à graver. Pas encore. »', `« Tiens. Les galeries d'en bas, comme je les connais. » (la carte des catacombes ; ${T.quests.greffier.reward} sang au bassin)`]);
        }
        return say('Le Greffier', [['« Encore un nom. Encore un. »', '« Ils comptent. Moi, je nomme. »', '« Un registre ment par ce qu\'il tait. Comme tous. »'][q.night % 3]]);
      } });
  };
  if (here === 'catacombs' && q.greffier.s !== 'done') greffier(PLACES.catacombs.greffier);
  if (here === 'refuge' && q.greffier.s === 'done') greffier(PLACES.refuge.greffier);
  if (here === 'refuge' && ledger) { // brought up alive: his
    ledger = false;
    Q.deliver(q, true);
    store();
    scene.time.delayedCall(T.expedition.titleMs, () => host.title('Le registre est au refuge. Le Greffier est monté.'));
    greffier(PLACES.refuge.greffier);
  }
  if (here === 'necropolis' && Q.ledgerLies(q, ledger)) { // the ledger, on its crate in the camp
    const at = PLACES.necropolis.ledger, s = figure(scene, 'greffier', at, 'ledger');
    block(at, 22, 8);
    const n = add({ at, s, lift: 22, name: () => 'Le registre de l\'Ordre (F)', show: () => {}, talk: () => {
      ledger = true;
      s.destroy();
      label(n).destroy();
      npcs.splice(npcs.findIndex((o) => o.s === s), 1);
      Sfx.play(scene, 'gift', 1);
      host.stored();
      return 'Le registre : lourd. Ne meurs pas avec.';
    } });
  }

  // ---------- Ilse la Fossoyeuse ----------
  if (here === 'necropolis') {
    const at = PLACES.necropolis.ilse, i = q.ilse, s = figure(scene, 'ilse', at, i.c === 'mordue' ? 'dead' : 'sleep0');
    block(at, 22, 8);
    let up = 0;
    add({ at, s, lift: 34, name: () => (i.s === 'new' ? 'Une humaine endormie (F)' : 'Ilse (F)'),
      show: (time, close) => { if (i.c !== 'mordue') s.setFrame(time < up ? (i.s === 'open' && i.n ? 'offer' : 'wake') : close && i.s !== 'done' ? 'wake' : `sleep${Math.floor(time / 1300) % 2}`); },
      talk: () => {
        up = scene.time.now + 4000;
        if (i.s === 'new') return say('Une humaine', ['« Qui est là ? ...Tu es froid. Ça repose. »', '« J\'ai les yeux brûlés. Je cherche le noir. Ici, il y en a encore. »', '« Le gros vient manger les morts, près de ma tombe. Bientôt moi. »', '« Tue-le. Je n\'ai rien d\'autre à donner que ma reconnaissance. »'],
          [{ text: 'Je le tuerai.', act: () => { Q.meet(q, 'ilse'); store(); gave(); } }, { text: 'Dors.', act: () => host.title('Elle se recroqueville contre la pierre.') }]);
        if (i.s === 'open' && !i.n) return say('Ilse', ['« Il est encore là. Je l\'entends mâcher. »']);
        if (i.s === 'open') return say('Ilse', ['« Il ne mâche plus. »', '« Tu as faim. Je l\'entends à ta voix. »', '« Prends. Je n\'en ai plus besoin. »'], [
          { text: 'Mordre.', act: () => {
            Q.offer(q, true);
            store();
            Sfx.play(scene, 'bite');
            Sfx.play(scene, 'drain');
            host.heal(T.quests.ilse.heal);
            host.give(T.quests.ilse.blood);
            s.setFrame('dead');
            host.title('Elle s\'endort.');
          } },
          { text: 'Non. Dors.', act: () => {
            Q.offer(q, false);
            store();
            host.loot({ x: at.x + 16, y: at.y + 10 }, 'faucille', T.quests.ilse.r);
            open1(say('Ilse', ['« Alors prends ça. C\'était pour creuser. »', '« Je dors, maintenant. Ne fais pas de bruit en partant. »']));
          } },
        ]);
        return i.c === 'mordue' ? 'Elle dort. Pour de bon.' : say('Ilse', [['« Chut. Je dors. »', '« Tu es froid. Ça repose. »'][q.night % 2]]);
      } });
    // her Gavé, prowling by her stone until killed
    const gave = () => { if (Q.prowls(q)) host.place(PLACES.necropolis.gave, 'gave').setData({ quest: 'ilse' }); };
    gave();
  }

  // ---------- Maître Odo ----------
  const O = T.quests.odo;
  if (here === 'necropolis' && (q.odo.s === 'new' || (q.odo.s === 'open' && !q.odo.n))) {
    const at = PLACES.necropolis.odo, s = figure(scene, 'odo', at, 'stake');
    const post = block(at, 12, 6);
    const n = add({ at, s, lift: 54, name: () => (q.odo.s === 'new' ? 'Un homme de l\'Ordre (F)' : 'Maître Odo (F)'),
      show: () => {},
      talk: () => {
        if (escort) return say('Maître Odo', [['« Plus lentement. Je suis vieux. »', '« Les lanternes ? Ce n\'est que de l\'huile. »', '« Ils nous voient. Ils me voient, moi. »'][Math.floor(scene.time.now / 5000) % 3]]);
        const free = { text: 'Le détacher.', act: () => {
          Q.meet(q, 'odo');
          store();
          host.obstacles.remove(post, true, true);
          label(n).destroy();
          n.s.setVisible(false);
          follow(at, npcs.find((o) => o.s === n.s)!);
          host.title('Il te suit. Lentement.');
        } };
        return q.odo.s === 'new'
          ? say('Un homme de l\'Ordre', ['« Je sais ce que tu es. Je sais ce que tu crains. »', '« Maître Odo, lanternier. Ils m\'ont attaché là. Une erreur. »', '« Détache-moi. Emmène-moi chez toi, en bas. Je travaillerai. »'], [free, { text: 'Le laisser.', act: () => host.title('Il appelle. Personne ne vient.') }])
          : say('Maître Odo', ['« Tu reviens. Je savais. »', '« Détache-moi encore. Cette fois, ne cours pas. »'], [free, { text: 'Le laisser.', act: () => host.title('Il appelle. Personne ne vient.') }]);
      } });
  }
  /** Freed: his feet a body of their own, he walks after the hero (the escort). */
  const follow = (at: P, n: Npc) => {
    const feet = scene.add.zone(at.x, at.y - 3, 10, 6);
    scene.physics.add.existing(feet);
    (feet.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    scene.physics.add.collider(feet, host.obstacles);
    scene.physics.add.collider(feet, host.pits);
    escort = { feet, s: n.s.setVisible(true), hp: O.hp, hitAt: 0, hurtAt: -1e9, flip: false, walked: 0 };
    n.at = (feet.body as Phaser.Physics.Arcade.Body).center;
    n.label = { near: () => {}, destroy: () => {} }; // (no words over him as he walks)
    n.show = () => {};
  };
  if (here === 'refuge' && Q.atRefuge(q, 'odo')) {
    const at = PLACES.refuge.odo, s = figure(scene, 'odo', at, 'idle0');
    block(at, 14, 6);
    add({ at, s, lift: 54, name: () => 'Maître Odo (F)', show: (time, close) => s.setFrame(close ? 'plead' : `idle${Math.floor(time / 900) % 2}`),
      talk: () => {
        if (q.odo.s === 'open') return say('Maître Odo', ['« C\'est donc ça, ton trou. »', '« Je peux réparer. Forger. Tout ce que l\'Ordre m\'a appris. »', '« Pourquoi il me regarde comme ça, l\'autre, au bassin ? »'], [
          { text: 'Tu travailleras pour moi.', act: () => { Q.decide(q, true); store(); host.title('Il sourit trop.'); } },
          { text: 'Le Rongé a faim.', act: () => {
            Q.decide(q, false);
            store();
            Sfx.play(scene, 'growl');
            s.destroy();
            label(npcs.find((o) => o.s === s)!).destroy();
            npcs.splice(npcs.findIndex((o) => o.s === s), 1);
            host.title('Le Rongé ne laisse rien.');
            host.stored();
          } },
        ]);
        const w = Save.data.worn[0], cost = w ? Q.forgeCost(w.r) : undefined;
        return say('Maître Odo', [['« Les lanternes ? Ce n\'est que de l\'huile. »', '« Apporte. Je répare tout. »', '« Je ne dors pas bien, ici. Ça ne fait rien. »'][q.night % 3]], [
          w && cost !== undefined
            ? { text: `Reforger ${ITEMS[w.id].name} (${cost} sang du bassin).`, off: Save.data.banked < cost, act: () => {
              Save.data.banked -= cost;
              w.r++;
              store();
              host.stored();
              Sfx.play(scene, 'gift', 1);
              host.title(`${ITEMS[w.id].name} : reforgée.`);
            } }
            : { text: w ? 'Rien à reforger : elle est parfaite.' : 'Rien à reforger : tu ne portes pas d\'arme.', off: true },
          { text: 'Rien.' },
        ]);
      } });
  }

  const label = (n: { s: Phaser.GameObjects.Image }) => npcs.find((o) => o.s === n.s)!.label;
  /** A talk opened over the paused world; a bare string is a title, no box. */
  const open1 = (t: Dialogue.Talk) => {
    host.pause(true);
    box = Dialogue.open(scene, t, () => { box = undefined; host.pause(false); });
  };
  const odoDies = () => {
    const e = escort!;
    escort = undefined;
    Q.escortEnds(q, 'killed', false);
    store();
    e.s.setFrame('hurt');
    scene.tweens.add({ targets: e.s, alpha: 0, duration: 1600, delay: 600 });
    const n = npcs.find((o) => o.s === e.s);
    n?.label.destroy();
    if (n) npcs.splice(npcs.indexOf(n), 1);
    Sfx.play(scene, 'death');
    host.title('Maître Odo est mort.');
  };

  return {
    /** A dialogue is open: the hero waits. */
    busy: () => !!box,
    /** F by one of them: their words (true), or nothing at hand (false). */
    talk() {
      if (box) return true;
      const n = npcs.find((o) => near(o.at, o.r ?? T.quests.talk));
      if (!n) return false;
      host.hero.setVelocity(0);
      const t = n.talk();
      if (typeof t === 'string') host.title(t);
      else if (t) open1(t);
      return true;
    },
    next: () => box?.next(),
    pick: (i: number) => box?.pick(i),
    hover: (x: number, y: number) => box?.hover(x, y),
    click: (x: number, y: number) => box?.click(x, y),
    close: () => box?.close(),
    line: () => box?.line(), // (the headless checks')
    /** Every frame: their poses, their words near, Odo's walk after the hero and the blows he takes. */
    step(time: number, delta: number) {
      for (const n of npcs) {
        const close = near(n.at, 64);
        n.label.near(close && !box);
        n.show(time, close);
      }
      const e = escort;
      if (!e || box) return;
      const b = e.feet.body as Phaser.Physics.Arcade.Body, h = host.hero.body!.center, d = Phaser.Math.Distance.BetweenPoints(b.center, h), view = scene.cameras.main.worldView;
      if (d > O.lost && !view.contains(b.center.x, b.center.y)) b.reset(h.x - 12, h.y); // left far behind out of sight: he catches up
      if (d > O.keep) scene.physics.velocityFromRotation(host.way(e.feet).angle, O.speed, b.velocity);
      else b.setVelocity(0);
      const moving = b.velocity.lengthSq() > 1;
      if (moving) { e.walked += (O.speed * delta) / 1000; e.flip = b.velocity.x < 0; }
      e.s.setPosition(b.center.x, b.center.y + 3).setDepth(b.center.y + 3).setFlipX(e.flip).setFrame(time - e.hurtAt < 300 ? 'hurt' : moving ? `walk${Math.floor(e.walked / 9) % 4}` : `idle${Math.floor(time / 900) % 2}`);
      // The foes go for him: one idle near him rouses; one hunting near enough strikes him.
      for (const f of host.enemies.getChildren() as Sprite[]) {
        if (!f.body?.enable || f.getData('kind') === 'crows' || f.getData('kind') === 'chose') continue;
        const fd = Phaser.Math.Distance.BetweenPoints(f.body.center, b.center);
        if (!f.getData('alert') && fd < O.draw) f.setData({ alert: true, seenAt: time });
        if (f.getData('alert') && fd < O.reach && time >= e.hitAt) {
          e.hitAt = time + O.hitMs;
          e.hurtAt = time;
          e.hp = Q.struck(e.hp);
          Sfx.play(scene, 'hit');
          e.s.setTint(0xff6060);
          scene.time.delayedCall(120, () => e.s.clearTint());
          if (!e.hp) return odoDies();
        }
      }
    },
    /** A foe of the room died: a quest's own? */
    killed(f: Sprite) {
      const id = f.getData('quest');
      if (id === 'mirelle' && Q.slain(q)) {
        store();
        host.drop({ x: f.x, y: f.y }, M.ribbon);
        host.title('Elle avait encore son nom.');
      }
      if (id === 'ilse' && Q.rid(q)) { store(); host.title('Il ne mâchera plus.'); }
    },
    /** He leaves this room for `to`: with Odo at his heels down the refuge's stairs, Odo comes; by another door, Odo
     *  is left (back at his stake next time). */
    leaving(to: string) {
      if (!escort) return;
      const close = Phaser.Math.Distance.BetweenPoints((escort.feet.body as Phaser.Physics.Arcade.Body).center, host.hero.body!.center) < O.near;
      if (Q.escortEnds(q, to === 'refuge' ? 'stairs' : 'door', close) === 'arrived') store();
      else host.title('Maître Odo reste en arrière.');
      escort = undefined;
    },
    /** Odo's blood left, while he follows (undefined: he does not). */
    odo: () => escort?.hp,
  };
}
