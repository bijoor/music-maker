import { describe, expect, it } from 'vitest';
import { pitchAlong, type LineKey } from './glide';

// Three keys 100px apart: C, D, E (a tone, then a tone), as centres along the row.
const el = {} as HTMLElement;
const line: LineKey[] = [{ el, x: 50, pitch: 60 }, { el, x: 150, pitch: 62 }, { el, x: 250, pitch: 64 }];

describe('gliding along the keys', () => {
  it('reaches each key’s pitch at its centre and moves evenly in between', () => {
    expect(pitchAlong(line, 50).pitch).toBe(60);
    expect(pitchAlong(line, 100).pitch).toBe(61);
    expect(pitchAlong(line, 150).pitch).toBe(62);
    expect(pitchAlong(line, 225).pitch).toBe(63.5);
  });
  it('continues past the ends at the last interval', () => {
    expect(pitchAlong(line, 0).pitch).toBe(59);
    expect(pitchAlong(line, 300).pitch).toBe(65);
  });
  it('reports the nearest key', () => {
    expect(pitchAlong(line, 190).nearest.pitch).toBe(62);
    expect(pitchAlong(line, 210).nearest.pitch).toBe(64);
  });
});
