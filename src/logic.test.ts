import { describe, expect, it } from 'vitest';
import { alertness, sightRange, biteTarget, buffered, dashFree, poiseHit, carry, scent, edgePip, viewSize, burnsAfter, dashStopsAt, dashStrikes, ellipseDist, glyphSpot, inArc, keepDistance, nextCombo, pickSpot, placeGroups, rayDistance, stepsFrom, wound, turn, left, frameOf, type Turn, burden, behind, notice, predatory, parries, charging, chargeOf } from './logic.ts';
import { GIFTS, GIFT_IDS, KINDS, RARITY, kind, value } from './gifts.ts';
import { T } from './tuning.ts';
import { numbers } from './items.ts';
import { missing, width } from './font.ts';
import * as Crypt from './crypt.data.ts';

describe('inArc', () => {
  const o = { x: 0, y: 0 };

  it('hits ahead in range, misses out of range or behind', () => {
    expect(inArc(o, 0, { x: 25, y: 0 }, 30, 90)).toBe(true);
    expect(inArc(o, 0, { x: 35, y: 0 }, 30, 90)).toBe(false);
    expect(inArc(o, 0, { x: -20, y: 0 }, 30, 90)).toBe(false);
  });

  it('respects the arc edge and the ±PI seam', () => {
    const t = { x: Math.cos((40 * Math.PI) / 180) * 20, y: Math.sin((40 * Math.PI) / 180) * 20 };
    expect(inArc(o, 0, t, 30, 90)).toBe(true);
    expect(inArc(o, 0, t, 30, 60)).toBe(false);
    expect(inArc(o, Math.PI, { x: -25, y: -4 }, 30, 90)).toBe(true);
  });
});

describe('biteTarget', () => {
  const o = { x: 0, y: 0 };
  const human = (x: number, y: number, hp: number) => ({ x, y, hp, human: true });

  it('bites the nearest weakened human ahead, in reach', () => {
    const near = human(15, 2, 1), far = human(24, 0, 1);
    expect(biteTarget(o, 0, [far, near], 26, 140, 1)).toBe(near);
  });

  it('never a healthy human, a ghoul, one out of reach or behind', () => {
    expect(biteTarget(o, 0, [human(15, 0, 2)], 26, 140, 1)).toBeUndefined(); // not weakened yet
    expect(biteTarget(o, 0, [{ x: 15, y: 0, hp: 1, human: false }], 26, 140, 1)).toBeUndefined(); // dead blood
    expect(biteTarget(o, 0, [human(30, 0, 1)], 26, 140, 1)).toBeUndefined();
    expect(biteTarget(o, 0, [human(-15, 0, 1)], 26, 140, 1)).toBeUndefined();
  });

  it('unaimed (a full circle): the nearest one all around, behind included', () => {
    const behind = human(-12, 3, 1);
    expect(biteTarget(o, 0, [human(20, 0, 1), behind], 26, 360, 1)).toBe(behind);
  });
});

describe('nextCombo', () => {
  it('chains 0→1→2→0 inside the window and restarts outside it', () => {
    expect(nextCombo(0, 100, 450)).toBe(1);
    expect(nextCombo(1, 100, 450)).toBe(2);
    expect(nextCombo(2, 100, 450)).toBe(0);
    expect(nextCombo(1, 900, 450)).toBe(0);
  });
});

describe('dashStopsAt', () => {
  const v = { x: 100, y: 0 }; // 0.1 s covers 10 px

  it('stops at contact with a target the dash would end on, including on its last frame', () => {
    expect(dashStopsAt({ x: 0, y: 0 }, v, 0.4, { x: 30, y: 0 }, 20)).toBe(false); // not in contact yet
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 30, y: 0 }, 20)).toBe(true);
    expect(dashStopsAt({ x: 25, y: 0 }, v, 0, { x: 40, y: 0 }, 20)).toBe(true);
  });

  it('passes through targets mid-path and never stops for one behind or off to the side', () => {
    expect(dashStopsAt({ x: 0, y: 0 }, v, 0.4, { x: 10, y: 0 }, 20)).toBe(false);
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 2, y: 0 }, 20)).toBe(false);
    expect(dashStopsAt({ x: 12, y: 0 }, v, 0.28, { x: 30, y: 25 }, 20)).toBe(false);
  });
});

