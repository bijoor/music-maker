import { describe, expect, it } from 'vitest';
import { anchors, keyAt, pitchAlong, type LineKey } from './glide';

// Three scale pads 100px wide: C, D, E.
const el = (n: string) => ({ n, contains: () => false }) as unknown as HTMLElement;
const [c, d, e] = [el('c'), el('d'), el('e')];
const line: LineKey[] = [
  { el: c, x: 50, left: 0, right: 100, pitch: 60 },
  { el: d, x: 150, left: 100, right: 200, pitch: 62 },
  { el: e, x: 250, left: 200, right: 300, pitch: 64 },
];

describe('gliding along the keys', () => {
  it('starts exactly on the struck key wherever it was struck, then moves evenly to the next key’s centre', () => {
    const a = anchors(line, c, 90); // struck near C's right edge
    expect(pitchAlong(a, 90)).toBe(60);
    expect(pitchAlong(a, 120)).toBe(61);
    expect(pitchAlong(a, 150)).toBe(62);
    expect(pitchAlong(a, 200)).toBe(63);
  });
  it('continues past the ends at the last interval', () => {
    expect(pitchAlong(line, 0)).toBe(59);
    expect(pitchAlong(line, 300)).toBe(65);
  });
  it('finds the key under the finger by its edges, not the nearest centre', () => {
    expect(keyAt(line, 105).pitch).toBe(62); // just inside D
    expect(keyAt(line, 199).pitch).toBe(62);
    expect(keyAt(line, 350).pitch).toBe(64);
    expect(keyAt(line, 105, e).pitch).toBe(64); // the element under the finger wins (a black key over a white)
  });
});
