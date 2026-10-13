import { describe, expect, it } from 'vitest';
import { anchors, keyAt, pitchAlong, slideTo, startSlide, stickyKey, type LineKey } from './glide';

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
  // C D E, 100px each, centres at 50, 150, 250; the finger strikes C near its right edge, at 80.
  const at = (x: number) => keyAt(line, x);

  it('glides continuously while the finger keeps moving one way, through the keys it passes', () => {
    const s = startSlide(line[0], 80, 0);
    const r = [115, 150, 200, 250].map((x, i) => slideTo(line, s, x, 10 * (i + 1), at(x)));
    expect(r.map((x) => Math.round(x.pitch * 100) / 100)).toEqual([61, 62, 63, 64]); // 80→150 is C→D, then D→E
    expect(r.every((x) => x.ease === undefined)).toBe(true);
  });

  it('settles on the note of the key it was on when the finger reverses, and glides on from there', () => {
    const s = startSlide(line[0], 80, 0);
    slideTo(line, s, 170, 10, at(170)); // past D's centre: above D
    const back = slideTo(line, s, 160, 20, at(160)); // reversed on D: glide from D's note, starting at 170
    expect(back.ease).toBeGreaterThan(0);
    expect(back.pitch).toBeCloseTo(62 - 2 * (10 / 120), 5); // from D at 170 toward C's centre at 50
  });

  it('a pause then moving again also starts from the key’s note', () => {
    const s = startSlide(line[0], 80, 0);
    slideTo(line, s, 120, 10, at(120)); // on D, between C and D
    const after = slideTo(line, s, 130, 500, at(130));
    expect(after.ease).toBeGreaterThan(0);
    expect(after.pitch).toBeCloseTo(62 + 2 * (10 / 130), 5); // from D at 120 toward E's centre at 250
  });
});

describe('a resting finger', () => {
  const at = (x: number) => keyAt(line, x);
  it('wobbles smaller than the steadiness setting neither bend nor reverse the slide', () => {
    const s = startSlide(line[0], 80, 0);
    const go = slideTo(line, s, 150, 10, at(150), 8); // a real move: up to D
    const wobbles = [153, 147, 152, 149].map((x, i) => slideTo(line, s, x, 20 + i * 10, at(x), 8));
    expect(go.moved).toBe(true);
    expect(wobbles.every((w) => !w.moved && w.pitch === go.pitch)).toBe(true);
    expect(s.dir).toBe(1); // still moving right as far as the slide is concerned
  });

  it('stays on a key until the finger is clearly past its edge', () => {
    const k = (x: number) => ({ ...line[0], el: { className: 'spad' } as unknown as HTMLElement, x, left: x - 50, right: x + 50 });
    const c = k(50), d = k(150);
    expect(stickyKey(c, d, 102, 4)).toBe(c); // 2 px past C's edge: still C
    expect(stickyKey(c, d, 105, 4)).toBe(d); // 5 px past: D
    const black = { ...d, el: { className: 'bk in' } as unknown as HTMLElement };
    expect(stickyKey(c, black, 101, 4)).toBe(black); // onto a black key: at once
  });
});