describe('rayDistance', () => {
  const room = { x: 0, y: 0, width: 100, height: 100 };
  const from = { x: 50, y: 50 };
  const prop = { x: 70, y: 40, width: 10, height: 20 };

  it('stops at the first prop ahead, else at the wall', () => {
    expect(rayDistance(from, 0, room, [prop])).toBeCloseTo(20);
    expect(rayDistance(from, Math.PI, room, [prop])).toBeCloseTo(50); // prop behind
    expect(rayDistance(from, -Math.PI / 2, room, [prop])).toBeCloseTo(50); // straight up, prop off to the side
    expect(rayDistance({ x: 50, y: 10 }, 0, room, [prop])).toBeCloseTo(50); // passes above it
  });

  it('clips a prop corner on a diagonal', () => {
    expect(rayDistance({ x: 60, y: 30 }, Math.PI / 4, room, [prop])).toBeCloseTo(Math.SQRT2 * 10);
  });
});

describe('keepDistance', () => {
  it('closes in when far, strafes in the band, backs off when close, on its side', () => {
    expect(Math.abs(keepDistance(200, 110, 140, 1))).toBeLessThan(0.2 * Math.PI + 1e-9);
    expect(keepDistance(125, 110, 140, 1)).toBeCloseTo(Math.PI / 2);
    expect(keepDistance(125, 110, 140, -1)).toBeCloseTo(-Math.PI / 2);
    expect(keepDistance(60, 110, 140, 1)).toBeGreaterThan(0.85 * Math.PI);
  });
});

describe('glyphSpot', () => {
  const room = { x: 0, y: 0, width: 200, height: 100 };

  it('lands on the target in reach, else at the end of the reach toward it', () => {
    expect(glyphSpot({ x: 50, y: 50 }, { x: 80, y: 90 }, 110, room)).toEqual({ x: 80, y: 90 });
    const far = glyphSpot({ x: 20, y: 50 }, { x: 180, y: 50 }, 110, room);
    expect(far).toEqual({ x: 130, y: 50 });
  });

  it('stays in the room, never farther than the reach from a hero inside it', () => {
    const p = glyphSpot({ x: 190, y: 90 }, { x: 260, y: 160 }, 110, room);
    expect(p).toEqual({ x: 200, y: 100 });
    const q = glyphSpot({ x: 10, y: 10 }, { x: -100, y: 60 }, 110, room);
    expect(q.x).toBe(0);
    expect(Math.hypot(q.x - 10, q.y - 10)).toBeLessThanOrEqual(110);
  });
});

describe('holy light', () => {
  it('pools are squashed ellipses: wider than tall', () => {
    const c = { x: 100, y: 100 };
    expect(ellipseDist(c, { x: 139, y: 100 }, 40, 29)).toBeLessThan(1);
    expect(ellipseDist(c, { x: 100, y: 128 }, 40, 29)).toBeLessThan(1);
    expect(ellipseDist(c, { x: 100, y: 131 }, 40, 29)).toBeGreaterThan(1);
    expect(ellipseDist(c, { x: 130, y: 122 }, 40, 29)).toBeGreaterThan(1); // past the edge on the diagonal
  });

  it('burns after a grace, then on a steady beat', () => {
    expect(burnsAfter(0, 400, 900)).toBe(0);
    expect(burnsAfter(399, 400, 900)).toBe(0);
    expect(burnsAfter(400, 400, 900)).toBe(1);
    expect(burnsAfter(1299, 400, 900)).toBe(1);
    expect(burnsAfter(1300, 400, 900)).toBe(2);
  });

  it('plants the lantern nearest the hero, never lighting him nor on a taken spot', () => {
    const spots = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 200, y: 0 }];
    expect(pickSpot(spots, { x: 10, y: 0 }, [], 40, 29, 1.3)).toEqual({ x: 70, y: 0 }); // (0,0) would light him
    expect(pickSpot(spots, { x: 10, y: 0 }, [{ x: 70, y: 0 }], 40, 29, 1.3)).toEqual({ x: 200, y: 0 });
    expect(pickSpot(spots.slice(0, 1), { x: 10, y: 0 }, [], 40, 29, 1.3)).toBeUndefined();
  });
});

