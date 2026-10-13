import { describe, expect, it } from 'vitest';
import { anchors, keyAt, pitchAlong, slideTo, startSlide, type LineKey } from './glide';

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

describe('a slide that lands on notes', () => {
  // C D E, 100px each; the finger strikes C near its right edge, at 80.
  const at = (x: number) => keyAt(line, x);
  const run = (moves: [number, number][]) => {
    const s = startSlide(line[0], 80, 0);
    return moves.map(([x, t]) => slideTo(line, s, x, t, at(x)));
  };

  it('bends from the struck point and reaches the next key’s note at its edge', () => {
    const [a, b] = run([[90, 10], [99, 20]]);
    expect(a.pitch).toBeCloseTo(61, 5); // halfway from 80 to C's edge at 100: halfway from C to D
    expect(b.pitch).toBeCloseTo(61.9, 5);
  });

  it('goes to a key’s own note on entering it, however far in the finger goes', () => {
    const r = run([[110, 10], [160, 20], [195, 30]]);
    r.forEach((x) => expect(x.pitch).toBe(62));
    expect(r[0].ease).toBeGreaterThan(0);
  });

  it('steps from note to note across keys in one movement', () => {
    expect(run([[130, 10], [230, 20], [280, 30]]).map((x) => x.pitch)).toEqual([62, 64, 64]);
  });

  it('starts a new bend after reversing direction or pausing', () => {
    const s = startSlide(line[0], 80, 0);
    slideTo(line, s, 150, 10, at(150)); // into D: 62
    const back = slideTo(line, s, 140, 20, at(140)); // reversed: a new bend from 150 toward C, which it reaches at D's left edge (100)
    expect(back.pitch).toBeCloseTo(62 - 2 * (10 / 50), 5);
    const after = slideTo(line, s, 160, 400, at(160)); // after a pause, moving right: a new bend from 140 toward E (edge at 200)
    expect(after.pitch).toBeGreaterThan(back.pitch);
    expect(after.pitch).toBeLessThan(64);
  });
});
