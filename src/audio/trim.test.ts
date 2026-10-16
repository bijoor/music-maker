import { describe, expect, it } from 'vitest';
import { leadIn } from './trim';

const RATE = 48000;
const sound = (silentMs: number, ms = 100) => {
  const a = new Float32Array(Math.round(((silentMs + ms) * RATE) / 1000));
  for (let i = Math.round((silentMs * RATE) / 1000); i < a.length; i++) a[i] = Math.sin(i / 5) * 0.8;
  return a;
};

describe('lead-in trimming', () => {
  it('cuts the silence before a sound, keeping a millisecond', () => {
    expect(leadIn([sound(25)], RATE)).toBeCloseTo(24 * 48, -1);
  });
  it('leaves sounds that start at once alone', () => {
    expect(leadIn([sound(0)], RATE)).toBe(0);
    expect(leadIn([sound(1.5)], RATE)).toBe(0);
  });
  it('goes by the earliest channel', () => {
    expect(leadIn([sound(30), sound(10)], RATE)).toBeCloseTo(9 * 48, -1);
  });
  it('ignores silence', () => {
    expect(leadIn([new Float32Array(1000)], RATE)).toBe(0);
  });
});