describe('gifts (training room)', () => {
  it('knows a pact from a slot gift', () => {
    expect(kind('maigre')).toBe('pacte');
  });

  it('every gift text, at every rarity, is in the typeface; names fit on one line', () => {
    for (const id of GIFT_IDS) {
      const g = GIFTS[id], texts = [0, 1, 2].map(g.text);
      for (const t of texts) expect(missing(t)).toEqual([]);
      expect(missing(g.name + KINDS[kind(id)].toUpperCase() + RARITY.join('').toUpperCase())).toEqual([]);
      expect(width(g.name)).toBeLessThanOrEqual(120);
      if (g.ranked) expect(new Set(texts).size).toBe(3);
      for (const r of g.requires ?? []) expect(GIFT_IDS).toContain(r);
    }
  });

  it('a gift with a rarity is stronger at each rarity; the others have none', () => {
    for (const id of GIFT_IDS.filter((id) => GIFTS[id].ranked)) expect(value(id, 0) < value(id, 1) && value(id, 1) < value(id, 2)).toBe(true);
    expect(GIFTS.griffes.ranked && !GIFTS.perce.ranked && !GIFTS.contagion.ranked && !GIFTS.maigre.ranked).toBe(true);
    expect(value('perce', 2)).toBe(0);
  });
});

describe('dashStrikes', () => {
  it('at the end of the dash and up to the window after it, not later, and never before any dash', () => {
    expect(dashStrikes(1100, 1100, 500, 120)).toBe(true); // pressed mid-dash, fired as it ends
    expect(dashStrikes(1220, 1100, 500, 120)).toBe(true);
    expect(dashStrikes(1221, 1100, 500, 120)).toBe(false);
    expect(dashStrikes(50, 0, -1e9, 120)).toBe(false);
  });

  it('once per dash: the next slash in the window is an ordinary one', () => {
    expect(dashStrikes(1200, 1100, 1100, 120)).toBe(false);
  });
});

describe('input buffer and the mist cancel', () => {
  const B = T.hero.bufferMs, S = T.slash;
  it('a press up to bufferMs before the hero can act fires as soon as he can, not one earlier', () => {
    expect(buffered(1000, 1000 - B, 0, B)).toBe(true);
    expect(buffered(1000, 999 - B, 0, B)).toBe(false);
    expect(buffered(1300, 1000, 1200, B)).toBe(true); // pressed mid-dash (it ends at 1200): kept bufferMs past its end
    expect(buffered(1200 + B + 1, 1000, 1200, B)).toBe(false);
  });

  it('the mist never cuts a blow\'s committed frames, then cuts its recovery at once', () => {
    const at = 1000, commit = at + S.commitMs; // a claw at 1000; its recovery runs to at + cooldownMs
    expect(dashFree(at + 10, 0, commit)).toBe(false);
    expect(dashFree(commit, 0, commit)).toBe(true);
    expect(commit).toBeLessThan(at + S.cooldownMs);
    expect(dashFree(commit, commit + 1, commit)).toBe(false); // the mist itself not back yet
  });

  it('a mist pressed during the committed frames fires the frame they end (the buffer outlasts them)', () => {
    const at = 1000, pressed = at + 10, commit = at + Math.max(S.commitMs, S.finisherCommitMs, T.shot.commitMs, T.glyph.commitMs);
    let fired = -1;
    for (let t = at; t < at + 400 && fired < 0; t += 1) if (buffered(t, pressed, 0, T.hero.bufferMs) && dashFree(t, 0, commit)) fired = t;
    expect(fired).toBe(commit);
  });
});

