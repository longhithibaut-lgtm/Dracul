import { describe, expect, it } from 'vitest';
import { T } from './tuning.ts';
import { choose, edge, edgeLength, fightStarts, floor, nearestEdge, phaseOf, raked, shed, struck } from './boss.ts';
import { ARENA, GATES, OPENS, RELIQUARY } from './catacombs.data.ts';
import { gateOpen } from './world.ts';
import { parse } from './save.ts';
import { POWERS, LINES, NUEE, buy, price, swarm, wear, worn } from './powers.ts';
import { GIFTS } from './gifts.ts';
import { missing } from './font.ts';

describe('La Nourrice', () => {
  const N = T.nourrice, sq = T.lantern.squash;

  it('turns to her second phase at half her blood', () => {
    expect([N.hp, N.hp / 2 + 1, N.hp / 2, 1].map((hp) => phaseOf(hp))).toEqual([1, 1, 2, 2]);
  });

  it('is fought by walking into the arena, while she lives; its grille shuts while the fight is on', () => {
    const s = parse(null), mid = { x: (ARENA[0] + ARENA[2]) / 2, y: (ARENA[1] + ARENA[3]) / 2 };
    expect(fightStarts(s, mid, ARENA)).toBe(true);
    expect(fightStarts(s, { x: mid.x, y: ARENA[3] - 10 }, ARENA)).toBe(false); // still at its grille
    expect(fightStarts(s, { x: mid.x, y: ARENA[3] + 40 }, ARENA)).toBe(false); // outside
    s.nourrice.dead = true;
    expect(fightStarts(s, mid, ARENA)).toBe(false);
    const g = GATES.find((g) => g.arena)!;
    expect([gateOpen(g, []), gateOpen(g, [], true), gateOpen(GATES.find((g) => !g.arena)!, [], false)]).toEqual([true, false, false]);
    expect(RELIQUARY.at.y > ARENA[1] && RELIQUARY.at.y < ARENA[3] && OPENS?.[0].id === 'reliquary').toBe(true);
  });

  it('strikes within her reach on the floor, the ground foreshortening undone', () => {
    const at = { x: 0, y: 0 };
    expect(struck(at, { x: N.radius, y: 0 }, N.radius)).toBe(true);
    expect(struck(at, { x: 0, y: N.radius * sq + 1 }, N.radius)).toBe(false);
    expect(floor(at, { x: 3, y: 4 * sq })).toBeCloseTo(5);
  });

  it('rakes the ring before her, not under her body, nor behind her, nor beyond it', () => {
    const from = { x: 0, y: 0 }, aim = 0;
    expect(raked(from, aim, { x: 40, y: 0 })).toBe(true);
    expect(raked(from, aim, { x: 40, y: 20 * sq })).toBe(true); // within the arc
    expect(raked(from, aim, { x: N.rakeIn - 2, y: 0 })).toBe(false); // under her
    expect(raked(from, aim, { x: N.rakeOut + 2, y: 0 })).toBe(false); // beyond
    expect(raked(from, aim, { x: -40, y: 0 })).toBe(false); // behind
  });

  it('rakes him close, drops on him farther, stalks him beyond', () => {
    expect([choose(N.rakeRange - 1), choose(N.rakeRange + 1), choose(N.dropRange + 1)]).toEqual(['rake', 'drop', 'stalk']);
  });

  it('a hard blow shakes off one goule at a time, while few of hers are alive', () => {
    expect(shed([true, true, true], 0, N.hard)).toBe(0);
    expect(shed([false, true, true], 0, N.hard + 1)).toBe(1);
    expect(shed([true, true, true], 0, N.hard - 0.5)).toBe(-1); // a light one
    expect(shed([true, true, true], N.goules, N.hard)).toBe(-1); // her brood at its cap
    expect(shed([false, false, false], 0, 9)).toBe(-1); // none left on her
  });

  it('crawls the walls: up the west side, along the north wall, down the east side, each point the nearest', () => {
    const L = edgeLength(ARENA), a = edge(ARENA, 0), b = edge(ARENA, L / 2), c = edge(ARENA, L);
    expect([a.wall, b.wall, c.wall]).toEqual(['w', 'n', 'e']);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(b.y).toBeLessThan(a.y);
    for (const s of [0, L / 4, L / 2, (3 * L) / 4, L]) { const p = edge(ARENA, s), q = edge(ARENA, nearestEdge(ARENA, p)); expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1); }
    expect(edge(ARENA, nearestEdge(ARENA, { x: (ARENA[0] + ARENA[2]) / 2, y: ARENA[1] + 30 })).wall).toBe('n');
  });
});

