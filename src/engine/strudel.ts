// Strudel engine wrapper: one scheduler, sample loading, direct triggering, and per-track clip launching
// that lands exactly on bar lines.
//
// Each track has its own timeline of segments. Launching a clip compiles its code first, then picks the first
// bar line the scheduler has not queried yet, so a switch can never land in the past however slow compilation
// is. The final pattern is a stack of the tracks; each track routes queries before a switch bar to the old clip
// and after it to the new one (switchAt).
import { evalScope, evaluate as evaluateCode, repl, Pattern, TimeSpan, silence, stack } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import { webaudioOutput } from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { getAudioContext, initAudio, registerSynthSounds, samples, superdough, soundMap } from 'superdough';

export type Location = { start: number; end: number };
export type HapEvent = {
  /** Audio-context time the sound starts. */
  time: number;
  /** Cycle (bar) position of the event onset. */
  cycle: number;
  duration: number;
  value: Record<string, unknown>;
  locations: Location[];
  /** Track the event came from (set by launch/edit). */
  track?: string;
};
type Listener = (e: HapEvent) => void;
type Segment = { at: number; raw: any; pat: any; period: number; shift: boolean };

const SAMPLE_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
const listeners = new Set<Listener>();
const tracks = new Map<string, Segment[]>();
let ready: Promise<void> | null = null;
let r: any = null;

/** A pattern that plays `before` until `cycle`, then `after`. Exact to the sample, independent of query windows. */
export function switchAt(before: any, after: any, cycle: number): any {
  return new Pattern((state: any) => {
    const { begin, end } = state.span;
    const b = begin.valueOf(), e = end.valueOf();
    const haps: any[] = [];
    if (b < cycle) haps.push(...before.query(state.setSpan(new TimeSpan(begin, e <= cycle ? end : cycle))));
    if (e > cycle) haps.push(...after.query(state.setSpan(new TimeSpan(b >= cycle ? begin : cycle, end))));
    return haps;
  });
}

function output(hap: any, deadline: number, duration: number, cps: number, t: number) {
  const ev: HapEvent = {
    time: t,
    cycle: hap.whole?.begin.valueOf() ?? 0,
    duration,
    // Copy: superdough rewrites the value object while playing it (e.g. merging the bank into the sound name).
    value: typeof hap.value === 'object' ? { ...hap.value } : { value: hap.value },
    locations: hap.context?.locations ?? [],
    track: hap.context?.track,
  };
  listeners.forEach((l) => l(ev));
  return webaudioOutput(hap, deadline, duration, cps, t);
}

/**
 * iOS/iPadOS: web audio is muted by Silent mode unless the page declares itself as playback, and the
 * audio context only starts if it is resumed and makes sound inside the user's tap. Must run synchronously
 * in the tap handler.
 */
export function unlockAudio() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'playback';
  const ac = getAudioContext() as AudioContext;
  ac.resume();
  const buf = ac.createBuffer(1, 1, ac.sampleRate);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  src.start(0);
}

/** A plain Web Audio beep, independent of Strudel, to tell audio problems apart from engine problems. */
export function beep() {
  const ac = getAudioContext() as AudioContext;
  ac.resume();
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = 660;
  g.gain.setValueAtTime(0.3, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.45);
}

export function initEngine(): Promise<void> {
  if (!ready) {
    unlockAudio();
    ready = (async () => {
      const ac = getAudioContext();
      await ac.resume();
      await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/webaudio'), import('@strudel/soundfonts'));
      await initAudio();
      registerSynthSounds();
      registerSoundfonts();
      await Promise.all([
        samples(`${SAMPLE_BASE}/tidal-drum-machines.json`),
        samples(`${SAMPLE_BASE}/piano.json`),
        samples(`${SAMPLE_BASE}/Dirt-Samples.json`),
      ]);
      r = repl({ defaultOutput: output, getTime: () => ac.currentTime, transpiler });
    })();
  }
  return ready;
}

export const onHap = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Turn a Strudel expression (e.g. `s("bd*4").bank("RolandTR909")`) into a pattern. Locations are relative to `code`. */
export async function compile(code: string): Promise<any> {
  const { pattern } = await evaluateCode(code, transpiler, {});
  return pattern;
}

const started = () => !!r?.scheduler.started;
/** Everything before this cycle has already been handed to the audio engine. */
const horizon = () => (started() ? r.scheduler.lastEnd : 0);

function shifted(track: string, raw: any, at: number, period: number, shift: boolean) {
  const offset = ((at % period) + period) % period;
  const pat = shift && offset ? raw.late(offset) : raw;
  // Tag events with their track so played notes can be mapped back to that track's code.
  return pat.withContext((ctx: any) => ({ ...ctx, track }));
}

export { silence };