describe('poiseHit', () => {
  const P = T.poise, p0 = { taken: 0, lastAt: -1e9, steadyUntil: 0 };
  it('claws wear a foe down to its poise, then it breaks and starts afresh', () => {
    expect(poiseHit(p0, 0, P.claw, P.of.ghoul, P.regenMs)).toEqual({ taken: 0, breaks: true });
    const one = poiseHit(p0, 0, P.claw, P.of.inquisitor, P.regenMs);
    expect(one).toEqual({ taken: 1, breaks: false });
    expect(poiseHit({ ...p0, taken: one.taken, lastAt: 0 }, 200, P.finisher, P.of.inquisitor, P.regenMs).breaks).toBe(true); // claw + finisher
  });

  it('the finisher and the dash strike weigh more than a claw', () => {
    expect(P.finisher).toBeGreaterThan(P.dash);
    expect(P.dash).toBeGreaterThan(P.claw);
    expect(poiseHit(p0, 0, P.finisher, P.of.purifier, P.regenMs).breaks).toBe(true);
    expect(poiseHit(p0, 0, P.claw, P.of.purifier, P.regenMs).breaks).toBe(false);
  });

  it('what it took drains away regenMs after its last blow; just staggered, it takes nothing', () => {
    expect(poiseHit({ taken: 1, lastAt: 0, steadyUntil: 0 }, P.regenMs, P.claw, P.of.hound, P.regenMs)).toEqual({ taken: 1, breaks: false });
    expect(poiseHit({ taken: 1, lastAt: 0, steadyUntil: 0 }, P.regenMs - 1, P.claw, P.of.hound, P.regenMs).breaks).toBe(true);
    expect(poiseHit({ taken: 0, lastAt: 0, steadyUntil: 500 }, 100, P.finisher, P.of.ghoul, P.regenMs)).toEqual({ taken: 0, breaks: false });
  });

  it('the heavy ones never break', () => {
    expect(P.of.amas).toBeUndefined();
    expect(poiseHit(p0, 0, 99, Infinity, P.regenMs).breaks).toBe(false);
  });
});

describe('wound', () => {
  it('a human brought down to weakAt kneels; a ghoul or a human already weak does not', () => {
    expect(wound(2, 1, true, 1, false)).toEqual({ hp: 1, kneels: true });
    expect(wound(2, 0.5, true, 1, false)).toEqual({ hp: 1.5, kneels: false });
    expect(wound(2, 1, false, 1, false)).toEqual({ hp: 1, kneels: false });
    expect(wound(1, 1, true, 1, false)).toEqual({ hp: 0, kneels: false }); // after the kneel: killable
  });

  it('with the bite locked, a human is wounded like a ghoul (human false): weakened, it dies, never kneels', () => {
    expect(wound(2, 1, false, 1, false)).toEqual({ hp: 1, kneels: false });
    expect(wound(1, 1, false, 1, false)).toEqual({ hp: 0, kneels: false });
  });

  it('kneeling, no blow takes hp away; overkill from above still kills', () => {
    expect(wound(1, 2, true, 1, true)).toEqual({ hp: 1, kneels: false });
    expect(wound(2, 2, true, 1, false)).toEqual({ hp: 1, kneels: true }); // a heavy blow on a fresh human: he kneels
    expect(wound(2, 2, false, 1, false)).toEqual({ hp: 0, kneels: false }); // a ghoul just dies
  });
});

