import { describe, expect, it } from 'vitest';
import { T } from './tuning.ts';
import * as Q from './quests.ts';
import { parse, VERSION } from './save.ts';
import { beast, buy, cut, price } from './shop.ts';
import { missing } from './font.ts';

// The four met in the world (quests.ts): their quests move as the rules say, each choice holds for good, and a save
// from before them (version 6) or a broken one reads back to a clean start.
const M = T.quests.mirelle;
const nights = (q: Q.Quests, n: number) => { for (let i = 0; i < n; i++) Q.night(q); };

describe('quests', () => {
  it('feeds Mirelle once a night, and she joins the refuge at the last', () => {
    const q = Q.fresh();
    expect(Q.feed(q, 999)).toBe(false); // not met
    Q.meet(q, 'mirelle');
    expect(Q.feed(q, M.blood - 1)).toBe(false); // too little carried
    expect(Q.feed(q, M.blood)).toBe(true); // the meeting's night
    expect(Q.feed(q, M.blood)).toBe(false); // once a night
    for (let k = 2; k <= M.feeds; k++) { Q.night(q); expect(Q.feed(q, M.blood)).toBe(true); }
    expect(q.mirelle).toMatchObject({ s: 'done', c: 'refuge', n: M.feeds });
    expect(Q.atRefuge(q, 'mirelle')).toBe(true);
    nights(q, 10);
    expect(q.mirelle.s).toBe('done'); // she never turns once joined
  });

  it('turns Mirelle ghoul when left unfed too many nights, and her ghoul dies once', () => {
    const q = Q.fresh();
    Q.meet(q, 'mirelle');
    nights(q, M.starve);
    expect(q.mirelle.s).toBe('open'); // just within
    Q.feed(q, M.blood); // fed: the count starts again
    nights(q, M.starve);
    expect(q.mirelle.s).toBe('open');
    expect(Q.night(q)).toBe(true);
    expect(q.mirelle).toMatchObject({ s: 'failed', c: 'goule' });
    expect(Q.feed(q, 999)).toBe(false);
    expect(Q.slain(q)).toBe(true);
    expect(Q.slain(q)).toBe(false);
    expect(q.mirelle.c).toBe('tuee');
  });

  it('never starves Mirelle before she is met', () => {
    const q = Q.fresh();
    nights(q, 20);
    expect(q.mirelle.s).toBe('new');
    Q.meet(q, 'mirelle');
    expect(q.mirelle.at).toBe(20);
  });

  it('takes the ledger only carried, and only once', () => {
    const q = Q.fresh();
    expect(Q.ledgerLies(q, false)).toBe(false); // nobody asked for it
    Q.meet(q, 'greffier');
    expect(Q.ledgerLies(q, false)).toBe(true);
    expect(Q.ledgerLies(q, true)).toBe(false);
    expect(Q.deliver(q, false)).toBe(false);
    expect(Q.deliver(q, true)).toBe(true);
    expect(Q.deliver(q, true)).toBe(false);
    expect(q.greffier).toMatchObject({ s: 'done', c: 'registre' });
  });

  it('lets Ilse offer her blood only once her Gavé is dead; the choice holds', () => {
    for (const bite of [true, false]) {
      const q = Q.fresh();
      expect(Q.rid(q)).toBe(false);
      Q.meet(q, 'ilse');
      expect(Q.prowls(q)).toBe(true);
      expect(Q.offer(q, bite)).toBe(false);
      expect(Q.rid(q)).toBe(true);
      expect(Q.prowls(q)).toBe(false);
      expect(Q.offer(q, bite)).toBe(true);
      expect(Q.offer(q, !bite)).toBe(false);
      expect(q.ilse).toMatchObject({ s: 'done', c: bite ? 'mordue' : 'epargnee' });
    }
  });

  it('follows the escort rules: only the stairs with Odo near bring him down; his death is for good', () => {
    const q = Q.fresh();
    expect(Q.escortEnds(q, 'stairs', true)).toBeUndefined(); // not freed
    Q.meet(q, 'odo');
    expect(Q.escortEnds(q, 'stairs', false)).toBe('back'); // left behind: back at his stake
    expect(Q.escortEnds(q, 'door', true)).toBe('back');
    expect(Q.escortEnds(q, 'death', true)).toBe('back');
    expect(q.odo.s).toBe('open');
    expect(Q.decide(q, true)).toBe(false); // not there yet
    expect(Q.escortEnds(q, 'stairs', true)).toBe('arrived');
    expect(Q.atRefuge(q, 'odo')).toBe(true);
    expect(Q.escortEnds(q, 'killed', true)).toBeUndefined(); // he is at the refuge now
    const k = Q.fresh();
    Q.meet(k, 'odo');
    expect(Q.escortEnds(k, 'killed', false)).toBe('dead');
    expect(k.odo).toMatchObject({ s: 'failed', c: 'mort' });
    expect(Q.escortEnds(k, 'stairs', true)).toBeUndefined();
    expect(Q.struck(T.quests.odo.hit + 1)).toBe(1);
    expect(Q.struck(1)).toBe(0);
  });

  it('gives Odo to le Rongé: never beast again, cheaper; kept: a craftsman, Mirelle by him holds a night more', () => {
    const s = parse(null);
    Q.meet(s.quests, 'odo');
    Q.escortEnds(s.quests, 'stairs', true);
    s.dry = T.ronge.hunger;
    expect(beast(s)).toBe(true);
    const kept = parse(JSON.stringify(s));
    expect(Q.decide(kept.quests, true)).toBe(true);
    expect(Q.atRefuge(kept.quests, 'odo')).toBe(true);
    expect(Q.forgeCost(0)).toBe(T.quests.odo.forge[0]);
    expect(Q.forgeCost(2)).toBeUndefined();
    expect(Q.decide(s.quests, false)).toBe(true);
    expect(Q.atRefuge(s.quests, 'odo')).toBe(false);
    s.dry = 99;
    expect(beast(s)).toBe(false);
    expect(cut(s)).toBe(T.quests.odo.cut);
    s.banked = 1000;
    buy(s, 'life');
    expect(s.banked).toBe(1000 - price('life', 0, T.quests.odo.cut)!);
    expect(price('life', 0, T.quests.odo.cut)).toBeLessThan(price('life', 0)!);
    const m = parse(null);
    m.quests.mirelle.c = 'refuge';
    m.dry = T.ronge.hunger;
    expect(beast(m)).toBe(false);
    m.dry++;
    expect(beast(m)).toBe(true);
  });

  it('reads a version 7 save (no quests) and a broken one to a clean start', () => {
    expect(VERSION).toBe(8);
    const old = parse(JSON.stringify({ v: 7, banked: 120, unlocks: { bite: true, life: 1, bag: 0 } }));
    expect(old.banked).toBe(120);
    expect(old.quests).toEqual(Q.fresh());
    const bad = parse(JSON.stringify({ v: 8, quests: { night: -4, mirelle: { s: 'eaten', n: 'x', at: 99, c: 'nope' }, odo: { s: 'done', n: 1, at: 0, c: 'donne' }, ilse: null } }));
    expect(bad.quests.night).toBe(0);
    expect(bad.quests.mirelle).toEqual({ s: 'new', n: 0, at: 0 });
    expect(bad.quests.odo).toEqual({ s: 'done', n: 1, at: 0, c: 'donne' });
    expect(bad.quests.ilse).toEqual({ s: 'new', n: 0, at: 0 });
    const round = parse(JSON.stringify(parse(JSON.stringify({ quests: { night: 5, greffier: { s: 'open', n: 0, at: 3 } } }))));
    expect(round.quests.night).toBe(5);
    expect(round.quests.greffier).toEqual({ s: 'open', n: 0, at: 3 });
  });

  it('logs only the quests met, in a line each', () => {
    const q = Q.fresh();
    expect(Q.log(q)).toEqual([]);
    Q.meet(q, 'mirelle');
    Q.meet(q, 'odo');
    expect(Q.log(q)).toHaveLength(2);
    expect(Q.log(q)[0]).toContain('0 / 3');
    // every line of every state, in the bag's pixel font
    const lines: string[] = [];
    for (const [s, n, c] of [['open', 0], ['open', 1], ['done', 1, 'refuge'], ['failed', 0, 'goule'], ['failed', 0, 'tuee'], ['done', 0, 'registre'], ['done', 0, 'mordue'], ['done', 0, 'epargnee'], ['done', 0, 'garde'], ['done', 0, 'donne'], ['failed', 0, 'mort']] as const)
      lines.push(...Q.log({ night: 9, ...Object.fromEntries(Q.QUESTS.map((id) => [id, { s, n, at: 0, c }])) } as Q.Quests));
    expect(missing(lines.join(' ') + ' Quêtes Tu portes le registre de l\'Ordre. Lourd.')).toEqual([]);
  });
});
