import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULTS, clashes, label, lookup, name, once, parse, rebind, serialize, slotLabel } from './keys.ts';

describe('bindings', () => {
  it('defaults: every action, no clash, ZQSD and WASD and the arrows to move', () => {
    expect(ACTIONS.map((a) => a.id).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(clashes(DEFAULTS).size).toBe(0);
    expect(lookup(DEFAULTS, 'q')).toEqual([{ action: 'move', slot: 0, index: 1 }]); // AZERTY's left
    expect(lookup(DEFAULTS, 'a')).toEqual([{ action: 'move', slot: 1, index: 1 }]); // QWERTY's left
    expect(lookup(DEFAULTS, 'd').map((h) => h.slot)).toEqual([0, 1]); // one action: no clash
    expect(lookup(DEFAULTS, 'x')[0].action).toBe('parry');
    expect(lookup(DEFAULTS, 'Mouse1')[0].action).toBe('parry');
    expect(slotLabel(DEFAULTS.move[0])).toBe('Z Q S D');
    expect(slotLabel(DEFAULTS.move[2])).toBe('Flèches');
    expect(label('Space')).toBe('Espace');
  });
  it('names a key by what it types, whatever the case; Space and dead keys by name and place', () => {
    expect(name({ key: 'M', code: 'Semicolon' })).toBe('m'); // AZERTY's M, Shift held
    expect(name({ key: ' ', code: 'Space' })).toBe('Space');
    expect(name({ key: 'Dead', code: 'BracketLeft' })).toBe('BracketLeft');
    expect(name({ key: 'Shift', code: 'ShiftLeft' })).toBe('Shift');
  });
  it('rebinds a slot; a clash is kept and told; Échap and the pause stay', () => {
    const b = rebind(DEFAULTS, 'map', 0, ['m']);
    expect(b.map[0]).toEqual(['m']);
    expect(DEFAULTS.map[0]).toEqual(['c']); // a copy
    expect(clashes(b).get('m')).toEqual(['map', 'mute']);
    expect(lookup(b, 'm').map((h) => h.action)).toEqual(['map', 'mute']);
    expect(rebind(DEFAULTS, 'bite', 1, ['g']).bite).toEqual([['f'], ['g']]);
    expect(rebind(DEFAULTS, 'bite', 0, []).bite[0]).toEqual([]); // cleared
    expect(rebind(DEFAULTS, 'bite', 0, ['Escape']).bite[0]).toEqual(['f']);
    expect(rebind(DEFAULTS, 'pause', 0, ['p']).pause[0]).toEqual(['Escape']);
    expect(rebind(DEFAULTS, 'pause', 1, ['Backspace']).pause[1]).toEqual(['Backspace']);
    expect(rebind(DEFAULTS, 'move', 0, ['i', 'j', 'k', 'l']).move[0]).toEqual(['i', 'j', 'k', 'l']);
    expect(rebind(DEFAULTS, 'move', 0, ['i']).move[0]).toEqual(['z', 'q', 's', 'd']); // a move slot takes four
  });
  it('persists: read back as saved; broken or partial, the defaults', () => {
    const b = rebind(rebind(DEFAULTS, 'dash', 1, ['Control']), 'move', 1, []);
    expect(parse(serialize(b))).toEqual(b);
    expect(parse(null)).toEqual(DEFAULTS);
    expect(parse('{oops')).toEqual(DEFAULTS);
    const odd = JSON.parse(serialize(b));
    odd.binds.claw = [['j', 'u'], ['Mouse0']]; // two keys in a slot
    odd.binds.pause = [['p'], ['Escape']];
    delete odd.binds.map;
    const back = parse(JSON.stringify(odd));
    expect(back.claw).toEqual(DEFAULTS.claw);
    expect(back.pause).toEqual(DEFAULTS.pause);
    expect(back.map).toEqual(DEFAULTS.map);
    expect(back.dash).toEqual([['Space'], ['Control']]);
  });
});

describe('once', () => {
  it("a key event handed again (Phaser's frame queue, run anew on each new event) is acted on once", () => {
    const got: string[] = [], f = once((ev: { key: string }) => got.push(ev.key));
    const up = { key: 'ArrowLeft' }, down = { key: 'f' }, fup = { key: 'f' };
    for (const queue of [[up], [up, down], [up, down, fup]]) for (const ev of queue) f(ev); // as KeyboardPlugin.update does
    expect(got).toEqual(['ArrowLeft', 'f', 'f']); // each event once; a second press of the same key is its own
  });
});
