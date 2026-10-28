import { describe, expect, it } from 'vitest';
import { T } from './tuning.ts';
import { lifeInHp, parse, VERSION, type Entry } from './save.ts';
import { blow } from './fauna.ts';

// Life went from 5 drops to 50 HP (docs/decisions.md 2026-10-28): every blow, heal and max-life step x10, but those
// adjusted on purpose (listed with their old value, in drops).
const ADJUSTED: Record<string, number> = { 'crows.damage': 0.5, 'gave.poolDamage': 0.5, 'gave.grow.damage': 0.5 };
const OLD: [string, number][] = [
  ['hero.maxHealth', 5], ['bite.heal', 1], ['enemy.damage', 1], ['crossbow.damage', 1], ['purifier.damage', 2], ['priest.damage', 1],
  ['hound.damage', 1], ['penitent.damage', 1], ['ringer.damage', 1], ['inquisitor.damage', 2], ['amas.damage', 2],
  ['bourreau.damage', 3], ['bourreau.ripDamage', 2], ['nourrice.dropDamage', 2], ['nourrice.rakeDamage', 1], ['nourrice.hurlDamage', 1],
  ['matrice.damage', 2], ['crows.damage', 1], ['enterre.damage', 1], ['gave.slamDamage', 2], ['gave.bileDamage', 1], ['gave.poolDamage', 1],
  ['gave.grow.damage', 0.5], ['lantern.damage', 1], ['dawn.damage', 1], ['ronge.life.hp', 1], ['items.leechHeal', 1],
  ['pacts.maigre.maxBlood', 2], ['pacts.curee.heal', 1], ['pacts.curee.bite', 1], ['pacts.vermine.toll', 1],
];
const at = (path: string) => path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)[k], T) as number;

describe('life in HP', () => {
  it('every blow, heal and max-life step is the old drops x10, but the few adjusted', () => {
    for (const [path, drops] of OLD) expect([path, at(path)]).toEqual([path, (ADJUSTED[path] ?? drops) * 10]);
    expect(T.items.defs.chapelet.life).toEqual([10, 10, 20]);
    for (const id of ['morsure', 'survivant'] as const) expect(T.gifts[id]).toEqual([10, 20, 30]);
  });

  it('a fed Gavé hits 5 HP harder a body eaten', () => {
    expect([0, 1, 2, 3].map((fed) => blow(T.gave.slamDamage, fed))).toEqual([20, 25, 30, 35]);
  });

  it('an older save keeps its ranks of max life (each now 10 HP); its log is brought to HP', () => {
    const s = parse('{"v":5,"banked":12,"unlocks":{"bite":true,"life":3,"bag":1}}');
    expect([s.v, s.unlocks]).toEqual([VERSION, { bite: true, life: 3, bag: 1 }]);
    expect(T.hero.maxHealth + s.unlocks.life * T.ronge.life.hp).toBe(80);
    const log: Entry[] = [{ end: 'retour', deepest: 2, blood: 40, life: 3, s: 90, loosed: 1, met: 0, at: 'x' }, { end: 'mort', deepest: 3, blood: 0, life: 0, s: 60, loosed: 0, met: 0, at: 'y' }];
    expect(lifeInHp(log).map((e) => e.life)).toEqual([30, 0]);
  });
});