describe('expedition', () => {
  it('a foe sees the hero and hunts him; it gives up once it has not seen him for a while', () => {
    const G = 4000;
    let s = { alert: false, seenAt: -1e9 };
    expect((s = alertness(s, false, 1000, G))).toEqual({ alert: false, seenAt: -1e9 }); // idle, nothing seen
    expect((s = alertness(s, true, 2000, G))).toEqual({ alert: true, seenAt: 2000 });
    expect((s = alertness(s, false, 5999, G)).alert).toBe(true); // lost him 3.999 s ago: still hunting
    expect(alertness(s, true, 5999, G)).toEqual({ alert: true, seenAt: 5999 }); // seen again: the clock starts over
    expect((s = alertness(s, false, 6000, G)).alert).toBe(false); // 4 s without seeing him: gives up
    expect(alertness(s, false, 9000, G).alert).toBe(false); // and stays idle until it sees him again
  });

  it('the shade hides him: a foe on the watch notices him nearer out of the light; hunting, it keeps him in sight as far', () => {
    const S = T.sight;
    expect(sightRange(S, false, false)).toBeLessThan(sightRange(S, false, true) * 0.7); // in the shade (docs/extraction.md §12.3)
    expect(sightRange(S, false, true)).toBe(S.range); // in the light: as before
    expect(sightRange(S, false, false)).toBeGreaterThan(T.lantern.radius); // not blind: he cannot walk up to them unseen
    expect([sightRange(S, true, false), sightRange(S, true, true)]).toEqual([S.keep, S.keep]);
  });

  it('the predator: behind a foe on the watch he walks up into the claws\' reach; seeing him, it takes a beat to know him', () => {
    const S = T.sight, o = { x: 0, y: 0 };
    expect(behind(o, 0, { x: -10, y: 2 })).toBe(true); // it looks right, he is on its left
    expect(behind(o, 0, { x: 10, y: -30 })).toBe(false);
    expect(sightRange(S, false, true, true)).toBe(S.back);
    expect(S.back * (1 + T.blood.weight.notice)).toBeLessThan(T.slash.range); // even dripping a full bag, the claws reach first
    expect(sightRange(S, true, true, true)).toBe(S.keep); // hunting: all round
    let n = notice(0, true, 1000, S.noticeMs);
    expect(n).toEqual({ spotAt: 1000, knows: false }); // it turns to him
    expect(notice(n.spotAt, true, 1000 + S.noticeMs - 1, S.noticeMs).knows).toBe(false); // still unaware: a predator strike
    expect(notice(n.spotAt, true, 1000 + S.noticeMs, S.noticeMs).knows).toBe(true);
    n = notice(n.spotAt, false, 1200, S.noticeMs);
    expect(n).toEqual({ spotAt: 0, knows: false }); // lost him in the beat: it forgets
    // From the shade's edge, a mist and a claw land within the beat (the dash strike: the press waits out the mist).
    const dash = (T.dash.speed * T.dash.durationMs) / 1000;
    expect(S.shade - dash).toBeLessThanOrEqual(T.slash.range + 8);
    expect(T.dash.durationMs + 1000 / 60).toBeLessThan(S.noticeMs);
  });

  it('a predator strike: an unaware foe but the immune; it kills the common foes outright', () => {
    const P = T.predator;
    expect(predatory('ghoul', false, P.immune)).toBe(true);
    expect(predatory('ghoul', true, P.immune)).toBe(false); // hunting him: a plain blow
    expect(predatory('matrice', false, P.immune) || predatory('crows', false, P.immune) || predatory('enterre', false, P.immune)).toBe(false);
    for (const k of ['ghoul', 'crossbow', 'purifier', 'priest', 'hound', 'penitent', 'ringer', 'crocheteur'] as const)
      expect(k === 'ghoul' ? T.enemy.hp : T[k].hp).toBeLessThanOrEqual(P.damage);
    for (const k of ['amas', 'bourreau', 'gave'] as const) expect(T[k].hp).toBeGreaterThan(P.damage); // the heavy: a big chunk
  });

  it('the parry: its window, the blows it turns aside, from in front only', () => {
    const P = T.parry;
    expect(parries(1000, 1000, 'ghoul', 0, P)).toBe(true);
    expect(parries(1000 + P.windowMs - 1, 1000, 'penitent', 1, P)).toBe(true);
    expect(parries(1000 + P.windowMs, 1000, 'ghoul', 0, P)).toBe(false); // too late
    expect(parries(999, 1000, 'ghoul', 0, P)).toBe(false); // before he raised it
    expect(parries(1000, 1000, 'ghoul', Math.PI * 0.9, P)).toBe(false); // from behind
    for (const k of ['crossbow', 'purifier', 'priest', 'ringer', 'amas', 'bourreau', 'matrice', 'gave', 'crocheteur']) expect(parries(1000, 1000, k, 0, P)).toBe(false);
    expect(P.windowMs).toBeGreaterThanOrEqual(150); // ~150-200 ms
    expect(P.windowMs).toBeLessThanOrEqual(200);
    expect(P.recoverMs).toBeGreaterThan(P.windowMs); // a miss is punished
    expect(P.riposte).toBeGreaterThanOrEqual(T.enemy.hp); // a riposte kills a ghoul
  });

  it('the charge: held past its start it rears back, full after its time; heavier than the finisher', () => {
    const C = T.charge;
    expect(charging(0, 5000, C.startMs)).toBe(false); // not held
    expect(charging(1000, 1000 + C.startMs - 1, C.startMs)).toBe(false); // a tap: a plain claw
    expect(charging(1000, 1000 + C.startMs, C.startMs)).toBe(true);
    expect(chargeOf(2000, 2000 + C.fullMs / 2, C.fullMs)).toBe(0.5);
    expect(chargeOf(2000, 2000 + C.fullMs * 3, C.fullMs)).toBe(1);
    expect(C.damage[1]).toBeGreaterThan(T.slash.damage * T.slash.finisherMult);
    expect(C.poise[1]).toBeGreaterThan(T.poise.finisher);
    expect(C.range).toBeGreaterThan(T.slash.finisherRange);
    expect(C.commitMs).toBeLessThan(C.strikeMs); // the mist may cut it short after its committed frames
  });

  it('carries blood up to the bag, leaving the rest behind', () => {
    expect(carry(0, 12, 400)).toEqual({ carried: 12, left: 0 });
    expect(carry(395, 12, 400)).toEqual({ carried: 400, left: 7 });
    expect(carry(400, 12, 400)).toEqual({ carried: 400, left: 12 });
  });

  it('the blood carried weighs: slower, the mist slower back, noticed farther, smoothly up to the full bag', () => {
    const W = T.blood.weight, bag = T.blood.bag, b = (c: number, size: number = bag, scent = 0) => burden(c, size, scent, W);
    expect(b(0)).toEqual({ fill: 0, walk: 1, mist: 1, notice: 1 }); // empty: nothing
    expect(b(bag)).toEqual({ fill: 1, walk: 1 - W.walk, mist: 1 + W.mist, notice: 1 + W.notice }); // full: the most
    expect(b(bag * 2)).toEqual(b(bag)); // never past full
    const steps = [0.25, 0.5, 0.75, 1].map((f) => b(bag * f));
    for (let i = 1; i < steps.length; i++) { // the heavier the bag, the worse, and more so near full (the curve's power)
      expect(steps[i].walk).toBeLessThan(steps[i - 1].walk);
      expect(steps[i - 1].walk - steps[i].walk).toBeGreaterThan(i > 1 ? steps[i - 2].walk - steps[i - 1].walk : 0);
    }
    expect(steps[1].walk).toBeGreaterThan(0.9); // half full: under a tenth slower
    expect(T.hero.speed * b(bag).walk).toBeGreaterThan(T.enemy.speed); // full, he still outwalks a ghoul
    // A bigger bag (le Rongé's, an Outre de peau) weighs less for the same blood; a Flacon scellé drips less.
    const outre = numbers('outre', 2).purse, flacon = numbers('flacon', 2).scent;
    expect(b(bag, bag + T.ronge.bag.size).walk).toBeGreaterThan(b(bag).walk);
    expect(b(bag, bag + outre).notice).toBeLessThan(b(bag).notice);
    expect(b(bag, bag, flacon).notice - 1).toBeCloseTo(W.notice / (1 + flacon));
    expect(b(bag, bag, flacon).walk).toBe(b(bag).walk); // (it does not lighten the bag)
    // Full, still nearer in the shade (a Linceul noir too) than in the light empty.
    expect(T.sight.shade * b(bag).notice).toBeLessThan(T.sight.range);
  });

  it("the blood's scent calls a pack of the battue at each threshold crossed", () => {
    expect([scent(0, 49, 50), scent(49, 50, 50), scent(40, 160, 50), scent(100, 120, 50)]).toEqual([0, 1, 3, 0]);
  });

  it('pays more blood the deeper the ring: x1, x3, x8, x20', () => {
    expect(T.blood.ring.slice(1)).toEqual([1, 3, 8, 20]);
    const ghoul = T.blood.drops.ghoul;
    expect([1, 2, 3, 4].map((r) => ghoul * T.blood.ring[r])).toEqual([1, 3, 8, 20].map((k) => ghoul * k));
    for (const k of Object.values(T.blood.drops)) expect(k).toBeGreaterThan(0);
  });

  it('places the groups of a ring from its pool, away from where the hero comes in, apart from each other', () => {
    const stairs = { x: Crypt.STAIRS.x, y: Crypt.FY1 }, E = T.expedition;
    for (const ring of [1, 2, 3, 4]) {
      const pool = E.pools[ring] as readonly (readonly string[])[];
      for (let i = 0; i < 50; i++) {
        const groups = placeGroups(pool, E.groups[ring], Crypt.SPAWNS, stairs, E.clear, E.gap, Math.random);
        expect(groups.length).toBe(E.groups[ring]);
        for (const g of groups) {
          expect(pool).toContain(g.kinds);
          expect(Math.hypot(g.at.x - stairs.x, g.at.y - stairs.y)).toBeGreaterThanOrEqual(E.clear);
          for (const o of groups) if (o !== g) expect(Math.hypot(g.at.x - o.at.x, g.at.y - o.at.y)).toBeGreaterThanOrEqual(E.gap);
        }
      }
    }
    expect(E.pools[1].flat().every((k) => k === 'ghoul' || k === 'crossbow')).toBe(true); // gentle first
  });

  it('places fewer groups when the room has few points clear of the hero', () => {
    const near = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 500, y: 0 }];
    expect(placeGroups([['a']], 3, near, { x: 0, y: 0 }, 100, 50, Math.random)).toEqual([{ at: { x: 500, y: 0 }, kinds: ['a'] }]);
  });
});

