import { describe, expect, it } from 'vitest';
import { extract, findStrokes } from './slice';
import { decodeWav, encodeWav } from './wav';

const SR = 44100;

/** A recording: quiet noise with decaying drum-like hits at `times` (seconds), each `decay` seconds to fade. */
function recording(seconds: number, hits: { t: number; amp?: number; decay?: number; freq?: number }[], noise = 0.002) {
  const x = new Float32Array(Math.round(seconds * SR));
  let seed = 1;
  for (let i = 0; i < x.length; i++) { seed = (seed * 16807) % 2147483647; x[i] = (seed / 2147483647 - 0.5) * 2 * noise; }
  for (const { t, amp = 0.8, decay = 0.25, freq = 180 } of hits) {
    const s = Math.round(t * SR);
    for (let i = 0; s + i < x.length && i < decay * 4 * SR; i++) x[s + i] += amp * Math.exp(-i / (decay * SR)) * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return x;
}

describe('cutting a recording into strokes', () => {
  it('finds each separate stroke, starting just before its attack', () => {
    const cuts = findStrokes(recording(4, [{ t: 0.5 }, { t: 1.5 }, { t: 2.6, amp: 0.4 }]), SR);
    expect(cuts.length).toBe(3);
    cuts.forEach((c, i) => expect(Math.abs(c.start / SR - [0.5, 1.5, 2.6][i])).toBeLessThan(0.015));
    cuts.forEach((c) => expect((c.end - c.start) / SR).toBeGreaterThan(0.3)); // keeps the decay
  });

  it('counts a stroke played while the last one still rings', () => {
    const cuts = findStrokes(recording(3, [{ t: 0.5, decay: 0.8 }, { t: 0.9, decay: 0.3 }]), SR);
    expect(cuts.length).toBe(2);
    expect(cuts[0].end).toBeLessThanOrEqual(cuts[1].start + 0.01 * SR);
  });

  it('ignores background noise and very quiet taps', () => {
    expect(findStrokes(recording(2, []), SR)).toEqual([]);
    expect(findStrokes(recording(3, [{ t: 0.5 }, { t: 1.5, amp: 0.03 }]), SR).length).toBe(1);
  });

  it('levels each stroke and fades its ends', () => {
    const x = recording(2, [{ t: 0.5, amp: 0.3 }]);
    const [cut] = findStrokes(x, SR);
    const y = extract(x, cut, SR);
    expect(Math.max(...y.map(Math.abs))).toBeCloseTo(0.9, 1);
    expect(Math.abs(y[0])).toBeLessThan(0.01);
    expect(Math.abs(y[y.length - 1])).toBeLessThan(0.01);
  });

  it('round-trips a sample through a WAV file', async () => {
    const x = new Float32Array([0, 0.5, -0.5, 0.25]);
    const { samples, sampleRate } = await decodeWav(encodeWav(x, 48000));
    expect(sampleRate).toBe(48000);
    expect([...samples].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 0.25]);
  });
});