describe('Vesna freed, and her powers', () => {
  it('is saved freed for good, the Nourrice dead and her attempts with it; an older save comes up without them', () => {
    const s = parse(null);
    Object.assign(s, { vesna: true, nourrice: { tries: 3, dead: true } });
    expect(parse(JSON.stringify(s))).toEqual(s);
    const old = parse('{"v":2,"banked":50,"shortcuts":["caveau"]}');
    expect([old.vesna, old.nourrice, old.powers, old.banked]).toEqual([false, { tries: 0, dead: false }, { bought: [], worn: {} }, 50]);
    expect(parse('{"v":3,"vesna":"yes","nourrice":{"tries":-2,"dead":1}}')).toMatchObject({ vesna: false, nourrice: { tries: 0, dead: false } });
  });

  it('sells the slot powers dearer with each one bought, la Nuée at its own price', () => {
    const s = parse('{"banked":100000}');
    const paid = POWERS.filter((p) => p !== 'swarm').map((p) => { const c = price(s, p); buy(s, p); return c; });
    expect(paid).toEqual([100, 150, 225, 338, 506, 759, 1139, 1709]);
    expect(price(s, 'swarm')).toBe(T.vesna.swarm);
    expect(swarm(s)).toBe(false);
    expect(buy(s, 'swarm')).toBe('sold');
    expect(swarm(s)).toBe(true);
    expect(buy(s, 'swarm')).toBe('owned');
  });

  it('buys from the bank (too little: nothing changes), wears one per slot, in place of the other, and keeps it all', () => {
    const s = parse('{"banked":260}');
    expect(buy(s, 'griffes')).toBe('sold'); // 100, worn at once in its empty slot
    expect(buy(s, 'grouillantes')).toBe('sold'); // 150: its slot taken, not worn
    expect([s.banked, worn(s)]).toEqual([10, ['griffes']]);
    expect(buy(s, 'jet')).toBe('poor');
    expect([s.banked, s.powers.bought]).toEqual([10, ['griffes', 'grouillantes']]);
    expect(wear(s, 'grouillantes')).toBe('worn');
    expect(worn(s)).toEqual(['grouillantes']);
    expect(wear(s, 'grouillantes')).toBe('off');
    expect(worn(s)).toEqual([]);
    expect(wear(s, 'jet')).toBe('locked'); // not bought
    expect(wear(s, 'griffes')).toBe('worn');
    expect(parse(JSON.stringify(s))).toEqual(s);
    // a damaged save: unknown powers dropped, a power worn only if bought and in its own slot
    expect(parse('{"powers":{"bought":["griffes","nope","griffes","nid"],"worn":{"griffes":"griffes","tir":"nid","glyphe":"pestilent"}}}').powers)
      .toEqual({ bought: ['griffes', 'nid'], worn: { griffes: 'griffes' } });
  });

  it('sells the slot gifts, two to a slot in slot order, and speaks in letters the font has', () => {
    expect(POWERS.slice(0, 8).map((p) => GIFTS[p as keyof typeof GIFTS].slot)).toEqual(['griffes', 'griffes', 'tir', 'tir', 'glyphe', 'glyphe', 'brume', 'brume']);
    for (const l of [...Object.values(LINES).flat(), NUEE.name, NUEE.text, 'VESNA LA GRISE', 'Porté Porter Apprise Remplace : Comme tu veux. Celle-là, tu l\'as déjà.', '1 à 9 ou clic : acheter, porter, ôter ; Échap ou F : partir',
      'Les nobles crachaient sur les rats, gamin. Les rats, eux, ont survécu.', 'Un sans-maison qui ouvre ma cage... Le monde tourne à l\'envers. Tant mieux.', 'Je rentre par mes chemins. Rapporte du sang au refuge : on fera affaire.',
      'La Nourrice est morte. Vesna est libre. Le reliquaire est vide. Vesna (F)']) expect(missing(l)).toEqual([]);
  });
});