describe('stepsFrom', () => {
  // 4x3, a wall down the second column but for its bottom cell: the way round goes under it.
  const open = [true, false, true, true, true, false, true, true, true, true, true, true];

  it('counts the steps round closed cells, never cutting their corners', () => {
    const d = stepsFrom(open, 4, 0);
    expect(d[9]).toBe(3); // down, down, right: not diagonally past the wall's foot
    expect(d[2]).toBe(6); // then right, up, up
  });

  it('Infinity where no way leads', () => {
    expect(stepsFrom([true, false, true], 3, 0)[2]).toBe(Infinity);
  });
});

describe('viewSize', () => {
  it('shows 480x270 on any 16:9 screen, and grows the other side to the screen', () => {
    expect(viewSize(1920, 1080, 480, 270)).toEqual({ width: 480, height: 270 });
    expect(viewSize(915, 412, 480, 270)).toEqual({ width: 480, height: 216 }); // 20:9: as wide as a room
    expect(viewSize(412, 915, 480, 270)).toEqual({ width: 270, height: 600 }); // a window taller than wide
    expect(viewSize(1024, 768, 480, 270)).toEqual({ width: 480, height: 360 }); // 4:3
    expect(viewSize(2560, 1080, 480, 270)).toEqual({ width: 480, height: 203 }); // 21:9
  });
});

