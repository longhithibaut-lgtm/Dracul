import { describe, expect, it } from 'vitest';
import { after, BEATS, CRYPT, leaves, LINES, place, reform, type Beat, type Event } from './prologue.data.ts';
import * as Crypt from './crypt.data.ts';

// The prologue's script (prologue.data.ts): its beats follow one another only on the event each waits for, start to end,
// in the right places; a death sends him back to the crypt's sarcophagus; the ways out open when they should.
describe('prologue', () => {
  const PLAY: Event[] = ['captions', 'stake', 'ghoul', 'ghoulDead', 'out', 'guardDead', 'up', 'poured', 'coffins', 'lay'];

  it('plays through, beat by beat, on its events only', () => {
    let b: Beat = 'noir';
    const seen: Beat[] = [b];
    for (const e of PLAY) {
      for (const other of PLAY) if (other !== e) expect(after(b, other), `${other} in ${b}`).toBe(b); // nothing else moves it on
      seen.push((b = after(b, e)));
    }
    expect(seen).toEqual(BEATS);
    expect(after('fin', 'lay')).toBe('fin');
  });

  it('plays the crypt, then the necropolis, then the refuge', () => {
    expect(BEATS.map(place)).toEqual(['hall', 'hall', 'hall', 'hall', 'hall', 'necropolis', 'necropolis', 'refuge', 'refuge', 'refuge', 'refuge']);
  });

  it('re-forms him in the crypt after a death: the ghoul there while it lived, else the ray', () => {
    expect((['noir', 'pieu', 'rat', 'goule'] as Beat[]).map(reform)).toEqual(['rat', 'rat', 'rat', 'rat']);
    expect((['rai', 'necropole', 'poids'] as Beat[]).map(reform)).toEqual(['rai', 'rai', 'rai']);
    for (const b of BEATS) expect(place(reform(b))).toBe('hall');
  });

  it('lets him out of the crypt once the ghoul is dead, up to the refuge once he carries the blood, never down its stairs', () => {
    for (const b of BEATS) for (const exit of [-1, 0, 1, 2]) expect(leaves(b, exit), `${b} ${exit}`).toBe((b === 'rai' || b === 'poids') && exit === -1);
  });

  it('lays the crypt out on open floor, the ray thin enough for one mist', () => {
    const inBox = (p: { x: number; y: number }) => Crypt.BOXES.some(([x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h);
    for (const p of [CRYPT.rise, ...CRYPT.way, CRYPT.hide, CRYPT.ghoul, CRYPT.slit, CRYPT.beyond, CRYPT.stairs]) expect(inBox(p), `${p.x},${p.y}`).toBe(false);
    expect(inBox(CRYPT.lie)).toBe(true); // he lies in his sarcophagus
    expect(CRYPT.ray[1] - CRYPT.ray[0]).toBeLessThan(43 - 8); // the mist: 330 px/s for 130 ms
  });

  it('keeps its lines short', () => {
    for (const l of Object.values(LINES).flat()) expect(l.length).toBeLessThan(70);
  });
});
