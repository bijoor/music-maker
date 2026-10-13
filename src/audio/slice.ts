// Cutting a recording of separate strokes (or notes) into one sample per stroke.

export interface Cut {
  /** First and last sample (exclusive) of the stroke in the recording. */
  start: number;
  end: number;
}

const FRAME = 256;

/** Loudness per frame of FRAME samples (RMS). */
function envelope(x: Float32Array): number[] {
  const env: number[] = [];
  for (let i = 0; i < x.length; i += FRAME) {
    let s = 0;
    const n = Math.min(FRAME, x.length - i);
    for (let j = 0; j < n; j++) s += x[i + j] * x[i + j];
    env.push(Math.sqrt(s / n));
  }
  return env;
}

/**
 * Find the strokes in a recording: each starts where the level jumps well above the background (a little before,
 * so the attack is kept) and ends when it falls back near the background, when the next stroke starts, or after
 * `maxSeconds`. A stroke played before the last one has died away still counts when it jumps clearly above it.
 * Strokes shorter than 30 ms or much quieter than the loudest are ignored (taps, noise).
 */
export function findStrokes(x: Float32Array, sampleRate: number, maxSeconds = 4): Cut[] {
  const env = envelope(x);
  if (!env.length) return [];
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const peak = sorted[sorted.length - 1];
  if (peak <= 0) return [];
  const on = Math.max(peak * 0.08, floor * 6);
  const off = Math.max(peak * 0.012, floor * 2);
  const frames = (s: number) => Math.max(1, Math.round((s * sampleRate) / FRAME));
  const quietFor = frames(0.05), minLen = frames(0.03), maxLen = frames(maxSeconds), lookback = frames(0.03);
  const starts: number[] = [];
  let active = false, quiet = 0;
  for (let i = 0; i < env.length; i++) {
    const recentMin = Math.min(...env.slice(Math.max(0, i - lookback), i + 1));
    if (!active) {
      if (env[i] > on) { active = true; quiet = 0; starts.push(i); }
    } else {
      // A new stroke on top of a ringing one: a sharp jump above the recent low.
      if (env[i] > on && env[i] > recentMin * 1.8 && i - starts[starts.length - 1] >= frames(0.06)) starts.push(i);
      quiet = env[i] < off ? quiet + 1 : 0;
      if (quiet >= quietFor) active = false;
    }
  }
  const cuts: Cut[] = [];
  starts.forEach((s, k) => {
    // Back up to where the attack begins.
    let a = s;
    while (a > 0 && s - a < frames(0.02) && env[a - 1] < env[a] && env[a - 1] > off * 0.5) a--;
    const next = starts[k + 1] ?? env.length;
    let e = s;
    let q = 0;
    while (e < next && e - s < maxLen) { q = env[e] < off ? q + 1 : 0; if (q >= quietFor) break; e++; }
    if (e - a < minLen) return;
    const loud = Math.max(...env.slice(s, e));
    if (loud < peak * 0.12) return;
    cuts.push({ start: Math.max(0, a * FRAME - Math.round(0.002 * sampleRate)), end: Math.min(x.length, e * FRAME) });
  });
  return cuts;
}

/**
 * One stroke as its own sample: cut out, levelled so its peak sits just under full scale (the pads' velocity sets
 * how loud it plays), with a short fade-in and a fade-out so it starts and ends without a click.
 */
export function extract(x: Float32Array, cut: Cut, sampleRate: number): Float32Array {
  const y = x.slice(cut.start, cut.end);
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const fadeIn = Math.min(y.length, Math.round(0.002 * sampleRate)), fadeOut = Math.min(y.length, Math.round(0.03 * sampleRate));
  for (let i = 0; i < y.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    if (i >= y.length - fadeOut) g *= (y.length - i) / fadeOut;
    y[i] *= g;
  }
  return y;
}