describe('edgePip', () => {
  it('pins a point off the screen to its edge, pointing its way', () => {
    expect(edgePip(100, 50, 480, 270, 6)).toBeUndefined();
    expect(edgePip(-40, 50, 480, 270, 6)).toEqual({ x: 6, y: 50, dx: -1, dy: 0 });
    expect(edgePip(600, 400, 480, 270, 6)).toEqual({ x: 474, y: 264, dx: 1, dy: 1 });
  });
});

describe('the HUD Chair: what it shows of a power, the heart, the pouch', () => {
  it('a brand scabs over when its power is spent, and opens back over its turn; a locked one shows nothing', () => {
    const t: Turn = { readyAt: 0, spentAt: 0 };
    turn(t, 0, 1000);
    expect(left(t, 1000)).toBe(0); // ready
    turn(t, 6000, 1000); // the glyph cast: back in 5 s
    expect([left(t, 1000), left(t, 3500), left(t, 6000)]).toEqual([1, 0.5, 0]);
    turn(t, 6000, 3500); // told again each frame: nothing changes
    expect(t.spentAt).toBe(1000);
    turn(t, 9000, 7000); // spent again once back
    expect([t.spentAt, left(t, 8000)]).toEqual([7000, 0.5]);
    turn(t, undefined, 8000);
    expect(left(t, 8000)).toBe(0);
  });

  it('picks the nearest frame of a share, clamped: the heart by life (41 frames), the pouch by the bag', () => {
    expect([38 / 50, 50 / 50, 0, 7 / 50, 1 / 50].map((k) => frameOf(k, 40))).toEqual([30, 40, 0, 6, 1]);
    expect([frameOf(126 / 400, 20), frameOf(500 / 400, 20), frameOf(-1, 20)]).toEqual([6, 20, 0]);
  });
});