function rebuild() {
  const h = horizon();
  const parts: any[] = [];
  for (const segs of tracks.values()) {
    // Segments whose successor has already started can never be heard again.
    while (segs.length > 1 && segs[1].at <= h) segs.shift();
    let pat = silence;
    for (const s of segs) pat = s.at <= h ? s.pat : switchAt(pat, s.pat, s.at);
    parts.push(pat);
  }
  const all = parts.length ? stack(...parts) : silence;
  r.setPattern(all, true);
}

export type LaunchOptions = {
  /** Length of the clip (or chain) in bars; it starts at its own bar 1 whatever bar it launches on. */
  period?: number;
  /** Launch only on bars where bar % quantum === offset (default: any bar). */
  quantum?: number;
  offset?: number;
  /** false: do not line the clip up (for comparison tests). */
  shift?: boolean;
  /** Never start before this bar (e.g. after a count-in). */
  notBefore?: number;
};

/** Start `pattern` on `track` at the next bar line. Returns the cycle (bar) it starts on. */
export function launch(track: string, pattern: any, opts: LaunchOptions = {}): number {
  const { period = 1, quantum = 1, offset = 0, shift = true, notBefore = 0 } = opts;
  let at = started() ? Math.max(Math.ceil(horizon()), notBefore) : notBefore;
  while (((at - offset) % quantum + quantum) % quantum !== 0) at++;
  const segs = tracks.get(track) ?? [];
  // A later launch on the same bar replaces an earlier one.
  while (segs.length && segs[segs.length - 1].at >= at) segs.pop();
  segs.push({ at, raw: pattern, pat: shifted(track, pattern, at, period, shift), period, shift });
  tracks.set(track, segs);
  rebuild();
  return at;
}

/** Stop `track` at the next bar line. */
export function stopTrack(track: string): number {
  return launch(track, silence);
}

/** Replace the clip a track is playing (or about to play) without waiting for a bar line: for note edits and mutes. */
export function edit(track: string, pattern: any, period?: number) {
  const segs = tracks.get(track);
  if (!segs?.length) return launch(track, pattern, { period });
  const s = segs[segs.length - 1];
  s.raw = pattern;
  if (period) s.period = period;
  s.pat = shifted(track, pattern, s.at, s.period, s.shift);
  rebuild();
  return s.at;
}

/** Scheduler look-ahead (seconds): sounds play this long after the scheduler reaches them. */
const SCHEDULER_LATENCY = 0.1;

/** The bar position you are hearing now: the scheduler's position minus its look-ahead and the output latency. */
export function heardCycle(): number {
  if (!started()) return 0;
  const ac = getAudioContext() as AudioContext;
  const delay = SCHEDULER_LATENCY + ((ac as any).outputLatency ?? ac.baseLatency ?? 0);
  return r.scheduler.now() - delay * r.scheduler.cps;
}

/**
 * Where `track` is at a bar position (default: what you hear now): bars into its current clip or chain modulo
 * its period, and how many times it has looped. Null if silent.
 */
export function position(track: string, cycle = heardCycle()): { bars: number; period: number; pass: number } | null {
  if (!started()) return null;
  let cur: Segment | undefined;
  for (const s of tracks.get(track) ?? []) if (s.at <= cycle) cur = s;
  if (!cur || cur.raw === silence) return null;
  const rel = cur.shift ? cycle - cur.at : cycle;
  return { bars: ((rel % cur.period) + cur.period) % cur.period, period: cur.period, pass: Math.floor((cycle - cur.at) / cur.period) };
}

export const nextBar = () => (started() ? Math.ceil(horizon()) : 0);
export const cycleNow = () => (started() ? heardCycle() : 0);
export const isStarted = started;
export const audioTime = () => getAudioContext().currentTime;
export const setBpm = (bpm: number) => r?.setCps(bpm / 60 / 4);
export const getCps = () => r?.scheduler.cps ?? 0.5;

export function stop() {
  r?.stop();
  tracks.clear();
}

/** Play a sound immediately, bypassing the pattern scheduler (pads and keys). */
export function trigger(value: Record<string, unknown>, duration = 0.25) {
  const ac = getAudioContext();
  return superdough(value, ac.currentTime + 0.005, duration);
}

export function audioInfo() {
  const ac = getAudioContext() as AudioContext;
  return { sampleRate: ac.sampleRate, baseLatency: ac.baseLatency ?? null, outputLatency: (ac as any).outputLatency ?? null, state: ac.state };
}

/** Sound names registered for a drum machine, e.g. 'RolandTR909' -> ['bd', 'cp', ...]. */
export function bankVoices(bank: string): string[] {
  const prefix = bank.toLowerCase() + '_';
  return Object.keys(soundMap.get()).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)).sort();
}
